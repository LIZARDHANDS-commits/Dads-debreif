// Golden test (R9): the turning order and per-wingman turn logic of
// src/modules/turn-sim/engine/plan.js against V6's own displayedOutsideInOrder,
// tacticalOrderForDelayIn, sideOfLeadIn, sideOfAircraftFrom and turnDirFromLogic.
// The seeds put the aircraft anywhere, at any heading, so ties and odd layouts are covered.
import test from 'node:test';
import assert from 'node:assert/strict';
import { V6_DEFAULTS, aircraftKey } from '../../src/modules/turn-sim/settings.js';
import { displayedOutsideInOrder, turningOrder, sideOfLead, sideOfAircraftFrom, turnDirFromLogic, cueTargetForAircraft, selectedDirSign } from '../../src/modules/turn-sim/engine/plan.js';
import { createV6Page } from './turn-sim-fake-page.js';
import { seeded } from './inputs.js';

const FORMATIONS = ['weighted', 'weightedReverse', 'offsetBox', 'twoShip'];
const LOGICS = ['auto', 'selected', 'right', 'left', 'toward', 'away'];
const pick = (r, list) => list[Math.floor(r() * list.length)];

/** A V6 page with the four aircraft scattered, and the same aircraft in the port's shape. */
function* layouts(count = 300) {
  const r = seeded(0x91a7);
  for (let i = 0; i < count; i++) {
    const settings = {
      ...V6_DEFAULTS,
      formation: pick(r, FORMATIONS),
      direction: pick(r, ['right', 'left']),
      startHeadingDeg: pick(r, [0, 90, 180, 270, Math.round(360 * r())]),
      clockCueAircraft: pick(r, [1, 2, 3, 4]),
    };
    for (const id of [1, 2, 3, 4]) {
      settings[aircraftKey(id, 'turnLogic')] = pick(r, LOGICS);
      settings[aircraftKey(id, 'clockTarget')] = pick(r, ['global', '1', '2', '3', '4']);
    }
    const page = createV6Page(settings);
    const grid = i % 4 === 0; // some layouts on exact lines, so equal sort keys occur
    const sameHeading = r() * 2 * Math.PI - Math.PI;
    page.aircraft().forEach((a) => {
      a.x = grid ? 3000 * Math.floor(4 * r()) : 20000 * (r() - 0.5);
      a.y = grid ? 3000 * Math.floor(4 * r()) : 20000 * (r() - 0.5);
      a.hdg = i % 3 === 0 ? sameHeading : 2 * Math.PI * r() - Math.PI;
    });
    const mine = page.aircraft().map((a) => ({ id: a.id, xFt: a.x, yFt: a.y, headingRad: a.hdg, turnLogic: a.turnLogic, clockTarget: a.clockTarget }));
    yield { settings, page, mine };
  }
}

const ids = (list) => list.map((a) => a.id);

test('displayedOutsideInOrder and turningOrder match V6 (line abreast by the 3/9 line, offset box front element first)', () => {
  for (const { settings, page, mine } of layouts()) {
    const v6All = page.aircraft();
    const active = settings.formation === 'twoShip' ? [0, 1] : [0, 1, 2, 3];
    const v6List = active.map((i) => v6All[i]);
    const list = active.map((i) => mine[i]);
    const turnRight = settings.direction === 'right';
    assert.deepEqual(ids(displayedOutsideInOrder(list, turnRight, settings.startHeadingDeg)), ids(page.v6.displayedOutsideInOrder(v6List, turnRight)), JSON.stringify(settings));
    assert.deepEqual(ids(turningOrder(list, settings)), ids(page.v6.tacticalOrderForDelayIn(v6List)), JSON.stringify(settings));
  }
});

test('sideOfLead and sideOfAircraftFrom match V6', () => {
  for (const { settings, page, mine } of layouts()) {
    const v6All = page.aircraft();
    for (const a of mine) {
      assert.equal(sideOfLead(mine, a, settings.startHeadingDeg), page.v6.sideOfLeadIn(v6All, v6All.find((x) => x.id === a.id)));
      for (const t of mine) assert.equal(sideOfAircraftFrom(a, t), page.v6.sideOfAircraftFrom(v6All.find((x) => x.id === a.id), v6All.find((x) => x.id === t.id)));
    }
    assert.equal(sideOfAircraftFrom(null, mine[0]), 0);
  }
});

test('the cue aircraft and turnDirFromLogic match V6 for every turn logic (D41 has not changed toward and away yet)', () => {
  const seen = new Set();
  for (const { settings, page, mine } of layouts()) {
    const v6All = page.aircraft();
    for (const a of mine) {
      const b = v6All.find((x) => x.id === a.id);
      assert.equal(cueTargetForAircraft(a, mine, settings.clockCueAircraft)?.id, page.v6.cueTargetForAircraft(b, v6All)?.id);
      for (const logic of LOGICS) {
        a.turnLogic = b.turnLogic = logic;
        for (const defaultDir of [-1, 1]) {
          const got = turnDirFromLogic(a, mine, defaultDir, settings);
          assert.equal(got, page.v6.turnDirFromLogic(b, v6All, defaultDir), `${logic} ${JSON.stringify(settings)}`);
          seen.add(`${logic}${got}`);
        }
      }
    }
    assert.equal(selectedDirSign(settings.direction), settings.direction === 'right' ? -1 : 1);
  }
  for (const logic of ['toward', 'away']) assert.ok(seen.has(`${logic}1`) && seen.has(`${logic}-1`), `${logic} reaches both directions`);
});
