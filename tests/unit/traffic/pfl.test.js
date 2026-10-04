// Checks: the PFL (Traffic spec 4.5): from a spread of failure points and winds it lands on the runway or ejects
//   as the energy says, takes no drag before the circle or a committed direct glide, never does worse with more
//   height, and in the sim never moves further in a step than it flies; the PFL button, an area start that lands
//   and flies a touch-and-go, and one far too low and far out that ejects.
// Serves: TR-R14, TR-R30, TR-R35.
// Expected values: end results only (on the runway, ejected, back in the circuit); clean glide 2 NM per 1,000 ft
//   (T-6A max glide chart; SMM 13.5 para 7); start points are the circuit's own points and spec 4.5's keys; the
//   step limit and the 10 minute safety stop have their reasons beside them; touchdown in the first third of the
//   runway (Patrick 4 Oct 09:49Z).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createSim, STEP_SEC } from '../../../src/modules/traffic/sim.js';
import { flyPfl, pflGeometry } from '../../../src/modules/traffic/pfl.js';
import { THRESHOLD_29L, DEPARTURE_END_29L, RUNWAY_29L_HDG_DEG, FIELD_ELEV_FT } from '../../../src/modules/traffic/airfield.js';

const MOOSE_JAW = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));
const NM = 6076.12;
const KT_TO_FTPS = NM / 3600;

function createTestSim(wind = {}) {
  const setup = structuredClone(MOOSE_JAW);
  Object.assign(setup, wind);
  return createSim(setup);
}

/** Along and across the runway from the threshold, ft. */
function onRunway(p) {
  const ux = DEPARTURE_END_29L.x - THRESHOLD_29L.x, uy = DEPARTURE_END_29L.y - THRESHOLD_29L.y;
  const len = Math.hypot(ux, uy);
  const along = ((p.x - THRESHOLD_29L.x) * ux + (p.y - THRESHOLD_29L.y) * uy) / len;
  const across = Math.abs((p.x - THRESHOLD_29L.x) * uy - (p.y - THRESHOLD_29L.y) * ux) / len;
  return along >= 0 && along <= len && across <= 150;
}

// From the threshold at runway heading, `nm` out on the reciprocal (a straight-in final).
const onFinal = (nm) => {
  const back = (RUNWAY_29L_HDG_DEG + 180) * Math.PI / 180;
  return { x: THRESHOLD_29L.x + nm * NM * Math.sin(back), y: THRESHOLD_29L.y + nm * NM * Math.cos(back) };
};

// Failure points: the circuit's own points (moose-jaw.json PAT1), spec 4.5's keys, and the training area.
const STARTS = {
  'High Key, 5,000 ft': { ...THRESHOLD_29L, alt: 5000, kias: 125, headingDeg: 298 },
  'High Key, 6,500 ft (above the window)': { ...THRESHOLD_29L, alt: 6500, kias: 125, headingDeg: 298 },
  'Break, 220 kt': { x: -288, y: -1441, alt: 3500, kias: 220, headingDeg: 298 },
  'Break exit, 140 kt': { x: -3385, y: -4323, alt: 3500, kias: 140, headingDeg: 118 },
  'Abeam departure end, 220 kt': { x: -10974, y: -12100, alt: 3500, kias: 220, headingDeg: 118 },
  'Area, 5 NM south, 7,500 ft': { x: THRESHOLD_29L.x, y: THRESHOLD_29L.y - 5 * NM, alt: 7500, kias: 125, headingDeg: 0 },
  'Area, 10 NM east, 8,000 ft': { x: THRESHOLD_29L.x + 10 * NM, y: THRESHOLD_29L.y, alt: 8000, kias: 125, headingDeg: 270 },
};
const WINDS = [{ windFromDeg: 360, windKt: 0 }, { windFromDeg: 298, windKt: 20 }, { windFromDeg: 208, windKt: 20 }];
const RANK = { eject: 0, go_around: 1, landed: 2 };

test('PFL: from each failure point with the height for it, it glides to the runway in calm air and 20 kt (head and cross)', () => {
  for (const wind of WINDS) {
    for (const [name, start] of Object.entries(STARTS)) {
      const r = flyPfl(start, wind);
      const last = r.points.at(-1);
      assert.equal(r.outcome, 'landed', `${name}, ${wind.windKt} kt from ${wind.windFromDeg}: ${r.outcome}`);
      assert.ok(onRunway(last), `${name}, ${wind.windKt} kt from ${wind.windFromDeg}: touched down off the runway`);
      for (const p of r.points) assert.ok([p.x, p.y, p.alt, p.kt].every(Number.isFinite), `${name}: a number is not finite`);
    }
  }
});

test('PFL: on profile at High Key or Low Key, or high at High Key, it touches down in the first third of the runway (spec 4.5 items 7, 13)', () => {
  const geo = pflGeometry();
  const lowKey = geo.at(180);
  // SMM key heights: High Key 5,000 ft, Low Key 3,700 ft MSL.
  const keys = {
    'High Key, 5,000 ft': { ...THRESHOLD_29L, alt: 5000, kias: 125, headingDeg: 298 },
    'Low Key, 3,700 ft': { x: lowKey.x, y: lowKey.y, alt: 3700, kias: 120, headingDeg: 118 },
    // 600 ft high at High Key: all the drag out early, then the circle widened before Final Key (Patrick 10:10Z).
    'High Key, 5,600 ft': { ...THRESHOLD_29L, alt: 5600, kias: 125, headingDeg: 298 },
  };
  for (const wind of WINDS) {
    for (const [name, start] of Object.entries(keys)) {
      const r = flyPfl(start, wind);
      assert.equal(r.outcome, 'landed', `${name}, ${wind.windKt} kt from ${wind.windFromDeg}: ${r.outcome}`);
      assert.ok(r.touchdown.alongFt <= geo.lenFt / 3, `${name}, ${wind.windKt} kt from ${wind.windFromDeg}: touched down ${Math.round(r.touchdown.alongFt)} ft down the runway`);
    }
  }
});

