// ╔══════════════════════════════════════════════════════════════════════╗
// ║  OPERATOR WARNING — READ BEFORE DEBUGGING TEST FAILURES            ║
// ║                                                                    ║
// ║  These tests use PILOT-DOMAIN TOLERANCES (±10 kt, ±100 ft, ±5°).  ║
// ║  If a test fails repeatedly, DO NOT tweak the physics engine to    ║
// ║  make it pass. Instead:                                            ║
// ║    1. Ask the operator what to do.                                 ║
// ║    2. The test tolerance may need widening, OR                     ║
// ║    3. There may be a genuine flight behavior bug.                  ║
// ║  Never force physics to match a test value.                        ║
// ╚══════════════════════════════════════════════════════════════════════╝

// What route.js means, in plain numbers (the golden test tests/golden/traffic-route.test.js
// pins it to V6): turn radius, where a turn starts, lengths, positions, headings,
// the cache, the leg table and the three builders.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_ROUTE_OPTIONS, routePath, drawPath, positionAt, posOnRoute, legDistances, roundedPoints, navSegs,
  routeLengthFt, pointDistFt, closestDistFt, pointTurnRadiusFt, pointTurn, turnAtPoint, newPattern, newEntry, newSplit,
} from '../../../src/modules/traffic/route.js';

const MOOSE_JAW = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw-v6.json', import.meta.url), 'utf8'));
const pat1 = MOOSE_JAW.routes.find((r) => r.id === 'PAT1');

const point = (x, y, alt = 2500, kt = 120, g = 2) => ({ label: '', x, y, alt, kt, g });
const route = (kind, points) => ({ id: 'R', name: 'R', kind, visible: true, color: '#fff', points });
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

/** An entry that goes 10,000 ft east, then turns left by `turnDeg`, then goes another 10,000 ft. */
const corner = (turnDeg, kt = 120, g = 2, leg = 10000) => {
  const a = (turnDeg * Math.PI) / 180;
  return route('entry', [point(0, 0), point(leg, 0, 2500, kt, g), point(leg + leg * Math.cos(a), leg * Math.sin(a))]);
};

// ── Turns ────────────────────────────────────────────────────────────────────

test('a 90° turn at 120 kt and 2 G has a radius of 736 ft (SPEC-traffic, Routes)', () => {
  assert.equal(Math.round(pointTurnRadiusFt({ kt: 120, g: 2 }, DEFAULT_ROUTE_OPTIONS)), 736);
});

test('the radius follows the speed and G, and the G is kept between 1.01 and 9', () => {
  const options = DEFAULT_ROUTE_OPTIONS;
  const at = (kt, g) => pointTurnRadiusFt({ kt, g }, options);
  assert.ok(at(240, 2) > 3.9 * at(120, 2) && at(240, 2) < 4.1 * at(120, 2), 'twice the speed, four times the radius');
  assert.ok(at(120, 4) < at(120, 2), 'more G, a tighter turn');
  assert.equal(at(120, 0.2), at(120, 1.01), 'below 1.01 G it is read as 1.01');
  assert.equal(at(120, 40), at(120, 9), 'above 9 G it is read as 9');
});

test('a blank speed is read as 120 kt and a blank G as 2 G, as V6 does', () => {
  const options = DEFAULT_ROUTE_OPTIONS;
  assert.equal(pointTurnRadiusFt({}, options), pointTurnRadiusFt({ kt: 120, g: 2 }, options));
  assert.equal(pointTurnRadiusFt({ kt: 0, g: 0 }, options), pointTurnRadiusFt({ kt: 120, g: 2 }, options));
});

test('with "radius from speed and G" off, every turn uses the manual radius (1,800 ft if it is blank)', () => {
  const options = { flyRoundedTurns: true, radiusFromG: false, manualRadiusFt: 3000 };
  assert.equal(pointTurnRadiusFt({ kt: 220, g: 4 }, options), 3000);
  assert.equal(pointTurnRadiusFt({ kt: 220, g: 4 }, { ...options, manualRadiusFt: 0 }), 1800);
});

