// The two pilots of the CT-156 model: a glossy helmet (light grey-white since W27) with its visor housing, the clear visor down with its black
// edge line and side pivots, the oxygen mask with its straps and ribbed hose, the life preserver survival vest (LPSV),
// the harness and the arms (Patrick, 12 Oct 2026: "improve the character model and helmet shape (include the LPSV vest
// and the proper helmet/visor shape)", with three photos of a pilot in flight: front and rear views of the helmet, the
// clear visor down, the mask and its hose). Every size and colour here is an estimate off Patrick's photos, 12 Oct 2026.
//
// Axes as the model's: nose +X, left +Y, up +Z, in model units (1 unit is about 277.8 in, so 0.001 is 0.28 in).
// It imports nothing from ct156-model.js (the model imports this file): ct156-model.js joins the parts into one
// geometry (one group per slot) and builds the materials from CT156_PILOT_SLOTS.

/**
 * The paint of each pilot slot, in the order of the model's `pilot` materials (plain data; `side` front or double,
 * `env` the sky reflection's strength, 0 for none, `opacity` below 1 for see-through). Colours and shininess are
 * estimates off Patrick's photos, 12 Oct 2026 (the first set; the later ones are below): a dark gunmetal helmet with the sky on it, a clear visor with a faint
 * smoke tint, black rubber mask with grey-blue valve and cheek windows, a pale grey ribbed hose, a sage vest.
 * Chunk 7's colours (3d-work #72, Patrick's rulings H1, H2, H6, H7, 13 Oct 2026; imported with delivery ct156-2026-10-13-17f0c75): the shell light sage grey #8e978d (was #353a41), the
 * visor dark #101316 and nearly opaque (0.92; was clear #b4bec6 at 0.22), the flight suit brighter olive #7a8535 (was #555c43), the vest pale grey-sage #a9b1a2 (was #7c8467), the
 * webbing pale grey-green #9ca59a (was #1f2224), and a new silver slot (#c2c5c9, metalness 0.8, roughness 0.3: an estimate off photo H06's buckles) for the harness buckles.
 * Then the shell light grey-white #cfd2d0 (W27, Patrick 17 Oct 2026, the look audit's Q5: photos H04, A24, A22; was #8e978d).
 */
export const CT156_PILOT_SLOTS = Object.freeze([
  { name: 'helmet shell', color: '#cfd2d0', roughness: 0.28, metalness: 0.1, side: 'double', env: 0.9, opacity: 1 },
  { name: 'visor', color: '#101316', roughness: 0.05, metalness: 0.1, side: 'double', env: 1.3, opacity: 0.92 },
  { name: 'mask', color: '#17191c', roughness: 0.55, metalness: 0, side: 'front', env: 0, opacity: 1 },
  { name: 'hose', color: '#9aa0a7', roughness: 0.55, metalness: 0, side: 'front', env: 0, opacity: 1 },
  { name: 'flight suit', color: '#7a8535', roughness: 0.85, metalness: 0, side: 'front', env: 0, opacity: 1 },
  { name: 'vest and collar', color: '#a9b1a2', roughness: 0.85, metalness: 0, side: 'double', env: 0, opacity: 1 },
  { name: 'harness webbing', color: '#9ca59a', roughness: 0.8, metalness: 0, side: 'front', env: 0, opacity: 1 },
  { name: 'gloves', color: '#33322c', roughness: 0.8, metalness: 0, side: 'front', env: 0, opacity: 1 },
  { name: 'mask valve and cheek windows', color: '#8d9eab', roughness: 0.45, metalness: 0, side: 'front', env: 0, opacity: 1 },
  { name: 'black hardware', color: '#1a1c1f', roughness: 0.4, metalness: 0.3, side: 'front', env: 0.5, opacity: 1 },
  { name: 'vest panel', color: '#a6b8ba', roughness: 0.85, metalness: 0, side: 'double', env: 0, opacity: 1 },
  { name: 'skin', color: '#c59b81', roughness: 0.65, metalness: 0, side: 'front', env: 0, opacity: 1 },
  { name: 'silver buckles', color: '#c2c5c9', roughness: 0.3, metalness: 0.8, side: 'front', env: 0.6, opacity: 1 },
].map((s) => Object.freeze(s)));

