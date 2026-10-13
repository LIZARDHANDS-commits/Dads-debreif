// The look of the CT-156 model (Patrick, 13 Oct 2026: "i just want to focus on the model"): the aircraft's own materials get a
// sky built in code (it lights them from every side and shows in the paint, the glass and the chrome) and the Neutral tone curve
// (so white paint and the polished spinner do not clip). Nothing else in a view changes: not the renderer's tone mapping, not the
// scene's environment, not the module's lights, ground, runways or tags. The numbers come from the look study
// (3d-work scratch/look/look-study.md), tuned again here on pictures of the model alone.
//
// How it reaches the model with no code in any module: each CT-156 model and cockpit carries a "probe", an invisible mesh that is
// drawn first and draws nothing; three.js calls its onBeforeRender with the renderer and the scene, and that is where the sky is
// made (once per renderer, through PMREMGenerator) and where the model's materials are dressed. three.js comes from the caller
// (THREE); nothing here loads it.

/** The look's numbers. */
export const LOOK = Object.freeze({
  exposure: 1.1, // the study's: Neutral takes 0.04 off every colour, and 1.1 gives it back for mid tones
  envMapIntensity: 1, // multiplies each material's own envMapIntensity (they were tuned for the old small sky picture)
  skyForAll: false, // true: a material with no envMap of its own gets the sky too (it then takes light from the sky as well as from the module's lights)
});

// Neutral tone mapping (Khronos PBR Neutral), as three.js's own NeutralToneMapping, with the exposure written in: three.js leaves
// its tone mapping out of a shader when the renderer has none, and the renderer's is left alone here.
const NEUTRAL = (exposure) => `
vec3 ct156Neutral( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= ${exposure.toFixed(4)};
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
`;

const skies = new WeakMap(); // renderer -> { target, key }
const suns = new WeakMap(); // scene -> the direction its sun shines from

/** The direction to the scene's sun (its DirectionalLight), found once; (-0.5, -0.7, 1) when there is none. */
function sunDirection(THREE, scene) {
  let dir = suns.get(scene);
  if (!dir) {
    dir = new THREE.Vector3(-0.5, -0.7, 1);
    scene.traverse((o) => {
      if (o.isDirectionalLight) dir.copy(o.position).sub(o.target?.position ?? new THREE.Vector3());
    });
    dir.normalize();
    suns.set(scene, dir);
  }
  return dir;
}

/**
 * The sky: deep blue overhead, a hazy horizon, a dark prairie below, and a sun (bright enough that a glint in the paint is
 * brighter than white) in `sunDir`'s direction; z is up. Drawn once into a cube and filtered by PMREMGenerator
 * (three.js's own tool for light from a picture of the sky).
 */
function makeSky(THREE, renderer, sunDir) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { sunDir: { value: sunDir.clone() } },
    vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'varying vec3 vD; uniform vec3 sunDir;',
      'void main() {',
      '  float h = vD.z;',
      '  vec3 zen = vec3(0.07, 0.20, 0.62);',
      '  vec3 mid = vec3(0.25, 0.48, 0.95);',
      '  vec3 hor = vec3(0.95, 1.05, 1.15);',
      '  vec3 gnd = vec3(0.11, 0.12, 0.06);',
      '  vec3 c;',
      '  if (h >= 0.0) { float t = pow(h, 0.45); c = mix(hor, mix(mid, zen, smoothstep(0.35, 1.0, h)), smoothstep(0.0, 0.5, t)); }',
      '  else { c = mix(hor * 0.55, gnd, smoothstep(0.0, 0.25, -h)); }',
      '  float s = max(dot(normalize(vD), sunDir), 0.0);',
      '  c += vec3(1.0, 0.92, 0.78) * (pow(s, 8.0) * 0.45 + pow(s, 64.0) * 1.2);',
      '  c += vec3(1.0, 0.95, 0.85) * smoothstep(0.99955, 0.9999, s) * 60.0;',
      '  gl_FragColor = vec4(c, 1.0);',
      '}',
    ].join('\n'),
  }));
  const scene = new THREE.Scene();
  scene.add(sky);
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(scene, 0);
  generator.dispose();
  sky.geometry.dispose();
  sky.material.dispose();
  target.texture.userData.ct156Env = true; // a model kept from another view is swapped to this renderer's sky, not left on a dead one
  return target;
}

