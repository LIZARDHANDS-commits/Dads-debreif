// The two embedded VNC charts: where they sit, and V6's hand-tuned warp that
// lines them up with the ground. Pure functions in latitude/longitude and local
// feet, so they run in Node; tests/golden/debrief-vnc.test.js pins them to V6.
// The layer that draws them (and caches the drawing, #43) sits on top of these.
import { mercatorY, invMercatorY, latLonToLocalFt } from '../../../core/geo.js';

/**
 * Chart bounds in degrees (V6 EMBEDDED_VNC_CHARTS, line 2107). Each image is a
 * Web Mercator screenshot: longitude runs evenly across it, latitude evenly in
 * Mercator y down it.
 */
export const VNC_CHARTS = Object.freeze({
  south: Object.freeze({ name: 'VNC South — Moose Jaw / Regina', west: -108.346257, east: -103.111971, north: 51.139537, south: 48.628013 }),
  north: Object.freeze({ name: 'VNC North — Saskatoon / Moose Jaw', west: -108.27316531, east: -103.04822960, north: 53.17426900, south: 50.77754091 }),
});

/**
 * V6's 3 × 3 correction mesh (line 2597): [u, v, east NM, north NM] at the
 * corners, edge middles and centre of each image. South needs none; North's
 * top edge is pulled by up to 1.4 NM.
 */
export const VNC_WARP_MESH = Object.freeze({
  south: [
    [0, 0, 0, 0], [0.5, 0, 0, 0], [1, 0, 0, 0],
    [0, 0.5, 0, 0], [0.5, 0.5, 0, 0], [1, 0.5, 0, 0],
    [0, 1, 0, 0], [0.5, 1, 0, 0], [1, 1, 0, 0],
  ],
  north: [
    [0, 0, -1.0, 1.4], [0.5, 0, 0.0, 1.0], [1, 0, 1.0, 0.5],
    [0, 0.5, -0.6, 0.7], [0.5, 0.5, 0.0, 0.35], [1, 0.5, 0.6, 0],
    [0, 1, 0, 0], [0.5, 1, 0, 0], [1, 1, 0, 0],
  ],
});

/** Cells across and down the drawing mesh; each cell is two affine triangles (V6 line 2657). */
export const VNC_MESH_CELLS = 18;

/** The alignment controls' defaults: no nudge (NM east and north) and 100 % scale. */
export const VNC_DEFAULT_ALIGN = Object.freeze({ nudgeEastNm: 0, nudgeNorthNm: 0, scalePct: 100 });

/** Latitude and longitude of image point (u, v), 0 to 1 from the top left, before any warp (V6 vncBaseGeo, line 2617). */
export function vncBaseLatLon(chart, u, v) {
  const lon = chart.west + (chart.east - chart.west) * u;
  const mt = mercatorY(chart.north), mb = mercatorY(chart.south);
  return { lat: invMercatorY(mt + (mb - mt) * v), lon };
}

/**
 * Where image point (u, v) of chart `key` lands, in degrees (V6 vncWarpPoint,
 * line 2622, up to its last step): the user's scale about the chart's middle
 * and nudge, then the mesh correction, then for South a local pull around
 * Isle of Bays on Old Wives Lake that fades out before CYMJ.
 */
