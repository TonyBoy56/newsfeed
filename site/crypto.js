// End-to-end encryption for synced data. Uses only the browser's built-in
// Web Crypto API, with no third-party crypto code.
//
// How it fits together (the same model as password managers like Bitwarden):
//
//   password ──PBKDF2(email salt)──▶ authSecret ──▶ sent to Supabase as the "password"
//   password ──PBKDF2(random salt)─▶ KEK ─┐
//                                         ├─ wraps ─▶ DK (random AES-256 data key)
//   recovery key ──HKDF────────────▶ RK ──┘                 │
//                                                           ▼
//                                          AES-GCM(your notes, interests, settings)
//
// * The server only ever sees authSecret, never your real password, so it
//   can't derive the key that unlocks your data.
// * DK is random and never leaves your devices unwrapped. Changing your
//   password just re-wraps DK; nothing needs re-encrypting.
// * The recovery key is a second, independent way to unwrap DK if you forget
//   your password.
// * Each ciphertext is bound to your user id (AES-GCM additional data), so a
//   row can't be swapped between accounts unnoticed.

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

// OWASP's 2023 guidance for PBKDF2-HMAC-SHA256.
export const PBKDF2_ITERATIONS = 600_000;

// ---------- encoding helpers ----------

export const toB64 = (buf) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
export const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const b64url = (buf) => toB64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

// ---------- key derivation ----------

async function pbkdf2Bits(password, salt, iterations, bits = 256) {
  const base = await subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, bits));
}

export const normalizeEmail = (email) => String(email).trim().toLowerCase();

/** What Supabase sees instead of your password. Deterministic per email. */
export async function deriveAuthSecret(email, password) {
  const salt = enc.encode(`signal-auth-v1:${normalizeEmail(email)}`);
  return b64url(await pbkdf2Bits(password, salt, PBKDF2_ITERATIONS));
}

/** Key-encryption key from your password, with the random salt stored in your vault row. */
export async function deriveKek(password, saltB64, iterations = PBKDF2_ITERATIONS) {
  const bits = await pbkdf2Bits(password, fromB64(saltB64), iterations);
  return subtle.importKey('raw', bits, 'AES-GCM', false, ['wrapKey', 'unwrapKey']);
}

/** Key-encryption key from a recovery key. It's already high-entropy, so HKDF is enough. */
export async function deriveRecoveryKek(recoveryKey, saltB64) {
  const raw = decodeRecoveryKey(recoveryKey);
  const base = await subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: fromB64(saltB64), info: enc.encode('signal-recovery-v1') },
    base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey'],
  );
}

// ---------- the data key ----------

export const generateDataKey = () => subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

export async function wrapDataKey(dataKey, kek, userId) {
  const iv = randomBytes(12);
  const wrapped = await subtle.wrapKey('raw', dataKey, kek, { name: 'AES-GCM', iv, additionalData: enc.encode(`dk:${userId}`) });
  return { wrapped: toB64(wrapped), iv: toB64(iv) };
}

/**
 * extractable=false gives a key that can encrypt and decrypt but can never be
 * read out, even by code running on this page. That's the copy kept on the device.
 */
export async function unwrapDataKey(wrappedB64, ivB64, kek, userId, extractable = false) {
  try {
    return await subtle.unwrapKey('raw', fromB64(wrappedB64), kek,
      { name: 'AES-GCM', iv: fromB64(ivB64), additionalData: enc.encode(`dk:${userId}`) },
      { name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt']);
  } catch {
    throw new Error('WRONG_KEY');
  }
}

// ---------- data ----------

export async function encryptJSON(dataKey, value, userId) {
  const iv = randomBytes(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(`vault:${userId}`) }, dataKey, enc.encode(JSON.stringify(value)));
  return { data: toB64(ct), iv: toB64(iv) };
}

export async function decryptJSON(dataKey, dataB64, ivB64, userId) {
  try {
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB64), additionalData: enc.encode(`vault:${userId}`) }, dataKey, fromB64(dataB64));
    return JSON.parse(dec.decode(pt));
  } catch {
    throw new Error('DECRYPT_FAILED');
  }
}

// ---------- recovery key (160 random bits, shown as 8 groups of 4) ----------

const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I, so it's easy to read back

export function newRecoveryKey() {
  const bytes = randomBytes(20);
  let bits = '', out = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out.match(/.{4}/g).join('-');
}

export function decodeRecoveryKey(key) {
  const clean = String(key).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 32 || [...clean].some((ch) => !B32.includes(ch))) throw new Error('BAD_RECOVERY_KEY');
  let bits = '';
  for (const ch of clean) bits += B32.indexOf(ch).toString(2).padStart(5, '0');
  return Uint8Array.from(bits.match(/.{8}/g), (b) => parseInt(b, 2));
}

// ---------- password strength ----------

const COMMON = ['password', 'qwerty', 'letmein', 'welcome', 'admin', 'iloveyou', 'monkey', 'dragon', 'football', 'baseball',
  'sunshine', 'princess', 'master', 'shadow', 'superman', 'trustno1', 'abc123', '123456', 'signal', 'newsfeed'];

/** A quick, honest estimate. Returns { ok, score 0–4, tips[] }. */
export function passwordStrength(pw, email = '') {
  const tips = [];
  const lower = pw.toLowerCase();
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33;
  let bits = pw.length * Math.log2(Math.max(pool, 1));
  if (/(.)\1{2,}/.test(pw)) { bits *= 0.7; tips.push('Avoid repeated characters.'); }
  if (/(0123|1234|2345|abcd|qwer|asdf)/i.test(pw)) { bits *= 0.7; tips.push('Avoid sequences like 1234 or qwer.'); }
  if (COMMON.some((w) => lower.includes(w))) { bits *= 0.5; tips.push('Avoid common words like "password".'); }
  const local = normalizeEmail(email).split('@')[0];
  if (local.length > 3 && lower.includes(local)) { bits *= 0.5; tips.push("Don't include your email name."); }
  if (pw.length < 12) tips.push('Use at least 12 characters. A short sentence works well.');
  const score = bits < 40 ? 0 : bits < 55 ? 1 : bits < 70 ? 2 : bits < 90 ? 3 : 4;
  return { ok: pw.length >= 12 && score >= 3, score, tips };
}

/**
 * Checks the Have I Been Pwned database without revealing the password:
 * only the first 5 characters of its SHA-1 hash are sent ("k-anonymity"),
 * and the match happens here in the browser. Returns a count, or null if
 * the check couldn't run.
 */
export async function pwnedCount(password) {
  try {
    const hash = [...new Uint8Array(await subtle.digest('SHA-1', enc.encode(password)))].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' } });
    if (!res.ok) return null;
    const line = (await res.text()).split('\n').find((l) => l.startsWith(hash.slice(5)));
    return line ? parseInt(line.split(':')[1], 10) || 0 : 0;
  } catch {
    return null;
  }
}
