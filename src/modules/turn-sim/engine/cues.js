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
