/**
 * Arbeitnow API Collector (free, no key needed)
 * Endpoint: https://www.arbeitnow.com/api/job-board-api
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
      // Arbeitnow returns paginated results
      let page = 1;
      let hasMore = true;

      while (hasMore && page <= 10) {
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
            source_url: job.url ? `https://www.arbeitnow.com/view/${job.slug}` : undefined,
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

        console.log(`[Arbeitnow] Page ${page} → ${jobs.length} jobs`);
        page++;
        hasMore = !!data.links?.next;
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (err: any) {
      errors.push(err.message?.substring(0, 100));
    }

    return { jobs: allJobs, totalAvailable: allJobs.length, errors };
  }
}
