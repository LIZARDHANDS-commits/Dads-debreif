// Makes the US bases' instrument approach files for the SOF (plan item "Instrument approaches drawn to the fields"; Dad, 8 Oct 2026):
// src/modules/sof/sites/approaches/<base>.js, one per US base, holding that base's and its usual alternates' approaches, from the FAA's Coded
// Instrument Flight Procedures (CIFP, ARINC 424-18, public domain, a new cycle every 28 days). Run it again each cycle and commit what it writes.
//
// Get the cycle's zip from https://aeronav.faa.gov/ (Digital Products → CIFP; cycle 2610 was Upload_313-d/cifp/CIFP_261001.zip), keep it OUTSIDE the
// repo, take the one file FAACIFP18 out of it, and from the repo root:
//   node tools/cifp-approaches.mjs --cifp /path/outside/the/repo/FAACIFP18           parse, check and write the files, and print what each holds
//   node tools/cifp-approaches.mjs --cifp /path/FAACIFP18 --dry                     the same, but print only
// The raw CIFP file never goes in the repo; only the trimmed output does. The file is read as untrusted text: every field is checked (positions in
// range, numbers numeric), and a leg or approach that does not read is left out and named in the printout.
//
// Records used (ARINC 424-18 column positions, 1-based, as in the FAA's FAACIFP18):
// - HDR04: the cycle ("VOLUME 2610 EFFECTIVE 01 OCT 2026").
// - P A (airport reference point): magnetic variation (cols 52-56) and elevation (57-61), for the holds' courses.
// - P F (airport approach procedures): the legs. Approach id (14-19), route type (20: A = transition, Z = missed, else the final approach route),
//   transition (21-25), sequence (27-29), fix (30-34) with its region (35-36) and section (37-38), continuation (39: only primary records, 0 or 1, are
//   read; the other records' continuation number is col 22), waypoint description (40-43: col 42 'M' first missed approach leg; col 43 A/C/D IAF, B IF, I final approach course fix, F FAF, M MAP),
//   turn direction (44), path terminator (48-49), recommended navaid (51-54, its section 79-80), arc radius (57-62, thousandths of a NM: RF), theta
//   (63-66) and rho (67-70, tenths of a NM: an AF arc's radius), course (71-74, tenths of a degree, magnetic unless it ends in T), distance or time
//   (75-78: a hold's leg, T010 = 1.0 minute), altitude description (83) and altitudes (85-89, 90-94), vertical angle (103-106, hundredths of a degree),
//   centre fix (107-111, region 113-114, section 115-116: an RF arc's centre).
// - Fix positions from: P C terminal waypoints (lat 33-41, lon 42-51), E A enroute waypoints, D VHF navaids (VOR position 33-51, or the DME's 56-74
//   when there is no VOR), D B enroute and P N terminal NDBs, P G runways (threshold 33-51, threshold elevation 67-71, threshold crossing height
//   76-77) and P I localizers (antenna 33-51, course 52-55 magnetic, glide slope angle 88-90, station declination 91-95, TCH 96-97).
//
// Kept per approach (the shape is written at the top of src/modules/sof/approaches-model.js, which reads it): id and plain name, kind, runway, whether
// it is GPS-based, the runway threshold and TCH, the glidepath angle, the localizer (antenna and true course), the final approach navaid, each
// transition's legs, the final legs and the missed approach legs; per leg its fix and position, role, path terminator, altitude constraint, and an
// arc's centre and radius or a hold's course and leg. An ILS and a LOC to the same runway (same letter) are one approach, "ILS or LOC RWY 13R",
// drawn from the ILS's legs. Positions are rounded to 5 decimals (about a metre). For a picture: never for navigation.
//
// The fields: each US base with a site profile (sites/index.js PROFILES whose ICAO starts with K) and its usual alternates. A field with no approach
// in the CIFP (the military fields: their procedures are the DoD's, not coded in the FAA's CIFP) is written with no approaches and a note saying so.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { PROFILES } from '../src/modules/sof/sites/index.js';
// The ARINC 424 field readers are shared with tools/cifp-runways.mjs (tools/cifp-read.mjs).
import { col, trim, round, latOf, lonOf, posOf, varOf, altOf, courseOf, wrap360, cycleOf } from './cifp-read.mjs';

