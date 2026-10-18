// The Model Showcase's 3D view (Patrick, 15 Oct 2026: "a MODEL SHOWCASE module ... just the Harvard sitting on its gear or
// flying, ... High and Performance, cockpit or outside with more zoom outside"): one CT-156 on a plain studio backdrop with
// its own lights, drawn from the shared pieces (ui-kit ct156-model.js, ct156-cockpit.js, ct156-blender.js). It shows the model
// and nothing else: no terrain, no weather. A picture only: in the air it flies flight-cycle.js's gentle cycle of turns,
// climbs and descents (MS-7), a picture's numbers, not a flight model.
//
// The look here is richer than the other modules' (Patrick, 17 Oct 2026, fix-list W27). Studio-style reflections (a lit room
// from three.js, in place of the code sky) light the paint, glass and spinner; this view only, as ct156-look.js takes the sky
// from the scene when the scene carries one. At the High level only, and only standing on the ground seen from outside, the
// aircraft throws a sharp sun shadow on the floor and the floor mirrors it faintly: real-time shadows are off everywhere else
// (aircraft-shadows.js; this view is the one exception) and there is no glow. Performance, flying and the seats keep the soft
// disc under the aircraft, with no shadow map and no mirror; the studio's reflections show from outside at both levels.
//
// Poses: on the ground (gear down, the inboard doors hanging open as parked, the prop stopped and feathered, the engine
// off: the start pose) and flying (the gear coming up, the prop turning, the cycle flown, or held wings level with
// Manoeuvre off). The gear (in the air) and the flaps follow their buttons, travelling as the real ones do; the flight
// surfaces, the stick and the power lever move with the cycle. Views: outside (drag to orbit, scroll to zoom, a slow
// turntable that can be switched off; the aircraft banks and pitches in place, its heading shown only on the panel) and
// each seat (drag to look round as in Formation's Cockpit view, hold Shift to zoom).
//
// When data fails: no WebGL leaves a message in place of the view; a Blender file or picture that does not load leaves the
// ship's own code-drawn shape or plain paint (ct156-blender.js logs it once).
import { loadThree, addLights, webglSupported } from '../../ui-kit/three-aircraft.js';
import { createCt156Model, disposeCt156Model, setGear, setPropStopped, setControls, PAINT_DEFAULT, CT156_GEAR_TRAVEL_S, CT156_FLAP_DEG } from '../../ui-kit/ct156-model.js';
import { setCt156Level, ct156Level, onCt156Level } from '../../ui-kit/ct156-blender.js';
import { onCt156Look } from '../../ui-kit/ct156-look-settings.js';
import { createAircraftShadows } from '../../ui-kit/aircraft-shadows.js';
import { createCockpitMount, aimCockpitCamera, createCockpitZoomKey, CT156_FT_PER_UNIT, COCKPIT_HEAD } from '../../ui-kit/ct156-cockpit.js';
import { T6A_PITCH } from '../../core/t6-performance.js';
import { createShowcaseFlight, stepShowcaseFlight, showcaseHud, showcaseAttitude } from './flight-cycle.js';

