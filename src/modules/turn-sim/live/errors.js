// Training errors for the wingman (Turn Sim, TS-52; Patrick, 4 Oct 2026, 10:51Z:
// "introduce errors ... the wing man either turns at normal reference OR fixes
// it"). An error is two things:
//   1. an offset on #2's start state (ahead of or behind the 3/9 line, wide or
//      tight, high or low, fast or slow) and a timing error on #2's roll-in (early or late);
//   2. a response, which changes how #2's plan is worked out for each button:
//        'reference'  #2 flies the standard turn for where he SHOULD be (the set
//                     spacing, abeam) at the standard time. The error carries
//                     through and the end picture shows it.
//        'fix'        #2 uses the manoeuvre to correct: he starts his turn earlier
//                     or later ("closer, turn early; wider, delay", SMM 16.19 para
//                     54 NOTE) and flies the turn at a different bank, which is
//                     "adjust G and/or anticipated heading" (SMM 16.19 para 52
//                     NOTE), staged halfway through (the hook's G adjustment at
//                     the 90, Fig 16.19, AFM8 brief p.18; the shackle's reversal
//                     timing, SMM 16.19 para 62). High or low is fixed by flying
//                     back to Lead's height (AFM8 brief p.17).
// Lead is never touched except to wait for a wingman who rolls in before the call.
//
// The planner reuses the standard builders in manoeuvres.js: it plans the manoeuvre
// for #2 standing in his slot, which is the SMM picture, then changes only #2's
// own plan. Both fly through flight.js, so every path is the kinematic path of the
// rest of the Turn Sim: roll 90°/s, hand-overs smooth, banks inside FIX_LIMITS.
//
// What a fix may use is set by the four "Fix tools" (Patrick, 4 Oct 11:42Z: "an options
// menu on the tools 2 can use to fix including geometry, vertical, speed/power, and
// changing lateral spacing"), all ticked by default, used smallest change first:
//   Geometry      the roll-in time, the bank in each half of the turn, the shackle's
//                 reversal time (the V2.8 fix);
//   Vertical      a smooth climb or descent back to Lead's height, and with Speed/power
//                 a small dive to gain speed or a zoom to lose it;
//   Lateral       after the roll-out, a small heading change in or out and back, to
//                 reach the set spacing ("fix any spacing or sweep errors on roll out",
//                 AFM8 brief p.18);
//   Speed/power   after the roll-out, more or less power for a while to close a fore/aft
//                 gap, then Lead's speed again (a flight.js speed segment).
// Whatever the ticked tools can't take out is left, and the card says which unticked
// tool would have taken it out.
import { wrapPi } from '../../../core/angles.js';
import { gFromBankDeg, turnRadiusFromBankFt } from '../../../core/flight-math.js';
import { excessThrustPerWeight } from '../../../core/t6-performance.js';
import { G_FTPS2 } from '../../../core/units.js';
import { STEP_SEC, copyAircraft, heightAt, angleToGo, stepAircraft, planDone, smoother, smootherSlope, SMOOTHER_PEAK } from './flight.js';
import { slowKtps, speedSegFor } from './slow-down.js';
import { planManoeuvre, dryRun, relativeTo, missProfile, onStep, turnSeg, VERTICAL_MISS_FT } from './manoeuvres.js';

// ---- the settings ------------------------------------------------------------------------

/**
 * Every setting and its default. All errors start at 'none', so the default start is
 * unchanged. The amounts are what an error means when it is chosen.
 *   errFore      along the line of the 3/9: 'ahead' (acute) or 'behind' (sucked)
 *   errSpacing   across it: 'wide' or 'tight', measured from Lead on #2's own side (TS-2)
 *   errHeight    'high' or 'low' against Lead
 *   errTiming    #2 rolls in 'early' or 'late' against the standard time
 *   errSpeed     #2 starts 'fast' or 'slow' against Lead (V2.20, TS-62: the off-standard hot turning rejoin starts,
 *                Patrick 19:15Z "wide or close, ahead of line, high, tight, fast")
 *   errSmart     Smart wingman (Patrick 5 Oct 23:33Z: "smart wingman means they CORRECT THE ERROR (Now or on next
 *                manouver, two options)"; TS-96): on (the default) #2 fixes the error, off he turns at the normal
 *                references and the error carries ('reference' at the top of this file)
 *   errFixWhen   with Smart wingman on: 'next' (the default, Patrick 23:34Z) fixes it in the next manoeuvre ('fix' at the
 *                top of this file), 'now' flies back into the band from where he is at once (the chooser, "from here")
 *   errRandom    one random error at every Reset instead of the choices above
 * Amount defaults are estimates (docs/modules/turn-sim/decisions.md TS-52): each puts the
 * default error clearly outside the SMM's band at the default 6,000 ft spacing.
 */
export const ERROR_DEFAULTS = /** @type {Record<string, any>} */ (Object.freeze({
  errFore: 'none',
  errForeFt: 1200, // estimate: 11° of sweep behind at 6,000 ft, just past the band (0 to 10°, SMM 16.18 para 49); 1,200 ft ahead is FORE
  errSpacing: 'none',
  errSpacingFt: 1500, // estimate: 7,500 ft wide (past the 4,000 to 6,000 ft band, under the 9,000 ft where cover breaks down, SMM 16.18 para 49) or 4,500 tight
  errHeight: 'none',
  errHeightFt: 500, // estimate: inside the ±2,000 ft band (SMM 16.18 para 49), more than the 300 ft crossing miss
  errTiming: 'none',
  errTimingSec: 2, // estimate: about 840 ft of flight at 248 KTAS
  errSpeed: 'none',
  errSpeedKias: 20, // estimate: the top of EFIG p.374's 10-20 KIAS rejoin overtake, so "fast" is a clearly hot start
  errSmart: true, // Smart wingman on: the wingman corrects "regardless of how it developed" (SMM 16.18 para 50; Patrick 23:33Z)
  errFixWhen: 'next', // ... on the next manoeuvre (Patrick 23:34Z)
  errRandom: false,
  // The Fix tools, all ticked (Patrick, 4 Oct 11:42Z; draft wording in the project files, turn-sim-review/errors/fix-tools-draft.md)
  fixGeometry: true,
  fixVertical: true,
  fixSpeed: true,
  fixLateral: true,
}));

/** The Fix tools for the screen, in the order #2 uses them (smallest change first): setting, name, what it does. */
export const FIX_TOOLS = Object.freeze([
  { key: 'fixGeometry', tool: 'geometry', label: 'Geometry', hint: 'roll-in time, bank, reversal point' },
  { key: 'fixVertical', tool: 'vertical', label: 'Vertical', hint: "back to Lead's height; with Speed/power, a small dive or zoom" },
  { key: 'fixLateral', tool: 'lateral', label: 'Lateral spacing', hint: 'a few degrees in or out after the roll-out' },
  { key: 'fixSpeed', tool: 'speed', label: 'Speed/power', hint: "power for a while, then Lead's speed" },
]);

/**
 * Which Fix tools #2 may use: { geometry, vertical, speed, lateral }, each true unless its box is
 * unticked (anything but false counts as ticked, so a bad value leaves the tool on, as the default).
 */
