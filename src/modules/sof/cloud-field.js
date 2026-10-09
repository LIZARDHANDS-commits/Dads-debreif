// The SOF 3D view's cloud slabs (SOF-39; Dad, 7 Oct: "the clouds seem to not have the best data"; Fable review, 7 Oct): cloud with a base and a top in every model
// column, worked out from the model's cover at each pressure level, smoothed over the square and coloured by cover. Pure: numbers in, numbers out; no page and no three.js.
// cloud-slabs3d.js draws what comes out of here.
//
// Where a column's cloud lies comes from `cloudBlocks` (model-clouds.js, tested): each run of levels over the cloud threshold is one block, its base and top where the
// column's cover, read as a straight line between the levels either side (`coverAtHeight`), crosses the threshold (V2.184; halfway between levels before). In each column the lowest block whose base is in a stage (low, mid, high by its base above
// the ground, CLOUD_STAGES_FT_AGL) is that stage's slab. Over the square each stage has one slab: its base, top and cover smoothed between the grid points (the same
// Catmull-Rom smoothing and light blur as the old per-level sheets). A grid point with no cloud in a stage takes its base and top from the nearest point that has some, with
// cover 0, so the smoothing never pulls a slab's edge down to the ground.
//
// The altitude sheet (Dad, 7 Oct, like ForeFlight's cloud forecast at a chosen altitude): the model's cover at one height over the whole square, from `coverAtHeight` in
// every column, smoothed the same way and shaped by the same 2.5 km picture (`heightSheet`).
//
// It is a model estimate, never an observation: no limit is checked here and nothing here raises or clears a caution.
import {
  columnAt, cloudBlocks, cloudStage, coverAtHeight, smoothField, blur, sheetAlpha, CLOUD_COVER_THRESHOLD_PCT, CLOUD_SHEET_PX, CLOUD_SHEET_BLUR_PX, CLOUD_SHEET_COLOURS, GRID_SIZE,
  CLOUD_STAGES_FT_AGL,
} from './model-clouds.js';
import { formatFeet, AREA_FT } from './scene3d-model.js';
import { FT_PER_NM } from './map-view.js';

/** The three stages, bottom first (model-clouds.js `cloudStage`). */
export const STAGES = Object.freeze(['low', 'mid', 'high']);
/** Each stage's slab is drawn as this many stacked sheets from its base to its top. Estimate, SOF-39 (Fable review: enough to read as a thickness, few enough to stay quick). */
export const SLAB_SHEETS = 2; // estimate, SOF-39; was 4 until V2.198: a one-off Fable review (8 Oct 2026) found the 4 transparent sheets per stage were the 3D view's biggest per-frame cost (2 sheets: about 35–40 % faster), and Dad chose 2. Each sheet's alpha is scaled (slabPixels) so a stack reads as dense from above as before.
/** A slab is never drawn thinner than this, feet (smoothing the base and top separately can bring them together). Estimate, SOF-39. */
export const MIN_SLAB_FT = 500; // estimate, SOF-39
/** The soft noise that breaks up each sheet's flat look is this many pixels across, laid this many times across the square, and dims the sheet to no less than this share. Estimates, SOF-39. */
export const NOISE_PX = 128; // estimate, SOF-39
export const NOISE_REPEAT = 8; // estimate, SOF-39
export const NOISE_FLOOR = 0.45; // estimate, SOF-39

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const smoothstep = (t) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

// ---- Columns and grids -----------------------------------------------------------------------------

/**
 * Each grid column's slabs at an hour: [{ i, j, low, mid, high }] in the model's point order, each stage null or { baseFt, topFt, cover, levels } (feet above sea level,
 * percent, how many model levels): the lowest `cloudBlocks` block whose base is in that stage. A block's base is never below `groundFt` (the ground the view draws).
 */
export function slabColumns(model, hour, groundFt) {
  return model.points.map((point) => {
    const { levels } = columnAt(point, hour, model.cloudLevels);
    const out = { i: point.i, j: point.j, low: null, mid: null, high: null };
    for (const block of cloudBlocks(levels, { floorFt: groundFt })) {
      const stage = cloudStage(block.baseFt - groundFt);
      out[stage] ??= { baseFt: block.baseFt, topFt: block.topFt, cover: block.cover, levels: block.levels };
    }
    return out;
  });
}

