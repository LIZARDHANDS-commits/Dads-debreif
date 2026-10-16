// The Run-in Simulator's pilot (spec, "How it flies"; RS-4): a small pilot built only from core pieces, the way Traffic's
// and the Formation's are. No new flight formula is written here: the aircraft is core's point mass (stepPointMass) on
// its performance set (aircraft.js), and the pilot only chooses the G, the bank and the throttle each step.
//
//  - What he wants: a lift vector (in G, world axes) from two parts. Up and down, the G that brings the flight path onto
//    a climb or dive angle (core dampedClimbG). Side to side, the pull of a pursuit of a point ahead on the line or the
//    circle he is holding (core liftTowardAim, with the gain 2 × ground speed ÷ distance that makes it the L1 path
//    follower, which holds a circle exactly: Park, Deyst and How 2004), worked out over the ground so the crab for the
//    wind comes by itself; the run-in's heading also comes from core windTriangle where a leg starts.
//  - What he does with it: core gAndBankForLift turns the lift into a G and a bank; the bank is flown with core easeRoll
//    inside the aircraft's roll limit (rollWithinT6A), the G with core easeValue inside the aircraft's G onset
//    (T6A_G_ONSET, under ALL-40's 6 G/s ceiling), and the G never passes the stall line (a physical limit, always held).
//    A big roll is flown unloaded (the G eased toward 1 G × cos(bank)) so the nose doesn't slice off sideways.
//  - Speed: the throttle held on the KIAS wanted by a proportional-plus-trim law, from idle to full.
//
// Every gain below is the module's own and an ESTIMATE (no manual gives a pilot's gains); none is a limit on the flying.
// Published limits (7 G, VMO) are never held here: the card flags them (RS-6).
import { stepPointMass, gAndBankForLift, liftTowardAim } from '../../core/point-mass.js';
import { easeRoll, easeValue, dampedClimbG } from '../../core/flight-math.js';
import { tasToIasKt } from '../../core/t6-performance.js';
import { wrapDeg180, degToRad, radToDeg } from '../../core/angles.js';
import { KT_TO_FTPS } from '../../core/units.js';

