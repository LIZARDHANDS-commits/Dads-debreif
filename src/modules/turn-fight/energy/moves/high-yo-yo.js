// The high yo-yo: a climbing lag displacement.
import { radToDeg } from '../../../../core/angles.js';
import { clamp, noseAngleDeg } from '../frame.js';
import { bankTowardTargetDeg, physicalBankCommand } from './common.js';

/**
 * High Yo-Yo: climbing lag displacement.
 * - Phase 'climb': Pull 3-4G to raise nose 25° above horizon, bleeding speed
 * - Phase 'apex': At apex (speed dropped 30-40 KIAS), roll lift vector toward target
 * - Phase 'dive': Unload and nose back down toward target, accelerating
 * - Completion: When descending with nose within 30° of target bearing: c.next = 'mpt'
 * - Duration guard: Max 10 seconds, then hand to MPT
 */
export function controlHighYoYo(ctx) {
  const { ac, other, p, f, kias } = ctx;
  const c = ac.ctl;

  if (c.t >= 10.0) c.next = 'mpt';
  if ((f.altFt - p.hardDeckFt) <= p.deckMarginFt) c.next = 'mpt';

  const climbDeg = radToDeg(f.climbRad);
  const ata = (other && other.pm) ? noseAngleDeg(ac, other) : 0;
  const targetBank = bankTowardTargetDeg(ac, other, 60);

  if (c.phase === 'climb') {
    const speedBled = (c.entryKias - kias) >= 30;
    if (climbDeg >= 25.0 || speedBled || c.t >= 3.5) {
      c.phase = 'apex';
      c.apexT = c.t;
    }
    const pullG = Math.min(3.5, ctx.shaker);
    const bankCmdDeg = clamp(targetBank * 0.4, 15, 35);
    return physicalBankCommand(ctx, bankCmdDeg, pullG, 1);
  }

  if (c.phase === 'apex') {
    if (c.t - (c.apexT || c.t) >= 1.5 || climbDeg <= 10.0) {
      c.phase = 'dive';
    }
    const apexG = Math.min(2.5, ctx.shaker);
    const bankCmdDeg = clamp(targetBank, 45, 110);
    return physicalBankCommand(ctx, bankCmdDeg, apexG, 1);
  }

  // Phase 'dive'
  if (climbDeg <= 0 && ata <= 30.0) {
    c.next = 'mpt';
  }

  const bankCmdDeg = clamp(targetBank, 20, 75);
  return physicalBankCommand(ctx, bankCmdDeg, 1.5, 1);
}
