# Traffic: the map is stretched 1.2 times (briefing, 4 Oct 2026)

From the Traffic screen session, branch `traffic-screen-layout-menus-and-wind`, for any other session working on Traffic. **A finding only. Nothing about the scale has been changed. The fix waits for Patrick's decision.** Read `AGENTS.md` and `docs/modules/traffic/` first, as always.

## In one paragraph

The Traffic world is not in true feet. V6's Moose Jaw routes were drawn by hand in "feet" that were about 12 to 20% too big, and the satellite photo is stretched 1.2 times about the field (`photoTrim: 1.2` in `src/modules/traffic/defaults.js`) to sit under them. Distances in the sim are long by that much: leg lengths, miles on final, the Window, spacing, rejoin miles, glide distances measured against the ground. The flight physics (turns from bank and speed, energy, G) is not affected. Anything placed from true latitude and longitude, such as the 3D landmarks, lands a fifth short of where the photo shows it.

## What was measured

Esri's tiles were drawn at true scale with a feet grid about the field reference point (50.3303 N, 105.5592 W), and the route file (`src/modules/traffic/data/moose-jaw.json`) was drawn over them. `core/geo.js` `latLonToLocalFt` is correct (an equirectangular conversion, Earth radius in metres times feet per metre). The V6 audit says the tile maths is correct too.

| | Real, from the photo | Route file | Route file ÷ real |
|---|---|---|---|
| 29L threshold bar | (2,796 E, −2,776 N) ft | (3,104, −3,194) `THRESHOLD_29L` | about 1.13 |
| 11R threshold bar (29L's far end) | (−3,572, 690) | (−4,066, 680) `DEPARTURE_END_29L` | about 1.1 |
| 29L length, threshold to threshold | 7,250 ft, 298.6° | 8,150 ft, 298.4° | 1.12 |
| Overhead break legs | — | lie on the ground at ÷ 1.2 | about 1.2 |

At ÷ 1.2 the pattern's south-running leg lies exactly on the section road east of the field (Highway 2's line), and its runway segment lies on 29L's centreline. As stored, it misses the road by about 1,300 ft and sits about 100 ft south of the centreline. So the pattern was drawn on a photo shown 1.2 times too big. The runway points are a mix: 1.12 times long, and offset. Readings are from 1.25 ft per pixel photos and are good to about ±10 ft.

How to repeat the check: fetch `World_Imagery` tiles at zoom 16 to 18, convert local feet to latitude and longitude with the same formula as `latLonToLocalFt`, and draw the route points, once as stored and once divided by 1.2. Esri's photos are not put in the repo.

## Why it is like this

- V6 added a "scale trim" slider so its hand-drawn routes would line up with the photo. The built-in setup only lined up at 1.2, the slider's maximum, and V6's "Moose Jaw default align" button reset it to 1.0, which un-aligned everything. V6 audit finding: `docs/references/v6-audit/findings.json` (around line 5084, "the profile's world coordinates are not true feet"; the runway is defined three different ways).
- It is an open question already: **TR-Q15** in `docs/modules/traffic/README.md` (redraw the routes to the ground, or keep the trim). Working answer: keep the trim until the routes are redrawn with Dad (`docs/modules/traffic/plan.md` Step 6, "Redraw the Moose Jaw routes over the satellite photo with Dad").
- The rebuild carried the 1.2 over unchanged. `defaults.js` and the route file's `view.photo.trim` both say 1.2.

## What it means for other work, until Patrick decides

1. **All distances in the Traffic world are stretched feet**, about 1.12 to 1.2 times real. Examples:
   - The Overhead break lap is 156,924 ft (25.8 NM, the old V6 number in `tests/unit/traffic/route.test.js`).
   - The PFL circle radius is `PFL_CIRCLE_RADIUS_FT` = 3,038 ft. On the real ground that is about 0.42 NM, not 0.5.
   - An area PFL "6 NM out" starts about 5 NM out on the real ground.
   - The Window on the route file is 0.75 NM from the end of the SI Rejoin in stretched feet.
   - Spacing on final (2,000 ft), the rejoin miles and the "miles on final" boxes built today are all in stretched feet.
2. **The physics is in true feet** (turn radius from bank and true airspeed, glide ratio, energy). Mixing it with stretched geometry means turn sizes are right but legs are long. A glide judged against the photo reaches less far than the same glide would over the real ground. Two route points already need more G than the T-6 can pull (plan Step 6). Shrinking the routes would make tight spots tighter.
3. **Do not mix frames.** Things placed on the photo by eye are in the stretched frame: `scenery3d.js` (tower, hangars), `HWY2_POINTS`, the route file. Things placed from real latitude and longitude are not: the landmark pins in `landmarks3d.js`, anything from the CFS, airport data or a GPS track. Until the decision, anything taken from true latitude and longitude into the Traffic world must go through the photo alignment: `photoToWorld` in `map2d.js`, which multiplies by the trim and adds the offsets.
4. **Do not "fix" it by setting the trim to 1.0 alone.** The photo would then slide out from under the routes and the runway, which is what V6's align button did.
5. **Tests whose expected numbers come from the route file** (lap lengths, leg distances, positions) are in stretched feet. A rescale changes them. Per `docs/TESTING.md`, they would be re-derived from real data or the manuals, never from the code's new output.
6. **Other modules:** the Debrief draws GPS tracks from real latitude and longitude, so it is unaffected unless it overlays Traffic routes. The Formation Simulator, Fight Sim and SOF have no Traffic map. `core/geo.js` is correct and needs no change.

## The options put to Patrick (not yet answered)

- **Rescale to true feet** (recommended by this session). Shrink every Moose Jaw route point, the runway (put 29L on its measured thresholds, 7,250 ft at 298.6°), the PFL circle and keys, Highway 2 and the 3D scenery by 1.2 about the field, and set the photo trim to 1.0. It is a flying change: written up first, then built on its own branch, with the route-derived tests re-derived.
- **Redraw the routes with Dad first.** Leave everything stretched, and put things taken from true positions on the stretched photo, until the routes are redrawn over the true photo (plan Step 6).
- **Keep the stretch for now.** Revisit later.

## On hold in the Traffic screen session

- Patrick's four 3D landmark fixes (4 Oct, with screenshots): Window Farm's buildings onto the big white building, with its brown pen block turned into groups of pigs and a few loners; Sukanen's red-roof buildings moved and rotated; Fiat Farm's cars moved into the yard and made bigger (the OHB Rejoin flies over); the Arrow tree rows moved. Where they go depends on the scale answer.
- An uncommitted change in `src/modules/traffic/landmarks3d.js` and `src/modules/traffic/view3d.js` that puts the landmarks on the stretched photo (pin times the trim, models stretched the same way). It is not committed until the decision.

## One writer per file

The Traffic screen session's branch `traffic-screen-layout-menus-and-wind` is not pushed yet. It holds 46 commits since main: screen layout, menus, the wind in °M (TR-63), miles back on the rejoins (TR-64), the SI pattern on the routes list and spawner, and Spawn a conflict anywhere along a route. It has edited these Traffic files: `aircraft.js`, `index.js`, `layout.js`, `setup-panel.js`, `playback-bar.js`, `settings-panel.js`, `scene.js`, `scenario-timing.js`, `sim.js` (spawn `backFt`), `map2d.js`, `view3d.js`, `landmarks3d.js`, `airfield.js`, `defaults.js`, `traffic.css`, `version.js`, the route file (route names) and the Traffic docs. Before editing any of them, merge that branch or agree with Patrick who writes which file.
