// The 3D view: the formation in the air over one fixed ground, turned with
// the mouse (drag to orbit, wheel to zoom) or the 3D settings' sliders. It
// shares the debrief's clock and readouts and draws only when something
// changed and only while it's the view showing (#39, #43). Projection, bank
// and the T-6's shape are V6's, pinned in scene.js; frame.js has the rest.
import { createCanvasSurface } from '../../../ui-kit/canvas-view.js';
import { SHIP_COLORS, OUTLINED_SHIPS, OUTLINE_COLOR } from '../state.js';
import { sampleAt } from '../../../flight-data/flight.js';
import { formationCenter, projectPoint, drawOrder, t6Points } from './scene.js';
import {
  shipsIn3d, groundDatumFt, heightLabel, groundGrid, orbit, wheelZoom, GROUND_EXTENT_FT,
} from './frame.js';

const BACKGROUND = '#050b12';
const TEXT = '#d9e6f2';
const TRAIL_SAMPLES = 80; // points along each trail, as V6
const CAPTION_BOTTOM_PX = 56;
const ALT_SCALE_LEFT_PX = 28; // the altitude ruler stands at the left edge, so it's always in view
const ft = (n) => Math.round(n).toLocaleString('en-US');

/**
 * canvas: the 3D <canvas>. timers: the module's scheduler scope. flight():
 * the loaded flight or null. time(): the playback time. settings(): the
 * layout values (cam3d, yaw3d, pitch3d, zoom3d, altScale3d, model3d,
 * planeSize3d, attLabels3d, trailSec3d, landscape3d, groundRef3d, datum3d,
 * grid3d, sticks3d, altMarks3d). fieldFt(): the home field's elevation.
 * setCamera(patch): keeps a camera change (yaw3d, pitch3d, zoom3d).
 */
export function createView3d(canvas, { timers, flight, time, settings, fieldFt, setCamera }) {
  let dragging = null; // { id, x, y, camera } while the mouse turns the view

  const cameraFrom = (on) => dragging?.camera ?? { yawDeg: on.yaw3d, pitchDeg: on.pitch3d, zoom: on.zoom3d, altScale: on.altScale3d };

  const surface = createCanvasSurface(canvas, {
    timers,
    label: '3D view of the formation: drag to turn it, scroll or press + and − to zoom',
    draw(ctx, { size }) {
      ctx.fillStyle = BACKGROUND;
      ctx.fillRect(0, 0, size.width, size.height);
      const shown = flight();
      if (!shown) return; // the screen's own message says what to load
      drawScene(ctx, size, shown, time(), settings(), cameraFrom(settings()), fieldFt());
    },
  });

  canvas.tabIndex = 0;
  const listeners = [
    ['pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, camera: cameraFrom(settings()) };
      canvas.setPointerCapture?.(e.pointerId);
      canvas.classList.add('is-dragging');
    }],
    ['pointermove', (e) => {
      if (!dragging || e.pointerId !== dragging.id) return;
      dragging.camera = orbit(dragging.camera, e.clientX - dragging.x, e.clientY - dragging.y);
      dragging.x = e.clientX;
      dragging.y = e.clientY;
      surface.requestDraw();
    }],
    ['pointerup', (e) => endDrag(e)],
    ['pointercancel', (e) => endDrag(e)],
    ['wheel', (e) => {
      e.preventDefault();
      if (!e.deltaY) return;
      setCamera({ zoom3d: wheelZoom(cameraFrom(settings()), e.deltaY).zoom });
    }],
    ['keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const deltaY = e.key === '+' || e.key === '=' ? -1 : e.key === '-' || e.key === '_' ? 1 : 0;
      if (!deltaY) return;
      e.preventDefault();
      setCamera({ zoom3d: wheelZoom(cameraFrom(settings()), deltaY).zoom });
    }],
  ];
  // The camera is kept once the drag ends, not on every move.
  function endDrag(e) {
    if (!dragging || e.pointerId !== dragging.id) return;
    const { yawDeg, pitchDeg } = dragging.camera;
    dragging = null;
    canvas.classList.remove('is-dragging');
    setCamera({ yaw3d: Math.round(yawDeg), pitch3d: Math.round(pitchDeg) });
  }
  for (const [type, fn] of listeners) canvas.addEventListener(type, fn, type === 'wheel' ? { passive: false } : undefined);

  return {
    requestDraw: surface.requestDraw,
    dispose() {
      surface.dispose();
      for (const [type, fn] of listeners) canvas.removeEventListener(type, fn);
    },
  };
}


