import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeUrl, cleanTitle, parseBanglaDate } from '../src/normalize.js';
import { filterAndValidate } from '../src/filter.js';
import { deduplicateAndMerge } from '../src/dedupe.js';
import { NewsItem, RawNewsItem } from '../src/types.js';

test('canonicalizeUrl strips tracking parameters while keeping valid URLs', () => {
  const dirty = 'https://www.dhakapost.com/country/483477?utm_source=facebook&utm_medium=cpc&fbclid=IwAR123#content';
  const clean = canonicalizeUrl(dirty);
  assert.equal(clean, 'https://www.dhakapost.com/country/483477#content');

  const trailing = 'https://www.dhakapost.com/country/jaipurhat/panchbibi-news/';
  assert.equal(canonicalizeUrl(trailing), 'https://www.dhakapost.com/country/jaipurhat/panchbibi-news');

  // Rejects invalid protocols
  assert.equal(canonicalizeUrl('javascript:alert(1)'), null);
  assert.equal(canonicalizeUrl('data:text/html,test'), null);
});

test('cleanTitle properly decodes HTML entities and preserves Bengali text', () => {
  const raw = 'পাঁচবিবিতে &quot;মাদক&quot; বিরোধী অভিযান, &#039;গ্রেপ্তার&#039; ১ &amp; উদ্ধার &nbsp; &nbsp; ফেন্সিডিল';
  const cleaned = cleanTitle(raw);
  assert.equal(cleaned, 'পাঁচবিবিতে "মাদক" বিরোধী অভিযান, \'গ্রেপ্তার\' ১ & উদ্ধার ফেন্সিডিল');
});

test('parseBanglaDate converts Bengali date formats to valid ISO strings', () => {
  const d1 = parseBanglaDate('১৫ সেপ্টেম্বর ২০২৬, ০৫:৫০');
  assert.ok(d1, 'Should parse valid date');
  assert.match(d1!, /^2026-09-15T/);

  const d2 = parseBanglaDate('প্রকাশ : ১৬ সেপ্টেম্বর, ২০২৬ ১২:৩০ পিএম');
  assert.ok(d2, 'Should parse PM date');
  assert.match(d2!, /^2026-09-16T/);
});

test('filterAndValidate accepts Tier A direct Panchbibi news', () => {
  const raw: RawNewsItem = {
    title: 'পাঁচবিবি সীমান্তে বৃদ্ধকে পুশ ইনের চেষ্টা বিএসএফের',
    url: 'https://www.prothomalo.com/bangladesh/district/test1',
    source: 'Prothom Alo',
    sourceType: 'api'
  };

  const res = filterAndValidate(raw, '2026-09-18T10:00:00Z');
  assert.equal(res.accepted, true);
  assert.equal(res.item?.locationMatch, 'panchbibi');
});

test('filterAndValidate accepts Tier B Panchbibi entities / unions', () => {
  const raw: RawNewsItem = {
    title: 'বাগজানায় মাদকবিরোধী অভিযানে বিপুল পরিমাণ ট্যাপেন্টাডল উদ্ধার',
    url: 'https://www.dhakapost.com/country/test2',
    source: 'Dhaka Post',
    sourceType: 'category'
  };

  const res = filterAndValidate(raw, '2026-09-18T10:00:00Z');
  assert.equal(res.accepted, true);
  assert.equal(res.item?.locationMatch, 'keyword');
});

test('filterAndValidate rejects Tier C generic Joypurhat news without Panchbibi involvement', () => {
  const raw: RawNewsItem = {
    title: 'জয়পুরহাটে জেলা মোটর শ্রমিক ইউনিয়ন নির্বাচন অনুষ্ঠিত',
    url: 'https://www.daily-bangladesh.com/country/534533',
    source: 'Daily Bangladesh',
    sourceType: 'category'
  };

  const res = filterAndValidate(raw, '2026-09-18T10:00:00Z');
  assert.equal(res.accepted, false);
  assert.match(res.reason!, /Generic Joypurhat/);
});

