// The clock position cue: an aircraft waits until another aircraft passes a
// clock position on it, then turns. Ported from V6 `clockCueCrossed` (line 1493)
// and the clock branch of `cueSatisfied` (line 1519). Pure: aircraft in, a yes or
// no out (the aircraft carry the little state the check needs).
//
// Clock positions are read from the aircraft's own nose, as V6 does: 12 is
// straight ahead, 3 is right, 9 is left, 6 is behind (src/core/angles.js).
import { relativeBearingDeg, clockToRelativeDeg, wrapDeg180 } from '../../../core/angles.js';

/**
 * The tolerance V6 always used, in degrees: it read the box itself instead of its value (line 1498, issue #32).
 * Now only the fallback when the setting is 0 or missing; the Clock tolerance setting is what is used.
 */
export const V6_CLOCK_TOLERANCE_DEG = 4;

const asCore = (a) => ({ x: a.xFt, y: a.yFt, hdg: a.headingRad });

/**
 * True once `target` has reached the clock position on aircraft `a`, and from then on (V6 `clockCueCrossed`,
 * line 1493). It counts as reached when the target is within the tolerance of the position, or has passed
 * through it since the last check. `a` keeps its own last reading (prevClockCueRelDeg) and whether it has
 * triggered (clockCueTriggered), so call it once per step while a waits.
 *
 * cue: { clockPos, toleranceDeg }: the clock position to watch (a number of hours, 5.5 is 5:30) unless `a` has
 * its own (a.clockPos, when not 'global'), and the tolerance in degrees.
 */
export function clockCueCrossed(a, target, cue) {
  if (!a || !target || a.id === target.id) return false;
  if (a.clockCueTriggered) return true;
  const cueClock = a.clockPos && a.clockPos !== 'global' ? a.clockPos : cue.clockPos;
  const targetDeg = clockToRelativeDeg(cueClock);
  const tol = cue.toleranceDeg;
  const cur = wrapDeg180(relativeBearingDeg(asCore(a), asCore(target)) - targetDeg);
  const prev = Number.isFinite(a.prevClockCueRelDeg) ? a.prevClockCueRelDeg : null;
  a.prevClockCueRelDeg = cur;
  let crossed = false;
  if (Math.abs(cur) <= tol) crossed = true;
  else if (prev !== null && Math.abs(cur - prev) <= 180) {
    // Passing through the clock position between two steps.
    crossed = (prev < 0 && cur > 0) || (prev > 0 && cur < 0);
  }
  if (crossed) a.clockCueTriggered = true;
  return crossed;
}

/**
 * The clock position an aircraft watches for, as a number of hours (5.5 is 5:30):
 * its own when it has one, else the global setting.
 */
export function clockPosHours(a, globalClockPos) {
  const own = a.clockPos && a.clockPos !== 'global' ? a.clockPos : globalClockPos;
  return parseFloat(own);
}

/**
 * What one aircraft's cue is doing, for the status lines (V6 `updateClockCueStatus`, line 1262, live):
 *   mode: 'off' (Timing is not the clock cue), 'start' (nothing to watch: it starts at once),
 *         'waiting' (watching targetId for clockPos), 'triggered' (the cue came, or the aircraft is already turning)
 *   targetId: the aircraft it watches, or null
 *   clockPos: the position it watches for, in hours (5.5 is 5:30)
 *   cantSee: true for #3 and #4 in the offset box at 5:30, which V6 never turns (issue #16, Q44c); the screen says so.
 *
 * `aircraft` is an internal aircraft; cue: { timing, clockCuePos, formation }.
 */
export function cueStatus(a, cue) {
  const clockPos = clockPosHours(a, cue.clockCuePos);
  if (cue.timing !== 'clock') return { mode: 'off', targetId: null, clockPos, cantSee: false };
  const targetId = a.autoClockTargetId || null;
  const mode = !targetId ? 'start' : a.clockCueTriggered || a.active || a.done ? 'triggered' : 'waiting';
  return { mode, targetId, clockPos, cantSee: cue.formation === 'offsetBox' && (a.id === 3 || a.id === 4) && targetId !== null && clockPos === 5.5 };
}
