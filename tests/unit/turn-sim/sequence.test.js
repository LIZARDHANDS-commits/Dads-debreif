// Sequences of turns (task 17, item 7): turns flown one after another, each starting where the last ended, with wings-level legs between,
// and the G-warm built from them (SMM 16.22 paras 70 and 71; Figure 16.26 for the sequence). V6 has no sequence and no G-warm, so there is
// no golden test: these tests state timing and continuity, and the legs themselves are createRun's, which the run golden test pins to V6.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../../../src/modules/turn-sim/settings.js';
import { createRun } from '../../../src/modules/turn-sim/engine/run.js';
import { STEP_SEC } from '../../../src/modules/turn-sim/engine/step.js';
import { createSequence, gWarmLegs, gWarmSequence, gWarmProblem, wingmanSide, G_WARM_MIN_KT } from '../../../src/modules/turn-sim/engine/sequence.js';
import { ktToFtps } from '../../../src/core/units.js';
import { turnRateRadPerSec } from '../../../src/core/flight-math.js';

const BASE = { ...DEFAULTS, formation: 'twoShip', startHeadingDeg: 0, speedKt: 220, timing: 'time', direction: 'right' };
const fly = (seq) => { while (seq.step()); return seq; };
const snap = (list) => list.map((a) => [a.id, a.xFt, a.yFt, a.headingRad]);
const turn = (over) => ({ kind: 'turn', maneuver: 'inplace90', turnDeg: 90, direction: 'right', baseG: 3, ...over });
const level = (holdSec, label = 'Wings level') => ({ kind: 'level', holdSec, label });

// ---- createRun's two options the sequence is built on ----

test('createRun continueFrom: the aircraft start where they are given, on their own headings, and the plan turns from there', () => {
  const from = [{ id: 1, xFt: 1234.5, yFt: -678.25, headingRad: 0.3 }, { id: 2, xFt: 1300, yFt: 5000, headingRad: 0.3 }];
  const run = createRun({ ...BASE, maneuver: 'inplace90', turnDeg: 90 }, { continueFrom: from, noPreview: true });
  assert.deepEqual(snap(run.state.aircraft), from.map((f) => [f.id, f.xFt, f.yFt, f.headingRad]));
  run.step();
  // The first step flew from the given point on the given heading (the turn had begun: the heading has moved a step's worth).
  const omega = turnRateRadPerSec(ktToFtps(220), 3);
  assert.ok(Math.abs(run.state.aircraft[0].headingRad - (0.3 - omega * STEP_SEC)) < 1e-9 || Math.abs(run.state.aircraft[0].headingRad - (0.3 + omega * STEP_SEC)) < 1e-9);
  const moved = Math.hypot(run.state.aircraft[0].xFt - 1234.5, run.state.aircraft[0].yFt + 678.25);
  assert.ok(Math.abs(moved - ktToFtps(220) * STEP_SEC) < 1e-6);
});

test('createRun level: nobody turns, everyone flies straight on the heading they have', () => {
  const from = [{ id: 1, xFt: 0, yFt: 0, headingRad: 0.5 }, { id: 2, xFt: 100, yFt: 200, headingRad: 0.5 }];
  const run = createRun({ ...BASE }, { continueFrom: from, level: true, noPreview: true });
  for (let i = 0; i < 100; i++) run.step();
  assert.equal(run.state.turnComplete, true);
  for (const a of run.state.aircraft) {
    assert.equal(a.headingRad, 0.5);
    assert.equal(a.turning, false);
    assert.equal(a.bankDeg, 0);
  }
  const d = ktToFtps(220) * 100 * STEP_SEC;
  assert.ok(Math.abs(run.state.aircraft[0].xFt - d * Math.cos(0.5)) < 1e-6);
  assert.ok(Math.abs(run.state.aircraft[0].yFt - d * Math.sin(0.5)) < 1e-6);
});

// ---- sequence timing and continuity ----

test('one turn leg is exactly a createRun: the same positions and headings step for step, and it ends when the turn does', () => {
  const settings = { ...BASE, maneuver: 'inplace90', turnDeg: 90, baseG: 3, durationSec: 1e9, durationCoversTurn: false };
  const run = createRun(settings, { noPreview: true });
  const seq = createSequence(BASE, [turn()]);
  let steps = 0;
  while (seq.step()) {
    run.step();
    steps++;
    assert.deepEqual(snap(seq.state.aircraft), snap(run.state.aircraft), `step ${steps}`);
  }
  assert.equal(run.state.turnComplete, true);
  assert.equal(seq.state.finished, true);
  const expectSec = (Math.PI / 2) / turnRateRadPerSec(ktToFtps(220), 3);
  assert.ok(Math.abs(steps * STEP_SEC - expectSec) < 0.06, `${steps} steps for a ${expectSec.toFixed(2)} s turn`);
  assert.equal(seq.state.legs[0].steps, steps);
});

