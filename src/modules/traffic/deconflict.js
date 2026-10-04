// Automatic deconfliction for the Traffic Sim: who gives way, and with which move (Patrick, 4 Oct 09:40Z,
// 09:43Z, 11:06Z, 11:07Z; design and his nine answers in the project files, traffic-deconfliction/design.md).
//
// Two layers. Layer 1, by the book: once two aircraft would get inside the caution distance within the rules'
// look-ahead, the right-of-way table below picks the one that gives way and the manual's move for it. Layer 2,
// by skill: if the red (conflict distance) is still coming within the skill's look-ahead, the one giving way
// breaks out now, and the one with right of way also acts at the last moment (SMM 4.28 para 69).
//
// This file only decides. It reads a frozen copy of the aircraft taken before anyone moves this tick, changes
// nothing, and gives the same answer whatever order the aircraft are listed in, so a rewind replays the same.
// sim.js starts the moves through the same functions the buttons use.
import { posOnRoute } from './route.js';
import { ktToFtps } from '../../core/units.js';
import { wrapDeg180 } from '../../core/angles.js';
import { firstEntrySampled } from '../../core/closest-approach.js';

/** Every number the deconfliction uses, each with its source (design section 4). */
export const DECONFLICT = Object.freeze({
  /** Rules act once the caution distance would be broken within this, s (Patrick's card, Q2, 4 Oct 11:23Z). */
  rulesLookAheadSec: 15,
  /** The skill acts once the red would be broken within this, s (Patrick's card, Q2). */
  skillLookAheadSec: 6,
  /** The aircraft with right of way acts at this, s, if the red is still coming (Patrick's card, Q2; SMM 4.28 para 69). */
  holderLookAheadSec: 3,
  /** Predicted positions every this, s (straight between them, so nothing slips through). Engineering choice. */
  sampleSec: 1,
  /** Decide every this many sim steps (0.5 s; divides the 200-step snapshot interval). Engineering choice. */
  decideEverySteps: 10,
  /** "Higher" means at least this much higher, ft (the shared ±100 ft margin, docs/TESTING.md). An estimate. */
  higherByFt: 100,
  /** With no path to follow, a prediction runs straight on (design section 2.2). */
  straightLineSec: 15,
});

/** Where each aircraft stands, for the right-of-way table: keyed on route kind and phase, never a route name. */
export function standingOf(a, route) {
  if (a.pflFlight || a.pflRail) return 'pfl';
  if (a.deconflict?.move === 'fly_through' && a.goAroundFlight) return 'fly_through';
  if (a.goAroundFlight || a.highKeyFlight || a.mode === 'PHYSICS' || a.command === 'breakout' || a.command === 'closed_pattern') return 'manoeuvring';
  if (route && (route.kind === 'entry' || route.kind === 'split')) {
    return +route.mergeIndex > 0 || route.kind === 'split' ? 'joining' : 'straight_in';
  }
  switch (a.phase) {
    case 'initial': return 'initial';
    case 'break': return 'break';
    case 'downwind': return 'inner_downwind';
    case 'final_turn': return 'final_turn';
    case 'final': return 'final';
    case 'outer_downwind': return 'outer_downwind';
    default: return 'climb_out';
  }
}

const ON_FINAL = new Set(['final', 'final_turn', 'straight_in']);
const IN_PATTERN = new Set(['initial', 'break', 'inner_downwind', 'final_turn', 'final', 'outer_downwind', 'climb_out']);
/** Only these can be told to give way; a PFL keeps its glide and a manoeuvre already flying is never restarted. */
const CAN_MOVE = new Set([...IN_PATTERN, 'joining', 'straight_in', 'fly_through']);

/** The skill move for an aircraft: a go-around on final, a breakout anywhere else (Patrick's card, Q3). */
const skillMove = (standing) => (ON_FINAL.has(standing) ? 'go_around' : 'breakout');

/**
 * Who gives way between two frozen aircraft, and how. Returns { giver, holder, move, rule } with giver and
 * holder ids, or { giver: null, rule } when no one can (two PFLs). The same answer whichever is `p` or `q`.
 */
