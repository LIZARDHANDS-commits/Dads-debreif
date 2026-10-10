// The runways' and taxiways' paint, drawn as flat shapes over the satellite photo so it stays sharp up close. 29L/11R first
// (Patrick, 6 Oct 06:59Z, card "Paint markings"; 07:05Z: "do the piano keys and centerline as well"; 07:06Z: "and the yellow
// chevrons prior the threshold"; TR-98); then 29R/11L, 03/21 and the taxiways the same way (Patrick, 10 Oct: "paint the taxiways
// and the other runway just like we painted the outer runway, with numbers and markings"; TR-118).
//
// Every size and place is measured off Esri's true-scale photo (zoom 18, about 1.3 ft a pixel; 6 Oct), to about ±3 ft,
// along the runway from the threshold bar of each end. The photo's own paint shows the same layout at both ends.
// The shapes are plain quadrilaterals in map feet (x east, y north), so they have no pixels to blur.

import { THRESHOLD_29L, DEPARTURE_END_29L, THRESHOLD_29R, DEPARTURE_END_29R, RUNWAY_03, RUNWAY_21 } from './airfield.js';
import { AIRFIELD_SURFACE } from './airfield-surface.js';

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
 * The side stripes along both edges, threshold bar to threshold bar (Patrick, 6 Oct 07:33Z: "the entire runway outlined"):
 * 3 ft wide (the usual edge stripe, standard practice; an estimate here), their middles 78 ft either side of the
 * centreline, just outside the piano keys and on the photo's pavement edge (about ±80 ft, photo).
 */
const EDGE_STRIPE = Object.freeze({ widthFt: 3, centreFt: 78 });
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
    case '0': return [arc(6, 15, 4.5, 13.5, 0, 360, 24)];
    case '3': return [[...arc(6, 22.5, 4.5, 6, 150, -90), ...arc(6, 7.5, 4.5, 6, 90, -150).slice(1)]];
    default: return [];
  }
}

/** 29R/11L's end paint (photo, 10 Oct, ±3 ft): as 29L's, but the aiming point 1,308 ft past the bar and the touchdown bars at 490, 981, 1,963 and 2,453 ft, at both ends. */
const END_PAINT_29R = Object.freeze({
  ...END_PAINT,
  aim: Object.freeze({ ...END_PAINT.aim, from: 1308, to: 1455 }),
  tdz: Object.freeze({ ...END_PAINT.tdz, starts: Object.freeze([490, 981, 1963, 2453]) }),
});
/** 29R's threshold bar 33 ft before its runway point, 11L's 5 ft past the other end (photo); the centreline dashes every 197.4 ft from 273 ft past each bar (photo). */
const BAR_29R_FT = -33;
const BAR_11L_PAST_END_FT = 5;
const DASH_PITCH_FT = 197.4;

/** Starts of evenly spaced centreline dashes from `first` until one would come within `lastGap` of `end`, ft along. */
function dashStarts(first, end, lastGap = 0, pitch = DASH_PITCH_FT, skip = () => false) {
  const out = [];
  for (let s0 = first; s0 + CENTRELINE_DASH_FT <= end - lastGap; s0 += pitch) if (!skip(s0)) out.push(s0);
  return out;
}

/** A frame along a line from a to b: place(s, n) is s ft along it and n ft left of it, shifted `shiftAtA` ft left at a, tapering to 0 at b. */
function frame(a, b, shiftAtA = 0) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
  const nx = -uy, ny = ux;
  const place = (s, n) => {
    const shift = shiftAtA * (1 - s / len);
    return { x: a.x + s * ux + (n + shift) * nx, y: a.y + s * uy + (n + shift) * ny };
  };
  return { len, ux, uy, nx, ny, place };
}

/** Drawing helpers that push onto `shapes`. */
function pens(shapes) {
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
  /** Characters centred on the line, bottoms toward s = from, each outlined in black. */
  const text = (place, str, from, G) => {
    const total = str.length * G.wide + (str.length - 1) * G.space;
    [...str].forEach((ch, i) => {
      const left = total / 2 - i * (G.wide + G.space); // n of the character's left edge (x = 0)
      for (const line of glyphLines(ch)) {
        for (let j = 1; j < line.length; j++) {
          const [x0, y0] = line[j - 1], [x1, y1] = line[j];
          stroke('black', place, from + y0, left - x0, from + y1, left - x1, G.stroke + 2 * OUTLINE_FT);
          stroke('white', place, from + y0, left - x0, from + y1, left - x1, G.stroke);
        }
      }
    });
  };
  return { quad, stroke, outlinedQuad, text };
}

