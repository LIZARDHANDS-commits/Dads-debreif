// The SOF map's feeds, decided in Node (SPEC-sof, "Map" and "Security"): the
// addresses of ECCC's radar, lightning and radar-coverage images, a layer's
// latest time from its GetCapabilities reply, RainViewer's backup tiles, the
// switch between the two, and how old each feed is. Pure: no network, no
// timers, no DOM; the clock comes in as `now`.
//
// Every address is built from a fixed host and checked numbers or a name from
// a short list, never from reply text. Replies are untrusted: size-capped and
// read with strict patterns.

const MINUTE_MS = 60_000;

export const GEOMET_URL = 'https://geo.weather.gc.ca/geomet';
const RAINVIEWER_HOST = 'https://tilecache.rainviewer.com';

/** ECCC layer names the SOF draws (SPEC-sof, Layers menu). */
export const LAYERS = Object.freeze({
  radarRain: 'RADAR_1KM_RRAI',
  radarSnow: 'RADAR_1KM_RSNO',
  lightning: 'Lightning_2.5km_Density',
  coverage: 'RADAR_COVERAGE_RRAI.INV',
});
const LAYER_NAMES = new Set(Object.values(LAYERS));

/** Radar stale after 20 minutes, lightning after 30 (D67); the age is the layer's own. */
export const STALE_MS = Object.freeze({ radar: 20 * MINUTE_MS, lightning: 30 * MINUTE_MS });
/** How often each feed is asked again (D67). */
export const REFRESH_MS = Object.freeze({ radar: 6 * MINUTE_MS, lightning: 10 * MINUTE_MS });

// Southern Saskatchewan around Moose Jaw, as [west, south, east, north] degrees.
export const DEFAULT_BBOX = Object.freeze([-110.5, 48.5, -101, 52.5]);

const MAX_REPLY_CHARS = 256 * 1024; // a per-layer reply is about 20 KB; the whole-server list is 40 MB
const MAX_TIMES = 1000;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;
const CLOCK_SKEW_MS = 5 * MINUTE_MS;
const MERCATOR_MAX_LAT = 85.0511;
const EARTH_RADIUS_M = 6378137;
const ISO_SECONDS = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
const PERIOD = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;
const RV_PATH = /^\/v2\/radar\/[0-9a-f]{6,40}$/;
const RV_MAX_FRAMES = 24;
const RV_MAX_SCAN = 200;
const RV_MAX_ZOOM = 7; // RainViewer's free tiles stop at zoom 7

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const inYears = (ms) => ms >= Date.UTC(MIN_YEAR, 0, 1) && ms < Date.UTC(MAX_YEAR + 1, 0, 1);

/** 'YYYY-MM-DDTHH:MM:SSZ' to a Date, or null for anything that isn't exactly a real time in range. */
function isoTime(text) {
  if (typeof text !== 'string' || !ISO_SECONDS.test(text)) return null;
  const ms = Date.parse(text);
  if (!Number.isFinite(ms) || !inYears(ms) || new Date(ms).toISOString().slice(0, 19) + 'Z' !== text) return null;
  return new Date(ms);
}

/** A Date, milliseconds or ISO seconds text as ISO seconds text; throws RangeError for anything else. */
function timeParam(time) {
  const ms = time instanceof Date ? +time : typeof time === 'number' ? time : isoTime(time) && Date.parse(time);
  if (!isNumber(ms) || !inYears(ms)) throw new RangeError('time must be a real date');
  return new Date(ms).toISOString().slice(0, 19) + 'Z';
}

// --- GetMap addresses --------------------------------------------------------

/** [west, south, east, north] degrees to web mercator metres (EPSG:3857). */
export function bboxToMercator([west, south, east, north]) {
  const x = (lon) => (EARTH_RADIUS_M * lon * Math.PI) / 180;
  const y = (lat) => EARTH_RADIUS_M * Math.atanh(Math.sin((lat * Math.PI) / 180)); // exact at the equator
  return [x(west), y(south), x(east), y(north)];
}

const fixed = (n, places) => String(Number(n.toFixed(places)));

/**
 * The ECCC GeoMet WMS 1.3.0 GetMap address for one layer, as a transparent PNG.
 * bbox is [west, south, east, north] in degrees; it goes out in mercator metres for
 * EPSG:3857 (the default, matching the map's tiles) or in 1.3.0's south, west, north,
 * east order for EPSG:4326. time (a Date, ms, or ISO seconds) is left out to get ECCC's
 * latest. Throws RangeError for a layer not on the list or any number that isn't
 * finite, ordered and in range, so nothing odd reaches the address.
 */
