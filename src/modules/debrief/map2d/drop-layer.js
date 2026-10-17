// The simulated drop on the 2D map (DB-36): the drop zone (blue, dashed) with its point of impact, the CARP (green) and its
// short release line along the track, the release point (yellow), the load's trail from release to impact, the impact
// (red cross) with its miss in words, and while the replay is in the fall, the load itself (a dot, with a small canopy once
// a cargo parachute opens). A picture only: every number comes from debrief/drop.js. Each mark carries a word, so colour is
// never the only signal.
import { OUTLINE_COLOR } from '../state.js';

/** The drop's colours (the thread's mockup; the ui-kit's --good and --bad tones where they fit). */
export const DROP_COLOURS = Object.freeze({
  zone: '#58a6ff',
  carp: '#3ecf8e',
  release: '#f5c542',
  trail: '#f5c542',
  impact: '#ff6b6b',
  load: '#ffffff',
});

function label(ctx, text, x, y, color) {
  ctx.font = '11px system-ui, sans-serif';
  ctx.lineWidth = 3;
  ctx.strokeStyle = OUTLINE_COLOR;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function cross(ctx, x, y, r, color, width = 2.5) {
  for (const [w, c] of [[width + 2, OUTLINE_COLOR], [width, color]]) {
    ctx.lineWidth = w;
    ctx.strokeStyle = c;
    ctx.beginPath();
    ctx.moveTo(x - r, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.moveTo(x + r, y - r);
    ctx.lineTo(x - r, y + r);
    ctx.stroke();
  }
}

function dot(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = OUTLINE_COLOR;
  ctx.stroke();
}

/** A small canopy over a point on the screen: an arc and its lines down to the load, `open` 0 to 1. */
export function drawCanopy(ctx, x, y, open, color = DROP_COLOURS.load) {
  if (!(open > 0)) return;
  const r = 4 + 6 * open;
  const top = y - 12 - 4 * open;
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.beginPath();
  ctx.arc(x, top, r, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - r, top);
  ctx.lineTo(x, y);
  ctx.lineTo(x + r, top);
  ctx.stroke();
  ctx.restore();
}

/**
 * drop: what index.js hands the views (dropDrawing): { zone (drop.js zoneShape) | null, trail: [{ x, y, altFt }],
 * release: { x, y } | null, impact: { x, y } | null, impactWords, note, carp: { x, y, line: [[x, y], [x, y]] } | null,
 * now: { x, y, chute } | null }.
 */
export function drawDrop(ctx, map, drop) {
  const S = (x, y) => map.worldToScreen(x, y);
  ctx.save();
  // The drop zone, under everything else of the drop.
  const z = drop.zone;
  if (z) {
    ctx.beginPath();
    if (z.shape === 'circle') {
      const [cx, cy] = S(z.x, z.y);
      ctx.arc(cx, cy, Math.max(3, z.radiusFt * map.view.scale), 0, Math.PI * 2);
    } else {
      z.corners.forEach(([x, y], i) => {
        const [sx, sy] = S(x, y);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
    }
    ctx.fillStyle = 'rgba(88, 166, 255, 0.12)';
    ctx.fill();
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = DROP_COLOURS.zone;
    ctx.stroke();
    ctx.setLineDash([]);
    const [px, py] = S(z.x, z.y);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px - 7, py);
    ctx.lineTo(px + 7, py);
    ctx.moveTo(px, py - 7);
    ctx.lineTo(px, py + 7);
    ctx.stroke();
    label(ctx, 'PI', px + 8, py - 8, DROP_COLOURS.zone);
  }
  // The CARP and its release line along the track.
  if (drop.carp) {
    const [[ax, ay], [bx, by]] = drop.carp.line.map(([x, y]) => S(x, y));
    for (const [w, c] of [[5, OUTLINE_COLOR], [3, DROP_COLOURS.carp]]) {
      ctx.lineWidth = w;
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    const [cx, cy] = S(drop.carp.x, drop.carp.y);
    dot(ctx, cx, cy, 5, DROP_COLOURS.carp);
    label(ctx, 'CARP', cx + 8, cy + 14, DROP_COLOURS.carp);
  }
  // The load's trail from release to impact.
  if (drop.trail?.length > 1) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = DROP_COLOURS.trail;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    drop.trail.forEach((p, i) => {
      const [x, y] = S(p.x, p.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (drop.release) {
    const [rx, ry] = S(drop.release.x, drop.release.y);
    dot(ctx, rx, ry, 5, DROP_COLOURS.release);
    label(ctx, 'Release', rx + 8, ry - 8, DROP_COLOURS.release);
  }
  if (drop.impact) {
    const [ix, iy] = S(drop.impact.x, drop.impact.y);
    cross(ctx, ix, iy, 6, DROP_COLOURS.impact);
    label(ctx, drop.impactWords || 'Impact', ix + 9, iy + 4, DROP_COLOURS.impact);
    if (drop.note) label(ctx, drop.note, ix + 9, iy + 18, '#ffffff');
  }
  if (drop.now) {
    const [nx, ny] = S(drop.now.x, drop.now.y);
    drawCanopy(ctx, nx, ny, drop.now.chute);
    dot(ctx, nx, ny, 4, DROP_COLOURS.load);
  }
  ctx.restore();
}
