// The Traffic Sim's 2D map (specs/SPEC-traffic.md: The screen, and Colour is
// never the only signal): a grid, the routes (patterns solid, entries dashed,
// splits dotted, each with its name), the selected route's points, aircraft
// pointing along their heading with callsign and height/speed, trails, and the
// conflict bubbles and caution rings. It is drawn on the ui-kit canvas view,
// so drag pans, wheel and + / - zoom, and it draws only when asked.
//
// It draws what it is given and works nothing out: routes and aircraft are
// plain data in feet (x east, y north), and nothing here changes a number.
// The projection and the wording live in small pure functions, tested on their own.
//
// The scene it draws (all optional except routes and aircraft):
//   routes:   [{ id, name, kind: 'pattern' | 'entry' | 'split', color, visible?,
//                points: [{ x, y, alt, label?, kt?, g?, decision?, radiusFt?, bankDeg?, maxG? }],
//                path?: [{ x, y }] }]   path is the rounded line to draw; without it, the points are joined
//   selectedRouteId: the route whose points show, or null
//   aircraft: [{ id, type, x, y, alt, kt, headingDeg, status, color? }]   only 'flying' ones are drawn
//   conflicts: [{ a, b, latFt, vertFt, level: 'conflict' | 'caution' }]
//   trails: { [aircraftId]: [{ x, y }] }
import { createCanvasView } from '../../ui-kit/canvas-view.js';

export const MAP_MIN_SPAN_FT = 300;
export const MAP_MAX_SPAN_FT = 200_000;
const FIT_PADDING_PX = 60; // room round the routes for the labels beside the aircraft

const HOME_SETUP = 'Moose Jaw';
export const HINT_TEXT = `Press Play to watch the ${HOME_SETUP} traffic.`;

/** V6's aircraft colours (line 139); an aircraft can bring its own. Every aircraft also carries its callsign. */
export const TYPE_COLORS = Object.freeze({ 'CT-157': '#a5d6ff', 'CT-156': '#7ee787', 'CT-102': '#ffcc66', 'CT-114': '#ff6b6b' });
const FALLBACK_COLOR = '#c7d8e7';

/** The words that go with the colours, so colour is never the only signal. */
export const LEVEL_MARKS = Object.freeze({ conflict: '⚠ CONFLICT', caution: '△ CAUTION' });

// Colours come from the ui-kit tokens on the page; these stand in when a token is missing.
const TOKEN_FALLBACKS = Object.freeze({
  '--text': '#e3eef5',
  '--text-muted': '#9bb8c6',
  '--border': '#17384a',
  '--bad': '#ff6b6b',
  '--caution': '#f5c542',
  '--bg': '#020a10',
});

/** Reads the map's colours through `read(tokenName)` (a computed style, in the browser). */
export function paletteFrom(read) {
  const pick = (name) => (read(name) || TOKEN_FALLBACKS[name]);
  return {
    text: pick('--text'),
    muted: pick('--text-muted'),
    grid: pick('--border'),
    bad: pick('--bad'),
    caution: pick('--caution'),
    halo: pick('--bg'),
  };
}

// ---------------------------------------------------------------------------
// Words and numbers (pure)

const whole = (n) => (Math.round(n) || 0).toLocaleString('en-US'); // never "-0"

/** "2,500 ft 220 kt", the label under an aircraft's callsign. */
export const heightSpeedText = (ac) => `${whole(ac.alt)} ft ${whole(ac.kt)} kt`;

/** "1,250 ft", a leg's length on the map. */
export const feetText = (ft) => `${whole(ft)} ft`;

/** "Wind 250°T 20 kt", or nothing when the wind is calm. */
export function windText(fromDeg, kt) {
  if (!(kt > 0)) return '';
  const from = String(Math.round(fromDeg) % 360 || 360).padStart(3, '0');
  return `Wind ${from}°T ${whole(kt)} kt`;
}

