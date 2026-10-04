// The Turn Fight: two aircraft start head-on, fly to the merge, then turn.
// A pure calculation with no page access (SPEC-turn-fight, "The fight"): it
// takes a plain setup and moves a plain state, so the same numbers come out in
// Node and in the browser. It is V6's `bfmFight` script (original/shell.html,
// lines 4232 to 4294) ported as it is, in the same order of operations. V6 is a
// source of ideas, not answers (docs/TESTING.md). The turn math itself
// comes from core.
//
// Units: feet, seconds, radians. Headings follow core's rule: 0 is east (+x),
// counter-clockwise is positive, so Blue (left of the start, heading east)
// turns left. Height is feet above the start height.
import { KT_TO_FTPS, FT_PER_NM } from '../../core/units.js';
import { limitG, turnRadiusFt, turnRateRadPerSec } from '../../core/flight-math.js';
import { wrapPi, absAngleDeg, headingRad, degToRad, radToDeg } from '../../core/angles.js';
import { START_DEFAULTS, startGeometry, turnDirections, isHeadOn } from './geometry.js';

/**
 * The fight moves in whole steps of this many seconds (V6's largest step,
 * `Math.min(.02,r)`, line 4245). V6 also cut the last step of each screen
 * frame short; here the remainder is carried to the next frame instead, so
 * every screen gets the same fight (SPEC-turn-fight, "One fixed step").
 */
export const FIGHT_STEP_SEC = 0.02;

/** The fight stops after this much fight time (V6 had no end; SPEC-turn-fight, "The fight stops at 10 minutes"). */
export const FIGHT_MAX_SEC = 600;

/** The first nose-on test: the other aircraft within this many degrees of the nose (V6 `checkFirstNose`, line 4241). */
export const FIRST_NOSE_DEG = 5;

/** The highest climb or dive angle a chasing aircraft pitches to (V6, lines 4262 and 4265: ±π/3). */
const MAX_CHASE_PITCH_RAD = Math.PI / 3;

/**
 * V6's setup when nothing is changed (the boxes on line 778): 2-circle, 2 NM
 * apart, both at 220 KTAS and 4 G, First nose chases and Climb and dive off,
 * pitch 0°. `circles` is 1 or 2.
 *
 * @type {Readonly<{ circles: number, separationNm: number, blueKt: number, redKt: number, blueG: number, redG: number, chase: boolean, vertical: boolean, bluePitchDeg: number, redPitchDeg: number }>}
 */
export const V6_DEFAULT_SETUP = Object.freeze({
  circles: 2,
  separationNm: 2,
  blueKt: 220,
  redKt: 220,
  blueG: 5,
  redG: 5,
  chase: false,
  vertical: false,
  bluePitchDeg: 0,
  redPitchDeg: 0,
});
export const HARVARD_DEFAULT_SETUP = V6_DEFAULT_SETUP;

// The start geometry's own defaults and helpers live in geometry.js (R28).
export { START_DEFAULTS };

/**
 * One aircraft's level turn at a speed and G (V6 `M`, line 4237): the G is
 * limited to 1.01 and up, radius is V²/(g√(G²−1)), rate is g√(G²−1)/V.
 * Core works the rate out as speed ÷ radius, which differs from V6's order in
 * the last digit only (for about a third of speed and G pairs). Without First
 * nose chases that stays a last-digit difference for 10 minutes. With it on, the
 * chase is chaotic and the difference can grow after about 40 s; that growth is
 * within V6's own spread between 50 and 60 frames a second, and the 10-minute
 * golden grid uses rates that are bit-equal to V6's. `rateDegPerSec` is V6's `rate`.
 */
export function levelTurn(speedKt, g) {
  const speedFtps = speedKt * KT_TO_FTPS;
  const limitedG = limitG(g);
  const rateRadPerSec = turnRateRadPerSec(speedFtps, limitedG);
  return {
    speedKt,
    g: limitedG,
    speedFtps,
    radiusFt: turnRadiusFt(speedFtps, limitedG),
    rateRadPerSec,
    rateDegPerSec: radToDeg(rateRadPerSec),
  };
}

