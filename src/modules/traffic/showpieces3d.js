// The showpiece buildings built in Blender (TR-142; Patrick, 10 Oct: "Showpiece buildings rebuilt in Blender: the hangars, Glass
// Palace, tower, Snowbirds hangar and Mess, with real roofs, recessed windows"): Hangars 1 to 3 with their annexes, Hangars 5 and 6,
// the Mess, the Glass Palace and the tower, from tools/blender/build-showpieces.py as one .glb. They load after the view opens; each
// replaces its code-built building (scenery3d.js, flightline-buildings3d.js), whose decals stay (the Snowbirds crest and stripes, the
// "7", the Big 2 patch, the Glass Palace's glass and roof units, labels: marked userData.keep). If the file fails to load, the
// code-built buildings stay, as before.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { roofMaterial } from './roof-textures3d.js';

const FILE = 'media/traffic-models/showpieces.glb';

/** The four materials the .glb's buildings use; colours come from each face's vertex colour. */
function materials(THREE) {
  const vc = (m) => {
    m.vertexColors = true; // roofMaterial's colour is lifted for its texture's mean; the face colour multiplies it
    return m;
  };
  return {
    plain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.6 }),
    'roof-metal': vc(roofMaterial(THREE, 'metal', '#ffffff', { roughness: 0.5, metalness: 0.3 })),
    'roof-membrane': vc(roofMaterial(THREE, 'membrane', '#ffffff', { roughness: 0.85, metalness: 0.02 })),
  };
}

/**
 * Starts loading the showpieces into `root` (the airfield scenery group) at z = floor; onLoaded() runs once they are in, for a
 * redraw. Does nothing without a browser (tests, the export scripts).
 */
export function loadShowpieces(THREE, root, floor, onLoaded = () => {}) {
  if (typeof document === 'undefined') return;
  const base = (typeof import.meta !== 'undefined' && /** @type {any} */ (import.meta).env?.BASE_URL) || '/';
  new GLTFLoader().load(`${base}${FILE}`, (gltf) => {
    const loaded = gltf.scene;
    loaded.updateMatrixWorld(true);
    const freeLoaded = () => loaded.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material ?? [])) m.dispose();
    });
    if (root.userData.disposed) {
      freeLoaded();
      return;
    }
    const mats = materials(THREE);
    const group = new THREE.Group();
    group.name = 'showpieces';
    group.position.z = floor;
    for (const node of loaded.children) {
      const building = new THREE.Group();
      building.name = `${node.name}-showpiece`;
      node.traverse((o) => {
        if (!o.isMesh) return;
        // Baked into world feet, z up (the .glb is y up).
        const geo = o.geometry.clone().applyMatrix4(o.matrixWorld).rotateX(Math.PI / 2);
        const mesh = new THREE.Mesh(geo, mats[o.material?.name] ?? mats.plain);
        mesh.name = `${node.name}-${o.material?.name ?? 'plain'}`;
        building.add(mesh);
      });
      group.add(building);
      // Hide the code-built building it replaces, keeping its decals.
      const old = root.getObjectByName(node.name);
      old?.traverse((o) => {
        if ((o.isMesh || o.isSprite) && !o.userData.keep) o.visible = false;
      });
    }
    const facades = root.getObjectByName('showpiece-facades');
    if (facades) facades.visible = false;
    freeLoaded();
    root.add(group);
    onLoaded();
  }, undefined, () => {
    // The code-built buildings stay (data failure: nothing to show but what was there).
  });
}
