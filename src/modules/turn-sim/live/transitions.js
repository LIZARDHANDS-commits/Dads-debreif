// Changing formation, 2-ship (Turn Sim spec section 10, TS-53): the planner behind the
// "Change formation" buttons. Press one and the pair flies the manuals' transition from
// wherever it is now, planned at the press in the same style as the manoeuvres: each
// aircraft flies a pre-planned path through flight.js, roll 90°/s, smooth hand-overs.
//
// How it plans. Lead's part is a short list of ordinary segments (a speed change, and for
// a turning rejoin a 30° turn into #2). #2's part is worked out in a dry run: a closed-loop
// "tracker" flies #2 toward a slot in Lead's frame (the formation's position), commanding
// bank and speed the way a pilot would (small heading changes for slides, bank for the
// rejoin), through the very same flight.js step the real aircraft use. The bank and speed
// it commanded are recorded and replayed by the real aircraft (a 'bankTrack' segment), so
// the path drawn ahead is the path flown (spec F1). The run is done twice: once to learn when
// each leg starts and ends, then again with #2's height profile (smooth climbs and descents)
// built from those times.
//
// Sources (page references only): SMM 12.4 paras 11-12 (echelon), 12.5 para 13 (line astern),
// 12.6 para 15 (route), 12.20 paras 44-47 (station changes), 12.23 para 53 (200 KIAS),
// 12.24 paras 54-59 (turning rejoin), 12.26 paras 62-63 (straight-ahead rejoin), 12.27 para 65
// (overshoot, never at or above Lead's height), 12.29 para 69 (fighting wing), 16.15 para 38
// and AFM7 brief p.18 (close through route), 16.18 paras 49-51 (line abreast, entry),
// 16.20 paras 65-66 and Figs 16.24-16.25 (rejoins from line abreast), 16.32 para 92 and 16.38
// para 105 (drop back to fighting wing), EFIG p.371 and p.374 (overtake). Patrick 4 Oct 2026
// 11:08Z-11:09Z (200 KIAS outside line abreast, Lead turns into #2, speed only in
// transitions) and 11:45Z (wording agreed). Numbers with no manual or ruling behind them are
// labelled "estimate" beside them.
import { bankDegFromTurnRate } from '../../../core/flight-math.js';
import { wrapPi, relativeBearingDeg } from '../../../core/angles.js';
import { FTPS_TO_KT } from '../../../core/units.js';
import { STEP_SEC, stepAircraft, copyAircraft, planDone } from './flight.js';
import { relativeTo, unit, wholeDegree, turnSeg, onStep, DEG } from './manoeuvres.js';
import { judgePair, SWEEP_MAX_DEG } from './formation.js';
import { applyPose } from './kinematic.js';
import { fullPowerKtps, slowKtps, speedSegFor } from './slow-down.js';
import { speedUpLimitKtps } from './full-power.js';
import { powerFrom } from './power.js';

// ---- the numbers -----------------------------------------------------------------------

/** The pair flies 200 KIAS outside line abreast (SMM 12.23 para 53; Patrick 11:08Z) and 220 in it (SMM 16.18 para 49). */
export const KIAS_OUTSIDE_LAB = 200;
export const KIAS_LAB = 220;
// Slowing down: slow-down.js (TS-61) replaces the fixed 1.5 kt/s estimate (SLOW_DOWN_KTPS, until V2.20). A formation
// change slows with power only (a set, controlled overtake held with power, Patrick 23:37Z); the speed brake and idle are
// for the off-standard rejoins (kinematic-moves.js).
export { fullPowerKtps };
/** The T-6A's wingspan and length, about 33.4 ft (the repo's energy-sim note); an estimate for the close positions. */
export const WINGSPAN_FT = 33.4;
export const LENGTH_FT = 33.4;
/** Defaults for rejoins. */
export const REJOIN = Object.freeze({
  overtakeKias: 15, // the middle of EFIG p.374's 10 to 20 KIAS for a turning rejoin
  bankCapDeg: 60, // #2's bank cap in a rejoin: an estimate (the break's own bank), flagged and never a wall
  leadBankDeg: 30, // Lead's turn in a turning rejoin (SMM 12.24 para 54; AFM7 p.21)
  idealBearingDeg: 45, // Lead at 10:30 or 1:30 (SMM 12.24 para 56)
  hotBearingDeg: 60, // hot and cold are drawn but not numbered in SMM Fig 12.16: 60 and 30 are estimates
  coldBearingDeg: 30,
  turnAnglesDeg: [30, 45, 20, 60], // how far Lead turns into #2 once it has closed; estimates (a gentle turn, AFM8 brief p.19); the planner takes the first that keeps the overshoot lane
  turnAtRangeFt: [2000, 1500, 2500], // Lead turns when #2 has closed to this range; estimates
});
/**
 * Fighting wing's desired place for the 2-ship: 750 ft at 45° of sweep, measured back from Lead's wing line (SMM 12.29
 * para 69, Fig 12.19). The default is the middle of the SMM's 500-1,000 ft and 30-60° band, an estimate. It is a setting
 * (Patrick 21:25Z, TS-58): setFwShape changes it, and slotFor('fw') reads it.
 */
export const FW2 = Object.freeze({ rangeFt: 750, sweepDeg: 45 });
/** SMM 12.29 para 69's band: a desired place outside it is flown and flagged, never refused. */
export const FW_BAND = Object.freeze({ rangeFt: Object.freeze([500, 1000]), sweepDeg: Object.freeze([30, 60]) });
/**
 * What the sim will fly at all: 50 ft and 5° inside the region where the pair is still recognised as fighting wing
 * (classifyPair: 400-1,300 ft, 20-70°), so the fighting wing buttons keep working. Estimates, not manual limits.
 */
export const FW_LIMITS = Object.freeze({ rangeFt: Object.freeze([450, 1250]), sweepDeg: Object.freeze([25, 65]) });
let fwShape = { ...FW2 };

/** Sets the 2-ship's desired fighting wing place ({ rangeFt, sweepDeg }; a missing value takes the default). */
export function setFwShape({ rangeFt = FW2.rangeFt, sweepDeg = FW2.sweepDeg } = {}) {
  fwShape = { rangeFt, sweepDeg };
}

/** The 2-ship's desired fighting wing place now: { rangeFt, sweepDeg }. */
export function fwShapeNow() {
  return { ...fwShape };
}

/**
 * Checks a desired fighting wing place: { ok: false, reason } outside what the sim flies (FW_LIMITS), else
 * { ok: true, flag } where flag says it is outside the SMM band (SMM 12.29 para 69) and flown anyway, or is null.
 * `who` names the aircraft in the words ("#2", "#3 and #4").
 */
