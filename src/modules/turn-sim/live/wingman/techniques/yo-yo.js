// Fighting wing T4 technique: high yo-yo (B06, Spec 7e §7.9.4; TS-233, TS-234; Fable D6, 3b §7).
// Where it fits: polled and stepped by B04 (supervisor.js stepFwPicker) via techniques/index.js when inside turn with excess closure.
// Exports: FW_YOYO_TECHNIQUE ({ id, priority, maxRunSec, assess, plan, step }).
// Does not: write stick, throttle, speed-brake, or loop commands directly — outputs only S24 (cue/done/abort) and S26 (reference).
import { STEP_SEC } from '../../flight.js';
import { FW_WING } from '../../wing-moves.js';
import { makeFwReference } from '../fw-reference.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x) => clamp(x ?? 0, 0, 1);

/** T4: High yo-yo ending stacked low — priority 4 in B06. */
export const FW_YOYO_TECHNIQUE = Object.freeze({
  id: 'yo-yo',
  priority: 4,
  maxRunSec: FW_WING.yoyo.maxRunSec,

  /** S24 cue assessment with closure and dwell. */
  assess(ctx, mem = {}) {
    const Y = FW_WING.yoyo;
    const closure = ctx.arc?.cActual ?? ctx.seen.closure;
    const predPass = ctx.guard?.predFt ?? ctx.seen.slant;
    const inWindow = ctx.phase?.phase === 'turning' &&
      ((ctx.arc?.dFt ?? 0) < -30) &&
      (closure > Y.cueClosureFtps) &&
      (predPass < 620 || ctx.seen.sweepDeg < 25);
    const dwellSec = inWindow ? (mem.dwellSec ?? 0) + STEP_SEC : 0;
    const cue = dwellSec >= Y.cueDwellSec ? clamp01((closure - Y.cueClosureFtps) / 15 + 0.5) : 0;
    return { cue, dwellSec };
  },

  /** Sizes climb height above Lead from closure to kill (S26). */
  plan(ctx) {
    const Y = FW_WING.yoyo;
    const closureToKill = Math.max(10, ctx.arc?.cActual ?? ctx.seen.closure);
    const rawClimbFt = clamp(closureToKill * Y.ftPerFtps, Y.minFt, Y.maxClimbFt);
    const horiz = Math.sqrt(Math.max(0, ctx.seen.slant ** 2 - ctx.seen.heightFt ** 2));
    const maxClimbBySlant = Math.sqrt(Math.max(0, Y.maxSlantFt ** 2 - horiz ** 2));
    const climbFt = clamp(rawClimbFt, Y.minFt, Math.min(Y.maxClimbFt, maxClimbBySlant));
    return {
      climbFt,
      stage: 'climb',
      topHoldSec: 0,
      doneHoldSec: 0,
    };
  },

  /** Steps active yo-yo plan, switches climb -> descend, and outputs { done, abort, state, ref }. */
  step(ctx, state) {
    const Y = FW_WING.yoyo;
    const closure = ctx.arc?.cActual ?? ctx.seen.closure;
    let stage = state.stage;
    let topHoldSec = state.topHoldSec;

    if (stage === 'climb') {
      const topHolding = closure < Y.topClosureFtps;
      topHoldSec = topHolding ? topHoldSec + STEP_SEC : 0;
      const topReached = topHoldSec >= Y.topDwellSec ||
        ctx.seen.slant >= Y.maxSlantFt - 40 ||
        ctx.seen.heightFt >= state.climbFt - 25;
      if (topReached) {
        stage = 'descend';
      }
    }

    const heightTargetFt = stage === 'climb' ? state.climbFt : FW_WING.stackFt;
    const energyIntent = stage === 'climb' ? Y.upIntent : Y.downIntent;
    const urgency = Y.urgency;

    const hErr = heightTargetFt - ctx.seen.heightFt;
    const rateMag = Math.min(Y.maxRateFtps, Math.sqrt(2 * 32.174 * 0.5 * Math.abs(hErr)) * 0.65);
    const heightRateTargetFtps = Math.abs(hErr) > 5 ? Math.sign(hErr) * rateMag : 0;

    const inReturnBand = Math.abs(ctx.seen.heightFt - FW_WING.stackFt) <= Y.downEndFt;
    const closureSettled = Math.abs(closure) < Y.doneClosureFtps;
    const isDone = stage === 'descend' && inReturnBand && closureSettled;
    const doneHoldSec = isDone ? state.doneHoldSec + STEP_SEC : 0;
    const done = isDone;

    const normalRef = ctx.normalRef;
    const ref = makeFwReference({
      ...normalRef,
      pathKind: 'circle',
      heightTargetFt,
      heightRateTargetFtps,
      speedOffsetKt: energyIntent < 0 ? -5 : normalRef.speedOffsetKt,
      energyIntent,
      urgency,
      capChangeG: 0,
      aimKind: 'yoyo',
      pitchOwner: 'yoyo',
    });

    return {
      done,
      abort: false,
      state: { ...state, stage, topHoldSec, doneHoldSec },
      ref,
    };
  },
});
