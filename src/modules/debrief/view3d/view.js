// The 3D view: the formation in the air over one fixed ground, turned with
// the mouse (drag to orbit, wheel to zoom: input.js) or the 3D settings' sliders. It
// shares the debrief's clock and readouts and draws only when something
// changed and only while it's the view showing (#39, #43). Projection, bank
// and the T-6's shape are V6's, pinned in scene.js; frame.js has the rest.
import { createCanvasSurface } from '../../../ui-kit/canvas-view.js';
import { SHIP_COLORS, OUTLINED_SHIPS, OUTLINE_COLOR } from '../state.js';
import { sampleAt } from '../../../flight-data/flight.js';
import { formationCenter, projectPoint, drawOrder, t6Points } from './scene.js';
import {
  shipsIn3d, groundDatumFt, heightLabel, groundGrid, GROUND_EXTENT_FT,
} from './frame.js';
import { attachCameraInput } from './input.js';
import {
  polygon, drawStickLabel, drawAltitudeScale, drawMarker, labelShip, drawCompass, drawCaption, drawTennis3d,
} from './overlay.js';

const BACKGROUND = '#050b12';
const TRAIL_SAMPLES = 80; // points along each trail, as V6

/**
 * canvas: the 3D <canvas>. timers: the module's scheduler scope. flight():
 * the loaded flight or null. time(): the playback time. settings(): the
 * layout values (cam3d, yaw3d, pitch3d, zoom3d, altScale3d, model3d,
 * planeSize3d, attLabels3d, trailSec3d, landscape3d, groundRef3d, datum3d,
 * grid3d, sticks3d, altMarks3d). fieldFt(): the home field's elevation.
 * setCamera(patch): keeps a camera change (yaw3d, pitch3d, zoom3d).
 */
export function createView3d(canvas, { timers, flight, time, settings, fieldFt, setCamera, tennis = () => null }) {
  let input = null;
  const surface = createCanvasSurface(canvas, {
    timers,
    label: '3D view of the formation: drag to turn it, scroll or press + and − to zoom',
    draw(ctx, { size }) {
      ctx.fillStyle = BACKGROUND;
      ctx.fillRect(0, 0, size.width, size.height);
      const shown = flight();
      if (!shown) return; // the screen's own message says what to load
      drawScene(ctx, size, shown, time(), settings(), input.camera(), fieldFt(), tennis());
    },
  });
  input = attachCameraInput(canvas, { settings, setCamera, redraw: surface.requestDraw });

  return {
    requestDraw: surface.requestDraw,
    dispose() {
      surface.dispose();
      input.dispose();
    },
  };
}


function drawScene(ctx, size, flight, t, on, camera, fieldFt, ball) {
  const ships = shipsIn3d(flight, t);
  const live = Object.fromEntries(ships.map((s) => [s.slot, s]));
  const ctr = formationCenter(live, on.cam3d);
  const P = (p) => projectPoint(p, ctr, camera, size);
  const datum = groundDatumFt(ships, on.datum3d, fieldFt);

  if (on.landscape3d) drawLandscape(ctx, size, P, ctr, datum);
  if (on.groundRef3d) drawGround(ctx, P, ctr, datum, on.grid3d);
  else if (on.grid3d) drawGridLines(ctx, P, ctr, datum);
  if (on.altMarks3d) drawAltitudeScale(ctx, P, ctr, ships, datum);
  drawTrails(ctx, P, flight, t, on.trailSec3d);
  if (on.sticks3d) drawSticks(ctx, P, ships, datum, heightLabel(on.datum3d));
  // Far aircraft first, so near ones are painted over them (#27).
  for (const ship of drawOrder(ships, (s) => P(s).depth)) {
    if (on.model3d === 't6' && ship.hdg !== null) drawT6(ctx, P, ship, on);
    else drawMarker(ctx, P, ship, on);
  }
  if (ball?.points) drawTennis3d(ctx, P, ball);
  if (on.groundRef3d) drawCompass(ctx, size, camera);
  drawCaption(ctx, camera, on, datum);
}

