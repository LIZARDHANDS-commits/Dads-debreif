// Golden test (R9, D10): src/modules/traffic/route.js against V6's own Traffic
// page. V6's roundedPoints, navSegs, routeLen, pointProg, posOnRoute, closestProg
// and the three builders (defaultPattern, defaultEntry, defaultSplit) run in
// Node (tests/golden/traffic-v6.js) next to route.js, on every built-in route
// and on a grid of generated ones, and agree within 1e-9 ft.
//
// V6's y points south, the rebuild's north: V6 gets each route with y flipped
// and the answers are flipped back before they are compared. Nothing else differs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_ROUTE_OPTIONS, roundedPoints, navSegs, routeLengthFt, pointDistFt, posOnRoute, closestDistFt,
  pointTurnRadiusFt, newPattern, newEntry, newSplit, isClosedRoute,
} from '../../src/modules/traffic/route.js';
import {
  loadV6Traffic, v6DefaultProfile, v6ProfileToSetup, toV6Route, fromV6Route, fromV6Point, V6_PALETTE, V6_SETTINGS, assertClose,
} from './traffic-v6.js';
import { seeded } from './inputs.js';

const MOOSE_JAW = JSON.parse(readFileSync(new URL('../../src/modules/traffic/data/moose-jaw-v6.json', import.meta.url), 'utf8'));
const V6_PROFILE = v6DefaultProfile();

// ── The built-in data ────────────────────────────────────────────────────────

test('moose-jaw-v6.json is V6\'s built-in profile: y flipped to north, start times rounded, a version added', () => {
  assertClose(MOOSE_JAW, v6ProfileToSetup(V6_PROFILE), 'moose-jaw-v6.json', 0);
  assert.equal(MOOSE_JAW.version, 1);
  assert.equal(MOOSE_JAW.routes.length, 9);
  assert.deepEqual(MOOSE_JAW.routes.map((r) => r.id), V6_PROFILE.routes.map((r) => r.id));
  assert.equal(MOOSE_JAW.aircraft.length, 7);
});

test('every point of every built-in route is V6\'s with y negated and the speed called kt', () => {
  MOOSE_JAW.routes.forEach((route, ri) => {
    const v6 = V6_PROFILE.routes[ri];
    assert.equal(route.points.length, v6.points.length, route.id);
    route.points.forEach((p, i) => {
      const q = v6.points[i];
      assert.equal(p.x, q.x, `${route.id} point ${i + 1} x`);
      assert.ok(p.y === -q.y, `${route.id} point ${i + 1} y: ${p.y} vs ${q.y}`);
      assert.equal(p.alt, q.alt);
      assert.equal(p.kt, q.spd);
      assert.equal(p.g, q.g);
      assert.equal(p.label, q.label);
    });
  });
});

test('the start times are V6\'s rounded to whole seconds, and the types give the colours V6 shows', () => {
  V6_PROFILE.aircraft.forEach((a, i) => {
    const mine = MOOSE_JAW.aircraft[i];
    assert.equal(mine.startsAtSec, Math.round(a.delay), a.id);
    assert.ok(Number.isInteger(mine.startsAtSec));
    assert.ok(Math.abs(mine.startsAtSec - a.delay) < 0.5, a.id);
    assert.equal(mine.routeId, a.baseRouteId);
    assert.equal(mine.startIndex, a.start);
    assert.equal(mine.type, a.type);
  });
});

// ── Routes to compare on ─────────────────────────────────────────────────────

const OPTION_SETS = [
  { flyRoundedTurns: true, radiusFromG: true, manualRadiusFt: 1800 },
  { flyRoundedTurns: true, radiusFromG: false, manualRadiusFt: 1800 },
  { flyRoundedTurns: true, radiusFromG: false, manualRadiusFt: 3500 },
  { flyRoundedTurns: false, radiusFromG: true, manualRadiusFt: 1800 },
];

/** V6's settings for one set of route options. */
function v6Settings(options) {
  return { ...V6_SETTINGS, flyRoundedTurns: options.flyRoundedTurns, turnRadiusFromG: options.radiusFromG, manualTurnRadius: String(options.manualRadiusFt) };
}

/** A route with the same points in both worlds: `mine` (y north) and `v6` (y south, V6's own fields). */
function both(route, v6Route = toV6Route(route)) {
  return { name: route.id, mine: route, v6: v6Route };
}

