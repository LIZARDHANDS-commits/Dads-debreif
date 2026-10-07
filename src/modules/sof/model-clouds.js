// Model clouds, winds aloft and the freezing level for the SOF's 3D view (SPEC-sof, "3D view", SOF-39, phase 2): the request to
// Open-Meteo's GEM endpoint (ECCC's GEM model), the checks on its reply, and the plain data the drawing needs (a cloud-cover sheet
// at each pressure level, with its pixels worked out here, wind barbs at three pressure levels, the freezing level). No page and no three.js: `fetch`, the clock and the
// timers (a scheduler scope) come in. model-layers3d.js draws what comes out of here.
//
// It is a model estimate, never an observation: it is labelled so wherever it is shown, it checks no limit and it never raises or
// clears a caution. Open-Meteo is free with no key (CC BY 4.0) and is credited on screen.
//
// Failure and stale behaviour (SPEC-sof "3D view", "When data fails" and "Untrusted replies"):
// - The reply is untrusted. It must be an array of exactly one object per grid point, each with `hourly.time` (ISO times) and every
//   requested variable as an array of the same length. Every value must be a finite number in its range, or null (Open-Meteo's "no
//   data" for that one hour and variable). Any other shape, length, non-number or out-of-range number makes the WHOLE reply a failure,
//   and so do nulls in more than half of all the values ("Model data incomplete"); nothing of a failed reply is kept.
// - A null is no data for that one value: cloud cover null is not cloudy; a null geopotential height leaves that level out of the column;
//   a null wind speed or direction draws no barb there; a null freezing level leaves that point out of the mean.
// - A failed refresh keeps the last good answer, and the view says "Model refresh failed at 1030Z, showing the 0900Z answer (90 min old)".
//   The model is asked again only when a newer HRDPS run can be out (`nextRunAt`), so an answer is current until then; once a newer run should have been
//   asked for and STALE_MS has passed without one (or there never was an answer) the layers are removed, never frozen, and the view says so with the time of the
//   last good answer ("not yet" if there never was one). An answer is never shown more than STALE_MS past the time it should have been replaced.
// - The HRDPS grid comes in bands of rows (HRDPS_CHUNKS). A band that fails is filled from the global GEM at its points and the view says which band and how many
//   points ("HRDPS part missing: ... taken from the global GEM"); if the GEM cannot fill it either, the whole HRDPS answer counts as failed (never drawn clear where
//   there is no data). A 429 reply (Open-Meteo's free limit) is said in words.
import { guardedFetch, bytesToText, FETCH_LIMITS } from './map-fetch.js';
import { FT_PER_NM } from './map-view.js';
import { AREA_NM, AREA_FT, formatFeet } from './scene3d-model.js';
import { FT_PER_M } from '../../core/units.js';
import { formatZulu, formatInZone, zoneAbbreviation } from '../../core/time.js';
import { windBarb } from './map-model.js';

// ---- What is asked for -----------------------------------------------------------------------------

export const MODEL_URL = 'https://api.open-meteo.com/v1/gem';
/**
 * The grid: 13 x 13 points over the square, edge to edge, so 450 / 12 = 37.5 NM apart (Dad, 7 Oct: the area grew from 250 to 450 NM; the grid was 9 x 9). A
 * model object carries its own `gridSize` (it is the square root of the points it was asked for), so a reply over another grid still reads.
 */
export const GRID_SIZE = 13;
export const GRID_SPACING_NM = AREA_NM / (GRID_SIZE - 1);
export const GRID_SPACING_FT = GRID_SPACING_NM * FT_PER_NM;
/** Cloud cover and geopotential height are asked at these pressure levels, bottom first (the global GEM request, kept as it was). */
export const CLOUD_LEVELS_HPA = Object.freeze([1000, 925, 850, 700, 600, 500, 400, 300]);
/**
 * The finer HRDPS request (ECCC's 2.5 km model, `models=gem_hrdps_continental` on the same endpoint; Dad, 7 Oct: "get all the cloud data to plot and blend the best you
 * can"): every pressure level it answers. Checked 7 Oct 2026 against the live endpoint: it answered cloud cover and geopotential height at all 17 of these; 975 hPa came
 * back all null (so it is never asked for) and `freezing_level_height` is null for HRDPS (the freezing level comes from a small global GEM request, see `FREEZING_STEP`).
 * One request for all 169 points with 17 levels took over a minute to stream, so 650, 550, 450 and 350 hPa were left out until V2.184; now the grid is asked for in
 * HRDPS_CHUNKS parallel bands of rows (see there), which answers in seconds.
 */
export const HRDPS_CLOUD_LEVELS_HPA = Object.freeze([1000, 950, 925, 900, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400, 350, 300, 250]);
/** The levels to try, for the record (see above): the ones that came back with data on 7 Oct 2026, and the one that did not. */
export const HRDPS_TRIED_HPA = Object.freeze({ answered: [1000, 950, 925, 900, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400, 350, 300, 250], null: [975] });
/**
 * The HRDPS grid is asked for in this many requests at once, each a band of whole rows (13 rows: 3, 2, 2, 2, 2, 2; 39 or 26 points), so the first finer picture is
 * not slower than before. Measured 7 Oct 2026 about 2150Z through this build's proxy, all 17 levels: a band of 29 points answered in 3.3 to 3.8 s (three bands); the
 * global GEM for all 169 points in 2.8 s; one band once stalled and Open-Meteo ended it after 96 s with "Unexpected error while streaming data: timeoutReached" (a 200
 * reply that is not JSON, so a failed band). One request for all 169 points with 17 levels had taken over a minute (7 Oct, earlier). Asking in bands does not cost more of
 * the free daily limit: Open-Meteo counts each location of a request (see CALLS below), however the locations are split. Six is an estimate: enough that each band is a
 * few seconds, few enough that a browser runs them all at once (six connections to one host).
 */
export const HRDPS_CHUNKS = 6; // estimate, SOF-39
/**
 * HRDPS runs at 00, 06, 12 and 18Z (ECCC). A newer run is taken to be on Open-Meteo this long after its start: an estimate from Open-Meteo's own record for the
 * 7 Oct 2026 1200Z run (its `meta.json` for cmc_gem_hrdps: started 1200Z, available 1642Z, 4 h 42 min), rounded up. So the model is asked again at about 0500,
 * 1100, 1700 and 2300Z, not every hour.
 */
