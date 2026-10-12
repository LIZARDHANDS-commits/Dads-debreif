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
//    dead astern; the side swaps as the planned wingman's does (TS-60, fluid-wing.js, passed in as ctx.side).
//  - Lead and lag move the aim off Lead toward the inside of his turn (nose in front of him, the short way round, closing)
//    or the outside (nose behind him, the long way round, opening; SMM 16.17 para 44, EFIG p.391), square to the line of
//    sight in Lead's plane of motion, so the nose angle is the lever a pilot uses, by the cues a pilot reads: Lead's manoeuvre
//    sets the default (his cue word, fluid-lead.js: lag into #2 then pure, pure away, lag up the front of a loop, pure as
//    the canopies come parallel over the top, lead down the back), and the range against the one wanted and the closure
//    move it from there, so stretched into a pull he delays the lag or goes pure (Patrick 02:44Z) and tight he lags more.
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
import { liftTowardAim, gAndBankForLift } from '../../../core/point-mass.js';
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
  biasPerSec: 0.15, // a change of cue word slides the default over about 2 s, lead to pure (4 s lag to lead), never in a step (estimate)
  kR: 1, // the range error, as a share of the range wanted, moves the aim ahead (stretched) or behind (tight) one for one (estimate)
  kC: 1, // the closure over lookSec, as a share of the range wanted, moves it behind (closing) or ahead (opening) one for one (estimate)
  lookSec: HOLD.lookSec, // he sets his lag or lead for the gap he will have in about 2 s at the closure he has (estimate, TS-74)
  severityG: 2, // the slide is full with Lead turning at 2 G of acceleration (a 3.5 G loop, a 70° turn), none straight (estimate) ...
  severitySec: 2, // ... and follows his turn over about 2 s, none to full, so a quick roll-in of Lead's moves #2's picture smoothly, never in a step (estimate; smooth hands)
  turnSenseSec: 0.5, // #2's sense of Lead's turn (its direction and size) follows Lead's turning acceleration with about half a second of lag (estimate) ...
  turnHeldG: 0.1, // ... and below 0.1 G of it the last turn's direction and plane are held, so a straight Lead never leaves him a direction from noise (estimate)
  circleSec: 4, // in a turn the side offset in Lead's plane eases away over about 4 s, so #2 settles onto Lead's circle, and back over 4 s as Lead rolls out (estimate; Patrick 12 Oct 2026 01:39Z: "maintain 500 feet in the turn then accept getting a bit further away as we seep out to our 'offset' position")
  circleInsideSec: 8, // ... but with the offset on the inside of Lead's turn (Lead turning into him) over about 8 s, so Lead's turn brings the circle to him and he rolls in later and shallower instead of rolling away first (estimate; Patrick 12 Oct 2026 03:10Z: he turns away only when the turn would bring him inside 500 ft)
  bubbleShare: -1, // inside the 500 ft bubble the aim goes to full lag (spec section 9; SMM 16.17 para 44c)
  l1Sec: 2.5, // the pursuit gain is 2V over the distance to the aim, or over about 2.5 s of flight if the aim is nearer (estimate): standard L1 guidance, soft enough that a roll-in of Lead's is followed, not snatched at
  overLeadG: 1.5, // he pulls no more than about 1.5 G over what Lead is pulling (estimate: a pilot matches Lead's pull and adds what the picture needs), the bubble excepted
  relevelPerSec: 0.5, // the side frame along Lead's path eases back to level at about 0.5 per second with Lead upright and his nose near the horizon, none inverted or near the vertical (estimate), so his side holds through a loop
  minG: 0.5, // never below 0.5 G on the lift he has (as Lead's push, 2 CFFTS Orders B2 ch 8 para 1a; 0.5 an estimate)
  normalG: G_RULE.normalG, // SMM 16.17 para 44a; Gen Book p.11 (flagged, the normal ceiling)
  acrossDps: 3, // how fast his place moves across the tail (the entry): 3°/s, 30° in about 10 s (estimate)
  slotAcrossDps: 1.5, // in Terminate his place moves across to the fighting wing slot at 1.5°/s (estimate), slow enough that Lead's turn away from him does it and he only turns less, never away first
  rangeFtps: 60, // how fast his place moves in or out (a new distance, the entry, Terminate): estimate
  altFtps: 20, // how fast his place moves up or down (Terminate's slot height): estimate
  placeKtPerFt: 0.08, // with Lead holding a speed, power flies his place: 1 kt faster per 12.5 ft behind it (estimate) ...
  closeKtPerKt: 0.6, // ... less 0.6 kt per knot he is already closing on it (estimate) ...
  overtakeKias: HOLD.overtakeKias, // ... within 15 KIAS of Lead (EFIG p.374's 10-20 KIAS)
  wordShare: Object.freeze({ on: 0.35, off: 0.15 }), // LAG or LEAD shows past 35% of the cap and goes under 15%, so the word doesn't flicker (estimate)
  settleKt: 2, // Terminate ends with him in the fighting wing band and within 2 kt of Lead (spec section 9)
});

