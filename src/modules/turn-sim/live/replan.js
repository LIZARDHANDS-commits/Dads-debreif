// A press while a move is still flown (spec F11, TS-76's second piece; Patrick 5 Oct 19:51Z: "I want to be able to 'change
// the plan' mid change and have the wingman react correctly"; card 19:54Z "Yes, as written"): the change is planned again at
// once from where the pair is, bank and speed included, and nothing is queued. This file holds the one candidate the
// chooser (chooser.js) adds then, "from here": #2 flies from where he is to the new place with the tracker, by the manuals'
// legs from the formation place he is nearest to, against Lead's flight as the press leaves it:
//  - in a turn of Lead's own (a formation turn, a fighting wing move, a line abreast manoeuvre) Lead flies the rest of it:
//    a formation command for #2 doesn't change Lead's flying;
//  - in a turning rejoin, Lead holds his turn into #2 until #2 is in, then rolls out (SMM 16.20 para 65b; Patrick 06:16Z
//    item 3: "until 2 is on"), whatever the new place, except line abreast;
//  - otherwise Lead flies straight, at the new formation's speed.
// It changes no flight physics and no planner: the legs are transitions.js's, the tracker tracker.js's.
import { relativeTo } from './manoeuvres.js';
import { recordFlight, speedSeg, legsFor, rejoinTo, closeThrough, slide, openOut, cornerBehind, CHANGE_LIMIT_SEC } from './transitions.js';
import { judge } from './judge.js';
import { FORMATIONS, FW_BAND, LANE, pairSlot } from './slots.js';
import { KIAS_LAB, KIAS_OUTSIDE_LAB, HAND_OVER_FT, FW_FOLLOW, TURNING_REJOIN } from './tuning.js';
import { crossBehindFwd } from './kinematic-moves.js';
import { onClosure, leadTurnInto, trackTail } from './hand-over.js';
import { trackTwice, phase } from './tracker.js';
import { STEP_SEC } from './flight.js';
import { fwGoal, slideInPlane } from './formation-turns.js';
import { wingFromPose } from './hand-over.js';

/** Further than this from the new place, #2 closes on it with a rejoin's leg rather than a station change's (feet, an estimate: about route's spacing). */
const CLOSE_LEG_FT = 100;

const CLOSE = new Set(['echelon', 'route', 'astern']);

/** The formation place #2 is nearest to now, on his own side: { key, side, offFt }, side 0 for line astern. */
export function nearestPlace(lead, wing, spacingFt = 6000, lastSide = -1) {
  const rel = relativeTo(lead, wing);
  const s = Math.sign(rel.left) || lastSide;
  let best = { key: 'lab', side: s, offFt: Infinity };
  for (const key of Object.keys(FORMATIONS)) {
    const side = key === 'astern' ? 0 : s;
    const slot = pairSlot(key, side, spacingFt);
    const offFt = Math.hypot(rel.fwd - slot.fwd, rel.left - slot.left);
    if (offFt < best.offFt) best = { key, side, offFt };
  }
  return best;
}

/**
 * The legs from the place #2 is nearest to (near, on side s; rel, where he is in Lead's frame) to `to` on side sTo: in
 * fighting wing on his own side, the whole cone (he settles where he is in it, Patrick 08:58Z); between the close places on
 * his own side, straight into the new one; when he is already nearest the new place, straight into it; from out wide (line
 * abreast or fighting wing) to a close place, a rejoin to route on his side and the close legs from there (the turning
 * rejoin's tail); otherwise the change's own legs (transitions.js legsFor).
 */
