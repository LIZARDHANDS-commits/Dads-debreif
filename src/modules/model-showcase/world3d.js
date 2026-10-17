// The Model Showcase's 3D view (Patrick, 15 Oct 2026: "a MODEL SHOWCASE module ... just the Harvard sitting on its gear or
// flying, wear and grime sliders, High and Performance, cockpit or outside with more zoom outside"): one CT-156 on a plain
// studio backdrop with its own lights, drawn from the shared pieces (ui-kit ct156-model.js, ct156-cockpit.js, ct156-blender.js).
// It shows the model and nothing else: no flight maths, no terrain, no weather. A picture only.
//
// Poses: on the ground (gear down, the inboard doors hanging open as parked, the prop stopped and feathered: the start pose)
// and flying (gear up, the prop turning, a little bank). Views: outside (drag to orbit, scroll to zoom, a slow turntable that
// can be switched off) and each seat (drag to look round as in Formation's Cockpit view, hold Shift to zoom).
//
// When data fails: no WebGL leaves a message in place of the view; a Blender file or picture that does not load leaves the
// ship's own code-drawn shape or plain paint (ct156-blender.js logs it once).
import { loadThree, addLights, webglSupported } from '../../ui-kit/three-aircraft.js';
import { createCt156Model, disposeCt156Model, setGear, setPropStopped, PAINT_DEFAULT } from '../../ui-kit/ct156-model.js';
import { setCt156Level, ct156Level, onCt156Level } from '../../ui-kit/ct156-blender.js';
import { onCt156Look } from '../../ui-kit/ct156-look-settings.js';
import { createCockpitMount, aimCockpitCamera, createCockpitZoomKey, CT156_FT_PER_UNIT, COCKPIT_HEAD } from '../../ui-kit/ct156-cockpit.js';
import { T6A_PITCH } from '../../core/t6-performance.js';

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
/** The flying pose: a few degrees of bank so the pictures are not flat on (a tool choice). */
const FLYING_BANK_DEG = 10;
/** The pictures load and attach after the first draw and after a level change: draw steadily for this long (milliseconds). */
const SETTLE_MS = 25_000;
/** At most one picture this often while nothing is being dragged (milliseconds), about 30 a second. */
const MIN_DRAW_MS = 33;
/** What the seat's panel reads (a picture of the panel only): standing on the ground, and in the air (the numbers are the picture's, not flight). */
const HUD = Object.freeze({
  ground: { pitchDeg: T6A_PITCH.onGearDeg, bankDeg: 0, kias: 0, altFt: 1892, headingDeg: 0, g: 1, vsFpm: 0, speedBrake: false },
  flying: { pitchDeg: 0, bankDeg: FLYING_BANK_DEG, kias: 150, altFt: 5000, headingDeg: 90, g: 1, vsFpm: 0, speedBrake: false },
});

/**
 * Sets the ship's attitude from what its panel reads, so the outside and the EADI and standby always agree (W24, Patrick
 * 17 Oct 2026: "the EADI and backup eadi indicate the OPPOSITE bank of what the model is flying"). bankDeg right wing down
 * positive, pitchDeg nose up positive: the app's convention, about +X (nose) for bank, so a right bank lifts the left
 * (+Y) wing; -pitch about +Y (left) for the nose up (as the EP Tabletop's world3d.js). The root is the EADI's attitude;
 * the model sits CT156_DATUM_DEG nose-down inside it, so on the ground at the gear's 2.5° the spinner's axis is level.
 */
function applyAttitude(ship, { bankDeg = 0, pitchDeg = 0 }) {
  ship.rotation.set(rad(bankDeg), -rad(pitchDeg), 0, 'ZYX');
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
 *     setSpin(on), setCamera({ azimuthDeg, elevationDeg, distanceFt }), resetCamera(), state(), redraw(), dispose() }.
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
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
  shadow.scale.set(40, 44, 1);
  shadow.position.set(-1.5, 0, 0.04);
  floor.renderOrder = 0;
  shadow.renderOrder = 1;
  scene.add(floor, shadow);

  // The lights: the shared sky-and-sun pair, a cool fill from the other side and a rim from behind, so no angle goes flat.
  addLights(THREE, scene);
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
  const orbit = { azimuthDeg: 38, elevationDeg: 11, distanceFt: ORBIT_DISTANCE_FT.start };
  const look = { ...SEAT_LOOK_START };
  let size = { w: 0, h: 0 };
  let dirty = true;
  let settleUntil = 0;
  let lastDraw = -Infinity;
  let disposed = false;
  let dragging = null;
  const now = () => globalThis.performance?.now() ?? Date.now();
  const touch = (settle = false) => {
    dirty = true;
    if (settle) settleUntil = now() + SETTLE_MS;
  };

  const zoomKey = createCockpitZoomKey(doc.defaultView ?? globalThis, () => touch());
  zoomKey.start();
  // The level and the look sliders change the model's files, pictures and paint in place: only the picture needs drawing again.
  const stopLevel = onCt156Level(() => touch(true));
  const stopLook = onCt156Look(() => touch());

  function applyPose() {
    if (pose === 'ground') {
      setGear(ship, 1, true);
      setPropStopped(ship, true);
      ship.position.set(0, 0, AXIS_ABOVE_GROUND_FT);
    } else {
      setGear(ship, 0);
      setPropStopped(ship, false);
      ship.position.set(0, 0, 0);
    }
    applyAttitude(ship, HUD[pose]);
    floor.visible = shadow.visible = pose === 'ground';
    ship.updateMatrixWorld(true);
  }
  applyPose();

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
    if (view !== 'outside') cockpit.update(HUD[pose]);
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
      if (spin && view === 'outside' && !dragging) {
        orbit.azimuthDeg = (orbit.azimuthDeg + (clamp(dtMs, 0, 250) * SPIN_DEG_PER_S) / 1000) % 360;
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
      touch(true);
      onChange();
    },
    setPose(next) {
      pose = next === 'flying' ? 'flying' : 'ground';
      orbit.elevationDeg = clamp(orbit.elevationDeg, ...ELEVATION_LIMITS[pose]);
      applyPose();
      touch(true);
      onChange();
    },
    setLevel(next) {
      setCt156Level(next);
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
    state: () => ({ view, pose, spin, level: ct156Level(), distanceFt: orbit.distanceFt }),
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
      for (const m of [floor, shadow]) {
        m.geometry.dispose();
        m.material.dispose();
      }
      floorTexture.dispose();
      shadowTexture.dispose();
      backdrop.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
