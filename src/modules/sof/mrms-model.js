// Radar with its real heights from NOAA MRMS, decided without a page, three.js or the network (SOF-67, SOF-R29; spec "3D view", "Radar with its real heights";
// research in docs/modules/sof/radar-3d-research.md). What to ask NOAA's public bucket for, how to read its folder listing (an untrusted reply), the checks a
// file must pass, the window of the grid the 3D square needs, how the 1 km grid is laid onto the square's cells (Performance) or volume (High), and the words.
// Pure: mrms-worker.js runs the reading and laying-out off the page; mrms-feed.js asks and keeps; radar3d.js draws.
//
// Where the numbers come from (V: seen in NOAA's own files or listing on 14 Oct 2026; G: an estimate, said as one on screen where it shows):
// - The bucket, folder names and file names (V, research). A file about every 2 minutes, in the bucket 1 to 2 minutes later (V, research).
// - The grid: 7000 x 3500 at 0.01 degree, first point 54.995 N 129.995 W (230.005 E), read north to south (V, read from the files).
// - Which field a file holds: GRIB2 discipline 209 (MRMS's own), category and number 3/44 EchoTop_18, 3/45 EchoTop_30, 10/0 the composite, 9/0 reflectivity at a
//   height; the surface is type 102, height above sea level in metres: 500 for the echo tops and composite, the level's height for the 3D levels (V, read from
//   the files, which ecCodes reads the same way; NOAA's MRMS table was not reachable from here).
// - Values: echo tops in km above sea level, -1 no echo, -3 no coverage; reflectivity in dBZ, -99 no echo, -999 no coverage (V, read from the files; the spec's
//   "-1 no echo, -3 no coverage" is the echo tops' pair).
// - The checks' limits (spec "Untrusted replies"): about 3 MB gzipped a file (G), dBZ -40 to 90, tops 0 to 25 km.
import { makeLocalRef, latLonToLocalFt, localFtToLatLon } from '../../core/geo.js';
import { FT_PER_M } from '../../core/units.js';
import { MRMS_SCALE } from './map-model.js';

/** NOAA's public MRMS bucket on AWS (anonymous, answers any site: research, V). The only host this feed asks. */
export const MRMS_BUCKET = 'https://noaa-mrms-pds.s3.amazonaws.com';
/** MRMS's grid (V, read from the files): any file whose grid differs fails its check. */
export const MRMS_GRID = Object.freeze({ ni: 7000, nj: 3500, la1: 54.995, lo1: 230.005, di: 0.01, dj: 0.01 });
/** MRMS's northern edge (degrees north): the grid's first row is 54.995, half a cell south of it. */
export const MRMS_NORTH_DEG = 55;
/** The MRMS discipline in GRIB2 (its own local table, V). */
const MRMS_DISCIPLINE = 209;

/** Echo-top values (km above sea level) and reflectivity (dBZ) that mean "no echo" and "no coverage" (V). */
export const SENTINELS = Object.freeze({ top: Object.freeze({ none: -1, gap: -3 }), dbz: Object.freeze({ none: -99, gap: -999 }) });
/** A value outside these is a failure for that file (spec "Untrusted replies"). */
export const VALUE_RANGE = Object.freeze({ top: Object.freeze([0, 25]), dbz: Object.freeze([-40, 90]) });
/** A file over this many bytes (gzipped) is a failure (spec: about 3 MB, an estimate; a quiet day's composite was 1.5 MB, V). */
export const MAX_FILE_BYTES = 3 * 1024 * 1024;
/** The folder listing is a few hundred bytes a file asked after `start-after`; this cap is far above it. An estimate. */
export const MAX_LIST_BYTES = 256 * 1024;
/** How long a listing and a file may take (milliseconds). Estimates: a 1.5 MB file came in about 1 s here. */
export const LIST_TIMEOUT_MS = 15_000;
export const FILE_TIMEOUT_MS = 60_000;
/** The listing asks only for files from this far back (milliseconds): several 2-minute files, so the newest is always among them while NOAA is running. An estimate. */
export const LOOKBACK_MS = 15 * 60_000;
/** A file time this far ahead of the clock is a wrong clock or a bad reply, as feeds.js CLOCK_SKEW_MS (5 minutes). */
const SKEW_MS = 5 * 60_000;

