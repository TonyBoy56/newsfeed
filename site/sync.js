// Accounts and end-to-end encrypted sync.
//
// Sign-in and storage are handled by Supabase (see docs/ACCOUNTS.md). This
// file never sends your password, notes, interests or settings in readable
// form. It sends:
//   * authSecret: a PBKDF2 hash of your password (see crypto.js)
//   * one encrypted blob per account, plus the wrapped (encrypted) data key
//
// On each device the unwrapped data key is kept in IndexedDB as a
// non-extractable CryptoKey: this page can use it, but nothing can read it out.

import * as C from './crypto.js?v=13';
import { mergeStores, syncPayload } from './sync-merge.js?v=13';

const PUSH_DELAY = 2500;
const PULL_EVERY = 10 * 60 * 1000;

// ---------- device key storage (IndexedDB) ----------

const keystore = {
  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('signal-keys', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('keys');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  async run(mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('keys', mode);
      const req = fn(tx.objectStore('keys'));
      tx.oncomplete = () => { db.close(); resolve(req?.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  },
  get: (id) => keystore.run('readonly', (s) => s.get(id)).catch(() => null),
  set: (id, key) => keystore.run('readwrite', (s) => s.put(key, id)),
  del: (id) => keystore.run('readwrite', (s) => s.delete(id)).catch(() => {}),
};

// ---------- backends ----------

function supabaseBackend(config) {
  const sb = window.supabase.createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  const unwrap = ({ data, error }) => { if (error) throw error; return data; };
  const siteUrl = () => `${location.origin}${location.pathname}`;
  // The reset link fires PASSWORD_RECOVERY once, while the client starts up,
  // so listen right away and replay it to whoever asks later.
  let recovered = false, onRec = null;
  sb.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') { recovered = true; onRec?.(); } });
  return {
    async currentUser() {
      const { data } = await sb.auth.getSession();
      return data.session?.user || null;
    },
    signUp: (email, secret) => sb.auth.signUp({ email, password: secret, options: { emailRedirectTo: siteUrl() } }).then(unwrap),
    signIn: (email, secret) => sb.auth.signInWithPassword({ email, password: secret }).then(unwrap),
    signOut: (scope) => sb.auth.signOut({ scope }),
    async aal() {
      const d = unwrap(await sb.auth.mfa.getAuthenticatorAssuranceLevel());
      return { current: d.currentLevel, next: d.nextLevel };
    },
    async totpFactors() { return unwrap(await sb.auth.mfa.listFactors()).totp || []; },
    async verify(factorId, code) { unwrap(await sb.auth.mfa.challengeAndVerify({ factorId, code })); },
    async enroll() {
      const d = unwrap(await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Signal ${new Date().toISOString().slice(0, 10)}` }));
      return { id: d.id, qr: d.totp.qr_code, secret: d.totp.secret, uri: d.totp.uri };
    },
    async unenroll(factorId) { unwrap(await sb.auth.mfa.unenroll({ factorId })); },
    async updatePassword(secret) { unwrap(await sb.auth.updateUser({ password: secret })); },
    async resetPassword(email) { unwrap(await sb.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() })); },
    onRecovery(cb) { onRec = cb; if (recovered) cb(); },
    async getVault(uid) { return unwrap(await sb.from('vault').select('*').eq('user_id', uid).maybeSingle()); },
    async insertVault(row) { unwrap(await sb.from('vault').insert(row)); },
    async updateVault(uid, version, patch) {
      // Optimistic concurrency: only succeeds if nobody else wrote since we read.
      return unwrap(await sb.from('vault').update({ ...patch, version: version + 1 }).eq('user_id', uid).eq('version', version).select('version')).length;
    },
    async deleteVault(uid) { unwrap(await sb.from('vault').delete().eq('user_id', uid)); },
  };
}

// For automated tests only: an in-memory stand-in for Supabase. Enabled with
// ?fakesync on localhost. The TOTP code is always 000000.
function fakeBackend() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('signal-fakedb')); } catch { /* none yet */ }
  const db = (window.__fakeDB ||= saved || { users: {}, vaults: {}, session: null });
  const save = () => { try { localStorage.setItem('signal-fakedb', JSON.stringify(db)); } catch { /* ignore */ } };
  const need = () => { if (!db.session) throw new Error('Not signed in'); return db.users[db.session.email]; };
  const api = {
    async currentUser() { return db.session ? { id: db.users[db.session.email].id, email: db.session.email } : null; },
    async signUp(email, secret) { if (db.users[email]) throw new Error('User already registered'); db.users[email] = { id: crypto.randomUUID(), secret, factors: [] }; return { user: { id: db.users[email].id }, session: null }; },
    async signIn(email, secret) { const u = db.users[email]; if (!u || u.secret !== secret) throw new Error('Invalid login credentials'); db.session = { email, aal: 'aal1' }; return { user: { id: u.id, email } }; },
    async signOut() { db.session = null; },
    async aal() { const u = need(); return { current: db.session.aal, next: u.factors.some((f) => f.verified) ? 'aal2' : 'aal1' }; },
    async totpFactors() { return need().factors.filter((f) => f.verified).map((f) => ({ id: f.id, status: 'verified' })); },
    async verify(id, code) { const f = need().factors.find((x) => x.id === id); if (!f || code !== '000000') throw new Error('Invalid TOTP code entered'); f.verified = true; db.session.aal = 'aal2'; },
    async enroll() { const f = { id: crypto.randomUUID(), verified: false }; need().factors.push(f); return { id: f.id, qr: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 10 10%22%3E%3Crect width=%2210%22 height=%2210%22 fill=%22%23000%22/%3E%3C/svg%3E', secret: 'FAKESECRET', uri: 'otpauth://totp/fake' }; },
    async unenroll(id) { const u = need(); u.factors = u.factors.filter((f) => f.id !== id); },
    async updatePassword(secret) { need().secret = secret; },
    async resetPassword() {},
    onRecovery(cb) { if (new URLSearchParams(location.search).has('fakerecovery')) cb(); },
    async getVault(uid) { const u = need(); if (u.id !== uid) throw new Error('RLS'); if (u.factors.some((f) => f.verified) && db.session.aal !== 'aal2') return null; return db.vaults[uid] ? { ...db.vaults[uid] } : null; },
    async insertVault(row) { db.vaults[row.user_id] = { version: 1, ...row }; },
    async updateVault(uid, version, patch) { const v = db.vaults[uid]; if (!v || v.version !== version) return 0; Object.assign(v, patch, { version: version + 1 }); return 1; },
    async deleteVault(uid) { delete db.vaults[uid]; },
  };
  // Persist after every call, so reloads and "other devices" in tests work.
  for (const [k, fn] of Object.entries(api)) api[k] = async (...args) => { const r = await fn(...args); save(); return r; };
  return api;
}

// ---------- the sync controller ----------

export function createSync({ config, getStore, applyRemote }) {
  const fake = new URLSearchParams(location.search).has('fakesync') && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  // Only accept a real Supabase project URL (the CSP only allows *.supabase.co anyway).
  const validUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config?.url || '');
  const configured = fake || Boolean(validUrl && config?.anonKey && window.supabase);
  const api = fake ? fakeBackend() : configured ? supabaseBackend(config) : null;

  const state = { available: configured, fake, status: configured ? 'signed-out' : 'unconfigured', email: null, userId: null, lastSync: null, mfa: false, error: null };
  const listeners = new Set();
  const emit = () => { for (const fn of listeners) fn({ ...state }); };
  const setStatus = (status, extra = {}) => { Object.assign(state, { status, error: null }, extra); emit(); };

  let dataKey = null; // CryptoKey, non-extractable
  let version = 0;
  let pending = null; // { email, password } kept only between sign-in steps
  let pushTimer = 0;
  let pushing = false;
  let dirty = false;

  async function loadKeyForUser(uid) {
    const saved = await keystore.get(`dk:${uid}`);
    return saved instanceof CryptoKey ? saved : null;
  }

  async function unlockWithPassword(vault, uid, password) {
    const kek = await C.deriveKek(password, vault.kdf_salt, vault.kdf_iterations);
    const dk = await C.unwrapDataKey(vault.wrapped_key, vault.wrapped_key_iv, kek, uid, false);
    await keystore.set(`dk:${uid}`, dk);
    return dk;
  }

  async function createVault(uid, password) {
    // Brand-new account: make the data key and a recovery key.
    const dk = await C.generateDataKey();
    const salt = C.toB64(C.randomBytes(16));
    const kek = await C.deriveKek(password, salt);
    const w = await C.wrapDataKey(dk, kek, uid);
    const recoveryKey = C.newRecoveryKey();
    const rSalt = C.toB64(C.randomBytes(16));
    const rw = await C.wrapDataKey(dk, await C.deriveRecoveryKek(recoveryKey, rSalt), uid);
    const blob = await C.encryptJSON(dk, syncPayload(getStore()), uid);
    await api.insertVault({
      user_id: uid, kdf: 'PBKDF2-SHA256', kdf_iterations: C.PBKDF2_ITERATIONS, kdf_salt: salt,
      wrapped_key: w.wrapped, wrapped_key_iv: w.iv,
      recovery_salt: rSalt, recovery_wrapped_key: rw.wrapped, recovery_iv: rw.iv,
      data: blob.data, data_iv: blob.iv,
    });
    version = 1;
    // Keep only a non-extractable copy on this device.
    const raw = await globalThis.crypto.subtle.exportKey('raw', dk);
    dataKey = await globalThis.crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    await keystore.set(`dk:${uid}`, dataKey);
    return recoveryKey;
  }

  async function afterAuth() {
    // Called once the session is fully signed in (MFA done if enrolled).
    const user = await api.currentUser();
    state.userId = user.id;
    state.email = user.email || pending?.email;
    state.mfa = (await api.totpFactors()).length > 0;
    const vault = await api.getVault(user.id);
    if (!vault) {
      if (!pending) { setStatus('locked'); return { state: 'locked' }; }
      const recoveryKey = await createVault(user.id, pending.password);
      pending = null;
      setStatus('synced', { lastSync: Date.now() });
      return { state: 'recovery', recoveryKey };
    }
    if (pending) {
      try {
        dataKey = await unlockWithPassword(vault, user.id, pending.password);
      } catch {
        // Password worked for sign-in but doesn't unlock the vault: it was
        // reset by email. The recovery key is the way back in.
        setStatus('locked');
        return { state: 'needs-recovery' };
      } finally {
        pending = null;
      }
    } else {
      dataKey = await loadKeyForUser(user.id);
      if (!dataKey) { setStatus('locked'); return { state: 'locked' }; }
    }
    await pull(vault);
    return { state: 'ok' };
  }

  async function pull(prefetched) {
    if (!dataKey || !state.userId) return;
    setStatus('syncing');
    try {
      const vault = prefetched || await api.getVault(state.userId);
      if (!vault) { setStatus('locked'); return; }
      version = vault.version;
      let remote = null;
      if (vault.data) {
        remote = await C.decryptJSON(dataKey, vault.data, vault.data_iv, state.userId);
        applyRemote(mergeStores(getStore(), remote));
      }
      // Only write back if this device had something the vault didn't.
      if (!remote || JSON.stringify(syncPayload(getStore())) !== JSON.stringify(syncPayload(remote))) await push(true);
      setStatus('synced', { lastSync: Date.now() });
    } catch (err) {
      setStatus(navigator.onLine === false ? 'offline' : 'error', { error: friendly(err) });
    }
  }

  async function push(force = false) {
    if (!dataKey || !state.userId) return;
    if (pushing) { dirty = true; return; }
    pushing = true;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const blob = await C.encryptJSON(dataKey, syncPayload(getStore()), state.userId);
        const ok = await api.updateVault(state.userId, version, { data: blob.data, data_iv: blob.iv });
        if (ok) { version += 1; break; }
        // Another device wrote first: merge its copy, then try again.
        const vault = await api.getVault(state.userId);
        version = vault.version;
        applyRemote(mergeStores(getStore(), await C.decryptJSON(dataKey, vault.data, vault.data_iv, state.userId)));
      }
      if (!force) setStatus('synced', { lastSync: Date.now() });
    } catch (err) {
      setStatus(navigator.onLine === false ? 'offline' : 'error', { error: friendly(err) });
    } finally {
      pushing = false;
      if (dirty) { dirty = false; schedulePush(); }
    }
  }

  function schedulePush() {
    if (!dataKey) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => push(), PUSH_DELAY);
  }

  function friendly(err) {
    const m = String(err?.message || err);
    if (/invalid login/i.test(m)) return 'That email and password don\'t match.';
    if (/email not confirmed/i.test(m)) return 'Confirm your email first: check your inbox for the link.';
    if (/signups? not allowed|signup is disabled/i.test(m)) return 'New sign-ups are turned off for this site.';
    if (/already registered/i.test(m)) return 'There\'s already an account with that email. Try signing in.';
    if (/invalid totp|invalid mfa|code/i.test(m)) return 'That code didn\'t work. Check the time on your phone and try the newest code.';
    if (/rate limit|too many/i.test(m)) return 'Too many attempts. Wait a minute and try again.';
    if (/failed to fetch|network/i.test(m)) return 'Can\'t reach the sync service. Check your connection.';
    if (m === 'DECRYPT_FAILED') return 'Your synced data couldn\'t be decrypted on this device.';
    return m.slice(0, 200);
  }

  const sync = {
    state,
    subscribe(fn) { listeners.add(fn); fn({ ...state }); return () => listeners.delete(fn); },
    friendly,
    passwordStrength: C.passwordStrength,
    pwnedCount: C.pwnedCount,

    async init() {
      if (!api) return;
      let ready = false, recoveryLink = false;
      api.onRecovery(() => { recoveryLink = true; if (ready) { state.recovery = true; emit(); } });
      // Stay current: check for changes from other devices when you come back
      // to the tab, every 10 minutes, and when the connection returns.
      document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
      setInterval(() => pull(), PULL_EVERY);
      window.addEventListener('online', () => pull());
      const user = await api.currentUser().catch(() => null);
      ready = true;
      if (!user) return;
      state.recovery = recoveryLink;
      const aal = await api.aal().catch(() => null);
      // With two-factor on, a reset link only signs you in halfway: the code
      // comes first, then the new password.
      if (aal && aal.next === 'aal2' && aal.current !== 'aal2') { setStatus('mfa', { email: user.email }); return; }
      if (state.recovery) { setStatus('locked', { email: user.email, userId: user.id }); return; }
      await afterAuth().catch((err) => setStatus('error', { error: friendly(err) }));
    },

    async signUp(email, password) {
      email = C.normalizeEmail(email);
      const secret = await C.deriveAuthSecret(email, password);
      const res = await api.signUp(email, secret);
      // With email confirmation on (recommended), there's no session yet.
      if (res.session) { pending = { email, password }; return afterAuth(); }
      return { state: 'confirm-email' };
    },

    async signIn(email, password) {
      email = C.normalizeEmail(email);
      setStatus('signing-in', { email });
      try {
        const secret = await C.deriveAuthSecret(email, password);
        await api.signIn(email, secret);
        pending = { email, password };
        const aal = await api.aal();
        if (aal.next === 'aal2' && aal.current !== 'aal2') { setStatus('mfa'); return { state: 'mfa' }; }
        return await afterAuth();
      } catch (err) {
        pending = null;
        setStatus('signed-out', { error: friendly(err) });
        throw new Error(friendly(err));
      }
    },

    async verifyMfa(code) {
      const [factor] = await api.totpFactors();
      if (!factor) throw new Error('No authenticator is set up for this account.');
      try {
        await api.verify(factor.id, String(code).replace(/\s/g, ''));
      } catch (err) { throw new Error(friendly(err)); }
      if (state.recovery) { setStatus('locked'); return { state: 'reset' }; }
      return afterAuth();
    },

    /** Unlock this device with the password when the session exists but the key doesn't. */
    async unlock(password) {
      const vault = await api.getVault(state.userId);
      try { dataKey = await unlockWithPassword(vault, state.userId, password); } catch { throw new Error('That password doesn\'t unlock your synced data.'); }
      await pull(vault);
    },

    async enrollMfa() { return api.enroll(); },
    async confirmMfa(factorId, code) {
      try { await api.verify(factorId, String(code).replace(/\s/g, '')); } catch (err) { throw new Error(friendly(err)); }
      state.mfa = true; emit();
    },
    async cancelMfa(factorId) { await api.unenroll(factorId).catch(() => {}); },
    async disableMfa() {
      for (const f of await api.totpFactors()) await api.unenroll(f.id);
      state.mfa = false; emit();
    },

    async changePassword(current, next) {
      const vault = await api.getVault(state.userId);
      const kekOld = await C.deriveKek(current, vault.kdf_salt, vault.kdf_iterations);
      let dk;
      try { dk = await C.unwrapDataKey(vault.wrapped_key, vault.wrapped_key_iv, kekOld, state.userId, true); } catch { throw new Error('Your current password is incorrect.'); }
      const salt = C.toB64(C.randomBytes(16));
      const w = await C.wrapDataKey(dk, await C.deriveKek(next, salt), state.userId);
      await api.updatePassword(await C.deriveAuthSecret(state.email, next));
      const ok = await api.updateVault(state.userId, vault.version, { kdf_salt: salt, kdf_iterations: C.PBKDF2_ITERATIONS, wrapped_key: w.wrapped, wrapped_key_iv: w.iv });
      if (!ok) throw new Error('Your data changed on another device. Try again.');
      version = vault.version + 1;
    },

    async newRecoveryKey(password) {
      const vault = await api.getVault(state.userId);
      let dk;
      try { dk = await C.unwrapDataKey(vault.wrapped_key, vault.wrapped_key_iv, await C.deriveKek(password, vault.kdf_salt, vault.kdf_iterations), state.userId, true); } catch { throw new Error('That password is incorrect.'); }
      const key = C.newRecoveryKey();
      const rSalt = C.toB64(C.randomBytes(16));
      const rw = await C.wrapDataKey(dk, await C.deriveRecoveryKek(key, rSalt), state.userId);
      const ok = await api.updateVault(state.userId, vault.version, { recovery_salt: rSalt, recovery_wrapped_key: rw.wrapped, recovery_iv: rw.iv });
      if (!ok) throw new Error('Your data changed on another device. Try again.');
      version = vault.version + 1;
      return key;
    },

    async requestReset(email) { await api.resetPassword(C.normalizeEmail(email)); },

    /**
     * After following the reset link (or when the password no longer unlocks
     * the vault): set a new password, and use the recovery key to re-wrap the
     * data key. Without a recovery key, the synced copy is replaced with this
     * device's data.
     */
    async completeReset(newPassword, recoveryKey) {
      const user = await api.currentUser();
      if (!user) throw new Error('The reset link has expired. Request a new one.');
      const aal = await api.aal();
      if (aal.next === 'aal2' && aal.current !== 'aal2') throw new Error('Enter your two-factor code first.');
      state.userId = user.id; state.email = user.email || state.email;
      const vault = await api.getVault(user.id);
      // Check the recovery key before touching the password, so a typo changes nothing.
      let dk = null;
      if (recoveryKey && vault) {
        try { dk = await C.unwrapDataKey(vault.recovery_wrapped_key, vault.recovery_iv, await C.deriveRecoveryKek(recoveryKey, vault.recovery_salt), user.id, true); } catch { throw new Error('That recovery key doesn\'t match this account.'); }
      }
      await api.updatePassword(await C.deriveAuthSecret(state.email, newPassword));
      if (dk) {
        const salt = C.toB64(C.randomBytes(16));
        const w = await C.wrapDataKey(dk, await C.deriveKek(newPassword, salt), user.id);
        await api.updateVault(user.id, vault.version, { kdf_salt: salt, kdf_iterations: C.PBKDF2_ITERATIONS, wrapped_key: w.wrapped, wrapped_key_iv: w.iv });
        pending = { email: state.email, password: newPassword };
        state.recovery = false;
        return afterAuth();
      }
      if (vault) await api.deleteVault(user.id);
      pending = { email: state.email, password: newPassword };
      state.recovery = false;
      return afterAuth(); // creates a fresh vault and a new recovery key
    },

    async signOut({ everywhere = false } = {}) {
      clearTimeout(pushTimer);
      if (dataKey) await push(true).catch(() => {});
      if (state.userId) await keystore.del(`dk:${state.userId}`);
      await api.signOut(everywhere ? 'global' : 'local').catch(() => {});
      dataKey = null; version = 0;
      setStatus('signed-out', { email: null, userId: null, lastSync: null, mfa: false });
    },

    async deleteSyncedData() {
      await api.deleteVault(state.userId);
      await this.signOut();
    },

    schedulePush,
    pull: () => pull(),
  };
  return sync;
}
