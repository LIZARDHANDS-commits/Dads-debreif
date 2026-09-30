// One flight: up to four tracks on one flat map and one playback window, and
// what each aircraft was doing at any moment.
//
// Ported unchanged from V6's debrief (original/shell.html): tests/golden/
// flight-data-flight.test.js runs V6's own functions next to these. The changes
// decided in specs/SPEC-flight-data.md land one at a time, each named where it is.
import { makeLocalRef, latLonToLocalFt } from '../core/geo.js';
import { FT_PER_M, FTPS_TO_KT } from '../core/units.js';
import { radToDeg, wrapDeg180 } from '../core/angles.js';
import { gFromTrack } from '../core/flight-math.js';
import { GAP_S } from './clean.js';

/**
 * Puts tracks on one map and one time window (V6 projectAll, line 2376).
 * `tracks` is { slot: { name, fixes } } with slots 1 to 4. The map's origin is
 * the first fix of the lowest slot. Playback runs from the latest start to the
 * earliest end; if the tracks don't overlap, from the earliest start to the
 * latest end.
 */
export function buildFlight(tracks) {
  const slots = Object.keys(tracks).map(Number).sort((a, b) => a - b);
  if (!slots.length) return null;
  const first = tracks[slots[0]].fixes[0];
  const ref = makeLocalRef(first.lat, first.lon);
  const out = {};
  for (const slot of slots) {
    const { name, fixes } = tracks[slot];
    out[slot] = {
      slot,
      name,
      fixes: fixes.map(f => {
        const { x, y } = latLonToLocalFt(ref, f.lat, f.lon);
        return { ...f, xFt: x, yFt: y, altFt: f.altM * FT_PER_M };
      }),
    };
  }
  const list = slots.map(s => out[s].fixes);
  let startT = Math.max(...list.map(f => f[0].t));
  let endT = Math.min(...list.map(f => f[f.length - 1].t));
  if (!Number.isFinite(startT) || !Number.isFinite(endT) || endT <= startT) {
    startT = Math.min(...list.map(f => f[0].t));
    endT = Math.max(...list.map(f => f[f.length - 1].t));
  }
  return { tracks: out, ref, startT, endT };
}

