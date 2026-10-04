// Checks: automatic deconfliction does what a pilot would expect, and its own moves (the flinch, the climb before a
// fly-through breaks out, the move-over, the straight-in rejoin and a PFL's bank away) fly as Patrick's answers say. Two aircraft on a collision course never get
// inside the red, one of them gives way by the rule and the other keeps its track, nothing happens far out,
// the right-of-way answer is the same whichever aircraft you ask, and a broken aircraft stops nothing.
// Serves: Patrick, 4 Oct 09:40Z to 11:26Z (deconfliction asks and his nine answers); design D1, D2, D11, D13-D15.
// Expected values: geometry worked by hand (closing speeds and distances); the 200/200 ft red and 500/500 ft
// caution are Patrick's (TR-Q11); the right-of-way rows are the Flying Orders and SMM paragraphs in deconflict.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { closestApproach, firstEntry, firstEntrySampled } from '../../../src/core/closest-approach.js';
import { rightOfWay, freeze } from '../../../src/modules/traffic/deconflict.js';
import { createSim } from '../../../src/modules/traffic/sim.js';
import { readFileSync } from 'node:fs';
import { buildFlinch, buildClimbAhead, EVADE } from '../../../src/modules/traffic/evade.js';
import { buildGoAround } from '../../../src/modules/traffic/circuit.js';
import { followRoute, startSideStep } from '../../../src/modules/traffic/path-follower.js';
import { legOffsetsFt } from '../../../src/core/geo.js';
import { gFromBankDeg } from '../../../src/core/flight-math.js';
import { wrapDeg180 } from '../../../src/core/angles.js';

const CAUTION = { latFt: 500, vertFt: 500 };

test('closest approach: head-on, crossing, diverging and stacked, worked by hand', () => {
  // Head-on along x, 10,000 ft apart, each at 400 ft/s: they meet at 12.5 s, and are 500 ft apart at 11.875 s.
  const a = { x: 0, y: 0, z: 3500, vx: 400, vy: 0, vz: 0 }, b = { x: 10000, y: 0, z: 3500, vx: -400, vy: 0, vz: 0 };
  const cpa = closestApproach(a, b);
  assert.ok(cpa.closing && Math.abs(cpa.tcpaSec - 12.5) < 0.01 && cpa.missFt < 1);
  assert.ok(Math.abs(firstEntry(a, b, CAUTION, 60) - 11.875) < 0.01);
  // Diverging: never.
  assert.equal(firstEntry(a, { ...b, vx: 400 }, CAUTION, 60), null);
  // Stacked 600 ft apart in height: never inside 500 ft vertical.
  assert.equal(firstEntry(a, { ...b, z: 4100 }, CAUTION, 60), null);
  // Crossing at right angles, both 400 ft/s, 8,000 ft from the crossing: inside 500 ft when 8,000 - 400 t = 500 / sqrt 2.
  const c = { x: -8000, y: 0, z: 3500, vx: 400, vy: 0, vz: 0 }, d = { x: 0, y: -8000, z: 3500, vx: 0, vy: 400, vz: 0 };
  assert.ok(Math.abs(firstEntry(c, d, CAUTION, 60) - (8000 - 500 / Math.SQRT2) / 400) < 0.01);
  // A straight track sampled each second gives the same answer as the exact one.
  const track = (p) => Array.from({ length: 31 }, (_, i) => ({ x: p.x + p.vx * i, y: p.y + p.vy * i, z: p.z }));
  assert.ok(Math.abs(firstEntrySampled(track(c), track(d), CAUTION, 1) - firstEntry(c, d, CAUTION, 30)) < 0.01);
});

// Two square circuits that cross at the origin at the same moment (200 KIAS, 20,000 ft from the crossing).
function crossingSim({ on, altB = 3500, delayB = 0 }) {
  const square = (id, pts, alt) => ({ id, name: id, kind: 'pattern', points: pts.map(([x, y]) => ({ x, y, alt, kt: 200, g: 2 })) });
  const routes = [
    square('C1', [[-20000, 0], [20000, 0], [20000, 40000], [-20000, 40000]], 3500),
    square('C2', [[0, -20000], [0, 20000], [-40000, 20000], [-40000, -20000]], altB),
  ];
  const aircraft = [
    { id: 'A1', type: 'CT-156', routeId: 'C1', startIndex: 0, startsAtSec: 0 },
    { id: 'A2', type: 'CT-156', routeId: 'C2', startIndex: 0, startsAtSec: delayB },
  ];
  return createSim({ routes, aircraft, deconflict: on, windKt: 0 }, { seed: 1 });
}

// Flies the pair for 2 minutes (the crossing is at about 1 minute) and reports the closest each way and the tags.
function fly(sim) {
  let closest = Infinity, inRed = false;
  const tagged = new Map(), alts = { A1: [], A2: [] };
  for (let t = 0.5; t <= 120; t += 0.5) {
    sim.stepTo(t);
    const [a, b] = sim.state().aircraft;
    const lat = Math.hypot(a.x - b.x, a.y - b.y), vert = Math.abs(a.alt - b.alt);
    if (lat < 200 && vert < 200) inRed = true;
    closest = Math.min(closest, lat);
    for (const ac of [a, b]) { alts[ac.id].push(ac.alt); if (ac.deconflict && !tagged.has(ac.id)) tagged.set(ac.id, ac.deconflict); }
  }
  return { closest, inRed, tagged, alts };
}

