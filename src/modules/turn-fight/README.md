# Turn Fight

Two aircraft, Blue and Red, start head-on, fly to the merge and turn. Set each one's speed and G and watch who gets their nose on first. The spec is [`specs/SPEC-turn-fight.md`](../../../specs/SPEC-turn-fight.md); the task list is [`tasks/turn-fight/`](../../../tasks/turn-fight/todo.md). The fight is V6's, pinned to V6's own code by `tests/golden/turn-fight-sim.test.js`.

| File | What's in it |
|---|---|
| `sim.js` | The fight, pure (no page access): `createFight`, `stepFight` in whole 0.02 s steps, the merge, the turns, first nose-on, the chase, Climb and dive, the 10-minute stop. Every line names the V6 line it comes from. |
| `readouts.js` | The Result and More detail lines from a fight state, with V6's rounding, as text (`resultRows`, `moreDetailRows`, `timeText`, `phaseText`). |
| `state.js` | Plain values: every setting and its V6 default, the number boxes' ranges, what "Reset to V6 defaults" puts back, and the check on settings read back from storage. |
| `t6-limit.js` | The words of the T-6 limit warning beside each G box. The stall line G = (speed ÷ 86)² and the 7 G cap are core's (`core/t6-performance.js`). |
| `trails.js` | The trail points, one per aircraft every 0.1 s of fight time, and the reach of everything drawn so far. |
| `playback.js` | What one screen frame does: the 0.08 s frame limit, whole fight steps, the trail points. Pure, so the screen only calls `advanceRun`. |
| `view.js` | The top-down drawing on a ui-kit canvas surface: grid that fills the box, trails, arrowheads labelled B and R, the MERGE mark, the first nose-on line. The scale and grid maths (`viewReachFt`, `topDownView`, `gridLines`) is pure and tested. It only reads the run (`{ fight, trails }`), so another view can read the same one. |
| `profile.js` | The side view for Climb and dive: height against east-west position, level in the middle. The height is drawn against a range that only grows with the fight, times the scale (1×, 2×, 4×), and is kept inside the panel, so the scale works (V6's cancelled out, #20). The label is still V6's "VERTICAL PROFILE"; Q50 changes it (task 6). |
| `layout.js` | The three columns, the stage toolbar and the controls. It knows nothing about the fight: it is handed settings and readout rows, so a 3D view can sit beside the 2D views without touching the engine. |
| `readouts-panel.js` | A readout table built with `h()`; rewrites only the text that changed. |
| `index.js` | `mount(root, app)`: wires the settings, the fight, the frame loop, the keys (Space, Home) and the readout rate (at most 10 a second while playing). |
| `turn-fight.css` | Everything is scoped under `[data-module='turn-fight']`. |

## Where to change common things

- **A default or a range:** `state.js` (`DEFAULTS`, `RANGES`). The e2e and unit tests read them from there.
- **The T-6 limit:** the numbers are core's `T6A_LIMITS` and `stallLimitG`; the wording is `t6-limit.js`.
- **A colour:** V6's Blue `#58a6ff`, Red `#ff6b6b` and the first nose-on line `#ffcc66` are in `turn-fight.css` (the screen) and in `view.js` (the canvas); a test keeps the two equal.
- **What a readout says:** `readouts.js`; how it is laid out: `readouts-panel.js` and the `.tf-readout` rules.
- **A new setting:** add its default to `state.js`, its control in `layout.js` (in the Turn Fight settings menu if it is a tuning number), and, if it changes the fight, its name to `sim.js`'s setup so `setupKey` resets the fight when it changes.
