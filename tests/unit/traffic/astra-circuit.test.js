// Checks: a CT-102B Astra II flown round its pattern from the initial (the overhead, then a touch-and-go and the lap
//   round again) lands on 29L both times, never climbs above its pattern height, banks no more than the break's 60° in
//   the break and 30° elsewhere, and flies its downwind inside the CT-156's inner downwind and 500 ft below it. In calm
//   air and in 15 kt from 260°M (Traffic spec 4.19; plan Step 5c Phase 2b; testing.md TR-R36 to TR-R39).
// Expected values: the Astra's numbers are Dad's and Patrick's (TR-154 to TR-156: 3,000 ft MSL, a 60° break, 30° for the
//   other turns); the CT-156's are 3,500 ft MSL (airfield.js PATTERN_ALT_FT), so 500 ft between them. The runway is
//   Patrick's measured 29L (src/airfields/cymj-runways.js, 150 ft wide). The CT-156's downwind is read off Pattern 1 as
//   built in the same wind, as a reference line, never a pinned number. Margins are the shared table's (±100 ft, ±5°;
//   docs/TESTING.md T4). 6 minutes is a safety stop: a pattern from the initial lands in about 2 to 3.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildAstraCircuit } from '../../../src/modules/traffic/astra-circuit.js';
import { buildCircuit } from '../../../src/modules/traffic/circuit.js';
import { THRESHOLD_29L, DEPARTURE_END_29L, RUNWAY_WIDTH_FT, THRESHOLD_DATA_ELEV_FT, magneticToTrue } from '../../../src/modules/traffic/airfield.js';
import { legOffsetsFt } from '../../../src/core/geo.js';
import { TOLERANCES } from '../../helpers/tolerances.js';

const mooseJaw = JSON.parse(readFileSync(resolve(process.cwd(), 'src/modules/traffic/data/moose-jaw.json'), 'utf8'));
const PAT1 = mooseJaw.routes.find((r) => r.id === 'PAT1');
const ASTRA = mooseJaw.routesNotYetInSetup.find((r) => r.id === 'PAT_ASTRA');

const ASTRA_PATTERN_FT = 3000; // Dad, 13 Oct 2026 (TR-156)
const CT156_PATTERN_FT = 3500; // airfield.js PATTERN_ALT_FT
const BREAK_BANK_DEG = 60; // Patrick, 13 Oct 2026 (TR-154)
const TURN_BANK_DEG = 30; // Patrick, 13 Oct 2026 (TR-155)
const SAFETY_STOP_SEC = 6 * 60;
const RUNWAY_FT = Math.hypot(DEPARTURE_END_29L.x - THRESHOLD_29L.x, DEPARTURE_END_29L.y - THRESHOLD_29L.y);

/** Along 29L from the threshold, and out from the centreline on the pattern side (left), feet. */
const frame = (p) => {
  const o = legOffsetsFt(THRESHOLD_29L, DEPARTURE_END_29L, p);
  return { along: o.alongFt, out: -o.crossFt };
};

/** The CT-156's inner downwind at an along-runway distance, by straight lines between its points: { out, alt }, or null off its ends. */
function ct156DownwindAt(downwind, along) {
  for (let i = 1; i < downwind.length; i++) {
    const a = downwind[i - 1], b = downwind[i];
    if ((along - a.along) * (along - b.along) > 0 || a.along === b.along) continue;
    const u = (along - a.along) / (b.along - a.along);
    return { out: a.out + (b.out - a.out) * u, alt: a.alt + (b.alt - a.alt) * u };
  }
  return null;
}

for (const [label, windFromDeg, windKt] of [['calm air', 360, 0], ['15 kt from 260°M', magneticToTrue(260), 15]]) {
  test(`Astra II pattern, ${label}: lands on 29L, stays at its height, banks 60° in the break and 30° elsewhere, downwind inside and 500 ft below the CT-156's`, () => {
    const astra = buildAstraCircuit(ASTRA.points, windFromDeg, windKt);
    const ct156 = buildCircuit(PAT1.points, windFromDeg, windKt);
    const downwind = ct156.track.filter((p) => p.phase === 'downwind').map((p) => ({ ...frame(p), alt: p.alt })).sort((a, b) => a.along - b.along);
    assert.ok(downwind.length > 10, 'the CT-156 has an inner downwind to compare with');

    for (const [name, path, sec] of [['from the initial', astra.fromInitial, astra.fromInitialSec], ['the lap after a touch-and-go', astra.track, astra.lapSec]]) {
      // Lands on the runway: the first point down at the runway's height is inside 29L's length and width, and nothing before it is lower.
      // The lap after a touch-and-go starts on the runway, so look for the landing only once it has been airborne.
      const up = path.findIndex((p) => p.alt > THRESHOLD_DATA_ELEV_FT + 50);
      const down = up < 0 ? -1 : path.findIndex((p, i) => i > up && p.alt <= THRESHOLD_DATA_ELEV_FT + 1);
      assert.ok(down > 0, `${name}: it comes down to the runway`);
      const td = frame(path[down]);
      assert.ok(td.along >= 0 && td.along <= RUNWAY_FT, `${name}: touches down ${td.along.toFixed(0)} ft past the 29L threshold, on a ${RUNWAY_FT.toFixed(0)} ft runway`);
      assert.ok(Math.abs(td.out) <= RUNWAY_WIDTH_FT['29L'] / 2, `${name}: touches down ${td.out.toFixed(0)} ft off the centreline`);
      assert.ok(sec <= SAFETY_STOP_SEC, `${name}: took ${sec.toFixed(0)} s (safety stop ${SAFETY_STOP_SEC} s)`);

      for (const p of path.slice(0, down)) {
        assert.ok(p.alt <= ASTRA_PATTERN_FT + TOLERANCES.ALTITUDE_FT, `${name}: ${p.alt} ft in the ${p.phase}, above ${ASTRA_PATTERN_FT} ft`);
        // The threshold and touchdown markers (circuit.js flyFinal) carry no bank: they are tags on the final, flown wings level.
        if (p.bankDeg == null) continue;
        const most = (p.phase === 'break' ? BREAK_BANK_DEG : TURN_BANK_DEG) + TOLERANCES.ANGLE_DEG;
        assert.ok(Math.abs(p.bankDeg) <= most, `${name}: ${p.bankDeg}° of bank in the ${p.phase}, more than ${most}°`);
      }

      // The downwind: wherever both have one at the same place along the runway, the Astra's is nearer the runway and 500 ft lower.
      let compared = 0;
      for (const p of path.filter((q) => q.phase === 'downwind')) {
        const f = frame(p);
        const ref = ct156DownwindAt(downwind, f.along);
        if (!ref) continue;
        compared++;
        assert.ok(f.out > 0 && f.out < ref.out, `${name}: Astra downwind ${f.out.toFixed(0)} ft out at ${f.along.toFixed(0)} ft along, the CT-156's ${ref.out.toFixed(0)} ft`);
        const below = ref.alt - p.alt;
        assert.ok(Math.abs(below - (CT156_PATTERN_FT - ASTRA_PATTERN_FT)) <= TOLERANCES.ALTITUDE_FT, `${name}: Astra downwind ${below.toFixed(0)} ft below the CT-156's at ${f.along.toFixed(0)} ft along`);
      }
      assert.ok(compared >= 10, `${name}: ${compared} downwind points beside the CT-156's`);
    }
  });
}
