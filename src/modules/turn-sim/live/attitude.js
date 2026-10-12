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
import { DEG } from '../../../core/angles.js';
import { attitudeDegFromClimb } from '../../../core/t6-performance.js';
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
const Z = Object.freeze({ x: 0, y: 0, z: 1 });

/** The left wing's direction for a nose and an up (x forward, y left, z up: left = up × nose). */
export const leftOf = (nose, up) => cross3(up, nose);

/**
 * The Euler angles of an attitude: { h, pitchFpDeg, bank } with h the heading of the nose (radians), pitchFpDeg the flight
 * path's angle above the horizon and bank (degrees, left wing down positive) measured from wings level with the nose
 * where it is. Straight up or down the heading comes from the up vector (the belly points back along the old heading).
 */
function eulerOf(nose, up) {
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
  const pitch = attitudeDegFromClimb(climb, tas, kias, g * Math.cos(e.bank * DEG));
  // att: the wings' true attitude from the up vector, drawn as it is (kinematic.js applyPose): a roll through inverted stays
  // one smooth roll instead of being re-read from the lift line as a pull or a push.
  return { x, y, alt: altAbove, h: e.h, bank: e.bank, att: e.bank, roll: rollDps, kias, tas, climb, pitch, g };
}

/** The roll rate between two attitudes dt apart (degrees per second, left wing down positive): how fast the up tilts toward the left wing. */
export function rollRateDps(noseA, upA, noseB, upB, dt) {
  const nose = unit3(add3(noseA, noseB));
  const up = unit3(add3(upA, upB));
  const left = leftOf(nose, up);
  return (dot3(sub3(upB, upA), left) / dt) / DEG;
}

// ---- drawing between two steps ------------------------------------------------------------------
// The 3D view draws an aircraft with rotation.set(-bank, -pitch, heading) in order 'ZYX' (view3d.js aircraftPose), bank
// being a.attitudeDeg. Straight up or down those three angles turn over together by 180°, and wings level inverted the
// bank reads -180 one step and +180 the next: the same attitude each time, but blending the angles one by one between two
// steps draws a half or a whole roll inside one step (Patrick 11 Oct 2026 21:08Z: Lead "randomly spins around and is
// jerky" in the loop and aeros). So the blend turns each attitude into a rotation, goes the short way between them, and
// reads the angles back nearest the newer step's.

const quatMul = (a, b) => ({
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
});
/** The rotation Rz(h) Ry(-pitch) Rx(-bank) as a unit quaternion (the view's order). */
function quatOf(hRad, pitchDeg, bankDeg) {
  const half = (r) => ({ c: Math.cos(r / 2), s: Math.sin(r / 2) });
  const z = half(hRad);
  const y = half(-pitchDeg * DEG);
  const x = half(-bankDeg * DEG);
  return quatMul(quatMul({ w: z.c, x: 0, y: 0, z: z.s }, { w: y.c, x: 0, y: y.s, z: 0 }), { w: x.c, x: x.s, y: 0, z: 0 });
}
/** The short way from q0 to q1 by the share f (spherical, so the rotation turns at a steady rate). */
function slerp(q0, q1, f) {
  let d = q0.w * q1.w + q0.x * q1.x + q0.y * q1.y + q0.z * q1.z;
  const s1 = d < 0 ? -1 : 1;
  d = Math.abs(d);
  let k0 = 1 - f;
  let k1 = f;
  if (d < 0.9995) {
    const th = Math.acos(d);
    k0 = Math.sin((1 - f) * th) / Math.sin(th);
    k1 = Math.sin(f * th) / Math.sin(th);
  }
  const q = { w: k0 * q0.w + s1 * k1 * q1.w, x: k0 * q0.x + s1 * k1 * q1.x, y: k0 * q0.y + s1 * k1 * q1.y, z: k0 * q0.z + s1 * k1 * q1.z };
  const m = Math.hypot(q.w, q.x, q.y, q.z);
  return { w: q.w / m, x: q.x / m, y: q.y / m, z: q.z / m };
}
const wrap180 = (d) => d - 360 * Math.round(d / 360);

