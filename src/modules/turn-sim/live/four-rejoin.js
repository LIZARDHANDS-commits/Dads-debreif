// The 4-ship's rejoins (refactor PR 7, TS-101, the four rebuilt on the 2-ship's planners; Fable's plan, chooser/plan.md section 20;
// the ratified moves table, project files turn-sim-review/four-ship/moves-from-the-manuals.md, Patrick 5 Oct 23:03Z-23:04Z).
//
// Turning rejoins (M11, M16, M22; Patrick 5 Oct 05:34Z: "number 1 turns into number 2 who does a hot turning rejoin, then 3
// and 4 immediately go full power and towards number 1's turn circle, then rejoin on the outside of the turn one at a
// time"): Lead turns into #2 at the press at 30° of bank, slowing to 200 KIAS, and holds the turn until the last wingman is
// in (hand-over.js leadTurnInto; SMM 16.20 para 65b, Patrick 5 Oct 22:35Z). #2 flies the 2-ship's turning rejoin against
// Lead's turn (turning-rejoin.js searchTurningRejoin, the same search and the same rules: 220 KIAS down the line, never
// below 200 unless close in and hot, the whole cone to fighting wing). #3 and #4 close on the outside of Lead's turn, wait
// behind their places, and come in one at a time (SMM 16.34 paras 95-96; AFM8 brief pp.19, 25): #3 once #2 is in, #4 once
// #3 is, the stack kept as the separation (AFM8 brief p.18 item 6).
//
// Straight-ahead rejoins (M10, M12; SMM 16.34 paras 94-95, 16.15 para 38; AFM7 brief p.18 item 2, p.21): each closes in turn
// through route, #2 first, #3 once #2 has route spacing, #4 once #3 has; the stack comes off as they close.
//
// Every step goes through the one envelope gate (flight.js gateRoll, TS-93); the tracker legs fly the 2-ship's power profile
// (four-legs.js onProfile). Until V2.98 these were four-ship-moves.js's, with a kinematic line in front of each long leg.
import { DEG, relativeTo, turnSeg, wholeDegree } from './manoeuvres.js';
import { recordFlight, slide, closeThrough, rejoinTo, straightAhead, sweepOut } from './transitions.js';
import { REJOIN, TURNING_REJOIN, FW_FOLLOW, STRAIGHT_REJOIN } from './tuning.js';
import { onTheLine } from './straight-rejoin.js';
import { KT_TO_FTPS as KT_FTPS } from '../../../core/units.js';
import { fwGoal } from './formation-turns.js';
import { leadTurnInto } from './hand-over.js';
import { searchTurningRejoin, flyWith } from './turning-rejoin.js';
import { LENGTH_FT, slotsFor, FW_STEP_DOWN_FT } from './slots.js';
import { legsInTurn, place, hold, toSlot, inLeadFrame, ech, toSpeed, GENTLE_ALT_FTPS } from './four-legs.js';

/** The overtake the rear wingmen use to close from far out (estimate: the straight-ahead rejoin's 20 to 30 KIAS, EFIG p.371). */
const FAR_OVERTAKE_KIAS = 25;
/** Close crossings go behind and below (SMM 16.32 paras 87-88): 15 ft below Lead, #4 a further 10 ft below #3 (estimates). */
const CROSS_LOW_FT = 15;
const FOUR_LOWER_FT = 10;
/**
 * Where #3 and #4 wait outside Lead's turn until the one ahead is in: 300 and 600 ft behind their places in Lead's frame
 * (estimates: far enough back that no one closes on the aircraft ahead while waiting). The turning rejoin to finger's
 * crossing (SMM 16.34 para 96; AFM7 brief p.21): #3 and #4 pass about two aircraft lengths behind Lead, slightly lower, and
 * wait on the inside behind #2 (150 and 300 ft behind Lead, 20 and 30 ft low; estimates).
 */
const TRJ = Object.freeze({ outsideBehindFt: { 3: 300, 4: 600 }, passBehindLengths: 2, waitBehindFt: { 3: 150, 4: 300 }, waitLowFt: { 3: 20, 4: 30 } });

