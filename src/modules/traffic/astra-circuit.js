// The CT-102B Astra II's pattern at Moose Jaw (Traffic spec 4.19; plan Step 5c Phase 2b; decisions TR-154 to TR-162),
// built by flying it, as Pattern 1 is (circuit.js): the same simulated pilot (makePilot), the same break curve, perch
// search, final turn, final and flare, flown with the Astra's numbers and its own performance set. Nothing here is a
// second copy of a formula: every turn, speed and height law is circuit.js's, called with ASTRA_PATTERN.
//
// The pattern (spec 4.19 item 2), on 29L, left-hand, inside the CT-156's and 500 ft below:
//   - initial at 180 KIAS and 3,000 ft MSL along the runway;
//   - the break at 60°, slowing on the CT-156's break curve from 180 to about 115 KIAS, from the CT-156's break point
//     (2,000 ft past the threshold in a 10 kt headwind, later with more: circuit.js breakPointAlongFt with the Astra's
//     own turn times), rolling out on the downwind line;
//   - the downwind line is set by the final turn: the line through the perch, parallel to the runway. The perch is
//     found by the CT-156's search (circuit.js findPerch) so that a 30° final turn at 90 KIAS rolls out on the 3° path
//     at the window, 0.5 NM before the base of the numbers (TR-157);
//   - final and flare at 90 KIAS (circuit.js flyFinal), landing on 29L;
//   - after a touch-and-go, the outer pattern (spec 4.19 item 11, TR-164; plan Step 5c Phase 4b): full power at about
//     100 KIAS to 3,000 ft straight ahead (TR-158), the upwind level speeding up to 180 KIAS, a 45° crosswind turn and a
//     short crosswind leg, a 45° turn onto the outside downwind (3,000 ft, 180 KIAS, about 1.2 NM out, inside the
//     CT-156's 2.0 NM), then back to the initial by the 90 to initial (90° onto a leg square to the runway, 90° onto
//     initial) or the 45 to initial (135° onto a 45° leg, 45° onto initial), every turn at 45° and 180 KIAS
//     (Patrick, TR-164); then the initial, break, downwind, final turn and final above.
//   - A route with only the first seven points (a setup saved before V2.471) flies the lap it was saved with: the climb
//     straight ahead and a 30° climbing turn at 90 KIAS onto the downwind line (TR-158; spec 4.19 item 3).
//
// buildAstraCircuit returns three paths. `track` is the lap after a touch-and-go, from touchdown round to touchdown, a
// closed loop like Pattern 1's, with the 90 to initial: it is the Astra route's flown path (route.js, `flown:
// 'ct102b-overhead'`). `via45` is the other way round, the 45 to initial, from the branch point on the outside downwind
// (abeam the threshold, `branchFt` along `track`) to touchdown; the sim flies it as a move off the lap and joins the lap
// again on initial. `fromInitial` is the overhead: from the initial point through the break to touchdown. All three
// share the perch and the final.
// Phase names: 'climb' (the climb-out and the upwind), 'crosswind' (the crosswind turn, leg and the turn onto the outside
// downwind), 'outer_downwind', 'initial' (from the turn off the outside downwind: the legs to initial and the initial,
// as Pattern 1 names its 45° leg), 'break', 'downwind', 'final_turn', 'final'. Plan Step 5c Phase 3 wires it into the sim
// (sim.js patternFor) and the spawner, and adds the go-around (buildAstraGoAround, phase 'go_around' until its climbing
// turn) and the spacing extension (buildAstraExtendedDownwind).
//
// Positions are map feet, x east and y north; headings compass degrees true; speeds KIAS unless named otherwise.
import { ktToFtps } from '../../core/units.js';
import { wrapDeg180, wrapDeg360 } from '../../core/angles.js';
import { turnRadiusFromBankFt, turnRateFromBankRadPerSec } from '../../core/flight-math.js';
import { legOffsetsFt } from '../../core/geo.js';
import { makePilot, bankFor, trackForLine, lineOf, ROLL, powerClimb, flyInner, findPerch, breakPointAlongFt, touchdownPointOf, HOLD_RADIUS_FT, LEVEL_OFF_SEC, PILOT_DT, MAX_STEPS } from './circuit.js';
import { THRESHOLD_DATA_ELEV_FT } from './airfield.js';
import { perfFor } from './types.js';

/**
 * Which point of the Astra route (data/moose-jaw.json, PAT_ASTRA) is which. Points 0 to 6 are the inner pattern's (V2.468);
 * 7 to 11 the outer pattern's (V2.471, spec 4.19 item 11), added after them so a start saved by its index keeps its place.
 * The lap after a touch-and-go passes 0, 1, 7, 8, 9, 10, 5, 6, 2, 3, 4 (the 45 to initial passes 11 instead of 10).
 * Points 9 to 11 place the outer legs on the ground (outerLines); 7 and 8 are where the upwind and crosswind are in calm
 * air, for the drawn route only (the pilot starts the crosswind turn at 180 KIAS, so it moves with the wind and the day).
 */