export const HRDPS_RUN_EVERY_MS = 6 * 60 * 60 * 1000;
export const HRDPS_AVAILABLE_AFTER_MS = 5 * 60 * 60 * 1000; // estimate, SOF-39
/**
 * Open-Meteo's free tier, from its pricing page (source checked 7 Oct 2026, open-meteo-website `src/routes/en/pricing/+page.svelte`): 600 calls a minute, 5,000 an hour,
 * 10,000 a day; "requests for data covering more than 10 weather variables ... count as multiple API calls", fractional, and each location counts: a request weighs
 * max(1, variables / 10) x locations (its calculator). So:
 * - HRDPS, 169 points x 43 variables (17 levels x 2, winds 3 x 2, low, mid, high): 169 x 4.3 = about 727 calls, however it is split into bands;
 * - the freezing level, 25 points x 1 variable: 25 calls;
 * - the global GEM, 169 points x 26 variables: 169 x 2.6 = about 439 calls (asked on first opening only, as the quick first picture, or as the fallback).
 * Opening the 3D view: about 1,191. Each new run while it stays open: about 752, four a day, so about 4,200 a day for a view left open all day (each reload of the page
 * adds about 1,191; a band that fails adds a GEM request for its points only, and a degraded answer is asked again once, 10 minutes later). Before V2.184 it was asked
 * every hour: 24 x (592 + 25) + 439 = about 15,250 a day, over the free 10,000, which is why "Daily API request limit exceeded" was seen on 7 Oct. The minute's 600
 * is not met by one HRDPS ask (727): whether Open-Meteo counts a request when it starts or as it streams is not known here (untested).
 */
export const CALLS = Object.freeze({ hrdps: 727, freezing: 25, gem: 439, perDayOpenAllDay: 1191 + 4 * 752, freeDaily: 10_000 }); // worked out above; Open-Meteo's own counting is not seen from here
/** HRDPS has no freezing level: a small global GEM request over every third grid point each way (25 of the 169) gives the mean the sheet uses. */
export const FREEZING_STEP = 3;
/** Winds are asked at these (and drawn as barbs at each level's own geopotential height). */
export const WIND_LEVELS_HPA = Object.freeze([850, 700, 500]);
/** Hourly values the slider shows: now plus 24 hours ahead. */
export const FORECAST_HOURS = 25;
/**
 * Hourly values asked for: 9 more than the slider shows, so it still reaches 24 hours ahead when the answer is up to 9 hours old (6 hours to the next run's ask, and
 * the 3 hours a failed refresh may keep it, STALE_MS). The extra hours cost no extra calls (Open-Meteo counts time only past 2 weeks).
 */
export const ASK_HOURS = FORECAST_HOURS + 9;
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

const variablesFor = (levels, { freezing = true } = {}) => Object.freeze([
  ...levels.map((l) => `cloud_cover_${l}hPa`),
  ...levels.map((l) => `geopotential_height_${l}hPa`),
  ...WIND_LEVELS_HPA.map((l) => `wind_speed_${l}hPa`),
  ...WIND_LEVELS_HPA.map((l) => `wind_direction_${l}hPa`),
  ...(freezing ? ['freezing_level_height'] : []),
  'cloud_cover_low',
  'cloud_cover_mid',
  'cloud_cover_high',
]);

/**
 * The two requests (Dad, 7 Oct): the finer HRDPS (2.5 km) first, the global GEM as the fallback when HRDPS fails or comes back mostly null, and also as the quick first
 * picture while HRDPS (slow) is still on its way. `askedVariables` are the hourly variables put in the address; `variables` are every variable the model must hold after
 * the checks (HRDPS' freezing level is added from the small global request). `limits` are the request's timeout and byte cap (map-fetch.js: HRDPS streams slowly).
 */
export const GEM_PROFILE = Object.freeze({
  id: 'gem',
  name: 'ECCC GEM',
  models: null, // the endpoint's default, the global GEM
  cloudLevels: CLOUD_LEVELS_HPA,
  askedVariables: HOURLY_VARIABLES,
  variables: HOURLY_VARIABLES,
});
export const HRDPS_PROFILE = Object.freeze({
  id: 'hrdps',
  name: 'ECCC HRDPS 2.5 km',
  models: 'gem_hrdps_continental',
  cloudLevels: HRDPS_CLOUD_LEVELS_HPA,
  askedVariables: variablesFor(HRDPS_CLOUD_LEVELS_HPA, { freezing: false }),
  variables: variablesFor(HRDPS_CLOUD_LEVELS_HPA),
});

/** More than this share of the reply's values null and the whole reply is thrown away (SOF-39). */
export const MAX_NULL_SHARE = 0.5;

/** Each variable's range, from its name's start: [lowest, highest] in the units the request asks for (%, m, kt, degrees). Anything outside fails the reply. */
const RANGES = Object.freeze([
  ['cloud_cover', 0, 100],
  ['geopotential_height', -500, 20_000],
  ['wind_speed', 0, 300],
  // The live GEM reply gives 361 for a wind just past north (seen 7 Oct 2026), so up to 720 is taken; trueToMagnetic wraps it.
  ['wind_direction', 0, 720],
  ['freezing_level_height', -500, 10_000],
]);
const rangeOf = (variable) => RANGES.find(([prefix]) => variable.startsWith(prefix));

/**
 * The last good answer is kept and shown this long past the time a newer run should have replaced it (`nextRunAt`), even while refreshes fail; after that the layers
 * are removed (SOF-39). Before V2.184 the model was asked every hour and this counted from the answer itself; it now counts from when the answer stopped being the
 * newest run there could be, so a good answer is never removed just for waiting for the next run.
 */
export const STALE_MS = 3 * 60 * 60 * 1000;
/** Asked again this soon after a failure (an estimate, SOF-39: not in the spec), growing as below. */
export const RETRY_MS = 10 * 60 * 1000;
/**
 * After failures in a row the wait grows: 10, then 20, then 40 minutes (and stays at 40), so a run of failures stays well inside Open-Meteo's free daily limit (a 429
 * "Daily API request limit exceeded" was seen on 7 Oct 2026). Estimate, SOF-39 (Fable review, 7 Oct). A good answer starts the count again.
 */
export const RETRY_STEPS_MS = Object.freeze([RETRY_MS, 2 * RETRY_MS, 4 * RETRY_MS]);
/** The wait before asking again after `failures` failed asks in a row (1 or more). */
export const retryDelayMs = (failures) => RETRY_STEPS_MS[Math.min(RETRY_STEPS_MS.length, Math.max(1, failures)) - 1];
/**
 * When the model is next asked, after an ask at `ms`: the first time after it that a newer HRDPS run can be on Open-Meteo (a run at 00, 06, 12 or 18Z plus
 * HRDPS_AVAILABLE_AFTER_MS, an estimate), so 0500, 1100, 1700 or 2300Z. Milliseconds.
 */
export function nextRunAt(ms) {
  const k = Math.floor((ms - HRDPS_AVAILABLE_AFTER_MS) / HRDPS_RUN_EVERY_MS);
  return (k + 1) * HRDPS_RUN_EVERY_MS + HRDPS_AVAILABLE_AFTER_MS;
}
/** How often the feed looks at the clock to see whether it is due (so a sleeping computer is caught up within this). */
const TICK_MS = 30 * 1000;
const MAX_HOURS_IN_REPLY = 72;

/** A cloud level whose cover is over this is cloud: estimate, SOF-39. Percent. */
export const CLOUD_COVER_THRESHOLD_PCT = 30; // estimate, SOF-39

