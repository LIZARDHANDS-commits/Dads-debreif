// Fix times off the GPS second (DB-25; Dad's ask, 10 Oct 2026: "#3 and #4 aft spacing just goes crazy ... could it be
// a time sync issue with the Sentry vs ForeFlight"). A GPS receiver works out one position each whole GPS second. When
// it is an external receiver (a Sentry or similar "puck") relayed to the logging iPad, the iPad can stamp each position
// when it arrives, a few tenths of a second late, and the delay wanders. At 255 kt over the ground a second of clock is
// about 430 ft, so a 0.25 s stamp error reads as about 100 ft of fore/aft spacing, and its wander as a ship that never
// sits still in position.
//
// judgeTiming says whether a track shows that signature; retimeFlight puts each such fix back on the GPS second it
// belongs to, and adds a time shift the person picks, then works out the gaps and the playback window again. Pure: the
// caller says, per ship, whether to snap and by how much to shift. Applied once, on the placed fixes, before the GPS
// puck move and the gap fill (both read the times). Positions are never changed.
//
// Every number below is an ESTIMATE chosen from the example flight's four tracks, not a source.
import { findGaps } from './clean.js';
import { playbackWindow } from './flight.js';
import { GAP_FILL } from './gap-fill.js';
import { FTPS_TO_KT } from '../core/units.js';

export const TIMING = Object.freeze({
  /**
   * A stamp this close before a whole second counts as that second. The loggers round to the millisecond: on the
   * example flight #1 and #2 are stamped x.998 to x.999 s, which is the next whole second.
   */
  roundS: 0.05,
  /** A track is on GPS seconds when at least this share of its judged fixes is within roundS of a whole second. */
  onShare: 0.8,
  /** The offset signature: at least this share of judged fixes within bandS of their typical (median) offset ... */
  bandShare: 0.8,
  bandS: 0.2,
  /** ... with that typical offset between these (seconds after the second): a relay delay, not a clock on the second. */
  minOffsetS: 0.1,
  maxOffsetS: 0.75,
  /**
   * ... and logged about once a second: the typical step between judged fixes at least this long. A track logged
   * faster (5 Hz, 0.5 s steps) has real fractional times, evenly spread, and is never snapped.
   */
  minStepS: 0.9,
  /** Fewer judged fixes than this and the track is not judged (left as recorded). */
  minFixes: 30,
  /** The time shift the person can add, seconds either way, in steps of shiftStepS. */
  maxShiftS: 2,
  shiftStepS: 0.1,
});

/** Seconds past the GPS second a stamp sits, in [−roundS, 1 − roundS): x.998 is −0.002, x.25 is 0.25. */
function offsetOf(t) {
  const r = TIMING.roundS;
  return ((((t + r) % 1) + 1) % 1) - r;
}

/** The GPS second a stamp belongs to: the whole second at or before it, a stamp just under a second counting as that second. */
function gpsSecond(t) {
  return Math.floor(t + TIMING.roundS);
}

const median = (a) => {
  const s = [...a].sort((p, q) => p - q);
  return s.length ? s[s.length >> 1] : NaN;
};

/**
 * How a track's fix times sit against the GPS second, judged on its airborne fixes (ground speed from the fix before at
 * least GAP_FILL.groundKt, 40 kt; on the ground the iPad may log its own GPS), or on all fixes when fewer than minFixes
 * are airborne. Fixes need t, xFt and yFt (placed by buildFlight). Returns { kind, offsetS, share, stepS, fixes }:
 * - 'on': on GPS seconds (nothing to snap);
 * - 'off': the relay signature, `offsetS` the typical offset (median), `share` of fixes within bandS of it;
 * - 'subsecond': logged faster than once a second, times taken as real;
 * - 'irregular': none of these; left as recorded;
 * - 'few': too few fixes to judge; left as recorded.
 */
