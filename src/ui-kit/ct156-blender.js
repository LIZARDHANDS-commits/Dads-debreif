// What the CT-156's Blender files share (ALL-32 the cockpit, ALL-33 the outside): where the files sit, their parts read
// out by colour, the baked pictures (soft shadows, relief, mask, weathering) and the paint they shade. three.js comes
// from the caller (THREE) and its loaders with import(), so nothing of it loads until a 3D view does. A picture only:
// no flight numbers.
import { CT156_LOOK_DEFAULTS, onCt156Look } from './ct156-look-settings.js';

/** The site's models folder (public/models/), under the site's base in the built site and the dev server alike. */
export function modelsUrl(file) {
  const base = (typeof import.meta !== 'undefined' && /** @type {any} */ (import.meta).env?.BASE_URL) || '/';
  return `${base}models/${file}`;
}

/**
 * A model file's parts, each a top-level node: { name, extras, meshes: [{ geometry, material }] }, one mesh per colour
 * (the part's pieces merged, in the file's own frame: exported Z-up, so no turn), keeping position, normal and uv, and
 * with `tangents` a tangent per corner (MikkTSpace, the tangents the normal pictures were baked with: the delivery
 * carries none, and three.js's own stand-in, worked out from the screen, flips the picture's green; 3d-work slice 4.1).
 * MikkTSpace (three.js's own, shipped with it) is worked out on the delivered triangles, each corner its own, as the
 * app draws them (unindexed), so nothing is merged back.
 */
export function loadParts(file, { tangents = false } = {}) {
  return Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/utils/BufferGeometryUtils.js'),
    tangents ? import('three/examples/jsm/libs/mikktspace.module.js').then((m) => m.ready.then(() => m)) : null,
  ]).then(([{ GLTFLoader }, { mergeGeometries, computeMikkTSpaceTangents }, mikk]) => new GLTFLoader().loadAsync(modelsUrl(file)).then((gltf) => {
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
      const want = typeof tangents === 'function' ? tangents(node.name) : tangents; // all parts, or those the function names
      const meshes = [...byMaterial].map(([material, list]) => {
        const geometry = list.length > 1 ? mergeGeometries(list) : list[0];
        if (mikk && want && geometry.attributes.uv) computeMikkTSpaceTangents(geometry, mikk, true); // glTF's sign (negateSign)
        return { geometry, material };
      });
      return { name: node.name, extras: node.userData ?? {}, meshes };
    });
  }));
}

/**
 * Where the CT-156's delivered files sit (plan Step 3b item 3.4): public/models/ct156/, written only by
 * `npm run models:import` from a checked delivery of the 3d-work repo (ALL-38: Blender owns the shape). High and
 * Performance each have their own folder, picked by setCt156Level before the first CT-156 is made (a view's Graphics
 * switch reloads the page, so the level never changes under a model already drawn); High until then.
 */
let level = 'high';
/** Picks the files' level, 'high' or 'performance' (anything else is High). Returns the level now in use. */
export function setCt156Level(next) {
  level = next === 'performance' ? 'performance' : 'high';
  return level;
}
/** The files' level now: 'high' or 'performance'. */
export const ct156Level = () => level;
/** The level's folder under public/models/: 'ct156/high/' or 'ct156/performance/'. */
export const ct156Files = (at = level) => `ct156/${at === 'performance' ? 'performance' : 'high'}/`;

/**
 * The pictures the app loads beside each level's files, and the size each is drawn at (3d-work slice 4.1; the import
 * refuses a delivery whose pictures differ, and the app keeps the plain paint if a loaded picture differs): the outside's
 * soft shadows and panel lines (AO x lines), its tangent-space normal picture (glTF's +X +Y +Z), its mask (red AO x
 * lines, green the mesh's curvature at 0.5 flat, blue the dirt table, data only) and its painted weathering (red exhaust
 * soot, green oil, blue edge wear, alpha walkway scuffs), the gear's soft shadows, and the cockpit body's normal picture
 * (the glare shield's screws and rivets). Square pictures, size in pixels.
 */
