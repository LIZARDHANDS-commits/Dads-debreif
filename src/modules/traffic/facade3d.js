// Windows and doors for simple building blocks (TR-130; Patrick, 10 Oct: "Add basic detail to all of the hangars and buildings -
// doors/windows/realistic features. the ramp-facing sides of the annexes of the hangars have long windows. two doors on each facing
// the ramp. all the base bldgs should have more detail too"). Each window or door is a thin box just proud of the wall, and a whole
// group's are two InstancedMeshes (glass, doors): two draw calls however many buildings. Sizes are estimates (a storey 12 ft, a
// window 4 by 4.5 ft every 10 ft, a door 3.5 by 7 ft).

const STOREY_FT = 12;
const PROUD_FT = 0.2;

/** The four faces of a block in its own frame: outward normal (nx, ny), the face's length, and its middle. */
function faces(b) {
  return [
    { nx: 0, ny: -1, len: b.w, mx: 0, my: -b.d / 2 },
    { nx: 0, ny: 1, len: b.w, mx: 0, my: b.d / 2 },
    { nx: 1, ny: 0, len: b.d, mx: b.w / 2, my: 0 },
    { nx: -1, ny: 0, len: b.d, mx: -b.w / 2, my: 0 },
  ];
}

/** The face whose outward normal points most along world direction (dx, dy). */
export function faceToward(b, dx, dy) {
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  let best = 0, bestDot = -Infinity;
  faces(b).forEach((f, i) => {
    const wx = f.nx * c - f.ny * s, wy = f.nx * s + f.ny * c;
    const dot = wx * dx + wy * dy;
    if (dot > bestDot) { bestDot = dot; best = i; }
  });
  return best;
}

/**
 * Collects window and door boxes for a block { cx, cy, w, d, rot, h, z0? }. opts: { kind: 'office' | 'house' | 'clerestory',
 * ribbonFace (a face index: one long window band per storey there, with two doors on it), doorFace (a face index: a door there),
 * skipFaces (face indices left plain) }. Pushes [cx, cy, z, rot, sx, sy, sz] boxes onto out.glass and out.doors.
 */
export function addFacade(out, b, opts = {}) {
  const { kind = 'office', ribbonFace = -1, doorFace = -1, skipFaces = [] } = opts;
  const z0 = b.z0 ?? 0;
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  const put = (list, f, along, z, width, height) => {
    // The box's middle in the block frame: on the face, `along` it (to the left, looking at the face from outside).
    const tx = -f.ny, ty = f.nx;
    const lx = f.mx + f.nx * PROUD_FT + tx * along, ly = f.my + f.ny * PROUD_FT + ty * along;
    const wx = b.cx + lx * c - ly * s, wy = b.cy + lx * s + ly * c;
    const faceRot = b.rot + Math.atan2(ty, tx);
    list.push([wx, wy, z0 + z + height / 2, faceRot, width, 0.5, height]);
  };
  faces(b).forEach((f, i) => {
    if (skipFaces.includes(i) || f.len < 8) return;
    const storeys = kind === 'house' ? 1 : Math.max(1, Math.floor((b.h - 2) / STOREY_FT));
    if (i === ribbonFace) {
      // The ramp side of an annex: a long window band each storey, mullions every 8 ft, and two doors on the ground floor.
      const doorsAt = [-f.len * 0.3, f.len * 0.3];
      for (let k = 0; k < storeys; k++) {
        const sill = 3.5 + k * STOREY_FT;
        const runs = k === 0 ? [[-f.len / 2 + 4, doorsAt[0] - 4], [doorsAt[0] + 4, doorsAt[1] - 4], [doorsAt[1] + 4, f.len / 2 - 4]] : [[-f.len / 2 + 4, f.len / 2 - 4]];
        for (const [a, e] of runs) {
          if (e - a < 4) continue;
          const n = Math.max(1, Math.round((e - a) / 8));
          const pane = (e - a) / n;
          for (let j = 0; j < n; j++) put(out.glass, f, a + pane * (j + 0.5), sill, pane - 0.6, 5);
        }
      }
      for (const at of doorsAt) put(out.doors, f, at, 0, 3.5, 7.5);
      return;
    }
    const isDoor = i === doorFace;
    if (kind === 'clerestory') {
      // A hangar's long wall: a row of high windows under the roof.
      const n = Math.floor((f.len - 12) / 16);
      for (let j = 0; j < n; j++) put(out.glass, f, -((n - 1) * 16) / 2 + j * 16, b.h - 9, 7, 3);
      if (isDoor) put(out.doors, f, f.len / 2 - 10, 0, 3.5, 7.5);
      return;
    }
    const step = kind === 'house' ? 12 : 10;
    const winW = kind === 'house' ? 3.5 : 4;
    const n = Math.floor((f.len - 6) / step);
    if (n < 1) {
      if (isDoor) put(out.doors, f, 0, 0, 3.5, 7);
      return;
    }
    for (let k = 0; k < storeys; k++) {
      const sill = (kind === 'house' ? 3 : 3.5) + k * STOREY_FT;
      for (let j = 0; j < n; j++) {
        const along = -((n - 1) * step) / 2 + j * step;
        if (isDoor && k === 0 && Math.abs(along) < step * 0.6) continue; // the door's place
        put(out.glass, f, along, sill, winW, kind === 'house' ? 4 : 4.5);
      }
    }
    if (isDoor) put(out.doors, f, 0, 0, kind === 'house' ? 3.2 : 6, 7);
  });
}

/** The collected boxes as two InstancedMeshes in a group named `name`. */
export function facadeMeshes(THREE, out, name, { glass = '#2a3846', door = '#4b4f55' } = {}) {
  const group = new THREE.Group();
  group.name = name;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  for (const [list, color, rough, metal, label] of [[out.glass, glass, 0.2, 0.5, 'glass'], [out.doors, door, 0.6, 0.3, 'doors']]) {
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }), list.length);
    mesh.name = `${name}-${label}`;
    list.forEach(([x, y, z, rot, sx, sy, sz], i) => {
      q.setFromAxisAngle(zAxis, rot);
      m.compose(p.set(x, y, z), q, sc.set(sx, sy, sz));
      mesh.setMatrixAt(i, m);
    });
    group.add(mesh);
  }
  return group;
}
