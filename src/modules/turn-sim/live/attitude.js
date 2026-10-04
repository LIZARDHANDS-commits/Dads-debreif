// Attitude in three dimensions for fluid manoeuvring (spec section 10.3, TS-57): a loop goes over the vertical and a
// barrel roll goes inverted, which the rest of the live code (a heading, a signed bank and a climb) cannot carry through.
// Here an aircraft's attitude is two unit vectors, its nose (the flight path) and its up (the lift), and this file turns
// them into the pose every other part of the Turn Sim reads ({ h, bank, pitch, roll, ... }, kinematic.js applyPose).
//
// Conventions as the rest of the live code: x east, y north, z up, feet and seconds; heading in math radians (0 east,
// counter-clockwise); bank signed, left wing down positive, -180 to 180 (180 is wings level inverted). The heading and
// bank are Euler angles: straight up or down they turn over by 180° together, which is the same attitude, so the 3D
// view (rotation heading, pitch, bank) draws it without a jump. Roll rate is measured on the aircraft itself (how fast
// the up vector tilts toward the left wing), so it has no jump there either.
import { pitchDegFromClimb } from '../../../core/t6-performance.js';
import { G_FTPS2 } from '../../../core/units.js';

export const dot3 = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const add3 = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub3 = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale3 = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const len3 = (a) => Math.sqrt(dot3(a, a));
export const cross3 = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const unit3 = (a) => {
  const m = len3(a);
  return m > 1e-12 ? scale3(a, 1 / m) : { x: 0, y: 0, z: 1 };
};
/** The part of `a` square to the unit vector `n`. */
export const perp3 = (a, n) => sub3(a, scale3(n, dot3(a, n)));
const DEG = Math.PI / 180;
const Z = Object.freeze({ x: 0, y: 0, z: 1 });

/** The left wing's direction for a nose and an up (x forward, y left, z up: left = up × nose). */
export const leftOf = (nose, up) => cross3(up, nose);

/**
 * The Euler angles of an attitude: { h, pitchFpDeg, bank } with h the heading of the nose (radians), pitchFpDeg the flight
 * path's angle above the horizon and bank (degrees, left wing down positive) measured from wings level with the nose
 * where it is. Straight up or down the heading comes from the up vector (the belly points back along the old heading).
 */
export function eulerOf(nose, up) {
  const horiz = Math.hypot(nose.x, nose.y);
  const pitchFpDeg = Math.atan2(nose.z, horiz) / DEG;
  const h = horiz > 1e-9 ? Math.atan2(nose.y, nose.x) : Math.atan2(-up.y * Math.sign(nose.z), -up.x * Math.sign(nose.z));
  const th = pitchFpDeg * DEG;
  const levelUp = { x: -Math.sin(th) * Math.cos(h), y: -Math.sin(th) * Math.sin(h), z: Math.cos(th) };
  const levelLeft = { x: -Math.sin(h), y: Math.cos(h), z: 0 };
  const bank = Math.atan2(dot3(up, levelLeft), dot3(up, levelUp)) / DEG;
  return { h, pitchFpDeg, bank };
}

/**
 * The lift and G of a flown path: from the acceleration `acc` (ft/s²) along a path with unit direction `nose`, the specific
 * force square to the path (the acceleration plus gravity's share) is the lift; its size over g is the G, its direction the
 * aircraft's up (a coordinated aircraft, standard aerodynamics). With almost no lift the up is kept from `prevUp`.
 */
export function liftOf(acc, nose, prevUp) {
  const f = perp3(add3(acc, scale3(Z, G_FTPS2)), nose);
  const m = len3(f);
  if (m < 0.15 * G_FTPS2) {
    const up = unit3(perp3(prevUp, nose));
    return { up, g: dot3(f, up) / G_FTPS2 };
  }
  const up = scale3(f, 1 / m);
  return { up, g: m / G_FTPS2 };
}

/**
 * A pose (kinematic.js applyPose) from a position (altAbove is the height above the block), a velocity and an up vector.
 * kias is the indicated airspeed at the aircraft's height; g its load factor; rollDps its roll rate (left wing down
 * positive). The pitch is the flight path plus the angle of attack's tilt, the shared formula flight.js uses, so a pose
 * here and a flight.js step agree in level flight (and nothing jumps at a hand-over).
 */
export function poseOf3d({ x, y, altAbove, vel, up, kias, g, rollDps }) {
  const tas = len3(vel);
  const nose = scale3(vel, 1 / Math.max(tas, 1e-9));
  const e = eulerOf(nose, up);
  const climb = vel.z;
  const pitch = pitchDegFromClimb(climb, tas, kias, g * Math.cos(e.bank * DEG));
  return { x, y, alt: altAbove, h: e.h, bank: e.bank, roll: rollDps, kias, tas, climb, pitch, g };
}

/** The roll rate between two attitudes dt apart (degrees per second, left wing down positive): how fast the up tilts toward the left wing. */
export function rollRateDps(noseA, upA, noseB, upB, dt) {
  const nose = unit3(add3(noseA, noseB));
  const up = unit3(add3(upA, upB));
  const left = leftOf(nose, up);
  return (dot3(sub3(upB, upA), left) / dt) / DEG;
}
