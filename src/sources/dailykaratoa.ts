import * as cheerio from 'cheerio';
import { RawNewsItem, SourceAdapter } from '../types.js';
import { fetchText } from '../http.js';
import { parseBanglaDate, cleanTitle } from '../normalize.js';

function normalizeKaratoaImageUrl(src?: string | null): string | null {
  if (!src) return null;
  let clean = src.trim();
  if (clean.startsWith('//')) {
    clean = 'https:' + clean;
  } else if (clean.startsWith('/')) {
    clean = 'https://www.dailykaratoa.com' + clean;
  }
  clean = clean.replace('dailykaratoa.com//', 'dailykaratoa.com/');
  return clean;
}

/**
 * Compare two titles to ensure they refer to the same article.
 */
function titlesMatch(titleA: string, titleB: string): boolean {
  const cleanA = cleanTitle(titleA).replace(/[^\u0980-\u09FFa-zA-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const cleanB = cleanTitle(titleB).replace(/[^\u0980-\u09FFa-zA-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

  if (cleanA === cleanB) return true;
  if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return true;

  // Word overlap check (at least 50% of words in common)
  const wordsA = new Set(cleanA.split(' ').filter(w => w.length > 2));
  const wordsB = new Set(cleanB.split(' ').filter(w => w.length > 2));

  if (wordsA.size === 0 || wordsB.size === 0) return false;

  let common = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) common++;
  }

  const overlapA = common / wordsA.size;
  const overlapB = common / wordsB.size;
  return overlapA >= 0.5 || overlapB >= 0.5;
}

export const dailykaratoaAdapter: SourceAdapter = {
  name: 'Daily Karatoa',
  sourceType: 'search',

  async fetch(): Promise<RawNewsItem[]> {
    const searchUrl =
      'https://www.dailykaratoa.com/search?q=%E0%A6%AA%E0%A6%BE%E0%A6%81%E0%A6%9A%E0%A6%AC%E0%A6%BF%E0%A6%AC%E0%A6%BF';

    const html = await fetchText(searchUrl);
    const $ = cheerio.load(html);
    const candidates: Array<{ title: string; url: string; imageUrl: string | null; publishedAt: string | null }> = [];
    const seenUrls = new Set<string>();

    // 1. Lead and Sub-lead cards (.cat_lead, .cat_sub_lead)
    $('.cat_lead, .cat_sub_lead').each((_, el) => {
      const card = $(el);
      const linkEl = card.find('a.link, a[href*="/article/"]').first();
      const rawUrl = linkEl.attr('href');
      const title = cleanTitle(card.find('h5.title, h5').first().text()) || cleanTitle(card.find('img').first().attr('alt') || '');
      const rawImg = card.find('img.news_img, img').first().attr('src');
      const imageUrl = normalizeKaratoaImageUrl(rawImg);

      if (rawUrl && rawUrl.includes('/article/') && title.length > 10 && !seenUrls.has(rawUrl)) {
        seenUrls.add(rawUrl);
        candidates.push({
          title,
          url: rawUrl,
          imageUrl,
          publishedAt: null
        });
      }
    });

    // 2. More news cards (.catsubMoremedianews .sub-news)
    $('.catsubMoremedianews .sub-news').each((_, el) => {
      const card = $(el);
      const linkEl = card.find('a[href*="/article/"]').first();
      const rawUrl = linkEl.attr('href');
      const title = cleanTitle(card.find('h5').first().text()) || cleanTitle(card.find('img').first().attr('alt') || '');
      const rawImg = card.find('img.media-news-img, img').first().attr('src');
      const imageUrl = normalizeKaratoaImageUrl(rawImg);
      const timeStr = card.find('.time').first().text().trim();
      const publishedAt = timeStr ? parseBanglaDate(timeStr) : null;

      if (rawUrl && rawUrl.includes('/article/') && title.length > 10 && !seenUrls.has(rawUrl)) {
        seenUrls.add(rawUrl);
        candidates.push({
          title,
          url: rawUrl,
          imageUrl,
          publishedAt
        });
      }
    });

    console.log(`[Daily Karatoa] Extracted ${candidates.length} card candidates. Verifying detail pages...`);

    // 3. Verification & Enrichment: verify each candidate against its article page
    const verifiedResults: RawNewsItem[] = [];

    // Verify candidates with concurrency of 3
    const batchSize = 3;
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async item => {
          try {
            const articleHtml = await fetchText(item.url, 8000);
            const $art = cheerio.load(articleHtml);

            const ogTitle = cleanTitle($art('meta[property="og:title"]').attr('content') || '');
            const h1Title = cleanTitle($art('h1').first().text());
            const canonicalArticleTitle = ogTitle || h1Title;

            if (!canonicalArticleTitle) {
              console.warn(`[Daily Karatoa] Could not find article title for ${item.url}. Skipping.`);
              return;
            }

            // Verify headline match!
            if (!titlesMatch(item.title, canonicalArticleTitle)) {
              console.warn(
                `[Daily Karatoa Mismatch REJECTED]\n  Card: "${item.title}"\n  Page: "${canonicalArticleTitle}"\n  URL: ${item.url}`
              );
              return;
            }

            // Extract high-res image
            const ogImage = $art('meta[property="og:image"]').attr('content');
            const finalImageUrl = normalizeKaratoaImageUrl(ogImage) || item.imageUrl;

            // Extract published date if not already found
            let publishedAt = item.publishedAt;
            if (!publishedAt) {
              const dateText = $art('.time, time, .date').text().replace(/\s+/g, ' ');
              const matchDate = dateText.match(/প্রকাশ\s*:\s*([^,\n\r]+(?:,\s*\d{4})?(?:\s+\d{1,2}:\d{2}\s*(?:এএম|পিএম|am|pm)?)?)/i);
              if (matchDate) {
                publishedAt = parseBanglaDate(matchDate[0]);
              } else {
                publishedAt = parseBanglaDate(dateText);
              }
            }

            verifiedResults.push({
              title: item.title,
              url: item.url,
              source: 'Daily Karatoa',
              publishedAt,
              imageUrl: finalImageUrl,
              sourceType: 'search',
              rawLocation: 'panchbibi-search'
            });
          } catch (err: any) {
            console.warn(`[Daily Karatoa] Verification failed for ${item.url}: ${err.message}`);
          }
        })
      );
    }

    console.log(`[Daily Karatoa] Successfully verified ${verifiedResults.length} / ${candidates.length} items`);
    return verifiedResults;
  }
};
