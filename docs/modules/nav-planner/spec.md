# Low-level Navigation Planner: spec

Dad's ask and picks (16 Oct 2026, `plan.md`); Patrick's yes, relayed by Dad, 16 Oct 2026: "pat yes, build the nav planner" (ALL-43). This spec covers plan steps 2 to 5 at Moose Jaw; step 6 (the US bases' charts, obstacles and training routes) is not in it. **Not for flight planning**: the screen says so in its top bar and on the route card; it is a training and debrief tool, never a replacement for authorized mission planning.

Every number below names its source, or says "estimate" when no manual page or ruling backs it yet (rule book). Working answers to the plan's open questions are marked **working answer**; each holds until Patrick or a manual page says otherwise.

## Which airspeed, which heading, which height

- **Planned airspeed is indicated (KIAS)**, typed per leg. **True airspeed (KTAS)** comes from it at the leg's altitude on the standard day (core `iasToTasKt`, standard aerodynamics; no temperature correction: an estimate for a non-standard day). **Ground speed** comes from the true airspeed and the leg's wind through the wind triangle (core `windTriangle`). Leg times use ground speed. Speeds are only compared like with like.
- **Default planned airspeed: 240 KIAS** (working answer, an estimate until Patrick or a manual page gives the CT-156's low-level speed). Settable per leg, 100 to 320 KIAS in the table (a file may hold 60 to 400; published limits are flagged, never walls).
- **Track** is the leg's true track (°T), the rhumb line from one turn point to the next, worked out on the flat local map centred on the leg's middle (core `geo.js` `latLonToLocalFt`, `compassDegFromVector`): for low-level legs (under about 100 NM) it is within a degree and a tenth of a mile of the sphere's (estimate). **Magnetic track and heading** use Moose Jaw's variation, 9° E (Patrick's ruling, TR-65; the Traffic sim's `MAG_VARIATION_DEG_E`, imported, not copied): °M = °T − 9. The heading to fly (°M) is the true track plus the wind triangle's crab, less the variation.
- **Heights:** each leg's height is typed as **AGL** (above the ground) or **MSL** (above sea level), default **500 ft AGL** (estimate: a common low-level height, until Patrick says). **An AGL leg is flown contouring**: the aircraft holds that height above the ground under it, so its clearance is the AGL height itself; **an MSL leg is flown level** at that altitude, so its clearance is the altitude less the ground under it (working answer; NP-4 and NP-Q1 ask Patrick). The altitude used for true airspeed and the winds is the leg's MSL altitude: for an AGL leg, the ground's average along the leg plus the AGL height (the field's 1,892 ft plus the AGL height while the terrain is unknown, estimate).
- **Distances** are nautical miles; **times** minutes and seconds; **fuel** pounds.

## The screen

Picture: `screen.png` in this folder (the built screen, V2.483). V6 had no such screen.

- **Top bar:** "Low-level Navigation Planner", the version, and "Not for flight planning. Training only." in plain words.
- **Left column ("Setup"):**
  - **Route:** New, Example (a made-up five-leg route round Moose Jaw to try the planner, said as made up), Open and Save (the route file), Import KML or GPX, Export KML, Export GPX. "Add points by tapping" (on to begin with).
  - **Plan:** start fuel (lb), fuel flow (lb/h), minimum clearance to flag (ft), and the **Wind** choice: None (still air), Typed (one wind for every leg, from °T and knots), or Model winds aloft (date and time in Zulu; the Debrief's HRDPS or HRRR winds at each leg's middle, altitude and time).
  - **Flown track (debrief):** Load KML, Close. Closed until wanted.
- **Middle:** the map (2D) or the 3D view, with a bar under it: 2D | 3D, Fit, the fly-through's Play/Pause, speed and scrubber (3D), **Brief** (full-screen Brief mode), **Route card** (print).
- **Below the map:** the **Turn points** table and the **Legs** table; with a flown track loaded, the **Plan against flown** table.

### Turn points table (editable)

One row per turn point: number, name (typed, up to 40 characters), latitude and longitude (degrees, five decimals, typed or dragged), and for the leg leaving it: height (ft) with AGL | MSL, and planned KIAS. The last point has no leg after it. A ✕ deletes the point. A selected row lights its point on the map.

### Legs table (worked out)

One row per leg: from and to; true track (°T); magnetic track (°M); heading to fly (°M); distance (NM); altitude used (ft MSL, "≈" while the terrain is estimated); KTAS; wind used (°T/kt, or "still air"); ground speed (kt); leg time; running time; fuel used and fuel remaining (lb); lowest clearance (ft) with the highest ground along the leg (ft MSL) and, for every leg, the MSL altitude that would clear that ground by the minimum. A leg below the minimum clearance shows **[LOW]** in red (a flag, never a wall); a leg whose terrain tiles are missing shows **unknown** in grey, never a clearance; a leg that can't hold its track in the wind (crosswind stronger than the airspeed) shows **[NO TRACK]**. A total row gives distance, time and fuel.

### Map

The Debrief's 2D map pieces (ui-kit `canvas-view.js` pan and zoom, `map-tiles.js` Esri World Imagery, the same darkening), centred on CYMJ to begin with. Drawn: the route line, each turn point as a ring with its name, each leg's label (°M, NM, time), a leg below the minimum in red with [LOW], a leg with unknown terrain dashed, the highest point of each leg as a small triangle with its height, and the flown track (with a debrief loaded) in its own colour.

- **Tap** the map (a click without a drag) to add a turn point at the end of the route (while "Add points by tapping" is on).
- **Drag** a turn point to move it. **Click** a point to select it; **Delete** removes the selected point; the table's ✕ does the same.
- No snapping to known points (working answer; `future.md`).

## Terrain clearance (plan step 3)

- **Source:** the shared Terrarium elevation tiles (Mapzen/AWS: USGS, NRCan and others; about 30 m data, so every clearance is **an estimate**), loaded at zoom 12 (about 80 ft a pixel at Moose Jaw) by the Debrief's `terrain-heights.js`, imported as it is, one loader per tile so a tile is fetched once however the route changes. At most 160 tiles (estimate: a 150 NM route needs about 60 to 90).
- **Sampling:** every 300 ft along each leg's centreline (estimate: about four samples a pixel), plus the turn points. No corridor either side yet (`future.md`).
- **Clearance:** an MSL leg's lowest clearance is its altitude less the highest sample; an AGL leg's is its AGL height (contouring). The highest sample is marked on the map and in the table.
- **Minimum clearance to flag: 500 ft** (working answer, an estimate until Patrick or a manual page; settable 0 to 5,000 ft). Below it the leg is flagged [LOW]. A flag, never a wall: nothing stops a lower plan.
- **Obstacles:** none. **No Canadian obstacle data is known to be free** (plan.md), so towers, wires and buildings are not in the clearance; the Legs table's heading and the Brief mode say "Obstacles: not shown (no Canadian obstacle data)".

## Times, fuel and wind (plan step 2)

- **Leg time** = distance ÷ ground speed. **Running time** adds the legs from the first turn point.
- **Fuel:** fuel used on a leg = fuel flow × leg time; fuel remaining = start fuel − fuel used so far. **Start fuel 1,100 lb** and **fuel flow 500 lb/h** are **estimates** (no CT-156 fuel figure is in the tool, its docs or the open-source baseline; searched 16 Oct 2026); both are settable, and the screen labels them "estimate". One flow for every leg (no climb or speed term).
- **Wind:**
  - **None (still air)** to begin with: every leg's wind cell says "still air".
  - **Typed:** one wind for every leg, from (°T, as forecast winds aloft are given) and speed (kt). Range 0 to 360°, 0 to 150 kt.
  - **Model winds aloft:** the Debrief's Open-Meteo archive (`weather/winds.js`: HRDPS, or HRRR before HRDPS's archive starts), one request for every leg's middle, at the leg's MSL altitude and the time the aircraft reaches that leg (the chosen take-off time plus the running time), blended between levels and hours as the Debrief does. Credited "Open-Meteo (CC BY 4.0)".

