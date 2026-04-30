/**
 * Jooble API Collector (POST-based, server-side)
 */
import axios from 'axios';
import type { Collector, CollectorResult } from '../types';

const API_KEY = process.env.JOOBLE_API_KEY;
const QUERIES = ['Pflege', 'IT', 'Ingenieur', 'Marketing', 'Kaufmann', 'Logistik', 'Handwerk', 'Koch', 'Medizin', 'Buchhaltung'];

export class JoobleCollector implements Collector {
  name = 'Jooble';
  source = 'jooble';

  async collect(): Promise<CollectorResult> {
    if (!API_KEY) return { jobs: [], errors: ['Jooble not configured'] };

    const allJobs: CollectorResult['jobs'] = [];
    const errors: string[] = [];
    const seenIds = new Set<string>();

    for (const q of QUERIES) {
      try {
        const { data } = await axios.post(`https://jooble.org/api/${API_KEY}`, {
          keywords: q,
          location: 'Deutschland',
        }, { timeout: 15000 });

        for (const job of data.jobs || []) {
          const jobId = job.id || job.link;
          if (!jobId || seenIds.has(jobId)) continue;
          seenIds.add(jobId);

          allJobs.push({
            external_id: String(job.id),
            source: 'jooble',
            source_url: job.link,
            title: job.title,
            company: job.company || 'Unbekannt',
            location: job.location || 'Deutschland',
            description: job.snippet,
            skills: [],
            published_at: job.updated,
          });
        }

        console.log(`[Jooble] "${q}" → ${data.jobs?.length || 0} jobs`);
        await new Promise(r => setTimeout(r, 1000));
      } catch (err: any) {
        const msg = `"${q}": ${err.response?.status || ''} ${err.message?.substring(0, 120)}`;
        console.error(`[Jooble] ERROR ${msg}`);
        errors.push(msg);
      }
    }

    return { jobs: allJobs, totalAvailable: allJobs.length, errors };
  }
}
