// Makes the US bases' airspace files for the SOF's 3D view (plan Step 2c part E, 8 Oct 2026): src/modules/sof/sites/faa-airspace/<icao>.js, one per
// base (and one for Moose Jaw, CYMJ: the US airspace south of the border, Dad 8 Oct 2026), from the FAA's open aeronautical data (the FAA AIS ArcGIS feature services, public domain, no key). Run it again each 56-day cycle and
// commit what it writes. From the repo root:
//   node tools/faa-airspace.mjs              fetch, trim, check and write the seven files, and print what each holds
//   node tools/faa-airspace.mjs --dry        the same, but print only (nothing written)
//   node tools/faa-airspace.mjs --empty      write empty files (no airspace, "not generated yet"), for when the FAA cannot be reached
//   node tools/faa-airspace.mjs --base CYMJ  only that base's file (each base takes some minutes)
// Behind a proxy, Node's fetch needs NODE_USE_ENV_PROXY=1 (Node 22.21 or later) to use HTTPS_PROXY.
//
// What it keeps, inside each base's 900 NM square (the 3D view's largest area, scene3d-model.js MAX_AREA_NM; the view cuts it to the area chosen, airspace-model.js
// `airspaceInSquare`, and loads the file only when the 3D view opens there, sites/airspace-load.js):
// - Class airspace: Class B, C and D; every shelf is its own entry, as the FAA gives it. Kinds: B and C 'terminal', D 'control-zone'. Class E is
//   left out: the FAA gives even its surface areas up to 18,000 ft MSL (-9998), which would stand as tall columns over every small field.
// - Special use airspace: MOAs ('moa'), restricted and prohibited areas ('restricted'), warning areas ('warning') and alert areas ('alert').
// - Military training routes (IR and VR; the FAA's MTR_Segment layer, one feature per segment): each route's centreline as a line ('mtr'), its
//   segments of one height band joined, cut to the square, with its floor and ceiling (a single altitude is a line at that height; with none it
//   is drawn on the ground and says "altitudes not given"). Pieces marked EXCLUSION (cut-outs) are left out.
// Every entry is the shape airspace-data.js describes, checked with airspace-model.js `checkAirspace` (one copy of the rules); one that fails is left
// out and named here. Its `source` names the FAA dataset and the date the FAA last edited it. The DoD FLIP AP/1 (AP/1A special use airspace, AP/1B
// training routes) is the cross-check (Dad, 8 Oct): each profile's note says "cross-check against AP/1A / AP/1B (pages to be added)"; nothing of AP/1
// is copied.
//
// Kept small: each outline is thinned (Douglas-Peucker on the flat map round the base) so no point is more than SIMPLIFY_NM off the FAA's line, which
// is under a pixel at the 3D view's scale; positions are rounded to 4 decimals (about 10 m). The file is written compactly (one short row per entry,
// points as a flat list, each dataset name once) and expanded to the airspace-data.js shape as it loads. Holes in an outline (rare: an exclusion cut out of a
// shelf) are not drawn, and the count is printed. Vertical edges are drawn only at corners that turn by CORNER_DEG or more (none round a circle).
//
// Field names are the FAA's (UPPER_VAL, UPPER_UOM, UPPER_CODE, LOWER_..., CLASS, LOCAL_TYPE, TYPE_CODE, NAME, IDENT); the tool reads each layer's
// field list first and stops with a plain message if one it needs is missing, rather than guessing. Written 8 Oct 2026 without reaching the FAA
// (the build session's network refused services6.arcgis.com), so the first real run is also its check: read its printout before committing.
import { writeFileSync, mkdirSync } from 'node:fs';
import { CATALOG } from '../src/airfields/catalog.js';
import { makeLocalRef, latLonToLocalFt } from '../src/core/geo.js';
import { FT_PER_NM } from '../src/core/units.js';
import { checkAirspace } from '../src/modules/sof/airspace-model.js';
import { MAX_AREA_NM } from '../src/modules/sof/scene3d-model.js';

