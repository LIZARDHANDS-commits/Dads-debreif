// Moose Jaw's (CYMJ) runways from Patrick's measured points: the one copy (Patrick, 11 Oct 2026 20:47Z: "move the file to source and make
// it a single source of truth"). The Traffic sim reads them through its airfield.js, and the shared runway list (runway-ends.js, which the
// SOF and the Debrief draw) takes their latitude and longitude from here.
//
// Map coordinates are feet, x east and y north, about the field origin (CYMJ_ORIGIN, the Traffic sim's frame: its data/moose-jaw.json
// "anchor"). Measured on Esri's true-scale photo (TR-67, Patrick 5 Oct 00:27Z), about ±10 to 15 ft. For drawing and the Traffic sim's
// routes; never for planning or navigation.
import { makeLocalRef, localFtToLatLon } from '../core/geo.js';

/** The field origin the map feet are measured from: the same point as the Traffic sim's data/moose-jaw.json "anchor" (its 3D ARP). */
export const CYMJ_ORIGIN = Object.freeze({ lat: 50.3303, lon: -105.5592 });

/** Runway 29L threshold bar, map feet (data/moose-jaw.json point 0), measured on Esri's true-scale photo (about ±10 ft; TR-67). */
export const THRESHOLD_29L = Object.freeze({ x: 2796, y: -2776 });

/**
 * Runway 29L number base, map feet: where the 3° glide path ends, the aim point (Patrick, 6 Oct 06:33Z: "three degree
 * goes to the base of the numbers"). Patrick's point, 50.322977 N 105.547962 W (5 Oct 00:35Z), lies on the centreline
 * 207 ft past the threshold bar on Esri's true-scale photo.
 */
export const NUMBER_BASE_29L = Object.freeze({ x: 2614, y: -2677 });
export const NUMBER_BASE_PAST_THRESHOLD_FT = 207;

/**
 * Runway 29L departure end (the 11R threshold bar), map feet (data/moose-jaw.json point 1), measured the same way: 7,250 ft from the 29L
 * threshold at 298.6° true. The CAP aerodrome chart gives 7,280 ft (TR-67).
 */
export const DEPARTURE_END_29L = Object.freeze({ x: -3572, y: 690 });

/**
 * Runway 29R threshold bar and its departure end (the 11L threshold bar), map feet, measured on Esri's true-scale
 * photo (about ±15 ft; 5 Oct): 8,260 ft at 298.6° true, about 1,800 ft north-east of 29L. Drawn only (the 3D slab
 * and the painted ground); no route uses 29R.
 */
export const THRESHOLD_29R = Object.freeze({ x: 3622, y: -1189 });
export const DEPARTURE_END_29R = Object.freeze({ x: -3628, y: 2769 });

/**
 * Crossing runway 03/21, map feet: the NE-SW strip between 29L and the taxiway north of 29R, measured on Esri's true-scale
 * photo (about ±15 ft; 5 Oct). The 03 end is on the 29L centreline; about 3,060 ft at 44° true (35°M). Patrick named it
 * runway 03/21 (5 Oct 03:11Z; the NNW-SSE strip west of it is taxiway Echo). Drawn only; no route uses it.
 */
export const RUNWAY_03 = Object.freeze({ x: 55, y: -1284 });
export const RUNWAY_21 = Object.freeze({ x: 2175, y: 929 });

/** Runway widths, ft: 29L 150 (the painted ground's figure, which the photo matches), 29R about 150 (measured on Esri's photo, 6 Oct; was 200), 03/21 about 100 (photo). Estimates. */
export const RUNWAY_WIDTH_FT = Object.freeze({ '29L': 150, '29R': 150, '03': 100 });

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const ref = makeLocalRef(CYMJ_ORIGIN.lat, CYMJ_ORIGIN.lon);
/** A map-feet point as latitude and longitude about CYMJ_ORIGIN (core/geo.js's flat-earth frame, the one the Traffic sim draws in), 6 decimals. */
export function cymjLatLon(p) {
  const q = localFtToLatLon(ref, p.x, p.y);
  return { lat: r6(q.lat), lon: r6(q.lon) };
}

/** The three runways in the shared runway list's shape (runway-ends.js): each end's latitude and longitude, and the width. No elevations. */
export const CYMJ_RUNWAY_ENDS = Object.freeze({
  '03/21': Object.freeze({ a: cymjLatLon(RUNWAY_03), b: cymjLatLon(RUNWAY_21), widthFt: RUNWAY_WIDTH_FT['03'] }),
  '11L/29R': Object.freeze({ a: cymjLatLon(DEPARTURE_END_29R), b: cymjLatLon(THRESHOLD_29R), widthFt: RUNWAY_WIDTH_FT['29R'] }),
  '11R/29L': Object.freeze({ a: cymjLatLon(DEPARTURE_END_29L), b: cymjLatLon(THRESHOLD_29L), widthFt: RUNWAY_WIDTH_FT['29L'] }),
});
