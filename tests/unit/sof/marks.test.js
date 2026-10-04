// Checks: cutting a report's text into plain and marked pieces from wx's word positions.
// Serves: SOF-R7, SOF-R24.
// Expected values: hand-written strings and positions.

// Tests for src/modules/sof/marks.js: cutting a report's text into plain and marked pieces
// from wx's word positions (SPEC-sof, "Airfield cards", "Caution banner"). Pure: no page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segments, markedWords, marksOfCheck, alignMarks, LEVEL_WORDS } from '../../../src/modules/sof/marks.js';
import { parseMetar } from '../../../src/wx/metar.js';
import { checkOptions } from '../../../src/wx/alternates.js';

const RAW = 'CYQR 291800Z 26005KT 2SM BR BKN004 10/08 A2995';
const at = (needle) => ({ start: RAW.indexOf(needle), end: RAW.indexOf(needle) + needle.length });
const join = (segs) => segs.map((s) => s.text).join('');
const NOW = new Date('2026-09-29T18:42:00Z');

test('no spans: one plain piece with the whole text', () => {
  assert.deepEqual(segments(RAW, []), [{ text: RAW, level: null }]);
  assert.deepEqual(segments(RAW, undefined), [{ text: RAW, level: null }]);
});

test('empty or unreadable text gives no pieces', () => {
  assert.deepEqual(segments('', [{ start: 0, end: 1, level: 'below' }]), []);
  assert.deepEqual(segments(null, []), []);
  assert.deepEqual(segments(42, []), []);
});

test('one span splits the text into plain, marked, plain, and the pieces join back to the raw text', () => {
  const s = segments(RAW, [{ ...at('BKN004'), level: 'below' }]);
  assert.deepEqual(s.map((x) => x.level), [null, 'below', null]);
  assert.equal(s[1].text, 'BKN004');
  assert.equal(join(s), RAW);
});

test('a span at the very start and one at the very end leave no empty pieces', () => {
  const s = segments(RAW, [{ start: 0, end: 4, level: 'caution' }, { start: RAW.length - 5, end: RAW.length, level: 'at-limit' }]);
  assert.deepEqual(s.map((x) => x.level), ['caution', null, 'at-limit']);
  assert.ok(s.every((x) => x.text.length > 0));
  assert.equal(join(s), RAW);
});

test('two separate spans mark two pieces', () => {
  const s = segments(RAW, [{ ...at('2SM'), level: 'below' }, { ...at('BKN004'), level: 'below' }]);
  assert.deepEqual(s.filter((x) => x.level).map((x) => x.text), ['2SM', 'BKN004']);
  assert.equal(join(s), RAW);
});

test('touching spans of the same level become one mark', () => {
  const s = segments('ABCDEF', [{ start: 0, end: 3, level: 'below' }, { start: 3, end: 6, level: 'below' }]);
  assert.deepEqual(s, [{ text: 'ABCDEF', level: 'below' }]);
});

test('touching spans of different levels stay two marks', () => {
  const s = segments('ABCDEF', [{ start: 0, end: 3, level: 'below' }, { start: 3, end: 6, level: 'caution' }]);
  assert.deepEqual(s, [{ text: 'ABC', level: 'below' }, { text: 'DEF', level: 'caution' }]);
});

test('overlapping spans of the same level merge', () => {
  const s = segments('ABCDEFGH', [{ start: 1, end: 5, level: 'caution' }, { start: 3, end: 7, level: 'caution' }]);
  assert.deepEqual(s, [{ text: 'A', level: null }, { text: 'BCDEFG', level: 'caution' }, { text: 'H', level: null }]);
});

test('where spans of different levels overlap, the worse level wins the shared characters', () => {
  const s = segments('ABCDEFGH', [{ start: 0, end: 5, level: 'caution' }, { start: 3, end: 8, level: 'below' }]);
  assert.deepEqual(s, [{ text: 'ABC', level: 'caution' }, { text: 'DEFGH', level: 'below' }]);
  const t = segments('ABCD', [{ start: 0, end: 4, level: 'at-limit' }, { start: 1, end: 2, level: 'below' }, { start: 2, end: 3, level: 'caution' }]);
  assert.deepEqual(t, [{ text: 'A', level: 'at-limit' }, { text: 'B', level: 'below' }, { text: 'CD', level: 'at-limit' }]);
});

test('a span past the end is clamped, one before the start is clamped, one wholly outside is ignored', () => {
  assert.deepEqual(segments('ABCD', [{ start: 2, end: 99, level: 'below' }]), [{ text: 'AB', level: null }, { text: 'CD', level: 'below' }]);
  assert.deepEqual(segments('ABCD', [{ start: -5, end: 2, level: 'below' }]), [{ text: 'AB', level: 'below' }, { text: 'CD', level: null }]);
  assert.deepEqual(segments('ABCD', [{ start: 10, end: 20, level: 'below' }]), [{ text: 'ABCD', level: null }]);
  assert.deepEqual(segments('ABCD', [{ start: -9, end: -1, level: 'below' }]), [{ text: 'ABCD', level: null }]);
});

