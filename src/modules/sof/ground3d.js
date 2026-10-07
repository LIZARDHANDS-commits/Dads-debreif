// The SOF 3D view's ground (SOF-39; Dad, 7 Oct: "bigger, sharper 3D ground"): the satellite picture in two tiers. An outer canvas covers the whole 450 NM square at a modest Esri
// zoom; an inner, sharp canvas about 120 NM square round home, at a zoom two levels finer, lies on top of it. Tiles load progressively: the outer picture fills in first,
// the inner one fades in over it as its tiles arrive, and a tile that never comes leaves the outer picture showing there. The radar and lightning pictures are laid on both.
//
// The tile layer (ui-kit map-tiles.js) refuses a view that needs more than 64 tiles, and asks for no finer zoom than a layer's `maxZoom`, so the zooms below keep each tier to about
// 25 to 36 tiles (MAX_GROUND_TILES in all, a named cap so it stays quick). No page of its own: view3d.js hands in three.js, the scheduler scope and the pictures.
import { createTileLayer, ESRI_IMAGERY } from '../../ui-kit/map-tiles.js';
import { cornersOf } from './map-view.js';
import { drawGeoImage } from './map-draw.js';
import { BASE_DIM } from './map-layers.js';
import { AREA_FT } from './scene3d-model.js';
import { FT_PER_NM } from './map-view.js';

/** The outer canvas covers the whole square (about 2,700 ft a pixel at 1,024 px); its tiles are asked for no finer than zoom 7 (about 36 of them over 450 NM). An estimate for speed. */
export const OUTER = Object.freeze({ px: 1024, maxZoom: 7 });
/** The inner canvas covers this many NM square round home, at zoom 9 (two finer than the outer; about 36 tiles), drawn at 1,536 px (about 475 ft a pixel). */
export const INNER_NM = 120;
export const INNER = Object.freeze({ px: 1536, maxZoom: 9, nm: INNER_NM, ft: INNER_NM * FT_PER_NM });
/** The most tiles the two tiers ask for between them: 36 + 36 and some spare. The tile layer itself refuses over 64 for one tier. */
export const MAX_GROUND_TILES = 100;
/** The inner picture's edge fades out over this many pixels, so it does not stop in a hard square. An estimate for the look. */
const INNER_FEATHER_PX = 64;
const GROUND_COLOUR = '#1b2a35'; // the plain ground when no satellite picture arrives
/** The inner picture lies this far (feet, not scaled) above the outer one so the two never fight over the same depth. */
const INNER_LIFT_FT = 30;

/**
 * three.js `T`; timers (a scheduler scope); doc (the page's document, for canvases); onChange() when a tile arrives and the ground must be painted again.
 * Returns { group, setHeight(z), paint({ projection, pictures, noTiles }) -> { failed }, dispose() }.
 */
export function createGround3d({ T, timers, doc, onChange }) {
  const group = new T.Group();
  group.name = 'ground';
  const owned = [];

  const tier = (spec, size, lift, order) => {
    const canvas = doc.createElement('canvas');
    canvas.width = spec.px;
    canvas.height = spec.px;
    const ctx = canvas.getContext('2d');
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    const geometry = new T.PlaneGeometry(size, size);
    const material = new T.MeshBasicMaterial({ map: texture, transparent: lift > 0, depthWrite: lift === 0 });
    const mesh = new T.Mesh(geometry, material);
    mesh.renderOrder = order;
    group.add(mesh);
    const imagery = createTileLayer({ source: { ...ESRI_IMAGERY, maxZoom: spec.maxZoom }, timers, onChange });
    owned.push(geometry, material, texture, imagery);
    return { canvas, ctx, texture, mesh, imagery, lift, px: spec.px, size };
  };
  const outer = tier(OUTER, AREA_FT, 0, -2);
  const inner = tier(INNER, INNER.ft, INNER_LIFT_FT, -1);

  /** Lays the satellite tiles on a tier, then dims them a little (as the 2D map does) so the pictures read on top. `atop`: only where the canvas already has pixels (the inner tier). */
  function paintTier(t, { projection, pictures, noTiles, extentFt }) {
    const { ctx, px } = t;
    const k = px / extentFt;
    const half = extentFt / 2;
    const toPx = (lat, lon) => {
      const [x, y] = projection.toXY(lat, lon);
      return [(x + half) * k, (half - y) * k];
    };
    const isInner = t === inner;
    ctx.globalCompositeOperation = 'source-over';
    if (isInner) ctx.clearRect(0, 0, px, px);
    else {
      ctx.fillStyle = GROUND_COLOUR;
      ctx.fillRect(0, 0, px, px);
    }
    let failed = false;
    if (!noTiles) {
      const corners = cornersOf(projection, { minX: -half, minY: -half, maxX: half, maxY: half });
      t.imagery.draw(ctx, { corners, pxPerFt: k, toScreen: toPx });
      const s = t.imagery.state();
      failed = s.wanted > 0 && s.ready === 0 && s.failed > 0;
    }
    // Dimmed a little under the pictures, as the 2D map does; on the inner tier only where tiles are, so the outer picture below is not dimmed twice.
    ctx.globalCompositeOperation = isInner ? 'source-atop' : 'source-over';
    ctx.fillStyle = `rgba(5, 10, 18, ${BASE_DIM})`;
    ctx.fillRect(0, 0, px, px);
    for (const picture of pictures.list) {
      try {
        drawGeoImage(ctx, picture.image, picture.bbox, toPx, picture.alpha);
      } catch {
        // A picture just let go of: the next change draws the new one.
      }
    }
    if (isInner) {
      // The edge fades to nothing, so the sharp picture melts into the outer one.
      ctx.globalCompositeOperation = 'destination-out';
      const f = INNER_FEATHER_PX;
      const strips = [ // [rect x, y, w, h], gradient from the edge (clear it) inwards (leave it)
        [[0, 0, f, px], [0, 0, f, 0]],
        [[px - f, 0, f, px], [px, 0, px - f, 0]],
        [[0, 0, px, f], [0, 0, 0, f]],
        [[0, px - f, px, f], [0, px, 0, px - f]],
      ];
      for (const [[rx, ry, rw, rh], [gx0, gy0, gx1, gy1]] of strips) {
        const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(rx, ry, rw, rh);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    t.texture.needsUpdate = true;
    return failed;
  }

  return {
    group,
    /** The ground plane's height (feet, already scaled): home's elevation. The inner tier lies a little above it. */
    setHeight(z) {
      outer.mesh.position.z = z;
      inner.mesh.position.z = z + INNER_LIFT_FT;
    },
    /** Paints both tiers. `projection` is the map's; `pictures` is { list: [{ image, bbox, alpha }] }; `noTiles` draws the plain ground. Returns { failed } (the outer tier got no tile at all). */
    paint({ projection, pictures, noTiles = false }) {
      const failed = paintTier(outer, { projection, pictures, noTiles, extentFt: AREA_FT });
      paintTier(inner, { projection, pictures, noTiles, extentFt: INNER.ft });
      return { failed };
    },
    dispose() {
      group.removeFromParent();
      for (const thing of owned) thing.dispose?.();
    },
  };
}