/** This renderer's sky texture, made on first use, and freed with the renderer. */
function skyFor(THREE, renderer, scene) {
  const dir = sunDirection(THREE, scene);
  const key = `${dir.x.toFixed(3)},${dir.y.toFixed(3)},${dir.z.toFixed(3)}`;
  let held = skies.get(renderer);
  if (!held || held.key !== key) {
    const hooked = held?.hooked ?? false;
    held?.target.dispose();
    held = { target: makeSky(THREE, renderer, dir), key, hooked };
    skies.set(renderer, held);
    if (!held.hooked) {
      held.hooked = true;
      const rendererDispose = renderer.dispose;
      renderer.dispose = function dispose(...args) {
        skies.get(renderer)?.target.dispose();
        skies.delete(renderer);
        return rendererDispose.apply(this, args);
      };
    }
  }
  return held.target.texture;
}

/** Puts the Neutral curve at the end of a material's own shader (after whatever else it does), once. */
function toneMapMaterial(material, exposure) {
  const before = material.onBeforeCompile, key = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    before?.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NEUTRAL(exposure)}`)
      .replace('#include <tonemapping_fragment>', '#include <tonemapping_fragment>\n\tgl_FragColor.rgb = ct156Neutral( gl_FragColor.rgb );');
  };
  material.customProgramCacheKey = () => `${key?.call(material) ?? ''}-ct156-look-${exposure.toFixed(4)}`;
  material.userData.ct156Look = exposure;
  material.needsUpdate = true;
}

/** Dresses one material: the sky as its envMap, and the Neutral curve. Materials that draw their own exact colour (toneMapped false) keep it. */
function dress(material, sky, o) {
  const standard = material.isMeshStandardMaterial;
  if (!standard && !material.isMeshBasicMaterial && !material.isMeshLambertMaterial) return;
  if (standard) {
    const own = material.envMap;
    if ((own?.userData?.ct156Env && own !== sky) || (!own && o.skyForAll)) {
      material.envMap = sky;
      if (material.userData.ct156EnvIntensity === undefined) material.userData.ct156EnvIntensity = material.envMapIntensity;
      material.envMapIntensity = material.userData.ct156EnvIntensity * o.envMapIntensity;
      material.needsUpdate = true;
    }
  }
  if (material.toneMapped !== false && material.userData.ct156Look === undefined) toneMapMaterial(material, o.exposure);
}

/** What a probe does on every draw: finds this renderer's sky, then dresses any material in `group` not dressed yet. */
function update(THREE, renderer, scene, group, probe) {
  const o = LOOK;
  const sky = skyFor(THREE, renderer, scene);
  group.traverse((mesh) => {
    if (!mesh.isMesh || mesh === probe) return;
    if (Array.isArray(mesh.material)) for (const m of mesh.material) dress(m, sky, o);
    else if (mesh.material) dress(mesh.material, sky, o);
  });
}

const probeParts = new WeakMap(); // THREE -> { geometry, material }

/**
 * Adds the probe to a CT-156 group (a model's root, or a cockpit's group): an invisible mesh, first in the draw order, that draws
 * nothing and, each time three.js is about to draw it, gives the group's materials the look.
 */
export function addLookProbe(THREE, group) {
  let parts = probeParts.get(THREE);
  if (!parts) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    geometry.setDrawRange(0, 0);
    parts = { geometry, material: new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, toneMapped: false }) };
    probeParts.set(THREE, parts);
  }
  const probe = new THREE.Mesh(parts.geometry, parts.material);
  probe.name = 'ct156-look-probe';
  probe.frustumCulled = false;
  probe.renderOrder = -1e6;
  probe.onBeforeRender = (renderer, scene) => update(THREE, renderer, scene, group, probe);
  group.add(probe);
  return probe;
}
