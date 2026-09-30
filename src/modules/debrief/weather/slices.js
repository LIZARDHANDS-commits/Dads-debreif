// Weather at the time of the flight (SPEC-debrief: Weather at the time of
// the flight): which slice of each source goes with a playback moment. Every
// source is a list of timed things (satellite or radar frames, METARs, model
// hours), and the screen shows the last one at or before the moment, with its
// age, never one from the future. Plain values in and out; tested in Node.
// Times are seconds since 1970, as the flight's.
import { greatCircleNm } from '../../../airfields/distance.js';

/**
 * The last item at or before t in `items` (each with a numeric `t`), with how
 * old it is, or null when there is none or it's older than maxAgeS.
 * Returns { item, ageS }.
 */
export function sliceAt(items, t, maxAgeS = Infinity) {
  let lo = 0;
  let hi = items.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].t <= t) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (found < 0) return null;
  const ageS = t - items[found].t;
  return ageS > maxAgeS ? null : { item: items[found], ageS };
}

/** How old a slice may be before the screen stops showing it, per source. */
export const MAX_AGE_S = Object.freeze({
  satellite: 30 * 60, // frames every 10 minutes: three missed in a row and it's gone
  radar: 20 * 60, // frames every 6 to 10 minutes
  lightning: 20 * 60,
  metar: 2 * 3600, // hourly reports; one skipped still counts, older says so
  model: 90 * 60, // hourly model values
});

/**
 * The times to fetch for a source with frames every stepS seconds, covering
 * the flight window: the frame at or before the start, then every step to the
 * end. Aligned to whole steps past the hour, as the sources publish them.
 */
export function frameTimes(startT, endT, stepS) {
  const first = Math.floor(startT / stepS) * stepS;
  const out = [];
  for (let t = first; t <= endT; t += stepS) out.push(t);
  return out;
}

/**
 * Scrubber ticks for the reports inside the flight window, one per report,
 * with its type (METAR or SPECI), in time order.
 */
export function reportTicks(reports, startT, endT) {
  return reports
    .filter((r) => r.t >= startT && r.t <= endT)
    .sort((a, b) => a.t - b.t)
    .map((r) => ({ t: r.t, type: r.type }));
}

/**
 * The airfield nearest a point (Lead at the moment, say): { icao, name, nm },
 * or null with no airfield that has a position. airfields: [{ icao, name, lat, lon }].
 */
export function nearestAirfield(airfields, point) {
  let best = null;
  for (const f of airfields) {
    const d = greatCircleNm(point, f);
    if (d !== null && (!best || d < best.nm)) best = { icao: f.icao, name: f.name ?? null, nm: d };
  }
  return best;
}

/** A slice's age in words for its corner label: "2 min before", "at this moment". */
export function ageText(ageS) {
  const min = Math.round(ageS / 60);
  if (min < 1) return 'at this moment';
  if (min < 90) return `${min} min before`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} h ${rest} min before` : `${h} h before`;
}
