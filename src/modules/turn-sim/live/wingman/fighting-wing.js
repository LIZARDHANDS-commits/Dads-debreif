// Fighting wing on the live wingman (B5; Spec 7e, TS-233, TS-234): normal follower (B05), arc/range loop (B07),
// Where it fits: stepped by wingman.js when #2 is in fighting wing; orchestrates perception (B02), phase/case (B03),
// Exports: setFwAnalysis, startFwWing, stepFwWingman, liftWithin.
// Does not: compute perception delays (perception.js) or separation guard search internals (separation.js).
//
// Signal flow each 20 Hz step:
//  1. B02 (perception.js seeFw): sees Lead 0.4 s late dead-reckoned across 0.4 s with extrapolated bank (S01-S05b) and own state now (S08-S11).
//  2. B03 (supervisor.js fwJob): continuous phase weights S21 = { level, entry, turning, exit } (1.5 s blend) and latched case label S22 (±50 ft dead band).
//  3. B07 (runArcLoop): arc/range error over τ_s = 10 s -> wanted closure w (S28) -> circle offset d_cmd within ±250 ft (S29) and unmet closure S29b -> Δv_ref (S27g, ±15 kt).
//  4. B05 (buildNormalReference): concentric circle at offset d_cmd (radius clipped at 20,000 ft) or swept line, asymmetric approach caps 20° out / 12° in (Ke = 0.026°/ft) and true path turn rate ω_FF -> S25.
//  5. B04 & B06 (supervisor.js stepFwPicker, techniques/miss.js): polls techniques in priority order -> S23 blend weight and S26 technique reference.
//  6. B08 (fw-reference.js blendFwReferences): scalar loop-input blend of S25 and S26 -> S27a-S27g.
//  7. B09 (steerFromRef): ω_cmd = ω_FF + 0.5 * (χ_w - χ) (S31); B10 (verticalFromRef): ΔG_v = 0.005*(h_T - h) + 0.02*(ḣ_T - ḣ) (S32).
//  8. B12 (separation.js stepFwGuard): single 10 s closing-pass predictor on raw (S31, S32) with 600 -> 500 ft cubic barrier -> S35-S41.
//  9. B13 (liftWithin): 3D lift composition in Patrick's priority order (1. positive climb, 2. 1 G hold, 3. turn) with 0.2 G soft knee and 0.5 G unload-roll-pull -> S43, S44.
// 10. B14 (shaper.js shapeFwLift): urgency-scaled G onset 1 + 3u G/s -> S45; B11 (powerFromRef): 0.3 /s proportional speed loop on V_L + Δv_ref - V -> S33; B15 (stepLead).
import { DEG } from '../../../../core/angles.js';
import { G_FTPS2, KT_TO_FTPS } from '../../../../core/units.js';
import { softMin } from '../../../../core/flight-math.js';
import { availableG, shakerG, tasToIasKt } from '../../../../core/t6-performance.js';
import { STEP_SEC } from '../flight.js';
import { leadStateOf, stepLead } from '../fluid-lead.js';
import { ROLL } from '../rates.js';
import { FW_WING } from '../wing-moves.js';
import { add3, sub3, scale3, cross3, unit3, perp3, dot3, len3 } from '../attitude.js';
import { seenOf, startFwSight, seeFw } from './perception.js';
import { startFwJob, fwJob, startFwPicker, stepFwPicker } from './supervisor.js';
import { startFwGuard, stepFwGuard } from './separation.js';
import { makeFwReference, blendFwReferences } from './fw-reference.js';
import { shapeFwLift } from './shaper.js';

const W = FW_WING;
const Z = Object.freeze({ x: 0, y: 0, z: 1 });
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x) => clamp(x ?? 0, 0, 1);
const wrapDeg = (d) => ((d + 540) % 360) - 180;

// Analysis only (plan T29m part 2: tools/formation-gauge.mjs --extra-delay and --delay-mode, tools/fw-rig.mjs): never set
// in flying, so with the defaults every step flies exactly as before.
let ANALYSIS = { extraDelaySec: 0, delayMode: 'lead', probe: null };
/** Set the analysis options for wingmen started from now on (the gauge's flags, the rig); setFwAnalysis() restores flying. */
export function setFwAnalysis(a = {}) {
  ANALYSIS = { extraDelaySec: a.extraDelaySec ?? 0, delayMode: a.delayMode ?? 'lead', probe: a.probe ?? null };
}
const probeAt = (w, at) => (w.probe && w.probe.at === at ? w.probe.fn(w.t) : 0);
const vec = (a) => (a ? { x: a[0], y: a[1], z: a[2] } : null);

/**
 * The fighting wing wingman's state from his aircraft (flight.js fields; velFtps and accFtps2 when a manoeuvre handed them
 * over) and the aircraft he flies off (refSt: stepLead's or leadStateOf's). opts: { blockFt }.
 */
