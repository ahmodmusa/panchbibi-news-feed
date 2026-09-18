import { NewsItem } from './types.js';

/**
 * Deduplicate news items based on:
 * 1. canonicalized URL
 * 2. source + normalized headline
 *
 * Merges existing feed items with newly discovered items,
 * preserving older items while updating any newer metadata.
 */
export function deduplicateAndMerge(
  existingItems: NewsItem[],
  newItems: NewsItem[],
  maxItems: number = 100,
  maxAgeDays: number = 90
): NewsItem[] {
  const seenUrls = new Set<string>();
  const seenSourceTitles = new Set<string>();
  const merged: NewsItem[] = [];

  // Sort helper: prioritize publishedAt if available, otherwise discoveredAt
  const getTime = (item: NewsItem): number => {
    if (item.publishedAt) {
      const p = new Date(item.publishedAt).getTime();
      if (!isNaN(p)) return p;
    }
    const d = new Date(item.discoveredAt).getTime();
    return isNaN(d) ? 0 : d;
  };

  // Combine items: new items first so their fresh metadata takes precedence if URL matches
  const allCandidates = [...newItems, ...existingItems];

  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  for (const item of allCandidates) {
    const canonicalUrl = item.url;
    const normalizedHeadline = item.title
      .toLowerCase()
      .replace(/[\s\p{P}]+/gu, ' ')
      .trim();
    const sourceTitleKey = `${item.source.toLowerCase()}::${normalizedHeadline}`;

    if (seenUrls.has(canonicalUrl) || seenSourceTitles.has(sourceTitleKey)) {
      continue;
    }

    // Check retention window (only filter out if timestamp is genuinely older than maxAge)
    const timestamp = getTime(item);
    if (timestamp > 0 && now - timestamp > maxAgeMs) {
      continue;
    }

    seenUrls.add(canonicalUrl);
    seenSourceTitles.add(sourceTitleKey);
    merged.push(item);
  }

  // Sort newest first
  merged.sort((a, b) => getTime(b) - getTime(a));

  // Cap to maxItems
  return merged.slice(0, maxItems);
}
