// Each leg's numbers (docs/modules/nav-planner/spec.md, "Which airspeed, which heading, which height" and "Times, fuel and wind"; NP-2 to
// NP-8). Pure: plain values in and out, tested in Node (tests/unit/nav-planner/legs.test.js). Every formula is core's, never a second copy:
// - the track and distance on the flat local map centred on the leg's middle (core geo.js, angles.js): the rhumb line, within a degree and
//   a tenth of a mile of the sphere's for legs under about 100 NM (estimate);
// - true airspeed from KIAS at the leg's MSL altitude on the standard day (core t6-performance.js iasToTasKt);
// - heading and ground speed from the wind triangle (core wind.js windTriangle);
// - magnetic = true − Moose Jaw's 9° E (Patrick's ruling TR-65; the Traffic sim's MAG_VARIATION_DEG_E, imported).
import { makeLocalRef, latLonToLocalFt, localFtToLatLon } from '../../core/geo.js';
import { compassDegFromVector, wrapDeg360 } from '../../core/angles.js';
import { FT_PER_NM } from '../../core/units.js';
import { iasToTasKt } from '../../core/t6-performance.js';
import { windTriangle } from '../../core/wind.js';
import { MAG_VARIATION_DEG_E } from '../traffic/airfield.js';

export { MAG_VARIATION_DEG_E };
/** Moose Jaw's field elevation, ft: OurAirports' 1,892 ft (src/airfields/airports-data.js), as the EP Tabletop and the Debrief use. The AGL legs' altitude while the terrain is unknown. */
export const FIELD_FT = 1892;

/** The leg from a to b ({ lat, lon }): its true track (°T, the rhumb line), its distance (NM) and its middle ({ lat, lon }). */
export function legGeometry(a, b) {
  const mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
  const ref = makeLocalRef(mid.lat, mid.lon);
  const pa = latLonToLocalFt(ref, a.lat, a.lon);
  const pb = latLonToLocalFt(ref, b.lat, b.lon);
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const distFt = Math.hypot(dx, dy);
  return { trackDegT: distFt > 0 ? compassDegFromVector(dx, dy) : 0, distNm: distFt / FT_PER_NM, distFt, mid };
}

/** The point a fraction f (0 to 1) of the way from a to b along the leg's straight line on the flat map at its middle: { lat, lon }. */
export function pointAlong(a, b, f) {
  const ref = makeLocalRef((a.lat + b.lat) / 2, (a.lon + b.lon) / 2);
  const pa = latLonToLocalFt(ref, a.lat, a.lon);
  const pb = latLonToLocalFt(ref, b.lat, b.lon);
  return localFtToLatLon(ref, pa.x + (pb.x - pa.x) * f, pa.y + (pb.y - pa.y) * f);
}

/** True to magnetic with Moose Jaw's variation (9° E, TR-65): °M = °T − 9. */
export const toMagnetic = (degT, varE = MAG_VARIATION_DEG_E) => wrapDeg360(degT - varE);

/**
 * The legs of a route and their totals.
 *
 * points: the route's turn points ([{ name, lat, lon, heightFt, heightRef, kias }]; each point's height and KIAS are for the leg leaving it).
 * options:
 * - startFuelLb, fuelFlowPph, minClearanceFt: the plan's settings (estimates, NP-5, NP-7).
 * - windFor(i, { mid, altFt, startS }): the wind on leg i, { fromDegT, kt } (from, degrees true; knots), or { none: 'reason' } for still air
 *   with a reason, or null for still air with no reason (the None choice). startS is the running time when the leg starts.
 * - terrainFor(i): leg i's ground (terrain.js summarizeLeg), { status: 'ready' | 'loading' | 'unknown', highestFt, highestAt, meanFt,
 *   highestKnownFt }, or null when none is asked for.
 * - fieldFt: the AGL legs' ground while the terrain is unknown (FIELD_FT).
 * - varE: the magnetic variation, degrees east (MAG_VARIATION_DEG_E).
 *
 * Returns { legs: [...], totals: { distNm, timeS, fuelUsedLb, fuelRemLb, complete } }. Each leg: i, from, to (names), trackDegT, trackDegM,
 * headingDegM, crabDeg, distNm, altFt (MSL used for KTAS and winds), altEstimated, heightFt, heightRef, kias, tasKt, wind ({ fromDegT, kt } or
 * null), windNote (why still air, or ''), gsKt, canHoldTrack, timeS (NaN when the track can't be held), startS, runS, fuelUsedLb, fuelRemLb,
 * clearance: { ft (or null when unknown), atMost (true when only an upper bound is known), low, status, highestFt, highestAt, safeAltFt }.
 *
 * @param {Array<{ name: string, lat: number, lon: number, heightFt: number, heightRef: string, kias: number }>} points
 * @param {{ startFuelLb: number, fuelFlowPph: number, minClearanceFt: number, windFor?: (i: number, ctx: { mid: { lat: number, lon: number }, altFt: number, startS: number }) => any,
 *   terrainFor?: (i: number) => any, fieldFt?: number, varE?: number }} options
 */
