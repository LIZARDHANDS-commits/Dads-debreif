// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// Tests may be poorly designed, overfitted to obsolete baseline assumptions,
// or time-locked to legacy trajectory floats. Under D411, tests must be updated
// or pruned, never accommodated by degrading aerodynamic fidelity.
// ============================================================================

// Regression tests for the verification thread's weather findings (verification/wx.md,
// 2026-09-30). Each is a report that read 'meets' or a clean chip when it could not be read.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetar } from '../../../src/wx/metar.js';
import { parseTaf } from '../../../src/wx/taf.js';
import { readConditions, tokenize } from '../../../src/wx/conditions.js';
import { checkConditions, DEFAULT_LIMITS, natoColour, flightCategory } from '../../../src/wx/limits.js';
import { homeAlternateTrigger, assessAlternate } from '../../../src/wx/alternates.js';
import { NOW, METAR_NOW, at } from './reports.js';

const taf = (raw) => parseTaf(raw, { now: NOW });
const WINDOW = { from: at(29, 14), to: at(29, 17) };

test('WX-1: a TEMPO, BECMG or PROB period that ends before it starts, or lasts longer than the TAF, is a problem and never meets', () => {
  for (const group of ['TEMPO 2920/2916 1/2SM FG OVC002', 'TEMPO 2916/2916 1/2SM FG OVC002', 'BECMG 2915/3100 OVC002', 'PROB30 2920/2916 1/2SM FG OVC002']) {
    const t = taf(`TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC ${group}`);
    assert.equal(t.problems.length, 1, group);
    assert.match(t.problems[0], /not a plausible period/);
    // Incomplete, or below when the bad group happens to start inside the window.
    assert.ok(['incomplete', 'below'].includes(homeAlternateTrigger(t, WINDOW, DEFAULT_LIMITS.home).status), group);
    assert.ok(['incomplete', 'below'].includes(assessAlternate(t, WINDOW).status), group);
  }
});

test('WX-1: the verification case, TEMPO 2920/2916 with a window of 14Z to 17Z, is incomplete', () => {
  const t = taf('TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC TEMPO 2920/2916 1/2SM FG OVC002');
  assert.equal(homeAlternateTrigger(t, WINDOW, DEFAULT_LIMITS.home).status, 'incomplete');
});

test('WX-1: ordinary change groups, including one ending exactly at the end of the TAF, stay clean', () => {
  const t = taf('TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC BECMG 2914/2916 BKN030 TEMPO 3006/3012 3SM BR PROB30 2920/2924 1SM SHRA');
  assert.deepEqual(t.problems, []);
});

test('WX-3: CAVOK together with a visibility, cloud or weather is listed as unread, and the stated values are kept', () => {
  for (const text of ['27010KT 1SM OVC010 CAVOK', '27010KT CAVOK 1SM OVC010']) {
    const read = readConditions(tokenize(text).tokens);
    assert.deepEqual(read.unread, ['CAVOK'], text);
    assert.equal(read.conditions.cavok, false);
    assert.equal(read.conditions.visibility.sm, 1);
    assert.equal(read.conditions.sky[0].baseFt, 1000);
  }
  const clean = readConditions(tokenize('27010KT CAVOK').tokens);
  assert.deepEqual(clean.unread, []);
  assert.equal(clean.conditions.cavok, true);
  assert.equal(clean.conditions.skyClear, true);
});

test('WX-3: "1SM OVC010 CAVOK" never meets, in a TAF or a METAR', () => {
  const t = taf('TAF CYMJ 291120Z 2912/3012 27010KT 1SM OVC010 CAVOK');
  assert.ok(t.problems.some((p) => p.includes('CAVOK')));
  assert.notEqual(homeAlternateTrigger(t, WINDOW, DEFAULT_LIMITS.home).status, 'meets');
  const m = parseMetar('METAR CYMJ 291500Z 27010KT 1SM OVC010 CAVOK 10/08 A2995', { now: METAR_NOW });
  assert.deepEqual(m.unread, ['CAVOK']);
  assert.equal(checkConditions(m.conditions, DEFAULT_LIMITS.home).level, 'below');
});