export const ASTRA_POINT = Object.freeze({
  threshold: 0, departureEnd: 1, downwind: 2, perch: 3, window: 4, initial: 5, break: 6,
  upwind: 7, crosswind: 8, outerDownwind: 9, ninetyToInitial: 10, fortyFiveToInitial: 11,
});
/** The fewest points the Astra route can be flown with (the inner pattern's, V2.468), and the fewest for the outer pattern. */
export const ASTRA_FEWEST_POINTS = ASTRA_POINT.break + 1;
export const ASTRA_OUTER_POINTS = ASTRA_POINT.fortyFiveToInitial + 1;
/** An Astra flying off its lap (the overhead from its initial, the 45 to initial) joins the lap again this many path points (0.4 s each) after it rolls out on its downwind or its initial (an engineering choice: wings level on the line). */
export const ASTRA_JOIN_POINTS = 40;
/**
 * With the outer pattern, the go-around holds the inner downwind line until this far past where the lap's break rolls
 * out, ft, before it joins the lap (an engineering choice): joined any earlier, the lap nearest to it is the upwind, a
 * downwind's width away, not the inner downwind (spec 4.19 item 11, "What stays").
 */
export const ASTRA_GO_AROUND_JOIN_PAST_ROLLOUT_FT = 500;
/** The phases of the lap's outer pattern, whose turns are flown at the outer bank (ASTRA_PATTERN.outerTurnBankDeg, TR-164); every other turn is the break's 60° or 30°. */
export const ASTRA_OUTER_PHASES = Object.freeze(['crosswind', 'outer_downwind', 'initial']);

/**
 * The Astra's pattern numbers, in the shape circuit.js flyInner reads (CT156_INNER), plus its climb. Each with its source
 * (spec 4.19 item 4; no Astra manual is in the project files, so none is a manual number):
 *  - patternAltFt 3,000 ft MSL: Dad, 13 Oct 2026 (TR-156); Patrick's working value.
 *  - patternKias 180, the initial: Dad (TR-156). The break starts at it.
 *  - breakBankDeg 60: Patrick, 13 Oct 2026, relayed by Dad (TR-154).
 *  - finalTurnKias 90, at the perch and round the final turn: Dad (TR-156).
 *  - finalTurnBankDeg 30: Patrick, 13 Oct 2026 (TR-155).
 *  - thresholdKias 90: Dad (TR-156).
 *  - climbKias 100: estimate (TR-158, a working answer not yet confirmed with Patrick).
 *  - climbingTurnBankDeg 30: Patrick (TR-155). climbingTurnKias 90: TR-158 gives 90 to 100; 90 makes the turn's
 *    diameter the final turn's, so it rolls out on the same downwind line (physics: radius = TAS² ÷ (g tan bank)).
 *  - outerTurnBankDeg 45 and outerKias 180, every turn of the outer pattern (crosswind, onto the outside downwind, the
 *    90 and the 45 to initial): Dad's pick, Patrick approved, relayed by Dad, 13 Oct 2026 (TR-164).
 *  - perf: the CT-102B's performance set (types.js perfFor; core ct102b-performance.js, its numbers estimates).
 *  - downwindLine: the break rolls out on the line the final turn sets (spec 4.19 item 2).
 *  - src: the route points each piece starts at (ASTRA_POINT).
 */
export const ASTRA_PATTERN = Object.freeze({
  patternAltFt: 3000,
  patternKias: 180,
  breakBankDeg: 60,
  finalTurnKias: 90,
  finalTurnBankDeg: 30,
  thresholdKias: 90,
  climbKias: 100,
  climbingTurnBankDeg: 30,
  climbingTurnKias: 90,
  outerTurnBankDeg: 45,
  outerKias: 180,
  perf: perfFor('CT-102B'),
  downwindLine: true,
  src: Object.freeze({ break: ASTRA_POINT.break, downwind: ASTRA_POINT.downwind, perch: ASTRA_POINT.perch, window: ASTRA_POINT.window }),
});

/** A climbing turn is finished once the track is this close to the downwind line's and the wings this level, degrees (estimates). */
const ON_LINE_DEG = 2;
const WINGS_LEVEL_DEG = 3;
/** The climbing turn starts this close under pattern height, ft: the level-off's last few feet (Pattern 1 uses the same). */
const NEAR_HEIGHT_FT = 50;
/**
 * In an outer turn, bank taken off the outer bank per foot the turn would roll out short of its line (0.05° a foot, about
 * 3° per degree of arc at the outer turn's 3,100 ft radius, as circuit.js's bankFor takes 3° per degree), and the most
 * bank once rolling out. Estimates.
 */
const OUTER_BANK_OFF_PER_FT = 0.05;
const ROLLED_OUT_BANK_DEG = 15;

/** The downwind line through `perch`: parallel to the runway `th`→`dep`, flown opposite to it. */
function downwindLineThrough(perch, th, dep) {
  const len = Math.hypot(dep.x - th.x, dep.y - th.y);
  return lineOf({ x: perch.x + (dep.x - th.x) / len * 10000, y: perch.y + (dep.y - th.y) / len * 10000 }, perch);
}

/**
 * From touchdown: full power on the centreline at the climb speed to pattern height, then the climbing turn onto the
 * downwind line once at height and past the departure end. Stops once on the line, wings level. Returns { track, end }.
 * With `from` (an aircraft's state { x, y, alt, kias, headingDeg, bankDeg }) it is the go-around from there instead
 * (buildAstraGoAround): the same climb along the centreline and the same climbing turn, named 'go_around' until the turn.
 * With `holdTo` ({ alongFt, kias }: buildAstraCircuit's `goAroundJoin`), once on the line it holds the downwind at
 * pattern height, at full power toward `kias`, until it is `alongFt` past the threshold, and stops there.
 */
