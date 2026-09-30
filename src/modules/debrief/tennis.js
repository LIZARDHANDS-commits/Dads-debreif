// The tennis ball (SPEC-debrief: Tennis ball, Q33 to Q37): picks the moment
// and the two ships, reads their tracks, and asks core's one solver
// (src/core/tennis.js) for the answer both views draw. Plain values in and
// out, so it's tested in Node.
import { tennisBall } from '../../core/tennis.js';
import { sampleAt, headingAt, pitchAt } from '../../flight-data/flight.js';

/**
 * V6's tennis-ball settings with their defaults, and the limits the boxes
 * take. Cone width is the whole cone, so 6° is ±3° (Q35, D77); INTERCEPT
 * needs the target inside it (Q36, D77), which is core's rule.
 */
export const TENNIS_LIMITS = Object.freeze({
  ballKt: Object.freeze({ min: 50, max: 2000, step: 10 }),
  pitchBiasDeg: Object.freeze({ min: -30, max: 30, step: 1 }),
  coneDeg: Object.freeze({ min: 1, max: 60, step: 1 }),
  tofSec: Object.freeze({ min: 0.25, max: 10, step: 0.25 }),
  hitRadiusFt: Object.freeze({ min: 10, max: 5000, step: 25 }),
});

const at = (s) => ({ x: s.xFt, y: s.yFt, altFt: s.altFt, spdKt: s.speedKt });

/**
 * The tennis ball at time t. s: { tennisShooter, tennisTarget, tennisBallKt,
 * tennisPitchBias, tennisConeDeg, tennisTofSec, tennisRadiusFt, tennisGravity }.
 * Returns core's solution with { shooterId, targetId, ballKt, coneDeg,
 * pitchDeg, pitchBias, pitchSource, hdg, shooter } added, or { status, message }
 * when there's nothing to solve.
 */
export function tennisAt(flight, t, s) {
  const shooterId = Number(s.tennisShooter);
  const targetId = Number(s.tennisTarget);
  if (shooterId === targetId) return { status: 'PICK TWO', message: 'Choose two different aircraft.' };
  const shooterTr = flight?.tracks[shooterId];
  const targetTr = flight?.tracks[targetId];
  if (!shooterTr || !targetTr) return { status: 'LOAD DATA', message: `Load #${shooterId} and #${targetId} tracks.` };
  const now = sampleAt(shooterTr, t);
  const there = sampleAt(targetTr, t);
  if (now.inGap || there.inGap) return { status: 'GPS GAP', message: `#${now.inGap ? shooterId : targetId} is in a GPS gap.` };
  const hdg = headingAt(shooterTr, t);
  if (hdg === null) return { status: 'NOT MOVING', message: `#${shooterId} isn't moving, so it has no nose to throw from.` };
  const pitch = pitchAt(shooterTr, t);
  const pitchBias = Number(s.tennisPitchBias) || 0;
  const pitchDeg = (Number.isFinite(pitch.deg) ? pitch.deg : 0) + pitchBias;
  // The shooter's climb over the two seconds round t (Q33).
  const climbFps = (sampleAt(shooterTr, t + 1).altFt - sampleAt(shooterTr, t - 1).altFt) / 2;
  const endT = targetTr.fixes.at(-1).t;
  const shooter = at(now);
  const solution = tennisBall({
    shooter,
    target: at(there),
    // The target flies its recorded path (Q34, Q37); past its last fix it stays put.
    targetAt: (tau) => at(sampleAt(targetTr, Math.min(t + tau, endT))),
    shooterHdg: hdg,
    shooterClimbFps: Number.isFinite(climbFps) ? climbFps : 0,
    pitchDeg,
    ballKt: Number(s.tennisBallKt),
    coneDeg: Number(s.tennisConeDeg),
    tofSec: Number(s.tennisTofSec),
    hitRadiusFt: Number(s.tennisRadiusFt),
    gravity: Boolean(s.tennisGravity),
  });
  return {
    ...solution, shooterId, targetId, shooter, hdg, pitchDeg, pitchBias, pitchSource: pitch.source,
    ballKt: Number(s.tennisBallKt), coneDeg: Number(s.tennisConeDeg),
  };
}

/** The tone each status shows in: good, caution or bad (V6's colours). */
export function tennisTone(status) {
  if (status === 'INTERCEPT') return 'good';
  if (status === 'IN CONE') return 'caution';
  if (status === 'OUT OF CONE') return 'bad';
  return 'caution';
}
