// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// Tests may be poorly designed, overfitted to obsolete baseline assumptions,
// or time-locked to legacy trajectory floats. Under D411, tests must be updated
// or pruned, never accommodated by degrading aerodynamic fidelity.
// ============================================================================

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

// The Traffic Sim's 2D map (specs/SPEC-traffic.md: The screen). The wording and
// projection are pure and tested directly; the drawing is checked against a
// recording stand-in for the canvas, so what's drawn (and what's written next to
// it, since colour is never the only signal) is pinned without a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSim } from '../../../src/modules/traffic/sim.js';
import { buildScene } from '../../../src/modules/traffic/scene.js';
import { toScreen, visibleBounds } from '../../../src/ui-kit/canvas-view.js';
import {
  HINT_TEXT, LEVEL_MARKS, TYPE_COLORS, MAP_MIN_SPAN_FT, MAP_MAX_SPAN_FT,
  paletteFrom, heightSpeedText, feetText, windText, windBlowsTowardDeg, pointLabelLines, turnLabelText, hintFor,
  sceneBounds, focusBounds, gridStepFt, gridLines, gridLabel, routeStyle, labelAnchor, legLabels, legsToLabel,
  turnedShape, aircraftSymbol, conflictLevels, markRadiiPx, MIN_BUBBLE_PX, MIN_RING_PX, isFlying, aircraftColor, drawScene, createMap2d,
  PHOTO_OFFLINE_TEXT, photoAlignment, photoToWorld, worldToPhoto, photoView, photoCaption,
  calculateGlideFootprint, isPflActive, shouldShowGlideFootprint, getPflBadge,
} from '../../../src/modules/traffic/map2d.js';
import { makeLocalRef, localFtToLatLon, latLonToLocalFt } from '../../../src/core/geo.js';
import { ESRI_IMAGERY } from '../../../src/ui-kit/map-tiles.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} is not ${b}`);

// ---------------------------------------------------------------------------
// Words and numbers

test('the hint says what to do first, only before the run starts, and says so when there is nothing to fly', () => {
  assert.equal(HINT_TEXT, 'Press Play to watch the Moose Jaw traffic.');
  assert.equal(hintFor({ timeS: 0, mode: 'paused', aircraftCount: 7 }), HINT_TEXT);
  assert.equal(hintFor({ timeS: 12, mode: 'paused', aircraftCount: 7 }), '');
  assert.equal(hintFor({ timeS: 0, mode: 'running', aircraftCount: 7 }), '');
  assert.match(hintFor({ timeS: 0, mode: 'paused', aircraftCount: 0 }), /No aircraft yet/);
  assert.equal(hintFor({ timeS: 0, mode: 'paused', aircraftCount: 3, place: '' }), 'Press Play to watch the traffic.', 'a setup of the user\'s own');
  assert.equal(hintFor({ timeS: 0, mode: 'paused', aircraftCount: 3, place: 'Regina' }), 'Press Play to watch the Regina traffic.');
});

test('height and speed read "2,500 ft 220 kt", rounded, never "-0"', () => {
  assert.equal(heightSpeedText({ alt: 2500, kt: 220 }), '2,500 ft 220 kt');
  assert.equal(heightSpeedText({ alt: 1880.4, kt: 99.6 }), '1,880 ft 100 kt');
  assert.equal(heightSpeedText({ alt: -0.2, kt: 0 }), '0 ft 0 kt');
  assert.equal(feetText(12345.4), '12,345 ft');
});

test('the wind label is written only when it isn\'t calm, in three digits, as a METAR gives it', () => {
  assert.equal(windText(250, 20), 'Wind 250°T 20 kt');
  assert.equal(windText(90, 5), 'Wind 090°T 5 kt');
  assert.equal(windText(360, 12), 'Wind 360°T 12 kt');
  assert.equal(windText(0, 12), 'Wind 360°T 12 kt');
  assert.equal(windText(360, 0), '');
  assert.equal(windText(250, 0), '');
});

test('the wind arrow points the way the wind blows: the opposite of where it comes from', () => {
  assert.equal(windBlowsTowardDeg(250), 70);
  assert.equal(windBlowsTowardDeg(360), 180);
  assert.equal(windBlowsTowardDeg(90), 270);
  assert.equal(windBlowsTowardDeg(180), 0);
});

test('a point\'s label is numbered from 1, with its height, speed and G', () => {
  assert.deepEqual(pointLabelLines(5, { label: 'Downwind', alt: 2500, kt: 220, g: 2 }), { title: '6 Downwind', detail: '2,500 ft / 220 kt / 2.0 G' });
  assert.deepEqual(pointLabelLines(0, { alt: 1880, kt: 100 }), { title: '1', detail: '1,880 ft / 100 kt' });
});

test('turn data gives the radius and bank at a rounded point, and the most G when a wind makes it matter', () => {
  assert.equal(turnLabelText({ radiusFt: 2474.2, bankDeg: 60 }), 'R 2,474 ft / bank 60°');
  assert.equal(turnLabelText({ radiusFt: 2474, bankDeg: 60.4, maxG: 2.34 }), 'R 2,474 ft / bank 60° / most 2.3 G');
  assert.equal(turnLabelText({ x: 0, y: 0 }), '', 'a point that doesn\'t turn has none');
});

test('the map\'s colours come from the page\'s tokens, with stand-ins when one is missing', () => {
  const palette = paletteFrom((name) => (name === '--bad' ? '#123456' : ''));
  assert.equal(palette.bad, '#123456');
  assert.equal(palette.caution, '#f5c542');
  assert.equal(palette.halo, '#020a10');
});

// ---------------------------------------------------------------------------
// Where things go

test('the box round the routes takes the points, else the aircraft, and nothing when both are empty', () => {
  assert.deepEqual(sceneBounds([{ points: [{ x: 0, y: 0 }, { x: 10, y: 5 }] }]), { minX: 0, minY: 0, maxX: 10, maxY: 5 });
  assert.deepEqual(sceneBounds([], [{ x: 3, y: 4 }, { x: -1, y: 9 }]), { minX: -1, minY: 4, maxX: 3, maxY: 9 });
  assert.equal(sceneBounds([], []), null);
});

test('the box round several routes is the box round all of them, using the drawn path where a route has one', () => {
  const routes = [
    { points: [{ x: 0, y: 0 }, { x: 10, y: 5 }] },
    { points: [{ x: 0, y: 0 }], path: [{ x: -20, y: -30 }, { x: 40, y: 60 }] },
  ];
  assert.deepEqual(sceneBounds(routes), { minX: -20, minY: -30, maxX: 40, maxY: 60 });
});

test('a hidden route is left out of the box, and the aircraft are used when no route is showing', () => {
  const shown = { points: [{ x: 0, y: 0 }, { x: 10, y: 5 }] };
  const hidden = { visible: false, points: [{ x: -900, y: -900 }, { x: 900, y: 900 }] };
  assert.deepEqual(sceneBounds([shown, hidden]), { minX: 0, minY: 0, maxX: 10, maxY: 5 });
  assert.deepEqual(sceneBounds([hidden], [{ x: 3, y: 4 }]), { minX: 3, minY: 4, maxX: 3, maxY: 4 });
  assert.equal(sceneBounds([hidden]), null);
});

