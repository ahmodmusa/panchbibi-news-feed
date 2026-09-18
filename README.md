# Panchbibi News Feed

An automated, lightweight news discovery and aggregation system for **Panchbibi Upazila (Joypurhat, Bangladesh)**.

This system automatically aggregates recent Panchbibi-related news from reliable national and regional Bangladeshi news publishers, normalizes and deduplicates the records, and deploys static JSON/JS feeds to **GitHub Pages** via **GitHub Actions**.

The client-side website (**Panchbibi.com**) consumes this feed directly in the visitor's browser at runtime, achieving a **zero-Cloudflare-build, zero-serverless-cost** architecture.

---

## Architecture

```text
Reliable Bangladeshi News Sources
 (Dhaka Post, Prothom Alo, Silk City News, Daily Karatoa, Ajker Patrika, Daily Bangladesh)
                     ↓
      GitHub Actions Scheduled Fetch (Every 6h)
                     ↓
       Normalize + Filter + Deduplicate
                     ↓
        public/news.json & public/news.js
                     ↓
          GitHub Pages Deployment
                     ↓
      Panchbibi.com loads feed client-side
```

### Key Highlights
* **Zero Cloudflare Build Cost**: Panchbibi.com is not rebuilt when news updates occur.
* **Idempotent Automation**: GitHub Actions only creates a git commit when new or changed news stories are actually discovered (`4 checks/day ≠ 4 Git commits/day`).
* **Source Isolation**: Failure or timeout in one publisher does not crash or interrupt other publishers.
* **Fail-Safe Retention**: If all external sources temporarily fail, the previous healthy feed is preserved unchanged.
* **Strict Copyright & Fair Dealing**: No full article text, copyrighted body copy, or images are scraped or republished. Visitors click through to the original publisher.

---

## Generated Feed Endpoints

Once deployed on GitHub Pages, the feed is publicly available at:

* **JSON Feed:** `https://ahmodmusa.github.io/panchbibi-news-feed/news.json`
* **JS Fallback Feed:** `https://ahmodmusa.github.io/panchbibi-news-feed/news.js` (`window.PANCHBIBI_NEWS_FEED = {...}`)
* **Status / Diagnostics Page:** `https://ahmodmusa.github.io/panchbibi-news-feed/`

---

## Relevance Filtering

Stories are categorized into three tiers:

1. **Tier A — Direct Panchbibi Mentions:**
   * Headlines or slugs explicitly referencing `পাঁচবিবি`, `Panchbibi`, or spelling variations.
2. **Tier B — Panchbibi Entities & Unions:**
   * Headlines referencing verified unions (বাগজানা, ধরঞ্জী, আয়মারসুলপুর, বালিঘাটা, আটাপুর, মোহাম্মদপুর, আওলাই, কুসুম্বা) or known landmarks (কাঁকড়া পিংলু, পাথরঘাটা নিমাই শাহ, উচনা সীমান্ত, পাঁচবিবি থানা/পৌরসভা/রেলস্টেশন).
3. **Tier C — Generic Joypurhat Stories:**
   * District-wide Joypurhat stories that do NOT involve Panchbibi or its unions are **automatically excluded** to prevent feed dilution.

---

## Local Development

### Prerequisites
* Node.js 20+

### Installation
```bash
npm install
```

### Running the Aggregator
```bash
npm run fetch
```
Generates `public/news.json`, `public/news.js`, and `public/index.html`. If no new items are discovered, existing files are preserved untouched.

### Running Unit Tests
```bash
npm test
```
Runs the automated test suite covering URL canonicalization, relevance filtering, deduplication, and safe JavaScript serialization.

### Type Check
```bash
npm run check
```

---

## Adding a New Source

1. Create a new adapter file in `src/sources/<publisher>.ts` implementing the `SourceAdapter` interface:
   ```ts
   import { RawNewsItem, SourceAdapter } from '../types.js';

   export const myAdapter: SourceAdapter = {
     name: 'Publisher Name',
     sourceType: 'rss' | 'api' | 'category' | 'search',
     async fetch(): Promise<RawNewsItem[]> {
       // Return array of RawNewsItem
     }
   };
   ```
2. Register the adapter in `src/sources/index.ts`.
3. Test locally using `npm run fetch` and verify output.
4. Document the source in `docs/SOURCES.md`.

---

## Copyright Policy

This project operates strictly as a factual metadata index:
* Collects only headlines, canonical article URLs, publisher names, and publication timestamps.
* Does NOT store article body paragraphs.
* Does NOT hotlink or re-host publisher images.
* All links direct users to the original publisher with `rel="noopener noreferrer"`.
