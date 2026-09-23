// Signal: a personal security newsfeed.
//
// Security notes, since this project doubles as practice:
// * Every piece of feed content is inserted with textContent or via
//   createElement. There is no innerHTML anywhere, and the page's CSP turns
//   on Trusted Types, so the browser would throw if anything tried.
// * Links are re-checked here (http/https only) even though the fetcher
//   already filters them. That's defense in depth.
// * Your reading history, saves and notes live only in this browser's
//   localStorage. Nothing is sent anywhere.

import { GRAPH } from './concept-graph.js?v=7';
import { CATALOG, suggestTopics } from './topic-catalog.js?v=7';

const STORE_KEY = 'signal:v1';
// theme.js loads first (see index.html) and applies your saved colors.
// If a browser serves a cached older page without theme.js, fall back to a
// no-op theme so the reader still loads instead of breaking.
const Theme = window.SignalTheme || {
  PRESETS: {}, DEFAULTS: {}, sanitize: (a) => a || {}, apply: (a) => a, preview: () => ({}), isDark: () => false,
};
const PAGE_SIZE = 40;
const DAY = 86_400_000;
const ID_RE = /^[a-f0-9]{16}$/;

// Starter prompts for notes, tuned to each section.
const NOTE_PROMPTS = {
  general: ['Key takeaway: ', 'Something to try: ', 'Term to look up: ', 'Question to explore: ', 'Why this matters to me: '],
  security: [
    'Key takeaway: ',
    'How this applies to my work: ',
    'Term to look up: ',
    'Question to explore: ',
    'How I would detect or prevent this: ',
  ],
  music: [
    'Key takeaway: ',
    'Technique to try: ',
    'Gear or plugin to check out: ',
    'Theory idea to practice: ',
    'Track to reference: ',
  ],
  games: [
    'Key takeaway: ',
    'Design idea to borrow: ',
    'How this could be exploited: ',
    'Technique to try: ',
    'Game to play: ',
  ],
};

// ---------- DOM helpers ----------

const $ = (sel) => document.querySelector(sel);

/** Replaces an element's children, skipping null/false entries. */
function put(el, ...nodes) {
  el.replaceChildren(...nodes.flat().filter((n) => n != null && n !== false));
}

/** h('a', { href, class: 'x', onclick }, 'text', child) builds elements safely. */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

function safeHref(raw) {
  try {
    const url = new URL(raw, location.href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function timeAgo(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------- Persistent store ----------

function emptyStore() {
  return { version: 1, createdAt: Date.now(), read: {}, saved: {}, notes: {}, snapshots: {}, history: { days: {}, concepts: {} }, profile: sanitizeProfile(null), prefs: { appearance: Theme.sanitize(null), sort: 'new', collapsed: {}, frontMode: 'foryou', profileDismissed: false } };
}

function loadStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY));
    return parsed ? sanitizeStore(parsed) : emptyStore();
  } catch {
    return emptyStore();
  }
}

function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    toast('Could not save. Is browser storage full or disabled?');
  }
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v) => (Number.isFinite(v) ? v : null);

// Treat imported data as untrusted input: keep only known fields with the
// right types and sizes, and re-validate every URL.
function sanitizeArticle(a) {
  if (!a || typeof a !== 'object' || !ID_RE.test(a.id)) return null;
  const url = safeHref(a.url);
  if (!url) return null;
  const list = (v, n, m) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, n).map((x) => x.slice(0, m)) : []);
  return {
    id: a.id,
    title: str(a.title, 300) || '(untitled)',
    url,
    summary: str(a.summary, 1000),
    source: str(a.source, 120),
    section: str(a.section, 40),
    category: str(a.category, 60),
    author: str(a.author, 120) || null,
    published: str(a.published, 40) || null,
    cves: list(a.cves, 10, 20).filter((c) => /^CVE-\d{4}-\d{4,7}$/.test(c)),
    concepts: list(a.concepts, 20, 40),
  };
}

function sanitizeStore(input) {
  const out = emptyStore();
  if (!input || typeof input !== 'object') return out;
  for (const key of ['read', 'saved']) {
    for (const [id, ts] of Object.entries(input[key] ?? {})) {
      if (ID_RE.test(id) && num(ts)) out[key][id] = ts;
    }
  }
  for (const [id, n] of Object.entries(input.notes ?? {})) {
    if (!ID_RE.test(id) || !n || typeof n !== 'object') continue;
    const tags = Array.isArray(n.tags) ? n.tags.filter((t) => typeof t === 'string').map(normalizeTag).filter(Boolean).slice(0, 20) : [];
    const text = str(n.text, 20000);
    if (text || tags.length) out.notes[id] = { text, tags, updated: num(n.updated) ?? Date.now() };
  }
  for (const [id, a] of Object.entries(input.snapshots ?? {})) {
    const clean = sanitizeArticle(a);
    if (clean && clean.id === id) out.snapshots[id] = clean;
  }
  out.profile = sanitizeProfile(input.profile);
  out.createdAt = num(input.createdAt) ?? Math.min(Date.now(), ...Object.values(out.read), ...Object.values(out.saved));
  // Reading history for the profile page: reads per day and per concept.
  for (const [day, n] of Object.entries(input.history?.days ?? {}).slice(-800)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && num(n) > 0) out.history.days[day] = Math.min(n, 10000);
  }
  for (const [c, n] of Object.entries(input.history?.concepts ?? {}).slice(0, 300)) {
    if (typeof c === 'string' && c.length <= 40 && num(n) > 0) out.history.concepts[c] = Math.min(n, 100000);
  }
  const prefs = input.prefs ?? {};
  out.prefs = {
    // Older versions only stored light/dark in prefs.theme.
    appearance: Theme.sanitize(prefs.appearance || { mode: ['light', 'dark'].includes(prefs.theme) ? prefs.theme : 'auto' }),
    sort: ['new', 'old', 'source'].includes(prefs.sort) ? prefs.sort : 'new',
    frontMode: prefs.frontMode === 'latest' ? 'latest' : 'foryou',
    profileDismissed: prefs.profileDismissed === true,
    collapsed: Object.fromEntries(Object.entries(prefs.collapsed ?? {})
      .filter(([k, v]) => /^[a-z0-9-]{1,40}$/.test(k) && v === true)),
  };
  return out;
}

// "Your interests" and profile basics. Per section: the concepts, subtopics
// and free-text keywords you want to see. depth = how many links out from
// a concept still count as related (1–3).
function sanitizeProfile(input) {
  const out = {
    name: str(input?.name, 60).trim(),
    goal: str(input?.goal, 160).trim(),
    depth: [1, 2, 3].includes(input?.depth) ? input.depth : 2,
    sections: {},
    updated: num(input?.updated) ?? 0,
  };
  const list = (v, n, m) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string').map((x) => x.trim().slice(0, m)).filter(Boolean))].slice(0, n) : []);
  for (const [id, p] of Object.entries(input?.sections ?? {})) {
    if (!/^[a-z0-9-]{1,40}$/.test(id) || !p || typeof p !== 'object') continue;
    const clean = { concepts: list(p.concepts, 40, 40), categories: list(p.categories, 20, 60), keywords: list(p.keywords, 20, 40) };
    if (clean.concepts.length || clean.categories.length || clean.keywords.length) out.sections[id] = clean;
  }
  return out;
}

const hasProfile = () => Object.keys(store.profile.sections).length > 0;

function normalizeTag(t) {
  return String(t).toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-_.]/g, '').slice(0, 40);
}

// Saved or annotated articles are snapshotted so they outlive the feed's
// 30-day window.
function snapshot(article) {
  store.snapshots[article.id] = sanitizeArticle(article);
}
function maybeDropSnapshot(id) {
  if (!store.saved[id] && !store.notes[id]) delete store.snapshots[id];
}

// ---------- App state ----------

let store = loadStore();
let data = { repo: null, sections: [], categories: [], sources: [], articles: [], generatedAt: null };
let catById = new Map();
let byId = new Map();
const ui = { showAll: false, view: 'all', section: null, category: null, concept: null, tag: null, query: '', limit: PAGE_SIZE, active: -1, editing: null, draft: null };
let visible = [];

const VIEWS = [
  { id: 'all', name: 'Home' },
  { id: 'unread', name: 'Unread' },
  { id: 'saved', name: 'Saved' },
  { id: 'notebook', name: 'Notebook' },
  { id: 'profile', name: 'You' },
];

function allArticles() {
  const map = new Map(data.articles.map((a) => [a.id, a]));
  for (const [id, snap] of Object.entries(store.snapshots)) if (!map.has(id)) map.set(id, snap);
  return [...map.values()];
}

const sectionOf = (a) => a.section || catById.get(a.category)?.section || 'security';
const sectionById = (id) => data.sections.find((s) => s.id === id);

function matchesQuery(a, q) {
  if (!q) return true;
  const note = store.notes[a.id];
  const hay = [a.title, a.summary, a.source, a.author, ...(a.cves || []), ...(a.concepts || []), note?.text, ...(note?.tags || [])]
    .filter(Boolean).join(' ').toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}

// ---------- Front page ("For you") ----------

const FRONT_PER_SECTION = 3;
let frontGroups = [];

