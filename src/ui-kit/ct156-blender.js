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
  return Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/utils/BufferGeometryUtils.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js').catch(() => ({})),
  ]).then(([{ GLTFLoader }, { mergeGeometries }, { MeshoptDecoder }]) => {
    const loader = new GLTFLoader();
    if (MeshoptDecoder) loader.setMeshoptDecoder(MeshoptDecoder);
    return loader.loadAsync(modelsUrl(file)).then((gltf) => {
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
    });
  });
}

/**
 * Where the CT-156's delivered files sit (plan Step 3b item 3.4): public/models/ct156/, written only by
 * `npm run models:import` from a checked delivery of the 3d-work repo (ALL-38: Blender owns the shape). High and
 * Performance each have their own folder; setCt156Level switches between 'high' and 'performance' (item 8).
 */
export const CT156_FILES = 'ct156/high/';

/** Default tunable look parameters for Stage 2/3 multi-option sheets (EN3 relief, EN7 wear & sheen, EN18 corner shadow). */
export const CT156_LOOK_DEFAULTS = Object.freeze({
  normalScale: 1.0,
  wearStrength: 1.0,
  sheenVar: 0.06,
  cornerShadow: 0,
});

let currentLevel = 'high';
let lookOptions = { ...CT156_LOOK_DEFAULTS };
const levelListeners = new Set();

/** Returns the active CT-156 graphics level ('high' or 'performance'). */
export function getCt156Level() {
  return currentLevel;
}

/** Returns the active tunable look parameters ({ normalScale, wearStrength, sheenVar, cornerShadow }). */
export function getCt156LookOptions() {
  return { ...lookOptions };
}

/** Updates one or more tunable look parameters and notifies registered kits to refresh materials. */
export function setCt156LookOptions(patch = {}) {
  lookOptions = { ...lookOptions, ...patch };
  for (const fn of levelListeners) fn(currentLevel);
  return getCt156LookOptions();
}

/** Folder prefix for the given CT-156 level ('ct156/high/' or 'ct156/performance/'). */
export function ct156FilesDir(level = currentLevel) {
  return `ct156/${level === 'performance' ? 'performance' : 'high'}/`;
}

/**
 * Switches the CT-156 graphics level ('high' or 'performance') and notifies registered kits to reload
 * that level's geometry and pictures in place.
 */
export function setCt156Level(level) {
  const next = level === 'performance' ? 'performance' : 'high';
  if (next !== currentLevel) {
    currentLevel = next;
    for (const fn of levelListeners) fn(currentLevel);
  }
  return currentLevel;
}

/** Registers a callback invoked whenever setCt156Level or setCt156LookOptions changes. */
export function onCt156LevelChange(fn) {
  levelListeners.add(fn);
  return () => levelListeners.delete(fn);
}

let delivery = null;
let pointsPromise = null;
let cachedPoints = null;
let told = false;
/** The delivery the files came from (public/models/ct156/delivery.json): Promise of its name, or null without one. */
function ct156Delivery() {
  if (!delivery) {
    delivery = fetch(modelsUrl('ct156/delivery.json'))
      .then((r) => (r.ok ? r.json() : null))
      .then((sheet) => sheet?.name ?? null, () => null);
  }
  return delivery;
}

/**
 * Loads the delivered named points (`public/models/ct156/ct156-points.json`, plan Step 3b item 3.5), verified against
 * `delivery.json`, and caches them for synchronous lookup via `getCt156DeliveredPoints()`.
 */
export function loadCt156Points() {
  if (!pointsPromise) {
    pointsPromise = Promise.all([
      ct156Delivery(),
      fetch(modelsUrl('ct156/ct156-points.json')).then((r) => (r.ok ? r.json() : null), () => null),
    ]).then(([name, pts]) => {
      if (name && pts && pts.delivery === name) {
        cachedPoints = pts;
        return pts;
      }
      return null;
    });
  }
  return pointsPromise;
}

/** Returns the cached `ct156-points.json` object once `loadCt156Points()` has resolved, or null before/without it. */
export function getCt156DeliveredPoints() {
  return cachedPoints;
}

/**
 * A delivered file's parts (loadParts), used only when every part carries the name of the delivery the import wrote
 * beside them, so a mixed or half-copied set never shows. This replaced the code's fingerprints (plan 3.4, Patrick
 * 13 Oct 2026): the file is now the shape's one source and differs from the code's shape on purpose once a fix is made.
 * Rejects otherwise, and the code's own parts stay.
 */
