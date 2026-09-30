// The readout rows (SPEC-debrief: Readouts and standards, #18, #21, D31, D32, D47, D52, D78).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFlight } from '../../../src/flight-data/flight.js';
import { makeLocalRef, localFtToLatLon } from '../../../src/core/geo.js';
import { emPoint } from '../../../src/core/flight-math.js';
import { V6_STANDARDS } from '../../../src/core/standards.js';
import { KT_TO_FTPS } from '../../../src/core/units.js';
import {
  estIasKt, standardApplies, readoutsAt, formationAt, mapLabel, formationText, leadText, shipDetailText, vsLeadText, pairText,
} from '../../../src/modules/debrief/readouts.js';

const ref = makeLocalRef(50, -105);
const FT_PER_M = 3.28084;

// A track from where the ship is (feet) at each whole second 0 to `seconds`.
function track(name, where, { seconds = 60, altFt = 5000, skip = [] } = {}) {
  const fixes = [];
  for (let t = 0; t <= seconds; t++) {
    if (skip.includes(t)) continue;
    const [x, y] = where(t);
    const { lat, lon } = localFtToLatLon(ref, x, y);
    fixes.push({ t: 1_000_000 + t, lat, lon, altM: altFt / FT_PER_M });
  }
  return { name, fixes };
}
const T = (s) => 1_000_000 + s;

// Lead east at 200 kt; #2 5,000 ft to Lead's left (north), abreast; #3 8,000 ft
// behind and 5,000 ft to the right; #4 abreast Lead, 7,000 ft beyond #3 on the
// same side, so its interval is measured from #3 (WIDE).
const v = 200 * KT_TO_FTPS;
const box = buildFlight({
  1: track('Lead', (t) => [v * t, 0]),
  2: track('Two', (t) => [v * t, 5000]),
  3: track('Three', (t) => [v * t - 8000, -5000]),
  4: track('Four', (t) => [v * t, -12000]),
});

test('est. IAS is core\'s EM-chart estimate: ground speed × √(density ratio) (D31)', () => {
  for (const [gs, alt] of [[200, 5000], [180, 10_000], [250, 0], [150, 60_000]]) {
    const em = emPoint({ x: 0, y: 0 }, { x: 1, y: 0, spdKt: gs, altFt: alt }, { x: 2, y: 0 });
    assert.equal(estIasKt(gs, alt), em.iasKt);
  }
  assert.equal(estIasKt(NaN, 5000), null);
  assert.ok(estIasKt(200, 10_000) < 175 && estIasKt(200, 10_000) > 165);
});

test('a standard applies to #2 to #4 with spread on, and to #3 alone with only offset on (#21)', () => {
  const only = (spread, offset) => ({ ...V6_STANDARDS, spread: { ...V6_STANDARDS.spread, on: spread }, offset: { ...V6_STANDARDS.offset, on: offset } });
  assert.deepEqual([1, 2, 3, 4].map((s) => standardApplies(s, V6_STANDARDS)), [false, true, true, true]);
  assert.deepEqual([2, 3, 4].map((s) => standardApplies(s, only(false, true))), [false, true, false]);
  assert.deepEqual([2, 3, 4].map((s) => standardApplies(s, only(false, false))), [false, false, false]);
});

test('the Formation card: #2 on parameters, #3 in the offset, #4 wide by how much', () => {
  const r = readoutsAt(box, T(30), { standards: V6_STANDARDS });
  const lines = r.formation.map((row) => [row.slot, formationText(row).text, formationText(row).tone]);
  assert.equal(lines[0][1], 'On parameters');
  assert.equal(lines[0][2], 'good');
  assert.equal(lines[1][1], 'On parameters'); // D78: the offset standard alone judges #3's fore/aft
  assert.match(lines[2][1], /^WIDE by 1,0\d\d ft$/); // 7,000 ft from #3, max 6,000
  assert.equal(lines[2][2], 'caution');
});

test('with no standard for a ship, it gets no label instead of "ON PARAMETERS" (#21)', () => {
  const offsetOnly = { ...V6_STANDARDS, spread: { ...V6_STANDARDS.spread, on: false } };
  const r = readoutsAt(box, T(30), { standards: offsetOnly });
  assert.deepEqual(r.formation.map((row) => row.state), ['no-standard', 'ok', 'no-standard']);
  assert.equal(formationText(r.formation[0]).text, '– (no standard on)');
});

test('Lead is judged on est. IAS, not ground speed (D31)', () => {
  const high = buildFlight({ 1: track('Lead', (t) => [v * t, 0], { altFt: 10_000 }) });
  const r = readoutsAt(high, T(30), { standards: V6_STANDARDS });
  assert.ok(Math.abs(r.ships[0].gsKt - 200) < 0.5); // on the 200 kt target by ground speed …
  assert.deepEqual(r.lead.labels, ['SLOW']); // … but slow by est. IAS
  assert.match(leadText(r.lead).text, /^Lead 1\d\d kt est\. IAS, 1\.0 G, SLOW$/);
  const off = readoutsAt(high, T(30), { standards: { ...V6_STANDARDS, lead: { ...V6_STANDARDS.lead, on: false } } });
  assert.equal(off.lead.labels, null);
  assert.equal(leadText(off.lead).tone, 'none');
});