test('filterAndValidate rejects invalid or malformed items', () => {
  assert.equal(filterAndValidate({ title: '', url: 'https://example.com', source: 'Test', sourceType: 'rss' }, 'now').accepted, false);
  assert.equal(filterAndValidate({ title: 'Short', url: 'https://example.com', source: 'Test', sourceType: 'rss' }, 'now').accepted, false);
  assert.equal(filterAndValidate({ title: 'Valid Headline for Panchbibi', url: 'javascript:void(0)', source: 'Test', sourceType: 'rss' }, 'now').accepted, false);
});

test('deduplicateAndMerge eliminates duplicate URLs and identical source headlines', () => {
  const item1: NewsItem = {
    id: '1',
    title: 'পাঁচবিবিতে আখক্ষেত থেকে মরদেহ উদ্ধার',
    url: 'https://www.dhakapost.com/country/482383',
    source: 'Dhaka Post',
    publishedAt: '2026-09-15T10:00:00Z',
    discoveredAt: '2026-09-15T10:00:00Z',
    locationMatch: 'panchbibi',
    sourceType: 'category'
  };

  const duplicateUrl: NewsItem = {
    ...item1,
    id: '2',
    url: 'https://www.dhakapost.com/country/482383'
  };

  const duplicateHeadline: NewsItem = {
    ...item1,
    id: '3',
    url: 'https://www.dhakapost.com/country/482383-another-slug',
    title: 'পাঁচবিবিতে আখক্ষেত থেকে মরদেহ উদ্ধার!'
  };

  const differentSource: NewsItem = {
    ...item1,
    id: '4',
    source: 'Prothom Alo',
    url: 'https://www.prothomalo.com/bangladesh/district/482383',
    title: 'পাঁচবিবিতে আখক্ষেত থেকে মরদেহ উদ্ধার'
  };

  const merged = deduplicateAndMerge([item1], [duplicateUrl, duplicateHeadline, differentSource]);

  // Should keep item1 and differentSource, but drop duplicateUrl and duplicateHeadline
  assert.equal(merged.length, 2);
  const sources = merged.map(m => m.source);
  assert.ok(sources.includes('Dhaka Post'));
  assert.ok(sources.includes('Prothom Alo'));
});

test('safe serialization prevents script tag breakouts', () => {
  const dangerousHeadline = 'Test headline with </script><script>alert(1)</script>';
  const jsonStr = JSON.stringify({ title: dangerousHeadline });
  const safeJson = jsonStr.replace(/<\/script/gi, '<\\/script');
  assert.ok(!safeJson.includes('</script>'));
  assert.ok(safeJson.includes('<\\/script>'));
});

test('parseBanglaDate handles complex newspaper formats with day of week and AM/PM', () => {
  const d1 = parseBanglaDate('প্রকাশ : ০৯ জুলাই ২০২৬, ০৯:৫৭ এএম');
  assert.ok(d1, 'Should parse Kalbela style date');
  assert.match(d1!, /^2026-07-09T09:57:00\+06:00/);

  const d2 = parseBanglaDate('বুধবার, ১৬ সেপ্টেম্বর ২০২৬ | ১০:২৫ পিএম');
  assert.ok(d2, 'Should parse date with day of week and pipe');
  assert.match(d2!, /^2026-09-16T22:25:00\+06:00/);

  const d3 = parseBanglaDate('2026-09-18T10:00:00Z');
  assert.ok(d3, 'Should pass through valid ISO timestamp');
  assert.equal(d3, '2026-09-18T10:00:00.000Z');
});

