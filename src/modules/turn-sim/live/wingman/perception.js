// What the close-formation and fighting-wing wingman sees and feels (B1, TS-226; B5, TS-233; spec 7b.3, 7e.2).
// Exports: seenOf, frameOf, bankOf, lineDeviation, placeDeviation, startPerception, aimAt, look, perceive,
// turnOf, rotate3, aheadOnTurn, startFwSight, seeFw.
// Imports: core/angles, core/units, core/t6-performance, live/flight, live/slots, live/wing-moves, live/attitude.
// Depended on by: live/wingman/close-formation.js, live/wingman/fighting-wing.js, tools/fw-rig.mjs, tools/formation-gauge.mjs.
//
// In close formation he watches the aircraft he flies off (Lead in the 2-ship; the one ahead in the 4-ship) and acts on the
// picture as it was 0.3 s ago (CLOSE_SEE.delaySec, TS-211). In fighting wing (B02, spec 7e.2, R1) one delay rule governs:
// he sees Lead 0.4 s late (FW_SEE.delaySec), dead-reckoned across 0.4 s along his seen turn (S01, S02) with bank carried
// across 0.4 s by seen roll rate (S04, 0.2 s) capped at ±70° (S03, D3), turn rate (S05) and circle (S07) from extrapolated
// bank and speed (S06), and seen G smoothed over 0.15 s (S05b, D22); his own state (S08-S12) is known now, and slant range
// (S13), velocity-projected slant closure (S14, D11, no 1 s smoother), LOS rate (S15), aspect/HCA/sweep (S16), and height
// (S17) are computed from dead-reckoned Lead and current #2.
//
// Frames and signs (spec 7b.8): feet, seconds, degrees, G; x east, y north, z up. Bank and roll rate left wing down
// positive. The memory is never changed in place. Numbers: wing-moves.js CLOSE_SEE and FW_SEE.
import { DEG } from '../../../../core/angles.js';
import { G_FTPS2, KT_TO_FTPS } from '../../../../core/units.js';
import { tasToIasKt } from '../../../../core/t6-performance.js';
import { STEP_SEC } from '../flight.js';
import { LINE_BACK_PER_OUT, WINGSPAN_FT, LENGTH_FT } from '../slots.js';
import { CLOSE_SEE, FW_SEE } from '../wing-moves.js';
import { sub3, dot3, cross3, unit3, perp3, scale3, add3, len3 } from '../attitude.js';

const Z = Object.freeze({ x: 0, y: 0, z: 1 });
const AXES = Object.freeze(['plane', 'line', 'along']);

/** How many steps late he sees (0.3 s at 0.05 s steps: 6). */
const LATE = Math.round(CLOSE_SEE.delaySec / STEP_SEC);
/** The memory holds the seen moment and the two before it (for the rates and the roll's build-up), and everything since. */
const KEEP = LATE + 3;

/** A first-order smoothing over CLOSE_SEE.filterSec, one step. */
const smooth = (y, x) => y + (x - y) * Math.min(1, STEP_SEC / CLOSE_SEE.filterSec);

/** An aircraft as he sees it: position, velocity and body up only (a point-mass state from fluid-lead.js stepLead or leadStateOf). */
export function seenOf(st) {
  return { p: { x: st.pm.x, y: st.pm.y, z: st.pm.z }, v: { ...st.vel }, up: { ...st.bodyUp } };
}

/** An aircraft's frame from its velocity and body up: { nose, up, left }, unit vectors. */
export function frameOf(s) {
  const nose = unit3(s.v);
  const up = unit3(perp3(s.up, nose));
  return { nose, up, left: cross3(up, nose) };
}

/** A body up's bank about a nose, degrees, left wing down positive (against the level up square to the nose). */
export function bankOf(nose, up) {
  const lvlUp = unit3(perp3(Z, nose));
  const lvlLeft = cross3(lvlUp, nose);
  return Math.atan2(dot3(up, lvlLeft), dot3(up, lvlUp)) / DEG;
}

