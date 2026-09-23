import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('a site with no topics yet still builds', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signal-'));
  writeFileSync(join(dir, 'feeds.json'), JSON.stringify({ settings: { repo: 'you/newsfeed' }, sections: [] }));
  const out = join(dir, 'articles.json');
  const run = spawnSync(process.execPath, ['scripts/fetch-feeds.mjs'], {
    env: { ...process.env, FEEDS_FILE: join(dir, 'feeds.json'), OUTPUT_FILE: out, PREVIOUS_DATA_URL: '' },
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const data = JSON.parse(readFileSync(out, 'utf8'));
  assert.deepEqual(data.sections, []);
  assert.deepEqual(data.articles, []);
});
