// Checks: (a) Laughlin's approach file holds San Antonio's ILS or LOC RWY 13R (Laughlin's own approaches are not in the FAA CIFP: its procedures are the DoD's,
//   so KDLF gets only the estimate) with the final approach fix, glidepath angle and threshold crossing height of the CIFP records, and the coded numbers hang
//   together: flown down from the FAF's glide slope altitude at the coded angle, the path crosses the threshold at the coded TCH, and the final course lies along
//   the runway; (b) the arrival corridor check names a radar block 1 NM beside the final course before the FAF, and says nothing of one 10 NM away;
//   (c) a Canadian field (Moose Jaw) gets only each runway end's estimated centreline out to 10 NM and a 3° path to the threshold, nothing invented.
// Serves: Dad's ask of 8 Oct 2026 ("can you plot the approaches to these fields ... the IAFs IF FAFs a the loc/Glidepath ... so the SOF could see if the arrival
//   corridor is blocked"), SOF plan item "Instrument approaches drawn to the fields", SOF-47 (Dad decides SOF calls).
// Expected values: typed from the FAA CIFP itself, cycle 2610 (FAACIFP18, effective 1 Oct 2026, public domain): line 308787 (terminal waypoint ALAMO,
//   N29°35'21.03" W098°32'43.38"), line 309349 (KSAT I13R leg 020: ALAMO, waypoint description F = final approach fix, altitude H 2200 / 2200 = at or above
//   2,200 ft, glide slope 2,200 ft), line 309483 (runway RW13R threshold N29°32'33.89" W098°29'07.95", elevation 809 ft, TCH 58 ft) and line 309487 (localizer
//   IANT: glide slope 3.00°, TCH 58 ft). The runway's true heading, 132°, is OurAirports' (airports-data.js), a separate source. The glidepath check is standard
//   geometry: a 3° path drops tan 3° feet per foot flown. Moose Jaw's runways are airports-data.js's (OurAirports); 10 NM, 3° and 50 ft are the estimate
//   Dad's brief asked for (approaches-model.js ESTIMATE). Not from V6 or from the code's own output.
// Margins: ±100 ft (shared table) for the threshold crossing height; ±5° (shared table) for the final course against the runway heading; positions ±0.0001°
//   (about 11 m: the data file rounds to 5 decimals, 0.00001°); the glidepath angle ±0.01° and the estimate's 3° path ±0.05° and 10 NM ±0.1 NM, because they
//   are coded or set numbers and the margin covers only rounding and the flat map's projection over 10 NM.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as KDLF_FILE from '../../../src/modules/sof/sites/approaches/kdlf.js';
import { readApproachFile, fieldApproaches, approachGeometry, corridorCheck, finalOffsets } from '../../../src/modules/sof/approaches-model.js';
import { AIRPORTS } from '../../../src/modules/sof/airports-data.js';
import { createProjection } from '../../../src/modules/sof/map-view.js';
import { FT_PER_NM } from '../../../src/core/units.js';
import { compassDegFromVector, wrapDeg180 } from '../../../src/core/angles.js';

const dms = (deg, min, sec) => deg + min / 60 + sec / 3600;
const ALAMO = { lat: dms(29, 35, 21.03), lon: -dms(98, 32, 43.38) }; // CIFP line 308787
const THRESHOLD_13R = { lat: dms(29, 32, 33.89), lon: -dms(98, 29, 7.95), elevFt: 809, tchFt: 58 }; // CIFP line 309483
const FAF_GS_FT = 2200; // CIFP line 309349
const GS_DEG = 3.0; // CIFP line 309487
const RUNWAY_13R_TRUE_DEG = 132.0; // OurAirports (airports-data.js)

const file = readApproachFile(KDLF_FILE);
const fields = fieldApproaches({ icaos: ['KDLF', 'KSAT'], file, airports: AIRPORTS });
const ils13r = fields.find((f) => f.icao === 'KSAT').approaches.find((a) => a.kind === 'ils' && a.rwy === '13R');
const projection = createProjection({ lat: THRESHOLD_13R.lat, lon: THRESHOLD_13R.lon });