test('a route with 300,000 points still gets its box (a spread list would throw)', () => {
  const points = Array.from({ length: 300_000 }, (_, i) => ({ x: i - 100, y: 50_000 - i }));
  assert.deepEqual(sceneBounds([{ points }]), { minX: -100, minY: 50_000 - 299_999, maxX: 299_899, maxY: 50_000 });
});

test('the grid takes the smallest neat spacing that keeps its lines 40 px apart', () => {
  assert.equal(gridStepFt(0.028), 2000); // 1,000 ft would be 28 px
  assert.equal(gridStepFt(0.05), 1000);
  assert.equal(gridStepFt(2), 100, 'zoomed right in, never finer than 100 ft');
  assert.equal(gridStepFt(0.00001), 100_000, 'zoomed right out, never coarser than 100,000 ft');
  assert.equal(gridLabel(2000), 'Grid: 2,000 ft');
});

test('grid lines fall on whole steps inside the box, through zero', () => {
  assert.deepEqual(gridLines({ minX: -1500, minY: 0, maxX: 2500, maxY: 2000 }, 1000), { xs: [-1000, 0, 1000, 2000], ys: [0, 1000, 2000] });
  assert.deepEqual(gridLines({ minX: -500, minY: -500, maxX: 500, maxY: 500 }, 1000), { xs: [0], ys: [0] });
  assert.ok(gridLines({ minX: -500, minY: 0, maxX: 500, maxY: 0 }, 1000).xs.every((x) => !Object.is(x, -0)));
});

test('patterns are drawn solid, entries dashed and splits dotted, so lines differ by more than colour (V6 line 281)', () => {
  assert.deepEqual(routeStyle('pattern'), { dash: [], width: 3 });
  assert.deepEqual(routeStyle('entry'), { dash: [8, 6], width: 2.5 });
  assert.deepEqual(routeStyle('split'), { dash: [3, 7], width: 2.5 });
  assert.notDeepEqual(routeStyle('pfl').dash, routeStyle('entry').dash);
});

test('a route\'s name sits in the middle of its longest leg, counting a loop\'s closing leg', () => {
  const entry = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 1000 }];
  assert.deepEqual(labelAnchor(entry), { x: 100, y: 500 });
  const loop = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
  assert.deepEqual(labelAnchor(loop, true), { x: 50, y: 50 }, 'the closing leg is the longest');
  assert.deepEqual(labelAnchor([{ x: 7, y: 8 }]), { x: 7, y: 8 });
  assert.equal(labelAnchor([]), null);
});

test('leg distances are the straight legs between the points; a pattern closes its loop, an entry doesn\'t', () => {
  const points = [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 4000 }];
  const pattern = legLabels({ kind: 'pattern', points });
  assert.deepEqual(pattern.map((l) => Math.round(l.ft)), [3000, 4000, 5000]);
  assert.deepEqual([pattern[0].x, pattern[0].y], [1500, 0]);
  assert.deepEqual(legLabels({ kind: 'entry', points }).map((l) => Math.round(l.ft)), [3000, 4000]);
  assert.deepEqual(legLabels({ kind: 'entry', points: [{ x: 0, y: 0 }] }), []);
});

test('an aircraft symbol points along its heading: north up, east right, clockwise', () => {
  const [nose] = aircraftSymbol(0, 10);
  near(nose[0], 0);
  near(nose[1], -10);
  const [east] = aircraftSymbol(90, 10);
  near(east[0], 10);
  near(east[1], 0);
  const [south] = aircraftSymbol(180, 10);
  near(south[0], 0);
  near(south[1], 10);
  const [nw] = aircraftSymbol(315, 10);
  near(nw[0], -10 * Math.SQRT1_2);
  near(nw[1], -10 * Math.SQRT1_2);
  assert.equal(aircraftSymbol(0, 10).length, 4);
  assert.deepEqual(aircraftSymbol(Number.NaN, 10), aircraftSymbol(0, 10), 'no heading draws it pointing north');
});

test('turning a shape keeps its size', () => {
  const shape = [[0, -1], [0.65, 0.7], [0, 0.35], [-0.65, 0.7]];
  const before = shape.map(([x, y]) => Math.hypot(x, y) * 14);
  turnedShape(shape, 137, 14).forEach(([x, y], i) => near(Math.hypot(x, y), before[i], 1e-9));
});

test('an aircraft in more than one pair takes the worst level', () => {
  const levels = conflictLevels([
    { a: 'A1', b: 'A2', level: 'caution' },
    { a: 'A2', b: 'A3', level: 'conflict' },
    { a: 'A1', b: 'A4', level: 'caution' },
    { a: 'A3', b: 'A5', level: 'caution' },
  ]);
  assert.equal(levels.get('A1'), 'caution');
  assert.equal(levels.get('A2'), 'conflict');
  assert.equal(levels.get('A3'), 'conflict', 'a later caution never lowers a conflict');
  assert.equal(levels.get('A5'), 'caution');
  assert.equal(levels.get('A9'), undefined);
});

test('only flying aircraft are drawn; the colour is the aircraft\'s own, else its type\'s (V6), else a neutral one', () => {
  assert.deepEqual(['flying', 'waiting', 'landed', 'done'].map((status) => isFlying({ status })), [true, false, false, false]);
  assert.equal(aircraftColor({ type: 'CT-156' }), TYPE_COLORS['CT-156']);
  assert.equal(aircraftColor({ type: 'CT-156', color: '#010203' }), '#010203');
  assert.equal(aircraftColor({ type: 'Unknown' }), '#c7d8e7');
  assert.deepEqual({ ...TYPE_COLORS }, { 'CT-157': '#a5d6ff', 'CT-156': '#7ee787', 'CT-102': '#ffcc66', 'CT-114': '#ff6b6b' });
});

test('the conflict and caution words match the conflict list\'s', () => {
  assert.deepEqual({ ...LEVEL_MARKS }, { conflict: '⚠ CONFLICT', caution: '△ CAUTION' });
});

// ---------------------------------------------------------------------------
// The drawing, against a recording canvas

// A stand-in for the 2D context that records every call with the colour it was made in.
function recordingContext() {
  const calls = [];
  const state = {};
  const ctx = new Proxy({}, {
    get(_, name) {
      if (name === 'measureText') return (str) => ({ width: String(str).length * 6 });
      if (name in state) return state[name];
      return (...args) => calls.push({ name, args, ...state });
    },
    set(_, name, value) {
      state[name] = value;
      return true;
    },
  });
  return {
    ctx,
    calls,
    named: (name) => calls.filter((c) => c.name === name),
    written: () => calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]),
  };
}

const SIZE = { width: 800, height: 600 };
const VIEW = { cx: 0, cy: 0, scale: 0.05 }; // 20 ft to a pixel, centred on the field
const fakeMap = {
  worldToScreen: (x, y) => toScreen(VIEW, SIZE, x, y),
  size: SIZE,
  view: VIEW,
  visibleBounds: () => visibleBounds(VIEW, SIZE),
};
const screen = (x, y) => toScreen(VIEW, SIZE, x, y);