const isHome = () => ui.view === 'all' && !ui.section && !ui.category && !ui.concept && !ui.tag && !ui.query.trim();
const isFront = () => isHome() && store.prefs.frontMode === 'foryou';

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (k) => new RegExp(`(^|[^a-z0-9])${escapeRe(k.toLowerCase())}([^a-z0-9]|$)`, 'i');

// ---------- Concept map matching ----------
//
// Your interests are expanded through the concept map (concept-graph.js):
// each picked concept, plus everything up to `depth` links away. An article
// is "in scope" if it mentions any of those, one of your keywords, or comes
// from a subtopic you marked as a favorite.

const graphCache = new Map();
const LAYER_POINTS = [4, 3, 2, 1];

function termsRe(terms) {
  const parts = terms.filter(Boolean).map((t) => {
    const lower = t.toLowerCase();
    return lower.endsWith('*') ? `${escapeRe(lower.slice(0, -1))}[a-z0-9]*` : `${escapeRe(lower)}(?:s|es|ed|ing|er|ers)?`;
  });
  return parts.length ? new RegExp(`(?:^|[^a-z0-9])(?:${parts.join('|')})(?![a-z0-9])`, 'i') : null;
}

function graphFor(secId) {
  if (graphCache.has(secId)) return graphCache.get(secId);
  // Topics you create yourself have no hand-built map yet: their concepts
  // stand alone, matched by the tags the fetcher assigns.
  const src = GRAPH[secId] || { nodes: Object.fromEntries((sectionById(secId)?.concepts || []).map((c) => [c, { label: c, terms: [] }])), links: [] };
  const nodes = new Map();
  for (const [id, n] of Object.entries(src.nodes)) nodes.set(id, { id, label: n.label || id, re: termsRe(n.terms || []), neighbors: new Set() });
  for (const [a, b] of src.links) {
    if (nodes.has(a) && nodes.has(b)) { nodes.get(a).neighbors.add(b); nodes.get(b).neighbors.add(a); }
  }
  const g = { nodes };
  graphCache.set(secId, g);
  return g;
}

/** Breadth-first walk from your picked concepts. Returns nodeId → { dist, via }. */
function expandInterests(secId, concepts, depth) {
  const g = graphFor(secId);
  const out = new Map();
  let frontier = concepts.filter((c) => g.nodes.has(c));
  for (const c of frontier) out.set(c, { dist: 0, via: c });
  for (let d = 1; d <= depth; d++) {
    const next = [];
    for (const id of frontier) {
      for (const n of g.nodes.get(id).neighbors) {
        if (!out.has(n)) { out.set(n, { dist: d, via: out.get(id).via }); next.push(n); }
      }
    }
    frontier = next;
  }
  return out;
}

function makeMatcher(profile) {
  const bySection = {};
  for (const sec of data.sections) {
    const p = profile.sections[sec.id];
    if (!p) continue;
    bySection[sec.id] = {
      expansion: expandInterests(sec.id, p.concepts, profile.depth),
      keywords: p.keywords.map((k) => ({ k, re: termsRe([k]) })),
      categories: new Set(p.categories),
    };
  }
  return (a) => {
    const secId = sectionOf(a);
    const m = bySection[secId];
    if (!m) return null;
    const g = graphFor(secId);
    const text = `${a.title} ${a.summary || ''}`;
    const hits = [];
    for (const [id, info] of m.expansion) {
      const node = g.nodes.get(id);
      if ((a.concepts || []).includes(id) || node.re?.test(text)) hits.push({ label: node.label, ...info });
    }
    const kwTitle = m.keywords.filter((x) => x.re.test(a.title)).map((x) => x.k);
    const kwAny = m.keywords.filter((x) => x.re.test(text)).map((x) => x.k);
    const catHit = m.categories.has(a.category);
    if (!hits.length && !kwAny.length && !catHit) return null;
    hits.sort((x, y) => x.dist - y.dist);
    let score = kwTitle.length * 5 + (kwAny.length - kwTitle.length) * 3 + (catHit ? 2 : 0);
    for (const hit of hits.slice(0, 4)) score += LAYER_POINTS[hit.dist] ?? 1;
    const reasons = [
      ...kwAny.map((k) => `“${k}”`),
      ...hits.slice(0, 3).map((hit) => (hit.dist === 0 ? hit.label : `${hit.label} (via ${g.nodes.get(hit.via)?.label || hit.via})`)),
      ...(catHit ? [catById.get(a.category)?.name || a.category] : []),
    ];
    return { score, reasons: [...new Set(reasons)].slice(0, 4) };
  };
}

let profileVersion = 0;
let matchCache = { version: -1, fn: null, results: new Map() };
function matchInfo(a) {
  if (matchCache.version !== profileVersion) matchCache = { version: profileVersion, fn: makeMatcher(store.profile), results: new Map() };
  if (!matchCache.results.has(a.id)) matchCache.results.set(a.id, matchCache.fn(a));
  return matchCache.results.get(a.id);
}

// The interests filter applies everywhere except Saved, Notebook and You,
// unless you flip "Show everything".
const filterActive = (view = ui.view) => !ui.showAll && !['saved', 'notebook', 'profile'].includes(view);
const inScope = (a) => Boolean(matchInfo(a));
const sectionHasInterests = (secId) => Boolean(store.profile.sections[secId]);

/**
 * Front-page score. Transparent on purpose: the card shows the reasons.
 *   +5 / +3  one of your keywords in the title / summary
 *   +4 → +1  a concept match, fading with distance on the concept map
 *   +2       a favorite subtopic
 *   +≤2      concepts that also appear in things you've saved or noted
 *   +≤3      freshness (fades over a few days)
 *   −4       already read, so new picks rotate in
 */
function relevance(a, implicit) {
  const m = matchInfo(a);
  let score = m?.score || 0;
  for (const c of a.concepts || []) if (implicit.has(c)) score += Math.min(2, 0.5 * implicit.get(c));
  const ageHours = Math.max(0, (Date.now() - (Date.parse(a.published) || 0)) / 3.6e6);
  score += 3 * Math.exp(-ageHours / 72);
  if (store.read[a.id]) score -= 4;
  return { score, reasons: m?.reasons || [] };
}

// Concepts from what you've saved or written notes on: a quiet signal of what you like.
function implicitConcepts() {
  const tally = new Map();
  for (const id of new Set([...Object.keys(store.saved), ...Object.keys(store.notes)])) {
    const a = byId.get(id) || store.snapshots[id];
    for (const c of a?.concepts || []) tally.set(c, (tally.get(c) || 0) + 1);
  }
  return tally;
}

function pickFront() {
  const implicit = implicitConcepts();
  const pool = allArticles();
  return data.sections.map((sec) => {
    const inSection = pool.filter((a) => sectionOf(a) === sec.id);
    const eligible = filterActive('all') ? inSection.filter(inScope) : inSection;
    const scored = eligible.map((a) => ({ a, ...relevance(a, implicit) })).sort((x, y) => y.score - x.score);
    // Greedy pick with a penalty for repeating a source, so one busy site
    // can't take all three spots.
    const picks = [];
    const used = new Map();
    while (picks.length < FRONT_PER_SECTION && scored.length) {
      let best = 0;
      for (let i = 1; i < Math.min(scored.length, 30); i++) {
        const adj = (x) => x.score - 2.5 * (used.get(x.a.source) || 0);
        if (adj(scored[i]) > adj(scored[best])) best = i;
      }
      const [chosen] = scored.splice(best, 1);
      used.set(chosen.a.source, (used.get(chosen.a.source) || 0) + 1);
      picks.push(chosen);
    }
    return { section: sec, picks, total: eligible.length };
  });
}

function computeVisible() {
  if (ui.view === 'profile') return [];
  if (isFront()) {
    frontGroups = pickFront();
    return frontGroups.flatMap((g) => g.picks.map((p) => p.a));
  }
  const scoped = filterActive();
  const q = ui.query.trim().toLowerCase();
  let list = allArticles().filter((a) => {
    if (ui.view === 'unread' && store.read[a.id]) return false;
    if (ui.view === 'saved' && !store.saved[a.id]) return false;
    if (ui.view === 'notebook' && !store.notes[a.id]) return false;
    if (ui.section && sectionOf(a) !== ui.section) return false;
    if (ui.category && a.category !== ui.category) return false;
    if (ui.concept && !(a.concepts || []).includes(ui.concept)) return false;
    if (ui.tag && !(store.notes[a.id]?.tags || []).includes(ui.tag)) return false;
    if (scoped && !inScope(a)) return false;
    return matchesQuery(a, q);
  });
  const sort = store.prefs.sort;
  const time = (a) => Date.parse(a.published) || 0;
  if (ui.view === 'notebook') list.sort((a, b) => store.notes[b.id].updated - store.notes[a.id].updated);
  else if (ui.view === 'saved') list.sort((a, b) => store.saved[b.id] - store.saved[a.id]);
  else if (sort === 'old') list.sort((a, b) => time(a) - time(b));
  else if (sort === 'source') list.sort((a, b) => a.source.localeCompare(b.source) || time(b) - time(a));
  else list.sort((a, b) => time(b) - time(a));
  return list;
}

// ---------- Rendering: sidebar ----------