const rad = (d) => (d * Math.PI) / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** The ground under the main wheels, feet under the spinner's axis (ct156-model.js GEAR.groundFt, A2: 5.42 ft). */
const AXIS_ABOVE_GROUND_FT = 5.42;
/** Where the orbit looks on the ship, feet from the spinner's axis: about mid-fuselage (an estimate for the framing). */
const ORBIT_CENTRE_FT = Object.freeze({ x: -1.5, y: 0, z: 0.3 });
/** The orbit's distance range, feet: close enough to read rivets and the tail number, far enough to see the whole aircraft with room. */
export const ORBIT_DISTANCE_FT = Object.freeze({ min: 5, max: 140, start: 60 });
/** The outside camera's field of view, degrees (a modest telephoto, so the model is not stretched at the edges). */
const OUTSIDE_FOV_DEG = 32;
/** The orbit's height angle limits, degrees: on the ground the camera stays above the floor, in the air it may go under. */
const ELEVATION_LIMITS = Object.freeze({ ground: [2, 80], flying: [-80, 80] });
/** The turntable's speed, degrees a second: slow, a full turn in 48 s (an estimate for the feel). */
export const SPIN_DEG_PER_S = 7.5;
const DRAG_ORBIT_DEG_PER_PX = 0.4;
const DRAG_LOOK_DEG_PER_PX = 0.2;
const WHEEL_ZOOM_PER_PX = 0.0015;
/** The seat's resting look: along the nose, a little down so the panel and the coaming sit in the picture (an estimate, as the EP Tabletop's). */
export const SEAT_LOOK_START = Object.freeze({ yawDeg: 0, pitchDeg: -8 });
/** The flaps' travel from UP to LDG, seconds (an estimate: no page gives it). */
const FLAP_TRAVEL_S = 6;
/** Where the flap gauge's needle and the travel stand for each selection, 0 (UP) to 1 (LDG), as the gauge's marks. */
const FLAP_AT = Object.freeze({ UP: 0, TO: 0.5, LDG: 1 });
/** How strongly the studio room lights the paint, against the code sky's 1 (the room is much brighter than the code sky; by eye). */
const STUDIO_SKY_INTENSITY = 0.6;
/** The room's lights are blurred a little as they are filtered into the reflection (PMREM sigma, radians). */
const STUDIO_BLUR = 0.04;
/** The sun's shadow box: round the aircraft's middle (feet from the spinner's axis, above the ground), radius in feet, a little over its half length. */
const SHADOW_CENTRE_FT = Object.freeze({ x: -1.5, y: 0, z: 3.5 });
const SHADOW_RADIUS_FT = 20;
const SHADOW_MAP_SIZE = 2048;
/** The sun shadow's darkness on the floor (by eye), and the soft disc's darkness: lighter at High so the two do not double up (by eye), 1 at Performance (today's). */
const SHADOW_OPACITY = 0.35;
const DISC_OPACITY_HIGH = 0.5;
/** The floor mirror: how strong it is (alpha; 0.03, faint: the white underwing decals read clearly at 0.06), the picture's size in pixels, and where it fades out round the aircraft (feet). By eye. */
const MIRROR = Object.freeze({ alpha: 0.03, pixels: 512, sizeFt: 120, fadeFromFt: 8, fadeToFt: 48, clipBias: 0.003 });
/** The pictures load and attach after the first draw and after a level change: draw steadily for this long (milliseconds). */
const SETTLE_MS = 25_000;
/** At most one picture this often while nothing is being dragged (milliseconds), about 30 a second. */
const MIN_DRAW_MS = 33;
/** What the seat's panel reads standing on the ground, the engine off (a picture of the panel only; in the air, flight-cycle.js's numbers). */
const GROUND_HUD = Object.freeze({ pitchDeg: T6A_PITCH.onGearDeg, bankDeg: 0, kias: 0, altFt: 1892, headingDeg: 0, g: 1, vsFpm: 0, speedBrake: false, torquePct: 0, engineRunning: false, controls: Object.freeze({ roll: 0, pitch: 0, yaw: 0 }) });
/** The flaps' angle at `at`, 0 (UP) to 1 (LDG): UP to TO over the first half, TO to LDG over the second. */
const flapDeg = (at) => (at <= 0.5 ? (at / 0.5) * CT156_FLAP_DEG.TO : CT156_FLAP_DEG.TO + ((at - 0.5) / 0.5) * (CT156_FLAP_DEG.LDG - CT156_FLAP_DEG.TO));
/** One step of `from` toward `to` at `perS` a second over dtS seconds. */
const toward = (from, to, perS, dtS) => (Math.abs(to - from) <= perS * dtS ? to : from + Math.sign(to - from) * perS * dtS);

/**
 * Sets the ship's attitude from what its panel reads (flight-cycle.js showcaseAttitude), so the outside and the EADI and
 * standby always agree (W24). The root is the EADI's attitude; the model sits CT156_DATUM_DEG nose-down inside it, so on
 * the ground at the gear's 2.5° the spinner's axis is level.
 */
