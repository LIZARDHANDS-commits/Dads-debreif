// The ground photo inside the circuit box on High, loaded where you look (TR-122; Patrick, 10 Oct: "I want everything in this box to be
// sharpest we can do for free"; card "Yes, build it"). The box is cut into Esri World Imagery tiles: near the camera the sharpest
// Esri has at Moose Jaw (zoom 18, about 1.2 ft a pixel), coarser further off, swapped as the view moves, the way a web map does. Each
// tile is draped over the real ground heights (ground-heights3d.js, TR-115) and shaded by its slope and the river channel.
//
// - Which tiles: a tile splits into its four children while one of its pixels would cover more than SPLIT_PX screen pixels,
//   judged by the tile's size on screen (its corners projected), so ground far off and seen at a slant stays coarse.
// - Until a tile's picture arrives, its area shows the nearest coarser picture that has (cut to its corner), so nothing goes blank;
//   the coarsest level (zoom 13) is asked for first. With no picture at all, the far photo under it shows.
// - Memory: at most MAX_TEXTURES pictures kept (256 x 256 each, about 0.34 MB with mipmaps: about 200 MB; an estimate); the
//   least recently shown go first. At most MAX_IN_FLIGHT requests at once, nearest first.
// - Data failure: a tile that fails three times is left to its coarser parent. Pictures are untrusted: only drawn, never read.
import { tileBounds, lonLatToTile } from '../../core/geo.js';
import { ESRI_IMAGERY } from '../../ui-kit/map-tiles.js';
import { worldToPhoto, photoToWorld } from './map2d.js';

export const MIN_ZOOM = 13;
export const MAX_ZOOM = 18; // Esri's sharpest at Moose Jaw (zoom 19 and 20 are blank there, checked 10 Oct)
/**
 * Split while one picture pixel would cover more than this many screen pixels. 0.625 puts each zoom level twice as far out as
 * the 1.25 first built (Patrick, 10 Oct: "increase the draw distance of the sharp tiles? double it?").
 */
export const SPLIT_PX = 0.625;
export const MAX_TEXTURES = 600; // about 200 MB with mipmaps (an estimate)
const MAX_IN_FLIGHT = 16;
const MAX_LEAVES = 1500; // a guard against a view that would ask for too many tiles
const MAX_BUILDS_PER_FRAME = 40; // new tile meshes made per frame; the rest come on the next frames (the coarser layer shows meanwhile)
const RETRY_MS = [1500, 5000];
/**
 * Grid cells a side for a tile's draped ground: about 300 ft a cell or finer, never finer than the height data's 80 ft needs
 * (zoom 18 tiles are about 320 ft across: 4 cells; zoom 13: 16).
 */
const segmentsFor = (z) => (z >= 17 ? 4 : z >= 15 ? 8 : 16);
/** Towards the sun for the slope shading: TR-34's sun, from 225 degrees true and 45 degrees up (x east, y north, z up). */
const SUN_FROM = Object.freeze({ x: -0.5, y: -0.5, z: Math.SQRT1_2 });

const keyOf = (z, x, y) => `${z}/${x}/${y}`;
const latOfTileY = (yf, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * yf) / 2 ** z))) * 180) / Math.PI;
const lonOfTileX = (xf, z) => (xf / 2 ** z) * 360 - 180;

/**
 * THREE; ref: the map's local reference (the ARP); align(): the photo alignment now (map2d photoAlignment); area: { x, y, span }, the box
 * in ft; timers: the module's scheduler scope; onChange(): a picture arrived; makeImage for tests.
 * Returns { group, update({ camera, viewportPx, heights, opacity }), state(), dispose() }.
 */
