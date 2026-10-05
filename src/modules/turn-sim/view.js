// The Turn Sim's picture: the ui-kit canvas view (drag to pan, wheel or +/- to
// zoom) with V6's layers on it: grid, MOA box, Lead's 3/9 line, trails,
// breadcrumbs, spacing lines, turn circles, clock marks, aircraft with their
// numbers, and error labels. The first version's live screen adds a camera that
// follows the formation, the planned paths drawn dashed, and leaves the MOA box
// and the V6-only layers off. World units are feet, x east, y north; headings
// are math radians (0 = east, counter-clockwise). It draws only when asked
// (a step, a setting, the view or the size), so a paused sim draws nothing.
import { createCanvasView } from '../../ui-kit/canvas-view.js';
import { turnRadiusFt, turnRadiusFromBankFt, limitG, MIN_TURN_G } from '../../core/flight-math.js';
import { ktToFtps, formatNm } from '../../core/units.js';
import { pairDistances, ft } from './readouts.js';
import { SHIP_COLORS, OUTLINED_SHIPS } from './layout.js';
import { FW_TURN } from './live/formation-turns.js';

const FT_PER_NM = 6076.11549;
const BACKGROUND = '#071018'; // V6's
const OUTLINE = '#02060a';
const FONT = 'system-ui, sans-serif';
const TRAIL_ALPHA = 0.55;
const LABEL_TONES = { good: '#7ee787', caution: '#ffcc66', none: '#9bb8c6' };
const SPACING_LINES = new Set(['1-2', '1-3', '1-4', '3-4']); // V6 drew these four
/** The widest and narrowest picture, in feet across: the whole MOA and a bit more, down to a few hundred feet. */
const MIN_SPAN_FT = 120; // down to an echelon: the pair about 45 ft apart (spec section 10)
const MAX_SPAN_FT = 60 * FT_PER_NM * 2;
const FIT_PADDING_PX = 40;
/** How far the follow camera's zoom moves toward the zoom it wants, each frame: a gentle ease rather than a jump. */
const FOLLOW_ZOOM_EASE = 0.08;

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
 * source: { state(), trails(), layers(), settings(), labels(), follow?(), planned?() }
 *   state(): the engine's state; trails(): { trail: { id: [[t, x, y], …] }, marks: { id: […] } };
 *   layers(): the remembered layer settings; settings(): the Turn Sim settings;
 *   labels(): { id: { text, tone } } for the error labels.
 *   follow(): { x, y, spanXFt, spanYFt, zoom, snap } to keep centred and in view, or null to leave the camera where the person put it (the live screen's camera);
 *   planned(): { id: [[t, x, y, …], …] }, paths still to fly, drawn dashed when layers().planned is on.
 *   tags?(): { id: { title, detail, power } }, the info tags (tags.js), drawn when layers().tags is on.
 */
export function createTurnSimView(canvas, { timers, source, onUserMove }) {
  let needsFit = null; // bounds to fit at the next draw, once the canvas has its real size
  let ready = false;
  let drawnScale = 1; // the zoom the last frame was drawn at, so a move by the person can be told as a zoom or a pan

  const map = createCanvasView(canvas, {
    timers,
    minSpan: MIN_SPAN_FT,
    maxSpan: MAX_SPAN_FT,
    label: 'The formation from above. Drag to move, scroll or press + and − to zoom.',
    // onUserMove(kind, ratio): 'zoom' with how much the zoom changed, or 'pan'
    onUserMove: () => {
      const ratio = map.view.scale / drawnScale;
      drawnScale = map.view.scale;
      onUserMove?.(Math.abs(ratio - 1) > 1e-9 ? 'zoom' : 'pan', ratio);
    },
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
      const follow = source.follow?.();
      if (follow) followFormation(map, follow);
      else if (layers.followLead && lead && (lead.xFt !== map.view.cx || lead.yFt !== map.view.cy)) map.setCenter(lead.xFt, lead.yFt);

      drawnScale = map.view.scale;
      const { width, height } = map.size;
      ctx.fillStyle = BACKGROUND;
      ctx.fillRect(0, 0, width, height);
      drawGrid(ctx, map);
      if (Number.isFinite(settings.moaBoundaryNm)) drawMoa(ctx, map, settings.moaBoundaryNm);
      // The Cone, the 3/9 and the 7/5 lines, for each aircraft ticked in its list (Patrick, 5 Oct).
      for (const a of state.aircraft) {
        if (layers.cone && layers[`cone_${a.id}`]) drawCone(ctx, map, a);
        if (layers.lead39 && layers[`l39_${a.id}`]) drawLead39(ctx, map, a);
        if (layers.lead75 && layers[`l75_${a.id}`]) drawLead75(ctx, map, a);
      }
      const { trail, marks } = source.trails();
      if (layers.tracks !== false) drawTrails(ctx, map, trail);
      if (layers.planned && source.planned) drawPlanned(ctx, map, source.planned(), state.tSec);
      const tags = layers.tags ? source.tags?.() : null;
      const rejoin = source.rejoin?.();
      // The range line sits under #2's tag, a line lower when the tag shows a power line.
      if (rejoin) drawRejoin(ctx, map, state, rejoin, tags?.[rejoin.wingId]?.power ? 11 : 0);
      if (layers.breadcrumbs) drawBreadcrumbs(ctx, map, marks, layers.crumbSec, state.tSec);
      if (layers.spacingLines) drawSpacingLines(ctx, map, state, layers.distNm);
      if (layers.turnCircles && !state.finished) {
        if (source.follow) drawBankCircles(ctx, map, state);
        else drawTurnCircles(ctx, map, state, settings);
      }
      if (layers.clockMarks) for (const a of state.aircraft) drawClockMarks(ctx, map, a);
      for (const a of state.aircraft) drawAircraft(ctx, map, a, !tags);
      if (tags) drawTags(ctx, map, state, tags);
      if (layers.errorLabels) drawErrorLabels(ctx, map, state, source.labels(), tags);
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

/**
 * The live screen's camera: centred on (x, y), and zoomed so a box spanXFt by
 * spanYFt fits the picture (or a square spanFt across fits its shorter side). The
 * zoom eases toward that, or jumps to it when snap; follow.zoom false keeps the
 * zoom as it is.
 */
function followFormation(map, { x, y, spanFt = 0, spanXFt = spanFt, spanYFt = spanFt, zoom = true, snap = false, zoomFactor = 1 }) {
  const { width, height } = map.size;
  let scale = map.view.scale;
  if (zoom && width > 0 && height > 0 && spanXFt > 0 && spanYFt > 0) {
    const want = Math.min(width / spanXFt, height / spanYFt) * zoomFactor; // zoomFactor: the person's wheel zoom on top of the fit
    scale = snap ? want : scale + (want - scale) * FOLLOW_ZOOM_EASE;
  }
  if (x !== map.view.cx || y !== map.view.cy || scale !== map.view.scale) map.setView({ cx: x, cy: y, scale });
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

const shipName = (a) => (a.id === 1 ? 'Lead' : `#${a.id}`);

/**
 * The fighting wing cone behind an aircraft, both sides, lightly shaded in its colour: 30-60° of sweep back from its wing
 * line and 500-1,000 ft from it (SMM 12.29 para 69, Fig 12.19; FW_TURN.band). Patrick, 5 Oct.
 */
function drawCone(ctx, map, a) {
  const { minFt, maxFt, minSweepDeg, maxSweepDeg } = FW_TURN.band;
  const deg = Math.PI / 180;
  const steps = 12;
  ctx.save();
  ctx.fillStyle = SHIP_COLORS[a.id] ?? '#d9e6f2';
  ctx.strokeStyle = SHIP_COLORS[a.id] ?? '#d9e6f2';
  ctx.lineWidth = 1;
  for (const side of [1, -1]) { // +1 left, -1 right; a bearing of heading + side·(90° + sweep) is that far back from the wing line
    const at = (r, sweepDeg) => {
      const h = a.headingRad + side * (Math.PI / 2 + sweepDeg * deg);
      return map.worldToScreen(a.xFt + Math.cos(h) * r, a.yFt + Math.sin(h) * r);
    };
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const [x, y] = at(maxFt, minSweepDeg + ((maxSweepDeg - minSweepDeg) * i) / steps);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    for (let i = steps; i >= 0; i--) {
      const [x, y] = at(minFt, minSweepDeg + ((maxSweepDeg - minSweepDeg) * i) / steps);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.globalAlpha = 0.14;
    ctx.fill();
    ctx.globalAlpha = 0.45;
    ctx.stroke();
  }
  ctx.restore();
}

/** An aircraft's 3/9 line: across its heading, through it (V6 drawLead39Line, line 1757), in its colour. */
function drawLead39(ctx, map, lead) {
  const left = { x: Math.cos(lead.headingRad + Math.PI / 2), y: Math.sin(lead.headingRad + Math.PI / 2) };
  const len = Math.max(map.size.width, map.size.height) / map.view.scale * 0.75;
  const [ax, ay] = map.worldToScreen(lead.xFt - left.x * len, lead.yFt - left.y * len);
  const [bx, by] = map.worldToScreen(lead.xFt + left.x * len, lead.yFt + left.y * len);
  const [cx, cy] = map.worldToScreen(lead.xFt, lead.yFt);
  ctx.save();
  ctx.strokeStyle = SHIP_COLORS[lead.id] ?? '#58a6ff';
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.restore();
  text(ctx, `${shipName(lead)} 3/9`, cx - 16, cy - 26, '#b9d8f5', 11, 'right'); // above the line, off the circle labels below
}

/**
 * Lead's 7 and 5 o'clock lines: from Lead out past his tail, 30° either side of it (each clock hour is 30°), so 60° of
 * sweep back from his 3/9 line, the back edge of the fighting wing cone (SMM 12.29 para 69, Fig 12.19). Dashed, as the 3/9 line.
 */
function drawLead75(ctx, map, lead) {
  const len = Math.max(map.size.width, map.size.height) / map.view.scale * 0.75;
  const [cx, cy] = map.worldToScreen(lead.xFt, lead.yFt);
  // Left of the tail is +, so 7 o'clock is the tail +30° and 5 o'clock the tail -30°.
  const lines = [{ clock: '5', h: lead.headingRad + Math.PI - Math.PI / 6 }, { clock: '7', h: lead.headingRad + Math.PI + Math.PI / 6 }];
  ctx.save();
  ctx.strokeStyle = SHIP_COLORS[lead.id] ?? '#58a6ff';
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 6]);
  for (const { h } of lines) {
    const [ex, ey] = map.worldToScreen(lead.xFt + Math.cos(h) * len, lead.yFt + Math.sin(h) * len);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
  ctx.restore();
  const labelAt = 140 / map.view.scale; // 140 px out along each line, clear of the 3/9 label
  for (const { clock, h } of lines) {
    const [lx, ly] = map.worldToScreen(lead.xFt + Math.cos(h) * labelAt, lead.yFt + Math.sin(h) * labelAt);
    text(ctx, `${shipName(lead)} ${clock}`, lx + 6, ly, '#b9d8f5', 11);
  }
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

/** Each aircraft's path still to fly, dashed in its colour (the live screen's planned paths). */
function drawPlanned(ctx, map, planned, now) {
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([7, 6]);
  for (const [id, points] of Object.entries(planned ?? {})) {
    const ahead = points.filter((p) => p[0] >= now - 1e-9);
    if (ahead.length < 2) continue;
    ctx.strokeStyle = SHIP_COLORS[id] ?? '#d9e6f2';
    ctx.beginPath();
    ahead.forEach(([, x, y], i) => {
      const [sx, sy] = map.worldToScreen(x, y);
      if (i) ctx.lineTo(sx, sy);
      else ctx.moveTo(sx, sy);
    });
    ctx.stroke();
  }
  ctx.restore();
}

/** During a rejoin: a dashed range ring around Lead through #2, and an arrow on #2 toward Lead as long as the closure (spec section 10). */
function drawRejoin(ctx, map, state, { leadId, wingId, rangeFt, closureKt }, below = 0) {
  const lead = state.aircraft.find((a) => a.id === leadId);
  const wing = state.aircraft.find((a) => a.id === wingId);
  if (!lead || !wing) return;
  const [lx, ly] = map.worldToScreen(lead.xFt, lead.yFt);
  const [wx, wy] = map.worldToScreen(wing.xFt, wing.yFt);
  ctx.save();
  ctx.strokeStyle = '#ffcc66';
  ctx.fillStyle = '#ffcc66';
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.8;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.arc(lx, ly, rangeFt * map.view.scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // The closure arrow: toward Lead when closing, away when opening; 1 px per knot, at least 12 px so a small closure still shows.
  const dist = Math.hypot(lx - wx, ly - wy);
  if (dist > 1 && Math.abs(closureKt) >= 1) {
    const len = Math.max(12, Math.min(90, Math.abs(closureKt)));
    const dir = Math.sign(closureKt);
    const ux = ((lx - wx) / dist) * dir;
    const uy = ((ly - wy) / dist) * dir;
    const tipX = wx + ux * (20 + len);
    const tipY = wy + uy * (20 + len);
    ctx.beginPath();
    ctx.moveTo(wx + ux * 20, wy + uy * 20);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - ux * 8 - uy * 5, tipY - uy * 8 + ux * 5);
    ctx.lineTo(tipX - ux * 8 + uy * 5, tipY - uy * 8 - ux * 5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  text(ctx, `${Math.round(rangeFt).toLocaleString('en-CA')} ft, ${closureKt >= 0 ? '+' : ''}${Math.round(closureKt)} kt`, wx + 14, wy + 34 + below, '#ffcc66', 11);
}

/** The circle each banked aircraft is flying now, from its own true airspeed and bank, on the side its bank is (left positive). */
function drawBankCircles(ctx, map, state) {
  const scale = map.view.scale;
  for (const a of state.aircraft) {
    if (!a.bankDeg) continue;
    const r = turnRadiusFromBankFt(a.tasFtps, Math.abs(a.bankDeg));
    const side = Math.sign(a.bankDeg);
    const [cx, cy] = map.worldToScreen(a.xFt + Math.cos(a.headingRad + side * Math.PI / 2) * r, a.yFt + Math.sin(a.headingRad + side * Math.PI / 2) * r);
    const color = SHIP_COLORS[a.id];
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    text(ctx, `${a.name ?? `#${a.id}`} ${a.g.toFixed(1)} G, R ${ft(r)}`, cx, cy + r * scale + 14 + (a.id % 2 === 0 ? 13 : 0), color, 11, 'center');
  }
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
function drawAircraft(ctx, map, a, named = true) {
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
  if (named) text(ctx, a.name ?? `#${a.id}`, x + 12, y - 10, '#ffffff', 12);
}

/**
 * The info tags (tags.js): beside each aircraft a dark box with a border in its colour, the title in white and the detail
 * in its colour, 10 px text, as Fight Sim draws them (turn-fight view.js, copied, not imported). A third line gives the
 * power when it is known (TS-62): MAX or PWR in the tag's colour, IDLE, BOARDS and IDLE+BOARDS in red (Patrick 01:44Z).
 */
/** The red of a tag's IDLE, BOARDS and IDLE+BOARDS (Patrick 01:44Z: "red letters"), light enough to read on the dark box. */
const POWER_RED = '#ff5a5a';

export function drawTags(ctx, map, state, tags) {
  ctx.save();
  ctx.font = `10px ${FONT}`;
  for (const a of state.aircraft) {
    const tag = tags[a.id];
    if (!tag) continue;
    const colour = SHIP_COLORS[a.id] ?? '#d9e6f2';
    const [x, y] = map.screenOf ? map.screenOf(a) : map.worldToScreen(a.xFt, a.yFt); // screenOf: the 3D view's, with height
    const pad = 4;
    const power = tag.power ?? null;
    const w = Math.max(ctx.measureText(tag.title).width, ctx.measureText(tag.detail).width, power ? ctx.measureText(power.text).width : 0) + 2 * pad;
    const h = power ? 37 : 26;
    const tx = x + 14 + w > map.size.width ? x - 14 - w : x + 14; // on the left when the right would run off the picture
    const ty = y - 8;
    ctx.fillStyle = 'rgba(10, 18, 28, 0.85)';
    ctx.fillRect(tx, ty, w, h);
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1;
    ctx.strokeRect(tx, ty, w, h);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(tag.title, tx + pad, ty + 11);
    ctx.fillStyle = colour;
    ctx.fillText(tag.detail, tx + pad, ty + 22);
    if (power) {
      ctx.fillStyle = power.red ? POWER_RED : colour;
      ctx.fillText(power.text, tx + pad, ty + 33);
    }
  }
  ctx.restore();
}

/** Each wingman's label in words, beside it (V6 drawErrorLabels, line 1947), moved down under a tag's power line. */
function drawErrorLabels(ctx, map, state, labels, tags = null) {
  for (const a of state.aircraft) {
    const label = labels[a.id];
    if (!label) continue;
    const [x, y] = map.worldToScreen(a.xFt, a.yFt);
    const below = tags?.[a.id]?.power ? 11 : 0;
    text(ctx, label.text, x + 14, y + 20 + below, LABEL_TONES[label.tone] ?? LABEL_TONES.none, 11);
  }
}
