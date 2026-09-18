import fs from 'fs';
import path from 'path';
import { ALL_ADAPTERS } from './sources/index.js';
import { RawNewsItem, NewsItem, NewsFeed } from './types.js';
import { filterAndValidate } from './filter.js';
import { deduplicateAndMerge } from './dedupe.js';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const JSON_FILE = path.join(PUBLIC_DIR, 'news.json');
const JS_FILE = path.join(PUBLIC_DIR, 'news.js');
const STATUS_FILE = path.join(PUBLIC_DIR, 'index.html');

/**
 * Compute a content fingerprint of the items list
 * to detect if anything actually changed.
 */
function computeItemsFingerprint(items: NewsItem[]): string {
  return items.map(i => `${i.id}|${i.url}|${i.title}`).join('||');
}

/**
 * Safely serialize JSON for embedding in a JavaScript file,
 * preventing XSS or script breakouts.
 */
function serializeToJs(feed: NewsFeed): string {
  const jsonStr = JSON.stringify(feed, null, 2);
  // Prevent </script> tag breakout
  const safeJson = jsonStr.replace(/<\/script/gi, '<\\/script');
  return `/**
 * Panchbibi News Feed - Client-side fallback feed
 * Generated: ${feed.generatedAt}
 * Total items: ${feed.count}
 */
(function() {
  window.PANCHBIBI_NEWS_FEED = ${safeJson};
})();
`;
}

/**
 * Generate a static diagnostic HTML status page.
 */
