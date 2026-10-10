// Writes src/airfields/runway-ends.js: the best runway ends the shared runway list has, each runway tagged with its source (Dad, 10 Oct 2026,
// for the Debrief: "fix the runways so that [in the] KML viewer the planes land on it"; decision DB-26). airports-data.js lays these over
// OurAirports' ends; a runway not here stays OurAirports' (approximate). Run it again each CIFP cycle (28 days) and commit what it writes.
//
//   node tools/cifp-runways.mjs --cifp /path/outside/the/repo/FAACIFP18          parse, check and write the file, and print what it holds
//   node tools/cifp-runways.mjs --cifp /path/FAACIFP18 --dry                      the same, but print only
//
// Get the cycle's FAACIFP18 as tools/cifp-approaches.mjs says (keep it OUTSIDE the repo). Only the derived numbers go in the repo.
//
// Two sources, best first:
// 1. Moose Jaw (CYMJ): Patrick's measured points, the Traffic sim's (src/modules/traffic/airfield.js: THRESHOLD_29L, DEPARTURE_END_29L,
//    THRESHOLD_29R, DEPARTURE_END_29R, RUNWAY_03, RUNWAY_21 and RUNWAY_WIDTH_FT; measured on Esri's true-scale photo, about ±10 to 15 ft,
//    TR-67). Those are map feet from the field origin in src/modules/traffic/data/moose-jaw.json ("anchor", 50.3303 N 105.5592 W, the
//    ARP the Traffic sim's 3D uses too), turned into latitude and longitude here with core/geo.js localFtToLatLon (its flat-earth frame,
//    the one the Traffic sim draws them in). Check: Patrick's 29L number-base point (50.322977 N 105.547962 W) comes back from Traffic's
//    NUMBER_BASE_29L within about 6 ft. The numbers now live in two places (Traffic's map feet and these); Patrick merges them later
//    (docs/PLAN.md waiting list). The tool imports Traffic's file read-only and never writes it.
// 2. The US fields in the list: FAA CIFP runway records (section P, subsection G, ARINC 424-18): the landing threshold's surveyed position
//    (cols 33-51), its elevation (67-71), the displaced threshold (72-75), length (23-27), magnetic bearing (28-31, tenths) and width (78-80).
//    Each strip is drawn end to end, so a displaced threshold's pavement end is worked out by moving the landing threshold back along the
//    line between the two thresholds by the displaced distance (flat earth about the runway's middle, core/geo.js). Both ends must be
//    in the CIFP under the runway's own names; a runway whose names differ (renumbered since OurAirports' list) stays OurAirports' and is named.
// Headings stay OurAirports' listed true headings (the SOF's crosswind check reads them; changing them would change crosswind numbers).
import { readFileSync, writeFileSync } from 'node:fs';
import { col, trim, posOf, altOf, cycleOf } from './cifp-read.mjs';
import { makeLocalRef, latLonToLocalFt, localFtToLatLon } from '../src/core/geo.js';
import { OURAIRPORTS } from '../src/airfields/airports-data.js';
import {
  THRESHOLD_29L, DEPARTURE_END_29L, THRESHOLD_29R, DEPARTURE_END_29R, RUNWAY_03, RUNWAY_21, RUNWAY_WIDTH_FT, NUMBER_BASE_29L,
} from '../src/modules/traffic/airfield.js';

