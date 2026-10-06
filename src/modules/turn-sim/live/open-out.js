// Echelon, route or fighting wing to line abreast on the same side, at full power from the press (Patrick 5 Oct 22:39Z:
// "line abreast from eschelon or fighting wing should start at FULL POWER and that will make it faster to get in
// posision"; 22:43Z: "see? idle boards to LAB from esch"; TS-88). The line of TS-78 (line-moves.js) worked his power out
// from its path, and its first leg drifts him aft in Lead's frame, so it flew its first 10 s at idle and the boards.
// This flies it as held commands instead (the review's design: the opening out as a held-command planner, as
// echelon-to-fw.js flies the drop back); since clean-up step 5 (TS-141) as a tracker recipe, the held part the tracker's
// pursuit (openPursuit) and the settle its next phase, one run flown by the one pilot model (pilot.js):
//  1. MAX from the press, held all the way out (the full power dive to start, Patrick 21:06Z; OPEN_OUT.diveFt).
//  2. Roll away from Lead at a held bank to a held heading off his, and down to OPEN_OUT.diveFt below him.
//  3. Hold that heading until a turn back at the same bank would put him level with line abreast's distance out; he falls
//     back by geometry only (the heading off), never by power. Climb back to Lead's height on the way.
//  4. Turn back parallel to Lead; the tracker settles him in the band (judge.js: in position is in the band, TS-80).
// Lead speeds up to line abreast speed at the press (OPEN_OUT_HELD.leadHolds).

import { relativeTo, DEG } from './manoeuvres.js';
import { recordFlight, speedSeg } from './replay.js';
import { openOut } from './recipes.js';
import { describe, CHANGE_LIMIT_SEC } from './transitions.js';
import { classify, judge } from './judge.js';
import { FORMATIONS, pairSlot } from './slots.js';
import { KIAS_LAB, OPEN_OUT, TRACKER } from './tuning.js';
import { onClosure } from './hand-over.js';
import { outAfterTurnBack } from './echelon-to-fw.js';
import { STEP_SEC } from './flight.js';
import { phase, runTracker, climbCostKtps } from './tracker.js';
import { wrapPi } from '../../../core/angles.js';
import { bankDegFromTurnRate } from '../../../core/flight-math.js';

const dt = STEP_SEC;

/** The numbers of the move (all estimates). */
export const OPEN_OUT_HELD = Object.freeze({
  banksDeg: Object.freeze([30, 45]), // the held bank away and back, gentlest first (the review's "about 30° of bank away"; 45° an estimate)
  // Lead speeds up to line abreast speed at the press (sims 5 Oct: about 59 s from echelon against 68-72 s with Lead holding
  // 200 KIAS until #2 is out, OPEN_OUT.leadHolds, the line's estimate); #2 has MAX and the dive in hand to keep up.
  leadHolds: false,
  offHeadingsDeg: Object.freeze([15, 20, 25, 30, 35]), // how far off Lead's heading he holds; the one that settles soonest is flown (estimates)
  diveSec: 10, // down to OPEN_OUT.diveFt below Lead over at least this long (OPEN_OUT.verticalFtps's 40 ft/s for 400 ft) ...
  climbSec: 10, // ... and back up to Lead's height over this long, ending as he turns back parallel (estimate)
  trimKtPerFt: 0.05, // KIAS more (or less) per foot he is behind (or ahead of) the slot's distance back (estimate) ...
  trimMaxKias: 25, // ... up to this (estimate: the rejoin overtakes of REJOIN_CLOSURE_KT, Instructor)
  parallelDeg: 0.5, // he is back parallel once within this of Lead's heading, wings within this of level (estimate); since TS-141 his speed loop and jerk are the one pilot model's (pilot.js, the tracker's; until then 6 kt/s², its own)
  startTol: Object.freeze({ kias: 5, headingDeg: 1, fwHeadingDeg: 5 }), // the pair this close to Lead's speed and heading, Lead straight (estimate, echelon-to-fw.js's); in fighting wing anywhere in the cone, still settling (estimate)
});