export function startFwWing(aircraft, refSt, { blockFt }) {
  const st = leadStateOf(aircraft, blockFt);
  const sight = startFwSight(seenOf(refSt), seenOf(st), {
    ownAcc: vec(aircraft.accFtps2),
    g: refSt.g ?? 1,
    ...(ANALYSIS.extraDelaySec ? { extraSec: ANALYSIS.extraDelaySec } : {}),
    ...(ANALYSIS.delayMode === 'picture' ? { picture: true } : {}),
  });
  const first = seeFw(sight, seenOf(refSt), seenOf(st)).seen;
  return {
    st,
    sight,
    guard: startFwGuard(),
    job: startFwJob(first),
    picker: startFwPicker(),
    blockFt,
    t: 0,
    offFt: 0, // B07 slewed circle offset d_cmd (ft, + inside)
    shapedG: st.g ?? 1, // B14 urgency shaper's slewed G command
    lastChiOwnDeg: 0,
    lastChiWantedDeg: 0,
    ...(ANALYSIS.probe ? { probe: ANALYSIS.probe } : {}),
    ...(ANALYSIS.delayMode === 'picture' ? { picture: true } : {}),
  };
}

/** Lead's wing line and path, level: { nose (his path, unit), left (level, unit) }; the cone's frame. */
function coneFrame(v) {
  const nose = unit3(v);
  const left = unit3(cross3(Z, nose));
  return { nose, left };
}

/**
 * The plane he steers in: Lead's turn plane once Lead turns faster than turnPlaneRadps (his lift plane: Spec 7e §7.7), else
 * level. Returns { omegaL (Lead's seen turn, rad/s vector), turning, out (the plane's normal, upward) }.
 */
function turnPlaneOf(seen) {
  const omegaL = seen.turn.omega;
  const turning = len3(omegaL) > W.turnPlaneRadps;
  const out = turning ? scale3(unit3(omegaL), Math.sign(dot3(omegaL, Z)) || 1) : Z;
  return { omegaL, turning, out };
}

/** Lead now (S01, S02) from seeFw's one-delay dead-reckoning (B02, R1); { ownP, ownV } his own state now (S08), or as seen in picture mode. */
function leadNowOf(seen, st, picture = false) {
  if (picture) return { leadNow: seen.lead.p, leadV: seen.lead.v, ownP: seen.own.p, ownV: seen.own.v };
  return { leadNow: seen.lead.p, leadV: seen.lead.v, ownP: st.pm, ownV: st.vel };
}

/**
 * Curvilinear range in Lead's turn (S18, S19, S20; Spec 7e §7.5): s = R atan2(-x, R - y) the arc behind Lead round his
 * circle, d = R - sqrt((R - y)^2 + x^2) the offset inside it (+ toward centre), and closing from velocities. When Lead's
 * turn radius exceeds maxCircleRadiusFt (20,000 ft) or bank < turnFrameDeg, falls back smoothly to straight-line limits
 * (-x, y, dot(ownV, nL) - V_L) so (s, d, closing) are continuous through wings level (D17, D21).
 */
function arcRange(seen, job, now, cone) {
  const { leadNow, leadV, ownP, ownV } = now;
  const nL = unit3(leadV);
  const R = seen.turn.radiusFt;
  const onCircle = Boolean(seen.turn.centre) && Number.isFinite(R) && R <= W.maxCircleRadiusFt && Math.abs(seen.leadBankDeg) >= W.turnFrameDeg;
  const inward = onCircle ? unit3(seen.turn.aPerp) : scale3(cone.left, job.dir || seen.levelSide || -1);
  const rel = sub3(ownP, leadNow);
  const x = dot3(rel, nL);
  const y = dot3(rel, inward);
  const linClosing = dot3(ownV, nL) - len3(leadV);
  if (!onCircle) {
    return {
      onCircle: false,
      sContFt: -x,
      dContFt: y,
      arcFt: job.turning ? -x : null,
      dFt: job.turning ? y : null,
      closing: job.turning ? linClosing : seen.closure,
      linClosing,
    };
  }
  const r = Math.hypot(R - y, x);
  const radialIn = scale3(add3(scale3(inward, y - R), scale3(nL, x)), 1 / Math.max(r, 1));
  const axis = unit3(cross3(nL, inward));
  const tangent = unit3(cross3(axis, radialIn));
  const sContFt = R * Math.atan2(-x, R - y);
  const dContFt = R - r;
  const cirClosing = (R * dot3(ownV, tangent)) / Math.max(r, 1) - len3(leadV);
  return {
    onCircle: true,
    sContFt,
    dContFt,
    arcFt: job.turning ? sContFt : null,
    dFt: job.turning ? dContFt : null,
    closing: job.turning ? cirClosing : seen.closure,
    linClosing,
  };
}