/** Seconds from the start to the merge (V6 `reset`, line 4240). */
export function mergeTimeSec(separationNm, blueKt, redKt) {
  return (separationNm * FT_PER_NM) / ((blueKt + redKt) * KT_TO_FTPS);
}

/**
 * How far the other aircraft is off this one's nose, in degrees from 0 to 180,
 * on the ground plane (V6 `ao`, line 4239; V6 calls it "angle-off").
 * Both arguments are aircraft as in a fight state.
 */
export function offNoseDeg(from, other) {
  return absAngleDeg(lineOfSightRad(from, other) - from.headingRad);
}

/**
 * How far the other aircraft is off this one's nose in 3D, in degrees from 0 to
 * 180 (Q51): the angle from the nose (heading and pitch) to the line of sight,
 * height included. A jet far above or below is far off the nose even when it is
 * right ahead on the ground. With no line of sight (both at one point) there is
 * no 3D angle, and this gives the ground-plane one, so it is never NaN.
 */
export function offNose3dDeg(from, other) {
  const dx = other.xFt - from.xFt, dy = other.yFt - from.yFt, dz = other.zFt - from.zFt;
  if (dx === 0 && dy === 0 && dz === 0) return offNoseDeg(from, other);
  const cosPitch = Math.cos(from.pitchRad);
  const nx = cosPitch * Math.cos(from.headingRad), ny = cosPitch * Math.sin(from.headingRad), nz = Math.sin(from.pitchRad);
  // atan2 of the cross and dot products stays exact near 0° and 180°, where acos loses digits.
  const cross = Math.hypot(ny * dz - nz * dy, nz * dx - nx * dz, nx * dy - ny * dx);
  return radToDeg(Math.atan2(cross, nx * dx + ny * dy + nz * dz));
}

/**
 * The off-nose angle (antenna train angle, ATA) the fight uses, for first
 * nose-on and for the readout. V6's ground-plane angle while the fight is
 * level; with Climb and dive on, the 3D angle (Q51). `v6OffNose: true` in
 * createFight keeps V6's ground-plane angle always (the golden test pins V6 with it).
 */
export function ataDeg(state, from, other) {
  return state.setup.vertical && !state.v6OffNose ? offNose3dDeg(from, other) : offNoseDeg(from, other);
}

/**
 * Whether the other aircraft is inside this one's nose capture cone (D386):
 * Level / 2D: Azimuth off-nose <= FIRST_NOSE_DEG (5.0°).
 * Climb & dive (3D): Azimuth off-nose <= 5.0° AND elevation off-nose <= 10.0°.
 */
export function isNoseOn(state, from, other) {
  if (state.setup.vertical && !state.v6OffNose) {
    const dx = other.xFt - from.xFt, dy = other.yFt - from.yFt, dz = other.zFt - from.zFt;
    const dH = Math.hypot(dx, dy);
    if (dH === 0 && dz === 0) return offNoseDeg(from, other) <= FIRST_NOSE_DEG;
    const deltaAz = Math.abs(wrapPi(Math.atan2(dy, dx) - from.headingRad)) * 180 / Math.PI;
    const thetaLos = Math.atan2(dz, dH) * 180 / Math.PI;
    const deltaEl = Math.abs(from.pitchRad * 180 / Math.PI - thetaLos);
    return deltaAz <= FIRST_NOSE_DEG && deltaEl <= 10.0;
  }
  return ataDeg(state, from, other) <= FIRST_NOSE_DEG;
}

/** Straight-line distance between the aircraft in feet, including height (V6 `upd`, line 4276). */
export function rangeFt(state) {
  return Math.hypot(state.red.xFt - state.blue.xFt, state.red.yFt - state.blue.yFt, state.red.zFt - state.blue.zFt);
}

/** Seconds since the merge, never below 0 (V6 `upd`, line 4280). */
export function sinceMergeSec(state) {
  return Math.max(0, state.timeSec - state.mergeSec);
}

