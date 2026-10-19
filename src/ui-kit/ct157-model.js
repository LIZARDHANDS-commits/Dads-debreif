// The CT-157 Siskin II (Pilatus PC-21) from Blender (shared plan Step 3f item 6, first delivery: the outside and its RCAF
// paint of 201, no cockpit; Traffic plan Step 5d, TR-168; proposed, built ahead of Patrick's yes, Dad 17 to 18 Oct 2026).
// The files are built by tools/blender/pc21/build_pc21.py and export_pc21.py: public/models/ct157-exterior.glb (every
// part as built) and ct157-exterior-lite.glb (the bigger parts decimated, the paint pictures halved), in feet, nose +X
// with the spinner tip at x 0, left +Y, up +Z. Each file loads once a page and every CT-157 shares its shapes and paint.
//
// A model is a group made at once: the stand-in it is given (`fallback`) shows until the file is in, and stays if the file
// is missing, damaged or slow (Traffic spec 4.20 item 7: the 3D view never stops for a model). It is drawn in the frame
// the CT-156 uses (nose +X, left +Y, up +Z, nose to tail `unitLength`, the spinner tip at the CT-156's nose), as the
// Astra's is (ct102b-model.js), so the views that pose and scale the CT-156 pose and scale it the same way. A picture
// only: no flight numbers.
import { modelsUrl } from './ct156-blender.js';

/** The CT-157's length nose to tail, feet: 36 ft 10 in (11.22 m), the Pilatus three-view Dad sent (Traffic spec 4.20). */
export const CT157_LENGTH_FT = 36 + 10 / 12;
/** Where the CT-156's frame puts its spinner tip, in its own units (ct156-model.js CT156_UNIT_LENGTH: x -0.78 to 0.66). */
const NOSE_AT = 0.66;
const FILES = Object.freeze({ high: 'ct157-exterior.glb', lite: 'ct157-exterior-lite.glb' });

const scenes = new Map(); // detail → Promise of the file's scene, or null when it can't be had
function sceneFor(detail) {
  if (!scenes.has(detail)) {
    scenes.set(detail, import('three/examples/jsm/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(modelsUrl(FILES[detail])))
      .then((gltf) => gltf.scene)
      .catch((err) => {
        console.warn(`CT-157 model ${FILES[detail]} could not be loaded; the stand-in stays:`, err);
        return null;
      }));
  }
  return scenes.get(detail);
}

/**
 * The CT-157 as a THREE.Group (nose +X, left +Y, up +Z, nose to tail `unitLength`): `fallback()` makes the stand-in shown
 * until the file `detail` ('high' or 'lite') is in, or for good if it can't be had. `onReady(group)` is called when the
 * file's model has taken the stand-in's place.
 */
export function createCt157Model(THREE, { detail = 'lite', unitLength = 1.44, fallback, onReady = null } = {}) {
  const group = new THREE.Group();
  const state = { detail, disposed: false, standIn: fallback ? fallback() : null };
  group.userData.ct157 = state;
  if (state.standIn) group.add(state.standIn);
  sceneFor(detail).then((scene) => {
    if (!scene || state.disposed) return;
    const inner = new THREE.Group();
    inner.add(scene.clone(true)); // shares the file's shapes and paint: never freed with one aircraft
    inner.scale.setScalar(unitLength / CT157_LENGTH_FT);
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

/** Takes a CT-157 out of its scene and frees what is its own (the stand-in, while it shows); the shared file stays. */
export function disposeCt157Model(group) {
  const state = group.userData.ct157;
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
