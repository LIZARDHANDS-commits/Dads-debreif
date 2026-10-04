// High Key from anywhere (Traffic spec 1a item 23, approved 4 Oct 2026 09:56Z): press High Key
// anywhere and the aircraft flies a full-power climbing turn onto the 1/8 NM run-in and arrives
// at High Key, at its height, on the runway track. These check what a pilot would see at the end.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHighKeyClimb, HIGH_KEY_PT, HIGH_KEY_RUN_IN_FT, RWY_HDG_DEG } from '../../../src/modules/traffic/high-key.js';

const UX = Math.sin(RWY_HDG_DEG * Math.PI / 180);
const UY = Math.cos(RWY_HDG_DEG * Math.PI / 180);
const wrap180 = (d) => ((d % 360) + 540) % 360 - 180;

// Start points around the field: on the downwind, at initial, on the runway, far out on each side, and in a wind.
const STARTS = [
  { name: 'outer downwind, heading out', from: { x: -24473, y: -500, alt: 3500, kias: 220, headingDeg: 209 } },
  { name: 'departure end, low and slow', from: { x: -4066, y: 681, alt: 1500, kias: 150, headingDeg: 298 } },
  { name: 'over the threshold, heading the wrong way', from: { x: 3104, y: -3194, alt: 5000, kias: 140, headingDeg: 118 } },
  { name: 'north of the field, heading west', from: { x: 0, y: 0, alt: 3500, kias: 220, headingDeg: 298 } },
  { name: 'south-east, heading north', from: { x: 15000, y: -12000, alt: 3500, kias: 220, headingDeg: 0 } },
  { name: 'south-west in 20 kt from 200', from: { x: -10000, y: -12000, alt: 3500, kias: 220, headingDeg: 120 }, wind: { windKt: 20, windFromDeg: 200 } },
  { name: 'north-west in 15 kt from 300', from: { x: -20000, y: 8000, alt: 4500, kias: 220, headingDeg: 90 }, wind: { windKt: 15, windFromDeg: 300 } },
];

for (const { name, from, wind } of STARTS) {
  test(`High Key from anywhere (${name}): arrives at High Key at its height, rolled out on the run-in`, () => {
    const { points, arriveAltFt } = buildHighKeyClimb({ ...from, bankDeg: 0 }, wind ?? {});
    const end = points.at(-1);
    // ±100 ft: the shared height and distance margin (docs/TESTING.md).
    assert.ok(Math.abs(arriveAltFt - HIGH_KEY_PT.alt) <= 100, `arrives at ${arriveAltFt.toFixed(0)} ft, High Key is ${HIGH_KEY_PT.alt} ft`);
    assert.ok(Math.hypot(end.x - HIGH_KEY_PT.x, end.y - HIGH_KEY_PT.y) <= 100, `ends ${Math.hypot(end.x - HIGH_KEY_PT.x, end.y - HIGH_KEY_PT.y).toFixed(0)} ft from High Key`);
    // The run-in: the last 760 ft before High Key, flown on the runway track. ±100 ft off the centreline
    // (shared margin); ±10° of track rather than the shared ±5°, because the run-in is only about 5 s
    // long and an aircraft that joined late may still be making small corrections onto the line.
    let k = points.length - 1;
    while (k > 0 && ((points[k - 1].x - HIGH_KEY_PT.x) * UX + (points[k - 1].y - HIGH_KEY_PT.y) * UY) >= -HIGH_KEY_RUN_IN_FT) k--;
    assert.ok(k < points.length - 2, 'flies a run-in before High Key');
    for (let i = Math.max(k, 1); i < points.length; i++) {
      const p = points[i], q = points[i - 1];
      const crossFt = (p.x - HIGH_KEY_PT.x) * UY - (p.y - HIGH_KEY_PT.y) * UX;
      assert.ok(Math.abs(crossFt) <= 100, `on the run-in ${crossFt.toFixed(0)} ft off the centreline`);
      if (Math.hypot(p.x - q.x, p.y - q.y) < 1) continue;
      const trackDeg = Math.atan2(p.x - q.x, p.y - q.y) * 180 / Math.PI;
      assert.ok(Math.abs(wrap180(trackDeg - RWY_HDG_DEG)) <= 10, `run-in track ${trackDeg.toFixed(1)}° vs runway ${RWY_HDG_DEG}°`);
    }
  });
}
