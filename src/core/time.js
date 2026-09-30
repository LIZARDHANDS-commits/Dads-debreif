// Time parsing and formatting. Zulu first, local beside it (R10).
// Times inside the code are Date objects or seconds since 1970 UTC; a
// time zone is an IANA name such as 'America/Regina' (Moose Jaw, UTC-6 all year).
// Line numbers refer to original/shell.html unless a sub-page is named.

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const pad2 = n => String(n).padStart(2, '0');

/** Seconds since 1970 as "HH:MM:SSZ", or "--" (debrief `fmtTime`, line 2429). */
export function formatZuluSeconds(sec) {
  if (!Number.isFinite(sec)) return '--';
  return new Date(sec * 1000).toISOString().substr(11, 8) + 'Z';
}

/** A Date as "HH:MM:SSZ" (SOF clock, line 4432). */
export function formatZulu(date) {
  return date.toISOString().slice(11, 19) + 'Z';
}

/**
 * An ISO time such as a KML <when> to seconds since 1970, or NaN.
 * (Debrief `parseKmlText`, line 2321.)
 */
export function parseIsoSeconds(text) {
  return Date.parse(String(text).trim()) / 1000;
}

/** A Date as a Zulu date-time group, "291754Z SEP 26" (SOF page `dtgZulu`, sof line 745). */
export function formatDtgZulu(date) {
  return `${pad2(date.getUTCDate())}${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}Z ` +
    `${MONTHS[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(-2)}`;
}

// Building an Intl.DateTimeFormat costs about 70 µs and a clock can ask every
// frame, so each style keeps one formatter per time zone.
const CLOCK = ['en-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }];
const ZONE_NAME = ['en-US', { timeZoneName: 'short' }];
const WALL_CLOCK = ['en-US', {
  hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
}];
const formatters = new Map();

function formatterFor(style, timeZone) {
  let byZone = formatters.get(style);
  if (!byZone) formatters.set(style, byZone = new Map());
  let formatter = byZone.get(timeZone);
  if (!formatter) byZone.set(timeZone, formatter = new Intl.DateTimeFormat(style[0], { ...style[1], timeZone }));
  return formatter;
}

/**
 * A Date as "HH:MM:SS" wall-clock time in an IANA time zone
 * (SOF page `timeAt`, sof line 743, which always used the current time).
 */
export function formatInZone(date, timeZone) {
  return formatterFor(CLOCK, timeZone).format(date);
}

/** Short zone name such as "CST" or "MDT" (SOF page `zoneAt`, sof line 744). */
export function zoneAbbreviation(date, timeZone) {
  const parts = formatterFor(ZONE_NAME, timeZone).formatToParts(date);
  return parts.find(p => p.type === 'timeZoneName')?.value || '';
}

/**
 * Minutes a time zone is ahead of UTC at a given moment (Moose Jaw: -360).
 * New in the rebuild; V6 hard-coded UTC-6.
 */
export function utcOffsetMinutes(date, timeZone) {
  const parts = Object.fromEntries(formatterFor(WALL_CLOCK, timeZone).formatToParts(date).map(p => [p.type, p.value]));
  // setUTCFullYear, unlike Date.UTC, doesn't turn years 0-99 into 1900-1999.
  const wall = new Date(0);
  wall.setUTCFullYear(+parts.year, +parts.month - 1, +parts.day);
  wall.setUTCHours(+parts.hour, +parts.minute, +parts.second);
  // The parts have no milliseconds, so compare whole seconds (this also keeps UTC at 0, not -0).
  return Math.round((wall.getTime() - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}
