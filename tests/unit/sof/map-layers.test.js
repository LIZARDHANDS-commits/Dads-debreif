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

// Tests for src/modules/sof/map-layers.js: the map's Layers menu model (SPEC-sof, Map).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASES, OVERLAYS, OPACITY_RANGE, defaultLayers, defaultPrecip, cleanLayers, setLayerOn, setLayerOpacity,
  setBase, setPrecip, stackOrder, menuRows, baseLayers, setTrafficOption, TRAFFIC_LABELS,
} from '../../../src/modules/sof/map-layers.js';

const SUMMER = new Date('2026-09-29T18:42:00Z');
const ids = (list) => list.map((o) => o.id);

test('only the essentials start on, as the spec table says (R22)', () => {
  const state = defaultLayers({ now: SUMMER });
  assert.deepEqual(ids(OVERLAYS.filter((o) => state.on[o.id])), ['radar', 'coverage', 'lightning', 'rings', 'airfields']);
  for (const off of ['cloud', 'warnings', 'routes', 'traffic']) assert.equal(state.on[off], false, off);
  assert.equal(state.base, 'satellite');
});

test('the base map choices are Satellite, VNC and VNC over satellite', () => {
  assert.deepEqual(ids(BASES), ['satellite', 'vnc', 'vnc-satellite']);
});

test('rain by default in summer, snow from November to March', () => {
  for (const [iso, want] of [['2026-11-01T00:00:00Z', 'snow'], ['2027-01-15T00:00:00Z', 'snow'], ['2027-03-31T23:00:00Z', 'snow'],
    ['2027-04-01T00:00:00Z', 'rain'], ['2026-09-29T00:00:00Z', 'rain'], ['2026-10-31T23:59:00Z', 'rain']]) {
    assert.equal(defaultPrecip(new Date(iso)), want, iso);
  }
  assert.equal(defaultPrecip(undefined), 'rain');
  assert.equal(defaultPrecip(new Date('nope')), 'rain');
  assert.equal(defaultLayers({ now: new Date('2027-01-15T00:00:00Z') }).precip, 'snow');
});

test('layers stack bottom to top: cloud, radar, coverage, lightning, warnings, routes, rings, airfields, traffic', () => {
  assert.deepEqual(ids(OVERLAYS), ['cloud', 'radar', 'coverage', 'lightning', 'warnings', 'routes', 'rings', 'airfields', 'traffic']);
  const all = { ...defaultLayers(), on: Object.fromEntries(OVERLAYS.map((o) => [o.id, true])) };
  assert.deepEqual(stackOrder(all, { relay: true }), ids(OVERLAYS));
});

test('the stack holds only what is on, and traffic waits for the relay address whatever was kept', () => {
  assert.deepEqual(stackOrder(defaultLayers()), ['radar', 'coverage', 'lightning', 'rings', 'airfields']);
  const asked = setLayerOn(defaultLayers(), 'traffic', true);
  assert.equal(stackOrder(asked).includes('traffic'), false);
  assert.equal(stackOrder(asked, { relay: true }).at(-1), 'traffic');
});

test('layers stack: turning one on or off leaves the others as they were', () => {
  const a = setLayerOn(defaultLayers(), 'cloud', true);
  assert.deepEqual(stackOrder(a).slice(0, 2), ['cloud', 'radar']);
  const b = setLayerOn(a, 'radar', false);
  assert.deepEqual(stackOrder(b), ['cloud', 'coverage', 'lightning', 'rings', 'airfields']);
  assert.equal(defaultLayers().on.cloud, false, 'the earlier state is left alone');
});

test('the menu lists the overlays in stack order, each with its switch and slider, and hides traffic until the relay is set', () => {
  const rows = menuRows(defaultLayers());
  assert.deepEqual(ids(rows), ['cloud', 'radar', 'coverage', 'lightning', 'warnings', 'routes', 'rings', 'airfields']);
  assert.equal(rows.find((r) => r.id === 'radar').opacity, 75);
  assert.equal(rows.find((r) => r.id === 'rings').opacity, null, 'rings have no slider');
  assert.equal(menuRows(defaultLayers(), { relay: true }).at(-1).id, 'traffic');
  assert.ok(menuRows(defaultLayers()).every((r) => typeof r.label === 'string' && r.label));
});

test('opacity is kept to the slider: 10 to 100 in steps of 5; layers without a slider change nothing', () => {
  const s = defaultLayers();
  assert.equal(setLayerOpacity(s, 'radar', 42).opacity.radar, 40);
  assert.equal(setLayerOpacity(s, 'radar', 0).opacity.radar, OPACITY_RANGE.min);
  assert.equal(setLayerOpacity(s, 'radar', 500).opacity.radar, OPACITY_RANGE.max);
  assert.equal(setLayerOpacity(s, 'rings', 50), s);
  assert.equal(setLayerOpacity(s, 'radar', NaN), s);
  assert.equal(setLayerOpacity(s, 'nope', 50), s);
});

