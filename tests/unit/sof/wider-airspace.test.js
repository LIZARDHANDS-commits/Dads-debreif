// Checks: the SOF's wider airspace and its eighth base (Dad's asks of 8 Oct 2026): Moose Jaw's wider DAH set holds the Winnipeg, Edmonton and Calgary terminal
//   control areas and the Suffield and Primrose Lake (Cold Lake Air Weapons Range) restricted areas with the DAH's floors and ceilings, and every entry passes the
//   view's own checks; no US base's FAA airspace file has a Mexican or Bahamian piece ("drop mexico and baha"); San Angelo's usual alternates are Dad's.
// Serves: SOF plan Step 2c (KSJT; wider Canadian airspace for Moose Jaw's bigger 3D area), SOF-41, SOF-52, SOF-53.
// Expected values: typed from NAV CANADA's Designated Airspace Handbook, edition effective 03 Sep 2026 (the same edition as SOF-41), by page and paragraph below;
//   San Angelo's alternates from Dad (8 Oct 2026). Not taken from the generator's output. Heights are feet above sea level; "below 18,000" is written as 18,000.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIRSPACE as WIDER } from '../../../src/modules/sof/sites/dah-airspace/cymj.js';
import { AIRSPACE as FIRST } from '../../../src/modules/sof/airspace-data.js';
import { checkAirspace, checkedAirspace } from '../../../src/modules/sof/airspace-model.js';
import { siteFor, PROFILES } from '../../../src/modules/sof/sites/index.js';
import { CATALOG } from '../../../src/airfields/catalog.js';

const ft = (n) => ({ ft: n, ref: 'ASL' });
const SFC = { ft: 0, ref: 'SFC' };
const UNL = { ft: 0, ref: 'UNL' };

// [id as the file names it, DAH paragraph and page, class, floor, ceiling]
const TERMINAL_AREAS = [
  // Winnipeg TCA, DAH pp. 71-72
  ['CYWG-TCA-A', '3.3.3-8, p. 71', 'B', ft(12500), ft(18000)],
  ['CYWG-TCA-B', '3.3.3-9, p. 71', 'C', ft(2000), ft(3000)],
  ['CYWG-TCA-C', '3.3.3-10, p. 71', 'C', ft(3000), ft(4000)],
  ['CYWG-TCA-D', '3.3.3-11, p. 72', 'C', ft(4000), ft(12500)],
  // Edmonton TCA, DAH pp. 56-58
  ['CYEG-TCA-A', '3.2.3-14, p. 56', 'B', ft(12500), ft(18000)],
  ['CYEG-TCA-B', '3.2.3-15, p. 57', 'C', ft(9500), ft(12500)],
  ['CYEG-TCA-C', '3.2.3-16, p. 57', 'C', ft(7000), ft(9500)],
  ['CYEG-TCA-D', '3.2.3-17, p. 57', 'C', ft(4600), ft(7000)],
  ['CYEG-TCA-E', '3.2.3-18, p. 57', 'C', ft(4100), ft(4600)],
  ['CYEG-TCA-F', '3.2.3-19, p. 57', 'C', ft(3400), ft(4100)],
  ['CYEG-TCA-G', '3.2.3-20, p. 58', 'C', ft(3400), ft(4600)],
  ['CYEG-TCA-H', '3.2.3-21, p. 58', 'C', ft(4100), ft(4600)],
  // Calgary TCA, DAH p. 56
  ['CYYC-TCA-A', '3.2.3-8, p. 56', 'B', ft(12500), ft(18000)],
  ['CYYC-TCA-B', '3.2.3-9, p. 56', 'C', ft(8000), ft(12500)],
  ['CYYC-TCA-C', '3.2.3-10, p. 56', 'C', ft(5500), ft(8000)],
  ['CYYC-TCA-D', '3.2.3-11, p. 56', 'C', ft(4800), ft(5500)],
  ['CYYC-TCA-E', '3.2.3-12, p. 56', 'C', ft(6000), ft(8000)],
];

