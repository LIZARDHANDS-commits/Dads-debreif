// #2 in fluid manoeuvring, the live wingman (spec section 9, "#2, the live wingman"; TS-194; Patrick 11 Oct 2026 20:57Z:
// "ensure that we are using the concepts in the SMM of lead/lag/pure and fighting wing and how fluid manoeuvring is
// actually supposed to be flown"). #2 is a real aircraft: the shared point mass (core stepPointMass) with the T-6A's
// thrust and drag, flown by Lead's own step (fluid-lead.js stepLead: the G built at the T-6A's onset, the roll at its
// rate and onset for the speed, the stick shaker the one physical limit). He is not on a line and he chases no computed
// point. Each step a pilot law reads the picture and asks for a lift, a roll and a power, as a pilot does (v7, the
// pilot's law; Patrick 12 Oct 2026 02:42-02:46Z, card "Fable builds"):
//
//  - Pure pursuit of Lead himself (SMM 12.30 paras 72-74: nose on him is pure, in front of him lead, behind him lag):
//    core liftTowardAim at the aim, at the L1 gain 2V over the distance to it, which flies a pursuit curve onto Lead's
//    circle (SMM Fig 12.22). The aim is Lead, offset a little to #2's side (15° off the tail in Lead's path frame,
//    Patrick 4 Oct 22:28Z "hold 15" and 12 Oct 02:45Z "a slight horizontal offset, that part is good"), so he is never
//    dead astern. His side is his own: set from the planned wingman's at the start, and once Lead is level again he keeps
//    whichever side of Lead's tail he has come out on, never flying back across (Patrick 12 Oct 2026 03:40Z: "2 does
//    not have to reset to 'the same offset' each time, and can end on a different offset side").
//  - Lead and lag move the aim off Lead toward the inside of his turn (nose in front of him, the short way round, closing)
//    or the outside (nose behind him, the long way round, opening; SMM 16.17 para 44, EFIG p.391), square to the line of
//    sight in Lead's plane of motion, so the nose angle is the lever a pilot uses, by the cues a pilot reads: Lead's manoeuvre
//    sets the default (his cue word, fluid-lead.js: lag into #2 then pure, pure away; over the top the live wingman reads
//    Lead's angle round the loop, or how far through the wingover or roll he is, against his own breaks: lag up the
//    front, pure before the top, lead from over the top down the back, so the fuselages come near parallel through the
//    horizon, Patrick 12 Oct 2026 03:40Z), and the range against the one wanted and the closure move it from there, so
//    stretched into a pull he delays the lag or goes pure (Patrick 02:44Z), tight he lags more, and down the back of a
//    manoeuvre, Lead pulling away faster, the closure gives him the lead (Patrick 03:40Z: more lead when Lead is faster;
//    a separate speed term was tried and stretched the wingover, so the closure cue carries it).
//  - The amount scales with how hard Lead is turning (his turning acceleration, full at about 2 G of it), so straight and
//    level nothing moves and he is pure.
//  - Smooth hands and limits as before: the G built at the T-6A's onset and the roll at its rate (stepLead), so a press
//    of Lead's never moves #2 in one step; no push below 0.5 G on the lift he has; the stall line and the shaker; 5 G the
//    normal ceiling (SMM 16.17 para 44a, G_RULE), opened to the aircraft's own limit only inside the bubble. All flagged
//    by the card, none a wall except the aircraft's own. The 500 ft bubble is flagged on screen, never a wall (Patrick 12
//    Oct 01:53Z: "maintain 500 in the turn and roll out slightly over 500 ... don't be closer than 500").
//  - Power: MAX like Lead for all of fluid manoeuvring (Patrick 11 Oct 2026 22:32Z, "Both should be at max power for all
//    of fluid maneuvering"; SMM 16.17 paras 42-43: both on the same power): the spacing is flown by geometry alone, the
//    entry included (Patrick 22:33Z and 22:55Z). While Lead holds a speed (Terminate) power flies his range, from Lead's
//    new speed.
//
// Units: feet, seconds, x east, y north, z up; Lead's positions are heights above the block (fluid.js), #2's point mass
// is absolute (as Lead's st.pm). Every number with no manual or ruling beside it is an estimate and says so.
import { liftTowardAim } from '../../../core/point-mass.js';
import { shakerG, availableG } from '../../../core/t6-performance.js';
import { DEG } from '../../../core/angles.js';
import { FTPS_TO_KT, G_FTPS2 } from '../../../core/units.js';
import { STEP_SEC } from './flight.js';
import { G_RULE, WING, HOLD } from './tuning.js';
import { FW_BAND } from './slots.js';
import { leadStateOf, stepLead, leadThrottle } from './fluid-lead.js';
import { powerFrom } from './power.js';
import { add3, sub3, scale3, len3, cross3, unit3, perp3, dot3, poseOf3d } from './attitude.js';

