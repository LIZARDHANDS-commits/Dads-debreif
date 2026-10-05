// The tracker (clean-up step 1, TS-64; Patrick 5 Oct 05:27Z: "Tracker for fallback, and refractor the tracker"): a small
// closed-loop "pilot" that flies a wingman toward a slot in the frame of the aircraft he flies off, commanding bank and
// speed the way a pilot would, through the very same flight.js step the real aircraft use. It is flown once as a dry run
// at the press; the bank and speed it commanded are recorded and replayed by the real aircraft (transitions.js flyStep's
// 'bankTrack' segment), so the path drawn ahead is the path flown (spec F1). It stays as the fallback for starts that no
// kinematic-line rule covers; until step 1 it lived in transitions.js. Its numbers are tuning.js TRACKER (all estimates:
// they shape how smoothly the wingman flies, not where the formations are). The leg recipes that call it (slide, stopAt,
// dropBack, sweepOut, closeThrough, rejoinTo, openOut, straightAhead) stay with the moves in transitions.js.
import { bankDegFromTurnRate } from '../../../core/flight-math.js';
import { wrapPi } from '../../../core/angles.js';
import { G_FTPS2, KT_TO_FTPS } from '../../../core/units.js';
import { STEP_SEC, stepAircraft, copyAircraft } from './flight.js';
import { relativeTo, unit } from './manoeuvres.js';
import { fullPowerKtps, slowKtps } from './slow-down.js';
import { throttleFor, powerFrom } from './power.js';
import { TRACKER, CLOSURE, HAND_OVER_FT } from './tuning.js';

/** The longest the tracker flies one plan before giving up (a guard only; the spec's limits are tighter). */
export const PLAN_MAX_SEC = 300;

/** Sets the indicated airspeed and keeps the true airspeed in proportion (the height is held, so the ratio is constant). */
export function setKias(a, kias) {
  const ratio = a.tasFtps / a.kias;
  a.kias = kias;
  a.tasFtps = kias * ratio;
}

