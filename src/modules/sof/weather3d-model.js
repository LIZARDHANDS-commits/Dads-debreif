// What the SOF's 3D weather layers draw, decided without a page or three.js (SPEC-sof, "3D view", SOF-39, SOF-42; Dad, 7 Oct "weather that looks right in 3D"): the radar
// pictures read into precipitation shafts, the lightning picture into bolts, the satellite picture into a faint cloud sheet's pixels, the surface fronts into lines,
// symbols, walls and pressure marks on the ground, and the model winds into a field of drifting streaks. Pure: pixels, model data and numbers go in, plain data comes out;
// weather3d.js draws it and view3d.js puts it in the view.
//
// Every height here that is not from the model is an estimate and is labelled so wherever it is shown (the key in view3d.js):
//   a radar block with no model cloud over it stands from the ground to RADAR_DEFAULT_AGL_FT; a bolt with none reaches LIGHTNING_DEFAULT_AGL_FT; the satellite sheet with no model cloud
//   lies at SATELLITE_DEFAULT_FT; a front's wall is FRONT_WALL_FT tall. None of this is a measurement; it is a picture for situational awareness and checks no limit.
//
// World frame as view3d.js: X east, Y north, Z up, in the map's local feet; heights are feet above sea level (the view multiplies them by the height scale).
import { AREA_FT } from './scene3d-model.js';
import { FT_PER_NM } from './map-view.js';

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

// ---- Pictures read on a grid of cells -----------------------------------------------------------------------

/**
 * The radar and lightning pictures are read on a CELL_PX by CELL_PX grid over the square (450 / 96 = 4.7 NM a cell; 6.25 NM at 600 NM, 9.4 NM at 900). An estimate for the
 * detail a shaft needs. `cellFt()` is a cell's width for the 3D area in force.
 */
export const CELL_PX = 96;
export const cellFt = () => AREA_FT / CELL_PX;
/** A cell is precipitation or lightning when its pixel is at least this opaque (0 to 1) once the picture is shrunk to the grid. An estimate. */
export const CELL_MIN_ALPHA = 0.25;
/**
 * Most radar blocks and most bolts drawn at once (each is one box). Neighbouring radar cells are merged into blocks first (`mergeShafts`), so the cap is a last resort: past it
 * the blocks are thinned evenly, never the strongest dropped first. 1000 blocks (with their curtains, 2000 boxes) is about half the drawing of V2.196's 1800 single cells,
 * which Dad found heavy (8 Oct 2026: "the radar blocks are heavy on processing"). Estimates for the drawing's sake.
 */
export const MAX_SHAFTS = 1000; // estimate
export const MAX_BOLTS = 600;
/**
 * Neighbouring radar cells of the same colour are drawn as one block when their cloud bases are all within this of each other, and their tops likewise (feet). Under the
 * shared table's 100 ft it would merge almost nothing over sloping model cloud; at 500 ft a block's base and top are each within 250 ft of every cell's own. An estimate
 * for the drawing's sake (Fable review, 8 Oct 2026).
 */
export const SHAFT_MERGE_FT = 500; // estimate
/** Where a radar block ends with no model cloud over it (feet above the ground: it then stands on the ground), and how high a bolt reaches with none. Estimates, SOF-39. */
export const RADAR_DEFAULT_AGL_FT = 8000; // estimate
export const LIGHTNING_DEFAULT_AGL_FT = 25_000; // estimate
/** No radar block is thinner than this (a thin slab, or one cloud level in the old "levels" style, still shows): feet. An estimate for the look. */
export const SHAFT_MIN_FT = 600; // estimate
/** The satellite sheet lies at the highest model cloud level present, or here with no model cloud (feet above sea level). An estimate, SOF-39. */
export const SATELLITE_DEFAULT_FT = 30_000; // estimate
/** The satellite sheet's greatest opacity where the picture is brightest: faint (Dad, 7 Oct). An estimate for the look. */
export const SATELLITE_ALPHA_MAX = 0.5; // estimate

