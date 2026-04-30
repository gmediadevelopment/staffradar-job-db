/**
 * CareerJet API Collector – Fixed endpoint + expanded queries
 * Docs: https://www.careerjet.de/partners/api/
 */
import axios from 'axios';
import type { Collector, CollectorResult } from '../types';

const AFFID = process.env.CAREERJET_AFFID;

const QUERIES = [
  'Pflege', 'Krankenpflege', 'Altenpflege', 'Pflegefachkraft',
  'IT', 'Software', 'Informatik', 'Programmierer',
  'Ingenieur', 'Maschinenbau', 'Elektrotechnik',
  'Marketing', 'Vertrieb', 'Sales',
  'Kaufmann', 'Sachbearbeiter', 'Verwaltung',
  'Logistik', 'Lager', 'Transport',
  'Elektriker', 'Mechaniker', 'Handwerker',
  'Koch', 'Gastronomie', 'Hotel',
  'Arzt', 'Medizin', 'Pharma',
  'Buchhaltung', 'Finanzen',
  'Erzieher', 'Sozialarbeiter',
  'Produktion', 'Monteur',
  'Personal', 'HR',
  'Bauleiter', 'Architekt',
  'Reinigung', 'Sicherheit',
];

// Try different API endpoints
const API_URLS = [
  'http://public.api.careerjet.net/search',
  'https://public.api.careerjet.net/search',
];

export class CareerJetCollector implements Collector {
  name = 'CareerJet';
  source = 'careerjet';

  async collect(): Promise<CollectorResult> {
    if (!AFFID) {
      console.error('[CareerJet] No AFFID configured!');
      return { jobs: [], errors: ['CareerJet not configured'] };
    }

    const allJobs: CollectorResult['jobs'] = [];
    const errors: string[] = [];
    const seenUrls = new Set<string>();
    let workingUrl = '';

    console.log(`[CareerJet] Starting collection with ${QUERIES.length} queries, AFFID: ${AFFID.substring(0, 8)}...`);

    for (const q of QUERIES) {
      try {
        let data: any = null;
        
        // Try each API URL
        const urlsToTry = workingUrl ? [workingUrl] : API_URLS;
        for (const apiUrl of urlsToTry) {
          try {
            const response = await axios.get(apiUrl, {
              params: {
                affid: AFFID,
                keywords: q,
                location: 'Deutschland',
                locale_code: 'de_DE',
                pagesize: 99,
                page: 1,
                sort: 'date',
                user_ip: '87.77.79.219', // Use VPS IP
                user_agent: 'Mozilla/5.0 StaffRadar/1.0',
              },
              timeout: 15000,
            });
            data = response.data;
            workingUrl = apiUrl;
            break;
          } catch (urlErr: any) {
            console.warn(`[CareerJet] URL ${apiUrl} failed: ${urlErr.response?.status || urlErr.message?.substring(0, 50)}`);
          }
        }

        if (!data) {
          errors.push(`"${q}": All API URLs failed`);
          continue;
        }

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
            location: job.locations || job.location || 'Deutschland',
            description: job.description || job.snippet || '',
            salary_min: job.salary_min ? parseInt(job.salary_min) : undefined,
            salary_max: job.salary_max ? parseInt(job.salary_max) : undefined,
            skills: [],
            published_at: job.date,
          });
        }

        if (jobs.length > 0) {
          console.log(`[CareerJet] "${q}" → ${jobs.length} jobs (total: ${seenUrls.size})`);
        }
        await new Promise(r => setTimeout(r, 500));
      } catch (err: any) {
        const msg = `"${q}": ${err.response?.status || ''} ${err.message?.substring(0, 120)}`;
        console.error(`[CareerJet] ERROR ${msg}`);
        if (err.response?.data) console.error(`[CareerJet] Response:`, JSON.stringify(err.response.data).substring(0, 200));
        errors.push(msg);
      }
    }

    console.log(`[CareerJet] TOTAL: ${allJobs.length} unique jobs`);
    return { jobs: allJobs, totalAvailable: allJobs.length, errors };
  }
}
