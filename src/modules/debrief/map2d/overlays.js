// The built-in route overlays (V6's 19 routes): projected into the flight's
// map feet and drawn dashed under the tracks with the route's name (V6
// projectKmlOverlay and drawSelectedKmlOverlay, lines 2257-2305). Also the
// airspace outlines and runways round the flight (DB-24), in the shared 3D's colours.
import { latLonToLocalFt } from '../../../core/geo.js';
import { outlineXY } from '../../../airfields/airspace/model.js';
import { KIND_COLOURS } from '../../../ui-kit/airspace3d.js';
import { runwayGeometry, AIRPORT_COLOURS } from '../../../ui-kit/airfield3d.js';

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

// ---- Airspace and airfields on the 2D map (DB-24) ----------------------------------------------------------------------------

/**
 * What the map draws for the airspace and airfields, in map feet, from the views' `space` ({ toXY, airspace, airfields }, debrief/airspace.js):
 * { volumes: [{ kind, ring: [[x, y], ...], line (a training route's open centreline) }], runways: [{ corners: [[x, y] x 4], widthFt }] }.
 */
export function projectSpace(want) {
  const volumes = (want?.airspace ?? []).map((v) => ({ kind: v.kind, ring: outlineXY(v, want.toXY), line: v.shape.type === 'line' }));
  const runways = [];
  for (const airport of want?.airfields ?? []) {
    for (const r of airport.runways ?? []) {
      const g = runwayGeometry(r, want.toXY);
      if (!g) continue;
      const [ux, uy] = [Math.cos(g.angle), Math.sin(g.angle)];
      const [nx, ny] = [-uy * g.widthFt / 2, ux * g.widthFt / 2];
      runways.push({ widthFt: g.widthFt, corners: [[g.ax + nx, g.ay + ny], [g.bx + nx, g.by + ny], [g.bx - nx, g.by - ny], [g.ax - nx, g.ay - ny]], ends: [[g.ax, g.ay], [g.bx, g.by]] });
    }
  }
  return { volumes, runways };
}

const SPACE_LINE_ALPHA = 0.8; // the airspace outlines, faint enough that the tracks read over them (an estimate)
const RUNWAY_MIN_PX = 3; // a runway is drawn at least this wide on the screen, so it shows zoomed out (an estimate, as the 3D's)

/** The airspace outlines (edge colour by kind, as the 3D view and the SOF draw them) and the runways (the 3D's grey, a white edge), under the tracks. */
export function drawSpace(ctx, map, projected) {
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = SPACE_LINE_ALPHA;
  for (const v of projected.volumes) {
    if (v.ring.length < 2) continue;
    ctx.strokeStyle = KIND_COLOURS[v.kind] ?? KIND_COLOURS.other;
    ctx.setLineDash(v.line ? [8, 5] : []);
    ctx.beginPath();
    v.ring.forEach(([x, y], i) => {
      const [sx, sy] = map.worldToScreen(x, y);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    if (!v.line) ctx.closePath();
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  for (const r of projected.runways) {
    const px = r.widthFt * map.view.scale;
    if (px < RUNWAY_MIN_PX) {
      // Too narrow to fill: a grey line with a white core, at least RUNWAY_MIN_PX wide.
      const [[ax, ay], [bx, by]] = r.ends.map(([x, y]) => map.worldToScreen(x, y));
      ctx.lineCap = 'butt';
      for (const [colour, width] of [[AIRPORT_COLOURS.paint, RUNWAY_MIN_PX + 2], [AIRPORT_COLOURS.asphalt, RUNWAY_MIN_PX]]) {
        ctx.strokeStyle = colour;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
      continue;
    }
    ctx.beginPath();
    r.corners.forEach(([x, y], i) => {
      const [sx, sy] = map.worldToScreen(x, y);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.fillStyle = AIRPORT_COLOURS.asphalt;
    ctx.fill();
    ctx.strokeStyle = AIRPORT_COLOURS.paint;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}