test('collision course at the same height: never inside the red with deconfliction on, and inside it with it off', () => {
  assert.equal(fly(crossingSim({ on: false })).inRed, true, 'the check can fail: with it off they meet');
  const r = fly(crossingSim({ on: true }));
  assert.equal(r.inRed, false, 'never inside 200 ft and 200 ft');
  // Same height, no rule between them: the one with the other on its right gives way (Patrick, 11:25Z). A1 flies
  // east and A2 comes up from the south, so A2 is on A1's right: A1 breaks out and A2 keeps its height.
  assert.deepEqual([...r.tagged.keys()], ['A1']);
  assert.match(r.tagged.get('A1'), /GIVING WAY/);
  assert.ok(r.alts.A2.every((z) => Math.abs(z - 3500) <= 100), 'the one with right of way stays at its height (±100 ft)');
});

test('collision course with one 200 ft higher: the higher aircraft is the one that moves', () => {
  const r = fly(crossingSim({ on: true, altB: 3700 }));
  assert.equal(r.inRed, false);
  assert.deepEqual([...r.tagged.keys()], ['A2']);
});

test('nothing happens far out: the same two crossing a minute apart are never moved', () => {
  const r = fly(crossingSim({ on: true, delayB: 60 }));
  assert.equal(r.tagged.size, 0);
});

const at = (id, standing, more = {}) => ({ id, standing, x: 0, y: 0, alt: 3500, trackDeg: 0, ...more });

test('right of way: the answer is the same whichever aircraft you ask, and only one gives way', () => {
  const standings = ['initial', 'break', 'inner_downwind', 'final_turn', 'final', 'outer_downwind', 'climb_out', 'joining', 'straight_in', 'pfl', 'fly_through', 'manoeuvring'];
  for (const s1 of standings) {
    for (const s2 of standings) {
      const p = at('A1', s1, { x: -1000, trackDeg: 90 }), q = at('A2', s2, { y: -1000 });
      const one = rightOfWay(p, q), two = rightOfWay(q, p);
      assert.deepEqual(one, two, `${s1} and ${s2}`);
      if (one.giver) assert.notEqual(one.giver, one.holder);
    }
  }
});

test('right of way follows the orders and the SMM', () => {
  // The PFL keeps right of way; an overhead aircraft at initial flies through (Patrick 09:43Z; WFO S2 art 401 para 9).
  assert.deepEqual(rightOfWay(at('A1', 'pfl'), at('A2', 'initial')), { giver: 'A2', holder: 'A1', move: 'fly_through', rule: 'PFL has right of way' });
  // Established in the pattern over joining (SMM 4.15 para 35).
  assert.equal(rightOfWay(at('A1', 'outer_downwind'), at('A2', 'joining')).giver, 'A2');
  // The perch is the point of no return (Patrick's card, Q1): before it the one about to perch breaks out ...
  assert.deepEqual(rightOfWay(at('A1', 'inner_downwind'), at('A2', 'straight_in')).giver, 'A1');
  // ... past it the straight-in moves over toward the inner runway and goes around (SMM 4.28 para 68, 4.21 paras 50-51).
  const past = rightOfWay(at('A1', 'final_turn'), at('A2', 'straight_in'));
  assert.equal(past.giver, 'A2');
  assert.equal(past.move, 'move_over');
  // A fly-through against downwind traffic climbs straight ahead, then breaks out (Patrick's card, Q4).
  assert.equal(rightOfWay(at('A1', 'fly_through'), at('A2', 'outer_downwind')).move, 'climb_breakout');
  // Two PFLs never meet by rule (WFO S2 art 403 para 1d): no one is told to give way.
  assert.equal(rightOfWay(at('A1', 'pfl'), at('A2', 'pfl')).giver, null);
});

test('a broken aircraft stops nothing: one with no position is left out, the others are still checked', () => {
  const good = { id: 'A1', active: true, x: 0, y: 0, alt: 3500, gsKt: 200, trackDeg: 90, mode: 'RAIL' };
  const broken = { id: 'A2', active: true, x: NaN, y: 0, alt: 3500, gsKt: 200, trackDeg: 90, mode: 'RAIL' };
  const frozen = freeze([good, broken], () => null, () => null);
  assert.deepEqual(frozen.map((f) => f.id), ['A1']);
});

// The deconfliction's own moves (evade.js, circuit.js buildGoAround, path-follower.js side step), flown in three winds.
const WINDS = [{ windFromDeg: 360, windKt: 0 }, { windFromDeg: 298, windKt: 20 }, { windFromDeg: 200, windKt: 25 }];
const MJ = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));
const PAT = MJ.routes.find((r) => r.id === 'PAT1');