/** One MRMS product: its folder name, what its values are ('top' or 'dbz'), and the GRIB2 numbers its file must carry. */
const product = (name, kind, category, number, surfaceM, words) => Object.freeze({ name, kind, category, number, surfaceM, words });
export const PRODUCTS = Object.freeze({
  top18: product('EchoTop_18_00.50', 'top', 3, 44, 500, '18 dBZ echo top'),
  top30: product('EchoTop_30_00.50', 'top', 3, 45, 500, '30 dBZ echo top'),
  composite: product('MergedReflectivityQCComposite_00.50', 'dbz', 10, 0, 500, 'composite reflectivity'),
});
/** High's 12 heights, km above sea level (spec: an estimate for the levels, enough to show a storm's layers). */
export const HIGH_LEVELS_KM = Object.freeze([1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18]);
/** The 3D reflectivity at one height, km above sea level ("MergedReflectivityQC_03.00" for 3 km). */
export const levelProduct = (km) => product(`MergedReflectivityQC_${km.toFixed(2).padStart(5, '0')}`, 'dbz', 9, 0, Math.round(km * 1000), `reflectivity at ${km} km`);
/** The products each mode asks for, in the order they are asked. */
export const MODE_PRODUCTS = Object.freeze({
  performance: Object.freeze([PRODUCTS.top18, PRODUCTS.top30, PRODUCTS.composite]),
  high: Object.freeze(HIGH_LEVELS_KM.map(levelProduct)),
});
/** The setting "3D radar detail": Performance (default) or High (spec, SOF-67). */
export const RADAR_DETAIL_OPTIONS = Object.freeze([
  Object.freeze({ value: 'performance', label: 'Performance (default)' }),
  Object.freeze({ value: 'high', label: 'High' }),
]);
export const RADAR_DETAIL_VALUES = Object.freeze(RADAR_DETAIL_OPTIONS.map((o) => o.value));
export const DEFAULT_RADAR_DETAIL = 'performance';
/** Three or more High heights failing in one update drops that update to Performance (spec). */
export const HIGH_FAILS_TO_PERFORMANCE = 3;

/** Performance's cells are about this wide (km, spec "about 4 km"), with at most PERFORMANCE_MAX_CELLS a side (so 900 NM is about 5 km a cell; an estimate for the drawing). */
export const PERFORMANCE_CELL_KM = 4;
export const PERFORMANCE_MAX_CELLS = 320;
/** High's volume is about 1 km a cell (spec), with at most HIGH_MAX_CELLS a side (600 NM about 1.1 km, 900 NM about 1.6 km; graphics memory, an estimate). */
export const HIGH_CELL_KM = 1;
export const HIGH_MAX_CELLS = 1024;
/** Echoes weaker than this are not drawn in 3D (dBZ; very light returns, often not precipitation). An estimate. */
export const MIN_DRAW_DBZ = 5;

const KM_FT = 1000 * FT_PER_M;
/** Kilometres to feet. */
export const kmToFt = (km) => km * KM_FT;
const pad2 = (n) => String(n).padStart(2, '0');
/** "0508Z" for a time. */
export const hhmmZ = (t) => {
  const d = new Date(t);
  return `${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}Z`;
};
const dayOf = (t) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
};
const stampOf = (t) => {
  const d = new Date(t);
  return `${dayOf(t)}-${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}`;
};

// ---- Asking the bucket --------------------------------------------------------------------------------------

/** A file's key in the bucket for a product and time ("CONUS/EchoTop_18_00.50/20261014/MRMS_EchoTop_18_00.50_20261014-050840.grib2.gz"). */
export const keyFor = (p, t) => `CONUS/${p.name}/${dayOf(t)}/MRMS_${p.name}_${stampOf(t)}.grib2.gz`;
/** The file's address. Built only from the fixed host and a key that passed `parseListing`'s pattern. */
export const fileUrl = (key) => `${MRMS_BUCKET}/${key.split('/').map(encodeURIComponent).join('/')}`;

