// The airfields in a 3D view (SPEC-sof, "3D view", SOF-39; Dad, 7 Oct: "model the airport like in the pattern sim ... swift regina and saskatoon").
// Moved from the SOF to ui-kit on 10 Oct 2026 so the Debrief's 3D draws the same airfields (SOF-62, DB-24; Dad: "use the airfield graphics like pattern sim too").
// For each airport in src/airfields/airports-data.js inside the area the caller gives (`halfFt`), every runway is drawn as a flat strip between its two thresholds at their true
// positions, true length (the distance between the two ends) and width: dark asphalt, white edge lines, a dashed centreline, a bar of stripes
// ("piano keys") at each end and the runway number at each end as a flat texture, written so it reads from the approach end. A few low boxes stand
// for a terminal and hangars beside the field. The boxes are schematic: no source gives their places or sizes.
//
// It only builds three.js objects. What to draw is plain data from the runway list (runwayGeometry, markingBoxes), kept apart from the objects so
// they can be checked without a page. The page's words (the toggle, the key) are view3d.js's.
//
// World frame as the SOF's view3d.js and the Debrief's: X east, Y north, Z up, in the map's local feet. A runway stands at its field's elevation times the height scale, but
// never below the ground the view draws (the ground is flat at home's elevation, so a field lower than home would be hidden under it), and a little
// above it so the picture of the ground never hides it.
//
// Minimum drawn size: at 250 NM across a 150 ft wide runway is a fraction of a pixel, so `fit(ftPerPx)` scales each field up about its middle until
// its longest runway is at least RUNWAY_MIN_PX.length pixels long, and widens each runway until it is at least RUNWAY_MIN_PX.width pixels across,
// the same idea as the aircraft's minimum size. Piano keys, centreline and numbers are only drawn once a runway is RUNWAY_MIN_PX.detail pixels long
// (they would be a smear before). Close up everything is at its true size.
//
// Built again only when the airports, the height scale, the ground or home changes; the whole group is switched with `.visible`. `dispose()` frees everything.
import { AIRPORTS } from '../airfields/airports-data.js';

/** Minimum drawn sizes in screen pixels. Estimates for readability (SOF-39), like the aircraft's SIZE_PX. */
export const RUNWAY_MIN_PX = Object.freeze({ length: 40, width: 3, detail: 80 });
/** Colours, estimates for readability: dark asphalt that still reads against the dimmed satellite ground, white paint, grey-blue buildings. */
export const AIRPORT_COLOURS = Object.freeze({ asphalt: '#3d4248', paint: '#f4f4ee', terminal: '#8a96a1', hangar: '#6c7782' });
/** A runway sits this far (scene feet) above the ground picture, so it is never hidden by it. An estimate. */
const LIFT_FT = 40;
/** Each layer of paint sits this much above the one under it (scene feet), with a polygon offset as well, so the layers never fight for the same depth. */
const LAYER_FT = 3;

// Marking sizes in feet. The shapes follow the usual runway markings (ICAO Annex 14 / TP 312: threshold stripes, a dashed centreline, edge lines,
// numbers at the ends); the sizes are rounded estimates for a schematic picture, not copied from a standard.
const EDGE_FT = 3.5;
const CENTRE_DASH_FT = Object.freeze({ dash: 120, gap: 80, width: 3.5 });
const KEYS_FT = Object.freeze({ fromThreshold: 20, length: 100 });
/** The number's block: across is this share of the runway's width and along this many times the width, starting this far from the threshold bar. */
const NUMBER_BLOCK = Object.freeze({ across: 0.7, along: 0.95, gapFt: 40 });
/** The terminal and hangars: footprint and height in feet, and how far from the runway's edge. Schematic; no source gives them. */
const BUILDINGS = Object.freeze([
  { name: 'terminal', along: 420, across: 150, height: 40, colour: 'terminal', shift: 0 },
  { name: 'hangar', along: 260, across: 130, height: 35, colour: 'hangar', shift: 520 },
  { name: 'hangar', along: 260, across: 130, height: 35, colour: 'hangar', shift: -520 },
]);
const BUILDING_OFFSET_FT = 700;

