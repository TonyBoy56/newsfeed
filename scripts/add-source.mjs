#!/usr/bin/env node
// Adds a new source to feeds.json and sorts it into the right subcategory.
//
// From your computer:
//   npm run add-source -- https://example.com                 (auto-sort)
//   npm run add-source -- https://example.com music-theory    (pick a category)
//   npm run add-source -- https://youtube.com/@SomeChannel --name "Some Channel"
//
// From GitHub (what the in-app "Add source" button uses): the add-source
// workflow runs this with --from-issue and passes the issue text in the
// ISSUE_BODY environment variable.
//
// You can paste almost anything: a feed URL, a website's homepage (the feed
// is discovered automatically), or a YouTube channel page.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXmlFeed, feedMeta, extractConcepts, htmlToText, truncate, CONCEPT_SETS } from './lib/parse.mjs';
import { fetchText } from './lib/http.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FEEDS_FILE = resolve(ROOT, process.env.FEEDS_FILE || 'feeds.json');
const LOCAL_DATA = resolve(ROOT, 'site/data/articles.json');
const RESULT_FILE = process.env.RESULT_FILE ? resolve(process.env.RESULT_FILE) : null;
const COMMIT_FILE = process.env.COMMIT_FILE ? resolve(process.env.COMMIT_FILE) : null;

// ---------- Input ----------

/** GitHub renders issue forms as "### Heading\n\nvalue" blocks. */
export function parseIssueBody(body = '') {
  const fields = {};
  const parts = String(body).split(/^###\s+/m).slice(1);
  for (const part of parts) {
    const [heading, ...rest] = part.split('\n');
    const value = rest.join('\n').trim();
    fields[heading.trim().toLowerCase()] = value === '_No response_' ? '' : value;
  }
  const pick = (word) => Object.entries(fields).find(([k]) => k.includes(word))?.[1] || '';
  return { url: pick('url'), category: pick('category'), name: pick('name') };
}

function parseArgs(argv) {
  if (argv.includes('--from-issue')) return parseIssueBody(process.env.ISSUE_BODY);
  const out = { url: '', category: '', name: '' };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--name') out.name = argv[++i] || '';
    else if (argv[i] === '--category') out.category = argv[++i] || '';
    else rest.push(argv[i]);
  }
  out.url = rest[0] || '';
  out.category ||= rest[1] || '';
  return out;
}

// ---------- Feed discovery ----------

