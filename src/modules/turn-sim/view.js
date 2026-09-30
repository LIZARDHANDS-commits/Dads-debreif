// The Turn Sim's picture: the ui-kit canvas view (drag to pan, wheel or +/- to
// zoom) with V6's layers on it: grid, MOA box, Lead's 3/9 line, trails,
// breadcrumbs, spacing lines, turn circles, clock marks, aircraft with their
// numbers, and error labels. World units are feet, x east, y north; headings
// are math radians (0 = east, counter-clockwise). It draws only when asked
// (a step, a setting, the view or the size), so a paused sim draws nothing.
import { createCanvasView } from '../../ui-kit/canvas-view.js';
import { turnRadiusFt, limitG, MIN_TURN_G } from '../../core/flight-math.js';
import { ktToFtps, formatNm } from '../../core/units.js';
import { pairDistances, ft } from './readouts.js';
import { SHIP_COLORS, OUTLINED_SHIPS } from './layout.js';

const FT_PER_NM = 6076.11549;
const BACKGROUND = '#071018'; // V6's
const OUTLINE = '#02060a';
const FONT = 'system-ui, sans-serif';
const TRAIL_ALPHA = 0.55;
const LABEL_TONES = { good: '#7ee787', caution: '#ffcc66', none: '#9bb8c6' };
const SPACING_LINES = new Set(['1-2', '1-3', '1-4', '3-4']); // V6 drew these four
/** The widest and narrowest picture, in feet across: the whole MOA and a bit more, down to a few hundred feet. */
const MIN_SPAN_FT = 400;
const MAX_SPAN_FT = 60 * FT_PER_NM * 2;
const FIT_PADDING_PX = 40;

/** Bounds { minX, minY, maxX, maxY } of some { x, y } points, or null with none. */
export function boundsOf(points) {
  if (!points.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/**
 * The bounds of the whole planned run: every aircraft's start, and where the
 * turn takes it (flown once, ahead of time, on a scratch run) so the picture
 * fitted on open shows the turn as well as the start. `run` is a fresh
 * createRun(settings); it's stepped until it finishes (its Duration), or maxSteps.
 */
export function plannedBounds(run, maxSteps = 12100) {
  const points = [];
  const take = (state) => {
    for (const a of state.aircraft) points.push({ x: a.xFt, y: a.yFt });
  };
  take(run.state);
  for (let i = 0; i < maxSteps && !run.state.finished; i++) {
    run.step();
    // Every second is enough for a bounding box.
    if (i % 20 === 0) take(run.state);
  }
  take(run.state);
  return boundsOf(points);
}

/**
 * canvas: the picture's <canvas>. timers: the module's scheduler scope.
 * source: { state(), trails(), layers(), settings(), labels() }
 *   state(): the engine's state; trails(): { trail: { id: [[t, x, y], …] }, marks: { id: […] } };
 *   layers(): the remembered layer settings; settings(): the Turn Sim settings;
 *   labels(): { id: { text, tone } } for the error labels.
 */
export function createTurnSimView(canvas, { timers, source, onUserMove }) {
  let needsFit = null; // bounds to fit at the next draw, once the canvas has its real size
  let ready = false;

  const map = createCanvasView(canvas, {
    timers,
    minSpan: MIN_SPAN_FT,
    maxSpan: MAX_SPAN_FT,
    label: 'The formation from above. Drag to move, scroll or press + and − to zoom.',
    onUserMove,
    draw(ctx) {
      if (needsFit && ready && map.size.width > 0 && map.size.height > 0) { // a hidden canvas (3D is showing) has no size: keep the fit for when 2D is back
        const bounds = needsFit;
        needsFit = null;
        map.fit(bounds, FIT_PADDING_PX);
      }
      const state = source.state();
      const layers = source.layers();
      const settings = source.settings();
      const lead = state.aircraft.find((a) => a.id === 1);
      if (layers.followLead && lead && (lead.xFt !== map.view.cx || lead.yFt !== map.view.cy)) map.setCenter(lead.xFt, lead.yFt);

      const { width, height } = map.size;
      ctx.fillStyle = BACKGROUND;
      ctx.fillRect(0, 0, width, height);
      drawGrid(ctx, map);
      drawMoa(ctx, map, settings.moaBoundaryNm);
      if (layers.lead39 && lead) drawLead39(ctx, map, lead);
      const { trail, marks } = source.trails();
      drawTrails(ctx, map, trail);
      if (layers.breadcrumbs) drawBreadcrumbs(ctx, map, marks, layers.crumbSec, state.tSec);
      if (layers.spacingLines) drawSpacingLines(ctx, map, state, layers.distNm);
      if (layers.turnCircles && !state.finished) drawTurnCircles(ctx, map, state, settings);
      if (layers.clockMarks) for (const a of state.aircraft) drawClockMarks(ctx, map, a);
      for (const a of state.aircraft) drawAircraft(ctx, map, a);
      if (layers.errorLabels) drawErrorLabels(ctx, map, state, source.labels());
    },
  });

  return {
    map,
    requestDraw: map.requestDraw,
    /** The screen is sized (the stylesheet has loaded), so a waiting fit can go ahead. */
    setReady() {
      ready = true;
      map.requestDraw();
    },
    /** Fits `bounds` at the next draw, at the real canvas size and pixel ratio (#30). */
    fit(bounds) {
      if (!bounds) return;
      needsFit = bounds;
      map.requestDraw();
    },
    dispose: () => map.dispose(),
  };
}

// ---- drawing pieces ---------------------------------------------------------

function text(ctx, str, x, y, color, size = 12, align = 'left') {
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(2, 10, 16, 0.85)';
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.textAlign = 'left';
}

function drawGrid(ctx, map) {
  // One line a nautical mile, or every few when they'd be too close together.
  let step = FT_PER_NM;
  while (step * map.view.scale < 14) step *= 5;
  const { minX, minY, maxX, maxY } = map.visibleBounds();
  ctx.strokeStyle = '#142334';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.floor(minX / step) * step; x <= maxX; x += step) {
    const [sx] = map.worldToScreen(x, 0);
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, map.size.height);
  }
  for (let y = Math.floor(minY / step) * step; y <= maxY; y += step) {
    const [, sy] = map.worldToScreen(0, y);
    ctx.moveTo(0, sy);
    ctx.lineTo(map.size.width, sy);
  }
  ctx.stroke();
}

