// The path follower: the one piece of code that moves an aircraft along a
// built path (Traffic spec, "How the aircraft moves", items 1-9; refactor PR 2).
//
// Each step it flies the aircraft along the route's ground track at its ground
// speed, then works out from where it is:
//   - heading: the track there plus the crab for the wind, never stepping at a
//     corner of the drawn path (the track is read across a short window, so a
//     rounded turn drawn as short straight pieces still turns smoothly);
//   - bank: what that heading rate needs at this true airspeed, signed (right
//     positive), eased in and out at the roll-rate setting;
//   - pitch: the climb angle plus the angle of attack (T6A_PITCH).
// Speeds: the route's speeds are KIAS; true airspeed comes from KIAS and
// height (iasToTasKt) in every wind, and ground speed from the wind triangle.
import { ktToFtps } from '../../core/units.js';
import { wrapDeg180, compassDegFromVector } from '../../core/angles.js';
import { bankDegFromTurnRate, easeRoll, gFromBankDeg } from '../../core/flight-math.js';
import { windTriangle } from '../../core/wind.js';
import { iasToTasKt, pitchDegFromClimb } from '../../core/t6-performance.js';
import { posOnRoute, DEFAULT_ROUTE_OPTIONS } from './route.js';
import { ROLL } from './circuit.js';

/**
 * Half the window the track is read across, in feet. Longer than the pieces a
 * drawn turn is made of (about 100 to 300 ft), short against any turn radius
 * the T-6 flies in the pattern (about 1,500 ft and up).
 */
export const TRACK_WINDOW_FT = 150;

/**
 * When an aircraft moves onto a new path a little off it (an entry joining the
 * pattern), the gap closes over at least this time, like a pilot easing onto the
 * line. An estimate.
 */
export const JOIN_SEC = 3;

/** Sideways acceleration a join is shaped to stay near, ft/s² (0.15 G, an estimate). */
const JOIN_ACCEL_FTPS2 = 0.15 * 32.174;

/** Longest a join takes, seconds (an estimate). */
const JOIN_MAX_SEC = 15;

/** Ground velocity along the route at `distFt`, ft/s, as { x, y } (x east, y north). */
function pathGroundVelocity(route, distFt, env, options) {
  const p = posOnRoute(route, distFt, options);
  const trackDeg = trackAt(route, distFt, options);
  const tasKt = Math.max(1, iasToTasKt(p.kt ?? 140, p.alt ?? 3500));
  const wt = windTriangle(trackDeg, tasKt, env?.windFromDeg ?? 360, env?.windKt ?? 0);
  const gsFtps = ktToFtps(wt.canHoldTrack ? Math.max(wt.groundSpeedKt, 10) : 10);
  const r = trackDeg * Math.PI / 180;
  return { x: gsFtps * Math.sin(r), y: gsFtps * Math.cos(r) };
}

/**
 * Puts `a` onto `route` at `distFt` from wherever it is and however it is moving
 * (Patrick, 4 Oct 09:21Z: at the hand-over the aircraft's vector lines up with its
 * own track, so nothing snaps). The gap and the difference in ground velocity both
 * close over the join time along a smooth curve that starts with the aircraft's own
 * velocity and ends on the path with the path's, so the place, track and speed carry
 * on without a step. Sets `a.distFt` and `a.joinOffset`.
 */
export function startJoin(a, route, distFt, env = null, options = DEFAULT_ROUTE_OPTIONS) {
  const p = posOnRoute(route, distFt, options);
  const x0 = (Number.isFinite(a.x) ? a.x : p.x) - p.x;
  const y0 = (Number.isFinite(a.y) ? a.y : p.y) - p.y;
  const path = pathGroundVelocity(route, distFt, env, options);
  let vx0 = 0, vy0 = 0;
  const trackDeg = Number.isFinite(a.trackDeg) ? a.trackDeg : a.headingDeg;
  const gsKt = a.groundSpeedKt ?? a.gsKt;
  if (Number.isFinite(trackDeg) && Number.isFinite(gsKt)) {
    const r = trackDeg * Math.PI / 180;
    vx0 = ktToFtps(gsKt) * Math.sin(r) - path.x;
    vy0 = ktToFtps(gsKt) * Math.cos(r) - path.y;
  }
  // Height, climb rate and speed carry over the same way, so nothing steps there either.
  const alt0 = Number.isFinite(a.alt) && Number.isFinite(p.alt) ? a.alt - p.alt : 0;
  const vz0 = Number.isFinite(a.climbFtps) ? a.climbFtps : 0;
  const kt0 = Number.isFinite(a.iasKt) && Number.isFinite(p.kt) ? a.iasKt - p.kt : 0;
  const gapFt = Math.hypot(x0, y0), relFtps = Math.hypot(vx0, vy0);
  const T = Math.min(JOIN_MAX_SEC, Math.max(JOIN_SEC, Math.sqrt(6 * gapFt / JOIN_ACCEL_FTPS2), 4 * relFtps / JOIN_ACCEL_FTPS2));
  a.distFt = distFt;
  if (gapFt < 1 && relFtps < 1 && Math.abs(alt0) < 1 && Math.abs(vz0) < 0.5 && Math.abs(kt0) < 0.5) { delete a.joinOffset; return; }
  a.joinOffset = { x: x0, y: y0, x0, y0, vx0, vy0, alt0, vz0, kt0, t: 0, T };
}

