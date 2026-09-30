// Reading ECCC's Lightning_2.5km_Density picture into lightning.js's samples, without a
// page (SPEC-sof, SOF-3, Map: Lightning). The near-home check does not use the map
// view's picture: it asks for a FIXED box around home, wide enough for the radius plus
// one cell each way, at ECCC's native 2.5 km grid, so the answer is the same whatever
// the map is showing.
//
// The picture is asked for in plain latitude and longitude (EPSG:4326), two pixels to a
// 2.5 km cell each way (1.25 km pixels), so a pixel's place is a straight sum. A pixel that is see-through has no
// lightning; any other pixel is a cell with lightning (the layer's own colours are not read).
// `value` is the pixel's opacity, but ECCC's real lit pixels are all fully opaque (alpha 255, colour
// (0,0,190), measured in sof-recheck-207), so in practice every cell reads 1: a single flash and a
// storm look the same, and the layer gives no strength.
import { EARTH_RADIUS_M } from '../../core/units.js';
import { clampRadius, MAX_CELLS } from './lightning.js';

/** ECCC's native cell, in kilometres. */
export const CELL_KM = 2.5;

const NM_PER_DEG = (Math.PI / 180) * (EARTH_RADIUS_M / 1852);
const CELL_NM = (CELL_KM * 1000) / 1852;
/**
 * Pixels to a cell, each way. ECCC's cells are squares on their own grid, which ours is not aligned to: sampled once per
 * cell, an isolated cell could fall between two samples and read as clear. Twice per cell (1.25 km pixels) cannot.
 */
const SAMPLES_PER_CELL = 2;
const MAX_SIDE_PX = 160; // 50 NM, the biggest radius: 40 cells each way x 2 cells x 2 pixels
const MIN_ALPHA_VALUE = 1 / 255;

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * The box to read: `{ bounds: { west, south, east, north }, width, height, cellKm }`, centred on
 * `home` ({ lat, lon }), reaching the radius plus one cell (rounded up to whole cells) each way,
 * two pixels to a cell each way (see SAMPLES_PER_CELL). The radius is kept within 5 to 50 NM (lightning.js `clampRadius`).
 * Returns null when home is not a real place, or the box would leave the map or the size limit
 * (near the poles or the date line, which this screen is not for).
 */
export function lightningBox({ home, radiusNm } = /** @type {any} */ ({})) {
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
  const side = cellsEachWay * 2 * SAMPLES_PER_CELL;
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

// ---- Drawing the lightning layer so it can be seen (sof-recheck-207 F4) ---------------------------------------------

/**
 * The mark drawn for each lit cell of the lightning layer: a bright yellow fill with a near-black outline.
 * ECCC draws lit pixels as dark blue (0,0,190), which measured 1.02 to 1.41 : 1 against the satellite. Yellow stands out
 * from the dark satellite and the dark outline from the pale VNC chart, and the two are 3 : 1 or better against each
 * other, so a cell reads on either base (tests/unit/sof/map-lightning.test.js pins 3 : 1 for each base map).
 * Only the drawing changes: the near-home check reads ECCC's own picture (`decodeDensity`), never this one.
 */
export const LIGHTNING_MARK = Object.freeze({ fill: Object.freeze([255, 232, 0]), outline: Object.freeze([16, 16, 16]) });

const FILL_REACH_PX = 1; // a lit pixel becomes a 3 x 3 fill ...
const OUTLINE_REACH_PX = 2; // ... inside a 5 x 5 outline: at least 5 pixels across, 3 of them fill
const MAX_LIT_FRACTION = 0.25; // more lit than this is not weather (a real picture has a handful of pixels): fill only, no outline, so cost stays linear

/**
 * The lightning picture redrawn for the map: `image` is `{ data, width, height }` (RGBA, as a canvas's getImageData
 * gives). Each pixel that is not see-through becomes the fill, with the outline round it; everything else is see-through.
 * Returns a new `{ data, width, height }` (the input is not changed), or null when the picture is not readable.
 */
export function recolourLightning(image) {
  if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) || !image.data) return null;
  const { width, height, data } = image;
  if (width < 1 || height < 1 || data.length !== width * height * 4) return null;
  const out = new Uint8ClampedArray(data.length);
  const paint = (cx, cy, reach, /** @type {readonly number[]} */ rgb) => {
    const [r, g, b] = rgb;
    for (let y = Math.max(0, cy - reach); y <= Math.min(height - 1, cy + reach); y++) {
      for (let x = Math.max(0, cx - reach); x <= Math.min(width - 1, cx + reach); x++) {
        const i = (y * width + x) * 4;
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
        out[i + 3] = 255;
      }
    }
  };
  const lit = [];
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) lit.push((i - 3) / 4);
  if (lit.length > width * height * MAX_LIT_FRACTION) {
    // A mostly-lit picture (a hostile or broken reply) would cost 25 writes a pixel: draw each lit pixel as the fill alone.
    for (const p of lit) paint(p % width, Math.floor(p / width), 0, LIGHTNING_MARK.fill);
    return { data: out, width, height };
  }
  // Outlines first, so a neighbour's outline never covers a fill.
  for (const p of lit) paint(p % width, Math.floor(p / width), OUTLINE_REACH_PX, LIGHTNING_MARK.outline);
  for (const p of lit) paint(p % width, Math.floor(p / width), FILL_REACH_PX, LIGHTNING_MARK.fill);
  return { data: out, width, height };
}
