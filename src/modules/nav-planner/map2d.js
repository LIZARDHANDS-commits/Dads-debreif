// The planner's 2D map (docs/modules/nav-planner/spec.md, "Map"): the Debrief's map pieces, ui-kit canvas-view.js (drag to pan, wheel or
// + and − to zoom) and map-tiles.js (Esri World Imagery, darkened as the Debrief's), with the route on top. Tap the map to add a turn point,
// drag a point to move it, click one to select it. The map's feet are a flat local map round `ref` (core geo.js), Moose Jaw to begin with.
import { createCanvasView } from '../../ui-kit/canvas-view.js';
import { createTileLayer, ESRI_IMAGERY } from '../../ui-kit/map-tiles.js';
import { makeLocalRef, latLonToLocalFt, localFtToLatLon } from '../../core/geo.js';
import { FT_PER_NM } from '../../core/units.js';
import { CYMJ_ORIGIN } from '../../airfields/cymj-runways.js';
import { mmss, deg3 } from './legs.js';

const BACKGROUND = '#05090d';
const DARKEN = 'rgba(5, 10, 18, 0.22)'; // the Debrief's, so the route stands out
export const COLOURS = Object.freeze({ route: '#42bfe9', low: '#ff6b6b', unknown: '#9bb8c6', point: '#e3eef5', selected: '#ffd166', flown: '#ff9f43', plane: '#ffffff' });
/** A turn point is hit within this many CSS pixels; a press that moves less than TAP_PX is a tap (estimates for feel). */
const HIT_PX = 12;
const TAP_PX = 5;
const SPAN_FT = Object.freeze({ min: 0.3 * FT_PER_NM, max: 400 * FT_PER_NM });

/**
 * canvas: the map's <canvas>; wrap: its parent (pointer presses are caught there first, so dragging a point never pans the map).
 * timers: the module's scheduler scope. state(): { points, legs, selected, addMode, flown (fixes or null), plane ({ lat, lon, headingDegT } or null) }.
 * on: { add(lat, lon), move(i, lat, lon), moveEnd(i), select(i) }. onImagery(state) after each draw: the tiles' { wanted, ready, failed }.
 * @param {{ canvas: HTMLCanvasElement, wrap: HTMLElement, timers: any, state: () => any, on: any, onImagery?: (state: any) => void }} options
 */
