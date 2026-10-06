// Echelon, route or fighting wing to line abreast on the same side, at full power from the press (Patrick 5 Oct 22:39Z:
// "line abreast from eschelon or fighting wing should start at FULL POWER and that will make it faster to get in
// posision"; 22:43Z: "see? idle boards to LAB from esch"; TS-88). The line of TS-78 (line-moves.js) worked his power out
// from its path, and its first leg drifts him aft in Lead's frame, so it flew its first 10 s at idle and the boards.
// This flies it as held commands instead (the review's design: the opening out as a held-command planner, as
// echelon-to-fw.js flies the drop back):
//  1. MAX from the press, held all the way out (the full power dive to start, Patrick 21:06Z; OPEN_OUT.diveFt).
//  2. Roll away from Lead at a held bank to a held heading off his, and down to OPEN_OUT.diveFt below him.
//  3. Hold that heading until a turn back at the same bank would put him level with line abreast's distance out; he falls
//     back by geometry only (the heading off), never by power. Climb back to Lead's height on the way.
//  4. Turn back parallel to Lead; the tracker settles him in the band (judge.js: in position is in the band, TS-80).
// Lead speeds up to line abreast speed at the press (OPEN_OUT_HELD.leadHolds).

import { relativeTo, turnSeg, DEG } from './manoeuvres.js';
import { recordFlight, speedSeg, describe, openOut, CHANGE_LIMIT_SEC } from './transitions.js';
import { classify, judge } from './judge.js';
import { FORMATIONS, pairSlot } from './slots.js';
import { KIAS_LAB, OPEN_OUT, TRACKER } from './tuning.js';
import { fromStep, onClosure } from './hand-over.js';
import { outAfterTurnBack } from './echelon-to-fw.js';
import { STEP_SEC, stepAircraft, copyAircraft } from './flight.js';
import { setKias, trackTwice, climbCostKtps } from './tracker.js';
import { fullPowerKtps, slowKtps } from './slow-down.js';
import { powerFor, powerFrom } from './power.js';
import { wrapPi } from '../../../core/angles.js';
import { G_FTPS2 } from '../../../core/units.js';
import { availableG } from '../../../core/t6-performance.js';

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
  speedLoop: TRACKER.gain.speedLoop, // 1/s: onto the speed he needs (the tracker's own, an estimate)
  trimKtPerFt: 0.05, // KIAS more (or less) per foot he is behind (or ahead of) the slot's distance back (estimate) ...
  trimMaxKias: 25, // ... up to this (estimate: the rejoin overtakes of REJOIN_CLOSURE_KT, Instructor)
  jerkKtps2: 6, // his acceleration follows the power at up to this (echelon-to-fw.js's; estimate)
  startTol: Object.freeze({ kias: 5, headingDeg: 1, fwHeadingDeg: 5 }), // the pair this close to Lead's speed and heading, Lead straight (estimate, echelon-to-fw.js's); in fighting wing anywhere in the cone, still settling (estimate)
});

/**
 * #2's held-command part against Lead's recorded straight flight `rec`: MAX, away at bankDeg to offDeg off Lead's heading,
 * back parallel. Returns { points, steps, end, accelKtps, maxBankDeg, laneFwdFt, turnBackStep } or null. The 4-ship's
 * opening out flies each wingman on it too (four-open.js).
 */
