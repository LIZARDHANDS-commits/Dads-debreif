// Changing formation, 4-ship (Turn Sim spec section 8, decision TS-54; design: project files
// turn-sim-review/four-ship/design.md sections 4 to 6 and 9). Press a formation and the four fly the manuals'
// way there from wherever they are, planned at the press: Lead flies ordinary segments, and each wingman's path is a
// recorded dry run of the 2-ship's tracker (transitions.js runTracker) flying to its slot in the frame of the aircraft
// it flies off, through the same flight step as every other aircraft, so the path drawn is the path flown (spec F1).
//
// How it plans.
//  - The slots are four-ship-slots.js's one table.
//  - The route is the cheapest way through the from-to graph (design section 6): every formation joins fighting wing or
//    finger by a move the manuals give; anything else goes through them. Each edge is one or more legs.
//  - A leg plans Lead first, then the wingmen in an order where the aircraft each flies off is already planned
//    (#4 off #3 "flies through #3", SMM 16.37 para 103), each against the others' recorded flights.
//  - "Wait for the one ahead" (SMM 16.32 para 86, 16.34 paras 95-96; AFM7 brief p.18 item 2d) is a gate: a start
//    time from the earlier aircraft's planned arrival (`holdUntil`), or a new leg that starts when every aircraft of
//    the last one is settled. Legs join on the exact step they were planned from (flight.js hold thenNext).
//  - Speeds: 200 KIAS outside line abreast, 220 in it (Patrick, 4 Oct 11:08Z), changed only inside a change with the
//    smooth speed segment (full power up, 1.5 kt/s down, an estimate).
//
// Sources for each move are beside it. Numbers with no manual or ruling behind them say "estimate".
import { STEP_SEC, copyAircraft, planDone } from './flight.js';
import { relativeTo, turnSeg, wholeDegree, onStep, DEG, TURN_BANK_DEG } from './manoeuvres.js';
import {
  recordFlight, trackTwice, flyStep, dryRunT, speedSeg, phase, slide, dropBack, closeThrough, rejoinTo, openOut,
  slotFor, REJOIN, straightAhead, sweepOut,
} from './transitions.js';
import { FOUR_FORMATIONS, fourSlots, isStacked, classifyFour, judgeFourFormation, refsFor, fourWords, FW_STEP_DOWN_FT } from './four-ship-slots.js';

/** A generous limit on one 4-ship change (design section 9: Spread 4 to finger is estimated at 4 to 6 minutes); it only catches a plan that never ends. */
export const FOUR_CHANGE_LIMIT_SEC = 480;
/** #3 starts opening out this long after #4 when finger goes to Spread 4 ("#3 waits for #4 to begin moving out first", SMM 16.42 para 114): an estimate. */
const THREE_WAITS_SEC = 10;
/** Lead's turn into the others in a turning rejoin from fighting wing to finger: 90° at 30° bank (an estimate; SMM 16.34 para 96 gives the 30° bank, not the angle). */
const FINGER_TURN_DEG = 90;
/** The overtake the rear wingmen use to close from far out (estimate: the straight-ahead rejoin's 20 to 30 KIAS, EFIG p.371). */
const FAR_OVERTAKE_KIAS = 25;
/**
 * Height changes (the stack coming on or off) average no more than this: 15 ft/s, 900 ft/min, so about 1,700 ft/min at
 * the steepest point of the smooth leg (an estimate; the manuals give no rate).
 */
const GENTLE_ALT_FTPS = 15;
/** Close-formation crossings go behind and below (SMM 16.32 paras 87-88): 15 ft below Lead, #4 a further 10 ft below #3 (estimates). */
const CROSS_LOW_FT = 15;
const FOUR_LOWER_FT = 10;

const NAMES = Object.freeze({ 1: 'Lead', 2: '#2', 3: '#3', 4: '#4' });
// The 2-ship's close places (transitions.js), read when a move is planned: these modules import each other, so nothing
// here may call into transitions.js while the modules are still loading.
const ech = () => slotFor('echelon', 1); // { fwd: -25, left: 45, alt: -5 }
const ast = () => slotFor('astern', 0); // { fwd: -43.4, left: 0, alt: -8 }
/** Behind an aircraft far enough to pass under its tail: line astern plus 12 ft (the 2-ship's crossing, transitions.js). */
const behind = () => ast().fwd - 12;

// ---- one leg ---------------------------------------------------------------------------------

/**
 * Plans one leg from `start` (the four as they are at t0). leadSegs: Lead's segments. wings: [{ id, phases(done) }] in an
 * order where the aircraft each phase flies off is planned first; `done[id]` holds an earlier wingman's { times, endSec }
 * for gates. Returns { ok, reason?, t0, endSec, plans: { id: { segments, profile } }, done }.
 */
function flyLeg(start, t0, leadSegs, wings, blockFt) {
  const by = new Map(start.map((a) => [a.id, a]));
  const lead = start[0];
  const recs = { [lead.id]: recordFlight(lead, { segments: leadSegs }, t0) };
  const plans = { [lead.id]: { segments: leadSegs.map((s) => ({ ...s })) } };
  let endSec = t0 + dryRunT(lead, { segments: leadSegs }, t0, { maxSec: FOUR_CHANGE_LIMIT_SEC }).durationSec;
  const done = {};
  for (const w of wings) {
    const phases = w.phases(done).map((ph) => ({ ...ph, altRateFtps: ph.altRateFtps ?? GENTLE_ALT_FTPS }));
    const { run, profile } = trackTwice({ refs: recs, wing0: by.get(w.id), t0, phases, blockFt, maxSec: FOUR_CHANGE_LIMIT_SEC });
    if (!run.ok) return { ok: false, reason: `${NAMES[w.id]} could not settle in its place inside ${Math.round(FOUR_CHANGE_LIMIT_SEC / 60)} minutes.`, id: w.id };
    const plan = { segments: [{ kind: 'bankTrack', points: run.points }], profile };
    plans[w.id] = plan;
    recs[w.id] = recordFlight(by.get(w.id), plan, t0);
    done[w.id] = { times: run.times, endSec: t0 + run.durationSec, run };
    endSec = Math.max(endSec, t0 + run.durationSec, ...profile.map((leg) => leg.t1));
  }
  return { ok: true, t0, endSec: t0 + Math.ceil((endSec - t0) / STEP_SEC - 1e-6) * STEP_SEC, plans, done };
}

