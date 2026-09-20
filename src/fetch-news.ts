import fs from 'fs';
import path from 'path';
import { ALL_ADAPTERS } from './sources/index.js';
import { RawNewsItem, NewsItem, NewsFeed } from './types.js';
import { filterAndValidate } from './filter.js';
import { deduplicateAndMerge } from './dedupe.js';
import { enrichNewsItems } from './enrich.js';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const JSON_FILE = path.join(PUBLIC_DIR, 'news.json');
const JS_FILE = path.join(PUBLIC_DIR, 'news.js');
const STATUS_FILE = path.join(PUBLIC_DIR, 'index.html');

/**
 * Compute a content fingerprint of the items list
 * to detect if anything actually changed (including metadata).
 */
function computeItemsFingerprint(items: NewsItem[]): string {
  return items.map(i => `${i.id}|${i.url}|${i.title}|${i.publishedAt || ''}|${i.imageUrl || ''}`).join('||');
}

/**
 * Safely serialize JSON for embedding in a JavaScript file,
 * preventing XSS or script breakouts.
 */
function serializeToJs(feed: NewsFeed): string {
  const jsonStr = JSON.stringify(feed, null, 2);
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
  const itemsList = feed.items.slice(0, 20).map(i => `
    <li style="margin-bottom: 1rem; display: flex; gap: 1rem; align-items: flex-start;">
      ${i.imageUrl ? `<img src="${escapeHtml(i.imageUrl)}" alt="" style="width: 100px; height: 60px; object-fit: cover; border-radius: 4px; flex-shrink: 0; background: #e2e8f0;" loading="lazy">` : ''}
      <div>
        <a href="${i.url}" target="_blank" rel="noopener noreferrer" style="color: #0284c7; text-decoration: none; font-weight: 500; display: block;">
          ${escapeHtml(i.title)}
        </a>
        <div style="font-size: 0.85rem; color: #64748b; margin-top: 0.25rem;">
          <span>${escapeHtml(i.source)}</span>
          ${i.publishedAt ? ` &middot; <span>${escapeHtml(i.publishedAt.slice(0, 10))}</span>` : ' &middot; <span style="color: #eab308;">(No published date)</span>'}
          &middot; <span style="text-transform: uppercase; font-size: 0.75rem;">${escapeHtml(i.locationMatch)}</span>
        </div>
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

  const rawExistingItems: NewsItem[] = existingFeed?.items || [];
  console.log(`[Panchbibi News Feed] Existing items in feed: ${rawExistingItems.length}`);

  // Purge any stale Daily Karatoa items from historical cache to eliminate desynchronized headlines
  const purgedExistingItems = rawExistingItems.filter(item => {
    if (item.source === 'Daily Karatoa') {
      return false; // Re-ingest fresh verified items only
    }
    return true;
  });

  if (rawExistingItems.length !== purgedExistingItems.length) {
    console.log(`[Panchbibi News Feed] Purged ${rawExistingItems.length - purgedExistingItems.length} old Karatoa records from historical cache for re-verification.`);
  }

  // Fetch all sources concurrently with per-source error isolation
  const activeSources: string[] = [];
  const failedSources: string[] = [];
  const allRawItems: RawNewsItem[] = [];
  const sourceRawCounts: Record<string, number> = {};

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
      sourceRawCounts[adapter.name] = res.value.items.length;
    } else {
      failedSources.push(adapter.name);
      sourceRawCounts[adapter.name] = 0;
      console.error(`[Source Failed] ${adapter.name}:`, res.reason?.message || res.reason);
    }
  }

  console.log(`\n[Panchbibi News Feed] Sources Summary: ${activeSources.length} successful, ${failedSources.length} failed`);
  console.log(`[Panchbibi News Feed] Total raw items collected: ${allRawItems.length}`);

  // Fallback protection if all sources failed
  if (activeSources.length === 0 && failedSources.length > 0) {
    if (existingFeed && existingFeed.items && existingFeed.items.length > 0) {
      console.warn('[WARNING] All sources failed during fetch! Preserving previous feed unchanged.');
      if (!fs.existsSync(JS_FILE)) {
        fs.writeFileSync(JS_FILE, serializeToJs(existingFeed), 'utf8');
      }
      if (!fs.existsSync(STATUS_FILE)) {
        fs.writeFileSync(STATUS_FILE, generateStatusHtml(existingFeed, activeSources, failedSources), 'utf8');
      }
      return;
    } else {
      console.error('[CRITICAL] All sources failed and no existing feed available!');
      process.exit(1);
    }
  }

  // Filter and validate raw items for Panchbibi relevance
  const validatedNewItems: NewsItem[] = [];
  let rejectedCount = 0;
  const sourceMatchedCounts: Record<string, number> = {};
  const sourceAcceptedCounts: Record<string, number> = {};

  for (const raw of allRawItems) {
    const titleAndSlug = `${raw.title || ''} ${raw.url || ''}`.toLowerCase();
    const isMatched = titleAndSlug.includes('পাঁচবিবি') ||
      raw.rawLocation === 'panchbibi' ||
      raw.rawLocation === 'panchbibi-category' ||
      raw.rawLocation === 'panchbibi-search';

    if (isMatched) {
      sourceMatchedCounts[raw.source] = (sourceMatchedCounts[raw.source] || 0) + 1;
    }

    const filterRes = filterAndValidate(raw, discoveredAt);
    if (filterRes.accepted && filterRes.item) {
      validatedNewItems.push(filterRes.item);
      sourceAcceptedCounts[raw.source] = (sourceAcceptedCounts[raw.source] || 0) + 1;
    } else {
      rejectedCount++;
    }
  }

  console.log(`[Panchbibi News Feed] Validated new Panchbibi items: ${validatedNewItems.length} (Rejected ${rejectedCount} non-relevant/invalid)`);

  // Enrich newly validated items missing dates or images
  console.log(`[Panchbibi News Feed] Enriching newly validated items with article metadata...`);
  const enrichedNewItems = await enrichNewsItems(validatedNewItems, 4);

  // Also enrich any historical items currently missing dates or images
  console.log(`[Panchbibi News Feed] Enriching historical items missing metadata...`);
  const enrichedHistoricalItems = await enrichNewsItems(purgedExistingItems, 4);

  // Deduplicate and merge with rolling history (up to 100 items, 180 days)
  const mergedItems = deduplicateAndMerge(enrichedHistoricalItems, enrichedNewItems, 100, 180);
  console.log(`[Panchbibi News Feed] Merged & deduplicated total items: ${mergedItems.length}`);

  // Calculate metrics for diagnostics
  const historicalUrls = new Set(enrichedHistoricalItems.map(i => i.url));
  const duplicatesSkipped = enrichedNewItems.filter(i => historicalUrls.has(i.url)).length;
  const newAccepted = enrichedNewItems.length - duplicatesSkipped;
  const newestItem = mergedItems.find(i => !!i.publishedAt);
  const newestArticleDate = newestItem?.publishedAt ? newestItem.publishedAt.slice(0, 10) : 'N/A';

  // Output compact diagnostic summary
  console.log('\n' + '='.repeat(50));
  console.log('Panchbibi News Feed Run\n');
  for (const adapter of ALL_ADAPTERS) {
    const name = adapter.name;
    const rawFetched = sourceRawCounts[name] || 0;
    const matched = sourceMatchedCounts[name] || 0;
    const accepted = sourceAcceptedCounts[name] || 0;
    const errors = failedSources.includes(name) ? 1 : 0;

    console.log(`${name}`);
    console.log(`Fetched: ${rawFetched}`);
    console.log(`Matched: ${matched}`);
    console.log(`Accepted: ${accepted}`);
    console.log(`Errors: ${errors}\n`);
  }
  console.log(`New accepted: ${newAccepted}`);
  console.log(`Duplicates skipped: ${duplicatesSkipped}`);
  console.log(`Source failures: ${failedSources.length}`);
  console.log(`Feed total: ${mergedItems.length}`);
  console.log(`Newest article: ${newestArticleDate}`);
  console.log('='.repeat(50) + '\n');

  // Write GitHub Actions Job Step Summary if environment variable exists
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      const summaryLines: string[] = [
        `## 📰 Panchbibi News Feed Run Summary`,
        ``,
        `| Source | Status | Fetched | Matched | Accepted | Errors |`,
        `|:---|:---:|:---:|:---:|:---:|:---:|`
      ];

      for (const adapter of ALL_ADAPTERS) {
        const name = adapter.name;
        const isFailed = failedSources.includes(name);
        const status = isFailed ? '❌ FAILED' : '✅ OK';
        const rawFetched = sourceRawCounts[name] || 0;
        const matched = sourceMatchedCounts[name] || 0;
        const accepted = sourceAcceptedCounts[name] || 0;
        const errors = isFailed ? 1 : 0;
        summaryLines.push(`| **${name}** | ${status} | ${rawFetched} | ${matched} | ${accepted} | ${errors} |`);
      }

      summaryLines.push(``);
      summaryLines.push(`- **New accepted:** ${newAccepted}`);
      summaryLines.push(`- **Duplicates skipped:** ${duplicatesSkipped}`);
      summaryLines.push(`- **Source failures:** ${failedSources.length}`);
      summaryLines.push(`- **Feed total:** ${mergedItems.length}`);
      summaryLines.push(`- **Newest article:** ${newestArticleDate}`);
      summaryLines.push(``);

      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryLines.join('\n'), 'utf8');
      console.log('[Panchbibi News Feed] Successfully appended summary to GITHUB_STEP_SUMMARY');
    } catch (e: any) {
      console.warn('[Panchbibi News Feed] Failed writing to GITHUB_STEP_SUMMARY:', e.message);
    }
  }

  // Check if content changed
  const oldFingerprint = existingFeed ? computeItemsFingerprint(existingFeed.items) : '';
  const newFingerprint = computeItemsFingerprint(mergedItems);
  const contentChanged = oldFingerprint !== newFingerprint;

  const generatedAt = contentChanged || !existingFeed ? discoveredAt : existingFeed.generatedAt;
  const sourceNamesInFeed = new Set(mergedItems.map(i => i.source));

  const feedOutput: NewsFeed = {
    generatedAt,
    count: mergedItems.length,
    sources: sourceNamesInFeed.size,
    items: mergedItems
  };

  const nojekyllFile = path.join(PUBLIC_DIR, '.nojekyll');
  if (!fs.existsSync(nojekyllFile)) {
    fs.writeFileSync(nojekyllFile, '', 'utf8');
  }

  if (!contentChanged && fs.existsSync(JSON_FILE) && fs.existsSync(JS_FILE) && fs.existsSync(STATUS_FILE)) {
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
  console.log(` - ${nojekyllFile}`);
}

main().catch(err => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});

