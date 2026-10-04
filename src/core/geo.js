// Map projections, exactly as V6 uses them (R9).
// Line numbers refer to original/shell.html unless a sub-page is named.
import { EARTH_RADIUS_M, FT_PER_M } from './units.js';
import { radToDeg } from './angles.js';

/**
 * Reference point for the debrief's flat local map: x east and y north in
 * feet from (lat, lon). V6 uses the first point of the first loaded track
 * (`projectAll`, line 2376).
 */
export function makeLocalRef(lat, lon, radiusM = EARTH_RADIUS_M) {
  return { lat, lon, lat0: lat * Math.PI / 180, R: radiusM };
}

/**
 * Latitude/longitude to local feet (`projectAll` line 2379, `kLatLonToLocal` line 2507).
 * Null when there is no reference yet, as in V6.
 */
export function latLonToLocalFt(ref, lat, lon) {
  if (!ref) return null;
  return {
    x: (lon - ref.lon) * Math.PI / 180 * Math.cos(ref.lat0) * ref.R * FT_PER_M,
    y: (lat - ref.lat) * Math.PI / 180 * ref.R * FT_PER_M,
  };
}

/** Local feet back to latitude/longitude (`kLocalToLatLon`, line 2500). Null without a reference, as in V6. */
export function localFtToLatLon(ref, x, y) {
  if (!ref) return null;
  return {
    lat: ref.lat + (y / (FT_PER_M * ref.R)) * 180 / Math.PI,
    lon: ref.lon + (x / (FT_PER_M * ref.R * Math.cos(ref.lat0))) * 180 / Math.PI,
  };
}

/** Straight-line distance between two {x, y} points (Turn Sim `dist`, line 1688). */
export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Web Mercator tile holding a point at zoom z (`lonLatToTile`, line 2514). */
export function lonLatToTile(lon, lat, z) {
  const n = 2 ** z, latRad = lat * Math.PI / 180;
  return {
    x: Math.floor((lon + 180) / 360 * n),
    y: Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n),
  };
}

/** Edges in degrees of Web Mercator tile (x, y, z) (`tileBounds`, line 2518). */
export function tileBounds(x, y, z) {
  const n = 2 ** z;
  return {
    north: radToDeg(Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)))),
    south: radToDeg(Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n)))),
    west: x / n * 360 - 180,
    east: (x + 1) / n * 360 - 180,
  };
}

/**
 * Tile zoom level for the debrief map (`pickTileZoom`, line 2525).
 * zoomPxPerFt is the viewer's zoom (V6's global `kmlZoom`, CSS pixels per foot).
 */
export function pickTileZoom(centerLat, zoomPxPerFt) {
  const metersPerCssPixel = (1 / zoomPxPerFt) / FT_PER_M;
  const z = Math.round(Math.log2(156543.03392 * Math.cos(centerLat * Math.PI / 180) / Math.max(metersPerCssPixel, 0.01)));
  return Math.max(1, Math.min(19, z));
}

/** Mercator y (unitless) for a latitude in degrees (`mercatorY`, line 2585). */
export function mercatorY(lat) {
  const r = lat * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + r / 2));
}

/** Latitude in degrees for a Mercator y (`invMercatorY`, line 2589). */
export function invMercatorY(v) {
  return (2 * Math.atan(Math.exp(v)) - Math.PI / 2) * 180 / Math.PI;
}

/** World pixel of a point at zoom z, 256 px tiles (Traffic page `lonLatToPixel`, traffic line 250). */
export function lonLatToWorldPixel(lon, lat, z) {
  const n = 2 ** z;
  const sin = Math.sin(lat * Math.PI / 180);
  return {
    x: (lon + 180) / 360 * n * 256,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * n * 256,
  };
}

/**
 * Where point p sits against the straight leg from a to b, in feet, with x
 * east and y north: alongFt is the distance along the leg from a (negative
 * before a), crossFt is the distance off it, positive to the right of the
 * direction a to b. A leg shorter than a millionth of a foot gives zeros.
 */
export function legOffsetsFt(a, b, p) {
  const dx = p.x - a.x;
  const dy = p.y - a.y;
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) return { alongFt: 0, crossFt: 0 };
  const tau = Math.atan2(b.x - a.x, b.y - a.y);
  return { alongFt: dx * Math.sin(tau) + dy * Math.cos(tau), crossFt: dx * Math.cos(tau) - dy * Math.sin(tau) };
}