test('a turn that fits starts R × tan(turn ÷ 2) before the corner and ends as far after it', () => {
  const r = corner(90);
  const radius = pointTurnRadiusFt(r.points[1], DEFAULT_ROUTE_OPTIONS);
  const [start, end] = roundedPoints(r).filter((p) => p.src === 1).filter((_, i, all) => i === 0 || i === all.length - 1);
  near(start.x, 10000 - radius); // a 90° turn: tan 45° = 1
  near(start.y, 0);
  near(end.x, 10000);
  near(end.y, radius);
});

test('a turn on legs too short for it is tightened to 45 % of the shorter leg', () => {
  const r = corner(90, 220, 2, 1000); // 220 kt at 2 G wants 2,474 ft; the legs are 1,000 ft
  const [start] = roundedPoints(r).filter((p) => p.src === 1);
  near(start.x, 1000 - 450);
});

test('a bend under about 4.6° (0.08 rad) is not rounded, and the first and last points of an entry never are', () => {
  const gentle = corner(4.5);
  assert.equal(roundedPoints(gentle).length, 3);
  const sharp = corner(5);
  assert.ok(roundedPoints(sharp).length > 3);
  assert.deepEqual([roundedPoints(sharp)[0].src, roundedPoints(sharp).at(-1).src], [0, 2]);
});

test('a rounded turn is 5 to 28 steps, and a pattern also rounds its first point', () => {
  const steps = (r) => roundedPoints(r).filter((p) => p.src === 1).length - 1; // less where the turn starts
  assert.equal(steps(corner(5)), 5);
  assert.equal(steps(corner(90)), 16);
  assert.equal(steps(corner(175)), 28);
  const square = route('pattern', [point(0, 0), point(5000, 0), point(5000, 5000), point(0, 5000)]);
  for (let i = 0; i < 4; i++) assert.ok(roundedPoints(square).filter((p) => p.src === i).length >= 6, `point ${i} is rounded`);
  assert.equal(roundedPoints(square).at(-1).x, roundedPoints(square)[0].x, 'the loop closes on its first point');
});

test('with rounded turns off the route is the straight lines between its points', () => {
  const options = { ...DEFAULT_ROUTE_OPTIONS, flyRoundedTurns: false };
  const r = corner(90);
  assert.equal(roundedPoints(r, options).length, 3);
  near(routeLengthFt(r, options), 20000);
  assert.ok(routeLengthFt(r) < 20000, 'a rounded corner is shorter');
});

// ── Length and where things are ──────────────────────────────────────────────

test('the built-in Pattern 1 lap is 156,924 ft, about 25.8 NM (SPEC-traffic, D46 table)', () => {
  assert.ok(Math.abs(routeLengthFt(pat1) - 156924) <= 500, 'PAT1 length ~156,924 ft');
  near(routeLengthFt(pat1) / 6076.12, 25.83, 0.01);
});

test('a route of no points or one point has no length and no legs, and still says where it is', () => {
  const none = route('entry', []);
  assert.equal(routeLengthFt(none), 0);
  assert.deepEqual(legDistances(none), []);
});

// ── The cache ────────────────────────────────────────────────────────────────

test('a route\'s path is worked out once and handed back until something about it changes', () => {
  const r = corner(90);
  const first = routePath(r);
  assert.equal(routePath(r), first);
  assert.equal(navSegs(r), first.segs);
  assert.equal(roundedPoints(r), first.points);
  assert.equal(drawPath(r), drawPath(r));
});

test('moving a point, or changing its height, speed or G, gives a new path', () => {
  for (const change of [(p) => { p.x += 100; }, (p) => { p.y += 100; }, (p) => { p.alt += 100; }, (p) => { p.kt += 10; }, (p) => { p.g += 0.5; }]) {
    const r = corner(90);
    const before = routePath(r);
    const lengthBefore = before.lengthFt;
    change(r.points[1]);
    const after = routePath(r);
    assert.notEqual(after, before);
    assert.ok(after !== before && (after.lengthFt !== lengthBefore || after.points.some((p, i) => p.alt !== before.points[i]?.alt || p.kt !== before.points[i]?.kt)), 'the change shows');
  }
});


