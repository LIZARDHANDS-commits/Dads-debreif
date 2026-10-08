// The generated approach files (approaches/<base>.js, tools/cifp-approaches.mjs: the FAA CIFP's approaches for a US base and its usual alternates) are
// loaded only when needed, with a dynamic import() as the FAA airspace files are (airspace-load.js): when the 3D view opens at that base, or when the
// SOF screen shows that base and its alternate cards list their published approaches. Moose Jaw, and any Canadian home, has no file: its fields get the
// estimated centrelines (approaches-model.js), so nothing is downloaded there.
//
// A file is our own generated data, read through approaches-model.js `readApproachFile`, which checks every field.
import { readApproachFile } from '../approaches-model.js';

/** What the 3D key says while the file loads, and when it could not be loaded. */
export const APPROACHES_LOADING_WORDS = 'Approaches loading…';
export const APPROACHES_FAILED_WORDS = 'Approaches unavailable (couldn’t load)';

const loads = new Map(); // icao -> { status: 'loading' | 'ok' | 'failed', fields: Map | null, source, cycle }

/**
 * The approaches a profile has now: { status: 'none' (no file: a Canadian home), 'idle', 'loading', 'ok' or 'failed', fields: Map icao -> field (readApproachFile)
 * or null, source (the file's SOURCE words), cycle ({ id, effective }) }.
 */
export function approachesOf(site) {
  if (typeof site?.loadApproaches !== 'function') return { status: 'none', fields: null, source: null, cycle: null };
  const held = loads.get(site.icao);
  if (!held) return { status: 'idle', fields: null, source: null, cycle: null };
  return { status: held.status, fields: held.status === 'ok' ? held.fields : null, source: held.source, cycle: held.cycle };
}

/** Starts loading a profile's file if it is not here and not on its way (a failed one is tried again). `onDone()` when it lands or fails. Nothing for a profile with no file. */
export function loadApproachesFor(site, onDone = () => {}) {
  if (typeof site?.loadApproaches !== 'function') return;
  const held = loads.get(site.icao);
  if (held && held.status !== 'failed') return;
  const entry = { status: 'loading', fields: null, source: null, cycle: null };
  loads.set(site.icao, entry);
  Promise.resolve()
    .then(() => site.loadApproaches())
    .then((file) => {
      entry.fields = readApproachFile(file);
      entry.source = typeof file?.SOURCE === 'string' ? file.SOURCE : null;
      entry.cycle = file?.CYCLE && typeof file.CYCLE.id === 'string' ? { id: file.CYCLE.id, effective: String(file.CYCLE.effective ?? '') } : null;
      entry.status = 'ok';
    })
    .catch(() => {
      entry.status = 'failed';
    })
    .finally(() => onDone());
}
