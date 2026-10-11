// The 4-ship's rejoins (refactor PR 7, TS-101, the four rebuilt on the 2-ship's planners; Fable's plan, chooser/plan.md section 20;
// the ratified moves table, project files turn-sim-review/four-ship/moves-from-the-manuals.md, Patrick 5 Oct 23:03Z-23:04Z).
//
// Turning rejoins (M11, M16, M22; Patrick 5 Oct 05:34Z: "number 1 turns into number 2 who does a hot turning rejoin, then 3
// and 4 immediately go full power and towards number 1's turn circle, then rejoin on the outside of the turn one at a
// time"): Lead turns into #2 at the press at 30° of bank, slowing to 200 KIAS, and holds the turn until the last wingman is
// in (lead-turn-in.js leadTurnInto; SMM 16.20 para 65b, Patrick 5 Oct 22:35Z). #2 flies the 2-ship's turning rejoin against
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
import { recordFlight } from './replay.js';
import { STEP_SEC } from './flight.js';
import { slide, closeThrough, rejoinTo, straightAhead, STRAIGHT_AHEAD } from './recipes.js';
import { REJOIN, TURNING_REJOIN, STRAIGHT_REJOIN, WING_BANKS, KIAS_OUTSIDE_LAB } from './tuning.js';
import { phase } from './tracker.js';
import { RATE_SETS, G_RULE_BANK_DEG } from './rates.js';
import { KT_TO_FTPS as KT_FTPS } from '../../../core/units.js';
import { leadTurnInto } from './lead-turn-in.js';
import { searchTurningRejoin, flyTurningRejoinWith } from './turning-rejoin.js';
import { LENGTH_FT, slotsFor, pairSlot, FW_STEP_DOWN_FT, fixedLine } from './slots.js';
import { legsInTurn, place, hold, toSlot, inLeadFrame, ech, toSpeed, inCone, GENTLE_ALT_FTPS, FOUR_CHANGE_LIMIT_SEC } from './four-legs.js';

/** The overtake the rear wingmen use to close from far out (estimate: the straight-ahead rejoin's 20 to 30 KIAS, EFIG p.371). */
const FAR_OVERTAKE_KIAS = 25;
/**
 * From Spread 4 and the offset box to fighting wing Lead holds straight and each closes at full power until in his cone
 * (Patrick's card 6 Oct 06:05Z: "Straight, MAX"): a closure floor more than full power gives at these speeds, so the engine
 * is the limit and the power-back stop still brings him in (estimate).
 */
const MAX_CLOSURE_FTPS = 80 * KT_FTPS;
/** Close crossings go behind and below (SMM 16.32 paras 87-88): 15 ft below Lead, #4 a further 10 ft below #3 (estimates). */
const CROSS_LOW_FT = 15;
const FOUR_LOWER_FT = 10;
/**
 * Where #3 and #4 wait outside Lead's turn until the one ahead is in: a window behind their places in Lead's frame, still
 * closing slowly, #3 anywhere 250-550 ft back and #4 600-900 ft (Patrick 6 Oct 03:42Z, card 03:45Z: "#3 and #4 wait anywhere
 * 250-550 ft and 600-900 ft behind their places, still closing slowly, and come in one at a time"; TS-110; 300 and 600 ft
 * points until V2.122). Each closes to the window's far edge, then creeps toward its near edge at creepKt (an estimate) and
 * holds there only if the one ahead is still not in; anywhere in it, he goes on in once that one is. The turning rejoin to finger's
 * crossing (SMM 16.34 para 96; AFM7 brief p.21): #3 and #4 pass about two aircraft lengths behind Lead, slightly lower, and
 * wait on the inside behind #2 (150 and 300 ft behind Lead, 20 and 30 ft low; estimates).
 */
const TRJ = Object.freeze({ outsideWindowFt: { 3: [250, 550], 4: [600, 900] }, creepKt: 5, passBehindLengths: 2, waitBehindFt: { 3: 150, 4: 300 }, waitLowFt: { 3: 20, 4: 30 } });

/** In the rejoin to fighting wing #3 and #4 pass the point behind their places within this, without stopping (an estimate). */
const FW_PASS_FT = 300;

/** The least G #2's vertical may push to on the way down from his stack (an estimate). */
const VERTICAL_MIN_G = 0.5;

/** How long Lead flies straight on while a straight-ahead rejoin from a spread position is planned (planning only). */
const STRAIGHT_HORIZON_SEC = 300;

