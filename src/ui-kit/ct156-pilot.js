// The two pilots of the CT-156 model: a dark glossy helmet with its visor housing, the clear visor down with its black
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
 * estimates off Patrick's photos, 12 Oct 2026: a dark gunmetal helmet with the sky on it, a clear visor with a faint
 * smoke tint, black rubber mask with grey-blue valve and cheek windows, a pale grey ribbed hose, a sage vest.
 */
export const CT156_PILOT_SLOTS = Object.freeze([
  { name: 'helmet shell', color: '#353a41', roughness: 0.28, metalness: 0.1, side: 'double', env: 0.9, opacity: 1 },
  { name: 'visor', color: '#b4bec6', roughness: 0.05, metalness: 0.1, side: 'double', env: 1.3, opacity: 0.22 },
  { name: 'mask', color: '#17191c', roughness: 0.55, metalness: 0, side: 'front', env: 0, opacity: 1 },
  { name: 'hose', color: '#9aa0a7', roughness: 0.55, metalness: 0, side: 'front', env: 0, opacity: 1 },
  { name: 'flight suit', color: '#555c43', roughness: 0.85, metalness: 0, side: 'front', env: 0, opacity: 1 },
  { name: 'vest and collar', color: '#7c8467', roughness: 0.85, metalness: 0, side: 'double', env: 0, opacity: 1 },
  { name: 'harness webbing', color: '#1f2224', roughness: 0.8, metalness: 0, side: 'front', env: 0, opacity: 1 },
  { name: 'gloves', color: '#33322c', roughness: 0.8, metalness: 0, side: 'front', env: 0, opacity: 1 },
  { name: 'mask valve and cheek windows', color: '#8d9eab', roughness: 0.45, metalness: 0, side: 'front', env: 0, opacity: 1 },
  { name: 'black hardware', color: '#1a1c1f', roughness: 0.4, metalness: 0.3, side: 'front', env: 0.5, opacity: 1 },
  { name: 'vest panel', color: '#a6b8ba', roughness: 0.85, metalness: 0, side: 'double', env: 0, opacity: 1 },
  { name: 'skin', color: '#c59b81', roughness: 0.65, metalness: 0, side: 'front', env: 0, opacity: 1 },
].map((s) => Object.freeze(s)));

const SLOT = Object.freeze({ helmet: 0, visor: 1, mask: 2, hose: 3, suit: 4, vest: 5, harness: 6, gloves: 7, maskGrey: 8, hardware: 9, panel: 10, skin: 11 });

/**
 * The helmet's shell, half-sizes from its centre (Patrick's photos, 12 Oct 2026, estimates): 11.4 in across (it was
 * 10.8; the photos show a broad shell, wider than it is tall), 12.0 in long (was 12.3, kept clear of the seat's headbox
 * behind it) and the dome's top 5.7 in above the centre (as before, the cockpit's eye points hang off the centre).
 */
const HELMET = Object.freeze({ rx: 0.0218, ry: 0.0205, rz: 0.0205 });
/**
 * The vest's body and the shoulder yoke over the suit's shoulders: centre, half-sizes, all from the helmet's centre
 * (estimates off Patrick's photos, 12 Oct 2026: chest about 15 in wide and 11 in deep, the yoke a broad collar piece).
 */
const VEST = Object.freeze({ cx: 0.001, cz: -0.059, rx: 0.02, ry: 0.0262, rz: 0.0345 });
const YOKE = Object.freeze({ cx: -0.004, cz: -0.0348, rx: 0.014, ry: 0.029, rz: 0.0112 });

