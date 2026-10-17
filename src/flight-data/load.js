// Loads a whole flight at once: every file is read and cleaned, and the
// tracks are put on one map, or nothing is loaded at all (C9, #23). V6 loaded
// files one by one, so a bad file could leave half a flight on screen.
import { readKml, KmlError } from './kml.js';
import { cleanTrack } from './clean.js';
import { buildFlight } from './flight.js';

/** Up to four ships: lead and #2 to #4 (one flight). */
export const MAX_TRACKS = 4;
/**
 * A large exercise (DB-37): up to four flights of four. The Debrief passes it as `maxTracks`; every caller that doesn't
 * keeps the four-ship limit and its messages.
 */
export const MAX_SHIPS = 16;
/** The longest track name kept; longer file names are shortened with "…". */
export const MAX_NAME_CHARS = 80;

function shortName(name) {
  const s = String(name ?? '');
  return s.length > MAX_NAME_CHARS ? s.slice(0, MAX_NAME_CHARS - 1) + '…' : s;
}

/**
 * `files` is [{ slot, name, text }] with slots 1 to MAX_TRACKS (or `maxTracks`), each once.
 * Returns the flight (buildFlight) with the files it came from, for saving
 * (debrief-file.js), or throws the first KmlError, whose message names the
 * file. The caller keeps whatever it had loaded before.
 * `skipBad` (an exercise, DB-37): a file that can't be read or cleaned is left out instead, listed in the flight's
 * `failed` ([{ slot, name, message }]); with none left, the first error is thrown as before. Tracks that don't overlap
 * are refused either way (buildFlight).
 */
export function loadFlight(files, { maxTracks = MAX_TRACKS, skipBad = false } = {}) {
  if (!Array.isArray(files) || !files.length || files.length > maxTracks) {
    throw new KmlError('slots', `Load between 1 and ${maxTracks} track files.`);
  }
  const tracks = {};
  const seen = new Set();
  const failed = [];
  let firstError = null;
  for (const { slot, name, text } of files) {
    if (!Number.isInteger(slot) || slot < 1 || slot > maxTracks || seen.has(slot)) {
      throw new KmlError('slots', `Each track needs its own ship number, 1 to ${maxTracks}.`);
    }
    seen.add(slot);
    try {
      tracks[slot] = cleanTrack(readKml(text, shortName(name)));
    } catch (err) {
      if (!skipBad || err?.name !== 'KmlError') throw err;
      firstError ??= err;
      failed.push({ slot, name: shortName(name), message: err.message });
    }
  }
  if (!Object.keys(tracks).length) throw firstError;
  const kept = files.filter(({ slot }) => tracks[slot]);
  const out = { ...buildFlight(tracks), files: kept.map(({ slot, name, text }) => ({ slot, name: shortName(name), text })) };
  return skipBad ? { ...out, failed } : out;
}
