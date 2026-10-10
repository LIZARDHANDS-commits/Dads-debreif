// Changing formation, 2-ship (Turn Sim spec section 10, TS-53): the planner behind the
// "Change formation" buttons. Press one and the pair flies the manuals' transition from
// wherever it is now, planned at the press in the same style as the manoeuvres: each
// aircraft flies a pre-planned path through flight.js, at the T-6A's roll rate (flight.js gateRoll), smooth hand-overs.
//
// How it plans. Lead's part is a short list of ordinary segments (a speed change, and for
// a turning rejoin a 30° turn into #2). #2's part is worked out in a dry run: the tracker
// (tracker.js) flies #2 toward a slot in Lead's frame (the formation's position), commanding
// bank and speed the way a pilot would (small heading changes for slides, bank for the
// rejoin), through the very same flight.js step the real aircraft use. The bank and speed
// it commanded are recorded and replayed by the real aircraft (a 'bankTrack' segment), so
// the path drawn ahead is the path flown (spec F1). The run is done twice: once to learn when
// each leg starts and ends, then again with #2's height profile (smooth climbs and descents)
// built from those times.
//
// Since clean-up step 1 (TS-64) this file holds the moves only: the slots are slots.js, the
// classifier and judge judge.js, the tracker tracker.js and the speeds, rates and banks tuning.js. Since clean-up step 3 the
// replay step, the dry run, the recorded flights and the speed segment are replay.js, and the leg recipes and legsFor are
// recipes.js; this file keeps the change limit, the words for a change and planGoTo (the tracker-only planner, still
// reachable as the chooser's fallback).
//
// Sources (page references only): SMM 12.4 paras 11-12 (echelon), 12.5 para 13 (line astern),
// 12.6 para 15 (route), 12.20 paras 44-47 (station changes), 12.23 para 53 (200 KIAS),
// 12.24 paras 54-59 (turning rejoin), 12.26 paras 62-63 (straight-ahead rejoin), 12.27 para 65
// (overshoot, never at or above Lead's height), 12.29 para 69 (fighting wing), 16.15 para 38
// and AFM7 brief p.18 (close through route), 16.18 paras 49-51 (line abreast, entry),
// 16.20 paras 65-66 and Figs 16.24-16.25 (rejoins from line abreast), 16.32 para 92 and 16.38
// para 105 (drop back to fighting wing), EFIG p.371 and p.374 (overtake). Patrick 4 Oct 2026
// 11:08Z-11:09Z (200 KIAS outside line abreast, Lead turns into #2, speed only in
// transitions) and 11:45Z (wording agreed). Numbers with no manual or ruling behind them are
// labelled "estimate" beside them.
import { wholeDegree, turnSeg, DEG } from './manoeuvres.js';
import { classify, judge } from './judge.js';
import { trackTwice, PLAN_MAX_SEC } from './tracker.js';
import { FORMATIONS, LANE, sideFor } from './slots.js';
import { KIAS_OUTSIDE_LAB, KIAS_LAB, REJOIN, closureNow, rejoinClosureNow } from './tuning.js';
import { onClosure } from './hand-over.js';
import { leadTurnInto, trackTail } from './lead-turn-in.js';
import { recordFlight, speedSeg } from './replay.js';
import { legsFor } from './recipes.js';

// ---- the numbers -----------------------------------------------------------------------

/** A generous cap on how long one change may take (the spec's 3 minutes, an estimate): it only catches a planner that never finishes. */
export const CHANGE_LIMIT_SEC = 180;

/** The words for how a change is flown. */
export function describe(from, to, rejoinKind) {
  const fromLab = from === 'lab' || from === 'other';
  if (fromLab && to === 'lab') return 'in line abreast';
  if (fromLab) {
    const how = rejoinKind === 'straight' ? 'straight-ahead rejoin' : to === 'echelon' ? 'hot turning rejoin' : 'turning rejoin';
    return to === 'fw' ? how : to === 'echelon' ? how : `${how} to fighting wing, then ${to === 'route' ? 'close to route' : 'close and cross behind'}`;
  }
  if (to === 'lab') return 'entry to line abreast, Lead speeds up to 220 KIAS';
  if (to === 'fw') return from === 'fw' ? 'flow to the other side behind Lead' : 'drop back and sweep out, expeditious';
  if (from === 'fw') return 'straight-ahead rejoin';
  return 'station change';
}

// ---- the plan for a button press ---------------------------------------------------------------------

