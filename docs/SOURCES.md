# Source Discovery & Investigation Report

This document records all investigated Bangladeshi news publishers for the **Panchbibi News Feed** aggregator. It details active integrated adapters as well as rejected sources to prevent future agents and developers from repeatedly investigating unsuitable endpoints.

---

## Summary

* **Total Publishers Investigated:** 22
* **Publishers Successfully Integrated:** 6
* **Publishers Rejected:** 16

---

## 1. Integrated Active Publishers

### 1. Dhaka Post (`dhakapost.com`)
* **Discovery URL:**
  * `https://www.dhakapost.com/country/jaipurhat/panchbibi-news` (Dedicated Panchbibi section)
  * `https://www.dhakapost.com/country/jaipurhat-news` (District section)
* **Method:** Category list page parsing (extracting Next.js RSC payload / HTML article markup)
* **Status:** Active
* **Panchbibi Coverage:** High (dedicated Panchbibi upazila subcategory)
* **Update Reliability:** High
* **Extracted Fields:** Title, URL, Bengali timestamp (`১৫ সেপ্টেম্বর ২০২৬, ০৫:৫০`), location context.
* **Notes:** Protected by Cloudflare WAF on some endpoints; handled gracefully via standard browser headers and fallback request handler.

### 2. Prothom Alo (`prothomalo.com`)
* **Discovery URL:**
  * `https://www.prothomalo.com/api/v1/search?q=%E0%A6%AA%E0%A6%BE%E0%A6%81%E0%A6%9A%E0%A6%AC%E0%A6%BF%E0%A6%AC%E0%A6%BF&size=30`
* **Method:** Official Quintype REST Search API
* **Status:** Active
* **Panchbibi Coverage:** High (reports on major incidents, border security, student health, local administration)
* **Update Reliability:** Excellent
* **Extracted Fields:** Title (`headline`), URL (`slug`), exact ISO publication timestamp (`published-at`), section tags.
* **Notes:** Clean structured JSON API without scraping article bodies.

### 3. Silk City News (`silkcitynews.com`)
* **Discovery URL:**
  * `https://silkcitynews.com/wp-json/wp/v2/posts?search=%E0%A6%AA%E0%A6%BE%E0%A6%81%E0%A6%9A%E0%A6%AC%E0%A6%BF%E0%A6%AC%E0%A6%BF&per_page=25`
* **Method:** Official WordPress REST API
* **Status:** Active
* **Panchbibi Coverage:** High (premier regional news outlet for Rajshahi Division)
* **Update Reliability:** High
* **Extracted Fields:** Title (`title.rendered`), original post link, ISO publication date.
* **Notes:** High relevance for Northern Bangladesh and Rajshahi division local reporting.

### 4. Daily Karatoa (`dailykaratoa.com`)
* **Discovery URL:**
  * `https://www.dailykaratoa.com/search?q=%E0%A6%AA%E0%A6%BE%E0%A6%81%E0%A6%9A%E0%A6%AC%E0%A6%BF%E0%A6%AC%E0%A6%BF`
* **Method:** Search result page parsing
* **Status:** Active
* **Panchbibi Coverage:** Exceptional (historic Bogura/North Bengal daily with dedicated Panchbibi and Bagjana correspondents)
* **Update Reliability:** High
* **Extracted Fields:** Headline, canonical article URL.
* **Notes:** Deep local village, union, and upazila institutional reporting.

### 5. Ajker Patrika (`ajkerpatrika.com`)
* **Discovery URL:**
  * `https://www.ajkerpatrika.com/topic/%E0%A6%AA%E0%A6%BE%E0%A6%81%E0%A6%9A%E0%A6%AC%E0%A6%BF%E0%A6%AC%E0%A6%BF`
* **Method:** Dedicated Panchbibi topic page parser
* **Status:** Active
* **Panchbibi Coverage:** High (dedicated topic tag for Panchbibi)
* **Update Reliability:** High
* **Extracted Fields:** Headline, relative article URL normalized to HTTPS.
* **Notes:** Clean server-rendered HTML cards.