/** The four at formation time T after flying a leg (each straight and level once its own part is done). */
function statesAt(start, leg, T) {
  const steps = Math.round((T - leg.t0) / STEP_SEC);
  return start.map((a0) => {
    const a = copyAircraft(a0);
    const src = leg.plans[a0.id] ?? { segments: [] };
    const p = { segments: src.segments.map((s) => ({ ...s })), profile: src.profile };
    let t = leg.t0;
    for (let i = 0; i < steps; i++) {
      flyStep(a, p, t);
      t += STEP_SEC;
    }
    return a;
  });
}

/** Joins legs flown one after another into one plan per aircraft, each leg starting on the step it was planned from. */
function joinLegs(legs, ids) {
  const plans = {};
  for (const id of ids) {
    const segments = [];
    const profile = [];
    let at = legs[0].t0; // where this aircraft's recorded points reach
    legs.forEach((leg, k) => {
      const p = leg.plans[id] ?? { segments: [] };
      if (id === 1) {
        if (k > 0) segments.push({ kind: 'hold', untilSec: leg.t0, thenNext: true });
        segments.push(...p.segments.map((s) => ({ ...s })));
      } else {
        const gap = Math.round((leg.t0 - at) / STEP_SEC);
        if (gap > 0) segments.push({ kind: 'bankTrack', points: Array.from({ length: gap }, () => [0, null]) });
        for (const s of p.segments) segments.push({ ...s });
        const n = p.segments.reduce((sum, s) => sum + (s.points?.length ?? 0), 0);
        at = leg.t0 + n * STEP_SEC;
      }
      profile.push(...(p.profile ?? []));
    });
    plans[id] = { segments, profile };
  }
  return plans;
}

// ---- the places, in feet against Lead's height --------------------------------------------------

/** The context every move builder gets: the four now, Lead's height, the spacing and the planner's block height. */
function context(start, t0, opts) {
  const by = new Map(start.map((a) => [a.id, a]));
  return { start, by, t0, leadAlt: start[0].altAboveFt, spacingFt: opts.spacingFt, blockFt: opts.blockFt, stacked: isStacked(start) };
}

/** A phase builder's slot: fwd and left in the frame of `track`, height against Lead turned into the profile's height. */
const place = (c, fwd, left, alt) => ({ fwd, left, alt: c.leadAlt + alt });
/**
 * Hold where it is now in the frame of `track` (a wingman waiting its turn). With `world: true` the offset is held in
 * world axes (x, y), as the tracker reads a world phase, so the wingman turns with its reference as in an in-place turn.
 */
function hold(c, id, track, over = {}, altFt = c.by.get(id).altAboveFt) {
  const ref = c.by.get(track);
  const me = c.by.get(id);
  const rel = over.world ? { fwd: me.xFt - ref.xFt, left: me.yFt - ref.yFt } : relativeTo(ref, me);
  return phase({ fwd: rel.fwd, left: rel.left, alt: altFt }, { track, bankCapDeg: 45, overtakeKias: 15, undertakeKias: 15, advanceTol: 10, finalTol: 3, ...over });
}
/** A table slot (four-ship-slots.js) as a phase of the given kind. */
const toSlot = (c, kind, slot, over = {}) => kind(place(c, slot.fwd, slot.left, slot.alt), { track: slot.ref, ...over });
/** Fighting wing kept off a reference that is moving or turning (estimates: enough bank and speed to keep the slot). */
const fwFollow = (slot, over = {}) => phase(slot, { fwdRate: 40, latRate: 40, vrel0: 30, kcap: 0.05, d0: 100, vrelMax: 120, decel: 2, bankCapDeg: 60, overtakeKias: 25, undertakeKias: 25, advanceTol: 25, finalTol: 6, ...over });
/** Settle onto a slot off the formation reference after closing on a point near it (a short slide). */
const settle = (slot, over = {}) => dropBack(slot, { advanceTol: 6, finalTol: 6, vrel0: 16, ...over });
/**
 * A rejoining wingman comes off its stack first (Patrick 4 Oct 19:11Z, "come off first"; SMM 12.27 para 65): one at or above
 * Lead's height holds where it is while it steps down to FW_STEP_DOWN_FT below Lead, at the gentle stack rate, and only then
 * closes, so it is never at or above Lead while closing. Returns the hold phase, or nothing when it is below Lead already.
 */
function comeOffFirst(c, id, track) {
  const me = c.by.get(id);
  const above = me.altAboveFt - c.leadAlt;
  if (above < 0) return [];
  const sec = Math.max(4, (above + FW_STEP_DOWN_FT) / GENTLE_ALT_FTPS);
  return [hold(c, id, track, { holdUntil: c.t0 + sec, altSec: sec }, c.leadAlt - FW_STEP_DOWN_FT)];
}
/** Where a slot off #2 or #3 is in Lead's frame once everyone is in place (all on one heading, so the offsets add). */
function inLeadFrame(slots, id) {
  let fwd = 0;
  let left = 0;
  for (let k = id; k !== 1; k = slots[k].ref) {
    fwd += slots[k].fwd;
    left += slots[k].left;
  }
  return { fwd, left, alt: slots[id].alt };
}

// ---- the moves ------------------------------------------------------------------------------------
// Each returns { ok, reason?, legs: [leg…] }, planning its legs one after another from where the last one ended.

