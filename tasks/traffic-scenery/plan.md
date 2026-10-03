# Implementation Plan: Traffic 3D Scenery Upgrade (lighting, windsock, landmarks, trees, canopy)

## Overview
Five low-cost visual upgrades to the Traffic Sim 3D view: prairie sun + sky lighting, a wind-driven windsock,
EFIG ground-reference landmarks (grain elevators, Sukanen Ship, Auto Wrecker, Arrow Tree Rows, Race Track Lake,
Snowdys Springs, Clover Leaf), instanced shelterbelt trees, and a canopy sheen on the Harvard. No physics change.

## Architecture Decisions
- **New file `src/modules/traffic/landmarks3d.js`** holds landmarks, trees and the windsock, so `scenery3d.js`
  (airfield buildings) stays a manageable size. Same `create*/dispose*` pattern and D411 disposal test.
- **Landmark positions are data, not code**: one frozen table `CYMJ_LANDMARKS` of `{ id, kind, x, y, source }`
  with an `EFIG p.209/211` citation per row. Easy for Patrick/Dad to correct.
- **Trees use one `InstancedMesh`** (one draw call); windsock is one small group updated per frame.
- **Lighting lives where the renderer is set up** (view3d.js); scene-wide, zero extra draw calls.
- **Performance toggle respected**: in `graphicsQuality: 'low'` trees drop to ~25 % and canopy env map is skipped.
- **Protected files untouched**: `index.js`, `layout.js`, `sim.js`, `moose-jaw.json`. Wind is read from the
  settings view3d already receives (verify in Task 3; if absent, windsock shows calm and it is logged).
- No shadow decals (dropped: height sticks already give ground position; would not match the sun).

## Task List

### Phase 1: Foundation (serial, view3d.js)
- [ ] Task 1: Prairie sun + hemisphere lighting
- [ ] Task 2: Canopy sheen on the CT-156 model

### Checkpoint A: lighting and aircraft look right, all traffic tests pass, Patrick screenshot review

### Phase 2: World content (new file, can run in parallel with Phase 1)
- [ ] Task 3: Windsock driven by sim wind
- [ ] Task 4: Landmark table + low-poly landmark models
- [ ] Task 5: Instanced shelterbelt trees (incl. Arrow Tree Rows)

### Checkpoint B: wire `landmarks3d.js` into view3d (serial), typecheck + build, Chrome check from cockpit/tower views

### Phase 3: Training value
- [ ] Task 6: Landmark visibility setting + performance-mode thinning
- [ ] Task 7: Records — decisions-log rows, future-ideas, verification note

### Checkpoint C: Patrick sign-off on landmark placement

## Parallel vs serial
| Work | Mode | Why |
|---|---|---|
| Tasks 3, 4, 5 | Parallel subagents | All in new `landmarks3d.js` (split by function) + its own test; no shared file |
| Tasks 1, 2 | Serial (main thread) | Touch `view3d.js` / `ct156-model.js`, shared with camera Phase 2-3 |
| Checkpoint B wiring | Serial, after camera Phase 2 lands | Avoid two branches editing `view3d.js` (D375) |

## Risks and Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Exact landmark coordinates not in manuals (diagrams only) | Med | Estimate from EFIG p.209/211 against satellite tiles, ±500 ft; flagged as judgement call; table easy to edit |
| Wind not reachable from view3d without touching index.js | Med | Read existing settings object; else calm sock + logged follow-up |
| New lights wash out the satellite ground (MeshBasic unaffected, Standard affected) | Low | Ground stays MeshBasic; tune intensities on buildings only |
| Many trees on weak laptops | Low | Instancing + 'low' quality thins count |

## Landmark shortlist (manuals research, 3 Oct)
Full report: research agent artifact `cymj-visual-circuit-landmarks-report.md`. Distances below are the
agent's reading of EFIG diagrams, not surveyed: treat as estimates to check against the satellite photo.

| Priority | Landmark | Circuit role | Source |
|---|---|---|---|
| 1 | Window Farm (29L) / Window Intersecting Fields (11R) | 3/4 NM, 200 ft AGL window gate | EFIG p.151, 152, 211 |
| 1 | Sukanen Ship intersection (Hwy 2) | 29L downwind checkpoint | EFIG p.185, 211 |
| 1 | Arrow Tree Rows | 29L perch / base turn cue | EFIG p.131, 185, 211 |
| 1 | Race Track Lake | 11R base turn, 29L crosswind | EFIG p.132, 211 |
| 2 | Auto Wrecker (Flat/Fiat Farm), Snowdys Springs | downwind references | EFIG p.211 |
| 2 | "RWY THSHLDS LINE UP" line | perch alignment | EFIG p.131, 132, 211 |
| 3 | White + Green grain elevators, Clover Leaf, Boot Heal, Red Roof | rejoin / straight-in intercept | EFIG p.130, 209 |

Training extra (future-ideas, not built now): cockpit sight-picture cues, "fuel cap over the runway" on
downwind and "1/3 sky, 2/3 ground" in the final turn (EFIG p.134, 150, 183).

## Open Questions (for Patrick / Dad)
- Grain elevator positions: EFIG p.209 shows White and Green elevators near Moose Jaw city (NE of field). Are both still standing? Colours right?
- Sukanen Ship intersection: is this Hwy 2 x Sukanen access road south of the field? (EFIG p.211 puts it under the downwind leg.)
- "Auto Wrecker (Flat/Fiat Farm)": the diagram reads "Flat Farm"; which name does Dad use?
- Any landmark Dad uses that is missing from the EFIG list?