export function loadDelivered(file, level = currentLevel) {
  return Promise.all([ct156Delivery(), loadParts(ct156FilesDir(level) + file)]).then(([name, list]) => {
    const foreign = list.filter((p) => p.extras.ct156_delivery !== name).map((p) => p.name);
    if (!name || foreign.length) {
      console.warn(`${file}: not from the delivery in models/ct156/delivery.json (${name ?? 'none'}); the code's parts show (npm run models:import)`);
      throw new Error('not delivered');
    }
    if (!told) {
      told = true;
      console.info(`CT-156 models: delivery ${name}`);
    }
    return list;
  });
}

/** A baked soft-shadow picture beside the files, laid on its part's own UV map; loaded once a page. */
const aoTextures = new Map();
export function loadAo(THREE, file) {
  if (!aoTextures.has(file)) {
    const t = new THREE.TextureLoader().load(modelsUrl(file));
    t.flipY = false; // as glTF's own pictures: its UV maps run top down
    t.anisotropy = 16; // sharp at a shallow angle (panel lines, rivets, soft shadows along the wing); three.js holds it to what the card allows
    aoTextures.set(file, t);
  }
  return aoTextures.get(file);
}

/** A Non-Color data picture (EN10: tangent-space normal map or R=AO/G=Curvature/B=Dirt packed mask), loaded once. */
const dataTextures = new Map();
export function loadDataTexture(THREE, file) {
  if (!dataTextures.has(file)) {
    const t = new THREE.TextureLoader().load(modelsUrl(file));
    t.flipY = false;
    t.anisotropy = 16;
    if (THREE.NoColorSpace !== undefined) t.colorSpace = THREE.NoColorSpace;
    dataTextures.set(file, t);
  }
  return dataTextures.get(file);
}

/**
 * A copy of `material` darkened by baked soft shadows, in the sun's light as well as the sky's (three.js's own aoMap
 * shades only the sky's light, and the sun is most of an aircraft's light). The part drawn with it needs a uv map.
 * Optional, on the same uv map:
 * - `normal` / `normalScale` (EN3): tangent-space normal map (`normalScale.set(s, -s)` for glTF top-down UVs);
 * - `mask` (EN7): packed mask (`R=AO, G=Curvature 0.5 flat, B=Dirt`) + `wearStrength` (default 1.0) + `sheenVar` (panel-to-panel sheen variation, default 0.06);
 * - `bump` / `bumpScale` and `dirt`: legacy separate bump/dirt maps when `normal`/`mask` are not supplied;
 * - `cornerShadow` (EN18): optional live screen-space corner/crevice shadow (0 = off by default).
 */
export function aoShaded(material, ao, { bump = null, bumpScale = 1, dirt = null, normal = null, normalScale = lookOptions.normalScale, mask = null, wearStrength = lookOptions.wearStrength, sheenVar = lookOptions.sheenVar, cornerShadow = lookOptions.cornerShadow } = {}) {
  const m = material.clone();
  m.aoMap = ao;
  if (normal) {
    m.normalMap = normal;
    if (m.normalScale?.set) m.normalScale.set(normalScale, -normalScale);
  } else if (bump) {
    m.bumpMap = bump;
    m.bumpScale = bumpScale;
  }
  const ws = Number(wearStrength) ?? 1.0;
  const sv = Number(sheenVar) || 0;
  const cs = Number(cornerShadow) || 0;
  m.onBeforeCompile = (shader) => {
    let fs = shader.fragmentShader.replace('#include <aomap_fragment>',
      '#include <aomap_fragment>\n#ifdef USE_AOMAP\n\treflectedLight.directDiffuse *= ambientOcclusion;\n\treflectedLight.directSpecular *= ambientOcclusion;\n#endif');
    if (mask) {
      shader.uniforms.ct156Mask = { value: mask };
      fs = fs.replace('#include <common>', '#include <common>\nuniform sampler2D ct156Mask;')
        .replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_AOMAP
	vec3 ct156MaskAt = texture2D( ct156Mask, vAoMapUv ).rgb;
	float ct156CurvAt = ( ct156MaskAt.g - 0.5 ) * ${ws.toFixed(4)};
	float ct156DirtAt = clamp( ct156MaskAt.b * ${ws.toFixed(4)}, 0.0, 1.0 );
	diffuseColor.rgb *= 1.0 - 0.35 * clamp( -ct156CurvAt * 2.5, 0.0, 1.0 );
	diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 1.22 + vec3( 0.04 ), clamp( ct156CurvAt * 2.2, 0.0, 0.35 ) );
	diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.11, 0.1, 0.085 ), 0.55 * ct156DirtAt );