const BUILT_IN = MOOSE_JAW.routes.map((route, i) => both(route, V6_PROFILE.routes[i]));

const rand = seeded(0x7261);
const between = (lo, hi) => lo + (hi - lo) * rand();

/** A point of a generated route; `kt` and `g` are V6's `spd` and `g`. */
const point = (x, y, alt, kt, g) => ({ label: '', x, y, alt, kt, g });

/** A route of three points that turns by turnDeg at the middle one. */
function corner(kind, turnDeg, len1, len2, kt, g) {
  const b = point(len1, 0, 3500, kt, g);
  const a = (turnDeg * Math.PI) / 180;
  return {
    id: `${kind}-${turnDeg}-${len1}-${len2}-${kt}-${g}`, name: 'Corner', kind, visible: true, color: '#fff',
    points: [point(0, 0, 2000, 120, 2), b, point(len1 + len2 * Math.cos(a), len2 * Math.sin(a), 2500, 95, 1.5)],
  };
}

const GENERATED = [];
// Turns from 5° to 175° (and just either side of V6's 0.08 rad = 4.58° limit, and the straight and the U-turn),
// short and long legs, fast and slow, gentle and hard.
for (const turn of [0, 4.5, 4.7, 5, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 175, 180]) {
  for (const [l1, l2] of [[500, 500], [500, 20000], [20000, 500], [3000, 3000], [9000, 12000], [40000, 40000]]) {
    for (const [kt, g] of [[120, 2], [220, 2], [140, 1], [90, 4], [200, 9], [120, 0], [0, 2], [300, 20]]) {
      GENERATED.push(both(corner('entry', turn, l1, l2, kt, g)));
    }
  }
}
// Closed routes: regular polygons and seeded irregular ones, every point with its own height, speed and G.
for (const n of [3, 4, 5, 6, 8, 12]) {
  for (const radius of [800, 5000, 30000]) {
    const points = Array.from({ length: n }, (_, i) => {
      const a = (2 * Math.PI * i) / n;
      return point(radius * Math.cos(a), radius * Math.sin(a), 1500 + 500 * i, 90 + 25 * i, 1 + (i % 4));
    });
    GENERATED.push(both({ id: `poly-${n}-${radius}`, name: 'Polygon', kind: 'pattern', visible: true, color: '#fff', points }));
  }
}
for (let k = 0; k < 40; k++) {
  const n = 3 + Math.floor(rand() * 10);
  const points = Array.from({ length: n }, () => point(between(-30000, 30000), between(-30000, 30000), Math.round(between(500, 5000)), Math.round(between(60, 260)), +between(0.5, 10).toFixed(1)));
  GENERATED.push(both({ id: `random-${k}`, name: 'Random', kind: k % 3 === 0 ? 'pattern' : k % 3 === 1 ? 'entry' : 'split', visible: true, color: '#fff', points }));
}
// Odd ones: two points, one point, none, the same point twice, a pattern of two points, missing height, speed and G.
const twoPoints = [point(0, 0, 2000, 100, 2), point(3000, -4000, 3000, 160, 2)];
GENERATED.push(
  both({ id: 'two-open', name: 'Two', kind: 'entry', visible: true, color: '#fff', points: twoPoints }),
  both({ id: 'two-closed', name: 'Two loop', kind: 'pattern', visible: true, color: '#fff', points: twoPoints }),
  both({ id: 'one-open', name: 'One', kind: 'split', visible: true, color: '#fff', points: [point(10, 20, 2000, 100, 2)] }),
  both({ id: 'one-closed', name: 'One loop', kind: 'pattern', visible: true, color: '#fff', points: [point(10, 20, 2000, 100, 2)] }),
  both({ id: 'none-open', name: 'None', kind: 'entry', visible: true, color: '#fff', points: [] }),
  both({ id: 'none-closed', name: 'None loop', kind: 'pattern', visible: true, color: '#fff', points: [] }),
  both({ id: 'repeat-open', name: 'Repeat', kind: 'entry', visible: true, color: '#fff', points: [point(0, 0, 2000, 100, 2), point(0, 0, 2000, 100, 2), point(5000, 0, 2500, 120, 2), point(5000, 5000, 3000, 140, 2), point(5000, 5000, 3000, 140, 2), point(0, 5000, 3000, 140, 2)] }),
  both({ id: 'repeat-closed', name: 'Repeat loop', kind: 'pattern', visible: true, color: '#fff', points: [point(0, 0, 2000, 100, 2), point(6000, 0, 2000, 100, 2), point(6000, 0, 2500, 120, 2), point(6000, 6000, 3000, 140, 2), point(0, 6000, 3000, 140, 2)] }),
  both({ id: 'gaps', name: 'Gaps', kind: 'pattern', visible: true, color: '#fff', points: [{ x: 0, y: 0 }, { x: 8000, y: 0, alt: 3000 }, { x: 8000, y: 8000, kt: 200 }, { x: 0, y: 8000, g: 3 }] }),
);

