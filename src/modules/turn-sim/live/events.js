// The events of a 2-ship change in flight (refactor PR 5, TS-97; moved from formation.js unchanged in what they do): the
// decision point and the picture breaking, which plan the change again from where the pair is (spec F1); a turn button
// pressed mid-change (spec F11); how Lead flies on when a change is pressed mid-move; and "done", in band and steady
// (TS-78). formation.js keeps the public surface (reset, press, change, step and the rest) and calls these each step.
// A change whose plan says `holdsPlan` (the 4-ship's, the lag roll's, a move in the band's) flies its plan with no re-plan;
// the 4-ship's is still done once every wingman is in band and steady (TS-99).
import { KT_TO_FTPS } from '../../../core/units.js';
import { STEP_SEC, planDone } from './flight.js';
import { relativeTo } from './manoeuvres.js';
import { judge } from './judge.js';
import { refsFor } from './slots.js';
import { TIE_SEC } from './chooser.js';
import { leadTurnPlan } from './formation-turns.js';
import { REJOIN, STEADY } from './tuning.js';

/**
 * The picture breaking (spec F1): Lead or #2 this far from where the plan has him at this moment plans the change again from
 * where the pair is. The shared table's ±100 ft margin (docs/TESTING.md), an estimate as a trigger. Nothing in the sim moves an
 * aircraft off its plan today (no turbulence, Lead flies only what a press gives him), so it waits for a cause (Patrick
 * 21:44Z card "Build it anyway").
 */
export const PICTURE_BREAK_FT = 100;
/** After a re-plan for a broken picture that found nothing better, the next try waits this long (seconds, an estimate). */
export const PICTURE_RETRY_SEC = 2;

/**
 * The events for one formation. ctx: { state, startChange(to, changeOptions, midLead), labelFor(key, dir) }, formation.js's.
 * Returns { replanAtEvents, turnMidChange, midPress, inBandAndSteady }.
 */
