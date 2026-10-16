// The dynamic envelope gate for Traffic Sim (Traffic spec, ALL-28; Patrick, 6 Oct).
// Holds every roll the simulated pilot (circuit.js) and the path follower (path-follower.js) fly
// within the aircraft's physical envelope: its performance set (core aircraft-performance.js), the T-6A's unless a
// caller passes another (plan Step 5c Phase 1, so a CT-102B Astra II is held to its own stall line, not the T-6A's).
// With the T-6A's set:
//  - roll rate scales with true airspeed (0.45°/s per knot TAS, capped at 120°/s);
//  - G onset rate is capped at the airframe ceiling (8 G/s, twice the normal 4 G/s pilot onset);
//  - bank is capped at the dynamic stall bank (acos(1 / stallLimitG(kias))).
import { KT_TO_FTPS } from '../../core/units.js';
import { bankDegFromG, easeRoll, gFromBankDeg } from '../../core/flight-math.js';
import { T6A_PERFORMANCE, T6A_G_ONSET_CEILING_GPS } from '../../core/t6-performance.js';

/** Steeper than this the level-turn G (1 / cos bank) is not this model's: the gate holds the roll only. */
export const GATE_G_MAX_BANK_DEG = 85;

/**
 * The fastest the gate lets G build (G per second): core T6A_G_ONSET_CEILING_GPS, 6 G/s (ALL-40; it was twice the T-6A's normal 4 G/s).
 * Patrick: 4 G/s is the normal pull, not a wall; the gate only stops a pull no pilot could make.
 */
export const G_ONSET_CEILING = T6A_G_ONSET_CEILING_GPS; // core, 6 G/s (ALL-40; was 8, twice T6A_G_ONSET)

/**
 * The roll limits flown at a true airspeed (ft/s): the lower of the pilot's (`roll`) and the aircraft's own at that speed.
 * If roll is omitted or null, returns the aircraft's own roll limits at that speed. `perf` is the aircraft's performance
 * set (core aircraft-performance.js), the T-6A's unless given.
 */
export function rollLimitAt(tasFtps, roll = null, perf = T6A_PERFORMANCE) {
  const ktas = tasFtps / KT_TO_FTPS;
  return roll ? perf.rollWithin(roll, ktas) : perf.rollLimitsAtKtas(ktas);
}

/**
 * The envelope gate: one step of the wings rolling toward targetDeg, held inside what the aircraft can do.
 *  - roll rate and roll onset: the lower of the pilot's (`roll`) and the aircraft's at this speed (rollLimitAt);
 *  - G onset: rolling steeper never builds the turn's G (1 / cos bank) faster than G_ONSET_CEILING
 *    (6 G/s, core, ALL-40) for the T-6A, twice its normal onset for another aircraft;
 *  - stall: never steeper than the bank whose G the speed can give (the set's stallLimitG).
 * `roll` is the pilot's limits, or null for the aircraft's own; `tasFtps` true airspeed, ft/s; `kias` indicated, kt;
 * `perf` the aircraft's performance set, the T-6A's unless given (so every caller that passes none flies as before).
 * Returns easeRoll's { bankDeg, rollRateDps }.
 */
export function gateRoll(bankDeg, rollRateDps, targetDeg, dt, roll, tasFtps, kias, perf = T6A_PERFORMANCE) {
  const limits = rollLimitAt(tasFtps, roll, perf);
  const gOnsetCeiling = perf === T6A_PERFORMANCE ? G_ONSET_CEILING : 2 * perf.gOnset.maxRateDps; // ALL-40 for the T-6A
  const rate0 = Math.max(-limits.maxRateDps, Math.min(limits.maxRateDps, rollRateDps));
  if (!(dt > 0)) return { bankDeg, rollRateDps: rate0 };

  let target = targetDeg;
  const gStall = perf.stallLimitG(kias);
  if (Math.abs(target) < GATE_G_MAX_BANK_DEG && gStall > 1) {
    const stallBank = bankDegFromG(gStall);
    if (Math.abs(target) > stallBank) target = Math.sign(target) * stallBank;
  }
  const steeper = Math.abs(target) > Math.abs(bankDeg) && Math.sign(target) === (Math.sign(bankDeg) || Math.sign(target));
  if (!steeper || Math.abs(bankDeg) >= GATE_G_MAX_BANK_DEG) return easeRoll(bankDeg, rate0, target, dt, limits);

  // The roll rate that builds G at the onset limit, read a little ahead so the rate eases down smoothly
  const ahead = Math.min(GATE_G_MAX_BANK_DEG, Math.abs(bankDeg) + (rate0 * rate0) / (2 * limits.maxAccelDps2));
  const phi = (ahead * Math.PI) / 180;
  const gRate = Math.tan(phi) / Math.cos(phi); // G per radian of bank
  const capDps = gRate > 1e-9 ? ((gOnsetCeiling / gRate) * 180) / Math.PI : limits.maxRateDps;
  const r = easeRoll(bankDeg, rate0, target, dt, { maxRateDps: Math.min(limits.maxRateDps, Math.max(capDps, 1)), maxAccelDps2: limits.maxAccelDps2 });

  // Backstop: this step's G change held to the onset ceiling
  if (Math.abs(r.bankDeg) > Math.abs(bankDeg) && Math.abs(r.bankDeg) < GATE_G_MAX_BANK_DEG) {
    const gMax = gFromBankDeg(bankDeg) + gOnsetCeiling * dt;
    if (gFromBankDeg(r.bankDeg) > gMax + 1e-9) {
      const bank = Math.sign(r.bankDeg) * bankDegFromG(gMax);
      return { bankDeg: bank, rollRateDps: (bank - bankDeg) / dt };
    }
  }
  return r;
}