/** Runs a list of leg makers one after another: each gets the context at its own start. */
function legsInTurn(start, t0, opts, makers) {
  const legs = [];
  let now = start;
  let t = t0;
  for (const make of makers) {
    const c = context(now, t, opts);
    const spec = make(c);
    if (!spec) continue;
    const leg = flyLeg(now, t, spec.lead ?? [], spec.wings, opts.blockFt);
    if (!leg.ok) return { ok: false, reason: leg.reason, legs };
    legs.push(leg);
    now = statesAt(now, leg, leg.endSec);
    t = leg.endSec;
  }
  return { ok: true, legs, end: now, endSec: t };
}

/** Lead's speed change into a formation's speed, when it is not there already. */
const toSpeed = (c, key) => (Math.abs(c.start[0].kias - FOUR_FORMATIONS[key].kias) > 0.5 ? [speedSeg(c.start[0].kias, FOUR_FORMATIONS[key].kias, c.blockFt)] : []);

/**
 * R3 (and F11): Spread 4, the offset box or any wide picture to fighting wing, the turning rejoin of AFM7 brief p.17 and
 * AFM8 brief pp.19, 25. Lead slows to 200 KIAS and pauses to let #2 establish closure, then turns gently toward #2
 * (30° at 30° bank); #2 (inside, hot) rejoins to its fighting wing slot holding its stack; #3 and #4 (cold) rejoin too,
 * #3 to its slot off #2 and #4 off #3, holding theirs: the stack is the separation (AFM8 brief p.18 item 6).
 * With rejoin 'straight' Lead holds straight (the straight-ahead rejoin).
 */
function rejoinToFw(start, t0, opts, s) {
  const c = context(start, t0, opts);
  const slots = { ...fourSlots('fw', s, { stacked: c.stacked }) };
  // #2's +300 ft comes off before it closes: it rejoins to fighting wing below Lead, starting down at once (Patrick 19:11Z).
  if (slots[2].alt >= 0) slots[2] = { ...slots[2], alt: -FW_STEP_DOWN_FT };
  const speed = toSpeed(c, 'fw');
  const far = (id) => FAR_OVERTAKE_KIAS * (Math.abs(relativeTo(c.start[0], c.by.get(id)).left) > 3000 ? 1 : 0) || REJOIN.overtakeKias;
  const wings = [
    { id: 2, phases: () => [toSlot(c, rejoinTo, slots[2], { overtakeKias: far(2) })] },
    { id: 3, phases: () => [rejoinTo(place(c, ...Object.values(inLeadFrame(slots, 3))), { track: 1, overtakeKias: far(3), advanceTol: 60 }), toSlot(c, settle, slots[3])] },
    { id: 4, phases: () => [rejoinTo(place(c, ...Object.values(inLeadFrame(slots, 4))), { track: 1, overtakeKias: far(4), advanceTol: 60 }), toSlot(c, settle, slots[4])] },
  ];
  const tryLead = (leadSegs) => flyLeg(start, t0, leadSegs, wings, opts.blockFt);
  if (opts.rejoin === 'straight') return wrap(tryLead(speed), { how: 'straight-ahead rejoin to fighting wing' });
  // The pause is how long a straight-ahead rejoin takes to bring #2 inside the range (planGoTo's way, transitions.js).
  const straightTwo = flyLeg(start, t0, speed, wings.slice(0, 1), opts.blockFt);
  const ranges = straightTwo.ok ? straightTwo.done[2].run.ranges : [];
  for (const rangeFt of REJOIN.turnAtRangeFt) {
    const at = ranges.findIndex((r) => r <= rangeFt);
    if (at < 0) continue;
    for (const turnDeg of REJOIN.turnAnglesDeg) {
      const leadSegs = [...speed, { kind: 'hold', untilSec: t0 + onStep(at * STEP_SEC) }, turnSeg(wholeDegree(c.start[0].headingRad + s * turnDeg * DEG), s, REJOIN.leadBankDeg)];
      const leg = tryLead(leadSegs);
      if (leg.ok && laneKept(leg)) return wrap(leg, { leadTurnDeg: turnDeg });
    }
  }
  // No turn keeps the lane from here: Lead holds straight (the straight-ahead rejoin, SMM 12.26 paras 62-63).
  return wrap(tryLead(speed), { straightFallback: true, how: 'rejoin to fighting wing' });
}
const wrap = (leg, extra = {}) => (leg.ok ? { ok: true, legs: [leg], ...extra } : { ok: false, reason: leg.reason, legs: [] });
/** The overshoot lane (transitions.js): inside 1,000 ft of the aircraft it flies off, no wingman more than 100 ft ahead of its 3/9 line. */
const laneKept = (leg) => [2, 3, 4].every((id) => (leg.done[id]?.run.laneFwdFt ?? -Infinity) <= 100);

/**
 * Fighting wing (or finger) to Spread 4: the entry to line abreast (AFM7 brief p.15, AFM8 brief p.15; SMM 16.18 para 51,
 * 16.42 para 114). Lead speeds up to 220 KIAS at full power; the wingmen open out to one spacing each, the stack going on
 * as they get there. From finger, #3 waits for #4 to begin moving out first.
 */
function entryToSpread(start, t0, opts, s, fromFinger) {
  return legsInTurn(start, t0, opts, [(c) => {
    const slots = fourSlots('spread4', s, { spacingFt: c.spacingFt });
    return {
      lead: toSpeed(c, 'spread4'),
      wings: [
        { id: 2, phases: () => [toSlot(c, openOut, slots[2])] },
        { id: 3, phases: () => [...(fromFinger ? [hold(c, 3, 1, { holdUntil: c.t0 + THREE_WAITS_SEC })] : []), toSlot(c, openOut, slots[3])] },
        { id: 4, phases: () => [toSlot(c, openOut, slots[4])] },
      ],
    };
  }]);
}

