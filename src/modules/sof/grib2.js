// Our own GRIB2 reader for NOAA MRMS's fields (SOF-67, SOF-R29; spec "3D view", "Radar with its real heights"; research in docs/modules/sof/radar-3d-research.md).
// No new library (rule book): the browser's own DecompressionStream unzips the .gz file ('gzip') and inflates the PNG inside it ('deflate'); the PNG's row filters
// are undone here. Pure: bytes in, numbers out; no page, no three.js, no network, so Node's own test runner can read a real file. mrms-worker.js runs it off the page.
//
// What it reads, and only that (WMO FM 92 GRIB edition 2, the public code tables; MRMS's own files as found on 14 Oct 2026, labelled V in the research):
// - Section 0: "GRIB", the discipline (MRMS uses 209, its local discipline) and edition 2.
// - Section 1: the reference time (the time the field is valid for).
// - Section 3: grid template 3.0, a regular latitude/longitude grid: Ni x Nj points, the first and last point, the step (MRMS: 7000 x 3500 at 0.01 degree,
//   first point 54.995 N 129.995 W, read north to south).
// - Section 4: product template 4.0: the parameter's category and number (which field it is), and the first fixed surface (MRMS: type 102, height above sea level
//   in metres, 500 for the 0.5 km echo tops and composite, 3000 for the 3 km level).
// - Section 5: data template 5.41, PNG packing: reference value R (32-bit float), binary scale E, decimal scale D, bits a value. Each value is
//   Y = (R + X * 2^E) / 10^D, X the PNG's grey level.
// - Section 6: no bitmap (indicator 255); a bitmap is refused.
// - Section 7: the PNG file itself (grey, 8 or 16 bits, not interlaced).
// A file that is anything else throws a Grib2Error with a reason in plain words, so the feed can say it.

/** Why a file could not be read: `reason` is plain words for the screen ("not GRIB2", "grid is not MRMS's", ...). */
export class Grib2Error extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'Grib2Error';
    this.reason = reason;
  }
}

const u16 = (b, o) => (b[o] << 8) | b[o + 1];
const u32 = (b, o) => ((b[o] << 24) >>> 0) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
/** GRIB2 signed integers are sign and magnitude: the top bit is the sign. */
const s16 = (b, o) => {
  const v = u16(b, o);
  return v & 0x8000 ? -(v & 0x7fff) : v;
};
const s32 = (b, o) => {
  const v = u32(b, o);
  return v >= 0x80000000 ? -(v - 0x80000000) : v;
};
const f32 = (b, o) => new DataView(b.buffer, b.byteOffset + o, 4).getFloat32(0, false);

/**
 * The sections of one GRIB2 message (the first in `bytes`, a Uint8Array of the unzipped file). Returns
 * { discipline, edition, time: Date, grid: { template, ni, nj, la1, lo1, la2, lo2, di, dj, scan }, product: { template, category, number, surfaceType, surfaceValue },
 *   packing: { template, points, R, E, D, bits }, png: Uint8Array (a view into `bytes`) }.
 * Latitudes and longitudes are degrees (longitudes as written, 0 to 360 east); `surfaceValue` is the surface's value with its scale applied (metres for type 102).
 * Throws Grib2Error for anything that is not a message this reader knows.
 */
