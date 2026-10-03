// 15 Wing Moose Jaw (CYMJ) 3D Airfield Scenery & Landmarks (D138, D141, D373, D378, D411).
// Procedural 3D models for the north flight line: the CYMJ Control Tower, the arch/barrel flight-line
// hangars, and three more buildings, each painted with a small canvas texture and given a label sprite.
//
// Coordinates & Aerodrome Context:
// - Local origin (0, 0) is Moose Jaw ARP: Lat 50.3303Â° N, Lon -105.5592Â° W.
// - Runway 29L threshold: (X = 3104 ft, Y = -3194 ft), departure end: (X = -4066 ft, Y = 680 ft).
// - Runway heading: 298Â° true.
// - The flight line / apron / hangars sit NORTH of the parallel runways (Y about 2,400 to 4,000 ft),
//   placed against the satellite photo.
// - Field elevation: 1880 ft MSL (floor default).
// - World frame: X east, Y north, Z up (altitude in feet).
//
// Textures and sprites need a canvas, so they exist only in a browser; with no document (the Node
// tests) every building falls back to plain colours and no sprites are made.

export const DEFAULT_FLOOR_FT = 1880;

export const CYMJ_ARP = Object.freeze({
  lat: 50.3303,
  lon: -105.5592,
});

export const CYMJ_RUNWAY_29L = Object.freeze({
  headingDeg: 298,
  threshold: Object.freeze({ x: 3104, y: -3194 }),
  departure: Object.freeze({ x: -4066, y: 680 }),
});

export const CYMJ_APRON_BOUNDS = Object.freeze({
  minX: -600,
  maxX: 2600,
  minY: 2000,
  maxY: 3600,
});

const towerCoord = Object.freeze({
  id: 'control-tower',
  name: 'CYMJ Control Tower',
  type: 'tower',
  x: 30,
  y: 2575,
});

const hangarCoords = Object.freeze([
  Object.freeze({ id: 'hangar-1', name: 'Hangar 1', type: 'hangar', x: 340, y: 2640 }),
  Object.freeze({ id: 'hangar-2', name: 'Hangar 2', type: 'hangar', x: 680, y: 2575 }),
  Object.freeze({ id: 'hangar-3', name: 'Hangar 3', type: 'hangar', x: 1090, y: 2535 }),
  Object.freeze({ id: 'hangar-4', name: 'Arch Hangar 4', type: 'hangar', x: 1616, y: 2465, halfWidth: 55, depth: 160 }),
]);

const allBuildingCoords = Object.freeze([towerCoord, ...hangarCoords]);

/** Exact positions of 1 Control Tower and 4 Arch Hangars at 15 Wing Moose Jaw. */
export const CYMJ_BUILDING_COORDS = Object.freeze({
  tower: towerCoord,
  hangars: hangarCoords,
  all: allBuildingCoords,
  [Symbol.iterator]: function* () {
    for (const b of allBuildingCoords) yield b;
  },
});

/**
 * More buildings, traced from Patrick's red outlines on the 3D screenshot (3 Oct), so each model sits on its roof in
 * the satellite photo (about 20 ft). Footprints are [x, y] in feet round the building's centre, north-up.
 */
export const CYMJ_EXTRA_BUILDINGS = Object.freeze([
  Object.freeze({
    id: 'main-building', name: 'Glass Palace (2 CFFTS HQ)', type: 'building', x: 912, y: 3160, height: 52,
    footprint: Object.freeze([[-60, -178], [-95, -50], [-147, 6], [-146, 102], [-53, 212], [63, 126], [78, 75]]),
    glassCurve: Object.freeze([[160, 73], [190, -60], [150, -170], [16, -223]]),
    badge: Object.freeze([20, 10]),
    roof: '#d8dadc', wall: '#c9ccd0', accent: '#c8102e',
  }),
  Object.freeze({
    id: 'barracks-u', name: 'Student Barracks', type: 'barracks', x: -120, y: 3550, height: 34, rotation: -0.22,
    roof: '#0d9488', wall: '#f1f5f9', accent: '#0f766e',
  }),
  Object.freeze({
    id: 'athletic-field', name: 'Athletic Field', type: 'field', x: 180, y: 3520, height: 1, rotation: -0.22,
  }),
  Object.freeze({
    id: 'base-rec-center', name: 'Base Fitness & Rec Centre', type: 'building', x: 309, y: 3381, height: 34,
    footprint: Object.freeze([[-129, 94], [126, 53], [128, -102], [-125, -45]]),
    roof: '#d6d8db', wall: '#e2e8f0', accent: '#3b82f6',
  }),
  Object.freeze({
    id: 'hangar-5', name: 'Hangar 5', type: 'building', x: 2117, y: 3118, height: 48,
    footprint: Object.freeze([[-159, 194], [157, 47], [174, -190], [-173, -51]]),
    roof: '#9aa3ad', wall: '#e7ebef', accent: '#1d4ed8',
  }),
  Object.freeze({
    id: 'hangar-6', name: 'Hangar 6', type: 'building', x: 2311, y: 3439, height: 48,
    footprint: Object.freeze([[-141, 204], [157, 62], [140, -201], [-158, -67]]),
    roof: '#9aa3ad', wall: '#e7ebef', accent: '#0f766e',
  }),
]);