test('a wings-level leg lasts exactly its seconds: 5 s is 100 steps, and the aircraft fly straight', () => {
  const seq = createSequence(BASE, [level(5)]);
  const before = snap(seq.state.aircraft);
  let steps = 0;
  while (seq.step()) steps++;
  assert.equal(steps, 100);
  assert.equal(seq.state.legs[0].steps, 100);
  for (const [i, a] of seq.state.aircraft.entries()) {
    assert.equal(a.headingRad, before[i][3]);
    assert.ok(Math.abs(Math.hypot(a.xFt - before[i][1], a.yFt - before[i][2]) - ktToFtps(220) * 5) < 1e-6);
  }
});

test('each leg starts where the last ended: position and heading carry over exactly, and the times chain', () => {
  const seq = fly(createSequence(BASE, [turn(), level(5), turn({ maneuver: 'hook90', turnDeg: 180, baseG: 4 }), turn({ direction: 'left' })]));
  const legs = seq.state.legs;
  assert.equal(legs.length, 4);
  for (let i = 1; i < legs.length; i++) {
    assert.deepEqual(legs[i].start, legs[i - 1].end, `leg ${i} starts where leg ${i - 1} ended`);
    assert.equal(legs[i].startSec, legs[i - 1].endSec, `leg ${i} starts when leg ${i - 1} ended`);
  }
  assert.equal(legs[0].startSec, 0);
  assert.equal(seq.state.tSec, legs[3].endSec);
  assert.deepEqual(legs[3].end, snap(seq.state.aircraft));
  // The history is one row per step across the whole sequence, with no repeated boundary row, and its times are the sequence's.
  const rows = seq.history();
  const steps = legs.reduce((n, l) => n + l.steps, 0);
  assert.equal(rows.length, steps + 1);
  assert.equal(rows[0].tSec, 0);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].tSec > rows[i - 1].tSec);
  assert.equal(rows[rows.length - 1].tSec, seq.state.tSec);
});

test('the first step of a leg moves on from exactly where the last leg ended (a wings-level leg after a turn: one step straight on the exit heading)', () => {
  const seq = createSequence(BASE, [turn(), level(1)]);
  while (seq.state.legIndex === 0) seq.step();
  const end = snap(seq.state.aircraft);
  assert.equal(seq.state.legIndex, 1);
  seq.step();
  const after = seq.state.aircraft;
  for (const [i, a] of after.entries()) {
    assert.equal(a.headingRad, end[i][3]);
    assert.ok(Math.abs(a.xFt - (end[i][1] + Math.cos(end[i][3]) * ktToFtps(220) * STEP_SEC)) < 1e-9);
    assert.ok(Math.abs(a.yFt - (end[i][2] + Math.sin(end[i][3]) * ktToFtps(220) * STEP_SEC)) < 1e-9);
  }
});

test('a gap goes between two turn legs that follow each other, and nowhere else', () => {
  const seq = createSequence(BASE, [turn(), level(5, 'push'), turn({ turnDeg: 180, maneuver: 'hook90' }), turn()], { gapSec: 2 });
  // The push already separates the first two turns, so only the last two get a gap.
  assert.deepEqual(seq.state.legs.map((l) => l.kind), ['turn', 'level', 'turn', 'level', 'turn']);
  assert.deepEqual(seq.state.legs.map((l) => l.label), ['In place 90', 'push', 'Hook', 'Wings level', 'In place 90']);
  fly(seq);
  assert.equal(seq.state.legs[1].steps, 100);
  assert.equal(seq.state.legs[3].steps, 40, 'a gap of 2 s is 40 steps');
  assert.deepEqual(seq.state.legs[4].start, seq.state.legs[3].end);
});

test('sequences are deterministic: the same settings and legs give the same history, bit for bit', () => {
  const legs = [turn(), level(5), turn({ maneuver: 'hook90', turnDeg: 180, baseG: 4 }), turn()];
  const a = fly(createSequence(BASE, legs, { gapSec: 1 }));
  const b = fly(createSequence(BASE, legs, { gapSec: 1 }));
  assert.deepEqual(a.history(), b.history());
  assert.deepEqual(a.state.legs, b.state.legs);
  assert.equal(a.step(), false, 'a finished sequence does not step');
});

test('the settings and the legs are not changed, and a sequence needs legs and sensible ones', () => {
  const settings = Object.freeze({ ...BASE });
  const legs = Object.freeze([Object.freeze(turn())]);
  fly(createSequence(settings, legs, { gapSec: 3 }));
  assert.throws(() => createSequence(BASE, []), /at least one/);
  assert.throws(() => createSequence(BASE, [level(0)]), /holdSec/);
  assert.throws(() => createSequence(BASE, [{ kind: 'spin' }]), /kind/);
  assert.throws(() => createSequence(BASE, [turn({ turnDeg: 0 })]), /turnDeg/);
  assert.throws(() => createSequence(BASE, [turn()], { gapSec: -1 }), /gapSec/);
});

test('two-ship only for now: a four-ship or the box is refused with the reason', () => {
  for (const formation of ['weighted', 'weightedReverse', 'offsetBox']) {
    assert.throws(() => createSequence({ ...BASE, formation }, [turn()]), /two-ship/);
  }
});