const ROOT = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services';
const OUT_DIR = 'src/modules/sof/sites/faa-airspace';
/**
 * The seven US T-6 bases with a site profile (sites/index.js PROFILES), and Moose Jaw (CYMJ): the FAA has only US airspace, so its file is the US side of
 * Moose Jaw's 900 NM square (Montana, North Dakota and beyond), drawn with the DAH entries.
 */
const BASES = ['KDLF', 'KEND', 'KRND', 'KCBM', 'KSPS', 'KNSE', 'KNGP', 'CYMJ'];
/**
 * No kept point is further than this from the FAA's outline, by kind (estimates): 0.1 NM (about 185 m) for the small Class B, C and D shapes round the
 * fields, 0.25 NM for the large special use areas and the training routes. Both are under a pixel with the whole 450 NM square in view (and smaller still at 900 NM).
 */
const SIMPLIFY_NM = Object.freeze({ small: 0.1, large: 0.25 });
/** A point where the outline turns by this much or more gets a vertical edge (an estimate: a circle drawn in 15 or more sides turns less). */
const CORNER_DEG = 30;
const PAGE = 1000;
const USER_AGENT = 'DadsOODALoop-SOF-airspace-tool/1.0 (+https://github.com/LIZARDHANDS-commits/Dads-debreif)';

const args = new Set(process.argv.slice(2));

// ---- Asking the FAA ------------------------------------------------------------------------------------------------

async function getJson(url) {
  let res;
  // ArcGIS answers a busy moment with 503 or 504: asked again up to three times, 5, 10 and 20 s apart.
  for (let attempt = 0; ; attempt++) {
    res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': USER_AGENT } });
    if (res.ok || ![429, 502, 503, 504].includes(res.status) || attempt === 3) break;
    await new Promise((done) => setTimeout(done, 5000 * 2 ** attempt));
  }
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  const json = await res.json();
  if (json?.error) throw new Error(`ArcGIS error from ${url}: ${JSON.stringify(json.error).slice(0, 300)}`);
  return json;
}

/** The services to read: [{ key, service, layer, title, date, fields }], found by name in the FAA's service list. */
async function findLayers() {
  const directory = await getJson(`${ROOT}?f=json`);
  const names = (directory.services ?? []).filter((s) => s.type === 'FeatureServer').map((s) => s.name);
  const wanted = [
    { key: 'class', re: /^Class_Airspace$/i, required: true },
    { key: 'sua', re: /^Special_Use_Airspace$/i, required: true },
    { key: 'mtr', re: /Military_?Training_?Route|^MTR/i, required: false },
  ];
  const out = [];
  for (const w of wanted) {
    const service = names.find((n) => w.re.test(n));
    if (!service) {
      if (w.required) throw new Error(`no FAA service named like ${w.re} (services: ${names.join(', ')})`);
      console.log(`No military training route service found (services: ${names.join(', ')}); MTRs left out.`);
      continue;
    }
    const info = await getJson(`${ROOT}/${service}/FeatureServer?f=json`);
    // The 56-day cycle, where the service says it ("Current Effective Date: 0901Z 03 Sep 2026 to 0901Z 29 Oct 2026"); otherwise the edit date.
    const effective = /Effective Date:\s*([^<]+?)\s*</.exec(info.description ?? '')?.[1] ?? null;
    for (const layer of info.layers ?? []) {
      const meta = await getJson(`${ROOT}/${service}/FeatureServer/${layer.id}?f=json`);
      const edited = meta.editingInfo?.dataLastEditDate ?? meta.editingInfo?.lastEditDate ?? null;
      out.push({
        key: w.key,
        service,
        layer: layer.id,
        title: (meta.name ?? service).replace(/_/g, ' '),
        geometry: meta.geometryType,
        date: effective ? `effective ${effective}` : Number.isFinite(edited) ? `last edited ${new Date(edited).toISOString().slice(0, 10)}` : 'edit date not given',
        fields: (meta.fields ?? []).map((f) => f.name),
      });
    }
  }
  return out;
}