/**
 * Into echelon, #3 and #4 wait in their windows no lower than this below their places, their stack coming off on the way
 * in, so neither climbs up into his place from 300 or 600 ft below at the end (estimates; V2.220 dry runs).
 */
const WINDOW_STACK_FT = { 3: 100, 4: 200 };

/**
 * On an Away rejoin #2 crosses Lead's six no closer than this far behind and this far below him (TS-179; Patrick's card
 * 10 Oct 2026 22:30Z, "500 ft, 50 ft below"): a reference, not a wall. The planner aims for it and a closer cross is
 * flagged on screen.
 */
export const AWAY_CROSS = Object.freeze({ behindFt: 500, belowFt: 50 });

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
 * that rejoin is then flown against Lead's turn as the four fly it (flyTurningRejoinWith): in flyLeg's first pass Lead turning on, in
 * its second Lead's real flight, rolling out once the last wingman is in. hot: from line abreast. Null (his tracker legs
 * fly it) when no turning rejoin plans from here.
 */
function twoTurning(c, into, s, to, sTo, hot, crossIn = false, xLaw = hot) {
  let pick;
  return ({ wing, recs, t0 }) => {
    const args = { lead: c.start[0], wing, s, to, sTo, spacingFt: c.spacingFt, blockFt: c.blockFt, t0 };
    // The vertical too (TS-82; Patrick 6 Oct 01:14Z: "they can use the vertical if they need to"), but from his +300 ft
    // stack the climb and the dive through Lead's height pushed to -0.5 G in the dry runs: none below VERTICAL_MIN_G.
    // He flies the 2-ship's X to the 250-100 ft window (TS-106, Lead fixed on the canopy): on the line law from line abreast
    // he ran 170 ft ahead of Lead's 3/9 line close in (V2.223 test), and from fighting wing to finger he ran up abeam route,
    // dropped back 110 ft and passed 30 ft from #3 waiting behind Lead (V2.228). From Fluid 4 he keeps the line law to
    // route (xLaw false): the X from there put him 20 ft behind Lead's tail.
    pick ??= searchTurningRejoin({ ...args, into, hot, verticalMinG: VERTICAL_MIN_G, xLaw, crossIn }) ?? false;
    if (!pick) return null;
    const rec = recs[1];
    const flown = flyTurningRejoinWith({ ...args, into: { longRec: rec, planTo: () => ({ rec, segments: [], turned: 0 }) }, aimFt: pick.aimFt, bankCapDeg: pick.bankCapDeg, overtakeKt: pick.overtakeKt, lowFloor: pick.lowFloor, upFt: pick.upFt, minG: VERTICAL_MIN_G, xLaw, holdSec: FOUR_CHANGE_LIMIT_SEC, crossIn });
    if (!flown) return null;
    const segments = flown.wingSegments
      ? flown.wingSegments.map((s) => ({ ...s, points: s.points ? [...s.points] : undefined, poses: s.poses ? [...s.poses] : undefined }))
      : [{ kind: 'bankTrack', points: [...flown.part.points, ...flown.run.points] }];
    return { plan: { segments, profile: flown.profile }, durationSec: flown.durationSec, inSec: t0 + flown.settleSec };
  };
}

/**
 * The wait outside behind a place (p, in Lead's frame) as two legs: to the window's far edge, then creeping toward its near
 * edge until gateAt (TRJ above). over: the rejoin leg's own options. creepAlt: the height he comes up to while he creeps,
 * so he is not left climbing up into his place from his stack at the end.
 */
function waitInWindow(c, id, p, alt, gateAt, over, creepAlt = alt) {
  const [nearFt, farFt] = TRJ.outsideWindowFt[id];
  return [
    // arriving anywhere in the window counts: within 60 ft of its far edge he flew past it on the inside of the turn and fell
    // back 300-600 ft to reach it (V2.224 test, Spread 4 to echelon)
    rejoinTo(place(c, p.fwd - farFt, p.left, alt), { track: 1, advanceTol: farFt - nearFt + 60, ...over }),
    // anywhere in the window counts: he goes on in the moment the one ahead is in
    rejoinTo(place(c, p.fwd - nearFt, p.left, creepAlt), { track: 1, ...over, advanceTol: farFt - nearFt + 60, closureCapFtps: TRJ.creepKt * KT_FTPS, holdUntil: gateAt }),
  ];
}

/** When an earlier wingman's part was in: his planner's own time, else his tracker's last arrival. */
const inAt = (done, id) => done[id].inSec ?? done[id].times[done[id].times.length - 1].arrive;