/**
 * The cells of a picture that has been drawn onto a CELL_PX square canvas laid over the whole area (`image` is { data, width, height } as getImageData gives, row 0 the
 * north edge): [{ x, y, u, v, r, g, b, a }] for each cell at least `minAlpha` opaque, with x and y the cell's middle in feet from home, u and v 0 to 1 across the square
 * (west to east, south to north) and a 0 to 1. Returns [] for anything that is not the expected size.
 */
export function pictureCells(image, { minAlpha = CELL_MIN_ALPHA } = {}) {
  if (!image || image.width !== CELL_PX || image.height !== CELL_PX || !image.data || image.data.length !== CELL_PX * CELL_PX * 4) return [];
  const out = [];
  const { data } = image;
  for (let row = 0; row < CELL_PX; row++) {
    for (let col = 0; col < CELL_PX; col++) {
      const n = (row * CELL_PX + col) * 4;
      const a = data[n + 3] / 255;
      if (a < minAlpha) continue;
      const u = (col + 0.5) / CELL_PX;
      const v = 1 - (row + 0.5) / CELL_PX;
      out.push({ x: (u - 0.5) * AREA_FT, y: (v - 0.5) * AREA_FT, u, v, r: data[n], g: data[n + 1], b: data[n + 2], a });
    }
  }
  return out;
}

/**
 * A picture drawn at `factor` times the grid's size (factor * CELL_PX pixels square, as getImageData gives) reduced to the CELL_PX grid: each cell takes its strongest
 * pixel (the most opaque `accept` pixel; its colour and opacity), so a thin echo or a single lit lightning cell is never averaged away. `accept(r, g, b, a)` says which
 * pixels count (radar: any that are not see-through; lightning: the yellow fill of the 2D mark, not its dark outline). Returns { data, width, height } for `pictureCells`.
 */
export function reduceToCells(image, factor, accept = (_r, _g, _b, a) => a > 0) {
  const side = CELL_PX * factor;
  const out = new Uint8ClampedArray(CELL_PX * CELL_PX * 4);
  if (!image || image.width !== side || image.height !== side || !image.data || image.data.length !== side * side * 4) return { data: out, width: CELL_PX, height: CELL_PX };
  const { data } = image;
  for (let row = 0; row < CELL_PX; row++) {
    for (let col = 0; col < CELL_PX; col++) {
      let best = -1;
      let bestA = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const n = ((row * factor + dy) * side + col * factor + dx) * 4;
          const a = data[n + 3];
          if (a > bestA && accept(data[n], data[n + 1], data[n + 2], a)) {
            best = n;
            bestA = a;
          }
        }
      }
      if (best < 0) continue;
      const o = (row * CELL_PX + col) * 4;
      out[o] = data[best];
      out[o + 1] = data[best + 1];
      out[o + 2] = data[best + 2];
      out[o + 3] = bestA;
    }
  }
  return { data: out, width: CELL_PX, height: CELL_PX };
}

/** The reading grid is drawn at this many pixels a cell each way before it is reduced (4 x 4 = 16 pixels a cell). */
export const CELL_SUPERSAMPLE = 4;
/** The satellite sheet's picture is this many pixels across (about 1.4 NM a pixel over 450 NM). */
export const SATELLITE_PX = 1024;

/** An even thinning to at most `max` items, keeping their order. */
export function thin(list, max) {
  if (list.length <= max) return list;
  const out = [];
  for (let k = 0; k < max; k++) out.push(list[Math.floor((k * list.length) / max)]);
  return out;
}