/** Every feature of one layer whose shape touches the box, as GeoJSON features, page by page. */
async function features(layer, box) {
  const all = [];
  for (let offset = 0; ; offset += PAGE) {
    const q = new URLSearchParams({
      where: '1=1',
      geometry: box.join(','),
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: '*',
      outSR: '4326',
      f: 'geojson',
      resultOffset: String(offset),
      resultRecordCount: String(PAGE),
    });
    const page = await getJson(`${ROOT}/${layer.service}/FeatureServer/${layer.layer}/query?${q}`);
    const list = page.features ?? [];
    all.push(...list);
    if (list.length < PAGE && !page.exceededTransferLimit && !page.properties?.exceededTransferLimit) break;
  }
  return all;
}

// ---- Reading the FAA's fields --------------------------------------------------------------------------------------

/** A field by any of its spellings (the FAA's are upper case), or undefined. */
const field = (props, ...names) => {
  for (const n of names) if (props[n] !== undefined && props[n] !== null && props[n] !== '') return props[n];
  return undefined;
};
const text = (v) => (v === undefined ? '' : String(v).trim());

/**
 * One limit from the FAA's VAL, UOM and CODE fields as an airspace-data.js limit ({ ft, ref }), or { error }.
 * - A 0 with CODE SFC, AGL, HEI or none is the surface; a number above 0 with SFC, AGL or HEI (the MTRs' height) is feet above the ground;
 *   MSL and ALT (the MTRs') are feet above sea level; UOM FL, or STD with a number under 1,000, is a flight level (VAL × 100).
 * - VAL -9998 with CODE UNLTD (restricted areas such as R-2915A) is unlimited (UNL, drawn to the top of the view). On Class E it comes with DESC
 *   "AA" and no code (read 8 Oct 2026) and would be read as up to the floor of Class A, 18,000 ft MSL (14 CFR 71.71), printed when used; Class E is
 *   left out anyway. Anything else negative is an error.
 */
function limit(props, side) {
  const raw = field(props, `${side}_VAL`);
  const uom = text(field(props, `${side}_UOM`)).toUpperCase();
  const code = text(field(props, `${side}_CODE`)).toUpperCase();
  const desc = text(field(props, `${side}_DESC`)).toUpperCase();
  if (/UNL/.test(desc) || /UNL/.test(code) || /UNL/.test(text(raw).toUpperCase())) return side === 'UPPER' ? { ft: 0, ref: 'UNL' } : { error: `${side} unlimited` };
  const val = Number(raw);
  if (!Number.isFinite(val)) return code === 'SFC' && side === 'LOWER' ? { ft: 0, ref: 'SFC' } : { error: `${side}_VAL not a number (${raw})` };
  if (val === -9998) return { ft: 18000, ref: 'ASL', assumed: `-9998 (${desc || 'no description'}) read as up to the floor of Class A, 18,000 ft MSL` };
  if (val < 0) return { error: `${side}_VAL ${val}` };
  // SFC with a number above 0 is a height above the surface (the FAA's Class E5 "700 SFC" is 700 ft AGL); HEI is the MTRs' height above ground.
  if (val === 0 && (code === 'SFC' || code === '' || code === 'AGL' || code === 'HEI')) return side === 'LOWER' ? { ft: 0, ref: 'SFC' } : { error: 'ceiling at the surface' };
  if (code === 'SFC' || code === 'AGL' || code === 'HEI') return { ft: val, ref: 'AGL' };
  // A flight level: UOM FL, or a pressure altitude (STD) given as a flight level number (the MTRs' "180 STD") or in feet.
  if (uom === 'FL' || (code === 'STD' && val < 1000)) return { ft: val * 100, ref: 'FL' };
  if (code === 'STD') return { ft: val, ref: 'FL' };
  if (code === 'MSL' || code === 'ALT' || code === '') return { ft: val, ref: 'ASL' };
  return { error: `${side}_CODE ${code}` };
}

// ---- Shapes --------------------------------------------------------------------------------------------------------