/**
 * The point mass measures bank from a level up (core upFrom), which spins round the nose when the nose passes near the
 * vertical a little off the plane (a loop flown slightly tilted). Holding the bank number through that spin would be a
 * real roll, so after each step the bank is re-read against the new up to keep his lift where it was: his wings don't move
 * because the reference did. Lead's own step is unchanged; this is #2's.
 */
function carryBank(prev, next) {
  const carried = unit3(perp3(prev.pm.up, next.nose));
  const spin = Math.atan2(dot3(cross3(carried, next.pm.up), next.nose), dot3(carried, next.pm.up));
  if (Math.abs(spin) < 1e-9) return next;
  const bankDeg = next.bank - spin / DEG;
  const b = bankDeg * DEG;
  const right = cross3(next.nose, next.pm.up);
  const bodyUp = unit3(add3(scale3(next.pm.up, Math.cos(b)), scale3(right, Math.sin(b))));
  const accPerp = perp3(sub3(scale3(bodyUp, next.g * G_FTPS2), { x: 0, y: 0, z: G_FTPS2 }), next.nose);
  return { ...next, bank: ((bankDeg + 540) % 360) - 180, bodyUp, accPerp };
}

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
  const slotRange = Math.hypot(slot.fwd, slot.left, slot.alt);
  const slotAcross = Math.atan2(Math.abs(slot.left), -slot.fwd) / DEG;
  return {
    st,
    slot: { rangeFt: slotRange, acrossDeg: slotAcross, alt: slot.alt },
    // His place now (eased toward what the phase asks): range, angle off the tail (signed, left positive) and height.
    place: { rangeFt: slotRange, acrossDeg: side * slotAcross, alt: slot.alt },
    left: null, // the side frame along Lead's path, set on the first step
    bias: 0, // the default slide from Lead's cue word, eased
    turnAcc: null, // Lead's turning acceleration as #2 senses it (ft/s², eased)
    turnDir: null, // ... its direction and plane (held while Lead flies straight)
    plane: null,
    severity: 0, // how hard Lead is turning, eased
    circle: 0, // how far the side offset in Lead's plane has eased away, 0 to 1
    slotAt: null,
    word: 'pure',
  };
}

