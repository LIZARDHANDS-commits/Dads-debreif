// Golden test (R9): src/modules/turn-sim/engine/formation.js against V6's own
// desiredFormationAircraft (line 797), syncAircraftErrorValues and applyErrors
// (lines 905 to 914) and inferLineAbreastFormFromCurrentState (line 1407).
// Exact match, no tolerance: every preset with seeded spacing, heading, box
// numbers and position errors.
import test from 'node:test';
import assert from 'node:assert/strict';
import { V6_DEFAULTS, aircraftKey } from '../../src/modules/turn-sim/settings.js';
import { formationSlots, positionErrorsFt, startPositions, inferLineAbreastForm, isTwoShip } from '../../src/modules/turn-sim/engine/formation.js';
import { degToRad } from '../../src/core/angles.js';
import { createV6Page, v6SettingsForD42, v6SettingsForD48 } from './turn-sim-fake-page.js';
import { seeded } from './inputs.js';

const FORMATIONS = ['weighted', 'weightedReverse', 'offsetBox', 'twoShip'];
const LAT_DIRS = ['none', 'tight', 'wide'];
const FORE_DIRS = ['none', 'fore', 'aft'];
const pick = (r, list) => list[Math.floor(r() * list.length)];

// The seeds deliberately bypass checkSettings ranges (e.g. a 720° heading): V6 accepts them, so the port must match.
/** Settings for one case: V6's own values, with the formation and error boxes varied. */
function* cases() {
  const r = seeded(0x70a1);
  const headings = [0, 90, 180, 270, -45, 359.5, 720, 33.3];
  for (const formation of FORMATIONS) {
    // The defaults first, then seeded numbers, with and without errors.
    yield { ...V6_DEFAULTS, formation };
    for (let i = 0; i < 40; i++) {
      const s = {
        ...V6_DEFAULTS,
        formation,
        spacingFt: Math.round(1000 + 9000 * r()),
        boxAftFt: Math.round(2000 + 12000 * r()),
        boxStaggerFt: Math.round(3000 * r()),
        startHeadingDeg: i < headings.length ? headings[i] : Math.round(720 * r() - 360),
      };
      if (i % 2) {
        for (const id of [1, 2, 3, 4]) {
          s[aircraftKey(id, 'positionErrorOn')] = r() < 0.75;
          s[aircraftKey(id, 'lateralDir')] = pick(r, LAT_DIRS);
          s[aircraftKey(id, 'lateralFt')] = Math.round(2000 * r());
          s[aircraftKey(id, 'foreAftDir')] = pick(r, FORE_DIRS);
          s[aircraftKey(id, 'foreAftFt')] = Math.round(2000 * r());
        }
      }
      yield s;
    }
  }
}

test('slots: every preset matches desiredFormationAircraft (position and heading, all four aircraft)', () => {
  let n = 0;
  for (const settings of cases()) {
    const page = createV6Page(settings);
    const v6 = page.v6.desiredFormationAircraft();
    const mine = formationSlots(settings);
    assert.equal(mine.length, 4);
    for (const want of v6) {
      const got = mine.find((a) => a.id === want.id);
      assert.deepEqual([got.xFt, got.yFt, got.headingRad], [want.x, want.y, want.hdg], `${settings.formation} #${want.id} ${JSON.stringify(settings)}`);
    }
    n++;
  }
  assert.ok(n > 150);
});

test('position errors: the wide/tight and fore/aft feet match syncAircraftErrorValues', () => {
  for (const settings of cases()) {
    const { v6, aircraft } = createV6Page(settings);
    for (const a of aircraft()) {
      v6.syncAircraftErrorValues(a);
      const mine = positionErrorsFt(settings)[a.id];
      assert.deepEqual([mine.lateralFt, mine.foreAftFt], [a.tight, a.acute], `#${a.id}`);
    }
  }
});

test('start positions: slots with the enabled position errors added match V6 after applyErrors (D42: V6 is given Wide and Tight swapped for aircraft on its negative side)', () => {
  for (const settings of cases()) {
    const page = createV6Page(v6SettingsForD42(settings));
    page.reset(); // desiredFormationAircraft, then applyErrors
    const mine = startPositions(settings);
    for (const a of page.aircraft()) {
      const got = mine.find((m) => m.id === a.id);
      assert.deepEqual([got.xFt, got.yFt, got.headingRad], [a.x, a.y, a.hdg], `${settings.formation} #${a.id} ${JSON.stringify(settings)}`);
    }
  }
});

test('D48: with #2 on Lead\'s right, 4312 is V6\'s 2134 and 2134 is V6\'s 4312, slots and start positions (with errors), exact', () => {
  let n = 0;
  for (const settings of cases()) {
    if (settings.formation !== 'weighted' && settings.formation !== 'weightedReverse') continue;
    const mine = { ...settings, twoSide: 'right' };
    const page = createV6Page(v6SettingsForD42(v6SettingsForD48(mine)));
    page.reset();
    const got = startPositions(mine);
    for (const a of page.aircraft()) {
      const g = got.find((m) => m.id === a.id);
      assert.deepEqual([g.xFt, g.yFt, g.headingRad], [a.x, a.y, a.hdg], `${settings.formation} #${a.id}`);
    }
    // And it is the mirror of the left layout across Lead's line.
    const left = formationSlots({ ...settings, twoSide: 'left' });
    const right = formationSlots(mine);
    const h = (90 - settings.startHeadingDeg) * Math.PI / 180;
    for (const id of [2, 3, 4]) {
      const across = (list) => { const a = list.find((x) => x.id === id); return a.xFt * Math.cos(h + Math.PI / 2) + a.yFt * Math.sin(h + Math.PI / 2); };
      assert.ok(Math.abs(across(left) + across(right)) < 1e-6, `#${id} mirrored`);
    }
    n++;
  }
  assert.ok(n > 80);
});