/**
 * The radar blocks (Dad, 8 Oct 2026: "can they sit at the cloud altitudes rather than straight touching the ground"): each radar cell stands in the model
 * cloud over it, from its base to its top (`column(u, v)` gives { baseFt, topFt } above sea level or null: cloud-field.js `slabColumnAt` with slabs, the lowest
 * slab with cover there; model-clouds.js `cloudColumnAt` with the old level sheets). The lowest cloud is taken, not the deepest, because precipitation falls
 * out of the lowest cloud's base, and a slab is one unbroken run of cloud, so a deep shower cloud is already one slab from its base to its top.
 * Under a block's base, with `rainToGround` (on by default), a faint rain curtain stands from the ground to the base, so it still reads as precipitation reaching
 * the surface (the radar does not say whether it does: virga is not told apart). With no model cloud over a return the block stands from the ground to
 * RADAR_DEFAULT_AGL_FT above it, as before, and has no curtain.
 * Neighbouring cells of the same colour and cloud heights are then merged into one wider block (`mergeShafts`, Dad 8 Oct 2026: "the radar blocks are heavy on
 * processing. can we simplify if need"), and only past `max` blocks are they thinned.
 * `groundFt` is the ground the view draws; `groundAt(x, y)` (feet above sea level) gives the real terrain under a cell when the view has it, else every cell
 * stands on `groundFt`. `colourTol` (0 to 255 a channel) lets nearly equal colours merge. Returns [{ x, y (the block's middle), wFt (east-west), dFt
 * (north-south), cells, baseFt, topFt, colour: [r, g, b] 0-255, alpha (the radar's own opacity), modelTop: whether the model cloud gave the heights,
 * rain: null or { baseFt (the ground), topFt (the block's base) } }], at most `max`.
 */
export function shafts(cells, { column = /** @type {(u: number, v: number) => any} */ (() => null), groundFt = 0, groundAt = /** @type {(x: number, y: number) => number} */ (() => groundFt), max = MAX_SHAFTS, rainToGround = true, tolFt = SHAFT_MERGE_FT, colourTol = 0 } = {}) {
  const each = cells.map((c) => {
    const cloud = column(c.u, c.v);
    const ground = groundAt(c.x, c.y);
    const colour = [c.r, c.g, c.b];
    if (!cloud || !isNumber(cloud.baseFt)) {
      return { x: c.x, y: c.y, groundFt: ground, baseFt: ground, topFt: ground + RADAR_DEFAULT_AGL_FT, colour, alpha: c.a, modelTop: false, rain: null };
    }
    const base = Math.max(cloud.baseFt, ground);
    const top = Math.max(isNumber(cloud.topFt) ? cloud.topFt : base, base + SHAFT_MIN_FT);
    const rain = rainToGround && base > ground ? { baseFt: ground, topFt: base } : null;
    return { x: c.x, y: c.y, groundFt: ground, baseFt: base, topFt: top, colour, alpha: c.a, modelTop: true, rain };
  });
  return thin(mergeShafts(each, { cell: cellFt(), tolFt, colourTol }), max);
}

/**
 * Neighbouring radar cells merged into rectangular blocks (Fable review, 8 Oct 2026). `list` is one item a cell, on a grid `cell` feet square: { x, y, baseFt, topFt,
 * colour, alpha, modelTop, rain, groundFt? }. First each row (west to east) is cut into runs of side-by-side cells with the same colour (each channel within
 * `colourTol`), both from the model cloud or both not, both with a rain curtain or both without, and every base within `tolFt` of the others (and every top likewise);
 * then a run is joined to the run just north of it when they span the same columns and the joined cells still agree the same way. Each rectangle is one block: its
 * middle, `wFt` and `dFt` (a lone cell: both `cell`), `cells` merged, the mean base and top, the first cell's colour, the strongest alpha, and a curtain from the lowest
 * ground under it (so it reaches the ground everywhere) to the block's base. The order is north to south, west to east.
 */
