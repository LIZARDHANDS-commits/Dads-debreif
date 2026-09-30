import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetar } from '../../../src/wx/metar.js';
import { METAR, NOW } from './reports.js';

const parse = (raw, now = NOW) => parseMetar(raw, { now });

test('typical METAR: header, wind, visibility, weather, cloud, temperature, altimeter, remarks', () => {
  const m = parse(METAR.typical);
  assert.equal(m.type, 'METAR');
  assert.equal(m.station, 'CYMJ');
  assert.equal(m.time.toISOString(), '2026-09-29T15:00:00.000Z');
  assert.deepEqual(
    { dir: m.conditions.wind.dirDeg, kt: m.conditions.wind.speedKt, gust: m.conditions.wind.gustKt },
    { dir: 270, kt: 10, gust: 18 },
  );
  assert.equal(m.conditions.visibility.sm, 15);
  assert.deepEqual(m.conditions.weather.map((w) => w.raw), ['-SHRA']);
  assert.deepEqual(m.conditions.sky.map((l) => [l.cover, l.baseFt, l.type]), [
    ['FEW', 3000, 'TCU'], ['BKN', 8000, null], ['OVC', 12000, null],
  ]);
  assert.equal(m.ceilingFt, 8000);
  assert.equal(m.temperatureC, 14);
  assert.equal(m.dewpointC, 8);
  assert.deepEqual(m.altimeter, { inHg: 29.92 });
  assert.equal(m.remarks, 'TCU2AC3SC1 SLP134');
  assert.deepEqual(m.unread, []);
});

test('issue #3: M1/4SM is less than 1/4 SM, and BKN002CB is a 200 ft ceiling', () => {
  const m = parse(METAR.quarterMileFog);
  assert.deepEqual(
    { sm: m.conditions.visibility.sm, q: m.conditions.visibility.qualifier },
    { sm: 0.25, q: 'less' },
  );
  assert.equal(m.ceilingFt, 200);
  assert.equal(m.conditions.sky[0].type, 'CB');
});

test('mixed-number visibility "1 1/2SM" and SPECI', () => {
  const m = parse(METAR.mixedFraction);
  assert.equal(m.type, 'SPECI');
  assert.equal(m.conditions.visibility.sm, 1.5);
  assert.equal(m.ceilingFt, 400);
});

test('metric visibility, AUTO, NCD and hPa altimeter', () => {
  const m = parse(METAR.metric);
  assert.equal(m.auto, true);
  assert.equal(m.conditions.visibility.metres, 9999);
  assert.equal(m.conditions.visibility.qualifier, 'more');
  assert.equal(m.conditions.skyClear, true);
  assert.equal(m.ceilingFt, null);
  assert.equal(m.conditions.wind.variable, true);
  assert.deepEqual(m.altimeter, { hPa: 1012 });
});

test('CAVOK, variable wind direction and a negative dewpoint', () => {
  const m = parse(METAR.cavok);
  assert.equal(m.conditions.cavok, true);
  assert.equal(m.conditions.visibility.qualifier, 'more');
  assert.deepEqual(m.conditions.wind.varyingDeg, [260, 330]);
  assert.equal(m.dewpointC, -2);
});

test('weather groups split into intensity, descriptor and phenomena', () => {
  const [w] = parse(METAR.heavyStorm).conditions.weather;
  assert.deepEqual({ i: w.intensity, d: w.descriptor, p: w.phenomena }, { i: '+', d: 'TS', p: ['RA', 'GR'] });
  const [v] = parse(METAR.vicinityStorm).conditions.weather;
  assert.deepEqual({ i: v.intensity, d: v.descriptor, p: v.phenomena }, { i: 'VC', d: 'TS', p: [] });
});

test('a vertical visibility is a ceiling; an unknown base is not guessed', () => {
  assert.equal(parse(METAR.freezingFog).ceilingFt, 200);
  const m = parse(METAR.unknownLayer);
  assert.equal(m.conditions.sky[0].baseFt, null);
  assert.equal(m.ceilingFt, null);
});

test('observation day resolves across a month end', () => {
  const m = parseMetar('METAR CYMJ 302350Z 27010KT 15SM SKC 10/02 A3001', { now: new Date('2026-10-01T00:10:00Z') });
  assert.equal(m.time.toISOString(), '2026-09-30T23:50:00.000Z');
});

test('bad text never throws and is listed as unread', () => {
  const m = parse('METAR CYMJ 291500Z 27010KT 15SM XYZZY SKC');
  assert.deepEqual(m.unread, ['XYZZY']);
  assert.doesNotThrow(() => parse(''));
  assert.doesNotThrow(() => parse(null));
  assert.equal(parse('').station, null);
});
