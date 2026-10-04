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

// Tests for src/modules/sof/reports-store.js: the last good reports kept in the
// browser, and read back checked (SPEC-sof, "Security": stored data is checked
// for shape and range when read back).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetar } from '../../../src/wx/metar.js';
import { parseTaf } from '../../../src/wx/taf.js';
import { createStore } from '../../../src/storage/store.js';
import { packReports, readReports, REPORTS_KEY, MAX_KEEP_MS } from '../../../src/modules/sof/reports-store.js';
import { METAR, HOME_TAF } from '../../fixtures/sof/reports.js';

const AT = new Date('2026-09-29T18:36:00Z');
const NOW = new Date('2026-09-29T18:42:00Z');
const entry = (kind, raw, source = 'metno') => ({
  raw,
  report: kind === 'taf' ? parseTaf(raw, { now: AT }) : parseMetar(raw, { now: AT }),
  source,
});
const held = () => ({
  metar: new Map([['CYMJ', { entry: entry('metar', METAR.fresh), at: AT }]]),
  taf: new Map([['CYMJ', { entry: entry('taf', HOME_TAF.good, 'datamask'), at: AT }]]),
});
const good = (extra = {}) => ({ raw: METAR.fresh, source: 'metno', at: '2026-09-29T18:36:00Z', ...extra });

test('what is kept holds only the raw text, where it came from and when it was fetched', () => {
  assert.deepEqual(packReports(held()), {
    v: 1,
    metar: { CYMJ: { raw: METAR.fresh, source: 'metno', at: '2026-09-29T18:36:00.000Z' } },
    taf: { CYMJ: { raw: HOME_TAF.good, source: 'datamask', at: '2026-09-29T18:36:00.000Z' } },
  });
});

test('reports come back parsed, as fetchReports gives them, with the time they were fetched', () => {
  const back = readReports(JSON.parse(JSON.stringify(packReports(held()))), { now: NOW });
  const m = back.metar.get('CYMJ');
  assert.equal(m.entry.raw, METAR.fresh);
  assert.equal(m.entry.source, 'metno');
  assert.equal(m.entry.report.station, 'CYMJ');
  assert.equal(+m.at, +AT);
  assert.equal(back.taf.get('CYMJ').entry.report.station, 'CYMJ');
  assert.equal(back.taf.get('CYMJ').entry.source, 'datamask');
});

test('a report is read with the day it was fetched on, so it keeps its own date whenever it is read', () => {
  const back = readReports(packReports(held()), { now: new Date(+AT + 40 * 24 * 3_600_000) });
  assert.equal(back.metar.size, 0, 'too old to keep');
  const soon = readReports(packReports(held()), { now: new Date(+AT + 2 * 3_600_000) });
  assert.equal(soon.metar.get('CYMJ').entry.report.time.toISOString(), '2026-09-29T18:00:00.000Z');
});

test('nothing stored, or something that is not an object, gives an empty result', () => {
  for (const saved of [undefined, null, 5, 'text', [], { v: 2 }, { v: 1 }]) {
    const back = readReports(saved, { now: NOW });
    assert.equal(back.metar.size, 0);
    assert.equal(back.taf.size, 0);
  }
});

test('bad entries are dropped one by one and good ones stay', () => {
  const back = readReports({
    v: 1,
    metar: {
      CYMJ: good(),
      'not a station': good(),
      CYQR: good({ raw: 42 }),
      CYYN: good({ source: 'evil.example' }),
      CYXE: good({ at: 'yesterday' }),
      CYQV: good({ raw: 'x'.repeat(5000) }),
      CYPA: null,
    },
  }, { now: NOW });
  assert.deepEqual([...back.metar.keys()], ['CYMJ']);
});

test('a report kept under the wrong airfield is dropped', () => {
  const back = readReports({ v: 1, metar: { CYQR: good() } }, { now: NOW });
  assert.equal(back.metar.size, 0);
});

test('a time in the future, or more than three days old, is dropped', () => {
  const at = (ms) => new Date(+NOW + ms).toISOString();
  const kept = (when) => readReports({ v: 1, metar: { CYMJ: good({ at: when }) } }, { now: NOW }).metar.size;
  assert.equal(kept(at(60 * 60_000)), 0, 'an hour ahead of the clock');
  assert.equal(kept(at(-MAX_KEEP_MS - 60_000)), 0, 'too old');
  assert.equal(kept(at(-MAX_KEEP_MS + 60_000)), 1, 'just inside');
  assert.equal(kept(at(2 * 60_000)), 1, 'a couple of minutes ahead is clock skew');
});

test('a hostile object with prototype keys or too many stations cannot get in', () => {
  const back = readReports(JSON.parse(`{"v":1,"metar":{"__proto__":${JSON.stringify(good())}}}`), { now: NOW });
  assert.equal(back.metar.size, 0);
  assert.equal(({}).raw, undefined);
  const many = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`CY${String(i).padStart(2, '0')}`, good()]));
  assert.ok(readReports({ v: 1, metar: many }, { now: NOW }).metar.size <= 30);
});

test('through the module storage: saved, read back, and gone after remove', () => {
  const store = createStore(null).scope('sof');
  store.set(REPORTS_KEY, packReports(held()));
  const back = readReports(store.get(REPORTS_KEY, null), { now: NOW });
  assert.equal(back.metar.get('CYMJ').entry.raw, METAR.fresh);
  store.remove(REPORTS_KEY);
  assert.equal(readReports(store.get(REPORTS_KEY, null), { now: NOW }).metar.size, 0);
});
