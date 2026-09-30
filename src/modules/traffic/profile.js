// Profiles for the Traffic Sim (specs/SPEC-traffic.md: Profiles and notes, Security; task 7, #48).
// A profile is a whole setup under a name: the routes, the aircraft, the dice seed, the notes,
// the airfield it is at, and the settings that go with it (speed, layers, route options,
// conflict limits, the photo's alignment). The built-in setups are profiles too, made from the
// data files and never stored.
//
// What is read back from this browser's storage is untrusted (something else may have written
// it, or an older or newer version of the page, or a person with the console open), so
// `checkProfile` never uses what it is given: it checks every field against an allowlist and a
// range and builds a new object from what passed, and refuses the profile, in plain words, at
// the first thing wrong. Pure: no page, no storage, no clock.
import MOOSE_JAW from './data/moose-jaw.json' with { type: 'json' };
import MOOSE_JAW_V6 from './data/moose-jaw-v6.json' with { type: 'json' };
import { DEFAULTS, LIMITS, SPEEDS } from './defaults.js';
import { TYPE_COLORS } from './sim.js';
import { newPattern } from './route.js';

export const PROFILE_VERSION = 1;

/** The most saved profiles, routes, points on a route, aircraft; the longest name, label and notes; the biggest profile as text. */
export const MOST_SAVED = 20;
export const MOST_ROUTES = 30;
export const MOST_POINTS = 100;
export const MOST_AIRCRAFT = 200;
export const NAME_MAX = 40;
export const LABEL_MAX = 40;
export const NOTES_MAX = 2000;
export const MOST_CHARS = 400_000;

/** The fewest points a route may have, as the editor holds it to. */
const MIN_POINTS = Object.freeze({ pattern: 3, entry: 2, split: 2 });
const KINDS = Object.freeze(['pattern', 'entry', 'split']);
/** How far from the anchor a point may be, in feet (about 165 NM): far past any pattern, short of a number that breaks the drawing. */
const MOST_DISTANCE_FT = 1_000_000;
const MOST_SEED = 4294967295;

const ID = /^[A-Za-z][A-Za-z0-9_-]{0,19}$/;
const CALLSIGN = /^[A-Za-z0-9_-]{1,12}$/;
const COLOUR = /^#[0-9a-fA-F]{6}$/;
const ICAO = /^[A-Z0-9]{4}$/;
// Control characters and the bidirectional overrides and isolates: a name is drawn as plain text and must not reorder the text around it.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/g;
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS_KEEP_LINES = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g;

/** A name as it is stored: no control or direction-changing characters, no spaces at either end. */
export const cleanName = (value) => (typeof value === 'string' ? value.replace(UNSAFE_CHARS, '').trim() : '');

/** The settings a profile keeps, each with its own check (the type of its default, and its range or list). */
export const PROFILE_SETTING_KEYS = Object.freeze([
  'speed', 'windFromDeg', 'windKt',
  'layerTrails', 'layerLabels', 'layerPoints', 'layerLegDistances', 'layerTurnData', 'layerBubbles', 'layerCautionRings', 'layerPhoto', 'layerEngineReach',
  'photoOpacityPct', 'photoAboveGrid', 'photoTrim', 'photoEastFt', 'photoNorthFt',
  'flyRoundedTurns', 'radiusFromG', 'manualRadiusFt',
  'conflictLatFt', 'conflictVertFt', 'cautionLatFt', 'cautionVertFt',
]);

/** Every profile setting at its starting value, for a load to begin from. */
export const profileSettingDefaults = () => Object.fromEntries(PROFILE_SETTING_KEYS.map((key) => [key, DEFAULTS[key]]));

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);
/** @param {unknown} v @param {readonly number[]} range */
const inRange = (v, range) => typeof v === 'number' && Number.isFinite(v) && v >= range[0] && v <= range[1];
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, key) => Object.hasOwn(o, key);
const feet = (n) => n.toLocaleString('en-CA');