// The spread-4 G-warm (16.44, Figure 16.35) is drawn for four aircraft; its picture is checked with Patrick before it is built.
test.todo('four-ship (spread 4, 16.44) sequences and G-warm: waits for the picture to be checked with Patrick');

// ---- the G-warm ----

test('the two-ship wingman is on the right, so "toward the wingman" is a right turn', () => {
  assert.equal(wingmanSide(BASE), 'right');
  const run = createRun(BASE);
  const [lead, two] = run.state.aircraft;
  const h = lead.headingRad;
  const right = (two.xFt - lead.xFt) * Math.sin(h) - (two.yFt - lead.yFt) * Math.cos(h);
  assert.ok(right > 0, 'the wingman is to the right of Lead');
});

test('the G-warm legs (SMM 16.22 paras 70 and 71): in place 90 at 3 G, 5 s push, hook at 4 G, in place 90 at 3 G', () => {
  const legs = gWarmLegs(BASE, { direction: 'right' });
  assert.deepEqual(legs.map((l) => [l.kind, l.maneuver ?? null, l.turnDeg ?? null, l.baseG ?? null, l.holdSec ?? null, l.direction ?? null]), [
    ['turn', 'inplace90', 90, 3, null, 'right'],
    ['level', null, null, null, 5, null],
    ['turn', 'hook90', 180, 4, null, 'right'],
    ['turn', 'inplace90', 90, 3, null, 'right'],
  ]);
  assert.match(legs[1].label, /½ G push/);
  assert.ok(legs.every((l) => typeof l.label === 'string' && l.label.length > 0));
  assert.equal(legs[1].note.includes('vertical'), true, 'the push carries the note that the flat sim cannot show it');
  // The default is toward the wingman; left and right are chosen by name.
  assert.equal(gWarmLegs(BASE)[0].direction, 'right');
  assert.equal(gWarmLegs(BASE, { direction: 'toward' })[0].direction, 'right');
  assert.equal(gWarmLegs(BASE, { direction: 'left' })[0].direction, 'left');
  assert.equal(gWarmLegs(BASE, { direction: 'left' })[2].direction, 'left');
  assert.equal(gWarmLegs(BASE, { pushSec: 4 })[1].holdSec, 4);
  assert.throws(() => gWarmLegs(BASE, { direction: 'up' }), /direction/);
});

test('the G-warm flown: the turns add up to a full circle, so both aircraft end on their original heading, and the sequence is one leg after another', () => {
  for (const direction of ['right', 'left', 'toward']) {
    const seq = fly(gWarmSequence(BASE, { direction }));
    assert.deepEqual(seq.state.legs.map((l) => l.kind), ['turn', 'level', 'turn', 'turn'], direction);
    const start = createRun(BASE).state.aircraft;
    for (const [i, a] of seq.state.aircraft.entries()) {
      const d = Math.atan2(Math.sin(a.headingRad - start[i].headingRad), Math.cos(a.headingRad - start[i].headingRad));
      assert.ok(Math.abs(d) < 5e-4, `${direction} #${a.id}: ${d} rad from the original heading`);
    }
    // 5 s push, exactly.
    assert.equal(seq.state.legs[1].steps, 100, direction);
    // After the first in-place 90 both aircraft are 90 degrees round, on the same heading, the same distance apart.
    const afterFirst = seq.state.legs[0].end;
    assert.ok(Math.abs(afterFirst[0][3] - afterFirst[1][3]) < 1e-9, direction);
    assert.ok(Math.abs(Math.abs(afterFirst[0][3] - start[0].headingRad) - Math.PI / 2) < 5e-4, direction);
    // The pair keep their spacing through in-place turns (both fly the same turn), so the separation at the end is the start's.
    const sep = (list) => Math.hypot(list[0].xFt - list[1].xFt, list[0].yFt - list[1].yFt);
    assert.ok(Math.abs(sep(seq.state.aircraft) - sep(start)) < 1, `${direction}: separation ${sep(seq.state.aircraft)} against ${sep(start)}`);
  }
});

test('the G-warm asks for at least 220 KIAS and a two-ship (16.22 para 70): the problem is reported, and the flight is not changed', () => {
  assert.equal(G_WARM_MIN_KT, 220);
  assert.equal(gWarmProblem({ ...BASE, speedKt: 220 }), null);
  assert.equal(gWarmProblem({ ...BASE, speedKt: 250 }), null);
  assert.match(gWarmProblem({ ...BASE, speedKt: 200 }), /220/);
  // gWarmSequence sets the formation to the two-ship (the button sets up), and flies the speed it is given.
  const seq = gWarmSequence({ ...BASE, formation: 'weighted', speedKt: 200 });
  assert.equal(seq.state.aircraft.length, 2);
  const one = seq.state.aircraft[0];
  seq.step();
  assert.ok(Math.abs(Math.hypot(seq.state.aircraft[0].xFt - one.xFt, seq.state.aircraft[0].yFt - one.yFt) - ktToFtps(200) * STEP_SEC) < 1e-6);
});
