// Parse a METAR or SPECI into plain data. Never throws: text it cannot read is
// listed in `unread`.

import { readConditions, ceilingFt, tokenize } from './conditions.js';
import { resolvePast, resolveDay, DAY_MS } from './dates.js';

const STATION = /^[A-Z][A-Z0-9]{3}$/;
const OBS_TIME = /^(\d{2})(\d{2})(\d{2})Z$/;
const TREND = new Set(['TEMPO', 'BECMG', 'NOSIG']);
// "LAST OBS/NXT 011000Z" (or "LAST STFD OBS/NXT ..."): the station's last report until the time given.
const LAST_OBS = /(?:^|\s)LAST (?:STFD )?OBS\/NXT (\d{2})?(\d{2})(\d{2})Z(?:\s|$)/;

/** The next report time in a LAST OBS remark, after the observation time; null when unreadable. */
function nextObservation(match, time) {
  if (!time) return null;
  const [, dd, hh, mm] = match;
  if (dd != null) return resolveDay(Number(dd), Number(hh), Number(mm), time, time);
  const h = Number(hh);
  const m = Number(mm);
  if (h > 24 || m > 59) return null;
  const d = new Date(time);
  let next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m);
  if (next <= +d) next += DAY_MS;
  return new Date(next);
}

/**
 * Parse a METAR or SPECI.
 * `now` resolves the day-of-month in the observation time. A trend forecast at
 * the end (TEMPO, BECMG, NOSIG) is kept apart as `trend`, not read as observed.
 */
export function parseMetar(raw, { now } = {}) {
  now = now ?? new Date();
  const { tokens, remarks } = tokenize(raw);
  const report = {
    raw: String(raw ?? '').trim(),
    type: 'METAR',
    station: null,
    time: null,
    auto: false,
    correction: false,
    nil: false,
    conditions: null,
    ceilingFt: null,
    temperatureC: null,
    dewpointC: null,
    altimeter: null,
    trend: '',
    lastObservation: false,
    nextObservation: null,
    remarks,
    unread: [],
  };
  let i = 0;
  if (tokens[i] === 'METAR' || tokens[i] === 'SPECI') report.type = tokens[i++];
  if (tokens[i] === 'COR') { report.correction = true; i++; }
  if (tokens[i] && STATION.test(tokens[i])) report.station = tokens[i++];
  const tm = tokens[i]?.match(OBS_TIME);
  if (tm) {
    report.time = resolvePast(Number(tm[1]), Number(tm[2]), Number(tm[3]), now);
    i++;
  }
  for (; tokens[i] === 'AUTO' || tokens[i] === 'COR' || tokens[i] === 'NIL'; i++) {
    if (tokens[i] === 'AUTO') report.auto = true;
    if (tokens[i] === 'COR') report.correction = true;
    if (tokens[i] === 'NIL') report.nil = true;
  }
  let end = tokens.findIndex((t, k) => k >= i && TREND.has(t));
  if (end < 0) end = tokens.length;
  report.trend = tokens.slice(end).join(' ');
  const read = readConditions(tokens.slice(i, end));
  report.conditions = read.conditions;
  report.ceilingFt = ceilingFt(read.conditions);
  report.temperatureC = read.temperatureC;
  report.dewpointC = read.dewpointC;
  report.altimeter = read.altimeter;
  report.unread = read.unread;
  const last = remarks.match(LAST_OBS);
  if (last) {
    report.lastObservation = true;
    report.nextObservation = nextObservation(last, report.time);
  }
  return report;
}