// The look of each hangar: a little different, so a row of four is not four copies.
const HANGAR_LOOKS = Object.freeze([
  Object.freeze({ tint: '#ffffff', accent: '#c8102e' }),
  Object.freeze({ tint: '#e6f0ff', accent: '#1d4ed8' }),
  Object.freeze({ tint: '#fff2ec', accent: '#c8102e' }),
  Object.freeze({ tint: '#e8fff5', accent: '#0f766e' }),
]);

// ---------------------------------------------------------------------------
// Canvas textures and label sprites (browser only)

function canvasTexture(THREE, width, height, draw, repeat = null) {
  const doc = globalThis.document;
  if (!doc?.createElement) return null;
  const canvas = doc.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }
  return texture;
}

const ROOF_BADGE_HANGAR_ID = 'hangar-2';
const BADGE_ASPECT = 600 / 520;

/** Makes the near-white background of the badge image transparent (flood fill from the edges). */
function keyOutWhite(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (seen[i]) return;
    const p = i * 4;
    if (d[p] > 225 && d[p + 1] > 225 && d[p + 2] > 225) { seen[i] = 1; stack.push(x, y); }
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const y = stack.pop(); const x = stack.pop();
    d[(y * w + x) * 4 + 3] = 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  ctx.putImageData(img, 0, 0);
}

/** The Bandit Moose Jaw badge, bent over the crown of a barrel roof (white background removed). */
function createRoofBadge(THREE, halfWidth, height) {
  const doc = globalThis.document;
  if (!doc?.createElement || typeof globalThis.Image === 'undefined') return null;
  const canvas = doc.createElement('canvas');
  canvas.width = 520;
  canvas.height = 600;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const img = new globalThis.Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, 520, 600);
    try { keyOutWhite(ctx, 520, 600); } catch { /* keep the image as-is */ }
    texture.needsUpdate = true;
  };
  const base = (typeof import.meta !== 'undefined' && /** @type {any} */ (import.meta).env?.BASE_URL) || '/';
  img.src = `${base}media/bandit-badge.png`;

  const w = halfWidth * 1.2;
  const h = w * BADGE_ASPECT;
  const geo = new THREE.PlaneGeometry(w, h, 12, 4);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = -pos.getX(i); // turned 180 deg: image top points to the hangar's back (north)
    const y = -pos.getY(i);
    const s = Math.min(0.999, Math.abs(x) / halfWidth);
    pos.setXYZ(i, x, y, height * Math.sqrt(1 - s * s) + 0.6);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `${ROOF_BADGE_HANGAR_ID}-roof-badge`;
  return mesh;
}

/** Corrugated silver-blue metal: ribs across the arch (the bands run round the barrel). */
function drawRoof(ctx, w, h) {
  ctx.fillStyle = '#aebccb';
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 8) {
    ctx.fillStyle = '#9aabbd';
    ctx.fillRect(0, y, w, 4);
    ctx.fillStyle = '#cfdae5';
    ctx.fillRect(0, y + 4, w, 1);
  }
}

/** A steel sliding door: panel seams and a yellow-and-black hazard strip along the foot. */
function drawDoor(ctx, w, h) {
  ctx.fillStyle = '#56657a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#44536a';
  for (let x = 0; x < w; x += w / 6) ctx.fillRect(x, 0, 3, h);
  ctx.fillStyle = '#6b7b91';
  ctx.fillRect(0, h * 0.5 - 1, w, 2);
  const stripe = 14;
  for (let x = -h; x < w; x += stripe * 2) {
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + stripe, h);
    ctx.lineTo(x + stripe + 12, h - 12);
    ctx.lineTo(x + 12, h - 12);
    ctx.closePath();
    ctx.fill();
  }
}

/** The tower shaft: pale concrete, floor joints, rows of dark windows near the top and a red band. */
function drawShaft(ctx, w, h) {
  ctx.fillStyle = '#f1f3f5';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#d3d9de';
  for (let y = 0; y < h; y += 32) ctx.fillRect(0, y, w, 2);
  const segment = w / 8;
  ctx.fillStyle = '#26323f';
  for (let k = 0; k < 8; k++) {
    for (const y of [22, 62]) ctx.fillRect(k * segment + segment * 0.32, y, segment * 0.36, 18);
  }
  ctx.fillStyle = '#c8102e';
  ctx.fillRect(0, h * 0.62, w, h * 0.09);
}

