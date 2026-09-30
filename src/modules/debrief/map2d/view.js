// The 2D map: the ui-kit canvas view (drag to pan, wheel or +/- to zoom)
// with the debrief's layers on it. It draws only when something changed:
// the time, the view, a layer or the size (#43), so a paused debrief draws
// nothing.
import { createCanvasView } from '../../../ui-kit/canvas-view.js';
import { MAP_MIN_SPAN_FT, MAP_MAX_SPAN_FT, flightBounds, shipsAt } from '../state.js';
import { trackPaths, drawGrid, drawTracks, drawShips } from './layers.js';

/**
 * canvas: the map's <canvas>. timers: the module's scheduler scope.
 * time(): the playback time to draw. layers(): { grid } from the layout settings.
 * labels(flight, t): each ship's standards label, { slot: { text, tone } }.
 */
export function createMapView(canvas, { timers, time, layers, labels = () => ({}) }) {
  let flight = null;
  let paths = [];

  const map = createCanvasView(canvas, {
    timers,
    minSpan: MAP_MIN_SPAN_FT,
    maxSpan: MAP_MAX_SPAN_FT,
    label: 'Map of the flight: drag to move, scroll or press + and − to zoom',
    arrowKeys: false, // ← and → step playback (SPEC-debrief: Keyboard)
    draw(ctx) {
      if (layers().grid) drawGrid(ctx, map);
      if (!flight) return;
      drawTracks(ctx, map, paths);
      const t = time();
      drawShips(ctx, map, shipsAt(flight, t), labels(flight, t));
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
