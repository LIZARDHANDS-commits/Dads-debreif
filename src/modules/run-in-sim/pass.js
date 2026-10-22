// The pass: the five legs (orbit, to the IP and the run-in, the dive, the release, the escape; spec "The pass", RS-3),
// worked out and flown. Plain values only, no page: index.js calls flyPass() when "Fly the pass" is pressed, and the
// playback reads the stored timeline it returns.
//
// 1. The plan (buildPlan): the target, the run-in line, the IP and the orbit from the settings, and the numbers the
//    computer works out so the pass hits (RS-9): the release point (core drop.js carp, with the planning wind, RS-7), so
//    the aim-off for the wind (the run-in line moved upwind of the target by it), and for a dive the release point on the
//    dive line (carp with the release's vertical part, RS-5), the aim-off point, the roll-in height (so the dive is steady
//    for STEADY.needSec before release, an estimate) and the roll-in speed (so the dive at idle arrives at the speed set
//    for release). Any of them can be set by hand instead (setup.byHand); the pass then flies as set.
// 2. The orbit exit: the moment to leave the orbit so the time over target is made (RS-8). On the circle (solveExit), found
//    by flying the rest of the pass from candidate exits; when no exit can make it, the soonest, and the card says how late.
//    On the holding pattern and the figure 8 (RS-11; solvePattern, flyPattern), the pilot always leaves at the IP heading
//    inbound, and the time is made by the last lap: the holding pattern's last outbound leg stretched or shortened, or (RS-31)
//    the figure 8's loops not yet begun all flown at one bank, wider or tighter (PATTERN's limits, estimates, and the
//    steepest level turn the aircraft's set holds). The figure 8 is flown crossing the IP
//    heading away from the target and left by its exit, a teardrop turn inbound onto the run-in line behind the IP (Dad's
//    ask of 19 Oct 2026, RS-11). The pattern is a path of legs and arcs over
//    the ground (ground-path.js) held by the same L1 follower as the run-in line and the circle.
// 3. The flight (fly): the pilot (pilot.js) on core's point mass, stepped at PASS_STEP_SEC through every leg, each step
//    stored. The aircraft meets the actual wind; the load falls through it (core flyDrop) from the aircraft's state at
//    release; over the bridge, it stops on the deck only if it meets the deck from above or its edge (RS-12; targets.js
//    deckHit), and one that misses falls on past it to the ground.
// 4. The result: the miss (core missClock), the time over target, the release against the plan, the escape's lowest
//    height, peak G, closest distance and lowest airspeed, each flagged against its reference (RS-6), the leg times, and
//    plain words for anything the pass could not do as set.
//
// Axes: feet, x east, y north, z MSL, the aim point at x = y = 0. Headings here are compass degrees TRUE (defaults.js
// turns the typed magnetic ones). Speeds name their kind: KIAS set, true airspeed flown, ground speed over the ground.
import { flyDrop, carp, missClock, DROP_LOADS, DROP_STEP_SEC } from '../../core/drop.js';
import { windTriangle } from '../../core/wind.js';
import { densityRatio } from '../../core/atmosphere.js';
import { iasToTasKt } from '../../core/t6-performance.js';
import { pointMassState } from '../../core/point-mass.js';
import { turnRadiusFromBankFt } from '../../core/flight-math.js';
import { unitVectorFromCompassDeg, compassDegFromVector, compassDegToHeadingRad, degToRad, radToDeg, wrapPi } from '../../core/angles.js';
import { FT_PER_NM, KT_TO_FTPS, G_FTPS2 } from '../../core/units.js';
import { dropWind } from '../debrief/drop.js';
import { AIRCRAFT } from './aircraft.js';
import { targetSizes, deckOf, deckHit, deckMiss, TARGETS } from './targets.js';
import { makePath, pointOnPath, nearestOnPath, samplePath, holdLap, eightLoop, eightExit, eightExitSizes } from './ground-path.js';
import { PILOT, pilotAt, pilotStep, wantedLift, airData } from './pilot.js';

/** The flight's step, s: the shared point mass's (core drop.js uses the same 0.05 s). */
export const PASS_STEP_SEC = DROP_STEP_SEC;
/** The working-out runs step at this, s, coarser to keep "Fly the pass" quick; the stored flight is at PASS_STEP_SEC. */
const SOLVE_STEP_SEC = 0.1;
/** A pass is followed for at most this long, s (a guard: the longest time over target the box takes is an hour). */
const MAX_PASS_SEC = 4000;
/** The escape ends once level at its height this long, s, or after ESCAPE_MAX_SEC (estimates). */
const ESCAPE_HOLD_SEC = 5;
const ESCAPE_MAX_SEC = 150;
/**
 * The dive is steady while its path over the ground is within climbDeg of the dive angle, within offFt of the dive line
 * and within bankDeg of wings level; it should be steady needSec before release (spec, RS-9: "5 s, an estimate"). The
 * three tolerances are estimates.
 */
export const STEADY = Object.freeze({ climbDeg: 1, offFt: 30, bankDeg: 5, needSec: 5 });
/** The lowest roll-in speed the working-out picks, KIAS (an estimate: slower and the roll-in pull nears the stall line). */
const MIN_ROLL_IN_KIAS = 140;
/**
 * The escape references the card flags (spec, Defaults "Flags"; RS-Q3, estimates until Patrick says): 500 ft AGL
 * anywhere; the flyover's 1,000 ft above the target's top inside 2,000 ft of it (the CARs 602.14 built-up-area
 * reference, to be checked).
 */
export const REFERENCES = Object.freeze({ lowestAglFt: 500, overTopFt: 1000, overTopInsideFt: 2000, orbitBankDeg: 45 });
/**
 * The holding pattern and the figure 8 (RS-11), ESTIMATES: the last outbound leg is shortened to no less than
 * holdMinLegSec (so the pilot is wings level inbound before the IP). The figure 8's legs cross at the IP at eightCrossDeg
 * (V2.508, an infinity sign; an estimate), heading away from the target by default (Dad's ask of 19 Oct 2026, RS-30).
 * Since RS-31 (Dad, 19 Oct 2026: "can the aircraft G it up more as necessary to make the window") its loops not yet begun
 * are all flown at one bank, worked out to make the time over target, from eightMinBankDeg (15°, the spec's estimate) up
 * to the steepest level turn the aircraft's set holds at full power at the orbit's speed and height (never past the stall
 * line: steepestLevelBankDeg), as many loops as bring that bank nearest the set bank (up to eightMaxLoops); the outbound
 * exit at the same radius, but never tighter than that steepest turn at the run-in speed it speeds up to. The pilot may
 * bank eightBankMarginDeg past the steepest bank planned, to hold the path on the downwind side.
 */
export const PATTERN = Object.freeze({ holdMinLegSec: 15, eightMinBankDeg: 15, eightCrossDeg: 60, eightMaxLoops: 40, eightBankMarginDeg: 10 });

/**
 * The steepest bank, degrees, of a level turn the aircraft's set holds at full power at kias and height msl (RS-31): where
 * its full-power excess (core's excessFn, the T-6A set's own numbers) falls to zero, never past the stall line (its
 * stallG). Null when it can't hold even 1 G level there at full power.
 */
export function steepestLevelBankDeg(plan, kias, msl) {
  const ac = plan.ac;
  const ktas = plan.tasFt(kias, msl) / KT_TO_FTPS;
  const excess = (g) => ac.excessFn(1)(ktas, msl, g);
  if (excess(1) < 0) return null;
  let a = 1;
  let b = Math.max(1, ac.stallG(kias));
  if (excess(b) < 0) {
    for (let k = 0; k < 30; k++) {
      const m = (a + b) / 2;
      if (excess(m) >= 0) a = m;
      else b = m;
    }
    b = a;
  }
  return radToDeg(Math.acos(1 / b));
}
/** The patterns flown as a path over the ground (the circle keeps the first version's way). */
const PATH_PATTERNS = Object.freeze(['hold', 'eight']);
const TAU = Math.PI * 2;

/** The legs as stored in the timeline. */
export const PHASE = Object.freeze({ ORBIT: 0, TO_IP: 1, RUN_IN: 2, DIVE: 3, RECOVER: 4, TURN: 5, CLIMB: 6 });

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, f) => a + (b - a) * f;

/** The wind (from, compass true, and kt) of a wind vector. */
export function windWords(w) {
  return { fromDeg: compassDegFromVector(-w.x, -w.y), kt: Math.hypot(w.x, w.y) / KT_TO_FTPS };
}

/** Ground speed along a ground line `d` ({ x, y, z }, unit) at true airspeed vFtps in a level wind w: |s d − w| = v. */
export function speedAlong(d, w, vFtps) {
  const dw = d.x * w.x + d.y * w.y;
  const ww = w.x * w.x + w.y * w.y;
  return dw + Math.sqrt(Math.max(0, dw * dw - ww + vFtps * vFtps));
}

/**
 * The plan: the geometry, the winds, and the numbers worked out to hit (RS-9).
 * setup: defaults.js setupFrom(); world: { groundAt(x, y) → ground MSL, ft; known(x, y) → whether a tile gave it }.
 */
