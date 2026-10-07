// Draws the SIGMETs, AIRMETs and PIREPs in the SOF's 3D view (Dad, 7 Oct, plan Step 2b item 1) from what alerts.js read (`alerts3dView`). It only builds
// three.js objects; the page (the hover words, the toggle, the key) is view3d.js's.
//
// World frame as view3d.js and airspace3d.js: X east, Y north, Z up, in the map's local feet; a height is feet above sea level times the height scale.
// - A SIGMET or AIRMET is a see-through volume from its base to its top over its area: faint fill on the walls and caps (no depth writing, so clouds and
//   aircraft read through it) and an outline on the top and bottom rings, red-orange for a SIGMET and yellow for an AIRMET. The words always go with the
//   colour: the pointer's words start with "SIGMET" or "AIRMET", and the key says which colour is which. A line with a width is drawn as the band either
//   side of the line; a circle as ALERT_CIRCLE_SIDES straight sides.
// - A PIREP is a small diamond (◇) at its position and level, amber for turbulence, blue for icing, white for anything else, kept about PIREP_PX across
//   at any zoom (`fit`).
// Only what lies at least partly inside the view's square is drawn. Nothing here raises or clears a caution.
import { ALERT_CIRCLE_SIDES, alertTimeWords } from './alerts.js';
import { FT_PER_NM } from './map-view.js';

/** Edge colours (estimates for readability; red is danger only, and a SIGMET is the danger message). */
export const ALERT_COLOURS = Object.freeze({ sigmet: '#ff5a1f', airmet: '#ffd23f' });
/** A PIREP's diamond by what it reports. */
export const PIREP_COLOURS = Object.freeze({ turb: '#ffb000', ice: '#4da6ff', other: '#ffffff' });
/** The colours in words, for the key (colour is never the only signal). */
export const ALERT_COLOUR_WORDS = Object.freeze({ sigmet: 'red-orange', airmet: 'yellow', turb: 'amber', ice: 'blue', other: 'white' });
/** How solid a volume's fill is, 0 to 1: faint, as the airspace's (an estimate). */
export const ALERT_FILL_OPACITY = 0.12;
/** A PIREP's diamond is about this many pixels across at any zoom (an estimate for readability). */
export const PIREP_PX = 14;

const EDGE_OPACITY = 0.95;

/** The outline of a SIGMET's or AIRMET's area in the map's feet, as [[x, y], ...], or null. `toXY(lat, lon)` gives [x, y]. */
export function areaRingXY(area, toXY) {
  if (!area) return null;
  if (area.type === 'polygon') return area.points.map((p) => toXY(p.lat, p.lon));
  if (area.type === 'circle') {
    const [cx, cy] = toXY(area.center.lat, area.center.lon);
    const r = area.radiusNm * FT_PER_NM;
    return Array.from({ length: ALERT_CIRCLE_SIDES }, (_, i) => {
      const a = (2 * Math.PI * i) / ALERT_CIRCLE_SIDES;
      return [cx + r * Math.sin(a), cy + r * Math.cos(a)];
    });
  }
  if (area.type === 'line') {
    // The band either side of the line: each point pushed out along the mean of its segments' normals, out one side and back the other.
    const pts = area.points.map((p) => toXY(p.lat, p.lon));
    const w = area.halfWidthNm * FT_PER_NM;
    const normals = pts.map((_, i) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    });
    const left = pts.map(([x, y], i) => [x + normals[i][0] * w, y + normals[i][1] * w]);
    const right = pts.map(([x, y], i) => [x - normals[i][0] * w, y - normals[i][1] * w]).reverse();
    return [...left, ...right];
  }
  return null;
}

/** Whether a ring or point touches the square `half` feet either side of home. */
const touches = (ring, half) => {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  return Math.max(...xs) >= -half && Math.min(...xs) <= half && Math.max(...ys) >= -half && Math.min(...ys) <= half;
};