/**
 * The cloud stages, in feet above the ground: low below 6,500, mid 6,500 to 20,000, high above 20,000. The standard WMO cloud
 * stages for mid latitudes (low from the surface to about 2 km, mid to about 7 km, high above), approximate. A cloud sheet is
 * sorted by its height above the ground.
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
export function gridPoints(toLatLon, size = GRID_SIZE) {
  const half = AREA_FT / 2;
  const step = AREA_FT / (size - 1);
  const out = [];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = -half + i * step;
      const y = -half + j * step;
      const { lat, lon } = toLatLon(x, y);
      out.push({ index: out.length, i, j, x, y, lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 });
    }
  }
  return out;
}

/**
 * The one request for every grid point: comma-separated latitudes and longitudes, the hourly variables, knots, GMT, 25 hours. `profile` says which model and which
 * variables (GEM_PROFILE, the default; HRDPS_PROFILE adds `models=gem_hrdps_continental`); `variables` overrides the list (the small freezing-level request).
 * 169 points with the HRDPS variables make an address of about 3,500 characters, under the 8,000 Open-Meteo takes (a band of rows is shorter).
 */
export function modelUrl(points, profile = GEM_PROFILE, variables = profile.askedVariables) {
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat).join(','),
    longitude: points.map((p) => p.lon).join(','),
    hourly: variables.join(','),
    wind_speed_unit: 'kn',
    timezone: 'GMT',
    forecast_hours: String(ASK_HOURS),
    ...(profile.models ? { models: profile.models } : {}),
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
 * Checks Open-Meteo's reply field by field (it is untrusted); this is the one place it is checked. `points` are the grid points that
 * were asked for. Returns { ok: true, model } or { ok: false, reason, incomplete }. A single wrong value fails the whole reply.
 * A null is allowed as "no data" for that value, unless more than MAX_NULL_SHARE of all the values are null (`incomplete: true`).
 *
 * model: { id, receivedAt, source ('gem' or 'hrdps'), sourceName, gridSize, cloudLevels, times: [ms], points: [{ ...gridPoint, series: { variable: [number or null] } }] };
 * the numbers are as the reply gave them (metres, percent, knots, degrees true), converted when read (`columnAt`). `profile` (default the global GEM's, as before)
 * says which variables the reply must hold; `gridSize` is the square root of the number of points asked for.
 */
export function checkModelReply(reply, { points, receivedAt = Date.now(), profile = GEM_PROFILE } = /** @type {any} */ ({})) {
  const fail = (reason, incomplete = false) => ({ ok: false, reason, incomplete });
  if (!Array.isArray(reply)) return fail('not a list of points');
  if (reply.length !== points.length) return fail(`${reply.length} points, not ${points.length}`);
  let times = null;
  let nulls = 0;
  let total = 0;
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
    for (const variable of profile.variables) {
      const values = hourly[variable];
      if (!Array.isArray(values) || values.length !== times.length) return fail(`point ${n}: ${variable} is not ${times.length} values`);
      const [, lo, hi] = rangeOf(variable);
      for (const v of values) {
        total += 1;
        if (v === null) nulls += 1;
        else if (!isNumber(v) || v < lo || v > hi) return fail(`point ${n}: ${variable} has a value out of range`);
      }
      series[variable] = values.slice();
    }
    out.push({ ...points[n], series });
  }
  if (nulls > total * MAX_NULL_SHARE) return fail(`${nulls} of ${total} values are null`, true);
  const gridSize = Math.round(Math.sqrt(points.length));
  return { ok: true, model: { id: nextModelId++, receivedAt, source: profile.id, sourceName: profile.name, gridSize, cloudLevels: profile.cloudLevels, times, points: out } };
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

/**
 * One grid column at one hour: the cloud levels bottom first ({ hPa, cover, heightFt }) and the freezing level in feet above sea level.
 * A level with no height (null) is left out of the column; a level with no cover (null) has `cover: null`, which is not cloudy. The
 * freezing level and the low, mid and high cover are null when there is no data.
 */
export function columnAt(point, hour, cloudLevels = CLOUD_LEVELS_HPA) {
  const levels = [];
  for (const hPa of cloudLevels) {
    const metres = point.series[`geopotential_height_${hPa}hPa`][hour];
    if (metres === null) continue;
    levels.push({ hPa, cover: point.series[`cloud_cover_${hPa}hPa`][hour], heightFt: metres * FT_PER_M });
  }
  const freezing = point.series.freezing_level_height[hour];
  return {
    levels,
    freezingFt: freezing === null ? null : freezing * FT_PER_M,
    low: point.series.cloud_cover_low[hour],
    mid: point.series.cloud_cover_mid[hour],
    high: point.series.cloud_cover_high[hour],
  };
}

// ---- Cloud ----------------------------------------------------------------------------------------

/** A level's cover as a number: null (no data) is 0, not cloudy, as everywhere in this file. */
const coverOf = (level) => (isNumber(level?.cover) ? level.cover : 0);

/**
 * The model's cloud cover at any height in one column (Dad, 7 Oct: "blend the best you can"): a straight line between the two levels either side, by geopotential
 * height (feet). Between two pressure levels a few hundred metres to a kilometre apart, height and the log of pressure go almost in step (the hypsometric equation), so
 * interpolating by height or by log-pressure gives nearly the same answer; height is used because it is what the slider and the slabs are in. Exactly at a level it is
 * that level's cover. Below the lowest level or above the highest there is no data: null (nothing is made up outside the model's levels).
 *
 * `levels`: [{ cover (percent, or null), heightFt (feet above sea level) }], any order. Returns percent 0 to 100, or null.
 */
export function coverAtHeight(levels, heightFt) {
  const sorted = [...levels].filter((l) => isNumber(l.heightFt)).sort((a, b) => a.heightFt - b.heightFt);
  if (!sorted.length || !isNumber(heightFt) || heightFt < sorted[0].heightFt || heightFt > sorted.at(-1).heightFt) return null;
  for (let k = 1; k < sorted.length; k++) {
    const lo = sorted[k - 1];
    const hi = sorted[k];
    if (heightFt > hi.heightFt) continue;
    const span = hi.heightFt - lo.heightFt;
    const t = span > 0 ? (heightFt - lo.heightFt) / span : 0;
    return coverOf(lo) + (coverOf(hi) - coverOf(lo)) * t;
  }
  return coverOf(sorted[0]); // one level only, and the height is exactly at it
}

/**
 * The height between two levels where the straight-line cover (as `coverAtHeight`) crosses `threshold`: one of them over it and the other not. Feet above sea level.
 */
function crossingFt(a, b, threshold) {
  const ca = coverOf(a);
  const cb = coverOf(b);
  if (ca === cb) return (a.heightFt + b.heightFt) / 2; // cannot happen with one over and one not; kept safe
  const t = Math.min(1, Math.max(0, (threshold - ca) / (cb - ca)));
  return a.heightFt + (b.heightFt - a.heightFt) * t;
}

/**
 * The cloud in one column, as blocks with a base and a top. The 3D view's cloud slabs (cloud-field.js, the default "3D cloud style") are built from these; the old
 * style draws a cover sheet at each level instead (`cloudSheetLevel`, Dad 7 Oct).
 * Each run of levels whose cover is over `threshold` is one block. Its base and top are where the column's cover crosses the threshold (V2.184, Dad 7 Oct: "blend"):
 * between the last clear level and the first cloudy one, at the height where the straight line between their covers (`coverAtHeight`) meets the threshold; so a
 * 20 % level under an 80 % level puts the base a sixth of the way up the gap, not halfway (it was halfway between levels before V2.184). At the open ends (the lowest
 * or highest level cloudy) there is nothing to cross to, so the block goes half the gap to the next level inward, beyond it, as before (an estimate). A block's base
 * is never drawn below `floorFt` (the ground the view draws).
 *
 * `levels`: [{ cover (percent), heightFt (above sea level) }]. Returns [{ baseFt, topFt, cover, levels }] bottom first, where cover is the
 * mean of the levels in the block (percent), `levels` how many model levels it holds, and `baseFt` and `topFt` are feet above sea level.
 */
export function cloudBlocks(levels, { threshold = CLOUD_COVER_THRESHOLD_PCT, floorFt = -Infinity } = {}) {
  const sorted = [...levels].sort((a, b) => a.heightFt - b.heightFt);
  const cloudy = (k) => coverOf(sorted[k]) > threshold;
  /** The block's edge beyond level i, going `direction` (-1 down, +1 up): the crossing to the clear level there, or half a gap past an open end. */
  const edge = (i, direction) => {
    const next = sorted[i + direction];
    if (next) return crossingFt(next, sorted[i], threshold);
    const inner = sorted[i - direction];
    return inner ? sorted[i].heightFt + (direction * Math.abs(sorted[i].heightFt - inner.heightFt)) / 2 : sorted[i].heightFt;
  };
  const blocks = [];
  for (let i = 0; i < sorted.length; i++) {
    if (!cloudy(i)) continue;
    let last = i;
    let sum = 0;
    while (last < sorted.length && cloudy(last)) sum += coverOf(sorted[last++]);
    last -= 1;
    const baseFt = Math.max(edge(i, -1), floorFt);
    const topFt = edge(last, 1);
    if (topFt > baseFt) blocks.push({ baseFt, topFt, cover: sum / (last - i + 1), levels: last - i + 1 });
    i = last;
  }
  return blocks;
}

/** Which stage a height above the ground is in: 'low', 'mid' or 'high' (CLOUD_STAGES_FT_AGL). */
export function cloudStage(baseAglFt) {
  if (baseAglFt < CLOUD_STAGES_FT_AGL.lowTopFt) return 'low';
  return baseAglFt <= CLOUD_STAGES_FT_AGL.midTopFt ? 'mid' : 'high';
}

// ---- Cloud sheets (ForeFlight-style cover maps, Dad 7 Oct) ------------------------------------------------

/** Each sheet's texture is this many pixels across, the 9 x 9 grid smoothed up to it. An estimate for smoothness, SOF-39. */
export const CLOUD_SHEET_PX = 256;
/** How opaque a sheet is where cover is 100 %: about 85 %. An estimate, SOF-39 (the look, not a measurement). */
export const CLOUD_SHEET_ALPHA_MAX = 0.85; // estimate, SOF-39
/** A light blur over the smoothed cover, this many pixels each way (two passes), so the edges of cloud are soft. An estimate, SOF-39. */
export const CLOUD_SHEET_BLUR_PX = 3;
/** A sheet's colour runs from this (thin cloud) to this (thick cloud): white to grey. An estimate, SOF-39. */
export const CLOUD_SHEET_COLOURS = Object.freeze({ thin: Object.freeze([244, 247, 250]), thick: Object.freeze([146, 156, 168]) });

/**
 * How opaque the sheet is at a cover (percent, 0 to 1): clear at or below `threshold`, then easing in (smoothstep) to
 * CLOUD_SHEET_ALPHA_MAX at 100 %. The one place the curve lives. An estimate, SOF-39.
 */
export function sheetAlpha(coverPct, threshold = CLOUD_COVER_THRESHOLD_PCT) {
  if (!isNumber(coverPct) || !(coverPct > threshold)) return 0;
  const t = Math.min(1, (coverPct - threshold) / (100 - threshold));
  return CLOUD_SHEET_ALPHA_MAX * t * t * (3 - 2 * t);
}

/**
 * One cloud level at one hour as the sheet needs it: { hPa, heightFt, values, size, maxCover, meanCover }, or null when no grid point
 * has a height for the level. `heightFt` is the mean geopotential height over the points that have one (feet above sea level).
 * `values` is the 9 x 9 cover (percent) row by row from the south-west (index j * size + i); a null cover is 0, as in a column:
 * not cloudy.
 */
export function cloudSheetLevel(model, hour, hPa) {
  const size = model.gridSize ?? GRID_SIZE;
  const values = new Array(size * size).fill(0);
  let heightSum = 0;
  let heightCount = 0;
  for (const point of model.points) {
    const metres = point.series[`geopotential_height_${hPa}hPa`][hour];
    if (metres !== null) {
      heightSum += metres * FT_PER_M;
      heightCount += 1;
    }
    const cover = point.series[`cloud_cover_${hPa}hPa`][hour];
    if (cover !== null) values[point.j * size + point.i] = cover;
  }
  if (!heightCount) return null;
  return {
    hPa,
    heightFt: heightSum / heightCount,
    values,
    size,
    maxCover: Math.max(...values),
    meanCover: values.reduce((a, b) => a + b, 0) / values.length,
  };
}

/** Every cloud level at the hour that has a height, bottom first: [cloudSheetLevel]. */
export const cloudSheetLevels = (model, hour) => (model.cloudLevels ?? CLOUD_LEVELS_HPA).map((hPa) => cloudSheetLevel(model, hour, hPa)).filter((l) => l !== null);

/** The four Catmull-Rom weights for the points p0 to p3 at t (0 to 1) between p1 and p2: the value is w[0] * p0 + w[1] * p1 + w[2] * p2 + w[3] * p3. */
const catmullWeights = (t) => [
  t * (-0.5 + t * (1 - 0.5 * t)),
  1 + t * t * (-2.5 + 1.5 * t),
  t * (0.5 + t * (2 - 1.5 * t)),
  t * t * (-0.5 + 0.5 * t),
];

/** Where a position 0 to 1 across the grid lies: the cell it is in (0 to size - 2) and how far through it (0 to 1). */
function cellOf(position, size) {
  const g = Math.min(1, Math.max(0, position)) * (size - 1);
  const cell = Math.min(size - 2, Math.floor(g));
  return { cell, t: g - cell };
}

/**
 * A grid's values on the whole `px` by `px` sheet, smoothly (bicubic, Catmull-Rom) between the grid's own values (row 0 the south edge, kept `lo` to `hi`; cover is 0 to
 * 100, the default, and a height is unclamped): across each grid row first, then up the columns, which is the same as a one-point bicubic but quick enough to redo for each
 * hour of the slider. The cloud sheets smooth their cover with it and the cloud slabs (cloud-field.js) their cover, base and top.
 */
export function smoothField(values, size, px, lo = 0, hi = 100) {
  const at = (a, b) => values[Math.min(size - 1, Math.max(0, b)) * size + Math.min(size - 1, Math.max(0, a))];
  const across = Array.from({ length: size }, () => new Float32Array(px)); // each grid row, smoothed across
  for (let x = 0; x < px; x++) {
    const { cell, t } = cellOf(x / (px - 1), size);
    const w = catmullWeights(t);
    for (let j = 0; j < size; j++) across[j][x] = w[0] * at(cell - 1, j) + w[1] * at(cell, j) + w[2] * at(cell + 1, j) + w[3] * at(cell + 2, j);
  }
  const field = new Float32Array(px * px);
  for (let y = 0; y < px; y++) {
    const { cell, t } = cellOf(y / (px - 1), size);
    const w = catmullWeights(t);
    const rows = [-1, 0, 1, 2].map((d) => across[Math.min(size - 1, Math.max(0, cell + d))]);
    for (let x = 0; x < px; x++) field[y * px + x] = Math.min(hi, Math.max(lo, w[0] * rows[0][x] + w[1] * rows[1][x] + w[2] * rows[2][x] + w[3] * rows[3][x]));
  }
  return field;
}
const coverField = (values, size, px) => smoothField(values, size, px);

/**
 * Cover at a place on the grid, smoothly (bicubic, Catmull-Rom) between the grid's own values. `u` and `v` run 0 to 1 across the
 * square, west to east and south to north. The grid's own values are met exactly at the grid points; the result is kept 0 to 100.
 */
export const sampleCover = (values, size, u, v) => sampleField(values, size, u, v);

/** Any grid's value at a place, as `sampleCover` (bicubic, Catmull-Rom), kept `lo` to `hi` (cover's 0 to 100 by default; a height passes -Infinity and Infinity). */
export function sampleField(values, size, u, v, lo = 0, hi = 100) {
  const at = (a, b) => values[Math.min(size - 1, Math.max(0, b)) * size + Math.min(size - 1, Math.max(0, a))];
  const { cell: i, t: tx } = cellOf(u, size);
  const { cell: j, t: ty } = cellOf(v, size);
  const wx = catmullWeights(tx);
  const wy = catmullWeights(ty);
  let sum = 0;
  for (let dj = 0; dj < 4; dj++) for (let di = 0; di < 4; di++) sum += wy[dj] * wx[di] * at(i - 1 + di, j - 1 + dj);
  return Math.min(hi, Math.max(lo, sum));
}

/** A box blur of a square field of `px` by `px` numbers, `radius` pixels each way, edges clamped; one horizontal then one vertical pass. */
export function blur(field, px, radius) {
  if (radius < 1) return field;
  const span = radius * 2 + 1;
  const pass = (from, along) => {
    const to = new Float32Array(from.length);
    const [stepIn, stepAcross] = along ? [1, px] : [px, 1];
    for (let line = 0; line < px; line++) {
      const base = line * stepAcross;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += from[base + Math.min(px - 1, Math.max(0, k)) * stepIn];
      for (let n = 0; n < px; n++) {
        to[base + n * stepIn] = sum / span;
        sum += from[base + Math.min(px - 1, n + radius + 1) * stepIn] - from[base + Math.max(0, n - radius) * stepIn];
      }
    }
    return to;
  };
  return pass(pass(field, true), false);
}

/**
 * A sheet's picture: `px` by `px` RGBA bytes (row 0 is the south edge, the left column the west edge, as a three.js DataTexture is laid
 * on a plane). The 9 x 9 cover is smoothed up (bicubic), blurred a little, then coloured white to grey by cover with the alpha from
 * `sheetAlpha`. Cover at or below the threshold is fully clear. Returns { pixels, drawn } where `drawn` is false when no pixel has any alpha.
 */
export function cloudSheetPixels(values, size, { px = CLOUD_SHEET_PX, threshold = CLOUD_COVER_THRESHOLD_PCT, blurPx = CLOUD_SHEET_BLUR_PX } = {}) {
  const field = blur(blur(coverField(values, size, px), px, blurPx), px, blurPx);
  const pixels = new Uint8Array(px * px * 4);
  const { thin, thick } = CLOUD_SHEET_COLOURS;
  let drawn = false;
  for (let n = 0; n < field.length; n++) {
    const cover = field[n];
    const alpha = sheetAlpha(cover, threshold);
    const t = Math.min(1, Math.max(0, cover / 100));
    for (let c = 0; c < 3; c++) pixels[n * 4 + c] = Math.round(thin[c] + (thick[c] - thin[c]) * t);
    pixels[n * 4 + 3] = Math.round(alpha * 255);
    if (alpha > 0) drawn = true;
  }
  return { pixels, drawn };
}

/** The model's own low, mid and high cover for the hour, averaged over the grid (percent; null when no point has data): { low, mid, high }. */
export function meanLayerCover(model, hour) {
  const sum = { low: 0, mid: 0, high: 0 };
  const count = { low: 0, mid: 0, high: 0 };
  for (const point of model.points) {
    const c = columnAt(point, hour, model.cloudLevels);
    for (const key of ['low', 'mid', 'high']) {
      if (c[key] !== null) {
        sum[key] += c[key];
        count[key] += 1;
      }
    }
  }
  const mean = (key) => (count[key] ? Math.round(sum[key] / count[key]) : null);
  return { low: mean('low'), mid: mean('mid'), high: mean('high') };
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

/**
 * One wind at a grid point and a level at an hour: { x, y, hPa, heightFt, dirTrue, dirMag, kt, barb, words }, or null when the model has
 * no speed, direction or height there (no barb is drawn).
 */
export function windAt(point, hour, hPa) {
  const kt = point.series[`wind_speed_${hPa}hPa`][hour];
  const dirTrue = point.series[`wind_direction_${hPa}hPa`][hour];
  const metres = point.series[`geopotential_height_${hPa}hPa`][hour];
  if (kt === null || dirTrue === null || metres === null) return null;
  const heightFt = metres * FT_PER_M;
  const dirMag = trueToMagnetic(dirTrue);
  return { x: point.x, y: point.y, i: point.i, j: point.j, hPa, heightFt, dirTrue, dirMag, kt, barb: windBarb(kt), words: levelWindWords({ hPa, heightFt, dirMag, kt }) };
}

/** Every this-many grid points (each way) has a barb: every other point of a 9 x 9 grid, every third of a 13 x 13 (25 barbs a level either way). */
export const barbStep = (gridSize) => (gridSize > 9 ? 3 : 2);

/** The barbs to draw: every `barbStep` grid point (each way, so 25 a level), at each of the three levels. Bottom level first. */
export function modelWinds(model, hour) {
  const out = [];
  const step = barbStep(model.gridSize ?? GRID_SIZE);
  for (const hPa of WIND_LEVELS_HPA) {
    for (const point of model.points) {
      const wind = point.i % step === 0 && point.j % step === 0 ? windAt(point, hour, hPa) : null;
      if (wind) out.push(wind);
    }
  }
  return out;
}

/** The winds over home (the centre grid point), one per level, for the key and the labels. */
export function windsOverHome(model, hour) {
  const mid = ((model.gridSize ?? GRID_SIZE) - 1) / 2;
  const centre = model.points.find((p) => p.i === mid && p.j === mid);
  return centre ? WIND_LEVELS_HPA.map((hPa) => windAt(centre, hour, hPa)).filter((w) => w !== null) : [];
}

// ---- Wind as a field (the gentle flow, Dad 7 Oct) and the cloud above a place ---------------------------------------

/**
 * One level's wind over the whole grid at an hour, as east and north components in knots (a wind FROM `dir` blows towards `dir + 180`): { size, u, v, heightFt }
 * with `u` and `v` as Float32Array (NaN where the model has no value) row by row from the south-west, and `heightFt` the level's mean geopotential height; or null
 * when no grid point has a wind at this level.
 */
export function windGrid(model, hour, hPa) {
  const size = model.gridSize ?? GRID_SIZE;
  const u = new Float32Array(size * size).fill(NaN);
  const v = new Float32Array(size * size).fill(NaN);
  let heightSum = 0;
  let heightCount = 0;
  let any = false;
  for (const point of model.points) {
    const kt = point.series[`wind_speed_${hPa}hPa`][hour];
    const dir = point.series[`wind_direction_${hPa}hPa`][hour];
    const metres = point.series[`geopotential_height_${hPa}hPa`]?.[hour] ?? null;
    if (metres !== null) {
      heightSum += metres * FT_PER_M;
      heightCount += 1;
    }
    if (kt === null || dir === null) continue;
    const r = (dir * Math.PI) / 180;
    u[point.j * size + point.i] = -kt * Math.sin(r);
    v[point.j * size + point.i] = -kt * Math.cos(r);
    any = true;
  }
  return any && heightCount ? { size, u, v, heightFt: heightSum / heightCount } : null;
}

/**
 * The wind at a place (`x`, `y` feet from home, inside the square) from a `windGrid`, bilinear between the four grid points round it (a corner with no value is left
 * out and the others weighted). Returns { u, v, kt } (knots east, north, speed) or null where all four are missing.
 */
export function sampleWind(grid, x, y) {
  const { size } = grid;
  const gx = Math.min(1, Math.max(0, (x + AREA_FT / 2) / AREA_FT)) * (size - 1);
  const gy = Math.min(1, Math.max(0, (y + AREA_FT / 2) / AREA_FT)) * (size - 1);
  const i = Math.min(size - 2, Math.floor(gx));
  const j = Math.min(size - 2, Math.floor(gy));
  const tx = gx - i;
  const ty = gy - j;
  let su = 0;
  let sv = 0;
  let sw = 0;
  for (const [di, dj, w] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]]) {
    const n = (j + dj) * size + (i + di);
    if (Number.isNaN(grid.u[n]) || w <= 0) continue;
    su += grid.u[n] * w;
    sv += grid.v[n] * w;
    sw += w;
  }
  if (sw <= 0) return null;
  const uu = su / sw;
  const vv = sv / sw;
  return { u: uu, v: vv, kt: Math.hypot(uu, vv) };
}

