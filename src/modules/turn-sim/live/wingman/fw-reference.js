// Fighting wing's reference record and scalar loop-input blender (B08, Spec 7e §7.8, §7.10; TS-233, TS-234; Fable D1, D5, D21).
// Where it fits: sits between the planners (B05 normal follower writing S25, B06 active technique writing S26, B04 picker
// writing blend weight S23, and B12 guard writing urgency S36) and the control loops (B09 steering, B10 vertical, B11 power,
// B13 lift composer, B14 shaper).
// Exports: makeFwReference, blendFwReferences, stepFwBlendWeight.
// Does not: run any feedback loop, write stick/throttle/speed-brake commands directly, or blend unlike path geometries (D5).
import { STEP_SEC } from '../flight.js';
import { FW_WING } from '../wing-moves.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x) => clamp(x ?? 0, 0, 1);
const wrapDeg = (d) => ((d + 540) % 360) - 180;

/**
 * Creates a fighting-wing reference record (S25 normal reference from B05, or S26 candidate reference from B06).
 * Carries scalar loop inputs (D1, D5, D21) plus optional path descriptors so B08 blends at the scalar signal level.
 */
export function makeFwReference(fields = {}) {
  return {
    pathKind: fields.pathKind ?? 'line', // 'circle' | 'line' | 'aim'
    centre: fields.centre ?? null,
    radiusFt: fields.radiusFt ?? Infinity,
    dFt: fields.dFt ?? 0,
    side: fields.side ?? -1,
    chiMaxOutDeg: fields.chiMaxOutDeg ?? 20,
    chiMaxInDeg: fields.chiMaxInDeg ?? 12,
    keDegPerFt: fields.keDegPerFt ?? 0.026,
    chiWantedDeg: fields.chiWantedDeg ?? 0, // S27a: approach angle already capped before blending
    omegaFfRadps: fields.omegaFfRadps ?? 0, // S27b: path turn-rate feed-forward (rad/s)
    heightTargetFt: fields.heightTargetFt ?? FW_WING.stackFt, // S27c: h_T against Lead (+ above, ft)
    heightRateTargetFtps: fields.heightRateTargetFtps ?? 0, // S27c: h_T_dot profile rate (ft/s, D1)
    speedOffsetKt: clamp(fields.speedOffsetKt ?? 0, -FW_WING.powerBandKias, FW_WING.powerBandKias), // S27g: Δv_ref (±15 kt, D21)
    energyIntent: clamp(fields.energyIntent ?? 0, -1, 1), // S27d: -1 (bleed) .. 0 (keep) .. +1 (gain)
    urgency: clamp01(fields.urgency ?? 0), // S27e: 0..1
    capChangeG: fields.capChangeG ?? 0, // S27f: G cap adjustment
    // Optional pass-through fields used while S1 bridges today's aim-point law into S2's normal follower:
    aimTarget: fields.aimTarget ?? null,
    aimKind: fields.aimKind ?? 'swept',
    offFt: fields.offFt ?? 0,
    behindOn: Boolean(fields.behindOn),
    pitchOwner: fields.pitchOwner ?? 'stack',
  };
}

/**
 * Slides the path and height blend weights (S23, 0..1) toward targetWeight (0 or 1) at the rates required by Fable's M6 rule
 * (path >= 6 s for steering crossover 0.52 rad/s; height >= 4.3 s for vertical crossover 0.68 rad/s, or 15 s return to stack).
 */
export function stepFwBlendWeight(prev, targetWeight, dt = STEP_SEC, { pathSec = 6, heightSec = 4.3, returnHeightSec = FW_WING.stackReturnSec } = {}) {
  const p0 = typeof prev === 'object' && prev !== null ? (prev.path ?? 0) : clamp01(prev);
  const h0 = typeof prev === 'object' && prev !== null ? (prev.height ?? p0) : p0;
  const tgt = clamp01(targetWeight);
  const pRate = 1 / Math.max(pathSec, 1e-6);
  const hSec = tgt < h0 ? returnHeightSec : heightSec;
  const hRate = 1 / Math.max(hSec, 1e-6);
  return {
    path: clamp01(p0 + clamp(tgt - p0, -pRate * dt, pRate * dt)),
    height: clamp01(h0 + clamp(tgt - h0, -hRate * dt, hRate * dt)),
  };
}

/**
 * Blends the normal reference (S25) and optional technique reference (S26) by blend weight w (S23, scalar 0..1 or
 * { path, height }) at the scalar loop-input level (D5), merging technique urgency with guard urgency (S36) by Math.max.
 * Returns { chiWantedDeg (S27a), omegaFfRadps (S27b), heightTargetFt (S27c), heightRateTargetFtps (S27c),
 * speedOffsetKt (S27g), energyIntent (S27d), urgency (S27e), capChangeG (S27f), weight, ... }.
 */
export function blendFwReferences(normalRef, techRef = null, weight = 0, guardUrgency = 0) {
  const wPath = techRef ? (typeof weight === 'object' && weight !== null ? clamp01(weight.path) : clamp01(weight)) : 0;
  const wHeight = techRef ? (typeof weight === 'object' && weight !== null ? clamp01(weight.height ?? wPath) : wPath) : 0;
  const n = normalRef;
  const t = techRef ?? n;

  const chiWantedDeg = wPath > 0
    ? wrapDeg(n.chiWantedDeg + wPath * wrapDeg(t.chiWantedDeg - n.chiWantedDeg))
    : n.chiWantedDeg;
  const omegaFfRadps = n.omegaFfRadps + wPath * (t.omegaFfRadps - n.omegaFfRadps);
  const heightTargetFt = n.heightTargetFt + wHeight * (t.heightTargetFt - n.heightTargetFt);
  const heightRateTargetFtps = n.heightRateTargetFtps + wHeight * (t.heightRateTargetFtps - n.heightRateTargetFtps);
  const speedOffsetKt = clamp(
    n.speedOffsetKt + wPath * (t.speedOffsetKt - n.speedOffsetKt),
    -FW_WING.powerBandKias,
    FW_WING.powerBandKias,
  );
  const energyIntent = clamp(n.energyIntent + wPath * (t.energyIntent - n.energyIntent), -1, 1);
  const techUrgency = n.urgency + wPath * (t.urgency - n.urgency);
  const urgency = clamp01(Math.max(techUrgency, guardUrgency ?? 0));
  const capChangeG = n.capChangeG + wPath * (t.capChangeG - n.capChangeG);

  const pick = wPath >= 0.5 ? t : n;
  return {
    pathKind: pick.pathKind,
    chiWantedDeg,
    omegaFfRadps,
    heightTargetFt,
    heightRateTargetFtps,
    speedOffsetKt,
    energyIntent,
    urgency,
    capChangeG,
    weight: { path: wPath, height: wHeight },
    aimTarget: pick.aimTarget,
    aimKind: pick.aimKind,
    offFt: n.offFt,
    behindOn: pick.behindOn,
    pitchOwner: wHeight >= 0.5 ? t.pitchOwner : n.pitchOwner,
  };
}
