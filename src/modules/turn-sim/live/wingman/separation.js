// Fighting wing's safety layer on the live wingman (B5; spec 7e.7, TS-233): the separation guard and the separation filter,
// a geometric predictor with priority and hysteresis, not a PID (Fable F1, F16). 500 ft is slant range (Patrick 14 Oct
// 2026; TS-208's 500 ft minimum): what both work to and never plan inside; a brief kiss inside it while he corrects firmly
// is fine (TS-233). No Terminate: Lead never waits for #2 (Patrick 14 Oct 2026).
//
//  - leastPass, the predictor: the least slant range between Lead and #2 over a look ahead, each holding his turn (#2 may
//    then capture Lead's turn), and how far #2 stays behind Lead's wing line.
//  - fwGuard: from what he sees (0.4 s late), Lead as he is and one step tighter against #2's own present turn. Engaged
//    while the predicted pass is under engageFt (600 ft) or the range now under 500 ft, released over releaseFt (700 ft)
//    held releaseSec (3 s). While engaged: pass-clear's depth (missFt), the power loop's integral held, the aim not
//    blended, and the G cap opened to what the aircraft gives while the pass is inside 500 ft (flagged).
//  - separationFilter: the turn his aim asks for is flown unless the pass it predicts comes inside the pass line (500 ft
//    plus 1.4 s of the closure he sees, never under 600 ft) or brings him within 100 ft of Lead's wing line; then the turn
//    nearest it that keeps both, searched from no turn to his most and refined. When both can't hold, range wins (the pass
//    line). Once engaged it stays engaged until his aim's own turn clears both by 50 ft for 1 s.
// The tidy of 14 Oct 2026 (plan T29t) moved them here from supervisor.js and fighting-wing.js, flying unchanged. Their
// history is in `Pat's claude work/formation-review-12oct/fighting-wing-code-history.md`.
//
// Frames and units: feet, seconds, x east, y north, z up; turn rates rad/s as vectors (axis times rate); G. Memory is never
// changed in place. Numbers: wing-moves.js FW_WING.guard (and FW_WING's G and look-ahead numbers).
import { DEG } from '../../../../core/angles.js';
import { G_FTPS2 } from '../../../../core/units.js';
import { availableG, shakerG } from '../../../../core/t6-performance.js';
import { STEP_SEC } from '../flight.js';
import { FW_SEE, FW_WING } from '../wing-moves.js';
import { add3, sub3, scale3, cross3, unit3, perp3, dot3, len3 } from '../attitude.js';

const W = FW_WING;
const FG = FW_WING.guard;

/**
 * The least slant range over the next horizonSec between two aircraft each holding its turn: p, v (ft, ft/s) and omega
 * (rad/s, the turn's axis times its rate) for each; b.thenSec, when given: b holds its turn that long, then turns as a does
 * (his capture of a's turn, SMM 12.29 Fig 12.20). extra, when given: b's vertical demand as a known term (Fable F3), { acc
 * (ft/s², a vector), maxFt (how far it moves him at most, his height error) }, its height added to b's place so the slant
 * counts it. Integrated in lookStepSec steps, a turn held as the velocity turned by omega x v (standard kinematics).
 * Returns { leastFt, horizFt (the horizontal range at that moment), behindLeastFt (the least distance b stays behind a's
 * wing line, along a's path, + behind; Fable F6) }.
 */
export function leastPass(a, b, horizonSec, extra = null) {
  let [pa, va, pb, vb] = [a.p, a.v, b.p, b.v];
  let least = len3(sub3(pa, pb));
  let horiz = Math.hypot(pa.x - pb.x, pa.y - pb.y);
  let behind = -dot3(sub3(pb, pa), va) / Math.max(len3(va), 1e-9);
  const accLen = extra ? len3(extra.acc) : 0;
  const accDir = accLen > 1e-9 ? scale3(extra.acc, 1 / accLen) : null;
  const dt = FG.lookStepSec;
  for (let t = dt; t <= horizonSec + 1e-9; t += dt) {
    // half-step turns keep the speed while turning (midpoint)
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
    if (d < least) {
      least = d;
      horiz = Math.hypot(pa.x - pbH.x, pa.y - pbH.y);
    }
    behind = Math.min(behind, -dot3(sub3(pbH, pa), va) / Math.max(len3(va), 1e-9));
  }
  return { leastFt: least, horizFt: horiz, behindLeastFt: behind };
}

