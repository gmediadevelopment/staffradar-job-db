/**
 * Job Repository – CRUD operations for the jobs table
 * Handles upsert with dedup, search, and expiration logic.
 */
import { query, queryOne, execute } from './db';
import { generateDedupHash } from './dedup';
import type { Job, SearchParams, SearchResult, CrawlerRun } from './types';

// ===== Job CRUD =====

/**
 * Upsert a job – insert new or update existing based on dedup_hash.
 * Returns 'new' | 'updated' | 'duplicate'
 */
export async function upsertJob(job: Omit<Job, 'id' | 'dedup_hash' | 'first_seen_at' | 'last_seen_at' | 'last_updated_at' | 'status' | 'is_verified'>): Promise<'new' | 'updated'> {
  const dedupHash = generateDedupHash(job.title, job.company, job.location);

  const result = await query(`
    INSERT INTO jobs (
      external_id, source, source_url,
      title, company, location, description, requirements,
      employment_type, contract_type, salary_min, salary_max, remote_type,
      skills, category, industry,
      dedup_hash, published_at, expires_at
    ) VALUES (
      $1, $2, $3,
      $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13,
      $14, $15, $16,
      $17, $18, $19
    )
    ON CONFLICT (dedup_hash) DO UPDATE SET
      last_seen_at = NOW(),
      last_updated_at = NOW(),
      status = 'active',
      -- Enrich with data from new source if missing
      description = COALESCE(NULLIF(jobs.description, ''), EXCLUDED.description),
      salary_min = COALESCE(jobs.salary_min, EXCLUDED.salary_min),
      salary_max = COALESCE(jobs.salary_max, EXCLUDED.salary_max),
      source_url = COALESCE(NULLIF(jobs.source_url, ''), EXCLUDED.source_url)
    RETURNING (xmax = 0) AS is_new
  `, [
    job.external_id, job.source, job.source_url,
    job.title, job.company, job.location, job.description, job.requirements || [],
    job.employment_type, job.contract_type, job.salary_min, job.salary_max, job.remote_type,
    JSON.stringify(job.skills || []), job.category, job.industry,
    dedupHash, job.published_at, job.expires_at,
  ]);

  return result[0]?.is_new ? 'new' : 'updated';
}

/**
 * Batch upsert jobs from a collector run.
 * Returns counts of new and updated jobs.
 */
export async function batchUpsertJobs(
  jobs: Omit<Job, 'id' | 'dedup_hash' | 'first_seen_at' | 'last_seen_at' | 'last_updated_at' | 'status' | 'is_verified'>[]
): Promise<{ new: number; updated: number }> {
  let newCount = 0;
  let updatedCount = 0;

  for (const job of jobs) {
    try {
      const result = await upsertJob(job);
      if (result === 'new') newCount++;
      else updatedCount++;
    } catch (err: any) {
      // Log but continue on individual job errors
      console.warn(`[JobRepo] Upsert error for "${job.title}": ${err.message?.substring(0, 100)}`);
    }
  }

  return { new: newCount, updated: updatedCount };
}

/**
 * Full-text search for jobs.
 */
export async function searchJobs(params: SearchParams): Promise<SearchResult> {
  const conditions: string[] = ["status = 'active'"];
  const values: any[] = [];
  let paramIdx = 1;

  if (params.q) {
    // Support pipe-separated phrases: "SEO|Google Ads|SEA"
    // Each phrase is a complete search term (multi-word skills stay together)
    const phrases = params.q.includes('|')
      ? params.q.split('|').map(p => p.trim()).filter(p => p.length >= 2)
      : [params.q.trim()];

    console.log(`[Search] Query: "${params.q}" → ${phrases.length} phrases:`, phrases);

    if (phrases.length > 1) {
      // Multi-phrase OR search: match ANY phrase in title or description
      const phraseConditions = phrases.map((_, i) => {
        const idx = paramIdx + i;
        return `title ILIKE '%' || $${idx} || '%' OR COALESCE(description, '') ILIKE '%' || $${idx} || '%'`;
      });
      conditions.push(`(${phraseConditions.join(' OR ')})`);
      values.push(...phrases);
      paramIdx += phrases.length;
    } else {
      // Single term: use full-text search + ILIKE fallback
      conditions.push(`(
        to_tsvector('german', title) @@ plainto_tsquery('german', $${paramIdx})
        OR to_tsvector('german', COALESCE(description, '')) @@ plainto_tsquery('german', $${paramIdx})
        OR title ILIKE '%' || $${paramIdx + 1} || '%'
        OR company ILIKE '%' || $${paramIdx + 1} || '%'
      )`);
      values.push(params.q, params.q);
      paramIdx += 2;
    }
  }

  if (params.location) {
    conditions.push(`(
      to_tsvector('german', COALESCE(location, '')) @@ plainto_tsquery('german', $${paramIdx})
      OR location ILIKE '%' || $${paramIdx + 1} || '%'
    )`);
    values.push(params.location, params.location);
    paramIdx += 2;
  }

  if (params.skills && params.skills.length > 0) {
    // Check if any of the skills appear in the skills JSONB array
    const skillConditions = params.skills.map((skill) => {
      values.push(`%${skill}%`);
      return `skills::text ILIKE $${paramIdx++}`;
    });
    conditions.push(`(${skillConditions.join(' OR ')})`);
  }

  if (params.source) {
    conditions.push(`source = $${paramIdx}`);
    values.push(params.source);
    paramIdx++;
  }

  if (params.published_after) {
    conditions.push(`published_at >= $${paramIdx}`);
    values.push(params.published_after);
    paramIdx++;
  }

  const limit = Math.min(params.limit || 50, 5000);
  const offset = params.offset || 0;

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countResult = await queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM jobs ${where}`, values);
  const total = parseInt(countResult?.count || '0');

  // Get jobs
  const jobs = await query<Job>(
    `SELECT * FROM jobs ${where} ORDER BY published_at DESC NULLS LAST, first_seen_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...values, limit, offset]
  );

  return { jobs, total, limit, offset };
}