/** Thrown inside the checks with the words to show; caught once in `checkProfile`. */
class Refused extends Error {}
/** @param {string} words @returns {never} */
const refuse = (words) => { throw new Refused(words); };

// ── The checks ───────────────────────────────────────────────────────────────

function checkSettings(raw) {
  if (raw === undefined) return {};
  if (!plain(raw)) refuse('its settings are not a list of settings');
  const out = {};
  for (const key of PROFILE_SETTING_KEYS) {
    if (!own(raw, key)) continue;
    const value = raw[key];
    if (typeof value !== typeof DEFAULTS[key]) refuse(`the setting ${key} is not the right kind of value`);
    if (typeof value === 'number') {
      if (!isNumber(value)) refuse(`the setting ${key} is not a number`);
      if (key === 'speed' ? !SPEEDS.includes(value) : own(LIMITS, key) && !inRange(value, LIMITS[key])) {
        refuse(key === 'speed' ? `the playback speed ${value} is not one of ${SPEEDS.join(', ')}` : `the setting ${key} (${value}) is outside ${feet(LIMITS[key][0])} to ${feet(LIMITS[key][1])}`);
      }
    }
    out[key] = value;
  }
  return out;
}

function checkPoint(raw, where) {
  if (!plain(raw)) refuse(`${where} is not a point`);
  const label = raw.label === undefined ? '' : raw.label;
  if (typeof label !== 'string' || cleanName(label).length > LABEL_MAX) refuse(`${where} has a label that is not text of at most ${LABEL_MAX} characters`);
  if (!inRange(raw.x, [-MOST_DISTANCE_FT, MOST_DISTANCE_FT]) || !inRange(raw.y, [-MOST_DISTANCE_FT, MOST_DISTANCE_FT])) refuse(`${where} is more than ${feet(MOST_DISTANCE_FT)} ft from the airfield, or has no position`);
  if (!inRange(raw.alt, LIMITS.pointAltFt)) refuse(`${where} has a height outside ${feet(LIMITS.pointAltFt[0])} to ${feet(LIMITS.pointAltFt[1])} ft`);
  if (!inRange(raw.kt, LIMITS.pointKias)) refuse(`${where} has a speed outside ${LIMITS.pointKias[0]} to ${LIMITS.pointKias[1]} kt`);
  if (!inRange(raw.g, LIMITS.pointG)) refuse(`${where} has a G outside ${LIMITS.pointG[0]} to ${LIMITS.pointG[1]}`);
  return { label: cleanName(label), x: raw.x, y: raw.y, alt: raw.alt, kt: raw.kt, g: raw.g };
}

