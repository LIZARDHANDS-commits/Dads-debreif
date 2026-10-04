// The low yo-yo: a diving cut across the circle.
import { radToDeg } from '../../../../core/angles.js';
import { clamp, noseAngleDeg } from '../frame.js';
import { bankTowardTargetDeg, physicalBankCommand } from './common.js';

/**
 * Low Yo-Yo: diving circle cut.
 * - Phase 'dive': Unload to 1.5G, roll wings toward target, push nose 15° below horizon
 * - Phase 'cut': Hold 2.0G pull through the bottom, accelerating
 * - Phase 'pull': As nose comes through horizon, pull 4G back up toward bandit's altitude
 * - Completion: When level or climbing with nose within 30° of target bearing: c.next = 'mpt'
 * - Duration guard: Max 8 seconds, then hand to MPT
 */
export function controlLowYoYo(ctx) {
  const { ac, other, p, f } = ctx;
  const c = ac.ctl;

  if (c.t >= 8.0) c.next = 'mpt';
  if ((f.altFt - p.hardDeckFt) <= p.deckMarginFt) c.next = 'mpt';

  const climbDeg = radToDeg(f.climbRad);
  const ata = (other && other.pm) ? noseAngleDeg(ac, other) : 0;
  const targetBank = bankTowardTargetDeg(ac, other, 60);

  if (c.phase === 'dive') {
    if (climbDeg <= -15.0 || c.t >= 3.0) {
      c.phase = 'cut';
    }
    const bankCmdDeg = clamp(targetBank, 30, 85);
    return physicalBankCommand(ctx, bankCmdDeg, 1.5, 1);
  }

  if (c.phase === 'cut') {
    if (climbDeg >= -2.0) {
      c.phase = 'pull';
    }
    const bankCmdDeg = clamp(targetBank, 30, 75);
    return physicalBankCommand(ctx, bankCmdDeg, 2.0, 1);
  }

  // Phase 'pull'
  if (climbDeg >= -1.0 && ata <= 30.0) {
    c.next = 'mpt';
  }

  const pullG = Math.min(4.0, ctx.shaker);
  const bankCmdDeg = clamp(targetBank, 20, 60);
  return physicalBankCommand(ctx, bankCmdDeg, pullG, 1);
}
