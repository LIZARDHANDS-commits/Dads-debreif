// What the close-formation wingman sees and feels (B1, TS-226; spec 7b.3, 7b.6d items 4, 5, 8 and 12). He watches the
// aircraft he flies off (Lead in the 2-ship; the one ahead later, for the 4-ship) and acts on the picture as it was about
// 0.3 s ago (TS-211). Of that aircraft he reads only what eyes give: its position, its velocity and which way its body up
// points, over the last 0.3 s, never its roll rate, roll acceleration, plan or G (TS-211, the audit's item 4). From those:
//
//  - its frame: nose along its velocity, up its body up, left the third (from velocity and body up, not heading and bank,
//    so climbs and descents are exact, 7b.6d item 8);
//  - his deviation from his place (slots.js, the place the SMM's references give) on the three axes he corrects on
//    (Patrick's plane, line, hinge, 7b.3): off its wing plane, off the spinner-to-wingtip line in that plane, and along
//    the line; and how fast each is changing (the picture moving), lightly smoothed;
//  - its bank, roll rate and roll build-up, read from the bank he saw over the last moments; its bank dead-reckoned across
//    his 0.3 s (7b.6d item 5);
//  - its G, read from how its velocity turned (the lift's share along its body up);
//  - his place's motion as it rolls (7b.6d item 4): his place is fixed in its frame, so a roll swings it along the lift
//    line by the place's offset times the roll's build-up, and pulls it in across the wing line by the offset times the
//    roll rate squared (rigid-body kinematics). This is the pitch feed-forward: in a telegraphed 45° roll-in his place 43 ft
//    out accelerates at about 0.14 G while Lead's own G barely moves;
//  - whether he is under it: below its wing plane and inside its wingtip (7b.6d item 12).
// What he feels now (his own G and throttle) is his own aircraft's, not delayed: the caller reads it from his state.
//
// Frames and signs (spec 7b.8): feet, seconds, degrees, G; x east, y north, z up. Bank and roll rate left wing down
// positive (the Turn Sim's way; the point mass's own bank is the other way). Off the plane + above the wing plane, off the
// line + ahead of it, along the line + out away from the aircraft he flies off. His place { fwd, left, alt } is in its
// frame, left positive (slots.js).
//
// The memory is never changed in place: perceive() returns a new one. Every number is in wing-moves.js CLOSE_SEE.
import { DEG } from '../../../../core/angles.js';
import { G_FTPS2 } from '../../../../core/units.js';
import { STEP_SEC } from '../flight.js';
import { LINE_BACK_PER_OUT, WINGSPAN_FT } from '../slots.js';
import { CLOSE_SEE } from '../wing-moves.js';
import { sub3, dot3, cross3, unit3, perp3, scale3, add3 } from '../attitude.js';

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
  return { ...mem, filt: rawRead(mem).raw };
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
  return { now: a0, raw: { rate, roll: roll0, rollAcc: (roll0 - roll1) / STEP_SEC, g } };
}

/**
 * What he sees from a memory: the moment LATE steps ago and the smoothed readings. seen = { dev, rate (ft/s), bankDeg,
 * rollDps, rollAccDps2, bankAheadDeg, g, climbFtps (the other aircraft's), ffUpG, ffLeftG, under, frame, rel }. ffUpG and
 * ffLeftG: his place's acceleration from the roll, along the lift line and the wing line (left +), in G.
 */
function seeWith(mem, now, filt) {
  const T = CLOSE_SEE.aheadSec;
  // His place swung by the roll (rigid-body kinematics about the nose; p, ṗ in rad/s and rad/s², left wing down positive):
  // along the lift line -ṗ·left - p²·up, along the wing line ṗ·up - p²·left (the place's left and up offsets).
  const p = filt.roll * DEG;
  const pd = filt.rollAcc * DEG;
  const L = mem.place.left;
  const U = mem.place.alt;
  const rel = relIn(now.f, now.s.ref, now.s.own);
  return {
    dev: now.dev,
    rate: filt.rate,
    bankDeg: now.bank,
    rollDps: filt.roll,
    rollAccDps2: filt.rollAcc,
    bankAheadDeg: now.bank + filt.roll * T + 0.5 * filt.rollAcc * T * T,
    g: filt.g,
    climbFtps: now.s.ref.v.z,
    ffUpG: (-pd * L - p * p * U) / G_FTPS2,
    ffLeftG: (pd * U - p * p * L) / G_FTPS2,
    under: rel.up < 0 && Math.abs(rel.left) < WINGSPAN_FT / 2,
    frame: now.f,
    rel,
  };
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
  };
  const next = { ...mem, buf, filt };
  return { mem: next, seen: seeWith(next, now, filt) };
}