/** One step flown at a commanded bank, by the unchanged flight.js step (a never-finishing turn segment holds the bank target). */
export function stepCommanded(a, targetBankDeg, t, profile) {
  const dir = targetBankDeg < 0 ? -1 : 1;
  const segments = Math.abs(targetBankDeg) < 1e-9
    ? []
    : [{ kind: 'turn', toRad: a.headingRad + dir * Math.PI / 2, dir, bankDeg: Math.abs(targetBankDeg), rollOut: false }];
  stepAircraft(a, { segments, profile }, t);
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
 * A closure phase's closing speed on its slot at distance d (ft/s, tuning.js CLOSURE): the closure rate, stopped from the
 * stopping distance. Fore and aft the stop is the power-back slowing the tracker's speed loop uses (closing from behind)
 * or full power's speeding up (closing from ahead), at the speed and height flown (slow-down.js); sideways it is the slide's bank (CLOSURE.slideBankDeg, the same for every
 * Rates choice), never more than the phase's bank cap gives; both at CLOSURE.stopShare. Beyond the hand-over range (an odd start, the
 * tracker's fallback) it may grow with range (CLOSURE.farGain), as the old rejoin's did.
 */
function closureCap(ph, L, W, ex, ey, d, blockFt, farFromFt) {
  if (d < 1e-6) return 0;
  const c = Math.cos(L.headingRad);
  const s = Math.sin(L.headingRad);
  const uf = (ex * c + ey * s) / d;
  const ul = (-ex * s + ey * c) / d;
  const ft2 = KT_TO_FTPS * (W.tasFtps / W.kias); // KIAS per second to true ft/s²
  const aFore = (uf >= 0 ? slowKtps('power', W.kias, blockFt) : fullPowerKtps(W.kias, blockFt)) * ft2; // what the tracker's own speed loop can do
  const aLat = G_FTPS2 * Math.tan((Math.min(CLOSURE.slideBankDeg, ph.bankCapDeg) * Math.PI) / 180);
  const aStop = CLOSURE.stopShare * Math.min(aFore / Math.max(Math.abs(uf), 1e-6), aLat / Math.max(Math.abs(ul), 1e-6));
  const rate = ph.closureFtps + CLOSURE.farGain * Math.max(0, d - farFromFt);
  return Math.min(ph.vrelMax, rate, Math.sqrt(2 * aStop * d));
}

/**
 * The power a tracker step was flown with (power.js; the tag's MAX, PWR nn%, IDLE or IDLE+BOARDS): full power while the
 * acceleration is at full power's, part power down to the power floor, then idle, then idle and the speed brake only when
 * idle can't give the slowing wanted (Patrick 05:47Z, 05:54Z, 06:13Z; slow-down.js, TS-61).
 */
function powerOf(accel, aMax, W, blockFt) {
  if (accel >= aMax * 0.985) return powerFrom(null, 1, W.kias, blockFt);
  if (accel >= -slowKtps('power', W.kias, blockFt, W.g)) return powerFrom(null, Math.max(0, throttleFor(accel, W.kias, blockFt, W.g, W.climbFtps)), W.kias, blockFt);
  if (accel >= -slowKtps('idle', W.kias, blockFt, W.g)) return powerFrom('idle', 0, W.kias, blockFt);
  return powerFrom('idleBoards', 0, W.kias, blockFt);
}

/**
 * Runs the dry run: #2 (wing0) flies the phases in turn, each a slot in the frame of the aircraft it names (`track`, a
 * key of `refs`, recorded flights). For the 2-ship: refs = { [Lead's id]: Lead's recorded flight }. profile: the
 * wingman's height profile (or undefined). A phase with `holdUntil` is not left (nor, the last one, finished) before
 * that formation time: a gate (design section 4: "wait for the one ahead" as a start time). A phase with `world: true`
 * holds its offset in world axes instead of the reference's frame, so the wingman turns with its reference as in an
 * in-place turn. Returns { points: [[bank, kias]…], end: { lead, wing }, times: [{ t0, arrive, t1 }…], maxBankDeg, ok,
 * durationSec, ranges, laneFwdFt, minBelowFt } (ranges and the lane are measured from the aircraft each phase flies off).
 * A phase with `closureFtps` flies the power profile (tuning.js CLOSURE, Patrick 04:58Z, 05:47Z, 05:54Z; clean-up step 2):
 * the closing speed is set and held at the closure rate and stopped from the stopping distance idle (or the slide's bank)
 * gives; the speed loop is the tracker's own (Patrick 06:24Z: test it as is first; the power technique of 06:13Z is the
 * line's, hand-over.js). Each point carries the power it was flown with ([bank, kias, power]) for the tags. Phases without
 * it fly as before (the 4-ship's, until step 3).
 * Since step 2 also: `init` ({ accelKtps }) starts the speed loop at the acceleration the aircraft already has and its
 * heading loop on its present turn, so a hand-over from a kinematic line (hand-over.js) has no step in bank or speed; and
 * `stopWhenSettled` ends the run once #2 has settled on the last slot, without waiting for Lead to finish his plan (the
 * first pass of a run whose Lead rolls out once #2 is in).
 */
export function runTracker({ refs, wing0, t0, phases, profile, blockFt, maxSec = PLAN_MAX_SEC, init = null, stopWhenSettled = false }) {
  const T = TRACKER;
  const GAIN = T.gain;
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
  let accel = init?.accelKtps ?? 0; // KIAS per second, filtered by the jerk limit
  let psiCmdPrev = init ? null : W.headingRad; // with init, the first commanded heading is its own previous one (no feed-forward kick)
  let omegaFf = init ? (G_FTPS2 * Math.tan((W.bankDeg * Math.PI) / 180)) / Math.max(W.tasFtps, 1) : 0;
  const farFromFt = HAND_OVER_FT; // beyond the hand-over range a closure phase may close faster (odd starts only)
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
        const step = rate * T.refAccelShare * STEP_SEC;
        ref[v] += Math.max(-step, Math.min(step, want - ref[v]));
        ref[axis] += ref[v] * STEP_SEC;
        if (Math.abs(target - ref[axis]) < T.snapFt) ref[axis] = target;
      }
    }
    const arrived = ph.goal ? Math.hypot(ref.f - slot.fwd, ref.l - slot.left) < (ph.goalTolFt ?? T.goalTolFt) : ref.f === ph.slot.fwd && ref.l === ph.slot.left;

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
      const settled = arrived && last && gateOpen && d <= ph.finalTol && relVel <= Math.max(T.settleMinFtps, T.settleShare * ph.finalTol);
      if (settled && stopWhenSettled) {
        times[k].t1 = t;
        ok = true;
        break;
      }
      if (settled && L.free && L.bankDeg === 0) {
        times[k].t1 = t;
        aligning = true;
      }
      const ratio = W.tasFtps / W.kias;
      let pullX;
      let pullY;
      if (ph.closureFtps) {
        // The closure, dying away near the slot in proportion to the distance: fore and aft at the tracker's own position
        // gain (power is the slow axis), sideways at CLOSURE.nearGain (bank is quick). One gain of 1/s on both left #2
        // hunting about 20 ft fore and aft of the slot, never settling (V2.22-V2.23: the refusals Patrick saw 5 Oct 07:06Z).
        const pull = closureCap(ph, L, W, ex, ey, d, blockFt, farFromFt);
        const c = Math.cos(L.headingRad);
        const s = Math.sin(L.headingRad);
        const ef = ex * c + ey * s;
        const el = -ex * s + ey * c;
        const share = d > 1e-6 ? pull / d : 0;
        const vf = Math.sign(ef) * Math.min(share * Math.abs(ef), GAIN.position * Math.abs(ef));
        const vl = Math.sign(el) * Math.min(share * Math.abs(el), CLOSURE.nearGain * Math.abs(el));
        pullX = vf * c - vl * s;
        pullY = vf * s + vl * c;
      } else {
        const cap = Math.min(ph.vrelMax, ph.vrel0 + ph.kcap * Math.max(0, d - ph.d0), Math.sqrt(2 * ph.decel * d)); // never closing faster than it can stop (decel in ft/s²)
        const pull = Math.min(cap, GAIN.position * d);
        pullX = d > 1e-6 ? (ex / d) * pull : 0;
        pullY = d > 1e-6 ? (ey / d) * pull : 0;
      }
      const vdx = vpx + pullX;
      const vdy = vpy + pullY;
      const speed = Math.hypot(vdx, vdy);
      psiCmd = speed > T.minSpeedFtps ? Math.atan2(vdy, vdx) : L.headingRad;
      // A closure phase may be faster or slower than the aircraft flown off by the closure rate (it replaces the 15 KIAS
      // rejoin overtake, Patrick 05:46Z).
      const over = ph.closureFtps ? ph.closureFtps / ratio : ph.overtakeKias;
      const under = ph.closureFtps ? ph.closureFtps / ratio : ph.undertakeKias;
      kiasCmd = Math.max(L.kias - under, Math.min(L.kias + over, speed / ratio));
    }

    // Heading loop: turn rate toward the commanded heading, with its own rate fed forward; bank from the turn rate.
    if (psiCmdPrev === null) psiCmdPrev = psiCmd;
    const psiStep = wrapPi(psiCmd - psiCmdPrev);
    psiCmdPrev = psiCmd;
    omegaFf += GAIN.ffFilter * (psiStep / STEP_SEC - omegaFf);
    const omegaCmd = GAIN.heading * wrapPi(psiCmd - W.headingRad) + omegaFf;
    const cap = aligning ? T.alignBankDeg : ph.bankCapDeg;
    let bank = Math.max(-cap, Math.min(cap, bankDegFromTurnRate(W.tasFtps, omegaCmd)));
    // Lining up on a closure phase, the last few hundredths of a degree of bank are taken out at once, so the wings come
    // level in a step or two instead of creeping for ten seconds (the heading left is inside alignHeadingRad).
    if (aligning && ph.closureFtps && Math.abs(bank) < T.alignDeadbandDeg) bank = 0;

    // Speed loop: acceleration follows the speed error, limited to what the T-6 can do (full power up, power back down:
    // slow-down.js, TS-61) and built up by a jerk limit. The tracker keeps its own speed loop on every phase, a closure
    // phase too (Patrick 5 Oct 06:24Z: "I think it needs a different power module.... Maybe we should test it as is first?").
    const aMax = fullPowerKtps(W.kias, blockFt);
    const aMin = slowKtps('power', W.kias, blockFt);
    const aCmd = Math.max(-aMin, Math.min(aMax, GAIN.speedLoop * (kiasCmd - W.kias)));
    accel += Math.max(-GAIN.jerkKtps2 * STEP_SEC, Math.min(GAIN.jerkKtps2 * STEP_SEC, aCmd - accel));
    let kias = W.kias + accel * STEP_SEC;
    if (aligning && Math.abs(L.kias - kias) < T.kiasSnap) { // the last few thousandths of a knot, so the speed has no step
      kias = L.kias;
      accel = 0;
    }
    setKias(W, kias);
    stepCommanded(W, bank, t, profile);
    points.push(ph.closureFtps ? [bank, kias, powerOf(accel, aMax, W, blockFt)] : [bank, kias]);
    m++;
    const Lafter = R.at(m);
    maxBank = Math.max(maxBank, Math.abs(W.bankDeg));
    const after = relativeTo(Lafter, W);
    const range = Math.hypot(after.fwd, after.left);
    ranges.push(range);
    if (range < T.laneRangeFt) laneFwdFt = Math.max(laneFwdFt, after.fwd);
    if (range < T.belowRangeFt) minBelowFt = Math.min(minBelowFt, Lafter.altAboveFt - W.altAboveFt);
    t += STEP_SEC;

    if (aligning && Lafter.free && W.bankDeg === 0 && W.rollRateDps === 0 && Math.abs(wrapPi(W.headingRad - Lafter.headingRad)) < T.alignHeadingRad && W.kias === Lafter.kias) {
      ok = true;
      break;
    }
  }
  return { points, end: { lead: { ...R.at(m) }, wing: W }, times, maxBankDeg: maxBank, ok, durationSec: t - t0, ranges, laneFwdFt, minBelowFt };
}

