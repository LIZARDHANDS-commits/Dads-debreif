// Debrief focus points (DFPs): the list operations behind the DFP panel and
// the map's flags. Plain values in, new plain values out, no page access
// (SPEC-debrief, R17, #25).
//
// A DFP is { id, t, x, y, label, note }: the playback time in seconds, Lead's
// position then in local feet (for the flag), the user's label or null for
// the automatic "DFP n", and a note. Lists are kept in time order.

/** The debrief file's limits (SPEC-flight-data), so nothing typed here is refused on reopening. */
export const DFP_LIMITS = Object.freeze({ count: 500, label: 80, note: 2000 });

const byTime = (a, b) => a.t - b.t || a.id - b.id;

/** The list in time order (ties in the order they were added). */
export function sortDfps(list) {
  return [...list].sort(byTime);
}

/**
 * Adds a DFP at time `t` with Lead at (x, y). Returns { list, dfp }, or
 * { list, dfp: null } unchanged once the list holds DFP_LIMITS.count.
 */
export function addDfp(list, { t, x = null, y = null }) {
  if (!Number.isFinite(t) || list.length >= DFP_LIMITS.count) return { list, dfp: null };
  const id = list.reduce((m, d) => Math.max(m, d.id), 0) + 1;
  const dfp = { id, t, x: Number.isFinite(x) ? x : null, y: Number.isFinite(y) ? y : null, label: null, note: '' };
  return { list: sortDfps([...list, dfp]), dfp };
}

/** The label shown for `dfp`: the user's, or "DFP n" by its place in time order. */
export function dfpLabel(list, dfp) {
  if (dfp.label) return dfp.label;
  return `DFP ${sortDfps(list).findIndex((d) => d.id === dfp.id) + 1}`;
}

function clip(text, max) {
  return String(text ?? '').replace(/\r\n?/g, '\n').slice(0, max);
}

/** Renames a DFP; a blank name goes back to the automatic "DFP n". Labels are one line, at most 80 characters. */
export function renameDfp(list, id, text) {
  const label = clip(text, DFP_LIMITS.label * 2).replace(/\s+/g, ' ').trim().slice(0, DFP_LIMITS.label);
  return list.map((d) => (d.id === id ? { ...d, label: label || null } : d));
}

/** Sets a DFP's note, cut to 2,000 characters. */
export function setDfpNote(list, id, text) {
  const note = clip(text, DFP_LIMITS.note);
  return list.map((d) => (d.id === id ? { ...d, note } : d));
}

export function removeDfp(list, id) {
  return list.filter((d) => d.id !== id);
}

/** The first DFP after time `t`, or null. At a DFP, this is the one after it. */
export function nextDfp(list, t) {
  return sortDfps(list).find((d) => d.t > t + 1e-6) ?? null;
}

/** The last DFP before time `t`, or null. At a DFP, this is the one before it. */
export function previousDfp(list, t) {
  const before = sortDfps(list).filter((d) => d.t < t - 1e-6);
  return before.length ? before[before.length - 1] : null;
}

/**
 * A fingerprint of the loaded flight, from each track's text in ship order:
 * FNV-1a from two starting values (64 bits in all), so DFPs kept in the browser only ever come back on
 * the same tracks (#25). Not a security measure, just a name.
 */
export function flightFingerprint(texts) {
  let a = 0x811c9dc5, b = 0x050c5d1f;
  for (const text of texts) {
    const s = `${String(text ?? '').length}:${text ?? ''}\u0000`;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193);
      b = Math.imul(b ^ c, 0x01000193);
    }
  }
  const hex = (n) => (n >>> 0).toString(16).padStart(8, '0');
  return hex(a) + hex(b);
}

/** The browser storage key for a flight's DFPs. */
export function dfpStorageKey(fingerprint) {
  return `debrief:dfps:${fingerprint}`;
}

/**
 * DFPs read back from browser storage, checked like any outside data: entries
 * that aren't DFPs are dropped, text is cut to the limits, ids are made
 * unique, and the list comes back in time order.
 */
export function readStoredDfps(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const d of value.slice(0, DFP_LIMITS.count)) {
    if (!d || typeof d !== 'object' || !Number.isFinite(d.t)) continue;
    let id = Number.isSafeInteger(d.id) && d.id > 0 ? d.id : 0;
    if (!id || seen.has(id)) id = Math.max(0, ...seen) + 1;
    seen.add(id);
    let dfp = { id, t: d.t, x: Number.isFinite(d.x) ? d.x : null, y: Number.isFinite(d.y) ? d.y : null, label: null, note: '' };
    [dfp] = renameDfp([dfp], id, typeof d.label === 'string' ? d.label : '');
    [dfp] = setDfpNote([dfp], id, typeof d.note === 'string' ? d.note : '');
    out.push(dfp);
  }
  return sortDfps(out);
}