/** The glass cab: sky-blue glass with a mullion on every corner of the octagon and a mid rail. */
function drawCab(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#9bd6f5');
  g.addColorStop(1, '#2f86bd');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1f2a37';
  const segment = w / 8;
  for (let k = 0; k < 8; k++) ctx.fillRect(k * segment, 0, 4, h);
  ctx.fillRect(0, h * 0.5 - 2, w, 4);
}

/** The Glass Palace curved curtain wall: blue-tinted glass with window mullions and floor lines. */
function drawCurvedGlass(ctx, w, h) {
  ctx.fillStyle = '#62a8d3';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 3;
  for (let x = 0; x <= w; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

const BIG2_ASPECT = 266 / 226;

/** The Big 2 (2 CFFTS - Best in the West) patch decal on the Glass Palace roof (white background keyed out). */
function createBig2Badge(THREE, diameter) {
  const doc = globalThis.document;
  if (!doc?.createElement || typeof globalThis.Image === 'undefined') return null;
  const canvas = doc.createElement('canvas');
  canvas.width = 452;
  canvas.height = 532;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const img = new globalThis.Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, 452, 532);
    try { keyOutWhite(ctx, 452, 532); } catch { /* keep as-is */ }
    texture.needsUpdate = true;
  };
  const base = (typeof import.meta !== 'undefined' && /** @type {any} */ (import.meta).env?.BASE_URL) || '/';
  img.src = `${base}media/big2-badge.png`;

  const geo = new THREE.PlaneGeometry(diameter, diameter * BIG2_ASPECT);
  const mat = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'glass-palace-big2-badge';
  return mesh;
}

/** Floating name labels over the buildings; switched off at Patrick's request (3 Oct). */
const SHOW_LABELS = false;

/** A name plate that always faces the camera: dark panel, a colour bar and the name. */
function makeLabel(THREE, text, accent, widthFt = 460) {
  if (!SHOW_LABELS) return null;
  const texture = canvasTexture(THREE, 512, 128, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(8, 18, 28, 0.84)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 14, h);
    ctx.fillStyle = '#f5f8fb';
    ctx.font = '700 54px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, h / 2 + 2);
  });
  if (!texture) return null;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, fog: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(widthFt, widthFt / 4, 1);
  sprite.renderOrder = 20;
  sprite.name = `label-${text}`;
  return sprite;
}

/** Dormitory wall with 3 floors of windows, frames, and concrete spandrels. */
function drawBarracksWall(ctx, w, h) {
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, 0, w, h);
  const floorH = h / 3;
  const winW = 14;
  const winH = floorH * 0.45;
  ctx.fillStyle = '#1e293b';
  for (let f = 0; f < 3; f++) {
    const y = f * floorH + (floorH - winH) / 2;
    for (let x = 8; x < w - 8; x += 22) {
      ctx.fillRect(x, y, winW, winH);
    }
  }
}

/** Athletic baseball/softball diamond with red clay infield and green grass outfield. */
function drawAthleticDiamond(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  const cx = w * 0.5;
  const cy = h * 0.75;
  const rOutfield = w * 0.44;

  // Outfield grass arc
  ctx.fillStyle = '#15803d';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, rOutfield, -Math.PI * 0.75, -Math.PI * 0.25);
  ctx.closePath();
  ctx.fill();

  // Infield dirt fan (red clay)
  const rInfield = rOutfield * 0.55;
  ctx.fillStyle = '#b45309';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, rInfield, -Math.PI * 0.75, -Math.PI * 0.25);
  ctx.closePath();
  ctx.fill();

  // Infield inner grass diamond
  const dSize = rInfield * 0.52;
  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 12);
  ctx.lineTo(cx - dSize * 0.7, cy - dSize * 0.7 - 12);
  ctx.lineTo(cx, cy - dSize * 1.4 - 12);
  ctx.lineTo(cx + dSize * 0.7, cy - dSize * 0.7 - 12);
  ctx.closePath();
  ctx.fill();

  // Chalk foul lines
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - rOutfield * Math.cos(Math.PI / 4), cy - rOutfield * Math.sin(Math.PI / 4));
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + rOutfield * Math.cos(Math.PI / 4), cy - rOutfield * Math.sin(Math.PI / 4));
  ctx.stroke();

  // Pitcher's mound & bases
  ctx.fillStyle = '#b45309';
  ctx.beginPath();
  ctx.arc(cx, cy - dSize * 0.7 - 12, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx - 3, cy - 4, 6, 6);
  ctx.fillRect(cx + dSize * 0.7 - 3, cy - dSize * 0.7 - 15, 6, 6);
  ctx.fillRect(cx - 3, cy - dSize * 1.4 - 15, 6, 6);
  ctx.fillRect(cx - dSize * 0.7 - 3, cy - dSize * 0.7 - 15, 6, 6);
}

