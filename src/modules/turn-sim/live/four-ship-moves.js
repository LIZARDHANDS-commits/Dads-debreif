// The 4-ship's moves still flown by the V2.96 code (Turn Sim spec section 8, decision TS-54; design: project files
// turn-sim-review/four-ship/design.md sections 4 to 6 and 9): the rejoins, the opening out to Spread 4 and Fluid 4, and the
// offset box. Refactor PRs 7 and 8 rebuild them on the 2-ship's planners and this file goes; until then four-plan.js calls
// them through LEGACY. The close moves, the route between moves and the press's plan moved to four-close.js and
// four-plan.js (refactor PR 6, V2.97).
//
// How these plan: each wingman's path is a recorded dry run of the 2-ship's tracker (tracker.js runTracker), with a
// kinematic line in front of it where a single long leg allows (lineFirst), flying to its slot in the frame of the
// aircraft it flies off. A leg plans Lead first, then the wingmen in an order where the aircraft each flies off is
// already planned (#4 off #3 "flies through #3", SMM 16.37 para 103), each against the others' recorded flights.
// "Wait for the one ahead" (SMM 16.32 para 86, 16.34 paras 95-96; AFM7 brief p.18 item 2d) is a gate (`holdUntil`).
// Speeds: 200 KIAS outside line abreast, 220 in it (Patrick, 4 Oct 11:08Z).
//
// Sources for each move are beside it. Numbers with no manual or ruling behind them say "estimate".
import { STEP_SEC, copyAircraft } from './flight.js';
import { relativeTo, turnSeg, wholeDegree, DEG, TURN_BANK_DEG } from './manoeuvres.js';
import {
  recordFlight, flyStep, dryRunT, speedSeg, slide, dropBack, closeThrough, rejoinTo, openOut, straightAhead,
} from './transitions.js';
import { REJOIN, FW_FOLLOW_FOUR, WING_BANKS } from './tuning.js';
import { onClosure, lineRunIn, fromStep, wingFromPose, replanFor } from './hand-over.js';
import { trackTwice, phase } from './tracker.js';
import { isStacked } from './judge.js';
import { FOUR_FORMATIONS, LENGTH_FT, slotsFor, pairSlot, FW_STEP_DOWN_FT } from './slots.js';

/** A generous limit on one 4-ship change (design section 9: Spread 4 to finger is estimated at 4 to 6 minutes); it only catches a plan that never ends. */
const FOUR_CHANGE_LIMIT_SEC = 480;
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
const ech = () => pairSlot('echelon', 1); // { fwd: -25, left: 45, alt: -5 }
const ast = () => pairSlot('astern', 0); // { fwd: -43.4, left: 0, alt: -8 }

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
    const raw = w.phases(done).map((ph) => ({ ...ph, altRateFtps: ph.altRateFtps ?? GENTLE_ALT_FTPS }));
    const wing0 = by.get(w.id);
    // Lines, then tracker (clean-up step 3, TS-66): a wingman with one leg to fly, no gate, starting further than the
    // hand-over range from it, flies a kinematic line in the frame of the aircraft he flies off, then the tracker.
    const lined = lineFirst(wing0, raw, recs, blockFt);
    let run;
    let profile;
    let plan;
    let steps0 = 0;
    if (lined) {
      steps0 = lined.line.steps;
      const refs = Object.fromEntries(Object.entries(recs).map(([id, r]) => [id, fromStep(r, steps0)]));
      const init = { accelKtps: lined.line.accelKtps };
      ({ run, profile } = trackTwice({ refs, wing0: wingFromPose(wing0, lined.line.poses[steps0 - 1]), t0: t0 + steps0 * STEP_SEC, phases: lined.legs, blockFt, maxSec: FOUR_CHANGE_LIMIT_SEC, init }));
      if (run.ok) {
        const replan = replanFor({ refIds: Object.keys(recs).map(Number), phases: lined.legs, blockFt, accelKtps: init.accelKtps, record: recordFlight });
        plan = { segments: [{ kind: 'poseTrack', poses: lined.line.poses, replan }, { kind: 'bankTrack', points: run.points }], profile };
      } else {
        steps0 = 0;
      }
    }
    if (!plan) {
      // The tracker alone, every leg on the closure law (step 3): a rejoin's closure for rejoins and long moves, the close-in
      // rate for close ones, the 06:16Z banks; legs that follow a goal or hold world axes (the turns) fly as before.
      ({ run, profile } = trackTwice({ refs: recs, wing0, t0, phases: onFour(raw), blockFt, maxSec: FOUR_CHANGE_LIMIT_SEC }));
      if (!run.ok) return { ok: false, reason: `${NAMES[w.id]} could not settle in its place inside ${Math.round(FOUR_CHANGE_LIMIT_SEC / 60)} minutes.`, id: w.id };
      plan = { segments: [{ kind: 'bankTrack', points: run.points }], profile };
    }
    const durationSec = steps0 * STEP_SEC + run.durationSec;
    plans[w.id] = plan;
    recs[w.id] = recordFlight(wing0, plan, t0);
    done[w.id] = { times: run.times, endSec: t0 + durationSec, run };
    endSec = Math.max(endSec, t0 + durationSec, ...profile.map((leg) => leg.t1));
  }
  return { ok: true, t0, endSec: t0 + Math.ceil((endSec - t0) / STEP_SEC - 1e-6) * STEP_SEC, plans, done };
}

