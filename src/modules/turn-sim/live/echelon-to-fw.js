// Echelon (or route) to fighting wing on the same side, flown the way a pilot flies it, in about 10 s to the cone (plan.md
// step 4a item 5; Patrick 5 Oct 08:40Z: "I want the aircraft to get from echelon to fighting wing in 10 seconds. It can go
// idle boards then spool up power to end up in the cone, right?"; the review's design, project files
// turn-sim-review/fable-compiled.md section 3 item 2: roll away to about 60°, idle and boards, nose down to fighting wing
// height, 15-30° off heading, then MAX into the cone). The manuals' move is the drop back and sweep out (SMM 16.32 para 92,
// 16.38 para 105); the SMM says "slowly", Patrick ruled it "expeditious" (4 Oct 19:03Z), and his ruling wins.
//
// #2 is flown through the same flight.js step as Lead with held commands, as turning-rejoin.js flies the turning rejoin:
//  1. Roll away from Lead (toward #2's own side) at a held bank, idle and the boards, and ease down to the fighting wing
//     slot's height. Roll out at a held heading off Lead's.
//  2. Hold that heading until a turn back at the same bank would put him level with the fighting wing slot's distance out
//     (the slot is only the aim: anywhere in the cone is fighting wing, Patrick 5 Oct 08:58Z).
//  3. Turn back parallel to Lead.
//  4. Power: idle and the boards from the press, his speed falling no further below Lead's than the Rates choice's
//     undertake; then, where the stop with full power just fits the room left to the slot's distance back (planned at a
//     share of it, so he stops a little short rather than long), MAX, held until he has Lead's speed (Patrick 08:48Z: "a
//     lot for a short time or a medium amount for a while"). Every speed change is clamped to what full power or idle and
//     the boards give at the G and climb he is flying (slow-down.js; the review's lesson 3).
//  5. Parallel and at Lead's speed, he is where he stops: the tracker, with the whole band as his place (formation-turns.js
//     fwGoal) at the close-in rate, takes the last few feet out and lines him up, as every planner hands over for the settle.
// The change counts as done once #2 is in the cone, 500-1,000 ft and 30-60° of sweep (SMM 12.29 para 69, Fig 12.19),
// even while still moving (Patrick 5 Oct ruling; Lead's buttons show then, formation.js pressFw).
// A few bank and heading choices are flown and the one that reaches the cone soonest is kept, gentlest first. Numbers are
// in ECHELON_TO_FW below with their source or "estimate".
import { relativeTo, turnSeg, DEG } from './manoeuvres.js';
import { recordFlight, describe, CHANGE_LIMIT_SEC } from './transitions.js';
import { classify, judge } from './judge.js';
import { FORMATIONS, FW_BAND, fwShapeNow, pairSlot } from './slots.js';
import { KIAS_OUTSIDE_LAB, REJOIN_CLOSURE_KT, FW_FOLLOW, FW_TURN, TRACKER, TURNING_REJOIN, ratesNow, RATE_WORDS } from './tuning.js';
import { fromStep, onClosure } from './hand-over.js';
import { fwGoal } from './formation-turns.js';
import { STEP_SEC, stepAircraft, copyAircraft } from './flight.js';
import { setKias, phase, trackTwice } from './tracker.js';
import { fullPowerKtps, slowKtps } from './slow-down.js';
import { powerFor, powerFrom } from './power.js';
import { wrapPi } from '../../../core/angles.js';
import { G_FTPS2 } from '../../../core/units.js';
import { availableG } from '../../../core/t6-performance.js';

const dt = STEP_SEC;