const PALETTE = paletteFrom(() => '');
const LAYERS_ON = {
  layerTrails: true, layerLabels: true, layerPoints: true, layerBubbles: true, layerCautionRings: true,
  layerLegDistances: false, layerTurnData: false, conflictLatFt: 200, cautionLatFt: 500, windFromDeg: 360, windKt: 0,
};

const pattern = {
  id: 'p1', name: 'Pattern 1', kind: 'pattern', color: '#58a6ff',
  points: [
    { x: 0, y: 0, alt: 1880, kt: 100, g: 2, label: 'Threshold', decision: true, radiusFt: 2474, bankDeg: 60 },
    { x: 0, y: 3000, alt: 2500, kt: 220, g: 2, label: 'Upwind' },
    { x: -3000, y: 3000, alt: 2500, kt: 220, g: 2, label: 'Crosswind' },
    { x: -3000, y: 0, alt: 2500, kt: 220, g: 2, label: 'Downwind' },
  ],
};
const entry = { id: 'e1', name: 'Entry 1', kind: 'entry', color: '#7ee787', points: [{ x: -9000, y: 0, alt: 3500, kt: 220 }, { x: -3000, y: 0, alt: 2500, kt: 220 }] };
const split = { id: 's1', name: 'Split 1', kind: 'split', color: '#ffcc66', points: [{ x: -3000, y: 3000, alt: 3500, kt: 180 }, { x: 0, y: 500, alt: 2000, kt: 120 }] };
const aircraft = [
  { id: 'A1', type: 'CT-156', routeId: 'p1', x: 0, y: 1000, alt: 2500, kt: 220, headingDeg: 90, status: 'flying', startsAt: 0 },
  { id: 'A2', type: 'CT-157', routeId: 'p1', x: 100, y: 1050, alt: 2450, kt: 210, headingDeg: 90, status: 'flying', startsAt: 0 },
  { id: 'A3', type: 'CT-102', routeId: 'p1', x: 500, y: 500, alt: 0, kt: 0, headingDeg: 0, status: 'landed', startsAt: 0 },
  { id: 'A4', type: 'CT-114', routeId: 'e1', x: -9000, y: 0, alt: 3500, kt: 220, headingDeg: 90, status: 'waiting', startsAt: 137 },
  { id: 'A5', type: 'CT-156', routeId: 'p1', x: 300, y: 1500, alt: 2500, kt: 220, headingDeg: 90, status: 'flying', startsAt: 0 },
];
const conflicts = [
  { a: 'A1', b: 'A2', latFt: 111, vertFt: 50, level: 'conflict' },
  { a: 'A2', b: 'A5', latFt: 480, vertFt: 50, level: 'caution' },
];
const scene = (extra = {}) => ({ routes: [pattern, entry, split], selectedRouteId: null, aircraft, conflicts, trails: {}, ...extra });
const draw = (extra, layers = {}) => {
  const rec = recordingContext();
  drawScene(rec.ctx, fakeMap, scene(extra), { ...LAYERS_ON, ...layers }, PALETTE);
  return rec;
};

test('routes are drawn with their own line style, and each one is named on the map', () => {
  const rec = draw();
  const dashes = rec.named('setLineDash').map((c) => JSON.stringify(c.args[0]));
  assert.ok(dashes.includes('[]'), 'the pattern is solid');
  assert.ok(dashes.includes('[8,6]'), 'the entry is dashed');
  assert.ok(dashes.includes('[3,7]'), 'the split is dotted');
  for (const name of ['Pattern 1', 'Entry 1', 'Split 1']) assert.ok(rec.written().includes(name), name);
  // The route lines are in the routes' own colours.
  const strokes = rec.named('stroke').map((c) => c.strokeStyle);
  for (const colour of [pattern.color, entry.color, split.color]) assert.ok(strokes.includes(colour), colour);
});

test('a route can be hidden, and one with fewer than two points draws nothing', () => {
  const hidden = draw({ routes: [{ ...entry, visible: false }, { ...split, points: [split.points[0]] }] });
  assert.ok(!hidden.written().includes('Entry 1'));
  assert.ok(!hidden.written().includes('Split 1'));
});

test('a pattern is closed into a loop, an entry is not', () => {
  const loop = draw({ routes: [pattern] });
  assert.ok(loop.named('closePath').length >= 1);
  const open = draw({ routes: [entry], aircraft: [], conflicts: [] });
  assert.equal(open.named('closePath').length, 0);
});

test('with no route selected, no route points show; picking one shows its points, labelled from 1, a diamond at a decision point', () => {
  const none = draw();
  assert.ok(!none.written().includes('1 Threshold'));
  const rec = draw({ selectedRouteId: 'p1' });
  for (const label of ['1 Threshold', '2 Upwind', '3 Crosswind', '4 Downwind', '1,880 ft / 100 kt / 2.0 G']) assert.ok(rec.written().includes(label), label);
  const [x, y] = screen(0, 0);
  assert.ok(rec.named('moveTo').some((c) => c.args[0] === x && c.args[1] === y - 8), 'a diamond at the decision point');
  assert.ok(!rec.written().includes('1 '), 'no other route\'s points are labelled');
  const off = draw({ selectedRouteId: 'p1' }, { layerPoints: false });
  assert.ok(!off.written().includes('1 Threshold'));
});

test('a label that would run off the right edge of the map goes to the other side of its point, so it can still be read', () => {
  const east = { id: 'p1', name: 'Pattern 1', kind: 'pattern', color: '#58a6ff', points: [
    { x: 0, y: 0, alt: 1880, kt: 100, g: 2, label: 'Threshold' },
    { x: 7800, y: 0, alt: 2500, kt: 220, g: 2, label: 'Departure End' },
    { x: 7800, y: 3000, alt: 2500, kt: 220, g: 2, label: 'Crosswind' },
  ] };
  const rec = draw({ routes: [east], selectedRouteId: 'p1', aircraft: [], conflicts: [] });
  const drawn = (words) => rec.named('fillText').find((c) => c.args[0] === words);
  const [pointX] = screen(7800, 0);
  const far = drawn('2 Departure End');
  assert.equal(far.textAlign, 'right', 'written to the left of the point');
  assert.ok(far.args[1] < pointX, 'and it ends before the point');
  assert.ok(pointX - far.args[1] >= 11, 'the same distance from it as the label on the other side would be');
  const [nearX] = screen(0, 0);
  const near = drawn('1 Threshold');
  assert.equal(near.textAlign, 'left', 'a label with room stays to the right');
  assert.equal(near.args[1], nearX + 11);
});

test('only flying aircraft are drawn, each with its callsign and its height and speed', () => {
  const written = draw().written();
  for (const text of ['A1', 'A2', 'A5', '2,500 ft 220 kt', '2,450 ft 210 kt']) assert.ok(written.includes(text), text);
  for (const id of ['A3', 'A4']) assert.ok(!written.includes(id), `${id} is not flying`);
});

test('the height and speed labels can be switched off; the callsign stays', () => {
  const written = draw({}, { layerLabels: false }).written();
  assert.ok(written.includes('A1'));
  assert.ok(!written.includes('2,500 ft 220 kt'));
});

