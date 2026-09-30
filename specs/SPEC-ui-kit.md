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
- `setDisabled(key, true)` greys out every control bound to that setting (for example 3D-only options while in 2D), and `false` turns them back on. The setting keeps its value.
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

## Not overwhelming (R22)

Each screen shows only the essentials by default. Extra detail goes behind a switch the person turns on: a `controls.checkbox` for a layer or graph (off by default), or a `createPanel({ collapsed: true })` section titled "More …" for extra readouts and advanced settings. A module's spec lists what shows by default and what sits behind a switch, and its sign-off checklist opens it fresh and checks nothing optional is on.

## Boundaries

- `ui-kit` depends only on `core`. It never imports a module.
- Module stylesheets are scoped under the module's root element (`[data-module="turn-sim"] …`), so one module's CSS can't restyle another.

## Tests

- `tests/unit/ui-kit/scheduler.test.js`: one rAF loop shared by all scopes; the loop stops when the last frame callback is cancelled; `dispose` cancels frames and timers; a throwing callback is removed and the rest keep running; `stats()` returns to zero.
- `tests/unit/ui-kit/dom.test.js`: text children are inserted as text (a string with `<b>` shows the characters, not bold). Uses a minimal fake document.
- `tests/unit/source-rules.test.js`: no `!important`, `setInterval` or bare `requestAnimationFrame` outside `ui-kit/scheduler.js`, and no `localStorage` outside `storage/`.
- `tests/unit/ui-kit/canvas-view.test.js`: the transform maths: round trips, zoom keeps the point under the pointer still, the span limits, fit, and the visible bounds.
- Browser (with the shell): panels open and close with the mouse and the keyboard, and Tab moves between controls.
- Browser (`tests/e2e/ui-kit.spec.js`, on a test page that loads the modules): each control updates its setting, follows outside changes, and refuses bad numbers with a message; the canvas view pans, zooms and uses the keys, draws only when asked, leaves the arrows to the page with `arrowKeys: false`, and stops listening after `dispose`; `setDisabled` greys out a control; the canvas surface redraws only on request or resize.

## Success criteria

- The tests above pass, and the shell's browser tests (overlap scan and module switching) pass using these pieces.
