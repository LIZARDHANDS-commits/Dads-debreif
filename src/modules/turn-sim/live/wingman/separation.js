// Fighting wing's separation guard as a cubic barrier (B12, Spec 7e §7.6; TS-233, TS-234; Fable D3, D16, R8, R9).
// Where it fits: sits after the control loops (B09 steering writing S31 ω_cmd, B10 vertical writing S32 ΔG_v) and before
// B13 (liftWithin), B14 (shaper), and B11 (power), while feeding predicted pass S35 (p, t_pass) to B06 (techniques/miss.js).
// Exports: leastPass, startFwGuard, stepFwGuard.
// Does not: run a second predictor, cut throttle to 20% on a timer (R9), or switch pitch owners directly (R8).
import { DEG } from '../../../../core/angles.js';
import { G_FTPS2 } from '../../../../core/units.js';
import { availableG, shakerG } from '../../../../core/t6-performance.js';
import { STEP_SEC } from '../flight.js';
import { FW_WING } from '../wing-moves.js';
import { add3, sub3, scale3, cross3, unit3, perp3, dot3, len3 } from '../attitude.js';

const W = FW_WING;
const FG = FW_WING.guard;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x) => clamp(x ?? 0, 0, 1);

/**
 * Single closing-pass predictor (S35): integrates over the closing part of the trajectory up to horizonSec (10 s) in
 * lookStepSec (0.1 s) steps between Lead (a) and #2 (b). When b.thenSec is given, #2 holds his turn for thenSec and then
 * captures Lead's turn (SMM 12.29 Fig 12.20). extra, when given, counts #2's vertical demand { acc, maxFt } in the 3D slant.
 * Stops updating the closest pass once a closing minimum has been passed and range has opened by > 50 ft, so a turn half a
 * circle later does not falsely trigger the barrier. Returns { leastFt, tPassSec, horizFt, behindLeastFt }.
 */
export function leastPass(a, b, horizonSec = FG.lookSec, extra = null) {
  let [pa, va, pb, vb] = [a.p, a.v, b.p, b.v];
  const d0 = len3(sub3(pa, pb));
  const dz0 = pb.z - pa.z;
  const targetDz = b.targetDz;
  let least = d0;
  let prevD = d0;
  let tPassSec = 0;
  let horiz = Math.hypot(pa.x - pb.x, pa.y - pb.y);
  const behindAlong = (pLead, pWing, vLead) => {
    const vhLen = Math.hypot(vLead.x, vLead.y);
    if (vhLen > 1e-6) {
      return -((pWing.x - pLead.x) * vLead.x + (pWing.y - pLead.y) * vLead.y) / vhLen;
    }
    return -dot3(sub3(pWing, pLead), vLead) / Math.max(len3(vLead), 1e-9);
  };
  let behind = behindAlong(pa, pb, va);
  const accLen = extra ? len3(extra.acc) : 0;
  const accDir = accLen > 1e-9 ? scale3(extra.acc, 1 / accLen) : null;
  const dt = FG.lookStepSec;
  let passedMin = false;

  for (let t = dt; t <= horizonSec + 1e-9; t += dt) {
    const va2 = add3(va, scale3(cross3(a.omega, va), dt));
    const omB = b.thenSec != null && t > b.thenSec + 1e-9 ? a.omega : b.omega;
    const vb2 = add3(vb, scale3(cross3(omB, vb), dt));
    const ka = len3(va) / Math.max(len3(va2), 1e-9);
    const kb = len3(vb) / Math.max(len3(vb2), 1e-9);
    pa = add3(pa, scale3(add3(va, scale3(va2, ka)), dt / 2));
    pb = add3(pb, scale3(add3(vb, scale3(vb2, kb)), dt / 2));
    va = scale3(va2, ka);
    vb = scale3(vb2, kb);
    if (targetDz != null && Math.abs(dz0 - targetDz) > 5) {
      const dzNow = pb.z - pa.z;
      if ((dz0 - targetDz) * (dzNow - targetDz) <= 0) {
        pb = { x: pb.x, y: pb.y, z: pa.z + targetDz };
        vb = { x: vb.x, y: vb.y, z: va.z };
      }
    }
    const pbH = accDir ? add3(pb, scale3(accDir, Math.min(extra.maxFt, 0.5 * accLen * t * t))) : pb;
    const d = len3(sub3(pa, pbH));
    if (!passedMin && d < least) {
      least = d;
      tPassSec = t;
      horiz = Math.hypot(pa.x - pbH.x, pa.y - pbH.y);
    } else if (t >= 1.5 && d > prevD + 0.5) {
      passedMin = true;
    }
    prevD = d;
    if (!passedMin) {
      behind = Math.min(behind, behindAlong(pa, pbH, va));
    }
  }
  return { leastFt: least, tPassSec, horizFt: horiz, behindLeastFt: behind };
}

