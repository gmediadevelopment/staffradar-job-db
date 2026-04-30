/**
 * Adzuna API Collector – Expanded with pagination + more queries
 * 250 requests/day free plan
 */
import axios from 'axios';
import type { Collector, CollectorResult } from '../types';

const APP_ID = process.env.ADZUNA_APP_ID;
const API_KEY = process.env.ADZUNA_API_KEY;

const QUERIES = [
  'Pflege', 'Krankenpflege', 'Altenpflege', 'Pflegefachkraft',
  'IT', 'Software', 'Informatik', 'Programmierer', 'DevOps',
  'Ingenieur', 'Maschinenbau', 'Elektrotechnik', 'Bauingenieur',
  'Marketing', 'Vertrieb', 'Sales',
  'Kaufmann', 'Bürokaufmann', 'Sachbearbeiter',
  'Logistik', 'Lager', 'Transport', 'Spedition',
  'Handwerk', 'Elektriker', 'Mechaniker', 'Schlosser',
  'Gastronomie', 'Koch', 'Hotel',
  'Medizin', 'Arzt', 'Pharma', 'Apotheker',
  'Finanzen', 'Buchhaltung', 'Controlling',
  'Erzieher', 'Sozialarbeiter', 'Pädagogik',
  'Produktion', 'Monteur', 'Qualitätssicherung',
  'Personal', 'HR', 'Recruiting',
  'Projektmanagement', 'Consulting',
  'Reinigung', 'Hausmeister',
  'Sicherheit', 'Werkschutz',
];

export class AdzunaCollector implements Collector {
  name = 'Adzuna';
  source = 'adzuna';

  async collect(): Promise<CollectorResult> {
    if (!APP_ID || !API_KEY) return { jobs: [], errors: ['Adzuna not configured'] };

    const allJobs: CollectorResult['jobs'] = [];
    const errors: string[] = [];
    const seenIds = new Set<string>();
    let requestCount = 0;

    console.log(`[Adzuna] Starting collection with ${QUERIES.length} queries...`);

    for (const q of QUERIES) {
      if (requestCount >= 200) {
        console.log('[Adzuna] Approaching rate limit, stopping');
        break;
      }

      try {
        // Fetch up to 3 pages per query
        for (let page = 1; page <= 3; page++) {
          const { data } = await axios.get(`https://api.adzuna.com/v1/api/jobs/de/search/${page}`, {
            params: {
              app_id: APP_ID,
              app_key: API_KEY,
              results_per_page: 50,
              what: q,
              sort_by: 'date',
              max_days_old: 30,
            },
            timeout: 15000,
          });
          requestCount++;

          const results = data.results || [];
          for (const job of results) {
            if (seenIds.has(String(job.id))) continue;
            seenIds.add(String(job.id));

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

          if (results.length < 50) break; // No more pages
          await new Promise(r => setTimeout(r, 400));
        }

        console.log(`[Adzuna] "${q}" done (total so far: ${seenIds.size})`);
        await new Promise(r => setTimeout(r, 300));
      } catch (err: any) {
        const msg = `"${q}": ${err.response?.status || ''} ${err.message?.substring(0, 100)}`;
        console.error(`[Adzuna] ERROR ${msg}`);
        errors.push(msg);
      }
    }

    console.log(`[Adzuna] TOTAL: ${allJobs.length} unique jobs (${requestCount} requests used)`);
    return { jobs: allJobs, totalAvailable: allJobs.length, errors };
  }
}
