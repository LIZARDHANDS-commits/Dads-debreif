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

// The example flight (D22, R5): V6's four tracks with their nicknames,
// fetched only when asked for.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXAMPLE_FLIGHT, loadExampleFlight } from '../../../src/flight-data/examples.js';

const fromRepo = async asset => readFileSync(new URL(`../../../original/assets/${asset}`, import.meta.url), 'utf8');

test('the example flight is V6\'s four tracks with their nicknames', () => {
  assert.deepEqual(EXAMPLE_FLIGHT.map(e => [e.slot, e.name]), [[1, '#1 Lead - ED2F5'], [2, '#2 - 60DF66'], [3, '#3 - 8738A6C9'], [4, '#4 - 083AC']]);
  for (const e of EXAMPLE_FLIGHT) assert.match(e.download, /^[A-Za-z0-9._-]+\.kml$/);
});

test('loading it fetches each file once, only when asked, and loads all four', async () => {
  const asked = [];
  const flight = await loadExampleFlight(async asset => { asked.push(asset); return fromRepo(asset); });
  assert.deepEqual(asked.sort(), ['3085ab3861e2bae6.kml', '3ee2a7e81a74880c.kml', '46e14716b39044c4.kml', '585aab2601b787ed.kml']);
  assert.deepEqual(Object.keys(flight.tracks), ['1', '2', '3', '4']);
  assert.equal(flight.tracks[1].name, '#1 Lead - ED2F5');
});

test('if a file can\'t be fetched, nothing loads', async () => {
  await assert.rejects(loadExampleFlight(async asset => { if (asset.startsWith('46')) throw new Error('offline'); return fromRepo(asset); }), /offline/);
});