const OUT = 'src/airfields/runway-ends.js';
const TRAFFIC_FIELD = 'src/modules/traffic/data/moose-jaw.json';
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const CIFP_PATH = args[args.indexOf('--cifp') + 1];
if (!args.includes('--cifp') || !CIFP_PATH) {
  console.error('Usage: node tools/cifp-runways.mjs --cifp /path/outside/the/repo/FAACIFP18 [--dry]');
  process.exit(1);
}

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const ft = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---- 1. Moose Jaw: Patrick's points --------------------------------------------------------------------------------------------------------
const anchor = JSON.parse(readFileSync(TRAFFIC_FIELD, 'utf8')).anchor;
if (!(Number.isFinite(anchor?.lat) && Number.isFinite(anchor?.lon))) throw new Error(`No anchor in ${TRAFFIC_FIELD}`);
const cymjRef = makeLocalRef(anchor.lat, anchor.lon);
const ll = (p) => {
  const q = localFtToLatLon(cymjRef, p.x, p.y);
  return { lat: r6(q.lat), lon: r6(q.lon) };
};
const numberBase = localFtToLatLon(cymjRef, NUMBER_BASE_29L.x, NUMBER_BASE_29L.y);
const patrickPoint = { lat: 50.322977, lon: -105.547962 }; // Patrick, 5 Oct 00:35Z (Traffic airfield.js NUMBER_BASE_29L)
const check = latLonToLocalFt(cymjRef, patrickPoint.lat, patrickPoint.lon);
const numberBaseMissFt = ft(check, NUMBER_BASE_29L);
const cymj = {
  '03/21': { a: ll(RUNWAY_03), b: ll(RUNWAY_21), widthFt: RUNWAY_WIDTH_FT['03'] },
  '11L/29R': { a: ll(DEPARTURE_END_29R), b: ll(THRESHOLD_29R), widthFt: RUNWAY_WIDTH_FT['29R'] },
  '11R/29L': { a: ll(DEPARTURE_END_29L), b: ll(THRESHOLD_29L), widthFt: RUNWAY_WIDTH_FT['29L'] },
};

// ---- 2. The US fields: CIFP runway records ---------------------------------------------------------------------------------------------------
const lines = readFileSync(CIFP_PATH, 'latin1').split(/\r?\n/);
let cycle = null;
const pg = new Map(); // "KDLF|13C" -> record
for (const line of lines) {
  if (line.startsWith('HDR04')) {
    cycle = cycleOf(line) ?? cycle;
    continue;
  }
  if (line[0] !== 'S' || line[4] !== 'P' || line[12] !== 'G' || line.length < 100) continue;
  if (line[21] !== '0' && line[21] !== '1') continue; // primary records only
  const apt = trim(col(line, 7, 10));
  const id = trim(col(line, 14, 18));
  if (!/^RW\d{2}[LRC]?$/.test(id)) continue;
  const pos = posOf(line, 33, 7);
  const num = (s) => (/^\d+$/.test(trim(s)) ? Number(trim(s)) : null);
  if (!pos) continue;
  pg.set(`${apt}|${id.slice(2)}`, {
    lat: pos[0], lon: pos[1],
    elevationFt: altOf(col(line, 67, 71)),
    displacedFt: num(col(line, 72, 75)) ?? 0,
    lengthFt: num(col(line, 23, 27)),
    bearingMag: num(col(line, 28, 31)) === null ? null : num(col(line, 28, 31)) / 10,
    widthFt: num(col(line, 78, 80)),
  });
}
if (!cycle) throw new Error('No HDR04 cycle line: is this the FAACIFP18 file?');

const us = {};
const left = [];
const report = [];
for (const airport of OURAIRPORTS.filter((a) => a.icao.startsWith('K'))) {
  for (const runway of airport.runways) {
    const [na, nb] = runway.ends;
    const A = pg.get(`${airport.icao}|${na}`);
    const B = pg.get(`${airport.icao}|${nb}`);
    if (!A || !B) {
      left.push(`${airport.icao} ${na}/${nb} (CIFP has ${[...pg.keys()].filter((k) => k.startsWith(`${airport.icao}|`)).map((k) => k.split('|')[1]).join(' ')})`);
      continue;
    }
    const ref = makeLocalRef((A.lat + B.lat) / 2, (A.lon + B.lon) / 2);
    const pa = latLonToLocalFt(ref, A.lat, A.lon);
    const pb = latLonToLocalFt(ref, B.lat, B.lon);
    const d = ft(pa, pb);
    const u = { x: (pa.x - pb.x) / d, y: (pa.y - pb.y) / d }; // from end b's threshold towards end a's
    const endOf = (p, sign, disp) => localFtToLatLon(ref, p.x + sign * u.x * disp, p.y + sign * u.y * disp);
    const ea = endOf(pa, 1, A.displacedFt);
    const eb = endOf(pb, -1, B.displacedFt);
    const end = (rec, e) => ({
      lat: r6(e.lat), lon: r6(e.lon), elevationFt: rec.elevationFt, displacedFt: rec.displacedFt, bearingMag: rec.bearingMag,
      ...(rec.displacedFt > 0 ? { thresholdLat: r6(rec.lat), thresholdLon: r6(rec.lon) } : {}),
    });
    const lengthFt = A.lengthFt ?? B.lengthFt;
    us[airport.icao] ??= {};
    us[airport.icao][`${na}/${nb}`] = { a: end(A, ea), b: end(B, eb), lengthFt, widthFt: A.widthFt ?? B.widthFt };
    const drawn = d + A.displacedFt + B.displacedFt;
    const oa = latLonToLocalFt(ref, runway.a.lat, runway.a.lon);
    const ob = latLonToLocalFt(ref, runway.b.lat, runway.b.lon);
    const qa = latLonToLocalFt(ref, ea.lat, ea.lon);
    const qb = latLonToLocalFt(ref, eb.lat, eb.lon);
    report.push(`  ${airport.icao} ${na}/${nb}: end to end ${Math.round(drawn)} ft (CIFP length ${lengthFt}), displaced ${A.displacedFt}/${B.displacedFt} ft; OurAirports' ends were ${Math.round(ft(oa, qa))} and ${Math.round(ft(ob, qb))} ft away`);
  }
}

