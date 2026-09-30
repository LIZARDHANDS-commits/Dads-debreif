// The top-down view (SPEC-turn-fight, "The drawing"): the dark stage, a grid
// that fills the box, both trails, the two aircraft as arrowheads labelled B
// and R, the MERGE mark and the dashed first nose-on line. It is V6's `draw`
// (original/shell.html, line 4287) with the changes the spec lists, and it only
// reads the fight state and the trails: nothing here changes a number, and a
// later 3D view or graph can read the same run.
//
// It draws on change only (ui-kit createCanvasSurface): when the fight moves,
// a setting changes or the box is resized; a paused fight costs nothing.
// Units: feet in the fight, CSS pixels on screen.
import { FT_PER_NM } from '../../core/units.js';
import { toScreen, visibleBounds, createCanvasSurface } from '../../ui-kit/canvas-view.js';

/** V6's picture colours. The same three are in turn-fight.css for the page. */
export const COLORS = Object.freeze({
  blue: '#58a6ff',
  red: '#ff6b6b',
  nose: '#ffcc66',
  grid: '#213040',
  gridText: '#6f8e9d',
  outline: '#ffffff',
});

/** The view never reaches less than this from the centre (V6 `mx`, `Math.max(…,3000)`). */
export const MIN_REACH_FT = 3000;

/** The fraction of the shorter side from the centre to the edge of what is kept in sight (V6 `k`, `.42`). */
const FILL = 0.42;

/** The smallest a grid square may be, in pixels, before the grid goes to a coarser step. */
const MIN_GRID_PX = 14;
const GRID_STEPS_NM = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

/**
 * How far from the centre the view keeps in sight, in feet (V6 `mx`): half the
 * start separation, at least 3,000 ft, and far enough for every trail point
 * (`extentFt`, the widest reach so far) and each aircraft now.
 */
export function viewReachFt({ separationNm, extentFt, aircraft = [] }) {
  let reach = Math.max((separationNm * FT_PER_NM) / 2, MIN_REACH_FT, extentFt);
  for (const p of aircraft) reach = Math.max(reach, Math.abs(p.xFt), Math.abs(p.yFt));
  return reach;
}

/**
 * The view for a box: the merge point in the middle and `scale` CSS pixels per
 * foot, as ui-kit's toScreen wants it (V6 `k = min(W,H)·.42/mx`).
 */
export function topDownView(size, reach) {
  return { cx: 0, cy: 0, scale: (Math.min(size.width, size.height) * FILL) / viewReachFt(reach) };
}

/** The grid step in NM: 1 while a square is readable, then 2, 5, 10, … */
export function gridSpacingNm(pxPerFt) {
  for (const nm of GRID_STEPS_NM) if (nm * FT_PER_NM * pxPerFt >= MIN_GRID_PX - 1e-9) return nm;
  return GRID_STEPS_NM.at(-1);
}

/** The pixel positions of the vertical (`xs`) and horizontal (`ys`) grid lines across the whole box, through the merge point. */
export function gridLines(size, view) {
  const spacingNm = gridSpacingNm(view.scale);
  const stepFt = spacingNm * FT_PER_NM;
  const bounds = visibleBounds(view, size);
  const xs = [];
  const ys = [];
  for (let i = Math.ceil(bounds.minX / stepFt); i <= Math.floor(bounds.maxX / stepFt); i++) xs.push(toScreen(view, size, i * stepFt, 0)[0]);
  for (let i = Math.ceil(bounds.minY / stepFt); i <= Math.floor(bounds.maxY / stepFt); i++) ys.push(toScreen(view, size, 0, i * stepFt)[1]);
  return { xs, ys, spacingNm };
}

/** V6's arrowhead (`plane`, line 4286), pointing along the aircraft's heading. */
function drawArrowhead(ctx, at, headingRad, colour) {
  const [sx, sy] = at;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-headingRad);
  ctx.fillStyle = colour;
  ctx.strokeStyle = COLORS.outline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-10, -7);
  ctx.lineTo(-5, 0);
  ctx.lineTo(-10, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawTrail(ctx, points, colour, project, now) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => {
    const [x, y] = project(p);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  // The line ends at the aircraft, not at the last 0.1 s point.
  const [x, y] = project(now);
  ctx.lineTo(x, y);
  ctx.stroke();
}

/**
 * Paints the whole top-down picture for a run ({ fight, trails }, see
 * playback.js) in a box of `size` CSS pixels. The canvas is cleared already;
 * its CSS background is var(--bg-raised), V6's dark stage.
 */
export function drawTopDown(ctx, size, run) {
  if (!(size.width > 0 && size.height > 0)) return;
  const { fight, trails } = run;
  const { blue, red } = fight;
  const view = topDownView(size, {
    separationNm: fight.setup.separationNm,
    extentFt: trails.extent.maxAbsFt,
    aircraft: [blue, red],
  });
  const project = (p) => toScreen(view, size, p.xFt, p.yFt);

  // The grid, through the merge point, across the whole box.
  const grid = gridLines(size, view);
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const x of grid.xs) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size.height);
  }
  for (const y of grid.ys) {
    ctx.moveTo(0, y);
    ctx.lineTo(size.width, y);
  }
  ctx.stroke();
  ctx.fillStyle = COLORS.gridText;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`Grid: ${grid.spacingNm} NM`, 8, size.height - 8);

  drawTrail(ctx, trails.blue, COLORS.blue, project, blue);
  drawTrail(ctx, trails.red, COLORS.red, project, red);

  // First nose-on: the dashed line between the two at that moment, and who had it.
  if (fight.firstNose) {
    const { from, to, by } = fight.firstNose;
    const [x1, y1] = project(from);
    const [x2, y2] = project(to);
    ctx.save();
    ctx.strokeStyle = COLORS.nose;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.nose;
    // The words go in the bottom-right corner, like "Grid" at the bottom-left, so they never cover an aircraft or MERGE.
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`FIRST NOSE — ${by.toUpperCase()}`, size.width - 8, size.height - 8);
    ctx.restore();
  }

  // The aircraft, each with its letter beside it (Blue to the left, Red to the
  // right, so they stay readable when they are on top of each other at the merge).
  for (const [p, colour, letter, side] of [[blue, COLORS.blue, 'B', -1], [red, COLORS.red, 'R', 1]]) {
    const at = project(p);
    drawArrowhead(ctx, at, p.headingRad, colour);
    ctx.save();
    ctx.fillStyle = colour;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = side < 0 ? 'right' : 'left';
    ctx.fillText(letter, at[0] + side * 14, at[1] - 12);
    ctx.restore();
  }

  // The merge point: where both meet, a small cross with its label below.
  const [mx, my] = toScreen(view, size, 0, 0);
  ctx.save();
  ctx.strokeStyle = COLORS.nose;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mx - 5, my);
  ctx.lineTo(mx + 5, my);
  ctx.moveTo(mx, my - 5);
  ctx.lineTo(mx, my + 5);
  ctx.stroke();
  ctx.fillStyle = COLORS.nose;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('MERGE', mx + 8, my + 18);
  ctx.restore();
}

/**
 * The top-down view on a canvas. `run()` gives the run to draw now;
 * `timers` is the module's scheduler scope. Call requestDraw() whenever the
 * fight moves or a setting changes; dispose() when the module closes.
 */
export function createTopDownView(canvas, { timers, run }) {
  return createCanvasSurface(canvas, {
    timers,
    label: 'Top-down view of the fight. Blue (B) and Red (R) start head-on and meet at the MERGE mark; the tables beside it give the numbers.',
    draw: (ctx, surface) => drawTopDown(ctx, surface.size, run()),
  });
}
