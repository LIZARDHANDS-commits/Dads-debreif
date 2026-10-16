// The route and the planner's settings as plain values, and the route file (docs/modules/nav-planner/spec.md, "Files"; NP-9).
// No page access: tested in Node. A route is { name, points: [{ name, lat, lon, heightFt, heightRef, kias }] }; each point's height and KIAS are
// for the leg that leaves it (the last point's are kept but unused). An opened file is untrusted: every value is range-checked and one bad
// value refuses the whole file with the reason (RouteFileError); nothing is half-loaded.
import { CYMJ_ORIGIN } from '../../airfields/cymj-runways.js';
import { FT_PER_NM } from '../../core/units.js';
import { localFtToLatLon, makeLocalRef } from '../../core/geo.js';

export const FORMAT = 'dads-nav-route';
export const VERSION = 1;
/** The most turn points a route holds (a file with more is taken for a recorded track: NP-9). An estimate of a long low-level route's needs. */
export const MAX_POINTS = 50;
/** The largest route file opened, bytes (a 50-point route is a few kB). */
export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_NAME_CHARS = 40;

/** Each leg's defaults (spec): 500 ft AGL (estimate) and 240 KIAS (estimate, the brief's working answer until Patrick or a manual page). */
export const LEG_DEFAULTS = Object.freeze({ heightFt: 500, heightRef: 'AGL', kias: 240 });

/** The plan's settings and their sources (spec, "Times, fuel and wind"; NP-5, NP-7, NP-8). */
export const SETTING_DEFAULTS = Object.freeze({
  startFuelLb: 1100, // estimate (NP-7): no CT-156 fuel figure in the tool or its docs
  fuelFlowPph: 500, // estimate (NP-7)
  minClearanceFt: 500, // estimate (NP-5): a flag, never a wall
  wind: Object.freeze({ mode: 'none', fromDegT: 270, kt: 20, timeZ: '' }),
});

/** What a value may be, in a file and in the boxes on screen. File limits are wider than the boxes' (spec, "Files"); published limits are flags, never walls. */
export const RANGES = Object.freeze({
  lat: [-85, 85],
  lon: [-180, 180],
  heightFt: [0, 20000],
  kias: [60, 400],
  startFuelLb: [0, 5000],
  fuelFlowPph: [0, 3000],
  minClearanceFt: [0, 5000],
  fromDegT: [0, 360],
  kt: [0, 150],
});
export const WIND_MODES = Object.freeze(['none', 'typed', 'model']);
export const HEIGHT_REFS = Object.freeze(['AGL', 'MSL']);

export class RouteFileError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RouteFileError';
  }
}

/** @type {(v: any, range: readonly number[]) => boolean} */
const inRange = (v, [lo, hi]) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** A name as plain text: control characters dropped, trimmed, at most MAX_NAME_CHARS. */
export function cleanName(text, fallback = '') {
  const s = String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_CHARS);
  return s || fallback;
}

/** A new turn point at (lat, lon) with the leg defaults, named TPn unless given. */
export function makePoint(lat, lon, { name = '', heightFt = LEG_DEFAULTS.heightFt, heightRef = LEG_DEFAULTS.heightRef, kias = LEG_DEFAULTS.kias } = {}, n = 1) {
  return { name: cleanName(name, `TP${n}`), lat, lon, heightFt, heightRef, kias };
}

export const emptyRoute = () => ({ name: 'New route', points: [] });

/**
 * The Example route (spec, "The screen"): a made-up five-leg route round Moose Jaw to try the planner, never a real low-level route.
 * Points are bearings (°T) and distances (NM) from CYMJ's runway origin, so they sit on the map whatever the imagery: south-east over the Dirt
 * Hills (to show the terrain), round the south and west, and home. Leg 2 is an MSL leg to show a level leg's clearance.
 */
export function exampleRoute() {
  const ref = makeLocalRef(CYMJ_ORIGIN.lat, CYMJ_ORIGIN.lon);
  const at = (bearingDeg, nm) => {
    const b = (bearingDeg * Math.PI) / 180;
    return localFtToLatLon(ref, Math.sin(b) * nm * FT_PER_NM, Math.cos(b) * nm * FT_PER_NM);
  };
  /** @type {Array<[string, number, number, any]>} */
  const spots = [
    ['CYMJ', 0, 0, {}],
    ['Start', 120, 12, {}],
    ['Dirt Hills', 150, 24, { heightRef: 'MSL', heightFt: 2900 }],
    ['South', 200, 30, {}],
    ['West', 250, 28, {}],
    ['Lake', 300, 18, {}],
    ['CYMJ', 0, 0, {}],
  ];
  return {
    name: 'Example (made up)',
    points: spots.map(([name, b, nm, leg], i) => {
      const p = nm ? at(b, nm) : { lat: CYMJ_ORIGIN.lat, lon: CYMJ_ORIGIN.lon };
      return makePoint(Number(p.lat.toFixed(5)), Number(p.lon.toFixed(5)), { name, ...leg }, i + 1);
    }),
  };
}

/** The route file's text (spec, "Files"). */
export function toRouteFile(route, settings, { now = new Date() } = {}) {
  const wind = settings.wind;
  return JSON.stringify({
    format: FORMAT,
    version: VERSION,
    name: cleanName(route.name, 'Route'),
    savedAt: now.toISOString(),
    settings: {
      startFuelLb: settings.startFuelLb,
      fuelFlowPph: settings.fuelFlowPph,
      minClearanceFt: settings.minClearanceFt,
      wind: { mode: wind.mode, fromDegT: wind.fromDegT, kt: wind.kt, timeZ: wind.timeZ },
    },
    points: route.points.map((p) => ({ name: p.name, lat: p.lat, lon: p.lon, heightFt: p.heightFt, heightRef: p.heightRef, kias: p.kias })),
  }, null, 2);
}