test('the flinch gets out of the way: up about 500 ft, or a bank away to the side asked, never past 60° or the stall line', () => {
  // Design section 2.5: about one caution distance (500 ft, an estimate); bank up to 60° (SMM 4.14 para 33).
  const from = { x: 0, y: -20000, alt: 3500, kias: 220, headingDeg: 90, bankDeg: 0 };
  for (const w of WINDS) {
    const up = buildFlinch(from, w, { mode: 'climb', side: 1 });
    assert.ok(Math.abs(up.at(-1).alt - 3500 - EVADE.flinchFt) <= 100, `climbs about 500 ft (${up.at(-1).alt})`);
    const left = buildFlinch(from, w, { mode: 'bank', side: -1 });
    assert.ok(left.at(-1).y > from.y + 200, 'heading east, a left bank moves it north');
    assert.ok(left.every((p) => Math.abs(p.alt - 3500) <= 1 && p.g <= gFromBankDeg(60) + 0.01), 'level, never past 60° of bank');
  }
});

test('a fly-through breaking out climbs straight ahead to about 500 ft above pattern height first (Q4)', () => {
  const from = { x: 0, y: 0, alt: 3500, kias: 220, headingDeg: 298, bankDeg: 0 };
  for (const w of WINDS) {
    const path = buildClimbAhead(from, w, 4000);
    assert.ok(Math.abs(path.at(-1).alt - 4000) <= 100);
    assert.ok(path.every((p) => Math.abs(wrapDeg180(p.headingDeg - 298)) <= 5), 'straight ahead (±5°)');
  }
});

test('the move-over flies up the runway about 500 ft toward the inner runway and never descends (Q5)', () => {
  const rwy = { a: PAT.points[0], b: PAT.points[1] };
  for (const w of WINDS) {
    const path = buildGoAround(PAT.points, { x: 25000, y: -13000, alt: 2600, kias: 140, headingDeg: 298, bankDeg: 0 }, w.windFromDeg, w.windKt, EVADE.moveOverFt);
    const overRunway = path.filter((p) => { const o = legOffsetsFt(rwy.a, rwy.b, p); return o.alongFt > 1000 && o.alongFt < 4000; });
    assert.ok(overRunway.length > 0);
    // Right of runway 29L's track is north, toward 29R.
    assert.ok(overRunway.every((p) => Math.abs(legOffsetsFt(rwy.a, rwy.b, p).crossFt - EVADE.moveOverFt) <= 100));
    assert.ok(path.every((p, i) => i === 0 || p.alt >= path[i - 1].alt - 1), 'never descends');
  }
});

test('a broken-out straight-in rejoins as a straight-in: on its line, at its height, and lands (Q7)', () => {
  const setup = structuredClone(MJ);
  setup.windFromDeg = 298;
  setup.windKt = 15;
  setup.aircraft = [{ id: 'A1', type: 'CT-156', routeId: 'ENT2', startIndex: 0, startsAtSec: 0 }];
  const sim = createSim(setup, { seed: 1 });
  sim.stepTo(60);
  sim.command('A1', 'breakout');
  const seen = new Set();
  for (let t = 61; t <= 700; t += 1) {
    sim.stepTo(t);
    const a = sim.state().aircraft[0];
    seen.add(`${a.routeId}:${a.phase}`);
  }
  assert.ok(seen.has('ENT2:rejoin'), 'flies back toward the straight-in');
  assert.ok([...seen].some((k) => k.startsWith('PAT1:')), 'back on the straight-in and into the circuit');
  assert.ok(![...seen].some((k) => k.startsWith('ENT1')), 'not sent round the overhead entry');
});

test('a PFL banks away and comes back onto its path with no jump', () => {
  const route = { id: 'R', kind: 'flown', points: [{ x: 0, y: 0, alt: 3000, kt: 120 }, { x: 0, y: 40000, alt: 2000, kt: 120 }] };
  const a = { distFt: 0, x: 0, y: 0, alt: 3000, iasKt: 120, headingDeg: 0, bankDeg: 0 };
  followRoute(a, route, null, 0.05);
  startSideStep(a, 90, EVADE.flinchFt, EVADE.bankAwayOutSec, EVADE.bankAwayBackSec);
  let most = 0, prev = { x: a.x, y: a.y };
  for (let t = 0; t < EVADE.bankAwayOutSec + EVADE.bankAwayBackSec + 2; t += 0.05) {
    followRoute(a, route, null, 0.05);
    most = Math.max(most, a.x);
    assert.ok(Math.hypot(a.x - prev.x, a.y - prev.y) < 20, 'no jump between steps');
    assert.ok(Math.abs(a.bankDeg) <= 35, 'a gentle bank away (an estimate)');
    prev = { x: a.x, y: a.y };
  }
  assert.ok(Math.abs(most - EVADE.flinchFt) <= 10, 'out about 500 ft');
  assert.ok(Math.abs(a.x) < 1 && !a.sideStep, 'back on its path');
});
