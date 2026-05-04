/**
 * CareerJet API Collector
 * Partner API: https://www.careerjet.com/partners/
 * 
 * Old endpoint (dead): public.api.careerjet.net
 * New endpoint: search.api.careerjet.net/v4/query
 * 
 * Required: CAREERJET_AFFID (affiliate ID from partner portal)
 * Mandatory params: user_ip, user_agent (anti-bot)
 */
import axios, { AxiosError } from 'axios';
import type { Collector, CollectorResult } from '../types';

const AFFID = process.env.CAREERJET_AFFID;

const DELAY_MS = 1000;
const MAX_RETRIES = 2;

const QUERIES = [
  'Pflege', 'Krankenpflege', 'Altenpflege', 'Pflegefachkraft',
  'Software', 'IT', 'Informatik', 'Programmierer', 'DevOps',
  'Ingenieur', 'Maschinenbau', 'Elektrotechnik',
  'Marketing', 'Vertrieb', 'Sales',
  'Kaufmann', 'Sachbearbeiter', 'Verwaltung',
  'Logistik', 'Lager', 'Transport', 'Spedition',
  'Elektriker', 'Mechaniker', 'Handwerker', 'Schweißer',
  'Koch', 'Gastronomie', 'Hotel',
  'Arzt', 'Medizin', 'Pharma', 'Therapeut',
  'Buchhaltung', 'Finanzen', 'Controlling',
  'Erzieher', 'Sozialarbeiter', 'Pädagogik',
  'Produktion', 'Monteur', 'CNC',
  'Personal', 'HR', 'Recruiting',
  'Bauleiter', 'Architekt',
  'Reinigung', 'Sicherheit',
  'Berufskraftfahrer', 'Kundenservice',
];

const LOCATIONS = [
  'Deutschland',
  'Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt',
  'Stuttgart', 'Düsseldorf', 'Leipzig', 'Nürnberg', 'Dresden',
  'Hannover', 'Bremen', 'Essen', 'Dortmund',
];

// Try endpoints in order (new first, old as fallback)
const API_ENDPOINTS = [
  'https://search.api.careerjet.net/v4/query',
  'https://public.api.careerjet.net/search',
  'http://public.api.careerjet.net/search',
];

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export class CareerJetCollector implements Collector {
  name = 'CareerJet';
  source = 'careerjet';

  async collect(): Promise<CollectorResult> {
    if (!AFFID) {
      console.error('[CareerJet] ❌ No AFFID! Set CAREERJET_AFFID in .env');
      console.error('[CareerJet] Register at: https://www.careerjet.com/partners/');
      return { jobs: [], errors: ['CareerJet not configured (CAREERJET_AFFID missing)'] };
    }

    const allJobs: CollectorResult['jobs'] = [];
    const errors: string[] = [];
    const seenUrls = new Set<string>();
    let workingEndpoint = '';

    console.log(`[CareerJet] Starting: ${QUERIES.length} queries × ${LOCATIONS.length} locations, AFFID: ${AFFID.substring(0, 8)}...`);

    // Find working endpoint first
    for (const endpoint of API_ENDPOINTS) {
      try {
        console.log(`[CareerJet] Testing endpoint: ${endpoint}`);
        const { data } = await axios.get(endpoint, {
          params: {
            affid: AFFID,
            keywords: 'test',
            location: 'Berlin',
            locale_code: 'de_DE',
            pagesize: 1,
            page: 1,
            user_ip: '1.2.3.4',
            user_agent: 'Mozilla/5.0 (compatible; StaffRadar/1.0)',
          },
          timeout: 15000,
        });
        workingEndpoint = endpoint;
        console.log(`[CareerJet] ✅ Endpoint works: ${endpoint}`);
        break;
      } catch (err: any) {
        console.warn(`[CareerJet] ✗ ${endpoint}: ${err.response?.status || err.message?.substring(0, 60)}`);
      }
    }

    if (!workingEndpoint) {
      const msg = 'All CareerJet API endpoints failed. Check AFFID or register at https://www.careerjet.com/partners/';
      console.error(`[CareerJet] ❌ ${msg}`);
      return { jobs: [], errors: [msg] };
    }

    for (const q of QUERIES) {
      for (const loc of LOCATIONS) {
        try {
          await sleep(DELAY_MS);

          let data: any = null;

          for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
              const response = await axios.get(workingEndpoint, {
                params: {
                  affid: AFFID,
                  keywords: q,
                  location: loc,
                  locale_code: 'de_DE',
                  pagesize: 99,
                  page: 1,
                  sort: 'date',
                  user_ip: '1.2.3.4',
                  user_agent: 'Mozilla/5.0 (compatible; StaffRadar/1.0)',
                },
                timeout: 20000,
              });
              data = response.data;
              break;
            } catch (err) {
              const axErr = err as AxiosError;
              if (axErr.response?.status === 429 && attempt < MAX_RETRIES) {
                console.warn(`[CareerJet] 429, waiting 15s...`);
                await sleep(15000);
                continue;
              }
              if (axErr.response?.status && axErr.response.status >= 500 && attempt < MAX_RETRIES) {
                await sleep(5000 * (attempt + 1));
                continue;
              }
              throw err;
            }
          }

          if (!data) continue;

          const jobs = data.jobs || [];
          for (const job of jobs) {
            const url = job.url || job.link;
            if (!url || seenUrls.has(url)) continue;
            seenUrls.add(url);

            allJobs.push({
              external_id: url ? Buffer.from(url).toString('base64').substring(0, 32) : undefined,
              source: 'careerjet',
              source_url: url,
              title: job.title || '',
              company: job.company || 'Unbekannt',
              location: job.locations || job.location || loc,
              description: job.description || job.snippet || '',
              salary_min: job.salary_min ? parseInt(job.salary_min) : undefined,
              salary_max: job.salary_max ? parseInt(job.salary_max) : undefined,
              skills: [],
              published_at: job.date,
            });
          }

          if (jobs.length > 0) {
            console.log(`[CareerJet] "${q}" (${loc}) → ${jobs.length} jobs (total: ${seenUrls.size})`);
          }
        } catch (err: any) {
          const status = err.response?.status || '';
          const msg = `"${q}" (${loc}): ${status} ${err.message?.substring(0, 80)}`;
          console.error(`[CareerJet] ✗ ${msg}`);
          errors.push(msg);
        }
      }
    }

    console.log(`[CareerJet] ✅ TOTAL: ${allJobs.length} unique jobs`);
    return { jobs: allJobs, totalAvailable: allJobs.length, errors };
  }
}
