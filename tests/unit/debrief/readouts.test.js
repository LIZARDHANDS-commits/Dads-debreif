// The readout rows (SPEC-debrief: Readouts and standards, #18, #21, D31, D32, D47, D52, D78).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFlight, headingAt, estimatedGAt } from '../../../src/flight-data/flight.js';
import { loadExampleFlight } from '../../../src/flight-data/examples.js';
import { shipsIn3d } from '../../../src/modules/debrief/view3d/frame.js';
import { makeLocalRef, localFtToLatLon } from '../../../src/core/geo.js';
import { emPoint } from '../../../src/core/flight-math.js';
import { V6_STANDARDS, DEFAULT_STANDARDS } from '../../../src/core/standards.js';
import { KT_TO_FTPS } from '../../../src/core/units.js';
import {
  AIRBORNE_IAS_KT, LOW_BLOCK_FLOOR_FT, MID_BLOCK_CEILING_FT,
  turnRateAt, estIasKt, standardApplies, readoutsAt, formationAt, mapLabel, formationText, leadText, shipDetailText, vsLeadText, pairText,
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

test('the SMM standards (D116, D114): sweep off the 3/9 line in degrees, #3 in the 6,000-8,000 ft box', () => {
  const at = (two, three) => buildFlight({
    1: track('Lead', (t) => [v * t, 0]),
    2: track('Two', (t) => [v * t + two, 5000]),
    3: track('Three', (t) => [v * t - three, -5000]),
  });
  const text = (flight) => readoutsAt(flight, T(30), { standards: DEFAULT_STANDARDS }).formation.map((row) => formationText(row).text);
  // 500 ft back at 5,000 ft is 5.7° of sweep: inside 0 to 10°. #3 7,000 ft back: inside 7,000 ± 1,000.
  assert.deepEqual(text(at(-500, 7000)), ['On parameters', 'On parameters']);
  // 1,500 ft back is 16.7°: AFT by 7°. #3 8,500 ft back: AFT by 500 ft.
  assert.deepEqual(text(at(-1500, 8500)), ['AFT by 7°', 'AFT by 500 ft']);
  // 500 ft ahead is 5.7° forward of the line: FORE by 6°. #3 5,500 ft back: FORE by 500 ft.
  assert.deepEqual(text(at(500, 5500)), ['FORE by 6°', 'FORE by 500 ft']);
  // Just past 10°: said as under a degree, not "by 0°".
  assert.deepEqual(text(at(-Math.tan((10.3 * Math.PI) / 180) * 5000, 7000)), ['AFT by under 1°', 'On parameters']);
  const row = readoutsAt(at(-1500, 7000), T(30), { standards: DEFAULT_STANDARDS }).formation[0];
  assert.ok(Math.abs(row.sweepDeg - 16.70) < 0.05, String(row.sweepDeg));
  // V6's standards still say it in feet (± 250 ft of the 3/9 line).
  assert.deepEqual(readoutsAt(at(-1500, 8000), T(30), { standards: V6_STANDARDS }).formation.map((r) => formationText(r).text),
    ['AFT by 1,250 ft', 'On parameters']);
});

test('the SMM lead standard (D115): 220 kt in the low block, 200 kt in the mid block, from Lead\'s altitude', () => {
  const lead = (altFt, kt) => buildFlight({ 1: track('Lead', (t) => [kt * KT_TO_FTPS * t, 0], { altFt }) });
  const low = readoutsAt(lead(8000, 240), T(30), { standards: DEFAULT_STANDARDS }).lead;
  assert.equal(low.block, 'low');
  assert.equal(low.targetKt, 220);
  assert.match(leadText(low).text, /^Lead 2[12]\d kt est\. IAS, 1\.0 G, on parameters \(target 220 kt, low block\)$/);
  const mid = readoutsAt(lead(12_000, 240), T(30), { standards: DEFAULT_STANDARDS }).lead;
  assert.equal(mid.block, 'mid');
  assert.equal(mid.targetKt, 200);
  assert.match(leadText(mid).text, /, on parameters \(target 200 kt, mid block\)$/);
  const slow = readoutsAt(lead(8000, 200), T(30), { standards: DEFAULT_STANDARDS }).lead;
  assert.match(leadText(slow).text, /, SLOW \(target 220 kt, low block\)$/);
  // V6's one 200 kt target shows no block.
  assert.equal(readoutsAt(lead(8000, 240), T(30), { standards: V6_STANDARDS }).lead.block, null);
});

// ── M1(a): no verdicts on the ground (verification M1; a judgement call logged for review) ──

const fromRepo = async (asset) => readFileSync(new URL(`../../../original/assets/${asset}`, import.meta.url), 'utf8');

test('airborne means est. IAS of 80 kt or more', () => {
  assert.equal(AIRBORNE_IAS_KT, 80);
});

test('Lead taxiing at 10 kt: no wingman labels and no Lead verdict, just its numbers', () => {
  const kt = 10 * KT_TO_FTPS;
  const taxi = buildFlight({
    1: track('Lead', (t) => [kt * t, 0], { altFt: 8000 }),
    2: track('Two', (t) => [kt * t, 5000], { altFt: 8000 }),
    3: track('Three', (t) => [kt * t - 8000, -5000], { altFt: 8000 }),
  });
  for (const std of [V6_STANDARDS, DEFAULT_STANDARDS]) {
    const r = readoutsAt(taxi, T(30), { standards: std });
    assert.deepEqual(r.formation.map((row) => row.labels), [[], []]);
    assert.deepEqual(r.formation.map((row) => row.state), ['ground', 'ground']);
    assert.equal(mapLabel(r.formation[0]), null);
    assert.equal(formationAt(taxi, T(30), std).every((row) => row.labels.length === 0), true);
    assert.equal(r.lead.labels, null);
    assert.doesNotMatch(leadText(r.lead).text, /FAST|SLOW|parameters/);
    assert.match(leadText(r.lead).text, /^Lead \d+ kt est\. IAS, (1\.0 G|G --)$/);
    assert.equal(formationText(r.formation[0]).text, '– (Lead under 80 kt)');
  }
});

test('the gate is est. IAS 80 kt: just under gets no verdict, at 80 gets one', () => {
  // At 8,000 ft est. IAS is about 0.86 of ground speed (density ratio 0.786 square-rooted, ~0.887).
  const flightAt = (iasKt) => {
    const gs = iasKt / estIasKt(1, 8000);
    return buildFlight({ 1: track('Lead', (t) => [gs * KT_TO_FTPS * t, 0], { altFt: 8000 }) });
  };
  assert.equal(readoutsAt(flightAt(79.5), T(30), { standards: DEFAULT_STANDARDS }).lead.labels, null);
  assert.deepEqual(readoutsAt(flightAt(80.5), T(30), { standards: DEFAULT_STANDARDS }).lead.labels, ['SLOW']);
});

test('the example flight\'s taxi: no SLOW, no wingman labels, while Lead is under 80 kt est. IAS', async () => {
  const flight = await loadExampleFlight(fromRepo);
  let taxiSeconds = 0;
  for (let s = 0; s < 20 * 60; s += 5) {
    const r = readoutsAt(flight, flight.startT + s, { standards: DEFAULT_STANDARDS });
    if (!(r.lead.iasKt < AIRBORNE_IAS_KT)) continue;
    taxiSeconds++;
    assert.equal(r.lead.labels, null, `Lead verdict at +${s} s`);
    assert.doesNotMatch(leadText(r.lead).text, /FAST|SLOW/);
    assert.ok(r.formation.every((row) => row.labels.length === 0), `wingman label at +${s} s`);
  }
  assert.ok(taxiSeconds > 20, `${taxiSeconds} taxi samples`);
});

// ── M1(b): Lead is judged only inside the blocks (Gen Book p.12) ──

test('the blocks: low from 6,000 ft, mid up to 15,500 ft (Gen Book p.12)', () => {
  assert.equal(LOW_BLOCK_FLOOR_FT, 6000);
  assert.equal(MID_BLOCK_CEILING_FT, 15_500);
});

test('Lead is judged from 6,000 ft to 15,500 ft and not outside them', () => {
  const at = (altFt) => readoutsAt(
    buildFlight({ 1: track('Lead', (t) => [240 * KT_TO_FTPS * t, 0], { altFt }) }), T(30), { standards: DEFAULT_STANDARDS },
  ).lead;
  const below = at(5999);
  assert.equal(below.labels, null);
  assert.equal(below.notJudged, 'below the low block');
  assert.match(leadText(below).text, /^Lead \d+ kt est\. IAS, 1\.0 G, not judged: below the low block$/);
  assert.equal(leadText(below).tone, 'none');
  for (const altFt of [6000, 8000, 10_250, 15_500]) {
    const judged = at(altFt);
    assert.ok(Array.isArray(judged.labels), `${altFt} ft`);
    assert.equal(judged.notJudged, null);
  }
  assert.equal(at(6000).block, 'low');
  assert.equal(at(15_500).block, 'mid');
  const above = at(15_501);
  assert.equal(above.labels, null);
  assert.equal(above.notJudged, 'above the mid block');
  assert.match(leadText(above).text, /, not judged: above the mid block$/);
  assert.doesNotMatch(leadText(above).text, /FAST|SLOW/);
  assert.equal(at(2790).labels, null); // the example flight's 19:44 descent
});

test('V6\'s one-target standard is gated by the same blocks; a standard that is off says nothing', () => {
  const at = (altFt, std) => readoutsAt(
    buildFlight({ 1: track('Lead', (t) => [240 * KT_TO_FTPS * t, 0], { altFt }) }), T(30), { standards: std },
  ).lead;
  assert.equal(at(3000, V6_STANDARDS).notJudged, 'below the low block');
  const off = { ...V6_STANDARDS, lead: { ...V6_STANDARDS.lead, on: false } };
  assert.equal(at(3000, off).notJudged, null);
  assert.doesNotMatch(leadText(at(3000, off)).text, /not judged/);
});

// ── M2: bank over the same window as G ──

// #2 on the example flight at scrubber start+1676 to +1688, where the bank flickered while G read 1.0 to 2.1.
// The readouts and the 3D view give the same bank (D40). Bank in degrees, left wing down positive.
// The heading change over t±1.5 s, est. G's window (M2). At +1688 that window touches the GPS gap
// after 1688.9 s, so G is "--" and the bank is unknown: "bank --", wings level in 3D (audit of #194, Y2;
// verification re-check N2; it read −57.4° before).
// The old ±1 s chord bank stays pinned on V6's path in tests/golden/debrief-3d.test.js.
const EXAMPLE_BANK_PIN = [-5.617, -11.3934, -5.4889, 6.7984, 7.3718, 0.1351, -51.0776, -62.3068, -47.2801, 34.033, 34.033, 6.7648, null];

test('the example flight\'s #2, start+1676 to +1688: the pinned bank, the same in the readouts and the 3D view', async () => {
  const flight = await loadExampleFlight(fromRepo);
  const got = [];
  for (let s = 1676; s <= 1688; s++) {
    const bank = readoutsAt(flight, flight.startT + s).ships[1].bankDeg;
    const in3d = shipsIn3d(flight, flight.startT + s)[1];
    assert.equal(in3d.bankDeg, bank ?? 0); // unknown: drawn wings level
    assert.equal(in3d.bankKnown, bank !== null);
    got.push(bank === null ? null : +bank.toFixed(4));
  }
  assert.deepEqual(got, EXAMPLE_BANK_PIN);
});

/** A small repeatable noise in -0.5 to 0.5, so the test is the same every run. */
function noise(seed) {
  let a = seed;
  return () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296 - 0.5; };
}

