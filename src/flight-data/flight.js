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
import { KmlError } from './kml.js';

/**
 * Puts tracks on one map and one time window (V6 projectAll, line 2376).
 * `tracks` is { slot: { name, fixes, ... } } with slots 1 to 4; anything else
 * on a track (gaps, dropped counts) is kept. The map's origin is the first fix
 * of the lowest slot. Playback runs from the latest start to the earliest end,
 * and `cutTracks` says how many seconds of each track fall outside it. Tracks
 * that don't all overlap are refused with a KmlError naming the one that
 * doesn't fit (C8; V6 silently played the whole span instead).
 */
export function buildFlight(tracks) {
  const slots = Object.keys(tracks).map(Number).sort((a, b) => a - b);
  if (!slots.length) return null;
  const first = tracks[slots[0]].fixes[0];
  const ref = makeLocalRef(first.lat, first.lon);
  const out = {};
  for (const slot of slots) {
    out[slot] = {
      ...tracks[slot],
      slot,
      fixes: tracks[slot].fixes.map(f => {
        const { x, y } = latLonToLocalFt(ref, f.lat, f.lon);
        return { ...f, xFt: x, yFt: y, altFt: f.altM * FT_PER_M };
      }),
    };
  }
  const span = slot => [out[slot].fixes[0].t, out[slot].fixes[out[slot].fixes.length - 1].t];
  const startT = Math.max(...slots.map(s => span(s)[0]));
  const endT = Math.min(...slots.map(s => span(s)[1]));
  if (!(endT > startT)) throw noOverlap(out, slots, span);
  const cutTracks = [];
  for (const slot of slots) {
    const [a, b] = span(slot);
    if (a < startT || b > endT) cutTracks.push({ slot, beforeS: startT - a, afterS: b - endT });
  }
  return { tracks: out, ref, startT, endT, cutTracks };
}

/**
 * Names the track that overlaps the fewest others (the later ship on a tie),
 * or, for one track, says it covers no time.
 */
function noOverlap(tracks, slots, span) {
  const overlaps = slot => slots.filter(o => o !== slot
    && Math.min(span(slot)[1], span(o)[1]) > Math.max(span(slot)[0], span(o)[0])).length;
  const misfit = slots.reduce((worst, slot) => (overlaps(slot) <= overlaps(worst) ? slot : worst));
  const name = tracks[misfit].name ? `"${String(tracks[misfit].name).slice(0, 80)}"` : `Track #${misfit}`;
  if (slots.length === 1) return new KmlError('no-overlap', `${name} covers no time: all its positions have the same time.`);
  return new KmlError('no-overlap', `${name} doesn't overlap in time with the other tracks, so they can't be played back together. Check it's from the same flight.`);
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
 * Below this ground speed (knots) between two fixes the aircraft is taken as
 * still: parked GPS jitter is under it 90 % of the time on all five real
 * tracks, and taxiing is above it 99 % of the time (C7).
 */
export const STILL_KT = 3;

/**
 * Heading in radians (0 = east, counter-clockwise, D35) from the pair of fixes
 * around t, or the first or last pair outside the track (V6 headingAtTrack,
 * line 2151). Null when the aircraft is still over that pair (under STILL_KT)
 * or the track has fewer than 2 fixes (C7; V6 gave 0, due east, so the 3/9
 * line and labels flipped at random on the ramp).
 */
export function headingAt(track, t) {
  const f = track.fixes;
  if (!f || f.length < 2) return null;
  const n = f.length;
  const lo = t <= f[0].t ? 0 : t >= f[n - 1].t ? n - 2 : bracket(f, t);
  const a = f[lo];
  const b = f[lo + 1];
  if (segmentKt(a, b) < STILL_KT) return null;
  return Math.atan2(b.yFt - a.yFt, b.xFt - a.xFt);
}

/**
 * Pitch in degrees and where it came from (V6 aircraftPitchAtTrack, line 2446):
 * 'estimated' from the climb angle over ±windowS seconds (capped at ±30°, 0
 * below 20 ft of travel), or 0 as 'default' when there is too little track.
 * With `recorded: true`, the recorded pitch where the track has one, as V6
 * always did; by default it isn't used, because on the real tracks it is the
 * iPad moving, not the aircraft (C10, Q32).
 */
export function pitchAt(track, t, { recorded = false, windowS = 1.5 } = {}) {
  const p = recorded ? sampleAt(track, t) : null;
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
 * Load factor and where it came from: estimated from the turn (estimatedGAt),
 * or with `recorded: true` the recorded G where the track has one, as V6's
 * debrief did (line 3097). Estimated by default (C10, Q32).
 */
export function gAt(track, t, { recorded = false } = {}) {
  const g = recorded ? sampleAt(track, t)?.gRecorded : null;
  if (Number.isFinite(g)) return { g, source: 'recorded' };
  return { g: estimatedGAt(track, t), source: 'estimated' };
}

/**
 * Load factor estimated from the turn over ±windowS seconds (V6
 * estimatedGAtTrack, line 2462), using core's gFromTrack for the formula.
 * Null when the track is too short, the aircraft is slower than 20 ft/s or
 * still at either end of the window (C7), or the answer is outside 0.8 to 9 G.
 */
export function estimatedGAt(track, t, windowS = 1.5) {
  const f = track?.fixes;
  if (!f || f.length < 3) return null;
  const t0 = Math.max(f[0].t, t - windowS);
  const t1 = Math.min(f[f.length - 1].t, t + windowS);
  if (t1 - t0 < 0.5) return null;
  const p0 = sampleAt(track, t0);
  const p1 = sampleAt(track, t1);
  const h0 = headingAt(track, t0);
  const h1 = headingAt(track, t1);
  if (!p0 || !p1 || h0 === null || h1 === null) return null; // C7: no G without a heading
  return gFromTrack({ x: p0.xFt, y: p0.yFt }, h0, { x: p1.xFt, y: p1.yFt }, h1, t1 - t0);
}
