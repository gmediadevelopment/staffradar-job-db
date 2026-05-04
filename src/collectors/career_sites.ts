/**
 * Career Sites Collector – Orchestrates all ATS crawlers
 * Queries the companies table, dispatches to the correct ATS crawler,
 * and upserts results into the jobs table.
 *
 * Key improvements:
 * - Error companies are retried (not permanently stuck)
 * - Adaptive delay: increases after 429, decreases on success
 * - Individual crawler functions have their own retry logic
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
      // ALSO include 'error' companies so they get retried every run
      const [activeCompanies, errorCompanies] = await Promise.all([
        getCompanies({ ats_system: atsSystem, crawl_status: 'active', limit: 500 }),
        getCompanies({ ats_system: atsSystem, crawl_status: 'error', limit: 500 }),
      ]);

      const companies = [...activeCompanies, ...errorCompanies];

      if (companies.length === 0) {
        console.log(`[CareerCrawler] No ${atsSystem} companies to crawl`);
        return { jobs: [], errors: [] };
      }

      const errorCount = errorCompanies.length;
      console.log(`[CareerCrawler] Crawling ${companies.length} ${atsSystem} companies (${activeCompanies.length} active, ${errorCount} retry)...`);

      let consecutiveErrors = 0;
      let currentDelay = 3000; // Start with 3s between companies

      for (const company of companies) {
        try {
          const result = await crawlCompany(company);

          // Check if this company had errors
          const hasErrors = result.errors.length > 0 && result.jobs.length === 0;
          const had429 = result.errors.some(e => e.includes('429'));

          if (had429) {
            consecutiveErrors++;
            // Increase delay after rate limits (up to 15s)
            currentDelay = Math.min(currentDelay + 3000, 15000);
            console.log(`[CareerCrawler] Rate limited, increasing delay to ${currentDelay / 1000}s (${consecutiveErrors} consecutive errors)`);
          } else {
            if (consecutiveErrors > 0) {
              consecutiveErrors = 0;
              // Slowly decrease delay back to normal
              currentDelay = Math.max(currentDelay - 1000, 3000);
            }
          }

          allJobs.push(...result.jobs);
          allErrors.push(...result.errors);

          // Update company crawl state
          // Don't mark as 'error' if we got a 429 – these are temporary
          await updateCompanyCrawlState(company.id, {
            crawl_status: hasErrors && !had429 ? 'error' : 'active',
            crawl_jobs_count: result.jobs.length,
            crawl_error: result.errors.length > 0 ? result.errors.join('; ') : null,
          });

          // If we get 5+ consecutive 429s, wait a full minute to let rate limit reset
          if (consecutiveErrors >= 5) {
            console.log(`[CareerCrawler] 5+ consecutive rate limits, cooling down 60s...`);
            await delay(60000);
            consecutiveErrors = 0;
            currentDelay = 5000;
          }

          // Rate limit: adaptive delay between companies
          await delay(currentDelay);
        } catch (err: any) {
          console.error(`[CareerCrawler] ✗ ${company.name}: ${err.message}`);
          allErrors.push(`${company.name}: ${err.message?.substring(0, 100)}`);

          await updateCompanyCrawlState(company.id, {
            crawl_status: 'error',
            crawl_error: err.message?.substring(0, 200),
          });
        }
      }

      console.log(`[CareerCrawler] ${atsSystem}: ${allJobs.length} jobs from ${companies.length} companies (${allErrors.length} errors)`);
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
