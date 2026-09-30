import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetar } from '../../../src/wx/metar.js';
import { checkConditions, DEFAULT_LIMITS, natoColour, flightCategory, visibilityBelow } from '../../../src/wx/limits.js';
import { METAR, NOW } from './reports.js';

const cond = (raw) => parseMetar(raw, { now: NOW }).conditions;
const home = (raw) => checkConditions(cond(raw), DEFAULT_LIMITS.home);

test('V6 default limits: home 2000 ft / 3 SM, alternate 600 ft / 2 SM', () => {
  assert.deepEqual(DEFAULT_LIMITS, { home: { ceilingFt: 2000, visSm: 3 }, alternate: { ceilingFt: 600, visSm: 2 } });
});

test('issue #5: the limit check V6 never ran reports ceiling and visibility in V6 wording', () => {
  const c = home(METAR.belowBoth);
  assert.equal(c.belowLimits, true);
  assert.deepEqual(c.reasons, ['CEILING 1500 FT < 2000 FT', 'VIS 2 SM < 3 SM']);
});

test('below means strictly below, as in V6 (question WX-1)', () => {
  const c = home(METAR.onLimits);
  assert.equal(c.ceilingBelow, false);
  assert.equal(c.visibilityBelow, false);
});

test('issue #3: M1/4SM FG BKN002CB is below every limit and raises fog', () => {
  const c = home(METAR.quarterMileFog);
  assert.equal(c.belowLimits, true);
  assert.deepEqual(c.significant, ['FG']);
  assert.deepEqual(c.watch.convectiveCloud, ['BKN002CB']);
  assert.equal(c.reasons[1], 'VIS <1/4 SM < 3 SM');
});

test('M and P visibility against a limit match V6 (0.24 and 6.01)', () => {
  const v = (sm, qualifier, limit) => visibilityBelow({ sm, qualifier }, limit);
  assert.equal(v(0.25, 'less', 0.25), true);
  assert.equal(v(0.25, null, 0.25), false);
  assert.equal(v(6, 'more', 6), false);
  assert.equal(v(6, 'more', 3), false);
  assert.equal(visibilityBelow(null, 3), null);
});

test('thunderstorms: TS with several precipitation types counts (V6 missed +TSRAGR)', () => {
  const c = home(METAR.heavyStorm);
  assert.deepEqual(c.thunderstorm, ['+TSRAGR']);
  assert.deepEqual(c.significant, ['+TSRAGR']);
  assert.equal(c.alert, true);
});

test('significant weather: FZFG and -FZRAPL count (V6 missed both)', () => {
  assert.deepEqual(home(METAR.freezingFog).significant, ['FZFG']);
  assert.deepEqual(home(METAR.freezingRainPellets).significant, ['-FZRAPL']);
});

test('VCTS and CB/TCU are reported for the SOF to show, not raised as cautions (question WX-2)', () => {
  const c = home(METAR.vicinityStorm);
  assert.deepEqual(c.thunderstorm, []);
  assert.deepEqual(c.watch.vicinity, ['VCTS']);
  assert.deepEqual(c.watch.convectiveCloud, ['FEW040CB']);
  assert.equal(c.alert, false);
  assert.deepEqual(home(METAR.towering).watch.convectiveCloud, ['FEW040TCU']);
});

test('shallow or patchy fog and snow are watched, not raised (question WX-2)', () => {
  const c = home('METAR CYMJ 291500Z 00000KT 10SM BCFG -SN FEW010 02/01 A3001');
  assert.deepEqual(c.significant, []);
  assert.deepEqual(c.watch.shallowFog, ['BCFG']);
  assert.deepEqual(c.watch.snow, ['-SN']);
});

test('unknown visibility is reported as unknown, not as within limits', () => {
  const c = checkConditions(cond('METAR CYMJ 291500Z 27010KT BKN030'), DEFAULT_LIMITS.home);
  assert.equal(c.visibilityUnknown, true);
  assert.equal(c.visibilityBelow, false);
});

test('NATO colour state: V6 thresholds, with M1/4SM and CB layers now read', () => {
  assert.equal(natoColour(cond(METAR.quarterMileFog)), 'RED');
  assert.equal(natoColour(cond(METAR.typical)), 'BLU');
  assert.equal(natoColour(cond(METAR.mixedFraction)), 'YLO2'); // 400 ft cloud, 2414 m
  assert.equal(natoColour(cond(METAR.heavyStorm)), 'AMB'); // 1207 m, 1500 ft cloud
  assert.equal(natoColour(cond(METAR.towering)), 'BLU'); // FEW does not count
});

test('flight category: V6 thresholds', () => {
  assert.equal(flightCategory(cond(METAR.typical)), 'VFR');
  assert.equal(flightCategory(cond(METAR.belowBoth)), 'IFR');
  assert.equal(flightCategory(cond(METAR.onLimits)), 'MVFR');
  assert.equal(flightCategory(cond(METAR.quarterMileFog)), 'LIFR');
  assert.equal(flightCategory(cond('METAR CYMJ 291500Z 27010KT')), 'UNK');
});
