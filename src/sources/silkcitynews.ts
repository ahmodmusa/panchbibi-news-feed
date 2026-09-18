import { RawNewsItem, SourceAdapter } from '../types.js';
import { fetchJson } from '../http.js';

interface WordPressPost {
  id: number;
  date: string;
  date_gmt?: string;
  link: string;
  title: {
    rendered: string;
  };
  _embedded?: {
    'wp:featuredmedia'?: Array<{
      source_url?: string;
    }>;
  };
  yoast_head_json?: {
    og_image?: Array<{
      url?: string;
    }>;
  };
}

export const silkcitynewsAdapter: SourceAdapter = {
  name: 'Silk City News',
  sourceType: 'api',

  async fetch(): Promise<RawNewsItem[]> {
    const apiUrl =
      'https://silkcitynews.com/wp-json/wp/v2/posts?search=%E0%A6%AA%E0%A6%BE%E0%A6%81%E0%A6%9A%E0%A6%AC%E0%A6%BF%E0%A6%AC%E0%A6%BF&per_page=25&_embed=1';

    const posts = await fetchJson<WordPressPost[]>(apiUrl);
    const results: RawNewsItem[] = [];

    for (const post of posts) {
      if (!post.title?.rendered || !post.link) continue;

      let publishedAt: string | null = null;
      const rawDate = post.date_gmt && post.date_gmt !== '0000-00-00T00:00:00'
        ? `${post.date_gmt}Z`
        : post.date;

      if (rawDate) {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          publishedAt = d.toISOString();
        }
      }

      const imageUrl =
        post._embedded?.['wp:featuredmedia']?.[0]?.source_url ||
        post.yoast_head_json?.og_image?.[0]?.url ||
        null;

      results.push({
        title: post.title.rendered,
        url: post.link,
        source: 'Silk City News',
        publishedAt,
        imageUrl,
        sourceType: 'api',
        rawLocation: 'panchbibi-search'
      });
    }

    return results;
  }
};
