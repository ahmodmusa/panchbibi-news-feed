import * as cheerio from 'cheerio';
import { RawNewsItem, SourceAdapter } from '../types.js';
import { fetchText } from '../http.js';
import { cleanTitle, canonicalizeUrl, parseBanglaDate } from '../normalize.js';
import { TIER_A_KEYWORDS, TIER_B_KEYWORDS } from '../keywords.js';

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

export const jobabdihiAdapter: SourceAdapter = {
  name: 'Jobabdihi',
  sourceType: 'category',

  async fetch(): Promise<RawNewsItem[]> {
    const listingUrls = [
      'https://www.jobabdihi.com/menu/110', // রাজশাহী বিভাগ
      'https://www.jobabdihi.com/menu/107'  // সারা দেশ
    ];

    const results: RawNewsItem[] = [];
    const seenUrls = new Set<string>();

    for (const listUrl of listingUrls) {
      try {
        const html = await fetchText(listUrl, 10000);
        const $ = cheerio.load(html);

        $('a[href*="/news/"]').each((_, el) => {
          const href = $(el).attr('href');
          const text = $(el).text().trim();
          if (!href || !text || text.length < 6) return;

          const canonical = canonicalizeUrl(href, 'https://www.jobabdihi.com');
          if (!canonical || !/\/news\/\d+/.test(canonical)) return;
          if (seenUrls.has(canonical)) return;
          seenUrls.add(canonical);

          // Card image if available
          const parent = $(el).closest('div, li, .title_lead');
          const imgEl = parent.find('img').first().length ? parent.find('img').first() : $(el).find('img').first();
          const cardImg = imgEl.attr('src') || null;

          results.push({
            title: cleanTitle(text),
            url: canonical,
            source: 'Jobabdihi',
            publishedAt: null,
            imageUrl: cardImg ? canonicalizeUrl(cardImg, 'https://www.jobabdihi.com') : null,
            sourceType: 'category',
            rawLocation: 'rajshahi-category'
          });
        });
      } catch (err: any) {
        console.warn(`[Jobabdihi] Failed to fetch listing from ${listUrl}:`, err.message);
      }
    }

    // Detail enrichment for candidate items matching Panchbibi
    for (const item of results) {
      if (matchesPanchbibiKeywords(item.title) || item.url.includes('panchbibi')) {
        try {
          const detailHtml = await fetchText(item.url, 8000);
          const $ = cheerio.load(detailHtml);

          // 1. JSON-LD structured data (NewsArticle)
          $('script[type="application/ld+json"]').each((_, el) => {
            try {
              const data = JSON.parse($(el).html() || '{}');
              if (data.datePublished && !item.publishedAt) {
                item.publishedAt = parseBanglaDate(data.datePublished);
              }
              if (data.image && !item.imageUrl) {
                const img = Array.isArray(data.image)
                  ? data.image[0]
                  : (typeof data.image === 'string' ? data.image : data.image?.url);
                if (img) item.imageUrl = canonicalizeUrl(img, 'https://www.jobabdihi.com');
              }
            } catch {}
          });

          // 2. Fallback to OpenGraph / Meta
          if (!item.imageUrl) {
            const ogImg = $('meta[property="og:image"]').attr('content');
            if (ogImg) item.imageUrl = canonicalizeUrl(ogImg, 'https://www.jobabdihi.com');
          }

          if (!item.publishedAt) {
            const ogDate = $('meta[property="article:published_time"]').attr('content');
            if (ogDate) item.publishedAt = parseBanglaDate(ogDate);
          }
        } catch (e: any) {
          console.warn(`[Jobabdihi] Detail enrichment failed for ${item.url}:`, e.message);
        }
      }
    }

    return results;
  }
};
