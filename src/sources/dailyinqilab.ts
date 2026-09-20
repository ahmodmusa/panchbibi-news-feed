import * as cheerio from 'cheerio';
import { GoogleDecoder } from 'google-news-url-decoder';
import { RawNewsItem, SourceAdapter } from '../types.js';
import { fetchText } from '../http.js';
import { cleanTitle, canonicalizeUrl, parseBanglaDate } from '../normalize.js';
import { TIER_A_KEYWORDS, TIER_B_KEYWORDS } from '../keywords.js';

const decoder = new GoogleDecoder();

function matchesPanchbibiKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  for (const kw of TIER_A_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return true;
  }
  for (const kw of TIER_B_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return true;
  }
  return false;
}

export const dailyinqilabAdapter: SourceAdapter = {
  name: 'Daily Inqilab',
  sourceType: 'search',

  async fetch(): Promise<RawNewsItem[]> {
    const queries = [
      'site:dailyinqilab.com "পাঁচবিবি"',
      'site:dailyinqilab.com পাঁচবিবি'
    ];

    const results: RawNewsItem[] = [];
    const seenUrls = new Set<string>();

    for (const q of queries) {
      try {
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=bn&gl=BD&ceid=BD:bn`;
        const xml = await fetchText(url, 10000);
        const $ = cheerio.load(xml, { xmlMode: true });

        const items = $('item').toArray();
        for (const el of items) {
          let rawTitle = $(el).find('title').text() || '';
          const rawLink = $(el).find('link').text() || '';
          const pubDate = $(el).find('pubDate').text() || '';

          // Strip publisher suffix from title
          rawTitle = rawTitle.replace(/\s*[-–|]\s*দৈনিক ইনকিলাব\s*$/i, '').trim();
          const title = cleanTitle(rawTitle);
          if (!title || !rawLink) continue;

          if (seenUrls.has(rawLink)) continue;
          seenUrls.add(rawLink);

          let articleUrl = rawLink;

          // Decode Google News redirect URL for candidate stories
          if (matchesPanchbibiKeywords(title) || rawLink.includes('panchbibi')) {
            try {
              const decoded = await decoder.decode(rawLink);
              if (decoded.status && decoded.decoded_url) {
                articleUrl = decoded.decoded_url;
              }
            } catch (e: any) {
              console.warn(`[Daily Inqilab] URL decode failed for ${rawLink}:`, e.message);
            }
          }

          const canonical = canonicalizeUrl(articleUrl) || articleUrl;
          const publishedAt = pubDate
            ? (parseBanglaDate(pubDate) || new Date(pubDate).toISOString())
            : null;

          results.push({
            title,
            url: canonical,
            source: 'Daily Inqilab',
            publishedAt,
            imageUrl: null,
            sourceType: 'search',
            rawLocation: 'panchbibi-search'
          });
        }
      } catch (err: any) {
        console.warn(`[Daily Inqilab] Failed to search for "${q}":`, err.message);
      }
    }

    return results;
  }
};