/** Heading of the line from one aircraft to another (V6 `Math.atan2(dy,dx)`, lines 4239, 4260, 4263). */
function lineOfSightRad(from, to) {
  return headingRad({ x: from.xFt, y: from.yFt }, { x: to.xFt, y: to.yFt });
}

function need(ok, what, value) {
  if (!ok) throw new RangeError(`Turn Fight setup: ${what}, got ${value}`);
}

/**
 * A new fight at T+0 (V6 `reset`, line 4240): Blue and Red start the set
 * separation apart on the x axis, Blue on the left heading east, Red on the
 * right heading west, both level. Q49: the start is weighted by speed, Blue at
 * -V1 ÷ (V1 + V2) of the separation and Red at +V2 ÷ (V1 + V2), so the jets
 * meet at the centre. V6 started both half the separation out and moved them to
 * the centre at the merge; `v6Start: true` brings that back (the golden test
 * pins V6 with it). The two are the same with equal speeds.
 *
 * `setup` is { circles: 1 | 2, separationNm, blueKt, redKt, blueG, redG, chase,
 * vertical, bluePitchDeg, redPitchDeg }; anything left out is V6's default
 * (V6_DEFAULT_SETUP). The setup is checked here, because a blank or
 * infinite number would never merge. Returns the state that stepFight moves.
 * `v6Start` is an option, not one of the boxes: it is not kept in `state.setup`.
 * The same goes for `v6OffNose` (Q51): with Climb and dive on, first nose-on
 * and the readout use the 3D off-nose angle; `v6OffNose: true` keeps V6's
 * ground-plane angle. It is kept as `state.v6OffNose`.
 */
export function createFight({ v6Start = false, v6OffNose = false, ...setup } = {}) {
  const s = { ...V6_DEFAULT_SETUP, ...START_DEFAULTS, ...setup };
  need(s.circles === 1 || s.circles === 2, 'circles is 1 or 2', s.circles);
  need(Number.isFinite(s.separationNm) && s.separationNm > 0, 'separationNm is above 0', s.separationNm);
  need(Number.isFinite(s.blueKt) && s.blueKt > 0, 'blueKt is above 0', s.blueKt);
  need(Number.isFinite(s.redKt) && s.redKt > 0, 'redKt is above 0', s.redKt);
  need(Number.isFinite(s.blueG), 'blueG is a number', s.blueG);
  need(Number.isFinite(s.redG), 'redG is a number', s.redG);
  need(Number.isFinite(s.bluePitchDeg), 'bluePitchDeg is a number', s.bluePitchDeg);
  need(Number.isFinite(s.redPitchDeg), 'redPitchDeg is a number', s.redPitchDeg);
  need(Number.isFinite(s.startAtaDeg) && s.startAtaDeg >= 0 && s.startAtaDeg <= 180, 'startAtaDeg is 0 to 180', s.startAtaDeg);
  need(Number.isFinite(s.startAaDeg) && s.startAaDeg >= 0 && s.startAaDeg <= 180, 'startAaDeg is 0 to 180', s.startAaDeg);
  need(s.startAtaSide === 'left' || s.startAtaSide === 'right', "startAtaSide is 'left' or 'right'", s.startAtaSide);
  need(s.startAaSide === 'left' || s.startAaSide === 'right', "startAaSide is 'left' or 'right'", s.startAaSide);
  need(s.turnsAt === 'pass' || s.turnsAt === 'once', "turnsAt is 'pass' or 'once'", s.turnsAt);
  need(Number.isFinite(s.redAboveFt), 'redAboveFt is a number', s.redAboveFt);
  const geometry = startGeometry(s);
  const headOn = isHeadOn(s);
  const vertical = !!s.vertical;
  let blue = geometry.blue, red = geometry.red, passSec = geometry.passSec, closing = geometry.closing;
  if (headOn && (s.turnsAt === 'pass' || v6Start)) {
    // V6's own start, in V6's own arithmetic (the golden test pins it bit for bit); the general placement agrees to a billionth of a foot.
    const separationFt = s.separationNm * FT_PER_NM;
    const closingKt = s.blueKt + s.redKt;
    blue = { xFt: v6Start ? -separationFt / 2 : (-s.blueKt / closingKt) * separationFt, yFt: 0, headingRad: 0 };
    red = { xFt: v6Start ? separationFt / 2 : (s.redKt / closingKt) * separationFt, yFt: 0, headingRad: Math.PI };
    passSec = mergeTimeSec(s.separationNm, s.blueKt, s.redKt);
    closing = true;
  }
  // The turns start at the pass, or at T+0 when asked or when the range is not closing (nothing to fly to).
  const turnsNow = s.turnsAt === 'once' || !closing || passSec >= FIGHT_MAX_SEC;
  const redZFt = vertical ? s.redAboveFt : 0;
  const state = {
    setup: { ...s, chase: !!s.chase, vertical },
    perf: { blue: levelTurn(s.blueKt, s.blueG), red: levelTurn(s.redKt, s.redG) },
    mergeSec: turnsNow ? 0 : passSec,
    timeSec: 0,
    merged: turnsNow,
    // Whether the jets meet at the centre: the MERGE mark, and the snap of a head-on merge to the centre.
    mergeMark: !turnsNow,
    headOn,
    stopped: false,
    carrySec: 0,
    v6OffNose: !!v6OffNose,
    firstNose: null,
    start: { hcaDeg: geometry.hcaDeg, passSec: closing ? passSec : 0, closing, passRangeFt: geometry.passRangeFt },
    startZFt: { blue: 0, red: redZFt },
    turnDir: turnDirections(s, geometry),
    blue: { xFt: blue.xFt, yFt: blue.yFt, zFt: 0, headingRad: blue.headingRad, pitchRad: 0 },
    red: { xFt: red.xFt, yFt: red.yFt, zFt: redZFt, headingRad: red.headingRad, pitchRad: 0 },
  };
  if (turnsNow && vertical) {
    state.blue.pitchRad = degToRad(s.bluePitchDeg);
    state.red.pitchRad = degToRad(s.redPitchDeg);
  }
  if (turnsNow) checkNoseAtStart(state);
  return state;
}

