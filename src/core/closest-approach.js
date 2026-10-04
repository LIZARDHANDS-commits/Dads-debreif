// Closest approach of two aircraft, the danger test and dodge side built on it, and when two aircraft first get
// inside a cylinder of each other (ALL-27). Pure maths only:
// no state, no globals, every limit passed in by the module. Each module keeps its own choices (Fight Sim's
// 85 ft offset and pursuit aim; Traffic's right-of-way table, manoeuvres and cylinder).
//
// Positions in feet (x east, y north, z up), velocities in ft/s.

/**
 * Closest approach of two aircraft flying straight at constant velocity.
 * `a`, `b` = { x, y, z, vx, vy, vz }. Returns { tcpaSec, missFt, closing, rangeFt }: the time to the closest
 * point, the miss distance there, whether they are closing, and the range now. Not closing (or a relative
 * speed under 1 ft/s) gives tcpaSec 0 and the miss distance is the range now.
 */
export function closestApproach(a, b) {
  const rx = b.x - a.x, ry = b.y - a.y, rz = (b.z ?? 0) - (a.z ?? 0);
  const vx = (b.vx ?? 0) - (a.vx ?? 0), vy = (b.vy ?? 0) - (a.vy ?? 0), vz = (b.vz ?? 0) - (a.vz ?? 0);
  const rangeFt = Math.hypot(rx, ry, rz);
  const vv = vx * vx + vy * vy + vz * vz;
  const rv = rx * vx + ry * vy + rz * vz;
  if (vv < 1 || rv >= 0) return { tcpaSec: 0, missFt: rangeFt, closing: false, rangeFt };
  const tcpaSec = -rv / vv;
  return { tcpaSec, missFt: Math.hypot(rx + vx * tcpaSec, ry + vy * tcpaSec, rz + vz * tcpaSec), closing: true, rangeFt };
}

/**
 * The danger test, with memory so it does not flicker: danger when closing and the closest point comes within
 * `soonSec` with a miss under `missFt`, or when closing inside `nearFt`; once avoiding (`wasAvoiding`), it
 * stays on until the range opens past `releaseFt`. `cpa` is closestApproach's result.
 */
export function dangerGate(wasAvoiding, cpa, { soonSec, missFt, nearFt, releaseFt }) {
  return (cpa.closing && cpa.tcpaSec <= soonSec && cpa.missFt < missFt)
    || (cpa.closing && cpa.rangeFt < nearFt)
    || (!!wasAvoiding && cpa.rangeFt < releaseFt);
}

/**
 * Which side to dodge along an axis: the side the aircraft is already on (`offsetFt`, its distance from the
 * other along that axis), so the gap only grows. Within `deadbandFt` of level, `tieBreak` (+1 or -1) decides,
 * so the two aircraft pick opposite sides when the module passes them opposite tie-breaks.
 */
export function clearanceSide(offsetFt, tieBreak, deadbandFt = 1) {
  if (Math.abs(offsetFt) > deadbandFt) return offsetFt > 0 ? 1 : -1;
  return tieBreak < 0 ? -1 : 1;
}

/**
 * The first time, from 0 to `horizonSec`, that two aircraft at constant velocity are inside the cylinder
 * { latFt, vertFt } of each other (inside `latFt` across the ground and `vertFt` in height at once).
 * Exact: a quadratic across the ground, a straight line in height. Returns the time in seconds, or null.
 */
export function firstEntry(a, b, { latFt, vertFt }, horizonSec) {
  const rx = b.x - a.x, ry = b.y - a.y, rz = (b.z ?? 0) - (a.z ?? 0);
  const vx = (b.vx ?? 0) - (a.vx ?? 0), vy = (b.vy ?? 0) - (a.vy ?? 0), vz = (b.vz ?? 0) - (a.vz ?? 0);
  // Across the ground: |r + v t|^2 <= lat^2.
  let lo = 0, hi = horizonSec;
  const A = vx * vx + vy * vy, B = 2 * (rx * vx + ry * vy), C = rx * rx + ry * ry - latFt * latFt;
  if (A < 1e-9) {
    if (C > 0) return null;
  } else {
    const disc = B * B - 4 * A * C;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    lo = Math.max(lo, (-B - s) / (2 * A));
    hi = Math.min(hi, (-B + s) / (2 * A));
  }
  // In height: |rz + vz t| <= vert.
  if (Math.abs(vz) < 1e-9) {
    if (Math.abs(rz) > vertFt) return null;
  } else {
    const t1 = (-vertFt - rz) / vz, t2 = (vertFt - rz) / vz;
    lo = Math.max(lo, Math.min(t1, t2));
    hi = Math.min(hi, Math.max(t1, t2));
  }
  return lo <= hi ? lo : null;
}

/**
 * The same for two predicted tracks, each a list of { x, y, z } every `stepSec` from now: straight between
 * samples, so a fast pair cannot jump through the cylinder between two samples. Returns seconds, or null.
 */
export function firstEntrySampled(trackA, trackB, limits, stepSec) {
  const n = Math.min(trackA.length, trackB.length);
  for (let i = 0; i + 1 < n; i++) {
    const a0 = trackA[i], a1 = trackA[i + 1], b0 = trackB[i], b1 = trackB[i + 1];
    const a = { x: a0.x, y: a0.y, z: a0.z, vx: (a1.x - a0.x) / stepSec, vy: (a1.y - a0.y) / stepSec, vz: (a1.z - a0.z) / stepSec };
    const b = { x: b0.x, y: b0.y, z: b0.z, vx: (b1.x - b0.x) / stepSec, vy: (b1.y - b0.y) / stepSec, vz: (b1.z - b0.z) / stepSec };
    const t = firstEntry(a, b, limits, stepSec);
    if (t !== null) return i * stepSec + t;
  }
  return null;
}