/** The direction the wind blows towards, in degrees true (the arrow points this way). */
export const windBlowsTowardDeg = (fromDeg) => (((fromDeg + 180) % 360) + 360) % 360;

/** A point's label lines: "6 Downwind" and "2,500 ft / 220 kt / 2.0 G" (V6 line 283, points numbered from 1). */
export function pointLabelLines(index, point) {
  const parts = [];
  if (Number.isFinite(point.alt)) parts.push(`${whole(point.alt)} ft`);
  if (Number.isFinite(point.kt)) parts.push(`${whole(point.kt)} kt`);
  if (Number.isFinite(point.g)) parts.push(`${point.g.toFixed(1)} G`);
  return { title: `${index + 1} ${point.label ?? ''}`.trim(), detail: parts.join(' / ') };
}

/** "R 2,474 ft / bank 60°" for a rounded point, with the most G it needs when that's known; else nothing. */
export function turnDataText(point) {
  if (!Number.isFinite(point.radiusFt) || !Number.isFinite(point.bankDeg)) return '';
  const most = Number.isFinite(point.maxG) ? ` / most ${point.maxG.toFixed(1)} G` : '';
  return `R ${whole(point.radiusFt)} ft / bank ${whole(point.bankDeg)}°${most}`;
}

/**
 * The one line on the map: what to do first, or what's missing. Nothing once the run has started.
 * `place` names the setup ("Moose Jaw"), or is left empty for one of the user's own.
 */
export function hintFor({ timeS, mode, aircraftCount, place = HOME_SETUP }) {
  if (aircraftCount === 0) return 'No aircraft yet. Use + Spawn on the right to add one.';
  if (timeS !== 0 || mode !== 'paused') return '';
  return `Press Play to watch the ${place ? `${place} ` : ''}traffic.`;
}

// ---------------------------------------------------------------------------
// Where things go (pure)

