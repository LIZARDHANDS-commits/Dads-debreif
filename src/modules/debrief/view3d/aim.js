// Where the Chase camera sits and where a locked head looks (DB-22), as three.js vectors. THREE is passed in, because
// it loads only when 3D is first shown. World axes as everywhere in the 3D view: x east, y north, z up, in feet.
import { COCKPIT_VIEW } from '../../../ui-kit/ct156-cockpit.js';

/** Chase: how far behind the ship the camera sits, and how high it starts above the ship's path. Both are estimates (about three ship lengths and a modest rise). */
export const CHASE = Object.freeze({ distanceFt: 100, elevDeg: 12, elevRangeDeg: [-30, 85] });

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const clampTo = (v, range) => Math.max(range[0], Math.min(range[1], v));

/**
 * The head turn (yawDeg left, pitchDeg up, of the nose, rolling with the wings) that looks from the ship `root` at
 * `target` ({ x, y, z } in world feet). The Cockpit's aim turns yaw about the ship's up, then pitch, so these are the
 * target's bearing and elevation in the ship's own frame.
 */
export function headToward(THREE, root, target) {
  const d = new THREE.Vector3(target.x, target.y, target.z).sub(root.position);
  d.applyQuaternion(root.quaternion.clone().invert()); // into the ship's frame: x nose, y left, z up
  return { yawDeg: deg(Math.atan2(d.y, d.x)), pitchDeg: deg(Math.atan2(d.z, Math.hypot(d.x, d.y))) };
}

/** The 60 degrees across the cockpit's view, kept across the longer side of the box. */
function setLens(camera, width, height, near) {
  camera.aspect = width / Math.max(height, 1);
  camera.fov = Math.min(COCKPIT_VIEW.fovAcrossDeg, 2 * deg(Math.atan(Math.tan(rad(COCKPIT_VIEW.fovAcrossDeg / 2)) / camera.aspect)));
  camera.near = near;
  camera.far = COCKPIT_VIEW.farFt;
  camera.updateProjectionMatrix();
}

/**
 * Points a PerspectiveCamera at the ship `root` from behind it: along its heading `hdg` (radians, 0 = east), swung round
 * by `yawDeg` (left of straight behind) and raised by `pitchDeg`; with `target` ({ x, y, z }) it looks at that instead
 * (Padlock) from straight behind. The horizon stays level: the camera does not bank with the ship.
 */
export function aimChaseCamera(THREE, camera, root, { hdg, yawDeg = 0, pitchDeg = 0, target = null, width = 1, height = 1 }) {
  const az = hdg + Math.PI + rad(yawDeg);
  const el = rad(clampTo(CHASE.elevDeg + pitchDeg, CHASE.elevRangeDeg));
  const at = root.position;
  camera.position.set(
    at.x + CHASE.distanceFt * Math.cos(el) * Math.cos(az),
    at.y + CHASE.distanceFt * Math.cos(el) * Math.sin(az),
    at.z + CHASE.distanceFt * Math.sin(el),
  );
  camera.up.set(0, 0, 1);
  setLens(camera, width, height, 1);
  camera.lookAt(target ? new THREE.Vector3(target.x, target.y, target.z) : at);
  camera.updateMatrixWorld(true);
  return camera;
}
