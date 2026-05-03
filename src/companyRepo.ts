/**
 * Company Repository – CRUD + ATS Detection for career crawling
 */
import { query, queryOne, execute } from './db';

export interface Company {
  id: string;
  name: string;
  domain?: string;
  careers_url?: string;
  ats_system?: string;
  ats_identifier?: string;
  ats_feed_url?: string;
  industry?: string;
  employees_approx?: number;
  hq_location?: string;
  crawl_status: string;
  crawl_last_at?: string;
  crawl_jobs_count: number;
  crawl_error?: string;
  created_at: string;
  updated_at: string;
}

// ===== CRUD =====

export async function getCompanies(filter?: { ats_system?: string; crawl_status?: string; limit?: number }): Promise<Company[]> {
  const conditions: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (filter?.ats_system) {
    conditions.push(`ats_system = $${idx++}`);
    values.push(filter.ats_system);
  }
  if (filter?.crawl_status) {
    conditions.push(`crawl_status = $${idx++}`);
    values.push(filter.crawl_status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filter?.limit || 500;

  return query<Company>(`SELECT * FROM companies ${where} ORDER BY name LIMIT $${idx}`, [...values, limit]);
}

export async function getCompanyById(id: string): Promise<Company | null> {
  return queryOne<Company>('SELECT * FROM companies WHERE id = $1', [id]);
}

export async function upsertCompany(company: Partial<Company> & { name: string }): Promise<Company> {
  const row = await queryOne<Company>(`
    INSERT INTO companies (name, domain, careers_url, ats_system, ats_identifier, ats_feed_url, industry, employees_approx, hq_location)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (name) DO UPDATE SET
      domain = COALESCE(EXCLUDED.domain, companies.domain),
      careers_url = COALESCE(EXCLUDED.careers_url, companies.careers_url),
      ats_system = COALESCE(EXCLUDED.ats_system, companies.ats_system),
      ats_identifier = COALESCE(EXCLUDED.ats_identifier, companies.ats_identifier),
      ats_feed_url = COALESCE(EXCLUDED.ats_feed_url, companies.ats_feed_url),
      industry = COALESCE(EXCLUDED.industry, companies.industry),
      employees_approx = COALESCE(EXCLUDED.employees_approx, companies.employees_approx),
      hq_location = COALESCE(EXCLUDED.hq_location, companies.hq_location),
      updated_at = NOW()
    RETURNING *
  `, [
    company.name, company.domain, company.careers_url,
    company.ats_system, company.ats_identifier, company.ats_feed_url,
    company.industry, company.employees_approx, company.hq_location,
  ]);
  return row!;
}

export async function updateCompanyCrawlState(
  id: string,
  state: { crawl_status?: string; crawl_jobs_count?: number; crawl_error?: string | null }
): Promise<void> {
  await execute(`
    UPDATE companies SET
      crawl_status = COALESCE($2, crawl_status),
      crawl_last_at = NOW(),
      crawl_jobs_count = COALESCE($3, crawl_jobs_count),
      crawl_error = $4,
      updated_at = NOW()
    WHERE id = $1
  `, [id, state.crawl_status, state.crawl_jobs_count, state.crawl_error ?? null]);
}

export async function updateCompanyATS(
  id: string,
  ats: { ats_system: string; ats_identifier?: string; ats_feed_url?: string }
): Promise<void> {
  await execute(`
    UPDATE companies SET
      ats_system = $2, ats_identifier = $3, ats_feed_url = $4,
      crawl_status = 'active', updated_at = NOW()
    WHERE id = $1
  `, [id, ats.ats_system, ats.ats_identifier, ats.ats_feed_url]);
}

export async function getCompanyStats(): Promise<{
  total: number;
  by_ats: { ats_system: string; count: number }[];
  by_status: { crawl_status: string; count: number }[];
  total_jobs: number;
}> {
  const [totalRow, jobsRow] = await Promise.all([
    queryOne<{ count: string }>('SELECT COUNT(*) as count FROM companies'),
    queryOne<{ sum: string }>('SELECT COALESCE(SUM(crawl_jobs_count), 0) as sum FROM companies'),
  ]);

  const byAts = await query<{ ats_system: string; count: string }>(
    `SELECT COALESCE(ats_system, 'unknown') as ats_system, COUNT(*) as count FROM companies GROUP BY ats_system ORDER BY count DESC`
  );
  const byStatus = await query<{ crawl_status: string; count: string }>(
    `SELECT crawl_status, COUNT(*) as count FROM companies GROUP BY crawl_status ORDER BY count DESC`
  );

  return {
    total: parseInt(totalRow?.count || '0'),
    by_ats: byAts.map(r => ({ ats_system: r.ats_system, count: parseInt(r.count) })),
    by_status: byStatus.map(r => ({ crawl_status: r.crawl_status, count: parseInt(r.count) })),
    total_jobs: parseInt(jobsRow?.sum || '0'),
  };
}

// ===== ATS Detection =====

interface ATSDetectionResult {
  ats_system: string;
  ats_identifier?: string;
  ats_feed_url?: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Detect which ATS a company uses based on their careers URL.
 * Step 1: Check URL patterns (fast, high confidence)
 * Step 2: Fetch HTML and check DOM signatures (slower, medium confidence)
 */
export async function detectATS(careersUrl: string): Promise<ATSDetectionResult | null> {
  if (!careersUrl) return null;
  const url = careersUrl.toLowerCase().trim();

  // === Pattern-based detection (fast) ===

  // Personio: *.jobs.personio.de or *.jobs.personio.com
  const personioMatch = url.match(/https?:\/\/([^.]+)\.jobs\.personio\.(de|com)/);
  if (personioMatch) {
    const id = personioMatch[1];
    return {
      ats_system: 'personio',
      ats_identifier: id,
      ats_feed_url: `https://${id}.jobs.personio.de/xml?language=de`,
      confidence: 'high',
    };
  }

  // Greenhouse: boards.greenhouse.io/{token}
  const ghMatch = url.match(/boards\.greenhouse\.io\/([a-zA-Z0-9_-]+)/);
  if (ghMatch) {
    return {
      ats_system: 'greenhouse',
      ats_identifier: ghMatch[1],
      ats_feed_url: `https://boards-api.greenhouse.io/v1/boards/${ghMatch[1]}/jobs?content=true`,
      confidence: 'high',
    };
  }

  // Lever: jobs.lever.co/{company}
  const leverMatch = url.match(/jobs\.lever\.co\/([a-zA-Z0-9_-]+)/);
  if (leverMatch) {
    return {
      ats_system: 'lever',
      ats_identifier: leverMatch[1],
      ats_feed_url: `https://api.lever.co/v0/postings/${leverMatch[1]}?mode=json`,
      confidence: 'high',
    };
  }

  // SmartRecruiters: careers.smartrecruiters.com/{id}
  const srMatch = url.match(/careers\.smartrecruiters\.com\/([a-zA-Z0-9_-]+)/);
  if (srMatch) {
    return {
      ats_system: 'smartrecruiters',
      ats_identifier: srMatch[1],
      ats_feed_url: `https://api.smartrecruiters.com/v1/companies/${srMatch[1]}/postings`,
      confidence: 'high',
    };
  }

  // Recruitee: *.recruitee.com
  const recruiteeMatch = url.match(/https?:\/\/([^.]+)\.recruitee\.com/);
  if (recruiteeMatch) {
    const id = recruiteeMatch[1];
    return {
      ats_system: 'recruitee',
      ats_identifier: id,
      ats_feed_url: `https://${id}.recruitee.com/api/offers`,
      confidence: 'high',
    };
  }

  // Workday: *.myworkdayjobs.com or *.wd*.myworkday.com
  if (url.includes('myworkdayjobs.com') || url.includes('myworkday.com')) {
    return { ats_system: 'workday', confidence: 'medium' };
  }

  // SAP SuccessFactors
  if (url.includes('successfactors.com') || url.includes('successfactors.eu')) {
    return { ats_system: 'sap_sf', confidence: 'medium' };
  }

  // Softgarden
  if (url.includes('softgarden.io') || url.includes('softgarden.de')) {
    return { ats_system: 'softgarden', confidence: 'medium' };
  }

  // === HTML-based detection (fallback) ===
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(careersUrl, {
      headers: { 'User-Agent': 'StaffRadar-ATS-Detector/1.0' },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!response.ok) return null;
    const html = await response.text();
    const finalUrl = response.url.toLowerCase();

    // Check redirected URL
    const redirectPersonio = finalUrl.match(/([^.]+)\.jobs\.personio\.(de|com)/);
    if (redirectPersonio) {
      const id = redirectPersonio[1];
      return {
        ats_system: 'personio',
        ats_identifier: id,
        ats_feed_url: `https://${id}.jobs.personio.de/xml?language=de`,
        confidence: 'high',
      };
    }

    // HTML signatures
    if (html.includes('grnhse_app') || html.includes('greenhouse.io')) {
      const tokenMatch = html.match(/boards\.greenhouse\.io\/([a-zA-Z0-9_-]+)/);
      return {
        ats_system: 'greenhouse',
        ats_identifier: tokenMatch?.[1],
        ats_feed_url: tokenMatch ? `https://boards-api.greenhouse.io/v1/boards/${tokenMatch[1]}/jobs?content=true` : undefined,
        confidence: tokenMatch ? 'high' : 'medium',
      };
    }

    if (html.includes('lever-jobs-container') || html.includes('jobs.lever.co')) {
      const lMatch = html.match(/jobs\.lever\.co\/([a-zA-Z0-9_-]+)/);
      return {
        ats_system: 'lever',
        ats_identifier: lMatch?.[1],
        ats_feed_url: lMatch ? `https://api.lever.co/v0/postings/${lMatch[1]}?mode=json` : undefined,
        confidence: lMatch ? 'high' : 'medium',
      };
    }

    if (html.includes('smartrecruiters') || finalUrl.includes('smartrecruiters.com')) {
      const sMatch = html.match(/careers\.smartrecruiters\.com\/([a-zA-Z0-9_-]+)/);
      return {
        ats_system: 'smartrecruiters',
        ats_identifier: sMatch?.[1],
        ats_feed_url: sMatch ? `https://api.smartrecruiters.com/v1/companies/${sMatch[1]}/postings` : undefined,
        confidence: sMatch ? 'high' : 'medium',
      };
    }

    if (html.includes('recruitee.com') || finalUrl.includes('recruitee.com')) {
      const rMatch = finalUrl.match(/([^.]+)\.recruitee\.com/);
      return {
        ats_system: 'recruitee',
        ats_identifier: rMatch?.[1],
        ats_feed_url: rMatch ? `https://${rMatch[1]}.recruitee.com/api/offers` : undefined,
        confidence: rMatch ? 'high' : 'medium',
      };
    }

    if (html.includes('personio') || finalUrl.includes('personio')) {
      const pMatch = finalUrl.match(/([^.]+)\.jobs\.personio\.(de|com)/);
      return {
        ats_system: 'personio',
        ats_identifier: pMatch?.[1],
        ats_feed_url: pMatch ? `https://${pMatch[1]}.jobs.personio.de/xml?language=de` : undefined,
        confidence: pMatch ? 'high' : 'low',
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Batch detect ATS for all companies without ats_system set.
 */
export async function batchDetectATS(limit: number = 50): Promise<number> {
  const companies = await query<Company>(
    `SELECT * FROM companies WHERE ats_system IS NULL AND careers_url IS NOT NULL LIMIT $1`,
    [limit]
  );

  let detected = 0;
  for (const company of companies) {
    try {
      const result = await detectATS(company.careers_url!);
      if (result) {
        await updateCompanyATS(company.id, result);
        console.log(`[ATS] ✓ ${company.name} → ${result.ats_system} (${result.confidence})`);
        detected++;
      } else {
        await execute(`UPDATE companies SET ats_system = 'unknown', updated_at = NOW() WHERE id = $1`, [company.id]);
        console.log(`[ATS] ? ${company.name} → unknown`);
      }
      // Rate limit: 1 req/sec for HTML checks
      await new Promise(r => setTimeout(r, 1000));
    } catch (err: any) {
      console.warn(`[ATS] ✗ ${company.name}: ${err.message?.substring(0, 80)}`);
    }
  }

  return detected;
}
