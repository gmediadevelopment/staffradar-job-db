/**
 * Lever Career Page Crawler
 * Public JSON API – no auth required
 * Endpoint: https://api.lever.co/v0/postings/{company}?mode=json
 */
import axios from 'axios';
import type { CollectorResult } from '../types';

interface LeverPosting {
  id: string;
  text: string; // Job title
  hostedUrl: string;
  createdAt: number; // Unix timestamp
  descriptionPlain?: string;
  description?: string; // HTML
  lists?: { text: string; content: string }[];
  categories: {
    location?: string;
    department?: string;
    team?: string;
    commitment?: string; // Full-time, Part-time
  };
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

export async function crawlLeverCompany(
  companyId: string,
  companyName: string
): Promise<CollectorResult> {
  const errors: string[] = [];
  try {
    const url = `https://api.lever.co/v0/postings/${companyId}?mode=json`;
    const { data } = await axios.get(url, {
      timeout: 15000,
      headers: { 'User-Agent': 'StaffRadar-Crawler/1.0' },
    });

    const postings: LeverPosting[] = Array.isArray(data) ? data : [];
    const jobs: CollectorResult['jobs'] = postings.map(p => {
      const desc = p.descriptionPlain || (p.description ? stripHTML(p.description) : '');
      // Combine lists (requirements, responsibilities) into description
      const listsText = (p.lists || []).map(l => `${l.text}: ${stripHTML(l.content)}`).join('\n');
      const fullDesc = `${desc}\n${listsText}`.trim();

      return {
        external_id: `lever-${p.id}`,
        source: 'career_lever',
        source_url: p.hostedUrl,
        title: p.text,
        company: companyName,
        location: p.categories.location || undefined,
        description: fullDesc.substring(0, 5000),
        employment_type: mapCommitment(p.categories.commitment),
        skills: extractSkills(`${p.text} ${fullDesc}`),
        category: p.categories.department || p.categories.team || undefined,
        published_at: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
        remote_type: (p.categories.location || '').toLowerCase().includes('remote') ? 'remote' :
          fullDesc.toLowerCase().includes('remote') ? 'hybrid' : 'vor_ort',
      };
    });

    console.log(`[Lever] ${companyName} (${companyId}): ${jobs.length} jobs`);
    return { jobs, totalAvailable: jobs.length, errors };
  } catch (err: any) {
    const msg = `${companyName}: ${err.message?.substring(0, 100)}`;
    console.error(`[Lever] ✗ ${msg}`);
    errors.push(msg);
    return { jobs: [], errors };
  }
}

function mapCommitment(c?: string): string | undefined {
  if (!c) return undefined;
  const l = c.toLowerCase();
  if (l.includes('full') || l.includes('vollzeit')) return 'vollzeit';
  if (l.includes('part') || l.includes('teilzeit')) return 'teilzeit';
  if (l.includes('intern') || l.includes('praktik')) return 'praktikum';
  return undefined;
}
