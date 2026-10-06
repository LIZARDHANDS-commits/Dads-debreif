// The pursuit curves #2 flies in a fighting wing turn (TS-100; Patrick 6 Oct 2026 00:35Z: "#2 makes their spacing worse by
// flying well outside the turn circle instead of capturing it quickly by turning into it"; 00:37Z: "look at the SMM
// pictures of how fighting wing turns work depending on your spacing").
//
// SMM 12.29 para 69 and 12.30 paras 71-73, Figs 12.20-12.22 (turn entry in position, stretched, tight), Fig 12.23 (turn
// exit): once Lead manoeuvres, #2 collapses to Lead's six on his turn circle with lead, lag and pure pursuit. Turned away
// from, he aims inside the turn circle at once (lead pursuit), which stops the range growing and starts closure; in
// position he captures the circle by matching Lead's turn (pure pursuit); tight, he makes the miss with lag pursuit (the
// vertical miss is not built: decisions.md TS-100).
//
// Until V2.96 #2 flew these turns on the tracker's station-keeping law (match the speed of a point fixed in Lead's frame,
// nudge toward the six at the closure law's rate). On the outside of a 60° turn that point runs at about 280 kt true,
// so from the back of the cone #2 chased it round the outside to 1,245 ft (Fable's dry runs, 6 Oct,
// turn-sim-review/fw-turn-entry/fw-turn-entry.md). This law replaces it while Lead is banked: each step #2's commanded
// heading is the tangent of the circle he is on about Lead's turn centre (matching Lead's turn), plus a lead angle toward
// the centre when he is stretched or outside the circle and a lag angle away from it when he is tight. The tracker's own
// heading and speed loops, bank cap and flight step fly the command (tracker.js, a phase with `pursuit`), so the path is
// recorded and replayed like every other 2-ship move. Numbers: tuning.js FW_PURSUIT (estimates unless a page is named).
import { G_FTPS2 } from '../../../core/units.js';
import { DEG } from './manoeuvres.js';
import { FW_PURSUIT, FW_BUBBLE } from './tuning.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * The command for one step: { psiCmd, kiasCmd } in the tracker's terms, or null when the aircraft flown off is not
 * turning (the tracker's band goal then flies #2 back into the cone: formation-turns.js fwGoal, Fig 12.23).
 * L: the aircraft flown off (Lead, or the one ahead in the 4-ship) at this step; W: this wingman; plannedBankDeg: the bank
 * Lead's plan turns at, signed (+ left), so the pursuit starts at the press while he is still rolling in, or null.
 */
export function fwPursuitCommand(L, W, plannedBankDeg = null) {
  const P = FW_PURSUIT;
  // The turn #2 flies against: Lead's bank now, or the plan's while he rolls in to it.
  let bank = L.bankDeg;
  if (plannedBankDeg != null && Math.abs(plannedBankDeg) > Math.abs(bank) && Math.sign(plannedBankDeg) === (Math.sign(bank) || Math.sign(plannedBankDeg))) bank = plannedBankDeg;
  if (Math.abs(bank) < P.minBankDeg) return null;
  const s = Math.sign(bank); // +1 a left turn (heading grows), -1 right
  const radiusFt = L.tasFtps ** 2 / (G_FTPS2 * Math.tan(Math.abs(bank) * DEG));
  // Lead's turn centre, off his left or right wing.
  const cx = L.xFt - s * Math.sin(L.headingRad) * radiusFt;
  const cy = L.yFt + s * Math.cos(L.headingRad) * radiusFt;
  const ux = W.xFt - cx;
  const uy = W.yFt - cy;
  const rho = Math.hypot(ux, uy); // #2's own radius about that centre
  // The tangent of #2's circle about the centre, in Lead's turn sense: matching Lead's turn (pure pursuit on the circle).
  const psiTan = Math.atan2(s * ux, -s * uy);
  // Where #2 is against the aim point, Lead's six on the circle at the aim range: the arc he is ahead of it (+) or behind
  // it (-), ft, from the angles about the centre; and how far outside (+) or inside (-) the circle he is.
  const aimAngle = P.aimRangeFt / radiusFt; // the aim point's angle behind Lead about the centre
  const leadAngle = Math.atan2(L.yFt - cy, L.xFt - cx);
  const wingAngle = Math.atan2(uy, ux);
  let behind = s * (leadAngle - wingAngle); // #2's angle behind Lead about the centre, in the turn's sense
  behind = ((behind + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  const aheadFt = (aimAngle - behind) * radiusFt;
  const outsideFt = rho - radiusFt;
  // The angle off the tangent, toward the centre (+) or away from it (-): aim inside the circle when behind the aim point
  // or outside the circle (the SMM's lead), aim outside it when ahead or inside (the SMM's lag); on the aim point, none:
  // #2 matches Lead's turn (Figs 12.20-12.22).
  // Outside the circle (turned away from) and ahead of the aim point, #2 is tight: he holds the bigger circle he is on
  // (aiming at Lead's tail, Fig 12.22), and the extra distance opens the range; no angle away from the centre there.
  const arc = clamp(aheadFt / P.arcScaleFt, -1, 1);
  const arcEff = outsideFt > 0 ? Math.min(0, arc) : arc;
  const arcDeg = -arcEff * (arcEff < 0 ? P.leadMaxDeg : P.lagMaxDeg);
  const offDeg = arcDeg + clamp(outsideFt / P.circleScaleFt, -1, 1) * P.circleDeg;
  const psiCmd = psiTan + s * offDeg * DEG;
  // Power last (Patrick 5 Oct 23:02Z): a little speed with the arc error, inside the fighting wing overtake.
  const kiasCmd = L.kias - clamp(aheadFt / P.arcScaleFt, -1, 1) * P.closeKias;
  return { psiCmd, kiasCmd };
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Where #2 and L will be over the next horizonSec if L keeps his present turn and #2 turns onto heading psi at
 * turnRateDegS, then flies straight: the least range and the last. A steady turn for L and a straight line for #2: an
 * estimate, refreshed every step.
 */
function predict(L, W, psi, horizonSec = FW_BUBBLE.horizonSec) {
  const B = FW_BUBBLE;
  const omegaL = (G_FTPS2 * Math.tan(L.bankDeg * DEG)) / Math.max(L.tasFtps, 1); // + left, heading grows
  const wMax = B.turnRateDegS * DEG;
  const dt = B.stepSec;
  let [lx, ly, lh] = [L.xFt, L.yFt, L.headingRad];
  let [wx, wy, wh] = [W.xFt, W.yFt, W.headingRad];
  let least = Infinity;
  let last = 0;
  for (let t = dt; t <= horizonSec + 1e-9; t += dt) {
    lh += omegaL * dt;
    lx += L.tasFtps * Math.cos(lh) * dt;
    ly += L.tasFtps * Math.sin(lh) * dt;
    wh += clamp(wrap(psi - wh), -wMax * dt, wMax * dt);
    wx += W.tasFtps * Math.cos(wh) * dt;
    wy += W.tasFtps * Math.sin(wh) * dt;
    last = Math.hypot(wx - lx, wy - ly);
    least = Math.min(least, last);
  }
  return { least, last };
}

/**
 * The fighting wing bubble (TS-132, TS-134; tuning.js FW_BUBBLE; Patrick 15:32Z: "If far and lead turns away assertive
 * pull of lead pursuit to stay within 1000"): wraps a step's command through a turn, its entry and its exit. base: the
 * pursuit's command for this step, or null (the tracker's band goal flies it). Each step #2 looks horizonSec ahead
 * (predict); if the heading he is flying to would take him past 1,000 ft less marginFt, he takes the nearest heading that
 * keeps him in (toward where Lead is going: lead pursuit) without closing inside 500 ft plus marginFt, and adds up to
 * closeKias of power. With no heading that works, the one that misses least. Returns { psiCmd, kiasCmd } or base.
 * The inner edge first (TS-134): closing across inside 500 ft plus marginFt within tightHorizonSec, he keeps the heading
 * and dives away under Lead (belowFt; the tracker flies the height). Vertical first, then heading, then power.
 */
export function fwBubbleCommand(L, W, base) {
  const B = FW_BUBBLE;
  const psi0 = base?.psiCmd ?? W.headingRad;
  const lo = B.minFt + B.marginFt;
  const hi = B.maxFt - B.marginFt;
  const miss = (p) => Math.max(0, p.last - hi) + Math.max(0, lo - p.least);
  // The inner edge (TS-134): closing across inside 500 ft, he rolls and dives away below Lead (Patrick 15:56Z, 15:57Z), the
  // height that keeps the slant range; his heading and power stay the pursuit's (or the band goal's).
  const near = predict(L, W, psi0, B.tightHorizonSec);
  if (near.least < lo) {
    const belowFt = Math.min(B.maxBelowFt, Math.sqrt(lo * lo - near.least * near.least));
    return { psiCmd: psi0, kiasCmd: base?.kiasCmd ?? null, belowFt, keepBase: !base };
  }
  const p0 = predict(L, W, psi0);
  if (p0.last <= hi) return base;
  let best = { psi: psi0, p: p0, m: miss(p0) };
  for (let k = 1; k * B.searchStepDeg <= 180 && best.m > 0; k++) {
    for (const sgn of [1, -1]) {
      const psi = psi0 + sgn * k * B.searchStepDeg * DEG;
      const p = predict(L, W, psi);
      const m = miss(p);
      if (m < best.m - 1e-6) best = { psi, p, m };
    }
  }
  const share = clamp((best.p.last - hi) / B.marginFt + 0.5, 0, 1);
  return { psiCmd: best.psi, kiasCmd: (base?.kiasCmd ?? L.kias) + B.closeKias * share };
}