export function rightOfWay(p, q) {
  const [a, b] = p.id < q.id ? [p, q] : [q, p];
  const pick = (giver, holder, move, rule) => ({ giver: giver.id, holder: holder.id, move, rule });
  const sa = a.standing, sb = b.standing;
  // R3, R6: the PFL keeps right of way. Two PFLs never meet by rule (WFO S2 art 403 para 1d).
  if (sa === 'pfl' || sb === 'pfl') {
    if (sa === sb) return { giver: null, rule: 'two PFLs' };
    const [g, h] = sa === 'pfl' ? [b, a] : [a, b];
    const move = g.standing === 'initial' || g.standing === 'break' ? 'fly_through' : skillMove(g.standing);
    return pick(g, h, move, 'PFL has right of way');
  }
  // R2: downwind has right of way over a fly-through, which breaks out (WFO S2 art 401 para 9 Note 1).
  const downwind = (s) => s === 'inner_downwind' || s === 'outer_downwind';
  if (sa === 'fly_through' && downwind(sb)) return pick(a, b, 'breakout', 'downwind over fly-through');
  if (sb === 'fly_through' && downwind(sa)) return pick(b, a, 'breakout', 'downwind over fly-through');
  // R1: established in the pattern over joining (SMM 4.5 para 8, 4.15 para 35; Patrick Q9: downwind over rejoining).
  if (sa === 'joining' && IN_PATTERN.has(sb)) return pick(a, b, 'breakout', 'pattern over joining');
  if (sb === 'joining' && IN_PATTERN.has(sa)) return pick(b, a, 'breakout', 'pattern over joining');
  // R4, R5: the perch is the point of no return (Patrick's card, Q1). Before it the aircraft about to perch
  // breaks out; past it the straight-in moves over and goes around (SMM 4.19 para 43, 4.28 para 68).
  if (sa === 'straight_in' || sb === 'straight_in') {
    const [s, o] = sa === 'straight_in' ? [a, b] : [b, a];
    if (o.standing === 'inner_downwind') return pick(o, s, 'breakout', 'straight-in over an aircraft about to perch');
    if (o.standing === 'final_turn' || o.standing === 'final') return pick(s, o, 'go_around', 'final turn over straight-in');
  }
  // No rule (Patrick, 11:25Z): the higher aircraft moves; at the same height the one on the right has right of
  // way, so the one on the left moves; callsign order settles a dead heat (an estimate).
  const dz = a.alt - b.alt;
  if (Math.abs(dz) >= DECONFLICT.higherByFt) {
    const [g, h] = dz > 0 ? [a, b] : [b, a];
    return pick(g, h, skillMove(g.standing), 'higher aircraft moves');
  }
  const rightOf = (from, to) => {
    const brg = Math.atan2(to.x - from.x, to.y - from.y) * 180 / Math.PI;
    const rel = wrapDeg180(brg - from.trackDeg);
    return rel > 0 && rel < 180;
  };
  const aSeesRight = rightOf(a, b), bSeesRight = rightOf(b, a);
  if (aSeesRight !== bSeesRight) {
    const [g, h] = aSeesRight ? [a, b] : [b, a];
    return pick(g, h, skillMove(g.standing), 'aircraft on the right has right of way');
  }
  return pick(b, a, skillMove(b.standing), 'same height, head-on: callsign order');
}

/**
 * Freezes what the decision needs from each aircraft and predicts where it will be every second over the
 * rules' look-ahead: along its path when it has one (`pathOf(a)` gives { route, options } or null), straight on
 * otherwise. Aircraft with a non-finite number are left out (design section 5): never an error.
 */
