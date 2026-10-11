// The crosswind check per runway (plan Step 2b item 6; decision SOF-43; requirement SOF-R27): for each airfield with runways in AIRPORTS, the
// headwind and crosswind on every runway end from the latest METAR wind, the favoured end, and the amber and red levels. Pure: the wind, the
// runways and the settings go in, plain data comes out. The card (cards-view.js) only draws it; the banner gets a caution only for red on every
// runway end at home.
//
// True with true: a METAR (Canadian or US) gives the wind direction in degrees true, and AIRPORTS gives each runway end's heading in degrees true
// (OurAirports; the US bases and their usual alternates since plan Step 2c part D), so the two are compared as they are, never converted. The screen names runways by their numbers and says the wind is true.
//
// The components are core/wind.js's `windTriangle` (crosswind = W × sin(D − T), + from the right; headwind = W × cos(D − T), − a tailwind); this file
// never writes the formula again.
//
// Levels (SOF-R27, SOF-43): amber when the crosswind is over 15 kt on a dry runway, 10 kt wet or 5 kt icy; red over 25 kt dry. Each is an editable
// SOF setting: references, not walls. The check uses the gust when one is reported ("gusting"); a variable (VRB) wind counts its full speed as
// crosswind on every runway (the worst case); a direction varying between two bearings ("250V310") counts the worst crosswind across that arc.
import { windTriangle } from '../../core/wind.js';
import { AIRPORTS } from '../../airfields/airports-data.js';
import { notSetWords } from './limits-not-set.js';

/** No level is ever passed: the levels a base with no weather limits checks against (`crosswindFor`'s `levels: false`). */
const NO_LEVELS = Object.freeze({ xwAmberDryKt: Infinity, xwAmberWetKt: Infinity, xwAmberIcyKt: Infinity, xwRedDryKt: Infinity });

/** The runway states the setting offers, and what each says. */
export const RUNWAY_STATES = Object.freeze([
  Object.freeze({ value: 'dry', label: 'Dry' }),
  Object.freeze({ value: 'wet', label: 'Wet' }),
  Object.freeze({ value: 'icy', label: 'Icy' }),
]);

/** The levels in knots (SOF-R27: Patrick, 4 Oct 00:56Z, SOF-Q15; SOF-43) and the runway state (Dry to begin with). */
export const CROSSWIND_DEFAULTS = Object.freeze({ xwAmberDryKt: 15, xwAmberWetKt: 10, xwAmberIcyKt: 5, xwRedDryKt: 25, runwayState: 'dry' });

/** Where the levels come from, for the settings' hint. */
export const CROSSWIND_SOURCE = 'SOF-R27: Patrick, 4 Oct 00:56Z (SOF-Q15), from the 2 CFTS orders’ formation crosswind by runway state; brought back by SOF-43 (Dad, 7 Oct).';

const AMBER_KEY = { dry: 'xwAmberDryKt', wet: 'xwAmberWetKt', icy: 'xwAmberIcyKt' };
const STATE_WORDS = { dry: 'dry', wet: 'wet', icy: 'icy' };

/** Precipitation in a METAR that may wet the runway (the hint never changes the setting). */
const WET = new Set(['DZ', 'RA', 'SN', 'SG', 'PL', 'GR', 'GS', 'IC', 'UP']);

/**
 * Headwind and crosswind on one runway end: { headwindKt (+ head, − tail), crosswindKt (+ from the right, − from the left) }, from core/wind.js.
 * `headingTrueDeg` is the end's heading and `dirDeg` where the wind blows from, both degrees true; `speedKt` the wind speed.
 */
export function runwayWind(headingTrueDeg, { dirDeg, speedKt }) {
  // windTriangle works the two components out before it looks at the airspeed, so any airspeed does; 0 is passed and only the components are read.
  const { headwindKt, crosswindKt } = windTriangle(headingTrueDeg, 0, dirDeg, speedKt);
  return { headwindKt, crosswindKt };
}

/** Every runway end of an airport in AIRPORTS: [{ name: '29R', headingTrue }]. */
export function runwayEnds(airport) {
  const out = [];
  for (const r of airport?.runways ?? []) {
    const [na, nb] = Array.isArray(r.ends) ? r.ends : [];
    if (na && Number.isFinite(r.a?.headingTrue)) out.push({ name: na, headingTrue: r.a.headingTrue });
    if (nb && Number.isFinite(r.b?.headingTrue)) out.push({ name: nb, headingTrue: r.b.headingTrue });
  }
  return out;
}

