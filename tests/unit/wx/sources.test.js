import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SOURCES, readMetNo, readDatamask, validStation, fetchReports, staleness, startRefresh,
} from '../../../src/wx/sources.js';
import { parseMetar } from '../../../src/wx/metar.js';
import { parseTaf } from '../../../src/wx/taf.js';

// Verbatim responses captured 2026-09-30 about 01:51Z (tests/fixtures/wx).
const fixture = (name) => readFileSync(new URL(`../../fixtures/wx/${name}`, import.meta.url), 'utf8');
const METNO_METAR = fixture('metno-metar-CYMJ-CYQR-CYYN.txt');
const METNO_TAF = fixture('metno-taf-CYMJ-CYQR-CYYN.txt');
const METNO_PARTIAL = fixture('metno-metar-CYMJ-plus-unknown-CZZZ.txt');
const DM_METAR_CYQR = fixture('datamask-metar-CYQR.json');
const DM_TAF_CYMJ = fixture('datamask-taf-CYMJ.json');
const DM_NOT_FOUND = fixture('datamask-metar-unknown-CZZZ.json');
const NOW = new Date('2026-09-30T01:51:00Z');

/** A fake fetch: routes maps a URL to { status, body } or an Error to throw. */
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, options) => {
    calls.push({ url, options });
    const r = routes[url];
    if (r instanceof Error) throw r;
    if (!r) return response(404, '{"error":"not_found"}');
    return response(r.status ?? 200, r.body);
  };
  fn.calls = calls;
  return fn;
}
const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
  json: async () => JSON.parse(body),
});
const metnoUrl = (kind, ids) => `https://api.met.no/weatherapi/tafmetar/1.0/${kind}?icao=${ids.join(',')}`;
const dmUrl = (kind, id) => `https://datamask.org/api/v1/${kind}/${id}`;

test('MET Norway: the newest report per station, without the trailing =', () => {
  const m = readMetNo(METNO_METAR);
  assert.deepEqual([...m.keys()].sort(), ['CYMJ', 'CYQR', 'CYYN']);
  assert.match(m.get('CYMJ'), /^CYMJ 300027Z .* SLP024$/);
  assert.match(m.get('CYYN'), /^CYYN 300100Z /);
  assert.equal(readMetNo('').size, 0);
  assert.equal(readMetNo('\n\n').size, 0);
  assert.deepEqual([...readMetNo(METNO_PARTIAL).keys()], ['CYMJ']);
});

test('MET Norway TAFs parse without a TAF prefix; the 0030Z cancellation is the newest CYMJ TAF', () => {
  const t = readMetNo(METNO_TAF);
  assert.match(t.get('CYMJ'), /^CYMJ 300030Z 3000\/3012 CNL/);
  assert.equal(parseTaf(t.get('CYMJ'), { now: NOW }).cancelled, true);
  const qr = parseTaf(t.get('CYQR'), { now: NOW });
  assert.equal(qr.station, 'CYQR');
  assert.ok(qr.validTo > NOW);
});

test('Datamask: only raw is used; 404 and bad bodies give nothing', () => {
  assert.match(readDatamask(200, JSON.parse(DM_METAR_CYQR)), /^CYQR 300100Z /);
  assert.match(readDatamask(200, JSON.parse(DM_TAF_CYMJ)), /^TAF AMD TAF AMD CYMJ 300030Z/);
  assert.equal(readDatamask(404, JSON.parse(DM_NOT_FOUND)), null);
  assert.equal(readDatamask(200, null), null);
  assert.equal(readDatamask(200, { raw: 42 }), null);
  assert.equal(readDatamask(200, { raw: '   ' }), null);
});

test('station ids must be four letters or digits before they go in a URL', () => {
  for (const ok of ['CYMJ', 'cyqr', 'K1G4']) assert.equal(validStation(ok), true, ok);
  for (const bad of ['CYM', 'CYMJX', 'CY/J', 'CYMJ&x=1', '', null, 42]) assert.equal(validStation(bad), false, String(bad));
  assert.equal(SOURCES.metno.url('metar', ['CYMJ', 'CYQR']), metnoUrl('metar', ['CYMJ', 'CYQR']));
  assert.equal(SOURCES.datamask.url('taf', 'CYQR'), dmUrl('taf', 'CYQR'));
});

