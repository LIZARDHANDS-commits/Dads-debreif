import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTaf } from '../../../src/wx/taf.js';
import { homeAlternateTrigger, assessAlternate } from '../../../src/wx/alternates.js';
import { TAF, NOW, at } from './reports.js';

const taf = (raw) => parseTaf(raw, { now: NOW });
// Takeoff 17Z, land 19Z, window to land + 1 hour (V6's wave window).
const WAVE = { from: at(29, 17), to: at(29, 20) };

test('issue #1: TEMPO 1/2SM FG in the wave window triggers the home alternate', () => {
  const r = homeAlternateTrigger(taf(TAF.tempoHalfMile), WAVE);
  assert.equal(r.status, 'below');
  assert.deepEqual(r.hits.map((h) => [h.kind, h.reasons]), [['TEMPO', ['VIS 1/2 SM < 3 SM', 'SIGNIFICANT WX (FG)']]]);
});

test('issue #2: BECMG to 1SM OVC003 before the wave triggers the home alternate', () => {
  const r = homeAlternateTrigger(taf(TAF.becmgIfr), WAVE);
  assert.equal(r.status, 'below');
  assert.deepEqual(r.hits.map((h) => h.kind), ['PREVAILING']);
  assert.deepEqual(r.hits[0].reasons, ['CEILING 300 FT < 2000 FT', 'VIS 1 SM < 3 SM']);
});

test('issue #2 (sof-c#7): IFR only before the first FM does not trigger an afternoon wave', () => {
  assert.equal(homeAlternateTrigger(taf(TAF.leadingTempo), WAVE).status, 'meets');
});

test('issue #3: a BKN015CB ceiling triggers the home alternate', () => {
  const r = homeAlternateTrigger(taf(TAF.cbCeiling), WAVE);
  assert.equal(r.status, 'below');
  assert.deepEqual(r.hits[0].reasons, ['CEILING 1500 FT < 2000 FT']);
});

test('limits are an input (R16): 1000 ft / 1 SM home limits let the BKN015CB wave go', () => {
  assert.equal(homeAlternateTrigger(taf(TAF.cbCeiling), WAVE, { ceilingFt: 1000, visSm: 1 }).status, 'meets');
});

test('a TAF that does not cover the whole window says so, and still lists what it knows', () => {
  const r = homeAlternateTrigger(taf(TAF.overnightFog), { from: at(30, 6), to: at(30, 13) });
  assert.equal(r.status, 'not-covered');
  assert.equal(r.covered, false);
  assert.equal(r.hits.length, 1);
});

test('no TAF', () => {
  assert.equal(homeAlternateTrigger(null, WAVE).status, 'no-taf');
  assert.equal(homeAlternateTrigger(taf('NO TAF AVAILABLE'), WAVE).status, 'no-taf');
});

test('issue #4: an alternate in fog at ETA is below minima, not green', () => {
  const r = assessAlternate(taf(TAF.altFogLifting), at(29, 17));
  assert.equal(r.status, 'below');
  assert.deepEqual(r.hits[0].reasons, ['CEILING 200 FT < 600 FT', 'VIS <1/4 SM < 2 SM', 'SIGNIFICANT WX (FG)']);
});

test('issue #4: the same alternate after the fog lifts meets minima', () => {
  const r = assessAlternate(taf(TAF.altFogLifting), at(29, 19));
  assert.equal(r.status, 'meets');
  assert.equal(r.prevailing.visibility.qualifier, 'more');
});

test('issue #4: a TEMPO active at ETA counts against the alternate', () => {
  const r = assessAlternate(taf(TAF.altTempoShowers), at(29, 18));
  assert.equal(r.status, 'below');
  assert.deepEqual(r.hits.map((h) => h.kind), ['TEMPO']);
  assert.equal(assessAlternate(taf(TAF.altTempoShowers), at(29, 21)).status, 'meets');
});

test('alternate limits are an input', () => {
  const r = assessAlternate(taf(TAF.altTempoShowers), at(29, 18), { limits: { ceilingFt: 400, visSm: 1 } });
  assert.equal(r.status, 'meets');
});

test('GNSS-only alternates: V6 had no rule, so the result asks for the MEA or a manual check (WX-4)', () => {
  assert.equal(assessAlternate(taf(TAF.altFogLifting), at(29, 19), { gnssOnly: true }).status, 'needs-mea');
  const r = assessAlternate(taf(TAF.altFogLifting), at(29, 19), { gnssOnly: true, meaFt: 4300 });
  assert.equal(r.status, 'gnss-check');
  assert.equal(r.meaFt, 4300);
});

test('alternate without a TAF, or with an ETA outside it, is never green', () => {
  assert.equal(assessAlternate(null, at(29, 18)).status, 'no-taf');
  assert.equal(assessAlternate(taf(TAF.altFogLifting), at(30, 13)).status, 'not-covered');
});

test('alternate TAF without a readable visibility is incomplete, not green', () => {
  const r = assessAlternate(taf('TAF CYQR 291140Z 2912/3012 27010KT BKN040'), at(29, 18));
  assert.equal(r.status, 'incomplete');
});
