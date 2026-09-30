// The Traffic Sim's 2D map (specs/SPEC-traffic.md: The screen). The wording and
// projection are pure and tested directly; the drawing is checked against a
// recording stand-in for the canvas, so what's drawn (and what's written next to
// it, since colour is never the only signal) is pinned without a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toScreen, visibleBounds } from '../../../src/ui-kit/canvas-view.js';
import {
  HINT_TEXT, LEVEL_MARKS, TYPE_COLORS, MAP_MIN_SPAN_FT, MAP_MAX_SPAN_FT,
  paletteFrom, heightSpeedText, feetText, windText, windBlowsTowardDeg, pointLabelLines, turnDataText, hintFor,
  sceneBounds, gridStepFt, gridLines, gridLabel, routeStyle, labelAnchor, legLabels,
  turnedShape, aircraftSymbol, conflictLevels, isFlying, aircraftColor, drawScene, createMap2d,
} from '../../../src/modules/traffic/map2d.js';

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
  assert.equal(turnDataText({ radiusFt: 2474.2, bankDeg: 60 }), 'R 2,474 ft / bank 60°');
  assert.equal(turnDataText({ radiusFt: 2474, bankDeg: 60.4, maxG: 2.34 }), 'R 2,474 ft / bank 60° / most 2.3 G');
  assert.equal(turnDataText({ x: 0, y: 0 }), '', 'a point that doesn\'t turn has none');
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
function withMap(t, { width = 800, height = 600 } = {}) {
  const rec = recordingContext();
  const frames = [];
  const observers = [];
  const timers = {
    frame: (cb) => {
      frames.push(cb);
      return () => frames.includes(cb) && frames.splice(frames.indexOf(cb), 1);
    },
  };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
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
  const data = { current: scene() };
  const canvas = fakeCanvas(width, height, rec);
  const map = createMap2d(canvas, { timers, scene: () => data.current, settings: () => LAYERS_ON });
  return {
    map, rec, data, canvas, frames,
    resize: () => observers.forEach((callback) => callback()),
    flush() {
      rec.calls.length = 0;
      while (frames.length) frames.shift()();
    },
  };
}

test('the first draw frames every route, so the whole pattern is on screen', (t) => {
  const { map, flush } = withMap(t);
  flush();
  const dots = [pattern, entry, split].flatMap((r) => r.points);
  for (const p of dots) {
    const [x, y] = map.worldToScreen(p.x, p.y);
    assert.ok(x >= 0 && x <= 800 && y >= 0 && y <= 600, `(${p.x}, ${p.y}) is at ${x}, ${y}`);
  }
  assert.ok(MAP_MIN_SPAN_FT < MAP_MAX_SPAN_FT);
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
  const [x, y] = map.worldToScreen(-9000, 0);
  assert.ok(x >= 0 && x <= 800 && y >= 0 && y <= 600);
});

test('a map that is closed stops asking for frames', (t) => {
  const { map, frames } = withMap(t);
  map.dispose();
  map.requestDraw();
  assert.equal(frames.length, 0);
});