export function mergeShafts(list, { cell = cellFt(), tolFt = SHAFT_MERGE_FT, colourTol = 0 } = {}) {
  if (!list.length) return [];
  const [x0, y0] = [list[0].x, list[0].y];
  const rows = new Map(); // row index (north is lower) -> [{ col, s }]
  for (const s of list) {
    const row = Math.round((y0 - s.y) / cell);
    const col = Math.round((s.x - x0) / cell);
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row).push({ col, s });
  }
  const sameColour = (a, b) => a.every((c, k) => Math.abs(c - b[k]) <= colourTol);
  // A group of cells being merged: its spread of bases and tops, and what every one of its cells must share.
  const groupOf = (s) => ({ colour: s.colour, modelTop: s.modelTop, wet: Boolean(s.rain), lowBase: s.baseFt, highBase: s.baseFt, lowTop: s.topFt, highTop: s.topFt, items: [s] });
  const agrees = (g, h) => sameColour(g.colour, h.colour) && g.modelTop === h.modelTop && g.wet === h.wet
    && Math.max(g.highBase, h.highBase) - Math.min(g.lowBase, h.lowBase) <= tolFt && Math.max(g.highTop, h.highTop) - Math.min(g.lowTop, h.lowTop) <= tolFt;
  const join = (g, h) => {
    g.lowBase = Math.min(g.lowBase, h.lowBase);
    g.highBase = Math.max(g.highBase, h.highBase);
    g.lowTop = Math.min(g.lowTop, h.lowTop);
    g.highTop = Math.max(g.highTop, h.highTop);
    for (const s of h.items) g.items.push(s);
  };
  const rects = [];
  let open = new Map(); // "first col,last col" -> the rectangle ending on the row above
  let lastRow = null;
  for (const row of [...rows.keys()].sort((a, b) => a - b)) {
    const line = rows.get(row).sort((a, b) => a.col - b.col);
    const runs = [];
    for (const { col, s } of line) {
      const run = runs.at(-1);
      const g = groupOf(s);
      if (run && col === run.c1 + 1 && agrees(run.g, g)) {
        join(run.g, g);
        run.c1 = col;
      } else runs.push({ c0: col, c1: col, g });
    }
    const above = lastRow !== null && row === lastRow + 1 ? open : new Map();
    const next = new Map();
    for (const run of runs) {
      const key = `${run.c0},${run.c1}`;
      const rect = above.get(key);
      if (rect && agrees(rect.g, run.g)) {
        join(rect.g, run.g);
        rect.r1 = row;
        above.delete(key);
        next.set(key, rect);
      } else {
        const fresh = { c0: run.c0, c1: run.c1, r0: row, r1: row, g: run.g };
        rects.push(fresh);
        next.set(key, fresh);
      }
    }
    open = next;
    lastRow = row;
  }
  return rects.map(({ c0, c1, r0, r1, g }) => {
    const n = g.items.length;
    const mean = (pick) => g.items.reduce((sum, s) => sum + pick(s), 0) / n;
    const baseFt = mean((s) => s.baseFt);
    const topFt = mean((s) => s.topFt);
    const first = g.items[0];
    const ground = Math.min(...g.items.map((s) => (s.rain ? s.rain.baseFt : isNumber(s.groundFt) ? s.groundFt : s.baseFt)));
    return {
      x: x0 + ((c0 + c1) / 2) * cell,
      y: y0 - ((r0 + r1) / 2) * cell,
      wFt: (c1 - c0 + 1) * cell,
      dFt: (r1 - r0 + 1) * cell,
      cells: n,
      baseFt,
      topFt,
      colour: first.colour,
      alpha: Math.max(...g.items.map((s) => s.alpha)),
      modelTop: first.modelTop,
      rain: g.wet ? { baseFt: ground, topFt: baseFt } : null,
    };
  });
}

