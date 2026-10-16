// The ground round the target: one map projection centred on the chosen place (local feet, x east, y north, the aim point
// at the origin, as pass.js flies) and the sizes of the two ground squares the shared terrain (ui-kit terrain3d.js) and
// the satellite picture (ui-kit draped-ground.js) are drawn on, built the way the EP Tabletop builds Moose Jaw's
// (src/modules/ep-tabletop/world3d.js). Plain values only.
import { makeLocalRef, latLonToLocalFt, localFtToLatLon } from '../../core/geo.js';
import { zoomForTiles, holeFor } from '../../core/terrain-grid.js';
import { FT_PER_NM } from '../../core/units.js';

/**
 * The squares: the outer 80 NM across (beyond the haze), the inner, sharper one 20 NM across round the target (the
 * orbit, the IP and the escape fit in it). Sizes and tile caps are estimates that keep each tier to the tile layers'
 * limits (about 36 to 49 tiles), as the EP Tabletop's.
 */
const OUTER_NM = 80;
const INNER_NM = 20;
const OUTER_CELLS = 160;
const INNER_CELLS = 240;
const IMAGERY_PX = 2048;

/** The projection and the ground plan for a place { lat, lon }. */
export function areaFor(place) {
  const ref = makeLocalRef(place.lat, place.lon);
  const toLatLon = (x, y) => localFtToLatLon(ref, x, y);
  const projection = {
    lat: place.lat,
    lon: place.lon,
    toLatLon,
    toXY: (lat, lon) => {
      const p = latLonToLocalFt(ref, lat, lon);
      return [p.x, p.y];
    },
  };
  const box = (sizeFt) => {
    const h = sizeFt / 2;
    const p = [[-h, -h], [-h, h], [h, -h], [h, h]].map(([x, y]) => toLatLon(x, y));
    return { north: Math.max(...p.map((q) => q.lat)), south: Math.min(...p.map((q) => q.lat)), west: Math.min(...p.map((q) => q.lon)), east: Math.max(...p.map((q) => q.lon)) };
  };
  const outerFt = OUTER_NM * FT_PER_NM;
  const innerFt = INNER_NM * FT_PER_NM;
  const [ob, ib] = [box(outerFt), box(innerFt)];
  return {
    ref,
    projection,
    plan: {
      outer: { sizeFt: outerFt, cells: OUTER_CELLS, zoom: zoomForTiles(ob, { maxTiles: 36, minZoom: 5, maxZoom: 9 }).zoom },
      inner: { sizeFt: innerFt, cells: INNER_CELLS, zoom: zoomForTiles(ib, { maxTiles: 49, minZoom: 7, maxZoom: 12 }).zoom },
      hole: holeFor({ outerSizeFt: outerFt, outerCells: OUTER_CELLS, innerSizeFt: innerFt }),
    },
    imagery: {
      outer: { px: IMAGERY_PX, maxZoom: zoomForTiles(ob, { maxTiles: 36, minZoom: 5, maxZoom: 10 }).zoom },
      inner: { px: IMAGERY_PX, maxZoom: zoomForTiles(ib, { maxTiles: 49, minZoom: 7, maxZoom: 13 }).zoom },
    },
  };
}
