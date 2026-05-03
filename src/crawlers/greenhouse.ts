/**
 * Greenhouse Career Page Crawler
 * Public JSON API – no auth required
 * Endpoint: https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
 */
import axios from 'axios';
import type { CollectorResult } from '../types';

interface GreenhouseJob {
  id: number;
  title: string;
  updated_at: string;
  absolute_url: string;
  location: { name: string };
  content?: string; // HTML description
  departments?: { name: string }[];
  offices?: { name: string }[];
}

function stripHTML(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
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

export async function crawlGreenhouseCompany(
  boardToken: string,
  companyName: string
): Promise<CollectorResult> {
  const errors: string[] = [];
  try {
    const url = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`;
    const { data } = await axios.get(url, {
      timeout: 15000,
      headers: { 'User-Agent': 'StaffRadar-Crawler/1.0' },
    });

    const ghJobs: GreenhouseJob[] = data.jobs || [];
    const jobs: CollectorResult['jobs'] = ghJobs.map(j => {
      const desc = j.content ? stripHTML(j.content) : '';
      return {
        external_id: `greenhouse-${j.id}`,
        source: 'career_greenhouse',
        source_url: j.absolute_url,
        title: j.title,
        company: companyName,
        location: j.location?.name || j.offices?.[0]?.name || undefined,
        description: desc.substring(0, 5000),
        skills: extractSkills(`${j.title} ${desc}`),
        category: j.departments?.[0]?.name || undefined,
        published_at: j.updated_at,
        remote_type: (j.location?.name || '').toLowerCase().includes('remote') ? 'remote' :
          desc.toLowerCase().includes('remote') ? 'hybrid' : 'vor_ort',
      };
    });

    console.log(`[Greenhouse] ${companyName} (${boardToken}): ${jobs.length} jobs`);
    return { jobs, totalAvailable: jobs.length, errors };
  } catch (err: any) {
    const msg = `${companyName}: ${err.message?.substring(0, 100)}`;
    console.error(`[Greenhouse] ✗ ${msg}`);
    errors.push(msg);
    return { jobs: [], errors };
  }
}
