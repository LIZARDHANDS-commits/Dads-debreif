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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, DEFAULT_HOME, DEFAULT_ALTERNATES } from '../../../src/airfields/catalog.js';
import { greatCircleNm } from '../../../src/airfields/distance.js';

test("the built-in list is V6's 15 airfields (sof.html line 563), in V6's order", () => {
  assert.deepEqual(Object.keys(CATALOG), [
    'CYMJ', 'CYQR', 'CYYN', 'CYXE', 'CYQV', 'KGGW', 'KISN', 'CYPA', 'CYQW', 'KMIB', 'CYXH', 'KMOT', 'CYBR', 'CYQL', 'KGTF',
  ]);
  assert.deepEqual(
    [CATALOG.CYMJ.name, CATALOG.CYMJ.lat, CATALOG.CYMJ.lon],
    ['Moose Jaw', 50.3303, -105.559],
  );
});

test('every built-in airfield has a time zone the runtime knows', () => {
  for (const [icao, field] of Object.entries(CATALOG)) {
    assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', { timeZone: field.timeZone }), icao);
  }
  assert.equal(CATALOG.CYMJ.timeZone, 'America/Regina');
  assert.equal(CATALOG.CYXH.timeZone, 'America/Edmonton');
});

test("CYMJ carries V6's field elevation, 1,892 ft (shell.html line 737); others are unknown", () => {
  assert.equal(CATALOG.CYMJ.elevationFt, 1892);
  assert.equal(CATALOG.CYQR.elevationFt, null);
});

test("defaults are V6's WX SETUP: home CYMJ, alternates CYQR, CYYN, CYXE", () => {
  assert.equal(DEFAULT_HOME, 'CYMJ');
  assert.deepEqual(DEFAULT_ALTERNATES, ['CYQR', 'CYYN', 'CYXE']);
});

test('the built-in list cannot be changed by a caller', () => {
  assert.throws(() => { CATALOG.CYMJ.lat = 0; });
});

test('D73: from CYMJ, CYQR 35 NM, CYYN 82 NM, CYXE 119 NM (research note), so only CYXE clears 100 NM', () => {
  const nm = (icao) => greatCircleNm(CATALOG.CYMJ, CATALOG[icao]);
  assert.ok(Math.abs(nm('CYQR') - 35) < 1, `CYQR ${nm('CYQR')}`);
  assert.ok(Math.abs(nm('CYYN') - 82) < 1, `CYYN ${nm('CYYN')}`);
  assert.ok(Math.abs(nm('CYXE') - 119) < 1, `CYXE ${nm('CYXE')}`);
});

test('distance is rounded to 0.1 NM, the same both ways, and zero to itself', () => {
  const d = greatCircleNm(CATALOG.CYMJ, CATALOG.CYXE);
  assert.equal(d, Math.round(d * 10) / 10);
  assert.equal(d, greatCircleNm(CATALOG.CYXE, CATALOG.CYMJ));
  assert.equal(greatCircleNm(CATALOG.CYMJ, CATALOG.CYMJ), 0);
});

test('a missing or unreadable position gives null, never a guess', () => {
  assert.equal(greatCircleNm(CATALOG.CYMJ, { lat: null, lon: null }), null);
  assert.equal(greatCircleNm(null, CATALOG.CYMJ), null);
  assert.equal(greatCircleNm({ lat: 'x', lon: 1 }, CATALOG.CYMJ), null);
});
