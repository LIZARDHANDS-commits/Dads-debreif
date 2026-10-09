// Checks: at San Antonio (KSAT: runways 04/22, 13L/31R and 13R/31L) the runway in use follows the METAR wind and only the approaches to it are kept for
//   drawing and the corridor check: 140° 15 kt picks the 13s (13L and 13R together), 320° 12 kt the 31s, 220° 10 kt runway 22; a calm wind (00000KT) keeps
//   every runway end and says so; a runway chosen by hand (04) overrides the wind.
// Serves: Dad's ask of 8 Oct 2026 ("The runway in use should load the directional approaches. if possible based on winds etc"), SOF plan item "Approaches for
//   the runway in use", SOF-47 (Dad decides SOF calls).
// Expected values: the runway headings are OurAirports' true headings (airports-data.js: 04 041°, 22 221°, 13L and 13R 132°, 31L and 31R 312°); the
//   approaches are the FAA CIFP's, cycle 2610 (sites/approaches/kdlf.js, which holds Laughlin's alternates, KSAT among them). The headwind is standard
//   trigonometry, wind speed × cos(wind direction − runway heading), worked out here on its own. A METAR's wind is degrees true, so it is compared with the
//   true runway headings as they are, as crosswind.js does (no magnetic variation between two true bearings). Which runway is "in use" for each wind follows
//   from that: the end with the most headwind. The METARs are typed in the real METAR format; the winds are chosen for the test, not recorded. Not from V6 or
//   from the code's own output.
// Margins: ±1 kt on a headwind, tighter than the shared ±10 kt because a METAR gives the wind in whole knots and degrees and ±10 kt would not tell one runway
//   from another; that is the only rounding the check allows.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as KDLF_FILE from '../../../src/modules/sof/sites/approaches/kdlf.js';
import { readApproachFile, fieldApproaches } from '../../../src/modules/sof/approaches-model.js';
import { AIRPORTS } from '../../../src/modules/sof/airports-data.js';
import { runwayInUse, fieldsForRunways } from '../../../src/modules/sof/runway-in-use.js';
import { parseMetar } from '../../../src/wx/metar.js';

const NOW = new Date('2026-10-08T18:00:00Z');
const RUNWAY_TRUE_DEG = { '04': 41, 22: 221, '13L': 132, '13R': 132, '31L': 312, '31R': 312 }; // OurAirports (airports-data.js)
const headwind = (dirDeg, speedKt, rwy) => speedKt * Math.cos(((dirDeg - RUNWAY_TRUE_DEG[rwy]) * Math.PI) / 180);

const file = readApproachFile(KDLF_FILE);
const ksat = fieldApproaches({ icaos: ['KSAT'], file, airports: AIRPORTS });

/** What the view draws and checks at KSAT for one METAR (a fresh one, as the card's METAR line says), and the runway in use. */
function shownFor(raw, { manual = {} } = {}) {
  const wind = parseMetar(raw, { now: NOW }).conditions.wind;
  const runway = runwayInUse({ icao: 'KSAT', metar: { state: 'fresh' }, wind, airports: AIRPORTS });
  const [field] = fieldsForRunways({ fields: ksat, runways: new Map([['KSAT', runway]]), mode: 'wind', manual, airports: AIRPORTS });
  return { runway, field, runwaysDrawn: [...new Set(field.approaches.map((a) => a.rwy))].sort() };
}

test('the runway in use at San Antonio follows the wind, and only its approaches are drawn and checked; calm keeps all; a runway chosen by hand wins', () => {
  assert.ok(ksat[0]?.approaches.length >= 4, 'KSAT has its CIFP approaches to several runways');

  // 140° 15 kt: the 13s (13L and 13R are parallel, so both are in use); only the approaches to 13R (13L has none) are kept.
  const se = shownFor('METAR KSAT 081751Z 14015KT 10SM FEW250 29/14 A3001');
  assert.deepEqual([...se.runway.inUse].sort(), ['13L', '13R']);
  assert.ok(Math.abs(se.runway.headwinds[0].headwindKt - headwind(140, 15, '13R')) <= 1, `13 headwind ${se.runway.headwinds[0].headwindKt} kt`);
  assert.deepEqual(se.runwaysDrawn, ['13R']);
  assert.match(se.field.line, /^Runway in use 13 \(wind 140° true 15 kt: 15 kt headwind\) — .*ILS or LOC RWY 13R/);

  // 320° 12 kt: the 31s.
  const nw = shownFor('METAR KSAT 081751Z 32012KT 10SM CLR 24/08 A3010');
  assert.deepEqual([...nw.runway.inUse].sort(), ['31L', '31R']);
  assert.ok(Math.abs(nw.runway.headwinds[0].headwindKt - headwind(320, 12, '31L')) <= 1);
  assert.deepEqual(nw.runwaysDrawn, ['31L']);

  // 220° 10 kt: runway 22 alone (the 13s and 31s are nearly straight across, far under 22's headwind).
  const sw = shownFor('METAR KSAT 081751Z 22010KT 10SM SCT050 30/18 A2998');
  assert.deepEqual(sw.runway.inUse, ['22']);
  assert.ok(Math.abs(sw.runway.headwinds[0].headwindKt - headwind(220, 10, '22')) <= 1);
  assert.deepEqual(sw.runwaysDrawn, ['22']);

  // Calm: no runway is chosen; every end is kept and the words say why.
  const calm = shownFor('METAR KSAT 081751Z 00000KT 10SM CLR 20/10 A3005');
  assert.equal(calm.runway.byWind, false);
  assert.deepEqual([...calm.runway.inUse].sort(), ['04', '13L', '13R', '22', '31L', '31R']);
  assert.equal(calm.field.approaches.length, ksat[0].approaches.length);
  assert.match(calm.field.line, /wind calm: all runways shown/i);

  // A runway chosen by hand (04) overrides the wind's 13.
  const hand = shownFor('METAR KSAT 081751Z 14015KT 10SM FEW250 29/14 A3001', { manual: { KSAT: '04' } });
  assert.deepEqual(hand.runwaysDrawn, ['04']);
  assert.match(hand.field.line, /^Runway 04 \(chosen by hand/);
});
