// The EM chart (SPEC-debrief: EM chart): each ship's estimated IAS against
// its turn rate over the T-6 energy-manoeuvrability chart for 6,500, 8,000 or
// 13,000 ft, with a fading 60 s trail. The numbers are core's emPoint (turn
// rate without V6's divide by 2, D39); the chart's plot box and scales are
// V6's (kmlEmIsolated script). The panel opens from Tools, sits below the
// stage so it never covers the map (#37), and draws nothing while closed (#39).
import { emPoint } from '../../core/flight-math.js';
import { sampleAt } from '../../flight-data/flight.js';
import { createCanvasSurface } from '../../ui-kit/canvas-view.js';
import { SHIP_COLORS, OUTLINED_SHIPS } from './state.js';

/** V6's three charts: the image and the top of its turn-rate scale (°/s). */
export const EM_CHARTS = Object.freeze({
  6500: Object.freeze({ file: 'media/debrief/em-6500.jpg', turnRateMax: 35 }),
  8000: Object.freeze({ file: 'media/debrief/em-8000.jpg', turnRateMax: 35 }),
  13000: Object.freeze({ file: 'media/debrief/em-13000.jpg', turnRateMax: 30 }),
});
export const EM_ALTITUDES = Object.freeze([6500, 8000, 13000]);

/**
 * Where the plot sits in V6's 1024 × 512 chart images, and its IAS scale
 * (knots). Turn rate runs from 0 at the bottom to the chart's turnRateMax.
 */
export const EM_PLOT = Object.freeze({ width: 1024, height: 512, left: 45, right: 1015, top: 67, bottom: 444, iasMin: 70, iasMax: 330 });

/** The trail's length (V6's 60 s) and the spacing of its points. */
export const EM_TRAIL_S = 60;
const TRAIL_STEP_S = 0.5;

/**
 * Which chart to show (V6 chooseChart): the one picked by hand, or with
 * 'auto' the one nearest the formation's average altitude (6,500 with none).
 */
export function chooseEmChart(choice, altitudes) {
  if (choice !== 'auto') return Number(choice);
  const alts = altitudes.filter(Number.isFinite);
  if (!alts.length) return 6500;
  const mean = alts.reduce((a, b) => a + b, 0) / alts.length;
  return EM_ALTITUDES.reduce((best, a) => (Math.abs(a - mean) < Math.abs(best - mean) ? a : best));
}

/** A point (IAS kt, turn rate °/s) on a chart drawn `width` × `height`, as [x, y] (V6 px and py). */
export function emToScreen(iasKt, turnRateDeg, altitude, width, height) {
  const sx = width / EM_PLOT.width;
  const sy = height / EM_PLOT.height;
  const left = EM_PLOT.left * sx;
  const right = EM_PLOT.right * sx;
  const top = EM_PLOT.top * sy;
  const bottom = EM_PLOT.bottom * sy;
  return [
    left + ((iasKt - EM_PLOT.iasMin) / (EM_PLOT.iasMax - EM_PLOT.iasMin)) * (right - left),
    bottom - (turnRateDeg / EM_CHARTS[altitude].turnRateMax) * (bottom - top),
  ];
}

const at = (s) => ({ x: s.xFt, y: s.yFt, altFt: s.altFt, spdKt: s.speedKt });

/** A ship's EM point at t from its track, or null in a GPS gap. */
export function emAt(track, t) {
  const now = sampleAt(track, t);
  if (now.inGap) return null;
  return emPoint(at(sampleAt(track, t - 1)), at(now), at(sampleAt(track, t + 1)));
}

/**
 * A ship's trail: its EM points over the last 60 s up to t, oldest first, as
 * { t, iasKt, turnRateDeg }, broken (null) across GPS gaps. Worked out from the
 * track, so it's the same after a seek or a pause as while playing (V6 built
 * it only while playing, and lost it on a seek back).
 */