export function checkFwShape(rangeFt, sweepDeg, who = '#2') {
  const r = Number(rangeFt);
  const d = Number(sweepDeg);
  const [rMin, rMax] = FW_LIMITS.rangeFt;
  const [dMin, dMax] = FW_LIMITS.sweepDeg;
  if (!Number.isFinite(r) || r < rMin || r > rMax) return { ok: false, reason: `${who}'s fighting wing spacing must be ${rMin}-${rMax.toLocaleString('en-CA')} ft.` };
  if (!Number.isFinite(d) || d < dMin || d > dMax) return { ok: false, reason: `${who}'s fighting wing sweep must be ${dMin}-${dMax}°.` };
  const outside = [];
  if (r < FW_BAND.rangeFt[0] || r > FW_BAND.rangeFt[1]) outside.push(`spacing ${r.toLocaleString('en-CA')} ft (500-1,000)`);
  if (d < FW_BAND.sweepDeg[0] || d > FW_BAND.sweepDeg[1]) outside.push(`sweep ${d}° (30-60°)`);
  return { ok: true, flag: outside.length ? `${who}: ${outside.join(' and ')} is outside the SMM's fighting wing band (SMM 12.29 para 69); flown anyway.` : null };
}

/** The overshoot lane: inside 1,000 ft #2 stays behind Lead's 3/9 line, within the shared 100 ft margin (design section 10). */
const LANE_MARGIN_FT = 100;
/** A generous cap on how long one change may take (the spec's 3 minutes, an estimate): it only catches a planner that never finishes. */
export const CHANGE_LIMIT_SEC = 180;
export const PLAN_MAX_SEC = 300;
/** Station changes close or open at about 5 kt (8 ft/s), an estimate: the SMM says only "controlled" (12.20 para 44). */
const CLOSE_RATE_FTPS = 8;

/** The formations and their words. */
export const FORMATIONS = Object.freeze({
  lab: { label: 'Line abreast', sided: true },
  fw: { label: 'Fighting wing', sided: true },
  echelon: { label: 'Echelon', sided: true },
  route: { label: 'Route', sided: true },
  astern: { label: 'Line astern', sided: false },
});

/** Where #2 sits in Lead's frame for a formation on side s (+1 left, -1 right): { fwd, left, alt } in feet (alt below Lead is negative). */
export function slotFor(key, s, spacingFt = 6000) {
  switch (key) {
    case 'lab': return { fwd: 0, left: s * spacingFt, alt: 0 };
    // the desired place setting (FW2's 750 ft at 45° by default, SMM 12.29 para 69); 60 ft below is an estimate
    case 'fw': return { fwd: -fwShape.rangeFt * Math.sin(fwShape.sweepDeg * DEG), left: s * fwShape.rangeFt * Math.cos(fwShape.sweepDeg * DEG), alt: -60 };
    // about 45 ft out, 25 ft back, 5 ft down: estimates, the manual gives sight references (SMM 12.4 paras 11-12)
    case 'echelon': return { fwd: -25, left: s * 45, alt: -5 };
    // two wingspans out on the wing-tip line, the middle of 1 to 3 (SMM 12.6 para 15), level or slightly low
    case 'route': return { fwd: -25, left: s * 2 * WINGSPAN_FT, alt: -5 };
    // nose to tail about 10 ft (SMM 12.5 para 13): centre to centre is that plus a fuselage length; below the prop wash (estimate)
    case 'astern': return { fwd: -(LENGTH_FT + 10), left: 0, alt: -8 };
    default: throw new Error(`No formation called ${key}`);
  }
}

// ---- classifying and judging ---------------------------------------------------------------

/**
 * Which formation the pair is in, from where #2 really is (design section 4, note 2):
 * { key: 'lab' | 'fw' | 'echelon' | 'route' | 'astern' | 'other', side: +1 | -1 | 0 }.
 * The regions are generous: they only say what the pair is nearest to. 'other' is anything else
 * (in trail after an in-place turn, mid-change).
 */
export function classifyPair(lead, wing) {
  const rel = relativeTo(lead, wing);
  const across = Math.abs(rel.left);
  const back = -rel.fwd;
  const range = Math.hypot(rel.fwd, rel.left);
  const side = Math.sign(rel.left);
  const sweep = Math.atan2(back, Math.max(across, 1e-6)) / DEG;
  if (across >= 1500 && sweep <= 25 && sweep >= -15) return { key: 'lab', side };
  if (range >= 400 && range <= 1300 && sweep >= 20 && sweep <= 70) return { key: 'fw', side };
  if (range < 250) {
    if (across < 22 && back > 0) return { key: 'astern', side: 0 };
    if (across < 56 && rel.fwd < 40 && rel.fwd > -90) return { key: 'echelon', side };
    if (across <= 130 && rel.fwd < 60 && rel.fwd > -120) return { key: 'route', side };
  }
  return { key: 'other', side };
}

/**
 * Judges the pair against a formation's band in the spec table (section 10). Returns { key, inBand, labels, text, tone }.
 * opts.wingPlane: measure out and down in Lead's wing plane, not level, so a wingman stepped up or down with Lead's bank in
 * a close turn (SMM 12.19 paras 41-43, Fig 12.11) reads as in place. Lead's bank only tilts the frame; level, it is the same.
 */
export function judgeFormation(key, lead, wing, spacingFt = 6000, opts = {}) {
  const rel = { ...relativeTo(lead, wing) };
  let down = lead.altAboveFt - wing.altAboveFt; // positive: #2 is below Lead
  if (opts.wingPlane && lead.bankDeg) {
    const phi = lead.bankDeg * DEG; // positive: left wing down
    const up = -down;
    const left = rel.left * Math.cos(phi) - up * Math.sin(phi);
    down = -(rel.left * Math.sin(phi) + up * Math.cos(phi));
    rel.left = left;
  }
  const across = Math.abs(rel.left);
  const ft = (n) => `${Math.round(Math.abs(n)).toLocaleString('en-CA')} ft`;
  const word = FORMATIONS[key].label;
  let labels = [];
  let numbers = '';
  if (key === 'lab') {
    const j = judgePair(lead, wing, spacingFt);
    labels = j.labels[0] === 'ON SPACING' ? [] : j.labels;
    numbers = `${ft(j.acrossFt)} abeam, ${ft(j.foreAftFt)} ${j.foreAftFt >= 0 ? 'ahead of' : 'behind'} Lead's 3/9 line, sweep ${Math.round(Math.max(0, j.sweepDeg))}° (0-${SWEEP_MAX_DEG}°)`;
  } else if (key === 'fw') {
    const range = Math.hypot(rel.fwd, rel.left);
    const sweep = Math.atan2(-rel.fwd, Math.max(across, 1e-6)) / DEG;
    if (range < 500) labels.push('TOO CLOSE');
    else if (range > 1000) labels.push('TOO FAR');
    if (sweep < 30) labels.push('TOO FLAT');
    else if (sweep > 60) labels.push('TOO FAR BACK');
    if (down <= 0) labels.push('NOT BELOW LEAD');
    numbers = `${ft(range)} (500-1,000), sweep ${Math.round(sweep)}° (30-60°), ${ft(down)} ${down >= 0 ? 'below' : 'above'} Lead`;
  } else if (key === 'echelon') {
    const back = -rel.fwd;
    if (across < 30) labels.push('TIGHT');
    else if (across > 60) labels.push('WIDE');
    if (back < 10) labels.push('FORE');
    else if (back > 40) labels.push('AFT');
    if (down < -5) labels.push('HIGH');
    else if (down > 15) labels.push('LOW');
    numbers = `${ft(across)} out (45 ±15), ${ft(back)} back (25 ±15), ${ft(down)} ${down >= 0 ? 'below' : 'above'} (5 ±10)`;
  } else if (key === 'route') {
    if (across < WINGSPAN_FT) labels.push('TIGHT');
    else if (across > 3 * WINGSPAN_FT) labels.push('WIDE');
    if (rel.fwd < -75) labels.push('AFT');
    else if (rel.fwd > 25) labels.push('FORE');
    if (down < -10) labels.push('HIGH');
    else if (down > 40) labels.push('LOW');
    numbers = `${ft(across)} out (${Math.round(WINGSPAN_FT)}-${Math.round(3 * WINGSPAN_FT)} ft: 1 to 3 wingspans), ${ft(rel.fwd)} ${rel.fwd >= 0 ? 'ahead' : 'back'}, ${ft(down)} ${down >= 0 ? 'below' : 'above'}`;
  } else {
    const gap = -rel.fwd - LENGTH_FT; // nose to tail
    if (across > 10) labels.push('OFF LINE');
    if (gap < 0) labels.push('TOO CLOSE');
    else if (gap > 20) labels.push('TOO FAR BACK');
    if (down < 0) labels.push('HIGH');
    numbers = `${ft(gap)} nose to tail (10 ±10), ${ft(across)} off line, ${ft(down)} ${down >= 0 ? 'below' : 'above'}`;
  }
  const inBand = labels.length === 0;
  const sided = FORMATIONS[key].sided && key !== 'lab' ? ` ${rel.left > 0 ? 'left' : 'right'}` : key === 'lab' ? `, ${rel.left > 0 ? 'left' : 'right'}` : '';
  return { key, inBand, labels, text: `${word}${sided}: ${inBand ? 'IN POSITION' : labels.join(', ')}, ${numbers}.`, tone: inBand ? 'good' : 'caution' };
}

