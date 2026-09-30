// Playing an Energy fight (SPEC-turn-fight, "Energy mode"): the run the pictures read, and what one frame does when a
// step is slow (the model pilot picking his next move).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnergyFight, stepEnergyFight, ENERGY_DEFAULT_SETUP } from '../../../src/modules/turn-fight/energy-sim.js';
import { FIGHT_STEP_SEC } from '../../../src/modules/turn-fight/sim.js';
import { createEnergyRun, advanceRun, energyScreenFight, SLOW_STEP_MS, TRAIL_INTERVAL_SEC } from '../../../src/modules/turn-fight/playback.js';
import { passMarkWord } from '../../../src/modules/turn-fight/geometry.js';
import { phaseText, timeText } from '../../../src/modules/turn-fight/readouts.js';

const play = (run, seconds, frameSec = 0.02, options) => {
  for (let t = 0; t < seconds - 1e-9; t += frameSec) advanceRun(run, frameSec, options);
  return run;
};

test('an Energy run is the engine\'s fight with its trails, and moving it moves the engine', () => {
  const run = createEnergyRun({});
  assert.equal(run.fight.timeSec, 0);
  assert.equal(run.trails.blue.length, 1);
  play(run, 30);
  assert.ok(Math.abs(run.engine.timeSec - 30) < 1e-6);
  assert.equal(run.fight.timeSec, run.engine.timeSec, 'the screen\'s fight reads the engine\'s state live');
  assert.equal(run.fight.blue, run.engine.blue);
  assert.equal(run.trails.blue.length, 1 + Math.round(30 / TRAIL_INTERVAL_SEC));
  assert.ok(run.trails.blue.at(-1).zFt > 0);
});

test('it flies exactly the steps the engine flies on its own, whatever the frame rate', () => {
  const direct = createEnergyFight({ blueKias: 180, redKias: 250 });
  for (let i = 0; i < 20 / FIGHT_STEP_SEC; i++) stepEnergyFight(direct, FIGHT_STEP_SEC);
  for (const frameSec of [0.02, 1 / 60, 0.08]) {
    const run = play(createEnergyRun({ blueKias: 180, redKias: 250 }), 20 + 0.08, frameSec);
    assert.ok(Math.abs(run.engine.timeSec - direct.timeSec) <= 0.08 + 1e-6, `${frameSec}: ${run.engine.timeSec}`);
  }
  const run = play(createEnergyRun({ blueKias: 180, redKias: 250 }), 20, 0.02);
  assert.deepEqual(run.engine.blue.kias, direct.blue.kias);
  assert.deepEqual(run.engine.red.altFt, direct.red.altFt);
});

test('the screen\'s fight adds what the pictures ask of every fight, and writes nothing into the engine\'s state', () => {
  const engine = createEnergyFight({});
  const before = Object.keys(engine).sort();
  const fight = energyScreenFight(engine);
  assert.deepEqual(Object.keys(engine).sort(), before);
  assert.equal(fight.energy, true);
  assert.equal(fight.mergeMark, true, 'head-on, as V6: the MERGE mark');
  assert.equal(fight.headOn, true);
  assert.equal(fight.start.closing, true);
  assert.ok(fight.start.passRangeFt < 1, 'head-on passes at the centre');
  assert.deepEqual(fight.startZFt, { blue: 10000, red: 10000 });
  assert.equal(passMarkWord(fight), 'MERGE');
  assert.equal(phaseText(fight), 'HEAD-TO-HEAD');
  assert.equal(timeText(fight), 'T+0.0');
});

test('a start with the turns at once has no MERGE mark; a crossing start says PASS; a beam start has none', () => {
  assert.equal(energyScreenFight(createEnergyFight({ turnsStart: 'now' })).mergeMark, false);
  const crossing = energyScreenFight(createEnergyFight({ aaDeg: 90 }));
  assert.equal(crossing.mergeMark, true);
  assert.equal(crossing.headOn, false);
  assert.equal(passMarkWord(crossing), 'PASS');
  assert.equal(phaseText(crossing), 'TO THE PASS');
  assert.equal(energyScreenFight(createEnergyFight({ ataDeg: 90, aaDeg: 90 })).mergeMark, false, 'the range is not closing: no pass');
});

test('the phase word follows the engine once the jets pass: 2-CIRCLE, or 1-CIRCLE', () => {
  const two = play(createEnergyRun({}), 20);
  assert.equal(phaseText(two.fight), '2-CIRCLE');
  const one = play(createEnergyRun({ circles: 1 }), 20);
  assert.equal(phaseText(one.fight), '1-CIRCLE');
});

test('a bad number is refused with the engine\'s RangeError, and no run is made', () => {
  assert.throws(() => createEnergyRun({ blueAltFt: 100 }), RangeError);
});

// A clock that reads `costs` in turn, each a step takes: the step before and the step after are read one after the other.
function clock(costsMs) {
  let t = 0;
  let calls = 0;
  return { now: () => (calls++ % 2 === 0 ? t : (t += costsMs())), steps: () => Math.floor(calls / 2) };
}

test('a slow step (a pick) ends the frame: at most one pick a frame, and the rest of the frame is dropped, not carried', () => {
  const run = createEnergyRun({});
  const c = clock(() => SLOW_STEP_MS + 30);
  advanceRun(run, 0.32, { now: c.now }); // 16 steps asked for
  assert.equal(c.steps(), 1, 'stopped after the slow step');
  assert.ok(Math.abs(run.engine.timeSec - FIGHT_STEP_SEC) < 1e-9);
  assert.equal(run.pendingSec, 0, 'the steps left are not queued');
  assert.equal(run.slowFrames, 1);
  // The next frame starts clean: exactly what it asks for.
  advanceRun(run, 0.08, { now: () => 0 });
  assert.ok(Math.abs(run.engine.timeSec - (FIGHT_STEP_SEC + 0.08)) < 1e-9);
});

test('quick steps are not held back: a whole frame at 4× (16 steps) runs, and no frame is dropped', () => {
  const run = createEnergyRun({});
  const c = clock(() => 0.01);
  advanceRun(run, 0.32, { now: c.now });
  assert.equal(c.steps(), 16);
  assert.equal(run.slowFrames, 0);
  assert.ok(Math.abs(run.engine.timeSec - 0.32) < 1e-9);
});

test('a real pick is slow and a real step is not: the 250 KIAS fight\'s picks show up as slow frames only where the engine really looks ahead', () => {
  // Above 220 KIAS the pick races the Immelmann against the pitch back. Fly one and time each step with the real clock.
  const engine = createEnergyFight({ ...ENERGY_DEFAULT_SETUP, blueKias: 250, redKias: 250, ataDeg: 150, aaDeg: 150, turnsStart: 'now', separationNm: 1 });
  let worst = 0;
  let ordinary = 0;
  for (let i = 0; i < 20 / FIGHT_STEP_SEC; i++) {
    const t0 = performance.now();
    stepEnergyFight(engine, FIGHT_STEP_SEC);
    const ms = performance.now() - t0;
    worst = Math.max(worst, ms);
    if (ms < SLOW_STEP_MS) ordinary++;
  }
  assert.ok(ordinary > 0.95 * (20 / FIGHT_STEP_SEC), `ordinary steps: ${ordinary}, the slowest step took ${worst.toFixed(1)} ms`);
});