/** Douglas-Peucker on points already in feet ([x, y]); returns the indices kept. */
function simplify(xy, tolFt) {
  const keep = new Set([0, xy.length - 1]);
  const stack = [[0, xy.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let worst = -1;
    let at = -1;
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const len = Math.hypot(bx - ax, by - ay);
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      const d = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > tolFt) {
      keep.add(at);
      stack.push([a, at], [at, b]);
    }
  }
  return [...keep].sort((p, q) => p - q);
}

const round4 = (v) => Math.round(v * 1e4) / 1e4;

/** A GeoJSON ring ([[lon, lat], ...], closed) thinned: { points: [[lat, lon], ...] (not closed), corners }, or null when under 3 points are left. */
function ring(coords, toFt, closed, tolNm) {
  const pts = coords.map(([lon, lat]) => [lat, lon]);
  if (closed && pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop();
  const xy = pts.map(([lat, lon]) => toFt(lat, lon));
  // A closed ring is thinned as a path that comes back to its start, so its first point stays.
  const kept = simplify(closed ? [...xy, xy[0]] : xy, tolNm * FT_PER_NM).filter((i) => i < pts.length);
  const out = kept.map((i) => [round4(pts[i][0]), round4(pts[i][1])]);
  if (out.length < (closed ? 3 : 2)) return null;
  const corners = [];
  if (closed) {
    const k = kept.map((i) => xy[i]);
    k.forEach((p, i) => {
      const a = k[(i - 1 + k.length) % k.length];
      const b = k[(i + 1) % k.length];
      const turn = Math.abs(Math.atan2((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]), (p[0] - a[0]) * (b[0] - p[0]) + (p[1] - a[1]) * (b[1] - p[1])));
      if ((turn * 180) / Math.PI >= CORNER_DEG) corners.push(i);
    });
  }
  return { points: out, corners };
}

/**
 * The parts of a line inside the square (± halfFt round the base), each run out to the square's edge (the edge point found by halving the segment
 * that crosses it, to about a foot). A segment that only passes through the square without a point inside it is not kept (rare at 450 NM).
 */
function clipLine(coords, toFt, halfFt) {
  const inside = ([lon, lat]) => {
    const [x, y] = toFt(lat, lon);
    return Math.abs(x) <= halfFt && Math.abs(y) <= halfFt;
  };
  const edge = (a, b) => { // a inside, b outside
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (inside([a[0] + (b[0] - a[0]) * mid, a[1] + (b[1] - a[1]) * mid])) lo = mid;
      else hi = mid;
    }
    return [a[0] + (b[0] - a[0]) * lo, a[1] + (b[1] - a[1]) * lo];
  };
  const runs = [];
  let run = null;
  coords.forEach((c, i) => {
    if (inside(c)) {
      if (!run) run = i > 0 ? [edge(c, coords[i - 1])] : [];
      run.push(c);
    } else if (run) {
      run.push(edge(coords[i - 1], c));
      runs.push(run);
      run = null;
    }
  });
  if (run) runs.push(run);
  return runs.filter((r) => r.length >= 2);
}

/** The outer rings of a Polygon or MultiPolygon, and how many holes were left out. */
function outerRings(geometry) {
  if (geometry?.type === 'Polygon') return { rings: [geometry.coordinates[0]], holes: geometry.coordinates.length - 1 };
  if (geometry?.type === 'MultiPolygon') return { rings: geometry.coordinates.map((p) => p[0]), holes: geometry.coordinates.reduce((n, p) => n + p.length - 1, 0) };
  return { rings: [], holes: 0 };
}

/** Line pieces ([[lon, lat], ...]) joined end to start wherever one ends where another begins (to about 1 m), so a route's segments become one line. */
function chain(pieces) {
  const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-5 && Math.abs(a[1] - b[1]) < 1e-5;
  const left = pieces.filter((p) => p.length >= 2).map((p) => [...p]);
  const out = [];
  while (left.length) {
    let line = left.shift();
    for (let joined = true; joined; ) {
      joined = false;
      for (let i = 0; i < left.length; i++) {
        const p = left[i];
        if (same(line.at(-1), p[0])) line = [...line, ...p.slice(1)];
        else if (same(p.at(-1), line[0])) line = [...p, ...line.slice(1)];
        else if (same(line.at(-1), p.at(-1))) line = [...line, ...[...p].reverse().slice(1)];
        else if (same(p[0], line[0])) line = [...[...p].reverse(), ...line.slice(1)];
        else continue;
        left.splice(i, 1);
        joined = true;
        break;
      }
    }
    out.push(line);
  }
  return out;
}