test('in a GPS gap a ship shows "GPS gap", not numbers (D32)', () => {
  const gappy = buildFlight({
    1: track('Lead', (t) => [v * t, 0]),
    2: track('Two', (t) => [v * t, 5000], { skip: [20, 21, 22, 23, 24, 25, 26, 27] }),
  });
  const r = readoutsAt(gappy, T(23), { standards: V6_STANDARDS });
  assert.equal(r.formation[0].state, 'gap');
  assert.equal(formationText(r.formation[0]).text, 'GPS gap');
  assert.deepEqual(shipDetailText(r.ships[1]), ['GPS gap: no numbers until the track resumes']);
  assert.equal(vsLeadText(r.vsLead[0]), 'GPS gap');
  assert.equal(pairText(r.pairs[0]), '#1–#2: GPS gap');
});

test('with Lead still, there is no heading: no labels, no aspect or HCA (D52)', () => {
  const parked = buildFlight({
    1: track('Lead', () => [0, 0]),
    2: track('Two', (t) => [v * t, 5000]),
  });
  const r = readoutsAt(parked, T(30), { standards: V6_STANDARDS });
  assert.equal(r.formation[0].state, 'no-heading');
  assert.equal(r.vsLead[0].aspectDeg, null);
  assert.equal(r.vsLead[0].hcaDeg, null);
  assert.match(vsLeadText(r.vsLead[0]), /aspect –, HCA –/);
});

test('aspect, HCA, closure and ranges versus Lead; ranges say horizontal or 3D (#18)', () => {
  // #2 closes on Lead from 5,000 ft abeam at 10 kt, on a heading 90° off Lead's.
  const closing = buildFlight({
    1: track('Lead', (t) => [v * t, 0]),
    2: track('Two', (t) => [v * t, 5000 - 10 * KT_TO_FTPS * t], { altFt: 5500 }),
  });
  const r = readoutsAt(closing, T(30), { standards: V6_STANDARDS });
  const row = r.vsLead[0];
  assert.ok(Math.abs(row.aspectDeg - 90) < 0.5);
  assert.ok(row.hcaDeg > 2 && row.hcaDeg < 4); // mostly parallel, drifting in
  assert.ok(Math.abs(row.closureKt - 10) < 0.2);
  const pair = r.pairs[0];
  assert.ok(Math.abs(pair.horizontalFt - (5000 - 300 * KT_TO_FTPS)) < 1);
  assert.ok(pair.slantFt > pair.horizontalFt);
  assert.match(pairText(pair), /^#1–#2: [\d,]+ ft horizontal, [\d,]+ ft 3D, closure \+10 kt$/);
  // At the very start there's no second before, so no closure.
  assert.equal(readoutsAt(closing, closing.startT, { standards: V6_STANDARDS }).vsLead[0].closureKt, null);
});

test('live data says where each value came from: est. by default, recorded when switched on (D47, D61)', () => {
  const r = readoutsAt(box, T(30), { standards: V6_STANDARDS });
  const lines = shipDetailText(r.ships[0]);
  assert.match(lines[0], /^Alt 5,000 ft, GS 200 kt, est\. IAS 1\d\d kt$/);
  assert.equal(lines[1], 'G 1.00 est., pitch 0° est., bank 0° est.');
  assert.match(lines[2], /^Lat 50\.\d{5}, Lon -10\d\.\d{5}$/);
  assert.equal(shipDetailText({ ...r.ships[0], bankDeg: -30, bankSource: 'recorded' })[1].includes('bank 30° right recorded'), true);
});

test('no flight, no readouts', () => {
  assert.deepEqual(readoutsAt(null, 0), { ships: [], formation: [], lead: null, vsLead: [], pairs: [] });
  assert.equal(leadText(null), null);
});

test('the map\'s labels are the Formation card\'s rows', () => {
  for (const t of [T(0), T(15), T(30), T(60)]) {
    assert.deepEqual(formationAt(box, t, V6_STANDARDS), readoutsAt(box, t, { standards: V6_STANDARDS }).formation);
  }
  assert.deepEqual(formationAt(null, 0, V6_STANDARDS), []);
});

test('the map labels a wingman green when on parameters, and not at all without a judgement (#21)', () => {
  const [two, three, four] = formationAt(box, T(30), V6_STANDARDS);
  assert.deepEqual(mapLabel(two), { text: 'ON PARAMETERS', tone: 'good' });
  assert.deepEqual(mapLabel(three), { text: 'ON PARAMETERS', tone: 'good' });
  assert.deepEqual(mapLabel(four), { text: 'WIDE', tone: 'caution' });
  assert.equal(mapLabel({ state: 'gap', labels: [] }), null);
  assert.equal(mapLabel({ state: 'no-standard', labels: [] }), null);
  assert.deepEqual(mapLabel({ state: 'ok', labels: ['WIDE', 'AFT'] }), { text: 'WIDE / AFT', tone: 'caution' });
});