export function createRouteMap({ canvas, wrap, timers, state, on, onImagery = () => {} }) {
  let ref = makeLocalRef(CYMJ_ORIGIN.lat, CYMJ_ORIGIN.lon);
  const toXY = (lat, lon) => latLonToLocalFt(ref, lat, lon);
  const imagery = createTileLayer({ source: ESRI_IMAGERY, timers, onChange: () => map.requestDraw() });

  function tileView() {
    const { minX, minY, maxX, maxY } = map.visibleBounds();
    const c = [[minX, minY], [minX, maxY], [maxX, minY], [maxX, maxY]].map(([x, y]) => localFtToLatLon(ref, x, y));
    return {
      corners: { north: Math.max(...c.map((p) => p.lat)), south: Math.min(...c.map((p) => p.lat)), west: Math.min(...c.map((p) => p.lon)), east: Math.max(...c.map((p) => p.lon)) },
      pxPerFt: map.view.scale,
      toScreen: (lat, lon) => {
        const p = toXY(lat, lon);
        return map.worldToScreen(p.x, p.y);
      },
    };
  }

  const screenOf = (p) => {
    const q = toXY(p.lat, p.lon);
    return map.worldToScreen(q.x, q.y);
  };

  /** @param {CanvasRenderingContext2D} ctx @param {string} text @param {number} x @param {number} y @param {{ colour?: string, align?: CanvasTextAlign, bold?: boolean }} [opts] */
  function label(ctx, text, x, y, opts = {}) {
    const { colour = COLOURS.point, align = 'left', bold = false } = opts;
    ctx.font = `${bold ? '600 ' : ''}12px system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(2, 10, 16, 0.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = colour;
    ctx.fillText(text, x, y);
  }

  function drawRoute(ctx) {
    const { points, legs, selected } = state();
    const at = points.map(screenOf);
    // Legs: the line, red with [LOW] below the minimum, dashed while the ground is unknown.
    legs.forEach((leg) => {
      const [a, b] = [at[leg.i], at[leg.i + 1]];
      const c = leg.clearance;
      ctx.save();
      ctx.lineWidth = 3;
      ctx.strokeStyle = c.low ? COLOURS.low : COLOURS.route;
      if (c.status !== 'ready' && !c.low && leg.heightRef === 'MSL') ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      ctx.restore();
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len > 120) {
        const words = `${deg3(leg.headingDegM)}°M · ${leg.distNm.toFixed(1)} NM · ${mmss(leg.timeS)}${c.low ? ' [LOW]' : ''}`;
        label(ctx, words, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 12, { align: 'center', colour: c.low ? COLOURS.low : COLOURS.point });
      }
      if (c.highestAt && Number.isFinite(c.highestFt)) {
        const [hx, hy] = screenOf(c.highestAt);
        ctx.fillStyle = c.low ? COLOURS.low : '#f5c542';
        ctx.beginPath();
        ctx.moveTo(hx, hy - 7);
        ctx.lineTo(hx + 6, hy + 4);
        ctx.lineTo(hx - 6, hy + 4);
        ctx.closePath();
        ctx.fill();
        if (len > 160) label(ctx, `${Math.round(c.highestFt / 10) * 10} ft`, hx + 9, hy, { colour: '#f5e3a8' });
      }
    });
    // Turn points: a ring and the name; the selected one lit.
    at.forEach(([x, y], i) => {
      const sel = i === selected;
      ctx.lineWidth = sel ? 3 : 2;
      ctx.strokeStyle = sel ? COLOURS.selected : COLOURS.point;
      ctx.fillStyle = 'rgba(2, 10, 16, 0.55)';
      ctx.beginPath();
      ctx.arc(x, y, sel ? 8 : 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      label(ctx, `${i + 1} ${points[i].name}`, x + 11, y + 1, { colour: sel ? COLOURS.selected : COLOURS.point, bold: true });
    });
  }

  function drawFlown(ctx, fixes) {
    ctx.save();
    ctx.strokeStyle = COLOURS.flown;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let last = null;
    for (const f of fixes) {
      const [x, y] = screenOf(f);
      if (last && Math.hypot(x - last[0], y - last[1]) < 1.5) continue; // thin the line at small scales
      if (last) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      last = [x, y];
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawPlane(ctx, plane) {
    const [x, y] = screenOf(plane);
    const r = ((plane.headingDegT ?? 0) * Math.PI) / 180;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r);
    ctx.fillStyle = COLOURS.plane;
    ctx.strokeStyle = '#020a10';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  const map = createCanvasView(canvas, {
    timers,
    minSpan: SPAN_FT.min,
    maxSpan: SPAN_FT.max,
    label: 'Map of the route: drag to move, scroll or press + and − to zoom, tap to add a turn point, drag a point to move it',
    draw(ctx) {
      const { width, height } = map.size;
      ctx.fillStyle = BACKGROUND;
      ctx.fillRect(0, 0, width, height);
      imagery.draw(ctx, tileView());
      ctx.fillStyle = DARKEN;
      ctx.fillRect(0, 0, width, height);
      onImagery(imagery.state());
      const s = state();
      if (s.flown?.length) drawFlown(ctx, s.flown);
      drawRoute(ctx);
      if (s.plane) drawPlane(ctx, s.plane);
    },
  });
  map.setView({ cx: 0, cy: 0, scale: 900 / (60 * FT_PER_NM) });

  // ---- Pointer: drag a point, tap to add, click to select ----
  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  function hit(sx, sy) {
    const { points } = state();
    let best = -1;
    let bestD = HIT_PX;
    points.forEach((p, i) => {
      const [x, y] = screenOf(p);
      const d = Math.hypot(x - sx, y - sy);
      if (d <= bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }
  let press = null;
  const onDown = (e) => {
    if (e.button !== 0 || e.target !== canvas) return;
    const [sx, sy] = local(e);
    const i = hit(sx, sy);
    press = { id: e.pointerId, sx, sy, i, moved: false };
    if (i >= 0) {
      e.stopPropagation(); // the map does not pan while a point is dragged
      wrap.setPointerCapture?.(e.pointerId);
      on.select(i);
    }
  };
  const onMove = (e) => {
    if (!press || e.pointerId !== press.id) return;
    const [sx, sy] = local(e);
    if (Math.hypot(sx - press.sx, sy - press.sy) > TAP_PX) press.moved = true;
    if (press.i >= 0 && press.moved) {
      e.stopPropagation();
      const [wx, wy] = map.screenToWorld(sx, sy);
      const ll = localFtToLatLon(ref, wx, wy);
      on.move(press.i, ll.lat, ll.lon);
    }
  };
  const onUp = (e) => {
    if (!press || e.pointerId !== press.id) return;
    const p = press;
    press = null;
    if (p.i >= 0) {
      e.stopPropagation();
      if (p.moved) on.moveEnd(p.i);
      return;
    }
    if (!p.moved && state().addMode) {
      const [wx, wy] = map.screenToWorld(p.sx, p.sy);
      const ll = localFtToLatLon(ref, wx, wy);
      on.add(ll.lat, ll.lon);
    }
  };
  wrap.addEventListener('pointerdown', onDown, true);
  wrap.addEventListener('pointermove', onMove, true);
  wrap.addEventListener('pointerup', onUp, true);
  wrap.addEventListener('pointercancel', onUp, true);

  /** The box round some { lat, lon } in map feet. */
  function boundsOf(list) {
    const xy = list.map((p) => toXY(p.lat, p.lon));
    return { minX: Math.min(...xy.map((p) => p.x)), maxX: Math.max(...xy.map((p) => p.x)), minY: Math.min(...xy.map((p) => p.y)), maxY: Math.max(...xy.map((p) => p.y)) };
  }

  return {
    /** Puts the map's feet round a new place (an opened route far from Moose Jaw). */
    setRef(lat, lon) {
      ref = makeLocalRef(lat, lon);
      map.requestDraw();
    },
    /** Fits these points ({ lat, lon }) to the view, or Moose Jaw with none. */
    fit(list) {
      if (!list.length) {
        map.setView({ cx: 0, cy: 0, scale: map.size.width / (60 * FT_PER_NM) });
        return;
      }
      if (list.length === 1) {
        const p = toXY(list[0].lat, list[0].lon);
        map.setCenter(p.x, p.y);
        return;
      }
      map.fit(boundsOf(list), 48);
    },
    requestDraw: map.requestDraw,
    dispose() {
      wrap.removeEventListener('pointerdown', onDown, true);
      wrap.removeEventListener('pointermove', onMove, true);
      wrap.removeEventListener('pointerup', onUp, true);
      wrap.removeEventListener('pointercancel', onUp, true);
      imagery.dispose();
      map.dispose();
    },
  };
}