/**
 * One step of #2. ctx: { e (Lead's entry this step: pos, vel, accPerp, st, cue, holdKias), t, rangeFt (the setting),
 * blockFt, side (+1 left of Lead's tail, -1 right: the planned wingman's, swaps included) }. Returns { ws (the next state),
 * pose (kinematic.js applyPose), power, cue ('lag' | 'pure' | 'lead' | 'entry' | 'back to fighting wing'), rangeFt,
 * settled }.
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
  const severity = Math.min(turning, toward(ws.severity ?? 0, turning, 1 / LIVE.severitySec));
  const circle = toward(ws.circle ?? 0, turning, 1 / LIVE.circleSec);
  const circleIn = toward(ws.circleIn ?? 0, turning, 1 / LIVE.circleInsideSec);
  const inBubble = rangeFt < FW_BAND.bubbleFt;
  const holding = Boolean(e.holdKias);

  // ---- his place: the cone (entry and fluid) or his fighting wing slot (Terminate), eased ----
  const toSlot = e.cue?.blend === 0;
  const entering = e.cue?.blend === 1;
  const side = ctx.side ?? (ws.place.acrossDeg < 0 ? -1 : 1);
  const want = toSlot
    ? { rangeFt: ws.slot.rangeFt, acrossDeg: side * ws.slot.acrossDeg, alt: ws.slot.alt }
    : { rangeFt: Math.max(FW_BAND.bubbleFt, ctx.rangeFt - LIVE.turnInFt), acrossDeg: side * LIVE.sideDeg, alt: 0 };
  // Terminate: Lead's turn reaches him along Lead's path only after the time he is behind on it, so his place starts to
  // move across to the fighting wing slot then, with the turn, not before it (rolling away first, then back into the turn).
  const slotAt = toSlot ? (ws.slotAt ?? t + rangeFt / Math.max(len3(e.vel), 1)) : null;
  const acrossNow = !toSlot || t >= slotAt;
  const place = {
    rangeFt: toward(ws.place.rangeFt, want.rangeFt, LIVE.rangeFtps),
    acrossDeg: acrossNow ? toward(ws.place.acrossDeg, want.acrossDeg, toSlot ? LIVE.slotAcrossDps : LIVE.acrossDps) : ws.place.acrossDeg,
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
  const biasWanted = { lag: lagDefault, pure: 0, lead: levelTurning ? 0 : LIVE.biasLead }[e.cue?.mode] ?? 0;
  const bias = toward(ws.bias, biasWanted, LIVE.biasPerSec);
  const wantFt = Math.max(place.rangeFt, 1);
  let shareWanted = bias + (LIVE.kR * (rangeFt - wantFt)) / wantFt - (LIVE.kC * closureFtps * LIVE.lookSec) / wantFt;
  if (inBubble) shareWanted = Math.min(shareWanted, LIVE.bubbleShare);
  // While Lead holds a speed (Terminate) power flies his place, so geometry comes in only as lag.
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
  // In a turn the part of it in Lead's plane eases away (circle), so he settles onto Lead's circle, and eases back as the
  // turn eases (Terminate's slot offset included, so it comes back with Lead's gentle turn, never in a step); out of the
  // plane (beside a loop) it holds.
  let sideVec = scale3(left, place.rangeFt * Math.sin(place.acrossDeg * DEG));
  let insideTurn = false;
  if (plane) {
    const nTurn = unit3(perp3(plane, nose));
    const out = scale3(nTurn, dot3(sideVec, nTurn));
    const inPlane = sub3(sideVec, out);
    insideTurn = dot3(inPlane, turnDir) > 0;
    sideVec = add3(out, scale3(inPlane, 1 - (insideTurn ? circleIn : circle)));
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
  const { g, bankRad } = gAndBankForLift(lift, vHat, st.pm.up, st.bank * DEG);

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

  const next = carryBank(st, stepLead(st, { g, bank: bankRad / DEG, holdKias }));
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
  const cue = toSlot ? 'back to fighting wing' : entering ? 'entry' : word;

  // Terminate is over once he is in the fighting wing band and within 2 kt of Lead (spec section 9).
  const aspect = Math.abs(latDeg);
  const settled = toSlot && rangeFt >= FW_BAND.rangeFt[0] && rangeFt <= FW_BAND.rangeFt[1]
    && aspect >= FW_BAND.sweepDeg[0] && aspect <= FW_BAND.sweepDeg[1] && Math.abs(next.kias - e.st.kias) < LIVE.settleKt;

  return {
    ws: { ...ws, st: next, place, left, turnAcc, turnDir, plane, bias, severity, circle, circleIn, slotAt, word },
    pose,
    power,
    cue,
    rangeFt,
    settled,
  };
}
