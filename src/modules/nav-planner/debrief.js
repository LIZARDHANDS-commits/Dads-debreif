// The flown track against the plan (docs/modules/nav-planner/spec.md, "Debrief"; NP-12). Pure: plain values in and out.
// - Each turn point's pass: the first close pass, searched in order after the last point's pass: the earliest local closest approach within
//   PASS_SLACK_NM of the leg's closest approach (estimate), so a route that ends where it started finds the landing, not the take-off. Fixes
//   on the ground (flight-data's isGroundFix) are left out, so the taxi never counts as a pass.
// - Early or late: the pass time less (the first point's pass time + the planned running time to that point).
// - Each leg's cross-track error from the fixes between its two passes (core legOffsetsFt, right positive), its largest and its average size;
//   and its height against plan: the average flown altitude less the leg's planned MSL altitude, and the lowest flown altitude. ForeFlight's
//   heights are GPS heights (said on screen).
import { makeLocalRef, latLonToLocalFt, legOffsetsFt } from '../../core/geo.js';
import { FT_PER_NM } from '../../core/units.js';
import { isGroundFix } from '../../flight-data/altitude.js';

/** A later local closest approach within this much of the overall closest is still taken as the pass (estimate). */
export const PASS_SLACK_NM = 1;

/**
 * points: the plan's turn points; legs: computeLegs' legs; fixes: the flown track's fixes ([{ lat, lon, altFt, t, ... }] from flight-data,
 * sorted by time). Returns { passes: [{ i, k, t, missNm, earlyS }], legs: [{ i, maxXtNm, avgXtNm, n, avgDevFt, lowestFt }] }; a point not
 * passed (the track ended) has k = -1 and NaNs, and its legs are left empty.
 */
export function compareFlown(points, legs, fixes) {
  const air = fixes.filter((_, k) => !isGroundFix(fixes, k));
  const ref = points.length ? makeLocalRef(points[0].lat, points[0].lon) : null;
  const xy = air.map((f) => latLonToLocalFt(ref, f.lat, f.lon));
  const tp = points.map((p) => latLonToLocalFt(ref, p.lat, p.lon));
  const passes = [];
  let from = 0;
  for (let i = 0; i < points.length; i++) {
    const k = passIndex(xy, tp[i], from);
    if (k < 0) {
      passes.push({ i, k: -1, t: NaN, missNm: NaN, earlyS: NaN });
      continue;
    }
    from = k;
    passes.push({ i, k, t: air[k].t, missNm: Math.hypot(xy[k].x - tp[i].x, xy[k].y - tp[i].y) / FT_PER_NM, earlyS: NaN });
  }
  const t0 = passes[0]?.t;
  for (const p of passes) {
    if (p.i === 0 || !Number.isFinite(p.t) || !Number.isFinite(t0)) continue;
    const planned = legs[p.i - 1]?.runS;
    if (Number.isFinite(planned)) p.earlyS = p.t - (t0 + planned); // + late, − early
  }
  const legOut = legs.map((leg) => {
    const a = passes[leg.i];
    const b = passes[leg.i + 1];
    const empty = { i: leg.i, maxXtNm: NaN, avgXtNm: NaN, n: 0, avgDevFt: NaN, lowestFt: NaN };
    if (!a || !b || a.k < 0 || b.k < 0 || b.k <= a.k) return empty;
    let max = 0;
    let sumAbs = 0;
    let sumAlt = 0;
    let lowest = Infinity;
    let n = 0;
    for (let k = a.k; k <= b.k; k++) {
      const { crossFt } = legOffsetsFt(tp[leg.i], tp[leg.i + 1], xy[k]);
      if (Math.abs(crossFt) > Math.abs(max)) max = crossFt;
      sumAbs += Math.abs(crossFt);
      sumAlt += air[k].altFt;
      lowest = Math.min(lowest, air[k].altFt);
      n += 1;
    }
    return { i: leg.i, maxXtNm: max / FT_PER_NM, avgXtNm: sumAbs / n / FT_PER_NM, n, avgDevFt: sumAlt / n - leg.altFt, lowestFt: lowest };
  });
  return { passes, legs: legOut, airborne: air };
}

/** The index of the first close pass of `target` in `xy` from index `from` on, or -1 when there are no fixes left. */
function passIndex(xy, target, from) {
  if (from >= xy.length) return -1;
  const d = (k) => Math.hypot(xy[k].x - target.x, xy[k].y - target.y);
  let best = Infinity;
  for (let k = from; k < xy.length; k++) best = Math.min(best, d(k));
  const slack = best + PASS_SLACK_NM * FT_PER_NM;
  for (let k = from; k < xy.length; k++) {
    const here = d(k);
    if (here > slack) continue;
    const prev = k > from ? d(k - 1) : Infinity;
    const next = k + 1 < xy.length ? d(k + 1) : Infinity;
    if (here <= prev && here <= next) return k;
  }
  return xy.length - 1;
}