export function parseGrib2(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 16) throw new Grib2Error('file too short');
  if (bytes[0] !== 0x47 || bytes[1] !== 0x52 || bytes[2] !== 0x49 || bytes[3] !== 0x42) throw new Grib2Error('not a GRIB file');
  const discipline = bytes[6];
  const edition = bytes[7];
  if (edition !== 2) throw new Grib2Error(`GRIB edition ${edition}, not 2`);
  // The total length is 8 bytes; MRMS files are a few megabytes, so the top 4 must be 0.
  if (u32(bytes, 8) !== 0) throw new Grib2Error('message too long');
  const total = u32(bytes, 12);
  if (total > bytes.length || total < 16) throw new Grib2Error('message cut short');
  const out = { discipline, edition, time: null, grid: null, product: null, packing: null, png: null };
  let o = 16;
  while (o + 4 <= total) {
    if (bytes[o] === 0x37 && bytes[o + 1] === 0x37 && bytes[o + 2] === 0x37 && bytes[o + 3] === 0x37) break; // "7777", the end
    if (o + 5 > total) throw new Grib2Error('section cut short');
    const length = u32(bytes, o);
    const number = bytes[o + 4];
    if (length < 5 || o + length > total) throw new Grib2Error(`section ${number} has a bad length`);
    const s = o; // octet n (1-based, as the code tables count) is bytes[s + n - 1]
    if (number === 1) {
      if (length < 19) throw new Grib2Error('section 1 too short');
      const t = Date.UTC(u16(bytes, s + 12), bytes[s + 14] - 1, bytes[s + 15], bytes[s + 16], bytes[s + 17], bytes[s + 18]);
      out.time = Number.isFinite(t) ? new Date(t) : null;
    } else if (number === 3) {
      const template = u16(bytes, s + 12);
      if (template !== 0) throw new Grib2Error(`grid template 3.${template}, not 3.0 (latitude and longitude)`);
      if (length < 72) throw new Grib2Error('section 3 too short');
      const basicAngle = u32(bytes, s + 38);
      const subdivisions = u32(bytes, s + 42);
      // Degrees are in millionths unless a basic angle is given (0 or "missing" means millionths).
      const unit = basicAngle === 0 || basicAngle === 0xffffffff || subdivisions === 0 || subdivisions === 0xffffffff ? 1e-6 : basicAngle / subdivisions;
      out.grid = {
        template,
        ni: u32(bytes, s + 30),
        nj: u32(bytes, s + 34),
        la1: s32(bytes, s + 46) * unit,
        lo1: s32(bytes, s + 50) * unit,
        la2: s32(bytes, s + 55) * unit,
        lo2: s32(bytes, s + 59) * unit,
        di: s32(bytes, s + 63) * unit,
        dj: s32(bytes, s + 67) * unit,
        scan: bytes[s + 71],
      };
    } else if (number === 4) {
      const template = u16(bytes, s + 7);
      if (template !== 0) throw new Grib2Error(`product template 4.${template}, not 4.0`);
      if (length < 28) throw new Grib2Error('section 4 too short');
      const scale = bytes[s + 23] >= 0x80 ? -(bytes[s + 23] & 0x7f) : bytes[s + 23];
      const scaled = s32(bytes, s + 24);
      out.product = { template, category: bytes[s + 9], number: bytes[s + 10], surfaceType: bytes[s + 22], surfaceValue: scaled / 10 ** scale };
    } else if (number === 5) {
      const template = u16(bytes, s + 9);
      if (template !== 41) throw new Grib2Error(`data template 5.${template}, not 5.41 (PNG)`);
      if (length < 21) throw new Grib2Error('section 5 too short');
      out.packing = { template, points: u32(bytes, s + 5), R: f32(bytes, s + 11), E: s16(bytes, s + 15), D: s16(bytes, s + 17), bits: bytes[s + 19] };
    } else if (number === 6) {
      if (bytes[s + 5] !== 255) throw new Grib2Error('the file has a bitmap, which this reader does not take');
    } else if (number === 7) {
      out.png = bytes.subarray(s + 5, s + length);
    }
    o += length;
  }
  if (!out.grid) throw new Grib2Error('no grid section');
  if (!out.product) throw new Grib2Error('no product section');
  if (!out.packing) throw new Grib2Error('no data template section');
  if (!out.png && out.packing.bits !== 0) throw new Grib2Error('no data section');
  return out;
}

/** The value of a packed number X: Y = (R + X * 2^E) / 10^D (GRIB2 data template 5.0 and 5.41). */
export function unpackValue(packing, x) {
  return (packing.R + x * 2 ** packing.E) / 10 ** packing.D;
}