export function legsFromHere(near, s, to, sTo, rel, spacingFt = 6000, turning = false) {
  const slot = (key, side) => pairSlot(key, side, spacingFt);
  if (turning && s !== sTo && sTo !== 0 && to !== 'lab' && (near.key === 'fw' || CLOSE.has(near.key))) return acrossSixLegs(rel, s, to, sTo, spacingFt);
  const offFt = Math.hypot(rel.fwd - slot(to, sTo).fwd, rel.left - slot(to, sTo).left);
  const sameSide = to === 'astern' || s === sTo;
  if (to === 'fw' && near.key === 'fw' && sameSide) {
    return [phase({ fwd: rel.fwd, left: rel.left, alt: slot('fw', sTo).alt }, { ...FW_FOLLOW, goal: (L, W) => fwGoal(L, W, sTo, false) })];
  }
  if (sameSide && CLOSE.has(to) && (near.key === to || (CLOSE.has(near.key) && near.key !== 'astern' && to !== 'astern'))) {
    return [offFt > CLOSE_LEG_FT ? closeThrough(slot(to, sTo)) : slide(slot(to, sTo))];
  }
  if (near.key === to && sameSide) {
    if (to === 'lab') return [openOut(slot('lab', sTo))];
    return [rejoinTo(slot(to, sTo))];
  }
  if (CLOSE.has(to) && !CLOSE.has(near.key)) {
    const rest = legsFor('route', s, to, sTo, spacingFt);
    return [rejoinTo(slot('route', s), rest.length ? { advanceTol: 40 } : {}), ...rest];
  }
  return legsFor(near.key, s, to, sTo, spacingFt);
}

/**
 * To the other side with Lead turning into #2 until he is in there (Patrick 5 Oct 22:35Z: "on a turning rejoin that rejoins
 * to the opposite side lead should keep turning until 2 is in eschelon"; TS-87): #2 flows across Lead's six in one motion,
 * inside the turn. To fighting wing: through a point behind Lead outside the bubble (the side swap's crossing,
 * kinematic-moves.js) into the far cone, at the rejoin's closure (marked `rejoin`); to a close formation: through the
 * corners behind it on both sides (SMM 12.20 paras 44-45's crossover, flowed, not stopped) into the slot.
 */
export function acrossSixLegs(rel, s, to, sTo, spacingFt = 6000) {
  const slot = (key, side) => pairSlot(key, side, spacingFt);
  if (to === 'fw') {
    // Straight across from where he is: from inside the cone's inner edge no straight line stays outside it, and going aft
    // first costs about 10 s (sims, 5 Oct), so he passes about 400 ft behind Lead.
    const alt = slot('fw', sTo).alt;
    const cross = { fwd: crossBehindFwd(Math.max(Math.hypot(rel.fwd, rel.left), FW_BAND.rangeFt[0])), left: 0, alt };
    return [
      phase(cross, { ...FW_FOLLOW, rejoin: true, advanceTol: TURNING_REJOIN.crossFlowFt }),
      phase(cross, { ...FW_FOLLOW, rejoin: true, goal: (L, W) => fwGoal(L, W, sTo, false) }),
    ];
  }
  const flow = { advanceTol: TURNING_REJOIN.routeFlowFt };
  return [closeThrough(cornerBehind(slot(to, s), spacingFt), flow), closeThrough(cornerBehind(slot(to, sTo), spacingFt), flow), closeThrough(slot(to, sTo))];
}

/**
 * The "from here" candidate as a "Change formation" plan (planGoTo's shape, transitions.js), or { ok: false, reason }.
 * options: planGoTo's ({ side, spacingFt, blockFt, lastSide }) and `mid`, how Lead flies on:
 * { lead: { kind: 'carry', plan } } the rest of his own move (plan: his { segments, profile } as the press leaves them),
 * { lead: { kind: 'hold', s, bankDeg } } his turn into #2 held until #2 is in, or { lead: { kind: 'straight' } }.
 */
