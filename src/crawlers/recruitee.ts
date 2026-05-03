/**
 * Recruitee Career Page Crawler
 * Public JSON API – no auth required
 * Endpoint: https://{company}.recruitee.com/api/offers
 */
import axios from 'axios';
import type { CollectorResult } from '../types';

interface RecruiteeOffer {
  id: number;
  slug: string;
  title: string;
  description?: string; // HTML
  city?: string;
  country?: string;
  state?: string;
  remote?: boolean;
  department?: string;
  careers_url?: string;
  created_at: string;
  published_at?: string;
  employment_type_code?: string;
  min_hours?: number;
  max_hours?: number;
  tags?: string[];
}

function stripHTML(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
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

export async function crawlRecruiteeCompany(
  companySlug: string,
  companyName: string
): Promise<CollectorResult> {
  const errors: string[] = [];
  try {
    const url = `https://${companySlug}.recruitee.com/api/offers`;
    const { data } = await axios.get(url, {
      timeout: 15000,
      headers: { 'User-Agent': 'StaffRadar-Crawler/1.0' },
    });

    const offers: RecruiteeOffer[] = data.offers || [];
    const jobs: CollectorResult['jobs'] = offers.map(o => {
      const desc = o.description ? stripHTML(o.description) : '';
      const loc = [o.city, o.state, o.country].filter(Boolean).join(', ');

      return {
        external_id: `recruitee-${o.id}`,
        source: 'career_recruitee',
        source_url: o.careers_url || `https://${companySlug}.recruitee.com/o/${o.slug}`,
        title: o.title,
        company: companyName,
        location: loc || undefined,
        description: desc.substring(0, 5000),
        employment_type: mapEmployment(o.employment_type_code),
        skills: extractSkills(`${o.title} ${desc}`),
        category: o.department || undefined,
        published_at: o.published_at || o.created_at,
        remote_type: o.remote ? 'remote' : 'vor_ort',
      };
    });

    console.log(`[Recruitee] ${companyName} (${companySlug}): ${jobs.length} jobs`);
    return { jobs, totalAvailable: jobs.length, errors };
  } catch (err: any) {
    const msg = `${companyName}: ${err.message?.substring(0, 100)}`;
    console.error(`[Recruitee] ✗ ${msg}`);
    errors.push(msg);
    return { jobs: [], errors };
  }
}

function mapEmployment(code?: string): string | undefined {
  if (!code) return undefined;
  const c = code.toLowerCase();
  if (c.includes('full')) return 'vollzeit';
  if (c.includes('part')) return 'teilzeit';
  if (c.includes('intern') || c.includes('praktik')) return 'praktikum';
  if (c.includes('freelance') || c.includes('contract')) return 'befristet';
  return undefined;
}