/** The box round every route (or, with no routes, every aircraft), or null when there is nothing. */
export function sceneBounds(routes, aircraft = []) {
  const dots = routes.flatMap((r) => r.path ?? r.points);
  const all = dots.length ? dots : aircraft;
  if (!all.length) return null;
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

const GRID_STEPS_FT = [100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000];

/** The smallest neat grid spacing that keeps lines at least `minPx` apart on screen. */
export function gridStepFt(pxPerFt, minPx = 40) {
  return GRID_STEPS_FT.find((step) => step * pxPerFt >= minPx) ?? GRID_STEPS_FT.at(-1);
}

/** The grid lines inside a box: the x of each vertical line and the y of each horizontal one. */
export function gridLines({ minX, minY, maxX, maxY }, stepFt) {
  const run = (lo, hi) => {
    const out = [];
    for (let v = Math.ceil(lo / stepFt) * stepFt + 0; v <= hi; v += stepFt) out.push(v); // + 0 turns -0 into 0
    return out;
  };
  return { xs: run(minX, maxX), ys: run(minY, maxY) };
}

export const gridLabel = (stepFt) => `Grid: ${whole(stepFt)} ft`;

/** How a route is drawn: patterns solid, entries dashed, splits dotted (V6 line 281); a PFL dash-dot. */
export function routeStyle(kind) {
  if (kind === 'entry') return { dash: [8, 6], width: 2.5 };
  if (kind === 'split') return { dash: [3, 7], width: 2.5 };
  if (kind === 'pfl') return { dash: [10, 4, 2, 4], width: 2.5 };
  return { dash: [], width: 3 };
}

const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

// The straight legs between a line's points; a loop (a pattern) has its closing leg too.
function legsOf(points, closed) {
  const legs = points.slice(1).map((b, i) => [points[i], b]);
  if (closed && points.length > 2) legs.push([points.at(-1), points[0]]);
  return legs;
}

/** The middle of the longest stretch of a line, where the route's name goes (a loop counts its closing leg). */
export function labelAnchor(line, closed = false) {
  const legs = legsOf(line, closed);
  if (!legs.length) return line[0] ?? null;
  const [a, b] = legs.reduce((best, leg) => (distance(...leg) > distance(...best) ? leg : best));
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Each straight leg between a route's points, with its middle and its length in feet (V6 rawSegs). */
export function legLabels(route) {
  return legsOf(route.points, route.kind === 'pattern').map(([a, b]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, ft: distance(a, b) }));
}

// Shapes are drawn about (0, 0) with a nose at (0, -1), so a heading turns them clockwise from north.
const AIRCRAFT_SHAPE = [[0, -1], [0.65, 0.7], [0, 0.35], [-0.65, 0.7]]; // V6 line 295
const WIND_ARROW_SHAPE = [[0, -1], [0.5, -0.3], [0.18, -0.3], [0.18, 1], [-0.18, 1], [-0.18, -0.3], [-0.5, -0.3]];

/** A shape turned to a compass heading and scaled to pixels: screen points, y down. */
export function turnedShape(shape, headingDeg, sizePx) {
  const a = ((Number.isFinite(headingDeg) ? headingDeg : 0) * Math.PI) / 180;
  const [sin, cos] = [Math.sin(a), Math.cos(a)];
  return shape.map(([x, y]) => [(x * cos - y * sin) * sizePx, (x * sin + y * cos) * sizePx]);
}

export const aircraftSymbol = (headingDeg, sizePx) => turnedShape(AIRCRAFT_SHAPE, headingDeg, sizePx);

/** Each aircraft's worst level, 'conflict' over 'caution', as a Map of id to level. */
export function conflictLevels(conflicts) {
  const levels = new Map();
  for (const c of conflicts) {
    for (const id of [c.a, c.b]) if (levels.get(id) !== 'conflict') levels.set(id, c.level);
  }
  return levels;
}

export const isFlying = (ac) => ac.status === 'flying';
export const aircraftColor = (ac) => ac.color ?? TYPE_COLORS[ac.type] ?? FALLBACK_COLOR;

// ---------------------------------------------------------------------------
// Drawing

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// map: { worldToScreen(x, y), size: { width, height }, view: { scale }, visibleBounds() } (the ui-kit canvas view).
export function drawScene(ctx, map, scene, settings, palette) {
  const at = (p) => map.worldToScreen(p.x, p.y);
  const pxPerFt = map.view.scale;
  const flying = scene.aircraft.filter(isFlying);
  const levels = conflictLevels(scene.conflicts ?? []);
  const colours = new Map(scene.aircraft.map((ac) => [ac.id, aircraftColor(ac)]));

  // `anchor` is the screen x of the thing a label sits beside. A label that would run off the
  // right edge of the map goes to the other side of that thing instead, so it can still be read.
  const text = (str, x, y, colour, { size = 11, bold = false, align = 'left', anchor = null } = {}) => {
    ctx.font = `${bold ? '700 ' : ''}${size}px ${FONT}`;
    if (anchor !== null && align === 'left' && x + ctx.measureText(str).width > map.size.width - 4) {
      x = 2 * anchor - x;
      align = 'right';
    }
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = palette.halo;
    ctx.strokeText(str, x, y);
    ctx.fillStyle = colour;
    ctx.fillText(str, x, y);
  };
  const line = (points, colour, width, dash = [], closed = false) => {
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(...at(p)) : ctx.moveTo(...at(p))));
    if (closed) ctx.closePath();
    ctx.setLineDash(dash);
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.setLineDash([]);
  };
  const circle = (x, y, radius) => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
  };

  drawGrid(ctx, map, palette, text);

  // Routes: the line, its name, and the extras the layers switch on.
  const routes = scene.routes.filter((r) => r.visible !== false);
  const picked = scene.selectedRouteId ?? null;
  for (const route of routes) {
    const path = route.path ?? route.points;
    if (path.length < 2) continue;
    const style = routeStyle(route.kind);
    const chosen = route.id === picked;
    ctx.save();
    ctx.globalAlpha = picked !== null && !chosen ? 0.55 : 1;
    line(path, route.color, chosen ? style.width + 1.5 : style.width, style.dash, route.kind === 'pattern');
    ctx.restore();
    const name = labelAnchor(path, route.kind === 'pattern');
    if (name) {
      const [x, y] = at(name);
      text(route.name, x + 6, y - 6, route.color, { size: 12, bold: chosen, anchor: x });
    }
  }
  if (settings.layerLegDistances) {
    for (const route of routes) {
      for (const leg of legLabels(route)) {
        const [x, y] = at(leg);
        const label = feetText(leg.ft);
        ctx.font = `700 11px ${FONT}`;
        const w = ctx.measureText(label).width + 10;
        ctx.fillStyle = palette.halo;
        ctx.fillRect(x - w / 2, y - 10, w, 20);
        ctx.strokeStyle = route.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - w / 2, y - 10, w, 20);
        text(label, x, y + 4, palette.text, { bold: true, align: 'center' });
      }
    }
  }
  if (settings.layerTurnData) {
    for (const route of routes) {
      route.points.forEach((pt) => {
        const words = turnDataText(pt);
        if (!words) return;
        const [x, y] = at(pt);
        text(words, x + 11, y + 29, palette.caution, { anchor: x });
      });
    }
  }
  const chosenRoute = routes.find((r) => r.id === picked);
  if (settings.layerPoints && chosenRoute) drawPoints(ctx, chosenRoute, at, text, palette, circle);

  if (settings.layerTrails) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    for (const [id, trail] of Object.entries(scene.trails ?? {})) {
      if (trail.length > 1) line(trail, colours.get(id) ?? FALLBACK_COLOR, 1.5);
    }
    ctx.restore();
  }

  // Bubbles and rings first, so the aircraft sit on top of them.
  for (const ac of flying) {
    const [x, y] = at(ac);
    const level = levels.get(ac.id);
    if (settings.layerCautionRings) {
      ctx.save();
      const hot = level === 'caution';
      ctx.globalAlpha = hot ? 1 : 0.3;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = hot ? palette.caution : colours.get(ac.id);
      ctx.lineWidth = hot ? 2.5 : 1.5;
      circle(x, y, settings.cautionLatFt * pxPerFt);
      ctx.stroke();
      ctx.restore();
    }
    if (settings.layerBubbles) {
      ctx.save();
      const hot = level === 'conflict';
      ctx.globalAlpha = hot ? 1 : 0.22;
      ctx.strokeStyle = hot ? palette.bad : colours.get(ac.id);
      ctx.lineWidth = hot ? 3 : 2;
      circle(x, y, settings.conflictLatFt * pxPerFt);
      if (hot) {
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = palette.bad;
        ctx.fill();
        ctx.restore();
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // Aircraft: the symbol along its heading, its callsign, height and speed, and the word for any conflict.
  for (const ac of flying) {
    const [x, y] = at(ac);
    const colour = colours.get(ac.id);
    ctx.beginPath();
    aircraftSymbol(ac.headingDeg, 14).forEach(([dx, dy], i) => (i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy)));
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = palette.halo;
    ctx.stroke();
    text(ac.id, x + 12, y - 8, colour, { size: 12, bold: true, anchor: x });
    if (settings.layerLabels) text(heightSpeedText(ac), x + 12, y + 7, palette.text, { anchor: x });
    const level = levels.get(ac.id);
    if (level) text(LEVEL_MARKS[level], x + 12, y + 21, level === 'conflict' ? palette.bad : palette.caution, { bold: true, anchor: x });
  }

  drawWind(ctx, map, settings, palette, text);
}

function drawGrid(ctx, map, palette, text) {
  const step = gridStepFt(map.view.scale);
  const { xs, ys } = gridLines(map.visibleBounds(), step);
  const { width, height } = map.size;
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const x of xs) {
    const [sx] = map.worldToScreen(x, 0);
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, height);
  }
  for (const y of ys) {
    const [, sy] = map.worldToScreen(0, y);
    ctx.moveTo(0, sy);
    ctx.lineTo(width, sy);
  }
  ctx.stroke();
  text(gridLabel(step), 8, height - 8, palette.muted);
}