/** The amber level for the runway state, and the red level. */
export function levelsFor(settings) {
  const s = { ...CROSSWIND_DEFAULTS, ...(settings ?? {}) };
  const state = AMBER_KEY[s.runwayState] ? s.runwayState : 'dry';
  return { state, amberKt: s[AMBER_KEY[state]], redKt: s.xwRedDryKt };
}

/** The largest |sin(D − T)| for a wind direction anywhere from `fromDeg` clockwise to `toDeg`: the worst crosswind share across a varying wind. */
function worstShare(headingTrueDeg, fromDeg, toDeg) {
  const span = (((toDeg - fromDeg) % 360) + 360) % 360;
  let worst = 0;
  for (let k = 0; k <= span; k += 1) worst = Math.max(worst, Math.abs(runwayWind(headingTrueDeg, { dirDeg: fromDeg + k, speedKt: 1 }).crosswindKt));
  return worst;
}

const LEVEL_RANK = { ok: 0, amber: 1, red: 2 };

/**
 * The check for one airfield's runway ends and one METAR wind (src/wx's `conditions.wind`: { dirDeg, variable, speedKt, gustKt, varyingDeg }).
 * Returns { status: 'ok' | 'calm' | 'vrb' | 'unknown', gusting, checkKt, ends: [{ name, headingTrue, headwindKt, crosswindKt, checkCrossKt, side, level }],
 * favoured (an end's name, or null), allRed }.
 * - headwindKt and crosswindKt are the steady wind's; checkCrossKt is the crosswind the levels are checked with (the gust's when reported, the worst
 *   across a varying arc, the full speed for VRB); side is 'left', 'right' or null (straight down the runway, or VRB).
 * - favoured: the end with the most headwind among those under the amber level, or, when every end is over it, the one with the least crosswind.
 *   None for calm, VRB or an unknown wind.
 */
export function crosswindCheck({ wind, ends, settings }) {
  const { amberKt, redKt } = levelsFor(settings);
  // Checked on the whole knot the card shows (a METAR wind is in whole knots), so "15 kt" never reads as over a 15 kt level.
  const level = (kt) => (Math.round(kt) > redKt ? 'red' : Math.round(kt) > amberKt ? 'amber' : 'ok');
  if (!wind || !Number.isFinite(wind.speedKt)) return { status: 'unknown', gusting: false, checkKt: null, ends: [], favoured: null, allRed: false };
  const gusting = Number.isFinite(wind.gustKt) && wind.gustKt > wind.speedKt;
  const checkKt = gusting ? wind.gustKt : wind.speedKt;
  if (checkKt === 0) {
    return { status: 'calm', gusting: false, checkKt: 0, ends: ends.map((e) => ({ ...e, headwindKt: 0, crosswindKt: 0, checkCrossKt: 0, side: null, level: 'ok' })), favoured: null, allRed: false };
  }
  if (wind.variable || !Number.isFinite(wind.dirDeg)) {
    // VRB: the wind may come from anywhere, so its full speed is the crosswind on every runway (the worst case).
    const list = ends.map((e) => ({ ...e, headwindKt: null, crosswindKt: null, checkCrossKt: checkKt, side: null, level: level(checkKt) }));
    return { status: 'vrb', gusting, checkKt, ends: list, favoured: null, allRed: list.length > 0 && list.every((e) => e.level === 'red') };
  }
  const varying = Array.isArray(wind.varyingDeg) && wind.varyingDeg.length === 2 ? wind.varyingDeg : null;
  const list = ends.map((e) => {
    const { headwindKt, crosswindKt } = runwayWind(e.headingTrue, { dirDeg: wind.dirDeg, speedKt: wind.speedKt });
    const steadyShare = Math.abs(runwayWind(e.headingTrue, { dirDeg: wind.dirDeg, speedKt: 1 }).crosswindKt);
    const share = varying ? Math.max(steadyShare, worstShare(e.headingTrue, varying[0], varying[1])) : steadyShare;
    const checkCrossKt = checkKt * share;
    const side = Math.round(crosswindKt) === 0 ? null : crosswindKt > 0 ? 'right' : 'left';
    return { ...e, headwindKt, crosswindKt, checkCrossKt, side, level: level(checkCrossKt) };
  });
  const under = list.filter((e) => e.level === 'ok');
  const pick = under.length
    ? under.reduce((best, e) => (e.headwindKt > best.headwindKt ? e : best))
    // Crosswinds within half a knot are the same (the two ends of one runway always are): the one with more headwind is favoured.
    : list.reduce((best, e) => (e.checkCrossKt < best.checkCrossKt - 0.5 || (Math.abs(e.checkCrossKt - best.checkCrossKt) <= 0.5 && e.headwindKt > best.headwindKt) ? e : best), list[0] ?? null);
  return { status: 'ok', gusting, checkKt, ends: list, favoured: pick?.name ?? null, allRed: list.length > 0 && list.every((e) => e.level === 'red') };
}

