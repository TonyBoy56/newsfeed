#!/usr/bin/env node
// Creates a new topic (a section in feeds.json) with its subtopics, concepts
// and first sources.
//
// From GitHub (what the in-app "+ New topic" button uses): the add-source
// workflow runs this with --from-issue when the issue title starts with
// "[New topic]". Issue fields:
//   Topic name, Description, Subtopics (comma separated),
//   Sources (one per line, optionally "URL | Subtopic"),
//   Concepts (one per line: "label" or "label: term, term").
//
// From your computer, write the same fields to a file and run:
//   ISSUE_BODY="$(cat topic.md)" node scripts/add-topic.mjs --from-issue

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXmlFeed, registerCustomConcepts, CONCEPT_SETS, truncate } from './lib/parse.mjs';
import { discoverFeed, flattenCategories, rankCategories, mdSafe } from './add-source.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FEEDS_FILE = resolve(ROOT, process.env.FEEDS_FILE || 'feeds.json');
const RESULT_FILE = process.env.RESULT_FILE ? resolve(process.env.RESULT_FILE) : null;
const COMMIT_FILE = process.env.COMMIT_FILE ? resolve(process.env.COMMIT_FILE) : null;

const MAX_SOURCES = 15;

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

export function buildSection(input, config) {
  const name = truncate(input.name.replace(/[\r\n]/g, ' ').trim(), 40);
  if (!name) throw new Error('The topic needs a name.');
  const existing = new Set((config.sections || []).map((s) => s.id));
  if ((config.sections || []).some((s) => s.name.toLowerCase() === name.toLowerCase())) throw new Error(`There is already a topic called "${name}".`);
  let id = slug(name);
  for (let n = 2; existing.has(id); n++) id = `${slug(name)}-${n}`;
  const subNames = [...new Set(input.subtopics.map((s) => truncate(s, 40)))].slice(0, 8);
  const categories = (subNames.length ? subNames : ['General']).map((sub) => ({
    id: `${id}-${slug(sub)}`,
    name: sub,
    description: '',
    keywords: sub.toLowerCase(),
    feeds: [],
  }));
  return { id, name, description: truncate(input.description || '', 160), concepts: input.concepts, categories };
}

async function main() {
  if (!process.argv.includes('--from-issue')) throw new Error('Run with --from-issue and ISSUE_BODY set.');
  const input = parseTopicIssue(process.env.ISSUE_BODY);
  const config = JSON.parse(await readFile(FEEDS_FILE, 'utf8'));
  config.sections ??= [];
  const section = buildSection(input, config);
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
  for (const src of input.sources.slice(0, MAX_SOURCES)) {
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
    `Next: open **Your interests** in the app and pick what you want from ${mdSafe(section.name, 40)}. Until you do, the topic stays empty. The site is rebuilding now.`,
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
