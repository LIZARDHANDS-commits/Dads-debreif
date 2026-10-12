// Angles, headings and bearings.
//
// THE HEADING CONVENTION used everywhere inside the code:
//   A heading is a math angle in radians. 0 points east (+x), angles grow
//   counter-clockwise, so π/2 points north (+y). The world is north-up with
//   +y north, and x/y are in feet: a heading is Math.atan2(dy, dx).
//
// Only the screen shows compass headings (000 = north, 090 = east, clockwise).
// Convert at the edge with compassDegToHeadingRad / headingRadToCompassDeg.
// The Traffic Sim lays out its routes in compass degrees (unitVectorFromCompassDeg,
// compassDegFromVector, wrapDeg360).

/** Radians per degree: multiply degrees by it (the Formation Sim's one copy, refactor step 2). */
export const DEG = Math.PI / 180;

/** Degrees per radian: multiply radians by it (Traffic's PFL, refactor step 2). */
export const RAD = 180 / Math.PI;

export function degToRad(deg) {
  return deg * Math.PI / 180;
}

export function radToDeg(rad) {
  return rad * 180 / Math.PI;
}

/**
 * Wraps degrees into [-180, 180].
 * Needs a finite input: the loop never ends for ±Infinity.
 */
export function wrapDeg180(deg) {
  while (deg > 180) deg -= 360;
  while (deg < -180) deg += 360;
  return deg;
}

/**
 * Wraps radians into [-π, π].
 * Needs a finite input: the loop never ends for ±Infinity.
 */
export function wrapPi(rad) {
  while (rad > Math.PI) rad -= Math.PI * 2;
  while (rad < -Math.PI) rad += Math.PI * 2;
  return rad;
}

/** Signed difference a - b in radians, in [-π, π]. */
export function angleDiffRad(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

/** Size of an angle in degrees, 0 to 180. */
export function absAngleDeg(rad) {
  return Math.abs(radToDeg(wrapPi(rad)));
}

/** Heading in radians of the line from p0 to p1. */
export function headingRad(p0, p1) {
  return Math.atan2(p1.y - p0.y, p1.x - p0.x);
}

/**
 * Bearing of b from aircraft a, relative to a's nose, in degrees, -180 to 180.
 * Positive is to the left, because headings grow counter-clockwise.
 * a = {x, y, hdg}.
 */
export function relativeBearingDeg(a, b) {
  const brg = Math.atan2(b.y - a.y, b.x - a.x);
  return wrapDeg180(radToDeg(brg - a.hdg));
}

/**
 * Clock position to a relative bearing in degrees, using the same sign as
 * relativeBearingDeg: 12 = 0, 3 = -90 (right), 9 = 90 (left), 6 = ±180.
 * Half hours work (5.5 = 5:30). Anything unreadable is 12 o'clock.
 */
export function clockToRelativeDeg(clock) {
  let c = parseFloat(clock);
  if (!Number.isFinite(c)) c = 12;
  if (c === 12) return 0;
  return wrapDeg180(-c * 30);
}

/**
 * Aspect angle of a wingman seen from lead, in degrees: 0 = wingman in
 * trail at lead's tail, 90 = on lead's 3/9 line, 180 = on lead's nose.
 * Null if anything is missing. Geometry.
 */
export function aspectAngleDeg(observer, target, observerHeading) {
  if (!observer || !target || !Number.isFinite(observerHeading)) return null;
  const observerToTarget = Math.atan2(target.y - observer.y, target.x - observer.x);
  return 180 - absAngleDeg(observerToTarget - observerHeading);
}

/** Heading crossing angle (HCA) in degrees, 0 to 180. */
export function headingCrossAngleDeg(h1, h2) {
  if (!Number.isFinite(h1) || !Number.isFinite(h2)) return null;
  return absAngleDeg(h2 - h1);
}

/** The angle between two 3-D vectors in degrees, 0 to 180; null when either has no length. */
function angleBetween3dDeg(a, b) {
  const la = Math.hypot(a.x, a.y, a.z), lb = Math.hypot(b.x, b.y, b.z);
  if (!(la > 0) || !(lb > 0)) return null;
  const c = (a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb);
  return radToDeg(Math.acos(Math.min(1, Math.max(-1, c))));
}

/** 3-D aspect angle in degrees, 0 to 180: from the target's tail to the observer along the target's velocity (0 directly behind, 180 in front; SMM 16.16 para 40b). Positions { x, y, z }, velocity { x, y, z }. */
export function aspectAngle3dDeg(observer, target, targetVel) {
  if (!observer || !target || !targetVel) return null;
  return angleBetween3dDeg(targetVel, { x: target.x - observer.x, y: target.y - observer.y, z: (target.z ?? 0) - (observer.z ?? 0) });
}

/** 3-D heading crossing angle in degrees, 0 to 180: the angle between the two velocity vectors (SMM 16.16 para 40c). */
export function headingCrossAngle3dDeg(v1, v2) {
  if (!v1 || !v2) return null;
  return angleBetween3dDeg(v1, v2);
}

/** Compass heading in degrees (000 = north, clockwise) to a code heading in radians. */
export function compassDegToHeadingRad(compassDeg) {
  return degToRad(90 - compassDeg);
}

/** Code heading in radians to a compass heading in degrees, from 0 up to (not including) 360. */
export function headingRadToCompassDeg(rad) {
  const deg = (90 - radToDeg(rad)) % 360;
  const wrapped = deg < 0 ? deg + 360 : deg;
  // A heading a hair west of north rounds up to 360, and % can give -0: both are north.
  return wrapped >= 360 || wrapped === 0 ? 0 : wrapped;
}

/**
 * Unit vector, north-up (+y north), for a compass heading in degrees.
 * A screen that draws with y pointing down flips y itself.
 */
export function unitVectorFromCompassDeg(compassDeg) {
  const r = (90 - compassDeg) * Math.PI / 180;
  return { x: Math.cos(r), y: Math.sin(r) };
}

/** Compass degrees wrapped into 0 up to (not including) 360. */
export function wrapDeg360(deg) {
  return ((deg % 360) + 360) % 360;
}

/**
 * Compass bearing in degrees (000 north, clockwise) of a vector dx east, dy
 * north, in feet. The Traffic Sim lays out its routes this way.
 */
export function compassDegFromVector(dx, dy) {
  return wrapDeg360(radToDeg(Math.atan2(dx, dy)));
}
