// High-resolution procedural vector and satellite ground plane for Moose Jaw (CYMJ)
// aerodrome core complex (Runways 29L/11R, 29R/11L, 04/22, taxiways and south apron).
//
// Adheres to D411: Strict memory disposal of geometries, materials, textures, and canvas.
// Coordinates: Local feet relative to CYMJ anchor (X east, Y north, Z up).

import { createTileLayer, ESRI_IMAGERY, tilesFor } from '../../ui-kit/map-tiles.js';
import { makeLocalRef, latLonToLocalFt, localFtToLatLon, lonLatToTile } from '../../core/geo.js';

/**
 * Authoritative Moose Jaw aerodrome core bounding box in local feet.
 * Encompasses Runway 29L threshold (3104, -3194), departure end (-4066, 680),
 * parallel runway 29R/11L, cross runway 04/22, and the south flight line / apron.
 */
export const AIRFIELD_CORE_BOUNDS_FT = Object.freeze({
  minX: -7000,
  maxX: 7000,
  minY: -8000,
  maxY: 4000,
  width: 14000,
  height: 12000,
  centerX: 0,
  centerY: -2000,
});

/**
 * Calculates geographic lat/lon bounding box for the core box.
 * @param {{ lat: number, lon: number }} anchor
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} [bounds]
 */
export function getCoreCorners(anchor, bounds = AIRFIELD_CORE_BOUNDS_FT) {
  const ref = makeLocalRef(anchor.lat, anchor.lon);
  const sw = localFtToLatLon(ref, bounds.minX, bounds.minY);
  const ne = localFtToLatLon(ref, bounds.maxX, bounds.maxY);
  return {
    north: Math.max(sw.lat, ne.lat),
    south: Math.min(sw.lat, ne.lat),
    west: Math.min(sw.lon, ne.lon),
    east: Math.max(sw.lon, ne.lon),
  };
}

/**
 * Determines optimal tile zoom level such that requested tile count <= maxTiles.
 * Prevents exceeding MAX_TILES_PER_DRAW (64).
 * @param {{ north: number, south: number, west: number, east: number }} corners
 * @param {number} [maxTiles=36]
 */
export function getOptimalCoreTileZoom(corners, maxTiles = 36) {
  let z = 18;
  while (z >= 10) {
    const a = lonLatToTile(corners.west, corners.north, z);
    const b = lonLatToTile(corners.east, corners.south, z);
    const count = (Math.abs(b.x - a.x) + 1) * (Math.abs(b.y - a.y) + 1);
    if (count <= maxTiles) return z;
    z--;
  }
  return 14;
}

/**
 * Computes the list of Web Mercator tiles covering the airfield core box.
 * Guarantees tile count <= maxTiles (default 36) and strictly below the 64-tile limit.
 * @param {{ lat: number, lon: number }} anchor
 * @param {{ bounds?: typeof AIRFIELD_CORE_BOUNDS_FT, source?: any, maxTiles?: number }} [options]
 */
export function coreTilesFor(anchor, { bounds = AIRFIELD_CORE_BOUNDS_FT, source = ESRI_IMAGERY, maxTiles = 36 } = {}) {
  const corners = getCoreCorners(anchor, bounds);
  const optimalZoom = getOptimalCoreTileZoom(corners, maxTiles);
  const effectiveMaxZoom = Math.min(source?.maxZoom ?? optimalZoom, optimalZoom);
  const pxPerFt = 2048 / bounds.width;
  return tilesFor(corners, pxPerFt, effectiveMaxZoom);
}

/**
 * Creates a fallback mock 2D rendering context for headless Node environments.
 */
export function createMockContext() {
  const state = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '10px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
  };
  return new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'measureText') return (text) => ({ width: String(text).length * 8 });
      return () => {};
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
}

/**
 * Creates a mock canvas for Node test environments where DOM is not available.
 */
export function createMockCanvas(width = 2048, height = 2048) {
  const ctx = createMockContext();
  return {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    getContext: (type) => (type === '2d' ? ctx : null),
    addEventListener() {},
    removeEventListener() {},
  };
}