const SLOT = Object.freeze({ helmet: 0, visor: 1, mask: 2, hose: 3, suit: 4, vest: 5, harness: 6, gloves: 7, maskGrey: 8, hardware: 9, panel: 10, skin: 11, silver: 12 });

/**
 * The helmet's shell, half-sizes from its centre (Patrick's photos, 12 Oct 2026, estimates): 11.4 in across (it was
 * 10.8; the photos show a broad shell, wider than it is tall), 12.0 in long (was 12.3, kept clear of the seat's headbox
 * behind it) and the dome's top 5.7 in above the centre (as before, the cockpit's eye points hang off the centre).
 */
const HELMET = Object.freeze({ rx: 0.0218, ry: 0.0205, rz: 0.0205 });
/**
 * The chest and the shoulders over it, from the helmet's centre, units (H5, 3d-work #72; sizes estimates off photo H06): the flight suit's chest a squarer block in place of the
 * ellipsoid and the vest's egg over it (VEST and YOKE are gone: two bands lie on it instead, BANDS): 10 in deep, 16.6 in across and 20.3 in tall, centred where the code's was (16.8 in
 * below the helmet's centre), squared across and up (power 3: |y/ry|^3 + |z/rz|^3 + (x/rx)^2 = 1). The shoulders are the code's ellipsoid, kept.
 */
const CHEST = Object.freeze({ cx: -0.003, cz: -0.0605, rx: 0.018, ry: 0.02988, rz: 0.03654, power: 3 });
const SHOULDERS = Object.freeze({ cx: -0.006, cz: -0.0345, rx: 0.015, ry: 0.0375, rz: 0.0098 });
/**
 * The vest's two padded bands (H5; 3d-work #72): 5.0 in wide and 1.25 in thick, rounded (power 3), their middles 4.25 in either side (8.5 in apart, a 3.5 in gap with the suit and
 * hose showing), lying on the chest from 21 in below the helmet's centre up over the shoulders and down the back to 150 degrees round from dead ahead about a line 1.5 in behind and
 * 12 in below the centre. The harness webbing (H6): 2 in wide, 0.2 in thick, one strap each side centred 5.6 in out over the bands' outer edges, from the same low point up and over
 * the shoulder; a silver buckle 2.5 by 3.5 in and 0.3 in thick on each strap on the upper chest (13 in below the centre) and one 2.5 by 2.0 in at the shoulder's front (the second
 * buckle's height is an estimate). All sizes in inches / 277.8.
 */