test('null, empty, reversed, non-number and unknown-level spans are ignored', () => {
  const bad = [null, undefined, {}, [], 'x', 7, { start: 2, end: 2, level: 'below' }, { start: 3, end: 1, level: 'below' },
    { start: '0', end: '2', level: 'below' }, { start: NaN, end: 2, level: 'below' }, { start: 0, end: Infinity, level: 'below' },
    { start: 0, end: 2, level: 'purple' }, { start: 0, end: 2 }, { start: 0, end: 2, level: '__proto__' }, { start: 0.5, end: 2, level: 'below' }];
  assert.deepEqual(segments('ABCD', bad), [{ text: 'ABCD', level: null }]);
});

test('a list that is not a list, or a huge one, does not throw', () => {
  assert.deepEqual(segments('ABCD', 'below'), [{ text: 'ABCD', level: null }]);
  assert.deepEqual(segments('ABCD', { start: 0, end: 2, level: 'below' }), [{ text: 'ABCD', level: null }]);
  const many = Array.from({ length: 5000 }, (_, i) => ({ start: i % 4, end: (i % 4) + 1, level: 'caution' }));
  assert.equal(join(segments('ABCD', many)), 'ABCD');
});

test('hostile report text stays plain text in the pieces, and nothing is added to it', () => {
  const hostile = 'CYQR <script>alert(1)</script> "><img src=x onerror=alert(2)> BKN004';
  const start = hostile.indexOf('<script>');
  const s = segments(hostile, [{ start, end: start + 8, level: 'below' }, { start: hostile.length - 6, end: hostile.length, level: 'caution' }]);
  assert.equal(join(s), hostile);
  assert.equal(s.find((x) => x.level === 'below').text, '<script>');
  assert.ok(s.every((x) => typeof x.text === 'string' && ['below', 'at-limit', 'caution', null].includes(x.level)));
});

test('a span whose getter throws is ignored, not thrown', () => {
  const evil = { get start() { throw new Error('boom'); }, end: 3, level: 'below' };
  assert.deepEqual(segments('ABCD', [evil]), [{ text: 'ABCD', level: null }]);
});

test('a span that cuts a surrogate pair in half still joins back to the same text', () => {
  const raw = 'A\u{1F600}B';
  assert.equal(join(segments(raw, [{ start: 2, end: 3, level: 'below' }])), raw);
});

test('markedWords: only the marked pieces, in order', () => {
  assert.deepEqual(markedWords(RAW, [{ ...at('2SM'), level: 'below' }, { ...at('BKN004'), level: 'caution' }]),
    [{ text: '2SM', level: 'below' }, { text: 'BKN004', level: 'caution' }]);
  assert.deepEqual(markedWords(RAW, []), []);
});

test('LEVEL_WORDS says every level in words', () => {
  assert.deepEqual(Object.keys(LEVEL_WORDS).sort(), ['at-limit', 'below', 'caution']);
  assert.match(LEVEL_WORDS.below, /below limits/i);
});

test('alignMarks: kept when the shown text is wx\'s text, shifted for leading space, dropped when it differs', () => {
  const marks = [{ start: 5, end: 9, level: 'below' }];
  assert.deepEqual(alignMarks(marks, 'CYQR 291800Z', 'CYQR 291800Z'), marks);
  assert.deepEqual(alignMarks(marks, '  CYQR 291800Z', 'CYQR 291800Z'), [{ start: 7, end: 11, level: 'below' }]);
  assert.deepEqual(alignMarks(marks, 'something else', 'CYQR 291800Z'), []);
  assert.deepEqual(alignMarks(marks, null, 'CYQR'), []);
  assert.deepEqual(alignMarks(marks, 'CYQR', ''), []);
});

test('marksOfCheck: real wx answer, spans point at the words behind each limit', () => {
  const report = parseMetar('CYQR 291800Z 26005KT 2SM BR BKN004 10/08 A2995', { now: NOW });
  const marks = marksOfCheck(checkOptions(report.conditions, [{ ceilingFt: 600, visSm: 3 }]));
  const words = marks.map((m) => [report.raw.slice(m.start, m.end), m.level]).sort();
  assert.deepEqual(words, [['2SM', 'below'], ['BKN004', 'below']]);
});

test('marksOfCheck: at the limit and cautions have their own levels; nothing usable gives none', () => {
  const report = parseMetar('CYQR 291800Z 26005KT 3SM VCTS BKN020 10/08 A2995', { now: NOW });
  const marks = marksOfCheck(checkOptions(report.conditions, [{ ceilingFt: 2000, visSm: 3 }]));
  const words = marks.map((m) => [report.raw.slice(m.start, m.end), m.level]);
  assert.ok(words.some(([w, l]) => w === 'VCTS' && l === 'caution'), JSON.stringify(words));
  assert.ok(words.some(([w, l]) => w === 'BKN020' && l === 'at-limit'), JSON.stringify(words));
  assert.ok(words.some(([w, l]) => w === '3SM' && l === 'at-limit'), JSON.stringify(words));
  assert.deepEqual(marksOfCheck(null), []);
  assert.deepEqual(marksOfCheck({ reasons: ['CEILING 1 FT < 2 FT'] }), []);
  assert.deepEqual(marksOfCheck({ reasons: ['CEILING 1 FT < 2 FT'], reasonSpans: [null] }), []);
});