/**
 * Spread 4, the offset box, Fluid 4 or anywhere else, to fighting wing (M16, M22; AFM8 brief pp.19, 25, AFM7 p.17): the
 * turning rejoin above; with rejoin 'straight' Lead holds straight and each closes in turn, from Spread 4 and the offset box
 * at full power until in his cone (MAX_CLOSURE_FTPS; TS-123). V2.134 to V2.218 they were always straight; TS-176 offers
 * the turning rejoin there too. from: the formation key now.
 */
export function rejoinToFw(start, t0, opts, s, from) {
  return legsInTurn(start, t0, opts, [(c) => {
    const slots = { ...slotsFor('fw', s, { ships: 4, stacked: c.stacked }) };
    // #2's +300 ft comes off before it closes: it rejoins to fighting wing below Lead (Patrick 4 Oct 19:11Z).
    if (slots[2].alt >= 0) slots[2] = { ...slots[2], alt: -FW_STEP_DOWN_FT };
    const lead = c.start[0];
    const far = (id) => (Math.abs(relativeTo(lead, c.by.get(id)).left) > 3000 ? FAR_OVERTAKE_KIAS : REJOIN.overtakeKias);
    const straight = opts.rejoin === 'straight';
    // From Spread 4 and the offset box the straight-ahead rejoin is at full power until in the cone (TS-123, now the SARJ there; TS-176).
    const max = straight && (from === 'spread4' || from === 'offsetBox') ? { closureMinFtps: MAX_CLOSURE_FTPS } : {};
    const outside = (id) => ({
      id,
      phases: () => [
        // no waiting for the one ahead (Patrick 6 Oct 05:45Z: "2 immedately flis into his cone, 3 misses to and flies to
        // their cone, 4 misses 3 and flies to theirs"): through the far edge of his window behind his place, his stack held
        // as the separation, and on in. Until V2.131 each waited in the window until the one ahead was in.
        rejoinTo(place(c, inLeadFrame(slots, id).fwd - TRJ.outsideWindowFt[id][1], inLeadFrame(slots, id).left, slots[id].alt), { track: 1, advanceTol: FW_PASS_FT, overtakeKias: far(id), bankCapDeg: TURNING_REJOIN.bankCapDeg, ...max }),
        // into the cone off the aircraft he flies off, settling where he arrives in it (the whole cone, Patrick 5 Oct 08:58Z;
        // TS-75), his stack held as the separation
        inCone(c, slots[id], -s),
      ],
    });
    const two = { id: 2, phases: () => [...comeOffFirst(c, 2, 1), toSlot(c, rejoinTo, slots[2], { overtakeKias: far(2), ...max })] };
    if (straight) return { lead: toSpeed(c, 'fw'), wings: [two, outside(3), outside(4)], how: 'straight-ahead rejoin to fighting wing' };
    const into = leadInto(c, s, 'fw', from === 'offsetBox' ? BOX_PAUSE_SEC : 0);
    return {
      lead: { hold: into, until: [2, 3, 4] },
      wings: [{ ...two, fly: twoTurning(c, into, s, 'fw', s, false) }, ...[3, 4].map((id) => (from === 'offsetBox' ? onLineFirst(c, outside(id), s, id === 4 ? BOX_LINE_FW4_FT : BOX_LINE_FT) : outside(id)))],
    };
  }]);
}

/**
 * From a spread position, thousands of feet out, a straight-ahead rejoin's #3 and #4 do not wait where they are for the one
 * ahead (TS-176): each closes at once, at full power (TS-123), to a staging point on Lead's six, his stack kept as the
 * separation, and holds it until `gateAt`; then he lines up behind the one he joins on as from fighting wing.
 */
const STAGE_BACK_FT = { 3: 2000, 4: 3000 }; // estimates: 1,000 ft apart behind #2's 1,000 ft line-up point (SMM Fig 12.17)
function stage(c, id, gateAt) {
  const alt = Math.min(c.by.get(id).altAboveFt - c.leadAlt, -FW_STEP_DOWN_FT);
  const far = Math.abs(relativeTo(c.start[0], c.by.get(id)).left) > 3000 ? FAR_OVERTAKE_KIAS : REJOIN.overtakeKias;
  return rejoinTo(place(c, -STAGE_BACK_FT[id], 0, alt), { track: 1, advanceTol: 100, overtakeKias: far, closureMinFtps: MAX_CLOSURE_FTPS, holdUntil: gateAt });
}

/**
 * Lead straight ahead in a straight-ahead rejoin from a spread position (TS-176), as a held move like his turn into #2:
 * he flies on while the wingmen are planned, and his plan ends once the last of them is in, so the ones in first keep
 * their places until then instead of flying on alone. Same shape as leadTurnInto's { longRec, planTo }.
 */