export function resolveFixTools(options = {}) {
  return Object.fromEntries(FIX_TOOLS.map((t) => [t.tool, options[t.key] !== false]));
}
const ALL_TOOLS = Object.freeze({ geometry: true, vertical: true, speed: true, lateral: true });

/** The settings that only allow some choices (createSettings' `allowed`). */
export const ERROR_ALLOWED = /** @type {Record<string, any[]>} */ (Object.freeze({
  errFore: ['none', 'ahead', 'behind'],
  errSpacing: ['none', 'wide', 'tight'],
  errHeight: ['none', 'high', 'low'],
  errTiming: ['none', 'early', 'late'],
  errSpeed: ['none', 'fast', 'slow'],
  errFixWhen: ['next', 'now'],
}));

/**
 * The boxes of the "Errors (training)" section, for the screen to build: each is a choice and
 * the amount that goes with it. The words in brackets are Patrick's (4 Oct 2026); the manuals
 * say forward/back, in/out and up/down (SMM 12.18 para 39), so these are working readings.
 */
export const ERROR_FIELDS = Object.freeze([
  { key: 'errFore', label: 'Along the 3/9 line', amountKey: 'errForeFt', unit: 'ft', min: 100, max: 3000, step: 100, options: [{ value: 'none', label: 'None' }, { value: 'ahead', label: 'Ahead (acute)' }, { value: 'behind', label: 'Behind (sucked)' }] },
  { key: 'errSpacing', label: 'Spacing', amountKey: 'errSpacingFt', unit: 'ft', min: 100, max: 3000, step: 100, options: [{ value: 'none', label: 'None' }, { value: 'wide', label: 'Wide' }, { value: 'tight', label: 'Tight' }] },
  { key: 'errHeight', label: 'Height', amountKey: 'errHeightFt', unit: 'ft', min: 100, max: 2000, step: 100, options: [{ value: 'none', label: 'None' }, { value: 'high', label: 'High' }, { value: 'low', label: 'Low' }] },
  { key: 'errSpeed', label: 'Speed', amountKey: 'errSpeedKias', unit: 'KIAS', min: 5, max: 40, step: 5, options: [{ value: 'none', label: 'None' }, { value: 'fast', label: 'Fast' }, { value: 'slow', label: 'Slow' }] },
  { key: 'errTiming', label: 'Roll-in', amountKey: 'errTimingSec', unit: 's', min: 0.5, max: 10, step: 0.5, options: [{ value: 'none', label: 'On time' }, { value: 'early', label: 'Early' }, { value: 'late', label: 'Late' }] },
]);
/** When the Smart wingman fixes the error (TS-96). */
export const FIX_WHEN_OPTIONS = Object.freeze([{ value: 'next', label: 'On the next manoeuvre' }, { value: 'now', label: 'Now' }]);
/** The response the settings ask for: 'reference' with Smart wingman off (an old saved errResponse 'reference' too), else 'fix'. */
export const responseOf = (o) => (o.errSmart === false || o.errResponse === 'reference' ? 'reference' : 'fix');

/**
 * What a fix may use: every number of the Fix tools in one place (all pending Patrick's
 * confirmation of the draft wording, 4 Oct 11:42Z). Estimates, flagged on the card when passed,
 * never walls except that the aircraft can't be asked for more than it can fly: bank 50° to 75° is
 * 1.6 to 3.9 G, under the wingman's +5 G reference (Gen Book p.11) and the rolling limit of 4.7 G
 * (SMM/NFM via t6-performance). Speeding up is limited by the T-6A's full-power excess thrust
 * (core excessThrustPerWeight, fitted to the sustained turn chart), so it is not a number here.
 */
export const FIX_LIMITS = Object.freeze({
  // Geometry
  bankDeg: [50, 75],
  extraDelaySec: 30, // longest it will hold off a roll-in to fix a position, beyond the standard
  reversalSec: 20, // how far the shackle's reversal may move either way
  // Vertical
  maxClimbFtps: 60, // 3,600 fpm, estimate: the cross turn's standard miss already peaks at about 60 ft/s
  diveFt: 500, // estimate: the deepest dive (or highest zoom) to gain (or lose) speed, back on height after
  pushPullG: 0.3, // estimate: the most a dive or zoom moves the G away from 1 (a gentle push or pull, 0.7 to 1.3 G)
  // Speed/power
  speedKias: 20, // estimate: the most #2 flies above or below Lead's speed
  // slowing: with the power back, slow-down.js (TS-61; was a fixed 1.5 kt/s until V2.20)
  // Lateral spacing
  headingDeg: 10, // estimate: the most heading change in or out after the roll-out
  lateralBankDeg: 30, // estimate: the bank for that small heading change (1.15 G)
  lateralHoldSec: 20, // estimate: the heading change is sized so the straight leg in between takes about this long
});

/** A roll-out fix smaller than this isn't flown: the card names nothing under 50 ft either (wordsFor), too small for a pilot to chase (not a margin). */
const NOTHING_TO_FIX_FT = 50;

/** The smallest spacing the sim flies at (formation.js SPACING_LIMITS_FT), so "tight" can't put #2 on Lead. */
const MIN_SPACING_FT = 1000;
/** A fix that ends this close to the SMM picture counts as fixed: the shared table's ±100 ft (docs/TESTING.md). */
export const FIXED_WITHIN_FT = 100;

const DEG = Math.PI / 180;
const unit = (h) => ({ x: Math.cos(h), y: Math.sin(h) });
const clone = (segs) => segs.map((s) => ({ ...s }));
const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
const ftText = (n) => `${Math.round(n).toLocaleString('en-CA')} ft`;

// ---- resolving the settings into one error ------------------------------------------------

/**
 * The error the settings ask for, or null when none is set (the default). Signs: foreFt + ahead,
 * spacingFt + wide, heightFt + high, timingSec + late, speedKias + fast.
 * @param {Record<string, any>} [options]  formation options holding the err* keys
 * @param {() => number} [rng]  a random number in [0, 1), for the random option
 * @returns {null | { foreFt: number, spacingFt: number, heightFt: number, timingSec: number, speedKias: number, response: 'fix' | 'reference', random: boolean, fixNow: boolean }}
 */
export function resolveErrors(options = {}, rng = Math.random) {
  const o = { ...ERROR_DEFAULTS };
  for (const key of Object.keys(ERROR_DEFAULTS)) if (options[key] !== undefined) o[key] = options[key];
  const response = responseOf({ ...o, errResponse: options.errResponse });
  const fixNow = response === 'fix' && o.errFixWhen === 'now';
  if (o.errRandom === true) return { ...randomError(rng, response), fixNow };
  const signed = (choice, plus, minus, amount) => (choice === plus ? 1 : choice === minus ? -1 : 0) * Math.abs(num(amount, 0));
  /** @type {{ foreFt: number, spacingFt: number, heightFt: number, timingSec: number, speedKias: number, response: 'fix' | 'reference', random: boolean, fixNow: boolean }} */
  const spec = {
    foreFt: signed(o.errFore, 'ahead', 'behind', o.errForeFt),
    spacingFt: signed(o.errSpacing, 'wide', 'tight', o.errSpacingFt),
    heightFt: signed(o.errHeight, 'high', 'low', o.errHeightFt),
    timingSec: signed(o.errTiming, 'late', 'early', o.errTimingSec),
    speedKias: signed(o.errSpeed, 'fast', 'slow', o.errSpeedKias),
    response,
    random: false,
    fixNow,
  };
  return spec.foreFt || spec.spacingFt || spec.heightFt || spec.timingSec || spec.speedKias ? spec : null;
}