function drawScene(ctx, size, flight, t, on, camera, fieldFt) {
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

function polygon(ctx, points) {
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
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

// A ruler of altitude every 1,000 ft beside the formation (V6 drawAltitudeScale).
function drawAltitudeScale(ctx, P, ctr, ships, datum) {
  const alts = ships.map((s) => s.altFt).filter(Number.isFinite);
  if (!alts.length) return;
  const top = Math.ceil((Math.max(...alts, ctr.z) + 1500) / 1000) * 1000;
  const base = Math.floor(datum / 1000) * 1000;
  // Heights as they stand at the formation's centre, drawn at the left edge.
  // (V6 stood it 42,000 ft west and 36,000 ft north, off the screen at most zooms.)
  const at = (altFt) => ({ x: ALT_SCALE_LEFT_PX, y: P({ x: ctr.x, y: ctr.y, altFt }).y });
  ctx.save();
  ctx.strokeStyle = TEXT;
  ctx.fillStyle = TEXT;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 2;
  ctx.font = '11px system-ui, sans-serif';
  const a = at(base);
  const b = at(top);
  ctx.beginPath();
  ctx.moveTo(a.x, Math.max(a.y, CAPTION_BOTTOM_PX));
  ctx.lineTo(b.x, Math.max(b.y, CAPTION_BOTTOM_PX));
  ctx.stroke();
  for (let alt = base; alt <= top; alt += 1000) {
    const p = at(alt);
    if (p.y < CAPTION_BOTTOM_PX) continue; // clear of the caption
    ctx.beginPath();
    ctx.moveTo(p.x - 6, p.y);
    ctx.lineTo(p.x + 6, p.y);
    ctx.stroke();
    ctx.fillText(`${ft(alt)} ft`, p.x + 10, p.y + 4);
  }
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
    ctx.font = '11px system-ui, sans-serif';
    outlined(ctx, `${ft(s.altFt - datum)} ${unit}`, (air.x + ground.x) / 2 + 8, (air.y + ground.y) / 2, TEXT);
  }
  ctx.restore();
}

function outlined(ctx, text, x, y, color) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = OUTLINE_COLOR;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// Lighter or darker by `percent` of full brightness (V6 shadeColor).
function shade(hex, percent) {
  const n = parseInt(hex.slice(1), 16);
  const part = (v) => Math.max(0, Math.min(255, Math.round(v + (percent / 100) * 255))).toString(16).padStart(2, '0');
  return `#${part((n >> 16) & 255)}${part((n >> 8) & 255)}${part(n & 255)}`;
}

const attitudeText = (s) => {
  const bank = Math.round(Math.abs(s.bankDeg));
  const pitch = Math.round(s.pitchDeg);
  return `bank ${bank}°${bank ? (s.bankDeg > 0 ? ' L' : ' R') : ''}, pitch ${pitch > 0 ? '+' : ''}${pitch}°`;
};

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

// V6's flat marker, or a dot for a ship that isn't moving (no nose to point).
function drawMarker(ctx, P, s, on) {
  const c = P(s);
  const color = SHIP_COLORS[s.slot];
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = OUTLINED_SHIPS.has(s.slot) ? OUTLINE_COLOR : '#061018';
  ctx.lineWidth = 2.5;
  if (s.hdg === null) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, 7, 0, 2 * Math.PI);
  } else {
    const size = on.planeSize3d;
    const f = { x: Math.cos(s.hdg), y: Math.sin(s.hdg) };
    const r = { x: Math.cos(s.hdg + Math.PI / 2), y: Math.sin(s.hdg + Math.PI / 2) };
    const at = (fwd, left) => P({ x: s.x + f.x * fwd + r.x * left, y: s.y + f.y * fwd + r.y * left, altFt: s.altFt });
    polygon(ctx, [at(size, 0), at(0, size * 0.45), at(-size * 0.75, 0), at(0, -size * 0.45)]);
  }
  if (!s.inGap) ctx.fill();
  ctx.stroke();
  labelShip(ctx, c, s, on);
  ctx.restore();
}

function labelShip(ctx, c, s, on) {
  ctx.font = '600 12px system-ui, sans-serif';
  outlined(ctx, `#${s.slot}`, c.x + 12, c.y - 14, SHIP_COLORS[s.slot]);
  if (on.attLabels3d && s.hdg !== null) {
    ctx.font = '10px system-ui, sans-serif';
    outlined(ctx, attitudeText(s), c.x + 12, c.y + 2, TEXT);
  }
}

// North and east on the ground, in the corner, so they stay put as the view turns (#27).
function drawCompass(ctx, size, camera) {
  const o = { x: 0, y: 0, z: 0 };
  const flat = { ...camera, altScale: 0, zoom: 1000 };
  const box = { width: 0, height: 0 };
  const origin = projectPoint({ x: 0, y: 0, altFt: 0 }, o, flat, box);
  const dir = (dx, dy) => {
    const p = projectPoint({ x: dx, y: dy, altFt: 0 }, o, flat, box);
    const len = Math.hypot(p.x - origin.x, p.y - origin.y) || 1;
    return [(p.x - origin.x) / len, (p.y - origin.y) / len];
  };
  const cx = size.width - 56;
  const cy = size.height - 56;
  ctx.save();
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.lineWidth = 3;
  for (const [label, [ux, uy], color] of [['N', dir(0, 1), '#7ee787'], ['E', dir(1, 0), '#58a6ff']]) {
    const tipX = cx + ux * 36;
    const tipY = cy + uy * 36;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.fillText(label, tipX + ux * 8 - 4, tipY + uy * 8 + 4);
  }
  ctx.restore();
}

// What the picture is scaled by, and what the heights are measured from (#26, #27).
function drawCaption(ctx, camera, on, datum) {
  ctx.save();
  ctx.font = '12px system-ui, sans-serif';
  const scale = Number.isInteger(camera.altScale) ? camera.altScale : camera.altScale.toFixed(2);
  outlined(ctx, `Altitude ×${scale}`, 14, 22, TEXT);
  const from = on.datum3d === 'field' ? 'field elevation' : on.datum3d === 'zero' ? 'sea level' : 'lowest ship less 500 ft';
  outlined(ctx, `Ground: ${ft(datum)} ft (${from})`, 14, 40, TEXT);
  ctx.restore();
}