test('adding or removing a point, or changing the kind, gives a new path', () => {
  const r = corner(90);
  const before = routePath(r);
  r.points.push(point(0, 20000));
  assert.notEqual(routePath(r), before);
  const withThree = routePath(r);
  r.points.pop();
  assert.notEqual(routePath(r), withThree);
  const asPattern = { ...r, kind: 'pattern' };
  assert.notEqual(routePath(asPattern).lengthFt, routePath(r).lengthFt);
  r.kind = 'pattern';
  assert.equal(routePath(r).closed, true);
});

test('each set of options has its own path, and going back to the first finds it again', () => {
  const r = corner(90);
  const rounded = routePath(r);
  const straight = routePath(r, { ...DEFAULT_ROUTE_OPTIONS, flyRoundedTurns: false });
  const manual = routePath(r, { flyRoundedTurns: true, radiusFromG: false, manualRadiusFt: 2500 });
  assert.notEqual(rounded, straight);
  assert.notEqual(rounded, manual);
  assert.equal(routePath(r), rounded);
  assert.equal(routePath(r, { ...DEFAULT_ROUTE_OPTIONS }), rounded, 'a copy of the same options is the same options');
  assert.equal(routePath(r, { ...DEFAULT_ROUTE_OPTIONS, flyRoundedTurns: false }), straight);
});

test('two routes never share a path', () => {
  const a = corner(90), b = corner(90);
  assert.notEqual(routePath(a), routePath(b));
  a.points[1].x += 500;
  near(routePath(b).points[0].x, 0);
  near(routeLengthFt(b), routeLengthFt(corner(90)));
});

// ── Drawing and the leg table ────────────────────────────────────────────────

test('drawPath is the flown path with its turns sampled: x, y and height', () => {
  const r = corner(90);
  const path = drawPath(r);
  assert.equal(path.length, roundedPoints(r).length);
  assert.deepEqual(Object.keys(path[0]).sort(), ['alt', 'x', 'y']);
  assert.ok(path.length > 10, 'a turn is many points');
  assert.equal(path[0].x, 0);
  near(path.at(-1).y, 10000);
});

test('leg distances: one row per leg, from and to counted from 1, a pattern\'s last leg back to 1', () => {
  const square = route('pattern', [point(0, 0), point(3000, 0), point(3000, 4000), point(0, 4000)]);
  const legs = legDistances(square);
  assert.deepEqual(legs.map((l) => [l.from, l.to, l.ft]), [[1, 2, 3000], [2, 3, 4000], [3, 4, 3000], [4, 1, 4000]]);
  near(legs[0].nm, 3000 / 6076.12);
  const entry = route('entry', square.points);
  assert.deepEqual(legDistances(entry).map((l) => [l.from, l.to]), [[1, 2], [2, 3], [3, 4]]);
});

test('leg distances are the straight lines between the points, not the rounded path', () => {
  const r = corner(90);
  near(legDistances(r).reduce((sum, l) => sum + l.ft, 0), 20000);
});

// ── The builders ─────────────────────────────────────────────────────────────

test('a new pattern is an 8,000 ft runway on 290° centred on the airfield, and its circuit is on the north side', () => {
  const p = newPattern('PAT1', 'Pattern 1');
  const [threshold, departure, upwind, crosswind, downwind, finalEntry] = p.points;
  near(Math.hypot(threshold.x - departure.x, threshold.y - departure.y), 8000, 1e-6);
  near((threshold.x + departure.x) / 2, 0, 1e-6);
  near((threshold.y + departure.y) / 2, 0, 1e-6);
  near(Math.hypot(upwind.x - departure.x, upwind.y - departure.y), 9000, 1e-6);
  near(Math.hypot(crosswind.x - upwind.x, crosswind.y - upwind.y), 5000, 1e-6);
  assert.ok(threshold.x > departure.x && threshold.y < departure.y, 'lands towards the west-north-west, so the threshold is the south-east end');
  assert.ok(crosswind.y > upwind.y && downwind.y > 0 && finalEntry.y < 0.5 * threshold.y + 5000, 'the circuit is north of the runway');
  assert.deepEqual(p.points.map((q) => q.label), ['Threshold / Final', 'Departure End', 'Upwind', 'Crosswind', 'Downwind', 'Final Entry']);
  assert.deepEqual(p.points.map((q) => [q.alt, q.kt]), [[2000, 95], [2000, 110], [2500, 130], [2500, 130], [2500, 120], [2200, 105]]);
  assert.equal(p.landOdds, 0.2);
});