/** The ranges a random error is drawn from (estimates, inside the same ranges as the boxes). */
const RANDOM_RANGES = Object.freeze({ fore: [500, 2500, 100], spacing: [1000, 2500, 100], height: [300, 1000, 100], timing: [2, 6, 0.5], speed: [10, 30, 5] });

/**
 * One error of a random kind, a random way and size, for the "Random error" option.
 * @param {() => number} rng
 * @param {'fix' | 'reference'} response
 */
function randomError(rng, response) {
  const kinds = ['fore', 'spacing', 'height', 'timing', 'speed'];
  const kind = kinds[Math.min(kinds.length - 1, Math.floor(rng() * kinds.length))];
  const [lo, hi, step] = RANDOM_RANGES[kind];
  const amount = lo + Math.round((rng() * (hi - lo)) / step) * step;
  const sign = rng() < 0.5 ? -1 : 1;
  const spec = { foreFt: 0, spacingFt: 0, heightFt: 0, timingSec: 0, speedKias: 0, response, random: true };
  spec[{ fore: 'foreFt', spacing: 'spacingFt', height: 'heightFt', timing: 'timingSec', speed: 'speedKias' }[kind]] = sign * amount;
  return spec;
}

/** The error in words for the Formation card: "#2 ahead of the line 1,500 ft, wide 2,000 ft, 3 s late". */
export function describeErrors(spec) {
  if (!spec) return '';
  const parts = [];
  if (spec.foreFt) parts.push(`${spec.foreFt > 0 ? 'ahead of' : 'behind'} the 3/9 line ${ftText(Math.abs(spec.foreFt))}`);
  if (spec.spacingFt) parts.push(`${spec.spacingFt > 0 ? 'wide' : 'tight'} ${ftText(Math.abs(spec.spacingFt))}`);
  if (spec.heightFt) parts.push(`${ftText(Math.abs(spec.heightFt))} ${spec.heightFt > 0 ? 'high' : 'low'}`);
  if (spec.speedKias) parts.push(`${Math.abs(spec.speedKias)} KIAS ${spec.speedKias > 0 ? 'fast' : 'slow'}`);
  if (spec.timingSec) parts.push(`rolls in ${Math.abs(spec.timingSec)} s ${spec.timingSec > 0 ? 'late' : 'early'}`);
  const how = spec.response === 'fix' ? (spec.fixNow ? 'Smart wingman, fix now' : 'Smart wingman, fix on the next manoeuvre') : 'Smart wingman off: turn at normal references';
  return `${spec.random ? 'Random error' : 'Error'}: #2 ${parts.join(', ')}. Response: ${how}.`;
}

/**
 * Moves #2 to his error start (a copy of nothing: `wing` itself is changed). The offsets are
 * measured in Lead's frame from where #2 stands now: along the 3/9 line, across it (wide is away
 * from Lead on #2's own side, tight toward him; TS-2), and in height; a speed error sets his
 * indicated airspeed off Lead's (true airspeed in proportion, at the same height). Until a button is
 * pressed a fast or slow #2 flies on at that speed, so he draws ahead or drops back, as a real one does.
 */
export function applyStartErrors(lead, wing, spec, spacingFt) {
  const rel = relativeTo(lead, wing);
  const side = Math.sign(rel.left) || 1;
  const u = unit(lead.headingRad);
  const n = { x: -u.y, y: u.x };
  const fwd = rel.fwd + spec.foreFt;
  const left = side * Math.max(MIN_SPACING_FT, Math.abs(rel.left) + spec.spacingFt);
  wing.xFt = lead.xFt + fwd * u.x + left * n.x;
  wing.yFt = lead.yFt + fwd * u.y + left * n.y;
  wing.altAboveFt = lead.altAboveFt + spec.heightFt;
  if (spec.speedKias) {
    const kias = Math.max(MIN_START_KIAS, wing.kias + spec.speedKias);
    wing.tasFtps *= kias / wing.kias;
    wing.kias = kias;
  }
}
/** The slowest a speed error starts #2 at: well clear of the 1 G stall (86 KIAS, core T6A_LIMITS); an estimate. */
const MIN_START_KIAS = 150;

// ---- the planner -------------------------------------------------------------------------------

/** #2 standing in his slot (the SMM picture) beside Lead as Lead is now, at Lead's speed. slot: { fwd, left } in Lead's frame. */
function inSlot(lead, wing, slot) {
  const u = unit(lead.headingRad);
  const n = { x: -u.y, y: u.x };
  return {
    ...copyAircraft(wing),
    kias: lead.kias,
    tasFtps: lead.tasFtps,
    xFt: lead.xFt + slot.fwd * u.x + slot.left * n.x,
    yFt: lead.yFt + slot.fwd * u.y + slot.left * n.y,
    altAboveFt: lead.altAboveFt,
    headingRad: lead.headingRad,
  };
}

/** Where a finished dry run is at formation time T: its end, carried straight on (the plan ends level and straight). */
function carriedTo(run, t0, T) {
  const a = run.end;
  const extra = Math.max(0, T - (t0 + run.durationSec));
  return { xFt: a.xFt + Math.cos(a.headingRad) * a.tasFtps * extra, yFt: a.yFt + Math.sin(a.headingRad) * a.tasFtps * extra, headingRad: a.headingRad };
}

/** #2's place in Lead's frame when both have finished (at the later of the two end times). */
function endPicture(leadRun, wingRun, t0) {
  const T = t0 + Math.max(leadRun.durationSec, wingRun.durationSec);
  return relativeTo(carriedTo(leadRun, t0, T), carriedTo(wingRun, t0, T));
}

const startOf = (segs, t0) => (segs[0]?.kind === 'hold' ? segs[0].untilSec : t0);

/** Moves the first roll-in later (or earlier, down to t0) by d seconds; later holds stay where they are. */
function shiftStart(segs, t0, d) {
  if (Math.abs(d) < 1e-9) return segs;
  if (segs[0]?.kind === 'hold') segs[0].untilSec = onStep(segs[0].untilSec + d);
  else if (d > 0) segs.unshift({ kind: 'hold', untilSec: onStep(t0 + d) });
  return segs;
}

/** Moves the whole programme later by d seconds: the first roll-in and every hold. */
function shiftWhole(segs, t0, d) {
  if (d <= 1e-9) return segs;
  for (const s of segs) if (s.kind === 'hold') s.untilSec = onStep(s.untilSec + d);
  if (segs[0]?.kind !== 'hold') segs.unshift({ kind: 'hold', untilSec: onStep(t0 + d) });
  return segs;
}

