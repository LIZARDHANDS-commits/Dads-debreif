// The Turn Fight's fight (SPEC-turn-fight, Testing strategy 3): what the numbers mean.
// tests/golden/turn-fight-sim.test.js pins the same code to V6 step by step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FT_PER_NM } from '../../../src/core/units.js';
import { wrapPi } from '../../../src/core/angles.js';
import {
  FIGHT_STEP_SEC, FIGHT_MAX_SEC, FIRST_NOSE_DEG, V6_DEFAULT_SETUP,
  levelTurn, mergeTimeSec, offNoseDeg, rangeFt, sinceMergeSec, createFight, stepFight,
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
  assert.deepEqual(createFight().setup, { ...V6_DEFAULT_SETUP });
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

test('at different speeds the jets still end up together at the merge (V6 moves them to the centre)', () => {
  const s = runUntil({ blueKt: 250, redKt: 200 }, (f) => f.merged);
  assert.equal(r1(s.timeSec), 16);
  near(Math.hypot(s.blue.xFt, s.blue.yFt), 250 * 1.68781 * (s.timeSec - s.mergeSec), 1e-6);
  near(Math.hypot(s.red.xFt, s.red.yFt), 200 * 1.68781 * (s.timeSec - s.mergeSec), 1e-6);
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

test('first nose-on at V6\'s defaults: +18.2 s in a 2-circle fight, +9.1 s in a 1-circle fight (a tie, either aircraft may be named)', () => {
  assert.equal(r1(sinceMerge(runUntil({ circles: 2 }, (s) => s.firstNose))), 18.2);
  assert.equal(r1(sinceMerge(runUntil({ circles: 1 }, (s) => s.firstNose))), 9.1);
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