/** The numbers of the move (all estimates unless a page or ruling is named). */
export const ECHELON_TO_FW = Object.freeze({
  banksDeg: Object.freeze([45, 60]), // the held bank to roll away and back, gentlest first: 60° is the review's (fable-compiled.md 3.2, estimate), 45° a gentler choice (estimate)
  offHeadingsDeg: Object.freeze([15, 20, 25, 30]), // how far off Lead's heading he holds: the review's 15-30° (estimate)
  heightSec: 6, // he eases down to the fighting wing slot's height over this long (estimate: transitions.js sweepOut's 6 s) ...
  descentFtps: TURNING_REJOIN.descentFtps, // ... and no quicker than this on average (the rejoin's 30 ft/s, an estimate)
  stopShare: 0.85, // the stop is planned at this share of what full power gives (wings level, at the speed halfway back to Lead's), so he stops a little short of the slot's distance back, never long (estimate)
  jerkKtps2: 6, // his acceleration follows the power at up to this, so idle and the boards to MAX takes about 1.5 s (estimate: the engine answers in about 0.25 s, Patrick 5 Oct 06:02Z, tuning.js ENGINE_RESPONSE_SEC; the speed brake's travel time is a guess)
  speedLoop: TRACKER.gain.speedLoop, // 1/s: the last knots onto a held speed (the tracker's own, an estimate)
  matchedKias: 0.3, // he hands the settle to the tracker within this of Lead's speed ... (estimate)
  matchedKtps: 0.3, // ... with his speed this steady (estimate)
  preferSec: 0.5, // a sharper choice is kept only if it reaches the cone at least this much sooner (estimate; turning-rejoin.js's 0.5 s)
  // A pair this close to Lead's speed and heading, Lead straight and level at 200 KIAS, is the case built (estimate). The speed is
  // "steady"'s 5 kt (STEADY.closureKt, TS-78): a change that ends in band and steady can carry up to that into this one.
  startTol: Object.freeze({ kias: 5, headingDeg: 1 }),
});

/** In the cone: SMM 12.29 para 69, Fig 12.19 (500-1,000 ft, 30-60° of sweep back from Lead's wing line), on side s. */
function inCone(rel, s) {
  const range = Math.hypot(rel.fwd, rel.left);
  const sweep = Math.atan2(-rel.fwd, Math.max(Math.abs(rel.left), 1e-6)) / DEG;
  return Math.sign(rel.left) === s && range >= FW_BAND.rangeFt[0] && range <= FW_BAND.rangeFt[1] && sweep >= FW_BAND.sweepDeg[0] && sweep <= FW_BAND.sweepDeg[1];
}

/**
 * Where he aims: the fighting wing slot (the Setup's spacing and sweep, slots.js), pulled inside the band's edges by the
 * fighting wing turns' margins (tuning.js FW_TURN.aimInsideFt, aimInsideDeg), so a slot set on the band's edge still ends in
 * the cone. Null when the slot is set outside the band (today's planner flies or refuses that, as before).
 */
function aimFor(s, spacingFt) {
  const { rangeFt, sweepDeg } = fwShapeNow();
  const [rMin, rMax] = FW_BAND.rangeFt;
  const [dMin, dMax] = FW_BAND.sweepDeg;
  if (rangeFt < rMin || rangeFt > rMax || sweepDeg < dMin || sweepDeg > dMax) return null;
  const r = Math.min(Math.max(rangeFt, rMin + FW_TURN.aimInsideFt), rMax - FW_TURN.aimInsideFt);
  const sw = Math.min(Math.max(sweepDeg, dMin + FW_TURN.aimInsideDeg), dMax - FW_TURN.aimInsideDeg) * DEG;
  return { fwd: -r * Math.sin(sw), left: s * r * Math.cos(sw), alt: pairSlot('fw', s, spacingFt).alt };
}

/** How far out from Lead's straight track (ft, positive on side s) #2 is: Lead flies straight, so his track is a line. */
function outFt(L, W, s) {
  return s * (-(W.xFt - L.xFt) * Math.sin(L.headingRad) + (W.yFt - L.yFt) * Math.cos(L.headingRad));
}

/** How far out #2 ends if he turns back parallel to Lead now at bankDeg (flight.js's own turn and roll-out, speed held). */
function outAfterTurnBack(W, L, s, bankDeg, t) {
  const c = copyAircraft(W);
  const plan = { segments: [turnSeg(L.headingRad, -s, bankDeg)] };
  for (let i = 0; i < 400 && plan.segments.length; i++) stepAircraft(c, plan, t + i * dt);
  return outFt(L, c, s);
}