/**
 * #2's programme for a set of knobs x = [delay, reversal, bank1, bank2], from the standard one:
 *   delay     seconds later (or earlier) he rolls in than the standard
 *   reversal  seconds later the shackle's straight leg ends (no effect where there is no straight leg)
 *   bank1     bank of the first half of the turn (the first turn in a shackle or cross turn)
 *   bank2     bank of the second half (the last turn)
 * speedBack: a speed segment that brings a fast or slow #2 back to Lead's speed as he starts (or null): it is flown with
 * the turns (withNext), so every dry run of the plan includes it.
 */
function wingProgramme(base, heading0, x, t0, speedBack = null) {
  const [delay, reversal, bank1, bank2] = x;
  const segs = clone(base);
  const turns = segs.flatMap((s, i) => (s.kind === 'turn' ? [i] : []));
  const standard = turns.length === 1 && bank1 === segs[turns[0]].bankDeg && bank2 === bank1;
  if (turns.length === 1 && !standard) {
    const i = turns[0];
    const t = segs[i];
    const mid = wrapPi(heading0 + (t.dir * angleToGo(heading0, t.toRad, t.dir)) / 2); // halfway: the hook's 90
    segs.splice(i, 1, { ...t, toRad: mid, bankDeg: bank1, rollOut: false }, { ...t, bankDeg: bank2 });
  } else if (turns.length > 1) {
    segs[turns[0]].bankDeg = bank1;
    segs[turns[turns.length - 1]].bankDeg = bank2;
  }
  const holds = segs.flatMap((s, i) => (s.kind === 'hold' && i > 0 ? [i] : []));
  if (holds.length) segs[holds[holds.length - 1]].untilSec = onStep(segs[holds[holds.length - 1]].untilSec + reversal);
  const out = shiftStart(segs, t0, delay);
  if (speedBack) out.unshift({ ...speedBack });
  return out;
}

/**
 * Damped least squares on the knobs: moves the free ones to take the end picture's error
 * (feet along and across Lead's heading) toward zero, preferring small changes. The knobs are
 * clamped to their limits at every step, so a fix that can't be had is the nearest flyable one.
 * @param {(x: number[]) => [number, number]} errorAt
 */
function solveKnobs(errorAt, x0, lo, hi, free, scale) {
  const LAMBDA = 0.02; // how much a change costs against 100 ft of error left
  const RES = 100;
  const residual = (x) => {
    const [a, b] = errorAt(x);
    const r = [a / RES, b / RES];
    x.forEach((v, i) => free[i] && r.push(Math.sqrt(LAMBDA) * ((v - x0[i]) / scale[i])));
    return r;
  };
  const cost = (r) => r.reduce((s, v) => s + v * v, 0);
  const idx = x0.map((_, i) => i).filter((i) => free[i]);
  if (!idx.length) return x0.slice();
  let x = x0.slice();
  let r = residual(x);
  let f = cost(r);
  let mu = 0.01;
  for (let iter = 0; iter < 30 && mu < 1e8; iter++) {
    // Jacobian by forward differences, a step big enough to be felt through the 0.05 s step
    const J = idx.map((i) => {
      const h = i < 2 ? 0.5 : 1;
      const xp = x.slice();
      xp[i] = x[i] + (x[i] + h <= hi[i] ? h : -h);
      const rp = residual(xp);
      return rp.map((v, k) => (v - r[k]) / (xp[i] - x[i]));
    });
    const n = idx.length;
    const A = idx.map((_, a) => idx.map((__, b) => J[a].reduce((s, v, k) => s + v * J[b][k], 0)));
    const g = idx.map((_, a) => J[a].reduce((s, v, k) => s + v * r[k], 0));
    for (let a = 0; a < n; a++) A[a][a] += mu * (A[a][a] + 1e-6);
    const step = solveLinear(A, g.map((v) => -v));
    if (!step) {
      mu *= 4;
      continue;
    }
    const xn = x.slice();
    idx.forEach((i, a) => {
      xn[i] = Math.min(hi[i], Math.max(lo[i], x[i] + step[a]));
    });
    const rn = residual(xn);
    const fn = cost(rn);
    if (fn < f - 1e-9) {
      const moved = idx.reduce((m, i) => Math.max(m, Math.abs(xn[i] - x[i]) / scale[i]), 0);
      x = xn;
      r = rn;
      f = fn;
      mu = Math.max(mu / 3, 1e-6);
      if (moved < 1e-3) break;
    } else {
      mu *= 4;
    }
  }
  return x;
}

/** Solves A x = b for a small dense system (partial pivoting); null when it is singular. */
function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const k = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let j = r + 1; j < n; j++) s -= M[r][j] * x[j];
    x[r] = s / M[r][r];
  }
  return x;
}

/** The time the two aircraft are closest and how close (feet, three dimensions), over fine-step dry runs. */
function closestApproach(leadPlan, wingAircraft, wingPlan, lead, t0) {
  const fine = { sampleSec: STEP_SEC };
  const a = dryRun(lead, leadPlan, t0, fine).points;
  const b = dryRun(wingAircraft, wingPlan, t0, fine).points;
  let best = { t: t0, horizFt: Infinity, sepFt: Infinity };
  for (let i = 0; i < Math.min(a.length, b.length) - 1; i++) {
    const horiz = Math.hypot(a[i][1] - b[i][1], a[i][2] - b[i][2]);
    const h = heightAt(wingPlan.profile, a[i][0]);
    const vert = (h ? h.altAboveFt : b[i][3]) - a[i][3];
    if (horiz < best.horizFt) best = { t: a[i][0], horizFt: horiz, sepFt: Math.hypot(horiz, vert) };
  }
  return best;
}

/**
 * The crossing turns' height programme for #2: h0 up (or down) to `mid` for the cross, then to `hEnd`. It keeps the
 * standard miss profile's timing (missProfile), and stretches a leg that would climb faster than FIX_LIMITS.maxClimbFtps.
 */
function crossingProfile(t0, tCross, endSec, h0, mid, hEnd) {
  const [a, b, c] = missProfile(t0, tCross, endSec);
  const tA = Math.max(a.t1, t0 + climbSpan(mid - h0));
  const tB = Math.max(b.t1, tA);
  const tC = Math.max(c.t1, tB + 2, tB + climbSpan(hEnd - mid));
  return [
    { t0, t1: tA, fromFt: h0, toFt: mid },
    { t0: tA, t1: tB, fromFt: mid, toFt: mid },
    { t0: tB, t1: tC, fromFt: mid, toFt: hEnd },
  ];
}

/** The shortest time to change height by riseFt and stay under the climb limit (the smootherstep leg peaks at 1.875 × rise / span). */
const climbSpan = (riseFt) => (1.875 * Math.abs(riseFt)) / FIX_LIMITS.maxClimbFtps;

