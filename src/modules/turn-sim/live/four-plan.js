// Changing formation, 4-ship (Turn Sim spec section 8; refactor PRs 6-8, the four rebuilt on the 2-ship's planners; Fable's
// plan, chooser/plan.md section 20; Patrick "agreed" 5 Oct 23:18Z). Press a formation and the four fly Lead's call from
// wherever they are, planned at the press, each wingman off the aircraft he flies off (four-legs.js).
//
// The moves are the ratified table's (project files turn-sim-review/four-ship/moves-from-the-manuals.md; Patrick 5 Oct
// 23:03Z-23:04Z: all as recommended, "then adjust later as required"): one call is one move with its gates. Where the
// table has no move for a call ("none; via finger" or "via fighting wing"), the four fly the table's moves one after
// another, the fewest that get there (MOVES' rough seconds pick the route; estimates).
//
// Sources for each move are in the file that flies it: four-close.js (finger, echelon, box, line astern, route, and out of
// them to fighting wing), four-rejoin.js (the turning and straight-ahead rejoins, V2.99) and four-open.js (opening out to
// Spread 4, Fluid 4 and the offset box, V2.100).
import { copyAircraft, planDone } from './flight.js';
import { classify, judge } from './judge.js';
import { FOUR_FORMATIONS, refsFor, fourWords } from './slots.js';
import { FOUR_CHANGE_LIMIT_SEC, statesAt, joinLegs } from './four-legs.js';
import { fingerToEchelon, echelonToFinger, echelonToEchelon, fingerBox, fingerTrail, slideTo, openToFw } from './four-close.js';
import { rejoinToFw, turningToFinger, closeFromFw, straightToEchelon } from './four-rejoin.js';
import { entryToSpread, fwFluid, fluidToBox } from './four-open.js';

export { FOUR_CHANGE_LIMIT_SEC };

/**
 * The moves Lead can call (the ratified table, section 2, by its M numbers), each with a rough cost in seconds (estimates,
 * for choosing a route only) and its planner. `sides` says which sides the far end may take: 'same' keeps #2's side, 'any'
 * may change it (finger and echelon, through the crossunder), 'none' has no side (line astern).
 */