/** The textures every building shares, made once per scenery (null where there is no canvas). */
function makeKit(THREE) {
  return {
    roof: canvasTexture(THREE, 64, 64, drawRoof, [1, 34]),
    door: canvasTexture(THREE, 256, 128, drawDoor),
    shaft: canvasTexture(THREE, 256, 256, drawShaft),
    cab: canvasTexture(THREE, 256, 64, drawCab),
    glass: canvasTexture(THREE, 256, 128, drawCurvedGlass),
    barracksWall: canvasTexture(THREE, 256, 128, drawBarracksWall, [4, 1]),
    diamond: canvasTexture(THREE, 512, 512, drawAthleticDiamond),
  };
}

// ---------------------------------------------------------------------------
// The buildings

/**
 * The South Apron tarmac mesh. Kept (and named) for the tests and callers, but not drawn: the satellite photo is the
 * ground, and a dark slab on top of it showed as a giant black square.
 */
function createSouthApron(THREE, floor) {
  const width = CYMJ_APRON_BOUNDS.maxX - CYMJ_APRON_BOUNDS.minX;
  const height = CYMJ_APRON_BOUNDS.maxY - CYMJ_APRON_BOUNDS.minY;
  const centerX = (CYMJ_APRON_BOUNDS.minX + CYMJ_APRON_BOUNDS.maxX) / 2;
  const centerY = (CYMJ_APRON_BOUNDS.minY + CYMJ_APRON_BOUNDS.maxY) / 2;

  const geometry = new THREE.PlaneGeometry(width, height);
  const material = new THREE.MeshStandardMaterial({
    color: '#23272b',
    roughness: 0.9,
    metalness: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
    transparent: true,
    opacity: 0,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'south-apron';
  mesh.userData = { type: 'apron' };
  mesh.visible = false;
  mesh.position.set(centerX, centerY, floor);
  return mesh;
}

/** The tower: an octagonal shaft 140 ft tall, a flared glass cab, a roof deck and a red-lit mast. */
function createControlTower(THREE, floor, kit) {
  const group = new THREE.Group();
  group.name = 'control-tower';
  group.userData = { type: 'tower', ...CYMJ_BUILDING_COORDS.tower };
  group.position.set(CYMJ_BUILDING_COORDS.tower.x, CYMJ_BUILDING_COORDS.tower.y, floor);

  const SHAFT_H = 140;
  const CAB_H = 22;

  const shaftGeo = new THREE.CylinderGeometry(19, 22, SHAFT_H, 8);
  shaftGeo.rotateX(Math.PI / 2);
  shaftGeo.translate(0, 0, SHAFT_H / 2);
  const shaftMat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: kit.shaft ?? null, roughness: 0.55, metalness: 0.1 });
  if (!kit.shaft) shaftMat.color.set('#f1f3f5');
  const shaft = new THREE.Mesh(shaftGeo, shaftMat);
  shaft.name = 'tower-shaft';
  group.add(shaft);

  const cabGeo = new THREE.CylinderGeometry(28, 20, CAB_H, 8);
  cabGeo.rotateX(Math.PI / 2);
  cabGeo.translate(0, 0, CAB_H / 2);
  const cabMat = new THREE.MeshStandardMaterial({
    color: kit.cab ? '#ffffff' : '#38bdf8',
    map: kit.cab ?? null,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    roughness: 0.1,
    metalness: 0.3,
  });
  const cab = new THREE.Mesh(cabGeo, cabMat);
  cab.name = 'tower-cab';
  cab.position.z = SHAFT_H;
  group.add(cab);

  const roofGeo = new THREE.CylinderGeometry(30, 30, 2.5, 8);
  roofGeo.rotateX(Math.PI / 2);
  roofGeo.translate(0, 0, 1.25);
  const roofMat = new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.4, metalness: 0.2 });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.name = 'tower-roof';
  roof.position.z = SHAFT_H + CAB_H;
  group.add(roof);

  const antennaGeo = new THREE.CylinderGeometry(0.7, 0.7, 26, 4);
  antennaGeo.rotateX(Math.PI / 2);
  antennaGeo.translate(0, 0, 13);
  const antennaMat = new THREE.MeshStandardMaterial({ color: '#f87171', emissive: '#dc2626', emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.5 });
  const antenna = new THREE.Mesh(antennaGeo, antennaMat);
  antenna.name = 'tower-antenna';
  antenna.position.z = SHAFT_H + CAB_H + 2.5;
  group.add(antenna);

  // Tower Base Administrative Office Annex (dark blue roof, white walls from aerial photo)
  const annexW = 68;
  const annexD = 48;
  const annexH = 22;
  const annexGeo = new THREE.BoxGeometry(annexW, annexD, annexH);
  annexGeo.translate(0, 0, annexH / 2);
  const annexWallMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.65, metalness: 0.08 });
  const annexRoofMat = new THREE.MeshStandardMaterial({ color: '#1e3a8a', roughness: 0.45, metalness: 0.25 });
  const annexMesh = new THREE.Mesh(annexGeo, [
    annexWallMat, annexWallMat, annexWallMat, annexWallMat, annexRoofMat, annexRoofMat,
  ]);
  annexMesh.name = 'tower-base-annex';
  annexMesh.position.set(38, -12, 0);
  group.add(annexMesh);

  const label = makeLabel(THREE, 'Control Tower', '#c8102e', 520);
  if (label) {
    label.position.set(0, 0, SHAFT_H + CAB_H + 110);
    group.add(label);
  }

  return group;
}

