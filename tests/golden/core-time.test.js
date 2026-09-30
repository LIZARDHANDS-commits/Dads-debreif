// Golden test (R9, R10): src/core/time.js formats and parses times as V6 does.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as time from '../../src/core/time.js';
import { loadV6, v6FunctionText } from './v6-source.js';
import { spread } from './inputs.js';

// V6's SOF clock functions always read the current time; this stand-in Date
// lets the test choose "now".
const FIXED_NOW = `
  let __now=0;
  const Date=class extends globalThis.Date{constructor(...a){a.length?super(...a):super(__now)}};
  function setNow(ms){__now=ms}`;

const debrief = loadV6(['fmtTime'], { marker: 'function updateKmlStatus(' });
const sofClock = loadV6(['timeAt', 'zoneAt', 'dtgZulu'], { page: 'sof', prelude: FIXED_NOW, expose: ['setNow'] });
const sofTaf = loadV6(['utcFor'], { page: 'sof' });

// Around Dad's example flights, both clock changes, month and year ends, and leap day.
const MOMENTS = [
  Date.UTC(2026, 0, 1, 0, 0, 0), Date.UTC(2025, 11, 31, 23, 59, 59), Date.UTC(2028, 1, 29, 12, 0, 0),
  Date.UTC(2026, 2, 8, 8, 59, 59), Date.UTC(2026, 2, 8, 9, 0, 0), Date.UTC(2026, 10, 1, 7, 59, 59), Date.UTC(2026, 10, 1, 8, 0, 0),
  ...spread(300, Date.UTC(2020, 0, 1), Date.UTC(2032, 0, 1), 31).map(Math.floor),
];

test('formatZuluSeconds is the debrief fmtTime', () => {
  for (const ms of MOMENTS) {
    for (const sec of [ms / 1000, ms / 1000 + 0.4, ms / 1000 + 0.999]) assert.equal(time.formatZuluSeconds(sec), debrief.fmtTime(sec));
  }
  for (const bad of [NaN, Infinity, undefined, null, '12']) assert.equal(time.formatZuluSeconds(bad), debrief.fmtTime(bad));
});

test('formatZulu is the SOF clock\'s Zulu part', () => {
  for (const ms of MOMENTS) assert.equal(time.formatZulu(new Date(ms)), new Date(ms).toISOString().slice(11, 19) + 'Z');
  assert.ok(v6FunctionText('clock', { marker: 'function stations(' }).includes("d.toISOString().slice(11,19)+'Z'"));
});

test('formatDtgZulu is the SOF dtgZulu', () => {
  for (const ms of MOMENTS) {
    sofClock.setNow(ms);
    assert.equal(time.formatDtgZulu(new Date(ms)), sofClock.dtgZulu());
  }
});

test('formatInZone and zoneAbbreviation are the SOF timeAt and zoneAt', () => {
  const zones = ['America/Regina', 'America/Los_Angeles', 'America/Denver', 'America/Edmonton', 'America/Toronto', 'UTC'];
  for (const ms of MOMENTS) {
    sofClock.setNow(ms);
    for (const tz of zones) {
      assert.equal(time.formatInZone(new Date(ms), tz), sofClock.timeAt(tz), `${tz} ${new Date(ms).toISOString()}`);
      assert.equal(time.zoneAbbreviation(new Date(ms), tz), sofClock.zoneAt(tz));
    }
  }
});

test('parseIsoSeconds is how the debrief reads a KML <when>', () => {
  assert.ok(v6FunctionText('parseKmlText').includes('Date.parse(n.textContent.trim())/1000'));
  const whens = ['2025-06-12T15:04:05Z', ' 2025-06-12T15:04:05.250Z\n', '2025-06-12T15:04:05-06:00', '2025-06-12T15:04:05+00:00', 'garbage', ''];
  for (const w of whens) assert.ok(Object.is(time.parseIsoSeconds(w), Date.parse(w.trim()) / 1000), w);
});

test('resolveDayOfMonthUtc is the SOF utcFor, including month and year ends', () => {
  const refs = [Date.UTC(2026, 0, 1, 3), Date.UTC(2026, 0, 31, 22), Date.UTC(2026, 1, 28, 23), Date.UTC(2026, 11, 31, 20), ...MOMENTS.slice(7, 60)];
  for (const r of refs) {
    const ref = new Date(r);
    for (const day of [1, 2, 15, 28, 29, 30, 31]) {
      for (const [h, m] of [[0, 0], [6, 30], [23, 59], [24, 0]]) {
        assert.equal(+time.resolveDayOfMonthUtc(day, h, m, ref), +sofTaf.utcFor(day, h, m, ref), `${day} ${h}:${m} ref ${ref.toISOString()}`);
      }
    }
  }
});