/** The angle (degrees) the drawn aircraft turns through between two attitudes { headingRad, pitchDeg, attitudeDeg }. */
export function drawnTurnDeg(a, b) {
  const qa = quatOf(a.headingRad, a.pitchDeg, a.attitudeDeg);
  const qb = quatOf(b.headingRad, b.pitchDeg, b.attitudeDeg);
  const d = Math.min(1, Math.abs(qa.w * qb.w + qa.x * qb.x + qa.y * qb.y + qa.z * qb.z));
  return (2 * Math.acos(d)) / DEG;
}

/**
 * The attitude the 3D view draws an aircraft at, { headingRad, pitchDeg, attitudeDeg } (the view's angles): its flight path
 * (headingRad, and the climb from climbFtps over tasFtps), its wings at wingsDeg about that path (left wing down positive,
 * the view's bank), and the nose tilted toward the lift by the angle of attack less the fuselage datum at its G (core
 * attitudeDegFromClimb, the same pilot's picture as the rest of the sim), the tilt made in the aircraft's own frame. Wings
 * level it is exactly the pitch the sim reads. Until 12 Oct 2026 the tilt was added to the Euler pitch, which reads over
 * by 180° at the vertical: the nose jumped 4-9° in one step there in every loop (J1, the Formation architecture review).
 * Drawing only: the heading, pitch and bank the sim flies and judges on are unchanged.
 */
export function drawnAttitudeOf(a, wingsDeg) {
  const tas = Math.max(a.tasFtps ?? 0, 1);
  const gam = Math.asin(Math.max(-1, Math.min(1, (a.climbFtps ?? 0) / tas)));
  const h = a.headingRad;
  const path = { x: Math.cos(gam) * Math.cos(h), y: Math.cos(gam) * Math.sin(h), z: Math.sin(gam) };
  // The path's level up and left (eulerOf's frame), so the wings at wingsDeg give the up eulerOf would read back.
  const levelUp = { x: -Math.sin(gam) * Math.cos(h), y: -Math.sin(gam) * Math.sin(h), z: Math.cos(gam) };
  const levelLeft = { x: -Math.sin(h), y: Math.cos(h), z: 0 };
  const phi = wingsDeg * DEG;
  const up = add3(scale3(levelUp, Math.cos(phi)), scale3(levelLeft, Math.sin(phi)));
  const tau = attitudeDegFromClimb(0, tas, a.kias, a.g ?? 1) * DEG;
  const nose = add3(scale3(path, Math.cos(tau)), scale3(up, Math.sin(tau)));
  const bodyUp = sub3(scale3(up, Math.cos(tau)), scale3(path, Math.sin(tau)));
  const e = eulerOf(nose, bodyUp);
  return { headingRad: e.h, pitchDeg: e.pitchFpDeg, attitudeDeg: e.bank };
}

/**
 * The attitude drawn a share f (0 to 1) of the way from step a to step b, each { headingRad, pitchDeg, attitudeDeg }: the
 * short way round as one rotation, read back as the view's angles. Of the two sets of angles for one attitude (h, p, bank)
 * and (h + 180°, 180° - p, bank + 180°), it returns the one nearer b's, so away from the vertical it is the plain blend.
 */
export function drawnAttitudeBetween(a, b, f) {
  const q = slerp(quatOf(a.headingRad, a.pitchDeg, a.attitudeDeg), quatOf(b.headingRad, b.pitchDeg, b.attitudeDeg), f);
  // ZYX (yaw, pitch, roll) angles of q; the view's pitch and bank are their negatives.
  const roll = Math.atan2(2 * (q.w * q.x + q.y * q.z), 1 - 2 * (q.x * q.x + q.y * q.y));
  const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (q.w * q.y - q.x * q.z))));
  const yaw = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
  const hDeg = yaw / DEG;
  const pDeg = -pitch / DEG;
  const bDeg = -roll / DEG;
  const bh = b.headingRad / DEG;
  const sets = [[hDeg, pDeg, bDeg], [hDeg + 180, 180 - pDeg, bDeg + 180]];
  const off = ([h, p, k]) => Math.abs(wrap180(h - bh)) + Math.abs(wrap180(p - b.pitchDeg)) + Math.abs(wrap180(k - b.attitudeDeg));
  const [h, p, k] = off(sets[0]) <= off(sets[1]) ? sets[0] : sets[1];
  return {
    headingRad: (bh + wrap180(h - bh)) * DEG,
    pitchDeg: b.pitchDeg + wrap180(p - b.pitchDeg),
    attitudeDeg: b.attitudeDeg + wrap180(k - b.attitudeDeg),
  };
}
