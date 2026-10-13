// Automatic deconfliction for the Traffic Sim: who gives way, and with which move (Patrick, 4 Oct 09:40Z,
// 09:43Z, 11:06Z, 11:07Z; design and his nine answers in the project files, traffic-deconfliction/design.md).
//
// Two layers. Layer 1, by the book: once two aircraft would get inside the caution distance within the rules'
// look-ahead, the right-of-way table below picks the one that gives way and the manual's move for it. Layer 2,
// by skill: if the red (conflict distance) is still coming within the skill's look-ahead, the one giving way
// flinches out of the way and then breaks out (on final it goes around), and the one with right of way also
// acts at the last moment (SMM 4.28 para 69); a PFL only banks away and keeps its glide (Patrick's card, Q3).
//
// This file only decides. It reads a frozen copy of the aircraft taken before anyone moves this tick, changes
// nothing, and gives the same answer whatever order the aircraft are listed in, so a rewind replays the same.
// sim.js starts the moves through the same functions the buttons use.
//
// Two types, two patterns (Traffic spec 4.19 item 6; plan Step 5c Phase 4; TR-159, a working answer not yet confirmed
// with Patrick). A type with a pattern of its own (the CT-102B Astra II, inside the CT-156's and 500 ft below) has its
// own moves (MOVES_BY_TYPE: its own go-around and the bank-away flinch; the spacing extension is sim.js's), and between
// the two patterns the aircraft established in its own pattern at its own height has right of way over one climbing or
// coming down through the other's (acrossPatterns). Between two CT-156s nothing here changes.
import { posOnRoute, pointDistFt, routeLengthFt, isClosedRoute } from './route.js';
import { ktToFtps } from '../../core/units.js';
import { wrapDeg180 } from '../../core/angles.js';
import { firstEntrySampled } from '../../core/closest-approach.js';
import { typeProfile } from './types.js';
import { PATTERN_ALT_FT, THRESHOLD_DATA_ELEV_FT } from './airfield.js';
import { ASTRA_PATTERN } from './astra-circuit.js';

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

/**
 * Each pattern's own height, ft MSL, by the pattern's route (the type's `patternRouteId`, types.js): Pattern 1 at
 * 3,500 ft (airfield.js PATTERN_ALT_FT, TR-R4) and the Astra pattern at 3,000 ft (Dad, TR-156; astra-circuit.js).
 */
const PATTERN_HEIGHT_FT = Object.freeze({ PAT1: PATTERN_ALT_FT, PAT_ASTRA: ASTRA_PATTERN.patternAltFt });

/** The Astra's own overhead from its initial (sim.js startAstraOverhead): its join, flown before it is on its lap. */
const OWN_OVERHEAD_ID = 'ASTRA_OVERHEAD_FLOWN';

/** Where each aircraft stands, for the right-of-way table: keyed on route kind and phase, never a route name. */
function standingOf(a, route, ownMoves = false) {
  if (a.flown?.kind === 'pfl') return 'pfl';
  if (a.spacing?.deconflict?.move === 'fly_through' && a.flown?.kind === 'move') return 'fly_through';
  // A type with its own pattern (the Astra; TR-159): on the overhead it flies to join its lap it stands by its phase
  // (initial, break, downwind), and on its own go-around it is 'going_around', which can only bank away.
  if (ownMoves && a.flown?.kind === 'move' && a.flown.route?.id === OWN_OVERHEAD_ID) return phaseStanding(a.phase);
  if (ownMoves && a.flown?.kind === 'move' && a.command === 'go_around') return 'going_around';
  if (a.flown || a.command === 'breakout' || a.command === 'closed_pattern') return 'manoeuvring';
  if (route && (route.kind === 'entry' || route.kind === 'split')) {
    return +route.mergeIndex > 0 || route.kind === 'split' ? 'joining' : 'straight_in';
  }
  return phaseStanding(a.phase);
}

