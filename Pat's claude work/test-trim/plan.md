# Test trim: what would go and what stays

Waiting on Patrick's yes. Nothing is deleted yet. Counts are approximate (from the test titles on main, 5 Oct 04:20Z).

**Before:** about 3,200 unit tests in 202 files, and about 380 browser tests in 19 files.
**After:** about 1,600 unit tests in 106 files, and about 120 browser tests in 14 files.

Formation Sim's tests are not in this pull request: the Formation thread is rewriting its planner files in its clean-up, so its cut (below) goes to that thread to fold in.

What stays checks flying right and nothing breaking: no snaps or NaN, G within the stall line, limits flagged not walled, lands on the runway, ends in the formation, numbers where the NFM/SMM put them, weather limits and stale reports, and hostile files or replies refused.

## Browser tests (the heavy ones)

Delete five module walk-throughs, which only run at sign-off and pin screen details: `traffic`, `turn-fight`, `debrief`, `sof`, `sof-map` (about 260 tests). `turn-sim` stays for the Formation thread to decide. The every-change set stays: smoke, accessibility, layout, buttons, leave, switching, offline, storage, clock, file, media, airfields, ui-kit.

## Traffic (652 to about 220)

Delete (screens, 3D, settings counts, V6 copies, internals):
aircraft (spawner panel), airfield-core-ground, base-buildings3d, behaviour-tags (tag wording), camera-views, defaults, fake-dom-extras, glue, landmarks3d, layout, lights3d, map2d, playback-bar, profile-store, profile, profiles-panel, readouts (V6 rounding), rewind (heavy, sign-off only, never finished), rivers3d, route (pins a 156,924 ft lap), scene, scenery3d, settings-panel, setup-panel, tick-aircraft, types, view3d.
9 of the 11 failing Traffic tests are in these files.

Keep: flight-invariants, smooth-transitions, plausibility, pfl, deconflict, breakout, closed-pattern, commands, high-key-climb, miles-back, nav-plans, randomize, behaviour, sim, clock, dice, vector-sim. Inside sim and vector-sim, drop the V6-copy and exact-count tests (72,000 steps, seven aircraft, A1 at 12 s, callsign order, spawn presets list).
behaviour (gear and flap round the pattern, 2 failing) stays: it may be a real flying fault for Traffic to look at.

## Fight Sim (455 to about 230)

Delete: energy-graph, energy-layout (hint wording), energy-playback, energy-readouts, energy-state, energy-view3d, profile (side view drawing), readouts, state, view, view3d.
Keep: energy-sim, sim, geometry, energy-tactical, energy-below-mmo, t6-limit, playback. Inside them, drop tests that pin seconds or code output (Immelmann 24 s v pitch back 31 s, nose-on at +14.4 s), wording ("the reason says so", turn-line text), settings bounds and V6-only options.

## Formation Sim / Turn Sim (283 to about 200, done by the Formation thread in its clean-up)

Suggested delete: auto-timing, correction, cues, fields, formation (V6 defaults), plan, readouts, rear-check, rear-delay, settings, view3d.
Keep: transitions, formation-moves, four-ship-changes, four-ship, live, fluid, full-power, offstandard-rejoin, slow-down, fw-shape, g-warm, tags, errors, cross-turn, shackle, hook, check-turn, delayed-45, delayed-45-check, box-slot, offset-box, heading, run. Inside them, drop the two failing errors tests (settings sign and random error), defaults (30° check, 180° hook), run-length plumbing, and the "about 40 s against 52 s" time comparisons.

## SOF (786 to about 250)

Delete (screen models, wording, drawing, feed timers): banner-model, cards, feeds, map-draw, map-feeds, map-layers, map-loops, map-model, map-view, marked-cautions, marks, reports-store, screen-model, taf-state, timeline-view-model, timeline, traffic (ADS-B layer; the relay's own tests stay), waves-view-model, waves-view-plan.
Keep: cautions (below limits raises a caution), lightning, waves (alternate required), weather (failed feed keeps last reports), settings-model (limits snap up), map-fetch and map-adsbx (hostile replies, sandbox), map-lightning.

## Debrief (290 to about 150)

Delete: frame (3D camera), map-wind-arrows, overlay, state (menus and colours), view3d-view, vnc, weather-metar-feed, weather-satellite, weather-saved-layer, weather-saved-radar-feed, weather-slices, weather-wind-arrows.
Keep: readouts (est. IAS, bank, never above the stall line), scene, attitude, geometry, tennis, dfp, export-csv, debrief-session, weather-metar, weather-winds, weather-saved-radar (hostile files).

## Shared and the rest

Delete: airfields catalog and format (V6 list, wording); shell examples, header, home, registry, report, version; ui-kit canvas-view, controls, ct156-model, map-tiles, settings-menu, three-aircraft; wx spans; flight-data examples.
Keep untouched: core flight maths (all 11 files), wx parser and limits, flight-data cleaning and KML safety, storage, relay, shell host and router, update bar, ui-kit dom and scheduler, the source rules.

## Also in the same pull request

- The unit runner's sign-off-only list empties (rewind goes).
- Module docs that name deleted files are left for their owners; the Docs thread is told TESTING.md's "module's full browser tests at sign-off" no longer exists.
