// The one T-6A performance model every module reads (SPEC-core, "API, fifth
// PR"; Patrick, 2026-09-30 06:58Z). V6 has none of this: it is new, checked
// against the T-6A's own charts (tests/unit/core/t6-performance.test.js). Each
// module keeps its own flying; this only holds the aircraft's numbers.
//
// Speeds are knots: KIAS where the charts use indicated airspeed, KTAS where
// the motion needs true airspeed. Altitudes are feet, pressure altitude on a
// standard day. G is the load factor.
import { G_FTPS2, KT_TO_FTPS } from './units.js';
import { isaDensityRatio } from './flight-math.js';

/**
 * The T-6A V-n diagram and airspeed limits (clean, 5,168 lb, maximum take-off weight).
 * stallKias is the V-n stall line's 1 G stall speed; the turn charts' lighter jet
 * stalls near 83 kt instead, which Dad is to pick between (SPEC-turn-fight).
 */
export const T6A_LIMITS = Object.freeze({
  maxG: 7, minG: -3.5, rollingMaxG: 4.7, rollingMinG: -1,
  stallKias: 86, voKias: 227, vmoKias: 316, weightLb: 5168,
});

/** The most G the wing gives at this speed before it stalls: (KIAS ÷ stall speed)². */
export function stallLimitG(kias, stallKias = T6A_LIMITS.stallKias) {
  return (kias / stallKias) ** 2;
}

/** The G the aircraft can pull now: the stall line, capped at +7 G (+4.7 G while rolling). */
export function availableG(kias, rolling = false, stallKias = T6A_LIMITS.stallKias) {
  return Math.min(stallLimitG(kias, stallKias), rolling ? T6A_LIMITS.rollingMaxG : T6A_LIMITS.maxG);
}

/** True airspeed from indicated: IAS ÷ √σ (standard atmosphere, no compressibility). */
export function iasToTasKt(kias, altFt) {
  return kias / Math.sqrt(isaDensityRatio(altFt));
}

/** Indicated airspeed from true: TAS × √σ. */
export function tasToIasKt(ktas, altFt) {
  return ktas * Math.sqrt(isaDensityRatio(altFt));
}

/** Energy height in feet: altitude + V²/2g, V true airspeed. */
export function energyHeightFt(altFt, ktas) {
  const v = ktas * KT_TO_FTPS;
  return altFt + v * v / (2 * G_FTPS2);
}
