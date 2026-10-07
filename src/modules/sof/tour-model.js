// The 3D view's Tour (SPEC-sof, "3D view", SOF-39; Dad, 7 Oct): with Orbit turning, the camera visits a list of targets in turn, about TOUR_DWELL_S seconds at each, flying
// smoothly from one to the next. What to visit, in which order, how close to frame it, what the caption says and where the camera is part-way through a fly are decided here,
// without a page or three.js; view3d.js moves the camera and shows the caption. A picture for situational awareness: it moves a camera and checks nothing.
//
// The targets are one named list, TOUR_TARGETS, so more can be added: a `field` target is an airfield by ICAO; an `aircraft` target stands for every airborne aircraft of a type,
// one stop each, in the order the traffic feed gives them. Each says how many NM round it to frame. The tour goes round the list and starts again.
import { FT_PER_NM } from './map-view.js';
import { formatFeet, ZOOM_RANGE } from './scene3d-model.js';

/** Seconds at each target, the fly in the first part of it included (Dad, 7 Oct: "about 20 s each"). An estimate. */
export const TOUR_DWELL_S = 20; // estimate
/** The smooth fly from one target to the next takes about this long (Dad, 7 Oct: "about 2 s"); with reduced motion the camera steps instead. */
export const TOUR_FLY_S = 2; // estimate
/** The camera's tilt during the tour, degrees from straight down (the start view is 45): a little lower, so a circuit reads in depth. An estimate for the look. */
export const TOUR_PITCH_DEG = 40; // estimate
/** The camera looks at a field this far above the ground, feet (a circuit is flown at about 1,000 ft above the ground). An estimate. */
export const TOUR_FIELD_AGL_FT = 1000; // estimate

/**
 * What the tour visits, in order, then round again. `nm` is how far round the target the view reaches (the radius of the area framed).
 * - { kind: 'field', icao, label, nm }: the airfield, centred; skipped when it is not one of the scene's airfields or lies outside the square.
 * - { kind: 'aircraft', isT6: true, nm }: each airborne T-6 (TEX2) in turn, centred and followed as it moves, its tag highlighted; one that drops out of the feed is skipped.
 */
export const TOUR_TARGETS = Object.freeze([
  Object.freeze({ id: 'moose-jaw', kind: 'field', icao: 'CYMJ', label: 'Moose Jaw circuit', nm: 5 }), // the circuit and the three runways
  Object.freeze({ id: 'regina', kind: 'field', icao: 'CYQR', label: 'Regina 5 NM', nm: 5 }),
  Object.freeze({ id: 'tex2', kind: 'aircraft', nm: 3 }),
]);

/**
 * The stops the tour has now, in order: [{ key, kind, label?, x, y, groundFt, hex?, nm }] (x and y in feet from home). `airfields` is the scene's (scene3d-model.js
 * `sceneAirfields`: icao, x, y, groundFt, outside); `aircraft` is the scene's aircraft (`sceneTraffic`: hex, isT6, altFt, name). Only T-6s that are airborne
 * (a height, not "ground") are visited.
 */
export function tourStops({ targets = TOUR_TARGETS, airfields = [], aircraft = [] } = {}) {
  const stops = [];
  for (const t of targets) {
    if (t.kind === 'field') {
      const field = airfields.find((a) => a.icao === t.icao && !a.outside);
      if (field) stops.push({ key: t.id, kind: 'field', label: t.label, x: field.x, y: field.y, groundFt: field.groundFt, nm: t.nm });
    } else if (t.kind === 'aircraft') {
      for (const a of aircraft) {
        if (a.isT6 === true && a.altFt !== 'ground') stops.push({ key: `${t.id}:${a.hex}`, kind: 'aircraft', hex: a.hex, nm: t.nm });
      }
    }
  }
  return stops;
}

/**
 * Which stop comes next: the one after `currentKey`, wrapping round, or with `currentKey` gone (a T-6 that left the feed) the one now at `lastIndex`, which is
 * the one that followed it. Returns an index into `stops`, or -1 when there are none.
 */
export function nextStopIndex(stops, currentKey, lastIndex = 0) {
  if (!stops.length) return -1;
  const at = currentKey === null || currentKey === undefined ? -1 : stops.findIndex((s) => s.key === currentKey);
  if (at >= 0) return (at + 1) % stops.length;
  return Math.min(Math.max(0, lastIndex), stops.length - 1);
}

/**
 * The words in the corner for a stop: "Moose Jaw circuit", "Regina 5 NM", "TEX21 at 5,500 ft" (the height to the nearest 100 ft above sea level, as the tags say it).
 * `aircraft` is the scene's aircraft for an aircraft stop (name, altFt), or undefined when it has gone: then null.
 */
export function tourCaption(stop, aircraft) {
  if (stop.kind === 'field') return stop.label;
  if (!aircraft) return null;
  if (aircraft.altFt === 'ground') return `${aircraft.name} on the ground`;
  if (typeof aircraft.altFt === 'number' && Number.isFinite(aircraft.altFt)) return `${aircraft.name} at ${formatFeet(Math.round(aircraft.altFt / 100) * 100)} ft`;
  return `${aircraft.name}, height unknown`;
}

/** "next in 12 s": the seconds left at this stop, rounded up, never below 0. */
export const nextInWords = (elapsedMs) => `next in ${Math.max(0, Math.ceil(TOUR_DWELL_S - elapsedMs / 1000))} s`;

/**
 * The camera's zoom, relative to the start (fit) zoom as `cam.zoom` is, that shows `nm` nautical miles round the target across the shorter side of a view `size`
 * ({ width, height } in pixels), with `fit` the fitting zoom (scene3d-model.js `fitZoom`, pixels to 1,000 ft). Kept inside the camera's limits.
 */
export function framingZoom({ nm, size, fit }) {
  const pxPerFt = Math.max(1, Math.min(size.width, size.height)) / (2 * nm * FT_PER_NM);
  return Math.min(ZOOM_RANGE[1], Math.max(ZOOM_RANGE[0], (pxPerFt * 1000) / fit));
}

const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * The camera part-way through a fly from `from` to `to` (each { tx, ty, tz, zoom, pitch }: the point looked at in feet, the relative zoom, the tilt), `t` from 0 to 1:
 * a smooth ease in and out, the zoom changing by equal ratios (so the fly looks even) and the rest by equal steps.
 */
export function flyPose(from, to, t) {
  const k = smooth(Math.min(1, Math.max(0, t)));
  return {
    tx: lerp(from.tx, to.tx, k),
    ty: lerp(from.ty, to.ty, k),
    tz: lerp(from.tz, to.tz, k),
    zoom: Math.exp(lerp(Math.log(from.zoom), Math.log(to.zoom), k)),
    pitch: lerp(from.pitch, to.pitch, k),
  };
}