/**
 * The deviation from a close place on the three axes (spec 7b.3), from where he is in the other aircraft's frame
 * rel { fwd, left, up } (feet). place { fwd, left, alt } (slots.js); side +1 left of it, -1 right. Returns { plane, line,
 * along }: off the wing plane (+ above), off the spinner-to-wingtip line (+ ahead of it, toward the nose) and along it
 * (+ out, away from the aircraft). The line runs LINE_BACK_PER_OUT back for every foot out (slots.js).
 */
export function lineDeviation(rel, place, side) {
  const fwd = rel.fwd - place.fwd;
  const left = rel.left - place.left;
  const n = Math.hypot(1, LINE_BACK_PER_OUT);
  return {
    plane: rel.up - place.alt,
    line: (fwd + side * LINE_BACK_PER_OUT * left) / n,
    along: (-LINE_BACK_PER_OUT * fwd + side * left) / n,
  };
}

/** Where `own` sits in the frame f of the aircraft at `ref` (seen moments): { fwd, left, up }, feet. */
function relIn(f, ref, own) {
  const r = sub3(own.p, ref.p);
  return { fwd: dot3(r, f.nose), left: dot3(r, f.left), up: dot3(r, f.up) };
}

/** The deviation from his place of `own` off `ref` (seenOf's moments, at the same time): lineDeviation in ref's frame. */
export function placeDeviation(ref, own, place, side) {
  return lineDeviation(relIn(frameOf(ref), ref, own), place, side);
}

/**
 * A seen moment k steps before one with velocity v and acceleration acc (ft/s², or none), dead-reckoned back; its body
 * up held (the start knows no roll before it).
 */
function backOf(s, k, acc) {
  const t = -k * STEP_SEC;
  const a = acc ?? { x: 0, y: 0, z: 0 };
  return {
    p: add3(add3(s.p, scale3(s.v, t)), scale3(a, (t * t) / 2)),
    v: add3(s.v, scale3(a, t)),
    up: s.up,
  };
}

/**
 * His perception at the start (bumpless, spec 7b.6d item 2): the memory filled with the 0.3 s before now, dead-reckoned
 * back from the motion each has (ref and own: seenOf's; refAcc, ownAcc: their accelerations when known, ft/s², as the
 * tracker hands them over, kinematic.js handOverAt), and the smoothed rates started on the rates that motion gives, so
 * the first step reads the picture as it is moving, not as if it had just jumped. place: his place (slots.js); side: his side.
 */
export function startPerception(ref, own, { place, side, refAcc = null, ownAcc = null }) {
  const buf = [];
  for (let k = KEEP - 1; k >= 0; k--) buf.push({ ref: backOf(ref, k, refAcc), own: backOf(own, k, ownAcc) });
  const mem = { buf, place, side, filt: null };
  return { ...mem, filt: { ...rawRead(mem).raw, gRate: 0 } };
}

/** The raw readings of the seen moment (LATE steps back) against the one and two before it. */
function rawRead(mem) {
  const { buf, place, side } = mem;
  const i = buf.length - 1 - LATE;
  const at = (j) => {
    const s = buf[j];
    const f = frameOf(s.ref);
    return { s, f, dev: placeDeviation(s.ref, s.own, place, side), bank: bankOf(f.nose, f.up) };
  };
  const [a0, a1, a2] = [at(i), at(i - 1), at(i - 2)];
  const wrap = (d) => ((d + 540) % 360) - 180;
  const roll0 = wrap(a0.bank - a1.bank) / STEP_SEC;
  const roll1 = wrap(a1.bank - a2.bank) / STEP_SEC;
  // Its G: the lift's share along its body up, from how its velocity turned (the step before the seen moment).
  const acc = scale3(sub3(a0.s.ref.v, a1.s.ref.v), 1 / STEP_SEC);
  const g = dot3(add3(acc, scale3(Z, G_FTPS2)), a0.f.up) / G_FTPS2;
  const rate = Object.fromEntries(AXES.map((ax) => [ax, (a0.dev[ax] - a1.dev[ax]) / STEP_SEC]));
  // Its turning as a whole (B2): the angular velocity of its frame, from how its nose, left and up moved over the step
  // (omega = 1/2 sum e x de/dt, rad/s, world axes), and how that changed (rad/s²). Rolling, it is the roll about the nose;
  // in a steady turn, the turn rate about the vertical; in the roll-in, both, with the turn rate building.
  const w0 = spinOf(a1.f, a0.f);
  const w1 = spinOf(a2.f, a1.f);
  return { now: a0, raw: { rate, roll: roll0, rollAcc: (roll0 - roll1) / STEP_SEC, g, spin: w0, spinAcc: scale3(sub3(w0, w1), 1 / STEP_SEC) } };
}

