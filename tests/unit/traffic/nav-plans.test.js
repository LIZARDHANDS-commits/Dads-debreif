// Checks: On profile (Patrick, 4 Oct) gives a start height from which an area PFL crosses High Key inside its
// 5,000-6,000 ft window (WFO S2 art 403 para 1a), and says so in words when it can't; the OHB Rejoin's distances
// back from the Merge come from the route's own points.
// Serves: Patrick, 4 Oct ("an ON PROFILE button where it can hit high key between 5000 and 6000 feet"; the OHB
// Rejoin "drop down for how many miles back on the rejoin line").
// Margins: the window itself; heights in whole hundreds of feet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onProfileAltFt, makePflFromArea } from '../../../src/modules/traffic/nav-plans.js';
import { flyPfl } from '../../../src/modules/traffic/pfl.js';
import { milesBack } from '../../../src/modules/traffic/aircraft.js';

const MOOSE_JAW = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));
const WIND = { windFromDeg: 269, windKt: 15 }; // the default, 260°M at 15 kt

const highKeyFrom = (radialDeg, distNm, altFt, wind) => {
  const { spawn: s } = makePflFromArea(radialDeg, distNm, altFt);
  const hk = flyPfl({ x: s.x, y: s.y, alt: s.alt, kias: s.iasKt, headingDeg: s.headingDeg, bankDeg: 0 }, wind).points.find((p) => p.tag === 'high_key');
  return hk ? hk.alt : null;
};

test('On profile: from the height it gives, the PFL crosses High Key between 5,000 and 6,000 ft', () => {
  for (const [radialDeg, distNm, wind] of [[120, 6, WIND], [180, 5, WIND], [30, 8, { windFromDeg: 360, windKt: 0 }]]) {
    const found = onProfileAltFt(radialDeg, distNm, wind);
    assert.ok(!found.problem, `${radialDeg}/${distNm}: ${found.problem}`);
    assert.equal(found.altFt % 100, 0, 'whole hundreds of feet');
    const hk = highKeyFrom(radialDeg, distNm, found.altFt, wind);
    assert.ok(hk >= 5000 && hk <= 6000, `${radialDeg}/${distNm} from ${found.altFt} ft: High Key at ${hk} ft`);
    const lower = highKeyFrom(radialDeg, distNm, found.altFt - 300, wind);
    assert.ok(lower === null || lower < 5500, 'it is the lowest start that reaches the middle of the window, near enough');
  }
});

test('On profile: too far out to make High Key even from 15,000 ft is said in words', () => {
  const found = onProfileAltFt(120, 30, WIND);
  assert.match(found.problem, /Too far out/);
});

test('the OHB Rejoin\'s starts are 9.2, 5.2 and 1.6 NM back from the Merge along the line', () => {
  const ent1 = MOOSE_JAW.routes.find((r) => r.id === 'ENT1');
  assert.deepEqual(milesBack(ent1), [{ point: 1, nm: 9.2 }, { point: 2, nm: 5.2 }, { point: 3, nm: 1.6 }]);
});
