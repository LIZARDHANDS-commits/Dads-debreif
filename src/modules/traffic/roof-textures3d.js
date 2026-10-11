// Roof textures for the 3D buildings (TR-140; Patrick, 10 Oct: "ribbed metal on the hangars, membrane or gravel on the flat roofs,
// shingles on the houses, each keeping its photo colour"). The textures are near-white greys (tools/airfield/make-roof-textures.py)
// that multiply the roof's own colour, traced off the photo; the material's colour is lifted by the texture's mean so a roof
// keeps that colour on average. Far off the texture averages out to the flat colour, so nothing changes at range.

/** Feet one texture tile covers (make-roof-textures.py). */
export const ROOF_TILE_FT = Object.freeze({ metal: 40, membrane: 60, shingles: 30 });
/** Each texture's mean brightness (0 to 1, measured off the files): the roof's colour is divided by it. */
const ROOF_MEAN = Object.freeze({ metal: 0.900, membrane: 0.880, shingles: 0.852 });

const mediaBase = () => (typeof import.meta !== 'undefined' && /** @type {any} */ (import.meta).env?.BASE_URL) || '/';
const textures = new Map();

/** The roof texture `kind` ('metal', 'membrane', 'shingles'), loaded once and shared. Null without a browser (tests). */
export function roofTexture(THREE, kind) {
  if (typeof document === 'undefined') return null;
  if (!textures.has(kind)) {
    const t = new THREE.TextureLoader().load(`${mediaBase()}media/traffic-textures/roof-${kind}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    textures.set(kind, t); // a plain brightness multiplier, read as linear (no colour space), so the mean lift above holds
  }
  return textures.get(kind);
}

/** A roof material of `color` with texture `kind`; `opts` as MeshStandardMaterial's (roughness, metalness, side). */
export function roofMaterial(THREE, kind, color, opts = {}) {
  const map = roofTexture(THREE, kind);
  const c = new THREE.Color(color);
  if (map) c.multiplyScalar(1 / ROOF_MEAN[kind]);
  const m = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.05, ...opts, color: c, map });
  m.userData.roof = kind; // geometry builders read it to lay UVs in feet (roofUv)
  return m;
}

/**
 * Sets a roof geometry's UVs in feet / tile, in the geometry's own (unturned) coordinates: on each sloped face u runs along the
 * slope's level edge (the ridge or eave) and v down the slope, so metal ribs run down every face of a gable, hip or arch and shingle
 * rows along it; level faces take u along x and v along y. Returns a non-indexed copy when the geometry is indexed.
 */
export function roofUv(THREE, geometry, kind) {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = geo.attributes.position;
  const tile = ROOF_TILE_FT[kind];
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    n.subVectors(c, b).cross(b.clone().sub(a)).normalize();
    const h = Math.hypot(n.x, n.y);
    // Level face: x and y. Sloped or upright face: u along the level line (-ny, nx), v up the fall line (nx, ny).
    const [ux, uy, vx, vy] = h < 0.05 ? [1, 0, 0, 1] : [-n.y / h, n.x / h, n.x / h, n.y / h];
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k);
      uv[(i + k) * 2] = (x * ux + y * uy) / tile;
      uv[(i + k) * 2 + 1] = (h < 0.05 ? x * vx + y * vy : z * h - (x * vx + y * vy) * n.z) / tile; // distance up the face
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/**
 * For an InstancedMesh of unit roofs (a 1 x 1 slab or gable stretched per instance): the texture placed in feet, from the unit
 * shape's x and y times each instance's own stretch, shifted by where it stands so neighbours don't line up.
 */
export function instancedRoofUv(material, kind) {
  const inv = (1 / ROOF_TILE_FT[kind]).toFixed(6);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
#if defined( USE_MAP ) && defined( USE_INSTANCING )
  vMapUv = vec2(position.x * length(instanceMatrix[0].xyz) + instanceMatrix[3].x, position.y * length(instanceMatrix[1].xyz) + 0.37 * instanceMatrix[3].y) * ${inv};
#endif`);
  };
  material.customProgramCacheKey = () => `instanced-roof-uv-${kind}`;
  return material;
}
