#!/usr/bin/env node
// Fetches every feed in feeds.json and writes site/data/articles.json.
//
//   npm run fetch
//
// Optional environment variables:
//   PREVIOUS_DATA_URL  URL of the currently published articles.json. Its
//                      articles are merged in so history survives between
//                      runs (used by the GitHub Action).
//   FEEDS_FILE         Alternate config path (default: feeds.json)
//   OUTPUT_FILE        Alternate output path (default: site/data/articles.json)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXmlFeed, parseKev, safeUrl } from './lib/parse.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FEEDS_FILE = resolve(ROOT, process.env.FEEDS_FILE || 'feeds.json');
const OUTPUT_FILE = resolve(ROOT, process.env.OUTPUT_FILE || 'site/data/articles.json');

const TIMEOUT_MS = 20_000;
const MAX_BYTES = 8 * 1024 * 1024; // refuse absurdly large responses
const CONCURRENCY = 6;
const USER_AGENT = 'PersonalNewsfeed/1.0 (+https://github.com/TonyBoy56/newsfeed)';

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json;q=0.9, */*;q=0.5',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > MAX_BYTES) throw new Error(`Response too large (${declared} bytes)`);

    // Stream and stop reading if the body grows past the limit.
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
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url, attempts = 2) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchText(url);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function loadPrevious() {
  const url = process.env.PREVIOUS_DATA_URL;
  try {
    if (url) {
      if (!safeUrl(url)) throw new Error('PREVIOUS_DATA_URL must be http(s)');
      return JSON.parse(await fetchText(url));
    }
    return JSON.parse(await readFile(OUTPUT_FILE, 'utf8'));
  } catch (err) {
    if (url) console.warn(`  (no previous data merged: ${err.message})`);
    return null;
  }
}

async function main() {
  const config = JSON.parse(await readFile(FEEDS_FILE, 'utf8'));
  const settings = { maxItemsPerFeed: 25, maxAgeDays: 30, summaryLength: 320, ...config.settings };

  const jobs = config.categories.flatMap((cat) => cat.feeds.map((feed) => ({ feed, category: cat.id })));
  console.log(`Fetching ${jobs.length} feeds…`);

  const results = await mapLimit(jobs, CONCURRENCY, async ({ feed, category }) => {
    const started = Date.now();
    try {
      const body = await fetchWithRetry(feed.url);
      const articles = feed.type === 'cisa-kev'
        ? parseKev(body, feed, category, settings)
        : parseXmlFeed(body, feed, category, settings);
      console.log(`  ✓ ${feed.name}: ${articles.length} (${Date.now() - started} ms)`);
      return { feed, category, ok: true, count: articles.length, articles };
    } catch (err) {
      console.warn(`  ✗ ${feed.name}: ${err.message}`);
      return { feed, category, ok: false, error: err.message, articles: [] };
    }
  });

  // Merge with previous data so older articles (and their ids, which your
  // saves and notes point to) don't vanish between runs.
  const byId = new Map();
  const previous = await loadPrevious();
  const knownSources = new Set(jobs.map((j) => j.feed.name));
  for (const a of previous?.articles ?? []) {
    if (knownSources.has(a.source)) byId.set(a.id, a);
  }
  for (const r of results) for (const a of r.articles) byId.set(a.id, { ...byId.get(a.id), ...a });

  const cutoff = Date.now() - settings.maxAgeDays * 86_400_000;
  const fetchedAt = new Date().toISOString();
  const articles = [...byId.values()]
    .map((a) => ({ ...a, published: a.published || a.firstSeen || fetchedAt, firstSeen: a.firstSeen || fetchedAt }))
    .filter((a) => Date.parse(a.published) >= cutoff)
    .sort((a, b) => b.published.localeCompare(a.published));

  const output = {
    generatedAt: fetchedAt,
    categories: config.categories.map(({ id, name, description }) => ({ id, name, description })),
    sources: results.map((r) => ({
      name: r.feed.name,
      site: safeUrl(r.feed.site) || safeUrl(r.feed.url),
      category: r.category,
      ok: r.ok,
      count: r.ok ? r.count : 0,
      error: r.ok ? undefined : r.error,
    })),
    articles,
  };

  await mkdir(dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 1));

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nWrote ${articles.length} articles to ${OUTPUT_FILE} (${failed} feed(s) failed).`);

  // Only fail the run if everything broke. One flaky feed shouldn't stop the site.
  if (failed === results.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