// ---- flying: the temporary speed and recorded-bank handlers ---------------------------------


/** Sets the indicated airspeed and keeps the true airspeed in proportion (the height is held, so the ratio is constant). */
function setKias(a, kias) {
  const ratio = a.tasFtps / a.kias;
  a.kias = kias;
  a.tasFtps = kias * ratio;
}

/** One step flown at a commanded bank, by the unchanged flight.js step (a never-finishing turn segment holds the bank target). */
function stepCommanded(a, targetBankDeg, t, profile) {
  const dir = targetBankDeg < 0 ? -1 : 1;
  const segments = Math.abs(targetBankDeg) < 1e-9
    ? []
    : [{ kind: 'turn', toRad: a.headingRad + dir * Math.PI / 2, dir, bankDeg: Math.abs(targetBankDeg), rollOut: false }];
  stepAircraft(a, { segments, profile }, t);
}

/**
 * Flies one step of a plan that may hold the recorded-bank segment of design section 6, which
 * flight.js does not know; everything else, the speed segment included, goes to stepAircraft:
 *   { kind: 'bankTrack', points: [[bankDeg, kias], …] }   replays what the planner's dry run commanded,
 *                                             one entry a step; kias may be null for "unchanged".
 */
export function flyStep(a, plan, t) {
  const seg = plan.segments[0];
  if (seg?.kind === 'poseTrack') {
    // A kinematic pre-planned line (kinematic.js, TS-55): the pose for each step was worked out at the press.
    seg.i ??= 0;
    applyPose(a, seg.poses[seg.i++]);
    if (seg.i >= seg.poses.length) {
      plan.segments.shift();
      a.turning = plan.segments.length > 0 || a.bankDeg !== 0;
    }
    return;
  }
  if (seg?.kind === 'bankTrack') {
    seg.i ??= 0;
    const [bank, kias, flags = 0] = seg.points[seg.i++];
    if (kias !== null && kias !== undefined) setKias(a, kias);
    stepCommanded(a, bank, t, plan.profile);
    // The tracker's replay sets no power (TS-62), except while it is held to full power (TS-63): then MAX.
    a.power = flags & 2 ? powerFrom(null, 1, a.kias) : null;
    a.stretched = false;
    a.slowStage = null;
    if (seg.i >= seg.points.length) plan.segments.shift();
    return;
  }
  stepAircraft(a, plan, t);
}

/** manoeuvres.js's dryRun, flown through flyStep so it knows the speed and bank-track segments. */
export function dryRunT(aircraft, plan, t0, { maxSec = 600, sampleSec = 0.25 } = {}) {
  const a = copyAircraft(aircraft);
  const p = { segments: plan.segments.map((s) => ({ ...s })), profile: plan.profile };
  const every = Math.max(1, Math.round(sampleSec / STEP_SEC));
  const points = [[t0, a.xFt, a.yFt, a.altAboveFt]];
  let t = t0;
  let i = 0;
  while (!planDone(a, p) && t - t0 < maxSec) {
    flyStep(a, p, t);
    t += STEP_SEC;
    if (++i % every === 0) points.push([t, a.xFt, a.yFt, a.altAboveFt]);
  }
  points.push([t, a.xFt, a.yFt, a.altAboveFt]);
  return { end: a, durationSec: t - t0, points };
}

/** A speed segment from `from` to `to` KIAS: full power to speed up, power back to slow down (slow-down.js, TS-61). */
export function speedSeg(from, to, blockFt = 8000) {
  return speedSegFor(from, to, blockFt, 'power');
}

// ---- the tracker: #2 flies to a slot in Lead's frame ----------------------------------------

/** Control gains. All estimates: they shape how smoothly #2 flies, not where the formations are. */
const GAIN = Object.freeze({
  position: 0.3, // 1/s: position error to relative velocity
  heading: 1.5, // 1/s: heading error to turn rate
  refRate: 0.5, // 1/s: how fast the moving reference closes on its target
  speedLoop: 0.8, // 1/s: speed error to acceleration
  jerkKtps2: 1.0, // kt/s²: acceleration builds over about a second and a half, so the speed has no corners
  ffFilter: 0.2,
});

/**
 * A recorded flight: an aircraft flown through its plan by flyStep, one state per step from t0, extended on demand (once
 * its plan is done it flies straight on). It is the moving reference a tracker flies off, so a wingman can fly off Lead
 * or off another wingman whose own path was planned first (the 4-ship, four-ship-moves.js). at(n) is the state at the
 * start of step n: { xFt, yFt, headingRad, tasFtps, kias, altAboveFt, bankDeg, free } where free means its plan has no
 * segments left.
 */
export function recordFlight(aircraft, plan, t0) {
  const a = copyAircraft(aircraft);
  const p = { segments: plan.segments.map((s) => ({ ...s })), profile: plan.profile };
  const snap = () => ({ xFt: a.xFt, yFt: a.yFt, headingRad: a.headingRad, tasFtps: a.tasFtps, kias: a.kias, altAboveFt: a.altAboveFt, bankDeg: a.bankDeg, free: p.segments.length === 0 });
  const states = [snap()];
  let t = t0;
  return {
    t0,
    at(n) {
      while (states.length <= n) {
        flyStep(a, p, t);
        t += STEP_SEC;
        states.push(snap());
      }
      return states[n];
    },
  };
}