/** The least G #2's vertical may push to on the way down from his stack (an estimate). */
const VERTICAL_MIN_G = 0.5;

/**
 * A rejoining wingman comes off its stack first (Patrick 4 Oct 19:11Z, "come off first"; SMM 12.27 para 65): one at or above
 * Lead's height holds where it is while it steps down to FW_STEP_DOWN_FT below Lead, at the gentle stack rate, and only then
 * closes. Returns the hold phase, or nothing when it is below Lead already.
 */
function comeOffFirst(c, id, track) {
  const above = c.by.get(id).altAboveFt - c.leadAlt;
  if (above < 0) return [];
  const sec = Math.max(4, (above + FW_STEP_DOWN_FT) / GENTLE_ALT_FTPS);
  return [hold(c, id, track, { holdUntil: c.t0 + sec, altSec: sec }, c.leadAlt - FW_STEP_DOWN_FT)];
}

/**
 * #2's part of a turning rejoin to `to` on side sTo: the 2-ship's turning rejoin against Lead's turn. The 2-ship's search
 * (turning-rejoin.js searchTurningRejoin, Lead rolling out once #2 is in) picks how he flies it and when he is in, once;
 * that rejoin is then flown against Lead's turn as the four fly it (flyWith): in flyLeg's first pass Lead turning on, in
 * its second Lead's real flight, rolling out once the last wingman is in. hot: from line abreast. Null (his tracker legs
 * fly it) when no turning rejoin plans from here.
 */
function twoTurning(c, into, s, to, sTo, hot) {
  let pick;
  return ({ wing, recs, t0 }) => {
    const args = { lead: c.start[0], wing, s, to, sTo, spacingFt: c.spacingFt, blockFt: c.blockFt, t0 };
    // The vertical too (TS-82; Patrick 6 Oct 01:14Z: "they can use the vertical if they need to"), but from his +300 ft
    // stack the climb and the dive through Lead's height pushed to -0.5 G in the dry runs: none below VERTICAL_MIN_G.
    pick ??= searchTurningRejoin({ ...args, into, hot, verticalMinG: VERTICAL_MIN_G }) ?? false;
    if (!pick) return null;
    const rec = recs[1];
    const flown = flyWith({ ...args, into: { longRec: rec, planTo: () => ({ rec, segments: [], turned: 0 }) }, aimFt: pick.aimFt, bankCapDeg: pick.bankCapDeg, overtakeKt: pick.overtakeKt, lowFloor: pick.lowFloor, upFt: pick.upFt, minG: VERTICAL_MIN_G });
    if (!flown) return null;
    return { plan: { segments: [{ kind: 'bankTrack', points: [...flown.part.points, ...flown.run.points] }], profile: flown.profile }, durationSec: flown.durationSec, inSec: t0 + pick.durationSec };
  };
}

/** When an earlier wingman's part was in: his planner's own time, else his tracker's last arrival. */
const inAt = (done, id) => done[id].inSec ?? done[id].times[done[id].times.length - 1].arrive;

/**
 * Spread 4, the offset box, or anywhere else, to fighting wing (M16, M22; AFM8 brief pp.19, 25, AFM7 p.17): the turning
 * rejoin above; with rejoin 'straight' Lead holds straight and each closes in turn. from: the formation key now.
 */
