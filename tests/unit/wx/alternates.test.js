import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTaf } from '../../../src/wx/taf.js';
import { arrivalWindow, homeAlternateTrigger, assessAlternate, checkOptions, visualDescentMinima } from '../../../src/wx/alternates.js';
import { DEFAULT_LIMITS, HOME_TRIGGERS } from '../../../src/wx/limits.js';
import { TAF, NOW, at } from './reports.js';

const taf = (raw) => parseTaf(raw, { now: NOW });
// Takeoff 17Z, land 19Z, window to land + 1 hour (V6's wave window).
const WAVE = { from: at(29, 17), to: at(29, 20) };

test('issue #1: TEMPO 1/2SM FG in the wave window triggers the home alternate', () => {
  const r = homeAlternateTrigger(taf(TAF.tempoHalfMile), WAVE);
  assert.equal(r.status, 'below');
  assert.deepEqual(r.hits.map((h) => [h.kind, h.reasons]), [['TEMPO', ['VIS 1/2 SM < 3 SM', 'SIGNIFICANT WX (FG)']]]);
});

test('issue #2: BECMG to 1SM OVC003 before the wave triggers the home alternate', () => {
  const r = homeAlternateTrigger(taf(TAF.becmgIfr), WAVE);
  assert.equal(r.status, 'below');
  assert.deepEqual(r.hits.map((h) => h.kind), ['PREVAILING']);
  assert.deepEqual(r.hits[0].reasons, ['CEILING 300 FT < 2000 FT', 'VIS 1 SM < 3 SM']);
});

test('issue #2 (sof-c#7): IFR only before the first FM does not trigger an afternoon wave', () => {
  assert.equal(homeAlternateTrigger(taf(TAF.leadingTempo), WAVE).status, 'meets');
});

test('issue #3: a BKN015CB ceiling triggers the home alternate', () => {
  const r = homeAlternateTrigger(taf(TAF.cbCeiling), WAVE);
  assert.equal(r.status, 'below');
  assert.deepEqual(r.hits[0].reasons, ['CEILING 1500 FT < 2000 FT', 'CB/TCU (BKN015CB)']);
});

test('limits are an input (R16): 1000 ft / 1 SM home limits let the BKN015CB wave go', () => {
  assert.equal(homeAlternateTrigger(taf(TAF.cbCeiling), WAVE, { ceilingFt: 1000, visSm: 1 }).status, 'meets');
});

test('a TAF that does not cover the whole window says so, and still lists what it knows', () => {
  const r = homeAlternateTrigger(taf(TAF.overnightFog), { from: at(30, 6), to: at(30, 13) });
  assert.equal(r.status, 'not-covered');
  assert.equal(r.covered, false);
  assert.equal(r.hits.length, 1);
});

test('no TAF', () => {
  assert.equal(homeAlternateTrigger(null, WAVE).status, 'no-taf');
  assert.equal(homeAlternateTrigger(taf('NO TAF AVAILABLE'), WAVE).status, 'no-taf');
});

test('issue #4: an alternate in fog at ETA is below minima, not green', () => {
  const r = assessAlternate(taf(TAF.altFogLifting), at(29, 17));
  assert.equal(r.status, 'below');
  assert.deepEqual(r.hits[0].reasons, ['CEILING 200 FT < 600 FT', 'VIS <1/4 SM < 2 SM', 'SIGNIFICANT WX (FG)', 'CB/TCU (BKN002CB)']);
});

test('issue #4: the same alternate after the fog lifts meets minima', () => {
  const r = assessAlternate(taf(TAF.altFogLifting), at(29, 19));
  assert.equal(r.status, 'meets');
  assert.equal(r.prevailing.visibility.qualifier, 'more');
});

test('issue #4: a TEMPO active at ETA counts against the alternate', () => {
  const r = assessAlternate(taf(TAF.altTempoShowers), at(29, 18));
  assert.equal(r.status, 'below');
  assert.deepEqual(r.hits.map((h) => h.kind), ['TEMPO']);
  assert.equal(assessAlternate(taf(TAF.altTempoShowers), at(29, 21)).status, 'meets');
});

test('alternate minima are an input per airfield (D60)', () => {
  const r = assessAlternate(taf(TAF.altTempoShowers), at(29, 18), { minima: { ceilingFt: 400, visSm: 0.5 } });
  assert.equal(r.status, 'meets');
  // The TEMPO's 1SM sits exactly on a 1 SM limit (Q27).
  assert.equal(assessAlternate(taf(TAF.altTempoShowers), at(29, 18), { minima: { ceilingFt: 400, visSm: 1 } }).status, 'at-limit');
});