test('base, rain or snow, and layer switches ignore anything not on the list', () => {
  const s = defaultLayers();
  assert.equal(setBase(s, 'vnc').base, 'vnc');
  assert.equal(setBase(s, 'street'), s);
  assert.equal(setPrecip(s, 'snow').precip, 'snow');
  assert.equal(setPrecip(s, 'hail'), s);
  assert.equal(setLayerOn(s, 'nope', true), s);
  assert.equal(setLayerOn(s, 'radar', 'yes'), s);
});

test('what the base draws: satellite always (it shows outside the VNC charts), the chart at 100 or at its slider', () => {
  assert.deepEqual(baseLayers(defaultLayers()), { satellite: true, vnc: null });
  assert.deepEqual(baseLayers(setBase(defaultLayers(), 'vnc')), { satellite: true, vnc: 100 });
  assert.deepEqual(baseLayers(setBase(defaultLayers(), 'vnc-satellite')), { satellite: true, vnc: 70 });
  const slid = setLayerOpacity(setBase(defaultLayers(), 'vnc-satellite'), 'vnc', 40);
  assert.deepEqual(baseLayers(slid), { satellite: true, vnc: 40 });
});

test('the VNC chart has an opacity slider but is not an overlay: it cannot be switched on as a layer', () => {
  assert.equal(defaultLayers().opacity.vnc, 70);
  assert.equal(setLayerOn(defaultLayers(), 'vnc', true).on.vnc, undefined);
  assert.equal(cleanLayers({ opacity: { vnc: 33 } }).opacity.vnc, 35);
  assert.equal(cleanLayers({ opacity: { vnc: 'x' } }).opacity.vnc, 70);
});

test('stored state is checked: junk, wrong types and unknown layers give the defaults', () => {
  const d = defaultLayers({ now: SUMMER });
  for (const junk of [null, undefined, 5, 'x', [], { on: 5, opacity: 'x', base: 3, precip: 9 }, { on: { radar: 'yes', nope: true }, opacity: { radar: 'a' } }]) {
    assert.deepEqual(cleanLayers(junk, { now: SUMMER }), d, JSON.stringify(junk));
  }
});

test('stored state keeps what is good: a switch, an opacity snapped to its step, the base, rain or snow', () => {
  const s = cleanLayers({ base: 'vnc-satellite', precip: 'snow', on: { radar: false, cloud: true }, opacity: { radar: 47, rings: 30 } }, { now: SUMMER });
  assert.equal(s.base, 'vnc-satellite');
  assert.equal(s.precip, 'snow');
  assert.equal(s.on.radar, false);
  assert.equal(s.on.cloud, true);
  assert.equal(s.on.lightning, true, 'what is missing is the default');
  assert.equal(s.opacity.radar, 45);
  assert.equal('rings' in s.opacity, false);
});

test('a stored state that has gone through JSON comes back the same', () => {
  const s = setLayerOpacity(setLayerOn(setBase(defaultLayers(), 'vnc'), 'warnings', true), 'lightning', 50);
  assert.deepEqual(cleanLayers(JSON.parse(JSON.stringify(s))), s);
});

test('traffic labels are off and military-only is off to begin with, and the choices are kept to the list', () => {
  const s = defaultLayers();
  assert.deepEqual(s.traffic, { label: 'off', militaryOnly: false });
  assert.deepEqual(ids(TRAFFIC_LABELS), ['off', 'callsign', 'callsign-altitude', 'full']);
  assert.equal(setTrafficOption(s, { label: 'callsign' }).traffic.label, 'callsign');
  assert.equal(setTrafficOption(s, { label: 'nope' }), s);
  assert.equal(setTrafficOption(s, { militaryOnly: true }).traffic.militaryOnly, true);
  assert.equal(setTrafficOption(s, { militaryOnly: 'yes' }), s);
  assert.equal(setTrafficOption(s, { label: 'off' }), s, 'no change is the same object');
  assert.deepEqual(cleanLayers({ traffic: { label: 'full', militaryOnly: true } }).traffic, { label: 'full', militaryOnly: true });
  assert.deepEqual(cleanLayers({ traffic: { label: 'x', militaryOnly: 1 } }).traffic, { label: 'off', militaryOnly: false });
  assert.deepEqual(cleanLayers({ traffic: 5 }).traffic, { label: 'off', militaryOnly: false });
});
