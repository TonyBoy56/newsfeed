import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTopicIssue, buildSection, catalogEntry } from '../scripts/add-topic.mjs';

const body = (fields) => Object.entries(fields).map(([k, v]) => `### ${k}\n\n${v}\n`).join('\n');

test('a built-in starting point keeps its id, tuned subtopics and concept map', () => {
  const input = parseTopicIssue(body({
    'Topic name': 'Security', 'Subtopics (comma separated, optional)': 'News & Breaches, Vulnerabilities & Advisories',
    'Sources (one per line)': 'https://feeds.feedburner.com/TheHackersNews | News & Breaches',
    'Concepts to track (one per line, optional)': '_No response_', 'Starting point (optional)': 'security',
  }));
  assert.equal(input.start, 'security');
  const entry = catalogEntry(input.start);
  assert.equal(entry.builtin, 'security');
  const sec = buildSection(input, { sections: [] }, entry);
  assert.equal(sec.id, 'security');
  assert.deepEqual(sec.categories.map((c) => c.id), ['news', 'vulns']);
  assert.match(sec.categories[0].keywords, /ransomware/);
  assert.equal(sec.concepts, undefined);
  assert.ok(entry.sources.some((s) => s.type === 'cisa-kev'));
});

test('custom topics and renamed copies get their own ids', () => {
  const custom = buildSection(parseTopicIssue(body({ 'Topic name': 'Birding', 'Concepts to track': 'owls: owl, owls' })), { sections: [] });
  assert.equal(custom.id, 'birding');
  assert.deepEqual(custom.categories.map((c) => c.id), ['birding-general']);
  assert.deepEqual(custom.concepts, { owls: ['owl', 'owls'] });
  // Starting point name from the issue is only a lookup key into our own catalog.
  assert.equal(catalogEntry('../../etc/passwd'), null);
  const taken = { sections: [{ id: 'security', name: 'Security', categories: [{ id: 'news', feeds: [] }] }] };
  assert.throws(() => buildSection({ ...parseTopicIssue(body({ 'Topic name': 'Security' })), subtopics: [] }, taken, catalogEntry('Security')), /already a topic/);
  const again = buildSection({ ...parseTopicIssue(body({ 'Topic name': 'Security 2' })), subtopics: ['News & Breaches'] }, taken, catalogEntry('Security'));
  assert.equal(again.id, 'security-2');
  assert.notEqual(again.categories[0].id, 'news');
});
