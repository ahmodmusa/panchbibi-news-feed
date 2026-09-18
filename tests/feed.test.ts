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