/**
 * The plan for a button press with errors set. pair: [lead, wing] as they are now; key, dir, t0 as
 * for planManoeuvre; spec: from resolveErrors; slot: where #2 should be in Lead's frame now
 * ({ fwd, left }, the formation keeps it); context: { tools (resolveFixTools; all ticked when left
 * out), blockFt (the block height, for the T-6A's excess thrust; 8,000 ft, F4, when left out) }.
 * Returns what planManoeuvre does, plus `slotAfter` (the slot after this manoeuvre) and
 * `errorRun` (what the card needs: see outcomeOf).
 */
export function planWithErrors(pair, key, dir, t0, spec, slot, context = {}) {
  const tools = { ...ALL_TOOLS, ...(context.tools ?? {}) };
  const blockFt = Number.isFinite(context.blockFt) ? context.blockFt : 8000;
  const plan = planCore(pair, key, dir, t0, spec, slot, tools, blockFt);
  // Not all out with the tools ticked: which unticked tool would have taken it out, or else the fewest together.
  let wouldFix = [];
  if (spec.response === 'fix' && !plan.fixedAtEnd) {
    const unticked = FIX_TOOLS.filter((t) => !tools[t.tool]);
    const fixesWith = (extra) => planCore(pair, key, dir, t0, spec, slot, { ...tools, ...Object.fromEntries(extra.map((t) => [t.tool, true])) }, blockFt).fixedAtEnd;
    const groups = (n, from = 0) => (n === 0 ? [[]] : unticked.slice(from).flatMap((t, i) => groups(n - 1, from + i + 1).map((g) => [t, ...g])));
    for (let n = 1; n <= unticked.length && !wouldFix.length; n++) {
      wouldFix = groups(n).filter((g) => fixesWith(g)).map((g) => g.map((t) => t.label).join(' and '));
    }
  }
  plan.errorRun.wouldFix = wouldFix;
  delete plan.fixedAtEnd;
  return plan;
}

/** planWithErrors for one set of tools, without the "which tool would have fixed it" search. */
function planCore(pair, key, dir, t0, spec, slot, tools, blockFt) {
  const [lead, wing] = pair;
  const nomWing = inSlot(lead, wing, slot);
  const nominal = planManoeuvre([lead, nomWing], key, dir, t0);
  const leadNom = nominal.plans[lead.id].segments;
  const wingNom = nominal.plans[wing.id].segments;
  const crossing = Boolean(nominal.plans[wing.id].profile);
  const fixing = spec.response === 'fix';
  const geometry = fixing && tools.geometry;

  // The SMM picture: both flown with #2 in his slot, at the standard time, at the standard bank.
  const leadNomRun = dryRun(lead, { segments: leadNom }, t0);
  const target = endPicture(leadNomRun, dryRun(nomWing, { segments: wingNom }, t0), t0);

  const wingStart = startOf(wingNom, t0);
  const bank0 = wingNom.flatMap((s) => (s.kind === 'turn' ? [s.bankDeg] : []));
  const x0 = [0, 0, bank0[0], bank0[bank0.length - 1]];
  const bankLo = Math.min(FIX_LIMITS.bankDeg[0], ...bank0);
  const bankHi = Math.max(FIX_LIMITS.bankDeg[1], ...bank0);
  const hasReversal = wingNom.some((s, i) => s.kind === 'hold' && i > 0);
  const lo = [t0 - wingStart, -FIX_LIMITS.reversalSec, bankLo, bankLo];
  const hi = [FIX_LIMITS.extraDelaySec, FIX_LIMITS.reversalSec, bankHi, bankHi];
  const scale = [5, 5, 8, 8];

  const heading0 = wing.headingRad;
  // A fast or slow #2 (the speed error) brings his speed back to Lead's as he starts, in either response: with power back
  // or full power (slow-down.js), flown with the turns. What he gains or loses on the way is a fore/aft error to fix or carry.
  const speedBack = Math.abs(wing.kias - lead.kias) > 0.5 ? { ...speedSegFor(wing.kias, lead.kias, blockFt, 'power'), withNext: true } : null;
  /** @returns {[number, number]} */
  const sub = (a, b) => [a.fwd - b.fwd, a.left - b.left];
  const lateBy = spec.timingSec;

  /** The timing error on top of intended knobs: #2 rolls in `lateBy` s off; an early roll-in before the call makes Lead wait. */
  const withTiming = (xk) => {
    const intended = wingStart + xk[0];
    const flown = intended + lateBy;
    const delay = Math.max(flown, t0) - wingStart;
    return { x: [delay, xk[1], xk[2], xk[3]], leadShift: Math.max(0, t0 - flown) };
  };
  const leadPlanFor = (leadShift) => ({ segments: shiftWhole(clone(leadNom), t0, leadShift) });

  // Geometry, pass 1: the knobs that correct the position errors, worked out for a wingman who rolls in on time.
  let intended = x0;
  if (geometry && (spec.foreFt || spec.spacingFt)) {
    const free = [true, hasReversal, true, true];
    intended = solveKnobs(
      (xk) => sub(endPicture(leadNomRun, dryRun(wing, { segments: wingProgramme(wingNom, heading0, xk, t0, speedBack) }, t0), t0), target),
      x0, lo, hi, free, scale,
    );
  }
  // Geometry, pass 2: the timing error lands on the roll-in; a fix then works with what is left (the banks and the reversal).
  const timed = withTiming(intended);
  const leadPlan = leadPlanFor(timed.leadShift);
  const leadRun = dryRun(lead, leadPlan, t0);
  let xFinal = timed.x;
  if (geometry && lateBy) {
    const free = [false, hasReversal, true, true];
    const lo2 = lo.slice();
    const hi2 = hi.slice();
    lo2[0] = hi2[0] = timed.x[0];
    xFinal = solveKnobs(
      (xk) => sub(endPicture(leadRun, dryRun(wing, { segments: wingProgramme(wingNom, heading0, xk, t0, speedBack) }, t0), t0), target),
      timed.x, lo2, hi2, free, scale,
    );
  }

  // What the same press would give with no fix: the standard programme, only the roll-in off.
  const refX = withTiming(x0);
  const refLeadRun = dryRun(lead, leadPlanFor(refX.leadShift), t0);
  const refRun = dryRun(wing, { segments: wingProgramme(wingNom, heading0, refX.x, t0, speedBack) }, t0);
  const uncorrected = sub(endPicture(refLeadRun, refRun, t0), target);

  const x = geometry ? xFinal : refX.x;
  const leadPlanFinal = geometry ? leadPlan : leadPlanFor(refX.leadShift);
  const leadRunFinal = geometry ? leadRun : refLeadRun;
  let segments = wingProgramme(wingNom, heading0, x, t0, speedBack);
  const wingRun = dryRun(wing, { segments }, t0);

  // Height. A crossing turn's miss is made around where they really cross (a fix always makes the
  // 300 ft miss, SMM 16.13 para 31); Vertical also flies back to Lead's height.
  const h0 = wing.altAboveFt - lead.altAboveFt;
  const vertical = fixing && tools.vertical;
  let profile;
  let minSepFt = null;
  const endSec = t0 + Math.max(leadRunFinal.durationSec, wingRun.durationSec);
  if (crossing) {
    const at = closestApproach(leadPlanFinal, wing, { segments }, lead, t0);
    let mid = h0 + VERTICAL_MISS_FT;
    let hEnd = h0;
    if (fixing) {
      mid = Math.abs(h0) >= VERTICAL_MISS_FT ? h0 : (h0 >= 0 ? 1 : -1) * VERTICAL_MISS_FT;
      hEnd = vertical ? 0 : h0;
    }
    profile = crossingProfile(t0, at.t, endSec, h0, mid, hEnd);
    minSepFt = closestApproach(leadPlanFinal, wing, { segments, profile }, lead, t0).sepFt;
  } else if (vertical && Math.abs(h0) > 1) {
    const span = Math.max(4, climbSpan(h0));
    profile = [{ t0, t1: t0 + span, fromFt: h0, toFt: 0 }];
  }
  if (profile) {
    const profileEnd = profile[profile.length - 1].t1;
    if (profileEnd > endSec) segments.push({ kind: 'hold', untilSec: onStep(profileEnd + STEP_SEC) }); // the plan isn't done until the height is
  }

  // The roll-out fix: a heading change in or out (Lateral) and a speed change (Speed/power, with a dive or zoom when Vertical is ticked).
  let rollOut = null;
  if (fixing && (tools.lateral || tools.speed)) {
    rollOut = planRollOutFix({ lead, wing, t0, segments, profile, leadRun: leadRunFinal, target, tools, blockFt, h0 });
    segments = rollOut.segments;
    profile = rollOut.profile;
  }
  const finalRun = dryRun(wing, { segments, profile }, t0);
  const residual = sub(endPicture(leadRunFinal, finalRun, t0), target);
  const endHeightFt = (profile?.length ? profile[profile.length - 1].toFt : h0);

  const banks = [x[2], x[3]];
  const maxG = Math.max(...banks.map((b) => gFromBankDeg(b)));
  const flags = [];
  if (geometry && maxG > 3.05) flags.push(`flies ${maxG.toFixed(1)} G, more than the 3 G standard (SMM 16.18 para 50)`);
  if (minSepFt !== null && minSepFt < VERTICAL_MISS_FT) flags.push(`passes Lead ${Math.round(minSepFt)} ft away, under the 300 ft minimum (SMM 16.13 para 31)`);

  const total = (r) => Math.hypot(r[0], r[1]);
  const note = fixing
    ? fixNote({ x, intended, x0, banks, hasReversal, h0, vertical, rollOut, target, leadKias: lead.kias })
    : '#2 flies the standard turn for his slot at the standard time, so the error carries.';
  return {
    plans: { [lead.id]: leadPlanFinal, [wing.id]: { segments, profile } },
    note: `${nominal.note}${note ? ` ${note}` : ''}${speedBack ? ` #2 brings his speed back to Lead's ${Math.round(lead.kias)} KIAS as he starts (${Math.round(Math.abs(wing.kias - lead.kias))} KIAS ${wing.kias > lead.kias ? 'fast' : 'slow'}).` : ''}${flags.length ? ` #2 ${flags.join('; ')}.` : ''}`,
    firstId: nominal.firstId,
    slotAfter: { fwd: target.fwd, left: target.left },
    errorRun: { response: spec.response, target, uncorrectedFt: total(uncorrected), predictedFt: total(residual), startHeightFt: h0, flags, banks, tools: { ...tools }, wouldFix: [] },
    fixedAtEnd: total(residual) <= FIXED_WITHIN_FT && Math.abs(endHeightFt) <= FIXED_WITHIN_FT,
  };
}