export function freeze(aircraft, pathOf, routeOf) {
  const out = [];
  const n = Math.round(DECONFLICT.rulesLookAheadSec / DECONFLICT.sampleSec);
  for (const a of aircraft) {
    if (!a.active || a.landed || a.status === 'waiting') continue;
    const gsFtps = ktToFtps(a.gsKt ?? a.groundSpeedKt ?? a.iasKt ?? 0);
    const trackDeg = a.trackDeg ?? a.headingDeg;
    if (![a.x, a.y, a.alt, gsFtps, trackDeg].every(Number.isFinite)) continue;
    const climb = Number.isFinite(a.climbFtps) ? a.climbFtps : 0;
    const path = pathOf(a);
    const track = [];
    if (path && Number.isFinite(a.distFt)) {
      // Along the path at today's ground speed; any gap from the path closes over the join (or 5 s, an estimate).
      const p0 = posOnRoute(path.route, a.distFt, path.options);
      const offX = a.x - p0.x, offY = a.y - p0.y, offZ = a.alt - (p0.alt ?? a.alt);
      const closeSec = a.joinOffset ? Math.max(1, (a.joinOffset.T ?? 5) - (a.joinOffset.t ?? 0)) : 5;
      for (let i = 0; i <= n; i++) {
        const tSec = i * DECONFLICT.sampleSec;
        const p = posOnRoute(path.route, a.distFt + gsFtps * tSec, path.options);
        const k = Math.max(0, 1 - tSec / closeSec);
        track.push({ x: p.x + offX * k, y: p.y + offY * k, z: (p.alt ?? a.alt) + offZ * k });
      }
    } else {
      const r = trackDeg * Math.PI / 180;
      for (let i = 0; i <= n; i++) {
        const tSec = Math.min(i * DECONFLICT.sampleSec, DECONFLICT.straightLineSec);
        track.push({ x: a.x + gsFtps * Math.sin(r) * tSec, y: a.y + gsFtps * Math.cos(r) * tSec, z: a.alt + climb * tSec });
      }
    }
    if (!track.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))) continue;
    out.push({ id: a.id, x: a.x, y: a.y, alt: a.alt, trackDeg, gsFtps, standing: standingOf(a, routeOf(a)), busy: Boolean(a.deconflict), track });
  }
  return out.sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
}

/**
 * The decisions for this tick from the frozen aircraft: [{ id, move, layer, rule, with }], at most one per
 * aircraft, earliest conflict first. `limits` = { latFt, vertFt, cautionLatFt, cautionVertFt }.
 */
export function decide(frozen, limits) {
  const caution = { latFt: limits.cautionLatFt, vertFt: limits.cautionVertFt };
  const red = { latFt: limits.latFt, vertFt: limits.vertFt };
  const reachFt = (p, q) => (p.gsFtps + q.gsFtps) * DECONFLICT.rulesLookAheadSec + caution.latFt;
  const wanted = [];
  for (let i = 0; i < frozen.length; i++) {
    for (let j = i + 1; j < frozen.length; j++) {
      const p = frozen[i], q = frozen[j];
      if (Math.hypot(p.x - q.x, p.y - q.y) > reachFt(p, q)) continue; // cannot meet within the look-ahead
      const tCaution = firstEntrySampled(p.track, q.track, caution, DECONFLICT.sampleSec);
      if (tCaution === null || tCaution > DECONFLICT.rulesLookAheadSec) continue; // nothing close: nothing happens
      const tRed = firstEntrySampled(p.track, q.track, red, DECONFLICT.sampleSec);
      const row = rightOfWay(p, q);
      const giver = row.giver === p.id ? p : row.giver === q.id ? q : null;
      const holder = giver === p ? q : giver === q ? p : null;
      // Layer 1: the one giving way flies the manual's move.
      if (giver && CAN_MOVE.has(giver.standing) && !giver.busy) {
        wanted.push({ t: tCaution, id: giver.id, move: row.move, layer: 'rules', rule: row.rule, with: holder.id });
        continue;
      }
      // Layer 2: the red still coming. The one giving way acts within the skill's look-ahead if it still can;
      // the one with right of way (or both, when no one gives way) acts at the last moment.
      if (tRed === null) continue;
      if (giver && tRed <= DECONFLICT.skillLookAheadSec && CAN_MOVE.has(giver.standing) && !giver.busy) {
        wanted.push({ t: tRed, id: giver.id, move: skillMove(giver.standing), layer: 'skill', rule: row.rule, with: holder.id });
      }
      if (tRed <= DECONFLICT.holderLookAheadSec) {
        for (const h of holder ? [holder] : [p, q]) {
          if (CAN_MOVE.has(h.standing) && !h.busy) {
            wanted.push({ t: tRed, id: h.id, move: skillMove(h.standing), layer: 'skill', rule: row.rule, with: (h === p ? q : p).id });
          }
        }
      }
    }
  }
  wanted.sort((x, y) => x.t - y.t || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const seen = new Set();
  return wanted.filter((w) => (seen.has(w.id) ? false : (seen.add(w.id), true))).map(({ t, ...rest }) => rest);
}

/** The words on the tag beside an aircraft the deconfliction moved, like the PFL tag. */
export function deconflictLabel(move, layer) {
  const what = move === 'fly_through' ? 'fly-through' : move === 'go_around' ? 'go-around' : 'break out';
  return layer === 'skill' ? `[EVASIVE: ${what}]` : `[GIVING WAY: ${what}]`;
}