/**
 * The folder listings that hold the newest file (S3 ListObjectsV2 with a prefix, research V): the day's folder, asked only for keys after LOOKBACK_MS ago; and the
 * day before's too while that look-back reaches into it (just after 0000Z). Returns [url].
 */
export function listingUrls(p, now) {
  const from = +now - LOOKBACK_MS;
  const days = dayOf(from) === dayOf(now) ? [from] : [from, +now];
  return days.map((t) => {
    const prefix = `CONUS/${p.name}/${dayOf(t)}/`;
    const after = t === from ? keyFor(p, from) : `${prefix}MRMS_${p.name}_${dayOf(t)}-000000.grib2.gz`;
    return `${MRMS_BUCKET}/?list-type=2&prefix=${encodeURIComponent(prefix)}&start-after=${encodeURIComponent(after)}&max-keys=100`;
  });
}

/** The time in a key's name, or null. */
export function keyTime(key) {
  const m = /_(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.grib2\.gz$/.exec(key);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isFinite(t) ? t : null;
}

/**
 * The files of one product in a listing reply (untrusted text): [{ key, time, size }] for each <Contents> whose key is exactly this product's pattern (folder, name,
 * time) and whose size is a plain number. Anything else in the reply is ignored.
 */
export function parseListing(text, p) {
  if (typeof text !== 'string') return [];
  const out = [];
  const name = p.name.replace(/\./g, '\\.');
  const keyRe = new RegExp(`^CONUS/${name}/(\\d{8})/MRMS_${name}_(\\d{8})-\\d{6}\\.grib2\\.gz$`);
  for (const m of text.matchAll(/<Contents>([\s\S]{0,2000}?)<\/Contents>/g)) {
    const key = /<Key>([^<]{1,200})<\/Key>/.exec(m[1])?.[1];
    const size = /<Size>(\d{1,12})<\/Size>/.exec(m[1])?.[1];
    if (!key || !size) continue;
    const parts = keyRe.exec(key);
    if (!parts || parts[1] !== parts[2]) continue;
    const time = keyTime(key);
    if (time === null) continue;
    out.push({ key, time, size: Number(size) });
  }
  return out;
}

/**
 * The newest usable file among `files` (parseListing's), or { reason } when there is none: no file listed, the newest too far ahead of the clock, or older than the
 * radar's stale limit (`staleMs`), or too big to fetch.
 */
export function newestFile(files, now, staleMs) {
  const ahead = files.filter((f) => f.time - now <= SKEW_MS).sort((a, b) => b.time - a.time);
  if (!ahead.length) return { reason: files.length ? 'file times ahead of the clock' : 'no new file in the last 15 minutes' };
  const f = ahead[0];
  if (now - f.time > staleMs) return { reason: `newest file is ${Math.floor((now - f.time) / 60_000)} min old` };
  if (f.size > MAX_FILE_BYTES) return { reason: `file too big (${(f.size / 1048576).toFixed(1)} MB)` };
  return { file: f };
}

// ---- Checking a file --------------------------------------------------------------------------------------------

/**
 * Why a read file is not the one asked for, or null when it is (spec "Untrusted replies"): GRIB2 edition 2 (grib2.js checks it, and data template 5.41), MRMS's
 * grid, the product's discipline, category and number, its surface and height, and a time that matches the file's name (within 5 minutes).
 */
const near = (a, b, tol) => Math.abs(a - b) <= tol;
/** True for MRMS's own grid: 7000 x 3500 at 0.01 degree from 54.995 N 129.995 W, read north to south and west to east. */
export const gridIsMrms = (g) => Boolean(g) && g.ni === MRMS_GRID.ni && g.nj === MRMS_GRID.nj && near(g.di, MRMS_GRID.di, 1e-6) && near(g.dj, MRMS_GRID.dj, 1e-6)
  && near(g.la1, MRMS_GRID.la1, 1e-4) && near(g.lo1, MRMS_GRID.lo1, 1e-4) && g.scan === 0;

export function checkField(meta, p, nameTime) {
  if (!meta || meta.edition !== 2) return 'not GRIB2 edition 2';
  if (!gridIsMrms(meta.grid)) return "grid is not MRMS's 7000 x 3500 at 0.01°";
  if (meta.packing?.template !== 41) return 'not PNG packed (template 5.41)';
  const pr = meta.product;
  if (meta.discipline !== MRMS_DISCIPLINE || pr?.category !== p.category || pr?.number !== p.number) return 'a different field from the one asked for';
  if (pr.surfaceType !== 102 || !near(pr.surfaceValue, p.surfaceM, 1)) return 'a different height from the one asked for';
  if (!(meta.time instanceof Date) || !Number.isFinite(+meta.time) || (nameTime !== null && Math.abs(+meta.time - nameTime) > SKEW_MS)) return "file time doesn't match its name";
  return null;
}

/** What a value means: 'gap' (no coverage), 'none' (no echo), 'bad' (out of range) or 'value'. */
export function classify(v, kind) {
  const s = SENTINELS[kind];
  if (Math.abs(v - s.gap) < 1e-3) return 'gap';
  if (Math.abs(v - s.none) < 1e-3) return 'none';
  const [lo, hi] = VALUE_RANGE[kind];
  return v >= lo && v <= hi ? 'value' : 'bad';
}

// ---- The window of the grid the square needs -----------------------------------------------------------------

/** The square's edges in degrees: { north, south, west, east } (the local map is flat, so latitude follows y and longitude x: the corners give them exactly). */
export function squareBounds(lat, lon, halfFt) {
  const ref = makeLocalRef(lat, lon);
  const ne = localFtToLatLon(ref, halfFt, halfFt);
  const sw = localFtToLatLon(ref, -halfFt, -halfFt);
  return { north: ne.lat, south: sw.lat, west: sw.lon, east: ne.lon };
}

/** The rows and columns of `grid` (grib2.js parseGrib2's) that cover `bounds`, one cell of margin, cut to the grid; null when the square misses the grid. */
export function cropFor(grid, bounds) {
  const east = (lon) => ((lon % 360) + 360) % 360;
  const rowOf = (lat) => Math.floor((grid.la1 - lat) / grid.dj + 0.5);
  const colOf = (lon) => Math.floor((east(lon) - grid.lo1) / grid.di + 0.5);
  const row0 = Math.max(0, rowOf(bounds.north) - 1);
  const row1 = Math.min(grid.nj - 1, rowOf(bounds.south) + 1);
  const col0 = Math.max(0, colOf(bounds.west) - 1);
  const col1 = Math.min(grid.ni - 1, colOf(bounds.east) + 1);
  if (row0 > row1 || col0 > col1) return null;
  return { row0, row1, col0, col1 };
}

/** The square's cells: { lat, lon, halfFt, n } laid out for a mode (spec: about 4 km in Performance, about 1 km in High, each with a cap a side). */
export function targetFor(mode, lat, lon, halfFt) {
  const km = (2 * halfFt) / KM_FT;
  const n = mode === 'high'
    ? Math.min(HIGH_MAX_CELLS, Math.max(16, Math.round(km / HIGH_CELL_KM)))
    : Math.min(PERFORMANCE_MAX_CELLS, Math.max(16, Math.round(km / PERFORMANCE_CELL_KM)));
  return Object.freeze({ lat, lon, halfFt, n });
}

/** The x (east) and y (north) feet from home of each column and row of a window, worked out once (the local map is flat, so x follows longitude alone and y latitude). */
function windowFeet(read, grid, target) {
  const ref = makeLocalRef(target.lat, target.lon);
  const xs = new Float64Array(read.cols);
  const ys = new Float64Array(read.rows);
  for (let c = 0; c < read.cols; c++) {
    let lon = grid.lo1 + (read.crop.col0 + c) * grid.di;
    if (lon > 180) lon -= 360;
    xs[c] = latLonToLocalFt(ref, target.lat, lon).x;
  }
  for (let r = 0; r < read.rows; r++) ys[r] = latLonToLocalFt(ref, grid.la1 - (read.crop.row0 + r) * grid.dj, target.lon).y;
  return { xs, ys };
}

/**
 * The values of a window (grib2.js readGrib2Window's `{ crop, rows, cols, values }`) laid on the square's n x n cells (row 0 the north edge), each cell taking its
 * strongest value, so a thin echo is never averaged away (Performance). Returns a Float32Array where each cell is NaN for no coverage (none of its 1 km cells
 * is covered, or it is off the grid), -Infinity for covered but no echo, else the strongest value. Out-of-range values are skipped (decodeFile fails the file).
 */
export function binMax(read, grid, target, kind) {
  const { n, halfFt } = target;
  const cells = new Float32Array(n * n).fill(NaN);
  if (!read.crop) return cells;
  const size = (2 * halfFt) / n;
  const { xs, ys } = windowFeet(read, grid, target);
  const colCell = new Int32Array(read.cols);
  for (let c = 0; c < read.cols; c++) {
    const i = Math.floor((xs[c] + halfFt) / size);
    colCell[c] = i >= 0 && i < n ? i : -1;
  }
  for (let r = 0; r < read.rows; r++) {
    const j = Math.floor((halfFt - ys[r]) / size);
    if (j < 0 || j >= n) continue;
    const base = r * read.cols;
    for (let c = 0; c < read.cols; c++) {
      const i = colCell[c];
      if (i < 0) continue;
      const v = read.values[base + c];
      const what = classify(v, kind);
      if (what === 'gap' || what === 'bad') continue;
      const k = j * n + i;
      const held = cells[k];
      if (Number.isNaN(held)) cells[k] = what === 'none' ? -Infinity : v;
      else if (what === 'value' && v > held) cells[k] = v;
    }
  }
  return cells;
}

/** High's volume stores dBZ in one byte: code = round((dBZ + 32) * 2), 1 to 255 (dBZ -31.5 to 95.5 in half dBZ); 0 is no echo or no coverage. */
export const dbzCode = (dbz) => Math.min(255, Math.max(1, Math.round((dbz + 32) * 2)));
export const codeDbz = (code) => code / 2 - 32;

/**
 * One High height laid on the square's n x n cells (row 0 the north edge), each cell taking the 1 km value at its middle (the cells are about the grid's size, so
 * nothing is averaged). Returns { codes: Uint8Array (dbzCode, 0 for no echo or no coverage), covered: Uint8Array (1 where MRMS sees that height), coveredCells,
 * gridCells (cells on MRMS's grid) }.
 */
export function sampleLevel(read, grid, target) {
  const { n, halfFt } = target;
  const codes = new Uint8Array(n * n);
  const covered = new Uint8Array(n * n);
  if (!read.crop) return { codes, covered, coveredCells: 0, gridCells: 0 };
  const size = (2 * halfFt) / n;
  const ref = makeLocalRef(target.lat, target.lon);
  const colOf = new Int32Array(n);
  const rowOf = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    let { lon } = localFtToLatLon(ref, -halfFt + (i + 0.5) * size, 0);
    lon = ((lon % 360) + 360) % 360;
    const c = Math.floor((lon - grid.lo1) / grid.di + 0.5) - read.crop.col0;
    colOf[i] = c >= 0 && c < read.cols ? c : -1;
  }
  for (let j = 0; j < n; j++) {
    const { lat } = localFtToLatLon(ref, 0, halfFt - (j + 0.5) * size);
    const r = Math.floor((grid.la1 - lat) / grid.dj + 0.5) - read.crop.row0;
    rowOf[j] = r >= 0 && r < read.rows ? r : -1;
  }
  let coveredCells = 0;
  let gridCells = 0;
  for (let j = 0; j < n; j++) {
    const r = rowOf[j];
    if (r < 0) continue;
    for (let i = 0; i < n; i++) {
      const c = colOf[i];
      if (c < 0) continue;
      gridCells += 1;
      const what = classify(read.values[r * read.cols + c], 'dbz');
      if (what === 'gap' || what === 'bad') continue;
      covered[j * n + i] = 1;
      coveredCells += 1;
      if (what === 'value') codes[j * n + i] = dbzCode(read.values[r * read.cols + c]);
    }
  }
  return { codes, covered, coveredCells, gridCells };
}

