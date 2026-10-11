// Keeps thin flat things readable at range (TR-146, TR-147): the runway and taxiway paint, and the roads. A screen resolves about a
// third of what the eye does, so far off a 3 ft stripe or a 26 ft road covers a fraction of a pixel and vanishes. Each strip is pushed
// out across its narrow side just enough to stay `minPx` wide on screen, up to `maxGrow` times its real width; up close it is never
// touched. Past that cap it fades (alpha down to `floor`) rather than flicker (TR-137). The geometry carries, per vertex, the strip's
// real narrow width (attribute stripeW, ft) and the way out across it (attribute growDir, a unit vector on the ground). minPx 0 turns
// the widening off.

/** Patches `material` (a MeshBasicMaterial) to hold its strips at least minPx wide on screen. */
export function holdScreenWidth(material, { minPx = 1.5, maxGrow = 6, floor = 0.15 } = {}) {
  const uniforms = { uHalfPx: { value: [960, 540] }, uMinPx: { value: minPx } };
  material.userData.screenWidthUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float stripeW;
attribute vec2 growDir;
uniform vec2 uHalfPx;
uniform float uMinPx;
varying float vStripeW;
varying vec2 vGroundXY;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vStripeW = stripeW;
if (uMinPx > 0.0) {
  vec4 a = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  vec4 b = projectionMatrix * modelViewMatrix * vec4(transformed + vec3(growDir, 0.0), 1.0);
  float pxPerFt = length((b.xy / b.w - a.xy / a.w) * uHalfPx);
  float extra = clamp(uMinPx / max(pxPerFt, 1e-4) - stripeW, 0.0, stripeW * ${(maxGrow - 1).toFixed(2)}) * 0.5;
  transformed.xy += growDir * extra;
  vStripeW = stripeW + 2.0 * extra;
}
vGroundXY = (modelMatrix * vec4(transformed, 1.0)).xy;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vStripeW;
varying vec2 vGroundXY;`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
float ftPerPx = max(length(fwidth(vGroundXY)), 1e-4);
gl_FragColor.a *= clamp(vStripeW / ftPerPx / 1.5, ${floor.toFixed(2)}, 1.0);`);
  };
  material.customProgramCacheKey = () => `hold-screen-width-${floor}-${minPx}-${maxGrow}`;
  return material;
}

/** A mesh's onBeforeRender that keeps the shader's screen size (CSS pixels) up to date. */
export function trackScreen(THREE) {
  const size = new THREE.Vector2();
  return (renderer, scene, camera, geometry, material) => {
    const u = material.userData.screenWidthUniforms;
    if (!u) return;
    renderer.getSize(size);
    u.uHalfPx.value = [size.x / 2, size.y / 2];
  };
}
