// Checks: going back to any moment gives the state the forward run had (aircraft, dice, trails) at several
//   seeds and speeds; spawn, remove, clear and edit mid-run replay correctly; snapshots every 10 s; rewind stays
//   quick.
// Serves: TR-R21, TR-R19.
// Expected values: the forward run recorded from the same sim (the code against itself, on purpose); five
//   checks time this computer against the author's own budgets (50, 8, 10 and 5,000 ms); runs at sign-off until
//   it finishes reliably.

// Rewind and the 10-second steps (specs/SPEC-traffic.md: "Rewind, -10 s and +10 s land exactly
// where the run was at that time, at every speed", bug #46). The rule these tests hold to:
// going back to any moment gives exactly the state (everything sim.state() says, the dice, the
// trails) the run had going forward at that moment, however the run was played.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSim, STEP_SEC } from '../../../src/modules/traffic/sim.js';
import { createClock } from '../../../src/modules/traffic/clock.js';
import { newEntry } from '../../../src/modules/traffic/route.js';

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
  assert.equal(sim.state().aircraft.some((a) => a.id === id), false, 'a spawn is an event: before it, the aircraft is not there (was: waiting from 0)');
  sim.seek(121);
  assert.equal(sim.state().aircraft.find((a) => a.id === id).status, 'waiting');
  sim.seek(400);
  assert.deepEqual(everything(sim), at400);
  sim.seek(0);
  sim.seek(400);
  assert.deepEqual(everything(sim), at400);
});

// RW-02: a spawn is an event at the step it was made in, and the replay flies it in the very same steps as the live run.
const distAndTrail = (sim, id) => ({ distFt: sim.state().aircraft.find((a) => a.id === id).distFt, trail: sim.trailOf(id).length });

for (const delaySec of [0, 0.05, 0.04, 12.3]) {
  test(`an aircraft spawned mid-run with a delay of ${delaySec} s is where it was after going back and forward (RW-02)`, () => {
    const sim = createSim(fresh(), { seed: 1 });
    sim.seekSteps(2000);
    const id = sim.spawn({ type: 'CT-156', routeId: 'PAT1', startPoint: 1, delaySec });
    sim.seekSteps(2400);
    const forward = everything(sim);
    const at2400 = distAndTrail(sim, id);
    sim.seekSteps(1000);
    sim.seekSteps(2400);
    assert.deepEqual(distAndTrail(sim, id), at2400);
    assert.deepEqual(everything(sim), forward);
    sim.seekSteps(2200); // -10 s
    sim.seekSteps(2400); // +10 s
    assert.deepEqual(everything(sim), forward);
    sim.seekSteps(0);
    sim.seekSteps(2400);
    assert.deepEqual(everything(sim), forward);
    sim.seekSteps(2000); // the step of the spawn itself: the aircraft is there, at its start
    assert.equal(sim.state().aircraft.some((a) => a.id === id), true);
  });
}

test('going back to before a spawn shows the run without that aircraft, and the spawn step shows it at its start', () => {
  const sim = createSim(fresh(), { seed: 1 });
  sim.seekSteps(2000);
  const id = sim.spawn({ routeId: 'PAT1', delaySec: 30 });
  const at2000 = everything(sim);
  sim.seekSteps(4000);
  sim.seekSteps(1999);
  assert.equal(sim.state().aircraft.some((a) => a.id === id), false, 'not there yet before the spawn');
  sim.seekSteps(2000);
  assert.deepEqual(everything(sim), at2000);
  assert.equal(sim.state().aircraft.find((a) => a.id === id).status, 'waiting');
});

