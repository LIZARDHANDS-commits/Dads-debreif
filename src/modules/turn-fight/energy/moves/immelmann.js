// The Immelmann (SMM 14.15), and its recovery when it stalls before the top.
import { wrapPi, degToRad, radToDeg } from '../../../../core/angles.js';
import { TUNING } from '../setup.js';
import { rollSideSign, passedVertical } from '../frame.js';
import { pullCmdG, levelOffG, physicalBankCommand } from './common.js';

export function controlImmelmann(ctx) {
  const { ac, f } = ctx;
  const c = ac.ctl;
  const climb = radToDeg(f.climbRad);
  if (c.phase === 'main') {
    // A stall on the way up ends it: unload and fly out (below).
    if (ac.stall) { c.phase = 'recover'; return controlImmelmannRecover(ctx, climb); }
    // Over the top and coming down the back toward level, inverted: roll upright.
    if (passedVertical(ac) && climb <= TUNING.immelmannRollStartDeg) { c.phase = 'roll'; c.prefer = rollSideSign(ac); }
    // Wings level, up and over at the set G (the shaker once it is the lower).
    return { g: pullCmdG(ctx), bankRad: c.holdBankRad, prefer: c.prefer, throttle: 1 };
  }
  if (c.phase === 'recover') return controlImmelmannRecover(ctx, climb);
  const upright = wrapPi(c.holdBankRad + Math.PI);
  if (c.phase === 'roll') {
    if (Math.abs(wrapPi(upright - ac.bankRad)) < degToRad(3)) c.phase = 'level';
    return { g: Math.min(1, ctx.shaker), bankRad: upright, prefer: c.prefer, throttle: 1 };
  }
  // Level: pull or ease to level flight, upright.
  if (Math.abs(climb) < TUNING.levelDoneDeg) c.next = 'mpt';
  return { g: levelOffG(ctx, 0), bankRad: upright, prefer: c.prefer, throttle: 1 };
}


/**
 * A failed Immelmann (it stalled before the top): wings level by the real
 * horizon, nose to the horizon once the wing is flying again, and it ends
 * upright and level, to be picked from again.
 */
function controlImmelmannRecover(ctx, climbDeg) {
  const { ac } = ctx;
  const c = ac.ctl;
  const cmd = physicalBankCommand(ctx, 0, levelOffG(ctx, 0), 1);
  if (!ac.stall && Math.abs(climbDeg) < TUNING.levelDoneDeg && Math.abs(ac.bankDeg) < 30) c.next = 'mpt';
  return cmd;
}