/** The guard at the start: off. */
export function startFwGuard() {
  return { on: false, missFt: 0, clearSec: 0, predFt: Infinity };
}

/**
 * One step of the guard. g: last step's; seen: perception.js seeFw's; ownOmega: his own turn now (rad/s vector, he feels
 * it). The pass is predicted from the picture he sees, so over lookSec plus the 0.4 s it is old. Returns the guard { on,
 * missFt (pass-clear's depth: enough to make the slant missSlantFt over the predicted pass's horizontal, deepened while
 * engaged, never given back), clearSec, predFt (the least pass predicted, or the range now if less) }.
 */
export function fwGuard(g, seen, ownOmega) {
  const horizon = FG.lookSec + FW_SEE.delaySec; // the picture is that old
  const me = { p: seen.own.p, v: seen.own.v, omega: ownOmega };
  const asIs = leastPass({ p: seen.lead.p, v: seen.lead.v, omega: seen.turn.omega }, me, horizon);
  const tighter = leastPass({ p: seen.lead.p, v: seen.lead.v, omega: scale3(seen.turn.omega, FG.tighter) }, me, horizon);
  const pass = asIs.leastFt <= tighter.leastFt ? asIs : tighter;
  const predFt = Math.min(pass.leastFt, seen.slant);
  if (!g.on) {
    if (predFt >= FG.engageFt && seen.slant >= FG.minFt) return { ...g, predFt };
    const need = Math.sqrt(Math.max(0, FG.missSlantFt ** 2 - pass.horizFt ** 2));
    return { on: true, missFt: Math.min(FG.missFt[1], Math.max(FG.missFt[0], need)), clearSec: 0, predFt };
  }
  const clear = predFt > FG.releaseFt;
  const clearSec = clear ? g.clearSec + STEP_SEC : 0;
  if (clearSec >= FG.releaseSec) return { ...startFwGuard(), predFt };
  const need = Math.sqrt(Math.max(0, FG.missSlantFt ** 2 - pass.horizFt ** 2));
  const missFt = Math.max(g.missFt, Math.min(FG.missFt[1], need));
  return { ...g, missFt, clearSec, predFt };
}

const lineOk = (p) => p.behind >= FG.wingLineFt; // at least wingLineFt behind Lead's wing line over the look (Fable F6)

/**
 * The filter's judge of a candidate turn (rad/s in the turn plane, + left): his turn held over circleLookSec and then
 * Lead's turn (the capture, SMM 12.29 Fig 12.20), against Lead as he is and one step tighter (guard.tighter), with the
 * vertical he is asking for counted in the slant (Fable F3). Lead as he is must clear the pass line and the wing line; Lead
 * one step tighter, the 500 ft rule itself: the one number compared with the pass line meets both. The pass line is 500 ft
 * plus passLineSec of the closure he sees, never under engageFt (TS-233; Fable F4). Returns { passLine, predFor(om) -> {
 * pass, behind } }.
 */
function passJudge(sit, { errFt, aV }) {
  const { seen, job, out, ownP, ownV, leadNow, leadV } = sit;
  const horizon = FG.lookSec; // Lead is carried across the delay already
  const leadAsIs = { p: leadNow, v: leadV, omega: seen.turn.omega };
  const leadTighter = { p: leadNow, v: leadV, omega: scale3(seen.turn.omega, FG.tighter) };
  const passLine = Math.max(FG.engageFt, FG.minFt + FG.passLineSec * Math.max(0, seen.closure));
  const predFor = (om) => {
    const me = { p: ownP, v: ownV, omega: scale3(out, om), thenSec: job.turning ? W.circleLookSec : null };
    const extra = { acc: aV, maxFt: Math.abs(errFt) };
    const a = leastPass(leadAsIs, me, horizon, extra);
    const b = leastPass(leadTighter, me, horizon, extra);
    return { pass: Math.min(a.leastFt, b.leastFt + (passLine - FG.minFt)), behind: a.behindLeastFt };
  };
  return { passLine, predFor };
}

