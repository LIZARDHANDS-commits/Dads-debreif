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
import { clockLabel } from './fields.js';

/** Closer than this (ft) between any two aircraft is flagged (SMM 16.13 para 31; also 16.23). */
export const UNDER_SEPARATION_FT = 300;
/** A line-abreast pair farther apart than this (ft) has lost mutual support (SMM 16.18 para 49). */
export const MUTUAL_SUPPORT_FT = 9000;
/** Two aircraft are "line abreast" for that flag when neither is turning and their headings differ by no more than this (degrees)... */
export const LINE_ABREAST_HEADING_DEG = 10;
/** ...and each is within this many degrees of the other's 3/9 line, so a pair in trail isn't flagged. */
export const LINE_ABREAST_BEARING_DEG = 30;
/** The turns where the aircraft cross by design, so the flag says a vertical margin is needed instead. */
const CROSSING_TURNS = new Set(['shackle45', 'cross180']);

export const STALL_G_WARNING = 'More G than a T-6 can pull at this speed';

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

/**
 * The fleet in Lead's own frame for the classifier: Lead at the origin heading 0, every other aircraft turned to match
 * and rounded to a hundredth of a foot. The classifier measures fore/aft and lateral from Lead's heading with cos and
 * sin, so on a heading such as 000 or 300 a perfect formation comes out a hair off (1e-13 to 1e-7 ft) and reads FORE or
 * WIDE. Turned into Lead's frame first, the numbers are exact where the formation is exact (TS-06). The picture and the
 * distances are unchanged: only the judging sees this frame.
 */
function leadFrameFleet(state) {
  const fleet = fleetOf(state);
  const lead = fleet[0];
  if (!lead) return fleet;
  const c = Math.cos(lead.hdg);
  const s = Math.sin(lead.hdg);
  const round = (v) => Math.round(v * 100) / 100 + 0; // + 0: no -0
  return fleet.map((a) => {
    const dx = a.x - lead.x;
    const dy = a.y - lead.y;
    return { id: a.id, x: round(dx * c + dy * s), y: round(-dx * s + dy * c), hdg: a.id === lead.id ? 0 : a.hdg - lead.hdg };
  });
}

/** Which standard judges aircraft `id` in this formation: #3 in the offset box by the offset standard, all others by spread. */
export function judgedBy(id, formation) {
  return formation === 'offsetBox' && id === 3 ? 'offset' : 'spread';
}

/** A perfect turn ends a hair off its slot: under 1 degree past the standard's own FORE edge is not FORE (N4). */
export const FORE_TOLERANCE_DEG = 1;
/** ... and an interval within 1 percent of the set spacing is not WIDE or TIGHT. The numbers still show. */
export const SPACING_TOLERANCE = 0.01;

/** Whether a FORE is only a hair over the standard's own FORE edge (within FORE_TOLERANCE_DEG of it), so it is not flagged. */
function foreWithinTolerance(c, spread) {
  if (Number.isFinite(spread.sweepMaxDeg) && Number.isFinite(c.sweepDeg)) return c.sweepDeg >= (Number.isFinite(spread.sweepMinDeg) ? spread.sweepMinDeg : 0) - FORE_TOLERANCE_DEG;
  return c.foreAftFt <= (spread.foreAftTolFt ?? 0) + c.intervalFt * Math.tan(FORE_TOLERANCE_DEG * Math.PI / 180);
}

/**
 * The labels of a spread-standard row with the Turn Sim's small tolerance applied (N4; core's standard is shared with the
 * Debrief and is left as it is). Only FORE, WIDE and TIGHT are relaxed; AFT and the rest are as the standard says.
 */
function withinPilotTolerance(c, spacingFt, spread) {
  const kept = c.labels.filter((label) => {
    if (label === 'FORE') return !foreWithinTolerance(c, spread);
    // Within 1 percent of the set spacing, and no more than that past the band's edge: a formation at the set spacing is
    // still TIGHT when the standard is edited to want more than that.
    if ((label === 'WIDE' || label === 'TIGHT') && spacingFt > 0) {
      const slack = SPACING_TOLERANCE * spacingFt;
      const past = label === 'WIDE' ? c.intervalFt - spread.maxFt : spread.minFt - c.intervalFt;
      return !(Math.abs(c.intervalFt - spacingFt) <= slack && past <= slack);
    }
    return true;
  });
  return kept.length || !c.labels.length ? kept : ['ON SPACING'];
}

/**
 * One row per wingman: its labels and the numbers behind them. A switched-off
 * standard judges nothing, so that aircraft has no labels (judged: false);
 * core's classifier ignores the `on` switches, so this is where they count.
 *
 * @param {any} state      { aircraft: [{ id, xFt, yFt, headingRad }] }
 * @param {any} settings   the Turn Sim settings (formation: V6's 'weighted', 'weightedReverse', 'offsetBox', 'twoShip')
 * @param {any} [standards] app.standards.get(); falls back to DEFAULT_STANDARDS
 */