/** The point a phase's reference sits at, and its velocity, in the world: { px, py, vpx, vpy }. */
function refPoint(R, Rprev, ref, world) {
  if (world) return { px: R.xFt + ref.f, py: R.yFt + ref.l, vpx: R.tasFtps * Math.cos(R.headingRad) + ref.vf, vpy: R.tasFtps * Math.sin(R.headingRad) + ref.vl };
  const omega = Rprev ? wrapPi(R.headingRad - Rprev.headingRad) / STEP_SEC : 0;
  const lf = unit(R.headingRad);
  const lleft = { x: -lf.y, y: lf.x };
  const px = R.xFt + lf.x * ref.f + lleft.x * ref.l;
  const py = R.yFt + lf.y * ref.f + lleft.y * ref.l;
  const rx = px - R.xFt;
  const ry = py - R.yFt;
  return {
    px,
    py,
    vpx: R.tasFtps * lf.x - omega * ry + lf.x * ref.vf + lleft.x * ref.vl,
    vpy: R.tasFtps * lf.y + omega * rx + lf.y * ref.vf + lleft.y * ref.vl,
  };
}

/**
 * Runs the dry run: #2 (wing0) flies the phases in turn, each a slot in the frame of the aircraft it names (`track`, a
 * key of `refs`, recorded flights). For the 2-ship: refs = { [Lead's id]: Lead's recorded flight }. profile: the
 * wingman's height profile (or undefined). A phase with `holdUntil` is not left (nor, the last one, finished) before
 * that formation time: a gate (design section 4: "wait for the one ahead" as a start time). A phase with `world: true`
 * holds its offset in world axes instead of the reference's frame, so the wingman turns with its reference as in an
 * in-place turn. Returns { points: [[bank, kias]…], end: { lead, wing }, times: [{ t0, arrive, t1 }…], maxBankDeg, ok,
 * durationSec, ranges, laneFwdFt, minBelowFt } (ranges and the lane are measured from the aircraft each phase flies off).
 */
export function runTracker({ refs, wing0, t0, phases, profile, blockFt, maxSec = PLAN_MAX_SEC }) {
  const W = copyAircraft(wing0);
  const points = [];
  const times = phases.map(() => ({ t0: null, arrive: null, t1: null }));
  let k = 0;
  let m = 0; // steps flown
  let t = t0;
  const recOf = (ph) => refs[ph.track ?? Object.keys(refs)[0]];
  let R = recOf(phases[0]);
  const rel0 = relativeTo(R.at(0), W);
  const ref = phases[0].world
    ? { f: W.xFt - R.at(0).xFt, l: W.yFt - R.at(0).yFt, vf: 0, vl: 0 }
    : { f: rel0.fwd, l: rel0.left, vf: 0, vl: 0 };
  let accel = 0; // KIAS per second, filtered by the jerk limit
  let psiCmdPrev = W.headingRad;
  let omegaFf = 0;
  let maxBank = 0;
  let laneFwdFt = -Infinity; // furthest ahead of Lead's 3/9 line inside 1,000 ft (the overshoot lane)
  let minBelowFt = Infinity; // least height under Lead inside 2,000 ft
  const ranges = [];
  let aligning = false;
  let ok = false;
  let reentered = false; // a phase change re-reads the step it happened in, with no reference turn rate for it
  let stoppedAt = null; // when #2 first came to a stop in a phase with `stopFtps` (a real stop: SMM 12.20 para 45)

  for (let n = 0; n < Math.round(maxSec / STEP_SEC); n++) {
    // Both aircraft are read at the same instant (the start of the step).
    const ph = phases[k];
    const L = R.at(m);
    const Lprev = m > 0 && !reentered ? R.at(m - 1) : null;
    reentered = false;
    if (times[k].t0 === null) times[k].t0 = t;

    // The reference slot moves toward the phase's slot at the phase's rates. A phase with a `goal` (a goal-seeking phase,
    // the fighting wing turns of TS-55) works out its slot afresh every step from where Lead and #2 are.
    const slot = ph.goal ? ph.goal(L, W, t) : ph.slot;
    for (const [axis, v, target, rate] of [['f', 'vf', slot.fwd, ph.fwdRate], ['l', 'vl', slot.left, ph.latRate]]) {
      if (!Number.isFinite(rate)) {
        ref[axis] = target;
        ref[v] = 0;
      } else {
        const want = Math.max(-rate, Math.min(rate, GAIN.refRate * (target - ref[axis])));
        const step = (rate / 4) * STEP_SEC;
        ref[v] += Math.max(-step, Math.min(step, want - ref[v]));
        ref[axis] += ref[v] * STEP_SEC;
        if (Math.abs(target - ref[axis]) < 0.05) ref[axis] = target;
      }
    }
    const arrived = ph.goal ? Math.hypot(ref.f - slot.fwd, ref.l - slot.left) < (ph.goalTolFt ?? 2) : ref.f === ph.slot.fwd && ref.l === ph.slot.left;

    // The reference point and its velocity: attached to the aircraft it flies off, so it turns with it (v = vRef + ω × r + the reference's own motion).
    const { px, py, vpx, vpy } = refPoint(L, Lprev, ref, ph.world);
    const ex = px - W.xFt;
    const ey = py - W.yFt;
    const d = Math.hypot(ex, ey);
    const gateOpen = t >= (ph.holdUntil ?? -Infinity) - 1e-9;

    let psiCmd;
    let kiasCmd;
    if (aligning) {
      psiCmd = L.headingRad;
      kiasCmd = L.kias;
    } else {
      // Phase bookkeeping: advance when close enough, finish when settled and the reference has finished its own plan.
      const relVel = Math.hypot(W.tasFtps * Math.cos(W.headingRad) - vpx, W.tasFtps * Math.sin(W.headingRad) - vpy);
      const last = k === phases.length - 1;
      if (arrived && times[k].arrive === null && d <= (last ? Math.max(ph.finalTol, ph.advanceTol) : ph.advanceTol)) times[k].arrive = t;
      // A phase with stopFtps is a real stop: #2 must have stopped on it (relative speed under stopFtps) and held there dwellSec.
      if (ph.stopFtps && arrived && d <= ph.advanceTol && relVel <= ph.stopFtps) stoppedAt ??= t;
      const stopDone = !ph.stopFtps || (stoppedAt !== null && t - stoppedAt >= (ph.dwellSec ?? 0) - 1e-9);
      if (arrived && !last && d <= ph.advanceTol && gateOpen && stopDone) {
        stoppedAt = null;
        times[k].t1 = t;
        k++;
        const next = phases[k];
        const R2 = recOf(next);
        if (R2 !== R || Boolean(next.world) !== Boolean(ph.world)) {
          // A new reference: the same point in the world, now carried by the other aircraft (or in world axes).
          const L2 = R2.at(m);
          const L2prev = m > 0 ? R2.at(m - 1) : null;
          const rx = px - L2.xFt;
          const ry = py - L2.yFt;
          if (next.world) {
            Object.assign(ref, { f: rx, l: ry, vf: vpx - L2.tasFtps * Math.cos(L2.headingRad), vl: vpy - L2.tasFtps * Math.sin(L2.headingRad) });
          } else {
            const f2 = unit(L2.headingRad);
            const omega2 = L2prev ? wrapPi(L2.headingRad - L2prev.headingRad) / STEP_SEC : 0;
            const ownX = vpx - (L2.tasFtps * f2.x - omega2 * ry);
            const ownY = vpy - (L2.tasFtps * f2.y + omega2 * rx);
            Object.assign(ref, { f: rx * f2.x + ry * f2.y, l: -rx * f2.y + ry * f2.x, vf: ownX * f2.x + ownY * f2.y, vl: -ownX * f2.y + ownY * f2.x });
          }
          R = R2;
        }
        reentered = true;
        continue; // re-enter this step with the next phase (nothing has moved for #2 yet)
      }
      if (arrived && last && gateOpen && d <= ph.finalTol && relVel <= Math.max(1.2, 0.3 * ph.finalTol) && L.free && L.bankDeg === 0) {
        times[k].t1 = t;
        aligning = true;
      }
      const cap = Math.min(ph.vrelMax, ph.vrel0 + ph.kcap * Math.max(0, d - ph.d0), Math.sqrt(2 * ph.decel * d)); // never closing faster than it can stop (decel in ft/s²)
      const pull = Math.min(cap, GAIN.position * d);
      const vdx = vpx + (d > 1e-6 ? (ex / d) * pull : 0);
      const vdy = vpy + (d > 1e-6 ? (ey / d) * pull : 0);
      const speed = Math.hypot(vdx, vdy);
      psiCmd = speed > 1 ? Math.atan2(vdy, vdx) : L.headingRad;
      const ratio = W.tasFtps / W.kias;
      kiasCmd = Math.max(L.kias - ph.undertakeKias, Math.min(L.kias + ph.overtakeKias, speed / ratio));
    }

    // Heading loop: turn rate toward the commanded heading, with its own rate fed forward; bank from the turn rate.
    const psiStep = wrapPi(psiCmd - psiCmdPrev);
    psiCmdPrev = psiCmd;
    omegaFf += GAIN.ffFilter * (psiStep / STEP_SEC - omegaFf);
    const omegaCmd = GAIN.heading * wrapPi(psiCmd - W.headingRad) + omegaFf;
    const cap = aligning ? 30 : ph.bankCapDeg;
    const bank = Math.max(-cap, Math.min(cap, bankDegFromTurnRate(W.tasFtps, omegaCmd)));

    // Speed loop: acceleration follows the speed error, limited to what the T-6 can do (full power up at the G and climb
    // flown, TS-63 (full-power.js); power back down: slow-down.js, TS-61) and built up by a jerk limit.
    const aMax = speedUpLimitKtps(W.kias, blockFt, W.g ?? 1, W.climbFtps, W.tasFtps);
    const aWant = GAIN.speedLoop * (kiasCmd - W.kias);
    const aCmd = Math.max(-slowKtps('power', W.kias, blockFt), Math.min(aMax, aWant));
    accel += Math.max(-GAIN.jerkKtps2 * STEP_SEC, Math.min(GAIN.jerkKtps2 * STEP_SEC, aCmd - accel));
    if (accel > aMax) accel = aMax; // never more than full power gives, even while the jerk limit eases a change in
    // At full power (MAX on the tag). The tracker is a goal-seeking run that never asks more than this, so it has no
    // planned place to fall behind: its distance words (TIGHT, STRETCHED, IN RANGE) say where he is (tags.js).
    const full = !aligning && aWant > aMax + 0.05 && accel >= aMax - 1e-9;
    let kias = W.kias + accel * STEP_SEC;
    if (aligning && Math.abs(L.kias - kias) < 0.003) { // the last few thousandths of a knot, so the speed has no step
      kias = L.kias;
      accel = 0;
    }
    points.push([bank, kias, full ? 2 : 0]);
    setKias(W, kias);
    stepCommanded(W, bank, t, profile);
    m++;
    const Lafter = R.at(m);
    maxBank = Math.max(maxBank, Math.abs(W.bankDeg));
    const after = relativeTo(Lafter, W);
    const range = Math.hypot(after.fwd, after.left);
    ranges.push(range);
    if (range < 1000) laneFwdFt = Math.max(laneFwdFt, after.fwd);
    if (range < 2000) minBelowFt = Math.min(minBelowFt, Lafter.altAboveFt - W.altAboveFt);
    t += STEP_SEC;

    if (aligning && Lafter.free && W.bankDeg === 0 && W.rollRateDps === 0 && Math.abs(wrapPi(W.headingRad - Lafter.headingRad)) < 1.5e-4 && W.kias === Lafter.kias) {
      ok = true;
      break;
    }
  }
  return { points, end: { lead: { ...R.at(m) }, wing: W }, times, maxBankDeg: maxBank, ok, durationSec: t - t0, ranges, laneFwdFt, minBelowFt };
}

