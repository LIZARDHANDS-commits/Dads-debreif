// The SOF's weather refresh, without a page (SPEC-sof, "Performance" and "Airfield
// cards"): wx's startRefresh on the module's scheduler scope, restarted when the
// airfields change, with the last good reports kept in storage and every request
// and timer ended when the module closes (R4, audit #11).
//
// It holds the newest report of each kind for each station, and for each round
// which reports were newly fetched. A station a round couldn't get keeps its
// older report and is simply not "fresh" in that round, so the card can say the
// refresh failed while still showing the report with its age (audit #8).
import { startRefresh, SOURCES } from '../../wx/sources.js';
import { MINUTE_MS } from '../../wx/dates.js';
import { packReports, readReports, REPORTS_KEY } from './reports-store.js';

/** D67: METARs and TAFs every 5 minutes. */
export const REFRESH_MS = 5 * MINUTE_MS;
const KINDS = ['metar', 'taf'];

// One signal that ends when either does. AbortSignal.any where the browser has it.
function either(a, b) {
  if (!a) return { signal: b, done() {} };
  if (typeof AbortSignal.any === 'function') return { signal: AbortSignal.any([a, b]), done() {} };
  const both = new AbortController();
  const stop = () => both.abort();
  if (a.aborted || b.aborted) stop();
  a.addEventListener('abort', stop, { once: true });
  b.addEventListener('abort', stop, { once: true });
  return {
    signal: both.signal,
    done() {
      a.removeEventListener('abort', stop);
      b.removeEventListener('abort', stop);
    },
  };
}

/**
 * stations: a function returning the ICAOs to fetch, home first (app.airfields.stations).
 * fetch: the browser's fetch (or a fake). timers: the module's scheduler scope.
 * store: the module's storage scope. now: the clock. onChange(): called whenever the
 * snapshot changes (a round starts or ends), never after stop().
 */
export function createWeather({ stations, fetch, timers, store, now = () => new Date(), onChange = () => {} }) {
  const wanted = () => [...new Set(stations())];
  const keyOf = (ids) => ids.join(',');
  const adapter = {
    setTimeout: (cb, ms) => timers.after(ms, cb),
    clearTimeout: (cancel) => cancel?.(),
  };

  // { metar: Map, taf: Map } of ICAO to { entry, at }
  const held = readReports(store.get(REPORTS_KEY, null), { now: now() });
  let handle = null;
  let controller = null;
  let seen = { metar: new Map(), taf: new Map() }; // the entries the last round handed over, to tell new ones
  let lastRound = null;
  let roundOpen = false;
  let stopped = false;
  let currentKey = '';

  const changed = () => {
    if (!stopped) onChange();
  };

  function prune(ids) {
    for (const kind of KINDS) for (const icao of [...held[kind].keys()]) if (!ids.includes(icao)) held[kind].delete(icao);
  }
  prune(wanted());

  function onUpdate(update, mine) {
    if (mine !== controller) return; // a round from stations no longer shown
    roundOpen = false;
    const at = update.fetchedAt;
    const fresh = { metar: new Set(), taf: new Set() };
    for (const kind of KINDS) {
      const handed = new Map();
      for (const [icao, entry] of Object.entries(update[kind] ?? {})) {
        handed.set(icao, entry);
        if (seen[kind].get(icao) !== entry) {
          held[kind].set(icao, { entry, at });
          fresh[kind].add(icao);
        }
      }
      seen[kind] = handed;
    }
    const count = fresh.metar.size + fresh.taf.size;
    const errors = update.errors ?? [];
    lastRound = {
      at,
      kind: count > 0 ? 'ok' : errors.length > 0 ? 'failed' : 'empty',
      sources: [...new Set(errors.map((e) => e.source).filter((s) => Object.hasOwn(SOURCES, s)))],
      fresh,
    };
    if (count > 0) store.set(REPORTS_KEY, packReports(held));
    changed();
  }

  function begin() {
    const ids = wanted();
    currentKey = keyOf(ids);
    prune(ids);
    seen = { metar: new Map(), taf: new Map() };
    const mine = new AbortController();
    controller = mine;
    // Every request ends when the module does, and the first of a round says a round is out.
    const guarded = async (url, init) => {
      if (!roundOpen && mine === controller) { // a round for stations no longer shown must not say one is out
        roundOpen = true;
        changed();
      }
      const both = either(init?.signal, mine.signal);
      try {
        return await fetch(url, { ...init, signal: both.signal });
      } finally {
        both.done();
      }
    };
    handle = startRefresh({
      stations: ids,
      fetch: guarded,
      onUpdate: (update) => onUpdate(update, mine),
      everyMs: REFRESH_MS,
      timers: adapter,
      now,
    });
    handle.ready.catch((err) => console.error('SOF weather refresh failed:', err));
  }

  function end() {
    handle?.stop();
    controller?.abort();
    handle = null;
    controller = null;
    roundOpen = false;
  }

  const entries = (kind) => Object.fromEntries([...held[kind]].map(([icao, { entry }]) => [icao, entry]));

  return {
    /** Starts asking now and every 5 minutes. */
    start() {
      if (!stopped && !handle) begin();
    },
    /** Ends every request and timer for good. */
    stop() {
      stopped = true;
      end();
    },
    /** Starts over for the stations as they are now, keeping the reports held. */
    restart() {
      if (stopped) return;
      end();
      begin();
    },
    /** restart(), but only when the list of stations is different; says whether it did. */
    restartIfChanged() {
      if (stopped || !handle || keyOf(wanted()) === currentKey) return false;
      this.restart();
      return true;
    },
    /** Asks every feed now; does nothing while a round is out. */
    refresh() {
      if (stopped || !handle || roundOpen) return Promise.resolve();
      return handle.refresh();
    },
    /** For when the tab comes back or the computer wakes: asks now if a round is due. */
    wake() {
      if (stopped || !handle || roundOpen) return;
      if (!lastRound || +now() - +lastRound.at >= REFRESH_MS) handle.refresh();
    },
    /**
     * What there is to show: `metar` and `taf` (ICAO to { raw, report, source }), `newestAt`
     * (when the newest held report was fetched, or null), `lastRound` ({ kind: 'ok' | 'failed' |
     * 'empty', at, sources, fresh: { metar: Set, taf: Set } } or null), `busy` and `stopped`.
     */
    snapshot() {
      const times = [...held.metar.values(), ...held.taf.values()].map((r) => +r.at);
      return {
        metar: entries('metar'),
        taf: entries('taf'),
        newestAt: times.length ? new Date(Math.max(...times)) : null,
        lastRound,
        busy: roundOpen,
        stopped,
      };
    },
  };
}
