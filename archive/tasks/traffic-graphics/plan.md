# Implementation Plan: Traffic Sim 3D Graphics Upgrade (Scenery & High-Res Imagery)

## Overview
This workstream upgrades the visual fidelity of the 3D Traffic Sim mode at 15 Wing Moose Jaw (CYMJ) without impacting flight physics or running sessions. It delivers two major enhancements:
1. **Procedural 3D Control Tower and Hangars:** Authentic low-poly Moose Jaw airfield buildings (the central control tower and 4 arch-roof flight-line hangars) placed on the south apron with full Three.js memory disposal.
2. **Hybrid High-Resolution Airfield Ground Imagery:** A dual-mesh ground system combining a bundled high-resolution static orthophoto for instantaneous offline loading with a dynamic Esri satellite core inset mesh (fetching sharp Zoom 17–18 tiles for runway numbers and threshold stripes without exceeding the 64-tile limit).

To prevent collisions with the concurrent physics session (which is modifying `traffic/index.js`, `traffic/layout.js`, and `moose-jaw.json`), all core graphics components are constructed as isolated standalone modules (`src/modules/traffic/scenery3d.js` and `src/modules/traffic/airfield-core-ground.js`) and verified via dedicated unit tests before minimal wiring into `view3d.js`.

---

## Architecture Decisions

### 1. Scenery Implementation Strategy
- **Two-Stage Architecture:** Procedural Three.js primitives first (`BoxGeometry`, `CylinderGeometry`, `ExtrudeGeometry`) styled with authentic military matte concrete (`#a0aab2`), corrugated hangar roofing (`#343b43`), and tinted glass cab (`#6ba8d1`, 60% opacity).
- **Zero External Assets in Stage 1:** 100% offline, zero network requests, zero bundle weight, instant load time.
- **Future GLTF Extensibility:** Scenery interface is designed so individual procedural buildings can be swapped with low-poly `.glb` models later without altering scene placement logic.

### 2. High-Resolution Ground Architecture (Dual-Mesh)
- **Regional Base Mesh (80,000 ft):** Retained at 1024/2048 canvas scale for broad situational awareness (traffic on downwind, entries, and the break).
- **Airfield Core Inset Mesh (14,000 ft × 12,000 ft):** Positioned over the runway complex ($X \approx 0, Y \approx -2,000\text{ ft}$). At $2048 \times 2048$, this achieves $\sim 3\text{ ft/px}$ (Web Mercator Zoom 17/18), clearly showing runway painted numbers, threshold zebra stripes, and taxiway centerlines.
- **Tile Budget Safety Guard:** The core bounding box requests only a $4 \times 4$ or $5 \times 5$ grid of tiles (16–25 tiles), remaining well below `map-tiles.js`'s safety cutoff of `MAX_TILES_PER_DRAW = 64`.
- **Hybrid Sourcing:** Bundles a static orthophoto fallback (`public/assets/airfields/moose-jaw-core.webp` or procedural tarmac vector canvas fallback) for instant offline rendering, with dynamic Esri tile fetching when online.

### 3. Coordinate Calibration & Ground Truth
- **CYMJ Origin (0,0):** Moose Jaw ARP at `50.3303° N, 105.5592° W`.
- **Runway 29L Threshold:** $(X = 3,104\text{ ft}, Y = -3,194\text{ ft})$, Departure End at $(-4,066\text{ ft}, 680\text{ ft})$ on heading $298^\circ$ true.
- **Field Elevation:** $1,880$ to $1,892\text{ ft MSL}$ ($Z = \text{altToZ}(\text{elevation})$).
- **South Apron & Flight Line Placement:**
  - Perpendicular offset $208^\circ$ (south-southwest) by $\sim 1,800$ to $2,200\text{ ft}$ from Runway 29L centerline.
  - Spans $X \in [-1,800, +800]\text{ ft}, Y \in [-4,600, -5,200]\text{ ft}$.
  - Ground Truth Visual Check: Footprints align directly with satellite imagery rooftop shadows.

### 4. Lifecycle & Memory Safety (D411 Invariant)
- Every geometry, material, canvas, and texture must be explicitly tracked and disposed via `disposeScenery()` and `disposeAirfieldGround()`, passing automated leak-checking in `tests/unit/traffic/view3d.test.js`.

---

## Exact Identifiers and File Locations

To avoid ambiguities and coordination drift (per Observation 0015):
- Scenery Module: `src/modules/traffic/scenery3d.js`
  - Export: `createAirfieldScenery(THREE, { floor, anchor })`
  - Export: `disposeAirfieldScenery(group)`
  - Export: `CYMJ_BUILDING_COORDS`
- High-Res Ground Module: `src/modules/traffic/airfield-core-ground.js`
  - Export: `createCoreGroundMesh(THREE, { floor, anchor, timers })`
  - Export: `disposeCoreGroundMesh(coreMeshKit)`
  - Export: `AIRFIELD_CORE_BOUNDS_FT`
- Unit Tests:
  - `tests/unit/traffic/scenery3d.test.js`
  - `tests/unit/traffic/airfield-core-ground.test.js`
- Host 3D View: `src/modules/traffic/view3d.js` (hooked via 5-line integration)

---

## Task Breakdown Summary

### Phase 1: Procedural 3D Scenery (Control Tower & Hangars)
- **Task 1.1:** Build `src/modules/traffic/scenery3d.js` with geometry and material definitions for CYMJ Control Tower, 4 Arch Hangars, and the South Apron slab.
- **Task 1.2:** Add coordinate placement math relative to Runway 29L and implement clean Three.js disposal.
- **Task 1.3:** Create unit tests in `tests/unit/traffic/scenery3d.test.js` verifying mesh counts, positioning, bounding boxes, and zero-leak resource cleanup.

### Phase 2: High-Resolution Airfield Core Imagery
- **Task 2.1:** Build `src/modules/traffic/airfield-core-ground.js` with the dual-mesh core inset plane ($14,000 \times 12,000\text{ ft}$) and high-zoom tile request logic.
- **Task 2.2:** Implement hybrid fallback: static bundled/vector ortho canvas fallback for offline/instant load, seamlessly blending with dynamic Esri tiles.
- **Task 2.3:** Create unit tests in `tests/unit/traffic/airfield-core-ground.test.js` testing tile grid calculation, bounds clamping, and texture cleanup.

### Phase 3: Integration & Visual Verification
- **Task 3.1:** Connect `scenery3d` and `airfield-core-ground` into `src/modules/traffic/view3d.js`.
- **Task 3.2:** Verify against existing test suites (`npm test`, `tests/unit/traffic/view3d.test.js`) and ensure zero GPU/memory leaks.
