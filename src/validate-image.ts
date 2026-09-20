import { execFile } from 'child_process';
import { NewsItem } from './types.js';

/**
 * Lightweight candidate image URL validation.
 * Verifies:
 * 1. Valid HTTP/HTTPS protocol
 * 2. HTTP success status
 * 3. Content-Type begins with 'image/'
 *
 * Uses HEAD first, then minimal GET (Range: bytes=0-1023), and curl fallback for bot-mitigated hosts.
 * Does NOT download or store the full image.
 */
export async function validateImageUrl(url: string | null | undefined, timeoutMs: number = 5000): Promise<boolean> {
  if (!url || typeof url !== 'string') return false;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  } catch {
    return false;
  }

  // 1. Try HEAD request
  try {
    const headCtrl = new AbortController();
    const headTimer = setTimeout(() => headCtrl.abort(), timeoutMs);
    const res = await fetch(url, {
      method: 'HEAD',
      signal: headCtrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
      }
    });
    clearTimeout(headTimer);

    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.toLowerCase().startsWith('image/')) {
        return true;
      }
    }
  } catch {}

  // 2. Try minimal GET (Range: bytes=0-1023)
  try {
    const getCtrl = new AbortController();
    const getTimer = setTimeout(() => getCtrl.abort(), timeoutMs);
    const res = await fetch(url, {
      method: 'GET',
      signal: getCtrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Range': 'bytes=0-1023'
      }
    });
    clearTimeout(getTimer);

    if (res.ok || res.status === 206) {
      const ct = res.headers.get('content-type') || '';
      try { await res.body?.cancel(); } catch {}
      if (ct.toLowerCase().startsWith('image/')) {
        return true;
      }
    }
  } catch {}

  // 3. Fallback: lightweight curl check with crawler User-Agent
  try {
    const curlBin = process.platform === 'win32' ? 'curl.exe' : 'curl';
    const out = await new Promise<{ status: number; contentType: string }>((resolve, reject) => {
      execFile(
        curlBin,
        [
          '-I', '-s', '-L',
          '--max-time', String(Math.ceil(timeoutMs / 1000)),
          '-A', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
          url
        ],
        (err, stdout) => {
          if (err || !stdout) return reject(err || new Error('Empty curl response'));
          const lines = stdout.split(/[\r\n]+/);
          let status = 0;
          let contentType = '';
          for (const line of lines) {
            const m = line.match(/^HTTP\/[0-9.]+\s+(\d+)/i);
            if (m) status = parseInt(m[1], 10);
            const c = line.match(/^content-type:\s*([^\s;]+)/i);
            if (c) contentType = c[1];
          }
          resolve({ status, contentType });
        }
      );
    });

    if (out.status === 200 && out.contentType.toLowerCase().startsWith('image/')) {
      return true;
    }
  } catch {}

  return false;
}

/**
 * Validates candidate images for an array of news items.
 * If an image fails validation, it is safely reset to null.
 */
export async function validateNewsItemImages(items: NewsItem[], concurrency: number = 5): Promise<NewsItem[]> {
  const validationCache = new Map<string, boolean>();
  const results: NewsItem[] = [...items];

  // Collect unique candidate image URLs
  const candidateUrls = Array.from(
    new Set(items.map(i => i.imageUrl).filter((u): u is string => typeof u === 'string' && u.length > 0))
  );

  // Validate in concurrent batches
  for (let i = 0; i < candidateUrls.length; i += concurrency) {
    const batch = candidateUrls.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async url => {
        const isValid = await validateImageUrl(url);
        validationCache.set(url, isValid);
      })
    );
  }

  // Update items with validation results
  return results.map(item => {
    if (!item.imageUrl) return item;

    const isValid = validationCache.get(item.imageUrl) ?? false;
    if (isValid) {
      return item;
    }

    // Reset knowingly broken or inaccessible image URL to null
    return {
      ...item,
      imageUrl: null
    };
  });
}
