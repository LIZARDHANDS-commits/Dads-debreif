// The airspace the SOF's 3D view draws for the square it shows (SOF-53): the shared airspace list (src/airfields/airspace/) cut to the "3D area" the
// setting chose. Kept in the SOF when the airspace data and model moved to the shared folder (10 Oct 2026, SOF-62), because it cuts lines with the SOF's own
// clipLine (weather3d-model.js), as its fronts are cut.
import { outlineXY } from '../../airfields/airspace/model.js';
import { clipLine } from './weather3d-model.js';

/**
 * The entries the 3D view draws for the square it shows (`halfFt` its half width, feet from home; the "3D area" setting, Dad 8 Oct 2026). An airspace file can cover more
 * than the square (the FAA files cover the largest choice, 900 NM): an area (polygon or circle) is kept when its outline's bounds reach into the square, as the FAA tool keeps
 * the ones whose box reaches its own (an area across the edge is drawn whole); a line (a military training route) is cut at the square's edge, each piece inside its own
 * entry ("IR123 (part 2)" for a second piece), back in lat and lon with `toLatLon(x, y)`. An entry whose shape cannot be read is passed on as it is, for `checkedAirspace`
 * to name. `toXY(lat, lon)` gives [x, y] in feet.
 */
export function airspaceInSquare(list, { toXY, toLatLon, halfFt }) {
  const out = [];
  for (const entry of Array.isArray(list) ? list : []) {
    let xy;
    try {
      xy = outlineXY(entry, toXY);
    } catch {
      out.push(entry);
      continue;
    }
    if (!xy.length || xy.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) {
      out.push(entry);
      continue;
    }
    if (entry.shape.type === 'line') {
      const pieces = clipLine(xy, halfFt);
      pieces.forEach((piece, n) => {
        const points = piece.map(([x, y]) => {
          const { lat, lon } = toLatLon(x, y);
          return [lat, lon];
        });
        out.push({ ...entry, id: n === 0 ? entry.id : `${entry.id} (part ${n + 1})`, shape: { ...entry.shape, points } });
      });
      continue;
    }
    const xs = xy.map((p) => p[0]);
    const ys = xy.map((p) => p[1]);
    if (Math.max(...xs) >= -halfFt && Math.min(...xs) <= halfFt && Math.max(...ys) >= -halfFt && Math.min(...ys) <= halfFt) out.push(entry);
  }
  return out;
}
