// Fighting wing T2 technique: back behind 3/9 line (B06, Spec 7e §7.9.2; TS-233, TS-234; Fable D6, 3b §7).
// Where it fits: polled and stepped by B04 (supervisor.js stepFwPicker) via techniques/index.js when ahead of Lead's 3/9 line.
// Exports: FW_BEHIND39_TECHNIQUE ({ id, priority, maxRunSec, assess, plan, step }).
// Does not: write stick, throttle, speed-brake, or loop commands directly — outputs only S24 (cue/done/abort) and S26 (reference).
import { STEP_SEC } from '../../flight.js';
import { FW_WING } from '../../wing-moves.js';
import { makeFwReference } from '../fw-reference.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x) => clamp(x ?? 0, 0, 1);

/** T2: Back behind 3/9 line — priority 2 in B06. */
export const FW_BEHIND39_TECHNIQUE = Object.freeze({
  id: 'behind-39',
  priority: 2,
  maxRunSec: FW_WING.behind39.maxRunSec,

  /** S24 cue assessment with dwell counter. */
  assess(ctx, mem = {}) {
    const B = FW_WING.behind39;
    const aheadNow = ctx.seen.sweepDeg < B.sweepCueDeg;
    const s = ctx.arc?.arcFt ?? ctx.seen.slant;
    const crossAheadPred = ctx.seen.sweepDeg < 12 && ctx.seen.closure > 20 && (s - ctx.seen.closure * B.lookSec < 50);
    const inWindow = aheadNow || crossAheadPred;
    const dwell = inWindow ? (mem.dwell ?? 0) + 1 : 0;
    const cue = dwell >= B.dwellSteps
      ? clamp01(aheadNow ? (B.sweepCueDeg - ctx.seen.sweepDeg) / 15 + 0.5 : (12 - ctx.seen.sweepDeg) / 12 + 0.5)
      : 0;
    return { cue, dwell };
  },

  /** Sizes pass depth below Lead (S26). */
  plan(ctx) {
    const B = FW_WING.behind39;
    const p = Math.max(0, ctx.guard?.predFt ?? ctx.seen.slant);
    const depthFt = clamp(Math.sqrt(Math.max(0, B.clearSlantFt ** 2 - p ** 2)), B.minDepthFt, B.maxDepthFt);
    const vertSign = ctx.seen.heightFt > FW_WING.yoyo.highFt ? 1 : -1;
    const heightTargetFt = vertSign * depthFt;
    const turnDir = ctx.phase?.dir || Math.sign(ctx.seen.leadBankDeg) || ctx.seen.levelSide || -1;
    return {
      plannedPassFt: p,
      depthFt,
      vertSign,
      heightTargetFt,
      turnDir,
      urgency: B.urgency,
      energyIntent: B.energyIntent,
      doneHoldSec: 0,
    };
  },

  /** Steps active behind-39 plan and outputs { done, abort, state, ref }. */
  step(ctx, state) {
    const B = FW_WING.behind39;
    const normalRef = ctx.normalRef;
    const turnDir = ctx.phase?.dir || Math.sign(ctx.seen.leadBankDeg) || ctx.seen.levelSide || state.turnDir || -1;
    const chiWantedDeg = normalRef.chiWantedDeg - turnDir * B.inCourseDeg;

    const hErr = state.heightTargetFt - ctx.seen.heightFt;
    const rateMag = Math.min(B.maxRateFtps, Math.sqrt(2 * 32.174 * 0.75 * Math.abs(hErr)) * 0.65);
    const heightRateTargetFtps = Math.abs(hErr) > 5 ? Math.sign(hErr) * rateMag : 0;

    const isClear = ctx.seen.sweepDeg >= B.doneSweepDeg && ctx.seen.slant >= 500;
    const doneHoldSec = isClear ? state.doneHoldSec + STEP_SEC : 0;
    const done = doneHoldSec >= B.doneDwellSec;

    const ref = makeFwReference({
      ...normalRef,
      pathKind: 'circle',
      chiWantedDeg,
      heightTargetFt: state.heightTargetFt,
      heightRateTargetFtps,
      speedOffsetKt: state.energyIntent < 0 ? -5 : normalRef.speedOffsetKt,
      energyIntent: state.energyIntent,
      urgency: state.urgency,
      capChangeG: 0,
      aimKind: 'behind39',
      pitchOwner: 'behind39',
    });

    return {
      done,
      abort: false,
      state: { ...state, doneHoldSec, turnDir },
      ref,
    };
  },
});