function flyClimbOut(points, centre, downwind, wind, k, from = null, holdTo = null) {
  const th = points[ASTRA_POINT.threshold], dep = points[ASTRA_POINT.departureEnd];
  const runwayFt = Math.hypot(dep.x - th.x, dep.y - th.y);
  const start = from
    ? { x: from.x, y: from.y, alt: from.alt, ias: from.kias, hdg: from.headingDeg, bank: from.bankDeg ?? 0, src: ASTRA_POINT.threshold, phase: 'go_around', perf: k.perf }
    : { ...touchdownPointOf(th, dep), alt: THRESHOLD_DATA_ELEV_FT, ias: k.thresholdKias, hdg: 0, src: ASTRA_POINT.threshold, phase: 'climb', perf: k.perf };
  const pilot = makePilot(start, wind);
  const { s } = pilot;
  if (!from) s.hdg = pilot.headingFor(centre.trackDeg);
  s.tag = from ? 'go_around' : 'climb';
  pilot.record();
  let turning = false, turned = 0, holding = false;
  for (let n = 0; n < MAX_STEPS; n++) {
    const along = legOffsetsFt(th, dep, s).alongFt;
    if (holding) {
      if (along <= holdTo.alongFt) break;
      const { climb, accel } = powerClimb(pilot, holdTo.kias, k.patternAltFt);
      pilot.step(bankFor(pilot.headingFor(trackForLine(downwind, s, HOLD_RADIUS_FT)), s, 30), climb, accel);
      continue;
    }
    if (s.src < ASTRA_POINT.departureEnd && along >= runwayFt) pilot.mark({ src: ASTRA_POINT.departureEnd });
    if (!turning && along >= runwayFt && s.alt >= k.patternAltFt - NEAR_HEIGHT_FT) {
      turning = true;
      pilot.mark({ phase: 'crosswind', tag: 'climbing_turn' });
    }
    let bank, climb, accel;
    if (!turning) {
      ({ climb, accel } = powerClimb(pilot, k.climbKias, k.patternAltFt));
      bank = bankFor(pilot.headingFor(trackForLine(centre, s, HOLD_RADIUS_FT)), s, 30);
    } else {
      ({ climb, accel } = powerClimb(pilot, k.climbingTurnKias, k.patternAltFt));
      // The circle-onto-a-line law at the turn's own radius: a steady 30° turn that rolls out on the downwind line.
      const R = turnRadiusFromBankFt(ktToFtps(pilot.tasKt()), k.climbingTurnBankDeg);
      bank = bankFor(pilot.headingFor(trackForLine(downwind, s, R)), s, k.climbingTurnBankDeg, 'left');
      if (turned > 90 && Math.abs(wrapDeg180(downwind.trackDeg - pilot.trackDeg())) < ON_LINE_DEG && Math.abs(bank) < WINGS_LEVEL_DEG && Math.abs(s.bank) < WINGS_LEVEL_DEG) {
        if (!holdTo) break;
        holding = true;
        pilot.mark({ src: ASTRA_POINT.downwind, phase: 'downwind', tag: 'downwind' });
        continue;
      }
    }
    const hdgBefore = s.hdg;
    pilot.step(bank, climb, accel);
    if (turning) turned += Math.abs(wrapDeg180(s.hdg - hdgBefore));
  }
  return { track: pilot.points, end: { ...s }, sec: s.k * PILOT_DT };
}

/** The initial: level at pattern height and the initial speed along the centreline, from the initial point to the break point. Returns { track, end }. */
function flyInitial(points, centre, breakAlong, wind, k) {
  const th = points[ASTRA_POINT.threshold], dep = points[ASTRA_POINT.departureEnd], ini = points[ASTRA_POINT.initial];
  const pilot = makePilot({ x: ini.x, y: ini.y, alt: k.patternAltFt, ias: k.patternKias, hdg: 0, src: ASTRA_POINT.initial, phase: 'initial', perf: k.perf }, wind);
  const { s } = pilot;
  s.hdg = pilot.headingFor(centre.trackDeg);
  s.tag = 'initial';
  pilot.record();
  for (let n = 0; n < MAX_STEPS; n++) {
    if (legOffsetsFt(th, dep, s).alongFt >= breakAlong) break;
    const bank = bankFor(pilot.headingFor(trackForLine(centre, s, HOLD_RADIUS_FT)), s, 30);
    pilot.step(bank, (k.patternAltFt - s.alt) / LEVEL_OFF_SEC, 0); // power set for the initial speed
  }
  return { track: pilot.points, end: { ...s }, sec: s.k * PILOT_DT };
}

/** Two pieces joined: the first's last point takes the second's phase (as buildCircuit joins Pattern 1's outer and inner parts). */
function joined(first, second) {
  const a = first.slice();
  if (a.length) a[a.length - 1] = { ...a[a.length - 1], phase: second[0]?.phase ?? a[a.length - 1].phase };
  return [...a, ...second];
}

