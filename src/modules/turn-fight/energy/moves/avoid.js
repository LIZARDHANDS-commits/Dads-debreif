// Collision avoidance in every move (TF-57 PR 3). Pursuit dodges inside its own aim (aimPoint, the 85 ft offset);
// every other move is overridden here only when close: core's closest approach and danger test (ALL-27), and then the pilot breaks away, pulling the lift vector away from the other at what the wing gives
// (the shaker, and 4.7 G while rolling). Near the deck the break never points down. The move takes over again
// once the range opens past the release range.
import { dangerGate, clearanceSide } from '../../../../core/closest-approach.js';
import { availableG } from '../../../../core/t6-performance.js';
import { dot, len, scale, add, sub, unit, velOf, posOf } from '../frame.js';
import { gAndBankForLift } from '../../../../core/point-mass.js';
import { computeTcpa } from './pursuit.js';

// When a pilot breaks (model settings, estimates): the closest point within 4 s and under 300 ft, or closing inside 600 ft;
// the break holds until the range opens past 1,000 ft. Wider than the chase's own test, which aims to pass close for a shot.
const BREAK = Object.freeze({ soonSec: 4, missFt: 300, nearFt: 600, releaseFt: 1000 });

/** The move's command `cmd`, or a break away from the other when a collision is close. */
export function avoidCollision(ctx, cmd) {
  const { ac, other, p, f, kias, shaker } = ctx;
  if (p.collisionAvoidance === false || ac.ctl.mode === 'pursuit' || ac.ctl.mode === 'climbOut' || ac.stall || ac.tumble || !other?.pm || other.tumble) return cmd;
  const cpa = computeTcpa(ac, other);
  // At the closest point itself there is nothing left to dodge; without this a rounding error of 1e-18 s reads as closing
  // and a dry run would break where the real fight does not.
  if (cpa.closing && cpa.tcpaSec < 1e-6) cpa.closing = false;
  ac.deconflicting = dangerGate(ac.deconflicting, cpa, BREAK);
  if (!ac.deconflicting) return cmd;

  const vHat = unit(velOf(ac.pm));
  const up = { x: 0, y: 0, z: 1 };
  const away = sub(posOf(ac.pm), posOf(other.pm));
  let dir = sub(away, scale(vHat, dot(away, vHat))); // away from the other, square to the path
  if (len(dir) < 1) {
    // Dead ahead or behind: break up or down by height, blue up and red down when level.
    const vert = sub(up, scale(vHat, vHat.z));
    dir = scale(vert, clearanceSide(away.z, ac.who === 'red' ? -1 : 1));
  }
  if (f.altFt < p.hardDeckFt + 400 && dir.z < 0) dir = { ...dir, z: 0 };
  if (len(dir) < 1e-9) dir = sub(up, scale(vHat, vHat.z));
  dir = unit(dir);

  const cap = Math.max(1, Math.min(shaker, availableG(kias, true, p.stallKias)));
  const weightPerp = sub(up, scale(vHat, vHat.z));
  let lift = add(weightPerp, scale(dir, cap));
  const m = len(lift);
  if (m > cap) lift = scale(lift, cap / m);
  const { g, bankRad } = gAndBankForLift(lift, vHat, ac.pm.up, ac.bankRad);
  return { ...cmd, g, bankRad, prefer: bankRad >= 0 ? 1 : -1 };
}
