// Checks: weather word reading: letter case, trailing =, remarks, half-mile forms, metres per second to knots, merging change groups, visibility formatting.
// Serves: SOF-R9.
// Expected values: hand-written METAR and TAF strings in the standard form; unit conversions are standard (800 m = 800 / 1609.344 SM).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConditions, mergeConditions, formatVisibility, tokenize } from '../../../src/wx/conditions.js';

const read = (text) => readConditions(tokenize(text).tokens).conditions;

test('tokenize: upper case, trailing "=", remarks split at RMK', () => {
  const raw = 'taf cymj  291120Z 2912/3012 p6sm skc rmk nxt fcst by 18z=';
  const { tokens, remarks, spans } = tokenize(raw);
  assert.deepEqual(tokens, ['TAF', 'CYMJ', '291120Z', '2912/3012', 'P6SM', 'SKC']);
  assert.equal(remarks, 'NXT FCST BY 18Z');
  assert.deepEqual(spans.map((s) => raw.slice(s.start, s.end)), ['taf', 'cymj', '291120Z', '2912/3012', 'p6sm', 'skc']);
});

test('tokenize: a trailing "=" is not part of the last word, and a lone "=" is dropped', () => {
  const a = tokenize('CYMJ 300027Z 27008KT 15SM SKC=');
  assert.equal(a.tokens.at(-1), 'SKC');
  assert.deepEqual(a.spans.at(-1), { start: 26, end: 29 });
  assert.deepEqual(tokenize('CYMJ 300027Z SKC =').tokens, ['CYMJ', '300027Z', 'SKC']);
});

test('issue #1: a TAF period before a fraction is never read as whole miles', () => {
  // The group header is removed before conditions are read, and a whole number only
  // joins a fraction when it has one or two digits.
  assert.equal(read('2920 1/2SM FG').visibility.sm, 0.5);
  assert.equal(read('100 1/2SM').visibility.sm, 0.5);
  assert.equal(read('2 1/2SM').visibility.sm, 2.5);
});

test('visibility forms', () => {
  const v = (t) => { const x = read(t).visibility; return [x.sm, x.qualifier]; };
  assert.deepEqual(v('M1/4SM'), [0.25, 'less']);
  assert.deepEqual(v('P6SM'), [6, 'more']);
  assert.deepEqual(v('3/4SM'), [0.75, null]);
  assert.deepEqual(v('15SM'), [15, null]);
  assert.deepEqual(v('0800'), [800 / 1609.344, null]);
});

test('wind in metres per second is converted to knots', () => {
  assert.equal(read('05010MPS').wind.speedKt, 19);
});

test('merge: change groups replace only what they state', () => {
  const base = read('27010KT P6SM -SHRA BKN030');
  const m = mergeConditions(base, read('3SM BR'));
  assert.equal(m.wind.speedKt, 10);
  assert.equal(m.visibility.sm, 3);
  assert.deepEqual(m.weather.map((w) => w.raw), ['BR']);
  assert.deepEqual(m.sky.map((l) => l.raw), ['BKN030']);
});

test('merge: NSW clears weather, SKC/NSC clears cloud, CAVOK clears both', () => {
  const base = read('27010KT 3SM -SHRA BKN030');
  assert.deepEqual(mergeConditions(base, read('NSW')).weather, []);
  assert.deepEqual(mergeConditions(base, read('NSC')).sky, []);
  const cavok = mergeConditions(base, read('CAVOK'));
  assert.deepEqual([cavok.weather, cavok.sky, cavok.visibility.qualifier], [[], [], 'more']);
});

test('formatVisibility shows fractions and qualifiers, never raw floats (sof-c#8)', () => {
  const f = (t) => formatVisibility(read(t).visibility);
  assert.equal(f('M1/4SM'), '<1/4 SM');
  assert.equal(f('1 1/2SM'), '1 1/2 SM');
  assert.equal(f('P6SM'), '>6 SM');
  assert.equal(f('15SM'), '15 SM');
  assert.equal(f('9999'), '10 km or more');
  assert.equal(f('0800'), '800 m');
  assert.equal(formatVisibility(null), 'VIS ?');
});