## Brief (plan step 4)

- **3D view:** the shared ground (ui-kit `terrain3d.js` heights with the Esri picture draped by `draped-ground.js`), the shared sky, the runways round the route (`airfield3d.js`), the route line at its planned heights (AGL legs follow the ground plus their height), each turn point a tall pole with its name, and the shared CT-156 model (`ct156-model.js`). The ground is centred on the route.
- **Fly-through:** the CT-156 flies the route at each leg's planned ground speed, its nose on the leg's heading (crabbed into the wind), straight legs with the turn at each point taken at once (a simplification: no turn radius). Play, Pause, speed (1×, 2×, 4×, 8×, 16×, 32×), a scrubber with the running time. The camera follows behind and above; drag to swing round it, the wheel to move closer or further.

### Brief mode (Dad, 16 Oct 2026: "COuld this be a low level Briefing tool"; card pick "Add a Brief mode"; NP-11)

A **Brief** button opens a full-screen page for briefing a room, one leg at a time, with **Next** and **Back** (and the → and ← keys; Esc closes). For each leg:

- **The run-in picture:** the 3D view from the pilot's eye at the leg's planned height, **1 NM before the turn point it ends at** (estimate: a typical run-in distance for picking up a turn point; NP-11), looking along the leg at the turn point, which carries its pole and name. The ground round that turn point is loaded sharper (an inner square 6 NM across) so the picture reads.
- **The leg's numbers:** from and to, heading to fly (°M) and magnetic track, leg time and running time, ground speed and KIAS, height (AGL or MSL as planned), fuel remaining at the turn point.
- **Hazards:** the lowest terrain clearance with its flag ([LOW], or unknown when tiles are missing), the highest ground on the leg, and "Obstacles: not shown (no Canadian obstacle data)".
- A first page gives the whole route: total distance, time, fuel, the wind used and "Not for flight planning".