/**
 * One full runway's paint (29L/11R's set, TR-98, TR-100, TR-111): the grey runway, both ends' bars, piano keys, letter and number,
 * aiming point, touchdown bars and pad chevrons, the edge stripes and the centreline. barA and barB are the threshold bars'
 * middles in ft along a to b; `ends` the two ends' { letter, number, layout } (A's first).
 */
function paintRunway(shapes, { a, b, shiftAtA = 0, barA, barB, ends, centreline }) {
  const { len, place: at } = frame(a, b, shiftAtA);
  const { quad, stroke, outlinedQuad, text } = pens(shapes);
  const bB = barB(len);
  // The grey runway under the paint: bar to bar, out to the side stripes' outer edges, first so everything else draws over it.
  const P0 = ends[0].layout;
  const edgeFt = EDGE_STRIPE.centreFt + EDGE_STRIPE.widthFt / 2 + OUTLINE_FT;
  quad('asphalt', at, barA - P0.bar.to, bB - P0.bar.from, -edgeFt, edgeFt);

  const places = [(s, n) => at(barA + s, n), (s, n) => at(bB - s, -n)];
  ends.forEach(({ letter, number, layout: P }, e) => {
    const place = places[e];
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
    text(place, letter, P.letterFrom, P.glyph);
    text(place, number, P.numberFrom, P.glyph);
    // Yellow chevrons on the pad before the bar: two arms from each apex, cut to the pad. The pad itself in the runway's grey
    // (TR-126; Patrick, 10 Oct: "and the chevroned area before the runway threshold").
    const C = P.chevrons;
    quad('asphalt', place, C.padFrom, P.bar.from, -P.bar.halfWidth, P.bar.halfWidth);
    for (const apex of C.apexes) {
      const t0 = Math.max(0, apex - C.padTo), t1 = Math.min(apex - C.padFrom, C.maxAcross / C.slope);
      if (t1 <= t0) continue;
      for (const side of [-1, 1]) stroke('yellow', place, apex - t0, side * C.slope * t0, apex - t1, side * C.slope * t1, C.width);
    }
  });
  for (const side of [-1, 1]) {
    const c = side * EDGE_STRIPE.centreFt;
    outlinedQuad(at, barA - P0.bar.to, bB - P0.bar.from, c - EDGE_STRIPE.widthFt / 2, c + EDGE_STRIPE.widthFt / 2);
  }
  for (const s0 of centreline(len, bB)) outlinedQuad(at, s0, s0 + CENTRELINE_DASH_FT, -CENTRELINE_WIDTH_FT / 2, CENTRELINE_WIDTH_FT / 2);
}

/**
 * A runway-holding position (TR-118): four yellow lines across, each 0.5 ft wide with 0.5 ft between them, the two solid
 * ones on the holding side (away from the runway) and the two dashed (3 ft dashes, 3 ft gaps) toward it. The FAA's layout
 * (AC 150/5340-1, standard practice, not a Canadian source); the photo shows four-line yellow bars at these places.
 */
const HOLD = Object.freeze({ line: 0.5, gap: 0.5, dash: 3 });
function holdLine(shapes, place, s, halfWidth, away) {
  const { quad } = pens(shapes);
  for (let k = 0; k < 4; k++) {
    const s0 = s + away * k * (HOLD.line + HOLD.gap); // k 0, 1 dashed (runway side); 2, 3 solid
    const [lo, hi] = away > 0 ? [s0, s0 + HOLD.line] : [s0 - HOLD.line, s0];
    if (k >= 2) quad('yellow', place, lo, hi, -halfWidth, halfWidth);
    else for (let n = -halfWidth; n < halfWidth; n += 2 * HOLD.dash) quad('yellow', place, lo, hi, n, Math.min(halfWidth, n + HOLD.dash));
  }
}

/**
 * Runway 03/21 as the photo shows it (10 Oct): no piano keys or touchdown bars, only "03" and "21", the centreline dashes and
 * the yellow holding positions across it 250 ft from 29L's and 29R's centrelines. Places in ft along 03 to 21 (photo, ±3 ft).
 */
const PAINT_0321 = Object.freeze({
  numberFrom03: 278, // ft along from 03's runway point
  numberFrom21: 133, // ft back from 21's runway point
  holds: Object.freeze([{ s: 305, away: 1 }, { s: 1548, away: -1 }, { s: 2167, away: 1 }]),
  halfWidth: 50,
  dashesFrom: 330,
  dashesTo: 2850,
  crossing29R: 1800, // where 29R crosses (photo); no dashes within 120 ft of it
});

/**
 * The taxiways' centrelines, ft from the ARP, traced off Esri's photo (10 Oct, about ±10 ft), and their widths. The letters
 * are working labels except Echo (Patrick, 10 Oct). Echo is open again, narrower and repaved, 50 ft wide (Patrick, 10 Oct: card "About 50 ft");
 * like every taxiway it is drawn in the runways' grey (TR-126; it was fresh black, TR-118).
 */
