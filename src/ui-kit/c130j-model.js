// The C-130J-30 Super Hercules from Blender (shared plan Step 3e item 6, first delivery: the outside in USAF grey with
// the Ramstein "RS" tail, Dad's picks, 15 Oct 2026; DB-35). The files are built by tools/blender/c130j/build_c130j.py and
// export_c130j.py: public/models/c130j-exterior.glb (every part) and c130j-exterior-lite.glb (the bigger parts
// decimated, the paint pictures halved), in feet, nose +X with the radome tip at x 0, left +Y, up +Z, the ground under
// the wheels at z GROUND_Z. Each file loads once a page and every C-130J shares it. There is no cockpit file.
//
// A model is a group made at once and filled when its file is in; until then, or for good if the file is missing,
// damaged or slow, it shows `fallback()` (the caller's own aircraft), so a view never stops for a model (ALL-38 (4)). It
// is drawn in the CT-156's frame (ct156-model.js: nose +X, left +Y, up +Z, CT156_UNIT_LENGTH units nose to tail at
// lengthFt = CT156_UNIT_LENGTH), at the C-130J's own length against the CT-156's, so the views that pose and scale the
// CT-156 pose and scale it the same way, and with its wheels as far under its origin as the Debrief puts the CT-156's
// (ground.js WHEELS_BELOW_ORIGIN_FT), so it sits on the same ground. Modelled on t38a-model.js. A picture only: no
// flight numbers.
import { modelsUrl } from './ct156-blender.js';
import { CT156_LENGTH_FT, CT156_UNIT_LENGTH, disposeCt156Model } from './ct156-model.js';

/** Radome tip to tail, feet: the RCAF CC-130J fact sheet's 112 ft 9 in, the C-130J-30 (tools/blender/c130j/sources.md P1; public, unchecked). */
export const C130J_LENGTH_FT = 112 + 9 / 12;
/** In the file's frame: the ground's z (build_c130j.py GROUND_Z), feet; the radome tip is at x 0. */
const GROUND_Z_FT = -7.16;
/**
 * Where the model turns about, as a share of its length behind the radome tip: the CT-156's origin's share of its own
 * (0.66 of 1.44 units behind its spinner tip, about 0.46), as the T-38A's, so all three pitch and bank about the same
 * part of the aircraft. On the C-130J it falls about mid-chord on the wing: an estimate for the look, not its measured
 * centre of gravity.
 */
const ORIGIN_SHARE = 0.66 / 1.44;
/** The CT-156's wheels under its origin in the Debrief, feet (ground.js WHEELS_BELOW_ORIGIN_FT, about 6.2; an estimate there). */
const WHEELS_BELOW_ORIGIN_FT = 6.2;
const FILES = Object.freeze({ high: 'c130j-exterior.glb', lite: 'c130j-exterior-lite.glb' });

const scenes = new Map(); // detail → Promise of the file's scene, or null when it can't be had
function sceneFor(detail) {
  if (!scenes.has(detail)) {
    scenes.set(detail, import('three/examples/jsm/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(modelsUrl(FILES[detail])))
      .then((gltf) => gltf.scene)
      .catch((err) => {
        console.warn(`C-130J model ${FILES[detail]} could not be loaded; the fallback stays:`, err);
        return null;
      }));
  }
  return scenes.get(detail);
}

/**
 * The C-130J as a THREE.Group in the CT-156's frame, `lengthFt` meaning what it means to createCt156Model (the CT-156
 * drawn CT156_UNIT_LENGTH long is lengthFt = CT156_UNIT_LENGTH; the C-130J is drawn longer by its real length over the
 * CT-156's). `detail` 'high' or 'lite'. `ghost` (0 to 1) draws it see-through at that opacity, with its own copies of
 * the materials. `fallback()` makes what shows until the file is in; `onReady(group)` is called when the model shows.
 */
export function createC130jModel(THREE, { lengthFt = CT156_UNIT_LENGTH, detail = 'high', ghost = null, fallback = null, onReady = null } = {}) {
  const group = new THREE.Group();
  const state = { disposed: false, standIn: fallback ? fallback() : null, copies: [], lengthFt };
  group.userData.c130j = state;
  if (state.standIn) group.add(state.standIn);
  sceneFor(detail).then((scene) => {
    if (!scene || state.disposed) return;
    const inner = inFileFrame(THREE, lengthFt);
    const copy = scene.clone(true); // shares the file's shapes and paint: never freed with one aircraft
    if (ghost != null) {
      copy.traverse((o) => {
        if (!o.material) return;
        const see = (m) => {
          const c = m.clone();
          c.transparent = true;
          c.opacity = (m.opacity ?? 1) * ghost;
          c.depthWrite = false;
          state.copies.push(c);
          return c;
        };
        o.material = Array.isArray(o.material) ? o.material.map(see) : see(o.material);
      });
    }
    inner.add(copy);
    if (state.standIn) {
      freeOwn(state.standIn);
      state.standIn = null;
    }
    group.add(inner);
    onReady?.(group);
  });
  return group;
}

/** A group that holds what is drawn in the file's frame (feet, radome tip at x 0) where a C-130J of `lengthFt` puts it. */
function inFileFrame(THREE, lengthFt) {
  const s = lengthFt / CT156_LENGTH_FT; // drawn units per real foot (the CT-156's 33 ft 4 in is lengthFt units)
  const g = new THREE.Group();
  g.scale.setScalar(s);
  g.position.set(ORIGIN_SHARE * C130J_LENGTH_FT * s, 0, (-WHEELS_BELOW_ORIGIN_FT - GROUND_Z_FT) * s);
  return g;
}

/** Whether `root` is a C-130J made by createC130jModel. */
export const isC130jModel = (root) => Boolean(root?.userData?.c130j);

/** Takes a C-130J out of its scene and frees what is its own (the fallback while it shows, a ghost's materials); the shared file stays. */
export function disposeC130jModel(group) {
  const state = group.userData.c130j;
  group.removeFromParent();
  if (!state) return;
  state.disposed = true;
  if (state.standIn) freeOwn(state.standIn);
  state.standIn = null;
  for (const c of state.copies) c.dispose();
  state.copies.length = 0;
}

function freeOwn(mesh) {
  if (mesh.userData?.ct156) {
    disposeCt156Model(mesh);
    return;
  }
  mesh.removeFromParent();
  const materials = new Set();
  mesh.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [].concat(o.material ?? [])) materials.add(m);
  });
  for (const m of materials) m.dispose();
}