/**
 * How far aft (ft) #2 still drifts on his speed if the stop starts now: his acceleration swings from a0 to a1 (KIAS per
 * second, a1 > 0) at jerk, then holds a1 until he has Lead's speed. D0: KIAS below Lead now; ratio: true ft/s per KIAS.
 */
function stopDriftFt(D0, a0, a1, jerk, ratio) {
  const tau = Math.max(0, (a1 - a0) / jerk);
  const D1 = D0 - a0 * tau - (jerk * tau * tau) / 2;
  const ramp = D0 * tau - (a0 * tau * tau) / 2 - (jerk * tau ** 3) / 6;
  return ratio * (ramp + (D1 > 0 ? (D1 * D1) / (2 * a1) : 0));
}

/**
 * #2's held-command part, against Lead's recorded straight flight `rec`, with one bank and one heading off. Returns null when
 * it breaks a check, else { points, steps, end, accelKtps, coneStep, maxBankDeg, laneFwdFt, minKias, maxSet }: points are
 * [bank, kias, power] a step (transitions.js flyStep's bankTrack), coneStep the first step he is in the cone, maxSet
 * whether the stop reached full power.
 */
function flyOut({ wing, rec, s, slot, bankDeg, offDeg, undertakeKias, blockFt, t0, profile, heightEndSec }) {
  const E = ECHELON_TO_FW;
  const W = copyAircraft(wing);
  const aimOut = Math.abs(slot.left);
  const L0 = rec.at(0);
  const plan = { segments: [turnSeg(wrapPi(L0.headingRad + s * offDeg * DEG), s, bankDeg)], profile };
  let leg = 'away'; // away, hold, back, parallel
  let stopping = false;
  let accel = 0;
  let coneStep = null;
  let maxBank = 0;
  let laneFwdFt = -Infinity;
  let minKias = Infinity;
  let maxSet = false;
  const points = [];
  for (let n = 0; n < Math.round(CHANGE_LIMIT_SEC / dt); n++) {
    const L = rec.at(n);
    const t = t0 + n * dt;
    const rel = relativeTo(L, W);
    const ratio = W.tasFtps / W.kias; // true ft/s per KIAS

    // The heading: roll away, hold, and turn back when that brings him level with the slot's distance out.
    if ((leg === 'away' || leg === 'hold') && outAfterTurnBack(W, L, s, bankDeg, t) >= aimOut) {
      plan.segments = [turnSeg(L.headingRad, -s, bankDeg)];
      leg = 'back';
    } else if (leg === 'away' && !plan.segments.length) leg = 'hold';
    else if (leg === 'back' && !plan.segments.length) leg = 'parallel';

    // The power. His speed limits are full power's and idle and the boards' at the G he pulls, less what a climb costs or
    // plus what a descent gives (standard aerodynamics, dV/dt = g (T - D) / W - g sin(climb angle); turning-rejoin.js).
    const climbKtps = (G_FTPS2 * W.climbFtps) / Math.max(W.tasFtps, 1) / ratio;
    const aMax = fullPowerKtps(W.kias, blockFt, W.g) - climbKtps;
    const aAll = slowKtps('idleBoards', W.kias, blockFt, W.g) + climbKtps;
    const D = L.kias - W.kias; // KIAS below Lead (KIAS against KIAS)
    const room = rel.fwd - slot.fwd; // how far he still is ahead of the slot's distance back, ft
    // The stop: full power wings level at the speed halfway back to Lead's, at stopShare; plus the heading off still to come
    // out in the turn back, which drifts him aft too (about a third of the rate now, over the turn and its roll).
    const aStop = E.stopShare * fullPowerKtps((W.kias + L.kias) / 2, blockFt);
    const off = Math.abs(wrapPi(W.headingRad - L.headingRad));
    const turnRate = (G_FTPS2 * Math.tan(bankDeg * DEG)) / W.tasFtps;
    const geoFt = leg === 'parallel' ? 0 : (W.tasFtps * (1 - Math.cos(off)) * (off / turnRate + 1)) / 3;
    if (!stopping && D > 0 && stopDriftFt(D, accel, aStop, E.jerkKtps2, ratio) + geoFt >= room) stopping = true;
    // Idle and the boards to the undertake; once stopping, MAX held until he has Lead's speed, the last knots eased on.
    const aCmd = Math.max(-aAll, Math.min(aMax, E.speedLoop * (stopping ? D : D - undertakeKias)));
    accel += Math.max(-E.jerkKtps2 * dt, Math.min(E.jerkKtps2 * dt, aCmd - accel));
    const kias = W.kias + accel * dt;
    setKias(W, kias);
    const seg = plan.segments[0];
    stepAircraft(W, plan, t);
    // The bank commanded this step: the turn segment's (flight.js), or wings level once it rolls out.
    const bank = seg && !seg.rollingOut ? seg.dir * seg.bankDeg : 0;
    const atMax = accel >= aMax * 0.985;
    maxSet ||= stopping && atMax;
    const power = atMax ? powerFrom(null, 1, W.kias, blockFt) : powerFor(accel, W.kias, blockFt, W.g, W.climbFtps, 'idleBoards');
    points.push([bank, kias, power]);
    maxBank = Math.max(maxBank, Math.abs(W.bankDeg));
    minKias = Math.min(minKias, W.kias);
    if (W.g > availableG(W.kias)) return null; // never past the stall line (the bank is held well inside it)

    const after = relativeTo(rec.at(n + 1), W);
    if (Math.hypot(after.fwd, after.left) < TRACKER.laneRangeFt) laneFwdFt = Math.max(laneFwdFt, after.fwd);
    if (after.fwd > 0) return null; // never ahead of Lead's 3/9 line
    const cone = inCone(after, s);
    if (coneStep === null && cone) coneStep = n + 1;
    else if (coneStep !== null && !cone) return null; // once in the cone he stays in it
    if (leg === 'parallel' && stopping && Math.abs(L.kias - W.kias) <= E.matchedKias && Math.abs(accel) <= E.matchedKtps && t + dt >= heightEndSec - 1e-9) {
      return { points, steps: n + 1, end: W, accelKtps: accel, coneStep, maxBankDeg: maxBank, laneFwdFt, minKias, maxSet };
    }
  }
  return null;
}

