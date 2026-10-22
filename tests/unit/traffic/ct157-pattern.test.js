// Checks: a CT-157 Siskin II (Pilatus PC-21) started at Pattern 1's Initial flies the overhead break, the downwind and the
//   final turn and touches down on 29L, in calm air and in the default wind. All the way round it stays above the field
//   until it is over the runway, and its bank is never steeper than its own wing can hold at the speed it is flying
//   (Traffic spec 4.20; plan Step 5d; TR-167, proposed; testing.md).
// Expected values: the runway is Patrick's measured 29L (src/airfields/cymj-runways.js: 150 ft wide, threshold to
//   departure end) at its field height (airfield.js); the default wind is the setup's (defaults.js). The stall line is
//   standard aerodynamics: the G the wing gives is (speed ÷ the 1 G stall speed) squared, and a level turn's bank is
//   acos(1 ÷ G); the CT-157's stall speed is 92 KIAS flaps and gear up, the Pilatus PC-21 factsheet's figure (public,
//   read through a search summary, unchecked), written here, not read from the code. The bank margin is the shared
//   table's 5° (docs/TESTING.md). "Landed" is the first moment it is down at the runway's height after flying, an event,
//   never a time. 10 minutes is a safety stop only: Initial to touchdown is about three minutes (the run-in, the break,
//   the downwind and the final turn), so only an aircraft that never lands reaches it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createSim, STEP_SEC } from '../../../src/modules/traffic/sim.js';
import { DEFAULTS } from '../../../src/modules/traffic/defaults.js';
import { THRESHOLD_29L, DEPARTURE_END_29L, RUNWAY_WIDTH_FT, THRESHOLD_DATA_ELEV_FT } from '../../../src/modules/traffic/airfield.js';
import { legOffsetsFt } from '../../../src/core/geo.js';
import { TOLERANCES } from '../../helpers/tolerances.js';

const mooseJaw = JSON.parse(readFileSync(resolve(process.cwd(), 'src/modules/traffic/data/moose-jaw.json'), 'utf8'));
const RUNWAY_FT = Math.hypot(DEPARTURE_END_29L.x - THRESHOLD_29L.x, DEPARTURE_END_29L.y - THRESHOLD_29L.y);
const PC21_STALL_KIAS = 92; // Pilatus PC-21 factsheet, flaps and gear up (public, unchecked; spec 4.20)
const INITIAL = 8; // Pattern 1's "Final Entry", the spawner's Initial spot (aircraft.js SPOT_CHOICES, point 9 counted from 1)
const AIRBORNE_FT = 100; // the stall-line check is made in flight, this far above the runway or more
const SAFETY_STOP_SEC = 10 * 60; // a safety stop only: Initial to touchdown is about three minutes

/** Along 29L from the threshold, and off the centreline, feet. */
const frame = (p) => {
  const o = legOffsetsFt(THRESHOLD_29L, DEPARTURE_END_29L, p);
  return { along: o.alongFt, off: Math.abs(o.crossFt) };
};
/** The steepest level-turn bank the wing holds at this speed, degrees (90 where it gives 1 G or less: no turn to limit). */
const stallBankDeg = (kias) => {
  const g = (kias / PC21_STALL_KIAS) ** 2;
  return g > 1 ? Math.acos(1 / g) * 180 / Math.PI : 90;
};

const WINDS = [['calm air', 360, 0], [`the default wind (${DEFAULTS.windKt} kt from ${DEFAULTS.windFromDeg}°T)`, DEFAULTS.windFromDeg, DEFAULTS.windKt]];

test('CT-157 Siskin II: from Pattern 1\'s Initial it flies the overhead and lands on 29L, above the field and inside its own stall line', () => {
  for (const [windName, windFromDeg, windKt] of WINDS) {
    const setup = {
      ...structuredClone(mooseJaw),
      aircraft: [{ id: 'S1', type: 'CT-157', routeId: 'PAT1', startIndex: INITIAL, startsAtSec: 0 }],
      windFromDeg,
      windKt,
    };
    const sim = createSim(setup, { seed: 1 });
    let landed = null;
    let worstBankOver = -Infinity; // how far past its own stall bank it ever was (negative: always inside)
    let lowestOffRunway = Infinity; // its lowest height above the field before it is over the runway

    for (let k = 1; k * STEP_SEC <= SAFETY_STOP_SEC && !landed; k++) {
      sim.stepTo(k * STEP_SEC);
      const a = sim.state().aircraft.find((b) => b.id === 'S1');
      assert.ok(a, `S1 is still in the sim in ${windName}`);
      assert.equal(a.type, 'CT-157');
      const f = frame(a);
      const aboveField = a.alt - THRESHOLD_DATA_ELEV_FT;
      if (f.along < 0 || f.along > RUNWAY_FT) lowestOffRunway = Math.min(lowestOffRunway, aboveField);
      if (aboveField > AIRBORNE_FT) worstBankOver = Math.max(worstBankOver, Math.abs(a.bankDeg ?? 0) - stallBankDeg(a.kt));
      if (aboveField <= 1) landed = f; // it starts at 3,500 ft, so the first time it is down is its landing
    }

    assert.ok(landed, `in ${windName} it lands within the ${SAFETY_STOP_SEC / 60} minute safety stop`);
    assert.ok(landed.along >= 0 && landed.along <= RUNWAY_FT,
      `in ${windName} it touches down ${landed.along.toFixed(0)} ft past the 29L threshold, on a ${RUNWAY_FT.toFixed(0)} ft runway`);
    assert.ok(landed.off <= RUNWAY_WIDTH_FT['29L'] / 2, `in ${windName} it touches down ${landed.off.toFixed(0)} ft off the centreline`);
    assert.ok(lowestOffRunway > 0, `in ${windName} it stays above the field until it is over the runway (lowest ${lowestOffRunway.toFixed(0)} ft)`);
    assert.ok(worstBankOver <= TOLERANCES.ANGLE_DEG,
      `in ${windName} its bank is never more than ${TOLERANCES.ANGLE_DEG}° past its own stall line (worst ${worstBankOver.toFixed(1)}°)`);
  }
});
