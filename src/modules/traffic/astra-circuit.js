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
//   - after a touch-and-go (spec 4.19 item 3, TR-158): full power at about 100 KIAS to 3,000 ft straight ahead, then a
//     30° climbing turn at 90 KIAS onto the same downwind line once 3,000 ft is reached or the departure end is passed,
//     whichever is later.
//
// buildAstraCircuit returns two paths. `track` is the lap after a touch-and-go, from touchdown round to touchdown, a
// closed loop like Pattern 1's: it is the Astra route's flown path (route.js, `flown: 'ct102b-overhead'`). `fromInitial`
// is the overhead: from the initial point through the break to touchdown. Both share the perch and the final.
// Phase names: 'climb', 'crosswind' (the climbing turn), 'downwind', 'final_turn', 'final'; and 'initial' and 'break'
// on the overhead. Nothing here is offered on screen yet (plan Step 5c Phase 3 wires it into the sim and the spawner).
//
// Positions are map feet, x east and y north; headings compass degrees true; speeds KIAS unless named otherwise.
import { ktToFtps } from '../../core/units.js';
import { wrapDeg180 } from '../../core/angles.js';
import { turnRadiusFromBankFt } from '../../core/flight-math.js';
import { legOffsetsFt } from '../../core/geo.js';
import { makePilot, bankFor, trackForLine, lineOf, powerClimb, flyInner, findPerch, breakPointAlongFt, touchdownPointOf, HOLD_RADIUS_FT, LEVEL_OFF_SEC, PILOT_DT, MAX_STEPS } from './circuit.js';
import { THRESHOLD_DATA_ELEV_FT } from './airfield.js';
import { perfFor } from './types.js';

/** Which point of the Astra route (data/moose-jaw.json, PAT_ASTRA) is which. The lap passes 0 to 4 in order. */
export const ASTRA_POINT = Object.freeze({ threshold: 0, departureEnd: 1, downwind: 2, perch: 3, window: 4, initial: 5, break: 6 });

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
  perf: perfFor('CT-102B'),
  downwindLine: true,
  src: Object.freeze({ break: ASTRA_POINT.break, downwind: ASTRA_POINT.downwind, perch: ASTRA_POINT.perch, window: ASTRA_POINT.window }),
});

/** A climbing turn is finished once the track is this close to the downwind line's and the wings this level, degrees (estimates). */
const ON_LINE_DEG = 2;
const WINGS_LEVEL_DEG = 3;
/** The climbing turn starts this close under pattern height, ft: the level-off's last few feet (Pattern 1 uses the same). */
const NEAR_HEIGHT_FT = 50;

/** The downwind line through `perch`: parallel to the runway `th`→`dep`, flown opposite to it. */
function downwindLineThrough(perch, th, dep) {
  const len = Math.hypot(dep.x - th.x, dep.y - th.y);
  return lineOf({ x: perch.x + (dep.x - th.x) / len * 10000, y: perch.y + (dep.y - th.y) / len * 10000 }, perch);
}

/**
 * From touchdown: full power on the centreline at the climb speed to pattern height, then the climbing turn onto the
 * downwind line once at height and past the departure end. Stops once on the line, wings level. Returns { track, end }.
 */
function flyClimbOut(points, centre, downwind, wind, k) {
  const th = points[ASTRA_POINT.threshold], dep = points[ASTRA_POINT.departureEnd];
  const runwayFt = Math.hypot(dep.x - th.x, dep.y - th.y);
  const pilot = makePilot({ ...touchdownPointOf(th, dep), alt: THRESHOLD_DATA_ELEV_FT, ias: k.thresholdKias, hdg: 0, src: ASTRA_POINT.threshold, phase: 'climb', perf: k.perf }, wind);
  const { s } = pilot;
  s.hdg = pilot.headingFor(centre.trackDeg);
  s.tag = 'climb';
  pilot.record();
  let turning = false, turned = 0;
  for (let n = 0; n < MAX_STEPS; n++) {
    const along = legOffsetsFt(th, dep, s).alongFt;
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
      if (turned > 90 && Math.abs(wrapDeg180(downwind.trackDeg - pilot.trackDeg())) < ON_LINE_DEG && Math.abs(bank) < WINGS_LEVEL_DEG && Math.abs(s.bank) < WINGS_LEVEL_DEG) break;
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
 * Builds the Astra's pattern for a wind. `points` are the Astra route's points (ASTRA_POINT); `numbers` the pattern's
 * numbers (ASTRA_PATTERN unless given). Returns { track, fromInitial, perch, breakAlongFt, missFt, lapSec, fromInitialSec }:
 * the lap after a touch-and-go and the overhead from the initial (each [{ x, y, alt, kt, g, bankDeg, src, phase, headingDeg, tag }],
 * ending at touchdown), the perch the search found, where the break starts (ft past the threshold), how far the lap's final
 * turn rolled out from the window (ft), and the seconds each path takes.
 */
export function buildAstraCircuit(points, windFromDeg = 360, windKt = 0, numbers = ASTRA_PATTERN) {
  const k = numbers;
  const wind = { windFromDeg, windKt };
  const th = points[ASTRA_POINT.threshold], dep = points[ASTRA_POINT.departureEnd], win = points[ASTRA_POINT.window];
  const centre = lineOf(th, dep);
  const headwindKt = windKt * Math.cos((windFromDeg - centre.trackDeg) * Math.PI / 180);
  const breakAlong = breakPointAlongFt(headwindKt, Math.hypot(dep.x - th.x, dep.y - th.y), k);

  // The perch, found on the lap: climb-out and climbing turn onto the line through the perch, downwind, final turn.
  const flyLap = (perch, last) => {
    const climb = flyClimbOut(points, centre, downwindLineThrough(perch, th, dep), wind, k);
    const inner = flyInner(points, centre, 0, perch, wind, last?.finalTurnFt, climb.end, { startStage: 'downwind', numbers: k, window: win });
    return { ...inner, climb };
  };
  const { perch, inner: lap, missFt } = findPerch(points[ASTRA_POINT.perch], win, flyLap);

  // The overhead with the same perch: the initial, then the break onto the same line, downwind, final turn and final.
  const initial = flyInitial(points, centre, breakAlong, wind, k);
  const overhead = flyInner(points, centre, breakAlong, perch, wind, lap.finalTurnFt, initial.end, { numbers: k, window: win });

  return {
    track: joined(lap.climb.track, lap.track),
    fromInitial: joined(initial.track, overhead.track),
    perch,
    breakAlongFt: breakAlong,
    missFt,
    lapSec: lap.climb.sec + lap.endSec,
    fromInitialSec: initial.sec + overhead.endSec,
  };
}