/** Index of the fix at or before t, for a t strictly inside the track (V6's binary search). */
function bracket(fixes, t) {
  let lo = 0;
  let hi = fixes.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (fixes[mid].t < t) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * The aircraft at time t (V6 interpTrack, line 2430): position, altitude and
 * recorded G and pitch interpolated in a straight line between the fixes
 * around t, and ground speed over that pair of fixes. Recorded bank (C2) is
 * interpolated the same way, the short way round. Before the first fix or
 * after the last, the end fix itself with the speed of the first or last
 * segment (C6; V6 gave no speed there, so lead read "SLOW"). Latitude and
 * longitude are interpolated like x and y (C6; V6 used the earlier fix's). `inGap` is true between two fixes more than
 * GAP_S seconds apart (C4): the position there is a guess, so the debrief
 * blanks spacing readouts and breaks the line.
 */
export function sampleAt(track, t) {
  const f = track.fixes;
  if (!f.length) return null;
  const n = f.length;
  if (t <= f[0].t) return n < 2 ? { ...f[0], inGap: false } : { ...f[0], speedKt: segmentKt(f[0], f[1]), inGap: false };
  if (t >= f[n - 1].t) return n < 2 ? { ...f[0], inGap: false } : { ...f[n - 1], speedKt: segmentKt(f[n - 2], f[n - 1]), inGap: false };
  const lo = bracket(f, t);
  const a = f[lo];
  const b = f[lo + 1];
  const k = (t - a.t) / (b.t - a.t || 1);
  return {
    ...a,
    xFt: a.xFt + (b.xFt - a.xFt) * k,
    yFt: a.yFt + (b.yFt - a.yFt) * k,
    altFt: a.altFt + (b.altFt - a.altFt) * k,
    lat: a.lat + (b.lat - a.lat) * k,
    lon: a.lon + (b.lon - a.lon) * k,
    t,
    speedKt: segmentKt(a, b),
    gRecorded: between(a.gRecorded, b.gRecorded, k),
    pitchRecordedDeg: between(a.pitchRecordedDeg, b.pitchRecordedDeg, k),
    bankRecordedDeg: bankBetween(a.bankRecordedDeg, b.bankRecordedDeg, k),
    inGap: b.t - a.t > GAP_S && t < b.t,
  };
}

/** Ground speed in knots between two fixes. */
function segmentKt(a, b) {
  return Math.hypot(b.xFt - a.xFt, b.yFt - a.yFt) / (b.t - a.t || 1) * FTPS_TO_KT;
}

/** Recorded bank between two fixes the short way round, so 170° to −170° passes through 180°, not 0° (C2). */
function bankBetween(a, b, k) {
  if (Number.isFinite(a) && Number.isFinite(b)) return wrapDeg180(a + wrapDeg180(b - a) * k);
  return between(a, b, k);
}

function between(a, b, k) {
  if (Number.isFinite(a) && Number.isFinite(b)) return a + (b - a) * k;
  if (Number.isFinite(a)) return a;
  if (Number.isFinite(b)) return b;
  return null;
}

/**
 * Heading in radians (0 = east, counter-clockwise, D35) from the pair of fixes
 * around t, or the first or last pair outside the track (V6 headingAtTrack,
 * line 2151). 0 for a track with fewer than 2 fixes.
 */
export function headingAt(track, t) {
  const f = track.fixes;
  if (!f || f.length < 2) return 0;
  const n = f.length;
  const [a, b] = t <= f[0].t ? [f[0], f[1]]
    : t >= f[n - 1].t ? [f[n - 2], f[n - 1]]
      : [f[bracket(f, t)], f[bracket(f, t) + 1]];
  return Math.atan2(b.yFt - a.yFt, b.xFt - a.xFt);
}

/**
 * Pitch in degrees and where it came from (V6 aircraftPitchAtTrack, line 2446):
 * 'recorded' when the track has a pitch value here, otherwise 'estimated' from
 * the climb angle over ±windowS seconds (capped at ±30°, 0 below 20 ft of
 * travel), or 0 as 'default' when there is too little track.
 */
export function pitchAt(track, t, windowS = 1.5) {
  const p = sampleAt(track, t);
  if (p && Number.isFinite(p.pitchRecordedDeg)) return { deg: p.pitchRecordedDeg, source: 'recorded' };
  const f = track?.fixes;
  if (!f || f.length < 2) return { deg: 0, source: 'default' };
  const t0 = Math.max(f[0].t, t - windowS);
  const t1 = Math.min(f[f.length - 1].t, t + windowS);
  if (t1 - t0 < 0.25) return { deg: 0, source: 'default' };
  const a = sampleAt(track, t0);
  const b = sampleAt(track, t1);
  if (!a || !b) return { deg: 0, source: 'default' };
  const horizFt = Math.hypot(b.xFt - a.xFt, b.yFt - a.yFt);
  const vertFt = (b.altFt || 0) - (a.altFt || 0);
  if (!Number.isFinite(horizFt) || horizFt < 20) return { deg: 0, source: 'estimated' };
  return { deg: Math.max(-30, Math.min(30, radToDeg(Math.atan2(vertFt, horizFt)))), source: 'estimated' };
}

/**
 * Load factor estimated from the turn over ±windowS seconds (V6
 * estimatedGAtTrack, line 2462), using core's gFromTrack for the formula.
 * Null when the track is too short, the aircraft is slower than 20 ft/s, or the
 * answer is outside 0.8 to 9 G.
 */
export function estimatedGAt(track, t, windowS = 1.5) {
  const f = track?.fixes;
  if (!f || f.length < 3) return null;
  const t0 = Math.max(f[0].t, t - windowS);
  const t1 = Math.min(f[f.length - 1].t, t + windowS);
  if (t1 - t0 < 0.5) return null;
  const p0 = sampleAt(track, t0);
  const p1 = sampleAt(track, t1);
  if (!p0 || !p1) return null;
  return gFromTrack({ x: p0.xFt, y: p0.yFt }, headingAt(track, t0), { x: p1.xFt, y: p1.yFt }, headingAt(track, t1), t1 - t0);
}
