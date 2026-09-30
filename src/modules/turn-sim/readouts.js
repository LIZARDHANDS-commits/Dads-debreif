// The Turn Sim's Formation card and More detail rows (SPEC-turn-sim: Readouts
// and standards, R9). Pure: a state, the settings and the standards go in,
// plain rows and words come out, so there's no page access and it's tested in
// Node. Position labels come from core's classifyTurnSimPosition (V6
// classifyFormationError, line 1881); the standards are the debrief's edited
// ones (Q46), falling back to the default preset.
import { classifyTurnSimPosition, DEFAULT_STANDARDS, standardsSummaryLines } from '../../core/standards.js';
import { turnRadiusFt, turnRateRadPerSec, bankDegFromG, limitG } from '../../core/flight-math.js';
import { ktToFtps, formatNm } from '../../core/units.js';
import { radToDeg, degToRad } from '../../core/angles.js';
import { distance } from '../../core/geo.js';

/** Closer than this (ft) between any two aircraft is flagged (SMM 16.13 para 31; also 16.23). */
export const UNDER_SEPARATION_FT = 300;
/** A line-abreast pair farther apart than this (ft) has lost mutual support (SMM 16.18 para 49). */
export const MUTUAL_SUPPORT_FT = 9000;
/** Two aircraft are "line abreast" for that flag when neither is turning and their headings differ by no more than this (degrees). */
export const LINE_ABREAST_HEADING_DEG = 10;
/** The turns where the aircraft cross by design, so the flag says a vertical margin is needed instead. */
const CROSSING_TURNS = new Set(['shackle45', 'cross180']);

export const STALL_G_WARNING = 'More G than a T-6 can pull at this speed';

/**
 * Each turn's own degrees: V6's boxes fill Turn degrees in when the turn changes
 * (updateManeuverDefaults, line 2030). The check turn is SMM item 1, not built yet.
 */
export const TURN_DEGREES = Object.freeze({
  delayed90away: 90, delayed45away: 45, hook90: 90, shackle45: 45, cross180: 180, inplace90: 90,
});

const MINUS = '−';

/** 6420 -> "6,420 ft", with a real minus sign. */
export function ft(n) {
  return `${(Math.round(n) + 0).toLocaleString('en-US').replace('-', MINUS)} ft`; // + 0 turns -0 into 0
}
/** Like ft, with a plus sign on positive numbers. */
export function signedFt(n) {
  const r = Math.round(n) + 0;
  return r > 0 ? `+${ft(r)}` : ft(r);
}

const byNumber = (a, b) => a.id - b.id;

/**
 * Positions to the millionth of a foot: an aircraft exactly abreast comes out of the
 * engine's cos and sin a hair off (1e-13 ft), which the standards' 0-degree sweep limit
 * would read as "FORE". Nothing shown or judged is that fine.
 */
const settle = (v) => Math.round(v * 1e6) / 1e6;

/** The aircraft as classifyTurnSimPosition wants them: Lead first, { id, x, y, hdg }. */
function fleetOf(state) {
  return (state?.aircraft ?? [])
    .map((a) => ({ id: a.id, x: settle(a.xFt), y: settle(a.yFt), hdg: a.headingRad }))
    .sort(byNumber);
}

/** Which standard judges aircraft `id` in this formation: #3 in the offset box by the offset standard, all others by spread. */
export function judgedBy(id, formation) {
  return formation === 'offsetBox' && id === 3 ? 'offset' : 'spread';
}

/**
 * One row per wingman: its labels and the numbers behind them. A switched-off
 * standard judges nothing, so that aircraft has no labels (judged: false);
 * core's classifier ignores the `on` switches, so this is where they count.
 *
 * @param {object} state      { aircraft: [{ id, xFt, yFt, headingRad }] }
 * @param {object} settings   the Turn Sim settings (formation: V6's 'weighted', 'weightedReverse', 'offsetBox', 'twoShip')
 * @param {object} [standards] app.standards.get(); falls back to DEFAULT_STANDARDS
 */