/**
 * The columns as grids, one per stage: { size, low, mid, high }, each { present, base, top, cover, levels } with Float32Array values row by row from the south-west
 * (index j * size + i). `present` is false when no column has cloud in that stage. A column with no cloud in the stage has cover 0 and the base, top and level count of the
 * nearest column that has some (grid steps, the first found on a tie).
 */
export function slabGrids(columns, size = GRID_SIZE) {
  const out = { size };
  for (const stage of STAGES) {
    const base = new Float32Array(size * size);
    const top = new Float32Array(size * size);
    const cover = new Float32Array(size * size);
    const levels = new Float32Array(size * size);
    const have = columns.filter((c) => c[stage]);
    for (const c of columns) {
      const k = c.j * size + c.i;
      let from = c[stage];
      if (from) cover[k] = from.cover;
      else {
        let best = Infinity;
        for (const other of have) {
          const d = (other.i - c.i) ** 2 + (other.j - c.j) ** 2;
          if (d < best) {
            best = d;
            from = other[stage];
          }
        }
      }
      if (from) {
        base[k] = from.baseFt;
        top[k] = from.topFt;
        levels[k] = from.levels ?? 1;
      }
    }
    out[stage] = { present: have.length > 0, base, top, cover, levels };
  }
  return out;
}

/** A grid's values over the square, `px` by `px`: bicubic between the grid points (`smoothField`, kept `lo` to `hi`), then the old sheets' light blur, twice. */
export const softField = (values, size, px, lo, hi, blurPx = CLOUD_SHEET_BLUR_PX) => blur(blur(smoothField(values, size, px, lo, hi), px, blurPx), px, blurPx);

/**
 * The grids smoothed over the square: { px, groundFt, low, mid, high }, each stage null (no cloud in it anywhere) or { base, top, cover, levels }, Float32Array `px` by `px` with
 * row 0 the south edge and column 0 the west edge (as a three.js DataTexture lies on a plane). Bicubic between the grid points, then the light blur of the old sheets. The
 * base is kept at or above `groundFt`, the top at least MIN_SLAB_FT above the base, the cover 0 to 100.
 */
export function slabFields(grids, { px = CLOUD_SHEET_PX, groundFt = 0, blurPx = CLOUD_SHEET_BLUR_PX } = {}) {
  const out = { px, groundFt, low: null, mid: null, high: null };
  const soft = (values, lo, hi) => softField(values, grids.size, px, lo, hi, blurPx);
  for (const stage of STAGES) {
    const g = grids[stage];
    if (!g?.present) continue;
    const base = soft(g.base, groundFt, Infinity);
    const top = soft(g.top, -Infinity, Infinity);
    for (let n = 0; n < top.length; n++) top[n] = Math.max(top[n], base[n] + MIN_SLAB_FT);
    out[stage] = { base, top, cover: soft(g.cover, 0, 100), levels: soft(g.levels ?? new Float32Array(g.cover.length).fill(1), 1, Infinity) };
  }
  return out;
}

/** The slabs for a model at an hour, over the ground the view draws: `slabFields(slabGrids(slabColumns(...)))`. */
export const cloudSlabs = (model, hour, groundFt, options = {}) => slabFields(slabGrids(slabColumns(model, hour, groundFt), model.gridSize ?? GRID_SIZE), { groundFt, ...options });

// ---- Reading the slabs -----------------------------------------------------------------------------

/** The pixel of a field under a place: `u` and `v` run 0 to 1 across the square, west to east and south to north. */
export const pixelAt = (px, u, v) => Math.min(px - 1, Math.max(0, Math.round(v * (px - 1)))) * px + Math.min(px - 1, Math.max(0, Math.round(u * (px - 1))));

