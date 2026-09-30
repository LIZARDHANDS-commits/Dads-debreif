// Great-circle distance between two airfields, for the 100 NM GNSS rule (D73).
import { EARTH_RADIUS_M } from '../core/units.js';

const M_PER_NM = 1852;
const RAD = Math.PI / 180;
const readable = (p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon);

/** Nautical miles between two { lat, lon } points, to 0.1 NM. Null if either position is missing. */
export function greatCircleNm(a, b) {
  if (!readable(a) || !readable(b)) return null;
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  const nm = 2 * Math.asin(Math.min(1, Math.sqrt(h))) * EARTH_RADIUS_M / M_PER_NM;
  return Math.round(nm * 10) / 10;
}