// The selected route's points: a circle, or a diamond at a decision point, with their labels.
function drawPoints(ctx, route, at, text, palette, circle) {
  route.points.forEach((pt, i) => {
    const [x, y] = at(pt);
    ctx.beginPath();
    if (pt.decision) {
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x + 8, y);
      ctx.lineTo(x, y + 8);
      ctx.lineTo(x - 8, y);
      ctx.closePath();
    } else circle(x, y, 6);
    ctx.fillStyle = route.color;
    ctx.fill();
    ctx.strokeStyle = palette.text;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const words = pointLabelLines(i, pt);
    text(words.title, x + 11, y - 9, palette.text, { anchor: x });
    if (words.detail) text(words.detail, x + 11, y + 17, palette.muted, { size: 10, anchor: x }); // below the line, so a level leg doesn't run through it
  });
}

// The wind arrow and "Wind 250°T 20 kt" in the top right corner, only when it isn't calm.
function drawWind(ctx, map, settings, palette, text) {
  const words = windText(settings.windFromDeg, settings.windKt);
  if (!words) return;
  const { width } = map.size;
  ctx.beginPath();
  const arrow = turnedShape(WIND_ARROW_SHAPE, windBlowsTowardDeg(settings.windFromDeg), 14);
  arrow.forEach(([dx, dy], i) => (i ? ctx.lineTo(width - 28 + dx, 30 + dy) : ctx.moveTo(width - 28 + dx, 30 + dy)));
  ctx.closePath();
  ctx.fillStyle = palette.text;
  ctx.fill();
  text(words, width - 50, 34, palette.text, { size: 13, bold: true, align: 'right' });
}

