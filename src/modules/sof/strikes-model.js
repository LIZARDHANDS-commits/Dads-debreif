// NOAA's lightning strikes at every base, decided without a page, three.js or the network (SOF-71, SOF-R30; spec "Lightning strikes from NOAA at every base").
// strikes-feed.js asks NOAA's MRMS bucket for the NLDN one-minute files and keeps what it read (`held`, below); this file says what that means: which minutes were
// read, the near-home answer (lightning.js's check, unchanged rules, given the strikes as its cells), the status strip's words, the 2D marks and the 3D bolts.
// Pure: the clock comes in as `now`.
//
// `held` is the feed's view: { files: [{ key, time, strikes: [{ lat, lon, count }] }], newest (ms or null), refused: [{ key, time, reason }],
// failure (words or null), busy, rounds (updates finished for this home) }. `time` is each file's own time (its GRIB2 reference time, which matches its name), ms.
//
// The one rule that matters (S2): what was not read is never "no lightning". A missing minute, a failed or old read, or home and the radius reaching past NOAA's
// grid (north of 55° N) is "can't tell". A strike that was read is real, so it can always say "near" or "last strike".
//
// Numbers (V: measured on NOAA's files, 14 Oct 2026; G: an estimate, also said in the spec's as-built note):
// - a new file about each minute, its name's seconds 00 to 02, in the bucket 1 to 2 minutes later (V); 1 to 9 KB (V);
// - 30 minutes kept, 450 NM each way from home, the near-home window 10 minutes, a 2-minute refresh, 10-minute stale (spec; G);
// - the 2D marks full for 5 minutes, fainter to 15, faintest to 30 (spec; G for the strengths).
import { greatCircleNm } from '../../airfields/distance.js';
import { EARTH_RADIUS_M, FT_PER_NM } from '../../core/units.js';
import { feedAge, STALE_MS } from './feeds.js';
import { lightningNearHome, bearingDeg, compassWords, clampRadius } from './lightning.js';
import { MRMS_GRID, MRMS_NORTH_DEG, PRODUCTS, squareBounds, hhmmZ } from './mrms-model.js';

const MINUTE_MS = 60_000;
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/** The MRMS product the strikes come from (mrms-model.js). */
export const STRIKES_PRODUCT = PRODUCTS.strikes;
/** Strikes are kept this long, by each file's own time (spec: 30 minutes; G). */
export const KEEP_MINUTES = 30;
export const KEEP_MS = KEEP_MINUTES * MINUTE_MS;
/** The near-home check reads this many minute files, the newest back (spec: 10, ECCC's picture's window; G). */
export const NEAR_MINUTES = 10;
/** The first read takes up to this many files, newest first, so the near-home answer comes first (spec). */
export const FIRST_FILES = 30;
/** Strikes are kept in a square this far from home each way (spec: the 3D view's biggest square, 900 NM across; G). */
export const SQUARE_NM = 450;
/**
 * Half the diagonal of NOAA's 0.01° cell, NM, for lightning.js `cellHalfDiagonalNm`. At 20° N (the grid's south edge, its widest) a cell is 1.11 km north to south and
 * 1.05 km east to west: half the diagonal is 0.76 km, 0.41 NM; rounded up to 0.5 (standard geometry on WGS 84's 111.32 km a degree).
 */
export const STRIKE_CELL_HALF_DIAGONAL_NM = 0.5;
/** Most strikes kept in all (newest files first). A stormy minute over the whole square had about a thousand lit cells on 14 Oct 2026, so this is many times that. G. */
export const MAX_KEPT_STRIKES = 60_000;
/** A file over this is refused (files were 1 to 9 KB, V; the cap is far above it, G). */
export const MAX_STRIKE_FILE_BYTES = 256 * 1024;
/** How long one minute file may take (a few KB; the radar's files have 60 s). G. */
export const STRIKE_FILE_TIMEOUT_MS = 20_000;
/** The 2D marks' strength by age (spec: full to 5 minutes, fainter to 15, faintest to 30). The strengths are G. */
export const MARK_AGES = Object.freeze([
  Object.freeze({ toMin: 5, alpha: 1 }),
  Object.freeze({ toMin: 15, alpha: 0.55 }),
  Object.freeze({ toMin: 30, alpha: 0.3 }),
]);
/** Most crosses drawn on the 2D map at once, newest first (a picture, not a count). G. */
export const MAX_MARKS = 6000;
/** At a Canadian home, until Dad compares NOAA's strikes with ECCC's on a stormy day (spec). */
export const STRIKES_CANADA_WORDS = 'NOAA lightning over Canada: not yet checked against ECCC';
/** The credits line's words (spec: "names NOAA NLDN via MRMS"). */
export const STRIKES_CREDIT = 'lightning strikes: NOAA NLDN via MRMS';

