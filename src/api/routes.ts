/**
 * REST API Routes for external consumption (StaffRadar App)
 * and internal admin dashboard.
 */
import { Router, Request, Response } from 'express';
import { searchJobs, getJobById, getStats, getRecentCrawlerRuns } from '../jobRepo';
import { query, execute } from '../db';
import { getCollector } from '../collectors';
import { runCollector } from '../scheduler';
import type { CrawlerConfig } from '../types';

const router = Router();

// ===== Auth Middleware =====
function apiAuth(req: Request, res: Response, next: Function) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (apiKey !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function adminAuth(req: Request, res: Response, next: Function) {
  // Basic auth for admin dashboard
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).json({ error: 'Admin login required' });
  }
  const [user, pass] = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
  if (user !== process.env.ADMIN_USER || pass !== process.env.ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Invalid credentials' });
  }
  next();
}

// ===== Public API (for StaffRadar) =====

router.get('/api/v1/jobs/search', apiAuth, async (req: Request, res: Response) => {
  try {
    const params = {
      q: String(req.query.q || ''),
      location: String(req.query.location || ''),
      skills: req.query.skills ? String(req.query.skills).split(',') : undefined,
      source: String(req.query.source || ''),
      published_after: String(req.query.published_after || ''),
      limit: parseInt(String(req.query.limit || '50')) || 50,
      offset: parseInt(String(req.query.offset || '0')) || 0,
    };
    const result = await searchJobs(params);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/v1/jobs/:id', apiAuth, async (req: Request, res: Response) => {
  try {
    const job = await getJobById(String(req.params.id));
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/v1/jobs/stats', apiAuth, async (_req: Request, res: Response) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Admin API =====

router.get('/admin/api/stats', adminAuth, async (_req: Request, res: Response) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/api/crawler-runs', adminAuth, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string || '50') || 50;
    const source = String(req.query.source || '');
    let runs;
    if (source) {
      runs = await query('SELECT * FROM crawler_runs WHERE source = $1 ORDER BY started_at DESC LIMIT $2', [source, limit]);
    } else {
      runs = await getRecentCrawlerRuns(limit);
    }
    res.json(runs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/api/crawler-config', adminAuth, async (_req: Request, res: Response) => {
  try {
    const configs = await query<CrawlerConfig>('SELECT * FROM crawler_config ORDER BY source');
    res.json(configs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/api/crawler-config/:source', adminAuth, async (req: Request, res: Response) => {
  try {
    const { enabled, schedule } = req.body;
    await execute(
      'UPDATE crawler_config SET enabled = COALESCE($2, enabled), schedule = COALESCE($3, schedule) WHERE source = $1',
      [String(req.params.source), enabled, schedule]
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/api/crawler-run/:source', adminAuth, async (req: Request, res: Response) => {
  try {
    const source = String(req.params.source);
    const collector = getCollector(source);
    if (!collector) return res.status(404).json({ error: `Unknown source: ${source}` });

    // Run async, return immediately
    res.json({ ok: true, message: `Collector "${source}" gestartet` });
    runCollector(source).catch(err => console.error(`[API] Manual run failed for ${source}:`, err));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/api/jobs', adminAuth, async (req: Request, res: Response) => {
  try {
    const params = {
      q: String(req.query.q || ''),
      location: String(req.query.location || ''),
      source: String(req.query.source || ''),
      limit: parseInt(String(req.query.limit || '50')) || 50,
      offset: parseInt(String(req.query.offset || '0')) || 0,
    };
    const result = await searchJobs(params);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
