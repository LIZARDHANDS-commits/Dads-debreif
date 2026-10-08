// Checks: at a USAF base the SOF's wave calls follow AFMAN 11-202V3 4.16 (plan Step 2c part F): home needs an alternate when the forecast at ETA ± 1 h,
//   TEMPO included, is below 2,000 ft or 3 SM, and a TEMPO outside that window doesn't count; an alternate with an ILS needs the higher of 1,000 ft / 2 SM
//   and its approach minima + 500 ft / + 1 SM, with thunderstorm and shower TEMPOs left out; a GNSS-only alternate is not suitable for the T-6A; Moose Jaw
//   still calls its own Gen Book trigger.
// Serves: plan Step 2c part F; SOF-47 (Dad decides SOF calls); SOF-32 (never a tick for what can't be checked).
// Expected values, hand-worked:
//   - AFMAN 11-202V3 4.16.2.1 (docs/references/afman11-202v3-alternates.md, from the paragraphs Dad gave 7 Oct 2026): alternate required below a 2,000 ft
//     ceiling or 3 SM, worst weather at ETA ± 1 h, TEMPO included. Wave lands 1600Z, so the window is 1500Z to 1700Z: a TEMPO 15–17Z BKN015 (1,500 ft)
//     is inside it; the same TEMPO at 18–20Z is not.
//   - AFMAN 11-202V3 4.16.4 and 4.16.4.1: alternate minima are the higher of 1,000 ft and lowest approach HAT + 500 ft, and of 2 SM and its visibility
//     + 1 SM. ILS HAT 200 ft, 1/2 SM: 700 ft and 1.5 SM, so 1,000 ft and 2 SM. BKN012 6SM meets; BKN009 doesn't; a TEMPO TSRA BKN006 is a thunderstorm
//     TEMPO, left out by 4.16.4.1.
//   - AFMAN 11-202V3 4.17.3 with Dad's ruling (8 Oct 2026, the T-6A can't rely on GPS): an alternate with only an RNAV (GPS) approach is not suitable.
//   - Moose Jaw: Gen Book p.7 local (MTCA) trigger, alternate needed below 2,000 ft or 3 SM from takeoff to landing + 1 h (SOF-34); a TEMPO BKN015 in
//     the wave needs one.
//   No value is taken from the code's output.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAirfields } from '../../../src/airfields/airfields.js';
import { parseTaf } from '../../../src/wx/taf.js';
import { buildWaves } from '../../../src/modules/sof/waves-view-model.js';

const NOW = new Date('2026-10-08T12:00:00Z');

/** A storage scope kept in memory. */
function memoryStore() {
  const kept = new Map();
  return { persistent: false, get: (key, fallback) => (kept.has(key) ? structuredClone(kept.get(key)) : fallback), set: (key, value) => kept.set(key, structuredClone(value)) };
}

/** The one wave's calls for a home field, its alternates (with what was entered for them in Settings → Airfields) and TAFs. */
function waveAt(home, alternates, fields, tafs, { takeoff, land }) {
  const airfields = createAirfields({ store: memoryStore() });
  airfields.update({ home, alternates, fields });
  const parsed = Object.fromEntries(Object.entries(tafs).map(([icao, raw]) => [icao, parseTaf(raw, { now: NOW })]));
  const plan = { day: 'today', waves: [{ id: 'w1', name: 'W1', takeoff, land }] };
  const view = buildWaves({ plan, airfields, tafs: parsed, limits: { ceilingFt: 2000, visSm: 3 }, now: NOW, timeZone: airfields.home().timeZone });
  return { chip: view.rows[0].chip, call: view.calls[0], wave: view.waves[0] };
}

// Laughlin is on Central time (CDT, UTC−5, on 8 Oct 2026): 09:30–11:00 local is 1430Z–1600Z, so the ETA is 1600Z.
const LAUGHLIN_WAVE = { takeoff: '09:30', land: '11:00' };
const KSAT_ILS = { KSAT: { approach: 'one-precision', lowestHatFt: 200, lowestVisSm: 0.5 } };
const KSAT_GOOD = 'TAF KSAT 081120Z 0812/0912 18010KT P6SM BKN012';