export function planFromHere(pair, to, options = {}, t0 = 0) {
  const [lead, wing] = pair;
  if (!FORMATIONS[to]) return { ok: false, reason: `There is no formation called ${to}.` };
  const spacingFt = options.spacingFt ?? 6000;
  const blockFt = options.blockFt ?? 8000;
  const near = nearestPlace(lead, wing, spacingFt, options.lastSide ?? -1);
  const s = near.side || Math.sign(relativeTo(lead, wing).left) || (options.lastSide ?? -1);
  const want = options.side ?? 'keep';
  const sTo = to === 'astern' ? 0 : want === 'left' ? 1 : want === 'right' ? -1 : s;
  const toSlot = pairSlot(to, sTo, spacingFt);
  const rel = relativeTo(lead, wing);
  const closeIn = Math.hypot(rel.fwd - toSlot.fwd, rel.left - toSlot.left) <= HAND_OVER_FT;
  const how = options.mid?.lead ?? { kind: 'straight' };
  // Already nearest the new place or a close one, #2 is in: Lead's turn into him has done its job and he rolls out. Going to
  // the other side, Lead keeps turning until #2 is in there (acrossSixLegs; TS-87).
  const holding = how.kind === 'hold' && to !== 'lab' && (s !== sTo || (near.key !== to && !CLOSE.has(near.key)));
  const across = holding && s !== sTo;
  const phases = onClosure(legsFromHere(near, s, to, sTo, rel, spacingFt, holding), { closeIn: !across && (closeIn || (to === 'fw' && near.key === 'fw')) });
  if (!phases.length) return { ok: false, reason: 'Nothing to change.' };

  const targetKias = to === 'lab' ? KIAS_LAB : KIAS_OUTSIDE_LAB;
  const speed = Math.abs(lead.kias - targetKias) > 0.5 ? [{ ...speedSeg(lead.kias, targetKias, blockFt), withNext: true }] : [];
  const carried = how.kind === 'carry' ? how.plan.segments.map((x) => ({ ...x })) : [];
  const withHeight = (segments) => ({ segments, ...(how.kind === 'carry' && how.plan.profile ? { profile: how.plan.profile } : {}) });
  const label = `${FORMATIONS[to].label}${to === 'astern' ? '' : sTo > 0 ? ' left' : ' right'}`;
  const leadWords = (holds, speeds) => (holds
    ? 'Lead holds his turn into #2 until #2 is in, then rolls out'
    : how.kind === 'carry'
      ? 'Lead flies on with his own move'
      : `Lead flies straight${speeds ? `, at ${targetKias} KIAS` : ''}`);
  const shape = { label, flying: `${label} (from here)`, from: near.key, fromSide: s, to, side: sTo };

  // Between echelon and route on his own side: along Lead's wing line, held in Lead's wing plane (formation-turns.js
  // slideInPlane, the close turns' hold), Lead flying on as he was, so a station change in a turn stays in the plane.
  const planeSlot = (k) => k === 'echelon' || k === 'route';
  if (s === sTo && planeSlot(to) && planeSlot(near.key) && Math.abs(lead.bankDeg) > 1) {
    const leadPlan = withHeight([...speed, ...carried]);
    const held = slideInPlane(lead, wing, leadPlan, toSlot, t0);
    const L = held.leadRec.at(held.steps);
    const judged = judge([{ ...lead, ...L }, wingFromPose(wing, held.poses[held.poses.length - 1])], { key: to, side: sTo }, { spacingFt });
    if (judged.inBand && held.steps * STEP_SEC <= CHANGE_LIMIT_SEC) {
      let laneFwdFt = -Infinity;
      held.poses.forEach((p, i) => (laneFwdFt = Math.max(laneFwdFt, relativeTo(held.leadRec.at(i + 1), { xFt: p.x, yFt: p.y }).fwd)));
      return {
        ok: true,
        ...shape,
        plans: { [lead.id]: { segments: leadPlan.segments.map((x) => ({ ...x })), ...(leadPlan.profile ? { profile: leadPlan.profile } : {}) }, [wing.id]: { segments: [{ kind: 'poseTrack', poses: held.poses }] } },
        note: `${label}, planned again from here (F11): ${leadWords(false, speed.length > 0)}; #2 moves along his wing line into ${FORMATIONS[to].label.toLowerCase()}, holding Lead's wing plane with G, pitch and bank (SMM 12.19 paras 41-43).`,
        rejoinKind: 'none',
        laneFwdFt,
        maxBankDeg: held.poses.reduce((m, p) => Math.max(m, Math.abs(p.bank)), 0),
        judged,
        endSec: t0 + held.steps * STEP_SEC,
        rejoining: false,
      };
    }
  }
  const laneFt = Math.max(0, toSlot.fwd) + LANE.marginFt; // the overshoot lane (slots.js LANE); a slot behind Lead counts as 0 here, unlike chooser.js
  const judgeRun = (r) => judge([r.end.lead, r.end.wing], { key: to, side: sTo }, { spacingFt });
  const good = (r) => r.ok && r.durationSec <= CHANGE_LIMIT_SEC && judgeRun(r).inBand;
  const fly = (leadPlan) => ({ leadPlan, ...trackTwice({ refs: { [lead.id]: recordFlight(lead, leadPlan, t0) }, wing0: wing, t0, phases, blockFt }) });
  let best;
  if (holding) {
    const into = leadTurnInto({ lead, pre: speed, s: how.s, bankDeg: how.bankDeg, t0, record: recordFlight });
    const tail = trackTail({ wing, lead, leadRec: into.longRec, phases, t0, blockFt, leadPlanFor: into.planTo });
    if (!tail.lp) return { ok: false, reason: 'No safe change from here.' };
    best = { leadPlan: { segments: tail.lp.segments }, run: tail.run, profile: tail.profile };
  } else {
    // Lead's speed change with the move; or, when #2 would pass Lead's 3/9 line chasing a Lead who slows under him (the
    // tracker reads Lead's speed as it is, not as it will be), once #2 is in (a Lead doesn't change speed while his wingman
    // is moving in close).
    best = fly(withHeight([...speed.map((x) => ({ ...x, withNext: carried.length > 0 })), ...carried]));
    if (speed.length && !(good(best.run) && best.run.laneFwdFt <= laneFt)) {
      const first = trackTwice({ refs: { [lead.id]: recordFlight(lead, withHeight(carried.map((x) => ({ ...x }))), t0) }, wing0: wing, t0, phases, blockFt, stopWhenSettled: true });
      const inSec = t0 + first.run.points.length * STEP_SEC;
      const after = fly(withHeight([...carried, { kind: 'hold', untilSec: inSec, thenNext: true }, ...speed.map((x) => ({ ...x, withNext: false }))]));
      if (good(after.run) && (after.run.laneFwdFt <= laneFt || !good(best.run))) best = after;
    }
  }
  const { leadPlan, run, profile } = best;
  const judged = judgeRun(run);
  if (!good(run)) return { ok: false, reason: `No safe change from here: ${run.ok ? judged.text : 'it does not settle.'}` };

  return {
    ok: true,
    ...shape,
    plans: {
      [lead.id]: { segments: leadPlan.segments.map((x) => ({ ...x })), ...(leadPlan.profile ? { profile: leadPlan.profile } : {}) },
      [wing.id]: { segments: [{ kind: 'bankTrack', points: run.points }], profile },
    },
    note: `${label}, planned again from here (F11): ${leadWords(holding, speed.length > 0)}; #2 goes from where he is${near.key === to ? '' : ` by way of ${FORMATIONS[near.key].label.toLowerCase()}'s legs`} into ${FORMATIONS[to].label.toLowerCase()}.`,
    rejoinKind: holding ? 'into' : 'none',
    laneFwdFt: run.laneFwdFt,
    maxBankDeg: run.maxBankDeg,
    judged,
    endSec: t0 + run.durationSec,
    rejoining: to !== 'lab' && !CLOSE.has(near.key) && (to !== 'fw' || near.key !== 'fw'),
  };
}