export function vncWarpLatLon(key, u, v, align = VNC_DEFAULT_ALIGN) {
  const ch = VNC_CHARTS[key];
  const dx = align.nudgeEastNm, dy = align.nudgeNorthNm, sc = align.scalePct / 100;
  const g = vncBaseLatLon(ch, u, v), midLat = (ch.north + ch.south) / 2, midLon = (ch.west + ch.east) / 2;
  let lat = midLat + (g.lat - midLat) * sc + dy / 60;
  let lon = midLon + (g.lon - midLon) * sc + dx / (60 * Math.cos((midLat * Math.PI) / 180));
  const M = VNC_WARP_MESH[key], gx = Math.min(1, Math.floor(u * 2)), gy = Math.min(1, Math.floor(v * 2));
  const fu = u * 2 - gx, fv = v * 2 - gy, ix = (x, y) => y * 3 + x;
  const p00 = M[ix(gx, gy)], p10 = M[ix(gx + 1, gy)], p01 = M[ix(gx, gy + 1)], p11 = M[ix(gx + 1, gy + 1)];
  let en = (1 - fu) * (1 - fv) * p00[2] + fu * (1 - fv) * p10[2] + (1 - fu) * fv * p01[2] + fu * fv * p11[2];
  let nn = (1 - fu) * (1 - fv) * p00[3] + fu * (1 - fv) * p10[3] + (1 - fu) * fv * p01[3] + fu * fv * p11[3];
  if (key === 'south') {
    const du = (u - 0.45625) / 0.16, dv = (v - 0.4315) / 0.16;
    const wt = Math.exp(-2.2 * (du * du + dv * dv));
    en += 1.57 * wt;
    nn += 2.69 * wt;
  }
  lat += nn / 60;
  lon += en / (60 * Math.cos((lat * Math.PI) / 180));
  return { lat, lon };
}

/**
 * The warped drawing mesh of chart `key` in local feet from `ref` (core
 * makeLocalRef): (cells + 1)² points, row by row from the image's top left.
 * It depends only on the chart, the alignment and `ref`, so it's worked out
 * once per alignment rather than on every frame as V6 did (#43).
 */
export function vncWarpGrid(key, ref, align = VNC_DEFAULT_ALIGN, cells = VNC_MESH_CELLS) {
  const pts = [];
  for (let j = 0; j <= cells; j++) {
    for (let i = 0; i <= cells; i++) {
      const g = vncWarpLatLon(key, i / cells, j / cells, align);
      pts.push(latLonToLocalFt(ref, g.lat, g.lon));
    }
  }
  return pts;
}

/**
 * The canvas transform [a, b, c, d, e, f] that maps image triangle s0 s1 s2
 * onto screen triangle d0 d1 d2 (V6 drawTri, line 2640), or null when the
 * image triangle is flat.
 */
export function triangleTransform(s0, s1, s2, d0, d1, d2) {
  const den = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (Math.abs(den) < 1e-9) return null;
  const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / den;
  const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / den;
  const e = (d0.x * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) / den;
  const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / den;
  const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / den;
  const f = (d0.y * (s1.x * s2.y - s2.x * s1.y) + d1.y * (s2.x * s0.y - s0.x * s2.y) + d2.y * (s0.x * s1.y - s1.x * s0.y)) / den;
  return [a, b, c, d, e, f];
}

/** The chart images, re-encoded losslessly from V6's PNGs (same pixels, about half the size). */
export const VNC_FILES = Object.freeze({ south: 'media/debrief/vnc-south.webp', north: 'media/debrief/vnc-north.webp' });

/** Which charts each "VNC chart" choice shows (V6's Off, South, North, Both). */
export const VNC_CHOICES = Object.freeze({ off: [], south: ['south'], north: ['north'], both: ['south', 'north'] });

/** V6's fine-alignment sliders: nudge ±20 NM each way, scale 97 % to 103 %. */
export const VNC_ALIGN_LIMITS = Object.freeze({ nudgeNm: [-20, 20], scalePct: [97, 103] });

