/**
 * Normalization utilities for URLs, titles, and dates.
 */

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  '_ga',
  'ref',
  'source',
  'ocid',
  'dpl'
]);

/**
 * Decode common HTML entities while preserving Bengali characters.
 */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8217;/g, '’')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return _;
      }
    });
}

/**
 * Clean headline: decode entities, normalize Unicode, collapse whitespace, trim.
 */
export function cleanTitle(raw: string): string {
  if (!raw) return '';
  let cleaned = decodeHtmlEntities(raw);
  // Normalize Unicode
  cleaned = cleaned.normalize('NFC');
  // Remove zero-width spaces and control characters
  cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, '');
  // Collapse duplicate whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

/**
 * Canonicalize article URL: strip tracking params, normalize scheme/hostname.
 */
export function canonicalizeUrl(rawUrl: string, baseUrl?: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  try {
    const parsed = new URL(rawUrl, baseUrl);

    // Only allow HTTP/HTTPS
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    // Strip tracking parameters
    const toDelete: string[] = [];
    for (const key of parsed.searchParams.keys()) {
      const lowerKey = key.toLowerCase();
      if (TRACKING_PARAMS.has(lowerKey) || lowerKey.startsWith('utm_')) {
        toDelete.push(key);
      }
    }
    for (const k of toDelete) {
      parsed.searchParams.delete(k);
    }

    // Remove empty hash
    if (parsed.hash === '#') {
      parsed.hash = '';
    }

    // Remove trailing slash if path is not root
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

const BANGLA_NUM_MAP: Record<string, string> = {
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
  '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
};

const BANGLA_MONTH_MAP: Record<string, number> = {
  'জানুয়ারি': 0, 'জানুয়ারি': 0, 'january': 0,
  'ফেব্রুয়ারি': 1, 'ফেব্রুয়ারি': 1, 'february': 1,
  'মার্চ': 2, 'march': 2,
  'এপ্রিল': 3, 'april': 3,
  'মে': 4, 'may': 4,
  'জুন': 5, 'june': 5,
  'জুলাই': 6, 'july': 6,
  'আগস্ট': 7, 'august': 7,
  'সেপ্টেম্বর': 8, 'september': 8,
  'অক্টোবর': 9, 'october': 9,
  'নভেম্বর': 10, 'november': 10,
  'ডিসেম্বর': 11, 'december': 11
};

export function convertBanglaDigits(str: string): string {
  return str.replace(/[০-৯]/g, d => BANGLA_NUM_MAP[d] ?? d);
}

const BANGLA_DAYS_REGEX = /(?:রবিবার|সোমবার|মঙ্গলবার|বুধবার|বৃহস্পতিবার|শুক্রবার|শনিবার|রবি|সোম|মঙ্গল|বুধ|বৃহস্পতি|শুক্র|শনি)\s*,?\s*/gi;

/**
 * Parse Bengali formatted date strings into ISO 8601 string.
 * Example: "১৫ সেপ্টেম্বর ২০২৬, ০৫:৫০" or "১৬ সেপ্টেম্বর, ২০২৬ ১০:২৫ পিএম" or "বুধবার, ১৬ সেপ্টেম্বর ২০২৬"
 */
export function parseBanglaDate(banglaStr: string): string | null {
  if (!banglaStr || typeof banglaStr !== 'string') return null;

  try {
    const trimmed = banglaStr.trim();

    // If it's already an ISO or standard machine date format
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) return d.toISOString();
    }

    // Strip common labels and day of week
    let rawClean = trimmed
      .replace(/^(?:প্রকাশিত|প্রকাশ|আপডেট|আপডেটেড|published|updated)\s*:\s*/i, '')
      .replace(BANGLA_DAYS_REGEX, '')
      .replace(/\|\s*/g, ' ')
      .trim();

    const withLatinDigits = convertBanglaDigits(rawClean);

    // 1. Check if standard date string after digit conversion
    const directDate = new Date(withLatinDigits);
    if (!isNaN(directDate.getTime()) && directDate.getFullYear() > 2000 && directDate.getFullYear() < 2100) {
      // If it has month names, let's verify
      if (/^[a-zA-Z]{3,9}\s+\d{1,2},\s+\d{4}/.test(withLatinDigits)) {
        return directDate.toISOString();
      }
    }

    // 2. Regex for: Day Month Year [Time] [AM/PM]
    // e.g. "16 সেপ্টেম্বর, 2026 10:25 পিএম" or "15 সেপ্টেম্বর 2026, 05:50" or "16 সেপ্টেম্বর 2026"
    const match = withLatinDigits.match(/(\d{1,2})\s+([^\s,]+)[,\s]+(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:\s*(am|pm|এএম|পিএম))?/i);
    if (!match) {
      const d = new Date(withLatinDigits);
      if (!isNaN(d.getTime())) return d.toISOString();
      return null;
    }

    const day = parseInt(match[1], 10);
    const rawMonth = match[2].trim().toLowerCase();
    const year = parseInt(match[3], 10);
    let hour = match[4] ? parseInt(match[4], 10) : 0;
    const minute = match[5] ? parseInt(match[5], 10) : 0;
    const second = match[6] ? parseInt(match[6], 10) : 0;
    const period = match[7] ? match[7].toLowerCase() : null;

    if (period === 'pm' || period === 'পিএম') {
      if (hour < 12) hour += 12;
    } else if (period === 'am' || period === 'এএম') {
      if (hour === 12) hour = 0;
    }

    const monthIndex = BANGLA_MONTH_MAP[rawMonth];
    if (monthIndex === undefined) {
      return null;
    }

    // Bangladesh is UTC+6
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${year}-${pad(monthIndex + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}+06:00`;
  } catch {
    return null;
  }
}