/**
 * High-fidelity offline procedural vector painter for the 2048x2048 core canvas.
 * Renders infield grass, south apron tarmac, taxiway network (Alpha, Bravo, connectors),
 * Runway 29L/11R (8,150 ft), parallel Runway 29R/11L (+1,000 ft north offset), and
 * cross Runway 04/22.
 *
 * Safe to execute in both browser CanvasRenderingContext2D and mock/Node environments without throwing.
 *
 * @param {CanvasRenderingContext2D | any} ctx
 * @param {{ width?: number, height?: number, bounds?: { minX: number, maxX: number, minY: number, maxY: number, width: number, height: number }, overlayOnly?: boolean }} [options]
 */
export function paintCoreAirfieldVector(ctx, { width = 2048, height = 2048, bounds = AIRFIELD_CORE_BOUNDS_FT, overlayOnly = false } = {}) {
  if (!ctx) return;

  const toPxX = (x) => ((x - bounds.minX) / bounds.width) * width;
  const toPxY = (y) => ((bounds.maxY - y) / bounds.height) * height;

  if (!overlayOnly) {
    // 1. Infield grass background
    ctx.fillStyle = '#273e31';
    ctx.fillRect?.(0, 0, width, height);

    // Cleared aerodrome infield mowing boundary
    ctx.fillStyle = '#2d4839';
    ctx.beginPath?.();
    const infieldPts = [
      [-5600, 1600], [-3800, 2600], [1200, 2200], [4800, -1800],
      [4600, -4200], [2800, -6400], [-3200, -6400], [-5200, -3200],
    ];
    ctx.moveTo?.(toPxX(infieldPts[0][0]), toPxY(infieldPts[0][1]));
    for (let i = 1; i < infieldPts.length; i++) {
      ctx.lineTo?.(toPxX(infieldPts[i][0]), toPxY(infieldPts[i][1]));
    }
    ctx.closePath?.();
    ctx.fill?.();

    // 2. Flight line apron tarmac slab
    const apronCorners = [
      [-2800, -4200], [2400, -4200], [2400, -5800], [-2800, -5800],
    ];
    ctx.fillStyle = '#22262a';
    ctx.beginPath?.();
    ctx.moveTo?.(toPxX(apronCorners[0][0]), toPxY(apronCorners[0][1]));
    for (let i = 1; i < apronCorners.length; i++) {
      ctx.lineTo?.(toPxX(apronCorners[i][0]), toPxY(apronCorners[i][1]));
    }
    ctx.closePath?.();
    ctx.fill?.();

    // Apron edge shoulder
    ctx.strokeStyle = '#2d3339';
    ctx.lineWidth = 4;
    ctx.stroke?.();
  }

  // Ramp parking markings / tie-down taxilines
  ctx.strokeStyle = '#616c77';
  ctx.lineWidth = 2;
  ctx.beginPath?.();
  for (let rx = -2400; rx <= 2000; rx += 400) {
    ctx.moveTo?.(toPxX(rx), toPxY(-4500));
    ctx.lineTo?.(toPxX(rx), toPxY(-5500));
  }
  ctx.stroke?.();

  // 3. Taxiways: Alpha, Bravo, connecting links
  ctx.fillStyle = '#2c3237';
  ctx.strokeStyle = '#2c3237';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Runway 29L direction vectors for taxiway geometry
  // P29L_thresh = (3104, -3194), P11R_thresh = (-4066, 680)
  const dx29L = -4066 - 3104; // -7170
  const dy29L = 680 - (-3194); // 3874
  const len29L = Math.hypot(dx29L, dy29L); // ~8149.65
  const uX = dx29L / len29L; // ~ -0.8798
  const uY = dy29L / len29L; // ~ 0.4754
  // Normal vector pointing North-East (+Y/+X):
  const nX = -uY; // ~ -0.4754 (or pointing North-East: uY, -uX -> 0.4754, 0.8798)
  const normX = uY;
  const normY = -uX; // norm is perpendicular to runway: normX*uX + normY*uY = 0

  const taxiScale = width / bounds.width;
  const taxiWidthPx = Math.max(4, 75 * taxiScale); // 75 ft taxiway width

  ctx.lineWidth = taxiWidthPx;

  const aStartX = 3104 - 450 * normX;
  const aStartY = -3194 - 450 * normY;
  const aEndX = -4066 - 450 * normX;
  const aEndY = 680 - 450 * normY;

  const bStartX = 3300 + 500 * normX;
  const bStartY = -3000 + 500 * normY;
  const bEndX = -3800 + 500 * normX;
  const bEndY = 900 + 500 * normY;

  if (!overlayOnly) {
    // Taxiway Alpha: south parallel taxiway (offset ~450 ft south of Runway 29L)
    ctx.beginPath?.();
    ctx.moveTo?.(toPxX(aStartX), toPxY(aStartY));
    ctx.lineTo?.(toPxX(aEndX), toPxY(aEndY));
    ctx.stroke?.();

    // Taxiway Bravo: parallel taxiway between 29L and 29R (offset ~500 ft north of 29L)
    ctx.beginPath?.();
    ctx.moveTo?.(toPxX(bStartX), toPxY(bStartY));
    ctx.lineTo?.(toPxX(bEndX), toPxY(bEndY));
    ctx.stroke?.();

    // Taxiway connecting links from South Apron to Taxiway Alpha and Runway 29L
    const connectors = [
      // Link 1: South apron to 29L Threshold run-up bay
      [[2200, -4200], [3104, -3194]],
      // Link 2: Mid-apron connector
      [[400, -4200], [400 - 450 * normX, -4200 + (len29L * 0.4) * uY]],
      // Link 3: West apron to 11R Threshold
      [[-2000, -4200], [-4066 - 450 * normX, 680 - 450 * normY], [-4066, 680]],
      // Link 4: High-speed turnoffs / links between 29L and Bravo / 29R
      [[0, -1257], [0 + 1000 * normX, -1257 + 1000 * normY]],
      [[-1800, -288], [-1800 + 1000 * normX, -288 + 1000 * normY]],
      [[1600, -2226], [1600 + 1000 * normX, -2226 + 1000 * normY]],
    ];

    for (const pts of connectors) {
      ctx.beginPath?.();
      ctx.moveTo?.(toPxX(pts[0][0]), toPxY(pts[0][1]));
      for (let k = 1; k < pts.length; k++) {
        ctx.lineTo?.(toPxX(pts[k][0]), toPxY(pts[k][1]));
      }
      ctx.stroke?.();
    }
  }

  // Taxiway yellow centerlines
  ctx.strokeStyle = '#d4a73b';
  ctx.lineWidth = Math.max(1, 4 * taxiScale);
  ctx.beginPath?.();
  ctx.moveTo?.(toPxX(aStartX), toPxY(aStartY));
  ctx.lineTo?.(toPxX(aEndX), toPxY(aEndY));
  ctx.moveTo?.(toPxX(bStartX), toPxY(bStartY));
  ctx.lineTo?.(toPxX(bEndX), toPxY(bEndY));
  ctx.stroke?.();

  // 4. Runway Rendering Helper
  function renderRunway({ p1, p2, widthFt = 150, num1, num2 }) {
    const rdx = p2.x - p1.x;
    const rdy = p2.y - p1.y;
    const rlen = Math.hypot(rdx, rdy);
    const ruX = rdx / rlen;
    const ruY = rdy / rlen;
    const rnX = ruY;
    const rnY = -ruX; // perpendicular unit vector

    const halfW = widthFt / 2;

    // Asphalt runway slab
    const c1 = [p1.x - halfW * rnX, p1.y - halfW * rnY];
    const c2 = [p1.x + halfW * rnX, p1.y + halfW * rnY];
    const c3 = [p2.x + halfW * rnX, p2.y + halfW * rnY];
    const c4 = [p2.x - halfW * rnX, p2.y - halfW * rnY];

    if (!overlayOnly) {
      // Runway shoulders
      const shoulderExtra = 25;
      ctx.fillStyle = '#262b30';
      ctx.beginPath?.();
      ctx.moveTo?.(toPxX(p1.x - (halfW + shoulderExtra) * rnX), toPxY(p1.y - (halfW + shoulderExtra) * rnY));
      ctx.lineTo?.(toPxX(p1.x + (halfW + shoulderExtra) * rnX), toPxY(p1.y + (halfW + shoulderExtra) * rnY));
      ctx.lineTo?.(toPxX(p2.x + (halfW + shoulderExtra) * rnX), toPxY(p2.y + (halfW + shoulderExtra) * rnY));
      ctx.lineTo?.(toPxX(p2.x - (halfW + shoulderExtra) * rnX), toPxY(p2.y - (halfW + shoulderExtra) * rnY));
      ctx.closePath?.();
      ctx.fill?.();

      // Main dark asphalt runway surface
      ctx.fillStyle = '#1e2226';
      ctx.beginPath?.();
      ctx.moveTo?.(toPxX(c1[0]), toPxY(c1[1]));
      ctx.lineTo?.(toPxX(c2[0]), toPxY(c2[1]));
      ctx.lineTo?.(toPxX(c3[0]), toPxY(c3[1]));
      ctx.lineTo?.(toPxX(c4[0]), toPxY(c4[1]));
      ctx.closePath?.();
      ctx.fill?.();
    }

    // Threshold bars and white "piano keys" stripes
    const drawThresholdPianoKeys = (tPoint, uVec, nVec) => {
      // Threshold transverse bar (10 ft thick)
      ctx.fillStyle = '#f0f6fc';
      ctx.beginPath?.();
      const b1 = [tPoint.x - (halfW - 5) * nVec.x, tPoint.y - (halfW - 5) * nVec.y];
      const b2 = [tPoint.x + (halfW - 5) * nVec.x, tPoint.y + (halfW - 5) * nVec.y];
      const b3 = [b2[0] + 12 * uVec.x, b2[1] + 12 * uVec.y];
      const b4 = [b1[0] + 12 * uVec.x, b1[1] + 12 * uVec.y];
      ctx.moveTo?.(toPxX(b1[0]), toPxY(b1[1]));
      ctx.lineTo?.(toPxX(b2[0]), toPxY(b2[1]));
      ctx.lineTo?.(toPxX(b3[0]), toPxY(b3[1]));
      ctx.lineTo?.(toPxX(b4[0]), toPxY(b4[1]));
      ctx.closePath?.();
      ctx.fill?.();

      // 8 longitudinal piano key stripes (each 100 ft long, 6 ft wide)
      const numKeys = 8;
      const stripeSpan = (widthFt - 40) / numKeys;
      const stripeLen = 100;
      for (let k = 0; k < numKeys; k++) {
        const offsetN = -(halfW - 20) + k * stripeSpan + stripeSpan * 0.5;
        const kStart = [tPoint.x + 25 * uVec.x + offsetN * nVec.x, tPoint.y + 25 * uVec.y + offsetN * nVec.y];
        const kEnd = [kStart[0] + stripeLen * uVec.x, kStart[1] + stripeLen * uVec.y];
        ctx.strokeStyle = '#f0f6fc';
        ctx.lineWidth = Math.max(1.5, 6 * taxiScale);
        ctx.beginPath?.();
        ctx.moveTo?.(toPxX(kStart[0]), toPxY(kStart[1]));
        ctx.lineTo?.(toPxX(kEnd[0]), toPxY(kEnd[1]));
        ctx.stroke?.();
      }
    };

    drawThresholdPianoKeys(p1, { x: ruX, y: ruY }, { x: rnX, y: rnY });
    drawThresholdPianoKeys(p2, { x: -ruX, y: -ruY }, { x: rnX, y: rnY });

    // Aiming point markers (1,000 ft from threshold, two broad blocks)
    const drawAimingPoints = (tPoint, uVec, nVec) => {
      ctx.fillStyle = '#f0f6fc';
      for (const side of [-1, 1]) {
        const ax = tPoint.x + 1000 * uVec.x + side * 35 * nVec.x;
        const ay = tPoint.y + 1000 * uVec.y + side * 35 * nVec.y;
        const ab1 = [ax - 12 * nVec.x, ay - 12 * nVec.y];
        const ab2 = [ax + 12 * nVec.x, ay + 12 * nVec.y];
        const ab3 = [ab2[0] + 140 * uVec.x, ab2[1] + 140 * uVec.y];
        const ab4 = [ab1[0] + 140 * uVec.x, ab1[1] + 140 * uVec.y];
        ctx.beginPath?.();
        ctx.moveTo?.(toPxX(ab1[0]), toPxY(ab1[1]));
        ctx.lineTo?.(toPxX(ab2[0]), toPxY(ab2[1]));
        ctx.lineTo?.(toPxX(ab3[0]), toPxY(ab3[1]));
        ctx.lineTo?.(toPxX(ab4[0]), toPxY(ab4[1]));
        ctx.closePath?.();
        ctx.fill?.();
      }
    };

    drawAimingPoints(p1, { x: ruX, y: ruY }, { x: rnX, y: rnY });
    drawAimingPoints(p2, { x: -ruX, y: -ruY }, { x: rnX, y: rnY });

    // Dashed Centerline: 100 ft dashes, 50 ft gaps
    ctx.strokeStyle = '#f0f6fc';
    ctx.lineWidth = Math.max(1.5, 5 * taxiScale);
    ctx.beginPath?.();
    for (let s = 250; s <= rlen - 350; s += 150) {
      const sx1 = p1.x + s * ruX;
      const sy1 = p1.y + s * ruY;
      const sx2 = p1.x + Math.min(s + 100, rlen - 250) * ruX;
      const sy2 = p1.y + Math.min(s + 100, rlen - 250) * ruY;
      ctx.moveTo?.(toPxX(sx1), toPxY(sy1));
      ctx.lineTo?.(toPxX(sx2), toPxY(sy2));
    }
    ctx.stroke?.();

    // Runway Designation Numbers
    const drawRunwayNumber = (tPoint, uVec, label) => {
      if (!label) return;
      const numX = toPxX(tPoint.x + 360 * uVec.x);
      const numY = toPxY(tPoint.y + 360 * uVec.y);
      const targetX = toPxX(tPoint.x + 370 * uVec.x);
      const targetY = toPxY(tPoint.y + 370 * uVec.y);
      const rot = Math.atan2(targetY - numY, targetX - numX) + Math.PI / 2;

      ctx.save?.();
      ctx.translate?.(numX, numY);
      ctx.rotate?.(rot);
      ctx.fillStyle = '#f0f6fc';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText?.(label, 0, 0);
      ctx.restore?.();
    };

    drawRunwayNumber(p1, { x: ruX, y: ruY }, num1);
    drawRunwayNumber(p2, { x: -ruX, y: -ruY }, num2);
  }

  // Runway 29L / 11R: Length ~8,150 ft, width 150 ft, centerline connecting (3104, -3194) to (-4066, 680)
  renderRunway({
    p1: { x: 3104, y: -3194 },
    p2: { x: -4066, y: 680 },
    widthFt: 150,
    num1: '29L',
    num2: '11R',
  });

  // Runway 29R / 11L: Parallel runway offset ~1,000 ft north
  const r29ROffsetX = 1000 * normX;
  const r29ROffsetY = 1000 * normY;
  renderRunway({
    p1: { x: 3104 + r29ROffsetX, y: -3194 + r29ROffsetY },
    p2: { x: -4066 + r29ROffsetX, y: 680 + r29ROffsetY },
    widthFt: 150,
    num1: '29R',
    num2: '11L',
  });

  // Runway 04 / 22: Cross runway (~5,600 ft long, width 150 ft)
  renderRunway({
    p1: { x: -2524, y: -3406 },
    p2: { x: 924, y: 1006 },
    widthFt: 150,
    num1: '04',
    num2: '22',
  });
}

