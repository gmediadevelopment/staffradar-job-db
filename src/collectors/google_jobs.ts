/**
 * Google Jobs Collector via SerpAPI
 * 
 * Uses SerpAPI's Google Jobs engine to aggregate jobs from Google's
 * job search (which itself aggregates Indeed, StepStone, LinkedIn, etc.)
 * 
 * Requires: SERPAPI_KEY environment variable
 * Pricing: ~100 searches/month free, $50/month for 5000 searches
 * 
 * Each search returns ~10 jobs. We paginate via next_page_token.
 * With our keyword list + 5 pages each = ~130 search queries per run.
 */
import axios from 'axios';
import type { Collector, CollectorResult } from '../types';

const SERPAPI_BASE = 'https://serpapi.com/search.json';

// Focused keyword list for German market (fewer, broader terms = fewer API calls)
const SEARCH_QUERIES = [
  // Healthcare & Social
  'Pflege', 'Krankenpflege', 'Altenpflege', 'Pflegefachkraft',
  'Erzieher', 'Sozialarbeiter',
  // IT & Tech
  'IT', 'Softwareentwickler', 'DevOps', 'Data Scientist',
  'SAP Berater', 'Cloud Engineer',
  // Engineering
  'Ingenieur', 'Maschinenbau', 'Elektrotechnik', 'Mechatronik',
  // Business & Finance
  'Marketing', 'Vertrieb', 'Buchhaltung', 'Controlling',
  'Projektmanagement', 'Unternehmensberatung',
  // Logistics & Trade
  'Logistik', 'Berufskraftfahrer', 'Lagerist',
  // Skilled Trades
  'Elektriker', 'Mechaniker', 'Anlagenmechaniker', 'Schweißer',
  // Office & Admin
  'Kaufmann', 'Sachbearbeiter', 'Assistenz',
  // Medical
  'Arzt', 'Medizinische Fachangestellte', 'Apotheker',
  // Construction
  'Bauleiter', 'Architekt',
  // HR & Management
  'Personal', 'Recruiting',
  // Production
  'Produktion', 'Qualitätssicherung', 'CNC',
];

// Max pages per keyword (10 results per page)
const MAX_PAGES_PER_QUERY = 3;

// Delay between API calls (ms)
const API_DELAY = 500;

export class GoogleJobsCollector implements Collector {
  name = 'Google Jobs (SerpAPI)';
  source = 'google_jobs';

  private apiKey: string;

  constructor() {
    this.apiKey = process.env.SERPAPI_KEY || '';
  }

  async collect(): Promise<CollectorResult> {
    if (!this.apiKey) {
      return { jobs: [], errors: ['SerpAPI not configured (SERPAPI_KEY missing)'] };
    }

    const allJobs: CollectorResult['jobs'] = [];
    const errors: string[] = [];
    const seenJobIds = new Set<string>();

    for (const keyword of SEARCH_QUERIES) {
      try {
        let pageToken: string | undefined;
        let page = 0;

        while (page < MAX_PAGES_PER_QUERY) {
          const params: Record<string, string> = {
            engine: 'google_jobs',
            q: keyword,
            google_domain: 'google.de',
            gl: 'de',
            hl: 'de',
            api_key: this.apiKey,
          };

          // Location: search across Germany
          params.location = 'Germany';

          if (pageToken) {
            params.next_page_token = pageToken;
          }

          const { data } = await axios.get(SERPAPI_BASE, {
            params,
            timeout: 30000,
          });

          const jobs = data.jobs_results || [];
          if (jobs.length === 0) break;

          for (const job of jobs) {
            // Use Google's job_id for dedup
            const jobId = job.job_id || `${job.title}-${job.company_name}`;
            if (seenJobIds.has(jobId)) continue;
            seenJobIds.add(jobId);

            // Get the best apply link
            const applyUrl = job.apply_options?.[0]?.link
              || job.share_link
              || undefined;

            // Parse schedule type
            const scheduleType = job.detected_extensions?.schedule_type;
            let employmentType: string | undefined;
            if (scheduleType) {
              const lower = scheduleType.toLowerCase();
              if (lower.includes('full') || lower.includes('vollzeit')) employmentType = 'vollzeit';
              else if (lower.includes('part') || lower.includes('teilzeit')) employmentType = 'teilzeit';
              else if (lower.includes('contract') || lower.includes('befristet')) employmentType = 'befristet';
              else if (lower.includes('internship') || lower.includes('praktikum')) employmentType = 'praktikum';
            }

            // Parse remote type
            let remoteType: string | undefined;
            if (job.detected_extensions?.work_from_home) {
              remoteType = 'remote';
            }

            // Extract source from 'via' field (e.g. "via Indeed" -> "Indeed")
            const viaSource = job.via?.replace(/^via\s+/i, '') || 'Google Jobs';

            allJobs.push({
              external_id: jobId,
              source: 'google_jobs',
              source_url: applyUrl,
              title: job.title || 'Unbekannt',
              company: job.company_name || 'Unbekannt',
              location: job.location || 'Deutschland',
              description: job.description || '',
              requirements: job.job_highlights
                ?.find((h: any) => h.title === 'Qualifications')
                ?.items || [],
              employment_type: employmentType,
              remote_type: remoteType,
              skills: [],
              category: undefined,
              industry: undefined,
              published_at: undefined, // Google doesn't give exact dates, just "X days ago"
            });
          }

          console.log(`[GoogleJobs] "${keyword}" page ${page + 1} → ${jobs.length} jobs (total unique: ${seenJobIds.size})`);

          // Check for next page
          pageToken = data.serpapi_pagination?.next_page_token;
          if (!pageToken) break;

          page++;
          await new Promise(r => setTimeout(r, API_DELAY));
        }
      } catch (err: any) {
        const status = err.response?.status || '';
        const msg = `"${keyword}": ${status} ${err.message?.substring(0, 80)}`;
        console.error(`[GoogleJobs] ERROR: ${msg}`);
        errors.push(msg);

        // If we hit rate limit, wait longer
        if (status === 429) {
          console.log('[GoogleJobs] Rate limited, waiting 60s...');
          await new Promise(r => setTimeout(r, 60000));
        }
      }

      // Delay between keywords
      await new Promise(r => setTimeout(r, API_DELAY));
    }

    console.log(`[GoogleJobs] TOTAL: ${allJobs.length} unique jobs from ${SEARCH_QUERIES.length} queries`);
    return { jobs: allJobs, totalAvailable: allJobs.length, errors };
  }
}