const ALL = [...BUILT_IN, ...GENERATED];

/** V6's route point or path point without its label (path points made by route.js have none). */
const noLabel = ({ label, ...rest }) => rest;

/**
 * Runs `check(route, v6, options)` on every route under every set of route options.
 * V6 is loaded with cacheRoutes so each route is rounded once, by V6's own code,
 * instead of several times per lookup; the answer it remembers is V6's.
 */
function forEveryRoute(routes, check) {
  for (const options of OPTION_SETS) {
    const v6 = loadV6Traffic({ settings: v6Settings(options), cacheRoutes: true });
    for (const route of routes) check(route, v6, options);
  }
}

/** Distances to look up on a route: the ends, either side of them, past them, the corners and seeded ones. */
function distancesFor(route, v6) {
  const len = v6.routeLen(route.v6);
  const out = [-5000, -1, 0, 1e-9, 1, len / 3, len / 2, len - 1e-9, len, len + 1, len + 5000, 3 * len + 123.4];
  for (let i = 0; i <= route.v6.points.length + 1; i++) out.push(v6.pointProg(route.v6, i));
  let run = 0;
  for (const s of v6.navSegs(route.v6)) { out.push(run); run += s.len; }
  for (let k = 0; k < 12; k++) out.push(between(-0.2 * len, 2.5 * len));
  return out.filter(Number.isFinite);
}

// ── The path ─────────────────────────────────────────────────────────────────

test('turn radius: the point\'s own, from its speed and G (limited to 1.01 to 9), or the manual one', () => {
  const v6 = loadV6Traffic();
  for (const kt of [0, 60, 120, 220, 350, undefined, NaN]) {
    for (const g of [0, 0.5, 1, 1.01, 2, 4, 9, 12, undefined, NaN]) {
      const p = { x: 0, y: 0, alt: 2000, kt, g };
      for (const options of OPTION_SETS) {
        v6.settings.turnRadiusFromG = options.radiusFromG;
        v6.settings.manualTurnRadius = String(options.manualRadiusFt);
        assertClose(pointTurnRadiusFt(p, options), v6.pointTurnRadius({ x: 0, y: 0, alt: 2000, spd: kt, g }), `kt=${kt} g=${g}`);
      }
    }
  }
  // V6 reads a blank or zero manual radius as 1,800 ft.
  assert.equal(pointTurnRadiusFt({ kt: 120, g: 2 }, { flyRoundedTurns: true, radiusFromG: false, manualRadiusFt: 0 }), 1800);
  // 120 kt at 2 G, the spec's 736 ft.
  assert.equal(Math.round(pointTurnRadiusFt({ kt: 120, g: 2 }, DEFAULT_ROUTE_OPTIONS)), 736);
});

test('roundedPoints: the same points as V6, turn by turn, with the same height, speed, G and source point', () => {
  forEveryRoute(ALL.filter((r) => r.mine.points.length > 0), (route, v6, options) => {
    const expected = v6.roundedPoints(route.v6).map((p) => noLabel(fromV6Point(p)));
    const actual = roundedPoints(route.mine, options).map(noLabel);
    assertClose(actual, expected, `${route.name} ${JSON.stringify(options)}`);
  });
});

