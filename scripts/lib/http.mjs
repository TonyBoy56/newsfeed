// Careful HTTP fetching for untrusted URLs.
//
// * Only http(s).
// * SSRF guard: refuses hosts that resolve to private, loopback or link-local
//   addresses (think cloud metadata at 169.254.169.254), and re-checks every
//   redirect hop instead of letting fetch() follow them blindly.
// * Timeouts and a streaming size cap, so a hostile server can't hang the
//   job or exhaust memory.
//
// Known gap, left as an exercise: DNS can change between our lookup and
// fetch's own lookup ("DNS rebinding"). Closing it needs a custom agent that
// connects to the exact IP we checked.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const USER_AGENT = 'PersonalNewsfeed/1.0 (+https://github.com/TonyBoy56/newsfeed)';
const TIMEOUT_MS = 20_000;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 5;

// Only for local tests against a fixture server on 127.0.0.1.
const ALLOW_LOCAL = process.env.SIGNAL_ALLOW_LOCALHOST === '1';

function isPrivateAddress(ip) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

export async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('That is not a valid URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Only http(s) URLs are allowed');
  if (url.username || url.password) throw new Error('URLs with embedded credentials are not allowed');
  if (ALLOW_LOCAL) return url;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error(`Refusing to fetch ${url.hostname}: it points to a private or local network address`);
  }
  return url;
}

async function readCapped(res, controller) {
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) throw new Error(`Response too large (${declared} bytes)`);
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      controller.abort();
      throw new Error('Response too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Fetches a URL as text. Returns { text, url, contentType } where url is the final URL. */
export async function fetchText(rawUrl, { accept } = {}) {
  let url = (await assertPublicUrl(rawUrl)).href;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: accept || 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json;q=0.9, */*;q=0.5',
        },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        url = (await assertPublicUrl(new URL(res.headers.get('location'), url).href)).href;
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { text: await readCapped(res, controller), url, contentType: res.headers.get('content-type') || '' };
    }
    throw new Error('Too many redirects');
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Timed out');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
