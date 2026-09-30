// Loads a whole flight at once: every file is read and cleaned, and the
// tracks are put on one map, or nothing is loaded at all (C9, #23). V6 loaded
// files one by one, so a bad file could leave half a flight on screen.
import { readKml, KmlError } from './kml.js';
import { cleanTrack } from './clean.js';
import { buildFlight } from './flight.js';

/** Up to four ships: lead and #2 to #4. */
export const MAX_TRACKS = 4;

/**
 * `files` is [{ slot, name, text }] with slots 1 to MAX_TRACKS, each once.
 * Returns the flight (buildFlight) with the files it came from, for saving
 * (debrief-file.js), or throws the first KmlError, whose message names the
 * file. The caller keeps whatever it had loaded before.
 */
export function loadFlight(files) {
  if (!Array.isArray(files) || !files.length || files.length > MAX_TRACKS) {
    throw new KmlError('slots', `Load between 1 and ${MAX_TRACKS} track files.`);
  }
  const tracks = {};
  for (const { slot, name, text } of files) {
    if (!Number.isInteger(slot) || slot < 1 || slot > MAX_TRACKS || tracks[slot]) {
      throw new KmlError('slots', `Each track needs its own ship number, 1 to ${MAX_TRACKS}.`);
    }
    tracks[slot] = cleanTrack(readKml(text, name));
  }
  return { ...buildFlight(tracks), files: files.map(({ slot, name, text }) => ({ slot, name, text })) };
}