/**
 * Everything the worker does to one file: read the window the square needs, check the file against what was asked (`product`, the time in its name), and lay it on
 * the square's cells ('bin' for Performance, 'level' for High). `readWindow` is grib2.js readGrib2Window. Returns { ok: true, time, kind: 'bin', cells } or
 * { ok: true, time, kind: 'level', codes, covered, coveredShare } or { ok: false, reason } (plain words).
 */
export async function decodeFile({ gz, product: p, nameTime, target, layout }, readWindow) {
  let read;
  try {
    // A grid that is not MRMS's is not read at all (no window); the whole file is checked below.
    read = await readWindow(gz, (grid) => (gridIsMrms(grid) ? cropFor(grid, squareBounds(target.lat, target.lon, target.halfFt)) : null));
  } catch (err) {
    return { ok: false, reason: err?.reason ?? 'file could not be read' };
  }
  const why = checkField(read.meta, p, nameTime);
  if (why) return { ok: false, reason: why };
  let bad = 0;
  for (let k = 0; k < read.values.length; k++) if (classify(read.values[k], p.kind) === 'bad') bad += 1;
  if (bad) return { ok: false, reason: `values out of range (${bad} cells)` };
  const time = +read.meta.time;
  if (layout === 'level') {
    const level = sampleLevel(read, read.meta.grid, target);
    return { ok: true, time, kind: 'level', codes: level.codes, covered: level.covered, coveredShare: level.gridCells ? level.coveredCells / level.gridCells : 0 };
  }
  return { ok: true, time, kind: 'bin', cells: binMax(read, read.meta.grid, target, p.kind) };
}

