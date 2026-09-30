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

/**
 * A Date as "HH:MM:SS" wall-clock time in an IANA time zone
 * (SOF page `timeAt`, sof line 743, which always used the current time).
 */
export function formatInZone(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date);
}

/** Short zone name such as "CST" or "MDT" (SOF page `zoneAt`, sof line 744). */
export function zoneAbbreviation(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(date);
  return parts.find(p => p.type === 'timeZoneName')?.value || '';
}

/**
 * Minutes a time zone is ahead of UTC at a given moment (Moose Jaw: -360).
 * New in the rebuild; V6 hard-coded UTC-6.
 */
export function utcOffsetMinutes(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(date).map(p => [p.type, p.value]));
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((wall - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/**
 * The UTC moment for a report's day-of-month and time (as in "2916/2920"),
 * choosing the month (previous, same or next) that lands closest to ref.
 * (SOF page `utcFor`, sof line 1431.)
 */
export function resolveDayOfMonthUtc(day, hour, min, ref) {
  const cand = [];
  for (let dm = -1; dm <= 1; dm++) {
    cand.push(new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + dm, day, hour, min || 0)));
  }
  return cand.sort((a, b) => Math.abs(a - ref) - Math.abs(b - ref))[0];
}
