// The ground round the target: one map projection centred on the chosen place (local feet, x east, y north, the aim point
// at the origin, as pass.js flies) and the sizes of the two ground squares the shared terrain (ui-kit terrain3d.js) and
// the satellite picture (ui-kit draped-ground.js) are drawn on, built the way the EP Tabletop builds Moose Jaw's
// (src/modules/ep-tabletop/world3d.js). Plain values only.
import { makeLocalRef, latLonToLocalFt, localFtToLatLon } from '../../core/geo.js';
import { zoomForTiles, holeFor } from '../../core/terrain-grid.js';
import { FT_PER_NM } from '../../core/units.js';
import { CYMJ_ORIGIN } from '../../airfields/cymj-runways.js';

/**
 * The air refuelling run's ground centre (RS-19): 8 NM from CYMJ toward the place (half way when the place is nearer than
 * 16 NM), so the airfield and the take-off sit in the sharp inner square and the anchor and the join in the outer one
 * (an estimate for the look). Latitude and longitude.
 */
const AAR_GROUND_FROM_CYMJ_NM = 8;
export function aarGroundCentre(place) {
  const ref = makeLocalRef(place.lat, place.lon);
  const c = latLonToLocalFt(ref, CYMJ_ORIGIN.lat, CYMJ_ORIGIN.lon);
  const d = Math.hypot(c.x, c.y);
  const k = d > 0 ? Math.min(0.5, (AAR_GROUND_FROM_CYMJ_NM * FT_PER_NM) / d) : 0;
  return localFtToLatLon(ref, c.x * (1 - k), c.y * (1 - k));
}

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

/** A projection (local feet about a point, x east, y north) for { lat, lon }. */
function projectionAt(at) {
  const r = makeLocalRef(at.lat, at.lon);
  return {
    lat: at.lat,
    lon: at.lon,
    toLatLon: (x, y) => localFtToLatLon(r, x, y),
    toXY: (lat, lon) => {
      const p = latLonToLocalFt(r, lat, lon);
      return [p.x, p.y];
    },
  };
}

/**
 * The projection and the ground plan for a place { lat, lon }. groundCentre ({ lat, lon }, optional; the refuelling run's,
 * aarGroundCentre): where the two ground squares are centred instead of the place, given as `ground`: { projection (local
 * feet about that centre, which the terrain and the satellite picture are read in), offset ({ x, y }: the centre in the
 * place's feet) }. The flying stays in the place's feet (`projection`).
 */
export function areaFor(place, groundCentre = null) {
  const ref = makeLocalRef(place.lat, place.lon);
  const projection = projectionAt(place);
  const gp = groundCentre ? projectionAt(groundCentre) : projection;
  const off = groundCentre ? latLonToLocalFt(ref, groundCentre.lat, groundCentre.lon) : { x: 0, y: 0 };
  const toLatLon = gp.toLatLon;
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
    ground: { projection: gp, offset: { x: off.x, y: off.y } },
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