/**
 * The outer pattern's lines on the ground (spec 4.19 item 11), from the route's points (ASTRA_POINT), fixed as Pattern 1's
 * outer legs are (circuit.js flyOuter): the outside downwind through point 9, parallel to the runway, flown opposite to
 * it; the 90 to initial's leg through point 10, square to the runway, flown toward the centreline; the 45 to initial's
 * leg through point 11, at 45° to the runway, flown toward the centreline and up the runway. The pattern is left-hand,
 * so the legs lie left of the runway direction.
 */
function outerLines(points) {
  const th = points[ASTRA_POINT.threshold], dep = points[ASTRA_POINT.departureEnd];
  const len = Math.hypot(dep.x - th.x, dep.y - th.y);
  const ux = (dep.x - th.x) / len, uy = (dep.y - th.y) / len; // up the runway
  const rx = uy, ry = -ux; // to the right of the runway direction: from the pattern side toward the centreline
  const along = (p, dx, dy) => lineOf(p, { x: p.x + dx * 10000, y: p.y + dy * 10000 });
  return {
    downwind: along(points[ASTRA_POINT.outerDownwind], -ux, -uy),
    square: along(points[ASTRA_POINT.ninetyToInitial], rx, ry),
    leg45: along(points[ASTRA_POINT.fortyFiveToInitial], (ux + rx) / Math.SQRT2, (uy + ry) / Math.SQRT2),
  };
}

/**
 * The outer pattern's pieces share one way of turning onto a line (spec 4.19 item 11): the pilot judges where a steady
 * turn at the outer bank would roll out, and turns when that is on the line. Over the ground a steady turn in wind is not
 * a circle: the turn through the air is (radius = TAS² ÷ (g tan bank), standard aerodynamics), and the wind carries the
 * aircraft along with it for the whole time the turn takes, so the turn ends displaced downwind by the wind times that
 * time (a trochoid). The roll into and out of the bank counts as half its time flown straight. During the turn the same
 * judgement is made again each step: if the turn would now roll out short of the line the bank is eased off it in
 * proportion, never steepened past the outer bank (Patrick's 45°, TR-164). The wings come level at the roll rate once
 * the heading still to go is about what rolling level turns; then the line is held with small corrections. Past the
 * line before the turn could start, the line is joined from where the aircraft is (the hold law below, up to 30°).
 *
 * Why not circuit.js readyToTurnOnto and a circle: scaling the radius by the mean ground speed is close for a 90° turn
 * in light wind but leaves out the drift over the turn's time, and in 15 kt along the outside downwind the 135° turn
 * onto the 45 to initial's leg rolled out some 600 ft past the leg, never settled on it, and so never turned onto
 * initial (seen in runs without the screen, V2.471 part 2). Why not bankFor alone: its 3° of bank per degree of heading
 * error needs some 20° of error to hold 45°, so it falls behind and overshoots. Pattern 1's planned turn (circuit.js
 * plannedBank) is not exported, and circuit.js is the CT-156's and stays as it is.
 * `pilot` is a makePilot; returns { onto(line), ready(line), onLine(line), rolledOut(line), past(line) } bound to it.
 */
