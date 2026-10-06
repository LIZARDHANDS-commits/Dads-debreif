// The 4-ship's legs (refactor PR 6, the four rebuilt on the 2-ship's planners; Fable's plan, chooser/plan.md section 20;
// Patrick "agreed" 5 Oct 23:18Z): the machinery every 4-ship move is built from. A move is one or more legs; a leg plans
// Lead first, then each wingman in an order where the aircraft he flies off is already planned (#4 off #3 "flies through
// #3", SMM 16.37 para 103), each against the others' recorded flights (transitions.js recordFlight), through the same
// flight step as every other aircraft, so the path drawn is the path flown (spec F1).
//
// A wingman's part is either tracker legs (`phases`, the 2-ship's own leg recipes on the 2-ship's power profile,
// hand-over.js onClosure: the close-in rate for a close leg, a rejoin's closure for a long one) or a held-command planner of
// its own (`fly`, the rejoins and the opening out: four-rejoin.js, four-open.js), which hands back its plan and when it
// was in. Every step any of them flies goes through the one envelope gate (flight.js gateRoll, TS-93).
//
// "Wait for the one ahead" (SMM 16.32 para 86, 16.34 paras 95-96; AFM7 brief p.18 item 2d) is a gate: a start time from
// the earlier aircraft's planned arrival (`holdUntil` on a tracker leg), or a new leg that starts when every aircraft of
// the last one is settled. Legs join on the exact step they were planned from (flight.js hold thenNext).
//
// Until V2.97 this lived in four-ship-moves.js with the moves, the from-to graph and a kinematic line before each tracker
// leg (lineFirst); the lines' replayed poses were where the four's 80-90 G/s onsets came from (the rebuild handover's
// baseline), so they are not used here.
import { STEP_SEC, copyAircraft } from './flight.js';
import { relativeTo } from './manoeuvres.js';
import { recordFlight, flyStep, dryRunT, speedSeg } from './transitions.js';
import { trackTwice, runTracker, phase } from './tracker.js';
import { inLeadsPlane, planeEaseSec } from './turning-rejoin.js';
import { onClosure } from './hand-over.js';
import { isStacked } from './judge.js';
import { FOUR_FORMATIONS, pairSlot } from './slots.js';

/** A generous limit on one 4-ship change: it only catches a plan that never ends (design section 9). */
export const FOUR_CHANGE_LIMIT_SEC = 480;
/**
 * Height changes (a stack coming on or off) average no more than this: 15 ft/s, 900 ft/min, so about 1,700 ft/min at the
 * steepest point of the smooth leg (an estimate; the manuals give no rate).
 */
export const GENTLE_ALT_FTPS = 15;

export const NAMES = Object.freeze({ 1: 'Lead', 2: '#2', 3: '#3', 4: '#4' });

// The 2-ship's close places (slots.js), read when a move is planned.
export const ech = () => pairSlot('echelon', 1); // { fwd: -25, left: 45, alt: -5 }
export const ast = () => pairSlot('astern', 0); // { fwd: -43.4, left: 0, alt: -8 }

/**
 * One wingman's part as tracker legs: the phases on the 2-ship's power profile (hand-over.js onClosure; a leg marked
 * `closeIn`, a settle after a held part, at the close-in rate throughout), except legs held in world axes (an in-place
 * turn), which fly as they are. Height changes no quicker than GENTLE_ALT_FTPS unless the leg says. A leg with `heldBankDeg`
 * keeps that bank cap over the profile's (the 4-ship's opening out, moves.js FOUR_OPEN); one with `closureCapFtps` closes
 * no faster than that (the 4-ship's flow up the line into echelon, moves.js STRAIGHT_REJOIN), and one with `closureMinFtps` no
 * slower (the 4-ship's drop back to fighting wing, four-close.js DROP_FAST).
 */
