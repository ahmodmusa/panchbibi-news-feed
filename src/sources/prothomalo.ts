import { RawNewsItem, SourceAdapter } from '../types.js';
import { fetchJson } from '../http.js';

interface ProthomAloResponse {
  results?: {
    stories?: Array<{
      headline: string;
      slug: string;
      url?: string;
      'published-at'?: number | string;
      sections?: Array<{ name: string }>;
    }>;
  };
}

export const prothomaloAdapter: SourceAdapter = {
  name: 'Prothom Alo',
  sourceType: 'api',

  async fetch(): Promise<RawNewsItem[]> {
    const apiUrl =
      'https://www.prothomalo.com/api/v1/search?q=%E0%A6%AA%E0%A6%BE%E0%A6%81%E0%A6%9A%E0%A6%AC%E0%A6%BF%E0%A6%AC%E0%A6%BF&size=30';

    const data = await fetchJson<ProthomAloResponse>(apiUrl);
    const stories = data?.results?.stories || [];

    const results: RawNewsItem[] = [];

    for (const story of stories) {
      if (!story.headline || !story.slug) continue;

      const url = story.url || `https://www.prothomalo.com/${story.slug}`;
      let publishedAt: string | null = null;

      if (story['published-at']) {
        const d = new Date(story['published-at']);
        if (!isNaN(d.getTime())) {
          publishedAt = d.toISOString();
        }
      }

      results.push({
        title: story.headline,
        url,
        source: 'Prothom Alo',
        publishedAt,
        sourceType: 'api',
        rawLocation: 'panchbibi-search'
      });
    }

    return results;
  }
};