const lines = (geometry) => (geometry?.type === 'LineString' ? [geometry.coordinates] : geometry?.type === 'MultiLineString' ? geometry.coordinates : []);

// ---- One base ------------------------------------------------------------------------------------------------------

function classOf(props) {
  const cls = text(field(props, 'CLASS')).toUpperCase();
  const local = text(field(props, 'LOCAL_TYPE')).toUpperCase();
  return { cls, local };
}

const SUA_KINDS = Object.freeze({ MOA: 'moa', R: 'restricted', P: 'restricted', W: 'warning', A: 'alert' });

async function forBase(icao, layers) {
  const base = CATALOG[icao];
  const ref = makeLocalRef(base.lat, base.lon);
  const toFt = (lat, lon) => {
    const p = latLonToLocalFt(ref, lat, lon);
    return [p.x, p.y];
  };
  const halfNm = MAX_AREA_NM / 2;
  const dLat = halfNm / 60;
  const dLon = halfNm / (60 * Math.cos((base.lat * Math.PI) / 180));
  const box = [base.lon - dLon, base.lat - dLat, base.lon + dLon, base.lat + dLat].map(round4);
  const entries = [];
  const dropped = [];
  const notes = [];
  let holes = 0;
  let excluded = 0;
  let canadian = 0;
  const ids = new Map();
  const uniqueId = (id) => {
    const n = (ids.get(id) ?? 0) + 1;
    ids.set(id, n);
    return n === 1 ? id : `${id}-${n}`;
  };
  const add = (entry) => {
    const verdict = checkAirspace(entry, base.elevationFt ?? 0);
    if (verdict.ok) entries.push(entry);
    else dropped.push(`${entry.id} (${verdict.reason})`);
  };

  const routes = new Map(); // MTR segments by route and height band
  for (const layer of layers) {
    const need = layer.key === 'mtr' ? [] : ['UPPER_VAL', 'LOWER_VAL', 'NAME'];
    const missing = need.filter((n) => !layer.fields.includes(n));
    if (missing.length) throw new Error(`${layer.title}: field(s) ${missing.join(', ')} not found (fields: ${layer.fields.join(', ')})`);
    const source = `FAA ${layer.title} (AIS open data, ${layer.date})`;
    for (const f of await features(layer, box)) {
      const props = f.properties ?? {};
      const name = text(field(props, 'NAME', 'IDENT')) || 'unnamed';
      if (layer.key === 'mtr') {
        // MTR_TYPE 0 is IR and 1 is VR: inferred from the data (8 Oct 2026), since only type 0 has segments at flight levels (STD, up to FL290)
        // and VFR flight is not allowed in Class A (14 CFR 91.135); the FAA's layer gives no names for the two values.
        const type = { 0: 'IR', 1: 'VR' }[String(field(props, 'MTR_TYPE'))] ?? 'MTR';
        const number = text(field(props, 'IDENT', 'NAME', 'MTR_IDENT')) || name;
        const ident = /^\d+$/.test(number) ? `${type}${number}` : number;
        const widths = [Number(field(props, 'WIDTHLEFT')), Number(field(props, 'WIDTHRIGHT'))].filter(Number.isFinite);
        const hasHeights = field(props, 'UPPER_VAL') !== undefined && field(props, 'LOWER_VAL') !== undefined;
        const floor = hasHeights ? limit(props, 'LOWER') : { ft: 0, ref: 'SFC' };
        const ceiling = hasHeights ? limit(props, 'UPPER') : null;
        if (floor.error || ceiling?.error) {
          dropped.push(`${ident} (${floor.error ?? ceiling.error})`);
          continue;
        }
        // Segments are joined into one line per route and height band below (the FAA gives one feature per segment).
        const key = `${ident}|${JSON.stringify(floor)}|${JSON.stringify(ceiling)}`;
        if (!routes.has(key)) routes.set(key, { ident, floor, ceiling, widths: [], parts: [], source });
        const route = routes.get(key);
        route.widths.push(...widths);
        route.parts.push(...lines(f.geometry));
        continue;
      }
      let kind;
      let classLetter = null;
      let id;
      if (text(field(props, 'EXCLUSION')) === '1') { // a cut-out ("EXCLUDES R-2103"), not airspace of its own
        excluded += 1;
        continue;
      }
      if (layer.key === 'class') {
        const { cls, local } = classOf(props);
        if (!['B', 'C', 'D'].includes(cls)) continue;
        // The FAA's class layer also carries some Canadian airspace (control area extensions and Winnipeg's TCA as "Class B", ICAO ids CZ..). At a
        // Canadian base NAV CANADA's DAH is the source for Canada (airspace-data.js, SOF-41), so those are left out of its file: only the US side is kept.
        if (icao.startsWith('C') && /^C/i.test(text(field(props, 'ICAO_ID', 'IDENT')))) {
          canadian += 1;
          continue;
        }
        classLetter = cls;
        kind = cls === 'D' ? 'control-zone' : 'terminal';
        id = `${text(field(props, 'ICAO_ID', 'IDENT')) || name} ${cls}${local && local !== `CLASS_${cls}` ? ` (${local.replace('CLASS_', '')})` : ''}`;
      } else {
        const type = text(field(props, 'TYPE_CODE')).toUpperCase();
        kind = SUA_KINDS[type];
        if (!kind) continue;
        id = name;
      }
      const floor = limit(props, 'LOWER');
      const ceiling = limit(props, 'UPPER');
      if (floor.error || ceiling.error) {
        dropped.push(`${id} (${floor.error ?? ceiling.error})`);
        continue;
      }
      for (const assumed of [floor.assumed, ceiling.assumed].filter(Boolean)) notes.push(`${id}: ${assumed}`);
      const { rings, holes: h } = outerRings(f.geometry);
      holes += h;
      for (const coords of rings) {
        const shape = ring(coords, toFt, true, layer.key === 'class' ? SIMPLIFY_NM.small : SIMPLIFY_NM.large);
        if (!shape) continue;
        add({
          id: uniqueId(id),
          name,
          kind,
          classLetter,
          floor: { ft: floor.ft, ref: floor.ref },
          ceiling: { ft: ceiling.ft, ref: ceiling.ref },
          shape: { type: 'polygon', points: shape.points, corners: shape.corners },
          source,
        });
      }
    }
  }
  for (const r of routes.values()) {
    const lo = Math.min(...r.widths);
    const hi = Math.max(...r.widths);
    const width = r.widths.length ? `, ${lo === hi ? lo : `${lo} to ${hi}`} NM either side of the centreline` : '';
    for (const part of chain(r.parts).flatMap((c) => clipLine(c, toFt, halfNm * FT_PER_NM))) {
      const shape = ring(part, toFt, false, SIMPLIFY_NM.large);
      if (shape) add({ id: uniqueId(r.ident), name: `${r.ident} military training route${width}`, kind: 'mtr', classLetter: null, floor: r.floor, ceiling: r.ceiling, shape: { type: 'line', points: shape.points }, source: r.source });
    }
  }
  return { icao, entries, dropped, notes, holes, excluded, canadian, box };
}

