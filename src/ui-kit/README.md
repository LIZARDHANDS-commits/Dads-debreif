# ui-kit

The shared look and building blocks (spec: `docs/modules/shared/spec.md`).

- `tokens.css`: every colour, space and font size. **To change a colour everywhere,** change it here.
- `base.css`: page-wide styles for text, buttons, focus outlines and panels.
- `dom.js`: `h(tag, props, ...children)` builds elements; text always goes in as text.
- `scheduler.js`: the one animation loop and timer service. Modules get a scope as `app.scheduler` (`frame`, `every`, `after`), and everything in it stops when the module closes.
- `panel.js`: a collapsible section with a proper header button.
- `settings-menu.js`: `createSettingsMenu` is the one settings menu each module keeps its own tuning numbers in (titled with the module's name; the header's Settings dialog stays app-wide). It starts closed; `section('Turn')` gives a titled group to append controls to, and `onReset` adds a "Reset to defaults" button.
- `controls.js`: number boxes, sliders, checkboxes, lists and 2D | 3D style choices, each tied to one setting, and `setDisabled(key, true)` to grey them out. A number box only accepts finite numbers in range; anything else is refused with a message and the last good value stays.
- `controls.viewSwitch()`: the one 2D | 3D switch every simulator shares (D141; not the SOF). Seed the setting with `VIEW_DEFAULT` (`'2d'`) and `VIEW_ALLOWED`.
- `canvas-view.js`: `createCanvasView` is a map canvas with drag to pan, wheel or +/- to zoom and arrow keys to move. `createCanvasSurface` is the same sharp, draw-on-request canvas without pan and zoom, for the 3D view and charts. Both draw only when something changes. `toScreen`, `toWorld`, `zoomAbout`, `fitBounds` and `visibleBounds` are the plain math behind them.
- `map-tiles.js`: `createTileLayer` draws satellite tiles (Esri World Imagery) under a flat map, fetching each tile with retries and repainting as they arrive. Used by the debrief today, and by the Traffic and SOF maps as they are built. `tilesFor` is the pure part that says which tiles a view needs.
- `ct156-model.js`: the T-6 as a CT-156 Harvard II (D138), drawn in code: `createCt156Model(THREE, { color, number, paint, lengthFt })` and `disposeCt156Model` (shared parts are reference-counted). `PAINT_DEFAULT` (`'harvard'`) and `PAINT_OPTIONS` (Harvard / Ship colours) for the settings menu.
- `ct156-cockpit.js`: the CT-156's two cockpits as the student and instructor see them (TS-154, TS-155; a closer T-6A replica from TS-157, the rear panel under its moulded hump): `createCt156Cockpit(THREE, { doc })` gives `{ group, update(hud), dispose() }`, added to a ship's root with `setCockpitView(root, { seat: 'front' | 'rear' })` (ct156-model.js; it also opens that ship's fuselage onto its cockpit tub, and `seat: null` puts it back). `EYES_FT` gives both eyes (`EYE_FT` is the front's); `windscreenFrom(eyeFt, seat)` gives the windscreen straight ahead (TS-156). The attitude faces are hud.js `drawAttitude`. The tub's floor height is the model's `CT156_TUB_FLOOR_FT`. Sizes are estimates.
- `camera-bar.js`: the pieces of a 3D camera bar laid over a 3D view: `createPillGroup` (one segmented row of pills, one lit, some greyed with a reason) and `hintNodes` (a keyboard-hint line with key caps). The module supplies the styles. Used by the Debrief today.
- `airspace3d.js`: `buildAirspace` draws checked airspace (src/airfields/airspace/) as see-through volumes from floor to ceiling, edged by kind (`KIND_COLOURS`). Used by the SOF and the Debrief (SOF-62, DB-24).
- `airfield3d.js`: `buildAirports` draws airfields' runways at true size, painted like the Traffic sim's 29L (TR-98), with `fit(ftPerPx)` for a minimum drawn size; `runwayGeometry` and `markingBoxes` are the plain parts. Used by the SOF and the Debrief.
- `three-aircraft.js`: the shared 3D aircraft (D138): `loadThree()` (dynamic import, so three stays out of the home screen), `createAircraftMesh`, `createStandInMesh` (other types, for Traffic) and `disposeAircraftMesh`, `matchProjection` (a three.js camera that lands points exactly where `scene.js projectPoint` does), `worldToScreen`, `altToZ`, `addLights`, `addSky` (returns a `dispose()`).

Rules, checked by `tests/unit/source-rules.test.js`: no `!important`, no `setInterval`, no `requestAnimationFrame` outside `scheduler.js`, no `innerHTML`.
