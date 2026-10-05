// Checks: the 3D Moose Jaw buildings (tower, hangars, apron and more) exist by name, sit inside the apron box
//   and snap to the floor height, the airfield constants hold, and disposing frees everything once.
// Serves: TR-R23, ALL-R12.
// Expected values: typed in as "Moose Jaw ground truth", no source or page named; two tests give different
//   apron boxes and both pass; floor 1,880 ft here against field elevation 1,892 ft elsewhere.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadThree } from '../../../src/ui-kit/three-aircraft.js';
import {
  createAirfieldScenery,
  disposeAirfieldScenery,
  CYMJ_BUILDING_COORDS,
  CYMJ_ARP,
  CYMJ_RUNWAY_29L,
  CYMJ_APRON_BOUNDS,
  DEFAULT_FLOOR_FT,
} from '../../../src/modules/traffic/scenery3d.js';

const THREE = await loadThree();

test('CYMJ aerodrome context and constants match Moose Jaw ground truth', () => {
  assert.equal(DEFAULT_FLOOR_FT, 1880);
  assert.equal(CYMJ_ARP.lat, 50.3303);
  assert.equal(CYMJ_ARP.lon, -105.5592);
  assert.equal(CYMJ_RUNWAY_29L.headingDeg, 298);
  // Runway 29L is 7,280 ft on the CAP aerodrome chart (CYMJ-AD), on 298° true (TR-24); shared margins ±100 ft, ±5°.
  const { threshold: th, departure: dep } = CYMJ_RUNWAY_29L;
  assert.ok(Math.abs(Math.hypot(dep.x - th.x, dep.y - th.y) - 7280) <= 100, 'runway length');
  const bearing = (Math.atan2(dep.x - th.x, dep.y - th.y) * 180 / Math.PI + 360) % 360;
  assert.ok(Math.abs(bearing - 298) <= 5, `runway bearing ${bearing.toFixed(1)}°`);
  assert.ok(CYMJ_APRON_BOUNDS.minY > Math.max(th.y, dep.y), 'the flight line is north of the runway');
});

test('instantiates scenery group and asserts tower, 4 hangars, and apron slab exist', () => {
  const scenery = createAirfieldScenery(THREE);
  assert.ok(scenery, 'scenery group was created');
  assert.equal(scenery.name, 'airfield-scenery');

  // Apron slab
  const apron = scenery.getObjectByName('south-apron');
  assert.ok(apron, 'south apron tarmac exists');
  assert.equal(apron.userData.type, 'apron');
  assert.ok(apron.geometry, 'apron has geometry');
  assert.ok(apron.material, 'apron has material');

  // Control Tower
  const tower = scenery.getObjectByName('control-tower');
  assert.ok(tower, 'control tower exists');
  assert.equal(tower.userData.type, 'tower');
  const shaft = tower.getObjectByName('tower-shaft');
  const cab = tower.getObjectByName('tower-cab');
  const roof = tower.getObjectByName('tower-roof');
  const antenna = tower.getObjectByName('tower-antenna');
  assert.ok(shaft, 'tower shaft exists');
  assert.ok(cab, 'tower cab exists');
  assert.ok(roof, 'tower roof exists');
  assert.ok(antenna, 'tower antenna exists');
  assert.equal(cab.material.transparent, true, 'cab glass is transparent');
  assert.equal(cab.material.depthWrite, false, 'cab glass depthWrite is false');

  // 4 Arch Hangars
  const hangars = scenery.children.filter((c) => c.userData.type === 'hangar');
  assert.equal(hangars.length, 4, '4 hangars exist');

  for (let i = 1; i <= 4; i++) {
    const id = `hangar-${i}`;
    const hangar = scenery.getObjectByName(id);
    assert.ok(hangar, `${id} exists`);
    assert.ok(hangar.getObjectByName(`${id}-roof`), `${id} barrel roof exists`);
    assert.ok(hangar.getObjectByName(`${id}-back-wall`), `${id} back wall exists`);
    assert.ok(hangar.getObjectByName(`${id}-front-wall`), `${id} front wall exists`);
    assert.ok(hangar.getObjectByName(`${id}-door-track`), `${id} door track exists`);
    assert.ok(hangar.getObjectByName(`${id}-doors`), `${id} sliding doors exist`);
    assert.ok(hangar.getObjectByName(`${id}-left-wall`), `${id} left side wall exists`);
    assert.ok(hangar.getObjectByName(`${id}-right-wall`), `${id} right side wall exists`);
  }

  // Tower Base Annex
  const towerAnnex = tower.getObjectByName('tower-base-annex');
  assert.ok(towerAnnex, 'tower base annex office building exists');

  // U-shaped Student Barracks
  const barracks = scenery.getObjectByName('barracks-u');
  assert.ok(barracks, 'student barracks exists');
  assert.ok(barracks.getObjectByName('barracks-u-spine'), 'barracks spine exists');
  assert.ok(barracks.getObjectByName('barracks-u-west-wing'), 'barracks west wing exists');
  assert.ok(barracks.getObjectByName('barracks-u-east-wing'), 'barracks east wing exists');
  assert.ok(barracks.getObjectByName('barracks-u-courtyard-lawn'), 'barracks courtyard lawn exists');

  // Athletic Field (deleted per user instruction)
  assert.equal(scenery.getObjectByName('athletic-field'), undefined, 'athletic field was deleted');

  // Base Rec Centre, Hangar 5, Hangar 6
  assert.ok(scenery.getObjectByName('base-rec-center'), 'Base Rec Centre exists');
  assert.ok(scenery.getObjectByName('hangar-5'), 'Hangar 5 exists');
  assert.ok(scenery.getObjectByName('hangar-6'), 'Hangar 6 exists');

  // Glass Palace (2 CFFTS HQ)
  const glassPalace = scenery.getObjectByName('main-building');
  assert.ok(glassPalace, 'Glass Palace exists');
  assert.ok(glassPalace.getObjectByName('main-building-glass-wall'), 'glass curtain wall exists');
  assert.ok(glassPalace.getObjectByName('main-building-body'), 'body traced on the satellite outline exists');
  assert.equal(glassPalace.getObjectByName('main-building-wing-1'), undefined, 'the old finger wings are gone');

  disposeAirfieldScenery(scenery);
});

