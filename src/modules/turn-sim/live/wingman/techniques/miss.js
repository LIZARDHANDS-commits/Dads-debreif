// Fighting wing T1 technique: pass clear / the miss (B06, Spec 7e §7.9.1; TS-233, TS-234; Fable D1, D4, D6, 3b §7).
// Where it fits: polled and stepped by B04 (supervisor.js stepFwPicker) via techniques/index.js when p < 600 ft closing.
// Exports: FW_MISS_TECHNIQUE ({ id, priority, maxRunSec, assess, plan, step }).
// Does not: write stick, throttle, speed-brake, or loop commands directly — outputs only S24 (cue/done/abort) and S26 (reference).
import { DEG } from '../../../../../core/angles.js';
import { G_FTPS2 } from '../../../../../core/units.js';
import { STEP_SEC } from '../../flight.js';
import { FW_WING } from '../../wing-moves.js';
import { makeFwReference } from '../fw-reference.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x) => clamp(x ?? 0, 0, 1);

/**
 * Computes the planned vertical profile target (h_T, ḣ_T) and least horizontal turn mix (Δω) for the miss (D1, D4, 3b §7).
 * #2 never pushes to 0 G or negative G in the seat (minG = 0.5 G floor stands): for an ordinary drop he unloads to ~0.5 G,
 * and when an urgent drop requires more downward acceleration along n_p = 0.5(1 - u), B13/B14 roll (overbanking past 90° if
 * required, via unload-roll-pull) and pull positive G.
 */
function buildMissPlan(ctx, prevPlan = null) {
  const M = FW_WING.miss;
  const { seen, guard, phase, V } = ctx;
  const p = Math.max(0, guard.predFt ?? seen.slant);
  const tPass = clamp(guard.tPassSec ?? 5, M.tPassMinSec, M.tPassMaxSec);
  const urgency = clamp01((M.urgencyStartSec - tPass) / Math.max(M.urgencySpanSec, 1e-6));
  const vertSign = prevPlan ? prevPlan.vertSign : seen.heightFt > FW_WING.yoyo.highFt ? 1 : -1;
  const rawDepth = Math.sqrt(Math.max(0, M.clearSlantFt * M.clearSlantFt - p * p));
  const depthFt = Math.max(prevPlan?.depthFt ?? 0, clamp(rawDepth, M.minDepthFt, M.maxDepthFt));
  const heightTargetFt = vertSign * depthFt;

  // Vertical acceleration budget along n_p = 0.5 * (1 - u) -> a_v = (0.5 + 0.5 * u) * g (3b §7, D4)
  const np = 0.5 * (1 - urgency);
  const avFtps2 = (1 - np) * G_FTPS2;
  const tEff = Math.max(0, tPass - 0.6);
  const dzMaxFt = 0.5 * avFtps2 * tEff * tEff;
  const minHorizNeededFt = Math.sqrt(Math.max(0, M.clearSlantFt * M.clearSlantFt - dzMaxFt * dzMaxFt));
  const dqFt = Math.max(0, minHorizNeededFt - p);
  const turnDir = phase.dir || Math.sign(seen.leadBankDeg) || seen.levelSide || -1;
  // Least outward turn mix Δω ≈ 2 Δq / (V t_pass²) away from Lead's turn (D4)
  const dOmegaMag = dqFt > 0 ? clamp((2 * dqFt) / (Math.max(V, 100) * Math.max(tPass, 2) ** 2), 0, M.maxTurnMixRadps) : 0;
  const deltaOmegaRadps = -turnDir * dOmegaMag;

  // Picture-based energy intent at planning (3b §7): -0.5 bleed if closing > 20 ft/s or predicted arc < 600 ft; +0.5 gain if > 750 ft.
  // In steep (> 2.2 G / > 62° bank) turns where induced drag already bleeds airspeed, only bleed on high closure (> 50 ft/s).
  const predArcFt = (ctx.arc?.arcFt ?? seen.slant) - seen.closure * Math.min(tPass, 4);
  const steepTurn = (seen.leadG ?? 1) > 2.2 || Math.abs(seen.leadBankDeg ?? 0) > 62;
  const energyIntent = steepTurn
    ? seen.closure > 50
      ? -0.5
      : 0
    : seen.closure > 20 || predArcFt < 600
      ? -0.5
      : predArcFt > 750
        ? 0.5
        : 0;

  return {
    plannedPassFt: p,
    tPassSec: tPass,
    urgency,
    vertSign,
    depthFt,
    heightTargetFt,
    avFtps2,
    dqFt,
    deltaOmegaRadps,
    turnDir,
    energyIntent,
    doneHoldSec: prevPlan?.doneHoldSec ?? 0,
    passedBottom: prevPlan?.passedBottom ?? false,
  };
}

