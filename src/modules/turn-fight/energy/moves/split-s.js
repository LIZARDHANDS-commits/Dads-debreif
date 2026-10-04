// The split S, core's law (splitST6A; SMM 14.16 para 41).
import { wrapPi, degToRad, radToDeg } from '../../../../core/angles.js';
import { T6A_MANOEUVRE, shakerG as coreShakerG } from '../../../../core/t6-performance.js';
import { TUNING } from '../setup.js';
import { rollSideSign } from '../frame.js';
import { levelOffG } from './common.js';

/**
 * The split S, flown as core's splitST6A flies it (the pin test holds them to
 * the same height loss): nose up to about 20° in the shaker (skipped below the
 * shaker speed, where the nose cannot come up without stalling), roll inverted
 * at about 0.5 G (SMM 14.16 para 41), then pull through in the shaker until
 * level, up to 5 G (Patrick's word; the SMM's Table 14.1 says about 4 G). The
 * shaker here is core's (7 kt over the stall, at most 5 G), for the split S only.
 */
export function controlSplitS(ctx) {
  const { ac, f, p } = ctx;
  const c = ac.ctl;
  const climb = f.climbRad;
  const invertedBank = wrapPi(c.holdBankRad + Math.PI);
  // (core's shakerG reads its maxG default as the literal type 7, so the 5 G cap needs the cast for the type check.)
  const pull = coreShakerG(ctx.kias, { stallKias: p.stallKias, maxG: /** @type {any} */ (T6A_MANOEUVRE.splitSMaxG) });
  if (c.phase === 'pitchUp') {
    if (climb < degToRad(T6A_MANOEUVRE.splitSNoseUpDeg) && pull > 1) return { g: pull, bankRad: c.holdBankRad, prefer: c.prefer, throttle: 1 };
    c.phase = 'roll'; c.prefer = rollSideSign(ac);
  }
  if (c.phase === 'roll') {
    if (Math.abs(wrapPi(invertedBank - ac.bankRad)) > 1e-6) return { g: T6A_MANOEUVRE.splitSRollG, bankRad: invertedBank, prefer: c.prefer, throttle: 1 };
    c.phase = 'pull';
  }
  if (c.phase === 'pull') {
    if (climb < 0) c.down = true;
    if (!(c.down && climb >= 0)) return { g: pull, bankRad: invertedBank, prefer: c.prefer, throttle: 1 };
    c.phase = 'level';
  }
  if (Math.abs(radToDeg(climb)) < TUNING.levelDoneDeg) c.next = 'mpt';
  return { g: levelOffG(ctx, 0), bankRad: invertedBank, prefer: c.prefer, throttle: 1 };
}