/**
 * Engaged, with hysteresis (Fable F12; thread, round 4): engaged at once when his aim's own turn (nom) fails the pass line
 * or the wing line, and released once it has cleared both by engage.marginFt for engage.releaseSec. Returns { failing,
 * engaged, engageClear (how long it has cleared by the margin) }.
 */
function engagedNext(mem, nom, passLine) {
  const failing = nom.pass < passLine || !lineOk(nom);
  if (failing) return { failing, engaged: true, engageClear: 0 };
  const engageClear = mem.filterClearSec ?? 0;
  if (!mem.filterEngaged) return { failing, engaged: false, engageClear };
  const clearBy = nom.pass >= passLine + FG.engage.marginFt && nom.behind >= FG.wingLineFt + FG.engage.marginFt;
  const cleared = clearBy ? engageClear + STEP_SEC : 0;
  return { failing, engaged: cleared < FG.engage.releaseSec, engageClear: cleared };
}

/**
 * The turn the filter flies when his aim's own fails: the candidates from no turn to his most each way (filterSteps),
 * bounded by the stick shaker's G at his speed, a physical limit (Fable F2), with the G his lift's hold leaves (F3). Of
 * those that clear, the nearest his aim's turn (omegaNom), on the side he took last step (lastSide) unless only the other
 * side clears, and in Lead's turn the lag side (less turn in Lead's direction: toward Lead's tail, outside his circle)
 * before the inside (Patrick 14 Oct 2026, never ahead of the 3/9 line; SMM 12.29 Fig 12.22); refined between it and its
 * neighbour toward his aim's turn. None clearing both: the pass line alone (range wins, Fable F6), his aim's own turn left
 * alone ("free") if it clears it, and the wing line out of reach (lineShort) when no turn at all keeps him behind it. None
 * clearing the pass line: in Lead's turn the lag-side turn nearest his aim's that keeps 500 ft, else the turn that passes
 * widest. Returns { pick ({ om, sideK, free }, or null), om (the turn flown, rad/s), lineShort, cleared (a turn clearing the
 * lines was found before the lag-side fallback) }.
 */
function searchTurn(sit, hold, judge, nom, omegaNom, lastSide) {
  const { seen, st, turning, out, V } = sit;
  const { passLine, predFor } = judge;
  const passOk = (c) => c.pass >= passLine;
  const gMost = Math.min(shakerG(st.kias), Math.max(seen.leadG + W.overLeadG, availableG(st.kias)));
  const gHold = len3(hold);
  const omMax = (G_FTPS2 * Math.sqrt(Math.max(0, gMost * gMost - gHold * gHold))) / V;
  const N = FG.filterSteps;
  const cands = [];
  for (let k = -N; k <= N; k++) {
    const om = (omMax * k) / N;
    cands.push({ om, ...predFor(om) });
  }
  const insideK = Math.sign(dot3(seen.turn.omega, out)) || 0; // the side of his aim's turn that is inside Lead's turn
  const choose = (ok) => {
    let best = null;
    for (const c of cands) {
      if (!ok(c)) continue;
      const sideK = Math.sign(c.om - omegaNom) || 1;
      const lagPenalty = turning && insideK && sideK === insideK ? 2 * omMax : 0;
      const cost = Math.abs(c.om - omegaNom) + (lastSide && sideK !== lastSide ? omMax : 0) + lagPenalty;
      if (!best || cost < best.cost) best = { ...c, cost, sideK };
    }
    if (!best) return null;
    let lo = best.om;
    let hi = best.om - best.sideK * (omMax / N);
    for (let r = 0; r < FG.filterRefine; r++) {
      const mid = (lo + hi) / 2;
      if (ok(predFor(mid))) lo = mid;
      else hi = mid;
    }
    return { om: lo, sideK: best.sideK };
  };
  let pick = choose((c) => passOk(c) && lineOk(c));
  let lineShort = false;
  if (!pick) {
    lineShort = !cands.some(lineOk);
    pick = passOk(nom) ? { om: omegaNom, sideK: 0, free: true } : choose(passOk);
  }
  const cleared = Boolean(pick);
  const lagRescue =
    !pick && turning && insideK
      ? choose((c) => c.pass >= FG.minFt && (Math.sign(c.om - omegaNom) || 1) !== insideK)
      : null;
  if (lagRescue) pick = lagRescue;
  const om = pick ? pick.om : cands.reduce((x, c) => (c.pass > x.pass ? c : x)).om;
  return { pick, om, lineShort, cleared };
}

