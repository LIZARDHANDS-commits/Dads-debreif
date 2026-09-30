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
| `map2d/layers.js` | Each layer's drawing: grid, 3/9 lines, fighting-wing cone, tracks with their trail mode, spacing lines, DFP flags, safety bubbles, clock marks, and the ships (T-6 silhouettes) with their labels. |
| `map2d/geometry.js` | Where the layers go, in map feet, tested in Node against V6's numbers: trail parts, spacing pairs, 3/9 line ends, the cone's outline. |
| `map2d/overlays.js` | The built-in routes: placed on the map (the flight's, or Moose Jaw's with no flight) and drawn dashed under the tracks. |
| `data/routes.js` | V6's 19 built-in routes as points, checked against V6's KML by `tests/golden/debrief-routes.test.js`. |
| `map2d/tiles.js` | Web map tiles (Esri World Imagery) under the map: which tiles a view needs, fetching with retries, and drawing. Knows nothing of the debrief, so it can move to the ui-kit. |
| `map2d/vnc.js` | The VNC charts: bounds and warp pinned to V6, and the layer that fetches each chart when first shown and warps it once per alignment. |
| `view3d/scene.js` | The 3D view's projection, depth order and attitude, pinned to V6. |
| `em.js` | The EM chart: which chart to show, where a point lands on it (pinned to V6), each ship's point and 60 s trail from its track, and the panel's canvas. |
| `view3d/frame.js` | What the 3D view shows at one moment, as plain values: each ship's place and attitude, the ground datum, the camera limits and drag/wheel steps, and the fixed ground grid. |
| `view3d/view.js` | Draws the 3D view on its canvas and turns and zooms it with the mouse and keys. |
| `dfp.js` | The DFP list: add, time order, labels, notes, previous/next, and which flight they belong to. |
| `dfp-panel.js` | The DFPs list beside the Formation card: + Add, previous/next, go to one, and Edit to rename, write a note or delete. Labels and notes only ever go in as text. |
| `standards-panel.js` | The Standards panel (closed at first): edits `app.standards`, the one copy the Turn Sim reads too. |
| `debrief-session.js` | What a saved debrief carries besides the tracks (DFPs, standards, time), flattened for flight-data's debrief file and read back. Tested in Node. |
| `file-panel.js` | "Save, open, examples": Save debrief, Open debrief, Close flight, and the example track files as downloads. |
| `data/cymj.js` | Moose Jaw values the debrief still needs: field elevation and the VNC chart anchor. |
| `debrief.css` | The screen's styles, all under `[data-module='debrief']`. Loaded when the debrief opens and removed when it closes. |

## Changing something

- **Ship colours:** `SHIP_COLORS` in `state.js`. #4 stays light with a dark outline so it shows on any background (#29).
- **What's remembered in the browser:** `LAYOUT_DEFAULTS` in `state.js`. Add a key there, then a control bound to it (`controls.checkbox('key', …)`), and "Reset layout" covers it.
- **Keys:** Space plays or pauses, ← and → step 1 s, Home goes back to the start. They're set in `index.js` through `app.keys`, so they never fire while typing and stop when the debrief closes.
- **DFPs:** kept in this browser per flight (the key is a fingerprint of the track files, so they never show on another flight), and in a saved debrief file. Opening a debrief file also puts its standards into `app.standards`.
- **A track file is untrusted:** names go on screen through `h()` or `textContent`, never `innerHTML`. Files are size-checked (`checkPicked`) before they're read.

## Tests

```
npm test                                   # tests/unit/debrief, tests/golden/debrief-*
npm run build && npx playwright test tests/e2e/debrief.spec.js
```