test('an aircraft symbol is drawn at its position, pointing along its heading', () => {
  const rec = draw({ aircraft: [aircraft[0]], conflicts: [] }, { layerBubbles: false, layerCautionRings: false });
  const [x, y] = screen(0, 1000);
  const [nose] = aircraftSymbol(90, 14);
  assert.ok(rec.named('moveTo').some((c) => Math.abs(c.args[0] - (x + nose[0])) < 1e-9 && Math.abs(c.args[1] - (y + nose[1])) < 1e-9), 'the nose is east of the centre');
});

test('a pair in conflict is marked ⚠ CONFLICT beside each aircraft, and one in caution △ CAUTION, in words as well as colour', () => {
  const rec = draw();
  assert.equal(rec.written().filter((t) => t === '⚠ CONFLICT').length, 2, 'A1 and A2');
  assert.equal(rec.written().filter((t) => t === '△ CAUTION').length, 1, 'A5; A2 is already in conflict');
  const marks = rec.named('fillText').filter((c) => c.args[0].includes('CONFLICT'));
  assert.ok(marks.every((c) => c.fillStyle === PALETTE.bad));
  assert.equal(rec.named('fillText').find((c) => c.args[0].includes('CAUTION')).fillStyle, PALETTE.caution);
  assert.ok(!draw({ conflicts: [] }).written().some((t) => t.includes('CONFLICT') || t.includes('CAUTION')));
});

// At the fitted zoom of the whole Moose Jaw setup the map is about 40,000 ft across in 800 px, so
// 200 ft is 4 px. True-size marks that small look like dots, so each has a smallest size on screen.
const FITTED = 0.02; // px per ft
test('markRadiiPx: true size when there is room, and at least 8 px (bubble) and 12 px (ring) when there is not', () => {
  assert.deepEqual(markRadiiPx(200, 500, 0.05), { bubblePx: 10, ringPx: 25 }, 'zoomed in: true size');
  assert.deepEqual(markRadiiPx(200, 500, FITTED), { bubblePx: 8, ringPx: 12 }, '4 px and 10 px at the fitted zoom become 8 and 12');
  assert.deepEqual(markRadiiPx(200, 500, 0.001), { bubblePx: 8, ringPx: 12 }, 'zoomed right out');
  assert.equal(MIN_BUBBLE_PX, 8);
  assert.equal(MIN_RING_PX, 12);
});

test('markRadiiPx: the ring is always larger than the bubble, even if the limits are the other way round', () => {
  for (const [conflictFt, cautionFt, pxPerFt] of [[200, 500, FITTED], [500, 200, 0.05], [200, 200, 0.05], [1000, 100, 0.01], [0, 0, 0.02]]) {
    const { bubblePx, ringPx } = markRadiiPx(conflictFt, cautionFt, pxPerFt);
    assert.ok(ringPx > bubblePx, `${conflictFt}/${cautionFt} at ${pxPerFt}: ring ${ringPx} bubble ${bubblePx}`);
  }
});

test('at the fitted zoom the bubbles are drawn 8 px and the rings 12 px, and zoomed in they keep their true size', () => {
  const zoomed = { ...fakeMap, view: { ...VIEW, scale: FITTED } };
  const rec = recordingContext();
  drawScene(rec.ctx, zoomed, scene(), LAYERS_ON, PALETTE);
  const radii = rec.named('arc').map((c) => c.args[2]);
  assert.equal(radii.filter((r) => r === 8).length, 3, 'a bubble for A1, A2 and A5');
  assert.equal(radii.filter((r) => r === 12).length, 3, 'a ring for each');
  assert.equal(draw().named('arc').filter((c) => Math.abs(c.args[2] - 10) < 1e-9).length, 3, 'at 20 ft a pixel they are still true size');
});

test('each flying aircraft has a bubble at the conflict limit and a dashed ring at the caution limit', () => {
  const rec = draw();
  const radii = rec.named('arc').map((c) => c.args[2]);
  assert.equal(radii.filter((r) => Math.abs(r - 10) < 1e-9).length, 3, '200 ft at 20 ft a pixel, for A1, A2 and A5');
  assert.equal(radii.filter((r) => Math.abs(r - 25) < 1e-9).length, 3, '500 ft, the same');
  assert.ok(rec.named('setLineDash').some((c) => JSON.stringify(c.args[0]) === '[4,4]'), 'rings are dashed, bubbles solid');
});

test('an aircraft in conflict gets a heavier, red bubble; one in caution a heavier, amber ring', () => {
  const rec = draw();
  const bubbles = rec.named('stroke').filter((c) => c.lineWidth === 3 && c.strokeStyle === PALETTE.bad);
  assert.equal(bubbles.length, 2, 'A1 and A2');
  const rings = rec.named('stroke').filter((c) => c.lineWidth === 2.5 && c.strokeStyle === PALETTE.caution);
  assert.equal(rings.length, 1, 'A5');
});

test('the bubble and ring layers each switch off on their own', () => {
  const noBubbles = draw({}, { layerBubbles: false });
  assert.equal(noBubbles.named('arc').filter((c) => Math.abs(c.args[2] - 10) < 1e-9).length, 0);
  assert.equal(noBubbles.named('arc').filter((c) => Math.abs(c.args[2] - 25) < 1e-9).length, 3);
  const noRings = draw({}, { layerCautionRings: false });
  assert.equal(noRings.named('arc').filter((c) => Math.abs(c.args[2] - 25) < 1e-9).length, 0);
  assert.equal(noRings.named('arc').filter((c) => Math.abs(c.args[2] - 10) < 1e-9).length, 3);
  // The words still say who is in conflict when the drawing layers are off.
  assert.equal(draw({}, { layerBubbles: false, layerCautionRings: false }).written().filter((t) => t === '⚠ CONFLICT').length, 2);
});

test('a bubble follows the limits set in Settings', () => {
  const rec = draw({}, { conflictLatFt: 400, cautionLatFt: 1000 });
  const radii = rec.named('arc').map((c) => c.args[2]);
  assert.equal(radii.filter((r) => Math.abs(r - 20) < 1e-9).length, 3);
  assert.equal(radii.filter((r) => Math.abs(r - 50) < 1e-9).length, 3);
});

test('trails follow the trails layer', () => {
  const trails = { A1: [{ x: -1234, y: 1000 }, { x: -600, y: 1000 }, { x: 0, y: 1000 }] };
  const [tx] = screen(-1234, 1000);
  const drawsTrail = (rec) => rec.named('moveTo').some((c) => c.args[0] === tx);
  assert.ok(drawsTrail(draw({ trails })));
  assert.ok(!drawsTrail(draw({ trails }, { layerTrails: false })));
});

test('leg distances show on every route when asked, and not otherwise', () => {
  assert.ok(!draw().written().includes('3,000 ft'));
  const written = draw({}, { layerLegDistances: true }).written();
  assert.ok(written.includes('3,000 ft'), 'a pattern leg');
  assert.ok(written.includes('6,000 ft'), 'the entry');
});