function outerTurns(pilot, k) {
  const { s } = pilot;
  let turn = null; // { line, side, rollingOut }: the turn being flown, and which side of the line it began on
  const RAD = Math.PI / 180;
  const onTrack = (line) => Math.abs(wrapDeg180(line.trackDeg - pilot.trackDeg())) < ON_LINE_DEG && Math.abs(s.bank) < WINGS_LEVEL_DEG;
  // The line's right-hand normal (legOffsetsFt's crossFt is positive to the right of the line's direction).
  const normalOf = (line) => ({ x: Math.cos(line.trackDeg * RAD), y: -Math.sin(line.trackDeg * RAD) });
  const crossOf = (line) => legOffsetsFt(line.a, line.b, s).crossFt;
  const groundNow = () => {
    const v = ktToFtps(pilot.tasKt());
    return { x: v * Math.sin(s.hdg * RAD) + pilot.wind.x, y: v * Math.cos(s.hdg * RAD) + pilot.wind.y };
  };
  // Heading turned while the wings roll level from today's bank at the roll rate (circuit.js ROLL): about half today's
  // turn rate over the roll's time. An estimate, good to a degree or so.
  const rollOutDeg = () => {
    const b = Math.abs(s.bank);
    const sec = b / ROLL.maxRateDps + ROLL.maxRateDps / ROLL.maxAccelDps2;
    return turnRateFromBankRadPerSec(Math.max(1, ktToFtps(pilot.tasKt())), b) * 180 / Math.PI * sec / 2;
  };
  /**
   * Where a left turn at the outer bank from here onto heading `toHdg` rolls out, as an offset { x, y } in ft: the arc
   * through the air plus the wind over its time, with `rollInSec` of roll still to come flown half straight on today's
   * heading and the roll-out flown half straight on `toHdg`.
   */
  const turnShift = (toHdg, rollInSec) => {
    const v = Math.max(1, ktToFtps(pilot.tasKt()));
    const R = turnRadiusFromBankFt(v, k.outerTurnBankDeg);
    const rate = turnRateFromBankRadPerSec(v, k.outerTurnBankDeg);
    const toGo = (((s.hdg - toHdg) % 360) + 360) % 360 * RAD; // still to turn, left
    const h0 = s.hdg * RAD, h1 = h0 - toGo, sec = toGo / rate;
    const rollOutSec = k.outerTurnBankDeg / ROLL.maxRateDps + ROLL.maxRateDps / ROLL.maxAccelDps2;
    const w = pilot.wind;
    return {
      x: R * (Math.cos(h1) - Math.cos(h0)) + w.x * sec + (v * Math.sin(h0) + w.x) * rollInSec / 2 + (v * Math.sin(h1) + w.x) * rollOutSec / 2,
      y: R * (Math.sin(h0) - Math.sin(h1)) + w.y * sec + (v * Math.cos(h0) + w.y) * rollInSec / 2 + (v * Math.cos(h1) + w.y) * rollOutSec / 2,
    };
  };
  /** Cross-track offset from `line`, ft, where the turn onto it would roll out, with `rollInSec` of roll still to come. */
  const endCross = (line, rollInSec) => {
    const d = turnShift(pilot.headingFor(line.trackDeg), rollInSec), n = normalOf(line);
    return crossOf(line) + d.x * n.x + d.y * n.y;
  };
  const closing = (line) => {
    const g = groundNow(), n = normalOf(line);
    return Math.sign(crossOf(line)) * (g.x * n.x + g.y * n.y) < 0;
  };
  return {
    /** The bank to turn onto `line` (a left turn) and hold it. */
    onto(line) {
      if (turn?.line === line && onTrack(line)) turn = null;
      if (turn?.line !== line) return bankFor(pilot.headingFor(trackForLine(line, s, HOLD_RADIUS_FT)), s, 30);
      const lineHdg = pilot.headingFor(line.trackDeg);
      const toGo = ((s.hdg - lineHdg) % 360 + 360) % 360; // heading still to turn, left
      if (turn.rollingOut || (toGo < 180 && toGo <= rollOutDeg())) {
        turn.rollingOut = true;
        return bankFor(lineHdg, s, ROLLED_OUT_BANK_DEG, 'left');
      }
      // Would the turn at the outer bank roll out short of the line (still on the side it began on)? Ease off by that much.
      const rollInSec = Math.max(0, k.outerTurnBankDeg - Math.abs(s.bank)) / ROLL.maxRateDps;
      const shortFt = endCross(line, rollInSec) * turn.side;
      return Math.max(-k.outerTurnBankDeg, Math.min(0, -k.outerTurnBankDeg + OUTER_BANK_OFF_PER_FT * Math.max(0, shortFt)));
    },
    /** True (and the turn onto `line` begun) when it is time to turn onto it: the turn would roll out on it or past it. */
    ready(line) {
      const cross = crossOf(line);
      if (!closing(line)) return false;
      const rollInSec = Math.max(0, k.outerTurnBankDeg - Math.abs(s.bank)) / ROLL.maxRateDps + ROLL.maxRateDps / ROLL.maxAccelDps2;
      if (endCross(line, rollInSec) * Math.sign(cross) > 0) return false;
      turn = { line, side: Math.sign(cross) || 1, rollingOut: false };
      return true;
    },
    /** Settled on `line`: the turn flown, along its track with the wings level. */
    onLine(line) {
      return turn?.line !== line && onTrack(line);
    },
    /** The turn onto `line` is over or rolling out (the wings coming level). */
    rolledOut(line) {
      return turn?.line !== line || turn.rollingOut;
    },
    /** Already on the far side of `line` from `sideOf` (a point on the near side), or moving away from it. */
    past(line, sideOf) {
      const near = Math.sign(legOffsetsFt(line.a, line.b, sideOf).crossFt);
      return Math.sign(crossOf(line)) !== near;
    },
  };
}

/**
 * The lap's way out (spec 4.19 item 11): from touchdown, full power on the centreline at the climb speed to pattern height
 * (TR-158); past the departure end and at height the upwind, level, speeding up at full power to the outer speed; there
 * the crosswind turn at the outer bank onto the crosswind track (the runway's less 90°, held for the wind), the crosswind
 * leg, and the turn onto the outside downwind line. It stops on the outside downwind abeam the threshold, the branch
 * point where the 90 and the 45 to initial part (both flown from here by flyToInitial). Returns { track, end, sec }.
 * The crosswind turn starts at the outer speed, as Pattern 1's starts at its pattern speed (circuit.js flyOuter), so the
 * upwind is shorter into a headwind; an engineering choice, Patrick to confirm.
 */
