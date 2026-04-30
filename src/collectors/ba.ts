/**
 * Bundesagentur für Arbeit – Job Collector
 * API: https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs
 * Public API Key: jobboerse-jobsuche
 * Rate: Generous, no strict limits
 */
import axios from 'axios';
import type { Collector, CollectorResult } from '../types';

const BA_BASE = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs';
const BA_API_KEY = process.env.BA_API_KEY || 'jobboerse-jobsuche';

// Search categories to cover the full German job market
const SEARCH_QUERIES = [
  'Pflege', 'Krankenpflege', 'Altenpflege',
  'IT', 'Softwareentwicklung', 'Informatik',
  'Ingenieur', 'Maschinenbau', 'Elektrotechnik',
  'Marketing', 'Vertrieb', 'Sales',
  'Buchhaltung', 'Controlling', 'Finanzen',
  'Logistik', 'Lager', 'Transport',
  'Handwerk', 'Elektriker', 'Mechaniker',
  'Gastronomie', 'Hotel', 'Koch',
  'Kaufmann', 'Verwaltung', 'Büro',
  'Erzieher', 'Sozialarbeiter', 'Pädagogik',
  'Arzt', 'Medizin', 'Pharma',
  'Bauingenieur', 'Architektur', 'Bauwesen',
  'Projektmanagement', 'Consulting',
  'Personal', 'HR', 'Recruiting',
];

const SKILL_MAP: Record<string, string> = {
  'pflege': 'Pflege', 'intensivpflege': 'Intensivpflege', 'altenpflege': 'Altenpflege',
  'sap': 'SAP', 'java': 'Java', 'python': 'Python', 'react': 'React',
  'angular': 'Angular', 'typescript': 'TypeScript', 'javascript': 'JavaScript',
  'aws': 'AWS', 'azure': 'Azure', 'docker': 'Docker', 'kubernetes': 'Kubernetes',
  'sql': 'SQL', 'node': 'Node.js', 'c++': 'C++', 'c#': 'C#', '.net': '.NET',
  'maschinenbau': 'Maschinenbau', 'elektrotechnik': 'Elektrotechnik',
  'projektmanagement': 'Projektmanagement', 'scrum': 'Scrum',
  'marketing': 'Marketing', 'vertrieb': 'Vertrieb',
  'buchhaltung': 'Buchhaltung', 'controlling': 'Controlling',
  'linux': 'Linux', 'devops': 'DevOps',
};

function extractSkills(text: string): { name: string }[] {
  const lower = text.toLowerCase();
  const found: { name: string }[] = [];
  const seen = new Set<string>();
  for (const [kw, name] of Object.entries(SKILL_MAP)) {
    if (lower.includes(kw) && !seen.has(name)) {
      seen.add(name);
      found.push({ name });
    }
  }
  return found.slice(0, 10);
}

export class BACollector implements Collector {
  name = 'Bundesagentur für Arbeit';
  source = 'ba';

  async collect(): Promise<CollectorResult> {
    const allJobs: CollectorResult['jobs'] = [];
    const errors: string[] = [];
    const seenIds = new Set<string>();

    for (const searchQuery of SEARCH_QUERIES) {
      try {
        // Fetch up to 100 results per query
        const response = await axios.get(BA_BASE, {
          params: {
            was: searchQuery,
            size: 100,
            veroeffentlichtseit: 7, // Last 7 days
          },
          headers: {
            'X-API-Key': BA_API_KEY,
          },
          timeout: 15000,
        });

        const offers = response.data?.stellenangebote || [];
        
        for (const offer of offers) {
          const refnr = offer.refnr;
          if (!refnr || seenIds.has(refnr)) continue;
          seenIds.add(refnr);

          const arbeitsort = offer.arbeitsort || {};
          const location = [arbeitsort.ort, arbeitsort.region]
            .filter(Boolean)
            .join(', ') || 'Deutschland';

          const titleText = offer.titel || '';
          const beruf = offer.beruf || '';

          allJobs.push({
            external_id: refnr,
            source: 'ba',
            source_url: `https://www.arbeitsagentur.de/jobsuche/suche?id=${refnr}`,
            title: titleText,
            company: offer.arbeitgeber || 'Unbekannt',
            location,
            description: [offer.titel, beruf, offer.branche].filter(Boolean).join(' – '),
            requirements: [],
            employment_type: this.mapArbeitszeit(offer.arbeitszeit),
            contract_type: offer.befristung === 1 ? 'befristet' : offer.befristung === 0 ? 'unbefristet' : undefined,
            salary_min: undefined,
            salary_max: undefined,
            remote_type: offer.homeoffice ? 'hybrid' : 'vor_ort',
            skills: extractSkills(titleText + ' ' + beruf),
            category: beruf,
            industry: offer.branche,
            published_at: offer.eintrittsdatum || offer.aktuelleVeroeffentlichungsdatum,
            expires_at: undefined,
          });
        }

        console.log(`[BA] "${searchQuery}" → ${offers.length} offers`);

        // Small delay between queries to be polite
        await new Promise(r => setTimeout(r, 300));
      } catch (err: any) {
        const msg = `Query "${searchQuery}" failed: ${err.message?.substring(0, 100)}`;
        errors.push(msg);
        console.warn(`[BA] ${msg}`);
      }
    }

    return { jobs: allJobs, totalAvailable: allJobs.length, errors };
  }

  private mapArbeitszeit(az: any): string | undefined {
    if (!az) return undefined;
    if (az.vz) return 'vollzeit';
    if (az.tz) return 'teilzeit';
    if (az.mj) return 'minijob';
    if (az.snw) return 'schicht';
    return undefined;
  }
}