const IN = 1 / 277.8;
const BANDS = Object.freeze({ w: 5.0 * IN, t: 1.25 * IN, mid: 4.25 * IN, from: -21 * IN, endDeg: 150, pivot: Object.freeze([-1.5 * IN, -12 * IN]) });
const WEBBING = Object.freeze({ w: 2 * IN, t: 0.2 * IN, mid: 5.6 * IN, endDeg: 115, buckle: Object.freeze({ chest: Object.freeze({ z: -13 * IN, w: 2.5 * IN, h: 3.5 * IN, t: 0.3 * IN }), shoulder: Object.freeze({ z: -7 * IN, w: 2.5 * IN, h: 2.0 * IN, t: 0.3 * IN }) }) });

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const smooth = (a, b, t) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
/** How far into the squared chest (0 on its surface, below 1 inside) the point is. */
const chestK = (x, y, z) => ((x - CHEST.cx) / CHEST.rx) ** 2 + Math.abs(y / CHEST.ry) ** CHEST.power + Math.abs((z - CHEST.cz) / CHEST.rz) ** CHEST.power;
/** Whether the point is inside the chest or the shoulders. */
const inBody = (x, y, z) => chestK(x, y, z) < 1 || (((x - SHOULDERS.cx) / SHOULDERS.rx) ** 2 + (y / SHOULDERS.ry) ** 2 + ((z - SHOULDERS.cz) / SHOULDERS.rz) ** 2 < 1);
/** Where the chest's surface is, ahead of its middle, at sideways offset y and height z: x, or -Infinity when off it. */
function chestFront(y, z) {
  const k = 1 - Math.abs(y / CHEST.ry) ** CHEST.power - Math.abs((z - CHEST.cz) / CHEST.rz) ** CHEST.power;
  return k > 0 ? CHEST.cx + CHEST.rx * Math.sqrt(k) : -Infinity;
}
/** Where the shoulders' surface is ahead of their middle at y, z: x, or -Infinity when off it. */
function shouldersFront(y, z) {
  const k = 1 - (y / SHOULDERS.ry) ** 2 - ((z - SHOULDERS.cz) / SHOULDERS.rz) ** 2;
  return k > 0 ? SHOULDERS.cx + SHOULDERS.rx * Math.sqrt(k) : -Infinity;
}
/** The top of the chest and the shoulders at (x, y): z, or -Infinity when off them. */
function bodyTopOf(x, y) {
  const kc = 1 - ((x - CHEST.cx) / CHEST.rx) ** 2 - Math.abs(y / CHEST.ry) ** CHEST.power;
  const ks = 1 - ((x - SHOULDERS.cx) / SHOULDERS.rx) ** 2 - (y / SHOULDERS.ry) ** 2;
  return Math.max(kc > 0 ? CHEST.cz + CHEST.rz * kc ** (1 / CHEST.power) : -Infinity, ks > 0 ? SHOULDERS.cz + SHOULDERS.rz * Math.sqrt(ks) : -Infinity);
}
// (Off both, 0: inside the body, so a strap that runs off the edge just dips out of sight.)
const chestX = (y, z) => Math.max(chestFront(y, z), shouldersFront(y, z), 0);
const bodyTop = (x, y) => Math.max(bodyTopOf(x, y), -0.03);
// ---- small shape helpers (this file's own; the model's are not imported) ----

/** An ellipsoid with its poles up, centred at (cx, cy, cz). */
function ellipsoid(THREE, cx, cy, cz, rx, ry, rz, nu = 14, nv = 9) {
  const g = new THREE.SphereGeometry(1, nu, nv).rotateX(Math.PI / 2);
  g.scale(rx, ry, rz);
  return g.translate(cx, cy, cz);
}

/**
 * A smooth surface from a grid of points, f(u, v) giving [x, y, z] for u and v from 0 to 1. `closed` joins the last
 * column back to the first (a full turn round) so the shading has no seam. The front faces the way u runs round
 * to the pilot's left and v runs down, as the helmet's own surfaces are drawn.
 */
function patch(THREE, nu, nv, f, closed = false) {
  const cols = closed ? nu : nu + 1;
  const pos = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) pos.push(...f(i / nu, j / nv));
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const i2 = closed ? (i + 1) % nu : i + 1;
      const a = j * cols + i, b = (j + 1) * cols + i, c = j * cols + i2, d = (j + 1) * cols + i2;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The squared chest (CHEST): a surface of |y/ry|^p + |z/rz|^p + (x/rx)^2 = 1, p 3, found along each direction from its middle. */
function chestBlock(THREE, nu = 24, nv = 16) {
  const { cx, cz, rx, ry, rz, power: p } = CHEST;
  return patch(THREE, nu, nv, (u, v) => {
    const az = -Math.PI + 2 * Math.PI * u, th = Math.PI * v;
    const d = [Math.sin(th) * Math.cos(az), Math.sin(th) * Math.sin(az), Math.cos(th)];
    const a = (d[0] / rx) ** 2, b = Math.abs(d[1] / ry) ** p + Math.abs(d[2] / rz) ** p;
    let t = 1 / Math.sqrt(a + b + 1e-12);
    for (let i = 0; i < 6; i++) t -= (a * t * t + b * t ** p - 1) / (2 * a * t + p * b * t ** (p - 1) + 1e-12); // Newton on a t^2 + b t^p = 1
    return [cx + d[0] * t, d[1] * t, cz + d[2] * t];
  }, true);
}

