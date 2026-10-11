// What the CT-156's Blender files share (ALL-32 the cockpit, ALL-33 the outside): where the files sit, their parts read
// out by colour, the baked soft-shadow pictures and the materials those darken. three.js comes from the caller (THREE)
// and its loaders with import(), so nothing of it loads until a 3D view does. A picture only: no flight numbers.

/** The site's models folder (public/models/), under the site's base in the built site and the dev server alike. */
export function modelsUrl(file) {
  const base = (typeof import.meta !== 'undefined' && /** @type {any} */ (import.meta).env?.BASE_URL) || '/';
  return `${base}models/${file}`;
}

/**
 * A model file's parts, each a top-level node: { name, extras, meshes: [{ geometry, material }] }, one mesh per colour
 * (the part's pieces merged, in the file's own frame: exported Z-up, so no turn), keeping position, normal and uv.
 */
export function loadParts(file) {
  return Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/utils/BufferGeometryUtils.js')])
    .then(([{ GLTFLoader }, { mergeGeometries }]) => new GLTFLoader().loadAsync(modelsUrl(file)).then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      return gltf.scene.children.map((node) => {
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
        return { name: node.name, extras: node.userData ?? {}, meshes };
      });
    }));
}

/** A baked soft-shadow picture beside the files, laid on its part's own UV map; loaded once a page. */
const aoTextures = new Map();
export function loadAo(THREE, file) {
  if (!aoTextures.has(file)) {
    const t = new THREE.TextureLoader().load(modelsUrl(file));
    t.flipY = false; // as glTF's own pictures: its UV maps run top down
    aoTextures.set(file, t);
  }
  return aoTextures.get(file);
}

/**
 * A copy of `material` darkened by baked soft shadows, in the sun's light as well as the sky's (three.js's own aoMap
 * shades only the sky's light, and the sun is most of an aircraft's light). The part drawn with it needs a uv map.
 */
export function aoShaded(material, ao) {
  const m = material.clone();
  m.aoMap = ao;
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>',
      '#include <aomap_fragment>\n#ifdef USE_AOMAP\n\treflectedLight.directDiffuse *= ambientOcclusion;\n\treflectedLight.directSpecular *= ambientOcclusion;\n#endif');
  };
  m.customProgramCacheKey = () => 'ct156-ao-direct';
  return m;
}