export const TAXIWAYS = Object.freeze([
  // Re-centred on the traced pavement (TR-127): each line moved to the middle of its pavement, measured across it every few
  // hundred feet (they had sat 7 to 45 ft off; G 136 ft). widthFt is the pavement's measured width, for the holding positions.
  // The grey itself is the built surface (airfield-surface.js, TR-128); no taxiway draws its own strip now.
  { id: 'A', widthFt: 82, pts: [[-3507, 2882], [-3465, 3034], [-687, 1808]] },
  { id: 'B', widthFt: 85, pts: [[-2564, 2497], [-3519, 712]] },
  { id: 'C', widthFt: 72, pts: [[-772, 1736], [-932, 1416]] },
  { id: 'Echo', widthFt: 50, pts: [[-1216, 1452], [235, -1382]] }, // repaved, 50 ft, centred on its old concrete (TR-128)
  { id: 'D', widthFt: 84, pts: [[1611, 1636], [2311, 936]] },
  { id: 'F', widthFt: 84, pts: [[2295, 919], [3506, -31], [3663, -287], [3778, -760], [3769, -844], [3583, -1166]] },
  { id: 'F2', widthFt: 83, pts: [[3607, -1181], [2785, -2752]] },
  { id: 'G', widthFt: 150, pts: [[1650, 1908], [2250, 2558]] },
  { id: 'H', widthFt: 33, pts: [[2038, 2269], [2488, 1889]] },
]);
/** Taxiway centreline: yellow, 0.5 ft wide (6 in, standard practice; an estimate, as the photo is too faded to show it). */
const TAXI_LINE_FT = 0.5;
/** Holding positions stand 250 ft from the runway centreline (measured on taxiway B, photo). */
const HOLD_FROM_CENTRELINE_FT = 250;

/** The runways the taxiway paint stops at and holds short of: line, half width of pavement, and along-runway extent (bars plus pads). */
function runwayBoxes() {
  const box = (a, b, half, padFt) => {
    const f = frame(a, b);
    return { ...f, a, half, lo: -padFt, hi: f.len + padFt };
  };
  return {
    holdFor: [box(THRESHOLD_29L, DEPARTURE_END_29L, 80, 250), box(THRESHOLD_29R, DEPARTURE_END_29R, 80, 250)],
    clip: [box(THRESHOLD_29L, DEPARTURE_END_29L, 80, 10), box(THRESHOLD_29R, DEPARTURE_END_29R, 80, 40), box(RUNWAY_03, RUNWAY_21, 52, 0)],
  };
}
const local = (r, x, y) => {
  const dx = x - r.a.x, dy = y - r.a.y;
  return { s: dx * r.ux + dy * r.uy, n: dx * r.nx + dy * r.ny };
};
const onRunway = (boxes, x, y) => boxes.some((r) => {
  const { s, n } = local(r, x, y);
  return s >= r.lo && s <= r.hi && Math.abs(n) <= r.half;
});




function paintTaxiways(shapes) {
  const { holdFor, clip } = runwayBoxes();
  for (const tw of TAXIWAYS) {
    for (let k = 1; k < tw.pts.length; k++) {
      const [ax, ay] = tw.pts[k - 1], [bx, by] = tw.pts[k];
      const f = frame({ x: ax, y: ay }, { x: bx, y: by });
      const { quad } = pens(shapes);
      // The centreline, left off where it runs on a runway.
      let from = null;
      const STEP = 2;
      for (let t = 0; t <= f.len + 1e-6; t += STEP) {
        const p = f.place(Math.min(t, f.len), 0);
        const off = onRunway(clip, p.x, p.y);
        if (!off && from === null) from = t;
        if ((off || t + STEP > f.len) && from !== null) {
          const to = off ? t - STEP : f.len;
          if (to > from) quad('yellow', f.place, from, to, -TAXI_LINE_FT / 2, TAXI_LINE_FT / 2);
          from = null;
        }
      }
      // Holding positions where the taxiway comes within HOLD_FROM_CENTRELINE_FT of 29L's or 29R's centreline.
      for (const r of holdFor) {
        let prev = null;
        for (let t = 0; t <= f.len; t += 1) {
          const p = f.place(t, 0);
          const { s, n } = local(r, p.x, p.y);
          const inside = s >= r.lo && s <= r.hi && Math.abs(n) < HOLD_FROM_CENTRELINE_FT;
          if (prev !== null && inside !== prev) holdLine(shapes, f.place, inside ? t - 1 : t, tw.widthFt / 2, inside ? -1 : 1);
          prev = inside;
        }
      }
    }
  }
}

/**
 * The paint as filled shapes: [{ color: 'asphalt' | 'fresh' | 'black' | 'white' | 'yellow', pts: [{ x, y }, ...] }], each a convex quadrilateral in map ft.
 */