test('building coordinates fall within the apron bounds', () => {
  const { minX, maxX, minY, maxY } = CYMJ_APRON_BOUNDS;

  // Tower coordinates in CYMJ_BUILDING_COORDS
  assert.ok(
    CYMJ_BUILDING_COORDS.tower.x >= minX && CYMJ_BUILDING_COORDS.tower.x <= maxX,
    `tower X (${CYMJ_BUILDING_COORDS.tower.x}) within bounds [${minX}, ${maxX}]`
  );
  assert.ok(
    CYMJ_BUILDING_COORDS.tower.y >= minY && CYMJ_BUILDING_COORDS.tower.y <= maxY,
    `tower Y (${CYMJ_BUILDING_COORDS.tower.y}) within bounds [${minY}, ${maxY}]`
  );

  // 4 Hangars coordinates in CYMJ_BUILDING_COORDS
  assert.equal(CYMJ_BUILDING_COORDS.hangars.length, 4);
  for (const h of CYMJ_BUILDING_COORDS.hangars) {
    assert.ok(h.x >= minX && h.x <= maxX, `hangar ${h.id} X (${h.x}) within bounds [${minX}, ${maxX}]`);
    assert.ok(h.y >= minY && h.y <= maxY, `hangar ${h.id} Y (${h.y}) within bounds [${minY}, ${maxY}]`);
  }

  // Iterable check over CYMJ_BUILDING_COORDS
  const allIterated = [...CYMJ_BUILDING_COORDS];
  assert.equal(allIterated.length, 5, 'iterable yields tower and 4 hangars');

  // Verify scenery instance positions match coordinates
  const scenery = createAirfieldScenery(THREE);
  const tower = scenery.getObjectByName('control-tower');
  assert.equal(tower.position.x, CYMJ_BUILDING_COORDS.tower.x);
  assert.equal(tower.position.y, CYMJ_BUILDING_COORDS.tower.y);

  for (const h of CYMJ_BUILDING_COORDS.hangars) {
    const hangar = scenery.getObjectByName(h.id);
    assert.equal(hangar.position.x, h.x);
    assert.equal(hangar.position.y, h.y);
  }

  disposeAirfieldScenery(scenery);
});