export function buildPlan(setup, world) {
  const ac = AIRCRAFT[setup.aircraftId];
  const load = setup.loadId ? DROP_LOADS[setup.loadId] : null;
  const groundAt = world.groundAt;
  const groundFt = groundAt(0, 0);
  const sizes = targetSizes(setup.target.id, setup.target.sizeFt);
  const u = unitVectorFromCompassDeg(setup.trackDegT);
  const r = { x: u.y, y: -u.x }; // right of the run-in
  // The day's density ratio, kept per foot of height: the steps ask for it many times at nearly the same heights.
  const sigmaKept = new Map();
  const sigmaAt = (z) => {
    const k = Math.round(z);
    let v = sigmaKept.get(k);
    if (v === undefined) {
      v = densityRatio(k, setup.tempDevC);
      if (sigmaKept.size > 50000) sigmaKept.clear();
      sigmaKept.set(k, v);
    }
    return v;
  };
  const tasFt = (kias, z) => iasToTasKt(kias, z, sigmaAt(z)) * KT_TO_FTPS;
  const run = setup.run;
  const dive = run === 'bombDive';
  const notes = [];
  const worked = {};

  // The run-in height (MSL) and the wind's top height: the release height, or the flyover's height.
  const releaseMsl = groundFt + setup.releaseFt;
  const flyoverMsl = groundFt + sizes.topFt + setup.heightOverTopFt;
  const windTopMsl = run === 'flyover' ? flyoverMsl : releaseMsl;
  const typed = (w) => ({ topDeg: w.topDegT, topKt: w.topKt, groundDeg: w.groundDegT, groundKt: w.groundKt });
  const windAt = dropWind({ mode: 'typed', typed: typed(setup.wind), releaseFt: windTopMsl, groundFt }).at;
  const planWindAt = setup.planWind ? dropWind({ mode: 'typed', typed: typed(setup.planWind), releaseFt: windTopMsl, groundFt }).at : windAt;
  // The surface the release point is worked out on (core carp): the ground, or for the bridge a level plane at its deck's
  // height, so the load is aimed to come down through the deck's height at its middle (the aim point). A plane rather
  // than the deck alone: the deck's 150 ft step at its edge would leave carp's search no smooth miss to close on. Where
  // the load really stops (the deck, or past it to the ground) is dropFrom's.
  const deckMsl = setup.target.id === 'bridge' ? groundFt + sizes.aimFt : null;
  const loadGroundAt = deckMsl === null ? groundAt : () => deckMsl;

  const plan = {
    setup, run, ac, load, u, r, groundFt, groundAt, loadGroundAt, known: world.known ?? (() => false), sizes,
    aim: { x: 0, y: 0, z: groundFt + sizes.aimFt }, topMsl: groundFt + sizes.topFt,
    sigmaAt, tasFt, windAt, planWindAt, notes, worked,
    offsetFt: 0, runInMsl: run === 'flyover' ? flyoverMsl : releaseMsl, runInKias: setup.kias,
    release: null, dive: null, fallSec: 0,
  };
  plan.ipFt = setup.ipNm * FT_PER_NM;

  if (run === 'flyover') {
    plan.offsetFt = setup.byHand.aimOffFt ?? 0;
    plan.release = { along: 0 }; // the flypast: over or abeam the aim point
  } else if (!dive) {
    // Flat: release at the CARP on a level pass at the release height and speed, worked out with the planning wind.
    const vFtps = tasFt(setup.kias, releaseMsl);
    const pw = windWords(planWindAt(releaseMsl));
    const tri = windTriangle(setup.trackDegT, vFtps / KT_TO_FTPS, pw.fromDeg, pw.kt);
    const gs = tri.groundSpeedKt * KT_TO_FTPS;
    const c = tri.canHoldTrack ? carp({ target: { x: 0, y: 0 }, heightFt: releaseMsl, ground: { vx: u.x * gs, vy: u.y * gs }, load, windAt: planWindAt, groundAt: loadGroundAt, deviationC: setup.tempDevC }) : null;
    if (!c) {
      notes.push(tri.canHoldTrack ? 'The load would not land from this release (a fall longer than 30 minutes): no release point to work out.' : 'The planning wind is stronger than the run-in speed: the run-in track can\'t be held, so no release point to work out.');
    }
    worked.aimOffFt = c ? c.x * r.x + c.y * r.y : 0;
    worked.releaseAlongFt = c ? c.x * u.x + c.y * u.y : 0;
    worked.carp = c ? { x: c.x, y: c.y, z: releaseMsl } : null;
    plan.fallSec = c ? c.fall.impact.t : 0;
    plan.offsetFt = setup.byHand.aimOffFt ?? worked.aimOffFt;
    const along = setup.release.mode === 'distance' ? -setup.release.distFt : worked.releaseAlongFt;
    plan.release = { along, point: { x: u.x * along + r.x * plan.offsetFt, y: u.y * along + r.y * plan.offsetFt, z: releaseMsl } };
  } else if (setup.diveSpeedAt === 'release') {
    buildDivePlan(plan, setup);
  } else {
    // The roll-in speed set, the release speed what the dive gives (Dad's pick, 16 Oct 2026; to confirm with Patrick): the
    // release point is worked out for a guessed release speed, the dive flown from the roll-in, and the release point worked
    // out again for the speed it arrived with, until the two agree within 3 kt (a few passes).
    const n0 = notes.length;
    let guess = null;
    for (let k = 0; k < 4; k++) {
      notes.length = n0;
      buildDivePlan(plan, setup, guess);
      const rel = plan.dive.trial?.release;
      if (!rel || (guess !== null && Math.abs(rel.kias - guess) < 3)) break;
      guess = rel.kias;
    }
  }
  plan.ip = { x: -u.x * plan.ipFt + r.x * plan.offsetFt, y: -u.y * plan.ipFt + r.y * plan.offsetFt };
  // The crab the run-in needs (core windTriangle, with the planning wind at the run-in's height), for the Setup's "set to hit".
  const runInWind = windWords(planWindAt(plan.runInMsl));
  plan.crabDeg = windTriangle(setup.trackDegT, tasFt(plan.runInKias, plan.runInMsl) / KT_TO_FTPS, runInWind.fromDeg, runInWind.kt).crabDeg;

  const o = setup.orbit;
  const msl = groundFt + o.heightFt;
  if (PATH_PATTERNS.includes(o.pattern)) {
    // The holding pattern or the figure 8 (RS-11), on the IP, its turns at the set bank's radius at the orbit's true
    // airspeed (over the ground, so the bank flown changes with the wind), the holding legs the set time at that speed.
    // lap: one lap as drawn before the pass is worked out; path: the whole pattern flown, set by flyPattern.
    const tasFtps = tasFt(o.kias, msl);
    const radiusFt = turnRadiusFromBankFt(tasFtps, o.bankDeg);
    const legFt = tasFtps * o.legSec;
    const lap = o.pattern === 'hold'
      ? holdLap({ ip: plan.ip, u, dir: o.dir, r: radiusFt, legFt })
      : [
        ...eightLoop({ ip: plan.ip, u, dir: o.dir, r: radiusFt, crossDeg: PATTERN.eightCrossDeg, outbound: o.flow !== 'inbound' }),
        ...eightLoop({ ip: plan.ip, u, dir: -o.dir, r: radiusFt, crossDeg: PATTERN.eightCrossDeg, outbound: o.flow !== 'inbound' }),
        // The outbound figure 8 is drawn with its exit (RS-30).
        ...(o.flow !== 'inbound' ? eightExit({ ip: plan.ip, u, dir: -o.dir, r: radiusFt, crossDeg: PATTERN.eightCrossDeg }) : []),
      ];
    plan.orbit = { ...o, msl, ccw: o.dir < 0, tasFtps, radiusFt, legFt, centre: { ...plan.ip }, lap: makePath(lap), path: null, prepFrom: 0 };
    return plan;
  }
  // The circle: centred over the target or back along the run-in, a ground circle (radius) or a steady bank.
  const centre = { x: -u.x * o.backNm * FT_PER_NM, y: -u.y * o.backNm * FT_PER_NM };
  const radiusFt = o.mode === 'radius' ? o.radiusNm * FT_PER_NM : turnRadiusFromBankFt(tasFt(o.kias, msl), o.bankDeg);
  plan.orbit = { ...o, centre, radiusFt, msl, ccw: o.dir < 0 };
  return plan;
}

/**
 * The dive's plan: the dive line over the ground at the dive angle along the run-in, the release point on it (carp with
 * the release velocity's vertical part), the aim-off point where it meets the ground, the roll-in height and speed.
 * relGuessKias: the speed at release to work the release point out for, when the roll-in speed is the one set.
 */
function buildDivePlan(plan, setup, relGuessKias = null) {
  const { u, r, tasFt, planWindAt, notes, worked } = plan;
  const theta = degToRad(setup.diveDeg);
  const d = { x: u.x * Math.cos(theta), y: u.y * Math.cos(theta), z: -Math.sin(theta) };
  const releaseMsl = plan.groundFt + setup.releaseFt;
  const atRollIn = setup.diveSpeedAt !== 'release';
  // The speed at release: set, or (the roll-in speed set) the caller's guess, first the roll-in speed plus 50 kt (an estimate).
  const relKias = relGuessKias ?? (atRollIn ? setup.kias + 50 : setup.kias);
  const groundVel = (z, kias) => {
    const s = speedAlong(d, planWindAt(z), tasFt(kias, z));
    return { vx: d.x * s, vy: d.y * s, vz: d.z * s };
  };
  const c = carp({ target: { x: 0, y: 0 }, heightFt: releaseMsl, ground: groundVel(releaseMsl, relKias), load: plan.load, windAt: planWindAt, groundAt: plan.loadGroundAt, deviationC: setup.tempDevC });
  if (!c) notes.push('The load would not land from this release: no release point to work out.');
  worked.aimOffFt = c ? c.x * r.x + c.y * r.y : 0;
  worked.carp = c ? { x: c.x, y: c.y, z: releaseMsl } : null;
  plan.fallSec = c ? c.fall.impact.t : 0;
  plan.offsetFt = setup.byHand.aimOffFt ?? worked.aimOffFt;
  // The release point on the line: the CARP, moved across to a hand-set aim-off, or slid along the line to a set distance.
  const cAlong = c ? c.x * u.x + c.y * u.y : 0;
  let R = { x: u.x * cAlong + r.x * plan.offsetFt, y: u.y * cAlong + r.y * plan.offsetFt, z: releaseMsl };
  const slideTo = (along) => {
    const k = (along - (R.x * u.x + R.y * u.y)) / Math.cos(theta);
    R = { x: R.x + d.x * k, y: R.y + d.y * k, z: R.z + d.z * k };
  };
  if (setup.release.mode === 'distance') slideTo(-setup.release.distFt);
  const dive = { thetaRad: theta, thetaDeg: setup.diveDeg, d, R, relKias };
  plan.dive = dive;
  plan.release = { along: R.x * u.x + R.y * u.y, point: R };
  const aimOff = () => {
    const k = (R.z - plan.groundFt) / Math.sin(theta);
    return { x: R.x + d.x * k, y: R.y + d.y * k, z: plan.groundFt };
  };
  dive.aimOff = aimOff();

  // The roll-in speed and height: worked out by flying the run-in and the dive from the IP (diveTrial), unless set by hand.
  const handFt = setup.byHand.rollInFt;
  const handKias = atRollIn ? setup.kias : setup.byHand.rollInKias;
  const vRel = tasFt(relKias, releaseMsl);
  const climbPerSec = vRel * Math.sin(theta);
  const heightFor = (kias) => {
    if (handFt !== null) return { msl: plan.groundFt + handFt, trial: diveTrial(plan, plan.groundFt + handFt, kias) };
    let msl = releaseMsl + climbPerSec * (STEADY.needSec + 8); // a first guess: 8 s to roll in (an estimate the trials correct)
    let trial = null;
    for (let k = 0; k < 6; k++) {
      trial = diveTrial(plan, msl, kias);
      if (trial.steadySec >= STEADY.needSec && trial.steadySec < STEADY.needSec + 1.5) break;
      msl = Math.max(releaseMsl + 200, msl + (STEADY.needSec + 1 - trial.steadySec) * climbPerSec);
    }
    return { msl, trial };
  };
  let kias = handKias ?? relKias - 50; // the first guess: the dive at idle adds about 50 kt (an estimate the trials correct)
  let best = heightFor(kias);
  if (handKias === null) {
    let prev = null;
    for (let k = 0; k < 5 && best.trial.release; k++) {
      const err = best.trial.release.kias - relKias;
      if (Math.abs(err) < 2) break;
      let next = kias - err;
      if (prev && prev.err !== err) next = kias - err * (kias - prev.kias) / (err - prev.err);
      prev = { kias, err };
      const top = Math.min(ac(plan).maxKias(best.msl), 316);
      next = clamp(next, MIN_ROLL_IN_KIAS, top);
      if (next === kias) break;
      kias = next;
      best = heightFor(kias);
    }
  }
  dive.rollInMsl = best.msl;
  dive.rollInKias = kias;
  dive.trial = best.trial;
  worked.rollInFt = best.msl - plan.groundFt;
  worked.rollInKias = kias;
  plan.runInMsl = best.msl;
  plan.runInKias = kias;
  dive.rollInAlong = rollInAlong(plan);

  const t = best.trial;
  if (!t.release) {
    notes.push(t.ground ? 'The dive hit the ground before the release point: the roll-in is too low or the dive too steep. A higher roll-in or a shallower dive would work.' : 'The dive never reached the release point.');
    return;
  }
  // Slide the release point along the dive line to hit at the speed the dive really arrives with (RS-5).
  if (c && setup.release.mode === 'carp' && setup.byHand.aimOffFt === null && t.steadySec >= STEADY.needSec) {
    const v = t.release.ground;
    const slid = carp({ target: { x: 0, y: 0 }, heightFt: R.z, ground: { vx: v.x, vy: v.y, vz: v.z }, load: plan.load, windAt: planWindAt, groundAt: plan.loadGroundAt, deviationC: setup.tempDevC, along: d, from: { x: R.x, y: R.y } });
    if (slid && Math.abs(slid.z - R.z) > 1) {
      R = { x: slid.x, y: slid.y, z: slid.z };
      dive.R = R;
      plan.release = { along: R.x * u.x + R.y * u.y, point: R };
      dive.aimOff = aimOff();
      plan.fallSec = slid.fall.impact.t;
      dive.rollInAlong = rollInAlong(plan);
    }
  }
  worked.releaseFt = R.z - plan.groundFt;
  if (Math.abs(R.z - releaseMsl) > 50) {
    notes.push(`Released at ${ftWords(R.z - plan.groundFt)} AGL, not ${ftWords(setup.releaseFt)}: the dive arrives at ${Math.round(t.release.kias)} KIAS, so the release point slid along the dive line to hit.`);
  }
  const fastBy = t.release.kias - relKias;
  if (handKias === null && Math.abs(fastBy) >= 10) {
    notes.push(fastBy > 0
      ? `${Math.round(relKias)} KIAS at release can't be made in a ${setup.diveDeg}° dive at idle from a roll-in at ${MIN_ROLL_IN_KIAS} KIAS or more: it arrives at ${Math.round(t.release.kias)} KIAS. A shallower dive or a higher speed at release would work.`
      : `${Math.round(relKias)} KIAS at release can't be made in a ${setup.diveDeg}° dive: it arrives at ${Math.round(t.release.kias)} KIAS. A steeper dive or a lower speed at release would work.`);
  }
  if (t.steadySec < STEADY.needSec) {
    notes.push(handFt !== null
      ? `A roll-in at ${ftWords(handFt)} AGL leaves the dive steady only ${t.steadySec.toFixed(1)} s before release (${STEADY.needSec} s wanted, an estimate). A higher roll-in or a shallower dive would work.`
      : `The dive is steady only ${t.steadySec.toFixed(1)} s before release (${STEADY.needSec} s wanted, an estimate).`);
  }
}

const ac = (plan) => plan.ac;
const ftWords = (n) => `${Math.round(n / 10) * 10 >= 1000 ? (Math.round(n / 10) * 10).toLocaleString('en-CA') : Math.round(n / 10) * 10} ft`;

/** Where the pilot starts the roll-in, feet along the run-in from the aim point: where the dive line meets the roll-in height, less his lead. */
function rollInAlong(plan) {
  const { R, d, thetaRad, rollInMsl, rollInKias } = plan.dive;
  const back = (rollInMsl - R.z) / Math.sin(thetaRad);
  const q = { x: R.x - d.x * back, y: R.y - d.y * back };
  const v = plan.tasFt(rollInKias, rollInMsl);
  const lead = v * PILOT.rollInLeadSec;
  return q.x * plan.u.x + q.y * plan.u.y - lead;
}