/** The lightning bolts: one per lit cell, from the ground to the model cloud top above it, or LIGHTNING_DEFAULT_AGL_FT above the ground with none. At most MAX_BOLTS. `groundAt` as for `shafts`. */
export function bolts(cells, { column = /** @type {(u: number, v: number) => any} */ (() => null), groundFt = 0, groundAt = /** @type {(x: number, y: number) => number} */ (() => groundFt), max = MAX_BOLTS } = {}) {
  return thin(cells, max).map((c) => {
    const cloud = column(c.u, c.v);
    const ground = groundAt(c.x, c.y);
    const top = cloud && isNumber(cloud.topFt) && cloud.topFt > ground + 2000 ? cloud.topFt : ground + LIGHTNING_DEFAULT_AGL_FT;
    return { x: c.x, y: c.y, baseFt: ground, topFt: top, modelTop: Boolean(cloud) };
  });
}

/**
 * The satellite picture as a faint cloud sheet's pixels: `image` is { data, width, height } (the GOES picture drawn onto a canvas over the area). Bright pixels (cloud, in the
 * visible by day and the enhanced infrared by night) become white and see-through at up to SATELLITE_ALPHA_MAX; dark ones (the ground, the clear sky) are fully clear. The
 * brightness runs from LOW (clear) to HIGH (full), by luma. Returns { data: Uint8ClampedArray (RGBA), drawn } with `drawn` false when nothing is bright.
 */
export const SATELLITE_LUMA = Object.freeze({ low: 0.7, high: 0.92 }); // estimate, from a night infrared picture (clear ground about 0.65, cloud 0.8 and up) and a day one (ground under 0.5)
export function satellitePixels(image) {
  if (!image || !image.data || image.data.length !== image.width * image.height * 4) return { data: new Uint8ClampedArray(0), drawn: false };
  const out = new Uint8ClampedArray(image.data.length);
  let drawn = false;
  for (let n = 0; n < image.data.length; n += 4) {
    const luma = (0.2126 * image.data[n] + 0.7152 * image.data[n + 1] + 0.0722 * image.data[n + 2]) / 255;
    const t = Math.min(1, Math.max(0, (luma - SATELLITE_LUMA.low) / (SATELLITE_LUMA.high - SATELLITE_LUMA.low)));
    const alpha = (image.data[n + 3] / 255) * SATELLITE_ALPHA_MAX * t * t * (3 - 2 * t);
    out[n] = 250;
    out[n + 1] = 252;
    out[n + 2] = 255;
    out[n + 3] = Math.round(alpha * 255);
    if (alpha > 0.02) drawn = true;
  }
  return { data: out, drawn };
}

// ---- Fronts ------------------------------------------------------------------------------------------------------

/** The line colours (the standard weather-map colours; the symbols match, and the words are always in the key). */
export const FRONT_COLOURS = Object.freeze({ cold: '#4aa8ff', warm: '#ff5a4d', occluded: '#b678ff', trough: '#e0a050' });
/** The wall along a front is this tall, feet above the ground (Dad, 7 Oct: 6,000 ft). An estimate, not a measurement of the front's depth. */
export const FRONT_WALL_FT = 6000; // estimate
/** A front's line is this wide on the ground, its symbols this big and this far apart (feet). An estimate for readability over 450 NM. */
export const FRONT_LINE_FT = 9000;
export const SYMBOL_FT = 12 * FT_PER_NM;
export const SYMBOL_SPACING_FT = 42 * FT_PER_NM;
/** A trough is drawn dashed: a dash and a gap, feet. */
export const TROUGH_DASH_FT = /** @type {[number, number]} */ ([22 * FT_PER_NM, 12 * FT_PER_NM]);
/** Each segment between the bulletin's points is cut into this many pieces by a smooth curve, so a front is not drawn as a zigzag of 60 NM sides. */
const CURVE_PIECES = 6;
/** Pressure marks further than this (a share of the half width) from the middle are left off, so a label is never on the edge. */
const EDGE_SHARE = 0.96;

/**
 * Points through a smooth curve (Catmull-Rom between the points, the end points repeated), `pieces` to each segment. [[x, y], ...] in, the same out.
 */
