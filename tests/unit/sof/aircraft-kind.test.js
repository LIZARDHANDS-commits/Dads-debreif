// Checks: each live aircraft is told by its kind, as a pilot would name it: a B738 is an airliner, a C56X a business jet, a C172 a light aircraft, a military
//   C130 a military transport, a military F16 a fighter, an H60 a helicopter, a TEX2 always the T-6 (whatever else the relay says about it), and an aircraft of
//   an unknown type sending ADS-B emitter category A1 a light aircraft. With "Names shown for: T-6s and military only" and the Labels choice on, the
//   airliner's tag is hidden and the C130's and the T-6's show; the airliner's hover facts still name it.
//   The relay's 250 NM range (accepts 250, refuses 250.1) is checked in tests/unit/relay/traffic.test.js, in the two range lines changed with Dad's yes.
// Serves: SOF plan Step 2 items "Traffic further out" and "Traffic display settings" (Dad, 8 Oct 2026); SOF-39 (3D view: live aircraft).
// Expected values: ICAO Doc 8643 aircraft type designators (B738 Boeing 737-800; C56X Cessna Citation Excel; C172 Cessna 172; C130 Lockheed C-130 Hercules;
//   F16 General Dynamics F-16; H60 Sikorsky UH-60 / S-70; TEX2 Beechcraft T-6 Texan II, the CT-156 Harvard II); DO-260B emitter category A1 "light, under
//   15,500 lb"; the kinds and the "Names shown for" choice are Dad's (8 Oct 2026). Not read from V6 or from the code's own output.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aircraftKind } from '../../../src/modules/sof/aircraft-kind.js';
import { layerModel } from '../../../src/modules/sof/traffic.js';
import { sceneTraffic, tagShown } from '../../../src/modules/sof/scene3d-model.js';

test('each aircraft is drawn as its kind, a TEX2 is always the T-6, and only T-6s and military are named when asked', () => {
  assert.equal(aircraftKind({ type: 'B738' }), 'airliner', 'Boeing 737-800');
  assert.equal(aircraftKind({ type: 'C56X' }), 'bizjet', 'Citation Excel');
  assert.equal(aircraftKind({ type: 'C172' }), 'light', 'Cessna 172');
  assert.equal(aircraftKind({ type: 'C130', mil: true }), 'mil-cargo', 'C-130 Hercules');
  assert.equal(aircraftKind({ type: 'F16', mil: true }), 'mil-fast', 'F-16');
  assert.equal(aircraftKind({ type: 'H60' }), 'helicopter', 'UH-60 Black Hawk');
  for (const extra of [{}, { mil: true }, { category: 'A7' }, { category: 'A5', mil: true }, { category: 'A6' }]) {
    assert.equal(aircraftKind({ type: 'TEX2', ...extra }), 't6', `TEX2 with ${JSON.stringify(extra)} is the T-6`);
  }
  assert.equal(aircraftKind({ type: 'ZZZZ', category: 'A1' }), 'light', 'unknown type, emitter category A1');

  const now = Date.UTC(2026, 9, 8, 15, 0, 0);
  const at = (hex, type, callsign, mil) => ({ hex, type, callsign, mil, lat: 50.33, lon: -105.56, alt: 8500, gs: 250, track: 270, seen: 1 });
  const reply = { source: 'adsb.lol', now, aircraft: [at('c0aa01', 'B738', 'WJA123', false), at('ae0b01', 'C130', 'RCH401', true), at('c0aa03', 'TEX2', 'TEX21', false)] };
  const view = layerModel({ reply, receivedAt: now, now, label: 'callsign-altitude' });
  const scene = sceneTraffic({ view: { ...view, show: true, status: 'ok', statusText: 'Traffic: 3 aircraft' }, toXY: () => [0, 0], label: 'callsign-altitude', display: { namesFor: 't6-mil' } });
  const byName = Object.fromEntries(scene.aircraft.map((a) => [a.name, a]));
  const shown = (a) => tagShown(a, { labelsOn: scene.labelsOn, t6Tags: true });
  assert.equal(shown(byName.WJA123), false, 'the airliner has no tag');
  assert.equal(shown(byName.RCH401), true, 'the C-130 is named');
  assert.equal(shown(byName.TEX21), true, 'the T-6 is named');
  assert.equal(tagShown(byName.WJA123, { labelsOn: true, picked: true }), true, 'the pointer on the airliner still shows its tag');
  assert.match(byName.WJA123.description, /Airliner/, 'its hover facts name its kind');
});
