// Draws the airspace volumes and the TACNAV routes of the SOF's 3D view (SOF-39, phase 3) from the plain data airspace-model.js works out.
// It only builds three.js objects; the page (labels, buttons, the key) is view3d.js's.
//
// World frame as view3d.js: X east, Y north, Z up, in the map's local feet. A height is feet above sea level times the height scale, the
// same scale and sea-level reference as the cloud decks, so an airspace ceiling and a cloud at the same height sit at the same height.
//
// Each volume is a see-through prism from its floor to its ceiling: faint fill on the walls and both caps (opacity AIRSPACE_FILL_OPACITY,
// no depth writing, so clouds and aircraft read through it), and a thin outline on the top and bottom rings and the vertical edges. Edge
// colour goes by kind (restricted red, advisory amber, terminal, control zone and MTCA in blue tones), and the page says so in words.
// The TACNAV routes are dashed lines at home's elevation plus 500 ft, the ground taken as flat (an estimate).
// A military training route (a US base's `line` entry, FAA open data) is a see-through curtain along its centreline from its floor to its ceiling,
// with a line along its top and bottom; one whose data gives no altitudes is a line on the ground at home's elevation. Its words come with the
// pointer near its line (`lines`), as a TACNAV route's do.
//
// Built again only when the list, the height scale, the ground or home changes; the groups are switched with `.visible`, which rebuilds
// nothing. `dispose()` frees everything.
import { AIRSPACE_FILL_OPACITY, TACNAV_AGL_FT, KIND_WORDS, outlineXY, routeXY, tacnavFt, airspaceWords, airspaceTitle, CIRCLE_SIDES } from './airspace-model.js';

/** The groups the view's two toggles switch. */
export const AIRSPACE_GROUPS = Object.freeze(['airspace', 'tacnav']);

/** Edge and fill colour by kind, estimates for readability (SOF-39). Restricted is red because it is a danger area; red means danger only. */
export const KIND_COLOURS = Object.freeze({
  restricted: '#ff6b6b',
  advisory: '#ffb000',
  terminal: '#3d8bff',
  'control-zone': '#8ccbff',
  mtca: '#4fe3f0',
  other: '#b8cfdb',
  // The US bases' kinds (plan Step 2c part E); colours are estimates for readability, and the key says each in words.
  moa: '#ff8a3d',
  warning: '#ff6b6b',
  alert: '#ffb000',
  mtr: '#c58cff',
});
const ROUTE_COLOUR = '#ffcc66'; // the 2D map's route colour (dashed there too)
const EDGE_OPACITY = 0.85;
/** A TACNAV line's dashes, in scene feet (as the rings'). An estimate for readability. */
const ROUTE_DASH = Object.freeze({ dashSize: 7_000, gapSize: 4_000 });

/**
 * Builds the layers. `T` is three.js; `volumes` are airspace-model.js `checkedAirspace().volumes`; `routes` are the Debrief's routes
 * ({ name, paths: [[[lon, lat], ...]] }, already limited to the TACNAV ones); `toXY(lat, lon)` gives [x, y] in the map's feet; `scale` is the
 * height scale and `groundFt` the ground the view draws, in feet above sea level.
 *
 * Returns { root, labels, picks, summary, dispose() }:
 * - root: a Group with one Group per AIRSPACE_GROUPS entry (`root.userData.groups`);
 * - labels: [{ group: 'tacnav', key, text, compact, title, restricted, point: { x, y, z }, paths: [[{ x, y, z }, ...]] }]: each route's name, its first point
 *   and its lines at the route's height. Nothing stands in the picture: a route's name, like a volume's words, shows only while the pointer is over it
 *   (Dad, 7 Oct: "too much clutter"); view3d.js finds the route near the pointer from `paths`;
 * - picks: [{ mesh, key, text, title }]: each volume's fill, for the view to ray-cast the pointer against; `text` is the words shown beside the pointer
 *   ("CYA305 6,000 ft AGL–FL190 (Class F advisory area)"), `title` the existing hover sentence;
 * - lines: [{ key, text, title, paths: [[{ x, y, z }, ...]] }]: each line entry (a military training route) along its bottom, for the view to find the
 *   one near the pointer, as for the TACNAV routes;
 * - summary: { volumes, routes } (counts drawn).
 */
