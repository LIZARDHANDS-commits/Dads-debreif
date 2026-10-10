// What goes into a saved debrief besides the tracks (R17): the DFPs, the
// standards and the playback time, and how they come back out. flight-data's
// debrief file keeps settings as flat values, each checked against a rule on
// the way in, so the standards are flattened to "standards.spread.minFt" and
// so on. Plain values only; tested in Node.
import { renameDfp, setDfpNote, sortDfps, DFP_LIMITS } from './dfp.js';
import { MAX_DEBRIEF_BYTES } from '../../flight-data/debrief-file.js';
import { weatherForFile } from './weather/saved-radar.js';

const PREFIX = 'standards.';
/** The playback time, seconds since 1970 (the debrief file's DFP time limit). */
export const TIME_KEY = 'time';
const TIME_RULE = { type: 'number', min: 0, max: 1e11 };
/**
 * Where the saved radar and lightning ride in the file (12f): one string, the
 * block weather/saved-radar.js writes and checks, under the file's settings.
 * flight-data's format has no weather field yet, and settings may hold a string
 * up to a length the reader is given, so nothing there changes. When it gets a
 * field of its own, only this key and the two places that use it move.
 */
export const WEATHER_KEY = 'savedWeather';
/** Each ship's GPS puck seat in the file (DB-23): "puck.1" to "puck.4", "front" or "rear"; a ship with none set has no key. */
const PUCK_PREFIX = 'puck.';
const PUCK_RULE = { type: 'string', oneOf: ['front', 'rear'] };

/**
 * The rules readDebriefFile checks the file's settings against, from
 * app.standards.limits. `weather`: also keep the saved radar's block, of any
 * length a file the tool opens can have, so a block over the length
 * saved-radar.js allows reaches its checks and is left out with a line (the
 * file reader would drop it without a word). saved-radar.js checks the inside.
 * `pucks`: also keep each ship's GPS puck seat (DB-23).
 */
export function settingsRules(limits, { weather = false, pucks = false } = {}) {
  const rules = { [TIME_KEY]: TIME_RULE };
  if (pucks) for (let slot = 1; slot <= 4; slot++) rules[`${PUCK_PREFIX}${slot}`] = PUCK_RULE;
  if (weather) rules[WEATHER_KEY] = { type: 'string', max: MAX_DEBRIEF_BYTES };
  for (const [group, fields] of Object.entries(limits)) {
    rules[`${PREFIX}${group}.on`] = { type: 'boolean' };
    for (const [key, limit] of Object.entries(fields)) rules[`${PREFIX}${group}.${key}`] = { type: 'number', min: limit.min, max: limit.max };
  }
  return rules;
}

/**
 * The saved radar's setting as the file has it, for savedFromSetting. The file
 * reader drops a setting that is not text without a word, so when it kept none
 * but the file's text names the key, the file's own settings are looked at
 * (rarely; a parse of a big file) and whatever is there comes back as it is,
 * so the debrief can say it left it out. `text`: the file's text. `settings`:
 * what readDebriefFile kept. undefined when the file has none.
 */
