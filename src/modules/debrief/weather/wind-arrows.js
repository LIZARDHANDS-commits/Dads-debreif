// Wind arrows on the 2D map (SPEC-debrief: Winds aloft; task 12e-2): the
// model wind at a height you choose, at a 3 x 3 grid of points over the
// flight. Plain values in and out, so it's tested in Node; index.js feeds it
// and map2d/layers.js draws what it works out. Times are seconds since 1970.
import { flightBounds } from '../state.js';
import { localFtToLatLon } from '../../../core/geo.js';
import { windAt, windWords } from './winds.js';

/** The height box: feet above sea level, 8,000 ft at first (inside the Low block), steps of 500. */
export const ARROW_HEIGHT = Object.freeze({ default: 8000, min: 2000, max: 30000, step: 500 });

/** Holds a stored height to the box and its steps; nonsense gives the default. */
export function clampArrowFt(ft) {
  if (typeof ft !== 'number' || !Number.isFinite(ft)) return ARROW_HEIGHT.default;
  const stepped = Math.round(ft / ARROW_HEIGHT.step) * ARROW_HEIGHT.step;
  return Math.min(ARROW_HEIGHT.max, Math.max(ARROW_HEIGHT.min, stepped));
}

/**
 * The box round every track, in degrees: { minLat, maxLat, minLon, maxLon },
 * or null with no flight or no reference. It is the box in map feet taken
 * back through the flight's reference, so every fix lies inside it.
 */
export function flightLatLonBounds(flight) {
  const box = flightBounds(flight);
  if (!box || !flight.ref) return null;
  const sw = localFtToLatLon(flight.ref, box.minX, box.minY);
  const ne = localFtToLatLon(flight.ref, box.maxX, box.maxY);
  return { minLat: sw.lat, maxLat: ne.lat, minLon: sw.lon, maxLon: ne.lon };
}

/**
 * Remembers the last result of compute(...inputs) and gives it again while
 * every input is the same (compared with ===), so a pan or a zoom while paused,
 * which draws again with the same time, height and reply, doesn't work the
 * arrows out again, and the same list of arrows comes back to be reused.
 */
export function lastResult(compute) {
  let inputs = null;
  let result;
  return (...next) => {
    if (inputs && inputs.length === next.length && inputs.every((v, i) => v === next[i])) return result;
    result = compute(...next);
    inputs = next;
    return result;
  };
}

const round2 =(v) => Math.round(v * 100) / 100;

/**
 * The 3 x 3 grid over a box: the corners, the middles of the edges and the
 * centre, each rounded to 0.01° (about 1 km, all the model resolves). South
 * first, then west to east. A place the rounding repeats is kept once, so a
 * flight that stayed over one spot gets one point. [] for no box.
 */
export function windGridPoints(box) {
  if (!box || ![box.minLat, box.maxLat, box.minLon, box.maxLon].every(Number.isFinite)) return [];
  const points = [];
  const seen = new Set();
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const lat = round2(box.minLat + ((box.maxLat - box.minLat) * i) / 2);
      const lon = round2(box.minLon + ((box.maxLon - box.minLon) * j) / 2);
      const key = `${lat} ${lon}`;
      if (seen.has(key)) continue;
      seen.add(key);
      points.push({ lat, lon });
    }
  }
  return points;
}

/**
 * The wind at each grid point at height altFt (above sea level) at moment t:
 * the same blend as the Lead line's (windAt: between the levels either side by
 * height, between the model hours either side by time, leaving out the levels
 * under that point's own ground, which readWinds kept on its list of hours).
 * grid: one list of hours per point (readWindsGrid). Returns, per point,
 * { lat, lon, wind, hoursT, why }: wind is { dirDeg, kt } (where the wind
 * blows from) or null, with why 'time' (no model hour in force), 'below' (under
 * the lowest level above the ground there) or 'above' (over the highest).
 * options: { fieldFt }, a ground height for a reply that gave none.
 */
export function windArrowsAt(grid, points, t, altFt, { fieldFt = NaN } = {}) {
  return points.map((point, i) => {
    const found = windAt(grid?.[i] ?? [], t, altFt, { fieldFt });
    if (!found) return { ...point, wind: null, hoursT: [], why: 'time' };
    if (found.wind) return { ...point, wind: found.wind, hoursT: found.hoursT, why: null };
    const lowest = found.levels[0]?.heightFt;
    return { ...point, wind: null, hoursT: found.hoursT, why: lowest === undefined || altFt < lowest ? 'below' : 'above' };
  });
}

/** An arrow's length in CSS pixels: `perKt` a knot, held between `min` and `max` so a light wind is still seen and a jet stream doesn't cross the map. */
export const ARROW_PX = Object.freeze({ min: 16, max: 72, perKt: 1 });

/**
 * Where an arrow's head is from its tail, on the screen (x right, y down, so
 * north is up): { dx, dy, lengthPx }. The wind's direction is where it blows
 * from, so the arrow points the opposite way, downwind, the way the air moves.
 * A calm wind (the speed rounds to 0 kt, which the words call "calm") has no
 * direction to point: { dx: 0, dy: 0, lengthPx: 0, calm: true }.
 */
export function arrowVector({ dirDeg, kt }) {
  if (Math.round(kt) === 0) return { dx: 0, dy: 0, lengthPx: 0, calm: true };
  const lengthPx = Math.min(ARROW_PX.max, Math.max(ARROW_PX.min, kt * ARROW_PX.perKt));
  const r = (dirDeg * Math.PI) / 180;
  return { dx: -Math.sin(r) * lengthPx, dy: Math.cos(r) * lengthPx, lengthPx };
}

/** The label beside an arrow: "280°T/38 kt", the Lead line's words (true direction it blows from, knots). */
export const arrowLabel = windWords;

const feet = (ft) => `${ft.toLocaleString('en-US')} ft`;
const hourZ = (s) => new Date(s * 1000).toISOString().slice(11, 13);

/** The line under the map: "Model wind at 8,000 ft (HRDPS 18–19Z, Open-Meteo)", naming the model, its hour(s) and the source it must be credited to. */
export function arrowCaption(altFt, modelLabel, hoursT) {
  const hours = hoursT.length === 2 ? `${hourZ(hoursT[0])}–${hourZ(hoursT[1])}Z` : `${hourZ(hoursT[0])}Z`;
  return `Model wind at ${feet(altFt)} (${modelLabel} ${hours}, Open-Meteo)`;
}

const WHY = { below: "below the model's lowest level", above: "above the model's highest level" };

/**
 * The small status line in the Weather menu: how many points have an arrow,
 * and why the rest have none ("no model wind at 2,000 ft here (below the
 * model's lowest level)"). arrows: windArrowsAt's result. '' with none.
 */
export function arrowStatus(arrows, altFt, modelLabel) {
  if (!arrows.length) return '';
  const missing = arrows.filter((a) => !a.wind);
  if (!missing.length) return `${arrows.length} of ${arrows.length} points have model wind`;
  if (missing.every((a) => a.why === 'time')) return `no ${modelLabel} wind for this time`;
  const why = WHY[missing.find((a) => a.why !== 'time').why];
  const where = missing.length === arrows.length ? 'here' : `at ${missing.length} of ${arrows.length} points`;
  return `no model wind at ${feet(altFt)} ${where} (${why})`;
}
