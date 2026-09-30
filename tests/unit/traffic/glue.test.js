// The glue between the settings and the engine's setup (src/modules/traffic/glue.js), and
// that the settings reach a running sim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyToSetup, memoryStore, pauseOnThrow, within } from '../../../src/modules/traffic/glue.js';
import { DEFAULTS, LIMITS } from '../../../src/modules/traffic/defaults.js';
import { createSim } from '../../../src/modules/traffic/sim.js';
import { createClock } from '../../../src/modules/traffic/clock.js';
import { createSettings } from '../../../src/storage/settings.js';

const MOOSE_JAW = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));

test('the defaults reach the setup as the spec\'s Defaults table says: 200 ft and 200 ft, caution 500 ft and 500 ft, rounded turns, radius from G, 1,800 ft', () => {
  const setup = {};
  applyToSetup(setup, { ...DEFAULTS });
  assert.deepEqual(setup.conflictLimits, { latFt: 200, vertFt: 200, cautionLatFt: 500, cautionVertFt: 500 });
  assert.deepEqual(setup.routeOptions, { flyRoundedTurns: true, radiusFromG: true, manualRadiusFt: 1800 });
});

test('changed settings are copied across', () => {
  const setup = {};
  applyToSetup(setup, { ...DEFAULTS, conflictLatFt: 300, conflictVertFt: 250, cautionLatFt: 900, cautionVertFt: 800, flyRoundedTurns: false, radiusFromG: false, manualRadiusFt: 2500 });
  assert.deepEqual(setup.conflictLimits, { latFt: 300, vertFt: 250, cautionLatFt: 900, cautionVertFt: 800 });
  assert.deepEqual(setup.routeOptions, { flyRoundedTurns: false, radiusFromG: false, manualRadiusFt: 2500 });
});

test('numbers past their range are held to it, and things that are not numbers fall back to the default', () => {
  const setup = {};
  applyToSetup(setup, { ...DEFAULTS, conflictLatFt: -5, conflictVertFt: 1e9, cautionLatFt: NaN, cautionVertFt: '500', manualRadiusFt: 5 });
  assert.equal(setup.conflictLimits.latFt, LIMITS.conflictLatFt[0]);
  assert.equal(setup.conflictLimits.vertFt, LIMITS.conflictVertFt[1]);
  assert.equal(setup.conflictLimits.cautionLatFt, DEFAULTS.cautionLatFt);
  assert.equal(setup.conflictLimits.cautionVertFt, DEFAULTS.cautionVertFt);
  assert.equal(setup.routeOptions.manualRadiusFt, LIMITS.manualRadiusFt[0]);
});

test('within holds a number to its range and refuses what is not a number', () => {
  assert.equal(within(5, [1, 9], 3), 5);
  assert.equal(within(0, [1, 9], 3), 1);
  assert.equal(within(10, [1, 9], 3), 9);
  for (const bad of [NaN, Infinity, undefined, null, '4', {}]) assert.equal(within(bad, [1, 9], 3), 3);
});

test('a bigger conflict limit reaches a sim that is already running, and makes it see the conflict', () => {
  const setup = structuredClone(MOOSE_JAW);
  applyToSetup(setup, { ...DEFAULTS });
  const sim = createSim(setup, { seed: 1 });
  sim.spawn({ type: 'CT-156', routeId: 'ENT1', startPoint: 1, delaySec: 0 });
  sim.spawn({ type: 'CT-156', routeId: 'ENT1', startPoint: 1, delaySec: 4 });
  sim.stepTo(5);
  const tight = sim.state().conflicts.filter((c) => c.level === 'conflict').length;
  applyToSetup(setup, { ...DEFAULTS, conflictLatFt: 20000, conflictVertFt: 20000, cautionLatFt: 20000, cautionVertFt: 20000 });
  sim.stepTo(5.05);
  assert.ok(sim.state().conflicts.filter((c) => c.level === 'conflict').length >= tight);
  assert.ok(sim.state().conflicts.some((c) => c.level === 'conflict'));
});

test('the settings the screen keeps start filled in from DEFAULTS, and a value of the wrong kind is refused', () => {
  const settings = createSettings(memoryStore(), DEFAULTS);
  assert.deepEqual({ ...settings.get() }, { ...DEFAULTS });
  settings.update({ conflictLatFt: 'lots', manualRadiusFt: NaN, speed: 8 });
  assert.equal(settings.get().conflictLatFt, DEFAULTS.conflictLatFt);
  assert.equal(settings.get().manualRadiusFt, DEFAULTS.manualRadiusFt);
});

test('the in-memory store keeps what it is given and answers with the fallback for what it has not', () => {
  const store = memoryStore();
  assert.equal(store.get('settings', 'none'), 'none');
  store.set('settings', { a: 1 });
  assert.deepEqual(store.get('settings', 'none'), { a: 1 });
});

test('a frame that throws pauses the run first and the error still comes out', () => {
  const seen = [];
  const boom = new Error('frame failed');
  const frame = pauseOnThrow((dt) => {
    seen.push(`work ${dt}`);
    if (dt > 100) throw boom;
  }, () => seen.push('pause'));
  frame(16);
  assert.deepEqual(seen, ['work 16'], 'a good frame does not pause');
  assert.throws(() => frame(500), (err) => err === boom);
  assert.deepEqual(seen, ['work 16', 'work 500', 'pause']);
});

test('the frame wrapper hands its arguments on and pauses through the real clock and sim: a throwing engine leaves the clock paused', () => {
  const setup = structuredClone(MOOSE_JAW);
  const sim = createSim(setup, { seed: 1 });
  const clock = createClock({ sim, speed: 8 });
  clock.play();
  setup.routes = []; // the engine throws when the routes are emptied while aircraft exist
  const frame = pauseOnThrow((dt) => clock.tick(dt), () => clock.pause());
  assert.throws(() => { for (let i = 0; i < 300; i++) frame(50); });
  assert.equal(clock.mode, 'paused');
});