test('PFL: far too low to make the runway, it ejects (spec 4.5 item 10)', () => {
  // 2 NM per 1,000 ft clean: 1,108 ft above the field glides about 2.2 NM, nowhere near 30 NM.
  const r = flyPfl({ x: THRESHOLD_29L.x + 30 * NM, y: THRESHOLD_29L.y, alt: 3000, kias: 125, headingDeg: 270 }, WINDS[0]);
  assert.equal(r.outcome, 'eject');
  assert.ok(r.eject, 'says where it ejected');
});

test('PFL: no gear or flap before it is on the circle or committed direct (SMM 13.6 para 15, 13.17 para 39)', () => {
  for (const wind of WINDS) {
    for (const [name, start] of Object.entries(STARTS)) {
      for (const p of flyPfl(start, wind).points) {
        if (/^(Zoom|Slow to 125|Join)/.test(p.decision ?? '')) assert.equal(p.config, 'Clean', `${name}: ${p.config} while "${p.decision}"`);
      }
    }
  }
});

test('PFL: more height at the start never gives a worse result', () => {
  const starts = { ...STARTS, '2 NM final, 2,700 ft': { ...onFinal(2), alt: 2700, kias: 120, headingDeg: 298 } };
  for (const wind of WINDS) {
    for (const [name, start] of Object.entries(starts)) {
      const low = flyPfl(start, wind), high = flyPfl({ ...start, alt: start.alt + 500 }, wind);
      assert.ok(RANK[high.outcome] >= RANK[low.outcome], `${name}, ${wind.windKt} kt: ${low.outcome} at ${start.alt} ft but ${high.outcome} 500 ft higher`);
    }
  }
});

test('PFL button: engine failure on the spot, on the follower (RAIL), clean, zooming above 150 KIAS', () => {
  const sim = createTestSim();
  const id = sim.spawn({ type: 'CT-156', routeId: 'PAT1', startPoint: 9, delaySec: 0 });
  sim.stepTo(0.1);
  const before = sim.state().aircraft.find((a) => a.id === id);
  assert.equal(before.status, 'flying');
  assert.ok(before.kt > 150, `starts above 150 KIAS (${before.kt})`);

  assert.equal(sim.command(id, 'pfl_current'), true);
  const after = sim.state().aircraft.find((a) => a.id === id);
  assert.equal(after.mode, 'RAIL');
  assert.equal(after.engineFailed, true);
  assert.equal(after.phase, 'pfl_zoom');
  assert.equal(after.config, 'Clean');
  assert.ok(after.pflDecision, 'the tag has a decision (TR-R35)');
});

test('PFL from the area: lands on the runway, then flies a touch-and-go back into the circuit (spec 4.5 item 13)', () => {
  const sim = createTestSim({ windFromDeg: 360, windKt: 5 });
  const id = sim.spawnPflFromArea({ radialDeg: 180, distNm: 3, altFt: 6200 });
  let ac = sim.state().aircraft.find((a) => a.id === id);
  assert.equal(ac.engineFailed, true);

  let lowest = null;
  let lastStep = null;
  // 10 minutes is a safety stop: 3 NM from 6,200 ft is a few minutes of glide.
  for (let s = 0; s < 12000 && ac.engineFailed; s++) {
    sim.stepTo(sim.t + STEP_SEC);
    ac = sim.state().aircraft.find((a) => a.id === id);
    if (!lowest || ac.alt < lowest.alt) lowest = { x: ac.x, y: ac.y, alt: ac.alt };
    // No step longer than it flies: true airspeed (under 200 kt here) plus 5 kt of wind, with half again for
    // the follower catching up onto its path.
    if (lastStep) assert.ok(Math.hypot(ac.x - lastStep.x, ac.y - lastStep.y) <= 205 * KT_TO_FTPS * STEP_SEC * 1.5, 'jumped');
    lastStep = { x: ac.x, y: ac.y };
  }
  assert.equal(ac.engineFailed, false, 'the PFL ended within the safety stop');
  assert.equal(ac.status, 'flying', 'flying again after the touch-and-go');
  assert.equal(ac.routeId, 'PAT1', 'back in the circuit');
  // ±100 ft: the shared height margin (docs/TESTING.md).
  assert.ok(lowest.alt <= FIELD_ELEV_FT + 100, `came down to the runway (lowest ${lowest.alt} ft)`);
  assert.ok(onRunway(lowest), 'the lowest point was on the runway');
});

test('PFL from the area, far too low and far out: ejects, the aircraft is gone and a marker stays (spec 4.5 item 10)', () => {
  const sim = createTestSim({ windFromDeg: 360, windKt: 10 });
  const id = sim.spawnPflFromArea({ radialDeg: 90, distNm: 30, altFt: 3000 });
  let ac = sim.state().aircraft.find((a) => a.id === id);
  // 10 minutes is a safety stop: it ejects as soon as it can't make the runway.
  for (let s = 0; s < 12000 && ac.active; s++) {
    sim.stepTo(sim.t + STEP_SEC);
    ac = sim.state().aircraft.find((a) => a.id === id);
  }
  assert.equal(ac.status, 'ejected');
  assert.equal(ac.active, false);
  assert.ok(ac.ejectAt, 'a marker where it ejected');
  assert.ok(Math.hypot(ac.ejectAt.x - THRESHOLD_29L.x, ac.ejectAt.y - THRESHOLD_29L.y) > 20 * NM, 'it ejected far out, not near the runway');
});