export function smoothLine(points, pieces = CURVE_PIECES) {
  if (points.length < 3) return points.map((p) => [...p]);
  const at = (k) => points[Math.min(points.length - 1, Math.max(0, k))];
  const out = [];
  for (let k = 0; k < points.length - 1; k++) {
    const [p0, p1, p2, p3] = [at(k - 1), at(k), at(k + 1), at(k + 2)];
    for (let s = 0; s < pieces; s++) {
      const t = s / pieces;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([0, 1].map((d) => 0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  out.push([...points.at(-1)]);
  return out;
}

/** The part of a segment inside the square of half-width `half` (Liang-Barsky), or null when none of it is. */
export function clipSegment(a, b, half) {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] + half], [dx, half - a[0]], [-dy, a[1] + half], [dy, half - a[1]]]) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]];
}

/** A polyline cut to the square: the pieces that lie inside it, each a list of points (a front that leaves and comes back is two pieces). */
export function clipLine(points, half) {
  const pieces = [];
  let current = null;
  for (let k = 0; k < points.length - 1; k++) {
    const seg = clipSegment(points[k], points[k + 1], half);
    if (!seg) {
      current = null;
      continue;
    }
    const [from, to] = seg;
    const joins = current && Math.hypot(current.at(-1)[0] - from[0], current.at(-1)[1] - from[1]) < 1;
    if (joins) current.push(to);
    else {
      current = [from, to];
      pieces.push(current);
    }
  }
  return pieces;
}

/** Points along a polyline every `spacing` feet (starting half a spacing in), each { x, y, dx, dy } with (dx, dy) the unit direction of the line there. */
export function alongLine(points, spacing) {
  const out = [];
  let travelled = 0;
  let next = spacing / 2;
  for (let k = 0; k < points.length - 1; k++) {
    const [a, b] = [points[k], points[k + 1]];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length === 0) continue;
    const [dx, dy] = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    while (next <= travelled + length) {
      const s = next - travelled;
      out.push({ x: a[0] + dx * s, y: a[1] + dy * s, dx, dy });
      next += spacing;
    }
    travelled += length;
  }
  return out;
}

/** A dashed line: the pieces of a polyline `dash` feet long with `gap` between them, each a straight [[x, y], [x, y]]. */
export function dashes(points, [dash, gap]) {
  const out = [];
  let drawing = true;
  let left = dash;
  for (let k = 0; k < points.length - 1; k++) {
    const [a, b] = [points[k], points[k + 1]];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let at = 0;
    while (at < length) {
      const step = Math.min(left, length - at);
      if (drawing) {
        const f0 = at / length;
        const f1 = (at + step) / length;
        out.push([[a[0] + (b[0] - a[0]) * f0, a[1] + (b[1] - a[1]) * f0], [a[0] + (b[0] - a[0]) * f1, a[1] + (b[1] - a[1]) * f1]]);
      }
      at += step;
      left -= step;
      if (left <= 1e-6) {
        drawing = !drawing;
        left = drawing ? dash : gap;
      }
    }
  }
  return out;
}

/**
 * Which side of a line the symbols stand on: the bulletin gives the points in order but not which way the front moves, so the side is taken from the usual way each kind
 * moves across North America (an inference, said in the key): cold fronts towards the south-east, warm fronts towards the north-east, occluded fronts towards the east, and a
 * stationary front's triangles (cold air) towards the south-east with its half circles on the other side. Returns the unit normal (nx, ny) to put the symbol on.
 */
export const SYMBOL_HEADING = Object.freeze({ COLD: [0.8, -0.6], WARM: [0.5, 0.86], OCFNT: [0.96, 0.28], STNRY: [0.8, -0.6] });
export function symbolNormal(type, dx, dy, flip = false) {
  const heading = SYMBOL_HEADING[type] ?? [1, 0];
  const left = [-dy, dx];
  const side = left[0] * heading[0] + left[1] * heading[1] >= 0 ? 1 : -1;
  return [left[0] * side * (flip ? -1 : 1), left[1] * side * (flip ? -1 : 1)];
}