const OUT_DIR = 'src/modules/sof/sites/approaches';
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const CIFP_PATH = args[args.indexOf('--cifp') + 1];
if (!args.includes('--cifp') || !CIFP_PATH) {
  console.error('Usage: node tools/cifp-approaches.mjs --cifp /path/outside/the/repo/FAACIFP18 [--dry]');
  process.exit(1);
}

// ---- Pass 1: every fix the legs can name --------------------------------------------------------------------------------------------
const text = readFileSync(CIFP_PATH, 'latin1');
const lines = text.split(/\r?\n/);
let cycle = null;
let effective = null;
const fixes = new Map(); // "SECTION|key" -> [lat, lon]
const navaids = new Map(); // "ident|region" -> { pos, decl }
const airports = new Map(); // icao -> { pos, varE, elevFt }
const runways = new Map(); // "icao|RW13R" -> { pos, elevFt, tch }
const locs = new Map(); // "icao|IANT" -> { pos, crsMag, decl, gsAngle, tch }
const lineNo = new Map(); // a record's key -> its line number in the file, for the test's citations

lines.forEach((line, i) => {
  if (line.startsWith('HDR04')) {
    const found = cycleOf(line);
    if (found) ({ cycle, effective } = found);
    return;
  }
  if (line[0] !== 'S' || line.length < 100) return;
  const section = line[4];
  const cont = line[21]; // the continuation number of the fix, runway, localizer, navaid and airport records (a procedure leg's is col 39)
  if (section === 'P') {
    const apt = trim(col(line, 7, 10));
    const sub = line[12];
    if (sub === 'F') return;
    const id = trim(col(line, 14, 18));
    if (cont !== '0' && cont !== '1' && sub !== 'A') return; // the airport record's col 22 is not a continuation number
    if (sub === 'A') airports.set(apt, { pos: posOf(line, 33), varE: varOf(col(line, 52, 56)), elevFt: altOf(col(line, 57, 61)) });
    else if (sub === 'C') {
      const region = col(line, 20, 21);
      const pos = posOf(line, 33);
      if (pos) {
        fixes.set(`PC|${apt}|${id}`, pos);
        if (!fixes.has(`PC|*|${id}|${region}`)) fixes.set(`PC|*|${id}|${region}`, pos);
      }
    } else if (sub === 'G') {
      const pos = posOf(line, 33);
      if (pos) {
        runways.set(`${apt}|${id}`, { pos, elevFt: altOf(col(line, 67, 71)), tch: altOf(col(line, 76, 77)) });
        fixes.set(`PG|${apt}|${id}`, pos);
        lineNo.set(`PG|${apt}|${id}`, i + 1);
      }
    } else if (sub === 'I') {
      const ident = trim(col(line, 14, 17));
      const pos = posOf(line, 33);
      const crs = courseOf(col(line, 52, 55));
      const gs = trim(col(line, 88, 90));
      if (pos) {
        locs.set(`${apt}|${ident}`, { pos, crsMag: crs?.deg ?? null, crsIsTrue: crs?.isTrue ?? false, decl: varOf(col(line, 91, 95)), gsAngle: /^\d{3}$/.test(gs) ? Number(gs) / 100 : null, tch: altOf(col(line, 96, 97)) });
        fixes.set(`PI|${apt}|${ident}`, pos);
        lineNo.set(`PI|${apt}|${ident}`, i + 1);
      }
    } else if (sub === 'N') {
      const ident = trim(col(line, 14, 17));
      const pos = posOf(line, 33);
      if (pos) {
        fixes.set(`PN|${ident}|${col(line, 20, 21)}`, pos);
        navaids.set(`${ident}|${col(line, 20, 21)}`, { pos, decl: null, kind: 'NDB' });
      }
    }
    return;
  }
  if (section === 'E' && line[5] === 'A') {
    if (cont !== '0' && cont !== '1') return;
    const pos = posOf(line, 33);
    if (pos) fixes.set(`EA|${trim(col(line, 14, 18))}|${col(line, 20, 21)}`, pos);
    return;
  }
  if (section === 'D') {
    if (cont !== '0' && cont !== '1') return;
    const ident = trim(col(line, 14, 17));
    const region = col(line, 20, 21);
    const pos = posOf(line, 33) ?? posOf(line, 56); // a TACAN or DME alone has only the DME's position
    if (!pos) return;
    const sub = line[5] === 'B' ? 'DB' : 'D';
    fixes.set(`${sub}|${ident}|${region}`, pos);
    const kind = sub === 'DB' ? 'NDB' : /^T/.test(col(line, 28, 28)) || trim(col(line, 33, 41)) === '' ? 'TACAN' : 'VOR';
    navaids.set(`${ident}|${region}`, { pos, decl: sub === 'D' ? varOf(col(line, 75, 79)) : null, kind });
  }
});
if (!cycle) throw new Error('No HDR04 cycle line: is this the FAACIFP18 file?');