/** A field's value at a place, bilinear between its pixels (`u`, `v` as `pixelAt`). */
export function sampleBilinear(field, px, u, v) {
  const gx = Math.min(1, Math.max(0, u)) * (px - 1);
  const gy = Math.min(1, Math.max(0, v)) * (px - 1);
  const x = Math.min(px - 2, Math.floor(gx));
  const y = Math.min(px - 2, Math.floor(gy));
  const tx = gx - x;
  const ty = gy - y;
  const a = field[y * px + x] * (1 - tx) + field[y * px + x + 1] * tx;
  const b = field[(y + 1) * px + x] * (1 - tx) + field[(y + 1) * px + x + 1] * tx;
  return a * (1 - ty) + b * ty;
}

/**
 * The cloud above a place from the slabs: { baseFt, topFt, stage } of the lowest slab whose cover there is over `threshold`, feet above sea level; null with none. The
 * slabs' own stand-in for model-clouds.js `cloudColumnAt` (radar shafts, lightning bolts and the satellite sheet's height read it).
 */
export function slabColumnAt(slabs, u, v, threshold = CLOUD_COVER_THRESHOLD_PCT) {
  if (!slabs) return null;
  const n = pixelAt(slabs.px, u, v);
  for (const stage of STAGES) {
    const f = slabs[stage];
    if (f && f.cover[n] > threshold) return { baseFt: f.base[n], topFt: f.top[n], stage };
  }
  return null;
}

/** The highest slab top anywhere over `threshold` (feet above sea level), or null: the satellite sheet lies there. */
export function highestSlabTopFt(slabs, threshold = CLOUD_COVER_THRESHOLD_PCT) {
  let best = null;
  for (const stage of STAGES) {
    const f = slabs?.[stage];
    if (!f) continue;
    for (let n = 0; n < f.cover.length; n++) if (f.cover[n] > threshold && (best === null || f.top[n] > best)) best = f.top[n];
  }
  return best;
}

/**
 * Each stage's slab in numbers, for the labels and the key: { low, mid, high }, each null (nothing over `threshold`) or { baseFt, topFt, share, maxCover }: the base and top
 * averaged over the pixels with cloud, weighted by their cover (feet above sea level), the share of the square with cloud (0 to 1), and the most cover anywhere (percent).
 */
export function slabSummary(slabs, threshold = CLOUD_COVER_THRESHOLD_PCT) {
  const out = { low: null, mid: null, high: null };
  for (const stage of STAGES) {
    const f = slabs?.[stage];
    if (!f) continue;
    let w = 0;
    let b = 0;
    let t = 0;
    let count = 0;
    let maxCover = 0;
    for (let n = 0; n < f.cover.length; n++) {
      const c = f.cover[n];
      if (c > maxCover) maxCover = c;
      if (!(c > threshold)) continue;
      w += c;
      b += c * f.base[n];
      t += c * f.top[n];
      count += 1;
    }
    if (w > 0) out[stage] = { baseFt: b / w, topFt: t / w, share: count / f.cover.length, maxCover };
  }
  return out;
}

const STAGE_NAMES = Object.freeze({ low: 'Low', mid: 'Mid', high: 'High' });
const nearest100 = (ft) => formatFeet(Math.round(ft / 100) * 100);

/** "Low cloud: base ≈ 3,100 ft, top ≈ 6,400 ft (mean over the area)", or "Low cloud: none" (feet above sea level, to the nearest 100). */
export function slabWords(stage, s) {
  if (!s) return `${STAGE_NAMES[stage]} cloud: none`;
  return `${STAGE_NAMES[stage]} cloud: base ≈ ${nearest100(s.baseFt)} ft, top ≈ ${nearest100(s.topFt)} ft (mean over the area)`;
}

// ---- Drawing numbers -------------------------------------------------------------------------------

/**
 * One sheet's opacity when `n` sheets are stacked and the stack is to read as `A` from above: 1 − (1 − A)^(1/n). Standard alpha blending: n layers of a each let
 * (1 − a)^n through.
 */
export function sheetAlphaShare(A, n) {
  const a = Math.min(1, Math.max(0, isNumber(A) ? A : 0));
  if (!(n > 1)) return a;
  return 1 - (1 - a) ** (1 / n);
}

/**
 * How solid a slab reads from above at a cover (percent) holding `levels` model levels: what the old per-level sheets would have stacked to, 1 − (1 − a)^levels with `a`
 * the old sheets' own curve (`sheetAlpha`: clear at or below the threshold, about 85 % at full cover). So a deep cloud reads denser than a thin one, as it did. Estimate, SOF-39.
 */