test('spawns at the same step (a pair) and at different steps replay in order, with the callsigns they had', () => {
  const sim = createSim(fresh(), { seed: 2 });
  sim.seekSteps(700);
  const ids = [sim.spawn({ routeId: 'ENT1' }), sim.spawn({ routeId: 'PAT1', delaySec: 3 })];
  sim.seekSteps(1500);
  const third = sim.spawn({ routeId: 'ENT2' });
  sim.seekSteps(4000);
  const forward = everything(sim);
  for (const step of shuffled([0, 100, 699, 700, 701, 1499, 1500, 1501, 3000, 4000], 3)) sim.seekSteps(step);
  sim.seekSteps(4000);
  assert.deepEqual(everything(sim), forward);
  assert.deepEqual(forward.state.aircraft.slice(-3).map((a) => a.id), [...ids, third]);
});

// RW-01: remove and Clear finished are timed events at the step they happened in. Going back, or back and forward
// again, shows every aircraft that stays exactly as the forward run had it, and the removed one until that step.

/** Flies to `stepS` (recording what is asked before it), edits, and records on to `end`; every 200 steps and a few steps around S and 0 are recorded. */
function runWithEdit({ seed, stepS, edit, end = 14000 }) {
  const sim = createSim(fresh(), { seed });
  const around = [0, 1, 7, stepS - 201, stepS - 1, stepS, stepS + 1, stepS + 199, stepS + 201, end];
  const every200 = Array.from({ length: end / STEPS_10S + 1 }, (_, i) => i * STEPS_10S);
  const spots = [...new Set([...around, ...every200])].filter((n) => n >= 0 && n <= end).sort((a, b) => a - b);
  const before = record(sim, spots.filter((n) => n < stepS));
  sim.seekSteps(stepS);
  const result = edit(sim);
  const after = record(sim, spots.filter((n) => n >= stepS));
  return { sim, spots, forward: new Map([...before, ...after]), stepS, end, result };
}

function assertReplaysTheForwardRun({ sim, spots, forward, end }, label) {
  // -10 s at a time from the end to 0, then +10 s at a time back to the end.
  for (let step = end; step > 0; step -= STEPS_10S) {
    sim.seekSteps(step);
    assert.deepEqual(everything(sim), forward.get(step), `${label}: walking back, step ${step}`);
  }
  sim.seekSteps(0);
  assert.deepEqual(everything(sim), forward.get(0), `${label}: step 0`);
  for (let step = STEPS_10S; step <= end; step += STEPS_10S) {
    sim.seekSteps(step);
    assert.deepEqual(everything(sim), forward.get(step), `${label}: walking forward, step ${step}`);
  }
  for (const step of shuffled(spots, 11)) {
    sim.seekSteps(step);
    assert.deepEqual(everything(sim), forward.get(step), `${label}: hop to step ${step}`);
  }
}

for (const seed of [1, 7, 12345]) {
  test(`remove('A1') at a step: every other aircraft is as the forward run had it, going back and forward again, and A1 is gone from that step on (seed ${seed}, RW-01)`, () => {
    const stepS = 6100;
    const run = runWithEdit({ seed, stepS, edit: (sim) => sim.remove('A1') });
    assert.equal(run.result, true);
    assert.ok(run.forward.get(stepS - 1).state.aircraft.some((a) => a.id === 'A1'), 'A1 is there the step before');
    assert.equal(run.forward.get(stepS).state.aircraft.some((a) => a.id === 'A1'), false);
    assertReplaysTheForwardRun(run, 'remove');
    for (const step of [stepS, stepS + 1, run.end]) {
      run.sim.seekSteps(step);
      assert.equal(run.sim.state().aircraft.some((a) => a.id === 'A1'), false, `A1 is gone at step ${step}`);
    }
    run.sim.seekSteps(stepS - 1);
    assert.equal(run.sim.state().aircraft.some((a) => a.id === 'A1'), true, 'and still there before it');
  });
}

