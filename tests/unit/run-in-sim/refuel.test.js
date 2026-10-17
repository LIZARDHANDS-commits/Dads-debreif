// Checks: the air refuelling run (proposed, built ahead of Patrick's yes; Dad, 17 Oct 2026), from its defaults in still
//   air over flat ground: the stand-in receiver ends the join at the pre-contact point behind the tanker's left basket, it
//   is never ahead of the tanker's wing line from the tanker's roll-out on, and the tanker never goes below its set height
//   (what a pilot would recognise: it joined, it never overran, the tanker held its height).
// Serves: RS-R11 and RS-R12 (docs/modules/run-in-sim/testing.md; plan Step 7).
// Expected values: the pre-contact point the test works out from the settings (the set pre-contact distance behind the
//   basket, and the basket's place on the tanker, the drogue's numbers) and the tanker's set height; nothing from the
//   code's own output or V6. Margins: the pre-contact point within the shared table's loose formation margin, ±50 ft (a
//   station a pilot would call "in pre-contact"; wider than the ±20 ft close one because the point itself is an estimate);
//   the tanker's height within the shared ±100 ft (tests/helpers/tolerances.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { flyRefuel, DROGUE, RECEIVER } from '../../../src/modules/run-in-sim/refuel.js';
import { DEFAULTS, runPatch, setupFrom } from '../../../src/modules/run-in-sim/defaults.js';
import { TOLERANCES } from '../../helpers/tolerances.js';

test('the stand-in receiver joins to pre-contact behind the left basket, never ahead of the wing line, the tanker at its height', () => {
  const world = { groundAt: () => 1800, known: () => true }; // flat ground, about Moose Jaw's height
  const settings = { ...DEFAULTS, ...runPatch('aar'), windTopKt: 0, windGroundKt: 0 };
  const { flight, tanker } = flyRefuel(setupFrom(settings), world);
  const tl = flight.timeline;
  const n = tl.t.length;
  const rollOut = flight.events.rollOut;
  assert.ok(Number.isFinite(rollOut), 'the tanker rolls out ahead of the receiver');

  // The tanker's nose (its air velocity) and left, at a stored step.
  const frame = (i) => {
    const v = Math.hypot(tanker.vx[i], tanker.vy[i]);
    const f = { x: tanker.vx[i] / v, y: tanker.vy[i] / v };
    return { f, l: { x: -f.y, y: f.x } };
  };

  // Never ahead of the tanker's wing line (the line through it square to its heading) from the roll-out on.
  for (let i = 0; i < n; i++) {
    if (tl.t[i] < rollOut) continue;
    const { f } = frame(i);
    const ahead = (tl.x[i] - tanker.x[i]) * f.x + (tl.y[i] - tanker.y[i]) * f.y;
    assert.ok(ahead < 0, `behind the wing line at ${tl.t[i].toFixed(1)} s (${ahead.toFixed(0)} ft)`);
  }

  // At the end: at pre-contact, the receiver's nose the set distance behind the left basket.
  const i = n - 1;
  const { f, l } = frame(i);
  const down = (DROGUE.hoseDownDeg * Math.PI) / 180;
  const behindFt = DROGUE.hoseFt * Math.cos(down) - DROGUE.podTailAheadFt + settings.aarPreContactFt + RECEIVER.noseAheadFt;
  const pre = {
    x: tanker.x[i] - f.x * behindFt + l.x * DROGUE.podOutFt,
    y: tanker.y[i] - f.y * behindFt + l.y * DROGUE.podOutFt,
    z: tanker.z[i] + DROGUE.podUpFt - DROGUE.hoseFt * Math.sin(down),
  };
  const offFt = Math.hypot(tl.x[i] - pre.x, tl.y[i] - pre.y, tl.z[i] - pre.z);
  assert.ok(offFt <= TOLERANCES.FORMATION_LOOSE_FT, `ends ${offFt.toFixed(0)} ft from the pre-contact point`);

  // The tanker never below its set height by more than the shared margin.
  for (let k = 0; k < n; k++) {
    assert.ok(tanker.z[k] >= settings.aarHeightFt - TOLERANCES.ALTITUDE_FT, `the tanker at ${tanker.z[k].toFixed(0)} ft at ${tl.t[k].toFixed(1)} s`);
  }
});