// ---- the roll-out fix: Lateral spacing and Speed/power ------------------------------------------

/**
 * How long a smooth speed change of dKias from kias0 takes at the least (seconds), flown with a height change of
 * dHeightFt over the same time (0 for none, minus for a dive). What it needs is the specific excess power
 *     P = dh/dt + (V / g) dV/dt           (standard aerodynamics, energy height)
 * which on the smootherstep is slope(u) / span × [dHeightFt + (V / g) ΔV]. More than zero, full power must give
 * it (the T-6A's excess thrust × V, core excessThrustPerWeight); less than zero, the power back must take it,
 * and that is what the power back gives level (slow-down.js, TS-61). The height change also keeps
 * under FIX_LIMITS.maxClimbFtps and FIX_LIMITS.pushPullG. A dive that pays for the speed (dHeightFt = -(V / g) ΔV) needs no power at all.
 * Infinity when full power can't give it (past the T-6A's top speed at this height).
 */
function rampSpanSec(kias0, dKias, dHeightFt, tasPerKias, altFt) {
  // The smootherstep's vertical acceleration peaks at (10 / √3) × rise / span², kept under the push or pull limit.
  const pushPull = Math.sqrt(((10 / Math.sqrt(3)) * Math.abs(dHeightFt)) / (FIX_LIMITS.pushPullG * G_FTPS2));
  let span = Math.max(pushPull, (SMOOTHER_PEAK * Math.abs(dHeightFt)) / FIX_LIMITS.maxClimbFtps);
  const N = 40;
  for (let i = 1; i < N; i++) {
    const u = i / N;
    const kias = kias0 + dKias * smoother(u);
    const v = kias * tasPerKias;
    const need = dHeightFt + (v / G_FTPS2) * dKias * tasPerKias; // feet of energy height per unit of the curve
    const slope = smootherSlope(u);
    if (need > 0) {
      const power = excessThrustPerWeight(kias, altFt, 1) * v;
      if (power <= 0) return Infinity;
      span = Math.max(span, (slope * need) / power);
    } else if (need < 0) {
      const idle = (v / G_FTPS2) * slowKtps('power', kias, altFt) * tasPerKias;
      span = Math.max(span, (slope * -need) / idle);
    }
  }
  return span;
}

/**
 * The speed change that gains `gainFt` on Lead (minus to lose it): up (or down) by dKias, a straight hold, back to
 * Lead's speed; with Vertical, a dive while speeding up and a climb back while slowing (or a zoom then a descent).
 * The smallest speed change that does it, up to FIX_LIMITS.speedKias; past that the hold grows. minHoldSec keeps the
 * change going until the lateral fix is over, so the speed only comes back on a straight leg.
 * Returns { dKias, upSec, backSec, holdSec, diveFt } (dKias and diveFt signed).
 */
function speedPulse(gainFt, leadKias, tasPerKias, altFt, vertical, minHoldSec) {
  const sign = Math.sign(gainFt);
  const shape = (dk) => {
    const dv = dk * tasPerKias; // ft/s of true airspeed
    const diveFt = vertical ? -sign * Math.min(FIX_LIMITS.diveFt, ((leadKias * tasPerKias) / G_FTPS2) * dv) : 0;
    const upSec = rampSpanSec(leadKias, sign * dk, diveFt, tasPerKias, altFt);
    const backSec = rampSpanSec(leadKias + sign * dk, -sign * dk, -diveFt, tasPerKias, altFt);
    // The smootherstep spends half its time's worth at the new speed: gain = ΔV (up/2 + hold + back/2).
    const rampsFt = dv * (upSec / 2 + minHoldSec + backSec / 2);
    return { dKias: sign * dk, upSec, backSec, holdSec: minHoldSec, diveFt, dv, rampsFt };
  };
  let top = Number(FIX_LIMITS.speedKias);
  while (top > 1 && !Number.isFinite(shape(top).upSec + shape(top).backSec)) top -= 1; // what full power can reach here
  const full = shape(top);
  if (!Number.isFinite(full.rampsFt)) return null;
  if (full.rampsFt <= Math.abs(gainFt)) return { ...full, holdSec: minHoldSec + (Math.abs(gainFt) - full.rampsFt) / full.dv };
  let a = 0;
  let b = top;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (shape(m).rampsFt < Math.abs(gainFt)) a = m;
    else b = m;
  }
  return shape(b);
}

