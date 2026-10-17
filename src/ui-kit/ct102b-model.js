// The CT-102B Astra II from Blender (shared plan Step 3c item 6, first delivery: the outside and its RCAF paint, no
// cockpit; Traffic plan Step 5c Phase 5; Dad, 14 Oct 2026: "Export it now, refine later"). The files are built by
// tools/blender/ct102b/build_ct102b.py and export_ct102b.py: public/models/ct102b-exterior.glb (every part as built) and
// ct102b-exterior-lite.glb (the bigger parts decimated, the paint pictures halved), in feet, nose +X with the spinner tip
// at x 0, left +Y, up +Z. Each file loads once a page and every Astra shares its shapes and paint.
//
// A model is a group made at once: the stand-in it is given (`fallback`) shows until the file is in, and stays if the file
// is missing, damaged or slow (Traffic spec 4.19 item 8: the 3D view never stops for a model). It is drawn in the frame
// the CT-156 uses (nose +X, left +Y, up +Z, nose to tail `unitLength`, the spinner tip at the CT-156's nose and the tail at
// its tail), so the views that pose and scale the CT-156 pose and scale it the same way. A picture only: no flight numbers.
import { modelsUrl } from './ct156-blender.js';

/** The Astra II's length nose to tail, feet: the EASA type sheet's 8.42 m (Traffic spec 4.19's table; public). */
export const CT102B_LENGTH_FT = 27.62;
/** Where the CT-156's frame puts its spinner tip, in its own units (ct156-model.js CT156_UNIT_LENGTH: x -0.78 to 0.66). */
const NOSE_AT = 0.66;
const FILES = Object.freeze({ high: 'ct102b-exterior.glb', lite: 'ct102b-exterior-lite.glb' });

const scenes = new Map(); // detail → Promise of the file's scene, or null when it can't be had
function sceneFor(detail) {
  if (!scenes.has(detail)) {
    scenes.set(detail, import('three/examples/jsm/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(modelsUrl(FILES[detail])))
      .then((gltf) => gltf.scene)
      .catch((err) => {
        console.warn(`CT-102B model ${FILES[detail]} could not be loaded; the stand-in stays:`, err);
        return null;
      }));
  }
  return scenes.get(detail);
}

/**
 * The Astra II as a THREE.Group (nose +X, left +Y, up +Z, nose to tail `unitLength`): `fallback()` makes the stand-in
 * shown until the file `detail` ('high' or 'lite') is in, or for good if it can't be had. `onReady(group)` is called when
 * the file's model has taken the stand-in's place.
 */
export function createCt102bModel(THREE, { detail = 'lite', unitLength = 1.44, fallback, onReady = null } = {}) {
  const group = new THREE.Group();
  const state = { detail, disposed: false, standIn: fallback ? fallback() : null };
  group.userData.ct102b = state;
  if (state.standIn) group.add(state.standIn);
  sceneFor(detail).then((scene) => {
    if (!scene || state.disposed) return;
    const inner = new THREE.Group();
    inner.add(scene.clone(true)); // shares the file's shapes and paint: never freed with one aircraft
    inner.scale.setScalar(unitLength / CT102B_LENGTH_FT);
    inner.position.x = NOSE_AT * (unitLength / 1.44);
    if (state.standIn) {
      freeOwn(state.standIn);
      state.standIn = null;
    }
    group.add(inner);
    onReady?.(group);
  });
  return group;
}

/** Takes an Astra out of its scene and frees what is its own (the stand-in, while it shows); the shared file stays. */
export function disposeCt102bModel(group) {
  const state = group.userData.ct102b;
  group.removeFromParent();
  if (!state) return;
  state.disposed = true;
  if (state.standIn) freeOwn(state.standIn);
  state.standIn = null;
}

function freeOwn(mesh) {
  mesh.removeFromParent();
  const materials = new Set();
  mesh.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [].concat(o.material ?? [])) materials.add(m);
  });
  for (const m of materials) m.dispose();
}
