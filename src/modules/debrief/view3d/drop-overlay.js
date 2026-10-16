// The simulated drop over the 3D picture (DB-36), drawn flat on the overlay canvas through the view's projection P (as the
// tennis ball is): the drop zone on the ground, the load's trail through the air from release to impact, the release
// point, the impact cross, the CARP at the release height with its release line and a thin line down to the ground, and
// while the replay is in the fall the load as a small marker with a canopy once a cargo parachute opens. A picture only;
// every number comes from debrief/drop.js. P(p) takes { x, y, altFt } and gives { x, y } on the screen (NaN behind the eye).
import { DROP_COLOURS, drawCanopy } from '../map2d/drop-layer.js';
import { OUTLINE_COLOR } from '../state.js';

const CIRCLE_STEPS = 48;
const ok = (q) => Number.isFinite(q.x) && Number.isFinite(q.y);

function polyline(ctx, P, points, close = false) {
  ctx.beginPath();
  let pen = false;
  let first = null;
  for (const p of points) {
    const q = P(p);
    if (!ok(q)) {
      pen = false;
      continue;
    }
    if (pen) ctx.lineTo(q.x, q.y);
    else ctx.moveTo(q.x, q.y);
    first ??= q;
    pen = true;
  }
  if (close && pen && first) ctx.lineTo(first.x, first.y);
  ctx.stroke();
}

function label(ctx, text, q, color, dy = -8) {
  if (!ok(q)) return;
  ctx.font = '11px system-ui, sans-serif';
  ctx.lineWidth = 3;
  ctx.strokeStyle = OUTLINE_COLOR;
  ctx.strokeText(text, q.x + 8, q.y + dy);
  ctx.fillStyle = color;
  ctx.fillText(text, q.x + 8, q.y + dy);
}

function dot(ctx, q, r, color) {
  if (!ok(q)) return;
  ctx.beginPath();
  ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = OUTLINE_COLOR;
  ctx.stroke();
}

/** drop: index.js dropDrawing's (map2d/drop-layer.js says what it holds), with heights: zone.groundFt, trail altFt, impact.altFt, carp.altFt and groundFt. */
export function drawDrop3d(ctx, P, drop) {
  ctx.save();
  const z = drop.zone;
  if (z) {
    const at = z.groundFt;
    const ring = z.shape === 'circle'
      ? Array.from({ length: CIRCLE_STEPS }, (_, i) => {
        const a = (i / CIRCLE_STEPS) * Math.PI * 2;
        return { x: z.x + z.radiusFt * Math.cos(a), y: z.y + z.radiusFt * Math.sin(a), altFt: at };
      })
      : z.corners.map(([x, y]) => ({ x, y, altFt: at }));
    ctx.lineWidth = 2;
    ctx.strokeStyle = DROP_COLOURS.zone;
    ctx.setLineDash([8, 6]);
    polyline(ctx, P, ring, true);
    ctx.setLineDash([]);
    const pi = P({ x: z.x, y: z.y, altFt: at });
    if (ok(pi)) {
      ctx.beginPath();
      ctx.moveTo(pi.x - 6, pi.y);
      ctx.lineTo(pi.x + 6, pi.y);
      ctx.moveTo(pi.x, pi.y - 6);
      ctx.lineTo(pi.x, pi.y + 6);
      ctx.stroke();
      label(ctx, 'PI', pi, DROP_COLOURS.zone);
    }
  }
  if (drop.carp) {
    const c = drop.carp;
    ctx.lineWidth = 1;
    ctx.strokeStyle = DROP_COLOURS.carp;
    ctx.setLineDash([3, 4]);
    polyline(ctx, P, [{ x: c.x, y: c.y, altFt: c.altFt }, { x: c.x, y: c.y, altFt: c.groundFt }]);
    ctx.setLineDash([]);
    ctx.lineWidth = 3;
    polyline(ctx, P, c.line.map(([x, y]) => ({ x, y, altFt: c.altFt })));
    const q = P({ x: c.x, y: c.y, altFt: c.altFt });
    dot(ctx, q, 5, DROP_COLOURS.carp);
    label(ctx, 'CARP', q, DROP_COLOURS.carp, 16);
  }
  if (drop.trail?.length > 1) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = DROP_COLOURS.trail;
    polyline(ctx, P, drop.trail);
  }
  if (drop.release) {
    const q = P(drop.release);
    dot(ctx, q, 5, DROP_COLOURS.release);
    label(ctx, 'Release', q, DROP_COLOURS.release);
  }
  if (drop.impact) {
    const q = P(drop.impact);
    if (ok(q)) {
      for (const [w, col] of [[4.5, OUTLINE_COLOR], [2.5, DROP_COLOURS.impact]]) {
        ctx.lineWidth = w;
        ctx.strokeStyle = col;
        ctx.beginPath();
        ctx.moveTo(q.x - 6, q.y - 6);
        ctx.lineTo(q.x + 6, q.y + 6);
        ctx.moveTo(q.x + 6, q.y - 6);
        ctx.lineTo(q.x - 6, q.y + 6);
        ctx.stroke();
      }
      label(ctx, drop.impactWords || 'Impact', q, DROP_COLOURS.impact, 4);
      if (drop.note) label(ctx, drop.note, q, '#ffffff', 18);
    }
  }
  if (drop.now) {
    const q = P(drop.now);
    if (ok(q)) {
      drawCanopy(ctx, q.x, q.y, drop.now.chute);
      dot(ctx, q, 4, DROP_COLOURS.load);
    }
  }
  ctx.restore();
}