/**
 * One step of the separation filter, after his aim's steering and with the vertical he is asking for.
 * mem: last step's wingman memory ({ filterHold, filterSide, filterEngaged, filterClearSec }); aTurn0: the turning
 * acceleration his aim asks for (ft/s², square to his path); vert: { errFt, aV, hold } (fighting-wing.js verticalFor's);
 * sit: { seen, st, job, turning (Lead turning faster than turnPlaneRadps), out (the turn plane's normal), u (his path,
 * unit), V (his speed), ownP, ownV (him now), leadNow, leadV (Lead carried across the delay) }.
 * His aim's turn is flown unless the pass it predicts fails (passJudge, engagedNext); then searchTurn's, only the turn in
 * the plane changed. Returns { aTurn (the turning acceleration flown), filterPull (the filter's turn needs more than Lead +
 * 1.5 G), filterOn (it changed his turn), lineShort, filterHold (power off and pass-clear's pitch held this long after),
 * filterSide (the side it took, +1 left of his aim's turn, else 0), passShort (his aim's own turn passes inside the pass
 * line), cleared, passFt (the pass his aim's own turn predicts), omNom, omPick (his aim's turn and the filter's, deg/s, +
 * left, for the trace), engaged, engageClear }.
 */
export function separationFilter(mem, aTurn0, vert, sit) {
  const { out, u, V } = sit;
  const side = unit3(cross3(out, u)); // his left in the turn plane
  const omegaNom = dot3(aTurn0, side) / V; // rad/s, + turning left
  const judge = passJudge(sit, vert);
  const nom = judge.predFor(omegaNom);
  const { failing, engaged, engageClear } = engagedNext(mem, nom, judge.passLine);
  const filterHold = Math.max(0, (mem.filterHold ?? 0) - STEP_SEC);
  const free = { aTurn: aTurn0, filterPull: false, filterOn: false, lineShort: false, filterHold, filterSide: 0, cleared: true };
  const keep = { passShort: nom.pass < judge.passLine, passFt: nom.pass, omNom: omegaNom / DEG, engaged, engageClear };
  if (!failing) return { ...free, ...keep, omPick: null };
  const lastSide = mem.filterSide ?? 0;
  const { pick, om, lineShort, cleared } = searchTurn(sit, vert.hold, judge, nom, omegaNom, lastSide);
  if (pick?.free) return { ...free, lineShort, cleared, ...keep, omPick: null };
  return {
    aTurn: add3(perp3(aTurn0, side), scale3(side, om * V)), // only the turn in the plane changes
    filterPull: Math.hypot(1, (om * V) / G_FTPS2) > sit.seen.leadG + W.overLeadG,
    filterOn: true,
    lineShort,
    filterHold: FG.filterHoldSec,
    filterSide: pick ? pick.sideK : lastSide,
    cleared,
    ...keep,
    omPick: om / DEG,
  };
}