test('leg lengths come from the scene\'s legs when it gives them, and the map\'s own measuring is only the fallback', () => {
  const legs = [{ routeId: 'p1', x: -1500, y: 3000, ft: 12_345 }, { routeId: 'gone', x: 0, y: 0, ft: 777 }];
  const written = draw({ legs }, { layerLegDistances: true }).written();
  assert.ok(written.includes('12,345 ft'), 'the engine\'s length');
  assert.ok(!written.includes('3,000 ft'), 'not the map\'s own sum');
  assert.ok(!written.includes('777 ft'), 'a leg of a route that isn\'t there is left out');
  assert.ok(!draw({ legs }).written().includes('12,345 ft'), 'and only when Leg distances is on');
  assert.deepEqual(legsToLabel([pattern], undefined).map((l) => [l.color, Math.round(l.ft)]), [[pattern.color, 3000], [pattern.color, 3000], [pattern.color, 3000], [pattern.color, 3000]]);
  const hidden = draw({ routes: [{ ...pattern, visible: false }], legs }, { layerLegDistances: true }).written();
  assert.ok(!hidden.includes('12,345 ft'), 'a hidden route has no labels');
});

test('turn data shows at the rounded points when asked, and not otherwise', () => {
  assert.ok(!draw().written().includes('R 2,474 ft / bank 60°'));
  assert.ok(draw({}, { layerTurnData: true }).written().includes('R 2,474 ft / bank 60°'));
});

test('the wind shows in the corner with its arrow only when it isn\'t calm', () => {
  const calm = draw();
  assert.ok(!calm.written().some((t) => t.startsWith('Wind')));
  const rec = draw({}, { windFromDeg: 250, windKt: 20 });
  assert.ok(rec.written().includes('Wind 250°T 20 kt'));
  const label = rec.named('fillText').find((c) => c.args[0].startsWith('Wind'));
  assert.equal(label.textAlign, 'right');
  assert.ok(label.args[1] < SIZE.width && label.args[2] < 60, 'in the top right corner');
});

test('the grid is drawn with its spacing written in the corner', () => {
  const rec = draw({ routes: [], aircraft: [], conflicts: [] });
  assert.ok(rec.written().includes('Grid: 1,000 ft'));
  assert.ok(rec.named('lineTo').length > 0, 'grid lines');
  const [x0] = screen(0, 0);
  assert.ok(rec.named('moveTo').some((c) => c.args[0] === x0 && c.args[1] === 0), 'a line through the field');
});

test('a scene with nothing in it still draws, with no errors', () => {
  const rec = draw({ routes: [], aircraft: [], conflicts: [], trails: undefined });
  assert.ok(rec.calls.length > 0);
});

// ---------------------------------------------------------------------------
// The view on a canvas

function fakeCanvas(width, height, rec) {
  const canvas = {
    clientWidth: width, clientHeight: height, width: 0, height: 0,
    classList: { add() {}, remove() {} },
    setAttribute() {}, addEventListener() {}, removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }),
    getContext: () => rec.ctx,
  };
  return canvas;
}


// A map on a stand-in canvas. Stand-ins for the page's getComputedStyle and ResizeObserver are
// put in place for the test and taken away after it.
function withMap(t, { width = 800, height = 600, layers = LAYERS_ON, first = scene, ...more } = {}) {
  const rec = recordingContext();
  const frames = [];
  const observers = [];
  const timers = {
    frame: (cb) => {
      frames.push(cb);
      return () => frames.includes(cb) && frames.splice(frames.indexOf(cb), 1);
    },
  };
  const styleReads = { count: 0 };
  globalThis.getComputedStyle = () => {
    styleReads.count++;
    return { getPropertyValue: () => '' };
  };
  globalThis.ResizeObserver = class {
    constructor(callback) {
      observers.push(callback);
    }

    observe() {}

    disconnect() {}
  };
  t.after(() => {
    Reflect.deleteProperty(globalThis, 'getComputedStyle');
    Reflect.deleteProperty(globalThis, 'ResizeObserver');
  });
  const data = { current: first() };
  const canvas = fakeCanvas(width, height, rec);
  const map = createMap2d(canvas, { timers, scene: () => data.current, settings: () => layers, ...more });
  return {
    map, rec, data, canvas, frames, styleReads, timers,
    resize: () => observers.forEach((callback) => callback()),
    flush() {
      rec.calls.length = 0;
      while (frames.length) frames.shift()();
    },
  };
}

test('the page\'s colours are read once, not on every frame, until refreshColours asks for them again', (t) => {
  const { map, flush, styleReads } = withMap(t);
  flush();
  map.requestDraw();
  flush();
  map.requestDraw();
  flush();
  assert.equal(styleReads.count, 1, 'three frames, one read');
  map.refreshColours();
  flush();
  assert.equal(styleReads.count, 2, 'a theme change reads them again, and redraws');
});

test('the first draw frames the pattern, so it is on screen (the entry legs may run off the map)', (t) => {
  const { map, flush } = withMap(t);
  flush();
  for (const p of pattern.points) {
    const [x, y] = map.worldToScreen(p.x, p.y);
    assert.ok(x >= 0 && x <= 800 && y >= 0 && y <= 600, `(${p.x}, ${p.y}) is at ${x}, ${y}`);
  }
  assert.ok(MAP_MIN_SPAN_FT < MAP_MAX_SPAN_FT);
});

test('Fit all routes frames every route, entries and splits too', (t) => {
  const { map, flush } = withMap(t);
  flush();
  const focused = map.view.scale;
  map.fitAll();
  flush();
  assert.ok(map.view.scale < focused, 'the far entry is in, so the picture is smaller');
  for (const p of [pattern, entry, split].flatMap((r) => r.points)) {
    const [x, y] = map.worldToScreen(p.x, p.y);
    assert.ok(x >= 0 && x <= 800 && y >= 0 && y <= 600, `(${p.x}, ${p.y}) is at ${x}, ${y}`);
  }
  map.fit();
  flush();
  near(map.view.scale, focused, 1e-12); // Fit goes back to the pattern
});

test('Fit frames the routes again after the routes have changed', (t) => {
  const { map, flush, data } = withMap(t);
  flush();
  const first = map.view.scale;
  data.current = scene({ routes: [{ ...entry, points: [{ x: -90000, y: 0, alt: 3500, kt: 220 }, { x: -3000, y: 0, alt: 2500, kt: 220 }] }] });
  map.fit();
  flush();
  assert.ok(map.view.scale < first, 'a much longer route is framed smaller');
  const [x] = map.worldToScreen(-90000, 0);
  assert.ok(x >= 0 && x <= 800);
});

test('a map with no size yet (hidden) frames the routes when it first has one', (t) => {
  const { map, canvas, flush, resize, rec } = withMap(t, { width: 0, height: 0 });
  flush();
  map.fit(); // nothing to fit to yet, so it waits
  canvas.clientWidth = 800;
  canvas.clientHeight = 600;
  resize();
  flush();
  assert.ok(rec.written().includes('Pattern 1'));
  const [x, y] = map.worldToScreen(-3000, 0);
  assert.ok(x >= 0 && x <= 800 && y >= 0 && y <= 600);
});

test('Fit all pressed while the map has no size frames every route when it first has one', (t) => {
  const { map, canvas, flush, resize } = withMap(t, { width: 0, height: 0 });
  flush();
  map.fitAll();
  canvas.clientWidth = 800;
  canvas.clientHeight = 600;
  resize();
  flush();
  const [x] = map.worldToScreen(-9000, 0); // the far end of the entry
  assert.ok(x >= 0 && x <= 800);
});