export function buildAirspace(T, { volumes = [], routes = [], toXY, scale, groundFt }) {
  const root = new T.Group();
  const groups = {};
  for (const name of AIRSPACE_GROUPS) {
    groups[name] = new T.Group();
    groups[name].name = `airspace-${name}`;
    root.add(groups[name]);
  }
  root.userData.groups = groups;
  const owned = [];
  const own = (thing) => {
    owned.push(thing);
    return thing;
  };
  const labels = [];
  const picks = [];
  const lines = [];
  const fills = new Map(); // kind -> material, shared
  const edges = new Map();
  const fillOf = (kind) => {
    if (!fills.has(kind)) fills.set(kind, own(new T.MeshBasicMaterial({ color: KIND_COLOURS[kind], transparent: true, opacity: AIRSPACE_FILL_OPACITY, side: T.DoubleSide, depthWrite: false, fog: false })));
    return fills.get(kind);
  };
  const edgeOf = (kind) => {
    if (!edges.has(kind)) edges.set(kind, own(new T.LineBasicMaterial({ color: KIND_COLOURS[kind], transparent: true, opacity: EDGE_OPACITY, depthWrite: false })));
    return edges.get(kind);
  };

  for (const volume of volumes) {
    const ring = outlineXY(volume, toXY);
    const n = ring.length;
    const zb = volume.floorFt * scale;
    const zt = volume.ceilingFt * scale;
    const kind = KIND_WORDS[volume.kind]?.name ?? 'airspace';
    const said = { key: volume.id, text: `${airspaceWords(volume)} (${volume.classLetter ? `Class ${volume.classLetter} ` : ''}${kind})`, title: airspaceTitle(volume) };

    if (volume.shape.type === 'line') {
      // A route: an open curtain along the centreline (no caps), its top and bottom lines, posts at its two ends.
      const path = (z) => own(new T.BufferGeometry().setFromPoints(ring.map(([x, y]) => new T.Vector3(x, y, z))));
      const bottom = new T.Line(path(zb), edgeOf(volume.kind));
      bottom.renderOrder = 3;
      groups.airspace.add(bottom);
      if (zt > zb) {
        const positions = [];
        for (let i = 0; i + 1 < n; i++) {
          const [x0, y0] = ring[i];
          const [x1, y1] = ring[i + 1];
          positions.push(x0, y0, zb, x1, y1, zb, x1, y1, zt, x0, y0, zb, x1, y1, zt, x0, y0, zt);
        }
        const curtainGeometry = own(new T.BufferGeometry());
        curtainGeometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
        const curtain = new T.Mesh(curtainGeometry, fillOf(volume.kind));
        curtain.renderOrder = 1;
        curtain.name = `airspace-${volume.id}`;
        const top = new T.Line(path(zt), edgeOf(volume.kind));
        const ends = [ring[0], ring[n - 1]].flatMap(([x, y]) => [new T.Vector3(x, y, zb), new T.Vector3(x, y, zt)]);
        const posts = new T.LineSegments(own(new T.BufferGeometry().setFromPoints(ends)), edgeOf(volume.kind));
        for (const line of [top, posts]) line.renderOrder = 3;
        groups.airspace.add(curtain, top, posts);
        picks.push({ mesh: curtain, ...said });
      }
      lines.push({ ...said, paths: [ring.map(([x, y]) => ({ x, y, z: zb }))] });
      continue;
    }

    // Fill: the walls as two triangles a side, and the two caps (triangulated, so a notched outline is filled right).
    const positions = [];
    const tri = (a, b, c) => positions.push(...a, ...b, ...c);
    for (let i = 0; i < n; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[(i + 1) % n];
      tri([x0, y0, zb], [x1, y1, zb], [x1, y1, zt]);
      tri([x0, y0, zb], [x1, y1, zt], [x0, y0, zt]);
    }
    const faces = T.ShapeUtils.triangulateShape(ring.map(([x, y]) => new T.Vector2(x, y)), []);
    for (const [a, b, c] of faces) {
      tri([...ring[a], zb], [...ring[b], zb], [...ring[c], zb]);
      tri([...ring[a], zt], [...ring[b], zt], [...ring[c], zt]);
    }
    const fillGeometry = own(new T.BufferGeometry());
    fillGeometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    const fill = new T.Mesh(fillGeometry, fillOf(volume.kind));
    fill.renderOrder = 1;
    fill.name = `airspace-${volume.id}`;

    // Outline: the top and bottom rings, and vertical edges at the DAH's own corners only (Dad, 7 Oct: no lines all along the arcs).
    // A polygon whose data names its corners (`shape.corners`, indices into its points) gets posts there (none for an empty list); one without
    // gets a post at every point; a circle gets none.
    const loop = (z) => own(new T.BufferGeometry().setFromPoints(ring.map(([x, y]) => new T.Vector3(x, y, z))));
    const top = new T.LineLoop(loop(zt), edgeOf(volume.kind));
    const bottom = new T.LineLoop(loop(zb), edgeOf(volume.kind));
    const corners = volume.shape.type !== 'polygon' ? []
      : Array.isArray(volume.shape.corners) ? volume.shape.corners.filter((i) => Number.isInteger(i) && i >= 0 && i < n) // an empty list: no posts (a smooth outline)
        : ring.map((_, i) => i);
    const posts = [];
    for (const i of corners) posts.push(new T.Vector3(ring[i][0], ring[i][1], zb), new T.Vector3(ring[i][0], ring[i][1], zt));
    const sides = new T.LineSegments(own(new T.BufferGeometry().setFromPoints(posts)), edgeOf(volume.kind));
    for (const line of [top, bottom, sides]) line.renderOrder = 3;
    groups.airspace.add(fill, top, bottom, sides);

    picks.push({ mesh: fill, ...said });
  }

  // The TACNAV routes: dashed lines at home's elevation plus 500 ft, each named at its first point.
  const routeMaterial = own(new T.LineDashedMaterial({ color: ROUTE_COLOUR, transparent: true, opacity: 0.95, depthWrite: false, ...ROUTE_DASH }));
  const zr = tacnavFt(groundFt) * scale;
  let drawnRoutes = 0;
  for (const route of routes) {
    const projected = routeXY(route, toXY);
    if (!projected) continue;
    for (const path of projected.paths) {
      const line = new T.Line(own(new T.BufferGeometry().setFromPoints(path.map(([x, y]) => new T.Vector3(x, y, zr)))), routeMaterial);
      line.computeLineDistances();
      line.renderOrder = 3;
      groups.tacnav.add(line);
    }
    drawnRoutes += 1;
    labels.push({
      group: 'tacnav', key: route.name, text: route.name, compact: route.name, title: `${route.name}: ${TACNAV_AGL_FT} ft above the ground (estimate)`, restricted: false,
      point: { x: projected.first[0], y: projected.first[1], z: zr },
      paths: projected.paths.map((path) => path.map(([x, y]) => ({ x, y, z: zr }))),
    });
  }

  return {
    root,
    labels,
    picks,
    lines,
    summary: { volumes: volumes.length, routes: drawnRoutes },
    dispose() {
      root.removeFromParent();
      for (const thing of owned) thing.dispose?.();
    },
  };
}