export function weatherSettingOf(text, settings) {
  if (Object.hasOwn(settings, WEATHER_KEY)) return settings[WEATHER_KEY];
  if (!text.includes(`"${WEATHER_KEY}"`)) return undefined;
  try {
    const own = JSON.parse(text).settings;
    return own && typeof own === 'object' && Object.hasOwn(own, WEATHER_KEY) ? own[WEATHER_KEY] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The settings saved in the file: every standard, flattened, the time,
 * `weather` (the saved radar's block as text, savedToSetting) when there is one,
 * and each ship's GPS puck seat that is set (`pucks` { slot: 'front' | 'rear' }, DB-23).
 */
export function sessionSettings(standards, t, weather = '', pucks = {}) {
  const out = {};
  for (const [group, fields] of Object.entries(standards)) {
    for (const [key, value] of Object.entries(fields)) out[`${PREFIX}${group}.${key}`] = value;
  }
  if (Number.isFinite(t)) out[TIME_KEY] = t;
  if (weather) out[WEATHER_KEY] = weather;
  for (const [slot, seat] of Object.entries(pucks ?? {})) if (seat) out[`${PUCK_PREFIX}${slot}`] = seat;
  return out;
}

/** The file's GPS puck seats as { slot: seat }, or null when the file names none (DB-23). Checked by settingsRules already. */
export function pucksFromSettings(settings) {
  const out = {};
  for (let slot = 1; slot <= 4; slot++) {
    const seat = settings[`${PUCK_PREFIX}${slot}`];
    if (seat) out[slot] = seat;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * The file's standards as a patch for app.standards.update(), or null when
 * the file has none. Values the file got wrong were already dropped by
 * readDebriefFile, so the patch only holds the good ones.
 */
export function standardsPatch(settings) {
  const patch = {};
  for (const [name, value] of Object.entries(settings)) {
    if (!name.startsWith(PREFIX)) continue;
    const [group, key] = name.slice(PREFIX.length).split('.');
    (patch[group] ??= {})[key] = value;
  }
  return Object.keys(patch).length ? patch : null;
}

/**
 * DFPs as the debrief file keeps them: { t, label, note }. An automatic
 * label is saved empty, so it still renumbers when the file is opened again.
 */
export function dfpsForFile(list) {
  return sortDfps(list).map((d) => ({ t: d.t, label: d.label ?? '', note: d.note }));
}

/**
 * The file's DFPs back as the panel's list. `leadAt(t)` gives Lead's { x, y }
 * then, for the flag, or null.
 */
export function dfpsFromFile(fileDfps, leadAt) {
  let list = [];
  for (const [i, d] of fileDfps.slice(0, DFP_LIMITS.count).entries()) {
    const at = leadAt(d.t);
    const id = i + 1;
    let dfp = { id, t: d.t, x: at?.x ?? null, y: at?.y ?? null, label: null, note: '' };
    [dfp] = renameDfp([dfp], id, d.label);
    [dfp] = setDfpNote([dfp], id, d.note);
    list.push(dfp);
  }
  list = sortDfps(list);
  return list;
}

/** A name for the saved file from the time the flight starts: "debrief-2026-06-02-1817Z.dadsdebrief.json". */
export function debriefFileName(startT) {
  const iso = new Date(startT * 1000).toISOString();
  return `debrief-${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}Z.dadsdebrief.json`;
}

/**
 * The debrief file's text with the kept radar in it when that can be done
 * safely. write(weatherText): the file's text for a settings string ('' for
 * none), as toDebriefFile makes it. weather: the kept set or null. window:
 * { startT, endT } of the flight. The set is read back through the reader's own
 * checks first (weatherForFile); if it would not come back whole it is left out.
 * Returns { text, wrote, left }: `wrote` true when the radar is in the file,
 * `left` the words for why it was left out (or null).
 *
 * The file the reader will open is limited to `maxBytes` (flight-data's
 * MAX_DEBRIEF_BYTES, 189 MiB since #226: four full tracks plus a full
 * radar set, SAVED_WEATHER_BYTES), measured by
 * `sizeOf(text)`, which should count bytes as the opener does. With the radar
 * in, a file over it would not open again, so it is saved without the radar.
 */
export function buildDebriefFile({ write, weather, window, maxBytes = Infinity, sizeOf = (text) => text.length }) {
  if (!weather) return { text: write(''), wrote: false, left: null };
  const wx = weatherForFile(weather, window);
  if (wx.problem) return { text: write(''), wrote: false, left: wx.problem };
  const text = write(wx.text);
  const size = sizeOf(text);
  if (size > maxBytes) {
    const mb = Math.round((maxBytes / 1024 / 1024) * 10) / 10;
    return {
      text: write(''),
      wrote: false,
      left: `This debrief file would be over the size this tool opens (${mb} MB), so it was saved without the radar and lightning. They stay here until you close the flight.`,
    };
  }
  return { text, wrote: true, left: null };
}
