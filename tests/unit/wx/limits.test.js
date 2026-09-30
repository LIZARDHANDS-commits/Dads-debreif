import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetar } from '../../../src/wx/metar.js';
import { checkConditions, DANGEROUS_WEATHER, DEFAULT_LIMITS, natoColour, flightCategory, visibilityAtLimit, visibilityBelow } from '../../../src/wx/limits.js';
import { METAR, METAR_NOW } from './reports.js';

const cond = (raw) => parseMetar(raw, { now: METAR_NOW }).conditions;
const home = (raw) => checkConditions(cond(raw), DEFAULT_LIMITS.home);

test('V6 default limits: home 2000 ft / 3 SM, alternate 600 ft / 2 SM', () => {
  assert.deepEqual(DEFAULT_LIMITS, { home: { ceilingFt: 2000, visSm: 3 }, alternate: { ceilingFt: 600, visSm: 2 } });
});

test('issue #5: the limit check V6 never ran reports ceiling and visibility in V6 wording', () => {
  const c = home(METAR.belowBoth);
  assert.equal(c.belowLimits, true);
  assert.deepEqual(c.reasons, ['CEILING 1500 FT < 2000 FT', 'VIS 2 SM < 3 SM']);
});

test('Q27: below means strictly below; exactly at a limit is yellow, not red', () => {
  const c = home(METAR.onLimits);
  assert.equal(c.ceilingBelow, false);
  assert.equal(c.visibilityBelow, false);
  assert.equal(c.belowLimits, false);
  assert.equal(c.ceilingAtLimit, true);
  assert.equal(c.visibilityAtLimit, true);
  assert.equal(c.atLimit, true);
  assert.equal(c.level, 'at-limit');
  assert.deepEqual(c.reasons, ['CEILING 2000 FT AT LIMIT 2000 FT', 'VIS 3 SM AT LIMIT 3 SM']);
});

test('Q27: one element below and the other at its limit is below (red)', () => {
  const c = home('METAR CYMJ 291500Z 27005KT 3SM BR BKN015 10/08 A2995');
  assert.equal(c.belowLimits, true);
  assert.equal(c.visibilityAtLimit, true);
  assert.equal(c.atLimit, false);
  assert.equal(c.level, 'below');
});

test('Q27: M at the limit is below; P at the limit is not at it', () => {
  const at = (sm, qualifier, limit) => visibilityAtLimit({ sm, qualifier }, limit);
  assert.equal(at(3, null, 3), true);
  assert.equal(at(3, 'less', 3), false);
  assert.equal(visibilityBelow({ sm: 3, qualifier: 'less' }, 3), true);
  assert.equal(at(6, 'more', 6), false);
  assert.equal(at(2.5, null, 3), false);
  assert.equal(visibilityAtLimit(null, 3), null);
});

test('Q27: comfortably inside the limits is within', () => {
  const c = home(METAR.typical);
  assert.equal(c.atLimit, false);
  assert.equal(c.level, 'caution');
  assert.equal(home('METAR CYMJ 291500Z 27005KT 15SM BKN080 10/08 A2995').level, 'within');
});

test('issue #3: M1/4SM FG BKN002CB is below every limit and raises fog', () => {
  const c = home(METAR.quarterMileFog);
  assert.equal(c.belowLimits, true);
  assert.deepEqual(c.significant, ['FG']);
  assert.deepEqual(c.convectiveCloud, ['BKN002CB']);
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

test('Q28: VCTS and CB/TCU raise a caution', () => {
  const c = home(METAR.vicinityStorm);
  assert.deepEqual(c.thunderstorm, ['VCTS']);
  assert.deepEqual(c.convectiveCloud, ['FEW040CB']);
  assert.deepEqual(c.cautions, ['VCTS', 'FEW040CB']);
  assert.equal(c.alert, true);
  assert.equal(c.belowLimits, false);
  assert.equal(c.level, 'caution');
  assert.deepEqual(c.reasons, ['THUNDERSTORM / SEVERE WX (VCTS)', 'CB/TCU (FEW040CB)']);
  const t = home(METAR.towering);
  assert.deepEqual(t.cautions, ['FEW040TCU']);
  assert.equal(t.alert, true);
});

test('Q28: funnel cloud, tornado and squalls raise a caution, at the station or nearby', () => {
  for (const code of ['FC', '+FC', 'VCFC', 'SQ']) {
    const c = home(`METAR CYMJ 291500Z 22015G35KT 15SM ${code} BKN080 22/14 A2980`);
    assert.deepEqual(c.thunderstorm, [code], code);
    assert.equal(c.alert, true, code);
  }
});

test('Q28: other dangerous weather raises a caution: hail, ice, volcanic ash, dust and sand', () => {
  const cases = {
    GR: 'GR', GS: 'GS', FZRA: 'FZRA', '-FZDZ': '-FZDZ', PL: 'PL', VA: 'VA', SS: 'SS', '+DS': '+DS',
    PO: 'PO', VCPO: 'VCPO', VCSS: 'VCSS', VCDS: 'VCDS', FG: 'FG', FZFG: 'FZFG', BLSN: 'BLSN',
  };
  for (const [code, raw] of Object.entries(cases)) {
    const c = home(`METAR CYMJ 291500Z 22010KT 15SM ${code} BKN080 10/08 A2980`);
    assert.deepEqual(c.significant, [raw], code);
    assert.deepEqual(c.cautions, [raw], code);
    assert.equal(c.alert, true, code);
  }
});

test('Q28: shallow or patchy fog, snow and other nearby weather stay information only', () => {
  const c = home('METAR CYMJ 291500Z 00000KT 10SM BCFG -SN VCSH VCFG FEW010 02/01 A3001');
  assert.deepEqual(c.significant, []);
  assert.deepEqual(c.cautions, []);
  assert.equal(c.alert, false);
  assert.equal(c.level, 'within');
  assert.deepEqual(c.watch.shallowFog, ['BCFG']);
  assert.deepEqual(c.watch.snow, ['-SN']);
  assert.deepEqual(c.watch.vicinity, ['VCSH', 'VCFG']);
});

test('Q28: the dangerous codes are published for the spec and the SOF', () => {
  assert.deepEqual([...DANGEROUS_WEATHER].sort(), ['DS', 'FC', 'FZDZ', 'FZFG', 'FZRA', 'GR', 'GS', 'PL', 'PO', 'SQ', 'SS', 'TS', 'VA'].sort());
});

test('unknown visibility is reported as unknown, not as within limits', () => {
  const c = checkConditions(cond('METAR CYMJ 291500Z 27010KT BKN030'), DEFAULT_LIMITS.home);
  assert.equal(c.visibilityUnknown, true);
  assert.equal(c.visibilityBelow, false);
  assert.equal(c.level, 'unknown');
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
