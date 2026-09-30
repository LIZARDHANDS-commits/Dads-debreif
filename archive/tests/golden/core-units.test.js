// Golden test (R9): src/core/units.js carries V6's own constants and formatting.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as units from '../../src/core/units.js';
import { loadV6, v6FunctionText, v6Number } from './v6-source.js';
import { spread } from './inputs.js';

test('constants are the numbers V6 declares', () => {
  assert.equal(units.FT_PER_NM, v6Number('FT_PER_NM'));
  assert.equal(units.KT_TO_FTPS, v6Number('KTS_TO_FPS'));
  assert.equal(units.G_FTPS2, v6Number('G0'));
  assert.equal(units.FT_PER_M, v6Number('KML_FT_PER_M'));
  assert.equal(units.FTPS_TO_KT, v6Number('KML_KT_PER_FPS'));
  assert.equal(units.EARTH_RADIUS_M, v6Number('R', { marker: 'function projectAll(' }));
  // isaRhoRatio (EM chart, line 4154) converts feet to metres inline.
  assert.equal(units.M_PER_FT, Number(/const h=ft\*([0-9.]+)/.exec(v6FunctionText('isaRhoRatio'))[1]));
});

test('the other V6 copies of the constants agree', () => {
  const bfm = '<script id="bfmFight">';
  assert.equal(units.KT_TO_FTPS, v6Number('KT', { marker: bfm }));
  assert.equal(units.G_FTPS2, v6Number('G', { marker: bfm }));
  assert.equal(units.FT_PER_NM, v6Number('NM', { marker: bfm }));
});

test('FTPS_TO_KT is not exactly 1 / KT_TO_FTPS in V6, and stays that way', () => {
  assert.notEqual(units.FTPS_TO_KT, 1 / units.KT_TO_FTPS);
  assert.ok(Math.abs(units.FTPS_TO_KT * units.KT_TO_FTPS - 1) < 1e-6);
});

test('formatNm matches V6 nm()', () => {
  const v6 = loadV6(['nm'], { prelude: 'const FT_PER_NM=6076.12;' });
  for (const ft of [0, 1, 3037.9, 3038.1, 6076.12, 6000, 12152.24, -500, ...spread(200, 0, 60000, 1)]) {
    assert.equal(units.formatNm(ft), v6.nm(ft), `ft=${ft}`);
  }
});

test('ktToFtps is the Traffic page speedFps and the Turn Sim speedfps', () => {
  const traffic = loadV6(['speedFps'], { page: 'traffic' });
  // Turn Sim reads the speed box; the stub stands in for it.
  const turnSim = loadV6(['speedfps'], {
    prelude: 'const KTS_TO_FPS=1.68781; let box=0; const $=()=>({value:box}); function setSpeed(v){box=v}',
    expose: ['setSpeed'],
  });
  for (const kt of [0, 1, 120, 200, 220, 250, ...spread(200, 0, 400, 2)]) {
    turnSim.setSpeed(kt);
    assert.equal(units.ktToFtps(kt), traffic.speedFps(kt));
    assert.equal(units.ktToFtps(kt), turnSim.speedfps());
  }
});

test('ftpsToKt is how the debrief turns feet per second into knots', () => {
  // V6 multiplies inline (interpTrack line 2442, closureRateKt line 3129).
  assert.ok(v6FunctionText('interpTrack').includes('/dt*KML_KT_PER_FPS'));
  assert.ok(v6FunctionText('closureRateKt').includes('*KML_KT_PER_FPS'));
  for (const ftps of spread(200, 0, 700, 3)) assert.equal(units.ftpsToKt(ftps), ftps * v6Number('KML_KT_PER_FPS'));
});
