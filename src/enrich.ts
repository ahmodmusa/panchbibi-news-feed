import * as cheerio from 'cheerio';
import { NewsItem } from './types.js';
import { fetchText } from './http.js';
import { parseBanglaDate, canonicalizeUrl } from './normalize.js';

function extractJsonLd(doc: cheerio.CheerioAPI): { datePublished?: string; imageUrl?: string } {
  let datePublished: string | undefined;
  let imageUrl: string | undefined;

  doc('script[type="application/ld+json"]').each((_, el) => {
    try {
      const rawText = doc(el).html();
      if (!rawText) return;
      const data = JSON.parse(rawText);

      function inspectObj(obj: any) {
        if (!obj || typeof obj !== 'object') return;

        // Check for dates
        const rawDate = obj.datePublished || obj.dateCreated || obj.uploadDate;
        if (rawDate && !datePublished) {
          const parsed = parseBanglaDate(String(rawDate));
          if (parsed) datePublished = parsed;
        }

        // Check for image
        if (!imageUrl) {
          if (typeof obj.image === 'string') {
            imageUrl = obj.image;
          } else if (obj.image && typeof obj.image.url === 'string') {
            imageUrl = obj.image.url;
          } else if (Array.isArray(obj.image) && obj.image.length > 0) {
            const first = obj.image[0];
            imageUrl = typeof first === 'string' ? first : first?.url;
          }
        }

        // Search graph if array
        if (Array.isArray(obj['@graph'])) {
          for (const item of obj['@graph']) {
            inspectObj(item);
          }
        }
      }

      inspectObj(data);
    } catch {}
  });

  return { datePublished, imageUrl };
}

function normalizeCandidateImageUrl(rawImg: string | null | undefined, baseUrl: string): string | null {
  if (!rawImg || typeof rawImg !== 'string') return null;
  const trimmed = rawImg.trim();
  if (trimmed.length < 5) return null;

  try {
    const abs = new URL(trimmed, baseUrl).toString();
    if (!abs.startsWith('http://') && !abs.startsWith('https://')) return null;
    // Disallow 1x1 tracking pixels or spacer gifs
    if (abs.includes('1x1') || abs.endsWith('.gif')) return null;
    return canonicalizeUrl(abs);
  } catch {
    return null;
  }
}

/**
 * Enrich an individual news item with publishedAt and imageUrl from its article page.
 */
export async function enrichItem(item: NewsItem): Promise<NewsItem> {
  // If both date and image are already populated, skip network call
  if (item.publishedAt && item.imageUrl) {
    return item;
  }

  try {
    const html = await fetchText(item.url, 8000);
    const $ = cheerio.load(html);

    let enrichedDate = item.publishedAt || null;
    let enrichedImage = item.imageUrl || null;

    // 1. JSON-LD extraction
    const jsonLd = extractJsonLd($);
    if (!enrichedDate && jsonLd.datePublished) {
      enrichedDate = jsonLd.datePublished;
    }
    if (!enrichedImage && jsonLd.imageUrl) {
      enrichedImage = normalizeCandidateImageUrl(jsonLd.imageUrl, item.url);
    }

    // 2. Open Graph / Meta tags for date
    if (!enrichedDate) {
      const metaDate =
        $('meta[property="article:published_time"]').attr('content') ||
        $('meta[name="pubdate"]').attr('content') ||
        $('meta[name="publish-date"]').attr('content') ||
        $('meta[property="og:published_time"]').attr('content') ||
        $('meta[name="date"]').attr('content');

      if (metaDate) {
        enrichedDate = parseBanglaDate(metaDate);
      }
    }

    // 3. Open Graph / Twitter for image
    if (!enrichedImage) {
      const metaImg =
        $('meta[property="og:image"]').attr('content') ||
        $('meta[property="og:image:url"]').attr('content') ||
        $('meta[name="twitter:image"]').attr('content');

      if (metaImg) {
        enrichedImage = normalizeCandidateImageUrl(metaImg, item.url);
      }
    }

    // 4. HTML <time> tags
    if (!enrichedDate) {
      $('time').each((_, el) => {
        if (enrichedDate) return;
        const dt = $(el).attr('datetime') || $(el).text().trim();
        if (dt) {
          const parsed = parseBanglaDate(dt);
          if (parsed) enrichedDate = parsed;
        }
      });
    }

    // 5. Visible text date elements
    if (!enrichedDate) {
      const dateText = $('.time, time, .date, [class*="date"], [class*="time"]').text().replace(/\s+/g, ' ');
      const matchDate = dateText.match(/(?:প্রকাশ|প্রকাশিত|আপডেট)\s*:\s*([^,\n\r]+(?:,\s*\d{4})?(?:\s+\d{1,2}:\d{2}\s*(?:এএম|পিএম|am|pm)?)?)/i);
      if (matchDate) {
        enrichedDate = parseBanglaDate(matchDate[0]);
      } else if (dateText.length > 5) {
        enrichedDate = parseBanglaDate(dateText);
      }
    }

    return {
      ...item,
      publishedAt: enrichedDate,
      imageUrl: enrichedImage
    };
  } catch (err: any) {
    // If enrichment fails, keep original item intact
    return item;
  }
}

/**
 * Concurrently enrich a list of news items with controlled parallelism.
 */
export async function enrichNewsItems(items: NewsItem[], concurrency: number = 4): Promise<NewsItem[]> {
  const results: NewsItem[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const enrichedBatch = await Promise.all(batch.map(item => enrichItem(item)));
    results.push(...enrichedBatch);
  }

  return results;
}