// ---- Pass 2: the approach legs of the wanted fields ---------------------------------------------------------------------------------
const bases = PROFILES.filter((p) => p.icao.startsWith('K'));
const wanted = new Set(bases.flatMap((p) => [p.icao, ...p.usualAlternates]));
const procs = new Map(); // "icao|id" -> [{ line, n }]
lines.forEach((line, i) => {
  if (line[0] !== 'S' || line[4] !== 'P' || line[12] !== 'F') return;
  const apt = trim(col(line, 7, 10));
  if (!wanted.has(apt)) return;
  const cont = line[38];
  if (cont !== '0' && cont !== '1') return; // continuation records have another layout
  const id = trim(col(line, 14, 19));
  const key = `${apt}|${id}`;
  if (!procs.has(key)) procs.set(key, []);
  procs.get(key).push({ line, n: i + 1 });
});

const problems = [];

/** Where a fix named in a leg is: [lat, lon] or null. */
function fixPos(apt, ident, region, sect) {
  if (!ident) return null;
  switch (sect) {
    case 'PC': return fixes.get(`PC|${apt}|${ident}`) ?? fixes.get(`PC|*|${ident}|${region}`) ?? null;
    case 'EA': return fixes.get(`EA|${ident}|${region}`) ?? null;
    case 'D ': return fixes.get(`D|${ident}|${region}`) ?? null;
    case 'DB': return fixes.get(`DB|${ident}|${region}`) ?? null;
    case 'PN': return fixes.get(`PN|${ident}|${region}`) ?? null;
    case 'PG': return fixes.get(`PG|${apt}|${ident}`) ?? null;
    case 'PI': return fixes.get(`PI|${apt}|${ident}`) ?? null;
    case 'PA': return airports.get(ident)?.pos ?? null;
    default: return null;
  }
}

const ROLE = { A: 'IAF', C: 'IAF', D: 'IAF', B: 'IF', I: 'IF', F: 'FAF', M: 'MAP' };
/** ARINC altitude description → [d, alt1, alt2, glide slope ft]: d '@' at, '+' at or above, '-' at or below, 'B' between alt1 (top) and alt2 (bottom). */
function altitudeOf(line) {
  const d = line[82];
  const a1 = altOf(col(line, 85, 89));
  const a2 = altOf(col(line, 90, 94));
  if (a1 === null && a2 === null) return null;
  switch (d) {
    case ' ': case '@': case 'X': return a1 === null ? null : ['@', a1];
    case '+': case 'V': return a1 === null ? null : ['+', a1];
    case '-': case 'Y': return a1 === null ? null : ['-', a1];
    case 'B': return a1 !== null && a2 !== null ? ['B', Math.max(a1, a2), Math.min(a1, a2)] : null;
    case 'C': return a2 === null ? null : ['+', a2];
    case 'G': case 'I': return a1 === null ? null : ['@', a1, null, a2];
    case 'H': case 'J': return a1 === null ? null : ['+', a1, null, a2];
    default:
      problems.push(`altitude description "${d}" not read`);
      return null;
  }
}