/** The run-in's start: established on the run-in line at the IP (or further back for a long dive), at its height and speed. */
function runInStart(plan, msl, kias, alongFt) {
  const vFtps = plan.tasFt(kias, msl);
  const w = windWords(plan.windAt(msl));
  const tri = windTriangle(plan.setup.trackDegT, vFtps / KT_TO_FTPS, w.fromDeg, w.kt);
  const s = pointMassState({
    x: plan.u.x * alongFt + plan.r.x * plan.offsetFt, y: plan.u.y * alongFt + plan.r.y * plan.offsetFt,
    altFt: msl, ktas: vFtps / KT_TO_FTPS, headingRad: compassDegToHeadingRad(tri.headingDeg),
  });
  return pilotAt(s, { aircraft: plan.ac, sigmaAt: plan.sigmaAt });
}

/** The run-in and the dive flown from the IP to the release: how long it was steady, and the release state. */
function diveTrial(plan, rollInMsl, rollInKias) {
  const saved = { rollInMsl: plan.dive.rollInMsl, rollInKias: plan.dive.rollInKias, rollInAlong: plan.dive.rollInAlong };
  Object.assign(plan.dive, { rollInMsl, rollInKias });
  plan.dive.rollInAlong = rollInAlong(plan);
  const start = Math.min(-plan.ipFt, plan.dive.rollInAlong - 2 * FT_PER_NM);
  const keep = { runInMsl: plan.runInMsl, runInKias: plan.runInKias };
  plan.runInMsl = rollInMsl;
  plan.runInKias = rollInKias;
  const f = fly(plan, { pilot: runInStart(plan, rollInMsl, rollInKias, start), phase: PHASE.RUN_IN, dt: PASS_STEP_SEC, stopAt: 'release' });
  Object.assign(plan, keep);
  Object.assign(plan.dive, saved);
  return { steadySec: f.steadySec, release: f.release, ground: f.ground };
}

/** The orbit's start: on the circle at the point past the target along the run-in, flying round it, at its height and speed. */
function orbitStart(plan) {
  const o = plan.orbit;
  const phi = Math.atan2(plan.u.y, plan.u.x);
  const x = o.centre.x + o.radiusFt * Math.cos(phi);
  const y = o.centre.y + o.radiusFt * Math.sin(phi);
  const tangent = phi + (o.ccw ? Math.PI / 2 : -Math.PI / 2);
  const vFtps = plan.tasFt(o.kias, o.msl);
  const w = windWords(plan.windAt(o.msl));
  const tri = windTriangle(compassDegFromVector(Math.cos(tangent), Math.sin(tangent)), vFtps / KT_TO_FTPS, w.fromDeg, w.kt);
  const s = pointMassState({ x, y, altFt: o.msl, ktas: vFtps / KT_TO_FTPS, headingRad: compassDegToHeadingRad(tri.headingDeg) });
  const bankDeg = o.mode === 'bank' ? o.dir * o.bankDeg : o.dir * radToDeg(Math.atan((vFtps * vFtps) / (G_FTPS2 * o.radiusFt)));
  return pilotAt(s, { aircraft: plan.ac, sigmaAt: plan.sigmaAt, bankDeg, g: 1 / Math.cos(degToRad(bankDeg)) });
}

/**
 * The holding pattern's or the figure 8's start (RS-11): at the IP on the inbound track (crabbed for the wind), at the
 * orbit's height and speed, banked into the pattern's first turn (or wings level when there is no pattern to fly).
 */
function patternStart(plan) {
  const o = plan.orbit;
  const V = o.tasFtps;
  const w = windWords(plan.windAt(o.msl));
  const first = o.path?.segs[0];
  // The figure 8 starts on its first leg (half the crossing angle off outbound, Dad's ask of 19 Oct 2026, or off inbound
  // when flown the old way, RS-30); the holding pattern on inbound.
  const trackDeg = first?.kind === 'line' ? compassDegFromVector(first.dir.x, first.dir.y) : plan.setup.trackDegT;
  const tri = windTriangle(trackDeg, V / KT_TO_FTPS, w.fromDeg, w.kt);
  const s = pointMassState({ x: plan.ip.x, y: plan.ip.y, altFt: o.msl, ktas: V / KT_TO_FTPS, headingRad: compassDegToHeadingRad(tri.headingDeg) });
  const bankDeg = first?.kind === 'arc' ? Math.sign(-first.sweep) * radToDeg(Math.atan((V * V) / (G_FTPS2 * first.r))) : 0;
  return pilotAt(s, { aircraft: plan.ac, sigmaAt: plan.sigmaAt, bankDeg, g: 1 / Math.cos(degToRad(bankDeg)) });
}

/** The flight-path angle (over the ground) that takes the aircraft to height zWant over about PILOT.heightTimeSec, within maxDeg. */
export function climbToward(s, wind, zWant, maxDeg) {
  const gh = Math.max(50, Math.hypot(s.vx + wind.x, s.vy + wind.y));
  const most = degToRad(maxDeg);
  return clamp(Math.atan((zWant - s.z) / (gh * PILOT.heightTimeSec)), -most, most);
}

/** The pilot's command for this step of a leg. */
function control(plan, p, phase, esc) {
  const s = p.s;
  const wind = plan.windAt(s.z);
  const env = { wind, sigmaAt: plan.sigmaAt };
  const gh = Math.hypot(s.vx + wind.x, s.vy + wind.y);
  const look = Math.max(500, gh * PILOT.lookaheadSec);
  const { u, r } = plan;
  const lineAim = () => {
    const along = s.x * u.x + s.y * u.y;
    return { x: u.x * (along + look) + r.x * plan.offsetFt, y: u.y * (along + look) + r.y * plan.offsetFt };
  };
  switch (phase) {
    case PHASE.ORBIT: {
      const o = plan.orbit;
      if (o.path) {
        // The holding pattern or the figure 8 (RS-11): the point `look` ahead on the path, as the run-in line and the circle.
        // From the last lap's start (prepFrom: the holding pattern's last outbound leg, the figure 8's exit) he goes to the
        // run-in's height and speed, so he is established at the IP.
        const prep = esc.pathS >= o.prepFrom;
        const climbCmdRad = climbToward(s, wind, prep ? plan.runInMsl : o.msl, PILOT.maxClimbDeg);
        const aim = pointOnPath(o.path, esc.pathS + look);
        // The figure 8's loops may be planned steeper than his usual most (RS-31): he may bank a margin past them.
        const most = o.pathBankDeg ? Math.max(PILOT.patternBankDeg, o.pathBankDeg + PATTERN.eightBankMarginDeg) : PILOT.patternBankDeg;
        const gMax = o.pathBankDeg ? Math.max(PILOT.manoeuvreG, 1 / Math.cos(degToRad(most))) : PILOT.manoeuvreG;
        return { lift: wantedLift(p, { ...env, climbCmdRad, aim, maxBankDeg: most }), kias: prep ? plan.runInKias : o.kias, gMax };
      }
      const climbCmdRad = climbToward(s, wind, o.msl, PILOT.maxClimbDeg);
      if (o.mode === 'bank') return { lift: wantedLift(p, { ...env, climbCmdRad, bankDeg: o.dir * o.bankDeg, maxBankDeg: 89 }), kias: o.kias, gMax: PILOT.manoeuvreG };
      const phi = Math.atan2(s.y - o.centre.y, s.x - o.centre.x) + (o.ccw ? 1 : -1) * Math.min(1, look / o.radiusFt);
      const aim = { x: o.centre.x + o.radiusFt * Math.cos(phi), y: o.centre.y + o.radiusFt * Math.sin(phi) };
      return { lift: wantedLift(p, { ...env, climbCmdRad, aim }), kias: o.kias, gMax: PILOT.manoeuvreG };
    }
    case PHASE.TO_IP:
    case PHASE.RUN_IN: {
      const climbCmdRad = climbToward(s, wind, plan.runInMsl, PILOT.maxClimbDeg);
      if (phase === PHASE.TO_IP && plan.cut) {
        // A live anthem press's cut (RS-26, V2.508): the turn at the cut bank, straight on the intercept, the roll-out.
        const c = plan.cut;
        if (esc.cut === 'straight') {
          const aim = { x: s.x + c.want.x * 3 * look, y: s.y + c.want.y * 3 * look };
          return { lift: wantedLift(p, { ...env, climbCmdRad, aim }), kias: plan.runInKias, gMax: PILOT.manoeuvreG };
        }
        const side = esc.cut === 'turn' ? c.side : esc.rollSide;
        return { lift: wantedLift(p, { ...env, climbCmdRad, bankDeg: side * c.bankDeg, maxBankDeg: 89 }), kias: plan.runInKias, gMax: PILOT.manoeuvreG };
      }
      const aim = phase === PHASE.TO_IP ? plan.ip : lineAim();
      return { lift: wantedLift(p, { ...env, climbCmdRad, aim }), kias: plan.runInKias, gMax: PILOT.manoeuvreG };
    }
    case PHASE.DIVE: {
      const { R, d } = plan.dive;
      const sAlong = (s.x - R.x) * d.x + (s.y - R.y) * d.y + (s.z - R.z) * d.z;
      const lookDive = Math.max(300, gh * PILOT.diveLookaheadSec);
      const c = { x: R.x + d.x * (sAlong + lookDive), y: R.y + d.y * (sAlong + lookDive), z: R.z + d.z * (sAlong + lookDive) };
      const climbCmdRad = Math.atan2(c.z - s.z, Math.hypot(c.x - s.x, c.y - s.y));
      const lift = wantedLift(p, { ...env, climbCmdRad, aim: c, vRange: [-PILOT.rollInG, PILOT.rollInG], leadSec: PILOT.diveLeadSec });
      return { lift, throttle: 0, idle: true, gMax: PILOT.rollInG }; // idle in the dive, with the idle prop's drag (an estimate of the technique)
    }
    case PHASE.RECOVER:
      return { g: plan.setup.escape.g, bankDeg: 0, throttle: 1 };
    case PHASE.TURN:
      return { g: plan.setup.escape.g, bankDeg: (plan.setup.escape.dir === 'left' ? -1 : 1) * plan.setup.escape.bankDeg, throttle: 1 };
    default: {
      const climbCmdRad = climbToward(s, wind, plan.groundFt + plan.setup.escape.heightFt, PILOT.escapeClimbDeg);
      return { lift: wantedLift(p, { ...env, climbCmdRad, bankDeg: 0 }), throttle: 1, gMax: PILOT.manoeuvreG };
    }
  }
}

/** A state part way (f, 0 to 1) from a to b, positions and velocities. */
function between(a, b, f) {
  return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), z: lerp(a.z, b.z, f), vx: lerp(a.vx, b.vx, f), vy: lerp(a.vy, b.vy, f), vz: lerp(a.vz, b.vz, f) };
}

/**
 * Flies the legs from `pilot` at time t0 in `phase`, at step dt. exitSec: when to leave the orbit. stopAt 'release': stop
 * at the release (or the flypast). record: keep every step.
 * Returns { events: { exit, ip, rollIn, release, safe }, release: { t, state, ground (velocity), kias, climbDeg } | null,
 * steadySec, ground (where it hit the ground) | null, stallHeld (seconds the stall line held the G short), timeline }.
 * @param {any} plan
 * @param {{ pilot: any, t0?: number, phase?: number, exitSec?: number, dt?: number, stopAt?: string | null, record?: boolean }} options
 */