// ---- the legs (phases) ------------------------------------------------------------------------

export function phase(slot, over = {}) {
  return {
    slot,
    latRate: CLOSE_RATE_FTPS,
    fwdRate: CLOSE_RATE_FTPS,
    vrel0: 10, // ft/s the closing speed is held to near the slot
    kcap: 0, // ft/s more per foot of range beyond d0
    d0: 100,
    vrelMax: 60,
    decel: 1.2, // ft/s²: about half what slowing with the power back gives (about 1.5-2 kt/s, slow-down.js), so the speed loop can stop the closure in time (estimate)
    bankCapDeg: 25,
    overtakeKias: 8,
    undertakeKias: 12,
    advanceTol: 3,
    finalTol: 1.5,
    altSec: null, // seconds over which the height changes (null: the whole leg)
    altRateFtps: null, // when set, the height change takes at least |change| / this many seconds (the 4-ship's stack; null: no floor)
    stopFtps: null, // when set, a real stop: the next phase starts only once #2's speed against the slot is under this...
    dwellSec: 0, // ...and has been for this long (the station change's "stabilize", SMM 12.20 para 45)
    ...over,
  };
}

/** A station change in close formation (SMM 12.20 paras 44-47): about 5 kt, wings level but for a degree or two of heading. */
export const slide = (slot, over = {}) => phase(slot, { advanceTol: 6, ...over });
/**
 * A station change's corner or end point, flown as a real stop (SMM 12.20 para 45: "stabilize in this position", "stop the
 * aircraft", "stabilize directly behind the echelon position"): #2 stops on it and holds 2 s before moving on. The 1 ft/s
 * and 2 s are estimates.
 */
export const stopAt = (slot, over = {}) => slide(slot, { fwdRate: 5, advanceTol: 2, stopFtps: 1, dwellSec: 2, ...over });
/**
 * The corner behind a close slot (SMM 12.20 para 45; Figs 12.12-12.13): back until #2's nose is at least 10 ft behind Lead's
 * tail (line astern's own spacing, plus 12 ft so it does not fall short: an estimate), at the slot's own lateral, and low
 * enough for the tail to pass below the prop wash (line astern's height: an estimate).
 */
export const cornerBehind = (slot, spacingFt) => {
  const astern = slotFor('astern', 0, spacingFt);
  return { fwd: astern.fwd - 12, left: slot.left, alt: astern.alt };
};
/** Drop back slowly (SMM 16.32 para 92): a few knots slower than Lead. */
export const dropBack = (slot, over = {}) => phase(slot, { fwdRate: 12, latRate: 12, vrel0: 14, advanceTol: 25, finalTol: 6, bankCapDeg: 20, ...over });
/**
 * Echelon, route or line astern to fighting wing, expeditious (Patrick 19:03Z: "take ~7-15 seconds", TS-55): the slot is chased at
 * once with up to 20 KIAS under or over Lead, 45° bank, and the height change over the first 6 s. All the rates are estimates.
 */