function renderSidebar() {
  // Counts follow the interests filter, so they match what you'll see.
  const pool = filterActive('all') ? allArticles().filter(inScope) : allArticles();
  const counts = {
    all: pool.length,
    unread: pool.filter((a) => !store.read[a.id]).length,
    saved: Object.keys(store.saved).length,
    notebook: Object.keys(store.notes).length,
  };

  put($('#views'), ...VIEWS.map((v) => h('li', {},
    h('button', { type: 'button', 'aria-current': String(ui.view === v.id), onclick: () => setFilter({ view: v.id }) },
      h('span', {}, v.name),
      v.id === 'profile' ? avatar('sm') : h('span', { class: 'count' }, counts[v.id])))));

  const catCounts = new Map();
  const secCounts = new Map();
  for (const a of pool) {
    catCounts.set(a.category, (catCounts.get(a.category) || 0) + 1);
    secCounts.set(sectionOf(a), (secCounts.get(sectionOf(a)) || 0) + 1);
  }
  const collapsed = store.prefs.collapsed;
  put($('#categories'),
    h('li', {}, h('button', { type: 'button', 'aria-current': String(!ui.section && !ui.category), onclick: () => setFilter({ section: null, category: null, concept: null }) },
      h('span', {}, 'Everything'), h('span', { class: 'count' }, pool.length))),
    ...data.sections.map((sec) => {
      const open = !collapsed[sec.id];
      const subs = data.categories.filter((c) => c.section === sec.id);
      return h('li', { class: 'section' },
        h('div', { class: 'section-row' },
          h('button', {
            type: 'button', class: 'caret', 'aria-expanded': String(open),
            'aria-label': `${open ? 'Collapse' : 'Expand'} ${sec.name}`,
            onclick: () => { if (open) collapsed[sec.id] = true; else delete collapsed[sec.id]; persist(); renderSidebar(); },
          }, open ? '▾' : '▸'),
          h('button', {
            type: 'button', class: 'section-btn', title: sec.description,
            'aria-current': String(ui.section === sec.id && !ui.category),
            onclick: () => { delete collapsed[sec.id]; setFilter({ section: sec.id, category: null, concept: null }); },
          }, h('span', {}, sec.name), h('span', { class: 'count' }, secCounts.get(sec.id) || 0))),
        open ? h('ul', { class: 'nav sub' }, ...subs.map((c) => h('li', {},
          h('button', {
            type: 'button', title: c.description, 'aria-current': String(ui.category === c.id),
            onclick: () => setFilter({ section: sec.id, category: c.id, concept: null }),
          }, h('span', {}, c.name), h('span', { class: 'count' }, catCounts.get(c.id) || 0))))) : null);
    }),
    h('li', {}, h('button', { type: 'button', class: 'add-btn', onclick: () => showNewTopic() }, '+ New topic')),
    h('li', {}, h('button', { type: 'button', class: 'add-btn', onclick: () => showAddSource(ui.category) }, '+ Add a source')),
  );

  // Concepts come from whichever section you're looking at, so music and
  // security vocabularies don't crowd each other.
  const scope = ui.section ? pool.filter((a) => sectionOf(a) === ui.section) : pool;
  const conceptCounts = new Map();
  for (const a of scope) for (const c of a.concepts || []) conceptCounts.set(c, (conceptCounts.get(c) || 0) + 1);
  const concepts = [...conceptCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, ui.section ? 30 : 18);
  $('#concepts-title').textContent = ui.section ? `${sectionById(ui.section)?.name || ''} concepts` : 'Concepts';
  const tagCounts = new Map();
  for (const n of Object.values(store.notes)) for (const t of n.tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);

  put($('#concepts'), 
    ...concepts.map(([c, n]) => h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(ui.concept === c),
      title: `${n} articles`, onclick: () => setFilter({ concept: ui.concept === c ? null : c }),
    }, c)),
    ...[...tagCounts.keys()].sort().map((t) => h('button', {
      type: 'button', class: 'chip tag', 'aria-pressed': String(ui.tag === t),
      title: 'Your tag', onclick: () => setFilter({ tag: ui.tag === t ? null : t }),
    }, `#${t}`)),
  );

  renderStats();
}

function renderStats() {
  const weekAgo = Date.now() - 7 * DAY;
  const readIds = Object.entries(store.read).filter(([, ts]) => ts >= weekAgo).map(([id]) => id);
  const notesThisWeek = Object.values(store.notes).filter((n) => n.updated >= weekAgo).length;
  const conceptTally = new Map();
  for (const id of readIds) {
    const a = byId.get(id) || store.snapshots[id];
    for (const c of a?.concepts || []) conceptTally.set(c, (conceptTally.get(c) || 0) + 1);
  }
  const top = [...conceptTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
  put($('#stats'), 
    h('div', { class: 'stat' }, h('b', {}, readIds.length), h('span', {}, 'read')),
    h('div', { class: 'stat' }, h('b', {}, notesThisWeek), h('span', {}, 'notes')),
    h('div', { class: 'stat' }, h('b', {}, Object.keys(store.saved).length), h('span', {}, 'saved')),
    h('div', { class: 'top-concepts' }, top.length ? `Focus: ${top.join(', ')}` : 'Read a few articles to see your focus areas.'),
  );
}

// ---------- Rendering: list ----------

function renderContext() {
  const view = VIEWS.find((v) => v.id === ui.view);
  const cat = catById.get(ui.category);
  const sec = sectionById(ui.section);
  const title = cat ? cat.name : sec ? sec.name : view.name;
  const filters = [];
  if ((cat || sec) && ui.view !== 'all') filters.push(view.name);
  if (ui.concept) filters.push(`concept: ${ui.concept}`);
  if (ui.tag) filters.push(`#${ui.tag}`);
  if (ui.query) filters.push(`"${ui.query}"`);
  const anyFilter = ui.view !== 'all' || ui.section || ui.category || ui.concept || ui.tag || ui.query;
  const desc = ui.view === 'notebook' && !cat && !sec
    ? 'Everything you have written notes on, most recently edited first.'
    : cat?.description || sec?.description || '';
  const crumbSection = cat ? sectionById(cat.section) : null;
  const scopeToggle = filterActive(ui.view) || ui.showAll
    ? h('button', {
        type: 'button', class: 'scope-toggle', 'aria-pressed': String(!ui.showAll),
        title: 'Only show articles related to your interests',
        onclick: () => { ui.showAll = !ui.showAll; setFilter({}); },
      }, h('span', { class: 'dot-ind' }), ui.showAll ? 'Showing everything' : 'Only my interests')
    : null;

  if (ui.view === 'profile') {
    put($('#context'), h('h1', {}, 'You'),
      h('p', {}, 'Your profile, interests and learning stats. All of it stays in this browser.'));
    return;
  }

  if (isHome()) {
    const mode = store.prefs.frontMode;
    const setMode = (m) => { store.prefs.frontMode = m; persist(); setFilter({}); };
    put($('#context'),
      h('h1', {}, mode === 'foryou' ? 'For you' : 'Latest'),
      h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Front page mode' },
        h('button', { type: 'button', role: 'radio', 'aria-checked': String(mode === 'foryou'), onclick: () => setMode('foryou') }, 'For you'),
        h('button', { type: 'button', role: 'radio', 'aria-checked': String(mode === 'latest'), onclick: () => setMode('latest') }, 'Latest')),
      scopeToggle,
      h('button', { type: 'button', class: 'link-btn', onclick: () => showInterests() }, hasProfile() ? 'Edit interests' : 'Set up interests'),
      h('p', {}, mode === 'foryou'
        ? `The ${FRONT_PER_SECTION} best matches in each topic${hasProfile() ? ', based on your interests' : ''}. Read articles make room for new ones.`
        : `Every article, newest first (${visible.length}).`));
    return;
  }

  put($('#context'),
    crumbSection ? h('button', { type: 'button', class: 'crumb', onclick: () => setFilter({ section: crumbSection.id, category: null, concept: null }) },
      `${crumbSection.name} ›`) : null,
    h('h1', {}, title),
    h('span', { class: 'count' }, `${visible.length} article${visible.length === 1 ? '' : 's'}`),
    scopeToggle,
    filters.length ? h('span', { class: 'count' }, `· ${filters.join(' · ')}`) : null,
    anyFilter ? h('button', { type: 'button', class: 'link-btn clear', onclick: () => {
      $('#search').value = '';
      setFilter({ view: 'all', section: null, category: null, concept: null, tag: null, query: '' });
    } }, 'Clear filters') : null,
    desc ? h('p', {}, desc) : null,
    cat && data.repo ? h('button', { type: 'button', class: 'link-btn add-link', onclick: () => showAddSource(cat.id) }, `+ Add a source to ${cat.name}`) : null,
  );
}

function interestPrompt(sec) {
  return h('div', { class: 'prompt-card' },
    h('strong', {}, `What do you want to learn in ${sec.name}?`),
    h('p', {}, 'Pick a few interests and this topic fills with articles related to them.'),
    h('button', { type: 'button', class: 'btn primary', onclick: () => showInterests(sec.id) }, `Choose ${sec.name} interests`));
}

