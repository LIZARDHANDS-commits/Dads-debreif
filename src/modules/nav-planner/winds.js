// The wind on each leg (docs/modules/nav-planner/spec.md, "Times, fuel and wind"; NP-8): None (still air), Typed (one wind, °T and kt), or
// the Debrief's model winds aloft (its Open-Meteo archive, weather/winds.js, through its winds feed, weather/winds-feed.js, both imported as
// they are): one request for every leg's middle, HRDPS unless the time is older than HRDPS's archive, then HRRR. Each leg takes the wind at its
// MSL altitude and the time the aircraft reaches it, blended between levels and hours as the Debrief does.
// When data fails: no answer, a rate limit, or no wind at that time or height leaves the leg in still air with the reason (windFor's `none`).
import { createWindsFeed } from '../debrief/weather/winds-feed.js';
import { windAt, windModelFor, WIND_MODELS, windFailureText, OPEN_METEO_CREDIT } from '../debrief/weather/winds.js';
import { FIELD_FT } from './legs.js';

/** How far ahead of the take-off time the model hours are asked for, seconds: a long low-level route is under three hours (estimate). */
const SPAN_S = 3 * 3600;

/**
 * fetch: the browser's fetch (for tests); onChange(): when the model winds arrive or fail.
 * Returns { windFor(settings, legPoints) -> the function computeLegs takes, status(settings) -> words for the Wind box, update(settings, mids), dispose() }.
 * @param {{ fetch?: any, onChange: () => void }} options
 */
export function createLegWinds({ fetch, onChange }) {
  const feed = createWindsFeed({ ...(fetch ? { fetch } : {}), onChange });
  let key = '';
  let model = null;
  let count = 0;

  /** Asks for the model winds when the choice is Model and the legs' middles or the time changed (rounded to 0.01°, as the request is). */
  function update(settings, mids) {
    const t = Date.parse(settings.wind.timeZ) / 1000;
    if (settings.wind.mode !== 'model' || !Number.isFinite(t) || !mids.length) {
      if (key) feed.setFlight(null);
      key = '';
      model = null;
      return;
    }
    const nextKey = `${t}|${mids.map((m) => `${m.lat.toFixed(2)},${m.lon.toFixed(2)}`).join(';')}`;
    if (nextKey === key) return;
    key = nextKey;
    model = windModelFor('hrdps', t);
    count = mids.length;
    feed.setFlight(model ? { startT: t, endT: t + SPAN_S } : null, null, model ? mids : []);
  }

  const entry = () => (model ? feed.getGrid(model) : null);

  return {
    update,
    /** The function computeLegs asks for each leg's wind (legs.js). */
    windFor(settings) {
      const w = settings.wind;
      if (w.mode === 'typed') return () => ({ fromDegT: w.fromDegT, kt: w.kt });
      if (w.mode !== 'model') return () => null;
      const t0 = Date.parse(w.timeZ) / 1000;
      if (!Number.isFinite(t0)) return () => ({ none: 'still air: no time chosen for the model winds' });
      if (!model) return () => ({ none: 'still air: no model archive goes back to that time' });
      const e = entry();
      if (!e || e.state !== 'ready') return () => ({ none: e?.state === 'loading' ? 'still air: model winds loading' : 'still air: no model winds (see Wind)' });
      return (i, { altFt, startS }) => {
        const hours = e.grid[i];
        if (!hours?.length) return { none: 'still air: no model wind for this leg' };
        const found = windAt(hours, t0 + startS, altFt, { fieldFt: FIELD_FT });
        if (!found) return { none: 'still air: no model wind for this time' };
        if (!found.wind) return { none: `still air: no model wind at ${Math.round(altFt / 100) * 100} ft` };
        return { fromDegT: found.wind.dirDeg, kt: found.wind.kt };
      };
    },
    /** Words for the Wind box. */
    status(settings) {
      const w = settings.wind;
      if (w.mode === 'none') return 'Still air on every leg (no wind).';
      if (w.mode === 'typed') return `One wind on every leg: ${String(Math.round(w.fromDegT) % 360 || 360).padStart(3, '0')}°T at ${Math.round(w.kt)} kt (typed).`;
      if (!Number.isFinite(Date.parse(w.timeZ))) return 'Choose the take-off date and time (Zulu) for the model winds. Still air until then.';
      if (!model) return 'No model archive goes back to that time. Still air on every leg.';
      const e = entry();
      const label = WIND_MODELS[model].label;
      if (!e || e.state === 'loading') return `${label} winds aloft loading for ${count} legs…`;
      if (e.state === 'busy') return `${label} winds: Open-Meteo is busy (${e.daily ? 'the day\'s' : 'the minute\'s'} allowance). Still air until they load; change the time to try again.`;
      if (e.state === 'failed') return `${windFailureText(label, e.failure, 'Change the time to try again.')} Still air on every leg.`;
      return `${label} model winds aloft at each leg's middle, height and time (${OPEN_METEO_CREDIT}).`;
    },
    retry() {
      feed.retry();
      key = '';
    },
    dispose() {
      feed.dispose();
    },
  };
}
