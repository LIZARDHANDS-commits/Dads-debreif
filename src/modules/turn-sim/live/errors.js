// Training errors for the wingman (Turn Sim, TS-52; Patrick, 4 Oct 2026, 10:51Z:
// "introduce errors ... the wing man either turns at normal reference OR fixes
// it"). An error is two things:
//   1. an offset on #2's start state (ahead of or behind the 3/9 line, wide or
//      tight, high or low) and a timing error on #2's roll-in (early or late);
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
// A fix can only use what is flyable at constant speed: the roll-in time, the bank in
// each half of the turn, the shackle's reversal time, and a smooth climb or descent.
// Whatever is left after that is what the SMM leaves for the roll-out (speed changes
// and small heading changes are a later step, docs/modules/turn-sim/future.md).
import { wrapPi } from '../../../core/angles.js';
import { gFromBankDeg } from '../../../core/flight-math.js';
import { STEP_SEC, copyAircraft, heightAt, angleToGo } from './flight.js';
import { planManoeuvre, dryRun, relativeTo, missProfile, onStep, VERTICAL_MISS_FT } from './manoeuvres.js';

// ---- the settings ------------------------------------------------------------------------

/**
 * Every setting and its default. All errors start at 'none', so the default start is
 * unchanged. The amounts are what an error means when it is chosen.
 *   errFore      along the line of the 3/9: 'ahead' (sucked) or 'behind' (acute)
 *   errSpacing   across it: 'wide' or 'tight', measured from Lead on #2's own side (TS-2)
 *   errHeight    'high' or 'low' against Lead
 *   errTiming    #2 rolls in 'early' or 'late' against the standard time
 *   errResponse  'fix' or 'reference' (see the top of this file)
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
  errResponse: 'fix', // the wingman corrects "regardless of how it developed" (SMM 16.18 para 50)
  errRandom: false,
}));

/** The settings that only allow some choices (createSettings' `allowed`). */
export const ERROR_ALLOWED = /** @type {Record<string, any[]>} */ (Object.freeze({
  errFore: ['none', 'ahead', 'behind'],
  errSpacing: ['none', 'wide', 'tight'],
  errHeight: ['none', 'high', 'low'],
  errTiming: ['none', 'early', 'late'],
  errResponse: ['fix', 'reference'],
}));

/**
 * The boxes of the "Errors (training)" section, for the screen to build: each is a choice and
 * the amount that goes with it. The words in brackets are Patrick's (4 Oct 2026); the manuals
 * say forward/back, in/out and up/down (SMM 12.18 para 39), so these are working readings.
 */
export const ERROR_FIELDS = Object.freeze([
  { key: 'errFore', label: 'Along the 3/9 line', amountKey: 'errForeFt', unit: 'ft', min: 100, max: 3000, step: 100, options: [{ value: 'none', label: 'None' }, { value: 'ahead', label: 'Ahead (sucked)' }, { value: 'behind', label: 'Behind (acute)' }] },
  { key: 'errSpacing', label: 'Spacing', amountKey: 'errSpacingFt', unit: 'ft', min: 100, max: 3000, step: 100, options: [{ value: 'none', label: 'None' }, { value: 'wide', label: 'Wide' }, { value: 'tight', label: 'Tight' }] },
  { key: 'errHeight', label: 'Height', amountKey: 'errHeightFt', unit: 'ft', min: 100, max: 2000, step: 100, options: [{ value: 'none', label: 'None' }, { value: 'high', label: 'High' }, { value: 'low', label: 'Low' }] },
  { key: 'errTiming', label: 'Roll-in', amountKey: 'errTimingSec', unit: 's', min: 0.5, max: 10, step: 0.5, options: [{ value: 'none', label: 'On time' }, { value: 'early', label: 'Early' }, { value: 'late', label: 'Late' }] },
]);
export const RESPONSE_OPTIONS = Object.freeze([{ value: 'fix', label: 'Fix it' }, { value: 'reference', label: 'Turn at normal reference' }]);

/**
 * What a fix may use. Estimates, flagged on the card when passed, never walls except that the
 * aircraft can't be asked for more than it can fly: bank 50° to 75° is 1.6 to 3.9 G, under the
 * wingman's +5 G reference (Gen Book p.11) and the rolling limit of 4.7 G (SMM/NFM via t6-performance).
 */
