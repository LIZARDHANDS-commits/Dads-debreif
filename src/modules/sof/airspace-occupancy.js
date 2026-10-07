// Who is inside which airspace, decided without a page (SPEC-sof, "3D view", SOF-39, Dad 7 Oct): for each aircraft in the traffic feed, the
// airspace volumes (airspace-model.js `checkedAirspace`) it is inside, horizontally and vertically. Pure: volumes, aircraft, the home
// elevation and a time go in, plain data comes out. Nothing here raises or clears a caution; it is information for the SOF.
//
// Horizontal: a polygon's sides are great circles (DAH 1.1.0-8), so the point is tested on a gnomonic map centred on the polygon, where every
// great circle is a straight line and a plain point-in-polygon test is exact; a circle is tested by great-circle distance in NM.
// Vertical: feet above sea level, the floor and the ceiling both inclusive (DAH 1.1.0-12: altitudes are inclusive unless "above" or "below" is
// written). The volumes come with their limits already in feet above sea level: SFC is the home field's elevation, AGL is that plus the
// height (flat ground, an estimate), FL is read as feet above sea level (an approximation). The aircraft's own height is the feed's barometric
// altitude in feet, taken as altitude (an approximation, as for FL). "ground" is taken as the home field's elevation (an estimate), so an
// aircraft on the ground is only inside a volume that starts at the surface. An aircraft with no height is "height unknown": listed as
// possibly inside when it is horizontally inside.

import { aircraftName, T6_TYPE } from './scene3d-model.js';

/**
 * The advisory areas Dad wants watched for aircraft that are not T-6s (Dad, 7 Oct): CYA304, CYA305 and CYA307 (Moose Jaw (M) areas).
 * A list to edit; each id must be one in airspace-data.js.
 */
export const WATCHED_AREAS = Object.freeze(['CYA304', 'CYA305', 'CYA307']);

/** Earth's mean radius in nautical miles (6,371 km over 1.852), the sphere the DAH's arcs and the great-circle distances use here. */
const EARTH_RADIUS_NM = 3440.065;

