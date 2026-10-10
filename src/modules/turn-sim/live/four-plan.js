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
import { rejoinToFw, turningToFinger, turningToEchelon, turningAwayToEchelon, closeFromFw, straightToEchelon, straightToFinger } from './four-rejoin.js';
import { entryToSpread, fwFluid, fluidToBox } from './four-open.js';

export { FOUR_CHANGE_LIMIT_SEC };

/**
 * The moves Lead can call (the ratified table, section 2, by its M numbers), each with a rough cost in seconds (estimates,
 * for choosing a route only) and its planner. `sides` says which sides the far end may take: 'same' keeps #2's side, 'any'
 * may change it (finger and echelon, through the crossunder), 'none' has no side (line astern).
 */
/**
 * How a rejoin to echelon on side sTo flies (TS-176): Into when it is #2's side, Away (Lead turns away from #2, nearest
 * first, piece 4) when it is the other side and the switch says Away; otherwise straight ahead.
 */
function echelonBy(o, s, sTo, from) {
  if (o.rejoin !== 'straight' && sTo === s) return { fly: (st, t, oo) => turningToEchelon(st, t, oo, s, from), how: 'turning rejoin straight into echelon' };
  if (o.rejoin !== 'straight' && o.turn === 'away' && from !== 'fw') return { fly: (st, t, oo) => turningAwayToEchelon(st, t, oo, s, from), how: 'turning rejoin, Lead away from #2, straight into echelon (nearest first)' };
  return { fly: (st, t, oo) => straightToEchelon(st, t, oo, sTo, from), how: 'straight-ahead rejoin to echelon' };
}

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
  // all at once from every close formation (Patrick 6 Oct 05:42Z, 05:45Z; until V2.131 box, line astern and route went through finger first)
  ...['finger', 'echelon', 'box', 'trail', 'route'].map((from) => ({ from, to: 'fw', m: 'M9', cost: 40, sides: from === 'trail' ? 'any' : 'same', fly: (st, t, o, s, sTo) => openToFw(st, t, o, from === 'trail' ? sTo : s, from), how: 'drop back to fighting wing, all at once' })),
  // rejoins (four-rejoin.js): from every spread position (and fighting wing to finger and echelon), straight into the called
  // formation, each wingman to his own place, flown the way the rejoin switch says, Into (TRJ) or Straight (SARJ) (TS-176;
  // Patrick 10 Oct 2026 20:43Z, 20:49Z). TS-123's straight ahead at full power from Spread 4 and the offset box is now the
  // SARJ there. `rejoin` marks them: a route to fighting wing, finger or echelon never chains a rejoin into a station change.
  ...['spread4', 'offsetBox', 'other'].map((from) => ({ from, to: 'fw', m: from === 'offsetBox' ? 'M22' : 'M16', cost: 150, sides: 'same', rejoin: true, fly: (st, t, o, s) => rejoinToFw(st, t, o, s, from), how: (o) => (o.rejoin === 'straight' ? 'straight ahead to fighting wing, full power until in the cone' : 'turning rejoin to fighting wing') })),
  { from: 'fluid4', to: 'fw', m: 'not in the manuals', cost: 60, sides: 'same', rejoin: true, fly: (st, t, o, s) => (o.rejoin === 'straight' ? fwFluid(st, t, o, s, false) : rejoinToFw(st, t, o, s, 'fluid4')), how: (o) => (o.rejoin === 'straight' ? 'back to fighting wing' : 'turning rejoin to fighting wing') },
  { from: 'fw', to: 'route', m: 'M12', cost: 60, sides: 'same', rejoin: true, fly: (st, t, o, s) => closeFromFw(st, t, o, s, 'route'), how: 'close through route' },
  ...['fw', 'spread4', 'offsetBox', 'fluid4', 'other'].map((from) => ({ from, to: 'finger', m: from === 'fw' ? 'M10/M11' : 'M11 (Q5)', cost: 150, sides: 'same', rejoin: true, fly: (st, t, o, s) => (o.rejoin !== 'straight' ? turningToFinger(st, t, o, s, from) : from === 'fw' ? closeFromFw(st, t, o, s, 'finger') : straightToFinger(st, t, o, s)), how: (o) => (o.rejoin === 'straight' ? 'straight-ahead rejoin to finger, through route' : 'turning rejoin to finger') })),
  // Into joins on #2's side and Away on the other, each the inside of Lead's turn; the other side is the straight-ahead rejoin.
  ...['fw', 'spread4', 'offsetBox', 'fluid4', 'other'].map((from) => ({ from, to: 'echelon', m: 'M10', cost: 150, sides: 'any', rejoin: true, fly: (st, t, o, s, sTo) => echelonBy(o, s, sTo, from).fly(st, t, o, s, sTo), how: (o, s, sTo) => echelonBy(o, s, sTo, from).how })),
  // opening out (four-open.js)
  { from: 'fw', to: 'spread4', m: 'M13', cost: 90, sides: 'same', fly: (st, t, o, s) => entryToSpread(st, t, o, s, false), how: 'entry to Spread 4' },
  { from: 'finger', to: 'spread4', m: 'M13', cost: 90, sides: 'same', fly: (st, t, o, s) => entryToSpread(st, t, o, s, true), how: 'open out to Spread 4' },
  { from: 'fw', to: 'fluid4', m: 'M18', cost: 60, sides: 'same', fly: (st, t, o, s) => fwFluid(st, t, o, s, true), how: '"Fluid 4, go"' },
  { from: 'fluid4', to: 'offsetBox', m: 'M19', cost: 120, sides: 'any', fly: (st, t, o, s, sTo) => fluidToBox(st, t, o, sTo ?? s), how: 'in place 90, then spread to the box' },
];

