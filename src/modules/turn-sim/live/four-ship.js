// The 4-ship (Spread 4) for the Turn Sim's live mode: the start picture, the
// manoeuvre list and the planners that differ from the 2-ship's. Everything else
// (flying a programme, the step, the screen) is the 2-ship's code, unchanged.
//
// Sources (the briefs and the SMM, page references only):
//  - Spread 4 is four-plane line abreast: #2 and #3 fly LAB off Lead, #4 flies LAB
//    off #3 (SMM 16.42 paras 113, 116, Fig 16.33), so the line is Lead, #2, #3, #4
//    side by side with one LAB gap between neighbours; the SMM puts the whole line at
//    12,000 to 18,000 ft (three gaps of 4,000 to 6,000 ft, Fig 16.33).
//  - Start on the wide side, 6,000 ft (AFM7 brief p.15, AFM8 brief p.15).
//  - Altitude stack, low to high 4, 3, 1, 2 in 300 ft steps: #2 +300, Lead 0, #3 -300,
//    #4 -600 (AFM8 brief p.14 picture and p.15; "maintain stack while the formation is
//    turning", AFM8 brief p.14). The SMM's example puts #2 below Lead and #3 and #4
//    above (Fig 16.33: "#2 will set the stack, #3 and #4 move to the opposite block"):
//    the brief's picture is used as the default, the same on either side (working answer).
//  - Manoeuvres: delayed 90, delayed 45 and hook are the three in the briefs
//    (AFM8 brief p.13 "Spread 4 manoeuvring (90, hook, 45)", p.17-18); the SMM also
//    approves in-place and check turns (SMM 16.43 para 118). Shackle and cross turn are
//    not approved in Spread 4, so the four-ship has no such buttons.
//  - Delayed turns: the outside aircraft turns first and each next aircraft turns in
//    its turn (AFM8 brief p.17, SMM Fig 16.34; order #2, Lead, #3, #4 for a right turn,
//    #4, #3, Lead, #2 for a left turn with #2 on Lead's left).
//  - Delayed 45: #2 turns 45, then every other aircraft checks 10 to 15 degrees toward
//    the aircraft ahead of it in the chain and turns 45 (AFM8 brief p.18, SMM Fig 16.34).
//    A Setup toggle (Patrick, 4 Oct 11:28Z) flies it without the check, as a plain chain.
//  - Hook: all four turn 180 at 70/3 together (AFM8 brief p.18, SMM 16.45 para 121).
import { makeAircraft } from './flight.js';
import { planManoeuvre, relativeTo, dryRun, exactWaitSec, turnSeg, wholeDegree, unit, dot, onStep, DEG, TURN_BANK_DEG, MANOEUVRES } from './manoeuvres.js';

/** Heights above the formation's block, feet, by aircraft id (AFM8 brief p.14-15: low to high 4, 3, 1, 2; 300 ft stacks). */
export const STACK_FT = Object.freeze({ 1: 0, 2: 300, 3: -300, 4: -600 });

/** The buttons in the four-ship, in screen order (briefs p.17-18; SMM 16.43 para 118). */
export const FOUR_SHIP_KEYS = Object.freeze(['delayed90', 'delayed45', 'check', 'inPlace90', 'hook']);

/**
 * The delayed 45's check turn: 10 to 15 degrees toward the aircraft ahead in the chain
 * (AFM8 brief p.18). The low end is flown: the S-curve costs the pair a little lateral
 * room and a smaller check costs less. Working answer, Patrick to confirm.
 */
export const CHECK_TURN_DEG = 10;

/** A line abreast pair for the plain delayed-45 chain: further out of line than this and the check turn is left out. */
const ABREAST_FT = 250;

/** Names by id, for the screen and the notes. */
const NAMES = Object.freeze({ 1: 'Lead', 2: '#2', 3: '#3', 4: '#4' });

