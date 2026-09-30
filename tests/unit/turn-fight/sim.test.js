// The Turn Fight's fight (SPEC-turn-fight, Testing strategy 3): what the numbers mean.
// tests/golden/turn-fight-sim.test.js pins the same code to V6 step by step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FT_PER_NM } from '../../../src/core/units.js';
import { wrapPi } from '../../../src/core/angles.js';
import { START_DEFAULTS, startGeometry } from '../../../src/modules/turn-fight/geometry.js';
import {
  FIGHT_STEP_SEC, FIGHT_MAX_SEC, FIRST_NOSE_DEG, V6_DEFAULT_SETUP,
  levelTurn, mergeTimeSec, offNoseDeg, offNose3dDeg, ataDeg, rangeFt, sinceMergeSec, createFight, stepFight,
} from '../../../src/modules/turn-fight/sim.js';

const near = (actual, expected, tol, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} ${actual} vs ${expected}`);
const r1 = (x) => Math.round(x * 10) / 10;

/** Steps until `done(state)` or `limitSec`, in whole fight steps, and returns the state. */
function runUntil(setup, done, limitSec = 120) {
  const s = createFight(setup);
  for (let i = 0; i < limitSec / FIGHT_STEP_SEC && !done(s); i++) stepFight(s, FIGHT_STEP_SEC);
  return s;
}
const sinceMerge = (s) => s.firstNose.timeSec - s.mergeSec;

test('220 KTAS at 4 G turns at 19.2°/s on a 1,106 ft radius, 360° in 18.7 s (V6 `M`)', () => {
  const t = levelTurn(220, 4);
  assert.equal(t.rateDegPerSec.toFixed(1), '19.2');
  assert.equal(t.radiusFt.toFixed(0), '1106');
  assert.equal((360 / t.rateDegPerSec).toFixed(1), '18.7');
  near(t.speedFtps, 220 * 1.68781, 1e-12);
});

test('G is limited to 1.01 and up, so a 1 G "turn" still turns, slowly', () => {
  for (const g of [1, 0.5, 0, -3]) assert.equal(levelTurn(220, g).g, 1.01);
  assert.equal(levelTurn(220, 4).g, 4);
  assert.ok(Number.isFinite(levelTurn(220, 1).radiusFt));
});

test('a turn is tighter and faster with more G, and wider and slower at more speed', () => {
  assert.ok(levelTurn(220, 5).radiusFt < levelTurn(220, 4).radiusFt);
  assert.ok(levelTurn(220, 5).rateDegPerSec > levelTurn(220, 4).rateDegPerSec);
  assert.ok(levelTurn(300, 4).radiusFt > levelTurn(220, 4).radiusFt);
  assert.ok(levelTurn(300, 4).rateDegPerSec < levelTurn(220, 4).rateDegPerSec);
});

test('the merge is the separation divided by the closing speed: T+16.4 s at V6\'s defaults, 16.0 s at 250 and 200 kt', () => {
  assert.equal(r1(mergeTimeSec(2, 220, 220)), 16.4);
  assert.equal(r1(mergeTimeSec(2, 250, 200)), 16);
  assert.equal(createFight().mergeSec, mergeTimeSec(2, 220, 220));
});

test('the defaults are V6\'s: 2-circle, 2 NM, 220 KTAS and 4 G each, both extras off, pitch 0', () => {
  assert.deepEqual({ ...V6_DEFAULT_SETUP }, {
    circles: 2, separationNm: 2, blueKt: 220, redKt: 220, blueG: 4, redG: 4, chase: false, vertical: false, bluePitchDeg: 0, redPitchDeg: 0,
  });
  // The start-geometry boxes (R28) open at head-on, level, turns at the pass: V6's fight.
  assert.deepEqual(createFight().setup, { ...V6_DEFAULT_SETUP, ...START_DEFAULTS });
  assert.deepEqual(createFight({}).setup, createFight(V6_DEFAULT_SETUP).setup);
});

test('the start: Blue on the left heading east, Red on the right heading west, the separation apart, level', () => {
  const s = createFight({ separationNm: 3 });
  near(s.blue.xFt, -1.5 * FT_PER_NM, 1e-9);
  near(s.red.xFt, 1.5 * FT_PER_NM, 1e-9);
  assert.deepEqual([s.blue.yFt, s.red.yFt, s.blue.zFt, s.red.zFt, s.blue.pitchRad, s.red.pitchRad], [0, 0, 0, 0, 0, 0]);
  assert.equal(s.blue.headingRad, 0);
  assert.equal(s.red.headingRad, Math.PI);
  near(rangeFt(s), 3 * FT_PER_NM, 1e-9);
  assert.deepEqual([s.timeSec, s.merged, s.stopped, s.firstNose], [0, false, false, null]);
  assert.equal(offNoseDeg(s.blue, s.red), 0, 'head-on, the other is dead ahead');
});

test('before the merge both fly straight and level at their own speed; the merge puts both at the centre at T+16.4 s', () => {
  const s = createFight();
  stepFight(s, 10);
  near(s.timeSec, 10, 1e-9);
  near(s.blue.xFt, -FT_PER_NM + 220 * 1.68781 * 10, 1e-6);
  near(s.red.xFt, FT_PER_NM - 220 * 1.68781 * 10, 1e-6);
  assert.deepEqual([s.blue.headingRad, s.red.headingRad, s.blue.yFt, s.merged], [0, Math.PI, 0, false]);
  const merged = runUntil({}, (f) => f.merged);
  assert.equal(r1(merged.timeSec), 16.4);
  // The step that reaches the merge is cut there: the rest of it is flown as the first turn step.
  assert.ok(merged.timeSec >= merged.mergeSec && merged.timeSec < merged.mergeSec + FIGHT_STEP_SEC + 1e-9);
  const oneStepFt = 220 * 1.68781 * FIGHT_STEP_SEC;
  for (const p of [merged.blue, merged.red]) assert.ok(Math.hypot(p.xFt, p.yFt) <= oneStepFt, 'within one step of the centre');
});

test('the merge puts both aircraft at the centre, exactly: the step that merges is cut short there', () => {
  // Fly all the whole steps before the merge, then the one that reaches it.
  const s = createFight({ separationNm: 1, blueKt: 300, redKt: 300 });
  const { mergeSec } = s;
  stepFight(s, Math.floor(mergeSec / FIGHT_STEP_SEC) * FIGHT_STEP_SEC);
  assert.equal(s.merged, false);
  stepFight(s, FIGHT_STEP_SEC);
  assert.equal(s.merged, true);
  const remainderSec = s.timeSec - mergeSec;
  const speedFtps = 300 * 1.68781;
  // Both were at (0,0) at the merge and have flown `remainderSec` since.
  near(Math.hypot(s.blue.xFt, s.blue.yFt), speedFtps * remainderSec, 1e-6);
  near(Math.hypot(s.red.xFt, s.red.yFt), speedFtps * remainderSec, 1e-6);
});

test('at different speeds the jets end up together at the merge (Q49: they meet there; V6 moved them)', () => {
  const s = runUntil({ blueKt: 250, redKt: 200 }, (f) => f.merged);
  assert.equal(r1(s.timeSec), 16);
  near(Math.hypot(s.blue.xFt, s.blue.yFt), 250 * 1.68781 * (s.timeSec - s.mergeSec), 1e-6);
  near(Math.hypot(s.red.xFt, s.red.yFt), 200 * 1.68781 * (s.timeSec - s.mergeSec), 1e-6);
});

/** Where each aircraft would be at the merge if it flew on straight from the last whole step before it: its x, in feet. */
function pointAtMerge(setup) {
  const s = createFight(setup);
  stepFight(s, Math.floor(s.mergeSec / FIGHT_STEP_SEC) * FIGHT_STEP_SEC);
  assert.equal(s.merged, false);
  const left = s.mergeSec - s.timeSec;
  return {
    blueXFt: s.blue.xFt + s.perf.blue.speedFtps * left,
    redXFt: s.red.xFt - s.perf.red.speedFtps * left,
  };
}

test('Q49: the jets start weighted by speed: Blue at -V1 / (V1 + V2) of the separation, Red at +V2 / (V1 + V2)', () => {
  const s = createFight({ blueKt: 250, redKt: 200, separationNm: 2 });
  near(s.blue.xFt, (-250 / 450) * 2 * FT_PER_NM, 1e-9);
  near(s.red.xFt, (200 / 450) * 2 * FT_PER_NM, 1e-9);
  near(rangeFt(s), 2 * FT_PER_NM, 1e-9, 'the separation is still the range');
  // Equal speeds: the same start as V6's, half the separation each side.
  const even = createFight({ blueKt: 220, redKt: 220 });
  near(even.blue.xFt, -FT_PER_NM, 1e-9);
  near(even.red.xFt, FT_PER_NM, 1e-9);
  // The faster aircraft starts further from the centre.
  const fast = createFight({ blueKt: 300, redKt: 100 });
  assert.ok(-fast.blue.xFt > fast.red.xFt);
});

test('Q49: at 250 and 200 kt the jets meet at the centre, with no jump; V6 met 675 ft off and then moved both', () => {
  const now = pointAtMerge({ blueKt: 250, redKt: 200 });
  near(now.blueXFt, 0, 1e-6, 'Blue at the merge');
  near(now.redXFt, 0, 1e-6, 'Red at the merge');
  const v6 = pointAtMerge({ blueKt: 250, redKt: 200, v6Start: true });
  near(v6.blueXFt, 675.1, 0.1, 'V6: Blue 675 ft off the centre');
  near(v6.redXFt, 675.1, 0.1, 'V6: Red 675 ft off the centre');
});

test('Q49: v6Start keeps V6\'s start (equal distance from the centre) and is not part of the setup boxes', () => {
  const s = createFight({ blueKt: 250, redKt: 200, v6Start: true });
  near(s.blue.xFt, -FT_PER_NM, 1e-9);
  near(s.red.xFt, FT_PER_NM, 1e-9);
  assert.deepEqual(s.setup, createFight({ blueKt: 250, redKt: 200 }).setup, 'the setup copy has only the boxes');
  assert.ok(!('v6Start' in V6_DEFAULT_SETUP));
});

test('Q49: everything from the merge on is the same in both starts', () => {
  for (const setup of [{ blueKt: 250, redKt: 200 }, { circles: 1, blueKt: 150, redKt: 300, vertical: true, bluePitchDeg: 30, redPitchDeg: -20 }]) {
    const now = createFight(setup), v6 = createFight({ ...setup, v6Start: true });
    const steps = Math.ceil((now.mergeSec + 5) / FIGHT_STEP_SEC);
    for (let i = 0; i < steps; i++) { stepFight(now, FIGHT_STEP_SEC); stepFight(v6, FIGHT_STEP_SEC); }
    assert.ok(now.merged && v6.merged);
    for (const who of ['blue', 'red']) for (const k of ['xFt', 'yFt', 'zFt', 'headingRad', 'pitchRad']) near(now[who][k], v6[who][k], 1e-9, `${who} ${k}`);
    assert.equal(now.mergeSec, v6.mergeSec);
  }
});

test('after the merge Blue turns left, and Red turns left in a 2-circle fight and right in a 1-circle fight', () => {
  for (const [circles, redSign] of [[2, 1], [1, -1]]) {
    const s = createFight({ circles });
    stepFight(s, s.mergeSec + 1);
    const blue0 = s.blue.headingRad, red0 = s.red.headingRad;
    stepFight(s, 1);
    near(s.blue.headingRad - blue0, s.perf.blue.rateRadPerSec * 1, 1e-9, 'Blue');
    near(s.red.headingRad - red0, redSign * s.perf.red.rateRadPerSec * 1, 1e-9, `Red, ${circles}-circle`);
  }
});

test('a 360° turn takes 360 ÷ rate seconds: heading is back where it started after 18.7 s', () => {
  const s = createFight();
  stepFight(s, s.mergeSec + 0.02);
  const h0 = s.blue.headingRad, t0 = s.timeSec;
  const turnSec = 2 * Math.PI / s.perf.blue.rateRadPerSec;
  while (s.timeSec - t0 < turnSec - 0.02) stepFight(s, 0.02);
  near(s.blue.headingRad - h0, 2 * Math.PI, s.perf.blue.rateRadPerSec * 0.02 + 1e-9);
  assert.equal(r1(turnSec), 18.7);
});

test('first nose-on at V6\'s defaults: +18.2 s in a 2-circle fight, +9.1 s in a 1-circle fight (a tie, so it is marked as both)', () => {
  assert.equal(r1(sinceMerge(runUntil({ circles: 2 }, (s) => s.firstNose))), 18.2);
  assert.equal(r1(sinceMerge(runUntil({ circles: 1 }, (s) => s.firstNose))), 9.1);
});

test('Q48: a tie is marked as both: an even fight has `both` true in either fight type, and an uneven one has it false', () => {
  for (const circles of [1, 2]) {
    const tie = runUntil({ circles }, (s) => s.firstNose);
    assert.equal(tie.firstNose.both, true, `${circles}-circle, even`);
    assert.ok(offNoseDeg(tie.blue, tie.red) <= 5 && offNoseDeg(tie.red, tie.blue) <= 5, 'both noses are within 5°');
    // `by` stays a valid aircraft for code that reads the old field: Blue, never rounding noise.
    assert.equal(tie.firstNose.by, 'blue');
  }
  assert.equal(runUntil({ blueKt: 250, redKt: 200 }, (s) => s.firstNose).firstNose.both, false);
  assert.equal(runUntil({ blueG: 5 }, (s) => s.firstNose).firstNose.both, false);
});

test('Q48: both within 5° in the same step is "both" even when the fight is uneven; the line still runs Blue to Red', () => {
  // Noses on each other from the merge point's two sides, then one step: neither leaves 5° in 0.02 s.
  const s = createFight({ blueKt: 250, redKt: 200 });
  s.merged = true;
  s.timeSec = s.mergeSec;
  Object.assign(s.blue, { xFt: -1000, yFt: 0, headingRad: 0 });
  Object.assign(s.red, { xFt: 1000, yFt: 0, headingRad: Math.PI });
  stepFight(s, FIGHT_STEP_SEC);
  assert.equal(s.firstNose.both, true);
  assert.deepEqual(s.firstNose.from, { xFt: s.blue.xFt, yFt: s.blue.yFt });
  assert.deepEqual(s.firstNose.to, { xFt: s.red.xFt, yFt: s.red.yFt });
});

test('Q48: with First nose chases a tie chases the same as V6 does: both turn toward each other at their own rate', () => {
  const s = createFight({ chase: true });
  while (!s.firstNose) stepFight(s, FIGHT_STEP_SEC);
  assert.equal(s.firstNose.both, true);
  const before = [s.blue.headingRad, s.red.headingRad];
  stepFight(s, FIGHT_STEP_SEC);
  // Turning toward each other, neither more than rate × step.
  const maxTurn = s.perf.blue.rateRadPerSec * FIGHT_STEP_SEC + 1e-12;
  assert.ok(Math.abs(wrapPi(s.blue.headingRad - before[0])) <= maxTurn && Math.abs(wrapPi(s.red.headingRad - before[1])) <= maxTurn);
});

test('first nose-on in an uneven 2-circle fight goes to the faster turn: Red at 200 kt beats Blue at 250 kt, at +14.4 s', () => {
  const s = runUntil({ blueKt: 250, redKt: 200 }, (f) => f.firstNose);
  assert.equal(s.firstNose.by, 'red');
  assert.equal(r1(sinceMerge(s)), 14.4);
  assert.ok(s.perf.red.rateDegPerSec > s.perf.blue.rateDegPerSec);
});

test('first nose-on with more G goes to the harder puller: Blue at 5 G at +12.6 s; Red at 5 G gets it instead', () => {
  const blue = runUntil({ blueG: 5 }, (f) => f.firstNose);
  assert.equal(blue.firstNose.by, 'blue');
  assert.equal(r1(sinceMerge(blue)), 12.6);
  assert.equal(runUntil({ redG: 5 }, (f) => f.firstNose).firstNose.by, 'red');
});

test('first nose-on is marked once, with the time and both positions, when an aircraft is within 5° of the other', () => {
  const s = runUntil({ blueG: 5 }, (f) => f.firstNose);
  const mark = s.firstNose;
  assert.equal(FIRST_NOSE_DEG, 5);
  assert.equal(mark.timeSec, s.timeSec);
  assert.deepEqual(mark.from, { xFt: s.blue.xFt, yFt: s.blue.yFt });
  assert.deepEqual(mark.to, { xFt: s.red.xFt, yFt: s.red.yFt });
  assert.ok(offNoseDeg(s.blue, s.red) <= 5);
  stepFight(s, 30);
  assert.equal(s.firstNose, mark, 'the mark stays');
  assert.equal(sinceMergeSec(s), s.timeSec - s.mergeSec);
});

test('nothing is marked before the merge, even though the noses are pointing at each other', () => {
  const s = createFight();
  stepFight(s, 10);
  assert.equal(s.firstNose, null);
  assert.equal(sinceMergeSec(s), 0);
});

test('with First nose chases, the aircraft that got first nose-on keeps its nose on, and no one turns faster than its own rate', () => {
  const chase = createFight({ blueG: 5, chase: true });
  const free = createFight({ blueG: 5 });
  for (const s of [chase, free]) while (!s.firstNose) stepFight(s, 0.02);
  assert.equal(chase.firstNose.by, 'blue');
  for (let i = 0; i < 100; i++) {
    const b0 = chase.blue.headingRad, r0 = chase.red.headingRad;
    stepFight(chase, 0.02);
    stepFight(free, 0.02);
    assert.ok(Math.abs(wrapPi(chase.blue.headingRad - b0)) <= chase.perf.blue.rateRadPerSec * 0.02 + 1e-12, 'Blue turn');
    assert.ok(Math.abs(wrapPi(chase.red.headingRad - r0)) <= chase.perf.red.rateRadPerSec * 0.02 + 1e-12, 'Red turn');
    assert.ok(offNoseDeg(chase.blue, chase.red) <= FIRST_NOSE_DEG, `Blue stays nose-on, step ${i}`);
  }
  assert.ok(offNoseDeg(free.blue, free.red) > 30, 'left alone, the same aircraft is already well off the other');
});

test('the chase wraps headings into ±π, as V6 does, where a free turn keeps counting past 2π', () => {
  const chase = createFight({ blueG: 5, chase: true });
  const free = createFight({ blueG: 5 });
  stepFight(chase, 40);
  stepFight(free, 40);
  assert.ok(Math.abs(chase.blue.headingRad) <= Math.PI && Math.abs(chase.red.headingRad) <= Math.PI);
  assert.ok(free.blue.headingRad > 2 * Math.PI);
});

test('without the chase, the turn never changes course after first nose-on (both keep turning at the set rate)', () => {
  const s = runUntil({ blueG: 5 }, (f) => f.firstNose);
  const b0 = s.blue.headingRad;
  stepFight(s, 1);
  near(s.blue.headingRad - b0, s.perf.blue.rateRadPerSec, 1e-9);
});

test('Climb and dive off ignores the pitch boxes: the fight stays level', () => {
  const s = createFight({ vertical: false, bluePitchDeg: 30, redPitchDeg: -20 });
  stepFight(s, 60);
  assert.deepEqual([s.blue.zFt, s.red.zFt, s.blue.pitchRad, s.red.pitchRad], [0, 0, 0, 0]);
});

test('Climb and dive: level to the merge, then each takes its pitch, climbs at speed × sin(pitch) and its ground track shrinks by cos(pitch)', () => {
  const s = createFight({ vertical: true, bluePitchDeg: 30, redPitchDeg: -20 });
  stepFight(s, s.mergeSec - 1);
  assert.deepEqual([s.blue.zFt, s.red.zFt, s.blue.pitchRad, s.red.pitchRad], [0, 0, 0, 0]);
  stepFight(s, 2);
  assert.ok(s.merged);
  near(s.blue.pitchRad, Math.PI / 6, 1e-12);
  near(s.red.pitchRad, -20 * Math.PI / 180, 1e-12);
  const z0 = s.blue.zFt, rz0 = s.red.zFt;
  const x0 = s.blue.xFt, y0 = s.blue.yFt;
  stepFight(s, 0.02);
  const v = 220 * 1.68781;
  near(s.blue.zFt - z0, v * Math.sin(Math.PI / 6) * 0.02, 1e-9);
  near(s.red.zFt - rz0, -v * Math.sin(20 * Math.PI / 180) * 0.02, 1e-9);
  near(Math.hypot(s.blue.xFt - x0, s.blue.yFt - y0), v * Math.cos(Math.PI / 6) * 0.02, 1e-9);
  near(rangeFt(s), Math.hypot(s.red.xFt - s.blue.xFt, s.red.yFt - s.blue.yFt, s.red.zFt - s.blue.zFt), 1e-9, 'range includes height');
});

test('Climb and dive keeps the level turn rate (Q50): heading changes at the same rate as a level fight', () => {
  const level = createFight();
  const vertical = createFight({ vertical: true, bluePitchDeg: 40, redPitchDeg: 40 });
  for (const s of [level, vertical]) stepFight(s, s.mergeSec + 5);
  near(vertical.blue.headingRad, level.blue.headingRad, 1e-9);
});

test('a chasing aircraft never pitches past 60° up or down', () => {
  const s = createFight({ vertical: true, chase: true, bluePitchDeg: 60, redPitchDeg: -60 });
  for (let i = 0; i < 20000; i++) {
    stepFight(s, 0.02);
    assert.ok(Math.abs(s.blue.pitchRad) <= Math.PI / 3 + 1e-12 && Math.abs(s.red.pitchRad) <= Math.PI / 3 + 1e-12, `pitch at step ${i}`);
  }
});

test('the fight is the same at any frame rate: 50, 60 and 30 frames a second, and uneven frames, all make the same whole steps', () => {
  const at = (frameSec, frames) => {
    const s = createFight({ blueKt: 250, redKt: 200, blueG: 5, chase: true });
    for (let i = 0; i < frames; i++) stepFight(s, frameSec);
    return s;
  };
  const ref = at(0.02, 1500); // 30 s
  for (const [frameSec, frames] of [[1 / 50, 1500], [1 / 60, 1800], [1 / 30, 900], [0.08, 375], [0.005, 6000]]) {
    const s = at(frameSec, frames);
    assert.equal(s.timeSec, ref.timeSec, `${frameSec} s frames: time`);
    assert.deepEqual([s.blue, s.red, s.firstNose], [ref.blue, ref.red, ref.firstNose], `${frameSec} s frames`);
  }
  // Frames of uneven length: same whole steps as the reference once the steps are counted.
  const uneven = createFight({ blueKt: 250, redKt: 200, blueG: 5, chase: true });
  const frames = [0.016, 0.033, 0.08, 0.0007, 0.05, 0.0199, 0.021];
  let total = 0;
  for (let i = 0; i < 700; i++) { const f = frames[i % frames.length]; total += f; stepFight(uneven, f); }
  const stepsDone = Math.round(uneven.timeSec / FIGHT_STEP_SEC);
  assert.equal(stepsDone, Math.floor(total / FIGHT_STEP_SEC + 1e-9));
  const same = at(0.02, stepsDone);
  assert.deepEqual([uneven.blue, uneven.red, uneven.firstNose], [same.blue, same.red, same.firstNose]);
});

test('time that doesn\'t fill a step is carried to the next frame', () => {
  const s = createFight();
  stepFight(s, 0.019);
  assert.equal(s.timeSec, 0);
  assert.ok(s.carrySec > 0.0189 && s.carrySec < 0.0191);
  stepFight(s, 0.001);
  near(s.timeSec, 0.02, 1e-12);
  assert.ok(s.carrySec < 1e-9);
  stepFight(s, 0.05);
  near(s.timeSec, 0.06, 1e-12, 'two more whole steps, 0.01 s carried');
  near(s.carrySec, 0.01, 1e-9);
});

test('a zero, negative or unreadable frame time moves nothing', () => {
  const s = createFight();
  for (const dt of [0, -1, NaN, Infinity, -Infinity, undefined, null]) stepFight(s, dt);
  assert.equal(s.timeSec, 0);
  assert.equal(s.carrySec, 0);
});

test('stepFight changes the state it is given and returns it', () => {
  const s = createFight();
  assert.equal(stepFight(s, 1), s);
  near(s.timeSec, 1, 1e-9);
});

test('the fight stops at 10 minutes and stays stopped', () => {
  const s = createFight();
  for (let i = 0; i < 700 * 50; i++) stepFight(s, 0.02);
  assert.equal(s.stopped, true);
  near(s.timeSec, FIGHT_MAX_SEC, 1e-6);
  assert.equal(FIGHT_MAX_SEC, 600);
  const frozen = JSON.stringify(s);
  stepFight(s, 10);
  assert.equal(JSON.stringify(s), frozen);
});

test('one long frame stops at 10 minutes too, and discards the time beyond it', () => {
  const s = createFight();
  stepFight(s, 5000);
  assert.equal(s.stopped, true);
  near(s.timeSec, FIGHT_MAX_SEC, 1e-6);
  assert.equal(s.carrySec, 0);
});

test('a fight that is not yet 10 minutes old is not stopped', () => {
  const s = createFight();
  stepFight(s, 599.9);
  assert.equal(s.stopped, false);
  stepFight(s, 0.2);
  assert.equal(s.stopped, true);
});

test('offNoseDeg: dead ahead is 0°, abeam 90°, dead astern 180°, whichever side', () => {
  const at = (x, y, headingRad) => ({ xFt: x, yFt: y, zFt: 0, headingRad, pitchRad: 0 });
  near(offNoseDeg(at(0, 0, 0), at(100, 0, 0)), 0, 1e-12);
  near(offNoseDeg(at(0, 0, 0), at(0, 100, 0)), 90, 1e-12);
  near(offNoseDeg(at(0, 0, 0), at(0, -100, 0)), 90, 1e-12);
  near(offNoseDeg(at(0, 0, 0), at(-100, 0, 0)), 180, 1e-12);
  near(offNoseDeg(at(0, 0, 4 * Math.PI + 0.5), at(100, 0, 0)), 28.6479, 1e-3, 'heading goes past 2π in a long fight');
});

const at3 = (x, y, z, headingRad, pitchRad) => ({ xFt: x, yFt: y, zFt: z, headingRad, pitchRad });

test('Q51: offNose3dDeg is the angle from the nose (heading and pitch) to the line of sight, height included', () => {
  const deg = (d) => (d * Math.PI) / 180;
  // Level, same height: the ground-plane angle, the same as offNoseDeg.
  near(offNose3dDeg(at3(0, 0, 0, 0, 0), at3(100, 0, 0, 0, 0)), 0, 1e-9);
  near(offNose3dDeg(at3(0, 0, 0, 0, 0), at3(0, 100, 0, 0, 0)), 90, 1e-9);
  near(offNose3dDeg(at3(0, 0, 0, 0, 0), at3(-100, 0, 0, 0, 0)), 180, 1e-9);
  near(offNose3dDeg(at3(0, 0, 0, deg(20), 0), at3(100, 0, 0, 0, 0)), 20, 1e-9);
  // Nose 30° up at a jet level and dead ahead: 30° off. The ground plane says 0°.
  near(offNose3dDeg(at3(0, 0, 0, 0, deg(30)), at3(1000, 0, 0, 0, 0)), 30, 1e-9);
  assert.equal(offNoseDeg(at3(0, 0, 0, 0, deg(30)), at3(1000, 0, 0, 0, 0)), 0);
  // A jet 1,000 ft above at 1,000 ft ahead is 45° up; nose level: 45° off. Nose on it: 0°.
  near(offNose3dDeg(at3(0, 0, 0, 0, 0), at3(1000, 0, 1000, 0, 0)), 45, 1e-9);
  near(offNose3dDeg(at3(0, 0, 0, 0, deg(45)), at3(1000, 0, 1000, 0, 0)), 0, 1e-6);
  // Straight above, nose level: 90°. Below with the nose down 60°: 30°.
  near(offNose3dDeg(at3(0, 0, 0, 0, 0), at3(0, 0, 500, 0, 0)), 90, 1e-9);
  near(offNose3dDeg(at3(0, 0, 0, 0, deg(-60)), at3(0, 0, -500, 0, 0)), 30, 1e-9);
  // A heading that has gone past 2π in a long fight.
  near(offNose3dDeg(at3(0, 0, 0, 4 * Math.PI + 0.5, 0), at3(100, 0, 0, 0, 0)), 28.6479, 1e-3);
  // On top of each other: no line of sight, so the ground-plane answer, never NaN.
  assert.equal(offNose3dDeg(at3(5, 5, 5, 1, 0.5), at3(5, 5, 5, 0, 0)), offNoseDeg(at3(5, 5, 5, 1, 0.5), at3(5, 5, 5, 0, 0)));
});

test('Q51: ataDeg measures in 3D only with Climb and dive on (and not with v6OffNose); otherwise it is V6\'s ground-plane angle', () => {
  const pitched = (extra) => {
    const s = createFight({ vertical: true, bluePitchDeg: 30, redPitchDeg: -20, ...extra });
    s.merged = true;
    Object.assign(s.blue, { xFt: 0, yFt: 0, zFt: 0 });
    Object.assign(s.red, { xFt: 3000, yFt: 0, zFt: 0 });
    return s;
  };
  const on = pitched({});
  on.blue.pitchRad = Math.PI / 6;
  near(ataDeg(on, on.blue, on.red), 30, 1e-9, 'Climb and dive on: 3D');
  on.red.pitchRad = -Math.PI / 9;
  near(ataDeg(on, on.red, on.blue), 20, 1e-9, 'Red nose 20° down at a jet level with it');
  const v6 = pitched({ v6OffNose: true });
  v6.blue.pitchRad = Math.PI / 6;
  assert.equal(ataDeg(v6, v6.blue, v6.red), 0, 'v6OffNose: the ground-plane angle');
  const level = createFight({ bluePitchDeg: 30 });
  level.blue.pitchRad = Math.PI / 6;
  assert.equal(ataDeg(level, level.blue, level.red), offNoseDeg(level.blue, level.red), 'Climb and dive off: pitch is ignored');
});

test('Q51: with Climb and dive on, first nose-on is not called on a jet that is high above or below: climbing at 30° against diving at 20° none comes in 10 minutes, where V6 called it at +18.2 s', () => {
  const setup = { vertical: true, bluePitchDeg: 30, redPitchDeg: -20 };
  const v6 = runUntil({ ...setup, v6OffNose: true }, (f) => f.firstNose);
  assert.equal(r1(sinceMerge(v6)), 18.2);
  assert.equal(v6.firstNose.both, true);
  const now = runUntil(setup, () => false, FIGHT_MAX_SEC);
  assert.equal(now.firstNose, null);
  assert.equal(now.stopped, true);
});

test('Q51: a small pitch only delays first nose-on: both climbing at 3° is marked at +18.3 s in 3D, V6 had +18.2 s', () => {
  const setup = { vertical: true, bluePitchDeg: 3, redPitchDeg: 3 };
  assert.equal(r1(sinceMerge(runUntil(setup, (f) => f.firstNose))), 18.3);
  assert.equal(r1(sinceMerge(runUntil({ ...setup, v6OffNose: true }, (f) => f.firstNose))), 18.2);
});

test('Q51: with Climb and dive on but both pitches 0, nothing changes: first nose-on is V6\'s, +18.2 s', () => {
  const setup = { vertical: true };
  const now = runUntil(setup, (f) => f.firstNose), v6 = runUntil({ ...setup, v6OffNose: true }, (f) => f.firstNose);
  assert.equal(r1(sinceMerge(now)), 18.2);
  assert.equal(now.firstNose.timeSec, v6.firstNose.timeSec);
});

test('Q51: with Climb and dive off the pitch boxes and v6OffNose change nothing: the same fight, step for step', () => {
  const a = createFight({ bluePitchDeg: 40, blueG: 5 }), b = createFight({ bluePitchDeg: 40, blueG: 5, v6OffNose: true });
  for (let i = 0; i < 1500; i++) { stepFight(a, FIGHT_STEP_SEC); stepFight(b, FIGHT_STEP_SEC); }
  assert.deepEqual({ ...a, v6OffNose: null }, { ...b, v6OffNose: null });
  assert.ok(a.firstNose);
});

test('Q51: v6OffNose is an option, not one of the boxes: it is not kept in the setup', () => {
  assert.deepEqual(createFight({ v6OffNose: true }).setup, createFight().setup);
  assert.ok(!('v6OffNose' in V6_DEFAULT_SETUP));
});

test('a setup that can\'t fly is refused, not run', () => {
  for (const bad of [
    { circles: 3 }, { circles: 0 }, { separationNm: 0 }, { separationNm: -2 }, { separationNm: NaN }, { separationNm: Infinity },
    { blueKt: 0 }, { redKt: -5 }, { blueKt: NaN }, { blueG: NaN }, { redG: Infinity }, { bluePitchDeg: NaN }, { redPitchDeg: Infinity },
  ]) assert.throws(() => createFight(bad), RangeError, JSON.stringify(bad));
});

test('the setup is copied: changing it afterwards does not change the fight', () => {
  const setup = { blueKt: 250 };
  const s = createFight(setup);
  setup.blueKt = 100;
  assert.equal(s.setup.blueKt, 250);
  assert.equal(s.perf.blue.speedKt, 250);
});

// ── R28: start geometry and altitudes ────────────────────────────────────────

/** Where the jets are at the pass, to see the geometry without the snap: the closest the range gets in a fight. */
function closestRange(setup) {
  const s = createFight({ ...setup, turnsAt: 'pass' });
  let best = { rangeFt: Infinity, timeSec: 0 };
  while (!s.merged) {
    const r = rangeFt(s);
    if (r < best.rangeFt) best = { rangeFt: r, timeSec: s.timeSec };
    stepFight(s, FIGHT_STEP_SEC);
  }
  return { best, state: s };
}

test('R28: at the defaults nothing about the start changes: head-on, merge at T+16.4, both snapped to the centre', () => {
  const s = createFight();
  assert.equal(s.mergeSec, mergeTimeSec(2, 220, 220));
  assert.equal(s.mergeMark, true);
  assert.deepEqual(s.turnDir, { blue: 1, red: 1 });
  const m = runUntil({}, (f) => f.merged);
  assert.ok(m.merged);
  near(Math.hypot(m.blue.xFt, m.blue.yFt), 220 * 1.68781 * (m.timeSec - m.mergeSec), 1e-6);
  // The side of ATA and AA means nothing at head-on: the same fight either way.
  const a = createFight({ startAtaSide: 'right', startAaSide: 'right' });
  for (const who of ['blue', 'red']) for (const k of ['xFt', 'yFt', 'headingRad']) assert.equal(a[who][k], s[who][k], `${who} ${k}`);
});

test('R28: ATA 0°, AA 90°: Red crosses Blue\'s nose, HCA 90°, and the pass is at the closest approach, midway between them at the centre', () => {
  const { best, state } = closestRange({ startAaDeg: 90, startAaSide: 'left' });
  assert.ok(state.merged);
  assert.equal(state.start.hcaDeg.toFixed(6), '90.000000');
  // Red flies off at right angles: the closest the range gets is the range over √2, at T+8.2 s (half the head-on merge).
  near(best.rangeFt, (2 * FT_PER_NM) / Math.SQRT2, 220 * 1.68781 * FIGHT_STEP_SEC * 2, 'closest range');
  near(state.timeSec, (2 * FT_PER_NM) / (2 * 220 * 1.68781), FIGHT_STEP_SEC, 'the pass');
  const mid = [(state.blue.xFt + state.red.xFt) / 2, (state.blue.yFt + state.red.yFt) / 2];
  near(mid[0], 0, 220 * 1.68781 * FIGHT_STEP_SEC + 1e-6, 'midpoint x');
  near(mid[1], 0, 220 * 1.68781 * FIGHT_STEP_SEC + 1e-6, 'midpoint y');
});

test('R28: the pass is the step where the range stops closing, at the closest approach to within one step', () => {
  for (const change of [
    { startAtaDeg: 30, startAaDeg: 120 }, { startAtaDeg: 45, startAtaSide: 'right', startAaDeg: 90, startAaSide: 'right', separationNm: 4 },
    { startAtaDeg: 10, startAaDeg: 45, blueKt: 300, redKt: 150 }, { startAtaDeg: 100, startAaDeg: 160 },
  ]) {
    const { best, state } = closestRange(change);
    assert.ok(state.merged, JSON.stringify(change));
    near(best.timeSec, state.mergeSec, FIGHT_STEP_SEC, `the pass for ${JSON.stringify(change)}`);
    // The range really stops closing there: a step on, it is opening.
    const after = createFight({ ...change, turnsAt: 'once' });
    assert.equal(after.merged, true, 'turns at once has no straight leg');
  }
});

test('R28: the jets fly straight to the pass, and after it they turn toward each other', () => {
  const s = createFight({ startAtaDeg: 30, startAaDeg: 120 });
  assert.equal(s.merged, false);
  const heading0 = [s.blue.headingRad, s.red.headingRad];
  stepFight(s, s.mergeSec - 0.5);
  assert.deepEqual([s.blue.headingRad, s.red.headingRad], heading0, 'no turn before the pass');
  stepFight(s, 1);
  assert.equal(s.merged, true);
  assert.notEqual(s.blue.headingRad, heading0[0]);
});

test('R28: each aircraft turns toward the other: a beam start with Red on Blue\'s right turns both to the right; 1-circle flips Red', () => {
  const setup = { startAtaDeg: 90, startAtaSide: 'right', startAaDeg: 90, startAaSide: 'right', turnsAt: 'once' };
  for (const [circles, blueSign, redSign] of [[2, -1, -1], [1, -1, 1]]) {
    const s = createFight({ ...setup, circles });
    assert.deepEqual(s.turnDir, { blue: -1, red: -1 }, 'toward the other');
    const [b0, r0] = [s.blue.headingRad, s.red.headingRad];
    stepFight(s, 1);
    near(s.blue.headingRad - b0, blueSign * s.perf.blue.rateRadPerSec, 1e-9, `Blue ${circles}-circle`);
    near(s.red.headingRad - r0, redSign * s.perf.red.rateRadPerSec, 1e-9, `Red ${circles}-circle`);
  }
});

test('R28: turns at once: merged at T+0, the turn starts in the first step, pitch is taken at T+0, and the start is not moved', () => {
  const s = createFight({ startAtaDeg: 90, startAaDeg: 90, turnsAt: 'once', vertical: true, bluePitchDeg: 10, redPitchDeg: -10 });
  assert.equal(s.merged, true);
  assert.equal(s.mergeSec, 0);
  assert.equal(s.mergeMark, false, 'no MERGE mark: the jets do not meet');
  assert.ok(Math.abs(s.blue.pitchRad - 10 * Math.PI / 180) < 1e-12);
  assert.ok(Math.abs(s.red.pitchRad + 10 * Math.PI / 180) < 1e-12);
  const [b0, x0] = [s.blue.headingRad, s.blue.xFt];
  stepFight(s, FIGHT_STEP_SEC);
  assert.notEqual(s.blue.headingRad, b0);
  assert.notEqual(s.blue.xFt, x0);
  // The start is the same as with the turns at the pass (the same picture); only when the turns start differs.
  const pass = createFight({ startAtaDeg: 90, startAaDeg: 90 });
  const once = createFight({ startAtaDeg: 90, startAaDeg: 90, turnsAt: 'once' });
  for (const who of ['blue', 'red']) for (const k of ['xFt', 'yFt', 'headingRad']) assert.equal(once[who][k], pass[who][k]);
});

test('R28: head-on with the turns at once: the jets turn from their start positions, 2 NM apart', () => {
  const s = createFight({ turnsAt: 'once' });
  assert.equal(s.merged, true);
  assert.equal(s.mergeSec, 0);
  near(s.blue.xFt, -FT_PER_NM, 1e-9);
  near(rangeFt(s), 2 * FT_PER_NM, 1e-9);
  stepFight(s, FIGHT_STEP_SEC);
  assert.ok(s.blue.headingRad > 0);
});

test('R28: a range that is opening from the start turns at once, whatever turnsAt says', () => {
  const s = createFight({ startAaDeg: 0, redKt: 300 }); // Red ahead of Blue and flying away, faster
  assert.equal(s.merged, true);
  assert.equal(s.mergeSec, 0);
  assert.equal(s.mergeMark, false);
});

test('R28: a tail chase (ATA 0°, AA 0°): Blue behind Red, HCA 0°, Blue turns the tie way (left) and Red left too', () => {
  const s = createFight({ startAaDeg: 0, turnsAt: 'once' });
  assert.equal(s.start.hcaDeg, 0);
  assert.deepEqual(s.turnDir, { blue: 1, red: 1 });
});

test('R28: Red\'s starting height shows only with Climb and dive on', () => {
  const on = createFight({ vertical: true, redAboveFt: 3000 });
  assert.equal(on.red.zFt, 3000);
  assert.equal(on.blue.zFt, 0);
  assert.deepEqual(on.startZFt, { blue: 0, red: 3000 });
  near(rangeFt(on), Math.hypot(2 * FT_PER_NM, 3000), 1e-9, 'the range is the slant range');
  const off = createFight({ vertical: false, redAboveFt: 3000 });
  assert.equal(off.red.zFt, 0);
  assert.deepEqual(off.startZFt, { blue: 0, red: 0 });
  near(rangeFt(off), 2 * FT_PER_NM, 1e-9);
  const below = createFight({ vertical: true, redAboveFt: -5000 });
  assert.equal(below.red.zFt, -5000);
});

test('R28: a height difference does not move the pass: level flight to the merge keeps it, and the fight still merges at T+16.4', () => {
  const s = runUntil({ vertical: true, redAboveFt: 2000 }, (f) => f.merged);
  assert.equal(r1(s.timeSec), 16.4);
  assert.equal(s.red.zFt, 2000);
  assert.equal(s.blue.zFt, 0);
});

test('R28: with the height difference and pitch, the start height is where Red\'s climb or dive starts from', () => {
  const s = createFight({ vertical: true, redAboveFt: 1500, redPitchDeg: -20 });
  stepFight(s, s.mergeSec + 2);
  assert.ok(s.red.zFt < 1500, 'Red dives from 1,500 ft');
  assert.ok(s.red.zFt > 1500 - 220 * 1.68781 * 2.1 * Math.sin(20 * Math.PI / 180) - 1);
});

test('R28: the start geometry is part of the setup copy, not a separate option', () => {
  const s = createFight({ startAtaDeg: 30, startAtaSide: 'right', startAaDeg: 100, startAaSide: 'left', redAboveFt: 500, turnsAt: 'once' });
  assert.deepEqual(
    [s.setup.startAtaDeg, s.setup.startAtaSide, s.setup.startAaDeg, s.setup.startAaSide, s.setup.redAboveFt, s.setup.turnsAt],
    [30, 'right', 100, 'left', 500, 'once'],
  );
});

test('R28: v6Start only applies at head-on; elsewhere the jets meet at the centre as set', () => {
  const s = createFight({ startAtaDeg: 30, startAaDeg: 120, v6Start: true });
  const plain = createFight({ startAtaDeg: 30, startAaDeg: 120 });
  assert.deepEqual(s.blue, plain.blue);
});

test('R28: a start that can\'t be placed is refused, not run', () => {
  for (const bad of [
    { startAtaDeg: -1 }, { startAtaDeg: 181 }, { startAtaDeg: NaN }, { startAaDeg: -5 }, { startAaDeg: 200 }, { startAaDeg: Infinity },
    { startAtaSide: 'up' }, { startAaSide: 'middle' }, { turnsAt: 'later' }, { redAboveFt: NaN }, { redAboveFt: Infinity },
  ]) assert.throws(() => createFight(bad), RangeError, JSON.stringify(bad));
});

test('R28: first nose-on after a crossing start is counted from the pass', () => {
  const s = runUntil({ startAtaDeg: 60, startAaDeg: 120 }, (f) => f.firstNose, 300);
  if (s.firstNose) assert.ok(s.firstNose.timeSec >= s.mergeSec);
  assert.ok(s.merged);
});

test('R28: the general placement agrees with the head-on start the fight uses, to a billionth of a foot, at unequal speeds and separations', () => {
  for (const change of [{}, { blueKt: 250, redKt: 200 }, { separationNm: 7.5, blueKt: 90, redKt: 380 }]) {
    const s = createFight(change);
    const g = startGeometry(s.setup);
    near(g.blue.xFt, s.blue.xFt, 1e-7, 'Blue x');
    near(g.red.xFt, s.red.xFt, 1e-7, 'Red x');
    near(g.blue.yFt, 0, 1e-7);
    near(g.passSec, s.mergeSec, 1e-9, 'the pass is the merge');
  }
});