/**
 * Plans a change of formation for a pair [lead, wing] as they are now.
 * to: 'lab' | 'fw' | 'echelon' | 'route' | 'astern'. options: { side: 'keep' | 'left' | 'right', spacingFt, blockFt,
 * rejoin: 'into' | 'straight', lastSide (+1/-1, for a pair in line astern) }.
 * Returns { ok, reason?, plans: { id: { segments, profile } }, note, label, from, to, side, rejoinKind, endSec, rejoinPhase, maxBankDeg }.
 * When ok is false nothing should be flown and `reason` says why in one line (spec section 10, "When things go wrong").
 */
export function planGoTo(pair, to, options = {}, t0 = 0) {
  const [lead, wing] = pair;
  const spacingFt = options.spacingFt ?? 6000;
  const blockFt = options.blockFt ?? 8000;
  if (!FORMATIONS[to]) return { ok: false, reason: `There is no formation called ${to}.` };
  const from = classify([lead, wing]);
  const lastSide = options.lastSide ?? -1;
  const sCur = from.side || lastSide;
  const want = options.side ?? 'keep';
  const sTo = sideFor(to, want, sCur);
  if (from.key === to && (to === 'astern' || sTo === sCur)) return { ok: false, reason: `Already in ${FORMATIONS[to].label.toLowerCase()}.` };
  if (from.key === 'lab' && to === 'lab') return { ok: false, reason: 'Already in line abreast.' };
  const rejoinOpt = options.rejoin ?? 'into';
  const fromLab = from.key === 'lab' || from.key === 'other';
  const rejoinKind = fromLab && to !== 'lab' ? (rejoinOpt === 'straight' || from.key === 'other' ? 'straight' : 'into') : 'none';
  // Away (TS-174) is the turning rejoin's own: the tracker here would fly Lead into #2, so it stays out of the race.
  // From trail after a break (TS-175) a TRJ press is the turning rejoin's too; this one would fly a straight-ahead rejoin.
  if (options.trailSide && from.key === 'other' && rejoinOpt === 'into') return { ok: false, reason: 'No turning rejoin from this trail. Try SARJ.' };
  if (options.turn === 'away' && (rejoinKind === 'into' || (from.key === 'fw' && to !== 'fw'))) {
    return { ok: false, reason: 'No turning rejoin with Lead turning away from here. Try Into.' };
  }
  const targetKias = to === 'lab' ? KIAS_LAB : KIAS_OUTSIDE_LAB;
  // Every leg on the power profile at the Rates choice's closure, a rejoin's up to route (clean-up step 2, TS-65; Patrick
  // 05:46Z, 05:47Z, 05:54Z, 06:09Z).
  const phases = onClosure(legsFor(from.key, sCur, to, sTo, spacingFt));
  if (!phases.length) return { ok: false, reason: 'Nothing to change.' };
  if (options.overtakeKias !== undefined || options.bankCapDeg !== undefined) {
    for (const p of phases) {
      if (p.bankCapDeg === REJOIN.bankCapDeg && options.bankCapDeg !== undefined) p.bankCapDeg = options.bankCapDeg;
      if (p.overtakeKias === REJOIN.overtakeKias && options.overtakeKias !== undefined) p.overtakeKias = options.overtakeKias;
    }
  }

  const speedSegs = Math.abs(lead.kias - targetKias) > 0.5 ? [speedSeg(lead.kias, targetKias, blockFt)] : [];
  // In a turning rejoin Lead slows while he turns, so the turn starts at the press (Patrick 05:29Z).
  const slowWhileTurning = speedSegs.map((x) => ({ ...x, withNext: true }));
  const judgeEnd = (attempt) => judge([attempt.run.end.lead, attempt.run.end.wing], { key: to }, { spacingFt });
  const finished = (attempt) => attempt.run.ok && judgeEnd(attempt).inBand && attempt.run.durationSec <= CHANGE_LIMIT_SEC;
  // A rejoin has to keep the overshoot lane (never ahead of Lead's 3/9 line inside 1,000 ft, +-100 ft) and stay under Lead (SMM 12.27 para 65).
  const laneOk = (attempt) => attempt.run.laneFwdFt <= LANE.marginFt && attempt.run.minBelowFt > 0;
  /** @type {any} */
  let best = null;
  if (rejoinKind === 'into') {
    // Lead holds his 30° turn until #2 is IN POSITION, then rolls out (Patrick 5 Oct 06:16Z item 3: "until 2 is on";
    // V2.59, TS-67): a first run against Lead turning on finds when #2 settles, the second flies against Lead rolling out
    // then (lead-turn-in.js leadTurnInto, trackTail).
    const into = leadTurnInto({ lead, pre: slowWhileTurning, s: sCur, bankDeg: REJOIN.leadBankDeg, t0, record: recordFlight });
    const tail = trackTail({ wing, lead, leadRec: into.longRec, phases, t0, blockFt, leadPlanFor: into.planTo });
    if (tail.lp) {
      const attempt = { leadSegs: tail.lp.segments, run: tail.run, profile: tail.profile, turnDeg: Math.round(tail.lp.turned / DEG) };
      if (finished(attempt)) best = attempt;
    }
  }
  if (rejoinKind === 'into' && !best) {
    // "Hot turning rejoin ALWAYS begins with lead IMMEDIATELY turning towards 2" (Patrick 5 Oct 05:29Z): Lead turns into #2
    // at the press, slowing as he turns (SMM 16.20 para 65b); the turn is the first angle that keeps the overshoot lane, or
    // failing that the first that finishes (the lane is flagged on the card, never a wall). Until step 2 Lead waited for
    // closure first, or held straight when no turn kept the lane. Since V2.59 only when Lead turning until #2 is in
    // doesn't finish.
    let fallback = null;
    for (const turnDeg of REJOIN.turnAnglesDeg) {
      const leadSegs = [...slowWhileTurning, turnSeg(wholeDegree(lead.headingRad + sCur * turnDeg * DEG), sCur, REJOIN.leadBankDeg)];
      const attempt = { ...trackTwiceOffLead(lead, wing, leadSegs, t0, phases, blockFt), turnDeg };
      if (finished(attempt) && laneOk(attempt)) {
        best = attempt;
        break;
      }
      if (!fallback && finished(attempt)) fallback = attempt;
    }
    best ??= fallback ?? { ...trackTwiceOffLead(lead, wing, [...slowWhileTurning, turnSeg(wholeDegree(lead.headingRad + sCur * REJOIN.turnAnglesDeg[0] * DEG), sCur, REJOIN.leadBankDeg)], t0, phases, blockFt), turnDeg: REJOIN.turnAnglesDeg[0] };
  } else if (!best) {
    best = { ...trackTwiceOffLead(lead, wing, speedSegs, t0, phases, blockFt), turnDeg: 0 };
  }
  best.judged = judgeEnd(best);
  best.good = finished(best);
  if (!best.good) {
    return {
      ok: false,
      reason: !best.run.ok
        ? `No safe rejoin from here: the planner could not reach ${FORMATIONS[to].label.toLowerCase()} inside ${Math.round(PLAN_MAX_SEC / 60)} minutes.`
        : !best.judged.inBand
          ? `No safe rejoin from here: ${best.judged.text}`
          : `No safe rejoin from here: it would take more than ${Math.round(CHANGE_LIMIT_SEC / 60)} minutes.`,
      from: from.key,
      to,
    };
  }
  const { leadSegs, run, profile } = best;
  const plans = {
    [lead.id]: { segments: leadSegs.map((s) => ({ ...s })) },
    [wing.id]: { segments: [{ kind: 'bankTrack', points: run.points }], profile },
  };
  const how = describe(from.key, to, rejoinKind);
  const sideWord = to === 'astern' ? '' : sTo > 0 ? ' left' : ' right';
  const fromWord = FORMATIONS[from.key]?.label ?? 'In trail';
  const fromSide = from.key === 'astern' || from.key === 'other' ? '' : sCur > 0 ? ' left' : ' right';
  const turnNote = best.turnDeg
    ? ` Lead turns ${best.turnDeg}° into #2 at the press at ${REJOIN.leadBankDeg}° bank, slowing to ${KIAS_OUTSIDE_LAB} KIAS; #2 closes at ${rejoinClosureNow().kt} kt, to fighting wing or route, then ${closureNow().kt} kt into the slot.`
    : '';
  return {
    ok: true,
    plans,
    note: `${fromWord}${fromSide} to ${FORMATIONS[to].label}${sideWord}: ${how}.${turnNote}`,
    label: `${FORMATIONS[to].label}${sideWord}`,
    flying: `${fromWord}${fromSide} to ${FORMATIONS[to].label}${sideWord} (${how})`,
    from: from.key,
    fromSide: sCur,
    to,
    side: sTo,
    rejoinKind,
    leadTurnDeg: best.turnDeg,
    laneFwdFt: best.run.laneFwdFt,
    maxBankDeg: run.maxBankDeg,
    judged: best.judged,
    endSec: t0 + run.durationSec,
    rejoining: fromLab && to !== 'lab',
  };
}

/** Two passes of the tracker: the first learns the leg times, the second flies with #2's height profile built from them. */
function trackTwiceOffLead(lead, wing, leadSegs, t0, phases, blockFt) {
  const refs = { [lead.id]: recordFlight(lead, { segments: leadSegs }, t0) };
  return { leadSegs, ...trackTwice({ refs, wing0: wing, t0, phases, blockFt, stopWhenSettled: true }) };
}