### Route card (plan step 3)

**Route card** opens the browser's print dialog with one page: the route's name, date and time, the wind used, the start fuel and flow (estimates), and the legs table's columns that a pilot carries (leg, heading °M, track °M, distance, height, KIAS, ground speed, leg and running time, fuel remaining, lowest clearance with its flag), "Not for flight planning", "Terrain and fuel are estimates" and "Obstacles not shown".

## Debrief: the flown track against the plan (plan step 5)

- **Load KML** reads one ForeFlight track with the Debrief's loader (`flight-data/load.js` `loadFlight`: size-checked, strict XML, bad fixes dropped), or refuses it with the loader's reason; the plan is untouched either way.
- **Turn points:** each turn point's **pass** is the flown fix nearest to it, searched in order (each after the last one's pass, so a route that ends where it started works). The miss distance (NM) and the pass time are shown. The plan's clock starts at the first turn point's pass; each later point is **early or late** by its pass time less (first pass + planned running time), in minutes and seconds.
- **Legs:** for the fixes between two passes, the **cross-track error** (core `legOffsetsFt`), its largest (left or right) and its average (of the size), in NM; and **height against plan**: the average flown altitude less the leg's planned MSL altitude (ft), and the lowest flown altitude (ft MSL). ForeFlight's heights are GPS heights, not pressure altitude (said under the table).
- **Drawn:** the flown track over the planned line in 2D, and in 3D the CT-156 replays the flown track at its own times (Replay: Plan | Flown), with the planned line beside it.

## Files (all untrusted when opened)

- **Route file** (`.navroute.json`): `{ format: "dads-nav-route", version: 1, name, savedAt, settings: { startFuelLb, fuelFlowPph, minClearanceFt, wind: { mode, fromDegT, kt, timeZ } }, points: [{ name, lat, lon, heightFt, heightRef, kias }] }`. On open every value is range-checked: 2 to 50 points; latitude −85 to 85, longitude −180 to 180; height 0 to 20,000 ft; AGL or MSL; KIAS 60 to 400; names up to 40 characters of plain text; the file at most 1 MB. One bad value refuses the whole file, saying which and why; nothing is half-loaded.
- **KML export:** a line of the route (absolute altitudes where the MSL is known) and a named point per turn point. **GPX export:** a `<rte>` with a `<rtept>` per turn point (name, elevation when known).
- **Import KML or GPX:** read with the strict XML reader the Debrief uses (`flight-data/xml.js`: no DOCTYPE, well-formed only, depth-limited). KML: the named points in order, else the first line's coordinates. GPX: the first `<rte>`'s points, else the waypoints. 2 to 50 points, each range-checked; a file with more (a recorded track) is refused with "this looks like a flown track: load it under Flown track". Imported points take the default height and KIAS.

## When data fails

| What fails | What the planner does |
|---|---|
| No winds (model fails, rate-limited, no wind at that time or height) | Still air on that leg, said on every such leg ("still air: no model wind at 2,400 ft"), and the reason in the Wind box. |
| Terrain tiles missing or still loading | That leg's clearance and highest point say "unknown" (or "loading"), never a clearance. A leg already below the minimum where tiles did come is still flagged [LOW]. AGL legs' altitude used for KTAS is "≈" the field's elevation plus the height. |
| Satellite tiles missing | The plain dark ground; the map still works. |
| No WebGL | The 3D view and Brief mode's picture say so; the tables, map and route card still work. |
| A route, KML or GPX file that fails a check | Refused with the reason; the route on screen is unchanged. |
| A flown KML that the loader refuses | Its message; the plan unchanged. |
| A leg the wind stops (crosswind ≥ airspeed, or no headway) | [NO TRACK] on the leg; its time and fuel show "—" and the totals say "incomplete". |

## What the module uses (no second copies)

Core: `wind.js` `windTriangle`, `geo.js` (`makeLocalRef`, `latLonToLocalFt`, `localFtToLatLon`, `legOffsetsFt`), `angles.js` (`compassDegFromVector`, `wrapDeg360`, `compassDegToHeadingRad`), `units.js`, `t6-performance.js` `iasToTasKt`, `terrain-grid.js`. The Debrief's `terrain-heights.js`, `weather/winds.js`; flight-data's `load.js` and `xml.js`; storage's `file.js`; the Traffic sim's `airfield.js` `MAG_VARIATION_DEG_E`; ui-kit's `canvas-view.js`, `map-tiles.js`, `panel.js`, `dom.js`, `three-aircraft.js`, `ct156-model.js`, `terrain3d.js`, `draped-ground.js`, `airfield3d.js`, `sky-clouds.js`; `src/airfields/cymj-runways.js`.
