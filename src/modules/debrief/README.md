# Debrief Viewer

Load up to four ForeFlight tracks (or the example flight), see them on the map and play them back. The spec is [`docs/modules/debrief/spec.md`](../../../docs/modules/debrief/spec.md); the plan is [`docs/modules/debrief/plan.md`](../../../docs/modules/debrief/plan.md).

| File | What's in it |
|---|---|
| `index.js` | `mount(root, app)`: builds the screen and wires the flight, the playback clock and the map together. Loading swaps the flight only once every file has read cleanly (D54). |
| `state.js` | Plain values, tested in Node: ship colours (#4 white with an outline), the layout defaults "Reset layout" goes back to, the one-line and full status, the flight's box, tracks split at GPS gaps, ship numbers for picked files. |
| `layout.js` | The three columns: Flight (load, example, status), the stage (Fit, Layers menu, map, playback bar) and Formation. |
| `readouts.js` | The numbers for the current time, tested in Node and against V6: each wingman against the standards, Lead's est. IAS and G, live data, aspect, HCA, closure and spacing, and the words for each. |
| `readouts-panel.js` | The Formation card and the "More detail" panel, redrawn at most 10 times a second while playing. |
| `playback-bar.js` | Play or Pause, −1 s, +1 s, speed, the scrubber and the time, bound to flight-data's clock. |
| `map2d/view.js` | The map canvas (ui-kit pan and zoom). Draws only when the time, view, a layer or the size changes. |
| `map2d/layers.js` | Each layer's drawing: grid, 3/9 lines, fighting-wing cone, filled GPS gaps (a shaded zone and a dotted best guess, DB-20), tracks with their trail mode, spacing lines, DFP flags, safety bubbles, clock marks, and the ships (T-6 silhouettes) with their labels ("#2 est." on a filled gap). |
| `map2d/geometry.js` | Where the layers go, in map feet, tested in Node against V6's numbers: trail parts, spacing pairs, 3/9 line ends, the cone's outline. |
| `map2d/overlays.js` | The built-in routes: placed on the map (the flight's, or Moose Jaw's with no flight) and drawn dashed under the tracks. |
| `data/routes.js` | V6's 19 built-in routes as points, taken from V6's KML. |
| (ui-kit) `map-tiles.js` | The satellite imagery under the map (Esri World Imagery) is not in this folder. The debrief uses the ui-kit's `map-tiles.js`, which `map2d/view.js` and `layout.js` import. |
| `map2d/vnc.js` | The VNC charts: bounds and warp pinned to V6, and the layer that fetches each chart when first shown and warps it once per alignment. |
| `view3d/scene.js` | The 3D view's projection, depth order and attitude, pinned to V6. |
| `em.js` | The EM chart: which chart to show, where a point lands on it (pinned to V6), each ship's point and 60 s trail from its track, and the panel's canvas. |
| `tennis.js` | The tennis ball at a moment: reads the two tracks and asks core's one solver (Q33 to Q37). |
| `tennis-panel.js` | The tennis ball's panel: shooter, target, V6's settings and the answer in words. |
| `puck.js` | The GPS puck setting (DB-23): the choices, where the puck sits (`PUCK_OFFSETS_FT`, estimates read off the CT-156 cockpit's `GLARESHIELD_FT` and `REAR_HUMP_FT`), `withPucks` (the flight with each set ship moved by flight-data's `movePuck`; the same object when none is set), the browser key and the status and CSV words. No page access. |
| `gps-timing.js` | The GPS timestamps setting (DB-25): the Timestamps choices (Snapped to GPS second (auto) / As recorded), the time shift's range, `withTimings` (the flight retimed by flight-data's `retimeFlight`), and the words for the status line, status details, the box and the CSV's time header. |
| `puck-panel.js` | The "GPS source" box in the Flight column, closed at first: per loaded ship, the GPS puck menu (Not set / Front cockpit / Rear cockpit), Timestamps (a menu for a track found off the GPS second, otherwise what was found, such as "On GPS seconds") and a time shift box, "Shift (s, ±2)" (−2.0 to +2.0 s, 0.1 s steps). |
| `airspace.js` | Airspace and airfields round the flight (DB-24): picks the SOF base's files that cover the flight (`src/airfields/airspace/areas.js`), keeps the airspace within `AREA_MARGIN_NM` (30, estimate) and the airfields with a runway end in that box, and says what is drawn, loading, missing or failed (`createFlightSpace`). The 3D drawing is ui-kit's `airspace3d.js` and `airfield3d.js` (`view3d/view.js` `placeSpace`); the 2D outlines and runways are `map2d/overlays.js` `drawSpace`. |
| `export-csv.js` | The CSV export's rows: one a second across the shared window, every ship side by side, with sources and GPS gap flags. No page access. |
| `weather/slices.js` | Weather at the time of the flight: the slice (frame, METAR, model hour) at or before the playback moment with its age, frame times to fetch, scrubber ticks, the nearest airfield. No page access. |
| `weather/metar.js` | The METAR line: the IEM archive address, reading its reply, and the decoded line at a moment (decoding is `src/wx`'s `parseMetar`). No page access. |
| `weather/metar-feed.js` | Fetches each airfield's METARs for the loaded flight once, only while the METAR item is on, then (a second later, through the scheduler) asks IEM for specials alone to mark the SPECIs; stops, waits included, when the flight or the debrief closes. |
| `weather/winds.js` | Winds aloft: the Open-Meteo archive address, reading its reply, the wind at Lead's altitude (blended between pressure levels) and the words on the Lead line. No page access. |
| `weather/winds-feed.js` | Fetches the model winds for the loaded flight once per model, for the Lead line (one point) and the wind arrows (the grid, one request), only while each item is on, and stops when the flight or the debrief closes. |
| `weather/wind-arrows.js` | Wind arrows on the 2D map: the 3 x 3 grid over the flight, each point's wind at the chosen height, the arrow's direction and length, the caption and status words. No page access. |
| `weather/satellite.js` | The satellite layer: the GOES-West frame for a moment, its GIBS tile address and zoom limit, the 90-day limit and the line under the map. No page access. |
| `weather/saved-radar.js` | Saved radar and lightning: who is offered it (a flight that ended less than 3 hours ago), which ECCC frames cover the flight, their addresses, what a reply must be to be kept, the 25 MB limit and the thinning that meets it, the block written into the debrief file with its checks on the way back in (untrusted), and the frame that goes with a playback moment. No page access. |
| `weather/saved-radar-feed.js` | Fetches those frames when the person asks (a few requests at a time, cancellable), keeps them until the debrief is saved, and words the Weather menu's offer, progress and result. Stops when the flight or the debrief closes. |
| `map2d/saved-weather.js` | Draws the kept radar and lightning pictures on the 2D map, each as one rectangle between its box's corners, from `data:` images; a few decoded pictures are kept. |
| `view3d/frame.js` | What the 3D view shows at one moment, as plain values: each ship's place and attitude, the ground datum, the camera limits and drag/wheel steps, and the fixed ground grid. |
| `view3d/view.js` | The 3D view: three.js (loaded when 3D is first shown) draws the ground, trails, sticks and the CT-156 Harvard models on a WebGL canvas under the view's canvas, with ui-kit's `matchProjection` camera; the overlay goes on top. Filled GPS gaps are a translucent ribbon with a dashed centre line and the ship ghosted (DB-20). The Cockpit camera is a perspective camera in the ridden ship's seat (ui-kit `ct156-cockpit.js` `createCockpitMount`, `aimCockpitCamera`), the picture at true scale; its labels go through that camera (`worldToScreen`), not `projectPoint`. |
| `view3d/overlay.js` | What's drawn flat over the 3D picture, placed with `projectPoint`: altitude ruler, ship labels and markers, stick heights, compass, caption, tennis ball. Any renderer whose camera matches `projectPoint` can use it. |
| `view3d/input.js` | Turning the 3D view by hand: drag to orbit, the wheel or + and − to zoom. In the Cockpit camera a drag turns the head (ui-kit `COCKPIT_HEAD` limits) and in Chase it swings round the ship, only in Freelook; the wheel does nothing in either. |
| `view3d/camera-bar.js`, `camera-modes.js`, `aim.js` | The camera bar over the 3D picture and its keys (DB-22); the bar's choices and how they map to the saved settings (plain values); the Chase camera's place and Padlock's head turn. The pill helpers are ui-kit `camera-bar.js`. |
| `view3d/cockpit.js` | The Cockpit camera's ridden ship (DB-21): an attitude table at the fix times (heading from the track or crabbed into the model wind, the readouts' bank, pitch from core `attitudeDegFromClimb`) joined smoothly between the seconds, the panel's numbers, and in a GPS gap the fill's estimates or the straight line with dashes. No page access. |
| `dfp.js` | The DFP list: add, time order, labels, notes, previous/next, and which flight they belong to. |
| `dfp-panel.js` | The DFPs list beside the Formation card: + Add, previous/next, go to one, and Edit to rename, write a note or delete. Labels and notes only ever go in as text. |
| `standards-panel.js` | The Debrief settings menu (ui-kit's settings menu, closed at first): the standards editor, which edits `app.standards`, the one copy the Turn Sim reads too. |
| `debrief-session.js` | What a saved debrief carries besides the tracks (DFPs, standards, time), flattened for flight-data's debrief file and read back. Tested in Node. |
| `file-panel.js` | "Save, open, CSV": Save debrief, Open debrief, Export CSV, Close flight, and the example track files as downloads. |
| `data/cymj.js` | Moose Jaw values the debrief still needs: field elevation and the VNC chart anchor. |
| `debrief.css` | The screen's styles, all under `[data-module='debrief']`. Loaded when the debrief opens and removed when it closes. |

## Changing something

- **Ship colours:** `SHIP_COLORS` in `state.js`. #4 stays light with a dark outline so it shows on any background (#29).
- **What's remembered in the browser:** `LAYOUT_DEFAULTS` in `state.js`. Add a key there, then a control bound to it (`controls.checkbox('key', …)`), and "Reset layout" covers it.
- **Keys:** Space plays or pauses, ← and → step 1 s, Home goes back to the start. They're set in `index.js` through `app.keys`, so they never fire while typing and stop when the debrief closes.
- **Saved radar and lightning:** ECCC keeps only 3 hours, so the Weather menu's **Save radar and lightning with this debrief** fetches every frame covering the flight; **Save debrief** writes them into the file as one text value under the file's `settings` (`WEATHER_KEY` in `debrief-session.js`), because `flight-data`'s format has no weather field yet. The limits (25 MB, 1.5 MB a frame, 100 a layer, 30 NM round the flight) are `LIMITS` and `PAD_NM` in `weather/saved-radar.js`. To add a layer, add it to `SAVED_LAYERS` and to the item that draws it in `ITEM_LAYERS`.
- **DFPs:** kept in this browser per flight (the key is a fingerprint of the track files, so they never show on another flight), and in a saved debrief file. Opening a debrief file also puts its standards into `app.standards`.
- **Airspace and airfields (DB-24):** the switches are `airspace` (off), `airfields` (on) and `airspaceHidden` (hidden kinds, comma-joined keys of the shared filter) in `LAYOUT_DEFAULTS`; the menus' line and Airspace kinds list are `layout.js` `spaceBox`. The data and its drawing are shared with the SOF (SOF-62): change the airspace there (`src/airfields/airspace/`), the colours in `src/ui-kit/airspace3d.js` `KIND_COLOURS`, the runway paint in `src/ui-kit/airfield3d.js`.
- **GPS puck (DB-23):** `index.js` keeps the flight as loaded (`baseFlight`) and each ship's seat (`pucks`, kept per flight in the browser beside the DFPs and in the debrief file as `puck.1` to `puck.4`); `flight` is `withPucks(baseFlight, pucks)`, so the map, 3D, cockpit, readouts, standards, tennis ball, gap fill and CSV all read the moved positions. A change re-hands the flight to the map without refitting it (`setFlight(next, { keepView: true })`) and works the gap fill out again; the time, camera and DFPs stay.
- **GPS timestamps (DB-25):** each ship's choices away from the defaults (`timings` { slot: { recorded?, shiftS? } }, kept per flight in the browser beside the puck seats and in the debrief file as `timestamps.N` and `timeShift.N`) are applied to `baseFlight` first, then the pucks: `flight` is `withPucks(withTimings(baseFlight, timings), pucks)` (`sourceFlight` in `index.js`), because the puck move and the gap fill read the times. A change re-hands the flight as a puck change does; a shift that moves the playback window makes the clock again at the same moment and speed.
- **GPS gap fill (DB-19, DB-20):** the solver is `flight-data`'s `gap-fill.js` (its numbers, all estimates, are `GAP_FILL` there). `index.js` runs it a few gaps a frame on load and when the model wind arrives (`refill`), and hands the result only to the drawing (`fills` for the map and the 3D view); the readouts, standards, tennis ball and CSV never see it. The Layers switch is `fillGaps` in `LAYOUT_DEFAULTS`; the status words are `flightSummary` and `trackStatus` in `state.js`.
- **Camera bar (DB-22):** `cam3d` is `followLead` or `formation` (Overview), `chase` or `cockpit`; `aim3d` (`boresight`, `freelook`, `padlock`) and `padlockShip3d` are new, and the ship and seat keys below serve Chase too.
- **Cockpit camera (DB-21):** `cam3d: 'cockpit'` with `cockpitShip3d`, `cockpitSeat3d` and the head (`headYaw3d`, `headPitch3d`) in `LAYOUT_DEFAULTS`. Eye points, head limits and the cockpit itself are ui-kit's (`ct156-cockpit.js`); the ridden ship's attitude is `view3d/cockpit.js`.
- **A track file is untrusted:** names go on screen through `h()` or `textContent`, never `innerHTML`. Files are size-checked (`checkPicked`) before they're read.

## Tests

```
npm test                                   # tests/unit/debrief
npm run build && npx playwright test tests/e2e/debrief.spec.js
```

The browser tests cover the spec's list: loading and status (R11), one clock for 2D and 3D (R12), nothing overlapping at 1366 × 768 and 1920 × 1080 with every panel open (R2), every control doing something with a flight loaded (R3), leaving with nothing left running (R4), offline after one visit (R6), save and reopen (R17), standards kept and reset (R18), the layout remembered (R22) and hostile files shown only as text.

The hand check before sign-off is [docs/checklists/debrief.md](../../../archive/docs/checklists/debrief.md) (R21), run on the live link.