const dt = STEP_SEC;
const Z = Object.freeze({ x: 0, y: 0, z: 1 });

/** The live wingman's numbers. Estimates unless a source is given. */
export const LIVE = Object.freeze({
  sideDeg: WING.latDeg, // the side offset: 15° off Lead's tail (Patrick 4 Oct 22:28Z, "hold 15"; 12 Oct 02:45Z "that part is good")
  turnInFt: 50, // in a manoeuvre he holds about 50 ft inside the set distance (600 by default, so about 550: Patrick 12 Oct 2026 01:53Z, "maintain 500 in the turn and roll out slightly over 500"; 50 an estimate)
  capShare: 0.5, // lead or lag moves the aim off Lead, toward the inside of his turn or the outside, by up to half the range (about 27° of nose; estimate)
  biasLag: -0.3, // Lead's cue word sets the default: lag puts the aim 30% of the cap outside his turn ... (estimate)
  biasLead: 0.3, // ... and lead 30% inside (estimate); pure is on him
  loopWords: Object.freeze({ pureDeg: 110, leadDeg: 160, pullOutDeg: 330 }), // the loop, by Lead's angle round it: lag, pure from 110° (near the vertical), lead from 160° (over the top: Patrick 12 Oct 2026 03:40Z "around this position we should be transitioning to lead pursuit"), pure from the pull-out (330°, fluid-lead.js). Estimates; the planned wingman keeps his own breaks (155°, 205°)
  overWords: Object.freeze({ pure: 0.3, lead: 0.45, pullOut: 0.9 }), // a wingover or a barrel roll, by how far through it Lead is: the same shape (planned: 0.4, 0.6, 0.9); estimates
  sideSwapDeg: 5, // with Lead level again, #2 takes the side of Lead's tail he is on once more than 5° past it (estimate), and keeps it
  sideFreeTurn: 0.25, // ... only with Lead's turn eased off (below a quarter of the full slide), upright and his nose near the horizon (estimates)
  biasPerSec: 0.15, // a change of cue word slides the default over about 2 s, lead to pure (4 s lag to lead), never in a step (estimate)
  kR: 1, // the range error, as a share of the range wanted, moves the aim ahead (stretched) or behind (tight) one for one (estimate)
  kC: 1, // the closure over lookSec, as a share of the range wanted, moves it behind (closing) or ahead (opening) one for one (estimate)
  lookSec: HOLD.lookSec, // he sets his lag or lead for the gap he will have in about 2 s at the closure he has (estimate, TS-74)
  severityG: 2, // the slide is full with Lead turning at 2 G of acceleration (a 3.5 G loop, a 70° turn), none straight (estimate) ...
  severitySec: 2, // ... and follows his turn over about 2 s, none to full, so a quick roll-in of Lead's moves #2's picture smoothly, never in a step (estimate; smooth hands)
  turnSenseSec: 0.5, // #2's sense of Lead's turn (its direction and size) follows Lead's turning acceleration with about half a second of lag (estimate) ...
  turnHeldG: 0.1, // ... and below 0.1 G of it the last turn's direction and plane are held, so a straight Lead never leaves him a direction from noise (estimate)
  circleSec: 4, // in a turn the side offset in Lead's plane eases away over about 4 s, so #2 settles onto Lead's circle (estimate; Patrick 12 Oct 2026 01:39Z: "maintain 500 feet in the turn then accept getting a bit further away as we seep out to our 'offset' position"); turning into him it is circleInsideSec
  swapLookSec: 0.25, // his drift across Lead's tail is read over about a quarter second (estimate; the planned cue read it over 0.25 s too)
  circleBackSec: 12, // in Terminate the offset comes back as Lead rolls out over about 12 s, the slot slide's own pace (estimate), so the roll-out never jumps the aim across
  circleInsideSec: 8, // ... but with the offset on the inside of Lead's turn (Lead turning into him) over about 8 s, so Lead's turn brings the circle to him and he rolls in later and shallower instead of rolling away first (estimate; Patrick 12 Oct 2026 03:10Z: he turns away only when the turn would bring him inside 500 ft)
  bubbleShare: -1, // inside the 500 ft bubble the aim goes to full lag (spec section 9; SMM 16.17 para 44c)
  l1Sec: 2.5, // the pursuit gain is 2V over the distance to the aim, or over about 2.5 s of flight if the aim is nearer (estimate): standard L1 guidance, soft enough that a roll-in of Lead's is followed, not snatched at
  overLeadG: 1.5, // he pulls no more than about 1.5 G over what Lead is pulling (estimate: a pilot matches Lead's pull and adds what the picture needs), the bubble excepted
  relevelPerSec: 0.5, // the side frame along Lead's path eases back to level at about 0.5 per second with Lead upright and his nose near the horizon, none inverted or near the vertical (estimate), so his side holds through a loop
  minG: 0.5, // never below 0.5 G on the lift he has (as Lead's push, 2 CFFTS Orders B2 ch 8 para 1a; 0.5 an estimate)
  normalG: G_RULE.normalG, // SMM 16.17 para 44a; Gen Book p.11 (flagged, the normal ceiling)
  acrossDps: 3, // how fast his place moves across the tail (the entry): 3°/s, 30° in about 10 s (estimate)
  openDeg: 25, // tight with Lead straight his place opens across toward the edge of the fluid cone, 30° off the tail (SMM 16.17 para 42) less the shared 5° margin, so he is judged in position all the way; measured on V2.380 from 500 ft at 55° off the tail: opening to 45° (the middle of the fighting wing cone) keeps him 485 ft at the closest but parks him at 32°, out of the fluid cone; 25° goes through 429 ft (flagged TIGHT) and settles 519 ft at 24°, in position, with the fewest bank reversals (estimate) ...
  openUpFt: 100, // ... and up to about 100 ft above Lead (estimate: "use the cone as required", Patrick 5 Oct 2026 23:02Z), a longer path with power at MAX
  slotSideDeg: 2, // near Lead's tail Terminate takes the side he is heading for once more than 2° past it (estimate) ...
  slotAcrossDps: 1.5, // in Terminate his place flows across to the fighting wing slot at 1.5°/s (estimate), a gentle slide out while Lead flies straight
  rangeFtps: 60, // how fast his place moves in or out (a new distance, the entry, Terminate): estimate
  altFtps: 20, // how fast his place moves up or down (Terminate's slot height): estimate
  placeKtPerFt: 0.08, // with Lead holding a speed, power flies his place: 1 kt faster per 12.5 ft behind it (estimate) ...
  closeKtPerKt: 0.6, // ... less 0.6 kt per knot he is already closing on it (estimate) ...
  overtakeKias: HOLD.overtakeKias, // ... within 15 KIAS of Lead (EFIG p.374's 10-20 KIAS)
  wordShare: Object.freeze({ on: 0.35, off: 0.15 }), // LAG or LEAD shows past 35% of the cap and goes under 15%, so the word doesn't flicker (estimate)
  settleKt: 2, // Terminate ends with him in the fighting wing band and within 2 kt of Lead (spec section 9)
});