/**
 * #2's held part as a tracker recipe (clean-up step 5, TS-141): a `pursuit` the tracker flies through the one pilot model
 * (pilot.js). Each step it asks for a heading (offDeg off Lead's on his side, then back parallel once a turn back at
 * bankDeg brings him level with line abreast's distance out), the bank to turn to it (the heading loop's, no more than
 * bankDeg) and a speed: MAX from the press until he has the speed the heading off needs to keep level with Lead (KIAS
 * against KIAS: Lead's over the cosine of the heading off, the geometry), then that speed, trimmed to bring him level with
 * the slot's distance back. Done once parallel; gives up if he comes back in toward Lead. st: { turnBackT, doneT }.
 */
function openPursuit({ s, outAimFt, slotFwd, bankDeg, offDeg, startFt }) {
  const H = OPEN_OUT_HELD;
  const st = { leg: 'out', maxDone: false, turnBackT: null, doneT: null };
  const pursuit = (L, W, t) => {
    const rel = relativeTo(L, W);
    // Moving out, never back in toward Lead (from echelon he may come level with Lead's 3/9 line as he speeds up and turns
    // away: line abreast is on that line anyway).
    if (Math.hypot(rel.fwd, rel.left) < startFt - 5) return { abort: true };
    if (st.leg === 'out' && outAfterTurnBack(W, L, s, bankDeg, t) >= outAimFt) {
      st.leg = 'back';
      st.turnBackT = t;
    } else if (st.leg === 'back' && Math.abs(wrapPi(W.headingRad - L.headingRad)) < H.parallelDeg * DEG && Math.abs(W.bankDeg) < H.parallelDeg) st.leg = 'parallel';
    if (st.leg === 'parallel') {
      st.doneT = t;
      return { done: true };
    }
    const psiCmd = st.leg === 'out' ? wrapPi(L.headingRad + s * offDeg * DEG) : L.headingRad;
    const want = bankDegFromTurnRate(W.tasFtps, TRACKER.gain.heading * wrapPi(psiCmd - W.headingRad));
    const offNow = Math.abs(wrapPi(W.headingRad - L.headingRad));
    const trim = Math.max(-H.trimMaxKias, Math.min(H.trimMaxKias, -H.trimKtPerFt * (rel.fwd - slotFwd)));
    const aimKias = (st.leg === 'out' ? L.kias / Math.cos(offDeg * DEG) : L.kias / Math.cos(offNow)) + trim;
    if (W.kias >= aimKias) st.maxDone = true;
    return { psiCmd, kiasCmd: st.maxDone ? aimKias : Infinity, bankDeg: Math.max(-bankDeg, Math.min(bankDeg, want)), slowStage: 'power' };
  };
  return { pursuit, st };
}

/** The held part's tracker phase (openPursuit's), against Lead's recorded flight; its pursuit's st comes with it. */
function heldPhase(args, slot) {
  const held = openPursuit(args);
  return { held, phase: phase(slot, { pursuit: held.pursuit, pursuitEnds: true, bankCapDeg: args.bankDeg }) };
}

/**
 * #2's held part alone against Lead's recorded straight flight `rec`: MAX, away at bankDeg to offDeg off Lead's heading,
 * back parallel (openPursuit, flown by the tracker). Returns { points, steps, end, accelKtps, maxBankDeg, laneFwdFt,
 * turnBackStep } or null. The 4-ship's opening out flies each wingman on it too (four-open.js).
 */
