// #2 in fluid manoeuvring, the live wingman (spec section 9, "#2, the live wingman"; TS-194; Patrick 11 Oct 2026 20:57Z:
// "ensure that we are using the concepts in the SMM of lead/lag/pure and fighting wing and how fluid manoeuvring is
// actually supposed to be flown"). #2 is a real aircraft: the shared point mass (core stepPointMass) with the T-6A's
// thrust and drag, flown by Lead's own step (fluid-lead.js stepLead: the G built at the T-6A's onset, the roll at its
// rate and onset for the speed, the stick shaker the one physical limit). He is not on a line. Each step a pilot law
// reads the picture and asks for a lift, a roll and a power, as a pilot does:
//
//  - The path (EFIG p.391: "once in position maintain range by following lead's flight path (maintain lead's turn
//    circle)"; "go to where lead was and do what lead did"): #2 flies Lead's own track, offset across to his side by the
//    15° off Lead's tail (Patrick 4 Oct 22:28Z, "hold 15"), in whatever plane Lead's turn lies: a level turn, a loop,
//    a wingover or the barrel roll. On Lead's path at Lead's power he has Lead's energy where Lead had it.
//  - The pursuit: core liftTowardAim at the aim on that path about 1.5 s of flight ahead of him, at a gain of 2V over
//    that distance, which flies the path's own curve (standard L1 guidance: the lateral acceleration 2V²/L sin η is
//    V²/R on a circle).
//  - Lead, lag and pure (SMM 12.30 paras 72-74, 16.16 paras 39-40, 16.17 para 44; EFIG p.391): the path is moved inside
//    Lead's turn (lead, the short way, closing) or outside it (lag, the long way, opening) by a continuous amount from
//    the range error and closure: the gap he will have in a couple of seconds at the closure he has. Inside the 500 ft
//    bubble it goes to full lag.
//  - Smooth hands: the offsets are eased (a critically damped follow of about two seconds), the G is built at the T-6A's
//    onset and the roll at its rate and onset (stepLead), so a press of Lead's never moves #2 in one step.
//  - Caps: no push below 0.5 G on the lift he has (he unloads and keeps his wings where they are); the stall line and
//    the shaker; 5 G the normal ceiling (SMM 16.17 para 44a, G_RULE), opened to the aircraft's own limit only inside the
//    bubble. All flagged by the card, none a wall except the aircraft's own.
//  - Over the top (the loop, the wingovers, the barrel roll; Patrick 11 Oct 2026 22:31Z): lag going up, pure before the
//    top, lead from the top down, from Lead's own phase plus the time he has lost or gained on Lead's path; wider out of
//    Lead's plane, not closer, where the range shrinks as Lead slows; on the outside of Lead's roll.
//  - Power: MAX like Lead for all of fluid manoeuvring (Patrick 11 Oct 2026 22:32Z, "Both should be at max power for all
//    of fluid maneuvering"; SMM 16.17 paras 42-43, "both aircraft maintain the same power setting"): the spacing is
//    flown by geometry alone. While Lead holds a speed (the entry and Terminate) power flies his range, from Lead's new
//    speed.
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
import { swapWanted } from './fluid-wing.js';
import { add3, sub3, scale3, len3, cross3, unit3, perp3, dot3, poseOf3d } from './attitude.js';

const dt = STEP_SEC;