/** The box round points in local feet. */
function boxOf(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** The box round the chosen charts in local feet, to fit the view to them (V6 fitEmbeddedVncToView). */
export function chartsBounds(keys, ref, align = VNC_DEFAULT_ALIGN) {
  return boxOf(keys.flatMap((key) => vncWarpGrid(key, ref, align, 2)));
}

const cacheKey = (ref, a) => [ref.lat, ref.lon, a.nudgeEastNm, a.nudgeNorthNm, a.scalePct].join(',');

/**
 * The chart layer. Each chart's image is fetched the first time it's shown
 * (R5), then warped once per alignment into an off-screen image laid out in
 * local feet, north up, so each frame draws it with one drawImage (#43).
 * base: the site's address, for the image files. onChange(): asks for a
 * redraw when an image arrives or fails. makeImage and makeCanvas are for
 * tests. Returns { draw, state, dispose }.
 */
export function createVncLayer({
  base,
  onChange,
  makeImage = () => new Image(),
  makeCanvas = (width, height) => Object.assign(document.createElement('canvas'), { width, height }),
}) {
  const charts = {}; // key → { image, ready, failed, warped: { key, canvas, box } }
  let disposed = false;
  let last = { wanted: 0, ready: 0, failed: 0 };

  function chart(key) {
    if (charts[key]) return charts[key];
    const entry = { image: makeImage(), ready: false, failed: false, warped: null };
    entry.image.onload = () => {
      if (disposed) return;
      entry.ready = true;
      onChange();
    };
    entry.image.onerror = () => {
      if (disposed) return;
      entry.failed = true;
      onChange();
    };
    entry.image.src = new URL(VNC_FILES[key], base).href;
    charts[key] = entry;
    return entry;
  }

  // V6's mesh of affine triangles, drawn once at about the image's own resolution.
  function warp(key, image, ref, align) {
    const cells = VNC_MESH_CELLS;
    const grid = vncWarpGrid(key, ref, align, cells);
    const box = boxOf(grid);
    const W = image.naturalWidth;
    const H = image.naturalHeight;
    const ftPerPx = Math.max(box.maxX - box.minX, box.maxY - box.minY) / Math.max(W, H);
    const canvas = makeCanvas(Math.ceil((box.maxX - box.minX) / ftPerPx), Math.ceil((box.maxY - box.minY) / ftPerPx));
    const ctx = canvas.getContext('2d');
    const to = (i, j) => {
      const p = grid[j * (cells + 1) + i];
      return { x: (p.x - box.minX) / ftPerPx, y: (box.maxY - p.y) / ftPerPx };
    };
    const from = (i, j) => ({ x: (i / cells) * W, y: (j / cells) * H });
    const tri = (s, d) => {
      const m = triangleTransform(...s, ...d);
      if (!m) return;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(d[0].x, d[0].y);
      ctx.lineTo(d[1].x, d[1].y);
      ctx.lineTo(d[2].x, d[2].y);
      ctx.closePath();
      ctx.clip();
      ctx.setTransform(...m);
      ctx.drawImage(image, 0, 0);
      ctx.restore();
    };
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        tri([from(i, j), from(i + 1, j), from(i + 1, j + 1)], [to(i, j), to(i + 1, j), to(i + 1, j + 1)]);
        tri([from(i, j), from(i + 1, j + 1), from(i, j + 1)], [to(i, j), to(i + 1, j + 1), to(i, j + 1)]);
      }
    }
    return { key: cacheKey(ref, align), canvas, box };
  }

  return {
    /**
     * Draws the charts named in `keys` (VNC_CHOICES) at `opacityPct`. map:
     * the canvas view (worldToScreen). ref: the map's origin. align:
     * { nudgeEastNm, nudgeNorthNm, scalePct }.
     */
    draw(ctx, { keys, map, ref, align, opacityPct }) {
      let ready = 0;
      let failed = 0;
      ctx.save();
      ctx.globalAlpha = opacityPct / 100;
      for (const key of keys) {
        const entry = chart(key);
        if (entry.failed) failed += 1;
        if (!entry.ready) continue;
        ready += 1;
        if (entry.warped?.key !== cacheKey(ref, align)) entry.warped = warp(key, entry.image, ref, align);
        const { canvas, box } = entry.warped;
        const [x1, y1] = map.worldToScreen(box.minX, box.maxY);
        const [x2, y2] = map.worldToScreen(box.maxX, box.minY);
        ctx.drawImage(canvas, x1, y1, x2 - x1, y2 - y1);
      }
      ctx.restore();
      last = { wanted: keys.length, ready, failed };
    },
    /** What the last draw found: { wanted, ready, failed } charts. */
    state: () => last,
    dispose() {
      disposed = true;
      for (const entry of Object.values(charts)) entry.image.onload = entry.image.onerror = null;
    },
  };
}
