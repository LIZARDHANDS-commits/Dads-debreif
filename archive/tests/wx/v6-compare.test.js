// Side by side with V6's own SOF functions (loaded from original/shell.html).
// The new parser must agree with V6 wherever V6 read the report correctly, and
// differ exactly where an audit issue says V6 is wrong.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadV6 } from './v6-sof.js';
import { readConditions, tokenize, ceilingFt } from '../../../src/wx/conditions.js';
import { parseMetar } from '../../../src/wx/metar.js';
import { parseTaf } from '../../../src/wx/taf.js';
import { natoColour, flightCategory } from '../../../src/wx/limits.js';
import { homeAlternateTrigger } from '../../../src/wx/alternates.js';
import { METAR, TAF, NOW, METAR_NOW, at } from './reports.js';

const v6 = loadV6();
const cond = (text) => readConditions(tokenize(text).tokens).conditions;

/** Our visibility as V6's vals() numbers it: M is 0.01 under, P is 0.01 over. */
function asV6Vals(text) {
  const c = cond(text);
  const v = c.visibility;
  const vis = !v ? null : v.qualifier === 'less' ? v.sm - 0.01 : v.qualifier === 'more' && v.metres == null ? v.sm + 0.01 : v.sm;
  return { v: vis == null ? null : Math.round(vis * 1000) / 1000, c: ceilingFt(c) ?? 99999 };
}

const round = ({ v, c }) => ({ v: v == null ? null : Math.round(v * 1000) / 1000, c });

test('visibility and ceiling agree with V6 vals() where V6 reads them correctly', () => {
  for (const text of [
    '27010KT P6SM SKC',
    '27010KT 1 1/2SM BR OVC004',
    '27005KT 3SM BR BKN020',
    '00000KT 1/2SM FG VV002',
    '27010G18KT 15SM -SHRA FEW030 BKN080 OVC120',
    '00000KT M1/4SM FG OVC002',
  ]) {
    assert.deepEqual(asV6Vals(text), round(v6.vals(text)), text);
  }
});

test('issue #1: V6 vals() reads TEMPO 2916/2920 1/2SM as 2920.5 SM; the new parser reads 1/2 SM', () => {
  assert.equal(v6.vals('TEMPO 2916/2920 1/2SM FG').v, 2920.5);
  const tempo = parseTaf(TAF.tempoHalfMile, { now: NOW }).groups[1];
  assert.equal(tempo.conditions.visibility.sm, 0.5);
});

test('issue #3: V6 vals() sees no ceiling in BKN015CB; the new parser sees 1500 ft', () => {
  assert.equal(v6.vals('27010KT P6SM BKN015CB').c, 99999);
  assert.equal(asV6Vals('27010KT P6SM BKN015CB').c, 1500);
});

test('NATO colour state agrees with V6 nato() on reports it reads correctly', () => {
  for (const text of [
    '27010KT P6SM SKC',
    '27010KT 1 1/2SM BR OVC004',
    '27005KT 3SM BR BKN020',
    '27005KT 2SM BR BKN015',
    '27010KT 15SM FEW030 SCT045 BKN080',
    '27010KT 1/2SM FG OVC001',
    '27010KT 5SM HZ SCT060',
  ]) {
    assert.equal(natoColour(cond(text)), v6.nato(text), text);
  }
});

test('issue #3: V6 nato() shows M1/4SM fog as WHT and misses a CB base; the new code does not', () => {
  assert.equal(v6.nato('00000KT M1/4SM FG SKC'), 'WHT');
  assert.equal(natoColour(cond('00000KT M1/4SM FG SKC')), 'RED');
  assert.equal(v6.nato('27010KT P6SM SCT012CB'), 'BLU');
  assert.equal(natoColour(cond('27010KT P6SM SCT012CB')), 'GRN');
});

test('flight category agrees with V6 cat() on METARs it reads correctly', () => {
  for (const raw of [METAR.typical, METAR.mixedFraction, METAR.onLimits, METAR.belowBoth, METAR.freezingFog]) {
    const o = v6.parseRawMetar('CYMJ', raw);
    assert.equal(flightCategory(parseMetar(raw, { now: METAR_NOW }).conditions), o.fltCat, raw);
  }
});

test('issue #3: V6 cat() cannot categorise M1/4SM FG BKN002CB; the new code says LIFR', () => {
  assert.equal(v6.parseRawMetar('CYMJ', METAR.quarterMileFog).fltCat, 'UNK');
  assert.equal(flightCategory(parseMetar(METAR.quarterMileFog, { now: METAR_NOW }).conditions), 'LIFR');
});

// V6's wave window: takeoff, landing, and landing plus one hour.
const W6 = { s: at(29, 17), e: at(29, 19), plus1: at(29, 20) };
const WAVE = { from: W6.s, to: W6.plus1 };
function v6Status(raw) {
  const q = v6.tafHazards(raw, W6, 2000, 3);
  return !q.covered ? 'not-covered' : q.hits.length ? 'below' : 'meets';
}
const ours = (raw) => homeAlternateTrigger(parseTaf(raw, { now: NOW }), WAVE).status;

test('home alternate trigger agrees with V6 tafHazards() on TAFs it reads correctly', () => {
  for (const raw of [
    'TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC',
    'TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC TEMPO 2916/2920 1SM BR',
    'TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC FM291500 27010KT 2SM BR OVC008',
    'TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC FM291500 27010KT P6SM BKN030 FM292200 27010KT 2SM BR OVC008',
    'TAF CYMJ 291120Z 2912/2918 27010KT P6SM SKC',
    'TAF CYMJ 291120Z 2912/3012 27010KT P6SM BKN030 PROB30 TEMPO 2917/2919 2SM -SHRA BKN015',
  ]) {
    assert.equal(ours(raw), v6Status(raw), raw);
  }
});

test('issues #1 to #3: where V6 tafHazards() gets the home trigger wrong', () => {
  const cases = [
    ['#1 TEMPO 1/2SM read as 2920 SM', TAF.tempoHalfMile, 'meets', 'below'],
    ['#2 BECMG dropped after its change period', TAF.becmgIfr, 'meets', 'below'],
    ['#2 leading TEMPO stretches the base forecast', TAF.leadingTempo, 'below', 'meets'],
    ['#3 CB ceiling ignored', TAF.cbCeiling, 'meets', 'below'],
  ];
  for (const [name, raw, v6Says, weSay] of cases) {
    assert.equal(v6Status(raw), v6Says, `V6: ${name}`);
    assert.equal(ours(raw), weSay, `new: ${name}`);
  }
});