export const sweepOut = (slot, over = {}) => phase(slot, { fwdRate: Infinity, latRate: Infinity, vrel0: 30, kcap: 0.1, d0: 50, vrelMax: 200, decel: 3, bankCapDeg: 45, overtakeKias: 20, undertakeKias: 20, advanceTol: 25, finalTol: 6, altSec: 6, ...over });
/** Close from fighting wing through route (SMM 16.15 para 38; AFM7 p.18): 10-20 KIAS overtake, slowing to about 5 kt at route. */
export const closeThrough = (slot, over = {}) => phase(slot, { fwdRate: 40, latRate: 40, vrel0: 8, kcap: 0.05, d0: 100, vrelMax: 50, overtakeKias: 20, advanceTol: 6, bankCapDeg: 25, ...over });
/** The rejoin to a formation (SMM 12.24, 16.20): the slot is chased at once, the closing speed falls with range, bank up to the cap. */
export const rejoinTo = (slot, over = {}) => phase(slot, { fwdRate: Infinity, latRate: Infinity, vrel0: 25, kcap: 0.1, d0: 500, vrelMax: 260, decel: 3, bankCapDeg: REJOIN.bankCapDeg, overtakeKias: REJOIN.overtakeKias, undertakeKias: 25, advanceTol: 40, finalTol: 3, altSec: 10, ...over });
/** Entry to line abreast (SMM 16.18 para 51): #2 turns away 20-40° to open out while Lead holds 220 KIAS. */
export const openOut = (slot, over = {}) => phase(slot, { fwdRate: 40, latRate: 150, vrel0: 40, kcap: 0.1, d0: 300, vrelMax: 220, decel: 2, bankCapDeg: 45, overtakeKias: 25, undertakeKias: 15, advanceTol: 30, finalTol: 25, ...over });

/** The straight-ahead rejoin's places in feet, in the frame of the aircraft rejoined on (estimates, see straightAhead). */
export const STRAIGHT_AHEAD = {
  sixFt: -1000, // line up on the six about 1,000 ft back (SMM Fig 12.17, point 1; Patrick's card "1,000 ft", 4 Oct 19:54Z)
  belowWakeFt: -20, // "fly just below lead's wake" (EFIG p.371); 20 ft is an estimate
  closeTowardFt: -150, // the closing leg's aim, ahead on the six line, so the closure holds until the vector point (estimate)
  vectorAtFt: 500, // "at approximately 500 ft" the small vector toward the echelon side (Fig 12.17, point 2; SMM 12.26 para 63)
};

/**
 * A straight-ahead rejoin from fighting wing to route (SMM 12.26 paras 62-63, Fig 12.17; EFIG p.371): line up on the six of the
 * aircraft rejoined on, about 1,000 ft back and just below its wake (Fig 12.17, point 1); close with 20-30 KIAS overtake (EFIG
 * p.371); from about 500 ft behind (point 2) take a small vector to the side wanted, which aims slightly away from it, reduce
 * the overtake and stabilise in route (point 3). The caller then moves up the wing-tip line to echelon (point 4). at(fwd, left,
 * alt) turns a place in the frame of the aircraft rejoined on into a phase slot; route is the route slot itself; over (e.g.
 * { track }) goes on every phase. holdLineUpUntil: a formation time before which the wingman stays lined up at 1,000 ft
 * instead of closing (the 4-ship: safe separation until the aircraft ahead is stable, SMM 16.34 para 95; AFM7 brief p.21).
 * @param {(fwd: number, left: number, alt: number) => { fwd: number, left: number, alt: number }} at
 * @param {{ fwd: number, left: number, alt: number }} route
 * @param {{ endInRoute?: boolean, track?: number, holdLineUpUntil?: number }} [options]
 */
export function straightAhead(at, route, { endInRoute = false, holdLineUpUntil, ...over } = {}) {
  const A = STRAIGHT_AHEAD;
  const quick = { fwdRate: Infinity, latRate: Infinity, decel: 2, undertakeKias: 15, ...over };
  return [
    phase(at(A.sixFt, 0, A.belowWakeFt), { ...quick, vrel0: 20, kcap: 0.05, d0: 50, vrelMax: 100, bankCapDeg: 30, overtakeKias: 15, advanceTol: 60, ...(holdLineUpUntil !== undefined ? { holdUntil: holdLineUpUntil } : {}) }),
    // close along the six line at about 21 KIAS overtake, inside EFIG p.371's 20-30, until the vector point
    phase(at(A.closeTowardFt, 0, A.belowWakeFt), { ...quick, vrel0: 36, kcap: 0, vrelMax: 50, decel: 3, bankCapDeg: 20, overtakeKias: 30, advanceTol: A.vectorAtFt + A.closeTowardFt }),
    // then route, closing level or slightly low (SMM 16.15 para 38) and slowing as it comes in
    closeThrough(endInRoute ? route : { ...route, alt: route.alt - 25 }, { overtakeKias: 30, vrel0: 6, kcap: 0.04, decel: 1, advanceTol: 6, ...(endInRoute ? { finalTol: 1.5 } : {}), ...over }),
  ];
}

/**
 * The legs from one formation to another, as a list of phases, with #2 on side s now and sTo to end
 * (+1 left, -1 right). The route (design section 4): from line abreast (or a picture that fits nothing) it is a
 * rejoin to fighting wing first, the capture point (SMM 16.20 para 65), flown straight through it for the hot
 * rejoin to echelon (para 66); a change of side is made behind Lead in the formation the pair is then in (a close
 * formation never crosses in front of Lead, SMM 12.20 para 44b; "flow to the opposite side" in fighting wing,
 * SMM 12.29 para 69); then the close-formation legs, or the opening out into line abreast (SMM 16.18 para 51).
 */
