// The CT-156 cockpit's parts built in Blender (ALL-32, Patrick 11 Oct 2026: "The CT-156 cockpit interior may be a
// Blender model file, built by script from the code model's numbers ... If the file fails to load, the code-drawn
// cockpit shows"): public/models/ct156-cockpit.glb, from tools/blender/build_ct156_cockpit.py. Each top-level part in the
// file (forward-bow, canopy-rails, and the seat, pcl and stick rounded from the code's own pieces) replaces the code cockpit's mesh named ct156-cockpit-<part> once the file is in; until
// then, or if it never loads, the code's part shows. Built in the cockpit's own feet (nose +X, left +Y, up +Z), so the
// parts drop into the cockpit's group as they are. A picture only: no flight numbers.
// three.js comes from the caller (THREE) and its loaders with import(), so nothing of it loads until a 3D view does.

const FILE = 'models/ct156-cockpit.glb';

/** A part's baked soft shadows (its grey picture beside the file, laid on its own UV map), loaded once. */
const aoTextures = new Map();
function loadAo(THREE, base, file) {
  if (!aoTextures.has(file)) {
    const t = new THREE.TextureLoader().load(`${base}models/${file}`);
    t.flipY = false; // as the file's other pictures: glTF lays its UV maps top down
    aoTextures.set(file, t);
  }
  return aoTextures.get(file);
}

/**
 * The cockpit's colour darkened by a part's baked soft shadows, in direct light as well as in the sky's (three.js's
 * own aoMap shades only the sky's light, and the sun is most of the cockpit's light).
 */
function shaded(material, ao) {
  const m = material.clone();
  m.aoMap = ao;
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>',
      '#include <aomap_fragment>\n#ifdef USE_AOMAP\n\treflectedLight.directDiffuse *= ambientOcclusion;\n\treflectedLight.directSpecular *= ambientOcclusion;\n#endif');
  };
  m.customProgramCacheKey = () => 'ct156-ao-direct';
  return m;
}

/** The file's parts, loaded once per page and shared by every cockpit: Promise of [{ name, meshes: [{ geometry, material }] }]. */
let parts = null;

function loadParts(THREE) {
  if (!parts) {
    const base = (typeof import.meta !== 'undefined' && /** @type {any} */ (import.meta).env?.BASE_URL) || '/';
    let mergeGeometries;
    parts = Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/utils/BufferGeometryUtils.js')])
      .then(([{ GLTFLoader }, utils]) => {
        mergeGeometries = utils.mergeGeometries;
        return new GLTFLoader().loadAsync(`${base}${FILE}`);
      })
      .then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      return gltf.scene.children.map((node) => {
        // One mesh per colour per part (a part's pieces merged), each baked into the cockpit's feet; the file is
        // exported Z-up, so no turn.
        const byMaterial = new Map();
        node.traverse((o) => {
          if (!o.isMesh) return;
          const name = o.material?.name || 'frame';
          const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
          for (const key of Object.keys(g.attributes)) if (key !== 'position' && key !== 'normal' && key !== 'uv') g.deleteAttribute(key);
          if (!byMaterial.has(name)) byMaterial.set(name, []);
          byMaterial.get(name).push(g.index ? g.toNonIndexed() : g);
          o.material?.dispose?.();
        });
        const meshes = [...byMaterial].map(([material, list]) => ({ geometry: list.length > 1 ? mergeGeometries(list) : list[0], material }));
        return { name: node.name, hash: node.userData?.ct156_hash ?? null, ao: node.userData?.ct156_ao ? loadAo(THREE, base, node.userData.ct156_ao) : null, meshes };
      });
    });
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
  loadParts(THREE).then((list) => {
    if (group.userData.disposed) return;
    for (const { name, hash, ao, meshes } of list) {
      const code = group.getObjectByName(`ct156-cockpit-${name}`);
      // A part built from other pieces than the code draws now (a cockpit change without a rebuilt file) stays the code's;
      // the pictured faces' shadows ('shade', no code part of its own) show only over the faces they were baked on.
      const want = name === 'shade' ? group.userData.shadeHash : code?.userData.hash;
      if (want && want !== hash) {
        console.warn(`ct156-cockpit.glb: ${name} is out of date with the code; rebuild it (tools/blender/README.md)`);
        continue;
      }
      const part = new THREE.Group();
      part.name = `ct156-cockpit-${name}-model`;
      for (const { geometry, material } of meshes) {
        if (material === 'shade') { // the pictured faces' baked shadows, laid over the code's pictures
          if (ao) part.add(new THREE.Mesh(geometry, own(new THREE.MeshBasicMaterial({ map: ao, blending: THREE.MultiplyBlending, premultipliedAlpha: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide, fog: false }))));
          continue;
        }
        const base = mats[material] ?? mats.frame;
        // Lit colours take the part's baked shadows; the self-lit lamps don't.
        const m = ao && geometry.attributes.uv && base.isMeshStandardMaterial ? own(shaded(base, ao)) : base;
        part.add(new THREE.Mesh(geometry, m));
      }
      group.add(part);
      if (code) code.visible = false;
    }
  }, () => {});
}
