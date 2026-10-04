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
import { toScreen, visibleBounds, fitBounds, createCanvasSurface } from '../../ui-kit/canvas-view.js';
import { startGeometry, passMarkWord } from './geometry.js';
import { aircraftTagLines } from './readouts.js';

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
export function drawTopDown(ctx, size, run, options = {}) {
  if (!(size.width > 0 && size.height > 0)) return;
  const { fight, trails } = run;
  const { blue, red } = fight;
  const showDataTags = Boolean(options.dataTags);
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
    const { from, to, by, both } = fight.firstNose;
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
    ctx.fillText(`FIRST NOSE — ${both ? 'BOTH' : by.toUpperCase()}`, size.width - 8, size.height - 8);
    ctx.restore();
  }

  // The aircraft, each with its letter beside it (Blue to the left, Red to the
  // right, so they stay readable when they are on top of each other at the merge).
  for (const [p, colour, letter, who, side] of [[blue, COLORS.blue, 'B', 'blue', -1], [red, COLORS.red, 'R', 'red', 1]]) {
    const at = project(p);
    drawArrowhead(ctx, at, p.headingRad, colour);
    ctx.save();
    ctx.fillStyle = colour;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = side < 0 ? 'right' : 'left';
    ctx.fillText(letter, at[0] + side * 14, at[1] - 12);

    if (showDataTags) {
      const tag = aircraftTagLines(fight, p, who);
      ctx.font = '10px system-ui, sans-serif';
      const w1 = ctx.measureText ? (ctx.measureText(tag.title)?.width || 80) : 80;
      const w2 = ctx.measureText ? (ctx.measureText(tag.detail)?.width || 80) : 80;
      const maxW = Math.max(w1, w2);

      const tagH = 26;
      const tagPad = 4;
      const tagW = maxW + tagPad * 2;
      const tagX = side < 0 ? at[0] - 14 - tagW : at[0] + 14;
      const tagY = at[1] - 8;

      // Dark translucent backdrop
      ctx.fillStyle = 'rgba(10, 18, 28, 0.85)';
      ctx.fillRect(tagX, tagY, tagW, tagH);

      // Border in aircraft color
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1;
      ctx.strokeRect(tagX, tagY, tagW, tagH);

      // Lines of text
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(tag.title, tagX + tagPad, tagY + 11);
      ctx.fillStyle = colour;
      ctx.fillText(tag.detail, tagX + tagPad, tagY + 22);
    }
    ctx.restore();
  }

  // The merge point: where both meet (R28: the pass), a small cross with its label below.
  // Not drawn when the turns start at once or the range is opening, since there is no pass to mark.
  if (!fight.mergeMark) return;
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
  ctx.fillText(passMarkWord(fight), mx + 8, my + 18);
  ctx.restore();
}

/**
 * The top-down view on a canvas. `run()` gives the run to draw now;
 * `timers` is the module's scheduler scope. Call requestDraw() whenever the
 * fight moves or a setting changes; dispose() when the module closes.
 */
export function createTopDownView(canvas, { timers, run, options = () => ({}) }) {
  return createCanvasSurface(canvas, {
    timers,
    label: 'Top-down view of the fight. Blue (B) and Red (R) fly toward each other and turn at the MERGE or PASS mark, or at once; the tables beside it give the numbers.',
    draw: (ctx, surface) => drawTopDown(ctx, surface.size, run(), options()),
  });
}

// ── The start picture (R28) ───────────────────────────────────────────────────
// A small picture in Turn Fight settings, Start geometry: both jets at T+0 with
// the straight line each one is flying and the range between them, drawn from the
// numbers as they change (SPEC-turn-fight, "Show the setup, not just numbers").

/** A flight line in the start picture is this fraction of the range long. */
const FLIGHT_LINE_OF_RANGE = 0.3;
const PICTURE_PAD_PX = 24;

/**
 * Where everything in the start picture goes, in pixels, for a setup (the
 * range, speeds, ATA and AA with their sides) in a box: both jets, the far end
 * of each one's flight line, and the scale. The picture fits the box with room
 * for the arrowheads; north is up, Blue's first heading is to the right.
 */
export function startPictureView(setup, size) {
  const g = startGeometry(setup);
  const lineFt = setup.separationNm * FT_PER_NM * FLIGHT_LINE_OF_RANGE;
  const ahead = (p) => ({ x: p.xFt + Math.cos(p.headingRad) * lineFt, y: p.yFt + Math.sin(p.headingRad) * lineFt });
  const blueAhead = ahead(g.blue), redAhead = ahead(g.red);
  const xs = [g.blue.xFt, g.red.xFt, blueAhead.x, redAhead.x], ys = [g.blue.yFt, g.red.yFt, blueAhead.y, redAhead.y];
  const view = fitBounds(
    { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
    size, PICTURE_PAD_PX,
  );
  return {
    scale: view.scale,
    blue: toScreen(view, size, g.blue.xFt, g.blue.yFt),
    red: toScreen(view, size, g.red.xFt, g.red.yFt),
    blueAhead: toScreen(view, size, blueAhead.x, blueAhead.y),
    redAhead: toScreen(view, size, redAhead.x, redAhead.y),
    blueHeadingRad: g.blue.headingRad,
    redHeadingRad: g.red.headingRad,
  };
}

/** Paints the start picture for a setup in a box of `size` CSS pixels (cleared already). */
export function drawStartPicture(ctx, size, setup) {
  if (!(size.width > 0 && size.height > 0)) return;
  const pic = startPictureView(setup, size);
  const line = (from, to, colour, dash) => {
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0], to[1]);
    ctx.stroke();
    ctx.restore();
  };
  // The range, then each jet's straight line ahead of it.
  line(pic.blue, pic.red, COLORS.gridText, [3, 4]);
  line(pic.blue, pic.blueAhead, COLORS.blue, [6, 4]);
  line(pic.red, pic.redAhead, COLORS.red, [6, 4]);
  ctx.save();
  ctx.fillStyle = COLORS.gridText;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${setup.separationNm} NM`, (pic.blue[0] + pic.red[0]) / 2, (pic.blue[1] + pic.red[1]) / 2 - 6);
  ctx.restore();
  drawArrowhead(ctx, pic.blue, pic.blueHeadingRad, COLORS.blue);
  drawArrowhead(ctx, pic.red, pic.redHeadingRad, COLORS.red);
  for (const { at, colour, letter } of [{ at: pic.blue, colour: COLORS.blue, letter: 'B' }, { at: pic.red, colour: COLORS.red, letter: 'R' }]) {
    ctx.save();
    ctx.fillStyle = colour;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(letter, at[0], at[1] - 12);
    ctx.restore();
  }
}

/**
 * The start picture on a canvas. `setup()` gives the start's numbers now (range,
 * speeds, ATA, AA); call requestDraw() when any of them changes.
 */
export function createStartPictureView(canvas, { timers, setup }) {
  return createCanvasSurface(canvas, {
    timers,
    label: 'Picture of the start: Blue (B) and Red (R) with the way each is flying and the range between them.',
    draw: (ctx, surface) => drawStartPicture(ctx, surface.size, setup()),
  });
}