/**
 * Flies one aircraft forward for d seconds along its heading, its ground track
 * shrunk by cos(pitch) and climbing at speed × sin(pitch) (V6 lines 4248 and 4269).
 * Pitch counts only with Climb and dive on.
 */
function fly(p, perf, d, vertical) {
  const pitchRad = vertical ? p.pitchRad : 0;
  const cosPitch = Math.cos(pitchRad);
  p.xFt += Math.cos(p.headingRad) * perf.speedFtps * cosPitch * d;
  p.yFt += Math.sin(p.headingRad) * perf.speedFtps * cosPitch * d;
  p.zFt += vertical ? Math.sin(pitchRad) * perf.speedFtps * d : 0;
}

/**
 * The first aircraft whose nose is within 5° of the other is marked, once,
 * after the merge, with where both were at that moment (V6 `checkFirstNose`,
 * line 4241; the off-nose angle is `ataDeg`, 3D with Climb and dive on, Q51). V6 names the one with the smaller angle if both are within 5°
 * in the same step, which in an even fight is rounding noise. Q48 changes that
 * one thing: both within 5° in the same step is a tie, marked `both: true`.
 * `by` still names an aircraft for code that reads it ('blue' for a tie, never
 * rounding noise), and the line still runs from Blue to Red in that case.
 */
/** Marks first nose-on from the two off-nose angles when either is within FIRST_NOSE_DEG (both: a tie, Q48). */
function markFirstNose(state, blueOff, redOff) {
  if (!(blueOff <= FIRST_NOSE_DEG || redOff <= FIRST_NOSE_DEG)) return;
  const both = blueOff <= FIRST_NOSE_DEG && redOff <= FIRST_NOSE_DEG;
  const byBlue = both || blueOff <= FIRST_NOSE_DEG;
  const by = byBlue ? 'blue' : 'red';
  const other = byBlue ? 'red' : 'blue';
  state.firstNose = {
    by,
    both,
    timeSec: state.timeSec,
    from: { xFt: state[by].xFt, yFt: state[by].yFt },
    to: { xFt: state[other].xFt, yFt: state[other].yFt },
  };
}