test('a map that is closed stops asking for frames', (t) => {
  const { map, frames } = withMap(t);
  map.dispose();
  map.requestDraw();
  assert.equal(frames.length, 0);
});

// ---------------------------------------------------------------------------
// The satellite photo (Traffic task 8; V6 drawSatellite: scaled by the trim about the field, then moved by the offsets)

const REF = makeLocalRef(50.3303, -105.5592); // Moose Jaw, the setup's anchor
const ALIGN = { trim: 1, eastFt: 0, northFt: 0 };

test('the photo\'s alignment is the trim and the offsets, and a missing or wild value falls back to true scale and no shift', () => {
  assert.deepEqual(photoAlignment({ photoTrim: 1.2, photoEastFt: 300, photoNorthFt: -100 }), { trim: 1.2, eastFt: 300, northFt: -100 });
  assert.deepEqual(photoAlignment({}), ALIGN);
  assert.deepEqual(photoAlignment({ photoTrim: 0, photoEastFt: NaN, photoNorthFt: 'x' }), ALIGN, 'a trim of 0 would hide the photo');
});

test('the photo sits on the ground at true scale with no trim, is stretched about the field by the trim, and is moved by the offsets (V6)', () => {
  const at = (x, y, align) => {
    const { lat, lon } = localFtToLatLon(REF, x, y);
    return photoToWorld(REF, align, lat, lon);
  };
  const true1 = at(1000, -2000, ALIGN);
  near(true1.x, 1000, 1e-6);
  near(true1.y, -2000, 1e-6);
  const stretched = at(1000, -2000, { trim: 1.2, eastFt: 0, northFt: 0 });
  near(stretched.x, 1200, 1e-6);
  near(stretched.y, -2400, 1e-6);
  const moved = at(1000, -2000, { trim: 1.2, eastFt: 300, northFt: -100 });
  near(moved.x, 1500, 1e-6);
  near(moved.y, -2500, 1e-6);
  const field = at(0, 0, { trim: 1.2, eastFt: 0, northFt: 0 });
  near(field.x, 0, 1e-6);
  near(field.y, 0, 1e-6); // the field itself stays put under any trim
});

test('worldToPhoto undoes photoToWorld', () => {
  const align = { trim: 1.13, eastFt: -400, northFt: 250 };
  const ll = localFtToLatLon(REF, 3500, -1200);
  const world = photoToWorld(REF, align, ll.lat, ll.lon);
  const back = worldToPhoto(REF, align, world.x, world.y);
  near(back.lat, ll.lat, 1e-9);
  near(back.lon, ll.lon, 1e-9);
});

test('the tile view covers what is on screen, at the scale the photo is drawn at, and puts tiles where photoToWorld says', () => {
  const align = { trim: 1.2, eastFt: 200, northFt: -300 };
  const view = photoView(fakeMap, REF, align);
  near(view.pxPerFt, VIEW.scale * 1.2, 1e-12); // the photo is 20 % bigger, so its ground is 20 % more pixels a foot
  const { minX, minY, maxX, maxY } = fakeMap.visibleBounds();
  for (const [x, y] of [[minX, minY], [minX, maxY], [maxX, minY], [maxX, maxY], [0, 0]]) {
    const ll = worldToPhoto(REF, align, x, y);
    assert.ok(ll.lat <= view.corners.north + 1e-12 && ll.lat >= view.corners.south - 1e-12, 'inside north and south');
    assert.ok(ll.lon <= view.corners.east + 1e-12 && ll.lon >= view.corners.west - 1e-12, 'inside east and west');
    const [sx, sy] = view.toScreen(ll.lat, ll.lon);
    const [ex, ey] = fakeMap.worldToScreen(x, y);
    near(sx, ex, 1e-6);
    near(sy, ey, 1e-6);
  }
});

test('under the photo the credit is Esri\'s; with every tile failed it says the photo needs a connection; with the layer off there is nothing', () => {
  assert.equal(photoCaption(null), '');
  assert.equal(photoCaption({ wanted: 6, ready: 2, failed: 0 }), ESRI_IMAGERY.credit);
  assert.equal(photoCaption({ wanted: 0, ready: 0, failed: 0 }), ESRI_IMAGERY.credit, 'zoomed out too far for tiles: the credit stays while the layer is on');
  assert.equal(photoCaption({ wanted: 6, ready: 0, failed: 6 }), PHOTO_OFFLINE_TEXT);
  assert.equal(photoCaption({ wanted: 6, ready: 4, failed: 2 }), ESRI_IMAGERY.credit, 'a few missing tiles are not "offline"');
  assert.match(PHOTO_OFFLINE_TEXT, /^Satellite photo needs a connection/);
  assert.match(PHOTO_OFFLINE_TEXT, /grid/i);
});

test('the photo is drawn under the grid or above it as chosen, at the chosen opacity, and not at all when the layer is off', () => {
  const order = (layers) => {
    const rec = recordingContext();
    const marks = [];
    const photo = () => marks.push({ at: rec.calls.length, alpha: rec.ctx.globalAlpha });
    drawScene(rec.ctx, fakeMap, scene(), { ...LAYERS_ON, ...layers }, PALETTE, { photo });
    const gridAt = rec.calls.findIndex((c) => c.name === 'fillText' && c.args[0].startsWith('Grid:'));
    const firstRoute = rec.calls.findIndex((c) => c.name === 'setLineDash' && c.args[0].length === 0);
    return { marks, gridAt, firstRoute };
  };
  const below = order({ layerPhoto: true, photoAboveGrid: false, photoOpacityPct: 60 });
  assert.equal(below.marks.length, 1);
  assert.ok(below.marks[0].at < below.gridAt, 'below the grid');
  near(below.marks[0].alpha, 0.6);
  const above = order({ layerPhoto: true, photoAboveGrid: true, photoOpacityPct: 100 });
  assert.ok(above.marks[0].at > above.gridAt, 'above the grid');
  assert.ok(above.marks[0].at < above.firstRoute, 'but under the routes');
  near(above.marks[0].alpha, 1);
  assert.equal(order({ layerPhoto: false }).marks.length, 0, 'off');
  assert.equal(order({}).marks.length, 0, 'the layer is off unless it is set');
});

test('the photo\'s opacity is put back after it is drawn, so nothing else fades', () => {
  const rec = recordingContext();
  drawScene(rec.ctx, fakeMap, scene(), { ...LAYERS_ON, layerPhoto: true, photoAboveGrid: true, photoOpacityPct: 30 }, PALETTE, { photo: () => {} });
  const saves = rec.named('save').length;
  const restores = rec.named('restore').length;
  assert.equal(saves, restores, 'every save has its restore');
});

// The photo on a map with a stand-in for images: which tiles are asked for, and what the credit line is told.
function withPhoto(t, layers = {}, more = {}) {
  const images = [];
  const makeImage = () => {
    const image = { onload: null, onerror: null, set src(url) { image.url = url; images.push(image); } };
    return image;
  };
  const told = [];
  const on = { ...LAYERS_ON, layerPhoto: true, photoOpacityPct: 100, photoAboveGrid: true, photoTrim: 1.2, photoEastFt: 0, photoNorthFt: 0, ...layers };
  const state = withMap(t, { layers: on, anchor: () => ({ lat: 50.3303, lon: -105.5592 }), onPhoto: (s) => told.push(s), makeImage, ...more });
  return { ...state, images, told, on };
}

