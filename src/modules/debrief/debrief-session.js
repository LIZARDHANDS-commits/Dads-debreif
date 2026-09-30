// What goes into a saved debrief besides the tracks (R17): the DFPs, the
// standards and the playback time, and how they come back out. flight-data's
// debrief file keeps settings as flat values, each checked against a rule on
// the way in, so the standards are flattened to "standards.spread.minFt" and
// so on. Plain values only; tested in Node.
import { renameDfp, setDfpNote, sortDfps, DFP_LIMITS } from './dfp.js';

const PREFIX = 'standards.';
/** The playback time, seconds since 1970 (the debrief file's DFP time limit). */
export const TIME_KEY = 'time';
const TIME_RULE = { type: 'number', min: 0, max: 1e11 };

/** The rules readDebriefFile checks the file's settings against, from app.standards.limits. */
export function settingsRules(limits) {
  const rules = { [TIME_KEY]: TIME_RULE };
  for (const [group, fields] of Object.entries(limits)) {
    rules[`${PREFIX}${group}.on`] = { type: 'boolean' };
    for (const [key, limit] of Object.entries(fields)) rules[`${PREFIX}${group}.${key}`] = { type: 'number', min: limit.min, max: limit.max };
  }
  return rules;
}

/** The settings saved in the file: every standard, flattened, and the time. */
export function sessionSettings(standards, t) {
  const out = {};
  for (const [group, fields] of Object.entries(standards)) {
    for (const [key, value] of Object.entries(fields)) out[`${PREFIX}${group}.${key}`] = value;
  }
  if (Number.isFinite(t)) out[TIME_KEY] = t;
  return out;
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