/** One leg: [fix, lat, lon, role, path terminator, altitude or null, extra or null]. */
function legOf(apt, line, n, varE, inMissed) {
  const ident = trim(col(line, 30, 34));
  const region = col(line, 35, 36);
  const sect = col(line, 37, 38);
  const pos = fixPos(apt, ident, region, sect);
  if (ident && !pos) problems.push(`${apt} line ${n}: fix ${ident} (${sect}) not found`);
  const pt = col(line, 48, 49);
  const desc4 = line[42];
  let role = ROLE[desc4] ?? '';
  const turn = line[43] === 'L' || line[43] === 'R' ? line[43] : null;
  const extra = {};
  const alt = altitudeOf(line);
  if (alt?.[3] != null) extra.gs = alt[3];
  if (pt === 'AF') {
    const nav = navaids.get(`${trim(col(line, 51, 54))}|${col(line, 55, 56)}`);
    const rho = Number(col(line, 67, 70));
    if (nav && rho > 0 && turn) extra.arc = [nav.pos[0], nav.pos[1], rho / 10, turn];
    else problems.push(`${apt} line ${n}: DME arc without centre, radius or turn`);
  } else if (pt === 'RF') {
    const centre = fixPos(apt, trim(col(line, 107, 111)), col(line, 113, 114), col(line, 115, 116));
    const r = Number(col(line, 57, 62)) / 1000;
    if (centre && r > 0 && turn) extra.arc = [centre[0], centre[1], round(r, 3), turn];
    else problems.push(`${apt} line ${n}: RF arc without centre, radius or turn`);
  } else if (pt === 'HM' || pt === 'HA' || pt === 'HF') {
    const crs = courseOf(col(line, 71, 74));
    const legRaw = trim(col(line, 75, 78));
    const legWords = /^T\d{3}$/.test(legRaw) ? `T${Number(legRaw.slice(1)) / 10}` : /^\d{4}$/.test(legRaw) ? String(Number(legRaw) / 10) : 'T1';
    if (crs) extra.hold = [round(wrap360(crs.isTrue ? crs.deg : crs.deg + (varE ?? 0)), 1), legWords, turn ?? 'R'];
    if (inMissed) role = 'MAHF';
  }
  const leg = [ident || '', pos?.[0] ?? null, pos?.[1] ?? null, role, pt, alt ? alt.slice(0, alt[0] === 'B' ? 3 : 2) : null, Object.keys(extra).length ? extra : null];
  return leg;
}

const KINDS = {
  I: ['ils', 'ILS', false], L: ['loc', 'LOC', false], B: ['locbc', 'LOC BC', false], X: ['lda', 'LDA', false], U: ['sdf', 'SDF', false],
  V: ['vor', 'VOR', false], S: ['vor', 'VOR/DME', false], D: ['vor', 'VOR/DME', false], T: ['tacan', 'TACAN', false],
  N: ['ndb', 'NDB', false], Q: ['ndb', 'NDB/DME', false],
  R: ['rnav', 'RNAV (GPS)', true], H: ['rnav', 'RNAV (RNP)', true], P: ['rnav', 'GPS', true], J: ['rnav', 'GLS', true],
};

/** The approach id ("I13R", "R13RY", "H04-Z", "VOR-A", "S03-Y") in parts: { kind, kindWords, gps, rwy (null when circling), letter, name }. */
function nameOf(id) {
  const k = KINDS[id[0]];
  if (!k) return null;
  const m = /^[A-Z](\d{2})([LRC-]?)([A-Z])?$/.exec(id);
  if (m) {
    const rwy = `${m[1]}${m[2] === '-' ? '' : m[2]}`;
    const letter = m[3] ?? '';
    return { kind: k[0], kindWords: k[1], gps: k[2], rwy, letter, name: `${k[1]}${letter ? ` ${letter}` : ''} RWY ${rwy}` };
  }
  const circle = /^([A-Z]{3})-([A-Z])$/.exec(id); // "VOR-A", "VDM-A", "NDB-B": circling only
  if (circle) {
    const words = { VOR: 'VOR', VDM: 'VOR/DME', NDB: 'NDB', LOC: 'LOC', TAC: 'TACAN', RNV: 'RNAV (GPS)', GPS: 'GPS', LDA: 'LDA', NDM: 'NDB/DME' }[circle[1]] ?? k[1];
    return { kind: k[0], kindWords: words, gps: k[2], rwy: null, letter: circle[2], name: `${words}-${circle[2]}` };
  }
  return null;
}