function renderFront(list) {
  const reasonsById = new Map(frontGroups.flatMap((g) => g.picks.map((p) => [p.a.id, p.reasons])));
  let index = 0;
  const welcome = !hasProfile() && !store.prefs.profileDismissed
    ? h('div', { class: 'welcome-card' },
        h('strong', {}, 'Make this front page yours'),
        h('p', {}, 'Tell Signal what you want to learn. Only articles related to your interests will show up, with the best 3 per topic here.'),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn primary', onclick: () => showInterests() }, 'Set up my interests'),
          h('button', { type: 'button', class: 'btn', onclick: () => { store.prefs.profileDismissed = true; persist(); refresh(); } }, 'Not now')))
    : null;
  put(list, welcome, ...frontGroups.map((g) => h('section', { class: 'front-group', 'aria-label': g.section.name },
    h('div', { class: 'front-head' },
      h('h2', {}, g.section.name),
      g.total ? h('button', { type: 'button', class: 'link-btn', onclick: () => setFilter({ section: g.section.id, category: null, concept: null }) },
        `See all ${g.total} →`) : null),
    ...(g.picks.length ? g.picks.map((p) => renderCard(p.a, index++, reasonsById.get(p.a.id)))
      : [filterActive('all') && !sectionHasInterests(g.section.id) ? interestPrompt(g.section)
        : h('div', { class: 'empty small' }, h('strong', {}, 'Nothing matches yet'),
            'Try a wider circle or more concepts in ', h('button', { type: 'button', class: 'link-btn', onclick: () => showInterests(g.section.id) }, 'Your interests'), '.')]))));
  put($('#more'));
}

function renderList() {
  const list = $('#list');
  list.setAttribute('aria-busy', 'false');
  list.classList.toggle('front', isFront());
  list.classList.toggle('profile', ui.view === 'profile');
  if (ui.view === 'profile') { renderProfile(list); return; }
  if (isFront()) { renderFront(list); return; }
  if (!visible.length) {
    // Browsing a topic you haven't picked interests for: ask, don't just show nothing.
    const secId = ui.section || catById.get(ui.category)?.section;
    if (filterActive() && secId && !sectionHasInterests(secId)) {
      put(list, interestPrompt(sectionById(secId)));
      put($('#more'));
      return;
    }
    const msg = {
      saved: ['Nothing saved yet', 'Press Save on any article (or press s) to keep it here.'],
      notebook: ['Your notebook is empty', 'Add a note to any article to start building your own knowledge base.'],
      unread: ['All caught up', 'You have read everything that matches these filters.'],
    }[ui.view] || ['No articles match', filterActive() ? 'Only articles related to your interests are shown. Try "Only my interests" to switch it off, or widen your interests.' : 'Try clearing filters or a different search.'];
    put(list, h('div', { class: 'empty' }, h('strong', {}, msg[0]), msg[1]));
    put($('#more'), );
    return;
  }
  put(list, ...visible.slice(0, ui.limit).map((a, i) => renderCard(a, i)));
  put($('#more'), visible.length > ui.limit
    ? h('button', { type: 'button', class: 'btn', onclick: () => { ui.limit += PAGE_SIZE; renderList(); } },
        `Show more (${visible.length - ui.limit} left)`)
    : null);
}

function renderCard(a, index, reasons) {
  const isRead = Boolean(store.read[a.id]);
  const isSaved = Boolean(store.saved[a.id]);
  const note = store.notes[a.id];
  const href = safeHref(a.url);
  const cat = catById.get(a.category);

  const card = h('article', {
    class: `card${isRead ? ' read' : ''}${index === ui.active ? ' active' : ''}`,
    dataset: { id: a.id, index: String(index) },
    'aria-posinset': index + 1, 'aria-setsize': visible.length,
  },
    h('div', { class: 'card-meta' },
      h('span', { class: 'src' }, a.source),
      a.published ? h('time', { class: 'dot', datetime: a.published, title: new Date(a.published).toLocaleString() }, ` ${timeAgo(a.published)}`) : null,
      cat ? h('span', { class: 'dot' }, ` ${ui.section ? cat.name : `${sectionById(cat.section)?.name || ''} › ${cat.name}`}`) : null,
      a.author && a.author !== a.source ? h('span', { class: 'dot' }, ` ${a.author}`) : null,
    ),
    h('h2', {}, href
      ? h('a', { href, target: '_blank', rel: 'noopener noreferrer', onclick: () => markRead(a, true), onauxclick: () => markRead(a, true) }, a.title)
      : a.title),
    a.summary ? h('p', { class: 'summary' }, a.summary) : null,
    reasons?.length ? h('div', { class: 'why' }, `Picked for you: ${reasons.join(', ')}`) : null,
    note?.text && ui.editing !== a.id ? h('div', { class: 'note-preview' }, note.text) : null,
    h('div', { class: 'card-foot' },
      ...(a.cves || []).map((cve) => h('a', {
        class: 'chip cve', href: `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cve)}`,
        target: '_blank', rel: 'noopener noreferrer', title: 'Open in the National Vulnerability Database',
      }, cve)),
      ...(a.concepts || []).slice(0, 4).map((c) => h('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(ui.concept === c),
        onclick: () => setFilter({ concept: ui.concept === c ? null : c }),
      }, c)),
      ...(note?.tags || []).map((t) => h('button', { type: 'button', class: 'chip tag', onclick: () => setFilter({ tag: t }) }, `#${t}`)),
      // Actions stay together on one line, pushed to the right edge.
      h('span', { class: 'card-actions' },
        h('button', { type: 'button', class: 'act', 'aria-pressed': String(isSaved), onclick: () => toggleSaved(a) }, isSaved ? '★ Saved' : '☆ Save'),
        h('button', { type: 'button', class: 'act', 'aria-pressed': String(ui.editing === a.id), onclick: () => toggleEditor(a) }, note ? '✎ Edit note' : '✎ Note'),
        h('button', { type: 'button', class: 'act', onclick: () => markRead(a, !isRead) }, isRead ? 'Mark unread' : 'Mark read')),
    ),
  );
  if (ui.editing === a.id) card.append(renderEditor(a));
  return card;
}

function renderEditor(a) {
  const note = store.notes[a.id] || { text: '', tags: [] };
  // Keep an unsaved draft across re-renders (e.g. if you click Save on
  // another card while this editor is open).
  if (ui.draft?.id !== a.id) ui.draft = { id: a.id, text: note.text, tags: note.tags.join(', ') };
  const textarea = h('textarea', { id: `note-${a.id}`, placeholder: 'What did you learn? How would you explain it to a friend?' });
  textarea.value = ui.draft.text;
  const tagsInput = h('input', { id: `tags-${a.id}`, type: 'text', placeholder: 'e.g. study-later, try-this', autocomplete: 'off' });
  tagsInput.value = ui.draft.tags;
  textarea.addEventListener('input', () => { ui.draft.text = textarea.value; });
  tagsInput.addEventListener('input', () => { ui.draft.tags = tagsInput.value; });

  const insertPrompt = (p) => {
    const prefix = textarea.value && !textarea.value.endsWith('\n') ? '\n' : '';
    textarea.value += prefix + p;
    ui.draft.text = textarea.value;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  };

  const save = () => {
    const text = textarea.value.trim().slice(0, 20000);
    const tags = [...new Set(tagsInput.value.split(',').map(normalizeTag).filter(Boolean))].slice(0, 20);
    if (text || tags.length) {
      store.notes[a.id] = { text, tags, updated: Date.now() };
      snapshot(a);
      toast('Note saved');
    } else {
      delete store.notes[a.id];
      maybeDropSnapshot(a.id);
    }
    ui.editing = null;
    ui.draft = null;
    persist();
    refresh();
  };

  const editor = h('div', { class: 'editor' },
    h('div', { class: 'field' },
      h('label', { for: textarea.id }, 'Your notes'),
      textarea,
      h('div', { class: 'prompts' }, ...(NOTE_PROMPTS[sectionOf(a)] || NOTE_PROMPTS.general).map((p) =>
        h('button', { type: 'button', class: 'chip', onclick: () => insertPrompt(p) }, `+ ${p.replace(/: $/, '')}`)))),
    h('div', { class: 'field' },
      h('label', { for: tagsInput.id }, 'Tags'),
      tagsInput,
      h('div', { class: 'hint' }, 'Comma separated. Tags show up under Concepts in the sidebar.')),
    h('div', { class: 'editor-actions' },
      store.notes[a.id] ? h('button', { type: 'button', class: 'btn danger', onclick: () => {
        textarea.value = ''; tagsInput.value = ''; save();
      } }, 'Delete note') : null,
      h('button', { type: 'button', class: 'btn', onclick: () => { ui.editing = null; ui.draft = null; refresh(); } }, 'Cancel'),
      h('button', { type: 'button', class: 'btn primary', onclick: save }, 'Save note')),
  );
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); ui.editing = null; ui.draft = null; refresh(); }
  });
  if (ui.focusEditor) { ui.focusEditor = false; queueMicrotask(() => textarea.focus()); }
  return editor;
}

// ---------- Actions ----------

function setFilter(patch) {
  Object.assign(ui, patch, { limit: PAGE_SIZE, active: -1, editing: null, draft: null });
  closeMenu();
  refresh();
  window.scrollTo({ top: 0 });
}