/** The angular velocity (rad/s, world axes) that turns frame f1 into f2 over one step: 1/2 sum of e x de/dt. */
function spinOf(f1, f2) {
  let w = { x: 0, y: 0, z: 0 };
  for (const k of ['nose', 'left', 'up']) w = add3(w, cross3(f1[k], scale3(sub3(f2[k], f1[k]), 1 / STEP_SEC)));
  return scale3(w, 0.5);
}

/** A vector smoothed as smooth() smooths a number, axis by axis. */
const smooth3 = (y, x) => ({ x: smooth(y.x, x.x), y: smooth(y.y, x.y), z: smooth(y.z, x.z) });

/**
 * What he sees from a memory: the moment LATE steps ago and the smoothed readings. seen = { dev, rate (ft/s), bankDeg,
 * rollDps, rollAccDps2, bankAheadDeg, g, climbFtps (the other aircraft's), ffUpG, ffLeftG, ffForeFtps2, placeFwdFtps,
 * placeClimbFtps, under, frame, rel }. ffUpG and ffLeftG: his place's acceleration from the roll and the turn, along the
 * lift line and the wing line (left +), in G; ffForeFtps2 along the nose; placeFwdFtps and placeClimbFtps: his place's
 * speed beyond the aircraft's own, along its nose and upward.
 */
function seeWith(mem, now, filt) {
  const T = CLOSE_SEE.aheadSec;
  // His place's motion as the other aircraft rolls and turns (rigid-body kinematics, B2): his place is fixed in its frame,
  // so with the frame turning at omega and omega changing at alpha it moves at omega x r and accelerates at alpha x r +
  // omega x (omega x r) beyond the aircraft's own motion (r: the place's offset). Rolling, that is the swing about the nose
  // (B1); in the turn, the wider or tighter circle and the speed that goes with it; in the roll-in, the turn rate building.
  const f = now.f;
  const pl = mem.place;
  const r = add3(add3(scale3(f.nose, pl.fwd), scale3(f.left, pl.left)), scale3(f.up, pl.alt));
  const vPlace = cross3(filt.spin, r);
  const aPlace = add3(cross3(filt.spinAcc, r), cross3(filt.spin, vPlace));
  const rel = relIn(now.f, now.s.ref, now.s.own);
  return {
    dev: now.dev,
    rate: filt.rate,
    bankDeg: now.bank,
    rollDps: filt.roll,
    rollAccDps2: filt.rollAcc,
    bankAheadDeg: now.bank + filt.roll * T + 0.5 * filt.rollAcc * T * T,
    g: filt.g,
    // Its G dead-reckoned across his delay, as its bank is (B2): pulling as it rolls (TS-227) its G builds about 0.25 G/s
    // in a 60° roll-in, and read 0.3 s late that left him short by about 0.08 G for 2 s, 4 to 5 ft below the plane. (Read
    // instead off the dead-reckoned bank as a level turn's 1/cos bank, the 60° turn away settled in 12 s, not 4: kept this.)
    gAhead: filt.g + filt.gRate * T,
    climbFtps: now.s.ref.v.z,
    ffUpG: dot3(aPlace, f.up) / G_FTPS2,
    ffLeftG: dot3(aPlace, f.left) / G_FTPS2,
    // The speed his place needs beyond the other aircraft's (the wider or tighter circle), and how fast that is changing:
    // zero in a steady turn, building as the turn builds and easing as it eases (the power lead, spec 7b.5). Read as a
    // speed, not as the acceleration along the other aircraft's nose, which a place behind it would see as a false speed-up.
    ffForeFtps2: filt.placeAcc ?? 0,
    placeFwdFtps: len3(add3(now.s.ref.v, vPlace)) - len3(now.s.ref.v),
    placeClimbFtps: vPlace.z,
    under: rel.up < 0 && Math.abs(rel.left) < WINGSPAN_FT / 2 && rel.fwd > -LENGTH_FT,
    frame: now.f,
    rel,
  };
}

