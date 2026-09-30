// Winds aloft on the replay (SPEC-debrief: Weather at the time of the
// flight): the model wind at Lead's altitude, from Open-Meteo's archive of
// past forecasts. Winds only: cloud and visibility come from the METARs
// (Patrick, 08:03Z). Plain values in and out, so it's tested in Node.
// Times are seconds since 1970, as the flight's.
import { MAX_AGE_S, sliceAt } from './slices.js';

/** Open-Meteo's archive of past model runs: free, no key, CORS open, CC BY 4.0. */
export const OPEN_METEO_URL = 'https://historical-forecast-api.open-meteo.com/v1/forecast';
export const OPEN_METEO_CREDIT = 'Open-Meteo (CC BY 4.0)';

const day = (y, m, d) => Date.UTC(y, m - 1, d) / 1000;

/**
 * The models the winds can come from, and the first day Open-Meteo kept each
 * (checked 30 Sep 2026). HRDPS is Canada's 2.5 km model; HRRR is the US 3 km
 * model, which also covers Moose Jaw and goes back further.
 */
export const WIND_MODELS = Object.freeze({
  hrdps: Object.freeze({ id: 'gem_hrdps_continental', label: 'HRDPS', fromT: day(2023, 3, 3) }),
  hrrr: Object.freeze({ id: 'ncep_hrrr_conus', label: 'HRRR', fromT: day(2018, 1, 1) }),
});

/** Pressure levels asked for: from about 1,800 ft (just above Moose Jaw's field) to about 30,000 ft, where the T-6 flies. */
export const WIND_LEVELS_HPA = Object.freeze([950, 925, 850, 800, 700, 600, 500, 400, 300]);

const M_TO_FT = 1 / 0.3048;
const round = (v, step) => Math.round(v / step) * step;
const isoDay = (t) => new Date(t * 1000).toISOString().slice(0, 10);

/**
 * The model to use for a flight: the one chosen, unless the flight is older
 * than that model's archive and the other one has it. Returns a WIND_MODELS key,
 * or null when neither goes back that far.
 */
export function windModelFor(choice, startT) {
  const keys = [choice, ...Object.keys(WIND_MODELS).filter((k) => k !== choice)].filter((k) => Object.hasOwn(WIND_MODELS, k));
  return keys.find((k) => startT >= WIND_MODELS[k].fromT) ?? null;
}

/**
 * The archive address for one point's hourly winds over the flight's days:
 * speed (kt), direction and height at each pressure level. Built only from
 * numbers and a model key from WIND_MODELS.
 */
export function windsUrl({ lat, lon, startT, endT, model }) {
  if (![lat, lon, startT, endT].every(Number.isFinite) || !Object.hasOwn(WIND_MODELS, model)) throw new TypeError('windsUrl: a point, two times and a model');
  const hourly = WIND_LEVELS_HPA.flatMap((p) => [`wind_speed_${p}hPa`, `wind_direction_${p}hPa`, `geopotential_height_${p}hPa`]);
  const q = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    start_date: isoDay(startT - MAX_AGE_S.model), // the hour in force at take-off may be the day before
    end_date: isoDay(endT),
    hourly: hourly.join(','),
    models: WIND_MODELS[model].id,
    wind_speed_unit: 'kn',
    timezone: 'GMT',
  });
  return `${OPEN_METEO_URL}?${q}`;
}

/**
 * Reads Open-Meteo's JSON reply into hours in time order:
 * [{ t, levels: [{ hPa, heightFt, dirDeg, kt }] }], each hour's levels low to
 * high, leaving out any level with a missing value and any hour with none.
 */
export function readWinds(json) {
  const h = json?.hourly;
  if (!h || !Array.isArray(h.time)) return [];
  const hours = [];
  h.time.forEach((time, i) => {
    const t = Date.parse(`${time}:00Z`) / 1000;
    if (!Number.isFinite(t)) return;
    const levels = [];
    for (const hPa of WIND_LEVELS_HPA) {
      const kt = h[`wind_speed_${hPa}hPa`]?.[i];
      const dirDeg = h[`wind_direction_${hPa}hPa`]?.[i];
      const heightM = h[`geopotential_height_${hPa}hPa`]?.[i];
      if ([kt, dirDeg, heightM].every((v) => typeof v === 'number' && Number.isFinite(v))) {
        levels.push({ hPa, heightFt: heightM * M_TO_FT, dirDeg, kt });
      }
    }
    if (levels.length) hours.push({ t, levels: levels.sort((a, b) => a.heightFt - b.heightFt) });
  });
  return hours.sort((a, b) => a.t - b.t);
}

/**
 * The wind's "from" direction and speed as components, so winds can be blended:
 * 350° and 010° halfway give 360°, not 180°.
 */
const toVec = ({ dirDeg, kt }) => {
  const r = (dirDeg * Math.PI) / 180;
  return [kt * Math.sin(r), kt * Math.cos(r)];
};

/** Blends two winds a fraction k of the way from a to b, as vectors. */
function mixWinds(a, b, k) {
  const [ax, ay] = toVec(a);
  const [bx, by] = toVec(b);
  const x = ax + (bx - ax) * k;
  const y = ay + (by - ay) * k;
  const kt = Math.hypot(x, y);
  const dirDeg = kt < 1e-9 ? 0 : ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
  return { dirDeg, kt };
}