function onProfile(phases) {
  return phases.map((ph) => {
    const p = { ...ph, altRateFtps: ph.altRateFtps ?? GENTLE_ALT_FTPS };
    if (p.world) return p;
    const q = onClosure([p], { closeIn: Boolean(p.closeIn) })[0];
    const held = p.heldBankDeg != null ? { ...q, bankCapDeg: p.heldBankDeg } : q;
    const floored = p.closureMinFtps != null && p.closureMinFtps > held.closureFtps ? { ...held, closureFtps: p.closureMinFtps, vrelMax: Math.max(held.vrelMax, p.closureMinFtps) } : held;
    return p.closureCapFtps != null ? { ...floored, closureFtps: Math.min(floored.closureFtps, p.closureCapFtps) } : floored;
  });
}

/**
 * A tracker wingman's last leg into a close place, in Lead's wing plane (TS-127, as the 2-ship's turning rejoin, TS-126;
 * SMM 12.19 paras 41-43, Fig 12.11; Patrick 6 Oct 07:18Z: "All rejoins should do this"): from the start of his last leg his
 * height eases into the plane (turning-rejoin.js inLeadsPlane), and the tracker flies once more with those heights so its
 * power pays for them. Returns { run, profile, planeInSec } (planeInSec: when he is in the plane, for Lead's roll-out).
 */
function intoLeadsPlane(wing0, leadRec, recs, phases, run, profile, t0, blockFt) {
  const last = run.times[run.times.length - 1];
  const from = Math.max(0, Math.round(((last.t0 ?? t0) - t0) / STEP_SEC));
  const plan = (r, p) => ({ segments: [{ kind: 'bankTrack', points: r.points }], profile: p });
  const W = recordFlight(wing0, plan(run, profile), t0).at(from);
  const easeSec = planeEaseSec(relativeTo(leadRec.at(from), W), leadRec.at(from));
  const inPlane = (r) => inLeadsPlane(wing0, plan(r, profile), leadRec, t0, from, r.points.length, easeSec);
  const again = runTracker({ refs: recs, wing0, t0, phases, profile: inPlane(run), blockFt, maxSec: FOUR_CHANGE_LIMIT_SEC });
  const r = again.ok ? again : run;
  return { run: r, profile: inPlane(r), planeInSec: t0 + from * STEP_SEC + easeSec };
}

/**
 * Plans one leg from `start` (the four as they are at t0). lead: Lead's segments, or a held turn ({ hold: leadTurnInto's
 * { longRec, planTo }, until: ids, rollOutRoll? }: Lead turns on until those wingmen are in, then rolls out on the whole
 * degree, at rollOutRoll if given). wings: [{ id, phases(done, recs), plane? } | { id, fly(ctx), phases?, plane? }] (plane: his
 * last leg ends in Lead's wing plane, intoLeadsPlane) in an order where the aircraft each flies off is planned first;
 * `done[id]` holds an earlier wingman's { times, inSec, endSec } for gates, `recs[id]` his recorded flight. fly(ctx) gets
 * { wing, recs, done, t0, blockFt } and returns { plan, inSec, durationSec, times? }, { ok: false, reason }, or null when
 * it does not apply from here (then `phases`, if given, flies it).
 * Returns { ok, reason?, t0, endSec, plans: { id: { segments, profile } }, done, leadTurnDeg }.
 */
