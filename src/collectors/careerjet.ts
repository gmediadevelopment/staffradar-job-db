/**
 * CareerJet API Collector (Basic Auth, GET-based)
 */
import axios from 'axios';
import type { Collector, CollectorResult } from '../types';

const AFFID = process.env.CAREERJET_AFFID;
const QUERIES = ['Pflege', 'IT', 'Ingenieur', 'Marketing', 'Kaufmann', 'Logistik', 'Handwerk', 'Medizin', 'Finanzen', 'Sozial'];

export class CareerJetCollector implements Collector {
  name = 'CareerJet';
  source = 'careerjet';

  async collect(): Promise<CollectorResult> {
    if (!AFFID) return { jobs: [], errors: ['CareerJet not configured'] };

    const allJobs: CollectorResult['jobs'] = [];
    const errors: string[] = [];
    const seenUrls = new Set<string>();

    for (const q of QUERIES) {
      try {
        const { data } = await axios.get('https://search.api.careerjet.net/v4/query', {
          params: {
            keywords: q,
            location: 'Deutschland',
            locale_code: 'de_DE',
            page_size: 50,
            page: 1,
            sort: 'date',
            user_ip: '1.1.1.1',
            user_agent: 'StaffRadar/1.0',
          },
          auth: { username: AFFID, password: '' },
          timeout: 15000,
        });

        for (const job of data.jobs || []) {
          if (!job.url || seenUrls.has(job.url)) continue;
          seenUrls.add(job.url);

          allJobs.push({
            external_id: job.url ? Buffer.from(job.url).toString('base64').substring(0, 32) : undefined,
            source: 'careerjet',
            source_url: job.url,
            title: job.title,
            company: job.company || 'Unbekannt',
            location: job.locations || 'Deutschland',
            description: job.description,
            skills: [],
            published_at: job.date,
          });
        }

        console.log(`[CareerJet] "${q}" → ${data.jobs?.length || 0} jobs`);
        await new Promise(r => setTimeout(r, 500));
      } catch (err: any) {
        errors.push(`"${q}": ${err.message?.substring(0, 80)}`);
      }
    }

    return { jobs: allJobs, totalAvailable: allJobs.length, errors };
  }
}