/** V6's MOA boundary: a square centred on the origin, not on Lead, so the formation can cross it. */
function drawMoa(ctx, map, nm) {
  const half = Math.max(1, nm) * FT_PER_NM / 2;
  const [x1, y1] = map.worldToScreen(-half, half);
  const [x2, y2] = map.worldToScreen(half, -half);
  ctx.save();
  ctx.strokeStyle = '#d0a0ff';
  ctx.fillStyle = 'rgba(208, 160, 255, 0.07)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
  ctx.restore();
}

/** Lead's 3/9 line: across Lead's heading, through Lead (V6 drawLead39Line, line 1757). */
function drawLead39(ctx, map, lead) {
  const left = { x: Math.cos(lead.headingRad + Math.PI / 2), y: Math.sin(lead.headingRad + Math.PI / 2) };
  const len = Math.max(map.size.width, map.size.height) / map.view.scale * 0.75;
  const [ax, ay] = map.worldToScreen(lead.xFt - left.x * len, lead.yFt - left.y * len);
  const [bx, by] = map.worldToScreen(lead.xFt + left.x * len, lead.yFt + left.y * len);
  const [cx, cy] = map.worldToScreen(lead.xFt, lead.yFt);
  ctx.save();
  ctx.strokeStyle = '#58a6ff';
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.restore();
  text(ctx, 'Lead 3/9', cx - 16, cy - 26, '#b9d8f5', 11, 'right'); // above the line, off the circle labels below
}

function drawTrails(ctx, map, trail) {
  ctx.save();
  ctx.globalAlpha = TRAIL_ALPHA;
  for (const [id, points] of Object.entries(trail)) {
    if (points.length < 2) continue;
    ctx.strokeStyle = SHIP_COLORS[id] ?? '#d9e6f2';
    ctx.lineWidth = OUTLINED_SHIPS.has(Number(id)) ? 3 : 2;
    ctx.beginPath();
    points.forEach(([, x, y], i) => {
      const [sx, sy] = map.worldToScreen(x, y);
      if (i) ctx.lineTo(sx, sy);
      else ctx.moveTo(sx, sy);
    });
    ctx.stroke();
  }
  ctx.restore();
}

/** A dot and the time at every `every` seconds along each path, for the run so far. */
function drawBreadcrumbs(ctx, map, marks, every, now) {
  const step = Math.max(1, Math.round(every));
  for (const [id, points] of Object.entries(marks)) {
    ctx.fillStyle = SHIP_COLORS[id] ?? '#d9e6f2';
    for (const [t, x, y] of points) {
      if (t > now + 1e-9 || Math.round(t) % step !== 0) continue;
      const [sx, sy] = map.worldToScreen(x, y);
      ctx.beginPath();
      ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, `${Math.round(t)}s`, sx + 4, sy - 4, '#c9d1d9', 10);
    }
  }
}