export function computeLegs(points, {
  startFuelLb, fuelFlowPph, minClearanceFt, windFor = () => null, terrainFor = () => null, fieldFt = FIELD_FT, varE = MAG_VARIATION_DEG_E,
}) {
  const legs = [];
  let runS = 0;
  let fuelUsed = 0;
  let complete = true;
  let distNm = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const geo = legGeometry(a, b);
    distNm += geo.distNm;
    const terrain = terrainFor(i);
    const ground = terrain?.status === 'ready' ? terrain.meanFt : NaN;
    const agl = a.heightRef === 'AGL';
    const altEstimated = agl && !Number.isFinite(ground);
    const altFt = agl ? (Number.isFinite(ground) ? ground : fieldFt) + a.heightFt : a.heightFt;
    const tasKt = iasToTasKt(a.kias, altFt);

    const found = windFor(i, { mid: geo.mid, altFt, startS: runS });
    const wind = found && Number.isFinite(found.fromDegT) && Number.isFinite(found.kt) ? { fromDegT: found.fromDegT, kt: found.kt } : null;
    const windNote = wind ? '' : (found?.none ?? '');
    const tri = windTriangle(geo.trackDegT, tasKt, wind?.fromDegT ?? 0, wind?.kt ?? 0);
    const timeS = tri.canHoldTrack && tri.groundSpeedKt > 0 ? (geo.distNm / tri.groundSpeedKt) * 3600 : NaN;
    const startS = runS;
    if (Number.isFinite(timeS)) runS += timeS;
    else complete = false;
    const fuelLeg = Number.isFinite(timeS) ? (fuelFlowPph * timeS) / 3600 : NaN;
    if (Number.isFinite(fuelLeg)) fuelUsed += fuelLeg;

    legs.push({
      i,
      from: a.name,
      to: b.name,
      trackDegT: geo.trackDegT,
      trackDegM: toMagnetic(geo.trackDegT, varE),
      headingDegM: toMagnetic(tri.headingDeg, varE),
      crabDeg: tri.crabDeg,
      distNm: geo.distNm,
      mid: geo.mid,
      altFt,
      altEstimated,
      heightFt: a.heightFt,
      heightRef: a.heightRef,
      kias: a.kias,
      tasKt,
      wind,
      windNote,
      gsKt: tri.groundSpeedKt,
      canHoldTrack: tri.canHoldTrack,
      timeS,
      startS,
      runS: complete ? runS : NaN,
      fuelUsedLb: fuelLeg,
      fuelRemLb: complete ? startFuelLb - fuelUsed : NaN,
      clearance: clearanceOf(a, terrain, minClearanceFt),
    });
  }
  return { legs, totals: { distNm, timeS: runS, fuelUsedLb: fuelUsed, fuelRemLb: startFuelLb - fuelUsed, complete } };
}

/**
 * A leg's clearance (spec, "Terrain clearance"; NP-4, NP-5): an AGL leg flies contouring, so its clearance is its height; an MSL leg's is its
 * altitude less the highest ground under it. Unknown ground gives no clearance for an MSL leg, unless the ground that did come is already
 * too high (then it is flagged, with `atMost`). Below the minimum is `low`: a flag, never a wall.
 */
export function clearanceOf(point, terrain, minClearanceFt) {
  const status = terrain?.status ?? 'unknown';
  const highestFt = status === 'ready' ? terrain.highestFt : NaN;
  const out = { ft: null, atMost: false, low: false, status, highestFt, highestAt: status === 'ready' ? terrain.highestAt : null, safeAltFt: Number.isFinite(highestFt) ? highestFt + minClearanceFt : NaN };
  if (point.heightRef === 'AGL') {
    out.ft = point.heightFt;
    out.low = point.heightFt < minClearanceFt;
    return out;
  }
  if (status === 'ready') {
    out.ft = point.heightFt - highestFt;
    out.low = out.ft < minClearanceFt;
    return out;
  }
  const known = terrain?.highestKnownFt;
  if (Number.isFinite(known) && point.heightFt - known < minClearanceFt) {
    out.ft = point.heightFt - known;
    out.atMost = true;
    out.low = true;
  }
  return out;
}

/** Seconds as "4:52" (minutes and seconds), or "—" when unknown. */
export function mmss(s) {
  if (!Number.isFinite(s)) return '—';
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** Seconds as "1:04:52" (hours, minutes, seconds) once an hour or more, else as mmss. */
export function hmmss(s) {
  if (!Number.isFinite(s)) return '—';
  const t = Math.round(s);
  if (t < 3600) return mmss(t);
  return `${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** A compass direction as three digits, 360 for north: "087". */
export const deg3 = (d) => String(Math.round(d) % 360 || 360).padStart(3, '0');