export function rejoinToFw(start, t0, opts, s, from) {
  return legsInTurn(start, t0, opts, [(c) => {
    const slots = { ...slotsFor('fw', s, { ships: 4, stacked: c.stacked }) };
    // #2's +300 ft comes off before it closes: it rejoins to fighting wing below Lead (Patrick 4 Oct 19:11Z).
    if (slots[2].alt >= 0) slots[2] = { ...slots[2], alt: -FW_STEP_DOWN_FT };
    const lead = c.start[0];
    const far = (id) => (Math.abs(relativeTo(lead, c.by.get(id)).left) > 3000 ? FAR_OVERTAKE_KIAS : REJOIN.overtakeKias);
    const waitAt = (id) => {
      const p = inLeadFrame(slots, id);
      return place(c, p.fwd - TRJ.outsideBehindFt[id], p.left, p.alt);
    };
    const outside = (id, gateId) => ({
      id,
      phases: (done) => [
        rejoinTo(waitAt(id), { track: 1, overtakeKias: far(id), advanceTol: 60, holdUntil: inAt(done, gateId), bankCapDeg: TURNING_REJOIN.bankCapDeg }),
        // into the cone off the aircraft he flies off, settling where he arrives in it (the whole cone, Patrick 5 Oct 08:58Z;
        // TS-75), his stack held as the separation
        { ...toSlot(c, sweepOut, slots[id]), ...FW_FOLLOW, coneAlt: false, goal: (R, W) => fwGoal(R, W, -s, false) },
      ],
    });
    const two = { id: 2, phases: () => [toSlot(c, rejoinTo, slots[2], { overtakeKias: far(2) })] };
    if (opts.rejoin === 'straight') return { lead: toSpeed(c, 'fw'), wings: [two, outside(3, 2), outside(4, 3)], how: 'straight-ahead rejoin to fighting wing' };
    const into = leadInto(c, s, 'fw');
    const hot = from === 'spread4' || from === 'offsetBox';
    return {
      lead: { hold: into, until: [2, 3, 4] },
      wings: [{ ...two, fly: twoTurning(c, into, s, 'fw', s, hot) }, outside(3, 2), outside(4, 3)],
    };
  }]);
}

/** The four's turning-rejoin legs for Lead: his speed change while he turns, and the turn held until `until` are in. */
function leadInto(c, s, key) {
  const pre = toSpeed(c, key).map((x) => ({ ...x, withNext: true }));
  return leadTurnInto({ lead: c.start[0], pre, s, bankDeg: REJOIN.leadBankDeg, t0: c.t0, record: recordFlight });
}

/**
 * Fighting wing or Spread 4 to finger as a turning rejoin (M11; SMM 16.34 paras 94, 96, 16.38 para 106; AFM7 brief p.21
 * items 1-5; from Spread 4 Patrick's Q5 ruling, 5 Oct 23:04Z). Lead turns into #2 and holds it until #4 is in; #2 joins the
 * inside, in echelon on Lead (the 2-ship's turning rejoin). From fighting wing #3 and #4 take the same cut-off line, wait
 * on the inside behind #2, and cross about two lengths behind and slightly below Lead to the outside: #3 only once #2 is
 * in, #4 only once #3 is. From Spread 4 they are on the outside already: they close on the outside of Lead's turn, wait
 * behind their places on their stacks, and close through route into finger one at a time, the stack coming off as they
 * close. from: the formation key now.
 */
