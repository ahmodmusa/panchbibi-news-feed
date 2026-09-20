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

function normalizePublisherImageUrl(rawImg: string | null | undefined, baseUrl: string): string | null {
  if (!rawImg || typeof rawImg !== 'string') return null;
  let clean = rawImg.trim();
  if (clean.length < 5) return null;

  // Unescape backslashes if escaped
  clean = clean.replace(/\\\//g, '/').replace(/\\"/g, '"');

  // Protocol relative
  if (clean.startsWith('//')) {
    clean = 'https:' + clean;
  }

  const canonical = canonicalizeUrl(clean, baseUrl);
  if (!canonical) return null;
  if (canonical.includes('1x1') || canonical.endsWith('.gif')) return null;
  return canonical;
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
            imageUrl: cardImg ? normalizePublisherImageUrl(cardImg, 'https://www.jobabdihi.com') : null,
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

          let candidateImage: string | null = null;
          const cardImg = item.imageUrl;

          // 1. JSON-LD structured data (NewsArticle.image)
          $('script[type="application/ld+json"]').each((_, el) => {
            try {
              const data = JSON.parse($(el).html() || '{}');
              if (data.datePublished && !item.publishedAt) {
                item.publishedAt = parseBanglaDate(data.datePublished);
              }
              if (data.image && !candidateImage) {
                const img = Array.isArray(data.image)
                  ? data.image[0]
                  : (typeof data.image === 'string' ? data.image : data.image?.url);
                const norm = normalizePublisherImageUrl(img, 'https://www.jobabdihi.com');
                if (norm) candidateImage = norm;
              }
            } catch {}
          });

          // 2. OpenGraph fallback (og:image)
          if (!candidateImage) {
            const ogImg = $('meta[property="og:image"]').attr('content') ||
              $('meta[property="og:image:url"]').attr('content');
            const norm = normalizePublisherImageUrl(ogImg, 'https://www.jobabdihi.com');
            if (norm) candidateImage = norm;
          }

          // 3. Twitter fallback (twitter:image)
          if (!candidateImage) {
            const twImg = $('meta[name="twitter:image"]').attr('content');
            const norm = normalizePublisherImageUrl(twImg, 'https://www.jobabdihi.com');
            if (norm) candidateImage = norm;
          }

          // 4. Listing-card fallback
          if (!candidateImage && cardImg) {
            candidateImage = cardImg;
          }

          item.imageUrl = candidateImage;

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
