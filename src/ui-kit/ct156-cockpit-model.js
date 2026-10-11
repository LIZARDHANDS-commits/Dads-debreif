// The CT-156 cockpit's parts built in Blender (ALL-32, Patrick 11 Oct 2026: "The CT-156 cockpit interior may be a
// Blender model file, built by script from the code model's numbers ... If the file fails to load, the code-drawn
// cockpit shows"): public/models/ct156-cockpit.glb, from tools/blender/build_ct156_cockpit.py. Each top-level part in the
// file (forward-bow, canopy-rails) replaces the code cockpit's mesh named ct156-cockpit-<part> once the file is in; until
// then, or if it never loads, the code's part shows. Built in the cockpit's own feet (nose +X, left +Y, up +Z), so the
// parts drop into the cockpit's group as they are. A picture only: no flight numbers.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const FILE = 'models/ct156-cockpit.glb';

/** The file's parts, loaded once per page and shared by every cockpit: Promise of [{ name, meshes: [{ geometry, material }] }]. */
let parts = null;

function loadParts() {
  if (!parts) {
    const base = (typeof import.meta !== 'undefined' && /** @type {any} */ (import.meta).env?.BASE_URL) || '/';
    parts = new GLTFLoader().loadAsync(`${base}${FILE}`).then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      return gltf.scene.children.map((node) => {
        const meshes = [];
        node.traverse((o) => {
          if (!o.isMesh) return;
          // Baked into the cockpit's feet; the file is exported Z-up, so no turn.
          meshes.push({ geometry: o.geometry.clone().applyMatrix4(o.matrixWorld), material: o.material?.name ?? 'frame' });
          o.material?.dispose?.();
        });
        return { name: node.name, meshes };
      });
    });
    parts.catch(() => {}); // a missing file leaves the code's parts showing
  }
  return parts;
}

/**
 * Adds the Blender parts to a cockpit's group (createCt156Cockpit) when the file is in, hiding the code's parts they
 * replace. mats: the cockpit's own materials by the file's material names (band, black, frame, dark), so the parts
 * light and dispose with the rest of the cockpit. Does nothing without a browser (tests, export scripts).
 */
export function attachCockpitModel(THREE, group, mats) {
  if (typeof document === 'undefined') return;
  loadParts().then((list) => {
    if (group.userData.disposed) return;
    for (const { name, meshes } of list) {
      const code = group.getObjectByName(`ct156-cockpit-${name}`);
      const part = new THREE.Group();
      part.name = `ct156-cockpit-${name}-model`;
      for (const { geometry, material } of meshes) part.add(new THREE.Mesh(geometry, mats[material] ?? mats.frame));
      group.add(part);
      if (code) code.visible = false;
    }
  }, () => {});
}
