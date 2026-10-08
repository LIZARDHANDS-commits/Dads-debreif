// Makes the US bases' airspace files for the SOF's 3D view (plan Step 2c part E, 8 Oct 2026): src/modules/sof/sites/faa-airspace/<icao>.js, one per
// base, from the FAA's open aeronautical data (the FAA AIS ArcGIS feature services, public domain, no key). Run it again each 56-day cycle and
// commit what it writes. From the repo root:
//   node tools/faa-airspace.mjs              fetch, trim, check and write the seven files, and print what each holds
//   node tools/faa-airspace.mjs --dry        the same, but print only (nothing written)
//   node tools/faa-airspace.mjs --empty      write empty files (no airspace, "not generated yet"), for when the FAA cannot be reached
// Behind a proxy, Node's fetch needs NODE_USE_ENV_PROXY=1 (Node 22.21 or later) to use HTTPS_PROXY.
//
// What it keeps, inside each base's 450 NM square (the 3D view's, scene3d-model.js AREA_NM):
// - Class airspace: Class B, C and D, and Class E only where it starts at the surface (surface areas and their extensions); every shelf is its own
//   entry, as the FAA gives it. Kinds: B and C 'terminal', D and surface E 'control-zone'.
// - Special use airspace: MOAs ('moa'), restricted and prohibited areas ('restricted'), warning areas ('warning') and alert areas ('alert').
// - Military training routes (IR, VR, SR), when the FAA publishes them as a feature service: each route's centreline as a line ('mtr'), cut to the
//   square, with its floor and ceiling where the data gives them; with none it is drawn on the ground and says "altitudes not given".
// Every entry is the shape airspace-data.js describes, checked with airspace-model.js `checkAirspace` (one copy of the rules); one that fails is left
// out and named here. Its `source` names the FAA dataset and the date the FAA last edited it. The DoD FLIP AP/1 (AP/1A special use airspace, AP/1B
// training routes) is the cross-check (Dad, 8 Oct): each profile's note says "cross-check against AP/1A / AP/1B (pages to be added)"; nothing of AP/1
// is copied.
//
// Kept small: each outline is thinned (Douglas-Peucker on the flat map round the base) so no point is more than SIMPLIFY_NM off the FAA's line, which
// is under a pixel at the 3D view's scale; positions are rounded to 4 decimals (about 10 m). Holes in an outline (rare: an exclusion cut out of a
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
import { AREA_NM } from '../src/modules/sof/scene3d-model.js';

const ROOT = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services';
const OUT_DIR = 'src/modules/sof/sites/faa-airspace';
/** The seven US T-6 bases with a site profile (sites/index.js PROFILES). */
const BASES = ['KDLF', 'KEND', 'KRND', 'KCBM', 'KSPS', 'KNSE', 'KNGP'];
/** No kept point is further than this from the FAA's outline (0.1 NM, about 185 m): an estimate, well under a pixel across 450 NM. */
const SIMPLIFY_NM = 0.1;
/** A point where the outline turns by this much or more gets a vertical edge (an estimate: a circle drawn in 15 or more sides turns less). */
const CORNER_DEG = 30;
const PAGE = 1000;
const USER_AGENT = 'DadsOODALoop-SOF-airspace-tool/1.0 (+https://github.com/LIZARDHANDS-commits/Dads-debreif)';

const args = new Set(process.argv.slice(2));

