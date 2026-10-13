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
// The same law flew #2 in the 2-ship's fighting wing moves when the "#2 in fighting wing" setting was Live (ctx.fw; TS-202,
// Patrick 12 Oct 2026 08:19Z: "FM is basically fighting wing but aerobatics", "uses lead / lag / pure"). There Lead holds
// his speed, #2's place is the cone (where he is while in it, else its nearest point, taken again whenever Lead is level so
// he resets in position as Lead rolls out), and his spacing is flown with the vertical first, power only for the rest
// (Patrick 08:19Z: "climbing in the cone falls back, descending moves forward ... but can use power if needed").
//
// Units: feet, seconds, x east, y north, z up; Lead's positions are heights above the block (fluid.js), #2's point mass
// is absolute (as Lead's st.pm). Every number with no manual or ruling beside it is an estimate and says so.
import { liftTowardAim } from '../../../core/point-mass.js';
import { shakerG, availableG } from '../../../core/t6-performance.js';
import { DEG } from '../../../core/angles.js';
import { FTPS_TO_KT, G_FTPS2 } from '../../../core/units.js';
import { STEP_SEC } from './flight.js';
import { G_RULE, WING, HOLD, LIVE } from './tuning.js';
import { FW_BAND } from './slots.js';
import { leadStateOf, stepLead, leadThrottle } from './fluid-lead.js';
import { powerFrom } from './power.js';
import { add3, sub3, scale3, len3, cross3, unit3, perp3, dot3, poseOf3d } from './attitude.js';

const dt = STEP_SEC;
const Z = Object.freeze({ x: 0, y: 0, z: 1 });

export { LIVE }; // its home is wing-moves.js (the tuning sheet, TS-214)


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
 * Fighting wing's energy (TS-202): the speed his place wants (the range against his place's and the closure on Lead, as
 * Terminate's power) as height first, up to fwHeightFt above or below Lead (a knot is about V / g feet of height at the
 * same energy), and the knots the height can't take for power. Returns { altFt, powerKt, ftPerKt }.
 */
function fwEnergy(ws, rangeFt, closureFtps, st) {
  const extraKt = LIVE.placeKtPerFt * (rangeFt - ws.place.rangeFt) - LIVE.closeKtPerKt * closureFtps * FTPS_TO_KT;
  const ftPerKt = st.V / FTPS_TO_KT / G_FTPS2;
  const altFt = Math.max(-LIVE.fwHeightFt, Math.min(LIVE.fwHeightFt, -extraKt * ftPerKt));
  return { altFt, powerKt: extraKt + altFt / ftPerKt, ftPerKt };
}

/**
 * #2's picture of Lead's turn at a press in the middle of one (fighting wing, TS-202): his sense of the turn as if he had
 * been watching it, so a reversal or a wings level pressed mid-turn doesn't start him from a straight Lead (a jump of the
 * aim across). e: Lead's entry at the press.
 */
export function seedLiveWingTurn(ws, e) {
  const nose = unit3(e.vel);
  const turning = Math.min(1, len3(e.accPerp) / (LIVE.severityG * G_FTPS2));
  if (len3(e.accPerp) <= LIVE.turnHeldG * G_FTPS2) return ws;
  return { ...ws, turnAcc: e.accPerp, turnDir: unit3(e.accPerp), plane: unit3(cross3(nose, e.accPerp)), severity: turning, circle: turning, circleIn: turning };
}

/**
 * One step of #2. ctx: { e (Lead's entry this step: pos, vel, accPerp, st, cue, holdKias), t, rangeFt (the setting),
 * blockFt, side (+1 left of Lead's tail, -1 right: the planned wingman's, used only until he has a side of his own), fw (fighting
 * wing, TS-202) }.
 * Returns { ws (the next state), pose (kinematic.js applyPose), power, cue ('lag' | 'pure' | 'lead' | 'entry' | 'back to
 * fighting wing'), rangeFt, settled, side (his side of Lead's tail now) }.
 */
