// Clock changes read from the tz data of the machine running the tests, so a test
// never hard-codes a change day or an offset that a newer tz database may move
// (CI once found Edmonton no longer changes clocks on 1 Nov 2026).

import { utcOffsetMinutes } from '../../../src/core/time.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * The clock changes in a zone in a year, from the running tz data:
 * `[{ kind: 'forward' | 'back', at, before, after, wallMinutes, date }]`.
 * `at` is the instant it happens; `before` and `after` are the offsets (minutes
 * ahead of UTC); `date` is the local date it happens on and `wallMinutes` the
 * local time on the old clock, in minutes after midnight (02:00 is 120).
 */
export function clockChanges(zone, year) {
  const out = [];
  const end = Date.UTC(year + 1, 0, 1);
  let t = Date.UTC(year, 0, 1);
  let previous = utcOffsetMinutes(new Date(t), zone);
  for (t += HOUR; t <= end; t += HOUR) {
    const offset = utcOffsetMinutes(new Date(t), zone);
    if (offset === previous) continue;
    // Somewhere in the last hour: find the minute.
    let at = t - HOUR;
    while (utcOffsetMinutes(new Date(at), zone) === previous) at += MINUTE;
    const wall = new Date(at + previous * MINUTE);
    out.push({
      kind: offset > previous ? 'forward' : 'back',
      at: new Date(at),
      before: previous,
      after: offset,
      wallMinutes: wall.getUTCHours() * 60 + wall.getUTCMinutes(),
      date: { year: wall.getUTCFullYear(), month: wall.getUTCMonth() + 1, day: wall.getUTCDate() },
    });
    previous = offset;
  }
  return out;
}

/**
 * The first change of a kind in a year that happens in the small hours (between
 * 01:00 and 03:00 on the old clock, as in Toronto and Paris), or null. Tests
 * skip, saying so, when a zone has none that year.
 */
export function smallHoursChange(zone, year, kind) {
  return clockChanges(zone, year).find((c) => c.kind === kind && c.wallMinutes >= 60 && c.wallMinutes <= 180) ?? null;
}

/** The message a skipped test gives. */
export const noChange = (zone, year, kind) => `${zone} has no ${kind === 'back' ? 'fall-back' : 'spring-forward'} change in the small hours in ${year} in this machine's tz data`;