function generateStatusHtml(feed: NewsFeed, activeSources: string[], failedSources: string[]): string {
  const itemsList = feed.items.slice(0, 15).map(i => `
    <li style="margin-bottom: 0.75rem;">
      <a href="${i.url}" target="_blank" rel="noopener noreferrer" style="color: #0284c7; text-decoration: none; font-weight: 500;">
        ${escapeHtml(i.title)}
      </a>
      <div style="font-size: 0.85rem; color: #64748b;">
        <span>${escapeHtml(i.source)}</span>
        ${i.publishedAt ? ` &middot; <span>${escapeHtml(i.publishedAt.slice(0, 10))}</span>` : ''}
        &middot; <span style="text-transform: uppercase; font-size: 0.75rem;">${escapeHtml(i.locationMatch)}</span>
      </div>
    </li>
  `).join('');

  return `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>পাঁচবিবি নিউজ ফিড স্ট্যাটাস | Panchbibi News Feed</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif; line-height: 1.6; color: #334155; max-width: 800px; margin: 0 auto; padding: 2rem 1rem; background-color: #f8fafc; }
    .card { background: white; border-radius: 8px; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 1.5rem; }
    h1 { color: #0f172a; margin-top: 0; font-size: 1.5rem; }
    .badge { display: inline-block; padding: 0.25rem 0.6rem; border-radius: 9999px; font-size: 0.8rem; font-weight: 600; margin-right: 0.5rem; }
    .badge-ok { background: #dcfce7; color: #166534; }
    .badge-warn { background: #fef9c3; color: #854d0e; }
    .links a { display: inline-block; margin-right: 1rem; color: #0284c7; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Panchbibi News Feed Status</h1>
    <p>স্বয়ংক্রিয় সংবাদ সংগ্রাহক ও ফিড স্ট্যাটাস (Panchbibi.com-এর জন্য)</p>
    <div>
      <span class="badge badge-ok">Items: ${feed.count}</span>
      <span class="badge badge-ok">Active Sources: ${feed.sources}</span>
      ${failedSources.length > 0 ? `<span class="badge badge-warn">Failed: ${failedSources.length}</span>` : ''}
    </div>
    <p style="font-size: 0.9rem; color: #64748b; margin-top: 1rem;">
      Last Generated: <strong>${feed.generatedAt}</strong>
    </p>
    <div class="links">
      <a href="./news.json">news.json</a>
      <a href="./news.js">news.js</a>
    </div>
  </div>

  <div class="card">
    <h2>Active Sources (${activeSources.length})</h2>
    <ul>
      ${activeSources.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
    </ul>
    ${failedSources.length > 0 ? `
      <h3 style="color: #dc2626;">Failed Sources (${failedSources.length})</h3>
      <ul>
        ${failedSources.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
      </ul>
    ` : ''}
  </div>

  <div class="card">
    <h2>Recent Panchbibi Headlines</h2>
    <ul style="list-style: none; padding-left: 0;">
      ${itemsList}
    </ul>
  </div>
</body>
</html>
`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function main() {
  const discoveredAt = new Date().toISOString();
  console.log(`[Panchbibi News Feed] Starting fetch at ${discoveredAt}`);

  // Ensure public directory exists
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  // Load existing feed if available
  let existingFeed: NewsFeed | null = null;
  if (fs.existsSync(JSON_FILE)) {
    try {
      const raw = fs.readFileSync(JSON_FILE, 'utf8');
      existingFeed = JSON.parse(raw);
    } catch (e: any) {
      console.warn(`[Panchbibi News Feed] Could not parse existing news.json:`, e.message);
    }
  }

  const existingItems: NewsItem[] = existingFeed?.items || [];
  console.log(`[Panchbibi News Feed] Existing items in feed: ${existingItems.length}`);

  // Fetch all sources concurrently with per-source error isolation
  const activeSources: string[] = [];
  const failedSources: string[] = [];
  const allRawItems: RawNewsItem[] = [];

  const results = await Promise.allSettled(
    ALL_ADAPTERS.map(async adapter => {
      console.log(`[Source] Fetching from ${adapter.name}...`);
      const items = await adapter.fetch();
      console.log(`[Source] ${adapter.name} returned ${items.length} raw items`);
      return { name: adapter.name, items };
    })
  );

  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    const adapter = ALL_ADAPTERS[i];

    if (res.status === 'fulfilled') {
      activeSources.push(adapter.name);
      allRawItems.push(...res.value.items);
    } else {
      failedSources.push(adapter.name);
      console.error(`[Source Failed] ${adapter.name}:`, res.reason?.message || res.reason);
    }
  }

  console.log(`\n[Panchbibi News Feed] Sources Summary: ${activeSources.length} successful, ${failedSources.length} failed`);
  console.log(`[Panchbibi News Feed] Total raw items collected: ${allRawItems.length}`);

  // If ALL sources failed and we have an existing feed, preserve previous feed!
  if (activeSources.length === 0 && failedSources.length > 0) {
    if (existingFeed && existingFeed.items.length > 0) {
      console.error('[CRITICAL] All sources failed! Preserving previous feed unchanged.');
      process.exit(1);
    } else {
      console.error('[CRITICAL] All sources failed and no existing feed available!');
      process.exit(1);
    }
  }

  // Filter and validate raw items for Panchbibi relevance
  const validatedNewItems: NewsItem[] = [];
  let rejectedCount = 0;

  for (const raw of allRawItems) {
    const filterRes = filterAndValidate(raw, discoveredAt);
    if (filterRes.accepted && filterRes.item) {
      validatedNewItems.push(filterRes.item);
    } else {
      rejectedCount++;
    }
  }

  console.log(`[Panchbibi News Feed] Validated new Panchbibi items: ${validatedNewItems.length} (Rejected ${rejectedCount} non-relevant/invalid)`);

  // Deduplicate and merge with rolling history (up to 100 items, 180 days)
  const mergedItems = deduplicateAndMerge(existingItems, validatedNewItems, 100, 180);
  console.log(`[Panchbibi News Feed] Merged & deduplicated total items: ${mergedItems.length}`);

  // Check if content changed
  const oldFingerprint = existingFeed ? computeItemsFingerprint(existingFeed.items) : '';
  const newFingerprint = computeItemsFingerprint(mergedItems);
  const contentChanged = oldFingerprint !== newFingerprint;

  // Determine generatedAt timestamp:
  // If content did not change, keep the previous generatedAt to prevent meaningless git commits!
  const generatedAt = contentChanged || !existingFeed ? discoveredAt : existingFeed.generatedAt;

  // Compute unique active sources across all items in feed
  const sourceNamesInFeed = new Set(mergedItems.map(i => i.source));

  const feedOutput: NewsFeed = {
    generatedAt,
    count: mergedItems.length,
    sources: sourceNamesInFeed.size,
    items: mergedItems
  };

  if (!contentChanged && fs.existsSync(JSON_FILE)) {
    console.log('[Panchbibi News Feed] Content unchanged. No new stories detected.');
    console.log('[Panchbibi News Feed] Preserving existing files to avoid meaningless git commits.');
    return;
  }

  console.log(`[Panchbibi News Feed] Content changed! Writing updated feed (Count: ${feedOutput.count}, Sources: ${feedOutput.sources})...`);

  // Write news.json
  fs.writeFileSync(JSON_FILE, JSON.stringify(feedOutput, null, 2), 'utf8');

  // Write news.js
  fs.writeFileSync(JS_FILE, serializeToJs(feedOutput), 'utf8');

  // Write index.html status page
  fs.writeFileSync(STATUS_FILE, generateStatusHtml(feedOutput, activeSources, failedSources), 'utf8');

  console.log(`[Panchbibi News Feed] Successfully updated:`);
  console.log(` - ${JSON_FILE}`);
  console.log(` - ${JS_FILE}`);
  console.log(` - ${STATUS_FILE}`);
}

main().catch(err => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