/**
 * The left of Lead's path frame, where the side offset lies: level (square to his nose and the vertical) with Lead upright
 * and his nose near the horizon, and carried on without twist (last step's left squared to the new nose) through a loop,
 * a wingover or a roll, so #2's side of Lead's path holds over the top instead of flipping with the level sense of left.
 */
function sideLeft(prevLeft, e) {
  const nose = unit3(e.vel);
  const lvl = cross3(Z, nose);
  const m = len3(lvl);
  if (!prevLeft) return m > 1e-6 ? scale3(lvl, 1 / m) : { x: 0, y: 1, z: 0 };
  const carried = unit3(perp3(prevLeft, nose));
  if (m < 1e-6) return carried;
  const upright = Math.max(0, e.st?.bodyUp?.z ?? 1);
  const k = Math.min(1, LIVE.relevelPerSec * dt * upright * (1 - nose.z * nose.z) ** 2);
  return unit3(perp3(add3(carried, scale3(sub3(scale3(lvl, 1 / m), carried), k)), nose));
}

/** A value moved toward a target at no more than rate per second. */
const toward = (x, to, rate) => x + Math.max(-rate * dt, Math.min(rate * dt, to - x));

/**
 * #2's live state at the press, from the live aircraft (flight.js). side: +1 left of Lead's tail, -1 right. slot: his
 * fighting wing slot in Lead's level frame ({ fwd, left, alt }), where Terminate takes him back to.
 */