function checkFirstNose(state) {
  if (!state.merged || state.firstNose) return;
  markFirstNose(state, ataDeg(state, state.blue, state.red), ataDeg(state, state.red, state.blue));
}

/** Rounding noise in an off-nose angle at the start (degrees): 5° less this counts as within 5°. */
const NOSE_EPS_DEG = 1e-9;

/** Closer than this (feet, straight line) at the moment the turns start, the jets are at one point and their line of sight is noise. */
export const COINCIDENT_FT = 10;

/**
 * First nose-on at the moment the turns start (TF3-3), for a start that is not head-on: a jet whose
 * off-nose angle is already within FIRST_NOSE_DEG counts at +0.0 s (Both if both), as in a stern chase,
 * where Blue has had Red on its nose the whole way. The head-on start is left alone, so V6's fight and
 * a head-on start with the turns at once are as they were. If the jets are within COINCIDENT_FT of each
 * other (a stern chase passes exactly through), the line of sight is the one from just before they
 * coincide: along the relative velocity, which straight flight makes exact.
 */
function checkNoseAtStart(state) {
  if (state.headOn || state.firstNose) return;
  const { blue, red, perf } = state;
  let blueOff, redOff;
  if (rangeFt(state) >= COINCIDENT_FT) {
    blueOff = ataDeg(state, blue, red);
    redOff = ataDeg(state, red, blue);
  } else {
    const dx = perf.blue.speedFtps * Math.cos(blue.headingRad) - perf.red.speedFtps * Math.cos(red.headingRad);
    const dy = perf.blue.speedFtps * Math.sin(blue.headingRad) - perf.red.speedFtps * Math.sin(red.headingRad);
    const length = Math.hypot(dx, dy);
    if (!(length > 0)) return;
    // Before the pass Red is ahead of Blue along (dx, dy), and Blue ahead of Red along the opposite.
    const toward = (p, sign) => ({ ...p, xFt: p.xFt + (sign * dx / length) * 100, yFt: p.yFt + (sign * dy / length) * 100 });
    blueOff = ataDeg(state, blue, toward(blue, 1));
    redOff = ataDeg(state, red, toward(red, -1));
  }
  // An angle within rounding noise of 5° counts as within it, so a start and its mirror image agree.
  markFirstNose(state, blueOff - NOSE_EPS_DEG, redOff - NOSE_EPS_DEG);
}

/**
 * Turns one aircraft toward the other at no more than its turn rate, and with
 * Climb and dive on pitches toward it at the same rate within ±60°
 * (V6 lines 4260 to 4262 for the first nose-on aircraft, 4263 to 4265 for the other).
 */
function chaseOther(p, other, turnRateRadPerSec, d, vertical) {
  const dx = other.xFt - p.xFt, dy = other.yFt - p.yFt, dz = other.zFt - p.zFt;
  const desired = lineOfSightRad(p, other);
  const err = wrapPi(desired - p.headingRad), maxTurn = turnRateRadPerSec * d;
  p.headingRad = wrapPi(p.headingRad + Math.max(-maxTurn, Math.min(maxTurn, err)));
  if (vertical) {
    const dp = Math.atan2(dz, Math.hypot(dx, dy));
    p.pitchRad += Math.max(-maxTurn, Math.min(maxTurn, dp - p.pitchRad));
    p.pitchRad = Math.max(-MAX_CHASE_PITCH_RAD, Math.min(MAX_CHASE_PITCH_RAD, p.pitchRad));
  }
}

