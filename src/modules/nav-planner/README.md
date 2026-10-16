# Low-level Navigation Planner (code)

Plan a low-level route at Moose Jaw, brief it, and check a flown track against it. What it does and why: `docs/modules/nav-planner/` (start with its README and `spec.md`). Not for flight planning.

| File | What it does |
|---|---|
| `index.js` | The screen: Route, Plan and Flown track boxes, the map or 3D view with its bar, the Turn points, Legs and Plan-against-flown tables; works everything out again when anything changes. Keeps the route in the browser as a draft (checked as any opened file is). |
| `route.js` | The route and settings as plain values, their defaults and ranges, the Example route (made up), and the route file (`.navroute.json`), range-checked on open. |
| `legs.js` | Each leg's track, heading, distance, KTAS, ground speed, time, fuel and clearance, all from core's formulas. Its one test: `tests/unit/nav-planner/legs.test.js`. |
| `terrain.js` | The ground under the route: one Debrief `terrain-heights.js` loader per Terrarium tile, sampled every 300 ft along each leg. |
| `winds.js` | Each leg's wind: none, typed, or the Debrief's model winds aloft through its winds feed. |
| `exchange.js` | KML and GPX export and import (strict XML reader, every point range-checked). |
| `debrief.js` | The flown track against the plan: each turn point's pass and time early or late, each leg's track error and height. |
| `flythrough.js` | Where the aircraft is at a moment on the plan (straight legs at the planned ground speeds) or on the flown track. |
| `map2d.js` | The 2D map (ui-kit canvas view and Esri imagery, as the Debrief's): the route, flown track and aircraft; tap to add, drag to move, click to select. |
| `world3d.js` | The 3D view from the shared pieces (terrain, draped satellite ground, sky, runways, CT-156): the route at its heights with a curtain, poles and names, the flown track; chase and eye cameras. Loaded only when 3D or Brief opens. |
| `brief.js` | Brief mode: full screen, the route then each leg's run-in picture (1 NM before the turn point, estimate) with its numbers and hazards; Next/Back, ← →, Esc. |
| `card.js` | The route card for the browser's print dialog. |
| `nav-planner.css` | The screen's look (tokens from `src/ui-kit/tokens.css`), Brief mode, and the print-only route card. |
| `card.jpg` | The home screen card's still. |

Shared code it uses, never copies: core `wind.js`, `geo.js`, `angles.js`, `units.js`, `t6-performance.js`, `terrain-grid.js`; the Debrief's `terrain-heights.js`, `weather/winds.js` and `weather/winds-feed.js`; flight-data's `load.js`, `kml.js`, `xml.js`, `altitude.js`; storage's `file.js`; Traffic's `airfield.js` (`MAG_VARIATION_DEG_E`, TR-65) and `version.js`; ui-kit's `canvas-view.js`, `map-tiles.js`, `panel.js`, `dom.js`, `three-aircraft.js`, `ct156-model.js`, `ct156-cockpit.js` (its scale), `terrain3d.js`, `draped-ground.js`, `airfield3d.js`, `sky-clouds.js`; `src/airfields/cymj-runways.js`.

## Changing something

- **A default or estimate** (240 KIAS, 500 ft AGL, 500 lb/h, 1,100 lb, the 500 ft minimum): `route.js` `LEG_DEFAULTS` and `SETTING_DEFAULTS`, and say so in the spec and decisions.
- **The terrain sampling** (300 ft, 160 tiles): `terrain.js`. **The run-in distance** (1 NM): `brief.js` `RUN_IN_NM`.
- Text from files and the flown track goes on screen as text only (`h()`), never as HTML.
