// Fighting wing T8 technique: moving out from close formation (B06, Spec 7e §7.9.8; TS-233, TS-234; Fable D6, §7.13).
// Where it fits: polled and stepped by B04 (supervisor.js stepFwPicker) via techniques/index.js in level flight from close formation.
// Exports: FW_MOVING_OUT_TECHNIQUE ({ id, priority, maxRunSec, assess, plan, step }).
// Does not: write stick, throttle, speed-brake, or loop commands directly — outputs only S24 (cue/done/abort) and S26 (reference).
import { KT_TO_FTPS } from '../../../../../core/units.js';
import { STEP_SEC } from '../../flight.js';
import { FW_WING } from '../../wing-moves.js';
import { makeFwReference } from '../fw-reference.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x) => clamp(x ?? 0, 0, 1);

/** T8: Moving out from close formation (SMM 12.27 para 57: straight back to 500 ft at 10 ft/s, then out to 45°) — priority 8 in B06. */
export const FW_MOVING_OUT_TECHNIQUE = Object.freeze({
  id: 'moving-out',
  priority: 8,
  maxRunSec: FW_WING.movingOut.maxRunSec,

  /** S24 cue assessment: level flight inside cueSlantFt (450 ft). */
  assess(ctx, mem = {}) {
    const M = FW_WING.movingOut;
    const inLevel = ctx.phase?.phase === 'level' && !ctx.phase?.turning;
    const inWindow = inLevel && ctx.seen.slant < M.cueSlantFt;
    const dwell = inWindow ? (mem.dwell ?? 0) + 1 : 0;
    const cue = dwell >= M.dwellSteps ? 1 : 0;
    return { cue, dwell };
  },

  /** Plans 2-stage move-out: Stage 1 ('back') straight back along held side to 500 ft at 10 ft/s; Stage 2 ('out') sweep to 45°. */
  plan(ctx) {
    const M = FW_WING.movingOut;
    const side = ctx.phase?.side || ctx.seen.levelSide || -1;
    const stage = ctx.seen.slant < M.backToFt ? 'back' : 'out';
    const heldCrossFt = Math.max(43, Math.min(130, Math.abs(ctx.seen.crossFt ?? 43)));
    return {
      side,
      stage,
      heldCrossFt,
      doneHoldSec: 0,
    };
  },

  /** Steps active moving-out plan and outputs { done, abort, state, ref }. */
  step(ctx, state) {
    const M = FW_WING.movingOut;
    const abort = Boolean(ctx.phase?.turning || ctx.phase?.phase === 'turning');
    const normalRef = ctx.normalRef;

    let stage = state.stage;
    if (stage === 'back' && (ctx.seen.slant >= M.backToFt || (ctx.seen.behindFt ?? 0) >= M.backToFt - 30)) {
      stage = 'out';
    }

    let chiWantedDeg = normalRef.chiWantedDeg;
    let speedOffsetKt = normalRef.speedOffsetKt;
    let energyIntent = M.outIntent;

    if (stage === 'back') {
      // Stage 1: track straight back along his held side at ~10 ft/s (SMM 12.27 para 57), easing down to -50 ft stack.
      const crossNowFt = state.side * (ctx.seen.crossFt ?? state.side * state.heldCrossFt);
      const crossErrFt = state.heldCrossFt - crossNowFt; // + needs to move further out on his held side
      chiWantedDeg = clamp(-state.side * crossErrFt * 0.08, -10, 10);
      const remFt = Math.max(0, M.backToFt - ctx.seen.slant);
      const paceFtps = M.backPaceFtps * clamp01(remFt / 80 + 0.15);
      speedOffsetKt = -(paceFtps / KT_TO_FTPS);
      energyIntent = M.backIntent;
    } else {
      // Stage 2: gentle outward cut (up to 20°, TS-233) onto the 45° swept line at 625 ft, keeping range ~550-625 ft.
      chiWantedDeg = clamp(normalRef.chiWantedDeg, -FW_WING.chiMaxOutDeg, FW_WING.chiMaxOutDeg);
      const cosCut = Math.cos(chiWantedDeg * (Math.PI / 180));
      const keepUpKt = (ctx.V * (1 - cosCut)) / KT_TO_FTPS;
      const rangeErrFt = ctx.seen.slant - FW_WING.sweptFt;
      speedOffsetKt = clamp(keepUpKt + (rangeErrFt / FW_WING.aimSec) / KT_TO_FTPS, -FW_WING.powerBandKias, FW_WING.powerBandKias);
      energyIntent = M.outIntent;
    }

    const heightErrFt = FW_WING.stackFt - ctx.seen.heightFt;
    const heightRateTargetFtps = clamp(heightErrFt / 4, -15, 15);

    const inCone =
      stage === 'out' &&
      ctx.seen.slant >= M.doneSlantFt &&
      ctx.seen.sweepDeg >= 35 &&
      ctx.seen.sweepDeg <= 55 &&
      Math.abs(ctx.seen.closure) <= 6;
    const doneHoldSec = inCone ? state.doneHoldSec + STEP_SEC : 0;
    const done = doneHoldSec >= M.doneDwellSec;

    const ref = makeFwReference({
      ...normalRef,
      pathKind: 'line',
      chiWantedDeg,
      turnRateFfRadps: 0,
      heightTargetFt: FW_WING.stackFt,
      heightRateTargetFtps,
      speedOffsetKt,
      energyIntent,
      urgency: M.urgency,
      capChangeG: 0,
      aimKind: 'movingOut',
      pitchOwner: 'movingOut',
    });

    return {
      done,
      abort,
      state: { ...state, stage, doneHoldSec },
      ref,
    };
  },
});