export function formationRows(state, settings, standards) {
  const std = standards ?? DEFAULT_STANDARDS;
  const fleet = fleetOf(state);
  if (fleet.length < 2 || fleet[0].id !== 1) return [];
  return fleet.slice(1).map((a) => {
    const key = judgedBy(a.id, settings.formation);
    if (!std[key]?.on) return { id: a.id, judged: false, labels: [], standard: key };
    const c = classifyTurnSimPosition(a, fleet, settings.formation, std);
    return {
      id: a.id,
      judged: true,
      standard: key,
      labels: c.labels,
      onSpacing: c.labels.length === 1 && c.labels[0] === 'ON SPACING',
      intervalFt: c.intervalFt,
      foreAftFt: c.foreAftFt,
      aftDistanceFt: c.aftDistanceFt ?? null,
      lateralFromLeadFt: c.lateralFromLead,
      measureNote: c.measureNote,
    };
  });
}

/**
 * The stall-limit G warning, or null (D128, Patrick 06:58Z). `stallLimitG(kt)`
 * is core's T-6A limit for a speed, taken as indicated airspeed.
 * TODO(D128): core's stallLimitG isn't merged yet. Until index.js passes it in
 * this is always null and nothing warns. It's a warning only: the aircraft
 * still fly the set G.
 */
export function stallWarning(g, speedKt, stallLimitG) {
  if (typeof stallLimitG !== 'function' || !Number.isFinite(g)) return null;
  return g > stallLimitG(speedKt) ? STALL_G_WARNING : null;
}

/**
 * The words for one wingman's line: its labels and the one number that's off,
 * with its warning at the end. Returns { text, tone } (tone: good, caution, none).
 */
export function formationLine(row, warning = null) {
  if (!row.judged) return { text: 'Not judged (that standard is switched off)', tone: 'none' };
  const tail = warning ? ` ${warning}.` : '';
  if (row.onSpacing) return { text: `ON SPACING${tail}`, tone: 'good' };
  const numbers = [];
  const has = (label) => row.labels.includes(label);
  if (row.aftDistanceFt !== null) {
    // The offset box's #3: V6 measures it straight back from Lead's 3/9 line.
    if (has('FORE') || has('AFT')) numbers.push(`aft distance ${ft(row.aftDistanceFt)}`);
    if (has('WIDE')) numbers.push('outside the slot between Lead and #2');
  } else {
    if (has('TIGHT') || has('WIDE')) numbers.push(`interval ${ft(row.intervalFt)}`);
    if (has('FORE') || has('AFT')) numbers.push(`fore/aft ${signedFt(row.foreAftFt)}`);
  }
  return { text: `${row.labels.join(' / ')}  ${numbers.join(', ')}${tail}`.trim(), tone: 'caution' };
}

/** The short label drawn beside an aircraft on the picture (words only), or null when it isn't judged. */
export function mapLabel(row) {
  if (!row.judged || !row.labels.length) return null;
  return { text: row.labels.join(' / '), tone: row.onSpacing ? 'good' : 'caution' };
}

/** Every pair that exists, in V6's order (1-2, 1-3, 1-4, 3-4, 2-3, 2-4); a two-ship has only 1-2 (no NaN, #17). */
export function pairDistances(state) {
  const byId = new Map(fleetOf(state).map((a) => [a.id, a]));
  const order = [[1, 2], [1, 3], [1, 4], [3, 4], [2, 3], [2, 4]];
  return order
    .filter(([a, b]) => byId.has(a) && byId.has(b))
    .map(([a, b]) => ({ label: `${a}-${b}`, a, b, distFt: distance(byId.get(a), byId.get(b)) }));
}

export const minSeparationFt = (pairs) => (pairs.length ? Math.min(...pairs.map((p) => p.distFt)) : null);

/** The pairs that count as line abreast for a formation: neighbours across the front. */
function abreastPairs(formation) {
  if (formation === 'twoShip') return [[1, 2]];
  if (formation === 'offsetBox') return [[1, 2], [3, 4]];
  return [[1, 2], [1, 3], [3, 4]];
}

/**
 * Words for the separation flags (SMM item 6, readouts only; they never change
 * the flying). Empty when there's nothing to say.
 */
