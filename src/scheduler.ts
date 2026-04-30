/**
 * Scheduler – runs collectors on their configured cron schedules.
 */
import cron from 'node-cron';
import { query } from './db';
import { getCollector } from './collectors';
import { batchUpsertJobs, startCrawlerRun, finishCrawlerRun, expireOldJobs } from './jobRepo';
import type { CrawlerConfig } from './types';

const activeJobs = new Map<string, cron.ScheduledTask>();
const runningCollectors = new Set<string>();

/**
 * Run a single collector: collect → upsert → log
 */
export async function runCollector(source: string): Promise<void> {
  if (runningCollectors.has(source)) {
    console.log(`[Scheduler] ${source} already running, skipping`);
    return;
  }

  const collector = getCollector(source);
  if (!collector) {
    console.error(`[Scheduler] Unknown collector: ${source}`);
    return;
  }

  runningCollectors.add(source);
  const runId = await startCrawlerRun(source);
  console.log(`[Scheduler] ▶ Starting ${collector.name} (run: ${runId.substring(0, 8)})`);

  try {
    const result = await collector.collect();
    const stats = await batchUpsertJobs(result.jobs);

    const status = result.errors.length > 0 && result.jobs.length > 0 ? 'partial' :
      result.errors.length > 0 ? 'failed' : 'success';

    await finishCrawlerRun(runId, status, {
      jobs_found: result.jobs.length,
      jobs_new: stats.new,
      jobs_updated: stats.updated,
    }, result.errors.length > 0 ? result.errors.join('; ') : undefined);

    console.log(`[Scheduler] ✓ ${collector.name}: ${result.jobs.length} found, ${stats.new} new, ${stats.updated} updated`);
  } catch (err: any) {
    await finishCrawlerRun(runId, 'failed', { jobs_found: 0, jobs_new: 0, jobs_updated: 0 }, err.message);
    console.error(`[Scheduler] ✗ ${collector.name} failed:`, err.message);
  } finally {
    runningCollectors.delete(source);
  }
}

/**
 * Initialize all cron schedules from DB config.
 */
export async function initScheduler(): Promise<void> {
  console.log('[Scheduler] Initializing...');

  // Load configs from DB
  const configs = await query<CrawlerConfig>('SELECT * FROM crawler_config WHERE enabled = TRUE');

  for (const config of configs) {
    if (!cron.validate(config.schedule)) {
      console.warn(`[Scheduler] Invalid cron for ${config.source}: "${config.schedule}"`);
      continue;
    }

    // Only schedule collectors we have implementations for
    const collector = getCollector(config.source);
    if (!collector) {
      console.log(`[Scheduler] No implementation for ${config.source}, skipping`);
      continue;
    }

    const task = cron.schedule(config.schedule, () => {
      runCollector(config.source);
    });

    activeJobs.set(config.source, task);
    console.log(`[Scheduler] ⏰ ${config.source} scheduled: ${config.schedule}`);
  }

  // Schedule daily expiration check (midnight)
  cron.schedule('0 0 * * *', async () => {
    console.log('[Scheduler] Running daily expiration check...');
    const expired = await expireOldJobs(30);
    console.log(`[Scheduler] Expired ${expired} old jobs`);
  });

  console.log(`[Scheduler] ${activeJobs.size} collectors scheduled`);
}

/**
 * Stop all scheduled jobs.
 */
export function stopScheduler(): void {
  for (const [source, task] of activeJobs) {
    task.stop();
    console.log(`[Scheduler] Stopped ${source}`);
  }
  activeJobs.clear();
}

/**
 * Run all enabled collectors once (for initial population).
 */
export async function runAllCollectors(): Promise<void> {
  const configs = await query<CrawlerConfig>('SELECT * FROM crawler_config WHERE enabled = TRUE');

  for (const config of configs) {
    const collector = getCollector(config.source);
    if (collector) {
      await runCollector(config.source);
    }
  }
}
