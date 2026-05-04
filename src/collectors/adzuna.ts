/**
 * Adzuna API Collector – Maximum coverage through query×city rotation
 * 
 * Strategy: Instead of searching "Pflege" (returns same 1000 results),
 * we search "Pflege" in each major German city. This surfaces different
 * jobs per location, dramatically increasing unique results.
 * 
 * Rate limits (free plan):
 * - 25 requests/minute → 2.5s delay
 * - 250 requests/day → we use 240
 * 
 * Rotation: Each run cycles through query×city combos.
 * State is persisted so next run continues where we left off.
 * Full cycle covers 60 queries × 80 cities = 4800 combos over ~20 days.
 */
import axios, { AxiosError } from 'axios';
import fs from 'fs';
import path from 'path';
import type { Collector, CollectorResult } from '../types';

const APP_ID = process.env.ADZUNA_APP_ID;
const API_KEY = process.env.ADZUNA_API_KEY;

const DELAY_MS = 2500;
const MAX_REQUESTS = 240;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 4000;
const MAX_PAGES_PER_COMBO = 5;  // 250 jobs per query×city combo
const STATE_FILE = '/tmp/adzuna-rotation-state.json';

// ===== Search queries =====
const QUERIES = [
  // Pflege/Gesundheit
  'Pflege', 'Pflegefachkraft', 'Krankenpflege', 'Altenpflege', 'Pflegehelfer',
  'Gesundheitspfleger', 'Intensivpflege',
  // Medizin
  'Arzt', 'Medizin', 'Pharma', 'Apotheker', 'Therapeut', 'Zahnarzt',
  // IT/Software
  'Software Entwickler', 'Informatik', 'DevOps', 'Data Engineer',
  'Programmierer', 'SAP', 'Cloud', 'Frontend', 'Backend',
  // Ingenieure
  'Ingenieur', 'Maschinenbau', 'Elektrotechnik', 'Bauingenieur',
  'Verfahrenstechnik', 'Wirtschaftsingenieur',
  // Kaufmännisch
  'Kaufmann', 'Sachbearbeiter', 'Bürokaufmann', 'Verwaltung',
  // Marketing/Vertrieb
  'Marketing', 'Vertrieb', 'Sales', 'Online Marketing',
  // Logistik
  'Logistik', 'Lager', 'Transport', 'Spedition', 'Disponent',
  // Handwerk
  'Elektriker', 'Mechaniker', 'Schlosser', 'Schweißer',
  'Tischler', 'Maler', 'Installateur',
  // Gastronomie
  'Koch', 'Hotel', 'Gastronomie', 'Restaurant',
  // Finanzen
  'Buchhaltung', 'Controlling', 'Finanzen', 'Steuerberater',
  // Soziales/Bildung
  'Erzieher', 'Sozialarbeiter', 'Pädagogik', 'Lehrer',
  // Produktion
  'Produktion', 'Monteur', 'CNC', 'Fertigung',
  // HR/Beratung
  'Recruiting', 'Personalreferent', 'Consulting',
  // Weitere
  'Reinigung', 'Facility',
  'Sicherheit', 'Werkschutz',
  'Berufskraftfahrer', 'Lkw Fahrer',
  'Kundenservice', 'Call Center',
];

// ===== German cities for location rotation =====
const CITIES = [
  // Top 20 by population
  'Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt am Main',
  'Stuttgart', 'Düsseldorf', 'Leipzig', 'Dortmund', 'Essen',
  'Bremen', 'Dresden', 'Hannover', 'Nürnberg', 'Duisburg',
  'Bochum', 'Wuppertal', 'Bielefeld', 'Bonn', 'Münster',
  // 21-40
  'Mannheim', 'Karlsruhe', 'Augsburg', 'Wiesbaden', 'Aachen',
  'Braunschweig', 'Kiel', 'Chemnitz', 'Halle', 'Magdeburg',
  'Freiburg', 'Krefeld', 'Lübeck', 'Erfurt', 'Mainz',
  'Rostock', 'Kassel', 'Hagen', 'Potsdam', 'Saarbrücken',
  // 41-60
  'Oldenburg', 'Osnabrück', 'Leverkusen', 'Heidelberg', 'Darmstadt',
  'Solingen', 'Regensburg', 'Paderborn', 'Würzburg', 'Ingolstadt',
  'Ulm', 'Heilbronn', 'Göttingen', 'Wolfsburg', 'Recklinghausen',
  'Pforzheim', 'Koblenz', 'Jena', 'Trier', 'Cottbus',
  // 61-80 (broader coverage)
  'Schwerin', 'Flensburg', 'Konstanz', 'Passau', 'Bayreuth',
  'Gera', 'Düren', 'Ludwigshafen', 'Hamm', 'Oberhausen',
  'Remscheid', 'Offenbach', 'Siegen', 'Hildesheim', 'Salzgitter',
  'Neubrandenburg', 'Plauen', 'Marburg', 'Gütersloh', 'Moers',
];

// ===== State management =====
interface RotationState {
  lastComboIndex: number;   // Where we left off in the combos array
  lastRun: string;          // ISO timestamp
  totalJobsCollected: number;
}

function loadState(): RotationState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch {}
  return { lastComboIndex: 0, lastRun: '', totalJobsCollected: 0 };
}