export function flyOut({ wing, rec, s, outAimFt, slotFwd, bankDeg, offDeg, blockFt, t0, profile }) {
  const r0 = relativeTo(rec.at(0), wing);
  const { held, phase: ph } = heldPhase({ s, outAimFt, slotFwd, bankDeg, offDeg, startFt: Math.hypot(r0.fwd, r0.left) }, { fwd: slotFwd, left: s * outAimFt, alt: 0 });
  const run = runTracker({ refs: { ref: rec }, wing0: wing, t0, phases: [ph], profile, blockFt, maxSec: CHANGE_LIMIT_SEC });
  if (!run.ok || held.st.doneT === null || held.st.turnBackT === null) return null;
  return { points: run.points, steps: run.points.length, end: run.end.wing, accelKtps: run.accelKtps, maxBankDeg: run.maxBankDeg, laneFwdFt: run.laneFwdFt, turnBackStep: Math.round((held.st.turnBackT - t0) / dt) };
}

/**
 * Echelon, route or fighting wing to line abreast on the same side as a "Change formation" plan (planGoTo's shape,
 * transitions.js), or null when it does not apply or does not settle (the chooser then flies the line or the tracker).
 * 2-ship, Lead straight and level, #2 matched. options: { side, spacingFt, blockFt, lastSide }, as planGoTo's.
 */