test('D48: other presets ignore the side, and "left" is V6 itself', () => {
  for (const settings of cases()) {
    const other = settings.formation === 'offsetBox' || settings.formation === 'twoShip';
    assert.deepEqual(formationSlots({ ...settings, twoSide: 'left' }), formationSlots(settings));
    if (other) assert.deepEqual(formationSlots({ ...settings, twoSide: 'right' }), formationSlots(settings));
  }
});

test('D48: inferLineAbreastForm swaps its answers with #2 on the right', () => {
  const r = seeded(0x1f4f);
  let answered = 0;
  for (let i = 0; i < 300; i++) {
    const formation = pick(r, ['weighted', 'weightedReverse']);
    const page = createV6Page({ ...V6_DEFAULTS, formation });
    const heading = r() * 2 * Math.PI - Math.PI;
    const order = [1, 2, 3, 4].sort(() => r() - 0.5);
    const right = { x: Math.cos(heading + Math.PI / 2), y: Math.sin(heading + Math.PI / 2) };
    const craft = page.aircraft();
    craft.forEach((a) => { const slot = order.indexOf(a.id) * 6000 - 9000; a.x = right.x * slot; a.y = right.y * slot; a.hdg = heading; });
    const swap = { weighted: 'weightedReverse', weightedReverse: 'weighted' };
    // V6 asked with the swapped name answers in V6's names; the port's names are the swap of those.
    const v6Page = createV6Page({ ...V6_DEFAULTS, formation: swap[formation] });
    v6Page.aircraft().forEach((a, k) => { a.x = craft[k].x; a.y = craft[k].y; a.hdg = craft[k].hdg; });
    const want = swap[v6Page.v6.inferLineAbreastFormFromCurrentState()];
    const got = inferLineAbreastForm(craft.map((a) => ({ id: a.id, xFt: a.x, yFt: a.y, headingRad: a.hdg })), formation, 'right');
    assert.equal(got, want, `${formation} order ${order}`);
    if (got !== formation) answered++;
  }
  assert.ok(answered > 0);
});

test('the errors are added along the start heading, from the start heading box (V6 does not use Lead\'s heading)', () => {
  const settings = { ...V6_DEFAULTS, startHeadingDeg: 0, [aircraftKey(2, 'positionErrorOn')]: true, [aircraftKey(2, 'foreAftDir')]: 'fore', [aircraftKey(2, 'foreAftFt')]: 1000 };
  const two = startPositions(settings).find((a) => a.id === 2);
  const slot = formationSlots(settings).find((a) => a.id === 2);
  // Compass heading 000 points north, so 1,000 ft fore moves #2 1,000 ft north.
  assert.ok(Math.abs(two.xFt - slot.xFt) < 1e-9);
  assert.ok(Math.abs(two.yFt - slot.yFt - 1000) < 1e-9);
});

test('inferLineAbreastForm matches inferLineAbreastFormFromCurrentState for seeded arrangements', () => {
  const r = seeded(0x1f4e);
  let inferredWeighted = 0;
  let inferredReverse = 0;
  for (let i = 0; i < 400; i++) {
    const formation = pick(r, FORMATIONS);
    const settings = { ...V6_DEFAULTS, formation };
    const page = createV6Page(settings);
    const craft = page.aircraft();
    const heading = (r() < 0.5 ? r() * 2 * Math.PI : pick(r, [0, Math.PI / 2, Math.PI, -Math.PI / 2])) - Math.PI;
    // A line abreast in a random order (a permutation of 1 to 4 on the 3/9 line), or scattered.
    const order = [1, 2, 3, 4].sort(() => r() - 0.5);
    const scatter = i % 5 === 0;
    const right = { x: Math.cos(heading + Math.PI / 2), y: Math.sin(heading + Math.PI / 2) };
    craft.forEach((a) => {
      const slot = order.indexOf(a.id) * 6000 - 9000 + (scatter ? 4000 * (r() - 0.5) : 0);
      a.x = right.x * slot + 1000 * (r() - 0.5) * (scatter ? 1 : 0);
      a.y = right.y * slot;
      a.hdg = heading;
    });
    const want = page.v6.inferLineAbreastFormFromCurrentState();
    const got = inferLineAbreastForm(craft.map((a) => ({ id: a.id, xFt: a.x, yFt: a.y, headingRad: a.hdg })), formation);
    assert.equal(got, want, `${formation} order ${order}`);
    if (want === 'weighted' && formation !== 'weighted') inferredWeighted++;
    if (want === 'weightedReverse' && formation !== 'weightedReverse') inferredReverse++;
  }
  // The test really does reach both answers.
  assert.ok(inferredWeighted > 0 && inferredReverse > 0);
});

test('two-ship and four-ship: isTwoShip follows the preset, and a two-ship never changes preset', () => {
  assert.equal(isTwoShip('twoShip'), true);
  for (const f of ['weighted', 'weightedReverse', 'offsetBox']) assert.equal(isTwoShip(f), false);
  const pair = [{ id: 1, xFt: 0, yFt: 0, headingRad: 0 }, { id: 2, xFt: 0, yFt: 6000, headingRad: 0 }];
  assert.equal(inferLineAbreastForm(pair, 'twoShip'), 'twoShip');
  assert.equal(degToRad(90), Math.PI / 2);
});