// ---------------------------------------------------------------------------
// The view

/**
 * canvas: the map's <canvas>. timers: the module's scheduler scope.
 * scene(): the routes, aircraft, conflicts and trails to draw now (see the top of this file).
 * settings(): the traffic settings (layers, conflict limits, wind).
 * Returns { requestDraw, fit, view, worldToScreen, screenToWorld, dispose }: ask for a draw
 * whenever the scene or a setting changes; the rest is the canvas view's own, for the editor.
 */
export function createMap2d(canvas, { timers, scene, settings }) {
  let fitted = false;

  const fitTo = (data) => {
    const bounds = sceneBounds(data.routes, data.aircraft);
    if (bounds) map.fit(bounds, FIT_PADDING_PX);
  };

  const map = createCanvasView(canvas, {
    timers,
    minSpan: MAP_MIN_SPAN_FT,
    maxSpan: MAP_MAX_SPAN_FT,
    label: 'Traffic pattern map: drag to move, scroll or press + and − to zoom',
    draw(ctx) {
      const data = scene();
      // The first draw with something to show and a size to fit to frames the routes.
      if (!fitted && map.size.width > 1 && (data.routes.length || data.aircraft.length)) {
        fitted = true;
        fitTo(data);
      }
      const style = globalThis.getComputedStyle(canvas);
      drawScene(ctx, map, data, settings(), paletteFrom((name) => style.getPropertyValue(name).trim()));
    },
  });

  return {
    requestDraw: map.requestDraw,
    get view() {
      return map.view;
    },
    worldToScreen: map.worldToScreen,
    screenToWorld: map.screenToWorld,
    /** Frames every route. A map that has no size yet (hidden) does it at its next draw. */
    fit() {
      if (map.size.width > 1) fitTo(scene());
      else fitted = false;
    },
    dispose: map.dispose,
  };
}