test('fetchReports asks MET Norway once for every airfield, as a plain no-cache GET', async () => {
  const fetch = fakeFetch({ [metnoUrl('metar', ['CYMJ', 'CYQR', 'CYYN'])]: { body: METNO_METAR } });
  const r = await fetchReports('metar', ['cymj', 'CYQR', 'CYYN'], { fetch, now: NOW });
  assert.equal(fetch.calls.length, 1);
  const opts = fetch.calls[0].options;
  assert.equal(opts.cache, 'no-cache');
  assert.equal(opts.headers, undefined);
  assert.equal(opts.method ?? 'GET', 'GET');
  assert.equal(r.reports.CYMJ.source, 'metno');
  assert.equal(r.reports.CYMJ.report.station, 'CYMJ');
  // CYMJ's last obs was 0027Z, 84 minutes before NOW (the field closes overnight).
  assert.equal(r.reports.CYMJ.status, 'stale');
  assert.equal(r.reports.CYYN.status, 'fresh');
  assert.deepEqual(r.errors, []);
});

test('an airfield MET Norway has nothing for is asked of Datamask', async () => {
  const fetch = fakeFetch({
    [metnoUrl('metar', ['CYMJ', 'CYQR'])]: { body: METNO_PARTIAL },
    [dmUrl('metar', 'CYQR')]: { body: DM_METAR_CYQR },
  });
  const r = await fetchReports('metar', ['CYMJ', 'CYQR'], { fetch, now: NOW });
  assert.equal(r.reports.CYMJ.source, 'metno');
  assert.equal(r.reports.CYQR.source, 'datamask');
  assert.deepEqual(fetch.calls.map((c) => c.url), [metnoUrl('metar', ['CYMJ', 'CYQR']), dmUrl('metar', 'CYQR')]);
});

test('when MET Norway fails, every airfield comes from Datamask and the error is reported', async () => {
  const fetch = fakeFetch({
    [metnoUrl('taf', ['CYMJ'])]: new TypeError('Failed to fetch'),
    [dmUrl('taf', 'CYMJ')]: { body: DM_TAF_CYMJ },
  });
  const r = await fetchReports('taf', ['CYMJ'], { fetch, now: NOW });
  assert.equal(r.reports.CYMJ.source, 'datamask');
  assert.equal(r.reports.CYMJ.report.cancelled, true);
  assert.equal(r.reports.CYMJ.status, 'cancelled');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].source, 'metno');
  const http = await fetchReports('taf', ['CYMJ'], {
    fetch: fakeFetch({ [metnoUrl('taf', ['CYMJ'])]: { status: 503, body: 'busy' }, [dmUrl('taf', 'CYMJ')]: { body: DM_TAF_CYMJ } }),
    now: NOW,
  });
  assert.match(http.errors[0].message, /503/);
});

test('an airfield neither source has is missing, not an error; bad ids are refused without a request', async () => {
  const fetch = fakeFetch({ [metnoUrl('metar', ['CZZZ'])]: { body: '' } });
  const r = await fetchReports('metar', ['CZZZ', 'BAD/ID'], { fetch, now: NOW });
  assert.deepEqual(r.reports, {});
  assert.deepEqual(r.missing, ['CZZZ']);
  assert.deepEqual(r.refused, ['BAD/ID']);
  assert.ok(fetch.calls.every((c) => !c.url.includes('BAD')));
  assert.deepEqual(r.errors, []);
});

test('fetchReports never throws, even when fetch or a body does', async () => {
  const broken = async () => ({ ok: true, status: 200, text: async () => { throw new Error('boom'); }, json: async () => { throw new SyntaxError('bad json'); } });
  const r = await fetchReports('metar', ['CYMJ'], { fetch: broken, now: NOW });
  assert.deepEqual(r.reports, {});
  assert.equal(r.errors.length, 2);
  assert.deepEqual((await fetchReports('metar', ['CYMJ'], { now: NOW, fetch: null })).errors.length, 1);
});

test('stale: a METAR over 75 minutes old by its own time; the fetch time never counts', () => {
  const metar = (raw) => parseMetar(raw, { now: NOW });
  assert.equal(staleness('metar', metar('CYQR 300100Z 29009KT 15SM FEW100 13/04 A2958'), NOW), 'fresh');
  assert.equal(staleness('metar', metar('CYQR 300036Z 29009KT 15SM FEW100 13/04 A2958'), NOW), 'fresh');
  assert.equal(staleness('metar', metar('CYQR 300035Z 29009KT 15SM FEW100 13/04 A2958'), NOW), 'stale');
  // Datamask served KISN from the 18th as current.
  assert.equal(staleness('metar', metar('KISN 181856Z 21010KT 10SM CLR 15/05 A3001'), NOW), 'stale');
  assert.equal(staleness('metar', metar('garbage'), NOW), 'stale');
  assert.equal(staleness('metar', null, NOW), 'stale');
});

test('stale: a TAF past its valid period; cancelled reads as cancelled', () => {
  const taf = (raw) => parseTaf(raw, { now: NOW });
  assert.equal(staleness('taf', taf('CYQR 292340Z 3000/3024 27010KT P6SM SKC'), NOW), 'fresh');
  assert.equal(staleness('taf', taf('CYQR 291140Z 2912/3000 27010KT P6SM SKC'), NOW), 'stale');
  assert.equal(staleness('taf', taf('CYMJ 300030Z 3000/3012 CNL'), NOW), 'cancelled');
  assert.equal(staleness('taf', taf('nonsense'), NOW), 'stale');
});

