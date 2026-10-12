---
name: three-performance
description: How to make this project's 3D views (three.js) faster and lighter, and how to build their High and Performance graphics settings. Use for draw calls, triangles, textures and graphics memory, loading model files, the render loop, lights and shadows, or when a 3D view is slow on a weak computer. Internal to this project.
---

# three.js performance in this project

Read `AGENTS.md` first. Use `performance-optimization` for the general method (measure, find the bottleneck, fix,
measure again); this skill adds what is particular to 3D and to this project. The full rule list, with which rules
apply here and which don't, is in `references/rules.md`: read it before changing a renderer, a loader or a model file.

## The project's own limits come first

- **Patrick's decisions win over any rule here.** Real-time aircraft shadows stay off (ALL-37) until Patrick says
  otherwise; the CT-156's shape belongs to the Blender master files in `3d-work` (ALL-38); the 3D view is a bonus in a
  module still being built, so no 3D tests or polish there (rule book).
- **No new libraries without Patrick's yes.** Anything under `three/addons/` or `three/examples/jsm/` ships with the
  three.js the app already loads and is not new; a decoder or transcoder file the app would have to serve (Draco, KTX2's
  Basis files) is, so ask first.
- **Three.js is loaded only by dynamic import** (`loadThree()`); a static `import 'three'` fails the source-rules test.
- **Never trade correctness of the flying for frame rate.** Speed work touches drawing only, never flight math.
- **No performance tests.** The rule book keeps tests light (no stress or long runs); a speed change is shown with a
  before and after measurement in the pull request, not a test.

## Measure before changing anything

Read `renderer.info` after a frame: `render.calls` (draw calls), `render.triangles`, `memory.geometries`,
`memory.textures`. Traffic's 3D view already writes draw calls and triangles on its canvas (`data-calls`,
`data-triangles`); a view that doesn't should get the same before any speed work. Measure from the module's default
start, High and Performance, and write the numbers in the pull request.

Rule of thumb, not a requirement: under about 100 draw calls a frame keeps most computers smooth (an estimate from
three.js practice; check it against the real view).

## What usually costs the most, in order

1. **Draw calls.** Each separate mesh with its own material is one call. Reuse geometries and materials; draw many
   identical objects as one `InstancedMesh`; join static parts that share a material; let far-away aircraft be the
   light Harvard (`createLightHarvard`). Keep moving and swapped parts separate.
2. **Graphics memory.** A picture costs its width × height × 4 bytes, plus a third for mipmaps, whatever its file size:
   a 4096 px picture is about 90 MB, a 2048 px one about 22 MB. The Performance setting uses smaller pictures.
3. **Pixel ratio.** Cap `renderer.setPixelRatio` (for example `Math.min(devicePixelRatio, 2)`, lower in Performance):
   a high-DPI laptop otherwise draws four times the pixels.
4. **Triangles.** Cut them where they are made (fewer segments, in the Blender build) rather than simplifying
   afterwards; simplifying breaks thin parts.
5. **Transparency and lights.** Each transparent material is sorted and drawn separately; keep few lights, and bake
   still light into pictures (the Blender bakes).

## The render loop

One `requestAnimationFrame` loop per view; move things by elapsed time, not by frame count; never create objects
(`new Vector3`, arrays) inside the loop, reuse them; skip drawing when nothing moved where the module allows it (a
paused playback).

## Loading and freeing

- Model files are glTF (`.glb`). Compress geometry with Meshopt at delivery (its decoder ships with three.js); not
  Draco. Textures stay JPEG or PNG until Patrick agrees to serve KTX2's files.
- Load once and share: a model file used by several aircraft is loaded once.
- When a view closes or a setting reloads it, dispose every geometry, material and texture it made (the shared
  helpers, for example `disposeCt156Model`, do the CT-156's), then the renderer. Check `renderer.info.memory` drops back.

## Report

What was measured before and after (draw calls, triangles, graphics memory, frame rate if measured), from which start
and setting; what changed; what is untested or unseen.