// ---- Drawing data ------------------------------------------------------------------------------------------------------

/** NOAA's MRMS colour for a dBZ (map-model.js MRMS_SCALE: 20 colours, -25 to 70 dBZ every 5 dBZ, each colour from its own value up to the next). [r, g, b] 0 to 255. */
export function dbzColour(dbz) {
  const k = Math.min(MRMS_SCALE.colours.length - 1, Math.max(0, Math.floor((dbz + 25) / 5)));
  const hex = MRMS_SCALE.colours[k];
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** No column is shorter than this above the ground (feet): an echo top at or under the ground still shows. An estimate for the look, as weather3d-model.js SHAFT_MIN_FT. */
export const COLUMN_MIN_FT = 600;

/**
 * Performance's columns (spec): each cell whose composite echo is MIN_DRAW_DBZ or more is one column from the ground to its 18 dBZ top, in the composite's colour;
 * where there is a 30 dBZ top the column has a core up to it. A cell with an echo but no 18 dBZ top (weaker than 18 dBZ) has no measured height: it is a flat
 * tile on the ground (`flat`). `set` is { n, halfFt, composite, top18, top30 } (binMax cells); `groundAt(x, y)` feet above sea level.
 * Returns { columns: [{ x, y, wFt, dFt, baseFt, topFt, coreTopFt | null, flat, dbz, colour }], gaps } with `gaps` the cells with no coverage.
 */
export function performanceColumns(set, { groundAt = /** @type {(x: number, y: number) => number} */ (() => 0) } = {}) {
  const { n, halfFt, composite, top18, top30 } = set;
  const size = (2 * halfFt) / n;
  const columns = [];
  let gaps = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const dbz = composite[k];
      if (Number.isNaN(dbz)) {
        gaps += 1;
        continue;
      }
      if (!(dbz >= MIN_DRAW_DBZ)) continue;
      const x = -halfFt + (i + 0.5) * size;
      const y = halfFt - (j + 0.5) * size;
      const ground = groundAt(x, y);
      const t18 = top18 ? top18[k] : NaN;
      const t30 = top30 ? top30[k] : NaN;
      const flat = !(t18 > 0);
      const topFt = flat ? ground : Math.max(kmToFt(t18), ground + COLUMN_MIN_FT);
      const coreTopFt = !flat && t30 > 0 ? Math.min(topFt, Math.max(kmToFt(t30), ground + COLUMN_MIN_FT)) : null;
      columns.push({ x, y, wFt: size, dFt: size, baseFt: ground, topFt, coreTopFt, flat, dbz, colour: dbzColour(dbz) });
    }
  }
  return { columns, gaps };
}