const NM_PER_DEG = (Math.PI / 180) * (EARTH_RADIUS_M / 1852); // as airfields/distance.js
const NEAR_HOME_NM = 0.5; // as lightning.js: under this the words say "at home"

/** A file's minute: its own time to the nearest minute (names carry 00 to 02 seconds, V; nearest, so a file at :59 would still count for the minute it is for). */
export const minuteOf = (t) => Math.round(t / MINUTE_MS) * MINUTE_MS;

/** The square the strikes are kept in, for the worker (mrms-model.js `decodeFile` crops to it): { lat, lon, halfFt }. */
export const strikesTarget = (home) => Object.freeze({ lat: home.lat, lon: home.lon, halfFt: SQUARE_NM * FT_PER_NM });

/** NOAA's grid's edges in degrees (half a cell beyond its first and last points): 20 to 55° N, 130 to 60° W. */
export function gridEdges() {
  const { la1, lo1, ni, nj, di, dj } = MRMS_GRID;
  const west = lo1 - 360 - di / 2;
  return { north: MRMS_NORTH_DEG, south: la1 - (nj - 1) * dj - dj / 2, west, east: west + ni * di };
}

/**
 * What a strikes file read, as lightning.js's `coverage`: the kept square cut to NOAA's grid, { bounds: { west, south, east, north }, cellsRead } (the grid cells in
 * that box), or null when the square misses the grid. A square reaching north of 55° N is cut there, so a radius past it is "can't tell", never clear.
 */
export function strikesCoverage(home) {
  if (!home || !isNumber(home.lat) || !isNumber(home.lon)) return null;
  const sq = squareBounds(home.lat, home.lon, SQUARE_NM * FT_PER_NM);
  const g = gridEdges();
  const bounds = { west: Math.max(sq.west, g.west), south: Math.max(sq.south, g.south), east: Math.min(sq.east, g.east), north: Math.min(sq.north, g.north) };
  if (!(bounds.west < bounds.east && bounds.south < bounds.north)) return null;
  const cellsRead = Math.round((bounds.north - bounds.south) / MRMS_GRID.dj) * Math.round((bounds.east - bounds.west) / MRMS_GRID.di);
  return cellsRead > 0 ? { bounds, cellsRead } : null;
}

/** True when home plus the radius (and a strike cell's half-diagonal) lies on NOAA's grid: 20 to 55° N, 130 to 60° W. */
export function reachOnGrid(home, radiusNm) {
  if (!home || !isNumber(home.lat) || !isNumber(home.lon)) return false;
  const reach = clampRadius(radiusNm) + STRIKE_CELL_HALF_DIAGONAL_NM;
  const cosLat = Math.cos((home.lat * Math.PI) / 180);
  if (cosLat < 0.01) return false;
  const dLat = reach / NM_PER_DEG;
  const dLon = reach / (NM_PER_DEG * cosLat);
  const g = gridEdges();
  return home.lat + dLat <= g.north && home.lat - dLat >= g.south && home.lon - dLon >= g.west && home.lon + dLon <= g.east;
}

/**
 * Which of the last `minutes` minute files were read, counting back from the newest file read: { complete, newestMinute, fromMinute, missing: [minute ms] }. A minute
 * with no file read (never listed, refused, or not fetched yet) is missing. Nothing read: not complete, every minute missing (newestMinute null).
 */