function saveState(state: RotationState) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.warn('[Adzuna] Could not save state:', err);
  }
}

// ===== Build all query×city combinations =====
function buildCombos(): { query: string; city: string }[] {
  const combos: { query: string; city: string }[] = [];
  for (const query of QUERIES) {
    // First: query without city (catches remote/national jobs)
    combos.push({ query, city: '' });
    // Then: query in each city
    for (const city of CITIES) {
      combos.push({ query, city });
    }
  }
  return combos;
}

// ===== Fetch with retry =====
async function fetchWithRetry(url: string, params: Record<string, any>): Promise<any> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data } = await axios.get(url, { params, timeout: 20000 });
      return data;
    } catch (err) {
      const axErr = err as AxiosError;
      const status = axErr.response?.status;

      if ((status === 503 || status === 429) && attempt < MAX_RETRIES) {
        const delay = status === 429 ? 60000 : RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(`[Adzuna] ${status} → Retry ${attempt + 1}/${MAX_RETRIES} in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ===== Main Collector =====
export class AdzunaCollector implements Collector {
  name = 'Adzuna';
  source = 'adzuna';

  async collect(): Promise<CollectorResult> {
    if (!APP_ID || !API_KEY) return { jobs: [], errors: ['Adzuna not configured'] };

    const allJobs: CollectorResult['jobs'] = [];
    const errors: string[] = [];
    const seenIds = new Set<string>();
    let requestCount = 0;

    const state = loadState();
    const combos = buildCombos();
    const totalCombos = combos.length;
    let comboIndex = state.lastComboIndex % totalCombos;

    console.log(`[Adzuna] Starting at combo ${comboIndex}/${totalCombos} (${QUERIES.length} queries × ${CITIES.length + 1} locations)`);
    console.log(`[Adzuna] Budget: ${MAX_REQUESTS} requests, ${MAX_PAGES_PER_COMBO} pages/combo`);

    const startIndex = comboIndex;
    let combosProcessed = 0;

    while (requestCount < MAX_REQUESTS) {
      const combo = combos[comboIndex];
      const label = combo.city ? `"${combo.query}" in ${combo.city}` : `"${combo.query}" (DE)`;

      try {
        let queryNewJobs = 0;

        for (let page = 1; page <= MAX_PAGES_PER_COMBO; page++) {
          if (requestCount >= MAX_REQUESTS) break;

          await sleep(DELAY_MS);

          const params: Record<string, any> = {
            app_id: APP_ID,
            app_key: API_KEY,
            results_per_page: 50,
            what: combo.query,
            sort_by: 'date',
            max_days_old: 30,
          };
          if (combo.city) params.where = combo.city;

          const data = await fetchWithRetry(
            `https://api.adzuna.com/v1/api/jobs/de/search/${page}`,
            params
          );
          requestCount++;

          const results = data.results || [];
          for (const job of results) {
            if (seenIds.has(String(job.id))) continue;
            seenIds.add(String(job.id));

            allJobs.push({
              external_id: String(job.id),
              source: 'adzuna',
              source_url: job.redirect_url,
              title: job.title,
              company: job.company?.display_name || 'Unbekannt',
              location: job.location?.display_name || 'Deutschland',
              description: job.description,
              employment_type: job.contract_time === 'full_time' ? 'vollzeit' :
                job.contract_time === 'part_time' ? 'teilzeit' : undefined,
              contract_type: job.contract_type === 'permanent' ? 'unbefristet' :
                job.contract_type === 'contract' ? 'befristet' : undefined,
              salary_min: job.salary_min ? Math.round(job.salary_min) : undefined,
              salary_max: job.salary_max ? Math.round(job.salary_max) : undefined,
              skills: [],
              published_at: job.created,
            });
            queryNewJobs++;
          }

          // Stop pagination if depleted
          if (results.length < 50) break;
        }

        if (queryNewJobs > 0) {
          console.log(`[Adzuna] ${label} → ${queryNewJobs} new (total: ${seenIds.size})`);
        }
      } catch (err: any) {
        const status = err.response?.status || '';
        errors.push(`${label}: ${status} ${err.message?.substring(0, 60)}`);
        console.error(`[Adzuna] ✗ ${label}: ${status}`);

        if (status === 429) {
          console.log('[Adzuna] 429 after retries, stopping to preserve budget');
          break;
        }
      }

      combosProcessed++;
      comboIndex = (comboIndex + 1) % totalCombos;

      // If we've cycled back to start, we're done
      if (comboIndex === startIndex) {
        console.log('[Adzuna] Full rotation completed!');
        break;
      }
    }

    // Save state for next run
    saveState({
      lastComboIndex: comboIndex,
      lastRun: new Date().toISOString(),
      totalJobsCollected: state.totalJobsCollected + allJobs.length,
    });

    const progress = ((comboIndex / totalCombos) * 100).toFixed(1);
    console.log(`[Adzuna] ✅ ${allJobs.length} unique jobs (${requestCount} requests, ${combosProcessed} combos)`);
    console.log(`[Adzuna] 📊 Rotation: ${progress}% (combo ${comboIndex}/${totalCombos}), lifetime total: ${state.totalJobsCollected + allJobs.length}`);
    return { jobs: allJobs, totalAvailable: allJobs.length, errors };
  }
}
