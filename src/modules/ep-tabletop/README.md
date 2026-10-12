# EP Tabletop (code)

The emergency procedures tabletop, one-screen version (plan Step 1). What it does and why: `docs/modules/ep-tabletop/` (start with its README and `spec.md`).

| File | What it does |
|---|---|
| `index.js` | The screen: the student's side (3D cockpit, situation, A-A-B-C-D-E-F step track, "Time stands still", what has been revealed) and the Instructor switch. Runs the clock on the shell's scheduler. |
| `scenario.js` | The scenario engine, pure: clock, steps, developments by time, step or tap, reveal-on-ask, pending edits applied on Apply, Now/Later/Add, prompts, marks, notes, Declare boxes, log. No flight maths. Its one test: `tests/unit/ep-tabletop/scenario.test.js`. |
| `scenarios.js` | The example scenario, "Engine roughness in the area" (indications only; each number sourced or marked an estimate; never checklist or boldface text, EP-3). |
| `indications.js` | What can be set and asked about (engine numbers, lights, words for outside cues, gear and flaps, flight instruments), their words and units, and the panel turned into the shared cockpit's numbers. |
| `console.js` | The instructor's console (one-screen mode): time and steps, every indication with Reveal and its edit, Apply/Undo, next development Now/Later/+Add, FEVER and TCCC prompts, marks and notes, Declare boxes. |
| `world3d.js` | The 3D view: the shared CT-156 cockpit (live engine displays, `liveEngine`) at the front-seat eye over Moose Jaw (shared terrain, satellite picture, runways, sky). Drag to look round, double-click to look ahead, Shift to zoom. |
| `ep-tabletop.css` | The screen's layout and look (tokens from `src/ui-kit/tokens.css`). |

Shared code it uses, never copies: `src/ui-kit/ct156-cockpit.js` and `ct156-model.js`, `terrain3d.js`, `draped-ground.js`, `airfield3d.js`, `sky-clouds.js`, `three-aircraft.js`, `dom.js`; `src/airfields/cymj-runways.js`; `src/core/geo.js`, `terrain-grid.js`, `angles.js`, `units.js`. It imports no other module.
