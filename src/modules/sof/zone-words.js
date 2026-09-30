// Local times with the zone's name, said right on a day the clocks change (SPEC-sof, "Waves" and
// "24-hour timeline"). One zone name for a whole day is wrong on the day of a clock change: 01:00 is
// "EST" and 04:00 is "EDT". So each time takes the name it has at its own instant, and a day that
// holds a change says both. Pure; core/time.js does the zone arithmetic.
import { formatInZone, zoneAbbreviation } from '../../core/time.js';

/** "HH:MM" on the wall clock in the zone. */
export const localClock = (date, timeZone) => formatInZone(date, timeZone).slice(0, 5);

/**
 * A stretch of local time in words: "12:00–16:00 CST", or, when the clocks change inside it,
 * "01:00 EST–04:00 EDT" so each end has its own name.
 */
export function zoneSpan(from, to, timeZone) {
  const a = zoneAbbreviation(from, timeZone);
  const b = zoneAbbreviation(to, timeZone);
  return a === b
    ? `${localClock(from, timeZone)}–${localClock(to, timeZone)} ${a}`
    : `${localClock(from, timeZone)} ${a}–${localClock(to, timeZone)} ${b}`;
}

/**
 * The zone name(s) for a day from `from` to `to`, in time order: "CST", or "EST/EDT" when the clocks
 * change that day. The day is read at its start, middle and just before its end.
 */
export function dayZones(from, to, timeZone) {
  const middle = new Date((+from + +to) / 2);
  const names = [from, middle, new Date(+to - 60_000)].map((d) => zoneAbbreviation(d, timeZone));
  return [...new Set(names)].join('/');
}
