// Large exercises (DB-37, DB-R30; Dad, 15 Oct 2026; Patrick approved, relayed by Dad, 16 Oct 2026): a 16-file load is
// four flights, and each flight is judged exactly as that four-ship is when loaded alone.
//
// Expected values: real recorded data judged by the existing four-ship code (T3). The example flight's four real tracks
// (V6's, 2 Jun 2026, original/assets) are loaded as four flights, every flight led by the same Lead track (so every
// flight sits on the same map origin as its four-ship load) with its wingmen in a different order, so each flight's
// judging differs and a flight judged with another flight's ships would fail. Each four-ship is then loaded alone with
// the same order and judged by readoutsAt, and the exercise's per-flight judging must equal it at every minute of the
// replay. No number is copied from the code's output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadFlight, MAX_SHIPS } from '../../../src/flight-data/load.js';
import { EXAMPLE_FLIGHT } from '../../../src/flight-data/examples.js';
import { DEFAULT_STANDARDS } from '../../../src/core/standards.js';
import { readoutsAt } from '../../../src/modules/debrief/readouts.js';
import { flightGroups, readoutsByFlight, isExercise } from '../../../src/modules/debrief/exercise.js';

const text = (asset) => readFileSync(new URL(`../../../original/assets/${asset}`, import.meta.url), 'utf8');
const TRACKS = EXAMPLE_FLIGHT.map((e) => ({ name: e.name, text: text(e.asset) }));
// Each flight's ships, as indexes into the example's four tracks: Lead first, then #2, #3, #4.
const FLIGHTS = [[0, 1, 2, 3], [0, 2, 3, 1], [0, 3, 1, 2], [0, 1, 3, 2]];

test('a 16-file load is four flights, each judged as its four-ship is loaded alone (DB-R30)', () => {
  const files = FLIGHTS.flatMap((order, f) => order.map((k, n) => ({ slot: f * 4 + n + 1, name: `F${f + 1}-${TRACKS[k].name}`, text: TRACKS[k].text })));
  const exercise = loadFlight(files, { maxTracks: MAX_SHIPS });
  assert.ok(isExercise(exercise));
  assert.deepEqual(flightGroups(exercise).map((g) => [g.f, g.slots.length]), [[1, 4], [2, 4], [3, 4], [4, 4]]);

  const alone = FLIGHTS.map((order) => loadFlight(order.map((k, n) => ({ slot: n + 1, name: TRACKS[k].name, text: TRACKS[k].text }))));
  const options = { standards: DEFAULT_STANDARDS };
  let judged = 0;
  let differ = 0;
  for (let t = Math.ceil(exercise.startT); t <= exercise.endT; t += 60) {
    const byFlight = readoutsByFlight(exercise, t, () => options);
    for (const [i, one] of byFlight.entries()) {
      const own = readoutsAt(alone[i], t, options);
      assert.deepEqual(one.readouts.formation, own.formation, `flight ${one.f} formation at ${t}`);
      assert.deepEqual(one.readouts.lead, own.lead, `flight ${one.f} Lead at ${t}`);
      judged += own.formation.filter((row) => row.state === 'ok').length;
    }
    if (JSON.stringify(byFlight[1].readouts.formation) !== JSON.stringify(byFlight[0].readouts.formation)) differ++;
  }
  assert.ok(judged > 100, 'the wingmen were judged through the flight, not only on the ground');
  assert.ok(differ > 10, "flight 2's judging is its own, not flight 1's");
});
