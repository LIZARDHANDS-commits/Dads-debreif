# Spec: `debrief`, the debrief screen (2D map and 3D view)

Status: **approved by Patrick on 2026-09-30** ("spec-debreif-approved", in the Debrief screen thread), including his answers to Q32 to Q37 (Q32 read as pitch and G from the track's motion), #4 drawn white with a dark outline, and the trims listed below. The essentials-first screen in The screen (R22) was approved by Patrick on 2026-09-30 ("ok"). Changes go through a pull request. Module id `debrief` in [`SPEC.md`](../SPEC.md). Requirement IDs (R#), decisions (D#) and questions (Q#) refer to the plan doc: https://claude.ai/code/artifact/29712036-a126-43c3-ac39-57ba919ff102

The build starts once flight data (PR #58) and flight math core part 2 (PR #61) are merged.

## Objective

One screen to debrief a formation sortie. Load up to four ForeFlight tracks (or the example flight) once, then replay them on a 2D map or in a 3D view with a single switch, at the same moment, with the same readouts (D16, R11, R12).

V6 spread this over two tabs, a floating EM card and a tennis-ball card that lived in the wrong tab. They kept four clocks, drew over each other's controls, and kept running when hidden (#19, #21 to #29, #34 to #39). The rebuild is one module, mounted and unmounted by the shell, reading one flight model and one clock from `flight-data` (R4).

Users are T-6 instructors and students in a debrief, on a desktop or laptop (D6). They should be able to:

1. Load their tracks, see the whole sortie fitted to the screen, and read a correct status line (R11).
2. Play, pause, scrub and step through the flight, with times in Zulu and local (R10).
3. Flip between the 2D map and the 3D view without losing their place (R12).
4. Read spacing, fore/aft, aspect, HCA, closure, speed and G for each ship, judged against editable standards (R9, R18).
5. Mark debrief focus points (DFPs), write notes, and save the whole debrief to a file that reopens exactly as it was (R17, D21).

## Assumptions

1. `flight-data` owns loading, cleaning, the flight model, the clock and the debrief file format ([`SPEC-flight-data.md`](SPEC-flight-data.md)). The debrief never parses KML or keeps a clock of its own.
2. `core` owns every number: aspect, HCA, closure, estimated G, the EM point, the tennis-ball solver and (in core PR 3) the standards classifier. The debrief picks the moments, calls `core`, and draws the answer.
3. The 3D view is drawn with **three.js** (Patrick approved 2026-09-30 07:41Z, D138), using ui-kit's shared CT-156 Harvard model and `matchProjection` camera, which lands every point where `scene.js` `projectPoint` puts it. three.js downloads only when 3D is first shown (D141). Before that, the view was hand-drawn on a Canvas 2D, as V6's was.
4. Map imagery (Esri satellite tiles) needs the network. Everything else, including the VNC charts once viewed, works offline (R6).
5. Until `airfields` lands, CYMJ values the debrief needs (field elevation 1,892 ft, the VNC chart anchor, the 19 route overlays) sit in one file, `src/modules/debrief/data/cymj.js`, so they move to `airfields` in one step (R16).
6. The ui-kit's `controls.js` (inputs bound to settings) and `canvas-view.js` (pan and zoom) are written for this module, by the app-frame thread, which owns `src/ui-kit/`. The debrief is their first user.

## The screen

The screen follows Patrick's rule (2026-09-30, R22): show the essentials by default, and put everything else behind a toggle or a "More" panel the user opens when they want it. Nothing is removed by this. It's just not all on screen at once.

**What a first-time user sees** after loading a flight: the map with the tracks, a short status line, the playback bar, and one small Formation card. That's it.

```
┌ Flight ─────────────┐┌ Stage ───────────────────────────────┐┌ Formation ──────────┐
│ Load tracks         ││ [2D | 3D]   Fit   Layers ▾   Tools ▾  ││ #2  on parameters   │
│ Example flight      ││                                       ││ #3  WIDE  +600 ft   │
│ 4 tracks loaded  ›  ││                                       ││ #4  AFT   -300 ft   │
│                     ││          map or 3D view               ││ Lead 201 kt est IAS │
│ ▸ Save, open, CSV   ││                                       ││ ▸ More detail       │
│                     ││                                       ││ DFPs  + Add         │
│                     ││ ▶ −1s +1s  1× ▾  ──●──── 14:32:07Z    ││ ▸ Debrief settings  │
└─────────────────────┘└───────────────────────────────────────┘└─────────────────────┘
```

| Shown by default | Behind a checkbox (off by default) or a collapsed "More …" panel (R22) |
|---|---|
| Load tracks, Example flight, a one-line status ("4 tracks loaded, 2 gaps") | The full per-track status (fixes dropped and why, gaps, cut tracks), opened from the status line |
| The map with tracks, ship numbers and standards labels, Fit, 2D/3D | **Layers** menu: grid, spacing lines, trail mode, satellite, VNC charts and their alignment, route overlays, 3/9 lines, fighting-wing cone, clock marks, safety bubble, follow lead |
| Playback bar: Play/Pause, step ±1 s, speed, scrubber, the time in the shared Zulu/local order | Reset and the second time zone sit in the bar's small "more" menu at 1366 px wide, and show at full width on bigger screens |
| **Formation** card: one line per wingman (standards label and the one number that's off), one line for Lead (est. IAS and G against the lead standard) | **More detail**: altitude, speed, G, pitch and bank with their sources, lat/lon, aspect, HCA, closure, and spacing for every pair |
| DFPs: the list and "+ Add" | Each DFP's note opens when its row is opened |
| | **Debrief settings** (ui-kit's settings menu, the screen's one closed menu of tuning numbers): the standards editor with the preset and Reset |
| | **Tools** menu: EM chart, Tennis ball. Each opens its own panel and closes it again |
| | **Save, open, CSV**: Save debrief, Open debrief, Export CSV, example downloads |
| | **3D settings** (in 3D only): camera, altitude ×, model, plane size, labels, trail, ground and grid options, Reset view |

- **Layers keep V6's on/off defaults** (tracks full, spacing lines and grid on, Lead's 3/9 line on, everything else off), so the default picture matches what V6 users know. They're just grouped out of sight.
- **Toggles are remembered** in this browser (`app.storage`): which panels are open and which layers and tools are on. A "Reset layout" in the Layers menu goes back to the defaults. They aren't saved in the debrief file, which carries the flight, DFPs and standards, so a student opening an instructor's file sees their own layout.
- **Room for later tools:** the Tools menu is a list, and each tool is a panel that opens below or beside the stage without covering it. Patrick's future features (synced graphs FF16, event bookmarks, geometry readouts FF18, drawing over the replay) would each be one more entry there, and none is built now.
- The detail panels are collapsible sections (ui-kit `panel.js`, real buttons with `aria-expanded`), so they work from the keyboard and with screen readers.

The columns themselves stay as before: three at 1366 × 768 and up, none covering another (R2), collapsed with a real button (ui-kit `panel.js`), with no side rails and no Tab-key tricks (#34, #35). The right column can be collapsed for a map-only view.

- **The stage** holds the view switch and one **playback bar** shared by both views. The bar has Play, Pause, Reset, step ±1 s, speed 0.25× to 16×, a scrubber with 1 s steps across the whole flight (not V6's fixed 1,000 steps, #23), and the time in Zulu and local via `app.time` (R10, D18). The 3D view gets real playback controls, which V6 lacked (#26).
- **Switching views** keeps the time, playing state, selected ship and DFPs. The 3D view is never blank: it shows the same "load a flight" empty state as the map (R12).
- **The EM chart** (from Tools) opens in a panel below the stage, which shrinks the stage without covering it (#37). It never floats over the map, and it's off by default.
- **Keyboard** (through `app.keys`, only while the debrief is open and never while typing): Space plays or pauses, ← and → step 1 s, Home resets. Tab moves between controls as normal.
- **Resizing** a panel or the window resizes the canvas (a `ResizeObserver` on the stage, #36).
- **Ship colours:** #1 blue, #2 green, #3 red as in V6. **#4 changes from near-black (#050505) to white with a dark outline** (#29), in every place #4 is drawn. Every ship also carries its number, so colour is never the only signal.

## What V6 does, and what the rebuild keeps

### Loading and status (R11)

| V6 | Rebuild |
|---|---|
| Four file inputs and "Load Tracks". Load wipes what's loaded before checking (#23). | One "Load tracks" picker taking up to 4 files, each assigned to #1 to #4 in a small table the user can reorder. All or nothing, with the file and reason on failure (D54). |
| "Load Example Flight" with the nicknames ED2F5, 60DF66, 8738A6C9 and 083AC. | Kept, with the nicknames (D22). The example files download only when asked for (R5). |
| Status hard-codes "#3 not loaded" (#23). | The status comes from what actually loaded: per track, the name, fixes, time span, fixes dropped and why, gaps and the longest one, and any track cut to the common window (D49 to D53). |
| The map isn't fitted and the zoom slider can't reach the whole sortie (#23). | Load fits the whole flight to the view. A "Fit" button does it again. Zoom covers from the whole sortie (about 50 NM) down to about 500 ft across. |
| "Clear" leaves status, file inputs and DFPs behind (#23, #25). | "Close flight" clears everything of that flight, after asking if it has unsaved DFPs. |
| "Download Examples" fires four downloads at once, and #2 saves as `.kml.xml` (#28). | A short list of the four example files, each a normal download link with a `.kml` name. |

### 2D map

Kept from V6: tracks with trail modes (full, history, last 60 s), spacing lines, 5,000 ft grid, Esri satellite imagery, the two embedded VNC charts (South and North) with opacity and fine alignment, the 19 built-in route overlays (TACNAV 1 to 4, North and South A/B/ED routes, Stds and TAC test routes) with opacity, Lead and #3 3/9 lines, the fighting-wing cone, clock marks, the safety bubble with its radius, "follow lead", DFP flags, the T-6 silhouette and each ship's standards label. Pan by dragging and zoom with the wheel.

Changes:

- **Everything redraws when it changes, playing or paused.** V6 ignored Clock Marks and the Fighting Wing Cone while paused (#26). The map draws only when something changed (time, view, layer, size), instead of every frame, so a paused debrief uses no CPU (#43).
- **Gaps** break the track line, and while a ship is in a gap its readouts show "GPS gap" instead of numbers (D32).
- **Unknown heading** (not moving, D52): no 3/9 line, cone or silhouette direction for that ship, and its aspect, HCA and label show "–".
- **Satellite tiles** carry Esri's attribution, failed tiles are retried, and a tile repaints only its own area (#28). With no network the map says "satellite imagery needs a connection" and shows the grid.
- **VNC charts** load only when turned on (R5). Each warped chart is drawn once into an off-screen image per alignment, not re-warped on every frame (#43). The chart layer carries "Not for navigation", because its alignment is a hand-tuned fit (#43).
- **Label colours** work: a ship on parameters shows green, not V6's colour that never matched (#21).

Removed (R3), since they never worked or are replaced:

| V6 control | Why it goes |
|---|---|
| "3D altitude view" in the map's view menu | Replaced by the real 3D view. Its bubble, grid and silhouettes were drawn at the wrong place (#27). |
| External VNC tile URL box | Has no default, so it only ever shows a warning; a free-text URL is also a way to load outside content. |
| Synthetic error injector and raw-vs-error ghosts | Their panel doesn't exist in V6's page and the drawing is behind `if (false)`. This is also why D42's Wide/Tight fix has nothing to change in the debrief: the classifier uses the unsigned interval. |
| "Auto-hide panels" on Play | Added three times; the debrief copy did nothing (#38). |
| Side rails, "Collapse/Expand sections", Tab and Shift+Tab | Replaced by collapsible panels (#34, #35). |

### 3D view

Kept from V6: camera Follow Lead or Centre Formation, yaw, pitch and zoom (sliders and mouse drag and wheel), vertical exaggeration, T-6 or flat-marker model, plane size, attitude labels (bank and pitch), trail length, landscape, ground reference with ground datum (lowest altitude minus 500 ft, field elevation, or sea level), grid, altitude sticks, altitude scale, Reset view.

Changes:

- **Bank (D40)**: from the real turn rate over the same 3 s window as est. G (the heading change from t−1.5 s to t+1.5 s, so bank and G agree and neither flickers against the other; verification M2, a judgement call logged for review; wings level wherever est. G is unknown, such as a window touching a GPS gap or a G above 7, audit of #194), the correct wing down, and set from recorded G only in level turns: the nose within 10° of the horizon and the heading changing by more than 1° a second (Patrick, item G). **Recorded bank** is used when the track has it (D47). V6's bank is pinned first, then D40 lands as its own change (D10); M2 moved the turn rate onto the G window with the example flight's #2 at start+1676 to +1688 pinned before and after (`tests/unit/debrief/readouts.test.js`). The old ±1 s chord rate stays in `bankFromTrack` when no turn rate is passed, and the V6 golden pins on it are unchanged.
- **Pitch** uses the track's recorded pitch or `flight-data`'s estimate. V6's 3D view could never reach the estimate and drew 0° (#19 finding). Pitch is drawn as the nose rising or falling, not as the whole aircraft sliding up the screen (#27).
- **Drawing order**: near aircraft are drawn over far ones (#27).
- **One ground**: the grid, landscape, datum plane and north/east arrows sit on the chosen datum and stay fixed to the ground, so the ground moves under the formation. "AGL" labels say "above datum" unless the datum is the field (#27).
- **Vertical exaggeration** keeps V6's default of 2× and shows "Altitude ×2" on the view, since V6 hid it (#26).
- **"Free orbit"** is removed: in V6 it is the same as Centre Formation (#26).
- **Altitude sticks** work with both models and drop to the datum (#26).
- **Readouts** are the same right-hand panel as the map, not the thinner 3D list.
- The 3D view has its own playback bar (the shared one), and stops drawing when the debrief is closed or the other view is showing (#39).
- **Drawn with three.js (D138, D141).** The picture (sky, ground, datum plane, grid, trails, sticks and aircraft) is three.js on a WebGL canvas. The labels, altitude ruler, heights, compass, caption, tennis ball, the dot for a ship with no heading and the hollow marker for a ship in a GPS gap are drawn flat over it (`view3d/overlay.js`), placed with `projectPoint`. The aircraft is ui-kit's CT-156 Harvard in the Moose Jaw paint with the ship's colour on the fin and its number on the tail and nose; **Paint: Ship colours** in 3D settings gives the plain look. If three.js can't load (offline on the first visit) or the browser has no WebGL 2 (three.js needs it; the view asks first so three.js is never fetched for nothing), the debrief says so and stays in 2D.

### Readouts and standards (R9, R18)

The right column shows, for the current time, the same panels in both views. By default only the Formation card, DFPs and the headings of the rest are open (see The screen):

- **Live data**: per ship, altitude, ground speed, **est. IAS** (D31), G and pitch and bank, each marked "recorded" or "est." (D47). Pitch and G are worked out from the track's own motion by default, because the iPad's recorded pitch and G look like the tablet tilting; recorded bank is still used (D47, Patrick answering Q32). If `flight-data` later adds an option to reference the iPad's attitude to a straight-and-level or on-the-runway baseline, the debrief shows it as a setting, and latitude/longitude (interpolated, D51).
- **Aspect, HCA and closure versus Lead**, and **spacing** for every pair. Each range says whether it is **horizontal** or **3D** (#18, SPEC.md). The numbers stay V6's (D29).
- **Standards**, in the closed **Debrief settings** menu (ui-kit `createSettingsMenu`, R22): the spread, offset and lead standards, editable, with a one-click reset to the default preset (R18, D23). The default preset is the SMM's (D114 to D116, core's `DEFAULT_STANDARDS`): spread 4,000 to 6,000 ft with 0 to 10° of sweep behind the 3/9 line of the aircraft the interval is measured from ("AFT by 7°"), #3 7,000 ± 1,000 ft back, and Lead 220 kt in the low block and 200 kt in the mid block, the target picked from Lead's altitude and shown on the Lead line. V6's values stay in core as `V6_STANDARDS`, pinned by the golden tests. They are saved with the module's settings and in the debrief file.
- **Lead desired parameters** compare **est. IAS** with the target (V6's 200 kt; the SMM's 220 low / 200 mid, D115), not ground speed (D31).
- **No verdicts on the ground (verification M1(a); a judgement call logged for review).** While Lead's est. IAS is under 80 kt (`AIRBORNE_IAS_KT` in `readouts.js`: on the ramp or taxiing), no wingman gets a standards label (the card says "Lead under 80 kt": est. IAS comes from ground speed, so a steep pull-up can dip under it in the air too; audit of #194, logged for review) and Lead's line shows its numbers with no FAST, SLOW or G verdict.
- **Lead is judged only inside the blocks (verification M1(b); a judgement call logged for review).** From 6,000 ft MSL (the Low block's floor) to 15,500 ft (the Mid block's ceiling), Gen Book p.12 (`LOW_BLOCK_FLOOR_FT`, `MID_BLOCK_CEILING_FT` in `readouts.js`); which target applies inside stays core's `lowBlockTopFt`. Below or above, Lead's line says "not judged: below the low block" or "not judged: above the mid block", with no verdict at all (no FAST, SLOW, LOW G or HIGH G). The gate runs before core's `classifyLeadParameters`, which is unchanged.

Standards fixes from #21 (the classifier itself is `core/standards.js`, core PR 3):

- A ship with no standard that applies to it shows no label, instead of "ON PARAMETERS".
- The on-map label turns green when on parameters.
- **#3 is judged by two standards at once** when both are on: spread says within ±250 ft of Lead's 3/9, offset says 8,000 ft aft, so #3 can never be on parameters. **Decided (D78, Q39): when the offset standard is on, it alone judges #3's fore/aft, and the spread standard still judges its interval.** `core`'s `standards.js` makes the change with V6 pinned first; the debrief's #3 labels follow once that's on main.

### EM chart

V6's EM card: IAS against turn rate over the T-6 EM chart for 6,500, 8,000 or 13,000 ft (chosen automatically from the formation's altitude, or by hand), with a fading 60 s trail per ship. Kept, with:

- Turn rate without V6's divide by 2 (D39, already landed in core PR 2).
- The three chart images (about 0.9 MB) load only when the EM chart opens (R5).
- The chart never covers the map (#37), and stops drawing when closed (#39).

### Tennis ball (#19, Q33 to Q37)

V6 has two solvers that disagree and write to the same readout, and its controls live only in the 3D tab. The rebuild shows **one** solution, drawn in both views. It's off by default and opened from Tools; its controls sit in its own panel.

Patrick answered Q33 to Q37 (2026-09-30):

| Question | Answer | Note |
|---|---|---|
| Q33 | The ball carries the shooter's full velocity, climb included. | As V6's 3D solver. |
| Q34 | The target flies its recorded path. | The debrief is a replay, so the track ahead is known. |
| Q35 | "Cone width" means ±3°. | Confirmed by Patrick (D77). |
| Q36 | INTERCEPT needs the target inside the cone. | Confirmed by Patrick (D77). |
| Q37 | The target's climb or descent counts. | Follows from Q34. |

`core` makes these changes after core PR 2 (#61), each as its own tested change against the pinned V6 solvers (D10). The debrief calls that one solver. The cone half-width and the "INTERCEPT needs the cone" rule are named settings in one place, so either is a one-line change if it's ever revisited. Until `core`'s change lands, the screen isn't built, so it never shows V6's two solvers side by side.

### DFPs (R17, #25)

Debrief focus points belong to the flight, not to the browser:

- Add a DFP at the current time (it records the time and Lead's position), label it, write a note, go to it, delete it, and step to the previous or next DFP **in time order**.
- Labels are unique ("DFP 1", "DFP 2" …, renumbered by time) unless the user renames them.
- Labels and notes are shown with `textContent` only.
- While a flight is open, its DFPs are also kept in the browser (`app.storage`, keyed by a fingerprint of the loaded tracks), so a reload doesn't lose them. They are never shown on a different flight.
- **Save debrief** writes the `flight-data` debrief file (tracks, DFPs and settings). **Open debrief** reads one back, exactly as it was (R17). Saving and opening the file goes through `storage/file.js`.

### CSV export (#28)

One file, one row per second across the common window, with each ship's columns side by side: time (Zulu), latitude, longitude, altitude, ground speed, est. IAS, heading, G, pitch and bank with their sources, and a gap flag. The button is disabled with no flight loaded, and the download link is released after use.

### Weather at the time of the flight (Patrick chose the scope 2026-09-30 06:42Z and approved this section 07:21Z, "Approved")

Patrick asked for "the historical METAR of the nearest airfield as well as overlays for radar/satellite … toggleable on the replay", and chose "Plus saved radar". Every layer is display only: it changes no flight math and no readout.

**On the screen (R22).** A **Weather** menu beside Layers, with every item off by default, remembered in the layout like the other layers:

| Toggle | What it shows | Source (no key, read by the browser, no proxy, D69) | How far back |
|---|---|---|---|
| METAR | The report in force at the playback time, from the airfield nearest the formation (nearest to Lead, from `app.airfields`; any other airfield can be picked). It shows as one line under the playback bar, decoded by `src/wx` (`parseMetar`, `flightCategory`), with the raw text a click away. The scrubber gets a small tick at each new report or SPECI. | Iowa Environmental Mesonet METAR archive (to be confirmed for CYMJ and browser access; if it fails, METARs saved with the debrief as below) | Years |
| Satellite | The GOES-West picture at or before the playback time, over the base map and under the tracks: GeoColor (colour by day, infrared-based at night) or infrared alone. The line under the map gives its time and age, for example "Satellite 14:30Z, 2 min before". | NASA GIBS WMTS tiles (GeoColor to zoom 7, infrared to zoom 6, 10-minute steps) | About 90 days. Older flights say "Satellite not kept" (live only, Patrick 2026-09-30 08:03Z) |
| Winds aloft | Model wind at Lead's altitude on the Lead line of the Formation card ("model wind 270°T/25 kt at 8,500 ft (HRDPS 14Z, Open-Meteo)": true direction, knots, and marked as a model value, not an observation), and wind arrows on the map at a height you choose. The wind is taken at Lead's position halfway through the flight, from the model hour at or before the moment, blended as a vector between the pressure levels either side of Lead's altitude (950 to 300 hPa, about 1,800 to 30,000 ft). The request sends Open-Meteo the flight's dates and that one position, rounded to 0.01° (about 1 km), and nothing else. **Wind model** picks HRDPS (default) or HRRR; a flight older than HRDPS's archive uses HRRR. | Open-Meteo historical forecast (Canada's HRDPS 2.5 km, or HRRR, the model Herbie reads), pressure levels, hourly | HRDPS since 2023-03-03, HRRR since 2018 |
| Radar | ECCC's 1 km radar composite (rain or snow) under the tracks, the frame nearest the playback time with its time and age. | ECCC GeoMet, **saved into the debrief** (below) | Only 3 hours live |
| Lightning | ECCC's lightning density, as the SOF shows it. | ECCC GeoMet, saved into the debrief | Only 3 hours live |

**Saved radar and lightning.** ECCC keeps only the last 3 hours (RainViewer 2), so these can't be fetched later. When a flight is loaded and its end is less than 3 hours ago, the debrief offers "Save radar and lightning with this debrief". It fetches every frame covering the flight window around the formation and keeps them with the flight. **Save debrief** then writes them into the file, and opening the file plays them back with no network. When the flight is older, the Radar and Lightning items say "Not kept: radar is only available for 3 hours after the flight." Satellite pictures are not saved (Patrick chose "Live only" at 08:03Z). Cloud and visibility come from the METARs only; the model gives winds aloft only (Patrick chose "Drop it" at 08:03Z, as Open-Meteo has no cloud base and HRDPS no visibility). The METARs and model winds shown are saved in the file too, so a saved debrief shows the same weather offline and years later.

**Against the timeline.** Each layer shows the slice nearest the playback time and never one from the future beyond a small step: satellite and radar take the last frame at or before the moment, METARs the report in force, model values the hour at or before the moment. Each slice carries its own time, so no picture is mistaken for the exact moment. Scrubbing changes the slice at once; playing fetches frames just ahead so it doesn't stall.

**Limits kept.** Frames are fetched only while their toggle is on (R5), cached for the session, and cut off at a size limit per debrief file (to be set with the flight-data thread). A source that fails says so in the layer's corner and leaves the rest working.

**Who owns what.**
- The debrief owns the Weather menu, the time slicing and the drawing: `src/modules/debrief/weather/`.
- `src/wx` (Weather parser thread) owns METAR decoding. No new parser.
- The raster layers (radar, lightning, satellite) are the same the SOF shows, so their tile and WMS loading goes to `src/ui-kit/` through the app frame, like the tile loader.
- Adding weather to the debrief file is a change to `flight-data`'s file format, so it goes through the coordinator to the owner of `src/flight-data/`.
- The new hosts (NASA GIBS, Open-Meteo, IEM, ECCC GeoMet) join the site's CSP through the app frame.

**Checks at build start** (done 2026-09-30 07:35Z to 07:51Z; results in the project's wx-sources notes): every source answers a browser on the live site's address with no key (`Access-Control-Allow-Origin: *`). IEM has CYMJ back to 2003 or earlier (no reports overnight, about 00:30Z to 10:00Z). GIBS keeps GOES-West frames for about 90 days. ECCC keeps 3 hours, needs the exact frame TIME, and answers a missing one with 200 and XML, so the content type is checked.

**Skills used:** spec-driven-development, incremental-implementation, test-driven-development (the time slicing and nearest-airfield pick are pure and tested in Node), frontend-ui-engineering, security-and-hardening (outside data shown only as text or images), performance-optimization (frames fetched only when on).

## Module structure

```
src/modules/debrief/
  README.md          what's where, and how to change common things (R8)
  index.js           mount(root, app): builds the screen, wires state to views; unmount cleans up
  state.js           the debrief state (flight, view, time, settings, DFPs) and its changes; no page access
  layout.js          the three columns, panels and playback bar
  playback-bar.js    controls bound to the flight-data clock
  map2d/
    view.js          canvas, pan and zoom, redraw-on-change
    layers.js        tracks, grid, spacing lines, 3/9, cone, clock marks, bubble, DFP flags, labels
    vnc.js           embedded VNC charts: bounds, warp mesh, off-screen cache
    overlays.js      the built-in route overlays
  view3d/
    scene.js         projection, depth order, ground datum, attitude: pure functions, tested
    view.js          the three.js picture (loaded when 3D is first shown)
    overlay.js       labels, ruler, compass, tennis ball drawn flat over it
    input.js         drag to orbit, wheel and keys to zoom
  readouts.js        builds the readout rows from core results; no page access
  standards-panel.js
  em.js              the EM chart
  tennis-panel.js
  dfp.js             DFP list operations (add, sort, label, fingerprint); no page access
  export-csv.js      the CSV rows; no page access
  weather/           the Weather menu: time slices (pure), the METAR line, winds aloft, saved radar
  data/cymj.js       field elevation, VNC anchor, route overlays (moves to airfields later)
  debrief.css        scoped under [data-module="debrief"]
public/media/debrief/   VNC chart and EM chart images
```

Pure pieces (`state`, `readouts`, `dfp`, `export-csv`, `view3d/scene`, the VNC warp) take plain values and return plain values, so they're tested in Node. Drawing files stay thin.

## Performance (R5, smooth playback)

Following `.claude/skills/performance-optimization`: measure first, one change at a time, and log each attempt in the PR.

- The debrief's code loads only when its card is opened. The example tracks (about 11 MB), VNC charts (about 9.7 MB as V6's PNGs) and EM images (about 0.9 MB) load only when asked for.
- Targets on the example flight at 1920 × 1080, measured with `npm run build` and `npm run preview`: playback at 16× keeps 60 frames per second on a mid-range laptop, and a paused debrief draws nothing.
- Track points are projected once per load and view change, not every frame. The VNC warp is cached. Readouts update at most 10 times a second.
- Whether to re-encode the VNC chart PNGs (for example as WebP) is decided by measurement and a side-by-side look, and asked first if it changes how they look.

## Security (untrusted files)

Following `.claude/skills/security-and-hardening`. Files are checked where they come in by `flight-data` (sizes, shapes, no entities, all or nothing). In the debrief:

- Nothing from a file reaches `innerHTML`: track names, DFP labels, notes and status text go in through `textContent` or ui-kit `h()`.
- Map tiles come from one fixed Esri address, built from numbers only. There's no user-entered URL.
- Route overlays are built into the code, not loaded from outside.
- A debrief file's settings are checked field by field before use (the standards must be finite and in range, per the ui-kit number-control rule).

## Commands

```
npm run dev                 # the debrief at http://localhost:5173/#/debrief
npm test                    # unit and golden tests
npm run test:e2e            # browser tests
python3 tools/rebuild_original.py /tmp/v6.html   # V6, to compare side by side
```

## Code style

As in `core` and `flight-data`: plain ES modules, pure functions where possible, units in names, and a comment naming the V6 line each ported piece came from.

```js
// src/modules/debrief/view3d/scene.js
/** Screen position of a world point for the 3D camera (V6 project, line 3584). */
export function projectPoint(pt, camera) { ... }
```

## Testing strategy

1. **Golden first (D10).** The debrief's own V6 drawing math is pinned before it moves, with V6's code run in Node through `tests/golden/v6-source.js`: the map's world-to-screen transform, the VNC warp, the 3D projection and attitude (bank and pitch), and the CSV rows. Changes (D40, the #27 drawing fixes, the CSV layout) then land as separate commits that update the pinned value on purpose.
2. **Unit tests** (`tests/unit/debrief/`, Node) for the pure pieces: DFP sorting, labels and fingerprints; readout rows (gap, unknown heading, recorded vs est.); standards labels (#21); the state's view switch keeping time and play state; CSV alignment.
3. **Browser tests** (`tests/e2e/debrief.spec.js`, Playwright, failing on any console error, R7):
   - Load the example flight: fitted to view, correct status (R11).
   - Switch 2D/3D while playing: same time, 3D not blank (R12).
   - Overlap scan at 1366 × 768 and 1920 × 1080 with every panel open, and with the EM chart open (R2).
   - Click-through: every button does something (R3). Clock Marks and the cone redraw while paused (#26).
   - Leave the debrief: no frames, timers or listeners left (R4).
   - Save a debrief with DFPs, close it, open the file: same tracks, DFPs, standards and time (R17).
   - Edit a standard, reload, reset (R18).
   - A first visit shows only the essentials (tracks, status line, playback bar, Formation card, DFPs); opened panels, layers and tools come back after a reload, and Reset layout restores the defaults.
   - Offline after one visit: the debrief opens and the example flight plays if it was loaded before (R6).
   - A hostile file (script in the name, 10 MB note): shown as plain text or refused.

   The debrief owns `tests/e2e/debrief.spec.js` and `docs/checklists/debrief.md` as new files (agreed with the app-frame thread, which owns the rest of `tests/e2e/`).
4. **Sign-off checklist** `docs/checklists/debrief.md` (R21): load your own ForeFlight tracks, play, switch views, add and save DFPs, reopen the file, check #4 is visible, compare a few numbers with V6 side by side.

## Boundaries

- **Always:** read the flight from `flight-data` and every number from `core`; pin V6 before changing a number or a drawing; keep the module inside `src/modules/debrief/`; run `npm test` before each commit.
- **Ask first:** any change to a number V6 shows beyond D31, D39, D40, D47 and D49 to D54; any tennis-ball rule beyond Patrick's answers to Q33 to Q37; changing the default standards; adding a package (including any 3D library); a new outside data source.
- **Never:** edit `original/`, `src/core/` or `src/flight-data/` (changes go to their threads through the coordinator); put file content into `innerHTML`; keep a timer or animation loop outside the ui-kit scheduler.

## Success criteria

- R11, R12, R17 and R18 each pass their browser test, and R2, R3, R4 and R7 pass on the debrief route.
- The golden tests pass for V6's behaviour, and each approved change (D31, D39, D40, D47, #21, #27) is its own tested commit.
- Issues #21 and #23 to #29 are closed by the change that fixes them, and the debrief parts of #19, #34 to #39 and #43 are gone.
- Patrick (or anyone, D28) signs off the checklist on the live site.

## Plan (after approval)

The tasks go in `tasks/debrief/` once this spec is approved. The expected order, each slice working on its own:

1. Screen, load, status, 2D tracks, playback bar and fit-to-view.
2. Readouts and standards.
3. DFPs, save and open.
4. Map layers: satellite, VNC charts, route overlays, 3/9, cone, clock marks, bubble.
5. The 3D view (V6 pinned, then D40 and the #27 fixes).
6. EM chart, tennis ball, CSV export.
7. Weather at the time of the flight (approved 07:21Z).

It needs, from other threads: ui-kit `controls.js` and `canvas-view.js` before slice 1, `standards.js` (core PR 3) before slice 2, and `core`'s tennis-ball changes (Q33 to Q37) before slice 6.

## Open questions

1. **#4's new colour:** white with a dark outline. Say if you'd prefer another (for example yellow).