// ---- Write ---------------------------------------------------------------------------------------------------------------------------------
const json = (v) => JSON.stringify(v);
const text = `// Written by tools/cifp-runways.mjs: do not edit by hand (run the tool again). The shared runway list's best runway ends (DB-26), laid over
// OurAirports' by airports-data.js; a runway not here stays OurAirports' (approximate, for drawing only).
// - CYMJ: Patrick's measured points, the Traffic sim's (src/modules/traffic/airfield.js, TR-67: measured on Esri's true-scale photo, about
//   ±10 to 15 ft), turned from map feet into latitude and longitude about the field origin ${anchor.lat} N ${-anchor.lon} W
//   (${TRAFFIC_FIELD} "anchor") with core/geo.js localFtToLatLon. Patrick's own 29L number-base point comes back within ${Math.round(numberBaseMissFt)} ft.
//   The same numbers are in the Traffic sim's map feet: two places until Patrick merges them (docs/PLAN.md waiting list). No elevations.
// - US fields: FAA CIFP cycle ${cycle.cycle} (effective ${cycle.effective}), runway records (PG): each end's pavement end (a displaced landing
//   threshold moved back along the runway by its displaced distance, the landing threshold kept as thresholdLat/thresholdLon), the landing
//   threshold's elevation (ft), the displaced distance (ft) and the magnetic bearing; the runway's length and width (ft). WGS 84 degrees.
// For drawing only: never for planning or navigation.
export const RUNWAY_ENDS_SOURCES = Object.freeze({
  patrick: Object.freeze({ words: "Patrick's measured points (Traffic airfield.js, TR-67)", accuracyFt: 15 }),
  'faa-cifp': Object.freeze({ words: 'FAA CIFP cycle ${cycle.cycle} (surveyed thresholds)', cycle: '${cycle.cycle}', effective: '${cycle.effective}', accuracyFt: 3 }),
  ourairports: Object.freeze({ words: 'OurAirports (approximate)', accuracyFt: null }),
});
export const RUNWAY_ENDS = Object.freeze({
  CYMJ: Object.freeze({ source: 'patrick', runways: Object.freeze({
${Object.entries(cymj).map(([k, r]) => `    '${k}': ${json(r)},`).join('\n')}
  }) }),
${Object.entries(us).map(([icao, runways]) => `  ${icao}: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({\n${Object.entries(runways).map(([k, r]) => `    '${k}': ${json(r)},`).join('\n')}\n  }) }),`).join('\n')}
});
`;

console.log(`CYMJ from Patrick's points about ${anchor.lat}, ${anchor.lon}; number base back within ${numberBaseMissFt.toFixed(1)} ft (Traffic's ${numberBase.lat.toFixed(6)}, ${numberBase.lon.toFixed(6)}).`);
for (const [k, r] of Object.entries(cymj)) console.log(`  CYMJ ${k}: a ${r.a.lat}, ${r.a.lon}  b ${r.b.lat}, ${r.b.lon}  width ${r.widthFt} ft`);
console.log(report.join('\n'));
if (left.length) console.log(`Left as OurAirports (names not both in the CIFP):\n  ${left.join('\n  ')}`);
console.log(`CIFP cycle ${cycle.cycle}, effective ${cycle.effective}.`);
if (!DRY) {
  writeFileSync(OUT, text);
  console.log(`Wrote ${OUT}.`);
}