const MOVES = [
  // close (four-close.js)
  { from: 'finger', to: 'echelon', m: 'M1/M2', cost: 40, sides: 'any', fly: (st, t, o, s, sTo) => fingerToEchelon(st, t, o, s, sTo), how: 'crossunder to echelon' },
  { from: 'echelon', to: 'finger', m: 'M3', cost: 40, sides: 'any', fly: (st, t, o, s, sTo) => echelonToFinger(st, t, o, s, sTo), how: 'crossunder to finger' },
  { from: 'echelon', to: 'echelon', m: 'not in the manuals (Patrick 6 Oct 05:29Z)', cost: 30, sides: 'any', fly: (st, t, o, s, sTo) => echelonToEchelon(st, t, o, s, sTo), how: 'triple station change, all four in line' },
  { from: 'finger', to: 'box', m: 'M4', cost: 40, sides: 'same', fly: (st, t, o, s) => fingerBox(st, t, o, s, true), how: '#4 into the box' },
  { from: 'box', to: 'finger', m: 'M5', cost: 40, sides: 'same', fly: (st, t, o, s) => fingerBox(st, t, o, s, false), how: '#4 back to finger' },
  { from: 'finger', to: 'trail', m: 'M6', cost: 60, sides: 'none', fly: (st, t, o, s) => fingerTrail(st, t, o, s, true), how: 'into line astern' },
  { from: 'trail', to: 'finger', m: 'M7', cost: 60, sides: 'any', fly: (st, t, o, s, sTo) => fingerTrail(st, t, o, sTo, false), how: 'back to finger' },
  { from: 'finger', to: 'route', m: 'M12', cost: 15, sides: 'same', fly: (st, t, o, s) => slideTo(st, t, o, s, 'route'), how: 'out to route' },
  { from: 'route', to: 'finger', m: 'M10 (route to echelon references)', cost: 15, sides: 'same', fly: (st, t, o, s) => slideTo(st, t, o, s, 'finger'), how: 'in from route' },
  ...['finger', 'echelon'].map((from) => ({ from, to: 'fw', m: 'M9', cost: 60, sides: 'same', fly: (st, t, o, s) => openToFw(st, t, o, s, from), how: 'drop back to fighting wing' })),
  // rejoins (four-rejoin.js)
  { from: 'spread4', to: 'fw', m: 'M16', cost: 150, sides: 'same', fly: (st, t, o, s) => rejoinToFw(st, t, o, s, 'spread4'), how: (o) => (o.rejoin === 'straight' ? 'straight-ahead rejoin to fighting wing' : 'turning rejoin to fighting wing') },
  { from: 'offsetBox', to: 'fw', m: 'M22', cost: 200, sides: 'same', fly: (st, t, o, s) => rejoinToFw(st, t, o, s, 'offsetBox'), how: (o) => (o.rejoin === 'straight' ? 'straight-ahead rejoin to fighting wing' : 'turning rejoin to fighting wing') },
  { from: 'other', to: 'fw', m: 'M16', cost: 150, sides: 'same', fly: (st, t, o, s) => rejoinToFw(st, t, o, s, 'other'), how: 'rejoin to fighting wing' },
  { from: 'fw', to: 'route', m: 'M12', cost: 60, sides: 'same', fly: (st, t, o, s) => closeFromFw(st, t, o, s, 'route'), how: 'close through route' },
  { from: 'fw', to: 'finger', m: 'M10/M11', cost: 70, sides: 'same', fly: (st, t, o, s) => (o.rejoin === 'straight' ? { ...closeFromFw(st, t, o, s, 'finger'), how: 'straight-ahead rejoin to finger, through route' } : turningToFinger(st, t, o, s, 'fw')), how: 'turning rejoin to finger' },
  { from: 'spread4', to: 'finger', m: 'M11 (Q5)', cost: 150, sides: 'same', fly: (st, t, o, s) => turningToFinger(st, t, o, s, 'spread4'), how: 'turning rejoin to finger' },
  { from: 'fw', to: 'echelon', m: 'M10', cost: 90, sides: 'any', fly: (st, t, o, s, sTo) => straightToEchelon(st, t, o, sTo), how: 'straight-ahead rejoin to echelon' },
  // opening out (four-open.js)
  { from: 'fw', to: 'spread4', m: 'M13', cost: 90, sides: 'same', fly: (st, t, o, s) => entryToSpread(st, t, o, s, false), how: 'entry to Spread 4' },
  { from: 'finger', to: 'spread4', m: 'M13', cost: 90, sides: 'same', fly: (st, t, o, s) => entryToSpread(st, t, o, s, true), how: 'open out to Spread 4' },
  { from: 'fw', to: 'fluid4', m: 'M18', cost: 60, sides: 'same', fly: (st, t, o, s) => fwFluid(st, t, o, s, true), how: '"Fluid 4, go"' },
  { from: 'fluid4', to: 'fw', m: 'not in the manuals', cost: 60, sides: 'same', fly: (st, t, o, s) => fwFluid(st, t, o, s, false), how: 'back to fighting wing' },
  { from: 'fluid4', to: 'offsetBox', m: 'M19', cost: 120, sides: 'same', fly: (st, t, o, s) => fluidToBox(st, t, o, s), how: 'in place 90, then spread to the box' },
];

/** The fewest-seconds route from (key, side) to (to, sTo) through MOVES: [{ move, s, sTo }…], or null. */
export function routeFour(from, s, to, sTo) {
  const node = (k, side) => `${k}:${k === 'trail' ? 0 : side}`;
  const goal = node(to, sTo);
  const best = new Map([[node(from, s), 0]]);
  const open = [{ key: from, side: s, cost: 0, path: [] }];
  while (open.length) {
    open.sort((a, b) => a.cost - b.cost);
    const cur = open.shift();
    if (node(cur.key, cur.side) === goal) return cur.path;
    for (const mv of MOVES.filter((x) => x.from === cur.key)) {
      for (const side of mv.sides === 'any' ? [1, -1] : [cur.side]) {
        const cost = cur.cost + mv.cost;
        const id = node(mv.to, side);
        if ((best.get(id) ?? Infinity) <= cost) continue;
        best.set(id, cost);
        open.push({ key: mv.to, side, cost, path: [...cur.path, { move: mv, s: cur.side, sTo: side }] });
      }
    }
  }
  return null;
}

