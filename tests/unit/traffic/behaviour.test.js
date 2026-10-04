// Checks: the behaviour tag (Traffic spec 4.14, TR-60; Patrick, 4 Oct 22:53Z and 22:57Z) is on every flying aircraft
// and its configuration is what a pilot would have: clean through the initial and break, gear down on the inner
// downwind below 147 KIAS, landing flap on final; a straight-in with its gear down on base and the landing flap in
// the window. Expected values: SMM 4.6 para 9, 4.8 para 13, 4.17 paras 38-41, 4.19 paras 43, 48 (spec 4.14 item 3).
// Nothing here pins the tag's words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSim } from '../../../src/modules/traffic/sim.js';
import { getPflBadge } from '../../../src/modules/traffic/map2d.js';
import { scenarioAircraft } from '../../../src/modules/traffic/setup-panel.js';
import { CONFIG, BEHAVIOUR } from '../../../src/modules/traffic/behaviour.js';

const MJ = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));
const configOf = (tag) => tag?.match(/ · ([^\]]+)\]$/)?.[1] ?? null;

/** Flies one aircraft and returns, per phase, the configurations seen with the lowest and highest speed. */
function fly(routeId, seconds) {
  const sim = createSim({ ...MJ, windKt: 15, windFromDeg: 260, aircraft: [{ id: 'A1', type: 'CT-156', routeId, startIndex: 0, startsAtSec: 0 }] }, { seed: 1 });
  const seen = [];
  for (let t = 0.5; t <= seconds; t += 0.5) {
    sim.stepTo(t);
    const a = sim.state().aircraft[0];
    if (a.status === 'flying') seen.push({ t, phase: a.phase, kt: a.kt, leg: a.leg, tag: a.behaviour, config: configOf(a.behaviour) });
  }
  return seen;
}

test('round Pattern 1 the configuration is clean to the break, gear down on the inner downwind below 147, landing flap on final', () => {
  const seen = fly('PAT1', 450);
  assert.ok(seen.every((s) => s.tag), 'every step has a tag');
  for (const s of seen.filter((s) => s.phase === 'initial' || s.phase === 'break')) assert.equal(s.config, CONFIG.clean);
  const downwind = seen.filter((s) => s.phase === 'downwind' && s.kt < BEHAVIOUR.downwindGearKias - 1);
  assert.ok(downwind.length > 0, 'it slows below 147 on the inner downwind');
  for (const s of downwind) assert.equal(s.config, CONFIG.gearTakeOffFlap);
  const final = seen.filter((s) => s.phase === 'final_turn' || s.phase === 'final');
  assert.ok(final.length > 0);
  for (const s of final) assert.equal(s.config, CONFIG.gearLandingFlap);
});

test('a straight-in is clean before base, has its gear down on base and the landing flap before it lands', () => {
  const seen = fly('ENT2', 390).filter((s) => s.phase !== 'climb');
  assert.ok(seen.every((s) => s.tag));
  assert.equal(seen[0].config, CONFIG.clean, 'clean on the way in');
  assert.ok(seen.filter((s) => s.leg === 2).every((s) => s.config === CONFIG.gearTakeOffFlap), 'gear and T/O flap on base');
  assert.equal(seen.at(-1).config, CONFIG.gearLandingFlap, 'landing flap by the runway');
});

test('in a busy circuit with Randomize on, every flying aircraft has a tag', () => {
  const aircraft = scenarioAircraft('busy', { routes: MJ.routes, seed: 2 });
  const sim = createSim({ ...MJ, deconflict: true, randomize: true, randomizeSharePct: 60, windKt: 15, windFromDeg: 260, aircraft }, { seed: 2 });
  for (let t = 5; t <= 600; t += 5) {
    sim.stepTo(t);
    for (const a of sim.state().aircraft) {
      if (a.status === 'flying') assert.ok(getPflBadge(a), `${a.id} at ${t} s (${a.phase}) has a tag`);
    }
  }
});