export const CT156_PICTURES = Object.freeze({
  high: Object.freeze({
    ao: { file: 'ct156-exterior-ao.jpg', size: 4096 }, normal: { file: 'ct156-exterior-normal.png', size: 4096 },
    mask: { file: 'ct156-exterior-mask.png', size: 2048 }, weather: { file: 'ct156-exterior-weather.png', size: 2048 },
    gearAo: { file: 'ct156-gear-ao.jpg', size: 1024 }, cockpitNormal: { file: 'ct156-cockpit-normal-body.png', size: 2048 },
  }),
  performance: Object.freeze({
    ao: { file: 'ct156-exterior-ao.jpg', size: 2048 }, normal: { file: 'ct156-exterior-normal.png', size: 2048 },
    mask: { file: 'ct156-exterior-mask.png', size: 1024 }, weather: { file: 'ct156-exterior-weather.png', size: 1024 },
    gearAo: { file: 'ct156-gear-ao.jpg', size: 512 }, cockpitNormal: { file: 'ct156-cockpit-normal-body.png', size: 1024 },
  }),
});

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
export function loadDelivered(file, options = {}) {
  return Promise.all([ct156Delivery(), loadParts(ct156Files() + file, options)]).then(([name, list]) => {
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

/**
 * A baked picture beside the files, laid on its part's own UV map, loaded once a page: Promise of its texture, which
 * rejects if it can't be loaded or isn't `size` pixels square (a picture of another size would sit on another
 * layout). Read exactly as stored (no colour conversion, no premultiplied alpha: the weathering's alpha is data, and
 * premultiplying would wipe its colour channels wherever the alpha is 0). Data pictures carry no colour space.
 */
const pictures = new Map();
export function loadPicture(THREE, file, size) {
  if (!pictures.has(file)) {
    const loader = new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    pictures.set(file, loader.loadAsync(modelsUrl(file)).then((bitmap) => {
      if (bitmap.width !== size || bitmap.height !== size) {
        bitmap.close?.();
        throw new Error(`${file} is ${bitmap.width} by ${bitmap.height} px, not ${size} by ${size}`);
      }
      const t = new THREE.Texture(bitmap);
      t.flipY = false; // as glTF's own pictures: its UV maps run top down (an ImageBitmap is never flipped anyway)
      t.anisotropy = 16; // sharp at a shallow angle (panel lines, rivets, soft shadows along the wing); three.js holds it to what the card allows
      t.needsUpdate = true;
      return t;
    }));
  }
  return pictures.get(file);
}

/** The soft-shadow picture alone (the cockpit's parts, named by each part): a texture at once, filled in when it loads. */
const aoTextures = new Map();
export function loadAo(THREE, file) {
  if (!aoTextures.has(file)) {
    const t = new THREE.TextureLoader().load(modelsUrl(file));
    t.flipY = false;
    t.anisotropy = 16;
    aoTextures.set(file, t);
  }
  return aoTextures.get(file);
}

/**
 * Waits for every picture a material needs (an object of promises by name) and only then calls apply with the textures
 * by name, so the shaded paint never shows with a picture missing: an empty picture reads as 0, which would bend the
 * normals into the skin and darken the paint. If any fails, apply is never called and fail is told which (the plain
 * paint stays). Promise of true when applied, false when not.
 */
export function shadeWhenLoaded(wanted, apply, fail = (why) => console.warn(why)) {
  const names = Object.keys(wanted);
  return Promise.allSettled(names.map((n) => wanted[n])).then((results) => {
    const bad = names.map((n, i) => [n, results[i]]).filter(([, r]) => r.status === 'rejected');
    if (bad.length) {
      fail(`CT-156 pictures: ${bad.map(([n, r]) => `${n} (${r.reason?.message ?? r.reason})`).join(', ')} did not load; the plain paint stays`);
      return false;
    }
    apply(Object.fromEntries(names.map((n, i) => [n, results[i].value])));
    return true;
  });
}

/**
 * The look's live numbers (ct156-look-settings.js), shared by every shaded material as the same uniform objects, so a
 * slider changes them all at once with no new shader: the weathering strength k and the wear; and the relief, the
 * normal pictures' strength, set on each material's normalScale.
 */
export const CT156_LOOK_UNIFORMS = Object.freeze({
  ct156WeatherK: { value: CT156_LOOK_DEFAULTS.weathering },
  ct156Wear: { value: CT156_LOOK_DEFAULTS.wear },
});
let relief = CT156_LOOK_DEFAULTS.relief;
const reliefMaterials = new Set();
const setRelief = (m) => m.normalScale.set(relief, m.userData.ct156Mirrored ? -relief : relief);
onCt156Look((look) => {
  CT156_LOOK_UNIFORMS.ct156WeatherK.value = look.weathering;
  CT156_LOOK_UNIFORMS.ct156Wear.value = look.wear;
  relief = look.relief;
  for (const m of reliefMaterials) setRelief(m);
});

/**
 * The painted weathering (3d-work slice 4.1, scratch/increment-4/app-handover.md; the reference is 3d-work
 * ct156/build/bake4/s5_render.py look_material): each channel shown as smoothstep(t, t + 0.5, v) x (0.45 + 0.55 k),
 * t = 0.75 (1 - k), k the strength (0 none); the paint mixed toward worn paint, scuffs, oil and soot in that order
 * (linear colours; the worn paint and scuffs only ever lighten, as the spec has them, "faint lighter wear": on the navy
 * that is the formula exactly, and the white leading edges, lighter already, are left clean rather than greyed), and
 * the roughness raised by soot, scuffs and wear and lowered by oil. The strength changes how far
 * and how dark, never the colours. Above k 1 (the slider runs to 1.5) t stays 0, so clean paint stays clean and only
 * the marks' darkness grows, held at the colour itself (a judgement, logged for Patrick: the formula alone would wash
 * the whole aircraft past heavy).
 * The mask's green is the mesh's curvature (0.5 flat): convex edges lightened toward worn paint, hollows darkened, by
 * the wear (look_material's edge and hollow terms); its blue, the dirt table, is data only and never darkens (the
 * weather picture is the dirt; Patrick: nothing gathered along the seams). The panel-to-panel sheen (`sheen`, a picture
 * of each panel's value, 0.5 none) moves the roughness by up to SHEEN_VAR either way.
 */
const SHEEN_VAR = 0.06; // an estimate, judged on renders (the donor's sheenVar)
const WEATHER_GLSL = `
	float ct156T = 0.75 * max( 1.0 - ct156WeatherK, 0.0 );
	float ct156A = ct156WeatherK > 0.0 ? 0.45 + 0.55 * ct156WeatherK : 0.0;
	vec4 ct156W = texture2D( ct156Weather, vAoMapUv );
	float ct156FWear = min( smoothstep( ct156T, ct156T + 0.5, ct156W.b ) * ct156A, 1.0 );
	float ct156FScuff = min( smoothstep( ct156T, ct156T + 0.5, ct156W.a ) * ct156A, 1.0 );
	float ct156FOil = min( smoothstep( ct156T, ct156T + 0.5, ct156W.g ) * ct156A, 1.0 );
	float ct156FSoot = min( smoothstep( ct156T, ct156T + 0.5, ct156W.r ) * ct156A, 1.0 );
	diffuseColor.rgb = mix( diffuseColor.rgb, max( diffuseColor.rgb, vec3( 0.030, 0.034, 0.048 ) ), ct156FWear );
	diffuseColor.rgb = mix( diffuseColor.rgb, max( diffuseColor.rgb, vec3( 0.024, 0.026, 0.034 ) ), ct156FScuff );
	diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.011, 0.010, 0.010 ), ct156FOil );
	diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.010, 0.009, 0.009 ), ct156FSoot );`;

/**
 * A copy of `material` shaded by the baked pictures on the part's own uv map: `ao` darkens it in the sun's light as well
 * as the sky's (three.js's own aoMap shades only the sky's light, and the sun is most of an aircraft's light). Optional:
 * `normal`, the relief (panel lines and rivets as fine lines and small domes in the paint's colour, nothing lightened
 * along them), at the look's relief, for geometry carrying MikkTSpace tangents (normalScale +1, +1; `mirrored` for a part
 * drawn as its mirror, whose tangent frame turns the other way); `mask` (the wear) with `weather` (the painted
 * weathering) and `sheen` (panel-to-panel sheen). Without `mask` only the shadows and relief apply (the cockpit).
 */
export function aoShaded(material, ao, { normal = null, mask = null, weather = null, sheen = null, mirrored = false } = {}) {
  const m = ct156CloneMaterial(material);
  m.aoMap = ao;
  if (normal) {
    m.normalMap = normal;
    m.userData.ct156Mirrored = mirrored;
    setRelief(m);
    reliefMaterials.add(m);
    m.addEventListener('dispose', () => reliefMaterials.delete(m));
  }
  const paint = Boolean(mask && weather);
  m.onBeforeCompile = (shader) => {
    let fs = shader.fragmentShader.replace('#include <aomap_fragment>',
      '#include <aomap_fragment>\n#ifdef USE_AOMAP\n\treflectedLight.directDiffuse *= ambientOcclusion;\n\treflectedLight.directSpecular *= ambientOcclusion;\n#endif');
    if (paint) {
      Object.assign(shader.uniforms, CT156_LOOK_UNIFORMS, { ct156Mask: { value: mask }, ct156Weather: { value: weather }, ct156Sheen: { value: sheen } });
      fs = fs.replace('#include <common>', `#include <common>
uniform sampler2D ct156Mask;
uniform sampler2D ct156Weather;
uniform float ct156WeatherK;
uniform float ct156Wear;${sheen ? '\nuniform sampler2D ct156Sheen;' : ''}`)
        .replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_AOMAP
	float ct156Curv = texture2D( ct156Mask, vAoMapUv ).g;
	diffuseColor.rgb = mix( diffuseColor.rgb, max( diffuseColor.rgb, vec3( 0.09, 0.10, 0.13 ) ), clamp( ( ct156Curv - 0.5 ) * 2.0 * ct156Wear, 0.0, 1.0 ) );
	diffuseColor.rgb *= 1.0 - 0.6 * clamp( ( 0.5 - ct156Curv ) * 2.0 * ct156Wear, 0.0, 1.0 );${WEATHER_GLSL}
#endif`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
#ifdef USE_AOMAP
	roughnessFactor = clamp( roughnessFactor + 0.45 * ct156FSoot + 0.3 * ct156FScuff + 0.1 * ct156FWear - 0.25 * ct156FOil${sheen ? ` + ( texture2D( ct156Sheen, vAoMapUv ).r - 0.5 ) * ${(2 * SHEEN_VAR).toFixed(4)}` : ''}, 0.04, 1.0 );
#endif`)
        .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#if defined( USE_AOMAP ) && defined( USE_CLEARCOAT )
	material.clearcoat *= 1.0 - ct156FSoot; // soot is matte: it takes the gloss off (A22)
#endif`);
    }
    shader.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => `ct156-ao-direct${paint ? `-paint${sheen ? '-sheen' : ''}` : ''}`;
  if (m.userData.ct156Bands) paintBands(m, m.userData.ct156Bands); // painted bands (the prop's tips) stay
  return m.userData.ct156Grain ? paintGrain(m, m.userData.ct156Grain) : m; // a painted surface keeps its grain
}

/**
 * A copy of a material that keeps what its shader adds (three.js's clone drops onBeforeCompile and the cache key), so a
 * copy made later (the Debrief's ghost of a ship in a filled gap) still draws the baked pictures and the look.
 */
export function ct156CloneMaterial(material) {
  const c = material.clone();
  if (Object.hasOwn(material, 'onBeforeCompile')) c.onBeforeCompile = material.onBeforeCompile;
  if (Object.hasOwn(material, 'customProgramCacheKey')) c.customProgramCacheKey = material.customProgramCacheKey;
  if (material.normalMap && reliefMaterials.has(material)) {
    reliefMaterials.add(c);
    c.addEventListener('dispose', () => reliefMaterials.delete(c));
  }
  return c;
}

/**
 * Each panel's sheen, from the mask's red (AO x panel lines): the panel lines are found where the red falls well under
 * its neighbourhood's (a 9 px box), every patch of skin they enclose is one panel and gets its own value (0 to 1, from
 * its first pixel's place), and the lines themselves 0.5 (none). So the variation changes only on a panel line (or at a
 * layout island's edge), never in a grid. Read once a page on the CPU from the mask's pixels: a picture of one byte per
 * pixel at the mask's size. Returns { texture, panels, samples (five panel-to-panel crossings), ms }.
 */
export function ct156PanelSheen(THREE, mask) {
  const t0 = performance.now();
  const img = mask.image, w = img.width, n = w * img.height;
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, img.height) : Object.assign(document.createElement('canvas'), { width: w, height: img.height });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, w, img.height).data;
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) r[i] = px[i * 4];
  // The neighbourhood's mean by a summed-area table.
  const H = img.height, S = new Float64Array((w + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += r[y * w + x];
      S[(y + 1) * (w + 1) + x + 1] = S[y * (w + 1) + x + 1] + row;
    }
  }
  const R = 4, line = new Uint8Array(n);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - R), x1 = Math.min(w, x + R + 1);
      const mean = (S[y1 * (w + 1) + x1] - S[y0 * (w + 1) + x1] - S[y1 * (w + 1) + x0] + S[y0 * (w + 1) + x0]) / ((y1 - y0) * (x1 - x0));
      if (r[y * w + x] < mean * 0.88 || r[y * w + x] < 8) line[y * w + x] = 1; // a line (or no skin)
    }
  }
  const out = new Uint8Array(n).fill(128), label = new Int32Array(n), stack = new Int32Array(n);
  let panels = 0;
  for (let s = 0; s < n; s++) {
    if (line[s] || label[s]) continue;
    panels++;
    const value = Math.floor(((Math.sin(s * 12.9898) * 43758.5453) % 1 + 1) % 1 * 255);
    let top = 0, size = 0;
    stack[top++] = s;
    label[s] = panels;
    while (top) {
      const i = stack[--top];
      out[i] = value;
      size++;
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j >= 0 && j < n && !line[j] && !label[j]) {
          label[j] = panels;
          stack[top++] = j;
        }
      }
    }
    if (size < 40) { // a speck (a rivet's ring, a fleck of the lines): no sheen of its own
      stack[0] = s; top = 1; out[s] = 128;
      const seen = new Set([s]);
      while (top) {
        const i = stack[--top];
        const x = i % w;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < n && label[j] === panels && !seen.has(j)) { seen.add(j); out[j] = 128; stack[top++] = j; }
      }
    }
  }
  // Five places where one panel's sheen meets another's along a row, for the checks: where on the layout, how many line
  // pixels part them, and the mask's red there against its neighbourhood (under 0.88: a panel line).
  const samples = [];
  for (let k = 0; k < 5; k++) {
    for (let i = Math.floor(((k + 0.5) * n) / 5); i < n - 8 && samples.length === k; i++) {
      if (out[i] === 128 || out[i + 1] !== 128) continue;
      let j = i + 1;
      while (j < i + 8 && out[j] === 128) j++;
      if (out[j] === 128 || out[j] === out[i] || Math.floor(j / w) !== Math.floor(i / w)) continue;
      const y = Math.floor(i / w), x = i % w, x0 = Math.max(0, x - R), x1 = Math.min(w, x + R + 2), y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
      const mean = (S[y1 * (w + 1) + x1] - S[y0 * (w + 1) + x1] - S[y1 * (w + 1) + x0] + S[y0 * (w + 1) + x0]) / ((y1 - y0) * (x1 - x0));
      samples.push({ u: +(x / w).toFixed(4), v: +(y / H).toFixed(4), linePx: j - i - 1, lineRatio: +(r[i + 1] / mean).toFixed(2) });
    }
  }
  const texture = new THREE.DataTexture(out, w, H, THREE.RedFormat, THREE.UnsignedByteType);
  texture.flipY = false;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return { texture, panels, samples, ms: Math.round(performance.now() - t0) };
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
