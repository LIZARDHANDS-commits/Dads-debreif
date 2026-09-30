// Lightning near the home field, decided in Node (SPEC-sof, SOF-3, "Lightning"
// and the Layers menu). The map code (task 6) reads ECCC's 10-minute
// Lightning_2.5km_Density image into a list of cells `{ lat, lon, value }`, the
// centre of each 2.5 km cell that has lightning and its density, and this
// module says whether any is within the radius of home, how far and which way
// in words, and gives a caution the banner can show, in cautions.js's shape.
// Pure: no network, no timers, no DOM; the clock comes in as `now`.
//
// What the caller reads: not the map view's image, but a fixed box around home, at least the
// biggest radius (50 NM) plus a cell each way, at ECCC's native 2.5 km grid, so the answer is the
// same whatever the map is showing. It passes the cells that have lightning as `samples` and the
// box and how many cells it read as `coverage`; without coverage of home plus the radius nothing
// can be called clear.
//
// It is an estimate on a grid, not individual strikes, so the words say
// "about". Distance is to the cell's centre, to 0.1 NM.
//
// The one rule that matters: data that can't be read, or is stale, never says
// "no lightning". It says it can't tell, raises nothing, and leaves an episode
// that is open as it was.
//
// An episode is one spell of lightning near home. The caution's key holds the
// episode's first minute, so the same lightning is the same caution on every
// refresh (an acknowledgement holds), and lightning that comes back after a
// clear is a new episode with a new key. The caller keeps the `episode` object
// this returns and passes it back on the next refresh.

import { CATALOG, DEFAULT_HOME } from '../../airfields/catalog.js';
import { greatCircleNm } from '../../airfields/distance.js';
import { EARTH_RADIUS_M } from '../../core/units.js';
import { feedAge } from './feeds.js';

/**
 * SOF-3's answers: on, 20 NM (V6's `lightningNm`), 5 to 50 NM. `clearHoldMs` is how long
 * a clear reading waits before the episode is over: 0 by default, so the first clear
 * reading ends it; set it to ride out lightning flickering at the edge of the radius.
 */
export const LIGHTNING_DEFAULTS = Object.freeze({
  enabled: true,
  radiusNm: 20,
  minRadiusNm: 5,
  maxRadiusNm: 50,
  clearHoldMs: 0,
});

/** The most cells looked at. A real answer has a few hundred; more than this can't be called "clear". */
export const MAX_CELLS = 50_000;

const CELL_HALF_DIAGONAL_NM = 1; // half the diagonal of ECCC's 2.5 km cell: 1.77 km, 0.96 NM, rounded up
const EPISODE_MAX_GAP_MS = 30 * 60_000; // an episode not seen near for this long (or clearHoldMs, if longer) is over
const NEAR_HOME_NM = 0.5; // under this the words say "at home" rather than a distance and a bearing
const EPISODE_ID = /^\d{4}-\d\d-\d\dT\d\d:\d\dZ$/;
const ICAO = /^[A-Z0-9]{4}$/;
const POINTS = Object.freeze(['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']);

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const validPlace = (p) => isObject(p) && isNumber(p.lat) && isNumber(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
const ms = (t) => (t instanceof Date ? +t : t);

/** The radius kept within 5 to 50 NM; anything that isn't a number is the default, 20. */
export function clampRadius(radiusNm) {
  if (!isNumber(radiusNm)) return LIGHTNING_DEFAULTS.radiusNm;
  return Math.min(LIGHTNING_DEFAULTS.maxRadiusNm, Math.max(LIGHTNING_DEFAULTS.minRadiusNm, radiusNm));
}

/**
 * Compass bearing from one { lat, lon } point to another, whole degrees 0 to 359 (0 north,
 * 90 east), or null if either isn't a real position or they are the same point.
 * (core has no bearing helper; distance is airfields/distance.js's greatCircleNm.)
 */
export function bearingDeg(from, to) {
  if (!validPlace(from) || !validPlace(to) || (from.lat === to.lat && from.lon === to.lon)) return null;
  const rad = Math.PI / 180;
  const dLon = (to.lon - from.lon) * rad;
  const y = Math.sin(dLon) * Math.cos(to.lat * rad);
  const x = Math.cos(from.lat * rad) * Math.sin(to.lat * rad) - Math.sin(from.lat * rad) * Math.cos(to.lat * rad) * Math.cos(dLon);
  const deg = Math.round(Math.atan2(y, x) / rad);
  return ((deg % 360) + 360) % 360;
}

/** A bearing in degrees as one of eight words, "north-east"; null if it isn't a number. */
export function compassWords(deg) {
  return isNumber(deg) ? POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8] : null;
}

