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

// Tests for the marked report words on the caution banner (SPEC-sof, "Caution banner", task 3):
// each caution carries where in the report its words are, and each banner line shows those words.
// The positions are wx's; nothing here reads a report's text to find them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetar } from '../../../src/wx/metar.js';
import { parseTaf } from '../../../src/wx/taf.js';
import { homeAlternateTrigger } from '../../../src/wx/alternates.js';
import { cardModel } from '../../../src/modules/sof/cards.js';
import { cautionList } from '../../../src/modules/sof/cautions.js';
import { buildBanner, tafInputs } from '../../../src/modules/sof/banner-model.js';
import { METAR, HOME_TAF } from '../../fixtures/sof/reports.js';

const ZONE = 'America/Regina';
const LIMITS = { ceilingFt: 2000, visSm: 3 };
const NOW = new Date('2026-09-29T18:42:00Z');
const at = (day, hh) => new Date(Date.UTC(2026, 8, day, hh));

const metarEntry = (raw, now = NOW) => ({ raw, report: parseMetar(raw, { now }), source: 'metno', status: 'fresh' });
const card = (icao, raw, now = NOW) => cardModel({ icao, name: icao, role: icao === 'CYMJ' ? 'HOME' : 'ALT', metar: metarEntry(raw, now), limits: LIMITS, now, timeZone: ZONE });
const wordsOf = (c) => (c.spans ?? []).map((s) => c.raw.slice(s.start, s.end));

test('a METAR caution carries its report text and the positions of the words behind its reason', () => {
  const list = cautionList({ cards: [card('CYMJ', METAR.belowLimits)] });
  const [ceiling, vis] = list;
  assert.match(ceiling.reason, /^CEILING/);
  assert.match(vis.reason, /^VIS/);
  assert.equal(ceiling.raw, METAR.belowLimits);
  assert.match(wordsOf(ceiling)[0], /^(BKN|OVC)\d{3}$/);
  assert.match(wordsOf(vis)[0], /SM$/);
});

test('a dangerous-weather caution points at the weather words', () => {
  const list = cautionList({ cards: [card('CYMJ', METAR.thunderstorm)] });
  assert.ok(list.some((c) => wordsOf(c).some((w) => /TS|CB|TCU/.test(w))), JSON.stringify(list.map(wordsOf)));
});

test('a TAF caution carries the TAF text and the words of its group', () => {
  const taf = parseTaf(HOME_TAF.vicinityStorm, { now: NOW });
  const result = homeAlternateTrigger(taf, { from: at(29, 18), to: at(30, 6) }, LIMITS);
  const list = cautionList({ tafs: [{ icao: 'CYMJ', raw: taf.raw, result }] });
  const storm = list.find((c) => c.reason.startsWith('THUNDERSTORM'));
  assert.deepEqual(wordsOf(storm), ['VCTS']);
  const cb = list.find((c) => c.reason.startsWith('CB/TCU'));
  assert.deepEqual(wordsOf(cb), ['FEW040CB']);
});

test('pieces of one TAF spell joined into a caution keep every word once', () => {
  const taf = parseTaf(HOME_TAF.lowFromEvening, { now: NOW });
  const result = homeAlternateTrigger(taf, { from: at(29, 18), to: at(30, 6) }, LIMITS);
  const list = cautionList({ tafs: [{ icao: 'CYMJ', raw: taf.raw, result }] });
  const ceiling = list.find((c) => c.reason.startsWith('CEILING'));
  assert.deepEqual(wordsOf(ceiling), ['OVC008']);
  assert.equal(new Set(ceiling.spans.map((s) => `${s.start}-${s.end}`)).size, ceiling.spans.length);
});

