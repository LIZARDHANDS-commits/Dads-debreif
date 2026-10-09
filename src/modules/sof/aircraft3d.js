// Simple shapes for the SOF 3D view's live traffic by kind (Dad, 8 Oct 2026: aircraft drawn by kind; aircraft-kind.js decides the kind): an airliner (long
// body, swept wings, two engines under them), a business jet (slim body, T-tail, two engines at the back), a light aircraft (high straight wing, a propeller
// disc), a military transport or tanker (fat body, high wing, four engines) and a fighter or jet trainer (small, delta wing). Plain three.js geometry in the
// style of ui-kit three-aircraft.js's stand-in (flat-shaded, no fog, edge lines round the wings and fin); the T-6 (the CT-156 model), the helicopter
// (helicopter3d.js) and any other aircraft (the stand-in) are drawn as before. Kept in the SOF folder because only the SOF draws them.
//
// Frame as the stand-in: nose +X, left +Y, up +Z, about 1.38 long nose to tail (traffic3d.js scales each to its size on the screen). The shapes are
// pictures, not to scale; each is a few hundred triangles at most. The geometry is made once per kind and shared by every aircraft of that kind (up to 300
// are drawn); each aircraft has its own materials, so fading one never fades another. Free one aircraft with `release(group)` (its materials only) and
// the shared geometry with `dispose()`.

/** The kinds drawn here. */
export const SHAPED_KINDS = Object.freeze(['airliner', 'bizjet', 'light', 'mil-cargo', 'mil-fast']);
/** How long each shape is in its own units, nose to tail (traffic3d.js divides by it). */
export const SHAPE_UNITS = 1.38;
const ENGINE_COLOUR = '#3a4048';
const SEGMENTS = 8; // round parts are 8-sided: enough at 20-odd pixels, and light

// A plan-view outline [[x, y], ...] extruded `depth` up from height z0.
function flat(T, pts, depth, z0) {
  const g = new T.ExtrudeGeometry(new T.Shape(pts.map(([x, y]) => new T.Vector2(x, y))), { depth, bevelEnabled: false });
  g.translate(0, 0, z0);
  return g;
}

