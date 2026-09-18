/**
 * Safe HTTP fetch utility with standard User-Agent, timeout, and error handling.
 */

import { execFile } from 'child_process';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (compatible; PanchbibiNewsAggregator/1.0; +https://panchbibi.com)';

function execCurl(url: string, timeoutMs: number, customUa?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const curlBin = process.platform === 'win32' ? 'curl.exe' : 'curl';
    const ua = customUa || (url.includes('kalbela.com')
      ? 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    execFile(
      curlBin,
      [
        '-s',
        '-L',
        '--max-time',
        String(Math.ceil(timeoutMs / 1000)),
        '-A',
        ua,
        '-H',
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        '-H',
        'Accept-Language: bn-BD,bn;q=0.9,en-US;q=0.8,en;q=0.7',
        url
      ],
      { maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err);
        if (!stdout || stdout.length < 50) return reject(new Error('Empty response from curl'));
        if (stdout.includes('<title>Just a moment...</title>') && !ua.includes('facebookexternalhit')) {
          return resolve(execCurl(url, timeoutMs, 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'));
        }
        resolve(stdout);
      }
    );
  });
}

export async function fetchText(url: string, timeoutMs: number = 10000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const ua = url.includes('kalbela.com')
    ? 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
    : USER_AGENT;

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'bn-BD,bn;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    if (!res.ok) {
      // If 403 or non-200, attempt curl fallback
      return await execCurl(url, timeoutMs);
    }

    const text = await res.text();
    if (text.includes('<title>Just a moment...</title>')) {
      return await execCurl(url, timeoutMs);
    }
    return text;
  } catch (err: any) {
    try {
      return await execCurl(url, timeoutMs);
    } catch {
      throw err;
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T = any>(url: string, timeoutMs: number = 10000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        'Accept-Language': 'bn-BD,bn;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    return await res.json() as T;
  } finally {
    clearTimeout(timer);
  }
}