test('WX-5: no cloud group and no SKC/CLR/NSC/NCD gives category UNK and colour UNK', () => {
  const c = parseMetar('METAR CYMJ 291500Z 27010KT 15SM 10/08 A2995', { now: METAR_NOW }).conditions;
  assert.equal(flightCategory(c), 'UNK');
  assert.equal(natoColour(c), 'UNK');
  assert.equal(checkConditions(c, DEFAULT_LIMITS.home).level, 'unknown');
  const clear = parseMetar('METAR CYMJ 291500Z 27010KT 15SM SKC 10/08 A2995', { now: METAR_NOW }).conditions;
  assert.equal(flightCategory(clear), 'VFR');
  assert.equal(natoColour(clear), 'BLU');
  const fog = parseMetar('METAR CYMJ 291500Z 00000KT 1/8SM FG 10/10 A2995', { now: METAR_NOW }).conditions;
  assert.equal(flightCategory(fog), 'LIFR', 'LIFR on visibility alone is still known');
  assert.equal(natoColour(fog), 'RED');
});

test('WX-7: minima that are supplied but unusable give incomplete, not the 600-2 fallback', () => {
  const t = taf('TAF CYQR 291140Z 2912/3012 27010KT P6SM BKN007');
  assert.equal(assessAlternate(t, WINDOW).status, 'meets', 'missing minima still fall back to 600-2');
  for (const minima of [{ ceilingFt: 'abc', visSm: 2 }, [], { visSm: 2 }]) {
    const r = assessAlternate(t, WINDOW, { minima });
    assert.equal(r.status, 'incomplete', JSON.stringify(minima));
    assert.ok(r.problems.includes('Alternate minima could not be read'));
  }
  assert.equal(assessAlternate(t, WINDOW, { landingMinima: { ceilingFt: null, visSm: 1 } }).status, 'incomplete');
  assert.equal(homeAlternateTrigger(taf('TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC'), WINDOW, { ceilingFt: 'x' }).status, 'incomplete');
});

test('WX-1 (audit): a backwards group on the 31st, when next month has no 31st, is still caught', () => {
  const now = new Date('2026-10-31T11:30:00Z');
  const window = { from: new Date('2026-10-31T14:00:00Z'), to: new Date('2026-10-31T21:00:00Z') };
  for (const group of ['TEMPO 3120/3116 1/2SM FG OVC002', 'TEMPO 3116/3116 1/2SM FG OVC002']) {
    const t = parseTaf(`TAF CYMJ 311120Z 3112/0112 27010KT P6SM SKC ${group}`, { now });
    assert.match(t.problems.join(), /not a plausible period/, group);
    assert.notEqual(homeAlternateTrigger(t, window, DEFAULT_LIMITS.home).status, 'meets', group);
  }
  const backwards = parseTaf('TAF CYMJ 311120Z 3112/3106 27010KT P6SM SKC', { now });
  assert.match(backwards.problems.join(), /Valid period 3112\/3106 is not plausible/);
});

test('WX-3 (audit): CAVOK repeated beside 9999 or P6SM agrees and stays clean', () => {
  for (const text of ['27010KT 9999 CAVOK', '27010KT P6SM CAVOK', '27010KT CAVOK 9999']) {
    const read = readConditions(tokenize(text).tokens);
    assert.deepEqual(read.unread, [], text);
    assert.equal(read.conditions.skyClear, true, text);
  }
  assert.deepEqual(readConditions(tokenize('27010KT 3SM CAVOK').tokens).unread, ['CAVOK']);
});

test('WX-5 (audit): no visibility gives category and colour UNK, unless already LIFR or RED', () => {
  for (const sky of ['BKN050', 'FEW050', 'SKC']) {
    const c = parseMetar(`METAR CYMJ 291500Z 27010KT ${sky} 10/08 A2995`, { now: METAR_NOW }).conditions;
    assert.equal(flightCategory(c), 'UNK', sky);
    assert.equal(natoColour(c), 'UNK', sky);
  }
  const low = parseMetar('METAR CYMJ 291500Z 27010KT OVC001 10/08 A2995', { now: METAR_NOW }).conditions;
  assert.equal(flightCategory(low), 'LIFR');
  assert.equal(natoColour(low), 'RED');
});