export const FIX_LIMITS = Object.freeze({
  bankDeg: [50, 75],
  extraDelaySec: 30, // longest it will hold off a roll-in to fix a position, beyond the standard
  reversalSec: 20, // how far the shackle's reversal may move either way
  maxClimbFtps: 60, // 3,600 fpm, estimate: the cross turn's standard miss already peaks at about 60 ft/s
});

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
 * spacingFt + wide, heightFt + high, timingSec + late.
 * @param {Record<string, any>} [options]  formation options holding the err* keys
 * @param {() => number} [rng]  a random number in [0, 1), for the random option
 * @returns {null | { foreFt: number, spacingFt: number, heightFt: number, timingSec: number, response: 'fix' | 'reference', random: boolean }}
 */
export function resolveErrors(options = {}, rng = Math.random) {
  const o = { ...ERROR_DEFAULTS };
  for (const key of Object.keys(ERROR_DEFAULTS)) if (options[key] !== undefined) o[key] = options[key];
  const response = o.errResponse === 'reference' ? 'reference' : 'fix';
  if (o.errRandom === true) return randomError(rng, response);
  const signed = (choice, plus, minus, amount) => (choice === plus ? 1 : choice === minus ? -1 : 0) * Math.abs(num(amount, 0));
  /** @type {{ foreFt: number, spacingFt: number, heightFt: number, timingSec: number, response: 'fix' | 'reference', random: boolean }} */
  const spec = {
    foreFt: signed(o.errFore, 'ahead', 'behind', o.errForeFt),
    spacingFt: signed(o.errSpacing, 'wide', 'tight', o.errSpacingFt),
    heightFt: signed(o.errHeight, 'high', 'low', o.errHeightFt),
    timingSec: signed(o.errTiming, 'late', 'early', o.errTimingSec),
    response,
    random: false,
  };
  return spec.foreFt || spec.spacingFt || spec.heightFt || spec.timingSec ? spec : null;
}

/** The ranges a random error is drawn from (estimates, inside the same ranges as the boxes). */
const RANDOM_RANGES = Object.freeze({ fore: [500, 2500, 100], spacing: [1000, 2500, 100], height: [300, 1000, 100], timing: [2, 6, 0.5] });

/**
 * One error of a random kind, a random way and size, for the "Random error" option.
 * @param {() => number} rng
 * @param {'fix' | 'reference'} response
 */
function randomError(rng, response) {
  const kinds = ['fore', 'spacing', 'height', 'timing'];
  const kind = kinds[Math.min(kinds.length - 1, Math.floor(rng() * kinds.length))];
  const [lo, hi, step] = RANDOM_RANGES[kind];
  const amount = lo + Math.round((rng() * (hi - lo)) / step) * step;
  const sign = rng() < 0.5 ? -1 : 1;
  const spec = { foreFt: 0, spacingFt: 0, heightFt: 0, timingSec: 0, response, random: true };
  spec[{ fore: 'foreFt', spacing: 'spacingFt', height: 'heightFt', timing: 'timingSec' }[kind]] = sign * amount;
  return spec;
}

/** The error in words for the Formation card: "#2 ahead of the line 1,500 ft, wide 2,000 ft, 3 s late". */
export function describeErrors(spec) {
  if (!spec) return '';
  const parts = [];
  if (spec.foreFt) parts.push(`${spec.foreFt > 0 ? 'ahead of' : 'behind'} the 3/9 line ${ftText(Math.abs(spec.foreFt))}`);
  if (spec.spacingFt) parts.push(`${spec.spacingFt > 0 ? 'wide' : 'tight'} ${ftText(Math.abs(spec.spacingFt))}`);
  if (spec.heightFt) parts.push(`${ftText(Math.abs(spec.heightFt))} ${spec.heightFt > 0 ? 'high' : 'low'}`);
  if (spec.timingSec) parts.push(`rolls in ${Math.abs(spec.timingSec)} s ${spec.timingSec > 0 ? 'late' : 'early'}`);
  const how = spec.response === 'fix' ? 'Fix it' : 'Turn at normal reference';
  return `${spec.random ? 'Random error' : 'Error'}: #2 ${parts.join(', ')}. Response: ${how}.`;
}