/** The routes, checked one by one, then their links checked against each other. */
function checkRoutes(raw) {
  if (!Array.isArray(raw) || raw.length === 0) refuse('it has no routes');
  if (raw.length > MOST_ROUTES) refuse(`it has ${raw.length} routes (the most is ${MOST_ROUTES})`);
  const routes = [];
  for (const r of raw) {
    if (!plain(r)) refuse('a route is not a route');
    if (typeof r.id !== 'string' || !ID.test(r.id)) refuse('a route has an id that is not letters, digits, - or _ (starting with a letter, up to 20)');
    if (routes.some((o) => o.id === r.id)) refuse(`two routes have the id ${r.id}`);
    const name = cleanName(r.name);
    if (typeof r.name !== 'string' || !name || name.length > NAME_MAX) refuse(`route ${r.id} has a name that is empty or over ${NAME_MAX} characters`);
    if (!KINDS.includes(r.kind)) refuse(`${name} is not a pattern, an entry or a split`);
    if (typeof r.visible !== 'boolean') refuse(`${name} does not say whether it shows`);
    if (typeof r.color !== 'string' || !COLOUR.test(r.color)) refuse(`${name} has a colour that is not like #58a6ff`);
    if (!Array.isArray(r.points)) refuse(`${name} has no points`);
    if (r.points.length > MOST_POINTS) refuse(`${name} has ${r.points.length} points (the most is ${MOST_POINTS})`);
    if (r.points.length < MIN_POINTS[r.kind]) refuse(`${name} has ${r.points.length} points (a ${r.kind} needs at least ${MIN_POINTS[r.kind]})`);
    const route = { id: r.id, name, kind: r.kind, visible: r.visible, color: r.color, points: r.points.map((p, i) => checkPoint(p, `point ${i + 1} of ${name}`)) };
    const odds = (key, fallback) => {
      const value = r[key] === undefined ? fallback : r[key];
      if (!inRange(value, [0, 1])) refuse(`${name} has ${key} that is not from 0 to 1`);
      return value;
    };
    const link = (key) => {
      const value = r[key] === undefined ? '' : r[key];
      if (typeof value !== 'string' || (value !== '' && !ID.test(value))) refuse(`${name} joins something that is not a route`);
      return value;
    };
    const index = (key) => {
      const value = r[key] === undefined ? 0 : r[key];
      if (!isInt(value) || value < 0 || value >= MOST_POINTS) refuse(`${name} joins at a point number that is not from 1 to ${MOST_POINTS}`);
      return value;
    };
    if (route.kind === 'pattern') route.landOdds = odds('landOdds', 0.2);
    if (route.kind === 'entry') Object.assign(route, { attachTo: link('attachTo'), mergeIndex: index('mergeIndex') });
    if (route.kind === 'split') Object.assign(route, { sourceRoute: link('sourceRoute'), sourceIndex: index('sourceIndex'), attachTo: link('attachTo'), mergeIndex: index('mergeIndex'), splitOdds: odds('splitOdds', 0.5) });
    routes.push(route);
  }
  // Links must point at routes that are there, at points that are there.
  const byId = new Map(routes.map((r) => [r.id, r]));
  for (const route of routes) {
    for (const [routeKey, indexKey] of [['attachTo', 'mergeIndex'], ['sourceRoute', 'sourceIndex']]) {
      if (!own(route, routeKey) || route[routeKey] === '') continue;
      const target = byId.get(route[routeKey]);
      if (!target || target.kind !== 'pattern') refuse(`${route.name} joins a route that is not there, or is not a pattern`);
      if (route[indexKey] >= target.points.length) refuse(`${route.name} joins ${target.name} at point ${route[indexKey] + 1}, which it does not have`);
    }
  }
  return routes;
}

function checkAircraft(raw, routes) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) refuse('its aircraft are not a list');
  if (raw.length > MOST_AIRCRAFT) refuse(`it has ${raw.length} aircraft (the most is ${MOST_AIRCRAFT})`);
  const out = [];
  for (const a of raw) {
    if (!plain(a)) refuse('an aircraft is not an aircraft');
    if (typeof a.id !== 'string' || !CALLSIGN.test(a.id)) refuse('an aircraft has a callsign that is not letters, digits, - or _ (up to 12)');
    if (out.some((o) => o.id === a.id)) refuse(`two aircraft are called ${a.id}`);
    if (typeof a.type !== 'string' || !own(TYPE_COLORS, a.type)) refuse(`${a.id} is a type this sim does not know`);
    const route = routes.find((r) => r.id === a.routeId);
    if (!route) refuse(`${a.id} starts on a route that is not there`);
    if (!isInt(a.startIndex) || a.startIndex < 0 || a.startIndex >= route.points.length) refuse(`${a.id} starts at a point ${route.name} does not have`);
    if (!inRange(a.startsAtSec, LIMITS.spawnDelayS)) refuse(`${a.id} starts at a time outside 0 to ${feet(LIMITS.spawnDelayS[1])} s`);
    out.push({ id: a.id, type: a.type, routeId: a.routeId, startIndex: a.startIndex, startsAtSec: a.startsAtSec });
  }
  return out;
}

/**
 * Checks something read back from storage. Returns `{ ok: true, profile }`, a new object made only from what passed,
 * or `{ ok: false, problem }` in plain words. Nothing is repaired: a profile with anything wrong is refused.
 * @param {any} raw
 * @returns {{ ok: boolean, profile?: any, problem?: string }}
 */