function legsFor(from, s, to, sTo, spacingFt) {
  const slot = (key, side) => slotFor(key, side, spacingFt);
  const phases = [];
  let at = from;
  let side = s;

  if (at === 'lab' || at === 'other') {
    phases.push(rejoinTo(slot('fw', side), to === 'echelon' ? { advanceTol: 150 } : to === 'fw' ? {} : { advanceTol: 40 }));
    at = 'fw';
  }

  // Cross behind Lead to the other side, in the formation the pair is in. Fighting wing is crossed in place only when the target is
  // fighting wing or line abreast; for the close formations it closes first and crosses there, which is far quicker.
  // A close crossover (SMM 12.20 paras 44-45, Figs 12.12-12.13): back and down into the corner and stop; across at a steady
  // rate (a small heading change, slide's 8 ft/s: an estimate), passing slightly aft of line astern; stop directly behind
  // the new slot; then forward and up into it. The caller adds the last move.
  const corner = (key, side) => cornerBehind(slot(key, side), spacingFt);
  const crossClose = () => {
    phases.push(stopAt(corner(at, side)), stopAt(corner(at, sTo)), slide(slot(at, sTo), { fwdRate: 5 }));
    side = sTo;
  };
  const closeTarget = to === 'echelon' || to === 'route';
  if (at !== 'astern' && to !== 'astern' && side !== sTo && !(at === 'fw' && closeTarget)) {
    if (at === 'fw') {
      // drop back to the fighting wing spacing astern (750 ft by default), flow across behind Lead, then to the other side's
      // slot; 30 ft/s across is an estimate
      const flow = { latRate: 30, vrel0: 32, advanceTol: 25 };
      const fw = slot('fw', side);
      const back = -fwShape.rangeFt;
      phases.push(dropBack({ ...fw, fwd: back }, flow), dropBack({ fwd: back, left: 0, alt: fw.alt }, flow), dropBack({ ...slot('fw', sTo), fwd: back }, flow));
      if (to !== 'fw') phases.push(dropBack(slot('fw', sTo), { advanceTol: 25 }));
      side = sTo;
    } else {
      crossClose();
    }
  }

  if (to === 'lab') {
    phases.push(openOut(slot('lab', sTo)));
  } else if (to === 'fw') {
    const fw = slot('fw', sTo);
    if (at === 'fw') {
      if (!phases.length) return phases;
      phases.push(dropBack(fw, { advanceTol: 6, finalTol: 6, vrel0: 16 }));
    } else {
      // drop back and sweep out in one expeditious move, about 7-15 s to the band (Patrick 19:03Z, TS-55); SMM 16.32 para 92 says
      // "slowly drop back", and Patrick's ruling wins (rule book, What wins). Speed changes stay near 2 kt/s.
      phases.push(sweepOut(fw));
    }
  } else {
    if (at === 'fw') {
      // The straight-ahead rejoin (Patrick 19:04Z, TS-55; SMM 12.26 paras 62-63 and Fig 12.17; EFIG p.371), on the side wanted.
      if (to !== 'astern') side = sTo;
      phases.push(...straightAhead((fwd, left, alt) => ({ fwd, left, alt }), slot('route', side), { endInRoute: to === 'route' }));
      at = 'route';
      if (to === 'route') return phases;
    }
    if (to === 'astern') {
      // Echelon to line astern (SMM 12.20 para 46): the first half of the crossover, stopping directly astern (slightly aft,
      // the corner's spacing), then adjusting power to move up into position.
      const astern = slot('astern', 0);
      if (at !== 'astern') phases.push(stopAt(corner(at, side)), stopAt({ ...corner(at, side), left: 0 }));
      phases.push(slide(astern));
    } else if (at === 'astern') {
      // Line astern to echelon (SMM 12.20 para 47): the latter part of the crossover: across to directly behind the slot and
      // stop, then forward and up into it.
      phases.push(stopAt(corner(to, sTo)), slide(slot(to, sTo), { fwdRate: 5 }));
    } else if (at !== to || side !== sTo) {
      phases.push(slide(slot(to, sTo)));
    }
  }
  return phases;
}

/** The words for how a change is flown. */
export function describe(from, to, rejoinKind) {
  const fromLab = from === 'lab' || from === 'other';
  if (fromLab && to === 'lab') return 'in line abreast';
  if (fromLab) {
    const how = rejoinKind === 'straight' ? 'straight-ahead rejoin' : to === 'echelon' ? 'hot turning rejoin' : 'turning rejoin';
    return to === 'fw' ? how : to === 'echelon' ? how : `${how} to fighting wing, then ${to === 'route' ? 'close to route' : 'close and cross behind'}`;
  }
  if (to === 'lab') return 'entry to line abreast, Lead speeds up to 220 KIAS';
  if (to === 'fw') return from === 'fw' ? 'flow to the other side behind Lead' : 'drop back and sweep out, expeditious';
  if (from === 'fw') return 'straight-ahead rejoin';
  return 'station change';
}

// ---- the plan for a button press ---------------------------------------------------------------------

/**
 * Plans a change of formation for a pair [lead, wing] as they are now.
 * to: 'lab' | 'fw' | 'echelon' | 'route' | 'astern'. options: { side: 'keep' | 'left' | 'right', spacingFt, blockFt,
 * rejoin: 'into' | 'straight', lastSide (+1/-1, for a pair in line astern) }.
 * Returns { ok, reason?, plans: { id: { segments, profile } }, note, label, from, to, side, rejoinKind, endSec, rejoinPhase, maxBankDeg }.
 * When ok is false nothing should be flown and `reason` says why in one line (spec section 10, "When things go wrong").
 */