/**
 * Moves #2 to his error start (a copy of nothing: `wing` itself is changed). The offsets are
 * measured in Lead's frame from where #2 stands now: along the 3/9 line, across it (wide is away
 * from Lead on #2's own side, tight toward him; TS-2), and in height.
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
}

// ---- the planner -------------------------------------------------------------------------------

/** #2 standing in his slot (the SMM picture) beside Lead as Lead is now. slot: { fwd, left } in Lead's frame. */
function inSlot(lead, wing, slot) {
  const u = unit(lead.headingRad);
  const n = { x: -u.y, y: u.x };
  return {
    ...copyAircraft(wing),
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
 */
function wingProgramme(base, heading0, x, t0) {
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
  return shiftStart(segs, t0, delay);
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
 * ({ fwd, left }, the formation keeps it).
 * Returns what planManoeuvre does, plus `slotAfter` (the slot after this manoeuvre) and
 * `errorRun` (what the card needs: see outcomeOf).
 */
export function planWithErrors(pair, key, dir, t0, spec, slot) {
  const [lead, wing] = pair;
  const nomWing = inSlot(lead, wing, slot);
  const nominal = planManoeuvre([lead, nomWing], key, dir, t0);
  const leadNom = nominal.plans[lead.id].segments;
  const wingNom = nominal.plans[wing.id].segments;
  const crossing = Boolean(nominal.plans[wing.id].profile);

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

  // Pass 1 (fix only): the knobs that correct the position errors, worked out for a wingman who rolls in on time.
  let intended = x0;
  if (spec.response === 'fix' && (spec.foreFt || spec.spacingFt)) {
    const free = [true, hasReversal, true, true];
    intended = solveKnobs(
      (xk) => sub(endPicture(leadNomRun, dryRun(wing, { segments: wingProgramme(wingNom, heading0, xk, t0) }, t0), t0), target),
      x0, lo, hi, free, scale,
    );
  }
  // Pass 2: the timing error lands on the roll-in; a fix then works with what is left (the banks and the reversal).
  const timed = withTiming(intended);
  const leadPlan = leadPlanFor(timed.leadShift);
  const leadRun = dryRun(lead, leadPlan, t0);
  let xFinal = timed.x;
  if (spec.response === 'fix' && lateBy) {
    const free = [false, hasReversal, true, true];
    const lo2 = lo.slice();
    const hi2 = hi.slice();
    lo2[0] = hi2[0] = timed.x[0];
    xFinal = solveKnobs(
      (xk) => sub(endPicture(leadRun, dryRun(wing, { segments: wingProgramme(wingNom, heading0, xk, t0) }, t0), t0), target),
      timed.x, lo2, hi2, free, scale,
    );
  }

  // What the same press would give with no fix: the standard programme, only the roll-in off.
  const refX = withTiming(x0);
  const refLeadRun = dryRun(lead, leadPlanFor(refX.leadShift), t0);
  const refRun = dryRun(wing, { segments: wingProgramme(wingNom, heading0, refX.x, t0) }, t0);
  const uncorrected = sub(endPicture(refLeadRun, refRun, t0), target);

  const fixing = spec.response === 'fix';
  const x = fixing ? xFinal : refX.x;
  const leadPlanFinal = fixing ? leadPlan : leadPlanFor(refX.leadShift);
  const leadRunFinal = fixing ? leadRun : refLeadRun;
  const segments = wingProgramme(wingNom, heading0, x, t0);
  const wingRun = dryRun(wing, { segments }, t0);
  const residual = sub(endPicture(leadRunFinal, wingRun, t0), target);

  // Height. A crossing turn's miss is made around where they really cross; a fix also flies back to Lead's height.
  const h0 = wing.altAboveFt - lead.altAboveFt;
  let profile;
  let minSepFt = null;
  const endSec = t0 + Math.max(leadRunFinal.durationSec, wingRun.durationSec);
  if (crossing) {
    const at = closestApproach(leadPlanFinal, wing, { segments }, lead, t0);
    let mid = h0 + VERTICAL_MISS_FT;
    let hEnd = h0;
    if (fixing) {
      mid = Math.abs(h0) >= VERTICAL_MISS_FT ? h0 : (h0 >= 0 ? 1 : -1) * VERTICAL_MISS_FT;
      hEnd = 0;
    }
    profile = crossingProfile(t0, at.t, endSec, h0, mid, hEnd);
    minSepFt = closestApproach(leadPlanFinal, wing, { segments, profile }, lead, t0).sepFt;
  } else if (fixing && Math.abs(h0) > 1) {
    const span = Math.max(4, climbSpan(h0));
    profile = [{ t0, t1: t0 + span, fromFt: h0, toFt: 0 }];
  }
  if (profile) {
    const profileEnd = profile[profile.length - 1].t1;
    if (profileEnd > endSec) segments.push({ kind: 'hold', untilSec: onStep(profileEnd + STEP_SEC) }); // the plan isn't done until the height is
  }

  const banks = [x[2], x[3]];
  const maxG = Math.max(...banks.map((b) => gFromBankDeg(b)));
  const flags = [];
  if (fixing && maxG > 3.05) flags.push(`flies ${maxG.toFixed(1)} G, more than the 3 G standard (SMM 16.18 para 50)`);
  if (minSepFt !== null && minSepFt < VERTICAL_MISS_FT) flags.push(`passes Lead ${Math.round(minSepFt)} ft away, under the 300 ft minimum (SMM 16.13 para 31)`);

  const total = (r) => Math.hypot(r[0], r[1]);
  const note = fixing ? fixNote(x, intended, x0, banks, hasReversal, h0) : '#2 flies the standard turn for his slot at the standard time, so the error carries.';
  return {
    plans: { [lead.id]: leadPlanFinal, [wing.id]: { segments, profile } },
    note: `${nominal.note}${note ? ` ${note}` : ''}${flags.length ? ` #2 ${flags.join('; ')}.` : ''}`,
    firstId: nominal.firstId,
    slotAfter: { fwd: target.fwd, left: target.left },
    errorRun: { response: spec.response, target, uncorrectedFt: total(uncorrected), predictedFt: total(residual), startHeightFt: h0, flags, banks },
  };
}

/** What a fix did, in words: the timing and bank changes it made. */
function fixNote(x, intended, x0, banks, hasReversal, h0) {
  const parts = [];
  const shift = intended[0] - x0[0];
  if (Math.abs(shift) >= 0.1) parts.push(`rolls in ${Math.abs(shift).toFixed(1)} s ${shift < 0 ? 'earlier' : 'later'} than standard`);
  const [b1, b2] = banks;
  const word = (b) => `${Math.round(b)}° (${gFromBankDeg(b).toFixed(1)} G)`;
  if (Math.abs(b1 - x0[2]) >= 1 || Math.abs(b2 - x0[3]) >= 1) parts.push(`flies ${word(b1)} then ${word(b2)} (standard ${word(x0[2])} then ${word(x0[3])})`);
  const rev = x[1];
  if (hasReversal && Math.abs(rev) >= 0.1) parts.push(`reverses ${Math.abs(rev).toFixed(1)} s ${rev < 0 ? 'earlier' : 'later'}`);
  if (Math.abs(h0) > 1) parts.push("flies back to Lead's height");
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
    text = `${label}: #2 fixed part of it and ended ${parts.join(', ')}${carriedWords ? `; ${carriedWords}` : ''}. What is left is for the roll-out fix (speed and heading), which is not flown here.`;
  }
  return { label, response: run.response, fixed, totalFt, vertFt, uncorrectedFt: run.uncorrectedFt, residual: { fwdFt: res.fwd, leftFt: res.left }, text, tone: inPosition ? 'good' : 'caution', flags: run.flags };
}

/** The lines for the Formation card: { set, outcome: { text, tone } | null } or null when no error is set. */
export function errorCardLines(state) {
  if (!state.errors) return null;
  const o = state.errorOutcome;
  return { set: describeErrors(state.errors), outcome: o ? { text: o.text, tone: o.tone } : null };
}
