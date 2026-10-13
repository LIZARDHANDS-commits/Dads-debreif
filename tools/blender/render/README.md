# CT-156 render scripts

Pictures of the CT-156 from the app's own model code, the way every check sheet in the graphics handover
(`docs/modules/shared/graphics-handover/`) was made. Nothing here ships in the app.

| File | What it does |
|---|---|
| `cockpit.html` | Page that builds one ship with the cockpit and points a camera from a seat. `window.shot(view)`, `window.pick(x, y)`, `window.rerender()`. |
| `outside.html` | Page that builds one ship and points a camera at it from outside. `window.view(view)`. |
| `shots.mjs` | Renders each view in a views file to a PNG. |
| `pick.mjs` | Names the part and material under points of a seat view. |
| `versions.mjs` + `versions.html` | Renders the same views from past versions, in a separate git worktree, for before-and-after sheets. |
| `views/` | View sets: `final` (front seat 55° and 90°, rear seat, outside quarter), `rail` and `mr` (rail, bow foot and mirrors), `seat` (both bow legs and straight ahead), `closeups` (outside close-ups, for `versions.mjs close`). |

## Use

1. `npm install`, then `npx playwright install chromium` once.
2. `npm run dev -- --port 5181 --strictPort` in one terminal.
3. In another:
   - `node tools/blender/render/shots.mjs 5181 out/check tools/blender/render/views/final.json` writes `out/check_f55.png` and the rest. Add `f55,f90` at the end for only those views.
   - `node tools/blender/render/pick.mjs 5181 '{"pitch":-10,"fov":55}' 0.5,0.6` names what is at the middle, 60 % down.
   - Old versions: `git worktree add --detach ../ct156-old main`, write `list.txt` with one `<commit> <label>` per line, then `node tools/blender/render/versions.mjs ../ct156-old list.txt out/old out` (or `cpit`, `close`).

Seat views take `pitch`, `yaw`, `fov`, `seat` (front or rear), or `from`/`at` in feet (nose +X, left +Y, up +Z).
Outside views take `eye`/`at` in feet from the spinner tip, or `ortho`. Set `CHROMIUM_PATH` to use a browser other
than Playwright's own.

## Traps

- **Wait for the model files.** The first draw happens before the Blender parts attach, so it shows the code's own
  parts. The scripts wait, then draw again (`rerender`). A picture taken without that has fooled us before.
- **Import first.** The model files come from a `3d-work` delivery (`npm run models:import`, `tools/blender/README.md`).
  If the console says a file is "not from the delivery", the picture shows code parts, not the model file.
- The renders use a plain test sun, not the app's sky, so shading differs a little from the app.