export function fly(plan, { pilot, t0 = 0, phase = PHASE.ORBIT, exitSec = Infinity, dt = PASS_STEP_SEC, stopAt = null, record = false }) {
  const env = { aircraft: plan.ac, sigmaAt: plan.sigmaAt, windAt: plan.windAt };
  const { u } = plan;
  const run = plan.run;
  const dive = plan.dive;
  const events = {};
  const tl = record ? { t: [], x: [], y: [], z: [], vx: [], vy: [], vz: [], bank: [], g: [], kias: [], phase: [], pathS: [] } : null;
  let p = pilot;
  let t = t0;
  let ph = phase;
  let steadyFrom = null;
  let steadySec = 0;
  let release = null;
  let ground = null;
  let stallHeld = 0;
  const esc = { turned: 0, lastHdg: null, holdFrom: null, from: null, pathS: 0 };
  if (plan.cut) Object.assign(esc, { cut: plan.cut.turnRad > 0.02 ? 'turn' : 'straight', cutTurned: 0, cutLast: null, cutFail: null, joinFt: null });
  const track = plan.keepTrack ? [] : null; // a live press's trials: the track every 2 s to the release, to find a loop
  const path = plan.orbit?.path; // none while the plan is still being worked out (the dive's trials)
  const escMsl = plan.groundFt + plan.setup.escape.heightFt;
  const startEscape = () => {
    esc.from = t;
    esc.lastHdg = Math.atan2(p.s.vy, p.s.vx);
    const climb = airData(p.s, plan.sigmaAt).climbRad;
    if (climb < degToRad(-3)) return PHASE.RECOVER;
    return plan.setup.escape.dir === 'straight' || plan.setup.escape.turnDeg <= 0 ? PHASE.CLIMB : PHASE.TURN;
  };
  const push = (pp, kias) => {
    if (!tl) return;
    const s = pp.s;
    tl.t.push(t); tl.x.push(s.x); tl.y.push(s.y); tl.z.push(s.z); tl.vx.push(s.vx); tl.vy.push(s.vy); tl.vz.push(s.vz);
    tl.bank.push(pp.bankDeg); tl.g.push(pp.g); tl.kias.push(kias); tl.phase.push(ph);
    tl.pathS.push(esc.pathS); // how far along the pattern (RS-24: which lap a live anthem press falls in)
  };
  // The release's "along" measure: along the run-in (flat, flyover) or down the dive line (dive), 0 at the release.
  const relMeasure = (s) => {
    if (run === 'bombDive' && dive) return (s.x - dive.R.x) * dive.d.x + (s.y - dive.R.y) * dive.d.y + (s.z - dive.R.z) * dive.d.z;
    return s.x * u.x + s.y * u.y - plan.release.along;
  };
  const switchFt = (s) => Math.max(turnRadiusFromBankFt(Math.hypot(s.vx, s.vy), PILOT.manoeuvreBankDeg), 1500);

  push(p, airData(p.s, plan.sigmaAt).kias);
  while (t - t0 < MAX_PASS_SEC) {
    const s = p.s;
    // Leg changes at the start of the step.
    if (ph === PHASE.ORBIT && path) {
      // The pattern (RS-11): where he is along it, looked for just round where he was (the figure 8 crosses itself at the
      // IP); at its end, at the IP heading inbound (the figure 8's exit already on the run-in line), he carries on along
      // the run-in.
      const w = plan.windAt(s.z);
      const look = Math.max(500, Math.hypot(s.vx + w.x, s.vy + w.y) * PILOT.lookaheadSec);
      if (path.total > 0) esc.pathS = nearestOnPath(path, s, esc.pathS - 300, esc.pathS + 3 * look + 300);
      const pastIp = (s.x - plan.ip.x) * u.x + (s.y - plan.ip.y) * u.y >= 0;
      if (path.total <= 0 || (esc.pathS >= path.total - 3000 && pastIp)) {
        ph = PHASE.RUN_IN;
        events.exit = t;
        events.ip = t;
      }
    } else if (ph === PHASE.ORBIT && t >= exitSec - 1e-9) {
      ph = PHASE.TO_IP;
      events.exit = t;
    }
    if (track && !release && (!track.length || t - track[track.length - 1].t >= 2)) track.push({ t, x: s.x, y: s.y });
    if (ph === PHASE.TO_IP && plan.cut) {
      if (cutLegs(plan, s, esc)) {
        ph = PHASE.RUN_IN;
        events.ip = t;
      }
    } else if (ph === PHASE.TO_IP) {
      // At the IP (within a turn's radius of it, so the turn onto the run-in is led) he turns onto the run-in line.
      if (Math.hypot(plan.ip.x - s.x, plan.ip.y - s.y) < switchFt(s)) {
        ph = PHASE.RUN_IN;
        events.ip = t;
      }
    }
    if (ph === PHASE.RUN_IN && dive && s.x * u.x + s.y * u.y >= dive.rollInAlong) {
      ph = PHASE.DIVE;
      events.rollIn = t;
    }
    if (ph === PHASE.TURN) {
      const hdg = Math.atan2(s.vy, s.vx);
      esc.turned += Math.abs(wrapPi(hdg - esc.lastHdg));
      const rate = Math.abs(wrapPi(hdg - esc.lastHdg)) / dt;
      esc.lastHdg = hdg;
      const rollOut = Math.abs(p.bankDeg) / PILOT.roll.maxRateDps; // seconds to roll out
      if (radToDeg(esc.turned + rate * rollOut * 0.5) >= plan.setup.escape.turnDeg) ph = PHASE.CLIMB;
    }
    if (ph === PHASE.RECOVER && airData(s, plan.sigmaAt).climbRad >= 0) {
      ph = plan.setup.escape.dir === 'straight' || plan.setup.escape.turnDeg <= 0 ? PHASE.CLIMB : PHASE.TURN;
      esc.lastHdg = Math.atan2(s.vy, s.vx);
    }
    if (ph === PHASE.CLIMB) {
      const level = Math.abs(s.z - escMsl) < 50 && Math.abs(airData(s, plan.sigmaAt).climbRad) < degToRad(2);
      if (!level) esc.holdFrom = null;
      else if (esc.holdFrom === null) esc.holdFrom = t;
      if (level && t - esc.holdFrom >= ESCAPE_HOLD_SEC) {
        events.safe = t;
        break;
      }
    }
    if (ph >= PHASE.RECOVER && t - esc.from > ESCAPE_MAX_SEC) break;

    const cmd = control(plan, p, ph, esc);
    const step = pilotStep(p, cmd, env, dt);
    if (step.stallHeld) stallHeld += dt;
    const next = step.p;
    // The release (or the flypast) between this step and the next, found where the measure crosses zero.
    if (!release && (ph === PHASE.RUN_IN || ph === PHASE.DIVE)) {
      const m0 = relMeasure(s);
      const m1 = relMeasure(next.s);
      if (m0 < 0 && m1 >= 0) {
        const f = -m0 / (m1 - m0);
        const st = between(s, next.s, f);
        const w = plan.windAt(st.z);
        const air = airData({ ...st, up: s.up }, plan.sigmaAt);
        release = { t: t + f * dt, state: st, ground: { x: st.vx + w.x, y: st.vy + w.y, z: st.vz }, kias: air.kias, climbDeg: radToDeg(air.climbRad) };
        if (ph === PHASE.DIVE) steadySec = steadyFrom === null ? 0 : release.t - steadyFrom;
        events.release = release.t;
      }
    }
    if (ph === PHASE.DIVE && !release) {
      const w = plan.windAt(next.s.z);
      const gh = Math.hypot(next.s.vx + w.x, next.s.vy + w.y);
      const climbG = Math.atan2(next.s.vz, gh);
      const { R, d } = dive;
      const sAlong = (next.s.x - R.x) * d.x + (next.s.y - R.y) * d.y + (next.s.z - R.z) * d.z;
      const off = Math.hypot(next.s.x - (R.x + d.x * sAlong), next.s.y - (R.y + d.y * sAlong), next.s.z - (R.z + d.z * sAlong));
      const steady = Math.abs(radToDeg(climbG) + dive.thetaDeg) <= STEADY.climbDeg && off <= STEADY.offFt && Math.abs(next.bankDeg) <= STEADY.bankDeg;
      if (!steady) steadyFrom = null;
      else if (steadyFrom === null) steadyFrom = t + dt;
    }
    p = next;
    t += dt;
    push(p, step.kias);
    if (p.s.z <= plan.groundAt(p.s.x, p.s.y)) {
      ground = { t, x: p.s.x, y: p.s.y, z: p.s.z };
      break;
    }
    if (release && ph < PHASE.RECOVER) {
      if (stopAt === 'release') break;
      ph = startEscape();
    }
  }
  const cut = plan.cut ? { fail: esc.cutFail, joinFt: esc.joinFt } : null;
  return { events, release, steadySec, ground, stallHeld, timeline: tl, end: p, cut, track };
}

/**
 * A live anthem press's cut legs (RS-26, V2.508), the leg changes at the start of a step: the turn at the cut bank until
 * the ground track is on the intercept, straight on it until the roll-out onto the run-in line is due (led by the turn's
 * radius over the ground at the cut bank), and the roll-out until on the line's track. True when he is on the run-in.
 * Marks esc.cutFail when the cut crosses the line before rolling out on it.
 */
function cutLegs(plan, s, esc) {
  const c = plan.cut;
  const w = plan.windAt(s.z);
  const gx = s.vx + w.x, gy = s.vy + w.y;
  const gs = Math.hypot(gx, gy);
  const trk = Math.atan2(gy, gx);
  const off = (s.x * plan.r.x + s.y * plan.r.y - plan.offsetFt) * c.from; // + on the side it started, ft
  const rollOutSec = c.bankDeg / PILOT.roll.maxRateDps;
  const turnedBy = () => {
    if (esc.cutLast !== null) esc.cutTurned += Math.abs(wrapPi(trk - esc.cutLast));
    esc.cutLast = trk;
  };
  const rate = gs * Math.tan(degToRad(c.bankDeg)) * G_FTPS2 / Math.max(1, gs * gs); // rad/s at the cut bank, near enough
  if (esc.cut !== 'roll' && off <= 0 && !esc.cutFail) esc.cutFail = 'crossed the line before rolling out on it';
  if (esc.cut === 'turn') {
    turnedBy();
    if (esc.cutTurned + rate * rollOutSec * 0.5 >= c.turnRad) esc.cut = 'straight';
  }
  if (esc.cut === 'straight') {
    const left = Math.abs(wrapPi(trk - c.runTrk));
    const radius = (gs * gs) / (G_FTPS2 * Math.tan(degToRad(c.bankDeg)));
    if (off <= radius * (1 - Math.cos(left)) + gs * rollOutSec * Math.sin(left) * 0.5) {
      esc.cut = 'roll';
      esc.cutTurned = 0;
      esc.cutLast = null;
      esc.rollRad = left;
      esc.rollSide = Math.sign(wrapPi(trk - c.runTrk)) || 1; // + right (the track left of the line's): turn right onto it
    }
  }
  if (esc.cut === 'roll') {
    turnedBy();
    if (esc.cutTurned + rate * rollOutSec * 0.5 >= esc.rollRad) {
      esc.joinFt = -(s.x * plan.u.x + s.y * plan.u.y);
      return true;
    }
  }
  return false;
}

/**
 * The orbit exit that makes the time over target (RS-8). Flies the orbit once, then the rest of the pass from candidate
 * exits through it, and picks the first whose arrival crosses the planned time; a ground circle repeats each lap, so one
 * lap's candidates serve every lap. Returns { sec, arrivalSec, lateSec, soonestSec }.
 */
export function solveExit(plan) {
  const tot = plan.setup.totSec;
  const fallSec = plan.run === 'flyover' ? 0 : plan.fallSec;
  const arrivalFrom = (pilot, te) => {
    const f = fly(plan, { pilot, t0: te, phase: PHASE.TO_IP, exitSec: te, dt: SOLVE_STEP_SEC, stopAt: 'release' });
    return f.release ? f.release.t + fallSec : Infinity;
  };
  if (plan.setup.byHand.exitSec !== null) return { sec: plan.setup.byHand.exitSec, byHand: true };
  // The orbit flown for one lap (a ground circle) or up to the time over target (a steady bank drifts with the wind).
  const o = plan.orbit;
  const lapSec = (2 * Math.PI * o.radiusFt) / plan.tasFt(o.kias, o.msl);
  const periodic = o.mode === 'radius';
  const span = periodic ? lapSec : Math.max(lapSec, tot);
  const n = periodic ? 16 : clamp(Math.ceil(span / 15), 12, 48);
  const step = span / n;
  const states = [];
  let p = orbitStart(plan);
  let t = 0;
  const env = { aircraft: plan.ac, sigmaAt: plan.sigmaAt, windAt: plan.windAt };
  for (let i = 0; i <= n; i++) {
    states.push({ t, p });
    const until = (i + 1) * step;
    while (t < until - 1e-9) {
      const dt = Math.min(SOLVE_STEP_SEC, until - t);
      p = pilotStep(p, control(plan, p, PHASE.ORBIT, {}), env, dt).p;
      t += dt;
    }
  }
  const legs = states.map((st) => arrivalFrom(st.p, st.t) - st.t); // the time from each exit to the time over target
  const candidates = [];
  const laps = periodic ? Math.max(1, Math.ceil(tot / lapSec) + 1) : 1;
  for (let k = 0; k < laps; k++) {
    for (let i = 0; i < n; i++) candidates.push({ te: states[i].t + k * lapSec, leg: legs[i], legNext: legs[i + 1], teNext: states[i + 1].t + k * lapSec });
  }
  let soonest = null;
  // A live anthem press (RS-24): no exit before the press, so the orbit already flown stays as it was.
  const minExit = plan.minExitSec ?? -Infinity;
  for (let i = candidates.length - 1; i >= 0; i--) if (candidates[i].te < minExit) candidates.splice(i, 1);
  for (const c of candidates) {
    if (!Number.isFinite(c.leg)) continue;
    if (!soonest || c.te + c.leg < soonest.te + soonest.leg) soonest = c;
    if (c.te > tot) break;
  }
  const soonestSec = soonest ? soonest.te + soonest.leg : null;
  // The first exit whose arrival crosses the time over target, read between two candidates (where the turn onto the run-in
  // changes side the arrival jumps; the flights in flyPass then close in on the nearest).
  for (const c of candidates) {
    if (!Number.isFinite(c.leg) || !Number.isFinite(c.legNext)) continue;
    const a0 = c.te + c.leg;
    const a1 = c.teNext + c.legNext;
    if (a0 <= tot && a1 >= tot) {
      const f = a1 > a0 ? (tot - a0) / (a1 - a0) : 0;
      return { sec: c.te + f * (c.teNext - c.te), arrivalSec: tot, lateSec: 0, soonestSec, slope: (a1 - a0) / (c.teNext - c.te) };
    }
  }
  if (!soonest) return { sec: 0, arrivalSec: Infinity, lateSec: Infinity, soonestSec: null, slope: 1 };
  if (soonestSec > tot) return { sec: soonest.te, arrivalSec: soonestSec, lateSec: soonestSec - tot, soonestSec, slope: 1 };
  // No clean crossing: the nearest arrival.
  let near = soonest;
  for (const c of candidates) if (Number.isFinite(c.leg) && Math.abs(c.te + c.leg - tot) < Math.abs(near.te + near.leg - tot)) near = c;
  return { sec: near.te, arrivalSec: near.te + near.leg, lateSec: 0, soonestSec, slope: 1 };
}