/**
 * One leg for the tracker: chase `slot` (in the frame of the aircraft the leg names in `track`, or Lead) with
 * tuning.js TRACKER.phase's settings, changed by `over` (the leg recipes in transitions.js, four-ship-moves.js and
 * formation-turns.js). Fields beyond those: altSec, altRateFtps, stopFtps, dwellSec (below), goal, goalTolFt, holdUntil,
 * world, track (runTracker).
 */
export function phase(slot, over = {}) {
  return {
    slot,
    ...TRACKER.phase,
    altSec: null, // seconds over which the height changes (null: the whole leg)
    altRateFtps: null, // when set, the height change takes at least |change| / this many seconds (the 4-ship's stack; null: no floor)
    stopFtps: null, // when set, a real stop: the next phase starts only once #2's speed against the slot is under this...
    dwellSec: 0, // ...and has been for this long (the station change's "stabilize", SMM 12.20 para 45)
    closureFtps: null, // when set, the power profile at this closure rate (runTracker; the 2-ship since step 2)
    ...over,
  };
}

/**
 * The tracker run twice (fly2's method, for any set of recorded references): the first run learns when each leg starts and
 * ends, the second flies with the wingman's height profile built from those times. Returns { run, profile }.
 */
export function trackTwice({ refs, wing0, t0, phases, blockFt, maxSec = PLAN_MAX_SEC, init = null, stopWhenSettled = false }) {
  const common = { refs, wing0, t0, phases, blockFt, maxSec, init, stopWhenSettled };
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
    const end = times[i].t1 ?? start + TRACKER.height.unknownLegSec;
    if (Math.abs(target - alt) > TRACKER.height.minChangeFt) {
      const floor = ph.altRateFtps ? Math.abs(target - alt) / ph.altRateFtps : 0;
      const t1 = Math.max(ph.altSec ? start + ph.altSec : end, start + TRACKER.height.minSec, start + floor);
      legs.push({ t0: start, t1, fromFt: alt, toFt: target });
      alt = target;
      from = t1;
    }
  });
  return legs;
}
