// The shared look of the 3D views (Patrick, 13 Oct 2026: "all the modules use the same model, so ... all of them at the
// same time"). Set in this one place: Neutral tone mapping (it keeps the colours of the ground and the lines and only
// rolls off the brightest whites, so white paint and the polished spinner do not clip), a sky built in code that lights
// the aircraft from every side and shows in the paint, the glass and the chrome, and the hemisphere light turned the
// right way up for the world. The numbers come from the look study (3d-work scratch/look/look-study.md); the way the
// sky is made is that study's "code sky". three.js comes from the caller (THREE); nothing here loads it.
//
// World frame (three-aircraft.js): X east, Y north, Z up. A three.js light or sky picture assumes Y up, so without this
// the "sky" light came from the north horizon and the paint reflected haze from above.
//
//   addLights / addTrafficLights call lookOnFirstDraw, so a view gets the look without more code; applyLook is for
//   a view that already has its renderer and wants to set the options itself.

/** The look's numbers (the look study's, tuned on pictures of every module). Unlit grounds and photos are marked `toneMapped: false` where they are made. */
export const LOOK = Object.freeze({
  exposure: 1.1, // Neutral takes 0.04 off every colour; 1.1 gives it back for mid tones, so a flat ground colour comes out within a few levels of today's (measured, Formation)
  hemisphereIntensity: 0.6, // was 0.8: the sky now lights the aircraft too; 0.6 keeps the cockpit as bright as today's (pictures, L2)
  environmentIntensity: 0.7, // the study's 1.0 turned the cockpit's grey metal blue
});

/** The direction the hemisphere light's sky colour comes from, for a world with `up` 'z' (every view today) or 'y'. */
export function hemisphereUp(up = 'z') {
  return up === 'y' ? [0, 1, 0] : [0, 0, 1];
}

/** Turns a hemisphere light so its sky colour comes from the world's up, and sets its strength. */
export function orientHemisphere(hemisphere, up, intensity) {
  hemisphere.position.set(...hemisphereUp(up));
  hemisphere.intensity = intensity;
}

let ct156Sky = null;
/** The sky picture the CT-156's glossy parts reflect, or null (then the model draws its own small sky picture). */
export function getCt156Sky() {
  return ct156Sky;
}
/** Set by applyLook; the CT-156 models made after it use this sky. */
export function setCt156Sky(texture) {
  ct156Sky = texture;
}

const skies = new WeakMap(); // renderer -> { target, key }

/**
 * The sky: deep blue overhead, a hazy horizon, a dark prairie below, and a sun (bright enough that a glint in the paint is
 * brighter than white) in `sunDir`'s direction; z is up. Drawn once into a cube and filtered by PMREMGenerator
 * (three.js's own tool for light from a picture of the sky).
 */
function makeSky(THREE, renderer, sunDir) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { sunDir: { value: sunDir.clone().normalize() } },
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
  return target;
}

/**
 * Gives a renderer and scene the look. `sun` and `hemisphere` are the scene's lights (the sun's direction is the sun in the
 * sky); `up` is the world's up axis; `sceneLighting` false keeps the sky to the CT-156's own glossy parts (a scene with
 * many other lit things, like Traffic's buildings, may want that). Returns { sky, dispose() }; the renderer's own dispose
 * also ends it.
 */
export function applyLook(THREE, renderer, scene, { sun, hemisphere, up = 'z', exposure = LOOK.exposure, hemisphereIntensity = LOOK.hemisphereIntensity, environmentIntensity = LOOK.environmentIntensity, sceneLighting = true } = {}) {
  const sunDir = new THREE.Vector3(-0.5, -0.7, 1);
  if (sun) sunDir.copy(sun.position).sub(sun.target?.position ?? new THREE.Vector3());
  const key = `${sunDir.x.toFixed(3)},${sunDir.y.toFixed(3)},${sunDir.z.toFixed(3)}`;
  let held = skies.get(renderer);
  if (!held || held.key !== key) {
    held?.target.dispose();
    held = { target: makeSky(THREE, renderer, sunDir), key };
    skies.set(renderer, held);
  }
  const sky = held.target.texture;
  sky.userData.ct156Env = true; // a CT-156 kept from another view (its materials are shared) is swapped to this renderer's sky, not left on a dead one
  const before = { toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure, hemisphere: hemisphere?.intensity };

  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = exposure;
  if (sceneLighting) {
    scene.environment = sky;
    scene.environmentIntensity = environmentIntensity;
    if (up === 'y') scene.environmentRotation.set(-Math.PI / 2, 0, 0);
  }
  if (hemisphere) orientHemisphere(hemisphere, up, hemisphereIntensity);
  setCt156Sky(sky);
  // Models made before the sky (a view's first frame makes them first) swap their small sky picture for this one; so does a model
  // kept from a view that has closed (EP Tabletop keeps its ship), whose sky went with that view's renderer.
  scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (m?.envMap?.userData?.ct156Env && m.envMap !== sky) {
        m.envMap = sky;
        if (up === 'y') m.envMapRotation.set(-Math.PI / 2, 0, 0);
        m.needsUpdate = true;
      }
    }
  });

  let ended = false;
  const look = {
    sky,
    dispose() {
      if (ended) return;
      ended = true;
      renderer.toneMapping = before.toneMapping;
      renderer.toneMappingExposure = before.exposure;
      if (scene.environment === sky) scene.environment = null;
      if (ct156Sky === sky) setCt156Sky(null);
      if (skies.get(renderer)?.target === held.target) skies.delete(renderer);
      held.target.dispose();
    },
  };
  const rendererDispose = renderer.dispose;
  renderer.dispose = function dispose(...args) {
    look.dispose();
    return rendererDispose.apply(this, args);
  };
  return look;
}

/**
 * The look once the scene is first drawn: the scene's own `onBeforeRender` (three.js calls it at the start of every draw)
 * finds the renderer that draws it, so a view needs no code of its own. A scene that already has an `onBeforeRender` keeps it.
 * `options` as applyLook's; `sun` and `hemisphere` are the lights the caller made.
 */
export function lookOnFirstDraw(THREE, scene, options) {
  const previous = scene.onBeforeRender;
  let done = false;
  scene.onBeforeRender = function onBeforeRender(renderer, ...rest) {
    if (!done) {
      done = true;
      scene.onBeforeRender = previous;
      applyLook(THREE, renderer, scene, options);
    }
    return previous?.call(this, renderer, ...rest);
  };
}
