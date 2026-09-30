import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTaf, tafTimeline, forecastAt } from '../../../src/wx/taf.js';
import { ceilingFt } from '../../../src/wx/conditions.js';
import { TAF, NOW, at } from './reports.js';

const parse = (raw, now = NOW) => parseTaf(raw, { now });
const iso = (d) => d?.toISOString().slice(0, 16);
const span = (p) => `${iso(p.from)}/${iso(p.to)}`;

test('header, valid period, groups and remarks', () => {
  const t = parse(TAF.tempoHalfMile);
  assert.equal(t.station, 'CYMJ');
  assert.equal(iso(t.issued), '2026-09-29T11:20');
  assert.equal(iso(t.validFrom), '2026-09-29T12:00');
  assert.equal(iso(t.validTo), '2026-09-30T12:00');
  assert.deepEqual(t.groups.map((g) => g.kind), ['BASE', 'TEMPO']);
  assert.equal(t.remarks, 'NXT FCST BY 18Z');
  assert.deepEqual(t.unread, []);
});

test('issue #1: TEMPO 2916/2920 1/2SM FG is 1/2 SM from 16Z to 20Z, not 2920 SM', () => {
  const tempo = parse(TAF.tempoHalfMile).groups[1];
  assert.equal(span(tempo), '2026-09-29T16:00/2026-09-29T20:00');
  assert.equal(tempo.conditions.visibility.sm, 0.5);
  assert.deepEqual(tempo.conditions.weather.map((w) => w.raw), ['FG']);
});

test('issue #2: BECMG conditions prevail after the change period, until the next FM', () => {
  const tl = tafTimeline(parse(TAF.becmgIfr));
  assert.deepEqual(tl.prevailing.map(span), [
    '2026-09-29T12:00/2026-09-29T15:00',
    '2026-09-29T15:00/2026-09-30T06:00',
    '2026-09-30T06:00/2026-09-30T12:00',
  ]);
  const becmg = tl.prevailing[1].conditions;
  assert.equal(becmg.visibility.sm, 1);
  assert.equal(ceilingFt(becmg), 300);
  // During the change period the old conditions still prevail; the new ones are an overlay.
  assert.equal(tl.prevailing[0].conditions.visibility.qualifier, 'more');
  assert.deepEqual(tl.overlays.map((o) => [o.kind, span(o)]), [['BECMG', '2026-09-29T13:00/2026-09-29T15:00']]);
});

test('issue #2 (sof-c#7): a leading TEMPO does not stretch the base forecast past the first FM', () => {
  const tl = tafTimeline(parse(TAF.leadingTempo));
  assert.deepEqual(tl.prevailing.map(span), ['2026-09-29T12:00/2026-09-29T15:00', '2026-09-29T15:00/2026-09-30T12:00']);
  assert.equal(ceilingFt(tl.prevailing[1].conditions), null);
});

test('issue #3: BKN015CB in an FM group is a 1500 ft ceiling', () => {
  const fm = parse(TAF.cbCeiling).groups[1];
  assert.equal(ceilingFt(fm.conditions), 1500);
  assert.equal(fm.conditions.sky[0].type, 'CB');
});

test('an FM group is a complete forecast; a change group changes only what it states', () => {
  const tl = tafTimeline(parse(TAF.overnightFog));
  const night = forecastAt(parse(TAF.overnightFog), at(30, 7)).prevailing[0].conditions;
  assert.equal(night.visibility.qualifier, 'less');
  assert.equal(night.visibility.sm, 0.25);
  assert.equal(tl.prevailing.length, 2);
});

test('sof-c#16: TEMPO SKC clears the inherited cloud but keeps wind and visibility', () => {
  const [o] = tafTimeline(parse(TAF.tempoClears)).overlays;
  assert.equal(o.kind, 'TEMPO');
  assert.deepEqual(o.conditions.sky, []);
  assert.equal(o.conditions.skyClear, true);
  assert.equal(o.conditions.wind.speedKt, 10);
  assert.equal(o.conditions.visibility.qualifier, 'more');
});