test('alternate without a TAF, or with an ETA outside it, is never green', () => {
  assert.equal(assessAlternate(null, at(29, 18)).status, 'no-taf');
  assert.equal(assessAlternate(taf(TAF.altFogLifting), at(30, 13)).status, 'not-covered');
});

test('alternate TAF without a readable visibility is incomplete, not green', () => {
  const r = assessAlternate(taf('TAF CYQR 291140Z 2912/3012 27010KT BKN040'), at(29, 18));
  assert.equal(r.status, 'incomplete');
});

test('Q27: a forecast exactly on the home limits is at-limit (yellow), not below', () => {
  const r = homeAlternateTrigger(taf('TAF CYMJ 291120Z 2912/3012 27010KT 3SM BR BKN020'), WAVE);
  assert.equal(r.status, 'at-limit');
  assert.deepEqual(r.hits, []);
  assert.equal(r.atLimit.length, 1);
  assert.equal(r.atLimit[0].kind, 'PREVAILING');
  assert.deepEqual(r.atLimit[0].reasons, ['CEILING 2000 FT AT LIMIT 2000 FT', 'VIS 3 SM AT LIMIT 3 SM']);
});

test('Q27: a TEMPO exactly on the limits makes the trigger at-limit; below anywhere still wins', () => {
  const tempoAt = 'TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC TEMPO 2916/2920 3SM BR BKN030';
  assert.equal(homeAlternateTrigger(taf(tempoAt), WAVE).status, 'at-limit');
  const mixed = 'TAF CYMJ 291120Z 2912/3012 27010KT 3SM BR BKN020 TEMPO 2917/2919 1SM BR';
  assert.equal(homeAlternateTrigger(taf(mixed), WAVE).status, 'below');
});

test('Q27: an alternate exactly on its limits at ETA is at-limit', () => {
  const r = assessAlternate(taf('TAF CYQR 291140Z 2912/3012 27010KT 2SM BR OVC006'), at(29, 18));
  assert.equal(r.status, 'at-limit');
});

test('Q27: an unreadable forecast is incomplete even when another part is at a limit', () => {
  const raw = 'TAF CYMJ 291120Z 2912/3012 27010KT BKN040 TEMPO 2917/2919 3SM BR BKN020';
  assert.equal(homeAlternateTrigger(taf(raw), WAVE).status, 'incomplete');
});

test('Q28: dangerous weather in the window is listed as a caution without changing the limit status', () => {
  const r = homeAlternateTrigger(taf('TAF CYMJ 291120Z 2912/3012 24012KT P6SM SCT050 PROB30 TEMPO 2917/2919 P6SM VCTS BKN050CB'), WAVE);
  assert.equal(r.status, 'meets');
  assert.equal(r.cautions.length, 1);
  assert.equal(r.cautions[0].kind, 'PROB');
  assert.deepEqual(r.cautions[0].cautions, ['VCTS', 'BKN050CB']);
});

// Q30 / D60: alternates over an arrival window, minima per airfield (CAP GEN).
test('D60: the arrival window runs from the earliest ETA minus 1 hour to the latest plus 1 hour', () => {
  assert.deepEqual(arrivalWindow([at(29, 18, 30), at(29, 18), at(29, 19)]), { from: at(29, 17), to: at(29, 20) });
  assert.deepEqual(arrivalWindow(at(29, 18), { marginMin: 30 }), { from: at(29, 17, 30), to: at(29, 18, 30) });
  assert.deepEqual(arrivalWindow([at(29, 18)], { marginMin: 0 }), { from: at(29, 18), to: at(29, 18) });
  assert.equal(arrivalWindow([]), null);
  assert.equal(arrivalWindow(['not a date', null]), null);
  assert.deepEqual(arrivalWindow([at(29, 18), 'junk']), { from: at(29, 17), to: at(29, 19) });
});

test('D60: fog that lifts at 18Z fails a window that starts before it, though the ETA is after', () => {
  const t = taf(TAF.altFogLifting);
  assert.equal(assessAlternate(t, at(29, 19)).status, 'meets');
  const r = assessAlternate(t, arrivalWindow(at(29, 18, 30)));
  assert.equal(r.status, 'below');
  assert.equal(+r.worst.from, +at(29, 12));
  assert.equal(r.worst.kind, 'PREVAILING');
});

test('D60: a window the TAF does not fully cover is not-covered', () => {
  assert.equal(assessAlternate(taf(TAF.altFogLifting), arrivalWindow(at(30, 11, 30))).status, 'not-covered');
});

