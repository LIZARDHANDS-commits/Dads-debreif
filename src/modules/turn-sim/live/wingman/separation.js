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
  let least = d0;
  let prevD = d0;
  let tPassSec = 0;
  let horiz = Math.hypot(pa.x - pb.x, pa.y - pb.y);
  let behind = -dot3(sub3(pb, pa), va) / Math.max(len3(va), 1e-9);
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
      behind = Math.min(behind, -dot3(sub3(pbH, pa), va) / Math.max(len3(va), 1e-9));
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
  const choose = (ok) => {
    let best = null;
    for (const c of cands) {
      if (!ok(c)) continue;
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
      if (ok(predFor(mid, vertGBounded))) lo = mid;
      else hi = mid;
    }
    return { om: lo, sideK: best.sideK };
  };

  let pick = choose((c) => passOk(c) && lineOk(c));
  let lineShort = false;
  if (!pick) {
    lineShort = !cands.some(lineOk);
    pick = passOk(nom) ? { om: omegaCmd, sideK: 0, free: true } : choose(passOk);
  }
  const cleared = Boolean(pick);
  const lagRescue =
    !pick && turning && insideK
      ? choose((c) => c.pass >= FG.hardFloorFt && (Math.sign(c.om - omegaCmd) || 1) !== insideK)
      : null;
  if (lagRescue) pick = lagRescue;
  const om = pick ? pick.om : cands.reduce((x, c) => (c.pass > x.pass ? c : x)).om;
  return { pick, om, lineShort, cleared };
}

/**
 * One step of B12 (Separation Guard, Spec 7e §7.6):
 *  - Runs one closing-pass predictor up to 10 s on raw demands (omegaCmd S31, vertGCmd S32) from achieved state (ownP, ownV)
 *    against dead-reckoned Lead (leadNow, leadV) with extrapolated bank turn rate (S03, S05) and 1.3x tighter inside 550 ft.
 *  - Completely silent at or above 600 ft when behind the wing line.
 *  - Inside 600 -> 500 ft: cubic barrier x = clip((600 - p)/100, 0, 1), urgency u_guard = x^3 (2 s decay, S36), graded bleed
 *    request S39, smooth cap opening S40 (550 -> 500 ft), least-change vertical escape bound S38 (below unless > 100 ft high,
 *    D16), and least-change horizontal turn bound S37 with side choice S41 held >= 3 s.
 */
export function stepFwGuard(prev, sit, raw) {
  const g0 = prev ?? startFwGuard();
  const { seen, st, turning, out, u, V, ownP, ownV, leadNow, leadV } = sit;
  const { omegaCmd, vertGCmd, vertErrFt = 0, hold1G } = raw;
  const horizon = FG.lookSec;
  const leadAsIs = { p: leadNow, v: leadV, omega: seen.turn.omega };
  const leadTighter = { p: leadNow, v: leadV, omega: scale3(seen.turn.omega, FG.tighter) };
  const thenSec = 2.5;

  const predFor = (om, vg) => {
    const me = { p: ownP, v: ownV, omega: scale3(out, om), thenSec };
    const maxFt = Math.max(Math.abs(vertErrFt), Math.abs(vg - vertGCmd) > 1e-4 ? 250 : 0);
    const extra = maxFt > 1e-3 ? { acc: scale3(out, vg * G_FTPS2), maxFt } : null;
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
  const predFt = Math.min(nom.pass, seen.slant);
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

  // Vertical escape bound S38 (D16): below by default unless already > 100 ft high (W.yoyo.highFt)
  let vertGBounded = vertGCmd;
  if (x > 0 && (seen.closure > 0 || predFt < FG.minFt)) {
    const vertSign = seen.heightFt > W.yoyo.highFt ? 1 : -1;
    const escapeG = vertSign * Math.min(W.vertMaxG, 1.0 * x3 + (predFt < FG.minFt ? 0.4 : 0));
    vertGBounded = vertSign < 0 ? Math.min(vertGCmd, escapeG) : Math.max(vertGCmd, escapeG);
  }

  // Horizontal turn-rate bound S37 with side choice S41 held >= 3 s
  const nomWithVert = vertGBounded !== vertGCmd ? predFor(omegaCmd, vertGBounded) : nom;
  const lineShortRaw = !lineOk(nomWithVert);
  const needTurnBound = nomWithVert.pass < FG.minFt || lineShortRaw;
  let omegaBounded = omegaCmd;
  let filterOn = false;
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
      // Blend toward searched turn rate by max(x^3, lineShortRaw ? 1 : 0), hard-bounded at <= 500 ft
      const blendTurn = predFt <= FG.minFt || lineShortRaw ? 1 : clamp01(x3 * 2);
      omegaBounded = omegaCmd + blendTurn * (searched.om - omegaCmd);
      filterOn = Math.abs(omegaBounded - omegaCmd) > 1e-4;
      if (searched.pick?.sideK && searched.pick.sideK !== sideChoice) {
        sideChoice = searched.pick.sideK;
        sideHoldSec = FG.sideHoldSec;
      } else if (filterOn && sideChoice) {
        sideHoldSec = FG.sideHoldSec;
      }
    }
  } else if (sideHoldSec <= 0) {
    sideChoice = 0;
  }

  const sideVec = unit3(cross3(out, u));
  const aTurn = scale3(sideVec, omegaBounded * V);
  const aV = scale3(out, vertGBounded * G_FTPS2);
  const vertVec = scale3(perp3(aV, u), 1 / G_FTPS2);
  const hold = add3(hold1G, vertVec);
  const on = x > 0 || filterOn;
  const filterPull = Math.hypot(1, (omegaBounded * V) / G_FTPS2) > seen.leadG + W.overLeadG;

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
    cap: capNormal + (filterPull ? capMax - capNormal : capOpenG),
    omegaBounded,
    vertGBounded,
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