/**
 * Get a single job by ID.
 */
export async function getJobById(id: string): Promise<Job | null> {
  return queryOne<Job>('SELECT * FROM jobs WHERE id = $1', [id]);
}

/**
 * Mark old jobs as expired (not seen in X days).
 */
export async function expireOldJobs(daysOld: number = 30): Promise<number> {
  return execute(
    `UPDATE jobs SET status = 'expired' WHERE status = 'active' AND last_seen_at < NOW() - INTERVAL '1 day' * $1`,
    [daysOld]
  );
}

// ===== Crawler Run Logging =====

export async function startCrawlerRun(source: string): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO crawler_runs (source) VALUES ($1) RETURNING id`,
    [source]
  );
  // Update config last_run_at
  await execute(
    `UPDATE crawler_config SET last_run_at = NOW() WHERE source = $1`,
    [source]
  );
  return row!.id;
}

export async function finishCrawlerRun(
  runId: string,
  status: 'success' | 'failed' | 'partial',
  stats: { jobs_found: number; jobs_new: number; jobs_updated: number; jobs_expired?: number },
  errorMessage?: string
): Promise<void> {
  await execute(
    `UPDATE crawler_runs SET
      finished_at = NOW(),
      status = $2,
      jobs_found = $3,
      jobs_new = $4,
      jobs_updated = $5,
      jobs_expired = $6,
      error_message = $7
    WHERE id = $1`,
    [runId, status, stats.jobs_found, stats.jobs_new, stats.jobs_updated, stats.jobs_expired || 0, errorMessage]
  );
}

export async function getRecentCrawlerRuns(limit: number = 50): Promise<CrawlerRun[]> {
  return query<CrawlerRun>(
    `SELECT * FROM crawler_runs ORDER BY started_at DESC LIMIT $1`,
    [limit]
  );
}

// ===== Stats =====

export async function getStats() {
  const [totalRow, activeRow, todayRow] = await Promise.all([
    queryOne<{ count: string }>('SELECT COUNT(*) as count FROM jobs'),
    queryOne<{ count: string }>("SELECT COUNT(*) as count FROM jobs WHERE status = 'active'"),
    queryOne<{ count: string }>("SELECT COUNT(*) as count FROM jobs WHERE first_seen_at >= CURRENT_DATE"),
  ]);

  const sources = await query<{ source: string; count: string }>(
    "SELECT source, COUNT(*) as count FROM jobs WHERE status = 'active' GROUP BY source ORDER BY count DESC"
  );

  const jobsByDay = await query<{ date: string; count: string }>(
    `SELECT DATE(first_seen_at) as date, COUNT(*) as count
     FROM jobs WHERE first_seen_at >= CURRENT_DATE - INTERVAL '30 days'
     GROUP BY DATE(first_seen_at) ORDER BY date`
  );

  return {
    total_jobs: parseInt(totalRow?.count || '0'),
    active_jobs: parseInt(activeRow?.count || '0'),
    new_today: parseInt(todayRow?.count || '0'),
    sources: sources.map(s => ({ source: s.source, count: parseInt(s.count) })),
    jobs_by_day: jobsByDay.map(d => ({ date: d.date, count: parseInt(d.count) })),
  };
}