function leadStraight(c, key) {
  const pre = toSpeed(c, key);
  const record = (untilSec) => {
    const segments = [...pre.map((x) => ({ ...x })), { kind: 'hold', untilSec }];
    return { segments, rec: recordFlight(c.start[0], { segments }, c.t0) };
  };
  return { longRec: record(c.t0 + STRAIGHT_HORIZON_SEC).rec, planTo: (inStep) => ({ ...record(c.t0 + inStep * STEP_SEC), turned: 0 }) };
}

/** #2 starts the turning rejoin from line abreast (hot): Spread 4 and the offset box. */
const abreast = (from) => from === 'spread4' || from === 'offsetBox';

/**
 * From the offset box the element, 7,000 ft behind on #2's side, flies the rejoin line from the first second (Fable's offset
 * box advice, Patrick 10 Oct 2026: "agree with fable"; SMM 16.34 paras 94-96; AFM8 four-ship brief, "TRJ to FW from Offset
 * Box", about pp.24-25): #2's line on the inside of Lead's turn, Lead fixed on the canopy, so they turn inside his circle and
 * never come ahead of his 3/9 line. Each rides it (the 2-ship's ride) to his own point on it, stacked under #2's line, and
 * then flies the rest of the rejoin as from anywhere else, one at a time: he does not wait on the line itself, where inside
 * the turn holding still would take 160-180 KIAS (V2.223 dry runs), but where the rest of the rejoin waits.
 */
// How far up the line from Lead each rides it: 1,500 ft, and #4 to fighting wing 2,500, so he crosses behind #3 (estimates;
// from 2,500 ft into finger #4 ran up abreast of #2 on the inside, V2.223 dry runs).
const BOX_LINE_FT = 1500;
const BOX_LINE_FW4_FT = 2500;
const BOX_PAUSE_SEC = 7; // Lead flies straight on this long after the call before he turns in (Fable's 5-10 s; estimate)
const BOX_LINE_LOW_FT = { 3: 150, 4: 250 }; // how far below Lead each rides it, #2 riding it 50 ft below (estimates)
// His capture onto the line stays within 5 G (G_RULE_BANK_DEG, a level 5 G turn; TS-181). Far down the line the element closes at full power (Patrick 5 Oct 05:34Z: "3 and 4 immediately go full power and towards
// number 1's turn circle"), setting the line's 210 KIAS this far beyond his point on it: on the 35° line (TS-181) #4, 9,600 ft
// out, could not gain on Lead's turn at 210 (estimates).
const BOX_LINE_FAR_KIAS = 260;
const BOX_LINE_EASE_FT = 1500;
const onBoxLine = (c, id, s, alongFt = BOX_LINE_FT) => phase(place(c, 0, 0, -BOX_LINE_LOW_FT[id]), { kind: 'ride', track: 1, lineDeg: TURNING_REJOIN.lineDeg, side: s, captureAlongFt: alongFt + 500, windowFt: alongFt, carrotWindowFt: alongFt, bankCapDeg: G_RULE_BANK_DEG, floorKias: KIAS_OUTSIDE_LAB, rideKias: BOX_LINE_FAR_KIAS, easeFromFt: alongFt + BOX_LINE_EASE_FT, easeKias: TURNING_REJOIN.rideKias, rejoin: true });

/** A wingman's legs with the offset box's rejoin line in front (onBoxLine). */
const onLineFirst = (c, w, s, alongFt) => ({ ...w, phases: (done) => [onBoxLine(c, w.id, s, alongFt), ...w.phases(done)] });

/**
 * The four's turning-rejoin legs for Lead: his speed change while he turns, and the turn held until `until` are in. pauseSec:
 * straight on this long after the call first (from the offset box, BOX_PAUSE_SEC).
 */