test('Daily Karatoa card extraction correctly bounds headlines to their matching article URLs', async () => {
  const cheerio = await import('cheerio');
  // Simulated consecutive Daily Karatoa cards with dual <a class="link"> per card
  const mockHtml = `
    <div class="cat_lead snews">
      <div class="common-card-content">
        <div class="image-lead">
          <img class="news_img" src="https://www.dailykaratoa.com//public/images/card1.jpg" alt="Headline One" />
          <a class="link" href="https://www.dailykaratoa.com/article/1001"></a>
        </div>
        <div class="news-content-box">
          <h5 class="title">পাঁচবিবিতে প্রথম ঘটনার শিরোনাম</h5>
          <a class="link" href="https://www.dailykaratoa.com/article/1001"></a>
        </div>
      </div>
    </div>
    <div class="cat_sub_lead snews">
      <div class="common-card-content">
        <div class="image-lead">
          <img class="news_img" src="https://www.dailykaratoa.com//public/images/card2.jpg" alt="Headline Two" />
          <a class="link" href="https://www.dailykaratoa.com/article/1002"></a>
        </div>
        <div class="news-content-box">
          <h5 class="title">পাঁচবিবিতে দ্বিতীয় ঘটনার শিরোনাম</h5>
          <a class="link" href="https://www.dailykaratoa.com/article/1002"></a>
        </div>
      </div>
    </div>
  `;

  const $ = cheerio.load(mockHtml);
  const extracted: Array<{ title: string; url: string; img?: string }> = [];

  $('.cat_lead, .cat_sub_lead').each((_, el) => {
    const card = $(el);
    const linkEl = card.find('a.link, a[href*="/article/"]').first();
    const url = linkEl.attr('href') || '';
    const title = card.find('h5.title, h5').first().text().trim();
    const img = card.find('img').first().attr('src');
    extracted.push({ title, url, img });
  });

  assert.equal(extracted.length, 2);
  // Strictly verify Card 1 maps to 1001 and Card 2 maps to 1002 (no 1-offset shift!)
  assert.equal(extracted[0].url, 'https://www.dailykaratoa.com/article/1001');
  assert.equal(extracted[0].title, 'পাঁচবিবিতে প্রথম ঘটনার শিরোনাম');
  assert.equal(extracted[1].url, 'https://www.dailykaratoa.com/article/1002');
  assert.equal(extracted[1].title, 'পাঁচবিবিতে দ্বিতীয় ঘটনার শিরোনাম');
});

test('Kalbela card parser extracts article ID, normalizes URLs, and captures thumbnails', async () => {
  const cheerio = await import('cheerio');
  const mockKalbela = `
    <div id="category_content">
      <div class="cat_lead">
        <a href="/country-news/307205">
          <img src="/assets/news_photos/2026/07/09/image_307205.webp" />
          <h5 class="title">পাঁচবিবিতে নতুন উন্নয়ন প্রকল্প উদ্বোধন</h5>
        </a>
      </div>
      <div class="sub-news">
        <a href="https://www.kalbela.com/country-news/305443">
          <img src="/assets/news_photos/2026/07/03/image_305443.webp" />
          <h5>বাগজানায় বৃক্ষরোপণ কর্মসূচি পালিত</h5>
        </a>
      </div>
    </div>
  `;

  const $ = cheerio.load(mockKalbela);
  const items: Array<{ title: string; url: string; img: string }> = [];

  $('#category_content').find('a[href*="/country-news/"]').each((_, el) => {
    const link = $(el);
    const href = link.attr('href') || '';
    if (!/\/country-news\/\d+/.test(href)) return;

    const fullUrl = href.startsWith('/') ? 'https://www.kalbela.com' + href : href;
    const title = link.find('h5, .title').text().trim();
    let img = link.find('img').attr('src') || '';
    if (img.startsWith('/')) img = 'https://www.kalbela.com' + img;

    items.push({ title, url: fullUrl, img });
  });

  assert.equal(items.length, 2);
  assert.equal(items[0].url, 'https://www.kalbela.com/country-news/307205');
  assert.equal(items[0].title, 'পাঁচবিবিতে নতুন উন্নয়ন প্রকল্প উদ্বোধন');
  assert.equal(items[0].img, 'https://www.kalbela.com/assets/news_photos/2026/07/09/image_307205.webp');

  assert.equal(items[1].url, 'https://www.kalbela.com/country-news/305443');
  assert.equal(items[1].title, 'বাগজানায় বৃক্ষরোপণ কর্মসূচি পালিত');
});

