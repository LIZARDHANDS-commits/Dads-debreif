// The METAR line on the replay (SPEC-debrief: Weather at the time of the
// flight): the archive address, reading its reply, and the line at a moment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { metarArchiveUrl, readArchive, metarLineAt, MAX_REPLY_CHARS } from '../../../src/modules/debrief/weather/metar.js';

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