export function turningToFinger(start, t0, opts, s, from) {
  return legsInTurn(start, t0, opts, [(c) => {
    const fin = slotsFor('finger', s, { ships: 4 });
    const route = slotsFor('route', s, { ships: 4 });
    const hot = from === 'spread4';
    const into = leadInto(c, s, 'finger');
    const two = { id: 2, fly: twoTurning(c, into, s, 'echelon', s, hot), phases: () => [...comeOffFirst(c, 2, 1), toSlot(c, rejoinTo, fin[2], { advanceTol: 10 })] };
    const far = (id) => (Math.abs(relativeTo(c.start[0], c.by.get(id)).left) > 3000 ? FAR_OVERTAKE_KIAS : REJOIN.overtakeKias);
    // From Spread 4: outside, then in through route (transitions.js closeThrough: close level or slightly low, then up).
    const outside = (id, gateId) => ({
      id,
      phases: (done) => {
        const p = inLeadFrame(fin, id);
        const stackAlt = c.by.get(id).altAboveFt - c.leadAlt;
        return [
          rejoinTo(place(c, p.fwd - TRJ.outsideBehindFt[id], p.left, stackAlt), { track: 1, overtakeKias: far(id), advanceTol: 60, holdUntil: inAt(done, gateId), bankCapDeg: TURNING_REJOIN.bankCapDeg }),
          toSlot(c, closeThrough, { ...route[id], alt: route[id].alt - 25 }, { advanceTol: 6 }),
          toSlot(c, slide, fin[id]),
        ];
      },
    });
    // From fighting wing: the cut-off line inside, then across behind Lead.
    const across = { track: 1, bankCapDeg: 45, overtakeKias: 10, undertakeKias: 10 }; // enough bank to stay with Lead's 30° turn (estimate)
    const crossing = (id, gateId) => ({
      id,
      phases: (done) => {
        const slot = inLeadFrame(fin, id); // #3 on Lead's outer wing, #4 on #3's
        const back = -TRJ.passBehindLengths * LENGTH_FT + (id === 4 ? ech().fwd : 0); // #4 passes behind #3 as well
        const low = -CROSS_LOW_FT - (id === 4 ? FOUR_LOWER_FT : 0);
        return [
          rejoinTo(place(c, -TRJ.waitBehindFt[id], s * ech().left, -TRJ.waitLowFt[id]), { track: 1, advanceTol: 10, overtakeKias: REJOIN.overtakeKias, holdUntil: inAt(done, gateId) }),
          slide(place(c, back, 0, low), across),
          slide(place(c, back, slot.left, low), across),
          toSlot(c, slide, fin[id], { bankCapDeg: 45, overtakeKias: 10, undertakeKias: 10 }),
        ];
      },
    });
    const wing = hot ? outside : crossing;
    return { lead: { hold: into, until: [2, 3, 4] }, wings: [two, wing(3, 2), wing(4, 3)] };
  }]);
}

/**
 * Fighting wing to route or finger, straight ahead (M10, M12; SMM 16.34 para 95, 16.15 para 38; AFM7 brief p.18 item 2):
 * each closes through route in turn, #2 first, #3 once #2 has route spacing, #4 once #3 has; the stack comes off as they
 * close.
 */
export function closeFromFw(start, t0, opts, s, to) {
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
 * Fighting wing to echelon as a straight-ahead rejoin (M10; Patrick 4 Oct 19:04Z, TS-55; SMM 12.26 paras 62-63, Fig 12.17;
 * EFIG p.371). Each wingman rejoins on the one it will fly off in echelon: lines up on its six about 1,000 ft back just
 * below the wake (Fig 12.17; Patrick's card 19:54Z), closes with overtake, takes the small vector to the echelon side at
 * about 500 ft, joins the wing-tip line and flows up it into echelon without stopping (V2.106). #2 comes off the stack first (19:11Z). Safe
 * separation until the one ahead is stable (SMM 16.34 para 95; AFM7 brief p.21): #3 holds its place off #2 until #2 has
 * reached its vector point, then lines up 1,000 ft behind #2 and stays there until #2 is stable in echelon; #4 the same on
 * #3. The first gate is an estimate.
 */
export function straightToEchelon(start, t0, opts, sTo) {
  return legsInTurn(start, t0, opts, [(c) => {
    const ech4 = slotsFor('echelon', sTo, { ships: 4 });
    // Each joins the spinner-to-wingtip line of the one it flies off and flows up it into echelon, never stopping short
    // (Patrick 6 Oct 02:01Z; the 2-ship's SARJ since V2.105). Until V2.106 they stopped in route, nearly abreast, then slid in.
    const line = onTheLine(sTo);
    const flowFtps = STRAIGHT_REJOIN.lineArriveKt * KT_FTPS;
    const legsFor = (id, holdLineUpUntil) => {
      const { ref } = ech4[id];
      const refAlt = ref === 1 ? 0 : ech4[ref].alt;
      const at = (fwd, left, alt) => place(c, fwd, left, refAlt + alt);
      const [lineUp, close, toLine] = straightAhead(at, place(c, line.fwd, line.left, ech4[id].alt), { track: ref, holdLineUpUntil, advanceTol: STRAIGHT_REJOIN.lineFlowFt });
      return [lineUp, close, { ...toLine, closureCapFtps: flowFtps }, toSlot(c, slide, ech4[id], { closureCapFtps: flowFtps })];
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
