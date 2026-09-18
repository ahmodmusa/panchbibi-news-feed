import { TIER_A_KEYWORDS, TIER_B_KEYWORDS } from './keywords.js';
import { RawNewsItem, NewsItem } from './types.js';
import { cleanTitle, canonicalizeUrl } from './normalize.js';

export interface FilterResult {
  accepted: boolean;
  item?: NewsItem;
  reason?: string;
}

/**
 * Check whether a text contains any of the given keywords (case-insensitive).
 */
function matchesAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Validate and filter a raw news item for Panchbibi relevance.
 */
export function filterAndValidate(raw: RawNewsItem, discoveredAt: string): FilterResult {
  // 1. Basic validation
  if (!raw.title || typeof raw.title !== 'string') {
    return { accepted: false, reason: 'Empty or invalid title' };
  }

  const title = cleanTitle(raw.title);
  if (title.length < 6) {
    return { accepted: false, reason: 'Title too short' };
  }

  if (/^<[a-z]+>.*<\/[a-z]+>$/i.test(title)) {
    return { accepted: false, reason: 'Title looks like raw HTML tag' };
  }

  if (!raw.url || typeof raw.url !== 'string') {
    return { accepted: false, reason: 'Empty URL' };
  }

  const canonicalUrl = canonicalizeUrl(raw.url);
  if (!canonicalUrl) {
    return { accepted: false, reason: 'Invalid or unsupported URL protocol' };
  }

  if (!raw.source || typeof raw.source !== 'string') {
    return { accepted: false, reason: 'Missing source' };
  }

  // 2. Relevance determination
  // Check title and URL slug
  const titleAndSlug = `${title} ${canonicalUrl}`;

  let locationMatch: 'panchbibi' | 'joypurhat' | 'keyword' | null = null;

  // Check Tier A (Direct Panchbibi)
  if (matchesAny(titleAndSlug, TIER_A_KEYWORDS)) {
    locationMatch = 'panchbibi';
  }
  // Check Tier B (Panchbibi unions, localities, institutions)
  else if (matchesAny(titleAndSlug, TIER_B_KEYWORDS)) {
    locationMatch = 'keyword';
  }

  // Tier C: If neither Tier A nor Tier B matches, REJECT
  // Do NOT include generic Joypurhat district stories unless Panchbibi is explicitly involved
  if (!locationMatch) {
    return { accepted: false, reason: 'Generic Joypurhat or unrelated news (Panchbibi not involved)' };
  }

  // 3. ID generation: source-slug-hash
  const urlObj = new URL(canonicalUrl);
  const pathPart = urlObj.pathname.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').slice(-30);
  const sourcePart = raw.source.toLowerCase().replace(/[^a-z0-9]/g, '');
  const id = `${sourcePart}-${pathPart || Date.now().toString(36)}`;

  return {
    accepted: true,
    item: {
      id,
      title,
      url: canonicalUrl,
      source: raw.source,
      publishedAt: raw.publishedAt || null,
      discoveredAt,
      locationMatch,
      sourceType: raw.sourceType
    }
  };
}