/** The pilot's own numbers: ESTIMATES, chosen for a firm, unhurried pilot. */
export const PILOT = Object.freeze({
  /** His roll: up to 90°/s, building at 270°/s² (inside the aircraft's at the speeds flown, rollWithinT6A). */
  roll: Object.freeze({ maxRateDps: 90, maxAccelDps2: 270 }),
  /** The most bank on the orbit, the turn to the IP and the run-in. */
  manoeuvreBankDeg: 45,
  /** The most G on those legs. */
  manoeuvreG: 3,
  /** The most G pulling onto the dive line (the roll-in), and the most "push" the roll-in asks for before rolling inverted. */
  rollInG: 3,
  /** The point he aims at sits this many seconds ahead on the line or circle (the L1 follower's distance). */
  lookaheadSec: 6,
  /** How briskly a climb or dive angle is captured, rad/s (dampedClimbG's omega). */
  climbOmega: 0.6,
  /** Onto the dive line: he starts the roll-in this long before reaching the line, s; aims this many seconds ahead on it; and
   * leads the capture by where the path will be this long ahead, s (so he rolls upright in time). */
  rollInLeadSec: 1.5,
  diveLookaheadSec: 3,
  diveLeadSec: 0.4,
  /** A height error is closed over about this long, s. */
  heightTimeSec: 12,
  /** The steepest climb or descent between legs, degrees. */
  maxClimbDeg: 10,
  /** The escape's climb back to its height, degrees. */
  escapeClimbDeg: 15,
  /** A roll more than unloadFromDeg from its bank starts to unload; by unloadToDeg it is fully unloaded. */
  unloadFromDeg: 20,
  unloadToDeg: 45,
  /** Below this much wanted lift (G) the wanted bank is not trusted, and the bank holds. */
  minLiftG: 0.25,
  /** Throttle per knot of airspeed error, and its trim's build per knot-second. */
  throttleKp: 0.04,
  throttleKi: 0.008,
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.sqrt(dot(a, a));
const scale = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

/** Air data of a state: true airspeed (ft/s and kt), KIAS at the day's density, the path and its climb angle. */
export function airData(s, sigmaAt) {
  const v = { x: s.vx, y: s.vy, z: s.vz };
  const vFtps = len(v);
  const ktas = vFtps / KT_TO_FTPS;
  return { vFtps, ktas, kias: tasToIasKt(ktas, s.z, sigmaAt(s.z)), vHat: scale(v, 1 / vFtps), climbRad: Math.asin(clamp(s.vz / vFtps, -1, 1)) };
}

/** The throttle that holds this speed in steady flight at this G: where the set's excess crosses zero between idle and full. */
export function trimThrottle(aircraft, ktas, altFt, g = 1) {
  const idle = aircraft.excessFn(0)(ktas, altFt, g);
  const full = aircraft.excessFn(1)(ktas, altFt, g);
  return full > idle ? clamp(-idle / (full - idle), 0, 1) : 1;
}

/** A pilot at the controls of state `s`: banked bankDeg, pulling g, the throttle at its trim. */
export function pilotAt(s, { aircraft, sigmaAt, bankDeg = 0, g = 1 }) {
  const a = airData(s, sigmaAt);
  const throttle = trimThrottle(aircraft, a.ktas, s.z, g);
  return { s, bankDeg, rollRateDps: 0, rollAccelDps2: 0, g, gRate: 0, gAccel: 0, throttle, trim: throttle };
}

/**
 * The lift (G, world axes) the pilot wants: up and down from the flight-path angle he wants over the ground
 * (`climbCmdRad`, through dampedClimbG); side to side from the pursuit of `aim` (a point over the ground, { x, y }) or a
 * set bank (`bankDeg`, right positive). vRange: [lowest, highest] up-and-down G (a roll-in may ask for less than 0: he
 * rolls over and pulls). maxBankDeg caps the side-to-side pull while the lift points up. leadSec: work on where the climb
 * angle is heading this long ahead.
 * @param {any} p
 * @param {{ wind: { x: number, y: number }, sigmaAt: (z: number) => number, climbCmdRad: number, aim?: { x: number, y: number } | null, bankDeg?: number | null, vRange?: number[], maxBankDeg?: number, leadSec?: number }} options
 */
export function wantedLift(p, { wind, sigmaAt, climbCmdRad, aim = null, bankDeg = null, vRange = [0.3, PILOT.manoeuvreG], maxBankDeg = PILOT.manoeuvreBankDeg, leadSec = 0 }) {
  const s = p.s;
  const a = airData(s, sigmaAt);
  const gx = s.vx + wind.x, gy = s.vy + wind.y;
  const groundH = Math.hypot(gx, gy);
  const airH = Math.hypot(s.vx, s.vy);
  // The flight-path angle over the ground he wants, as the angle through the air that gives it.
  const climbAir = Math.atan(Math.tan(climbCmdRad) * groundH / Math.max(airH, 1));
  // With a lead, the climb angle he works on is where the path is heading (its rate over the last step, p.climbRateRadPerSec).
  const climbSeen = a.climbRad + leadSec * (p.climbRateRadPerSec ?? 0);
  const nV = clamp(dampedClimbG(climbSeen, climbAir, a.vFtps, PILOT.climbOmega), vRange[0], vRange[1]);
  // His up (square to the path, in the vertical plane) and his right (level, square to the path).
  const eV = sub({ x: 0, y: 0, z: 1 }, scale(a.vHat, a.vHat.z));
  const eVl = len(eV) || 1;
  const up = scale(eV, 1 / eVl);
  const rl = Math.hypot(a.vHat.x, a.vHat.y) || 1;
  const right = { x: a.vHat.y / rl, y: -a.vHat.x / rl, z: 0 };
  let nLat = 0;
  if (aim) {
    const toAim = { x: aim.x - s.x, y: aim.y - s.y, z: 0 };
    const d = len(toAim);
    if (d > 1 && groundH > 1) {
      const gHat = { x: gx / groundH, y: gy / groundH, z: 0 };
      const { wanted, weightPerp } = liftTowardAim(gHat, toAim, groundH, (2 * groundH) / d);
      nLat = dot(sub(wanted, weightPerp), right);
    }
  } else if (bankDeg !== null) {
    nLat = nV * Math.tan(degToRad(bankDeg));
  }
  if (nV > 0) {
    const most = nV * Math.tan(degToRad(maxBankDeg));
    nLat = clamp(nLat, -most, most);
  }
  return { x: nV * up.x + nLat * right.x, y: nV * up.y + nLat * right.y, z: nV * up.z + nLat * right.z };
}

/**
 * One step of dt seconds. cmd: either { lift } (G, world axes; wantedLift) or { g, bankDeg } (the escape's pull and bank,
 * flown as set), with { kias } (the speed to hold) or { throttle } (0 idle to 1 full), and gMax (the pilot's own top G
 * for the leg; the stall line is held whatever it says). env: { aircraft, sigmaAt(z), windAt(z) → { x, y } ft/s }.
 * The new pilot carries the climb angle's rate over the step (climbRateRadPerSec), what he sees the nose doing.
 * Returns the next pilot and what limited him: { p, kias, stallHeld }.
 */
export function pilotStep(p, cmd, env, dt) {
  const { aircraft, sigmaAt, windAt } = env;
  const s = p.s;
  const a = airData(s, sigmaAt);
  let gWant;
  let bankWant;
  if (cmd.lift) {
    const along = dot(cmd.lift, a.vHat);
    const lift = sub(cmd.lift, scale(a.vHat, along)); // only the part square to the path is lift
    const gb = gAndBankForLift(lift, a.vHat, s.up, degToRad(p.bankDeg));
    gWant = gb.g;
    bankWant = gWant < PILOT.minLiftG ? p.bankDeg : radToDeg(gb.bankRad);
  } else {
    gWant = cmd.g;
    bankWant = cmd.bankDeg;
  }
  const bankTarget = p.bankDeg + wrapDeg180(bankWant - p.bankDeg);
  // A big roll is flown unloaded, then the pull comes on.
  if (cmd.lift) {
    const err = Math.abs(bankTarget - p.bankDeg);
    const k = clamp((err - PILOT.unloadFromDeg) / (PILOT.unloadToDeg - PILOT.unloadFromDeg), 0, 1);
    const unloaded = Math.min(gWant, Math.max(0, Math.cos(degToRad(p.bankDeg))));
    gWant += k * (unloaded - gWant);
  }
  if (Number.isFinite(cmd.gMax)) gWant = Math.min(gWant, cmd.gMax);
  const stallG = aircraft.stallG(a.kias);
  const stallHeld = gWant > stallG;
  gWant = Math.max(0, Math.min(gWant, stallG));

  const roll = easeRoll(p.bankDeg, p.rollRateDps, bankTarget, dt, aircraft.roll(PILOT.roll, a.ktas));
  const gEase = easeValue(p.g, p.gRate, gWant, dt, aircraft.gOnset);
  const g = Math.max(0, Math.min(gEase.bankDeg, stallG)); // the stall line falls as the speed bleeds: held, always
  const bankDeg = wrapDeg180(roll.bankDeg);

  let throttle;
  let trim = p.trim;
  if (Number.isFinite(cmd.throttle)) {
    throttle = clamp(cmd.throttle, 0, 1);
  } else {
    const err = cmd.kias - a.kias;
    trim = clamp(trim + PILOT.throttleKi * err * dt, 0, 1);
    throttle = clamp(trim + PILOT.throttleKp * err, 0, 1);
  }

  const w = windAt(s.z);
  // At idle (cmd.idle) the idle prop's drag counts too, where the aircraft has it (aircraft.js idleExcessFn).
  const excess = cmd.idle && aircraft.idleExcessFn ? aircraft.idleExcessFn : aircraft.excessFn(throttle);
  const next = stepPointMass(s, { g, bankRad: degToRad(bankDeg) }, dt, excess);
  next.x += w.x * dt; // the air moves the aircraft with it
  next.y += w.y * dt;
  return {
    p: {
      s: next, bankDeg, rollRateDps: roll.rollRateDps, rollAccelDps2: roll.rollAccelDps2,
      g, gRate: g === gEase.bankDeg ? gEase.rollRateDps : (g - p.g) / dt, gAccel: gEase.rollAccelDps2, throttle, trim,
      climbRateRadPerSec: (airData(next, sigmaAt).climbRad - a.climbRad) / dt,
    },
    kias: a.kias,
    stallHeld,
  };
}