function normalizeInput(raw) {
  const trimmed = String(raw).trim().replace(/^<|>$/g, '');
  if (!trimmed) throw new Error('No URL was given.');
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function tryMeta(text) {
  try {
    return feedMeta(text);
  } catch {
    return null;
  }
}

const YT_FEED = (id) => `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;

async function youtubeFeed(url) {
  const host = url.hostname.replace(/^(www|m)\./, '');
  if (host !== 'youtube.com') return null;
  if (url.pathname === '/feeds/videos.xml') return url.href;
  const direct = url.pathname.match(/^\/channel\/(UC[\w-]{22})/);
  if (direct) return YT_FEED(direct[1]);
  // Handles like /@name, /c/name or /user/name: read the channel ID from the page.
  const { text } = await fetchText(url.href, { accept: 'text/html' });
  const id = text.match(/"(?:channelId|externalId)":"(UC[\w-]{22})"/)?.[1] ||
    text.match(/youtube\.com\/channel\/(UC[\w-]{22})/)?.[1];
  if (!id) throw new Error("Couldn't find that YouTube channel's ID. Try the channel's /channel/UC… address instead.");
  return YT_FEED(id);
}

function feedLinksInHtml(html, base) {
  const links = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const attr = (name) => tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1];
    if (/alternate/i.test(attr('rel') || '') && /(rss|atom)\+xml/i.test(attr('type') || '') && attr('href')) {
      try { links.push(new URL(attr('href'), base).href); } catch { /* ignore */ }
    }
  }
  return links;
}

const COMMON_PATHS = ['/feed', '/feed/', '/rss', '/rss.xml', '/feed.xml', '/atom.xml', '/index.xml', '/blog/feed/', '/blog/rss.xml'];

export async function discoverFeed(input) {
  const start = new URL(normalizeInput(input));
  const yt = await youtubeFeed(start);
  const first = await fetchText(yt || start.href);
  let meta = tryMeta(first.text);
  if (meta) return { feedUrl: first.url, xml: first.text, meta };

  // A web page: look for <link rel="alternate" type="application/rss+xml">.
  const candidates = [...feedLinksInHtml(first.text, first.url), ...COMMON_PATHS.map((p) => new URL(p, first.url).href)];
  for (const candidate of [...new Set(candidates)]) {
    try {
      const res = await fetchText(candidate);
      meta = tryMeta(res.text);
      if (meta) return { feedUrl: res.url, xml: res.text, meta };
    } catch { /* try the next one */ }
  }
  throw new Error(`Couldn't find an RSS or Atom feed at ${start.href}. Try pasting the feed's address directly.`);
}

// ---------- Auto-sorting ----------

const STOP = new Set(('the and for with that this from your you are was were have has had not but all can will new how what why when who ' +
  'its into out about more than they them their our get got use using one two just now also like some any here there over after ' +
  'first year years week day days time make made way best top via each most other which would could should been being very').split(' '));

export function tokenize(text) {
  return String(text).toLowerCase().normalize('NFKD').split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w))
    .map(stem);
}

// A tiny stemmer: enough that "breaches" matches "breach" and "synths" matches "synth".
function stem(w) {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(ch|sh|ss|x)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

function vector(tokens) {
  const v = new Map();
  for (const t of tokens) v.set(t, (v.get(t) || 0) + 1);
  return v;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const [k, x] of a) { na += x * x; if (b.has(k)) dot += x * b.get(k); }
  for (const x of b.values()) nb += x * x;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * Ranks categories for a set of sample articles. Each category is described by
 * its name and description, its section's concept words, and (when
 * available) the articles already in it, so sorting gets smarter as your
 * feed grows. Scoring is TF-IDF cosine similarity plus a small bonus when
 * the section's concept vocabulary matches.
 */
export function rankCategories(samples, categories, existingArticles = []) {
  const docs = categories.map((c) => {
    // "keywords" in feeds.json is optional and lets you steer auto-sorting.
    const seed = `${c.name} ${c.description || ''} ${c.keywords || ''} ${c.keywords || ''} ${c.sectionName || ''} ${Object.keys(c.concepts || {}).join(' ')}`;
    const arts = existingArticles.filter((a) => a.category === c.id).slice(0, 150).map((a) => `${a.title} ${a.summary}`).join(' ');
    return vector(tokenize(`${seed} ${seed} ${arts}`));
  });
  const df = new Map();
  for (const d of docs) for (const k of d.keys()) df.set(k, (df.get(k) || 0) + 1);
  const idf = (k) => Math.log((1 + docs.length) / (1 + (df.get(k) || 0))) + 1;
  const weigh = (v) => new Map([...v].map(([k, x]) => [k, x * idf(k)]));

  const sampleText = samples.map((a) => `${a.title} ${a.summary}`).join(' ');
  const q = weigh(vector(tokenize(sampleText)));
  const conceptHits = {};
  for (const c of categories) {
    conceptHits[c.section] ??= samples.reduce((n, a) => n + extractConcepts(c.section, a.title, a.summary).length, 0);
  }
  const maxHits = Math.max(1, ...Object.values(conceptHits));

  return categories
    .map((c, i) => ({ category: c, score: cosine(q, weigh(docs[i])) + 0.15 * (conceptHits[c.section] / maxHits) }))
    .sort((a, b) => b.score - a.score);
}

// ---------- feeds.json helpers ----------

export function flattenCategories(config) {
  const sections = config.sections ?? [{ id: 'security', name: 'Security', categories: config.categories ?? [] }];
  return sections.flatMap((s) => s.categories.map((c) => ({ ...c, section: s.id, sectionName: s.name, ref: c })));
}

export function findCategory(categories, wanted) {
  const w = String(wanted || '').trim().toLowerCase();
  if (!w || w === 'auto' || w.startsWith('auto')) return null;
  const clean = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  return categories.find((c) => c.id === w) ||
    categories.find((c) => clean(`${c.sectionName} › ${c.name}`) === clean(w.replace(/\s*[>›/]\s*/g, ' › '))) ||
    categories.find((c) => clean(c.name) === clean(w)) ||
    (() => { throw new Error(`Unknown category "${wanted}". Use one of: ${categories.map((c) => c.id).join(', ')}, or "auto".`); })();
}

const normFeed = (u) => {
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '')}${x.search}`.toLowerCase();
  } catch {
    return String(u).toLowerCase();
  }
};