const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function markRead(a, value) {
  if (value && !store.read[a.id]) {
    // Learning history for the profile page.
    const day = dayKey();
    store.history.days[day] = (store.history.days[day] || 0) + 1;
    for (const c of a.concepts || []) store.history.concepts[c] = (store.history.concepts[c] || 0) + 1;
  }
  if (value) store.read[a.id] = Date.now();
  else delete store.read[a.id];
  persist();
  // Defer so a click on the title link still navigates before we re-render.
  setTimeout(refresh, 0);
}

function toggleSaved(a) {
  if (store.saved[a.id]) {
    delete store.saved[a.id];
    maybeDropSnapshot(a.id);
    toast('Removed from saved');
  } else {
    store.saved[a.id] = Date.now();
    snapshot(a);
    toast('Saved');
  }
  persist();
  refresh();
}

function toggleEditor(a) {
  ui.editing = ui.editing === a.id ? null : a.id;
  ui.draft = null;
  ui.focusEditor = Boolean(ui.editing);
  refresh();
}

// Drop read markers for articles that no longer exist anywhere, so storage
// doesn't grow forever.
function pruneStore() {
  const known = new Set([...data.articles.map((a) => a.id), ...Object.keys(store.snapshots)]);
  const cutoff = Date.now() - 45 * DAY;
  for (const [id, ts] of Object.entries(store.read)) if (!known.has(id) && ts < cutoff) delete store.read[id];
}

function refresh() {
  visible = computeVisible();
  if (ui.active >= Math.min(visible.length, ui.limit)) ui.active = -1;
  renderSidebar();
  renderContext();
  renderList();
}

// ---------- Dialogs ----------

function openDialog(title, ...body) {
  $('#dialog-title').textContent = title;
  put($('#dialog-body'), ...body);
  $('#dialog').showModal();
}

function showSources() {
  // Start from whatever you're looking at in the main view.
  const filter = {
    topic: ui.category ? `cat:${ui.category}` : ui.section ? `sec:${ui.section}` : 'all',
    status: 'all',
    query: '',
  };
  const sectionOfSource = (src) => src.section || catById.get(src.category)?.section || 'security';
  const matchesTopic = (src) => {
    if (filter.topic.startsWith('sec:')) return sectionOfSource(src) === filter.topic.slice(4);
    if (filter.topic.startsWith('cat:')) return src.category === filter.topic.slice(4);
    return true;
  };
  const matches = (src) => {
    if (!matchesTopic(src)) return false;
    if (filter.status === 'ok' && !src.ok) return false;
    if (filter.status === 'failed' && src.ok) return false;
    return !filter.query || src.name.toLowerCase().includes(filter.query);
  };

  const topic = h('select', { id: 'src-topic', 'aria-label': 'Filter by topic' },
    h('option', { value: 'all' }, 'All topics'),
    ...data.sections.map((sec) => h('optgroup', { label: sec.name },
      h('option', { value: `sec:${sec.id}` }, `All of ${sec.name}`),
      ...data.categories.filter((c) => c.section === sec.id).map((c) => h('option', { value: `cat:${c.id}` }, c.name)))));
  topic.value = filter.topic;
  const search = h('input', { type: 'search', placeholder: 'Find a source…', 'aria-label': 'Find a source', autocomplete: 'off' });
  const statusSeg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Filter by status' });
  const summary = h('p', {});
  const list = h('div', { class: 'source-groups' });

  const render = () => {
    const shown = data.sources.filter(matches);
    const failed = data.sources.filter((src) => !src.ok && matchesTopic(src)).length;
    put(statusSeg, ...[['all', 'All'], ['ok', 'Working'], ['failed', `Failed (${failed})`]].map(([value, label]) =>
      h('button', { type: 'button', role: 'radio', 'aria-checked': String(filter.status === value),
        onclick: () => { filter.status = value; render(); } }, label)));
    summary.textContent = `Showing ${shown.length} of ${data.sources.length} sources` +
      (data.generatedAt ? ` · last updated ${timeAgo(data.generatedAt)}` : '') + '. To remove one, delete it from feeds.json in the repository.';

    // Group what's shown by subcategory, in sidebar order.
    const groups = data.categories.map((c) => ({ c, items: shown.filter((src) => src.category === c.id) })).filter((g) => g.items.length);
    put(list, groups.length ? groups.map(({ c, items }) => h('section', { class: 'source-group' },
      h('h3', {}, `${sectionById(c.section)?.name || ''} › ${c.name}`, h('span', { class: 'count' }, ` ${items.length}`)),
      h('ul', { class: 'row-list' }, ...items.map((src) => {
        const href = safeHref(src.site);
        return h('li', {},
          h('span', {}, href ? h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, src.name) : src.name),
          src.ok ? h('span', { class: 'status-ok' }, `${src.count} item${src.count === 1 ? '' : 's'}`)
            : h('span', { class: 'status-bad', title: src.error || '' }, src.error ? `failed: ${src.error}` : 'failed'));
      }))))
      : h('div', { class: 'empty' }, h('strong', {}, 'No sources match'), 'Try another topic or status.'));
  };

  topic.addEventListener('change', () => { filter.topic = topic.value; render(); });
  search.addEventListener('input', () => { filter.query = search.value.trim().toLowerCase(); render(); });
  render();

  openDialog('Sources',
    h('div', { class: 'source-filters' }, topic, statusSeg, search),
    summary,
    h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn primary', onclick: () => {
      const cat = filter.topic.startsWith('cat:') ? filter.topic.slice(4) : null;
      showAddSource(cat);
    } }, '+ Add a source')),
    list,
  );
}

function showData() {
  const counts = `${Object.keys(store.saved).length} saved, ${Object.keys(store.notes).length} notes, ${Object.keys(store.read).length} read markers`;
  openDialog('Your data',
    h('p', {}, 'Saves, notes and reading history are stored only in this browser. Export them to back up or move to another device (for example, from GitHub Pages to running the app locally).'),
    h('p', {}, `Currently: ${counts}.`),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn primary', onclick: exportData }, 'Export backup'),
      h('button', { type: 'button', class: 'btn', onclick: () => $('#import-file').click() }, 'Import backup'),
      h('button', { type: 'button', class: 'btn danger', onclick: clearData }, 'Erase all')),
    h('h3', {}, 'Import behavior'),
    h('p', {}, 'Imports merge with what is here. When the same note exists in both, the most recently edited one wins. Imported files are validated field by field before anything is stored.'),
  );
}

function showHelp() {
  const rows = [
    ['j / k', 'Next / previous article'], ['o or Enter', 'Open article (marks it read)'], ['s', 'Save / unsave'],
    ['n', 'Write a note'], ['m', 'Toggle read'], ['/', 'Search'], ['1–5', 'Home / Unread / Saved / Notebook / You'],
    ['a', 'Add a source'], ['i', 'Your interests'], ['t', 'Appearance'], ['Ctrl/⌘ + Enter', 'Save note'], ['Esc', 'Close editor or dialog'], ['?', 'This help'],
  ];
  openDialog('Keyboard shortcuts',
    h('ul', { class: 'row-list' }, ...rows.map(([k, d]) => h('li', {}, h('span', {}, d), h('kbd', {}, k)))),
    h('h3', {}, 'How this works'),
    h('p', {}, 'A scheduled GitHub Action fetches the feeds in feeds.json, converts every item to plain text, and publishes the result with this page. Your browser only ever loads files from this site: the Content Security Policy blocks everything else.'),
  );
}

