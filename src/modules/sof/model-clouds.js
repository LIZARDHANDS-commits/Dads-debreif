// Model clouds, winds aloft and the freezing level for the SOF's 3D view (SPEC-sof, "3D view", SOF-39, phase 2): the request to
// Open-Meteo's GEM endpoint (ECCC's GEM model), the checks on its reply, and the plain data the drawing needs (cloud blocks with
// a base and a top, wind barbs at three pressure levels, the freezing level). No page and no three.js: `fetch`, the clock and the
// timers (a scheduler scope) come in. model-layers3d.js draws what comes out of here.
//
// It is a model estimate, never an observation: it is labelled so wherever it is shown, it checks no limit and it never raises or
// clears a caution. Open-Meteo is free with no key (CC BY 4.0) and is credited on screen.
//
// Failure and stale behaviour (SPEC-sof "3D view", "When data fails" and "Untrusted replies"):
// - The reply is untrusted. It must be an array of exactly one object per grid point, each with `hourly.time` (ISO times) and every
//   requested variable as an array of the same length, every number finite and in its range. Anything else makes the WHOLE reply a
//   failure; nothing of it is kept.
// - A failed request, or a last good answer older than STALE_MS, means there is no model data: the layers are removed, never frozen,
//   and the view says so with the time of the last good answer ("not yet" if there never was one).
import { guardedFetch, bytesToText, FETCH_LIMITS } from './map-fetch.js';
import { FT_PER_NM } from './map-view.js';
import { AREA_NM, AREA_FT, formatFeet } from './scene3d-model.js';
import { FT_PER_M } from '../../core/units.js';
import { formatZulu, formatInZone, zoneAbbreviation } from '../../core/time.js';
import { windBarb } from './map-model.js';

// ---- What is asked for -----------------------------------------------------------------------------

export const MODEL_URL = 'https://api.open-meteo.com/v1/gem';
/** The grid: 9 x 9 points over the square, edge to edge, so 250 / 8 = 31.25 NM apart (SOF-39). */
export const GRID_SIZE = 9;
export const GRID_SPACING_NM = AREA_NM / (GRID_SIZE - 1);
export const GRID_SPACING_FT = GRID_SPACING_NM * FT_PER_NM;
/** Cloud cover and geopotential height are asked at these pressure levels, bottom first. */
export const CLOUD_LEVELS_HPA = Object.freeze([1000, 925, 850, 700, 600, 500, 400, 300]);
/** Winds are asked at these (and drawn as barbs at each level's own geopotential height). */
export const WIND_LEVELS_HPA = Object.freeze([850, 700, 500]);
/** Hourly values asked for: now plus 24 hours ahead. */
export const FORECAST_HOURS = 25;
/** The most hours the slider goes ahead of now. */
export const MAX_AHEAD_HOURS = FORECAST_HOURS - 1;

export const HOURLY_VARIABLES = Object.freeze([
  ...CLOUD_LEVELS_HPA.map((l) => `cloud_cover_${l}hPa`),
  ...CLOUD_LEVELS_HPA.map((l) => `geopotential_height_${l}hPa`),
  ...WIND_LEVELS_HPA.map((l) => `wind_speed_${l}hPa`),
  ...WIND_LEVELS_HPA.map((l) => `wind_direction_${l}hPa`),
  'freezing_level_height',
  'cloud_cover_low',
  'cloud_cover_mid',
  'cloud_cover_high',
]);

/** Each variable's range, from its name's start: [lowest, highest] in the units the request asks for (%, m, kt, degrees). Anything outside fails the reply. */
const RANGES = Object.freeze([
  ['cloud_cover', 0, 100],
  ['geopotential_height', -500, 20_000],
  ['wind_speed', 0, 300],
  ['wind_direction', 0, 360],
  ['freezing_level_height', -500, 10_000],
]);
const rangeOf = (variable) => RANGES.find(([prefix]) => variable.startsWith(prefix));

/** The model data is kept this long: older than this, or a failed request, and the layers are removed (SOF-39). */
export const STALE_MS = 3 * 60 * 60 * 1000;
/** Asked again this often while the 3D view is open (SOF-39), or this soon after a failure (an estimate, SOF-39: not in the spec). */
export const REFRESH_MS = 60 * 60 * 1000;
export const RETRY_MS = 10 * 60 * 1000;
/** How often the feed looks at the clock to see whether it is due (so a sleeping computer is caught up within this). */
const TICK_MS = 30 * 1000;
const MAX_HOURS_IN_REPLY = 72;

/** A cloud level whose cover is over this is cloud: estimate, SOF-39. Percent. */
export const CLOUD_COVER_THRESHOLD_PCT = 30; // estimate, SOF-39