/**
 * The pattern's times over the ground (RS-11) at the orbit's true airspeed in the wind at its height: K, the seconds per
 * foot of radius of a full turn (∫ dθ ÷ ground speed, the same either way round, and the same for a holding pattern's
 * two half turns together), and perLegFt, the seconds per foot of the holding legs (one out, one in). The figure 8's
 * loop (an infinity sign since V2.508, flown crossing the IP outbound by default since Dad's ask of 19 Oct 2026, or
 * inbound, RS-30) scales with its radius too: its turn misses the tracks within half the crossing angle of the way its
 * legs head, and its two legs, each tan(half) of the radius, are flown at half the crossing angle either side of that,
 * so its K is the turn's part plus the legs'. exitK(dir): the outbound figure 8's exit's seconds per foot of its radius
 * after a last loop turning dir (ground-path.js eightExitSizes: the straight on along the last crossing leg, the turn
 * inbound the same way, the straight in to the IP).
 */
function patternTimes(plan) {
  const o = plan.orbit;
  const w = plan.windAt(o.msl);
  const gs = (x, y) => Math.max(1, speedAlong({ x, y, z: 0 }, w, o.tasFtps));
  const N = 180;
  const eight = o.pattern === 'eight';
  const half = degToRad(PATTERN.eightCrossDeg / 2);
  const inbound = Math.atan2(plan.u.y, plan.u.x);
  const outbound = inbound + Math.PI;
  const legs = o.flow === 'inbound' ? inbound : outbound; // the way the figure 8's legs head (RS-30)
  let K = 0;
  for (let i = 0; i < N; i++) {
    const th = ((i + 0.5) / N) * TAU;
    if (eight && Math.abs(wrapPi(th - legs)) < half) continue;
    K += TAU / N / gs(Math.cos(th), Math.sin(th));
  }
  if (eight) for (const k of [1, -1]) K += Math.tan(half) / gs(Math.cos(legs + k * half), Math.sin(legs + k * half));
  const exitK = (dir) => {
    // After a left-turning last loop (dir −1) the last crossing leg is half the crossing angle clockwise of outbound,
    // and the turn inbound goes on anticlockwise (the track's angle rising); a right one, the mirror.
    const { outFt, sweepRad, inFt } = eightExitSizes(1, PATTERN.eightCrossDeg);
    const h = outbound + dir * half;
    let t = outFt / gs(Math.cos(h), Math.sin(h)) + inFt / gs(plan.u.x, plan.u.y);
    for (let i = 0; i < N; i++) {
      const th = h - dir * ((i + 0.5) / N) * sweepRad;
      t += sweepRad / N / gs(Math.cos(th), Math.sin(th));
    }
    return t;
  };
  return { K, perLegFt: 1 / gs(-plan.u.x, -plan.u.y) + 1 / gs(plan.u.x, plan.u.y), exitK };
}

/** The radius of a turn at bankDeg at the orbit's true airspeed, ft. */
const radiusAtBank = (plan, bankDeg) => turnRadiusFromBankFt(plan.orbit.tasFtps, bankDeg);

/**
 * How the pattern makes the time over target (RS-8, RS-9, RS-11): k standard laps, then a last one whose outbound leg
 * (feet) is `param` (the figure 8 since RS-31: solveEight). The time from the IP on is the run-in flown from
 * the IP, established at its height and speed, to the release (and the load's fall). When even the shortest last lap is
 * too long, the nearer of leaving at once (param null: no pattern, the run-in starts at the IP) and the shortest lap.
 * Returns { k, param, range, slope (s per foot of param), byHand }.
 */
export function solvePattern(plan) {
  const o = plan.orbit;
  const setup = plan.setup;
  const hold = o.pattern === 'hold';
  const { K, perLegFt, exitK } = patternTimes(plan);
  const timeOf = (param) => o.radiusFt * K + param * perLegFt; // the holding pattern's lap (the figure 8: solveEight)
  const nominal = hold ? o.legFt : o.radiusFt;
  const lapSec = hold ? timeOf(nominal) : nominal * K; // one standard lap or loop
  const range = hold ? [o.tasFtps * PATTERN.holdMinLegSec, Infinity] : eightRange(plan);
  const slope = hold ? perLegFt : K;
  if (setup.byHand.exitSec !== null) {
    // Left by hand: standard laps, leaving at the IP at the first pass at or after the time set.
    return { k: Math.max(0, Math.ceil((setup.byHand.exitSec - 0.5) / lapSec)), param: null, standard: true, range, slope, byHand: true };
  }
  const start = runInStart(plan, plan.runInMsl, plan.runInKias, -plan.ipFt);
  const f = fly(plan, { pilot: start, phase: PHASE.RUN_IN, dt: SOLVE_STEP_SEC, stopAt: 'release' });
  if (!f.release) return hold ? { k: 0, param: nominal, range, slope } : { k: 1, kept: plan.keptLoops ?? [], m: 1, param: nominal, range, slope };
  const fromIp = f.release.t + (plan.run === 'flyover' ? 0 : plan.fallSec);
  const need = setup.totSec - fromIp; // the time to be at the IP
  if (!hold) return solveEight(plan, { K, exitK, need, range });
  const tMin = timeOf(range[0]);
  // A live anthem press (RS-24): at least plan.minLaps standard laps (those already begun stay as flown); too little time
  // for them, the shortest last lap after them (it arrives as soon as it can, and the card says how late).
  // A live press may also need the lap at minLaps to keep at least plan.minParamFt of outbound leg (the part already
  // flown, and the look ahead), and no more laps than plan.maxLaps (when the lap it is in could not become a standard one).
  const minK = plan.minLaps ?? 0;
  const maxK = plan.maxLaps ?? Infinity;
  const lo = (k) => (k === minK && plan.minParamFt ? Math.max(range[0], plan.minParamFt) : range[0]);
  const live = Boolean(plan.live); // a live press: the aircraft is already in the pattern, so "leave at once" is not an option
  if (need < tMin && !live) return need < tMin - need ? { k: 0, param: null, range, slope } : { k: 0, param: range[0], range, slope };
  let k = Math.min(maxK, Math.max(0, Math.floor((need - tMin) / lapSec)));
  if (k < minK) return { k: minK, param: lo(minK), range: [lo(minK), range[1]], slope };
  const rest = need - k * lapSec;
  const r = [lo(k), range[1]];
  return { k, param: clamp((rest - o.radiusFt * K) / perLegFt, r[0], r[1]), range: r, slope };
}

/**
 * The figure 8's loop radii, ft (RS-31): [tightest, widest] at the orbit's true airspeed, from the steepest level turn
 * the set holds there (steepestLevelBankDeg; the set bank when it can't hold one) to PATTERN.eightMinBankDeg; and
 * exitMinFt, the tightest the outbound exit is flown, the steepest level turn at the run-in speed it speeds up to.
 */
function eightRange(plan) {
  const o = plan.orbit;
  const steep = Math.max(o.bankDeg, steepestLevelBankDeg(plan, o.kias, o.msl) ?? o.bankDeg);
  const fast = Math.max(o.kias, plan.runInKias);
  const exitSteep = Math.max(o.bankDeg, steepestLevelBankDeg(plan, fast, o.msl) ?? o.bankDeg);
  const range = [radiusAtBank(plan, steep), radiusAtBank(plan, PATTERN.eightMinBankDeg)];
  range.exitMinFt = turnRadiusFromBankFt(plan.tasFt(fast, o.msl), exitSteep);
  return range;
}

/**
 * How the figure 8 makes the time over target (RS-31; Dad, 19 Oct 2026: "the science isnt working on this...can the
 * aircraft G it up more as necessary to make the window"): the loops already begun (a live press's plan.keptLoops, their
 * radii as flown) stay; the m loops after them are all flown at one radius R, and the outbound exit at R too (never
 * tighter than range.exitMinFt), so the time from the start to the IP is the kept loops' plus m × K × R plus the exit's.
 * For each m (at least one loop; none needed after kept loops when the outbound exit can still change) R is worked out
 * to fit, and the m whose R comes nearest the set radius (the set bank) is taken, inside range. When even the tightest
 * single loop is too long, the nearer of leaving at once (not on a live press) and the tightest. Returns
 * { k (all loops), kept, m, param (R), range, slope (s per foot of R) }.
 */
function solveEight(plan, { K, exitK, need, range }) {
  const o = plan.orbit;
  const outbound = o.flow !== 'inbound';
  const kept = plan.keptLoops ?? [];
  const keptSec = kept.reduce((sum, r) => sum + r * K, 0);
  const dirOf = (i) => (i % 2 === 0 ? o.dir : -o.dir);
  const exitSec = (m, R) => (outbound ? Math.max(R, range.exitMinFt) * exitK(dirOf(kept.length + m - 1)) : 0);
  const timeOf = (m, R) => keptSec + m * K * R + exitSec(m, R);
  const radiusFor = (m) => {
    // timeOf rises with R: the R that fits, by halving inside range (null when it can't).
    if (need < timeOf(m, range[0]) || need > timeOf(m, range[1])) return null;
    let a = range[0], b = range[1];
    for (let k = 0; k < 40; k++) {
      const c = (a + b) / 2;
      if (timeOf(m, c) < need) a = c;
      else b = c;
    }
    return (a + b) / 2;
  };
  const mMin = outbound && kept.length > 0 ? 0 : 1;
  const slopeOf = (m, R) => m * K + (outbound && R >= range.exitMinFt ? exitK(dirOf(kept.length + m - 1)) : 0);
  let best = null;
  for (let m = mMin; m <= PATTERN.eightMaxLoops; m++) {
    const R = radiusFor(m);
    if (R === null) {
      if (need < timeOf(m, range[0])) break; // more loops only take longer
      continue;
    }
    const off = Math.abs(Math.log(R / o.radiusFt));
    if (!best || off < best.off) best = { m, R, off };
  }
  const out = (m, R) => ({ k: kept.length + m, kept, m, param: R, range, slope: Math.max(slopeOf(m, R), K / 4) });
  if (best) return out(best.m, best.R);
  const tMin = timeOf(mMin, range[0]);
  if (need < tMin) {
    if (!plan.live && mMin > 0 && need < tMin - need) return { k: 0, kept, m: 0, param: null, range, slope: K };
    return out(mMin, range[0]); // late even at the tightest: the card says how late
  }
  return out(PATTERN.eightMaxLoops, range[1]); // a very long wait: the widest loops, early (the card says so)
}

/**
 * The pattern's whole path (RS-11): k standard laps, then the last one (param: its outbound leg or radius, ft; null with
 * `standard` false: no pattern at all), and for the figure 8 its exit at the set radius (Dad's ask of 19 Oct 2026).
 * prepFrom: how far along it the run-in preparation starts (the last outbound leg, or the figure 8's exit).
 */
function patternPath(plan, k, param, standard = false, sol = null) {
  const o = plan.orbit;
  const base = { ip: plan.ip, u: plan.u };
  if (param === null && !standard) return { path: makePath([]), prepFrom: 0, loopRadii: [] };
  if (o.pattern === 'eight') return eightPath(plan, standard ? new Array(k).fill(o.radiusFt) : [...sol.kept, ...new Array(sol.m).fill(param)], standard ? o.radiusFt : param, sol?.range?.exitMinFt ?? 0);
  const segs = [];
  const lapOf = (i, size) => holdLap({ ...base, dir: o.dir, r: o.radiusFt, legFt: size });
  const nominal = o.legFt;
  const n = standard ? k - 1 : k;
  for (let i = 0; i < n; i++) segs.push(...lapOf(i, nominal));
  const before = makePath(segs).total;
  if (n >= 0) segs.push(...lapOf(Math.max(n, 0), standard ? nominal : param));
  return { path: makePath(segs), prepFrom: before + Math.PI * o.radiusFt };
}

