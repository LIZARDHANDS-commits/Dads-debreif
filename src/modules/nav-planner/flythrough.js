// Where the aircraft is at a moment, for the fly-through along the plan and the replay of a flown track (docs/modules/nav-planner/spec.md,
// "Brief" and "Debrief"; NP-10). Pure. The plan's fly-through flies each leg straight at its planned ground speed with its nose on the leg's
// heading (crabbed into the wind), and takes each turn at once at the turn point (a simplification: no turn radius). An AGL leg follows the
// ground plus its height (groundAt(lat, lon) in ft, NaN unknown: then the leg's altitude used).
import { pointAlong, MAG_VARIATION_DEG_E } from './legs.js';
import { compassDegFromVector, wrapDeg360 } from '../../core/angles.js';
import { makeLocalRef, latLonToLocalFt } from '../../core/geo.js';

/** The plan's timeline: the legs that can be flown, in order, until the first that can't (a [NO TRACK] leg). { segments, durationS }. */
export function planTimeline(points, legs) {
  const segments = [];
  let t = 0;
  for (const leg of legs) {
    if (!Number.isFinite(leg.timeS)) break;
    segments.push({ i: leg.i, t0: t, t1: t + leg.timeS, a: points[leg.i], b: points[leg.i + 1], leg });
    t += leg.timeS;
  }
  return { segments, durationS: t };
}

/**
 * The aircraft on the plan at time t (seconds from the first turn point): { lat, lon, altFt, headingDegT, legIndex }, or null with no legs.
 * @param {{ segments: any[] }} timeline
 * @param {number} t
 * @param {(lat: number, lon: number) => number} [groundAt]
 */
export function planPositionAt(timeline, t, groundAt = () => NaN) {
  const { segments } = timeline;
  if (!segments.length) return null;
  const s = segments.find((g) => t <= g.t1) ?? segments[segments.length - 1];
  const f = Math.min(1, Math.max(0, (t - s.t0) / Math.max(1e-9, s.t1 - s.t0)));
  const p = pointAlong(s.a, s.b, f);
  const leg = s.leg;
  let altFt = leg.altFt;
  if (leg.heightRef === 'AGL') {
    const g = groundAt(p.lat, p.lon);
    if (Number.isFinite(g)) altFt = g + leg.heightFt;
  }
  return { ...p, altFt, headingDegT: wrapDeg360(leg.headingDegM + MAG_VARIATION_DEG_E), legIndex: s.i };
}

/** The flown track at time t (seconds since 1970), between fixes: { lat, lon, altFt, headingDegT }, or null outside the track. */
export function flownPositionAt(fixes, t) {
  if (!fixes?.length || t < fixes[0].t || t > fixes[fixes.length - 1].t) return null;
  let lo = 0;
  let hi = fixes.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (fixes[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = fixes[lo];
  const b = fixes[hi];
  const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
  const ref = makeLocalRef(a.lat, a.lon);
  const pb = latLonToLocalFt(ref, b.lat, b.lon);
  return {
    lat: a.lat + (b.lat - a.lat) * f,
    lon: a.lon + (b.lon - a.lon) * f,
    altFt: a.altFt + (b.altFt - a.altFt) * f,
    headingDegT: Math.hypot(pb.x, pb.y) > 1 ? compassDegFromVector(pb.x, pb.y) : null,
  };
}
