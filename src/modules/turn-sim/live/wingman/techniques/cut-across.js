// Fighting wing T5 technique: cut-across (B06, Spec 7e §7.9.5; TS-233, TS-234; Fable D6, 3b §7).
// Where it fits: polled and stepped by B04 (supervisor.js stepFwPicker) via techniques/index.js when stretched in turn.
// Exports: FW_CUT_ACROSS_TECHNIQUE ({ id, priority, maxRunSec, assess, plan, step }).
// Does not: write stick, throttle, speed-brake, or loop commands directly — outputs only S24 (cue/done/abort) and S26 (reference).
import { STEP_SEC } from '../../flight.js';
import { FW_WING } from '../../wing-moves.js';
import { makeFwReference } from '../fw-reference.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x) => clamp(x ?? 0, 0, 1);

/** T5: Cut-across — priority 5 in B06. */
export const FW_CUT_ACROSS_TECHNIQUE = Object.freeze({
  id: 'cut-across',
  priority: 5,
  maxRunSec: FW_WING.cutAcross.maxRunSec,

  /** S24 cue assessment with slant, closure and dwell. */
  assess(ctx, mem = {}) {
    const C = FW_WING.cutAcross;
    const inTurn = Boolean(ctx.phase?.turning || ctx.phase?.phase === 'turning');
    const inWindow = inTurn && ctx.seen.slant > C.cueSlantFt && ctx.seen.closure <= C.cueClosureFtps;
    const dwellSec = inWindow ? (mem.dwellSec ?? 0) + STEP_SEC : 0;
    const cue = dwellSec >= C.cueDwellSec ? clamp01((ctx.seen.slant - C.cueSlantFt) / 200 + 0.5) : 0;
    return { cue, dwellSec };
  },

  /** Plans chord cut-across with opened inward approach angle and dive (S26). */
  plan(ctx) {
    const C = FW_WING.cutAcross;
    const normalHeight = ctx.normalRef?.heightTargetFt ?? FW_WING.stackFt;
    const heightTargetFt = Math.min(normalHeight, C.diveFt);
    return {
      chiMaxInDeg: C.chiMaxInDeg,
      dFt: Math.abs(C.leadOffsetFt),
      heightTargetFt,
      energyIntent: C.energyIntent,
      urgency: C.urgency,
      doneHoldSec: 0,
    };
  },

  /** Steps active cut-across plan and outputs { done, abort, state, ref }. */
  step(ctx, state) {
    const C = FW_WING.cutAcross;
    const turnDir = ctx.phase?.dir || Math.sign(ctx.seen.leadBankDeg) || ctx.seen.levelSide || -1;
    const dContFt = ctx.arc?.dContFt ?? 0;
    const needInsideShare = clamp01((state.dFt - dContFt) / 200);
    const extraInDeg = Math.max(0, C.chiMaxInDeg - FW_WING.chiMaxOutDeg) * 0.5;
    const inwardBiasDeg = turnDir * extraInDeg * needInsideShare * clamp01((ctx.seen.slant - C.targetArcFt) / 300);

    const normalRef = ctx.normalRef;
    const chiWantedDeg = normalRef.chiWantedDeg + inwardBiasDeg;

    const hErr = state.heightTargetFt - ctx.seen.heightFt;
    const rateMag = Math.min(25, Math.sqrt(2 * 32.174 * 0.35 * Math.abs(hErr)) * 0.65);
    const heightRateTargetFtps = Math.abs(hErr) > 5 ? Math.sign(hErr) * rateMag : 0;

    const abort = !ctx.phase?.turning || ctx.seen.sweepDeg < 15;
    const done = ctx.seen.slant < C.doneSlantFt || (ctx.seen.slant < C.cueSlantFt && ctx.seen.closure >= C.doneClosureFtps);

    const ref = makeFwReference({
      ...normalRef,
      pathKind: 'circle',
      chiMaxInDeg: C.chiMaxInDeg,
      dFt: state.dFt,
      chiWantedDeg,
      heightTargetFt: state.heightTargetFt,
      heightRateTargetFtps,
      speedOffsetKt: FW_WING.powerBandKias,
      energyIntent: C.energyIntent,
      urgency: C.urgency,
      capChangeG: 0,
      aimKind: 'cutAcross',
      pitchOwner: 'cutAcross',
    });

    return {
      done,
      abort,
      state: { ...state },
      ref,
    };
  },
});
