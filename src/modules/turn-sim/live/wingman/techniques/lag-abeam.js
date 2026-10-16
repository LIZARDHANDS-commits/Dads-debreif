// Fighting wing T3 technique: lag pursuit from abeam (B06, Spec 7e §7.9.3; TS-233, TS-234; Fable D6, D18; R12, R14).
// Where it fits: polled and stepped by B04 (supervisor.js stepFwPicker) via techniques/index.js when Lead turns into #2 near abeam (0-20° sweep).
// Exports: FW_LAG_ABEAM_TECHNIQUE ({ id, priority, maxRunSec, assess, plan, step }).
// Does not: write stick, throttle, speed-brake, or loop commands directly — outputs only S24 (cue/done/abort) and S26 (reference).
import { DEG } from '../../../../../core/angles.js';
import { G_FTPS2 } from '../../../../../core/units.js';
import { STEP_SEC } from '../../flight.js';
import { FW_WING } from '../../wing-moves.js';
import { makeFwReference } from '../fw-reference.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x) => clamp(x ?? 0, 0, 1);
const wrapDeg = (d) => ((d + 540) % 360) - 180;

/** T3: Lag pursuit from abeam — priority 3 in B06 (Spec 7e §7.9.3, SMM 12.29 Fig 12.20, SMM 16.20 para 65b(2)). */
export const FW_LAG_ABEAM_TECHNIQUE = Object.freeze({
  id: 'lag-abeam',
  priority: 3,
  maxRunSec: FW_WING.lagAbeam.maxRunSec,

  /**
   * S24 cue assessment: Lead turning or rolling into #2 while #2 is near abeam behind the 3/9 line (0° <= sweep < 20°)
   * within the 500-1,000 ft cone range (with margin).
   */
  assess(ctx, mem = {}) {
    const L = FW_WING.lagAbeam;
    const { seen, phase } = ctx;
    const nearAbeam =
      seen.sweepDeg >= L.minSweepDeg &&
      seen.sweepDeg < L.maxSweepDeg &&
      seen.slant >= L.minSlantFt &&
      seen.slant <= L.maxSlantFt;
    const side = seen.levelSide || -1;
    const intoPhase = Boolean(phase?.turning && phase?.into);
    const intoBank = (seen.leadBankDeg ?? 0) * side >= L.bankCueDeg;
    const intoRoll = (seen.leadRollDps ?? 0) * side >= L.rollCueDps && (seen.leadBankDeg ?? 0) * side >= 0;
    const inWindow = nearAbeam && (intoPhase || intoBank || intoRoll);
    const dwell = inWindow ? (mem.dwell ?? 0) + 1 : 0;
    const cue = dwell >= L.dwellSteps ? clamp01((L.maxSweepDeg - seen.sweepDeg) / L.maxSweepDeg + 0.35) : 0;
    return { cue, dwell };
  },

  /**
   * Plans lag pursuit toward a point tailAimFt (650 ft) behind Lead on his predicted track, sizing pass depth below Lead
   * from D = 625 ft clearance, followed by reversal onto Lead's circle upon crossing behind his track (Fable D18).
   */
  plan(ctx) {
    const L = FW_WING.lagAbeam;
    const { seen, guard, phase } = ctx;
    const turnDir = phase?.dir || Math.sign(seen.leadBankDeg) || Math.sign(seen.leadRollDps) || seen.levelSide || -1;
    const pHorizEst = Math.min(guard?.predFt ?? seen.slant, seen.slant * Math.sin(Math.max(seen.sweepDeg, 5) * DEG));
    const rawDepth = Math.sqrt(Math.max(0, L.clearSlantFt * L.clearSlantFt - pHorizEst * pHorizEst));
    const depthFt = clamp(rawDepth, L.minDepthFt, L.maxDepthFt);
    const vertSign = seen.heightFt > FW_WING.yoyo.highFt ? 1 : -1;
    const heightTargetFt = vertSign * depthFt;
    return {
      stage: 'lag',
      turnDir,
      tailAimFt: L.tailAimFt,
      depthFt,
      vertSign,
      heightTargetFt,
      urgency: L.urgency,
      energyIntent: L.energyIntent,
      doneHoldSec: 0,
    };
  },

  /**
   * Steps the active lag-abeam plan:
   *  - Stage 'lag': steers outward lag course (-turnDir * lagOutDeg, 0°/s turn feed-forward so #2 never banks with Lead
   *    into him) while descending along the D = 625 ft pass profile.
   *  - Reversal cue (Fable D18): switches to 'reverse' on crossing behind Lead's track onto the circle (primary geometric
   *    cue: dContFt <= crossOffsetFt and sweepDeg >= reversalSweepDeg) or backup LOS-rate cue (S15 losDps >= 2 * losRippleDps
   *    with sweepDeg >= reversalSweepDeg and dContFt <= 180 ft).
   *  - Stage 'reverse': captures Lead's circle from behind and returns height toward stack, completing once within
   *    doneCircleFt (100 ft) and doneChiErrDeg (5°) behind the 3/9 line.
   */
  step(ctx, state) {
    const L = FW_WING.lagAbeam;
    const { seen, phase, arc, normalRef } = ctx;
    const turnDir = phase?.dir || Math.sign(seen.leadBankDeg) || state.turnDir || -1;
    const dContFt = arc?.dContFt ?? seen.levelLeftFt * turnDir;
    const sContFt = arc?.sContFt ?? -seen.rel.fwd;
    const behindEnough = seen.sweepDeg >= L.reversalSweepDeg && sContFt >= 250;

    // Primary geometric track-crossing cue + S15 LOS-rate backup cue (Fable D18, R12)
    const geomCrossed = behindEnough && dContFt <= L.crossOffsetFt;
    const losBackupCue = behindEnough && seen.losDps >= 2 * L.losRippleDps && dContFt <= 250;
    const stage = state.stage === 'lag' && (geomCrossed || losBackupCue) ? 'reverse' : state.stage;

    const heightTargetFt = stage === 'lag' ? state.heightTargetFt : FW_WING.stackFt;
    const hErr = heightTargetFt - seen.heightFt;
    const avFtps2 = (0.5 + 0.5 * L.urgency) * G_FTPS2;
    const rateMag = Math.min(L.maxRateFtps, Math.sqrt(2 * avFtps2 * Math.abs(hErr)) * 0.65);
    const heightRateTargetFtps = Math.abs(hErr) > 5 ? Math.sign(hErr) * rateMag : 0;

    // During 'lag', steer gentle outward lag toward the point 650 ft behind Lead on his track; during 'reverse', capture circle
    const aimAngleDeg = Math.atan2(Math.max(0, dContFt), Math.max(250, L.tailAimFt - Math.max(0, sContFt))) / DEG;
    const chiLagDeg = -turnDir * clamp(aimAngleDeg * 0.35, 8, L.lagOutDeg);
    const chiWantedDeg = stage === 'lag' ? chiLagDeg : normalRef.chiWantedDeg;
    const omegaFfRadps = stage === 'lag' ? -turnDir * L.lagTurnRadps * clamp01(dContFt / 350) : normalRef.omegaFfRadps;

    const circleErrFt = Math.abs(dContFt - (normalRef.dFt ?? 0));
    const chiErrDeg = Math.abs(wrapDeg(normalRef.chiWantedDeg - (ctx.chiOwnDeg ?? normalRef.chiWantedDeg)));
    const captured =
      stage === 'reverse' &&
      seen.sweepDeg >= L.doneSweepDeg &&
      circleErrFt <= L.doneCircleFt &&
      chiErrDeg <= L.doneChiErrDeg;
    const doneHoldSec = captured ? state.doneHoldSec + STEP_SEC : 0;
    const rolloutDone = stage === 'reverse' && (phase?.phase === 'exit' || phase?.phase === 'level') && seen.sweepDeg >= L.doneSweepDeg;
    const done = doneHoldSec >= L.doneDwellSec || rolloutDone;

    const ref = makeFwReference({
      ...normalRef,
      pathKind: stage === 'lag' ? 'aim' : 'circle',
      chiWantedDeg,
      omegaFfRadps,
      heightTargetFt,
      heightRateTargetFtps,
      speedOffsetKt: normalRef.speedOffsetKt,
      energyIntent: L.energyIntent,
      urgency: L.urgency,
      capChangeG: 0,
      aimKind: 'lagAbeam',
      pitchOwner: stage === 'lag' ? 'lagAbeam' : normalRef.pitchOwner,
    });

    return {
      done,
      abort: false,
      state: { ...state, stage, turnDir, doneHoldSec },
      ref,
    };
  },
});