/**
 * The cloud above a place, from the model's cloud levels at an hour (`cloudSheetLevels`): { baseFt, topFt } in feet above sea level, the lowest and the highest level above
 * the ground whose cover there (smooth, as the sheets are) is over `threshold`; null with no cloud over the place. `u` and `v` run 0 to 1 across the square, west to east
 * and south to north. A level's own height stands for its cloud, as the sheets do (the cloud's real thickness is not known).
 */
export function cloudColumnAt(levels, u, v, groundFt = 0, threshold = CLOUD_COVER_THRESHOLD_PCT) {
  let baseFt = null;
  let topFt = null;
  for (const level of levels) {
    if (level.heightFt <= groundFt || !(level.maxCover > threshold)) continue;
    if (!(sampleCover(level.values, level.size, u, v) > threshold)) continue;
    baseFt ??= level.heightFt;
    topFt = level.heightFt;
  }
  return baseFt === null ? null : { baseFt, topFt };
}

// ---- Freezing level --------------------------------------------------------------------------------

/** The mean freezing level over the grid at the hour, feet above sea level; points with no data are left out, and null when none has any. */
export function meanFreezingFt(model, hour) {
  let sum = 0;
  let count = 0;
  for (const point of model.points) {
    const { freezingFt } = columnAt(point, hour, model.cloudLevels);
    if (freezingFt !== null) {
      sum += freezingFt;
      count += 1;
    }
  }
  return count ? sum / count : null;
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

/** Open-Meteo's free limit in words, said when a reply was 429 ("Daily API request limit exceeded" was seen on 7 Oct 2026). */
const LIMIT_WORDS = 'Open-Meteo\'s free request limit was reached';

/** What the view says when there is no model data to draw. `incomplete`: the last reply had nulls in over half its values; `limited`: a 429 (the free limit). */
export const unavailableWords = (lastGoodAt, incomplete = false, limited = false) => `${incomplete ? 'Model data incomplete. ' : ''}${limited ? `${LIMIT_WORDS}. ` : ''}Model clouds unavailable, showing METAR decks only (last good answer: ${lastGoodWords(lastGoodAt)}).`;

/** What the view says when a refresh failed but the answer held is still young enough to show: "Model refresh failed at 1030Z, showing the 0900Z answer (90 min old)." */
export function refreshFailedWords({ failedAt, lastGoodAt, now, incomplete = false, limited = false }) {
  const age = Math.max(0, Math.round((+now - lastGoodAt) / 60_000));
  const why = [incomplete ? 'model data incomplete' : null, limited ? LIMIT_WORDS : null].filter(Boolean).join('; ');
  return `Model refresh failed at ${lastGoodWords(failedAt)}${why ? ` (${why})` : ''}, showing the ${lastGoodWords(lastGoodAt)} answer (${age} min old).`;
}
export const LOADING_WORDS = 'Loading model clouds and winds…';
export const CREDIT_WORDS = 'Model clouds and winds: Open-Meteo, ECCC GEM (model estimate)';

/** "about 2300Z": when the model is asked again (`nextRunAt`), for the key. */
export const nextAskWords = (ms) => `about ${lastGoodWords(ms)}`;

/** Where a band of grid rows lies, in words: "150 NM S to 75 NM S of home" (row 0 is the south edge, rows GRID_SPACING_NM apart). */
function bandPlaceWords([first, last], size) {
  const spacing = AREA_NM / (size - 1);
  const at = (j) => {
    const nm = Math.round(-AREA_NM / 2 + j * spacing);
    return nm === 0 ? 'home' : `${Math.abs(nm)} NM ${nm < 0 ? 'S' : 'N'}`;
  };
  return first === last ? `${at(first)} of home` : `${at(first)} to ${at(last)} of home`;
}

/**
 * The words for an HRDPS answer that had bands filled from the global GEM (`model.filled`), or null when there were none: "HRDPS part missing: 26 of 169 points
 * (the band 150 NM N to 188 NM N of home), taken from the global GEM (8 levels there, not 17)."
 */
export function filledWords(model) {
  const f = model?.filled;
  if (!f || !f.points) return null;
  const where = f.bands.map((b) => bandPlaceWords(b, model.gridSize ?? GRID_SIZE)).join('; ');
  return `HRDPS part missing: ${f.points} of ${f.total} points (${f.bands.length === 1 ? 'the band' : 'the bands'} ${where}), taken from the global GEM (${CLOUD_LEVELS_HPA.length} levels there, not ${HRDPS_CLOUD_LEVELS_HPA.length}).`;
}

// ---- The feed --------------------------------------------------------------------------------------

/**
 * The grid's points in `chunks` bands of whole rows, south first, as near equal as can be (13 rows in 6: 3, 2, 2, 2, 2, 2): [{ rows: [first j, last j], points }].
 * A whole row is a band's smallest piece, so a band that fails is a strip across the square, easy to say in words.
 */
export function rowBands(points, chunks = HRDPS_CHUNKS) {
  const rows = [...new Set(points.map((p) => p.j))].sort((a, b) => a - b);
  const n = Math.max(1, Math.min(chunks, rows.length));
  const bands = [];
  let start = 0;
  for (let c = 0; c < n; c++) {
    const count = Math.floor(rows.length / n) + (c < rows.length % n ? 1 : 0);
    const these = new Set(rows.slice(start, start + count));
    start += count;
    const list = points.filter((p) => these.has(p.j));
    if (list.length) bands.push({ rows: [Math.min(...these), Math.max(...these)], points: list });
  }
  return bands;
}

/** A reply that has the shape asked for: one object per point, each with an `hourly` object and a list of times. The values are checked later (checkModelReply). */
const fitsPoints = (json, points) => Array.isArray(json) && json.length === points.length
  && json.every((entry) => entry && typeof entry === 'object' && entry.hourly && typeof entry.hourly === 'object' && Array.isArray(entry.hourly.time));

/** A global GEM entry in the HRDPS reply's shape: the levels it has are kept, the ones it does not have are null (no data, so they are left out of the column). */
function asHrdpsEntry(entry) {
  const { hourly } = entry;
  const out = { time: hourly.time };
  for (const variable of HRDPS_PROFILE.variables) out[variable] = Array.isArray(hourly[variable]) ? hourly[variable] : new Array(hourly.time.length).fill(null);
  return { hourly: out };
}

/**
 * The model feed: asks Open-Meteo for the whole grid while it is running, keeps the last good answer in memory only, and says what there is to draw. `start()` asks at
 * once, then when a newer HRDPS run can be out (`nextRunAt`), or 10, 20, then 40 minutes after failures in a row (RETRY_STEPS_MS). `stop()` ends the request and the
 * timer. It is started only while the 3D view is shown.
 *
 * Which model (Dad, 7 Oct): the finer HRDPS 2.5 km model, every level it answers, asked in HRDPS_CHUNKS bands of rows at once. When nothing is held yet, the global
 * GEM (about 3 s) is asked at the same time and drawn at once as the quick first picture, and the HRDPS answer replaces it when every band is in (`refining` says so
 * meanwhile). A band that fails is filled from the global GEM at its points (the quick answer when there is one, else a small GEM request for those points only), and
 * `model.filled` says where; with no GEM to fill it the HRDPS answer fails whole and the global GEM is the fallback, as before. HRDPS has no freezing level, so a small
 * global request over every third grid point, asked alongside, gives the sheet its mean (a failure of that request only leaves the freezing level out). An answer is
 * checked whole, exactly as before (checkModelReply).
 *
 * An answer that is the global GEM, or HRDPS with a band filled, is asked for again once, RETRY_MS later, in each run's time; otherwise the next ask waits for the next run.
 *
 * - points(size): the grid points for the current home and grid size (`gridPoints`).
 * - fetch, timers (a scheduler scope), now: as the map's other feeds.
 * - onChange(): called when what `view` says has changed.
 */
export function createModelFeed({ points, fetch, timers, now = () => new Date(), onChange = () => {} }) {
  let model = null;
  let lastGoodAt = null;
  let failure = null; // { at, incomplete, limited } while the last refresh has failed
  let failures = 0; // failed asks in a row, for the growing wait (RETRY_STEPS_MS)
  let busy = false;
  let refining = false; // the global answer is showing while HRDPS is on its way
  let askedAt = null;
  let dueAt = null; // when the next ask is due
  let degradedRetry = null; // the run (nextRunAt) in whose time a degraded answer was asked for again
  let running = false;
  let cancelTick = null;
  let controller = new AbortController();

  const changed = () => {
    if (running) onChange();
  };
  const gone = (mine) => mine !== controller || !running;

  /** One request: { ok: true, json } or { ok: false, limited } (limited: a 429, Open-Meteo's free limit). A reply that is not JSON is a failure. */
  async function getJson(url, limits, mine) {
    try {
      const reply = await guardedFetch(fetch, url, { timers, signal: mine.signal, accept: 'application/json', ...limits });
      return { ok: true, json: JSON.parse(bytesToText(reply.bytes)) };
    } catch (err) {
      return { ok: false, limited: /\b429\b/.test(String(err?.message ?? '')) };
    }
  }

  /** The global GEM for every grid point: checkModelReply's result plus `raw` (the reply, for filling HRDPS bands) and `limited`; `stale` when the feed moved on. */
  async function askGem(asked, mine) {
    const got = await getJson(modelUrl(asked, GEM_PROFILE), FETCH_LIMITS.model, mine);
    if (gone(mine)) return { ok: false, stale: true };
    if (!got.ok) return { ok: false, reason: 'request failed', limited: got.limited };
    const result = checkModelReply(got.json, { points: asked, receivedAt: +now(), profile: GEM_PROFILE });
    return { ...result, raw: result.ok ? got.json : null };
  }

  /** The freezing level from a small global request over every FREEZING_STEP-th point: a Map of point index to its series (empty when the request fails). */
  async function askFreezing(asked, mine) {
    const sample = asked.filter((p) => p.i % FREEZING_STEP === 0 && p.j % FREEZING_STEP === 0);
    const byIndex = new Map();
    const got = await getJson(modelUrl(sample, GEM_PROFILE, ['freezing_level_height']), FETCH_LIMITS.model, mine);
    if (got.ok && Array.isArray(got.json) && got.json.length === sample.length) {
      got.json.forEach((entry, n) => {
        const series = entry?.hourly?.freezing_level_height;
        if (Array.isArray(series)) byIndex.set(sample[n].index, series);
      });
    }
    return byIndex;
  }

  /**
   * HRDPS in bands of rows, all at once, with the freezing level alongside. `quick` is the global GEM's answer on its way (first opening), or null. Returns
   * checkModelReply's result with `model.filled` ({ points, total, bands: [[first row, last row]] } or null), `limited` when a band met the free limit, `stale` when
   * the feed moved on.
   */
  async function askHrdps(asked, mine, quick) {
    const bands = rowBands(asked);
    const freezingP = askFreezing(asked, mine);
    const replies = await Promise.all(bands.map((band) => getJson(modelUrl(band.points, HRDPS_PROFILE), FETCH_LIMITS.modelHrdps, mine)));
    if (gone(mine)) return { ok: false, stale: true };
    const limited = replies.some((r) => !r.ok && r.limited);
    const missing = bands.filter((band, k) => !(replies[k].ok && fitsPoints(replies[k].json, band.points)));
    if (missing.length === bands.length) return { ok: false, reason: 'every HRDPS band failed', limited };
    const entries = new Map(); // point index -> reply entry
    bands.forEach((band, k) => {
      if (!missing.includes(band)) band.points.forEach((p, n) => entries.set(p.index, replies[k].json[n]));
    });
    if (missing.length) {
      // The missing bands from the global GEM at the same points: the quick answer when it came, else a small request for those points only.
      const want = missing.flatMap((band) => band.points);
      const held = quick ? await quick : null;
      if (gone(mine)) return { ok: false, stale: true };
      let fill = held?.ok && held.raw ? want.map((p) => held.raw[asked.indexOf(p)]) : null;
      if (!fill) {
        const got = await getJson(modelUrl(want, GEM_PROFILE), FETCH_LIMITS.model, mine);
        if (gone(mine)) return { ok: false, stale: true };
        fill = got.ok && fitsPoints(got.json, want) ? got.json : null;
      }
      if (!fill || !fitsPoints(fill, want)) return { ok: false, reason: 'an HRDPS band failed and the global GEM could not fill it', limited };
      want.forEach((p, n) => entries.set(p.index, asHrdpsEntry(fill[n])));
    }
    const freezing = await freezingP;
    if (gone(mine)) return { ok: false, stale: true };
    const json = asked.map((p) => entries.get(p.index));
    const filledAt = new Set(missing.flatMap((band) => band.points.map((p) => p.index)));
    const length = json[0]?.hourly?.time?.length ?? 0;
    json.forEach((entry, n) => {
      if (filledAt.has(asked[n].index)) return; // a GEM entry keeps its own freezing level
      const series = freezing.get(asked[n].index);
      entry.hourly.freezing_level_height = Array.isArray(series) && series.length === length ? series : new Array(length).fill(null);
    });
    const result = checkModelReply(json, { points: asked, receivedAt: +now(), profile: HRDPS_PROFILE });
    if (result.ok) result.model.filled = missing.length ? { points: filledAt.size, total: asked.length, bands: missing.map((band) => band.rows) } : null;
    return { ...result, limited };
  }

  function adopt(result) {
    model = result.model;
    lastGoodAt = result.model.receivedAt;
    failure = null;
  }

  async function ask() {
    const mine = controller;
    const asked = points(GRID_SIZE);
    busy = true;
    askedAt = +now();
    changed();
    let finished = null;
    if (!model) {
      // Nothing to show yet: the quick global answer and the finer bands are asked for together; the quick one is drawn first.
      const quickP = askGem(asked, mine);
      const fineP = askHrdps(asked, mine, quickP);
      const quick = await quickP;
      if (quick.stale) return;
      if (quick.ok) {
        adopt(quick);
        refining = true;
        changed();
      }
      const fine = await fineP;
      if (fine.stale) return;
      refining = false;
      if (fine.ok) adopt(fine);
      else if (!quick.ok) finished = { at: +now(), incomplete: fine.incomplete === true || quick.incomplete === true, limited: Boolean(fine.limited || quick.limited) };
    } else {
      const fine = await askHrdps(asked, mine, null);
      if (fine.stale) return;
      if (fine.ok) adopt(fine);
      else {
        const fallback = await askGem(asked, mine);
        if (fallback.stale) return;
        if (fallback.ok) adopt(fallback);
        else finished = { at: +now(), incomplete: fallback.incomplete === true || fine.incomplete === true, limited: Boolean(fine.limited || fallback.limited) }; // the answer held, if any, stays until it is too old
      }
    }
    busy = false;
    if (finished) {
      failure = finished;
      failures += 1;
      dueAt = askedAt + retryDelayMs(failures);
    } else {
      failures = 0;
      const run = nextRunAt(askedAt);
      const degraded = model.source !== 'hrdps' || Boolean(model.filled);
      if (degraded && degradedRetry !== run) {
        degradedRetry = run; // once in each run's time: a band that stalled, or HRDPS that was slow, is often there 10 minutes later
        dueAt = Math.min(run, askedAt + RETRY_MS);
      } else dueAt = run;
    }
    changed();
  }

  function tick() {
    if (!running || busy) return;
    if (askedAt === null || dueAt === null || +now() >= dueAt) ask();
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
      if (busy) askedAt = null; // a request cut off in the middle: opened again, it asks again at once
      busy = false;
      refining = false;
    },
    /** The tab is back or the computer woke: ask if due. */
    wake: tick,
    /** Home changed: the grid is somewhere else, so what is held is dropped and a new answer is asked for. */
    setPlace() {
      controller.abort();
      controller = new AbortController();
      model = null;
      lastGoodAt = null;
      failure = null;
      failures = 0;
      busy = false;
      refining = false;
      askedAt = null;
      dueAt = null;
      degradedRetry = null;
      if (running) {
        changed();
        tick();
      }
    },
    /**
     * What to draw and say at `at`: { status, model, lastGoodAt, failedAt, incomplete, limited, refining, nextAt }.
     * - 'ok': the model to draw (`model.sourceName` says which; `model.filled` any HRDPS band taken from the GEM). `failedAt` is the time of a failed refresh (the
     *   answer held is still young enough, STALE_MS), else null. `refining`: the global answer is showing and the finer HRDPS one is on its way.
     * - 'loading': the first ask is still out (or about to go).
     * - 'unavailable': no answer, or the one held is too old (STALE_MS past the time a newer run should have replaced it); no model (never a frozen one).
     *   `incomplete`: the last reply had too many nulls; `limited`: it was refused by Open-Meteo's free limit (429).
     * `nextAt`: when the model is asked again (ms), or null.
     */
    view(at = now()) {
      const old = lastGoodAt !== null && +at > nextRunAt(lastGoodAt) + STALE_MS;
      const incomplete = failure?.incomplete === true;
      const limited = failure?.limited === true;
      if (model && !old) return { status: 'ok', model, lastGoodAt, failedAt: failure?.at ?? null, incomplete, limited, refining, nextAt: dueAt };
      if (!failure && !model) return { status: 'loading', model: null, lastGoodAt, failedAt: null, incomplete: false, limited: false, refining: false, nextAt: dueAt };
      return { status: 'unavailable', model: null, lastGoodAt, failedAt: failure?.at ?? null, incomplete, limited, refining: false, nextAt: dueAt };
    },
  };
}
