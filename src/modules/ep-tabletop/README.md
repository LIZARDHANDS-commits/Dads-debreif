# EP Tabletop (code)

The emergency procedures tabletop: the one-screen version (plan Step 1), the instructor's phone by QR code (plan Step 2) and the systems model, where causes drive the gauges and the gauges drive the lights (plan Step 3, EP-11). What it does and why: `docs/modules/ep-tabletop/` (start with its README, `spec.md` and `systems-plan.md`).

| File | What it does |
|---|---|
| `index.js` | Picks the screen from the address: the phone's console (the QR code's address) or the student's screen. Holds the version label and the module's settings. |
| `screen.js` | The student's screen: the student's side (3D cockpit, situation, A-A-B-C-D-E-F step track, "Time stands still", what has been revealed), the Instructor switch, the QR code and the link. Runs the clock on the shell's scheduler. |
| `phone.js` | The instructor's phone: the console, the scenario running there, sending only the student view. |
| `student-view.js` | `studentView(session)`, the only thing the student's side is drawn from and the only thing the phone sends (EP-9), and `cleanStudentView(raw)`, which checks and clamps one arriving over the link. Never carries a cause, its severity or its trend. Its one test: `tests/unit/ep-tabletop/student-view.test.js`. |
| `link.js` | The phone link behind one interface, `createLink`: the relay mailbox (`relay/ep-link.js`, EP-8), the QR code's address, the session id and key. |
| `scenario.js` | The scenario engine, pure: clock, steps, causes (`faults`) and typed values (`overrides`), developments by time, step or tap (each may set indications, a cause or a change to one), reveal-on-ask, pending edits and cause changes applied on Apply, Now/Later/Add, prompts, marks, notes, Declare boxes, log. No flight maths. Its one test: `tests/unit/ep-tabletop/scenario.test.js`. |
| `systems.js` | The systems model, pure (EP-11): `gaugesOf` (the healthy start with each cause's effect by the clock), `lightsOf` (lights from thresholds; MASTER CAUTION with any caution, MASTER WARN with FIRE), `shownOf` (typed values win, then lights, then gauges). `FAULT_EFFECTS` and `LIGHT_THRESHOLDS` hold every rate and threshold with its source; all are estimates for now (EP-Q10). Its one test: `tests/unit/ep-tabletop/systems.test.js`. |
| `scenarios.js` | The example scenarios, "Engine roughness in the area" and "Oil pressure dropping on departure" (indications and causes only; each number sourced or marked an estimate; never checklist or boldface text, EP-3). |
| `indications.js` | What can be set and asked about (engine numbers, lights, words for outside cues, gear and flaps, flight instruments), their words and units, and the panel turned into the shared cockpit's numbers. |
| `console.js` | The instructor's console frame, on the phone (one column, big buttons) or behind the one-screen Instructor switch: the header, the scenario picker (before Start), the Apply bar, and the sections below put together. |
| `console-time.js` | Console: Time (clock, Start/Pause, back to A, re-analyse, next step, step buttons) and Next development (Now/Later/+Add). |
| `console-faults.js` | Console: Faults (cause picker, severity slider, Worsening/Steady/Improving, Clear; each cause's effect with "(estimate)"). |
| `console-indications.js` | Console: Indications (every indication with Reveal and its edit, "typed" when the instructor's value wins, a threshold and "(estimate)" beside a light or gauge that follows one). |
| `console-marks.js` | Console: Prompts and marks (FEVER and TCCC, marks and notes) and Declare. |
| `world3d.js` | The 3D view: the shared CT-156 cockpit (live engine displays, `liveEngine`) at the front-seat eye over Moose Jaw (shared terrain, satellite picture, runways, sky). Drag to look round, double-click to look ahead, Shift to zoom. |
| `ep-tabletop.css` | The screen's layout and look (tokens from `src/ui-kit/tokens.css`). |

Shared code it uses, never copies: `src/ui-kit/qr.js`, `src/wx/relay.js`, `src/storage/settings.js`, `src/ui-kit/ct156-cockpit.js` and `ct156-model.js`, `terrain3d.js`, `draped-ground.js`, `airfield3d.js`, `sky-clouds.js`, `three-aircraft.js`, `dom.js`; `src/airfields/cymj-runways.js`; `src/core/geo.js`, `terrain-grid.js`, `angles.js`, `units.js`. It imports no other module.