/**
 * The memory aiming at another place (B3: the next place of a change, or a guarded one, supervisor.js), on the axes of
 * `side`: every remembered moment is read against it, so the rates (the picture moving) carry on unchanged; a change of
 * side turns the smoothed rates onto the new side's axes (line and along are the spinner-to-wingtip line's, mirrored).
 */
export function aimAt(mem, place, side) {
  if (side === mem.side || !mem.filt) return { ...mem, place, side };
  const k = LINE_BACK_PER_OUT;
  const n = Math.hypot(1, k);
  const r = mem.filt.rate;
  const fwd = (r.line - k * r.along) / n;
  const left = (mem.side * (k * r.line + r.along)) / n;
  const rate = { plane: r.plane, line: (fwd + side * k * left) / n, along: (-k * fwd + side * left) / n };
  return { ...mem, place, side, filt: { ...mem.filt, rate } };
}

/** What he sees from the memory as it stands (the start's first look), adding nothing. */
export function look(mem) {
  return seeWith(mem, rawRead(mem).now, mem.filt);
}

/**
 * One step of what he sees: the memory with this step's moment added (ref, own: seenOf's, at the same time), and what he
 * saw LATE steps ago (seeWith). Returns { mem, seen }.
 */
export function perceive(mem, ref, own) {
  const buf = [...mem.buf.slice(1 - KEEP), { ref, own }];
  const { now, raw } = rawRead({ ...mem, buf });
  const f0 = mem.filt;
  const filt = {
    rate: Object.fromEntries(AXES.map((ax) => [ax, smooth(f0.rate[ax], raw.rate[ax])])),
    roll: smooth(f0.roll, raw.roll),
    rollAcc: smooth(f0.rollAcc, raw.rollAcc),
    g: smooth(f0.g, raw.g),
    gRate: smooth(f0.gRate ?? 0, (smooth(f0.g, raw.g) - f0.g) / STEP_SEC),
    spin: smooth3(f0.spin, raw.spin),
    spinAcc: smooth3(f0.spinAcc, raw.spinAcc),
  };
  const dv = seeWith({ ...mem, buf, filt }, now, filt).placeFwdFtps;
  const filt2 = { ...filt, placeDv: dv, placeAcc: smooth(f0.placeAcc ?? 0, (dv - (f0.placeDv ?? dv)) / STEP_SEC) };
  const next = { ...mem, buf, filt: filt2 };
  return { mem: next, seen: seeWith(next, now, filt2) };
}

// ---- fighting wing: what he sees of Lead (B5, TS-233; spec 7e.2, B02, R1) --------------------------------------------------
//
// Fighting wing reads a picture from what eyes give of Lead (position, velocity and body up, TS-211) as it was
// FW_SEE.delaySec ago (0.4 s, Patrick 14 Oct 2026; close formation keeps its 0.3 s), carried across 0.4 s along his seen
// turn while #2's own state is known now (one delay rule, R1):
//  - Lead position and velocity dead-reckoned 0.4 s along his seen turn (S01, S02; Fable F5);
//  - Lead roll rate from seen bank smoothed over 0.2 s (S04), and bank carried 0.4 s ahead capped at ±70° (S03, D3);
//  - Lead G from seen velocity change along body up, smoothed over 0.15 s (S05b, D22; exposed for B13 G cap);
//  - Lead turn rate (S05), indicated airspeed (S06), and 3D turn circle (S07) from extrapolated bank and true airspeed;
//  - slant range (S13), velocity-projected slant closure (+ closing, S14, D11; no 1 s smoother), line-of-sight rate (S15,
//    0.5 s), aspect/HCA/sweep (S16), and height against Lead (S17) from dead-reckoned Lead and current #2.
// The memory is never changed in place. Numbers: wing-moves.js FW_SEE.

