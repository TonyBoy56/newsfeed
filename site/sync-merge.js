// Merging two copies of your data (this device + the synced vault, or a
// backup file). Pure functions, so they're easy to test.
//
// Rules:
// * read / saved: keep the newest timestamp for each article.
// * notes: the most recently edited version wins.
// * deletions: removing a save, a note or a read mark leaves a "tombstone"
//   with a timestamp, so another device's older copy can't bring it back.
// * profile (interests, name, goal) and prefs (appearance etc.): the newer
//   whole object wins.
// * history: per-day and per-concept counts take the larger value.

const TOMB_TTL = 90 * 86_400_000;

function mergeTimes(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] || 0, v);
  return out;
}

export function mergeStores(local, remote, now = Date.now()) {
  if (!remote) return local;
  if (!local) return remote;
  const tomb = mergeTimes(local.tomb, remote.tomb);
  for (const [k, ts] of Object.entries(tomb)) if (now - ts > TOMB_TTL) delete tomb[k];

  const alive = (kind, id, ts) => !(tomb[`${kind}:${id}`] >= ts);
  const filterTimes = (kind, map) => Object.fromEntries(Object.entries(map).filter(([id, ts]) => alive(kind, id, ts)));

  const read = filterTimes('r', mergeTimes(local.read, remote.read));
  const saved = filterTimes('s', mergeTimes(local.saved, remote.saved));

  const notes = {};
  for (const src of [local.notes || {}, remote.notes || {}]) {
    for (const [id, n] of Object.entries(src)) if (!notes[id] || notes[id].updated < n.updated) notes[id] = n;
  }
  for (const [id, n] of Object.entries(notes)) if (!alive('n', id, n.updated)) delete notes[id];

  const snapshots = { ...(remote.snapshots || {}), ...(local.snapshots || {}) };
  for (const id of Object.keys(snapshots)) if (!saved[id] && !notes[id]) delete snapshots[id];

  const newer = (x, y, key) => ((y?.[key] || 0) > (x?.[key] || 0) ? y : x);
  const profile = newer(local.profile, remote.profile, 'updated');
  const prefsOwner = (remote.prefsUpdated || 0) > (local.prefsUpdated || 0) ? remote : local;

  return {
    ...local,
    createdAt: Math.min(local.createdAt || now, remote.createdAt || now),
    read, saved, notes, snapshots, tomb, profile,
    prefs: prefsOwner.prefs,
    prefsUpdated: Math.max(local.prefsUpdated || 0, remote.prefsUpdated || 0),
    history: {
      days: mergeTimes(local.history?.days, remote.history?.days),
      concepts: mergeTimes(local.history?.concepts, remote.history?.concepts),
    },
  };
}

/** Only the parts worth syncing (drops nothing important, but keeps payloads tidy). */
export function syncPayload(store) {
  const { read, saved, notes, snapshots, tomb, profile, prefs, prefsUpdated, history, createdAt } = store;
  return { v: 1, read, saved, notes, snapshots, tomb, profile, prefs, prefsUpdated, history, createdAt };
}
