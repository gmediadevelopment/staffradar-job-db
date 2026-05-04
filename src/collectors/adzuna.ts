/**
 * Adzuna API Collector – Aggressive pagination + retry + rate limiting
 * 
 * Rate limits (free plan):
 * - 25 requests/minute
 * - 250 requests/day
 * - Max 50 results per page
 * 
 * Strategy: 
 * - 2.5s delay between requests (24 req/min, safe margin)
 * - Up to 10 pages per query (500 jobs/query)
 * - Exponential backoff retry on 503/429
 * - 240 request budget (leaves 10 for manual API use)
 */
import axios, { AxiosError } from 'axios';
import type { Collector, CollectorResult } from '../types';

const APP_ID = process.env.ADZUNA_APP_ID;
const API_KEY = process.env.ADZUNA_API_KEY;

const DELAY_MS = 2500;            // 24 req/min (limit is 25)
const MAX_PAGES_PER_QUERY = 10;   // Up to 500 jobs per query
const MAX_REQUESTS = 240;         // Leave 10 of 250 daily for manual use
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 4000;       // 4s, 8s, 16s backoff

const QUERIES = [
  // Pflege/Gesundheit (high volume)
  'Pflege', 'Pflegefachkraft', 'Krankenpflege', 'Altenpflege', 'Intensivpflege',
  'Pflegehelfer', 'Gesundheitspfleger',
  // Medizin
  'Arzt', 'Medizin', 'Pharma', 'Apotheker', 'Therapeut', 'Zahnarzt',
  // IT/Software (high volume)
  'Software Entwickler', 'IT', 'Informatik', 'DevOps', 'Data Engineer',
  'Programmierer', 'SAP', 'Cloud', 'Frontend', 'Backend',
  // Ingenieure
  'Ingenieur', 'Maschinenbau', 'Elektrotechnik', 'Bauingenieur',
  'Verfahrenstechnik', 'Wirtschaftsingenieur',
  // Kaufmännisch
  'Kaufmann', 'Sachbearbeiter', 'Bürokaufmann', 'Verwaltung', 'Sekretär',
  // Marketing/Vertrieb
  'Marketing', 'Vertrieb', 'Sales', 'SEO', 'Online Marketing',
  // Logistik
  'Logistik', 'Lager', 'Transport', 'Spedition', 'Disponent',
  // Handwerk
  'Elektriker', 'Mechaniker', 'Schlosser', 'Handwerk', 'Schweißer',
  'Tischler', 'Maler', 'Installateur',
  // Gastronomie
  'Koch', 'Hotel', 'Gastronomie', 'Restaurant', 'Küche',
  // Finanzen
  'Buchhaltung', 'Controlling', 'Finanzen', 'Steuerberater', 'Wirtschaftsprüfer',
  // Soziales/Bildung
  'Erzieher', 'Sozialarbeiter', 'Pädagogik', 'Lehrer',
  // Produktion
  'Produktion', 'Monteur', 'Qualitätssicherung', 'CNC', 'Fertigung',
  // HR
  'Personal', 'HR', 'Recruiting', 'Personalreferent',
  // Weitere
  'Projektmanagement', 'Consulting', 'Berater',
  'Reinigung', 'Hausmeister', 'Facility',
  'Sicherheit', 'Werkschutz',
  'Lkw Fahrer', 'Berufskraftfahrer',
  'Kundenservice', 'Call Center',
];

async function fetchWithRetry(url: string, params: Record<string, any>, retries = MAX_RETRIES): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data } = await axios.get(url, { params, timeout: 20000 });
      return data;
    } catch (err) {
      const axErr = err as AxiosError;
      const status = axErr.response?.status;

      if (status === 503 && attempt < retries) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(`[Adzuna] 503 on attempt ${attempt + 1}/${retries + 1}, retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      if (status === 429 && attempt < retries) {
        console.warn(`[Adzuna] 429 rate limited, waiting 60s...`);
        await sleep(60000);
        continue;
      }

      throw err;
    }
  }
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export class AdzunaCollector implements Collector {
  name = 'Adzuna';
  source = 'adzuna';

  async collect(): Promise<CollectorResult> {
    if (!APP_ID || !API_KEY) return { jobs: [], errors: ['Adzuna not configured'] };

    const allJobs: CollectorResult['jobs'] = [];
    const errors: string[] = [];
    const seenIds = new Set<string>();
    let requestCount = 0;

    console.log(`[Adzuna] Starting collection with ${QUERIES.length} queries, ${MAX_PAGES_PER_QUERY} pages each...`);

    for (const q of QUERIES) {
      if (requestCount >= MAX_REQUESTS) {
        console.log(`[Adzuna] Daily request budget exhausted (${requestCount}/${MAX_REQUESTS})`);
        break;
      }

      try {
        let queryTotal = 0;

        for (let page = 1; page <= MAX_PAGES_PER_QUERY; page++) {
          if (requestCount >= MAX_REQUESTS) break;

          // Rate limit: wait before each request
          await sleep(DELAY_MS);

          const data = await fetchWithRetry(
            `https://api.adzuna.com/v1/api/jobs/de/search/${page}`,
            {
              app_id: APP_ID,
              app_key: API_KEY,
              results_per_page: 50,
              what: q,
              sort_by: 'date',
              max_days_old: 30,
            }
          );
          requestCount++;

          const results = data.results || [];
          const totalAvailable = data.count || 0;

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
            queryTotal++;
          }

          // Stop pagination if no more results or all fetched
          if (results.length < 50) break;
          if (page * 50 >= totalAvailable) break;
        }

        console.log(`[Adzuna] "${q}" → ${queryTotal} new jobs (total unique: ${seenIds.size}, requests: ${requestCount})`);
      } catch (err: any) {
        const status = err.response?.status || '';
        const msg = `"${q}": ${status} ${err.message?.substring(0, 80)}`;
        console.error(`[Adzuna] ERROR ${msg}`);
        errors.push(msg);

        // If 429/503 persists after retries, wait extra before next query
        if (status === 503 || status === 429) {
          console.log('[Adzuna] Backing off 10s after persistent error...');
          await sleep(10000);
        }
      }
    }

    console.log(`[Adzuna] ✅ TOTAL: ${allJobs.length} unique jobs (${requestCount} requests used of ${MAX_REQUESTS})`);
    return { jobs: allJobs, totalAvailable: allJobs.length, errors };
  }
}
