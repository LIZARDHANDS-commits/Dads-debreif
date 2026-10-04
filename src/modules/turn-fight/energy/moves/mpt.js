// The max-performance turn (SMM 14.14): constant speed above the hard deck, level at it. The Tactical pilot's
// re-pick while in the MPT is the pilot's (pilot.js, reconsiderInMpt), not this move's.
import { KT_TO_FTPS, G_FTPS2 } from '../../../../core/units.js';
import { degToRad, radToDeg } from '../../../../core/angles.js';
import { T6A_LIMITS, iasToTasKt, t6aExcessFn } from '../../../../core/t6-performance.js';
import { dampedClimbG } from '../../../../core/flight-math.js';
import { MPT_WITHIN_KT, MPT_BANK_MIN_DEG, MPT_BANK_MAX_DEG, TUNING, MOVE_LABELS, round, feet } from '../setup.js';
import { clamp } from '../frame.js';
import { pullCmdG, physicalBankCommand, willRoll, deckDropFt } from './common.js';

/**
 * The bank that steers the speed to the MPT speed: how fast the speed should
 * close on it sets the flight path angle that thrust minus drag allows, and the
 * bank is what gives the lift to fly that path at the G being pulled. Speed
 * high: nose higher and less bank. Speed low: nose lower and more bank
 * (EFIG p.430, SMM 14.4 para 8). Steady at 160 it is the 70 to 75° of the SMM.
 */
function speedHoldBankDeg(ctx, g, minDeg, maxDeg) {
  const { f, p } = ctx;
  const vFtps = f.ktas * KT_TO_FTPS;
  const mptFtps = iasToTasKt(p.mptKias, f.altFt) * KT_TO_FTPS;
  // A little ahead of the speed: the error plus where the present rate of change takes it (TAS rate from the KIAS rate).
  const rateFtps2 = ctx.ac.ctl.kiasRateEff * (f.ktas / Math.max(ctx.kias, 1)) * KT_TO_FTPS;
  const accelWanted = -((vFtps - mptFtps) + TUNING.speedLeadSec * rateFtps2) / TUNING.speedTauSec;
  const sinClimb = clamp(t6aExcessFn(f.ktas, f.altFt, g) - accelWanted / G_FTPS2, -0.95, 0.95);
  const liftNeeded = dampedClimbG(f.climbRad, Math.asin(sinClimb), vFtps, TUNING.levelOmegaPerSec);
  const cosBank = clamp(liftNeeded / Math.max(g, 1e-6), Math.cos(degToRad(maxDeg)), Math.cos(degToRad(minDeg)));
  return radToDeg(Math.acos(cosBank));
}

/** The MPT: constant-speed above the hard deck, level at it. */
export function controlMpt(ctx) {
  const { ac, p, f, kias } = ctx;
  const c = ac.ctl;
  const vFtps = f.ktas * KT_TO_FTPS;
  const climb = f.climbRad;

  // A move handed to the MPT keeps its name until the speed is within 5 kt of the MPT speed, then reads MPT.
  if (ac.move !== 'mpt' && ac.move !== 'levelMpt' && Math.abs(kias - p.mptKias) <= MPT_WITHIN_KT) {
    ac.move = 'mpt'; ac.moveLabel = MOVE_LABELS.mpt; ac.why = `MPT ${round(p.mptKias)} KIAS`;
  }
  if (!c.level) {
    const verticalSpeed = vFtps * Math.sin(climb);
    const levelFt = p.hardDeckFt + TUNING.levelMptAboveDeckFt; // a little above the deck: below it loses the fight (TF-R6)
    // The level-off starts in time: a few seconds ahead, or sooner when the pull-out from a steep dive needs more height.
    if (f.altFt + verticalSpeed * TUNING.levelLeadSec <= levelFt || (climb < 0 && f.altFt - deckDropFt(ctx, Math.max(ctx.shaker - 1, 0.5)) <= levelFt)) {
      c.level = true;
      c.levelAltFt = levelFt;
      ac.move = 'levelMpt'; ac.moveLabel = MOVE_LABELS.levelMpt;
      ac.why = `Level MPT at the ${feet(p.hardDeckFt)} ft deck`;
    }
  }
  // The pull: the set G (4) while above the shaker speed (the PCL at mid-range), then the shaker.
  const onShaker = p.pullG >= ctx.shaker;
  if (c.halfUntilShaker && onShaker) c.halfUntilShaker = false;
  const named = ac.move === 'mpt' || ac.move === 'levelMpt';
  let g = c.halfUntilShaker || !named ? pullCmdG(ctx) : ctx.shaker; // until the MPT is named (within 5 kt) a handed-over pitch back still holds its 4 G
  const throttle = c.halfUntilShaker ? p.midThrottle : 1;
  if (!c.level) {
    // Handed over from a pitch back or slice: free to use any bank until the speed is found, then 60 to 85°.
    if (c.capture && Math.abs(kias - p.mptKias) <= TUNING.settledKt && Math.abs(c.kiasRateEff) <= TUNING.settledKtPerSec) c.capture = false;
    const [minDeg, maxDeg] = c.capture ? [0, TUNING.captureBankMaxDeg] : [MPT_BANK_MIN_DEG, MPT_BANK_MAX_DEG];
    const cmd = physicalBankCommand(ctx, speedHoldBankDeg(ctx, g, minDeg, maxDeg), g, throttle);
    // Rolling to a new bank (the one definition) the pilot holds about the set G, not the shaker, capped by rolling limit.
    const rolling = willRoll(ctx, cmd.bankRad, cmd.prefer);
    if (rolling) cmd.g = Math.min(cmd.g, pullCmdG(ctx), T6A_LIMITS.rollingMaxG);
    if (rolling && !c.capture && c.t < TUNING.rollInSec) {
      // Rolling in from wings level: pull only as the bank builds, so the nose does not climb away.
      cmd.g = Math.min(cmd.g, Math.cos(climb) / Math.max(Math.cos(degToRad(Math.abs(ac.bankDeg))), 0.3));
    }
    return cmd;
  }
  // Level: bank holds the height, the nose stays on the horizon.
  const levelErr = c.levelAltFt - f.altFt;
  const climbTarget = Math.asin(clamp(levelErr * TUNING.levelAltGainPerSec / vFtps, -0.5, 0.5));
  const needN = dampedClimbG(climb, climbTarget, vFtps, TUNING.levelOmegaPerSec);
  const levelCmd = (pull) => physicalBankCommand(ctx, radToDeg(Math.acos(clamp(needN / Math.max(pull, 1e-6), Math.cos(degToRad(TUNING.levelBankMaxDeg)), 1))), pull, throttle);
  // Rolling to a new bank (the one definition) the pilot holds about the set G, not the shaker: the bank is worked out again for it.
  const cmd = levelCmd(g);
  const rollG = Math.min(pullCmdG(ctx), T6A_LIMITS.rollingMaxG);
  if (g > rollG && willRoll(ctx, cmd.bankRad, cmd.prefer)) return levelCmd(rollG);
  return cmd;
}
