/**
 * Deduplication Engine
 * Creates consistent hashes for jobs to detect duplicates across sources.
 */
import { createHash } from 'crypto';

/**
 * Normalize text for dedup comparison:
 * - Lowercase
 * - Remove gender suffixes (m/w/d), (f/m/d), etc.
 * - Remove special characters
 * - Collapse whitespace
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\(m\/w\/d\)/gi, '')
    .replace(/\(w\/m\/d\)/gi, '')
    .replace(/\(f\/m\/d\)/gi, '')
    .replace(/\(d\/f\/m\)/gi, '')
    .replace(/\(all\s*genders?\)/gi, '')
    .replace(/\(m\/f\/d\)/gi, '')
    .replace(/\*:?innen/g, '')
    .replace(/[^a-zäöüß0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate a dedup hash for a job.
 * Hash = SHA256(normalized_title | normalized_company | normalized_city)
 * 
 * City is extracted from location (first component before comma)
 * to avoid mismatches like "Berlin, Germany" vs "Berlin"
 */
export function generateDedupHash(title: string, company: string, location?: string): string {
  const normTitle = normalize(title);
  const normCompany = normalize(company);
  // Extract just the city from location
  const city = normalize((location || '').split(',')[0].split('(')[0]);

  const input = `${normTitle}|${normCompany}|${city}`;
  return createHash('sha256').update(input).digest('hex').substring(0, 16);
}

/**
 * Check if two jobs are likely duplicates based on fuzzy matching.
 * Used as a secondary check when hashes don't match but titles are very similar.
 */
export function isFuzzyDuplicate(
  a: { title: string; company: string },
  b: { title: string; company: string }
): boolean {
  const normA = normalize(a.title);
  const normB = normalize(b.title);
  const compA = normalize(a.company);
  const compB = normalize(b.company);

  // Company must match
  if (compA !== compB && !compA.includes(compB) && !compB.includes(compA)) {
    return false;
  }

  // Title similarity (Jaccard index on words)
  const wordsA = new Set(normA.split(' ').filter(w => w.length > 2));
  const wordsB = new Set(normB.split(' ').filter(w => w.length > 2));
  
  if (wordsA.size === 0 || wordsB.size === 0) return false;

  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  const similarity = intersection.size / union.size;

  return similarity >= 0.7;
}
