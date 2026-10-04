// Closest approach of two aircraft, and the danger test and dodge side built on it (ALL-27). Pure maths only:
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
