// One pilot model (clean-up step 5, TS-141; Patrick 6 Oct 21:58Z "Start now"). Every planner that flies a wingman with
// held commands (the tracker, the rejoin law down the line, the turning rejoin's X law and hard pull, and through the
// tracker echelon to fighting wing and the opening out) says what it wants each step: an aim (the bank its heading loop
// asks for), a closure (the speed change it wants) and an energy intent (how far it may slow: power, the boards, idle). This
// file turns those into what the aircraft flies, one way for all of them:
//  - speed owned by the physics: the speed change is what the power gives against the drag at the G he pulls and the climb
//    he flies (full power to idle and the boards, slow-down.js; standard aerodynamics, dV/dt = g (T - D) / W - g sin(climb
//    angle)), built up at one jerk limit (moves.js POWER, the torque's travel, times the Rates profile's lever share). A
//    planner no longer writes a speed: it asks for an acceleration and gets what the aircraft can give;
//  - power with hysteresis: once the boards are out they stay out at least RATE_SET_SEC (rates.js; the throttle makes up
//    the difference), so the power word on the tag changes at a pilot's pace instead of flicking between steps;
//  - shaped roll: the bank asked for is rolled to at the Rates profile's share of the roll rate (the onset is the
//    aircraft's), with G built no faster than the profile's G onset (rates.js EXPERIENCE); the envelope gate (flight.js gateRoll) stays the one wall
//    behind it, the same for every level. Bank itself is never capped here (Patrick 6 Oct 04:07Z: no bank cap in
//    formation): only physics (stall, the 7 G limit) through the gate.
// It changes no flight physics: the step is flight.js's, the drag and thrust are core's and slow-down.js's, unchanged.
import { easeRoll, gFromBankDeg } from '../../../core/flight-math.js';
import { G_FTPS2 } from '../../../core/units.js';
import { STEP_SEC, stepAircraft, rollLimitAt } from './flight.js';
import { fullPowerKtps, slowKtps } from './slow-down.js';
import { powerFor, powerFrom, throttleFor } from './power.js';
import { POWER, FW_ENERGY, RATE_SET_SEC, experienceNow } from './tuning.js';

const dt = STEP_SEC;
/** From this share of full power's acceleration the power is MAX (power.js's MAX_FROM). */
const MAX_SHARE = 0.985;
/** Steeper than this the level-turn G is not this model's (flight.js's gate leaves it to the roll alone). */
const G_SHAPE_MAX_BANK_DEG = 85;

/** Sets the indicated airspeed and keeps the true airspeed in proportion (the height is held, so the ratio is constant). */
export function setKias(a, kias) {
  const ratio = a.tasFtps / a.kias;
  a.kias = kias;
  a.tasFtps = kias * ratio;
}

/** One step flown at a commanded bank, by the unchanged flight.js step (a never-finishing turn segment holds the bank target). */
export function stepCommanded(a, targetBankDeg, t, profile, accelKtps = null) {
  const dir = targetBankDeg < 0 ? -1 : 1;
  const segments = Math.abs(targetBankDeg) < 1e-9
    ? []
    : [{ kind: 'turn', toRad: a.headingRad + dir * Math.PI / 2, dir, bankDeg: Math.abs(targetBankDeg), rollOut: false }];
  stepAircraft(a, { segments, profile, accelKtps }, t);
}

/** The speed a climb of climbFtps costs, KIAS per second (standard energy: g·v / TAS, in KIAS). */
export function climbCostKtps(W, climbFtps) {
  return (G_FTPS2 * climbFtps) / Math.max(W.tasFtps, 1) / Math.max(W.tasFtps / Math.max(W.kias, 1), 1e-6);
}

/** The one jerk limit, KIAS per second per second: the torque's travel (moves.js POWER) at the Rates profile's lever share. */
export function pilotJerkKtps2() {
  return POWER.jerkKtps2 * experienceNow().leverShare;
}

/** How far above or below Lead the wingman uses the fighting wing cone's height, ft (FW_ENERGY.coneUpFt at the profile's share). */
export function coneUpFtNow() {
  return FW_ENERGY.coneUpFt * experienceNow().coneShare;
}

/**
 * A pilot for one dry run, starting from the aircraft as it is (Patrick 05:29Z: "stable means controlled, not stopped"): its
 * bank and roll rate, and the acceleration it already has (accelKtps, a hand-over's; 0 when not known).
 */
export function createPilot(W, { accelKtps = 0 } = {}) {
  return { accel: accelKtps, bank: W.bankDeg ?? 0, rate: W.rollRateDps ?? 0, stage: W.slowStage ?? null, stageSince: -Infinity, aMax: 0, top: 'power', floorThr: 0, climb: 0 };
}

/**
 * The speed part of a step: the acceleration asked for (aWant, KIAS per second) held inside what the aircraft gives (full
 * power up; down, the slowest of `top`, the energy intent: 'power', 'boards', 'idle' or 'idleBoards', with the torque
 * floor `floorThr`), at the G he pulls, plus any slowing a zoom gives (extraSlowKtps); built up at the one jerk limit. snapKias:
 * within TRACKER.kiasSnap of it the speed is taken there (the tracker's line up). Returns the commanded acceleration.
 */