function approachOf(apt, id, records, varE) {
  const named = nameOf(id);
  if (!named) {
    problems.push(`${apt} ${id}: approach id not read`);
    return null;
  }
  const routes = new Map();
  for (const r of records) {
    const type = r.line[19];
    const trans = trim(col(r.line, 21, 25));
    const key = type === 'A' ? `A|${trans}` : type === 'Z' ? 'Z' : `F|${type}`;
    if (!routes.has(key)) routes.set(key, []);
    routes.get(key).push(r);
  }
  for (const list of routes.values()) list.sort((a, b) => Number(col(a.line, 27, 29)) - Number(col(b.line, 27, 29)));
  const finals = [...routes.keys()].filter((k) => k.startsWith('F|'));
  const finalKey = finals.find((k) => k === `F|${id[0]}`) ?? finals[0];
  if (!finalKey) {
    problems.push(`${apt} ${id}: no final approach route`);
    return null;
  }
  const fin = [];
  const ma = [];
  let missed = false;
  let vAngle = null;
  let navKey = null;
  for (const r of routes.get(finalKey)) {
    if (r.line[41] === 'M') missed = true; // col 42 'M': the first leg of the missed approach
    const leg = legOf(apt, r.line, r.n, varE, missed);
    const va = trim(col(r.line, 103, 106));
    if (/^-\d{3}$/.test(va)) vAngle = Number(va.slice(1)) / 100;
    const rec = trim(col(r.line, 51, 54));
    if (!missed && rec && col(r.line, 79, 80) !== 'PI' && !navKey) navKey = `${rec}|${col(r.line, 55, 56)}`;
    (missed ? ma : fin).push(leg);
    if (leg[3] === 'MAP') missed = true;
  }
  if (routes.has('Z')) for (const r of routes.get('Z')) ma.push(legOf(apt, r.line, r.n, varE, true));
  const tr = [...routes.keys()].filter((k) => k.startsWith('A|')).map((k) => [k.slice(2), routes.get(k).map((r) => legOf(apt, r.line, r.n, varE, false))]);

  // The runway threshold, its TCH and the glidepath; the localizer (an ILS, LOC, LDA, SDF or back course).
  const rwy = named.rwy ? runways.get(`${apt}|RW${named.rwy}`) ?? null : null;
  let loc = null;
  let gpa = vAngle;
  let tch = rwy?.tch ?? null;
  const locIdent = records.map((r) => (col(r.line, 79, 80) === 'PI' ? trim(col(r.line, 51, 54)) : '')).find(Boolean);
  const locRec = locIdent ? locs.get(`${apt}|${locIdent}`) : null;
  if (locRec && ['ils', 'loc', 'locbc', 'lda', 'sdf'].includes(named.kind)) {
    const decl = locRec.decl ?? varE ?? 0;
    const crsTrue = locRec.crsMag === null ? null : round(wrap360(locRec.crsIsTrue ? locRec.crsMag : locRec.crsMag + decl), 1);
    // A back course is flown the other way from the front course the record gives.
    loc = [locIdent, locRec.pos[0], locRec.pos[1], named.kind === 'locbc' && crsTrue !== null ? round(wrap360(crsTrue + 180), 1) : crsTrue];
    if (named.kind === 'ils') {
      if (locRec.gsAngle) gpa = locRec.gsAngle;
      if (locRec.tch) tch = locRec.tch;
    }
  }
  const nav = navKey ? navaids.get(navKey) : null;
  const out = {
    id, name: named.name, kind: named.kind, rwy: named.rwy, gps: named.gps,
    thr: rwy ? [rwy.pos[0], rwy.pos[1], rwy.elevFt] : null,
    tch, gpa, loc,
    nav: nav && ['vor', 'tacan', 'ndb'].includes(named.kind) ? [navKey.split('|')[0], nav.pos[0], nav.pos[1], nav.kind] : null,
    tr, fin, ma,
    src: { first: records[0].n, last: records.at(-1).n, ...(rwy ? { rwy: lineNo.get(`PG|${apt}|RW${named.rwy}`) } : {}), ...(locIdent ? { loc: lineNo.get(`PI|${apt}|${locIdent}`) } : {}) },
  };
  return out;
}

