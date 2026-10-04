// Checks: the header clock shows Zulu and Moose Jaw local in the chosen order, rolls the date, ticks each second, pauses when hidden and leaves nothing running.
// Serves: ALL-R15, ALL-R12.
// Expected values: time-zone arithmetic worked out in the test (18:00Z is noon in Regina, UTC-6; Edmonton on MDT) on a fake clock.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createTime, startClock, HOME_ZONE } from '../../../src/shell/header.js';

// Shared settings, just enough of them: get, subscribe and a way to change.
function fakeSettings(timePrimary = 'zulu') {
  let values = { timePrimary };
  const listeners = new Set();
  return {
    get: () => values,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    set(v) {
      values = { ...values, timePrimary: v };
      for (const fn of listeners) fn(values);
    },
    listeners,
  };
}

// A scheduler scope whose one-shot timers run when the test says so.
function fakeTimers() {
  const pending = [];
  return {
    pending,
    after(ms, cb) {
      const entry = { ms, cb, cancelled: false };
      pending.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    fire() {
      const entry = pending.shift();
      if (!entry.cancelled) entry.cb();
    },
    live: () => pending.filter((e) => !e.cancelled).length,
  };
}

function fakeDoc(state = 'visible') {
  const doc = new EventTarget();
  doc.visibilityState = state;
  doc.become = (s) => {
    doc.visibilityState = s;
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  return doc;
}

const NOON_Z = new Date('2026-09-30T18:00:00.250Z');

test('home zone is Moose Jaw', () => {
  assert.equal(HOME_ZONE, 'America/Regina');
});

test('Zulu first by default, local time with its zone beside it', () => {
  const time = createTime({ settings: fakeSettings(), now: () => NOON_Z });
  assert.equal(time.zulu(), '18:00:00Z');
  assert.equal(time.local(), '12:00:00 CST');
  assert.deepEqual(time.ordered(), ['18:00:00Z', '12:00:00 CST']);
  assert.equal(time.offsetMinutes(), -360);
});

test('local first when Settings says so', () => {
  const time = createTime({ settings: fakeSettings('local'), now: () => NOON_Z });
  assert.deepEqual(time.ordered(), ['12:00:00 CST', '18:00:00Z']);
});

test('Zulu date rollover: local is still the day before', () => {
  const time = createTime({ settings: fakeSettings(), now: () => new Date('2026-10-01T02:30:05Z') });
  assert.deepEqual(time.ordered(), ['02:30:05Z', '20:30:05 CST']);
});

function setup({ state = 'visible', primary = 'zulu' } = {}) {
  let clock = NOON_Z.getTime();
  const settings = fakeSettings(primary);
  const time = createTime({ settings, now: () => new Date(clock) });
  const timers = fakeTimers();
  const doc = fakeDoc(state);
  const drawn = [];
  const stop = startClock({ time, settings, timers, doc, render: (a, b) => drawn.push(`${a} | ${b}`) });
  return { settings, timers, doc, drawn, stop, advance: (ms) => (clock += ms) };
}

test('draws at once, then on each whole second', () => {
  const { timers, drawn, advance } = setup();
  assert.deepEqual(drawn, ['18:00:00Z | 12:00:00 CST']);
  assert.equal(timers.pending[0].ms, 750, 'waits for the next whole second');
  advance(750);
  timers.fire();
  assert.deepEqual(drawn.at(-1), '18:00:01Z | 12:00:01 CST');
  assert.equal(timers.pending[0].ms, 1000);
  assert.equal(timers.live(), 1, 'one timer at a time');
});

test('stops while the tab is hidden and catches up when it shows again', () => {
  const { timers, doc, drawn, advance } = setup();
  doc.become('hidden');
  assert.equal(timers.live(), 0);
  advance(60_000);
  doc.become('visible');
  assert.equal(drawn.at(-1), '18:01:00Z | 12:01:00 CST');
  assert.equal(timers.live(), 1);
});

test('a tab opened in the background waits until it is shown', () => {
  const { timers, doc, drawn } = setup({ state: 'hidden' });
  assert.deepEqual(drawn, []);
  assert.equal(timers.live(), 0);
  doc.become('visible');
  assert.equal(drawn.length, 1);
  assert.equal(timers.live(), 1);
});

test('changing the time order redraws straight away', () => {
  const { settings, drawn } = setup();
  settings.set('local');
  assert.equal(drawn.at(-1), '12:00:00 CST | 18:00:00Z');
});

test('stop() leaves nothing running or listening', () => {
  const { timers, doc, settings, drawn, stop } = setup();
  stop();
  assert.equal(timers.live(), 0);
  assert.equal(settings.listeners.size, 0);
  const before = drawn.length;
  doc.become('hidden');
  doc.become('visible');
  assert.equal(drawn.length, before);
});

test('the zone can follow the home airfield: read live on every call', () => {
  let zone = 'America/Regina';
  const time = createTime({ settings: fakeSettings(), zone: () => zone, now: () => NOON_Z });
  assert.equal(time.zone, 'America/Regina');
  assert.equal(time.local(), '12:00:00 CST');
  zone = 'America/Edmonton';
  assert.equal(time.zone, 'America/Edmonton');
  assert.equal(time.local(), '12:00:00 MDT');
  assert.equal(time.offsetMinutes(), -360);
});

test('the clock redraws at once when another watched source changes (the home airfield)', () => {
  const settings = fakeSettings();
  const airfields = fakeSettings();
  const timers = fakeTimers();
  const draws = [];
  const time = createTime({ settings, now: () => NOON_Z });
  const stop = startClock({ time, settings, timers, watch: [airfields], render: (a, b) => draws.push([a, b]), doc: fakeDoc() });
  assert.equal(draws.length, 1);
  airfields.set('local');
  assert.equal(draws.length, 2);
  stop();
  assert.equal(airfields.listeners.size, 0, 'stop() unsubscribes from every watched source');
});