/**
 * B07 Arc / Range Loop (Spec 7e §7.7; Fable D9, D10, D21; S28, S29, S29b, S27g):
 *  - Range time constant τ_s = τ_r = 10 s (W.aimSec), closure feedback kc = 0.5 (W.arcKc).
 *  - Soft closure limit ramping linearly from 25 ft/s to 60 ft/s over 200-400 ft of range error (W.arcNearBandFt).
 *  - Circle offset d_cmd clamped to ±250 ft (W.arcOffsetMaxFt) and slewed at 60 ft/s (W.arcSlewFtps).
 *  - Unmet closure S29b = w - ω * (d_cmd - d_ss) feeds speed offset Δv_ref (S27g, clipped to ±15 kt) so range holds both
 *    in turns when d_cmd saturates (D9) and in level flight when ω -> 0 (D21).
 */
function runArcLoop(w, seen, job, V, omegaL, now, cone, arc) {
  const wTurn = clamp01((job.weights?.entry ?? 0) + (job.weights?.turning ?? 0));
  const backFt = W.sweptFt * Math.sin(W.sweptDeg * DEG);
  const outFt = W.sweptFt * Math.cos(W.sweptDeg * DEG);
  const place = add3(add3(now.leadNow, scale3(cone.nose, -backFt)), scale3(cone.left, job.sideBlend * outFt));
  const behindLevelFt = dot3(sub3(place, now.ownP), cone.nose);

  const probeKind = w.probe && probeAt(w, w.probe.at) !== 0 ? w.probe.at : null;
  const eArcTurn = arc.sContFt - W.arcTargetFt;
  const eRangeRaw = (1 - wTurn) * behindLevelFt + wTurn * eArcTurn;
  const eRange = probeKind ? (w.preProbeERange ?? eRangeRaw) : eRangeRaw;
  const [nearLo, nearHi] = W.arcNearBandFt;
  const bandFrac = clamp01((Math.abs(eRange) - nearLo) / Math.max(nearHi - nearLo, 1));
  const lim = W.arcNearFtps + bandFrac * (W.arcFarFtps - W.arcNearFtps);
  const cWant0 = clamp(eRange / W.aimSec, -lim, lim);
  const cWant = w.probe ? cWant0 + probeAt(w, 'cWant') : cWant0; // S28

  const omegaMag = len3(omegaL);
  const omegaEff = Math.max(omegaMag, W.minTurnRadps);
  const vLead = Math.max(len3(now.leadV), 1);
  const dss = arc.onCircle ? seen.turn.radiusFt * (1 - V / vLead) : 0;
  const cActual = (1 - wTurn) * arc.linClosing + wTurn * arc.closing;

  // Case entry bias on circle offset (S3a, Spec 7e §7.7): stretched-away biases inside; tight-away biases outside
  const entryW = job.weights?.entry ?? 0;
  const caseBiasFt =
    job.caseLabel === 'stretched-away' || job.caseLabel === 'very-stretched-away'
      ? 90 * entryW
      : job.caseLabel === 'tight-away'
        ? -80 * entryW
        : 0;

  const dRawTurn = probeKind === 'aimLateral' ? w.offFt : dss + (cWant + W.arcKc * (cWant - cActual)) / omegaEff + caseBiasFt;
  const dRaw = wTurn * dRawTurn;
  const want = clamp(dRaw, -W.arcOffsetMaxFt, W.arcOffsetMaxFt);
  const offFt = w.offFt + clamp(want - w.offFt, -W.arcSlewFtps * STEP_SEC, W.arcSlewFtps * STEP_SEC); // S29

  // Unmet closure S29b -> speed offset Δv_ref S27g (D9, D21)
  const omegaGeom = arc.onCircle ? omegaMag : 0;
  const geomClosureFtps = wTurn * omegaGeom * (offFt - dss);
  const unmetClosureFtps = probeKind ? 0 : cWant - geomClosureFtps; // S29b
  const wantTas = vLead + clamp(unmetClosureFtps, -W.aimMaxFtps, W.aimMaxFtps);
  const speedOffsetRaw = clamp(tasToIasKt(wantTas / KT_TO_FTPS, seen.lead.p.z) - seen.leadKias, -W.powerBandKias, W.powerBandKias);
  const speedOffsetKt = probeKind ? (w.preProbeSpeedOffsetKt ?? 0) : speedOffsetRaw; // S27g

  const terms = {
    dssFt: dss,
    ffFt: wTurn * (cWant / omegaEff),
    kcFt: wTurn * ((W.arcKc * (cWant - cActual)) / omegaEff),
    wantFt: want,
    unmetFtps: unmetClosureFtps,
    limit:
      Math.abs(dRaw) > W.arcOffsetMaxFt
        ? 'offset'
        : Math.abs(want - w.offFt) > W.arcSlewFtps * STEP_SEC
          ? 'slew'
          : Math.abs(eRange / W.aimSec) > lim
            ? 'closure'
            : null,
  };

  return {
    eRange,
    cWant,
    cActual,
    dss,
    offFt,
    unmetClosureFtps,
    speedOffsetKt,
    place,
    terms,
  };
}