/**
 * An arch/barrel hangar: a ribbed silver-blue barrel roof, white end walls, a colour band over the sliding
 * doors and the doors themselves. Its size comes from the coordinate (halfWidth, depth), 200 x 240 ft by default.
 */
function createArchHangar(THREE, coord, floor, kit, look, label) {
  const group = new THREE.Group();
  group.name = coord.id;
  group.userData = { type: 'hangar', ...coord };
  group.position.set(coord.x, coord.y, floor);
  group.rotation.z = Math.PI - 0.1; // doors face south onto the ramp

  const halfWidth = coord.halfWidth ?? 100;
  const depth = coord.depth ?? 240;
  const height = 45;

  const roofGeo = new THREE.CylinderGeometry(halfWidth, halfWidth, depth, 24, 1, true, -Math.PI / 2, Math.PI);
  roofGeo.scale(1, 1, height / halfWidth);
  const roofMat = new THREE.MeshStandardMaterial({
    color: kit.roof ? look.tint : '#d0d7de',
    map: kit.roof ?? null,
    roughness: 0.4,
    metalness: 0.55,
    side: THREE.DoubleSide,
  });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.name = `${coord.id}-roof`;
  group.add(roof);

  if (coord.id === ROOF_BADGE_HANGAR_ID) {
    const badge = createRoofBadge(THREE, halfWidth, height);
    if (badge) group.add(badge);
  }

  const wallMat = new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide });

  const archSteps = 16;
  const backShape = new THREE.Shape();
  backShape.moveTo(-halfWidth, 0);
  backShape.lineTo(halfWidth, 0);
  for (let i = 0; i <= archSteps; i++) {
    const angle = (i / archSteps) * Math.PI;
    backShape.lineTo(halfWidth * Math.cos(angle), height * Math.sin(angle));
  }
  backShape.closePath();
  const backWallGeo = new THREE.ShapeGeometry(backShape);
  backWallGeo.rotateX(Math.PI / 2);
  backWallGeo.translate(0, -depth / 2, 0);
  const backWall = new THREE.Mesh(backWallGeo, wallMat);
  backWall.name = `${coord.id}-back-wall`;
  group.add(backWall);

  const doorWidthHalf = halfWidth * 0.6;
  const doorHeight = 26;
  const frontShape = new THREE.Shape();
  frontShape.moveTo(-halfWidth, 0);
  frontShape.lineTo(-doorWidthHalf, 0);
  frontShape.lineTo(-doorWidthHalf, doorHeight);
  frontShape.lineTo(doorWidthHalf, doorHeight);
  frontShape.lineTo(doorWidthHalf, 0);
  frontShape.lineTo(halfWidth, 0);
  for (let i = 0; i <= archSteps; i++) {
    const angle = (i / archSteps) * Math.PI;
    frontShape.lineTo(halfWidth * Math.cos(angle), height * Math.sin(angle));
  }
  frontShape.closePath();
  const frontWallGeo = new THREE.ShapeGeometry(frontShape);
  frontWallGeo.rotateX(Math.PI / 2);
  frontWallGeo.translate(0, depth / 2, 0);
  const frontWall = new THREE.Mesh(frontWallGeo, wallMat);
  frontWall.name = `${coord.id}-front-wall`;
  group.add(frontWall);

  const trackGeo = new THREE.BoxGeometry(doorWidthHalf * 2 + 4, 2, 2.5);
  const trackMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.4, metalness: 0.6 });
  const track = new THREE.Mesh(trackGeo, trackMat);
  track.name = `${coord.id}-door-track`;
  track.position.set(0, depth / 2 - 3, doorHeight + 1);
  group.add(track);

  const doorGeo = new THREE.BoxGeometry(doorWidthHalf * 2, 1.5, doorHeight);
  const doorMat = new THREE.MeshStandardMaterial({ color: kit.door ? '#ffffff' : '#475569', map: kit.door ?? null, roughness: 0.5, metalness: 0.4 });
  const doors = new THREE.Mesh(doorGeo, doorMat);
  doors.name = `${coord.id}-doors`;
  doors.position.set(0, depth / 2 - 4, doorHeight / 2);
  group.add(doors);

  // The colour band over the doors.
  const bandGeo = new THREE.BoxGeometry(doorWidthHalf * 2 + 20, 2, 7);
  const bandMat = new THREE.MeshStandardMaterial({ color: look.accent, roughness: 0.5, metalness: 0.2 });
  const band = new THREE.Mesh(bandGeo, bandMat);
  band.name = `${coord.id}-door-band`;
  band.position.set(0, depth / 2 + 1.2, doorHeight + 8);
  group.add(band);

  const sideGeo = new THREE.BoxGeometry(2, depth, 6);
  const leftWall = new THREE.Mesh(sideGeo, wallMat);
  leftWall.name = `${coord.id}-left-wall`;
  leftWall.position.set(-halfWidth + 1, 0, 3);
  group.add(leftWall);

  const rightWall = new THREE.Mesh(sideGeo, wallMat);
  rightWall.name = `${coord.id}-right-wall`;
  rightWall.position.set(halfWidth - 1, 0, 3);
  group.add(rightWall);

  const plate = makeLabel(THREE, label, look.accent);
  if (plate) {
    plate.position.set(0, 0, height + 70);
    group.add(plate);
  }

  return group;
}

