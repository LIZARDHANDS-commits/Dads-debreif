// Checks: a CT-102B Astra II flown round its outer pattern in the sim, once from its 90 to initial and once from its 45
//   to initial, lands on 29L, then flies the whole lap after the touch-and-go (upwind, crosswind, outside downwind and
//   one of the two ways back to initial) and lands on 29L again. All the way round it stays inside the CT-156's outside
//   downwind; each turn of its outer legs peaks near 45° of bank, and the outer legs are flown near 3,000 ft. In calm air
//   and in the default wind (Traffic spec 4.19 item 11; plan Step 5c Phase 4b; TR-164; TR-R40; testing.md).
// Expected values: 45° at 180 KIAS for the outer turns and the 3,000 ft pattern are Dad's and Patrick's (TR-164, TR-156).
//   The CT-156's outside downwind is Pattern 1's route line through its "Abeam departure end" and "Downwind" points
//   (data/moose-jaw.json, rebuilt by Patrick from the manuals, TR-67), parallel to the runway. The runway is Patrick's
//   measured 29L (src/airfields/cymj-runways.js: 150 ft wide, threshold to departure end); the default wind is the
//   setup's (defaults.js). Margins are the shared table's (±5°, ±100 ft; docs/TESTING.md). A turn is a stretch of more
//   than 10° of bank lasting 3 s or more (an engineering choice, so the small corrections on a leg are not counted).
//   15 minutes is a safety stop only: from the legs to initial to the first landing takes about 3 minutes and a lap
//   about 6½ (spec 4.19 item 11), so only an aircraft that never lands twice reaches it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createSim, STEP_SEC } from '../../../src/modules/traffic/sim.js';
import { DEFAULTS } from '../../../src/modules/traffic/defaults.js';
import { ASTRA_POINT } from '../../../src/modules/traffic/astra-circuit.js';
import { THRESHOLD_29L, DEPARTURE_END_29L, RUNWAY_WIDTH_FT, THRESHOLD_DATA_ELEV_FT } from '../../../src/modules/traffic/airfield.js';
import { legOffsetsFt } from '../../../src/core/geo.js';
import { TOLERANCES } from '../../helpers/tolerances.js';

const mooseJaw = JSON.parse(readFileSync(resolve(process.cwd(), 'src/modules/traffic/data/moose-jaw.json'), 'utf8'));
const PAT1 = mooseJaw.routes.find((r) => r.id === 'PAT1');
const RUNWAY_FT = Math.hypot(DEPARTURE_END_29L.x - THRESHOLD_29L.x, DEPARTURE_END_29L.y - THRESHOLD_29L.y);
const OUTER_BANK_DEG = 45; // Dad's pick, Patrick approved, 13 Oct 2026 (TR-164)
const ASTRA_PATTERN_FT = 3000; // Dad, 13 Oct 2026 (TR-156)
const OUTER_PHASES = new Set(['crosswind', 'outer_downwind', 'initial']); // the outer legs, from the crosswind turn to the break
const TURN_FROM_DEG = 10; // more bank than this is a turn...
const TURN_LEAST_SEC = 3; // ...when it lasts this long (an engineering choice)
const AIRBORNE_FT = 100; // above the runway by this much counts as flying, so the touchdown that follows is a landing
const SAFETY_STOP_SEC = 15 * 60; // a safety stop only: about 3 minutes to the first landing and 6½ for the lap after it

/** Along 29L from the threshold, and out from the centreline on the pattern side (left), feet. */
const frame = (p) => {
  const o = legOffsetsFt(THRESHOLD_29L, DEPARTURE_END_29L, p);
  return { along: o.alongFt, out: -o.crossFt };
};
/** The CT-156's outside downwind, out from the centreline: the nearer of Pattern 1's two outside downwind points. */
const CT156_OUTSIDE_DOWNWIND_FT = Math.min(...['Abeam departure end', 'Downwind'].map((label) => frame(PAT1.points.find((p) => p.label === label)).out));

const STARTS = [['the 90 to initial', ASTRA_POINT.ninetyToInitial], ['the 45 to initial', ASTRA_POINT.fortyFiveToInitial]];
const WINDS = [['calm air', 360, 0], [`the default wind (${DEFAULTS.windKt} kt from ${DEFAULTS.windFromDeg}°T)`, DEFAULTS.windFromDeg, DEFAULTS.windKt]];