/**
 * F6: finger, echelon, box, line astern or route to fighting wing (SMM 16.32 para 92, 16.38 para 105): the wingmen drop
 * back, each behind the one it flies off, then move across into place; no stack from a close formation. Expeditious
 * (Patrick 4 Oct 19:03Z, "about 7-15 seconds", TS-55; the SMM's "slowly" gives way to his ruling): the quick sweep of
 * the 2-ship (transitions.js sweepOut), still in two steps so no one cuts across the wingman beside it.
 */
function openToFw(start, t0, opts, s) {
  return legsInTurn(start, t0, opts, [(c) => {
    const slots = fourSlots('fw', s, { stacked: false });
    const wing = (id) => {
      const rel = relativeTo(c.by.get(slots[id].ref), c.by.get(id));
      return { id, phases: () => [sweepOut(place(c, slots[id].fwd, rel.left, slots[id].alt), { track: slots[id].ref, advanceTol: 60 }), toSlot(c, sweepOut, slots[id])] };
    };
    return { lead: toSpeed(c, 'fw'), wings: [wing(2), wing(3), wing(4)] };
  }]);
}

/**
 * Fighting wing to route or finger, straight ahead (R1; SMM 16.34 para 95, 16.15 para 38; AFM7 brief p.18 item 2): each
 * closes through route in turn, #2 first, #3 once #2 has route spacing, #4 once #3 has; the stack comes off as they close.
 */
function closeFromFw(start, t0, opts, s, to) {
  return legsInTurn(start, t0, opts, [(c) => {
    const route = fourSlots('route', s);
    const fin = fourSlots(to === 'route' ? 'route' : 'finger', s);
    const low = (slot) => ({ ...slot, alt: slot.alt - 25 }); // close level or slightly low, then up into place (transitions.js closeThrough)
    const legsFor = (id) => [toSlot(c, closeThrough, low(route[id]), { advanceTol: 6 }), toSlot(c, slide, fin[id])];
    const off2 = comeOffFirst(c, 2, 1);
    const gateOn = (id, prev) => (done) => [hold(c, id, id === 4 ? 3 : 1, { holdUntil: done[prev].times[prev === 2 ? off2.length : 0].arrive }), ...legsFor(id)];
    return {
      lead: toSpeed(c, to),
      wings: [
        { id: 2, phases: () => [...off2, ...legsFor(2)] },
        { id: 3, phases: gateOn(3, 2) },
        { id: 4, phases: (done) => gateOn(4, 3)({ 3: { times: [done[3].times[1]] } }) },
      ],
    };
  }]);
}

/**
 * Fighting wing to echelon as a straight-ahead rejoin (Patrick 4 Oct 19:04Z, TS-55; SMM 12.26 paras 62-63, Fig 12.17; EFIG
 * p.371), replacing the route through finger. Each wingman rejoins on the one it will fly off in echelon: lines up on its
 * six just below the wake, closes with overtake, takes the small vector to the echelon side at about 500 ft, stabilises in
 * route and moves up the wing-tip line to echelon. #2 comes off the stack first (19:11Z). "Wait for the one ahead"
 * (SMM 16.34 para 95; AFM7 brief p.18 item 2d): #3 holds its place off #2 until #2 has reached its vector point, and #4
 * holds off #3 the same way, so each lines up behind a wingman that has already left fighting wing (the gate is an estimate).
 */
function straightToEchelon(start, t0, opts, sTo) {
  return legsInTurn(start, t0, opts, [(c) => {
    const ech4 = fourSlots('echelon', sTo);
    const route = slotFor('route', sTo);
    const legsFor = (id) => {
      const { ref } = ech4[id];
      const refAlt = ref === 1 ? 0 : ech4[ref].alt;
      const at = (fwd, left, alt) => place(c, fwd, left, refAlt + alt);
      return [...straightAhead(at, place(c, route.fwd, route.left, ech4[id].alt), { track: ref }), toSlot(c, slide, ech4[id])];
    };
    const off2 = comeOffFirst(c, 2, 1);
    const vectorIndex = 1; // straightAhead's second phase (the closing leg) arrives at the vector point
    return {
      lead: toSpeed(c, 'echelon'),
      wings: [
        { id: 2, phases: () => [...off2, ...legsFor(2)] },
        { id: 3, phases: (done) => [hold(c, 3, 2, { holdUntil: done[2].times[off2.length + vectorIndex].arrive }), ...legsFor(3)] },
        { id: 4, phases: (done) => [hold(c, 4, 3, { holdUntil: done[3].times[1 + vectorIndex].arrive }), ...legsFor(4)] },
      ],
    };
  }]);
}

/**
 * R2: fighting wing to finger, turning (SMM 16.34 para 96, 16.38 para 106; AFM7 brief p.21): Lead turns into #2 at 30° of
 * bank; #2 joins the inside first; #3 crosses to the outside only once #2 is in place, #4 only once #3 is.
 */
function turningToFinger(start, t0, opts, s) {
  return legsInTurn(start, t0, opts, [(c) => {
    const fin = fourSlots('finger', s);
    const join = (id) => toSlot(c, rejoinTo, fin[id], { advanceTol: 10, overtakeKias: REJOIN.overtakeKias });
    const off2 = comeOffFirst(c, 2, 1);
    return {
      lead: [...toSpeed(c, 'finger'), turnSeg(wholeDegree(c.start[0].headingRad + s * FINGER_TURN_DEG * DEG), s, REJOIN.leadBankDeg)],
      wings: [
        { id: 2, phases: () => [...off2, join(2)] },
        // #3 and #4 come off the stack while they wait, well behind (the stack is the separation until then, AFM8 brief p.18 item 6).
        { id: 3, phases: (done) => [hold(c, 3, 1, { holdUntil: done[2].times[off2.length].arrive }, place(c, 0, 0, fin[3].alt).alt), join(3)] },
        { id: 4, phases: (done) => [hold(c, 4, 3, { holdUntil: done[3].times[1].arrive }, place(c, 0, 0, fin[4].alt).alt), join(4)] },
      ],
    };
  }]);
}