export function minutesRead(held, minutes) {
  const files = Array.isArray(held?.files) ? held.files : [];
  if (!isNumber(held?.newest) || !files.length) return { complete: false, newestMinute: null, fromMinute: null, missing: Array.from({ length: minutes }, () => null) };
  const newestMinute = minuteOf(held.newest);
  const have = new Set(files.map((f) => minuteOf(f.time)));
  const missing = [];
  for (let m = 0; m < minutes; m++) {
    const at = newestMinute - m * MINUTE_MS;
    if (!have.has(at)) missing.push(at);
  }
  return { complete: missing.length === 0, newestMinute, fromMinute: newestMinute - (minutes - 1) * MINUTE_MS, missing };
}

/** The strikes of the files whose minute is `fromMinute` or later: [{ lat, lon, count, minute }], newest file first. */
export function strikesSince(held, fromMinute) {
  const out = [];
  const files = Array.isArray(held?.files) ? [...held.files].sort((a, b) => b.time - a.time) : [];
  for (const f of files) {
    const minute = minuteOf(f.time);
    if (fromMinute !== null && minute < fromMinute) continue;
    for (const s of f.strikes) out.push({ lat: s.lat, lon: s.lon, count: s.count, minute });
  }
  return out;
}

/** "minute 2312Z" or "minutes 2310Z, 2311Z and 2312Z", or "7 of the last 10 minute files" when there are more than three. */
function minutesWords(missing, of) {
  const times = missing.filter(isNumber).sort((a, b) => a - b).map(hhmmZ);
  if (times.length > 3) return `${times.length} of the last ${of} minute files`;
  if (times.length < 2) return `minute ${times[0] ?? ''}`.trim();
  return `minutes ${times.slice(0, -1).join(', ')} and ${times.at(-1)}`;
}

/** Is the newest file fresh (no more than STALE_MS.strikes old by its own time)? */
export const strikesFresh = (held, now) => isNumber(held?.newest) && feedAge({ kind: 'strikes', layerTime: held.newest, now }).state === 'fresh';

/**
 * The near-home check from NOAA's strikes (spec "Near home"): lightning.js `lightningNearHome` given the strikes of the last NEAR_MINUTES minute files as its cells
 * (value = the strike count), NOAA's cell size and the strikes' stale limit. It can say clear only when all of those minute files were read and home plus the radius
 * lies on NOAA's grid; otherwise lightning.js is given no coverage, so it can only say near or can't tell. The can't-tell words say why, in NOAA's terms.
 * Arguments as lightningNearHome (home, radiusNm, now, enabled, episode, clearHoldMs) plus `held`. Returns its answer with `source: 'noaa'` and `missing` (minutes).
 */
export function strikesNearHome({ held, home, radiusNm, now, enabled, episode, clearHoldMs } = /** @type {any} */ ({})) {
  const window = minutesRead(held, NEAR_MINUTES);
  const read = isNumber(held?.newest) && Array.isArray(held?.files) && held.files.length > 0;
  const onGrid = reachOnGrid(home, radiusNm);
  const samples = read ? strikesSince(held, window.fromMinute).map((s) => ({ lat: s.lat, lon: s.lon, value: s.count })) : null;
  const coverage = window.complete && onGrid ? strikesCoverage(home) ?? undefined : undefined;
  const r = lightningNearHome({
    samples, coverage, home, radiusNm, layerTime: read ? held.newest : undefined, now, enabled, episode, clearHoldMs,
    staleKind: 'strikes', cellHalfDiagonalNm: STRIKE_CELL_HALF_DIAGONAL_NM,
  });
  const out = { ...r, source: 'noaa', missing: window.missing };
  if (r.state !== 'unknown' || r.noSource) return out;
  // Can't tell: say why, in NOAA's terms (lightning.js's own words are kept for a missing clock or home).
  let why = null;
  if (!read) why = held?.failure ? `NOAA strikes unavailable (${held.failure})` : 'no NOAA strikes read yet';
  else if (isNumber(r.ageMin) && !strikesFresh(held, now)) why = `the newest NOAA strikes are ${r.ageMin} min old`;
  else if (/no time|unreadable|too many/.test(r.words)) why = null;
  else if (!onGrid) why = `home and the ${clampRadius(radiusNm)} NM radius reach past NOAA's grid (north of ${MRMS_NORTH_DEG}° N)`;
  else if (!window.complete) why = `NOAA ${minutesWords(window.missing, NEAR_MINUTES)} not read`;
  return why ? { ...out, words: `Can't tell: ${why}` } : out;
}