test('refresh: every 5 minutes by default, keeping the last good report when a refresh fails', async () => {
  const pending = [];
  const timers = { setTimeout: (fn, ms) => { pending.push({ fn, ms }); return pending.length; }, clearTimeout: (id) => { pending[id - 1] = null; } };
  let online = true;
  const fetch = async (url) => {
    if (!online) throw new TypeError('Failed to fetch');
    return response(200, url.includes('/metar') ? METNO_METAR : METNO_TAF);
  };
  const updates = [];
  const r = startRefresh({ stations: ['CYMJ', 'CYQR'], fetch, timers, now: () => NOW, onUpdate: (u) => updates.push(u) });
  await r.ready;
  assert.equal(updates.length, 1);
  assert.equal(updates[0].metar.CYMJ.source, 'metno');
  assert.equal(updates[0].taf.CYMJ.status, 'cancelled');
  assert.equal(pending.at(-1).ms, 5 * 60 * 1000);

  online = false;
  await pending.at(-1).fn();
  assert.equal(updates.length, 2);
  assert.equal(updates[1].metar.CYMJ.raw, updates[0].metar.CYMJ.raw);
  assert.ok(updates[1].errors.length > 0);

  r.stop();
  assert.equal(pending.at(-1), null);
});

test('refresh: the interval is a setting; a bad value falls back to 5 minutes', async () => {
  const seen = [];
  const timers = { setTimeout: (fn, ms) => { seen.push(ms); return 1; }, clearTimeout: () => {} };
  const fetch = async () => response(200, '');
  await startRefresh({ stations: ['CYMJ'], fetch, timers, everyMs: 120000, onUpdate() {} }).ready;
  await startRefresh({ stations: ['CYMJ'], fetch, timers, everyMs: -5, onUpdate() {} }).ready;
  assert.deepEqual(seen, [120000, 300000]);
});

// Hardening (security-and-hardening skill): feed replies are untrusted input.
test('hardening: a report for a different station than asked is ignored', async () => {
  const wrong = JSON.stringify({ raw: 'CYYN 300100Z 27010KT 15SM SKC 10/02 A2990' });
  const r = await fetchReports('metar', ['CYQR'], {
    fetch: fakeFetch({ [metnoUrl('metar', ['CYQR'])]: { body: '' }, [dmUrl('metar', 'CYQR')]: { body: wrong } }),
    now: NOW,
  });
  assert.deepEqual(r.reports, {});
  assert.deepEqual(r.missing, ['CYQR']);
  assert.match(r.errors[0].message, /CYYN/);
});

test('hardening: an oversized reply or report is refused, not parsed', async () => {
  const huge = 'CYMJ 300000Z 28008KT 15SM FEW160 18/04 A2957=\n'.repeat(20000);
  const r = await fetchReports('metar', ['CYMJ'], {
    fetch: fakeFetch({ [metnoUrl('metar', ['CYMJ'])]: { body: huge } }),
    now: NOW,
  });
  assert.deepEqual(r.reports, {});
  assert.match(r.errors[0].message, /too large/);
  const long = readMetNo(`CYMJ 300000Z ${'X '.repeat(3000)}=`);
  assert.equal(long.size, 0);
});

test('hardening: only metar or taf reach a URL, and at most 30 airfields per call', async () => {
  const fetch = fakeFetch({});
  const bad = await fetchReports('../admin', ['CYMJ'], { fetch, now: NOW });
  assert.equal(fetch.calls.length, 0);
  assert.match(bad.errors[0].message, /kind/);
  const many = Array.from({ length: 35 }, (_, i) => `C${String(i).padStart(3, '0')}`);
  const r = await fetchReports('metar', many, { fetch: fakeFetch({}), now: NOW });
  assert.equal(r.refused.length, 5);
});

test('hardening: requests send no cookies, and refresh never runs faster than once a minute', async () => {
  const fetch = fakeFetch({ [metnoUrl('metar', ['CYMJ'])]: { body: '' } });
  await fetchReports('metar', ['CYMJ'], { fetch, now: NOW });
  assert.equal(fetch.calls[0].options.credentials, 'omit');
  const seen = [];
  const timers = { setTimeout: (fn, ms) => { seen.push(ms); return 1; }, clearTimeout: () => {} };
  await startRefresh({ stations: ['CYMJ'], fetch: async () => response(200, ''), timers, everyMs: 1000, onUpdate() {} }).ready;
  assert.deepEqual(seen, [60000]);
});
