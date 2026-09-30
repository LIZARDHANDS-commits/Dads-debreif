// Zulu and local time (R10): Moose Jaw is UTC-6 all year; zones with clock
// changes follow them. Dates either side of the 2026 North American changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as time from '../../../src/core/time.js';

const BEFORE_SPRING = new Date('2026-03-08T08:30:00Z'); // 02:30 EST / 01:30 MST, before the change
const AFTER_SPRING = new Date('2026-03-08T10:30:00Z');
const BEFORE_FALL = new Date('2026-11-01T06:30:00Z');
const AFTER_FALL = new Date('2026-11-01T09:30:00Z');

test('Moose Jaw (America/Regina) is UTC-6 on every date', () => {
  for (const d of [BEFORE_SPRING, AFTER_SPRING, BEFORE_FALL, AFTER_FALL, new Date('2026-07-01T18:00:00Z'), new Date('2026-12-31T23:59:59Z')]) {
    assert.equal(time.utcOffsetMinutes(d, 'America/Regina'), -360, d.toISOString());
  }
  assert.equal(time.formatInZone(new Date('2026-07-01T18:00:00Z'), 'America/Regina'), '12:00:00');
  assert.equal(time.formatInZone(new Date('2026-01-15T18:00:00Z'), 'America/Regina'), '12:00:00');
  assert.equal(time.zoneAbbreviation(new Date('2026-07-01T18:00:00Z'), 'America/Regina'), 'CST');
});

test('a zone with clock changes follows them', () => {
  assert.equal(time.utcOffsetMinutes(BEFORE_SPRING, 'America/Denver'), -420);
  assert.equal(time.utcOffsetMinutes(AFTER_SPRING, 'America/Denver'), -360);
  assert.equal(time.utcOffsetMinutes(BEFORE_FALL, 'America/Denver'), -360);
  assert.equal(time.utcOffsetMinutes(AFTER_FALL, 'America/Denver'), -420);
  assert.equal(time.zoneAbbreviation(AFTER_SPRING, 'America/Denver'), 'MDT');
  assert.equal(time.utcOffsetMinutes(AFTER_SPRING, 'UTC'), 0);
});

test('offsets east of UTC and on the half hour work', () => {
  assert.equal(time.utcOffsetMinutes(new Date('2026-01-15T00:00:00Z'), 'Asia/Kolkata'), 330);
  assert.equal(time.utcOffsetMinutes(new Date('2026-01-15T00:00:00Z'), 'America/St_Johns'), -210);
});

test('Zulu formatting', () => {
  const d = new Date('2026-09-29T17:54:07.800Z');
  assert.equal(time.formatZulu(d), '17:54:07Z');
  assert.equal(time.formatZuluSeconds(d.getTime() / 1000), '17:54:07Z');
  assert.equal(time.formatDtgZulu(d), '291754Z SEP 26');
  assert.equal(time.formatZuluSeconds(NaN), '--');
});

test('a TAF day just after month end resolves into the next month', () => {
  const ref = new Date('2026-09-30T22:00:00Z');
  assert.equal(time.resolveDayOfMonthUtc(1, 6, 0, ref).toISOString(), '2026-10-01T06:00:00.000Z');
  assert.equal(time.resolveDayOfMonthUtc(30, 18, 0, ref).toISOString(), '2026-09-30T18:00:00.000Z');
});