#endif`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
#ifdef USE_AOMAP
	float ct156PanelVar = ( fract( sin( dot( floor( vAoMapUv * 12.0 ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) - 0.5 ) * ${sv.toFixed(4)};
	roughnessFactor = clamp( mix( roughnessFactor + ct156PanelVar, 0.85, ct156DirtAt ) - 0.08 * clamp( ct156CurvAt * 2.0, 0.0, 1.0 ), 0.04, 1.0 );
#endif`)
        .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#if defined( USE_AOMAP ) && defined( USE_CLEARCOAT )
	material.clearcoat *= 1.0 - ct156DirtAt;
#endif`);
    } else if (dirt) {
      shader.uniforms.ct156Dirt = { value: dirt };
      fs = fs.replace('#include <common>', '#include <common>\nuniform sampler2D ct156Dirt;')
        .replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_AOMAP
	float ct156DirtAt = texture2D( ct156Dirt, vAoMapUv ).r;
	diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.11, 0.1, 0.085 ), 0.55 * ct156DirtAt ); // a dull brown-grey haze: lighter on dark paint, darker on light
#endif`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
#ifdef USE_AOMAP
	roughnessFactor = mix( roughnessFactor, 0.85, ct156DirtAt );
#endif`)
        .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#if defined( USE_AOMAP ) && defined( USE_CLEARCOAT )
	material.clearcoat *= 1.0 - ct156DirtAt;
#endif`);
    }
    if (cs > 0) {
      fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
	{
		float ct156Cavity = clamp( length( fwidth( normal ) ) * ${cs.toFixed(4)}, 0.0, 0.35 );
		diffuseColor.rgb *= 1.0 - ct156Cavity;
	}`);
    }
    shader.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => `ct156-ao-direct${mask ? `-mask-${sv.toFixed(4)}` : dirt ? '-dirt' : ''}${normal ? '-norm' : ''}${cs > 0 ? `-cs-${cs.toFixed(4)}` : ''}`;
  if (m.userData.ct156Bands) paintBands(m, m.userData.ct156Bands); // painted bands (the prop's tips) stay
  return m.userData.ct156Grain ? paintGrain(m, m.userData.ct156Grain) : m; // a painted surface keeps its grain
}

/**
 * Paints bands across a part by the shader, by how far along one of the geometry's own axes each point is, so the
 * bands need no picture and keep a sharp edge between the faces' corners (the prop's red, white and red tips along the
 * blade's span: ct156-model.js PROP_TIP_BANDS). `bands`: [[from, to, [r, g, b]], ...] in the geometry's own units, the
 * colour linear (THREE.Color's r, g, b); `axis` 'x', 'y' or 'z'. Keeps whatever the material's shader already does,
 * and survives aoShaded's copy (it is kept in userData). Returns the material.
 */
export function paintBands(material, { axis = 'y', bands = [] } = {}) {
  material.userData.ct156Bands = { axis, bands };
  const before = material.onBeforeCompile, key = material.customProgramCacheKey;
  const f = (v) => Number(v).toFixed(6);
  const paint = bands.map(([a, b, [r, g, bl]]) => `\tif ( vCt156Along >= ${f(a)} && vCt156Along < ${f(b)} ) diffuseColor.rgb = vec3( ${f(r)}, ${f(g)}, ${f(bl)} );`).join('\n');
  material.onBeforeCompile = (shader, renderer) => {
    before?.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vCt156Along;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n\tvCt156Along = position.${axis};`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCt156Along;')
      .replace('#include <color_fragment>', `#include <color_fragment>\n${paint}`);
  };
  material.customProgramCacheKey = () => `${key?.call(material) ?? ''}-ct156-bands-${axis}-${bands.flat(2).map(f).join('-')}`;
  material.needsUpdate = true;
  return material;
}

/**
 * Gives `material` (a MeshStandardMaterial) a painted surface drawn by the shader, so it needs no picture or uv map:
 * a fine grain in the paint, bump-mapped and a little uneven in shine, a mottling of the colour and lighter scuffed
 * spots, as worn matt paint has (Patrick, 12 Oct 2026: "give the whole interior a texture, its not quite right"). Sizes in feet on the
 * part; `unit`, the feet in one of the geometry's own units (1 for the cockpit, built in feet). `grain` the grain's size,
 * `bump` its depth (feet), `speckle` and `mottle` how far each lightens or darkens the colour, `wear` how far the
 * scuffed spots (about `wearSize` across, in patches) lighten it, `shine` how far the grain moves the roughness. The grain fades out where it is smaller than a pixel, so it never sparkles far off. Estimates, judged
 * on renders. Keeps whatever the material's shader already does (aoShaded's), and returns the material.
 */
