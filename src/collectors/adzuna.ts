/**
 * Adzuna API Collector
 * 250 requests/day free plan
 */
import axios from 'axios';
import type { Collector, CollectorResult } from '../types';

const APP_ID = process.env.ADZUNA_APP_ID;
const API_KEY = process.env.ADZUNA_API_KEY;

const QUERIES = ['Pflege', 'IT', 'Ingenieur', 'Marketing', 'Kaufmann', 'Logistik', 'Handwerk', 'Gastronomie', 'Medizin', 'Finanzen'];

export class AdzunaCollector implements Collector {
  name = 'Adzuna';
  source = 'adzuna';

  async collect(): Promise<CollectorResult> {
    if (!APP_ID || !API_KEY) return { jobs: [], errors: ['Adzuna not configured'] };

    const allJobs: CollectorResult['jobs'] = [];
    const errors: string[] = [];
    const seenIds = new Set<string>();

    for (const q of QUERIES) {
      try {
        const { data } = await axios.get(`https://api.adzuna.com/v1/api/jobs/de/search/1`, {
          params: { app_id: APP_ID, app_key: API_KEY, results_per_page: 50, what: q, sort_by: 'date', max_days_old: 7 },
          timeout: 15000,
        });

        for (const job of data.results || []) {
          if (seenIds.has(job.id)) continue;
          seenIds.add(job.id);

          allJobs.push({
            external_id: String(job.id),
            source: 'adzuna',
            source_url: job.redirect_url,
            title: job.title,
            company: job.company?.display_name || 'Unbekannt',
            location: job.location?.display_name || 'Deutschland',
            description: job.description,
            employment_type: job.contract_time === 'full_time' ? 'vollzeit' : job.contract_time === 'part_time' ? 'teilzeit' : undefined,
            contract_type: job.contract_type === 'permanent' ? 'unbefristet' : job.contract_type === 'contract' ? 'befristet' : undefined,
            salary_min: job.salary_min ? Math.round(job.salary_min) : undefined,
            salary_max: job.salary_max ? Math.round(job.salary_max) : undefined,
            skills: [],
            published_at: job.created,
          });
        }

        console.log(`[Adzuna] "${q}" → ${data.results?.length || 0} jobs`);
        await new Promise(r => setTimeout(r, 500));
      } catch (err: any) {
        errors.push(`"${q}": ${err.message?.substring(0, 80)}`);
      }
    }

    return { jobs: allJobs, totalAvailable: allJobs.length, errors };
  }
}