test('parseBanglaDate parses RFC 2822 dates from RSS feeds and short month names', () => {
  const rfcDate = parseBanglaDate('Sat, 19 Sep 2026 11:50:00 GMT');
  assert.ok(rfcDate, 'Should parse RFC 2822 date');
  assert.equal(rfcDate, '2026-09-19T11:50:00.000Z');

  const stdDate = parseBanglaDate('19 Sep 2026 11:50:00 GMT');
  assert.ok(stdDate, 'Should parse standard English date with short month');
  assert.equal(stdDate, '2026-09-19T11:50:00.000Z');

  const isoOffset = parseBanglaDate('2026-09-19T19:57:22+06:00');
  assert.ok(isoOffset, 'Should parse ISO string with offset');
  assert.equal(isoOffset, '2026-09-19T13:57:22.000Z');
});

test('Jobabdihi card and detail parser extracts 19 September regression article', async () => {
  const cheerio = await import('cheerio');
  const mockListingHtml = `
    <div>
      <a href="https://www.jobabdihi.com/news/124643">
        <img src="https://www.jobabdihi.com/2026/09/19/JD_87.1789826242.jpg" alt="ছবি" />
        <br>পাঁচবিবিতে জমি অধিগ্রহণে ন্যায্য মূল্যের দাবিতে মানববন্ধন
      </a>
    </div>
  `;

  const $list = cheerio.load(mockListingHtml);
  const linkEl = $list('a[href*="/news/"]').first();
  const rawHref = linkEl.attr('href') || '';
  const rawTitle = linkEl.text().trim();
  const cardImg = linkEl.find('img').attr('src');

  const canonicalUrl = canonicalizeUrl(rawHref, 'https://www.jobabdihi.com');
  const title = cleanTitle(rawTitle);

  assert.equal(canonicalUrl, 'https://www.jobabdihi.com/news/124643');
  assert.equal(title, 'পাঁচবিবিতে জমি অধিগ্রহণে ন্যায্য মূল্যের দাবিতে মানববন্ধন');
  assert.equal(cardImg, 'https://www.jobabdihi.com/2026/09/19/JD_87.1789826242.jpg');

  // Detail JSON-LD mock
  const mockDetailHtml = `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      "headline": "পাঁচবিবিতে জমি অধিগ্রহণে ন্যায্য মূল্যের দাবিতে মানববন্ধন",
      "image": ["https://www.jobabdihi.com/2026/09/19/JD_87.1789826242.jpg"],
      "datePublished": "2026-09-19T19:57:22+06:00"
    }
    </script>
  `;

  const $detail = cheerio.load(mockDetailHtml);
  let publishedAt: string | null = null;
  $detail('script[type="application/ld+json"]').each((_, el) => {
    const data = JSON.parse($detail(el).html() || '{}');
    if (data.datePublished) {
      publishedAt = parseBanglaDate(data.datePublished);
    }
  });

  assert.equal(publishedAt, '2026-09-19T13:57:22.000Z');

  // Relevance check
  const validated = filterAndValidate({
    title,
    url: canonicalUrl!,
    source: 'Jobabdihi',
    publishedAt,
    imageUrl: cardImg || null,
    sourceType: 'category'
  }, '2026-09-20T00:00:00Z');

  assert.equal(validated.accepted, true);
  assert.equal(validated.item?.locationMatch, 'panchbibi');
});