export function checkProfile(raw) {
  try {
    if (!plain(raw)) refuse('it is not a profile');
    if (raw.version !== PROFILE_VERSION) refuse('it was saved by a different version of this page');
    let size;
    try { size = JSON.stringify(raw).length; } catch { refuse('it cannot be read'); }
    if (size > MOST_CHARS) refuse(`it is too big (${feet(size)} characters, the most is ${feet(MOST_CHARS)})`);
    const name = cleanName(raw.name);
    if (typeof raw.name !== 'string' || !name || name.length > NAME_MAX) refuse(`its name is empty or over ${NAME_MAX} characters`);
    const airfield = raw.airfield === undefined ? 'CYMJ' : raw.airfield;
    if (typeof airfield !== 'string' || !ICAO.test(airfield)) refuse('its airfield is not a four-letter code');
    const notes = raw.notes === undefined ? '' : raw.notes;
    if (typeof notes !== 'string' || notes.length > NOTES_MAX) refuse(`its notes are not text of at most ${feet(NOTES_MAX)} characters`);
    const seed = raw.seed === undefined ? 1 : raw.seed;
    if (!isInt(seed) || seed < 0 || seed > MOST_SEED) refuse('its dice seed is not a whole number');
    const a = raw.anchor;
    if (!plain(a) || !inRange(a.lat, [-90, 90]) || !inRange(a.lon, [-180, 180])) refuse('its airfield position is not a latitude and longitude');
    const routes = checkRoutes(raw.routes);
    const aircraft = checkAircraft(raw.aircraft, routes);
    const settings = checkSettings(raw.settings);
    return {
      ok: true,
      profile: { version: PROFILE_VERSION, name, airfield, notes: notes.replace(UNSAFE_CHARS_KEEP_LINES, ''), seed, anchor: { lat: a.lat, lon: a.lon }, routes, aircraft, settings },
    };
  } catch (err) {
    if (err instanceof Refused) return { ok: false, problem: err.message };
    throw err;
  }
}

/**
 * The saved profiles from what the store holds (`{ version, profiles: [...] }`): the ones that pass, in order,
 * and one sentence for each that was skipped. A repeated name keeps the first.
 * @param {any} stored
 * @returns {{ profiles: any[], skipped: string[] }}
 */
export function readProfiles(stored) {
  if (stored === null || stored === undefined) return { profiles: [], skipped: [] };
  if (!plain(stored) || stored.version !== PROFILE_VERSION || !Array.isArray(stored.profiles)) {
    return { profiles: [], skipped: ["The saved profiles in this browser could not be read, so they were skipped."] };
  }
  const profiles = [];
  const skipped = [];
  for (const raw of stored.profiles.slice(0, MOST_SAVED * 2)) {
    const shown = plain(raw) && typeof raw.name === 'string' ? `"${cleanName(raw.name).slice(0, NAME_MAX)}"` : 'A profile';
    const result = checkProfile(raw);
    if (!result.ok) skipped.push(`${shown} was skipped: ${result.problem}.`);
    else if (profiles.some((p) => p.name === result.profile.name)) skipped.push(`${shown} was skipped: another profile has the same name.`);
    else if (profiles.length >= MOST_SAVED) skipped.push(`${shown} was skipped: only ${MOST_SAVED} profiles are kept.`);
    else profiles.push(result.profile);
  }
  if (stored.profiles.length > MOST_SAVED * 2) skipped.push('More profiles were saved than this page keeps, and the rest were skipped.');
  return { profiles, skipped };
}

// ── Making profiles ──────────────────────────────────────────────────────────

