// The Stadium bowl's crowd, football field and fireworks (Dad, 17 Oct 2026: "can you include fireworks at the stadium at
// the end of the song, just for a better visual confirmation. as well as people in the seats with rows, and a football
// field marking with the goal posts"). 3D polish built ahead of Patrick's yes (RS-28: proposed, built ahead of Patrick's
// yes; Dad chose "Build it now, flagged"). A picture only: no flying number comes from here, and the bowl's sizes in
// targets.js (which the flying reads) are never changed.
//
// What it builds, in the target's own frame (x along its long axis, y to its left, z up from the ground at the aim point):
//  - the stands as stepped tiers (the same outer wall and the same 100 ft top as the plain bowl, and the same open
//    middle), with the seated crowd on them in rows as ONE instanced mesh;
//  - the football field on the bowl's floor: end zones, sidelines, end lines and the yard lines every 5 yd (10 yd ones
//    thicker) as ONE merged flat mesh, and the goal posts as ONE merged mesh;
//  - the fireworks: a few coloured shells over the stadium as ONE Points object, a pure function of the time since the
//    anthem's last note, so scrubbing back and forth shows them correctly and they replay.
// About 14 draw calls in all. When data fails: nothing here reads outside data.
//
// EVERY SIZE BELOW IS AN ESTIMATE chosen to look right, except the two fields' lengths and widths, which are the leagues'
// published field sizes from the builder's own knowledge (CFL 110 yd goal line to goal line, 65 yd wide, 20 yd end zones;
// NFL 100 yd, 53 1/3 yd, 10 yd end zones), not checked against a rule book here.

/** Fields in feet. goalToGoal: between the goal lines; endZone: each end zone's depth; widthFt: sideline to sideline. */
export const FIELDS = Object.freeze({
  // Canadian (O Canada, and when no anthem is set: an estimate). Posts on the goal line.
  canada: Object.freeze({ id: 'canada', label: 'Canadian field', goalToGoalFt: 330, endZoneFt: 60, widthFt: 195, postsOnGoalLine: true }),
  // US (The Star-Spangled Banner). Posts at the back of the end zone.
  us: Object.freeze({ id: 'us', label: 'US field', goalToGoalFt: 300, endZoneFt: 30, widthFt: 160, postsOnGoalLine: false }),
});
/** The field for an anthem choice ('canada', 'us' or 'none'). */
export const fieldFor = (anthemId) => (anthemId === 'us' ? FIELDS.us : FIELDS.canada);

/** The look (feet; estimates). */
export const LOOK = Object.freeze({
  tiers: 10, rowsPerTier: 3, seatSpacingFt: 3.5, emptyShare: 0.12,
  personWFt: 1.6, personHFt: 3,
  lineThinFt: 0.8, lineThickFt: 1.4, lineEdgeFt: 2.2,
  post: Object.freeze({ crossbarFt: 10, uprightsFt: 35, widthFt: 18.5, thickFt: 2 }), // the crossbar's height, the uprights above it, the gap between them
});
/** The fireworks (estimates for the look; gravity is standard). */
export const FIREWORKS = Object.freeze({
  shells: 8, staggerSec: 0.4, riseSec: 0.9, lifeSec: 2.4, perShell: 90,
  burstHeightFt: [260, 420], spreadAlongFt: 220, spreadAcrossFt: 170, speedFtS: [170, 300], dragPerSec: 1.5, gravityFtS2: 32.2, pointFt: 12,
});
/** How long after the last note the show lasts, s. */
export const FIREWORKS_SEC = (FIREWORKS.shells - 1) * FIREWORKS.staggerSec + 0.3 + FIREWORKS.riseSec + FIREWORKS.lifeSec;

const COLOURS = Object.freeze({
  seatA: '#2e3a52', seatB: '#3a4866', rim: '#b8b4aa', field: '#4a9444', zoneA: '#2b5f8a', zoneB: '#8a2f2f', line: '#ffffff', post: '#f5d33a',
  crowd: ['#c0392b', '#e8e8e8', '#2d6cdf', '#f5c542', '#3ea36b', '#8e44ad', '#222a3a', '#e67e22', '#d9d2c3', '#e84393'],
  shells: ['#ff3b30', '#ffd23f', '#3ecf8e', '#4aa3ff', '#ffffff', '#ff5ccf', '#ff9f43'],
});

