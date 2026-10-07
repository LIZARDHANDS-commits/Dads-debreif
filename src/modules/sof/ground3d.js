// The SOF 3D view's ground (SOF-39; Dad, 7 Oct: "bigger, sharper 3D ground"): the satellite picture in two tiers. An outer canvas covers the whole 450 NM square at a modest Esri
// zoom; an inner, sharp canvas about 120 NM square round home, at a zoom two levels finer, lies on top of it. Tiles load progressively: the outer picture fills in first,
// the inner one fades in over it as its tiles arrive, and a tile that never comes leaves the outer picture showing there. The radar and lightning pictures are laid on both.
//
// Real terrain (Dad, 7 Oct): each tier is a height-mapped mesh, not a flat plane (terrain-model.js and terrain3d.js work out the heights from the Terrarium elevation tiles; this
// file only draws them). The inner patch stands in a hole of the outer mesh with its edge heights matched to it, so the two never cross; its feathered edge is blended into a
// copy of the outer picture on its own canvas instead of fading to see-through. Flat (terrain off, or no tile yet), both meshes lie at home's elevation as the old plane did.
//
// The tile layer (ui-kit map-tiles.js) refuses a view that needs more than 64 tiles, and asks for no finer zoom than a layer's `maxZoom`, so the zooms below keep each tier to about
// 25 to 36 tiles (MAX_GROUND_TILES in all, a named cap so it stays quick). No page of its own: view3d.js hands in three.js, the scheduler scope and the pictures.
import { createTileLayer, ESRI_IMAGERY } from '../../ui-kit/map-tiles.js';
import { cornersOf } from './map-view.js';
import { drawGeoImage } from './map-draw.js';
import { BASE_DIM } from './map-layers.js';
import { AREA_FT } from './scene3d-model.js';
import { INNER_NM, INNER_FT, OUTER_CELLS, INNER_CELLS, HOLE_CELLS, HOLE_FROM, hillshade } from './terrain-model.js';

export { INNER_NM };

/** The outer canvas covers the whole square (about 2,700 ft a pixel at 1,024 px); its tiles are asked for no finer than zoom 7 (about 36 of them over 450 NM). An estimate for speed. */
export const OUTER = Object.freeze({ px: 1024, maxZoom: 7 });
/** The inner canvas covers INNER_NM square round home, at zoom 9 (two finer than the outer; about 36 tiles), drawn at 1,536 px (about 475 ft a pixel). */
export const INNER = Object.freeze({ px: 1536, maxZoom: 9, nm: INNER_NM, ft: INNER_FT });
/** The most tiles the two tiers ask for between them: 36 + 36 and some spare. The tile layer itself refuses over 64 for one tier. */
export const MAX_GROUND_TILES = 100;
/** The inner picture's edge fades out over this many pixels, so it does not stop in a hard square. An estimate for the look. */
const INNER_FEATHER_PX = 64;
const GROUND_COLOUR = '#1b2a35'; // the plain ground when no satellite picture arrives

/**
 * three.js `T`; timers (a scheduler scope); doc (the page's document, for canvases); onChange() when a tile arrives and the ground must be painted again.
 * Returns { group, setHeight(z), setRelief({ grids, on, scale, homeFt }), paint({ projection, pictures, noTiles }) -> { failed }, dispose() }.
 */