/**
 * B05 Normal Follower (Spec 7e §7.7; TS-233; Fable D2, D17; writes S25):
 *  - Follows a circle concentric with Lead's at offset d_cmd (radius R - d_cmd, clipped at maxCircleRadiusFt = 20,000 ft)
 *    or the level swept line when Lead is wings level, blended by continuous phase weights S21.
 *  - Asymmetric approach-angle law:chiMaxOutDeg = 20° when outside the target circle, chiMaxInDeg = 12° when inside,
 *    with slope Ke = 0.026°/ft (D2).
 *  - True path curvature feed-forward ω_FF (S27b): on the circle, V cos(α) / r, relaxed toward 0 when well inside the
 *    circle on an into-turn so #2 flies straight ahead until reaching the circle (TS-233).
 */
function buildNormalReference(w, seen, job, st, V, u, plane, now, cone, arc, arcLoop) {
  const flat = (vec3) => perp3(vec3, plane.out);
  const nLIn = unit3(flat(now.leadV));
  const uIn = len3(flat(u)) > 1e-6 ? unit3(flat(u)) : u;
  const chiOwnDeg = Math.atan2(dot3(cross3(nLIn, uIn), plane.out), dot3(nLIn, uIn)) / DEG;

  // Level swept-line reference path
  const outFt = W.sweptFt * Math.cos(W.sweptDeg * DEG);
  const yTargetFt = job.sideBlend * outFt + job.side * probeAt(w, 'aimLateral');
  const yNowFt = dot3(sub3(st.pm, now.leadNow), cone.left);
  const eLeftFt = yTargetFt - yNowFt;
  const betaDeg = W.chiMaxOutDeg * Math.tanh((W.keDegPerFt * eLeftFt) / W.chiMaxOutDeg);
  const betaRad = betaDeg * DEG;
  const uWantLine = unit3(flat(add3(scale3(cone.nose, Math.cos(betaRad)), scale3(cone.left, Math.sin(betaRad)))));

  // Concentric circle reference path when Lead is turning
  const wTurn = clamp01((job.weights?.entry ?? 0) + (job.weights?.turning ?? 0));
  const aimOffFt = arcLoop.offFt + probeAt(w, 'aimLateral');
  let uWantCircle = uWantLine;
  let omegaCircleRadps = 0;
  let eCircleFt = 0;

  if (arc.onCircle && seen.turn.centre) {
    const c = seen.turn.centre;
    const R = seen.turn.radiusFt;
    const turnDir = Math.sign(dot3(plane.omegaL, plane.out)) || job.dir || 1; // +1 left turn around plane.out
    const rVec = flat(sub3(st.pm, c));
    const rNow = Math.max(len3(rVec), 1);
    const radialOut = scale3(rVec, 1 / rNow);
    const radialIn = scale3(radialOut, -1);
    const tCircle = unit3(cross3(scale3(plane.out, turnDir), radialOut));
    const rT = Math.max(250, R - aimOffFt);
    const eOutFt = rNow - rT; // + outside target circle, - inside target circle
    eCircleFt = eOutFt;

    // Asymmetric approach angle: 20° out (cutting in toward rT), 12° in (drifting out toward rT)
    let alphaDeg =
      eOutFt >= 0
        ? W.chiMaxOutDeg * Math.tanh((W.keDegPerFt * eOutFt) / W.chiMaxOutDeg)
        : -W.chiMaxInDeg * Math.tanh((W.keDegPerFt * -eOutFt) / W.chiMaxInDeg);

    // Entry case shaping (S3a, Spec 7e §7.7)
    const entryW = job.weights?.entry ?? 0;
    if (entryW > 0) {
      if (job.caseLabel === 'stretched-into' || job.caseLabel === 'very-stretched-into') {
        alphaDeg = clamp(alphaDeg + 6 * entryW, -W.chiMaxInDeg, W.chiMaxOutDeg);
      } else if (job.caseLabel === 'tight-away') {
        alphaDeg = clamp(alphaDeg - 8 * entryW, -W.chiMaxInDeg, W.chiMaxOutDeg);
      }
    }
    const alphaRad = alphaDeg * DEG;
    uWantCircle = unit3(flat(add3(scale3(tCircle, Math.cos(alphaRad)), scale3(radialIn, Math.sin(alphaRad)))));

    // Path curvature feed-forward ω_FF: relax when inside circle on an into-turn ("fly straight ahead until on the circle")
    const insideRelax = job.into && eOutFt < 0 ? clamp01(1 + eOutFt / 180) : 1;
    omegaCircleRadps = turnDir * ((V * Math.cos(alphaRad)) / Math.max(rNow, 250)) * insideRelax;
  }

  const uWant = unit3(add3(scale3(uWantLine, 1 - wTurn), scale3(uWantCircle, wTurn)));
  const chiWantedDeg = Math.atan2(dot3(cross3(nLIn, uWant), plane.out), dot3(nLIn, uWant)) / DEG; // S27a
  const omegaFfRadps = wTurn * omegaCircleRadps; // S27b
  const aimKind = !job.turning ? (job.sTurn ? 'sTurn' : 'swept') : aimOffFt > 75 ? 'lead' : aimOffFt < -75 ? 'lag' : 'pure';
  const pitchOwner = job.low ? 'lowInside' : 'stack';

  const normalRef = makeFwReference({
    pathKind: arc.onCircle && wTurn >= 0.5 ? 'circle' : 'line',
    centre: seen.turn.centre,
    radiusFt: seen.turn.radiusFt,
    dFt: arcLoop.offFt,
    side: job.side,
    chiMaxOutDeg: W.chiMaxOutDeg,
    chiMaxInDeg: W.chiMaxInDeg,
    keDegPerFt: W.keDegPerFt,
    chiWantedDeg,
    omegaFfRadps,
    heightTargetFt: job.heightFt,
    heightRateTargetFtps: 0,
    speedOffsetKt: arcLoop.speedOffsetKt,
    energyIntent: 0,
    urgency: 0,
    capChangeG: 0,
    aimKind,
    offFt: arcLoop.offFt,
    behindOn: false,
    pitchOwner,
  });

  return {
    normalRef,
    chiOwnDeg,
    eTrackFt: wTurn >= 0.5 ? Math.abs(eCircleFt) : Math.abs(eLeftFt),
  };
}

