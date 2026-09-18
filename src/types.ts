export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt?: string | null;
  discoveredAt: string;
  locationMatch: 'panchbibi' | 'joypurhat' | 'keyword';
  sourceType: 'rss' | 'api' | 'sitemap' | 'category' | 'search';
}

export interface NewsFeed {
  generatedAt: string;
  count: number;
  sources: number;
  items: NewsItem[];
}

export interface RawNewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt?: string | null;
  sourceType: 'rss' | 'api' | 'sitemap' | 'category' | 'search';
  rawLocation?: string;
}

export interface SourceAdapter {
  name: string;
  sourceType: 'rss' | 'api' | 'sitemap' | 'category' | 'search';
  fetch(): Promise<RawNewsItem[]>;
}
