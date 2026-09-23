#!/usr/bin/env node
// Creates a new topic (a section in feeds.json) with its subtopics, concepts
// and first sources.
//
// From GitHub (what the in-app "+ New topic" button uses): the add-source
// workflow runs this with --from-issue when the issue title starts with
// "[New topic]". Issue fields:
//   Topic name, Description, Subtopics (comma separated),
//   Sources (one per line, optionally "URL | Subtopic"),
//   Concepts (one per line: "label" or "label: term, term"),
//   Starting point (optional: the name of an entry in site/topic-catalog.js).
//
// A starting point only ever selects from our own catalog file: its sources
// are trusted and added as-is, and its subtopics keep their tuned keywords.
// Anything else in the issue is treated as untrusted input.
//
// From your computer, write the same fields to a file and run:
//   ISSUE_BODY="$(cat topic.md)" node scripts/add-topic.mjs --from-issue

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXmlFeed, registerCustomConcepts, CONCEPT_SETS, truncate } from './lib/parse.mjs';
import { discoverFeed, flattenCategories, rankCategories, mdSafe } from './add-source.mjs';
import { CATALOG } from '../site/topic-catalog.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FEEDS_FILE = resolve(ROOT, process.env.FEEDS_FILE || 'feeds.json');
const RESULT_FILE = process.env.RESULT_FILE ? resolve(process.env.RESULT_FILE) : null;
const COMMIT_FILE = process.env.COMMIT_FILE ? resolve(process.env.COMMIT_FILE) : null;

const MAX_SOURCES = 25;