/** Finger and route, either way: a slide in or out at the same time (AFM8 brief p.9: anticipate the collapse to route). */
function slideTo(start, t0, opts, s, to) {
  return legsInTurn(start, t0, opts, [(c) => {
    const slots = fourSlots(to, s);
    return { lead: toSpeed(c, to), wings: [2, 3, 4].map((id) => ({ id, phases: () => [toSlot(c, slide, slots[id])] })) };
  }]);
}

/**
 * F1 and F2: finger to echelon (SMM 16.32 paras 87-88; AFM7 brief p.19). Echelon on #2's side (F2): #3 and #4 move back
 * and down, pass behind and below #2 and Lead, #4 lower and behind #3, and take echelon on #2 and #3. Echelon on the other
 * side (F1): #3 and #4 move out to make room, then #2 crosses behind and below Lead.
 */
function fingerToEchelon(start, t0, opts, s, e) {
  if (e === s) {
    return legsInTurn(start, t0, opts, [(c) => {
      const back3 = behind() + ech().fwd; // behind #2 as well as Lead
      return {
        lead: [],
        wings: [
          { id: 2, phases: () => [hold(c, 2, 1)] },
          { id: 3, phases: () => [slide(place(c, back3, -s * ech().left, -CROSS_LOW_FT - 5), { track: 1 }), slide(place(c, back3, s * 2 * ech().left, -CROSS_LOW_FT - 5), { track: 1 }), slide(place(c, 2 * ech().fwd, s * 2 * ech().left, 2 * ech().alt), { track: 1 })] },
          { id: 4, phases: (done) => [
            slide(place(c, behind(), -s * ech().left, -CROSS_LOW_FT - 5 - FOUR_LOWER_FT - 5), { track: 3 }),
            slide(place(c, behind(), s * ech().left, -CROSS_LOW_FT - 5 - FOUR_LOWER_FT - 5), { track: 3, holdUntil: done[3].times[2].arrive }),
            slide(place(c, ech().fwd, s * ech().left, 3 * ech().alt), { track: 3 }),
          ] },
        ],
      };
    }]);
  }
  return legsInTurn(start, t0, opts, [
    (c) => ({
      lead: [],
      wings: [
        { id: 2, phases: () => [hold(c, 2, 1)] },
        { id: 3, phases: () => [slide(place(c, 2 * ech().fwd, -s * 2 * ech().left, 2 * ech().alt), { track: 1 })] },
        { id: 4, phases: () => [slide(place(c, ech().fwd, -s * ech().left, 3 * ech().alt), { track: 3 })] },
      ],
    }),
    (c) => ({
      lead: [],
      wings: [
        { id: 2, phases: () => [slide(place(c, behind(), s * ech().left, -CROSS_LOW_FT), { track: 1 }), slide(place(c, behind(), -s * ech().left, -CROSS_LOW_FT), { track: 1 }), slide(place(c, ech().fwd, -s * ech().left, ech().alt), { track: 1 })] },
        { id: 3, phases: () => [hold(c, 3, 1)] },
        { id: 4, phases: () => [hold(c, 4, 3)] },
      ],
    }),
  ]);
}

/** F3: echelon to finger, the reverse of F1 or F2 (SMM 16.32 paras 87-88 reversed: an estimate, the manuals give one way). */
function echelonToFinger(start, t0, opts, e, s) {
  if (e === s) {
    // #3 and #4 go back across behind and below to the other side.
    return legsInTurn(start, t0, opts, [(c) => {
      const back3 = behind() + ech().fwd;
      return {
        lead: [],
        wings: [
          { id: 2, phases: () => [hold(c, 2, 1)] },
          { id: 3, phases: () => [slide(place(c, back3, s * 2 * ech().left, -CROSS_LOW_FT - 5), { track: 1 }), slide(place(c, back3, -s * ech().left, -CROSS_LOW_FT - 5), { track: 1 }), slide(place(c, ech().fwd, -s * ech().left, ech().alt), { track: 1 })] },
          { id: 4, phases: (done) => [
            slide(place(c, behind(), s * ech().left, -CROSS_LOW_FT - 5 - FOUR_LOWER_FT - 5), { track: 3 }),
            slide(place(c, behind(), -s * ech().left, -CROSS_LOW_FT - 5 - FOUR_LOWER_FT - 5), { track: 3, holdUntil: done[3].times[2].arrive }),
            slide(place(c, ech().fwd, -s * ech().left, 2 * ech().alt), { track: 3 }),
          ] },
        ],
      };
    }]);
  }
  // #2 crosses back behind and below Lead, then #3 and #4 move in a place.
  return legsInTurn(start, t0, opts, [
    (c) => ({
      lead: [],
      wings: [
        { id: 2, phases: () => [slide(place(c, behind(), -s * ech().left, -CROSS_LOW_FT), { track: 1 }), slide(place(c, behind(), s * ech().left, -CROSS_LOW_FT), { track: 1 }), slide(place(c, ech().fwd, s * ech().left, ech().alt), { track: 1 })] },
        { id: 3, phases: () => [hold(c, 3, 1)] },
        { id: 4, phases: () => [hold(c, 4, 3)] },
      ],
    }),
    (c) => {
      const fin = fourSlots('finger', s);
      return {
        lead: [],
        wings: [
          { id: 2, phases: () => [hold(c, 2, 1)] },
          { id: 3, phases: () => [toSlot(c, slide, fin[3])] },
          { id: 4, phases: () => [toSlot(c, slide, fin[4])] },
        ],
      };
    },
  ]);
}

/**
 * F4: finger to box and back (SMM 16.32 para 91; AFM7 brief p.20): #2 and #3 hold; #4 moves back and down to pass
 * behind #3, into a loose line astern, then power moves it into line astern on Lead; back the same way to its echelon on #3.
 */