// ---- Words for the card ------------------------------------------------------------------------------------

const kt = (v) => Math.round(Math.abs(v));
/** "+12 kt" a headwind, "−5 kt" a tailwind (a true minus sign), "0 kt". */
export const headWords = (v) => (v === null ? '–' : kt(v) === 0 ? '0 kt' : v > 0 ? `+${kt(v)} kt` : `−${kt(v)} kt`);

const LEVEL_WORDS = { amber: (a, s) => `amber: over ${a} kt ${s}`, red: (_, __, r) => `red: over ${r} kt dry` };

/**
 * What one airfield's card shows (and its row's chip), or null for a field with no runways in AIRPORTS:
 * { status: 'ok' | 'calm' | 'vrb' | 'old' | 'none' | 'unknown', windWords, levelsWords, note, ends: [{ name, head, cross, level, levelWords, favoured }],
 *   favoured, chip: { words, level } | null, hint, caution }.
 * `metar` is the card's METAR line (cards.js: its `state`), `wind` the METAR's `conditions.wind` and `weather` its weather list; `settings` the crosswind
 * settings. An old METAR (the card's stale rule) has no wind check: "old report". `caution` is the banner's entry, for the home field only, when every runway
 * end is over the red level.
 * `levels: false` is a home base with no weather limits (its site profile's `standards` is null; `homeIcao` names it): the headwind, crosswind and favoured
 * end still show, but no end is amber or red, there is no chip and no caution, and the levels line says "Limits not set for KDLF: no crosswind level
 * flagged" (Moose Jaw's levels are never used for another base; plan Step 2c: "crosswind and wind limits [none flagged]").
 * `usaf` is a USAF base's crosswind standards (sites/usaf-standards.js `crosswind`: `{ fullStopKt, touchAndGoKt, soloKt, source }`, Dad's ruling 8 Oct
 * 2026; plan Step 2c part F), or null (today's levels). With it: red over the full-stop limit, amber over the touch-and-go limit on a dry runway (wet and
 * icy keep the SOF settings' levels), and an end under amber but over the solo limit is marked `solo` ("solo: over 15 kt"), a note with no chip or caution.
 */