test('Laughlin needs an alternate for a TEMPO below 2,000 ft inside ETA ± 1 h, naming it, and not for the same TEMPO outside it (AFMAN 4.16.2.1)', () => {
  const inside = waveAt('KDLF', ['KSAT'], KSAT_ILS, {
    KDLF: 'TAF KDLF 081120Z 0812/0912 16010KT P6SM SCT035 BKN250 TEMPO 0815/0817 BKN015',
    KSAT: KSAT_GOOD,
  }, LAUGHLIN_WAVE);
  assert.equal(inside.wave.land.toISOString(), '2026-10-08T16:00:00.000Z', 'landing 11:00 CDT is 1600Z');
  assert.match(inside.chip.words, /ALTERNATE REQUIRED/);
  assert.match(inside.chip.reason, /TEMPO/, 'the chip names the TAF group');
  assert.match(inside.chip.reason, /1500/, 'and the ceiling that is below');
  assert.match(inside.chip.limits, /AFMAN/, 'the call says which rule it used');

  const outside = waveAt('KDLF', ['KSAT'], KSAT_ILS, {
    KDLF: 'TAF KDLF 081120Z 0812/0912 16010KT P6SM SCT035 BKN250 TEMPO 0818/0820 BKN015',
    KSAT: KSAT_GOOD,
  }, LAUGHLIN_WAVE);
  assert.doesNotMatch(outside.chip.words, /ALTERNATE REQUIRED/, 'a TEMPO from 1800Z is outside 1500Z–1700Z');
});

test('an ILS alternate needs 1,000 ft and 2 SM (the floor wins over 700 ft and 1½ SM); a thunderstorm TEMPO is left out (AFMAN 4.16.4.1)', () => {
  const alternateAt = (ksatTaf) => waveAt('KDLF', ['KSAT'], KSAT_ILS, { KDLF: 'TAF KDLF 081120Z 0812/0912 16010KT P6SM SCT035', KSAT: ksatTaf }, LAUGHLIN_WAVE)
    .call.alternates.find((a) => a.icao === 'KSAT');

  const meets = alternateAt(KSAT_GOOD);
  assert.equal(meets.status, 'meets', 'BKN012 and 6 SM or more is at or above 1,000 ft and 2 SM');
  assert.match(meets.minimaText, /1000-2/);

  assert.equal(alternateAt('TAF KSAT 081120Z 0812/0912 18010KT P6SM BKN009').status, 'below', 'BKN009 is under 1,000 ft');

  const storm = alternateAt('TAF KSAT 081120Z 0812/0912 18010KT P6SM BKN012 TEMPO 0815/0817 3SM TSRA BKN006CB');
  assert.equal(storm.status, 'meets', 'the TEMPO TSRA BKN006 is a thunderstorm TEMPO and does not count');
});

test('an alternate with only an RNAV (GPS) approach is not suitable for the T-6A (AFMAN 4.17.3, Dad 8 Oct 2026)', () => {
  const { call } = waveAt('KDLF', ['KSAT'], { KSAT: { approach: 'gnss-only', lowestHatFt: 250, lowestVisSm: 1 } }, {
    KDLF: 'TAF KDLF 081120Z 0812/0912 16010KT P6SM SCT035',
    KSAT: KSAT_GOOD,
  }, LAUGHLIN_WAVE);
  const ksat = call.alternates.find((a) => a.icao === 'KSAT');
  assert.match(ksat.words, /Not suitable: needs a non-GPS approach/);
  assert.equal(call.meeting, 0, 'it is never counted as an alternate that meets');
});

test('Moose Jaw still calls its Gen Book trigger: a TEMPO BKN015 in the wave needs an alternate', () => {
  // Moose Jaw keeps CST (UTC−6) all year: 09:00–10:30 local is 1500Z–1630Z.
  const { chip } = waveAt('CYMJ', ['CYQR'], {}, {
    CYMJ: 'TAF CYMJ 081140Z 0812/0912 27010KT P6SM SCT040 TEMPO 0815/0817 BKN015',
  }, { takeoff: '09:00', land: '10:30' });
  assert.match(chip.words, /ALTERNATE REQUIRED/);
  assert.match(chip.reason, /TEMPO/);
  assert.match(chip.limits, /Local \(MTCA\) 2000\/3/, 'Moose Jaw names its own trigger, not the AFMAN');
});