export function slabAlpha(coverPct, levels = 1, threshold = CLOUD_COVER_THRESHOLD_PCT) {
  const a = sheetAlpha(coverPct, threshold);
  return a > 0 ? 1 - (1 - a) ** Math.max(1, isNumber(levels) ? levels : 1) : 0;
}

/**
 * A slab's picture, shared by its sheets: `px` by `px` RGBA bytes laid as the fields are (row 0 south). White to grey by cover (CLOUD_SHEET_COLOURS), each pixel's alpha the
 * share of `slabAlpha` (from the cover and, when given, the `levels` field) that makes `sheets` stacked sheets read as that from above, times
 * `fade` (an old picture is drawn fainter) and `gain` (the sheets' noise alpha map dims them by its mean, so the drawing passes 1 / that mean to keep the stack's
 * average opacity, `noiseMean`). Returns { pixels, drawn }, `drawn` false when no pixel has any alpha.
 */
export function slabPixels(cover, px, { levels = null, sheets = SLAB_SHEETS, threshold = CLOUD_COVER_THRESHOLD_PCT, fade = 1, gain = 1 } = {}) {
  const pixels = new Uint8Array(px * px * 4);
  const { thin, thick } = CLOUD_SHEET_COLOURS;
  let drawn = false;
  for (let n = 0; n < px * px; n++) {
    const c = cover[n];
    const alpha = Math.min(1, sheetAlphaShare(slabAlpha(c, levels ? levels[n] : 1, threshold) * fade, sheets) * gain);
    const t = Math.min(1, Math.max(0, c / 100));
    for (let k = 0; k < 3; k++) pixels[n * 4 + k] = Math.round(thin[k] + (thick[k] - thin[k]) * t);
    pixels[n * 4 + 3] = Math.round(alpha * 255);
    if (pixels[n * 4 + 3] > 0) drawn = true;
  }
  return { pixels, drawn };
}

/**
 * A soft, tiling noise picture `px` by `px` (RGBA, grey, opaque), values NOISE_FLOOR to 1, made the same every time from `seed`: three octaves of smooth value noise that
 * wrap at the edges, so it can be repeated across a sheet as its alpha map without seams. A picture of cloud texture, not a measurement.
 */