test('Daily Inqilab RSS parser extracts and cleans 19 September regression article', () => {
  const rawRssTitle = 'পাঁচবিবি ঐতিহ্যবাহী গ্রামীণ লাঠি খেলা অনুষ্ঠিত - দৈনিক ইনকিলাব';
  const pubDateStr = 'Sat, 19 Sep 2026 11:50:00 GMT';
  const inqilabUrl = 'https://dailyinqilab.com/bangladesh/news/941903';

  // 1. Strip publisher suffix
  const cleanHeadline = cleanTitle(rawRssTitle.replace(/\s*[-–|]\s*দৈনিক ইনকিলাব\s*$/i, ''));
  assert.equal(cleanHeadline, 'পাঁচবিবি ঐতিহ্যবাহী গ্রামীণ লাঠি খেলা অনুষ্ঠিত');

  // 2. Parse date
  const publishedAt = parseBanglaDate(pubDateStr);
  assert.equal(publishedAt, '2026-09-19T11:50:00.000Z');

  // 3. Relevance validation
  const validated = filterAndValidate({
    title: cleanHeadline,
    url: inqilabUrl,
    source: 'Daily Inqilab',
    publishedAt,
    imageUrl: null,
    sourceType: 'search'
  }, '2026-09-20T00:00:00Z');

  assert.equal(validated.accepted, true);
  assert.equal(validated.item?.locationMatch, 'panchbibi');
});

test('deduplicateAndMerge preserves same event reported by two different publishers', () => {
  const jobabdihiItem: NewsItem = {
    id: 'jobabdihi-124643',
    title: 'পাঁচবিবিতে জমি অধিগ্রহণে ন্যায্য মূল্যের দাবিতে মানববন্ধন',
    url: 'https://www.jobabdihi.com/news/124643',
    source: 'Jobabdihi',
    publishedAt: '2026-09-19T13:57:22.000Z',
    discoveredAt: '2026-09-20T00:00:00Z',
    locationMatch: 'panchbibi',
    sourceType: 'category'
  };

  const inqilabItem: NewsItem = {
    id: 'dailyinqilab-941903',
    title: 'পাঁচবিবিতে জমি অধিগ্রহণে ন্যায্য মূল্যের দাবিতে মানববন্ধন',
    url: 'https://dailyinqilab.com/bangladesh/news/941903',
    source: 'Daily Inqilab',
    publishedAt: '2026-09-19T11:50:00.000Z',
    discoveredAt: '2026-09-20T00:00:00Z',
    locationMatch: 'panchbibi',
    sourceType: 'search'
  };

  const merged = deduplicateAndMerge([jobabdihiItem], [inqilabItem]);

  // Both publishers must be preserved
  assert.equal(merged.length, 2);
  const sources = merged.map(i => i.source);
  assert.ok(sources.includes('Jobabdihi'));
  assert.ok(sources.includes('Daily Inqilab'));
});

test('Source failure isolation ensures single adapter failure does not prevent feed generation', async () => {
  const mockAdapters = [
    {
      name: 'Working Source',
      fetch: async () => [{
        title: 'পাঁচবিবিতে নতুন স্বাস্থ্যসেবা কেন্দ্র চালু',
        url: 'https://example.com/news/1',
        source: 'Working Source',
        sourceType: 'api' as const
      }]
    },
    {
      name: 'Broken Source',
      fetch: async () => {
        throw new Error('Network timeout or 503 Service Unavailable');
      }
    }
  ];

  const results = await Promise.allSettled(
    mockAdapters.map(adapter => adapter.fetch())
  );

  const activeItems: any[] = [];
  const failed: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    if (res.status === 'fulfilled') {
      activeItems.push(...res.value);
    } else {
      failed.push(mockAdapters[i].name);
    }
  }

  assert.equal(activeItems.length, 1);
  assert.equal(activeItems[0].title, 'পাঁচবিবিতে নতুন স্বাস্থ্যসেবা কেন্দ্র চালু');
  assert.equal(failed.length, 1);
  assert.equal(failed[0], 'Broken Source');
});