test('sof-c#14: PROB30 TEMPO keeps its probability; PROB40 alone is not TEMPO', () => {
  const g = parse(TAF.prob).groups;
  assert.deepEqual(g.map((x) => [x.kind, x.probability, x.tempo]), [
    ['BASE', null, false], ['PROB', 30, true], ['PROB', 40, false],
  ]);
  assert.equal(span(g[1]), '2026-09-29T18:00/2026-09-29T22:00');
  assert.equal(span(g[2]), '2026-09-30T02:00/2026-09-30T06:00');
});

test('TEMPO overlays are split where the prevailing forecast under them changes', () => {
  const t = parse('TAF CYMJ 291120Z 2912/3012 27010KT P6SM BKN030 FM291800 18015KT P6SM OVC050 TEMPO 2916/2920 3SM -SHRA');
  const tl = tafTimeline(t);
  assert.deepEqual(tl.overlays.map((o) => [span(o), ceilingFt(o.conditions), o.conditions.wind.dirDeg]), [
    ['2026-09-29T16:00/2026-09-29T18:00', 3000, 270],
    ['2026-09-29T18:00/2026-09-29T20:00', 5000, 180],
  ]);
});

test('amended TAF', () => {
  const t = parse(TAF.amended, new Date('2026-09-29T13:30:00Z'));
  assert.equal(t.amendment, 'AMD');
  assert.equal(t.station, 'CYQR');
  assert.equal(iso(t.validFrom), '2026-09-29T13:00');
});

test('hour 24 and a valid period across a month end', () => {
  const t = parseTaf('TAF CYMJ 301140Z 3012/0112 27010KT P6SM SKC TEMPO 3020/3024 3SM -SHRA FM010600 30010KT P6SM FEW050', {
    now: new Date('2026-09-30T11:45:00Z'),
  });
  assert.equal(iso(t.validTo), '2026-10-01T12:00');
  assert.equal(span(t.groups[1]), '2026-09-30T20:00/2026-10-01T00:00');
  assert.equal(iso(t.groups[2].from), '2026-10-01T06:00');
});

test('a valid period across a year end', () => {
  const t = parseTaf('TAF CYMJ 311140Z 3112/0112 27010KT P6SM SKC', { now: new Date('2026-12-31T11:45:00Z') });
  assert.equal(iso(t.validTo), '2027-01-01T12:00');
});

test('forecastAt: coverage of a time and a window', () => {
  const t = parse(TAF.tempoHalfMile);
  assert.equal(forecastAt(t, at(29, 17)).covered, true);
  assert.equal(forecastAt(t, at(29, 17)).overlays.length, 1);
  assert.equal(forecastAt(t, at(29, 21)).overlays.length, 0);
  assert.equal(forecastAt(t, { from: at(30, 10), to: at(30, 13) }).covered, false);
});

test('bad text never throws', () => {
  assert.doesNotThrow(() => parse(''));
  assert.doesNotThrow(() => tafTimeline(parse('')));
  assert.doesNotThrow(() => parse('TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC TEMPO'));
  assert.deepEqual(tafTimeline(parse('NO TAF AVAILABLE')).prevailing, []);
});

test('a doubled header from the feed ("TAF AMD TAF AMD") still reads, and CNL reads as cancelled', () => {
  const t = parseTaf('TAF AMD TAF AMD CYMJ 300030Z 3000/3012 CNL', { now: new Date('2026-09-30T01:00:00Z') });
  assert.equal(t.station, 'CYMJ');
  assert.equal(t.amendment, 'AMD');
  assert.equal(t.cancelled, true);
  assert.deepEqual(t.problems, []);
  assert.equal(parseTaf('TAF TAF CYQR 291305Z 2913/3012 27010KT P6SM SKC', { now: NOW }).station, 'CYQR');
});