export function noisePixels(px = NOISE_PX, seed = 7) {
  let state = seed >>> 0;
  const random = () => { // mulberry32: a small, well-known repeatable random number generator
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const sum = new Float32Array(px * px);
  for (const [cells, w] of [[4, 0.55], [8, 0.3], [16, 0.15]]) {
    const lattice = Float32Array.from({ length: cells * cells }, random);
    const at = (i, j) => lattice[((j % cells) + cells) % cells * cells + (((i % cells) + cells) % cells)];
    for (let y = 0; y < px; y++) {
      const gy = (y / px) * cells;
      const j = Math.floor(gy);
      const ty = smoothstep(gy - j);
      for (let x = 0; x < px; x++) {
        const gx = (x / px) * cells;
        const i = Math.floor(gx);
        const tx = smoothstep(gx - i);
        const a = at(i, j) * (1 - tx) + at(i + 1, j) * tx;
        const b = at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx;
        sum[y * px + x] += w * (a * (1 - ty) + b * ty);
      }
    }
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of sum) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const out = new Uint8Array(px * px * 4);
  for (let n = 0; n < sum.length; n++) {
    const t = hi > lo ? (sum[n] - lo) / (hi - lo) : 1;
    const g = Math.round((NOISE_FLOOR + (1 - NOISE_FLOOR) * t) * 255);
    out[n * 4] = g;
    out[n * 4 + 1] = g;
    out[n * 4 + 2] = g;
    out[n * 4 + 3] = 255;
  }
  return out;
}

/** The mean of a noise picture's values (its green channel, 0 to 1), which is how much it dims a sheet on average as an alpha map. */
export function noiseMean(pixels) {
  let sum = 0;
  for (let n = 1; n < pixels.length; n += 4) sum += pixels[n];
  return pixels.length ? sum / (pixels.length / 4) / 255 : 1;
}

// ---- The 2.5 km detail: ECCC's HRDPS total-cloud picture (Fable review, 7 Oct) --------------------------------------

/**
 * How ECCC draws HRDPS total cloud cover (GeoMet layer HRDPS.CONTINENTAL_NT, default style): fully see-through where the cover is 0 %, else grey from about `zero` (0 %) to
 * `full` (100 %), a straight line. Source: 28 points of the 7 Oct 2026 2100Z picture read against GeoMet's own GetFeatureInfo values (a straight-line fit, grey ≈ 35 + 2.19 ×
 * percent, scatter about 4 %, the legend's 5 % steps), with the layer's legend (dark grey at 0 %, near white at 100 %). The brief's "grey / 255 = percent" was checked and
 * did not match (grey 42 is 4.7 %), and a see-through pixel is 0 % cloud, not "no data" (GetFeatureInfo: "0% cloud coverage").
 */
export const NT_GREY = Object.freeze({ zero: 35, full: 254 });
/** The mask scales a stage's cover by at most this much (the most-overlap rule below). Estimate, SOF-39 (Fable review). */
export const NT_MAX_GAIN = 1.5; // estimate, SOF-39
/** Where the 37.5 NM grid has less than this cover (percent) in every stage, the picture's cloud has no height to stand at and is not drawn. Estimate, SOF-39. */
export const NT_MIN_GRID_PCT = 5; // estimate, SOF-39
/** A picture from a model run older than this is drawn at this share of its opacity: the 2D map's own stale share (STALE_ALPHA, map.js). */
export const NT_OLD_FADE = 0.4;

/**
 * The total-cloud picture drawn onto a square canvas over the 3D area (`image` as getImageData gives, row 0 the north edge) as percent: { px, percent } with `percent` a
 * Float32Array laid as the slab fields are (row 0 the south edge). A pixel's grey reads as percent by NT_GREY, times its own opacity (an edge pixel half see-through is half
 * way to 0 %). Returns null for anything that is not a square picture of the right length.
 */
export function readTotalCloud(image) {
  const px = image?.width;
  if (!image?.data || !Number.isInteger(px) || px < 2 || image.height !== px || image.data.length !== px * px * 4) return null;
  const percent = new Float32Array(px * px);
  const { data } = image;
  for (let row = 0; row < px; row++) {
    const out = (px - 1 - row) * px;
    for (let col = 0; col < px; col++) {
      const k = (row * px + col) * 4;
      const a = data[k + 3] / 255;
      if (a <= 0) continue;
      const grey = 0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2];
      const pct = Math.min(100, Math.max(0, ((grey - NT_GREY.zero) / (NT_GREY.full - NT_GREY.zero)) * 100));
      percent[out + col] = a * pct;
    }
  }
  return { px, percent };
}

/**
 * The 2.5 km total cloud laid over some cover fields, the most-overlap rule (an estimate, SOF-39): the total cover of stacked layers is taken as the most of them, so at
 * each pixel each field's cover is scaled by k = total / most (at most NT_MAX_GAIN) where the grid has at least NT_MIN_GRID_PCT somewhere in the column, and kept at
 * most 100. `most` is the most of `covers` and of `reference` (other fields of the same column that are not scaled: the altitude sheet passes the slabs' covers, so a
 * sheet at one height is scaled as the column is, not as if it were the whole column). Where the picture has `threshold` or less every field is clear. Where the picture
 * has cloud but the column has less than NT_MIN_GRID_PCT everywhere, there is no height for it and nothing is drawn: `unplacedShare` (0 to 1 of the square) says how
 * much. Returns { covers (new Float32Arrays, null kept null), unplacedShare }. The one place the rule lives (`maskSlabs` and `heightSheet` use it).
 */