/**
 * An hour's levels that are above the ground, low to high. The model's lowest
 * levels can lie under the field (950 hPa is about 1,400 ft, Moose Jaw's field
 * 1,892 ft), and their winds are extrapolated below the surface, so they are
 * left out. fieldFt (above sea level) is optional: without it nothing is.
 */
function usableLevels(hour, fieldFt) {
  const levels = hour?.levels ?? [];
  return Number.isFinite(fieldFt) ? levels.filter((l) => l.heightFt >= fieldFt) : levels;
}

/**
 * The wind at altitudeFt (above sea level) in one model hour, blended between
 * the two levels either side by height, as a vector so 350° and 010° give
 * 360°, not 180°. Returns { dirDeg, kt }, or null outside the levels given.
 * dirDeg is where the wind blows from, degrees true. Options: { fieldFt }, the
 * field's elevation, below which levels are not used (see usableLevels).
 */
export function windAtAltitude(hour, altitudeFt, { fieldFt } = {}) {
  const levels = usableLevels(hour, fieldFt);
  if (!levels.length || !Number.isFinite(altitudeFt)) return null;
  if (altitudeFt < levels[0].heightFt || altitudeFt > levels[levels.length - 1].heightFt) return null;
  const i = Math.max(0, levels.findIndex((l) => l.heightFt >= altitudeFt) - 1);
  const a = levels[i];
  const b = levels[Math.min(i + 1, levels.length - 1)];
  const k = b.heightFt === a.heightFt ? 0 : (altitudeFt - a.heightFt) / (b.heightFt - a.heightFt);
  return mixWinds(a, b, k);
}

/**
 * The wind at altitudeFt at moment t. The model gives one value per hour, so
 * between the hour at or before t and the next one the wind is blended by time
 * as a vector (D176 asked for the hour at or before; a step at each hour lagged
 * by up to 59 minutes). The next hour is left out when it isn't there, is more
 * than 90 minutes on, or has no wind at this height, and then the hour at or
 * before stands alone. Returns null when no hour is in force at t (older than
 * 90 minutes or none yet); otherwise { wind, hoursT, levels }: the wind or null
 * outside the levels, the hour(s) it came from (seconds), and the earlier
 * hour's usable levels for saying why there is none. Options: { fieldFt }.
 */
export function windAt(hours, t, altitudeFt, { fieldFt } = {}) {
  const slice = sliceAt(hours, t, MAX_AGE_S.model);
  if (!slice) return null;
  const { item: before } = slice;
  const levels = usableLevels(before, fieldFt);
  const w0 = windAtAltitude(before, altitudeFt, { fieldFt });
  if (!w0) return { wind: null, hoursT: [before.t], levels };
  const after = hours[hours.indexOf(before) + 1];
  if (t > before.t && after && after.t > t && after.t - before.t <= MAX_AGE_S.model) {
    const w1 = windAtAltitude(after, altitudeFt, { fieldFt });
    if (w1) return { wind: mixWinds(w0, w1, (t - before.t) / (after.t - before.t)), hoursT: [before.t, after.t], levels };
  }
  return { wind: w0, hoursT: [before.t], levels };
}

/**
 * A wind as pilots write it, but marked as true and in knots: direction to the
 * nearest 10° (360 for north), then knots. "270°T/25 kt". The model's
 * directions are true, about 8° from magnetic at Moose Jaw, and a bare
 * "270/25" reads as magnetic, as ATIS winds do.
 */
export function windWords({ dirDeg, kt }) {
  if (Math.round(kt) === 0) return 'calm';
  const d = round(dirDeg, 10) % 360 || 360;
  return `${String(d).padStart(3, '0')}°T/${Math.round(kt)} kt`;
}

/**
 * The words for the wind line at moment t: "model wind 270°T/25 kt at 8,500 ft
 * (HRDPS 14Z, Open-Meteo)", crediting the source as its licence asks, or why
 * there's none. Between two model hours the wind is blended and both hours are
 * named: "(HRDPS 14–15Z, Open-Meteo)". hours: readWinds' result. modelLabel:
 * "HRDPS" or "HRRR". Options: { fieldFt }, the field's elevation: levels
 * under it are not used, and below the lowest one left the line says to see
 * the METAR (D176: no guessing below the model's lowest level).
 */
export function windTextAt(hours, t, altitudeFt, modelLabel, { fieldFt } = {}) {
  const found = windAt(hours, t, altitudeFt, { fieldFt });
  if (!found) return `no ${modelLabel} wind for this time`;
  const at = `${round(altitudeFt, 100).toLocaleString('en-US')} ft`;
  if (!found.wind) {
    const { levels } = found;
    let where = 'no model level above the field';
    if (levels.length) {
      where = altitudeFt < levels[0].heightFt
        ? "below the model's lowest level: see the METAR"
        : `above the model's highest level, ${round(levels[levels.length - 1].heightFt, 100).toLocaleString('en-US')} ft`;
    }
    return `no ${modelLabel} wind at ${at} (${where})`;
  }
  const hourZ = (s) => new Date(s * 1000).toISOString().slice(11, 13);
  const hoursZ = found.hoursT.length === 2 ? `${hourZ(found.hoursT[0])}–${hourZ(found.hoursT[1])}Z` : `${hourZ(found.hoursT[0])}Z`;
  return `model wind ${windWords(found.wind)} at ${at} (${modelLabel} ${hoursZ}, Open-Meteo)`;
}