const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/;

/**
 * Checks one point from an untrusted source and returns a clean copy, or throws RouteFileError naming the point and the value.
 * Height and KIAS missing take the defaults (an imported KML or GPX point has none).
 */
export function checkPoint(raw, index) {
  const where = `Turn point ${index + 1}`;
  if (!raw || typeof raw !== 'object') throw new RouteFileError(`${where} isn't a turn point.`);
  if (!inRange(raw.lat, RANGES.lat)) throw new RouteFileError(`${where}: latitude ${String(raw.lat).slice(0, 20)} is not between ${RANGES.lat[0]} and ${RANGES.lat[1]}.`);
  if (!inRange(raw.lon, RANGES.lon)) throw new RouteFileError(`${where}: longitude ${String(raw.lon).slice(0, 20)} is not between ${RANGES.lon[0]} and ${RANGES.lon[1]}.`);
  const heightFt = raw.heightFt ?? LEG_DEFAULTS.heightFt;
  if (!inRange(heightFt, RANGES.heightFt)) throw new RouteFileError(`${where}: height ${String(heightFt).slice(0, 20)} ft is not between ${RANGES.heightFt[0]} and ${RANGES.heightFt[1]}.`);
  const heightRef = raw.heightRef ?? LEG_DEFAULTS.heightRef;
  if (!HEIGHT_REFS.includes(heightRef)) throw new RouteFileError(`${where}: height reference must be AGL or MSL.`);
  const kias = raw.kias ?? LEG_DEFAULTS.kias;
  if (!inRange(kias, RANGES.kias)) throw new RouteFileError(`${where}: ${String(kias).slice(0, 20)} KIAS is not between ${RANGES.kias[0]} and ${RANGES.kias[1]}.`);
  if (raw.name !== undefined && typeof raw.name !== 'string') throw new RouteFileError(`${where}: its name isn't text.`);
  return { name: cleanName(raw.name, `TP${index + 1}`), lat: raw.lat, lon: raw.lon, heightFt, heightRef, kias };
}

/** Checks a list of points (2 to MAX_POINTS). `what` names the file in the messages. */
export function checkPoints(list, what = 'The file') {
  if (!Array.isArray(list) || list.length < 2) throw new RouteFileError(`${what} needs at least 2 turn points.`);
  if (list.length > MAX_POINTS) throw new RouteFileError(`${what} has ${list.length} points, more than a route's ${MAX_POINTS}: this looks like a flown track. Load it under Flown track instead.`);
  return list.map((p, i) => checkPoint(p, i));
}

/**
 * Reads a route file's text (untrusted). Returns { route, settings } or throws RouteFileError with the reason. Settings missing from the
 * file take the defaults; settings present must be in range.
 */
export function readRouteFile(text) {
  if (typeof text !== 'string') throw new RouteFileError('The route file is not text.');
  if (text.length > MAX_FILE_BYTES) throw new RouteFileError(`The route file is larger than ${MAX_FILE_BYTES / 1024} kB, too big for a route.`);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new RouteFileError("The file isn't a route file (it isn't readable JSON).");
  }
  if (!data || typeof data !== 'object' || data.format !== FORMAT) throw new RouteFileError(`The file isn't a route file (its format isn't "${FORMAT}").`);
  if (data.version !== VERSION) throw new RouteFileError(`The route file is version ${String(data.version).slice(0, 10)}; this planner reads version ${VERSION}.`);
  const points = checkPoints(data.points, 'The route file');
  const s = data.settings ?? {};
  if (typeof s !== 'object') throw new RouteFileError('The route file\'s settings are not readable.');
  const settings = { ...SETTING_DEFAULTS, wind: { ...SETTING_DEFAULTS.wind } };
  for (const key of ['startFuelLb', 'fuelFlowPph', 'minClearanceFt']) {
    if (s[key] === undefined) continue;
    if (!inRange(s[key], RANGES[key])) throw new RouteFileError(`The route file's ${key} (${String(s[key]).slice(0, 20)}) is not between ${RANGES[key][0]} and ${RANGES[key][1]}.`);
    settings[key] = s[key];
  }
  const w = s.wind ?? {};
  if (w.mode !== undefined) {
    if (!WIND_MODES.includes(w.mode)) throw new RouteFileError('The route file\'s wind choice is not none, typed or model.');
    settings.wind.mode = w.mode;
  }
  for (const key of ['fromDegT', 'kt']) {
    if (w[key] === undefined) continue;
    if (!inRange(w[key], RANGES[key])) throw new RouteFileError(`The route file's wind ${key} (${String(w[key]).slice(0, 20)}) is not between ${RANGES[key][0]} and ${RANGES[key][1]}.`);
    settings.wind[key] = w[key];
  }
  if (w.timeZ !== undefined && w.timeZ !== '') {
    if (typeof w.timeZ !== 'string' || !ISO_Z.test(w.timeZ) || !Number.isFinite(Date.parse(w.timeZ))) throw new RouteFileError('The route file\'s wind time is not a Zulu date and time.');
    settings.wind.timeZ = w.timeZ;
  }
  if (data.name !== undefined && typeof data.name !== 'string') throw new RouteFileError('The route file\'s name isn\'t text.');
  return { route: { name: cleanName(data.name, 'Route'), points }, settings };
}

/** A file name for the route: its name and the date. */
export function routeFileName(route, ext, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return `${cleanName(route.name, 'route').replace(/\s+/g, '-')}-${day}${ext}`;
}