/** The whole of a stream of Uint8Array chunks, joined, never more than `maxBytes` (throws Grib2Error past it). */
async function readAll(stream, maxBytes) {
  const reader = stream.getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Grib2Error('unzipped file too big');
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A ReadableStream of the given byte pieces, one chunk each. */
function streamOf(pieces) {
  let k = 0;
  return new ReadableStream({
    pull(controller) {
      if (k < pieces.length) controller.enqueue(pieces[k++]);
      else controller.close();
    },
  });
}

/** An MRMS GRIB2 file unzips to about 1.0 to 1.1 times its .gz size (the PNG inside is already packed); this cap is far above that. An estimate. */
export const MAX_UNZIPPED_BYTES = 16 * 1024 * 1024;

/** Unzips a .gz file (Uint8Array) with the browser's own DecompressionStream('gzip'). Throws Grib2Error when it is not gzip or unzips past `maxBytes`. */
export async function gunzip(bytes, maxBytes = MAX_UNZIPPED_BYTES) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 18 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Grib2Error('not a gzip file');
  try {
    return await readAll(streamOf([bytes]).pipeThrough(new DecompressionStream('gzip')), maxBytes);
  } catch (err) {
    if (err instanceof Grib2Error) throw err;
    throw new Grib2Error('the gzip file is damaged');
  }
}

/** The PNG's header and its compressed picture: { width, height, depth, colour, data: [Uint8Array] } (the IDAT pieces, in order). Throws Grib2Error. */
export function pngParts(png) {
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!png || png.length < 33 || SIG.some((v, k) => png[k] !== v)) throw new Grib2Error('the data section is not a PNG');
  let o = 8;
  let head = null;
  const data = [];
  while (o + 8 <= png.length) {
    const length = u32(png, o);
    const type = String.fromCharCode(png[o + 4], png[o + 5], png[o + 6], png[o + 7]);
    if (o + 12 + length > png.length) throw new Grib2Error('the PNG is cut short');
    const body = png.subarray(o + 8, o + 8 + length);
    if (type === 'IHDR') {
      head = { width: u32(body, 0), height: u32(body, 4), depth: body[8], colour: body[9], interlace: body[12] };
    } else if (type === 'IDAT') data.push(body);
    else if (type === 'IEND') break;
    o += 12 + length;
  }
  if (!head) throw new Grib2Error('the PNG has no header');
  if (head.colour !== 0 || (head.depth !== 8 && head.depth !== 16)) throw new Grib2Error('the PNG is not 8 or 16 bit grey');
  if (head.interlace !== 0) throw new Grib2Error('the PNG is interlaced');
  if (!data.length) throw new Grib2Error('the PNG has no picture');
  return { width: head.width, height: head.height, depth: head.depth, colour: head.colour, data };
}

