// The dynamic envelope gate for Traffic Sim (Traffic spec, ALL-28; Patrick, 6 Oct).
// Ensures aircraft maneuvering off-rail (breakouts, avoidance climbs, and path transitions)
// stay strictly within the T-6A physical envelope:
//  - roll rate scales with true airspeed (0.45°/s per knot TAS, capped at 120°/s);
//  - G onset rate is capped at the airframe ceiling (8 G/s, twice the normal 4 G/s pilot onset);
//  - bank is capped at the dynamic stall bank (acos(1 / stallLimitG(kias))).
import { KT_TO_FTPS } from '../../core/units.js';
import { easeRoll, gFromBankDeg } from '../../core/flight-math.js';
import { rollWithinT6A, rollLimitsAtKtasT6A, stallLimitG, T6A_G_ONSET } from '../../core/t6-performance.js';

/** Steeper than this the level-turn G (1 / cos bank) is not this model's: the gate holds the roll only. */
export const GATE_G_MAX_BANK_DEG = 85;

/**
 * The fastest the gate lets G build (G per second): twice the T-6A's normal onset (core T6A_G_ONSET, 4 G/s).
 * Patrick: 4 G/s is the normal pull, not a wall; the gate only stops a pull no pilot could make.
 */
export const G_ONSET_CEILING = 2 * T6A_G_ONSET.maxRateDps;

/**
 * The roll limits flown at a true airspeed (ft/s): the lower of the pilot's (`roll`) and the T-6A's own at that speed.
 * If roll is omitted or null, returns the T-6A's own roll limits at that speed.
 */
export function rollLimitAt(tasFtps, roll = null) {
  const ktas = tasFtps / KT_TO_FTPS;
  return roll ? rollWithinT6A(roll, ktas) : rollLimitsAtKtasT6A(ktas);
}

/**
 * The envelope gate: one step of the wings rolling toward targetDeg, held inside what a T-6A can do.
 *  - roll rate and roll onset: the lower of the pilot's (`roll`) and the T-6A's at this speed (rollLimitAt);
 *  - G onset: rolling steeper never builds the turn's G (1 / cos bank) faster than G_ONSET_CEILING (8 G/s);
 *  - stall: never steeper than the bank whose G the speed can give (core stallLimitG).
 * Returns easeRoll's { bankDeg, rollRateDps }.
 */
export function gateRoll(bankDeg, rollRateDps, targetDeg, dt, rollOrTasFtps, tasFtpsOrKias, kiasMaybe) {
  let roll, tasFtps, kias;
  if (typeof rollOrTasFtps === 'number' && kiasMaybe === undefined) {
    roll = null;
    tasFtps = rollOrTasFtps;
    kias = tasFtpsOrKias;
  } else {
    roll = rollOrTasFtps;
    tasFtps = tasFtpsOrKias;
    kias = kiasMaybe;
  }
  const limits = rollLimitAt(tasFtps, roll);
  const rate0 = Math.max(-limits.maxRateDps, Math.min(limits.maxRateDps, rollRateDps));
  if (!(dt > 0)) return { bankDeg, rollRateDps: rate0 };

  let target = targetDeg;
  const gStall = stallLimitG(kias);
  if (Math.abs(target) < GATE_G_MAX_BANK_DEG && gStall > 1) {
    const stallBank = (Math.acos(1 / gStall) * 180) / Math.PI;
    if (Math.abs(target) > stallBank) target = Math.sign(target) * stallBank;
  }
  const steeper = Math.abs(target) > Math.abs(bankDeg) && Math.sign(target) === (Math.sign(bankDeg) || Math.sign(target));
  if (!steeper || Math.abs(bankDeg) >= GATE_G_MAX_BANK_DEG) return easeRoll(bankDeg, rate0, target, dt, limits);

  // The roll rate that builds G at the onset limit, read a little ahead so the rate eases down smoothly
  const ahead = Math.min(GATE_G_MAX_BANK_DEG, Math.abs(bankDeg) + (rate0 * rate0) / (2 * limits.maxAccelDps2));
  const phi = (ahead * Math.PI) / 180;
  const gRate = Math.tan(phi) / Math.cos(phi); // G per radian of bank
  const capDps = gRate > 1e-9 ? ((G_ONSET_CEILING / gRate) * 180) / Math.PI : limits.maxRateDps;
  const r = easeRoll(bankDeg, rate0, target, dt, { maxRateDps: Math.min(limits.maxRateDps, Math.max(capDps, 1)), maxAccelDps2: limits.maxAccelDps2 });

  // Backstop: this step's G change held to the onset ceiling
  if (Math.abs(r.bankDeg) > Math.abs(bankDeg) && Math.abs(r.bankDeg) < GATE_G_MAX_BANK_DEG) {
    const gMax = gFromBankDeg(bankDeg) + G_ONSET_CEILING * dt;
    if (gFromBankDeg(r.bankDeg) > gMax + 1e-9) {
      const bank = Math.sign(r.bankDeg) * (Math.acos(1 / gMax) * 180) / Math.PI;
      return { bankDeg: bank, rollRateDps: (bank - bankDeg) / dt };
    }
  }
  return r;
}