/**
 * A padded strip lying on the body (the vest's bands, the webbing): `w` wide across (y from yc - w/2 to yc + w/2), `t` thick with rounded edges, rising `lift(y)` more off the
 * body, following it from the line (x0, z0)'s ray at `fromDeg` round to `toDeg` (0 ahead, 90 up, counted up and aft). The ray from the pivot is marched out to where it leaves the
 * body at each y, so the strip hugs the chest and the shoulders.
 */
function bodyStrip(THREE, { yc, w, t, lift = () => 0, fromDeg, toDeg, pivot }) {
  const outAt = (th, y) => {
    const cx = Math.cos(th), cz = Math.sin(th);
    let lo = 0.0005, hi = 0.09;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inBody(pivot[0] + cx * mid, y, pivot[1] + cz * mid)) lo = mid; else hi = mid;
    }
    return lo;
  };
  return patch(THREE, 8, 36, (u, v) => {
    const th = rad(toDeg + (fromDeg - toDeg) * v), y = yc - w / 2 + w * u; // v runs down, so the faces look outward (as the helmet's patches)
    const edge = (1 - Math.abs(2 * u - 1) ** 6) ** (1 / 6); // rounded edges: the strip's thickness falls to nothing at its sides
    const r = outAt(th, y) + 0.0002 + lift(y) + t * edge;
    return [pivot[0] + Math.cos(th) * r, y, pivot[1] + Math.sin(th) * r];
  });
}

/** A tapered round piece from a to b, r0 at a and r1 at b. */
function limb(THREE, a, b, r0, r1, seg = 10) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const g = new THREE.CylinderGeometry(r1, r0, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
}

/** A tube along the points; every other ring pinched in and pushed out when `ribs` (the ribbed hose). */
function tube(THREE, pts, r, { ribs = false, rings = 16, radial = 6 } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)));
  const g = new THREE.TubeGeometry(curve, rings, r, radial, false);
  if (ribs) {
    const pos = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i <= rings; i++) {
      const c = curve.getPointAt(i / rings), k = i % 2 ? 1.25 : 0.85;
      for (let j = 0; j <= radial; j++) {
        const m = i * (radial + 1) + j;
        v.fromBufferAttribute(pos, m).sub(c).multiplyScalar(k).add(c);
        pos.setXYZ(m, v.x, v.y, v.z);
      }
    }
    g.computeVertexNormals();
  }
  return g;
}

/** A point on the helmet's shell, `s` times its size: azimuth az (0 ahead, positive to the left), theta down from the top. */
const onShell = (az, th, s = 1) => [s * HELMET.rx * Math.sin(th) * Math.cos(az), s * HELMET.ry * Math.sin(th) * Math.sin(az), s * HELMET.rz * Math.cos(th)];
/**
 * The shell's lower edge, as theta down from the top at azimuth a degrees off dead ahead (estimates off Patrick's
 * photos, 12 Oct 2026): a brow line over the face 68 degrees down, dropping down the temples to the ear and jaw
 * (122 degrees) and a little lower at the nape (126): the face is open below the brow, the mask closes it.
 */
const rimTheta = (a) => rad(68 + (122 - 68) * smooth(28, 74, a) + 4 * smooth(100, 180, a));
/** The visor housing's lower edge (the black lip) and the visor's lower edge, theta down from the top at azimuth a degrees. */
const housingTheta = (a) => rad(70 + 10 * smooth(0, 90, a));
const visorTheta = (a) => rad(108 - 14 * (a / 90) ** 2);

