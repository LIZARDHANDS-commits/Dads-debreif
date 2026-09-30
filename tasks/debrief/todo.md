# Debrief screen: tasks

Build starts once PR #58 and PR #61 are merged. See [`plan.md`](plan.md).

- [x] **1. Screen and loading.** Module registered and mounted; three columns with collapsible panels; the essentials-first layout (Layers and Tools menus, remembered toggles, Reset layout); load up to 4 files or the example flight; one-line status that opens the full status; fit to view; 2D tracks with gaps broken; #4 white with an outline.
  - Acceptance: R11 (example flight fitted, correct status); a failed file changes nothing loaded (D54); nothing overlaps at 1366 × 768 (R2).
  - Verify: `npm test`; `npm run dev` and load the example flight; e2e load test.
  - Files: src/shell/registry.js (via the app frame thread), src/modules/debrief/{index,state,layout}.js, map2d/{view,layers}.js, debrief.css, README.md, tests/unit/debrief/state.test.js
  - Done: the debrief opens from its card. The Layers menu has the grid and Reset layout so far; each later layer joins it. "Close flight" comes with task 5 (it asks about unsaved DFPs), the 2D/3D switch with task 8. The example flight comes through `app.exampleText` (#97).
- [x] **2. Playback bar.** Play, pause, reset, step ±1 s, speed, 1 s scrubber, Zulu and local time, keyboard shortcuts; redraw on change only.
  - Acceptance: Play at the end restarts; a paused debrief draws nothing; shortcuts stop when the debrief closes (R4).
  - Verify: `npm test`; e2e playback and module-switch tests.
  - Files: src/modules/debrief/playback-bar.js, map2d/view.js, tests/e2e/debrief.spec.js
  - Done: Reset and both times fit in the bar at 1366 px, so they show at every size instead of in a "more" menu. Measured at 1920 × 1080 on the example flight at 16×: 16.7 ms median frame (60 fps), example loads in 0.6 s (headless Chromium).
- [x] **3. Readouts.** The Formation card (one line per ship), and behind "More detail": live data (est. IAS; G and pitch from the track, D61; recorded bank when present, D47), aspect/HCA/closure, spacing with horizontal or 3D labels, GPS gap and unknown heading states.
  - Acceptance: numbers match V6 on the example flight (R9) except the logged changes; readouts update at most 10 times a second.
  - Verify: golden comparison of readout rows; performance log at 16×.
  - Files: src/modules/debrief/readouts.js, tests/unit/debrief/readouts.test.js, tests/golden/debrief-readouts.test.js
  - Done: the Formation card judges each wingman with `app.standards` (the editor is task 4), shows how far outside the band it is, and shows no label where no standard applies (#21), in a gap (D32) or with Lead still (D52). Lead is judged on est. IAS (D31); est. IAS is core's EM-chart formula, pinned equal to `emPoint`. Bank in More detail is the 3D view's `bankFromTrack`, so both agree. The golden test runs V6's readout code on the example flight's cleaned fixes: range, aspect, HCA, closure and labels match exactly. Measured at 1366 × 768 at 16× with More detail open: 16.7 ms median frame.

**Checkpoint A:** tests pass, build under budget, example flight plays smoothly; open PR A.

- [x] **4. Standards.** Standards panel with V6's preset, edit, reset, saved in module settings; labels on the map, green when on parameters; no label where no standard applies (#21).
  - Acceptance: R18 (edit, reset, reload); #3's fore/aft judged by the offset standard alone and its interval by spread (D78; on main since #80).
  - Verify: unit tests of label rules; e2e edit/reset/reload.
  - Files: src/modules/debrief/standards-panel.js, readouts.js, map2d/layers.js, tests/unit/debrief/readouts.test.js, tests/e2e/debrief.spec.js
  - Done: the Standards panel (closed at first) edits `app.standards`, the one copy the Turn Sim reads too (D89): an on/off box per standard, each number with its limits, a refused value keeps the saved one and says why, Reset to V6 standards. The map shows each wingman's label beside its number, green on parameters and none where the card shows none (#21). Saving the standards in the debrief file comes with task 5.
- [x] **5. DFPs and the debrief file.** Add, label, note, go to, delete, previous/next in time order; kept per flight in browser storage; Save and Open debrief.
  - Acceptance: R17 (save, close, open: same tracks, DFPs, standards, time); DFPs never show on another flight (#25); hostile labels show as text.
  - Verify: unit tests of dfp.js; e2e save/open round trip.
  - Files: src/modules/debrief/dfp.js, index.js, tests/unit/debrief/dfp.test.js
  - Done: the DFPs list beside the Formation card (+ Add, ◀ ▶ in time order, go to one, Edit to rename, note or delete), kept in this browser per flight and never shown on another (#25). "Save, open, examples" (closed at first) saves a debrief file with the tracks, DFPs, standards and time, opens one back to the same state (R17), closes the flight (asking first when DFPs aren't in a saved file yet) and offers the example track files. A file that can't be read changes nothing. DFP flags on the map come with task 6.
  - Saves go through the shared `storage/file.js` (`downloadText`, #102).

**Checkpoint B:** open PR B.

- [x] **6. Map layers, part 1.** Grid, spacing lines, trail modes, 3/9 lines, fighting-wing cone, clock marks, safety bubble, follow lead, DFP flags, route overlays.
  - Acceptance: every layer redraws while paused (#26); click-through passes (R3).
  - Verify: e2e click-through; look at each layer against V6.
  - Files: src/modules/debrief/map2d/{layers,overlays}.js, data/cymj.js
  - Done: the Layers menu has V6's layers with V6's defaults (full tracks, spacing lines, grid and Lead's 3/9 on; #3's 3/9, cone, clock marks, bubble and its radius, Follow Lead off), remembered and covered by Reset layout. Every layer redraws at once while paused (#26). Ships are V6's T-6 silhouette pointing along the track (a dot while not moving, hollow in a GPS gap); no 3/9 line, cone or clock for a ship that isn't moving. DFP flags sit at Lead's place when each was added. Places are in `map2d/geometry.js`, pinned to V6's numbers.
- [x] **6b. Route overlays.** V6's 19 built-in routes (TACNAV 1 to 4, North and South A/B/ED, Stds and TAC test routes) with opacity, drawn under the tracks.
  - Acceptance: each route is V6's (golden test against V6's own KML) and draws on the flight's map, or on its own before a flight is loaded.
  - Done: "Route" and "Route opacity" in the Layers menu, remembered. The routes are only their points (about 6 kB, in `data/routes.js`), so they come with the debrief rather than as separate downloads.
- [x] **7. Map layers, part 2.** Satellite tiles with Esri attribution and offline message; embedded VNC charts with alignment, pinned warp, off-screen cache, "Not for navigation".
  - Acceptance: VNC warp matches V6 (golden); charts load only when turned on (R5); tiles retry and repaint only their area (#28).
  - Verify: golden warp test; network log in the browser; performance log.
  - Files: src/modules/debrief/map2d/{tiles,vnc}.js, public/media/debrief/*, tests/golden/debrief-vnc.test.js
  - 7a done: "Satellite imagery" (off at first) draws Esri World Imagery under everything, darkened as in V6, with Esri's credit on the map. Tiles are fetched only while it's on, tried three times, and a redraw waits for the next frame however many arrive at once. With no connection the map says so and keeps the grid. With no flight the map's feet start at Moose Jaw (V6's anchor), so routes and imagery line up before any track loads. The loader (`map2d/tiles.js`) knows nothing of the debrief, ready to move to the ui-kit.
  - 7b done: "Routes and charts" (a menu of its own, so neither menu runs over the playback bar) has V6's route choice and opacity, then "VNC chart" (Off, South, North, Both) at V6's 78 % opacity, with V6's fine alignment (east/west and north/south nudge, scale, Reset alignment) closed under "Chart alignment". A chart is fetched the first time it's shown, warped once per alignment into an off-screen image and then drawn with one drawImage a frame (#43). With no flight the view fits the charts, as V6 did. The map says "not for navigation" while a chart shows, "Loading" before it arrives, and that it needs a connection if it can't load. The images are V6's PNGs re-encoded as lossless WebP: the same pixels (checked), 5.4 MB instead of 9.7 MB. The service worker keeps them only once shown (app frame's change, made here at its request).

**Checkpoint C:** open PR C.

- [x] **8. 3D view.** Scene pinned to V6 (projection, attitude), then D40 bank, recorded bank (D47), pitch as nose up/down, depth order, one fixed ground, altitude ×2 label, sticks for both models; shared playback and readouts.
  - Acceptance: R12 (switch while playing keeps the time; never blank); each fix is its own commit updating the golden value.
  - Verify: golden scene tests; e2e view switch; performance log.
  - Files: src/modules/debrief/view3d/{scene,view}.js, tests/golden/debrief-3d.test.js, tests/unit/debrief/scene.test.js
  - Done so far: scene pinned to V6 (#74); bank from the real turn rate, recorded bank first (D40, D47); the T-6 rolls and pitches as one body (#14, #27); near aircraft drawn over far ones (#27). Pitch comes from flight-data's `pitchAt` (D61).
  - Field-elevation datum: `app.airfields.home().elevationFt`, or 1892 ft while that's null or not wired in yet (Airfields #79).
  - Done: a 2D/3D switch above the map, on the one clock, so switching while playing keeps the time (R12). With no flight, 3D shows the same "load a flight" message as 2D. "3D settings" (shown only in 3D) has V6's camera, aircraft, altitude ×, size, trail, datum and layer switches, remembered, with Reset view for the camera. Drag turns the view and the wheel or + and − zoom, within V6's limits. The ground and its 5,000 ft grid are fixed to the ground at whole multiples, so the formation moves over it (#27); only the field datum is called "AGL". The altitude ruler stands at the left edge (V6 put it 42,000 ft off, out of view at most zooms). Measured at 1920 × 1080 at 16×: 16.7 ms median frame.

**Checkpoint D:** open PR D.

- [x] **9. EM chart and tennis ball.** Both off by default and opened from Tools. EM panel below the stage, images loaded on open, 60 s trails; one tennis-ball solution from core in both views (D62) with its controls in the right column.
  - Acceptance: EM never covers the map (#37); cone half-width (±3°) and the INTERCEPT rule are one setting each (D63, confirmed D77).
  - Verify: e2e overlap scan with EM open; unit tests of the tennis panel glue.
  - Files: src/modules/debrief/{em,tennis-panel}.js, public/media/debrief/em-*.jpg
  - 9a done (EM chart): "Tools" menu → "EM chart" opens a panel below the playback bar, beside its controls, so the map shrinks and nothing covers it (#37). V6's three charts (its own JPEGs, byte for byte) with its plot box and scales (golden test), "Nearest the formation" or a chart by hand, and the 60 s fading trail on by default. Points are core's emPoint (no divide by 2, D39). The trail is worked out from the track, so it's there after a seek or while paused (V6 built it only while playing). A chart is fetched only when the panel shows one; closed, it draws nothing (#39). Menus now end above the map's bottom edge and scroll, so no menu covers the playback bar or the EM panel.
  - 9b done (tennis ball): "Tools" → "Tennis ball" opens its panel in the Formation column: shooter and target (V6's #2 at Lead), V6's settings (350 kt, 6° cone = ±3°, 3 s, 250 ft, gravity on, pitch bias 0), and the answer in words (status, range, line of sight against the cone, closest pass, ball speed and pitch with its source). One solution from core's solver (Q33 to Q37, D77) is drawn on the map (V6's cone, ball path, target path, closest pass) and in 3D (the arc, the cone's edges, the target's path, the closest pass), so the words and pictures never disagree (#19). A ship in a GPS gap, not moving, missing, or the same ship twice says so instead.
- [x] **10. CSV export.** One file, one row per second, ships side by side, sources and gap flags; disabled with no flight.
  - Acceptance: rows are time-aligned and complete (#28).
  - Verify: unit tests of export-csv.js.
  - Files: src/modules/debrief/export-csv.js, tests/unit/debrief/export-csv.test.js
  - Done: "Save, open, CSV" → "Export CSV" (disabled with no flight) downloads debrief-<date>-<HHMM>Z.csv: a row for every whole second of the shared window, and for each ship lat, lon, alt, GS, est. IAS, heading, G, pitch and bank (right +) with their sources, and a GPS gap flag. The numbers are the readouts' own (readoutsAt), so file and screen agree. Cells that start with = + - @ and aren't numbers get a leading ' so a spreadsheet never runs them.
- [ ] **11. Browser tests and sign-off.** The e2e list in the spec; `docs/checklists/debrief.md`; README.
  - Acceptance: all browser tests pass in CI; checklist run on the live link (R21).
  - Files: tests/e2e/debrief.spec.js, docs/checklists/debrief.md, src/modules/debrief/README.md
  - Browser tests and checklist done: added every control with a flight loaded (R3, a fresh page per click, default layout then every panel open), leaving from 3D with the EM chart and tennis ball open (R4), offline after one visit (R6), and a hostile debrief file (10 MB note refused, script only text). docs/checklists/debrief.md written. Left open until Patrick (or anyone, D28) runs the checklist on the live link.

**Checkpoint E:** open PR E; Patrick (or anyone, D28) runs the checklist.
