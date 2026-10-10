// The full stop's rollout and taxi-in for the Traffic Sim (Patrick, 10 Oct 20:38Z): an aircraft that lands on 29L
// "for the stop" slows on the runway to 20 kt by its end, turns off, taxis at 20 kt along the taxiways, across 29R
// and onto the ramp, and stops in front of the Bandit hangar; there it is removed.
//
//   - The path is the touchdown spot, then the points in airfield.js TAXI_IN_29L, with each corner rounded into
//     an arc (TAXI.turnRadiusFt, less where a leg is too short for it).
//   - The rollout slows evenly, from the ground speed at touchdown to 20 kt where the turn-off arc starts.
//   - It taxis at 20 kt, and slows evenly to a stop at the hangar (TAXI.stopDecelFtps2).
//   - The runway is clear once the aircraft is TAXI.runwayClearFt past the end of its turn off 29L; until then
//     touch-and-goes behind it fly a low approach (sim.js).
//
// Positions in map feet (x east, y north), headings compass degrees true. Speeds here are ground speeds: on the
// ground the sim shows ground speed. Nothing here reads a setting or the page.
import { ktToFtps } from '../../core/units.js';
import { compassDegFromVector, wrapDeg180 } from '../../core/angles.js';
import { TAXI_IN_29L } from './airfield.js';

export const TAXI = Object.freeze({
  /** Taxi speed, kt ground speed (Patrick, 10 Oct 20:38Z: "it slows to 20 knots and taxis at 20 knots"). */
  kt: 20,
  /** Radius of each taxi turn, ft (an estimate, about a taxiway fillet; 0.18 g at 20 kt). */
  turnRadiusFt: 200,
  /** Braking to the stop at the hangar, ft/s² (an estimate, a gentle stop: about 190 ft from 20 kt). */
  stopDecelFtps2: 3,
  /** Stopped in front of the hangar this long before the aircraft is removed, s (an estimate). */
  holdSec: 5,
  /** The runway is clear this far past the end of the turn off 29L, ft (an estimate: the tail past the hold line). */
  runwayClearFt: 150,
});

/** Arc points every this many degrees of turn. */
const ARC_STEP_DEG = 2;

/**
 * The taxi-in from `from` ({ x, y }, the aircraft on the runway at touchdown), rolling at `v0Ftps` ground speed.
 * Returns a frozen plan: the path as points with their distance along it (`s`), the length, where the turn off the
 * runway starts (`turnS`), where the runway is clear (`clearS`) and the touchdown ground speed.
 */
export function buildTaxiIn(from, v0Ftps, route = TAXI_IN_29L) {
  const corners = [{ x: from.x, y: from.y }, ...route];
  const pts = [{ x: corners[0].x, y: corners[0].y }];
  let turnStart = null, turnEnd = null;
  for (let i = 1; i < corners.length - 1; i++) {
    const p0 = corners[i - 1], p1 = corners[i], p2 = corners[i + 1];
    const inLen = Math.hypot(p1.x - p0.x, p1.y - p0.y), outLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const h1 = compassDegFromVector(p1.x - p0.x, p1.y - p0.y), h2 = compassDegFromVector(p2.x - p1.x, p2.y - p1.y);
    const turn = wrapDeg180(h2 - h1);
    if (Math.abs(turn) < 1 || inLen < 1 || outLen < 1) { pts.push({ x: p1.x, y: p1.y }); continue; }
    const half = Math.tan(Math.abs(turn) * Math.PI / 360);
    // The arc's ends sit this far either side of the corner: no more than half of either leg (all of the first,
    // the runway, and of the last, to the stop).
    const inRoom = i === 1 ? inLen : inLen / 2, outRoom = i === corners.length - 2 ? outLen : outLen / 2;
    const tangent = Math.min(TAXI.turnRadiusFt * half, inRoom, outRoom);
    const r = tangent / half;
    const a = { x: p1.x - (p1.x - p0.x) / inLen * tangent, y: p1.y - (p1.y - p0.y) / inLen * tangent };
    const side = Math.sign(turn); // +1 a right turn
    const n1 = h1 * Math.PI / 180;
    // The arc's centre is square off the inbound leg, on the side it turns to.
    const c = { x: a.x + side * r * Math.cos(n1), y: a.y - side * r * Math.sin(n1) };
    if (i === 1) pts.push({ ...a, mark: 'turn_start' }); else pts.push(a);
    const steps = Math.max(2, Math.ceil(Math.abs(turn) / ARC_STEP_DEG));
    for (let k = 1; k <= steps; k++) {
      const hdg = (h1 + turn * k / steps) * Math.PI / 180;
      pts.push({ x: c.x - side * r * Math.cos(hdg), y: c.y + side * r * Math.sin(hdg), ...(i === 1 && k === steps ? { mark: 'turn_end' } : {}) });
    }
  }
  const last = corners[corners.length - 1];
  pts.push({ x: last.x, y: last.y });
  let s = 0;
  const path = pts.map((p, i) => {
    if (i > 0) s += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
    if (p.mark === 'turn_start') turnStart = s;
    if (p.mark === 'turn_end') turnEnd = s;
    return Object.freeze({ x: p.x, y: p.y, s });
  });
  const turnS = turnStart ?? 0;
  return Object.freeze({ path: Object.freeze(path), lengthFt: s, turnS, clearS: (turnEnd ?? turnS) + TAXI.runwayClearFt, v0Ftps });
}

/** Ground speed at `s` along the plan, ft/s: the even slow-down to 20 kt by the turn-off, 20 kt, the stop. */
export function taxiSpeedFtps(plan, s) {
  const vTaxi = ktToFtps(TAXI.kt);
  const v0 = Math.max(plan.v0Ftps, vTaxi);
  const decel = plan.turnS > 0 ? (v0 * v0 - vTaxi * vTaxi) / (2 * plan.turnS) : 0;
  const roll = s < plan.turnS ? Math.sqrt(Math.max(vTaxi * vTaxi, v0 * v0 - 2 * decel * s)) : vTaxi;
  const stop = Math.sqrt(2 * TAXI.stopDecelFtps2 * Math.max(0, plan.lengthFt - s));
  return Math.min(roll, stop);
}

/** Where `s` along the plan is: { x, y, headingDeg }. */
export function taxiPosition(plan, s) {
  const path = plan.path;
  let lo = 0, hi = path.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid].s <= s) lo = mid; else hi = mid;
  }
  const p0 = path[lo], p1 = path[hi];
  const f = p1.s > p0.s ? Math.min(1, Math.max(0, (s - p0.s) / (p1.s - p0.s))) : 1;
  return { x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f, headingDeg: compassDegFromVector(p1.x - p0.x, p1.y - p0.y) };
}

/** One step of `dt` seconds from `s`: { s, ftps, done }, done once stopped at the hangar. */
export function taxiStep(plan, s, dt) {
  // At least 1 ft/s, so the last few feet of the stop are covered (the even stop never quite gets there).
  const ftps = taxiSpeedFtps(plan, s);
  const next = Math.min(plan.lengthFt, s + Math.max(ftps, 1) * dt);
  return { s: next, ftps: next >= plan.lengthFt ? 0 : ftps, done: next >= plan.lengthFt };
}
