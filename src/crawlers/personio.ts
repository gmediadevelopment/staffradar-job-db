/**
 * Personio Career Page Crawler
 * Fetches jobs from Personio XML feeds (public, no auth required)
 * Feed URL: https://{company}.jobs.personio.de/xml?language=de
 */
import axios from 'axios';
import type { CollectorResult } from '../types';

interface PersonioPosition {
  id: string;
  name: string;
  office: string;
  department: string;
  recruitingCategory: string;
  employmentType: string;
  schedule: string;
  description: string;
  createdAt: string;
}

/**
 * Parse Personio XML feed into job objects
 */
function parsePersonioXML(xml: string, companyName: string): CollectorResult['jobs'] {
  const jobs: CollectorResult['jobs'] = [];

  // Extract each <position> element
  const positionRegex = /<position>([\s\S]*?)<\/position>/gi;
  let match;

  while ((match = positionRegex.exec(xml)) !== null) {
    const block = match[1];

    const extract = (tag: string): string => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'))
        || block.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i'));
      return m ? m[1].trim() : '';
    };

    const id = extract('id');
    const name = extract('name');
    if (!name) continue;

    const office = extract('office');
    const department = extract('department');
    const employmentType = extract('employmentType') || extract('schedule');
    const description = extract('jobDescription') || extract('description');
    const createdAt = extract('createdAt');

    // Strip HTML from description
    const cleanDescription = description
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();

    // Extract skills from description keywords
    const skills = extractSkillsFromText(cleanDescription);

    jobs.push({
      external_id: `personio-${id}`,
      source: 'career_personio',
      source_url: undefined, // Will be set by caller if available
      title: name,
      company: companyName,
      location: office || undefined,
      description: cleanDescription.substring(0, 5000),
      employment_type: mapEmploymentType(employmentType),
      remote_type: detectRemote(name, cleanDescription),
      skills,
      category: department || undefined,
      published_at: createdAt || undefined,
    });
  }

  return jobs;
}

function mapEmploymentType(type: string): string | undefined {
  const t = (type || '').toLowerCase();
  if (t.includes('full') || t.includes('vollzeit')) return 'vollzeit';
  if (t.includes('part') || t.includes('teilzeit')) return 'teilzeit';
  if (t.includes('intern') || t.includes('praktik')) return 'praktikum';
  if (t.includes('working student') || t.includes('werkstud')) return 'werkstudent';
  return undefined;
}

function detectRemote(title: string, description: string): string | undefined {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes('100% remote') || text.includes('fully remote')) return 'remote';
  if (text.includes('remote') || text.includes('homeoffice') || text.includes('home office')) return 'hybrid';
  return 'vor_ort';
}

function extractSkillsFromText(text: string): { name: string }[] {
  const techKeywords = [
    'JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'C++', 'Go', 'Rust', 'PHP', 'Ruby',
    'React', 'Angular', 'Vue', 'Node.js', 'Express', 'Django', 'Spring', 'Laravel',
    'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform',
    'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch',
    'SAP', 'Salesforce', 'Jira', 'Confluence',
    'Scrum', 'Agile', 'DevOps', 'CI/CD', 'Git',
    'Machine Learning', 'Data Science', 'AI', 'NLP',
    'REST', 'GraphQL', 'Microservices', 'API',
    'Linux', 'Windows Server', 'Networking',
    'Figma', 'Sketch', 'Adobe', 'UX', 'UI',
    'Marketing', 'SEO', 'Google Ads', 'CRM',
    'Excel', 'Power BI', 'Tableau',
    'Pflege', 'Medizin', 'Logistik', 'Buchhaltung', 'Controlling',
  ];

  const found: string[] = [];
  const lower = text.toLowerCase();
  for (const kw of techKeywords) {
    if (lower.includes(kw.toLowerCase()) && !found.includes(kw)) {
      found.push(kw);
    }
  }
  return found.slice(0, 10).map(name => ({ name }));
}

/**
 * Crawl a single Personio company
 */
export async function crawlPersonioCompany(
  feedUrl: string,
  companyName: string
): Promise<CollectorResult> {
  const errors: string[] = [];
  try {
    const { data } = await axios.get(feedUrl, {
      timeout: 15000,
      headers: { 'User-Agent': 'StaffRadar-Crawler/1.0' },
      responseType: 'text',
    });

    const jobs = parsePersonioXML(data, companyName);
    console.log(`[Personio] ${companyName}: ${jobs.length} jobs`);
    return { jobs, totalAvailable: jobs.length, errors };
  } catch (err: any) {
    const msg = `${companyName}: ${err.message?.substring(0, 100)}`;
    console.error(`[Personio] ✗ ${msg}`);
    errors.push(msg);
    return { jobs: [], errors };
  }
}