/**
 * B09 Steering Loop (Spec 7e §7.7; Fable D2; writes S31 ω_cmd):
 *  - ω_cmd = ω_FF + K_χ * (χ_w - χ), with K_χ = 0.5 /s (W.kChiPerSec).
 *  - Multiplies by V along the in-plane normal to produce aTurn0 (ft/s²) and trace diagnostics.
 */
function steerFromRef(w, ref, chiOwnDeg, V, u, plane) {
  const chiErrDeg = wrapDeg(ref.chiWantedDeg - chiOwnDeg); // S30
  const omegaP = W.kChiPerSec * (chiErrDeg * DEG);
  const omegaFf = ref.omegaFfRadps;
  const omegaCmd = omegaFf + omegaP; // S31 (rad/s, + turning left in plane)
  const side = unit3(cross3(plane.out, u));
  const aTurn0 = scale3(side, omegaCmd * V);
  const terms = {
    chiErrDeg,
    angleDeg: Math.abs(chiErrDeg),
    pG: ( Math.abs(omegaP) * V) / G_FTPS2,
    ffG: (omegaFf * Math.sign(omegaP || omegaFf || 1) * V) / G_FTPS2,
    aimTurnDps: Math.abs(omegaFf) / DEG,
    aimTurnRawDps: Math.abs(omegaCmd) / DEG,
    aimJumpFt: 0,
  };
  return { omegaCmd, aTurn0, terms };
}

/**
 * B10 Vertical Loop (Spec 7e §7.7; Fable D1; writes S32 ΔG_v):
 *  - ΔG_v = 0.005 * (h_T - h) + 0.02 * (ḣ_T - ḣ), clipped to ±vertMaxG (±1.5 G).
 *  - Acting on (ḣ_T - ḣ) instead of -ḣ ensures the rate term helps planned descents (T1: pass-clear) instead of fighting them.
 */
function verticalFromRef(w, ref, now, st, u, out) {
  const dz = w.probe ? ref.heightTargetFt + probeAt(w, 'heightTarget') : ref.heightTargetFt;
  const hRateTarget = ref.heightRateTargetFtps ?? 0;
  const errFt = dot3(sub3(add3(now.leadNow, scale3(Z, dz)), st.pm), out);
  const hDot = dot3(sub3(st.vel, now.leadV), out);
  const errRate = hRateTarget - hDot;
  const rawVertG = W.vertGPerFt * errFt + W.vertGPerFtps * errRate;
  const vertG = clamp(rawVertG, -W.vertMaxG, W.vertMaxG); // S32
  const aV = scale3(out, vertG * G_FTPS2);
  const hold1G = perp3(Z, u);
  const vertVec = scale3(perp3(aV, u), 1 / G_FTPS2);
  const hold = add3(hold1G, vertVec);
  const terms = {
    errRate,
    pG: W.vertGPerFt * errFt,
    dG: W.vertGPerFtps * errRate,
    vertG,
    limit: Math.abs(rawVertG) > W.vertMaxG,
  };
  return { dz, errFt, aV, hold, hold1G, vertVec, vertG, terms };
}

/** Largest share s in [0, 1] of trim with |fixed + s * trim| <= limG. */
function scaleToCap(fixed, trim, limG) {
  if (len3(add3(fixed, trim)) <= limG + 1e-9) return { vec: trim, s: 1 };
  if (len3(fixed) >= limG) return { vec: { x: 0, y: 0, z: 0 }, s: 0 };
  const a = dot3(trim, trim);
  const b = 2 * dot3(fixed, trim);
  const c = dot3(fixed, fixed) - limG * limG;
  const s = a > 1e-12 ? Math.max(0, Math.min(1, (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a))) : 0;
  return { vec: scale3(trim, s), s };
}