export function createGroundTiles(THREE, { ref, align, area, timers, onChange = () => {}, makeImage = () => new Image() }) {
  const group = new THREE.Group();
  group.name = 'ground-tiles';
  const pictures = new Map(); // key -> { image, texture, material, ready, failed, tries, loading, lastUsed, dist }
  const meshes = new Map(); // key -> { mesh, sourceKey, heightsVersion }
  const frustum = new THREE.Frustum();
  const projScreen = new THREE.Matrix4();
  const box = new THREE.Box3();
  const camPos = new THREE.Vector3();
  const corner = new THREE.Vector3();
  /** The tile's size on screen, px: the square root of its projected area (ground at groundZ); Infinity when part is behind the camera. */
  function screenSize(b, camera, groundZ, wPx, hPx) {
    const pts = [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY]].map(([x, y]) => {
      corner.set(x, y, groundZ).applyMatrix4(camera.matrixWorldInverse);
      if (camera.isPerspectiveCamera && corner.z > -1) return null; // behind or at the eye
      corner.applyMatrix4(camera.projectionMatrix);
      return [(corner.x * wPx) / 2, (corner.y * hPx) / 2];
    });
    if (pts.some((p) => p === null)) return Infinity;
    let area = 0;
    for (let i = 0; i < 4; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % 4];
      area += x0 * y1 - x1 * y0;
    }
    return Math.sqrt(Math.abs(area) / 2);
  }
  let inFlight = 0;
  let frameNo = 0;
  let disposed = false;
  let lastHeights = null;

  // The box's tiles at the coarsest zoom.
  const half = area.span / 2;
  const a0 = align();
  const nw = worldToPhoto(ref, a0, area.x - half, area.y + half);
  const se = worldToPhoto(ref, a0, area.x + half, area.y - half);
  const tl = lonLatToTile(nw.lon, nw.lat, MIN_ZOOM);
  const br = lonLatToTile(se.lon, se.lat, MIN_ZOOM);
  const roots = [];
  for (let x = tl.x; x <= br.x; x++) for (let y = tl.y; y <= br.y; y++) roots.push({ z: MIN_ZOOM, x, y });

  /** Where a point of a tile (fractions u east, v south across it) lands on the map, ft. */
  const tilePoint = (t, u, v, al) => {
    const lat = latOfTileY(t.y + v, t.z);
    const lon = lonOfTileX(t.x + u, t.z);
    return photoToWorld(ref, al, lat, lon);
  };
  const boxes = new Map(); // tile key -> its box on the map, for the alignment in `boxesFor`
  let boxesFor = '';
  const boxOf = (t, al) => {
    const sig = `${al.trim},${al.eastFt},${al.northFt}`;
    if (sig !== boxesFor) {
      boxes.clear();
      boxesFor = sig;
    }
    const key = keyOf(t.z, t.x, t.y);
    let hit = boxes.get(key);
    if (!hit) {
      hit = boxOfNow(t, al);
      if (boxes.size > 20000) boxes.clear();
      boxes.set(key, hit);
    }
    return hit;
  };
  const boxOfNow = (t, al) => {
    const b = tileBounds(t.x, t.y, t.z);
    const p = photoToWorld(ref, al, b.north, b.west);
    const q = photoToWorld(ref, al, b.south, b.east);
    return { minX: Math.min(p.x, q.x), maxX: Math.max(p.x, q.x), minY: Math.min(p.y, q.y), maxY: Math.max(p.y, q.y) };
  };
  const inArea = (b) => b.maxX >= area.x - half && b.minX <= area.x + half && b.maxY >= area.y - half && b.minY <= area.y + half;

  function picture(t) {
    const key = keyOf(t.z, t.x, t.y);
    let p = pictures.get(key);
    if (!p) {
      p = { t, image: null, texture: null, material: null, ready: false, failed: false, tries: 0, loading: false, lastUsed: frameNo, dist: Infinity };
      pictures.set(key, p);
    }
    return p;
  }

  function load(p) {
    if (p.loading || p.ready || p.failed || disposed) return;
    p.loading = true;
    inFlight += 1;
    const image = makeImage();
    p.image = image;
    image.crossOrigin = 'anonymous'; // Esri allows it; WebGL needs it to draw the picture
    image.onload = () => {
      if (disposed || p.image !== image) return;
      inFlight -= 1;
      p.loading = false;
      p.ready = true;
      const texture = new THREE.Texture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      texture.needsUpdate = true;
      p.texture = texture;
      // Marked see-through (opaque at full opacity), so it draws in the photos' fixed order, after the coarser layers under it.
      p.material = new THREE.MeshBasicMaterial({ map: texture, vertexColors: true, fog: false, side: THREE.DoubleSide, transparent: true });
      onChange();
    };
    image.onerror = () => {
      if (disposed || p.image !== image) return;
      inFlight -= 1;
      p.loading = false;
      const wait = RETRY_MS[p.tries];
      p.tries += 1;
      if (wait === undefined) {
        p.failed = true;
        return;
      }
      timers.after(wait, () => load(p));
    };
    image.src = ESRI_IMAGERY.url(p.t.z, p.t.x, p.t.y);
  }

  /** The tile's draped ground: segmentsFor(z) cells a side, positions on the map and heights from `heights` (or flat), slope and river shading in the colours. */
  function buildGeometry(t, al, heights) {
    const seg = segmentsFor(t.z);
    const n = seg + 1;
    const pos = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    const uv = new Float32Array(n * n * 2);
    const z = new Float32Array(n * n);
    const xy = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const p = tilePoint(t, i / seg, j / seg, al);
        const k = j * n + i;
        xy.push(p);
        z[k] = heights ? heights.offsetAt(p.x, p.y) : 0;
        pos.set([p.x, p.y, z[k]], k * 3);
      }
    }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        let shade = 1;
        if (heights) {
          const kE = j * n + Math.min(n - 1, i + 1);
          const kW = j * n + Math.max(0, i - 1);
          const kN = Math.max(0, j - 1) * n + i;
          const kS = Math.min(n - 1, j + 1) * n + i;
          const dx = xy[kE].x - xy[kW].x || 1;
          const dy = xy[kN].y - xy[kS].y || 1;
          const rise = (z[kE] - z[kW]) / dx;
          const riseN = (z[kN] - z[kS]) / dy;
          const lambert = (-rise * SUN_FROM.x - riseN * SUN_FROM.y + SUN_FROM.z) / Math.hypot(rise, riseN, 1) / SUN_FROM.z;
          shade = Math.min(1.25, Math.max(0.6, lambert)) * heights.shadeAt(xy[k].x, xy[k].y);
        }
        col.set([shade, shade, shade], k * 3);
      }
    }
    const index = [];
    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < seg; i++) {
        const a = j * n + i;
        index.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(index);
    geo.computeBoundingSphere();
    return geo;
  }

  /** Points the tile's texture coordinates into the picture `src` (the tile itself or a coarser one holding it). */
  function setUv(geo, t, src) {
    const seg = segmentsFor(t.z);
    const n = seg + 1;
    const scale = 2 ** (t.z - src.z);
    const uv = geo.attributes.uv;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const u = (t.x - src.x * scale + i / seg) / scale;
        const v = (t.y - src.y * scale + j / seg) / scale;
        uv.setXY(j * n + i, u, 1 - v); // pictures load with their top row at v = 1
      }
    }
    uv.needsUpdate = true;
  }

  /** The finest picture that is ready for tile t: itself or the nearest coarser one. */
  function readySource(t) {
    for (let z = t.z; z >= MIN_ZOOM; z--) {
      const s = 2 ** (t.z - z);
      const src = { z, x: Math.floor(t.x / s), y: Math.floor(t.y / s) };
      const p = pictures.get(keyOf(src.z, src.x, src.y));
      if (p?.ready) return { src, p };
    }
    return null;
  }

  function evict() {
    const ready = [...pictures.values()].filter((p) => p.ready || p.failed);
    if (ready.length <= MAX_TEXTURES) return;
    ready.sort((a, b) => a.lastUsed - b.lastUsed);
    for (const p of ready.slice(0, ready.length - MAX_TEXTURES)) {
      if (p.lastUsed === frameNo || p.t.z === MIN_ZOOM) continue; // in use now, or a coarsest picture (always kept)
      p.texture?.dispose();
      p.material?.dispose();
      pictures.delete(keyOf(p.t.z, p.t.x, p.t.y));
    }
  }

  return {
    group,
    /**
     * Picks and draws this frame's tiles. camera: the three.js camera drawing the frame (its matrices up to date); viewportPx: the
     * drawing buffer's height in pixels; heights: ground-heights3d.js's (or null); opacity 0 to 1.
     */
    update({ camera, viewportPx, viewportWidthPx = viewportPx, heights, opacity = 1 }) {
      if (disposed) return;
      frameNo += 1;
      const al = align();
      camera.updateMatrixWorld();
      projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projScreen);
      camera.getWorldPosition(camPos);
      const groundZ = group.matrixWorld.elements[14];

      // Which tiles: split while too coarse for the screen, inside the box and the view.
      const leaves = [];
      const stack = roots.map((t) => ({ ...t }));
      while (stack.length) {
        const t = stack.pop();
        const b = boxOf(t, al);
        if (!inArea(b)) continue;
        box.min.set(b.minX, b.minY, groundZ - 400);
        box.max.set(b.maxX, b.maxY, groundZ + 400);
        if (!frustum.intersectsBox(box)) continue;
        const dist = Math.max(1, box.distanceToPoint(camPos));
        const onScreenPx = screenSize(b, camera, groundZ, viewportWidthPx, viewportPx);
        if (t.z < MAX_ZOOM && onScreenPx / 256 > SPLIT_PX && leaves.length + stack.length < MAX_LEAVES) {
          for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) stack.push({ z: t.z + 1, x: t.x * 2 + dx, y: t.y * 2 + dy });
        } else {
          leaves.push({ t, dist });
        }
      }

      // Ask for the pictures: every coarsest one, then the leaves nearest first.
      for (const t of roots) load(picture(t));
      leaves.sort((p, q) => p.dist - q.dist);
      for (const { t } of leaves) {
        if (inFlight >= MAX_IN_FLIGHT) break;
        load(picture(t));
      }

      // Draw each leaf with the finest picture that is ready.
      const heightsVersion = heights ? heights.version : -1;
      if (heights !== lastHeights) lastHeights = heights;
      const shown = new Set();
      let builds = 0;
      for (const { t } of leaves) {
        const key = keyOf(t.z, t.x, t.y);
        const found = readySource(t);
        if (!found) continue;
        found.p.lastUsed = frameNo;
        let m = meshes.get(key);
        if (!m || m.heightsVersion !== heightsVersion) {
          if (builds >= MAX_BUILDS_PER_FRAME) {
            if (m) { m.mesh.visible = true; m.lastShown = frameNo; shown.add(key); } // the old one stands in this frame
            continue;
          }
          builds += 1;
          if (m) {
            m.mesh.geometry.dispose();
            group.remove(m.mesh);
          }
          const mesh = new THREE.Mesh(buildGeometry(t, al, heights), found.p.material);
          mesh.renderOrder = -3;
          mesh.name = `ground-tile-${key}`;
          group.add(mesh);
          m = { mesh, sourceKey: null, heightsVersion };
          meshes.set(key, m);
        }
        const srcKey = keyOf(found.src.z, found.src.x, found.src.y);
        if (m.sourceKey !== srcKey || m.mesh.material !== found.p.material) { // a picture freed and loaded again is a new material
          setUv(m.mesh.geometry, t, found.src);
          m.mesh.material = found.p.material;
          m.sourceKey = srcKey;
        }
        found.p.material.opacity = opacity;
        m.mesh.visible = true;
        m.lastShown = frameNo;
        shown.add(key);
      }
      for (const [key, m] of meshes) {
        if (shown.has(key)) continue;
        m.mesh.visible = false;
        if (frameNo - (m.lastShown ?? 0) > 120) { // gone for a while: free it
          m.mesh.geometry.dispose();
          group.remove(m.mesh);
          meshes.delete(key);
        }
      }
      evict();
      if (builds >= MAX_BUILDS_PER_FRAME) timers.after(0, onChange); // more to build: another frame soon
    },
    state() {
      const all = [...pictures.values()];
      return { pictures: all.length, ready: all.filter((p) => p.ready).length, failed: all.filter((p) => p.failed).length, loading: inFlight, meshes: meshes.size, shown: [...meshes.values()].filter((m) => m.mesh.visible).length, maxZoomShown: Math.max(0, ...[...meshes.entries()].filter(([, m]) => m.mesh.visible).map(([k]) => Number(k.split('/')[0]))) };
    },
    dispose() {
      disposed = true;
      for (const m of meshes.values()) m.mesh.geometry.dispose();
      meshes.clear();
      for (const p of pictures.values()) {
        if (p.image) { p.image.onload = null; p.image.onerror = null; }
        p.texture?.dispose();
        p.material?.dispose();
      }
      pictures.clear();
      group.clear();
      group.removeFromParent?.();
    },
  };
}