function drawSpacingLines(ctx, map, state, withNm) {
  const byId = new Map(state.aircraft.map((a) => [a.id, a]));
  ctx.save();
  ctx.strokeStyle = '#6f8497';
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1;
  for (const pair of pairDistances(state)) {
    if (!SPACING_LINES.has(pair.label)) continue;
    const a = byId.get(pair.a);
    const b = byId.get(pair.b);
    const [ax, ay] = map.worldToScreen(a.xFt, a.yFt);
    const [bx, by] = map.worldToScreen(b.xFt, b.yFt);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    // A pair whose middle is on a third aircraft (#1 to #4 passes over #3) prints above that aircraft's "#3" tag, not on it.
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const onShip = state.aircraft.some((c) => c.id !== pair.a && c.id !== pair.b && Math.hypot(map.worldToScreen(c.xFt, c.yFt)[0] - mx, map.worldToScreen(c.xFt, c.yFt)[1] - my) < 30);
    text(ctx, withNm ? formatNm(pair.distFt) : ft(pair.distFt), mx, my - (onShip ? 24 : 6), '#c9d1d9', 11, 'center');
    ctx.setLineDash([6, 6]);
  }
  ctx.restore();
}

/** The G an aircraft is flying, so its circle is the circle it flies (never below the 1.01 G floor). */
export function circleG(aircraft, settings) {
  return limitG(aircraft.g > MIN_TURN_G ? aircraft.g : settings.baseG);
}

/** Each aircraft's turn circle at the G it flies, labelled with G and radius (V6 drawTurnCircles, line 1851). */
function drawTurnCircles(ctx, map, state, settings) {
  const v = ktToFtps(settings.speedKt);
  const scale = map.view.scale;
  for (const a of state.aircraft) {
    const g = circleG(a, settings);
    const r = turnRadiusFt(v, g);
    // The engine's state doesn't say which way each aircraft turns yet (a wingman may turn away from Lead's side),
    // so the circle is on the set direction's side. TODO: draw a.turnDir once the engine's state carries it.
    const dir = a.turnDir ?? (settings.direction === 'right' ? -1 : 1); // V6: -1 right, +1 left
    const [cx, cy] = map.worldToScreen(a.xFt + Math.cos(a.headingRad + dir * Math.PI / 2) * r, a.yFt + Math.sin(a.headingRad + dir * Math.PI / 2) * r);
    const color = SHIP_COLORS[a.id];
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // Under the circle, so it never sits on the spacing lines through the aircraft.
    // Neighbours in a tight picture stagger by a row, so their words do not run together.
    text(ctx, `#${a.id} ${g.toFixed(1)} G, R ${ft(r)}`, cx, cy + r * scale + 14 + (a.id % 2 === 0 ? 13 : 0), color, 11, 'center');
  }
}

/** A 12-position clock ring around an aircraft, with its nose at 12 (V6 drawClockMarks, line 1716). */
function drawClockMarks(ctx, map, a) {
  const [x, y] = map.worldToScreen(a.xFt, a.yFt);
  const r = 42;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 2 - a.headingRad);
  ctx.strokeStyle = SHIP_COLORS[a.id];
  ctx.fillStyle = SHIP_COLORS[a.id];
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.5;
  ctx.font = `10px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 12; i++) {
    const ang = i * Math.PI * 2 / 12 - Math.PI / 2;
    const major = i % 3 === 0;
    const inner = r - (major ? 10 : 5);
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * inner, Math.sin(ang) * inner);
    ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    ctx.stroke();
    if (major) {
      // Numbers stay upright: undo the rotation for the text.
      ctx.save();
      ctx.translate(Math.cos(ang) * (r + 9), Math.sin(ang) * (r + 9));
      ctx.rotate(a.headingRad - Math.PI / 2);
      ctx.fillText(String(i === 0 ? 12 : i), 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}

/** The aircraft: a nose-up arrow turned to its heading, with its number. #4 is white with a dark outline (#29). */
function drawAircraft(ctx, map, a) {
  const [x, y] = map.worldToScreen(a.xFt, a.yFt);
  const s = 15;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 2 - a.headingRad);
  ctx.fillStyle = SHIP_COLORS[a.id];
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINED_SHIPS.has(a.id) ? 3 : 2;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(s * 0.55, s * 0.65);
  ctx.lineTo(0, s * 0.35);
  ctx.lineTo(-s * 0.55, s * 0.65);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.restore();
  text(ctx, `#${a.id}`, x + 12, y - 10, '#ffffff', 12);
}

/** Each wingman's label in words, beside it (V6 drawErrorLabels, line 1947). */
function drawErrorLabels(ctx, map, state, labels) {
  for (const a of state.aircraft) {
    const label = labels[a.id];
    if (!label) continue;
    const [x, y] = map.worldToScreen(a.xFt, a.yFt);
    text(ctx, label.text, x + 14, y + 20, LABEL_TONES[label.tone] ?? LABEL_TONES.none, 11);
  }
}
