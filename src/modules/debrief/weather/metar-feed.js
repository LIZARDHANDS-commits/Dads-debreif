// Fetches each airfield's past METARs for the loaded flight, once, while the
// METAR item is on (SPEC-debrief: Weather at the time of the flight, R5).
// Nothing is fetched until asked; closing the flight or the debrief stops
// whatever is still loading, or still waiting.
//
// IEM's CSV doesn't say which report is a SPECI, so once the full list is in
// a second call asks for specials alone (report_type=4) to mark them. It goes
// out a second after the first has finished (IEM's throttle), never at the
// same time, and if it fails the reports are simply left unmarked.
import { metarArchiveUrl, speciArchiveUrl, readArchive, markSpecials } from './metar.js';

/** The pause between IEM's two calls for one airfield. */
export const SPECI_GAP_MS = 1000;

/**
 * fetch: the browser's fetch (replaceable in tests). onChange: called when a
 * fetch finishes, so the line can redraw. timers: a scheduler scope
 * ({ after(ms, cb) → cancel }) that waits out the gap; without one the
 * specials aren't asked for and nothing is marked.
 * Returns { get(icao) → { state: 'loading' | 'ready' | 'failed', reports }, setFlight(flight), dispose() }.
 */
export function createMetarFeed({ fetch = (input, init) => globalThis.fetch(input, init), timers = null, onChange }) {
  const cache = new Map();
  let flight = null;
  let aborts = new Set();
  let waits = new Set();

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
        if (!abort.signal.aborted && forFlight === flight) askSpecials(icao, entry, forFlight);
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

  // The second call, after the gap. Its failure is not an error: nothing changes.
  function askSpecials(icao, entry, forFlight) {
    if (!timers || !entry.reports.length) return;
    const cancel = timers.after(SPECI_GAP_MS, () => {
      waits.delete(cancel);
      const abort = new AbortController();
      aborts.add(abort);
      fetch(speciArchiveUrl(icao, forFlight.startT, forFlight.endT), { signal: abort.signal })
        .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`METAR archive answered ${res.status}`))))
        .then((text) => {
          if (abort.signal.aborted || forFlight !== flight) return;
          const marked = markSpecials(entry.reports, readArchive(text));
          if (marked.some((r, i) => r !== entry.reports[i])) {
            entry.reports = marked;
            onChange();
          }
        })
        .catch(() => {})
        .finally(() => aborts.delete(abort));
    });
    waits.add(cancel);
  }

  function stopAll() {
    for (const abort of aborts) abort.abort();
    aborts = new Set();
    for (const cancel of waits) cancel();
    waits = new Set();
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
