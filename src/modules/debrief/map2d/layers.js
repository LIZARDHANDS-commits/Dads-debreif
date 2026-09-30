// What the map draws, bottom to top (V6 drawKml, line 3014): the 5,000 ft
// grid, the 3/9 lines, the fighting-wing cone, the tracks, the spacing lines,
// the DFP flags, the safety bubbles and clock marks, and the ships with their
// standards labels. Each function paints one layer on a Canvas 2D context in
// CSS pixels; `map` is the ui-kit canvas view (worldToScreen, visibleBounds,
// view). Where each thing goes is worked out in geometry.js.
import { SHIP_COLORS, OUTLINED_SHIPS, OUTLINE_COLOR, trackRuns } from '../state.js';
import { spacingPairs, line39, coneOutlines, trailRuns } from './geometry.js';
import { KT_TO_FTPS } from '../../../core/units.js';

/** V6's grid spacing (line 2690). */
export const GRID_FT = 5000;
const GRID_COLOR = 'rgba(155, 184, 198, 0.16)';
const TRACK_WIDTH_PX = 2;
const MARKER_RADIUS_PX = 7;
// Past this many grid lines across, the grid would be a grey wash, so it's left out.
const MAX_GRID_LINES = 200;

/**
 * Each track as a Path2D in map feet, built once per flight, so drawing a
 * frame is one stroke per ship instead of projecting every fix again (#43).
 */
export function trackPaths(flight) {
  if (!flight) return [];
  return Object.values(flight.tracks)
    .sort((a, b) => a.slot - b.slot)
    .map((tr) => {
      const path = new Path2D();
      for (const run of trackRuns(tr.fixes)) {
        path.moveTo(run[0].xFt, run[0].yFt);
        // A run of one fix still shows, as a dot.
        if (run.length === 1) path.lineTo(run[0].xFt + 0.01, run[0].yFt);
        for (let i = 1; i < run.length; i++) path.lineTo(run[i].xFt, run[i].yFt);
      }
      return { slot: tr.slot, path };
    });
}

// Sets the context to map feet (x east, y north) on top of its CSS-pixel transform.
function toWorld(ctx, map) {
  const { cx, cy, scale } = map.view;
  const { width, height } = map.size;
  ctx.transform(scale, 0, 0, -scale, width / 2 - cx * scale, height / 2 + cy * scale);
}

export function drawGrid(ctx, map) {
  const { minX, minY, maxX, maxY } = map.visibleBounds();
  if ((maxX - minX) / GRID_FT > MAX_GRID_LINES || (maxY - minY) / GRID_FT > MAX_GRID_LINES) return;
  const { width, height } = map.size;
  ctx.save();
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.ceil(minX / GRID_FT) * GRID_FT; x <= maxX; x += GRID_FT) {
    const sx = Math.round(map.worldToScreen(x, 0)[0]) + 0.5;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, height);
  }
  for (let y = Math.ceil(minY / GRID_FT) * GRID_FT; y <= maxY; y += GRID_FT) {
    const sy = Math.round(map.worldToScreen(0, y)[1]) + 0.5;
    ctx.moveTo(0, sy);
    ctx.lineTo(width, sy);
  }
  ctx.stroke();
  ctx.restore();
}

// A track's parts for a trail mode, as one Path2D in map feet.
function runsPath(runs) {
  const path = new Path2D();
  for (const run of runs) {
    path.moveTo(run[0].xFt, run[0].yFt);
    if (run.length === 1) path.lineTo(run[0].xFt + 0.01, run[0].yFt);
    for (let i = 1; i < run.length; i++) path.lineTo(run[i].xFt, run[i].yFt);
  }
  return path;
}

/**
 * The tracks. 'full' uses the paths built once per flight; 'history' and
 * 'window' (last 60 s) build only the part up to the time being shown.
 */
export function drawTracks(ctx, map, paths, { flight = null, mode = 'full', t = 0 } = {}) {
  const px = 1 / map.view.scale; // one CSS pixel in feet
  const shown = mode === 'full' || !flight
    ? paths
    : Object.values(flight.tracks).map((tr) => ({ slot: tr.slot, path: runsPath(trailRuns(tr.fixes, mode, t)) }));
  ctx.save();
  toWorld(ctx, map);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const { slot, path } of shown) {
    if (OUTLINED_SHIPS.has(slot)) {
      ctx.strokeStyle = OUTLINE_COLOR;
      ctx.lineWidth = (TRACK_WIDTH_PX + 2) * px;
      ctx.stroke(path);
    }
    ctx.strokeStyle = SHIP_COLORS[slot];
    ctx.lineWidth = TRACK_WIDTH_PX * px;
    ctx.stroke(path);
  }
  ctx.restore();
}

// Standards label colours: the ui-kit's --good and --caution tokens.
const LABEL_COLORS = { good: '#3ecf8e', caution: '#f5c542' };

/**
 * A dot in the ship's colour with its number beside it, so colour is never
 * the only signal. Inside a GPS gap the dot is hollow: the position there is
 * a guess between two fixes (D32). `labels` maps a ship to its standards
 * label, { text, tone }, drawn after the number: green on parameters (#21).
 */
