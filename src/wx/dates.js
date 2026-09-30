// Weather reports carry only day-of-month, hour and minute. These helpers turn
// them into full UTC dates using a reference time (normally "now").

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Full UTC date for a day-of-month, hour and minute.
 * Candidates are that day in the month before, of and after `ref`. Hour 24 is
 * midnight at the end of the day. With `after`, the earliest candidate at or
 * after it wins; otherwise the candidate nearest `ref`.
 */
export function resolveDay(day, hour, minute, ref, after = null) {
  const r = new Date(ref);
  const candidates = [];
  for (let dm = -1; dm <= 1; dm++) {
    const midnight = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + dm, day));
    if (midnight.getUTCDate() !== day) continue; // e.g. the 31st of a 30-day month
    candidates.push(midnight.getTime() + hour * HOUR_MS + minute * MINUTE_MS);
  }
  if (!candidates.length) return null;
  if (after != null) {
    const later = candidates.filter((t) => t >= +after).sort((a, b) => a - b);
    if (later.length) return new Date(later[0]);
  }
  candidates.sort((a, b) => Math.abs(a - r) - Math.abs(b - r));
  return new Date(candidates[0]);
}

/** Minutes between a report's own time (observation or issue) and `now`, or null. */
export function ageMinutes(report, now) {
  const t = report?.time ?? report?.issued;
  if (!t) return null;
  return (+now - +t) / MINUTE_MS;
}

export { MINUTE_MS, HOUR_MS, DAY_MS };