/** Initial B12 guard state: off and silent. */
export function startFwGuard() {
  return {
    on: false,
    predFt: Infinity,
    tPassSec: FG.lookSec,
    horizFt: Infinity,
    behindLeastFt: Infinity,
    urgency: 0,
    bleedReq: 0,
    capOpenG: 0,
    sideChoice: 0,
    sideHoldSec: 0,
    dOmBounded: 0,
  };
}

const lineOk = (p) => p.behind >= FG.wingLineFt;

/**
 * Searches candidate horizontal turn rates in the turn plane when the raw demand violates the 500 ft bubble or 100 ft wing
 * line, choosing the least-change turn rate on the held side (S41, sideHoldSec = 3 s) and preferring the lag side in a turn.
 */
function searchTurnBound(sit, hold1G, vertGBounded, predFor, nom, omegaCmd, targetPassFt, lastSide, sideHoldSec) {
  const { seen, st, turning, out, V } = sit;
  const passOk = (c) => c.pass >= targetPassFt;
  const gMost = Math.min(shakerG(st.kias), Math.max(seen.leadG + W.overLeadG, availableG(st.kias)));
  const gHold = len3(hold1G);
  const omMax = (G_FTPS2 * Math.sqrt(Math.max(0, gMost * gMost - gHold * gHold))) / V;
  const N = FG.filterSteps;
  const cands = [];
  for (let k = -N; k <= N; k++) {
    const om = (omMax * k) / N;
    cands.push({ om, ...predFor(om, vertGBounded) });
  }
  const insideK = Math.sign(dot3(seen.turn.omega, out)) || 0;
  const sidePenalty = lastSide && sideHoldSec > 0 ? 1.5 * omMax : omMax;
  const intoTurn = Boolean(sit.job?.into);
  const allowedInto = (c) => {
    if (!intoTurn) return true;
    // Never turn tighter into Lead's turn than omegaCmd when inside on an into-turn (R14)
    if (insideK && (c.om - omegaCmd) * insideK > 1e-4) return false;
    return true;
  };
  const choose = (ok) => {
    let best = null;
    for (const c of cands) {
      if (!allowedInto(c) || !ok(c)) continue;
      const sideK = Math.sign(c.om - omegaCmd) || 1;
      const lagPenalty = turning && insideK && sideK === insideK ? 2 * omMax : 0;
      const cost = Math.abs(c.om - omegaCmd) + (lastSide && sideK !== lastSide ? sidePenalty : 0) + lagPenalty;
      if (!best || cost < best.cost) best = { ...c, cost, sideK };
    }
    if (!best) return null;
    let lo = best.om;
    let hi = best.om - best.sideK * (omMax / N);
    for (let r = 0; r < FG.filterRefine; r++) {
      const mid = (lo + hi) / 2;
      const pMid = predFor(mid, vertGBounded);
      if (allowedInto({ om: mid }) && ok(pMid)) lo = mid;
      else hi = mid;
    }
    return { om: lo, sideK: best.sideK };
  };

  const enforceLine = !intoTurn;
  let pick = enforceLine ? choose((c) => passOk(c) && lineOk(c)) : null;
  let lineShort = false;
  if (!pick) {
    lineShort = enforceLine && !cands.some(lineOk);
    pick = passOk(nom) ? { om: omegaCmd, sideK: 0, free: true } : choose(passOk);
  }
  const cleared = Boolean(pick);
  const lagRescue =
    !pick && turning && insideK
      ? choose((c) => c.pass >= FG.hardFloorFt && (Math.sign(c.om - omegaCmd) || 1) !== insideK)
      : null;
  if (lagRescue) pick = lagRescue;
  const fallbackPool = cands.filter(allowedInto);
  const pool = fallbackPool.length > 0 ? fallbackPool : cands;
  const om = pick ? pick.om : pool.reduce((x, c) => (c.pass > x.pass ? c : x)).om;
  return { pick, om, lineShort, cleared };
}

/**
 * One step of B12 (Separation Guard, Spec 7e §7.6):
 *  - Runs one closing-pass predictor up to 10 s on raw demands (omegaCmd S31, vertGCmd S32) from achieved state (ownP, ownV)
 *    against dead-reckoned Lead (leadNow, leadV) with extrapolated bank turn rate (S03, S05) and 1.3x tighter inside 550 ft.
 *  - Completely silent at or above 600 ft when behind the wing line.
 *  - Inside 600 -> 500 ft: cubic barrier x = clip((600 - p)/100, 0, 1), urgency u_guard = x^3 (2 s decay, S36), graded bleed
 *    request S39, smooth cap opening S40 (550 -> 500 ft), least-change vertical escape bound S38 (below unless more than 100 ft high,
 *    D16), and least-change horizontal turn bound S37 with side choice S41 held >= 3 s.
 */