export function drawShips(ctx, map, ships, labels = {}) {
  ctx.save();
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  for (const s of ships) {
    const [x, y] = map.worldToScreen(s.xFt, s.yFt);
    const color = SHIP_COLORS[s.slot];
    const moving = s.hdg != null;
    ctx.beginPath();
    if (moving) silhouettePath(ctx, x, y, s.hdg);
    else ctx.arc(x, y, MARKER_RADIUS_PX, 0, 2 * Math.PI);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = OUTLINE_COLOR;
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    if (s.inGap) {
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
      ctx.stroke();
    }
    const label = `#${s.slot}`;
    const lx = x + (moving ? SILHOUETTE_HALF_SPAN_PX : MARKER_RADIUS_PX) + 4;
    ctx.lineWidth = 3;
    ctx.strokeStyle = OUTLINE_COLOR;
    ctx.strokeText(label, lx, y);
    ctx.fillStyle = color;
    ctx.fillText(label, lx, y);
    const standard = labels[s.slot];
    if (standard) {
      const sx = lx + ctx.measureText(`${label} `).width;
      ctx.strokeText(standard.text, sx, y);
      ctx.fillStyle = LABEL_COLORS[standard.tone] ?? '#e3eef5';
      ctx.fillText(standard.text, sx, y);
    }
  }
  ctx.restore();
}

// V6's top-down T-6 planform (drawKmlAircraftSilhouette, line 2919), nose up
// in its own units; drawn a little smaller so four ships in close formation
// stay apart.
const SILHOUETTE = [
  [0, -22], [3.2, -17], [3.8, -8], [22, -2.6], [23, 2.4], [4.6, 3.8], [3.5, 12.2], [11.5, 14.6], [12, 18.2],
  [2.7, 17], [1.2, 22], [0, 23.8], [-1.2, 22], [-2.7, 17], [-12, 18.2], [-11.5, 14.6], [-3.5, 12.2],
  [-4.6, 3.8], [-23, 2.4], [-22, -2.6], [-3.8, -8], [-3.2, -17],
];
const SILHOUETTE_SCALE = 0.7;
const SILHOUETTE_HALF_SPAN_PX = 23 * SILHOUETTE_SCALE;