/**
 * The heading change that moves #2 `moveFt` across (plus is to Lead's left) after the roll-out: turn a few degrees,
 * hold, turn back, like the shackle's turn, hold, turn (SMM 16.19 para 61). The angle is sized so the hold takes
 * about FIX_LIMITS.lateralHoldSec, up to FIX_LIMITS.headingDeg; a small move turns less and doesn't hold.
 * Sideways from a turn of angle θ and back, at radius R: 2R(1 − cos θ), plus V t sin θ held between.
 * Returns { dir, angleRad, holdSec }.
 */
export function lateralLeg(moveFt, tasFtps) {
  const dir = Math.sign(moveFt) || 1;
  const m = Math.abs(moveFt);
  const R = turnRadiusFromBankFt(tasFtps, FIX_LIMITS.lateralBankDeg);
  const maxRad = FIX_LIMITS.headingDeg * DEG;
  let angleRad = Math.min(maxRad, Math.asin(Math.min(1, m / (tasFtps * FIX_LIMITS.lateralHoldSec))));
  let holdSec = (m - 2 * R * (1 - Math.cos(angleRad))) / (tasFtps * Math.sin(angleRad));
  if (!(holdSec > 0)) {
    angleRad = Math.min(maxRad, Math.acos(Math.max(-1, 1 - m / (2 * R))));
    holdSec = 0;
  }
  return { dir, angleRad, holdSec };
}

/** When each speed change in a plan begins and ends (formation seconds), from a fine dry run of the plan itself. */
function speedChangeTimes(aircraft, plan, t0) {
  const a = copyAircraft(aircraft);
  const p = { segments: plan.segments.map((s) => ({ ...s })), profile: plan.profile };
  const legs = [];
  let t = t0;
  for (let i = 0; i < 12000 && !planDone(a, p); i++) {
    stepAircraft(a, p, t);
    if (p.speedLeg && legs[legs.length - 1] !== p.speedLeg) legs.push(p.speedLeg);
    t += STEP_SEC;
  }
  return legs.map((l) => ({ t0: l.t0, t1: l.t1 }));
}

/**
 * The roll-out fix, after #2's own manoeuvre (base `segments` and height `profile`): Lateral spacing takes out what
 * is left across Lead's heading, Speed/power what is left along it (including what the heading change costs along),
 * each worked out from the measured end picture and corrected from full dry runs, so the plan is exact for what is flown.
 * Returns { segments, profile, lateral, speed } (lateral and speed null when not flown).
 */
function planRollOutFix({ lead, wing, t0, segments: own, profile, leadRun, target, tools, blockFt, h0 }) {
  // The roll-out fix starts once #2's own manoeuvre and its height legs are both done (a crossing turn's descent can outlast the turn).
  const profileEnd = profile?.length ? profile[profile.length - 1].t1 : t0;
  const ownEnd = t0 + dryRun(wing, { segments: own, profile }, t0).durationSec;
  const segments = profileEnd > ownEnd ? [...own, { kind: 'hold', untilSec: onStep(profileEnd + STEP_SEC) }] : own;
  const baseRun = dryRun(wing, { segments, profile }, t0);
  const tR = t0 + baseRun.durationSec; // the step the roll-out fix starts on
  const tas = baseRun.end.tasFtps;
  const tasPerKias = tas / baseRun.end.kias;
  const leadKias = lead.kias;
  const hBase = profile?.length ? profile[profile.length - 1].toFt : h0;
  const leadHeading = leadRun.end.headingRad;
  const vertical = tools.vertical;
  const turnOutSec = (angleRad) => dryRun(baseRun.end, { segments: [turnSeg(wrapPi(leadHeading + angleRad), 1, FIX_LIMITS.lateralBankDeg)] }, tR).durationSec;

  let moveFt = 0;
  let gainFt = 0;
  let best = { segments, profile, lateral: null, speed: null, errFt: Infinity };
  for (let iter = 0; iter < 6; iter++) {
    const lateral = tools.lateral && Math.abs(moveFt) >= NOTHING_TO_FIX_FT ? lateralLeg(moveFt, tas) : null;
    let latEnd = tR;
    const latSegs = [];
    if (lateral) {
      const out = turnOutSec(lateral.angleRad);
      latSegs.push(turnSeg(wrapPi(leadHeading + lateral.dir * lateral.angleRad), lateral.dir, FIX_LIMITS.lateralBankDeg));
      if (lateral.holdSec > 0) latSegs.push({ kind: 'hold', untilSec: onStep(tR + out + lateral.holdSec) });
      latSegs.push(turnSeg(leadHeading, -lateral.dir, FIX_LIMITS.lateralBankDeg));
      latEnd = tR + out + Math.max(0, lateral.holdSec) + out;
    }
    const minHold = (upSec) => Math.max(0, latEnd - (tR + upSec));
    let speed = null;
    if (tools.speed && Math.abs(gainFt) >= NOTHING_TO_FIX_FT) {
      // The hold the lateral fix needs depends on the ramp, which depends on the speed: two passes settle it.
      speed = speedPulse(gainFt, leadKias, tasPerKias, blockFt, vertical, 0);
      if (speed) speed = speedPulse(gainFt, leadKias, tasPerKias, blockFt, vertical, minHold(speed.upSec));
    }
    const segs = [...segments];
    if (speed) segs.push({ kind: 'speed', toKias: leadKias + speed.dKias, rateKtps: Math.abs(speed.dKias) / speed.upSec, withNext: true });
    segs.push(...latSegs);
    if (speed) {
      segs.push({ kind: 'hold', untilSec: onStep(tR + speed.upSec + speed.holdSec) });
      segs.push({ kind: 'speed', toKias: leadKias, rateKtps: Math.abs(speed.dKias) / speed.backSec });
    }
    let prof = profile ? profile.map((l) => ({ ...l })) : undefined;
    if (speed && speed.diveFt) {
      // The dive (or zoom) is flown over exactly the time each speed change takes, so the energy adds up.
      const [up, back] = speedChangeTimes(wing, { segments: segs, profile }, t0);
      prof = [...(prof ?? []),
        { t0: up.t0, t1: up.t1, fromFt: hBase, toFt: hBase + speed.diveFt },
        { t0: back.t0, t1: back.t1, fromFt: hBase + speed.diveFt, toFt: hBase }];
    }
    const run = dryRun(wing, { segments: segs, profile: prof }, t0);
    const end = endPicture(leadRun, run, t0);
    const res = { fwd: end.fwd - target.fwd, left: end.left - target.left };
    const errFt = Math.hypot(tools.speed ? res.fwd : 0, tools.lateral ? res.left : 0);
    if (errFt < best.errFt) best = { segments: segs, profile: prof, lateral, speed, errFt };
    if (errFt < 1) break;
    if (tools.lateral) moveFt -= res.left;
    if (tools.speed) gainFt -= res.fwd;
  }
  return best;
}

