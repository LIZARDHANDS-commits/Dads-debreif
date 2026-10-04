# Todo: Traffic Sim 3D Graphics Upgrade (Scenery & High-Res Imagery)

## Task 1.1: Build Procedural 3D Scenery Module (`scenery3d.js`)

**Description:** Construct the core procedural 3D scenery module for 15 Wing Moose Jaw, defining Three.js meshes and materials for the CYMJ Control Tower (octagonal concrete shaft + glass observation cab + roof radar/antennae), 4 arched flight-line hangars, and the south flight-line tarmac apron slab.

**Acceptance criteria:**
- [ ] `createAirfieldScenery(THREE, { floor, anchor })` creates a parent `THREE.Group` containing the control tower, 4 hangars, and the south ramp apron slab.
- [ ] Control tower features an octagonal concrete column ($H \approx 70\text{ ft}$), flared observation cab ($H \approx 15\text{ ft}$ with semi-transparent cyan/blue glass), and flat roof with antenna mast.
- [ ] 4 hangars feature curved/arched roof geometries ($W \approx 180\text{ ft}, L \approx 200\text{ ft}, H \approx 45\text{ ft}$) with corrugated dark industrial materials and lighter concrete front/side walls.
- [ ] All coordinates are placed on the south flight line ($Y \approx -4,600$ to $-5,200\text{ ft}, X \in [-1,800, +800]\text{ ft}$) relative to Runway 29L threshold.
- [ ] `disposeAirfieldScenery(group)` traverses and explicitly disposes all child geometries and materials.

**Verification:**
- [ ] Tests pass: `node --test tests/unit/traffic/scenery3d.test.js`
- [ ] Build succeeds: `npm run typecheck`
- [ ] Manual check: Meshes inspectable with expected hierarchy and non-NaN bounding boxes.

**Dependencies:** None

**Files likely touched:**
- `src/modules/traffic/scenery3d.js`
- `tests/unit/traffic/scenery3d.test.js`

**Estimated scope:** Small (2 files)

---

## Task 1.2: Scenery Unit Tests & Zero-Leak GPU Verification

**Description:** Implement comprehensive Node unit tests for `scenery3d.js` verifying exact building count, positions, bounding box containment on the south apron, altitude floor snapping ($Z = \text{altToZ}(\text{floor})$), and strict memory disposal of all geometries and materials without memory leaks.

**Acceptance criteria:**
- [ ] Verifies exactly 1 control tower, 4 hangars, and 1 apron mesh are instantiated in the scenery group.
- [ ] Verifies all building positions fall within the expected south ramp bounds ($X \in [-2,500, +1,500]\text{ ft}, Y \in [-5,500, -4,000]\text{ ft}$).
- [ ] Verifies base elevation aligns with the supplied `floor` altitude parameter.
- [ ] Verifies `disposeAirfieldScenery(group)` disposes every geometry and material without throwing or leaking.

**Verification:**
- [ ] Tests pass: `node --test tests/unit/traffic/scenery3d.test.js`
- [ ] Memory check: Disposal test verifies `geometry.dispose()` and `material.dispose()` spy calls on all meshes.

**Dependencies:** Task 1.1

**Files likely touched:**
- `tests/unit/traffic/scenery3d.test.js`

**Estimated scope:** Small (1 file)

---

## Checkpoint: Phase 1 (Procedural Scenery Complete)
- [ ] All scenery unit tests pass: `node --test tests/unit/traffic/scenery3d.test.js`
- [ ] Scenery module is self-contained with zero external dependencies and zero file conflicts.
- [ ] Review progress with human before proceeding to Phase 2.

---

## Task 2.1: Build High-Res Core Ground Inset Module (`airfield-core-ground.js`)

**Description:** Implement the high-resolution airfield core inset mesh module. It defines a $14,000\text{ ft} \times 12,000\text{ ft}$ ground plane centered on the Runway 29L/11R complex ($X \approx 0, Y \approx -2,000\text{ ft}$) with an offscreen $2048 \times 2048$ composite canvas capable of fetching Web Mercator Zoom 17–18 Esri satellite tiles while remaining strictly within the 64-tile budget limit.

**Acceptance criteria:**
- [ ] `createCoreGroundMesh(THREE, { floor, anchor, timers, source })` returns a Three.js mesh plane sized to $14,000 \times 12,000\text{ ft}$, positioned at `floor - 1.5` (resting directly atop the base regional terrain without z-fighting).
- [ ] Offscreen canvas is configured to $2048 \times 2048$ pixels, yielding $\sim 3.4\text{ ft/px}$ (~Zoom 17/18) over the airfield core.
- [ ] Calculates tile grid covering only the core bounding box, guaranteeing tile count $\le 25$ tiles (well below `MAX_TILES_PER_DRAW = 64`).
- [ ] `disposeCoreGroundMesh(kit)` properly clears timers, drops canvas references, and disposes plane geometry and canvas texture.