/**
 * Lift composer (B13, R6, D17, D20, S43; Spec 7e §7.9): composes 3D lift vector (G) from 1 G hold, vertical demand, and
 * horizontal turn (aTurn, ft/s²), trimming over a 0.2 G soft knee (W.capKneeG, softMin) in Patrick's priority order:
 *  1. positive climb (vertG > 0) gives way first ('climb');
 *  2. 1 G level hold gives way second ('hold') — #2 accepts temporary descent before giving up turn;
 *  3. horizontal turn gives way last ('turn').
 * Unload, roll, pull: while his wings are more than pullWithinDeg off where the lift is wanted he pulls only its share
 * along them; never under minG (0.5 G). Returns { lift, capGaveWay, rawG, gLim }.
 */
export function liftWithin(aTurn, hold, cap, bodyUp, vert = null) {
  const turn = scale3(aTurn, 1 / G_FTPS2);
  let lift = add3(hold, turn);
  const rawG = len3(lift);
  let capGaveWay = 'none';
  const gLim = rawG > cap - W.capKneeG ? softMin(rawG, cap, W.capKneeG) : rawG;
  if (rawG > cap - W.capKneeG && rawG > gLim + 1e-9) {
    const hold1G = vert?.hold1G ?? hold;
    const vertVec = vert?.vertVec ?? { x: 0, y: 0, z: 0 };
    const vertG = vert?.vertG ?? 0;
    const fixed1 = add3(hold1G, turn);
    if (vertG > 0 && len3(vertVec) > 1e-9 && len3(fixed1) <= gLim + 1e-9) {
      lift = add3(fixed1, scaleToCap(fixed1, vertVec, gLim).vec);
      capGaveWay = 'climb';
    } else {
      const holdRem = vertG > 0 ? hold1G : hold;
      if (len3(turn) <= gLim + 1e-9) {
        lift = add3(turn, scaleToCap(turn, holdRem, gLim).vec);
        capGaveWay = 'hold';
      } else {
        lift = len3(turn) > 1e-9 ? scale3(unit3(turn), gLim) : { x: 0, y: 0, z: 0 };
        capGaveWay = 'turn';
      }
    }
  }
  const along = dot3(lift, bodyUp);
  if (len3(lift) > 1e-9 && along < len3(lift) * Math.cos(W.pullWithinDeg * DEG)) lift = scale3(unit3(lift), Math.max(W.minG, along));
  if (len3(lift) < W.minG) lift = len3(lift) > 1e-9 ? scale3(unit3(lift), W.minG) : scale3(unit3(hold), W.minG);
  return { lift, capGaveWay, rawG, gLim };
}

/**
 * B11 Proportional Speed & Drag Law (S2 baseline; Fable D21, D23; writes S33):
 *  - Proportional speed loop Kv = 0.3 /s on (V_L + Δv_ref - V) with no integrator (powerI = 0 retired, D23).
 *  - Full physics feed-forwards and intent-gated speed brake follow in S4.
 */
function powerFromRef(w, seen, job, st, guard, ref, closing, leadKias) {
  const bandKt = W.powerBandKias;
  const dKt = clamp(ref.speedOffsetKt, -bandKt, bandKt);
  const wantKias0 = leadKias + dKt;
  const wantKias = w.probe ? wantKias0 + probeAt(w, 'wantKias') : wantKias0;
  const pFtps = dKt * KT_TO_FTPS;
  const lowMax = job.low && ref.pitchOwner === 'lowInside';

  const BI = W.brakes;
  const effectiveBleed = Math.min(ref.energyIntent, -guard.bleedReq);
  const where = seen.slant < W.happyFt[1] || guard.on || effectiveBleed <= -0.25;
  const fastEnough = st.kias >= leadKias - 5;
  const idle = fastEnough && (w.idle ? closing > BI.idleOffFtps : closing > BI.idleFtps && where);
  const boards = fastEnough && (w.boards ? closing > BI.boardsOffFtps : closing > BI.boardsFtps && where);
  const power = lowMax ? { throttle: 1 } : { holdKias: wantKias };
  const terms = {
    kind: idle ? 'idle' : lowMax ? 'max' : 'hold',
    pFtps,
    iFtps: 0,
    bandClip: Math.abs(ref.speedOffsetKt) >= bandKt - 1e-6,
  };
  return {
    ask: { ...(idle ? { throttle: 0 } : power), ...(boards ? { boards: true } : {}) },
    idle,
    boards,
    wantKias,
    terms,
  };
}

