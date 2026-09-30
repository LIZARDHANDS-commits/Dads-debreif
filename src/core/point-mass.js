// The point-mass step: one aircraft as a point with a velocity, flown by G and
// bank, with thrust minus drag as a callback (SPEC-core, "API, fifth PR";
// the motion is SPEC-turn-fight's "The model (T-6A, point mass)").
//
// New math, nothing in V6 to pin. Positions in feet: x east, y north, z up
// (altitude). Velocity is true airspeed in feet per second. Heading is in math
// radians, counter-clockwise from east, as in the rest of core; a right bank
// turns clockwise.
//
// Bank is measured from the horizon: at 0 the lift points as far up as it can,
// square to the flight path. Straight up or down the horizon gives no
// reference, so the step keeps the last one (`up`); that is also how it knows,
// coming over the top of a loop, that the aircraft is upside down (up.z < 0).
import { G_FTPS2, KT_TO_FTPS } from './units.js';

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.sqrt(dot(a, a));
const scale = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** The aircraft's up, square to the flight path, kept pointing the same way as prevUp. */
function upFrom(vHat, prevUp) {
  const c = vHat.z;
  let u = { x: -c * vHat.x, y: -c * vHat.y, z: 1 - c * vHat.z };
  let m = len(u);
  if (m < 1e-9) {
    // Straight up or down: carry the last up across.
    const p = dot(prevUp, vHat);
    u = { x: prevUp.x - p * vHat.x, y: prevUp.y - p * vHat.y, z: prevUp.z - p * vHat.z };
    m = len(u);
  }
  u = scale(u, 1 / m);
  return dot(u, prevUp) < 0 ? scale(u, -1) : u;
}

/** Acceleration (ft/s²) and the up used, for velocity v. */
function accel(v, altFt, control, prevUp, excessFn) {
  const speed = len(v);
  const vHat = scale(v, 1 / speed);
  const up = upFrom(vHat, prevUp);
  const right = cross(vHat, up);
  const cb = Math.cos(control.bankRad), sb = Math.sin(control.bankRad);
  const lift = { x: cb * up.x + sb * right.x, y: cb * up.y + sb * right.y, z: cb * up.z + sb * right.z };
  const excess = excessFn(speed / KT_TO_FTPS, altFt, control.g);
  return {
    a: {
      x: G_FTPS2 * (control.g * lift.x + excess * vHat.x),
      y: G_FTPS2 * (control.g * lift.y + excess * vHat.y),
      z: G_FTPS2 * (control.g * lift.z + excess * vHat.z) - G_FTPS2,
    },
    up,
  };
}

const noExcess = () => 0;

/**
 * One step of dtSec (fourth-order Runge-Kutta).
 * state: { x, y, z, vx, vy, vz, up } (pointMassState makes one).
 * control: { g, bankRad } — G along the lift, bank from the horizon (right positive).
 * excessFn(ktas, altFt, g): (thrust − drag) ÷ weight; none by default.
 * Returns the new state; the old one is not changed.
 */
export function stepPointMass(state, control, dtSec, excessFn = noExcess) {
  const up0 = state.up;
  const p0 = { x: state.x, y: state.y, z: state.z };
  const v0 = { x: state.vx, y: state.vy, z: state.vz };
  const at = (p, v, dp, dv, k) => ({ p: { x: p.x + dp.x * k, y: p.y + dp.y * k, z: p.z + dp.z * k }, v: { x: v.x + dv.x * k, y: v.y + dv.y * k, z: v.z + dv.z * k } });

  const k1 = accel(v0, p0.z, control, up0, excessFn);
  const s2 = at(p0, v0, v0, k1.a, dtSec / 2);
  const k2 = accel(s2.v, s2.p.z, control, up0, excessFn);
  const s3 = at(p0, v0, s2.v, k2.a, dtSec / 2);
  const k3 = accel(s3.v, s3.p.z, control, up0, excessFn);
  const s4 = at(p0, v0, s3.v, k3.a, dtSec);
  const k4 = accel(s4.v, s4.p.z, control, up0, excessFn);

  const w = dtSec / 6;
  const comb = (a, b, c, d) => ({ x: w * (a.x + 2 * b.x + 2 * c.x + d.x), y: w * (a.y + 2 * b.y + 2 * c.y + d.y), z: w * (a.z + 2 * b.z + 2 * c.z + d.z) });
  const dp = comb(v0, s2.v, s3.v, s4.v);
  const dv = comb(k1.a, k2.a, k3.a, k4.a);
  const v = { x: v0.x + dv.x, y: v0.y + dv.y, z: v0.z + dv.z };
  return {
    x: p0.x + dp.x, y: p0.y + dp.y, z: p0.z + dp.z,
    vx: v.x, vy: v.y, vz: v.z,
    up: upFrom(scale(v, 1 / len(v)), up0),
  };
}

/** A state from speed (KTAS), heading and climb angle (radians), upright. */
export function pointMassState({ x = 0, y = 0, altFt, ktas, headingRad, climbRad = 0 }) {
  const v = ktas * KT_TO_FTPS;
  const ch = Math.cos(headingRad), sh = Math.sin(headingRad), cg = Math.cos(climbRad), sg = Math.sin(climbRad);
  return { x, y, z: altFt, vx: v * cg * ch, vy: v * cg * sh, vz: v * sg, up: { x: -sg * ch, y: -sg * sh, z: cg } };
}

/** Speed (KTAS), altitude (ft), heading and climb angle (radians) of a state. */
export function pointMassFlight(state) {
  const horizontal = Math.hypot(state.vx, state.vy);
  return {
    ktas: Math.hypot(horizontal, state.vz) / KT_TO_FTPS,
    altFt: state.z,
    headingRad: Math.atan2(state.vy, state.vx),
    climbRad: Math.atan2(state.vz, horizontal),
  };
}