/**
 * A pilot in a seat for a helmet centred at (x, 0, z): the parts as [{ geometry, materials: [slot] }], slots as
 * CT156_PILOT_SLOTS. Sitting up looking ahead: the shell with the visor housing across the brow and the ear cups, the
 * clear visor down with its black edge line and the two pivots at the sides, the face and the mask (black body, grey-blue
 * cheek windows and valve on the pilot's right, the black block below, the straps to the helmet's sides), the ribbed
 * hose down the pilot's LEFT to the connector on the harness (Patrick's ruling; the photos may be mirrored), the
 * neck in the vest's collar, the flight suit's shoulders and chest under the LPSV (sage, with its pale side
 * panel), the harness webbing, and the arms: the right hand on the stick, the left on the power lever (the hands are
 * where they were; the shoulders and arms are reshaped). The legs, under the cockpit's sill and behind the seats, are left out.
 * Sizes and colours estimates off Patrick's photos, 12 Oct 2026.
 */
export function ct156PilotParts(THREE, x, z) {
  const parts = [];
  const add = (geometry, slot) => parts.push({ geometry: geometry.translate(x, 0, z), materials: [slot] });
  const ell = (cx, cy, cz, rx, ry, rz, slot, nu, nv) => add(ellipsoid(THREE, cx, cy, cz, rx, ry, rz, nu, nv), slot);

  // The helmet: the shell with its open face, and the visor housing's raised cover across the brow and the top of the
  // front, ending in a black lip over the visor.
  add(patch(THREE, 40, 14, (u, v) => {
    const az = -Math.PI + 2 * Math.PI * u;
    return onShell(az, v * rimTheta(Math.abs(az) * (180 / Math.PI)));
  }, true), SLOT.helmet);
  const housingAz = rad(100);
  add(patch(THREE, 28, 5, (u, v) => {
    const az = -housingAz + 2 * housingAz * u, a = Math.abs(az) * (180 / Math.PI);
    const th = rad(24) + v * (housingTheta(a) - rad(24));
    // Raised 4.5% off the shell, easing down to the shell along the cover's top and its two ends.
    return onShell(az, th, 1 + 0.045 * smooth(0, 0.14, u) * smooth(0, 0.14, 1 - u) * smooth(0, 0.3, v));
  }), SLOT.hardware); // H1/H2 (3d-work #72): the visor housing dark, with a dark crown cover over the top (below)
  add(patch(THREE, 40, 6, (u, v) => {
    const az = -Math.PI + 2 * Math.PI * u;
    return onShell(az, v * rad(50), 1.03 - 0.03 * smooth(0.8, 1, v)); // the crown cover, a little proud of the shell, down 50 degrees from the top (an estimate off H05 and H07)
  }, true), SLOT.hardware);
  add(patch(THREE, 28, 1, (u, v) => {
    const az = -rad(96) + 2 * rad(96) * u, a = Math.abs(az) * (180 / Math.PI);
    const th = housingTheta(a);
    return onShell(az, th - rad(5) * (1 - v), 1.07 - 0.02 * smooth(88, 96, a));
  }), SLOT.hardware);
  // The ear cups: filling the helmet's sides down to the jaw.
  for (const sd of [1, -1]) ell(-0.0015, sd * 0.015, -0.005, 0.007, 0.004, 0.0085, SLOT.helmet, 10, 7);

  // The visor, clear, down over the face: from under the housing's lip to its lower edge, curling round to a pivot
  // each side; a thin black line along its lower edge.
  const visorAz = rad(94);
  add(patch(THREE, 28, 8, (u, v) => {
    const az = -visorAz + 2 * visorAz * u, a = Math.abs(az) * (180 / Math.PI);
    return onShell(az, housingTheta(a) - rad(3) + v * (visorTheta(a) - housingTheta(a) + rad(3)), 1.032);
  }), SLOT.visor);
  add(patch(THREE, 28, 1, (u, v) => {
    const az = -visorAz + 2 * visorAz * u, a = Math.abs(az) * (180 / Math.PI);
    return onShell(az, visorTheta(a) - rad(2.2) * (1 - v), 1.04);
  }), SLOT.hardware);
  // The pivots and the black brackets running down from them.
  for (const sd of [1, -1]) {
    add(new THREE.CylinderGeometry(0.0046, 0.0046, 0.003, 14).translate(0.0005, sd * 0.0219, 0.0005), SLOT.hardware);
    add(new THREE.CylinderGeometry(0.0026, 0.0026, 0.0044, 10).translate(0.0005, sd * 0.0223, 0.0005), SLOT.hardware);
    add(new THREE.BoxGeometry(0.003, 0.0014, 0.0095).translate(0.0008, sd * 0.0205, -0.0055), SLOT.hardware);
    // The mask's bayonet receiver on the helmet's cheek.
    add(new THREE.CylinderGeometry(0.0019, 0.0019, 0.0045, 10).rotateZ(Math.PI / 2).translate(0.0098, sd * 0.0162, -0.0098), SLOT.hardware);
  }

  // The face, under the clear visor: a simple head, the forehead and eyes above the mask.
  ell(0.0045, 0, -0.004, 0.0135, 0.0118, 0.015, SLOT.skin, 16, 10);

  // The mask: the black body with its nose bridge up between the eyes, the grey-blue cheek windows, the black block
  // below, the grey-blue valve low on the pilot's right, and the straps to the helmet's sides with a buckle each.
  ell(0.0165, 0, -0.0105, 0.0062, 0.0105, 0.0085, SLOT.mask, 16, 10);
  ell(0.0172, 0, -0.0068, 0.0042, 0.0028, 0.0052, SLOT.mask, 10, 8);
  for (const sd of [1, -1]) ell(0.0216, sd * 0.0047, -0.0085, 0.0012, 0.0028, 0.0042, SLOT.maskGrey, 10, 6);
  add(new THREE.BoxGeometry(0.004, 0.0072, 0.005).translate(0.0232, 0, -0.0158), SLOT.hardware);
  add(new THREE.CylinderGeometry(0.0036, 0.0036, 0.0075, 14).rotateZ(-Math.PI / 2).rotateZ(rad(12)).translate(0.0215, -0.0104, -0.0128), SLOT.maskGrey);
  add(new THREE.CylinderGeometry(0.0021, 0.0021, 0.0008, 12).rotateZ(-Math.PI / 2).rotateZ(rad(12)).translate(0.0258, -0.0113, -0.0128), SLOT.mask);
  for (const sd of [1, -1]) {
    add(tube(THREE, [[0.0148, sd * 0.0105, -0.0088], [0.0126, sd * 0.0138, -0.0094], [0.0098, sd * 0.0162, -0.0098], [0.0, sd * 0.0188, -0.0098]], 0.0012, { rings: 12, radial: 5 }), SLOT.mask);
    add(new THREE.BoxGeometry(0.0032, 0.0014, 0.0034).translate(0.0124, sd * 0.0139, -0.0094), SLOT.hardware);
  }

  // The hose: the black connector under the mask on the pilot's left, then the ribbed hose down the left of the chest
  // to the connector on the harness (it lies along the vest's front).
  add(limb(THREE, [0.0225, 0.005, -0.0178], [0.0224, 0.0055, -0.0252], 0.0033, 0.0033, 10), SLOT.hardware);
  // H8 (3d-work #72): the hose lies on the chest between the bands, 0.55 in left of the middle, to a dark connector 2.2 in across 23 in below the helmet's centre (it ran down the left side).
  const hy = 0.55 * IN, hosePts = [[0.0224, 0.0058, -0.0252], [0.0218, 0.0052, -0.031]];
  for (const zz of [-0.041, -0.056, -0.07, -0.0795]) hosePts.push([chestX(hy, zz) + 0.0036, hy, zz]);
  add(tube(THREE, hosePts, 0.0028, { ribs: true, rings: 48, radial: 8 }), SLOT.hose);
  add(limb(THREE, [chestX(hy, -0.0795) + 0.0038, hy, -0.0795], [chestX(hy, -0.0835) + 0.003, hy, -0.0835], 0.0040, 0.0040, 10), SLOT.hardware);

  // Neck, in the vest's collar: a padded roll round the back and sides of the neck, open at the throat.
  add(limb(THREE, [-0.002, 0, -0.013], [-0.003, 0, -0.026], 0.0072, 0.007, 10), SLOT.suit);
  const arc = 1.6 * Math.PI;
  add(new THREE.TorusGeometry(0.0128, 0.0052, 8, 18, arc).rotateZ(Math.PI - arc / 2).scale(1, 1, 1.25).translate(-0.0025, 0, -0.0235), SLOT.vest);

  // Shoulders and chest in the flight suit, the LPSV's two padded bands lying on them (H5: the vest's egg and the yoke are gone), and the harness webbing over the bands
  // with its silver buckles (H6).
  ell(SHOULDERS.cx, 0, SHOULDERS.cz, SHOULDERS.rx, SHOULDERS.ry, SHOULDERS.rz, SLOT.suit, 14, 9);
  add(chestBlock(THREE), SLOT.suit);
  const bandPivot = BANDS.pivot, bandThick = (y) => { // how far the band under y rises off the body there (the webbing lies on it)
    for (const sd of [1, -1]) {
      const u = (y - (sd * BANDS.mid - BANDS.w / 2)) / BANDS.w;
      if (u >= 0 && u <= 1) return BANDS.t * (1 - Math.abs(2 * u - 1) ** 6) ** (1 / 6);
    }
    return 0;
  };
  const bandFromDeg = (yc) => deg(Math.atan2(BANDS.from - bandPivot[1], chestX(yc, BANDS.from) - bandPivot[0]));
  for (const sd of [1, -1]) {
    const yc = sd * BANDS.mid;
    add(bodyStrip(THREE, { yc, w: BANDS.w, t: BANDS.t, fromDeg: bandFromDeg(yc), toDeg: BANDS.endDeg, pivot: bandPivot }), SLOT.vest);
    const yw = sd * WEBBING.mid;
    add(bodyStrip(THREE, { yc: yw, w: WEBBING.w, t: WEBBING.t, lift: (y) => bandThick(y) + 0.0004, fromDeg: bandFromDeg(yw), toDeg: WEBBING.endDeg, pivot: bandPivot }), SLOT.harness);
    // The silver buckles on the strap, flat on the chest.
    for (const { z, w, h, t } of Object.values(WEBBING.buckle)) {
      const yb = yw, xb = chestX(yb, z) + bandThick(yb) + WEBBING.t + 0.0006 + t / 2;
      add(new THREE.BoxGeometry(t, w, h).translate(xb, yb, z), SLOT.silver);
    }
  }

  // The arms: each from a shoulder joint to the elbow and on to the glove; the right hand on the stick, the left on the
  // power lever (the hands' places are as before).
  const arm = (sd, hand) => {
    const sh = [-0.006, sd * 0.035, -0.0405], el = [0.004, sd * 0.036, -0.085];
    ell(...sh, 0.0098, 0.0098, 0.0098, SLOT.suit, 10, 7);
    add(limb(THREE, sh, el, 0.0088, 0.0074, 10), SLOT.suit);
    ell(...el, 0.0072, 0.0072, 0.0072, SLOT.suit, 10, 7);
    add(limb(THREE, el, hand, 0.0072, 0.0056, 10), SLOT.suit);
    ell(hand[0] + 0.004, hand[1], hand[2], 0.0065, 0.0045, 0.0055, SLOT.gloves, 12, 8);
  };
  arm(-1, [0.05, -0.006, -0.1]);
  arm(1, [0.036, 0.036, -0.092]);
  return parts;
}