export function createEvents({ state, startChange, labelFor }) {
  /** A 2-ship change that re-plans at its events (not one that holds its plan: the 4-ship, the lag roll). */
  const replans = (c) => Boolean(c?.change) && !c.change.holdsPlan;

  /**
   * The events that plan a 2-ship change again from where the pair is (spec F1; the press and the hand-over are planned
   * again elsewhere): the decision point (a turning rejoin's, where a stop at idle just fits), taken only when the new plan
   * ends sooner (by more than the chooser's tie); and the picture breaking, Lead or #2 more than PICTURE_BREAK_FT from where
   * the plan has him now, taken whenever the new plan passes.
   */
  function replanAtEvents() {
    const c = state.current;
    if (!replans(c)) return;
    if (c.decisionSec != null && !c.decided && state.tSec >= c.decisionSec - STEP_SEC / 2) {
      c.decided = true;
      replanChange('the decision point', true);
      return;
    }
    if (state.tSec < (c.pictureRetrySec ?? -Infinity)) return;
    if (state.aircraft.some((a) => offPlanFt(a) > PICTURE_BREAK_FT)) {
      if (!replanChange('the picture breaking', false)) c.pictureRetrySec = state.tSec + PICTURE_RETRY_SEC;
    }
  }

  /** How far an aircraft is from where its planned line (state.planned) has it now, feet; 0 once past the line's end. */
  function offPlanFt(a) {
    const pts = state.planned[a.id];
    if (!pts?.length || state.tSec > pts[pts.length - 1][0] || state.tSec < pts[0][0]) return 0;
    let i = 1;
    while (i < pts.length - 1 && pts[i][0] < state.tSec) i++;
    const [t0, x0, y0] = pts[i - 1];
    const [t1, x1, y1] = pts[i];
    const f = t1 > t0 ? (state.tSec - t0) / (t1 - t0) : 1;
    return Math.hypot(a.xFt - (x0 + (x1 - x0) * f), a.yFt - (y0 + (y1 - y0) * f));
  }

  /**
   * The change planned again from where the pair is, Lead flying on as midPress says (the chooser's mid-move candidates).
   * quicker: keep the old plan unless the new one ends sooner. Returns true when the new plan is flown; otherwise nothing
   * changes.
   */
  function replanChange(why, quicker) {
    const c = state.current;
    const was = { current: c, plans: state.plans, planned: state.planned, refusal: state.refusal, judged: state.judged, errorOutcome: state.errorOutcome };
    const side = c.change.side > 0 ? 'left' : c.change.side < 0 ? 'right' : 'keep';
    const ok = startChange(c.change.to, { ...c.change.options, side });
    if (!ok || (quicker && state.current.endSec > c.endSec - TIE_SEC)) {
      Object.assign(state, was);
      return false;
    }
    state.current.label = c.label;
    state.current.startSec = c.startSec;
    state.current.decided = true;
    state.current.note = `${state.current.note} Planned again at ${why}.`;
    return true;
  }

  /**
   * A turn button pressed while #2 is still changing formation, 2-ship (spec F11; Fable's handover item 1): Lead flies the
   * turn now, as he would in the formation #2 is going to, and #2's change is planned again from where he is against it
   * (replan.js, the chooser's "from here"), so nothing waits in the queue. Not a change that holds its plan or a change to
   * line abreast (its turns are both aircraft's manoeuvres). Returns true when it started, false to queue as before.
   */
  function turnMidChange(key, dir) {
    const c = state.current;
    if (!replans(c)) return false;
    const leadPlan = leadTurnPlan(state.aircraft[0], c.change.to, key, dir);
    if (!leadPlan) return false;
    const side = c.change.side > 0 ? 'left' : c.change.side < 0 ? 'right' : 'keep';
    const was = { refusal: state.refusal };
    if (!startChange(c.change.to, { side }, leadPlan)) {
      state.refusal = was.refusal;
      return false;
    }
    state.current.label = `${labelFor(key, dir)}, ${state.current.label.toLowerCase()}`;
    state.queued = null;
    return true;
  }

  /**
   * How Lead flies on when a change is pressed mid-move (spec F11, replan.js): the rest of his own move (a turn, a fighting
   * wing move, a line abreast manoeuvre); in a turning rejoin, his turn into #2 held until #2 is in; otherwise straight.
   */
  function midPress(c) {
    const lead = state.aircraft[0];
    const plan = state.plans[lead.id] ?? { segments: [] };
    if (!c.change) return { lead: { kind: 'carry', plan: { segments: plan.segments.map((x) => ({ ...x })), profile: plan.profile } } };
    if (c.change.rejoining && c.change.rejoinKind === 'into' && Math.abs(lead.bankDeg) > 1) return { lead: { kind: 'hold', s: Math.sign(lead.bankDeg), bankDeg: REJOIN.leadBankDeg } };
    return { lead: { kind: 'straight' } };
  }

  /**
   * A 2-ship change of formation is done once #2 is IN POSITION (the judge's band) and steady, not when the tracker has
   * settled on the exact slot (Patrick 5 Oct 20:39Z card "In band and steady"; TS-78): the tracker's plan keeps flying
   * underneath and goes on holding the slot. Steady is #2's speed against the slot under STEADY.closureKt ("stabilize"
   * means within 5 knots, Patrick 20:41Z), his bank within STEADY.bankOffDeg of Lead's, and Lead's own plan done (his
   * speed change, his turn-in rolled out). Not a change that holds its plan (the lag roll ends on its own; the 4-ship).
   */
  function inBandAndSteady() {
    const c = state.current;
    if (c?.change?.four) return fourInBandAndSteady(c);
    if (!replans(c)) return false;
    const [lead, wing] = state.aircraft;
    // Line abreast is a wide band: once #2 is in it and steady, Lead finishing his speed-up to 220 KIAS is ordinary formation
    // keeping, not part of the change (estimate pending Patrick's card, 21:15Z; the other changes wait for Lead's plan).
    if (c.change.to !== 'lab' && !planDone(lead, state.plans[lead.id])) return false;
    const rel = relativeTo(lead, wing);
    const prev = c.relPrev;
    c.relPrev = { fwd: rel.fwd, left: rel.left, up: wing.altAboveFt - lead.altAboveFt, tSec: state.tSec };
    if (!prev) return false;
    const dtSec = Math.max(STEP_SEC, state.tSec - prev.tSec);
    // In fighting wing his climb or descent inside the cone is energy, not closure (the cone's height is his: TS-96).
    const upFt = c.change.to === 'fw' ? 0 : c.relPrev.up - prev.up;
    const closureFtps = Math.hypot(rel.fwd - prev.fwd, rel.left - prev.left, upFt) / dtSec;
    if (closureFtps > STEADY.closureKt * KT_TO_FTPS) return false;
    if (Math.abs(wing.bankDeg - lead.bankDeg) > STEADY.bankOffDeg) return false;
    // The judge's band is sideless for the pair: a change of side is done only on the new side.
    const side = c.change.side ?? 0;
    if (side !== 0 && Math.sign(rel.left) !== side) return false;
    return judge(state.aircraft, { key: c.change.to, side }, { spacingFt: state.spacingFt }).inBand;
  }

  /**
   * The four's change is done the same way, link by link (refactor PR 6, TS-99; Fable's plan "one judge"): every wingman in
   * his band off the aircraft he flies off (judge.js) and steady against it (STEADY: within 5 kt, his bank within 10° of
   * his reference's), with Lead's own plan done. Until V2.97 it waited for every tracker to settle on its exact slot, which
   * added about a minute to every change after the four were already in position.
   */
  function fourInBandAndSteady(c) {
    const lead = state.aircraft[0];
    if (!planDone(lead, state.plans[lead.id])) return false;
    const refs = refsFor(c.change.to);
    const by = new Map(state.aircraft.map((a) => [a.id, a]));
    const links = {};
    for (const a of state.aircraft.slice(1)) {
      const ref = by.get(refs[a.id]);
      const rel = relativeTo(ref, a);
      links[a.id] = { fwd: rel.fwd, left: rel.left, up: a.altAboveFt - ref.altAboveFt, bankOff: Math.abs(a.bankDeg - ref.bankDeg) };
    }
    const prev = c.relPrev;
    c.relPrev = { links, tSec: state.tSec };
    if (!prev?.links) return false;
    const dtSec = Math.max(STEP_SEC, state.tSec - prev.tSec);
    const fw = c.change.to === 'fw' || c.change.to === 'fluid4';
    for (const [id, l] of Object.entries(links)) {
      const p = prev.links[id];
      // In fighting wing his climb or descent inside the cone is energy, not closure (TS-96), as for the pair.
      const closureFtps = Math.hypot(l.fwd - p.fwd, l.left - p.left, fw ? 0 : l.up - p.up) / dtSec;
      if (closureFtps > STEADY.closureKt * KT_TO_FTPS || l.bankOff > STEADY.bankOffDeg) return false;
    }
    return judge(state.aircraft, { key: c.change.to, side: c.change.side ?? 0 }, { spacingFt: state.spacingFt }).inBand;
  }

  return { replanAtEvents, turnMidChange, midPress, inBandAndSteady };
}
