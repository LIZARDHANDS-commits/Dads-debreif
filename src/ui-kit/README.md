# ui-kit

The shared look and building blocks (spec: `specs/SPEC-ui-kit.md`).

- `tokens.css`: every colour, space and font size. **To change a colour everywhere,** change it here.
- `base.css`: page-wide styles for text, buttons, focus outlines and panels.
- `dom.js`: `h(tag, props, ...children)` builds elements; text always goes in as text.
- `scheduler.js`: the one animation loop and timer service. Modules get a scope as `app.scheduler` (`frame`, `every`, `after`), and everything in it stops when the module closes.
- `panel.js`: a collapsible section with a proper header button.
- `controls.js`: number boxes, sliders, checkboxes, lists and 2D | 3D style choices, each tied to one setting. A number box only accepts finite numbers in range; anything else is refused with a message and the last good value stays.
- `canvas-view.js`: a map canvas with drag to pan, wheel or +/- to zoom and arrow keys to move, kept sharp on high-density screens. It draws only when something changes. `toScreen`, `toWorld`, `zoomAbout` and `fitBounds` are the plain math behind it.

Rules, checked by `tests/unit/source-rules.test.js`: no `!important`, no `setInterval`, no `requestAnimationFrame` outside `scheduler.js`, no `innerHTML`.
