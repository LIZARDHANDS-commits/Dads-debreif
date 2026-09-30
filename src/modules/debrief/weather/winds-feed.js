// Fetches the model winds for the loaded flight, once per model, while the
// Winds aloft item is on (SPEC-debrief: Weather at the time of the flight,
// R5). Nothing is fetched until asked; closing the flight or the debrief
// stops whatever is still loading.
import { windsUrl, readWinds } from './winds.js';

/**
 * fetch: the browser's fetch (replaceable in tests). onChange: called when a
 * fetch finishes, so the line can redraw.
 * Returns { get(model) → { state: 'loading' | 'ready' | 'busy' | 'failed', hours },
 * setFlight(flight, point), dispose() }. point is { lat, lon }, where the
 * winds are taken for the whole flight.
 */
export function createWindsFeed({ fetch = (input, init) => globalThis.fetch(input, init), onChange }) {
  const cache = new Map();
  let flight = null;
  let point = null;
  let aborts = new Set();

  function start(model) {
    const entry = { state: 'loading', hours: [] };
    cache.set(model, entry);
    const abort = new AbortController();
    aborts.add(abort);
    const forFlight = flight;
    const url = windsUrl({ ...point, startT: flight.startT, endT: flight.endT, model });
    fetch(url, { signal: abort.signal })
      .then((res) => {
        // Open-Meteo answers 429 once a browser has used its free daily allowance.
        if (res.status === 429) return Promise.reject(Object.assign(new Error('Open-Meteo daily limit'), { busy: true }));
        return res.ok ? res.json() : Promise.reject(new Error(`Open-Meteo answered ${res.status}`));
      })
      .then((json) => {
        entry.hours = readWinds(json);
        entry.state = 'ready';
      })
      .catch((err) => {
        entry.state = err?.busy ? 'busy' : 'failed';
      })
      .finally(() => {
        aborts.delete(abort);
        if (!abort.signal.aborted && forFlight === flight) onChange();
      });
    return entry;
  }

  function stopAll() {
    for (const abort of aborts) abort.abort();
    aborts = new Set();
  }

  return {
    get(model) {
      if (!flight || !point) return null;
      return cache.get(model) ?? start(model);
    },
    setFlight(next, nextPoint = null) {
      stopAll();
      cache.clear();
      flight = next;
      point = nextPoint;
    },
    dispose() {
      stopAll();
      cache.clear();
      flight = null;
      point = null;
    },
  };
}