function fingerBox(start, t0, opts, s, toBox) {
  return legsInTurn(start, t0, opts, [(c) => {
    const back = behind() + ech().fwd;
    const low = -CROSS_LOW_FT - 5;
    const four = toBox
      ? [slide(place(c, back, -s * 2 * ech().left, low), { track: 1 }), slide(place(c, back, 0, low), { track: 1 }), slide(place(c, ast().fwd - 15, 0, ast().alt - 4), { track: 1 }), slide(place(c, ast().fwd, 0, ast().alt), { track: 1 })]
      : [slide(place(c, back, 0, low), { track: 1 }), slide(place(c, back, -s * 2 * ech().left, low), { track: 1 }), toSlot(c, slide, fourSlots('finger', s)[4])];
    return { lead: [], wings: [{ id: 2, phases: () => [hold(c, 2, 1)] }, { id: 3, phases: () => [hold(c, 3, 1)] }, { id: 4, phases: () => four }] };
  }]);
}

/**
 * F5: finger to line astern and back (SMM 16.32 paras 86, 89-90). To line astern: #3 drops back far enough for #2 to take
 * position before it moves across; #2 moves back and across behind Lead; then #3 moves across behind #2; #4 follows #3
 * and takes line astern on it. Back: #2 moves out and up first, then #3, then #4 regains its place.
 */
function fingerTrail(start, t0, opts, s, toTrail) {
  const trail = fourSlots('trail', 0);
  if (toTrail) {
    return legsInTurn(start, t0, opts, [
      (c) => ({
        lead: [],
        wings: [
          { id: 2, phases: () => [hold(c, 2, 1)] },
          { id: 3, phases: () => [slide(place(c, 2 * ast().fwd - 15, -s * ech().left, 2 * ast().alt), { track: 1 })] },
          { id: 4, phases: () => [slide(place(c, behind(), -s * ech().left, 3 * ast().alt - 6), { track: 3 }), slide(place(c, behind(), 0, 3 * ast().alt - 6), { track: 3 }), toSlot(c, slide, trail[4])] },
        ],
      }),
      (c) => ({
        lead: [],
        wings: [
          { id: 2, phases: () => [slide(place(c, behind(), s * ech().left, ast().alt - 2), { track: 1 }), slide(place(c, behind(), 0, ast().alt - 2), { track: 1 }), toSlot(c, slide, trail[2])] },
          { id: 3, phases: () => [hold(c, 3, 1)] },
          { id: 4, phases: () => [hold(c, 4, 3)] },
        ],
      }),
      (c) => ({
        lead: [],
        wings: [
          { id: 2, phases: () => [hold(c, 2, 1)] },
          { id: 3, phases: () => [slide(place(c, 2 * ast().fwd - 15, 0, 2 * ast().alt), { track: 1 }), toSlot(c, slide, trail[3])] },
          { id: 4, phases: () => [hold(c, 4, 3)] },
        ],
      }),
    ]);
  }
  const fin = fourSlots('finger', s);
  return legsInTurn(start, t0, opts, [
    (c) => ({
      lead: [],
      wings: [
        { id: 2, phases: () => [slide(place(c, ast().fwd, s * ech().left, ast().alt), { track: 1 }), toSlot(c, slide, fin[2])] },
        { id: 3, phases: () => [hold(c, 3, 1)] },
        { id: 4, phases: () => [hold(c, 4, 3)] },
      ],
    }),
    (c) => ({
      lead: [],
      wings: [
        { id: 2, phases: () => [hold(c, 2, 1)] },
        { id: 3, phases: () => [slide(place(c, 2 * ast().fwd, -s * ech().left, 2 * ast().alt), { track: 1 }), toSlot(c, slide, fin[3])] },
        { id: 4, phases: () => [hold(c, 4, 3)] },
      ],
    }),
    (c) => ({
      lead: [],
      wings: [
        { id: 2, phases: () => [hold(c, 2, 1)] },
        { id: 3, phases: () => [hold(c, 3, 1)] },
        { id: 4, phases: () => [slide(place(c, ast().fwd, -s * ech().left, fin[4].alt), { track: 3 }), toSlot(c, slide, fin[4])] },
      ],
    }),
  ]);
}

/**
 * F8: fighting wing to Fluid 4, "FLUID 4, GO" (AFM8 brief p.20): Lead flies straight at 200 KIAS; #3 diverges to a wide
 * line abreast on Lead, 6,000 ft, while #2 and #4 stay in fighting wing on the outside, #4 off #3; the stack goes on once
 * in position. Back to fighting wing is the reverse (an estimate: the manuals give one way).
 */
function fwFluid(start, t0, opts, s, toFluid) {
  return legsInTurn(start, t0, opts, [(c) => {
    if (toFluid) {
      const f4 = fourSlots('fluid4', s);
      return {
        lead: toSpeed(c, 'fluid4'),
        wings: [
          { id: 2, phases: () => [toSlot(c, fwFollow, f4[2])] },
          { id: 3, phases: () => [toSlot(c, openOut, f4[3])] },
          { id: 4, phases: () => [toSlot(c, fwFollow, f4[4])] },
        ],
      };
    }
    const fw = fourSlots('fw', s, { stacked: true });
    return {
      lead: toSpeed(c, 'fw'),
      wings: [
        { id: 2, phases: () => [toSlot(c, fwFollow, fw[2])] },
        { id: 3, phases: () => [rejoinTo(place(c, ...Object.values(inLeadFrame(fw, 3))), { track: 1, advanceTol: 60, overtakeKias: REJOIN.overtakeKias }), toSlot(c, settle, fw[3])] },
        { id: 4, phases: () => [toSlot(c, fwFollow, fw[4])] },
      ],
    };
  }]);
}