// ---- Writing ---------------------------------------------------------------------------------------------------------

function fileText(icao, entries, source) {
  const head = [
    `// ${icao}'s airspace for the SOF's 3D view: GENERATED by tools/faa-airspace.mjs (do not edit by hand; run it again each 56-day cycle).`,
    "// From the FAA's open aeronautical data (AIS ArcGIS feature services, public domain), inside the base's 900 NM square. Outlines thinned to within",
    '// 0.1 NM (Class B, C, D) or 0.25 NM (special use areas, training routes) and rounded to 4 decimals; for a picture, not for navigation.',
    '// Cross-check against AP/1A / AP/1B (pages to be added).',
    '// Each row is [id, name (null: the same as id), kind, class letter, floor [ft, ref], ceiling [ft, ref] or null, shape type, points as a flat',
    '// list lat, lon, lat, lon ..., corners or null, dataset index]; `row()` expands it into the entry shape airspace-data.js describes.',
  ].join('\n');
  const sources = [...new Set(entries.map((e) => e.source))];
  const rows = entries.map((e) => JSON.stringify([
    e.id,
    e.name === e.id ? null : e.name,
    e.kind,
    e.classLetter,
    [e.floor.ft, e.floor.ref],
    e.ceiling ? [e.ceiling.ft, e.ceiling.ref] : null,
    e.shape.type,
    e.shape.points.flat(),
    e.shape.corners ?? null,
    sources.indexOf(e.source),
  ]));
  return `${head}

/** The dataset(s) and their FAA dates, for the profile's note. */
export const SOURCE = ${JSON.stringify(source)};

const DATASETS = ${JSON.stringify(sources)};
const pairs = (flat) => Array.from({ length: flat.length / 2 }, (_, i) => [flat[2 * i], flat[2 * i + 1]]);
const row = ([id, name, kind, classLetter, floor, ceiling, type, points, corners, dataset]) => ({
  id,
  name: name ?? id,
  kind,
  classLetter,
  floor: { ft: floor[0], ref: floor[1] },
  ceiling: ceiling ? { ft: ceiling[0], ref: ceiling[1] } : null,
  shape: corners ? { type, points: pairs(points), corners } : { type, points: pairs(points) },
  source: DATASETS[dataset],
});

export const AIRSPACE = Object.freeze([
${rows.map((r) => `  ${r},`).join('\n')}${rows.length ? '\n' : ''}].map(row));
`;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  if (args.has('--empty')) {
    for (const icao of BASES) writeFileSync(`${OUT_DIR}/${icao.toLowerCase()}.js`, fileText(icao, [], 'FAA open aeronautical data: not generated yet (run tools/faa-airspace.mjs)'));
    console.log(`Wrote ${BASES.length} empty files in ${OUT_DIR}.`);
    return;
  }
  const layers = await findLayers();
  for (const l of layers) console.log(`${l.title}: ${l.service} layer ${l.layer} (${l.geometry}), ${l.date}`);
  const source = `FAA open aeronautical data: ${[...new Set(layers.map((l) => `${l.title}, ${l.date}`))].join('; ')}`;
  const only = process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1]?.toUpperCase() : null;
  if (only && !BASES.includes(only)) throw new Error(`--base ${only}: not one of ${BASES.join(', ')}`);
  for (const icao of only ? [only] : BASES) {
    const r = await forBase(icao, layers);
    const out = fileText(icao, r.entries, source);
    const counts = Object.entries(r.entries.reduce((n, e) => ({ ...n, [e.kind]: (n[e.kind] ?? 0) + 1 }), {})).map(([k, n]) => `${n} ${k}`).join(', ');
    console.log(`${icao}: ${r.entries.length} entries (${counts || 'none'}), ${(out.length / 1024).toFixed(1)} KB; box ${r.box.join(', ')}`);
    if (r.dropped.length) console.log(`  left out (fail their checks): ${r.dropped.join('; ')}`);
    if (r.notes.length) console.log(`  assumptions used: ${r.notes.join('; ')}`);
    if (r.holes) console.log(`  holes not drawn: ${r.holes}`);
    if (r.excluded) console.log(`  exclusion pieces left out (cut-outs, not airspace): ${r.excluded}`);
    if (r.canadian) console.log(`  Canadian class pieces left out (the DAH is the source for Canada): ${r.canadian}`);
    if (!args.has('--dry')) writeFileSync(`${OUT_DIR}/${icao.toLowerCase()}.js`, out);
  }
}

main().catch((err) => {
  console.error(`faa-airspace: ${err.message}`);
  process.exit(1);
});
