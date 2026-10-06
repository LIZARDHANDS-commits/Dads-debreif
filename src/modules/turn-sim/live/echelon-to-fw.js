// Echelon (or route) to fighting wing on the same side, flown the way a pilot flies it, in about 10 s to the cone (plan.md
// step 4a item 5; Patrick 5 Oct 08:40Z: "I want the aircraft to get from echelon to fighting wing in 10 seconds. It can go
// idle boards then spool up power to end up in the cone, right?"; the review's design, project files
// turn-sim-review/fable-compiled.md section 3 item 2: roll away to about 60°, idle and boards, nose down to fighting wing
// height, 15-30° off heading, then MAX into the cone). The manuals' move is the drop back and sweep out (SMM 16.32 para 92,
// 16.38 para 105); the SMM says "slowly", Patrick ruled it "expeditious" (4 Oct 19:03Z), and his ruling wins.
//
// Since clean-up step 5 (TS-141) the whole move is one tracker recipe flown by the one pilot model (pilot.js): the held part
// below is the tracker's pursuit (heldPursuit), the settle its next phase, one run with no hand-over between controllers:
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
//  5. Parallel and at Lead's speed, he is where he stops: the tracker's next phase, with the whole band as his place
//     (formation-turns.js fwGoal) at the close-in rate, takes the last few feet out and lines him up.
// The change counts as done once #2 is in the cone, 500-1,000 ft and 30-60° of sweep (SMM 12.29 para 69, Fig 12.19),
// even while still moving (Patrick 5 Oct ruling; Lead's buttons show then, formation.js pressFw).
// A few bank and heading choices are flown and the one that reaches the cone soonest is kept, gentlest first. Numbers are
// in ECHELON_TO_FW below with their source or "estimate".
import { turnRateFromBankRadPerSec, bankDegFromTurnRate } from '../../../core/flight-math.js';
import { relativeTo, turnSeg, DEG } from './manoeuvres.js';
import { recordFlight } from './replay.js';
import { describe, CHANGE_LIMIT_SEC } from './transitions.js';
import { classify, judge } from './judge.js';
import { FORMATIONS, FW_BAND, fwShapeNow, pairSlot } from './slots.js';
import { KIAS_OUTSIDE_LAB, REJOIN_CLOSURE_KT, FW_FOLLOW, FW_TURN, TRACKER, TURNING_REJOIN, ratesNow, RATE_WORDS } from './tuning.js';
import { onClosure } from './hand-over.js';
import { fwGoal } from './formation-turns.js';
import { STEP_SEC, stepAircraft, copyAircraft, smoothLegSec } from './flight.js';
import { phase, runTracker } from './tracker.js';
import { pilotJerkKtps2 } from './pilot.js';
import { fullPowerKtps } from './slow-down.js';
import { wrapPi } from '../../../core/angles.js';
import { availableG } from '../../../core/t6-performance.js';

const dt = STEP_SEC;