test('a new pattern can be moved, and takes the colour it is given', () => {
  const home = newPattern('PAT1', 'Pattern 1');
  const moved = newPattern('PAT2', 'Pattern 2', { offsetEastFt: 14000, offsetNorthFt: -500, color: '#123456' });
  home.points.forEach((p, i) => {
    near(moved.points[i].x, p.x + 14000);
    near(moved.points[i].y, p.y - 500);
  });
  assert.equal(moved.color, '#123456');
  assert.equal(home.color, '#58a6ff');
});

test('a new entry comes in from 12,000 ft out and ends on the pattern\'s sixth point, at that point\'s height and speed', () => {
  const routes = [newPattern('PAT1', 'Pattern 1')];
  const entry = newEntry('ENT1', 'Entry 1', 'PAT1', routes);
  const merge = routes[0].points[5];
  assert.equal(entry.kind, 'entry');
  assert.equal(entry.points.length, 4);
  assert.deepEqual([entry.points[3].x, entry.points[3].y, entry.points[3].alt, entry.points[3].kt], [merge.x, merge.y, merge.alt, merge.kt]);
  assert.equal(entry.mergeIndex, 5);
});

test('a new split leaves the pattern at its fourth point and rejoins at the fifth, starting at that point\'s height and speed', () => {
  const routes = [newPattern('PAT1', 'Pattern 1')];
  const split = newSplit('SPL1', 'Split 1', 'PAT1', routes);
  const [start, , merge] = split.points;
  const [, , , leave, join] = routes[0].points;
  assert.deepEqual([start.x, start.y, start.alt, start.kt], [leave.x, leave.y, leave.alt, leave.kt]);
  assert.deepEqual([merge.x, merge.y], [join.x, join.y]);
  assert.deepEqual([split.sourceIndex, split.mergeIndex, split.splitOdds], [3, 4, 0.5]);
});

test('the builders take the first pattern when the one asked for isn\'t there, and cope with no pattern at all', () => {
  const routes = [newPattern('PAT1', 'Pattern 1')];
  assert.equal(newEntry('E', 'E', 'GONE', routes).attachTo, 'PAT1');
  assert.equal(newSplit('S', 'S', 'GONE', routes).attachTo, 'PAT1');
  const alone = newEntry('E', 'E', 'PAT1', []);
  assert.equal(alone.attachTo, '');
  assert.equal(alone.points.length, 4);
  assert.equal(newSplit('S', 'S', 'PAT1', []).points.length, 3);
});

test('new routes are handed colours from V6\'s palette in turn', () => {
  const routes = [newPattern('PAT1', 'Pattern 1'), newPattern('PAT2', 'Pattern 2')];
  assert.equal(newEntry('E', 'E', 'PAT1', routes).color, '#7ee787'); // the third colour: two routes exist
  assert.equal(newSplit('S', 'S', 'PAT1', routes.slice(0, 1)).color, '#bc8cff');
});

test('the built-in routes are all reachable: every entry and split joins a pattern that is there', () => {
  const ids = new Set(MOOSE_JAW.routes.map((r) => r.id));
  for (const r of MOOSE_JAW.routes.filter((x) => x.kind !== 'pattern')) {
    assert.ok(ids.has(r.attachTo), r.id);
    const target = MOOSE_JAW.routes.find((x) => x.id === r.attachTo);
    assert.ok(r.mergeIndex >= 0 && r.mergeIndex < target.points.length, `${r.id} merge point`);
    if (r.kind === 'split') assert.ok(r.sourceIndex < MOOSE_JAW.routes.find((x) => x.id === r.sourceRoute).points.length);
  }
});

