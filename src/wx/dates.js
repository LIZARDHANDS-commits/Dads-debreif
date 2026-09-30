// Weather reports carry only day-of-month, hour and minute. These helpers turn
// them into full UTC dates using a reference time (normally "now").

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** A valid Date from a Date, a timestamp or a date string; otherwise null. */
export function toDate(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(+d) ? null : d;
}

/** Candidate times for a day-of-month in the month before, of and after `ref`. */
function candidates(day, hour, minute, ref) {
  const r = toDate(ref);
  const valid = r && day >= 1 && day <= 31 && hour >= 0 && hour <= 24 && minute >= 0 && minute <= 59
    && !(hour === 24 && minute > 0);
  if (!valid) return [];
  const out = [];
  for (let dm = -1; dm <= 1; dm++) {
    const midnight = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + dm, day));
    if (midnight.getUTCDate() !== day) continue; // e.g. the 31st of a 30-day month
    out.push(midnight.getTime() + hour * HOUR_MS + minute * MINUTE_MS);
  }
  return out;
}

/**
 * Full UTC date for a day-of-month, hour and minute. Hour 24 is midnight at the
 * end of the day. With `after`, the earliest candidate at or after it wins;
 * otherwise the candidate nearest `ref`. Null for impossible values.
 */
export function resolveDay(day, hour, minute, ref, after = null) {
  const list = candidates(day, hour, minute, ref);
  if (!list.length) return null;
  if (after != null) {
    const later = list.filter((t) => t >= +after).sort((a, b) => a - b);
    if (later.length) return new Date(later[0]);
  }
  list.sort((a, b) => Math.abs(a - +toDate(ref)) - Math.abs(b - +toDate(ref)));
  return new Date(list[0]);
}

/**
 * Observation or issue time: the latest candidate no more than an hour after `now`,
 * since a report is never written in the future.
 */
export function resolvePast(day, hour, minute, now) {
  const limit = +toDate(now) + HOUR_MS;
  const past = candidates(day, hour, minute, now).filter((t) => t <= limit);
  return past.length ? new Date(Math.max(...past)) : null;
}

/** Minutes between a report's own time (observation or issue) and `now`, or null. */
export function ageMinutes(report, now) {
  const t = report?.time ?? report?.issued;
  const n = toDate(now);
  if (!t || !n) return null;
  return (+n - +t) / MINUTE_MS;
}

export { MINUTE_MS, HOUR_MS, DAY_MS };