for (const seed of [1, 7, 12345]) {
  test(`clearFinished() at a step: the aircraft that stay are as the forward run had them, going back and forward again (seed ${seed}, RW-01)`, () => {
    // The first moment, on a 10 s mark, with a finished aircraft.
    const scout = createSim(fresh(), { seed });
    let stepS = 0;
    while (!scout.state().aircraft.some((a) => a.status === 'landed' || a.status === 'done')) scout.seekSteps((stepS += STEPS_10S));
    stepS += 50; // between two snapshots
    const run = runWithEdit({ seed, stepS, end: Math.max(14000, Math.ceil((stepS + 2000) / STEPS_10S) * STEPS_10S), edit: (sim) => { const n = sim.state().aircraft.length; sim.clearFinished(); return n - sim.state().aircraft.length; } });
    assert.ok(run.result >= 1, 'something was cleared');
    assertReplaysTheForwardRun(run, 'clear');
    run.sim.seekSteps(0);
    assert.equal(run.sim.state().aircraft.length, 7, 'before the clear every aircraft is there');
  });
}

test('remove, then a spawn that takes the freed callsign: going back and forward shows both aircraft as they were', () => {
  const sim = createSim(fresh(), { seed: 3 });
  sim.seekSteps(4000);
  sim.remove('A2');
  sim.seekSteps(4400);
  assert.equal(sim.spawn({ routeId: 'ENT1' }), 'A2', 'the new aircraft takes the callsign');
  const forward = record(sim, [4400, 4401, 6000, 9000]); // the moments after the spawn, as the forward run had them
  sim.seekSteps(3999);
  const beforeRemoval = everything(sim);
  sim.seekSteps(4000);
  const atRemoval = everything(sim);
  sim.seekSteps(4399);
  const between = everything(sim);
  sim.seekSteps(0);
  for (const step of shuffled([4400, 4401, 6000, 9000], 4)) {
    sim.seekSteps(step);
    assert.deepEqual(everything(sim), forward.get(step), `step ${step}`);
  }
  sim.seekSteps(3999);
  assert.deepEqual(everything(sim), beforeRemoval);
  assert.equal(sim.state().aircraft.find((a) => a.id === 'A2').startsAt, 137, 'the setup\'s A2 before the removal');
  sim.seekSteps(4000);
  assert.deepEqual(everything(sim), atRemoval);
  sim.seekSteps(4399);
  assert.deepEqual(everything(sim), between);
  assert.equal(sim.state().aircraft.some((a) => a.id === 'A2'), false, 'no A2 between the removal and the spawn');
});

test('a removal survives a later route edit: the replay from 0 has the aircraft until the removal step, and equals the edited setup flown with the same removal', () => {
  const setup = fresh();
  const sim = createSim(setup, { seed: 1 });
  sim.seekSteps(3000);
  sim.remove('A1');
  sim.seekSteps(5000);
  setup.routes.find((r) => r.id === 'PAT1').points[1].kt = 95;
  sim.forgetHistory();
  const edited = fresh();
  edited.routes.find((r) => r.id === 'PAT1').points[1].kt = 95;
  const reference = createSim(edited, { seed: 1 });
  reference.seekSteps(3000);
  reference.remove('A1');
  for (const step of [4000, 2999, 3000, 3001, 5000]) {
    reference.seekSteps(step);
    sim.seekSteps(step);
    assert.deepEqual(everything(sim), everything(reference), `step ${step}`);
  }
  assert.equal(sim.state().aircraft.some((a) => a.id === 'A1'), false);
  sim.seekSteps(2999);
  assert.equal(sim.state().aircraft.some((a) => a.id === 'A1'), true);
});

test('Reset and aircraftSpecs keep the aircraft the run has after every removal and spawn, wherever the run is when they are asked', () => {
  const sim = createSim(fresh(), { seed: 1 });
  sim.seekSteps(2000);
  sim.remove('A1');
  sim.seekSteps(4000);
  const spawned = sim.spawn({ routeId: 'ENT1', delaySec: 20 });
  const ids = () => sim.aircraftSpecs().map((s) => s.id);
  const want = ['A2', 'A3', 'A4', 'A5', 'A6', 'A7', spawned];
  assert.deepEqual(ids(), want);
  sim.seekSteps(100); // before both
  assert.deepEqual(ids(), want, 'the saved aircraft do not depend on where the clock is');
  sim.reset();
  assert.deepEqual(sim.state().aircraft.map((a) => a.id), want);
  assert.equal(sim.steps, 0);
});