test('D60: standard minima options pass when any one option is met (600-2, 700-1 1/2, 800-1)', () => {
  const precision = [{ ceilingFt: 600, visSm: 2 }, { ceilingFt: 700, visSm: 1.5 }, { ceilingFt: 800, visSm: 1 }];
  const t = taf('TAF CYQR 291140Z 2912/3012 27010KT 1 1/2SM BR OVC009');
  assert.equal(assessAlternate(t, at(29, 18)).status, 'below');
  assert.equal(assessAlternate(t, at(29, 18), { minima: precision }).status, 'meets');
  const onOption = taf('TAF CYQR 291140Z 2912/3012 27010KT 1 1/2SM BR OVC007');
  assert.equal(assessAlternate(onOption, at(29, 18), { minima: precision }).status, 'at-limit');
  const r = assessAlternate(taf('TAF CYQR 291140Z 2912/3012 27010KT 1SM BR OVC007'), at(29, 18), { minima: precision });
  assert.equal(r.status, 'below');
  assert.deepEqual(r.hits[0].reasons, ['VIS 1 SM < 2 SM']);
});

test('D60: a non-precision field at 800-2 fails what a precision field at 600-2 passes', () => {
  const t = taf('TAF CYYN 291140Z 2912/3012 27010KT P6SM OVC007');
  assert.equal(assessAlternate(t, at(29, 18)).status, 'meets');
  assert.equal(assessAlternate(t, at(29, 18), { minima: { ceilingFt: 800, visSm: 2 } }).status, 'below');
});

test('D60: TEMPO and BECMG count against the alternate minima, taking the worse of before and after', () => {
  const tempo = assessAlternate(taf(TAF.altTempoShowers), arrivalWindow(at(29, 20, 30)));
  assert.equal(tempo.status, 'below');
  assert.deepEqual(tempo.hits.map((h) => h.kind), ['TEMPO']);
  const worsening = 'TAF CYQR 291140Z 2912/3012 27010KT P6SM BKN040 BECMG 2917/2919 1SM BR OVC004';
  const b = assessAlternate(taf(worsening), at(29, 17, 30));
  assert.equal(b.status, 'below');
  assert.deepEqual(b.hits.map((h) => h.kind), ['BECMG']);
  const improving = 'TAF CYQR 291140Z 2912/3012 27010KT 1SM BR OVC004 BECMG 2917/2919 P6SM BKN040';
  assert.equal(assessAlternate(taf(improving), at(29, 18, 30)).status, 'below');
  assert.equal(assessAlternate(taf(improving), at(29, 19, 30)).status, 'meets');
});

test('D60: PROB counts against the landing minima, not the alternate minima', () => {
  const t = taf('TAF CYQR 291140Z 2912/3012 27010KT P6SM BKN040 PROB30 2917/2920 1SM BR OVC004');
  const landing = { ceilingFt: 300, visSm: 0.75 };
  const passes = assessAlternate(t, at(29, 18), { landingMinima: landing });
  assert.equal(passes.status, 'meets');
  assert.deepEqual(passes.probUnchecked, []);
  const fails = assessAlternate(t, at(29, 18), { landingMinima: { ceilingFt: 500, visSm: 1 } });
  assert.equal(fails.status, 'below');
  assert.equal(fails.hits[0].kind, 'PROB');
  assert.deepEqual(fails.hits[0].reasons, ['CEILING 400 FT < 500 FT', 'VIS 1 SM AT LIMIT 1 SM']);
});

test('D60: without landing minima, a PROB below the alternate minima is a warning only', () => {
  const t = taf('TAF CYQR 291140Z 2912/3012 27010KT P6SM BKN040 PROB30 2917/2920 1SM BR OVC004');
  const r = assessAlternate(t, at(29, 18));
  assert.equal(r.status, 'meets');
  assert.deepEqual(r.hits, []);
  assert.equal(r.probUnchecked.length, 1);
  assert.equal(r.probUnchecked[0].kind, 'PROB');
});

test('D60: a GNSS-based alternate under 100 NM from a GNSS-based home is warned about', () => {
  const t = taf(TAF.altFogLifting);
  const near = assessAlternate(t, at(29, 19), { gnssApproach: true, homeGnssApproach: true, distanceNm: 35 });
  assert.equal(near.status, 'meets');
  assert.equal(near.warnings.length, 1);
  assert.match(near.warnings[0], /100 NM/);
  assert.deepEqual(assessAlternate(t, at(29, 19), { gnssApproach: true, homeGnssApproach: true, distanceNm: 119 }).warnings, []);
  assert.deepEqual(assessAlternate(t, at(29, 19), { gnssApproach: true, homeGnssApproach: false, distanceNm: 35 }).warnings, []);
  const unknown = assessAlternate(t, at(29, 19), { gnssApproach: true, homeGnssApproach: true });
  assert.match(unknown.warnings[0], /distance/);
});

