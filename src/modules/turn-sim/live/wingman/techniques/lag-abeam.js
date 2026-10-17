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
      seen.sweepDeg <= 35 &&
      seen.slant >= L.minSlantFt &&
      seen.slant <= L.maxSlantFt;
    const side = seen.levelSide || -1;
    const intoEntry = Boolean(phase?.phase === 'entry' && phase?.into);
    const intoRollStart = !phase?.turning && (seen.leadRollDps ?? 0) * side >= L.rollCueDps && (seen.leadBankDeg ?? 0) * side >= 0;
    const inWindow = nearAbeam && (intoEntry || intoRollStart);
    const dwell = inWindow ? (mem.dwell ?? 0) + 1 : 0;
    const cue = dwell >= L.dwellSteps ? clamp01((35 - seen.sweepDeg) / 35 + 0.35) : 0;
    return { cue, dwell };
  },

  /**
   * Plans lag pursuit toward a point tailAimFt (650 ft) behind Lead on his predicted track, sizing pass depth below/above Lead
   * from D = 625 ft clearance, followed by reversal onto Lead's circle upon crossing behind his track (Fable D18).
   */
  plan(ctx) {
    const L = FW_WING.lagAbeam;
    const { seen, guard, phase } = ctx;
    const turnDir = phase?.dir || Math.sign(seen.leadBankDeg) || Math.sign(seen.leadRollDps) || seen.levelSide || -1;
    const pHorizEst = Math.min(guard?.predFt ?? seen.slant, seen.slant * Math.sin(Math.max(seen.sweepDeg, 5) * DEG));
    const rawDepth = Math.sqrt(Math.max(0, L.clearSlantFt * L.clearSlantFt - pHorizEst * pHorizEst));
    const depthFt = clamp(rawDepth, L.minDepthFt, L.maxDepthFt);
    const vertSign = seen.heightFt > 0 ? 1 : -1;
    const heightTargetFt = vertSign > 0 ? Math.max(depthFt, seen.heightFt + 40) : -Math.max(depthFt, Math.abs(seen.heightFt) + 30);
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
   *  - Stage 'lag': when High (vertSign > 0), pulls up and over with gentle outward lag course (-turnDir * lagOutDeg) then
   *    reverses quickly onto Lead's circle; when Mid/Low (vertSign < 0), unloads and rolls under Lead in Lead's turn direction
   *    with relaxed turn rate until Lead's circle reaches him.
   *  - Stage 'reverse': captures Lead's circle from behind and returns height toward stack.
   */
  step(ctx, state) {
    const L = FW_WING.lagAbeam;
    const { seen, phase, arc, normalRef } = ctx;
    const turnDir = phase?.dir || Math.sign(seen.leadBankDeg) || state.turnDir || -1;
    const dContFt = arc?.dContFt ?? seen.levelLeftFt * turnDir;
    const sContFt = arc?.sContFt ?? -seen.rel.fwd;
    const behindEnough = seen.sweepDeg >= L.reversalSweepDeg && sContFt >= 220;

    // Primary geometric track-crossing cue + S15 LOS-rate backup cue (Fable D18, R12)
    const geomCrossed = behindEnough && dContFt <= L.crossOffsetFt;
    const losBackupCue = behindEnough && seen.losDps >= 2 * L.losRippleDps && dContFt <= 250;
    const stage = state.stage === 'lag' && (geomCrossed || losBackupCue) ? 'reverse' : state.stage;

    const heightTargetFt = stage === 'lag' ? state.heightTargetFt : FW_WING.stackFt;
    const hErr = heightTargetFt - seen.heightFt;
    const avFtps2 = (0.5 + 0.5 * L.urgency) * G_FTPS2;
    const maxVRate = hErr < 0 ? 25 : L.maxRateFtps;
    const rateMag = Math.min(maxVRate, Math.sqrt(2 * avFtps2 * Math.abs(hErr)) * 0.55);
    const heightRateTargetFtps = Math.abs(hErr) > 5 ? Math.sign(hErr) * rateMag : 0;

    // During 'lag': High (vertSign > 0) pulls up-and-over with gentle outward lag then reverses;
    // Mid/Low (vertSign < 0) unloads and flies straight/shallow under Lead until reaching Lead's circle.
    const aimAngleDeg = Math.atan2(Math.max(0, dContFt), Math.max(250, L.tailAimFt - Math.max(0, sContFt))) / DEG;
    const chiLagDeg = state.vertSign > 0
      ? -turnDir * clamp(aimAngleDeg * 0.35, 8, L.lagOutDeg)
      : (ctx.chiOwnDeg ?? normalRef.chiWantedDeg);
    const chiWantedDeg = stage === 'lag' ? chiLagDeg : normalRef.chiWantedDeg;
    const omegaFfRadps = stage === 'lag'
      ? (state.vertSign > 0 ? -turnDir * L.lagTurnRadps * clamp01(dContFt / 350) : normalRef.omegaFfRadps * 0.25)
      : normalRef.omegaFfRadps;

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