/**
 * The figure 8's whole path from its loops' radii (RS-11, RS-30, RS-31): the loops in turn, the first turning o.dir; then,
 * flown outbound, its exit turning the way the last loop did at exitFt (never tighter than exitMinFt). prepFrom: where the
 * run-in preparation starts (the exit; flown inbound, the last loop). Empty radii: no pattern at all.
 */
function eightPath(plan, radii, exitFt, exitMinFt) {
  const o = plan.orbit;
  const base = { ip: plan.ip, u: plan.u, crossDeg: PATTERN.eightCrossDeg };
  const outbound = o.flow !== 'inbound';
  const segs = [];
  let lastStart = 0;
  radii.forEach((r, i) => {
    lastStart = makePath(segs).total;
    segs.push(...eightLoop({ ...base, dir: i % 2 === 0 ? o.dir : -o.dir, r, outbound }));
  });
  const loopsFt = makePath(segs).total;
  if (radii.length && outbound) segs.push(...eightExit({ ...base, dir: (radii.length - 1) % 2 === 0 ? o.dir : -o.dir, r: Math.max(exitFt, exitMinFt) }));
  // The steepest bank planned (the loops at the orbit's speed, the exit at the faster of it and the run-in's), for the
  // pilot's most bank holding it (RS-31).
  const bankAt = (v, r) => radToDeg(Math.atan((v * v) / (G_FTPS2 * r)));
  const vFast = plan.tasFt(Math.max(o.kias, plan.runInKias), o.msl);
  const exitR = radii.length && outbound ? Math.max(exitFt, exitMinFt) : null;
  const pathBankDeg = Math.max(0, ...radii.map((r) => bankAt(o.tasFtps, r)), exitR ? bankAt(vFast, exitR) : 0);
  return { path: makePath(segs), prepFrom: outbound ? loopsFt : lastStart, loopRadii: radii, exitFt: exitR, pathBankDeg };
}

/**
 * The holding pattern or the figure 8 flown (RS-11): the path from solvePattern, then flown and its last lap nudged
 * (four times at most) so the flight's own arrival meets the time over target, a secant step on the time each foot of the
 * last leg or radius gives. The nearest try is kept. Returns { exit, flight, fall }.
 */
function flyPattern(plan) {
  const o = plan.orbit;
  const tot = plan.setup.totSec;
  const sol = solvePattern(plan);
  let param = sol.param;
  let best = null;
  let last = null;
  for (let n = 0; n < 5; n++) {
    Object.assign(o, patternPath(plan, sol.k, param, sol.standard, sol));
    const flight = fly(plan, { pilot: patternStart(plan), record: true });
    const fall = flight.release && plan.load ? dropFrom(plan, flight.release) : null;
    const arrival = arrivalOf(plan, flight, fall);
    const err = arrival === null ? Infinity : tot - arrival; // + early: more time wanted
    if (!best || Math.abs(err) < Math.abs(best.err)) best = { flight, fall, param, err, path: o.path, prepFrom: o.prepFrom, loopRadii: o.loopRadii, exitFt: o.exitFt, pathBankDeg: o.pathBankDeg };
    if (sol.byHand || param === null || !Number.isFinite(err) || Math.abs(err) < 0.5) break;
    let slope = sol.slope;
    if (last && Math.abs(param - last.param) > 1) slope = clamp((last.err - err) / (param - last.param), sol.slope / 3, sol.slope * 3);
    last = { param, err };
    const next = clamp(param + err / slope, sol.range[0], sol.range[1]);
    if (Math.abs(next - param) < 1) break;
    param = next;
  }
  o.path = best.path;
  o.prepFrom = best.prepFrom;
  o.loopRadii = best.loopRadii;
  o.exitFt = best.exitFt;
  o.pathBankDeg = best.pathBankDeg;
  const ev = best.flight.events;
  const exit = { sec: ev.exit ?? 0, byHand: Boolean(sol.byHand), pattern: { k: sol.k, none: o.path.total <= 0 } };
  const size = best.param ?? (o.pattern === 'hold' ? o.legFt : o.radiusFt);
  if (o.pattern === 'hold') exit.pattern.legSec = size / o.tasFtps;
  else {
    // The figure 8 (RS-31): its loops' bank (those worked out, at the orbit's speed) and how many loops in all.
    exit.pattern.bankDeg = radToDeg(Math.atan((o.tasFtps * o.tasFtps) / (G_FTPS2 * size)));
    exit.pattern.loops = o.loopRadii?.length ?? 0;
  }
  if (!sol.byHand && Number.isFinite(best.err) && Math.abs(best.err) >= 2) {
    const words = o.pattern === 'hold' ? 'the shortest last outbound leg' : 'the tightest loops the aircraft can hold level';
    exit.note = best.err < 0
      ? `The time over target can't be made from the ${o.pattern === 'hold' ? 'holding pattern' : 'figure 8'}: ${exit.pattern.none ? 'leaving at once' : words} arrives ${Math.round(-best.err)} s late. A later time over target would work.`
      : `The time over target can't be made from the ${o.pattern === 'hold' ? 'holding pattern' : 'figure 8'}: ${exit.pattern.none ? `leaving at once arrives ${Math.round(best.err)} s early, and even ${words} takes longer than that` : `it arrives ${Math.round(best.err)} s early`}. A later time over target would work.`;
  }
  return { exit, flight: best.flight, fall: best.fall };
}

/** The miss (or the flypast) and the time over target from a flight; the time over target is the flypast for a flyover, the load's impact for a drop. */
function arrivalOf(plan, flight, fall) {
  if (plan.run === 'flyover') return flight.release ? flight.release.t : null;
  return flight.release && fall?.landed ? flight.release.t + fall.impact.t : null;
}

/**
 * The whole pass: the plan, the orbit exit, the flight (stored at PASS_STEP_SEC), the load's fall and the result.
 * Returns { plan, exit, flight, fall, result, computeMs }.
 */
export function flyPass(setup, world, { minLaps = 0, maxLaps = null, minParamFt = null, minExitSec = null, live = false, keptLoops = null } = {}) {
  const started = globalThis.performance?.now?.() ?? Date.now();
  const plan = buildPlan(setup, world);
  if (minLaps > 0) plan.minLaps = minLaps; // RS-24: a live anthem press keeps the laps already begun
  if (maxLaps !== null) plan.maxLaps = maxLaps;
  if (minParamFt !== null) plan.minParamFt = minParamFt;
  if (live) plan.live = true;
  if (keptLoops) plan.keptLoops = keptLoops; // RS-31: a live press keeps the figure 8's loops already begun, as flown
  if (minExitSec !== null) plan.minExitSec = minExitSec;
  if (plan.orbit.lap) {
    const { exit, flight, fall } = flyPattern(plan);
    const result = resultOf(plan, exit, flight, fall);
    return { plan, exit, flight, fall, result, computeMs: (globalThis.performance?.now?.() ?? Date.now()) - started };
  }
  const exit = solveExit(plan);
  // The stored flight, its exit nudged (four times at most) so its own arrival meets the time over target: a secant step
  // on the slope the candidates or the flights gave, kept inside the bracket of an early and a late try (halved when it
  // would leave it, as where the turn onto the run-in changes and the arrival jumps). The nearest try is kept.
  let best = null;
  let last = null;
  let early = null; // { sec, err } of a try that arrived early (err > 0)
  let late = null;
  let sec = exit.sec;
  for (let k = 0; k < 5; k++) {
    const flight = fly(plan, { pilot: orbitStart(plan), exitSec: sec, record: true });
    const fall = flight.release && plan.load ? dropFrom(plan, flight.release) : null;
    const arrival = arrivalOf(plan, flight, fall);
    const err = arrival === null ? Infinity : setup.totSec - arrival;
    if (!best || Math.abs(err) < Math.abs(best.err)) best = { flight, fall, sec, err };
    if (exit.byHand || exit.lateSec > 0 || !Number.isFinite(err) || Math.abs(err) < 0.5) break;
    if (err > 0) early = { sec, err };
    else late = { sec, err };
    let slope = exit.slope ?? 1;
    if (last && sec !== last.sec) slope = (last.err - err) / (sec - last.sec);
    last = { sec, err };
    let next = sec + err / clamp(slope, 0.3, 5);
    if (early && late) {
      const [lo, hi] = early.sec < late.sec ? [early.sec, late.sec] : [late.sec, early.sec];
      if (hi - lo < 0.05) break;
      if (!(next > lo && next < hi)) next = (lo + hi) / 2;
    }
    if (next < 0) break;
    if (minExitSec !== null) next = Math.max(next, minExitSec);
    if (next === sec) break;
    sec = next;
  }
  const { flight, fall } = best;
  exit.sec = best.sec;
  const result = resultOf(plan, exit, flight, fall);
  const computeMs = (globalThis.performance?.now?.() ?? Date.now()) - started;
  return { plan, exit, flight, fall, result, computeMs };
}

/**
 * A live "Anthem starts" press (RS-24): the pass worked out again so its time over target is setup.totSec (the anthem's
 * last note), with the past unchanged. The pattern's laps begun by pressSec stay as flown (the solver may only change a
 * lap not yet begun: flyPass's minLaps; one more when the pilot's look ahead already sees the next lap), or on the
 * circle the orbit before the press (minExitSec); the stored flight up to the press is kept exactly (any difference
 * from the new working-out there is spliced out and its size kept in `splicedFt`). Already on its way in (out of the
 * orbit, or in its last lap): nothing is left to change, so the same flight is timed against the new time over target.
 * Returns a pass in flyPass's shape.
 */
export function flyPassFrom(prev, setup, world, pressSec) {
  const tl = prev.flight.timeline;
  const dt = tl.t[1] - tl.t[0] || PASS_STEP_SEC;
  const i = clamp(Math.round(pressSec / dt), 0, tl.t.length - 1);
  const o = prev.plan.orbit;
  const committed = (why) => {
    const plan = { ...prev.plan, setup: { ...prev.plan.setup, totSec: setup.totSec }, notes: [...prev.plan.notes, why] };
    return { ...prev, plan, result: resultOf(plan, prev.exit, prev.flight, prev.fall), committed: true, splicedFt: 0 };
  };
  if (tl.phase[i] !== PHASE.ORBIT) return committed('Already on its way in when the anthem started: nothing left in the orbit to change.');
  let options;
  if (o.lap) {
    const s = tl.pathS[i] ?? 0;
    const w = prev.plan.windAt(tl.z[i]);
    const look = Math.max(500, Math.hypot(tl.vx[i] + w.x, tl.vy[i] + w.y) * PILOT.lookaheadSec);
    const margin = 3 * look + 300; // his look ahead and its search window
    if (o.pattern === 'hold') {
      const stdFt = makePath(holdLap({ ip: prev.plan.ip, u: prev.plan.u, dir: o.dir, r: o.radiusFt, legFt: o.legFt })).total;
      const kOld = prev.exit.pattern?.k ?? 0;
      const j = Math.min(Math.floor(s / stdFt), kOld); // the lap it is in (lap kOld is the last, adjusted one)
      // The lap it is in can still be the adjusted last one while its outbound leg ends ahead of where he is looking: the
      // turn before that leg is the same whatever its length. Becoming a standard lap instead keeps the past only if the
      // standard leg still reaches past that point too.
      const minLegFt = Math.max(0, s - j * stdFt + margin - Math.PI * o.radiusFt);
      const legNow = j < kOld ? o.legFt : (prev.exit.pattern?.legSec ?? 0) * o.tasFtps;
      if (minLegFt < legNow) {
        options = { minLaps: j, minParamFt: minLegFt, maxLaps: minLegFt <= o.legFt ? null : j };
      } else if (j < kOld) {
        options = { minLaps: j + 1 };
      } else {
        return committed('Already past the end of its last outbound leg when the anthem started: nothing left in the pattern to change.');
      }
    } else {
      // The figure 8 (RS-31): the loops begun by the press (and the next, when his look ahead already sees it) stay as
      // flown; the rest, and the outbound exit, are worked out again.
      const radii = o.loopRadii ?? [];
      const ends = [];
      let at = 0;
      for (const [n, r] of radii.entries()) {
        at += makePath(eightLoop({ ip: prev.plan.ip, u: prev.plan.u, dir: n % 2 === 0 ? o.dir : -o.dir, r, crossDeg: PATTERN.eightCrossDeg, outbound: o.flow !== 'inbound' })).total;
        ends.push(at);
      }
      let j = ends.findIndex((e) => e > s); // the loop it is in
      if (j < 0) return committed('Already in its turn inbound when the anthem started: nothing left in the pattern to change.');
      if (ends[j] - s < margin) j += 1;
      const keep = j + 1;
      const room = o.flow !== 'inbound' ? radii.length : radii.length - 1; // the outbound exit can still change
      if (keep > room || (keep === radii.length && at - s < margin)) return committed('Already in its last loop or its turn inbound when the anthem started: nothing left in the pattern to change.');
      options = { keptLoops: radii.slice(0, keep) };
    }
  } else {
    options = { minExitSec: pressSec + dt };
  }
  const next = flyPass(setup, world, { ...options, live: true });
  const nt = next.flight.timeline;
  let splicedFt = 0;
  for (let k = 0; k <= i && k < nt.t.length; k++) splicedFt = Math.max(splicedFt, Math.hypot(nt.x[k] - tl.x[k], nt.y[k] - tl.y[k], nt.z[k] - tl.z[k]));
  for (const key of Object.keys(nt)) if (Array.isArray(tl[key])) nt[key] = tl[key].slice(0, i + 1).concat(nt[key].slice(i + 1));
  return { ...next, committed: false, splicedFt };
}

