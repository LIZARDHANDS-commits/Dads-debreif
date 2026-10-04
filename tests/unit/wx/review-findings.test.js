// Checks: regression cases from a code review: unknown cloud base is unknown, a TAF with no cloud group is incomplete, "11/2SM" is 1 1/2, cancelled TAF, FM out of order.
// Serves: SOF-R9, SOF-R6.
// Expected values: hand-written reports; the expected status follows the "unknown is never good" rule (docs/modules/sof/testing.md, S2).

// Regression tests for the code-review-and-quality pass on PR #53. Each case is a
// report that made a below-limits or unreadable forecast come out as 'meets', or threw.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetar } from '../../../src/wx/metar.js';
import { parseTaf, tafTimeline, forecastAt } from '../../../src/wx/taf.js';
import { checkConditions, DEFAULT_LIMITS, natoColour, flightCategory } from '../../../src/wx/limits.js';
import { homeAlternateTrigger, assessAlternate } from '../../../src/wx/alternates.js';
import { resolveDay } from '../../../src/wx/dates.js';
import { at } from './reports.js';

const NOW = new Date('2026-09-29T15:30:00Z');
const taf = (raw, now = NOW) => parseTaf(raw, { now });
const metar = (raw) => parseMetar(raw, { now: NOW });
const home = (raw, from, to) => homeAlternateTrigger(taf(raw), { from, to });
const iso = (d) => d?.toISOString().slice(0, 16);

test('an unknown cloud base is an unknown ceiling, never "no ceiling"', () => {
  const c = checkConditions(metar('METAR CYMJ 291500Z 27010KT 5SM BKN/// 10/08 A2995').conditions, DEFAULT_LIMITS.home);
  assert.equal(c.ceilingUnknown, true);
  assert.equal(home('TAF CYMJ 291120Z 2912/3012 27010KT 6SM BKN///', at(29, 17), at(29, 20)).status, 'incomplete');
});

test('a forecast with no cloud group at all has an unknown ceiling', () => {
  assert.equal(home('TAF CYMJ 291120Z 2912/3012 27010KT P6SM', at(29, 17), at(29, 20)).status, 'incomplete');
  // SKC, NSC, CAVOK are explicit: no ceiling.
  assert.equal(home('TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC', at(29, 17), at(29, 20)).status, 'meets');
  assert.equal(home('TAF CYMJ 291120Z 2912/3012 27010KT CAVOK', at(29, 17), at(29, 20)).status, 'meets');
});

test('NATO colour and flight category are UNK when an unknown base could make them worse', () => {
  const vv = metar('METAR CYMJ 291500Z 00000KT 1/2SM FG VV/// 08/08 A3001').conditions;
  assert.equal(natoColour(vv), 'UNK');
  assert.equal(flightCategory(metar('METAR CYMJ 291500Z 27010KT 5SM BKN/// 10/08 A2995').conditions), 'UNK');
  // Already the worst class from visibility alone: the unknown base can't change it.
  assert.equal(natoColour(metar('METAR CYMJ 291500Z 00000KT M1/4SM FG VV/// 08/08 A3001').conditions), 'RED');
  assert.equal(flightCategory(vv), 'LIFR');
});

test('a group dated just before the valid period stays in its own month', () => {
  const t = taf('TAF AMD CYMJ 291150Z 2912/3012 27010KT P6SM SKC FM291150 1SM BR OVC003');
  assert.equal(iso(t.groups[1].from), '2026-09-29T11:50');
  assert.equal(home('TAF AMD CYMJ 291150Z 2912/3012 27010KT P6SM SKC FM291150 1SM BR OVC003', at(29, 13), at(29, 14)).status, 'below');
  const tempo = taf('TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC TEMPO 2910/2914 1/2SM FG');
  assert.equal(iso(tempo.groups[1].from), '2026-09-29T10:00');
  assert.equal(homeAlternateTrigger(tempo, { from: at(29, 12, 30), to: at(29, 13) }).status, 'below');
});

test('FM groups out of order are put in time order and flagged', () => {
  const raw = 'TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC FM292000 1SM BR OVC003 FM291800 P6SM SKC';
  const tl = tafTimeline(taf(raw));
  assert.deepEqual(tl.prevailing.map((p) => [iso(p.from), iso(p.to)]), [
    ['2026-09-29T12:00', '2026-09-29T18:00'],
    ['2026-09-29T18:00', '2026-09-29T20:00'],
    ['2026-09-29T20:00', '2026-09-30T12:00'],
  ]);
  assert.ok(taf(raw).problems.length > 0);
  assert.equal(home(raw, at(29, 20, 30), at(29, 21, 30)).status, 'below');
});