/** The live wingman's numbers. Estimates unless a source is given. */
export const LIVE = Object.freeze({
  latDeg: WING.latDeg, // 15° off Lead's tail (Patrick 4 Oct 22:28Z, "hold 15")
  cutShare: HOLD.cutShare, // lead puts the aim inside Lead's circle by up to 25% of the range (about sin 15°; estimate, V2.59) ...
  lagShare: 0.5, // ... and lag outside it by up to half the range (estimate): at MAX with Lead (Patrick 22:32Z) only lag can hold the range in a turn
  turnFullG: 1, // the inside or outside offset grows with Lead's turning acceleration, full at 1 G of it (estimate): none straight
  swapPitchDeg: 30, // a swap only with Lead's nose within 30° of level (estimate): in the vertical he stays on his side
  vertLag: 1, // lag in the vertical (outside the loop), a share of the sideways lag (estimate)
  vertLead: 1, // lead in the vertical (inside the loop, the short way down), a share of the sideways lead (estimate)
  wideMaxShare: 0.6, // in the vertical he also moves out of Lead's plane to his own side when he would come inside the bubble (wider, not higher, so he keeps Lead's speed over the top), up to 60% of the range (estimate) ...
  widePerFt: 1.5, // ... 1.5 ft out for each foot he would otherwise be inside 600 ft (the bubble and twice its margin) at the closure he has (estimate)
  relevelPerSec: 0.5, // his sideways frame along Lead's path eases back to level at about 0.5 per second with Lead's nose on the horizon, none at the vertical (estimate)
  insideSec: 1, // ... and is eased along his path over about a second of it (estimate), so his pull bends it in, never a kink
  l1Sec: 1.5, // he aims at the point of Lead's path about 1.5 s of flight ahead of him (estimate): the gain 2V/L1 flies the path's own curve (standard L1 guidance); shorter and the roll's lag sets him weaving
  l1MinFt: 250, // ... but never nearer than 250 ft (estimate)
  interceptDeg: 40, // off the path, he looks far enough ahead to cut back onto it at no more than about 40° (estimate)
  rangeScaleFt: 100, // the range error (after the look ahead) that takes the lag or lead most of the way to full: estimate
  lookSec: HOLD.lookSec, // he sets his lag or lead for the gap he will have in about 2 s (estimate, TS-74)
  aimSec: 2, // the aim offsets are eased over about two seconds (spec section 9 says about a second; estimate): a critically damped follow, time constant aimSec / 2
  minG: 0.5, // never below 0.5 G on the lift he has (as Lead's push, 2 CFFTS Orders B2 ch 8 para 1a; 0.5 an estimate)
  normalG: G_RULE.normalG, // SMM 16.17 para 44a; Gen Book p.11 (flagged, the normal ceiling)
  acrossDps: 3, // how fast his place moves across the tail (a swap, the entry, Terminate): 3°/s, a 30° swap in about 10 s (estimate; inside WING.swapMinSec-swapMaxSec)
  shareSec: 6, // the lag or lead share swings from full lag to full lead in no less than 6 s (estimate)
  overTop: Object.freeze(['loop', 'wingover', 'barrelRoll']), // Lead's manoeuvres over the top
  startFt: 600, // he starts them no further out than 600 ft, the default setting (Patrick 11 Oct 2026 22:54Z, card: 600 ft rather than near 500 ft)
  topAcrossDps: 6, // over the top he crosses behind Lead at 6°/s, 30° in 5 s (estimate)
  topShareSec: 3, // over the top the share swings in no less than 3 s (estimate), so lag going up is pure before the top and lead from the top down
  rangeFtps: 60, // how fast his place moves in or out (a new distance, the entry, Terminate): estimate
  altFtps: 20, // how fast his place moves up or down (Terminate's slot height): estimate
  placeKtPerFt: 0.08, // with Lead holding a speed, power flies his place: 1 kt faster per 12.5 ft behind it (estimate) ...
  closeKtPerKt: 0.6, // ... less 0.6 kt per knot he is already closing on it (estimate) ...
  overtakeKias: HOLD.overtakeKias, // ... within 15 KIAS of Lead (EFIG p.374's 10-20 KIAS)
  bubbleMarginFt: HOLD.bubbleMarginFt, // the 500 ft bubble's margin, about 50 ft (estimate, TS-74)
  wordShare: Object.freeze({ on: 0.35, off: 0.15 }), // LAG or LEAD shows past 35% of full and goes under 15%, so the word doesn't flicker (estimate)
  settleKt: 2, // Terminate ends with him in the fighting wing band and within 2 kt of Lead (spec section 9)
});