/** A plain box building from the photo: a flat roof, light walls and a colour trim line round the top. */
function createBoxBuilding(THREE, spec, floor) {
  const group = new THREE.Group();
  group.name = spec.id;
  group.userData = { type: 'building', ...spec };
  group.position.set(spec.x, spec.y, floor);
  group.rotation.z = spec.rotation ?? 0;

  const shape = new THREE.Shape(spec.footprint.map(([x, y]) => new THREE.Vector2(x, y)));
  const bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: spec.height, bevelEnabled: false });
  const roofMat = new THREE.MeshStandardMaterial({ color: spec.roof, roughness: 0.7, metalness: 0.1 });
  const wallMat = new THREE.MeshStandardMaterial({ color: spec.wall, roughness: 0.7, metalness: 0.05 });
  const body = new THREE.Mesh(bodyGeo, [roofMat, wallMat]); // extrude: caps first, then the sides
  body.name = `${spec.id}-body`;
  group.add(body);

  const trimGeo = new THREE.ExtrudeGeometry(shape, { depth: 4, bevelEnabled: false });
  const trimMat = new THREE.MeshStandardMaterial({ color: spec.accent, roughness: 0.5, metalness: 0.2 });
  const trim = new THREE.Mesh(trimGeo, trimMat);
  trim.name = `${spec.id}-trim`;
  trim.position.z = spec.height - 6;
  trim.scale.set(1.01, 1.01, 1);
  group.add(trim);

  const plate = makeLabel(THREE, spec.name, spec.accent);
  if (plate) {
    plate.position.set(0, 0, spec.height + 70);
    group.add(plate);
  }

  return group;
}

/**
 * The 2 CFFTS "Glass Palace": traced from the satellite footprint (Patrick's red outline, 3 Oct).
 * An extruded body on the real outline; the south-east side (facing the ramp) is one curved glass curtain wall,
 * and "THE BIG 2 - BEST IN THE WEST" patch sits on the roof.
 */
