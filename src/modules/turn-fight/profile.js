// The side view for Climb and dive (SPEC-turn-fight, "The side view's height
// scale works"): each aircraft's height against its east-west position, with
// level in the middle. It is V6's "vertical profile" (original/shell.html,
// line 4287) with the scale fixed: V6 divided every height by its biggest
// height times the scale and then multiplied by the scale, so 1×, 2× and 4×
// drew the same picture (#20). Here the height is drawn against a range that
// only grows as the fight does, times the scale, and is kept inside the panel.
//
// Like view.js it only reads the run ({ fight, trails }), draws on change only,
// and leaves the fight alone. The label keeps V6's wording. The decided
// "Simplified: constant speed and turn rate" label (Q50) is the one line in the
// stage footer (layout.js), so it shows once for the whole fight, whichever view is up.
import { createCanvasSurface } from '../../ui-kit/canvas-view.js';
import { COLORS } from './view.js';

/** The height range never starts smaller than this (V6 `Math.max(1000, …)`). */
export const MIN_HEIGHT_RANGE_FT = 1000;

/** How far from level the range reaches at 1×, as a fraction of half the plot. 4× reaches 0.8, about V6's 0.4 of the full panel. */
const BASE_FRACTION = 0.2;

/** Lines never go past this fraction of half the plot, so the picture stays inside the panel whatever the scale. */
const EDGE_FRACTION = 0.95;

const TITLE_BAND_PX = 24;
const MARGIN_PX = 10;
const MIN_X_SPAN_FT = 1000;

const PANEL_LINE = '#31495f';
const TITLE_COLOR = '#8ea4b7';

/** The height range, in feet: 1,000 ft at first, the biggest height so far after that. */
export function heightRangeFt(maxAbsZFt) {
  return Math.max(MIN_HEIGHT_RANGE_FT, maxAbsZFt);
}

/** The plotting area inside a box: room for the title above, `midY` is level, `halfPx` is level to the top and to the bottom. */
export function plotArea(size) {
  const top = TITLE_BAND_PX;
  const bottom = size.height - MARGIN_PX;
  const halfPx = Math.max(0, (bottom - top) / 2);
  return { left: MARGIN_PX, right: size.width - MARGIN_PX, top, bottom, midY: top + halfPx, halfPx };
}

/**
 * How many pixels above level a height is drawn (below level for a dive):
 * the height as a fraction of the range, times the scale, times a fixed part
 * of half the plot, and never past the edge.
 */
export function heightOffsetPx(zFt, { rangeFt, scale, halfPx }) {
  const offset = (zFt / rangeFt) * halfPx * BASE_FRACTION * scale;
  const limit = halfPx * EDGE_FRACTION;
  return Math.max(-limit, Math.min(limit, offset));
}

/** The height, in feet, drawn at the edge of where lines may go at this range and scale (for the label). */
export function edgeHeightFt({ rangeFt, scale }) {
  return (EDGE_FRACTION * rangeFt) / (BASE_FRACTION * scale);
}

/** The east-west span along the bottom, at least 1,000 ft wide (V6: widened by 500 ft each side when narrower). */
export function xSpanFt({ minXFt, maxXFt }) {
  if (maxXFt - minXFt < MIN_X_SPAN_FT) return { minXFt: minXFt - 500, maxXFt: maxXFt + 500 };
  return { minXFt, maxXFt };
}

/** Where an east-west position lands between the plot's left and right edges. */
export function xToPx(xFt, span, { left, right }) {
  return left + ((xFt - span.minXFt) / (span.maxXFt - span.minXFt)) * (right - left);
}

const feet = (ft) => `${Math.round(ft).toLocaleString('en-US')} ft`;

/**
 * Paints the side view for a run at a height scale (1, 2 or 4) in a box of
 * `size` CSS pixels. The canvas is cleared already; the panel's own CSS
 * gives the background and border.
 */
export function drawProfile(ctx, size, run, scale) {
  if (!(size.width > 0 && size.height > 0)) return;
  const { fight, trails } = run;
  const { blue, red } = fight;
  const area = plotArea(size);
  const { extent } = trails;
  const rangeFt = heightRangeFt(Math.max(extent.maxAbsZFt, Math.abs(blue.zFt), Math.abs(red.zFt)));
  const span = xSpanFt({
    minXFt: Math.min(extent.minXFt, blue.xFt, red.xFt),
    maxXFt: Math.max(extent.maxXFt, blue.xFt, red.xFt),
  });
  const project = (p) => [xToPx(p.xFt, span, area), area.midY - heightOffsetPx(p.zFt, { rangeFt, scale, halfPx: area.halfPx })];

  ctx.fillStyle = TITLE_COLOR;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`VERTICAL PROFILE • ${scale}×`, 8, 15);
  ctx.textAlign = 'right';
  ctx.fillText(`Edge of panel: ±${feet(edgeHeightFt({ rangeFt, scale }))}`, size.width - 8, 15);

  // Level.
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, area.midY);
  ctx.lineTo(size.width, area.midY);
  ctx.stroke();

  for (const [points, now, colour, letter] of [[trails.blue, blue, COLORS.blue, 'B'], [trails.red, red, COLORS.red, 'R']]) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const [x, y] = project(p);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    const [x, y] = project(now);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    // The letter sits up and to the right of the dot; at the right edge it flips to the left, and never goes above the plot.
    ctx.font = 'bold 12px system-ui, sans-serif';
    const flip = x + 9 + ctx.measureText(letter).width > size.width - 2;
    ctx.textAlign = flip ? 'right' : 'left';
    ctx.fillText(letter, flip ? x - 9 : x + 9, Math.max(y - 7, area.top + 12));
  }
}

/**
 * The side view on a canvas. `run()` gives the run to draw now and `scale()`
 * the height scale. Call requestDraw() when the fight moves or the scale
 * changes; dispose() when the module closes. (While the panel is hidden it is
 * 0 px wide and nothing is painted.)
 */
export function createProfileView(canvas, { timers, run, scale }) {
  return createCanvasSurface(canvas, {
    timers,
    label: 'Side view: each aircraft\'s height change against its east-west position, with level in the middle.',
    draw: (ctx, surface) => drawProfile(ctx, surface.size, run(), scale()),
  });
}
