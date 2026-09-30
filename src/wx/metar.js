// Parse a METAR or SPECI into plain data. Never throws: text it cannot read is
// listed in `unread`.

import { readConditions, ceilingFt, tokenize } from './conditions.js';
import { resolveDay } from './dates.js';

const STATION = /^[A-Z][A-Z0-9]{3}$/;
const OBS_TIME = /^(\d{2})(\d{2})(\d{2})Z$/;

/**
 * Parse a METAR or SPECI.
 * `now` resolves the day-of-month in the observation time.
 */
export function parseMetar(raw, { now = new Date() } = {}) {
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
    remarks,
    unread: [],
  };
  let i = 0;
  if (tokens[i] === 'METAR' || tokens[i] === 'SPECI') report.type = tokens[i++];
  if (tokens[i] === 'COR') { report.correction = true; i++; }
  if (tokens[i] && STATION.test(tokens[i])) report.station = tokens[i++];
  const tm = tokens[i]?.match(OBS_TIME);
  if (tm) {
    report.time = resolveDay(Number(tm[1]), Number(tm[2]), Number(tm[3]), now);
    i++;
  }
  for (; tokens[i] === 'AUTO' || tokens[i] === 'COR' || tokens[i] === 'NIL'; i++) {
    if (tokens[i] === 'AUTO') report.auto = true;
    if (tokens[i] === 'COR') report.correction = true;
    if (tokens[i] === 'NIL') report.nil = true;
  }
  const read = readConditions(tokens.slice(i));
  report.conditions = read.conditions;
  report.ceilingFt = ceilingFt(read.conditions);
  report.temperatureC = read.temperatureC;
  report.dewpointC = read.dewpointC;
  report.altimeter = read.altimeter;
  report.unread = read.unread;
  return report;
}