/**
 * The live anthem press's run-in speeds (RS-27), ESTIMATES: the slowest is the stick shaker plus slowMarginKt; the fastest
 * what the aircraft's set holds level at full power at the run-in height, never past VMO less vmoMarginKt.
 */
export const ANTHEM_SPEED = Object.freeze({ slowMarginKt: 60, vmoMarginKt: 10 });
/**
 * The live press's cut (RS-26, V2.508), ESTIMATES: turned at once at bankDeg (harder than the orbit's 30°; 2 G level,
 * inside the CT-156's limit and above the stall line at the run-in speeds) onto an intercept of the run-in line at one of
 * interceptDeg, the IP skipped, rolled out on the line at the same bank no closer than minRunInNm of straight run-in; a
 * choice whose crossing passes more than maxAbeamFt from the aim point (inside the stadium bowl's 400 ft half-length, so
 * it still flies over it) is not taken.
 */
export const ANTHEM_CUT = Object.freeze({ minRunInNm: 2, maxAbeamFt: 300, bankDeg: 60, interceptDeg: Object.freeze([30, 45, 60, 90]) });

/** The run-in speeds a live press may set, [slowest, fastest] KIAS (RS-27; ANTHEM_SPEED). */
export function anthemSpeedRange(plan) {
  const ac = plan.ac;
  const z = plan.runInMsl;
  const lo = ac.shakerKias + ANTHEM_SPEED.slowMarginKt;
  let a = lo;
  let b = ac.maxKias(z) - ANTHEM_SPEED.vmoMarginKt;
  // The fastest level at full power: where the set's full-power excess at 1 G crosses zero (the set's own numbers).
  const excess = (kias) => ac.excessFn(1)(plan.tasFt(kias, z) / KT_TO_FTPS, z, 1);
  if (excess(b) >= 0) return [lo, b];
  for (let k = 0; k < 30; k++) {
    const m = (a + b) / 2;
    if (excess(m) >= 0) a = m;
    else b = m;
  }
  return [lo, Math.max(lo, a)];
}

/** The pilot as he was at timeline step i (his place, velocity, bank and G; the throttle trimmed), to fly on from there. */
function pilotFromTimeline(plan, tl, i) {
  const v = Math.hypot(tl.vx[i], tl.vy[i], tl.vz[i]);
  const s = pointMassState({ x: tl.x[i], y: tl.y[i], altFt: tl.z[i], ktas: v / KT_TO_FTPS, headingRad: Math.atan2(tl.vy[i], tl.vx[i]), climbRad: Math.asin(clamp(tl.vz[i] / v, -1, 1)) });
  return pilotAt(s, { aircraft: plan.ac, sigmaAt: plan.sigmaAt, bankDeg: tl.bank[i], g: tl.g[i] });
}

