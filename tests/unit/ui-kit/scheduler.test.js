// Checks: scopes share one frame loop that stops when idle, the first frame after a pause shows no jump, every and after can be cancelled, dispose cancels everything.
// Serves: ALL-R12.
// Expected values: design choice: behaviour of the scheduler's contract on a fake clock driven by the test.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createScheduler } from '../../../src/ui-kit/scheduler.js';

// Fake animation frames and timers, driven by the test.
function fakeClock() {
  let nextId = 1;
  const frames = new Map();
  const timers = new Map();
  let now = 0;
  return {
    frames,
    timers,
    raf: (cb) => { const id = nextId++; frames.set(id, cb); return id; },
    caf: (id) => { frames.delete(id); },
    setTimeout: (cb, ms) => { const id = nextId++; timers.set(id, { cb, at: now + ms }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    now: () => now,
    frame(ms = 16) {
      now += ms;
      const due = [...frames.entries()];
      frames.clear();
      for (const [, cb] of due) cb(now);
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].cb();
      }
      now = end;
    },
  };
}

test('all scopes share one animation-frame loop, and it stops when nothing needs it', () => {
  const clock = fakeClock();
  const s = createScheduler(clock);
  const a = s.scope('a');
  const b = s.scope('b');
  const seen = [];
  const stopA = a.frame((dt) => seen.push(['a', dt]));
  b.frame((dt) => seen.push(['b', dt]));
  assert.equal(clock.frames.size, 1, 'one requestAnimationFrame for everyone');
  clock.frame(16);
  clock.frame(16);
  assert.deepEqual(seen, [['a', 0], ['b', 0], ['a', 16], ['b', 16]]);
  stopA();
  b.dispose();
  clock.frame(16);
  assert.equal(clock.frames.size, 0, 'loop stopped');
  assert.deepEqual(s.stats(), { frames: 0, timers: 0 });
});

test('the first frame after a pause reports no jump in time', () => {
  const clock = fakeClock();
  const s = createScheduler(clock);
  const scope = s.scope('m');
  const dts = [];
  let stop = scope.frame((dt) => dts.push(dt));
  clock.frame(16);
  stop();
  clock.frame(16);
  clock.advance(5000);
  stop = scope.frame((dt) => dts.push(dt));
  clock.frame(16);
  clock.frame(16);
  assert.deepEqual(dts, [0, 0, 16]);
});

test('every repeats and after runs once, both cancellable', () => {
  const clock = fakeClock();
  const s = createScheduler(clock);
  const scope = s.scope('m');
  let ticks = 0;
  let once = 0;
  const stop = scope.every(1000, () => { ticks += 1; });
  scope.after(500, () => { once += 1; });
  clock.advance(3500);
  assert.equal(ticks, 3);
  assert.equal(once, 1);
  stop();
  clock.advance(5000);
  assert.equal(ticks, 3);
  assert.deepEqual(s.stats(), { frames: 0, timers: 0 });
});

test('dispose cancels everything a scope started, and later requests do nothing', () => {
  const clock = fakeClock();
  const s = createScheduler(clock);
  const scope = s.scope('turn-sim');
  const calls = [];
  scope.frame(() => calls.push('frame'));
  scope.every(100, () => calls.push('every'));
  scope.after(100, () => calls.push('after'));
  assert.deepEqual(s.stats(), { frames: 1, timers: 2 });
  scope.dispose();
  assert.deepEqual(s.stats(), { frames: 0, timers: 0 });
  clock.frame();
  clock.advance(1000);
  scope.frame(() => calls.push('late'));
  scope.every(10, () => calls.push('late'));
  clock.frame();
  clock.advance(100);
  assert.deepEqual(calls, []);
  assert.deepEqual(s.stats(), { frames: 0, timers: 0 });
});

test('a callback that throws is reported once and removed; the others keep running', () => {
  const clock = fakeClock();
  const errors = [];
  const s = createScheduler({ ...clock, onError: (msg, err) => errors.push(err.message) });
  const scope = s.scope('m');
  let good = 0;
  scope.frame(() => { throw new Error('bad frame'); });
  scope.frame(() => { good += 1; });
  scope.every(10, () => { throw new Error('bad timer'); });
  clock.frame();
  clock.frame();
  clock.advance(50);
  assert.equal(good, 2);
  assert.deepEqual(errors, ['bad frame', 'bad timer']);
  assert.deepEqual(s.stats(), { frames: 1, timers: 0 });
});

test('a frame callback may cancel itself or add another during a frame', () => {
  const clock = fakeClock();
  const s = createScheduler(clock);
  const scope = s.scope('m');
  const seen = [];
  const stop = scope.frame(() => { seen.push('once'); stop(); scope.frame(() => seen.push('added')); });
  clock.frame();
  clock.frame();
  assert.deepEqual(seen, ['once', 'added']);
});
