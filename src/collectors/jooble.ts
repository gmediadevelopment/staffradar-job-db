/**
 * Jooble API Collector
 * POST-based API: https://jooble.org/api/{API_KEY}
 * 
 * 403 = API key invalid/expired → get new one at https://jooble.org/api/about
 * 
 * Includes: retry, rate limiting, city rotation
 */
import axios, { AxiosError } from 'axios';
import type { Collector, CollectorResult } from '../types';

const API_KEY = process.env.JOOBLE_API_KEY;

const DELAY_MS = 1500;
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 5000;

const QUERIES = [
  'Pflege', 'Krankenpflege', 'Altenpflege', 'Pflegefachkraft',
  'Software Entwickler', 'IT', 'Informatiker', 'Programmierer', 'DevOps',
  'Ingenieur', 'Maschinenbau', 'Elektrotechnik',
  'Marketing', 'Vertrieb', 'Sales Manager',
  'Kaufmann', 'Sachbearbeiter', 'Bürokauffrau',
  'Logistik', 'Lager', 'Berufskraftfahrer', 'Disponent',
  'Elektriker', 'Mechaniker', 'Schlosser', 'Schweißer',
  'Koch', 'Gastronomie', 'Hotelfachmann',
  'Arzt', 'Medizin', 'Pharma', 'Therapeut',
  'Buchhaltung', 'Finanzen', 'Controller',
  'Erzieher', 'Sozialarbeiter', 'Pädagogik',
  'Produktion', 'Monteur', 'CNC', 'Qualität',
  'Personal', 'Recruiting', 'HR',
  'Projektmanager', 'Consulting',
  'Bauarbeiter', 'Bauleiter', 'Architekt',
  'Reinigung', 'Hausmeister', 'Facility',
  'Sicherheit', 'Werkschutz',
  'Kundenservice', 'Call Center',
];

const LOCATIONS = [
  '', 'Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt',
  'Stuttgart', 'Düsseldorf', 'Dortmund', 'Leipzig', 'Nürnberg',
  'Dresden', 'Hannover', 'Bremen', 'Essen', 'Duisburg',
];

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function postWithRetry(url: string, body: any): Promise<any> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data } = await axios.post(url, body, {
        timeout: 20000,
        headers: { 'Content-Type': 'application/json' },
      });
      return data;
    } catch (err) {
      const axErr = err as AxiosError;
      const status = axErr.response?.status;

      // 403 = bad API key → no point retrying
      if (status === 403 || status === 401) throw err;

      // 429 or 5xx = retryable
      if ((status === 429 || (status && status >= 500)) && attempt < MAX_RETRIES) {
        const delay = status === 429 ? 30000 : RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(`[Jooble] ${status} → Retry ${attempt + 1}/${MAX_RETRIES} in ${delay / 1000}s...`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

export class JoobleCollector implements Collector {
  name = 'Jooble';
  source = 'jooble';

  async collect(): Promise<CollectorResult> {
    if (!API_KEY) {
      console.error('[Jooble] ❌ No API key! Set JOOBLE_API_KEY in .env');
      console.error('[Jooble] Get your key at: https://jooble.org/api/about');
      return { jobs: [], errors: ['Jooble not configured (JOOBLE_API_KEY missing)'] };
    }

    const allJobs: CollectorResult['jobs'] = [];
    const errors: string[] = [];
    const seenIds = new Set<string>();

    console.log(`[Jooble] Starting: ${QUERIES.length} queries × ${LOCATIONS.length} locations`);

    // Test API key first with a single request
    try {
      await postWithRetry(`https://jooble.org/api/${API_KEY}`, {
        keywords: 'test',
        location: 'Berlin',
      });
      console.log('[Jooble] ✅ API key valid');
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 403 || status === 401) {
        console.error(`[Jooble] ❌ API key invalid/expired (${status})!`);
        console.error('[Jooble] Get a new key at: https://jooble.org/api/about');
        return { jobs: [], errors: [`API key invalid (${status}). Renew at https://jooble.org/api/about`] };
      }
      // Other errors → continue trying
      console.warn(`[Jooble] Test request failed (${err.message}), trying collection anyway...`);
    }

    for (const q of QUERIES) {
      for (const loc of LOCATIONS) {
        try {
          await sleep(DELAY_MS);

          const data = await postWithRetry(`https://jooble.org/api/${API_KEY}`, {
            keywords: q,
            location: loc || 'Deutschland',
            page: 1,
          });

          const jobs = data.jobs || [];
          for (const job of jobs) {
            const jobId = job.id || job.link;
            if (!jobId || seenIds.has(String(jobId))) continue;
            seenIds.add(String(jobId));

            allJobs.push({
              external_id: String(job.id || ''),
              source: 'jooble',
              source_url: job.link,
              title: job.title || '',
              company: job.company || 'Unbekannt',
              location: job.location || loc || 'Deutschland',
              description: job.snippet || '',
              employment_type: job.type?.toLowerCase()?.includes('teilzeit') ? 'teilzeit' :
                job.type?.toLowerCase()?.includes('vollzeit') ? 'vollzeit' : undefined,
              skills: [],
              published_at: job.updated,
            });
          }

          if (jobs.length > 0) {
            console.log(`[Jooble] "${q}" (${loc || 'DE'}) → ${jobs.length} jobs (total: ${seenIds.size})`);
          }
        } catch (err: any) {
          const status = err.response?.status;
          const msg = `"${q}" (${loc || 'DE'}): ${status || ''} ${err.message?.substring(0, 80)}`;

          if (status === 403 || status === 401) {
            console.error(`[Jooble] ❌ API key rejected. Stopping.`);
            errors.push(`API key invalid (${status})`);
            return { jobs: allJobs, totalAvailable: allJobs.length, errors };
          }

          console.error(`[Jooble] ✗ ${msg}`);
          errors.push(msg);
        }
      }
    }

    console.log(`[Jooble] ✅ TOTAL: ${allJobs.length} unique jobs`);
    return { jobs: allJobs, totalAvailable: allJobs.length, errors };
  }
}
