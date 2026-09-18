import { RawNewsItem, SourceAdapter } from '../types.js';
import { fetchText } from '../http.js';

export const dailybangladeshAdapter: SourceAdapter = {
  name: 'Daily Bangladesh',
  sourceType: 'category',

  async fetch(): Promise<RawNewsItem[]> {
    const districtUrl = 'https://www.daily-bangladesh.com/district/joypurhat';

    const html = await fetchText(districtUrl);
    const results: RawNewsItem[] = [];
    const seen = new Set<string>();

    const linkPattern = /<a[^>]+href=["']((?:https:\/\/www\.daily-bangladesh\.com)?\/country\/\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;

    while ((match = linkPattern.exec(html)) !== null) {
      let rawHref = match[1];
      if (rawHref.startsWith('/')) {
        rawHref = `https://www.daily-bangladesh.com${rawHref}`;
      }

      const rawTitle = match[2].replace(/<[^>]+>/g, '').trim();

      if (rawTitle.length > 10 && !seen.has(rawHref)) {
        seen.add(rawHref);
        results.push({
          title: rawTitle,
          url: rawHref,
          source: 'Daily Bangladesh',
          publishedAt: null,
          sourceType: 'category',
          rawLocation: 'joypurhat-category'
        });
      }
    }

    return results;
  }
};