test('a steady level turn with noisy fixes: the bank never flips side and stays within 15° of acos(1/G) from the same window', () => {
  const speed = 200 * KT_TO_FTPS;
  for (const [g, dir] of [[1.5, 1], [1.5, -1], [3, 1], [3, -1], [1.3, 1]]) {
    const omega = (32.174 * Math.sqrt(g * g - 1)) / speed;
    const radius = speed / omega;
    const r = noise(Math.round(g * 100) + dir + 2);
    // Up to 10 ft of position noise on every fix: a couple of degrees of heading noise a second.
    const turn = buildFlight({
      1: track('Lead', (t) => [radius * Math.sin(omega * t) + 20 * r(), dir * radius * (1 - Math.cos(omega * t)) + 20 * r()], { seconds: 60 }),
    });
    let prevSide = 0;
    for (let s = 3; s <= 57; s++) {
      const ship = readoutsAt(turn, T(s)).ships[0];
      assert.ok(Number.isFinite(ship.g), `G at ${s} s`);
      const want = (Math.acos(1 / ship.g) * 180) / Math.PI;
      assert.ok(Math.abs(Math.abs(ship.bankDeg) - want) < 15, `g ${g} at ${s} s: bank ${ship.bankDeg}, acos(1/G) ${want}`);
      const side = Math.sign(ship.bankDeg);
      assert.equal(side, dir, `g ${g} dir ${dir} at ${s} s: bank ${ship.bankDeg}`);
      if (prevSide) assert.equal(side, prevSide);
      prevSide = side;
    }
  }
});