export function planOpenOut(pair, to, options = {}, t0 = 0) {
  if (to !== 'lab' || pair.length !== 2) return null;
  const [lead, wing] = pair;
  const from = classify([lead, wing]);
  if (from.key !== 'echelon' && from.key !== 'route' && from.key !== 'fw') return null;
  const s = from.side;
  const want = options.side ?? 'keep';
  const sTo = want === 'left' ? 1 : want === 'right' ? -1 : s;
  if (sTo !== s) return null; // to the other side he crosses behind Lead first (line-moves.js)
  const H = OPEN_OUT_HELD;
  const straight = lead.bankDeg === 0 && lead.rollRateDps === 0;
  // In fighting wing his height in the cone is energy (TS-96, the whole cone): high and slow, or low and fast, counts at the
  // speed the height is worth, and the dive below flies the height off.
  const coneKias = from.key === 'fw' ? (wing.altAboveFt - lead.altAboveFt) * climbCostKtps(wing, 1) : 0;
  const headingTolDeg = from.key === 'fw' ? H.startTol.fwHeadingDeg : H.startTol.headingDeg;
  const matched = Math.abs(wing.kias + coneKias - lead.kias) <= H.startTol.kias && Math.abs(wrapPi(wing.headingRad - lead.headingRad)) <= headingTolDeg * DEG;
  if (!straight || !matched) return null;
  const spacingFt = options.spacingFt ?? 6000;
  const blockFt = options.blockFt ?? 8000;
  const slot = pairSlot('lab', s, spacingFt);
  const outAimFt = Math.abs(slot.left);
  const holdRec = recordFlight(lead, { segments: [] }, t0);
  const downFt = lead.altAboveFt - OPEN_OUT.diveFt;
  const upFt = lead.altAboveFt + slot.alt;
  const diveSec = Math.max(H.diveSec, Math.abs(wing.altAboveFt - downFt) / OPEN_OUT.verticalFtps);
  const dive = { t0, t1: t0 + diveSec, fromFt: wing.altAboveFt, toFt: downFt };
  // The climb back ends as he turns back parallel: flown once with the dive alone to find when that is, then again with it.
  const profileFor = (part) => {
    if (!part) return [dive];
    const t1 = t0 + part.turnBackStep * dt;
    const c0 = Math.max(dive.t1, t1 - H.climbSec);
    return [dive, { t0: c0, t1: Math.max(c0 + dt, t1), fromFt: downFt, toFt: upFt }];
  };

  const targetKias = KIAS_LAB;
  const speedSegs = Math.abs(lead.kias - targetKias) > 0.5 ? [speedSeg(lead.kias, targetKias, blockFt)] : [];
  let best = null;
  const outRec = H.leadHolds ? holdRec : recordFlight(lead, { segments: speedSegs.map((x) => ({ ...x })) }, t0);
  const r0 = relativeTo(lead, wing);
  const startFt = Math.hypot(r0.fwd, r0.left);
  const settle = onClosure([openOut(slot)])[0];
  for (const bankDeg of H.banksDeg) for (const offDeg of H.offHeadingsDeg) {
    const first = flyOut({ wing, rec: outRec, s, outAimFt, slotFwd: slot.fwd, bankDeg, offDeg, blockFt, t0, profile: profileFor(null) });
    if (!first) continue;
    const profile = profileFor(first);
    // Lead speeds up to line abreast speed at the press (OPEN_OUT_HELD.leadHolds); held, he waits until #2 is out.
    /** @type {any[]} */
    let leadSegs = speedSegs;
    if (H.leadHolds && speedSegs.length) {
      const part = flyOut({ wing, rec: outRec, s, outAimFt, slotFwd: slot.fwd, bankDeg, offDeg, blockFt, t0, profile });
      if (!part) continue;
      leadSegs = [{ kind: 'hold', untilSec: t0 + part.steps * dt, thenNext: true }, ...speedSegs];
    }
    const leadRec = recordFlight(lead, { segments: leadSegs.map((x) => ({ ...x })) }, t0);
    // The held part and the settle in the band (judge.js: in position is in the band, TS-80) as one tracker run (TS-141).
    const { held, phase: ph } = heldPhase({ s, outAimFt, slotFwd: slot.fwd, bankDeg, offDeg, startFt }, slot);
    const run = runTracker({ refs: { [lead.id]: leadRec }, wing0: wing, t0, phases: [ph, settle], profile, blockFt, maxSec: CHANGE_LIMIT_SEC });
    const durationSec = run.points.length * dt;
    if (!run.ok || held.st.doneT === null || durationSec > CHANGE_LIMIT_SEC) continue;
    const judged = judge([run.end.lead, run.end.wing], { key: 'lab' }, { spacingFt });
    if (!judged.inBand) continue;
    const heldSteps = Math.round((held.st.doneT - t0) / dt);
    if (!best || durationSec < best.durationSec - 0.5) best = { bankDeg, heldSteps, run, profile: run.heightLeg ? [run.heightLeg, ...profile] : profile, leadSegs, judged, durationSec, offDeg };
  }
  if (!best) return null;
  const { run, judged, durationSec } = best;

  const fromWord = FORMATIONS[from.key].label;
  const sideWord = s > 0 ? ' left' : ' right';
  const how = describe(from.key, 'lab', 'none');
  const topKias = Math.max(...run.points.slice(0, best.heldSteps).map((p) => p[1]));
  return {
    ok: true,
    plans: { [lead.id]: { segments: best.leadSegs.map((x) => ({ ...x })) }, [wing.id]: { segments: [{ kind: 'bankTrack', points: run.points }], profile: best.profile } },
    note: `${fromWord}${sideWord} to Line abreast${sideWord}: ${how}. #2 sets MAX at the press and holds it (Patrick 5 Oct 22:39Z), rolls away at ${best.bankDeg}° to ${best.offDeg}° off Lead's heading and dives to about ${OPEN_OUT.diveFt} ft below him, falling back by geometry only, up to about ${Math.round(topKias)} KIAS; climbs back as he turns back parallel at about ${outAimFt.toLocaleString('en-CA')} ft out, then the tracker settles him in the band (SMM 16.18 para 49). Lead speeds up to ${KIAS_LAB} KIAS at the press (estimate). About ${Math.round(durationSec)} s.`,
    label: `${FORMATIONS.lab.label}${sideWord}`,
    flying: `${fromWord}${sideWord} to ${FORMATIONS.lab.label}${sideWord} (${how})`,
    from: from.key,
    fromSide: s,
    to: 'lab',
    side: s,
    rejoinKind: 'none',
    leadTurnDeg: 0,
    laneFwdFt: run.laneFwdFt,
    maxBankDeg: run.maxBankDeg,
    judged,
    endSec: t0 + durationSec,
    rejoining: false,
    handOverSec: null,
  };
}
