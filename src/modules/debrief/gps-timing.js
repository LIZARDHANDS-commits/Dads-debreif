// The GPS timestamps setting (DB-25; Dad's ask, 10 Oct 2026): per ship, whether a track whose times sit off the GPS
// second (an external receiver relayed to the iPad and stamped on arrival) is snapped back to its GPS seconds, and a
// time shift; the flight retimed that way; and what the screen says about it. Plain values, no page access.
import { retimeFlight, clampShift, TIMING } from '../../flight-data/timing.js';

/** The Timestamps choices; 'auto' (the default) snaps only a track found off the second. */
export const TIMESTAMP_CHOICES = Object.freeze([
  Object.freeze({ value: 'auto', label: 'Snapped to GPS second (auto)' }),
  Object.freeze({ value: 'recorded', label: 'As recorded' }),
]);

export const SHIFT_LIMITS = Object.freeze({ min: -TIMING.maxShiftS, max: TIMING.maxShiftS, step: TIMING.shiftStepS });

/**
 * Only the ships with a choice away from the defaults, as { slot: { recorded?: true, shiftS? } }, from anything stored
 * (outside data, so checked).
 */
export function readTimings(value) {
  const out = {};
  if (!value || typeof value !== 'object') return out;
  for (let slot = 1; slot <= 4; slot++) {
    const v = value[slot];
    if (!v || typeof v !== 'object') continue;
    const one = {};
    if (v.recorded === true) one.recorded = true;
    const shiftS = clampShift(v.shiftS);
    if (shiftS) one.shiftS = shiftS;
    if (Object.keys(one).length) out[slot] = one;
  }
  return out;
}

/** Where a flight's timestamp choices are kept in this browser, beside its GPS puck choices. */
export function timingStorageKey(fingerprint) {
  return `debrief:timing:${fingerprint}`;
}

/** The flight with each ship's times as chosen (flight-data retimeFlight): auto snaps a track found off the second. */
export function withTimings(flight, timings) {
  if (!flight) return flight;
  const t = readTimings(timings);
  const choices = {};
  for (const slot of Object.keys(flight.tracks)) choices[slot] = { snap: !t[slot]?.recorded, shiftS: t[slot]?.shiftS ?? 0 };
  return retimeFlight(flight, choices);
}

/** "0.24 s", "−0.3 s": seconds with a real minus sign. */
const secs = (s, places) => `${s < 0 ? '−' : ''}${Math.abs(s).toFixed(places)} s`;
const signed = (s) => `${s > 0 ? '+' : ''}${secs(s, 1)}`;

const ships = (list) => list.map((tr) => `#${tr.slot}`).join(', ');

/** The words for the ships retimed, in order: snapped (with the offsets unless `short`), then each shift. */
function timingParts(flight, { short = false } = {}) {
  if (!flight) return { snapped: '', shifted: [] };
  const tracks = Object.values(flight.tracks).sort((a, b) => a.slot - b.slot);
  const snapped = tracks.filter((tr) => tr.timing?.snapped);
  const about = short ? '' : ` (about ${snapped.map((tr) => secs(tr.timing.offsetS, 2)).join(', ')})`;
  return {
    snapped: snapped.length ? `${ships(snapped)}${short ? '' : ' timestamps'} snapped to GPS seconds${about}` : '',
    shifted: tracks.filter((tr) => tr.timing?.shiftS).map((tr) => `#${tr.slot} shifted ${signed(tr.timing.shiftS)}`),
  };
}

/** The status line's words, e.g. "#3, #4 timestamps snapped to GPS seconds (about 0.24 s, 0.26 s), #4 shifted −0.3 s", or ''. */
export function timingSummary(flight) {
  const { snapped, shifted } = timingParts(flight);
  return [snapped, ...shifted].filter(Boolean).join(', ');
}

/** What the GPS source box says beside a ship's Timestamps choice: what was found in its times. */
export function timingFound(track) {
  const t = track?.timing;
  if (!t) return '';
  if (t.kind === 'on') return 'On GPS seconds';
  if (t.kind === 'off') return `About ${secs(t.offsetS, 2)} after the GPS second`;
  if (t.kind === 'subsecond') return 'Logged faster than once a second: as recorded';
  if (t.kind === 'irregular') return 'Irregular timing: as recorded';
  return 'Too few positions to judge: as recorded';
}

/** One ship's status-details lines about its times: snapped, found off the second but kept, irregular, shifted. */
export function timingLines(track) {
  const t = track?.timing;
  if (!t) return [];
  const lines = [];
  if (t.snapped) {
    const left = t.dropped ? `; ${t.dropped} ${t.dropped === 1 ? 'position' : 'positions'} sharing a second left out` : '';
    lines.push(`Timestamps snapped to GPS seconds: recorded about ${secs(t.offsetS, 2)} after the second, as an external GPS relayed to the iPad is${left}`);
  } else if (t.kind === 'off') {
    lines.push(`Timestamps about ${secs(t.offsetS, 2)} after the GPS second, kept as recorded`);
  } else if (t.kind === 'irregular') {
    lines.push('Timestamps irregular (not on the GPS second, not a steady offset): kept as recorded');
  }
  if (t.shiftS) lines.push(`Times shifted ${signed(t.shiftS)}`);
  return lines;
}

/** The CSV's note after "time (Zulu)", e.g. " (#3, #4 snapped to GPS seconds; #4 shifted −0.3 s)", or ''. */
export function timingHeaderNote(flight) {
  const { snapped, shifted } = timingParts(flight, { short: true });
  const words = [snapped, ...shifted].filter(Boolean).join('; ');
  return words ? ` (${words})` : '';
}
