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
//    inbound, and the time is made by the last lap: the holding pattern's last outbound leg stretched or shortened, or the
//    figure 8's last loop flown wider or tighter (PATTERN's limits, estimates). The pattern is a path of legs and arcs over
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
import { makePath, pointOnPath, nearestOnPath, samplePath, holdLap, eightLoop } from './ground-path.js';
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
 * holdMinLegSec (so the pilot is wings level inbound before the IP), and the figure 8's last loop is flown between
 * eightBankDeg's banks (15° to 45°, the spec's estimates), its radius worked out at the orbit's true airspeed.
 */
export const PATTERN = Object.freeze({ holdMinLegSec: 15, eightBankDeg: Object.freeze([15, 45]) });
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
      : [...eightLoop({ ip: plan.ip, u, dir: o.dir, r: radiusFt }), ...eightLoop({ ip: plan.ip, u, dir: -o.dir, r: radiusFt })];
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
  const tri = windTriangle(plan.setup.trackDegT, V / KT_TO_FTPS, w.fromDeg, w.kt);
  const s = pointMassState({ x: plan.ip.x, y: plan.ip.y, altFt: o.msl, ktas: V / KT_TO_FTPS, headingRad: compassDegToHeadingRad(tri.headingDeg) });
  const first = o.path?.segs[0];
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
        // From the last lap's start (prepFrom) he goes to the run-in's height and speed, so he is established at the IP.
        const prep = esc.pathS >= o.prepFrom;
        const climbCmdRad = climbToward(s, wind, prep ? plan.runInMsl : o.msl, PILOT.maxClimbDeg);
        const aim = pointOnPath(o.path, esc.pathS + look);
        return { lift: wantedLift(p, { ...env, climbCmdRad, aim, maxBankDeg: PILOT.patternBankDeg }), kias: prep ? plan.runInKias : o.kias, gMax: PILOT.manoeuvreG };
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
      // IP); at its end, at the IP heading inbound, he leaves it straight onto the run-in.
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
    if (ph === PHASE.TO_IP) {
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
  return { events, release, steadySec, ground, stallHeld, timeline: tl, end: p };
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
 * two half turns together), and perLegFt, the seconds per foot of the holding legs (one out, one in).
 */
function patternTimes(plan) {
  const o = plan.orbit;
  const w = plan.windAt(o.msl);
  const gs = (x, y) => Math.max(1, speedAlong({ x, y, z: 0 }, w, o.tasFtps));
  const N = 180;
  let K = 0;
  for (let i = 0; i < N; i++) {
    const th = ((i + 0.5) / N) * TAU;
    K += TAU / N / gs(Math.cos(th), Math.sin(th));
  }
  return { K, perLegFt: 1 / gs(-plan.u.x, -plan.u.y) + 1 / gs(plan.u.x, plan.u.y) };
}

/** The radius of a turn at bankDeg at the orbit's true airspeed, ft. */
const radiusAtBank = (plan, bankDeg) => turnRadiusFromBankFt(plan.orbit.tasFtps, bankDeg);

/**
 * How the pattern makes the time over target (RS-8, RS-9, RS-11): k standard laps (holding pattern) or loops (figure 8),
 * then a last one whose outbound leg (feet) or radius (feet) is `param`. The time from the IP on is the run-in flown from
 * the IP, established at its height and speed, to the release (and the load's fall). When even the shortest last lap is
 * too long, the nearer of leaving at once (param null: no pattern, the run-in starts at the IP) and the shortest lap.
 * Returns { k, param, range, slope (s per foot of param), byHand }.
 */
export function solvePattern(plan) {
  const o = plan.orbit;
  const setup = plan.setup;
  const hold = o.pattern === 'hold';
  const { K, perLegFt } = patternTimes(plan);
  const timeOf = (param) => (hold ? o.radiusFt * K + param * perLegFt : param * K);
  const nominal = hold ? o.legFt : o.radiusFt;
  const lapSec = timeOf(nominal);
  const range = hold ? [o.tasFtps * PATTERN.holdMinLegSec, Infinity] : [radiusAtBank(plan, PATTERN.eightBankDeg[1]), radiusAtBank(plan, PATTERN.eightBankDeg[0])];
  const slope = hold ? perLegFt : K;
  if (setup.byHand.exitSec !== null) {
    // Left by hand: standard laps, leaving at the IP at the first pass at or after the time set.
    return { k: Math.max(0, Math.ceil((setup.byHand.exitSec - 0.5) / lapSec)), param: null, standard: true, range, slope, byHand: true };
  }
  const start = runInStart(plan, plan.runInMsl, plan.runInKias, -plan.ipFt);
  const f = fly(plan, { pilot: start, phase: PHASE.RUN_IN, dt: SOLVE_STEP_SEC, stopAt: 'release' });
  if (!f.release) return { k: 0, param: nominal, range, slope };
  const fromIp = f.release.t + (plan.run === 'flyover' ? 0 : plan.fallSec);
  const need = setup.totSec - fromIp; // the time to be at the IP
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
  return { k, param: clamp(hold ? (rest - o.radiusFt * K) / perLegFt : rest / K, r[0], r[1]), range: r, slope };
}