const feet = (ft) => String(Math.round(ft)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** The words beside the pointer, and the longer sentence behind them (the title). */
function words(a, now) {
  const head = a.kind === 'pirep'
    ? `PIREP ${a.aircraft ?? ''} ${a.levelWords ?? ''}: ${a.hazards.words.length ? a.hazards.words.join(', ') : 'no hazard reported'}, ${alertTimeWords(a, now)}`
    : `${a.kindWords}${a.series ? ` ${a.series}` : ''} ${a.hazards.words.join(', ') || 'hazard not read'} ${a.levelWords ?? ''}, ${alertTimeWords(a, now)}`;
  const where = a.kind === 'pirep' ? ` Position: ${a.point.how}.` : '';
  const notes = a.levelNotes?.length ? ` Drawn ${feet(a.baseFt)}–${feet(a.topFt)} ft: ${a.levelNotes.join('; ')}.` : '';
  return { text: head.replace(/\s+/g, ' ').replace(' :', ':').trim(), title: `${a.text.replace(/\s+/g, ' ').trim()}${where}${notes}` };
}

/**
 * Builds the layer. `T` is three.js; `alerts` are alerts.js `alerts3dView().alerts`; `toXY(lat, lon)` gives [x, y] in the map's feet; `scale` is the
 * height scale; `halfFt` half the view's square; `now` the clock (ms) for the words.
 * Returns { root, picks: [{ mesh, key, text, title }], summary: { sigmet, airmet, pirep, outside }, fit(ftPerPx), dispose() }.
 */
export function buildAlerts3d(T, { alerts = [], toXY, scale, halfFt, now = Date.now() }) {
  const root = new T.Group();
  root.name = 'alerts';
  const owned = [];
  const own = (thing) => {
    owned.push(thing);
    return thing;
  };
  const picks = [];
  const diamonds = [];
  const summary = { sigmet: 0, airmet: 0, pirep: 0, outside: 0 };
  const fills = {};
  const edges = {};
  const fillOf = (kind) => (fills[kind] ??= own(new T.MeshBasicMaterial({ color: ALERT_COLOURS[kind], transparent: true, opacity: ALERT_FILL_OPACITY, side: T.DoubleSide, depthWrite: false, fog: false })));
  const edgeOf = (kind) => (edges[kind] ??= own(new T.LineBasicMaterial({ color: ALERT_COLOURS[kind], transparent: true, opacity: EDGE_OPACITY, depthWrite: false })));
  const diamondGeometry = own(new T.OctahedronGeometry(PIREP_PX / 2, 0));
  diamondGeometry.scale(1, 1, 1.4); // taller than wide, so it reads as a diamond from the side
  const marks = {};
  const markOf = (family) => (marks[family] ??= own(new T.MeshBasicMaterial({ color: PIREP_COLOURS[family] ?? PIREP_COLOURS.other, transparent: true, opacity: 0.95, depthWrite: false, fog: false })));
  const markEdges = own(new T.EdgesGeometry(diamondGeometry));
  const markEdge = own(new T.LineBasicMaterial({ color: '#1a1a1a', transparent: true, opacity: 0.8, depthWrite: false }));

  for (const a of alerts) {
    const said = words(a, now);
    if (a.kind === 'pirep') {
      const [x, y] = toXY(a.point.lat, a.point.lon);
      if (!touches([[x, y]], halfFt)) {
        summary.outside += 1;
        continue;
      }
      const mark = new T.Mesh(diamondGeometry, markOf(a.hazards.family));
      mark.add(new T.LineSegments(markEdges, markEdge));
      mark.position.set(x, y, a.baseFt * scale);
      mark.renderOrder = 4;
      mark.name = 'pirep';
      root.add(mark);
      diamonds.push(mark);
      picks.push({ mesh: mark, key: a.key, ...said });
      summary.pirep += 1;
      continue;
    }
    const ring = areaRingXY(a.area, toXY);
    if (!ring || ring.length < 3) continue;
    if (!touches(ring, halfFt)) {
      summary.outside += 1;
      continue;
    }
    const zb = a.baseFt * scale;
    const zt = a.topFt * scale;
    const n = ring.length;
    const positions = [];
    const tri = (p, q, r) => positions.push(...p, ...q, ...r);
    for (let i = 0; i < n; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[(i + 1) % n];
      tri([x0, y0, zb], [x1, y1, zb], [x1, y1, zt]);
      tri([x0, y0, zb], [x1, y1, zt], [x0, y0, zt]);
    }
    for (const [p, q, r] of T.ShapeUtils.triangulateShape(ring.map(([x, y]) => new T.Vector2(x, y)), [])) {
      tri([...ring[p], zb], [...ring[q], zb], [...ring[r], zb]);
      tri([...ring[p], zt], [...ring[q], zt], [...ring[r], zt]);
    }
    const geometry = own(new T.BufferGeometry());
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    const fill = new T.Mesh(geometry, fillOf(a.kind));
    fill.renderOrder = 1;
    fill.name = a.kind;
    const loop = (z) => own(new T.BufferGeometry().setFromPoints(ring.map(([x, y]) => new T.Vector3(x, y, z))));
    const top = new T.LineLoop(loop(zt), edgeOf(a.kind));
    const bottom = new T.LineLoop(loop(zb), edgeOf(a.kind));
    // Posts at a listed area's own corners only (none round a circle or along a band's sides).
    const posts = a.area.type === 'polygon' ? ring.flatMap(([x, y]) => [new T.Vector3(x, y, zb), new T.Vector3(x, y, zt)]) : [];
    const sides = new T.LineSegments(own(new T.BufferGeometry().setFromPoints(posts)), edgeOf(a.kind));
    for (const line of [top, bottom, sides]) line.renderOrder = 3;
    root.add(fill, top, bottom, sides);
    picks.push({ mesh: fill, key: a.key, ...said });
    summary[a.kind] += 1;
  }

  return {
    root,
    picks,
    summary,
    /** Keeps each PIREP's diamond about PIREP_PX across for the camera's scene feet per screen pixel. */
    fit(ftPerPx) {
      for (const d of diamonds) d.scale.setScalar(ftPerPx);
    },
    dispose() {
      root.removeFromParent();
      for (const thing of owned) thing.dispose?.();
    },
  };
}