**Verification:**
- [ ] Tests pass: `node --test tests/unit/traffic/airfield-core-ground.test.js`
- [ ] Tile budget check: Asserts requested tile count $\le 36$ across all standard zoom configurations.

**Dependencies:** None (independent module)

**Files likely touched:**
- `src/modules/traffic/airfield-core-ground.js`
- `tests/unit/traffic/airfield-core-ground.test.js`

**Estimated scope:** Small (2 files)

---

## Task 2.2: Implement Hybrid Offline Fallback & Texture Synthesis

**Description:** Equip `airfield-core-ground.js` with an authentic procedural base orthophoto background (detailed asphalt runway ribbons for 29L/11R, 29R/11L, 04/22, threshold zebra markings, painted numbers "29L", "11R", taxiways Alpha/Bravo, and ramp pads). When offline or prior to dynamic Esri tile arrival, the core mesh instantly displays this crisp vector-painted airfield texture; as Esri satellite tiles arrive, they blend seamlessly onto the canvas.

**Acceptance criteria:**
- [ ] `paintCoreAirfieldVector(ctx, fixedMap)` draws accurate runway centerlines, runway widths, threshold markings, and south apron tarmac directly into the offscreen $2048 \times 2048$ canvas.
- [ ] Instant offline rendering: 3D scene shows a crisp, detailed airfield layout even with network disconnected.
- [ ] Online progressive enhancement: Dynamic satellite tiles draw cleanly over the base airfield without wiping out runway alignment.

**Verification:**
- [ ] Tests pass: `node --test tests/unit/traffic/airfield-core-ground.test.js`
- [ ] Offline rendering verification: Canvas draws without network access.

**Dependencies:** Task 2.1

**Files likely touched:**
- `src/modules/traffic/airfield-core-ground.js`

**Estimated scope:** Small (1 file)

---

## Checkpoint: Phase 2 (High-Res Ground Complete)
- [ ] Ground tests pass: `node --test tests/unit/traffic/airfield-core-ground.test.js`
- [ ] Both `scenery3d.js` and `airfield-core-ground.js` are fully tested, self-contained, and ready for host wiring.

---

## Task 3.1: Wire Scenery and Core Ground into `view3d.js`

**Description:** Wire `createAirfieldScenery` and `createCoreGroundMesh` into `src/modules/traffic/view3d.js` (`createSceneKit` and `createView3d`). Add buildings to `kit.root`, attach the core high-res ground mesh to the scene, and ensure full lifecycle disposal when switching between 2D/3D and on module exit.

**Acceptance criteria:**
- [ ] Control tower and 4 arch hangars render automatically in 3D mode on the south flight line.
- [ ] Core ground mesh sits under the runways, rendering high-res runway markings and satellite imagery.
- [ ] Switching between 2D and 3D mode correctly builds and disposes scenery and core ground.
- [ ] Full module disposal (`view3d.dispose()`) frees all new meshes, geometries, textures, and timers.

**Verification:**
- [ ] Tests pass: `node --test tests/unit/traffic/view3d.test.js`
- [ ] Full suite pass: `npm test`
- [ ] Typecheck pass: `npm run typecheck`

**Dependencies:** Tasks 1.2, 2.2

**Files likely touched:**
- `src/modules/traffic/view3d.js`
- `tests/unit/traffic/view3d.test.js`

**Estimated scope:** Small (2 files)

---

## Task 3.2: Visual Verification & Leak Check Audit

**Description:** Run the automated WebGL leak check and visual verification, ensuring that the 3D scene renders cleanly at 60 FPS, all runway markings and buildings align with the flight path on final, and `__traffic3dLeakCheck` reports identical baseline counts before and after 3D view destruction.

**Acceptance criteria:**
- [ ] Three.js memory count check in `tests/unit/traffic/view3d.test.js` passes with 0 retained GPU buffers.
- [ ] Runway 29L approach flight path passes directly over the high-res threshold and aligns with the runway centerline.
- [ ] Hangars and tower sit cleanly on the south apron without floating or clipping into the terrain.

**Verification:**
- [ ] `node --test tests/unit/traffic/view3d.test.js`
- [ ] `npm run build` succeeds within size budget limits.

**Dependencies:** Task 3.1

**Files likely touched:**
- `tests/unit/traffic/view3d.test.js`

**Estimated scope:** Small (1 file)

---

## Checkpoint: Final Review & Handover
- [ ] All unit tests pass: `npm test`
- [ ] Typecheck clean: `npm run typecheck`
- [ ] Production build succeeds: `npm run build`
- [ ] Handover documentation updated in `docs/handover/traffic.md`