// (FW_SEE.extraDelaySec: a delay he does not know he has, for the delay sweep; 0 in flying)
const FW_LATE = Math.round((FW_SEE.delaySec + (FW_SEE.extraDelaySec ?? 0)) / STEP_SEC);
const ease = (y, x, sec) => y + (x - y) * Math.min(1, STEP_SEC / sec);
const ease3 = (y, x, sec) => ({ x: ease(y.x, x.x, sec), y: ease(y.y, x.y, sec), z: ease(y.z, x.z, sec) });
const angleDeg = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot3(unit3(a), unit3(b))))) / DEG;
const wrapDeg = (d) => ((d + 540) % 360) - 180;

/**
 * An aircraft's turn as seen (s: a seen moment; g: its G): { aPerp (ft/s², the turning acceleration square to its path:
 * its lift less its weight), omega (rad/s, the turn's axis times its rate), rateDps, radiusFt, centre }. Standard
 * kinematics: the turn rate is the path's acceleration over its speed.
 */
export function turnOf(s, g) {
  const nose = unit3(s.v);
  const aPerp = perp3(sub3(scale3(unit3(perp3(s.up, nose)), g * G_FTPS2), scale3(Z, G_FTPS2)), nose);
  const v2 = dot3(s.v, s.v);
  const omega = scale3(cross3(s.v, aPerp), 1 / Math.max(v2, 1));
  const a = len3(aPerp);
  const radiusFt = a > 1e-6 ? v2 / a : Infinity;
  return { aPerp, omega, rateDps: len3(omega) / DEG, radiusFt, centre: a > 1e-6 ? add3(s.p, scale3(unit3(aPerp), radiusFt)) : null };
}

/** A vector turned about a unit axis by an angle (rad), right-handed (Rodrigues' rotation; standard kinematics). */
export function rotate3(v, axis, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return add3(add3(scale3(v, c), scale3(cross3(axis, v), s)), scale3(axis, dot3(axis, v) * (1 - c)));
}

/**
 * An aircraft seen at a moment (s: seenOf's) carried sec ahead round the turn it is making (turn: turnOf's), its position
 * and velocity both, as a wingman's eye carries Lead across his own delay (Fable F5, the second review: it recovers about
 * 7° of phase at the steering's 0.3 rad/s). Straight on when it is not turning. Returns { p, v }.
 */
export function aheadOnTurn(s, turn, sec) {
  const w = len3(turn.omega);
  if (!turn.centre || w < 1e-6) return { p: add3(s.p, scale3(s.v, sec)), v: s.v };
  const axis = scale3(turn.omega, 1 / w);
  const ang = w * sec;
  return { p: add3(turn.centre, rotate3(sub3(s.p, turn.centre), axis, ang)), v: rotate3(s.v, axis, ang) };
}

/** Seen moment k steps before s along turn (or straight back when not turning), for bumpless start in a turn. */
function backOnTurn(s, turn, k) {
  const sec = -k * STEP_SEC;
  const w = len3(turn.omega);
  if (!turn.centre || w < 1e-6) return backOf(s, k, null);
  const axis = scale3(turn.omega, 1 / w);
  const ang = w * sec;
  return {
    p: add3(turn.centre, rotate3(sub3(s.p, turn.centre), axis, ang)),
    v: rotate3(s.v, axis, ang),
    up: rotate3(s.up, axis, ang),
  };
}

