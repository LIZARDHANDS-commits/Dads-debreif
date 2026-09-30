// Turn performance: how steep, how tight and how fast an aircraft turns at a
// given speed and G, in a level turn.
//
// V6 has three copies of this physics: Turn Sim (lines 787 to 789), Turn Fight
// (`M`, line 4237) and the Traffic page (`bankFromG` and `turnRadiusFromG`,
// lines 147 and 148). They agree, except that each limits G its own way (see
// limitG) and Turn Fight works out the turn rate in a different order, which
// changes the last digit only (see turnRateRadPerSec).
//
// Speeds are true airspeed in feet per second (units.ktToFtps). G is the load
// factor; a level turn needs more than 1 G.
//
// Line numbers refer to original/shell.html unless a sub-page is named.
import { G_FTPS2 } from './units.js';
import { radToDeg } from './angles.js';

/** The least G V6 lets any turn use: at exactly 1 G there is no turn. */
export const MIN_TURN_G = 1.01;

/**
 * Keeps G between MIN_TURN_G and maxG, as V6 does before turning.
 * Turn Fight and Turn Sim have no upper limit; the Traffic page uses maxG = 9.
 * (The Traffic page also reads an empty or zero G box as 2 G: `+g || 2`.)
 */
export function limitG(g, maxG = Infinity) {
  return Math.max(MIN_TURN_G, Math.min(maxG, g));
}

/** Bank angle in degrees for a level turn at g (Turn Sim `bankFromG`, line 788). */
export function bankDegFromG(g) {
  return radToDeg(Math.acos(1 / g));
}

/**
 * Turn radius in feet (Turn Sim `turnRadius`, line 788).
 * G below 1 gives NaN, as in V6: callers limit G first (limitG).
 */
export function turnRadiusFt(speedFtps, g) {
  return speedFtps * speedFtps / (G_FTPS2 * Math.sqrt(g * g - 1));
}

/**
 * Turn rate in radians per second (Turn Sim `turnRate`, line 789).
 * Turn Fight computes the same rate as g·√(G²−1)/v, which differs from this in
 * the last digit for about a third of inputs; nothing it shows changes.
 */
export function turnRateRadPerSec(speedFtps, g) {
  return speedFtps / turnRadiusFt(speedFtps, g);
}
