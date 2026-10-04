// Geometry the Energy fight reads from the point-mass state: vectors, the real horizon's frame, the carried
// bank and the bank from the real horizon, and the angles between two aircraft. Pure; nothing here decides.
//
// Bank. The point-mass step measures bank from its own `up`, carried through a
// loop so it never divides by cos 90°. `ac.bankRad` is that carried bank (right
// wing down positive), which is continuous through the vertical. The readout
// `bankDeg` is the bank from the real horizon, toward the turn, worked out in
// `physicalBankDeg`. Moves that go over the top (pitch back, Immelmann, split S)
// hold a carried bank; the MPT holds a real-horizon bank.
import { wrapPi, radToDeg } from '../../../core/angles.js';

// ── Small vector helpers (the point-mass step's own are private) ─────────────

export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const len = (a) => Math.sqrt(dot(a, a));
export const scale = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const unit = (a) => scale(a, 1 / len(a));
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const velOf = (pm) => ({ x: pm.vx, y: pm.vy, z: pm.vz });
export const posOf = (pm) => ({ x: pm.x, y: pm.y, z: pm.z });

/** Straight-line interpolation through (x0, y0) and (x1, y1), held at both ends. */
export function lerpHeld(x, x0, y0, x1, y1) {
  const t = clamp((x - x0) / (x1 - x0), 0, 1);
  return y0 + (y1 - y0) * t;
}

/**
 * The real horizon's frame for an aircraft: up square to the path, left square
 * to both, and the carried right. Within 15° of straight up or down the horizon
 * gives no reference, so the carried up stands in and `nearVertical` is set.
 */
export function horizonFrame(pm) {
  const vHat = unit(velOf(pm));
  const c = vHat.z;
  const cosGamma = Math.sqrt(Math.max(0, 1 - c * c));
  let upH = pm.up;
  if (cosGamma > 0.26) {
    // The real horizon's up, square to the path. It flips sign over the top, which the carried one does not.
    upH = unit({ x: -c * vHat.x, y: -c * vHat.y, z: 1 - c * vHat.z });
  }
  const leftH = cross(upH, vHat);
  return { vHat, upH, leftH, rightC: cross(vHat, pm.up), nearVertical: cosGamma <= 0.26 };
}

/** The carried bank as a bank from the real horizon, toward the turn direction, in degrees (-180 to 180). */
export function physicalBankDeg(pm, bankRad, dir) {
  const fr = horizonFrame(pm);
  const lift = add(scale(pm.up, Math.cos(bankRad)), scale(fr.rightC, Math.sin(bankRad)));
  return radToDeg(Math.atan2(dot(lift, scale(fr.leftH, dir || 1)), dot(lift, fr.upH)));
}

/** The carried bank that puts the lift `betaRad` from the real horizon toward the turn direction. */
export function carriedBankFor(pm, betaRad, dir) {
  const fr = horizonFrame(pm);
  const lift = add(scale(fr.upH, Math.cos(betaRad)), scale(fr.leftH, Math.sin(betaRad) * dir));
  return Math.atan2(dot(lift, fr.rightC), dot(lift, pm.up));
}

/** Angle in degrees between an aircraft's nose (its velocity) and the line to another, in 3D; 180 when they are on top of each other. */
export function noseAngleDeg(from, to) {
  const los = sub(posOf(to.pm), posOf(from.pm));
  const d = len(los);
  if (d < 1) return 180;
  return radToDeg(Math.acos(clamp(dot(unit(velOf(from.pm)), scale(los, 1 / d)), -1, 1)));
}

/** +1 when the other is on this aircraft's left in the ground plane, -1 on its right, 0 when dead ahead or astern (a tie). */
export function sideOfOther(from, other) {
  const a = Math.atan2(other.pm.y - from.pm.y, other.pm.x - from.pm.x);
  const s = Math.sin(a - from.headingRad);
  return Math.abs(s) < 1e-6 ? 0 : Math.sign(s);
}

/** The sign of the carried bank that rolls the lift toward the turn side, now (it flips with the carried frame over the top). */
export function rollSideSign(ac) {
  const fr = horizonFrame(ac.pm);
  if (fr.nearVertical) return -(ac.turnDir || 1);
  return Math.sign(dot(scale(fr.leftH, ac.turnDir || 1), fr.rightC)) || 1;
}

/** True once the path has gone through the vertical since the move began: the carried frame has turned over. */
export function passedVertical(ac) {
  return (Math.sign(ac.pm.up.z) || 1) !== ac.ctl.upZ0;
}

/** Horizontal azimuth off-nose angle (degrees, 0-180). */
export function noseOffAzDeg(from, to) {
  const dx = to.xFt - from.xFt, dy = to.yFt - from.yFt;
  return radToDeg(Math.abs(wrapPi(Math.atan2(dy, dx) - from.headingRad)));
}

export function readPair(state) {
  const { blue, red } = state;
  state.rangeFt = len(sub(posOf(red.pm), posOf(blue.pm)));
  state.ataBlueDeg = noseAngleDeg(blue, red);
  state.ataRedDeg = noseAngleDeg(red, blue);
  state.aaDeg = 180 - state.ataRedDeg;
  state.headingCrossDeg = Math.abs(radToDeg(wrapPi(red.headingRad - blue.headingRad)));
}
