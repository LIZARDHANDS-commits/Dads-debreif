// Fighting wing T6 technique: exit vertical (B06, Spec 7e §7.9.6; TS-233, TS-234; Fable D1, D6, 3b §7).
// Where it fits: polled and stepped by B04 (supervisor.js stepFwPicker) via techniques/index.js in exit phase.
// Exports: FW_EXIT_VERTICAL_TECHNIQUE ({ id, priority, maxRunSec, assess, plan, step }).
// Does not: write stick, throttle, speed-brake, or loop commands directly — outputs only S24 (cue/done/abort) and S26 (reference).
import { STEP_SEC } from '../../flight.js';
import { FW_WING } from '../../wing-moves.js';
import { makeFwReference } from '../fw-reference.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x) => clamp(x ?? 0, 0, 1);

function buildExitVertPlan(ctx) {
  const E = FW_WING.exitVert;
  const s = ctx.arc?.arcFt ?? ctx.seen.slant;
  const ds = s - FW_WING.arcTargetFt;
  const dvNeeded = ds / E.rangeSec;
  const rawH = clamp(-dvNeeded * E.ftPerFtps, -E.maxHeightFt, E.maxHeightFt);
  const heightTargetFt = clamp(FW_WING.stackFt + rawH, -E.maxHeightFt, E.maxHeightFt);
  const energyIntent = ds > 0 ? E.diveIntent : E.climbIntent;
  const sign = Math.sign(ds || 1);
  return {
    ds,
    heightTargetFt,
    energyIntent,
    sign,
    doneHoldSec: 0,
  };
}

/** T6: Exit vertical — priority 6 in B06. */
export const FW_EXIT_VERTICAL_TECHNIQUE = Object.freeze({
  id: 'exit-vertical',
  priority: 6,
  maxRunSec: FW_WING.exitVert.maxRunSec,

  /** S24 cue assessment with spacing error, closure, and dwell. */
  assess(ctx, mem = {}) {
    const E = FW_WING.exitVert;
    const inExit = ctx.phase?.phase === 'exit';
    const s = ctx.arc?.arcFt ?? ctx.seen.slant;
    const spacingErr = Math.abs(s - FW_WING.arcTargetFt);
    const inWindow = inExit && (spacingErr > E.cueArcErrFt || Math.abs(ctx.seen.closure) > E.cueClosureFtps);
    const dwell = inWindow ? (mem.dwell ?? 0) + 1 : 0;
    const tight = s < 650;
    const exceedCone = ctx.seen.slant > 900 || Math.abs(ctx.seen.heightFt) > FW_WING.heightBandFt;
    const deferToSTurns = tight && exceedCone;
    const cue = (dwell >= E.cueDwellSteps && !deferToSTurns)
      ? clamp01(Math.max((spacingErr - E.cueArcErrFt) / 100, (Math.abs(ctx.seen.closure) - E.cueClosureFtps) / 15) + 0.25)
      : 0;
    return { cue, dwell };
  },

  /** Sizes vertical displacement from spacing error (S26). */
  plan(ctx) {
    return buildExitVertPlan(ctx);
  },

  /** Steps active exit-vertical plan and outputs { done, abort, state, ref }. */
  step(ctx, state) {
    const E = FW_WING.exitVert;
    const s = ctx.arc?.arcFt ?? ctx.seen.slant;
    const currentDs = s - FW_WING.arcTargetFt;
    const signChanged = Math.sign(currentDs) !== state.sign && Math.abs(currentDs) > 50;
    const activeState = signChanged ? buildExitVertPlan(ctx) : { ...state };

    const horiz = Math.sqrt(Math.max(0, ctx.seen.slant ** 2 - ctx.seen.heightFt ** 2));
    const maxH = Math.sqrt(Math.max(0, E.maxConeFt ** 2 - horiz ** 2));
    const hT = clamp(activeState.heightTargetFt, -Math.min(E.maxHeightFt, maxH), Math.min(E.maxHeightFt, maxH));
    activeState.heightTargetFt = hT;

    const hErr = activeState.heightTargetFt - ctx.seen.heightFt;
    const rateMag = Math.min(E.maxRateFtps, Math.sqrt(2 * 32.174 * 0.5 * Math.abs(hErr)) * 0.65);
    const heightRateTargetFtps = Math.abs(hErr) > 5 ? Math.sign(hErr) * rateMag : 0;

    const newTurn = Boolean(ctx.phase?.turning || ctx.phase?.phase === 'turning');
    const settled = Math.abs(currentDs) <= E.doneArcErrFt && Math.abs(ctx.seen.closure) <= E.doneClosureFtps;
    const doneHoldSec = settled ? activeState.doneHoldSec + STEP_SEC : 0;
    const done = (doneHoldSec >= E.doneDwellSec) || newTurn;

    const normalRef = ctx.normalRef;
    const ref = makeFwReference({
      ...normalRef,
      pathKind: 'line',
      heightTargetFt: activeState.heightTargetFt,
      heightRateTargetFtps,
      speedOffsetKt: activeState.energyIntent < 0 ? -5 : activeState.energyIntent > 0 ? 5 : normalRef.speedOffsetKt,
      energyIntent: activeState.energyIntent,
      urgency: E.urgency,
      capChangeG: 0,
      aimKind: 'exitVertical',
      pitchOwner: 'exitVertical',
    });

    return {
      done,
      abort: false,
      state: { ...activeState, doneHoldSec },
      ref,
    };
  },
});
