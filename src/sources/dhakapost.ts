import { RawNewsItem, SourceAdapter } from '../types.js';
import { fetchText } from '../http.js';
import { parseBanglaDate } from '../normalize.js';

export const dhakapostAdapter: SourceAdapter = {
  name: 'Dhaka Post',
  sourceType: 'category',

  async fetch(): Promise<RawNewsItem[]> {
    const urls = [
      'https://www.dhakapost.com/country/jaipurhat/panchbibi-news',
      'https://www.dhakapost.com/country/jaipurhat-news'
    ];

    const results: RawNewsItem[] = [];
    const seen = new Set<string>();

    for (const pageUrl of urls) {
      try {
        const html = await fetchText(pageUrl);
        const isPanchbibiSpecific = pageUrl.includes('panchbibi-news');

        // 1. Try extracting structured JSON objects from Next.js payload
        // Pattern: {"Id":\d+,"Heading":"...","URL":"https://www.dhakapost.com/country/\d+","CreatedAtBangla":"..."}
        const jsonPattern = /\{"Id":(\d+),"Heading":"([^"]+)",[\s\S]*?"URL":"([^"]+)",[\s\S]*?"CreatedAtBangla":"([^"]+)"/g;
        let match: RegExpExecArray | null;

        while ((match = jsonPattern.exec(html)) !== null) {
          const heading = match[2].replace(/\\"/g, '"').replace(/\\n/g, ' ');
          const articleUrl = match[3].replace(/\\"/g, '');
          const createdAtBangla = match[4];

          if (!seen.has(articleUrl)) {
            seen.add(articleUrl);
            results.push({
              title: heading,
              url: articleUrl,
              source: 'Dhaka Post',
              publishedAt: parseBanglaDate(createdAtBangla),
              sourceType: 'category',
              rawLocation: isPanchbibiSpecific ? 'panchbibi-category' : 'joypurhat-category'
            });
          }
        }

        // 2. HTML fallback if jsonPattern didn't find articles
        if (results.length === 0) {
          const linkPattern = /<a\s+[^>]*href=["'](https:\/\/www\.dhakapost\.com\/country\/\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;
          let aMatch: RegExpExecArray | null;

          while ((aMatch = linkPattern.exec(html)) !== null) {
            const articleUrl = aMatch[1];
            const inner = aMatch[2];
            const hMatch = inner.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
            const rawTitle = (hMatch ? hMatch[1] : inner).replace(/<[^>]+>/g, '').trim();

            if (rawTitle.length > 10 && !seen.has(articleUrl)) {
              seen.add(articleUrl);
              results.push({
                title: rawTitle,
                url: articleUrl,
                source: 'Dhaka Post',
                publishedAt: null,
                sourceType: 'category',
                rawLocation: isPanchbibiSpecific ? 'panchbibi-category' : 'joypurhat-category'
              });
            }
          }
        }
      } catch (err: any) {
        console.warn(`[Dhaka Post] Error fetching ${pageUrl}:`, err.message);
      }
    }

    return results;
  }
};