test('vertical positioning snaps to floor (both default and custom)', () => {
  // 1. Default floor (1880 ft MSL)
  const defaultScenery = createAirfieldScenery(THREE);
  assert.equal(defaultScenery.userData.floor, DEFAULT_FLOOR_FT);

  const defaultApron = defaultScenery.getObjectByName('south-apron');
  assert.equal(defaultApron.position.z, 1880, 'default apron snaps to floor 1880');

  const defaultTower = defaultScenery.getObjectByName('control-tower');
  assert.equal(defaultTower.position.z, 1880, 'default tower snaps to floor 1880');

  for (let i = 1; i <= 4; i++) {
    const hangar = defaultScenery.getObjectByName(`hangar-${i}`);
    assert.equal(hangar.position.z, 1880, `default hangar-${i} snaps to floor 1880`);
  }
  disposeAirfieldScenery(defaultScenery);

  // 2. Custom floor (e.g. 2150 ft MSL)
  const customFloor = 2150;
  const customScenery = createAirfieldScenery(THREE, { floor: customFloor });
  assert.equal(customScenery.userData.floor, customFloor);

  const customApron = customScenery.getObjectByName('south-apron');
  assert.equal(customApron.position.z, customFloor, `custom apron snaps to floor ${customFloor}`);

  const customTower = customScenery.getObjectByName('control-tower');
  assert.equal(customTower.position.z, customFloor, `custom tower snaps to floor ${customFloor}`);

  for (let i = 1; i <= 4; i++) {
    const hangar = customScenery.getObjectByName(`hangar-${i}`);
    assert.equal(hangar.position.z, customFloor, `custom hangar-${i} snaps to floor ${customFloor}`);
  }
  disposeAirfieldScenery(customScenery);
});

test('anchor option properly attaches scenery to parent anchor or offsets position', () => {
  const parentAnchor = new THREE.Group();
  parentAnchor.name = 'test-anchor-parent';

  const scenery = createAirfieldScenery(THREE, { anchor: parentAnchor });
  assert.ok(parentAnchor.children.includes(scenery), 'scenery attached to anchor parent group');
  disposeAirfieldScenery(scenery);
  assert.equal(parentAnchor.children.length, 0, 'scenery removed from parent on dispose');

  // Offset anchor coordinates
  const offsetScenery = createAirfieldScenery(THREE, { anchor: { x: 50, y: -100 } });
  assert.equal(offsetScenery.position.x, 50);
  assert.equal(offsetScenery.position.y, -100);
  disposeAirfieldScenery(offsetScenery);
});

test('disposeAirfieldScenery wraps geometry and material dispose in spy counters and disposes everything (D411)', (t) => {
  const disposedGeoms = new Map();
  const disposedMats = new Map();

  const originalGeomDispose = THREE.BufferGeometry.prototype.dispose;
  const originalMatDispose = THREE.Material.prototype.dispose;

  THREE.BufferGeometry.prototype.dispose = function (...args) {
    disposedGeoms.set(this, (disposedGeoms.get(this) || 0) + 1);
    return originalGeomDispose.apply(this, args);
  };

  THREE.Material.prototype.dispose = function (...args) {
    disposedMats.set(this, (disposedMats.get(this) || 0) + 1);
    return originalMatDispose.apply(this, args);
  };

  t.after(() => {
    THREE.BufferGeometry.prototype.dispose = originalGeomDispose;
    THREE.Material.prototype.dispose = originalMatDispose;
  });

  const scenery = createAirfieldScenery(THREE);

  // Collect all unique geometries and materials created in the scenery tree
  const expectedGeoms = new Set();
  const expectedMats = new Set();

  scenery.traverse((obj) => {
    if (obj.geometry) {
      expectedGeoms.add(obj.geometry);
    }
    if (obj.material) {
      for (const m of [].concat(obj.material)) {
        if (m) expectedMats.add(m);
      }
    }
  });

  assert.ok(expectedGeoms.size >= 10, `expected multiple geometries, found ${expectedGeoms.size}`);
  assert.ok(expectedMats.size >= 5, `expected multiple materials, found ${expectedMats.size}`);

  // Execute disposal
  disposeAirfieldScenery(scenery);

  // Assert every single geometry was disposed
  for (const geom of expectedGeoms) {
    assert.equal(
      disposedGeoms.get(geom),
      1,
      `geometry ${geom.type || 'BufferGeometry'} must be disposed exactly once`
    );
  }

  // Assert every single material was disposed
  for (const mat of expectedMats) {
    assert.equal(
      disposedMats.get(mat),
      1,
      `material ${mat.type || 'Material'} (${mat.name || 'unnamed'}) must be disposed exactly once`
    );
  }

  // Assert group is cleared of all children
  assert.equal(scenery.children.length, 0, 'scenery group has zero children after disposal');

  // Verify calling dispose a second time is safe and idempotent
  assert.doesNotThrow(() => {
    disposeAirfieldScenery(scenery);
  }, 'disposeAirfieldScenery is safely idempotent');
});