export function getMapUrl({
  layer = LAYERS.radarRain, bbox = DEFAULT_BBOX, width = 1024, height = 768, time, crs = 'EPSG:3857',
} = {}) {
  if (!LAYER_NAMES.has(layer)) throw new RangeError('layer is not one the SOF uses');
  if (crs !== 'EPSG:3857' && crs !== 'EPSG:4326') throw new RangeError('crs must be EPSG:3857 or EPSG:4326');
  if (!isInt(width, 16, 2048) || !isInt(height, 16, 2048)) throw new RangeError('width and height must be whole numbers from 16 to 2048');
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(isNumber)) throw new RangeError('bbox must be four numbers');
  const [west, south, east, north] = bbox;
  const latLimit = crs === 'EPSG:3857' ? MERCATOR_MAX_LAT : 90;
  if (west < -180 || east > 180 || south < -latLimit || north > latLimit || west >= east || south >= north) {
    throw new RangeError('bbox must be [west, south, east, north] degrees, in order and in range');
  }
  const box = crs === 'EPSG:3857'
    ? bboxToMercator(bbox).map((n) => fixed(n, 2))
    : [south, west, north, east].map((n) => fixed(n, 6));
  const when = time == null ? '' : `&time=${timeParam(time)}`;
  const query = `service=WMS&version=1.3.0&request=GetMap&layers=${layer}&styles=&crs=${crs}&bbox=${box.join(',')}`
    + `&width=${width}&height=${height}&format=image/png&transparent=true${when}`;
  // Belt and braces: everything above is a checked number or a name from a list.
  if (!/^[A-Za-z0-9_.:,/=&-]*$/.test(query)) throw new RangeError('address held an unexpected character');
  return `${GEOMET_URL}?${query}`;
}

// --- A layer's latest time ---------------------------------------------------

