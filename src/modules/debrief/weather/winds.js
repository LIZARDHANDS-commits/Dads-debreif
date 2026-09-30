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
 * The wind at altitudeFt (above sea level) in one model hour, blended between
 * the two levels either side by height, as a vector so 350° and 010° give
 * 360°, not 180°. Returns { dirDeg, kt }, or null outside the levels given.
 * dirDeg is where the wind blows from, degrees true.
 */
export function windAtAltitude(hour, altitudeFt) {
  const levels = hour?.levels ?? [];
  if (!levels.length || !Number.isFinite(altitudeFt)) return null;
  if (altitudeFt < levels[0].heightFt || altitudeFt > levels[levels.length - 1].heightFt) return null;
  const i = Math.max(0, levels.findIndex((l) => l.heightFt >= altitudeFt) - 1);
  const a = levels[i];
  const b = levels[Math.min(i + 1, levels.length - 1)];
  const k = b.heightFt === a.heightFt ? 0 : (altitudeFt - a.heightFt) / (b.heightFt - a.heightFt);
  // Components of the wind's "from" direction: blending these gives the blended direction.
  const vec = (l) => {
    const r = (l.dirDeg * Math.PI) / 180;
    return [l.kt * Math.sin(r), l.kt * Math.cos(r)];
  };
  const [ax, ay] = vec(a);
  const [bx, by] = vec(b);
  const x = ax + (bx - ax) * k;
  const y = ay + (by - ay) * k;
  const kt = Math.hypot(x, y);
  const dirDeg = kt < 1e-9 ? 0 : ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
  return { dirDeg, kt };
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
 * (HRDPS 14Z, Open-Meteo)", crediting the source as its licence asks,
 * or why there's none. hours: readWinds' result. modelLabel: "HRDPS" or "HRRR".
 */
export function windTextAt(hours, t, altitudeFt, modelLabel) {
  const slice = sliceAt(hours, t, MAX_AGE_S.model);
  if (!slice) return `no ${modelLabel} wind for this time`;
  const at = `${round(altitudeFt, 100).toLocaleString('en-US')} ft`;
  const wind = windAtAltitude(slice.item, altitudeFt);
  const hourZ = `${new Date(slice.item.t * 1000).toISOString().slice(11, 13)}Z`;
  if (!wind) {
    const { levels } = slice.item;
    const ft = (l) => `${round(l.heightFt, 100).toLocaleString('en-US')} ft`;
    const where = altitudeFt < levels[0].heightFt ? `below the lowest model level (${ft(levels[0])})` : `above the highest model level (${ft(levels[levels.length - 1])})`;
    return `no ${modelLabel} wind at ${at}: ${where}`;
  }
  return `model wind ${windWords(wind)} at ${at} (${modelLabel} ${hourZ}, Open-Meteo)`;
}