export function flyLeg(start, t0, lead, wings, blockFt) {
  const by = new Map(start.map((a) => [a.id, a]));
  const L0 = start[0];
  const held = lead && !Array.isArray(lead) ? lead : null;
  const planWings = (leadRec) => {
    const recs = { [L0.id]: leadRec };
    const done = {};
    const plans = {};
    let endSec = t0;
    let settleSec = t0; // when the last wingman has settled in place, before he lines up on Lead's heading to the last 0.01°
    for (const w of wings) {
      const wing0 = by.get(w.id);
      let part = w.fly ? w.fly({ wing: wing0, recs, done, t0, blockFt }) : null;
      if (part && part.ok === false) return { ok: false, reason: part.reason ?? `${NAMES[w.id]} found no way into its place.`, id: w.id };
      if (!part && !w.phases) return { ok: false, reason: `${NAMES[w.id]} found no way into its place.`, id: w.id };
      if (!part) {
        // Tracker legs (or the fallback when a held planner does not apply from here).
        const phases = onProfile(w.phases(done, recs));
        let { run, profile } = trackTwice({ refs: recs, wing0, t0, phases, blockFt, maxSec: FOUR_CHANGE_LIMIT_SEC });
        if (!run.ok) return { ok: false, reason: `${NAMES[w.id]} could not settle in its place inside ${Math.round(FOUR_CHANGE_LIMIT_SEC / 60)} minutes.`, id: w.id };
        let planeInSec = t0;
        if (w.plane) ({ run, profile, planeInSec } = intoLeadsPlane(wing0, leadRec, recs, phases, run, profile, t0, blockFt));
        const last = run.times[run.times.length - 1];
        part = { plan: { segments: [{ kind: 'bankTrack', points: run.points }], profile }, durationSec: run.durationSec, inSec: Math.max(last.arrive ?? t0 + run.durationSec, planeInSec), times: run.times, maxBankDeg: run.maxBankDeg };
        part.profileEnd = Math.max(t0, ...profile.map((leg) => leg.t1));
      }
      plans[w.id] = part.plan;
      recs[w.id] = recordFlight(wing0, part.plan, t0);
      done[w.id] = { times: part.times ?? [], inSec: part.inSec, endSec: t0 + part.durationSec };
      endSec = Math.max(endSec, t0 + part.durationSec, part.profileEnd ?? t0);
      const settled = part.times?.length ? part.times[part.times.length - 1].t1 : null;
      settleSec = Math.max(settleSec, settled ?? t0 + part.durationSec, part.profileEnd ?? t0);
    }
    return { ok: true, recs, done, plans, endSec, settleSec };
  };
  let leadSegs;
  let flown;
  let leadTurnDeg = 0;
  if (held) {
    // Lead turns on while the wingmen are planned against it; then his real plan rolls out once the last of `until` is in,
    // and the wingmen are planned again against it (their parts before his roll-out are the same flight).
    const first = planWings(held.hold.longRec);
    if (!first.ok) return first;
    const inStep = Math.round((Math.max(...held.until.map((id) => first.done[id].inSec)) - t0) / STEP_SEC);
    const lp = held.hold.planTo(inStep, held.rollOutRoll ?? null);
    leadSegs = lp.segments;
    leadTurnDeg = Math.round((lp.turned * 180) / Math.PI);
    flown = planWings(lp.rec);
    if (!flown.ok) return flown;
  } else {
    leadSegs = lead ?? [];
    flown = planWings(recordFlight(L0, { segments: leadSegs }, t0));
    if (!flown.ok) return flown;
  }
  const leadEnd = t0 + dryRunT(L0, { segments: leadSegs }, t0, { maxSec: FOUR_CHANGE_LIMIT_SEC }).durationSec;
  const endSec = Math.max(flown.endSec, leadEnd);
  const onStep = (T) => t0 + Math.ceil((T - t0) / STEP_SEC - 1e-6) * STEP_SEC;
  return {
    ok: true,
    t0,
    endSec: onStep(endSec),
    settleSec: onStep(Math.max(flown.settleSec, leadEnd)),
    plans: { [L0.id]: { segments: leadSegs.map((s) => ({ ...s })) }, ...flown.plans },
    done: flown.done,
    leadTurnDeg,
  };
}