test('Astra II outer pattern: from the 90 and the 45 to initial it lands on 29L, flies the lap and lands again, inside the CT-156\'s outside downwind, 45° turns at 3,000 ft', () => {
  assert.ok(CT156_OUTSIDE_DOWNWIND_FT > 6000, `Pattern 1's outside downwind is found (${CT156_OUTSIDE_DOWNWIND_FT.toFixed(0)} ft out)`);
  for (const [windName, windFromDeg, windKt] of WINDS) {
    for (const [startName, startIndex] of STARTS) {
      const name = `${startName}, ${windName}`;
      const setup = {
        ...structuredClone(mooseJaw),
        routes: structuredClone([...mooseJaw.routes, ...mooseJaw.routesForOtherTypes]),
        aircraft: [{ id: 'X1', type: 'CT-102B', routeId: 'PAT_ASTRA', startIndex, startsAtSec: 0 }],
        windFromDeg,
        windKt,
      };
      const sim = createSim(setup, { seed: 1 });
      const landings = [];
      const turns = [];
      const phasesSeen = new Set();
      let airborne = true, turn = null, mostOut = -Infinity;

      for (let k = 1; k * STEP_SEC <= SAFETY_STOP_SEC && landings.length < 2; k++) {
        sim.stepTo(k * STEP_SEC);
        const a = sim.state().aircraft.find((x) => x.id === 'X1');
        if (a?.status !== 'flying') assert.fail(`${name}: still flying at ${(k * STEP_SEC).toFixed(0)} s (${a?.status ?? 'gone'})`);
        const f = frame(a);
        mostOut = Math.max(mostOut, f.out);
        if (!(f.out < CT156_OUTSIDE_DOWNWIND_FT)) assert.fail(`${name}: ${f.out.toFixed(0)} ft out in the ${a.phase}, not inside the CT-156's outside downwind (${CT156_OUTSIDE_DOWNWIND_FT.toFixed(0)} ft)`);
        if (a.alt > THRESHOLD_DATA_ELEV_FT + AIRBORNE_FT) airborne = true;
        if (airborne && a.alt <= THRESHOLD_DATA_ELEV_FT + 1) { landings.push(f); airborne = false; }
        if (!OUTER_PHASES.has(a.phase)) { turn = null; continue; }
        phasesSeen.add(a.phase);
        if (!(Math.abs(a.alt - ASTRA_PATTERN_FT) <= TOLERANCES.ALTITUDE_FT)) assert.fail(`${name}: ${a.alt.toFixed(0)} ft in the ${a.phase}, not near ${ASTRA_PATTERN_FT} ft`);
        if (Math.abs(a.bankDeg) > TURN_FROM_DEG) {
          if (!turn) turns.push(turn = { phase: a.phase, sec: 0, mostDeg: 0 });
          turn.sec += STEP_SEC;
          turn.mostDeg = Math.max(turn.mostDeg, Math.abs(a.bankDeg));
        } else turn = null;
      }

      assert.equal(landings.length, 2, `${name}: lands twice within the ${SAFETY_STOP_SEC / 60} minute safety stop`);
      for (const td of landings) {
        assert.ok(td.along >= 0 && td.along <= RUNWAY_FT, `${name}: touches down ${td.along.toFixed(0)} ft past the 29L threshold, on a ${RUNWAY_FT.toFixed(0)} ft runway`);
        assert.ok(Math.abs(td.out) <= RUNWAY_WIDTH_FT['29L'] / 2, `${name}: touches down ${td.out.toFixed(0)} ft off the centreline`);
      }
      for (const phase of OUTER_PHASES) assert.ok(phasesSeen.has(phase), `${name}: flies the ${phase} leg`);
      const outerTurns = turns.filter((t) => t.sec >= TURN_LEAST_SEC);
      // At least the turns to initial and the crosswind turn (two turns run together into one when the leg between them is
      // short, as the 90 to initial's square leg is in wind), so the check below is never empty.
      assert.ok(outerTurns.length >= 2, `${name}: ${outerTurns.length} turns on the outer legs`);
      for (const t of outerTurns) {
        assert.ok(Math.abs(t.mostDeg - OUTER_BANK_DEG) <= TOLERANCES.ANGLE_DEG, `${name}: a turn in the ${t.phase} peaks at ${t.mostDeg.toFixed(1)}° of bank, not near ${OUTER_BANK_DEG}°`);
      }
      assert.ok(mostOut > 0, `${name}: flies its pattern on the left of 29L`);
    }
  }
});