/** Job label for the trace: active technique or guard filter when active, else B03 phase/case label. */
function jobLabel(guard, picker, job) {
  if (guard.filterOn) return 'guard-filter';
  if (picker.activeId) return picker.activeId;
  if (job.turning) return `turn-${job.entry ? `${job.entry.into ? 'into' : 'away'}-${job.entry.range}` : 'on'}`;
  return job.sTurn ? 'sTurn' : 'swept';
}

/**
 * One 20 Hz step of the fighting wing wingman. refSt: the aircraft he flies off, at the same moment as his own state.
 * Returns { w, trace }.
 */
export function stepFwWingman(w, refSt) {
  const { mem, seen } = seeFw(w.sight, seenOf(refSt), seenOf(w.st));
  const st = w.st;
  const stC = w.picture ? { ...st, pm: { ...st.pm, x: seen.own.p.x, y: seen.own.p.y, z: seen.own.p.z }, vel: seen.own.v } : st;
  const V = Math.max(len3(stC.vel), 1);
  const u = scale3(stC.vel, 1 / V);
  const plane = turnPlaneOf(seen);
  const leadKias = seen.leadKias;
  const now = leadNowOf(seen, st, Boolean(w.picture));
  const cone = coneFrame(seen.lead.v);

  // Step B03 (Phase & Case, S21, S22) with last step's capture errors
  const probeActive = Boolean(w.probe && probeAt(w, w.probe.at) !== 0);
  const prevChiErr = Math.abs(wrapDeg((w.lastChiWantedDeg ?? 0) - (w.lastChiOwnDeg ?? 0)));
  const prevArcErr = w.lastArcErrAbs ?? Infinity;
  const job = probeActive ? w.job : fwJob(w.job, seen, { shortKt: leadKias - st.kias, arcErrAbs: prevArcErr, chiErrAbs: prevChiErr });

  // Curvilinear range (S18-S20), B07 Arc/Range Loop (S28, S29, S29b, S27g), and B05 Normal Follower (S25)
  const arc = arcRange(seen, job, now, cone);
  const arcLoop = runArcLoop(w, seen, job, V, plane.omegaL, now, cone, arc);
  const { normalRef, chiOwnDeg, eTrackFt } = buildNormalReference(w, seen, job, stC, V, u, plane, now, cone, arc, arcLoop);

  // Step B04 Technique Picker & B06 Active Technique (T1: pass-clear in S3b; writes S23, S24, S26)
  const pickerCtx = { seen, guard: w.guard, phase: job, arc, normalRef, V };
  const picker = probeActive ? startFwPicker() : stepFwPicker(w.picker, pickerCtx, STEP_SEC);

  // Step B08 Scalar Reference Blender (S25 + S26 -> S27a-S27g)
  const ref = blendFwReferences(normalRef, picker.techRef, picker.weight, probeActive ? 0 : (w.guard?.urgency ?? 0));

  // Step B09 Steering Loop (S31 ω_cmd) and B10 Vertical Loop (S32 ΔG_v with profile rate ḣ_T)
  const steer = steerFromRef(w, ref, chiOwnDeg, V, u, plane);
  const vert0 = verticalFromRef(w, ref, now, stC, u, plane.out);

  // Step B12 Separation Guard (single 10 s predictor + 600 -> 500 ft cubic barrier -> S35-S41)
  const sit = { seen, st: stC, job, turning: plane.turning, out: plane.out, u, V, ownP: now.ownP, ownV: now.ownV, leadNow: now.leadNow, leadV: now.leadV };
  const guardRaw = stepFwGuard(w.guard, sit, {
    omegaCmd: steer.omegaCmd,
    vertGCmd: vert0.vertG,
    vertErrFt: vert0.errFt,
    hold1G: vert0.hold1G,
    dz: vert0.dz,
  });
  const guard = probeActive
    ? {
        ...guardRaw,
        on: false,
        urgency: 0,
        bleedReq: 0,
        capOpenG: 0,
        cap: guardRaw.capNormal,
        omegaBounded: steer.omegaCmd,
        vertGBounded: vert0.vertG,
        aTurn: steer.aTurn0,
        hold: vert0.hold,
        vert: vert0,
        filterOn: false,
        filterEngaged: false,
        omPick: null,
      }
    : guardRaw;

  // Merge guard urgency (S36) and smooth cap opening (S40) into B13 (liftWithin) and B14 (shapeFwLift)
  const urgency = clamp01(Math.max(ref.urgency, guard.urgency));
  const capG = Math.max(guard.capNormal, guard.cap + ref.capChangeG);
  const composed = liftWithin(guard.aTurn, guard.hold, capG, st.bodyUp, guard.vert);
  const shaped = shapeFwLift(w.shapedG ?? st.g, composed.lift, urgency, STEP_SEC, W);
  const lift = shaped.lift;

  // Step B11 Power Law (S33) and B15 Plant (stepLead)
  const pw = powerFromRef(w, seen, job, st, guard, ref, arc.closing, leadKias);
  const cmdGDrag = { lift, g: shaped.shapedG, wantKias: pw.wantKias, idle: pw.idle, boards: pw.boards };
  const next = stepLead(st, { lift, roll: { ...ROLL, maxRateDps: W.rollDps }, ...pw.ask });

  const gAsk = len3(composed.lift);
  const { arcFt, dFt } = arc;
  const jobName = jobLabel(guard, picker, job);
  const pitch = ref.pitchOwner;
  const side = unit3(cross3(plane.out, u));
  const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
  const liftDir = len3(composed.lift) > 1e-9 ? unit3(composed.lift) : null;

  const ctl = {
    steerAngleDeg: r3(steer.terms.angleDeg),
    steerPG: r3(steer.terms.pG),
    steerFfG: r3(steer.terms.ffG),
    aimTurnDps: r3(steer.terms.aimTurnDps),
    aimTurnRawDps: r3(steer.terms.aimTurnRawDps),
    aimJumpFt: r3(steer.terms.aimJumpFt),
    turnAskG: r3(dot3(steer.aTurn0, side) / G_FTPS2),
    turnFlownG: r3(dot3(guard.aTurn, side) / G_FTPS2),
    turnGrantedG: r3(dot3(composed.lift, side)),
    turnWinner: guard.filterOn ? 'filter' : 'steer',
    capG: r3(capG),
    capBind: composed.capGaveWay !== 'none',
    capGaveWay: composed.capGaveWay,
    urgency: r3(urgency),
    onsetGps: r3(shaped.onsetGps),
    urp: Boolean(liftDir) && dot3(liftDir, st.bodyUp) < Math.cos(W.pullWithinDeg * DEG) - 1e-9,
    arcDssFt: r3(arcLoop.terms.dssFt),
    arcFfFt: r3(arcLoop.terms.ffFt),
    arcKcFt: r3(arcLoop.terms.kcFt),
    arcWantFt: r3(arcLoop.terms.wantFt),
    arcLimit: arcLoop.terms.limit,
    vertErrFt: r3(vert0.errFt),
    vertRateFtps: r3(vert0.terms.errRate),
    vertPG: r3(vert0.terms.pG),
    vertDG: r3(vert0.terms.dG),
    vertG: r3(guard.vertGBounded),
    vertLimit: vert0.terms.limit,
    powerKind: pw.terms.kind,
    powerPFtps: r3(pw.terms.pFtps),
    powerIFtps: r3(pw.terms.iFtps),
    powerBandClip: pw.terms.bandClip,
    guardOn: guard.on,
    filterOn: guard.filterOn,
    filterEngaged: guard.filterEngaged,
    leadG: r3(seen.leadG),
    phase: job.phase,
    caseLabel: job.caseLabel,
    techActive: picker.activeId,
    techWeightPath: r3(picker.weight.path),
    techWeightHeight: r3(picker.weight.height),
  };

  return {
    w: {
      ...w,
      st: next,
      sight: mem,
      guard,
      job,
      picker,
      t: w.t + STEP_SEC,
      offFt: arcLoop.offFt,
      idle: pw.idle,
      boards: pw.boards,
      shapedG: shaped.shapedG,
      activeRef: ref,
      lastJobName: jobName,
      lastChiOwnDeg: chiOwnDeg,
      lastChiWantedDeg: ref.chiWantedDeg,
      lastArcErrAbs: Math.max(Math.abs(arcLoop.eRange), eTrackFt),
      preProbeERange: probeActive ? w.preProbeERange : arcLoop.eRange,
      preProbeSpeedOffsetKt: probeActive ? w.preProbeSpeedOffsetKt : arcLoop.speedOffsetKt,
      cmdGDrag,
    },
    trace: {
      t: w.t + STEP_SEC,
      job: jobName,
      aim: ref.aimKind,
      offFt: Math.round(arcLoop.offFt),
      predFt: Math.round(guard.predFt),
      slant: seen.slant,
      closure: seen.closure,
      losDps: seen.losDps,
      aspectDeg: seen.aspectDeg,
      hcaDeg: seen.hcaDeg,
      heightTargetFt: Math.round(vert0.dz),
      wantKias: pw.wantKias,
      gAsk,
      overEstimate: guard.on && gAsk > guard.capNormal + 1e-6,
      cWantFtps: guard.on ? null : arcLoop.cWant,
      cActualFtps: arcLoop.cActual,
      low: job.low,
      sFt: arcFt == null ? null : Math.round(arcFt),
      dFt: dFt == null ? null : Math.round(dFt),
      pitchOwner: pitch,
      lineShort: guard.lineShort,
      passFt: guard.passFt == null ? null : Math.round(guard.passFt),
      yoyoFt: null,
      omNomDps: guard.omNom,
      omPickDps: guard.omPick,
      brakes: pw.boards ? (pw.idle ? 'IDLE + BOARDS' : 'BOARDS') : pw.idle ? 'IDLE' : null,
      capGaveWay: composed.capGaveWay,
      cmdGDrag,
      ctl,
    },
  };
}

