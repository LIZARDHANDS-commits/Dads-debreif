// The 2D map: the ui-kit canvas view (drag to pan, wheel or +/- to zoom)
// with the debrief's layers on it. It draws only when something changed:
// the time, the view, a layer or the size (#43), so a paused debrief draws
// nothing.
import { createCanvasView } from '../../../ui-kit/canvas-view.js';
import { MAP_MIN_SPAN_FT, MAP_MAX_SPAN_FT, flightBounds, shipsAt } from '../state.js';
import {
  trackPaths, drawGrid, drawTracks, drawShips, draw39Line, drawCone, drawSpacingLines, drawBubbles, drawClockMarks, drawDfpFlags,
} from './layers.js';

/**
 * canvas: the map's <canvas>. timers: the module's scheduler scope.
 * time(): the playback time to draw. layers(): the layout settings (grid,
 * trail, spacingLines, lead39, three39, cone, clockMarks, bubble, bubbleFt,
 * followLead). labels(flight, t): each ship's standards label,
 * { slot: { text, tone } }. dfps(): the DFP flags, [{ x, y, label }].
 */
export function createMapView(canvas, { timers, time, layers, labels = () => ({}), dfps = () => [] }) {
  let flight = null;
  let paths = [];

  const map = createCanvasView(canvas, {
    timers,
    minSpan: MAP_MIN_SPAN_FT,
    maxSpan: MAP_MAX_SPAN_FT,
    label: 'Map of the flight: drag to move, scroll or press + and − to zoom',
    arrowKeys: false, // ← and → step playback (SPEC-debrief: Keyboard)
    draw(ctx) {
      const on = layers();
      const t = time();
      const ships = shipsAt(flight, t);
      const lead = ships.find((s) => s.slot === 1);
      // "Follow Lead" keeps Lead in the middle (V6 line 3017); zoom still works.
      // Drawing goes on with the new centre; the extra draw it asks for finds nothing changed.
      if (on.followLead && lead && (lead.xFt !== map.view.cx || lead.yFt !== map.view.cy)) map.setCenter(lead.xFt, lead.yFt);
      if (on.grid) drawGrid(ctx, map);
      if (!flight) return;
      if (on.lead39 && lead) draw39Line(ctx, map, lead, 'Lead 3/9');
      const three = ships.find((s) => s.slot === 3);
      if (on.three39 && three) draw39Line(ctx, map, three, '#3 3/9');
      if (on.cone && lead) drawCone(ctx, map, lead);
      drawTracks(ctx, map, paths, { flight, mode: on.trail, t });
      if (on.spacingLines) drawSpacingLines(ctx, map, ships);
      drawDfpFlags(ctx, map, dfps());
      if (on.bubble) drawBubbles(ctx, map, ships, on.bubbleFt);
      if (on.clockMarks) drawClockMarks(ctx, map, ships);
      drawShips(ctx, map, ships, labels(flight, t));
    },
  });

  return {
    /** Shows a new flight (or none) and fits it to the view. */
    setFlight(next) {
      flight = next;
      paths = trackPaths(next);
      if (next) map.fit(flightBounds(next));
      else map.requestDraw();
    },
    /** Fits the whole flight to the view again. */
    fit() {
      if (flight) map.fit(flightBounds(flight));
    },
    requestDraw: map.requestDraw,
    get view() {
      return map.view;
    },
    dispose: map.dispose,
  };
}
