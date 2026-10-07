// What the SOF's 3D weather layers draw, decided without a page or three.js (SPEC-sof, "3D view", SOF-39, SOF-42; Dad, 7 Oct "weather that looks right in 3D"): the radar
// pictures read into precipitation shafts, the lightning picture into bolts, the satellite picture into a faint cloud sheet's pixels, the surface fronts into lines,
// symbols, walls and pressure marks on the ground, and the model winds into a field of drifting streaks. Pure: pixels, model data and numbers go in, plain data comes out;
// weather3d.js draws it and view3d.js puts it in the view.
//
// Every height here that is not from the model is an estimate and is labelled so wherever it is shown (the key in view3d.js):
//   a radar shaft with no model cloud above it reaches RADAR_DEFAULT_AGL_FT; a bolt with none reaches LIGHTNING_DEFAULT_AGL_FT; the satellite sheet with no model cloud
//   lies at SATELLITE_DEFAULT_FT; a front's wall is FRONT_WALL_FT tall. None of this is a measurement; it is a picture for situational awareness and checks no limit.
//
// World frame as view3d.js: X east, Y north, Z up, in the map's local feet; heights are feet above sea level (the view multiplies them by the height scale).
import { AREA_FT } from './scene3d-model.js';
import { FT_PER_NM } from './map-view.js';

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

// ---- Pictures read on a grid of cells -----------------------------------------------------------------------

/** The radar and lightning pictures are read on a CELL_PX by CELL_PX grid over the square (450 / 96 = 4.7 NM a cell). An estimate for the detail a shaft needs. */
export const CELL_PX = 96;
export const CELL_FT = AREA_FT / CELL_PX;
/** A cell is precipitation or lightning when its pixel is at least this opaque (0 to 1) once the picture is shrunk to the grid. An estimate. */
export const CELL_MIN_ALPHA = 0.25;
/** Most shafts and most bolts drawn at once (each is one box); past this the cells are thinned evenly, never the strongest dropped first. An estimate for the drawing's sake. */
export const MAX_SHAFTS = 1800;
export const MAX_BOLTS = 600;
/** Where a shaft ends with no model cloud above it (feet above the ground), and how high a bolt reaches with none. Estimates, SOF-39. */
export const RADAR_DEFAULT_AGL_FT = 8000; // estimate
export const LIGHTNING_DEFAULT_AGL_FT = 25_000; // estimate
/** No shaft is shorter than this (a cloud base at the ground still shows as rain): feet. */
export const SHAFT_MIN_FT = 600;
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
 * The precipitation shafts: one per radar cell, from the ground up to the model cloud base above it (`column(u, v)` gives { baseFt, topFt } above sea level or null; cloudColumnAt),
 * or RADAR_DEFAULT_AGL_FT above the ground with no model cloud. `groundFt` is the ground the view draws; `groundAt(x, y)` (feet above sea level) gives the real terrain under a cell
 * when the view has it, else every cell stands on `groundFt`. Returns [{ x, y, baseFt (the ground), topFt, colour: [r, g, b] 0-255,
 * alpha (the radar's own opacity), modelTop: whether the model gave the height }], at most MAX_SHAFTS.
 */
export function shafts(cells, { column = /** @type {(u: number, v: number) => any} */ (() => null), groundFt = 0, groundAt = /** @type {(x: number, y: number) => number} */ (() => groundFt), max = MAX_SHAFTS } = {}) {
  return thin(cells, max).map((c) => {
    const cloud = column(c.u, c.v);
    const ground = groundAt(c.x, c.y);
    const top = cloud && isNumber(cloud.baseFt) ? Math.max(cloud.baseFt, ground + SHAFT_MIN_FT) : ground + RADAR_DEFAULT_AGL_FT;
    return { x: c.x, y: c.y, baseFt: ground, topFt: top, colour: [c.r, c.g, c.b], alpha: c.a, modelTop: Boolean(cloud) };
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