// A vertical fin: an outline [[x, up], ...] extruded `depth` across the centreline.
function fin(T, pts, depth = 0.014) {
  const g = new T.ExtrudeGeometry(new T.Shape(pts.map(([x, z]) => new T.Vector2(x, z))), { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  g.rotateX(Math.PI / 2);
  return g;
}

// A round body from a profile [[radius, x], ...], tail first, along +X.
function body(T, profile) {
  const g = new T.LatheGeometry(profile.map(([r, x]) => new T.Vector2(r, x)), SEGMENTS);
  g.rotateZ(-Math.PI / 2);
  return g;
}

// Engines: a short cylinder along X at each [x, y, z].
function engines(T, places, radius, length) {
  return places.map(([x, y, z]) => {
    const g = new T.CylinderGeometry(radius, radius * 0.9, length, SEGMENTS, 1);
    g.rotateZ(-Math.PI / 2);
    g.translate(x, y, z);
    return g;
  });
}

// Each kind's parts: { body, wings: [...], fin: [...], engines: [...], disc } (geometries), the wings and fin outlined.
function build(T, kind) {
  if (kind === 'airliner') {
    return {
      body: body(T, [[0.005, -0.7], [0.03, -0.62], [0.06, -0.45], [0.075, -0.25], [0.075, 0.45], [0.06, 0.58], [0.03, 0.65], [0.002, 0.68]]),
      wings: [
        flat(T, [[0.18, 0.06], [-0.14, 0.66], [-0.24, 0.66], [-0.06, 0.06], [-0.06, -0.06], [-0.24, -0.66], [-0.14, -0.66], [0.18, -0.06]], 0.018, -0.04),
        flat(T, [[-0.48, 0.04], [-0.62, 0.26], [-0.68, 0.26], [-0.62, 0.04], [-0.62, -0.04], [-0.68, -0.26], [-0.62, -0.26], [-0.48, -0.04]], 0.012, 0),
      ],
      fin: [fin(T, [[-0.44, 0.06], [-0.62, 0.3], [-0.7, 0.3], [-0.66, 0.06]])],
      engines: engines(T, [[0.1, 0.25, -0.08], [0.1, -0.25, -0.08]], 0.036, 0.17),
    };
  }
  if (kind === 'bizjet') {
    return {
      body: body(T, [[0.004, -0.66], [0.03, -0.58], [0.05, -0.35], [0.052, 0.3], [0.04, 0.5], [0.02, 0.62], [0.002, 0.68]]),
      wings: [
        flat(T, [[0.1, 0.05], [-0.1, 0.56], [-0.19, 0.56], [-0.12, 0.05], [-0.12, -0.05], [-0.19, -0.56], [-0.1, -0.56], [0.1, -0.05]], 0.016, -0.04),
        // T-tail: the stabiliser on top of the fin
        flat(T, [[-0.56, 0.02], [-0.64, 0.24], [-0.7, 0.24], [-0.68, 0.02], [-0.68, -0.02], [-0.7, -0.24], [-0.64, -0.24], [-0.56, -0.02]], 0.012, 0.31),
      ],
      fin: [fin(T, [[-0.42, 0.04], [-0.6, 0.32], [-0.7, 0.32], [-0.66, 0.04]])],
      engines: engines(T, [[-0.36, 0.09, 0.045], [-0.36, -0.09, 0.045]], 0.032, 0.18),
    };
  }
  if (kind === 'light') {
    const disc = new T.CircleGeometry(0.17, 16);
    disc.rotateY(Math.PI / 2);
    disc.translate(0.56, 0, 0);
    return {
      body: body(T, [[0.004, -0.66], [0.025, -0.58], [0.045, -0.2], [0.065, 0.15], [0.065, 0.4], [0.05, 0.5], [0.02, 0.55]]),
      wings: [
        flat(T, [[0.26, 0.68], [0.26, -0.68], [0.08, -0.68], [0.08, 0.68]], 0.018, 0.065), // the high straight wing
        flat(T, [[-0.5, 0.24], [-0.5, -0.24], [-0.62, -0.24], [-0.62, 0.24]], 0.012, 0),
      ],
      fin: [fin(T, [[-0.42, 0.03], [-0.56, 0.22], [-0.66, 0.22], [-0.66, 0.03]])],
      engines: [],
      disc,
    };
  }
  if (kind === 'mil-cargo') {
    return {
      body: body(T, [[0.01, -0.7], [0.05, -0.6], [0.09, -0.4], [0.105, -0.2], [0.105, 0.4], [0.085, 0.55], [0.045, 0.64], [0.004, 0.68]]),
      wings: [
        flat(T, [[0.22, 0.05], [0.15, 0.7], [0.03, 0.7], [-0.02, 0.05], [-0.02, -0.05], [0.03, -0.7], [0.15, -0.7], [0.22, -0.05]], 0.02, 0.08), // the high wing
        flat(T, [[-0.52, 0.3], [-0.52, -0.3], [-0.66, -0.3], [-0.66, 0.3]], 0.012, 0.05),
      ],
      fin: [fin(T, [[-0.4, 0.08], [-0.6, 0.4], [-0.7, 0.4], [-0.68, 0.08]])],
      engines: engines(T, [[0.22, 0.26, 0.05], [0.22, -0.26, 0.05], [0.19, 0.48, 0.05], [0.19, -0.48, 0.05]], 0.034, 0.17),
    };
  }
  // mil-fast: a small pointed body, a delta wing and one swept fin.
  return {
    body: body(T, [[0.01, -0.66], [0.045, -0.6], [0.055, -0.3], [0.05, 0.2], [0.03, 0.5], [0.001, 0.7]]),
    wings: [flat(T, [[0.25, 0.05], [-0.4, 0.52], [-0.52, 0.52], [-0.52, -0.52], [-0.4, -0.52], [0.25, -0.05]], 0.016, -0.01)],
    fin: [fin(T, [[-0.34, 0.04], [-0.58, 0.3], [-0.66, 0.3], [-0.62, 0.04]])],
    engines: [],
  };
}

/**
 * The shapes for one 3D view: `mesh(kind, { color, outline })` makes one aircraft of a kind on SHAPED_KINDS as a THREE.Group (its own materials, the kind's
 * shared geometry), `release(group)` frees that aircraft's materials and takes it out of its parent, and `dispose()` frees the shared geometry.
 * @param {any} T three.js
 */
export function createKindShapes(T) {
  const made = new Map(); // kind -> { parts, edges }
  const partsOf = (kind) => {
    if (!made.has(kind)) {
      const parts = build(T, kind);
      const edges = [...parts.wings, ...parts.fin].map((g) => new T.EdgesGeometry(g, 30));
      made.set(kind, { parts, edges });
    }
    return made.get(kind);
  };
  const solid = (c, extra = {}) => new T.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.55, metalness: 0.1, fog: false, ...extra });
  return {
    mesh(kind, { color, outline = null }) {
      const { parts, edges } = partsOf(SHAPED_KINDS.includes(kind) ? kind : 'mil-fast');
      const base = new T.Color(color);
      const group = new T.Group();
      group.userData.sharedShape = true;
      const bodyMat = solid(base);
      const wingMat = solid(base.clone().multiplyScalar(0.82));
      const finMat = solid(base.clone().lerp(new T.Color('#ffffff'), 0.15));
      group.add(new T.Mesh(parts.body, bodyMat));
      for (const g of parts.wings) group.add(new T.Mesh(g, wingMat));
      for (const g of parts.fin) group.add(new T.Mesh(g, finMat));
      if (parts.engines.length) {
        const engineMat = solid(ENGINE_COLOUR, { roughness: 0.4 });
        for (const g of parts.engines) group.add(new T.Mesh(g, engineMat));
      }
      if (parts.disc) group.add(new T.Mesh(parts.disc, new T.MeshBasicMaterial({ color: '#dcebff', transparent: true, opacity: 0.25, side: T.DoubleSide, depthWrite: false, fog: false })));
      if (outline) {
        const edge = new T.LineBasicMaterial({ color: outline, fog: false });
        for (const g of edges) group.add(new T.LineSegments(g, edge));
      }
      return group;
    },
    release(group) {
      group.removeFromParent();
      const materials = new Set();
      group.traverse((o) => {
        for (const m of [].concat(o.material ?? [])) materials.add(m);
      });
      for (const m of materials) m.dispose();
    },
    dispose() {
      for (const { parts, edges } of made.values()) {
        for (const g of [parts.body, ...parts.wings, ...parts.fin, ...parts.engines, ...(parts.disc ? [parts.disc] : []), ...edges]) g.dispose();
      }
      made.clear();
    },
  };
}
