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
 * pattern), the gap closes over about this time, like a pilot easing onto the
 * line. An estimate.
 */
export const JOIN_SEC = 3;

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
  // Joining a new path from slightly off it: the gap closes smoothly instead of jumping (spec item 13a).
  if (a.joinOffset) {
    const keep = Math.exp(-dt / JOIN_SEC);
    a.joinOffset = { x: a.joinOffset.x * keep, y: a.joinOffset.y * keep };
    a.x += a.joinOffset.x;
    a.y += a.joinOffset.y;
    if (Math.hypot(a.joinOffset.x, a.joinOffset.y) < 1) delete a.joinOffset;
  }
  a.alt = p.alt ?? a.fallbackAlt ?? a.alt ?? 3500;
  a.iasKt = p.kt ?? a.fallbackKt ?? a.iasKt ?? 140;
  a.kt = a.iasKt;
  if (p.phase) a.phase = p.phase;
  if (p.tag) a.tag = p.tag;
  else if (route?.points?.[p.seg]?.tag) a.tag = route.points[p.seg].tag;

  const tasKt = Math.max(1, iasToTasKt(a.iasKt, a.alt));
  const tasFtps = ktToFtps(tasKt);
  const trackDeg = trackAt(route, a.distFt, options);
  const wt = windTriangle(trackDeg, tasKt, windFromDeg, windKt);
  a.gsKt = wt.canHoldTrack ? Math.max(wt.groundSpeedKt, 10) : 10;
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