/** How many stripes a threshold bar has for a runway width (ICAO Annex 14: 4 at 18 m, 6 at 23 m, 8 at 30 m, 12 at 45 m, 16 at 60 m). */
export function keyCount(widthFt) {
  const m = widthFt * 0.3048;
  if (m >= 55) return 16;
  if (m >= 40) return 12;
  if (m >= 28) return 8;
  if (m >= 21) return 6;
  return 4;
}

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/** An airport's elevation in feet from airports-data.js, or null when the ICAO is not listed. */
export function airportElevationFt(icao, airports = AIRPORTS) {
  const found = airports.find((a) => a.icao === icao);
  return found && isNumber(found.elevationFt) ? found.elevationFt : null;
}

/**
 * One runway in the map's feet. `runway` is an airports-data.js runway ({ ends, widthFt, a, b }); `toXY(lat, lon)` gives [x, y].
 * Returns { ends: [nameAtA, nameAtB], ax, ay, bx, by, cx, cy, lengthFt, widthFt, angle } or null when an end has no usable place.
 * `lengthFt` is the distance between the two thresholds as plotted (true length), `angle` the direction from end a to end b in radians
 * counterclockwise from east.
 */
export function runwayGeometry(runway, toXY) {
  const a = runway?.a;
  const b = runway?.b;
  if (![a?.lat, a?.lon, b?.lat, b?.lon].every(isNumber)) return null;
  const [ax, ay] = toXY(a.lat, a.lon);
  const [bx, by] = toXY(b.lat, b.lon);
  const lengthFt = Math.hypot(bx - ax, by - ay);
  if (!(lengthFt > 100)) return null;
  const ends = Array.isArray(runway.ends) && runway.ends.length === 2 ? runway.ends.map(String) : ['', ''];
  return {
    ends,
    ax, ay, bx, by,
    cx: (ax + bx) / 2,
    cy: (ay + by) / 2,
    lengthFt,
    widthFt: isNumber(runway.widthFt) && runway.widthFt > 0 ? runway.widthFt : 100,
    angle: Math.atan2(by - ay, bx - ax),
  };
}

/**
 * The paint on a runway as rectangles in the runway's own feet: x along (from its middle towards end b, so end a is at -length / 2), y across
 * (to the left of that direction). Each is [x0, x1, y0, y1]. Returns { edges, dashes, keys }: the two edge lines, the centreline's dashes
 * (from clear of each end's number block to the other's) and the threshold stripes at both ends.
 */
export function markingBoxes({ lengthFt, widthFt }) {
  const half = lengthFt / 2;
  const w = widthFt / 2;
  const edges = [[-half, half, w - EDGE_FT * 1.5, w - EDGE_FT * 0.5], [-half, half, -w + EDGE_FT * 0.5, -w + EDGE_FT * 1.5]];
  const n = keyCount(widthFt);
  const pitch = (widthFt - 4 * EDGE_FT) / n;
  const stripe = pitch * 0.55;
  const keys = [];
  for (let i = 0; i < n; i++) {
    const y = (i - (n - 1) / 2) * pitch;
    keys.push([-half + KEYS_FT.fromThreshold, -half + KEYS_FT.fromThreshold + KEYS_FT.length, y - stripe / 2, y + stripe / 2]);
    keys.push([half - KEYS_FT.fromThreshold - KEYS_FT.length, half - KEYS_FT.fromThreshold, y - stripe / 2, y + stripe / 2]);
  }
  const clear = KEYS_FT.fromThreshold + KEYS_FT.length + NUMBER_BLOCK.gapFt + NUMBER_BLOCK.along * widthFt + 60;
  const dashes = [];
  for (let x = -half + clear; x + CENTRE_DASH_FT.dash <= half - clear + 1e-6; x += CENTRE_DASH_FT.dash + CENTRE_DASH_FT.gap) {
    dashes.push([x, x + CENTRE_DASH_FT.dash, -CENTRE_DASH_FT.width / 2, CENTRE_DASH_FT.width / 2]);
  }
  return { edges, dashes, keys };
}

/** A set of rectangles as one list of triangles (positions only), each rectangle at height `z` in its group's own units. */
function rectGeometry(T, boxes, z) {
  const p = new Float32Array(boxes.length * 18);
  boxes.forEach(([x0, x1, y0, y1], i) => {
    p.set([x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z], i * 18);
  });
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(p, 3));
  return g;
}