test('without text or positions a caution has none, and everything else about it is the same', () => {
  const taf = parseTaf(HOME_TAF.vicinityStorm, { now: NOW });
  const result = homeAlternateTrigger(taf, { from: at(29, 18), to: at(30, 6) }, LIMITS);
  const list = cautionList({ tafs: [{ icao: 'CYMJ', result }] });
  assert.ok(list.length > 0);
  for (const c of list) assert.equal(c.raw, null);
  const stripped = cautionList({ tafs: [{ icao: 'CYMJ', raw: taf.raw, result: { ...result, cautions: result.cautions.map(({ reasonSpans, span, ...rest }) => rest) } }] });
  for (const c of stripped) assert.deepEqual(c.spans, []);
});

test('hostile positions on a card are ignored, never thrown on', () => {
  const c = card('CYMJ', METAR.belowLimits);
  const reason = c.result.reasons[0];
  const hostile = { ...c, reasonSpans: { [reason]: [null, { start: 'x', end: 2 }, { start: -4, end: 9999 }, { start: 5, end: 3 }, { get start() { throw new Error('x'); }, end: 4 }] } };
  const [first] = cautionList({ cards: [hostile] });
  assert.ok(first.spans.every((s) => Number.isInteger(s.start) && Number.isInteger(s.end)));
});

// ---- The banner's lines --------------------------------------------------------------------

const banner = (raw, tafs = {}) => {
  const cards = [card('CYQR', raw)];
  return buildBanner({ cards, tafs: tafInputs({ tafs, calls: [], homeIcao: 'CYMJ', now: NOW, timeZone: ZONE }), now: NOW, timeZone: ZONE });
};

test('a banner line lists the marked words of the report, in its level', () => {
  const b = banner('CYQR 291800Z 26005KT 2SM BR BKN004 10/08 A2995');
  const line = b.lines.find((l) => l.text.includes('CEILING'));
  assert.deepEqual(line.marks, [{ text: 'BKN004', level: 'below' }]);
});

test('a banner line for a TAF caution shows the TAF\'s words, and the line says it was the TAF\'s', () => {
  const taf = parseTaf(HOME_TAF.vicinityStorm, { now: NOW });
  const b = buildBanner({ cards: [], tafs: tafInputs({ tafs: { CYMJ: taf }, calls: [], homeIcao: 'CYMJ', now: NOW, timeZone: ZONE }), now: NOW, timeZone: ZONE });
  const storm = b.lines.find((l) => l.text.includes('THUNDERSTORM'));
  assert.deepEqual(storm.marks, [{ text: 'VCTS', level: 'caution' }]);
});

test('a line with no positions has an empty list of marks', () => {
  const b = buildBanner({
    cards: [], now: NOW, timeZone: ZONE,
    extra: [{ key: 'lightning|CYMJ', icao: 'CYMJ', source: 'lightning', level: 'caution', text: 'Caution: lightning near CYMJ' }],
  });
  assert.deepEqual(b.lines[0].marks, []);
});

test('the banner\'s signature holds the marked words, so a line whose words changed is redrawn', () => {
  const b = banner('CYQR 291800Z 26005KT 2SM BR BKN004 10/08 A2995');
  assert.ok(b.signature.includes('BKN004'));
});

test('home\'s own TAF below the home limits, with no wave entered, has marked words on its banner lines', () => {
  const taf = parseTaf(HOME_TAF.lowFromEvening, { now: NOW });
  const inputs = tafInputs({ tafs: { CYMJ: taf }, calls: [], homeIcao: 'CYMJ', homeLimits: LIMITS, now: NOW, timeZone: ZONE });
  const b = buildBanner({ cards: [], tafs: inputs, now: NOW, timeZone: ZONE });
  const ceiling = b.lines.find((l) => l.level === 'below' && l.text.includes('CEILING'));
  assert.ok(ceiling, JSON.stringify(b.lines.map((l) => l.text)));
  assert.deepEqual(ceiling.marks, [{ text: 'OVC008', level: 'below' }]);
  for (const l of b.lines) assert.ok(Array.isArray(l.marks));
});
