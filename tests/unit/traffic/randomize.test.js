// Checks: Randomize behaviour (Traffic spec 4.13; Patrick, 4 Oct 21:52Z to 22:29Z) flies what a pilot would expect.
// The rolls are repeatable; with the setting at 0 an aircraft always carries on and at 100 never does; a closed
// pattern or High Key chosen on the upwind starts before the crosswind turn, within 3/4 mile past the departure
// end; and the straight-in from the outer downwind comes down to 2,700 ft and 120 KIAS lined up with the runway.
// Expected values: TR-3 (3,500 to 2,700 ft, 140 then 120 KIAS, up to 45° of bank; SMM 4.5 para 8, 4.7 para 12),
// Patrick's 3/4 mile (21:54Z); margins from the shared table (±100 ft, ±10 kt, ±5°).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rollFor, pick, oddsFor, buildDownwindStraightIn, RANDOM } from '../../../src/modules/traffic/randomize.js';
import { createSim } from '../../../src/modules/traffic/sim.js';
import { legOffsetsFt } from '../../../src/core/geo.js';
import { wrapDeg180 } from '../../../src/core/angles.js';
import { gFromBankDeg } from '../../../src/core/flight-math.js';

const MJ = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));
const PAT = MJ.routes.find((r) => r.id === 'PAT1');

test('the rolls are repeatable, and the setting decides how often an aircraft does something different', () => {
  assert.equal(rollFor(7, 'A3', 2), rollFor(7, 'A3', 2));
  assert.notEqual(rollFor(7, 'A3', 2), rollFor(7, 'A3', 3));
  for (let k = 0; k < 200; k++) {
    const u = rollFor(1, 'A1', k);
    assert.ok(u >= 0 && u < 1);
    assert.equal(pick(oddsFor(0).upwind, u), 'carry_on', 'at 0 percent it always carries on');
    assert.notEqual(pick(oddsFor(100).downwind, u), 'carry_on', 'at 100 percent it never carries on');
    assert.notEqual(pick(oddsFor(100).final, u), 'touch_and_go');
  }
});

test('the straight-in from the outer downwind comes down to 2,700 ft and 120 KIAS lined up with the runway (TR-3)', () => {
  const rwy = { a: PAT.points[0], b: PAT.points[1] };
  for (const [windFromDeg, windKt] of [[360, 0], [260, 15], [200, 25]]) {
    const path = buildDownwindStraightIn(PAT.points, { x: PAT.points[5].x, y: PAT.points[5].y, alt: 3500, kias: 220, headingDeg: 118, bankDeg: 0 }, { windFromDeg, windKt });
    const end = path.at(-1);
    assert.ok(Math.abs(legOffsetsFt(rwy.a, rwy.b, end).crossFt) <= 100, 'on the centreline');
    assert.ok(legOffsetsFt(rwy.a, rwy.b, end).alongFt < -2 * 6076, 'a long final, short of the threshold');
    assert.ok(Math.abs(end.alt - RANDOM.straightInAltFt) <= 100, 'at 2,700 ft');
    assert.ok(Math.abs(end.kt - RANDOM.finalTurnKias) <= 10, 'at 120 KIAS');
    assert.ok(path.every((p) => p.alt <= 3500 + 100), 'never climbs');
    assert.ok(path.every((p) => p.g <= gFromBankDeg(RANDOM.turnBankDeg + 5)), 'no more than about 45° of bank');
  }
});

/** One aircraft taking off from 29L with Randomize at `sharePct`; reports where it first left the normal circuit. */
function takeOff(sharePct) {
  const setup = structuredClone(MJ);
  Object.assign(setup, { windFromDeg: 260, windKt: 15, randomize: true, randomizeSharePct: sharePct, deconflict: false });
  setup.aircraft = [{ id: 'A1', type: 'CT-156', routeId: 'PAT1', startIndex: 0, startsAtSec: 0 }];
  const sim = createSim(setup, { seed: 3 });
  const rwy = { a: PAT.points[0], b: PAT.points[1] };
  const len = Math.hypot(rwy.b.x - rwy.a.x, rwy.b.y - rwy.a.y);
  for (let t = 0.5; t <= 150; t += 0.5) {
    sim.stepTo(t);
    const a = sim.state().aircraft[0];
    if (a.phase === 'crosswind') return { left: null };
    if (a.phase === 'closed_pattern' || a.phase === 'climb_high_key') return { left: a.phase, pastEndFt: legOffsetsFt(rwy.a, rwy.b, a).alongFt - len, hdg: a.headingDeg };
  }
  return { left: undefined };
}

test('a closed pattern or High Key chosen on the upwind starts before the crosswind turn, within 3/4 mile past the departure end', () => {
  assert.deepEqual(takeOff(0), { left: null }, 'at 0 percent it carries on to the crosswind turn');
  const r = takeOff(100);
  assert.ok(r.left === 'closed_pattern' || r.left === 'climb_high_key', `it leaves the circuit on the upwind (${r.left})`);
  assert.ok(r.pastEndFt >= -100 && r.pastEndFt <= RANDOM.upwindWindowFt + 300, `past the departure end, within 3/4 mile (${r.pastEndFt.toFixed(0)} ft)`);
  assert.ok(Math.abs(wrapDeg180(r.hdg - 298)) <= 30, 'still on the upwind when it starts');
});