/**
 * High's volume as coarse columns for the approaches' corridor check (approaches-model.js reads blocks with x, y, wFt, dFt, baseFt, topFt, colour): the volume
 * (`codes`, n x n x levels, row 0 north, level by level) cut into `block` x `block` cells; each with an echo of MIN_DRAW_DBZ or more at any height is one block from
 * its lowest such height (the ground when that is the lowest level, as the drawing) to its highest, coloured by its strongest echo.
 */
export function volumeColumns({ n, halfFt, codes, levelsKm }, { block = 4, groundAt = /** @type {(x: number, y: number) => number} */ (() => 0) } = {}) {
  const size = (2 * halfFt) / n;
  const min = dbzCode(MIN_DRAW_DBZ);
  const out = [];
  const plane = n * n;
  for (let j0 = 0; j0 < n; j0 += block) {
    for (let i0 = 0; i0 < n; i0 += block) {
      let low = -1;
      let high = -1;
      let best = 0;
      for (let l = 0; l < levelsKm.length; l++) {
        let here = 0;
        for (let j = j0; j < Math.min(n, j0 + block); j++) {
          for (let i = i0; i < Math.min(n, i0 + block); i++) here = Math.max(here, codes[l * plane + j * n + i]);
        }
        if (here >= min) {
          if (low < 0) low = l;
          high = l;
          best = Math.max(best, here);
        }
      }
      if (low < 0) continue;
      const w = Math.min(block, n - i0) * size;
      const d = Math.min(block, n - j0) * size;
      const x = -halfFt + i0 * size + w / 2;
      const y = halfFt - j0 * size - d / 2;
      const ground = groundAt(x, y);
      const dbz = codeDbz(best);
      out.push({ x, y, wFt: w, dFt: d, baseFt: low === 0 ? ground : Math.max(ground, kmToFt(levelsKm[low])), topFt: Math.max(kmToFt(levelsKm[high]), ground + COLUMN_MIN_FT), dbz, colour: dbzColour(dbz) });
    }
  }
  return out;
}