/**
 * One whole step of FIGHT_STEP_SEC (V6 `step`, lines 4242 to 4274). The step
 * that reaches the merge is cut there: the aircraft fly to the merge point,
 * meet at the centre, take their set pitch, and the rest of the step is flown
 * as the first step of the turns (with the centre start they are there already,
 * within a billionth of a foot; the snap makes it exact, and it is what `v6Start`
 * still needs, since V6's start was off-centre at unequal speeds). V6 line 4251,
 * `if(d===0){S.done=true;continue}`,
 * has no effect (d is 0 only when the merge has been reached, which has already
 * set `done`, and the `continue` is the last statement), so it is not ported.
 */
function stepOnce(state) {
  const { perf, setup } = state;
  const { blue, red } = state;
  const vertical = setup.vertical;
  for (let r = FIGHT_STEP_SEC; r > 1e-8;) {
    let d = Math.min(FIGHT_STEP_SEC, r);
    if (!state.merged && state.timeSec + d >= state.mergeSec) d = Math.max(0, state.mergeSec - state.timeSec);
    if (!state.merged) {
      fly(blue, perf.blue, d, vertical);
      fly(red, perf.red, d, vertical);
      state.timeSec += d; r -= d;
      if (state.timeSec >= state.mergeSec - 1e-6) {
        state.merged = true;
        if (state.headOn) { blue.xFt = 0; blue.yFt = 0; red.xFt = 0; red.yFt = 0; }
        if (vertical) {
          blue.pitchRad = degToRad(setup.bluePitchDeg);
          red.pitchRad = degToRad(setup.redPitchDeg);
        } else {
          blue.pitchRad = 0; red.pitchRad = 0;
        }
        checkNoseAtStart(state);
      }
    } else {
      const oneCircle = setup.circles === 1;
      const { turnDir } = state;
      if (setup.chase && state.firstNose && state.firstNose.by !== 'both') {
        const first = state.firstNose.by, second = first === 'blue' ? 'red' : 'blue';
        chaseOther(state[first], state[second], perf[first].rateRadPerSec, d, vertical);
        const dir = second === 'blue' ? turnDir.blue : (oneCircle ? -turnDir.red : turnDir.red);
        state[second].headingRad = wrapPi(state[second].headingRad + dir * perf[second].rateRadPerSec * d);
      } else if (setup.chase && state.firstNose && state.firstNose.by === 'both') {
        chaseOther(blue, red, perf.blue.rateRadPerSec, d, vertical);
        chaseOther(red, blue, perf.red.rateRadPerSec, d, vertical);
      } else {
        // Blue turns counter-clockwise; Red the same way in a 2-circle fight, the other way in a 1-circle fight.
        // (Each turns toward the other: +1 is left. At head-on that is V6's way, Blue and Red both left.)
        blue.headingRad += turnDir.blue * perf.blue.rateRadPerSec * d;
        red.headingRad += (oneCircle ? -turnDir.red : turnDir.red) * perf.red.rateRadPerSec * d;
      }
      fly(blue, perf.blue, d, vertical);
      fly(red, perf.red, d, vertical);
      state.timeSec += d; r -= d; checkFirstNose(state);
    }
  }
}

/**
 * Moves the fight forward by `dtSec` seconds of fight time, in whole steps of
 * FIGHT_STEP_SEC. Time that doesn't fill a step is kept in `state.carrySec` for
 * the next call, so the result doesn't depend on the frame rate. At
 * FIGHT_MAX_SEC the fight stops (`state.stopped`) and later calls do nothing.
 * Changes `state` in place and returns it. A zero, negative or non-finite
 * `dtSec` moves nothing.
 */
export function stepFight(state, dtSec) {
  if (state.stopped || !(dtSec > 0) || !Number.isFinite(dtSec)) return state;
  state.carrySec += dtSec;
  // The small margin lets fifty frames of 1/50 s make fifty steps, not forty-nine.
  const steps = Math.floor(state.carrySec / FIGHT_STEP_SEC + 1e-9);
  state.carrySec = Math.max(0, state.carrySec - steps * FIGHT_STEP_SEC);
  for (let i = 0; i < steps; i++) {
    stepOnce(state);
    if (state.timeSec >= FIGHT_MAX_SEC - 1e-6) {
      state.stopped = true;
      state.carrySec = 0;
      break;
    }
  }
  return state;
}