/** The runway number as a texture: the digits on top, the L, R or C under them (nearer the threshold), white on clear. */
function numberTexture(T, doc, text) {
  const canvas = doc.createElement('canvas');
  canvas.width = 128;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  const digits = text.replace(/[^0-9]/g, '');
  const side = text.replace(/[0-9]/g, '');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = AIRPORT_COLOURS.paint;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${side ? 84 : 110}px system-ui, sans-serif`;
  ctx.fillText(digits, 64, side ? 62 : 96, 124);
  if (side) {
    ctx.font = 'bold 84px system-ui, sans-serif';
    ctx.fillText(side, 64, 144, 124);
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Where the terminal block goes: beside the longest runway, on the side farthest from the field's other runways. Returns { x, y, angle } in field feet, or null. */
function buildingSpot(runways, c0) {
  const main = [...runways].sort((r, s) => s.lengthFt - r.lengthFt)[0];
  if (!main) return null;
  const nx = -Math.sin(main.angle);
  const ny = Math.cos(main.angle);
  const others = runways.filter((r) => r !== main);
  const spots = [1, -1].map((side) => {
    const off = main.widthFt / 2 + BUILDING_OFFSET_FT;
    return { x: main.cx - c0.x + nx * side * off, y: main.cy - c0.y + ny * side * off, angle: main.angle };
  });
  const clearance = (s) => Math.min(Infinity, ...others.flatMap((r) => [[r.ax, r.ay], [r.bx, r.by], [r.cx, r.cy]].map(([x, y]) => Math.hypot(x - c0.x - s.x, y - c0.y - s.y))));
  return spots.sort((s, t) => clearance(t) - clearance(s))[0];
}

/**
 * Builds the airports. `T` is three.js; `toXY(lat, lon)` gives [x, y] in the map's feet; `scale` is the height scale; `groundFt` the ground the view draws
 * (feet above sea level); `doc` makes the number textures' canvases; `airports` is airports-data.js's list unless a test gives its own; `halfFt` is half the
 * width of the square kept round the map's origin (the SOF passes half its "3D area"; with none every airport is kept).
 * An airport with no runway that plots, or whose middle is outside the area, is skipped.
 *
 * Returns { root, summary, fit(ftPerPx), dispose() }: `root` holds one Group per airport; `summary` is [{ icao, runways, ends: ['11L', ...], elevationFt }]
 * for the key; `fit(ftPerPx)` applies the minimum drawn size for the camera's scene feet per screen pixel.
 */
export function buildAirports(T, { toXY, scale, groundFt, doc = globalThis.document, airports = AIRPORTS, halfFt = Infinity }) {
  const root = new T.Group();
  root.name = 'airports';
  const owned = [];
  const own = (thing) => {
    owned.push(thing);
    return thing;
  };
  const textures = new Map();
  const planeZ = groundFt * scale;
  const half = halfFt;
  const fields = [];
  const summary = [];

  const paint = (z, layer) => own(new T.MeshBasicMaterial({
    color: AIRPORT_COLOURS.paint, side: T.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -layer * 2, polygonOffsetUnits: -layer * 2,
  }));

  for (const airport of airports) {
    const runways = (airport.runways ?? []).map((r) => runwayGeometry(r, toXY)).filter(Boolean);
    if (!runways.length) continue;
    const c0 = { x: runways.reduce((s, r) => s + r.cx, 0) / runways.length, y: runways.reduce((s, r) => s + r.cy, 0) / runways.length };
    if (Math.abs(c0.x) > half || Math.abs(c0.y) > half) continue;
    const z = Math.max(planeZ, (isNumber(airport.elevationFt) ? airport.elevationFt : groundFt) * scale) + LIFT_FT;
    const field = new T.Group();
    field.name = `airport-${airport.icao}`;
    field.position.set(c0.x, c0.y, z);
    root.add(field);
    const longest = Math.max(...runways.map((r) => r.lengthFt));
    const strips = [];

    for (const r of runways) {
      const group = new T.Group();
      group.position.set(r.cx - c0.x, r.cy - c0.y, 0);
      group.rotation.z = r.angle;
      field.add(group);
      const asphalt = new T.Mesh(
        own(rectGeometry(T, [[-r.lengthFt / 2, r.lengthFt / 2, -r.widthFt / 2, r.widthFt / 2]], 0)),
        own(new T.MeshBasicMaterial({ color: AIRPORT_COLOURS.asphalt, side: T.DoubleSide })),
      );
      const { edges, dashes, keys } = markingBoxes(r);
      const edgeMesh = new T.Mesh(own(rectGeometry(T, edges, LAYER_FT)), paint(LAYER_FT, 1));
      edgeMesh.renderOrder = 4;
      group.add(asphalt, edgeMesh);
      // The paint that is only worth drawing once the runway is long enough on the screen.
      const detail = new T.Group();
      const keyMesh = new T.Mesh(own(rectGeometry(T, keys, LAYER_FT)), paint(LAYER_FT, 1));
      const dashMesh = new T.Mesh(own(rectGeometry(T, dashes, LAYER_FT)), paint(LAYER_FT, 1));
      keyMesh.renderOrder = 4;
      dashMesh.renderOrder = 4;
      detail.add(keyMesh, dashMesh);
      // The numbers lie flat, reading from the approach end: the top of the digits points along the landing run, so a pilot lined up on the
      // runway reads them upright. At end a that is towards end b (+x here), and the digits' left-to-right is across, to the pilot's right (-y).
      const block = { across: r.widthFt * NUMBER_BLOCK.across, along: r.widthFt * NUMBER_BLOCK.along };
      const fromEnd = KEYS_FT.fromThreshold + KEYS_FT.length + NUMBER_BLOCK.gapFt + block.along / 2;
      [[r.ends[0], -1], [r.ends[1], 1]].forEach(([name, side]) => {
        if (!name) return;
        if (!textures.has(name)) textures.set(name, own(numberTexture(T, doc, name)));
        const plane = new T.Mesh(
          own(new T.PlaneGeometry(block.across, block.along)),
          own(new T.MeshBasicMaterial({ map: textures.get(name), transparent: true, depthWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
        );
        plane.position.set(side * (r.lengthFt / 2 - fromEnd), 0, LAYER_FT * 2);
        plane.rotation.z = side < 0 ? -Math.PI / 2 : Math.PI / 2;
        plane.renderOrder = 5;
        detail.add(plane);
      });
      group.add(detail);
      strips.push({ group, detail, r });
    }

    // The terminal and hangars: a few low boxes in a row beside the longest runway.
    const spot = buildingSpot(runways, c0);
    if (spot) {
      const row = new T.Group();
      row.position.set(spot.x, spot.y, 0);
      row.rotation.z = spot.angle;
      for (const b of BUILDINGS) {
        const height = b.height * scale;
        const box = new T.Mesh(own(new T.BoxGeometry(b.along, b.across, height)), own(new T.MeshLambertMaterial({ color: AIRPORT_COLOURS[b.colour] })));
        box.position.set(b.shift, 0, height / 2);
        box.name = `airport-${b.name}`;
        row.add(box);
      }
      field.add(row);
    }

    fields.push({ field, strips, longest });
    summary.push({ icao: airport.icao, runways: runways.length, ends: runways.flatMap((r) => r.ends).filter(Boolean), elevationFt: airport.elevationFt ?? null });
  }

  return {
    root,
    summary,
    /** The minimum drawn size for the camera's scene feet per screen pixel: a field scales about its middle, a runway widens, and the detail waits. */
    fit(ftPerPx) {
      const pxPerFt = 1 / ftPerPx;
      for (const { field, strips, longest } of fields) {
        const s = Math.max(1, RUNWAY_MIN_PX.length / (longest * pxPerFt));
        field.scale.set(s, s, 1);
        for (const { group, detail, r } of strips) {
          const drawnLengthPx = r.lengthFt * s * pxPerFt;
          group.scale.set(1, Math.max(1, RUNWAY_MIN_PX.width / (r.widthFt * s * pxPerFt)), 1);
          const showDetail = drawnLengthPx >= RUNWAY_MIN_PX.detail;
          if (detail.visible !== showDetail) detail.visible = showDetail;
        }
      }
    },
    dispose() {
      for (const thing of owned) thing.dispose();
      root.removeFromParent();
    },
  };
}