export function startLiveWing(wing, blockFt, { side, slot }) {
  const st = leadStateOf(wing, blockFt);
  // Terminate's slot is where fighting wing left him, brought inside the band by its fly margins (slots.js FW_BAND: 50 ft and
  // 5°), so he settles in fighting wing, never on its edge.
  const inside = (x, [lo, hi], m) => Math.max(lo + m, Math.min(hi - m, x));
  const slotRange = inside(Math.hypot(slot.fwd, slot.left, slot.alt), FW_BAND.rangeFt, FW_BAND.flyMarginFt[0]);
  const slotAcross = inside(Math.atan2(Math.abs(slot.left), -slot.fwd) / DEG, FW_BAND.sweepDeg, FW_BAND.flyMarginDeg);
  return {
    st,
    slot: { rangeFt: slotRange, acrossDeg: slotAcross, alt: slot.alt },
    // His place now (eased toward what the phase asks): range, angle off the tail (signed, left positive) and height.
    place: { rangeFt: slotRange, acrossDeg: side * slotAcross, alt: slot.alt },
    side, // his side of Lead's tail (+1 left), his own from here on
    latDeg: undefined, // his angle off Lead's tail last step (the swap rule reads its drift)
    latDot: 0, // ... and that drift, eased over swapLookSec (°/s, toward his own side positive)
    swapUntil: -Infinity, // no new swap before this time
    left: null, // the side frame along Lead's path, set on the first step
    bias: 0, // the default slide from Lead's cue word, eased
    turnAcc: null, // Lead's turning acceleration as #2 senses it (ft/s², eased)
    turnDir: null, // ... its direction and plane (held while Lead flies straight)
    plane: null,
    severity: 0, // how hard Lead is turning, eased
    circle: 0, // how far the side offset in Lead's plane has eased away, 0 to 1
    word: 'pure',
  };
}

/**
 * The cue word the live wingman flies to: Lead's own (fluid-lead.js) in a level turn, a reversal, a climb or a descent;
 * over the top his own breaks on Lead's angle round the loop (cue.loop.alpha) or how far through a wingover or barrel
 * roll Lead is (cue.over), so pure comes before the top and lead from over it (Patrick 12 Oct 2026 03:40Z).
 */
function liveWord(cue) {
  if (cue?.loop) {
    const deg = cue.loop.alpha / DEG;
    const w = LIVE.loopWords;
    return deg < w.pureDeg ? 'lag' : deg < w.leadDeg ? 'pure' : deg < w.pullOutDeg ? 'lead' : 'pure';
  }
  if (cue?.over !== undefined) {
    const w = LIVE.overWords;
    return cue.over < w.pure ? 'lag' : cue.over < w.lead ? 'pure' : cue.over < w.pullOut ? 'lead' : 'pure';
  }
  return cue?.mode;
}

/**
 * One step of #2. ctx: { e (Lead's entry this step: pos, vel, accPerp, st, cue, holdKias), t, rangeFt (the setting),
 * blockFt, side (+1 left of Lead's tail, -1 right: the planned wingman's, used only until he has a side of his own) }.
 * Returns { ws (the next state), pose (kinematic.js applyPose), power, cue ('lag' | 'pure' | 'lead' | 'entry' | 'back to
 * fighting wing'), rangeFt, settled, side (his side of Lead's tail now) }.
 */
