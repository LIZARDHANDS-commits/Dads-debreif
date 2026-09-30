// Live METARs and TAFs: MET Norway first, Datamask as the backup (SPEC-wx,
// "Sources"). The only module in wx that talks to the network; fetch and the
// timers are passed in, so it runs in tests without one. Never throws.

import { parseMetar } from './metar.js';
import { parseTaf } from './taf.js';
import { ageMinutes, MINUTE_MS } from './dates.js';

const STATION = /^[A-Z0-9]{4}$/;
const TIMEOUT_MS = 10_000;
const REFRESH_MS = 5 * MINUTE_MS;
const MIN_REFRESH_MS = MINUTE_MS;
const METAR_STALE_MIN = 75;
// Replies are untrusted input: cap their size and the number of airfields per call.
const MAX_BODY_CHARS = 256 * 1024;
const MAX_REPORT_CHARS = 4000;
const MAX_STATIONS = 30;
const KINDS = new Set(['metar', 'taf']);

/** True for a four-character station id; anything else never reaches a URL. */
export function validStation(id) {
  return typeof id === 'string' && STATION.test(id.toUpperCase());
}

/** MET Norway tafmetar text: the newest report per station (lines come oldest first). */
export function readMetNo(text) {
  const newest = new Map();
  for (const line of String(text ?? '').split('\n')) {
    const raw = line.trim().replace(/=$/, '').trim();
    const station = raw.split(/\s+/)[0];
    if (raw.length <= MAX_REPORT_CHARS && validStation(station)) newest.set(station.toUpperCase(), raw);
  }
  return newest;
}

/** Datamask JSON: its raw report, or null for a 404 or anything unreadable. */
export function readDatamask(status, json) {
  if (status !== 200 || typeof json?.raw !== 'string') return null;
  const raw = json.raw.trim();
  return raw && raw.length <= MAX_REPORT_CHARS ? raw : null;
}

export const SOURCES = Object.freeze({
  metno: Object.freeze({
    name: 'MET Norway',
    url: (kind, stations) => `https://api.met.no/weatherapi/tafmetar/1.0/${kind}?icao=${stations.join(',')}`,
  }),
  datamask: Object.freeze({
    name: 'NOAA NWS via Datamask',
    url: (kind, station) => `https://datamask.org/api/v1/${kind}/${station}`,
  }),
});

const parse = (kind, raw, now) => (kind === 'taf' ? parseTaf(raw, { now }) : parseMetar(raw, { now }));

/**
 * 'fresh' | 'stale' | 'cancelled', from the report's own times, never the fetch time.
 * A METAR is stale past 75 minutes; a TAF once its valid period has ended.
 */
export function staleness(kind, report, now) {
  if (kind === 'taf') {
    if (report?.cancelled) return 'cancelled';
    return report?.validTo && +report.validTo > +now ? 'fresh' : 'stale';
  }
  const age = report ? ageMinutes(report, now) : null;
  return age != null && age <= METAR_STALE_MIN ? 'fresh' : 'stale';
}

// A plain GET with no custom headers: no CORS preflight. 'no-cache' lets the
// browser revalidate with If-Modified-Since where the source sends Last-Modified.
async function get(fetch, url) {
  const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
  return fetch(url, { cache: 'no-cache', credentials: 'omit', signal });
}

async function readText(res) {
  const text = await res.text();
  if (text.length > MAX_BODY_CHARS) throw new Error(`reply too large (${text.length} characters)`);
  return text;
}

const message = (e) => (e && e.message) || String(e);

/**
 * Fetch reports of one kind ('metar' | 'taf') for a list of stations.
 * Returns { reports: { ICAO: { raw, report, source, status } }, missing, refused, errors }.
 * missing: stations neither source had; refused: ids that are not station ids, or past the first 30.
 */
export async function fetchReports(kind, stations, { fetch, now = new Date() } = {}) {
  const ids = [...new Set((Array.isArray(stations) ? stations : []).map((s) => (typeof s === 'string' ? s.toUpperCase() : s)))];
  const valid = ids.filter(validStation);
  const wanted = valid.slice(0, MAX_STATIONS);
  const refused = [...ids.filter((s) => !validStation(s)), ...valid.slice(MAX_STATIONS)].map(String);
  const result = { reports: {}, missing: [], refused, errors: [] };
  if (!KINDS.has(kind)) {
    result.errors.push({ source: null, station: null, message: `unknown report kind "${String(kind).slice(0, 20)}"` });
    result.missing = wanted;
    return result;
  }
  if (typeof fetch !== 'function') {
    result.errors.push({ source: null, station: null, message: 'no fetch available' });
    result.missing = wanted;
    return result;
  }
  const add = (station, raw, source) => {
    const report = parse(kind, raw, now);
    result.reports[station] = { raw, report, source, status: staleness(kind, report, now) };
  };

  if (wanted.length) {
    try {
      const res = await get(fetch, SOURCES.metno.url(kind, wanted));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const found = readMetNo(await readText(res));
      for (const station of wanted) if (found.has(station)) add(station, found.get(station), 'metno');
    } catch (e) {
      result.errors.push({ source: 'metno', station: null, message: message(e) });
    }
  }

  for (const station of wanted.filter((s) => !result.reports[s])) {
    try {
      const res = await get(fetch, SOURCES.datamask.url(kind, station));
      if (res.status === 404) continue;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = readDatamask(res.status, JSON.parse(await readText(res)));
      const said = raw?.replace(/^(?:(?:TAF|METAR|SPECI|AMD|COR|RTD)\s+)*/, '').split(/\s+/)[0];
      if (raw && said !== station) throw new Error(`reply was for ${String(said).slice(0, 8)}, not ${station}`);
      if (raw) add(station, raw, 'datamask');
    } catch (e) {
      result.errors.push({ source: 'datamask', station, message: message(e) });
    }
  }
  result.missing = wanted.filter((s) => !result.reports[s]);
  return result;
}

/**
 * Fetch METARs and TAFs now and then every `everyMs` (default 5 minutes).
 * onUpdate({ metar, taf, errors, fetchedAt }) after each round. A report that a
 * round can't get is kept from the round before, its status re-checked against now.
 * Returns { ready, refresh, stop }; ready resolves after the first round.
 */
export function startRefresh({ stations, fetch, onUpdate, everyMs = REFRESH_MS, timers = globalThis, now = () => new Date() }) {
  const interval = Number.isFinite(everyMs) && everyMs > 0 ? Math.max(everyMs, MIN_REFRESH_MS) : REFRESH_MS;
  const kept = { metar: {}, taf: {} };
  let timer = null;
  let stopped = false;

  async function refresh() {
    const at = now();
    const [metar, taf] = await Promise.all([
      fetchReports('metar', stations, { fetch, now: at }),
      fetchReports('taf', stations, { fetch, now: at }),
    ]);
    for (const [kind, got] of [['metar', metar], ['taf', taf]]) {
      Object.assign(kept[kind], got.reports);
      for (const r of Object.values(kept[kind])) r.status = staleness(kind, r.report, at);
    }
    if (!stopped) {
      try {
        onUpdate?.({ metar: { ...kept.metar }, taf: { ...kept.taf }, errors: [...metar.errors, ...taf.errors], fetchedAt: at });
      } catch {
        // The page's handler failing must not stop the refresh.
      }
      schedule();
    }
  }

  function schedule() {
    if (timer != null) timers.clearTimeout(timer);
    timer = timers.setTimeout(refresh, interval);
  }

  return {
    ready: refresh(),
    refresh,
    stop() {
      stopped = true;
      if (timer != null) timers.clearTimeout(timer);
    },
  };
}
