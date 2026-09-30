// Rewind and the 10-second steps (specs/SPEC-traffic.md: "Rewind, -10 s and +10 s land exactly
// where the run was at that time, at every speed", bug #46). The rule these tests hold to:
// going back to any moment gives exactly the state (everything sim.state() says, the dice, the
// trails) the run had going forward at that moment, however the run was played.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSim, STEP_SEC } from '../../../src/modules/traffic/sim.js';
import { createClock } from '../../../src/modules/traffic/clock.js';

const MOOSE_JAW = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));
const fresh = () => structuredClone(MOOSE_JAW);
const STEPS_10S = 200;

/** Everything a person could see or a later step depends on. */
function everything(sim) {
  const state = sim.state();
  return { steps: sim.steps, state, dice: sim.diceState(), trails: state.aircraft.map((a) => sim.trailOf(a.id)) };
}

/** A deterministic shuffle, so the tests go back and forth in an order no forward run would take. */
function shuffled(list, seed = 5) {
  const out = [...list];
  let a = seed;
  const next = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Flies a sim step by step, keeping everything at the steps asked for. */
function record(sim, stepsWanted) {
  const wanted = new Set(stepsWanted);
  const at = new Map();
  const last = Math.max(...stepsWanted);
  if (wanted.has(sim.steps)) at.set(sim.steps, everything(sim));
  while (sim.steps < last) {
    sim.seekSteps(sim.steps + 1);
    if (wanted.has(sim.steps)) at.set(sim.steps, everything(sim));
  }
  return at;
}

const SPOTS = [0, 1, 7, 199, 200, 201, 399, 400, 1000, 1234, 2001, 3599, 4000, 5555, 7200, 9000, 12000];

// ── The rule ─────────────────────────────────────────────────────────────────

for (const seed of [1, 7, 12345]) {
  test(`going back to any moment gives the state the forward run had then, dice and trails too (seed ${seed})`, () => {
    const sim = createSim(fresh(), { seed });
    const forward = record(sim, SPOTS);
    assert.equal(forward.size, SPOTS.length);
    for (const step of shuffled(SPOTS, seed)) {
      sim.seekSteps(step);
      assert.deepEqual(everything(sim), forward.get(step), `step ${step}`);
    }
  });
}

test('going on from a rewound moment flies the same run as before, choices included', () => {
  const sim = createSim(fresh(), { seed: 3 });
  const forward = record(sim, [4000, 9000]);
  sim.seekSteps(2500);
  sim.seekSteps(9000);
  assert.deepEqual(everything(sim), forward.get(9000));
  sim.seekSteps(1000);
  sim.stepTo(4000 * STEP_SEC + 1e-6);
  assert.deepEqual(everything(sim), forward.get(4000));
});

test('seek(time) goes to the step at that time, forward or back, and lands on a time the run passed through', () => {
  const sim = createSim(fresh(), { seed: 2 });
  const passed = [];
  for (let n = 1; n <= 60; n++) {
    sim.seek(n * 10);
    passed.push([sim.t, everything(sim)]);
  }
  for (const [t, was] of shuffled(passed, 9)) {
    sim.seek(t);
    assert.deepEqual(everything(sim), was, `t ${t}`);
  }
  sim.seek(-5);
  assert.equal(sim.t, 0);
  assert.equal(sim.steps, 0);
});

test('a bad time or step is refused in words', () => {
  const sim = createSim(fresh());
  assert.throws(() => sim.seek(Number.NaN), RangeError);
  assert.throws(() => sim.seekSteps(1.5), RangeError);
  assert.throws(() => sim.seekSteps('3'), RangeError);
  assert.throws(() => sim.seekSteps(1e9), /too far/);
});

test('going back past 0 stops at 0, where a fresh sim is', () => {
  const sim = createSim(fresh(), { seed: 4 });
  const start = everything(sim);
  sim.seek(500);
  sim.seekSteps(-40);
  assert.deepEqual(everything(sim), start);
});

// ── Snapshots ────────────────────────────────────────────────────────────────

test('a snapshot restores the run exactly, and later flying does not change it', () => {
  const sim = createSim(fresh(), { seed: 6 });
  sim.seek(600);
  const snap = sim.snapshot();
  const then = everything(sim);
  sim.seek(1500);
  const later = everything(sim);
  assert.notDeepEqual(later, then);
  sim.restore(snap);
  assert.deepEqual(everything(sim), then);
  sim.seek(1500);
  assert.deepEqual(everything(sim), later);
  sim.restore(snap); // the same snapshot again
  assert.deepEqual(everything(sim), then);
});

test('a snapshot from one sim restores into another made from the same setup and seed', () => {
  const a = createSim(fresh(), { seed: 8 });
  a.seek(900);
  const b = createSim(fresh(), { seed: 8 });
  b.restore(a.snapshot());
  assert.deepEqual(everything(b), everything(a));
  a.seek(1200);
  b.seek(1200);
  assert.deepEqual(everything(b), everything(a));
});

test('restore refuses something that is not a snapshot', () => {
  const sim = createSim(fresh());
  assert.throws(() => sim.restore(null), TypeError);
  assert.throws(() => sim.restore({}), TypeError);
});

test('snapshots are taken every 10 s of sim time, so a rewind never replays more than 10 s', () => {
  const sim = createSim(fresh(), { seed: 1 });
  sim.seek(3600);
  const counted = sim.historySize();
  assert.ok(counted >= 360 && counted <= 361, `${counted} snapshots for an hour`);
  let replayed = 0;
  const original = sim.seekSteps;
  assert.equal(typeof original, 'function');
  // Going back 1 s from just past a snapshot replays at most 200 steps: it must be quicker than a replay from 0.
  const t0 = performance.now();
  sim.seek(3599);
  replayed = performance.now() - t0;
  assert.ok(replayed < 50, `${replayed} ms`);
});

test('an hour of history stays small when many aircraft are flying, and thins out beyond a fixed count', () => {
  const sim = createSim(fresh(), { seed: 1, maxSnapshots: 50 });
  sim.seek(3600);
  assert.ok(sim.historySize() <= 50, `${sim.historySize()} snapshots kept`);
  const forward = new Map();
  for (const t of [50, 999, 1801, 3333]) {
    sim.seek(t);
    forward.set(t, everything(sim));
  }
  // Compare against a sim with all its history.
  const whole = createSim(fresh(), { seed: 1 });
  for (const [t, was] of forward) {
    whole.seek(t);
    assert.deepEqual(everything(whole), was, `t ${t}`);
  }
});

// ── Changing the run while it is going ───────────────────────────────────────

test('after an aircraft is added, going back replays the run with it in, and the same way every time', () => {
  const sim = createSim(fresh(), { seed: 1 });
  sim.seek(120);
  const id = sim.spawn({ type: 'CT-157', routeId: 'PAT1', delaySec: 30 });
  sim.seek(400);
  const at400 = everything(sim);
  sim.seek(50);
  assert.equal(sim.state().aircraft.find((a) => a.id === id).status, 'waiting');
  sim.seek(400);
  assert.deepEqual(everything(sim), at400);
  sim.seek(0);
  sim.seek(400);
  assert.deepEqual(everything(sim), at400);
});

test('after an aircraft is removed it stays gone when going back', () => {
  const sim = createSim(fresh(), { seed: 1 });
  sim.seek(300);
  sim.remove('A1');
  sim.seek(100);
  assert.equal(sim.state().aircraft.some((a) => a.id === 'A1'), false);
  sim.seek(0);
  assert.equal(sim.state().aircraft.some((a) => a.id === 'A1'), false);
});

test('after a route is edited, forgetHistory makes going back fly the edited route from the start', () => {
  const setup = fresh();
  const sim = createSim(setup, { seed: 1 });
  sim.seek(500);
  const pattern = setup.routes.find((r) => r.kind === 'pattern');
  pattern.points[0].kt = 90;
  sim.forgetHistory();
  sim.seek(200);
  const edited = everything(sim);
  const other = createSim(structuredClone(setup), { seed: 1 });
  other.seek(200);
  assert.deepEqual(edited, everything(other));
});

test('reset starts a new history from 0, and rebuild takes the aircraft the setup has now, with a seed', () => {
  const setup = fresh();
  const sim = createSim(setup, { seed: 1 });
  sim.seek(800);
  sim.reset();
  assert.equal(sim.steps, 0);
  sim.seek(800);
  const again = everything(sim);
  sim.seek(10);
  sim.seek(800);
  assert.deepEqual(everything(sim), again);

  setup.aircraft = setup.aircraft.slice(0, 2);
  sim.rebuild({ seed: 99 });
  assert.equal(sim.seed, 99);
  assert.equal(sim.t, 0);
  assert.equal(sim.state().aircraft.length, 2);
  sim.seek(700);
  const rebuilt = everything(sim);
  const other = createSim(setup, { seed: 99 });
  other.seek(700);
  assert.deepEqual(everything(other), rebuilt);
});

// ── The clock: Rewind and the 10-second steps at any speed ───────────────────

for (const speed of [0.25, 8]) {
  test(`at ${speed}×, Rewind, -10 s and +10 s land on the state the forward run had (whole run compared)`, () => {
    const sim = createSim(fresh(), { seed: 11 });
    const clock = createClock({ sim, speed });
    // The run as a plain forward walk, one step at a time: every step, for the clock's frames to be held to.
    const end = speed === 8 ? 240 : 40;
    const forward = record(createSim(fresh(), { seed: 11 }), Array.from({ length: end / STEP_SEC + 10 }, (_, i) => i));
    clock.play();
    while (sim.t < end) {
      clock.tick(50);
      assert.deepEqual(everything(sim), forward.get(sim.steps), `playing forward at ${speed}×, step ${sim.steps}`);
    }
    clock.pause();
    const known = [...forward.keys()];

    // −10 s and +10 s from many moments.
    for (const step of shuffled(known.filter((_, i) => i % 7 === 0), 3)) {
      clock.seek(step * STEP_SEC);
      const here = sim.steps;
      assert.deepEqual(everything(sim), forward.get(here), `seek ${step}`);
      if (here - STEPS_10S >= 0 && forward.has(here - STEPS_10S)) {
        clock.stepBy(-10);
        assert.equal(sim.steps, here - STEPS_10S);
        assert.deepEqual(everything(sim), forward.get(here - STEPS_10S), `${here} minus 10 s`);
        clock.stepBy(10);
        assert.equal(sim.steps, here);
        assert.deepEqual(everything(sim), forward.get(here), `${here} back again`);
      }
      if (forward.has(here + STEPS_10S)) {
        clock.stepBy(10);
        assert.deepEqual(everything(sim), forward.get(here + STEPS_10S), `${here} plus 10 s`);
      }
    }

    // Rewind plays backward through every state, frame by frame.
    clock.seek(sim.steps * STEP_SEC);
    clock.rewind();
    assert.equal(clock.mode, 'rewinding');
    let frames = 0;
    let lastSteps = sim.steps;
    while (clock.mode === 'rewinding' && frames++ < 100000) {
      clock.tick(50);
      assert.ok(sim.steps <= lastSteps, 'time only goes back while rewinding');
      lastSteps = sim.steps;
      assert.deepEqual(everything(sim), forward.get(sim.steps), `rewinding, step ${sim.steps}`);
    }
    assert.equal(sim.steps, 0, 'rewinding stops at 0');
    assert.equal(clock.mode, 'paused');
  });
}

test('-10 s at less than 10 s in goes to 0, and +10 s always moves exactly 10 s of sim time whatever the speed', () => {
  for (const speed of [0.25, 1, 8]) {
    const sim = createSim(fresh(), { seed: 1 });
    const clock = createClock({ sim, speed });
    clock.stepBy(-10);
    assert.equal(sim.steps, 0);
    clock.stepBy(10);
    assert.equal(sim.steps, STEPS_10S);
    clock.stepBy(10);
    assert.equal(sim.steps, 2 * STEPS_10S);
    clock.stepBy(-10);
    clock.stepBy(-10);
    clock.stepBy(-10);
    assert.equal(sim.steps, 0);
  }
});

test('stepping, then playing, carries on from the stepped moment, not from where the clock had got to', () => {
  const sim = createSim(fresh(), { seed: 1 });
  const clock = createClock({ sim, speed: 1 });
  clock.play();
  for (let i = 0; i < 100; i++) clock.tick(50); // 5 s
  clock.stepBy(-10); // to 0
  assert.equal(sim.steps, 0);
  clock.tick(50);
  assert.ok(sim.t <= 0.1 + 1e-9, `${sim.t} s: the first frame after going back moves one frame, not the time the clock had reached`);
  clock.seek(60);
  clock.tick(50);
  assert.ok(sim.t <= 60.1 + 1e-9);
});

test('-10 s and +10 s keep the mode: playing carries on, paused stays paused, rewinding stops', () => {
  const sim = createSim(fresh(), { seed: 1 });
  const clock = createClock({ sim, speed: 1 });
  clock.play();
  clock.stepBy(10);
  assert.equal(clock.mode, 'running');
  clock.pause();
  clock.stepBy(10);
  assert.equal(clock.mode, 'paused');
  clock.rewind();
  clock.stepBy(-10);
  assert.equal(clock.mode, 'paused');
});

test('reset stops a rewind and goes to 0', () => {
  const sim = createSim(fresh(), { seed: 1 });
  const clock = createClock({ sim, speed: 8 });
  clock.seek(120);
  clock.rewind();
  clock.reset();
  assert.equal(clock.mode, 'paused');
  assert.equal(sim.steps, 0);
});

// ── Speed ────────────────────────────────────────────────────────────────────

test('going back to 1 hour of sim time takes well under 50 ms (median of 9)', (t) => {
  const sim = createSim(fresh(), { seed: 1 });
  sim.seek(3600);
  const hour = sim.steps;
  const times = [];
  for (let i = 0; i < 9; i++) {
    sim.seekSteps(hour);
    const t0 = performance.now();
    sim.seekSteps(hour - STEPS_10S - 37 * i); // back 10 s and a bit
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = times[4];
  t.diagnostic(`rewind at 1 hour of sim time: median ${median.toFixed(2)} ms, worst ${times[8].toFixed(2)} ms`);
  assert.ok(median < 50, `${median} ms`);
  // Even a jump from the end of the hour to near 0 is one restore and less than 10 s of replay.
  sim.seekSteps(hour);
  const t1 = performance.now();
  sim.seekSteps(150);
  const far = performance.now() - t1;
  t.diagnostic(`rewind from 1 hour to 0:00:07: ${far.toFixed(2)} ms`);
  assert.ok(far < 50, `${far} ms`);
});

test('the frames of a Rewind at 8× each take a small fraction of a 60 fps frame', (t) => {
  const sim = createSim(fresh(), { seed: 1 });
  sim.seek(3600);
  const clock = createClock({ sim, speed: 8 });
  clock.seek(3600);
  clock.rewind();
  let worst = 0;
  for (let i = 0; i < 300; i++) {
    const t0 = performance.now();
    clock.tick(16.7);
    worst = Math.max(worst, performance.now() - t0);
  }
  t.diagnostic(`worst Rewind frame at 8×, 300 frames from 1 hour: ${worst.toFixed(2)} ms`);
  assert.ok(worst < 16, `${worst} ms`);
});