/** Lead's level frame at an entry: nose, level up (his path, not his roll) and left wing line. */
function frameOf(e) {
  const nose = unit3(e.vel);
  const up = unit3(perp3(e.levelUp, nose));
  return { nose, up, left: cross3(up, nose) };
}

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
    side,
    slot: { rangeFt: slotRange, acrossDeg: slotAcross, alt: slot.alt },
    // His place now (eased toward what the phase asks): range, angle off the tail (signed, left positive) and height.
    place: { rangeFt: slotRange, acrossDeg: side * slotAcross, alt: slot.alt },
    off: null, // the eased offsets from Lead's path ({ l, n, u } and their rates), set on the first step
    j: null, // the step of Lead's path he is abeam
    lastLatDeg: null,
    swapUntil: -Infinity,
    word: 'pure',
  };
}

/**
 * One step of #2. ctx: { e (Lead's entry this step: pos, vel, levelUp, accPerp, st, cue, holdKias), E (Lead's entry at
 * any step), k (this step), kMin (the oldest step kept), t, rangeFt (the setting), blockFt }. Returns { ws (the next state), pose
 * (kinematic.js applyPose), power, cue ('lag' | 'pure' | 'lead' | 'swap' | 'entry' | 'back to fighting wing'), rangeFt,
 * settled }.
 */
