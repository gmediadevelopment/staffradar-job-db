/**
 * Arbeitnow API Collector – Expanded (fetch ALL pages)
 * Free, no key needed
 */
import axios from 'axios';
import type { Collector, CollectorResult } from '../types';

export class ArbeitnowCollector implements Collector {
  name = 'Arbeitnow';
  source = 'arbeitnow';

  async collect(): Promise<CollectorResult> {
    const allJobs: CollectorResult['jobs'] = [];
    const errors: string[] = [];
    const seenSlugs = new Set<string>();

    try {
      let page = 1;
      let hasMore = true;
      const MAX_PAGES = 50; // Get up to 5000 jobs

      while (hasMore && page <= MAX_PAGES) {
        const { data } = await axios.get('https://www.arbeitnow.com/api/job-board-api', {
          params: { page },
          timeout: 15000,
        });

        const jobs = data.data || [];
        if (jobs.length === 0) {
          hasMore = false;
          break;
        }

        for (const job of jobs) {
          const slug = job.slug || job.url;
          if (!slug || seenSlugs.has(slug)) continue;
          seenSlugs.add(slug);

          allJobs.push({
            external_id: slug,
            source: 'arbeitnow',
            source_url: job.slug ? `https://www.arbeitnow.com/view/${job.slug}` : undefined,
            title: job.title,
            company: job.company_name || 'Unbekannt',
            location: job.location || 'Remote',
            description: job.description,
            employment_type: job.job_types?.includes('Full Time') ? 'vollzeit' :
              job.job_types?.includes('Part Time') ? 'teilzeit' : undefined,
            remote_type: job.remote ? 'remote' : 'vor_ort',
            skills: (job.tags || []).slice(0, 8).map((t: string) => ({ name: t })),
            published_at: job.created_at ? new Date(job.created_at * 1000).toISOString() : undefined,
          });
        }

        console.log(`[Arbeitnow] Page ${page} → ${jobs.length} jobs (total: ${seenSlugs.size})`);
        page++;
        hasMore = !!data.links?.next;
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (err: any) {
      console.error(`[Arbeitnow] ERROR: ${err.message}`);
      errors.push(err.message?.substring(0, 100));
    }

    console.log(`[Arbeitnow] TOTAL: ${allJobs.length} unique jobs`);
    return { jobs: allJobs, totalAvailable: allJobs.length, errors };
  }
}