function flyOutbound(points, centre, lines, wind, k) {
  const th = points[ASTRA_POINT.threshold], dep = points[ASTRA_POINT.departureEnd];
  const runwayFt = Math.hypot(dep.x - th.x, dep.y - th.y);
  const pilot = makePilot({ ...touchdownPointOf(th, dep), alt: THRESHOLD_DATA_ELEV_FT, ias: k.thresholdKias, hdg: 0, src: ASTRA_POINT.threshold, phase: 'climb', perf: k.perf }, wind);
  const { s } = pilot;
  s.hdg = pilot.headingFor(centre.trackDeg);
  s.tag = 'climb';
  pilot.record();
  const turns = outerTurns(pilot, k);
  const crosswindTrack = wrapDeg360(centre.trackDeg - 90);
  let stage = 'climb';
  for (let n = 0; n < MAX_STEPS; n++) {
    const along = legOffsetsFt(th, dep, s).alongFt;
    if (s.src < ASTRA_POINT.departureEnd && along >= runwayFt) pilot.mark({ src: ASTRA_POINT.departureEnd });
    let bank;
    const { climb, accel } = powerClimb(pilot, stage === 'climb' ? k.climbKias : k.outerKias, k.patternAltFt);
    if (stage === 'climb') {
      bank = bankFor(pilot.headingFor(trackForLine(centre, s, HOLD_RADIUS_FT)), s, 30);
      if (along >= runwayFt && s.alt >= k.patternAltFt - NEAR_HEIGHT_FT) { stage = 'upwind'; pilot.mark({ src: ASTRA_POINT.upwind, tag: 'upwind' }); }
    } else if (stage === 'upwind') {
      bank = bankFor(pilot.headingFor(trackForLine(centre, s, HOLD_RADIUS_FT)), s, 30);
      if (s.ias >= k.outerKias - 0.5) { stage = 'crosswind'; pilot.mark({ src: ASTRA_POINT.crosswind, phase: 'crosswind', tag: 'crosswind' }); }
    } else if (stage === 'crosswind') {
      bank = bankFor(pilot.headingFor(crosswindTrack), s, k.outerTurnBankDeg, 'left');
      if (turns.ready(lines.downwind)) stage = 'downwindTurn';
    } else if (stage === 'downwindTurn') {
      bank = turns.onto(lines.downwind);
      if (turns.onLine(lines.downwind)) { stage = 'downwind'; pilot.mark({ src: ASTRA_POINT.outerDownwind, phase: 'outer_downwind', tag: 'outer_downwind' }); }
    } else {
      bank = turns.onto(lines.downwind);
      if (legOffsetsFt(th, dep, s).alongFt <= 0) { pilot.mark({}); break; } // abeam the threshold: the branch point
    }
    pilot.step(bank, climb, accel);
  }
  return { track: pilot.points, end: { ...s }, sec: s.k * PILOT_DT };
}

/**
 * From the branch point on the outside downwind (`from`, flyOutbound's end) back to the initial and on to the break point:
 * the outside downwind held, then the turn onto `via` (the 90's square leg or the 45's leg, outerLines) at the outer bank,
 * named 'initial' and starting route point `viaSrc`; the leg; the turn onto the centreline at the outer bank; the initial
 * held at the outer speed (route point 5 from where it is settled on the centreline) to the break point `breakAlong`.
 * Returns { track, end, sec }.
 */
function flyToInitial(points, centre, breakAlong, lines, via, viaSrc, wind, k, from) {
  const th = points[ASTRA_POINT.threshold], dep = points[ASTRA_POINT.departureEnd];
  const pilot = makePilot({ x: from.x, y: from.y, alt: from.alt, ias: from.ias, hdg: from.hdg, bank: from.bank, rollRate: from.rollRate, src: from.src, phase: from.phase, perf: k.perf }, wind);
  const { s } = pilot;
  s.tag = from.tag;
  pilot.record();
  const turns = outerTurns(pilot, k);
  let stage = 'downwind';
  for (let n = 0; n < MAX_STEPS; n++) {
    const { climb, accel } = powerClimb(pilot, k.outerKias, k.patternAltFt);
    let bank;
    if (stage === 'downwind') {
      bank = turns.onto(lines.downwind);
      if (turns.ready(via)) { stage = 'via'; pilot.mark({ src: viaSrc, phase: 'initial', tag: 'to_initial' }); }
    } else if (stage === 'via') {
      bank = turns.onto(via);
      // Onto initial once the turn onto the leg is over or rolling out and the turn onto the centreline is due; or, if it
      // is somehow already past the centreline, joined from there (never flying on across it).
      if (turns.rolledOut(via) && (turns.ready(centre) || turns.past(centre, from))) stage = 'initialTurn';
    } else if (stage === 'initialTurn') {
      bank = turns.onto(centre);
      if (turns.onLine(centre)) { stage = 'initial'; pilot.mark({ src: ASTRA_POINT.initial, tag: 'initial' }); }
    } else {
      bank = turns.onto(centre);
      if (legOffsetsFt(th, dep, s).alongFt >= breakAlong) break;
    }
    pilot.step(bank, climb, accel);
  }
  return { track: pilot.points, end: { ...s }, sec: s.k * PILOT_DT };
}

/** Path length, ft, from the first of `track`'s points to point `to` (as route.js measures a flown path: straight between points). */
function lengthTo(track, to) {
  let ft = 0;
  for (let i = 1; i <= to && i < track.length; i++) ft += Math.hypot(track[i].x - track[i - 1].x, track[i].y - track[i - 1].y);
  return ft;
}