/**
 * Everything a front is drawn from, in feet from home: `data` is fronts.js `readFronts`, `toXY(lat, lon)` the map's projection, `halfFt` the square's half width.
 * Returns { lines: [{ type, colour, kind, segments: [[[x, y], [x, y]], ...] }], symbols: [{ shape: 'tri' | 'semi', colour, x, y, nx, ny, dx, dy }], marks: [{ kind: 'H' | 'L', hPa, x, y, text }],
 * counts: { fronts, drawn } }. `segments` are the pieces to lay as ribbons (a trough's are its dashes, a stationary front's alternate cold and warm colour); only what lies inside the
 * square is kept. A trough has no symbols.
 */
export function frontGeometry(data, { toXY, halfFt = AREA_FT / 2 } = /** @type {any} */ ({})) {
  const lines = [];
  const symbols = [];
  let drawn = 0;
  for (const front of data.fronts) {
    const xy = front.points.map(([lat, lon]) => toXY(lat, lon));
    const pieces = clipLine(smoothLine(xy), halfFt);
    if (!pieces.length) continue;
    drawn += 1;
    const colour = { COLD: FRONT_COLOURS.cold, WARM: FRONT_COLOURS.warm, OCFNT: FRONT_COLOURS.occluded, STNRY: FRONT_COLOURS.cold, TROF: FRONT_COLOURS.trough }[front.type];
    const segments = [];
    const coloured = [];
    for (const piece of pieces) {
      if (front.type === 'TROF') {
        for (const d of dashes(piece, TROUGH_DASH_FT)) segments.push(d);
        continue;
      }
      for (let k = 0; k < piece.length - 1; k++) {
        segments.push([piece[k], piece[k + 1]]);
        // A stationary front alternates blue and red along its length, a piece at a time.
        if (front.type === 'STNRY') coloured.push(Math.floor((k * 1) / 4) % 2 === 0 ? FRONT_COLOURS.cold : FRONT_COLOURS.warm);
      }
      alongLine(piece, SYMBOL_SPACING_FT).forEach((p, n) => {
        if (front.type === 'COLD') symbols.push({ shape: 'tri', colour: FRONT_COLOURS.cold, ...p, ...pickNormal('COLD', p, false) });
        else if (front.type === 'WARM') symbols.push({ shape: 'semi', colour: FRONT_COLOURS.warm, ...p, ...pickNormal('WARM', p, false) });
        else if (front.type === 'OCFNT') symbols.push({ shape: n % 2 === 0 ? 'tri' : 'semi', colour: FRONT_COLOURS.occluded, ...p, ...pickNormal('OCFNT', p, false) });
        else if (front.type === 'STNRY') symbols.push(n % 2 === 0
          ? { shape: 'tri', colour: FRONT_COLOURS.cold, ...p, ...pickNormal('STNRY', p, false) }
          : { shape: 'semi', colour: FRONT_COLOURS.warm, ...p, ...pickNormal('STNRY', p, true) });
      });
    }
    lines.push({ type: front.type, colour, segments, colours: front.type === 'STNRY' ? coloured : null });
  }
  const marks = [];
  const reach = halfFt * EDGE_SHARE;
  for (const [kind, list] of [['H', data.highs], ['L', data.lows]]) {
    for (const c of list) {
      const [x, y] = toXY(c.lat, c.lon);
      if (Math.abs(x) > reach || Math.abs(y) > reach) continue;
      marks.push({ kind, hPa: c.hPa, x, y, text: `${kind} ${c.hPa}` });
    }
  }
  return { lines, symbols, marks, counts: { fronts: data.fronts.length, drawn } };
}

