import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseIssueBody, findCategory, flattenCategories, rankCategories, mdSafe, tokenize } from '../scripts/add-source.mjs';
import { CONCEPT_SETS } from '../scripts/lib/parse.mjs';
import { assertPublicUrl } from '../scripts/lib/http.mjs';

const config = JSON.parse(readFileSync(new URL('../feeds.json', import.meta.url)));
const categories = flattenCategories(config).map((c) => ({ ...c, concepts: CONCEPT_SETS[c.section] }));

test('parses the GitHub issue form body', () => {
  const body = '### Feed or website URL\n\nhttps://example.com\n\n### Category\n\nmusic-theory\n\n### Display name (optional)\n\n_No response_\n';
  assert.deepEqual(parseIssueBody(body), { url: 'https://example.com', category: 'music-theory', name: '' });
});

test('finds categories by id, full label or name, and treats auto as auto', () => {
  assert.equal(findCategory(categories, 'music-theory').id, 'music-theory');
  assert.equal(findCategory(categories, 'Games › Indie & Design').id, 'games-design');
  assert.equal(findCategory(categories, 'games > indie & design').id, 'games-design');
  assert.equal(findCategory(categories, 'Cloud Security').id, 'cloud');
  assert.equal(findCategory(categories, 'Auto-detect'), null);
  assert.equal(findCategory(categories, ''), null);
  assert.throws(() => findCategory(categories, 'cooking'), /Unknown category/);
});

test('auto-sorts sample articles into sensible subcategories', () => {
  const rank = (items) => rankCategories(items.map(([title, summary]) => ({ title, summary })), categories)[0].category.id;
  assert.equal(rank([['Mixing drums with parallel compression', 'Glue your drum bus with compression and EQ in the DAW.'],
    ['Synth patches for ambient pads', 'Wavetable synth sound design.']]), 'music-production');
  assert.equal(rank([['Understanding modal interchange', 'Borrowed chords, harmony and theory.'],
    ['Ear training routine', 'Hear intervals and chord qualities by ear.']]), 'music-theory');
  assert.equal(rank([['Inside a kernel anti-cheat driver', 'Reverse engineering the anti-cheat.'],
    ['Decompiling a game loader with Ghidra', 'Obfuscation and devirtualization.']]), 'games-security');
  assert.equal(rank([['Phishing kit bypasses MFA', 'Ransomware gang behind data breach at hospital.']]), 'news');
});

test('neutralizes markdown and mentions from remote feed titles', () => {
  const out = mdSafe('[click](https://evil.example) @everyone <img src=x>');
  assert.ok(!out.includes('](') && out.includes('\\[') && out.includes('@​'));
  assert.deepEqual(tokenize('The Synths and the Drums!'), ['synth', 'drum']);
});

test('SSRF guard blocks private and non-http targets', async () => {
  for (const bad of ['http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data', 'http://10.0.0.5/', 'http://[::1]/', 'file:///etc/passwd', 'https://user:pw@example.com/']) {
    await assert.rejects(assertPublicUrl(bad), `should reject ${bad}`);
  }
});