export function stepLiveWing(ws, ctx) {
  const { e, t, blockFt } = ctx;
  const st = ws.st;
  const L = e.pos;
  const nose = unit3(e.vel);
  const left = sideLeft(ws.left, e);
  const pw = { x: st.pm.x, y: st.pm.y, z: st.pm.z - blockFt };
  const r = sub3(pw, L);
  const rangeFt = len3(r);

  // ---- the cues a pilot reads: range, closure, aspect, and how hard Lead is turning ----
  const closureFtps = -dot3(r, sub3(st.vel, e.vel)) / Math.max(rangeFt, 1);
  const latDeg = Math.atan2(dot3(r, left), -dot3(r, nose)) / DEG; // his angle off Lead's tail, left positive
  // Lead's turn as #2 senses it: eased, with its direction and plane held while Lead flies straight. Severity builds over
  // severitySec at most and dies away as the sensed turn does, so a quick roll-out of Lead's takes the lead and lag away
  // smoothly and never leaves them pointing anywhere.
  const turnAcc = ws.turnAcc ? add3(ws.turnAcc, scale3(sub3(e.accPerp, ws.turnAcc), Math.min(1, dt / LIVE.turnSenseSec))) : e.accPerp;
  let turnDir = ws.turnDir;
  let plane = ws.plane;
  if (len3(turnAcc) > LIVE.turnHeldG * G_FTPS2) {
    turnDir = unit3(turnAcc);
    plane = unit3(cross3(nose, turnAcc));
  }
  const turning = Math.min(1, len3(turnAcc) / (LIVE.severityG * G_FTPS2));
  const toSlotNow = e.cue?.blend === 0;
  const severity = Math.min(turning, toward(ws.severity ?? 0, turning, 1 / LIVE.severitySec));
  // In Terminate the offset comes back as Lead rolls out at the slot's own pace (circleBackSec), not the 4 s of a manoeuvre,
  // so the aim moves across no faster than the place does. Measured on V2.379: the roll-out wag (bank +28 to -20 to +25
  // in 3 s on V2.378) is gone after the barrel roll but still there in most runs, so it stays on the list (future.md).
  const circle = toward(ws.circle ?? 0, turning, 1 / (toSlotNow && turning < (ws.circle ?? 0) ? LIVE.circleBackSec : LIVE.circleSec));
  const circleIn = toward(ws.circleIn ?? 0, turning, 1 / LIVE.circleInsideSec);
  const inBubble = rangeFt < FW_BAND.bubbleFt;
  const holding = Boolean(e.holdKias);

  // ---- his place: the cone (entry and fluid) or his fighting wing slot (Terminate), eased ----
  const toSlot = e.cue?.blend === 0;
  const entering = e.cue?.blend === 1;
  // His side, his own call (TS-199, Patrick 12 Oct 2026 05:54Z: "Would he figure out the swap cue himself?"). The swap's
  // job is to keep him on the outside of what Lead is doing: when Lead rolls or turns through his side (the second
  // wingover, a barrel roll his way) staying put would leave him inside Lead's circle, with only the bubble or a push to
  // come. The one rule (TS-60, Patrick 5 Oct 2026 19:21Z and 22:28Z), read off his own aircraft: he watches his angle off
  // Lead's tail and how fast it is drifting toward the tail. Staying put he must first stop the drift, at the angular
  // acceleration a wingman makes across the cone (WING.swapAccelDps2); if that stop is past Lead's tail line on the other
  // side by WING.swapMarginDeg, the drift is carrying him across his six anyway, so he lets it, behind Lead, and takes the
  // other side; otherwise he holds his side. Not during the entry or Terminate, nor within WING.swapGuardSec of a swap.
  // With Lead level again and his turn eased off, #2 keeps whichever side of Lead's tail he has come out on, more than
  // sideSwapDeg past it, never flying back across (Patrick 12 Oct 2026 03:40Z). Terminate flows out to the side of Lead's
  // tail he is on at the press, more than sideSwapDeg past it; nearer the tail, the side he is heading for (where he will
  // be in lookSec at the drift he has) more than slotSideDeg past it, else the side he had. He holds it, so he never comes
  // back across Lead's tail on the way to fighting wing.
  let side = ws.side ?? (ws.place.acrossDeg < 0 ? -1 : 1);
  const latRaw = ws.latDeg === undefined ? 0 : (latDeg - ws.latDeg) / dt;
  const latDot = ws.latDot + (latRaw - ws.latDot) * Math.min(1, dt / LIVE.swapLookSec);
  let swapUntil = ws.swapUntil;
  const aDot = side * latDot; // toward his own side positive
  // Only over the top (Lead past 90° of bank, or his nose more than about 17° up or down: estimates), where a swap belongs
  // (Patrick 5 Oct 2026 19:21Z: "to fix lead/lag spacing over the top"): in a level turn away his angle off the tail slides
  // toward Lead's six as he settles onto the circle, and that slide is not a crossing (measured V2.382: the rule without
  // this gate swapped him in the level turn and the reversal). With the gate the wingovers and the sequence swap where
  // the planned cue did; in the barrel roll his way the crossing is only seen at the pull-out, so his aim flips late and
  // he comes out stretched longer (1,113 ft, 21 s; the planned cue flipped at the inverted top by an accident of its
  // frame). Two earlier flips (take the side crossed to; inverted with Lead rolling toward him) stretched the wingovers
  // instead, so this stays and the barrel roll's exit is on the list (future.md) with its cause, the little lead and lag
  // authority at Lead's 1.2 G on the way out.
  const overTop = (e.st?.bodyUp?.z ?? 1) < 0 || Math.abs(nose.z) > 0.3;
  if (overTop && !toSlot && !entering && t >= swapUntil && aDot < 0) {
    const stopAt = side * latDeg - (aDot * aDot) / (2 * WING.swapAccelDps2);
    if (stopAt < -WING.swapMarginDeg) {
      side = -side;
      swapUntil = t + WING.swapGuardSec;
    }
  }
  const leadLevel = (e.st?.bodyUp?.z ?? 1) > 0.9 && Math.abs(nose.z) < 0.3 && turning < LIVE.sideFreeTurn;
  if (leadLevel && !toSlot && Math.abs(latDeg) > LIVE.sideSwapDeg && Math.sign(latDeg) !== side) side = Math.sign(latDeg);
  let slotSide;
  if (toSlot) {
    const driftFt = dot3(r, left) + dot3(sub3(st.vel, e.vel), left) * LIVE.lookSec;
    slotSide = ws.slotSide ?? (Math.abs(latDeg) > LIVE.sideSwapDeg ? Math.sign(latDeg)
      : Math.abs(driftFt) > rangeFt * Math.sin(LIVE.slotSideDeg * DEG) ? Math.sign(driftFt) : side);
  }
  if (toSlot) side = slotSide;
  // Tight with Lead straight (the entry from a close fighting wing, or Lead level between manoeuvres) there is no turn to
  // lag on and power is MAX for both, so he opens out by geometry: his place moves across toward the cone's middle and a
  // little above Lead, a longer path, and comes back to the route offset as the range comes back (Patrick 5 Oct 2026 23:02Z,
  // "Use the cone as required, power as a last resort"; his 12 Oct 04:14Z debrief: "when we enter into FM the range should
  // be 500, it starts at like 3-something").
  const wantRange = toSlot ? ws.slot.rangeFt : Math.max(FW_BAND.bubbleFt, ctx.rangeFt - LIVE.turnInFt);
  const tightStraight = toSlot ? 0 : (1 - turning) * Math.max(0, Math.min(1, (wantRange - (rangeFt - closureFtps * LIVE.lookSec)) / Math.max(wantRange - FW_BAND.bubbleFt, 1)));
  const want = toSlot
    ? { rangeFt: wantRange, acrossDeg: side * ws.slot.acrossDeg, alt: ws.slot.alt }
    : { rangeFt: wantRange, acrossDeg: side * (LIVE.sideDeg + (LIVE.openDeg - LIVE.sideDeg) * tightStraight), alt: LIVE.openUpFt * tightStraight };
  // Terminate: Lead flies straight and level, so his place flows across to the fighting wing slot from the press (Patrick
  // 12 Oct 2026 04:01Z).
  const place = {
    rangeFt: toward(ws.place.rangeFt, want.rangeFt, LIVE.rangeFtps),
    acrossDeg: toward(ws.place.acrossDeg, want.acrossDeg, toSlot ? LIVE.slotAcrossDps : LIVE.acrossDps),
    alt: toward(ws.place.alt, want.alt, LIVE.altFtps),
  };

  // ---- lead, pure or lag: how far in front of Lead (lead) or behind him (lag) his nose sits ----
  // The default from Lead's manoeuvre (his cue word), eased; then the range against the one wanted (stretched: in front,
  // tight: behind) and the closure over the look ahead (closing: behind, opening: in front); full lag inside the bubble;
  // all scaled by how hard Lead is turning, so straight and level he is pure. Capped at half the range.
  // A turn into him (Lead's lag cue in a level turn or a reversal) lags him only as far as he is heading inside the range
  // he wants, full as he heads for the bubble (Patrick 12 Oct 2026 03:10Z: turning away to capture the circle is right
  // when Lead's turn would bring him inside 500 ft, not otherwise). A level turn away from him is pure to Lead's tail at
  // once (SMM Fig 12.22), any lead from the range alone. Over the top the cue words hold as they are.
  const predictedFt = rangeFt - closureFtps * LIVE.lookSec;
  const levelTurning = e.ctl?.key === 'levelTurn' || e.ctl?.key === 'reversal';
  const tight = Math.max(0, Math.min(1, (place.rangeFt - predictedFt) / Math.max(place.rangeFt - FW_BAND.bubbleFt, 1)));
  const lagDefault = levelTurning ? LIVE.biasLag * tight : LIVE.biasLag;
  const biasWanted = { lag: lagDefault, pure: 0, lead: levelTurning ? 0 : LIVE.biasLead }[liveWord(e.cue)] ?? 0;
  const bias = toward(ws.bias, biasWanted, LIVE.biasPerSec);
  const wantFt = Math.max(place.rangeFt, 1);
  let shareWanted = bias + (LIVE.kR * (rangeFt - wantFt)) / wantFt - (LIVE.kC * closureFtps * LIVE.lookSec) / wantFt;
  if (inBubble) shareWanted = Math.min(shareWanted, LIVE.bubbleShare);
  // While Lead holds a speed (Terminate) power flies his place, so geometry comes in only as lag (a lead there was tried
  // and wagged him at Lead's roll-out).
  if (holding) shareWanted = Math.min(0, shareWanted);
  const share = Math.max(-1, Math.min(1, shareWanted)) * severity;
  // Lead (nose in front of him, SMM 12.30 para 72) moves the point toward the inside of Lead's turn, square to #2's line of
  // sight, so he flies a smaller circle and closes; lag moves it outside, a bigger circle, opening (SMM 16.17 para 44).
  const los = unit3(scale3(r, -1));
  const inward = turnDir ? perp3(turnDir, los) : { x: 0, y: 0, z: 0 };
  const ahead = len3(inward) > 1e-6 ? unit3(inward) : { x: 0, y: 0, z: 0 };
  const offFt = share * LIVE.capShare * rangeFt;

  // ---- the aim: Lead, moved in front of or behind him, offset to #2's side (and up to Terminate's slot height) ----
  // The side offset is fixed, set at the entry (Patrick 12 Oct 2026 01:39Z, "the small offset"; 02:45Z "that part is
  // good"), in Lead's path frame, so it holds through a loop, a wingover or a roll.
  // In a turn the part of the offset in Lead's plane eases away (circle, circleIn), so #2 settles onto Lead's circle
  // (Patrick's card 11 Oct 2026 23:06Z, "On the circle"): with the offset on the inside (Lead turning into him) slower,
  // so Lead's turn brings the circle to him. Measured on V2.380 in a steady 60° turn away at MAX: holding the offset
  // outside instead is a bigger circle he cannot fly at Lead's speed, so he fell back to 810 ft and still sat 5° off the
  // tail, no nearer the route position (Patrick 12 Oct 2026 04:14Z, "flying directly at lead instead of the route
  // position"); turning that offset into height in the cone (120 ft above Lead on his circle, 13° off the tail, 705-730 ft)
  // is the proposal on the list, waiting for Patrick. Out of the plane (beside a loop) the offset holds.
  let sideVec = scale3(left, place.rangeFt * Math.sin(place.acrossDeg * DEG));
  let insideTurn = false;
  if (plane) {
    const nTurn = unit3(perp3(plane, nose));
    const out = scale3(nTurn, dot3(sideVec, nTurn));
    const inPlane = sub3(sideVec, out);
    insideTurn = dot3(inPlane, turnDir) > 0;
    if (insideTurn) sideVec = add3(out, scale3(inPlane, 1 - circleIn));
    else sideVec = add3(out, scale3(inPlane, 1 - circle)); // outside, and in Terminate: he settles onto Lead's circle (the slot's, in Terminate)
  }
  const aim = add3(add3(add3(L, scale3(ahead, offFt)), sideVec), scale3(Z, place.alt));
  const toAim = sub3(aim, pw);

  // ---- the lift: core's pursuit lift at the L1 gain (2V over the distance to the aim), then the caps ----
  const vHat = st.nose;
  const gain = (2 * st.V) / Math.max(len3(toAim), st.V * LIVE.l1Sec);
  let lift = liftTowardAim(vHat, toAim, st.V, gain).wanted;
  const onUp = dot3(lift, st.bodyUp);
  if (onUp < LIVE.minG) {
    // No push: he unloads to 0.5 G. With some pull still wanted he rolls toward the rest of it as usual; with a push wanted
    // he keeps his wings where they are, so a wish to push never becomes a roll toward what little sideways pull is left
    // (rolling upright over the top instead of pulling through). The hand-over is blended over the first quarter G.
    const across = sub3(lift, scale3(st.bodyUp, onUp));
    lift = add3(scale3(st.bodyUp, LIVE.minG), scale3(across, Math.min(1, Math.max(0, onUp) / (LIVE.minG / 2))));
  }
  const cap = Math.min(shakerG(st.kias), inBubble ? availableG(st.kias) : Math.min(LIVE.normalG, (e.st?.g ?? 1) + LIVE.overLeadG));
  const mag = len3(lift);
  if (mag > cap) lift = scale3(lift, cap / mag);

  // ---- power ----
  let holdKias;
  if (holding) {
    // The path sets his line; power sets how far down it he is: the range against his place's, and the closure on Lead.
    const behindFt = rangeFt - Math.hypot(place.rangeFt, place.alt);
    const closingKt = closureFtps * FTPS_TO_KT;
    const extra = Math.max(-LIVE.overtakeKias, Math.min(LIVE.overtakeKias, LIVE.placeKtPerFt * behindFt - LIVE.closeKtPerKt * closingKt));
    holdKias = e.holdKias + extra; // from Lead's new speed, not the one he is slowing through: a pilot knows Terminate is flown at 200
  }
  // Otherwise MAX, as Lead: both at max power for all of fluid manoeuvring (Patrick 11 Oct 2026 22:32Z), the spacing
  // flown by lag, pure and lead alone.

  // The lift goes to the step as a vector: the step reads it into a G and a bank against each half step's own up and
  // carries the bank through the step (fluid-lead.js stepLead, carryBank), so his wings move only when the lift wanted
  // moves, never because the level reference spun round his nose at the vertical (the loop stutter, Patrick 12 Oct 2026
  // 04:14Z).
  const next = stepLead(st, { lift, holdKias });
  const pose = poseOf3d({
    x: next.pm.x, y: next.pm.y, altAbove: next.pm.z - blockFt, vel: next.vel, up: next.bodyUp,
    kias: next.kias, g: next.g, rollDps: -next.rollRate,
  });
  // His tag's power (power.js): MAX, the throttle that flies his place, or IDLE.
  const throttle = leadThrottle(next, holdKias);
  const power = throttle < 0.005 ? powerFrom('idle', 0, next.kias, next.pm.z) : powerFrom(null, throttle, next.kias, next.pm.z);

  // ---- the words: LAG, PURE or LEAD, read from the slide with a dead band ----
  let word = ws.word;
  if (word === 'pure') word = share > LIVE.wordShare.on ? 'lead' : share < -LIVE.wordShare.on ? 'lag' : 'pure';
  else if (Math.abs(share) < LIVE.wordShare.off || Math.sign(share) !== (word === 'lead' ? 1 : -1)) word = 'pure';
  const cue = toSlot ? 'back to fighting wing' : entering ? 'entry' : t < swapUntil ? 'swap' : word;

  // Terminate is over once he is in the fighting wing band and within 2 kt of Lead (spec section 9).
  const aspect = Math.abs(latDeg);
  const settled = toSlot && rangeFt >= FW_BAND.rangeFt[0] && rangeFt <= FW_BAND.rangeFt[1]
    && aspect >= FW_BAND.sweepDeg[0] && aspect <= FW_BAND.sweepDeg[1] && Math.abs(next.kias - e.st.kias) < LIVE.settleKt;

  return {
    ws: { ...ws, st: next, place, left, turnAcc, turnDir, plane, bias, severity, circle, circleIn, word, side, slotSide, latDeg, latDot, swapUntil },
    pose,
    power,
    cue,
    rangeFt,
    settled,
    side,
  };
}