export function pilotSpeed(p, W, aWant, { blockFt, top = 'power', floorThr = 0, climbKtps = null, extraSlowKtps = 0, snapKias = null, snapTol = 0 }) {
  const g = Math.max(1, Math.abs(W.g ?? 1));
  const climb = climbKtps ?? climbCostKtps(W, W.climbFtps ?? 0);
  const aMax = fullPowerKtps(W.kias, blockFt, g) - climb;
  const aMin = Math.min(7.95, slowKtps(top ?? 'power', W.kias, blockFt, g, floorThr) + climb + extraSlowKtps);
  const want = Math.max(-aMin, Math.min(aMax, aWant));
  const jerk = pilotJerkKtps2() * dt;
  p.accel += Math.max(-jerk, Math.min(jerk, want - p.accel));
  if (p.accel < -aMin && want <= -aMin) p.accel = -aMin;
  if (p.accel > aMax && want >= aMax) p.accel = aMax;
  let kias = W.kias + p.accel * dt;
  if (snapKias != null && Math.abs(snapKias - kias) < snapTol) {
    p.accel = (snapKias - W.kias) / dt;
  }
  Object.assign(p, { aMax, top: top ?? 'power', floorThr, climb });
  return p.accel;
}

/**
 * The roll part of a step: the bank asked for, rolled to at the profile's share of the roll rate (the pilot's within the
 * T-6A's, flight.js rollLimitAt; the roll onset the aircraft's own) with the level turn's G built no faster than the profile's G onset; then the step flown
 * through flight.js (and its envelope gate). Returns the bank commanded, for the replay.
 */
export function pilotFly(p, W, bankDeg, t, profile, accelKtps = p?.accel) {
  const X = experienceNow();
  const lim = rollLimitAt(W.tasFtps);
  const limits = { maxRateDps: lim.maxRateDps * X.rollShare, maxAccelDps2: lim.maxAccelDps2 };
  let r = easeRoll(p.bank, p.rate, bankDeg, dt, limits);
  if (Math.abs(r.bankDeg) > Math.abs(p.bank) && Math.abs(r.bankDeg) < G_SHAPE_MAX_BANK_DEG && Math.sign(r.bankDeg) === (Math.sign(p.bank) || Math.sign(r.bankDeg))) {
    const gMax = gFromBankDeg(p.bank) + X.gOnsetGps * dt;
    if (gFromBankDeg(r.bankDeg) > gMax + 1e-9) {
      const b = (Math.sign(r.bankDeg) * Math.acos(1 / gMax) * 180) / Math.PI;
      r = { bankDeg: b, rollRateDps: (b - p.bank) / dt };
    }
  }
  if (Math.abs(r.bankDeg - bankDeg) < 1e-6 && Math.abs(r.rollRateDps) <= limits.maxAccelDps2 * dt + 1e-9) r = { bankDeg, rollRateDps: 0 };
  p.bank = r.bankDeg;
  p.rate = r.rollRateDps;
  stepCommanded(W, p.bank, t, profile, accelKtps ?? p?.accel);
  return p.bank;
}

/**
 * The power the step was flown with (power.js: MAX, TQ nn%, + BOARDS, IDLE, IDLE+BOARDS), in Patrick's order of use (TS-61)
 * within the energy intent, with the boards held out at least RATE_SET_SEC once out (the throttle makes up the difference
 * while it can). t: the step's time.
 */
export function pilotPower(p, W, blockFt, t) {
  if (p.accel >= p.aMax * MAX_SHARE) return note(p, powerFrom(null, 1, W.kias, blockFt), t);
  const climbFtps = W.climbFtps ?? 0;
  let power = powerFor(p.accel, W.kias, blockFt, Math.abs(W.g ?? 1), climbFtps, p.top, p.floorThr);
  const held = t - p.stageSince < RATE_SET_SEC - 1e-9;
  if (held && p.stage === 'boards' && (power?.stage ?? null) === null) {
    const thr = throttleFor(p.accel, W.kias, blockFt, Math.abs(W.g ?? 1), climbFtps, 'boards');
    if (thr >= p.floorThr && thr <= 1) power = powerFrom('boards', thr, W.kias, blockFt);
  }
  // Between the slowing stages (the boards, idle, idle and the boards) he doesn't flick either (Patrick 6 Oct 22:45Z, the
  // jitters; TS-145): once in one he stays at least RATE_SET_SEC. Seen at the start of close moves as boards, idle, idle and
  // boards, idle, boards inside a quarter of a second. The speed is the physics' (pilotSpeed) either way; only the stage named differs.
  const SLOW = ['boards', 'idle', 'idleBoards'];
  if (held && SLOW.includes(p.stage) && SLOW.includes(power?.stage) && power.stage !== p.stage) {
    if (p.stage === 'boards') {
      const thr = throttleFor(p.accel, W.kias, blockFt, Math.abs(W.g ?? 1), climbFtps, 'boards');
      power = powerFrom('boards', Math.max(p.floorThr, Math.min(1, thr)), W.kias, blockFt);
    } else power = powerFrom(p.stage, 0, W.kias, blockFt);
  }
  return note(p, power, t);
}

function note(p, power, t) {
  const stage = power?.stage ?? null;
  if (stage !== p.stage) {
    p.stage = stage;
    p.stageSince = t;
  }
  return power;
}

/**
 * The whole step for a planner with no height of its own to work out from the speed: speed, roll and power. Returns
 * { bank, kias, power }, the replay's point.
 */
export function pilotStep(p, W, t, { bankDeg, aWant, profile, blockFt, top = 'power', floorThr = 0, climbKtps = null, extraSlowKtps = 0 }) {
  const accel = pilotSpeed(p, W, aWant, { blockFt, top, floorThr, climbKtps, extraSlowKtps });
  const bank = pilotFly(p, W, bankDeg, t, profile, accel);
  return { bank, accel, kias: W.kias, power: pilotPower(p, W, blockFt, t) };
}
