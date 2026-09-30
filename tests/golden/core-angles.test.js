// Golden test (R9): src/core/angles.js gives the same answers as V6's own
// angle functions. V6 has five copies of "wrap an angle"; core keeps one,
// and each copy is compared with it here.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as angles from '../../src/core/angles.js';
import { loadV6 } from './v6-source.js';
import { EDGE_RADIANS, spread } from './inputs.js';

const RAD = [...EDGE_RADIANS, ...spread(2000, -40, 40, 11)];
const DEG = [0, 180, -180, 180.0001, -180.0001, 360, -360, 540, 725, -725, ...spread(2000, -2000, 2000, 12)];
const RAD2DEG = 'function rad2deg(r){return r*180/Math.PI}';

const debrief = loadV6(['normAngleRad', 'absAngleDeg', 'aspectAngleDeg', 'headingCrossAngleDeg', 'angleDiffRad'],
  { marker: 'function mercatorY(', prelude: RAD2DEG });
const turnSim = loadV6(['deg2rad', 'rad2deg', 'relativeBearingDeg', 'normDeg', 'clockToRelativeDeg']);
const em = loadV6(['hdg', 'dAng'], { marker: 'const BG={6500' });
const threeD = loadV6(['headingDelta'], { marker: 'function clamp(v,min,max)' });
const bfm = loadV6(['ad', 'wrapH'], { marker: '<script id="bfmFight">' });
const traffic = loadV6(['vFromHdg'], { page: 'traffic' });

const pts = spread(400, -20000, 20000, 13);
const pairs = Array.from({ length: 200 }, (_, i) => [{ x: pts[2 * i], y: pts[2 * i + 1] }, { x: pts[399 - 2 * i], y: pts[398 - 2 * i] }]);

test('degToRad and radToDeg are V6 deg2rad and rad2deg', () => {
  for (const d of DEG) assert.equal(angles.degToRad(d), turnSim.deg2rad(d));
  for (const r of RAD) assert.equal(angles.radToDeg(r), turnSim.rad2deg(r));
});

test('wrapDeg180 is Turn Sim normDeg', () => {
  for (const d of DEG) assert.equal(angles.wrapDeg180(d), turnSim.normDeg(d), `d=${d}`);
});

test('wrapPi is debrief normAngleRad and Turn Fight wrapH, exactly', () => {
  for (const r of RAD) {
    assert.equal(angles.wrapPi(r), debrief.normAngleRad(r), `r=${r}`);
    assert.equal(angles.wrapPi(r), bfm.wrapH(r), `r=${r}`);
  }
});

test('wrapPi(a - b) is the EM chart dAng, exactly', () => {
  for (const a of RAD) assert.equal(angles.wrapPi(a - 0.3), em.dAng(a, 0.3));
});

test('wrapPi(a - b) matches the 3D view headingDelta to 1e-12 rad, except the sign at exactly +π', () => {
  // headingDelta uses %, so it returns -π where the loop keeps +π, and rounds
  // differently by up to about 4e-14 on angles of many turns. Neither changes a shown number.
  assert.equal(angles.wrapPi(Math.PI), Math.PI);
  assert.equal(threeD.headingDelta(Math.PI, 0), -Math.PI);
  for (const a of RAD) {
    const core = angles.wrapPi(a), v6 = threeD.headingDelta(a, 0);
    if (Math.abs(Math.abs(core) - Math.PI) < 1e-9) assert.ok(Math.abs(Math.abs(core) - Math.abs(v6)) < 1e-12, `a=${a}`);
    else assert.ok(Math.abs(core - v6) < 1e-12, `a=${a}: ${core} vs ${v6}`);
  }
});

test('absAngleDeg matches Turn Fight ad() to 1e-10 degrees', () => {
  for (const a of RAD) assert.ok(Math.abs(angles.absAngleDeg(a - 0.7) - bfm.ad(a, 0.7)) < 1e-10, `a=${a}`);
});

test('angleDiffRad and absAngleDeg are the debrief versions', () => {
  for (const a of RAD) {
    assert.equal(angles.angleDiffRad(a, 1.1), debrief.angleDiffRad(a, 1.1));
    assert.equal(angles.absAngleDeg(a), debrief.absAngleDeg(a));
  }
});

test('headingRad is the EM chart hdg', () => {
  for (const [a, b] of pairs) assert.equal(angles.headingRad(a, b), em.hdg(a, b));
});

test('aspectAngleDeg and headingCrossAngleDeg are the debrief versions, including missing data', () => {
  for (const [a, b] of pairs) {
    for (const h of RAD.slice(0, 60)) {
      assert.equal(angles.aspectAngleDeg(a, b, h), debrief.aspectAngleDeg(a, b, h));
      assert.equal(angles.headingCrossAngleDeg(h, a.x / 5000), debrief.headingCrossAngleDeg(h, a.x / 5000));
    }
  }
  assert.equal(angles.aspectAngleDeg(null, { x: 0, y: 0 }, 0), debrief.aspectAngleDeg(null, { x: 0, y: 0 }, 0));
  assert.equal(angles.aspectAngleDeg({ x: 0, y: 0 }, { x: 1, y: 0 }, NaN), null);
  assert.equal(angles.headingCrossAngleDeg(undefined, 1), debrief.headingCrossAngleDeg(undefined, 1));
});

test('relativeBearingDeg is Turn Sim relativeBearingDeg', () => {
  for (const [a, b] of pairs) {
    for (const h of RAD.slice(0, 40)) {
      const from = { ...a, hdg: h };
      assert.equal(angles.relativeBearingDeg(from, b), turnSim.relativeBearingDeg(from, b));
    }
  }
});

test('clockToRelativeDeg is Turn Sim clockToRelativeDeg, including bad input', () => {
  const clocks = [1, 2, 3, 4, 5, 5.5, 6, 6.5, 7, 8, 9, 10, 11, 12, 0, 13, '3', '5.5', '', 'abc', null, undefined, NaN, -3];
  for (const c of clocks) assert.equal(angles.clockToRelativeDeg(c), turnSim.clockToRelativeDeg(c), `clock=${c}`);
});

test('unitVectorFromCompassDeg is Traffic vFromHdg with y flipped to north-up', () => {
  for (const d of [0, 45, 90, 135, 180, 270, 359, ...spread(200, -720, 720, 14)]) {
    const core = angles.unitVectorFromCompassDeg(d), v6 = traffic.vFromHdg(d);
    assert.equal(core.x, v6.x);
    assert.equal(core.y, -v6.y);
  }
});
