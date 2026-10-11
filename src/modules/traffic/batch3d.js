// Fewer draw calls for still scenery (TR-127; Patrick, 10 Oct: "how can we optimize performance?", card "Back to fixed layers", which
// went on to batching the buildings). A building made of dozens of boxes costs one draw call per box; merged by colour it costs one
// per colour. Only plain-coloured pieces are merged: a piece with a picture on it (a badge, the glass, the crest), more than one
// material, vertex colours or instancing is left as it is. Nothing moves: each merged piece keeps its place relative to the group.

// three's geometry merger (three/addons, part of the three package), loaded with the 3D view only (house rule: three is never
// imported statically). Until it is in, nothing is merged: the scenery draws the same, with more draw calls.
let mergeGeometries = null;
let mergerPromise = null;
/** Loads the merger; the 3D view awaits it before it builds the scenery. Resolves false when it can't load. */
export function loadBatching() {
  mergerPromise ??= import('three/addons/utils/BufferGeometryUtils.js')
    .then((m) => { mergeGeometries = m.mergeGeometries; return true; })
    .catch((err) => {
      mergerPromise = null;
      console.warn('Scenery batching could not be loaded; drawing the pieces one by one:', err);
      return false;
    });
  return mergerPromise;
}

const keyOf = (m) => [
  m.type, m.color?.getHexString?.(), m.roughness, m.metalness, m.transparent, m.opacity, m.side, m.polygonOffset, m.fog,
].join('|');

/** Merges `group`'s plain-coloured meshes (at any depth) into one mesh per material look, children of `group`. Returns how many it replaced. */
export function batchByMaterial(THREE, group) {
  if (!mergeGeometries) return 0;
  group.updateMatrixWorld(true);
  const toGroup = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map(); // key -> { material, geometries, meshes }
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.userData.keep) return; // keep: a decal the showpieces leave showing (TR-142)
    const m = o.material;
    if (!m || m.map || m.vertexColors || !o.geometry?.attributes?.position) return;
    const key = keyOf(m);
    if (!buckets.has(key)) buckets.set(key, { material: m, geometries: [], meshes: [] });
    const b = buckets.get(key);
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.clearGroups();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toGroup, o.matrixWorld));
    b.geometries.push(g);
    b.meshes.push(o);
  });
  let replaced = 0;
  let k = 0;
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) {
      for (const g of b.geometries) g.dispose();
      continue;
    }
    const merged = mergeGeometries(b.geometries, false);
    for (const g of b.geometries) g.dispose();
    if (!merged) continue;
    for (const o of b.meshes) {
      o.removeFromParent();
      o.geometry.dispose();
    }
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.name = `${group.name}-batch-${(k += 1)}`;
    mesh.renderOrder = b.meshes[0].renderOrder;
    group.add(mesh);
    replaced += b.meshes.length;
  }
  return replaced;
}