export function flyOut({ wing, rec, s, outAimFt, slotFwd, bankDeg, offDeg, blockFt, t0, profile }) {
  const H = OPEN_OUT_HELD;
  const W = copyAircraft(wing);
  const L0 = rec.at(0);
  const plan = { segments: [turnSeg(wrapPi(L0.headingRad + s * offDeg * DEG), s, bankDeg)], profile };
  let leg = 'away'; // away, hold, back, parallel
  let accel = 0;
  let maxBank = 0;
  let laneFwdFt = -Infinity;
  let turnBackStep = null;
  let maxDone = false; // MAX from the press until he has the speed he needs
  const points = [];
  const r0 = relativeTo(L0, W);
  const startFt = Math.hypot(r0.fwd, r0.left);
  for (let n = 0; n < Math.round(CHANGE_LIMIT_SEC / dt); n++) {
    const L = rec.at(n);
    const t = t0 + n * dt;
    if ((leg === 'away' || leg === 'hold') && outAfterTurnBack(W, L, s, bankDeg, t) >= outAimFt) {
      plan.segments = [turnSeg(L.headingRad, -s, bankDeg)];
      leg = 'back';
      turnBackStep = n;
    } else if (leg === 'away' && !plan.segments.length) leg = 'hold';
    else if (leg === 'back' && !plan.segments.length) leg = 'parallel';
    if (leg === 'parallel') return { points, steps: n, end: W, accelKtps: accel, maxBankDeg: maxBank, laneFwdFt, turnBackStep };

    // The power: MAX from the press until he has the speed the heading off needs to keep level with Lead (KIAS against
    // KIAS: Lead's over the cosine of the heading off, the geometry), then power as required for that speed, trimmed to
    // bring him level with the slot's distance back, power back as he turns back parallel. His limits are full power's and
    // idle's at the G he pulls, plus what the dive gives or less what the climb costs (standard aerodynamics, dV/dt =
    // g (T - D) / W - g sin(climb angle); echelon-to-fw.js).
    const ratio = W.tasFtps / W.kias;
    const climbKtps = (G_FTPS2 * W.climbFtps) / Math.max(W.tasFtps, 1) / ratio;
    const aMax = fullPowerKtps(W.kias, blockFt, W.g) - climbKtps;
    const aIdle = slowKtps('power', W.kias, blockFt, W.g) + climbKtps;
    const rel = relativeTo(L, W);
    const offNow = Math.abs(wrapPi(W.headingRad - L.headingRad));
    const trim = Math.max(-H.trimMaxKias, Math.min(H.trimMaxKias, -H.trimKtPerFt * (rel.fwd - slotFwd)));
    const aimKias = (leg === 'away' ? L.kias / Math.cos(offDeg * DEG) : L.kias / Math.cos(offNow)) + trim;
    if (W.kias >= aimKias) maxDone = true;
    const aCmd = maxDone ? Math.max(-aIdle, Math.min(aMax, H.speedLoop * (aimKias - W.kias))) : aMax;
    accel += Math.max(-H.jerkKtps2 * dt, Math.min(H.jerkKtps2 * dt, aCmd - accel));
    const kias = W.kias + accel * dt;
    setKias(W, kias);
    const seg = plan.segments[0];
    stepAircraft(W, plan, t);
    const bank = seg && !seg.rollingOut ? seg.dir * seg.bankDeg : 0;
    points.push([bank, kias, accel >= aMax * 0.985 ? powerFrom(null, 1, W.kias, blockFt) : powerFor(accel, W.kias, blockFt, W.g, W.climbFtps, null)]);
    maxBank = Math.max(maxBank, Math.abs(W.bankDeg));
    const after = relativeTo(rec.at(n + 1), W);
    if (Math.hypot(after.fwd, after.left) < TRACKER.laneRangeFt) laneFwdFt = Math.max(laneFwdFt, after.fwd);
    // Moving out, never back in toward Lead (from echelon he may come level with Lead's 3/9 line as he speeds up and turns
    // away: line abreast is on that line anyway).
    const range = Math.hypot(after.fwd, after.left);
    if (range < startFt - 5) return null;
  }
  return null;
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
  for (const bankDeg of H.banksDeg) for (const offDeg of H.offHeadingsDeg) {
    const first = flyOut({ wing, rec: outRec, s, outAimFt, slotFwd: slot.fwd, bankDeg, offDeg, blockFt, t0, profile: profileFor(null) });
    if (!first) continue;
    const profile = profileFor(first);
    const part = flyOut({ wing, rec: outRec, s, outAimFt, slotFwd: slot.fwd, bankDeg, offDeg, blockFt, t0, profile });
    if (!part) continue;
    const n1 = part.steps;
    // Lead speeds up to line abreast speed at the press (OPEN_OUT_HELD.leadHolds).
    const leadSegs = H.leadHolds && speedSegs.length ? [{ kind: 'hold', untilSec: t0 + n1 * dt, thenNext: true }, ...speedSegs] : speedSegs;
    const leadRec = recordFlight(lead, { segments: leadSegs.map((x) => ({ ...x })) }, t0);
    const W1 = { ...part.end, altAboveFt: upFt, climbFtps: 0 };
    const settle = onClosure([openOut(slot)]);
    const { run, profile: runProfile } = trackTwice({ refs: { [lead.id]: fromStep(leadRec, n1) }, wing0: W1, t0: t0 + n1 * dt, phases: settle, blockFt, init: { accelKtps: part.accelKtps } });
    const durationSec = (n1 + run.points.length) * dt;
    if (!run.ok || durationSec > CHANGE_LIMIT_SEC) continue;
    const judged = judge([run.end.lead, run.end.wing], { key: 'lab' }, { spacingFt });
    if (!judged.inBand) continue;
    if (!best || durationSec < best.durationSec - 0.5) best = { bankDeg, part, run, profile: [...profile, ...(runProfile ?? [])], leadSegs, judged, durationSec, offDeg };
  }
  if (!best) return null;
  const { part, run, judged, durationSec } = best;

  const fromWord = FORMATIONS[from.key].label;
  const sideWord = s > 0 ? ' left' : ' right';
  const how = describe(from.key, 'lab', 'none');
  const topKias = Math.max(...part.points.map((p) => p[1]));
  return {
    ok: true,
    plans: { [lead.id]: { segments: best.leadSegs.map((x) => ({ ...x })) }, [wing.id]: { segments: [{ kind: 'bankTrack', points: [...part.points, ...run.points] }], profile: best.profile } },
    note: `${fromWord}${sideWord} to Line abreast${sideWord}: ${how}. #2 sets MAX at the press and holds it (Patrick 5 Oct 22:39Z), rolls away at ${best.bankDeg}° to ${best.offDeg}° off Lead's heading and dives to about ${OPEN_OUT.diveFt} ft below him, falling back by geometry only, up to about ${Math.round(topKias)} KIAS; climbs back as he turns back parallel at about ${outAimFt.toLocaleString('en-CA')} ft out, then the tracker settles him in the band (SMM 16.18 para 49). Lead speeds up to ${KIAS_LAB} KIAS at the press (estimate). About ${Math.round(durationSec)} s.`,
    label: `${FORMATIONS.lab.label}${sideWord}`,
    flying: `${fromWord}${sideWord} to ${FORMATIONS.lab.label}${sideWord} (${how})`,
    from: from.key,
    fromSide: s,
    to: 'lab',
    side: s,
    rejoinKind: 'none',
    leadTurnDeg: 0,
    laneFwdFt: Math.max(part.laneFwdFt, run.laneFwdFt),
    maxBankDeg: Math.max(part.maxBankDeg, run.maxBankDeg),
    judged,
    endSec: t0 + durationSec,
    rejoining: false,
    handOverSec: null,
  };
}
