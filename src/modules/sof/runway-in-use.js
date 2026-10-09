// The runway in use at each field, from its latest METAR wind, and which approaches follow it (plan item "Approaches for the runway in use"; Dad, 8 Oct
// 2026: "The runway in use should load the directional approaches. if possible based on winds etc"; SOF-47, Dad decides SOF calls). Pure: the wind, the
// runways and the choice go in, plain data and words come out. view3d.js draws only the approaches it keeps (and checks only their corridors), map.js
// does the same for the 2D final courses and the cards' line.
//
// How the runway in use is chosen:
// - The runway end with the most headwind from the METAR's mean wind (gusts never change the choice). The headwind is crosswind.js's `runwayWind`
//   (core/wind.js: headwind = W × cos(D − T)), true wind against true runway headings as crosswind.js compares them (a METAR's wind is degrees true;
//   airports-data.js's headings are OurAirports' true headings), never a second copy of the formula.
// - Ends within RUNWAY_IN_USE.tieKt of the most headwind are kept too (both directions when the wind is across the runways), and every end with the same
//   number as a kept one (parallel runways, 13L/13C/13R) is in use with it.
// - A calm wind, a light wind (under RUNWAY_IN_USE.lightKt), a variable wind with no direction, a wind not reported, no METAR, or a stale one (the cards'
//   staleness rule: the card's METAR line is anything but 'fresh') choose nothing: all runway ends are kept and the words say why.
// Information only: nothing here raises a caution, and the SOF can always choose "All runways" or a runway by hand in the Approaches key.
import { runwayEnds, runwayWind } from './crosswind.js';
import { AIRPORTS } from './airports-data.js';

/**
 * lightKt: under this mean wind no runway is chosen (an estimate, not from a source: a wind this light hardly favours a direction).
 * tieKt: ends with headwinds within this much of the most are all kept (an estimate: about what a METAR's whole degrees and knots can tell apart).
 */
export const RUNWAY_IN_USE = Object.freeze({ lightKt: 5, tieKt: 2 });

/** The choices the Approaches key offers for every field: the runway in use by the wind (the default) or all runways. A runway chosen by hand for one field overrides it. */
export const RUNWAY_MODES = Object.freeze([
  Object.freeze({ value: 'wind', label: 'Runway in use (by wind)' }),
  Object.freeze({ value: 'all', label: 'All runways' }),
]);

/** A runway end's number without its parallel letter: "13L" → "13". */
const numberOf = (end) => String(end).toUpperCase().replace(/[LCR]$/, '');
/** Two runway names for the same end, with or without a leading zero ("4" and "04"). */
export const sameEnd = (a, b) => String(a).toUpperCase().replace(/^0+(?=\d)/, '') === String(b).toUpperCase().replace(/^0+(?=\d)/, '');
const deg3 = (d) => String(Math.round(d)).padStart(3, '0');
const kt = (v) => Math.round(Math.abs(v));
const andList = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0] ?? '');

/**
 * One field's runway in use: { icao, status, byWind, ends: every end's name, inUse: the ends in use (every end when none is chosen), label ("13", "13 and
 * 22", or null), headwinds: [{ number, headwindKt }] for the numbers in use, windWords, words }.
 * status: 'wind' (chosen from the wind), 'calm', 'light', 'vrb', 'unknown' (no speed reported), 'none' (no METAR), 'old' (stale) or 'no-runways'.
 * `metar` is the card's METAR line (cards.js; its `state`: 'fresh', 'stale', 'closed', 'missing' or 'nil'), `wind` the METAR's `conditions.wind`.
 */
