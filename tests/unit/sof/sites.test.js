// Checks: the SOF's site profiles (plan Step 2c, part A): Moose Jaw's profile holds the airspace SOF-41 names, another Canadian home field gets the same
//   profile (as the SOF behaves today), and a field with no profile gets nothing borrowed from Moose Jaw: no weather limits and no lightning source.
// Serves: SOF-41 (the airspace), plan Step 2c part A.
// Expected values: the airspace ids are the ones decision SOF-41 lists from NAV CANADA's Designated Airspace Handbook (CYR303, CYA304, CYA305, CYA307,
//   the Moose Jaw MTCA in two parts and the Moose Jaw control zone); "another Canadian field" is the plan's rule (ICAO starting with C); not taken from the code's output.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteFor } from '../../../src/modules/sof/sites/index.js';

// SOF-41: CYR303 and CYA304, 305, 307 by name, the Moose Jaw MTCA (inner and outer parts) and control zone (ids as airspace-data.js writes them).
const SOF_41_MOOSE_JAW = ['CYR303', 'CYA304', 'CYA305', 'CYA307', 'CYMJ-MTCA-A', 'CYMJ-MTCA-B', 'CYMJ-CZ'];

test('site profiles: Moose Jaw has its DAH airspace, other Canadian fields share it, an unknown field has no limits and no lightning source', () => {
  const moose = siteFor('CYMJ');
  const ids = moose.airspace.map((a) => a.id);
  for (const id of SOF_41_MOOSE_JAW) assert.ok(ids.includes(id), `${id} is in Moose Jaw's airspace`);
  assert.equal(new Set(ids).size, ids.length, 'each airspace id is used once');
  assert.ok(moose.airspace.every((a) => typeof a.source === 'string' && a.source.length > 0), 'every area names its source');
  for (const watched of moose.watchedAreas) assert.ok(ids.includes(watched), `watched area ${watched} is one of the airspace entries`);
  assert.ok(moose.sources.lightning !== null && moose.standards !== null, 'Moose Jaw has a lightning source and weather standards');

  // Home set to Regina is today's behaviour: the same ECCC sources and Saskatchewan airspace. Same profile.
  assert.equal(siteFor('CYQR'), moose);

  const unknown = siteFor('KXYZ');
  assert.equal(unknown.standards, null, 'no weather limits are borrowed for a field with no profile');
  assert.equal(unknown.sources.lightning, null, 'no lightning source, so the SOF can never read "no lightning" there');
  assert.deepEqual([...unknown.airspace], []);
  assert.ok(Object.isFrozen(unknown) && Object.isFrozen(moose), 'profiles are frozen');
  assert.equal(siteFor(undefined), unknown, 'a missing home field is the generic profile too');
});
