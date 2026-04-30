/**
 * Bundesagentur für Arbeit – Job Collector
 * API: https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs
 * Public API Key: jobboerse-jobsuche
 * AGGRESSIVE: Paginated collection across all major categories
 */
import axios from 'axios';
import type { Collector, CollectorResult } from '../types';

const BA_BASE = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs';
const BA_API_KEY = process.env.BA_API_KEY || 'jobboerse-jobsuche';

// Comprehensive search categories covering the entire German job market
const SEARCH_QUERIES = [
  // Healthcare / Pflege
  'Pflege', 'Krankenpflege', 'Altenpflege', 'Intensivpflege', 'Pflegefachkraft',
  'Pflegehelfer', 'Gesundheitspfleger', 'Krankenschwester', 'Pflegedienstleitung',
  'Rettungssanitäter', 'Physiotherapeut', 'Ergotherapeut',
  // IT & Tech
  'IT', 'Softwareentwicklung', 'Informatik', 'Programmierer', 'Webentwickler',
  'DevOps', 'Data Scientist', 'IT-Administrator', 'SAP Berater',
  'Systemadministrator', 'IT-Projektmanager', 'Cloud Engineer',
  // Engineering
  'Ingenieur', 'Maschinenbau', 'Elektrotechnik', 'Bauingenieur',
  'Verfahrenstechnik', 'Mechatronik', 'Fahrzeugtechnik', 'Produktionsingenieur',
  // Business & Finance
  'Marketing', 'Vertrieb', 'Sales', 'Buchhaltung', 'Controlling',
  'Finanzen', 'Steuerberater', 'Wirtschaftsprüfer', 'Einkauf',
  'Unternehmensberatung', 'Business Analyst',
  // Logistics & Transport
  'Logistik', 'Lager', 'Transport', 'Spedition', 'Berufskraftfahrer',
  'Lagerist', 'Supply Chain', 'Kommissionierer',
  // Trades & Craft
  'Handwerk', 'Elektriker', 'Mechaniker', 'Schlosser', 'Schweißer',
  'Installateur', 'Klempner', 'Maler', 'Tischler', 'Dachdecker',
  'Anlagenmechaniker', 'Industriemechaniker', 'KFZ-Mechatroniker',
  // Food & Hospitality
  'Gastronomie', 'Hotel', 'Koch', 'Restaurantfachmann', 'Bäcker',
  'Konditor', 'Servicekraft',
  // Office & Admin
  'Kaufmann', 'Verwaltung', 'Büro', 'Sekretariat', 'Sachbearbeiter',
  'Assistenz', 'Empfang', 'Bürokaufmann',
  // Social & Education
  'Erzieher', 'Sozialarbeiter', 'Pädagogik', 'Lehrer', 'Sozialpädagoge',
  'Kinderpfleger', 'Heilerziehungspfleger',
  // Medical
  'Arzt', 'Medizin', 'Pharma', 'Zahnarzt', 'Apotheker',
  'Medizinische Fachangestellte', 'Laborant', 'Radiologie',
  // Construction
  'Architektur', 'Bauwesen', 'Bauleiter', 'Maurer', 'Betonbauer',
  'Straßenbauer', 'Tiefbau', 'Hochbau',
  // Management & HR
  'Projektmanagement', 'Consulting', 'Personal', 'HR', 'Recruiting',
  'Geschäftsführer', 'Teamleiter', 'Abteilungsleiter',
  // Industry & Production
  'Produktion', 'Fertigung', 'Qualitätssicherung', 'Monteur',
  'Facharbeiter', 'CNC', 'Zerspanungsmechaniker', 'Werkzeugmacher',
  // Science & Research
  'Chemiker', 'Biologe', 'Physiker', 'Forschung',
  // Legal
  'Rechtsanwalt', 'Jurist', 'Notar', 'Rechtsfachwirt',
  // Creative & Media
  'Designer', 'Grafiker', 'Mediengestalter', 'Redakteur', 'Journalist',
  // Security
  'Sicherheit', 'Werkschutz', 'Objektschutz',
  // Cleaning & Facility
  'Reinigung', 'Gebäudereiniger', 'Facility Management', 'Hausmeister',
];

const SKILL_MAP: Record<string, string> = {
  'pflege': 'Pflege', 'intensivpflege': 'Intensivpflege', 'altenpflege': 'Altenpflege',
  'krankenpflege': 'Krankenpflege', 'pflegedokumentation': 'Pflegedokumentation',
  'sap': 'SAP', 'java': 'Java', 'python': 'Python', 'react': 'React',
  'angular': 'Angular', 'typescript': 'TypeScript', 'javascript': 'JavaScript',
  'aws': 'AWS', 'azure': 'Azure', 'docker': 'Docker', 'kubernetes': 'Kubernetes',
  'sql': 'SQL', 'node': 'Node.js', 'c++': 'C++', 'c#': 'C#', '.net': '.NET',
  'maschinenbau': 'Maschinenbau', 'elektrotechnik': 'Elektrotechnik',
  'projektmanagement': 'Projektmanagement', 'scrum': 'Scrum', 'agile': 'Agile',
  'marketing': 'Marketing', 'vertrieb': 'Vertrieb', 'seo': 'SEO',
  'buchhaltung': 'Buchhaltung', 'controlling': 'Controlling', 'datev': 'DATEV',
  'linux': 'Linux', 'devops': 'DevOps', 'terraform': 'Terraform',
  'excel': 'Excel', 'powerpoint': 'PowerPoint', 'office': 'MS Office',
  'cnc': 'CNC', 'cad': 'CAD', 'solidworks': 'SolidWorks', 'autocad': 'AutoCAD',
  'php': 'PHP', 'vue': 'Vue.js', 'git': 'Git', 'jira': 'Jira',
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

    console.log(`[BA] Starting collection with ${SEARCH_QUERIES.length} queries...`);

    for (const searchQuery of SEARCH_QUERIES) {
      try {
        // Paginate: fetch up to 5 pages (500 results) per query
        const MAX_PAGES = 5;
        for (let page = 1; page <= MAX_PAGES; page++) {
          const response = await axios.get(BA_BASE, {
            params: {
              was: searchQuery,
              size: 100,
              page: page,
              veroeffentlichtseit: 7,
            },
            headers: {
              'X-API-Key': BA_API_KEY,
            },
            timeout: 15000,
          });

          const offers = response.data?.stellenangebote || [];
          if (offers.length === 0) break; // No more pages

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

          // If we got less than 100, no more pages
          if (offers.length < 100) break;
          
          // Small delay between pages
          await new Promise(r => setTimeout(r, 200));
        }

        console.log(`[BA] "${searchQuery}" → collected (total so far: ${seenIds.size})`);

        // Small delay between queries to be polite
        await new Promise(r => setTimeout(r, 250));
      } catch (err: any) {
        const msg = `Query "${searchQuery}" failed: ${err.response?.status || ''} ${err.message?.substring(0, 100)}`;
        if (err.response?.data) {
          console.warn(`[BA] ${msg} | Body: ${JSON.stringify(err.response.data).substring(0, 200)}`);
        } else {
          console.warn(`[BA] ${msg}`);
        }
        errors.push(msg);
      }
    }

    console.log(`[BA] TOTAL: ${allJobs.length} unique jobs from ${SEARCH_QUERIES.length} queries`);
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