test('(a) the ILS or LOC RWY 13R at San Antonio has the CIFP FAF, glidepath and TCH, and they fit together; Laughlin itself has only the estimate', () => {
  assert.ok(ils13r, 'an ILS to runway 13R at KSAT');
  assert.match(ils13r.name, /^ILS or LOC RWY 13R$/);
  const faf = ils13r.final.find((l) => l.role === 'FAF');
  assert.equal(faf.fix, 'ALAMO');
  assert.ok(Math.abs(faf.lat - ALAMO.lat) <= 1e-4 && Math.abs(faf.lon - ALAMO.lon) <= 1e-4, 'ALAMO where the CIFP puts it');
  assert.deepEqual([faf.alt.how, faf.alt.ft, faf.gsFt], ['+', 2200, 2200], 'at or above 2,200 ft, glide slope 2,200 ft');
  assert.ok(Math.abs(ils13r.gpaDeg - GS_DEG) <= 0.01, 'glide slope 3.00°');
  assert.equal(ils13r.tchFt, THRESHOLD_13R.tchFt);
  assert.ok(Math.abs(ils13r.thr.lat - THRESHOLD_13R.lat) <= 1e-4 && Math.abs(ils13r.thr.lon - THRESHOLD_13R.lon) <= 1e-4);

  // Flown down from ALAMO at 2,200 ft on the 3° glide slope, the aircraft crosses the threshold at its 58 ft TCH.
  const g = approachGeometry(ils13r, projection.toXY);
  const alongFt = finalOffsets(g, g.faf).alongNm * FT_PER_NM;
  const crossingFt = FAF_GS_FT - alongFt * Math.tan((GS_DEG * Math.PI) / 180) - THRESHOLD_13R.elevFt;
  assert.ok(Math.abs(crossingFt - THRESHOLD_13R.tchFt) <= 100, `crosses the threshold at ${Math.round(crossingFt)} ft, TCH 58 ft`);
  // The drawn glidepath ends at the threshold's TCH, and the final course (FAF to threshold) lies along the runway.
  assert.ok(Math.abs(g.glidepath.to.ft - (THRESHOLD_13R.elevFt + THRESHOLD_13R.tchFt)) <= 100);
  const courseDeg = compassDegFromVector(g.threshold.x - g.faf.x, g.threshold.y - g.faf.y);
  assert.ok(Math.abs(wrapDeg180(courseDeg - RUNWAY_13R_TRUE_DEG)) <= 5, `final course ${courseDeg.toFixed(1)}° true, runway 132°`);

  // Laughlin: none in the CIFP, so only the estimate, and the note says why.
  const laughlin = fields.find((f) => f.icao === 'KDLF');
  assert.equal(laughlin.source, 'estimate');
  assert.match(laughlin.note, /not|DoD/);
  assert.ok(laughlin.approaches.every((a) => a.estimate));
});

test('(b) the corridor check names a radar block 1 NM beside the final course before the FAF, and ignores one 10 NM away', () => {
  // The final course alone (no transitions), so only the final approach's own corridor is tested.
  const g = approachGeometry({ ...ils13r, transitions: [] }, projection.toXY);
  const out = { x: Math.sin(((g.courseDeg + 180) * Math.PI) / 180), y: Math.cos(((g.courseDeg + 180) * Math.PI) / 180) };
  const right = { x: out.y, y: -out.x };
  const fafAlongFt = finalOffsets(g, g.faf).alongNm * FT_PER_NM;
  const at = (alongNm, offNm) => ({ x: g.threshold.x + out.x * (fafAlongFt + alongNm * FT_PER_NM) + right.x * offNm * FT_PER_NM, y: g.threshold.y + out.y * (fafAlongFt + alongNm * FT_PER_NM) + right.y * offNm * FT_PER_NM });
  const block = (p) => ({ x: p.x, y: p.y, wFt: 0.5 * FT_PER_NM, dFt: 0.5 * FT_PER_NM, baseFt: 3000, topFt: 9000, colour: [255, 230, 0] });
  const weather = (blocks) => ({ radar: { status: 'ok', blocks }, lightning: { status: 'none', why: 'no lightning picture at this base' }, alerts: { status: 'ok', volumes: [] } });

  const near = corridorCheck(g, weather([block(at(2, 1))]));
  assert.equal(near.hits.length, 1);
  assert.equal(near.hits[0].kind, 'radar');
  assert.match(near.words, /radar return \(yellow\) \d+ NM before the FAF, 3,000–9,000 ft/);
  assert.match(near.words, /lightning: can't tell/);

  const far = corridorCheck(g, weather([block(at(2, 10))]));
  assert.equal(far.hits.length, 0);
  assert.match(far.words, /clear of radar/);
});

test('(c) a Canadian field gets only the estimated centreline out to 10 NM and a 3° path to the threshold', () => {
  const [moosejaw] = fieldApproaches({ icaos: ['CYMJ'], file: null, airports: AIRPORTS });
  const airport = AIRPORTS.find((a) => a.icao === 'CYMJ');
  assert.equal(moosejaw.source, 'estimate');
  assert.equal(moosejaw.approaches.length, airport.runways.length * 2, 'one for each runway end');
  const here = createProjection({ lat: airport.runways[0].a.lat, lon: airport.runways[0].a.lon });
  for (const a of moosejaw.approaches) {
    assert.ok(a.estimate);
    assert.deepEqual([a.transitions.length, a.missed.length, a.loc, a.nav], [0, 0, null, null], 'no transitions, missed approach, localizer or navaid');
    const g = approachGeometry(a, here.toXY);
    assert.deepEqual(g.fixes, [], 'no fixes');
    assert.equal(g.glidepath, null, 'the 3° path is the path itself');
    assert.equal(g.paths.length, 1);
    const [far, thr] = g.paths[0].points;
    const lengthNm = Math.hypot(thr.x - far.x, thr.y - far.y) / FT_PER_NM;
    assert.ok(Math.abs(lengthNm - 10) <= 0.1, `centreline ${lengthNm.toFixed(2)} NM`);
    const angleDeg = (Math.atan((far.ft - thr.ft) / (lengthNm * FT_PER_NM)) * 180) / Math.PI;
    assert.ok(Math.abs(angleDeg - 3) <= 0.05, `path ${angleDeg.toFixed(2)}°`);
    const side = airport.runways.flatMap((r) => [[r.ends[0], r.a], [r.ends[1], r.b]]).find(([end]) => `RWY ${end} (estimate)` === a.name)[1];
    assert.ok(Math.abs(thr.ft - (side.elevationFt + 50)) <= 100, 'crosses its threshold about 50 ft up');
    assert.ok(Math.abs(wrapDeg180(compassDegFromVector(thr.x - far.x, thr.y - far.y) - side.headingTrue)) <= 5, 'along the runway');
    assert.ok(g.centreline, 'its centreline on the ground');
  }
});
