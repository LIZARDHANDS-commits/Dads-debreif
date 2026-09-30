// The 2D map: the ui-kit canvas view (drag to pan, wheel or +/- to zoom)
// with the debrief's layers on it. It draws only when something changed:
// the time, the view, a layer or the size (#43), so a paused debrief draws
// nothing.
import { createCanvasView } from '../../../ui-kit/canvas-view.js';
import { MAP_MIN_SPAN_FT, MAP_MAX_SPAN_FT, flightBounds, shipsAt } from '../state.js';
import {
  trackPaths, drawGrid, drawTracks, drawShips, draw39Line, drawCone, drawSpacingLines, drawBubbles, drawClockMarks, drawDfpFlags,
} from './layers.js';
import { ROUTES } from '../data/routes.js';
import { projectRoute, routeBounds, drawRoute } from './overlays.js';
import { createTileLayer, ESRI_IMAGERY } from './tiles.js';
import { makeLocalRef, latLonToLocalFt, localFtToLatLon } from '../../../core/geo.js';
import { VNC_ANCHOR } from '../data/cymj.js';

// Where the map's feet start with no flight loaded: Moose Jaw, as in V6, so
// routes and imagery line up before any track does.
const HOME_REF = makeLocalRef(VNC_ANCHOR.lat, VNC_ANCHOR.lon);
const SATELLITE_BACKGROUND = '#05090d';
const SATELLITE_DARKEN = 'rgba(5, 10, 18, 0.22)'; // V6's, so the tracks stand out

/**
 * canvas: the map's <canvas>. timers: the module's scheduler scope.
 * time(): the playback time to draw. layers(): the layout settings (grid,
 * satellite, trail, spacingLines, lead39, three39, cone, clockMarks, bubble, bubbleFt,
 * followLead, route, routeOpacity). labels(flight, t): each ship's standards label,
 * { slot: { text, tone } }. dfps(): the DFP flags, [{ x, y, label }].
 * onImagery(state): after each draw with satellite on, the tiles' { wanted,
 * ready, failed }, or null when it's off.
 */
export function createMapView(canvas, { timers, time, layers, labels = () => ({}), dfps = () => [], onImagery = () => {} }) {
  let flight = null;
  let paths = [];
  let needsFit = false; // a flight arrived while the map was hidden (3D showing)
  let routeName = '';
  let route = null; // the chosen route in this flight's map feet

  const mapRef = () => flight?.ref ?? HOME_REF;

  function placeRoute() {
    const chosen = ROUTES.find((r) => r.name === routeName);
    route = chosen ? projectRoute(chosen, mapRef()) : null;
  }

  const imagery = createTileLayer({ source: ESRI_IMAGERY, timers, onChange: () => map.requestDraw() });

  function drawImagery(ctx) {
    const ref = mapRef();
    const { minX, minY, maxX, maxY } = map.visibleBounds();
    const cornersLl = [[minX, minY], [minX, maxY], [maxX, minY], [maxX, maxY]].map(([x, y]) => localFtToLatLon(ref, x, y));
    const corners = {
      north: Math.max(...cornersLl.map((c) => c.lat)),
      south: Math.min(...cornersLl.map((c) => c.lat)),
      west: Math.min(...cornersLl.map((c) => c.lon)),
      east: Math.max(...cornersLl.map((c) => c.lon)),
    };
    const { width, height } = map.size;
    ctx.fillStyle = SATELLITE_BACKGROUND;
    ctx.fillRect(0, 0, width, height);
    imagery.draw(ctx, {
      corners,
      pxPerFt: map.view.scale,
      toScreen: (lat, lon) => {
        const { x, y } = latLonToLocalFt(ref, lat, lon);
        return map.worldToScreen(x, y);
      },
    });
    ctx.fillStyle = SATELLITE_DARKEN;
    ctx.fillRect(0, 0, width, height);
  }

  const map = createCanvasView(canvas, {
    timers,
    minSpan: MAP_MIN_SPAN_FT,
    maxSpan: MAP_MAX_SPAN_FT,
    label: 'Map of the flight: drag to move, scroll or press + and − to zoom',
    arrowKeys: false, // ← and → step playback (SPEC-debrief: Keyboard)
    draw(ctx) {
      if (needsFit && flight && map.size.width > 1) {
        needsFit = false;
        map.fit(flightBounds(flight));
      }
      const on = layers();
      const t = time();
      const ships = shipsAt(flight, t);
      const lead = ships.find((s) => s.slot === 1);
      // "Follow Lead" keeps Lead in the middle (V6 line 3017); zoom still works.
      // Drawing goes on with the new centre; the extra draw it asks for finds nothing changed.
      if (on.followLead && lead && (lead.xFt !== map.view.cx || lead.yFt !== map.view.cy)) map.setCenter(lead.xFt, lead.yFt);
      if (on.route !== routeName) {
        routeName = on.route;
        placeRoute();
        // With no flight to show, the view goes to the route (V6 fitKmlOverlayToView).
        if (route && !flight) map.fit(routeBounds(route));
      }
      if (on.satellite) drawImagery(ctx);
      onImagery(on.satellite ? imagery.state() : null);
      if (route) drawRoute(ctx, map, route, on.routeOpacity);
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
      placeRoute();
      // A hidden map has no size to fit to, so it fits when it next shows.
      if (next && canvas.clientWidth) map.fit(flightBounds(next));
      else {
        needsFit = Boolean(next);
        map.requestDraw();
      }
    },
    /** Fits the whole flight to the view again. */
    fit() {
      if (flight) map.fit(flightBounds(flight));
    },
    requestDraw: map.requestDraw,
    get view() {
      return map.view;
    },
    dispose() {
      imagery.dispose();
      map.dispose();
    },
  };
}