// ---- Asking the FAA ------------------------------------------------------------------------------------------------

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': USER_AGENT } });
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
    for (const layer of info.layers ?? []) {
      const meta = await getJson(`${ROOT}/${service}/FeatureServer/${layer.id}?f=json`);
      const edited = meta.editingInfo?.dataLastEditDate ?? meta.editingInfo?.lastEditDate ?? null;
      out.push({
        key: w.key,
        service,
        layer: layer.id,
        title: (meta.name ?? service).replace(/_/g, ' '),
        geometry: meta.geometryType,
        date: Number.isFinite(edited) ? new Date(edited).toISOString().slice(0, 10) : 'edit date not given',
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
 * - CODE SFC (or a 0 with no code) is the surface; MSL is ASL; AGL and SFC as written; UOM FL is a flight level (VAL × 100); STD with UOM FT is a
 *   pressure altitude, read as a flight level.
 * - VAL -9998 is read as "to but not including 18,000 ft MSL" (the floor of Class A); an assumption not checked against the FAA's own description,
 *   so it is printed when used. Anything else negative is an error.
 */
function limit(props, side) {
  const raw = field(props, `${side}_VAL`);
  const uom = text(field(props, `${side}_UOM`)).toUpperCase();
  const code = text(field(props, `${side}_CODE`)).toUpperCase();
  const desc = text(field(props, `${side}_DESC`)).toUpperCase();
  if (/UNL/.test(desc) || /UNL/.test(text(raw).toUpperCase())) return side === 'UPPER' ? { ft: 0, ref: 'UNL' } : { error: `${side} unlimited` };
  const val = Number(raw);
  if (!Number.isFinite(val)) return code === 'SFC' && side === 'LOWER' ? { ft: 0, ref: 'SFC' } : { error: `${side}_VAL not a number (${raw})` };
  if (val === -9998) return { ft: 18000, ref: 'ASL', assumed: '-9998 read as up to 18,000 ft MSL' };
  if (val < 0) return { error: `${side}_VAL ${val}` };
  if (code === 'SFC' || (val === 0 && (code === '' || code === 'AGL'))) return side === 'LOWER' ? { ft: 0, ref: 'SFC' } : { error: 'ceiling at the surface' };
  if (uom === 'FL') return { ft: val * 100, ref: 'FL' };
  if (code === 'STD') return { ft: val, ref: 'FL' };
  if (code === 'MSL' || code === '') return { ft: val, ref: 'ASL' };
  if (code === 'AGL') return { ft: val, ref: 'AGL' };
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
function ring(coords, toFt, closed) {
  const pts = coords.map(([lon, lat]) => [lat, lon]);
  if (closed && pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop();
  const xy = pts.map(([lat, lon]) => toFt(lat, lon));
  // A closed ring is thinned as a path that comes back to its start, so its first point stays.
  const kept = simplify(closed ? [...xy, xy[0]] : xy, SIMPLIFY_NM * FT_PER_NM).filter((i) => i < pts.length);
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
  const halfNm = AREA_NM / 2;
  const dLat = halfNm / 60;
  const dLon = halfNm / (60 * Math.cos((base.lat * Math.PI) / 180));
  const box = [base.lon - dLon, base.lat - dLat, base.lon + dLon, base.lat + dLat].map(round4);
  const entries = [];
  const dropped = [];
  const notes = [];
  let holes = 0;
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

  for (const layer of layers) {
    const need = layer.key === 'mtr' ? [] : ['UPPER_VAL', 'LOWER_VAL', 'NAME'];
    const missing = need.filter((n) => !layer.fields.includes(n));
    if (missing.length) throw new Error(`${layer.title}: field(s) ${missing.join(', ')} not found (fields: ${layer.fields.join(', ')})`);
    const source = `FAA ${layer.title} (AIS open data, last edited ${layer.date})`;
    for (const f of await features(layer, box)) {
      const props = f.properties ?? {};
      const name = text(field(props, 'NAME', 'IDENT')) || 'unnamed';
      if (layer.key === 'mtr') {
        const ident = text(field(props, 'IDENT', 'NAME', 'MTR_IDENT')) || name;
        const hasHeights = field(props, 'UPPER_VAL') !== undefined && field(props, 'LOWER_VAL') !== undefined;
        const floor = hasHeights ? limit(props, 'LOWER') : { ft: 0, ref: 'SFC' };
        const ceiling = hasHeights ? limit(props, 'UPPER') : null;
        if (floor.error || ceiling?.error) {
          dropped.push(`${ident} (${floor.error ?? ceiling.error})`);
          continue;
        }
        for (const part of lines(f.geometry).flatMap((c) => clipLine(c, toFt, halfNm * FT_PER_NM))) {
          const shape = ring(part, toFt, false);
          if (shape) add({ id: uniqueId(ident), name: `${ident} military training route`, kind: 'mtr', classLetter: null, floor, ceiling, shape: { type: 'line', points: shape.points }, source });
        }
        continue;
      }
      let kind;
      let classLetter = null;
      let id;
      if (layer.key === 'class') {
        const { cls, local } = classOf(props);
        if (!['B', 'C', 'D', 'E'].includes(cls)) continue;
        classLetter = cls;
        kind = cls === 'B' || cls === 'C' ? 'terminal' : 'control-zone';
        id = `${text(field(props, 'ICAO_ID', 'IDENT')) || name} ${cls}${cls === 'E' && local ? ` (${local.replace('CLASS_', '')})` : ''}`;
      } else {
        const type = text(field(props, 'TYPE_CODE')).toUpperCase();
        kind = SUA_KINDS[type];
        if (!kind) continue;
        id = name;
      }
      const floor = limit(props, 'LOWER');
      const ceiling = limit(props, 'UPPER');
      if (layer.key === 'class' && classLetter === 'E' && floor.ref !== 'SFC') continue; // Class E only where it reaches the surface
      if (floor.error || ceiling.error) {
        dropped.push(`${id} (${floor.error ?? ceiling.error})`);
        continue;
      }
      for (const assumed of [floor.assumed, ceiling.assumed].filter(Boolean)) notes.push(`${id}: ${assumed}`);
      const { rings, holes: h } = outerRings(f.geometry);
      holes += h;
      for (const coords of rings) {
        const shape = ring(coords, toFt, true);
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
  return { icao, entries, dropped, notes, holes, box };
}

// ---- Writing ---------------------------------------------------------------------------------------------------------

function fileText(icao, entries, source) {
  const head = [
    `// ${icao}'s airspace for the SOF's 3D view: GENERATED by tools/faa-airspace.mjs (do not edit by hand; run it again each 56-day cycle).`,
    "// From the FAA's open aeronautical data (AIS ArcGIS feature services, public domain), inside the base's 450 NM square; the shape is the one",
    '// airspace-data.js describes. Outlines thinned to within 0.1 NM and rounded to 4 decimals; for a picture, not for navigation.',
    `// Cross-check against AP/1A / AP/1B (pages to be added).`,
  ].join('\n');
  const body = entries.map((e) => `  ${JSON.stringify(e)},`).join('\n');
  return `${head}\n\n/** The dataset(s) and their FAA edit dates, for the profile's note. */\nexport const SOURCE = ${JSON.stringify(source)};\n\nexport const AIRSPACE = Object.freeze([\n${body}${body ? '\n' : ''}]);\n`;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  if (args.has('--empty')) {
    for (const icao of BASES) writeFileSync(`${OUT_DIR}/${icao.toLowerCase()}.js`, fileText(icao, [], 'FAA open aeronautical data: not generated yet (run tools/faa-airspace.mjs)'));
    console.log(`Wrote ${BASES.length} empty files in ${OUT_DIR}.`);
    return;
  }
  const layers = await findLayers();
  for (const l of layers) console.log(`${l.title}: ${l.service} layer ${l.layer} (${l.geometry}), last edited ${l.date}`);
  const source = `FAA open aeronautical data: ${[...new Set(layers.map((l) => `${l.title}, last edited ${l.date}`))].join('; ')}`;
  for (const icao of BASES) {
    const r = await forBase(icao, layers);
    const out = fileText(icao, r.entries, source);
    const counts = Object.entries(r.entries.reduce((n, e) => ({ ...n, [e.kind]: (n[e.kind] ?? 0) + 1 }), {})).map(([k, n]) => `${n} ${k}`).join(', ');
    console.log(`${icao}: ${r.entries.length} entries (${counts || 'none'}), ${(out.length / 1024).toFixed(1)} KB; box ${r.box.join(', ')}`);
    if (r.dropped.length) console.log(`  left out (fail their checks): ${r.dropped.join('; ')}`);
    if (r.notes.length) console.log(`  assumptions used: ${r.notes.join('; ')}`);
    if (r.holes) console.log(`  holes not drawn: ${r.holes}`);
    if (!args.has('--dry')) writeFileSync(`${OUT_DIR}/${icao.toLowerCase()}.js`, out);
  }
}

main().catch((err) => {
  console.error(`faa-airspace: ${err.message}`);
  process.exit(1);
});