/** The numbers of the move (all estimates unless a page or ruling is named). */
export const ECHELON_TO_FW = Object.freeze({
  banksDeg: Object.freeze([45, 60]), // the held bank to roll away and back, gentlest first: 60° is the review's (fable-compiled.md 3.2, estimate), 45° a gentler choice (estimate)
  offHeadingsDeg: Object.freeze([15, 20, 25, 30]), // how far off Lead's heading he holds: the review's 15-30° (estimate)
  heightSec: 6, // he eases down to the fighting wing slot's height over this long (estimate: recipes.js sweepOut's 6 s) ...
  heightG: TURNING_REJOIN.heightG, // ... and no quicker than one smooth leg within the rejoin's height-change g (TS-140; estimate)
  stopShare: 0.85, // the stop is planned at this share of what full power gives (wings level, at the speed halfway back to Lead's), so he stops a little short of the slot's distance back, never long (estimate)
  parallelDeg: 0.5, // he is back parallel once within this of Lead's heading, wings within this of level (estimate); since TS-141 his acceleration follows the power at the one pilot model's jerk limit (pilot.js; until then 6 kt/s², its own)
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
export function outFt(L, W, s) {
  return s * (-(W.xFt - L.xFt) * Math.sin(L.headingRad) + (W.yFt - L.yFt) * Math.cos(L.headingRad));
}

/** How far out #2 ends if he turns back parallel to Lead now at bankDeg (flight.js's own turn and roll-out, speed held). */
export function outAfterTurnBack(W, L, s, bankDeg, t) {
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
 * #2's held part as a tracker recipe (clean-up step 5, TS-141): a `pursuit` the tracker flies through the one pilot model
 * (pilot.js), so the same law that settles him flies the drop back too, with no hand-over between two controllers. Each
 * step it asks for a heading (off Lead's on his own side, then back parallel), the bank to turn to it (the heading loop's,
 * no more than the held bankDeg) and a speed (idle and the boards to the undertake; once the stop with full power just fits
 * the room left, Lead's speed: MAX until he has it). It ends the phase (`done`) once he is parallel, at Lead's speed and
 * steady, and down at fighting wing height; it gives up the run (`abort`) if he goes ahead of Lead's 3/9 line, past the stall
 * line, or out of the cone once in it. st: what it saw, for the planner ({ coneT, minKias, stopping, doneT }).
 */
function heldPursuit({ s, slot, bankDeg, offDeg, undertakeKias, blockFt, heightEndSec }) {
  const E = ECHELON_TO_FW;
  const aimOut = Math.abs(slot.left);
  const st = { leg: 'out', stopping: false, prevKias: null, coneT: null, minKias: Infinity, doneT: null };
  const pursuit = (L, W, t) => {
    const accel = st.prevKias === null ? 0 : (W.kias - st.prevKias) / dt; // his acceleration, KIAS per second
    st.prevKias = W.kias;
    st.minKias = Math.min(st.minKias, W.kias);
    const rel = relativeTo(L, W);
    if (rel.fwd > 0 || W.g > availableG(W.kias)) return { abort: true }; // never ahead of Lead's 3/9 line, never past the stall line
    const cone = inCone(rel, s);
    if (st.coneT === null && cone) st.coneT = t;
    else if (st.coneT !== null && !cone) return { abort: true }; // once in the cone he stays in it

    // The heading: off Lead's on his side; back parallel when a turn back at bankDeg brings him level with the slot's distance out.
    if (st.leg === 'out' && outAfterTurnBack(W, L, s, bankDeg, t) >= aimOut) st.leg = 'back';
    else if (st.leg === 'back' && Math.abs(wrapPi(W.headingRad - L.headingRad)) < E.parallelDeg * DEG && Math.abs(W.bankDeg) < E.parallelDeg) st.leg = 'parallel';
    const psiCmd = st.leg === 'out' ? wrapPi(L.headingRad + s * offDeg * DEG) : L.headingRad;
    const want = bankDegFromTurnRate(W.tasFtps, TRACKER.gain.heading * wrapPi(psiCmd - W.headingRad));
    const bank = Math.max(-bankDeg, Math.min(bankDeg, want));

    // The power: idle and the boards to the undertake; the stop (full power wings level at the speed halfway back to Lead's, at
    // stopShare, at the one jerk limit; plus the heading off still to come out in the turn back, about a third of the rate now
    // over the turn and its roll) starts where it just fits the room left to the slot's distance back.
    const ratio = W.tasFtps / W.kias; // true ft/s per KIAS
    const D = L.kias - W.kias; // KIAS below Lead (KIAS against KIAS)
    const room = rel.fwd - slot.fwd;
    const aStop = E.stopShare * fullPowerKtps((W.kias + L.kias) / 2, blockFt);
    const off = Math.abs(wrapPi(W.headingRad - L.headingRad));
    const turnRate = turnRateFromBankRadPerSec(W.tasFtps, bankDeg);
    const geoFt = st.leg === 'parallel' ? 0 : (W.tasFtps * (1 - Math.cos(off)) * (off / turnRate + 1)) / 3;
    if (!st.stopping && D > 0 && stopDriftFt(D, accel, aStop, pilotJerkKtps2(), ratio) + geoFt >= room) st.stopping = true;
    if (st.leg === 'parallel' && st.stopping && Math.abs(D) <= E.matchedKias && Math.abs(accel) <= E.matchedKtps && t >= heightEndSec - 1e-9) {
      st.doneT = t;
      return { done: true };
    }
    return { psiCmd, kiasCmd: st.stopping ? L.kias : L.kias - undertakeKias, bankDeg: bank, slowStage: 'idleBoards' };
  };
  return { pursuit, st };
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
  // #2's height: down to the fighting wing slot's, smoothly, over heightSec or no quicker than one smooth leg within heightG.
  const toFt = lead.altAboveFt + slot.alt;
  const heightSec = Math.max(E.heightSec, smoothLegSec(wing.altAboveFt - toFt, E.heightG));
  const profile = Math.abs(wing.altAboveFt - toFt) > 0.5 ? [{ t0, t1: t0 + heightSec, fromFt: wing.altAboveFt, toFt }] : [];
  const heightEndSec = profile.length ? t0 + heightSec : t0;
  // Rates: how far below Lead's speed he lets it fall, Patrick's 15/25/50 kt (TS-69 flies them as overtake; here the
  // undertake), KIAS against KIAS.
  const undertakeKias = REJOIN_CLOSURE_KT[ratesNow()];

  // The held part and the settle are one tracker run (TS-141): the held part's pursuit, then the tracker with the whole band
  // as his place (fwGoal: inside it he stays where he is) at the close-in rate (hand-over.js onClosure, as every run-in).
  const refs = { [lead.id]: rec };
  const settle = onClosure([phase(slot, { ...FW_FOLLOW, goal: (L, W) => fwGoal(L, W, s, false) })], { closeIn: true })[0];
  let best = null;
  for (const bankDeg of E.banksDeg) {
    for (const offDeg of E.offHeadingsDeg) {
      const held = heldPursuit({ s, slot, bankDeg, offDeg, undertakeKias, blockFt, heightEndSec });
      const phases = [phase(slot, { pursuit: held.pursuit, pursuitEnds: true, bankCapDeg: bankDeg }), settle];
      const run = runTracker({ refs, wing0: wing, t0, phases, profile, blockFt, maxSec: CHANGE_LIMIT_SEC });
      if (!run.ok || held.st.coneT === null || held.st.doneT === null) continue;
      const durationSec = run.points.length * dt;
      if (durationSec > CHANGE_LIMIT_SEC) continue;
      const judged = judge([run.end.lead, run.end.wing], { key: 'fw' }, { spacingFt });
      if (!judged.inBand) continue;
      const coneSec = held.st.coneT - t0;
      if (!best || coneSec < best.coneSec - E.preferSec) best = { run, held, bankDeg, offDeg, coneSec, durationSec, judged };
    }
  }
  if (!best) return null;
  const { run, judged, durationSec, coneSec } = best;
  const heldSteps = Math.round((best.held.st.doneT - t0) / dt);
  const maxSet = best.held.st.stopping && run.points.slice(0, heldSteps).some((p) => p[2] && !p[2].stage && p[2].throttle >= 0.985);
  const minKias = best.held.st.minKias;

  const fromWord = FORMATIONS[from.key].label;
  const sideWord = s > 0 ? ' left' : ' right';
  const how = describe(from.key, 'fw', 'none');
  const power = maxSet ? 'MAX' : 'power';
  return {
    ok: true,
    plans: { [lead.id]: { segments: [] }, [wing.id]: { segments: [{ kind: 'bankTrack', points: run.points }], profile: run.heightLeg ? [run.heightLeg, ...profile] : profile } },
    note: `${fromWord}${sideWord} to Fighting wing${sideWord}: ${how} (SMM 16.32 para 92, 16.38 para 105; Patrick 4 Oct 19:03Z). #2 rolls away from Lead at ${best.bankDeg}° to ${best.offDeg}° off his heading, idle and boards, no more than ${undertakeKias} KIAS below Lead's ${KIAS_OUTSIDE_LAB} KIAS (Rates ${RATE_WORDS[ratesNow()]}; lowest ${Math.round(minKias)} KIAS), and eases down to fighting wing height; turns back parallel and sets ${power} to stop his drop back in the cone (SMM 12.29 para 69): in the cone in about ${Math.round(coneSec)} s (Patrick 5 Oct 08:40Z: about 10 s), settled in about ${Math.round(durationSec)} s.`,
    label: `${FORMATIONS.fw.label}${sideWord}`,
    flying: `${fromWord}${sideWord} to ${FORMATIONS.fw.label}${sideWord} (${how})`,
    from: from.key,
    fromSide: s,
    to: 'fw',
    side: s,
    rejoinKind: 'none',
    leadTurnDeg: 0,
    laneFwdFt: run.laneFwdFt,
    maxBankDeg: run.maxBankDeg,
    judged,
    endSec: t0 + durationSec,
    rejoining: false,
    handOverSec: null,
    coneSec: t0 + coneSec,
  };
}