function leadInto(c, s, key, pauseSec = 0) {
  const pause = pauseSec > 0 ? [{ kind: 'hold', untilSec: c.t0 + pauseSec, thenNext: true }] : [];
  const pre = [...pause, ...toSpeed(c, key).map((x) => ({ ...x, withNext: true }))];
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
    const hot = abreast(from);
    const into = leadInto(c, s, 'finger', from === 'offsetBox' ? BOX_PAUSE_SEC : 0);
    const two = { id: 2, fly: twoTurning(c, into, s, 'echelon', s, hot, false, from !== 'fluid4'), phases: () => [...comeOffFirst(c, 2, 1), toSlot(c, rejoinTo, fin[2], { advanceTol: 10 })] };
    const far = (id) => (Math.abs(relativeTo(c.start[0], c.by.get(id)).left) > 3000 ? FAR_OVERTAKE_KIAS : REJOIN.overtakeKias);
    // Outside the turn: wait behind the place, then in through route (recipes.js closeThrough: close level or slightly low, then up).
    const outside = (id, gateId) => ({
      id,
      phases: (done) => {
        const p = inLeadFrame(fin, id);
        const stackAlt = c.by.get(id).altAboveFt - c.leadAlt;
        return [
          ...waitInWindow(c, id, p, stackAlt, inAt(done, gateId), { overtakeKias: far(id), bankCapDeg: TURNING_REJOIN.bankCapDeg }),
          toSlot(c, closeThrough, { ...route[id], alt: route[id].alt - 25 }, { advanceTol: 6 }),
          toSlot(c, slide, fin[id]),
        ];
      },
    });
    // Inside the turn: the cut-off line inside, then across behind Lead.
    const across = { track: 1, bankCapDeg: WING_BANKS.rejoinBankCapDeg, overtakeKias: 10, undertakeKias: 10 }; // no bank cap on a rejoin, only physics (Patrick 6 Oct 04:07Z; 45° until TS-141, an estimate), rolled smoothly by the one pilot model
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
          toSlot(c, slide, fin[id], { bankCapDeg: WING_BANKS.rejoinBankCapDeg, overtakeKias: 10, undertakeKias: 10 }),
        ];
      },
    });
    // From Spread 4 #3 and #4 are outside already, from fighting wing inside; from anywhere else, by the side each is on now.
    const wing = (id, gateId) => {
      // From the offset box up the rejoin line first, then across behind Lead to the outside (onBoxLine).
      if (from === 'offsetBox') return onLineFirst(c, crossing(id, gateId), s);
      const outsideNow = from === 'spread4' || (from !== 'fw' && relativeTo(c.start[0], c.by.get(id)).left * s < 0);
      return (outsideNow ? outside : crossing)(id, gateId);
    };
    // Each ends in Lead's wing plane, and Lead rolls out as gently as in an echelon turn once all are in it (TS-126, TS-127).
    const inPlane = (w) => ({ ...w, plane: true });
    return { lead: { hold: into, until: [2, 3, 4], rollOutRoll: RATE_SETS.close.echelonRoll }, wings: [inPlane(two), inPlane(wing(3, 2)), inPlane(wing(4, 3))] };
  }]);
}

/**
 * Any spread position or fighting wing to echelon as a turning rejoin, straight into echelon with no station change after the
 * join (TS-176; Patrick 10 Oct 2026 20:49Z; SMM 16.20 para 65b(2), Fig 16.25; SMM 12.24 para 59, join to the inside of the
 * turn; SMM 16.34 paras 95-96, one at a time). Lead turns into #2 and holds it until #4 is in; #2 flies the 2-ship's turning
 * rejoin to echelon on the inside. #3 and #4 go to the inside too, behind their own places on the echelon line (from the
 * outside, behind Lead), wait there on their stacks, and close one at a time, #3 once #2 is in, #4 once #3 is: through
 * route on the one ahead, then up the wing-tip line into echelon. from: the formation key now.
 */
export function turningToEchelon(start, t0, opts, s, from) {
  return legsInTurn(start, t0, opts, [(c) => {
    const ech4 = slotsFor('echelon', s, { ships: 4 });
    const into = leadInto(c, s, 'echelon', from === 'offsetBox' ? BOX_PAUSE_SEC : 0);
    const hot = abreast(from);
    const two = { id: 2, fly: twoTurning(c, into, s, 'echelon', s, hot, false, from !== 'fluid4'), phases: () => [...comeOffFirst(c, 2, 1), toSlot(c, rejoinTo, ech4[2], { advanceTol: 10 })] };
    const far = (id) => (Math.abs(relativeTo(c.start[0], c.by.get(id)).left) > 3000 ? FAR_OVERTAKE_KIAS : REJOIN.overtakeKias);
    const line = pairSlot('route', s);
    const wing = (id, gateId) => ({
      id,
      phases: (done) => {
        const p = inLeadFrame(ech4, id);
        const stackAlt = Math.max(Math.min(c.by.get(id).altAboveFt - c.leadAlt, ech4[id].alt), ech4[id].alt - WINDOW_STACK_FT[id]);
        const { ref } = ech4[id];
        return [
          ...(from === 'offsetBox' ? [onBoxLine(c, id, s)] : []), // from the offset box up the rejoin line first
          ...waitInWindow(c, id, p, stackAlt, inAt(done, gateId), { overtakeKias: far(id), bankCapDeg: TURNING_REJOIN.bankCapDeg }, ech4[id].alt - 25),
          closeThrough(place(c, line.fwd, line.left, ech4[id].alt - 25), { track: ref, advanceTol: 6 }),
          toSlot(c, slide, ech4[id]),
        ];
      },
    });
    const inPlane = (w) => ({ ...w, plane: true });
    return { lead: { hold: into, until: [2, 3, 4], rollOutRoll: RATE_SETS.close.echelonRoll }, wings: [inPlane(two), inPlane(wing(3, 2)), inPlane(wing(4, 3))], how: 'turning rejoin straight into echelon' };
  }]);
}