export function separationFlags(state, settings, pairs = pairDistances(state)) {
  const flags = [];
  const min = minSeparationFt(pairs);
  if (min !== null && min < UNDER_SEPARATION_FT) {
    flags.push(CROSSING_TURNS.has(settings.maneuver) ? `Crossing: ${UNDER_SEPARATION_FT} ft vertical needed` : `Under ${UNDER_SEPARATION_FT} ft`);
  }
  const byId = new Map((state?.aircraft ?? []).map((a) => [a.id, a]));
  const lost = abreastPairs(settings.formation).some(([a, b]) => {
    const p = byId.get(a);
    const q = byId.get(b);
    if (!p || !q || p.turning || q.turning) return false;
    const apart = Math.abs(radToDeg(Math.atan2(Math.sin(p.headingRad - q.headingRad), Math.cos(p.headingRad - q.headingRad))));
    return apart <= LINE_ABREAST_HEADING_DEG && distance({ x: p.xFt, y: p.yFt }, { x: q.xFt, y: q.yFt }) > MUTUAL_SUPPORT_FT;
  });
  if (lost) flags.push('Mutual support lost');
  return flags;
}

/** Turn radius, rate and bank for the set speed and G (V6 updateReadouts, line 1698), G limited as the flying limits it. */
export function turnNumbers(settings) {
  const g = limitG(settings.baseG);
  const v = ktToFtps(settings.speedKt);
  const rate = turnRateRadPerSec(v, g);
  return { g, radiusFt: turnRadiusFt(v, g), rateDegPerSec: radToDeg(rate), rateRadPerSec: rate, bankDeg: bankDegFromG(g) };
}

export function turnLine(settings) {
  const n = turnNumbers(settings);
  return `R ${ft(n.radiusFt)} · ${n.rateDegPerSec.toFixed(1)}°/s · bank ${n.bankDeg.toFixed(0)}°`;
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** A pair's line for More detail; withNm adds the NM figure (the Layers menu's "distances in NM"). */
export function pairText(pair, withNm = false) {
  return `${pair.label}: ${ft(pair.distFt)}${withNm ? ` (${formatNm(pair.distFt)})` : ''}`;
}

/** One wingman's numbers for More detail. */
export function wingmanDetail(row) {
  if (!row.judged) return `#${row.id}: not judged (standard switched off)`;
  const from = row.measureNote ? ` (${row.measureNote})` : '';
  const aft = row.aftDistanceFt !== null ? `, aft ${ft(row.aftDistanceFt)}` : '';
  return `#${row.id}: interval ${ft(row.intervalFt)}, fore/aft ${signedFt(row.foreAftFt)}${aft}${from}`;
}

/**
 * Everything the Formation column shows for one state.
 *
 * @param {object} state      the engine's state: { tSec, finished, aircraft }
 * @param {object} settings   the Turn Sim settings
 * @param {object} [options]  { standards, stallLimitG, distNm }
 */
export function readoutsAt(state, settings, { standards, stallLimitG, distNm = false } = {}) {
  const std = standards ?? DEFAULT_STANDARDS;
  const gById = new Map((state?.aircraft ?? []).map((a) => [a.id, a.g]));
  const rows = formationRows(state, settings, std).map((row) => {
    const warning = stallWarning(gById.get(row.id), settings.speedKt, stallLimitG);
    return { ...row, warning, line: formationLine(row, warning) };
  });
  const pairs = pairDistances(state);
  const numbers = turnNumbers(settings);
  const deg = settings.turnDeg;
  const min = minSeparationFt(pairs);
  return {
    timeSec: state?.tSec ?? 0,
    rows,
    pairs,
    pairTexts: pairs.map((p) => pairText(p, distNm)),
    wingmen: rows.map(wingmanDetail),
    minSepFt: min,
    minSepText: min === null ? null : `Min sep ${ft(min)}`,
    turnText: turnLine(settings),
    flags: separationFlags(state, settings, pairs),
    gWarning: stallWarning(settings.baseG, settings.speedKt, stallLimitG),
    summary: [
      ['Turn radius', ft(numbers.radiusFt)],
      ['Turn rate', `${numbers.rateDegPerSec.toFixed(1)}°/s`],
      [`Time to ${deg}°`, `${(degToRad(deg) / numbers.rateRadPerSec).toFixed(1)} s`],
      ['Bank angle', `${numbers.bankDeg.toFixed(1)}°`],
      ['Speed', `${settings.speedKt} KTAS`],
    ],
    standardsLines: standardsSummaryLines(std),
    standardsAreDefault: sameJson(std, DEFAULT_STANDARDS),
  };
}
