/**
 * Auto-Discovery Script – Findet Firmen via Google Search
 * Kein SerpAPI nötig! Nutzt Google direkt.
 * 
 * Run: npx tsx src/discover-companies.ts
 * 
 * Schreibt gefundene Firmen direkt in die DB (lokal oder remote).
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { pool } from './db';
import { execute, query } from './db';

// Rate limit: Google blockt bei zu vielen Requests
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
const randomDelay = () => delay(3000 + Math.random() * 4000); // 3-7s random

// Google Search with real browser UA
async function googleSearch(q: string, start = 0): Promise<string[]> {
  try {
    const { data } = await axios.get('https://www.google.com/search', {
      params: { q, start, num: 100 },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
      },
      timeout: 10000,
    });

    const $ = cheerio.load(data);
    const urls: string[] = [];

    // Extract all URLs from search results
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      urls.push(href);
    });

    // Also extract from cite elements and raw text
    const text = $.html();
    const urlMatches = text.match(/https?:\/\/[^\s"'<>]+/g) || [];
    urls.push(...urlMatches);

    return urls;
  } catch (err: any) {
    if (err.response?.status === 429) {
      console.log('  ⏳ Google Rate Limit – warte 30s...');
      await delay(30000);
      return googleSearch(q, start); // retry
    }
    console.error(`  ✗ Search error: ${err.message?.substring(0, 80)}`);
    return [];
  }
}

// ===== ATS-specific slug extractors =====

function extractPersonioSlugs(urls: string[]): Set<string> {
  const slugs = new Set<string>();
  for (const url of urls) {
    const m = url.match(/https?:\/\/([a-z0-9_-]+)\.jobs\.personio\.(de|com)/i);
    if (m && m[1] !== 'www' && m[1].length > 1) {
      slugs.add(m[1].toLowerCase());
    }
  }
  return slugs;
}

function extractGreenhouseSlugs(urls: string[]): Set<string> {
  const slugs = new Set<string>();
  for (const url of urls) {
    const m = url.match(/boards\.greenhouse\.io\/([a-z0-9_-]+)/i);
    if (m && !['embed', 'api', 'www'].includes(m[1]) && m[1].length > 1) {
      slugs.add(m[1].toLowerCase());
    }
    // Also check boards-api
    const m2 = url.match(/boards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9_-]+)/i);
    if (m2) slugs.add(m2[1].toLowerCase());
  }
  return slugs;
}

function extractLeverSlugs(urls: string[]): Set<string> {
  const slugs = new Set<string>();
  for (const url of urls) {
    const m = url.match(/jobs\.lever\.co\/([a-z0-9_-]+)/i);
    if (m && !['api', 'www', 'postings'].includes(m[1]) && m[1].length > 1) {
      slugs.add(m[1].toLowerCase());
    }
  }
  return slugs;
}

function extractSmartRecruitersSlugs(urls: string[]): Set<string> {
  const slugs = new Set<string>();
  for (const url of urls) {
    const m = url.match(/careers\.smartrecruiters\.com\/([a-zA-Z0-9_-]+)/i);
    if (m && !['api', 'www', 'docs', 'help'].includes(m[1]) && m[1].length > 1) {
      slugs.add(m[1]); // Keep original case for SR
    }
  }
  return slugs;
}

function extractRecruiteeSlugs(urls: string[]): Set<string> {
  const slugs = new Set<string>();
  for (const url of urls) {
    const m = url.match(/https?:\/\/([a-z0-9_-]+)\.recruitee\.com/i);
    if (m && !['www', 'api', 'app', 'docs', 'help', 'support', 'blog'].includes(m[1]) && m[1].length > 1) {
      slugs.add(m[1].toLowerCase());
    }
  }
  return slugs;
}

// ===== DB Insert =====

async function insertDiscoveredCompany(
  name: string,
  ats_system: string,
  ats_identifier: string,
  ats_feed_url: string,
  careers_url: string,
): Promise<boolean> {
  try {
    await execute(`
      INSERT INTO companies (name, ats_system, ats_identifier, ats_feed_url, careers_url, crawl_status)
      VALUES ($1, $2, $3, $4, $5, 'active')
      ON CONFLICT (name) DO NOTHING
    `, [name, ats_system, ats_identifier, ats_feed_url, careers_url]);
    return true;
  } catch {
    return false;
  }
}

// ===== Discovery per ATS =====

async function discoverPersonio(): Promise<number> {
  console.log('\n🔍 Discovering Personio companies...');
  const allSlugs = new Set<string>();

  const queries = [
    'site:jobs.personio.de',
    'site:jobs.personio.de Berlin',
    'site:jobs.personio.de München',
    'site:jobs.personio.de Hamburg',
    'site:jobs.personio.de Frankfurt',
    'site:jobs.personio.de Köln',
    'site:jobs.personio.de Stuttgart',
    'site:jobs.personio.de Düsseldorf',
    'site:jobs.personio.com',
    'site:jobs.personio.de GmbH',
    'site:jobs.personio.de AG',
    'site:jobs.personio.de Software',
    'site:jobs.personio.de Engineering',
    'site:jobs.personio.de Marketing',
    'site:jobs.personio.de Sales',
    'site:jobs.personio.de Pflege',
  ];

  for (const q of queries) {
    console.log(`  Searching: ${q}`);
    const urls = await googleSearch(q);
    const slugs = extractPersonioSlugs(urls);
    for (const s of slugs) allSlugs.add(s);
    console.log(`  → ${slugs.size} new slugs (total: ${allSlugs.size})`);
    await randomDelay();
  }

  // Insert into DB
  let inserted = 0;
  for (const slug of allSlugs) {
    const name = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const ok = await insertDiscoveredCompany(
      `${name} (Personio)`, 'personio', slug,
      `https://${slug}.jobs.personio.de/xml?language=de`,
      `https://${slug}.jobs.personio.de`
    );
    if (ok) inserted++;
  }

  console.log(`✅ Personio: ${allSlugs.size} found, ${inserted} new inserted`);
  return inserted;
}

async function discoverGreenhouse(): Promise<number> {
  console.log('\n🔍 Discovering Greenhouse companies...');
  const allSlugs = new Set<string>();

  const queries = [
    'site:boards.greenhouse.io Germany',
    'site:boards.greenhouse.io Berlin',
    'site:boards.greenhouse.io München Munich',
    'site:boards.greenhouse.io Hamburg',
    'site:boards.greenhouse.io Deutschland',
    'site:boards.greenhouse.io GmbH',
    'site:boards.greenhouse.io "Software Engineer"',
    'site:boards.greenhouse.io "Product Manager"',
    'site:boards.greenhouse.io remote Germany',
  ];

  for (const q of queries) {
    console.log(`  Searching: ${q}`);
    const urls = await googleSearch(q);
    const slugs = extractGreenhouseSlugs(urls);
    for (const s of slugs) allSlugs.add(s);
    console.log(`  → ${slugs.size} new slugs (total: ${allSlugs.size})`);
    await randomDelay();
  }

  let inserted = 0;
  for (const slug of allSlugs) {
    const name = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const ok = await insertDiscoveredCompany(
      `${name} (GH)`, 'greenhouse', slug,
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`,
      `https://boards.greenhouse.io/${slug}`
    );
    if (ok) inserted++;
  }

  console.log(`✅ Greenhouse: ${allSlugs.size} found, ${inserted} new inserted`);
  return inserted;
}

async function discoverLever(): Promise<number> {
  console.log('\n🔍 Discovering Lever companies...');
  const allSlugs = new Set<string>();

  const queries = [
    'site:jobs.lever.co Germany',
    'site:jobs.lever.co Berlin',
    'site:jobs.lever.co München Munich',
    'site:jobs.lever.co Hamburg',
    'site:jobs.lever.co Deutschland',
    'site:jobs.lever.co GmbH',
    'site:jobs.lever.co remote',
  ];

  for (const q of queries) {
    console.log(`  Searching: ${q}`);
    const urls = await googleSearch(q);
    const slugs = extractLeverSlugs(urls);
    for (const s of slugs) allSlugs.add(s);
    console.log(`  → ${slugs.size} new slugs (total: ${allSlugs.size})`);
    await randomDelay();
  }

  let inserted = 0;
  for (const slug of allSlugs) {
    const name = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const ok = await insertDiscoveredCompany(
      `${name} (Lever)`, 'lever', slug,
      `https://api.lever.co/v0/postings/${slug}?mode=json`,
      `https://jobs.lever.co/${slug}`
    );
    if (ok) inserted++;
  }

  console.log(`✅ Lever: ${allSlugs.size} found, ${inserted} new inserted`);
  return inserted;
}

async function discoverSmartRecruiters(): Promise<number> {
  console.log('\n🔍 Discovering SmartRecruiters companies...');
  const allSlugs = new Set<string>();

  const queries = [
    'site:careers.smartrecruiters.com Germany',
    'site:careers.smartrecruiters.com Deutschland',
    'site:careers.smartrecruiters.com Berlin',
    'site:careers.smartrecruiters.com München',
    'site:careers.smartrecruiters.com GmbH',
  ];

  for (const q of queries) {
    console.log(`  Searching: ${q}`);
    const urls = await googleSearch(q);
    const slugs = extractSmartRecruitersSlugs(urls);
    for (const s of slugs) allSlugs.add(s);
    console.log(`  → ${slugs.size} new slugs (total: ${allSlugs.size})`);
    await randomDelay();
  }

  let inserted = 0;
  for (const slug of allSlugs) {
    const name = slug.replace(/([A-Z])/g, ' $1').trim();
    const ok = await insertDiscoveredCompany(
      `${name} (SR)`, 'smartrecruiters', slug,
      `https://api.smartrecruiters.com/v1/companies/${slug}/postings`,
      `https://careers.smartrecruiters.com/${slug}`
    );
    if (ok) inserted++;
  }

  console.log(`✅ SmartRecruiters: ${allSlugs.size} found, ${inserted} new inserted`);
  return inserted;
}

async function discoverRecruitee(): Promise<number> {
  console.log('\n🔍 Discovering Recruitee companies...');
  const allSlugs = new Set<string>();

  const queries = [
    'site:recruitee.com Germany',
    'site:recruitee.com Berlin',
    'site:recruitee.com Deutschland',
    'site:recruitee.com GmbH',
  ];

  for (const q of queries) {
    console.log(`  Searching: ${q}`);
    const urls = await googleSearch(q);
    const slugs = extractRecruiteeSlugs(urls);
    for (const s of slugs) allSlugs.add(s);
    console.log(`  → ${slugs.size} new slugs (total: ${allSlugs.size})`);
    await randomDelay();
  }

  let inserted = 0;
  for (const slug of allSlugs) {
    const name = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const ok = await insertDiscoveredCompany(
      `${name} (RC)`, 'recruitee', slug,
      `https://${slug}.recruitee.com/api/offers`,
      `https://${slug}.recruitee.com`
    );
    if (ok) inserted++;
  }

  console.log(`✅ Recruitee: ${allSlugs.size} found, ${inserted} new inserted`);
  return inserted;
}

// ===== Main =====

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  StaffRadar – Company Auto-Discovery     ║');
  console.log('╚══════════════════════════════════════════╝');

  const existing = await query<{ count: string }>('SELECT COUNT(*) as count FROM companies');
  console.log(`\nAktuell: ${existing[0]?.count || 0} Firmen in der DB\n`);

  let total = 0;
  total += await discoverPersonio();
  total += await discoverGreenhouse();
  total += await discoverLever();
  total += await discoverSmartRecruiters();
  total += await discoverRecruitee();

  const after = await query<{ count: string }>('SELECT COUNT(*) as count FROM companies');
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  Discovery abgeschlossen!                ║`);
  console.log(`║  ${total} neue Firmen gefunden              `);
  console.log(`║  Gesamt: ${after[0]?.count || 0} Firmen in der DB        `);
  console.log(`╚══════════════════════════════════════════╝`);

  await pool.end();
}

main().catch(err => { console.error('❌ Discovery failed:', err); process.exit(1); });