/**
 * F9: Fluid 4 to the offset box, "FOR OFFSET BOX, IN PLACE 90" (AFM8 brief pp.21-22; SMM 16.41 paras 109-110): both
 * elements turn in place 90 toward #2's side in fighting wing (Lead and #3 at 3 G, #2 and #4 keeping their slots), which
 * leaves the pairs in trail; then Lead speeds up to 220 KIAS and the elements spread to line abreast, #3 in the slot
 * between Lead and #2 and #4 outside #2, the second element 7,000 ft back (TS-18). The box is on #2's side (an estimate:
 * the brief draws the right box; Dad question 3 asks about the left one).
 */
function fluidToBox(start, t0, opts, s) {
  return legsInTurn(start, t0, opts, [
    (c) => {
      const f4 = fourSlots('fluid4', s);
      const turn = { bankCapDeg: 75, overtakeKias: 25, undertakeKias: 25 };
      return {
        lead: [turnSeg(wholeDegree(c.start[0].headingRad + s * Math.PI / 2), s, TURN_BANK_DEG)],
        wings: [
          { id: 2, phases: () => [toSlot(c, fwFollow, f4[2], turn)] },
          { id: 3, phases: () => [hold(c, 3, 1, { world: true, ...turn, overtakeKias: 10, undertakeKias: 10, finalTol: 6 })] },
          { id: 4, phases: () => [toSlot(c, fwFollow, f4[4], turn)] },
        ],
      };
    },
    (c) => {
      const box = fourSlots('offsetBox', s, { spacingFt: c.spacingFt });
      return {
        lead: toSpeed(c, 'offsetBox'),
        wings: [
          { id: 2, phases: () => [toSlot(c, openOut, box[2])] },
          { id: 3, phases: () => [toSlot(c, openOut, box[3], { fwdRate: 40 })] },
          { id: 4, phases: () => [toSlot(c, openOut, box[4])] },
        ],
      };
    },
  ]);
}

// ---- the from-to graph ----------------------------------------------------------------------------

/**
 * The edges (design section 6), each with a rough cost in seconds (estimates, for choosing a route only) and its move.
 * `sides` says which sides the far end may take: 'same' keeps #2's side, 'any' may change it (finger and echelon, through
 * the crossunder), 'none' has no side (line astern).
 */
const EDGES = [
  { from: 'spread4', to: 'fw', cost: 150, sides: 'same', fly: (st, t, o, s) => rejoinToFw(st, t, o, s), how: 'turning rejoin to fighting wing' },
  { from: 'offsetBox', to: 'fw', cost: 200, sides: 'same', fly: (st, t, o, s) => rejoinToFw(st, t, o, s), how: 'turning rejoin to fighting wing' },
  { from: 'other', to: 'fw', cost: 150, sides: 'same', fly: (st, t, o, s) => rejoinToFw(st, t, o, s), how: 'rejoin to fighting wing' },
  { from: 'fw', to: 'spread4', cost: 90, sides: 'same', fly: (st, t, o, s) => entryToSpread(st, t, o, s, false), how: 'entry to Spread 4' },
  { from: 'finger', to: 'spread4', cost: 90, sides: 'same', fly: (st, t, o, s) => entryToSpread(st, t, o, s, true), how: 'open out to Spread 4' },
  { from: 'fw', to: 'fluid4', cost: 60, sides: 'same', fly: (st, t, o, s) => fwFluid(st, t, o, s, true), how: '"Fluid 4, go"' },
  { from: 'fluid4', to: 'fw', cost: 60, sides: 'same', fly: (st, t, o, s) => fwFluid(st, t, o, s, false), how: 'back to fighting wing' },
  { from: 'fluid4', to: 'offsetBox', cost: 120, sides: 'same', fly: (st, t, o, s) => fluidToBox(st, t, o, s), how: 'in place 90, then spread to the box' },
  { from: 'fw', to: 'route', cost: 60, sides: 'same', fly: (st, t, o, s) => closeFromFw(st, t, o, s, 'route'), how: 'close through route' },
  { from: 'fw', to: 'finger', cost: 70, sides: 'same', fly: (st, t, o, s) => (o.rejoin === 'straight' ? { ...closeFromFw(st, t, o, s, 'finger'), how: 'straight-ahead rejoin to finger, through route' } : turningOrStraight(st, t, o, s)), how: 'turning rejoin to finger' },
  { from: 'route', to: 'finger', cost: 15, sides: 'same', fly: (st, t, o, s) => slideTo(st, t, o, s, 'finger'), how: 'in from route' },
  { from: 'finger', to: 'route', cost: 15, sides: 'same', fly: (st, t, o, s) => slideTo(st, t, o, s, 'route'), how: 'out to route' },
  { from: 'fw', to: 'echelon', cost: 90, sides: 'any', fly: (st, t, o, s, sTo) => straightToEchelon(st, t, o, sTo), how: 'straight-ahead rejoin to echelon' },
  { from: 'finger', to: 'echelon', cost: 40, sides: 'any', fly: (st, t, o, s, sTo) => fingerToEchelon(st, t, o, s, sTo), how: 'crossunder to echelon' },
  { from: 'echelon', to: 'finger', cost: 40, sides: 'any', fly: (st, t, o, s, sTo) => echelonToFinger(st, t, o, s, sTo), how: 'crossunder to finger' },
  { from: 'finger', to: 'box', cost: 40, sides: 'same', fly: (st, t, o, s) => fingerBox(st, t, o, s, true), how: '#4 into the box' },
  { from: 'box', to: 'finger', cost: 40, sides: 'same', fly: (st, t, o, s) => fingerBox(st, t, o, s, false), how: '#4 back to finger' },
  { from: 'finger', to: 'trail', cost: 60, sides: 'none', fly: (st, t, o, s) => fingerTrail(st, t, o, s, true), how: 'into line astern' },
  { from: 'trail', to: 'finger', cost: 60, sides: 'any', fly: (st, t, o, s, sTo) => fingerTrail(st, t, o, sTo, false), how: 'back to finger' },
  { from: 'finger', to: 'fw', cost: 60, sides: 'same', fly: (st, t, o, s) => openToFw(st, t, o, s), how: 'drop back to fighting wing' },
  { from: 'echelon', to: 'fw', cost: 60, sides: 'same', fly: (st, t, o, s) => openToFw(st, t, o, s), how: 'drop back to fighting wing' },
];

