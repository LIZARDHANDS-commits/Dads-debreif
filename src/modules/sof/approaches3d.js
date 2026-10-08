// Draws the instrument approaches in the SOF's 3D view (plan item "Instrument approaches drawn to the fields"; Dad, 8 Oct 2026) from the plain geometry
// approaches-model.js works out. It only builds three.js objects; the labels, the button, the field picker and the key are view3d.js's.
//
// World frame as view3d.js: X east, Y north, Z up, in the map's local feet; a height is feet above sea level times the height scale, as the cloud, the
// airspace and the aircraft are. For each approach:
// - its path through the legs at the coded altitudes (solid; between constraints straight lines), the transitions included, arcs as short pieces;
// - the missed approach, dashed; its holding pattern, and any other hold, as a racetrack (leg length and turn size estimates, approaches-model.js HOLD_DRAW);
// - the localizer course on the ground from the antenna out to the IF/FAF distance, dashed;
// - the glidepath from the FAF's distance down to the threshold at the coded angle and TCH, solid and brighter;
// - a VOR, TACAN or NDB final course on the ground from the navaid to the furthest final fix, dashed;
// - the fixes as small points (their words are labels view3d.js places).
// Colour by group (approaches-model.js APPROACH_GROUPS, said in words in the key); RNAV drawn fainter (the T-6A can't rely on GPS: AFMAN 11-202V3 4.17.3).
// An estimated approach (a Canadian or military field: centreline and a 3° path) is one dashed white line from 10 NM down to the threshold.
//
// Lines of a kind share one LineSegments (a few draw calls for every approach in view). Built again only when the fields, the height scale or home change.
import { APPROACH_GROUPS, fixLabel, fixTitle, altWords } from './approaches-model.js';

/** Dashes in scene feet (as the TACNAV routes'), and how far the ground lines sit above the field so they show over it (estimates for readability). */
const DASH = Object.freeze({ dashSize: 2_500, gapSize: 1_800 });
const GROUND_LIFT_FT = 40;
/** A fix's point, in screen pixels (an estimate for readability). */
const FIX_PX = 6;

