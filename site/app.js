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

const STORE_KEY = 'signal:v1';
const PAGE_SIZE = 40;
const DAY = 86_400_000;
const ID_RE = /^[a-f0-9]{16}$/;

const NOTE_PROMPTS = [
  'Key takeaway: ',
  'How this applies to my work: ',
  'Term to look up: ',
  'Question to explore: ',
  'How I would detect or prevent this: ',
];

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
  return { version: 1, read: {}, saved: {}, notes: {}, snapshots: {}, prefs: { theme: null, sort: 'new' } };
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
  const prefs = input.prefs ?? {};
  out.prefs = {
    theme: ['light', 'dark'].includes(prefs.theme) ? prefs.theme : null,
    sort: ['new', 'old', 'source'].includes(prefs.sort) ? prefs.sort : 'new',
  };
  return out;
}

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
let data = { categories: [], sources: [], articles: [], generatedAt: null };
let byId = new Map();
const ui = { view: 'all', category: null, concept: null, tag: null, query: '', limit: PAGE_SIZE, active: -1, editing: null, draft: null };
let visible = [];

const VIEWS = [
  { id: 'all', name: 'All articles' },
  { id: 'unread', name: 'Unread' },
  { id: 'saved', name: 'Saved' },
  { id: 'notebook', name: 'Notebook' },
];

function allArticles() {
  const map = new Map(data.articles.map((a) => [a.id, a]));
  for (const [id, snap] of Object.entries(store.snapshots)) if (!map.has(id)) map.set(id, snap);
  return [...map.values()];
}

function matchesQuery(a, q) {
  if (!q) return true;
  const note = store.notes[a.id];
  const hay = [a.title, a.summary, a.source, a.author, ...(a.cves || []), ...(a.concepts || []), note?.text, ...(note?.tags || [])]
    .filter(Boolean).join(' ').toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}