function applyAttitude(ship, hud) {
  const { x, y, z, order } = showcaseAttitude(hud);
  ship.rotation.set(x, y, z, order);
}

/** A vertical gradient picture for the backdrop. */
function gradientTexture(THREE, doc, stops) {
  const canvas = doc.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  for (const [at, colour] of stops) g.addColorStop(at, colour);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A round picture that fades to nothing at its edge: `inner` colour out to `solid` of the radius, then `outer` alpha 0. */
function discTexture(THREE, doc, { rgb, alphaMiddle, solid = 0 }) {
  const size = 256;
  const canvas = doc.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, (size / 2) * solid, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${rgb}, ${alphaMiddle})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Builds the view in `host` (an element; the canvas fills it). timers: the module's scheduler scope; doc: the page's document.
 * Returns a Promise of the view, or of null when WebGL is missing (a message is left in `host`):
 *   { tick(dtMs), setView('outside' | 'front' | 'rear'), setPose('ground' | 'flying'), setLevel('high' | 'performance'),
 *     setGear('up' | 'down'), setFlaps('UP' | 'TO' | 'LDG'), setManoeuvre(on), setSpin(on),
 *     setCamera({ azimuthDeg, elevationDeg, distanceFt }), resetCamera(), state(), redraw(), dispose() }.
 * The module's frame loop calls tick; it draws only when something changed, the aircraft is flying (the prop turns) or the
 * pictures are still arriving.
 */
export async function createShowcaseWorld({ host, doc = globalThis.document, onChange = () => {} }) {
  if (!webglSupported({ document: doc })) {
    const note = doc.createElement('p');
    note.className = 'ms-3d-note';
    note.textContent = 'This browser can\'t draw 3D (no WebGL), so the model can\'t be shown here.';
    host.append(note);
    return null;
  }
  const THREE = await loadThree();
  const canvas = doc.createElement('canvas');
  canvas.className = 'ms-3d-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'The CT-156 Harvard II, a 3D model you can turn round');
  host.append(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  const scene = new THREE.Scene();

  // The backdrop: a soft studio gradient, the floor a pool of light that fades out, and the aircraft's shadow on it.
  const backdrop = gradientTexture(THREE, doc, [[0, '#46627f'], [0.55, '#8ea6bd'], [1, '#d5dee7']]);
  scene.background = backdrop;
  const floorTexture = discTexture(THREE, doc, { rgb: '205, 214, 223', alphaMiddle: 0.95, solid: 0.35 });
  const shadowTexture = discTexture(THREE, doc, { rgb: '8, 14, 22', alphaMiddle: 0.55, solid: 0 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: floorTexture, transparent: true, depthWrite: false }));
  floor.scale.set(190, 190, 1);
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
  disc.scale.set(40, 44, 1);
  disc.position.set(-1.5, 0, 0.04);
  // The sun's shadow lands on a plane that shows only the shadow (High, on the ground, outside); the floor's mirror (made when
  // three's Reflector has loaded, High only) lies between the floor and it. Drawn in this order, nearest the floor first.
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: SHADOW_OPACITY, transparent: true, depthWrite: false }));
  shadowPlane.scale.set(80, 80, 1);
  shadowPlane.position.set(-1.5, 0, 0.02);
  shadowPlane.receiveShadow = true;
  shadowPlane.visible = false;
  floor.renderOrder = 0; // the mirror is 1
  shadowPlane.renderOrder = 2;
  disc.renderOrder = 3;
  scene.add(floor, shadowPlane, disc);

  // The lights: the shared sky-and-sun pair, a cool fill from the other side and a rim from behind, so no angle goes flat.
  const { sun } = addLights(THREE, scene);
  // The sun's shadow (High only; this view is let through aircraft-shadows.js's global switch). The shadow map is on only while
  // the shadow shows (applyGround): each switch rebuilds the shaders once, on a click.
  const shadows = createAircraftShadows(THREE, renderer, sun, { mapSize: SHADOW_MAP_SIZE, enabled: false, allowed: true });
  renderer.info.autoReset = false; // the mirror draws the scene a second time inside a frame: counts are reset once per picture (draw)
  const fill = new THREE.DirectionalLight('#a9c4ff', 0.9);
  fill.position.set(0.6, 0.7, 0.3).normalize().multiplyScalar(1000);
  const rim = new THREE.DirectionalLight('#ffe9cc', 0.8);
  rim.position.set(-0.3, 0.9, 0.5).normalize().multiplyScalar(1000);
  scene.add(fill, rim);

  // The aircraft: the shared CT-156, nose along +x, up +z, in feet. Ship #1: 122 on the nose and wings, 156122 on the fin
  // and on the label plate over the engine displays (Patrick, 17 Oct 2026: "Make it 156-122 and make the tail match"; was 104).
  const ship = createCt156Model(THREE, { color: '#58a6ff', paint: PAINT_DEFAULT, number: 1 });
  ship.scale.setScalar(CT156_FT_PER_UNIT);
  ship.rotation.order = 'ZYX';
  scene.add(ship);
  const cockpit = createCockpitMount(THREE, { doc });
  const camera = new THREE.PerspectiveCamera(OUTSIDE_FOV_DEG, 1, 0.5, 20_000);

  let view = 'outside';
  let pose = 'ground';
  let spin = true;
  // The gear (0 up, 1 down; parked while the doors hang open as on the ground), the flaps and the gentle flight.
  const gear = { at: 1, to: 1, parked: true };
  const flaps = { sel: 'UP', at: 0 };
  let manoeuvre = true;
  let flight = createShowcaseFlight();
  let minute = -1; // the UTC minute the clock last showed
  const orbit = { azimuthDeg: 38, elevationDeg: 11, distanceFt: ORBIT_DISTANCE_FT.start };
  const look = { ...SEAT_LOOK_START };
  let size = { w: 0, h: 0 };
  let dirty = true;
  let settleUntil = 0;
  let lastDraw = -Infinity;
  let disposed = false;
  let level = ct156Level(); // the files' level now; changes arrive through onCt156Level
  let studio = null; // the room's reflections (a PMREM target), when loaded
  let reflector = null; // the floor mirror, High only, when three's Reflector has loaded
  let ReflectorClass = null;
  let dragging = null;
  const now = () => globalThis.performance?.now() ?? Date.now();
  const touch = (settle = false) => {
    dirty = true;
    if (settle) settleUntil = now() + SETTLE_MS;
  };

  const zoomKey = createCockpitZoomKey(doc.defaultView ?? globalThis, () => touch());
  zoomKey.start();
  // The level and the look sliders change the model's files, pictures and paint in place: only the picture needs drawing again.
  const stopLevel = onCt156Level((next) => {
    level = next;
    applyLevel();
    noSelfShadow();
    touch(true);
  });
  const stopLook = onCt156Look(() => touch());

  /** The airframe takes no shadow from itself (its baked soft shadows do that work); only the floor's plane receives one. Run again whenever parts arrive. */
  function noSelfShadow() {
    ship.traverse((o) => {
      if (o.isMesh && o.receiveShadow) o.receiveShadow = false;
    });
  }
  noSelfShadow();

  /** Shows what belongs to the pose, view and level: the floor and disc on the ground; the sun shadow and the mirror at High on the ground seen from outside. */
  function applyGround() {
    const onGround = pose === 'ground';
    const rich = onGround && view === 'outside' && level === 'high';
    floor.visible = disc.visible = onGround;
    disc.material.opacity = rich ? DISC_OPACITY_HIGH : 1; // lighter only under the real shadow, so the two do not double up
    shadowPlane.visible = rich;
    if (reflector) reflector.visible = rich;
    // The shadow map is on only while its shadow shows (High, on the ground, outside): kept on through the seats, the
    // cockpit's materials, built with it on and no fresh map, came out near white. Switching rebuilds the materials once,
    // on a click.
    shadows.setEnabled(rich);
    if (rich) shadows.follow(new THREE.Vector3(SHADOW_CENTRE_FT.x, SHADOW_CENTRE_FT.y, SHADOW_CENTRE_FT.z), SHADOW_RADIUS_FT);
  }

  /**
   * The studio lights the model from outside only: from a seat the cockpit keeps the code sky, as in every other module (the
   * room also lights the surfaces, and from inside it washed the whole cockpit near white).
   */
  function applySky() {
    const on = Boolean(studio) && view === 'outside';
    scene.userData.ct156Sky = on ? studio.texture : undefined;
    scene.userData.ct156SkyIntensity = on ? STUDIO_SKY_INTENSITY : undefined;
  }

  /** Puts the level's extras in place: the mirror at High (shown by applyGround), none at Performance. */
  function applyLevel() {
    const high = level === 'high';
    if (high && ReflectorClass && !reflector) makeMirror();
    if (!high && reflector) dropMirror();
    applyGround();
  }

  /**
   * The floor's mirror (three's Reflector over the floor, drawn faintly and fading out with distance from the aircraft). While it
   * draws its picture, the floor, the disc, the shadow plane and the backdrop are left out, so only the aircraft is mirrored.
   */
  function makeMirror() {
    const vertexShader = ReflectorClass.ReflectorShader.vertexShader
      .replace('varying vec4 vUv;', 'varying vec4 vUv;\n\t\tvarying vec2 vLocal;')
      .replace('vUv = textureMatrix * vec4( position, 1.0 );', 'vUv = textureMatrix * vec4( position, 1.0 );\n\t\t\tvLocal = position.xy;');
    if (!vertexShader.includes('varying vec2 vLocal;') || !vertexShader.includes('vLocal = position.xy;')) {
      console.warn("The floor mirror's vertex shader has changed in this three.js; the mirror is left out.");
      return;
    }
    const shader = {
      name: 'ShowcaseFloorMirror',
      uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, mirrorAlpha: { value: MIRROR.alpha }, fadeFt: { value: new THREE.Vector2(MIRROR.fadeFromFt, MIRROR.fadeToFt) } },
      vertexShader,
      fragmentShader: [
        'uniform vec3 color; uniform sampler2D tDiffuse; uniform float mirrorAlpha; uniform vec2 fadeFt;',
        'varying vec4 vUv; varying vec2 vLocal;',
        '#include <logdepthbuf_pars_fragment>',
        'void main() {',
        '  #include <logdepthbuf_fragment>',
        '  vec4 base = texture2DProj( tDiffuse, vUv );', // empty space was drawn with alpha 0, so only the aircraft shows
        '  vec3 rgb = base.rgb / max( base.a, 0.001 );', // the smoothed edges hold colour times coverage: undo it
        '  float fade = 1.0 - smoothstep( fadeFt.x, fadeFt.y, length( vLocal ) );',
        '  gl_FragColor = vec4( rgb * color, base.a * mirrorAlpha * fade );',
        '  #include <tonemapping_fragment>',
        '  #include <colorspace_fragment>',
        '}',
      ].join('\n'),
    };
    const m = new ReflectorClass(new THREE.PlaneGeometry(MIRROR.sizeFt, MIRROR.sizeFt), { color: 0xffffff, textureWidth: MIRROR.pixels, textureHeight: MIRROR.pixels, clipBias: MIRROR.clipBias, shader });
    m.material.transparent = true;
    m.material.depthWrite = false;
    m.position.set(-1.5, 0, 0.01);
    m.renderOrder = 1;
    m.visible = false;
    const draws = m.onBeforeRender;
    m.onBeforeRender = function onBeforeRender(r, sc, cam, ...rest) {
      const left = [floor, disc, shadowPlane].map((o) => [o, o.visible]);
      const { background } = sc, clearAlpha = r.getClearAlpha();
      for (const [o] of left) o.visible = false;
      sc.background = null;
      r.setClearAlpha(0);
      try {
        draws.call(this, r, sc, cam, ...rest);
      } finally {
        for (const [o, v] of left) o.visible = v;
        sc.background = background;
        r.setClearAlpha(clearAlpha);
      }
    };
    reflector = m;
    scene.add(m);
  }
  function dropMirror() {
    scene.remove(reflector);
    reflector.geometry.dispose();
    reflector.dispose();
    reflector = null;
  }

  // three's room and mirror load after the first draw (three/addons come with the 3D view only: never a static import). Until
  // the room is in, the code sky lights the model; until the mirror is in, there is none.
  import('three/addons/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => {
    if (disposed) return;
    const room = new RoomEnvironment();
    const holder = new THREE.Scene(); // the room is built y-up; this view is z-up, so it is turned to put its ceiling lights overhead
    holder.add(room);
    holder.rotation.x = Math.PI / 2;
    const generator = new THREE.PMREMGenerator(renderer);
    studio = generator.fromScene(holder, STUDIO_BLUR);
    generator.dispose();
    room.dispose();
    studio.texture.userData.ct156Env = true; // so another module's model kept from here goes back to its own sky (ct156-look.js)
    applySky();
    touch(true);
  }, (err) => console.warn('The studio reflections could not be loaded; the code sky lights the model:', err));
  import('three/addons/objects/Reflector.js').then(({ Reflector }) => {
    if (disposed) return;
    ReflectorClass = Reflector;
    applyLevel();
    touch(true);
  }, (err) => console.warn('The floor mirror could not be loaded; there is none:', err));

  /** What the panel reads now: the ground's, or the flight's; the flaps where they are. */
  const hud = () => ({ ...(pose === 'ground' ? GROUND_HUD : showcaseHud(flight)), flaps: flaps.at });

  /** Puts the ship as it now stands: the gear, the prop, the height, the attitude, the surfaces (again after setCockpitView). */
  function applyPose() {
    setGear(ship, gear.at, gear.parked);
    setPropStopped(ship, pose === 'ground');
    ship.position.set(0, 0, pose === 'ground' ? AXIS_ABOVE_GROUND_FT : 0);
    const h = hud();
    applyAttitude(ship, h);
    setControls(ship, { ...h.controls, flaps: flapDeg(flaps.at) });
    applyGround();
    ship.updateMatrixWorld(true);
  }
  applyLevel();
  applyPose();

  /** Moves what moves (the flight, the gear, the flaps) dtS seconds on; true when anything did. */
  function advance(dtS) {
    let moved = false;
    if (pose === 'flying') {
      flight = stepShowcaseFlight(flight, dtS, { manoeuvre });
      moved = true;
    }
    if (gear.at !== gear.to) {
      gear.at = toward(gear.at, gear.to, 1 / CT156_GEAR_TRAVEL_S, dtS);
      if (gear.at === 0) gear.parked = false; // up and shut: lowered again in the air, the doors close behind the legs
      moved = true;
    }
    const flapsTo = FLAP_AT[flaps.sel];
    if (flaps.at !== flapsTo) {
      flaps.at = toward(flaps.at, flapsTo, 1 / FLAP_TRAVEL_S, dtS);
      moved = true;
    }
    if (moved) applyPose();
    return moved;
  }

  function aim(w, h) {
    if (view === 'outside') {
      const c = new THREE.Vector3(ship.position.x + ORBIT_CENTRE_FT.x, ship.position.y + ORBIT_CENTRE_FT.y, ship.position.z + ORBIT_CENTRE_FT.z); // the ship's own scale makes its local space units, so feet are added in the world
      const el = rad(orbit.elevationDeg), az = rad(orbit.azimuthDeg);
      camera.up.set(0, 0, 1);
      camera.fov = OUTSIDE_FOV_DEG;
      camera.aspect = w / Math.max(h, 1);
      camera.near = 0.5;
      camera.far = 20_000;
      camera.updateProjectionMatrix();
      camera.position.set(c.x + orbit.distanceFt * Math.cos(el) * Math.cos(az), c.y + orbit.distanceFt * Math.cos(el) * Math.sin(az), c.z + orbit.distanceFt * Math.sin(el));
      camera.lookAt(c);
      camera.updateMatrixWorld(true);
    } else {
      aimCockpitCamera(THREE, camera, ship, { seat: view, yawDeg: look.yawDeg, pitchDeg: look.pitchDeg, width: w, height: h, zoomed: zoomKey.held(), far: 20_000 });
    }
  }

  function draw() {
    if (disposed) return;
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    if (w !== size.w || h !== size.h) {
      size = { w, h };
      renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
      renderer.setSize(w, h, false);
    }
    lastDraw = now();
    dirty = false;
    // Every picture while the shadow map is on: parts that arrive later (files swapped in by a level change, and set their own
    // receiveShadow) take no shadow of their own either. A flag flip is a uniform, not a new shader.
    if (renderer.shadowMap.enabled) noSelfShadow();
    renderer.info.reset(); // one picture's draw calls and triangles, the mirror's included
    if (view !== 'outside') cockpit.update(hud());
    aim(w, h);
    renderer.render(scene, camera);
  }

  // Drag: orbit outside, look round in a seat. Scroll: zoom outside.
  const onDown = (e) => {
    dragging = { x: e.clientX, y: e.clientY, orbit: { ...orbit }, look: { yaw: look.yawDeg, pitch: look.pitchDeg } };
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
    if (view === 'outside') {
      const [lo, hi] = ELEVATION_LIMITS[pose];
      orbit.azimuthDeg = (dragging.orbit.azimuthDeg - dx * DRAG_ORBIT_DEG_PER_PX + 360) % 360;
      orbit.elevationDeg = clamp(dragging.orbit.elevationDeg + dy * DRAG_ORBIT_DEG_PER_PX, lo, hi);
    } else {
      look.yawDeg = clamp(dragging.look.yaw - dx * DRAG_LOOK_DEG_PER_PX, COCKPIT_HEAD.yawDeg[0], COCKPIT_HEAD.yawDeg[1]);
      look.pitchDeg = clamp(dragging.look.pitch - dy * DRAG_LOOK_DEG_PER_PX, COCKPIT_HEAD.pitchDeg[0], COCKPIT_HEAD.pitchDeg[1]);
    }
    touch();
  };
  const onUp = () => {
    dragging = null;
  };
  const onWheel = (e) => {
    if (view !== 'outside') return;
    e.preventDefault();
    orbit.distanceFt = clamp(orbit.distanceFt * Math.exp(e.deltaY * WHEEL_ZOOM_PER_PX), ORBIT_DISTANCE_FT.min, ORBIT_DISTANCE_FT.max);
    touch();
  };
  const onDouble = () => {
    if (view === 'outside') {
      orbit.distanceFt = ORBIT_DISTANCE_FT.start;
    } else {
      look.yawDeg = SEAT_LOOK_START.yawDeg;
      look.pitchDeg = SEAT_LOOK_START.pitchDeg;
    }
    touch();
    onChange();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDouble);
  const resizer = globalThis.ResizeObserver ? new globalThis.ResizeObserver(() => touch()) : null;
  resizer?.observe(host);

  touch(true);

  return {
    /** Called every frame: turns the turntable, then draws if anything changed (or the prop is turning, or pictures are still arriving). */
    tick(dtMs) {
      if (disposed) return;
      const t = now();
      const dtS = clamp(dtMs, 0, 250) / 1000;
      if (spin && view === 'outside' && !dragging) {
        orbit.azimuthDeg = (orbit.azimuthDeg + dtS * SPIN_DEG_PER_S) % 360;
        dirty = true;
      }
      if (advance(dtS)) dirty = true;
      // The seat's clock shows the minute in ZULU: draw again when it turns, even with nothing else moving.
      const m = new Date().getUTCMinutes();
      if (m !== minute) {
        minute = m;
        dirty = true;
      }
      const going = dirty || pose === 'flying' || t < settleUntil;
      if (going && t - lastDraw >= MIN_DRAW_MS) draw();
    },
    setView(next) {
      view = next === 'front' || next === 'rear' ? next : 'outside';
      cockpit.mount(view === 'outside' ? null : ship, view === 'rear' ? 'rear' : 'front');
      look.yawDeg = SEAT_LOOK_START.yawDeg;
      look.pitchDeg = SEAT_LOOK_START.pitchDeg;
      applyPose(); // setCockpitView hides the prop from a seat; this puts the pose's own prop and gear state back
      noSelfShadow(); // the seat's parts were added just now
      applySky();
      touch(true);
      onChange();
    },
    setPose(next) {
      const was = pose;
      pose = next === 'flying' ? 'flying' : 'ground';
      if (pose !== was) {
        if (pose === 'ground') { // put down on its gear: down at once, the doors hanging open as parked, the engine off
          Object.assign(gear, { at: 1, to: 1, parked: true });
        } else { // airborne: the gear comes up from the parked pose (its doors already open), the cycle starts over
          gear.to = 0;
          flight = createShowcaseFlight();
        }
      }
      orbit.elevationDeg = clamp(orbit.elevationDeg, ...ELEVATION_LIMITS[pose]);
      applyPose();
      touch(true);
      onChange();
    },
    setLevel(next) {
      setCt156Level(next);
      onChange();
    },
    /** The gear, 'up' or 'down' (W25): in the air only; it travels over CT156_GEAR_TRAVEL_S. */
    setGear(next) {
      if (pose !== 'flying') return;
      gear.to = next === 'down' ? 1 : 0;
      gear.parked = false; // in the air the inboard doors close behind the legs, even turned back mid-way from the parked pose
      touch();
      onChange();
    },
    /** The flaps, 'UP', 'TO' or 'LDG' (W25): they travel over FLAP_TRAVEL_S, on the ground too. */
    setFlaps(next) {
      flaps.sel = Object.hasOwn(FLAP_AT, next) ? next : 'UP';
      touch();
      onChange();
    },
    /** The gentle cycle on, or wings-level cruise held (the Manoeuvre checkbox). */
    setManoeuvre(on) {
      manoeuvre = Boolean(on);
      onChange();
    },
    setSpin(on) {
      spin = Boolean(on);
      touch();
      onChange();
    },
    /** Puts the outside camera where asked (the cover film's script uses it): azimuth round the aircraft from the nose, elevation, distance in feet. */
    setCamera({ azimuthDeg = orbit.azimuthDeg, elevationDeg = orbit.elevationDeg, distanceFt = orbit.distanceFt } = {}) {
      orbit.azimuthDeg = ((azimuthDeg % 360) + 360) % 360;
      orbit.elevationDeg = clamp(elevationDeg, ...ELEVATION_LIMITS[pose]);
      orbit.distanceFt = clamp(distanceFt, ORBIT_DISTANCE_FT.min, ORBIT_DISTANCE_FT.max);
      touch();
    },
    resetCamera: onDouble,
    state: () => ({ view, pose, spin, level: ct156Level(), distanceFt: orbit.distanceFt, gear: gear.to === 1 ? 'down' : 'up', flaps: flaps.sel, manoeuvre }),
    redraw: draw,
    dispose() {
      disposed = true;
      zoomKey.stop();
      stopLevel();
      stopLook();
      resizer?.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDouble);
      cockpit.dispose();
      scene.remove(ship);
      disposeCt156Model(ship);
      for (const m of [floor, disc, shadowPlane]) {
        m.geometry.dispose();
        m.material.dispose();
      }
      if (reflector) dropMirror();
      shadows.dispose();
      sun.shadow.dispose();
      if (studio) {
        scene.userData.ct156Sky = undefined;
        studio.dispose();
        studio = null;
      }
      floorTexture.dispose();
      shadowTexture.dispose();
      backdrop.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
