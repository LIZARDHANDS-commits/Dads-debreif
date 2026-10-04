# Traffic 3D Scenery: tasks

## Task 1: Prairie sun + hemisphere lighting (S)
**Description:** Replace flat lighting with a warm DirectionalLight (~45 deg elevation, from the SW) and a HemisphereLight (sky blue above, prairie brown below). Satellite ground stays unlit (MeshBasic).
**Acceptance:**
- [ ] One directional + one hemisphere light; no shadow maps enabled
- [ ] Lights disposed/removed on teardown
- [ ] Buildings and Harvard show lit vs shaded faces
**Verify:** `node --test tests/unit/traffic/view3d.test.js`; `npm run typecheck`; screenshot
**Deps:** none. **Files:** `src/modules/traffic/view3d.js`, `tests/unit/traffic/view3d.test.js`

## Task 2: CT-156 canopy sheen (XS)
**Description:** Give canopy glass low roughness / higher metalness plus a tiny procedural env gradient (skipped in 'low' quality).
**Acceptance:**
- [ ] Canopy visibly glossy under the sun; other parts unchanged
- [ ] Env texture disposed with the model
**Verify:** existing three-aircraft / view3d tests; screenshot. **Deps:** Task 1. **Files:** `src/ui-kit/ct156-model.js` (+ test)

## Checkpoint A
- [ ] Traffic unit tests pass, build clean, Patrick screenshot OK

## Task 3: Windsock (S)
**Description:** Orange/white sock on a mast near the 29L threshold and one mid-field. Points downwind from `windFromDeg`; fills (droop to horizontal) by `windKt` (full at 15 kt). Calm = hanging.
**Acceptance:**
- [ ] Heading = windFrom + 180 within 5 deg; extension 0 at 0 kt, full at >= 15 kt
- [ ] No NaN for missing wind; disposal test passes
**Verify:** `node --test tests/unit/traffic/landmarks3d.test.js`. **Deps:** none. **Files:** `src/modules/traffic/landmarks3d.js`, its test

## Task 4: EFIG landmarks (M)
**Description:** Frozen `CYMJ_LANDMARKS` table (id, kind, x, y, source citation) and low-poly models: White + Green grain elevators, Sukanen Ship (hull silhouette + buildings), Auto Wrecker yard, Race Track Lake + Snowdys Springs (water planes), Clover Leaf (road ribbons), Hwy 2 + rail line ribbons.
**Acceptance:**
- [ ] Every landmark row has a source citation and lies within 15 NM of the ARP
- [ ] Each model <= ~3 draw calls; elevators visible from downwind at 3,500 ft
- [ ] Disposal test counts every geometry/material
**Verify:** landmarks3d test; cockpit-padlock screenshot on downwind. **Deps:** none. **Files:** `landmarks3d.js`, test

## Task 5: Instanced shelterbelt trees (S)
**Description:** One InstancedMesh of low-poly trees placed in rows (field perimeter, housing, Arrow Tree Rows chevron).
**Acceptance:**
- [ ] Single draw call for all trees; count param (default ~500)
- [ ] Arrow Tree Rows form a visible arrow at the EFIG position
**Verify:** landmarks3d test (instance count, one mesh). **Deps:** Task 4 table. **Files:** `landmarks3d.js`, test

## Checkpoint B (serial, after camera Phase 2 merges)
- [ ] Wire `createLandmarks` / `disposeLandmarks` into view3d; update windsock each frame
- [ ] Full traffic tests, typecheck, build; Chrome check from Tower and Cockpit views

## Task 6: Settings + performance thinning (S)
**Description:** "Ground landmarks" on/off in 3D settings (default on); 'low' quality thins trees to 25 % and skips canopy env.
**Acceptance:** [ ] toggle frees/rebuilds landmarks; [ ] Reset to Standard Defaults restores on
**Verify:** settings-panel test. **Files:** `defaults.js`, `settings-panel.js`, tests

## Task 7: Records (XS)
- [ ] decisions-log rows: landmark coordinate estimates, lighting angles, windsock full-at-15 kt
- [ ] dads-questions.md: the Open Questions from plan.md
- [ ] verification note `docs/records/verification/traffic-scenery.md`

## Checkpoint C
- [ ] Patrick sign-off on landmark placement