/**
 * The cloud stages, in feet above the ground: low below 6,500, mid 6,500 to 20,000, high above 20,000. The standard WMO cloud
 * stages for mid latitudes (low from the surface to about 2 km, mid to about 7 km, high above), approximate. A block is
 * sorted by its base.
 */
export const CLOUD_STAGES_FT_AGL = Object.freeze({ lowTopFt: 6500, midTopFt: 20_000 });

/**
 * Magnetic variation at Moose Jaw, degrees East (magnetic = true - this): Patrick's ruling, 4 Oct (TR-65). The same number as
 * Traffic's `MAG_VARIATION_DEG_E`; modules do not import each other and there is no shared copy yet, so it is stated again here, for
 * showing winds in degrees magnetic only.
 */
export const MAG_VARIATION_DEG_E = 9;

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const two = (n) => String(n).padStart(2, '0');

// ---- The grid and the request ----------------------------------------------------------------------

/**
 * The 81 grid points over the square, row by row from the south-west: { index, i, j, x, y, lat, lon } with x and y in the map's
 * local feet from home, and lat and lon (two decimals, about a kilometre, finer than the model's own grid) worked out by the map's
 * projection. `toLatLon(x, y)` is the projection's own ({ lat, lon }).
 */
export function gridPoints(toLatLon) {
  const half = AREA_FT / 2;
  const step = AREA_FT / (GRID_SIZE - 1);
  const out = [];
  for (let j = 0; j < GRID_SIZE; j++) {
    for (let i = 0; i < GRID_SIZE; i++) {
      const x = -half + i * step;
      const y = -half + j * step;
      const { lat, lon } = toLatLon(x, y);
      out.push({ index: out.length, i, j, x, y, lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 });
    }
  }
  return out;
}

/** The one request for every grid point: comma-separated latitudes and longitudes, the hourly variables, knots, GMT, 25 hours. */
export function modelUrl(points) {
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat).join(','),
    longitude: points.map((p) => p.lon).join(','),
    hourly: HOURLY_VARIABLES.join(','),
    wind_speed_unit: 'kn',
    timezone: 'GMT',
    forecast_hours: String(FORECAST_HOURS),
  });
  // URLSearchParams writes a comma as %2C; the API takes both, but the plain form is shorter and easier to read.
  return `${MODEL_URL}?${params.toString().replaceAll('%2C', ',')}`;
}

// ---- Checking the reply ----------------------------------------------------------------------------

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z)?$/;

/** An ISO time from the reply (GMT, with or without the Z) as milliseconds, or NaN. */
const parseTime = (text) => (typeof text === 'string' && ISO_TIME.test(text) ? Date.parse(text.endsWith('Z') ? text : `${text}Z`) : NaN);

let nextModelId = 1;

/**
 * Checks Open-Meteo's reply field by field (it is untrusted). `points` are the grid points that were asked for. Returns
 * { ok: true, model } or { ok: false, reason }. A single wrong value fails the whole reply.
 *
 * model: { id, receivedAt, times: [ms], points: [{ ...gridPoint, series: { variable: [numbers] } }] }; the numbers are as the reply gave
 * them (metres, percent, knots, degrees true), converted when read (`columnAt`).
 */
export function checkModelReply(reply, { points, receivedAt = Date.now() } = /** @type {any} */ ({})) {
  const fail = (reason) => ({ ok: false, reason });
  if (!Array.isArray(reply)) return fail('not a list of points');
  if (reply.length !== points.length) return fail(`${reply.length} points, not ${points.length}`);
  let times = null;
  const out = [];
  for (let n = 0; n < reply.length; n++) {
    const hourly = reply[n] && typeof reply[n] === 'object' ? reply[n].hourly : null;
    if (!hourly || typeof hourly !== 'object') return fail(`point ${n} has no hourly values`);
    if (!Array.isArray(hourly.time) || hourly.time.length < 1 || hourly.time.length > MAX_HOURS_IN_REPLY) return fail(`point ${n} has no usable times`);
    const own = hourly.time.map(parseTime);
    if (own.some((t) => !Number.isFinite(t))) return fail(`point ${n} has a time that is not a time`);
    if (times === null) times = own;
    else if (own.length !== times.length || own.some((t, k) => t !== times[k])) return fail(`point ${n} has other times than the first`);
    const series = {};
    for (const variable of HOURLY_VARIABLES) {
      const values = hourly[variable];
      if (!Array.isArray(values) || values.length !== times.length) return fail(`point ${n}: ${variable} is not ${times.length} values`);
      const [, lo, hi] = rangeOf(variable);
      for (const v of values) if (!isNumber(v) || v < lo || v > hi) return fail(`point ${n}: ${variable} has a value out of range`);
      series[variable] = values.slice();
    }
    out.push({ ...points[n], series });
  }
  return { ok: true, model: { id: nextModelId++, receivedAt, times, points: out } };
}