/** The 4-ship's legs on the closure law (hand-over.js onClosure; rejoins with no bank cap but the G rule, Patrick 06:16Z item 1); goal and world legs as they were. */
function onFour(phases, opts = {}) {
  return phases.map((ph) => (ph.goal || ph.world ? ph : onClosure([ph], { rejoinBankDeg: WING_BANKS.rejoinBankCapDeg, ...opts })[0]));
}

/**
 * The line for a wingman's leg, or null (the tracker flies it all): only a single leg with no gate, no goal and no world
 * axes, starting further than the hand-over range from its slot (hand-over.js lineRunIn), so the gates of the ones behind
 * (their `done` times) read the same leg. The line runs straight at its slot in the frame of the aircraft the leg flies off,
 * at a rejoin's closure, arriving at the close-in rate; the leg then flies at the close-in rate. Returns { line, legs }.
 */
function lineFirst(wing, raw, recs, blockFt) {
  if (raw.length !== 1) return null;
  const ph = raw[0];
  if (ph.holdUntil !== undefined || ph.goal || ph.world) return null;
  const ref = recs[ph.track ?? 1];
  if (!ref) return null;
  const R0 = ref.at(0);
  const rel = relativeTo(R0, wing);
  const points = [
    { fwd: rel.fwd, left: rel.left, up: wing.altAboveFt - R0.altAboveFt, plane: 0 },
    { fwd: ph.slot.fwd, left: ph.slot.left, up: ph.slot.alt - R0.altAboveFt, plane: 0 },
  ];
  const line = lineRunIn({ wing, leadRec: ref, points, finalSlot: ph.slot, blockFt });
  return line ? { line, legs: onFour(raw, { closeIn: true }) } : null;
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
/** A table slot (slots.js) as a phase of the given kind. */
const toSlot = (c, kind, slot, over = {}) => kind(place(c, slot.fwd, slot.left, slot.alt), { track: slot.ref, ...over });
/** Fighting wing kept off a reference that is moving or turning (estimates: enough bank and speed to keep the slot). */
const fwFollow = (slot, over = {}) => phase(slot, { ...FW_FOLLOW_FOUR, ...over }); // tuning.js FW_FOLLOW_FOUR (the 4-ship's, until step 3)
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
 * AFM8 brief pp.19, 25. Since clean-up step 3 (TS-66; Patrick 5 Oct 05:29Z, 05:34Z: "lead should just turn towards number2
 * who does a hot turning rejoin, then 3 and 4 immediately go full power and towards number 1's turn circle, then rejoin on
 * the outside of the turn one at a time"): Lead turns toward #2 at the press (30° bank), slowing to 200 KIAS as he turns;
 * #2 (inside, hot) rejoins to its fighting wing slot; #3 and #4 close at once at a rejoin's closure toward Lead's turn, wait
 * a little behind their places on the outside of the turn, and come in one at a time: #3 once #2 is in, #4 once #3 is
 * (SMM 16.34 paras 95-96). The stack is kept as the separation (AFM8 brief p.18 item 6). With rejoin 'straight' Lead holds
 * straight (the straight-ahead rejoin).
 */
function rejoinToFw(start, t0, opts, s) {
  const c = context(start, t0, opts);
  const slots = { ...slotsFor('fw', s, { ships: 4, stacked: c.stacked }) };
  // #2's +300 ft comes off before it closes: it rejoins to fighting wing below Lead, starting down at once (Patrick 19:11Z).
  if (slots[2].alt >= 0) slots[2] = { ...slots[2], alt: -FW_STEP_DOWN_FT };
  const speed = toSpeed(c, 'fw');
  const far = (id) => FAR_OVERTAKE_KIAS * (Math.abs(relativeTo(c.start[0], c.by.get(id)).left) > 3000 ? 1 : 0) || REJOIN.overtakeKias;
  // #3 and #4 wait this far behind their places (in Lead's frame) until the one ahead is in (estimates, TRJ's spacing).
  const waitAt = (id) => {
    const p = inLeadFrame(slots, id);
    return place(c, p.fwd - TRJ.waitBehindFt[id] * 2, p.left, p.alt);
  };
  const gateOf = (done, id) => done[id].times[done[id].times.length - 1].arrive;
  const wings = [
    { id: 2, phases: () => [toSlot(c, rejoinTo, slots[2], { overtakeKias: far(2) })] },
    {
      id: 3,
      phases: (done) => [
        rejoinTo(waitAt(3), { track: 1, overtakeKias: far(3), advanceTol: 60, holdUntil: gateOf(done, 2) }),
        rejoinTo(place(c, ...Object.values(inLeadFrame(slots, 3))), { track: 1, advanceTol: 60 }),
        toSlot(c, settle, slots[3]),
      ],
    },
    {
      id: 4,
      phases: (done) => [
        rejoinTo(waitAt(4), { track: 1, overtakeKias: far(4), advanceTol: 60, holdUntil: gateOf(done, 3) }),
        rejoinTo(place(c, ...Object.values(inLeadFrame(slots, 4))), { track: 1, advanceTol: 60 }),
        toSlot(c, settle, slots[4]),
      ],
    },
  ];
  const tryLead = (leadSegs) => flyLeg(start, t0, leadSegs, wings, opts.blockFt);
  if (opts.rejoin === 'straight') return wrap(tryLead(speed), { how: 'straight-ahead rejoin to fighting wing' });
  // Lead turns at the press, slowing as he turns (Patrick 05:29Z: never waits for closure); the first turn that keeps the
  // overshoot lane, else the first that flies (REJOIN.turnAnglesDeg until the V2.22 rejoin work: Lead holds his turn until
  // #2 is in, RULED_REJOIN).
  const slowWhileTurning = speed.map((x) => ({ ...x, withNext: true }));
  let first = null;
  for (const turnDeg of REJOIN.turnAnglesDeg) {
    const leg = tryLead([...slowWhileTurning, turnSeg(wholeDegree(c.start[0].headingRad + s * turnDeg * DEG), s, REJOIN.leadBankDeg)]);
    if (leg.ok && laneKept(leg)) return wrap(leg, { leadTurnDeg: turnDeg });
    if (leg.ok && !first) first = { leg, turnDeg };
  }
  if (first) return wrap(first.leg, { leadTurnDeg: first.turnDeg });
  // Nothing settles with Lead turning: Lead holds straight (the straight-ahead rejoin, SMM 12.26 paras 62-63).
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
    const slots = slotsFor('spread4', s, { ships: 4, spacingFt: c.spacingFt });
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
 * Fighting wing to route or finger, straight ahead (R1; SMM 16.34 para 95, 16.15 para 38; AFM7 brief p.18 item 2): each
 * closes through route in turn, #2 first, #3 once #2 has route spacing, #4 once #3 has; the stack comes off as they close.
 */
function closeFromFw(start, t0, opts, s, to) {
  return legsInTurn(start, t0, opts, [(c) => {
    const route = slotsFor('route', s, { ships: 4 });
    const fin = slotsFor(to === 'route' ? 'route' : 'finger', s, { ships: 4 });
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
 * six about 1,000 ft back just below the wake (Fig 12.17; Patrick's card 19:54Z), closes with overtake, takes the small
 * vector to the echelon side at about 500 ft, stabilises in route and moves up the wing-tip line to echelon. #2 comes off
 * the stack first (19:11Z). Safe separation until the one ahead is stable (SMM 16.34 para 95; AFM7 brief p.21, "Straight
 * Ahead Rejoins"): #3 holds its place off #2 until #2 has reached its vector point, then lines up 1,000 ft behind #2 and
 * stays there until #2 is stable in echelon before it closes; #4 does the same on #3. The first gate is an estimate.
 */
function straightToEchelon(start, t0, opts, sTo) {
  return legsInTurn(start, t0, opts, [(c) => {
    const ech4 = slotsFor('echelon', sTo, { ships: 4 });
    const route = pairSlot('route', sTo);
    const legsFor = (id, holdLineUpUntil) => {
      const { ref } = ech4[id];
      const refAlt = ref === 1 ? 0 : ech4[ref].alt;
      const at = (fwd, left, alt) => place(c, fwd, left, refAlt + alt);
      return [...straightAhead(at, place(c, route.fwd, route.left, ech4[id].alt), { track: ref, holdLineUpUntil }), toSlot(c, slide, ech4[id])];
    };
    const off2 = comeOffFirst(c, 2, 1);
    const vectorIndex = 1; // straightAhead's second phase (the closing leg) arrives at the vector point
    const stableIndex = 3; // the last phase (the move up into echelon) arrives: that wingman is stable in position
    return {
      lead: toSpeed(c, 'echelon'),
      wings: [
        { id: 2, phases: () => [...off2, ...legsFor(2)] },
        { id: 3, phases: (done) => [hold(c, 3, 2, { holdUntil: done[2].times[off2.length + vectorIndex].arrive }), ...legsFor(3, done[2].times[off2.length + stableIndex].arrive)] },
        { id: 4, phases: (done) => [hold(c, 4, 3, { holdUntil: done[3].times[1 + vectorIndex].arrive }), ...legsFor(4, done[3].times[1 + stableIndex].arrive)] },
      ],
    };
  }]);
}

/**
 * The turning rejoin's crossing (SMM 16.34 para 96; AFM7 brief p.21, "Turning Rejoins"): #3 and #4 pass about two aircraft
 * lengths behind Lead and slightly lower. Two lengths is centre to centre here; 15 ft lower is the crossings' estimate
 * (CROSS_LOW_FT). Where #3 and #4 wait on the cut-off line, behind #2 on the inside, until the one ahead is stable: 150 and
 * 300 ft behind Lead, 20 and 30 ft low (estimates: far enough back that no one closes on the aircraft ahead while waiting).
 */
const TRJ = Object.freeze({ passBehindLengths: 2, waitBehindFt: { 3: 150, 4: 300 }, waitLowFt: { 3: 20, 4: 30 } });

/**
 * R2: fighting wing to finger, turning (SMM 16.34 para 96, 16.38 para 106; AFM7 brief p.21). Lead turns into #2 at 30° of
 * bank at 200 KIAS; #2 joins the inside first. #3 and #4 take the same cut-off line as #2 and close on Lead, aiming to pass
 * about two aircraft lengths behind him and slightly lower; they wait on the inside, behind #2, and only once #2 is stable in
 * position does #3 cross behind Lead to echelon on the outer wing; #4 crosses (behind Lead and #3) only once #3 is stable.
 */
function turningToFinger(start, t0, opts, s) {
  return legsInTurn(start, t0, opts, [(c) => {
    const fin = slotsFor('finger', s, { ships: 4 });
    const join = (id) => toSlot(c, rejoinTo, fin[id], { advanceTol: 10, overtakeKias: REJOIN.overtakeKias });
    const off2 = comeOffFirst(c, 2, 1);
    const across = { track: 1, bankCapDeg: 45, overtakeKias: 10, undertakeKias: 10 }; // enough bank to stay with Lead's 30° turn (estimate)
    // #3 and #4's paths, in Lead's frame: wait on the inside behind #2, cross under Lead's tail two lengths back, then forward and up.
    const waitAt = (id) => place(c, -TRJ.waitBehindFt[id], s * ech().left, -TRJ.waitLowFt[id]);
    const crossFor = (id) => {
      const slot = inLeadFrame(fin, id); // #3 on Lead's outer wing, #4 on #3's
      const back = -TRJ.passBehindLengths * LENGTH_FT + (id === 4 ? ech().fwd : 0); // #4 passes behind #3 as well (#3 sits an echelon's step back)
      const low = -CROSS_LOW_FT - (id === 4 ? FOUR_LOWER_FT : 0);
      return [
        slide(place(c, back, 0, low), across),
        slide(place(c, back, slot.left, low), across),
        toSlot(c, slide, fin[id], { bankCapDeg: 45, overtakeKias: 10, undertakeKias: 10 }),
      ];
    };
    const waitFor = (id, gate) => rejoinTo(waitAt(id), { track: 1, advanceTol: 10, overtakeKias: REJOIN.overtakeKias, holdUntil: gate });
    return {
      lead: [...toSpeed(c, 'finger'), turnSeg(wholeDegree(c.start[0].headingRad + s * FINGER_TURN_DEG * DEG), s, REJOIN.leadBankDeg)],
      wings: [
        { id: 2, phases: () => [...off2, join(2)] },
        // #3 closes on the same cut-off line, then waits behind #2 until #2 is in place; #4 the same, further back, until #3 is.
        { id: 3, phases: (done) => [waitFor(3, done[2].times[off2.length].arrive), ...crossFor(3)] },
        { id: 4, phases: (done) => [waitFor(4, done[3].times[3].arrive), ...crossFor(4)] },
      ],
    };
  }]);
}

/**
 * F8: fighting wing to Fluid 4, "FLUID 4, GO" (AFM8 brief p.20): Lead flies straight at 200 KIAS; #3 diverges to a wide
 * line abreast on Lead, 6,000 ft, while #2 and #4 stay in fighting wing on the outside, #4 off #3; the stack goes on once
 * in position. Back to fighting wing is the reverse (an estimate: the manuals give one way).
 */
function fwFluid(start, t0, opts, s, toFluid) {
  return legsInTurn(start, t0, opts, [(c) => {
    if (toFluid) {
      const f4 = slotsFor('fluid4', s, { ships: 4, spacingFt: c.spacingFt });
      return {
        lead: toSpeed(c, 'fluid4'),
        wings: [
          { id: 2, phases: () => [toSlot(c, fwFollow, f4[2])] },
          { id: 3, phases: () => [toSlot(c, openOut, f4[3])] },
          { id: 4, phases: () => [toSlot(c, fwFollow, f4[4])] },
        ],
      };
    }
    const fw = slotsFor('fw', s, { ships: 4, stacked: true });
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
      const f4 = slotsFor('fluid4', s, { ships: 4, spacingFt: c.spacingFt });
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
      const box = slotsFor('offsetBox', s, { ships: 4, spacingFt: c.spacingFt });
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

/** R2 with R1 behind it: the turning rejoin to finger, or straight ahead if the turning one does not plan from here. */
function turningOrStraight(start, t0, opts, s) {
  const turning = turningToFinger(start, t0, opts, s);
  if (turning.ok && turning.legs.every(laneKept)) return turning;
  return { ...closeFromFw(start, t0, opts, s, 'finger'), straightFallback: true, how: 'rejoin to finger through route' };
}

/** The moves four-plan.js still flies from here (refactor PRs 7 and 8 replace them). */
export const LEGACY = Object.freeze({ rejoinToFw, entryToSpread, closeFromFw, straightToEchelon, turningOrStraight, fwFluid, fluidToBox });