function periodMs(text) {
  const m = PERIOD.exec(text ?? '');
  if (!m || (m[1] == null && m[2] == null && m[3] == null)) return null;
  const ms = ((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 1000;
  return ms > 0 ? ms : null;
}

/**
 * A layer's times from its GetCapabilities reply (asked for with &layer=NAME, never the
 * whole list). Returns { layer, latest, start, end, stepMs } (Dates; stepMs or null), or
 * null if the reply is too big, is about another layer, or holds no readable time.
 * `latest` is the layer's own "default" time, ECCC's current one, else the end of its list.
 */
export function parseLayerTimes(xml, layer) {
  if (typeof xml !== 'string' || xml.length > MAX_REPLY_CHARS || !LAYER_NAMES.has(layer)) return null;
  const at = xml.indexOf(`<Name>${layer}</Name>`);
  if (at < 0) return null;
  // Only this layer's own element: up to its closing tag or the next layer, whichever is first.
  const rest = xml.slice(at);
  const ends = [rest.indexOf('</Layer>'), rest.indexOf('<Layer', 1)].filter((i) => i >= 0);
  const section = ends.length ? rest.slice(0, Math.min(...ends)) : rest;

  let attrs = null;
  let text = null;
  for (const m of section.matchAll(/<Dimension(?:\s([^<>]{0,1000}))?>([^<]{0,200000})<\/Dimension>/g)) {
    if (/\bname="time"/.test(m[1] ?? '')) {
      [, attrs, text] = m;
      break;
    }
  }
  if (text == null) return null;

  const items = text.split(',').map((s) => s.trim());
  if (items.length > MAX_TIMES) return null;
  let start = null;
  let end = null;
  let stepMs = null;
  for (const [i, item] of items.entries()) {
    const [from, to, period, ...extra] = item.split('/');
    const a = isoTime(from);
    const b = to === undefined ? a : isoTime(to);
    if (!a || !b || extra.length || b < a) return null;
    if (i === 0) start = a;
    end = b;
    stepMs = to === undefined ? null : periodMs(period);
  }
  // ECCC's default is its current time; believe it only when it lies inside the layer's own range.
  const given = isoTime(/\bdefault="([^"]*)"/.exec(attrs)?.[1]);
  const inside = given && given >= start && given <= end;
  return Object.freeze({ layer, latest: inside ? given : end, start, end, stepMs });
}

// --- RainViewer, the backup radar --------------------------------------------

/**
 * RainViewer's weather-maps.json (text or already parsed) as { generated, frames, latest }:
 * the observed ("past") radar frames, oldest first, the last 24 at most, each
 * { time: Date, path }. Frames with a path that doesn't match RainViewer's documented
 * pattern or a time that isn't a real one are dropped. null if nothing usable is left.
 * The reply's host is not used; tiles always come from RainViewer's own tile host.
 */
export function parseRainViewer(input) {
  let json = input;
  if (typeof input === 'string') {
    if (input.length > MAX_REPLY_CHARS) return null;
    try {
      json = JSON.parse(input);
    } catch {
      return null;
    }
  }
  const past = json && typeof json === 'object' ? json.radar?.past : null;
  if (!Array.isArray(past)) return null;
  const frames = [];
  for (const f of past.slice(-RV_MAX_SCAN)) {
    if (!f || typeof f !== 'object' || typeof f.path !== 'string' || !RV_PATH.test(f.path)) continue;
    if (!Number.isInteger(f.time) || !inYears(f.time * 1000)) continue;
    frames.push(Object.freeze({ time: new Date(f.time * 1000), path: f.path }));
  }
  if (!frames.length) return null;
  frames.sort((a, b) => a.time - b.time);
  const kept = frames.slice(-RV_MAX_FRAMES);
  const stamp = json.generated;
  const generated = Number.isInteger(stamp) && inYears(stamp * 1000) ? new Date(stamp * 1000) : null;
  return Object.freeze({ generated, frames: kept, latest: kept[kept.length - 1] });
}

/**
 * One RainViewer radar tile: `frame` is a { path } from parseRainViewer; z 0 to 7, x and y
 * inside the grid, size 256 or 512, color scheme 0 to 8. Throws RangeError on anything else.
 */
export function rainViewerTileUrl(frame, { z = 0, x = 0, y = 0, size = 256, color = 2, smooth = true, snow = true } = {}) {
  if (!frame || typeof frame.path !== 'string' || !RV_PATH.test(frame.path)) throw new RangeError('frame has no valid path');
  if (!isInt(z, 0, RV_MAX_ZOOM)) throw new RangeError('z must be a whole number from 0 to 7');
  const grid = 2 ** z;
  if (!isInt(x, 0, grid - 1) || !isInt(y, 0, grid - 1)) throw new RangeError('x and y must be inside the tile grid');
  if (size !== 256 && size !== 512) throw new RangeError('size must be 256 or 512');
  if (!isInt(color, 0, 8)) throw new RangeError('color must be a whole number from 0 to 8');
  if (typeof smooth !== 'boolean' || typeof snow !== 'boolean') throw new RangeError('smooth and snow must be true or false');
  return `${RAINVIEWER_HOST}${frame.path}/${size}/${z}/${x}/${y}/${color}/${smooth ? 1 : 0}_${snow ? 1 : 0}.png`;
}

// --- ECCC first, RainViewer after two failures -------------------------------

/** The state before anything has been asked: on ECCC, no failures. */
export const initialFeedSource = () => ({ source: 'eccc', failures: 0 });

const validSource = (s) =>
  s && typeof s === 'object' && (s.source === 'eccc' || s.source === 'rainviewer') && Number.isInteger(s.failures) && s.failures >= 0;

/**
 * The next state after one ECCC try: `ecccOk` true or false. `after` (default 2) failures
 * in a row switch to RainViewer; the first ECCC success switches back. Keep asking ECCC
 * while on RainViewer, so it can come back. Returns a new state and leaves the old one alone.
 */
export function nextFeedSource(state, ecccOk, { after = 2 } = {}) {
  if (ecccOk) return initialFeedSource();
  const limit = Number.isInteger(after) && after >= 1 ? after : 2;
  const from = validSource(state) ? state : initialFeedSource();
  const failures = Math.min(from.failures + 1, Math.max(limit, from.failures));
  return { source: from.source === 'rainviewer' || failures >= limit ? 'rainviewer' : 'eccc', failures };
}

// --- How old a feed is -------------------------------------------------------

/**
 * A feed's age, taken from the layer's own time (not when it was fetched).
 * kind 'radar' (default; also the coverage layer) or 'lightning'; layerTime a Date or ms.
 * Returns { ageMs, ageMin, stale, state } with state 'fresh', 'stale' or 'unknown'
 * (no usable time: age null, and counted stale so it is never shown as current).
 * A time up to 5 minutes ahead of the clock is age 0; further ahead is 'unknown'. Throws RangeError for another kind.
 */
export function feedAge({ kind = 'radar', layerTime, now = new Date() } = {}) {
  const limit = STALE_MS[kind];
  if (limit === undefined || !Object.hasOwn(STALE_MS, kind)) throw new RangeError('kind must be radar or lightning');
  const then = layerTime instanceof Date ? +layerTime : layerTime;
  const clock = +now;
  if (!isNumber(then) || !isNumber(clock)) return { ageMs: null, ageMin: null, stale: true, state: 'unknown' };
  // A time well ahead of the clock can't be trusted (a wrong clock or a bad reply); a few minutes is skew.
  if (then - clock > CLOCK_SKEW_MS) return { ageMs: null, ageMin: null, stale: true, state: 'unknown' };
  const ageMs = Math.max(0, clock - then);
  const stale = ageMs > limit;
  return { ageMs, ageMin: Math.floor(ageMs / MINUTE_MS), stale, state: stale ? 'stale' : 'fresh' };
}