/**
 * Echelon (or route) to fighting wing on the same side as a "Change formation" plan (planGoTo's shape, transitions.js), or
 * null when it does not apply or does not reach and settle in the cone (formation.js then flies today's line and tracker,
 * line-moves.js). It applies to the 2-ship with Lead straight and level at 200 KIAS and #2 matched. options: { side,
 * spacingFt, blockFt, lastSide }, as planGoTo's.
 */
export function planEchelonToFw(pair, to, options = {}, t0 = 0) {
  if (to !== 'fw' || pair.length !== 2) return null;
  const [lead, wing] = pair;
  const from = classify([lead, wing]);
  if (from.key !== 'echelon' && from.key !== 'route') return null;
  const s = from.side;
  const want = options.side ?? 'keep';
  const sTo = want === 'left' ? 1 : want === 'right' ? -1 : s;
  if (sTo !== s) return null; // to the other side it crosses behind Lead first (line-moves.js)
  const E = ECHELON_TO_FW;
  const straight = lead.bankDeg === 0 && lead.rollRateDps === 0 && Math.abs(lead.kias - KIAS_OUTSIDE_LAB) <= 0.5;
  const matched = Math.abs(wing.kias - lead.kias) <= E.startTol.kias && Math.abs(wrapPi(wing.headingRad - lead.headingRad)) <= E.startTol.headingDeg * DEG;
  if (!straight || !matched) return null;
  const spacingFt = options.spacingFt ?? 6000;
  const blockFt = options.blockFt ?? 8000;
  const slot = aimFor(s, spacingFt);
  if (!slot) return null;
  const rec = recordFlight(lead, { segments: [] }, t0);
  // #2's height: down to the fighting wing slot's, smoothly, over heightSec or no quicker than the descent rate.
  const toFt = lead.altAboveFt + slot.alt;
  const heightSec = Math.max(E.heightSec, Math.abs(wing.altAboveFt - toFt) / E.descentFtps);
  const profile = Math.abs(wing.altAboveFt - toFt) > 0.5 ? [{ t0, t1: t0 + heightSec, fromFt: wing.altAboveFt, toFt }] : [];
  const heightEndSec = profile.length ? t0 + heightSec : t0;
  // Rates: how far below Lead's speed he lets it fall, Patrick's 15/25/50 kt (TS-69 flies them as overtake; here the
  // undertake), KIAS against KIAS.
  const undertakeKias = REJOIN_CLOSURE_KT[ratesNow()];

  let best = null;
  for (const bankDeg of E.banksDeg) {
    for (const offDeg of E.offHeadingsDeg) {
      const part = flyOut({ wing, rec, s, slot, bankDeg, offDeg, undertakeKias, blockFt, t0, profile, heightEndSec });
      if (!part || part.coneStep === null) continue;
      if (!best || part.coneStep * dt < best.part.coneStep * dt - E.preferSec) best = { part, bankDeg, offDeg };
    }
  }
  if (!best) return null;
  const { part } = best;
  // The settle: the tracker with the whole band as his place (fwGoal: inside it he stays where he is), at the close-in rate
  // (hand-over.js onClosure, as every run-in), from where the held part left him, against Lead flying straight on.
  const n1 = part.steps;
  const W1 = { ...part.end, altAboveFt: toFt, climbFtps: 0 };
  const rel1 = relativeTo(rec.at(n1), W1);
  const settle = onClosure([phase({ fwd: rel1.fwd, left: rel1.left, alt: W1.altAboveFt }, { ...FW_FOLLOW, goal: (L, W) => fwGoal(L, W, s, false) })], { closeIn: true });
  const { run } = trackTwice({ refs: { [lead.id]: fromStep(rec, n1) }, wing0: W1, t0: t0 + n1 * dt, phases: settle, blockFt, init: { accelKtps: part.accelKtps } });
  const durationSec = (n1 + run.points.length) * dt;
  if (!run.ok || durationSec > CHANGE_LIMIT_SEC) return null;
  const judged = judge([run.end.lead, run.end.wing], { key: 'fw' }, { spacingFt });
  if (!judged.inBand) return null;

  const fromWord = FORMATIONS[from.key].label;
  const sideWord = s > 0 ? ' left' : ' right';
  const how = describe(from.key, 'fw', 'none');
  const coneSec = part.coneStep * dt;
  const power = part.maxSet ? 'MAX' : 'power';
  return {
    ok: true,
    plans: { [lead.id]: { segments: [] }, [wing.id]: { segments: [{ kind: 'bankTrack', points: [...part.points, ...run.points] }], profile } },
    note: `${fromWord}${sideWord} to Fighting wing${sideWord}: ${how} (SMM 16.32 para 92, 16.38 para 105; Patrick 4 Oct 19:03Z). #2 rolls away from Lead at ${best.bankDeg}° to ${best.offDeg}° off his heading, idle and boards, no more than ${undertakeKias} KIAS below Lead's ${KIAS_OUTSIDE_LAB} KIAS (Rates ${RATE_WORDS[ratesNow()]}; lowest ${Math.round(part.minKias)} KIAS), and eases down to fighting wing height; turns back parallel and sets ${power} to stop his drop back in the cone (SMM 12.29 para 69): in the cone in about ${Math.round(coneSec)} s (Patrick 5 Oct 08:40Z: about 10 s), settled in about ${Math.round(durationSec)} s.`,
    label: `${FORMATIONS.fw.label}${sideWord}`,
    flying: `${fromWord}${sideWord} to ${FORMATIONS.fw.label}${sideWord} (${how})`,
    from: from.key,
    fromSide: s,
    to: 'fw',
    side: s,
    rejoinKind: 'none',
    leadTurnDeg: 0,
    laneFwdFt: Math.max(part.laneFwdFt, run.laneFwdFt),
    maxBankDeg: Math.max(part.maxBankDeg, run.maxBankDeg),
    judged,
    endSec: t0 + durationSec,
    rejoining: false,
    handOverSec: null,
    coneSec: t0 + coneSec,
  };
}