/** Undoes one PNG row's filter in place (PNG specification, filter method 0: None, Sub, Up, Average, Paeth). `bpp` is bytes a pixel; `prev` the row above, unfiltered. */
export function unfilterRow(type, row, prev, bpp) {
  const n = row.length;
  if (type === 0) return;
  if (type === 1) {
    for (let i = bpp; i < n; i++) row[i] = (row[i] + row[i - bpp]) & 255;
  } else if (type === 2) {
    for (let i = 0; i < n; i++) row[i] = (row[i] + prev[i]) & 255;
  } else if (type === 3) {
    for (let i = 0; i < bpp; i++) row[i] = (row[i] + (prev[i] >> 1)) & 255;
    for (let i = bpp; i < n; i++) row[i] = (row[i] + ((row[i - bpp] + prev[i]) >> 1)) & 255;
  } else if (type === 4) {
    for (let i = 0; i < bpp; i++) row[i] = (row[i] + prev[i]) & 255; // a = c = 0 at the left edge, so Paeth picks b
    for (let i = bpp; i < n; i++) {
      const a = row[i - bpp];
      const b = prev[i];
      const c = prev[i - bpp];
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      row[i] = (row[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
    }
  } else throw new Grib2Error(`the PNG has an unknown row filter (${type})`);
}

/**
 * Reads the grey levels of rows `row0` to `row1` (inclusive, 0 the first row) and columns `col0` to `col1` of a PNG made of `parts` (pngParts), inflating it with
 * DecompressionStream('deflate') a piece at a time and stopping as soon as row `row1` is read, so a crop near the top never inflates the rest. Returns a Uint16Array
 * (rows x cols, row by row) of the levels X.
 */
export async function readPngWindow(parts, { row0, row1, col0, col1 }) {
  const { width, height, depth, data } = parts;
  if (!(row0 >= 0 && row1 >= row0 && row1 < height && col0 >= 0 && col1 >= col0 && col1 < width)) throw new Grib2Error('the crop is outside the picture');
  const bpp = depth / 8; // grey only: 1 or 2 bytes a pixel
  const stride = width * bpp;
  const cols = col1 - col0 + 1;
  const out = new Uint16Array((row1 - row0 + 1) * cols);
  let row = new Uint8Array(stride);
  let prev = new Uint8Array(stride); // the row above the first is all zero (PNG specification)
  let filter = -1; // the current row's filter byte, -1 until it has arrived
  let fill = 0; // bytes of the current row so far
  let y = 0;
  const reader = streamOf(data).pipeThrough(new DecompressionStream('deflate')).getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      let k = 0;
      while (k < value.length) {
        if (filter < 0) {
          filter = value[k++];
          continue;
        }
        const take = Math.min(stride - fill, value.length - k);
        row.set(value.subarray(k, k + take), fill);
        fill += take;
        k += take;
        if (fill < stride) continue;
        unfilterRow(filter, row, prev, bpp);
        if (y >= row0) {
          const base = (y - row0) * cols;
          if (bpp === 2) for (let c = 0; c < cols; c++) out[base + c] = (row[(col0 + c) * 2] << 8) | row[(col0 + c) * 2 + 1];
          else for (let c = 0; c < cols; c++) out[base + c] = row[col0 + c];
        }
        if (y === row1) {
          await reader.cancel().catch(() => {});
          return out;
        }
        [row, prev] = [prev, row];
        filter = -1;
        fill = 0;
        y += 1;
      }
    }
  } catch (err) {
    if (err instanceof Grib2Error) throw err;
    throw new Grib2Error('the PNG picture is damaged');
  }
  throw new Grib2Error('the PNG picture ends early');
}

/**
 * The grid cell (row from the north edge, column from the west edge) a latitude and longitude falls in, for grid template 3.0 read north to south and west to east
 * (MRMS's scanning mode 0); longitudes may be given -180 to 180 or 0 to 360. Fractional: Math.floor gives the cell, and a value outside 0..nj-1 / 0..ni-1 is off the grid.
 */
export function gridIndex(grid, lat, lon) {
  const east = ((lon % 360) + 360) % 360;
  return { row: (grid.la1 - lat) / grid.dj + 0.5, col: (east - grid.lo1) / grid.di + 0.5 };
}

/**
 * Reads one GRIB2 .gz file's values over a window: `gz` the file's bytes, `crop` { row0, row1, col0, col1 } in grid cells, or a function (grid) => crop | null
 * (null: the window misses the grid; then no picture is read). Returns { meta: parseGrib2's result without the PNG, crop, rows, cols, values: Float32Array
 * (rows x cols, north row first) }. The values are Y = (R + X * 2^E) / 10^D. Throws Grib2Error.
 */
export async function readGrib2Window(gz, crop) {
  const bytes = gz[0] === 0x1f && gz[1] === 0x8b ? await gunzip(gz) : gz;
  const meta = parseGrib2(bytes);
  const window = typeof crop === 'function' ? crop(meta.grid) : crop;
  const { png, ...rest } = meta;
  if (!window) return { meta: rest, crop: null, rows: 0, cols: 0, values: new Float32Array(0) };
  const rows = window.row1 - window.row0 + 1;
  const cols = window.col1 - window.col0 + 1;
  const values = new Float32Array(rows * cols);
  if (meta.packing.bits === 0) {
    values.fill(unpackValue(meta.packing, 0)); // a field of one value has no picture (data template 5.41 with no bits)
  } else {
    const parts = pngParts(png);
    if (parts.width !== meta.grid.ni || parts.height !== meta.grid.nj) throw new Grib2Error('the PNG is not the size of the grid');
    const levels = await readPngWindow(parts, window);
    const { R, E, D } = meta.packing;
    const step = 2 ** E;
    const div = 10 ** D;
    for (let k = 0; k < levels.length; k++) values[k] = (R + levels[k] * step) / div;
  }
  return { meta: rest, crop: window, rows, cols, values };
}
