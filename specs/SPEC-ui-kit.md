# Spec: ui-kit

Module id `ui-kit` in the approved map (`SPEC.md`). Build step 1, extended as modules need it.

## Objective

One shared look and one set of building blocks, so modules stop fighting over the page. V6 had six layers of CSS patches with 348 `!important`, side rails that covered controls (#34), a Tab key that hid panels (#35), and animation loops that kept running for hidden modules (#39). Here there's one stylesheet of tokens, panels that never cover controls, normal keyboard behaviour, and one scheduler that only runs the open module's work (R2, R4).

## What step 1 provides

`src/ui-kit/tokens.css`: colours, spacing, type and radii as CSS custom properties, taken from V6's palette (dark navy background, cyan accent). No module defines its own colours for shared things.

`src/ui-kit/base.css`: page reset, typography, buttons, links, focus outlines, form controls, the `[hidden]` rule, and a `prefers-reduced-motion` rule. No `!important` anywhere in `src/` (checked by a test).

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
- `createScheduler({ raf, caf, setTimeout, clearTimeout, now })` accepts fakes, so it's unit-tested in Node.
- No `setInterval` or `requestAnimationFrame` anywhere else in `src/` (checked by a test).

`src/ui-kit/panel.js`: `createPanel({ title, collapsed, onToggle })` makes a collapsible section whose header is a real `<button>` with `aria-expanded`. Collapsing a panel never hides another panel's controls, and there are no side rails or Tab-key tricks.

Later, when the first module needs them: `controls.js` (binds inputs to settings, so math never reads input boxes) and `canvas-view.js` (pan and zoom for the 2D views).

Number controls in `controls.js` accept only finite numbers inside each control's own range. Anything else (blank, `Infinity`, a huge value) is refused with a message beside the box and the setting keeps its last good value. V6's angle loops never return for `Infinity`, so a huge Turn Sim start heading could freeze the page (from the flight math workstream, PR #51).

## Boundaries

- `ui-kit` depends only on `core`. It never imports a module.
- Module stylesheets are scoped under the module's root element (`[data-module="turn-sim"] …`), so one module's CSS can't restyle another.

## Tests

- `tests/unit/ui-kit/scheduler.test.js`: one rAF loop shared by all scopes; the loop stops when the last frame callback is cancelled; `dispose` cancels frames and timers; a throwing callback is removed and the rest keep running; `stats()` returns to zero.
- `tests/unit/ui-kit/dom.test.js`: text children are inserted as text (a string with `<b>` shows the characters, not bold). Uses a minimal fake document.
- `tests/unit/source-rules.test.js`: no `!important`, `setInterval` or bare `requestAnimationFrame` outside `ui-kit/scheduler.js`, and no `localStorage` outside `storage/`.
- Browser (with the shell): panels open and close with the mouse and the keyboard, and Tab moves between controls.

## Success criteria

- The tests above pass, and the shell's browser tests (overlap scan and module switching) pass using these pieces.
