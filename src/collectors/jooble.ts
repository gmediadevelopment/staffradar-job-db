/**
 * Jooble API Collector – Fixed + Expanded
 * POST-based API, runs server-side (no CORS)
 */
import axios from 'axios';
import type { Collector, CollectorResult } from '../types';

const API_KEY = process.env.JOOBLE_API_KEY;

const QUERIES = [
  'Pflege', 'Krankenpflege', 'Altenpflege', 'Pflegefachkraft',
  'IT', 'Software Entwickler', 'Informatiker', 'Programmierer',
  'Ingenieur', 'Maschinenbau', 'Elektrotechnik',
  'Marketing', 'Vertrieb', 'Sales Manager',
  'Kaufmann', 'Sachbearbeiter', 'Bürokauffrau',
  'Logistik', 'Lager', 'Berufskraftfahrer',
  'Elektriker', 'Mechaniker', 'Schlosser',
  'Koch', 'Gastronomie', 'Hotelfachmann',
  'Arzt', 'Medizin', 'Pharma',
  'Buchhaltung', 'Finanzen', 'Controller',
  'Erzieher', 'Sozialarbeiter',
  'Produktion', 'Monteur', 'Qualität',
  'Personal', 'Recruiting',
  'Projektmanager',
  'Bauarbeiter', 'Bauleiter',
  'Reinigung', 'Hausmeister',
];

// German cities for location-based searches
const LOCATIONS = ['', 'Berlin', 'München', 'Hamburg', 'Köln', 'Frankfurt', 'Stuttgart', 'Düsseldorf', 'Dortmund', 'Leipzig', 'Nürnberg'];

export class JoobleCollector implements Collector {
  name = 'Jooble';
  source = 'jooble';

  async collect(): Promise<CollectorResult> {
    if (!API_KEY) {
      console.error('[Jooble] No API key configured!');
      return { jobs: [], errors: ['Jooble not configured (JOOBLE_API_KEY missing)'] };
    }

    const allJobs: CollectorResult['jobs'] = [];
    const errors: string[] = [];
    const seenIds = new Set<string>();

    console.log(`[Jooble] Starting collection with ${QUERIES.length} queries × ${LOCATIONS.length} locations...`);

    for (const q of QUERIES) {
      for (const loc of LOCATIONS) {
        try {
          const { data } = await axios.post(
            `https://jooble.org/api/${API_KEY}`,
            {
              keywords: q,
              location: loc || 'Deutschland',
              page: 1,
            },
            {
              timeout: 15000,
              headers: { 'Content-Type': 'application/json' },
            }
          );

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
            console.log(`[Jooble] "${q}" (${loc || 'DE'}) → ${jobs.length} jobs`);
          }

          await new Promise(r => setTimeout(r, 800)); // Rate limit
        } catch (err: any) {
          const status = err.response?.status;
          const msg = `"${q}" (${loc || 'DE'}): ${status || ''} ${err.message?.substring(0, 120)}`;
          
          if (status === 429) {
            console.warn(`[Jooble] Rate limited, pausing 10s...`);
            await new Promise(r => setTimeout(r, 10000));
          } else if (status === 403 || status === 401) {
            console.error(`[Jooble] Auth error! Check API key. ${msg}`);
            errors.push(msg);
            return { jobs: allJobs, totalAvailable: allJobs.length, errors };
          } else {
            console.error(`[Jooble] ERROR ${msg}`);
            errors.push(msg);
          }
        }
      }
    }

    console.log(`[Jooble] TOTAL: ${allJobs.length} unique jobs`);
    return { jobs: allJobs, totalAvailable: allJobs.length, errors };
  }
}