export function maskCovers(covers, total, { reference = [], threshold = CLOUD_COVER_THRESHOLD_PCT, maxGain = NT_MAX_GAIN, minGridPct = NT_MIN_GRID_PCT } = {}) {
  const out = covers.map((c) => (c ? new Float32Array(c) : null));
  const refs = reference.filter(Boolean);
  let unplaced = 0;
  for (let n = 0; n < total.percent.length; n++) {
    const t = total.percent[n];
    let most = 0;
    for (const c of out) if (c && c[n] > most) most = c[n];
    for (const r of refs) if (r[n] > most) most = r[n];
    if (!(t > threshold)) {
      for (const c of out) if (c) c[n] = 0;
      continue;
    }
    if (most < minGridPct) {
      unplaced += 1;
      continue;
    }
    const k = Math.min(maxGain, Math.max(0, t / most));
    for (const c of out) if (c) c[n] = Math.min(100, c[n] * k);
  }
  return { covers: out, unplacedShare: unplaced / total.percent.length };
}

/**
 * The slabs with the 2.5 km total cloud laid over them (`maskCovers` on the three stages' covers). Returns { slabs, unplacedShare }; with no picture or one of another
 * size, the slabs as they were and `unplacedShare` null.
 */
export function maskSlabs(slabs, total, options = {}) {
  if (!slabs || !total || total.px !== slabs.px) return { slabs, unplacedShare: null };
  const { covers, unplacedShare } = maskCovers(STAGES.map((stage) => slabs[stage]?.cover ?? null), total, options);
  const out = { ...slabs };
  STAGES.forEach((stage, s) => {
    if (slabs[stage]) out[stage] = { ...slabs[stage], cover: covers[s] };
  });
  return { slabs: out, unplacedShare };
}

// ---- The altitude sheet: the model's cover at one height (Dad, 7 Oct, ForeFlight-style) ------------------------------------

/** The altitude control's heights: 1,000 to 30,000 ft above sea level in 500 ft steps (the brief's range; ForeFlight's cloud forecast offers a similar spread). */
export const SHEET_HEIGHTS_FT = Object.freeze({ min: 1000, max: 30_000, step: 500 });

/**
 * The model's cloud cover at `heightFt` (feet above sea level) over the square, at an hour: { px, heightFt, cover, columns, noData, maxCover, share } or null when no
 * column reaches that height. In each grid column the cover is `coverAtHeight` (between the two levels either side, by height); a column whose levels do not reach that
 * height has no data there and counts as 0 (`noData` says how many), so the sheet never makes cloud up. Smoothed like the slabs (`softField`), then, with `total` (the
 * 2.5 km picture, `readTotalCloud`), shaped by it as the slabs are (`maskCovers`, with `reference` the unmasked slabs of the hour, so the most-overlap rule sees the
 * whole column). `maxCover` is the most anywhere (percent) and `share` the part of the square over `threshold` (0 to 1). `unplacedShare` as `maskCovers` (null with no picture).
 */
export function heightSheet(model, hour, heightFt, { px = CLOUD_SHEET_PX, total = null, reference = null, threshold = CLOUD_COVER_THRESHOLD_PCT } = {}) {
  const size = model.gridSize ?? GRID_SIZE;
  const values = new Float32Array(size * size);
  let noData = 0;
  for (const point of model.points) {
    const c = coverAtHeight(columnAt(point, hour, model.cloudLevels).levels, heightFt);
    if (c === null) noData += 1;
    else values[point.j * size + point.i] = c;
  }
  if (noData === model.points.length) return null;
  let cover = softField(values, size, px, 0, 100);
  let unplacedShare = null;
  if (total && total.px === px) {
    const masked = maskCovers([cover], total, { reference: STAGES.map((stage) => reference?.[stage]?.cover ?? null), threshold });
    cover = masked.covers[0];
    unplacedShare = masked.unplacedShare;
  }
  let maxCover = 0;
  let over = 0;
  for (const c of cover) {
    if (c > maxCover) maxCover = c;
    if (c > threshold) over += 1;
  }
  return { px, heightFt, cover, columns: model.points.length, noData, maxCover, share: over / cover.length, unplacedShare };
}

/**
 * The altitude sheet's line: "Cloud at 6,000 ft (model estimate): up to 85 % cover, over 30 % on 40 % of the square", "Cloud at 6,000 ft (model estimate): none over
 * 30 %", with "below the ground here" when the height is at or under the ground the view draws, and "no model data at this height" with no sheet. Feet above sea level.
 */
