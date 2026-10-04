// Wind: the crab and ground speed that hold a track. V6 has no wind; this is
// new for the Traffic Sim (SPEC-traffic, "Wind and aircraft types") and later
// the SOF crosswind (FF21). With the wind calm it gives V6's numbers exactly.
//
// Unlike the rest of core, these take compass degrees (000 north, 090 east),
// because a wind is given that way in a METAR and routes are laid out that
// way. Speeds are in knots. One steady wind: a direction it
// blows FROM, and a speed.
import { degToRad, radToDeg } from './angles.js';
import { ktToFtps } from './units.js';

/** 0 to 360. */
function wrap360(deg) {
  return ((deg % 360) + 360) % 360;
}

/**
 * The wind triangle for a straight leg.
 *
 * crosswind = W × sin(D − T), + from the right; headwind = W × cos(D − T),
 * − for a tailwind; crab = asin(crosswind ÷ TAS), + to the right (into a wind
 * from the right); heading = T + crab; ground speed = TAS × cos(crab) − headwind.
 *
 * When the crosswind is stronger than the airspeed, or the aircraft would make
 * no headway over the ground (a crosswind equal to the airspeed included), it
 * can't hold the track: canHoldTrack is false,
 * groundSpeedKt is 0 and, for a crosswind, the nose points straight into it
 * (crab ±90°). What to do then (the Traffic Sim crawls at 10 kt) is the screen's.
 *
 * @param {number} trackDeg    the track to hold over the ground, compass degrees
 * @param {number} tasKt       true airspeed, knots
 * @param {number} windFromDeg where the wind blows from, compass degrees true
 * @param {number} windKt      wind speed, knots
 * @returns {{crabDeg: number, headingDeg: number, groundSpeedKt: number, headwindKt: number,
 *   crosswindKt: number, canHoldTrack: boolean}}
 */
export function windTriangle(trackDeg, tasKt, windFromDeg, windKt) {
  const rel = degToRad(windFromDeg - trackDeg);
  // + 0 turns −0 into 0, so a calm wind gives exactly 0.
  const crosswindKt = windKt * Math.sin(rel) + 0;
  const headwindKt = windKt * Math.cos(rel) + 0;
  if (!(tasKt > 0 && Math.abs(crosswindKt) <= tasKt)) {
    const crabDeg = 90 * Math.sign(crosswindKt);
    return { crabDeg, headingDeg: wrap360(trackDeg + crabDeg), groundSpeedKt: 0, headwindKt, crosswindKt, canHoldTrack: false };
  }
  const crab = Math.asin(crosswindKt / tasKt);
  const crabDeg = radToDeg(crab);
  const groundSpeedKt = tasKt * Math.cos(crab) - headwindKt;
  const canHoldTrack = groundSpeedKt > 0;
  return { crabDeg, headingDeg: wrap360(trackDeg + crabDeg), groundSpeedKt: canHoldTrack ? groundSpeedKt : 0, headwindKt, crosswindKt, canHoldTrack };
}


/**
 * The wind as a vector in feet per second, x east and y north, pointing the
 * way the air moves (toward windFromDeg + 180). Add it to the aircraft's
 * velocity through the air to get its velocity over the ground.
 */
export function windVectorFtps(windFromDeg, windKt) {
  const blowTo = degToRad(windFromDeg + 180);
  const v = ktToFtps(windKt);
  return { x: v * Math.sin(blowTo), y: v * Math.cos(blowTo) };
}