const feet = (ft) => String(Math.round(ft)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * Builds the layer. `T` is three.js; `items` are [{ icao, geometry }] (approaches-model.js approachGeometry, in the view's feet); `scale` the height scale.
 * Returns { root, fixes: [{ key, icao, text, title, point: { x, y, z }, role }], lines: [{ key, text, title, paths: [[{ x, y, z }]] }], summary: { approaches,
 * fixes }, dispose() }. `lines` are each approach's path for view3d.js to find the one near the pointer.
 */
export function buildApproaches(T, { items = [], scale }) {
  const root = new T.Group();
  root.name = 'approaches';
  const owned = [];
  const own = (thing) => {
    owned.push(thing);
    return thing;
  };
  const buckets = new Map(); // "group|style" -> [x, y, z, x, y, z, ...] in segment pairs
  const add = (group, style, a, b) => {
    const key = `${group}|${style}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(a.x, a.y, a.z, b.x, b.y, b.z);
  };
  const at = (p) => ({ x: p.x, y: p.y, z: p.ft * scale });
  const polyline = (group, style, pts) => {
    for (let i = 1; i < pts.length; i++) add(group, style, at(pts[i - 1]), at(pts[i]));
  };
  const fixes = [];
  const lines = [];
  const points = new Map(); // group -> [x, y, z ...]
  let count = 0;

  for (const { icao, geometry } of items) {
    const a = geometry.approach;
    const group = a.group;
    count += 1;
    const lift = (p) => ({ ...p, ft: (p.ft ?? geometry.groundFt) + GROUND_LIFT_FT });
    for (const path of geometry.paths) {
      const style = a.estimate ? 'dashed' : path.seg === 'missed' ? 'missed' : 'path';
      polyline(group, style, path.points);
    }
    for (const hold of geometry.holds) polyline(group, 'hold', hold);
    if (geometry.loc) polyline(group, 'loc', [lift(geometry.loc.from), lift(geometry.loc.to)]);
    if (geometry.glidepath) polyline(group, 'gp', [geometry.glidepath.from, geometry.glidepath.to]);
    if (geometry.radial) polyline(group, 'radial', [lift(geometry.radial.from), lift(geometry.radial.to)]);
    if (geometry.centreline) polyline(group, 'loc', [lift(geometry.centreline.from), lift(geometry.centreline.to)]);
    for (const fix of geometry.fixes) {
      const point = at(fix);
      if (!points.has(group)) points.set(group, []);
      points.get(group).push(point.x, point.y, point.z);
      fixes.push({ key: `${icao}|${a.id}|${fix.ident}`, icao, approach: a.id, ident: fix.ident, role: fix.role, text: fixLabel(fix), title: fixTitle(fix, a), point });
    }
    const said = a.estimate
      ? `${icao} ${a.name}: centreline out to 10 NM and a ${a.gpaDeg}° path to ${feet(a.tchFt)} ft over the threshold (estimate, not the published procedure)`
      : `${icao} ${a.name}${a.gps ? ' (GPS: the T-6A can’t rely on it, AFMAN 4.17.3)' : ''}`;
    const gp = geometry.glidepath ? ` ${a.kind === 'ils' ? 'Glide slope' : 'Coded descent angle'} ${geometry.glidepath.angleDeg}°${geometry.glidepath.tchFt ? `, TCH ${geometry.glidepath.tchFt} ft` : ''}.` : '';
    const loc = geometry.loc ? ` Localizer ${geometry.loc.ident}, course ${Math.round(geometry.loc.crsTrue)}° true.` : '';
    const radial = geometry.radial ? ` Final course from ${geometry.radial.kind} ${geometry.radial.ident}.` : '';
    const fixWords = geometry.fixes.filter((f) => f.role).map((f) => `${f.ident} ${f.role} ${altWords(f.alt)}`).join('; ');
    lines.push({
      key: `${icao}|${a.id}`,
      text: said,
      title: `${said}.${gp}${loc}${radial}${fixWords ? ` ${fixWords}.` : ''} Between constraints the path is drawn as straight lines; a “between” is drawn at its lower altitude. A picture, never for navigation.`,
      paths: geometry.paths.filter((p) => p.seg !== 'missed').map((p) => p.points.map(at)),
    });
  }

  for (const [key, positions] of buckets) {
    const [group, style] = key.split('|');
    const look = APPROACH_GROUPS[group] ?? APPROACH_GROUPS.rnav;
    const dashed = style === 'missed' || style === 'loc' || style === 'radial' || style === 'dashed';
    const opacity = Math.min(1, look.opacity * (style === 'gp' ? 1.2 : style === 'hold' || style === 'missed' ? 0.75 : style === 'loc' || style === 'radial' ? 0.8 : 1));
    const material = own(dashed
      ? new T.LineDashedMaterial({ color: look.colour, transparent: true, opacity, depthWrite: false, ...DASH })
      : new T.LineBasicMaterial({ color: style === 'gp' ? '#ffffff' : look.colour, transparent: true, opacity: style === 'gp' ? Math.min(1, opacity) * (group === 'rnav' ? 0.6 : 0.9) : opacity, depthWrite: false }));
    const geometry = own(new T.BufferGeometry());
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    const segs = new T.LineSegments(geometry, material);
    if (dashed) segs.computeLineDistances();
    segs.renderOrder = 4;
    segs.name = `approaches-${key}`;
    root.add(segs);
  }
  for (const [group, positions] of points) {
    const look = APPROACH_GROUPS[group] ?? APPROACH_GROUPS.rnav;
    const geometry = own(new T.BufferGeometry());
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    const material = own(new T.PointsMaterial({ color: look.colour, size: FIX_PX, sizeAttenuation: false, transparent: true, opacity: Math.max(0.6, look.opacity), depthWrite: false }));
    const pts = new T.Points(geometry, material);
    pts.renderOrder = 5;
    root.add(pts);
  }

  return {
    root,
    fixes,
    lines,
    summary: { approaches: count, fixes: fixes.length },
    dispose() {
      root.removeFromParent();
      for (const thing of owned) thing.dispose?.();
    },
  };
}
