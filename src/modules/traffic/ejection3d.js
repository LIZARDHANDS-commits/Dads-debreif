// The ejection in the 3D view (Patrick, 5 Oct 06:29Z; TR-75): the seat with its rocket, then the pilot under an
// opening parachute, drifting down with the wind, and the canopy lying on the ground once down. Built in real feet,
// then scaled like the aircraft so it stays in proportion when the aircraft are drawn larger. Where it is comes from
// ejection.js; this file only draws it. The sizes are estimates for the picture.

const CANOPY_RADIUS_FT = 12;
const LINES_FT = 16; // from the canopy's rim down to the harness
const SHROUDS = 8;

/** A new parachute-and-seat group for `THREE`, hidden until posed. */
export function createEjectionModel(THREE) {
  const group = new THREE.Group();
  group.visible = false;

  const canopyMaterial = new THREE.MeshLambertMaterial({ color: 0xf97316, side: THREE.DoubleSide });
  // A shallow dome, open at the bottom; three.js builds it Y-up, the scene is Z-up.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(CANOPY_RADIUS_FT, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2.6), canopyMaterial);
  canopy.rotation.x = Math.PI / 2;
  const canopyPivot = new THREE.Group();
  canopyPivot.add(canopy);

  const rimR = CANOPY_RADIUS_FT * Math.sin(Math.PI / 2.6);
  const rimZ = CANOPY_RADIUS_FT * Math.cos(Math.PI / 2.6);
  const pts = [];
  for (let i = 0; i < SHROUDS; i++) {
    const a = (i / SHROUDS) * Math.PI * 2;
    pts.push(rimR * Math.cos(a), rimR * Math.sin(a), rimZ, 0, 0, -LINES_FT);
  }
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const shrouds = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ color: 0xe5e7eb }));
  canopyPivot.add(shrouds);
  canopyPivot.position.z = LINES_FT;

  const pilot = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 5), new THREE.MeshLambertMaterial({ color: 0x4d5d3a }));
  pilot.position.z = -2.5;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 4.5), new THREE.MeshLambertMaterial({ color: 0x374151 }));
  seat.position.z = -2.5;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(1.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
  flame.rotation.x = Math.PI / 2; // tip down
  flame.position.z = -9;

  group.add(canopyPivot, pilot, seat, flame);
  group.userData = { canopyPivot, shrouds, seat, flame, pilot };
  return group;
}

/**
 * Poses the group from ejection.js's state `st` at `z` (the scene height of st.person) with `scale` (the aircraft's
 * drawn size over its real size). `sinceSec` is the time since the ejection; `riseSec` the rocket's burn.
 */
export function poseEjectionModel(group, st, z, scale, sinceSec, riseSec) {
  const { canopyPivot, shrouds, seat, flame } = group.userData;
  group.visible = true;
  group.position.set(st.person.x, st.person.y, z + (st.down ? 5 * scale : 0)); // on the ground the pilot stands on it
  group.scale.setScalar(scale);
  seat.visible = st.seat;
  flame.visible = sinceSec < riseSec;
  if (st.down) {
    // On the ground: the canopy lies flat beside the pilot.
    canopyPivot.visible = true;
    shrouds.visible = false;
    canopyPivot.scale.set(1, 1, 0.08);
    canopyPivot.position.set(CANOPY_RADIUS_FT + 4, 0, -4.5);
    return;
  }
  const open = st.chuteOpen;
  canopyPivot.visible = open > 0;
  shrouds.visible = open > 0;
  canopyPivot.position.set(0, 0, LINES_FT * Math.max(0.3, open));
  // Opening: a streamer first, then the canopy fills out.
  canopyPivot.scale.set(Math.max(0.05, open), Math.max(0.05, open), Math.max(0.3, open));
}

/** Frees the group's geometries and materials. */
export function disposeEjectionModel(group) {
  group.removeFromParent();
  group.traverse((o) => {
    o.geometry?.dispose?.();
    o.material?.dispose?.();
  });
}
