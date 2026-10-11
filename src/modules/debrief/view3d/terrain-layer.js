// The Debrief 3D view's "Terrain and satellite" ground (DB-27), the three.js side: the shared terrain tiles and draped satellite ground (ui-kit terrain-tiles.js and
// draped-ground.js, the SOF's, SOF-64) built once for the flight's area (terrain.js terrainArea), moved to match the tracks, laid flat under the runways, and stretched by the
// altitude scale like everything else. view.js asks it each draw; it does nothing between tile arrivals. A new flight (or area) frees the old ground and builds a new one.
// Round the field a third, sharper satellite picture lies on the inner mesh's own cells (the field patch, terrain.js fieldPatch), feathered into the picture under it.
//
// When data fails: an elevation tile that doesn't come leaves its part flat at the tracks' ground; a satellite tile that doesn't come leaves the plain ground colour there. Nothing
// here ever holds up the flight, and the status line in 3D settings says what came, how long it took and how far the terrain was moved.
import { createTerrainTiles } from '../../../ui-kit/terrain-tiles.js';
import { createDrapedGround, featherEdges } from '../../../ui-kit/draped-ground.js';
import { TERRAIN_CREDIT, hillshade } from '../../../core/terrain.js';
import { ESRI_IMAGERY, createTileLayer, cornersOf } from '../../../ui-kit/map-tiles.js';
import {
  terrainArea, areaProjection, terrainShift, runwayBeds, drawnGrids, drawnHeightFt, terrainStatusWords, fieldPatch,
} from './terrain.js';

/** New tiles are read into the ground, and the satellite canvases painted again, at most this often while they arrive (milliseconds; an estimate that keeps the page quick). */
export const TERRAIN_REFRESH_MS = 400;
/** The credit lines while the terrain shows, each only once one of its tiles has come: the satellite picture's and the elevation tiles', as each asks to be credited. */
export function terrainCredits({ imagery = false, terrain = false } = {}) {
  return [imagery ? `${ESRI_IMAGERY.credit}.` : '', terrain ? `${TERRAIN_CREDIT}.` : ''].filter(Boolean).join(' ');
}

/**
 * THREE; scene; timers (the module's scheduler scope); doc; redraw() asks the view to draw again. Returns { sync(...) -> relief | null, hide(), dispose() }, where a relief is
 * { heightFt(x, y) (map feet; the drawn ground, feet above sea level), lowestFt, words, credit }.
 */