const isoMinute = (t) => `${new Date(t).toISOString().slice(0, 16)}Z`;

/** A stored episode checked for shape; anything wrong is no episode. */
function readEpisode(e) {
  return isObject(e) && typeof e.id === 'string' && EPISODE_ID.test(e.id) && isNumber(e.lastNearAt) ? { id: e.id, lastNearAt: e.lastNearAt } : null;
}

/** The caution, in the shape cautions.js gives every caution (`make`), for the banner. */
function cautionOf({ icao, episode, words, layerTime }) {
  const detail = words.slice('Lightning '.length);
  return {
    key: `${icao}|LIGHTNING|${episode.id}`,
    icao,
    source: 'LIGHTNING',
    level: 'caution',
    levelWords: 'Caution',
    group: null,
    from: layerTime instanceof Date ? layerTime : new Date(layerTime),
    to: null,
    reason: words,
    stale: false,
    raw: null,
    spans: [],
    text: `Caution: ${icao} lightning: ${detail}`,
    acknowledged: false,
  };
}

/** Miles for the words: whole, but to a tenth when within 2 NM of the radius (1 NM past the edge cell's reach), where a whole number would mislead. */
const nmWords = (nm, radius) => String(Math.abs(nm - radius) <= 2 ? Number(nm.toFixed(1)) : Math.round(nm));

const NM_PER_DEG = (Math.PI / 180) * (EARTH_RADIUS_M / 1852); // as airfields/distance.js

/**
 * Did the caller read all of the area that matters: `coverage` is `{ bounds: { west, south,
 * east, north }, cellsRead }` (degrees; cells read in that box, including cells with none),
 * and the box must hold home plus the radius plus an edge cell. No box, a bad one, or no
 * cells read is "no".
 */
function covers(coverage, home, radius) {
  const b = isObject(coverage) ? coverage.bounds : null;
  if (!isObject(b) || ![b.west, b.south, b.east, b.north].every(isNumber)) return false;
  if (!Number.isInteger(coverage.cellsRead) || coverage.cellsRead <= 0) return false;
  if (b.west >= b.east || b.south >= b.north || b.west < -180 || b.east > 180 || b.south < -90 || b.north > 90) return false;
  const reach = radius + CELL_HALF_DIAGONAL_NM;
  const cosLat = Math.cos((home.lat * Math.PI) / 180);
  if (cosLat < 0.01) return false;
  const dLat = reach / NM_PER_DEG;
  const dLon = reach / (NM_PER_DEG * cosLat);
  return home.lat - dLat >= b.south && home.lat + dLat <= b.north && home.lon - dLon >= b.west && home.lon + dLon <= b.east;
}

/**
 * Is there lightning within the radius of home?
 *
 * - `samples`: `[{ lat, lon, value }]`, the cells that have lightning (value above 0; a cell
 *   with 0 or less is ignored). Left out or not a list, it can't tell. Any unreadable entry
 *   stops it saying clear (it can still say near).
 * - `coverage`: `{ bounds: { west, south, east, north }, cellsRead }`, the box the caller read (degrees)
 *   and how many cells it read in it, cells with no lightning included. "Clear" needs a box that
 *   holds home plus the radius plus an edge cell; without it the answer is "can't tell", even for
 *   an empty list. Lightning found needs no coverage.
 * - `home`: `{ icao, lat, lon }`, default CYMJ.
 * - `radiusNm`: default 20, kept within 5 to 50.
 * - `layerTime`: the lightning layer's own time, a Date or ms (from ECCC's layer time,
 *   not when it was fetched). `now`: the clock. Stale after 30 min by feeds.js `feedAge`.
 * - `enabled`: default true (SOF-3); false says nothing and raises nothing.
 * - `episode`: what the last call returned, so the same lightning keeps the same key.
 * - `clearHoldMs`: see LIGHTNING_DEFAULTS.
 *
 * Returns `{ state, near, radiusNm, nearestNm, bearingDeg, bearingWords, cells, ageMin, words,
 * caution, episode }`. `state` is 'near', 'clear', 'unknown' (can't tell; `near` is null)
 * or 'off'. `nearestNm` and the bearing are of the nearest cell anywhere in the list, so a
 * clear answer can still say where the nearest lightning is; `cells` is how many are within
 * the radius, counting a cell whose centre is up to half its diagonal (1 NM) beyond it. `caution` is set only when `state` is 'near'. Never throws.
 */
