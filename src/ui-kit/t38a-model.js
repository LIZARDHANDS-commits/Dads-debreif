// The T-38A Talon from Blender (shared plan Step 3d item 6, first delivery: the outside in the Beale AFB paint; Dad,
// 14 Oct 2026: "add it into the KML as a choice for how to display aircraft"; item 7, the rough cockpits, below). The files are built by
// tools/blender/t38/build_t38.py and export_t38.py: public/models/t38a-exterior.glb (every part) and
// t38a-exterior-lite.glb (the bigger parts decimated, the paint pictures halved), in feet, nose +X with the radome tip at
// x 0, left +Y, up +Z, the ground under the wheels at z GROUND_Z. Each file loads once a page and every T-38 shares it.
//
// A model is a group made at once and filled when its file is in; until then, or for good if the file is missing,
// damaged or slow, it shows `fallback()` (the caller's own aircraft), so a view never stops for a model. It is drawn in
// the CT-156's frame (ct156-model.js: nose +X, left +Y, up +Z, CT156_UNIT_LENGTH units nose to tail at lengthFt =
// CT156_UNIT_LENGTH), at the T-38's own length against the CT-156's, so the views that pose and scale the CT-156 pose and
// scale it the same way, and with its wheels as far under its origin as the Debrief puts the CT-156's (ground.js
// WHEELS_BELOW_ORIGIN_FT), so it sits on the same ground. A picture only: no flight numbers.
//
// The rough cockpits (shared plan Step 3d item 7, first pass; Dad, 14 Oct 2026: "lets workout the rough T-38A cockpit")
// are their own file, public/models/t38a-cockpit.glb, in the same frame, loaded only when a Cockpit camera first rides a
// T-38A: createT38aCockpitMount puts them into the ridden ship and t38aEyeWorld gives a seat's eye. Their instruments are
// pictures that don't move (the caller says so on screen).
import { modelsUrl } from './ct156-blender.js';
import { CT156_LENGTH_FT, CT156_UNIT_LENGTH, disposeCt156Model } from './ct156-model.js';

/** Nose (pitot tip) to nozzle exit, feet: the USAF fact sheet's 46 ft 4 in (tools/blender/t38/sources.md P-rows; public, unchecked). */
export const T38A_LENGTH_FT = 46 + 4 / 12;
/** In the file's frame: the pitot tip's x and the ground's z (build_t38.py PITOT and GROUND_Z), feet. */
const PITOT_X_FT = 2.16;
const GROUND_Z_FT = -4.71;
/**
 * Where the model turns about, as a share of its length behind the pitot tip: the CT-156's origin's share of its own
 * (0.66 of 1.44 units behind its spinner tip, about 0.46), so both pitch and bank about the same part of the aircraft.
 * An estimate for the look (near the T-38's wing, not its measured centre of gravity).
 */
const ORIGIN_SHARE = 0.66 / 1.44;
/** The CT-156's wheels under its origin in the Debrief, feet (ground.js WHEELS_BELOW_ORIGIN_FT, about 6.2; an estimate there). */
const WHEELS_BELOW_ORIGIN_FT = 6.2;
const FILES = Object.freeze({ high: 't38a-exterior.glb', lite: 't38a-exterior-lite.glb', cockpit: 't38a-cockpit.glb' });
/**
 * Each seat's eye in the file's frame, feet (build_t38.py EYE_FRONT and EYE_REAR, sources.md E10, estimates): 12.3 ft
 * behind the radome tip and 3.0 ft above it in front, 17.3 ft and 3.35 ft behind (the rear seat sits higher). The
 * cockpit is built round them: over the glare shield 13 deg down from the front eye, 8.7 deg from the rear one.
 */
export const T38A_EYES_FT = Object.freeze({ front: Object.freeze({ x: -12.3, y: 0, z: 3.0 }), rear: Object.freeze({ x: -17.3, y: 0, z: 3.35 }) });