/** R2 with R1 behind it: the turning rejoin to finger, or straight ahead if the turning one does not plan from here. */
function turningOrStraight(start, t0, opts, s) {
  const turning = turningToFinger(start, t0, opts, s);
  if (turning.ok && turning.legs.every(laneKept)) return turning;
  return { ...closeFromFw(start, t0, opts, s, 'finger'), straightFallback: true, how: 'rejoin to finger through route' };
}

/** The cheapest route from (key, side) to (to, sTo) through EDGES: [{ edge, s, sTo }…], or null. */
export function routeFour(from, s, to, sTo) {
  const node = (k, side) => `${k}:${k === 'trail' ? 0 : side}`;
  const goal = node(to, sTo);
  const best = new Map([[node(from, s), { cost: 0, path: [] }]]);
  const open = [{ key: from, side: s, cost: 0, path: [] }];
  while (open.length) {
    open.sort((a, b) => a.cost - b.cost);
    const cur = open.shift();
    if (node(cur.key, cur.side) === goal) return cur.path;
    for (const e of EDGES.filter((x) => x.from === cur.key)) {
      const sides = e.sides === 'any' ? [1, -1] : e.sides === 'none' ? [cur.side] : [cur.side];
      for (const side of sides) {
        const cost = cur.cost + e.cost;
        const id = node(e.to, side);
        if ((best.get(id)?.cost ?? Infinity) <= cost) continue;
        const path = [...cur.path, { edge: e, s: cur.side, sTo: side }];
        best.set(id, { cost, path });
        open.push({ key: e.to, side, cost, path });
      }
    }
  }
  return null;
}

// ---- the plan for a button press ----------------------------------------------------------------------

/**
 * Plans a change of formation for the four as they are now. to: a FOUR_FORMATIONS key. options: { side: 'keep' | 'left' |
 * 'right' (#2's side at the end), spacingFt, blockFt, rejoin: 'into' | 'straight', lastSide }. Returns { ok, reason?, plans,
 * note, label, flying, from, fromSide, to, side, refs, endSec, judged, legs } — when ok is false nothing should be flown and `reason` says
 * why in one line (design section 9).
 */
export function planChangeFour(aircraft, to, options = {}, t0 = 0) {
  /** @type {{ spacingFt: number, blockFt: number, rejoin: string, side?: string, lastSide?: number }} */
  const opts = { spacingFt: 6000, blockFt: 8000, rejoin: 'into', ...options };
  const f = FOUR_FORMATIONS[to];
  if (!f) return { ok: false, reason: `There is no four-ship formation called ${to}.` };
  if (f.later) return { ok: false, reason: `${f.label} is the live build, coming later.` };
  const from = classifyFour(aircraft);
  const sNow = from.side || opts.lastSide || -1;
  const want = opts.side ?? 'keep';
  const sTo = to === 'trail' ? 0 : want === 'left' ? 1 : want === 'right' ? -1 : sNow;
  if (from.key === to && (to === 'trail' || from.side === sTo)) return { ok: false, reason: `Already in ${f.label.toLowerCase()}.` };
  const path = routeFour(from.key, from.key === 'trail' ? 0 : sNow, to, sTo);
  if (!path) return { ok: false, reason: `No way from ${fourWords(from).toLowerCase()} to ${f.label.toLowerCase()} the manuals give.` };

  // Fly each edge from where the last one ended.
  const legs = [];
  let now = aircraft.map((a) => copyAircraft(a));
  let t = t0;
  const hows = [];
  for (const step of path) {
    const s = step.s === 0 ? (step.sTo || sNow) : step.s;
    const r = step.edge.fly(now, t, opts, s, step.sTo);
    if (!r.ok) return { ok: false, reason: `No safe change from here: ${r.reason}`, from: from.key, to };
    hows.push(r.straightFallback ? `${r.how ?? step.edge.how} (straight ahead: no turn kept the lane)` : r.how ?? step.edge.how);
    legs.push(...r.legs);
    const last = r.legs[r.legs.length - 1];
    now = r.end ?? statesAt(now, last, last.endSec); // a move of several legs hands back where its last leg ended
    t = last.endSec;
    if (t - t0 > FOUR_CHANGE_LIMIT_SEC) return { ok: false, reason: `No safe change from here: it would take more than ${Math.round(FOUR_CHANGE_LIMIT_SEC / 60)} minutes.`, from: from.key, to };
  }
  // Each later leg's start states came from flying the earlier legs, so the joined plan flies exactly that.
  const plans = joinLegs(legs, aircraft.map((a) => a.id));
  const judged = judgeFourFormation(to, now, sTo, { spacingFt: opts.spacingFt });
  if (!judged.inBand) return { ok: false, reason: `No safe change from here: it would end ${judged.labels.join(', ')}.`, from: from.key, to, end: now, judged };
  const fromWords = fourWords(from);
  const toWords = fourWords({ key: to, side: sTo });
  const label = toWords;
  return {
    ok: true,
    plans,
    note: `${fromWords} to ${toWords}: ${hows.join(', then ')}.`,
    label,
    flying: `${fromWords} to ${toWords} (${hows.join(', then ')})`,
    from: from.key,
    fromSide: sNow,
    to,
    side: sTo,
    refs: refsFor(to),
    endSec: t,
    judged,
    legs: legs.map((leg) => ({ t0: leg.t0, endSec: leg.endSec })),
  };
}

/** True once every aircraft has flown its plan (for a caller checking a plan by flying it). */
export const allDone = (aircraft, plans) => aircraft.every((a) => planDone(a, plans[a.id]));