export function createGround3d({ T, timers, doc, onChange }) {
  const group = new T.Group();
  group.name = 'ground';
  const owned = [];

  const makeCanvas = (px) => {
    const canvas = doc.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    return canvas;
  };

  /**
   * A square mesh `size` feet across with `cells` cells a side, centred on the group, flat at z = 0 until `setRelief` gives it heights. `hole` ({ from, to } in cells) leaves out the
   * triangles there (the inner patch stands in it). Its picture is `map`; its colour attribute holds the hill shading (1 is flat).
   */
  const makeMesh = ({ cells, size, hole, map, order }) => {
    const n = cells + 1;
    const half = size / 2;
    const positions = new Float32Array(n * n * 3);
    const uvs = new Float32Array(n * n * 2);
    for (let iy = 0; iy < n; iy++) {
      for (let ix = 0; ix < n; ix++) {
        const i = iy * n + ix;
        positions[i * 3] = -half + (ix / cells) * size;
        positions[i * 3 + 1] = -half + (iy / cells) * size;
        uvs[i * 2] = ix / cells;
        uvs[i * 2 + 1] = iy / cells; // row 0 is the south edge, the bottom of the picture
      }
    }
    const index = [];
    for (let iy = 0; iy < cells; iy++) {
      for (let ix = 0; ix < cells; ix++) {
        if (hole && ix >= hole.from && ix < hole.to && iy >= hole.from && iy < hole.to) continue;
        const a = iy * n + ix;
        index.push(a, a + 1, a + n + 1, a, a + n + 1, a + n); // counter-clockwise seen from above
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new T.BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new T.BufferAttribute(new Float32Array(n * n * 3).fill(1), 3));
    geometry.setIndex(new T.BufferAttribute(new Uint32Array(index), 1));
    const material = new T.MeshBasicMaterial({ map, vertexColors: true });
    const mesh = new T.Mesh(geometry, material);
    mesh.renderOrder = order;
    mesh.frustumCulled = false; // the heights move its bounds, and it is always in view
    group.add(mesh);
    owned.push(geometry, material);
    return { mesh, geometry, n };
  };

  const texture = (canvas) => {
    const t = new T.CanvasTexture(canvas);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    owned.push(t);
    return t;
  };
  const imageryFor = (spec) => {
    const imagery = createTileLayer({ source: { ...ESRI_IMAGERY, maxZoom: spec.maxZoom }, timers, onChange });
    owned.push(imagery);
    return imagery;
  };

  // The outer picture, and the inner one in two canvases: the sharp tiles (with their feathered edge, see-through there) and the final one, a copy of the outer picture with the
  // sharp tiles laid on it, which is what the inner mesh shows (it has nothing under it to fade into, so the fade is into the copy).
  const outerCanvas = makeCanvas(OUTER.px);
  const sharpCanvas = makeCanvas(INNER.px);
  const innerCanvas = makeCanvas(INNER.px);
  const outer = {
    canvas: outerCanvas, ctx: outerCanvas.getContext('2d'), texture: texture(outerCanvas), imagery: imageryFor(OUTER), px: OUTER.px,
  };
  const sharp = { canvas: sharpCanvas, ctx: sharpCanvas.getContext('2d'), imagery: imageryFor(INNER), px: INNER.px };
  const inner = { canvas: innerCanvas, ctx: innerCanvas.getContext('2d'), texture: texture(innerCanvas), px: INNER.px };
  const outerMesh = makeMesh({ cells: OUTER_CELLS, size: AREA_FT, hole: { from: HOLE_FROM, to: HOLE_FROM + HOLE_CELLS }, map: outer.texture, order: -2 });
  const innerMesh = makeMesh({ cells: INNER_CELLS, size: INNER.ft, hole: null, map: inner.texture, order: -1 });

  /** Lays the satellite tiles on a canvas, then dims them a little (as the 2D map does) so the pictures read on top. `isSharp`: only where the canvas already has pixels (the inner picture's own canvas). */
  function paintLayer(t, { projection, pictures, noTiles, extentFt, isSharp }) {
    const { ctx, px } = t;
    const k = px / extentFt;
    const half = extentFt / 2;
    const toPx = (lat, lon) => {
      const [x, y] = projection.toXY(lat, lon);
      return [(x + half) * k, (half - y) * k];
    };
    ctx.globalCompositeOperation = 'source-over';
    if (isSharp) ctx.clearRect(0, 0, px, px);
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
    // Dimmed a little under the pictures, as the 2D map does; on the sharp canvas only where tiles are, so the outer picture below is not dimmed twice.
    ctx.globalCompositeOperation = isSharp ? 'source-atop' : 'source-over';
    ctx.fillStyle = `rgba(5, 10, 18, ${BASE_DIM})`;
    ctx.fillRect(0, 0, px, px);
    for (const picture of pictures.list) {
      try {
        drawGeoImage(ctx, picture.image, picture.bbox, toPx, picture.alpha);
      } catch {
        // A picture just let go of: the next change draws the new one.
      }
    }
    if (isSharp) {
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
    return failed;
  }

  return {
    group,
    /** The ground's reference height (feet, already scaled): home's elevation. The meshes' own heights are relative to it. */
    setHeight(z) {
      group.position.z = z;
    },
    /**
     * Gives both meshes their heights and shading. `grids` is terrain3d.js's { outer, inner } (heights in feet above sea level); `on` false lays them flat; `scale` is the height
     * scale and `homeFt` the elevation the group stands at (setHeight), so a vertex at home's elevation is at 0.
     */
    setRelief({ grids, on, scale, homeFt }) {
      for (const [m, grid] of [[outerMesh, grids?.outer], [innerMesh, grids?.inner]]) {
        const pos = m.geometry.attributes.position;
        const col = m.geometry.attributes.color;
        const live = on && grid;
        const shade = live ? hillshade(grid, scale) : null;
        for (let i = 0; i < m.n * m.n; i++) {
          pos.array[i * 3 + 2] = live ? (grid.ft[i] - homeFt) * scale : 0;
          const b = shade ? shade[i] : 1;
          col.array[i * 3] = b;
          col.array[i * 3 + 1] = b;
          col.array[i * 3 + 2] = b;
        }
        pos.needsUpdate = true;
        col.needsUpdate = true;
      }
    },
    /** Paints both pictures. `projection` is the map's; `pictures` is { list: [{ image, bbox, alpha }] }; `noTiles` draws the plain ground. Returns { failed } (the outer tier got no tile at all). */
    paint({ projection, pictures, noTiles = false }) {
      const failed = paintLayer(outer, { projection, pictures, noTiles, extentFt: AREA_FT, isSharp: false });
      paintLayer(sharp, { projection, pictures, noTiles, extentFt: INNER.ft, isSharp: true });
      // The inner mesh's picture: the part of the outer picture under it, stretched up, with the sharp tiles on top.
      const k = outer.px / AREA_FT;
      const from = ((AREA_FT - INNER.ft) / 2) * k;
      const span = INNER.ft * k;
      inner.ctx.globalCompositeOperation = 'source-over';
      inner.ctx.drawImage(outer.canvas, from, from, span, span, 0, 0, inner.px, inner.px);
      inner.ctx.drawImage(sharp.canvas, 0, 0);
      outer.texture.needsUpdate = true;
      inner.texture.needsUpdate = true;
      return { failed };
    },
    dispose() {
      group.removeFromParent();
      for (const thing of owned) thing.dispose?.();
    },
  };
}
