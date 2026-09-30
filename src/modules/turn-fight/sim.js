// The Turn Fight: two aircraft start head-on, fly to the merge, then turn.
// A pure calculation with no page access (SPEC-turn-fight, "The fight"): it
// takes a plain setup and moves a plain state, so the same numbers come out in
// Node and in the browser. It is V6's `bfmFight` script (original/shell.html,
// lines 4232 to 4294) ported as it is, in the same order of operations, and
// pinned to it by tests/golden/turn-fight-sim.test.js. The turn math itself
// comes from core.
//
// Units: feet, seconds, radians. Headings follow core's rule: 0 is east (+x),
// counter-clockwise is positive, so Blue (left of the start, heading east)
// turns left. Height is feet above the start height.
import { KT_TO_FTPS, FT_PER_NM } from '../../core/units.js';
import { limitG, turnRadiusFt, turnRateRadPerSec } from '../../core/flight-math.js';
import { wrapPi, absAngleDeg, headingRad, degToRad, radToDeg } from '../../core/angles.js';

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
 */
export const V6_DEFAULT_SETUP = Object.freeze({
  circles: 2,
  separationNm: 2,
  blueKt: 220,
  redKt: 220,
  blueG: 4,
  redG: 4,
  chase: false,
  vertical: false,
  bluePitchDeg: 0,
  redPitchDeg: 0,
});

/**
 * One aircraft's level turn at a speed and G (V6 `M`, line 4237): the G is
 * limited to 1.01 and up, radius is V²/(g√(G²−1)), rate is g√(G²−1)/V.
 * Core works the rate out as speed ÷ radius, which differs from V6's order in
 * the last digit only. `rateDegPerSec` is V6's `rate`.
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
 * right heading west, both level.
 *
 * `setup` is { circles: 1 | 2, separationNm, blueKt, redKt, blueG, redG, chase,
 * vertical, bluePitchDeg, redPitchDeg }; anything left out is V6's default
 * (V6_DEFAULT_SETUP). The setup is checked here, because a blank or
 * infinite number would never merge. Returns the state that stepFight moves.
 */
export function createFight(setup = {}) {
  const s = { ...V6_DEFAULT_SETUP, ...setup };
  need(s.circles === 1 || s.circles === 2, 'circles is 1 or 2', s.circles);
  need(Number.isFinite(s.separationNm) && s.separationNm > 0, 'separationNm is above 0', s.separationNm);
  need(Number.isFinite(s.blueKt) && s.blueKt > 0, 'blueKt is above 0', s.blueKt);
  need(Number.isFinite(s.redKt) && s.redKt > 0, 'redKt is above 0', s.redKt);
  need(Number.isFinite(s.blueG), 'blueG is a number', s.blueG);
  need(Number.isFinite(s.redG), 'redG is a number', s.redG);
  need(Number.isFinite(s.bluePitchDeg), 'bluePitchDeg is a number', s.bluePitchDeg);
  need(Number.isFinite(s.redPitchDeg), 'redPitchDeg is a number', s.redPitchDeg);
  const separationFt = s.separationNm * FT_PER_NM;
  return {
    setup: { ...s, chase: !!s.chase, vertical: !!s.vertical },
    perf: { blue: levelTurn(s.blueKt, s.blueG), red: levelTurn(s.redKt, s.redG) },
    mergeSec: mergeTimeSec(s.separationNm, s.blueKt, s.redKt),
    timeSec: 0,
    merged: false,
    stopped: false,
    carrySec: 0,
    firstNose: null,
    blue: { xFt: -separationFt / 2, yFt: 0, zFt: 0, headingRad: 0, pitchRad: 0 },
    red: { xFt: separationFt / 2, yFt: 0, zFt: 0, headingRad: Math.PI, pitchRad: 0 },
  };
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
 * line 4241). If both are within 5° in the same step, V6 names the one with
 * the smaller angle, which in an even fight is rounding noise (Q48 changes it).
 */
function checkFirstNose(state) {
  if (!state.merged || state.firstNose) return;
  const blueOff = offNoseDeg(state.blue, state.red);
  const redOff = offNoseDeg(state.red, state.blue);
  if (blueOff <= FIRST_NOSE_DEG || redOff <= FIRST_NOSE_DEG) {
    let byBlue;
    if (blueOff <= FIRST_NOSE_DEG && redOff <= FIRST_NOSE_DEG) byBlue = blueOff <= redOff;
    else byBlue = blueOff <= FIRST_NOSE_DEG;
    const by = byBlue ? 'blue' : 'red';
    const other = byBlue ? 'red' : 'blue';
    state.firstNose = {
      by,
      timeSec: state.timeSec,
      from: { xFt: state[by].xFt, yFt: state[by].yFt },
      to: { xFt: state[other].xFt, yFt: state[other].yFt },
    };
  }
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
 * as the first step of the turns.
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
        blue.xFt = 0; blue.yFt = 0; red.xFt = 0; red.yFt = 0;
        if (vertical) {
          blue.pitchRad = degToRad(setup.bluePitchDeg);
          red.pitchRad = degToRad(setup.redPitchDeg);
        } else {
          blue.pitchRad = 0; red.pitchRad = 0;
        }
      }
      if (d === 0) { state.merged = true; continue; }
    } else {
      const oneCircle = setup.circles === 1;
      if (setup.chase && state.firstNose) {
        const first = state.firstNose.by, second = first === 'blue' ? 'red' : 'blue';
        chaseOther(state[first], state[second], perf[first].rateRadPerSec, d, vertical);
        chaseOther(state[second], state[first], perf[second].rateRadPerSec, d, vertical);
      } else {
        // Blue turns counter-clockwise; Red the same way in a 2-circle fight, the other way in a 1-circle fight.
        blue.headingRad += perf.blue.rateRadPerSec * d;
        red.headingRad += (oneCircle ? -1 : 1) * perf.red.rateRadPerSec * d;
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