test('D60: bad minima fall back to V6\'s 600/2 rather than passing everything', () => {
  const t = taf('TAF CYQR 291140Z 2912/3012 27010KT 1SM BR OVC004');
  for (const minima of [null, [], [{ ceilingFt: NaN, visSm: 2 }], { ceilingFt: 'x' }]) {
    assert.equal(assessAlternate(t, at(29, 18), { minima }).status, 'below', JSON.stringify(minima));
  }
});

// D80: an alternate with a GNSS-only visual descent. MEA is above sea level and
// a ceiling is above the field, so the field elevation converts one to the other.
const VD = 'TAF CYYN 291140Z 2912/3012 27010KT 4SM BR OVC035';

test('D80: without visualDescent, the usual alternate minima apply (pinned)', () => {
  assert.equal(assessAlternate(taf(VD), at(29, 18)).status, 'meets');
});

test('D80: visual descent passes at MEA + 500 ft above sea level and 3 SM, over the window', () => {
  // CYYN is at 2,677 ft. MEA 5,200 ft needs a ceiling of 5,700 ft MSL, 3,023 ft above the field.
  const vd = (meaFt, visSm) => ({ visualDescent: { meaFt, elevationFt: 2677, visSm } });
  assert.equal(assessAlternate(taf(VD), at(29, 18), vd(5200)).status, 'meets');
  assert.equal(assessAlternate(taf(VD), at(29, 18), vd(6200)).status, 'below');
  const r = assessAlternate(taf(VD), at(29, 18), vd(5200, 5));
  assert.equal(r.status, 'below');
  assert.deepEqual(r.hits[0].reasons, ['VIS 4 SM < 5 SM']);
  assert.equal(assessAlternate(taf('TAF CYYN 291140Z 2912/3012 27010KT 3SM BR OVC035'), at(29, 18), vd(5200)).status, 'at-limit');
  const early = assessAlternate(taf('TAF CYYN 291140Z 2912/3012 27010KT 1SM BR OVC010 FM291800 27010KT P6SM OVC040'), arrivalWindow(at(29, 18, 30)), vd(5200));
  assert.equal(early.status, 'below');
});

test('D80: visual descent without a usable MEA or field elevation is incomplete, never a pass', () => {
  for (const visualDescent of [{ meaFt: 5200 }, { elevationFt: 2677 }, { meaFt: 'x', elevationFt: 2677 }, {}]) {
    const r = assessAlternate(taf(VD), at(29, 18), { visualDescent });
    assert.equal(r.status, 'incomplete', JSON.stringify(visualDescent));
    assert.match(r.problems.at(-1), /MEA/);
  }
});

test('Q4: local (MTCA) 2000/3 is the default trigger; cross-country 3000/3 needs an alternate below 3000 ft', () => {
  const { local, crossCountry } = HOME_TRIGGERS;
  assert.deepEqual([local.ceilingFt, local.visSm], [DEFAULT_LIMITS.home.ceilingFt, DEFAULT_LIMITS.home.visSm]);
  assert.equal(local.label, 'Local (MTCA) 2000/3');
  assert.equal(crossCountry.label, 'Cross-country 3000/3');
  const bkn025 = taf('TAF CYMJ 291120Z 2912/3012 27010KT P6SM BKN025');
  assert.equal(homeAlternateTrigger(bkn025, WAVE).status, 'meets');
  assert.equal(homeAlternateTrigger(bkn025, WAVE, local).status, 'meets');
  assert.equal(homeAlternateTrigger(bkn025, WAVE, crossCountry).status, 'below');
});

test('checkOptions and visualDescentMinima are exported for the SOF card', () => {
  const { conditions } = taf('TAF CYYN 291120Z 2912/3012 27010KT P6SM OVC030').groups[0];
  const vd = visualDescentMinima({ meaFt: 5200, elevationFt: 2677 });
  assert.deepEqual(vd, [{ ceilingFt: 3023, visSm: 3 }]);
  assert.equal(checkOptions(conditions, vd).belowLimits, true);
  assert.equal(checkOptions(conditions, [{ ceilingFt: 600, visSm: 2 }, { ceilingFt: 800, visSm: 2 }]).belowLimits, false);
  assert.equal(checkOptions(conditions, { ceilingFt: 600, visSm: 2 }).belowLimits, false);
  assert.equal(checkOptions(conditions, null), null);
  assert.equal(visualDescentMinima({ meaFt: 5200 }), null);
});