function exportData() {
  const blob = new Blob([JSON.stringify({ ...store, exportedAt: new Date().toISOString(), app: 'signal' }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: `signal-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Backup downloaded');
}

async function importData(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { toast('That file is too large to be a backup'); return; }
  try {
    const incoming = sanitizeStore(JSON.parse(await file.text()));
    for (const key of ['read', 'saved']) {
      for (const [id, ts] of Object.entries(incoming[key])) store[key][id] = Math.max(store[key][id] || 0, ts);
    }
    for (const [id, n] of Object.entries(incoming.notes)) {
      if (!store.notes[id] || store.notes[id].updated < n.updated) store.notes[id] = n;
    }
    Object.assign(store.snapshots, incoming.snapshots);
    if (incoming.profile.updated > store.profile.updated) { store.profile = incoming.profile; profileVersion++; }
    for (const [d, n] of Object.entries(incoming.history.days)) store.history.days[d] = Math.max(store.history.days[d] || 0, n);
    for (const [c, n] of Object.entries(incoming.history.concepts)) store.history.concepts[c] = Math.max(store.history.concepts[c] || 0, n);
    persist();
    $('#dialog').close();
    refresh();
    toast(`Imported ${Object.keys(incoming.notes).length} notes and ${Object.keys(incoming.saved).length} saves`);
  } catch {
    toast('Could not read that file. Is it a Signal backup?');
  }
}

function clearData() {
  // A two-step confirm without window.confirm(), which blocks the page.
  const body = $('#dialog-body');
  put(body, 
    h('p', {}, 'This erases every save, note and read marker in this browser. Export a backup first if you might want them back.'),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn', onclick: showData }, 'Cancel'),
      h('button', { type: 'button', class: 'btn danger', onclick: () => {
        const prefs = store.prefs;
        store = emptyStore();
        store.prefs = prefs;
        persist();
        $('#dialog').close();
        refresh();
        toast('All data erased');
      } }, 'Yes, erase everything')),
  );
}

// ---------- Theme, menu, keyboard ----------

function setAppearance(patch) {
  store.prefs.appearance = Theme.apply({ ...store.prefs.appearance, ...patch });
  persist();
}

function showAppearance() {
  const body = h('div', {});
  const render = () => {
    const a = store.prefs.appearance;
    const dark = Theme.isDark(a);
    const swatch = (id, label, colors) => {
      const selected = a.preset === id;
      const mini = h('div', { class: 'mini' },
        h('div', { class: 'bar' }), h('div', { class: 'bar short' }), h('div', { class: 'pill' }));
      // CSSOM styling is allowed under our CSP (inline style attributes are not).
      mini.style.background = colors.bg;
      mini.children[0].style.background = colors.surface;
      mini.children[1].style.background = colors.soft;
      mini.children[2].style.background = colors.accent;
      return h('button', {
        type: 'button', class: 'swatch', role: 'radio', 'aria-checked': String(selected), 'aria-label': `${label} theme`,
        onclick: () => { setAppearance({ preset: id }); render(); },
      }, mini, h('div', { class: 'label' }, h('span', {}, label), selected ? h('span', { class: 'check' }, '✓') : null));
    };
    const seg = (key, options) => h('div', { class: 'seg', role: 'radiogroup' }, ...options.map(([value, label]) =>
      h('button', { type: 'button', role: 'radio', 'aria-checked': String(a[key] === value), onclick: () => { setAppearance({ [key]: value }); render(); } }, label)));
    const row = (label, hint, control) => h('div', { class: 'setting-row' },
      h('span', { class: 'setting-label' }, label, hint ? h('span', { class: 'setting-hint' }, hint) : null), control);

    const picker = h('input', { type: 'color', 'aria-label': 'Pick your own color' });
    picker.value = a.custom;
    picker.addEventListener('input', () => { setAppearance({ preset: 'custom', custom: picker.value }); });
    picker.addEventListener('change', render);

    put(body,
      h('p', {}, 'Pick a palette and it applies right away. Every theme is tuned so text stays easy to read in both light and dark mode.'),
      h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Color theme' },
        ...Object.entries(Theme.PRESETS).map(([id, p]) => swatch(id, p.name, Theme.preview(id, dark, a.tint))),
        swatch('custom', 'Your color', Theme.preview(a.custom, dark, a.tint))),
      h('label', { class: 'custom-color' }, picker, 'Choose any color for "Your color"'),
      h('h3', {}, 'Style'),
      row('Mode', 'Auto follows your device setting', seg('mode', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']])),
      row('Background', 'Tinted uses a hint of your color', seg('tint', [['tinted', 'Tinted'], ['neutral', 'Neutral']])),
      row('Text size', null, seg('size', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']])),
      row('Layout', 'Compact fits more articles on screen', seg('density', [['comfy', 'Comfortable'], ['compact', 'Compact']])),
      row('Corners', null, seg('corners', [['square', 'Square'], ['soft', 'Soft'], ['round', 'Round']])),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', onclick: () => { setAppearance(Theme.DEFAULTS); render(); toast('Back to the default look'); } }, 'Reset to default')),
    );
  };
  render();
  openDialog('Appearance', body);
}

// ---------- Your interests ----------

const INTEREST_EXAMPLES = {
  security: 'e.g. OAuth, detection engineering, SOAR, phishing',
  music: 'e.g. Eurorack, Ableton, jazz harmony, mixing vocals',
  games: 'e.g. roguelikes, Godot, speedrun glitches, anti-cheat',
};

const DEPTHS = [
  [1, 'Close', 'Your concepts and their nearest ideas'],
  [2, 'Related', 'One step further out'],
  [3, 'Broad', 'Two steps further out'],
];

function showInterests(focusSection) {
  // Work on a copy so Cancel really cancels.
  const draft = JSON.parse(JSON.stringify({ sections: store.profile.sections, depth: store.profile.depth }));
  const body = h('div', {});
  const blank = () => ({ concepts: [], categories: [], keywords: [] });
  const toggle = (secId, key, value) => {
    const p = (draft.sections[secId] ||= blank());
    p[key] = p[key].includes(value) ? p[key].filter((x) => x !== value) : [...p[key], value];
    render();
  };
  const render = () => {
    const scrollTop = $('#dialog-body').scrollTop;
    const preview = sanitizeProfile({ ...store.profile, ...draft });
    const match = makeMatcher(preview);
    const pool = allArticles();
    put(body,
      h('p', {}, 'Only articles related to what you pick will appear, here and across the app. Each article says why it matched. You can flip to "Showing everything" any time.'),
      h('div', { class: 'setting-row' },
        h('span', { class: 'setting-label' }, 'How closely related?',
          h('span', { class: 'setting-hint' }, DEPTHS.find(([d]) => d === draft.depth)?.[2])),
        h('div', { class: 'seg', role: 'radiogroup' }, ...DEPTHS.map(([d, label]) => h('button', {
          type: 'button', role: 'radio', 'aria-checked': String(draft.depth === d), onclick: () => { draft.depth = d; render(); },
        }, `${d} · ${label}`)))),
      ...data.sections.map((sec) => {
        const p = draft.sections[sec.id] || blank();
        const g = graphFor(sec.id);
        const concepts = sec.concepts?.length ? sec.concepts : [...g.nodes.keys()];
        const expansion = expandInterests(sec.id, p.concepts, draft.depth);
        const layers = [1, 2, 3].filter((d) => d <= draft.depth)
          .map((d) => [d, [...expansion].filter(([, info]) => info.dist === d).map(([id]) => g.nodes.get(id).label)])
          .filter(([, labels]) => labels.length);
        const count = preview.sections[sec.id] ? pool.filter((a) => sectionOf(a) === sec.id && match(a)).length : 0;
        const keywords = h('input', { type: 'text', placeholder: INTEREST_EXAMPLES[sec.id] || 'Words or names to look for', autocomplete: 'off', 'aria-label': `${sec.name} keywords` });
        keywords.value = p.keywords.join(', ');
        keywords.addEventListener('input', () => {
          (draft.sections[sec.id] ||= blank()).keywords = keywords.value.split(',').map((k) => k.trim()).filter(Boolean).slice(0, 20);
        });
        keywords.addEventListener('change', render);
        return h('section', { class: 'interest-section', id: `interests-${sec.id}` },
          h('div', { class: 'interest-head' }, h('h3', {}, sec.name),
            h('span', { class: `match-count${preview.sections[sec.id] ? '' : ' none'}` },
              preview.sections[sec.id] ? `${count} article${count === 1 ? '' : 's'} match right now` : 'Nothing picked: this topic stays empty')),
          h('div', { class: 'interest-label' }, 'I want to learn about'),
          h('div', { class: 'chips' }, ...concepts.map((c) => h('button', {
            type: 'button', class: 'chip', 'aria-pressed': String(p.concepts.includes(c)), onclick: () => toggle(sec.id, 'concepts', c),
          }, g.nodes.get(c)?.label || c))),
          layers.length ? h('details', { class: 'layers' },
            h('summary', {}, `Also includes ${layers.reduce((n, [, l]) => n + l.length, 0)} related ideas`),
            ...layers.map(([d, labels]) => h('div', { class: 'layer' }, h('span', { class: 'layer-n' }, `Layer ${d}`), labels.join(', ')))) : null,
          h('div', { class: 'interest-label' }, 'Include everything from these subtopics (optional)'),
          h('div', { class: 'chips' }, ...data.categories.filter((c) => c.section === sec.id).map((c) => h('button', {
            type: 'button', class: 'chip', 'aria-pressed': String(p.categories.includes(c.id)), onclick: () => toggle(sec.id, 'categories', c.id),
          }, c.name))),
          h('div', { class: 'interest-label' }, 'Anything specific? (comma separated)'),
          keywords);
      }),
      h('div', { class: 'form' }, h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => $('#dialog').close() }, 'Cancel'),
        h('button', { type: 'button', class: 'btn primary', onclick: () => {
          store.profile = sanitizeProfile({ ...store.profile, ...draft, updated: Date.now() });
          profileVersion++;
          store.prefs.frontMode = 'foryou';
          persist();
          $('#dialog').close();
          ui.showAll = false;
          $('#search').value = '';
          setFilter({ view: 'all', section: null, category: null, concept: null, tag: null, query: '' });
          toast(hasProfile() ? 'Your feed now follows your interests' : 'Interests cleared');
        } }, 'Save interests'))),
    );
    $('#dialog-body').scrollTop = scrollTop;
  };
  render();
  openDialog('What do you want to learn?', body);
  if (focusSection) queueMicrotask(() => document.getElementById(`interests-${focusSection}`)?.scrollIntoView({ block: 'start' }));
}

// ---------- Profile ----------

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return (parts.length ? parts.slice(0, 2).map((p) => p[0]) : ['?']).join('').toUpperCase();
}

function avatar(size = 'lg') {
  return h('span', { class: `avatar ${size}`, 'aria-hidden': 'true' }, initials(store.profile.name));
}

function streak() {
  let n = 0;
  const d = new Date();
  if (!store.history.days[dayKey(d)]) d.setDate(d.getDate() - 1); // today doesn't break it yet
  while (store.history.days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function renderProfile(list) {
  const prof = store.profile;
  const days = store.history.days;
  const weekAgo = Date.now() - 7 * DAY;
  const readWeek = Object.values(store.read).filter((t) => t >= weekAgo).length;
  const totalRead = Math.max(Object.values(days).reduce((a, b) => a + b, 0), Object.keys(store.read).length);
  const topConcepts = Object.entries(store.history.concepts).sort((a, b) => b[1] - a[1]).slice(0, 10);

  const name = h('input', { type: 'text', placeholder: 'Your name', 'aria-label': 'Your name', maxlength: '60', autocomplete: 'off' });
  name.value = prof.name;
  const goal = h('input', { type: 'text', placeholder: 'What are you working toward? e.g. "Get sharp on cloud identity attacks"', 'aria-label': 'Your goal', maxlength: '160', autocomplete: 'off' });
  goal.value = prof.goal;
  const saveBasics = () => {
    store.profile = sanitizeProfile({ ...store.profile, name: name.value, goal: goal.value });
    persist();
    const av = document.querySelector('.profile-card .avatar');
    if (av) av.textContent = initials(store.profile.name);
    renderSidebar();
  };
  name.addEventListener('input', saveBasics);
  goal.addEventListener('change', () => { saveBasics(); toast('Saved'); });

  const stat = (value, label) => h('div', { class: 'stat' }, h('b', {}, value), h('span', {}, label));
  const since = new Date(store.createdAt || Date.now()).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  put(list,
    h('section', { class: 'profile-card' },
      avatar('lg'),
      h('div', { class: 'profile-fields' }, name, goal, h('div', { class: 'hint' }, `Reading with Signal since ${since}`))),
    h('section', { class: 'profile-panel' },
      h('h2', {}, 'Learning stats'),
      h('div', { class: 'stats wide' },
        stat(streak(), streak() === 1 ? 'day streak' : 'day streak'),
        stat(readWeek, 'read this week'),
        stat(totalRead, 'read in total'),
        stat(Object.keys(store.notes).length, 'notes'),
        stat(Object.keys(store.saved).length, 'saved')),
      h('h3', {}, 'What you read most'),
      topConcepts.length
        ? h('div', { class: 'chips' }, ...topConcepts.map(([c, n]) => h('span', { class: 'chip static' }, `${c} · ${n}`)))
        : h('p', { class: 'hint' }, 'Open a few articles and your top concepts show up here.')),
    h('section', { class: 'profile-panel' },
      h('div', { class: 'front-head' }, h('h2', {}, 'Your interests'),
        h('button', { type: 'button', class: 'btn', onclick: () => showInterests() }, 'Edit interests')),
      h('p', { class: 'hint' }, `Related within ${prof.depth} layer${prof.depth === 1 ? '' : 's'} (${DEPTHS.find(([d]) => d === prof.depth)[1].toLowerCase()}).`),
      ...data.sections.map((sec) => {
        const p = prof.sections[sec.id];
        const g = graphFor(sec.id);
        return h('div', { class: 'interest-summary' },
          h('strong', {}, sec.name),
          p ? h('div', { class: 'chips' },
                ...p.concepts.map((c) => h('span', { class: 'chip static' }, g.nodes.get(c)?.label || c)),
                ...p.keywords.map((k) => h('span', { class: 'chip static tag' }, `“${k}”`)),
                ...p.categories.map((c) => h('span', { class: 'chip static' }, `all of ${catById.get(c)?.name || c}`)))
            : h('span', { class: 'hint' }, 'Nothing picked yet, so this topic is empty. ',
                h('button', { type: 'button', class: 'link-btn add-link', onclick: () => showInterests(sec.id) }, 'Pick interests')));
      })),
    h('section', { class: 'profile-panel' },
      h('h2', {}, 'Your data'),
      h('p', { class: 'hint' }, 'Your profile, interests, saves and notes live only in this browser. Back them up or move them to another device.'),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', onclick: exportData }, 'Export backup'),
        h('button', { type: 'button', class: 'btn', onclick: () => $('#import-file').click() }, 'Import backup'))),
  );
  put($('#more'));
}

// ---------- New topic ----------

function showNewTopic() {
  if (!data.repo) {
    openDialog('New topic', h('p', {}, 'This copy of Signal isn\'t linked to a GitHub repository yet. Add "repo": "your-name/newsfeed" under settings in feeds.json.'));
    return;
  }
  let entry = null; // the catalog entry we're suggesting from
  const picked = new Set();
  const name = h('input', { id: 'topic-name', type: 'text', placeholder: 'e.g. AI, Photography, Space, Web development', autocomplete: 'off', maxlength: '40' });
  const desc = h('input', { id: 'topic-desc', type: 'text', placeholder: 'Optional one-line description', autocomplete: 'off', maxlength: '160' });
  const subs = h('input', { id: 'topic-subs', type: 'text', placeholder: 'e.g. News, Deep dives (optional)', autocomplete: 'off' });
  const own = h('textarea', { id: 'topic-own', placeholder: 'One per line: a feed, a website or a YouTube channel.\nAdd "| Subtopic" to choose where it goes.' });
  const concepts = h('textarea', { id: 'topic-concepts', placeholder: 'One per line, e.g.\nagents: agent, agentic\nevaluation: eval, benchmark' });
  const suggestBox = h('div', { class: 'suggest-box' });

  const choose = (e) => {
    entry = e;
    picked.clear();
    if (e) {
      e.sources.forEach((src) => picked.add(src.url));
      if (!desc.value) desc.value = e.description;
      subs.value = e.subtopics.join(', ');
      concepts.value = Object.entries(e.concepts).map(([label, terms]) => `${label}: ${terms.join(', ')}`).join('\n');
    }
    renderSuggestions();
  };

  const renderSuggestions = () => {
    const matches = suggestTopics(name.value);
    const others = (matches.length ? matches : CATALOG).filter((e) => e !== entry);
    put(suggestBox,
      entry ? h('div', {},
        h('div', { class: 'interest-label' }, `Suggested sources from "${entry.name}"`),
        h('ul', { class: 'check-list' }, ...entry.sources.map((src) => {
          const box = h('input', { type: 'checkbox', id: `src-${slugify(src.url)}` });
          box.checked = picked.has(src.url);
          box.addEventListener('change', () => { if (box.checked) picked.add(src.url); else picked.delete(src.url); });
          return h('li', {}, box, h('label', { for: box.id }, h('strong', {}, src.name), h('span', { class: 'count' }, ` · ${src.subtopic}`)));
        })))
        : h('p', { class: 'hint' }, name.value.trim().length > 1
          ? 'No ready-made sources for that name yet. Pick a starting point below, or add your own sources.'
          : 'Type a name to get suggestions, or start from one of these:'),
      others.length ? h('div', {},
        h('div', { class: 'interest-label' }, entry ? 'Or start from' : matches.length ? 'Matching starting points' : 'Starting points'),
        h('div', { class: 'chips' }, ...others.map((e) => h('button', { type: 'button', class: 'chip', onclick: () => {
          if (!name.value.trim()) name.value = e.name;
          choose(e);
        } }, e.name)))) : null);
  };

  name.addEventListener('input', () => {
    const best = suggestTopics(name.value)[0] || null;
    if (best !== entry) choose(best);
    else renderSuggestions();
  });

  const submit = (ev) => {
    ev.preventDefault();
    const topic = name.value.trim();
    if (!topic) { toast('Give the topic a name'); name.focus(); return; }
    if (data.sections.some((sec) => sec.name.toLowerCase() === topic.toLowerCase())) { toast(`You already have a topic called ${topic}`); return; }
    const lines = [
      ...(entry ? entry.sources.filter((src) => picked.has(src.url)).map((src) => `${src.url} | ${src.subtopic}`) : []),
      ...own.value.split('\n').map((l) => l.trim()).filter(Boolean),
    ].slice(0, 15);
    for (const line of lines) {
      const raw = line.split('|')[0].trim();
      if (!safeHref(/^[a-z]+:/i.test(raw) ? raw : `https://${raw}`)) { toast(`That doesn't look like a web address: ${raw.slice(0, 40)}`); return; }
    }
    const params = new URLSearchParams({
      template: 'new-topic.yml', title: `[New topic] ${topic}`,
      name: topic, description: desc.value.trim(), subtopics: subs.value.trim(),
      sources: lines.join('\n'), concepts: concepts.value.trim(),
    });
    window.open(`https://github.com/${data.repo}/issues/new?${params}`, '_blank', 'noopener,noreferrer');
    $('#dialog').close();
    toast('Finish on GitHub: click "Create", and the bot builds your topic');
  };

  renderSuggestions();
  openDialog('New topic',
    h('form', { class: 'form', onsubmit: submit },
      h('div', { class: 'field' }, h('label', { for: name.id }, 'Topic name'), name),
      suggestBox,
      h('div', { class: 'field' }, h('label', { for: own.id }, 'Your own sources (optional)'), own),
      h('details', { class: 'layers' }, h('summary', {}, 'More options: description, subtopics, concepts'),
        h('div', { class: 'field' }, h('label', { for: desc.id }, 'Description'), desc),
        h('div', { class: 'field' }, h('label', { for: subs.id }, 'Subtopics (comma separated)'), subs,
          h('div', { class: 'hint' }, 'Leave empty for a single "General" subtopic. Sources without "| Subtopic" are sorted automatically.')),
        h('div', { class: 'field' }, h('label', { for: concepts.id }, 'Concepts to track'), concepts,
          h('div', { class: 'hint' }, 'These become your choices in Your interests for this topic.'))),
      h('div', { class: 'note-box' }, 'What happens next:', h('ol', {},
        h('li', {}, 'GitHub opens with everything filled in. Click "Create".'),
        h('li', {}, 'A bot creates the topic, checks each source and files it, then replies with what it added.'),
        h('li', {}, 'After a couple of minutes, pick your interests for the new topic and it fills up.'))),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => $('#dialog').close() }, 'Cancel'),
        h('button', { type: 'submit', class: 'btn primary' }, 'Continue on GitHub'))));
  queueMicrotask(() => name.focus());
}

