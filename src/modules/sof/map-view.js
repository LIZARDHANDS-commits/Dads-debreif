// The SOF map's view math, without a page (SPEC-sof, "Map"): where a place
// goes on the map, the opening view, the rings, and which radar image to ask
// for. Pure: numbers in, numbers out.
//
// The map's world is the debrief's: local feet, x east and y north, from a
// reference point (core makeLocalRef), so ui-kit's canvas view and the VNC
// charts work on it as they are. The reference is the home field.
import { makeLocalRef, latLonToLocalFt, localFtToLatLon, mercatorY } from '../../core/geo.js';
import { FT_PER_M } from '../../core/units.js';

export const FT_PER_NM = 6076.11549;

/** V6's opening zoom (SPEC-sof, Map): web-map zoom 6, which shows southern Saskatchewan and the fields around it. */
export const HOME_ZOOM = 6;

/** The rings around home, in nautical miles (V6's "reference" circles). */
export const RING_NM = Object.freeze([25, 50]);

/** How far the map can be zoomed: the width it shows, in feet. About 10 NM to 2,500 NM across. */
export const SPAN_LIMITS = Object.freeze({ minSpan: 10 * FT_PER_NM, maxSpan: 2500 * FT_PER_NM });

const MAX_IMAGE_PX = 2048;
const MIN_IMAGE_PX = 16;
const IMAGE_SNAP_DEG = 0.1;
const MERCATOR_MAX_LAT = 85;

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/** The home field's place as the map uses it: { lat, lon, ref, toXY(lat, lon), toLatLon(x, y) }. */
export function createProjection(place) {
  const ref = makeLocalRef(place.lat, place.lon);
  return {
    lat: place.lat,
    lon: place.lon,
    ref,
    toXY: (lat, lon) => {
      const p = latLonToLocalFt(ref, lat, lon);
      return [p.x, p.y];
    },
    toLatLon: (x, y) => localFtToLatLon(ref, x, y),
  };
}

/** CSS pixels per foot for a web-map zoom at a latitude (the inverse of core pickTileZoom, without its rounding). */
export function pxPerFtForZoom(lat, zoom = HOME_ZOOM) {
  const metresPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
  return 1 / (metresPerPixel * FT_PER_M);
}

/** The opening view: home in the middle at V6's zoom. { cx, cy, scale }. */
export const homeView = (lat, zoom = HOME_ZOOM) => ({ cx: 0, cy: 0, scale: pxPerFtForZoom(lat, zoom) });

/** A ring's radius in CSS pixels at a scale (pixels per foot). */
export const ringRadiusPx = (nm, scale) => nm * FT_PER_NM * scale;

/** The view's edges in degrees, from its box in map feet: { north, south, west, east }. */
export function cornersOf(projection, { minX, minY, maxX, maxY }) {
  const points = [[minX, minY], [minX, maxY], [maxX, minY], [maxX, maxY]].map(([x, y]) => projection.toLatLon(x, y));
  return {
    north: Math.max(...points.map((p) => p.lat)),
    south: Math.min(...points.map((p) => p.lat)),
    west: Math.min(...points.map((p) => p.lon)),
    east: Math.max(...points.map((p) => p.lon)),
  };
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * The picture to ask ECCC for so the view is covered: the view's corners with a tenth of
 * its size to spare on every side, snapped outwards to a tenth of a degree (so a small pan
 * gives the same request), kept inside the map's latitudes and longitudes. The size keeps the
 * shape of the box in web mercator, at the view's own width (at most 2,048 pixels).
 * Returns { bbox: [west, south, east, north], width, height, key }, or null for a view that
 * isn't real (corners or size not numbers, or the box has no size).
 */
export function radarImageRequest(corners, size) {
  const { north, south, west, east } = corners ?? {};
  if (![north, south, west, east].every(isNumber) || !size || !isNumber(size.width) || !isNumber(size.height)) return null;
  if (size.width < 1 || size.height < 1 || north <= south || east <= west) return null;
  const padLat = (north - south) * 0.1;
  const padLon = (east - west) * 0.1;
  const snapDown = (v) => Math.floor(v / IMAGE_SNAP_DEG + 1e-9) * IMAGE_SNAP_DEG;
  const snapUp = (v) => Math.ceil(v / IMAGE_SNAP_DEG - 1e-9) * IMAGE_SNAP_DEG;
  const fix = (v) => Number(v.toFixed(1));
  const w = fix(clamp(snapDown(west - padLon), -180, 180));
  const e = fix(clamp(snapUp(east + padLon), -180, 180));
  const s = fix(clamp(snapDown(south - padLat), -MERCATOR_MAX_LAT, MERCATOR_MAX_LAT));
  const n = fix(clamp(snapUp(north + padLat), -MERCATOR_MAX_LAT, MERCATOR_MAX_LAT));
  if (!(e > w) || !(n > s)) return null;
  const across = ((e - w) * Math.PI) / 180;
  const down = mercatorY(n) - mercatorY(s);
  const width = clamp(Math.round(size.width * 1.2), MIN_IMAGE_PX, MAX_IMAGE_PX);
  const height = clamp(Math.round((width * down) / across), MIN_IMAGE_PX, MAX_IMAGE_PX);
  return { bbox: [w, s, e, n], width, height, key: `${w},${s},${e},${n},${width}x${height}` };
}

/**
 * Whether the picture held still covers the view well enough: the view's own corners lie inside
 * its box, and the view is not less than a third as wide as the picture (zoomed in far enough
 * that the picture would look coarse). `held` is a radarImageRequest, `corners` the view now.
 */
export function imageStillFits(held, corners) {
  const { north, south, west, east } = corners ?? {};
  if (!held || ![north, south, west, east].every(isNumber)) return false;
  const [hw, hs, he, hn] = held.bbox;
  const inside = west >= hw && east <= he && south >= hs && north <= hn;
  const zoomedIn = (east - west) * 3 < he - hw;
  return inside && !zoomedIn;
}

/**
 * A picture laid over a box of latitude and longitude, cut into strips so it lands right
 * whatever the projection between them: the picture is web mercator (latitude stretches with
 * distance from the equator), the map's feet are not. Each strip is
 * { sy, sh, north, south } (source rows in the picture, and the strip's latitudes).
 */
export function imageStrips(bbox, imageHeight, count = 12) {
  const [, south, , north] = bbox;
  const top = mercatorY(north);
  const bottom = mercatorY(south);
  const n = clamp(Math.floor(count), 1, imageHeight);
  const strips = [];
  const lat = (y) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * (180 / Math.PI);
  for (let i = 0; i < n; i++) {
    const sy0 = Math.round((i * imageHeight) / n);
    const sy1 = Math.round(((i + 1) * imageHeight) / n);
    if (sy1 <= sy0) continue;
    strips.push({
      sy: sy0,
      sh: sy1 - sy0,
      north: i === 0 ? north : lat(top + ((bottom - top) * sy0) / imageHeight),
      south: i === n - 1 ? south : lat(top + ((bottom - top) * sy1) / imageHeight),
    });
  }
  return strips;
}

/**
 * The item nearest a point within `radiusPx`, or null. `items` are { x, y } in pixels.
 * Ties go to the earlier item.
 */
export function nearestWithin(items, x, y, radiusPx) {
  let best = null;
  let bestD = radiusPx * radiusPx;
  for (const item of items) {
    const d = (item.x - x) ** 2 + (item.y - y) ** 2;
    if (best === null ? d <= bestD : d < bestD) {
      best = item;
      bestD = d;
    }
  }
  return best;
}