export function stepLiveWing(ws, ctx) {
  const { e, t, blockFt } = ctx;
  const st = ws.st;
  const { nose, left } = frameOf(e);
  const L = e.pos;
  const pw = { x: st.pm.x, y: st.pm.y, z: st.pm.z - blockFt };
  const r = sub3(pw, L);
  const rangeFt = len3(r);
  const latDeg = Math.atan2(dot3(r, left), -dot3(r, nose)) / DEG; // his angle off Lead's tail, left positive

  // ---- his place: the cone (entry and fluid) or his fighting wing slot (Terminate) ----
  const toSlot = e.cue?.blend === 0;
  const entering = e.cue?.blend === 1;
  let side = ws.side;
  let swapUntil = ws.swapUntil;
  const aDot = ws.lastLatDeg === null ? 0 : (side * (latDeg - ws.lastLatDeg)) / dt;
  // Over the top (the loop, the wingovers, the barrel roll, set-up included): lag going up, pure before the top, lead from
  // the top down as Lead accelerates away (Patrick 11 Oct 2026 22:31Z, "transition to pure earlier and transition to lead
  // over the top earlier"; Lead's own phase word, fluid-lead.js loopMode and overTheTopMode), power left at MAX.
  const overTop = !toSlot && LIVE.overTop.includes(e.ctl?.key) && e.mem?.stage !== 'exit';
  const topPhase = overTop && e.mem?.stage !== 'setup';
  // How much of Lead's turn is sideways in his level frame (1 in a level turn, 0 in a loop or straight): the side swap
  // (TS-60) is a sideways matter, flown only with Lead's nose near level; in the vertical #2 stays on his side.
  const aLead = len3(e.accPerp);
  const latFrac = Math.abs(dot3(e.accPerp, left)) / Math.max(aLead, LIVE.turnFullG * G_FTPS2);
  const levelish = Math.abs(nose.z) < Math.sin(LIVE.swapPitchDeg * DEG);
  let topSwaps = overTop ? ws.topSwaps ?? 0 : 0;
  let outside = overTop ? ws.outside ?? null : null;
  const rollingOver = overTop && (e.ctl.key === 'barrelRoll' || (e.ctl.key === 'wingover' && e.mem.stage === 'setup'));
  if (!toSlot && !entering && !rollingOver && levelish && latFrac > 0.5 && swapWanted(side * latDeg, aDot, { blend: 1, t, swapUntil })) {
    side = -side;
    swapUntil = t + (2 * LIVE.latDeg) / LIVE.acrossDps;
  } else if (rollingOver) {
    // Rolling over the top he starts on the outside of Lead's roll, crossing behind him in the set-up if he is not (lag, the
    // long way round: SMM 16.17 para 44): on the inside he would pull harder than Lead and come inside the bubble. Through
    // the barrel roll he stays there; once the wingovers start, the planned wingman's swap (TS-60) takes him across as Lead
    // rolls the other way.
    if (outside === null) outside = -(e.ctl.dir ?? -side);
    if (outside !== side && t >= swapUntil) {
      side = outside;
      swapUntil = t + (2 * LIVE.latDeg) / LIVE.topAcrossDps;
      topSwaps++;
    }
  }
  const want = toSlot
    ? { rangeFt: ws.slot.rangeFt, acrossDeg: side * ws.slot.acrossDeg, alt: ws.slot.alt }
    : { rangeFt: overTop ? Math.min(ctx.rangeFt, LIVE.startFt) : ctx.rangeFt, acrossDeg: side * LIVE.latDeg, alt: 0 };
  const place = {
    rangeFt: toward(ws.place.rangeFt, want.rangeFt, LIVE.rangeFtps),
    acrossDeg: toward(ws.place.acrossDeg, want.acrossDeg, overTop ? LIVE.topAcrossDps : LIVE.acrossDps),
    alt: toward(ws.place.alt, want.alt, LIVE.altFtps),
  };
  const across = place.acrossDeg * DEG;

  // ---- lag, pure or lead: from the gap he will have at the closure he has ----
  const vW = st.vel;
  const closureFtps = -dot3(r, sub3(vW, e.vel)) / Math.max(rangeFt, 1);
  const inBubble = rangeFt < FW_BAND.bubbleFt;
  const gap = rangeFt - place.rangeFt - closureFtps * LIVE.lookSec;
  const holding = Boolean(e.holdKias);
  // While Lead holds a speed the place is flown by power, so geometry comes in only as lag, when he will be inside his
  // place at the closure he has (both may be at idle as Lead slows, when only geometry can open the range).
  const byRange = Math.tanh(gap / LIVE.rangeScaleFt);
  // Over the top the range shrinks and grows again with Lead's speed alone (he is a fixed time behind on the same path), so
  // there his place is a time behind Lead along Lead's path, set as the manoeuvre starts: the gap is the time he has lost
  // or gained, as distance at his speed. Read from the step he was abeam last step (ws.j).
  let tau0 = topPhase ? ws.tau0 : null;
  let byTime = 0;
  if (topPhase && ws.j !== null) {
    const ej = ctx.E(ws.j);
    const vj = len3(ej.vel);
    const frac = dot3(sub3(pw, ej.pos), unit3(ej.vel)) / Math.max(vj * dt, 1e-6);
    const tau = (ctx.k - ws.j - frac) * dt;
    if (tau0 === null || tau0 === undefined) tau0 = (place.rangeFt * Math.cos(across)) / Math.max(len3(e.vel), 1);
    byTime = Math.tanh(((tau - tau0) * st.V) / LIVE.rangeScaleFt);
  }
  const phaseShare = { lag: -1, pure: 0, lead: 1 }[e.cue?.mode] ?? 0;
  const shareWanted = inBubble ? -1
    : holding ? Math.min(0, byRange)
      : topPhase ? Math.max(-1, Math.min(1, phaseShare + byTime))
        : byRange;
  // The share itself moves no faster than a full swing in shareSec, so a press of Lead's or a change of phase eases in.
  const share = toward(ws.share ?? shareWanted, shareWanted, 2 / (topPhase ? LIVE.topShareSec : LIVE.shareSec));

  // ---- the offsets from Lead's path, eased: across on his side, inside (lead) or outside (lag) his turn, up for Terminate's slot ----
  // Out of Lead's plane (the vertical's lag): as far as he would come inside the bubble plus its margin and a little, in lookSec.
  const shortFt = FW_BAND.bubbleFt + 2 * LIVE.bubbleMarginFt - (rangeFt - closureFtps * LIVE.lookSec);
  // His 15° is off Lead's tail now (Patrick 4 Oct 22:28Z), but he is placed off Lead's path, which in a turn lies inside
  // Lead's tail line (a chord): the across offset from the path is turned by about a quarter of the heading Lead has turned
  // since that point (estimate: half, the chord's own angle, overshot to about 18°), so the picture is the same inside or
  // outside the turn. Read from the step he was abeam last step, near level only.
  let chordDeg = 0;
  if (ws.j !== null && levelish) {
    const nj = unit3(ctx.E(ws.j).vel);
    chordDeg = (-Math.atan2(dot3(nj, left), dot3(nj, nose)) / 4) / DEG * latFrac;
  }
  const acrossPath = (place.acrossDeg + chordDeg) * DEG;
  const target = {
    l: place.rangeFt * Math.sin(acrossPath), n: share * (share < 0 ? LIVE.lagShare : LIVE.cutShare) * place.rangeFt, u: place.alt,
    o: toSlot ? 0 : Math.max(0, Math.min(LIVE.wideMaxShare * place.rangeFt, LIVE.widePerFt * shortFt)),
  };
  const w = 2 / LIVE.aimSec; // critically damped, about aimSec to settle
  const off = { ...(ws.off ?? { l: target.l, n: target.n, u: target.u, o: target.o, vl: 0, vn: 0, vu: 0, vo: 0 }) };
  for (const k of ['l', 'n', 'u', 'o']) {
    const v = `v${k}`;
    off[v] += (w * w * (target[k] - off[k]) - 2 * w * off[v]) * dt;
    off[k] += off[v] * dt;
  }

  // ---- the aim: on Lead's own path (EFIG p.391), offset as above ----
  const kNow = ctx.k;
  // His frame along Lead's path, carried step to step without twist (each step's left is the last one squared to Lead's
  // new nose), and eased back to Lead's level left only as far as his nose is near the horizon: near the vertical the level
  // frame spins round the nose, which would throw #2 across the loop. Lead's turn is split into its sideways (lat) and
  // up-or-down (vert) parts in that frame, eased along his path (about insideSec) so his pull bends the inside offset in,
  // never as a kink. Kept per step of his path, oldest dropped.
  const trail = ws.trail ? new Map(ws.trail) : new Map();
  const per = 1 / (LIVE.turnFullG * G_FTPS2);
  const capped = (v) => { const m = len3(v); return m > 1 ? scale3(v, 1 / m) : v; };
  const trailAt = (j) => {
    if (trail.has(j)) return trail.get(j);
    const ej = ctx.E(j);
    const fj = frameOf(ej);
    const prev = trail.get(j - 1);
    let lj = fj.left;
    if (prev) {
      const carried = unit3(perp3(prev.left, fj.nose));
      const level = Math.min(1, (LIVE.relevelPerSec * dt) * (1 - fj.nose.z * fj.nose.z) ** 2);
      lj = unit3(perp3(add3(carried, scale3(sub3(fj.left, carried), level)), fj.nose));
    }
    const uj = cross3(fj.nose, lj);
    const raw = { lat: capped(scale3(lj, dot3(ej.accPerp, lj) * per)), vert: capped(scale3(uj, dot3(ej.accPerp, uj) * per)) };
    const f = Math.min(1, dt / LIVE.insideSec);
    const v = prev
      ? { left: lj, up: uj, nose: fj.nose, lat: add3(prev.lat, scale3(sub3(raw.lat, prev.lat), f)), vert: add3(prev.vert, scale3(sub3(raw.vert, prev.vert), f)) }
      : { left: lj, up: uj, nose: fj.nose, ...raw };
    trail.set(j, v);
    return v;
  };
  const keepSteps = Math.ceil(30 / dt);
  for (let j = Math.max(ctx.kMin, kNow - keepSteps); j <= kNow; j++) trailAt(j);
  for (const j of trail.keys()) if (j < kNow - keepSteps) trail.delete(j);
  // In the vertical: lead cuts inside Lead's turn (the short way down) and lag goes outside it, both as Lead's phase sets
  // them; to stay out of the bubble he moves out of Lead's plane, wider to his own side, rather than higher.
  const nVert = off.n * (off.n < 0 ? LIVE.vertLag : LIVE.vertLead);
  const pathAt = (j) => {
    const c = trailAt(j);
    let p = add3(add3(add3(add3(ctx.E(j).pos, scale3(c.left, off.l)), scale3(c.up, off.u)), scale3(c.lat, off.n)), scale3(c.vert, nVert));
    const vl = len3(c.vert);
    const tl = Math.min(1, vl + len3(c.lat));
    if (off.o > 0.5) {
      // Out of the plane of Lead's turn, to #2's side, as far as the turn is in the vertical; with Lead hardly turning (a
      // climb, a descent), straight out to his side.
      if (vl > 1e-3) {
        let o = unit3(cross3(c.nose, unit3(add3(c.lat, c.vert))));
        if (dot3(o, c.left) * side + 0.5 * dot3(o, c.up) < 0) o = scale3(o, -1);
        p = add3(p, scale3(o, off.o * vl / Math.max(vl + len3(c.lat), 1e-3) * Math.min(1, vl)));
      }
      p = add3(p, scale3(c.left, side * off.o * (1 - tl)));
    }
    return { p, nose: c.nose };
  };
  // Where he is along Lead's path: the step he is abeam, carried on from the last step.
  let j0 = Math.max(ctx.kMin, Math.min(kNow, ws.j ?? kNow - Math.round(rangeFt / Math.max(st.V, 1) / dt)));
  while (j0 < kNow && dot3(sub3(pw, ctx.E(j0 + 1).pos), unit3(ctx.E(j0 + 1).vel)) > 0) j0++;
  while (j0 > ctx.kMin && dot3(sub3(pw, ctx.E(j0).pos), unit3(ctx.E(j0).vel)) < 0) j0--;
  // The aim: the first point of the path at least L1 ahead of him (further when he is well off the path, so he cuts back at a
  // gentle angle); past Lead's present, on along his nose.
  const offPathFt = len3(sub3(pathAt(j0).p, pw));
  const l1 = Math.max(LIVE.l1MinFt, st.V * LIVE.l1Sec, offPathFt / Math.sin(LIVE.interceptDeg * DEG));
  let A = null;
  let prevP = pathAt(j0).p;
  for (let j = j0 + 1; j <= kNow; j++) {
    const q = pathAt(j).p;
    const dq = len3(sub3(q, pw));
    if (dq >= l1) {
      const dp = len3(sub3(prevP, pw));
      const u = Math.max(0, Math.min(1, (l1 - dp) / Math.max(dq - dp, 1e-6)));
      A = add3(prevP, scale3(sub3(q, prevP), u));
      break;
    }
    prevP = q;
  }
  if (!A) {
    const now = pathAt(kNow);
    const d = len3(sub3(now.p, pw));
    A = add3(now.p, scale3(now.nose, Math.max(0, l1 - d)));
  }

  // ---- the lift: core's pursuit lift at the path-following gain (2V over L1), then the caps ----
  const vHat = st.nose;
  const gain = (2 * st.V) / l1;
  let lift = liftTowardAim(vHat, sub3(A, pw), st.V, gain).wanted;
  const onUp = dot3(lift, st.bodyUp);
  if (onUp < LIVE.minG) {
    // No push: he unloads to 0.5 G and keeps his wings where they are, so a wish to push never becomes a roll toward what
    // little sideways pull is left (rolling upright over the top instead of pulling through).
    const side = sub3(lift, scale3(st.bodyUp, onUp));
    lift = add3(scale3(st.bodyUp, LIVE.minG), scale3(side, Math.max(0, onUp) / LIVE.minG));
  }
  const cap = Math.min(shakerG(st.kias), inBubble ? availableG(st.kias) : LIVE.normalG);
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

  // ---- the words ----
  let word = ws.word;
  if (word === 'pure') word = share > LIVE.wordShare.on ? 'lead' : share < -LIVE.wordShare.on ? 'lag' : 'pure';
  else if (Math.abs(share) < LIVE.wordShare.off || Math.sign(share) !== (word === 'lead' ? 1 : -1)) word = 'pure';
  const cue = toSlot ? 'back to fighting wing' : entering ? 'entry' : swapUntil > t ? 'swap' : word;

  // Terminate is over once he is in the fighting wing band and within 2 kt of Lead (spec section 9).
  const aspect = Math.abs(latDeg);
  const settled = toSlot && rangeFt >= FW_BAND.rangeFt[0] && rangeFt <= FW_BAND.rangeFt[1]
    && aspect >= FW_BAND.sweepDeg[0] && aspect <= FW_BAND.sweepDeg[1] && Math.abs(next.kias - e.st.kias) < LIVE.settleKt;

  return {
    ws: { ...ws, st: next, side, place, off, j: j0, tau0, topSwaps, outside, trail: [...trail], share, lastLatDeg: latDeg, swapUntil, word },
    pose,
    power,
    cue,
    rangeFt,
    settled,
  };
}