export function formationRows(state, settings, standards) {
  const std = standards ?? DEFAULT_STANDARDS;
  const fleet = leadFrameFleet(state);
  if (fleet.length < 2 || fleet[0].id !== 1) return [];
  return fleet.slice(1).map((a) => {
    const key = judgedBy(a.id, settings.formation);
    if (!std[key]?.on) return { id: a.id, judged: false, labels: [], standard: key };
    const c = classifyTurnSimPosition(a, fleet, settings.formation, std);
    const labels = key === 'spread' ? withinPilotTolerance(c, settings.spacingFt, std.spread) : c.labels;
    return {
      id: a.id,
      judged: true,
      standard: key,
      labels,
      onSpacing: labels.length === 1 && labels[0] === 'ON SPACING',
      intervalFt: c.intervalFt,
      foreAftFt: c.foreAftFt,
      aftDistanceFt: c.aftDistanceFt ?? null,
      lateralFromLeadFt: c.lateralFromLead,
      measureNote: c.measureNote,
    };
  });
}

/**
 * The G warning, or null (D128, Patrick 06:58Z, the shared T-6A model). `stallLimitG(kt)` is the most G
 * the T-6 can pull at that speed: core's availableG(kt, false), the stall line capped at +7 G
 * (t6-performance.js). The Turn Sim treats its Speed box as indicated airspeed (no altitude, no wind). It's a warning only: the aircraft still fly the set G,
 * so the V6 turns stay pinned. Without a limit function there is never a warning.
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

/** Degrees the direction from p to q is off p's 3/9 line (0 = straight out the left or right wing, 90 = dead ahead or astern). */
function offThreeNine(p, q) {
  const rel = radToDeg(Math.atan2(q.yFt - p.yFt, q.xFt - p.xFt) - p.headingRad);
  const wrapped = ((rel % 360) + 540) % 360 - 180; // -180 to 180
  return Math.min(Math.abs(wrapped - 90), Math.abs(wrapped + 90));
}

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
  // Pairs the plan passes within 300 ft (state.crossings, known before the first step, such as the offset box hook's rear
  // aircraft nose to nose with the front element's outbound leg): the sim is flat, so the SMM's vertical margin is needed.
  const crossing = (state?.crossings ?? []).map((c) => `Crossing: ${UNDER_SEPARATION_FT} ft vertical needed, #${c.a} and #${c.b}`);
  flags.push(...crossing);
  // Passes between 300 and 1,000 ft (state.closePasses): not a designed crossing, but too close to fly without altitude separation.
  flags.push(...(state?.closePasses ?? []).map((c) => `Close pass: ${ft(c.minFt)}, #${c.a} and #${c.b}`));
  if (min !== null && min < UNDER_SEPARATION_FT && !crossing.length) {
    flags.push(CROSSING_TURNS.has(settings.maneuver) ? `Crossing: ${UNDER_SEPARATION_FT} ft vertical needed` : `Under ${UNDER_SEPARATION_FT} ft`);
  }
  const byId = new Map((state?.aircraft ?? []).map((a) => [a.id, a]));
  const lost = abreastPairs(settings.formation).some(([a, b]) => {
    const p = byId.get(a);
    const q = byId.get(b);
    if (!p || !q || p.turning || q.turning) return false;
    const apart = Math.abs(radToDeg(Math.atan2(Math.sin(p.headingRad - q.headingRad), Math.cos(p.headingRad - q.headingRad))));
    const apartFt = distance({ x: p.xFt, y: p.yFt }, { x: q.xFt, y: q.yFt });
    return apart <= LINE_ABREAST_HEADING_DEG && offThreeNine(p, q) <= LINE_ABREAST_BEARING_DEG && apartFt > MUTUAL_SUPPORT_FT;
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
 * Each aircraft's clock-cue status, live from the engine (state.aircraft[i].cue), for Timing = clock cue; empty otherwise.
 * `warning` is Q44c: in the offset box #3 and #4 can't see their clock cue, so they turn on the rear element timing instead, and the screen says so.
 */
export function cueStatus(state) {
  const lines = [];
  const blind = [];
  let blindPos = null;
  for (const a of state?.aircraft ?? []) {
    const cue = a.cue;
    if (!cue || cue.mode === 'off') continue;
    const at = clockLabel(cue.clockPos);
    // In the box #3 and #4 never watch anything: their line says what does time them (N8), never "watching" or "cue came from".
    if (cue.cantSee) lines.push({ id: a.id, text: 'turns on the rear element timing' });
    else if (cue.mode === 'start') lines.push({ id: a.id, text: 'starts the turn, nothing to wait for' });
    else if (cue.mode === 'waiting') lines.push({ id: a.id, text: `watching #${cue.targetId} for ${at}` });
    else lines.push({ id: a.id, text: `cue came from #${cue.targetId}, turning` });
    if (cue.cantSee) {
      blind.push(a.id);
      blindPos = at;
    }
  }
  const many = blind.length > 1;
  const warning = blind.length
    ? `${blind.map((id) => `#${id}`).join(' and ')} can't see ${many ? 'their' : 'its'} clock cue in the box, so ${many ? 'they turn' : 'it turns'} on the rear element timing instead.`
    : null;
  return { lines, warning };
}

/**
 * The cross turn's second-stage G, from state.crossTurnSpacingNote ({ solvedG, clamped, spacingFt }), or null in any other turn.
 * `clamped` means the G hit its limit, so the roll-out spacing is not the one asked for (the screen shows it in the caution colour).
 */
export function crossTurnNote(state) {
  const n = state?.crossTurnSpacingNote;
  if (!n) return null;
  const g = `${n.solvedG.toFixed(1)} G`;
  return n.clamped
    ? { clamped: true, text: `Second half held at ${g}, the most it can use: rolls out ${ft(n.spacingFt)} apart` }
    : { clamped: false, text: `Second half at ${g} to roll out ${ft(n.spacingFt)} apart` };
}

/**
 * The offset box's rear delays against the SMM's band (16.41 para 112), from state.offsetBox, or null when the turn has none.
 * Each line reads "#3 12.5 s, in the 10-15 s band" or "#4 18.0 s, outside 10-15 s" (the flag). With `timing` 'boxSlot' the delays are
 * solved to keep the box's shape, so an outside #3 delay is not an error and the flag says so, and #4 (which turns on the LAB cue
 * off #3) is an information line with no flag (with the Delayed 45's check turn, `checkFlown`, both rear aircraft start from one solved shift and read as #3 does); in the hook (`maneuver` 'hook90') #3 and #4 start together, so it reads "turns with #3".
 */
export function offsetBandLines(state, timing = null, maneuver = null, checkFlown = false) {
  const box = state?.offsetBox;
  if (!box) return null;
  const band = `${box.minSec}-${box.maxSec} s`;
  // The check plan's rear shift is solved to keep the box's shape too, and both rear aircraft start from it (#4 is not timed off #3).
  const solved = timing === 'boxSlot' || checkFlown;
  return box.rear.map((r) => {
    // Box slot (Fig 16.30): only #3 delays 10 to 15 s; #4 turns on the normal LAB cue off #3, so its time from #3 is information, never a flag.
    if (timing === 'boxSlot' && !checkFlown && r.id === 4) {
      // The hook: #3 and #4 start together, so there is no time between them to print (N6).
      if (maneuver === 'hook90') return { id: r.id, outside: false, info: true, text: 'turns with #3' };
      const secs = Math.abs(r.delaySec).toFixed(1);
      return { id: r.id, outside: false, info: true, text: `turns ${secs} s ${r.delaySec < 0 ? 'before' : 'after'} #3` };
    }
    return {
      id: r.id,
      outside: Boolean(r.outsideBand),
      text: `${r.delaySec.toFixed(1)} s, ${!r.outsideBand ? `in the ${band} band` : solved ? `outside the SMM ${band}; solved so the box keeps its shape` : `outside ${band}`}`,
    };
  });
}

/**
 * The words that say the Delayed 45 is flown with its check turn, or null for the plain turn. The figure is the one the SMM draws for
 * the formation: 16.17 for two aircraft, 16.34 for spread 4 and 16.31 for the box.
 */
export function checkTurnNote(state, settings) {
  if (!state?.delayed45CheckFlown) return null;
  const fig = settings.formation === 'twoShip' ? '16.17' : settings.formation === 'offsetBox' ? '16.31' : '16.34';
  return `Delayed 45 with a ${settings.checkTurnDeg}° check (SMM Fig ${fig})`;
}

/**
 * Everything the Formation column shows for one state.
 *
 * @param {any} state      the engine's state: { tSec, finished, aircraft }
 * @param {any} settings   the Turn Sim settings
 * @param {{ standards?: any, stallLimitG?: (kt: number) => number, distNm?: boolean }} [options]
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
    cue: cueStatus(state),
    offsetBand: offsetBandLines(state, settings.offsetBox4Timing, settings.maneuver, Boolean(state?.delayed45CheckFlown)),
    crossNote: crossTurnNote(state),
    checkNote: checkTurnNote(state, settings),
    autoStepSec: state?.autoStepSec ?? null,
    maneuverFallback: state?.maneuverFallback ?? null,
    leadTurnDirection: state?.leadTurnDirection ?? null,
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