test('a change group without a period is not merged into the group before it', () => {
  for (const raw of [
    'TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC TEMPO 1/2SM FG',
    'TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC PROB30 1/2SM FG',
    'TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC FM1800 1/2SM FG',
  ]) {
    const t = taf(raw);
    assert.deepEqual(t.groups[0].conditions.weather, [], raw);
    assert.ok(t.problems.length > 0, raw);
    assert.equal(home(raw, at(29, 17), at(29, 20)).status, 'incomplete', raw);
  }
});

test('11/2SM with the space dropped is 1 1/2 SM, not 5.5 SM', () => {
  const t = taf('TAF CYMJ 291120Z 2912/3012 27010KT 11/2SM BR OVC030');
  assert.equal(t.groups[0].conditions.visibility.sm, 1.5);
  assert.equal(home('TAF CYMJ 291120Z 2912/3012 27010KT 11/2SM BR OVC030', at(29, 17), at(29, 20)).status, 'below');
  assert.equal(metar('METAR CYMJ 291500Z 27010KT 13/4SM BR OVC030 10/08 A2995').conditions.visibility.sm, 1.75);
  assert.equal(metar('METAR CYMJ 291500Z 27010KT 3/16SM FG OVC001 10/08 A2995').conditions.visibility.sm, 0.1875);
});

test('an FM inside a BECMG change period ends the old conditions at the FM', () => {
  const raw = 'TAF CYMJ 291120Z 2912/3012 27010KT P6SM OVC010 BECMG 2918/2922 BKN030 FM292000 27010KT P6SM SKC';
  const f = forecastAt(taf(raw), { from: at(29, 20, 30), to: at(29, 21, 30) });
  assert.equal(f.prevailing.length, 1);
  assert.deepEqual(f.overlays, []);
  assert.equal(home(raw, at(29, 20, 30), at(29, 21, 30)).status, 'meets');
});

test('missing or bad times and limits never throw', () => {
  const t = taf('TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC');
  assert.equal(assessAlternate(t, undefined).status, 'no-time');
  assert.equal(assessAlternate(t, 'not a date').status, 'no-time');
  assert.equal(homeAlternateTrigger(t, null).status, 'no-time');
  assert.equal(homeAlternateTrigger(t, { from: at(29, 17) }).status, 'no-time');
  assert.equal(homeAlternateTrigger(t, { from: at(29, 17), to: at(29, 20) }, null).status, 'meets');
  assert.equal(assessAlternate(t, '2026-09-29T18:00:00Z').status, 'meets');
  assert.doesNotThrow(() => forecastAt(t, undefined));
});

test('a cancelled or NIL TAF counts as no TAF', () => {
  const cnl = taf('TAF AMD CYMJ 291120Z 2912/3012 CNL');
  assert.equal(homeAlternateTrigger(cnl, { from: at(29, 17), to: at(29, 20) }).status, 'no-taf');
  assert.equal(assessAlternate(cnl, at(29, 18)).status, 'no-taf');
});

test('observation and issue times are never in the future, and bad values give null', () => {
  // There was no 31 September, and 31 October hasn't happened: the time can't be placed.
  const m = parseMetar('METAR CYMJ 312350Z 27010KT 15SM SKC 10/02 A3001', { now: new Date('2026-10-01T00:05:00Z') });
  assert.equal(m.time, null);
  const late = parseMetar('METAR CYMJ 291700Z 27010KT 15SM SKC 10/02 A3001', { now: NOW });
  assert.equal(iso(late.time), '2026-08-29T17:00');
  assert.equal(resolveDay(12, 25, 0, NOW), null);
  assert.equal(resolveDay(12, 10, 99, NOW), null);
  assert.equal(resolveDay(0, 10, 0, NOW), null);
  assert.equal(resolveDay(12, 10, 0, null), null);
  assert.equal(parseMetar('METAR CYMJ 291500Z 27010KT 15SM SKC', { now: null }).time.getUTCFullYear() > 2000, true);
});

test('an implausible valid period is flagged', () => {
  const t = parseTaf('TAF CYMJ 302320Z 3100/0124 27010KT P6SM SKC', { now: new Date('2026-10-01T00:00:00Z') });
  assert.ok(t.problems.length > 0);
});

test('a METAR trend is kept apart from the observation', () => {
  const m = metar('METAR EGLL 291450Z 24012KT 9999 FEW030 12/10 Q1013 TEMPO 3000 SHRA BKN010');
  assert.equal(m.ceilingFt, null);
  assert.deepEqual(m.conditions.weather, []);
  assert.equal(m.trend, 'TEMPO 3000 SHRA BKN010');
  assert.deepEqual(metar('METAR EGLL 291450Z 24012KT 9999 FEW030 12/10 Q1013 NOSIG').unread, []);
});
