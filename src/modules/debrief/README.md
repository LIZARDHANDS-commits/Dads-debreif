# Debrief Viewer

Load up to four ForeFlight tracks (or the example flight), see them on the map and play them back. The spec is [`specs/SPEC-debrief.md`](../../../specs/SPEC-debrief.md); the build plan and task list are in [`tasks/debrief/`](../../../tasks/debrief/).

| File | What's in it |
|---|---|
| `index.js` | `mount(root, app)`: builds the screen and wires the flight, the playback clock and the map together. Loading swaps the flight only once every file has read cleanly (D54). |
| `state.js` | Plain values, tested in Node: ship colours (#4 white with an outline), the layout defaults "Reset layout" goes back to, the one-line and full status, the flight's box, tracks split at GPS gaps, ship numbers for picked files. |
| `layout.js` | The three columns: Flight (load, example, status), the stage (Fit, Layers menu, map, playback bar) and Formation. |
| `readouts.js` | The numbers for the current time, tested in Node and against V6: each wingman against the standards, Lead's est. IAS and G, live data, aspect, HCA, closure and spacing, and the words for each. |
| `readouts-panel.js` | The Formation card and the "More detail" panel, redrawn at most 10 times a second while playing. |
| `playback-bar.js` | Play or Pause, −1 s, +1 s, speed, the scrubber and the time, bound to flight-data's clock. |
| `map2d/view.js` | The map canvas (ui-kit pan and zoom). Draws only when the time, view, a layer or the size changes. |
| `map2d/layers.js` | The grid, the tracks (one path per ship, built once per flight) and the ship markers. |
| `map2d/vnc.js` | The VNC charts' bounds and warp, pinned to V6 (not drawn yet). |
| `view3d/scene.js` | The 3D view's projection, depth order and attitude, pinned to V6 (not drawn yet). |
| `dfp.js` | The DFP list: add, time order, labels, notes, previous/next, and which flight they belong to. |
| `data/cymj.js` | Moose Jaw values the debrief still needs: field elevation and the VNC chart anchor. |
| `debrief.css` | The screen's styles, all under `[data-module='debrief']`. Loaded when the debrief opens and removed when it closes. |

## Changing something

- **Ship colours:** `SHIP_COLORS` in `state.js`. #4 stays light with a dark outline so it shows on any background (#29).
- **What's remembered in the browser:** `LAYOUT_DEFAULTS` in `state.js`. Add a key there, then a control bound to it (`controls.checkbox('key', …)`), and "Reset layout" covers it.
- **Keys:** Space plays or pauses, ← and → step 1 s, Home goes back to the start. They're set in `index.js` through `app.keys`, so they never fire while typing and stop when the debrief closes.
- **A track file is untrusted:** names go on screen through `h()` or `textContent`, never `innerHTML`. Files are size-checked (`checkPicked`) before they're read.

## Tests

```
npm test                                   # tests/unit/debrief, tests/golden/debrief-*
npm run build && npx playwright test tests/e2e/debrief.spec.js
```
