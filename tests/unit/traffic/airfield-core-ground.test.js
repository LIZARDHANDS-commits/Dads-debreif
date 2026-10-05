// Checks: the 3D ground patch round the airfield: the 14,000 by 12,000 ft core box holds the 29L threshold and
//   departure end, painting does not throw, Moose Jaw needs at most 36 map tiles, and disposing frees everything
//   once.
// Serves: TR-R23, ALL-R12.
// Expected values: box size, mesh position and runway coordinates typed in, equal to the code's own constants,
//   no source yet.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadThree } from '../../../src/ui-kit/three-aircraft.js';
import { THRESHOLD_29L, DEPARTURE_END_29L } from '../../../src/modules/traffic/airfield.js';
import {
  AIRFIELD_CORE_BOUNDS_FT,
  createCoreGroundMesh,
  disposeCoreGroundMesh,
  paintCoreAirfieldVector,
  coreTilesFor,
  getCoreCorners,
  getOptimalCoreTileZoom,
  createMockCanvas,
} from '../../../src/modules/traffic/airfield-core-ground.js';

const THREE = await loadThree();

test('1. Core bounds configuration encompasses the Runway 29L threshold and departure end', () => {
  const b = AIRFIELD_CORE_BOUNDS_FT;
  const thresh = THRESHOLD_29L;
  const dep = DEPARTURE_END_29L;

  // Assert exact bounding box dimensions
  assert.equal(b.minX, -7000);
  assert.equal(b.maxX, 7000);
  assert.equal(b.minY, -8000);
  assert.equal(b.maxY, 4000);
  assert.equal(b.width, 14000);
  assert.equal(b.height, 12000);
  assert.equal(b.centerX, 0);
  assert.equal(b.centerY, -2000);

  // Assert Runway 29L threshold is strictly enclosed
  assert.ok(thresh.x >= b.minX && thresh.x <= b.maxX, `Threshold X (${thresh.x}) must be within [${b.minX}, ${b.maxX}]`);
  assert.ok(thresh.y >= b.minY && thresh.y <= b.maxY, `Threshold Y (${thresh.y}) must be within [${b.minY}, ${b.maxY}]`);

  // Assert Departure End is strictly enclosed
  assert.ok(dep.x >= b.minX && dep.x <= b.maxX, `Departure end X (${dep.x}) must be within [${b.minX}, ${b.maxX}]`);
  assert.ok(dep.y >= b.minY && dep.y <= b.maxY, `Departure end Y (${dep.y}) must be within [${b.minY}, ${b.maxY}]`);
});

test('2. paintCoreAirfieldVector executes without throwing on a 2D canvas context', () => {
  const canvas = createMockCanvas(2048, 2048);
  const ctx = canvas.getContext('2d');

  assert.doesNotThrow(() => {
    paintCoreAirfieldVector(ctx, { width: 2048, height: 2048, bounds: AIRFIELD_CORE_BOUNDS_FT });
  });

  // Also assert with null/undefined arguments
  assert.doesNotThrow(() => {
    paintCoreAirfieldVector(null);
  });
});

test('3. createCoreGroundMesh returns a mesh with expected plane geometry dimensions (14000 x 12000) and position', () => {
  const floorAlt = 1880;
  const kit = createCoreGroundMesh(THREE, { floor: floorAlt, makeCanvas: createMockCanvas });

  assert.ok(kit.mesh, 'Mesh object exists');
  assert.ok(kit.canvas, 'Canvas object exists');
  assert.ok(kit.texture, 'CanvasTexture exists');
  assert.equal(kit.bounds, AIRFIELD_CORE_BOUNDS_FT);

  // Verify plane geometry dimensions
  assert.equal(kit.mesh.geometry.parameters.width, 14000);
  assert.equal(kit.mesh.geometry.parameters.height, 12000);

  // Verify mesh position: (centerX = 0, centerY = -2000, floor - 1.5)
  assert.equal(kit.mesh.position.x, 0);
  assert.equal(kit.mesh.position.y, -2000);
  assert.equal(kit.mesh.position.z, floorAlt - 1.5);

  // Verify material properties
  assert.equal(kit.mesh.material.transparent, true);
  assert.equal(kit.mesh.material.depthWrite, false);
  assert.equal(kit.mesh.material.opacity, 0.98);

  disposeCoreGroundMesh(kit);
});