/** The column coverage of a set laid out as n x n (row 0 north): 1 where MRMS sees that column (Performance: the composite is not -999; High: any height covered). */
export function coverageMask(set) {
  const { n } = set;
  const out = new Uint8Array(n * n);
  if (set.mode === 'high') {
    for (const level of set.covered) if (level) for (let k = 0; k < out.length; k++) out[k] |= level[k];
  } else {
    for (let k = 0; k < out.length; k++) out[k] = Number.isNaN(set.composite[k]) ? 0 : 1;
  }
  return out;
}

/** How much of the square lies north of MRMS's edge: the share of its height (0 when none), and the y in feet from home where the edge crosses it. */
export function northStrip(lat, lon, halfFt) {
  const ref = makeLocalRef(lat, lon);
  const y = latLonToLocalFt(ref, MRMS_NORTH_DEG, lon).y;
  if (y >= halfFt) return { share: 0, yFt: halfFt };
  return { share: Math.min(1, (halfFt - y) / (2 * halfFt)), yFt: Math.max(-halfFt, y) };
}

// ---- Words ---------------------------------------------------------------------------------------------------------

/** "Radar heights: NOAA MRMS, 0508Z (3 min ago)" (spec). */
export const heightsLine = (time, now) => `Radar heights: NOAA MRMS, ${hhmmZ(time)} (${Math.max(0, Math.floor((now - time) / 60_000))} min ago)`;
/** The fallback's words (spec). */
export const fallbackWords = (reason) => `Radar heights unavailable (NOAA MRMS: ${reason}), heights from model cloud`;
/** At a Canadian home, until the Moose Jaw comparison (plan item 6) is done (spec). */
export const CANADA_WORDS = 'MRMS over Canada: not yet checked against Canadian radar';
/** On the ground north of 55° N (spec). */
export const NORTH_WORDS = 'No MRMS radar north of 55° N';
/** "4 km and 10 km" for a list of heights. */
export const levelsWords = (kms) => (kms.length < 2 ? `${kms[0]} km` : `${kms.slice(0, -1).map((k) => `${k} km`).join(', ')} and ${kms.at(-1)} km`);