// V6's sky and ground colours, with ridges fixed to the ground (#27).
function drawLandscape(ctx, size, P, ctr, datum) {
  ctx.save();
  const sky = ctx.createLinearGradient(0, 0, 0, size.height);
  sky.addColorStop(0, '#07111c');
  sky.addColorStop(0.42, '#0b1c2b');
  sky.addColorStop(0.43, '#102416');
  sky.addColorStop(1, '#07100a');
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, size.width, size.height);
  const { xs, ys } = groundGrid(ctr, 65_000, 10_000);
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#1f5c33';
  ctx.lineWidth = 1;
  for (const y of ys) {
    ctx.beginPath();
    xs.forEach((x, i) => {
      const p = P({ x, y: y + Math.sin((x + y) * 0.00013) * 650, altFt: datum });
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }
  ctx.restore();
}

// The datum plane with its edge and the grid on it (V6's ground reference).
function drawGround(ctx, P, ctr, datum, withGrid) {
  const { min, max } = groundGrid(ctr, GROUND_EXTENT_FT, 10_000);
  const corners = [[min.x, min.y], [max.x, min.y], [max.x, max.y], [min.x, max.y]].map(([x, y]) => P({ x, y, altFt: datum }));
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#17351b';
  polygon(ctx, corners);
  ctx.fill();
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = 'rgba(126, 231, 135, 0.65)';
  ctx.lineWidth = 2;
  polygon(ctx, corners);
  ctx.stroke();
  ctx.restore();
  if (withGrid) drawGridLines(ctx, P, ctr, datum);
}

function drawGridLines(ctx, P, ctr, datum) {
  const { xs, ys, min, max } = groundGrid(ctr);
  ctx.save();
  ctx.strokeStyle = 'rgba(126, 231, 135, 0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const x of xs) {
    const a = P({ x, y: min.y, altFt: datum });
    const b = P({ x, y: max.y, altFt: datum });
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  for (const y of ys) {
    const a = P({ x: min.x, y, altFt: datum });
    const b = P({ x: max.x, y, altFt: datum });
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.restore();
}

// Each ship's last `seconds`, broken where it's in a GPS gap (V6 drawTrails).
function drawTrails(ctx, P, flight, t, seconds) {
  if (!(seconds > 0)) return;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.55;
  for (const tr of Object.values(flight.tracks)) {
    const t0 = Math.max(flight.startT, t - seconds);
    ctx.strokeStyle = SHIP_COLORS[tr.slot];
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= TRAIL_SAMPLES; i++) {
      const s = sampleAt(tr, t0 + ((t - t0) * i) / TRAIL_SAMPLES);
      if (s.inGap) {
        pen = false;
        continue;
      }
      const p = P({ x: s.xFt, y: s.yFt, altFt: s.altFt });
      if (pen) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
      pen = true;
    }
    ctx.stroke();
  }
  ctx.restore();
}

// A dashed stick from each ship down to the datum, its shadow, and its height (#26).
function drawSticks(ctx, P, ships, datum, unit) {
  ctx.save();
  for (const s of ships) {
    const air = P(s);
    const ground = P({ x: s.x, y: s.y, altFt: datum });
    const color = SHIP_COLORS[s.slot];
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    ctx.moveTo(air.x, air.y);
    ctx.lineTo(ground.x, ground.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(ground.x, ground.y, 18, 7, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.globalAlpha = 1;
    drawStickLabel(ctx, air, ground, s.altFt - datum, unit);
  }
  ctx.restore();
}

// Lighter or darker by `percent` of full brightness (V6 shadeColor).
function shade(hex, percent) {
  const n = parseInt(hex.slice(1), 16);
  const part = (v) => Math.max(0, Math.min(255, Math.round(v + (percent / 100) * 255))).toString(16).padStart(2, '0');
  return `#${part((n >> 16) & 255)}${part((n >> 8) & 255)}${part(n & 255)}`;
}

// V6's low-poly T-6 as one body rolled and pitched (scene.js t6Points, #14, #27).
function drawT6(ctx, P, s, on) {
  const w = t6Points(s, s.hdg, (s.bankDeg * Math.PI) / 180, (s.pitchDeg * Math.PI) / 180, on.planeSize3d);
  const q = Object.fromEntries(Object.entries(w).map(([k, p]) => [k, P(p)]));
  const c = P(s);
  const base = SHIP_COLORS[s.slot];
  const light = shade(base, 28);
  const dark = shade(base, -22);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(220, 235, 255, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(q.propL.x, q.propL.y);
  ctx.lineTo(q.propR.x, q.propR.y);
  ctx.stroke();
  ctx.strokeStyle = OUTLINED_SHIPS.has(s.slot) ? OUTLINE_COLOR : '#061018';
  const face = (fill, points) => {
    ctx.fillStyle = fill;
    polygon(ctx, points);
    ctx.fill();
    ctx.stroke();
  };
  // The lower wing is the darker one.
  face(s.bankDeg >= 0 ? dark : light, [q.wingRootL, q.wingL, c]);
  face(s.bankDeg >= 0 ? light : dark, [q.wingRootR, q.wingR, c]);
  face(shade(base, -5), [q.tail, q.stabL, q.stabR]);
  face(base, [q.spinner, q.fuseL, q.aftL, q.tail, q.aftR, q.fuseR]);
  face(shade(base, 18), [q.tail, q.fin, q.aftL]);
  ctx.fillStyle = 'rgba(210, 235, 255, 0.85)';
  ctx.beginPath();
  ctx.arc(q.canopy.x, q.canopy.y, 4, 0, 2 * Math.PI);
  ctx.fill();
  labelShip(ctx, c, s, on);
  ctx.restore();
}