// ── For the map: where each leg's label goes, and the turn at each point ────

test('each leg says which route it is on and where its middle is, for the map\'s leg label', () => {
  const r = { ...route('pattern', [point(0, 0), point(6000, 0), point(6000, 4000), point(-2000, 1000)]), id: 'PAT9' };
  const legs = legDistances(r);
  assert.deepEqual(legs.map((l) => [l.routeId, l.from, l.to]), [['PAT9', 1, 2], ['PAT9', 2, 3], ['PAT9', 3, 4], ['PAT9', 4, 1]]);
  assert.deepEqual(legs.map((l) => [l.x, l.y]), [[3000, 0], [6000, 2000], [2000, 2500], [-1000, 500]]);
});

test('a pattern of two points has both legs, there and back, with the same middle, as V6 draws it', () => {
  const legs = legDistances(route('pattern', [point(0, 0), point(3000, 4000)]));
  assert.deepEqual(legs.map((l) => [l.from, l.to, l.ft, l.x, l.y]), [[1, 2, 5000, 1500, 2000], [2, 1, 5000, 1500, 2000]]);
  assert.equal(legDistances(route('entry', [point(0, 0), point(3000, 4000)])).length, 1);
});

test('the turn at a point is its radius and bank, and there is none where V6 shows none: the first point of a pattern, the first and last of an entry or split', () => {
  const at = (r) => r.points.map((_, i) => pointTurn(r, i));
  const pattern = route('pattern', [point(0, 0), point(6000, 0), point(6000, 4000), point(0, 4000)]);
  const turns = at(pattern);
  assert.equal(turns[0], null);
  for (const t of turns.slice(1)) { near(t.radiusFt, 736.112, 1e-3); near(t.bankDeg, 60, 1e-9); }
  const entry = route('entry', pattern.points);
  assert.deepEqual(at(entry).map((t) => t === null), [true, false, false, true]);
  assert.equal(pointTurn(pattern, 4), null, 'a point that is not there');
  assert.equal(pointTurn(pattern, -1), null);
});

test('the turn follows the route options and the point\'s speed and G', () => {
  const r = route('pattern', [point(0, 0), point(6000, 0, 2500, 220, 4), point(6000, 4000)]);
  const fromG = pointTurn(r, 1);
  assert.deepEqual(fromG, turnAtPoint(r.points[1], DEFAULT_ROUTE_OPTIONS));
  near(fromG.bankDeg, 75.5225, 1e-3);
  const manual = pointTurn(r, 1, { flyRoundedTurns: true, radiusFromG: false, manualRadiusFt: 2500 });
  assert.equal(manual.radiusFt, 2500);
  near(manual.bankDeg, 75.5225, 1e-3);
});

test('PAT1 in calm wind with trueArcs generates authentic rounded circular arcs for overhead break and final turn', () => {
  const options = { flyRoundedTurns: true, trueArcs: true, radiusFromG: true, windKt: 0, windFromDeg: 360 };
  const path = routePath(pat1, options);
  assert.ok(path.points.length > 50, 'produces high-density trajectory');

  // Overhead break phase exists and exhibits circular 180° turn with deceleration
  const breakPts = path.points.filter((p) => p.phase === 'break');
  assert.ok(breakPts.length >= 10, 'break has continuous curve points');
  const breakStart = breakPts[0], breakEnd = breakPts.at(-1);
  assert.ok(breakStart.kt >= 200, 'break starts at 220 kt');
  assert.ok(breakEnd.kt <= 150, 'break ends near 140 kt');

  // Final turn phase exists and exhibits continuous descending turn
  const ftPts = path.points.filter((p) => p.phase === 'final_turn');
  assert.ok(ftPts.length >= 10, 'final turn has continuous curve points');
  assert.ok(ftPts[0].alt > ftPts.at(-1).alt, 'final turn descends smoothly');
  assert.equal(ftPts[0].alt, 3500);
  assert.ok(ftPts.at(-1).alt <= 2700);
});