/**
 * The four aircraft at the start: Lead on the line's origin, the others side by side at
 * one spacing each (SMM Fig 16.33), each with the aircraft it flies off (`ref`), on the
 * brief's altitude stack. With #2 on Lead's right the line reads #4 #3 Lead #2 from behind
 * (SMM Fig 16.33 "West", Patrick's TS-44); with #2 on the left it reads #2 Lead #3 #4 (Fig 16.33 "East",
 * AFM8 brief p.14).
 * @param {{ spacingFt: number, wingSide: 'right' | 'left', headingRad: number, kias: number, tasFtps: number }} o
 */
export function fourShipStart({ spacingFt, wingSide, headingRad, kias, tasFtps }) {
  const side = wingSide === 'left' ? 1 : -1; // +1 is left of Lead
  const left = { x: Math.cos(headingRad + Math.PI / 2), y: Math.sin(headingRad + Math.PI / 2) };
  // How many spacings left of Lead (negative is right), and who each flies off.
  const slots = [
    { id: 1, gaps: 0, ref: null },
    { id: 2, gaps: side, ref: 1 },
    { id: 3, gaps: -side, ref: 1 },
    { id: 4, gaps: -2 * side, ref: 3 },
  ];
  return slots.map(({ id, gaps, ref }) => ({
    ...makeAircraft({ id, xFt: left.x * gaps * spacingFt, yFt: left.y * gaps * spacingFt, headingRad, kias, tasFtps }),
    altAboveFt: STACK_FT[id],
    ref,
    name: NAMES[id],
  }));
}

/** The four-ship's fixed line under Setup. */
export function fourShipLine() {
  return 'Spread 4: LAB spacing between neighbours · stack #2 +300, Lead 0, #3 −300, #4 −600 ft (AFM8 brief p.14)';
}

const nameOf = (a) => a.name ?? NAMES[a.id] ?? `#${a.id}`;

/**
 * Delayed 90 or 45 for the whole line (AFM8 brief p.17-18, SMM Fig 16.34). The line is
 * ordered outside of the turn first, and each aircraft waits for the one before it in the
 * order: exactly the 2-ship's wait (exactWaitSec, SMM 16.19 paras 52-57) from the aircraft
 * ahead of it in the order, so each rolls out abeam of the one before and the whole line
 * rolls out in line abreast on the new heading with sides swapped.
 *
 * With `withCheck` (the delayed 45) the aircraft after the first also check toward the
 * aircraft ahead of them, then turn: a different path from the first's, so its wait is
 * worked from a dry run of each programme (the `extraAlongFt` of exactWaitSec).
 */
function delayedChain(aircraft, m, dir, t0, withCheck) {
  const lead = aircraft[0];
  const h0 = lead.headingRad;
  const h1 = wholeDegree(h0 + dir * m.turnDeg * DEG);
  const hCheck = wholeDegree(h0 - dir * CHECK_TURN_DEG * DEG); // toward the outside, the way the aircraft ahead came from
  const v = lead.tasFtps;
  const u0 = unit(h0);
  const turn = () => [turnSeg(h1, dir, TURN_BANK_DEG)];
  const withChecks = () => [turnSeg(hCheck, -dir, TURN_BANK_DEG), turnSeg(h1, dir, TURN_BANK_DEG)];
  // The heading the plain turn really rolls out on (the fixed step leaves a fraction of a degree).
  const u1 = unit(dryRun(lead, { segments: turn() }, t0).end.headingRad);

  // Outside of the turn first: for a left turn (+1) the aircraft furthest to the right, and so on in.
  const order = aircraft
    .map((a) => ({ a, ...relativeTo(lead, a) }))
    .sort((p, q) => (Math.abs(p.left - q.left) > 1 ? (p.left - q.left) * dir : p.fwd - q.fwd))
    .map((r) => r.a);
  // The check turn only makes sense from a line abreast.
  const abreast = aircraft.every((a) => Math.abs(relativeTo(lead, a).fwd) <= ABREAST_FT);
  const checked = withCheck && abreast;
  const programme = (i) => (checked && i > 0 ? withChecks() : turn());

  // How far along the new heading each programme leaves the aircraft, beyond flying straight at v (a dry run each).
  const along = order.map((a, i) => {
    const run = dryRun(a, { segments: programme(i) }, t0);
    return dot({ x: run.end.xFt - a.xFt, y: run.end.yFt - a.yFt }, u1) - v * run.durationSec;
  });
  const waits = [0];
  for (let i = 1; i < order.length; i++) {
    const rel = { x: order[i].xFt - order[i - 1].xFt, y: order[i].yFt - order[i - 1].yFt };
    waits.push(waits[i - 1] + exactWaitSec(rel, u0, u1, v, along[i] - along[i - 1]));
  }
  // A line that is not abreast can give a negative wait to someone: the earliest goes first.
  const earliest = Math.min(...waits);
  const plans = {};
  order.forEach((a, i) => {
    const wait = onStep(waits[i] - earliest);
    plans[a.id] = { segments: [...(wait > 0 ? [{ kind: 'hold', untilSec: t0 + wait }] : []), ...programme(i)] };
  });
  const first = order[waits.indexOf(earliest)];
  const names = order.map(nameOf).join(', ');
  const how = checked
    ? `${nameOf(first)} turns first (outside of the turn), the rest check ${CHECK_TURN_DEG}° toward the aircraft ahead of them and turn ${m.turnDeg}° in turn: ${names}. The check costs a little room, so the first to check rolls out a little tight of ${nameOf(first)} (fix on roll-out, AFM8 brief p.18).`
    : `${nameOf(first)} turns first (outside of the turn), each next one waits and rolls out abeam of the one before: ${names}.`;
  return { plans, firstId: first.id, note: how };
}