export function stepLiveWing(ws, ctx) {
  const { e, t, blockFt } = ctx;
  const fw = Boolean(ctx.fw);
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
  // the planned cue did.
  const overTop = (e.st?.bodyUp?.z ?? 1) < 0 || Math.abs(nose.z) > 0.3;
  // At the inverted top of a roll (Lead past about 135° of bank and still rolling: estimates) he takes the other side,
  // his lead pursuit for the way down (Patrick 12 Oct 2026 05:54Z: the swap is "to get lead pursuit"; his card 06:18Z,
  // "Cross early"). Measured on V2.382 in the barrel roll his way: on the inside of the roll he arrives at the top
  // slower than Lead (3.4 G to Lead's 2.8 on the way up to stay behind him, 33 kt down), and waiting for his drift to
  // show the crossing at the pull-out left him 1,113 ft back and stretched 21 s; taking the other side at the top ends it at
  // 961 ft with no stretch, the other twelve runs unchanged. Crossing as Lead rolled in instead stretched both wingovers,
  // and a floor under his lead and lag authority made it worse, so neither is in.
  const invertedTop = (e.st?.bodyUp?.z ?? 1) < -LIVE.topSwapUpZ && Math.abs(e.st?.rollRate ?? 0) > LIVE.topSwapRollDps;
  if (invertedTop && turning > LIVE.topSwapTurn && !toSlot && !entering && t >= swapUntil) {
    side = -side;
    swapUntil = t + WING.swapGuardSec;
  }
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
  const tightStraight = toSlot || fw ? 0 : (1 - turning) * Math.max(0, Math.min(1, (wantRange - (rangeFt - closureFtps * LIVE.lookSec)) / Math.max(wantRange - FW_BAND.bubbleFt, 1)));
  // Fighting wing (TS-202): with Lead level his place is where he is in the cone, else its nearest point (inside the band by
  // its fly margins, slots.js FW_BAND), so after Lead rolls out he resets in position; while Lead turns it holds, and the
  // circle and the lead and lag fly him. Its height is the energy height (below).
  const inBand = (x, [lo, hi], m) => Math.max(lo + m, Math.min(hi - m, x));
  // In the 4-ship each wingman keeps his stack on the one he flies off (ws.fwStackFt, set at the press, TS-206), the
  // energy height round it.
  const fwAltWanted = fw ? (ws.fwStackFt ?? 0) + fwEnergy(ws, rangeFt, closureFtps, st).altFt : 0;
  // The place is taken once, as Lead's turn eases off (and at the press), and then held, so the energy and the power have
  // a place to fly back to instead of following him wherever he drifts.
  const fwLevel = fw && turning < LIVE.sideFreeTurn;
  const fwTake = fwLevel && !ws.fwLevel;
  const fwPlace = fwTake ? { rangeFt: inBand(rangeFt, FW_BAND.rangeFt, FW_BAND.flyMarginFt[0]), acrossDeg: inBand(Math.abs(latDeg), FW_BAND.sweepDeg, FW_BAND.flyMarginDeg) } : ws.fwPlace;
  const want = fw
    ? { rangeFt: fwPlace.rangeFt, acrossDeg: side * fwPlace.acrossDeg, alt: fwAltWanted }
    : toSlot
    ? { rangeFt: wantRange, acrossDeg: side * ws.slot.acrossDeg, alt: ws.slot.alt }
    : { rangeFt: wantRange, acrossDeg: side * (LIVE.sideDeg + (LIVE.openDeg - LIVE.sideDeg) * tightStraight), alt: LIVE.openUpFt * tightStraight };
  // Terminate: Lead flies straight and level, so his place flows across to the fighting wing slot from the press (Patrick
  // 12 Oct 2026 04:01Z).
  const place = {
    rangeFt: toward(ws.place.rangeFt, want.rangeFt, LIVE.rangeFtps),
    acrossDeg: toward(ws.place.acrossDeg, want.acrossDeg, toSlot ? LIVE.slotAcrossDps : LIVE.acrossDps),
    alt: toward(ws.place.alt, want.alt, fw ? LIVE.fwAltFtps : LIVE.altFtps),
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
  // In fighting wing he uses lead as well (Patrick 12 Oct 2026 08:19Z, "uses lead / lag / pure").
  if (holding && !fw) shareWanted = Math.min(0, shareWanted);
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
  let heightWanted = 0;
  if (plane) {
    const nTurn = unit3(perp3(plane, nose));
    const out = scale3(nTurn, dot3(sideVec, nTurn));
    const inPlane = sub3(sideVec, out);
    insideTurn = dot3(inPlane, turnDir) > 0;
    if (insideTurn) sideVec = add3(out, scale3(inPlane, 1 - circleIn));
    else sideVec = add3(out, scale3(inPlane, 1 - circle)); // outside, and in Terminate: he settles onto Lead's circle (the slot's, in Terminate)
    // Outside the turn the part of the offset that has eased off Lead's plane comes back as height above Lead on his
    // circle: the route position kept as height in the cone, not flown at Lead (Patrick 12 Oct 2026 04:14Z "flying
    // directly at lead instead of the route position"; his card 06:57Z "Height in the cone"). Measured in a steady 60°
    // turn away: about 100 ft above, 11° off the tail, 690-700 ft, steady. Not in Terminate; it comes on and off at the
    // place's own height rate, so the press does not drop him (measured: a step to 0.5 G there).
    if (!insideTurn) heightWanted = toSlot || holding ? 0 : len3(inPlane) * circle * LIVE.heightShare;
  }
  const heightFt = toward(ws.heightFt ?? 0, heightWanted, LIVE.altFtps);
  sideVec = add3(sideVec, scale3(Z, heightFt));
  let aim = add3(add3(add3(L, scale3(ahead, offFt)), sideVec), scale3(Z, place.alt));
  // Fighting wing: the aim eased in Lead's frame (fwAimFtps, fwAimAccelFtps2), so it moves with Lead as he turns but never
  // jumps across him.
  let aimRel = null;
  let aimVel = null;
  if (fw) {
    const up = unit3(cross3(nose, left));
    const want = sub3(aim, L);
    const wantRel = { f: dot3(want, nose), l: dot3(want, left), u: dot3(want, up) };
    const was = ws.aimRel ?? wantRel;
    const v0 = ws.aimVel ?? { f: 0, l: 0, u: 0 };
    const gap = { f: wantRel.f - was.f, l: wantRel.l - was.l, u: wantRel.u - was.u };
    const dist = Math.hypot(gap.f, gap.l, gap.u);
    const speed = Math.min(LIVE.fwAimFtps, Math.sqrt(2 * LIVE.fwAimAccelFtps2 * dist));
    const vWant = dist > 1e-6 ? { f: (gap.f / dist) * speed, l: (gap.l / dist) * speed, u: (gap.u / dist) * speed } : { f: 0, l: 0, u: 0 };
    const dv = { f: vWant.f - v0.f, l: vWant.l - v0.l, u: vWant.u - v0.u };
    const dvMag = Math.hypot(dv.f, dv.l, dv.u);
    const k = dvMag > LIVE.fwAimAccelFtps2 * dt ? (LIVE.fwAimAccelFtps2 * dt) / dvMag : 1;
    aimVel = { f: v0.f + dv.f * k, l: v0.l + dv.l * k, u: v0.u + dv.u * k };
    const stepFt = Math.hypot(aimVel.f, aimVel.l, aimVel.u) * dt;
    aimRel = stepFt >= dist ? wantRel : { f: was.f + aimVel.f * dt, l: was.l + aimVel.l * dt, u: was.u + aimVel.u * dt };
    if (stepFt >= dist) aimVel = { f: 0, l: 0, u: 0 };
    aim = add3(L, add3(add3(scale3(nose, aimRel.f), scale3(left, aimRel.l)), scale3(up, aimRel.u)));
  }
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
    // In fighting wing he rolls toward the aim even with a push wanted: no aerobatics to pull through there, and with his
    // wings held a wingman banked away from his aim sat at 0.5 G and flew off (the 4-ship's #4, measured 12 Oct 2026).
    // The same in fluid while Lead is not over the top (upright, nose near the horizon: a level turn, a reversal, straight
    // and level): nothing to pull through, so he rolls to put his lift on Lead as a pilot does. Measured on V2.415: Lead's
    // 360 into #2 from a close or high place in the cone (550 ft, or 140 ft above) rolled #2 away first, as meant, and
    // then, banked 25° away (or past 90° from the hard lag) with Lead now on his other side, his wings were held at 0.5 G:
    // he never rolled back, ran downhill to 460 KIAS and 20,000 ft away (Patrick, "lead turned in to me and I turned left
    // and we lost him"). Over the top the wings are held as before.
    const noAerobatics = fw || !overTop;
    const rollShare = noAerobatics ? 1 : Math.min(1, Math.max(0, onUp) / (LIVE.minG / 2));
    lift = add3(scale3(st.bodyUp, LIVE.minG), scale3(across, rollShare));
  }
  // Eased hands in Terminate: the lift wanted is eased over about a second (spec section 10.11, "the aim itself is eased
  // over about a second (estimate) so a press of Lead's never moves #2 in one step"), so Lead's ease from 60° to 30° of
  // bank at the Terminate press rolls #2 with Lead over 3 s at up to 17°/s instead of at the aircraft's full rate and
  // back (measured V2.384: 60 -> 39 -> 47° in a second, 87°/s; the fluid thread's reversal right 58 -> 40 -> 46°). Only
  // while Lead holds a speed: eased through the manoeuvres as well he lost Lead in the wingovers and the barrel roll
  // (measured, dropped). The roll-out wag is a 10° overshoot at 14°/s with this (18-20° before TS-198).
  // The ease is for the press only: it fades out over handsFadeSec from the Terminate press, so it never sits inside his
  // pursuit loop for the rest of Terminate (the fluid thread's check of 995540b5: eased throughout, his bank hunted slowly
  // after Lead's roll-out, two or three swings where main has one). Timed from the press (toSlot), not from the hold,
  // because Lead's level turns already hold a speed (measured: a hold-timed fade had run out, level turn L still 86°/s).
  // Measured with this: every Terminate's press 20-25°/s, the roll-out settle and swings the same as V2.384.
  const holdSince = toSlot ? (ws.holdSince ?? t) : undefined;
  const fade = holding && toSlot ? Math.max(0, 1 - (t - holdSince) / LIVE.handsFadeSec) : 0;
  if (holding && ws.liftEased && fade > 0) lift = add3(ws.liftEased, scale3(sub3(lift, ws.liftEased), Math.min(1, dt / (LIVE.handsSec * fade))));
  // The eased lift is carried through the manoeuvres too, so at the press the ease starts from the lift he was flying,
  // not from the first step's jump to the slot (measured: starting from that step held the jump and made the snap worse).
  const liftEased = lift;
  const cap = Math.min(shakerG(st.kias), inBubble ? availableG(st.kias) : Math.min(LIVE.normalG, (e.st?.g ?? 1) + LIVE.overLeadG));
  const mag = len3(lift);
  if (mag > cap) lift = scale3(lift, cap / mag);

  // ---- power ----
  let holdKias;
  if (fw && holding) {
    // Fighting wing (TS-202): the speed he wants goes into height first (fwEnergy: the place's height), so at Lead's power
    // a climb in the cone falls him back and a descent moves him forward; the throttle holds the speed that height gives
    // him at Lead's energy, plus only what the height could not take, within 15 KIAS of Lead.
    const en = fwEnergy(ws, rangeFt, closureFtps, st);
    const aboveFt = pw.z - L.z - (ws.fwStackFt ?? 0); // above his stack (TS-206; 0 in the 2-ship)
    holdKias = e.holdKias + Math.max(-LIVE.overtakeKias, Math.min(LIVE.overtakeKias, en.powerKt - aboveFt / en.ftPerKt));
  } else if (holding) {
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
    ws: { ...ws, st: next, aimRel, aimVel, fwLevel, fwPlace, liftEased, holdSince, heightFt, place, left, turnAcc, turnDir, plane, bias, severity, circle, circleIn, word, side, slotSide, latDeg, latDot, swapUntil },
    pose,
    power,
    cue,
    rangeFt,
    settled,
    side,
  };
}