export function createTerrainLayer({ THREE, scene, timers, doc, redraw }) {
  let built = null; // { flight, area, projection, tiles, ground, drawn, shift, reliefKey, bedsKey, beds, paintDirty, startedAt, ms }
  let wake = null; // the timer that draws again once the next refresh is allowed

  const nudge = () => {
    if (wake) return;
    wake = timers.after(TERRAIN_REFRESH_MS, () => {
      wake = null;
      redraw();
    });
  };

  function free() {
    if (!built) return;
    built.tiles.dispose();
    built.ground.dispose();
    built.patch.dispose();
    built = null;
  }

  /** The field patch's mesh and picture: `spec` is terrain.js fieldPatch's; `onChange` when a tile arrives. */
  function makePatch(area, spec, onChange) {
    const n = spec.cells + 1;
    const half = spec.sizeFt / 2;
    const positions = new Float32Array(n * n * 3);
    const uvs = new Float32Array(n * n * 2);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        positions[k * 3] = -half + (i / spec.cells) * spec.sizeFt;
        positions[k * 3 + 1] = -half + (j / spec.cells) * spec.sizeFt;
        uvs[k * 2] = i / spec.cells;
        uvs[k * 2 + 1] = j / spec.cells;
      }
    }
    const index = [];
    for (let j = 0; j < spec.cells; j++) {
      for (let i = 0; i < spec.cells; i++) {
        const a = j * n + i;
        index.push(a, a + 1, a + n + 1, a, a + n + 1, a + n);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * n * 3).fill(1), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(index), 1));
    const make = () => {
      const c = doc.createElement('canvas');
      c.width = spec.imagery.px;
      c.height = spec.imagery.px;
      return c;
    };
    const canvas = make();
    const sharp = make();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    const material = new THREE.MeshBasicMaterial({ map: texture, vertexColors: true });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'debrief-field-patch';
    mesh.frustumCulled = false;
    mesh.position.set(area.centre.x + spec.centre.x, area.centre.y + spec.centre.y, 0);
    scene.add(mesh);
    const imagery = createTileLayer({ source: { ...ESRI_IMAGERY, maxZoom: spec.imagery.maxZoom }, timers, onChange });
    const px = spec.imagery.px;
    return {
      spec, mesh,
      /** The picture: the inner mesh's under it, stretched up, with the sharp tiles on top, feathered at the edge. */
      paint(projection, innerCanvas) {
        const k = px / spec.sizeFt;
        const toPx = (lat, lon) => {
          const [x, y] = projection.toXY(lat, lon);
          return [(x - spec.centre.x + half) * k, (half - (y - spec.centre.y)) * k];
        };
        const sctx = sharp.getContext('2d');
        sctx.globalCompositeOperation = 'source-over';
        sctx.clearRect(0, 0, px, px);
        const box = { minX: spec.centre.x - half, minY: spec.centre.y - half, maxX: spec.centre.x + half, maxY: spec.centre.y + half };
        imagery.draw(sctx, { corners: cornersOf(projection, box), pxPerFt: k, toScreen: toPx });
        featherEdges(sctx, px);
        const ctx = canvas.getContext('2d');
        const ki = innerCanvas.width / area.plan.inner.sizeFt;
        const sx = (box.minX + area.plan.inner.sizeFt / 2) * ki;
        const sy = (area.plan.inner.sizeFt / 2 - box.maxY) * ki;
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(innerCanvas, sx, sy, spec.sizeFt * ki, spec.sizeFt * ki, 0, 0, px, px);
        ctx.drawImage(sharp, 0, 0);
        texture.needsUpdate = true;
      },
      /** Heights and shading from the drawn inner grid (its own vertices, so the patch lies exactly on the ground) and its hill shade. */
      setRelief(inner, scale, groundFt) {
        const shade = hillshade(inner, scale);
        const pos = geometry.attributes.position;
        const col = geometry.attributes.color;
        for (let j = 0; j < n; j++) {
          for (let i = 0; i < n; i++) {
            const k = j * n + i;
            const g = (spec.j0 + j) * inner.n + spec.i0 + i;
            pos.array[k * 3 + 2] = (inner.ft[g] - groundFt) * scale;
            col.array[k * 3] = shade[g];
            col.array[k * 3 + 1] = shade[g];
            col.array[k * 3 + 2] = shade[g];
          }
        }
        pos.needsUpdate = true;
        col.needsUpdate = true;
      },
      state: () => imagery.state(),
      dispose() {
        imagery.dispose();
        mesh.removeFromParent();
        geometry.dispose();
        material.dispose();
        texture.dispose();
      },
    };
  }

  function build(flight, ground, groundFt) {
    const area = terrainArea(flight);
    if (!area) return null;
    const projection = areaProjection(flight, area);
    const next = {
      flight, area, projection, drawn: null, shift: { shiftFt: 0, tileFt: null }, reliefKey: '', bedsKey: null, beds: [], paintDirty: true,
      startedAt: globalThis.performance?.now() ?? Date.now(), ms: null, tiles: null, ground: null, patch: null,
    };
    next.tiles = createTerrainTiles({ timers, doc, plan: area.plan, onChange: nudge });
    next.ground = createDrapedGround({
      T: THREE, timers, doc, plan: area.plan, imagery: area.imagery, polygonOffset: true,
      onChange: () => {
        next.paintDirty = true;
        nudge();
      },
    });
    const first = Object.values(flight.tracks)[0]?.fixes?.[0];
    next.patch = makePatch(area, fieldPatch(area, ground, first ? { x: first.xFt, y: first.yFt } : null), () => {
      next.paintDirty = true;
      nudge();
    });
    next.ground.group.name = 'debrief-terrain';
    next.ground.group.position.set(area.centre.x, area.centre.y, 0);
    scene.add(next.ground.group);
    next.tiles.setView(projection, groundFt);
    return next;
  }

  return {
    /**
     * Brings the ground up to date for this draw: `flight`, `ground` (ground.js groundLevel, or null), `groundFt` (the tracks' ground, or the home field's elevation), `space` (the
     * airfields drawn: view.js's space(), or null), `scale` (the altitude scale: ×1 in Chase and Cockpit). Returns the relief, or null with no flight.
     */
    sync({ flight, ground, groundFt, space, scale }) {
      if (built && built.flight !== flight) free();
      if (!flight) return null;
      if (!built) built = build(flight, ground, groundFt);
      if (!built) return null;
      const b = built;
      b.ground.group.visible = true;
      b.patch.mesh.visible = true;
      if (b.paintDirty) {
        b.paintDirty = false;
        b.ground.paint({ projection: b.projection });
        b.patch.paint(b.projection, b.ground.innerCanvas);
      }
      const refreshed = b.tiles.refresh();
      const grids = b.tiles.grids;
      if (!grids) return null;
      const bedsKey = `${space?.key ?? ''}|${groundFt}`;
      if (refreshed || !b.drawn || bedsKey !== b.bedsKey) {
        b.shift = terrainShift(grids, b.area, ground);
        if (bedsKey !== b.bedsKey) {
          b.bedsKey = bedsKey;
          b.beds = space?.airfields?.length
            ? runwayBeds(space.airfields, { toXY: space.toXY, shiftFt: space.shiftFt ?? 0, fieldFt: space.fieldFt, centre: b.area.centre })
            : [];
        }
        b.drawn = drawnGrids(grids, { shiftFt: b.shift.shiftFt, flatFt: groundFt, beds: b.beds, hole: b.area.plan.hole, into: b.drawn });
        b.lowestFt = b.drawn.outer.ft.reduce((m, v) => Math.min(m, v), Infinity);
        b.reliefKey = ''; // the heights changed: lay them on the meshes again
      }
      const reliefKey = `${b.tiles.revision}|${scale}|${groundFt}`;
      if (reliefKey !== b.reliefKey) {
        b.reliefKey = reliefKey;
        b.ground.setRelief({ grids: b.drawn, on: true, scale, homeFt: groundFt });
        b.patch.setRelief(b.drawn.inner, scale, groundFt);
      }
      b.ground.setHeight(groundFt * scale);
      b.patch.mesh.position.z = groundFt * scale;
      const tiles = b.tiles.state();
      const imagery = { ...b.ground.state(), patch: b.patch.state() };
      const settled = (s) => s.ready + s.failed >= s.wanted;
      if (b.ms === null && tiles.wanted > 0 && tiles.pending === 0 && settled(imagery.outer) && settled(imagery.inner) && settled(imagery.patch)) {
        b.ms = (globalThis.performance?.now() ?? Date.now()) - b.startedAt;
      }
      if (b.tiles.isDirty() || b.paintDirty) nudge();
      const { centre } = b.area;
      return {
        heightFt: (x, y) => drawnHeightFt(b.drawn, b.area, x - centre.x, y - centre.y),
        lowestFt: b.lowestFt,
        words: terrainStatusWords({ area: b.area, tiles, imagery, shift: b.shift, groundFt, ms: b.ms, patch: b.patch.spec }),
        credit: terrainCredits({ imagery: imagery.outer.ready + imagery.inner.ready + imagery.patch.ready > 0, terrain: tiles.ready > 0 }),
      };
    },
    /** Hides the ground (another Ground choice); it is kept for when the choice comes back. */
    hide() {
      if (!built) return;
      built.ground.group.visible = false;
      built.patch.mesh.visible = false;
    },
    dispose() {
      wake?.();
      wake = null;
      free();
    },
  };
}