/** The settings V6's setup carries in its `view`, `routeOptions` and `conflictLimits`, under this page's names. */
export function settingsFromSetup(setup) {
  const out = {};
  const v = setup.view ?? {};
  const put = (key, value) => { if (value !== undefined) out[key] = value; };
  put('speed', v.playbackSpeed);
  put('layerTrails', v.showTrails);
  put('layerLabels', v.showLabels);
  put('layerPoints', v.showRoutePoints);
  put('layerLegDistances', v.showLegDistances);
  put('layerTurnData', v.showTurnData);
  put('layerBubbles', v.showBubbles);
  put('layerCautionRings', v.showCautionRings);
  const p = v.photo;
  if (p) {
    put('layerPhoto', p.show);
    put('photoAboveGrid', p.aboveGrid);
    put('photoOpacityPct', isNumber(p.opacity) ? Math.round(p.opacity * 100) : undefined);
    put('photoTrim', p.trim);
    put('photoEastFt', p.offsetEastFt);
    put('photoNorthFt', p.offsetNorthFt);
  }
  const o = setup.routeOptions ?? {};
  put('flyRoundedTurns', o.flyRoundedTurns);
  put('radiusFromG', o.radiusFromG);
  put('manualRadiusFt', o.manualRadiusFt);
  const c = setup.conflictLimits ?? {};
  put('conflictLatFt', c.latFt);
  put('conflictVertFt', c.vertFt);
  put('cautionLatFt', c.cautionLatFt);
  put('cautionVertFt', c.cautionVertFt);
  return out;
}

/** A built-in setup (the data files' shape) as a profile. It is checked like any other, so a data file that broke the rules would show at once. */
function builtIn(setup, name) {
  const result = checkProfile({
    version: PROFILE_VERSION, name, airfield: 'CYMJ', notes: setup.notes ?? '', seed: setup.seed ?? 1, anchor: setup.anchor,
    routes: setup.routes, aircraft: setup.aircraft, settings: settingsFromSetup(setup),
  });
  if (!result.ok) throw new Error(`the built-in setup ${name} is not a valid profile: ${result.problem}`);
  return Object.freeze(result.profile);
}

/** The setups that come with the page, read-only, in the order the list shows them. `id` is what "the last profile" remembers. */
export const BUILT_IN = Object.freeze([
  Object.freeze({ id: 'moose-jaw', name: 'Moose Jaw (built-in)', profile: builtIn(MOOSE_JAW, 'Moose Jaw (built-in)') }),
  Object.freeze({ id: 'moose-jaw-v6', name: 'Moose Jaw (V6 original)', profile: builtIn(MOOSE_JAW_V6, 'Moose Jaw (V6 original)') }),
]);

export const isBuiltInName = (name) => BUILT_IN.some((b) => b.name === cleanName(name));

/** A new setup at an airfield: V6's generic pattern (route.js `newPattern`), no aircraft, every setting at its start. */
export function newSetupAt({ icao, lat, lon }, name = 'Setup 1') {
  return { version: PROFILE_VERSION, name, airfield: icao, notes: '', seed: 1, anchor: { lat, lon }, routes: [newPattern('PAT1', 'Pattern 1')], aircraft: [], settings: {} };
}

/** "Setup 1", or the first "Setup N" that no name in the list uses (the spec's "New profile"). */
export function nextProfileName(names) {
  const used = new Set(names);
  for (let n = 1; ; n++) if (!used.has(`Setup ${n}`)) return `Setup ${n}`;
}

/**
 * What to save now: the setup's routes, the sim's aircraft, its seed, the notes and the settings, as a profile.
 * `settings` is the settings values (settings.get()); only the ones a profile keeps are taken. The result has not
 * been checked: call checkProfile on it before storing it.
 */
export function captureProfile({ name, airfield, notes, setup, aircraft, seed, settings }) {
  return {
    version: PROFILE_VERSION, name: cleanName(name), airfield, notes, seed, anchor: structuredClone(setup.anchor),
    routes: structuredClone(setup.routes), aircraft: structuredClone(aircraft),
    settings: Object.fromEntries(PROFILE_SETTING_KEYS.map((key) => [key, settings[key]])),
  };
}
