// Fighting wing T7 technique: s-turns (B06, Spec 7e §7.9.7; TS-233, TS-234; Fable D6, 3b §7).
// Where it fits: polled and stepped by B04 (supervisor.js stepFwPicker) via techniques/index.js in level or exit phase.
// Exports: FW_STURN_TECHNIQUE ({ id, priority, maxRunSec, assess, plan, step }).
// Does not: write stick, throttle, speed-brake, or loop commands directly — outputs only S24 (cue/done/abort) and S26 (reference).
import { DEG } from '../../../../../core/angles.js';
import { STEP_SEC } from '../../flight.js';
import { FW_WING } from '../../wing-moves.js';
import { makeFwReference } from '../fw-reference.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x) => clamp(x ?? 0, 0, 1);

/** T7: S-turns — priority 7 in B06. */
export const FW_STURN_TECHNIQUE = Object.freeze({
  id: 's-turns',
  priority: 7,
  maxRunSec: FW_WING.sTurn.maxRunSec,

  /** S24 cue assessment with slant, closure, and dwell. */
  assess(ctx, mem = {}) {
    const S = FW_WING.sTurn;
    const minSlantFt = ctx.phase?.phase === 'level' ? (FW_WING.movingOut?.cueSlantFt ?? 450) : 0;
    const levelFlight = Math.abs(ctx.seen.lead?.v?.z ?? 0) < 8;
    const inCone = ctx.seen.sweepDeg <= 65 && ctx.seen.closure > 0;
    const inPhase = levelFlight && (ctx.phase?.phase === 'level' || ctx.phase?.phase === 'exit') && ctx.seen.slant >= minSlantFt && inCone;
    const tooTightOrClosing = (ctx.seen.slant < 510 && ctx.seen.closure > 5) ||
      (ctx.seen.closure > S.cueClosureFtps && ctx.seen.slant < FW_WING.arcTargetFt);
    const inWindow = inPhase && tooTightOrClosing;
    const dwell = inWindow ? (mem.dwell ?? 0) + 1 : 0;
    const cue = dwell >= S.cueDwellSteps ? clamp01((FW_WING.arcTargetFt - ctx.seen.slant) / 100 + 0.25) : 0;
    return { cue, dwell };
  },

  /** Sizes heading swing psiDeg (S26). */
  plan(ctx) {
    const S = FW_WING.sTurn;
    const ds = Math.max(50, FW_WING.arcTargetFt - ctx.seen.slant + Math.max(0, ctx.seen.closure) * 4);
    const cosPsi = clamp(1 - ds / Math.max(ctx.V * S.rangeSec, 1000), 0.7, 0.99);
    const swingDeg = clamp(Math.acos(cosPsi) / DEG, S.minSwingDeg, S.maxSwingDeg);
    const legSide = -(ctx.phase?.side || ctx.seen.levelSide || -1);
    return {
      swingDeg,
      legSide,
      legSec: 0,
      doneHoldSec: 0,
    };
  },

  /** Steps active s-turns plan and outputs { done, abort, state, ref }. */
  step(ctx, state) {
    const S = FW_WING.sTurn;
    let legSec = state.legSec + STEP_SEC;
    let legSide = state.legSide;
    const sweepAbs = Math.abs(ctx.seen.sweepDeg);
    const crossedEdge = sweepAbs < 32 || sweepAbs > 58;
    if (legSec >= S.legSec || (crossedEdge && legSec > 1.5)) {
      legSide = -legSide;
      legSec = 0;
    }

    const abort = Boolean(ctx.phase?.turning || ctx.phase?.phase === 'turning');
    const isClear = ctx.seen.slant >= S.doneSlantFt && ctx.seen.closure <= S.doneClosureFtps;
    const doneHoldSec = isClear ? state.doneHoldSec + STEP_SEC : 0;
    const done = doneHoldSec >= S.doneDwellSec;

    const normalRef = ctx.normalRef;
    const chiWantedDeg = normalRef.chiWantedDeg + legSide * state.swingDeg;

    const ref = makeFwReference({
      ...normalRef,
      pathKind: 'line',
      chiWantedDeg,
      heightTargetFt: normalRef.heightTargetFt,
      heightRateTargetFtps: normalRef.heightRateTargetFtps,
      speedOffsetKt: normalRef.speedOffsetKt,
      energyIntent: S.energyIntent,
      urgency: S.urgency,
      capChangeG: 0,
      aimKind: 'sTurn',
      pitchOwner: normalRef.pitchOwner,
    });

    return {
      done,
      abort,
      state: { ...state, legSide, legSec, doneHoldSec },
      ref,
    };
  },
});