/**
 * A spread position to echelon, fighting wing or finger as a turning rejoin with Lead turning away from #2 (TS-179; TS-176
 * piece 4; SMM 16.20 para 65b(1), Fig 16.24; SMM 12.24 para 59, join to the inside of the turn). Lead turns toward #3 and
 * #4 and holds the turn until the last wingman is in. Nearest first (Patrick 10 Oct 2026 20:48Z): #3 and #4, already
 * inside, join first, one at a time, straight into their places. #2 crosses Lead's six no closer than AWAY_CROSS behind and
 * below into the inside of the turn, and joins last:
 *  - to echelon he lines up on Lead's six at the straight-ahead rejoin's 1,000 ft (TS-56, SMM Fig 12.17 point 1), below
 *    the wake, closes up it and from about 500 ft (point 2) moves out into his place between Lead and #3;
 *  - to fighting wing he goes from the cross into his cone, on the inside (#3 and #4 off him on the other side, as ever);
 *  - to finger he crosses two lengths behind and below Lead to the outside and up into his place, as the offset box
 *    element does (TS-177).
 * s: #2's side now. Returns legsInTurn's result and, when #2 crossed closer than AWAY_CROSS, a flag for the screen.
 */
export function turningAway(start, t0, opts, s, from, to) {
  const sIn = -s;
  const far = (c, id) => (Math.abs(relativeTo(c.start[0], c.by.get(id)).left) > 3000 ? FAR_OVERTAKE_KIAS : REJOIN.overtakeKias);
  // The places: echelon and fighting wing with #2 on the inside; finger with #2 on the outside, #3 and #4 on the inside.
  const slots = to === 'finger' ? slotsFor('finger', s, { ships: 4 }) : slotsFor(to, sIn, { ships: 4 });
  // #3 and #4 into a close place from the inside: wait in the window behind it, then through the place one step out and
  // back along the echelon line from it (SMM 16.15 para 38), and up into it.
  const out = pairSlot('route', sIn);
  const step = pairSlot('echelon', sIn);
  const close = (c, id, gateAt) => ({
    id,
    plane: true,
    phases: (done) => {
      const p = inLeadFrame(slots, id);
      const stackAlt = Math.max(Math.min(c.by.get(id).altAboveFt - c.leadAlt, p.alt), p.alt - WINDOW_STACK_FT[id]);
      return [
        ...waitInWindow(c, id, p, stackAlt, gateAt(done), { overtakeKias: far(c, id), bankCapDeg: TURNING_REJOIN.bankCapDeg }, p.alt - 25),
        closeThrough(place(c, p.fwd + out.fwd - step.fwd, p.left + out.left - step.left, p.alt - 25), { track: 1, advanceTol: 6 }),
        slide(place(c, p.fwd, p.left, p.alt), { track: 1 }),
      ];
    },
  });
  // #3 and #4 into fighting wing: through the far edge of the window behind the place (as rejoinToFw) and into it. #3's
  // place is held off Lead (#2, whom he flies off, is not in yet; once he is, it is the same place); #4 settles where he
  // arrives in his cone off #3 (the whole cone, TS-75), as in rejoinToFw.
  const cone = (c, id, gateAt) => ({
    id,
    phases: (done) => {
      const p = inLeadFrame(slots, id);
      return [
        rejoinTo(place(c, p.fwd - TRJ.outsideWindowFt[id][1], p.left, p.alt), { track: 1, advanceTol: FW_PASS_FT, overtakeKias: far(c, id), bankCapDeg: TURNING_REJOIN.bankCapDeg, holdUntil: gateAt(done) }),
        id === 3 ? rejoinTo(place(c, p.fwd, p.left, p.alt), { track: 1 }) : inCone(c, slots[id], -sIn),
      ];
    },
  });
  // #2 crosses Lead's turn circle behind him into fighting wing on the inside (the 2-ship's Away, TS-174), then on from
  // there, held until #4 is in (he joins last).
  const A = STRAIGHT_AHEAD;
  const two = (c, into) => ({
    id: 2,
    plane: to !== 'fw',
    fly: twoTurning(c, into, sIn, 'fw', sIn, abreast(from), true),
    then: (done) => {
      const p = inLeadFrame(slots, 2);
      const gate = inAt(done, 4);
      if (to === 'echelon') {
        return [
          // on Lead's six at the straight-ahead rejoin's 1,000 ft, below the wake
          rejoinTo(place(c, A.sixFt, 0, -AWAY_CROSS.belowFt), { track: 1, advanceTol: 60, holdUntil: gate }),
          // up the six (the straight-ahead rejoin's closing leg), then from about 500 ft out into the gap
          rejoinTo(place(c, A.closeTowardFt, 0, -AWAY_CROSS.belowFt), { track: 1, overtakeKias: 30, advanceTol: A.vectorAtFt + A.closeTowardFt }),
          // out into the gap behind his place (as far back as route is behind echelon), then up into it
          closeThrough(place(c, p.fwd + out.fwd - step.fwd, p.left, p.alt - 25), { track: 1, advanceTol: 6 }),
          slide(place(c, p.fwd, p.left, p.alt), { track: 1 }),
        ];
      }
      // fighting wing: onto his place in the cone (his +300 ft off, as rejoinToFw), so #3 and #4 are on theirs off him
      if (to === 'fw') return [rejoinTo(place(c, p.fwd, p.left, Math.min(p.alt, -FW_STEP_DOWN_FT)), { track: 1, holdUntil: gate })];
      // finger: into the inside behind #3, then across two lengths behind and below Lead to the outside, and up (TS-177)
      const back = -TRJ.passBehindLengths * LENGTH_FT;
      const across = { track: 1, bankCapDeg: WING_BANKS.rejoinBankCapDeg, overtakeKias: 10, undertakeKias: 10 };
      return [
        rejoinTo(place(c, -TRJ.waitBehindFt[3], sIn * ech().left, -TRJ.waitLowFt[3]), { track: 1, advanceTol: 10, overtakeKias: REJOIN.overtakeKias, holdUntil: gate }),
        slide(place(c, back, 0, -CROSS_LOW_FT), across),
        slide(place(c, back, p.left, -CROSS_LOW_FT), across),
        toSlot(c, slide, slots[2], { bankCapDeg: WING_BANKS.rejoinBankCapDeg, overtakeKias: 10, undertakeKias: 10 }),
      ];
    },
  });
  const r = legsInTurn(start, t0, opts, [
    (c) => {
      const into = leadInto(c, sIn, to);
      const join = to === 'fw' ? cone : close;
      return {
        lead: { hold: into, until: [2, 3, 4], ...(to === 'fw' ? {} : { rollOutRoll: RATE_SETS.close.echelonRoll }) },
        wings: [join(c, 3, () => c.t0), join(c, 4, (done) => inAt(done, 3)), two(c, into)],
      };
    },
  ]);
  if (!r.ok) return r;
  // Where #2 crossed Lead's six (his side changed behind Lead): the closest, against AWAY_CROSS.
  const leg = r.legs[0];
  const L = recordFlight(start[0], leg.plans[1], leg.t0);
  const W = recordFlight(start[1], leg.plans[2], leg.t0);
  // The first time he comes to the inside (to finger he crosses back to the outside close in, by design, TS-177).
  let cross = null;
  for (let i = 1; !cross && i * STEP_SEC <= leg.endSec - leg.t0; i++) {
    const q = relativeTo(L.at(i), W.at(i));
    if (Math.sign(q.left) === sIn && q.fwd < 0) cross = { behindFt: -q.fwd, belowFt: L.at(i).altAboveFt - W.at(i).altAboveFt };
  }
  const tooClose = cross && (Math.round(cross.behindFt) < AWAY_CROSS.behindFt || Math.round(cross.belowFt) < AWAY_CROSS.belowFt);
  return { ...r, cross, flag: tooClose ? `#2 crossed Lead's six ${Math.round(cross.behindFt)} ft behind and ${Math.round(cross.belowFt)} ft below, closer than the ${AWAY_CROSS.behindFt} ft and ${AWAY_CROSS.belowFt} ft reference (TS-179).` : null };
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
    const low = (slot) => ({ ...slot, alt: slot.alt - 25 }); // close level or slightly low, then up into place (recipes.js closeThrough)
    const legsFor = (id) => [toSlot(c, closeThrough, low(route[id]), { advanceTol: 6 }), toSlot(c, slide, fin[id])];
    const off2 = comeOffFirst(c, 2, 1);
    const gateOn = (id, prev) => (done) => [hold(c, id, id === 4 ? 3 : 1, { holdUntil: done[prev].times[prev === 2 ? off2.length : 0].arrive }), ...legsFor(id)];
    // Lead flies straight on until the last is in, so #2 keeps his place meanwhile (V2.220; until then he flew on alone and
    // could end tight in finger).
    return {
      lead: { hold: leadStraight(c, to), until: [2, 3, 4] },
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
export function straightToEchelon(start, t0, opts, sTo, from = 'fw') {
  return legsInTurn(start, t0, opts, [(c) => {
    const ech4 = slotsFor('echelon', sTo, { ships: 4 });
    // Each joins the spinner-to-wingtip line of the one it flies off at route (on the line since V2.107, TS-103) and flows up
    // it into echelon, never stopping short (Patrick 6 Oct 02:01Z, 02:11Z). Until V2.106 they stopped in route, then nearly
    // abreast, and slid in.
    const line = pairSlot('route', sTo);
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
    // From fighting wing each waits off the one ahead; from a spread position he closes to his staging point (TS-176).
    const wait = (id, ahead, gateAt) => (from === 'fw' ? hold(c, id, ahead, { holdUntil: gateAt }) : stage(c, id, gateAt));
    return {
      lead: from === 'fw' ? toSpeed(c, 'echelon') : { hold: leadStraight(c, 'echelon'), until: [2, 3, 4] },
      wings: [
        { id: 2, phases: () => [...off2, ...legsFor(2)] },
        { id: 3, phases: (done) => [wait(3, 2, done[2].times[off2.length + vectorIndex].arrive), ...legsFor(3, done[2].times[off2.length + stableIndex].arrive)] },
        { id: 4, phases: (done) => [wait(4, 3, done[3].times[1 + vectorIndex].arrive), ...legsFor(4, done[3].times[1 + stableIndex].arrive)] },
      ],
    };
  }]);
}

/**
 * Any spread position to finger as a straight-ahead rejoin, straight into finger (TS-176; SMM 12.26 paras 62-63, Fig 12.17;
 * SMM 16.34 paras 95-96, one at a time): Lead holds straight; each lines up on the six of the aircraft he flies off in
 * finger about 1,000 ft back, closes, takes the small vector to his side at about 500 ft, comes through route and slides
 * into finger. #2 on Lead, then #3 on Lead to the other side once #2 is stable, then #4 on #3 once #3 is; meanwhile each
 * closes to his staging point on Lead's six (stage) and waits there until the one ahead has reached his vector point.
 */
export function straightToFinger(start, t0, opts, s) {
  return legsInTurn(start, t0, opts, [(c) => {
    const fin = slotsFor('finger', s, { ships: 4 });
    const flowFtps = STRAIGHT_REJOIN.lineArriveKt * KT_FTPS;
    const legsFor = (id, holdLineUpUntil) => {
      const { ref } = fin[id];
      const side = Math.sign(fin[id].left);
      const line = pairSlot('route', side);
      const refAlt = ref === 1 ? 0 : fin[ref].alt;
      const at = (fwd, left, alt) => place(c, fwd, left, refAlt + alt);
      const [lineUp, close, toLine] = straightAhead(at, place(c, line.fwd, line.left, fin[id].alt), { track: ref, holdLineUpUntil, advanceTol: STRAIGHT_REJOIN.lineFlowFt });
      return [lineUp, close, { ...toLine, closureCapFtps: flowFtps }, toSlot(c, slide, fin[id], { closureCapFtps: flowFtps })];
    };
    const off2 = comeOffFirst(c, 2, 1);
    const vectorIndex = 1;
    const stableIndex = 3;
    return {
      lead: { hold: leadStraight(c, 'finger'), until: [2, 3, 4] },
      wings: [
        { id: 2, phases: () => [...off2, ...legsFor(2)] },
        { id: 3, phases: (done) => [stage(c, 3, done[2].times[off2.length + vectorIndex].arrive), ...legsFor(3, done[2].times[off2.length + stableIndex].arrive)] },
        { id: 4, phases: (done) => [stage(c, 4, done[3].times[1 + vectorIndex].arrive), ...legsFor(4, done[3].times[1 + stableIndex].arrive)] },
      ],
    };
  }]);
}