export function runwayInUse({ icao, metar = null, wind = null, airports = AIRPORTS }) {
  const ends = runwayEnds(airports.find((a) => a.icao === icao));
  const names = ends.map((e) => e.name);
  const base = { icao, byWind: false, ends: names, inUse: names, label: null, headwinds: [], windWords: null };
  const all = (status, why) => ({ ...base, status, words: `${why}: all runways shown` });
  if (!ends.length) return { ...base, status: 'no-runways', words: 'No runways in our data' };
  if (!metar || metar.state === 'missing' || metar.state === 'nil') return all('none', 'No METAR');
  if (metar.state !== 'fresh') return all('old', 'Old METAR (stale), no wind to choose by');
  if (!wind || !Number.isFinite(wind.speedKt)) return all('unknown', 'Wind not reported');
  const gust = Number.isFinite(wind.gustKt) && wind.gustKt > wind.speedKt ? ` gusting ${wind.gustKt}` : '';
  if (wind.speedKt === 0) return all('calm', 'Wind calm');
  if (wind.variable || !Number.isFinite(wind.dirDeg)) return { ...all('vrb', `Wind variable (VRB ${wind.speedKt} kt${gust})`), windWords: `VRB ${wind.speedKt} kt${gust}` };
  const windWords = `${deg3(wind.dirDeg)}° true ${wind.speedKt} kt${gust}`;
  if (wind.speedKt < RUNWAY_IN_USE.lightKt) return { ...all('light', `Wind light (${windWords}, under ${RUNWAY_IN_USE.lightKt} kt, an estimate)`), windWords };
  // The mean wind only: a gust never changes the runway in use.
  const list = ends.map((e) => ({ ...e, headwindKt: runwayWind(e.headingTrue, { dirDeg: wind.dirDeg, speedKt: wind.speedKt }).headwindKt }));
  const best = Math.max(...list.map((e) => e.headwindKt));
  const numbers = [];
  for (const e of [...list].sort((a, b) => b.headwindKt - a.headwindKt)) {
    if (e.headwindKt < best - RUNWAY_IN_USE.tieKt) break;
    if (!numbers.includes(numberOf(e.name))) numbers.push(numberOf(e.name));
  }
  const inUse = list.filter((e) => numbers.includes(numberOf(e.name)));
  const headwinds = numbers.map((n) => ({ number: n, headwindKt: Math.max(...inUse.filter((e) => numberOf(e.name) === n).map((e) => e.headwindKt)) }));
  const label = andList(numbers);
  const headWords = headwinds.map((x) => (x.headwindKt < 0 ? `${kt(x.headwindKt)} kt tailwind` : `${kt(x.headwindKt)} kt headwind`));
  const words = numbers.length > 1
    ? `Runways in use ${label} (wind ${windWords}: ${headWords.join(' and ')}; within ${RUNWAY_IN_USE.tieKt} kt of each other, an estimate, so each is kept)`
    : `Runway in use ${label} (wind ${windWords}: ${headWords[0]})`;
  return { ...base, status: 'wind', byWind: true, inUse: inUse.map((e) => e.name), label, headwinds, windWords, words };
}

/**
 * What is shown for one field: { mode: 'wind' | 'all' | 'manual', ends: the ends whose approaches are kept, or null for all of them, label (for "Approaches
 * to 13"), words }. `runway` is runwayInUse's; `mode` the key's choice ('wind' or 'all'); `manualEnd` a runway end chosen by hand for this field (it overrides
 * the mode; one not among the field's ends is ignored).
 */
export function runwaysShown({ runway, mode = 'wind', manualEnd = null }) {
  const manual = manualEnd ? runway.ends.find((e) => sameEnd(e, manualEnd)) : null;
  if (manual) {
    const wind = runway.byWind ? `by the wind it would be ${runway.label}` : runway.words.replace(/: all runways shown$/, '').replace(/^\w/, (c) => c.toLowerCase());
    return { mode: 'manual', ends: [manual], label: manual, words: `Runway ${manual} (chosen by hand in the Approaches key; ${wind})` };
  }
  if (mode === 'all') return { mode: 'all', ends: null, label: null, words: 'All runways shown (chosen in the Approaches key)' };
  return { mode: 'wind', ends: runway.byWind ? runway.inUse : null, label: runway.byWind ? runway.label : null, words: runway.words };
}

/**
 * Whether an approach is kept for what is shown: every approach when all ends are shown; a circling approach (no runway) always, since it serves any runway;
 * one to a runway our runway data does not have, always (it can't be placed, so it is not hidden); otherwise only one to an end that is shown.
 */
export function approachKept(approach, shown, fieldEnds) {
  if (!shown.ends || !approach.rwy) return true;
  if (!fieldEnds.some((e) => sameEnd(e, approach.rwy))) return true;
  return shown.ends.some((e) => sameEnd(e, approach.rwy));
}

/**
 * The fields to draw and check, keeping only the approaches to the runways shown: each of approaches-model.js `fieldApproaches` entries with `approaches`
 * filtered and { allCount, runway (runwayInUse's), shown (runwaysShown's), line } added. `runways` is a Map icao -> runwayInUse result (a field missing from it
 * has no METAR); `mode` 'wind' or 'all'; `manual` { ICAO: end } chosen by hand. `line` is the words for the key and the card: "Runway in use 13 (wind 160° true
 * 12 kt: 11 kt headwind) — ILS or LOC RWY 13R, RNAV (GPS) Y RWY 13R".
 */
export function fieldsForRunways({ fields, runways = new Map(), mode = 'wind', manual = {}, airports = AIRPORTS }) {
  return fields.map((f) => {
    const runway = runways.get(f.icao) ?? runwayInUse({ icao: f.icao, airports });
    const shown = runwaysShown({ runway, mode, manualEnd: manual?.[f.icao] ?? null });
    const approaches = f.approaches.filter((a) => approachKept(a, shown, runway.ends));
    const names = approaches.map((a) => a.name);
    const line = shown.ends ? `${shown.words} — ${names.length ? names.join(', ') : `no ${f.source === 'cifp' ? 'published approach' : 'approach'} to it in our data`}` : shown.words;
    return { ...f, approaches, allCount: f.approaches.length, runway, shown, line };
  });
}

/** A short signature of what is shown for these fields (and its words), so a view builds again only when a runway in use or its wind words change. */
export const shownSignature = (list) => list.map((f) => `${f.icao}:${f.shown.mode}:${f.shown.ends ? f.shown.ends.join('/') : '*'}:${f.shown.words}`).join(',');