/**
 * Creates the high-resolution 3D core ground mesh and connects it to dynamic Esri map tiles.
 *
 * @param {any} THREE The Three.js namespace
 * @param {{
 *   floor?: number,
 *   anchor?: { lat: number, lon: number },
 *   timers?: { after: Function, clearTimeout?: Function },
 *   source?: any,
 *   makeCanvas?: (width: number, height: number) => any,
 *   makeImage?: () => any
 * }} [options]
 * @returns {{
 *   mesh: any,
 *   canvas: any,
 *   texture: any,
 *   tileLayer: any,
 *   bounds: typeof AIRFIELD_CORE_BOUNDS_FT,
 *   paint: () => void,
 *   dispose: () => void
 * }}
 */
export function createCoreGroundMesh(THREE, { floor = 1880, anchor, timers, source = ESRI_IMAGERY, makeCanvas, makeImage } = {}) {
  const width = 2048;
  const height = 2048;

  let canvas = null;
  if (typeof makeCanvas === 'function') {
    canvas = makeCanvas(width, height);
  } else if (typeof document !== 'undefined' && document?.createElement) {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
  } else {
    canvas = createMockCanvas(width, height);
  }

  const ctx = canvas.getContext?.('2d');
  if (ctx) {
    paintCoreAirfieldVector(ctx, { width, height, bounds: AIRFIELD_CORE_BOUNDS_FT });
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const geometry = new THREE.PlaneGeometry(AIRFIELD_CORE_BOUNDS_FT.width, AIRFIELD_CORE_BOUNDS_FT.height);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  // Slight Z offset (floor - 1.5) so it sits cleanly atop the regional base plane without z-fighting
  mesh.position.set(AIRFIELD_CORE_BOUNDS_FT.centerX, AIRFIELD_CORE_BOUNDS_FT.centerY, floor - 1.5);

  let tileLayer = null;
  let disposed = false;

  const corners = anchor ? getCoreCorners(anchor, AIRFIELD_CORE_BOUNDS_FT) : null;
  const optimalZoom = corners ? getOptimalCoreTileZoom(corners, 36) : 15;
  const effectiveSource = { ...source, maxZoom: Math.min(source?.maxZoom ?? optimalZoom, optimalZoom) };

  function paintPhoto() {
    if (disposed) return;
    const c = canvas?.getContext?.('2d');
    if (!c) return;

    paintCoreAirfieldVector(c, { width: canvas.width, height: canvas.height, bounds: AIRFIELD_CORE_BOUNDS_FT });

    if (tileLayer && anchor) {
      const ref = makeLocalRef(anchor.lat, anchor.lon);
      const pxPerFt = canvas.width / AIRFIELD_CORE_BOUNDS_FT.width;
      tileLayer.draw(c, {
        corners,
        pxPerFt,
        toScreen: (lat, lon) => {
          const local = latLonToLocalFt(ref, lat, lon);
          const x = ((local.x - AIRFIELD_CORE_BOUNDS_FT.minX) / AIRFIELD_CORE_BOUNDS_FT.width) * canvas.width;
          const y = ((AIRFIELD_CORE_BOUNDS_FT.maxY - local.y) / AIRFIELD_CORE_BOUNDS_FT.height) * canvas.height;
          return [x, y];
        },
      });
    }

    if (texture) {
      texture.needsUpdate = true;
    }
  }

  if (anchor && timers) {
    const imgFactory = makeImage ?? (typeof Image !== 'undefined' ? () => new Image() : () => ({ src: '', onload: null, onerror: null }));
    tileLayer = createTileLayer({
      source: effectiveSource,
      timers,
      makeImage: imgFactory,
      onChange: () => {
        paintPhoto();
      },
    });
    paintPhoto();
  }

  const kit = {
    mesh,
    canvas,
    texture,
    tileLayer,
    bounds: AIRFIELD_CORE_BOUNDS_FT,
    paint: paintPhoto,
    dispose: () => {
      disposed = true;
      disposeCoreGroundMesh(kit);
    },
  };

  return kit;
}

/**
 * Strict memory cleanup of all Three.js core ground mesh resources under D411.
 * Disposes geometries, materials, canvas textures, and tile layers.
 *
 * @param {{
 *   mesh?: any,
 *   texture?: any,
 *   tileLayer?: any,
 *   canvas?: any
 * }} kit
 */
export function disposeCoreGroundMesh(kit) {
  if (!kit) return;

  if (kit.mesh) {
    kit.mesh.removeFromParent?.();
    kit.mesh.geometry?.dispose?.();
    if (kit.mesh.material) {
      if (Array.isArray(kit.mesh.material)) {
        for (const m of kit.mesh.material) m?.dispose?.();
      } else {
        kit.mesh.material.dispose?.();
      }
    }
  }

  kit.texture?.dispose?.();
  kit.tileLayer?.dispose?.();

  kit.canvas = null;
}