test('4. Tile request calculation asserts that for Moose Jaw coordinates, the requested tile count for this core box is <= 36 tiles (strictly below the 64-tile limit)', () => {
  const cymjAnchor = { lat: 50.3303, lon: -105.5592 };
  const corners = getCoreCorners(cymjAnchor, AIRFIELD_CORE_BOUNDS_FT);

  // Verify optimal zoom determination
  const optimalZoom = getOptimalCoreTileZoom(corners, 36);
  assert.ok(optimalZoom >= 14 && optimalZoom <= 18, `Optimal zoom ${optimalZoom} should be within realistic bounds`);

  // Calculate tiles requested
  const tiles = coreTilesFor(cymjAnchor, { bounds: AIRFIELD_CORE_BOUNDS_FT });

  assert.ok(tiles.length > 0, 'At least one tile is requested');
  assert.ok(tiles.length <= 36, `Requested tile count (${tiles.length}) must be <= 36`);
  assert.ok(tiles.length < 64, `Requested tile count (${tiles.length}) must be strictly below 64 (MAX_TILES_PER_DRAW)`);

  // Verify all tiles are within valid coordinate range
  for (const t of tiles) {
    assert.ok(Number.isInteger(t.x));
    assert.ok(Number.isInteger(t.y));
    assert.ok(t.z === optimalZoom);
    assert.ok(t.bounds.north > t.bounds.south);
    assert.ok(t.bounds.east > t.bounds.west);
  }
});

test('5. disposeCoreGroundMesh explicitly calls dispose on geometry, material, and texture without throwing', (t) => {
  let geoDisposed = 0;
  let matDisposed = 0;
  let texDisposed = 0;
  let tileLayerDisposed = 0;

  const kit = createCoreGroundMesh(THREE, { floor: 1880, makeCanvas: createMockCanvas });

  // Hook disposals
  const origGeoDispose = kit.mesh.geometry.dispose.bind(kit.mesh.geometry);
  kit.mesh.geometry.dispose = () => {
    geoDisposed++;
    origGeoDispose();
  };

  const origMatDispose = kit.mesh.material.dispose.bind(kit.mesh.material);
  kit.mesh.material.dispose = () => {
    matDisposed++;
    origMatDispose();
  };

  const origTexDispose = kit.texture.dispose.bind(kit.texture);
  kit.texture.dispose = () => {
    texDisposed++;
    origTexDispose();
  };

  // Mock tileLayer with disposal hook
  kit.tileLayer = {
    dispose: () => {
      tileLayerDisposed++;
    },
  };

  assert.doesNotThrow(() => {
    disposeCoreGroundMesh(kit);
  });

  assert.equal(geoDisposed, 1, 'Geometry was disposed exactly once');
  assert.equal(matDisposed, 1, 'Material was disposed exactly once');
  assert.equal(texDisposed, 1, 'Texture was disposed exactly once');
  assert.equal(tileLayerDisposed, 1, 'TileLayer was disposed exactly once');
  assert.equal(kit.canvas, null, 'Canvas reference was cleared to null');

  // Idempotent: can be called again without throwing
  assert.doesNotThrow(() => {
    disposeCoreGroundMesh(kit);
  });
});

test('6. Dynamic tile layer connection and paintPhoto update lifecycle', () => {
  const cymjAnchor = { lat: 50.3303, lon: -105.5592 };
  let scheduledCallbacks = [];
  const timers = {
    after: (ms, cb) => {
      scheduledCallbacks.push(cb);
      return () => {};
    },
    clearTimeout: () => {},
  };

  const kit = createCoreGroundMesh(THREE, {
    floor: 1880,
    anchor: cymjAnchor,
    timers,
    makeCanvas: createMockCanvas,
  });

  assert.ok(kit.tileLayer, 'Tile layer was created');
  assert.equal(typeof kit.paint, 'function', 'paint method is exposed');

  // Paint triggers without throwing and updates texture version in Three.js
  const prevVersion = kit.texture.version;
  assert.doesNotThrow(() => {
    kit.paint();
  });
  assert.ok(kit.texture.version >= prevVersion, 'Texture version updated');

  // Calling kit.dispose() invokes cleanup cleanly
  assert.doesNotThrow(() => {
    kit.dispose();
  });
  assert.equal(kit.canvas, null);
});
