// Angles, headings and bearings.
//
// THE HEADING CONVENTION used everywhere inside the code:
//   A heading is a math angle in radians. 0 points east (+x), angles grow
//   counter-clockwise, so π/2 points north (+y). The world is north-up with
//   +y north, and x/y are in feet. This is what V6's debrief, 3D view, EM
//   chart, Turn Sim and Turn Fight already do (they all use Math.atan2(dy, dx)).
//
// Only the screen shows compass headings (000 = north, 090 = east, clockwise).
// Convert at the edge with compassDegToHeadingRad / headingRadToCompassDeg.
// V6's Traffic page is the one place that works in compass degrees with
// screen y pointing down; see unitVectorFromCompassDeg.
//
// Line numbers refer to original/shell.html unless a sub-page is named.

export function degToRad(deg) {
  return deg * Math.PI / 180;
}

export function radToDeg(rad) {
  return rad * 180 / Math.PI;
}

/**
 * Wraps degrees into [-180, 180] (Turn Sim `normDeg`, line 1480).
 * Needs a finite input: like V6, the loop never ends for ±Infinity.
 */
export function wrapDeg180(deg) {
  while (deg > 180) deg -= 360;
  while (deg < -180) deg += 360;
  return deg;
}

/**
 * Wraps radians into [-π, π] (debrief `normAngleRad`, line 2706; the same loop
 * is Turn Fight's `wrapH` and, applied to a - b, the EM chart's `dAng`).
 * Needs a finite input: like V6, the loop never ends for ±Infinity.
 */
export function wrapPi(rad) {
  while (rad > Math.PI) rad -= Math.PI * 2;
  while (rad < -Math.PI) rad += Math.PI * 2;
  return rad;
}

/** Signed difference a - b in radians, in [-π, π] (debrief `angleDiffRad`, line 3139). */
export function angleDiffRad(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

/** Size of an angle in degrees, 0 to 180 (debrief `absAngleDeg`, line 2707). */
export function absAngleDeg(rad) {
  return Math.abs(radToDeg(wrapPi(rad)));
}

/** Heading in radians of the line from p0 to p1 (EM chart `hdg`, line 4155). */
export function headingRad(p0, p1) {
  return Math.atan2(p1.y - p0.y, p1.x - p0.x);
}

/**
 * Bearing of b from aircraft a, relative to a's nose, in degrees, -180 to 180.
 * Positive is to the left, because headings grow counter-clockwise.
 * a = {x, y, hdg}. (Turn Sim `relativeBearingDeg`, line 1477.)
 */
export function relativeBearingDeg(a, b) {
  const brg = Math.atan2(b.y - a.y, b.x - a.x);
  return wrapDeg180(radToDeg(brg - a.hdg));
}

/**
 * Clock position to a relative bearing in degrees, using the same sign as
 * relativeBearingDeg: 12 = 0, 3 = -90 (right), 9 = 90 (left), 6 = ±180.
 * Half hours work (5.5 = 5:30). Anything unreadable is 12 o'clock.
 * (Turn Sim `clockToRelativeDeg`, line 1481.)
 */
export function clockToRelativeDeg(clock) {
  let c = parseFloat(clock);
  if (!Number.isFinite(c)) c = 12;
  if (c === 12) return 0;
  return wrapDeg180(-c * 30);
}

/**
 * Aspect angle of a wingman seen from lead, in degrees, with V6's nose/tail
 * convention: 0 = wingman in trail at lead's tail, 90 = on lead's 3/9 line,
 * 180 = on lead's nose. Null if anything is missing.
 * (Debrief `aspectAngleDeg`, line 2708.)
 */
export function aspectAngleDeg(observer, target, observerHeading) {
  if (!observer || !target || !Number.isFinite(observerHeading)) return null;
  const observerToTarget = Math.atan2(target.y - observer.y, target.x - observer.x);
  return 180 - absAngleDeg(observerToTarget - observerHeading);
}

/** Heading crossing angle (HCA) in degrees, 0 to 180 (debrief line 2717). */
export function headingCrossAngleDeg(h1, h2) {
  if (!Number.isFinite(h1) || !Number.isFinite(h2)) return null;
  return absAngleDeg(h2 - h1);
}

/** Compass heading in degrees (000 = north, clockwise) to a code heading in radians. */
export function compassDegToHeadingRad(compassDeg) {
  return degToRad(90 - compassDeg);
}

/** Code heading in radians to a compass heading in degrees, 0 up to 360. */
export function headingRadToCompassDeg(rad) {
  const deg = (90 - radToDeg(rad)) % 360;
  return deg < 0 ? deg + 360 : deg;
}

/**
 * Unit vector, north-up (+y north), for a compass heading in degrees.
 * V6's Traffic page (`vFromHdg`, traffic line 150) returns the same vector
 * with y flipped, because it draws with screen y pointing down.
 */
export function unitVectorFromCompassDeg(compassDeg) {
  const r = (90 - compassDeg) * Math.PI / 180;
  return { x: Math.cos(r), y: Math.sin(r) };
}
