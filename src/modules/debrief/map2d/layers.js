// What the map draws, bottom to top: the 5,000 ft grid, the tracks and the
// ship markers with their standards labels. Each function paints one layer
// on a Canvas 2D context in CSS pixels; `map` is the ui-kit canvas view
// (worldToScreen, visibleBounds, view).
import { SHIP_COLORS, OUTLINED_SHIPS, OUTLINE_COLOR, trackRuns } from '../state.js';

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

export function drawTracks(ctx, map, paths) {
  const px = 1 / map.view.scale; // one CSS pixel in feet
  ctx.save();
  toWorld(ctx, map);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const { slot, path } of paths) {
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
    ctx.beginPath();
    ctx.arc(x, y, MARKER_RADIUS_PX, 0, 2 * Math.PI);
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
    const lx = x + MARKER_RADIUS_PX + 4;
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