test('navSegs and routeLen: the same legs and the same length as V6', () => {
  forEveryRoute(ALL, (route, v6, options) => {
    const where = `${route.name} ${JSON.stringify(options)}`;
    const expected = v6.navSegs(route.v6).map((s) => ({ a: noLabel(fromV6Point(s.a)), b: noLabel(fromV6Point(s.b)), len: s.len, i: s.i }));
    const actual = navSegs(route.mine, options).map(({ a, b, len, i }) => ({ a: noLabel(a), b: noLabel(b), len, i }));
    assertClose(actual, expected, where);
    assertClose(routeLengthFt(route.mine, options), v6.routeLen(route.v6), `${where} length`);
  });
});

test('pointProg: the distance to each point (where its turn starts) is V6\'s', () => {
  forEveryRoute(ALL, (route, v6, options) => {
    for (let i = -1; i <= route.mine.points.length + 2; i++) {
      assertClose(pointDistFt(route.mine, i, options), v6.pointProg(route.v6, i), `${route.name} point ${i} ${JSON.stringify(options)}`);
    }
  });
});

test('posOnRoute: position, height, speed, G, leg and how far along the leg, at every kind of distance', () => {
  forEveryRoute(ALL, (route, v6, options) => {
    for (const dist of distancesFor(route, v6)) {
      const expected = noLabel(fromV6Point(v6.posOnRoute(route.v6, dist)));
      const { headingDeg, ...actual } = posOnRoute(route.mine, dist, options);
      assertClose(actual, expected, `${route.name} at ${dist} ${JSON.stringify(options)}`);
      assert.ok(headingDeg >= 0 && headingDeg < 360, `heading ${headingDeg}`);
    }
  });
});

test('closestProg: the distance along the route of the nearest place to a point is V6\'s', () => {
  forEveryRoute(ALL, (route, v6, options) => {
    const targets = [{ x: 0, y: 0 }, ...route.v6.points.map((p) => ({ x: p.x, y: p.y })), ...Array.from({ length: 8 }, () => ({ x: between(-40000, 40000), y: between(-40000, 40000) }))];
    for (const target of targets) {
      assertClose(closestDistFt(route.mine, { x: target.x, y: -target.y }, options), v6.closestProg(route.v6, target), `${route.name} ${JSON.stringify(target)} ${JSON.stringify(options)}`);
    }
  });
});

test('the built-in routes agree with V6\'s own data too: every merge point is found where V6 finds it', () => {
  // handleRouteEnd joins an entry or split to its pattern at closestProg(pattern, the merge point).
  const v6 = loadV6Traffic();
  for (const route of MOOSE_JAW.routes.filter((r) => r.kind !== 'pattern')) {
    const pattern = MOOSE_JAW.routes.find((r) => r.id === route.attachTo);
    const v6Pattern = V6_PROFILE.routes.find((r) => r.id === route.attachTo);
    const merge = pattern.points[route.mergeIndex];
    const v6Merge = v6Pattern.points[route.mergeIndex];
    assertClose(closestDistFt(pattern, merge), v6.closestProg(v6Pattern, v6Merge), `${route.id} joins ${pattern.id}`);
  }
});

test('a route is closed only if it is a pattern', () => {
  assert.equal(isClosedRoute({ kind: 'pattern' }), true);
  assert.equal(isClosedRoute({ kind: 'entry' }), false);
  assert.equal(isClosedRoute({ kind: 'split' }), false);
});

// ── The builders ─────────────────────────────────────────────────────────────

/** The rebuild's route as V6 would have it after the flip, to compare with what V6's builder made. */
const asRebuildRoute = (v6Route) => fromV6Route(v6Route);

test('newPattern is V6\'s defaultPattern: the generic 8,000 ft runway on 290° with its circuit, y flipped', () => {
  const v6 = loadV6Traffic();
  for (const [id, name, east, north, color] of [['PAT1', 'Pattern 1', 0, 0, V6_PALETTE[0]], ['PAT2', 'Pattern 2', 14000, 0, V6_PALETTE[1]], ['PAT3', 'Pattern 3', 28000, 6500, V6_PALETTE[2]], ['PAT4', 'P', -3000, -12000, '#123456']]) {
    const expected = asRebuildRoute(v6.defaultPattern(id, name, east, -north, color));
    assertClose(newPattern(id, name, { offsetEastFt: east, offsetNorthFt: north, color }), expected, id);
  }
  // With no options: at the airfield, in the first colour.
  assertClose(newPattern('PAT1', 'Pattern 1'), asRebuildRoute(v6.defaultPattern('PAT1', 'Pattern 1', 0, 0, V6_PALETTE[0])));
  const pattern = newPattern('PAT1', 'Pattern 1');
  assert.equal(pattern.kind, 'pattern');
  assert.equal(pattern.points.length, 6);
  assert.equal(pattern.landOdds, 0.2);
});