export function planGoTo(pair, to, options = {}, t0 = 0) {
  const [lead, wing] = pair;
  const spacingFt = options.spacingFt ?? 6000;
  const blockFt = options.blockFt ?? 8000;
  if (!FORMATIONS[to]) return { ok: false, reason: `There is no formation called ${to}.` };
  const from = classifyPair(lead, wing);
  const lastSide = options.lastSide ?? -1;
  const sCur = from.side || lastSide;
  const want = options.side ?? 'keep';
  const sTo = to === 'astern' ? 0 : want === 'left' ? 1 : want === 'right' ? -1 : sCur;
  if (from.key === to && (to === 'astern' || sTo === sCur)) return { ok: false, reason: `Already in ${FORMATIONS[to].label.toLowerCase()}.` };
  if (from.key === 'lab' && to === 'lab') return { ok: false, reason: 'Already in line abreast.' };
  const rejoinOpt = options.rejoin ?? 'into';
  const fromLab = from.key === 'lab' || from.key === 'other';
  const rejoinKind = fromLab && to !== 'lab' ? (rejoinOpt === 'straight' || from.key === 'other' ? 'straight' : 'into') : 'none';
  const targetKias = to === 'lab' ? KIAS_LAB : KIAS_OUTSIDE_LAB;
  const phases = legsFor(from.key, sCur, to, sTo, spacingFt);
  if (!phases.length) return { ok: false, reason: 'Nothing to change.' };
  if (options.overtakeKias !== undefined || options.bankCapDeg !== undefined) {
    for (const p of phases) {
      if (p.bankCapDeg === REJOIN.bankCapDeg && options.bankCapDeg !== undefined) p.bankCapDeg = options.bankCapDeg;
      if (p.overtakeKias === REJOIN.overtakeKias && options.overtakeKias !== undefined) p.overtakeKias = options.overtakeKias;
    }
  }

  const speedSegs = Math.abs(lead.kias - targetKias) > 0.5 ? [speedSeg(lead.kias, targetKias, blockFt)] : [];
  const judgeEnd = (attempt) => judgeFormation(to, attempt.run.end.lead, attempt.run.end.wing, spacingFt);
  const finished = (attempt) => attempt.run.ok && judgeEnd(attempt).inBand && attempt.run.durationSec <= CHANGE_LIMIT_SEC;
  // A rejoin has to keep the overshoot lane (never ahead of Lead's 3/9 line inside 1,000 ft, +-100 ft) and stay under Lead (SMM 12.27 para 65).
  const laneOk = (attempt) => attempt.run.laneFwdFt <= LANE_MARGIN_FT && attempt.run.minBelowFt > 0;
  /** @type {any} */
  let best = null;
  if (rejoinKind === 'into') {
    // Lead pauses and lets #2 establish closure, then turns gently into #2 (AFM8 brief p.19; SMM 16.20 para 65b): the pause is how long
    // a straight-ahead rejoin takes to bring #2 inside the range, found from a first run; the turn is the first angle that keeps the lane.
    const straight = fly2(lead, wing, speedSegs, t0, phases, blockFt);
    for (const rangeFt of REJOIN.turnAtRangeFt) {
      const at = straight.run.ranges.findIndex((r) => r <= rangeFt);
      if (at < 0) continue;
      const waitSec = onStep(at * STEP_SEC);
      for (const turnDeg of REJOIN.turnAnglesDeg) {
        const leadSegs = [...speedSegs, { kind: 'hold', untilSec: t0 + waitSec }, turnSeg(wholeDegree(lead.headingRad + sCur * turnDeg * DEG), sCur, REJOIN.leadBankDeg)];
        const attempt = { ...fly2(lead, wing, leadSegs, t0, phases, blockFt), turnDeg, waitSec };
        if (finished(attempt) && laneOk(attempt)) {
          best = attempt;
          break;
        }
      }
      if (best) break;
    }
    if (!best) {
      // No turn keeps the lane from here: Lead holds straight and #2 flies the straight-ahead rejoin (SMM 12.26 paras 62-63).
      best = { ...straight, turnDeg: 0, waitSec: 0, straightFallback: true };
    }
  } else {
    best = { ...fly2(lead, wing, speedSegs, t0, phases, blockFt), turnDeg: 0, waitSec: 0 };
  }
  best.judged = judgeEnd(best);
  best.good = finished(best);
  if (!best.good) {
    return {
      ok: false,
      reason: !best.run.ok
        ? `No safe rejoin from here: the planner could not reach ${FORMATIONS[to].label.toLowerCase()} inside ${Math.round(PLAN_MAX_SEC / 60)} minutes.`
        : !best.judged.inBand
          ? `No safe rejoin from here: ${best.judged.text}`
          : `No safe rejoin from here: it would take more than ${Math.round(CHANGE_LIMIT_SEC / 60)} minutes.`,
      from: from.key,
      to,
    };
  }
  const { leadSegs, run, profile } = best;
  const plans = {
    [lead.id]: { segments: leadSegs.map((s) => ({ ...s })) },
    [wing.id]: { segments: [{ kind: 'bankTrack', points: run.points }], profile },
  };
  const how = describe(from.key, to, rejoinKind);
  const sideWord = to === 'astern' ? '' : sTo > 0 ? ' left' : ' right';
  const fromWord = FORMATIONS[from.key]?.label ?? 'In trail';
  const fromSide = from.key === 'astern' || from.key === 'other' ? '' : sCur > 0 ? ' left' : ' right';
  const turnNote = best.turnDeg
    ? ` Lead slows to ${KIAS_OUTSIDE_LAB} KIAS, waits for closure, then turns ${best.turnDeg}° into #2 at ${REJOIN.leadBankDeg}° bank.`
    : best.straightFallback ? ' No turn kept the overshoot lane from here, so Lead holds straight.' : '';
  return {
    ok: true,
    plans,
    note: `${fromWord}${fromSide} to ${FORMATIONS[to].label}${sideWord}: ${how}.${turnNote}`,
    label: `${FORMATIONS[to].label}${sideWord}`,
    flying: `${fromWord}${fromSide} to ${FORMATIONS[to].label}${sideWord} (${how})`,
    from: from.key,
    fromSide: sCur,
    to,
    side: sTo,
    rejoinKind,
    leadTurnDeg: best.turnDeg,
    laneFwdFt: best.run.laneFwdFt,
    maxBankDeg: run.maxBankDeg,
    judged: best.judged,
    endSec: t0 + run.durationSec,
    rejoining: fromLab && to !== 'lab',
  };
}

/** Two passes of the tracker: the first learns the leg times, the second flies with #2's height profile built from them. */
function fly2(lead, wing, leadSegs, t0, phases, blockFt) {
  const refs = { [lead.id]: recordFlight(lead, { segments: leadSegs }, t0) };
  return { leadSegs, ...trackTwice({ refs, wing0: wing, t0, phases, blockFt }) };
}

/**
 * The tracker run twice (fly2's method, for any set of recorded references): the first run learns when each leg starts and
 * ends, the second flies with the wingman's height profile built from those times. Returns { run, profile }.
 */
export function trackTwice({ refs, wing0, t0, phases, blockFt, maxSec = PLAN_MAX_SEC }) {
  const common = { refs, wing0, t0, phases, blockFt, maxSec };
  const first = runTracker({ ...common, profile: undefined });
  const profile = heightProfile(wing0.altAboveFt, phases, first.times, t0);
  const run = profile.length ? runTracker({ ...common, profile }) : first;
  return { run, profile };
}

/** #2's height: from where it is, smooth legs to each leg's slot height (smootherstep, no climb rate at the ends: spec F7, F12). */
export function heightProfile(alt0, phases, times, t0) {
  const legs = [];
  let alt = alt0;
  let from = t0;
  phases.forEach((ph, i) => {
    const target = ph.slot.alt;
    const start = Math.max(times[i].t0 ?? from, from);
    const end = times[i].t1 ?? start + 6;
    if (Math.abs(target - alt) > 0.5) {
      const floor = ph.altRateFtps ? Math.abs(target - alt) / ph.altRateFtps : 0;
      const t1 = Math.max(ph.altSec ? start + ph.altSec : end, start + 4, start + floor);
      legs.push({ t0: start, t1, fromFt: alt, toFt: target });
      alt = target;
      from = t1;
    }
  });
  return legs;
}

// ---- readouts for the Formation card ----------------------------------------------------------------------

/** Lead's clock position from #2 (12 at the nose, 9 off the left wing), to the half hour. */
export function clockText(bearingDeg) {
  let hour = Math.round((((-bearingDeg / 30) % 12) + 12) % 12 * 2) / 2;
  if (hour === 0) hour = 12;
  const whole = Math.floor(hour);
  return `${whole}${hour % 1 ? ':30' : ''} o'clock`;
}

/**
 * The rejoin block of the card: range, closure, where Lead is, the line (ON LINE, HOT or COLD, 60° and 30° being
 * estimates), and height against Lead (SMM 12.27 para 65: never at or above Lead's height).
 */
export function rejoinReadout(lead, wing) {
  const dx = wing.xFt - lead.xFt;
  const dy = wing.yFt - lead.yFt;
  const range = Math.hypot(dx, dy);
  const lv = { x: lead.tasFtps * Math.cos(lead.headingRad), y: lead.tasFtps * Math.sin(lead.headingRad) };
  const wv = { x: wing.tasFtps * Math.cos(wing.headingRad), y: wing.tasFtps * Math.sin(wing.headingRad) };
  const closureFtps = range > 1e-6 ? -(((wv.x - lv.x) * dx) + ((wv.y - lv.y) * dy)) / range : 0;
  const bearing = relativeBearingDeg({ x: wing.xFt, y: wing.yFt, hdg: wing.headingRad }, { x: lead.xFt, y: lead.yFt });
  const abs = Math.abs(bearing);
  const line = abs >= REJOIN.hotBearingDeg ? 'HOT' : abs <= REJOIN.coldBearingDeg ? 'COLD' : 'ON LINE';
  const below = lead.altAboveFt - wing.altAboveFt;
  return { rangeFt: range, closureKt: closureFtps * FTPS_TO_KT, bearingDeg: bearing, clock: clockText(bearing), line, belowFt: below, aboveLead: below <= 0 };
}
