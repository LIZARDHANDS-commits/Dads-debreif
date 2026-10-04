// The pitch back and the slice: one controller for both (SMM 14.15, 14.18).
import { T6A_LIMITS } from '../../../../core/t6-performance.js';
import { MANEUVER_PULL_G, TUNING } from '../setup.js';
import { clamp } from '../frame.js';
import { pullCmdG, willRoll } from './common.js';

/** Bank move controller shared by the pitch back and the slice: hold the entry bank at the set G (the shaker once it is the lower), and hand to the MPT as the speed nears it. */
export function controlBankMove(ctx) {
  const { ac, p, kias, f } = ctx;
  const c = ac.ctl;
  // The MPT is near when the speed, a little ahead, reaches it from the side the move started on.
  const ramp = clamp((c.entryKias - TUNING.captureLeadFromKias) / (T6A_LIMITS.vmoKias - TUNING.captureLeadFromKias), 0, 1);
  const leadSec = TUNING.captureLeadSec + (TUNING.captureLeadFastSec - TUNING.captureLeadSec) * ramp;
  const ahead = kias + c.kiasRateEff * leadSec;
  const fromAbove = c.entryKias > p.mptKias;
  const there = fromAbove ? ahead <= p.mptKias : ahead >= p.mptKias;
  const turned = c.turnDeg >= TUNING.maxBankMoveTurnDeg;
  if ((there && !ac.rolling && c.t > 0.5) || turned) c.next = 'mpt';
  const rolling = ac.rolling || willRoll(ctx, c.holdBankRad, c.prefer);
  const g = rolling ? (pullCmdG(ctx) > MANEUVER_PULL_G ? pullCmdG(ctx) : Math.min(pullCmdG(ctx), T6A_LIMITS.rollingMaxG)) : pullCmdG(ctx);
  return { g, bankRad: c.holdBankRad, prefer: c.prefer, throttle: 1 };
}
