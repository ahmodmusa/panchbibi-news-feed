import { RawNewsItem, SourceAdapter } from '../types.js';
import { fetchText } from '../http.js';

export const dailykaratoaAdapter: SourceAdapter = {
  name: 'Daily Karatoa',
  sourceType: 'search',

  async fetch(): Promise<RawNewsItem[]> {
    const searchUrl =
      'https://www.dailykaratoa.com/search?q=%E0%A6%AA%E0%A6%BE%E0%A6%81%E0%A6%9A%E0%A6%AC%E0%A6%BF%E0%A6%AC%E0%A6%BF';

    const html = await fetchText(searchUrl);
    const results: RawNewsItem[] = [];
    const seen = new Set<string>();

    // Match image/link blocks or title blocks with article links
    // e.g. <img ... alt="TITLE" ... /> ... <a class="link" href="https://www.dailykaratoa.com/article/183810">
    const itemPattern = /<a[^>]+class="link"[^>]+href="([^"]+)"[\s\S]*?<h5[^>]*>([\s\S]*?)<\/h5>/gi;
    let match: RegExpExecArray | null;

    while ((match = itemPattern.exec(html)) !== null) {
      const url = match[1];
      const title = match[2].replace(/<[^>]+>/g, '').trim();

      if (title.length > 10 && !seen.has(url)) {
        seen.add(url);
        results.push({
          title,
          url,
          source: 'Daily Karatoa',
          publishedAt: null,
          sourceType: 'search',
          rawLocation: 'panchbibi-search'
        });
      }
    }

    // Secondary pattern: in case the order is <h5 ...>TITLE</h5> ... <a class="link" href="...">
    const reversePattern = /<h5[^>]*>([\s\S]*?)<\/h5>[\s\S]*?<a[^>]+class="link"[^>]+href="([^"]+)"/gi;
    while ((match = reversePattern.exec(html)) !== null) {
      const title = match[1].replace(/<[^>]+>/g, '').trim();
      const url = match[2];

      if (url.includes('/article/') && title.length > 10 && !seen.has(url)) {
        seen.add(url);
        results.push({
          title,
          url,
          source: 'Daily Karatoa',
          publishedAt: null,
          sourceType: 'search',
          rawLocation: 'panchbibi-search'
        });
      }
    }

    return results;
  }
};