/**
 * The pattern's whole path (RS-11): k standard laps, then the last one (param: its outbound leg or radius, ft; null with
 * `standard` false: no pattern at all). prepFrom: how far along it the last lap's run-in preparation starts (the last
 * outbound leg, or the last loop).
 */
function patternPath(plan, k, param, standard = false) {
  const o = plan.orbit;
  const base = { ip: plan.ip, u: plan.u };
  if (param === null && !standard) return { path: makePath([]), prepFrom: 0 };
  const segs = [];
  const lapOf = (i, size) => (o.pattern === 'hold'
    ? holdLap({ ...base, dir: o.dir, r: o.radiusFt, legFt: size })
    : eightLoop({ ...base, dir: i % 2 === 0 ? o.dir : -o.dir, r: size }));
  const nominal = o.pattern === 'hold' ? o.legFt : o.radiusFt;
  const n = standard ? k - 1 : k;
  for (let i = 0; i < n; i++) segs.push(...lapOf(i, nominal));
  const before = makePath(segs).total;
  if (n >= 0) segs.push(...lapOf(Math.max(n, 0), standard ? nominal : param));
  const path = makePath(segs);
  return { path, prepFrom: o.pattern === 'hold' ? before + Math.PI * o.radiusFt : before };
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
    Object.assign(o, patternPath(plan, sol.k, param, sol.standard));
    const flight = fly(plan, { pilot: patternStart(plan), record: true });
    const fall = flight.release && plan.load ? dropFrom(plan, flight.release) : null;
    const arrival = arrivalOf(plan, flight, fall);
    const err = arrival === null ? Infinity : tot - arrival; // + early: more time wanted
    if (!best || Math.abs(err) < Math.abs(best.err)) best = { flight, fall, param, err, path: o.path, prepFrom: o.prepFrom };
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
  const ev = best.flight.events;
  const exit = { sec: ev.exit ?? 0, byHand: Boolean(sol.byHand), pattern: { k: sol.k, none: o.path.total <= 0 } };
  const size = best.param ?? (o.pattern === 'hold' ? o.legFt : o.radiusFt);
  if (o.pattern === 'hold') exit.pattern.legSec = size / o.tasFtps;
  else exit.pattern.bankDeg = radToDeg(Math.atan((o.tasFtps * o.tasFtps) / (G_FTPS2 * size)));
  if (!sol.byHand && Number.isFinite(best.err) && Math.abs(best.err) >= 2) {
    const words = o.pattern === 'hold' ? 'the shortest last outbound leg' : 'the tightest last loop';
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
export function flyPass(setup, world, { minLaps = 0, maxLaps = null, minParamFt = null, minExitSec = null, live = false } = {}) {
  const started = globalThis.performance?.now?.() ?? Date.now();
  const plan = buildPlan(setup, world);
  if (minLaps > 0) plan.minLaps = minLaps; // RS-24: a live anthem press keeps the laps already begun
  if (maxLaps !== null) plan.maxLaps = maxLaps;
  if (minParamFt !== null) plan.minParamFt = minParamFt;
  if (live) plan.live = true;
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
    const stdFt = o.pattern === 'hold' ? makePath(holdLap({ ip: prev.plan.ip, u: prev.plan.u, dir: o.dir, r: o.radiusFt, legFt: o.legFt })).total : TAU * o.radiusFt;
    const s = tl.pathS[i] ?? 0;
    const w = prev.plan.windAt(tl.z[i]);
    const look = Math.max(500, Math.hypot(tl.vx[i] + w.x, tl.vy[i] + w.y) * PILOT.lookaheadSec);
    const margin = 3 * look + 300; // his look ahead and its search window
    const kOld = prev.exit.pattern?.k ?? 0;
    let j = Math.min(Math.floor(s / stdFt), kOld); // the lap it is in (lap kOld is the last, adjusted one)
    if (o.pattern === 'hold') {
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
      if ((j + 1) * stdFt - s < margin) j += 1; // the look ahead already reaches the next loop
      if (j >= kOld) return committed('Already in its last loop when the anthem started: nothing left in the pattern to change.');
      options = { minLaps: j + 1 };
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