function createGlassPalace(THREE, spec, floor, kit) {
  const group = new THREE.Group();
  group.name = spec.id;
  group.userData = { type: 'building', ...spec };
  group.position.set(spec.x, spec.y, floor);
  group.rotation.z = spec.rotation ?? 0;
  const h = spec.height ?? 52;

  // Footprint: the straight back walls, then the curved glass front sampled from a smooth curve.
  const curve = new THREE.CatmullRomCurve3(spec.glassCurve.map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const arc = curve.getPoints(24);
  const outline = [...spec.footprint.map(([x, y]) => new THREE.Vector2(x, y)), ...arc.map((p) => new THREE.Vector2(p.x, p.y))];

  const roofMat = new THREE.MeshStandardMaterial({ color: spec.roof, roughness: 0.6, metalness: 0.1 });
  const wallMat = new THREE.MeshStandardMaterial({ color: spec.wall, roughness: 0.7, metalness: 0.05 });
  const bodyGeo = new THREE.ExtrudeGeometry(new THREE.Shape(outline), { depth: h, bevelEnabled: false });
  const body = new THREE.Mesh(bodyGeo, [roofMat, wallMat]);
  body.name = `${spec.id}-body`;
  group.add(body);

  // The glass skin: a ribbon 1 ft proud of the curved front, the full height of the building.
  const pos = [];
  const uv = [];
  const idx = [];
  arc.forEach((p, i) => {
    pos.push(p.x, p.y, 0, p.x, p.y, h);
    uv.push(i / (arc.length - 1), 0, i / (arc.length - 1), 1);
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  });
  const glassGeo = new THREE.BufferGeometry();
  glassGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  glassGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  glassGeo.setIndex(idx);
  glassGeo.computeVertexNormals();
  glassGeo.scale(1.004, 1.004, 1);
  const glassMat = new THREE.MeshStandardMaterial({
    color: kit.glass ? '#ffffff' : '#62a8d3', map: kit.glass ?? null,
    roughness: 0.15, metalness: 0.5, side: THREE.DoubleSide,
  });
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.name = `${spec.id}-glass-wall`;
  group.add(glass);

  const big2 = createBig2Badge(THREE, 130);
  if (big2) {
    big2.position.set(spec.badge[0], spec.badge[1], h + 0.5);
    group.add(big2);
  }
  return group;
}

/**
 * The U-Shaped Student Barracks Quarters north of the tower:
 * A distinctive 3-wing dormitory complex with a bright teal/green roof,
 * white walls with window bands, rooftop ventilation units, and an inner courtyard lawn.
 */
function createBarracksU(THREE, spec, floor, kit) {
  const group = new THREE.Group();
  group.name = spec.id;
  group.userData = { type: 'barracks', ...spec };
  group.position.set(spec.x, spec.y, floor);
  group.rotation.z = spec.rotation ?? 0;

  const h = spec.height ?? 34;
  const spineW = 250;
  const spineD = 46;
  const wingW = 44;
  const wingD = 140;

  const wallMat = new THREE.MeshStandardMaterial({
    color: kit.barracksWall ? '#ffffff' : '#f1f5f9',
    map: kit.barracksWall ?? null,
    roughness: 0.65,
    metalness: 0.05,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: spec.roof ?? '#0d9488',
    roughness: 0.5,
    metalness: 0.2,
  });
  const parapetMat = new THREE.MeshStandardMaterial({
    color: spec.accent ?? '#0f766e',
    roughness: 0.4,
    metalness: 0.3,
  });

  const materials = [wallMat, wallMat, wallMat, wallMat, roofMat, roofMat];

  // 1. Main back spine
  const spineGeo = new THREE.BoxGeometry(spineW, spineD, h);
  spineGeo.translate(0, 0, h / 2);
  const spineMesh = new THREE.Mesh(spineGeo, materials);
  spineMesh.name = `${spec.id}-spine`;
  spineMesh.position.set(0, 60, 0);
  group.add(spineMesh);

  const spineRimGeo = new THREE.BoxGeometry(spineW + 2, spineD + 2, 2.5);
  spineRimGeo.translate(0, 0, 1.25);
  const spineRim = new THREE.Mesh(spineRimGeo, parapetMat);
  spineRim.name = `${spec.id}-spine-rim`;
  spineRim.position.set(0, 60, h);
  group.add(spineRim);

  // 2. West (left) wing
  const westGeo = new THREE.BoxGeometry(wingW, wingD, h);
  westGeo.translate(0, 0, h / 2);
  const westMesh = new THREE.Mesh(westGeo, materials);
  westMesh.name = `${spec.id}-west-wing`;
  westMesh.position.set(-103, -10, 0);
  group.add(westMesh);

  const westRimGeo = new THREE.BoxGeometry(wingW + 2, wingD + 2, 2.5);
  westRimGeo.translate(0, 0, 1.25);
  const westRim = new THREE.Mesh(westRimGeo, parapetMat);
  westRim.name = `${spec.id}-west-rim`;
  westRim.position.set(-103, -10, h);
  group.add(westRim);

  // 3. East (right) wing
  const eastGeo = new THREE.BoxGeometry(wingW, wingD, h);
  eastGeo.translate(0, 0, h / 2);
  const eastMesh = new THREE.Mesh(eastGeo, materials);
  eastMesh.name = `${spec.id}-east-wing`;
  eastMesh.position.set(103, -10, 0);
  group.add(eastMesh);

  const eastRimGeo = new THREE.BoxGeometry(wingW + 2, wingD + 2, 2.5);
  eastRimGeo.translate(0, 0, 1.25);
  const eastRim = new THREE.Mesh(eastRimGeo, parapetMat);
  eastRim.name = `${spec.id}-east-rim`;
  eastRim.position.set(103, -10, h);
  group.add(eastRim);

  // 4. Rooftop HVAC units
  const hvacMat = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.5, metalness: 0.4 });
  const hvacPositions = [
    [-60, 60], [60, 60], [-103, 10], [-103, -40], [103, 10], [103, -40],
  ];
  for (let i = 0; i < hvacPositions.length; i++) {
    const [hx, hy] = hvacPositions[i];
    const hvacGeo = new THREE.BoxGeometry(10, 12, 5);
    hvacGeo.translate(0, 0, 2.5);
    const hvacMesh = new THREE.Mesh(hvacGeo, hvacMat);
    hvacMesh.name = `${spec.id}-hvac-${i + 1}`;
    hvacMesh.position.set(hx, hy, h);
    group.add(hvacMesh);
  }

  // 5. Courtyard lawn plane
  const lawnGeo = new THREE.PlaneGeometry(158, 136);
  const lawnMat = new THREE.MeshStandardMaterial({
    color: '#15803d',
    roughness: 0.9,
    metalness: 0.05,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const lawnMesh = new THREE.Mesh(lawnGeo, lawnMat);
  lawnMesh.name = `${spec.id}-courtyard-lawn`;
  lawnMesh.position.set(0, -10, 0.2);
  group.add(lawnMesh);

  return group;
}

/**
 * The Athletic Field & Baseball Diamond adjacent to the student barracks:
 * An authentic clay/dirt infield diamond with grass outfield and chalk base paths.
 */
function createAthleticField(THREE, spec, floor, kit) {
  const group = new THREE.Group();
  group.name = spec.id;
  group.userData = { type: 'field', ...spec };
  group.position.set(spec.x, spec.y, floor);
  group.rotation.z = spec.rotation ?? 0;

  const size = 320;
  const fieldGeo = new THREE.PlaneGeometry(size, size);
  const fieldMat = new THREE.MeshBasicMaterial({
    color: kit.diamond ? '#ffffff' : '#15803d',
    map: kit.diamond ?? null,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const fieldMesh = new THREE.Mesh(fieldGeo, fieldMat);
  fieldMesh.name = `${spec.id}-surface`;
  fieldMesh.position.set(0, 0, 0.3);
  group.add(fieldMesh);

  return group;
}

/**
 * Creates the complete CYMJ 3D Airfield Scenery group.
 * @param {any} THREE The Three.js module.
 * @param {{ floor?: number, anchor?: any }} [options] Configuration options.
 * @returns {any} Group named 'airfield-scenery' with all landmarks attached.
 */
export function createAirfieldScenery(THREE, { floor = DEFAULT_FLOOR_FT, anchor = null } = {}) {
  const root = new THREE.Group();
  root.name = 'airfield-scenery';
  root.userData = { floor, buildingCoords: CYMJ_BUILDING_COORDS };

  const kit = makeKit(THREE);

  const apron = createSouthApron(THREE, floor);
  root.add(apron);

  const tower = createControlTower(THREE, floor, kit);
  root.add(tower);

  const hangars = [];
  CYMJ_BUILDING_COORDS.hangars.forEach((hCoord, i) => {
    const hangar = createArchHangar(THREE, hCoord, floor, kit, HANGAR_LOOKS[i % HANGAR_LOOKS.length], hCoord.name);
    hangars.push(hangar);
    root.add(hangar);
  });

  const buildings = CYMJ_EXTRA_BUILDINGS.map((spec) => {
    if (spec.id === 'main-building') return createGlassPalace(THREE, spec, floor, kit);
    if (spec.id === 'barracks-u') return createBarracksU(THREE, spec, floor, kit);
    if (spec.id === 'athletic-field') return createAthleticField(THREE, spec, floor, kit);
    return createBoxBuilding(THREE, spec, floor);
  });
  for (const b of buildings) root.add(b);

  root.userData.tower = tower;
  root.userData.hangars = hangars;
  root.userData.buildings = buildings;
  root.userData.apron = apron;

  if (anchor) {
    if (typeof anchor.add === 'function') {
      anchor.add(root);
    } else if (Number.isFinite(anchor.x) && Number.isFinite(anchor.y)) {
      root.position.set(anchor.x, anchor.y, 0);
    }
  }

  return root;
}

/**
 * Disposes all geometries, materials, and textures within an airfield scenery group,
 * and clears all child references to eliminate memory leaks (D411).
 * @param {any} group The scenery group to dispose.
 */
export function disposeAirfieldScenery(group) {
  if (!group) return;

  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  group.traverse((obj) => {
    if (obj.geometry) {
      geometries.add(obj.geometry);
    }
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        for (const m of obj.material) {
          if (m) materials.add(m);
        }
      } else {
        materials.add(obj.material);
      }
    }
  });

  for (const geom of geometries) {
    geom.dispose();
  }

  for (const mat of materials) {
    if (mat.map) textures.add(mat.map);
    if (mat.alphaMap) textures.add(mat.alphaMap);
    if (mat.roughnessMap) textures.add(mat.roughnessMap);
    if (mat.metalnessMap) textures.add(mat.metalnessMap);
    if (mat.normalMap) textures.add(mat.normalMap);
    mat.dispose();
  }

  for (const tex of textures) {
    tex.dispose();
  }

  // Clear child groups recursively
  group.traverse((obj) => {
    if (obj !== group && typeof obj.clear === 'function') {
      obj.clear();
    }
  });

  if (typeof group.clear === 'function') {
    group.clear();
  } else {
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }
  }

  if (typeof group.removeFromParent === 'function') {
    group.removeFromParent();
  } else if (group.parent) {
    group.parent.remove(group);
  }
}
