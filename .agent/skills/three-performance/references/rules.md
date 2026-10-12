# three.js rules, checked against this project

Ideas adapted, in our own words, from `emalorenzo/three-agent-skills` (`three-best-practices`, read and scanned at
commit `f950f95`; its own sources are the three.js `llms` guidance and Utsubo's "100 Three.js Tips"). The repo has no
licence file, so nothing is copied from it. "Applies" means it fits this project as built; "Not here" says why not.

## Memory

| Rule | Here |
|---|---|
| Dispose geometries, materials, textures and render targets when a view or part goes; walk the whole tree | Applies. Use the shared dispose helpers first |
| Dispose the renderer when the 3D view closes | Applies |
| Reuse geometries and materials across meshes | Applies (the CT-156's shared kit does this) |
| Dispose in a framework's unmount | Not here: plain JavaScript, no framework |

## Render loop

| Rule | Here |
|---|---|
| One `requestAnimationFrame` loop | Applies |
| Draw only when something changed | Applies where the module allows (paused playback, a still Debrief view) |
| Move by elapsed time | Applies |
| No allocations in the loop; cache work outside it | Applies |
| Leave frustum culling on | Applies; don't turn it off on aircraft |
| Turn off automatic matrix updates for still objects | Applies to still scenery (Traffic's buildings) |
| Cap the pixel ratio | Applies; a lower cap in Performance |
| Antialias with care | Applies; the Performance setting may turn it off |

## Geometry

| Rule | Here |
|---|---|
| BufferGeometry only, indexed where possible, typed arrays sized to need | Applies |
| Join still parts that share a material | Applies; keep moving and swapped parts separate |
| `InstancedMesh` for many identical objects | Applies; Traffic and SOF already use it for scenery (trees, buildings, ramp clutter, towns) |
| Level of detail | Applies: the light Harvard far away (the CT-156's detail threshold), High and Performance files |
| Interleaved buffers | Rarely worth it here; measure first |

## Materials and textures

| Rule | Here |
|---|---|
| Reuse materials; simplest material that looks right | Applies |
| Power-of-two picture sizes, mipmaps, anisotropy on ground pictures | Applies |
| Compressed textures (KTX2) | Later: needs Basis transcoder files served by the app, so Patrick's yes first |
| Texture atlases | Applies where several small pictures share a material (the cockpit already uses one for its live faces) |
| Few transparent materials | Applies (canopy glass, disc, fog cards) |
| Change shaders with `onBeforeCompile` rather than a new shader material | Applies (the CT-156's baked shadows do this) |

## Lights and shadows

| Rule | Here |
|---|---|
| Few lights | Applies |
| Bake still light | Applies: the Blender bakes, Traffic's baked ground shadows |
| Tight shadow camera, modest shadow map, shadows only where needed, cascades for big scenes | Only when Patrick turns real-time shadows back on (ALL-37) |
| Environment light (PMREM, `RoomEnvironment`) for reflections | A candidate for High (canopy and paint); it changes every view's look, so Patrick's yes |
| Light probes | Not needed yet |

## Loading

| Rule | Here |
|---|---|
| glTF for models | Applies |
| Draco | Not here: Meshopt instead (decoder ships with three.js, faster to unpack) |
| Load progress, async loading, lazy loading of what isn't needed yet | Applies; until ALL-38 retires it, the code-drawn CT-156 shows while its files load |
| Cache and reuse loaded files; unload on leaving a view | Applies |

## Not used in this project

React Three Fiber and its helpers, WebXR, WebGPU and TSL shading, physics engines, spatial audio.