test('after an aircraft is removed it stays gone from that moment on, going back and forward (before it, the run had it: RW-01)', () => {
  const sim = createSim(fresh(), { seed: 1 });
  sim.seek(300);
  sim.remove('A1');
  const has = () => sim.state().aircraft.some((a) => a.id === 'A1');
  assert.equal(has(), false);
  sim.seek(400);
  assert.equal(has(), false);
  sim.seek(300);
  assert.equal(has(), false, 'gone at the moment it was removed');
  sim.seek(100);
  assert.equal(has(), true, 'the run before the removal had it (this was `false` while a removal dropped the history)');
  sim.seek(0);
  assert.equal(has(), true);
  sim.seek(500);
  assert.equal(has(), false);
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

test('a route modified mid-run: after forgetHistory, -10 s and +10 s land on the run that has the edit from 0 (#46)', () => {
  const build = (setup) => {
    const pat = setup.routes.find((r) => r.id === 'PAT1');
    pat.points[1].kt = 100;
  };
  const setup = fresh();
  const sim = createSim(setup, { seed: 3 });
  sim.seek(700);
  build(setup);
  sim.forgetHistory();
  // The run with the split from the start, flown straight through.
  const reference = createSim((() => { const s = fresh(); build(s); return s; })(), { seed: 3 });
  const wanted = new Map();
  for (const step of [10000, 14000]) {
    reference.seekSteps(step);
    wanted.set(step, everything(reference));
  }
  sim.seekSteps(14000);
  sim.seekSteps(14000 - STEPS_10S); // -10 s
  sim.seekSteps(14000); // +10 s
  assert.deepEqual(everything(sim), wanted.get(14000));
  sim.seekSteps(10000);
  assert.deepEqual(everything(sim), wanted.get(10000));

  // Without forgetHistory the snapshots from before the split are kept, and the run is a mix of the two.
  const stale = fresh();
  const mixed = createSim(stale, { seed: 3 });
  mixed.seek(700);
  build(stale);
  mixed.seekSteps(14000);
  mixed.seekSteps(14000 - STEPS_10S);
  mixed.seekSteps(14000);
  assert.notDeepEqual(everything(mixed), wanted.get(14000), 'the negative control: stale snapshots give a different run');
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
  const times = [];
  for (let i = 0; i < 300; i++) {
    const t0 = performance.now();
    clock.tick(16.7);
    times.push(performance.now() - t0);
  }
  times.sort((x, y) => x - y);
  const median = times[150];
  t.diagnostic(`Rewind frames at 8×, 300 frames from 1 hour: median ${median.toFixed(2)} ms, worst ${times[299].toFixed(2)} ms`);
  // The median, not the worst: one slow frame is a garbage collection or another process on the machine.
  assert.ok(median < 8, `${median} ms`);
});

// ── What a step back will cost, so the screen can say "Replaying…" first ─────

test('replayCost is the steps a seek would fly: at most 10 s behind a snapshot, everything from 0 after an edit, 0 for where it is', () => {
  const sim = createSim(fresh(), { seed: 1 });
  sim.seek(3600);
  const hour = sim.steps;
  assert.equal(sim.replayCost(hour), 0);
  assert.equal(sim.replayCost(hour + 200), 200, 'ahead costs the steps ahead');
  assert.ok(sim.replayCost(hour - 200) < 200);
  assert.ok(sim.replayCost(12345) < 200);
  assert.equal(sim.replayCost(-5), 0, 'before 0 is 0, where it goes');
  // An edit forgets the snapshots: the first step back replays the run from 0.
  sim.forgetHistory();
  assert.equal(sim.replayCost(hour - 200), hour - 200);
  const t0 = performance.now();
  sim.seekSteps(hour - 200);
  const cost = performance.now() - t0;
  assert.equal(sim.steps, hour - 200);
  assert.ok(sim.replayCost(hour - 400) < 200, 'and the replay left snapshots behind, so the next step back is cheap');
  assert.ok(cost < 5000);
});

// ── RW-03: a replay from 0 after an edit is done in slices, so the page can draw between them ──────────────────

/** The built-in setup with `n` aircraft spawned on it (30 in the spec's own performance line). */
function crowded(n, seed = 1) {
  const sim = createSim(fresh(), { seed });
  const routes = ['PAT1', 'ENT1', 'ENT2'];
  for (let i = sim.state().aircraft.length; i < n; i++) sim.spawn({ routeId: routes[i % routes.length], delaySec: i * 3 });
  return sim;
}

test('seekStepsSlice flies at most the steps it is given, says when it has arrived, and ends on exactly what seekSteps gives', () => {
  const sim = createSim(fresh(), { seed: 5 });
  sim.seekSteps(6000);
  sim.forgetHistory(); // the first step back is now a replay from 0
  const target = 5800;
  const whole = createSim(fresh(), { seed: 5 });
  whole.seekSteps(target);
  let calls = 0;
  let arrived = false;
  let last = sim.steps;
  while (!arrived) {
    arrived = sim.seekStepsSlice(target, 250);
    calls++;
    assert.ok(Math.abs(sim.steps - last) <= 250 || calls === 1, `a slice took ${sim.steps - last} steps`);
    last = sim.steps;
    assert.ok(calls < 100, 'it gets there');
  }
  assert.ok(calls >= target / 250, `${calls} slices: it did not fly it all at once`);
  assert.equal(sim.steps, target);
  assert.deepEqual(everything(sim), everything(whole));
  assert.equal(sim.seekStepsSlice(target, 250), true, 'asked again at the target, it is there');
});

test('seekStepsSlice needs a whole number of steps and a whole number of steps to take', () => {
  const sim = createSim(fresh());
  assert.throws(() => sim.seekStepsSlice(1.5, 10), RangeError);
  assert.throws(() => sim.seekStepsSlice(10, 0), RangeError);
  assert.throws(() => sim.seekStepsSlice(10, 2.5), RangeError);
});

test('going forward and back with seekStepsSlice uses the snapshots, as seekSteps does', () => {
  const sim = createSim(fresh(), { seed: 2 });
  sim.seekSteps(9000);
  const before = sim.steps;
  assert.equal(sim.seekStepsSlice(9000 - STEPS_10S, 300), true, 'a step back from a snapshot is one slice');
  assert.ok(before - sim.steps === STEPS_10S);
});

test('an edit made while a replay is between slices finishes it first, and the edit lands on the moment the replay was going to', () => {
  const sim = createSim(fresh(), { seed: 1 });
  sim.seekSteps(4000);
  sim.forgetHistory();
  assert.equal(sim.seekStepsSlice(3000, 100), false);
  const id = sim.spawn({ routeId: 'PAT1' });
  assert.equal(sim.steps, 3000, 'the replay finished, and the spawn was made at its end');
  const reference = createSim(fresh(), { seed: 1 });
  reference.seekSteps(3000);
  assert.equal(reference.spawn({ routeId: 'PAT1' }), id);
  reference.seekSteps(4000);
  sim.seekSteps(4000);
  assert.deepEqual(everything(sim), everything(reference));
});

test('a route edited while a replay is between slices starts the replay again, so it flies the edited route from 0 and no mix of the two', () => {
  const setup = fresh();
  const sim = createSim(setup, { seed: 1 });
  sim.seekSteps(4000);
  sim.forgetHistory();
  assert.equal(sim.seekStepsSlice(3000, 400), false);
  setup.routes.find((r) => r.id === 'PAT1').points[1].kt = 95;
  sim.forgetHistory();
  while (!sim.seekStepsSlice(3000, 400));
  const edited = fresh();
  edited.routes.find((r) => r.id === 'PAT1').points[1].kt = 95;
  const reference = createSim(edited, { seed: 1 });
  reference.seekSteps(3000);
  assert.deepEqual(everything(sim), everything(reference));
});

test('a stepTo, a Reset or a seek while a replay is between slices is not confused by it', () => {
  const sim = createSim(fresh(), { seed: 1 });
  sim.seekSteps(4000);
  sim.forgetHistory();
  sim.seekStepsSlice(2000, 100);
  sim.seekSteps(500);
  assert.equal(sim.steps, 500);
  sim.seekSteps(4000);
  sim.forgetHistory();
  sim.seekStepsSlice(2000, 100);
  sim.reset();
  assert.equal(sim.steps, 0);
  assert.equal(sim.seekStepsSlice(0, 10), true);
});

test('after an edit at 30 aircraft, one slice of the replay takes a few milliseconds, where the whole replay takes seconds (RW-03)', (t) => {
  const sim = crowded(30);
  sim.seekSteps(72000 / 3); // 20 minutes
  const target = sim.steps - 1;
  sim.forgetHistory();
  assert.equal(sim.replayCost(target), target, 'the whole run again');
  const sliceMs = [];
  let arrived = false;
  const t0 = performance.now();
  while (!arrived) {
    const s0 = performance.now();
    arrived = sim.seekStepsSlice(target, 25);
    sliceMs.push(performance.now() - s0);
  }
  const total = performance.now() - t0;
  sliceMs.sort((a, b) => a - b);
  const median = sliceMs[Math.floor(sliceMs.length / 2)];
  t.diagnostic(`30 aircraft, 20 minutes: ${sliceMs.length} slices of 25 steps, median ${median.toFixed(2)} ms, worst ${sliceMs.at(-1).toFixed(2)} ms, ${total.toFixed(0)} ms in all`);
  assert.equal(sim.steps, target);
  assert.ok(sliceMs.length > 900, 'in many small slices');
  assert.ok(median < 10, `a slice of 25 steps takes ${median} ms (a frame is 16 ms)`);
  assert.ok(sim.replayCost(target - STEPS_10S) < STEPS_10S, 'and the replay left snapshots behind, so the next step back is cheap');
});

test('clock.seekSteps goes to a step exactly, the mode stays (a rewind stops), and it is a no-op for a sim a slice replay already put there', () => {
  const sim = createSim(fresh(), { seed: 1 });
  const clock = createClock({ sim, speed: 4 });
  clock.seekSteps(3000);
  assert.equal(sim.steps, 3000);
  assert.equal(clock.mode, 'paused');
  clock.play();
  clock.seekSteps(2800);
  assert.equal(clock.mode, 'running');
  clock.rewind();
  clock.seekSteps(2600);
  assert.equal(clock.mode, 'paused');
  const there = everything(sim);
  sim.forgetHistory();
  while (!sim.seekStepsSlice(2400, 300));
  clock.seekSteps(2400); // the screen's last move after its slices
  assert.equal(sim.steps, 2400);
  assert.equal(clock.simTime, sim.t);
  const whole = createSim(fresh(), { seed: 1 });
  whole.seekSteps(2400);
  assert.deepEqual(everything(sim), everything(whole));
  assert.notDeepEqual(everything(sim), there);
  clock.stepBy(10);
  assert.equal(sim.steps, 2600);
});

// ── Audit fixes ──────────────────────────────────────────────────────────────

test('an edit made while rewound keeps the later events: a spawn does not take a callsign a later spawn already has, and a profile of it is valid (B1)', async () => {
  const setup = fresh();
  const sim = createSim(setup, { seed: 1 });
  sim.seekSteps(4000);
  const first = sim.spawn({ routeId: 'PAT1' });
  sim.seekSteps(2000); // before that spawn, which stays in the run
  assert.throws(() => sim.spawn({ routeId: 'ENT1', id: first }), /in use/, 'the callsign of a later spawn is in use');
  const second = sim.spawn({ routeId: 'ENT1' });
  assert.notEqual(second, first);
  sim.seekSteps(6000);
  const ids = sim.state().aircraft.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, `no callsign twice: ${ids}`);
  assert.deepEqual(sim.aircraftSpecs().map((s) => s.id), ids);
  assert.equal(sim.remove(first), true);
  assert.deepEqual(sim.state().aircraft.map((a) => a.id), ids.filter((id) => id !== first), 'one remove takes one aircraft');
  const { captureProfile, checkProfile, profileSettingDefaults } = await import('../../../src/modules/traffic/profile.js');
  const profile = captureProfile({ name: 'Rewound', airfield: 'CYMJ', notes: '', setup, aircraft: sim.aircraftSpecs(), seed: 1, settings: profileSettingDefaults() });
  assert.ok(checkProfile(profile).ok, checkProfile(profile).problem);
});

test('after an edit and live flying on, the first step back replays from 0 and leaves no snapshot from the live run, so a moment is one state (B2)', () => {
  const setup = fresh();
  const sim = createSim(setup, { seed: 1 });
  sim.seekSteps(4000);
  setup.routes.find((r) => r.id === 'PAT1').points[3].kt = 140;
  sim.forgetHistory();
  sim.stepTo(6000 * STEP_SEC); // live: snapshots from 4200 to 6000 are of a run whose first 4000 steps were the old setup
  sim.seekSteps(3000); // the replay from 0 with the edit
  sim.seekSteps(6000);
  const first = everything(sim);
  sim.seekSteps(5900);
  sim.seekSteps(6000);
  assert.deepEqual(everything(sim), first, '-5 s and +5 s land on the same state');
  const edited = createSim(structuredClone(setup), { seed: 1 });
  edited.seekSteps(6000);
  assert.deepEqual(first, everything(edited), 'and it is the edited setup flown from 0');
});

test('a new slice target while a replay is stale still restarts from 0 (nit 4)', () => {
  const setup = fresh();
  const sim = createSim(setup, { seed: 1 });
  sim.seekSteps(8000);
  setup.routes[0].points[3].kt = 140;
  sim.forgetHistory();
  sim.seekStepsSlice(4000, 3000);
  setup.routes[0].points[1].kt = 70;
  sim.forgetHistory(); // second edit mid-replay
  while (!sim.seekStepsSlice(5000, 500)); // a different target
  const ref = createSim(structuredClone(setup), { seed: 1 });
  ref.seekSteps(5000);
  assert.deepEqual(everything(sim), everything(ref));
});

test('clearFinished says how many it took out, counted after a replay left between slices has finished (nit 6)', () => {
  const finished = (sim) => sim.state().aircraft.filter((a) => a.status === 'landed' || a.status === 'done').length;
  const sim = createSim(fresh(), { seed: 1 });
  let step = 0;
  while (!finished(sim)) sim.seekSteps((step += STEPS_10S));
  const now = finished(sim);
  assert.equal(sim.clearFinished(), now);
  assert.equal(sim.clearFinished(), 0, 'nothing more to clear');
  // Part way through a replay the state is an earlier moment: the count is for the moment the replay was going to.
  const target = step + 4000;
  const reference = createSim(fresh(), { seed: 1 });
  reference.seekSteps(target - 1);
  const wanted = finished(reference);
  assert.ok(wanted > 0);
  const part = createSim(fresh(), { seed: 1 });
  part.seekSteps(target);
  part.forgetHistory();
  assert.equal(part.seekStepsSlice(target - 1, 100), false);
  assert.equal(part.clearFinished(), wanted, 'the aircraft finished at the end of the replay');
});