export function lightningNearHome(args = {}) {
  const {
    samples, coverage, home = { icao: DEFAULT_HOME, ...CATALOG[DEFAULT_HOME] }, radiusNm, layerTime, now,
    enabled = LIGHTNING_DEFAULTS.enabled, episode, clearHoldMs = LIGHTNING_DEFAULTS.clearHoldMs,
  } = isObject(args) ? args : {};
  const radius = clampRadius(radiusNm);
  const base = { near: null, radiusNm: radius, nearestNm: null, bearingDeg: null, bearingWords: null, cells: 0, ageMin: null, caution: null };
  if (enabled === false) return { ...base, state: 'off', words: 'Lightning check is off', episode: null };

  const clock = ms(now);
  // An episode not seen near for longer than this is over, however long the data couldn't tell:
  // a storm after a long outage is a new one.
  const maxGap = Math.max(isNumber(clearHoldMs) ? clearHoldMs : 0, EPISODE_MAX_GAP_MS);
  const stored = readEpisode(episode);
  const held = stored && isNumber(clock) && clock - stored.lastNearAt <= maxGap ? stored : null;
  const cannot = (why, ageMin = null) => ({ ...base, state: 'unknown', ageMin, words: `Can't tell: ${why}`, episode: held });
  if (!isNumber(clock)) return cannot('no clock');
  if (!validPlace(home)) return cannot('no position for the home field');
  if (!Array.isArray(samples)) return cannot('no lightning data');

  const age = feedAge({ kind: 'lightning', layerTime, now: clock });
  if (age.state === 'unknown') return cannot('no time for the lightning data');
  if (age.stale) return cannot(`lightning data is ${age.ageMin} min old`, age.ageMin);

  const scanned = Math.min(samples.length, MAX_CELLS);
  let readable = 0;
  let cells = 0;
  let nearest = null;
  for (let i = 0; i < scanned; i++) {
    const s = samples[i];
    if (!validPlace(s) || !isNumber(s.value)) continue;
    readable++;
    if (s.value <= 0) continue;
    const nm = greatCircleNm(home, s);
    // A cell is 2.5 km square: one whose centre is up to half its diagonal beyond the radius is partly inside.
    if (nm - CELL_HALF_DIAGONAL_NM <= radius) cells++;
    if (nearest === null || nm < nearest.nm) nearest = { nm, at: s };
  }
  const near = cells > 0;
  // Only lightning can be shown from part of the data; "clear" needs all of it, and proof the area was read.
  if (!near) {
    if (scanned > 0 && readable === 0) return cannot('lightning data unreadable', age.ageMin);
    if (readable < scanned) return cannot('some lightning readings unreadable', age.ageMin);
    if (samples.length > MAX_CELLS) return cannot('too many lightning readings to check', age.ageMin);
    if (!covers(coverage, home, radius)) return cannot('the area read does not cover home and the radius', age.ageMin);
  }

  const bearing = nearest ? bearingDeg(home, nearest.at) : null;
  const where = bearing === null ? null : compassWords(bearing);
  const result = { ...base, near, radiusNm: radius, nearestNm: nearest?.nm ?? null, bearingDeg: bearing, bearingWords: where, cells, ageMin: age.ageMin };
  const label = String(radius);

  if (!near) {
    const holding = held && isNumber(clearHoldMs) && clearHoldMs > 0 && clock - held.lastNearAt < clearHoldMs;
    const nearestWords = nearest ? ` (nearest about ${nmWords(nearest.nm, radius)} NM ${where})` : '';
    return { ...result, state: 'clear', words: `No lightning within ${label} NM of home${nearestWords}`, episode: holding ? held : null };
  }

  const words = nearest.nm < NEAR_HOME_NM
    ? `Lightning at home, within ${label} NM`
    : `Lightning about ${nmWords(nearest.nm, radius)} NM ${where} of home, ${nearest.nm > radius ? `at the edge of the ${label} NM radius` : `within ${label} NM`}`;
  const next = { id: held?.id ?? isoMinute(clock), lastNearAt: clock };
  const icao = typeof home.icao === 'string' && ICAO.test(home.icao) ? home.icao : DEFAULT_HOME;
  return { ...result, state: 'near', words, episode: next, caution: cautionOf({ icao, episode: next, words, layerTime }) };
}
