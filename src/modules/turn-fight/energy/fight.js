// The Energy fight as a whole: the start geometry, a new fight at T+0 (with the first moves planned), the
// turn directions at the pass, and one fight step: both aircraft, then the judge. Like sim.js it is a pure
// calculation with no page access: a plain setup goes in, a plain state comes out, moved in whole 0.02 s steps.
import { FT_PER_NM, KT_TO_FTPS } from '../../../core/units.js';
import { wrapPi, degToRad } from '../../../core/angles.js';
import { iasToTasKt } from '../../../core/t6-performance.js';
import { FIGHT_STEP_SEC, FIGHT_MAX_SEC } from '../sim.js';
import { MOVE_LABELS, need, checkedSetup } from './setup.js';
import { dot, sub, velOf, posOf, sideOfOther, readPair } from './frame.js';
import { newAircraft, readOut, stepAircraft } from './aircraft.js';
import { startMove } from './moves/index.js';
import { aimPoint } from './moves/pursuit.js';
import { chooseFirstMove, heldPick, startChases } from './pilot.js';
import { markFirstNose, markChase, checkWezGun, checkMidAirCollision } from './judge.js';

/**
 * Where the start puts both aircraft (SPEC-turn-fight, "Start geometry"):
 * Blue heads east; Red is `range` away (slant range, including the height
 * between them) at the off-nose angle (ATA) from Blue's nose, and Blue sits at
 * the aspect angle (AA) off Red's tail, on the side given. Both fly level at
 * their own height. The picture is then slid so the two are level with each
 * other at the pass, the closest point of approach, on the origin (at the
 * defaults that is the centre start, Q49).
 */
function placeStart(s, blueTas, redTas) {
  const rangeFt = s.separationNm * FT_PER_NM;
  const dz = s.redAltFt - s.blueAltFt;
  need(rangeFt > Math.abs(dz), `the range (${s.separationNm} NM, the separation) is more than the height between them`, dz);
  const horizontal = Math.sqrt(rangeFt * rangeFt - dz * dz);
  const sideOf = (side) => (side === 'left' ? 1 : -1);
  const bearingToRed = sideOf(s.ataSide) * degToRad(s.ataDeg);
  const bearingToBlue = bearingToRed + Math.PI;
  const redHeading = wrapPi(bearingToBlue - sideOf(s.aaSide) * (Math.PI - degToRad(s.aaDeg)));
  const blue = { x: 0, y: 0, z: s.blueAltFt, headingRad: 0, ktas: blueTas };
  const red = { x: horizontal * Math.cos(bearingToRed), y: horizontal * Math.sin(bearingToRed), z: s.redAltFt, headingRad: redHeading, ktas: redTas };
  // The pass point: where the two are closest, from their straight courses.
  const vb = { x: Math.cos(blue.headingRad) * blueTas, y: Math.sin(blue.headingRad) * blueTas, z: 0 };
  const vr = { x: Math.cos(red.headingRad) * redTas, y: Math.sin(red.headingRad) * redTas, z: 0 };
  const r = sub(posOf(red), posOf(blue)), v = sub(vr, vb);
  const vv = dot(v, v), rv = dot(r, v);
  const tca = vv > 0 && rv < 0 ? -rv / (vv * KT_TO_FTPS) : 0; // seconds
  const at = (a, vel) => ({ x: a.x + vel.x * KT_TO_FTPS * tca, y: a.y + vel.y * KT_TO_FTPS * tca });
  const b2 = at(blue, vb), r2 = at(red, vr);
  const cx = (b2.x + r2.x) / 2, cy = (b2.y + r2.y) / 2;
  blue.x -= cx; blue.y -= cy; red.x -= cx; red.y -= cy;
  return { blue, red };
}

/**
 * A new fight at T+0. `setup` is ENERGY_DEFAULT_SETUP with anything changed;
 * a bad number throws a RangeError naming it. Returns the state that
 * stepEnergyFight moves.
 */