test('with the photo on, the map asks Esri for the tiles under the pattern, and says so to the credit line', (t) => {
  const { flush, images, told } = withPhoto(t);
  flush();
  assert.ok(images.length > 0 && images.length <= 64, `${images.length} tiles asked for`);
  assert.ok(images.every((i) => i.url.startsWith('https://services.arcgisonline.com/') && /\/tile\/\d+\/\d+\/\d+$/.test(i.url)), 'Esri tiles by number only');
  assert.deepEqual(told.at(-1), { wanted: images.length, ready: 0, failed: 0 });
});

test('a tile that arrives is drawn, and the map draws again (once a frame, however many arrive)', (t) => {
  const { flush, images, frames, rec } = withPhoto(t);
  flush();
  for (const image of images) image.onload();
  assert.equal(frames.length, 1, 'one redraw for all the tiles');
  rec.calls.length = 0;
  flush();
  assert.equal(rec.named('drawImage').length, images.length, 'every tile is drawn');
});

test('with the photo off, nothing is asked for and the credit line is told there is no photo', (t) => {
  const { flush, images, told } = withPhoto(t, { layerPhoto: false });
  flush();
  assert.equal(images.length, 0, 'nothing fetched while it is off (R5)');
  assert.deepEqual(told, [null]);
});

test('the photo is not asked for when the setup has no anchor to put it on', (t) => {
  const { flush, images, told } = withPhoto(t, {}, { anchor: () => null });
  flush();
  assert.equal(images.length, 0);
  assert.deepEqual(told, [null]);
});

test('switching the photo on later asks for its tiles then; switching it off again tells the credit line', (t) => {
  const { flush, images, told, on, map } = withPhoto(t, { layerPhoto: false });
  flush();
  assert.equal(images.length, 0);
  on.layerPhoto = true;
  map.requestDraw();
  flush();
  assert.ok(images.length > 0);
  on.layerPhoto = false;
  map.requestDraw();
  flush();
  assert.equal(told.at(-1), null);
});

test('when every tile fails for good, the credit line is told they all failed; the grid still draws', (t) => {
  const { flush, images, told, frames, timers } = withPhoto(t);
  const later = [];
  timers.after = (ms, fn) => { later.push(fn); return () => {}; };
  flush();
  const asked = images.length;
  // Each tile is tried three times; after the last try it is given up on.
  let batch = images.slice();
  for (let round = 0; round < 3; round++) {
    for (const image of batch) image.onerror();
    if (round < 2) {
      const before = images.length;
      while (later.length) later.shift()();
      batch = images.slice(before);
    }
  }
  flush();
  assert.deepEqual(told.at(-1), { wanted: asked, ready: 0, failed: asked });
  assert.equal(photoCaption(told.at(-1)), PHOTO_OFFLINE_TEXT);
  assert.ok(frames.length === 0);
});

test('closing the map stops the photo: no late tile draws, no retries left', (t) => {
  const { map, flush, images, frames } = withPhoto(t);
  flush();
  map.dispose();
  for (const image of images) assert.equal(image.onload, null, 'the tiles no longer call back');
  assert.equal(frames.length, 0);
});

// The first view (TR-17): the pattern being watched, not the 15 NM entry legs

const BUILT_IN = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));
const builtInScene = () => {
  const sim = createSim(structuredClone(BUILT_IN), { seed: 1 });
  return buildScene({ setup: structuredClone(BUILT_IN), state: sim.state(), selectedRouteId: null, trailOf: sim.trailOf });
};
/** How far the pattern reaches across the picture, in pixels, along its longer side. */
const patternSpanPx = (map, sceneData) => {
  const points = sceneData.routes.find((r) => r.kind === 'pattern').path;
  const xs = [], ys = [];
  for (const p of points) {
    const [x, y] = map.worldToScreen(p.x, p.y);
    xs.push(x);
    ys.push(y);
  }
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
};

for (const [width, height] of [[800, 600], [1000, 500], [400, 700]]) {
  test(`on the built-in setup the first fit puts Pattern 1 across at least 60% of the map's shorter side (${width} x ${height})`, (t) => {
    const { map, flush } = withMap(t, { width, height, first: builtInScene });
    flush();
    const span = patternSpanPx(map, builtInScene());
    assert.ok(span >= 0.6 * Math.min(width, height), `Pattern 1 spans ${Math.round(span)} px of ${Math.min(width, height)}`);
  });
}

test('Fit all routes on the built-in setup puts every route on the map, and the pattern gets smaller', (t) => {
  const { map, flush } = withMap(t, { first: builtInScene });
  flush();
  const focused = patternSpanPx(map, builtInScene());
  map.fitAll();
  flush();
  assert.ok(patternSpanPx(map, builtInScene()) < focused * 0.6, 'the 15 NM entry legs take most of the room');
  for (const route of builtInScene().routes) {
    for (const p of route.points) {
      const [x, y] = map.worldToScreen(p.x, p.y);
      assert.ok(x >= 0 && x <= 800 && y >= 0 && y <= 600, `${route.name}: (${Math.round(p.x)}, ${Math.round(p.y)}) is at ${Math.round(x)}, ${Math.round(y)}`);
    }
  }
});

test('the focus box is the first showing pattern and the flying aircraft near it, else every route', () => {
  const p1 = { kind: 'pattern', points: [{ x: 0, y: 0 }, { x: 1000, y: 400 }] };
  const far = { kind: 'entry', points: [{ x: -90_000, y: 0 }, { x: 0, y: 0 }] };
  assert.deepEqual(focusBounds([far, p1]), { minX: 0, minY: 0, maxX: 1000, maxY: 400 }, 'the entry leg is left out');
  const near = { status: 'flying', x: 1400, y: -300 }, distant = { status: 'flying', x: -50_000, y: 0 }, waiting = { status: 'waiting', x: 1200, y: 900 };
  assert.deepEqual(focusBounds([far, p1], [near, distant, waiting]), { minX: 0, minY: -300, maxX: 1400, maxY: 400 }, 'a flying aircraft near the pattern is in; far or waiting ones are not');
  // "Near" is within half the pattern's longer side (500 ft here), on every side.
  const flying = (x, y) => ({ status: 'flying', x, y });
  assert.deepEqual(focusBounds([p1], [flying(1500, 200)]), { minX: 0, minY: 0, maxX: 1500, maxY: 400 }, 'just inside on the right');
  assert.deepEqual(focusBounds([p1], [flying(1501, 200)]), { minX: 0, minY: 0, maxX: 1000, maxY: 400 }, 'just outside on the right');
  assert.deepEqual(focusBounds([p1], [flying(-501, 200)]), { minX: 0, minY: 0, maxX: 1000, maxY: 400 }, 'just outside on the left');
  assert.deepEqual(focusBounds([p1], [flying(500, 901)]), { minX: 0, minY: 0, maxX: 1000, maxY: 400 }, 'just outside above');
  assert.deepEqual(focusBounds([p1], [flying(500, -501)]), { minX: 0, minY: 0, maxX: 1000, maxY: 400 }, 'just outside below');
  assert.deepEqual(focusBounds([p1], [flying(500, -500)]), { minX: 0, minY: -500, maxX: 1000, maxY: 400 }, 'just inside below');
  assert.deepEqual(focusBounds([p1], [flying(-500, 900)]), { minX: -500, minY: 0, maxX: 1000, maxY: 900 }, 'a corner exactly on the limit is in');
  assert.deepEqual(focusBounds([far, { ...p1, visible: false }]), sceneBounds([far, { ...p1, visible: false }]), 'no pattern showing: every route');
  assert.deepEqual(focusBounds([far]), sceneBounds([far]));
  assert.equal(focusBounds([], []), null);
  const path = { kind: 'pattern', points: [{ x: 0, y: 0 }], path: [{ x: -20, y: -30 }, { x: 40, y: 60 }] };
  assert.deepEqual(focusBounds([path]), { minX: -20, minY: -30, maxX: 40, maxY: 60 }, 'the drawn path where a route has one');
});