/**
 * Plans a change of formation for the four as they are now. to: a FOUR_FORMATIONS key. options: { side: 'keep' | 'left' |
 * 'right' (#2's side at the end), spacingFt, blockFt, rejoin: 'into' | 'straight', lastSide }. Returns { ok, reason?, plans,
 * note, label, flying, from, fromSide, to, side, refs, endSec, judged, legs }: when ok is false nothing should be flown and
 * `reason` says why in one line (design section 9).
 */
export function planChangeFour(aircraft, to, options = {}, t0 = 0) {
  /** @type {{ spacingFt: number, blockFt: number, rejoin: string, side?: string, lastSide?: number }} */
  const opts = { spacingFt: 6000, blockFt: 8000, rejoin: 'into', ...options };
  const f = FOUR_FORMATIONS[to];
  if (!f) return { ok: false, reason: `There is no four-ship formation called ${to}.` };
  if (f.later) return { ok: false, reason: `${f.label} is the live build, coming later.` };
  const from = classify(aircraft);
  const sNow = from.side || opts.lastSide || -1;
  const want = opts.side ?? 'keep';
  const sTo = to === 'trail' ? 0 : want === 'left' ? 1 : want === 'right' ? -1 : sNow;
  if (from.key === to && (to === 'trail' || from.side === sTo)) return { ok: false, reason: `Already in ${f.label.toLowerCase()}.` };
  const path = routeFour(from.key, from.key === 'trail' ? 0 : sNow, to, sTo);
  if (!path) return { ok: false, reason: `No way from ${fourWords(from).toLowerCase()} to ${f.label.toLowerCase()} the manuals give.` };

  // Fly each move from where the last one ended.
  const legs = [];
  let now = aircraft.map((a) => copyAircraft(a));
  let t = t0;
  const hows = [];
  for (const step of path) {
    const s = step.s === 0 ? (step.sTo || sNow) : step.s;
    const r = step.move.fly(now, t, opts, s, step.sTo);
    if (!r.ok) return { ok: false, reason: `No safe change from here: ${r.reason}`, from: from.key, to };
    const how = r.how ?? (typeof step.move.how === 'function' ? step.move.how(opts) : step.move.how);
    hows.push(r.straightFallback ? `${how} (straight ahead: no turn kept the lane)` : how);
    legs.push(...r.legs);
    const last = r.legs[r.legs.length - 1];
    now = r.end ?? statesAt(now, last, last.endSec); // a move of several legs hands back where its last leg ended
    t = last.endSec;
    if (t - t0 > FOUR_CHANGE_LIMIT_SEC) return { ok: false, reason: `No safe change from here: it would take more than ${Math.round(FOUR_CHANGE_LIMIT_SEC / 60)} minutes.`, from: from.key, to };
  }
  // Each later leg's start states came from flying the earlier legs, so the joined plan flies exactly that.
  const plans = joinLegs(legs, aircraft.map((a) => a.id));
  const judged = judge(now, { key: to, side: sTo }, { spacingFt: opts.spacingFt });
  if (!judged.inBand) return { ok: false, reason: `No safe change from here: it would end ${judged.labels.join(', ')}.`, from: from.key, to, end: now, judged };
  const fromWords = fourWords(from);
  const toWords = fourWords({ key: to, side: sTo });
  return {
    ok: true,
    plans,
    // Finger to finger is the one change not authorized (SMM 16.33 para 93, M8): the route goes through echelon instead.
    note: `${fromWords} to ${toWords}: ${hows.join(', then ')}${from.key === 'finger' && to === 'finger' ? ' (finger to finger is not flown directly, SMM 16.33 para 93)' : ''}.`,
    label: toWords,
    flying: `${fromWords} to ${toWords} (${hows.join(', then ')})`,
    from: from.key,
    fromSide: sNow,
    to,
    side: sTo,
    refs: refsFor(to),
    endSec: t,
    judged,
    legs: legs.map((leg) => ({ t0: leg.t0, endSec: leg.endSec })),
  };
}

/** True once every aircraft has flown its plan (for a caller checking a plan by flying it). */
export const allDone = (aircraft, plans) => aircraft.every((a) => planDone(a, plans[a.id]));