export function heightSheetWords(sheet, heightFt, { groundFt = -Infinity, threshold = CLOUD_COVER_THRESHOLD_PCT } = {}) {
  const head = `Cloud at ${formatFeet(heightFt)} ft (model estimate)`;
  if (heightFt <= groundFt) return `${head}: ${formatFeet(heightFt)} ft is at or below the ground here (${formatFeet(Math.round(groundFt / 100) * 100)} ft)`;
  if (!sheet) return `${head}: no model data at this height`;
  const part = sheet.noData ? `; ${sheet.noData} of ${sheet.columns} model columns do not reach it` : '';
  if (!(sheet.share > 0)) return `${head}: none over ${threshold} %${part}`;
  return `${head}: up to ${Math.round(sheet.maxCover)} % cover, over ${threshold} % on ${Math.max(1, Math.round(sheet.share * 100))} % of the square${part}`;
}

// ---- Observed bases: METARs anchor the low cloud near their stations (Fable review, 7 Oct) ------------------------------------

/** A station's observed base pulls the model's low cloud base towards it out to this distance, fading smoothly to nothing. Estimate, SOF-39 (Fable review). */
export const ANCHOR_NM = 15; // estimate, SOF-39
/**
 * Only a METAR ceiling below this, in feet above the field, moves the model's low cloud base (Dad's ruling, 7 Oct 2026, SOF-47: "Lower, 5,000 ft"; it was the 6,500 ft
 * low-stage top). A ceiling from here up to the low-stage top leaves the model's low cloud alone (neither moved nor thinned); above that it counts as no low ceiling.
 */
export const ANCHOR_CEILING_AGL_FT = 5000;

/**
 * The low slab pulled towards what the reporting stations see, near each one (`anchors`: scene3d-model.js `stationAnchors`, fresh reports only; the view uses this at the
 * model hour "now" only). Within `anchorNm` of a station the weight is w = smoothstep(1 − d / anchorNm) (1 at the station, 0 at the edge); where two stations reach, the
 * nearer one counts. Low stage only:
 * - a ceiling (BKN, OVC or VV) below ANCHOR_CEILING_AGL_FT above the field: base' = base × (1 − w) + observed × w, and the top is kept at least MIN_SLAB_FT above it;
 * - a ceiling from ANCHOR_CEILING_AGL_FT up to the low stage's top (CLOUD_STAGES_FT_AGL.lowTopFt): nothing changes (use 'none', reason 'mid-low');
 * - no low ceiling (a clear sky, only FEW or SCT, or a ceiling above the low stage): low cover' = cover × (1 − w);
 * - a stale or missing report, an unknown ceiling or an unknown field elevation: nothing changes.
 *
 * Returns { slabs, stations } where `stations` are the anchors with `use` ('base', 'thin' or 'none'), `reason` (for 'none': 'stale', 'unknown', 'elevation',
 * 'mid-low' or 'outside') and `modelBaseFt` (the model's own low base at the station before anchoring, or null with no low cloud there over `threshold`).
 */