// [designator, DAH page, floor, ceiling]: the designated altitude in force on 8 Oct 2026.
const RESTRICTED = [
  ['CYR204', 'p. 137 (Cold Lake Air Weapons Range, over Primrose Lake)', SFC, UNL],
  ['CYR229', 'p. 140 (Suffield; surface to unlimited from 1 Apr to 1 Dec)', SFC, UNL],
  ['CYR230', 'pp. 140-141 (Suffield)', SFC, UNL],
  ['CYR231', 'p. 141 (Suffield)', SFC, ft(6000)],
];

// Every FAA airspace file the SOF can load: the eight US bases and Moose Jaw's US side.
const FAA_FILES = ['kdlf', 'kend', 'krnd', 'kcbm', 'ksps', 'knse', 'kngp', 'ksjt', 'cymj'];

test('wider airspace: DAH terminal and restricted areas, every entry fit to draw, no Mexican or Bahamian pieces, San Angelo with Dad\'s alternates', async () => {
  const byId = new Map(WIDER.map((e) => [e.id, e]));

  for (const [id, where, cls, floor, ceiling] of TERMINAL_AREAS) {
    const e = byId.get(id);
    assert.ok(e, `${id} (DAH ${where}) is in the wider set`);
    assert.equal(e.kind, 'terminal', `${id} is drawn as a terminal area`);
    assert.equal(e.classLetter, cls, `${id} is Class ${cls} (DAH ${where})`);
    assert.deepEqual(e.floor, floor, `${id} floor (DAH ${where})`);
    assert.deepEqual(e.ceiling, ceiling, `${id} ceiling (DAH ${where})`);
    assert.match(e.source, /^DAH pp?\. \d/, `${id} cites its DAH page`);
  }
  // DAH 3.2.3-8, p. 56: Calgary's Class B part is a circle of 30 miles round the airport.
  assert.equal(byId.get('CYYC-TCA-A').shape.radiusNm, 30);

  for (const [id, where, floor, ceiling] of RESTRICTED) {
    const e = byId.get(id);
    assert.ok(e, `${id} (DAH ${where}) is in the wider set`);
    assert.equal(e.kind, 'restricted');
    assert.deepEqual(e.floor, floor, `${id} floor (DAH ${where})`);
    assert.deepEqual(e.ceiling, ceiling, `${id} ceiling (DAH ${where})`);
  }

  // Every entry passes the view's own checks at Moose Jaw's elevation, and the wider set repeats no id of the first 25.
  const ground = CATALOG.CYMJ.elevationFt;
  for (const e of WIDER) assert.deepEqual(checkAirspace(e, ground), { ok: true }, `${e.id} passes checkAirspace`);
  assert.deepEqual(checkedAirspace([...FIRST, ...WIDER], ground).skipped, [], 'nothing skipped with the first 25 and the wider set together');

  // No Mexican (ICAO MM..) or Bahamian (MY..) piece in any FAA file, as an id or a special use name such as "(MY)P3002".
  for (const base of FAA_FILES) {
    const { AIRSPACE } = await import(`../../../src/modules/sof/sites/faa-airspace/${base}.js`);
    const foreign = AIRSPACE.filter((e) => /^M[MY][A-Z]{2}\b/.test(e.id) || /^\(M[MY]\)/.test(e.name));
    assert.deepEqual(foreign.map((e) => e.id), [], `${base}.js has no Mexican or Bahamian airspace`);
  }

  // San Angelo is a base of its own, in the Home base choice, with Dad's usual alternates (8 Oct 2026).
  const sanAngelo = siteFor('KSJT');
  assert.equal(sanAngelo.icao, 'KSJT');
  assert.ok(PROFILES.includes(sanAngelo), 'KSJT is in the Home base choice');
  assert.deepEqual([...sanAngelo.usualAlternates], ['KABI', 'KMAF', 'KDLF']);
  assert.equal(sanAngelo.standards?.rule, 'usaf', 'San Angelo uses the USAF weather rules (AFMAN 11-202V3 4.16; step F, rewritten 8 Oct 2026 with Dad\'s yes)');
});