const pickNormal = (type, p, flip) => {
  const [nx, ny] = symbolNormal(type, p.dx, p.dy, flip);
  return { nx, ny };
};

// ---- The gentle wind flow (Windy-style streaks, Dad 7 Oct) ------------------------------------------------------------

/** About this many streaks in all, shared by the three levels (850, 700 and 500 hPa). "A few hundred particles total" (Dad, 7 Oct). */
export const FLOW_PARTICLES = 300;
/**
 * How fast a streak drifts: feet a second for each knot of wind. Real air at 50 kt covers 84 ft a second, which cannot be seen across 450 NM; this makes 50 kt cross the
 * square in about 90 seconds (the streaks' speed follows the wind, never its true size). An estimate for feel, SOF-39.
 */
export const FLOW_FT_PER_S_PER_KT = 600; // estimate
/** A streak is its head and a tail this many seconds of drift long (at least FLOW_TAIL_MIN_FT), and lives LIFE seconds, fading in and out. Estimates for feel. */
export const FLOW_TAIL_S = 4;
export const FLOW_TAIL_MIN_FT = 8 * FT_PER_NM;
export const FLOW_LIFE_S = [6, 12];
/** With reduced motion the streaks step this often (milliseconds) rather than gliding (Dad, 7 Oct). */
export const FLOW_STEP_MS = 2000;

/**
 * A field of drifting streaks over `grids` ([{ grid: windGrid, heightFt }]). `random` is Math.random (or a test's). Returns { particles, step(dtS) } where `particles` is
 * [{ level, x, y, age, life, tx, ty, fade }] (tx and ty are the tail's offset from the head, feet) and step(dtS) moves every one along its level's wind, respawning any whose
 * life is over, that left the square or that has no wind where it is. The count is split evenly over the levels.
 */
export function createFlow(grids, { count = FLOW_PARTICLES, random = Math.random, sample, halfFt = AREA_FT / 2 } = /** @type {any} */ ({})) {
  const particles = [];
  const per = grids.length ? Math.floor(count / grids.length) : 0;
  const spawn = (p) => {
    p.x = (random() * 2 - 1) * halfFt;
    p.y = (random() * 2 - 1) * halfFt;
    p.life = FLOW_LIFE_S[0] + random() * (FLOW_LIFE_S[1] - FLOW_LIFE_S[0]);
    p.age = 0;
  };
  grids.forEach((_, level) => {
    for (let k = 0; k < per; k++) {
      const p = { level, x: 0, y: 0, age: 0, life: 1, tx: 0, ty: 0, fade: 0 };
      spawn(p);
      p.age = random() * p.life; // start part-way through, so they are not all new at once
      particles.push(p);
    }
  });
  const readWind = (p) => sample(grids[p.level].grid, p.x, p.y);
  function place(p) {
    const w = readWind(p);
    if (!w) return false;
    const scale = FLOW_FT_PER_S_PER_KT;
    const speed = Math.max(w.kt, 0.1);
    const tail = Math.max(FLOW_TAIL_MIN_FT, w.kt * scale * FLOW_TAIL_S);
    p.tx = -(w.u / speed) * tail;
    p.ty = -(w.v / speed) * tail;
    const s = Math.sin(Math.PI * Math.min(1, p.age / p.life));
    p.fade = Math.max(0, s);
    return true;
  }
  function step(dtS) {
    for (const p of particles) {
      const w = readWind(p);
      if (!w) {
        spawn(p);
        place(p);
        continue;
      }
      p.x += w.u * FLOW_FT_PER_S_PER_KT * dtS;
      p.y += w.v * FLOW_FT_PER_S_PER_KT * dtS;
      p.age += dtS;
      if (p.age >= p.life || Math.abs(p.x) > halfFt || Math.abs(p.y) > halfFt) spawn(p);
      if (!place(p)) p.fade = 0;
    }
  }
  for (const p of particles) if (!place(p)) p.fade = 0;
  return { particles, step };
}