export function anchorLowSlab(slabs, anchors, { anchorNm = ANCHOR_NM, threshold = CLOUD_COVER_THRESHOLD_PCT, ceilingBelowFt = ANCHOR_CEILING_AGL_FT, lowTopFt = CLOUD_STAGES_FT_AGL.lowTopFt } = {}) {
  const low = slabs?.low ?? null;
  const px = slabs?.px ?? 0;
  const half = AREA_FT / 2;
  const toPixel = (ft) => ((ft + half) / AREA_FT) * (px - 1);
  const stations = (anchors ?? []).map((a) => {
    const inside = Math.abs(a.x) <= half && Math.abs(a.y) <= half;
    const n = px ? pixelAt(px, a.x / AREA_FT + 0.5, a.y / AREA_FT + 0.5) : -1;
    const modelBaseFt = inside && low && low.cover[n] > threshold ? low.base[n] : null;
    let use = 'none';
    let reason = null;
    if (!inside) reason = 'outside';
    else if (!a.fresh) reason = 'stale';
    else if (a.unknown) reason = 'unknown';
    else if (a.ceiling && a.ceiling.baseAglFt < ceilingBelowFt) {
      if (a.baseMslFt === null) reason = 'elevation';
      else use = 'base';
    } else if (a.ceiling && a.ceiling.baseAglFt < lowTopFt) reason = 'mid-low';
    else use = 'thin';
    return { ...a, use, reason, modelBaseFt };
  });
  if (!low || !px) return { slabs, stations };
  const radius = anchorNm * FT_PER_NM;
  const best = new Float32Array(px * px);
  const which = new Int16Array(px * px).fill(-1);
  const pxFt = AREA_FT / (px - 1);
  stations.forEach((a, k) => {
    if (a.use === 'none') return;
    const cx = toPixel(a.x);
    const cy = toPixel(a.y);
    const reach = radius / pxFt;
    for (let row = Math.max(0, Math.floor(cy - reach)); row <= Math.min(px - 1, Math.ceil(cy + reach)); row++) {
      for (let col = Math.max(0, Math.floor(cx - reach)); col <= Math.min(px - 1, Math.ceil(cx + reach)); col++) {
        const d = Math.hypot(col - cx, row - cy) * pxFt;
        const w = smoothstep(1 - d / radius);
        const n = row * px + col;
        if (w > best[n]) {
          best[n] = w;
          which[n] = k;
        }
      }
    }
  });
  const base = new Float32Array(low.base);
  const top = new Float32Array(low.top);
  const cover = new Float32Array(low.cover);
  for (let n = 0; n < best.length; n++) {
    const w = best[n];
    if (!(w > 0)) continue;
    const a = stations[which[n]];
    if (a.use === 'base') {
      base[n] = base[n] * (1 - w) + a.baseMslFt * w;
      top[n] = Math.max(top[n], base[n] + MIN_SLAB_FT);
    } else cover[n] *= 1 - w;
  }
  return { slabs: { ...slabs, low: { ...low, base, top, cover } }, stations };
}

/**
 * One station's line for the key: "CYMJ: METAR BKN045 → 6,392 ft; model low base 5,900 ft (model 500 ft lower)", "CYQR: no low ceiling reported; model low cloud: none",
 * "KMIB: no fresh METAR". Heights are feet above sea level; the observed base exactly (the METAR's hundreds of feet plus the field), the model's to the nearest 100.
 */
export function anchorWords(station, { anchorNm = ANCHOR_NM } = {}) {
  const { icao } = station;
  const model = station.modelBaseFt === null ? 'model low cloud: none' : `model low base ${nearest100(station.modelBaseFt)} ft`;
  if (station.reason === 'stale') return `${icao}: no fresh METAR`;
  if (station.reason === 'outside') return `${icao}: outside the square`;
  if (station.reason === 'unknown') return `${icao}: ceiling not known (no base reported); not used`;
  if (station.reason === 'mid-low') return `${icao}: METAR ${station.ceiling.group}${station.baseMslFt === null ? '' : ` → ${formatFeet(station.baseMslFt)} ft`}, not below ${formatFeet(ANCHOR_CEILING_AGL_FT)} ft above the field; ${model}, left as the model has it`;
  if (station.reason === 'elevation') return `${icao}: METAR ${station.ceiling.group}, field elevation not known; not used`;
  if (station.use === 'base') {
    if (station.modelBaseFt === null) return `${icao}: METAR ${station.ceiling.group} → ${formatFeet(station.baseMslFt)} ft; ${model}`;
    const d = Math.round((station.modelBaseFt - station.baseMslFt) / 100) * 100;
    const diff = d === 0 ? 'the same to 100 ft' : `model ${formatFeet(Math.abs(d))} ft ${d < 0 ? 'lower' : 'higher'}`;
    return `${icao}: METAR ${station.ceiling.group} → ${formatFeet(station.baseMslFt)} ft; ${model} (${diff}); pulled to the METAR within ${anchorNm} NM`;
  }
  const above = station.ceiling ? ` (${station.ceiling.group}${station.baseMslFt === null ? '' : ` → ${formatFeet(station.baseMslFt)} ft`} is above the low stage)` : '';
  return `${icao}: no low ceiling reported${above}; ${model}${station.modelBaseFt === null ? '' : `, thinned within ${anchorNm} NM`}`;
}