/**
 * Carry seen Lead (ref0 at t - delaySec) across FW_SEE.delaySec along his seen turn (S01, S02) and bank-extrapolate
 * his attitude to leadBankDeg (S03, D3) so turnOf gives the extrapolated turn rate (S05) and circle (S07).
 */
function aheadLead(ref0, filtG, b0, leadBankDeg) {
  const turn0 = turnOf(ref0, filtG);
  const dr = aheadOnTurn(ref0, turn0, FW_SEE.delaySec);
  const w = len3(turn0.omega);
  const upRot = turn0.centre && w >= 1e-6
    ? rotate3(ref0.up, scale3(turn0.omega, 1 / w), w * FW_SEE.delaySec)
    : ref0.up;
  const nose = unit3(dr.v);
  const bRot = bankOf(nose, upRot);
  const up = Math.abs(leadBankDeg - bRot) > 1e-9
    ? rotate3(upRot, scale3(nose, -1), (leadBankDeg - bRot) * DEG)
    : upRot;
  const lead = { p: dr.p, v: dr.v, up };
  const c0 = Math.cos(b0 * DEG);
  const c1 = Math.cos(leadBankDeg * DEG);
  const gTurn = c0 > 0.34 && c1 > 0.34 ? (filtG * c0) / c1 : filtG;
  return { lead, turn: turnOf(lead, gTurn) };
}

/** The picture from ref (Lead, dead-reckoned across 0.4 s) and own (#2, now; or both delayed in analysis picture mode). */
function fwRaw(ref, own) {
  const r = sub3(own.p, ref.p);
  const slant = len3(r);
  const f = frameOf(ref);
  const rel = { fwd: dot3(r, f.nose), left: dot3(r, f.left), up: dot3(r, f.up) };
  // His side of Lead's path, level (B5 T29: the cone's sides are left and right of Lead's path, whatever Lead's bank)
  const levelLeft = unit3(cross3(Z, f.nose));
  const levelLeftFt = dot3(r, levelLeft);
  return {
    levelLeftFt,
    levelSide: Math.sign(levelLeftFt) || -1,
    slant,
    los: scale3(r, -1 / Math.max(slant, 1e-6)), // from him to Lead
    aspectDeg: angleDeg(scale3(ref.v, -1), r),
    hcaDeg: angleDeg(ref.v, own.v),
    sweepDeg: Math.atan2(-rel.fwd, Math.abs(rel.left)) / DEG,
    side: Math.sign(rel.left) || -1,
    heightFt: r.z,
    rel,
    leadBankDeg: bankOf(f.nose, f.up),
  };
}

/**
 * His fighting wing sight at the start (bumpless, as startPerception): the memory filled with the moments before now,
 * dead-reckoned back from the motion each has, the smoothed readings started on the picture as it is. ref, own: seenOf's;
 * refAcc, ownAcc: their accelerations (ft/s²) when known; g: Lead's G now (else 1).
 */
export function startFwSight(ref, own, { refAcc = null, ownAcc = null, g = 1, extraSec = 0, picture = false } = {}) {
  // extraSec / picture: analysis only (the gauge's --extra-delay and --delay-mode, fighting-wing.js setFwAnalysis)
  const late = extraSec ? Math.round((FW_SEE.delaySec + (FW_SEE.extraDelaySec ?? 0) + extraSec) / STEP_SEC) : FW_LATE;
  const turnInit = turnOf(ref, g);
  const buf = [];
  for (let k = late + 2; k >= 0; k--) {
    buf.push({
      ref: refAcc ? backOf(ref, k, refAcc) : backOnTurn(ref, turnInit, k),
      own: backOf(own, k, ownAcc),
    });
  }
  const s0 = buf[buf.length - 1 - late];
  const f0Ref = frameOf(s0.ref);
  const b0 = bankOf(f0Ref.nose, f0Ref.up);
  const lead0 = picture ? s0.ref : aheadLead(s0.ref, g, b0, b0).lead;
  const own0 = picture ? s0.own : own;
  const raw = fwRaw(lead0, own0);
  return {
    buf,
    filt: { roll: 0, losRate: { x: 0, y: 0, z: 0 }, g, los: raw.los },
    ...(extraSec ? { late } : {}),
    ...(picture ? { picture: true } : {}),
  };
}