/** The four at formation time T after flying a leg (each straight and level once its own part is done). */
export function statesAt(start, leg, T) {
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
export function joinLegs(legs, ids) {
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
        const n = p.segments.reduce((sum, s) => sum + (s.points?.length ?? s.poses?.length ?? 0), 0);
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
export function context(start, t0, opts) {
  const by = new Map(start.map((a) => [a.id, a]));
  return { start, by, t0, leadAlt: start[0].altAboveFt, spacingFt: opts.spacingFt, blockFt: opts.blockFt, stacked: isStacked(start), opts };
}

/** A phase builder's slot: fwd and left in the frame of `track`, height against Lead turned into the profile's height. */
export const place = (c, fwd, left, alt) => ({ fwd, left, alt: c.leadAlt + alt });

/**
 * Hold where it is now in the frame of `track` (a wingman waiting its turn). With `world: true` the offset is held in world
 * axes (x, y), so the wingman turns with its reference as in an in-place turn.
 */
export function hold(c, id, track, over = {}, altFt = c.by.get(id).altAboveFt) {
  const ref = c.by.get(track);
  const me = c.by.get(id);
  const rel = over.world ? { fwd: me.xFt - ref.xFt, left: me.yFt - ref.yFt } : relativeTo(ref, me);
  return phase({ fwd: rel.fwd, left: rel.left, alt: altFt }, { track, bankCapDeg: 45, overtakeKias: 15, undertakeKias: 15, advanceTol: 10, finalTol: 3, ...over });
}

/** A table slot (slots.js) as a phase of the given kind. */
export const toSlot = (c, kind, slot, over = {}) => kind(place(c, slot.fwd, slot.left, slot.alt), { track: slot.ref, ...over });

/** Where a slot off #2 or #3 is in Lead's frame once everyone is in place (all on one heading, so the offsets add). */
export function inLeadFrame(slots, id) {
  let fwd = 0;
  let left = 0;
  for (let k = id; k !== 1; k = slots[k].ref) {
    fwd += slots[k].fwd;
    left += slots[k].left;
  }
  return { fwd, left, alt: slots[id].alt };
}

/**
 * Runs a list of leg makers one after another: each gets the context at its own start. A step starts as soon as everyone in
 * the one before has settled in place (when #2 sees room, SMM 16.32 para 87; Patrick 6 Oct 05:29Z), not after each has also
 * lined up on Lead's heading to the last hundredth of a degree; the last step flies to its end. Until V2.128 each step
 * waited for that line-up too, 5 to 8 s a step. A leg with a held planner's part (not tracker points) still flies to its end.
 */
export function legsInTurn(start, t0, opts, makers) {
  const legs = [];
  let now = start;
  let t = t0;
  let before = null; // the last leg flown, cut at its settle time: { leg, from (the states it started from), whole (its uncut plans) }
  for (const make of makers) {
    const c = context(now, t, opts);
    const spec = make(c);
    if (!spec) continue;
    const leg = flyLeg(now, t, spec.lead ?? [], spec.wings, opts.blockFt);
    if (!leg.ok) return { ok: false, reason: leg.reason, legs };
    legs.push(leg);
    const from = now;
    const whole = leg.plans;
    const cut = cutAt(leg, leg.settleSec);
    before = cut ? { leg, from, whole } : null;
    now = statesAt(from, leg, leg.endSec);
    t = leg.endSec;
  }
  // The last leg flies to its end.
  if (before) {
    Object.assign(before.leg, { plans: before.whole, endSec: before.leg.wholeEndSec });
    now = statesAt(before.from, before.leg, before.leg.endSec);
    t = before.leg.endSec;
  }
  return { ok: true, legs, end: now, endSec: t };
}

/**
 * Cuts a leg's wingmen's tracker points at T (on a step), so the next leg starts then; a no-op (false) when T is not before
 * its end or a part is not tracker points.
 */
function cutAt(leg, T) {
  if (!(T < leg.endSec - 1e-9)) return false;
  const n = Math.round((T - leg.t0) / STEP_SEC);
  const plans = {};
  for (const [id, p] of Object.entries(leg.plans)) {
    if (Number(id) === 1) {
      plans[id] = p;
      continue;
    }
    if (!p.segments.every((sg) => sg.kind === 'bankTrack')) return false;
    let left = n;
    const segments = [];
    for (const sg of p.segments) {
      if (left <= 0) break;
      segments.push({ ...sg, points: sg.points.slice(0, left) });
      left -= sg.points.length;
    }
    plans[id] = { ...p, segments };
  }
  Object.assign(leg, { plans, wholeEndSec: leg.endSec, endSec: T });
  return true;
}

/** Lead's speed change into a formation's speed, when he is not there already. */
export const toSpeed = (c, key) => (Math.abs(c.start[0].kias - FOUR_FORMATIONS[key].kias) > 0.5 ? [speedSeg(c.start[0].kias, FOUR_FORMATIONS[key].kias, c.blockFt)] : []);
