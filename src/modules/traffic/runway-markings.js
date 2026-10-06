// Runway 29L/11R's paint, drawn as flat shapes over the satellite photo so it stays sharp up close (Patrick, 6 Oct
// 06:59Z, card "Paint markings"; 07:05Z: "we only need to do 29L 11R", "do the piano keys and centerline as well";
// 07:06Z: "and the yellow chevrons prior the threshold"; TR-98).
//
// Every size and place is measured off Esri's true-scale photo (zoom 18, about 1.3 ft a pixel; 6 Oct), to about ±3 ft,
// along the runway from the threshold bar of each end. The photo's own paint shows the same layout at both ends.
// The shapes are plain quadrilaterals in map feet (x east, y north), so they have no pixels to blur.

import { THRESHOLD_29L, DEPARTURE_END_29L } from './airfield.js';

/** How far the painted centreline sits left of the drawn one (looking down 29L), ft: 3 at the 29L end, 0 at 11R (photo). */
const SHIFT_AT_29L_FT = 3;

/**
 * One end's paint, ft along its own landing direction from its threshold bar's middle, and across from the centreline
 * (left positive, looking down the runway). The same at both ends (photo).
 */
const END_PAINT = Object.freeze({
  bar: Object.freeze({ from: -3, to: 3, halfWidth: 75 }),
  /** 12 piano keys, 6 ft wide, 100 ft long, 6 a side of a centre gap. */
  keys: Object.freeze({ from: 16, to: 116, width: 6, innerCentre: 9.4, pitch: 12.4, perSide: 6 }),
  /** The runway letter, then the number, each 30 ft long, their characters 12 ft wide with a 5 ft space, 3 ft strokes. */
  letterFrom: 153,
  numberFrom: 203,
  glyph: Object.freeze({ long: 30, wide: 12, space: 5, stroke: 3 }),
  /** The aiming point: a 147 ft by 22 ft block each side. */
  aim: Object.freeze({ from: 976, to: 1123, inner: 36, outer: 58 }),
  /** Touchdown zone bars, 74 ft by 11 ft each side. */
  tdz: Object.freeze({ starts: Object.freeze([487, 1467, 1956, 2444]), long: 74, inner: 36, outer: 47 }),
  /** Yellow chevrons on the 206 ft pad before the bar, pointing at the runway: apexes, arm slope (ft across per ft along), 3 ft lines. */
  chevrons: Object.freeze({ apexes: Object.freeze([-182, -83, 15]), padFrom: -206, padTo: -6, slope: 1.25, maxAcross: 64, width: 3 }),
});

/** Each end's threshold bar middle, ft along 29L from its threshold point (photo): 29L 1 ft short of it, 11R 4 ft past its end. */
const BAR_29L_FT = -1;
const BAR_11R_PAST_END_FT = 4;

/** The centreline dashes, 98 ft long and 3 ft wide, by their starts in ft along 29L from its threshold point (photo). */
const CENTRELINE_DASH_FT = 98;
const CENTRELINE_WIDTH_FT = 3;
/**
 * The black outline round the piano keys, letters, numbers and centreline dashes, ft (Patrick, 6 Oct 07:24Z: "outline ... in
 * black"; 07:29Z: 1.5 ft "too thick"). 6 in, the black border real paint on light concrete gets (FAA AC 150/5340-1, standard
 * practice, not a Canadian source).
 */
const OUTLINE_FT = 0.5;
const CENTRELINE_STARTS_FT = Object.freeze([
  271, 467, 663, 859, 1055, 1251, 1449, 1645, 1840, 2037, 2232, 2429, 2626, 2823, 3019, 3216, 3413, 3609, 3802, 4000,
  4197, 4393, 4589, 4786, 4983, 5178, 5366, 5556, 5747, 5936, 6126, 6316, 6505, 6695, 6884,
]);