### 6. Daily Bangladesh (`daily-bangladesh.com`)
* **Discovery URL:**
  * `https://www.daily-bangladesh.com/district/joypurhat`
* **Method:** District category page parsing with strict Panchbibi keyword filtering
* **Status:** Active
* **Panchbibi Coverage:** Moderate
* **Update Reliability:** High
* **Extracted Fields:** Headline, article URL.
* **Notes:** All items are filtered through Tier A/Tier B relevance check to eliminate Joypurhat-only false positives.

---

## 2. Investigated but Rejected Publishers

The following sources were researched and evaluated, but rejected for the technical reasons specified below:

| Publisher | Attempted URLs / Endpoints | Reason for Rejection |
| :--- | :--- | :--- |
| **Jugantor** | `jugantor.com/country-news/rajshahi/joypurhat`, `/rss.xml` | **Cloudflare Bot Fight Mode**: Returns HTTP 403 Forbidden on all automated HTTP requests. |
| **Jago News 24** | `jagonews24.com/country/joypurhat`, `/rss/rss.xml` | **Cloudflare Bot Fight Mode**: Returns HTTP 403 Forbidden. |
| **Kaler Kantho** | `kalerkantho.com/online/country-news`, `/rss.xml` | **Cloudflare Bot Fight Mode**: Returns HTTP 403 Forbidden. |
| **Ittefaq** | `ittefaq.com.bd/country`, `/feed` | **Cloudflare Bot Fight Mode**: Returns HTTP 403 Forbidden. |
| **Samakal** | `samakal.com/country`, `/feed` | **Cloudflare Bot Fight Mode**: Returns HTTP 403 Forbidden. |
| **Bangla Tribune** | `banglatribune.com/country`, `/feed` | **Cloudflare Bot Fight Mode**: Returns HTTP 403 Forbidden. |
| **Somoy News** | `somoynews.tv/district/joypurhat`, `/rss`, `/api/*` | **Site Maintenance Mode**: Site is currently serving maintenance page (`সময় — রক্ষণাবেক্ষণ`) for all routes. |
| **RisingBD** | `risingbd.com/country-news/joypurhat`, `/rss.xml` | **Cloudflare Bot Fight Mode**: Main site blocked (403). Subdomain `api.risingbd.com` returns default unconfigured CodeIgniter welcome page. |
| **Barta24** | `barta24.com/district/joypurhat`, `/search` | **Client-Rendered SPA Without SSR**: Category/search URLs return empty React shell HTML; no articles in server response. |
| **Dhaka Times** | `dhakatimes24.com/topic/পাঁচবিবি` | **No Data**: Panchbibi topic page renders "There is no data found". |
| **Daily Naya Diganta**| `dailynayadiganta.com/search`, `/category/panchbibi/225` | **Client-Rendered SPA**: Next.js shell does not embed category articles in SSR HTML; SSL certificate hostname mismatch on `www`. |
| **BSS News** | `bssnews.net/bangla/district`, `/bangla/rss` | **Access Blocked**: HTTP 403 Forbidden on automated requests. |
| **UNB** | `unb.com.bd/category/Bangladesh`, `/rss` | **Missing Feeds**: Returns HTTP 404 Not Found on RSS and category feeds. |
| **bdnews24** | `bangla.bdnews24.com/search`, `/rss` | **Client-Side Search**: Search page requires full browser JS execution; RSS returns 404. |
| **The Daily Star (Bangla)** | `bangla.thedailystar.net/rss.xml` | **Insufficient Granularity**: RSS only provides 1–2 top national headlines at a time; no district/search feed available. |
| **Ekattor TV** | `ekattor.tv/category/country`, `/rss.xml` | **Access Blocked**: Returns HTTP 403 Forbidden. |
| **Dhaka Tribune** | `dhakatribune.com/bangladesh`, `/rss` | **Access Blocked**: Returns HTTP 403 Forbidden. |