const slugify = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);

// ---------- Add source ----------

function showAddSource(presetCategory) {
  const repo = data.repo;
  const url = h('input', { id: 'add-url', type: 'text', inputmode: 'url', placeholder: 'https://example.com or a YouTube channel', autocomplete: 'off', spellcheck: 'false' });
  const name = h('input', { id: 'add-name', type: 'text', placeholder: "Leave empty to use the site's own name", autocomplete: 'off' });
  const select = h('select', { id: 'add-cat' },
    h('option', { value: 'auto' }, 'Auto-sort (recommended)'),
    ...data.sections.map((sec) => h('optgroup', { label: sec.name },
      ...data.categories.filter((c) => c.section === sec.id).map((c) => h('option', { value: c.id }, c.name)))));
  if (presetCategory) select.value = presetCategory;

  const submit = (e) => {
    e.preventDefault();
    const raw = url.value.trim();
    const href = safeHref(/^[a-z]+:/i.test(raw) ? raw : `https://${raw}`);
    if (!raw || !href) { toast('Enter a web address that starts with https://'); url.focus(); return; }
    const title = `[Add source] ${name.value.trim() || new URL(href).hostname.replace(/^www\./, '')}`;
    const params = new URLSearchParams({ template: 'add-source.yml', title, url: href, category: select.value, name: name.value.trim() });
    window.open(`https://github.com/${repo}/issues/new?${params}`, '_blank', 'noopener,noreferrer');
    $('#dialog').close();
    toast('Finish on GitHub: click "Create", and the bot takes it from there');
  };

  if (!repo) {
    openDialog('Add a source',
      h('p', {}, 'This copy of Signal isn\'t linked to a GitHub repository yet. Add "repo": "your-name/newsfeed" under settings in feeds.json, or run this on your computer:'),
      h('p', {}, h('kbd', {}, 'npm run add-source -- https://example.com')));
    return;
  }

  openDialog('Add a source',
    h('form', { class: 'form', onsubmit: submit },
      h('div', { class: 'field' }, h('label', { for: url.id }, 'Website, feed or YouTube channel'), url,
        h('div', { class: 'hint' }, 'A homepage works too: the feed is found automatically.')),
      h('div', { class: 'field' }, h('label', { for: select.id }, 'Where should it go?'), select,
        h('div', { class: 'hint' }, 'Auto-sort reads the latest posts and picks the best-matching topic.')),
      h('div', { class: 'field' }, h('label', { for: name.id }, 'Name (optional)'), name),
      h('div', { class: 'note-box' }, 'What happens next:', h('ol', {},
        h('li', {}, 'GitHub opens with everything filled in. Click "Create".'),
        h('li', {}, 'A bot checks the feed, files it, and replies within about a minute.'),
        h('li', {}, 'This page includes the new source a couple of minutes later.'))),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => $('#dialog').close() }, 'Cancel'),
        h('button', { type: 'submit', class: 'btn primary' }, 'Continue on GitHub'))));
  queueMicrotask(() => url.focus());
}