/**
 * Builds the Astra's pattern for a wind. `points` are the Astra route's points (ASTRA_POINT); `numbers` the pattern's
 * numbers (ASTRA_PATTERN unless given). Returns { track, via45, via45JoinIndex, branchFt, drawn, goAroundJoin, fromInitial,
 * perch, breakAlongFt, missFt, lapSec, via45Sec, fromInitialSec }:
 *  - track: the lap after a touch-and-go with the 90 to initial (the route's flown path), from touchdown to touchdown;
 *  - via45: the 45 to initial from the branch point on the outside downwind to touchdown, and via45JoinIndex the point of
 *    it where the sim joins the lap again on initial (ASTRA_JOIN_POINTS after it is settled on the centreline);
 *    branchFt: how far along `track` the branch point is (where via45 starts, the same place, speed and heading);
 *  - drawn: the line to draw, the lap with the 45 to initial as a spur off it (out along via45 to its join, then back);
 *  - goAroundJoin: { alongFt, kias }, where a go-around hands over to the lap (buildAstraGoAround's `holdTo`): on the
 *    inner downwind ASTRA_GO_AROUND_JOIN_PAST_ROLLOUT_FT past the break's roll-out (ft past the threshold), and the
 *    lap's speed there;
 *  - fromInitial: the overhead from the initial point to touchdown;
 * each path [{ x, y, alt, kt, g, bankDeg, src, phase, headingDeg, tag }]; the perch the search found, where the break
 * starts (ft past the threshold), how far the lap's final turn rolled out from the window (ft), and the seconds each path
 * takes (via45Sec from the branch point). A route with only the inner pattern's points (fewer than ASTRA_OUTER_POINTS)
 * gets the V2.468 lap and no via45.
 */
export function buildAstraCircuit(points, windFromDeg = 360, windKt = 0, numbers = ASTRA_PATTERN) {
  const k = numbers;
  const wind = { windFromDeg, windKt };
  const th = points[ASTRA_POINT.threshold], dep = points[ASTRA_POINT.departureEnd], win = points[ASTRA_POINT.window];
  const centre = lineOf(th, dep);
  const headwindKt = windKt * Math.cos((windFromDeg - centre.trackDeg) * Math.PI / 180);
  const breakAlong = breakPointAlongFt(headwindKt, Math.hypot(dep.x - th.x, dep.y - th.y), k);
  const initial = flyInitial(points, centre, breakAlong, wind, k);
  if (points.length < ASTRA_OUTER_POINTS) return buildInnerLap(points, centre, breakAlong, initial, wind, k);

  // The outer pattern, flown once to the branch point, then each way back to the initial and the break point.
  const lines = outerLines(points);
  const outbound = flyOutbound(points, centre, lines, wind, k);
  const ninety = flyToInitial(points, centre, breakAlong, lines, lines.square, ASTRA_POINT.ninetyToInitial, wind, k, outbound.end);
  const fortyFive = flyToInitial(points, centre, breakAlong, lines, lines.leg45, ASTRA_POINT.fortyFiveToInitial, wind, k, outbound.end);
  // The perch, found on the lap (the 90 to initial's break); the 45's and the overhead's break fly to the same perch.
  const { perch, inner: lap, missFt } = findPerch(points[ASTRA_POINT.perch], win, (tryPerch, last) => flyInner(points, centre, breakAlong, tryPerch, wind, last?.finalTurnFt, ninety.end, { numbers: k, window: win }));
  const via45Inner = flyInner(points, centre, breakAlong, perch, wind, lap.finalTurnFt, fortyFive.end, { numbers: k, window: win });
  const overhead = flyInner(points, centre, breakAlong, perch, wind, lap.finalTurnFt, initial.end, { numbers: k, window: win });

  const track = joined(joined(outbound.track, ninety.track), lap.track);
  const branchIndex = outbound.track.length; // ninety's first point, where via45 starts too
  const via45 = joined(fortyFive.track, via45Inner.track);
  const onInitial = via45.findIndex((q) => q.src === ASTRA_POINT.initial);
  const via45JoinIndex = onInitial < 0 ? via45.length - 1 : Math.min(via45.length - 1, onInitial + ASTRA_JOIN_POINTS);
  const spur = via45.slice(0, via45JoinIndex + 1);
  const drawn = [...track.slice(0, branchIndex), ...spur, ...spur.slice(0, -1).reverse(), ...track.slice(branchIndex + 1)].map((q) => ({ x: q.x, y: q.y, alt: q.alt }));
  // Where a go-around hands over to the lap: on the inner downwind, ASTRA_GO_AROUND_JOIN_PAST_ROLLOUT_FT past the break's
  // roll-out, at the lap's speed there.
  const rolloutIndex = track.findIndex((q) => q.tag === 'break_rollout');
  let goAroundJoin = null;
  if (rolloutIndex >= 0) {
    const alongFt = legOffsetsFt(th, dep, track[rolloutIndex]).alongFt - ASTRA_GO_AROUND_JOIN_PAST_ROLLOUT_FT;
    const at = track.find((q, i) => i > rolloutIndex && legOffsetsFt(th, dep, q).alongFt <= alongFt) ?? track[rolloutIndex];
    goAroundJoin = { alongFt, kias: at.kt };
  }
  return {
    track,
    goAroundJoin,
    via45,
    via45JoinIndex,
    branchFt: lengthTo(track, branchIndex),
    drawn,
    fromInitial: joined(initial.track, overhead.track),
    perch,
    breakAlongFt: breakAlong,
    missFt,
    lapSec: outbound.sec + ninety.sec + lap.endSec,
    via45Sec: fortyFive.sec + via45Inner.endSec,
    fromInitialSec: initial.sec + overhead.endSec,
  };
}