const rad = (d) => (d * Math.PI) / 180;
const smooth = (a, b, t) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
/** Where the vest's (or yoke's) surface is, ahead of its middle, at sideways offset y and height z: x, or -Infinity when off it. */
function ellFront(e, y, z) {
  const k = 1 - (y / e.ry) ** 2 - ((z - e.cz) / e.rz) ** 2;
  return k > 0 ? e.cx + e.rx * Math.sqrt(k) : -Infinity;
}
/** The top of the vest and yoke at (x, y): z, or -Infinity when off them. */
function ellTop(e, x, y) {
  const k = 1 - ((x - e.cx) / e.rx) ** 2 - (y / e.ry) ** 2;
  return k > 0 ? e.cz + e.rz * Math.sqrt(k) : -Infinity;
}
// (Off both, 0: inside the body, so a strap that runs off the edge just dips out of sight.)
const chestX = (y, z) => Math.max(ellFront(VEST, y, z), ellFront(YOKE, y, z), 0);
const bodyTop = (x, y) => Math.max(ellTop(VEST, x, y), ellTop(YOKE, x, y), -0.03);

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
  }), SLOT.helmet);
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
  const hosePts = [[0.0224, 0.0058, -0.0252], [0.0218, 0.0092, -0.031]];
  for (const [y, zz] of [[0.0128, -0.041], [0.017, -0.056], [0.0152, -0.07], [0.0104, -0.082], [0.0078, -0.089]]) hosePts.push([chestX(y, zz) + 0.0033, y, zz]);
  add(tube(THREE, hosePts, 0.0028, { ribs: true, rings: 48, radial: 8 }), SLOT.hose);
  add(limb(THREE, [chestX(0.0078, -0.089) + 0.0035, 0.0078, -0.089], [chestX(0.0078, -0.094) + 0.0025, 0.0078, -0.094], 0.0032, 0.0032, 10), SLOT.hardware);

  // Neck, in the vest's collar: a padded roll round the back and sides of the neck, open at the throat.
  add(limb(THREE, [-0.002, 0, -0.013], [-0.003, 0, -0.026], 0.0072, 0.007, 10), SLOT.suit);
  const arc = 1.6 * Math.PI;
  add(new THREE.TorusGeometry(0.0128, 0.0052, 8, 18, arc).rotateZ(Math.PI - arc / 2).scale(1, 1, 1.25).translate(-0.0025, 0, -0.0235), SLOT.vest);

  // Shoulders and chest in the flight suit, the LPSV over them: its yoke over the shoulders and its body on the chest,
  // with the pale panel on the pilot's right.
  ell(-0.006, 0, -0.0345, 0.015, 0.0375, 0.0098, SLOT.suit, 14, 9);
  ell(-0.003, 0, -0.0605, 0.0185, 0.029, 0.0365, SLOT.suit, 14, 9);
  ell(YOKE.cx, 0, YOKE.cz, YOKE.rx, YOKE.ry, YOKE.rz, SLOT.vest, 14, 9);
  ell(VEST.cx, 0, VEST.cz, VEST.rx, VEST.ry, VEST.rz, SLOT.vest, 14, 9);
  const vestPatch = (y0, y1, z0, z1, lift, slot) => add(patch(THREE, 4, 6, (u, v) => {
    const y = y0 + (y1 - y0) * u, zz = z0 + (z1 - z0) * v;
    return [chestX(y, zz) + lift, y, zz];
  }), slot);
  vestPatch(-0.02, -0.0072, -0.044, -0.076, 0.0007, SLOT.panel);
  vestPatch(-0.0207, -0.0197, -0.044, -0.076, 0.0011, SLOT.harness);
  vestPatch(-0.0076, -0.0066, -0.044, -0.076, 0.0011, SLOT.harness);

  // The harness: a shoulder strap each side over the vest down to the buckle, and the chest strap across.
  for (const sd of [1, -1]) {
    const y = sd * 0.0152;
    const pts = [-0.013, -0.006, 0.0, 0.006].map((px) => [px, y, bodyTop(px, y) + 0.0012]);
    for (const zz of [-0.045, -0.062, -0.078, -0.092]) pts.push([chestX(y * (1 + (zz + 0.045) * 10.6), zz) + 0.0013, y * (1 + (zz + 0.045) * 10.6), zz]);
    add(tube(THREE, pts, 0.0019, { rings: 16, radial: 6 }), SLOT.harness);
  }
  const chest = [-0.021, -0.01, 0, 0.01, 0.021].map((y) => [chestX(y, -0.058) + 0.0013, y, -0.058]);
  add(tube(THREE, chest, 0.0017, { rings: 12, radial: 6 }), SLOT.harness);
  add(new THREE.BoxGeometry(0.003, 0.011, 0.0075).translate(chestX(0, -0.058) + 0.0024, 0, -0.058), SLOT.hardware);

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
