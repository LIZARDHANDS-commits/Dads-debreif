// The debrief file (.dadsdebrief.json; R17, D21, #25): the original track
// files, the cleaning limits they were loaded with, the debrief focus points
// (DFPs) of this flight and the debrief's settings, so a debrief reopens
// exactly as it was. Saving and opening the file is storage/file.js's job;
// this file owns the format.
//
// An opened file is untrusted (SPEC-flight-data, Security): it is checked
// field by field against an allowlist. Unknown fields are dropped, numbers
// must be finite and in range, strings are length-capped, and any problem
// gives one plain message.
import { MAX_FILE_BYTES } from './kml.js';
import { MAX_TRACKS, MAX_NAME_CHARS } from './load.js';
import { GAP_S, MAX_GROUND_SPEED_KT, MAX_JUMP_FIXES, MIN_ALT_M, MAX_ALT_M, MIN_SPEED_TIME_S } from './clean.js';
import { STILL_KT } from './flight.js';

export const FORMAT = 'dads-debrief';
export const VERSION = 1;
export const MAX_DFPS = 500;
export const MAX_LABEL_CHARS = MAX_NAME_CHARS;
export const MAX_NOTE_CHARS = 2000;
/** Four track files at their limit, allowing for JSON escaping, plus DFPs and settings. */
export const MAX_DEBRIEF_BYTES = MAX_TRACKS * MAX_FILE_BYTES * 1.25 + 2 * 1024 * 1024;

/** The limits a flight is cleaned with today (clean.js, flight.js). */
const CLEANING = { gapS: GAP_S, maxGroundSpeedKt: MAX_GROUND_SPEED_KT, maxJumpFixes: MAX_JUMP_FIXES,
  minAltM: MIN_ALT_M, maxAltM: MAX_ALT_M, minSpeedTimeS: MIN_SPEED_TIME_S, stillKt: STILL_KT };

/** A debrief file that can't be saved or opened. `message` is for the user. */
export class DebriefFileError extends Error {
  constructor(reason, saving = false) {
    super(saving ? `This debrief can't be saved: ${reason}.` : `This debrief file can't be opened: ${reason}.`);
    this.reason = reason;
    this.name = 'DebriefFileError';
    this.code = 'debrief-file';
  }
}

/**
 * The debrief file's text for a flight from loadFlight, its DFPs
 * ([{ t, label, note }]) and the debrief's settings (plain values).
 */
export function toDebriefFile(flight, dfps, settings) {
  try {
    return JSON.stringify(debriefFile(flight, dfps, settings));
  } catch (e) {
    if (e instanceof DebriefFileError) throw new DebriefFileError(e.reason, true);
    throw e;
  }
}

function debriefFile(flight, dfps, settings) {
  const files = flight?.files;
  if (!Array.isArray(files)) throw new DebriefFileError('there are no tracks to save');
  const file = {
    format: FORMAT,
    version: VERSION,
    tracks: files.map(f => ({ slot: f.slot, name: f.name, kml: f.text })),
    cleaning: CLEANING,
    dfps: checkDfps(dfps),
    settings: settings ?? {},
  };
  checkTracks(file.tracks);
  return file;
}

/**
 * Reads a debrief file's text. `settings` lists the settings to keep, each as
 * { type: 'number', min, max }, { type: 'boolean' } or { type: 'string', max, oneOf };
 * anything else in the file's settings is dropped, as is any bad value.
 * Returns { files, dfps, settings, sameCleaning }; pass `files` to loadFlight.
 * `sameCleaning` is false if the file was saved with other cleaning limits.
 */
export function readDebriefFile(text, { settings: allowed = {} } = {}) {
  if (typeof text !== 'string') throw new DebriefFileError('it is not a text file');
  if (text.length > MAX_DEBRIEF_BYTES) throw new DebriefFileError('it is too big');
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    throw new DebriefFileError('it is damaged or not a debrief file');
  }
  if (!isObject(file) || file.format !== FORMAT) throw new DebriefFileError('it is not a debrief file');
  if (Number.isInteger(file.version) && file.version > VERSION) throw new DebriefFileError('it was saved by a newer version of the tool');
  if (file.version !== VERSION) throw new DebriefFileError('it is not a debrief file this tool understands');
  checkTracks(file.tracks);
  return {
    files: file.tracks.map(tr => ({ slot: tr.slot, name: tr.name, text: tr.kml })),
    dfps: checkDfps(file.dfps),
    settings: checkSettings(file.settings, allowed),
    sameCleaning: isObject(file.cleaning) && Object.entries(CLEANING).every(([k, v]) => file.cleaning[k] === v),
  };
}

function checkTracks(tracks) {
  if (!Array.isArray(tracks) || !tracks.length || tracks.length > MAX_TRACKS) {
    throw new DebriefFileError(`it needs 1 to ${MAX_TRACKS} tracks`);
  }
  const seen = new Set();
  tracks.forEach((tr, i) => {
    if (!isObject(tr) || !Number.isInteger(tr.slot) || tr.slot < 1 || tr.slot > MAX_TRACKS || seen.has(tr.slot)
      || !isText(tr.name, MAX_NAME_CHARS)
      || typeof tr.kml !== 'string' || tr.kml.length > MAX_FILE_BYTES) {
      throw new DebriefFileError(`track ${i + 1} is damaged`);
    }
    seen.add(tr.slot);
  });
}

function checkDfps(dfps) {
  if (dfps === undefined) return [];
  if (!Array.isArray(dfps) || dfps.length > MAX_DFPS) throw new DebriefFileError(`it can hold up to ${MAX_DFPS} DFPs`);
  return dfps.map((d, i) => {
    if (!isObject(d) || !Number.isFinite(d.t) || d.t < 0 || d.t > 1e11
      || !isText(d.label, MAX_LABEL_CHARS) || !isText(d.note, MAX_NOTE_CHARS)) {
      throw new DebriefFileError(`DFP ${i + 1} is damaged (it needs a time, a label up to ${MAX_LABEL_CHARS} characters and a note up to ${MAX_NOTE_CHARS})`);
    }
    return { t: d.t, label: d.label, note: d.note };
  }).sort((a, b) => a.t - b.t);
}

function checkSettings(settings, allowed) {
  const out = {};
  if (!isObject(settings)) return out;
  for (const [key, rule] of Object.entries(allowed)) {
    if (!Object.hasOwn(settings, key)) continue;
    const v = settings[key];
    const ok = rule.type === 'number' ? Number.isFinite(v) && v >= rule.min && v <= rule.max
      : rule.type === 'boolean' ? typeof v === 'boolean'
        : rule.type === 'string' ? typeof v === 'string' && (rule.oneOf ? rule.oneOf.includes(v) : v.length <= rule.max)
          : false;
    if (ok) out[key] = v;
  }
  return out;
}

const isObject = v => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v, max) => typeof v === 'string' && v.length <= max;