export function createEnergyFight(setup = {}) {
  const s = checkedSetup(setup);
  const blueTas = iasToTasKt(s.blueKias, s.blueAltFt), redTas = iasToTasKt(s.redKias, s.redAltFt);
  const pose = placeStart(s, blueTas, redTas);
  const blue = newAircraft('blue', pose.blue, s, s.blueKias, s.blueForceG);
  const red = newAircraft('red', pose.red, s, s.redKias, s.redForceG);
  const state = {
    setup: s,
    timeSec: 0, carrySec: 0, merged: false, mergeSec: null, stopped: false,
    firstNose: null, chase: null, evenFight: false, plan: {},
    blue, red,
    rangeFt: 0, ataBlueDeg: 0, ataRedDeg: 0, aaDeg: 0, headingCrossDeg: 0,
  };
  readPair(state);
  // The moves Auto would pick show from the start, so the screen can say them before the turns begin.
  // The pass geometry (off-nose angle, turn directions) is read from a copy flown to the pass; the look-ahead's
  // races fly from a copy of T+0 itself, through the same steps the real fight takes (see noseOnSec).
  const start = structuredClone(state);
  const preview = structuredClone(state);
  atThePass(preview);
  const plan = {};
  start.plan = plan; // a race flies the other aircraft as it will really fly: its plan, once it has one
  const choose = (who) => chooseFirstMove(preview, preview[who], who === 'blue' ? preview.red : preview.blue, start);
  plan.blue = choose('blue');
  plan.red = choose('red');
  // Blue raced against the move a dry run would pick for Red. If Red's own pick, with its race, is another, Blue races
  // again against Red's plan, and Red's race (run against Blue's first pick) is run again against Blue's last, so the numbers in
  // Red's reason are the ones the fight flies. If Red's best move against Blue's last has changed, Red keeps the move it
  // picked (the two picks answer each other, and this ends it) and its reason says so.
  const redInBlueRace = chooseFirstMove({ ...preview, dry: true }, preview.red, preview.blue);
  if (plan.blue.race && plan.red.move !== redInBlueRace.move) {
    plan.blue = choose('blue');
    if (plan.red.race) {
      const again = choose('red');
      plan.red = again.move === plan.red.move ? again : heldPick(plan.red.move, again.race, preview.red.mergeKias, start.setup);
    }
  }
  for (const ac of [blue, red]) {
    const pick = plan[ac.who];
    ac.move = pick.move; ac.moveLabel = MOVE_LABELS[pick.move]; ac.why = pick.why;
  }
  state.plan = plan; // the turns start from exactly these picks; they are not worked out twice
  return state;
}

/** Flies the fight, as it stands, straight to the pass and works out the turn directions there: what the turns will start from. Used on a copy to show the first moves before the turns begin. */
function atThePass(state) {
  const tca = state.setup.turnsStart === 'now' ? 0 : secondsToPass(state);
  if (tca > 0) flyStraight(state, tca);
  chooseTurnDirections(state);
}

/**
 * Blue turns toward Red; in a 2-circle fight Red turns toward Blue, in a
 * 1-circle fight the other way. At a tie (head-on) V6's directions stand: Blue
 * counter-clockwise, Red counter-clockwise (2-circle) or clockwise (1-circle).
 */
function chooseTurnDirections(state) {
  const { blue, red, setup } = state;
  const blueToward = sideOfOther(blue, red) || 1;
  const redToward = sideOfOther(red, blue) || 1;
  blue.towardDir = blueToward; red.towardDir = redToward;
  blue.turnDir = blueToward;
  red.turnDir = setup.circles === 2 ? redToward : -redToward;
}

// ── The fight ───────────────────────────────────────────────────────────────

/**
 * Starts the turns: directions are set and each aircraft takes its first move
 * from the merge speed. `override` ({ who, move }) puts one aircraft in a given
 * move instead, for the look-ahead's dry runs.
 */
