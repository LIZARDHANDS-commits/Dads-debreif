// Reading ECCC's Lightning_2.5km_Density picture into lightning.js's samples, without a
// page (SPEC-sof, SOF-3, Map: Lightning). The near-home check does not use the map
// view's picture: it asks for a FIXED box around home, wide enough for the radius plus
// one cell each way, at ECCC's native 2.5 km grid, so the answer is the same whatever
// the map is showing.
//
// The picture is asked for in plain latitude and longitude (EPSG:4326), one pixel to a
// 2.5 km cell, so a pixel's place is a straight sum. A pixel that is see-through has no
// lightning; any other pixel is a cell with lightning, and its opacity is its strength
// (the layer's own colours are not read).
import { EARTH_RADIUS_M } from '../../core/units.js';
import { clampRadius, MAX_CELLS } from './lightning.js';

/** ECCC's native cell, in kilometres. */
export const CELL_KM = 2.5;

const NM_PER_DEG = (Math.PI / 180) * (EARTH_RADIUS_M / 1852);
const CELL_NM = (CELL_KM * 1000) / 1852;
const MAX_SIDE_PX = 2048;
const MIN_ALPHA_VALUE = 1 / 255;

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * The box to read: `{ bounds: { west, south, east, north }, width, height, cellKm }`, centred on
 * `home` ({ lat, lon }), reaching the radius plus one cell (rounded up to whole cells) each way,
 * one pixel to a cell. The radius is kept within 5 to 50 NM (lightning.js `clampRadius`).
 * Returns null when home is not a real place, or the box would leave the map or the size limit
 * (near the poles or the date line, which this screen is not for).
 */
export function lightningBox({ home, radiusNm } = {}) {
  if (!home || !isNumber(home.lat) || !isNumber(home.lon) || Math.abs(home.lat) > 85 || Math.abs(home.lon) > 180) return null;
  const cellsEachWay = Math.ceil((clampRadius(radiusNm) + CELL_NM) / CELL_NM) + 1; // the radius, a cell, and a cell of margin for rounding
  const dLat = CELL_NM / NM_PER_DEG;
  const dLon = dLat / Math.cos((home.lat * Math.PI) / 180);
  const bounds = {
    west: home.lon - cellsEachWay * dLon,
    east: home.lon + cellsEachWay * dLon,
    south: home.lat - cellsEachWay * dLat,
    north: home.lat + cellsEachWay * dLat,
  };
  const side = cellsEachWay * 2;
  if (side > MAX_SIDE_PX || bounds.west < -180 || bounds.east > 180 || bounds.south < -85 || bounds.north > 85) return null;
  return { bounds, width: side, height: side, cellKm: CELL_KM };
}

/**
 * Reads the picture as lightning.js wants it. `image`: `{ data, width, height }` as a canvas's
 * getImageData gives (RGBA bytes, row by row from the top left). `box`: what `lightningBox`
 * returned for the picture that was asked for.
 *
 * Returns `{ samples, coverage }`: `samples` is `[{ lat, lon, value }]` for each pixel that is
 * not see-through (value is its opacity, above 0 and up to 1, at the pixel's centre), and
 * `coverage` is `{ bounds, cellsRead }` with `cellsRead` every pixel read, see-through ones too.
 * Returns null when the picture is not the size that was asked for or holds no readable data,
 * so the caller passes lightning.js "no data" rather than a clear sky.
 */
export function decodeDensity(image, box) {
  if (!box || !image || !Number.isInteger(image.width) || !Number.isInteger(image.height) || !image.data) return null;
  const { width, height } = image;
  if (width !== box.width || height !== box.height || width < 1 || height < 1) return null;
  if (typeof image.data.length !== 'number' || image.data.length !== width * height * 4) return null;
  const { west, east, south, north } = box.bounds;
  const dLon = (east - west) / width;
  const dLat = (north - south) / height;
  const samples = [];
  const data = image.data;
  for (let y = 0; y < height && samples.length <= MAX_CELLS; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (!(alpha > 0)) continue;
      if (samples.length > MAX_CELLS) break; // lightning.js says "too many" past this; no need to keep more
      samples.push({
        lat: Number((north - (y + 0.5) * dLat).toFixed(5)),
        lon: Number((west + (x + 0.5) * dLon).toFixed(5)),
        value: Math.max(MIN_ALPHA_VALUE, Number((alpha / 255).toFixed(3))),
      });
    }
  }
  return { samples, coverage: { bounds: { ...box.bounds }, cellsRead: width * height } };
}