/**
 * The V2.468 lap, for a route with only the inner pattern's points (a setup saved before V2.471): the climb-out and 30°
 * climbing turn onto the line through the perch (flyClimbOut), downwind, final turn and final; and the overhead with the
 * same perch. Returns buildAstraCircuit's answer without via45.
 */
function buildInnerLap(points, centre, breakAlong, initial, wind, k) {
  const th = points[ASTRA_POINT.threshold], dep = points[ASTRA_POINT.departureEnd], win = points[ASTRA_POINT.window];
  // The perch, found on the lap: climb-out and climbing turn onto the line through the perch, downwind, final turn.
  const flyLap = (perch, last) => {
    const climb = flyClimbOut(points, centre, downwindLineThrough(perch, th, dep), wind, k);
    const inner = flyInner(points, centre, 0, perch, wind, last?.finalTurnFt, climb.end, { startStage: 'downwind', numbers: k, window: win });
    return { ...inner, climb };
  };
  const { perch, inner: lap, missFt } = findPerch(points[ASTRA_POINT.perch], win, flyLap);
  // The overhead with the same perch: the initial, then the break onto the same line, downwind, final turn and final.
  const overhead = flyInner(points, centre, breakAlong, perch, wind, lap.finalTurnFt, initial.end, { numbers: k, window: win });
  const track = joined(lap.climb.track, lap.track);
  return {
    track,
    drawn: track,
    fromInitial: joined(initial.track, overhead.track),
    perch,
    breakAlongFt: breakAlong,
    missFt,
    lapSec: lap.climb.sec + lap.endSec,
    fromInitialSec: initial.sec + overhead.endSec,
  };
}

/**
 * The Astra's go-around from an aircraft's state `from` = { x, y, alt, kias, headingDeg, bankDeg } (spec 4.19 item 3,
 * TR-158: "a go-around climbs straight to 3,000 ft and rejoins downwind"; the level is an engineering choice, Patrick to
 * confirm): full power along the runway centreline at the climb speed to pattern height, then, once at height and past
 * the departure end, the 30° climbing turn onto the downwind line, the same climb-out and turn as the lap after a
 * touch-and-go (flyClimbOut). It stops once on the downwind line, wings level, where the Astra route carries on (sim.js
 * goAroundEnded). `points` are the Astra route's; the downwind line is the one through today's perch (the route's lap,
 * buildAstraCircuit's `perch`, passed in). With the outer pattern the lap's upwind is the nearest part of the lap to
 * where the climbing turn rolls out, so the go-around holds the downwind line on to `holdTo` (buildAstraCircuit's
 * `goAroundJoin`: about 500 ft past the break's roll-out) before it stops and joins the lap there (spec 4.19 item 11;
 * an engineering choice). Returns the path [{ x, y, alt, kt, g, bankDeg, src, phase, headingDeg, tag }].
 */
export function buildAstraGoAround(points, from, windFromDeg, windKt, perch, numbers = ASTRA_PATTERN, holdTo = null) {
  const th = points[ASTRA_POINT.threshold], dep = points[ASTRA_POINT.departureEnd];
  return flyClimbOut(points, lineOf(th, dep), downwindLineThrough(perch, th, dep), { windFromDeg, windKt }, numbers, from, holdTo).track;
}

/**
 * Spacing on final for the Astra (TR-R18; spec 4.19 item 6), the same shape as the CT-156's (circuit.js
 * buildExtendedDownwind) with the Astra's numbers: from its state `from` on its downwind it flies on past today's perch
 * by `extendFt` before its 30° final turn, so it rolls out further out on the centreline, behind the traffic on final;
 * the final turn comes down to the glide path's height at its rollout (the window's own slope carried further out).
 * The path stops on final `joinBeforeWindowFt` inside the Astra's window, where its route carries on. Returns
 * { track, rollout, rolloutSec, endSec }, as buildExtendedDownwind does.
 */
export function buildAstraExtendedDownwind(points, from, windFromDeg, windKt, perch, extendFt, joinBeforeWindowFt = 1000, numbers = ASTRA_PATTERN) {
  const th = points[ASTRA_POINT.threshold], dep = points[ASTRA_POINT.departureEnd], win = points[ASTRA_POINT.window];
  const centre = lineOf(th, dep);
  const back = (centre.trackDeg + 180) * Math.PI / 180;
  const extended = { x: perch.x + extendFt * Math.sin(back), y: perch.y + extendFt * Math.cos(back) };
  const windowFt = Math.hypot(win.x - th.x, win.y - th.y);
  const slope = (win.alt - THRESHOLD_DATA_ELEV_FT) / windowFt;
  const start = { x: from.x, y: from.y, alt: from.alt, ias: from.kias, hdg: from.headingDeg, bank: from.bankDeg ?? 0 };
  const inner = flyInner(points, centre, 0, extended, { windFromDeg, windKt }, null, start, {
    startStage: 'downwind',
    finalTurnFromAlt: from.alt,
    finalTurnEndAlt: THRESHOLD_DATA_ELEV_FT + slope * (windowFt + extendFt),
    stopToGoFt: windowFt - joinBeforeWindowFt,
    numbers,
    window: win,
  });
  return { track: inner.track, rollout: inner.rollout, rolloutSec: inner.rolloutSec, endSec: inner.endSec };
}
