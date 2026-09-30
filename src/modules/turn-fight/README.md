# Turn Fight

Two aircraft, Blue and Red, start head-on, fly to the merge and turn. Set each one's speed and G and watch who gets their nose on first. The spec is [`specs/SPEC-turn-fight.md`](../../../specs/SPEC-turn-fight.md); the task list is [`tasks/turn-fight/`](../../../tasks/turn-fight/todo.md). The fight is V6's, pinned to V6's own code by `tests/golden/turn-fight-sim.test.js`.

| File | What's in it |
|---|---|
| `geometry.js` | The start (R28): `startGeometry` places both jets from the range, ATA and AA (each with its side), gives the HCA and the pass (the closest point of approach of the two straight lines, found in one formula), and centres the view on the midpoint at the pass; `turnDirections` says which way each jet turns (toward the other, read when the turns start; a tie keeps V6's way). `START_DEFAULTS` are the head-on values. Pure; no page access. |
| `sim.js` | The fight, pure (no page access): `createFight`, `stepFight` in whole 0.02 s steps, the merge, the turns, first nose-on, the chase, Climb and dive, the 10-minute stop, the start geometry and Red's starting height. Every line names the V6 line it comes from. Head-on keeps V6's own start arithmetic, bit for bit. |
| `readouts.js` | The Result and More detail lines from a fight state, with V6's rounding, as text (`resultRows`, `moreDetailRows`, `timeText`, `phaseText`), and the live AA, HCA and range rows (`geometryRows`), kept apart so V6's own rows and their golden test stay as they were. |
| `state.js` | Plain values: every setting and its V6 default, the number boxes' ranges, what "Reset to V6 defaults" puts back, and the check on settings read back from storage. |
| `t6-limit.js` | The words of the T-6 limit warning beside each G box. The stall line G = (speed ÷ 86)² and the 7 G cap are core's (`core/t6-performance.js`). |
| `trails.js` | The trail points, one per aircraft every 0.1 s of fight time, and the reach of everything drawn so far. |
| `playback.js` | What one screen frame does: the 0.08 s frame limit, whole fight steps, the trail points. Pure, so the screen only calls `advanceRun`. |
| `view.js` | The top-down drawing on a ui-kit canvas surface: grid that fills the box, trails, arrowheads labelled B and R, the MERGE mark, the first nose-on line; the MERGE mark shows only when there is a pass to mark. Also the small Start geometry picture (`startPictureView`, `drawStartPicture`). The scale and grid maths (`viewReachFt`, `topDownView`, `gridLines`) is pure and tested. It only reads the run (`{ fight, trails }`), so another view can read the same one. |
| `profile.js` | The side view for Climb and dive: height against east-west position, level in the middle. The height is drawn against a range that only grows with the fight, times the scale (1×, 2×, 4×), and is kept inside the panel, so the scale works (V6's cancelled out, #20). The label is still V6's "VERTICAL PROFILE"; Q50 changes it (task 6). |
| `view3d.js` | The 3D view, on ui-kit's `three-aircraft.js` and `ct156-model.js`. three.js loads only when 3D is switched on (`start()`), and `stop()` frees every model, the sky, the renderer and its WebGL context, so a 2D screen holds nothing. It reads the run and changes nothing. Pure and tested: the bank (`acos(1/G)` toward the turn), the attitude (`rotation.set(-bank, -pitch, heading)`, order `ZYX`), the trail conversion and the camera choices (fit, Overhead, Chase Blue, Chase Red). |
| `layout.js` | The three columns, the stage toolbar and the controls. It knows nothing about the fight: it is handed settings and readout rows. It holds the View switch, the camera buttons, the Paint choice and the box the 3D view draws in. |
| `readouts-panel.js` | A readout table built with `h()`; rewrites only the text that changed. |
| `index.js` | `mount(root, app)`: wires the settings, the fight, the frame loop, the keys (Space, Home), the 2D/3D switch (`applyView`) and the readout rate (at most 10 a second while playing). |
| `turn-fight.css` | Everything is scoped under `[data-module='turn-fight']`. |

## Where to change common things

- **A default or a range:** `state.js` (`DEFAULTS`, `RANGES`). The e2e and unit tests read them from there.
- **The T-6 limit:** the numbers are core's `T6A_LIMITS` and `stallLimitG`; the wording is `t6-limit.js`.
- **A colour:** V6's Blue `#58a6ff`, Red `#ff6b6b` and the first nose-on line `#ffcc66` are in `turn-fight.css` (the screen) and in `view.js` (the canvas); a test keeps the two equal.
- **What a readout says:** `readouts.js`; how it is laid out: `readouts-panel.js` and the `.tf-readout` rules.
- **A new setting:** add its default to `state.js`, its control in `layout.js` (in the Turn Fight settings menu if it is a tuning number), and, if it changes the fight, its name to `sim.js`'s setup so `setupKey` resets the fight when it changes.
- **The 3D view:** `view3d.js`. The bank, the camera views and the trail conversion are pure functions at the top of the file; the scene is built only in `start()`. Its colours are the same V6 colours as `view.js`.
- **Paint:** `paint` in `state.js`, from ui-kit's `PAINT_OPTIONS`; the choice sits in the Display section of Turn Fight settings.
- **The start geometry** (Start geometry in Turn Fight settings): its six settings (`startAtaDeg`, `startAtaSide`, `startAaDeg`, `startAaSide`, `redAboveFt`, `turnsAt`) are defined in `geometry.js` (`START_DEFAULTS`) and ranged in `state.js`. "Head-on (V6)" puts all six back.
