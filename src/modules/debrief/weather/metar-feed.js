// Fetches each airfield's past METARs for the loaded flight, once, while the
// METAR item is on (SPEC-debrief: Weather at the time of the flight, R5).
// Nothing is fetched until asked; closing the flight or the debrief stops
// whatever is still loading.
import { metarArchiveUrl, readArchive } from './metar.js';

/**
 * fetch: the browser's fetch (replaceable in tests). onChange: called when a
 * fetch finishes, so the line can redraw.
 * Returns { get(icao) → { state: 'loading' | 'ready' | 'failed', reports }, setFlight(flight), dispose() }.
 */
export function createMetarFeed({ fetch = (...args) => globalThis.fetch(...args), onChange }) {
  const cache = new Map();
  let flight = null;
  let aborts = new Set();

  function start(icao) {
    const entry = { state: 'loading', reports: [] };
    cache.set(icao, entry);
    const abort = new AbortController();
    aborts.add(abort);
    const forFlight = flight;
    fetch(metarArchiveUrl(icao, flight.startT, flight.endT), { signal: abort.signal })
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`METAR archive answered ${res.status}`))))
      .then((text) => {
        entry.reports = readArchive(text);
        entry.state = 'ready';
      })
      .catch(() => {
        entry.state = 'failed';
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
    get(icao) {
      if (!flight) return null;
      return cache.get(icao) ?? start(icao);
    },
    setFlight(next) {
      stopAll();
      cache.clear();
      flight = next;
    },
    dispose() {
      stopAll();
      cache.clear();
      flight = null;
    },
  };
}