/** T1: Pass clear (the miss) — priority 1 in B06. */
export const FW_MISS_TECHNIQUE = Object.freeze({
  id: 'pass-clear',
  priority: 1,
  maxRunSec: FW_WING.miss.maxRunSec,

  /** S24 cue assessment with D6 hysteresis band and 2-step dwell. */
  assess(ctx, mem = {}) {
    const M = FW_WING.miss;
    const p = ctx.guard?.predFt ?? ctx.seen.slant;
    const tPass = ctx.guard?.tPassSec ?? 5;
    const closing = ctx.seen.closure > M.cueClosureFtps;
    const inWindow = p < M.cuePassFt && closing && tPass >= M.tPassMinSec && tPass <= M.tPassMaxSec;
    const dwell = inWindow ? (mem.dwell ?? 0) + 1 : 0;
    const cue = dwell >= M.dwellSteps ? clamp01((M.cuePassFt - p) / 100 + 0.25) : 0;
    return { cue, dwell };
  },

  /** Sizes the miss plan once on entry (S26). */
  plan(ctx) {
    return buildMissPlan(ctx, null);
  },

  /** Steps the active miss plan, re-planning once only if predicted pass tightens by > 50 ft, and outputs { done, abort, state, ref }. */
  step(ctx, state) {
    const M = FW_WING.miss;
    const p = ctx.guard?.predFt ?? ctx.seen.slant;
    const nextState = p < state.plannedPassFt - M.replanTighterFt ? buildMissPlan(ctx, state) : { ...state };
    const hErr = nextState.heightTargetFt - ctx.seen.heightFt;
    const nearBottom = Math.abs(hErr) < 35 || Math.sign(hErr) !== nextState.vertSign;
    const passedBottom = nextState.passedBottom || nearBottom || ctx.seen.closure <= 0;
    const clearNow =
      p > M.donePassFt &&
      (ctx.seen.closure <= M.cueClosureFtps || (p > M.clearSlantFt && ctx.seen.slant > M.clearSlantFt)) &&
      passedBottom;
    const doneHoldSec = clearNow ? nextState.doneHoldSec + STEP_SEC : 0;
    const done = doneHoldSec >= M.doneDwellSec;

    // Profile rate ḣ_T (D1): smooth sqrt braking profile toward heightTargetFt so B10's rate term drives the drop
    const rateMag = Math.min(M.maxRateFtps, Math.sqrt(2 * nextState.avFtps2 * Math.abs(hErr)) * 0.65);
    const heightRateTargetFtps = Math.abs(hErr) > 5 ? Math.sign(hErr) * rateMag : 0;

    // Outward course bias toward Lead's tail only when vertical drop alone leaves a horizontal residual dqFt (D4)
    const normalRef = ctx.normalRef;
    const horizNeedShare = clamp01((nextState.dqFt ?? 0) / 120);
    const lagBiasDeg = -nextState.turnDir * FW_WING.chiMaxOutDeg * horizNeedShare * clamp01((M.donePassFt - p) / 150);
    const ref = makeFwReference({
      ...normalRef,
      pathKind: 'circle',
      chiWantedDeg: normalRef.chiWantedDeg + lagBiasDeg,
      omegaFfRadps: normalRef.omegaFfRadps + nextState.deltaOmegaRadps,
      heightTargetFt: nextState.heightTargetFt,
      heightRateTargetFtps,
      speedOffsetKt: nextState.energyIntent < 0 ? -5 : normalRef.speedOffsetKt,
      energyIntent: nextState.energyIntent,
      urgency: nextState.urgency,
      capChangeG: 0,
      aimKind: 'passClear',
      pitchOwner: 'passClear',
    });

    return {
      done,
      abort: false,
      state: { ...nextState, passedBottom, doneHoldSec },
      ref,
    };
  },
});
