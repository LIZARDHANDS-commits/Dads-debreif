// Smoother live traffic (SPEC-sof, "Live traffic layer", SOF-39 phase 4; Dad, 7 Oct: "how fast can we update ... a disappearing trail"): the two
// small pieces of arithmetic and memory that both the 2D layer and the 3D view share, decided without a page.
//
// - Gliding: between the relay's answers an aircraft is drawn where it should be by now, its last reported position moved along its reported
//   track at its reported ground speed for the age of that position (dead reckoning: distance = speed x time, no flight physics). The age is the
//   reply's own `seen` plus the time since the reply (traffic.js `layerModel`'s `ageS`), so a new answer lands where the glide already had the
//   aircraft. The glide stops after GLIDE_MAX_S: after that the aircraft holds still and fades as before, so a relay that has gone quiet never
//   sends aircraft flying on for minutes. An aircraft with no track, no speed or on the ground never glides.
// - Trails: the last TRAIL_WINDOW_S seconds of reported positions of each aircraft (up to TRAIL_MAX_AIRCRAFT of them, T-6s first), kept in memory
//   for this visit only and cleared when the Traffic layer goes off. Each position is stamped with the time it was true (the answer's time minus
//   its age), so a late answer does not bend the line.
//
// Speeds are ground speed in knots, tracks are true degrees, positions are the map's local feet (x east, y north) or latitude and longitude.
import { FT_PER_NM } from './map-view.js';

/** The longest an aircraft is glided past its last report, in seconds. After it the aircraft holds and fades as it did. An estimate, SOF-39. */
export const GLIDE_MAX_S = 15; // estimate
/** The 3D view moves the aircraft at most this often (about ten a second), and the 2D layer is redrawn for the glide at most this often (once a second). */
export const GLIDE_3D_MS = 100;
export const GLIDE_2D_MS = 1000;
/** How much history a trail shows, and how many aircraft get one (T-6s first, then the relay's order, nearest home first). Estimates, SOF-39. */
export const TRAIL_WINDOW_S = 120; // estimate
export const TRAIL_MAX_AIRCRAFT = 150; // estimate, as the 3D view's MAX_3D_AIRCRAFT
/** The relay's type code for the T-6 (as scene3d-model.js `T6_TYPE`; this file does not import the 3D model). */
const T6 = 'TEX2';

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const rad = (d) => (d * Math.PI) / 180;

/** Whether an aircraft (traffic.js `layerModel`'s) can be glided: in the air, with a track and a ground speed above zero, and an age. */
export function canGlide(a) {
  return Boolean(a) && a.onGround !== true && a.altitudeFt !== 'ground' && a.hasTrack === true && isNumber(a.gs) && a.gs > 0 && isNumber(a.ageS);
}

/** The velocity in feet per second, east and north, from ground speed (kt) and track (true), or null when the aircraft cannot be glided. 1 kt is 1 NM an hour. */
export function velocityFt(a) {
  if (!canGlide(a)) return null;
  const ftPerS = (a.gs * FT_PER_NM) / 3600;
  return { vx: ftPerS * Math.sin(rad(a.rotationDeg)), vy: ftPerS * Math.cos(rad(a.rotationDeg)) };
}

/** How long to glide for an age (and any time since it was worked out), in seconds: never negative and never more than GLIDE_MAX_S. */
export const glideSeconds = (ageS, extraS = 0) => Math.min(GLIDE_MAX_S, Math.max(0, (isNumber(ageS) ? ageS : 0) + extraS));

/**
 * Where an aircraft is by now in latitude and longitude, for the 2D layer: its reported position moved along its track by its ground speed for
 * glideSeconds(ageS). Returns { lat, lon, glided }; with nothing to glide it is the reported position and `glided` is false.
 */
export function glideLatLon(a) {
  const v = velocityFt(a);
  if (!v) return { lat: a.lat, lon: a.lon, glided: false };
  const s = glideSeconds(a.ageS);
  const lat = a.lat + (v.vy * s) / FT_PER_NM / 60;
  const lon = a.lon + (v.vx * s) / FT_PER_NM / 60 / Math.max(0.01, Math.cos(rad(a.lat)));
  return { lat, lon, glided: s > 0 };
}

/**
 * Where an item of the 3D scene (scene3d-model.js `sceneTraffic`'s: x, y at the report, `vx` and `vy` in ft/s or null, `ageS` at `t0`) is at time
 * `tMs`, in the map's feet. An item with no velocity stays at the report.
 */
export function glideXY(item, tMs) {
  if (!isNumber(item.vx) || !isNumber(item.vy) || !isNumber(item.t0)) return { x: item.x, y: item.y };
  const s = glideSeconds(item.ageS, (tMs - item.t0) / 1000);
  return { x: item.x + item.vx * s, y: item.y + item.vy * s };
}

/**
 * The trails' memory. `record(aircraft, at)` takes one answer: `aircraft` as traffic.js `layerModel` makes them for the moment the answer came
 * (so `ageS` is the position's own age), `at` that moment in milliseconds. Only the first `max` aircraft are kept, T-6s first; an aircraft not
 * in the answer loses its trail (never a line drawn across a gap). A position not newer than the last one, or the same place, is not added.
 * `get(hex)` is [{ t, lat, lon, alt }] oldest first (t in ms, alt feet, 'ground' or null); `clear()` forgets everything; `size` counts the aircraft.
 */
export function createTrails({ windowS = TRAIL_WINDOW_S, max = TRAIL_MAX_AIRCRAFT } = {}) {
  const byHex = new Map();
  return {
    record(aircraft, at) {
      if (!isNumber(at)) return;
      const chosen = [...aircraft.filter((a) => a.type === T6), ...aircraft.filter((a) => a.type !== T6)].slice(0, max);
      const keep = new Set();
      for (const a of chosen) {
        if (!isNumber(a.lat) || !isNumber(a.lon)) continue;
        keep.add(a.hex);
        const list = byHex.get(a.hex) ?? [];
        const t = at - Math.round((isNumber(a.ageS) ? a.ageS : 0) * 1000);
        const last = list.at(-1);
        if (!last || (t > last.t && (last.lat !== a.lat || last.lon !== a.lon))) {
          list.push({ t, lat: a.lat, lon: a.lon, alt: a.altitudeFt === 'ground' || isNumber(a.altitudeFt) ? a.altitudeFt : null });
        }
        while (list.length && list[0].t < at - windowS * 1000) list.shift();
        byHex.set(a.hex, list);
      }
      for (const hex of [...byHex.keys()]) if (!keep.has(hex)) byHex.delete(hex);
    },
    get: (hex) => byHex.get(hex) ?? [],
    clear: () => byHex.clear(),
    get size() {
      return byHex.size;
    },
    windowS,
  };
}

/** How solid a trail position is at `tMs` for the moment `nowMs`: 1 now, falling in a straight line to 0 at the end of the window. */
export const trailAlpha = (tMs, nowMs, windowS = TRAIL_WINDOW_S) => Math.min(1, Math.max(0, 1 - (nowMs - tMs) / (windowS * 1000)));
