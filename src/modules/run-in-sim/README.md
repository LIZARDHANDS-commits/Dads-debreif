# Run-in Simulator (code)

An orbit, a run-in, a release (or a flypast) and an escape, worked out and flown over the real ground (plan Steps 2 to 5, V2.502). What it does and why: `docs/modules/run-in-sim/` (start with its README and `spec.md`). Training only: inert loads, generic shapes.

| File | What it does |
|---|---|
| `index.js` | The one screen: Setup, the 3D view with the plan view and the map, the bar (time line with the legs marked, play and pause, ×1 to ×8, the five cameras) and the result cards. "Fly the pass" works the whole pass out first, then playback only reads the stored timeline. |
| `pass.js` | The engine, plain values: the plan (the run-in line, the IP, the orbit) and the numbers worked out to hit (RS-9: the release point with core `carp`, the aim-off for the wind, the roll-in height and speed for a dive, the orbit exit for the time over target), the flight stepped at 0.05 s, the load's fall (core `flyDrop`) and the result with its flags (RS-6). Its one test: `tests/unit/run-in-sim/pass.test.js`. |
| `pilot.js` | The pilot, built only from core pieces on core's point mass (RS-4): the lift he wants (`dampedClimbG` up and down, `liftTowardAim` as an L1 path follower side to side), turned into G and bank (`gAndBankForLift`), flown inside the roll limit, the G onset and the stall line, with the throttle on the speed. Every gain an estimate (`PILOT`). |
| `aircraft.js` | The aircraft a pass can fly with, each one core's performance set in the shape the engine reads. Today the CT-156 on the T-6A set. |
| `defaults.js` | The Run list, the settings and their defaults (the spec's table, all estimates, RS-Q2), the box ranges, and the settings turned into the engine's setup (magnetic to true). |
| `targets.js` | The five generic shapes and their sizes (estimates). |
| `area.js` | The map projection round the chosen place and the ground squares the terrain and the satellite picture are drawn on. |
| `world3d.js` | The 3D view: the shared terrain with the satellite picture draped on it, the sky, the target shape, the planned lines, the CT-156 (and its cockpit for the Cockpit camera), the trails and the impact mark. |
| `plan-view.js` | The small plan view (2D), north up, with the wind and a scale; a click opens the map. |
| `map-picker.js` | "Tap the map": the satellite map to tap a place on, with typed latitude and longitude under More. |
| `setup-panel.js` | The Setup column: the boxes, their one-line summaries, the greyed "set to hit" numbers and the More switches that set them by hand. |
| `card.js` | The result card's words. |
| `run-in-sim.css` | The screen's layout and look (tokens from `src/ui-kit/tokens.css`). |

**The cargo offload** is left off the Run list for now: its aircraft, the C-130J, has no performance set yet (RS-Q1, waiting on Patrick). The engine is ready for it: adding it means one entry in `aircraft.js` (the C-130J's set, in the same shape as the CT-156's) and one run in `defaults.js` (`{ id: 'cargo', aircraft: 'c130j', load: 'a22g12' }`), with the C-130J model (`src/ui-kit/c130j-model.js`) drawn in `world3d.js`.

Shared code it uses, never copies: core `point-mass.js`, `flight-math.js`, `t6-performance.js`, `drop.js`, `wind.js`, `atmosphere.js`, `angles.js`, `geo.js`, `units.js`, `terrain-grid.js`; ui-kit `terrain3d.js`, `draped-ground.js`, `sky-clouds.js`, `three-aircraft.js`, `ct156-model.js`, `ct156-cockpit.js`, `map-tiles.js`, `canvas-view.js`, `camera-bar.js`, `panel.js`, `controls.js`, `airfield3d.js` (CYMJ's height), `dom.js`. From other modules (rule book: a module may import another's file when moving it isn't worth it): the Debrief's typed-wind blend (`debrief/drop.js` `dropWind`), Moose Jaw's magnetic variation (`traffic/airfield.js`, TR-65) and the one version label (`traffic/version.js`).