// Adds the silhouette at (x, y) pointing along hdg (radians, 0 = east) to the current path.
function silhouettePath(ctx, x, y, hdg) {
  // Screen y points down, so a heading turns the nose (0, -1) by -(hdg - 90°).
  const turn = -hdg + Math.PI / 2;
  const cos = Math.cos(turn) * SILHOUETTE_SCALE;
  const sin = Math.sin(turn) * SILHOUETTE_SCALE;
  SILHOUETTE.forEach(([px, py], i) => {
    const sx = x + px * cos - py * sin;
    const sy = y + px * sin + py * cos;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.closePath();
}

const dashed = (ctx, on) => ctx.setLineDash(on ? [9, 7] : []);

/** Lead's or #3's 3/9 line in its colour, dashed, with its name (V6 drawKml39Line). */
export function draw39Line(ctx, map, ship, name) {
  const ends = line39(ship, ship.hdg);
  if (!ends) return;
  const [a, b] = ends.map(([x, y]) => map.worldToScreen(x, y));
  const [x, y] = map.worldToScreen(ship.xFt, ship.yFt);
  ctx.save();
  ctx.strokeStyle = SHIP_COLORS[ship.slot];
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 2;
  dashed(ctx, true);
  ctx.beginPath();
  ctx.moveTo(...a);
  ctx.lineTo(...b);
  ctx.stroke();
  dashed(ctx, false);
  ctx.globalAlpha = 1;
  ctx.font = '11px system-ui, sans-serif';
  outlinedText(ctx, name, x + 14, y + 26, SHIP_COLORS[ship.slot]);
  ctx.restore();
}

function outlinedText(ctx, text, x, y, color) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = OUTLINE_COLOR;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

const CONE_FILL = 'rgba(255, 204, 102, 0.16)';
const CONE_EDGE = 'rgba(255, 204, 102, 0.72)';

/** The fighting-wing windows behind Lead (V6 drawKmlFightingWingCone), now drawn paused too (#26). */
export function drawCone(ctx, map, lead) {
  const sides = coneOutlines(lead, lead.hdg);
  if (!sides) return;
  ctx.save();
  ctx.fillStyle = CONE_FILL;
  ctx.strokeStyle = CONE_EDGE;
  ctx.lineWidth = 1.5;
  ctx.font = '10px system-ui, sans-serif';
  for (const { points, labelAt } of sides) {
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    points.forEach(([px, py], i) => {
      const [x, y] = map.worldToScreen(px, py);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    const [lx, ly] = map.worldToScreen(...labelAt);
    outlinedText(ctx, 'FW tail 500–1000 ft / 30–60°', lx + 4, ly - 4, '#ffcc66');
  }
  ctx.restore();
}

const SPACING_COLOR = '#6f8497';
const SPACING_TEXT = '#c9d1d9';

/** A dashed line between every pair of ships with the feet between them (V6 line 3030). */
export function drawSpacingLines(ctx, map, ships) {
  ctx.save();
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 1;
  for (const { a, b, ft } of spacingPairs(ships)) {
    const [ax, ay] = map.worldToScreen(a.xFt, a.yFt);
    const [bx, by] = map.worldToScreen(b.xFt, b.yFt);
    ctx.strokeStyle = SPACING_COLOR;
    ctx.globalAlpha = ft == null ? 0.4 : 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    if (ft != null) outlinedText(ctx, `${Math.round(ft).toLocaleString('en-US')} ft`, (ax + bx) / 2, (ay + by) / 2, SPACING_TEXT);
  }
  ctx.restore();
}

/** A bubble of `radiusFt` round each ship, in its colour (V6 drawKmlSafetyBubble). */
export function drawBubbles(ctx, map, ships, radiusFt) {
  const r = radiusFt * map.view.scale;
  ctx.save();
  ctx.lineWidth = 1.5;
  for (const s of ships) {
    const [x, y] = map.worldToScreen(s.xFt, s.yFt);
    const color = SHIP_COLORS[s.slot];
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.07;
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = color;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

const CLOCK_RADIUS_PX = 34;

/**
 * Twelve clock ticks round each moving ship, 12 o'clock on its nose, longer at
 * 12, 3, 6 and 9 (V6 drawKmlClockMarksKml), now drawn paused too (#26). A
 * ship that isn't moving has no nose, so no clock (V6 drew it north-up).
 */
export function drawClockMarks(ctx, map, ships) {
  ctx.save();
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.6;
  for (const s of ships) {
    if (s.hdg == null) continue;
    const [x, y] = map.worldToScreen(s.xFt, s.yFt);
    ctx.strokeStyle = SHIP_COLORS[s.slot];
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      // 12 o'clock is the heading; screen angles run clockwise from east.
      const a = -s.hdg + (i * Math.PI) / 6;
      const major = i % 3 === 0;
      const inner = CLOCK_RADIUS_PX - (major ? 12 : 8);
      const outer = CLOCK_RADIUS_PX + (major ? 2 : 0);
      ctx.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
      ctx.lineTo(x + Math.cos(a) * outer, y + Math.sin(a) * outer);
    }
    ctx.stroke();
  }
  ctx.restore();
}

const DFP_FILL = '#ffd166';

/**
 * A flag at each DFP's place (Lead's position when it was added), with its
 * label (V6 drawDfps). The label is drawn as canvas text, never markup.
 * dfps: [{ x, y, label }].
 */
export function drawDfpFlags(ctx, map, dfps) {
  ctx.save();
  ctx.font = '11px system-ui, sans-serif';
  ctx.lineWidth = 2;
  for (const d of dfps) {
    if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) continue;
    const [x, y] = map.worldToScreen(d.x, d.y);
    ctx.strokeStyle = OUTLINE_COLOR;
    ctx.fillStyle = DFP_FILL;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 26);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - 26);
    ctx.lineTo(x + 18, y - 20);
    ctx.lineTo(x, y - 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    outlinedText(ctx, d.label, x + 8, y - 30, '#ffffff');
    ctx.lineWidth = 2;
  }
  ctx.restore();
}

const TENNIS_COLOR = '#ffcc66';
const TENNIS_HIT_COLOR = '#7ee787';
const TENNIS_TARGET_COLOR = '#58a6ff';

/**
 * The tennis ball from above (V6 drawKmlTennisOverlay): the cone out to the
 * ball's reach, the ball's path, the target's path (dashed) and the closest
 * pass ringed with the answer. sol: from tennisAt, with points.
 */
export function drawTennis(ctx, map, sol) {
  const { shooter, hdg } = sol;
  const reach = sol.ballKt * KT_TO_FTPS * sol.tofSec; // V6's cone reach: the ball's own speed only
  const half = (sol.coneDeg / 2) * (Math.PI / 180);
  const [bx, by] = map.worldToScreen(shooter.x, shooter.y);
  const edge = (a) => map.worldToScreen(shooter.x + Math.cos(a) * reach, shooter.y + Math.sin(a) * reach);
  const [ax, ay] = edge(hdg - half);
  const [cx, cy] = edge(hdg + half);
  const path = (points) => {
    ctx.beginPath();
    points.forEach((p, i) => {
      const [x, y] = map.worldToScreen(p.x, p.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = TENNIS_COLOR;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(ax, ay);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = TENNIS_COLOR;
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(ax, ay);
  ctx.moveTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 3;
  path(sol.points);
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = TENNIS_TARGET_COLOR;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 5]);
  path(sol.targetPoints);
  ctx.setLineDash([]);
  if (sol.best.ball) {
    const [x, y] = map.worldToScreen(sol.best.ball.x, sol.best.ball.y);
    const color = sol.status === 'INTERCEPT' ? TENNIS_HIT_COLOR : TENNIS_COLOR;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.strokeText(sol.status, x + 13, y - 8);
    ctx.fillStyle = color;
    ctx.fillText(sol.status, x + 13, y - 8);
  }
  ctx.restore();
}