function startTurns(state, override = null) {
  chooseTurnDirections(state);
  for (const ac of [state.blue, state.red]) {
    const pick = override && override.who === ac.who
      ? { move: override.move, why: '' }
      : state.plan[ac.who] ?? chooseFirstMove(state, ac, ac === state.blue ? state.red : state.blue);
    startMove(state, ac, pick.move, pick.why, ac.mergeKias);
    ac.ctl.prevKias = ac.kias;
    ac.ctl.kiasRateEff = 0;
  }
  state.merged = true;
  state.mergeSec = state.timeSec;
}

/** The aim points the screen can draw: where each chaser is pointing the nose for the next step. */
function readAims(state) {
  for (const [ac, target] of [[state.blue, state.red], [state.red, state.blue]]) {
    if (ac.ctl.mode !== 'pursuit') { ac.aim = null; continue; }
    const aim = aimPoint(state.setup, target, ac);
    ac.aim = { xFt: aim.x, yFt: aim.y, zFt: aim.z };
  }
}

/** Before the turns: both fly straight and level at constant speed. */
export function flyStraight(state, d) {
  for (const ac of [state.blue, state.red]) {
    const pm = ac.pm;
    ac.pm = { ...pm, x: pm.x + pm.vx * d, y: pm.y + pm.vy * d, z: pm.z + pm.vz * d };
    readOut(ac, 1, 1, state.setup, null, !state.dry);
  }
}

/** Seconds from now to the closest approach on the present courses; 0 or less when the range is not closing. */
export function secondsToPass(state) {
  const r = sub(posOf(state.red.pm), posOf(state.blue.pm));
  const v = sub(velOf(state.red.pm), velOf(state.blue.pm));
  const vv = dot(v, v);
  if (vv < 1e-12) return 0;
  return -dot(r, v) / vv;
}

export function stepOnce(state) {
  let remaining = FIGHT_STEP_SEC;
  if (!state.merged) {
    const tca = state.setup.turnsStart === 'now' ? 0 : secondsToPass(state);
    if (tca > remaining) {
      flyStraight(state, remaining);
      state.timeSec += remaining;
      readPair(state);
      return;
    }
    // The pass falls in this step: fly to it, then the rest of the step is the first step of the turns.
    const toPass = Math.max(0, tca);
    if (toPass > 0) flyStraight(state, toPass);
    state.timeSec += toPass;
    remaining -= toPass;
    startTurns(state);
  }
  if (remaining > 1e-9) {
    const blue = state.blue, red = state.red;
    // Both read each other's state from before the step.
    const blueOther = { ...red, pm: red.pm }, redOther = { ...blue, pm: blue.pm };
    stepAircraft(state, blue, blueOther, remaining);
    stepAircraft(state, red, redOther, remaining);
    state.timeSec += remaining;
  }
  readPair(state);
  if (state.merged) {
    markFirstNose(state);
    if (state.setup.pursuit !== 'none') markChase(state, startChases(state));
  }
  // An even fight: both noses came on together and nobody has got behind the other (the result card says so, verification F4).
  state.evenFight = state.firstNose?.by === 'both' && !state.chase;
  readAims(state);
  checkWezGun(state, remaining);
  checkMidAirCollision(state, FIGHT_STEP_SEC);
}

/**
 * Moves the fight forward by `dtSec` seconds of fight time, in whole steps of
 * FIGHT_STEP_SEC (the remainder is kept in `state.carrySec`, as sim.js does). At
 * FIGHT_MAX_SEC the fight stops. Changes `state` in place and returns it. A
 * zero, negative or non-finite `dtSec` moves nothing.
 */
export function stepEnergyFight(state, dtSec) {
  if (state.stopped || !(dtSec > 0) || !Number.isFinite(dtSec)) return state;
  state.carrySec += dtSec;
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
