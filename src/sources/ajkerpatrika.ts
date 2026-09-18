import { RawNewsItem, SourceAdapter } from '../types.js';
import { fetchText } from '../http.js';

export const ajkerpatrikaAdapter: SourceAdapter = {
  name: 'Ajker Patrika',
  sourceType: 'category',

  async fetch(): Promise<RawNewsItem[]> {
    const topicUrl =
      'https://www.ajkerpatrika.com/topic/%E0%A6%AA%E0%A6%BE%E0%A6%81%E0%A6%9A%E0%A6%AC%E0%A6%BF%E0%A6%AC%E0%A6%BF';

    const html = await fetchText(topicUrl);
    const results: RawNewsItem[] = [];
    const seen = new Set<string>();

    // Extract article links with headings
    // e.g. <a ... href="(/bangladesh/joypurhat/[a-z0-9]+)"> ... <h2 ...><span ...>(TITLE)</span></h2>
    const pattern = /<a[^>]+href=["'](\/bangladesh\/joypurhat\/[a-zA-Z0-9]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(html)) !== null) {
      const relPath = match[1];
      const innerHtml = match[2];

      const titleMatch = innerHtml.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i);
      const rawTitle = titleMatch
        ? titleMatch[1].replace(/<[^>]+>/g, '').trim()
        : innerHtml.replace(/<[^>]+>/g, '').trim();

      const fullUrl = `https://www.ajkerpatrika.com${relPath}`;

      if (rawTitle.length > 8 && !seen.has(fullUrl)) {
        seen.add(fullUrl);
        results.push({
          title: rawTitle,
          url: fullUrl,
          source: 'Ajker Patrika',
          publishedAt: null,
          sourceType: 'category',
          rawLocation: 'panchbibi-category'
        });
      }
    }

    return results;
  }
};
