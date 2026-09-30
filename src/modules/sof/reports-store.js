// The last good reports, kept in the browser so the screen has something to
// show, with its age, before the first refresh answers (audit #8, SPEC-sof
// "Airfield cards"). Pure: the storage scope is used by the caller.
//
// Only each report's raw text, which source it came from and when it was
// fetched are kept. Everything is parsed again on the way back in by wx's own
// parsers, and anything that doesn't check out is dropped, never guessed
// (SPEC-sof, "Security").
import { parseMetar } from '../../wx/metar.js';
import { parseTaf } from '../../wx/taf.js';
import { SOURCES, validStation } from '../../wx/sources.js';
import { MINUTE_MS } from '../../wx/dates.js';

export const REPORTS_KEY = 'reports';
const VERSION = 1;
const MAX_STATIONS = 30; // as wx's sources
const MAX_REPORT_CHARS = 4000; // as wx's sources
const CLOCK_SKEW_MS = 5 * MINUTE_MS;
/** A kept report older than this is dropped; up to then it shows with its age and STALE. */
export const MAX_KEEP_MS = 3 * 24 * 60 * MINUTE_MS;

const PARSERS = { metar: parseMetar, taf: parseTaf };
const KINDS = Object.keys(PARSERS);

/**
 * What to store for `held`: { metar: Map, taf: Map } of ICAO to { entry, at },
 * where entry is { raw, report, source } as wx's fetchReports gives and `at`
 * is a Date, the time it was fetched. Plain data, safe for JSON.
 */
export function packReports(held) {
  const out = { v: VERSION };
  for (const kind of KINDS) {
    out[kind] = {};
    for (const [icao, { entry, at }] of held?.[kind] ?? []) {
      out[kind][icao] = { raw: entry.raw, source: entry.source ?? null, at: at.toISOString() };
    }
  }
  return out;
}

const isTime = (d) => d instanceof Date && !Number.isNaN(+d);

function readOne(kind, icao, saved, now) {
  if (!validStation(icao) || !saved || typeof saved !== 'object') return null;
  if (typeof saved.raw !== 'string' || !saved.raw || saved.raw.length > MAX_REPORT_CHARS) return null;
  if (!Object.hasOwn(SOURCES, saved.source)) return null;
  const at = new Date(typeof saved.at === 'string' ? saved.at : NaN);
  if (!isTime(at) || +at - +now > CLOCK_SKEW_MS || +now - +at > MAX_KEEP_MS) return null;
  // Parsed with the day it was fetched, so "29th 1800Z" is the day it was.
  let report;
  try {
    report = PARSERS[kind](saved.raw, { now: at });
  } catch {
    return null;
  }
  if (!report || report.station !== icao) return null;
  return { entry: { raw: saved.raw, report, source: saved.source }, at };
}

/**
 * The stored value back as { metar: Map, taf: Map } of ICAO to { entry, at }
 * (the same shape packReports takes). `now` is a Date. Anything missing or
 * wrong is left out; a value that isn't ours gives two empty maps.
 */
export function readReports(saved, { now = new Date() } = {}) {
  const out = { metar: new Map(), taf: new Map() };
  if (!saved || typeof saved !== 'object' || saved.v !== VERSION) return out;
  for (const kind of KINDS) {
    const table = saved[kind];
    if (!table || typeof table !== 'object') continue;
    for (const [icao, one] of Object.entries(table)) {
      if (out[kind].size >= MAX_STATIONS) break;
      const read = readOne(kind, icao, one, now);
      if (read) out[kind].set(icao, read);
    }
  }
  return out;
}