// ---- The status strip's words -----------------------------------------------------------------------------------------

/**
 * The feed's own line (spec "Lines", "When data fails"): { text, symbol, tone, stale }.
 * "Lightning strikes NOAA 2317Z (2 min ago) ✓"; with a refresh that failed but strikes still fresh, the same with "last refresh failed (reason)" ⚠; nothing fresh:
 * "Lightning strikes unavailable (NOAA: reason)" ⚠ (the strikes are then not drawn); before the first answer, "loading" ⟳.
 */
export function strikesLine(held, now) {
  const t = +now;
  if (!isNumber(held?.newest)) {
    if (held?.failure) return { text: `Lightning strikes unavailable (NOAA: ${held.failure})`, symbol: '⚠', tone: 'bad', stale: true };
    return { text: 'Lightning strikes NOAA loading', symbol: '⟳', tone: 'busy', stale: false };
  }
  const age = feedAge({ kind: 'strikes', layerTime: held.newest, now: t });
  if (age.state !== 'fresh') {
    const reason = held.failure ?? (age.state === 'unknown' ? 'newest file time is ahead of the clock' : `newest file ${hhmmZ(held.newest)} is ${age.ageMin} min old`);
    return { text: `Lightning strikes unavailable (NOAA: ${reason})`, symbol: '⚠', tone: 'bad', stale: true };
  }
  const head = `Lightning strikes NOAA ${hhmmZ(held.newest)} (${age.ageMin} min ago)`;
  if (held.failure) return { text: `${head}, last refresh failed (${held.failure})`, symbol: '⚠', tone: 'caution', stale: false };
  return { text: head, symbol: '✓', tone: 'ok', stale: false };
}

/** The newest file skipped for failing its checks, named (spec: "is skipped and named"): a line, or null. */
export function skippedLine(held) {
  const list = Array.isArray(held?.refused) ? held.refused : [];
  if (!list.length) return null;
  const last = [...list].sort((a, b) => b.time - a.time)[0];
  const more = list.length > 1 ? ` (${list.length} skipped in the last ${KEEP_MINUTES} min)` : '';
  return { text: `Lightning strikes: NOAA file ${hhmmZ(last.time)} skipped (${last.reason})${more}`, symbol: '⚠', tone: 'caution' };
}

/**
 * "about 14 NM north-east" from home to a place; "at home" under half a mile. Whole miles, but to a tenth within 2 NM of the radius, where a whole number would
 * mislead (as lightning.js's words).
 */
function whereWords(home, place, radius) {
  const nm = greatCircleNm(home, place);
  if (nm < NEAR_HOME_NM) return { nm, words: 'at home' };
  const miles = Math.abs(nm - radius) <= 2 ? Number(nm.toFixed(1)) : Math.round(nm);
  return { nm, words: `about ${miles} NM ${compassWords(bearingDeg(home, place)) ?? ''}`.trim() };
}

/**
 * The lines beside the near-home line (spec "Lines"; plan item 3, the start for the stop-work timers): [{ id, text, symbol, tone }].
 * - 'strikes-nearest': "Nearest strike about 14 NM north-east at 2312Z", of every strike kept (30 minutes, the square); none kept, no line.
 * - 'strikes-last': "Last strike within 20 NM 2308Z (12 min ago)"; or "No strike within 20 NM in the last 30 min" only when all of the last 30 minute files were
 *   read and home plus the radius is on NOAA's grid; otherwise it says it can't tell and why.
 * Nothing when the strikes are not fresh (they are not shown then: the feed line says why).
 */