export function emTrail(track, t, startT = -Infinity) {
  const out = [];
  const from = Math.max(startT, t - EM_TRAIL_S);
  for (let s = t - Math.floor((t - from) / TRAIL_STEP_S) * TRAIL_STEP_S; s <= t + 1e-9; s += TRAIL_STEP_S) {
    const p = emAt(track, s);
    out.push(p ? { t: s, iasKt: p.iasKt, turnRateDeg: p.turnRateDeg } : null);
  }
  return out;
}

/**
 * The EM panel's canvas. flight(), time(), settings() ({ emChart, emTrail })
 * are read at each draw. base: the site's address, for the chart images.
 * onChart(altitude): after each draw, the chart shown. Returns { requestDraw, dispose }.
 */
export function createEmView(canvas, { timers, base, flight, time, settings, onChart = () => {} }) {
  const images = {};
  let disposed = false;

  function image(altitude) {
    if (!images[altitude]) {
      const img = new Image();
      img.onload = () => !disposed && surface.requestDraw();
      img.src = new URL(EM_CHARTS[altitude].file, base).href;
      images[altitude] = img;
    }
    return images[altitude];
  }

  const surface = createCanvasSurface(canvas, {
    timers,
    label: 'EM chart: each aircraft\'s estimated IAS against its turn rate',
    draw(ctx, { size }) {
      const on = settings();
      if (!on.emOpen) return; // closed: nothing drawn, no chart fetched (R5, #39)
      const shown = flight();
      const t = time();
      const tracks = shown ? Object.values(shown.tracks).sort((a, b) => a.slot - b.slot) : [];
      const altitude = chooseEmChart(on.emChart, tracks.map((tr) => sampleAt(tr, t).altFt));
      onChart(altitude);
      const img = image(altitude);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size.width, size.height);
      if (img.complete && img.naturalWidth) ctx.drawImage(img, 0, 0, size.width, size.height);
      const P = (ias, tr) => emToScreen(ias, tr, altitude, size.width, size.height);
      if (on.emTrail) for (const tr of tracks) drawTrail(ctx, P, emTrail(tr, t, shown.startT), t, SHIP_COLORS[tr.slot]);
      for (const tr of tracks) {
        const p = emAt(tr, t);
        if (p) drawShip(ctx, P(p.iasKt, p.turnRateDeg), tr.slot);
      }
    },
  });

  return {
    requestDraw: surface.requestDraw,
    dispose() {
      disposed = true;
      for (const img of Object.values(images)) img.onload = null;
      surface.dispose();
    },
  };
}

// V6's smoothed trail, fading with age from 0.62 to 0.06, broken across gaps.
function drawTrail(ctx, P, points, t, color) {
  ctx.save();
  ctx.strokeStyle = color === '#ffffff' ? '#1a1a1a' : color; // #4 is white: dark on the white chart
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let run = [];
  const flush = () => {
    for (let j = 1; j < run.length; j++) {
      const [x0, y0] = P(run[Math.max(0, j - 2)].iasKt, run[Math.max(0, j - 2)].turnRateDeg);
      const [x1, y1] = P(run[j - 1].iasKt, run[j - 1].turnRateDeg);
      const [x2, y2] = P(run[j].iasKt, run[j].turnRateDeg);
      ctx.globalAlpha = Math.max(0.06, 0.62 * (1 - (t - run[j].t) / EM_TRAIL_S));
      ctx.beginPath();
      ctx.moveTo(j === 1 ? x1 : (x0 + x1) / 2, j === 1 ? y1 : (y0 + y1) / 2);
      ctx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
      ctx.stroke();
    }
    run = [];
  };
  for (const p of points) {
    if (p) run.push(p);
    else flush();
  }
  flush();
  ctx.restore();
}

function drawShip(ctx, [x, y], slot) {
  ctx.save();
  ctx.fillStyle = SHIP_COLORS[slot];
  ctx.strokeStyle = OUTLINED_SHIPS.has(slot) ? '#000000' : '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#000000';
  ctx.fillStyle = '#ffffff';
  ctx.strokeText(`#${slot}`, x + 9, y - 7);
  ctx.fillText(`#${slot}`, x + 9, y - 7);
  ctx.restore();
}
