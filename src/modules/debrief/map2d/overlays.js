// The built-in route overlays (V6's 19 routes): projected into the flight's
// map feet and drawn dashed under the tracks with the route's name (V6
// projectKmlOverlay and drawSelectedKmlOverlay, lines 2257-2305).
import { latLonToLocalFt } from '../../../core/geo.js';

/** A route's paths in map feet from `ref`, the map's origin (core makeLocalRef). */
export function projectRoute(route, ref) {
  return {
    name: route.name,
    paths: route.paths.map((path) => path.map(([lon, lat]) => {
      const { x, y } = latLonToLocalFt(ref, lat, lon);
      return [x, y];
    })),
  };
}

/** The box round a projected route, for Fit when no flight is loaded. */
export function routeBounds(projected) {
  const points = projected.paths.flat();
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

const ROUTE_COLOR = '#ffcc66';

/** V6's look: amber, dashed, at the chosen opacity (per cent), named at its first point. */
export function drawRoute(ctx, map, projected, opacityPct) {
  ctx.save();
  ctx.globalAlpha = opacityPct / 100;
  ctx.strokeStyle = ROUTE_COLOR;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([10, 5]);
  for (const path of projected.paths) {
    ctx.beginPath();
    path.forEach(([x, y], i) => {
      const [sx, sy] = map.worldToScreen(x, y);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const [fx, fy] = map.worldToScreen(...projected.paths[0][0]);
  ctx.font = '12px system-ui, sans-serif';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#02060a';
  ctx.strokeText(projected.name, fx + 8, fy - 8);
  ctx.fillStyle = ROUTE_COLOR;
  ctx.fillText(projected.name, fx + 8, fy - 8);
  ctx.restore();
}
