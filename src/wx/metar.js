// Parse a METAR or SPECI into plain data. Never throws: text it cannot read is
// listed in `unread`.

import { readConditions, ceilingFt, tokenize } from './conditions.js';
import { resolvePast } from './dates.js';

const STATION = /^[A-Z][A-Z0-9]{3}$/;
const OBS_TIME = /^(\d{2})(\d{2})(\d{2})Z$/;
const TREND = new Set(['TEMPO', 'BECMG', 'NOSIG']);

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
  return report;
}
