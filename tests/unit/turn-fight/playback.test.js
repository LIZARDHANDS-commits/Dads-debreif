// Checks: how the Simple fight's play loop moves it: capped step per frame, whole fight steps, remainder
//   carried, a trail point every 0.1 s, trails capped at 6,001 points, extent follows the trails.
// Serves: TF-R13, TF-R23.
// Expected values: run compared with the engine's own stepFight, on purpose; the 0.08 s frame cap "as V6 does"
//   is a design choice, no source; 10-minute stop is TF-R23's rule; 1 NM = 6,076.12 ft.

// Playing a fight: the frame limit, whole fight steps, and trails that keep one
// point every 0.1 s whatever the frame rate (SPEC-turn-fight, "Frame time",
// "One fixed step", "Trails").
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIGHT_STEP_SEC, FIGHT_MAX_SEC, createFight, stepFight } from '../../../src/modules/turn-fight/sim.js';
import {
  MAX_FRAME_SEC, TRAIL_INTERVAL_SEC, frameDtSec, createRun, advanceRun,
} from '../../../src/modules/turn-fight/playback.js';

const play = (run, seconds, frameSec) => {
  for (let t = 0; t < seconds - 1e-9; t += frameSec) advanceRun(run, frameSec);
  return run;
};

test('the same fight at 60, 30 and 12.5 frames a second, to within one step', () => {
  const at = (frameSec) => play(createRun({}), 20, frameSec).fight;
  const ref = at(0.02);
  for (const frameSec of [1 / 60, 1 / 30, 0.08]) {
    const f = at(frameSec);
    assert.ok(Math.abs(f.timeSec - ref.timeSec) <= FIGHT_STEP_SEC + 1e-3, `${frameSec}: ${f.timeSec} vs ${ref.timeSec}`);
  }
});

test('frame time that does not fill a step is carried to the next frame, so nothing is lost', () => {
  const run = createRun({});
  advanceRun(run, 0.015);
  assert.equal(run.fight.timeSec, 0);
  advanceRun(run, 0.015);
  assert.ok(Math.abs(run.fight.timeSec - 0.02) < 1e-6);
  assert.ok(run.pendingSec >= 0 && run.pendingSec < FIGHT_STEP_SEC);
});

test('a trail point every 0.1 s of fight time, from T+0, whatever the frame rate', () => {
  assert.equal(TRAIL_INTERVAL_SEC, 0.1);
  const steady = play(createRun({}), 10, 0.02);
  assert.equal(steady.trails.blue.length, 101);
  assert.equal(steady.trails.red.length, 101);
  steady.trails.blue.forEach((p, i) => assert.ok(Math.abs(p.timeSec - i * 0.1) < 1e-3, `point ${i} at ${p.timeSec}`));
  for (const frameSec of [1 / 60, 1 / 30, 0.08, 0.32]) {
    const run = play(createRun({}), 10, frameSec);
    const n = Math.min(run.trails.blue.length, steady.trails.blue.length) - 2; // the last may still be pending
    assert.ok(n > 90, `${frameSec}: ${n}`);
    for (let i = 0; i <= n; i++) assert.deepEqual(run.trails.blue[i], steady.trails.blue[i], `${frameSec} point ${i}`);
  }
});

test('the trail starts at the start positions and a trail point is where the aircraft were', () => {
  const run = createRun({ separationNm: 2 });
  assert.equal(run.trails.blue.length, 1);
  assert.deepEqual(run.trails.blue[0], { timeSec: 0, xFt: run.fight.blue.xFt, yFt: run.fight.blue.yFt, zFt: 0 });
  advanceRun(run, 0.1); // five steps
  assert.equal(run.trails.blue.length, 2);
  assert.equal(run.trails.blue[1].xFt, run.fight.blue.xFt);
  assert.equal(run.trails.red[1].xFt, run.fight.red.xFt);
});

test('extent follows every trail point: the widest reach, the x range and the tallest height', () => {
  const run = createRun({ separationNm: 2, vertical: true, bluePitchDeg: 30, redPitchDeg: -10 });
  assert.equal(run.trails.extent.maxAbsFt, 6076.12); // 2 NM apart: each 1 NM from the centre, the furthest point
  play(run, 25, 0.02);
  const e = run.trails.extent;
  const pts = [...run.trails.blue, ...run.trails.red];
  assert.equal(e.maxAbsFt, Math.max(...pts.map((p) => Math.max(Math.abs(p.xFt), Math.abs(p.yFt)))));
  assert.equal(e.minXFt, Math.min(...pts.map((p) => p.xFt)));
  assert.equal(e.maxXFt, Math.max(...pts.map((p) => p.xFt)));
  assert.equal(e.maxAbsZFt, Math.max(...pts.map((p) => Math.abs(p.zFt))));
  assert.ok(e.maxAbsZFt > 1000);
});
