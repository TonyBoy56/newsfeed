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
import { parseXmlFeed, parseKev, safeUrl, CONCEPT_SETS, registerCustomConcepts } from './lib/parse.mjs';
import { fetchText } from './lib/http.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FEEDS_FILE = resolve(ROOT, process.env.FEEDS_FILE || 'feeds.json');
const OUTPUT_FILE = resolve(ROOT, process.env.OUTPUT_FILE || 'site/data/articles.json');

const CONCURRENCY = 6;

async function fetchWithRetry(url, attempts = 2) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return (await fetchText(url)).text;
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
      return JSON.parse((await fetchText(url)).text);
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
  registerCustomConcepts(config);

  // feeds.json groups categories into sections (Security, Music, Games…).
  // An older flat "categories" list still works and is treated as Security.
  const sections = config.sections ?? [{ id: 'security', name: 'Security', categories: config.categories ?? [] }];
  const categories = sections.flatMap((sec) => sec.categories.map((cat) => ({ ...cat, section: sec.id })));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const jobs = categories.flatMap((cat) => cat.feeds.map((feed) => ({ feed, category: cat.id, section: cat.section })));
  console.log(`Fetching ${jobs.length} feeds…`);

  const results = await mapLimit(jobs, CONCURRENCY, async ({ feed, category, section }) => {
    const started = Date.now();
    const feedSettings = { ...settings, section };
    try {
      const body = await fetchWithRetry(feed.url);
      const articles = feed.type === 'cisa-kev'
        ? parseKev(body, feed, category, feedSettings)
        : parseXmlFeed(body, feed, category, feedSettings);
      console.log(`  ✓ ${feed.name}: ${articles.length} (${Date.now() - started} ms)`);
      return { feed, category, section, ok: true, count: articles.length, articles };
    } catch (err) {
      console.warn(`  ✗ ${feed.name}: ${err.message}`);
      return { feed, category, section, ok: false, error: err.message, articles: [] };
    }
  });

  // Merge with previous data so older articles (and their ids, which your
  // saves and notes point to) don't vanish between runs.
  const byId = new Map();
  const previous = await loadPrevious();
  const knownSources = new Set(jobs.map((j) => j.feed.name));
  for (const a of previous?.articles ?? []) {
    if (knownSources.has(a.source) && categoryById.has(a.category)) {
      byId.set(a.id, { ...a, section: categoryById.get(a.category).section });
    }
  }
  for (const r of results) for (const a of r.articles) byId.set(a.id, { ...byId.get(a.id), ...a });

  // Categories can keep items longer (evergreen learning content, say).
  const cutoffFor = (a) => Date.now() - (categoryById.get(a.category)?.maxAgeDays ?? settings.maxAgeDays) * 86_400_000;
  const fetchedAt = new Date().toISOString();
  const articles = [...byId.values()]
    .map((a) => ({ ...a, published: a.published || a.firstSeen || fetchedAt, firstSeen: a.firstSeen || fetchedAt }))
    .filter((a) => Date.parse(a.published) >= cutoffFor(a))
    .sort((a, b) => b.published.localeCompare(a.published));

  const repo = /^[\w.-]+\/[\w.-]+$/.test(settings.repo || '') ? settings.repo : null;
  const output = {
    generatedAt: fetchedAt,
    repo, // lets the app link to GitHub for "Add source"
    // Each section's concept vocabulary, so the app can offer it in "Your interests".
    sections: sections.map(({ id, name, description }) => ({ id, name, description: description || '', concepts: Object.keys(CONCEPT_SETS[id] || {}) })),
    categories: categories.map(({ id, name, description, section }) => ({ id, name, description: description || '', section })),
    sources: results.map((r) => ({
      name: r.feed.name,
      site: safeUrl(r.feed.site) || safeUrl(r.feed.url),
      category: r.category,
      section: r.section,
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

  // Only fail the run if everything broke. One flaky feed shouldn't stop the
  // site, and having no topics yet (so no feeds at all) is fine too.
  if (results.length > 0 && failed === results.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
