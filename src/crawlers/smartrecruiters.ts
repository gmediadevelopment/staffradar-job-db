/**
 * SmartRecruiters Career Page Crawler
 * Public Posting API – no auth for public postings
 * Endpoint: https://api.smartrecruiters.com/v1/companies/{id}/postings
 */
import axios from 'axios';
import type { CollectorResult } from '../types';

interface SRPosting {
  id: string;
  name: string;
  uuid: string;
  refNumber?: string;
  releasedDate: string;
  location: { city?: string; region?: string; country?: string; remote?: boolean };
  industry?: { label?: string };
  department?: { label?: string };
  function?: { label?: string };
  experienceLevel?: { label?: string };
  typeOfEmployment?: { label?: string };
  ref_url?: string;
  company?: { name?: string };
}

function extractSkills(text: string): { name: string }[] {
  const keywords = [
    'JavaScript','TypeScript','Python','Java','C#','Go','Rust','PHP','Ruby',
    'React','Angular','Vue','Node.js','Django','Spring','AWS','Azure','GCP',
    'Docker','Kubernetes','SQL','PostgreSQL','MongoDB','Redis',
    'SAP','Salesforce','Jira','Scrum','Agile','DevOps','Git','CI/CD',
    'Machine Learning','Data Science','AI','REST','GraphQL','API',
    'Linux','Figma','Marketing','SEO','Excel','Power BI','Tableau',
    'Pflege','Medizin','Logistik','Buchhaltung','Controlling',
  ];
  const lower = text.toLowerCase();
  return keywords.filter(k => lower.includes(k.toLowerCase())).slice(0, 10).map(name => ({ name }));
}

export async function crawlSmartRecruitersCompany(
  companyId: string,
  companyName: string
): Promise<CollectorResult> {
  const errors: string[] = [];
  const allJobs: CollectorResult['jobs'] = [];

  try {
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const url = `https://api.smartrecruiters.com/v1/companies/${companyId}/postings?offset=${offset}&limit=${limit}`;
      const { data } = await axios.get(url, {
        timeout: 15000,
        headers: { 'User-Agent': 'StaffRadar-Crawler/1.0' },
      });

      const postings: SRPosting[] = data.content || [];
      if (postings.length === 0) {
        hasMore = false;
        break;
      }

      for (const p of postings) {
        const loc = [p.location?.city, p.location?.region].filter(Boolean).join(', ');

        allJobs.push({
          external_id: `sr-${p.uuid || p.id}`,
          source: 'career_smartrecruiters',
          source_url: p.ref_url || `https://careers.smartrecruiters.com/${companyId}/${p.uuid || p.id}`,
          title: p.name,
          company: companyName,
          location: loc || undefined,
          description: undefined, // SR public API doesn't include descriptions in list view
          employment_type: mapEmployment(p.typeOfEmployment?.label),
          skills: extractSkills(p.name),
          category: p.department?.label || p.function?.label || undefined,
          industry: p.industry?.label || undefined,
          published_at: p.releasedDate,
          remote_type: p.location?.remote ? 'remote' : 'vor_ort',
        });
      }

      offset += limit;
      if (postings.length < limit) hasMore = false;
      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`[SmartRecruiters] ${companyName} (${companyId}): ${allJobs.length} jobs`);
    return { jobs: allJobs, totalAvailable: allJobs.length, errors };
  } catch (err: any) {
    const msg = `${companyName}: ${err.message?.substring(0, 100)}`;
    console.error(`[SmartRecruiters] ✗ ${msg}`);
    errors.push(msg);
    return { jobs: allJobs, errors };
  }
}

function mapEmployment(type?: string): string | undefined {
  if (!type) return undefined;
  const t = type.toLowerCase();
  if (t.includes('full') || t.includes('vollzeit')) return 'vollzeit';
  if (t.includes('part') || t.includes('teilzeit')) return 'teilzeit';
  if (t.includes('intern') || t.includes('praktik')) return 'praktikum';
  if (t.includes('contract') || t.includes('befristet')) return 'befristet';
  return undefined;
}
