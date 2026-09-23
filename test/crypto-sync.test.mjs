import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../site/crypto.js';
import { mergeStores } from '../site/sync-merge.js';

const UID = '11111111-2222-3333-4444-555555555555';

test('data key wraps with the password and recovery key, and unwraps only with the right ones', async () => {
  const dk = await C.generateDataKey();
  const salt = C.toB64(C.randomBytes(16));
  const kek = await C.deriveKek('correct horse battery staple', salt, 1000);
  const w = await C.wrapDataKey(dk, kek, UID);
  const back = await C.unwrapDataKey(w.wrapped, w.iv, kek, UID, true);
  const enc = await C.encryptJSON(back, { hi: 1 }, UID);
  assert.deepEqual(await C.decryptJSON(dk, enc.data, enc.iv, UID), { hi: 1 });

  const wrong = await C.deriveKek('wrong password', salt, 1000);
  await assert.rejects(C.unwrapDataKey(w.wrapped, w.iv, wrong, UID), /WRONG_KEY/);
  await assert.rejects(C.unwrapDataKey(w.wrapped, w.iv, kek, 'other-user'), /WRONG_KEY/);

  const rk = C.newRecoveryKey();
  assert.match(rk, /^([A-Z2-9]{4}-){7}[A-Z2-9]{4}$/);
  const rsalt = C.toB64(C.randomBytes(16));
  const rw = await C.wrapDataKey(dk, await C.deriveRecoveryKek(rk, rsalt), UID);
  const viaRk = await C.unwrapDataKey(rw.wrapped, rw.iv, await C.deriveRecoveryKek(rk.toLowerCase().replace(/-/g, ' '), rsalt), UID);
  assert.deepEqual(await C.decryptJSON(viaRk, enc.data, enc.iv, UID), { hi: 1 });
  await assert.rejects(C.deriveRecoveryKek('AAAA-BBBB', rsalt), /BAD_RECOVERY_KEY/);
});

test('ciphertext is bound to the user and tampering is caught', async () => {
  const dk = await C.generateDataKey();
  const enc = await C.encryptJSON(dk, { secret: 'x' }, UID);
  await assert.rejects(C.decryptJSON(dk, enc.data, enc.iv, 'someone-else'), /DECRYPT_FAILED/);
  const bytes = C.fromB64(enc.data); bytes[0] ^= 1;
  await assert.rejects(C.decryptJSON(dk, C.toB64(bytes), enc.iv, UID), /DECRYPT_FAILED/);
});

test('auth secret is deterministic per email and never equals the password', async () => {
  const a = await C.deriveAuthSecret(' Me@Example.com ', 'pw-one-two-three');
  const b = await C.deriveAuthSecret('me@example.com', 'pw-one-two-three');
  const c = await C.deriveAuthSecret('other@example.com', 'pw-one-two-three');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(!a.includes('pw-one'));
});

test('password strength', () => {
  assert.equal(C.passwordStrength('password123').ok, false);
  assert.equal(C.passwordStrength('short').ok, false);
  assert.equal(C.passwordStrength('violet-canyon-drums-at-midnight').ok, true);
  assert.equal(C.passwordStrength('tonyboy-is-great', 'tonyboy@x.io').score < 3, true);
});

test('merge keeps newest, respects tombstones, and picks newer profile/prefs', () => {
  const now = 1_000_000_000_000;
  const local = {
    createdAt: 5, read: { a: 10 }, saved: { a: 10, b: now - 1000 + 20 }, notes: { a: { text: 'old', updated: 10 } },
    snapshots: { a: {}, b: {} }, tomb: { 's:b': now - 1000 + 30 }, profile: { name: 'L', updated: 100 },
    prefs: { theme: 'local' }, prefsUpdated: 50, history: { days: { d1: 2 }, concepts: { x: 1 } },
  };
  const remote = {
    createdAt: 3, read: { a: 15, c: now - 1000 + 5 }, saved: { b: now - 1000 + 25, c: 5 }, notes: { a: { text: 'new', updated: 40 } },
    snapshots: { c: {} }, tomb: { 'r:c': now - 1000 + 6, 'old:x': now - 100 * 86_400_000 },
    profile: { name: 'R', updated: 200 }, prefs: { theme: 'remote' }, prefsUpdated: 40,
    history: { days: { d1: 5 }, concepts: { y: 3 } },
  };
  const m = mergeStores(local, remote, now);
  assert.deepEqual(m.read, { a: 15 });           // c tombstoned after it was read
  assert.deepEqual(m.saved, { a: 10, c: 5 });     // b unsaved at 30, after both saves
  assert.equal(m.notes.a.text, 'new');
  assert.deepEqual(Object.keys(m.snapshots).sort(), ['a', 'c']);
  assert.equal(m.profile.name, 'R');
  assert.equal(m.prefs.theme, 'local');
  assert.equal(m.createdAt, 3);
  assert.deepEqual(m.history.days, { d1: 5 });
  assert.ok(!('old:x' in m.tomb));                // expired tombstone dropped
  // re-saving after a tombstone brings it back
  const again = mergeStores({ ...m, saved: { ...m.saved, b: now } }, remote, now);
  assert.equal(again.saved.b, now);
});