// ---- Reading the model at an hour ------------------------------------------------------------------

/**
 * The hour to show: the model's latest hour at or before `nowMs`, plus `ahead` hours (0 is now), kept inside the data.
 * Returns the index into `model.times`.
 */
export function hourIndex(model, nowMs, ahead = 0) {
  let nowIndex = 0;
  for (let k = 0; k < model.times.length; k++) if (model.times[k] <= nowMs) nowIndex = k;
  return Math.min(model.times.length - 1, nowIndex + Math.max(0, Math.round(ahead)));
}

/** How many hours past now the slider may go with this data (at most 24). */
export function maxAhead(model, nowMs) {
  return Math.min(MAX_AHEAD_HOURS, model.times.length - 1 - hourIndex(model, nowMs, 0));
}

/** One grid column at one hour: the cloud levels bottom first ({ hPa, cover, heightFt }) and the freezing level in feet above sea level. */
export function columnAt(point, hour) {
  return {
    levels: CLOUD_LEVELS_HPA.map((hPa) => ({
      hPa,
      cover: point.series[`cloud_cover_${hPa}hPa`][hour],
      heightFt: point.series[`geopotential_height_${hPa}hPa`][hour] * FT_PER_M,
    })),
    freezingFt: point.series.freezing_level_height[hour] * FT_PER_M,
    low: point.series.cloud_cover_low[hour],
    mid: point.series.cloud_cover_mid[hour],
    high: point.series.cloud_cover_high[hour],
  };
}

// ---- Cloud ----------------------------------------------------------------------------------------

/**
 * The cloud in one column. Each level whose cover is over `threshold` is cloud from halfway down to the level below to halfway up
 * to the level above, by geopotential height (the lowest and highest levels use the same half-gap on their open side). Cloudy levels
 * next to each other join into one block. A block's base is never drawn below `floorFt` (the ground the view draws).
 *
 * `levels`: [{ cover (percent), heightFt (above sea level) }]. Returns [{ baseFt, topFt, cover }] bottom first, where cover is the
 * mean of the levels in the block (percent), and `baseFt` and `topFt` are feet above sea level.
 */
export function cloudBlocks(levels, { threshold = CLOUD_COVER_THRESHOLD_PCT, floorFt = -Infinity } = {}) {
  const sorted = [...levels].sort((a, b) => a.heightFt - b.heightFt);
  const edge = (i, direction) => {
    const next = sorted[i + direction];
    if (next) return (sorted[i].heightFt + next.heightFt) / 2;
    const inner = sorted[i - direction];
    return inner ? sorted[i].heightFt + (direction * Math.abs(sorted[i].heightFt - inner.heightFt)) / 2 : sorted[i].heightFt;
  };
  const blocks = [];
  let open = null;
  const close = () => {
    if (!open) return;
    const baseFt = Math.max(open.baseFt, floorFt);
    if (open.topFt > baseFt) blocks.push({ baseFt, topFt: open.topFt, cover: open.sum / open.count });
    open = null;
  };
  for (let i = 0; i < sorted.length; i++) {
    if (!(sorted[i].cover > threshold)) {
      close();
      continue;
    }
    if (!open) open = { baseFt: edge(i, -1), topFt: 0, sum: 0, count: 0 };
    open.topFt = edge(i, 1);
    open.sum += sorted[i].cover;
    open.count += 1;
  }
  close();
  return blocks;
}

/** Which stage a block is in, by its base above the ground: 'low', 'mid' or 'high' (CLOUD_STAGES_FT_AGL). */
export function cloudStage(baseAglFt) {
  if (baseAglFt < CLOUD_STAGES_FT_AGL.lowTopFt) return 'low';
  return baseAglFt <= CLOUD_STAGES_FT_AGL.midTopFt ? 'mid' : 'high';
}

/**
 * Every cloud block over the grid at one hour: [{ x, y, baseFt, topFt, cover, stage, i, j }]. `groundFt` is the ground the view draws
 * (the home field's elevation); stages are measured above it.
 */
export function modelCloudBlocks(model, hour, { groundFt = 0 } = {}) {
  const out = [];
  for (const point of model.points) {
    for (const block of cloudBlocks(columnAt(point, hour).levels, { floorFt: groundFt })) {
      out.push({ x: point.x, y: point.y, i: point.i, j: point.j, ...block, stage: cloudStage(block.baseFt - groundFt) });
    }
  }
  return out;
}

