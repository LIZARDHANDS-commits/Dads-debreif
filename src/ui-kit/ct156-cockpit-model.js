// The CT-156 cockpit's parts built in Blender (ALL-32, Patrick 11 Oct 2026: "The CT-156 cockpit interior may be a
// Blender model file, built by script from the code model's numbers ... If the file fails to load, the code-drawn
// cockpit shows"; ALL-38: Blender owns the shape): public/models/ct156/high/ct156-cockpit.glb, delivered from the
// 3d-work master and taken in by `npm run models:import` (plan Step 3b item 3.4). Each top-level part in the
// file (forward-bow, canopy-rails, and the seat, pcl and stick rounded from the code's own pieces) replaces the code cockpit's mesh named ct156-cockpit-<part> once the file is in; until
// then, or if it never loads, the code's part shows. Built in the cockpit's own feet (nose +X, left +Y, up +Z), so the
// parts drop into the cockpit's group as they are. A picture only: no flight numbers.
import { aoShaded, CT156_FILES, loadAo, loadDelivered } from './ct156-blender.js';

const FILE = 'ct156-cockpit.glb';

/** The file's parts, loaded once per page and shared by every cockpit: Promise of [{ name, ao, meshes }]. */
let parts = null;
function cockpitParts(THREE) {
  if (!parts) {
    parts = loadDelivered(FILE).then((list) => list.map(({ name, extras, meshes }) => ({
      name, ao: extras.ct156_ao ? loadAo(THREE, CT156_FILES + extras.ct156_ao) : null, meshes,
    })));
    parts.catch(() => {}); // a missing file leaves the code's parts showing
  }
  return parts;
}

/**
 * Adds the Blender parts to a cockpit's group (createCt156Cockpit) when the file is in, hiding the code's parts they
 * replace. mats: the cockpit's own materials by the file's material names (its colour slots: band, black, frame, dark,
 * seat, knob and the rest), so the parts
 * light and dispose with the rest of the cockpit; own(material) hands it the shaded copies to dispose. Does nothing without a browser (tests, export scripts).
 */
export function attachCockpitModel(THREE, group, mats, own = (m) => m) {
  if (typeof document === 'undefined') return;
  cockpitParts(THREE).then((list) => {
    if (group.userData.disposed) return;
    for (const { name, ao, meshes } of list) {
      // Every part of the imported delivery replaces the code's part of its name (loadDelivered checked the file came
      // from that delivery; since plan 3.4 the code's fingerprints are no longer compared). 'shade' is the pictured
      // faces' shadows, with no code part of its own.
      const code = group.getObjectByName(`ct156-cockpit-${name}`);
      const part = new THREE.Group();
      part.name = `ct156-cockpit-${name}-model`;
      for (const { geometry, material } of meshes) {
        if (material === 'shade') { // the pictured faces' baked shadows, laid over the code's pictures
          if (ao) part.add(new THREE.Mesh(geometry, own(new THREE.MeshBasicMaterial({ map: ao, blending: THREE.MultiplyBlending, premultipliedAlpha: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide, fog: false }))));
          continue;
        }
        const base = mats[material] ?? mats.frame;
        // Lit colours take the part's baked shadows; the self-lit lamps don't.
        const m = ao && geometry.attributes.uv && base.isMeshStandardMaterial ? own(aoShaded(base, ao)) : base;
        const mesh = new THREE.Mesh(geometry, m);
        mesh.castShadow = mesh.receiveShadow = !m.transparent; // real-time shadows where a view has them (aircraft-shadows.js)
        part.add(mesh);
      }
      group.add(part);
      if (code) code.visible = false;
    }
  }, () => {});
}