const rad = (d) => (d * Math.PI) / 180;
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/** The great-circle distance between two points in NM (haversine). */
export function distanceNm(latA, lonA, latB, lonB) {
  const dLat = rad(latB - latA);
  const dLon = rad(lonB - lonA);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(latA)) * Math.cos(rad(latB)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** A point on the gnomonic map centred on (lat0, lon0): [x, y] in radians of arc, or null when it is not in the centre's hemisphere. */
function gnomonic(centre, lat, lon) {
  const phi = rad(lat);
  const dLon = rad(lon) - centre.lon;
  const cosC = centre.sin * Math.sin(phi) + centre.cos * Math.cos(phi) * Math.cos(dLon);
  if (cosC <= 1e-9) return null;
  return [(Math.cos(phi) * Math.sin(dLon)) / cosC, (centre.cos * Math.sin(phi) - centre.sin * Math.cos(phi) * Math.cos(dLon)) / cosC];
}

/** What is worked out once for a volume's outline (kept by its shape object, so a list checked again does not redo it). */
const prepared = new WeakMap();

function prepare(shape) {
  let p = prepared.get(shape);
  if (p) return p;
  if (shape.type === 'circle') {
    p = { type: 'circle', lat: shape.centre[0], lon: shape.centre[1], radiusNm: shape.radiusNm };
  } else {
    // The centre of the outline: the mean of its points as vectors on the sphere, so it sits inside the hemisphere the map covers.
    let x = 0;
    let y = 0;
    let z = 0;
    for (const [lat, lon] of shape.points) {
      x += Math.cos(rad(lat)) * Math.cos(rad(lon));
      y += Math.cos(rad(lat)) * Math.sin(rad(lon));
      z += Math.sin(rad(lat));
    }
    const lat0 = Math.atan2(z, Math.hypot(x, y));
    const centre = { sin: Math.sin(lat0), cos: Math.cos(lat0), lon: Math.atan2(y, x) };
    const ring = shape.points.map(([lat, lon]) => gnomonic(centre, lat, lon));
    const usable = ring.every((pt) => pt !== null);
    const xs = ring.filter(Boolean).map((pt) => pt[0]);
    const ys = ring.filter(Boolean).map((pt) => pt[1]);
    p = { type: 'polygon', centre, ring: usable ? ring : null, box: usable ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : null };
  }
  prepared.set(shape, p);
  return p;
}

/**
 * Whether a point is inside a shape horizontally ({ type: 'polygon', points: [[lat, lon], ...] } or { type: 'circle', centre: [lat, lon],
 * radiusNm }). A point exactly on the edge counts as inside for a circle and is either way for a polygon (too thin to matter at these sizes).
 */
export function insideShape(shape, lat, lon) {
  if (!isNumber(lat) || !isNumber(lon)) return false;
  const p = prepare(shape);
  if (p.type === 'circle') return distanceNm(p.lat, p.lon, lat, lon) <= p.radiusNm;
  if (!p.ring) return false;
  const pt = gnomonic(p.centre, lat, lon);
  if (!pt) return false;
  const [x, y] = pt;
  const [minX, minY, maxX, maxY] = p.box;
  if (x < minX || x > maxX || y < minY || y > maxY) return false;
  let inside = false;
  const { ring } = p;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Which volumes each aircraft is inside. `volumes` are `checkedAirspace(list, groundFt).volumes` (each with `id`, `shape`, `floorFt` and `ceilingFt`
 * in feet above sea level); `aircraft` are the traffic feed's ({ hex, lat, lon, alt } with `alt` in feet or 'ground', or the layer model's
 * `altitudeFt`); `groundFt` is the home elevation, which 'ground' is taken as; `at` is the time of the answer (a Date or milliseconds).
 *
 * Returns { at, byHex: Map(hex -> { inside: [id, ...], possibly: [id, ...] }) } with an entry for every aircraft: `inside` are the volumes it is
 * horizontally inside and between the floor and the ceiling of (both inclusive); `possibly` are those it is horizontally inside but has no
 * height for, so it may be inside. Volume ids are in the list's order.
 */
export function occupancy({ volumes = [], aircraft = [], groundFt = 0, at = 0 } = /** @type {any} */ ({})) {
  const byHex = new Map();
  for (const a of aircraft) {
    const inside = [];
    const possibly = [];
    const alt = a.alt ?? a.altitudeFt;
    const ft = alt === 'ground' ? groundFt : isNumber(alt) ? alt : null;
    for (const v of volumes) {
      if (!insideShape(v.shape, a.lat, a.lon)) continue;
      if (ft === null) possibly.push(v.id);
      else if (ft >= v.floorFt && ft <= v.ceilingFt) inside.push(v.id);
    }
    byHex.set(a.hex, { inside, possibly });
  }
  return { at: +at, byHex };
}

/** Whether an aircraft is a T-6 (relay type TEX2). An aircraft with no type is not one: in a watched area it is an intruder, and its type is said to be unknown. */
export const isT6 = (a) => a.type === T6_TYPE;

/**
 * The aircraft that are not T-6s inside (or possibly inside) any of the `watched` area ids, from `occupancy`'s answer. Returns
 * [{ hex, name, type, id, ft, possible }], in the feed's order, one entry for each aircraft and area; `ft` is its height ('ground', a number or null
 * for height unknown) and `possible` is true when only its horizontal position is known to be inside.
 */
export function intruders({ result, aircraft, watched = WATCHED_AREAS }) {
  const out = [];
  for (const a of aircraft) {
    if (isT6(a)) continue;
    const here = result.byHex.get(a.hex);
    if (!here) continue;
    const alt = a.alt ?? a.altitudeFt;
    const ft = alt === 'ground' ? 'ground' : isNumber(alt) ? alt : null;
    for (const id of watched) {
      const certain = here.inside.includes(id);
      if (certain || here.possibly.includes(id)) out.push({ hex: a.hex, name: aircraftName(a), type: a.type ?? null, id, ft, possible: !certain });
    }
  }
  return out;
}