export function strikeNearLines(held, { home, radiusNm, now }) {
  if (!strikesFresh(held, now) || !home || !isNumber(home.lat) || !isNumber(home.lon)) return [];
  const radius = clampRadius(radiusNm);
  const t = +now;
  const kept = strikesSince(held, null).filter((s) => t - s.minute <= KEEP_MS + MINUTE_MS);
  const out = [];
  let nearest = null;
  let last = null;
  for (const s of kept) {
    const nm = greatCircleNm(home, s);
    if (nearest === null || nm < nearest.nm) nearest = { nm, s };
    if (nm - STRIKE_CELL_HALF_DIAGONAL_NM <= radius && (last === null || s.minute > last.minute)) last = s;
  }
  if (nearest) {
    const inside = nearest.nm - STRIKE_CELL_HALF_DIAGONAL_NM <= radius;
    out.push({ id: 'strikes-nearest', text: `Nearest strike ${whereWords(home, nearest.s, radius).words} at ${hhmmZ(nearest.s.minute)}`, symbol: inside ? '⚠' : '', tone: inside ? 'caution' : 'ok' });
  }
  if (last) {
    const ago = Math.max(0, Math.floor((t - last.minute) / MINUTE_MS));
    out.push({ id: 'strikes-last', text: `Last strike within ${radius} NM ${hhmmZ(last.minute)} (${ago} min ago)`, symbol: '⚠', tone: 'caution' });
    return out;
  }
  const window = minutesRead(held, KEEP_MINUTES);
  if (!reachOnGrid(home, radius)) {
    out.push({ id: 'strikes-last', text: `Last strike within ${radius} NM: can't tell (past NOAA's grid, north of ${MRMS_NORTH_DEG}° N)`, symbol: '?', tone: 'busy' });
  } else if (!window.complete) {
    out.push({ id: 'strikes-last', text: `Last strike within ${radius} NM: can't tell (${KEEP_MINUTES - window.missing.length} of the last ${KEEP_MINUTES} minutes read)`, symbol: '?', tone: 'busy' });
  } else {
    out.push({ id: 'strikes-last', text: `No strike within ${radius} NM in the last ${KEEP_MINUTES} min`, symbol: '✓', tone: 'ok' });
  }
  return out;
}

// ---- Drawing data -----------------------------------------------------------------------------------------------------

/** A strike's mark strength by its age in minutes (MARK_AGES), or 0 past the last. */
export function markAlpha(ageMin) {
  for (const step of MARK_AGES) if (ageMin <= step.toMin) return step.alpha;
  return 0;
}

/**
 * The 2D map's crosses (spec "2D map"): [{ lat, lon, count, alpha }], oldest first so the newest are drawn on top, at most MAX_MARKS (the newest kept). Nothing when
 * the strikes are not fresh ("a failed listing or file keeps the strikes already read until the newest is 10 minutes old, then they go").
 */
export function strikeMarks(held, now) {
  if (!strikesFresh(held, now)) return [];
  const t = +now;
  const out = [];
  for (const s of strikesSince(held, null)) {
    if (out.length >= MAX_MARKS) break;
    const alpha = markAlpha(Math.max(0, (t - s.minute) / MINUTE_MS));
    if (alpha > 0) out.push({ lat: s.lat, lon: s.lon, count: s.count, alpha });
  }
  return out.reverse();
}

/**
 * The 3D bolts' places (spec "3D": a bolt for each strike of the last 10 minutes): the strikes of the last NEAR_MINUTES minutes by the clock, as weather3d-model.js
 * `bolts` cells { x, y, u, v } in the map's local feet (`toXY(lat, lon)` gives [x, y]) inside the square `areaFt` across. Nothing when the strikes are not fresh.
 */
export function strikeBoltCells(held, now, { toXY, areaFt }) {
  if (!strikesFresh(held, now)) return [];
  const t = +now;
  const half = areaFt / 2;
  const out = [];
  for (const s of strikesSince(held, null)) {
    if (t - s.minute > NEAR_MINUTES * MINUTE_MS) continue;
    const [x, y] = toXY(s.lat, s.lon);
    if (Math.abs(x) > half || Math.abs(y) > half) continue;
    out.push({ x, y, u: x / areaFt + 0.5, v: y / areaFt + 0.5 });
  }
  return out;
}

/** How old the strikes' stale limit is, in minutes, for words. */
export const STRIKES_STALE_MIN = STALE_MS.strikes / MINUTE_MS;