export function judgeTiming(fixes) {
  const air = [];
  for (let i = 1; i < fixes.length; i++) {
    const a = fixes[i - 1];
    const b = fixes[i];
    const dt = b.t - a.t;
    if (dt > 0 && Math.hypot(b.xFt - a.xFt, b.yFt - a.yFt) / dt * FTPS_TO_KT >= GAP_FILL.groundKt) air.push(i);
  }
  const judged = air.length >= TIMING.minFixes ? air : fixes.map((_, i) => i).slice(1);
  const out = { kind: 'few', offsetS: null, share: null, stepS: null, fixes: judged.length };
  if (judged.length < TIMING.minFixes) return out;
  out.stepS = median(judged.map((i) => fixes[i].t - fixes[i - 1].t));
  const offs = judged.map((i) => offsetOf(fixes[i].t));
  const onShare = offs.filter((d) => Math.abs(d) <= TIMING.roundS).length / offs.length;
  if (onShare >= TIMING.onShare) return { ...out, kind: 'on', offsetS: 0, share: onShare };
  if (!(out.stepS >= TIMING.minStepS)) return { ...out, kind: 'subsecond' };
  const typical = median(offs);
  const share = offs.filter((d) => Math.abs(d - typical) <= TIMING.bandS).length / offs.length;
  const fits = typical >= TIMING.minOffsetS && typical <= TIMING.maxOffsetS && share >= TIMING.bandShare;
  return { ...out, kind: fits ? 'off' : 'irregular', offsetS: typical, share };
}

/** A shift in seconds kept within ±maxShiftS and to shiftStepS steps; 0 for anything that isn't a number. */
export function clampShift(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const step = TIMING.shiftStepS;
  const r = Math.round(Math.max(-TIMING.maxShiftS, Math.min(TIMING.maxShiftS, n)) / step) * step;
  return Math.abs(r) < 1e-9 ? 0 : Number(r.toFixed(1));
}

/**
 * The fixes on their GPS seconds: each moved to the whole second it belongs to (gpsSecond), so the order is kept. Two
 * fixes landing on one second (a stamp more than a second late meeting the next one): the one whose offset is nearer the
 * typical offset stays. Returns { fixes, dropped }; kept fixes are new objects with `t` changed, all else as it was.
 */
export function snapFixes(fixes, offsetS) {
  const out = [];
  let dropped = 0;
  for (const f of fixes) {
    const t = gpsSecond(f.t);
    const prev = out[out.length - 1];
    if (prev && prev.t === t) {
      dropped++;
      if (Math.abs(offsetOf(f.t) - offsetS) < Math.abs(offsetOf(prev.tRecorded) - offsetS)) out[out.length - 1] = { ...f, t, tRecorded: f.t };
      continue;
    }
    out.push({ ...f, t, tRecorded: f.t });
  }
  return { fixes: out.map(({ tRecorded, ...f }) => f), dropped };
}

/**
 * The flight with each ship's times as `choices` { slot: { snap, shiftS } } say: `snap` (default true) puts a track
 * judged 'off' on its GPS seconds (snapFixes); a track judged otherwise is never snapped. `shiftS` (default 0, clampShift)
 * is then added to every fix. The gaps and the playback window are worked out again on the new times (findGaps,
 * playbackWindow; a KmlError if the tracks no longer overlap). Every track gains `timing: { kind, offsetS, snapped,
 * dropped, shiftS }`, so the screen can say what was found and done. When nothing is snapped or shifted the fixes, gaps
 * and window are the ones given.
 */
export function retimeFlight(flight, choices = {}) {
  if (!flight) return flight;
  let changed = false;
  const tracks = {};
  for (const [slot, tr] of Object.entries(flight.tracks)) {
    const judged = judgeTiming(tr.fixes);
    const snap = judged.kind === 'off' && choices?.[slot]?.snap !== false;
    const shiftS = clampShift(choices?.[slot]?.shiftS);
    const timing = { kind: judged.kind, offsetS: judged.offsetS, snapped: snap, dropped: 0, shiftS };
    if (!snap && !shiftS) {
      tracks[slot] = { ...tr, timing };
      continue;
    }
    changed = true;
    let fixes = tr.fixes;
    if (snap) ({ fixes, dropped: timing.dropped } = snapFixes(fixes, judged.offsetS));
    if (shiftS) fixes = fixes.map((f) => ({ ...f, t: f.t + shiftS }));
    tracks[slot] = { ...tr, fixes, gaps: findGaps(fixes), timing };
  }
  if (!changed) return { ...flight, tracks };
  return { ...flight, tracks, ...playbackWindow(tracks) };
}