test('turnRateAt is the heading change over t±1.5 s, left positive; null when the heading is unknown', () => {
  const speed = 200 * KT_TO_FTPS;
  const omega = 0.1;
  const radius = speed / omega;
  const left = buildFlight({ 1: track('Lead', (t) => [radius * Math.sin(omega * t), radius * (1 - Math.cos(omega * t))]) });
  const right = buildFlight({ 1: track('Lead', (t) => [radius * Math.sin(omega * t), -radius * (1 - Math.cos(omega * t))]) });
  assert.ok(Math.abs(turnRateAt(left.tracks[1], T(30)) - omega) < 0.005);
  assert.ok(Math.abs(turnRateAt(right.tracks[1], T(30)) + omega) < 0.005);
  const parked = buildFlight({ 1: track('Lead', () => [0, 0]) });
  assert.equal(turnRateAt(parked.tracks[1], T(30)), null);
  assert.equal(turnRateAt({ fixes: [] }, 0), null);
});

test('turnRateAt at the ends of the track divides by the window it has, not the full 3 s', () => {
  const speed = 200 * KT_TO_FTPS;
  const omega = 0.1;
  const radius = speed / omega;
  const tr = buildFlight({ 1: track('Lead', (t) => [radius * Math.sin(omega * t), radius * (1 - Math.cos(omega * t))]) }).tracks[1];
  const rate = (a, b) => (headingAt(tr, T(b)) - headingAt(tr, T(a))) / (b - a);
  assert.ok(Math.abs(turnRateAt(tr, T(0)) - rate(0, 1.5)) < 1e-12);
  assert.ok(Math.abs(turnRateAt(tr, T(60)) - rate(58.5, 60)) < 1e-12);
});