/** The formations every spread position rejoins straight into (TS-176). */
const DIRECT = ['fw', 'finger', 'echelon'];

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
    // A rejoin to fighting wing, finger or echelon ends the route there: no station change after the join (TS-176).
    if (DIRECT.includes(to) && cur.path.some((p) => p.move.rejoin)) continue;
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
 * 'right' (#2's side at the end), spacingFt, blockFt, rejoin: 'into' | 'straight', turn: 'into' | 'away', lastSide }. Returns { ok, reason?, plans,
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
  // Away (TS-176 piece 4): Lead turns away from #2, and echelon forms on the inside, the side away from him.
  const awayEchelon = to === 'echelon' && opts.turn === 'away' && opts.rejoin !== 'straight' && ['spread4', 'fluid4', 'other'].includes(from.key);
  const keep = awayEchelon ? -sNow : sNow;
  const sTo = to === 'trail' ? 0 : want === 'left' ? 1 : want === 'right' ? -1 : keep;
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
    // From the offset box a turning rejoin would swing the element, 7,000 ft behind on #2's side, across Lead's nose (V2.220
    // dry runs): it flies straight ahead until Patrick rules how the element joins in that turn.
    if (step.move.rejoin && opts.turn === 'away' && opts.rejoin !== 'straight' && step.move.to !== 'echelon' && step.move.from !== 'offsetBox') {
      return { ok: false, reason: 'With Lead turning away, the 4-ship joins to echelon only so far. Try Into or SARJ.', from: from.key, to };
    }
    const held = step.move.rejoin && step.move.from === 'offsetBox' && opts.rejoin !== 'straight';
    const o = held ? { ...opts, rejoin: 'straight' } : opts;
    const r = step.move.fly(now, t, o, s, step.sTo);
    if (!r.ok) return { ok: false, reason: `No safe change from here: ${r.reason}`, from: from.key, to };
    const how = r.how ?? (typeof step.move.how === 'function' ? step.move.how(o, s, step.sTo) : step.move.how);
    hows.push(r.straightFallback ? `${how} (straight ahead: no turn kept the lane)` : held ? `${how} (from the offset box the turning rejoin is not built yet)` : how);
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