function fieldOf(icao) {
  const apt = airports.get(icao) ?? null;
  const list = [...procs.keys()].filter((k) => k.startsWith(`${icao}|`)).map((k) => k.split('|')[1]).sort();
  const approaches = list.map((id) => approachOf(icao, id, procs.get(`${icao}|${id}`), apt?.varE ?? null)).filter(Boolean);
  // An ILS and a LOC to the same runway with the same letter are one chart: "ILS or LOC RWY 13R", drawn from the ILS's legs.
  const merged = [];
  for (const a of approaches) {
    if (a.kind === 'loc') {
      const ils = approaches.find((b) => b.kind === 'ils' && b.rwy === a.rwy && b.id.slice(1) === a.id.slice(1));
      if (ils) continue;
    }
    if (a.kind === 'ils') {
      const twin = approaches.find((b) => b.kind === 'loc' && b.rwy === a.rwy && b.id.slice(1) === a.id.slice(1));
      if (twin) {
        a.name = a.name.replace(/^ILS/, 'ILS or LOC');
        a.also = twin.id;
      }
    }
    merged.push(a);
  }
  return {
    icao,
    varE: apt?.varE ?? null,
    elevFt: apt?.elevFt ?? null,
    approaches: merged,
    ...(merged.length ? {} : { note: `No instrument approaches for ${icao} in the FAA CIFP (cycle ${cycle}): the CIFP holds the FAA's own procedures, and a military field's are the DoD's` }),
  };
}

// ---- Writing ------------------------------------------------------------------------------------------------------------------------
const SOURCE = `FAA CIFP cycle ${cycle} (effective ${Number(effective.slice(8))} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(effective.slice(5, 7)) - 1]} ${effective.slice(0, 4)}), public domain`;
if (!DRY) mkdirSync(OUT_DIR, { recursive: true });
const cache = new Map();
for (const base of bases) {
  const fields = [base.icao, ...base.usualAlternates].map((icao) => {
    if (!cache.has(icao)) cache.set(icao, fieldOf(icao));
    return cache.get(icao);
  });
  const body = [
    `// ${base.icao}'s and its usual alternates' instrument approaches for the SOF: GENERATED by tools/cifp-approaches.mjs (do not edit by hand; run it again each`,
    '// 28-day CIFP cycle). From the FAA\'s Coded Instrument Flight Procedures (ARINC 424-18, public domain). The shape is written at the top of',
    '// approaches-model.js. For a picture of where the arrivals run, never for navigation: no minima are coded in the CIFP.',
    `export const SOURCE = ${JSON.stringify(SOURCE)};`,
    `export const CYCLE = Object.freeze({ id: ${JSON.stringify(cycle)}, effective: ${JSON.stringify(effective)} });`,
    'export const FIELDS = [',
    ...fields.map((f) => [
      `  { icao: ${JSON.stringify(f.icao)}, varE: ${JSON.stringify(f.varE)}, elevFt: ${JSON.stringify(f.elevFt)},${f.note ? ` note: ${JSON.stringify(f.note)},` : ''} approaches: [`,
      ...f.approaches.map((a) => `    ${JSON.stringify({ ...a, src: undefined })},`),
      '  ] },',
    ].join('\n')),
    '];',
    '',
  ].join('\n');
  const file = `${OUT_DIR}/${base.icao.toLowerCase()}.js`;
  console.log(`${file}: ${(body.length / 1024).toFixed(1)} KB; ${fields.map((f) => `${f.icao} ${f.approaches.length}${f.note ? ' (none in the CIFP)' : ''}`).join(', ')}`);
  if (!DRY) writeFileSync(file, body);
}
for (const f of cache.values()) for (const a of f.approaches) console.log(`  ${f.icao} ${a.id.padEnd(6)} ${a.name}${a.gpa ? `, ${a.gpa}°` : ''}${a.tch ? ` TCH ${a.tch}` : ''} (lines ${a.src.first}-${a.src.last}${a.src.loc ? `, PI ${a.src.loc}` : ''}${a.src.rwy ? `, PG ${a.src.rwy}` : ''})`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of [...new Set(problems)]) console.log(`  ${p}`);
}
console.log(`\nCIFP cycle ${cycle}, effective ${effective}.`);