/** The characters' centre lines in a 12 ft wide by 30 ft long box (x to the pilot's right, y down the runway), as polylines. */
function glyphLines(ch) {
  const arc = (cx, cy, rx, ry, a0, a1, n = 8) => Array.from({ length: n + 1 }, (_, i) => {
    const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
  switch (ch) {
    case '1': return [[[6, 0], [6, 30]]];
    case 'L': return [[[1.5, 30], [1.5, 1.5], [12, 1.5]]];
    case 'R': return [[[1.5, 0], [1.5, 28.5], [6, 28.5], ...arc(6, 22.5, 4.5, 6, 90, -90).slice(1), [1.5, 16.5]], [[6, 16.5], [10.5, 0]]];
    case '2': return [[...arc(6, 22.5, 4.5, 6, 180, -30), [1.5, 1.5], [12, 1.5]]];
    case '9': return [arc(6, 21, 4.5, 7.5, 0, 360, 16), [[10.5, 21], [10.5, 7], ...arc(6, 7, 4.5, 5.5, 0, -150).slice(1)]];
    default: return [];
  }
}

/**
 * The paint as filled shapes: [{ color: 'black' | 'white' | 'yellow', pts: [{ x, y }, ...] }], each a convex quadrilateral in map ft.
 */
export function runwayMarkingPolygons() {
  const a = THRESHOLD_29L, b = DEPARTURE_END_29L;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
  const nx = -uy, ny = ux; // left of 29L
  /** A place s ft along 29L and n ft left of the painted centreline, in map ft. */
  const at29 = (s, n) => {
    const shift = SHIFT_AT_29L_FT * (1 - s / len);
    return { x: a.x + s * ux + (n + shift) * nx, y: a.y + s * uy + (n + shift) * ny };
  };
  const shapes = [];
  const quad = (color, place, s0, s1, n0, n1) => shapes.push({ color, pts: [place(s0, n0), place(s1, n0), place(s1, n1), place(s0, n1)] });
  /** A straight stroke of width w from (s0, n0) to (s1, n1), as a quadrilateral with square ends. */
  const stroke = (color, place, s0, n0, s1, n1, w) => {
    const l = Math.hypot(s1 - s0, n1 - n0) || 1;
    const ts = (s1 - s0) / l, tn = (n1 - n0) / l, h = w / 2;
    const ps = -tn * h, pn = ts * h; // side
    const es = ts * h, en = tn * h; // square end
    shapes.push({ color, pts: [place(s0 - es + ps, n0 - en + pn), place(s1 + es + ps, n1 + en + pn), place(s1 + es - ps, n1 + en - pn), place(s0 - es - ps, n0 - en - pn)] });
  };

  /** A white rectangle with a black outline OUTLINE_FT wide drawn under it. */
  const outlinedQuad = (place, s0, s1, n0, n1) => {
    quad('black', place, s0 - OUTLINE_FT, s1 + OUTLINE_FT, n0 - OUTLINE_FT, n1 + OUTLINE_FT);
    quad('white', place, s0, s1, n0, n1);
  };

  const P = END_PAINT;
  const ends = [
    { place: (s, n) => at29(BAR_29L_FT + s, n), letter: 'L', number: '29' },
    { place: (s, n) => at29(len + BAR_11R_PAST_END_FT - s, -n), letter: 'R', number: '11' },
  ];
  for (const { place, letter, number } of ends) {
    quad('white', place, P.bar.from, P.bar.to, -P.bar.halfWidth, P.bar.halfWidth);
    for (let k = 0; k < P.keys.perSide; k++) {
      const c = P.keys.innerCentre + k * P.keys.pitch;
      for (const side of [-1, 1]) outlinedQuad(place, P.keys.from, P.keys.to, side * c - P.keys.width / 2, side * c + P.keys.width / 2);
    }
    for (const side of [-1, 1]) {
      quad('white', place, P.aim.from, P.aim.to, side * P.aim.inner, side * P.aim.outer);
      for (const s0 of P.tdz.starts) quad('white', place, s0, s0 + P.tdz.long, side * P.tdz.inner, side * P.tdz.outer);
    }
    // The letter, then the number, centred on the centreline, bottoms toward the threshold.
    const G = P.glyph;
    for (const { text, from } of [{ text: letter, from: P.letterFrom }, { text: number, from: P.numberFrom }]) {
      const total = text.length * G.wide + (text.length - 1) * G.space;
      [...text].forEach((ch, i) => {
        const left = total / 2 - i * (G.wide + G.space); // n of the character's left edge (x = 0)
        for (const line of glyphLines(ch)) {
          for (let j = 1; j < line.length; j++) {
            const [x0, y0] = line[j - 1], [x1, y1] = line[j];
            stroke('black', place, from + y0, left - x0, from + y1, left - x1, G.stroke + 2 * OUTLINE_FT);
            stroke('white', place, from + y0, left - x0, from + y1, left - x1, G.stroke);
          }
        }
      });
    }
    // Yellow chevrons on the pad before the bar: two arms from each apex, cut to the pad.
    const C = P.chevrons;
    for (const apex of C.apexes) {
      const t0 = Math.max(0, apex - C.padTo), t1 = Math.min(apex - C.padFrom, C.maxAcross / C.slope);
      if (t1 <= t0) continue;
      for (const side of [-1, 1]) stroke('yellow', place, apex - t0, side * C.slope * t0, apex - t1, side * C.slope * t1, C.width);
    }
  }
  for (const s0 of CENTRELINE_STARTS_FT) outlinedQuad(at29, s0, s0 + CENTRELINE_DASH_FT, -CENTRELINE_WIDTH_FT / 2, CENTRELINE_WIDTH_FT / 2);
  return shapes;
}

/** The paint's colours: the outlines' black (drawn first, under the rest), white, and the pad chevrons' yellow (photo). */
const PAINT = Object.freeze({ black: '#141414', white: '#f2f2ee', yellow: '#e9c349' });

/**
 * The paint as a three.js group of three flat meshes (black outlines, white and yellow), at height 0; the 3D view lifts it to just over
 * the photo. It draws after the ground photos and before everything else.
 */
export function createRunwayMarkings(THREE) {
  const group = new THREE.Group();
  group.name = 'runway-markings';
  const shapes = runwayMarkingPolygons();
  for (const color of Object.keys(PAINT)) {
    const mine = shapes.filter((s) => s.color === color);
    const pos = new Float32Array(mine.length * 6 * 3);
    let i = 0;
    for (const { pts } of mine) {
      for (const k of [0, 1, 2, 0, 2, 3]) {
        pos[i++] = pts[k].x;
        pos[i++] = pts[k].y;
        pos[i++] = 0;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // Marked see-through (fully opaque) so it sorts with the see-through photos and draws after them.
    const material = new THREE.MeshBasicMaterial({ color: PAINT[color], transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = color === 'black' ? -0.55 : -0.5;
    group.add(mesh);
  }
  return group;
}

/** Frees the paint's geometry and materials. */
export function disposeRunwayMarkings(group) {
  if (!group) return;
  for (const mesh of group.children) {
    mesh.geometry?.dispose?.();
    mesh.material?.dispose?.();
  }
  group.removeFromParent?.();
}
