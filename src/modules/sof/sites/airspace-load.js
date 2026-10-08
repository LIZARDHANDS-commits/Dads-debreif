// The generated FAA airspace files (faa-airspace/<icao>.js, tools/faa-airspace.mjs) are loaded only when they are needed (Dad, 8 Oct 2026; future.md "US bases,
// follow-ups"): when the base is home and the 3D view opens, with a dynamic import(), so a user who never opens the 3D view at that base never downloads its file
// (each covers the 3D view's largest area, 900 NM, and is about 100 KB or more). A profile with `loadAirspace` (a function that imports its file) has its fixed
// entries in `airspace` (Moose Jaw's DAH entries; none for a US base) and the loaded ones are added to them here.
//
// The file is untrusted only as far as any of our own generated data is: its entries go through airspace-model.js `checkedAirspace` like every other entry.

/** What the 3D key and the Airspace button say while the file loads, and when it could not be loaded. */
export const AIRSPACE_LOADING_WORDS = 'Airspace loading…';
export const AIRSPACE_FAILED_WORDS = 'Airspace unavailable (couldn’t load)';

const loads = new Map(); // icao -> { status: 'loading' | 'ok' | 'failed', entries, source }

/**
 * The airspace a profile has now: { status, entries, source }.
 * - status 'ok': everything is here: the fixed entries and, for a profile with a file, the file's (source: the file's dataset words, or null for none).
 * - 'idle' (not asked for yet), 'loading' or 'failed': only the fixed entries (Moose Jaw's DAH ones, or none for a US base).
 */
export function airspaceOf(site) {
  const fixed = site?.airspace ?? [];
  if (typeof site?.loadAirspace !== 'function') return { status: 'ok', entries: fixed, source: null };
  const held = loads.get(site.icao);
  if (!held) return { status: 'idle', entries: fixed, source: null };
  return { status: held.status, entries: held.status === 'ok' ? [...fixed, ...held.entries] : fixed, source: held.source };
}

/**
 * Starts loading a profile's file if it is not here and not on its way (a failed one is tried again: the next time the 3D view is drawn after a failure is a new
 * try, at most once per call). `onDone()` is called when it lands or fails. Does nothing for a profile with no file.
 */
export function loadAirspaceFor(site, onDone = () => {}) {
  if (typeof site?.loadAirspace !== 'function') return;
  const held = loads.get(site.icao);
  if (held && held.status !== 'failed') return;
  const entry = { status: 'loading', entries: [], source: held?.source ?? null };
  loads.set(site.icao, entry);
  Promise.resolve()
    .then(() => site.loadAirspace())
    .then((file) => {
      entry.entries = Array.isArray(file?.AIRSPACE) ? file.AIRSPACE : [];
      entry.source = typeof file?.SOURCE === 'string' ? file.SOURCE : null;
      entry.status = 'ok';
    })
    .catch(() => {
      entry.status = 'failed';
    })
    .finally(() => onDone());
}
