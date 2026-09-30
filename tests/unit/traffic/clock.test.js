// The playback clock (src/modules/traffic/clock.js): it turns frame times into fixed 0.05 s
// steps of the engine, keeping the part of a frame that isn't a whole step, so a run comes
// out the same at any frame rate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSim } from '../../../src/modules/traffic/sim.js';
import { createClock } from '../../../src/modules/traffic/clock.js';

const MOOSE_JAW = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));
const newSim = () => createSim(structuredClone(MOOSE_JAW));

// Runs `wallSec` seconds of real time at `fps` frames a second.
function runFor(clock, wallSec, fps) {
  const frames = Math.round(wallSec * fps);
  for (let i = 0; i < frames; i++) clock.tick(1000 / fps);
}

test('the clock starts paused at 0, and only moves while playing', () => {
  const clock = createClock({ sim: newSim(), speed: 8 });
  assert.equal(clock.mode, 'paused');
  assert.equal(clock.tick(100), false);
  assert.equal(clock.simTime, 0);
  clock.play();
  assert.equal(clock.mode, 'running');
  assert.equal(clock.tick(100), true);
  assert.ok(clock.simTime > 0);
  clock.pause();
  const t = clock.simTime;
  assert.equal(clock.tick(100), false);
  assert.equal(clock.simTime, t);
});

test('sim time runs at the speed set: one second of real time at 8x is eight seconds of sim time', () => {
  for (const [speed, expected] of [[0.25, 2.5], [1, 10], [2, 20], [8, 80]]) {
    const clock = createClock({ sim: newSim(), speed });
    clock.play();
    runFor(clock, 10, 50);
    assert.ok(Math.abs(clock.simTime - expected) < 0.051, `${speed}x: ${clock.simTime} is not ${expected}`);
  }
});

test('the same run comes out at any frame rate: the aircraft are in the same places after 30 s of real time at 8x', () => {
  const places = (fps) => {
    const sim = newSim();
    const clock = createClock({ sim, speed: 8 });
    clock.play();
    runFor(clock, 30, fps);
    return JSON.stringify(sim.state());
  };
  const at20 = places(20);
  assert.equal(places(50), at20);
  assert.equal(places(100), at20);
});

test('a frame shorter than one step is kept, not lost: 1x at 60 frames a second still moves', () => {
  const clock = createClock({ sim: newSim(), speed: 1 });
  clock.play();
  runFor(clock, 5, 60);
  assert.ok(clock.simTime > 4.9 && clock.simTime <= 5.001, `${clock.simTime}`);
});

test('a long gap between frames (a tab that was hidden) is not chased', () => {
  const clock = createClock({ sim: newSim(), speed: 8, maxAdvanceSec: 2 });
  clock.play();
  clock.tick(60_000);
  assert.ok(clock.simTime <= 2.0001, `${clock.simTime}`);
  clock.tick(1000 / 60);
  assert.ok(clock.simTime < 2.2, 'and it carries on from there');
});

test('changing the speed changes the steps per frame, never their size, and keeps the run going', () => {
  const clock = createClock({ sim: newSim(), speed: 1 });
  clock.play();
  runFor(clock, 5, 50);
  const t = clock.simTime;
  clock.setSpeed(4);
  assert.equal(clock.speed, 4);
  assert.equal(clock.mode, 'running');
  runFor(clock, 5, 50);
  assert.ok(Math.abs(clock.simTime - (t + 20)) < 0.051);
});

test('a speed that is not on the bar\'s list of 0.25x to 8x is ignored', () => {
  const clock = createClock({ sim: newSim(), speed: 2 });
  for (const bad of [0, -1, 9, 1e9, NaN, Infinity, undefined, '4']) {
    clock.setSpeed(bad);
    assert.equal(clock.speed, 2);
  }
  clock.setSpeed(0.25);
  assert.equal(clock.speed, 0.25);
  clock.setSpeed(8);
  assert.equal(clock.speed, 8);
});

test('Reset stops the run and puts every aircraft back at its start at 0', () => {
  const sim = newSim();
  const before = JSON.stringify(sim.state());
  const clock = createClock({ sim, speed: 8 });
  clock.play();
  runFor(clock, 20, 50);
  assert.notEqual(JSON.stringify(sim.state()), before);
  clock.reset();
  assert.equal(clock.mode, 'paused');
  assert.equal(clock.simTime, 0);
  assert.equal(JSON.stringify(sim.state()), before);
  clock.play();
  runFor(clock, 1, 50);
  assert.ok(clock.simTime > 7.9, 'and it plays again from 0');
});

test('after Reset, play asks only for the time since the play: a 20 ms frame at 8x is 0.16 s, not the whole run again', () => {
  const clock = createClock({ sim: newSim(), speed: 8 });
  clock.play();
  runFor(clock, 30, 50); // 240 s of sim time
  clock.reset();
  clock.play();
  clock.tick(20);
  assert.ok(clock.simTime <= 0.2, `simTime is ${clock.simTime}`);
});

test('Reset then play flies the same run again: the dice start over', () => {
  const sim = newSim();
  const clock = createClock({ sim, speed: 8 });
  const flyOnce = () => {
    clock.play();
    runFor(clock, 60, 50);
    const seen = JSON.stringify(sim.state());
    clock.reset();
    return seen;
  };
  assert.equal(flyOnce(), flyOnce());
});