/** The model's own low, mid and high cover for the hour, averaged over the grid (percent): { low, mid, high }. */
export function meanLayerCover(model, hour) {
  const sum = { low: 0, mid: 0, high: 0 };
  for (const point of model.points) {
    const c = columnAt(point, hour);
    sum.low += c.low;
    sum.mid += c.mid;
    sum.high += c.high;
  }
  const n = model.points.length || 1;
  return { low: Math.round(sum.low / n), mid: Math.round(sum.mid / n), high: Math.round(sum.high / n) };
}

// ---- Winds aloft -----------------------------------------------------------------------------------

/** A true bearing as magnetic, 1 to 360 (360, never 0, for north), whole degrees. Magnetic = true - 9 (TR-65). */
export const trueToMagnetic = (trueDeg) => {
  const m = ((Math.round(trueDeg - MAG_VARIATION_DEG_E) % 360) + 360) % 360;
  return m === 0 ? 360 : m;
};

/** A direction as it is read out: to the nearest 5 degrees, three digits ("090"), 360 for north (winds are in 5 degree steps, Patrick, 4 Oct). */
export const directionWords = (magDeg) => {
  const d = Math.round(magDeg / 5) * 5;
  return String(d % 360 === 0 ? 360 : d % 360).padStart(3, '0');
};

/** "700 hPa ≈ 9,900 ft: 270°M 35 kt" (height to the nearest 100 ft above sea level; speed is wind speed in knots, not an airspeed). */
export function levelWindWords({ hPa, heightFt, dirMag, kt }) {
  const height = formatFeet(Math.round(heightFt / 100) * 100);
  const wind = kt < 3 ? 'calm' : `${directionWords(dirMag)}°M ${Math.round(kt)} kt`;
  return `${hPa} hPa ≈ ${height} ft: ${wind}`;
}

/** One wind at a grid point and a level at an hour: { x, y, hPa, heightFt, dirTrue, dirMag, kt, barb, words }. */
export function windAt(point, hour, hPa) {
  const kt = point.series[`wind_speed_${hPa}hPa`][hour];
  const dirTrue = point.series[`wind_direction_${hPa}hPa`][hour];
  const heightFt = point.series[`geopotential_height_${hPa}hPa`][hour] * FT_PER_M;
  const dirMag = trueToMagnetic(dirTrue);
  return { x: point.x, y: point.y, i: point.i, j: point.j, hPa, heightFt, dirTrue, dirMag, kt, barb: windBarb(kt), words: levelWindWords({ hPa, heightFt, dirMag, kt }) };
}

/** The barbs to draw: every other grid point (each way, so 25 of the 81), at each of the three levels. Bottom level first. */
export function modelWinds(model, hour) {
  const out = [];
  for (const hPa of WIND_LEVELS_HPA) {
    for (const point of model.points) if (point.i % 2 === 0 && point.j % 2 === 0) out.push(windAt(point, hour, hPa));
  }
  return out;
}

/** The winds over home (the centre grid point), one per level, for the key and the labels. */
export function windsOverHome(model, hour) {
  const centre = model.points.find((p) => p.i === (GRID_SIZE - 1) / 2 && p.j === (GRID_SIZE - 1) / 2);
  return centre ? WIND_LEVELS_HPA.map((hPa) => windAt(centre, hour, hPa)) : [];
}

// ---- Freezing level --------------------------------------------------------------------------------

/** The mean freezing level over the grid at the hour, feet above sea level. */
export function meanFreezingFt(model, hour) {
  let sum = 0;
  for (const point of model.points) sum += columnAt(point, hour).freezingFt;
  return sum / (model.points.length || 1);
}

/** "Freezing level ≈ 7,200 ft" (nearest 100 ft above sea level), or says so when it is at or below the ground the view draws. */
export function freezingWords(freezingFt, groundFt = 0) {
  const text = `Freezing level ≈ ${formatFeet(Math.round(freezingFt / 100) * 100)} ft`;
  return freezingFt <= groundFt ? `${text} (at or below the ground)` : text;
}

// ---- The time slider's words -----------------------------------------------------------------------

/** "Now" or "+3 h", then the model hour in Zulu with home local beside it: "+3 h: 2100Z (1500 CST)". */
export function hourWords(model, hour, nowMs, timeZone) {
  const at = new Date(model.times[hour]);
  const ahead = hour - hourIndex(model, nowMs, 0);
  const zulu = `${formatZulu(at).slice(0, 5).replace(':', '')}Z`;
  const local = timeZone ? ` (${formatInZone(at, timeZone).slice(0, 5).replace(':', '')} ${zoneAbbreviation(at, timeZone)})` : '';
  return `${ahead <= 0 ? 'Now' : `+${ahead} h`}: ${zulu}${local}`;
}