/** Routes for the entry and split builders to look in, with V6's copies. */
function listsOfRoutes() {
  const generic = newPattern('PAT1', 'Pattern 1');
  const second = newPattern('PAT2', 'Pattern 2', { offsetEastFt: 14000 });
  const oneEntry = { id: 'ENT1', name: 'Entry 1', kind: 'entry', visible: true, color: '#fff', attachTo: 'PAT1', mergeIndex: 2, points: [point(0, 0, 3000, 150, 2), point(2000, 0, 3000, 150, 2)] };
  const short = (n) => ({ id: 'PATN', name: 'Short', kind: 'pattern', visible: true, color: '#fff', landOdds: 0.2, points: Array.from({ length: n }, (_, i) => point(1000 * i, 300 * i * i, 2000 + 100 * i, 100 + 10 * i, 2)) });
  const bare = { id: 'PATG', name: 'No heights', kind: 'pattern', visible: true, color: '#fff', landOdds: 0.2, points: Array.from({ length: 6 }, (_, i) => ({ x: 1000 * i, y: (i % 2) * 2000 })) };
  return [
    ['the generic pattern', [generic], 'PAT1'],
    ['a pattern whose points have no height, speed or G', [bare], 'PATG'],
    ['the built-in Moose Jaw pattern and its entries', MOOSE_JAW.routes, 'PAT1'],
    ['two patterns, the second asked for', [generic, second], 'PAT2'],
    ['an id that is not there, so the first pattern', [generic, second], 'NOPE'],
    ['an entry first, then a pattern', [oneEntry, generic], 'PAT1'],
    ['a pattern of one point', [short(1)], 'PATN'],
    ['a pattern of two points', [short(2)], 'PATN'],
    ['a pattern of four points', [short(4)], 'PATN'],
    ['no pattern at all', [oneEntry], 'PAT1'],
    ['no routes at all', [], 'PAT1'],
  ];
}

test('newEntry is V6\'s defaultEntry: an approach that ends on the pattern\'s sixth point (or its last)', () => {
  const v6 = loadV6Traffic();
  for (const [what, routes, patternId] of listsOfRoutes()) {
    v6.state.routes = routes.map(toV6Route);
    for (const color of ['#abcdef', V6_PALETTE[3]]) {
      assertClose(newEntry('ENT9', 'Entry 9', patternId, routes, { color }), asRebuildRoute(v6.defaultEntry('ENT9', 'Entry 9', patternId, color)), `${what} ${patternId}`);
    }
  }
});

test('newSplit is V6\'s defaultSplit: leaves the pattern at its fourth point and rejoins at the next', () => {
  const v6 = loadV6Traffic();
  for (const [what, routes, patternId] of listsOfRoutes()) {
    v6.state.routes = routes.map(toV6Route);
    for (const color of ['#abcdef', V6_PALETTE[5]]) {
      assertClose(newSplit('SPL9', 'Split 9', patternId, routes, { color }), asRebuildRoute(v6.defaultSplit('SPL9', 'Split 9', patternId, color)), `${what} ${patternId}`);
    }
  }
});

test('the builders link to the pattern by its id and by point index, as V6 does', () => {
  const routes = [newPattern('PAT1', 'Pattern 1')];
  const entry = newEntry('ENT1', 'Entry 1', 'PAT1', routes);
  assert.equal(entry.kind, 'entry');
  assert.equal(entry.attachTo, 'PAT1');
  assert.equal(entry.mergeIndex, 5);
  assert.equal(entry.points.length, 4);
  const split = newSplit('SPL1', 'Split 1', 'PAT1', routes);
  assert.equal(split.kind, 'split');
  assert.equal(split.sourceRoute, 'PAT1');
  assert.equal(split.sourceIndex, 3);
  assert.equal(split.attachTo, 'PAT1');
  assert.equal(split.mergeIndex, 4);
  assert.equal(split.splitOdds, 0.5);
});
