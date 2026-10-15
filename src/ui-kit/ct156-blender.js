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

/**
 * Where the CT-156's delivered files sit (plan Step 3b item 3.4): public/models/ct156/, written only by
 * `npm run models:import` from a checked delivery of the 3d-work repo (ALL-38: Blender owns the shape). High and
 * Performance each have their own folder; the app loads High until the Graphics switch picks the level (item 8).
 */
export const CT156_FILES = 'ct156/high/';

let delivery = null;
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
 * A delivered file's parts (loadParts), used only when every part carries the name of the delivery the import wrote
 * beside them, so a mixed or half-copied set never shows. This replaced the code's fingerprints (plan 3.4, Patrick
 * 13 Oct 2026): the file is now the shape's one source and differs from the code's shape on purpose once a fix is made.
 * Rejects otherwise, and the code's own parts stay.
 */
export function loadDelivered(file) {
  return Promise.all([ct156Delivery(), loadParts(CT156_FILES + file)]).then(([name, list]) => {
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

/**
 * A copy of `material` darkened by baked soft shadows, in the sun's light as well as the sky's (three.js's own aoMap
 * shades only the sky's light, and the sun is most of an aircraft's light). The part drawn with it needs a uv map.
 * Optional, on the same uv map: `bump`, a relief picture (panel line grooves, rivets) bump-mapped at `bumpScale`; and
 * `dirt`, a picture of where the aircraft weathers (0 clean, 1 dirty), which darkens the colour toward soot and dulls
 * the gloss there (Patrick, 11 Oct 2026 21:07Z: "Surface texture").
 */
export function aoShaded(material, ao, { bump = null, bumpScale = 1, dirt = null } = {}) {
  const m = material.clone();
  m.aoMap = ao;
  if (bump) {
    m.bumpMap = bump;
    m.bumpScale = bumpScale;
  }
  m.onBeforeCompile = (shader) => {
    let fs = shader.fragmentShader.replace('#include <aomap_fragment>',
      '#include <aomap_fragment>\n#ifdef USE_AOMAP\n\treflectedLight.directDiffuse *= ambientOcclusion;\n\treflectedLight.directSpecular *= ambientOcclusion;\n#endif');
    if (dirt) {
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
    shader.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => `ct156-ao-direct${dirt ? '-dirt' : ''}`;
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
