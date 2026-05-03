/**
 * Career Sites Collector – Orchestrates all ATS crawlers
 * Queries the companies table, dispatches to the correct ATS crawler,
 * and upserts results into the jobs table.
 *
 * Can run per ATS system or all at once.
 */
import type { Collector, CollectorResult } from '../types';
import { getCompanies, updateCompanyCrawlState, type Company } from '../companyRepo';
import { crawlPersonioCompany } from '../crawlers/personio';
import { crawlGreenhouseCompany } from '../crawlers/greenhouse';
import { crawlLeverCompany } from '../crawlers/lever';
import { crawlSmartRecruitersCompany } from '../crawlers/smartrecruiters';
import { crawlRecruiteeCompany } from '../crawlers/recruitee';

// Delay helper
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Crawl a single company using the appropriate ATS connector
 */
async function crawlCompany(company: Company): Promise<CollectorResult> {
  switch (company.ats_system) {
    case 'personio':
      if (!company.ats_feed_url) return { jobs: [], errors: [`${company.name}: No feed URL`] };
      return crawlPersonioCompany(company.ats_feed_url, company.name);

    case 'greenhouse':
      if (!company.ats_identifier) return { jobs: [], errors: [`${company.name}: No board token`] };
      return crawlGreenhouseCompany(company.ats_identifier, company.name);

    case 'lever':
      if (!company.ats_identifier) return { jobs: [], errors: [`${company.name}: No company ID`] };
      return crawlLeverCompany(company.ats_identifier, company.name);

    case 'smartrecruiters':
      if (!company.ats_identifier) return { jobs: [], errors: [`${company.name}: No company ID`] };
      return crawlSmartRecruitersCompany(company.ats_identifier, company.name);

    case 'recruitee':
      if (!company.ats_identifier) return { jobs: [], errors: [`${company.name}: No company slug`] };
      return crawlRecruiteeCompany(company.ats_identifier, company.name);

    default:
      return { jobs: [], errors: [`${company.name}: Unsupported ATS "${company.ats_system}"`] };
  }
}

/**
 * Create a Collector for a specific ATS system.
 * This follows the exact same Collector interface as BA, Adzuna, etc.
 */
function createATSCollector(atsSystem: string, displayName: string): Collector {
  return {
    name: displayName,
    source: `career_${atsSystem}`,

    async collect(): Promise<CollectorResult> {
      const allJobs: CollectorResult['jobs'] = [];
      const allErrors: string[] = [];

      // Get all active companies using this ATS
      const companies = await getCompanies({
        ats_system: atsSystem,
        crawl_status: 'active',
        limit: 500,
      });

      if (companies.length === 0) {
        console.log(`[CareerCrawler] No active ${atsSystem} companies`);
        return { jobs: [], errors: [] };
      }

      console.log(`[CareerCrawler] Crawling ${companies.length} ${atsSystem} companies...`);

      for (const company of companies) {
        try {
          let result = await crawlCompany(company);

          // Retry once on 429 (rate limited) after waiting 10s
          if (result.errors.some(e => e.includes('429'))) {
            console.log(`[CareerCrawler] Rate limited on ${company.name}, waiting 10s and retrying...`);
            await delay(10000);
            result = await crawlCompany(company);
          }

          allJobs.push(...result.jobs);
          allErrors.push(...result.errors);

          // Update company crawl state
          await updateCompanyCrawlState(company.id, {
            crawl_status: result.errors.length > 0 && result.jobs.length === 0 ? 'error' : 'active',
            crawl_jobs_count: result.jobs.length,
            crawl_error: result.errors.length > 0 ? result.errors.join('; ') : null,
          });

          // Rate limit: 3s between companies to avoid 429
          await delay(3000);
        } catch (err: any) {
          console.error(`[CareerCrawler] ✗ ${company.name}: ${err.message}`);
          allErrors.push(`${company.name}: ${err.message?.substring(0, 100)}`);

          await updateCompanyCrawlState(company.id, {
            crawl_status: 'error',
            crawl_error: err.message?.substring(0, 200),
          });
        }
      }

      console.log(`[CareerCrawler] ${atsSystem}: ${allJobs.length} jobs from ${companies.length} companies`);
      return { jobs: allJobs, totalAvailable: allJobs.length, errors: allErrors };
    },
  };
}

// Export individual ATS collectors matching the Collector interface
export const CareerPersonioCollector = createATSCollector('personio', 'Karriereseiten (Personio)');
export const CareerGreenhouseCollector = createATSCollector('greenhouse', 'Karriereseiten (Greenhouse)');
export const CareerLeverCollector = createATSCollector('lever', 'Karriereseiten (Lever)');
export const CareerSmartRecruitersCollector = createATSCollector('smartrecruiters', 'Karriereseiten (SmartRecruiters)');
export const CareerRecruiteeCollector = createATSCollector('recruitee', 'Karriereseiten (Recruitee)');
