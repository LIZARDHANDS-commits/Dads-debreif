// Fetches each airfield's past METARs for the loaded flight, once, while the
// METAR item is on (SPEC-debrief: Weather at the time of the flight, R5).
// Nothing is fetched until asked; closing the flight or the debrief stops
// whatever is still loading, or still waiting.
//
// IEM's CSV doesn't say which report is a SPECI, so once the full list is in
// a second call asks for specials alone (report_type=4) to mark them. It goes
// out a second after every other IEM call has finished (IEM's throttle, across
// airfields), never at the same time as another, and if it fails the reports are simply left unmarked.
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
        if (!abort.signal.aborted && forFlight === flight) {
          onChange();
          pump();
        }
      });
    return entry;
  }

  // The second calls, one at a time, each a gap after every other IEM call has finished (IEM's
  // throttle is per browser, not per airfield). Their failure is not an error: nothing changes.
  let pending = []; // { icao, entry, forFlight }
  let waiting = null; // cancel for the gap under way
  const busy = () => aborts.size > 0;

  function askSpecials(icao, entry, forFlight) {
    if (!timers || !entry.reports.length) return;
    pending.push({ icao, entry, forFlight });
    pump();
  }

  function pump() {
    if (waiting || busy() || !pending.length) return;
    waiting = timers.after(SPECI_GAP_MS, () => {
      waiting = null;
      if (busy()) return; // another call went out meanwhile: its end pumps again, a full gap later
      const job = pending.shift();
      if (job) sendSpecials(job);
    });
  }

  function sendSpecials({ icao, entry, forFlight }) {
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
      .finally(() => {
        aborts.delete(abort);
        if (!abort.signal.aborted) pump();
      });
  }

  function stopAll() {
    for (const abort of aborts) abort.abort();
    aborts = new Set();
    waiting?.();
    waiting = null;
    pending = [];
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