function openMenu() { $('#sidebar').classList.add('open'); $('#menu-btn').setAttribute('aria-expanded', 'true'); }
function closeMenu() { $('#sidebar').classList.remove('open'); $('#menu-btn').setAttribute('aria-expanded', 'false'); }

function setActive(i) {
  const count = Math.min(visible.length, ui.limit);
  if (!count) return;
  ui.active = Math.max(0, Math.min(count - 1, i));
  document.querySelectorAll('.card.active').forEach((c) => c.classList.remove('active'));
  const card = document.querySelector(`.card[data-index="${ui.active}"]`);
  if (card) {
    card.classList.add('active');
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function onKey(e) {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (typing) {
    if (e.key === 'Escape' && e.target.id === 'search') e.target.blur();
    return;
  }
  if ($('#dialog').open) return;
  const current = visible[ui.active];
  switch (e.key) {
    case 'j': setActive(ui.active + 1); break;
    case 'k': setActive(ui.active - 1); break;
    case '/': e.preventDefault(); $('#search').focus(); break;
    case '?': showHelp(); break;
    case 't': showAppearance(); break;
    case 'i': showInterests(); break;
    case 'a': e.preventDefault(); showAddSource(ui.category); break;
    case '1': case '2': case '3': case '4': case '5': setFilter({ view: VIEWS[Number(e.key) - 1].id }); break;
    case 'o': case 'Enter':
      if (current && safeHref(current.url)) {
        window.open(safeHref(current.url), '_blank', 'noopener,noreferrer');
        markRead(current, true);
      }
      break;
    case 's': if (current) toggleSaved(current); break;
    case 'm': if (current) markRead(current, !store.read[current.id]); break;
    case 'n': if (current) { e.preventDefault(); toggleEditor(current); } break;
    case 'Escape': closeMenu(); if (ui.editing) { ui.editing = null; refresh(); } break;
    default: return;
  }
}

// ---------- Boot ----------

async function loadData() {
  try {
    const res = await fetch('data/articles.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    data = {
      generatedAt: str(json.generatedAt, 40) || null,
      repo: /^[\w.-]+\/[\w.-]+$/.test(json.repo || '') ? json.repo : null,
      // Older data files have no sections: treat everything as Security.
      sections: (json.sections || [{ id: 'security', name: 'Security', description: '' }])
        .map((s) => ({
          id: str(s.id, 40), name: str(s.name, 80), description: str(s.description, 300),
          concepts: Array.isArray(s.concepts) ? s.concepts.filter((c) => typeof c === 'string').slice(0, 40).map((c) => c.slice(0, 40)) : [],
        })),
      categories: (json.categories || []).map((c) => ({
        id: str(c.id, 60), name: str(c.name, 80), description: str(c.description, 300), section: str(c.section, 40) || 'security',
      })),
      sources: (json.sources || []).map((s) => ({ name: str(s.name, 120), site: s.site, category: str(s.category, 60), ok: Boolean(s.ok), count: num(s.count) ?? 0, error: str(s.error, 200) })),
      articles: (json.articles || []).map(sanitizeArticle).filter(Boolean),
    };
    byId = new Map(data.articles.map((a) => [a.id, a]));
    catById = new Map(data.categories.map((c) => [c.id, c]));
    graphCache.clear();
    profileVersion++;
    $('#updated').textContent = data.generatedAt ? `Updated ${timeAgo(data.generatedAt)}` : 'Updated';
    $('#updated').title = data.generatedAt ? new Date(data.generatedAt).toLocaleString() : '';
  } catch {
    $('#updated').textContent = 'No feed data yet';
    put($('#list'), h('div', { class: 'empty' },
      h('strong', {}, 'No articles yet'),
      'Run "npm run fetch" locally, or wait for the GitHub Action to publish the first batch.'));
    renderSidebar();
    return false;
  }
  return true;
}

function init() {
  $('#sort').value = store.prefs.sort;
  $('#sort').addEventListener('change', (e) => { store.prefs.sort = e.target.value; persist(); setFilter({}); });

  let searchTimer;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => setFilter({ query: e.target.value }), 150);
  });

  $('#menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#sidebar').classList.contains('open') ? closeMenu() : openMenu();
  });
  // Tapping outside the slide-out menu closes it on small screens.
  $('.main').addEventListener('click', () => { if ($('#sidebar').classList.contains('open')) closeMenu(); });
  $('#open-sources').addEventListener('click', showSources);
  $('#open-data').addEventListener('click', showData);
  $('#open-help').addEventListener('click', showHelp);
  $('#open-appearance').addEventListener('click', showAppearance);
  $('#open-interests').addEventListener('click', () => showInterests());
  $('#appearance-btn').addEventListener('click', showAppearance);
  $('#dialog-close').addEventListener('click', () => $('#dialog').close());
  $('#dialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  $('#import-file').addEventListener('change', (e) => { importData(e.target.files[0]); e.target.value = ''; });
  document.addEventListener('keydown', onKey);

  loadData().then((ok) => {
    if (!ok) return;
    pruneStore();
    persist();
    refresh();
  });

  // Keep "3h ago" labels honest if the tab stays open.
  setInterval(() => { if (!ui.editing && data.generatedAt) $('#updated').textContent = `Updated ${timeAgo(data.generatedAt)}`; }, 60_000);
}

init();
