/**
 * Real-time sun shadows on the aircraft: the canopy frames across the pilots and the cockpit, the wing on the belly,
 * the tail on the fuselage (Patrick, 11 Oct 2026 21:10Z card "Every 3D view"). One shared helper each module's 3D view
 * switches on with its own renderer and sun; the scenes span miles, so the sun's shadow box is kept tight round the
 * aircraft being looked at (follow), which keeps the shadows sharp. The CT-156 model's solid parts cast and take shadows
 * (ct156-model.js), so only they are drawn into the shadow picture.
 *
 *   const shadows = createAircraftShadows(THREE, renderer, sun);
 *   // each frame, before rendering:
 *   shadows.follow(ship); // or shadows.follow(centreVector3, radius) to cover several aircraft
 *
 * The sun keeps its direction (its position less its target's when this is made). The sun's target must be in the
 * scene. Map size and softness are estimates by eye; a smaller map (1024) is lighter on phones.
 *
 * One view may be let through the switch below: createAircraftShadows(THREE, renderer, sun, { allowed: true }) works for that
 * caller only (the Model Showcase's High level, Patrick, 17 Oct 2026); every other caller stays off.
 */
/**
 * Real-time shadows are off in every module for now (Patrick, 12 Oct 2026: "turn off real time shadows in all modules for now").
 * Set true to bring them back; each module's own switch (Formation's Graphics setting, SOF's) then works again.
 */
export const AIRCRAFT_SHADOWS_ALLOWED = false;

export function createAircraftShadows(THREE, renderer, sun, { mapSize = 2048, enabled = true, allowed = false } = {}) {
  // three.js 0.186 removed PCFSoftShadowMap (it warns and falls back); PCFShadowMap is its filtered soft-edged one.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  sun.shadow.mapSize.set(mapSize, mapSize);
  const toSun = sun.position.clone().sub(sun.target.position);
  if (toSun.lengthSq() === 0) toSun.set(0, 0, 1);
  toSun.normalize();
  const centre = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const cam = sun.shadow.camera;

  const shadows = {
    enabled: false,
    /** Switches the shadows on or off (the renderer recompiles its materials once). */
    setEnabled(on) {
      on = Boolean(on) && (AIRCRAFT_SHADOWS_ALLOWED || allowed);
      if (on === shadows.enabled) return;
      shadows.enabled = on;
      renderer.shadowMap.enabled = on;
      sun.castShadow = on;
    },
    /**
     * Fits the sun's shadow box round `target`: an Object3D (a CT-156 model's group; radius by default about the
     * aircraft's half length at its drawn size) or a Vector3 with a radius in world units.
     */
    follow(target, radius) {
      if (!shadows.enabled || !target) return;
      if (target.isObject3D) {
        target.updateWorldMatrix(true, false);
        target.getWorldPosition(centre);
        radius ??= 0.8 * target.getWorldScale(scale).x; // the model is 1.44 units nose to tail
      } else {
        centre.copy(target);
      }
      if (!(radius > 0)) return;
      sun.target.position.copy(centre);
      sun.target.updateMatrixWorld();
      sun.position.copy(centre).addScaledVector(toSun, 4 * radius);
      sun.updateMatrixWorld();
      cam.left = -radius;
      cam.right = radius;
      cam.top = radius;
      cam.bottom = -radius;
      cam.near = 2 * radius;
      cam.far = 6 * radius;
      cam.updateProjectionMatrix();
      // About three shadow texels, so smooth skin and walls the sun grazes don't speckle themselves (by eye).
      sun.shadow.normalBias = (6 * radius) / mapSize;
      sun.shadow.bias = -0.0005;
    },
    /** Switches the shadows off and leaves the sun and renderer as they were. */
    dispose() {
      shadows.setEnabled(false);
    },
  };
  shadows.setEnabled(enabled);
  return shadows;
}
