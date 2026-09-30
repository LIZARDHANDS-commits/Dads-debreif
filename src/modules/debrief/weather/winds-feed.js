// Fetches the model winds for the loaded flight, once per model, while the
// Winds aloft item is on (SPEC-debrief: Weather at the time of the flight,
// R5). Nothing is fetched until asked; closing the flight or the debrief
// stops whatever is still loading.
import { windsUrl, readWinds } from './winds.js';

/**
 * fetch: the browser's fetch (replaceable in tests). onChange: called when a
 * fetch finishes, so the line can redraw.
 * Returns { get(model) → { state: 'loading' | 'ready' | 'busy' | 'failed', daily, hours },
 * retry(), setFlight(flight, point), dispose() }. point is { lat, lon }, where
 * the winds are taken for the whole flight. 'busy' is Open-Meteo's rate limit;
 * `daily` says it's the day's allowance rather than the minute's. retry()
 * forgets the busy and failed ones, so the next get() asks again.
 */
export function createWindsFeed({ fetch = (input, init) => globalThis.fetch(input, init), onChange }) {
  const cache = new Map();
  let flight = null;
  let point = null;
  let aborts = new Set();

  function start(model) {
    const entry = { state: 'loading', daily: false, hours: [] };
    cache.set(model, entry);
    const abort = new AbortController();
    aborts.add(abort);
    const forFlight = flight;
    const url = windsUrl({ ...point, startT: flight.startT, endT: flight.endT, model });
    fetch(url, { signal: abort.signal })
      .then((res) => {
        // Open-Meteo answers 429 with a reason once a browser has used its free
        // allowance for the minute, the hour or the day.
        if (res.status === 429) {
          const busy = (reason) => Promise.reject(Object.assign(new Error('Open-Meteo rate limit'), { busy: true, daily: /daily/i.test(reason) }));
          return Promise.resolve().then(() => res.json()).then((body) => busy(String(body?.reason ?? '')), () => busy(''));
        }
        return res.ok ? res.json() : Promise.reject(new Error(`Open-Meteo answered ${res.status}`));
      })
      .then((json) => {
        entry.hours = readWinds(json);
        entry.state = 'ready';
      })
      .catch((err) => {
        entry.state = err?.busy ? 'busy' : 'failed';
        entry.daily = Boolean(err?.daily);
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
    retry() {
      for (const [model, entry] of cache) if (entry.state === 'busy' || entry.state === 'failed') cache.delete(model);
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
