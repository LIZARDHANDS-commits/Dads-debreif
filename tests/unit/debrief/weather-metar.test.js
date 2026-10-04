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

// The METAR line on the replay (SPEC-debrief: Weather at the time of the
// flight): the archive address, reading its reply, and the line at a moment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { metarArchiveUrl, speciArchiveUrl, markSpecials, readArchive, metarLineAt, MAX_REPLY_CHARS } from '../../../src/modules/debrief/weather/metar.js';

const at = (iso) => Date.parse(iso) / 1000;
const REPLY = [
  'station,valid,metar',
  'CYMJ,2026-09-30 13:00,CYMJ 301300Z 27012G20KT 15SM FEW040 BKN120 12/04 A2992 RMK CU1AC4',
  'CYMJ,2026-09-30 14:00,CYMJ 301400Z 28015KT 3SM -SHRA BKN025 OVC080 10/07 A2990',
  'CYMJ,2026-09-30 14:22,SPECI CYMJ 301422Z 28018KT 1 1/2SM +SHRA OVC008 09/08 A2991',
  'CYMJ,2026-09-30 15:00,M',
  'not a report line',
].join('\n');

test('the archive address: one checked station, two hours before the start to the end', () => {
  const url = new URL(metarArchiveUrl('CYMJ', at('2026-09-30T14:10:30Z'), at('2026-09-30T15:05:00Z')));
  assert.equal(url.origin + url.pathname, 'https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py');
  assert.equal(url.searchParams.get('station'), 'CYMJ');
  assert.equal(url.searchParams.get('sts'), '2026-09-30T12:10Z');
  assert.equal(url.searchParams.get('ets'), '2026-09-30T15:06Z');
  assert.deepEqual(url.searchParams.getAll('report_type'), ['3', '4']);
  assert.throws(() => metarArchiveUrl('CYMJ&x=1', 0, 1));
  assert.throws(() => metarArchiveUrl('cymj', 0, 1));
  assert.throws(() => metarArchiveUrl('CYMJ', NaN, 1));
});

test('the reply: reports in time order, SPECIs marked, unreadable lines skipped', () => {
  const reports = readArchive(REPLY);
  assert.equal(reports.length, 3);
  assert.deepEqual(reports.map((r) => r.type), ['METAR', 'METAR', 'SPECI']);
  assert.equal(reports[1].t, at('2026-09-30T14:00:00Z'));
  assert.equal(reports[1].report.station, 'CYMJ');
  assert.equal(reports[1].report.ceilingFt, 2500);
  assert.equal(reports[1].report.time.getTime(), at('2026-09-30T14:00:00Z') * 1000);
  assert.deepEqual(readArchive('x'.repeat(MAX_REPLY_CHARS + 1)), []);
  assert.deepEqual(readArchive(null), []);
});

test('the line at a moment: the report in force, decoded, with its age', () => {
  const reports = readArchive(REPLY);
  const line = metarLineAt(reports, at('2026-09-30T14:12:00Z'), 'CYMJ');
  assert.equal(line.text, 'CYMJ 1400Z (12 min before) · MVFR · wind 280/15 kt · vis 3 SM · -SHRA · BKN025 OVC080 · 10/07 · A2990');
  assert.equal(line.category, 'MVFR');
  assert.match(line.raw, /^CYMJ 301400Z/);
  // A SPECI takes over from its own time, never before.
  assert.match(metarLineAt(reports, at('2026-09-30T14:21:59Z'), 'CYMJ').text, /^CYMJ 1400Z/);
  const speci = metarLineAt(reports, at('2026-09-30T14:22:00Z'), 'CYMJ');
  assert.equal(speci.text, 'SPECI CYMJ 1422Z (at this moment) · IFR · wind 280/18 kt · vis 1 1/2 SM · +SHRA · OVC008 · 09/08 · A2991');
  assert.match(metarLineAt(reports, at('2026-09-30T13:30:00Z'), 'CYMJ').text, /gusting 20 kt/);
});