// Remote text lands in a GitHub comment, so neutralize Markdown, HTML and
// @mentions before echoing it back.
export function mdSafe(text, max = 120) {
  return truncate(htmlToText(String(text || '')), max)
    .replace(/[\\`*_{}[\]()#+!|<>~]/g, (c) => `\\${c}`)
    .replace(/@/g, '@​');
}

// ---------- Main ----------

async function loadExistingArticles() {
  try {
    if (process.env.DATA_URL) return JSON.parse((await fetchText(process.env.DATA_URL)).text).articles || [];
    return JSON.parse(await readFile(LOCAL_DATA, 'utf8')).articles || [];
  } catch {
    return [];
  }
}

async function main() {
  const input = parseArgs(process.argv.slice(2));
  const config = JSON.parse(await readFile(FEEDS_FILE, 'utf8'));
  const categories = flattenCategories(config).map((c) => ({ ...c, concepts: CONCEPT_SETS[c.section] }));

  const chosen = findCategory(categories, input.category);
  const { feedUrl, xml, meta } = await discoverFeed(input.url);

  // Duplicate check across every category.
  for (const c of categories) {
    const dup = c.feeds.find((f) => normFeed(f.url) === normFeed(feedUrl));
    if (dup) throw new Error(`"${dup.name}" is already in ${c.sectionName} › ${c.name}.`);
  }

  const probe = { name: 'probe', url: feedUrl, site: meta.site || feedUrl };
  const samples = parseXmlFeed(xml, probe, 'probe', { maxItemsPerFeed: 15, summaryLength: 400, section: chosen?.section })
    .slice(0, 15);
  if (!samples.length) throw new Error('That feed has no readable items yet, so it was not added.');

  let target = chosen;
  let ranking = null;
  if (!target) {
    ranking = rankCategories(samples, categories, await loadExistingArticles());
    target = ranking[0].category;
  }

  const allNames = new Set(categories.flatMap((c) => c.feeds.map((f) => f.name.toLowerCase())));
  let name = truncate((input.name || meta.title || new URL(feedUrl).hostname).trim(), 80);
  if (allNames.has(name.toLowerCase())) name = `${name} (${new URL(feedUrl).hostname.replace(/^www\./, '')})`;

  target.ref.feeds.push({ name, url: feedUrl, site: meta.site || new URL(feedUrl).origin });
  await writeFile(FEEDS_FILE, `${JSON.stringify(config, null, 2)}\n`);

  const where = `${target.sectionName} › ${target.name}`;
  const lines = [
    `✅ Added **${mdSafe(name, 80)}** to **${where}**${ranking ? ' (auto-sorted)' : ''}.`,
    '',
    `Feed: \`${feedUrl.replace(/`/g, '')}\``,
  ];
  if (ranking) {
    const alt = ranking.slice(1, 3).map((r) => `${r.category.sectionName} › ${r.category.name}`).join(', ');
    lines.push('', `Next best matches: ${alt}. If it landed in the wrong place, open another "Add source" request for the same feed with the category picked, after moving or deleting this entry in feeds.json.`);
  }
  lines.push('', 'Latest items:', ...samples.slice(0, 3).map((a) => `- ${mdSafe(a.title)}`), '', 'The site is rebuilding now and will include it in a couple of minutes.');
  const summary = lines.join('\n');

  console.log(summary);
  if (RESULT_FILE) await writeFile(RESULT_FILE, summary);
  if (COMMIT_FILE) await writeFile(COMMIT_FILE, `Add source: ${name.replace(/[\r\n]/g, ' ')} → ${where}\n`);
}

// Only run when executed directly (tests import the helpers above).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(async (err) => {
    console.error(`Couldn't add that source: ${err.message}`);
    if (RESULT_FILE) await writeFile(RESULT_FILE, `❌ Couldn't add that source: ${mdSafe(err.message, 300)}`).catch(() => {});
    process.exit(1);
  });
}