const scenes = new Map(); // detail → Promise of the file's scene, or null when it can't be had
function sceneFor(detail) {
  if (!scenes.has(detail)) {
    scenes.set(detail, import('three/examples/jsm/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(modelsUrl(FILES[detail])))
      .then((gltf) => gltf.scene)
      .catch((err) => {
        console.warn(`T-38A model ${FILES[detail]} could not be loaded; the fallback stays:`, err);
        return null;
      }));
  }
  return scenes.get(detail);
}

/**
 * The T-38A as a THREE.Group in the CT-156's frame, `lengthFt` meaning what it means to createCt156Model (the CT-156
 * drawn CT156_UNIT_LENGTH long is lengthFt = CT156_UNIT_LENGTH; the T-38 is drawn longer by its real length over the
 * CT-156's). `detail` 'high' or 'lite'. `ghost` (0 to 1) draws it see-through at that opacity, with its own copies of
 * the materials. `fallback()` makes what shows until the file is in; `onReady(group)` is called when the model shows.
 */
export function createT38aModel(THREE, { lengthFt = CT156_UNIT_LENGTH, detail = 'high', ghost = null, fallback = null, onReady = null } = {}) {
  const group = new THREE.Group();
  const state = { disposed: false, standIn: fallback ? fallback() : null, copies: [], lengthFt };
  group.userData.t38a = state;
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

/** A group that holds what is drawn in the file's frame (feet, radome tip at x 0) where a T-38A of `lengthFt` puts it. */
function inFileFrame(THREE, lengthFt) {
  const s = lengthFt / CT156_LENGTH_FT; // drawn units per real foot (the CT-156's 33 ft 4 in is lengthFt units)
  const g = new THREE.Group();
  g.scale.setScalar(s);
  g.position.set((ORIGIN_SHARE * T38A_LENGTH_FT - PITOT_X_FT) * s, 0, (-WHEELS_BELOW_ORIGIN_FT - GROUND_Z_FT) * s);
  return g;
}

/** Whether `root` is a T-38A made by createT38aModel. */
export const isT38aModel = (root) => Boolean(root?.userData?.t38a);

/**
 * The eye of `seat` ('front' or 'rear', T38A_EYES_FT) of the T-38A `root` (a createT38aModel group, sized by its own
 * scale) in world units, as a THREE.Vector3. It is where the file puts the eye, whether or not the file is in yet.
 */
export function t38aEyeWorld(THREE, root, seat = 'front') {
  const eye = T38A_EYES_FT[seat] ?? T38A_EYES_FT.front;
  const frame = inFileFrame(THREE, root.userData.t38a?.lengthFt ?? CT156_UNIT_LENGTH);
  root.updateMatrixWorld(true);
  return root.localToWorld(new THREE.Vector3(eye.x, eye.y, eye.z).multiplyScalar(frame.scale.x).add(frame.position));
}

/**
 * One T-38A cockpit (both seats, t38a-cockpit.glb) that moves from ship to ship: mount(root) puts it into the T-38A
 * `root` (a createT38aModel group), loading the file on first need and calling onReady() when it shows, so a view that
 * draws on demand draws again; mount(null) takes it out. Until the file is in, or for good if it is missing or
 * damaged, the ship shows only its outside (its plain tub) and the view carries on. dispose() takes it out.
 * @param {any} THREE
 * @param {{ onReady?: () => void }} [options]
 */
export function createT38aCockpitMount(THREE, { onReady = null } = {}) {
  let holder = null; // the cockpit in the file's frame, in the ship it is mounted in
  let root = null;
  let disposed = false;
  const fill = (scene) => {
    if (!scene || disposed || !holder || holder.children.length) return;
    holder.add(scene.clone(true)); // shares the file's shapes and pictures
    onReady?.();
  };
  return {
    mount(nextRoot) {
      if (root === nextRoot) return;
      holder?.removeFromParent();
      holder = null;
      root = nextRoot && isT38aModel(nextRoot) ? nextRoot : null;
      if (!root) return;
      holder = inFileFrame(THREE, root.userData.t38a.lengthFt);
      holder.name = 't38a-cockpit';
      root.add(holder);
      sceneFor('cockpit').then(fill);
    },
    get root() {
      return root;
    },
    dispose() {
      disposed = true;
      holder?.removeFromParent();
      holder = null;
      root = null;
    },
  };
}

/** Takes a T-38A out of its scene and frees what is its own (the fallback while it shows, a ghost's materials); the shared file stays. */
export function disposeT38aModel(group) {
  const state = group.userData.t38a;
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
