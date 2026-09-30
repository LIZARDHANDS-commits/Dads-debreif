# Spec: ui-kit

Module id `ui-kit` in the approved map (`SPEC.md`). Build step 1, extended as modules need it.

## Objective

One shared look and one set of building blocks, so modules stop fighting over the page. V6 had six layers of CSS patches with 348 `!important`, side rails that covered controls (#34), a Tab key that hid panels (#35), and animation loops that kept running for hidden modules (#39). Here there's one stylesheet of tokens, panels that never cover controls, normal keyboard behaviour, and one scheduler that only runs the open module's work (R2, R4).

## What step 1 provides

`src/ui-kit/tokens.css`: colours, spacing, type and radii as CSS custom properties, taken from V6's palette (dark navy background, cyan accent). No module defines its own colours for shared things.

`src/ui-kit/base.css`: page reset, typography, buttons, links, focus outlines, form controls, the `[hidden]` rule, and a `prefers-reduced-motion` rule. Transitions and animations take their length from the `--motion-duration` token, which is 0 when the computer asks for reduced motion or the Settings choice is "Show still pictures only" (`data-motion` on `<html>`). No `!important` anywhere in `src/` (checked by a test).

`src/ui-kit/dom.js`: `h(tag, props, ...children)` builds elements. Text always goes in as text, never as HTML, so a track name or DFP label can't break the page (#25).

`src/ui-kit/scheduler.js`

```js
const scheduler = createScheduler();       // browser rAF and timers by default
const scope = scheduler.scope('turn-sim');
scope.frame((dtMs, nowMs) => { … });       // runs every animation frame
scope.every(1000, () => { … });            // repeating timer
scope.after(500, () => { … });             // one-off timer
scope.dispose();                           // cancels everything the scope started
scheduler.stats();                         // { frames, timers } still active
```

- One `requestAnimationFrame` loop for the whole app, running only while at least one frame callback exists.
- Every frame callback and timer belongs to a scope. The shell gives each module its own scope and disposes it when the module closes, so nothing a module started can outlive it (R4).
- A callback that throws is reported once to the console and removed, so one bad callback can't stop the others.
- `createScheduler({ raf, caf, setTimeout, clearTimeout, onError })` accepts fakes, so it's unit-tested in Node. Frame times come from `requestAnimationFrame` itself.
- No `setInterval` or `requestAnimationFrame` anywhere else in `src/` (checked by a test).

`src/ui-kit/panel.js`: `createPanel({ title, collapsed, onToggle })` makes a collapsible section whose header is a real `<button>` with `aria-expanded`. Collapsing a panel never hides another panel's controls, and there are no side rails or Tab-key tricks.

## Added for the debrief (step 3)

The debrief is the first module to use these two (SPEC-debrief, PR #62); Turn Sim, Turn Fight and Traffic use them next.

`src/ui-kit/controls.js` binds inputs to settings, so math never reads input boxes (V6's "the page is the data").

```js
const controls = createControls(settings);   // any { get, update, subscribe }, such as storage/settings.js
panel.body.append(
  controls.number('bubbleFt', { label: 'Safety bubble', unit: 'ft', min: 100, max: 5000, step: 50 }),
  controls.slider('vncOpacity', { label: 'Chart opacity', min: 0, max: 1, step: 0.05, format: (v) => `${Math.round(v * 100)}%` }),
  controls.checkbox('showGrid', { label: '5,000 ft grid' }),
  controls.select('trail', { label: 'Trail', options: [['full', 'Full'], ['history', 'History'], ['last60', 'Last 60 s']] }),
  controls.choice('view', { label: 'View', options: [['2d', '2D'], ['3d', '3D']] }),
);
return () => controls.dispose();                // in the module's cleanup
```

- Each call returns one element: a real `<label>` tied to its input, so clicking the words and screen readers both work.
- A control writes its setting as soon as the value is good, and follows the setting when something else changes it (a loaded debrief file, Reset).
- **Number rule:** a number box accepts only a finite number from `min` to `max`. Anything else (blank, `Infinity`, a huge value) is refused with a message beside the box ("Enter a number from 100 to 5,000 ft"), the box is marked invalid, and the setting keeps its last good value. V6's angle loops never return for `Infinity`, so a huge Turn Sim start heading could freeze the page (from the flight math workstream, PR #51).
- `select` and `choice` give back the option's own value, so a number option stays a number.
- `setDisabled(key, true)` greys out every control bound to that setting (for example 3D-only options while in 2D), and `false` turns them back on. The setting keeps its value. The whole control (label, box, unit and any message) is also marked `aria-disabled="true"`, so the dimmed text counts as inactive and passes the contrast check (WCAG 1.4.3 exempts inactive parts); modules need no axe exclusion for it.
- `guard(button, keys?)` turns an action button off while a number box for any of `keys` (every number box when left out) is refusing what was typed, and back on when it accepts a value, so an action such as Traffic's + Spawn never runs on a last good value the person can no longer see (verification TR-14, D256). It returns a function that stops guarding. `invalid()` lists the keys of number boxes now refusing input.
- In the refusal message a degree unit sits on the number ("0 to 90°"); other units take a space ("5 to 60 s") (TF3-9).
- `dispose()` removes the one settings subscription the controls share.

`src/ui-kit/canvas-view.js` is pan and zoom for the 2D views, drawn only when something changes.

```js
const view = createCanvasView(canvas, {
  timers: app.scheduler,                 // draws in the next animation frame, only when asked
  draw(ctx, view) { … },                 // ctx is in CSS pixels, already scaled for sharp screens
  minSpan: 500, maxSpan: 50 * 6076,      // the visible width, in world units (here feet)
  label: 'Debrief map',                  // for screen readers
  onUserMove() { followLead = false; },  // the person dragged, zoomed or used the keys
});
view.fit({ minX, minY, maxX, maxY });    // show the whole flight
view.setCenter(x, y);                    // follow a ship
view.worldToScreen(x, y);                // → [sx, sy]
view.screenToWorld(sx, sy);              // → [x, y]
view.view;                               // → { cx, cy, scale }: centre, and CSS px per world unit
view.visibleBounds();                    // → { minX, minY, maxX, maxY } on screen, for tiles and culling
view.size;                               // → { width, height } in CSS px
view.requestDraw();                      // after the data or a layer changed
view.dispose();                          // in the module's cleanup
```

The 3D view and the EM chart need the same sharp, draw-on-request canvas without pan and zoom:

```js
const chart = createCanvasSurface(canvas, { timers: app.scheduler, draw(ctx, chart) { … }, label: 'EM chart' });
chart.size;          // → { width, height } in CSS px
chart.requestDraw();
chart.dispose();
```

- World units are the module's choice (the debrief uses feet), with x to the east and y to the north; the screen's y points down.
- Drag with the mouse to pan and use the wheel to zoom about the pointer. With the view focused, the arrow keys pan and + and − zoom (#35: normal keyboard behaviour).
- **Keys and module shortcuts:** a key the view handles is marked as handled, and `app.keys` shortcuts skip handled keys, so the two never both act. A module that wants the arrows for itself (the debrief steps playback with ← and →) passes `arrowKeys: false`; the view then leaves the arrows alone and + and − still zoom.
- The visible width stays between `minSpan` and `maxSpan`, for fit too.
- Drawing happens in one scheduler frame after `requestDraw`, pan, zoom or a resize, and several requests in one frame draw once. A still view uses no frames (#43).
- The canvas follows its box size (a `ResizeObserver`) and the screen's pixel ratio, and redraws only when the size really changed.
- The transform maths (`toScreen`, `toWorld`, `zoomAbout`, `fitBounds`) is exported as pure functions and unit-tested.

## Map layers: satellite tiles and VNC charts (from the debrief)

The debrief built these two layers and kept them free of debrief state so they could be shared. Modules never import each other (`SPEC.md`), so they move into ui-kit. The tile loader has moved already, ahead of the Traffic Sim's satellite task (Traffic task 8). The VNC layer moves at the SOF's base map (SOF task 6). Each move changes where the code lives and nothing it does: every number stays as the debrief has it, and `tests/golden/debrief-vnc.test.js` still pins the VNC warp to V6.

`src/ui-kit/map-tiles.js` (moved from the debrief) draws web map tiles under a flat map in local feet.

```js
import { ESRI_IMAGERY, createTileLayer } from '../../ui-kit/map-tiles.js';
const imagery = createTileLayer({ source: ESRI_IMAGERY, timers: app.scheduler, onChange: () => view.requestDraw() });
imagery.draw(ctx, { corners, pxPerFt, toScreen });  // corners: { north, south, west, east }; toScreen(lat, lon) → [x, y]
imagery.state();                                    // → { wanted, ready, failed } from the last draw
imagery.dispose();                                  // in the module's cleanup
```

- `ESRI_IMAGERY` is Esri World Imagery at `services.arcgisonline.com`, with the address built from the tile numbers only (no user-entered URL), and its credit line in `ESRI_IMAGERY.credit`. The module draws that credit on the map whenever the layer shows. A page Content Security Policy must allow `services.arcgisonline.com` for images.
- The tile zoom follows the map's scale (core `pickTileZoom`, V6's rule). A view that would need more than 64 tiles draws none, so a wrong zoom can't freeze the page (#49).
- At most 300 tiles are kept, and the least recently drawn go first.
- A failed tile is tried twice more, after 2 s and 6 s, through the scheduler scope, so the retries stop when the module closes. The last try goes without CORS. A tile that still fails is counted in `state().failed`, so the module can say "satellite imagery needs a connection" and show its grid (R6).
- Each tile that arrives calls `onChange` once. The canvas view already draws at most once a frame, however many tiles land (#43).
- A source may set `maxZoom` (its finest zoom level; NASA GIBS GOES stops at 7 for GeoColor and 6 for infrared). Closer in than that, the layer keeps asking for that zoom and stretches each tile to its bounds. Esri has no `maxZoom`, so it follows the map's scale as before.
- `tilesFor(corners, pxPerFt, maxZoom)` is the pure part (which tiles, at which zoom) and is unit-tested. `makeImage` is there for tests.

`src/ui-kit/vnc.js` (today still `src/modules/debrief/map2d/vnc.js`, until SOF task 6) holds the two embedded VNC charts, South (Moose Jaw and Regina) and North (Saskatoon and Moose Jaw), with V6's bounds, its 3 × 3 correction mesh and its alignment controls.

```js
import { VNC_CHOICES, VNC_DEFAULT_ALIGN, VNC_ALIGN_LIMITS, chartsBounds, createVncLayer } from '../../ui-kit/vnc.js';
const charts = createVncLayer({ base: document.baseURI, onChange: () => view.requestDraw() });
charts.draw(ctx, { keys: VNC_CHOICES.both, map: view, ref, align, opacityPct: 70 });
charts.state();                                     // → { wanted, ready, failed }
view.fit(chartsBounds(VNC_CHOICES.both, ref, align));
charts.dispose();
```

- Each chart image is fetched the first time it is shown, never at start-up (R5). After that the service worker keeps it for offline use (R6), as it does today.
- Each chart is warped once per origin and alignment into an off-screen image (V6's mesh of affine triangles, 18 × 18 cells), so every frame draws it with one `drawImage` (#43).
- The alignment is `{ nudgeEastNm, nudgeNorthNm, scalePct }`, limited by `VNC_ALIGN_LIMITS` (±20 NM, 97 % to 103 %). Where a module keeps it is the module's choice.
- The pure parts (`vncBaseLatLon`, `vncWarpLatLon`, `vncWarpGrid`, `triangleTransform`, `chartsBounds`) run in Node and stay pinned by the golden test.
- A module that shows the charts says "Not for navigation" beside them, as the debrief's chart line does. Credits beyond that (the SOF's "VNC © NAV CANADA") are the module's own.

**The tile loader move is done.** It was one pull request by the app frame, agreed with the debrief thread: `tiles.js` and its test went to `src/ui-kit/map-tiles.js` and `tests/unit/ui-kit/map-tiles.test.js` with `git mv`, and the debrief's imports (`layout.js`, `map2d/view.js`) point at the new file.

**The VNC layer moves in its own pull request when the SOF reaches task 6, agreed with the debrief thread:**

- It moves `vnc.js` to `src/ui-kit/vnc.js`, with `git mv` so the history follows. The debrief's imports point at the new file.
- It moves the chart images from `public/media/debrief/` to `public/media/charts/`, changes `VNC_FILES` to match, and changes the service worker's skip rule (`tools/service-worker.mjs`) from `media/debrief/` to `media/charts/`.
- It moves `tests/unit/debrief/vnc.test.js` to `tests/unit/ui-kit/vnc.test.js`. The golden test keeps its name and changes only its import (a one-line change in core's folder, agreed with the flight math core thread).
- It updates the debrief's README and SPEC-debrief's file tree, the ui-kit README, and `SPEC.md`'s structure.
- It is done when `npm test` and the debrief's browser tests pass unchanged, including "VNC charts: off at first, fetched only when chosen".
- It lands with the SOF's task 6, which needs the VNC layer.

## 3D aircraft (three.js, D138)

three.js draws every 3D aircraft view: the Debrief's 3D view (its `view3d` moves onto this next), Turn Fight's 3D view, and any later Turn Sim or Traffic 3D view. The shared pieces live in `src/ui-kit/three-aircraft.js` so each view draws the same aircraft with the same camera.

```js
import { createCt156Model, disposeCt156Model, CT156_UNIT_LENGTH, PAINT_DEFAULT, PAINT_OPTIONS } from '../../ui-kit/ct156-model.js';
import { loadThree, createAircraftMesh, disposeAircraftMesh, createStandInMesh, matchProjection, worldToScreen, altToZ, addLights, addSky } from '../../ui-kit/three-aircraft.js';

const THREE = await loadThree();                       // dynamic import('three'), cached; call when the 3D view opens
addLights(THREE, scene);                               // { hemisphere, sun }
const sky = addSky(THREE, scene);                     // gradient background and horizon fog (any view can use it)
const plane = createCt156Model(THREE, { color: SHIP_COLORS[slot], number: slot, paint: settings.get().paint, lengthFt: planeSizeFt * CT156_UNIT_LENGTH });
// (createAircraftMesh(THREE, { color, outline }) is the plain, canvas-free model; see "Paint" below)
plane.position.set(s.x, s.y, altToZ(s.altFt, cam.altScale));   // the model is not scaled by altScale
const other = createStandInMesh(THREE, { color, outline, kind: 'generic' });   // Traffic's non-T-6 types: same frame and size, clearly not a T-6
plane.rotation.order = 'ZYX';
plane.rotation.set(-bankRad, -pitchRad, hdgRad);       // heading about Z (0 = east), then pitch, then bank
matchProjection(THREE, camera, ctr, cam, { width, height });    // camera: THREE.OrthographicCamera
const p = worldToScreen(THREE, camera, { x, y, z: altToZ(altFt, cam.altScale) }, width, height); // for 2D labels
disposeAircraftMesh(plane); sky.dispose();             // when the view closes (sky.dispose frees the texture, clears background and fog)
```

- **Parity rule (the flight-math guard).** `matchProjection(THREE, camera, ctr, cam, size, pxRatio = 1)` takes the same inputs as `scene.js projectPoint(p, ctr, cam, size, pxRatio)`: the centre `ctr` `{ x, y, z }` (feet), the view `cam` `{ yawDeg, pitchDeg, zoom, altScale }`, and the canvas `size`. A world point `{ x, y, z: altToZ(altFt, altScale) }` then lands on the same CSS-pixel position the projection gives, within 1e-6 px, and nearer to the viewer agrees with a smaller `depth`. The camera is orthographic, so nothing about the flight geometry changes; only who draws it. `scene.js` stays the reference, and `tests/unit/ui-kit/three-aircraft.test.js` pins the match over many views, centres, canvas sizes and points. Any new 3D view uses `matchProjection` and does not build its own camera maths.
- **Dynamic import only.** Nothing may import `three` (or `three/addons/...`) statically: `tests/unit/source-rules.test.js` scans all of `src/` for it. A 3D view awaits `loadThree()` when it opens, so the home screen and modules that draw no 3D never download it. If the load fails (offline, first visit), the view shows a message and the 2D view keeps working.
- **Depth range.** The camera sits `CAMERA_DISTANCE_FT` (1,000,000 ft) from its target with near and far planes 900,000 ft either side, so nothing the Debrief allows is clipped: altitude scale up to 10, pitch 0 to 90, ground 70,000 ft out, a formation at 31,000 ft over sea-level ground. The tests check every point stays inside the planes and that the depth agrees with `projectPoint`'s `depth`.
- **Fog is for the ground only.** The sky's fog fades a big ground plane toward the horizon; aircraft materials (and their outline and prop disc) set `fog: false` so an aircraft never fades. Any ground, grid or trail a view adds decides its own fog.
- **Paint (Harvard scheme).** The T-6 is drawn as a CT-156 Harvard II from Moose Jaw by `createCt156Model(THREE, { color, number, paint = 'harvard', lengthFt })` in `src/ui-kit/ct156-model.js` (nose +X, left +Y, up +Z; `lengthFt` is the nose-to-tail length, and `CT156_UNIT_LENGTH` (1.44) is the length in model units, the same as the plain mesh, so a view can swap paints without moving anything). It is drawn in code only (procedural materials and small canvas decals; no image files, no models). `paint: 'harvard'` (the default) is the navy scheme with the cheat line, chrome spinner, red-tipped prop, roundels, Canada wordmark, red triangles and the tail leaf, NATO star, flag and serial, with the **whole fin in the ship colour** and the **ship number on both faces of the fin, on the nose, and under the right wing**; `'ship'` is the plain all-ship-colour look. Modules offer the choice as "Paint: Harvard / Ship colours" in their settings menu from `PAINT_OPTIONS`, Harvard the default (`PAINT_DEFAULT`); any other value draws Harvard. Geometry, textures and materials shared by all ships are built once per THREE module and reference-counted: `disposeCt156Model(group)` frees the ship's own materials and textures, and the shared part only when the last CT-156 in the view is gone (`disposeAircraftMesh` hands a CT-156 to it). Decals are drawn on 2D canvases, so it needs a browser `document`; every material is `fog: false`. Never commit reference photos of the aircraft.
- **`createAircraftMesh` stays the plain model.** It does not delegate to the CT-156: it is the small, canvas-free T-6 (ship colours, optional outline) that runs in Node tests and anywhere without a `document`, and its geometry is pinned by its tests. A view that shows T-6s uses `createCt156Model` (with `paint: 'ship'` for the plain look); the Harvard model is what the Debrief, Turn Fight, Turn Sim and Traffic show by default.
- **Plain paint (`createAircraftMesh`, `createStandInMesh`).** The aircraft is the T-6-like model in ship colours only: fuselage in the ship colour, wings and stabiliser a shade darker, fin a shade lighter, dark spinner, translucent canopy and prop disc. Traffic's other types are plain stand-ins with no scheme. `outline` is optional edge lines on wings, stabiliser and fin.
- **Stand-ins for other types (D141).** `createStandInMesh(THREE, { color, outline, kind })` is for Traffic's Grob, Tutor, Astra, CT-156 and the like: `kind: 'generic'` (default, and any unknown kind) is a slim fuselage, straight wing and T-tail; `'dart'` is a low-poly delta wing with one fin. Same frame and size scale as the T-6, no prop disc, `fog: false`, freed by `disposeAircraftMesh`. Several aircraft at once are just several meshes, one per ship.
- **Model frame.** Nose +X, left +Y, up +Z; about 1.44 long (tail to spinner) and 1.32 across the wings, so `scale` is set to the plane size in feet. It is the Debrief spike's model, not V6's `t6Points`.
- No timers and no animation frames: the view draws when the scheduler's frame callback asks it to.

## 2D/3D switch (D141)

Every simulator has a 2D | 3D switch: the Debrief, Turn Fight, Turn Sim and Traffic. The SOF dashboard stays 2D and has none.

```js
import { VIEW_DEFAULT, VIEW_ALLOWED } from '../../ui-kit/controls.js';
const settings = createSettings(scope, { view: VIEW_DEFAULT /* '2d' */, /* … */ }, { allowed: { view: VIEW_ALLOWED } });
panel.body.append(controls.viewSwitch());          // a "View" choice, 2D then 3D, bound to the 'view' setting
controls.viewSwitch('mode')                        // or to another setting key
```

- `controls.viewSwitch(key = 'view')` is exactly `controls.choice(key, { label: 'View', options: 2D, 3D })`; `VIEW_DEFAULT` is `'2d'` and `VIEW_ALLOWED` is `['2d', '3d']`, so every module seeds and validates the setting the same way.
- **2D is the default.** three loads only when 3D is switched on: the module awaits `loadThree()` then, never at start-up.
- If `loadThree()` fails (offline on the first visit), the module shows "3D needs a connection the first time." beside the switch, puts the setting back to `2d`, and the 2D view keeps working. A later try loads it (a failed load is not cached).
- `webglSupported()` (from `three-aircraft.js`) says whether this browser can draw WebGL2, which three needs, checked once per page on a spare canvas. A 3D view should check it before building a renderer and, when it is false, stay in 2D with its "3D needs WebGL" message, so three never logs "Error creating WebGL context". Each module wires it in its own view (a follow-up for the module owners); until then their existing try/catch around the renderer still falls back to 2D.
- The 3D view uses `matchProjection` for its camera (no camera maths of its own) and `createAircraftMesh` or `createStandInMesh` for its aircraft; no flight math changes.

## Not overwhelming (R22)

Each screen shows only the essentials by default. Every setting the module has goes in its one settings menu (`createSettingsMenu`), closed by default. Extra detail goes behind a switch the person turns on: a `controls.checkbox` for a layer or graph (off by default), or a `createPanel({ collapsed: true })` section titled "More …" for extra readouts. A module's spec lists what shows by default and what sits behind a switch, and its sign-off checklist opens it fresh and checks nothing optional is on.

## Settings menu (R22)

Every module screen keeps its own tuning numbers behind one settings menu that starts closed, so the screen shows only the essentials. It looks and works the same in every module. `src/ui-kit/settings-menu.js`, built on `createPanel`.

The header's **Settings** button stays the app-wide dialog (home airfield, time zone, motion, formation standards); a module adds a section there only for a choice that applies across the app. The module's own numbers (turn G, spacing, speeds, what the sim does) go in its settings menu, titled with the module's name so the two never read the same.

```js
const menu = createSettingsMenu({ title: 'Turn Sim settings', onReset: () => standards.reset(), onToggle });
const turn = menu.section('Turn');           // a titled group; returns an element to append controls to
turn.append(controls.number('g', { label: 'Turn G', unit: 'G', min: 1, max: 6, step: 0.5 }));
layout.append(menu.element);                 // put this in the module's layout
menu.collapsed;                              // true until opened
menu.setCollapsed(false);                    // open it from code
menu.body;                                   // the container the sections live in
```

- It starts closed (`collapsed: true`) unless the caller passes `collapsed: false`. Pass the module's name as the title ("Turn Sim settings", "SOF settings"); it defaults to "Module settings". Never title it plain "Settings", which is the header's app-wide button.
- `onToggle(collapsed)` is called with the new state when the person opens or closes it. `setCollapsed()` from code does not call it, so a module that remembers the menu's state saves it in `onToggle` and restores it with `setCollapsed`.
- The header is the panel's real button with `aria-expanded`, so the mouse, Enter, Space and Tab all work (#35).
- Escape inside the open menu closes it, calls `onToggle(true)` and puts focus back on the header, as a dialog would. When it is closed, Escape does nothing.
- `section(title)` returns a `<fieldset class="settings-group">` with a `<legend>` holding the title as text, never HTML. Sections appear in the order they are made.
- With `onReset`, the menu has a "Reset to defaults" button (`resetLabel` changes the words) that calls it straight away, with no confirm dialog. Without `onReset`, there is no button.
- Opening or closing it never covers other controls: it expands in the page flow like other panels (R2, #34).
- Styles are in `base.css`, using tokens only.

## Boundaries

- `ui-kit` depends only on `core`. It never imports a module.
- Module stylesheets are scoped under the module's root element (`[data-module="turn-sim"] …`), so one module's CSS can't restyle another.

## Tests

- `tests/unit/ui-kit/scheduler.test.js`: one rAF loop shared by all scopes; the loop stops when the last frame callback is cancelled; `dispose` cancels frames and timers; a throwing callback is removed and the rest keep running; `stats()` returns to zero.
- `tests/unit/ui-kit/dom.test.js`: text children are inserted as text (a string with `<b>` shows the characters, not bold). Uses a minimal fake document.
- `tests/unit/source-rules.test.js`: no `!important`, `setInterval` or bare `requestAnimationFrame` outside `ui-kit/scheduler.js`, and no `localStorage` outside `storage/`.
- `tests/unit/ui-kit/canvas-view.test.js`: the transform maths: round trips, zoom keeps the point under the pointer still, the span limits, fit, and the visible bounds.
- `tests/unit/ui-kit/map-tiles.test.js` (moved from the debrief) and `vnc.test.js` (moves at SOF task 6): which tiles a view needs and the 64-tile limit, retries and giving up, the least-recently-drawn cache, nothing loaded after `dispose`; the VNC warp and bounds, and each chart fetched only when first shown.
- `tests/unit/ui-kit/settings-menu.test.js`: closed by default and opens with `collapsed: false`; a section title is inserted as text; sections keep their order; the Reset button exists only with `onReset`, calls it on click, and takes a custom label.
- `tests/unit/ui-kit/three-aircraft.test.js`: the three.js camera projects points to the same screen position as `scene.js projectPoint` (many views, canvas sizes and points, 1e-6 px); the aircraft mesh's axes, size, colours and outline; the CT-156 model (`ct156-model.test.js`, with a stub canvas document): both paints, frame and length, whole fin in the ship colour, number drawn, `fog: false`, and reference-counted dispose; the depth range; the aircraft's attitude (`rotation.set(-bank, -pitch, hdg)`, order 'ZYX') pointing the nose and left wing where `scene.js t6Points` does; `loadThree` returns one cached module (the no-static-import rule is in `source-rules.test.js`). three runs in Node without WebGL.
- `tests/unit/ui-kit/controls.test.js`: `viewSwitch` is a "View" choice with 2D then 3D, follows the setting, writes it, and binds another key; `VIEW_DEFAULT` and `VIEW_ALLOWED`. Stand-in aircraft (axes, size, colour, fog, dispose) are in `three-aircraft.test.js`.
- Browser (with the shell): panels open and close with the mouse and the keyboard, and Tab moves between controls.
- Browser (`tests/e2e/ui-kit.spec.js`, on a test page that loads the modules): each control updates its setting, follows outside changes, and refuses bad numbers with a message; the canvas view pans, zooms and uses the keys, draws only when asked, leaves the arrows to the page with `arrowKeys: false`, and stops listening after `dispose`; `setDisabled` greys out a control, marks it `aria-disabled` and turned-off controls pass axe; a guarded action waits while its number box refuses input; the Settings menu starts closed, opens from the keyboard, holds a working number control, calls Reset and closes again; the canvas surface redraws only on request or resize.

## Success criteria

- The tests above pass, and the shell's browser tests (overlap scan and module switching) pass using these pieces.
