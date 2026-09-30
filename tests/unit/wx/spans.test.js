// Word positions for the SOF banner: every group, condition item, reason and hit
// says where its words are in the raw report, as { start, end } character offsets.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetar } from '../../../src/wx/metar.js';
import { parseTaf } from '../../../src/wx/taf.js';
import { checkConditions, DEFAULT_LIMITS } from '../../../src/wx/limits.js';
import { homeAlternateTrigger, assessAlternate } from '../../../src/wx/alternates.js';
import { NOW, METAR_NOW, at } from './reports.js';

const text = (raw, span) => (span ? raw.slice(span.start, span.end) : null);

test('METAR: wind, visibility, each layer and each weather item carry the span of their own words', () => {
  const raw = 'metar cymj 291500Z 27010G20KT 1 1/2SM -TSRA BR BKN008 OVC020CB 10/08 A2995 RMK TS OHD=';
  const c = parseMetar(raw, { now: METAR_NOW }).conditions;
  assert.equal(text(raw, c.wind.span), '27010G20KT');
  assert.equal(text(raw, c.visibility.span), '1 1/2SM');
  assert.deepEqual(c.weather.map((w) => text(raw, w.span)), ['-TSRA', 'BR']);
  assert.deepEqual(c.sky.map((l) => text(raw, l.span)), ['BKN008', 'OVC020CB']);
});

test('checkConditions: reasonSpans[k] marks the words behind reasons[k]', () => {
  const raw = 'METAR CYMJ 291500Z 27010KT 1SM -TSRA BR BKN008 OVC020CB 10/08 A2995';
  const r = checkConditions(parseMetar(raw, { now: METAR_NOW }).conditions, DEFAULT_LIMITS.home);
  assert.equal(r.reasons.length, r.reasonSpans.length);
  const marked = r.reasonSpans.map((spans) => spans.map((s) => text(raw, s)));
  assert.deepEqual(marked, [['BKN008'], ['1SM'], ['-TSRA'], ['OVC020CB']]);
  assert.match(r.reasons[0], /^CEILING 800 FT/);
});

test('CAVOK: the visibility it stands for points at the CAVOK word', () => {
  const raw = 'METAR EGLL 291500Z 27010KT CAVOK 10/08 Q1015';
  const c = parseMetar(raw, { now: METAR_NOW }).conditions;
  assert.equal(text(raw, c.visibility.span), 'CAVOK');
});

test('TAF: each group has the span of its whole text, header words included', () => {
  const raw = 'TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC TEMPO 2916/2920 1/2SM FG OVC002 PROB30 TEMPO 2920/2922 VCTS=';
  const t = parseTaf(raw, { now: NOW });
  assert.deepEqual(t.groups.map((g) => text(raw, g.span)), ['27010KT P6SM SKC', 'TEMPO 2916/2920 1/2SM FG OVC002', 'PROB30 TEMPO 2920/2922 VCTS']);
});

test('hits and cautions carry the group span and the reason spans, so the banner can mark them', () => {
  const raw = 'TAF CYMJ 291120Z 2912/3012 27010KT P6SM BKN030 TEMPO 2915/2917 1/2SM FG OVC002 FM291800 27010KT P6SM FEW040CB';
  const t = parseTaf(raw, { now: NOW });
  const r = homeAlternateTrigger(t, { from: at(29, 14), to: at(29, 20) }, DEFAULT_LIMITS.home);
  assert.equal(r.status, 'below');
  const hit = r.hits[0];
  assert.equal(text(raw, hit.span), 'TEMPO 2915/2917 1/2SM FG OVC002');
  assert.deepEqual(hit.reasonSpans.flat().map((s) => text(raw, s)), ['OVC002', '1/2SM', 'FG'], 'FG is also a caution (Q28)');
  const cb = r.cautions.find((c) => c.kind === 'FM' || c.kind === 'PREVAILING');
  assert.deepEqual(cb.reasonSpans.flat().map((s) => text(raw, s)), ['FEW040CB']);
  const alt = assessAlternate(t, { from: at(29, 14), to: at(29, 17) });
  assert.equal(text(raw, alt.worst.span), 'TEMPO 2915/2917 1/2SM FG OVC002');
});

test('an inherited value points at the group that stated it', () => {
  const raw = 'TAF CYMJ 291120Z 2912/3012 27010KT P6SM OVC008 TEMPO 2915/2917 2SM BR';
  const r = homeAlternateTrigger(parseTaf(raw, { now: NOW }), { from: at(29, 15), to: at(29, 16) }, DEFAULT_LIMITS.home);
  const tempo = r.hits.find((h) => h.kind === 'TEMPO');
  assert.deepEqual(tempo.reasonSpans.flat().map((s) => text(raw, s)), ['OVC008', '2SM']);
});