export function stepFwGuard(prev, sit, raw) {
  const g0 = prev ?? startFwGuard();
  const { seen, st, turning, out, u, V, ownP, ownV, leadNow, leadV } = sit;
  const { omegaCmd, vertGCmd, vertErrFt = 0, hold1G } = raw;
  // In wings-level flight inside the cone, or when stretched (> 680 ft) in an away turn, limit look-ahead so
  // constant-rate extrapolation of a gentle crab or lead-pursuit catch-up from 980 ft does not trigger a false pass alarm.
  const levelStableInCone =
    !turning &&
    seen.slant >= FG.minFt &&
    seen.sweepDeg >= 20 &&
    seen.slant - Math.max(0, seen.closure) * 2.5 >= FG.minFt;
  const stretchedAway = turning && !sit.job?.into && seen.slant > 680;
  const horizon = levelStableInCone ? 2.5 : stretchedAway ? 3.5 : FG.lookSec;
  const leadAsIs = { p: leadNow, v: leadV, omega: seen.turn.omega };
  const leadTighter = { p: leadNow, v: leadV, omega: scale3(seen.turn.omega, FG.tighter) };
  const thenSec = 2.5;
  const vertSign = seen.heightFt > W.yoyo.highFt ? 1 : -1; // below unless already more than 100 ft above Lead (TS-233)

  const predFor = (om, vg) => {
    const me = { p: ownP, v: ownV, omega: scale3(out, om), thenSec, targetDz: raw.dz ?? W.stackFt };
    const vgAway = vg * vertSign > 0.05 ? vg : 0;
    const maxFt = !levelStableInCone && vgAway !== 0 ? Math.max(Math.abs(vertErrFt), Math.abs(vgAway) > 0.12 || Math.abs(vg - vertGCmd) > 1e-4 ? 220 : 0) : 0;
    const extra = maxFt > 1e-3 ? { acc: scale3(out, vgAway * G_FTPS2), maxFt } : null;
    const a = leastPass(leadAsIs, me, horizon, extra);
    if (a.leastFt >= FG.capOpenStartFt) {
      return { pass: a.leastFt, rawLeastFt: a.leastFt, tPassSec: a.tPassSec, horizFt: a.horizFt, behind: a.behindLeastFt };
    }
    const b = leastPass(leadTighter, me, horizon, extra);
    const tighterMargin = FG.capOpenStartFt - FG.minFt; // 50 ft buffer when < 550 ft
    return {
      pass: Math.min(a.leastFt, b.leastFt + tighterMargin),
      rawLeastFt: a.leastFt,
      tPassSec: a.leastFt <= b.leastFt + tighterMargin ? a.tPassSec : b.tPassSec,
      horizFt: a.horizFt,
      behind: a.behindLeastFt,
    };
  };

  const nom = predFor(omegaCmd, vertGCmd);
  const rawPredFt = Math.min(nom.pass, seen.slant);
  const predFt = levelStableInCone && nom.behind >= FG.wingLineFt ? Math.max(rawPredFt, FG.taperStartFt) : rawPredFt;
  const tPassSec = seen.slant < nom.pass ? 0 : nom.tPassSec;

  // Cubic barrier x in [0, 1] over 600 -> 500 ft
  const spanFt = Math.max(FG.taperStartFt - FG.minFt, 1);
  const x = clamp01((FG.taperStartFt - predFt) / spanFt);
  const x3 = x * x * x;

  // Guard urgency S36: rises at once to x^3, decays over urgencyDecaySec (2 s)
  const prevU = g0.urgency ?? 0;
  const urgency = x3 >= prevU ? x3 : Math.max(x3, prevU - STEP_SEC / Math.max(FG.urgencyDecaySec, 1e-6));

  // Graded bleed request S39: proportional to x^3 when closing (or inside 500 ft)
  const bleedReq = seen.closure > 0 || predFt < FG.minFt ? clamp01(x3 * (1 + clamp01(seen.closure / 40))) : 0;

  // Smooth G-cap opening S40 over 550 -> 500 ft
  const capNormal = Math.min(seen.leadG + W.overLeadG, shakerG(st.kias));
  const capMax = Math.max(capNormal, Math.min(availableG(st.kias), shakerG(st.kias)));
  const capFrac = clamp01((FG.capOpenStartFt - predFt) / Math.max(FG.capOpenStartFt - FG.minFt, 1));
  const capOpenG = capFrac * (capMax - capNormal);

  // Vertical escape bound S38 (D16): High (> 0 ft) pulls up and over (+1); Mid (-50 ft) & Low (-200 ft) unload under (-1),
  // faded to 0 once |heightFt| >= 210 ft so guard never fights return-to-stack in a limit cycle.
  const vertClearFade = clamp01((210 - Math.abs(seen.heightFt)) / 70);
  const closeShare = predFt < FG.minFt ? 1 : clamp01(seen.closure / 15);
  const intoBoost = sit.job?.into ? 0.45 * x : 0;
  const wEsc = vertClearFade * clamp01((x * x + intoBoost) * closeShare);
  const rawEscapeMag = vertClearFade * Math.min(W.vertMaxG, 1.0 * x3 + intoBoost + (predFt < FG.minFt ? 0.4 : 0));
  const escapeG = vertSign > 0 ? rawEscapeMag : -Math.min(0.45, rawEscapeMag);
  const targetVertG = vertSign < 0 ? Math.min(vertGCmd, escapeG) : Math.max(vertGCmd, escapeG);
  const vertGBounded = vertGCmd + wEsc * (targetVertG - vertGCmd);

  // Horizontal turn-rate bound S37 with side choice S41 held >= 3 s and smooth turn-offset slew
  const nomWithVert = vertGBounded !== vertGCmd ? predFor(omegaCmd, vertGBounded) : nom;
  const lineShortRaw = !sit.job?.into && !lineOk(nomWithVert);
  const closeEnoughForTurnBound = seen.slant < 660 || (nomWithVert.tPassSec <= 2.5 && seen.closure > 15);
  const needTurnBound = !levelStableInCone && !sit.job?.into && closeEnoughForTurnBound && (nomWithVert.pass < FG.minFt || lineShortRaw);
  let wantDOm = 0;
  let lineShort = false;
  let cleared = true;
  let sideChoice = g0.sideChoice ?? 0;
  let sideHoldSec = Math.max(0, (g0.sideHoldSec ?? 0) - STEP_SEC);

  if (needTurnBound) {
    const targetPassFt = FG.minFt;
    const searched = searchTurnBound(sit, hold1G, vertGBounded, predFor, nomWithVert, omegaCmd, targetPassFt, sideChoice, sideHoldSec);
    lineShort = searched.lineShort;
    cleared = searched.cleared;
    if (!searched.pick?.free) {
      const blendTurn = predFt <= FG.minFt || lineShortRaw ? 1 : clamp01(x3 * 2);
      wantDOm = blendTurn * (searched.om - omegaCmd);
      if (searched.pick?.sideK && searched.pick.sideK !== sideChoice) {
        sideChoice = searched.pick.sideK;
        sideHoldSec = FG.sideHoldSec;
      } else if (Math.abs(wantDOm) > 1e-4 && sideChoice) {
        sideHoldSec = FG.sideHoldSec;
      }
    }
  } else if (sideHoldSec <= 0) {
    sideChoice = 0;
  }

  // Slew the guard filter's turn-rate modification smoothly so it cannot snap bank back and forth across steps
  const prevDOm = g0.dOmBounded ?? 0;
  const maxDOmStep = (wantDOm !== 0 ? 0.35 : 0.25) * STEP_SEC;
  const dOmBounded = prevDOm + clamp(wantDOm - prevDOm, -maxDOmStep, maxDOmStep);
  const omegaBounded = omegaCmd + dOmBounded;
  const filterOn = Math.abs(dOmBounded) > 1e-3;

  const sideVec = unit3(cross3(out, u));
  const aTurn = scale3(sideVec, omegaBounded * V);
  const aV = scale3(out, vertGBounded * G_FTPS2);
  const vertVec = scale3(perp3(aV, u), 1 / G_FTPS2);
  const hold = add3(hold1G, vertVec);
  const on = x > 0 || filterOn;
  const filterExtraFrac = filterOn ? clamp01(Math.abs(dOmBounded) / 0.08) : 0;
  const effCapOpenG = Math.max(capOpenG, filterExtraFrac * (capMax - capNormal));

  return {
    on,
    predFt,
    tPassSec,
    horizFt: nom.horizFt,
    behindLeastFt: nom.behind,
    urgency,
    bleedReq,
    capOpenG,
    capNormal,
    cap: capNormal + effCapOpenG,
    omegaBounded,
    vertGBounded,
    dOmBounded,
    aTurn,
    hold,
    vert: { dz: raw.dz, errFt: vertErrFt, aV, hold, hold1G, vertVec, vertG: vertGBounded },
    sideChoice,
    sideHoldSec,
    filterOn,
    filterEngaged: on,
    lineShort,
    cleared,
    passShort: predFt < FG.minFt,
    passFt: nom.pass,
    omNom: omegaCmd / DEG,
    omPick: filterOn ? omegaBounded / DEG : null,
  };
}