export function parseTopicIssue(body = '') {
  const fields = {};
  for (const part of String(body).split(/^###\s+/m).slice(1)) {
    const [heading, ...rest] = part.split('\n');
    const value = rest.join('\n').trim();
    fields[heading.trim().toLowerCase()] = value === '_No response_' ? '' : value;
  }
  const pick = (word) => Object.entries(fields).find(([k]) => k.includes(word))?.[1] || '';
  const lines = (text) => text.split('\n').map((l) => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
  return {
    name: pick('topic name').split('\n')[0].trim(),
    start: pick('starting point').split('\n')[0].trim(),
    description: pick('description').split('\n')[0].trim(),
    subtopics: pick('subtopic').split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
    sources: lines(pick('source')).map((l) => {
      const [url, subtopic] = l.split('|').map((x) => x.trim());
      return { url, subtopic: subtopic || '' };
    }),
    concepts: Object.fromEntries(lines(pick('concept')).map((l) => {
      const [label, terms] = l.split(':');
      const clean = label.trim().slice(0, 40);
      return [clean, (terms || clean).split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 12)];
    }).filter(([label]) => label)),
  };
}

export const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'topic';

export const catalogEntry = (name) => CATALOG.find((e) => e.name.toLowerCase() === String(name || '').trim().toLowerCase()) || null;

export function buildSection(input, config, entry = null) {
  const name = truncate(input.name.replace(/[\r\n]/g, ' ').trim(), 40);
  if (!name) throw new Error('The topic needs a name.');
  const existing = new Set((config.sections || []).map((s) => s.id));
  if ((config.sections || []).some((s) => s.name.toLowerCase() === name.toLowerCase())) throw new Error(`There is already a topic called "${name}".`);
  // A built-in starting point keeps its id, so its concept map applies.
  let id = entry?.builtin && !existing.has(entry.builtin) ? entry.builtin : slug(name);
  for (let n = 2; existing.has(id); n++) id = `${slug(name)}-${n}`;
  const usedCats = new Set(flattenCategories(config).map((c) => c.id));
  const subNames = [...new Set(input.subtopics.map((s) => truncate(s, 40)))].slice(0, 8);
  const categories = (subNames.length ? subNames : ['General']).map((sub) => {
    const tuned = entry?.subtopicDetails?.[sub];
    let catId = tuned?.id && !usedCats.has(tuned.id) ? tuned.id : `${id}-${slug(sub)}`;
    for (let n = 2; usedCats.has(catId); n++) catId = `${id}-${slug(sub)}-${n}`;
    usedCats.add(catId);
    return {
      id: catId,
      name: sub,
      description: tuned?.description || '',
      keywords: tuned?.keywords || sub.toLowerCase(),
      ...(tuned?.maxAgeDays ? { maxAgeDays: tuned.maxAgeDays } : {}),
      feeds: [],
    };
  });
  const section = { id, name, description: truncate(input.description || '', 160), categories };
  // Built-in concept maps come from concept-graph.js; custom topics bring their own.
  if (!(entry?.builtin && id === entry.builtin)) section.concepts = input.concepts;
  return section;
}

async function main() {
  if (!process.argv.includes('--from-issue')) throw new Error('Run with --from-issue and ISSUE_BODY set.');
  const input = parseTopicIssue(process.env.ISSUE_BODY);
  const config = JSON.parse(await readFile(FEEDS_FILE, 'utf8'));
  config.sections ??= [];
  const entry = catalogEntry(input.start);
  const section = buildSection(input, config, entry);
  config.sections.push(section);
  registerCustomConcepts(config);

  const known = new Set(flattenCategories(config).flatMap((c) => c.feeds.map((f) => f.url.toLowerCase())));
  // Source names must be unique: they're how history is merged between runs.
  const names = new Set(flattenCategories(config).flatMap((c) => c.feeds.map((f) => f.name.toLowerCase())));
  const uniqueName = (base) => {
    let name = base;
    for (let n = 2; names.has(name.toLowerCase()); n++) name = `${base} (${n})`;
    names.add(name.toLowerCase());
    return name;
  };
  const added = [];
  const skipped = [];
  const findCat = (name) => section.categories.find((c) => c.name.toLowerCase() === String(name).toLowerCase());
  for (const src of input.sources.slice(0, MAX_SOURCES)) {
    // Straight from our own catalog: already vetted, so add it as-is.
    const known0 = entry?.sources.find((s) => s.url === src.url);
    if (known0 && !known.has(known0.url.toLowerCase())) {
      const cat = findCat(src.subtopic) || findCat(known0.subtopic) || section.categories[0];
      const name = uniqueName(known0.name);
      cat.feeds.push({ name, url: known0.url, site: known0.site || new URL(known0.url).origin, ...(known0.type ? { type: known0.type } : {}) });
      known.add(known0.url.toLowerCase());
      added.push(`- **${mdSafe(name, 80)}** → ${mdSafe(cat.name, 40)}`);
      continue;
    }
    try {
      const { feedUrl, xml, meta } = await discoverFeed(src.url);
      if (known.has(feedUrl.toLowerCase())) throw new Error('already in your feed');
      const samples = parseXmlFeed(xml, { name: 'probe', url: feedUrl, site: meta.site || feedUrl }, 'probe',
        { maxItemsPerFeed: 15, summaryLength: 400, section: section.id });
      if (!samples.length) throw new Error('no readable items');
      // Put it where you asked, or where its posts fit best.
      let cat = section.categories.find((c) => c.name.toLowerCase() === src.subtopic.toLowerCase());
      if (!cat && section.categories.length > 1) {
        const cats = section.categories.map((c) => ({ ...c, section: section.id, sectionName: section.name, concepts: CONCEPT_SETS[section.id] }));
        cat = section.categories.find((c) => c.id === rankCategories(samples, cats)[0].category.id);
      }
      cat ||= section.categories[0];
      const name = uniqueName(truncate((meta.title || new URL(feedUrl).hostname).trim(), 72));
      cat.feeds.push({ name, url: feedUrl, site: meta.site || new URL(feedUrl).origin });
      known.add(feedUrl.toLowerCase());
      added.push(`- **${mdSafe(name, 80)}** → ${mdSafe(cat.name, 40)}`);
    } catch (err) {
      skipped.push(`- \`${String(src.url).replace(/`/g, '').slice(0, 200)}\`: ${mdSafe(err.message, 160)}`);
    }
  }

  await writeFile(FEEDS_FILE, `${JSON.stringify(config, null, 2)}\n`);
  const summary = [
    `✅ Created the topic **${mdSafe(section.name, 40)}** with ${section.categories.length} subtopic${section.categories.length === 1 ? '' : 's'}.`,
    '',
    added.length ? `Added ${added.length} source${added.length === 1 ? '' : 's'}:` : 'No sources were added yet. Use "+ Add a source" in the app to add some.',
    ...added,
    ...(skipped.length ? ['', 'Skipped:', ...skipped] : []),
    '',
    `The site is rebuilding now, so ${mdSafe(section.name, 40)} should appear in the app in about 2 minutes. Signal opens **Your interests** for it as soon as it lands; until you pick some, the topic stays empty.`,
  ].join('\n');
  console.log(summary);
  if (RESULT_FILE) await writeFile(RESULT_FILE, summary);
  if (COMMIT_FILE) await writeFile(COMMIT_FILE, `Add topic: ${section.name} (${added.length} sources)\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(async (err) => {
    console.error(`Couldn't create that topic: ${err.message}`);
    if (RESULT_FILE) await writeFile(RESULT_FILE, `❌ Couldn't create that topic: ${mdSafe(err.message, 300)}`).catch(() => {});
    process.exit(1);
  });
}
