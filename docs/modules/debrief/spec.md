> **Note (reset, 4 Oct 2026):** this is the spec as it stood before the reset, moved here unchanged. It is refreshed against this module's new `requirements.md` and `decisions.md` when the module's work resumes. Where it disagrees with them, they win. Lines saying the code must give "the same answer V6 gives" or must match V6 are replaced: flight math is checked against the manuals and standard aerodynamics (ALL-R22, Patrick's answer Q-ALL-4).
>
> **Replaced old decisions:** this spec still cites D6, D10, D23, D29, which are no longer in force. The "Replaced old decisions" section of `../../DECISIONS.md` says what took each one's place.

# Debrief spec

This module's spec is made of 2 old specs, one section each: `archive/specs/SPEC-debrief.md`, `archive/specs/SPEC-flight-data.md`.

## From `archive/specs/SPEC-debrief.md`

## Spec: `debrief`, the debrief screen (2D map and 3D view)

Status: **approved by Patrick on 2026-09-30** ("spec-debreif-approved", in the Debrief screen thread), including his answers to Q32 to Q37 (Q32 read as pitch and G from the track's motion), #4 drawn white with a dark outline, and the trims listed below. The essentials-first screen in The screen (R22) was approved by Patrick on 2026-09-30 ("ok"). Changes go through a pull request. Module id `debrief` in [`archive/SPEC.md`](../../../archive/SPEC.md). Requirement IDs (R#), decisions (D#) and questions (Q#) refer to the plan doc: https://claude.ai/code/artifact/29712036-a126-43c3-ac39-57ba919ff102

The build starts once flight data (PR #58) and flight math core part 2 (PR #61) are merged.

### Objective

One screen to debrief a formation sortie. Load up to four ForeFlight tracks (or the example flight) once, then replay them on a 2D map or in a 3D view with a single switch, at the same moment, with the same readouts (D16, R11, R12).

V6 spread this over two tabs, a floating EM card and a tennis-ball card that lived in the wrong tab. They kept four clocks, drew over each other's controls, and kept running when hidden (#19, #21 to #29, #34 to #39). The rebuild is one module, mounted and unmounted by the shell, reading one flight model and one clock from `flight-data` (R4).

Users are T-6 instructors and students in a debrief, on a desktop or laptop (D6). They should be able to:

1. Load their tracks, see the whole sortie fitted to the screen, and read a correct status line (R11).
2. Play, pause, scrub and step through the flight, with times in Zulu and local (R10).
3. Flip between the 2D map and the 3D view without losing their place (R12).
4. Read spacing, fore/aft, aspect, HCA, closure, speed and G for each ship, judged against editable standards (R9, R18).
5. Mark debrief focus points (DFPs), write notes, and save the whole debrief to a file that reopens exactly as it was (R17, D21).

### Assumptions

1. `flight-data` owns loading, cleaning, the flight model, the clock and the debrief file format ([`SPEC-flight-data.md`](../../../archive/specs/SPEC-flight-data.md)). The debrief never parses KML or keeps a clock of its own.
2. `core` owns every number: aspect, HCA, closure, estimated G, the EM point, the tennis-ball solver and (in core PR 3) the standards classifier. The debrief picks the moments, calls `core`, and draws the answer.
3. The 3D view is drawn with **three.js** (Patrick approved 2026-09-30 07:41Z, D138), using ui-kit's shared CT-156 Harvard model and `matchProjection` camera, which lands every point where `scene.js` `projectPoint` puts it. three.js downloads only when 3D is first shown (D141). Before that, the view was hand-drawn on a Canvas 2D, as V6's was.
4. Map imagery (Esri satellite tiles) needs the network. Everything else, including the VNC charts once viewed, works offline (R6).
5. Until `airfields` lands, CYMJ values the debrief needs (field elevation 1,892 ft, the VNC chart anchor, the 19 route overlays) sit in one file, `src/modules/debrief/data/cymj.js`, so they move to `airfields` in one step (R16).
6. The ui-kit's `controls.js` (inputs bound to settings) and `canvas-view.js` (pan and zoom) are written for this module, by the app-frame thread, which owns `src/ui-kit/`. The debrief is their first user.

### The screen

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
| | **3D camera bar** (over the bottom of the 3D picture, DB-22): Overview, Chase, Cockpit with aim, ship and seat pills |
| | **3D settings** (in 3D only): altitude ×, model, plane size, labels, trail, ground and grid options, Reset view |

- **Layers keep V6's on/off defaults** (tracks full, spacing lines and grid on, Lead's 3/9 line on, everything else off), so the default picture matches what V6 users know. They're just grouped out of sight.
- **Toggles are remembered** in this browser (`app.storage`): which panels are open and which layers and tools are on. A "Reset layout" in the Layers menu goes back to the defaults. They aren't saved in the debrief file, which carries the flight, DFPs and standards, so a student opening an instructor's file sees their own layout.
- **Room for later tools:** the Tools menu is a list, and each tool is a panel that opens below or beside the stage without covering it. Patrick's future features (synced graphs FF16, event bookmarks, geometry readouts FF18, drawing over the replay) would each be one more entry there, and none is built now.
- The detail panels are collapsible sections (ui-kit `panel.js`, real buttons with `aria-expanded`), so they work from the keyboard and with screen readers.

The columns themselves stay as before: three at 1366 × 768 and up, none covering another (R2), collapsed with a real button (ui-kit `panel.js`), with no side rails and no Tab-key tricks (#34, #35). The right column can be collapsed for a map-only view.

- **The stage** holds the view switch and one **playback bar** shared by both views. The bar has Play, Pause, Reset, step ±1 s, speed 0.25× to 16×, a scrubber with 1 s steps across the whole flight (not V6's fixed 1,000 steps, #23), and the time in Zulu and local via `app.time` (R10, D18). The 3D view gets real playback controls, which V6 lacked (#26).
- **Switching views** keeps the time, playing state, selected ship and DFPs. The 3D view is never blank: it shows the same "load a flight" empty state as the map (R12).
- **Toolbar menus stay over the map (RC-1, D183).** From the 1280 px floor up, an open menu (Layers, Routes and charts, Weather, Tools, 3D settings) is no wider than the map and opens leftward from its button when it would pass the map's right edge, so it never scrolls the page sideways, leaves the window, or covers a control in the Flight or Formation column. An open menu is placed again when the map or toolbar changes size (a column opened, a window resize) or the view switches from the keyboard. Tested at 1280, 1366 and 1440, each menu in 2D and in 3D. The Weather menu is the tallest, so it is packed closer (no space under each control, wider columns from 1280 px, each item's own controls and status line in its cell), and with a flight under 3 hours old and every item ticked it ends above the map's bottom with no scroll of its own at 1280 × 720 and 1366 × 768 (tested, recent and old flights: the verification re-check of #224, F1). The line under the map is drawn under an open menu, never over it.
- **When 3D can't start (RC-3)**, the message (no WebGL 2, or three.js didn't load) shows in the toolbar under the 2D | 3D switch as an alert, not in the red file-error line in the Flight column. It clears when 3D is tried again.
- **The EM chart** (from Tools) opens in a panel below the stage, which shrinks the stage without covering it (#37). It never floats over the map, and it's off by default.
- **Keyboard** (through `app.keys`, only while the debrief is open and never while typing): Space plays or pauses, ← and → step 1 s, Home resets. Tab moves between controls as normal.
- **Resizing** a panel or the window resizes the canvas (a `ResizeObserver` on the stage, #36).
- **Ship colours:** #1 blue, #2 green, #3 red as in V6. **#4 changes from near-black (#050505) to white with a dark outline** (#29), in every place #4 is drawn. Every ship also carries its number, so colour is never the only signal.

### What V6 does, and what the rebuild keeps

#### Loading and status (R11)

| V6 | Rebuild |
|---|---|
| Four file inputs and "Load Tracks". Load wipes what's loaded before checking (#23). | One "Load tracks" picker taking up to 4 files, each assigned to #1 to #4 in a small table the user can reorder. All or nothing, with the file and reason on failure (D54). |
| "Load Example Flight" with the nicknames ED2F5, 60DF66, 8738A6C9 and 083AC. | Kept, with the nicknames (D22). The example files download only when asked for (R5). |
| Status hard-codes "#3 not loaded" (#23). | The status comes from what actually loaded: per track, the name, fixes, time span, fixes dropped and why, gaps and the longest one, and any track cut to the common window (D49 to D53). |
| The map isn't fitted and the zoom slider can't reach the whole sortie (#23). | Load fits the whole flight to the view. A "Fit" button does it again. Zoom covers from the whole sortie (about 50 NM) down to about 500 ft across. |
| "Clear" leaves status, file inputs and DFPs behind (#23, #25). | "Close flight" clears everything of that flight, after asking if it has unsaved DFPs. |
| "Download Examples" fires four downloads at once, and #2 saves as `.kml.xml` (#28). | A short list of the four example files, each a normal download link with a `.kml` name. |

#### 2D map

Kept from V6: tracks with trail modes (full, history, last 60 s), spacing lines, 5,000 ft grid, Esri satellite imagery, the two embedded VNC charts (South and North) with opacity and fine alignment, the 19 built-in route overlays (TACNAV 1 to 4, North and South A/B/ED routes, Stds and TAC test routes) with opacity, Lead and #3 3/9 lines, the fighting-wing cone, clock marks, the safety bubble with its radius, "follow lead", DFP flags, the T-6 silhouette and each ship's standards label. Pan by dragging and zoom with the wheel.

Changes:

- **Everything redraws when it changes, playing or paused.** V6 ignored Clock Marks and the Fighting Wing Cone while paused (#26). The map draws only when something changed (time, view, layer, size), instead of every frame, so a paused debrief uses no CPU (#43).
- **Gaps** break the track line, and while a ship is in a gap its readouts show "GPS gap" instead of numbers (D32). With **Fill GPS gaps (estimate)** on (the default, DB-20), each gap that can be flown is drawn as a dotted best-guess line inside a shaded zone in the ship's colour, under the tracks, and the ship rides it as a hollow marker tagged "est."; the readouts still say "GPS gap" (see GPS gap fill below).
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

#### 3D view

Kept from V6: camera Follow Lead or Centre Formation, yaw, pitch and zoom (sliders and mouse drag and wheel), vertical exaggeration, T-6 or flat-marker model, plane size, attitude labels (bank and pitch), trail length, landscape, ground reference with ground datum (lowest altitude minus 500 ft, field elevation, or sea level), grid, altitude sticks, altitude scale, Reset view.

Changes:

- **Bank (D40)**: from the real turn rate over the same 3 s window as est. G (the heading change from t−1.5 s to t+1.5 s, and the same window's ground speed (the chord from t−1.5 s to t+1.5 s over 3 s, the speed est. G uses, not the one-second segment's), so bank and G agree to within 1° (|bank − acos(1/G)|, final verification F3) and neither flickers against the other; verification M2, a judgement call logged for review; wings level wherever est. G is unknown, such as a window touching a GPS gap or a G above 7, audit of #194; the card and the 3D label then say "bank --", not 0°, verification re-check N2), the correct wing down, and set from recorded G only in level turns: the nose within 10° of the horizon and the heading changing by more than 1° a second (Patrick, item G). **Recorded bank** is used when the track has it (D47). V6's bank is pinned first, then D40 lands as its own change (D10); M2 moved the turn rate onto the G window with the example flight's #2 at start+1676 to +1688 pinned before and after (`tests/unit/debrief/readouts.test.js`). The old ±1 s chord rate stays in `bankFromTrack` when no turn rate is passed, and the V6 golden pins on it are unchanged.
- **Pitch** uses the track's recorded pitch or `flight-data`'s estimate. V6's 3D view could never reach the estimate and drew 0° (#19 finding). Pitch is drawn as the nose rising or falling, not as the whole aircraft sliding up the screen (#27).
- **Drawing order**: near aircraft are drawn over far ones (#27).
- **One ground**: the grid, landscape, datum plane and north/east arrows sit on the chosen datum and stay fixed to the ground, so the ground moves under the formation. "AGL" labels say "above datum" unless the datum is the field (#27).
- **Vertical exaggeration** keeps V6's default of 2× and shows "Altitude ×2" on the view, since V6 hid it (#26).
- **"Free orbit"** is removed: in V6 it is the same as Centre Formation (#26).
- **Altitude sticks** work with both models and drop to the datum (#26).
- **Readouts** are the same right-hand panel as the map, not the thinner 3D list.
- The 3D view has its own playback bar (the shared one), and stops drawing when the debrief is closed or the other view is showing (#39).
- **Camera bar (DB-22, wording not yet confirmed with Patrick).** Over the bottom of the 3D picture (once a flight is loaded), laid out as the Traffic sim's: a row of **mount** pills (**Overview**, **Chase**, **Cockpit**), then the pills that belong to the mount, a line of key hints and a note. **Overview**: Follow Lead or Centre formation. **Chase** and **Cockpit**: the aim (**Boresight**, which Chase calls Trail, looks straight ahead or behind; **Freelook**, called Orbit in Chase, is the drag, and is the default as before; **Padlock** keeps another ship in view, Lead for a wingman and #2 for Lead, with `[` and `]` picking another and the note saying who), the **ship** (Lead, #2, #3, #4; only loaded ships can be picked, and one that isn't loaded when a flight opens is swapped for the lowest that is) and, for Cockpit, the **seat** (front or rear, default front). Keys: `C` centre look, `P` toggle padlock, `[` `]` padlock ship; only in Chase or Cockpit, with 3D showing and not while typing in a field. Padlock turns the head to the target's bearing and elevation in the ridden ship's own frame (so it follows the bank), within the head's limits; with one ship loaded it is greyed with the reason. **Chase** rides the same smooth ship as the cockpit (DB-21), true scale like it, from 100 ft behind and 12° above it (estimates), swinging round it with the drag (Orbit) and keeping the horizon level; no cockpit is drawn and the caption reads "Chase: behind #N". The old Camera, Ship and Seat controls are no longer in **3D settings**; the saved keys `cam3d` (now also `chase`), `cockpitShip3d` and `cockpitSeat3d` keep their values, so an earlier choice opens as it was.
- **Cockpit camera (DB-21, wording not yet confirmed with Patrick).** **Cockpit** (picked on the camera bar, DB-22) has **Ship** (#1 to #4, default #1) and **Seat** (front or rear, default front). The camera sits at the chosen seat's eye in the shared CT-156 cockpit (ui-kit `ct156-cockpit.js`, TS-154 to TS-157; eye points are its estimates) with a perspective view 60° across. In cockpit mode every ship is drawn at its true size (33 ft), altitude ×1 and the ground at the home field's elevation, so climbs, the horizon and the other ships look as they would (the Altitude ×, Aircraft size and Ground settings return when Overview is picked). Drag turns the head in Freelook (160° either side, 85° down to 80° up, as Turn Sim); Reset view and the `C` key centre it; the wheel does nothing. Labels are placed through the perspective camera, and a ship behind the eye has none. The ridden ship's attitude comes from a 1-per-second table built at the fix times and joined smoothly (no corners at the seconds): heading from the ground track, or with Winds aloft on and a wind known, the nose along the air velocity so the crab shows; bank as the readouts (DB-8, recorded first); pitch from core `attitudeDegFromClimb` with the climb over ±1.5 s, true airspeed from the ground velocity less the model wind (ground speed with none) and est. IAS from it, turn G = 1 ÷ cos(bank) (DB-Q17); nothing else smoothed (aligned with DB-Q4). Other ships keep the bank and pitch the 3D view always draws (DB-Q23). The panel shows these estimates: altitude is GPS altitude, not pressure altitude; G is the believed est. G or dashes. The caption always reads "attitude estimated from the GPS track". In a GPS gap with the fill off the eye rides the straight line wings level, the panel shows dashes and the caption says "GPS gap" (DB-9); with the fill on it rides the fill, the panel shows the fill's estimates and the caption says "GPS gap: estimated path". Wind not loaded or failed: heading and airspeed are ground-based, labelled "(no wind)".
- **Filled gaps in 3D (DB-20).** With the fill on, a filled gap is a translucent flat ribbon (the zone's width, about 18% opaque) with a dashed centre line, drawn for the trail's seconds and for any gap a ship is in now; the ship is the CT-156 ghosted (about 45% opaque) at the fill's attitude, labelled "#N est.", with no height stick. Off: DB-9 as before.
- **Drawn with three.js (D138, D141).** The picture (sky, ground, datum plane, grid, trails, sticks and aircraft) is three.js on a WebGL canvas. The labels, altitude ruler, heights, compass, caption, tennis ball, the dot for a ship with no heading and the hollow marker for a ship in a GPS gap are drawn flat over it (`view3d/overlay.js`), placed with `projectPoint`. The aircraft is ui-kit's CT-156 Harvard in the Moose Jaw paint with the ship's colour on the fin and its number on the tail and nose; **Paint: Ship colours** in 3D settings gives the plain look. If three.js can't load (offline on the first visit) or the browser has no WebGL 2 (three.js needs it; the view asks first so three.js is never fetched for nothing), the debrief says so and stays in 2D.

#### GPS gap fill (DB-19, DB-20; Dad, 10 Oct 2026; wording not yet confirmed with Patrick)

A general solver for any track anyone loads (`src/flight-data/gap-fill.js`, pure, calls only core). It runs once when a flight loads and again when the model wind arrives or changes; it never changes the fixes, `sampleAt`, `inGap`, the readouts, the standards, the tennis ball or the CSV. Its results are read only by the 2D map, the 3D view and the cockpit view. Every number below is an estimate unless it names a source.

- **Which gaps.** flight-data's gaps (more than 5 s between fixes, C4). Two gaps with fewer than 3 fixes between them are one gap; the stray fixes in between are not joined, but the zone is widened to take them in.
- **The ends.** At each end a least-squares curve (a quadratic in time) through up to 5 good fixes, passing exactly through the end fix, gives position, velocity, track, turn rate, height and climb rate. A fix that would need more than 350 kt ground speed is left out of the curve (the readouts' `MAX_BELIEVED_GS_KT` idea); fewer than 3 good fixes at an end: not filled, "too few good fixes either side".
- **On the ground.** Both ends under 40 kt: a straight line, no attitude. One end under 60 kt and the other at or above it: not filled, "takes in a landing or take-off". Both under 60 kt but not both under 40: not filled, "too slow to tell (taxiing or the take-off roll)".
- **Formation first.** Another ship (Lead first, then the nearest) with real fixes from 5 s before to 5 s after the gap and no gap of its own there, whose offset in its own heading frame is within 1,500 ft at both ends, changes by no more than the larger of 300 ft and half the offset, and closes or opens by less than 60 kt at both ends, pins the gap (the design pass proposed 200 ft, a quarter and 30 kt; those refused the example flight's own close-formation case, #1 at 19:21:40Z, so they were opened up): the ship flies the other ship's real path (joined smoothly through its fixes) plus the offset carried across by a smooth curve. Up to 120 s. Spread formation fails the test and is solved alone. A wingman can pin Lead too.
- **Alone.** One steady turn: the bank eases (core `easeRoll`) from the turn the aircraft was in at the start to a steady bank and back out to the turn it is in at the end, at a pilot's roll rate (45°/s building at 90°/s², Traffic's estimates) held under the T-6's (core `rollWithinT6A`), with the turn rate from core `turnRateFromBankRadPerSec`. Speed runs straight between the two ends' speeds, plus a smooth change (largest in the middle) of at most ±40 kt; height is a smooth curve matching both ends' height and climb rate. The solver (damped Gauss-Newton, started from a coarse search) finds the roll-in time, roll-out time, bank and speed change that hit the far fix within 100 ft and its track within 5°, never past the stall line, preferring the lowest G (as a pilot flies it), then the least speed change. The turn each end was in (read off five fixes, the least sure number at an end) is matched loosely: the fill may start and end up to 30° of bank away from it. A turn of more than 120° is tried both ways round and the lower G kept. If one turn can't do it, two turns (an S-turn or reversal). With Winds aloft on and a wind at the gap's height, it is solved in the moving air (true airspeed) and drawn back over the ground; otherwise over the ground, labelled "(no wind)". Up to 60 s.
- **Not filled** (today's broken line, with the reason in the status details): longer than 60 s with no other ship to follow ("too long to guess alone"); no join within the ±40 kt speed change ("can't be joined at the speeds flown, likely a GPS or logging fault"); a path needing more G than the wing gives at its speed ("needs more G than the wing gives at that speed": core `stallLimitG` at est. IAS, a physical limit); the landing and taxi cases above; a solver failure ("couldn't be worked out").
- **Flagged, not refused.** A fill whose turn needs more than +7 G (core `T6A_LIMITS.maxG`) is drawn, and the status details say so ("needs 7.4 G, over the T-6's +7 limit"); the limit is a reference, not a wall.
- **The zone (Dad's "broad shaded area").** Two more one-turn solves, the turn rolled in as early as possible and rolled out as late as possible; at each moment the zone reaches as far either side of the best guess as those alternatives go, never narrower than 50 ft plus 2% of the distance flown from the nearer fix (so it pinches to the fixes and grows with the gap), never wider than where the aircraft could reach from the first fix and still make the second at the faster end's speed plus 40 kt. Height: the curve with each end's climb rate ±500 ft/min, at least ±50 ft (kept with the fill, not drawn: the 3D ribbon is flat). Formation fills: half the offset's change plus 50 ft, pinched at the ends.
- **The status line** adds the counts, for example "4 tracks loaded, 50 gaps (24 filled as estimates, 16 not filled)"; the status details list, per ship, each gap not filled with its time and reason, and any fill flagged over +7 G.
- **When data fails.** No wind (Winds aloft off, loading, failed or below the model's lowest level): solved over the ground, "(no wind)". A wind that arrives later re-solves every gap; nothing on screen waits for it. The fill fetches nothing. A track file is untrusted: the solver reads only numbers that passed cleaning, and an error in one gap leaves that gap unfilled without stopping the rest. Stale data does not apply: a track is history, and the model wind's own age rules are the Weather section's.

#### GPS puck (DB-23; Dad, 10 Oct 2026; wording not yet confirmed with Patrick)

Dad: "in close formation the location of the sentry puck matters. Can you select a sentry puck in front or back ... wouldn't that shift some KML views at least cockpit wise". A track's positions are where the portable GPS (a ForeFlight Sentry or similar "puck") sat, not the aircraft's reference point (the 3D model's origin, where the Debrief has always drawn a ship). A few feet matter in close formation and in the cockpit view.

- **The setting.** A closed "GPS puck" box in the Flight column, under the status: one row per loaded ship, "GPS puck: Not set / Front cockpit / Rear cockpit". Default Not set: exactly today's positions and numbers. Kept per flight and per ship (slot) in this browser, as the DFPs are (keyed by the flight's track files), and saved in the debrief file as `puck.1` to `puck.4`; an opened debrief file that names a seat wins over the browser's choice (a file naming none leaves the browser's).
- **Where the puck sits (DB-Q25).** Working answer: on the glareshield of the chosen cockpit, on the centre line, at the coaming's aft edge and crown. Front: 3.35 ft ahead of the reference point and 1.85 ft above it (the front coaming, `GLARESHIELD_FT` aftX and top, TS-157). Rear: 0.8 ft aft and 1.9 ft above (the rear hump, `REAR_HUMP_FT` aftX and top, TS-157). Both are ESTIMATES off the shared CT-156 cockpit model (TS-154 to TS-157), read from `src/ui-kit/ct156-cockpit.js`, one copy of each number.
- **The correction.** Reference point = puck position − offset turned to the ship's heading; height − the offset's height. So a front-cockpit puck moves the ship 3.35 ft back along its heading and 1.85 ft down (3.8 ft in all), a rear-cockpit puck 0.8 ft forward and 1.9 ft down (2.1 ft). Heading is the track's at each fix (the smooth curve through the fixes, as the cockpit view uses); while the aircraft is still (under 3 kt, C7) the last moving heading is kept, and before it first moves the first moving heading is used; a track that never moves gets only the height change.
- **Why heading only, not bank and pitch.** Turning the offset by bank too would move the puck's 1.85 to 1.9 ft height sideways by height × sin(bank): about 0.9 ft at 30°, 1.3 ft at 45°, 1.6 ft at 60°, and the height change would shrink by height × (1 − cos bank), 0.9 ft at 60°; pitch moves the front puck's 3.35 ft fore offset up or down by 3.35 × sin(pitch), 0.6 ft at 10°. Every one is under 2 ft, below a portable GPS's own scatter (several feet, an estimate) and well inside the shared table's margins; wingmen in a formation turn hold Lead's bank, so the miss is nearly the same for both ships; and the Debrief's bank is itself estimated from the track (DB-8), which reads wild at a GPS jump, so feeding it into positions would add more error than it removes.
- **Where it applies.** Once, when a flight loads or the setting changes, on the cleaned fixes, before the gap fill: the 2D map, the 3D view, the cockpit view, spacing numbers and verdicts (DB-Q26), the tennis ball, the gap fill and the CSV all use the moved positions. Changing it never moves the camera, the playback time or the DFPs.
- **The cockpit.** With the puck set, the recorded track runs through the puck's spot on that cockpit's glareshield, so the eye in the puck's own seat sits about 2.0 ft aft of and 0.3 ft above the recorded track (front), or 2.2 ft aft and 0.4 ft above (rear), as a pilot's eye does behind the coaming (`EYES_FT`).
- **Words on screen.** The status line adds "#2 moved from its rear-cockpit GPS puck"; the status details say, for that ship, "Positions moved from the rear-cockpit GPS puck to the aircraft, about 2 ft (estimate)".
- **CSV.** The moved positions, as the screen shows them. A ship with a puck set has its position columns headed "#2 lat (moved from rear-cockpit puck)" and so on; with none set the headers are today's.
- **When data fails.** Nothing is fetched. A stored or file choice that is not "front" or "rear" is read as Not set. A gap stays a gap (its times don't change).

#### GPS timestamps (DB-25; Dad, 10 Oct 2026; wording not yet confirmed with Patrick)

Dad: "#2 is really well on lead, but #3 and #4 aft spacing just goes crazy and they seem never to be in position ... could it be a time sync issue with the Sentry vs ForeFlight", then "yes go ahead", and "other uploaded tracks may not have a time sync issue, so the app should be able to ID it then adjust". A GPS receiver works out one position per whole GPS second. An external receiver (a Sentry or similar puck) relayed to the iPad can be stamped when the position arrives, a few tenths of a second late, by a delay that wanders. At 255 kt over the ground one second is about 430 ft, so a 0.25 s stamp error reads as about 100 ft fore/aft, and its wander as a wingman who never settles in position.

- **What the example flight shows.** #1 and #2 are stamped on the second (x.998 to x.999 s, the logger's millisecond rounding), 1 s apart. #3 and #4 are stamped 0.1 to 0.45 s after the second (typical 0.24 s and 0.26 s), with many 2 s steps and some 0.8 and 1.2 s steps. 19:33 to 19:45Z, relative to Lead along Lead's track: #3 182 ft aft (±40) and #4 258 ft aft (±71) as recorded; snapped, 53 ft (±46) and 102 ft (±65). A constant extra shift doesn't narrow the spread: what is left is the receivers' own position scatter, not timing (a case for DB-Q4; nothing is smoothed).
- **How a track is judged (per track, at load; every number an ESTIMATE from the example flight).** On its airborne fixes (40 kt or more over the ground from the fix before, the gap fill's ground speed; on the ground the iPad may log its own GPS), or on all fixes when fewer than 30 are airborne; fewer than 30 in all and it isn't judged ("Too few positions to judge"). A stamp within 0.05 s before a whole second counts as that second.
  - **On GPS seconds:** 80% or more of the judged fixes within 0.05 s of a whole second. Never changed; the box says "On GPS seconds". #1 and #2 on the example.
  - **Logged faster than once a second:** the typical (median) step under 0.9 s, as a 5 Hz or 0.5 s logger. Its fractional times are real and spread evenly, so it is never snapped; left as recorded.
  - **Off the second (the relay signature):** about once a second (typical step 0.9 s or more), the typical offset 0.1 to 0.75 s after the second, and 80% or more of the judged fixes within ±0.2 s of it. #3 (99.9% within the band) and #4 (96%) on the example.
  - **Irregular:** anything else (about once a second but the offsets spread or the typical offset outside 0.1 to 0.75 s). Left as recorded, and the status details say "Timestamps irregular (not on the GPS second, not a steady offset): kept as recorded".
- **The snap.** Each fix of a track found off the second moves to the GPS second it belongs to: the whole second at or before its stamp (an arrival delay is never negative and under a second), so the fixes stay in order. When two fixes land on one second (a stamp more than a second late meeting the next), the one whose offset is nearer the typical offset stays and the other is left out, and the status details say how many (2 on #4 of the example, none on #3). Positions never change.
- **The setting.** In the Flight column's closed "GPS source" box (the "GPS puck" box renamed; it keeps the puck row, DB-23), one block per loaded ship: "Timestamps: Snapped to GPS second (auto) / As recorded" for a track found off the second (auto is the default), or what was found for any other ("On GPS seconds", "Logged faster than once a second: as recorded", "Irregular timing: as recorded", "Too few positions to judge: as recorded"), and a time shift, the row "Shift (s, ±2)", −2.0 to +2.0 s in 0.1 s steps, default 0, added after the snap to every fix of that ship (for a logger whose own clock is off). As recorded with a 0 shift holds the old behaviour exactly. Kept per flight and ship in this browser (beside the GPS puck choice) and in the debrief file as `timestamps.1` to `timestamps.4` ("recorded" when kept as recorded) and `timeShift.1` to `timeShift.4`; an opened file that names any wins over the browser's choice.
- **Where it applies.** Once, when a flight loads or the setting changes, on the placed fixes and before the GPS puck move and the gap fill (both read the times). The gaps and the playback window are worked out again on the new times; changing it keeps the camera, the moment and the DFPs (a shift that moves the window by a second or two makes the clock again over the new window at the same moment and speed). Everything uses the new times: map, 3D, cockpit, spacing numbers and verdicts, the tennis ball, the gap fill and the CSV.
- **Words on screen.** The status line adds, for example, "#3, #4 timestamps snapped to GPS seconds (about 0.24 s, 0.26 s)" and "#4 shifted −0.3 s". The status details say, for a snapped ship, "Timestamps snapped to GPS seconds: recorded about 0.26 s after the second, as an external GPS relayed to the iPad is; 2 positions sharing a second left out", for a ship kept as recorded "Timestamps about 0.26 s after the GPS second, kept as recorded", and "Times shifted −0.3 s".
- **CSV.** The time column header names the ships snapped or shifted, for example "time (Zulu) (#3, #4 snapped to GPS seconds; #4 shifted −0.3 s)"; with none, "time (Zulu)" as before.
- **When data fails.** Nothing is fetched. A stored or file value that isn't "recorded", or a shift that isn't a number, is read as the default; a shift outside ±2.0 s is held at the end of the range. A shift that would leave the tracks with no shared time is not applied (the flight shows as recorded).

#### Airspace and airfields (DB-24; Dad, 10 Oct 2026; wording not yet confirmed with Patrick)

Dad: "lets use the 3d airspace in SOF in the KML viewer ... sure just use the boundaries etc" and "use the airfield graphics like pattern sim too". The SOF's airspace and airfields, shared since SOF-62 (`src/airfields/airspace/`, `src/airfields/airports-data.js`, `src/ui-kit/airspace3d.js`, `airfield3d.js`), drawn round the loaded flight. A picture only: nothing checks an aircraft against airspace, and no verdict, number or caution uses it.

- **Which data.** The SOF base whose files' square (900 NM across, 450 NM each way round the base; `areas.js`) holds the flight's whole box, the nearest base when two do: Moose Jaw's 25 DAH entries, its wider DAH set and the FAA's US side, or one US base's FAA file (Class B, C, D, special use airspace, training routes). None: the layer says "No airspace data for this area" and draws nothing.
- **What is drawn.** Every airspace whose outline reaches within 30 NM of the flight's box (estimate), drawn whole, and every airfield in the shared runway list with a runway end in that box.
- **3D.** Each airspace a faint see-through volume from floor to ceiling, edged by kind in the SOF's colours (restricted red, advisory amber, terminal blue, control zone light blue, MTCA cyan, MOA orange, training routes violet); runways at their place, length and width, painted like the Traffic sim's 29L (grey, white paint with a thin black outline, threshold bar, piano keys, centreline dashes, aiming point; numbers read from the approach end). Heights are true: feet above sea level, AGL limits taken above the home field's elevation and FL read as feet (estimates, as the SOF), each runway at its field's elevation shifted to the tracks' ground (DB-26, below) and 0.5 ft up, its paint in 0.5 ft layers (estimates). In the overview everything is stretched by the Altitude × setting with the aircraft; in Chase and Cockpit it is true scale.
- **The ground in 3D.** The ground is drawn where the Ground setting puts it ("From the tracks" by default, DB-26). At "Lowest ship − 500 ft" airspace and runways under it are hidden, and 3D settings says so with the way round it ("Ground: From the tracks or Home field elevation shows them all").
- **2D.** Each airspace's outline in its kind's colour (a training route dashed), and each runway as a grey strip with a white edge (at least 3 px wide, estimate), under the tracks.
- **Switches.** "Airspace" (off at first: a clean picture, and the volumes fill the overview) and "Airfields" (on: flat on the ground, little clutter), in Layers (2D) and 3D settings, kept in this browser. Under them, with Airspace on, a line saying what is drawn ("16 of 16 airspaces within 30 NM of the flight shown") and a closed "Airspace kinds" list: each kind near the flight with its count (the SOF's kinds), ticked when shown.
- **When data fails.** The files load only once Airspace is on (a dynamic import, as the SOF's); while they load the line says "Airspace loading…" and the fixed entries round Moose Jaw draw. A file that fails: "Airspace unavailable (couldn't load)", with whatever is fixed still drawn, and it is tried again when next asked. A malformed entry is left out and counted ("1 left out (bad data)"), never drawn wrong. None of this ever holds up loading, playing or judging the flight. The runway list is built in (DB-26: Patrick's points at CYMJ, the FAA CIFP at the US fields, OurAirports elsewhere; for drawing only); an airfield not in it is not drawn. Stale data: the files carry their DAH edition and FAA cycle dates; they are re-made with the tools each 56-day cycle, as for the SOF.

#### Runways and the ground (DB-26; Dad, 10 Oct 2026; wording not yet confirmed with Patrick)

Dad: "fix the runways so that [in the] KML viewer the planes land on it. Also the ground line seems off in 3D, the aircraft almost sit below the green 3D terrain."

- **Runway sources, best first.** Each runway in the shared list (`src/airfields/airports-data.js`) says where its ends came from (`source`):
  - **Moose Jaw (03/21, 11L/29R, 11R/29L):** Patrick's measured points, the Traffic sim's (`src/modules/traffic/airfield.js`, TR-67; measured on Esri's true-scale photo, about ±10 to 15 ft), turned from Traffic's map feet into latitude and longitude about its field origin, 50.3303 N 105.5592 W (`src/modules/traffic/data/moose-jaw.json` "anchor"), by `tools/cifp-runways.mjs` with `core/geo.js` (Patrick's own 29L number-base point comes back within 6 ft). Widths are Traffic's (150, 150, 100 ft, estimates). The same points live in Traffic's map feet: two places until Patrick merges them.
  - **US fields (the eight bases and their usual alternates):** the FAA CIFP's runway records (cycle 2610, effective 1 Oct 2026; surveyed landing thresholds, to about 1 ft): each end's position, landing threshold elevation, displaced threshold, length and width. A displaced threshold's pavement end is worked out (the landing threshold moved back along the runway by its displaced distance), the strip is drawn end to end and the threshold bar, piano keys, number and aiming point sit at the landing threshold.
  - **Everything else:** OurAirports, approximate (about 10 to 1,000 ft out where checked against the CIFP).
  - **Kept from OurAirports:** every runway's true heading (the SOF's crosswind check reads them) and every field's elevation. A runway whose names differ (KABI 04/22, not in the CIFP; KSPS, KNGP and KCRP 17/35, numbered 18/36 in the CIFP) stays OurAirports'.
- **Accuracy.** Patrick's points about ±15 ft; CIFP about ±3 ft; OurAirports unknown (approximate). The map's flat-earth frame (`core/geo.js`, a sphere) draws a two-mile runway up to about 0.3 % long or short depending on its direction; the tracks are drawn in the same frame, so they still line up.
- **The ground in 3D.** The median height of every fix the loaded tracks took on the ground: moving slower than the gap fill's 40 kt over a step of 5 s or less, taken after the timestamp snap (DB-25) and the GPS puck move (DB-23); at least 30 such fixes (estimate). From it the wheels' height under the model's origin is taken off (6.2 ft: the fin top is 10.6 ft above the wheels on Patrick's photo of 156101 and 4.4 ft above the origin on the model; estimate, the model has no gear), so a parked or taxiing aircraft's wheels sit on the ground. Chase and Cockpit always stand on it. Ground setting: **From the tracks** (default), Lowest ship − 500 ft, Home field elevation, Sea level. Heights on the sticks read "ft AGL" with From the tracks.
- **Runways at the tracks' ground.** The field the ground fixes sit at (nearest runway end within 3 NM of their middle, estimate) is drawn on the tracks' ground, and every field by the same shift from its published elevation (the receivers' height against the surveyed elevation is common to the flight, so each field keeps its height against the others). No field within 3 NM: runways at their published elevations.
- **What 3D settings says.** "Ground 1,868 ft, from the tracks: 7,097 fixes on the ground read 1,874 ft, less 6 ft to the wheels (estimate). CYMJ is 1,892 ft in the runway data: every runway is drawn 24 ft lower than its field's elevation to match, so CYMJ's lie on this ground." The caption reads "Ground: 1,868 ft (from the tracks)".
- **When data fails.** Fewer than 30 ground fixes (a track that starts and ends in the air, or a file with no speeds that read): the home field's elevation, as before, and 3D settings says why ("too few fixes on the ground in the tracks to read it from them"). A bad entry in `runway-ends.js` (a position out of range) leaves that runway on OurAirports' ends. Stale data: the CIFP is re-read each 28-day cycle with the tool; runway ends rarely change between cycles. Nothing here holds up loading, playing or judging the flight; no number, verdict or readout uses this ground.
#### Readouts and standards (R9, R18)

The right column shows, for the current time, the same panels in both views. By default only the Formation card, DFPs and the headings of the rest are open (see The screen):

- **Live data**: per ship, altitude, ground speed, **est. IAS** (D31), G and pitch and bank, each marked "recorded" or "est." (D47). Pitch and G are worked out from the track's own motion by default, because the iPad's recorded pitch and G look like the tablet tilting; recorded bank is still used (D47, Patrick answering Q32). If `flight-data` later adds an option to reference the iPad's attitude to a straight-and-level or on-the-runway baseline, the debrief shows it as a setting, and latitude/longitude (interpolated, D51).
- **Aspect, HCA and closure versus Lead**, and **spacing** for every pair. Each range says whether it is **horizontal** or **3D** (#18, SPEC.md). The numbers stay V6's (D29).
- **Standards**, in the closed **Debrief settings** menu (ui-kit `createSettingsMenu`, R22): the spread, offset and lead standards, editable, with a one-click reset to the default preset (R18, D23). The default preset is the SMM's (D114 to D116, core's `DEFAULT_STANDARDS`): spread 4,000 to 6,000 ft with 0 to 10° of sweep behind the 3/9 line of the aircraft the interval is measured from ("AFT by 7°"), #3 7,000 ± 1,000 ft back, and Lead 220 kt in the low block and 200 kt in the mid block, the target picked from Lead's altitude and shown on the Lead line. V6's values stay in core as `V6_STANDARDS`, pinned by the golden tests. They are saved with the module's settings and in the debrief file.
- **Lead desired parameters** compare **est. IAS** with the target (V6's 200 kt; the SMM's 220 low / 200 mid, D115), not ground speed (D31).
- **No verdicts on the ground (verification M1(a); a judgement call logged for review).** While Lead's est. IAS is under 80 kt (`AIRBORNE_IAS_KT` in `readouts.js`: on the ramp or taxiing), no wingman gets a standards label (the card says "Lead under 80 kt": est. IAS comes from ground speed, so a steep pull-up can dip under it in the air too; audit of #194, logged for review) and Lead's line shows its numbers with no FAST, SLOW or G verdict.
- **Lead is judged only inside the blocks (verification M1(b); a judgement call logged for review).** From 6,000 ft MSL (the Low block's floor) to 15,500 ft (the Mid block's ceiling), Gen Book p.12 (`LOW_BLOCK_FLOOR_FT`, `MID_BLOCK_CEILING_FT` in `readouts.js`); which target applies inside stays core's `lowBlockTopFt`. Below or above, Lead's line says "not judged: below the low block" or "not judged: above the mid block", with no verdict at all (no FAST, SLOW, LOW G or HIGH G). The gate runs before core's `classifyLeadParameters`, which is unchanged.

- **Lead's est. IAS is wind-corrected when the model wind is known (final verification F1; Patrick or Dad may change the wording).** Est. IAS is an estimate of KIAS, and a verdict against 220 or 200 KIAS needs true airspeed, which needs the wind. When the **Winds aloft** item is on and has a wind for Lead's altitude and the moment (`windAt` in `weather/winds.js`, the same value the wind line under Lead's quotes; `index.js` passes it to `readoutsAt` as `options.leadWind = { dirDeg, kt }`, true "from" direction, knots), true airspeed is the length of the ground velocity minus the wind vector: ground velocity is Lead's ground speed along Lead's true track, the wind vector points the way the air moves (opposite its "from" direction), and est. IAS = TAS × √(density ratio), the ratio as `estIasKt` has it. A 24 kt headwind therefore raises est. IAS by about 24 kt × √σ against the ground-speed figure, and a tailwind lowers it. The Lead line says which it is: "Lead 203 kt est. IAS (wind-corrected), 1.1 G, on parameters"; with no wind (Winds aloft off, still loading, failed, below the model's lowest level, or Lead not moving) it stays ground-speed-based and says "Lead 219 kt est. IAS (no wind), …". The FAST / SLOW verdict follows whichever IAS is shown. Lead's row in More detail and the CSV's #1 est. IAS column use the same number; wingmen's est. IAS stays ground-speed-based and says "(no wind)" in More detail. The wind is the model's, at Lead's altitude at one point (above), so it is a good estimate and not a measurement.
- **A GPS spike is not shown as a real G or speed (final verification F2; judgement calls logged for review).** flight-data's gap rule (`GAP_S`, "more than 5 s") is not changed. In the debrief only:
  - **A fix pair 5 s or more apart is a gap** at the readout moments it spans (`readouts.js`; flight-data's own gap, "more than 5 s", stays as it is for the map line and the cleaning). The ship's row says "GPS gap" and shows no G, bank or verdict, and the moments whose G window (t ± 1.5 s) touches such a pair show G and bank as "--". Real tracks have a fix a second; a hole of 5 s is a hole.
  - **G above the stall line is "--"**: an est. G above (est. IAS ÷ 86 kt)² cannot be flown at that speed (86 kt stall, D158; 0.5 G at 62 kt, 1.9 G at 120 kt would be far under it), so it is a position jump and is shown as unknown, like any other G the track cannot give. The IAS is the one shown for the ship (wind-corrected for Lead when it is). Bank beside it (estimated) is unknown too.
  - **A ground speed over 350 kt is "--"** (`MAX_BELIEVED_GS_KT`; the T-6's VMO is 316 KIAS, and Dad's V6 cleaning lets a 450 kt pair through, so spikes between pass cleaning): GS and est. IAS show "--", est. G and bank show "--", and Lead's line says "not judged: GPS speed over 350 kt", with no FAST, SLOW, LOW G or HIGH G. The simpler honest choice over keeping the number with a note: a number on the card reads as true however it is labelled. Wingmen's spacing is not blanked by it (the gap rule above and the positions stay).

Standards fixes from #21 (the classifier itself is `core/standards.js`, core PR 3):

- A ship with no standard that applies to it shows no label, instead of "ON PARAMETERS".
- The on-map label turns green when on parameters.
- **#3 is judged by two standards at once** when both are on: spread says within ±250 ft of Lead's 3/9, offset says 8,000 ft aft, so #3 can never be on parameters. **Decided (D78, Q39): when the offset standard is on, it alone judges #3's fore/aft, and the spread standard still judges its interval.** `core`'s `standards.js` makes the change with V6 pinned first; the debrief's #3 labels follow once that's on main.

#### EM chart

V6's EM card: IAS against turn rate over the T-6 EM chart for 6,500, 8,000 or 13,000 ft (chosen automatically from the formation's altitude, or by hand), with a fading 60 s trail per ship. Kept, with:

- Turn rate without V6's divide by 2 (D39, already landed in core PR 2).
- The three chart images (about 0.9 MB) load only when the EM chart opens (R5).
- The chart never covers the map (#37), and stops drawing when closed (#39).

#### Tennis ball (#19, Q33 to Q37)

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

#### DFPs (R17, #25)

Debrief focus points belong to the flight, not to the browser:

- Add a DFP at the current time (it records the time and Lead's position), label it, write a note, go to it, delete it, and step to the previous or next DFP **in time order**.
- Labels are unique ("DFP 1", "DFP 2" …, renumbered by time) unless the user renames them.
- Labels and notes are shown with `textContent` only.
- While a flight is open, its DFPs are also kept in the browser (`app.storage`, keyed by a fingerprint of the loaded tracks), so a reload doesn't lose them. They are never shown on a different flight.
- **Save debrief** writes the `flight-data` debrief file (tracks, DFPs and settings). **Open debrief** reads one back, exactly as it was (R17). Saving and opening the file goes through `storage/file.js`.

#### CSV export (#28)

One file, one row per second across the common window, with each ship's columns side by side: time (Zulu), latitude, longitude, altitude, ground speed, est. IAS, heading, G, pitch and bank with their sources, and a gap flag. A value the readouts show as "--" (G or bank unknown) is a blank cell. With a GPS puck set (DB-23) the positions are the moved ones, and that ship's latitude, longitude and altitude headers say "(moved from front-cockpit puck)" or "(moved from rear-cockpit puck)". With timestamps snapped or shifted (DB-25) the time column header names those ships. The button is disabled with no flight loaded, and the download link is released after use.

#### Weather at the time of the flight (Patrick chose the scope 2026-09-30 06:42Z and approved this section 07:21Z, "Approved")

Patrick asked for "the historical METAR of the nearest airfield as well as overlays for radar/satellite … toggleable on the replay", and chose "Plus saved radar". Every layer is display only: it changes no flight math and no readout.

**On the screen (R22).** A **Weather** menu beside Layers, with every item off by default, remembered in the layout like the other layers:

| Toggle | What it shows | Source (no key, read by the browser, no proxy, D69) | How far back |
|---|---|---|---|
| METAR | The report in force at the playback time, from the airfield nearest the formation (nearest to Lead, from `app.airfields`; any other airfield can be picked). It shows as one line under the playback bar, decoded by `src/wx` (`parseMetar`, `flightCategory`), with the raw text a click away. The scrubber gets a small tick at each new report or SPECI. **Which report is a SPECI:** IEM's CSV doesn't say (its text column often has no "SPECI" prefix), so once the full list (report types 3 and 4 together) has arrived the feed asks a second time for the same station and dates with only `report_type=4` (specials alone). The second call is sent at least 1 s after every other IEM call has finished (IEM's throttle is per browser, so this holds across airfields too: when the nearest field changes, specials calls queue one at a time and never overlap another airfield's call), waited out with the app's timer service (the scheduler scope) and never a bare timer, and the list shows at once, without waiting for it. A report of the full list is marked SPECI when the specials reply holds one for the same station at the same valid time with the same raw text (a report that only matches on time stays a METAR: an unmarked report is a smaller mistake than a wrongly marked one). A report whose own text starts with "SPECI" is a SPECI without the second call. If the second call fails, is refused or is unreadable, the reports just aren't marked: nothing else changes and no error line is shown (the second call is a nicety, not the report). Closing the flight or the debrief, or a new flight, cancels the wait and the call, either of the two. **How a SPECI shows:** the METAR line starts "SPECI " ("SPECI CYMJ 1432Z (at this moment) · …"; a routine report has no prefix), and each scrubber tick is a datalist option with a label, "SPECI 14:32Z" or "METAR 14:00Z" (time in UTC), so a tick's kind is in its text for sight (where the browser draws option labels) and for a screen reader, not in a colour alone. No extra drawing is added. | Iowa Environmental Mesonet METAR archive (to be confirmed for CYMJ and browser access; if it fails, METARs saved with the debrief as below) | Years |
| Satellite | The GOES-West picture at or before the playback time, over the base map and under the tracks: GeoColor (colour by day, infrared-based at night) or infrared alone. The line under the map gives its time and age, for example "Satellite 14:30Z, 2 min before". | NASA GIBS WMTS tiles (GeoColor to zoom 7, infrared to zoom 6, 10-minute steps) | About 90 days. Older flights say "Satellite not kept" (live only, Patrick 2026-09-30 08:03Z) |
| Winds aloft | Model wind at Lead's altitude, on its own neutral line under Lead's line on the Formation card ("model wind 270°T/25 kt at 8,500 ft (HRDPS 14Z, Open-Meteo)": true direction, knots, and marked as a model value, not an observation), and wind arrows on the map at a height you choose. The wind is taken at Lead's position halfway through the flight, from the model hours either side of the moment (the hour at or before and the next, blended by time as a vector; the label names both, "HRDPS 14–15Z"), blended as a vector between the pressure levels either side of Lead's altitude (950 to 300 hPa, about 1,400 to 30,000 ft). Levels whose height is under the ground at the wind point (the elevation Open-Meteo returns with the reply, else the home field's) are model values below the ground and are left out (at Moose Jaw that is 950 hPa), so below the lowest level above the field (about 2,100 ft at Moose Jaw: the roll, the low pass and landing) the line says "below the model's lowest level: see the METAR" rather than blending in a below-ground number. The request sends Open-Meteo the flight's dates and that one position, rounded to 0.01° (about 1 km), and nothing else. **Wind model** picks HRDPS (default) or HRRR; a flight older than HRDPS's archive uses HRRR. **Wind arrows (model)** (a separate Weather item, off at first, needing nothing from the Lead-line item) draw the model wind on the 2D map at a height you choose: **Wind arrow height**, a number box in feet above sea level, default 8,000 ft, from 2,000 to 30,000 ft in steps of 500, the same model choice (**Wind model**) as the Lead line. The winds are taken at a 3 × 3 grid of points over the box round every track (its corners, edge middles and centre, each rounded to 0.01°, a point repeated by the rounding kept once), all nine in **one** Open-Meteo request (comma-separated `latitude` and `longitude`, the flight's dates, the same levels and units as the Lead line; the reply is a list with one reply per point, each with its own `elevation`). Each point's value is the same blend as the Lead line's (between the pressure levels either side of the height, then by time between the model hours either side of the playback time), leaving out levels under that point's own ground. One arrow per point points **downwind** (the way the air moves, the opposite of the model's "from" direction), its length grows with the speed and is held to a readable range (16 to 72 px), with a small label such as "280°T/38 kt" (true direction the wind blows from, knots, as on the Lead line). A calm point (a speed that rounds to 0 kt, which the label calls "calm") has no direction to point, so it shows a small ring and the word "calm" and no arrow. Drawn on the map's canvas in a muted colour from the theme's tokens, under the tracks, ships and their labels, and moving with pan and zoom. A point with no model wind at that height (under the model's lowest level above the ground there, above its highest, or no model hour in force) draws nothing, and the Weather menu's small status line under the item says why ("no model wind at 2,000 ft here (below the model's lowest level)"). The line under the map, in 2D, is captioned "Model wind at 8,000 ft (HRDPS 18–19Z, Open-Meteo)". The request is sent only while the item is on (R5). The nine points, rounded to 0.01°, sit at the corners, edge middles and centre of the box round the flight, so they reveal that box to Open-Meteo to about 1 km (the Lead line reveals only its one point); and Open-Meteo counts each location in a request against its free allowance, so the nine points cost more of it than the Lead line's one. It can be busy, fail or be retried (turning the item off and on) as the Lead line's is, and closing the flight or the debrief cancels it. **Not in 3D** for now: the 3D view draws no arrows and shows no caption, nothing is fetched while 3D shows, and the menu's status line says "Wind arrows show in the 2D map only." The arrows are the model's wind on a coarse grid at the chosen height, not a measurement of the wind at the aircraft. | Open-Meteo historical forecast (Canada's HRDPS 2.5 km, or HRRR, the model Herbie reads), pressure levels, hourly | HRDPS since 2023-03-03, HRRR since 2018 |
| Radar | ECCC's 1 km radar composite (rain and snow) under the tracks, the last kept frame at or before the playback time with its time and age. | ECCC GeoMet, **saved into the debrief** (below) | Only 3 hours live |
| Lightning | ECCC's lightning density, as the SOF shows it. | ECCC GeoMet, saved into the debrief | Only 3 hours live |

**Saved radar and lightning.** ECCC keeps only the last 3 hours (RainViewer 2), so these can't be fetched later. When a flight is loaded and its end is less than 3 hours ago (by the browser's clock), the Weather menu offers **Save radar and lightning with this debrief**, with one line under it ("ECCC keeps radar for only 3 hours after a flight."); what the button does ("This fetches every picture from the flight and keeps them in the debrief file.") is its tooltip and its description for a screen reader, so the menu stays short. It fetches every frame covering the flight window around the formation and keeps them with the flight. **Save debrief** then writes them into the file, and opening the file plays them back with no network. When the flight is older, the Radar and Lightning items say "Not kept: radar is only available for 3 hours after the flight." (the Lightning item on the map says "lightning" in its place). Satellite pictures are not saved (Patrick chose "Live only" at 08:03Z). Cloud and visibility come from the METARs only; the model gives winds aloft only (Patrick chose "Drop it" at 08:03Z, as Open-Meteo has no cloud base and HRDPS no visibility). The METARs and model winds shown are saved in the file too, so a saved debrief shows the same weather offline and years later.

The details (12f):

- **What is kept.** Three ECCC layers, as the SOF names them: rain radar `RADAR_1KM_RRAI`, snow radar `RADAR_1KM_RSNO` and `Lightning_2.5km_Density`. The **Radar** item draws rain and snow together (a frame of each, so a winter storm shows too); **Lightning** draws the lightning frame. Only what is kept is drawn: there is no separate live fetch while playing, because the offer fetches every frame at once. A flight within 3 hours that has not been saved says so under the item ("Radar not saved yet: see Weather."; with both items on, "Radar and lightning not saved yet: see Weather.", and for an older flight "Not kept: radar and lightning are only available for 3 hours after the flight.": one short sentence, not two, as the line under the map is one that must not grow). Fetching starts only when the button is pressed, never from the toggles (R5's "only while on" is met by the button being an explicit act).
- **Which frames.** The times come from each layer's GetCapabilities reply (the SOF's `parseLayerTimes`; radar every 6 minutes, lightning every 10). Every step from the last frame at or before the flight's start to the last at or before its end is fetched, so the first moment is covered. If ECCC no longer has the start (a flight that ended less than 3 hours ago but began earlier than that), what exists is kept and the line says from when ("Rain radar from 14:12Z: ECCC no longer had earlier pictures."). A frame that fails is left out and counted in the line ("2 pictures couldn't be fetched."); a layer with none is named ("No lightning pictures could be fetched."); with none at all, or no connection, nothing is kept and the line says why, and the reason is the real one: "ECCC gave an error (HTTP 500)." when the replies were errors (or ECCC's list of times was), "the pictures are too large to keep (1.5 MB each at most)." when they were over one frame's limit, "ECCC had no pictures for this flight any more." when ECCC listed none or answered with its own missing-frame XML, and "ECCC couldn't be reached. Check the connection and try again." when nothing answered (an error outranks too large, which outranks no pictures). The kept pictures are held in memory until the debrief is saved or closed. Once some are kept the button goes and the line says what is kept ("Kept with this debrief: 39 radar and lightning pictures, 14:06Z to 15:12Z. Save the debrief to put them in the file."; without the last sentence when they came from a file, as they can be for a flight that is now old, or once **Save debrief** has put them in a file: the line is then just what is kept).
- **The picture.** One transparent PNG per frame, from ECCC's WMS in plain latitude and longitude (`EPSG:4326`, so it lands on the map's flat feet without stretching), covering the box round every track plus 30 NM on each side, at about 1 pixel a kilometre (radar's own), no more than 1,024 on a side. Plain GET requests only (ECCC answers a preflight with an error). ECCC answers a missing frame with 200 and an XML error, so a reply is kept only if its type is `image/png` and its first bytes are a PNG's. The request sends ECCC the times and that box, and nothing else, so the box is visible to it (as the winds' is to Open-Meteo).
- **Size limit.** The frames' image bytes are kept to **25 MB** in all, and one frame to 1.5 MB (real 1,024 pixel frames over a 44 to 55 N, 112 to 96 W box are rain 62 kB, snow 77 kB and lightning 4 kB, checked 2026-09-30, so a 3-hour flight over a box that size comes to 31 + 31 + 19 frames, about 4.4 MB; a small box such as one flight's 163 × 185 pixels is about 2 kB a frame, so a 90-minute flight is about half a megabyte; either way the limit is not met in practice). If a flight is over it, the frames are thinned rather than cut off: every second frame of each layer is dropped (counting from the first), then every third, and so on until it fits, always keeping each layer's first and last frame. The line under the Weather menu says it and names each layer's own spacing ("Radar every 12 min and lightning every 20 min kept to fit the size limit.": radar's 6 minutes and lightning's 10, each times 2; rain and snow are one item, the wider of the two), and the step it thinned to is stored in the block (`thin`, 1 to 12) and widens each layer's age limit to that many of its own steps (never less than the usual 20 minutes), so the thinned frames still show; a gap ECCC itself had (an outage) is not bridged. A limit that no thinning can meet (which the frame limit rules out) refuses to keep any.
- **In the file.** Each frame is `{ layer, t, mime, data }`: the image's bytes as base64, keyed by layer and time (seconds since 1970), with the box they cover. They are written as one block under the debrief file's `settings`, because `flight-data`'s format has no field for weather yet (see Who owns what). A file made before this, or without weather, opens as before.
- **Reading a file is untrusted (security).** The block is checked before anything is drawn, and all of it or none is used (a bad one leaves the rest of the debrief opening, with a line saying the saved radar was left out): at most 36 million characters (a longer block, or a setting that is not text, is left out with the same line, "it is too big" or "it is not text"; the debrief asks for the setting at any length a file can have and looks in the file for one the file reader dropped, so it is never lost unsaid); at most 100 frames a layer; a layer from the list of three; a frame time that is a whole number of seconds (one outside the flight's window, from an hour before its start, for the frame at or before it even on a slow step, to its end, is left out rather than failing the block, as when the flight's own times have moved, and a line says how many ("The saved radar and lightning has 3 pictures outside the flight, so they were left out."; a debrief saved again does not have them); a block with none inside is refused; the fetch keeps by the same window, so what it keeps is read back); a flight whose start or end is not a number reads nothing; a MIME type of `image/png` only (what ECCC is asked for; never SVG, JPEG or WebP, whose sizes are not read so simply), that the image's first bytes bear out; a width and height read from the PNG's own header, each 1 to 1,024 (a small file can decode to a huge picture, so the size is checked before anything is decoded, and the map refuses an image that decodes larger than that too); strict base64; 1.5 MB a frame and 25 MB in all; a box in range, in order and no larger than 30°; no two frames for one layer and time. Unknown fields are dropped. Frames go to the map only as images (`data:` URIs on `Image`, drawn to the canvas); nothing from the file is HTML.
- **Playback.** A layer draws the last of its kept frames at or before the playback time, with the same age limits as any weather layer (radar and lightning, 20 minutes; `MAX_AGE_S`), and never a later one. Each frame keeps its own time, so the line under the map says "Radar 14:30Z, 2 min before · Data Source: Environment and Climate Change Canada" (ECCC's attribution). Before the first frame, or beyond the age limit, nothing is drawn and the line says so. A picture that passes the checks but does not decode is not drawn, and the line does not name a time for it ("Radar: the picture couldn't be drawn."; with only one of rain and snow failing, the other's time and "; a picture couldn't be drawn"), and ECCC's credit is not shown for a picture that isn't. Radar is drawn over the satellite and charts and under the routes, grid and tracks, at 90 % opacity (real rain is faint at 75 %), smoothed as the browser scales it; lightning at full opacity above it. Both are drawn on the 2D map only (as the satellite is): the 3D view draws none. Closing the flight or the debrief cancels a fetch under way; closing a flight whose fetched frames are not yet in a saved file asks first, because they can't be fetched again, and so does reloading or closing the tab (the browser's own "Leave site?" question). Switching to another tool inside the app (or Back and Forward) asks too, through the app's leave check (`app.canLeave`); Cancel keeps the Debrief and its pictures. The Weather menu's line is read out by a screen reader only once the offer is pressed (while fetching, the result, or "Not kept" if the 3 hours ran out); loading a flight or opening a file reads nothing out.
- **Writing the file.** Before **Save debrief** writes the block it reads it back through the same checks against this flight's window, and writes it only if it comes back whole; otherwise the debrief is saved without it and a line says so plainly ("The radar and lightning couldn't be put in the file (…), so this debrief was saved without them. They stay here until you close the flight."), and closing still asks. The same goes for a file that would be over the size the tool opens again (`MAX_DEBRIEF_BYTES` in `flight-data`, counted in bytes, 189 MiB: four full tracks plus a full radar set, `SAVED_WEATHER_BYTES` 37 MiB, app frame #226): it is saved without the radar and a line says so ("This debrief file would be over the size this tool opens (189 MB), so it was saved without the radar and lightning. They stay here until you close the flight."); with the limit raised this only happens past four full tracks. Only pictures that went into a file count as saved: saving before the fetch, or while it runs, does not.
- **Progress and cancel.** While fetching, the button reads **Cancel** and a line says "Saving radar and lightning: 12 of 39". Cancelling keeps nothing.

**Against the timeline.** Each layer shows the slice nearest the playback time and never one from the future beyond a small step: satellite and radar take the last frame at or before the moment, METARs the report in force, model winds are blended by time between the hour at or before the moment and the next hour (as a vector, like the levels), so they change smoothly instead of stepping at the hour, and the label names both hours ("HRDPS 14–15Z"); with no next hour, or none within 90 minutes, the hour at or before stands alone. Each slice carries its own time, so no picture is mistaken for the exact moment. Scrubbing changes the slice at once; playing fetches frames just ahead so it doesn't stall.

**Limits kept.** Frames are fetched only while their toggle is on (R5), cached for the session, and cut off at a size limit per debrief file (25 MB of radar and lightning images, above). A source that fails says so in the layer's corner and leaves the rest working.

**Who owns what.**
- The debrief owns the Weather menu, the time slicing and the drawing: `src/modules/debrief/weather/`.
- `src/wx` (Weather parser thread) owns METAR decoding. No new parser.
- The raster layers (radar, lightning, satellite) are the same the SOF shows, so their tile and WMS loading goes to `src/ui-kit/` through the app frame, like the tile loader.
- Adding weather to the debrief file is a change to `flight-data`'s file format, so it goes through the coordinator to the owner of `src/flight-data/`. Until then the saved radar and lightning ride in one string under the file's `settings` (which `readDebriefFile` keeps if the debrief lists it, up to a length the debrief sets), so nothing in `flight-data` or `storage/` changes; the change to ask for is a first-class, checked `weather` field with the same content, and the debrief then moves the block there in one place (`debrief-session.js`).
- The new hosts (NASA GIBS, Open-Meteo, IEM, ECCC GeoMet) join the site's CSP through the app frame.

**Checks at build start** (done 2026-09-30 07:35Z to 07:51Z; results in the project's wx-sources notes): every source answers a browser on the live site's address with no key (`Access-Control-Allow-Origin: *`). IEM has CYMJ back to 2003 or earlier (no reports overnight, about 00:30Z to 10:00Z). GIBS keeps GOES-West frames for about 90 days. ECCC keeps 3 hours, needs the exact frame TIME, and answers a missing one with 200 and XML, so the content type is checked.

**Skills used:** spec-driven-development, incremental-implementation, test-driven-development (the time slicing and nearest-airfield pick are pure and tested in Node), frontend-ui-engineering, security-and-hardening (outside data shown only as text or images), performance-optimization (frames fetched only when on; the SPECI call only after the first, one at a time).

### Module structure

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
    input.js         drag to orbit, wheel and keys to zoom; in Cockpit, drag turns the head; in Chase, drag swings round the ship
    camera-bar.js    the camera bar over the picture and its keys (DB-22)
    camera-modes.js  the bar's choices and how they map to the saved settings: plain values
    aim.js           the Chase camera's place and where Padlock turns the head (three.js vectors)
    cockpit.js       Cockpit camera: the ridden ship's smooth attitude table and the panel's numbers
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

### Performance (R5, smooth playback)

Following `.claude/skills/performance-optimization`: measure first, one change at a time, and log each attempt in the PR.

- The debrief's code loads only when its card is opened. The example tracks (about 11 MB), VNC charts (about 9.7 MB as V6's PNGs) and EM images (about 0.9 MB) load only when asked for.
- Targets on the example flight at 1920 × 1080, measured with `npm run build` and `npm run preview`: playback at 16× keeps 60 frames per second on a mid-range laptop, and a paused debrief draws nothing.
- Track points are projected once per load and view change, not every frame. The VNC warp is cached. Readouts update at most 10 times a second.
- Whether to re-encode the VNC chart PNGs (for example as WebP) is decided by measurement and a side-by-side look, and asked first if it changes how they look.

### Security (untrusted files)

Following `.claude/skills/security-and-hardening`. Files are checked where they come in by `flight-data` (sizes, shapes, no entities, all or nothing). In the debrief:

- Nothing from a file reaches `innerHTML`: track names, DFP labels, notes and status text go in through `textContent` or ui-kit `h()`.
- Map tiles come from one fixed Esri address, built from numbers only. There's no user-entered URL.
- Route overlays are built into the code, not loaded from outside.
- A debrief file's settings are checked field by field before use (the standards must be finite and in range, per the ui-kit number-control rule).

### Commands

```
npm run dev                 # the debrief at http://localhost:5173/#/debrief
npm test                    # unit and golden tests
npm run test:e2e            # browser tests
python3 tools/rebuild_original.py /tmp/v6.html   # V6, to compare side by side
```

### Code style

As in `core` and `flight-data`: plain ES modules, pure functions where possible, units in names, and a comment naming the V6 line each ported piece came from.

```js
// src/modules/debrief/view3d/scene.js
/** Screen position of a world point for the 3D camera (V6 project, line 3584). */
export function projectPoint(pt, camera) { ... }
```

### Testing strategy

1. **Golden first (D10).** The debrief's own V6 drawing math is pinned before it moves, with V6's code run in Node through `archive/tests/golden/v6-source.js`: the map's world-to-screen transform, the VNC warp, the 3D projection and attitude (bank and pitch), and the CSV rows. Changes (D40, the #27 drawing fixes, the CSV layout) then land as separate commits that update the pinned value on purpose.
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

   The debrief owns `tests/e2e/debrief.spec.js` and `archive/docs/checklists/debrief.md` as new files (agreed with the app-frame thread, which owns the rest of `tests/e2e/`).
4. **Sign-off checklist** `archive/docs/checklists/debrief.md` (R21): load your own ForeFlight tracks, play, switch views, add and save DFPs, reopen the file, check #4 is visible, compare a few numbers with V6 side by side.

### Boundaries

- **Always:** read the flight from `flight-data` and every number from `core`; pin V6 before changing a number or a drawing; keep the module inside `src/modules/debrief/`; run `npm test` before each commit.
- **Ask first:** any change to a number V6 shows beyond D31, D39, D40, D47 and D49 to D54; any tennis-ball rule beyond Patrick's answers to Q33 to Q37; changing the default standards; adding a package (including any 3D library); a new outside data source.
- **Never:** edit `original/`, `src/core/` or `src/flight-data/` (changes go to their threads through the coordinator); put file content into `innerHTML`; keep a timer or animation loop outside the ui-kit scheduler.

### Success criteria

- R11, R12, R17 and R18 each pass their browser test, and R2, R3, R4 and R7 pass on the debrief route.
- The golden tests pass for V6's behaviour, and each approved change (D31, D39, D40, D47, #21, #27) is its own tested commit.
- Issues #21 and #23 to #29 are closed by the change that fixes them, and the debrief parts of #19, #34 to #39 and #43 are gone.
- Patrick (or anyone, D28) signs off the checklist on the live site.

### Plan (after approval)

The tasks go in `archive/tasks/debrief` once this spec is approved. The expected order, each slice working on its own:

1. Screen, load, status, 2D tracks, playback bar and fit-to-view.
2. Readouts and standards.
3. DFPs, save and open.
4. Map layers: satellite, VNC charts, route overlays, 3/9, cone, clock marks, bubble.
5. The 3D view (V6 pinned, then D40 and the #27 fixes).
6. EM chart, tennis ball, CSV export.
7. Weather at the time of the flight (approved 07:21Z).

It needs, from other threads: ui-kit `controls.js` and `canvas-view.js` before slice 1, `standards.js` (core PR 3) before slice 2, and `core`'s tennis-ball changes (Q33 to Q37) before slice 6.

### Open questions

1. **#4's new colour:** white with a dark outline. Say if you'd prefer another (for example yellow).


## From `archive/specs/SPEC-flight-data.md`

## Spec: `flight-data`, flight tracks for the debrief

Status: **approved by Patrick on 2026-09-30** ("spec-flight-data-approved", in the Flight data thread), which also logs C5 to C9 and the 5 s / 450 kt data-quality rule as decisions. Changes go through a pull request. Module id `flight-data` in [`archive/SPEC.md`](../../../archive/SPEC.md). Requirement IDs (R#), decisions (D#) and questions (Q#) refer to the plan doc: https://claude.ai/code/artifact/29712036-a126-43c3-ac39-57ba919ff102

### Objective

Turn ForeFlight track logs (KML) into one clean, shared flight model that the debrief's 2D map, 3D view, readouts and EM chart all read from. V6 reads each file in one place but then keeps four playback clocks, reads bad GPS fixes as real flight, and loses everything on reload (issues #22 to #25). `flight-data` replaces that with:

1. **Loading:** up to 4 track files, or the example flight, loaded all at once or not at all, with a clear status (R11, D20).
2. **Cleaning:** impossible fixes dropped and GPS gaps marked, with a note saying what was changed (D32). Recorded bank used when a track has it; a blank pitch column estimated, not read as 0° (D47).
3. **One flight model** with the shared time window, interpolated positions, speed, heading, recorded or estimated G, bank and pitch.
4. **One playback clock** for every view (#24, R12).
5. **The debrief file:** tracks, debrief focus points (DFPs) and settings saved to a file and reopened exactly as they were (R17, D21, #25).

Users are instructors and students debriefing a sortie. They never see `flight-data` itself, only the debrief screen built on it (`debrief`, the next module).

### Assumptions

1. ForeFlight KML is the format to support and test (D20). All five real tracks we have (V6's four examples from 2026-06-02 and Patrick's flight from 2026-09-25) use the same layout: one `gx:Track` of `<when>`/`<gx:coord>` pairs, then `gx:SimpleArrayData` columns (`acc_horiz`, `acc_vert`, `course`, `speed_kts`, `altitude`, `bank`, `pitch`, and on #3 and #4 `g_load`). Plain `<coordinates>` KML is still read, as V6 does.
2. Files are read with our own small KML reader, not the browser's XML parser. It reads only the tags V6 reads, runs the same in the browser and in Node's test runner (no package needed), and never expands XML entities. The golden test proves it gives V6's points exactly (see Testing).
3. Everything stays on the user's computer. Nothing is uploaded anywhere.
4. `core` owns the numbers (`geo.js` projection, `units.js` factors, `time.js` KML times, and the estimated-G formula coming in core's Task 8). `flight-data` calls them and never keeps its own copy.
5. Folder: `src/flight-data/`, as the approved module map names it (not `src/data/`), with tests in `tests/unit/flight-data/` and `archive/tests/golden/`.

### What V6 does today (the behaviour we pin first)

| V6 function (line in `original/shell.html`) | What it does |
|---|---|
| `parseKmlText` (2318) | Reads `<when>` and `<gx:coord>`, recorded G (`g_load` and similar names, 0 to 12) and pitch (±90°) by index. Never reads bank. Sorts by time. |
| `projectAll` (2376) | Projects every track to feet around the first fix of the first track. Playback runs from the latest start to the earliest end; if the tracks don't overlap it silently switches to the earliest start to the latest end. |
| `interpTrack` (2430) | Straight-line position, altitude, G and pitch between fixes; speed from the two fixes around the time (factor 0.592484). |
| `headingAtTrack` (2151) | Heading from the two fixes around the time (0 = east, D35). |
| `aircraftPitchAtTrack` (2446) | Recorded pitch if present, otherwise climb angle over ±1.5 s, capped at ±30°. |
| `estimatedGAtTrack` (2462) | G from turn rate and speed over ±1.5 s (the formula moves to `core`). |
| Playback loop (3262), `DADS3DAPI` (2113) | The clock the 2D, 3D and EM views share, 0.25× to 16×. |

### Changes from V6

Under D10, each change below lands as its own commit **after** the golden test has pinned V6's behaviour, and that commit updates the pinned value on purpose.

| # | Change | Why | Authority |
|---|---|---|---|
| C1 | A blank value in a recorded column is "no data", not 0. | V6 reads the blank pitch on #1, #2 and Patrick's track as 0°, so it never estimates it. | D47 |
| C2 | Read the recorded `bank` column (±180°) and use it when present; otherwise estimate bank from the turn, as now. | #3 and #4 record bank, including rolls past 90°. | D47 |
| C3 | Drop impossible fixes: ForeFlight's −100,000 m "no altitude" value (any altitude outside −500 m to 20,000 m), coordinates outside ±90°/±180°, and position jumps no T-6 can fly (see Data quality). | V6 draws #2 at −328,084 ft and speeds of 1,025 kt. | D32 |
| C4 | Mark GPS gaps: more than **5 s** between good fixes. The line breaks there, and interpolated values report "in a gap" so the debrief blanks spacing readouts. | V6 draws gaps of up to 81 s as straight flight. | D32 |
| C5 | Every fix needs its own time. A file whose `<when>` count doesn't match its coordinates, or with unreadable times, is refused with a message (V6 falls back to the point number and puts the flight in 1970). | Issue #22. | Spec approval |
| C6 | The first and last frame show the speed of the nearest segment, not 0 kt. Latitude and longitude are interpolated like x and y. | Issue #24: Lead reads "SLOW" at the start and end. | Spec approval |
| C7 | Heading is "unknown" (null) when the aircraft hasn't moved (duplicate fixes, taxi), not due east. | Issue #22: 3/9 line, aspect and labels flip at random on the ramp. | Spec approval |
| C8 | Tracks that don't overlap in time are refused with a message naming the one that doesn't fit, instead of V6's silent switch. The window stays V6's "common playback" (latest start to earliest end), and the status says when a track was cut. | Issue #22: one file from another day produced a days-long slider. | Spec approval |
| C9 | Load is all or nothing: if any file fails, nothing already loaded is lost and the message names the file and the reason. | Issue #23. | Spec approval |
| C10 | Pitch and G are estimated from the track by default. Recorded pitch and G are still read and kept, but not shown unless a setting asks for them. Recorded bank is still used (C2). | On #3 and #4 the recorded pitch doesn't follow the climb angle at all (correlation −0.2 to 0.1 at any time lag) and swings while parked, so it's the iPad moving, not the aircraft. | Patrick, Q32 (2026-09-30) |

C1 to C4 were already decided (D32, D47). Patrick's approval of this spec settled C5 to C9 (they fix bugs rather than change flight math, but C6 and C7 change numbers V6 shows).

### Data quality (C3, C4)

- **Gap:** more than 5 s between consecutive good fixes. ForeFlight logs about once a second (median 1.00 s on all five tracks). A track whose times sit off the GPS second (an external GPS relayed to the iPad) is snapped back to its seconds and its gaps worked out again on the snapped times (DB-25, "GPS timestamps" above); on the example the gap counts don't change.
- **Impossible jump:** a fix, or a run of up to 5 fixes, that the aircraft would need more than 450 kt ground speed to reach from the last good fix, when a later fix within those 5 is reachable at a normal speed. Speeds are measured over at least 1 s, because #4 logs some fixes 0.5 s apart, which looks like 550 kt if divided naively although the positions are fine. ForeFlight's own speed column peaks at 389 kt (#2), apart from one 7,637 kt glitch on #3.
- **What this does to the real tracks** (tried on all five before writing this): it drops 1 fix on #1, 23 on #2 and none on #3, #4 or Patrick's track, besides Patrick's 21 and #2's 1 at −100,000 m. The fastest segment left is 445 kt. Gaps over 5 s: 12, 25, 9 and 6 on the examples, 6 on Patrick's (7 before cleaning: two of them sit either side of a −100,000 m fix and become one).
- **Acceptance:** after cleaning, no segment on the five tracks implies more than 450 kt, no fix on #3, #4 or Patrick's track is dropped for a jump, and every −100,000 m fix is dropped. The rule is pinned by tests on these tracks, and the numbers (5 s, 450 kt, 5 fixes) are named constants in one place.
- **The status note** says, per track, how many fixes were dropped and why, and how many gaps there are and the longest.
- `acc_horiz` (ForeFlight's accuracy estimate) is kept with each fix but does not drop fixes on its own: #1's bad fix reports good accuracy, and many of #2's poor-accuracy fixes are in the right place.

### The flight model

Plain objects, no classes, no page access:

```js
// A loaded, cleaned track. Units are in the names.
{
  slot: 1,                   // 1 to 4, the ship number (#1 is lead)
  name: '#1 Lead - ED2F5',   // file name or example nickname (D22), shown as text only
  fixes: [{ t, lat, lon, altM, xFt, yFt, altFt, gRecorded, pitchRecordedDeg, bankRecordedDeg, accHorizM }],
  gaps: [{ fromT, toT }],
  dropped: { altitude: 21, position: 0, jump: 0 },
  has: { g: false, pitch: false, bank: false },
}
// A flight: up to 4 tracks on one map and one time window.
{ tracks: { 1: track, 2: track, ... }, ref, startT, endT, cutTracks: [4] }
```

Functions (names may shift slightly when written, the list will not):

| File | Functions |
|---|---|
| `kml.js` | `readKml(text, name)` returns a raw track or throws a readable `KmlError`. |
| `clean.js` | `cleanTrack(raw)` applies C1 to C4 and returns the track plus its notes. |
| `flight.js` | `buildFlight(tracks)` (projection, window, C8); `sampleAt(track, t)` returns position, lat/lon, altitude, speed, heading, G, bank, pitch, each with its source (recorded or estimated) and an `inGap` flag. |
| `clock.js` | The playback clock (below). |
| `debrief-file.js` | `toDebriefFile(flight, dfps, settings)` and `readDebriefFile(text)`. |
| `examples.js` | The example flight's four file names and nicknames (the files themselves are fetched only when asked for, R5). |

### The playback clock (#24, R12)

One clock for every view. It holds no timers of its own: the ui-kit scheduler calls `clock.tick(nowMs)` each frame while the debrief is open (R4).

- Play, pause, reset, seek to a time, step ±1 s, and speeds 0.25× to 16× as in V6.
- Play at the end starts again from the beginning (V6 does nothing).
- A frame longer than 0.25 s of real time (a hidden tab, a slow frame) moves the clock by 0.25 s at most, so it never jumps ahead.
- Seeking lands on exact seconds, so a DFP can be set at a chosen moment.

### The debrief file (R17, D21, #25)

A JSON file (`.dadsdebrief.json`) holding the original KML text of each track, the cleaning settings, the DFPs of **this** flight (each with its time, label and note, sorted by time) and the debrief settings. Reopening re-reads the KML with the same settings, so the flight comes back exactly as it was. Saving and opening the file itself is `storage/file.js`'s job; `flight-data` owns the format and checks it. A file over `MAX_DEBRIEF_BYTES` (189 MiB: four full tracks with room for JSON escaping, 2 MiB for DFPs and settings, and 37 MiB for the Debrief's saved radar and lightning in its settings) is refused before it is read.

### Security (untrusted files)

KML and debrief files come from anyone. Following `.claude/skills/security-and-hardening` and `.claude/references/security-checklist.md`:

- **Size and shape are checked where the file comes in:** at most 30 MB per KML file (Patrick's 96-minute flight is 2.5 MB), 200,000 fixes per track, 4 tracks, 500 DFPs, and fixed lengths for names (80 characters) and notes (2,000). Anything over is refused with a message, before any work is done.
- **No entity expansion or external references.** The reader never expands `<!ENTITY>` and refuses a file with a `<!DOCTYPE>`, which a ForeFlight KML never has. A KMZ (zip) is recognised and refused with "export as KML".
- **Nothing from a file is ever put into `innerHTML`.** Names, notes and status text reach the page only through `textContent` or the ui-kit's `h()`. `flight-data` returns plain strings and numbers and never touches the page.
- **The debrief file is checked field by field against an allowlist:** unknown fields are dropped, numbers must be finite and in range, strings are length-capped. `JSON.parse` failures and bad shapes give one plain message, never a stack trace.
- **Only what's needed is read.** Pilot name, tail number and notes in a KML are not read or stored.

### Commands

```
npm test                                       # unit + golden tests (node --test)
python3 tools/rebuild_original.py /tmp/v6.html # V6 for the browser recording below
NODE_PATH=$(npm root -g) node tests/golden/checks/record-flight-data.cjs /tmp/v6.html
```

### Project structure

```
src/flight-data/   README.md kml.js clean.js flight.js gap-fill.js clock.js debrief-file.js examples.js
tests/unit/flight-data/   *.test.js   meaning: gaps, dropped fixes, clock, file checks, abuse cases
tests/golden/      flight-data-*.test.js   V6 vs flight-data
                   v6-flight-data.json     V6's parse results recorded in Chromium
                   checks/record-flight-data.cjs   the recorder
tests/fixtures/flight-data/   small hand-made KML files (edge cases, broken files)
```

The four example tracks are read from `original/assets/` by the tests. Patrick's own track is used for local checks only and is **not** committed to the repository.

### Code style

As in `core`: plain ES modules, pure functions, units in names, a comment naming the V6 line each ported piece came from.

```js
/** Straight-line position between the fixes around time t (V6 interpTrack, line 2430). */
export function sampleAt(track, t) { ... }
```

### Testing strategy

1. **Golden, parsing.** V6's `parseKmlText` needs the browser's XML parser, so a recorder runs it in Chromium on the four example tracks, Patrick's track and the edge-case fixtures, and saves a fingerprint of every point plus a few hundred sample points in `archive/tests/golden/v6-flight-data.json`. The golden test checks that `readKml` gives identical points (before C1 to C5). Patrick's track's fingerprint is committed, not the track.
2. **Golden, everything after parsing.** V6's `projectAll`, `interpTrack`, `headingAtTrack`, `aircraftPitchAtTrack` and `estimatedGAtTrack` run unchanged in Node (via `archive/tests/golden/v6-source.js`) on the same points, at a few thousand seeded times across the example flight, and must match exactly.
3. **Each change (C1 to C10) is its own commit** that flips the golden expectation it touches and adds a unit test saying what it now means.
4. **Unit tests** for meaning and abuse cases: gap and jump rules on the real tracks, a 1970 timestamp, too many fixes, a DOCTYPE bomb, a KMZ, a truncated file, a debrief file with extra fields or a 10 MB note, every clock control.
5. **Mutation check** as in `core`: the tests must turn red when a threshold, a sign or a boundary is changed on purpose.

### Boundaries

- **Always:** pin V6 before changing; keep 5 s and 450 kt as named constants; run `npm test` before each commit; treat every file as hostile.
- **Ask first:** any change to a number beyond C1 to C10; adding a package; changing the debrief file format once people have saved files.
- **Never:** edit `original/` or `src/core/` (core changes go to the Flight math core thread); commit Patrick's own track; put file content into `innerHTML`.

### Success criteria

- The example flight and Patrick's track load, clean and play with a correct status (R11).
- The golden tests pass for V6's behaviour, and each of C1 to C10 is a separate, tested change.
- No −100,000 m fix, no segment over 450 kt, and no line drawn across a gap of more than 5 s on any of the five real tracks.
- A saved debrief reopens with the same tracks, DFPs and settings (R17).
- Every abuse case in the unit tests is refused with a readable message.

### Plan

PR 1 ports V6's reading, projection and sampling under golden tests. PR 2 adds C1 to C10, one commit each. PR 3 adds the clock and the debrief file. The tasks go in `archive/tasks/flight-data` once this spec is approved.

### Open questions

None. Q32 (recorded pitch and G on #3 and #4) was answered by Patrick on 2026-09-30 and is change C10.

### Future idea, not in this module

Calibrating the iPad against a stretch "on the runway" or "straight and level" (Patrick, Q32). Checked on #3 and #4: a fixed offset can't rescue their recorded pitch, because it doesn't follow the aircraft's climb and dive at all, and it moves by up to 13.5° (standard deviation) while parked. Recorded G is already within 0.01 to 0.02 of 1 G in level flight, but reads 0.94 on #3's ramp, so a ramp calibration would make it worse. It could work for an iPad on a fixed mount; it needs a track from one to test.