function computeVisible() {
  const q = ui.query.trim().toLowerCase();
  let list = allArticles().filter((a) => {
    if (ui.view === 'unread' && store.read[a.id]) return false;
    if (ui.view === 'saved' && !store.saved[a.id]) return false;
    if (ui.view === 'notebook' && !store.notes[a.id]) return false;
    if (ui.category && a.category !== ui.category) return false;
    if (ui.concept && !(a.concepts || []).includes(ui.concept)) return false;
    if (ui.tag && !(store.notes[a.id]?.tags || []).includes(ui.tag)) return false;
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
  const pool = allArticles();
  const counts = {
    all: pool.length,
    unread: pool.filter((a) => !store.read[a.id]).length,
    saved: Object.keys(store.saved).length,
    notebook: Object.keys(store.notes).length,
  };

  put($('#views'), ...VIEWS.map((v) => h('li', {},
    h('button', { type: 'button', 'aria-current': String(ui.view === v.id), onclick: () => setFilter({ view: v.id }) },
      h('span', {}, v.name), h('span', { class: 'count' }, counts[v.id])))));

  const catCounts = new Map();
  for (const a of pool) catCounts.set(a.category, (catCounts.get(a.category) || 0) + 1);
  put($('#categories'), 
    h('li', {}, h('button', { type: 'button', 'aria-current': String(!ui.category), onclick: () => setFilter({ category: null }) },
      h('span', {}, 'Everything'), h('span', { class: 'count' }, pool.length))),
    ...data.categories.map((c) => h('li', {},
      h('button', { type: 'button', title: c.description, 'aria-current': String(ui.category === c.id), onclick: () => setFilter({ category: c.id }) },
        h('span', {}, c.name), h('span', { class: 'count' }, catCounts.get(c.id) || 0)))),
  );

  const conceptCounts = new Map();
  for (const a of pool) for (const c of a.concepts || []) conceptCounts.set(c, (conceptCounts.get(c) || 0) + 1);
  const concepts = [...conceptCounts.entries()].sort((a, b) => b[1] - a[1]);
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
  const cat = data.categories.find((c) => c.id === ui.category);
  const title = cat ? cat.name : view.name;
  const filters = [];
  if (cat && ui.view !== 'all') filters.push(view.name);
  if (ui.concept) filters.push(`concept: ${ui.concept}`);
  if (ui.tag) filters.push(`#${ui.tag}`);
  if (ui.query) filters.push(`"${ui.query}"`);
  const anyFilter = ui.view !== 'all' || ui.category || ui.concept || ui.tag || ui.query;
  const desc = ui.view === 'notebook'
    ? 'Everything you have written notes on, most recently edited first.'
    : cat?.description || '';

  put($('#context'), 
    h('h1', {}, title),
    h('span', { class: 'count' }, `${visible.length} article${visible.length === 1 ? '' : 's'}`),
    filters.length ? h('span', { class: 'count' }, `· ${filters.join(' · ')}`) : null,
    anyFilter ? h('button', { type: 'button', class: 'link-btn clear', onclick: () => {
      $('#search').value = '';
      setFilter({ view: 'all', category: null, concept: null, tag: null, query: '' });
    } }, 'Clear filters') : null,
    desc ? h('p', {}, desc) : null,
  );
}

function renderList() {
  const list = $('#list');
  list.setAttribute('aria-busy', 'false');
  if (!visible.length) {
    const msg = {
      saved: ['Nothing saved yet', 'Press Save on any article (or press s) to keep it here.'],
      notebook: ['Your notebook is empty', 'Add a note to any article to start building your own knowledge base.'],
      unread: ['All caught up', 'You have read everything that matches these filters.'],
    }[ui.view] || ['No articles match', 'Try clearing filters or a different search.'];
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

function renderCard(a, index) {
  const isRead = Boolean(store.read[a.id]);
  const isSaved = Boolean(store.saved[a.id]);
  const note = store.notes[a.id];
  const href = safeHref(a.url);
  const cat = data.categories.find((c) => c.id === a.category);

  const card = h('article', {
    class: `card${isRead ? ' read' : ''}${index === ui.active ? ' active' : ''}`,
    dataset: { id: a.id, index: String(index) },
    'aria-posinset': index + 1, 'aria-setsize': visible.length,
  },
    h('div', { class: 'card-meta' },
      h('span', { class: 'src' }, a.source),
      a.published ? h('time', { class: 'dot', datetime: a.published, title: new Date(a.published).toLocaleString() }, ` ${timeAgo(a.published)}`) : null,
      cat ? h('span', { class: 'dot' }, ` ${cat.name}`) : null,
      a.author && a.author !== a.source ? h('span', { class: 'dot' }, ` ${a.author}`) : null,
    ),
    h('h2', {}, href
      ? h('a', { href, target: '_blank', rel: 'noopener noreferrer', onclick: () => markRead(a, true), onauxclick: () => markRead(a, true) }, a.title)
      : a.title),
    a.summary ? h('p', { class: 'summary' }, a.summary) : null,
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
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'act', 'aria-pressed': String(isSaved), onclick: () => toggleSaved(a) }, isSaved ? '★ Saved' : '☆ Save'),
      h('button', { type: 'button', class: 'act', 'aria-pressed': String(ui.editing === a.id), onclick: () => toggleEditor(a) }, note ? '✎ Edit note' : '✎ Note'),
      h('button', { type: 'button', class: 'act', onclick: () => markRead(a, !isRead) }, isRead ? 'Mark unread' : 'Mark read'),
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
  const textarea = h('textarea', { id: `note-${a.id}`, placeholder: 'What did you learn? How would you explain it to a teammate?' });
  textarea.value = ui.draft.text;
  const tagsInput = h('input', { id: `tags-${a.id}`, type: 'text', placeholder: 'e.g. study-later, oauth, detection', autocomplete: 'off' });
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
      h('div', { class: 'prompts' }, ...NOTE_PROMPTS.map((p) =>
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

function markRead(a, value) {
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
  const cats = new Map(data.categories.map((c) => [c.id, c.name]));
  const ok = data.sources.filter((s) => s.ok).length;
  openDialog('Sources',
    h('p', {}, `${ok} of ${data.sources.length} feeds fetched successfully${data.generatedAt ? `, ${timeAgo(data.generatedAt)}` : ''}. Add or remove feeds in feeds.json in the repository.`),
    h('ul', { class: 'row-list' }, ...data.sources.map((s) => {
      const href = safeHref(s.site);
      return h('li', {},
        h('span', {}, href ? h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, s.name) : s.name,
          h('span', { class: 'count' }, ` · ${cats.get(s.category) || s.category}`)),
        s.ok ? h('span', { class: 'status-ok' }, `${s.count} items`) : h('span', { class: 'status-bad', title: s.error }, 'failed'));
    })),
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
    ['n', 'Write a note'], ['m', 'Toggle read'], ['/', 'Search'], ['1–4', 'All / Unread / Saved / Notebook'],
    ['Ctrl/⌘ + Enter', 'Save note'], ['Esc', 'Close editor or dialog'], ['?', 'This help'],
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

function applyTheme() {
  if (store.prefs.theme) document.documentElement.dataset.theme = store.prefs.theme;
  else delete document.documentElement.dataset.theme;
  $('#theme-toggle').textContent = `Theme: ${store.prefs.theme || 'auto'}`;
}

function cycleTheme() {
  const order = [null, 'light', 'dark'];
  store.prefs.theme = order[(order.indexOf(store.prefs.theme) + 1) % order.length];
  persist();
  applyTheme();
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
    case '1': case '2': case '3': case '4': setFilter({ view: VIEWS[Number(e.key) - 1].id }); break;
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
      categories: (json.categories || []).map((c) => ({ id: str(c.id, 60), name: str(c.name, 80), description: str(c.description, 300) })),
      sources: (json.sources || []).map((s) => ({ name: str(s.name, 120), site: s.site, category: str(s.category, 60), ok: Boolean(s.ok), count: num(s.count) ?? 0, error: str(s.error, 200) })),
      articles: (json.articles || []).map(sanitizeArticle).filter(Boolean),
    };
    byId = new Map(data.articles.map((a) => [a.id, a]));
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
  applyTheme();
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
  $('#theme-toggle').addEventListener('click', cycleTheme);
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