/** The ground track in compass degrees at `distFt` along the route, read across the window so it never steps. */
export function trackAt(route, distFt, options = DEFAULT_ROUTE_OPTIONS) {
  const a = posOnRoute(route, distFt - TRACK_WINDOW_FT, options);
  const b = posOnRoute(route, distFt + TRACK_WINDOW_FT, options);
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 1) return posOnRoute(route, distFt, options).headingDeg;
  return compassDegFromVector(dx, dy);
}

/**
 * One step along the route: moves `a` by its ground speed and sets its place,
 * height, KIAS, heading, track, crab, ground speed, bank, roll rate, G, pitch,
 * phase and tag. `env` is { windFromDeg, windKt }. Returns the route point.
 */
export function followRoute(a, route, env, dt, options = DEFAULT_ROUTE_OPTIONS) {
  const windFromDeg = env?.windFromDeg ?? 360;
  const windKt = env?.windKt ?? 0;
  const prevHeading = Number.isFinite(a.headingDeg) ? a.headingDeg : null;
  const prevAlt = Number.isFinite(a.alt) ? a.alt : null;

  // Ground speed where the aircraft is now, then move along the track by it.
  const here = posOnRoute(route, a.distFt ?? 0, options);
  const tasNowKt = Math.max(1, iasToTasKt(here.kt ?? a.iasKt ?? 140, here.alt ?? a.alt ?? 3500));
  const wtNow = windTriangle(trackAt(route, a.distFt ?? 0, options), tasNowKt, windFromDeg, windKt);
  const gsKt = wtNow.canHoldTrack ? Math.max(wtNow.groundSpeedKt, 10) : 10;
  a.distFt = (a.distFt ?? 0) + ktToFtps(gsKt) * dt;

  const p = posOnRoute(route, a.distFt, options);
  a.x = p.x;
  a.y = p.y;
  // Joining a new path from off it: the gap and the velocity difference close along a smooth
  // (cubic Hermite) curve instead of jumping (spec item 13a; startJoin).
  let joinRate = null, joinBlend = null;
  if (a.joinOffset) {
    const j = a.joinOffset;
    if (!Number.isFinite(j.T)) Object.assign(j, { x0: j.x, y0: j.y, vx0: 0, vy0: 0, t: 0, T: JOIN_SEC });
    j.t += dt;
    const u = Math.min(1, j.t / j.T);
    const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u;
    const d00 = (6 * u ** 2 - 6 * u) / j.T, d10 = 3 * u ** 2 - 4 * u + 1;
    j.x = h00 * j.x0 + h10 * j.T * j.vx0;
    j.y = h00 * j.y0 + h10 * j.T * j.vy0;
    joinRate = { x: d00 * j.x0 + d10 * j.vx0, y: d00 * j.y0 + d10 * j.vy0 };
    joinBlend = { alt: h00 * (j.alt0 ?? 0) + h10 * j.T * (j.vz0 ?? 0), kt: h00 * (j.kt0 ?? 0) };
    a.x += j.x;
    a.y += j.y;
    if (u >= 1) delete a.joinOffset;
  }
  a.alt = p.alt ?? a.fallbackAlt ?? a.alt ?? 3500;
  a.iasKt = p.kt ?? a.fallbackKt ?? a.iasKt ?? 140;
  if (joinBlend) {
    a.alt += joinBlend.alt;
    a.iasKt += joinBlend.kt;
  }
  a.kt = a.iasKt;
  if (p.phase) a.phase = p.phase;
  if (p.tag) a.tag = p.tag;
  else if (route?.points?.[p.seg]?.tag) a.tag = route.points[p.seg].tag;

  const tasKt = Math.max(1, iasToTasKt(a.iasKt, a.alt));
  const tasFtps = ktToFtps(tasKt);
  let trackDeg = trackAt(route, a.distFt, options);
  let joinGsKt = null;
  if (joinRate) {
    // While joining, the aircraft's real track is the path's plus the join's own motion.
    const path = pathGroundVelocity(route, a.distFt, env, options);
    const vx = path.x + joinRate.x, vy = path.y + joinRate.y;
    trackDeg = compassDegFromVector(vx, vy);
    joinGsKt = Math.hypot(vx, vy) / ktToFtps(1);
  }
  const wt = windTriangle(trackDeg, tasKt, windFromDeg, windKt);
  a.gsKt = joinGsKt ?? (wt.canHoldTrack ? Math.max(wt.groundSpeedKt, 10) : 10);
  a.groundSpeedKt = a.gsKt;
  a.tasKt = tasKt;
  a.crabDeg = wt.crabDeg;
  a.headingDeg = wt.headingDeg;
  a.trackDeg = trackDeg;

  // Bank: what this heading rate needs (right positive), reached by a smooth roll.
  const rateRadPerSec = (prevHeading === null || !(dt > 0)) ? 0 : (wrapDeg180(a.headingDeg - prevHeading) * Math.PI / 180) / dt;
  a.targetBankDeg = bankDegFromTurnRate(tasFtps, rateRadPerSec);
  const roll = easeRoll(a.bankDeg ?? 0, a.rollRateDps ?? 0, a.targetBankDeg, dt, ROLL);
  a.bankDeg = roll.bankDeg;
  a.rollRateDps = roll.rollRateDps;
  a.g = gFromBankDeg(a.bankDeg);

  // Pitch: the climb angle plus the angle of attack at this G.
  const climbFtps = (prevAlt === null || !(dt > 0)) ? 0 : (a.alt - prevAlt) / dt;
  a.climbFtps = climbFtps;
  a.pitchDeg = pitchDegFromClimb(climbFtps, tasFtps, a.iasKt, a.g);
  return p;
}