export function paintGrain(material, { unit = 1, grain = 0.012, bump = 0.0012, speckle = 0.08, mottle = 0.12, mottleSize = 0.4, wear = 0.18, wearSize = 0.05, shine = 0.15 } = {}) {
  const opts = { unit, grain, bump, speckle, mottle, mottleSize, wear, wearSize, shine };
  material.userData.ct156Grain = opts;
  const before = material.onBeforeCompile, key = material.customProgramCacheKey;
  const f = (v) => v.toFixed(6);
  material.onBeforeCompile = (shader, renderer) => {
    before?.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCt156Pos;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n\tvCt156Pos = transformed * ${f(unit)};`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vCt156Pos;
float ct156Hash( vec3 p ) {
	p = fract( p * 0.3183099 + 0.1 ) * 17.0;
	return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float ct156Noise( vec3 x ) { // smooth value noise, 0 to 1
	vec3 i = floor( x ), u = fract( x );
	u = u * u * ( 3.0 - 2.0 * u );
	return mix( mix( mix( ct156Hash( i ), ct156Hash( i + vec3( 1, 0, 0 ) ), u.x ), mix( ct156Hash( i + vec3( 0, 1, 0 ) ), ct156Hash( i + vec3( 1, 1, 0 ) ), u.x ), u.y ),
		mix( mix( ct156Hash( i + vec3( 0, 0, 1 ) ), ct156Hash( i + vec3( 1, 0, 1 ) ), u.x ), mix( ct156Hash( i + vec3( 0, 1, 1 ) ), ct156Hash( i + vec3( 1, 1, 1 ) ), u.x ), u.y ), u.z );
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
	vec3 ct156G = vCt156Pos / ${f(grain)};
	float ct156Fine = clamp( 1.5 - length( fwidth( ct156G ) ), 0.0, 1.0 ); // the grain only where a pixel is smaller than it
	float ct156Grain = ( ct156Noise( ct156G ) * 0.65 + ct156Noise( ct156G * 2.7 + 7.1 ) * 0.35 - 0.5 ) * ct156Fine;
	float ct156Mottle = ct156Noise( vCt156Pos / ${f(mottleSize)} ) * 0.6 + ct156Noise( vCt156Pos / ${f(mottleSize * 0.31)} + 3.3 ) * 0.4 - 0.5;
	float ct156Wear = smoothstep( 0.6, 0.8, ct156Noise( vCt156Pos / ${f(wearSize)} + 11.7 ) ) * smoothstep( 0.45, 0.7, ct156Noise( vCt156Pos / ${f(mottleSize)} + 5.1 ) );
	diffuseColor.rgb *= 1.0 + ${f(speckle)} * 2.0 * ct156Grain + ${f(mottle)} * 2.0 * ct156Mottle + ${f(wear)} * ct156Wear;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
	roughnessFactor = clamp( roughnessFactor + ${f(shine)} * 2.0 * ct156Grain, 0.04, 1.0 );`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
	{ // the grain's relief, as three.js bump-maps a picture (perturbNormalArb), its height from the grain
		vec3 ct156Sx = dFdx( -vViewPosition ), ct156Sy = dFdy( -vViewPosition );
		vec3 ct156R1 = cross( ct156Sy, normal ), ct156R2 = cross( normal, ct156Sx );
		float ct156Det = dot( ct156Sx, ct156R1 ) * faceDirection;
		float ct156Ft = length( dFdx( vCt156Pos ) ) / max( length( ct156Sx ), 1e-9 ); // feet on the part per scene unit
		float ct156H = ct156Grain * ${f(bump)} / max( ct156Ft, 1e-9 );
		vec3 ct156Grad = sign( ct156Det ) * ( dFdx( ct156H ) * ct156R1 + dFdy( ct156H ) * ct156R2 );
		normal = normalize( abs( ct156Det ) * normal - ct156Grad );
	}`);
  };
  material.customProgramCacheKey = () => `${key?.call(material) ?? ''}-ct156-grain-${Object.values(opts).join('-')}`;
  material.needsUpdate = true;
  return material;
}