// Audit of #194, Y2: the bank used to be worked out across a gap while G said "--".
test('no bank from a window that touches a GPS gap: "bank --" on the card and wings level in 3D wherever est. G is unknown', () => {
  const speed = 200 * KT_TO_FTPS;
  const omega = 0.1;
  const radius = speed / omega;
  const flight = buildFlight({
    1: track('Lead', (t) => [radius * Math.sin(omega * t), radius * (1 - Math.cos(omega * t))], { skip: [21, 22, 23, 24, 25, 26, 27] }),
  });
  const tr = flight.tracks[1];
  assert.ok(turnRateAt(tr, T(10)) > 0);
  for (let s = 18.6; s <= 29.5; s += 0.1) {
    const t = T(s);
    if (estimatedGAt(tr, t) !== null) continue;
    assert.equal(turnRateAt(tr, t), null, `turn rate at start+${s.toFixed(1)}`);
    assert.equal(readoutsAt(flight, t).ships[0].bankDeg, null, `bank at start+${s.toFixed(1)}`);
    const ship = readoutsAt(flight, t).ships[0];
    if (!ship.inGap) assert.match(shipDetailText(ship)[1], /bank -- est\.$/);
    assert.equal(shipsIn3d(flight, t)[0].bankDeg, 0, 'wings level in 3D');
  }
  assert.equal(turnRateAt(tr, T(29.5)), null); // starts on the fix that ends the gap
  assert.ok(turnRateAt(tr, T(30)) > 0);
});

// Verification re-check N2 (audit): a recorded bank is kept, and known, where est. G and the turn rate are unknown (D47).
test('a recorded bank stays known beside a GPS gap, in the readouts and the 3D view', () => {
  const speed = 200 * KT_TO_FTPS;
  const omega = 0.1;
  const radius = speed / omega;
  const tr = track('Lead', (t) => [radius * Math.sin(omega * t), radius * (1 - Math.cos(omega * t))], { skip: [21, 22, 23, 24, 25, 26, 27] });
  tr.fixes = tr.fixes.map((f) => ({ ...f, bankRecordedDeg: -23 })); // 23° left, as the recording writes it
  const flight = buildFlight({ 1: tr });
  const t = T(29.5); // the window starts on the fix that ends the gap: no turn rate, no est. G
  assert.equal(turnRateAt(flight.tracks[1], t), null);
  const ship = readoutsAt(flight, t).ships[0];
  assert.equal(ship.bankDeg, 23);
  assert.equal(ship.bankSource, 'recorded');
  assert.match(shipDetailText(ship)[1], /bank 23° left recorded$/);
  assert.deepEqual([shipsIn3d(flight, t)[0].bankDeg, shipsIn3d(flight, t)[0].bankKnown], [23, true]);
});