/** What a fix did, in words: the timing and bank changes, the height, the heading change and the speed change. */
function fixNote({ x, intended, x0, banks, hasReversal, h0, vertical, rollOut, target, leadKias }) {
  const parts = [];
  const shift = intended[0] - x0[0];
  if (Math.abs(shift) >= 0.1) parts.push(`rolls in ${Math.abs(shift).toFixed(1)} s ${shift < 0 ? 'earlier' : 'later'} than standard`);
  const [b1, b2] = banks;
  const word = (b) => `${Math.round(b)}° (${gFromBankDeg(b).toFixed(1)} G)`;
  if (Math.abs(b1 - x0[2]) >= 1 || Math.abs(b2 - x0[3]) >= 1) parts.push(`flies ${word(b1)} then ${word(b2)} (standard ${word(x0[2])} then ${word(x0[3])})`);
  const rev = x[1];
  if (hasReversal && Math.abs(rev) >= 0.1) parts.push(`reverses ${Math.abs(rev).toFixed(1)} s ${rev < 0 ? 'earlier' : 'later'}`);
  if (vertical && Math.abs(h0) > 1) parts.push("flies back to Lead's height");
  const lat = rollOut?.lateral;
  if (lat) {
    const way = Math.abs(target.left) > 100 ? (lat.dir === Math.sign(target.left) ? 'out' : 'in') : (lat.dir > 0 ? 'left' : 'right');
    parts.push(`turns ${(lat.angleRad / DEG).toFixed(0)}° ${way} after the roll-out${lat.holdSec > 0 ? ` for ${lat.holdSec.toFixed(0)} s` : ''} and back`);
  }
  const sp = rollOut?.speed;
  if (sp) {
    const up = sp.dKias > 0;
    let words = `${up ? 'adds' : 'takes off'} ${Math.abs(sp.dKias).toFixed(0)} KIAS (to ${Math.round(leadKias + sp.dKias)}) for about ${(sp.upSec + sp.holdSec + sp.backSec).toFixed(0)} s, then matches Lead`;
    if (sp.diveFt) words += `, ${up ? 'diving' : 'zooming'} ${Math.abs(sp.diveFt).toFixed(0)} ft and back on height`;
    parts.push(words);
  }
  return parts.length ? `Fix it: #2 ${parts.join(', ')}.` : 'Fix it: nothing to change here.';
}

// ---- the card ------------------------------------------------------------------------------------

/** A residual (feet along and across Lead's heading) in words, wide or tight judged against the SMM picture's side. */
function wordsFor(res, target) {
  const parts = [];
  if (Math.abs(res.fwd) >= 50) parts.push(`${ftText(Math.abs(res.fwd))} ${res.fwd > 0 ? 'ahead' : 'behind'}`);
  if (Math.abs(res.left) >= 50) {
    if (Math.abs(target.left) > 100) parts.push(`${ftText(Math.abs(res.left))} ${res.left * Math.sign(target.left) > 0 ? 'wide' : 'tight'}`);
    else parts.push(`${ftText(Math.abs(res.left))} off line to ${res.left > 0 ? 'Lead\'s left' : 'Lead\'s right'}`);
  }
  return parts;
}

/**
 * The Errors line on the card once a change of formation flown from a training error's start ends (TS-62; TS-94): whether
 * #2 joined. off: the chooser's { mode } ('fix' or 'reference'). Since V2.93 the chooser plans it from where the error put
 * him (until then hot-rejoin.js flew it, with the overshoot); the response switch is refactor PR 3's Smart wingman.
 */
export function offStandardOutcome(off, inBand, label) {
  const how = off.mode === 'reference' ? 'flew the change from where the error left him' : 'fixed it from where the error left him';
  const end = inBand ? 'ended in position' : 'ended outside the band (see the judged line)';
  return { label, response: off.mode, fixed: off.mode === 'fix', text: `${label}: #2 ${how}, and ${end}.`, tone: inBand ? 'good' : 'caution' };
}

/**
 * After the roll-out: how far #2 is from the SMM picture, and whether the fix worked. run: the plan's
 * `errorRun`; lead and wing as they are now. Fixed means within the shared ±100 ft, along, across and up.
 */
export function outcomeOf(run, lead, wing, label) {
  const rel = relativeTo(lead, wing);
  const res = { fwd: rel.fwd - run.target.fwd, left: rel.left - run.target.left };
  const totalFt = Math.hypot(res.fwd, res.left);
  const vertFt = wing.altAboveFt - lead.altAboveFt;
  const parts = wordsFor(res, run.target);
  if (Math.abs(vertFt) >= 50) parts.push(`${ftText(Math.abs(vertFt))} ${vertFt > 0 ? 'high' : 'low'}`);
  const inPosition = totalFt <= FIXED_WITHIN_FT && Math.abs(vertFt) <= FIXED_WITHIN_FT;
  const carriedWords = run.uncorrectedFt > FIXED_WITHIN_FT ? `carried, it would have ended ${ftText(run.uncorrectedFt)} out` : '';
  let text;
  let fixed = false;
  if (run.response === 'reference') {
    text = inPosition
      ? `${label}: #2 turned at the normal reference and ended in position; this error does not change this end picture.`
      : `${label}: #2 turned at the normal reference, so the error carried through: ${parts.join(', ')}.`;
  } else if (inPosition) {
    fixed = true;
    text = run.uncorrectedFt > FIXED_WITHIN_FT || Math.abs(run.startHeightFt) > FIXED_WITHIN_FT
      ? `${label}: #2 fixed it and ended in position${carriedWords ? `; ${carriedWords}` : ''}.`
      : `${label}: this error does not change the end picture here; #2 ended in position.`;
  } else {
    const would = run.wouldFix?.length
      ? ` Ticking ${run.wouldFix.join(' or ')} in Fix tools would have taken it out.`
      : ' That is more than the ticked Fix tools can take out inside their limits.';
    text = `${label}: #2 fixed part of it and ended ${parts.join(', ')}${carriedWords ? `; ${carriedWords}` : ''}.${would}`;
  }
  return { label, response: run.response, fixed, totalFt, vertFt, uncorrectedFt: run.uncorrectedFt, residual: { fwdFt: res.fwd, leftFt: res.left }, text, tone: inPosition ? 'good' : 'caution', flags: run.flags };
}

/** The lines for the Formation card: { set, outcome: { text, tone } | null } or null when no error is set. */
export function errorCardLines(state) {
  if (!state.errors) return null;
  const o = state.errorOutcome;
  return { set: describeErrors(state.errors), outcome: o ? { text: o.text, tone: o.tone } : null };
}