test('no report in force: said plainly, never a later one', () => {
  const reports = readArchive(REPLY);
  assert.deepEqual(metarLineAt(reports, at('2026-09-30T12:59:00Z'), 'CYMJ'), {
    text: 'CYMJ: no report in the two hours before this moment.', raw: '', category: null,
  });
  assert.equal(metarLineAt(reports, at('2026-09-30T16:30:00Z'), 'CYMJ').raw, '');
  assert.equal(metarLineAt([], 0, 'CYQR').text, 'CYQR: no report in the two hours before this moment.');
});

test('the specials address: the same station and dates, report_type 4 alone', () => {
  const full = new URL(metarArchiveUrl('CYMJ', at('2026-09-30T14:10:30Z'), at('2026-09-30T15:05:00Z')));
  const specials = new URL(speciArchiveUrl('CYMJ', at('2026-09-30T14:10:30Z'), at('2026-09-30T15:05:00Z')));
  assert.equal(specials.origin + specials.pathname, full.origin + full.pathname);
  assert.deepEqual(specials.searchParams.getAll('report_type'), ['4']);
  for (const key of ['station', 'sts', 'ets', 'tz', 'format', 'data']) assert.equal(specials.searchParams.get(key), full.searchParams.get(key), key);
  assert.throws(() => speciArchiveUrl('CYMJ&x=1', 0, 1));
  assert.throws(() => speciArchiveUrl('CYMJ', 0, NaN));
});

// IEM's text column often has no SPECI prefix: the two lists differ only by which call listed a report.
const PLAIN = [
  'station,valid,metar',
  'CYMJ,2026-09-30 14:00,CYMJ 301400Z 28015KT 3SM -SHRA BKN025 OVC080 10/07 A2990',
  'CYMJ,2026-09-30 14:32,CYMJ 301432Z 28018KT 1 1/2SM +SHRA OVC008 09/08 A2991',
].join('\n');
const SPECIALS = 'station,valid,metar\nCYMJ,2026-09-30 14:32,CYMJ 301432Z 28018KT 1 1/2SM +SHRA OVC008 09/08 A2991\n';

test('specials mark the full list by station, valid time and raw text', () => {
  const full = readArchive(PLAIN);
  assert.deepEqual(full.map((r) => r.type), ['METAR', 'METAR']);
  assert.equal(full[0].station, 'CYMJ');
  const marked = markSpecials(full, readArchive(SPECIALS));
  assert.deepEqual(marked.map((r) => r.type), ['METAR', 'SPECI']);
  assert.equal(marked[1].t, at('2026-09-30T14:32:00Z'));
  assert.deepEqual(full.map((r) => r.type), ['METAR', 'METAR'], 'the list it was given is not changed');
  assert.match(metarLineAt(marked, at('2026-09-30T14:40:00Z'), 'CYMJ').text, /^SPECI CYMJ 1432Z /);
  assert.match(metarLineAt(marked, at('2026-09-30T14:20:00Z'), 'CYMJ').text, /^CYMJ 1400Z /);
});

test('a special that matches only on time, or on the station, marks nothing', () => {
  const full = readArchive(PLAIN);
  const otherText = readArchive(SPECIALS.replace('1 1/2SM', '1SM'));
  assert.deepEqual(markSpecials(full, otherText).map((r) => r.type), ['METAR', 'METAR']);
  const otherTime = readArchive(SPECIALS.replace('14:32,', '14:33,'));
  assert.deepEqual(markSpecials(full, otherTime).map((r) => r.type), ['METAR', 'METAR']);
  const otherStation = readArchive(SPECIALS.replace('CYMJ,2026', 'CYQR,2026'));
  assert.deepEqual(markSpecials(full, otherStation).map((r) => r.type), ['METAR', 'METAR']);
  assert.deepEqual(markSpecials(full, []).map((r) => r.type), ['METAR', 'METAR']);
});

test('a report already known as a SPECI stays one, and whitespace in the raw text does not break a match', () => {
  const full = readArchive(REPLY);
  assert.deepEqual(markSpecials(full, []).map((r) => r.type), ['METAR', 'METAR', 'SPECI']);
  const spaced = readArchive(SPECIALS.replace('28018KT 1', '28018KT  1'));
  assert.deepEqual(markSpecials(readArchive(PLAIN), spaced).map((r) => r.type), ['METAR', 'SPECI']);
});
