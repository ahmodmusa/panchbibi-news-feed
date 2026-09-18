import * as cheerio from 'cheerio';
import { RawNewsItem, SourceAdapter } from '../types.js';
import { fetchText } from '../http.js';
import { parseBanglaDate, cleanTitle } from '../normalize.js';

function normalizeKalbelaImageUrl(src?: string | null): string | null {
  if (!src) return null;
  let clean = src.trim();
  if (clean.startsWith('//')) {
    clean = 'https:' + clean;
  } else if (clean.startsWith('/')) {
    clean = 'https://www.kalbela.com' + clean;
  }
  return clean;
}

export const kalbelaAdapter: SourceAdapter = {
  name: 'Kalbela',
  sourceType: 'category',

  async fetch(): Promise<RawNewsItem[]> {
    const categoryUrl = 'https://www.kalbela.com/country-news/rajshahi/joypurhat/panchbibi';
    const results: RawNewsItem[] = [];
    const seenUrls = new Set<string>();

    try {
      const html = await fetchText(categoryUrl);
      const $ = cheerio.load(html);

      const candidates: Array<{ title: string; url: string; imageUrl: string | null; publishedAt: string | null }> = [];

      // Look inside #category_content or fall back to body
      const root = $('#category_content').length > 0 ? $('#category_content') : $('body');

      root.find('a[href*="/country-news/"]').each((_, el) => {
        const linkEl = $(el);
        const rawHref = linkEl.attr('href') || '';
        // Only target article URLs with article numeric IDs, e.g. /country-news/307205
        const matchId = rawHref.match(/\/country-news\/(\d+)/);
        if (!matchId) return;

        let fullUrl = rawHref;
        if (fullUrl.startsWith('/')) {
          fullUrl = 'https://www.kalbela.com' + fullUrl;
        }

        if (seenUrls.has(fullUrl)) return;

        // Find enclosing card or use the link element itself
        const card = linkEl.closest('.cat_lead, .cat_sub_lead, .sub-news, .news-item, .item, [class*="lead"], [class*="news"], .row > div');
        const searchScope = card.length > 0 ? card : linkEl;

        const title =
          cleanTitle(searchScope.find('h1, h2, h3, h4, h5, .title').first().text()) ||
          cleanTitle(linkEl.text()) ||
          cleanTitle(searchScope.find('img').first().attr('alt') || '');

        const rawImg =
          searchScope.find('img').attr('src') ||
          linkEl.find('img').attr('src');

        const imageUrl = normalizeKalbelaImageUrl(rawImg);

        if (title.length > 8) {
          seenUrls.add(fullUrl);
          candidates.push({
            title,
            url: fullUrl,
            imageUrl,
            publishedAt: null
          });
        }
      });

      console.log(`[Kalbela] Extracted ${candidates.length} candidates from category page. Enriching dates...`);

      // Enrich candidates with detail page fetch for published dates and high-res images
      const toEnrich = candidates.slice(0, 15);
      const batchSize = 3;
      for (let i = 0; i < toEnrich.length; i += batchSize) {
        const batch = toEnrich.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async item => {
            try {
              const artHtml = await fetchText(item.url, 8000);
              const $art = cheerio.load(artHtml);

              // 1. Published date
              let publishedAt = item.publishedAt;
              const dateText = $art('.time, time, .date, [class*="date"], [class*="time"]').text().replace(/\s+/g, ' ');
              const matchDate = dateText.match(/প্রকাশ\s*:\s*([^,\n\r]+(?:,\s*\d{4})?(?:\s+\d{1,2}:\d{2}\s*(?:এএম|পিএম|am|pm)?)?)/i);
              if (matchDate) {
                publishedAt = parseBanglaDate(matchDate[0]);
              } else {
                publishedAt = parseBanglaDate(dateText);
              }

              // 2. High-res image
              const ogImg = $art('meta[property="og:image"]').attr('content');
              const finalImg = normalizeKalbelaImageUrl(ogImg) || item.imageUrl;

              // 3. Title confirmation
              const ogTitle = cleanTitle($art('meta[property="og:title"]').attr('content') || '');
              const cleanArtTitle = ogTitle ? ogTitle.replace(/\|\s*কালবেলা.*/i, '').trim() : item.title;

              results.push({
                title: cleanArtTitle || item.title,
                url: item.url,
                source: 'Kalbela',
                publishedAt,
                imageUrl: finalImg,
                sourceType: 'category',
                rawLocation: 'panchbibi'
              });
            } catch (e: any) {
              console.warn(`[Kalbela] Detail fetch failed for ${item.url}: ${e.message}`);
              results.push({
                title: item.title,
                url: item.url,
                source: 'Kalbela',
                publishedAt: item.publishedAt,
                imageUrl: item.imageUrl,
                sourceType: 'category',
                rawLocation: 'panchbibi'
              });
            }
          })
        );
      }
    } catch (err: any) {
      console.warn(`[Kalbela] Category fetch failed: ${err.message}`);
    }

    // Also check RSS feed for any recent items
    try {
      const rssUrl = 'https://www.kalbela.com/rss/country-news-rss.xml';
      const rssXml = await fetchText(rssUrl, 8000);
      const $rss = cheerio.load(rssXml, { xmlMode: true });

      $rss('item').each((_, el) => {
        const item = $rss(el);
        const title = cleanTitle(item.find('title').text());
        const link = item.find('link').text().trim() || item.find('guid').text().trim();
        const pubDateStr = item.find('pubDate').text().trim();
        const mediaImg = item.find('media\\:content').attr('url') || null;

        if (title && link && !seenUrls.has(link)) {
          if (title.includes('পাঁচবিবি') || title.includes('বাগজানা') || title.includes('ধরঞ্জী')) {
            seenUrls.add(link);
            results.push({
              title,
              url: link,
              source: 'Kalbela',
              publishedAt: pubDateStr ? new Date(pubDateStr).toISOString() : null,
              imageUrl: normalizeKalbelaImageUrl(mediaImg),
              sourceType: 'category',
              rawLocation: 'panchbibi'
            });
          }
        }
      });
    } catch {}

    console.log(`[Kalbela] Returned ${results.length} total items`);
    return results;
  }
};
