/**
 * Database Migration Script
 * Creates all tables for the job database system.
 * Run: npm run migrate
 */
import { pool, query } from './db';

async function migrate() {
  console.log('[Migrate] Starting database migration...');

  // ===== Jobs Table =====
  await query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      external_id TEXT,
      source TEXT NOT NULL,
      source_url TEXT,

      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT,
      description TEXT,
      requirements TEXT[] DEFAULT '{}',

      employment_type TEXT,
      contract_type TEXT,
      salary_min INTEGER,
      salary_max INTEGER,
      remote_type TEXT,

      skills JSONB DEFAULT '[]',
      category TEXT,
      industry TEXT,

      dedup_hash TEXT UNIQUE,

      published_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      first_seen_at TIMESTAMPTZ DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ DEFAULT NOW(),
      last_updated_at TIMESTAMPTZ DEFAULT NOW(),

      status TEXT DEFAULT 'active',
      is_verified BOOLEAN DEFAULT FALSE
    );
  `);
  console.log('[Migrate] ✓ jobs table');

  // ===== Indexes =====
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source)',
    'CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)',
    'CREATE INDEX IF NOT EXISTS idx_jobs_dedup_hash ON jobs(dedup_hash)',
    'CREATE INDEX IF NOT EXISTS idx_jobs_published ON jobs(published_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_jobs_first_seen ON jobs(first_seen_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_jobs_last_seen ON jobs(last_seen_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company)',
    `CREATE INDEX IF NOT EXISTS idx_jobs_title_search ON jobs USING gin(to_tsvector('german', title))`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_location_search ON jobs USING gin(to_tsvector('german', COALESCE(location, '')))`,
    'CREATE INDEX IF NOT EXISTS idx_jobs_skills ON jobs USING gin(skills)',
  ];

  for (const idx of indexes) {
    try {
      await query(idx);
    } catch (err: any) {
      // Skip if index creation fails (e.g., extension not available)
      console.warn(`[Migrate] Index warning: ${err.message?.substring(0, 80)}`);
    }
  }
  console.log('[Migrate] ✓ indexes');

  // ===== Crawler Runs Table =====
  await query(`
    CREATE TABLE IF NOT EXISTS crawler_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source TEXT NOT NULL,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      status TEXT DEFAULT 'running',
      jobs_found INTEGER DEFAULT 0,
      jobs_new INTEGER DEFAULT 0,
      jobs_updated INTEGER DEFAULT 0,
      jobs_expired INTEGER DEFAULT 0,
      error_message TEXT,
      metadata JSONB DEFAULT '{}'
    );
  `);
  console.log('[Migrate] ✓ crawler_runs table');

  await query(`CREATE INDEX IF NOT EXISTS idx_crawler_runs_source ON crawler_runs(source)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_crawler_runs_started ON crawler_runs(started_at DESC)`);

  // ===== Crawler Config Table =====
  await query(`
    CREATE TABLE IF NOT EXISTS crawler_config (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source TEXT UNIQUE NOT NULL,
      display_name TEXT,
      type TEXT DEFAULT 'api',
      enabled BOOLEAN DEFAULT TRUE,
      schedule TEXT DEFAULT '0 */6 * * *',
      config JSONB DEFAULT '{}',
      last_run_at TIMESTAMPTZ,
      next_run_at TIMESTAMPTZ
    );
  `);
  console.log('[Migrate] ✓ crawler_config table');

  // ===== Seed Default Configs =====
  const defaultConfigs = [
    { source: 'ba', display_name: 'Bundesagentur für Arbeit', type: 'api', schedule: '0 */6 * * *' },
    { source: 'adzuna', display_name: 'Adzuna', type: 'api', schedule: '0 */12 * * *' },
    { source: 'jooble', display_name: 'Jooble', type: 'api', schedule: '0 */8 * * *' },
    { source: 'careerjet', display_name: 'CareerJet', type: 'api', schedule: '0 */8 * * *' },
    { source: 'arbeitnow', display_name: 'Arbeitnow', type: 'api', schedule: '0 */4 * * *' },
    { source: 'indeed', display_name: 'Indeed Deutschland', type: 'crawler', schedule: '0 */6 * * *', enabled: false },
    { source: 'stepstone', display_name: 'StepStone', type: 'crawler', schedule: '0 */6 * * *', enabled: false },
    { source: 'google_jobs', display_name: 'Google Jobs (SerpAPI)', type: 'api', schedule: '0 */4 * * *', enabled: false },
    { source: 'linkedin', display_name: 'LinkedIn Jobs', type: 'crawler', schedule: '0 */12 * * *', enabled: false },
    { source: 'meinestadt', display_name: 'Meinestadt.de', type: 'crawler', schedule: '0 */8 * * *', enabled: false },
    { source: 'stellenanzeigen', display_name: 'Stellenanzeigen.de', type: 'crawler', schedule: '0 */8 * * *', enabled: false },
  ];

  for (const cfg of defaultConfigs) {
    await query(`
      INSERT INTO crawler_config (source, display_name, type, enabled, schedule)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (source) DO NOTHING
    `, [cfg.source, cfg.display_name, cfg.type, cfg.enabled ?? true, cfg.schedule]);
  }
  console.log('[Migrate] ✓ default crawler configs seeded');

  // ===== Companies Table (Career Crawler) =====
  await query(`
    CREATE TABLE IF NOT EXISTS companies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      domain TEXT,
      careers_url TEXT,
      ats_system TEXT,
      ats_identifier TEXT,
      ats_feed_url TEXT,
      industry TEXT,
      employees_approx INTEGER,
      hq_location TEXT,
      crawl_status TEXT DEFAULT 'pending',
      crawl_last_at TIMESTAMPTZ,
      crawl_jobs_count INTEGER DEFAULT 0,
      crawl_error TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  console.log('[Migrate] ✓ companies table');

  const companyIndexes = [
    'CREATE INDEX IF NOT EXISTS idx_companies_ats ON companies(ats_system)',
    'CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(crawl_status)',
    'CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_name_unique ON companies(name)',
  ];
  for (const idx of companyIndexes) {
    try { await query(idx); } catch (err: any) {
      console.warn(`[Migrate] Company index warning: ${err.message?.substring(0, 80)}`);
    }
  }
  console.log('[Migrate] ✓ company indexes');

  // Seed career_site crawler configs
  const careerConfigs = [
    { source: 'career_personio', display_name: 'Karriereseiten (Personio)', type: 'crawler', schedule: '0 3 * * *' },
    { source: 'career_greenhouse', display_name: 'Karriereseiten (Greenhouse)', type: 'crawler', schedule: '0 3 * * *' },
    { source: 'career_lever', display_name: 'Karriereseiten (Lever)', type: 'crawler', schedule: '0 4 * * *' },
    { source: 'career_smartrecruiters', display_name: 'Karriereseiten (SmartRecruiters)', type: 'crawler', schedule: '0 4 * * *' },
    { source: 'career_recruitee', display_name: 'Karriereseiten (Recruitee)', type: 'crawler', schedule: '0 5 * * *' },
  ];
  for (const cfg of careerConfigs) {
    await query(`
      INSERT INTO crawler_config (source, display_name, type, enabled, schedule)
      VALUES ($1, $2, $3, TRUE, $4)
      ON CONFLICT (source) DO NOTHING
    `, [cfg.source, cfg.display_name, cfg.type, cfg.schedule]);
  }
  console.log('[Migrate] ✓ career crawler configs seeded');

  console.log('[Migrate] ✅ Migration complete!');
  await pool.end();
}

migrate().catch((err) => {
  console.error('[Migrate] ❌ Migration failed:', err);
  process.exit(1);
});