export function crosswindFor({ icao, role = 'ALT', metar, wind = null, weather = [], settings, airports = AIRPORTS, levels = true, homeIcao = null, usaf = null }) {
  const airport = airports.find((a) => a.icao === icao);
  const ends = runwayEnds(airport);
  if (!ends.length) return null;
  if (!levels) settings = { ...(settings ?? {}), ...NO_LEVELS };
  else if (usaf) settings = { ...(settings ?? {}), xwAmberDryKt: usaf.touchAndGoKt, xwRedDryKt: usaf.fullStopKt };
  const { state, amberKt, redKt } = levelsFor(settings);
  const levelsWords = !levels ? `${notSetWords(homeIcao)}: no crosswind level flagged`
    : usaf ? `T-6A: red over ${redKt} kt (full-stop landing), amber over ${amberKt} kt ${STATE_WORDS[state]}${state === 'dry' ? ' (touch-and-go)' : ' (SOF settings)'}, solo over ${usaf.soloKt} kt (${usaf.source}; runway state ${STATE_WORDS[state]}, in SOF settings)`
      : `Amber over ${amberKt} kt ${STATE_WORDS[state]}, red over ${redKt} kt dry (runway state ${STATE_WORDS[state]}, in SOF settings)`;
  const precip = (weather ?? []).filter((w) => w.descriptor === 'FZ' || (w.phenomena ?? []).some((p) => WET.has(p)));
  const hint = levels && precip.length && state === 'dry' && metar?.state === 'fresh'
    ? `The METAR reports ${precip.map((w) => w.raw).join(' ')}: the runway may be wet. The runway state is set in SOF settings (Dry now).`
    : null;
  const empty = (status, note) => ({ status, windWords: null, levelsWords, note, ends: [], favoured: null, chip: null, hint: null, caution: null });
  if (!metar || metar.state === 'missing' || metar.state === 'nil') return empty('none', 'No METAR: no wind check');
  if (metar.state !== 'fresh') return empty('old', 'Old report: no wind check');
  const check = crosswindCheck({ wind, ends, settings });
  if (check.status === 'unknown') return empty('unknown', 'Wind not reported: no wind check');
  const gust = check.gusting ? ` gusting ${wind.gustKt}` : '';
  const varying = Array.isArray(wind.varyingDeg) ? `, varying ${String(wind.varyingDeg[0]).padStart(3, '0')}–${String(wind.varyingDeg[1]).padStart(3, '0')}° true` : '';
  const windWords = check.status === 'calm' ? 'Wind calm'
    : check.status === 'vrb' ? `Wind VRB ${wind.speedKt} kt${gust}: the full ${check.checkKt} kt counted as crosswind on every runway`
      : `Wind ${String(wind.dirDeg).padStart(3, '0')}° true ${wind.speedKt} kt${gust}${varying} (runway headings true)`;
  // A USAF base: an end under amber but over the solo limit is a note, "solo: over 15 kt" (Dad's ruling, 8 Oct 2026); the words say which limit each level is.
  if (usaf) for (const e of check.ends) if (e.level === 'ok' && Math.round(e.checkCrossKt) > usaf.soloKt) e.level = 'solo';
  const levelWord = (e) => {
    if (e.level === 'ok') return null;
    if (usaf && e.level === 'solo') return `solo: over ${usaf.soloKt} kt`;
    if (usaf && e.level === 'red') return `red: over ${redKt} kt (full-stop landing)`;
    if (usaf && e.level === 'amber') return `amber: over ${amberKt} kt ${STATE_WORDS[state]}${state === 'dry' ? ' (touch-and-go)' : ''}`;
    return LEVEL_WORDS[e.level](amberKt, STATE_WORDS[state], redKt);
  };
  const list = check.ends.map((e) => ({
    name: e.name,
    head: check.status === 'vrb' ? 'VRB' : headWords(e.headwindKt),
    cross: check.status === 'calm' ? 'calm'
      : check.status === 'vrb' ? `${kt(e.checkCrossKt)} kt VRB`
        : `${kt(e.crosswindKt)} kt${e.side ? ` from the ${e.side}` : ''}${check.gusting || Math.round(e.checkCrossKt) !== kt(e.crosswindKt) ? ` (${kt(e.checkCrossKt)} ${check.gusting ? 'gusting' : 'worst in the varying wind'})` : ''}`,
    level: e.level,
    levelWords: levelWord(e),
    favoured: e.name === check.favoured,
  }));
  // The row's chip: the favoured end's crosswind when it is amber or red (with VRB, every end's).
  const shown = check.ends.find((e) => e.name === check.favoured) ?? (check.status === 'vrb' ? check.ends[0] : null);
  const chip = shown && (shown.level === 'amber' || shown.level === 'red') ? { words: `XW ${kt(shown.checkCrossKt)}${check.status === 'vrb' ? ' VRB' : ''} ⚠`, level: shown.level } : null;
  const least = check.ends.length ? Math.min(...check.ends.map((e) => e.checkCrossKt)) : null;
  const caution = role === 'HOME' && check.allRed ? {
    key: `${icao}|CROSSWIND|RED`,
    icao,
    source: 'CROSSWIND',
    level: 'caution',
    reason: `crosswind ${kt(least)} kt on every runway (red over ${redKt} kt dry)`,
    text: `Caution: ${icao} crosswind ${kt(least)} kt on every runway (red over ${redKt} kt dry)`,
  } : null;
  const note = check.status === 'calm' ? 'Calm: no crosswind' : check.status === 'vrb' ? 'VRB: no favoured runway' : null;
  return { status: check.status, windWords, levelsWords, note, ends: list, favoured: check.favoured, chip, hint, caution };
}