/** A small repeatable random-number maker, so the same crowd and the same show come out every time. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Flat rectangles { x0, x1, y0, y1, color } at height z as one coloured geometry, painted in list order. */
function rectsGeometry(THREE, rects, z) {
  const pos = new Float32Array(rects.length * 18);
  const col = new Float32Array(rects.length * 18);
  const c = new THREE.Color();
  rects.forEach((r, i) => {
    const q = [r.x0, r.y0, r.x1, r.y0, r.x1, r.y1, r.x0, r.y0, r.x1, r.y1, r.x0, r.y1];
    for (let k = 0; k < 6; k++) pos.set([q[k * 2], q[k * 2 + 1], z], i * 18 + k * 3);
    c.set(r.color);
    for (let k = 0; k < 6; k++) col.set([c.r, c.g, c.b], i * 18 + k * 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Axis-aligned boxes [x0, x1, y0, y1, z0, z1] as one geometry (no normals: for unlit material). */
function boxesGeometry(THREE, boxes) {
  const pos = [];
  for (const [x0, x1, y0, y1, z0, z1] of boxes) {
    const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    for (const f of [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]) {
      for (const k of [0, 1, 2, 0, 2, 3]) pos.push(...v[f[k]]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  return g;
}

/** The field's flat parts in painting order: the grass, the end zones, then the lines. Local feet about the field's centre. */
export function fieldRects(field) {
  const half = field.goalToGoalFt / 2;
  const lenHalf = half + field.endZoneFt;
  const w = field.widthFt / 2;
  const rects = [{ x0: -lenHalf, x1: lenHalf, y0: -w, y1: w, color: COLOURS.field }];
  rects.push({ x0: -lenHalf, x1: -half, y0: -w, y1: w, color: COLOURS.zoneA }, { x0: half, x1: lenHalf, y0: -w, y1: w, color: COLOURS.zoneB });
  const yd = 15; // 5 yd in feet
  const n = Math.round(field.goalToGoalFt / yd);
  for (let i = 0; i <= n; i++) {
    const x = -half + i * yd;
    const t = i === 0 || i === n ? LOOK.lineEdgeFt : i % 2 === 0 ? LOOK.lineThickFt : LOOK.lineThinFt; // goal lines, then every 10 yd, then every 5 yd
    rects.push({ x0: x - t / 2, x1: x + t / 2, y0: -w, y1: w, color: COLOURS.line });
  }
  const e = LOOK.lineEdgeFt;
  rects.push(
    { x0: -lenHalf, x1: lenHalf, y0: w - e, y1: w, color: COLOURS.line }, { x0: -lenHalf, x1: lenHalf, y0: -w, y1: -w + e, color: COLOURS.line },
    { x0: -lenHalf, x1: -lenHalf + e, y0: -w, y1: w, color: COLOURS.line }, { x0: lenHalf - e, x1: lenHalf, y0: -w, y1: w, color: COLOURS.line });
  return rects;
}

/** The goal posts' boxes at both ends: a stem, the crossbar and two uprights. */
export function postBoxes(field) {
  const p = LOOK.post;
  const t = p.thickFt / 2;
  const xs = (field.postsOnGoalLine ? field.goalToGoalFt / 2 : field.goalToGoalFt / 2 + field.endZoneFt);
  const boxes = [];
  for (const s of [-1, 1]) {
    const x = s * xs;
    boxes.push([x - t, x + t, -t, t, 0, p.crossbarFt], // the stem
      [x - t, x + t, -p.widthFt / 2, p.widthFt / 2, p.crossbarFt - t, p.crossbarFt + t]); // the crossbar
    for (const y of [-p.widthFt / 2, p.widthFt / 2]) boxes.push([x - t, x + t, y - t, y + t, p.crossbarFt, p.crossbarFt + p.uprightsFt]);
  }
  return boxes;
}

/** The shells of the show, from fixed seeds: delay after the last note, place over the field, burst height, colour, and each spark's direction and speed. */
export function fireworkShells() {
  const F = FIREWORKS;
  const rnd = seeded(2026);
  const shells = [];
  for (let i = 0; i < F.shells; i++) {
    const sparks = [];
    for (let k = 0; k < F.perShell; k++) {
      const z = rnd() * 2 - 1;
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);
      const sp = F.speedFtS[0] + rnd() * (F.speedFtS[1] - F.speedFtS[0]);
      sparks.push({ dx: r * Math.cos(a) * sp, dy: r * Math.sin(a) * sp, dz: z * sp });
    }
    shells.push({
      delay: i * F.staggerSec + rnd() * 0.3,
      x: (rnd() * 2 - 1) * F.spreadAlongFt, y: (rnd() * 2 - 1) * F.spreadAcrossFt,
      h: F.burstHeightFt[0] + rnd() * (F.burstHeightFt[1] - F.burstHeightFt[0]),
      color: COLOURS.shells[i % COLOURS.shells.length], sparks,
    });
  }
  return shells;
}

/**
 * Builds the stadium dressing.
 * dims: { sizeFt, widthFt, topFt } from targets.js targetSizes('stadium') (the bowl's own numbers: outer ellipse, open
 * middle at 0.34 × 0.3 of them, top height). anthem: 'canada', 'us' or 'none' (picks the field).
 * Returns { group, setFireworks(sec | null), stats, dispose }. group goes into the target's group; setFireworks(sec) shows
 * the show at sec seconds after the last note (null or before the start or after the end: nothing).
 */
export function buildStadium(THREE, { sizeFt, widthFt, topFt, anthem = 'none', doc = globalThis.document }) {
  const group = new THREE.Group();
  const geos = [];
  const mats = [];
  const keep = (list, thing) => {
    list.push(thing);
    return thing;
  };
  const flat = (extra = {}) => keep(mats, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, ...extra }));
  const Aout = sizeFt / 2, Bout = widthFt / 2, Ain = sizeFt * 0.34, Bin = widthFt * 0.3; // as targets.js and the plain bowl
  const axesAt = (u) => ({ a: Ain + (Aout - Ain) * u, b: Bin + (Bout - Bin) * u });
  const { tiers: N, rowsPerTier: R } = LOOK;

  // ---- The stands: stepped tiers rising from the open middle to the plain bowl's outer wall and top ----
  const seatMats = [keep(mats, new THREE.MeshStandardMaterial({ color: COLOURS.seatA, roughness: 0.9, metalness: 0.05 })),
    keep(mats, new THREE.MeshStandardMaterial({ color: COLOURS.seatB, roughness: 0.9, metalness: 0.05 }))];
  for (let k = 0; k < N; k++) {
    const o = axesAt((k + 1) / N);
    const i = axesAt(k / N);
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, o.a, o.b, 0, Math.PI * 2, false, 0);
    const hole = new THREE.Path();
    hole.absellipse(0, 0, i.a, i.b, 0, Math.PI * 2, true, 0);
    shape.holes.push(hole);
    const h = (topFt * (k + 1)) / N;
    const m = new THREE.Mesh(keep(geos, new THREE.ExtrudeGeometry(shape, { depth: h + 5, bevelEnabled: false, curveSegments: 48 })), seatMats[k % 2]);
    m.position.z = -5; // into the ground a little, as the plain bowl
    group.add(m);
  }

  // ---- The crowd: people in the seats, in rows, one instanced mesh ----
  const rnd = seeded(7);
  const spots = [];
  for (let k = 0; k < N; k++) {
    const tread = topFt * ((k + 1) / N);
    for (let j = 0; j < R; j++) {
      const { a, b } = axesAt((k + (j + 0.5) / R) / N);
      const perimeter = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))); // Ramanujan's ellipse estimate
      const n = Math.floor(perimeter / LOOK.seatSpacingFt);
      for (let s = 0; s < n; s++) {
        if (rnd() < LOOK.emptyShare) continue;
        const th = ((s + 0.5) / n) * Math.PI * 2;
        spots.push({ x: a * Math.cos(th), y: b * Math.sin(th), z: tread, c: Math.floor(rnd() * COLOURS.crowd.length) });
      }
    }
  }
  const personGeo = keep(geos, new THREE.BoxGeometry(LOOK.personWFt, LOOK.personWFt, LOOK.personHFt));
  const crowd = new THREE.InstancedMesh(personGeo, keep(mats, new THREE.MeshLambertMaterial({ color: '#ffffff' })), spots.length);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  spots.forEach((p, i) => {
    m4.makeTranslation(p.x, p.y, p.z + LOOK.personHFt / 2);
    crowd.setMatrixAt(i, m4);
    crowd.setColorAt(i, col.set(COLOURS.crowd[p.c]));
  });
  crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  crowd.frustumCulled = false; // the instances' bounds are not the geometry's
  group.add(crowd);

  // ---- The field and the goal posts ----
  const field = fieldFor(anthem);
  const grass = new THREE.Mesh(keep(geos, rectsGeometry(THREE, fieldRects(field), 2.5)), flat({ vertexColors: true }));
  grass.renderOrder = 1; // after the plain green floor, painted in the order of the list
  group.add(grass);
  const posts = new THREE.Mesh(keep(geos, boxesGeometry(THREE, postBoxes(field).map((b) => [b[0], b[1], b[2], b[3], b[4] + 2.5, b[5] + 2.5]))), keep(mats, new THREE.MeshBasicMaterial({ color: COLOURS.post })));
  group.add(posts);

  // ---- The fireworks: one Points object, a pure function of the time since the last note ----
  const F = FIREWORKS;
  const shells = fireworkShells();
  const total = shells.length * (F.perShell + 1); // each shell: one rising point, then its sparks
  const posArr = new Float32Array(total * 3);
  const colArr = new Float32Array(total * 4); // red, green, blue and alpha (the fade)
  const showGeo = keep(geos, new THREE.BufferGeometry());
  showGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  showGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 4));
  // Each spark is a soft round dot: a 32 px picture drawn here (no file), so it never shows as a square.
  const dotCanvas = doc.createElement('canvas');
  dotCanvas.width = 32;
  dotCanvas.height = 32;
  const dc = dotCanvas.getContext('2d');
  if (dc) {
    const grad = dc.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    dc.fillStyle = grad;
    dc.fillRect(0, 0, 32, 32);
  }
  const dotMap = new THREE.CanvasTexture(dotCanvas);
  mats.push(dotMap);
  const show = new THREE.Points(showGeo, keep(mats, new THREE.PointsMaterial({
    size: F.pointFt, map: dotMap, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, fog: false, // normal blending with a fading alpha keeps the colours true against a bright sky
  })));
  show.frustumCulled = false;
  show.visible = false;
  group.add(show);
  const shellRgb = shells.map((s) => new THREE.Color(s.color));
  let lastShown = null;
  /** The show at `sec` seconds after the last note, or hidden (null, before it starts or after it ends). */
  function setFireworks(sec) {
    const on = Number.isFinite(sec) && sec >= 0 && sec <= FIREWORKS_SEC;
    if (!on) {
      if (show.visible) show.visible = false;
      lastShown = null;
      return;
    }
    if (lastShown === sec) return;
    lastShown = sec;
    show.visible = true;
    let n = 0;
    const put = (x, y, z, r, g, b, a) => {
      posArr.set([x, y, z], n * 3);
      colArr.set([r, g, b, a], n * 4);
      n++;
    };
    const kD = F.dragPerSec;
    shells.forEach((s, si) => {
      const c = shellRgb[si];
      const tau = sec - s.delay - F.riseSec; // seconds since the burst
      const rise = (sec - s.delay) / F.riseSec;
      if (rise >= 0 && rise < 1) put(s.x, s.y, s.h * rise, 1, 0.85, 0.4, 1); else put(0, 0, -1e5, 0, 0, 0, 0); // the rising shell
      for (const sp of s.sparks) {
        if (tau < 0 || tau > F.lifeSec) {
          put(0, 0, -1e5, 0, 0, 0, 0);
          continue;
        }
        const reach = (1 - Math.exp(-kD * tau)) / kD; // the spark slows in the air
        const fade = (1 - tau / F.lifeSec) ** 1.5;
        put(s.x + sp.dx * reach, s.y + sp.dy * reach, s.h + sp.dz * reach - 0.5 * F.gravityFtS2 * tau * tau, c.r, c.g, c.b, fade);
      }
    });
    showGeo.attributes.position.needsUpdate = true;
    showGeo.attributes.color.needsUpdate = true;
  }

  return {
    group,
    setFireworks,
    /** What was built, for a look at its cost. */
    stats: { people: spots.length, tiers: N, drawCalls: N + 4, field: field.id, sparks: total },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      crowd.dispose();
    },
  };
}