/** A pattern phase's standing. */
function phaseStanding(phase) {
  switch (phase) {
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
/**
 * These are never told a move by the book but bank away at the last moment: a PFL keeps its glide (Patrick's card, Q3),
 * and an Astra already flying its own go-around keeps it (TR-159: it gives way to an established CT-156). By what it may
 * do, not by type: what each type may be given is MOVES_BY_TYPE.
 */
const BANK_AWAY_ONLY = new Set(['pfl', 'going_around']);
/** Can act at the last moment (decide's skill layer). */
const canEvade = (f) => (CAN_MOVE.has(f.standing) || BANK_AWAY_ONLY.has(f.standing)) && !f.busy;

/**
 * The move for an aircraft that must get out of the way: a go-around on final (a straight-in only on its last
 * leg), a breakout anywhere else (Patrick's card, Q3). `f` is a frozen aircraft.
 */
const skillMove = (f) => (ON_FINAL.has(f.standing) && (f.standing !== 'straight_in' || f.finalLeg !== false) ? 'go_around' : 'breakout');

/**
 * Giving way on final to a PFL or to an aircraft that has perched (on its final turn or final): the move-over, toward
 * the inner runway, between the runways, then the go-around (Patrick, 5 Oct 05:53Z; TR-73). Anyone else: skillMove.
 */
const giveWayMove = (g, h) => (skillMove(g) === 'go_around' && (h.standing === 'pfl' || h.standing === 'final_turn' || h.standing === 'final')
  ? 'move_over' : skillMove(g));

/** The last-moment move: a PFL banks away, an aircraft on final goes around, anyone else flinches then breaks out. */
const evasiveMove = (f) => moveFor(f, f.standing === 'pfl' || f.standing === 'going_around' ? 'bank_away' : skillMove(f) === 'go_around' ? 'go_around' : 'flinch');

/**
 * The moves by type (Traffic spec 4.19 item 6; TR-159; review section 4, "CAN_MOVE by type"; plan Step 5c Phase 4).
 * A CT-156 (and every type without a pattern of its own) is given the move the table names. A type with a pattern of
 * its own (the CT-102B Astra II) is given only its own go-around (astra-circuit.js buildAstraGoAround: straight ahead to
 * its 3,000 ft and onto its downwind) for a go-around, a move-over or a fly-through (from its initial that is the same
 * straight-on path a fly-through is), and the bank away for the flinch (the side step out and back, evade.js, which
 * keeps it on its own pattern). The CT-156's breakout (4,500 ft, 220 KIAS, ENT1's line) and the climb ahead before it
 * are not given to it: null, and the decision goes to the other aircraft or, failing that, it banks away at the last
 * moment (rightOfWay, decide). Its spacing extension (extend downwind) is decided in sim.js spacingTick.
 */
const MOVES_BY_TYPE = Object.freeze({
  go_around: 'go_around', move_over: 'go_around', fly_through: 'go_around',
  flinch: 'bank_away', bank_away: 'bank_away',
  breakout: null, climb_breakout: null,
});
const moveFor = (f, move) => (f.ownMoves ? MOVES_BY_TYPE[move] ?? null : move);

/** The words for a move in a rule's text. */
const MOVE_WORDS = Object.freeze({ breakout: 'breakout', climb_breakout: 'climb and breakout', move_over: 'move-over', fly_through: 'fly-through', go_around: 'go-around' });

/**
 * A row of the table given by type (MOVES_BY_TYPE): the giver's move for its type. When its type has no such move (an
 * Astra told the CT-156's breakout) the other aircraft gives way instead, with its own move, if it can be told to
 * (review section 4: "decide leaves such a decision to the other aircraft"); when it cannot either, nobody is told a
 * move by the book and at the last moment the giver banks away (decide's skill layer). `swap` false keeps the giver
 * (TR-159's own rows, which name who gives way). Returns { giver, holder, move (or null), rule }.
 */
function byType(row, giver, holder, swap = true) {
  const move = moveFor(giver, row.move);
  if (move) return { ...row, move };
  if (swap && CAN_MOVE.has(holder.standing)) {
    const other = moveFor(holder, giveWayMove(holder, giver));
    if (other) return { giver: holder.id, holder: giver.id, move: other, rule: `${row.rule}; the ${giver.type ?? 'aircraft'} has no ${MOVE_WORDS[row.move] ?? row.move}, so the other gives way` };
  }
  return { ...row, move: null };
}

/**
 * TR-159 (Traffic spec 4.19 item 6; review Q4 (a); a working answer, not yet confirmed with Patrick), between two
 * aircraft flying different patterns, after the rows that match (PFL, fly-through, joining, straight-in). Heights are
 * each one's own pattern height (PATTERN_HEIGHT_FT) within the shared ±100 ft margin (DECONFLICT.higherByFt):
 *  - one climbing or coming down through the other's pattern (100 ft or more off its own height, on the other's side),
 *    and not on final, gives way to one that is not: a CT-156 climbing through 3,000 ft on the upwind (the overtake
 *    near the departure end, review Finding 4) or coming down through it in its final turn;
 *  - one past its perch (final turn or final) has right of way over one that is not (the rows' own "final and past the
 *    perch have right of way"; Patrick's card, Q1: the perch is the point of no return); both past it: the rows after;
 *  - one established in its own pattern at its own height has right of way over one that is not: an Astra joining
 *    (its overhead) or going around gives way to an established CT-156;
 *  - both established, each in its own pattern at its own height: nobody gives way by the book (giver null); at the last
 *    moment both act (decide).
 * Anything else: null, and the rows after it (the higher moves) decide. `a` and `b` are frozen aircraft. These rows name
 * who gives way, so when its type has no such move it is told none and banks away at the last moment (byType, no swap).
 */
function acrossPatterns(a, b) {
  const pick = (giver, holder, move, rule) => ({ giver: giver.id, holder: holder.id, move, rule });
  const through = (f, o) => f.standing !== 'final' && Math.sign(o.ownPatternFt - f.ownPatternFt) * (f.alt - f.ownPatternFt) >= DECONFLICT.higherByFt;
  const established = (f) => f.onOwnPattern && !f.joining && IN_PATTERN.has(f.standing) && Math.abs(f.alt - f.ownPatternFt) < DECONFLICT.higherByFt;
  const pastPerch = (f) => f.standing === 'final_turn' || f.standing === 'final';
  // From the initial or the break, the fly-through (for an Astra, its own go-around: MOVES_BY_TYPE). On the climb-out
  // (a CT-156 overtaking an Astra on the upwind, review Finding 4) the bank away: a side step out and back that keeps
  // its climb along its own upwind and passes clear of the slower aircraft, which turns onto its downwind near the
  // departure end. The breakout is not used there: from near the runway it climbs straight ahead at 140 KIAS and then
  // turns south, toward the Astra's climbing turn (breakout.js; seen in a run without the screen, plan Step 5c Phase 4).
  // Still on the take-off roll (under the shared 100 ft margin above the field) it is told nothing yet: the next decision,
  // half a second on, gives it the bank away once it is off the ground.
  const climbOutMove = (g) => (g.alt >= THRESHOLD_DATA_ELEV_FT + DECONFLICT.higherByFt ? 'bank_away' : null);
  const giveWay = (g, h, rule) => pick(g, h, g.standing === 'initial' || g.standing === 'break' ? 'fly_through' : g.standing === 'climb_out' ? climbOutMove(g) : giveWayMove(g, h), rule);
  const ta = through(a, b), tb = through(b, a);
  if (ta !== tb) return ta ? giveWay(a, b, 'through the other pattern gives way') : giveWay(b, a, 'through the other pattern gives way');
  if (ta) return null;
  const pa = pastPerch(a), pb = pastPerch(b);
  if (pa !== pb) return pa ? giveWay(b, a, 'past the perch has right of way') : giveWay(a, b, 'past the perch has right of way');
  if (pa) return null;
  const ea = established(a), eb = established(b);
  if (ea && eb) return { giver: null, rule: 'each established in its own pattern' };
  if (ea !== eb) return ea ? giveWay(b, a, 'established in its own pattern has right of way') : giveWay(a, b, 'established in its own pattern has right of way');
  return null;
}

/**
 * Who gives way between two frozen aircraft, and how. Returns { giver, holder, move, rule } with giver and
 * holder ids, or { giver: null, rule } when no one can (two PFLs). The same answer whichever is `p` or `q`.
 */
export function rightOfWay(p, q) {
  const [a, b] = p.id < q.id ? [p, q] : [q, p];
  const { row, swap } = bookRow(a, b);
  if (!row.giver) return row;
  const [g, h] = row.giver === a.id ? [a, b] : [b, a];
  return byType(row, g, h, swap);
}

/** The table's row for two frozen aircraft `a` and `b` (in callsign order), before the moves by type: { row, swap }. */
function bookRow(a, b) {
  const pick = (giver, holder, move, rule) => ({ row: { giver: giver.id, holder: holder.id, move, rule }, swap: true });
  const sa = a.standing, sb = b.standing;
  // R3, R6: the PFL keeps right of way. Two PFLs never meet by rule (WFO S2 art 403 para 1d).
  if (sa === 'pfl' || sb === 'pfl') {
    if (sa === sb) return { row: { giver: null, rule: 'two PFLs' } };
    const [g, h] = sa === 'pfl' ? [b, a] : [a, b];
    const move = g.standing === 'initial' || g.standing === 'break' ? 'fly_through' : giveWayMove(g, h);
    return pick(g, h, move, 'PFL has right of way');
  }
  // R2: downwind has right of way over a fly-through, which climbs straight ahead above pattern height and
  // then breaks out (WFO S2 art 401 para 9 Note 1; SMM 4.28 para 67; Patrick's card, Q4).
  const downwind = (s) => s === 'inner_downwind' || s === 'outer_downwind';
  if (sa === 'fly_through' && downwind(sb)) return pick(a, b, 'climb_breakout', 'downwind over fly-through');
  if (sb === 'fly_through' && downwind(sa)) return pick(b, a, 'climb_breakout', 'downwind over fly-through');
  // R1: established in the pattern over joining (SMM 4.5 para 8, 4.15 para 35; Patrick Q9: downwind over rejoining).
  if (sa === 'joining' && IN_PATTERN.has(sb)) return pick(a, b, 'breakout', 'pattern over joining');
  if (sb === 'joining' && IN_PATTERN.has(sa)) return pick(b, a, 'breakout', 'pattern over joining');
  // R4, R5: the perch is the point of no return (Patrick's card, Q1). Before it the aircraft about to perch
  // breaks out; past it the straight-in moves over toward the inner runway and goes around (SMM 4.19 para 43,
  // 4.28 para 68, 4.21 paras 50-51).
  if (sa === 'straight_in' || sb === 'straight_in') {
    const [s, o] = sa === 'straight_in' ? [a, b] : [b, a];
    // One that chose not to extend (TR-74) perches anyway, so the straight-in moves over. So does a type with its own
    // pattern (the Astra): it is not given the breakout and perches (TR-159; its spacing extension is sim.js's).
    if (o.standing === 'inner_downwind' && o.perchAnyway) return pick(s, o, 'move_over', 'aircraft perching ahead did not extend');
    if (o.standing === 'inner_downwind' && o.ownMoves) return pick(s, o, 'move_over', 'aircraft perching ahead flies its own pattern');
    if (o.standing === 'inner_downwind') return pick(o, s, 'breakout', 'straight-in over an aircraft about to perch');
    if (o.standing === 'final_turn' || o.standing === 'final') return pick(s, o, 'move_over', 'final turn over straight-in');
  }
  // Between the two patterns (TR-159): established over through, established over joining (acrossPatterns). These rows
  // name who gives way, so its type's move is not handed to the other (byType `swap` false).
  if (a.patternId !== b.patternId && Number.isFinite(a.ownPatternFt) && Number.isFinite(b.ownPatternFt)) {
    const across = acrossPatterns(a, b);
    if (across) return { row: across, swap: false };
  }
  // No rule (Patrick, 11:25Z): the higher aircraft moves; at the same height the one on the right has right of
  // way, so the one on the left moves; callsign order settles a dead heat (an estimate).
  const dz = a.alt - b.alt;
  if (Math.abs(dz) >= DECONFLICT.higherByFt) {
    const [g, h] = dz > 0 ? [a, b] : [b, a];
    return pick(g, h, giveWayMove(g, h), 'higher aircraft moves');
  }
  const rightOf = (from, to) => {
    const brg = Math.atan2(to.x - from.x, to.y - from.y) * 180 / Math.PI;
    const rel = wrapDeg180(brg - from.trackDeg);
    return rel > 0 && rel < 180;
  };
  const aSeesRight = rightOf(a, b), bSeesRight = rightOf(b, a);
  if (aSeesRight !== bSeesRight) {
    const [g, h] = aSeesRight ? [a, b] : [b, a];
    return pick(g, h, giveWayMove(g, h), 'aircraft on the right has right of way');
  }
  return pick(b, a, giveWayMove(b, a), 'same height, head-on: callsign order');
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
    const route = routeOf(a);
    const track = [];
    if (path && Number.isFinite(a.distFt)) {
      // Along the path at today's ground speed; any gap from the path closes over the join (or 5 s, an estimate).
      const p0 = posOnRoute(path.route, a.distFt, path.options);
      const offX = a.x - p0.x, offY = a.y - p0.y, offZ = a.alt - (p0.alt ?? a.alt);
      const closeSec = a.joinOffset ? Math.max(1, (a.joinOffset.T ?? 5) - (a.joinOffset.t ?? 0)) : 5;
      // Past the end of a path that ends (a straight-in at the runway, a flown move) it runs straight on along
      // the last leg, as it really does (down the runway, or onto its next route), rather than stopping there.
      const endFt = isClosedRoute(path.route) ? Infinity : routeLengthFt(path.route, path.options);
      const at = (d) => {
        if (d <= endFt) return posOnRoute(path.route, d, path.options);
        const e = posOnRoute(path.route, endFt, path.options), r = (e.headingDeg ?? trackDeg) * Math.PI / 180;
        return { ...e, x: e.x + (d - endFt) * Math.sin(r), y: e.y + (d - endFt) * Math.cos(r) };
      };
      for (let i = 0; i <= n; i++) {
        const tSec = i * DECONFLICT.sampleSec;
        const p = at(a.distFt + gsFtps * tSec);
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
    // Its type's pattern and moves (types.js patternRouteId; TR-159): a type with a pattern of its own has its own moves.
    const patternId = typeProfile(a.type).patternRouteId;
    const ownMoves = patternId !== 'PAT1';
    const standing = standingOf(a, route, ownMoves);
    const joining = ownMoves && a.flown?.route?.id === OWN_OVERHEAD_ID && (standing === 'initial' || standing === 'break');
    // A straight-in is on final only on its last leg; further out it breaks out like anyone else (Patrick's Q3, Q7).
    const finalLeg = standing === 'straight_in' && route?.points?.length >= 2 && Number.isFinite(a.distFt)
      ? a.distFt >= pointDistFt(route, route.points.length - 2, path?.options) : undefined;
    out.push({
      id: a.id, x: a.x, y: a.y, alt: a.alt, trackDeg, gsFtps, standing, finalLeg, perchAnyway: a.landing?.perchRoll === 'perch', busy: Boolean(a.spacing?.deconflict), track,
      type: a.type, patternId, ownMoves, ownPatternFt: PATTERN_HEIGHT_FT[patternId], onOwnPattern: route?.id === patternId, joining,
    });
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
      // Layer 1: the one giving way flies the manual's move (its type's: a null move is none it can be given).
      if (giver && row.move && CAN_MOVE.has(giver.standing) && !giver.busy) {
        wanted.push({ t: tCaution, id: giver.id, move: row.move, layer: 'rules', rule: row.rule, with: holder.id });
        continue;
      }
      // Layer 2: the red still coming. The one giving way acts within the skill's look-ahead if it still can;
      // the one with right of way (or both, when no one gives way) acts at the last moment. Off final the move
      // is the flinch, then the breakout; a PFL only banks away (Patrick's card, Q3); an Astra banks away (MOVES_BY_TYPE).
      if (tRed === null) continue;
      if (giver && tRed <= DECONFLICT.skillLookAheadSec && canEvade(giver)) {
        wanted.push({ t: tRed, id: giver.id, move: evasiveMove(giver), layer: 'skill', rule: row.rule, with: holder.id });
      }
      if (tRed <= DECONFLICT.holderLookAheadSec) {
        for (const h of holder ? [holder] : [p, q]) {
          if (canEvade(h)) {
            wanted.push({ t: tRed, id: h.id, move: evasiveMove(h), layer: 'skill', rule: row.rule, with: (h === p ? q : p).id });
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
  if (move === 'extend_downwind') return '[SPACING: extend downwind]';
  const WORDS = { fly_through: 'fly-through', go_around: 'go-around', move_over: 'move over', flinch: 'flinch', bank_away: 'bank away' };
  const what = WORDS[move] ?? 'break out';
  return layer === 'skill' ? `[EVASIVE: ${what}]` : `[GIVING WAY: ${what}]`;
}