// ---- Saying what is there --------------------------------------------------------------------------

/** The time of a good answer as "1430Z", or "not yet" when there has not been one. */
export const lastGoodWords = (lastGoodAt) => (lastGoodAt === null || lastGoodAt === undefined ? 'not yet' : `${two(new Date(lastGoodAt).getUTCHours())}${two(new Date(lastGoodAt).getUTCMinutes())}Z`);

/** What the view says when there is no model data to draw. */
export const unavailableWords = (lastGoodAt) => `Model clouds unavailable, showing METAR decks only (last good answer: ${lastGoodWords(lastGoodAt)}).`;
export const LOADING_WORDS = 'Loading model clouds and winds…';
export const CREDIT_WORDS = 'Model clouds and winds: Open-Meteo, ECCC GEM (model estimate)';

// ---- The feed --------------------------------------------------------------------------------------

/**
 * The model feed: asks Open-Meteo for the whole grid while it is running, keeps the last good answer in memory only, and says what
 * there is to draw. `start()` asks at once and then once an hour (ten minutes after a failure); `stop()` ends the request and the timer.
 * It is started only while the 3D view is shown.
 *
 * - points(): the grid points for the current home (`gridPoints`).
 * - fetch, timers (a scheduler scope), now: as the map's other feeds.
 * - onChange(): called when what `view` says has changed.
 */
export function createModelFeed({ points, fetch, timers, now = () => new Date(), onChange = () => {} }) {
  let model = null;
  let lastGoodAt = null;
  let failed = false;
  let busy = false;
  let askedAt = null;
  let running = false;
  let cancelTick = null;
  let controller = new AbortController();

  const changed = () => {
    if (running) onChange();
  };

  async function ask() {
    const mine = controller;
    const asked = points();
    busy = true;
    askedAt = +now();
    changed();
    /** @type {{ ok: boolean, reason?: string, model?: any }} */
    let result = { ok: false, reason: 'request failed' };
    try {
      const reply = await guardedFetch(fetch, modelUrl(asked), { timers, signal: mine.signal, accept: 'application/json', ...FETCH_LIMITS.model });
      result = checkModelReply(JSON.parse(bytesToText(reply.bytes)), { points: asked, receivedAt: +now() });
    } catch {
      // A failed request, or a reply that is not JSON: the same as a wrong reply.
    }
    if (mine !== controller || !running) return; // stopped, or home changed, while it was on its way
    busy = false;
    if (result.ok) {
      model = result.model;
      lastGoodAt = result.model.receivedAt;
      failed = false;
    } else {
      failed = true;
    }
    changed();
  }

  function tick() {
    if (!running || busy) return;
    const t = +now();
    if (askedAt === null || t - askedAt >= (failed ? RETRY_MS : REFRESH_MS)) ask();
  }

  return {
    /** Asks at once if nothing recent is held, and then looks at the clock every 30 seconds. Safe to call twice. */
    start() {
      if (running) return;
      running = true;
      cancelTick = timers.every(TICK_MS, tick);
      tick();
      changed();
    },
    /** Ends the request and the timer. The last good answer stays in memory for when the view is opened again. */
    stop() {
      if (!running) return;
      running = false;
      cancelTick?.();
      cancelTick = null;
      controller.abort();
      controller = new AbortController();
      busy = false;
    },
    /** The tab is back or the computer woke: ask if due. */
    wake: tick,
    /** Home changed: the grid is somewhere else, so what is held is dropped and a new answer is asked for. */
    setPlace() {
      controller.abort();
      controller = new AbortController();
      model = null;
      lastGoodAt = null;
      failed = false;
      busy = false;
      askedAt = null;
      if (running) {
        changed();
        tick();
      }
    },
    /**
     * What to draw and say at `at`: { status, model, lastGoodAt }. 'ok' has the model; 'loading' is the first ask still out (or about to
     * go); 'unavailable' is a failed request or an answer older than STALE_MS, with no model (never a frozen one).
     */
    view(at = now()) {
      const old = lastGoodAt !== null && +at - lastGoodAt > STALE_MS;
      if (model && !failed && !old) return { status: 'ok', model, lastGoodAt };
      if (!failed && !model) return { status: 'loading', model: null, lastGoodAt };
      return { status: 'unavailable', model: null, lastGoodAt };
    },
  };
}
