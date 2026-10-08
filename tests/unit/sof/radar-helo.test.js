// Checks: (a) in the SOF's 3D view a radar return under model cloud with its base at 4,000 ft and its top at 12,000 ft is drawn as a block from 4,000 to
//   12,000 ft, in the radar's own colour, with a rain curtain from the ground up to the 4,000 ft base when "Rain to ground" is on and none when it is off; with no
//   model cloud over the return the block stands on the ground. (b) A relay aircraft of type H60 (the Black Hawk family) is a helicopter and is drawn and named as
//   one; a B738 (Boeing 737-800) is not; a TEX2 is still the T-6, not a helicopter.
// Serves: SOF-39 (3D view: radar and live aircraft), plan Step 2 items "Radar blocks at cloud height" and "Traffic tags a little smaller, and helicopters drawn as
//   helicopters" (Dad, 8 Oct 2026).
// Expected values: the stated geometry (cloud base 4,000 ft and top 12,000 ft above sea level over flat ground at 1,900 ft, about Moose Jaw's elevation; the radar
//   colour given in is the colour drawn); ICAO Doc 8643 aircraft type designators (H60 Sikorsky UH-60 / S-70, a helicopter; B738 Boeing 737-800, an aeroplane;
//   TEX2 Beechcraft T-6 Texan II); a TEX2 is the T-6 (Dad, 7 Oct). Not read from V6 or from the code's own output.
// Margin: ±100 ft, the shared table's height margin, for the block's base and top and the curtain's ends.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shafts } from '../../../src/modules/sof/weather3d-model.js';
import { slabColumnAt } from '../../../src/modules/sof/cloud-field.js';
import { layerModel } from '../../../src/modules/sof/traffic.js';
import { sceneTraffic } from '../../../src/modules/sof/scene3d-model.js';

const GROUND_FT = 1900;
const BASE_FT = 4000;
const TOP_FT = 12_000;
const near = (got, want, what) => assert.ok(Math.abs(got - want) <= 100, `${what}: ${got} ft, expected ${want} ft ± 100`);

/** Cloud slabs over the whole square as the 3D view keeps them (cloud-field.js `slabFields`'s shape): one low slab, `cover` percent, base and top as given. */
function slabs(cover) {
  const px = 4;
  const fill = (v) => new Float32Array(px * px).fill(v);
  return { px, groundFt: GROUND_FT, low: { base: fill(BASE_FT), top: fill(TOP_FT), cover: fill(cover), levels: fill(3) }, mid: null, high: null };
}

/** One radar cell in the middle of the square, a green return. */
const CELL = { x: 0, y: 0, u: 0.5, v: 0.5, r: 0, g: 200, b: 60, a: 0.9 };

test('a radar return under cloud from 4,000 to 12,000 ft is a block from 4,000 to 12,000 ft with a rain curtain to the ground when Rain to ground is on, and stands on the ground with no model cloud', () => {
  const cloudy = slabs(80);
  const column = (u, v) => slabColumnAt(cloudy, u, v);

  const [block] = shafts([CELL], { column, groundFt: GROUND_FT });
  near(block.baseFt, BASE_FT, 'block base');
  near(block.topFt, TOP_FT, 'block top');
  assert.deepEqual(block.colour, [0, 200, 60], 'the block keeps the radar colour');
  assert.ok(block.rain, 'Rain to ground is on by default: there is a curtain');
  near(block.rain.baseFt, GROUND_FT, 'curtain bottom');
  near(block.rain.topFt, BASE_FT, 'curtain top');

  const [dry] = shafts([CELL], { column, groundFt: GROUND_FT, rainToGround: false });
  near(dry.baseFt, BASE_FT, 'block base with Rain to ground off');
  near(dry.topFt, TOP_FT, 'block top with Rain to ground off');
  assert.equal(dry.rain, null, 'no curtain with Rain to ground off');

  const clear = slabs(0); // the model has no cloud over the return
  const [bare] = shafts([CELL], { column: (u, v) => slabColumnAt(clear, u, v), groundFt: GROUND_FT });
  near(bare.baseFt, GROUND_FT, 'block base with no model cloud');
  assert.ok(bare.topFt > bare.baseFt, 'the block still has height');
  assert.equal(bare.modelTop, false, 'its height is not from the model');
  assert.equal(bare.rain, null, 'no separate curtain: the block itself reaches the ground');
});

test('a relay H60 is a helicopter, drawn and named as one; a B738 is not; a TEX2 is still the T-6', () => {
  const now = Date.UTC(2026, 9, 8, 15, 0, 0);
  const at = (hex, type, callsign) => ({ hex, type, callsign, lat: 50.33, lon: -105.56, alt: 3500, gs: 110, track: 90, seen: 1 });
  const reply = { source: 'adsb.lol', now, aircraft: [at('c0ff01', 'H60', 'RESCUE1'), at('c0ff02', 'B738', 'WJA123'), at('c0ff03', 'TEX2', 'TEX21')] };

  const view = layerModel({ reply, receivedAt: now, now });
  const byType = Object.fromEntries(view.aircraft.map((a) => [a.type, a]));
  assert.equal(byType.H60.helicopter, true, 'H60 is a helicopter');
  assert.match(byType.H60.description, /Helicopter/, 'its words say so');
  assert.equal(byType.B738.helicopter, false, 'B738 is not a helicopter');
  assert.doesNotMatch(byType.B738.description, /Helicopter/);
  assert.equal(byType.TEX2.helicopter, false, 'TEX2 is not a helicopter');

  const scene = sceneTraffic({ view: { ...view, show: true, status: 'ok', statusText: 'Traffic: 3 aircraft' }, toXY: () => [0, 0] });
  const inScene = Object.fromEntries(scene.aircraft.map((a) => [a.name, a]));
  assert.equal(inScene.RESCUE1.helicopter, true, 'the 3D view draws the H60 as a helicopter');
  assert.equal(inScene.RESCUE1.isT6, false);
  assert.equal(inScene.WJA123.helicopter, false, 'the B738 stays fixed-wing');
  assert.equal(inScene.TEX21.isT6, true, 'TEX2 is still the T-6');
  assert.equal(inScene.TEX21.helicopter, false);
  assert.match(scene.statusText, /1 helicopter/, 'the 3D traffic line names the helicopter');
});