/** Check, in-place and hook turns: all four roll in together, as the 2-ship's (SMM 16.19 paras 58-60, 16.45 para 121). */
function allTogether(aircraft, key, dir, t0) {
  const { plans } = planManoeuvre(aircraft, key, dir, t0);
  const turnDeg = MANOEUVRES[key].turnDeg;
  const note = turnDeg >= 180
    ? 'All four turn together through 180 at 70/3 and roll out abreast, flying back the other way.'
    : turnDeg > 30
      ? 'All four turn together and roll out in trail.'
      : 'All four turn together; the line turns with them.';
  return { plans, note };
}

/**
 * The plan for a four-ship button press: aircraft [Lead, #2, #3, #4] as they are now;
 * key: one of FOUR_SHIP_KEYS; dir +1 left, -1 right; t0 formation time now; check45: the
 * delayed 45 with its check turn (default) or as a plain chain of standard turns (the Setup
 * toggle, Patrick 4 Oct 11:28Z).
 * Returns { plans: { id: { segments } }, note, firstId? }.
 */
export function planFour(aircraft, key, dir, t0, { check45 = true } = {}) {
  if (!FOUR_SHIP_KEYS.includes(key)) throw new Error(`${key} is not a four-ship manoeuvre`);
  const m = MANOEUVRES[key];
  if (m.kind === 'delayed') return delayedChain(aircraft, m, dir, t0, check45 && m.turnDeg === 45);
  return allTogether(aircraft, key, dir, t0);
}

/**
 * Judges every wingman against the aircraft it flies off (SMM 16.42 para 116: #2 and #3 off Lead,
 * #4 off #3) once all four have rolled out. `judgePair` is the formation's own, passed in so
 * the pairs are judged by the same rule as the 2-ship's.
 */
export function judgeFour(aircraft, spacingFt, shape, judgePair) {
  const byId = new Map(aircraft.map((a) => [a.id, a]));
  const ships = aircraft
    .filter((a) => a.ref != null)
    .map((a) => {
      const ref = byId.get(a.ref);
      return { id: a.id, name: nameOf(a), refName: nameOf(ref), ...judgePair(ref, a, spacingFt, shape) };
    });
  const good = (s) => s.labels[0] === 'ON SPACING' || s.labels[0] === 'IN TRAIL';
  const labels = ships.every(good) ? [shape === 'trail' ? 'IN TRAIL' : 'ON SPACING'] : ships.filter((s) => !good(s)).flatMap((s) => s.labels.map((l) => `${s.name} ${l}`));
  return { shape, ships, labels };
}