export function runwayMarkingPolygons() {
  const shapes = [];
  // 29L/11R (TR-98): its own measured centreline dashes.
  paintRunway(shapes, {
    a: THRESHOLD_29L, b: DEPARTURE_END_29L, shiftAtA: SHIFT_AT_29L_FT, barA: BAR_29L_FT, barB: (len) => len + BAR_11R_PAST_END_FT,
    ends: [{ letter: 'L', number: '29', layout: END_PAINT }, { letter: 'R', number: '11', layout: END_PAINT }],
    centreline: () => CENTRELINE_STARTS_FT,
  });
  // 29R/11L (TR-118): the same set, its own aiming point and touchdown bars, dashes evenly spaced from 273 ft past each bar.
  paintRunway(shapes, {
    a: THRESHOLD_29R, b: DEPARTURE_END_29R, barA: BAR_29R_FT, barB: (len) => len + BAR_11L_PAST_END_FT,
    ends: [{ letter: 'R', number: '29', layout: END_PAINT_29R }, { letter: 'L', number: '11', layout: END_PAINT_29R }],
    centreline: (len, barB) => dashStarts(BAR_29R_FT + 273, barB, 273),
  });
  // 03/21 (TR-118): numbers, centreline and holding positions. Its grey, with the ramp's and the taxiways', is the traced surface (TR-127).
  const r = frame(RUNWAY_03, RUNWAY_21);
  const { text, outlinedQuad } = pens(shapes);
  const Q = PAINT_0321;

  text(r.place, '03', Q.numberFrom03, END_PAINT.glyph);
  text((s, n) => r.place(r.len - s, -n), '21', Q.numberFrom21, END_PAINT.glyph);
  for (const s0 of dashStarts(Q.dashesFrom, Q.dashesTo, 0, DASH_PITCH_FT, (s0) => s0 + CENTRELINE_DASH_FT > Q.crossing29R - 120 && s0 < Q.crossing29R + 120)) {
    outlinedQuad(r.place, s0, s0 + CENTRELINE_DASH_FT, -CENTRELINE_WIDTH_FT / 2, CENTRELINE_WIDTH_FT / 2);
  }
  for (const { s, away } of Q.holds) holdLine(shapes, r.place, s, Q.halfWidth, away);
  paintTaxiways(shapes);
  return shapes;
}

/**
 * The colours, bottom first: the runway's and taxiways' grey (the stand-in ground's runway grey before TR-107), the outlines' black,
 * white, and the pad chevrons' yellow (photo).
 */
const PAINT = Object.freeze({ asphalt: '#262b30', black: '#141414', white: '#f2f2ee', yellow: '#e9c349' });
/** Each colour's place in the drawing order: the grey first, then the outlines, then the paint. */
const ORDER = Object.freeze({ asphalt: -0.6, black: -0.55, white: -0.5, yellow: -0.5 });

/**
 * The paint as a three.js group of four flat meshes (the grey runway, black outlines, white and yellow), at height 0; the 3D view lifts it to just over
 * the photo. It draws after the ground photos and before everything else.
 */
export function createRunwayMarkings(THREE) {
  const group = new THREE.Group();
  group.name = 'runway-markings';
  const shapes = runwayMarkingPolygons();
  // The traced paved surface (TR-127) as triangles, drawn with the runways' grey.
  const surface = [];
  for (const { outer, holes } of AIRFIELD_SURFACE) {
    const ring = outer.map(([x, y]) => new THREE.Vector2(x, y));
    const holeRings = holes.map((h) => h.map(([x, y]) => new THREE.Vector2(x, y)));
    const tris = THREE.ShapeUtils.triangulateShape(ring, holeRings); // turns the rings round in place: index them afterwards
    const all = [...ring, ...holeRings.flat()];
    for (const tri of tris) for (const k of tri) surface.push(all[k].x, all[k].y);
  }
  for (const color of Object.keys(PAINT)) {
    const mine = shapes.filter((s) => s.color === color);
    const extra = color === 'asphalt' ? surface.length / 2 : 0;
    const pos = new Float32Array((mine.length * 6 + extra) * 3);
    let i = 0;
    for (const { pts } of mine) {
      for (const k of [0, 1, 2, 0, 2, 3]) {
        pos[i++] = pts[k].x;
        pos[i++] = pts[k].y;
        pos[i++] = 0;
      }
    }
    for (let j = 0; j < extra; j++) {
      pos[i++] = surface[2 * j];
      pos[i++] = surface[2 * j + 1];
      pos[i++] = 0;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // Marked see-through (fully opaque) so it sorts with the see-through photos and draws after them.
    const material = new THREE.MeshBasicMaterial({ color: PAINT[color], transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = ORDER[color];
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
