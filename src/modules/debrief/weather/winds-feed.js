// Fetches the model winds for the loaded flight, once per model, while the
// Winds aloft item is on (SPEC-debrief: Weather at the time of the flight,
// R5), and the grid of points the wind arrows on the map use, in one request
// (task 12e-2). Nothing is fetched until asked; closing the flight or the
// debrief stops whatever is still loading.
import { windsUrl, windsGridUrl, readWinds, readWindsGrid } from './winds.js';

/**
 * fetch: the browser's fetch (replaceable in tests). onChange: called when a
 * fetch finishes, so the line can redraw.
 * Returns { get(model) → { state: 'loading' | 'ready' | 'busy' | 'failed', daily, failure, hours },
 * getGrid(model) → the same with `grid` (one list of hours per grid point)
 * in place of `hours`, retry(), setFlight(flight, point, gridPoints), dispose() }.
 * point is { lat, lon }, where the Lead line's winds are taken for the whole
 * flight; gridPoints is [{ lat, lon }], where the map's arrows are, all asked
 * for in one request. The two are fetched and cached apart. 'busy' is Open-Meteo's rate limit;
 * `daily` says it's the day's allowance rather than the minute's. 'failed' says
 * why in `failure`: { kind: 'network' } (no answer at all), { kind: 'http',
 * status } (a server error) or { kind: 'reply', status } (an answer that isn't
 * JSON, such as an error page), so the words don't blame the connection for a
 * server's error. retry()
 * forgets the busy and failed ones, so the next get() asks again.
 */
export function createWindsFeed({ fetch = (input, init) => globalThis.fetch(input, init), onChange }) {
  const cache = new Map();
  let flight = null;
  let point = null;
  let gridPoints = [];
  let aborts = new Set();

  // Asks for `url` and files the answer under `key`, read by `read` into the entry.
  function start(key, url, read) {
    const entry = { state: 'loading', daily: false, failure: null, hours: [], grid: [] };
    cache.set(key, entry);
    const abort = new AbortController();
    aborts.add(abort);
    const forFlight = flight;
    fetch(url, { signal: abort.signal })
      .then((res) => {
        // Open-Meteo answers 429 with a reason once a browser has used its free
        // allowance for the minute, the hour or the day.
        if (res.status === 429) {
          const busy = (reason) => Promise.reject(Object.assign(new Error('Open-Meteo rate limit'), { busy: true, daily: /daily/i.test(reason) }));
          return Promise.resolve().then(() => res.json()).then((body) => busy(String(body?.reason ?? '')), () => busy(''));
        }
        if (!res.ok) return Promise.reject(Object.assign(new Error(`Open-Meteo answered ${res.status}`), { failure: { kind: 'http', status: res.status } }));
        return Promise.resolve()
          .then(() => res.json())
          // A body cut off mid-way fails as a TypeError (the connection); text that isn't JSON as a SyntaxError (the reply).
          .catch((err) => Promise.reject(Object.assign(err ?? new Error('unreadable'), {
            failure: err instanceof TypeError ? { kind: 'network', status: null } : { kind: 'reply', status: res.status },
          })));
      })
      .then((json) => {
        read(entry, json);
        entry.state = 'ready';
      })
      .catch((err) => {
        entry.state = err?.busy ? 'busy' : 'failed';
        entry.daily = Boolean(err?.daily);
        entry.failure = err?.busy ? null : (err?.failure ?? { kind: 'network', status: null });
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
      return cache.get(model) ?? start(model, windsUrl({ ...point, startT: flight.startT, endT: flight.endT, model }), (entry, json) => { entry.hours = readWinds(json); });
    },
    getGrid(model) {
      if (!flight || !gridPoints.length) return null;
      const key = `grid ${model}`;
      const points = gridPoints;
      return cache.get(key) ?? start(key, windsGridUrl({ points, startT: flight.startT, endT: flight.endT, model }), (entry, json) => { entry.grid = readWindsGrid(json, points.length); });
    },
    retry() {
      for (const [model, entry] of cache) if (entry.state === 'busy' || entry.state === 'failed') cache.delete(model);
    },
    setFlight(next, nextPoint = null, nextGrid = []) {
      stopAll();
      cache.clear();
      flight = next;
      point = nextPoint;
      gridPoints = nextGrid;
    },
    dispose() {
      stopAll();
      cache.clear();
      flight = null;
      point = null;
      gridPoints = [];
    },
  };
}