// ---------------------------------------------------------------------------
// PFL 2D Dynamic Glide Footprint & Tactical UI Badges (Task 4)

test('calculateGlideFootprint computes clean glide radius and wind drift displacement downwind', () => {
  // Calm wind at 5,000 ft MSL (Moose Jaw elevation 1,892 ft)
  // altDiff = 5000 - 1892 = 3108 ft
  // expected radius = (3108 / 1000) * 2.0 NM * 6076.12 ft/NM = 37769.16 ft
  // expected tGlide = 3108 / (1350 / 60) = 138.133 s
  const ac = { x: 1000, y: 2000, alt: 5000 };
  const calm = calculateGlideFootprint(ac, 360, 0);
  near(calm.altDiff, 3108, 0.01);
  near(calm.rGlide, 37769.16, 0.1);
  near(calm.tGlide, 138.133, 0.01);
  near(calm.cx, 1000, 0.01);
  near(calm.cy, 2000, 0.01);
  near(calm.driftFt, 0, 0.01);

  // Ground level or below ground (alt <= 1892 ft)
  const ground = calculateGlideFootprint({ x: 0, y: 0, alt: 1892 }, 360, 20);
  assert.equal(ground.altDiff, 0);
  assert.equal(ground.rGlide, 0);
  assert.equal(ground.tGlide, 0);
  assert.equal(ground.cx, 0);
  assert.equal(ground.cy, 0);

  // With wind: 20 kt from 360 (north) blows toward south (180 deg)
  // wx = 0, wy = -20 * 1.68781 = -33.7562 ft/s
  // drift distance = 33.7562 * 138.133 = 4662.8 ft south
  const northWind = calculateGlideFootprint(ac, 360, 20);
  near(northWind.cx, 1000, 0.01);
  near(northWind.cy, 2000 - 4662.8, 1.0);
  near(northWind.driftFt, 4662.8, 1.0);
});

test('shouldShowGlideFootprint activates for engine failure, PFL phases, commands, or active selection', () => {
  assert.ok(shouldShowGlideFootprint({ engineFailed: true }));
  assert.ok(shouldShowGlideFootprint({ phase: 'pfl_high_key' }));
  assert.ok(shouldShowGlideFootprint({ phase: 'pfl_zoom' }));
  assert.ok(shouldShowGlideFootprint({ phase: 'pfl_low_key' }));
  assert.ok(shouldShowGlideFootprint({ phase: 'pfl_direct' }));
  assert.ok(shouldShowGlideFootprint({ phase: 'crash_short' }));
  assert.ok(shouldShowGlideFootprint({ command: 'pfl_current' }));
  assert.ok(shouldShowGlideFootprint({ command: 'engine_fail' }));
  assert.ok(shouldShowGlideFootprint({ pflActive: true }));
  assert.ok(shouldShowGlideFootprint({ id: 'A1', engineFailed: true }, 'A1'));

  assert.ok(!shouldShowGlideFootprint(null));
  assert.ok(!shouldShowGlideFootprint({ status: 'flying', alt: 2500, phase: 'downwind' }));
});

test('getPflBadge returns exact tactical badges for all 6 PFL recovery phases', () => {
  // 1. Zoom climb/decel
  assert.equal(getPflBadge({ engineFailed: true, phase: 'pfl_zoom' }), '[PFL: ZOOM]');
  assert.equal(getPflBadge({ command: 'pfl_current', phase: 'pfl_decel' }), '[PFL: ZOOM]');

  // 2. High Key or Orbit
  assert.equal(getPflBadge({ engineFailed: true, phase: 'pfl_high_key' }), '[PFL: HIGH KEY]');
  assert.equal(getPflBadge({ engineFailed: true, phase: 'pfl_orbit' }), '[PFL: HIGH KEY]');
  assert.equal(getPflBadge({ engineFailed: true, phase: 'pfl_inbound' }), '[PFL: HIGH KEY]');
  assert.equal(getPflBadge({ command: 'climb_high_key' }), '[PFL: HIGH KEY]');

  // 3. Low Key downwind
  assert.equal(getPflBadge({ engineFailed: true, phase: 'pfl_low_key' }), '[PFL: LOW KEY]');
  assert.equal(getPflBadge({ command: 'climb_low_key' }), '[PFL: LOW KEY]');

  // 4. Base Key
  assert.equal(getPflBadge({ engineFailed: true, phase: 'pfl_base_key' }), '[PFL: BASE KEY]');

  // 5. Direct to threshold
  assert.equal(getPflBadge({ engineFailed: true, phase: 'pfl_direct' }), '[PFL: DIRECT]');
  assert.equal(getPflBadge({ engineFailed: true, phase: 'direct_threshold' }), '[PFL: DIRECT]');
  assert.equal(getPflBadge({ engineFailed: true, phase: 'pfl_final' }), '[PFL: DIRECT]');

  // 6. Crash short / unrecoverable
  assert.equal(getPflBadge({ engineFailed: true, phase: 'crash_short' }), '[CRASH SHORT]');
  assert.equal(getPflBadge({ engineFailed: true, status: 'crashed' }), '[CRASH SHORT]');

  // Not in PFL
  assert.equal(getPflBadge(null), null);
  assert.equal(getPflBadge({ status: 'flying', phase: 'downwind' }), null);
});

test('drawScene renders dotted glide footprint ring and PFL badge when aircraft is in PFL recovery', () => {
  const pflAc = { id: 'A1', type: 'CT-156', routeId: 'p1', x: 0, y: 1000, alt: 3500, kt: 120, headingDeg: 90, status: 'flying', engineFailed: true, phase: 'pfl_high_key' };
  const rec = draw({ aircraft: [pflAc], conflicts: [] });
  const written = rec.written();
  assert.ok(written.includes('[PFL: HIGH KEY]'), 'draws tactical status badge on map');

  // Verify dotted circle stroke in cyan (#38bdf8)
  const dashes = rec.named('setLineDash').map((c) => JSON.stringify(c.args[0]));
  assert.ok(dashes.includes('[4,4]'), 'tactical dotted line dash set');
  const strokes = rec.named('stroke').map((c) => c.strokeStyle);
  assert.ok(strokes.includes('#38bdf8'), 'glide footprint ring drawn in tactical cyan');
  assert.ok(written.some((w) => w.startsWith('PFL GLIDE')), 'draws range label for glide footprint');
});

