// The one playback clock for every view (#24, R12, SPEC-flight-data "The playback clock").
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClock, SPEEDS, MAX_FRAME_S } from '../../../src/flight-data/clock.js';

test('speeds are V6\'s, 0.25× to 16×, and 1× to start', () => {
  assert.deepEqual(SPEEDS, [0.25, 0.5, 1, 2, 4, 8, 16]);
  const clock = createClock({ startT: 100, endT: 200 });
  assert.deepEqual([clock.t, clock.speed, clock.playing], [100, 1, false]);
  assert.throws(() => clock.setSpeed(3), RangeError);
  assert.throws(() => createClock({ startT: 5, endT: 5 }), RangeError);
});

test('playing moves time by real time × speed, from the frame after play', () => {
  const clock = createClock({ startT: 100, endT: 200 });
  clock.tick(0); // paused: nothing moves
  assert.equal(clock.t, 100);
  clock.play();
  clock.tick(1000); // the first frame after play only starts the count
  assert.equal(clock.t, 100);
  clock.tick(1100);
  assert.equal(clock.t, 100.1);
  clock.setSpeed(4);
  clock.tick(1200);
  assert.ok(Math.abs(clock.t - 100.5) < 1e-9);
  clock.pause();
  clock.tick(5000);
  clock.play();
  clock.tick(6000);
  clock.tick(6100); // no jump for the time spent paused
  assert.ok(Math.abs(clock.t - 100.9) < 1e-9);
});

test('a long frame (hidden tab, slow frame) moves the clock by at most 0.25 s × speed', () => {
  assert.equal(MAX_FRAME_S, 0.25);
  const clock = createClock({ startT: 0, endT: 100 });
  clock.play();
  clock.tick(0);
  clock.tick(60_000);
  assert.equal(clock.t, 0.25);
  clock.setSpeed(16);
  clock.tick(120_000);
  assert.equal(clock.t, 4.25);
  clock.tick(119_000); // time going backwards moves nothing
  assert.equal(clock.t, 4.25);
});

test('playback stops at the end, and play at the end starts again from the beginning', () => {
  const clock = createClock({ startT: 0, endT: 1 });
  clock.play();
  clock.tick(0);
  for (let ms = 200; ms <= 1400; ms += 200) clock.tick(ms);
  assert.deepEqual([clock.t, clock.playing], [1, false]);
  clock.play();
  assert.deepEqual([clock.t, clock.playing], [0, true]);
});

test('seek lands on whole seconds inside the window; step moves to the next or previous second', () => {
  const clock = createClock({ startT: 99.4, endT: 110.2 });
  clock.seek(104.6);
  assert.equal(clock.t, 105);
  clock.seek(50);
  assert.equal(clock.t, 99.4);
  clock.seek(500);
  assert.equal(clock.t, 110.2);
  clock.seek(105.3);
  clock.step(1);
  assert.equal(clock.t, 106);
  clock.seek(105);
  clock.step(-1);
  assert.equal(clock.t, 104);
  clock.seek(104);
  clock.tick(0);
  clock.play();
  clock.tick(0);
  clock.tick(250);
  clock.step(1); // from 104.25
  assert.equal(clock.t, 105);
  clock.step(-1);
  clock.step(-1);
  assert.equal(clock.t, 103);
  assert.throws(() => clock.seek(NaN), RangeError);
});

test('reset pauses at the start; views hear every change once', () => {
  const clock = createClock({ startT: 0, endT: 10 });
  const heard = [];
  const stop = clock.onChange(c => heard.push(c.t));
  clock.seek(5);
  clock.play();
  clock.tick(0);
  clock.tick(100);
  clock.reset();
  assert.deepEqual([clock.t, clock.playing], [0, false]);
  stop();
  clock.seek(7);
  assert.deepEqual(heard, [5, 5, 5.1, 0]);
});

test('a frame with no usable time is ignored (review)', () => {
  const clock = createClock({ startT: 0, endT: 10 });
  clock.play();
  clock.tick(0);
  clock.tick(NaN);
  clock.tick(undefined);
  clock.tick(100);
  assert.equal(clock.t, 0.1);
});

test('step from between seconds goes to the next or previous whole second', () => {
  const clock = createClock({ startT: 0, endT: 100 });
  clock.seek(10);
  clock.play();
  clock.tick(0);
  clock.tick(250);
  clock.tick(500); // 10.5
  clock.pause();
  clock.step(1);
  assert.equal(clock.t, 11);
  clock.seek(10);
  clock.play();
  clock.tick(1000);
  clock.tick(1250);
  clock.tick(1500); // 10.5
  clock.step(-1);
  assert.equal(clock.t, 10);
});

test('the last frame never runs past the end', () => {
  const clock = createClock({ startT: 0, endT: 1 });
  clock.seek(1);
  clock.seek(0.9); // rounds to 1: use playback instead
  clock.reset();
  clock.setSpeed(4);
  clock.play();
  clock.tick(0);
  clock.tick(200); // 0.8
  clock.tick(400); // would be 1.6
  assert.deepEqual([clock.t, clock.playing], [1, false]);
});