/** True when a track (points every few seconds) crosses itself: a loop (RS-26: a cut never flies one). */
function crossesItself(pts) {
  const cross = (a, b, c, d) => {
    const o = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  for (let i = 0; i + 1 < pts.length; i++) for (let j = i + 2; j + 1 < pts.length; j++) if (cross(pts[i], pts[i + 1], pts[j], pts[j + 1])) return true;
  return false;
}

/**
 * A live "Anthem starts" press, cutting track and setting the run-in speed (RS-26, RS-27; Dad, 17 Oct 2026: "adjusts
 * speed on run in and cuts track", and on V2.507 "as well as the cutting of ground track the aircraft increase bank or g
 * or turn towards the inbound line and skip the IP"). setup.totSec is the anthem's last note. The choices, each with its
 * run-in speed worked out to hit between anthemSpeedRange()'s slowest and fastest (found by flying it):
 *  - stay in the orbit (flyPassFrom, the existing solver with the past kept) at the planned speed, or the fastest if late;
 *  - cut (V2.508): from where he was at the press, turn at once at ANTHEM_CUT.bankDeg either way round onto an intercept
 *    of the run-in line at each of ANTHEM_CUT.interceptDeg, skipping the IP, then roll out onto the line (cutLegs); not a
 *    choice when it loops (its track crosses itself), crosses the line before rolling out, leaves less than
 *    minRunInNm of straight run-in, or crosses more than maxAbeamFt abeam;
 *  - on the way to the IP or the run-in already at the press: the speed only (and, on the way to the IP, the cut).
 * The pick: the crossing nearest the last note; within half a second, the least change (the orbit, then the least
 * turning). Returns a pass in flyPass's shape with `press` = { kind ('orbit' | 'cut' | 'speed' | 'none'), atSec, side,
 * bankDeg, joinNm, kias, errSec, turnDeg, choices, nearMiss } for the card.
 */
export function flyAnthemPress(prev, setup, world, pressSec) {
  const started = globalThis.performance?.now?.() ?? Date.now();
  const tl = prev.flight.timeline;
  const dt = tl.t[1] - tl.t[0] || PASS_STEP_SEC;
  const i = clamp(Math.round(pressSec / dt), 0, tl.t.length - 1);
  const atSec = tl.t[i];
  const T = setup.totSec;
  const base = { ...prev.plan, setup: { ...prev.plan.setup, totSec: T }, notes: [...prev.plan.notes] };
  const [slow, fast] = anthemSpeedRange(base);
  const choices = [];
  let nearMiss = null; // the cut nearest the note that crossed too far abeam to count (for the card)

  // Stay in the orbit (V2.506's way), at the planned speed, then the fastest if that is late.
  const orbitAt = (kias) => {
    const p = flyPassFrom(prev, { ...setup, kias }, world, pressSec);
    if (p.committed || p.splicedFt > 1) return null;
    return { kind: 'orbit', kias, errSec: p.result.lateSec ?? Infinity, turn: 0, pass: p };
  };
  const phase0 = tl.phase[i];
  if (phase0 === PHASE.ORBIT) {
    const planned = orbitAt(setup.kias);
    if (planned) choices.push(planned);
    if (planned && Math.abs(planned.errSec) < 0.5) return finish(planned);
    if (planned && planned.errSec > 0 && fast > setup.kias + 1) {
      const quick = orbitAt(fast);
      if (quick) choices.push(quick);
    }
  }

  // A choice flown from the press state: a cut (plan.cut) or, on the way in already, the legs as they were.
  const pilot0 = pilotFromTimeline(base, tl, i);
  const w0 = base.windAt(tl.z[i]);
  const trk0 = Math.atan2(tl.vy[i] + w0.y, tl.vx[i] + w0.x);
  const off0 = tl.x[i] * base.r.x + tl.y[i] * base.r.y - base.offsetFt; // right of the run-in line, ft
  const runTrk = Math.atan2(base.u.y, base.u.x);
  const cutOf = (interceptDeg, side) => {
    const from = Math.sign(off0) || 1;
    const k = degToRad(interceptDeg);
    // The intercept: the run-in's track turned toward the line (the line lies at −from × r from him).
    const want = { x: base.u.x * Math.cos(k) - from * base.r.x * Math.sin(k), y: base.u.y * Math.cos(k) - from * base.r.y * Math.sin(k) };
    const wantTrk = Math.atan2(want.y, want.x);
    const d = side > 0 ? trk0 - wantTrk : wantTrk - trk0; // + right: the track's angle falls
    return { side, from, want, wantTrk, runTrk, interceptDeg, bankDeg: ANTHEM_CUT.bankDeg, turnRad: ((d % TAU) + TAU) % TAU };
  };
  // A cut (plan.cut), or (cut.joinFt) V2.507's cut direct to a point on the run-in line inside the IP, then the line.
  const planFor = (cut, kias) => (cut?.point
    ? { ...base, keepTrack: true, ip: { x: -base.u.x * cut.joinFt + base.r.x * base.offsetFt, y: -base.u.y * cut.joinFt + base.r.y * base.offsetFt }, ipFt: cut.joinFt, runInKias: kias }
    : { ...base, keepTrack: true, cut, runInKias: kias });
  const arrival = (plan, step, record = false) => fly(plan, { pilot: pilot0, t0: atSec, phase: phase0 === PHASE.ORBIT ? PHASE.TO_IP : phase0, exitSec: atSec, dt: step, stopAt: record ? null : 'release', record });
  // Why a flown choice is not one (null when it is), and its crossing's distance abeam.
  let cutting = false; // the loop check is for the cuts; the speed alone has nothing else to fly
  const judge = (f) => {
    if (!f.release) return { why: 'never crossed' };
    const abeamFt = Math.abs((f.release.state.x * base.r.x + f.release.state.y * base.r.y) - base.offsetFt);
    if (f.cut) {
      if (f.cut.fail) return { why: f.cut.fail };
      if (f.cut.joinFt === null || f.cut.joinFt < ANTHEM_CUT.minRunInNm * FT_PER_NM) return { why: 'too short a run-in' };
    }
    if (cutting && crossesItself(f.track.concat([{ x: f.release.state.x, y: f.release.state.y }]))) return { why: 'a loop' };
    if (abeamFt > ANTHEM_CUT.maxAbeamFt) return { why: 'abeam', abeamFt };
    return { why: null, abeamFt };
  };
  const solveSpeed = (cut) => {
    const at = (kias) => arrival(planFor(cut, kias), SOLVE_STEP_SEC).release?.t ?? Infinity;
    // At the fastest first: a cut that loops or runs short there is dropped before the speed is worked out.
    const fFast = arrival(planFor(cut, fast), SOLVE_STEP_SEC);
    const jFast = judge(fFast);
    if (jFast.why && jFast.why !== 'abeam') return null;
    const tFast = fFast.release.t;
    const tSlow = at(slow);
    let kias;
    if (T >= tSlow) kias = slow; // early even at the slowest
    else if (T <= tFast) kias = fast; // late even at the fastest
    else {
      let a = slow, b = fast; // the arrival falls as the speed rises
      for (let k = 0; k < 9; k++) {
        const m = (a + b) / 2;
        if (at(m) > T) a = m;
        else b = m;
      }
      kias = (a + b) / 2;
    }
    const f = arrival(planFor(cut, kias), SOLVE_STEP_SEC);
    const j = judge(f);
    if (j.why === 'abeam') {
      // Kept for the card only: a crossing nearer the note than the pick, but too far abeam to count.
      const miss = { kind: cut ? (cut.point ? 'point' : 'cut') : 'speed', side: cut?.side ?? null, joinFt: f.cut?.joinFt ?? cut?.joinFt ?? null, kias, errSec: f.release.t - T, abeamFt: j.abeamFt };
      if (!nearMiss || Math.abs(miss.errSec) < Math.abs(nearMiss.errSec)) nearMiss = miss;
      return null;
    }
    if (j.why) return null;
    return { kias, errSec: f.release.t - T, joinFt: f.cut?.joinFt ?? cut?.joinFt ?? null };
  };
  if (phase0 === PHASE.ORBIT || phase0 === PHASE.TO_IP) {
    cutting = true;
    if (Math.abs(off0) > 200) {
      for (const deg of ANTHEM_CUT.interceptDeg) for (const side of [-1, 1]) {
        const cut = cutOf(deg, side);
        const sp = solveSpeed(cut);
        if (sp) choices.push({ kind: 'cut', cut, turn: cut.turnRad + degToRad(deg), ...sp });
      }
    }
    // V2.507's cuts direct to a point on the line, each whole mile in from the IP (the IP itself skipped), kept for where
    // the line can't be met heading inbound (from a circle round the target, say), and never when they loop.
    for (let d = Math.ceil(base.ipFt / FT_PER_NM - 1 - 1e-9); d >= ANTHEM_CUT.minRunInNm - 1e-9; d -= 1) {
      const cut = { point: true, joinFt: d * FT_PER_NM };
      const sp = solveSpeed(cut);
      if (sp) choices.push({ kind: 'point', cut, turn: 10, ...sp }); // ranked after any cut toward the line on a tie
    }
    cutting = false;
  }
  if (phase0 === PHASE.TO_IP || phase0 === PHASE.RUN_IN) {
    const sp = solveSpeed(null);
    if (sp) choices.push({ kind: 'speed', cut: null, turn: 0, ...sp });
  }
  if (!choices.length) {
    const kept = flyPassFrom(prev, setup, world, pressSec);
    return { ...kept, press: { kind: 'none', atSec, joinNm: null, kias: null, errSec: kept.result.lateSec, choices: [], nearMiss: missOf(kept.result.lateSec) } };
  }
  // The pick: nearest the last note; within half a second, the least change (the orbit, then the least turning).
  const rank = (c) => (c.kind === 'orbit' ? -1 : c.turn);
  let best = choices[0];
  for (const c of choices) {
    const d = Math.abs(c.errSec) - Math.abs(best.errSec);
    if (d < -0.5 || (Math.abs(d) <= 0.5 && rank(c) < rank(best))) best = c;
  }
  return finish(best);

  function missOf(errSec) {
    return nearMiss && Math.abs(nearMiss.errSec) < Math.abs(errSec) - 0.5
      ? { kind: nearMiss.kind, side: nearMiss.side, joinNm: nearMiss.joinFt ? nearMiss.joinFt / FT_PER_NM : null, kias: nearMiss.kias, errSec: nearMiss.errSec, abeamFt: nearMiss.abeamFt, limitFt: ANTHEM_CUT.maxAbeamFt, bankDeg: ANTHEM_CUT.bankDeg }
      : null;
  }

  function finish(c) {
    const words = (x) => ({ kind: x.kind, side: x.cut?.side ?? null, interceptDeg: x.cut?.interceptDeg ?? null, joinNm: x.joinFt ? x.joinFt / FT_PER_NM : null, kias: x.kias, errSec: x.errSec });
    const press = { ...words(c), atSec, bankDeg: c.kind === 'cut' ? c.cut.bankDeg : null, turnDeg: 0, choices: choices.map(words), nearMiss: null };
    if (c.pass) return { ...c.pass, press: { ...press, nearMiss: missOf(press.errSec) } };
    // A cut or a speed: flown from the press state and joined to the stored flight up to the press.
    let plan = planFor(c.cut, c.kias);
    const flight = arrival(plan, PASS_STEP_SEC, true);
    const nt = flight.timeline;
    for (const key of Object.keys(nt)) if (Array.isArray(tl[key])) nt[key] = tl[key].slice(0, i).concat(nt[key]);
    flight.events = { ...flight.events, exit: atSec };
    if (phase0 === PHASE.RUN_IN && prev.flight.events.ip !== undefined) flight.events.ip = prev.flight.events.ip;
    if (c.cut && !c.cut.point && flight.cut?.joinFt) {
      // The views mark where the cut joined the run-in line (as the IP: the run-in is drawn from there).
      const j = flight.cut.joinFt;
      plan = { ...plan, ip: { x: -base.u.x * j + base.r.x * base.offsetFt, y: -base.u.y * j + base.r.y * base.offsetFt }, ipFt: j };
      press.joinNm = j / FT_PER_NM;
    }
    const exit = { sec: atSec, byHand: false };
    const result = resultOf(plan, exit, flight, null);
    press.errSec = result.lateSec;
    // How far it turned from the press to the target, + left (anticlockwise seen from above).
    let turn = 0;
    const overAt = flight.events.release ?? Infinity;
    for (let k = i + 1; k < nt.t.length && nt.t[k] <= overAt; k++) turn += wrapPi(Math.atan2(nt.vy[k], nt.vx[k]) - Math.atan2(nt.vy[k - 1], nt.vx[k - 1]));
    press.turnDeg = radToDeg(turn);
    press.nearMiss = missOf(press.errSec);
    return { plan, exit, flight, fall: null, result, press, computeMs: (globalThis.performance?.now?.() ?? Date.now()) - started };
  }
}

/**
 * The load's fall from the aircraft's state at release, through the wind met and onto the ground. Over the bridge (RS-12)
 * the fall is followed at every step to the ground, then stopped where it first meets the deck (from above, or into its
 * edge); one that goes past the deck, or under it, falls on to the ground and the miss of the deck is kept (deckMiss).
 */
function dropFrom(plan, release) {
  const st = release.state;
  const bridge = plan.setup.target.id === 'bridge';
  const fall = flyDrop({
    release: { x: st.x, y: st.y, z: st.z, vx: release.ground.x, vy: release.ground.y, vz: release.ground.z },
    load: plan.load, windAt: plan.windAt, groundAt: plan.groundAt, deviationC: plan.setup.tempDevC, every: bridge ? 1 : 4,
  });
  if (!bridge || !fall.landed) return fall;
  const deck = deckOf(plan.setup.target.sizeFt, plan.setup.target.headingDegT, plan.groundFt);
  const hit = deckHit(fall.path, deck);
  if (hit) {
    const path = fall.path.filter((q) => q.t < hit.t);
    path.push({ t: hit.t, x: hit.x, y: hit.y, z: hit.z });
    return { ...fall, path, impact: { ...fall.impact, t: hit.t, x: hit.x, y: hit.y, z: hit.z }, deck: { on: true, edge: hit.edge } };
  }
  return { ...fall, deck: { on: false, miss: deckMiss(fall.path, deck, plan.u, plan.r) } };
}

/** The result card's numbers, flags and words. */
function resultOf(plan, exit, flight, fall) {
  const tl = flight.timeline;
  const setup = plan.setup;
  const ac = plan.ac;
  const ev = flight.events;
  const n = tl.t.length;
  const tAfterIp = ev.ip ?? 0;
  let lowest = { agl: Infinity, known: true, t: 0 };
  let peakG = 0;
  let closest = Infinity;
  let lowestKias = Infinity;
  let overVmo = 0;
  let overTop = null; // the flyover's lowest height over the target's top inside the reference distance
  // The steepest bank in the orbit's turns (RS-11: the wind steepens the pattern's downwind side), counted only while the
  // lift carries the weight (G × cos bank within 0.15 of 1, an estimate), so a push over to descend doesn't read as a turn.
  let orbitBank = 0;
  for (let i = 0; i < n; i++) {
    const x = tl.x[i], y = tl.y[i], z = tl.z[i];
    peakG = Math.max(peakG, tl.g[i]);
    if (tl.phase[i] === PHASE.ORBIT && Math.abs(tl.g[i] * Math.cos(degToRad(tl.bank[i])) - 1) < 0.15) orbitBank = Math.max(orbitBank, Math.abs(tl.bank[i]));
    overVmo = Math.max(overVmo, tl.kias[i] - ac.maxKias(z));
    if (tl.t[i] < tAfterIp) continue;
    const agl = z - plan.groundAt(x, y);
    if (agl < lowest.agl) lowest = { agl, known: plan.known(x, y), t: tl.t[i] };
    closest = Math.min(closest, Math.hypot(x - plan.aim.x, y - plan.aim.y, z - plan.aim.z));
    lowestKias = Math.min(lowestKias, tl.kias[i]);
    if (plan.run === 'flyover' && Math.hypot(x, y) <= REFERENCES.overTopInsideFt) {
      const over = z - plan.topMsl;
      if (overTop === null || over < overTop) overTop = over;
    }
  }
  const tot = setup.totSec;
  const arrival = arrivalOf(plan, flight, fall);
  const lateSec = arrival === null ? null : arrival - tot;
  const flags = [];
  const flag = (id, words, over) => flags.push({ id, words, over });
  const refAgl = REFERENCES.lowestAglFt;
  const shown = (ft) => Math.round(ft / 10) * 10; // heights are judged as the card shows them, to 10 ft
  flag('lowest', `Lowest after the IP ${lowest.known ? '' : '(unknown ground) '}against ${refAgl} ft AGL`, shown(lowest.agl) < refAgl);
  flag('peakG', `Peak G against the ${ac.gLimit} G limit`, peakG > ac.gLimit);
  flag('vmo', 'Fastest against VMO', overVmo > 0);
  flag('slow', `Lowest airspeed against the stick shaker (${Math.round(ac.shakerKias)} KIAS)`, lowestKias < ac.shakerKias);
  if (plan.orbit.lap) flag('orbitBank', `Steepest bank in the orbit against ${REFERENCES.orbitBankDeg}° (an estimate)`, Math.round(orbitBank) > REFERENCES.orbitBankDeg);
  if (plan.run === 'flyover') flag('overTop', `Over the top inside ${REFERENCES.overTopInsideFt.toLocaleString('en-CA')} ft against ${REFERENCES.overTopFt.toLocaleString('en-CA')} ft`, overTop !== null && shown(overTop) < REFERENCES.overTopFt);

  const notes = [...plan.notes];
  if (flight.ground) {
    const when = ev.release !== undefined
      ? `${Math.round(flight.ground.t - ev.release)} s after ${plan.run === 'flyover' ? 'the flypast' : 'release'}`
      : `at +${clock(flight.ground.t)}, before ${plan.run === 'flyover' ? 'the flypast' : 'the release'}`;
    const fix = ev.release !== undefined && plan.run === 'bombDive' ? 'A higher release height or a shallower dive would work.' : 'Higher heights for the orbit and the run-in, or another run-in heading, would work.';
    notes.push(`Hit the ground ${when}: the aircraft couldn't make the pass as set over this ground. ${fix}`);
  }
  if (!flight.release && !flight.ground) notes.push(plan.run === 'flyover' ? 'It never passed the target.' : 'It never reached the release point.');
  if (exit.note) notes.push(exit.note);
  if (exit.lateSec > 0 && Number.isFinite(exit.lateSec)) notes.push(`The time over target can't be made from the orbit: the soonest is +${clock(exit.soonestSec)}, ${Math.round(exit.lateSec)} s late. A later time over target would work.`);
  if (flight.stallHeld > 0.5) notes.push(`The stall line held the G below what was asked for ${flight.stallHeld.toFixed(1)} s: flown at the most the wing gives.`);
  if (flight.events.release && !flight.events.safe && !flight.ground) notes.push('The escape did not settle at its height within the time followed.');

  const rel = flight.release;
  const miss = fall?.landed ? missClock(fall.impact, plan.aim, setup.trackDegT) : null;
  const legs = legTimes(plan, ev, flight, arrival);
  return {
    runLabel: plan.run, aircraftName: ac.name,
    miss, landed: fall ? fall.landed : null, impact: fall?.impact ?? null,
    arrivalSec: arrival, lateSec,
    overTopFt: plan.run === 'flyover' && rel ? rel.state.z - plan.topMsl : null,
    abeamFt: plan.run === 'flyover' && rel ? Math.abs(rel.state.x * plan.r.x + rel.state.y * plan.r.y) : null,
    release: rel ? { aglFt: rel.state.z - plan.groundFt, kias: rel.kias, climbDeg: rel.climbDeg, fallSec: fall?.landed ? fall.impact.t : null } : null,
    planned: {
      aglFt: plan.release?.point ? plan.release.point.z - plan.groundFt : plan.runInMsl - plan.groundFt,
      kias: plan.run === 'bombDive' ? plan.dive.relKias : setup.kias,
      diveDeg: plan.run === 'bombDive' ? setup.diveDeg : 0,
      atCarp: setup.release.mode === 'carp' && setup.byHand.aimOffFt === null,
    },
    lowest, peakG, closestFt: closest, lowestKias, overTop, overVmo, flags, notes, legs,
    orbitBankDeg: plan.orbit.lap ? orbitBank : null,
    deck: fall?.deck ?? null,
    steadySec: plan.run === 'bombDive' ? flight.steadySec : null,
  };
}

/** The time on each leg, s, from the events (the legs the spec's card lists). */
function legTimes(plan, ev, flight, arrival) {
  const end = flight.timeline.t[flight.timeline.t.length - 1];
  const out = [];
  const add = (label, a, b) => { if (Number.isFinite(a) && Number.isFinite(b) && b >= a) out.push({ label, sec: b - a }); };
  add('Orbit', 0, ev.exit);
  if (!(ev.ip - ev.exit < 0.5)) add('To the IP', ev.exit, ev.ip); // none when the pattern leaves at the IP (RS-11)
  if (plan.run === 'bombDive') {
    add('IP to roll-in', ev.ip, ev.rollIn);
    add('Roll-in to release', ev.rollIn, ev.release);
  } else {
    add(plan.run === 'flyover' ? 'IP to the target' : 'IP to release', ev.ip, ev.release);
  }
  add(flight.ground ? 'Escape, to the ground' : 'Escape to safe height', ev.release, ev.safe ?? end);
  if (plan.run !== 'flyover' && arrival !== null) add('Load\'s fall', ev.release, arrival);
  return out;
}

/**
 * The orbit as lines to draw over the ground, [[{ x, y }]]: the pattern flown (or one lap of it before the pass is worked
 * out), or the circle.
 */
export function orbitOutline(plan) {
  const o = plan?.orbit;
  if (!o) return [];
  if (o.lap) return [samplePath(o.path && o.path.total > 0 ? o.path : o.lap, 300)];
  const pts = [];
  for (let i = 0; i <= 128; i++) {
    const a = (i / 128) * TAU;
    pts.push({ x: o.centre.x + o.radiusFt * Math.cos(a), y: o.centre.y + o.radiusFt * Math.sin(a) });
  }
  return [pts];
}

/** "6:00" from seconds. */
export function clock(sec) {
  if (!Number.isFinite(sec)) return '--';
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export { TARGETS };