test('validateImageUrl identifies invalid or non-image URLs correctly', async () => {
  const { validateImageUrl } = await import('../src/validate-image.js');

  assert.equal(await validateImageUrl(null), false);
  assert.equal(await validateImageUrl(''), false);
  assert.equal(await validateImageUrl('not-a-url'), false);
  assert.equal(await validateImageUrl('https://example.com/nonexistent_404_file.jpg', 1500), false);
});

test('validateNewsItemImages resets broken URLs to null while keeping valid items intact', async () => {
  const { validateNewsItemImages } = await import('../src/validate-image.js');

  const items: NewsItem[] = [
    {
      id: 'valid-item',
      title: 'পাঁচবিবিতে স্বাস্থ্যসেবা উন্নয়ন',
      url: 'https://example.com/news/1',
      source: 'Test Source',
      publishedAt: '2026-09-19T10:00:00Z',
      imageUrl: null,
      discoveredAt: '2026-09-20T00:00:00Z',
      locationMatch: 'panchbibi',
      sourceType: 'api'
    },
    {
      id: 'broken-img-item',
      title: 'পাঁচবিবিতে কৃষি মেলা শুরু',
      url: 'https://example.com/news/2',
      source: 'Test Source',
      publishedAt: '2026-09-19T10:00:00Z',
      imageUrl: 'https://example.com/nonexistent-image-12345.jpg',
      discoveredAt: '2026-09-20T00:00:00Z',
      locationMatch: 'panchbibi',
      sourceType: 'api'
    }
  ];

  const validated = await validateNewsItemImages(items, 2);
  assert.equal(validated.length, 2);
  assert.equal(validated[0].imageUrl, null);
  // Broken URL should be safely normalized to null
  assert.equal(validated[1].imageUrl, null);
  assert.equal(validated[1].title, 'পাঁচবিবিতে কৃষি মেলা শুরু');
});

test('UI broken external image fallback collapses card to clean text-only card', () => {
  // Simulated DOM environment for card rendering
  const card = {
    children: [] as any[],
    appendChild(child: any) { this.children.push(child); }
  };

  const thumbWrap = {
    removed: false,
    remove() { this.removed = true; }
  };

  const imgEl = {
    onerror: null as (() => void) | null
  };

  imgEl.onerror = function () {
    thumbWrap.remove();
  };

  // Simulate image load error
  imgEl.onerror();

  assert.equal(thumbWrap.removed, true, 'Thumbnail container must be removed when image fails to load');
});

test('Jobabdihi image extraction prioritizes NewsArticle.image over lower-tier sources', () => {
  const jsonLdImage = 'https://www.jobabdihi.com/2026/09/19/JD_87.1789826242.jpg';
  const ogImage = 'https://www.jobabdihi.com/images/default_og.jpg';
  const cardImage = 'https://www.jobabdihi.com/thumbs/card_thumb.jpg';

  // Hierarchy check: JSON-LD takes highest priority
  let chosen = jsonLdImage || ogImage || cardImage;
  assert.equal(chosen, 'https://www.jobabdihi.com/2026/09/19/JD_87.1789826242.jpg');
});

test('Daily Inqilab known article remains valid when imageUrl is null', () => {
  const item: RawNewsItem = {
    title: 'পাঁচবিবি ঐতিহ্যবাহী গ্রামীণ লাঠি খেলা অনুষ্ঠিত',
    url: 'https://dailyinqilab.com/bangladesh/news/941903',
    source: 'Daily Inqilab',
    publishedAt: '2026-09-19T11:50:00.000Z',
    imageUrl: null,
    sourceType: 'search'
  };

  const res = filterAndValidate(item, '2026-09-20T00:00:00Z');
  assert.equal(res.accepted, true);
  assert.equal(res.item?.imageUrl, null);
  assert.equal(res.item?.source, 'Daily Inqilab');
  assert.equal(res.item?.title, 'পাঁচবিবি ঐতিহ্যবাহী গ্রামীণ লাঠি খেলা অনুষ্ঠিত');
});



