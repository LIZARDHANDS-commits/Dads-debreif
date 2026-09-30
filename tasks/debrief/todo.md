# Debrief screen: tasks

Build starts once PR #58 and PR #61 are merged. See [`plan.md`](plan.md).

- [ ] **1. Screen and loading.** Module registered and mounted; three columns with collapsible panels; the essentials-first layout (Layers and Tools menus, remembered toggles, Reset layout); load up to 4 files or the example flight; one-line status that opens the full status; fit to view; 2D tracks with gaps broken; #4 white with an outline.
  - Acceptance: R11 (example flight fitted, correct status); a failed file changes nothing loaded (D54); nothing overlaps at 1366 × 768 (R2).
  - Verify: `npm test`; `npm run dev` and load the example flight; e2e load test.
  - Files: src/shell/registry.js (via the app frame thread), src/modules/debrief/{index,state,layout}.js, map2d/{view,layers}.js, debrief.css, README.md, tests/unit/debrief/state.test.js
- [ ] **2. Playback bar.** Play, pause, reset, step ±1 s, speed, 1 s scrubber, Zulu and local time, keyboard shortcuts; redraw on change only.
  - Acceptance: Play at the end restarts; a paused debrief draws nothing; shortcuts stop when the debrief closes (R4).
  - Verify: `npm test`; e2e playback and module-switch tests.
  - Files: src/modules/debrief/playback-bar.js, map2d/view.js, tests/unit/debrief/playback.test.js
- [ ] **3. Readouts.** The Formation card (one line per ship), and behind "More detail": live data (est. IAS; G and pitch from the track, D61; recorded bank when present, D47), aspect/HCA/closure, spacing with horizontal or 3D labels, GPS gap and unknown heading states.
  - Acceptance: numbers match V6 on the example flight (R9) except the logged changes; readouts update at most 10 times a second.
  - Verify: golden comparison of readout rows; performance log at 16×.
  - Files: src/modules/debrief/readouts.js, tests/unit/debrief/readouts.test.js, tests/golden/debrief-readouts.test.js

**Checkpoint A:** tests pass, build under budget, example flight plays smoothly; open PR A.

- [ ] **4. Standards.** Standards panel with V6's preset, edit, reset, saved in module settings; labels on the map, green when on parameters; no label where no standard applies (#21).
  - Acceptance: R18 (edit, reset, reload); #3's fore/aft judged by the offset standard alone and its interval by spread (D78), once `core`'s `standards.js` change is on main.
  - Verify: unit tests of label rules; e2e edit/reset/reload.
  - Files: src/modules/debrief/standards-panel.js, readouts.js, tests/unit/debrief/standards.test.js
- [ ] **5. DFPs and the debrief file.** Add, label, note, go to, delete, previous/next in time order; kept per flight in browser storage; Save and Open debrief.
  - Acceptance: R17 (save, close, open: same tracks, DFPs, standards, time); DFPs never show on another flight (#25); hostile labels show as text.
  - Verify: unit tests of dfp.js; e2e save/open round trip.
  - Files: src/modules/debrief/dfp.js, index.js, tests/unit/debrief/dfp.test.js

**Checkpoint B:** open PR B.

- [ ] **6. Map layers, part 1.** Grid, spacing lines, trail modes, 3/9 lines, fighting-wing cone, clock marks, safety bubble, follow lead, DFP flags, route overlays.
  - Acceptance: every layer redraws while paused (#26); click-through passes (R3).
  - Verify: e2e click-through; look at each layer against V6.
  - Files: src/modules/debrief/map2d/{layers,overlays}.js, data/cymj.js
- [ ] **7. Map layers, part 2.** Satellite tiles with Esri attribution and offline message; embedded VNC charts with alignment, pinned warp, off-screen cache, "Not for navigation".
  - Acceptance: VNC warp matches V6 (golden); charts load only when turned on (R5); tiles retry and repaint only their area (#28).
  - Verify: golden warp test; network log in the browser; performance log.
  - Files: src/modules/debrief/map2d/{tiles,vnc}.js, public/media/debrief/*, tests/golden/debrief-vnc.test.js

**Checkpoint C:** open PR C.

- [ ] **8. 3D view.** Scene pinned to V6 (projection, attitude), then D40 bank, recorded bank (D47), pitch as nose up/down, depth order, one fixed ground, altitude ×2 label, sticks for both models; shared playback and readouts.
  - Acceptance: R12 (switch while playing keeps the time; never blank); each fix is its own commit updating the golden value.
  - Verify: golden scene tests; e2e view switch; performance log.
  - Files: src/modules/debrief/view3d/{scene,view}.js, tests/golden/debrief-3d.test.js, tests/unit/debrief/scene.test.js
  - Done so far: scene pinned to V6 (#74); bank from the real turn rate, recorded bank first (D40, D47); the T-6 rolls and pitches as one body (#14, #27); near aircraft drawn over far ones (#27). Pitch comes from flight-data's `pitchAt` (D61).
  - Field-elevation datum: `app.airfields.home().elevationFt`, or 1892 ft while that's null or not wired in yet (Airfields #79).

**Checkpoint D:** open PR D.

- [ ] **9. EM chart and tennis ball.** Both off by default and opened from Tools. EM panel below the stage, images loaded on open, 60 s trails; one tennis-ball solution from core in both views (D62) with its controls in the right column.
  - Acceptance: EM never covers the map (#37); cone half-width (±3°) and the INTERCEPT rule are one setting each (D63, confirmed D77).
  - Verify: e2e overlap scan with EM open; unit tests of the tennis panel glue.
  - Files: src/modules/debrief/{em,tennis-panel}.js, public/media/debrief/em-*.jpg
- [ ] **10. CSV export.** One file, one row per second, ships side by side, sources and gap flags; disabled with no flight.
  - Acceptance: rows are time-aligned and complete (#28).
  - Verify: unit tests of export-csv.js.
  - Files: src/modules/debrief/export-csv.js, tests/unit/debrief/export-csv.test.js
- [ ] **11. Browser tests and sign-off.** The e2e list in the spec; `docs/checklists/debrief.md`; README.
  - Acceptance: all browser tests pass in CI; checklist run on the live link (R21).
  - Files: tests/e2e/debrief.spec.js, docs/checklists/debrief.md, src/modules/debrief/README.md

**Checkpoint E:** open PR E; Patrick (or anyone, D28) runs the checklist.