/**
 * One step of his fighting wing sight (B02, S01-S17): the memory with this step's moment added (ref, own: seenOf's, at the
 * same time) and the one-delay picture (Lead 0.4 s late dead-reckoned across 0.4 s; #2's own state now unless analysis
 * picture mode is active). Returns { mem, seen }: seen = { slant, closure, los, losRate (rad/s vector), losDps, aspectDeg,
 * hcaDeg, sweepDeg, side, heightFt, rel, lead (dead-reckoned Lead, S01/S02), own (#2 now, S08), leadBankDeg (S03),
 * leadRollDps (S04), leadG (S05b), leadKias (S06), turn (turnOf, S05/S07) }.
 */
export function seeFw(mem, ref, own) {
  const late = mem.late ?? FW_LATE; // FW_LATE in flying (mem.late: the analysis's extra delay)
  const buf = [...mem.buf.slice(1 - (late + 3)), { ref, own }];
  const i = buf.length - 1 - late;
  const s0 = buf[i];
  const s1 = buf[i - 1];
  const f0Ref = frameOf(s0.ref);
  const f1Ref = frameOf(s1.ref);
  const b0 = bankOf(f0Ref.nose, f0Ref.up);
  const b1 = bankOf(f1Ref.nose, f1Ref.up);
  const rollRaw = wrapDeg(b0 - b1) / STEP_SEC;
  // Lead's G (S05b, D22): lift's share along his body up from how his velocity turned over the step before the seen moment.
  const acc = scale3(sub3(s0.ref.v, s1.ref.v), 1 / STEP_SEC);
  const gRaw = dot3(add3(acc, scale3(Z, G_FTPS2)), f0Ref.up) / G_FTPS2;
  const f0 = mem.filt;
  const roll = ease(f0.roll ?? 0, rollRaw, FW_SEE.rollSec);
  const g = ease(f0.g, gRaw, FW_SEE.gSec);
  // Bank carry-on across 0.4 s (D3, S03), capped at ±max(|b0|, bankCarryMaxDeg) so steeply banked turns do not clip downward.
  const bCap = Math.max(Math.abs(b0), FW_SEE.bankCarryMaxDeg);
  const leadBankDeg = mem.picture ? b0 : Math.max(-bCap, Math.min(bCap, b0 + roll * FW_SEE.delaySec));
  const { lead, turn } = mem.picture ? { lead: s0.ref, turn: turnOf(s0.ref, g) } : aheadLead(s0.ref, g, b0, leadBankDeg);
  const ownUsed = mem.picture ? s0.own : own;
  const raw = fwRaw(lead, ownUsed);
  // Slant closure (S14, D11): direct velocity projection onto the line of sight (+ closing), no 1 s smoother.
  const closure = dot3(sub3(ownUsed.v, lead.v), raw.los);
  const losRateRaw = scale3(cross3(f0.los, sub3(raw.los, f0.los)), 1 / STEP_SEC);
  const losRate = ease3(f0.losRate, losRateRaw, FW_SEE.losSec);
  const filt = { roll, losRate, g, los: raw.los };
  const next = { buf, filt, ...(mem.late ? { late: mem.late } : {}), ...(mem.picture ? { picture: true } : {}) };
  const seen = {
    ...raw,
    leadBankDeg,
    leadRollDps: roll,
    leadKias: tasToIasKt(len3(lead.v) / KT_TO_FTPS, lead.p.z),
    closure,
    losRate,
    losDps: len3(losRate) / DEG,
    lead,
    own: ownUsed,
    leadG: g,
    turn,
  };
  return { mem: next, seen };
}
