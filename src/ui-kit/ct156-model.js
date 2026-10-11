// The T-6 as a CT-156 Harvard II (Moose Jaw, RCAF), drawn in code: a lofted fuselage, aerofoil wings and tail, glossy
// paint and small CanvasTexture decals. Fine detail shows up close. From V2.329 the solid parts are swapped for the
// Blender file built from these same shapes once it loads (ALL-33, "the outside from Blender" below); the code's shapes
// stay the one source and show whenever the file doesn't. It imports only ui-kit's ct156-blender.js, and three.js is passed in
// (never imported here, so the home screen bundle stays free of it; see three-aircraft.js
// `loadThree`). Spec: specs/SPEC-ui-kit.md, "3D aircraft (three.js, D138)".
//
// Axes: nose +X, left +Y, up +Z; fly it with rotation order 'ZYX' and
// rotation.set(-bank, -pitch, hdg). Natural length is CT156_UNIT_LENGTH model units
// (nose tip to tail); lengthFt rescales it (pass CT156_UNIT_LENGTH for scale 1).
//
//   const g = createCt156Model(THREE, { color: '#0066ff', number: 1, lengthFt: CT156_UNIT_LENGTH });
//   ... scene.add(g); ...; disposeCt156Model(g);
//
// paint 'harvard' (default): navy scheme, cheat line, chrome spinner, red-tipped
//   prop, roundels, Canada wordmark, red triangles, tail leaf/NATO star/flag/serial, position lights (TS-156).
//   The whole vertical tail is `color` with a light grey leading edge; the ship's number (122 for #1, ct156TailNumber)
//   is on the nose and under the right wing, the serial (156122) low on the fin, as Patrick's photo of 156102.
// paint 'ship': the plain look, everything in `color`; up close only the serial on the fin, the position lights, the
//   exhaust stacks and the canopy frames (TS-156).
//
// Shared geometry, textures and materials are built once per THREE module and
// reference-counted: disposeCt156Model frees a ship's own materials and textures, and the
// shared kit only when the last ship is gone, leaving nothing behind. (three.js keeps a lookup table and its
// reflection-map converter once it has drawn one; those are its own, so a leak check
// measures from a baseline taken after one ship has come and gone.) Every material has fog: false (fog is for
// the ground only, never the aircraft). The decals are drawn on 2D canvases, so this
// needs a document (a browser).

import { aoShaded, loadAo, loadParts } from './ct156-blender.js';

/** The paint setting every module offers: Paint: Harvard / Ship colours, Harvard the default. */
export const PAINT_DEFAULT = 'harvard';
export const PAINT_OPTIONS = Object.freeze([
  Object.freeze({ value: 'harvard', label: 'Harvard' }),
  Object.freeze({ value: 'ship', label: 'Ship colours' }),
]);

export const CT156_UNIT_LENGTH = 1.44; // x from -0.78 (tail) to 0.66 (spinner tip)
/** The real length those units stand for: the T-6A's 33 ft 4 in, nose to tail (the scale of Patrick's photo, below). */
export const CT156_LENGTH_FT = 33 + 4 / 12;

const NAVY = '#151d31';
const rad = (d) => (d * Math.PI) / 180;

// ---------- the shape ----------
// Redrawn (Patrick, 6 Oct: "make the model better ... make it look more like the side profile of a Harvard", with his
// photos of the navy CT-156). The side profile is measured off Patrick's side-on photo of CT-156 156101, scaled so
// nose to tail is the T-6A's 33 ft 4 in (1.44 units; the photo's fin top then sits 10.6 ft above the wheels, against
// the published 10.7 ft). x is along the nose, z up from the spinner's axis.

// Fuselage stations, nose to tail: [x, half-width, top, bottom, squareness]. The top line runs almost flat from the
// spinner back to the fin. Squareness 2 is an ellipse, higher is boxier (flat sides at the cockpit). The nose's top
// line, spinner to windscreen foot, is the side drawing's (ALL-31): 0.85 ft above the spinner's axis 2 ft behind
// the tip, 1.1 ft at 5 ft, 1.45 ft at the windscreen's foot (was 0.65 to 1.0 ft off the photo), so from the front seat
// the spinner hides under the cowl. The belly line is the same drawing's (Patrick, 11 Oct 2026: "analyze the pictures
// ... and IMPROVE IT"): 2.9 ft under the axis at the wing, still 2.3 ft under it 2.2 ft ahead of the tail, closing to
// 1.7 ft at the tail cone (the photo's was about 1 ft deeper all along, the far wing and the low camera adding to it;
// it then rose from 6.3 ft ahead of the tail, up to 4 in too high). The half-widths are the top drawing's (scaled
// by its span): 3 ft 2.6 in across from the windscreen to the rear bow, tapering straight from
// the spinner's backplate to the cowl and from the rear bow to the tail (the front view, scaled by its 97 in prop, gives
// 3 ft 2.2 in; was 3 ft 8.4 in, an estimate). Across the canopy the squareness is set so the canopy's sill stays within
// a quarter inch of where it was (flat sides, as the front view draws them).
const STATIONS = [
  [0.578, 0.034, 0.0363, -0.04, 2.2],
  [0.55, 0.0387, 0.0387, -0.07, 2.3],
  [0.518, 0.0451, 0.0414, -0.083, 2.4],
  [0.437, 0.06, 0.048, -0.095, 2.5],
  [0.329, 0.0677, 0.0563, -0.107, 2.6],
  [0.268, 0.0695, 0.0626, -0.112, 2.89],
  [0.167, 0.0695, 0.043, -0.12, 3.49],
  [-0.009, 0.0694, 0.04, -0.128, 3.77],
  [-0.158, 0.0694, 0.034, -0.118, 3.38],
  [-0.215, 0.0694, 0.0312, -0.112, 2.97],
  [-0.32, 0.052, 0.026, -0.103, 3.0],
  [-0.482, 0.034, 0.014, -0.0958, 2.69],
  [-0.59, 0.023, 0.0, -0.092, 2.4],
  [-0.685, 0.0125, -0.014, -0.0775, 2.3],
  [-0.725, 0.008, -0.024, -0.069, 2.2],
  [-0.744, 0.004, -0.048, -0.068, 2.0],
];
// The top line aft of the fairing, into the tail, is the side drawing's (Patrick, 11 Oct 2026: "the fuselage
// flows down into the tail"): 0.4 ft above the spinner's axis 6.9 ft ahead of the tail, level with it at 4.4 ft and
// 0.4 ft below it at 2.2 ft (was level, 0.5 ft above the axis, back to 4.4 ft ahead of the tail, off the photo).
// From the wing's trailing edge aft, the side drawing scaled by its length to the elevators' trailing edge (Patrick,
// 11 Oct 2026 card "Tail and wing"): the tail cone ends 32.5 ft behind the spinner's tip, 1.3 ft under its axis (was
// 33.3 ft); the belly 2.8 ft under the axis at 17 ft, 2.4 ft at 22.8 ft, 2.1 ft at 29.4 ft and 1.7 ft at 31.7 ft (was
// about 0.3 ft deeper); the top view's half-widths 1.2 ft at 22.2 ft, 0.8 ft at 26.4 ft, 0.5 ft at 28.9 ft and 0.3 ft at
// 31.1 ft (was about 0.23 ft wider each side; read about +-1 in).

// The canopy and the fairing behind it, windscreen foot to where the fairing runs into the fuselage's top: [x,
// half-width, top]. The glass ends at the rear bow (CT156_FRAME_X[2]), squared off there, and the fairing is painted
// (Patrick, 11 Oct 2026: "the very back of the window should be squared off"; the glass ran on past the rear bow to a
// point). The top, windscreen foot to just aft of the centre arch, is the side drawing's (ALL-31): the forward
// bow's crest 2.75 ft above the spinner's axis 11.3 ft behind the tip, the peak 3.45 ft over the centre arch (was
// 3.0 ft over the front seat, off the photo). From the rear bow aft the top is the same drawing's line falling from
// the canopy into the tail: 2.3 ft above the axis at the rear bow, 1.4 ft 2 ft behind it and 0.4 ft where it meets the
// fuselage, 5.8 ft behind it (was 2.4 ft, then a point 2.7 ft behind it, off the photo). Windscreen and forward bow
// stations re-measured on the side drawing 11 Oct 2026 (Fable thread, its 33 ft 4 in bar at 3.05 px/in): the
// windscreen's foot meets the cowl about 8.4 ft behind the spinner tip, the bow band's crest about 10.75 ft behind it
// (its front edge 10.6, aft edge 10.9) and its feet about 11.05 ft, so the band leans about 14.5° with its top
// forward; the model's rows from the foot to the bow moved 0.56 ft (0.024 units) forward to match (the bow crest was
// at 11.3 ft, the foot at 9.1 ft). The drawing's crest reads 2.55 to 2.75 ft above the axis depending on where the
// spinner axis is taken; the 2.75 ft stays. The half-widths from the windscreen
// foot to the centre arch are the top drawing's (measured 11 Oct 2026 against its 33 ft 5 in span):
// the canopy 33.6 in across outside from just behind the forward bow all the way back, 32.8 in at the bow, the
// windscreen narrowing over the 2.2 ft ahead of the bow to its point at the foot (was 30 in at the bow and narrowing
// from there forward, off the photo; the model's one surface is both the outside and the inside, so the glass sits
// about an inch outside the real inside). The rear bow's, 2.55 ft across, nearly the canopy's widest, so the glass
// ends square as in the same top view (was 2.3 ft); the fairing's narrowing behind it is an estimate.
const CANOPY = [
  [0.292, 0.01, 0.0601],
  [0.278, 0.034, 0.0715],
  [0.269, 0.0425, 0.0766],
  [0.26, 0.0495, 0.0817],
  [0.2415, 0.054, 0.0924],
  [0.232, 0.0554, 0.0979],
  [0.214, 0.0572, 0.1083],
  [0.196, 0.059, 0.1188],
  [0.14, 0.0605, 0.1249],
  [0.059, 0.0605, 0.1413],
  [-0.022, 0.0605, 0.149],
  [-0.076, 0.0605, 0.1469],
  [-0.185, 0.06, 0.124],
  [-0.239, 0.055, 0.0978],
  [-0.274, 0.05, 0.0807],
  [-0.32, 0.042, 0.0588],
  [-0.366, 0.033, 0.0415],
  [-0.412, 0.024, 0.0311],
  [-0.458, 0.015, 0.0231],
  [-0.49, 0.008, 0.016],
];
// The cockpit, in model units (from the photo, as the canopy): the canopy frame hoops (the forward one is the windscreen
// bow), the two seats' stations (front, rear; each helmet sits there, its seat back just behind) and the helmets' heights
// (front, rear). ct156-cockpit.js builds the student's view from these, so each number has one copy. The forward bow and
// the helmets are the side drawing's (ALL-31): the bow 11.3 ft behind the spinner tip (was 11.6); the front
// helmet's centre 1.96 ft ahead of the origin and 1.99 ft up, the rear one's 3.4 ft aft and 2.29 ft up (was 1.4 ft
// ahead, 3.0 ft aft, both 2.27 ft up). The front seat then moved 0.95 ft (11 in) forward to the same drawing's front
// pilot re-read on a full copy (Patrick, 11 Oct 2026 07:39Z, "whole cockpit 11 in (except the bow)"): his eye about
// 12.35 ft behind the spinner tip (the first reading's 13.2 ft was off a copy cut short at the tail), so the front
// helmet's centre is now 2.91 ft ahead of the origin; its height and the rear seat unchanged.
export const CT156_FRAME_X = Object.freeze([0.196, -0.022, -0.239]);
export const CT156_SEAT_X = Object.freeze([0.1257, -0.1469]);
export const CT156_HELMET_Z = Object.freeze([0.086, 0.0989]);
/** The spinner's radius at its base less its 0.001-unit tip: 0.67 ft at the base, the side drawing's (ALL-31; was 0.79 ft). */
export const CT156_SPINNER_R = 0.0279;
/** The spinner's outline, tip to base, as [x, radius] in model units: an ogive 0.085 units (2 ft) long (shape an estimate off the photo). */
export function ct156SpinnerProfile(n = 12) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n; // 0 the tip, 1 the base
    out.push([0.66 - 0.085 * t, 0.001 + CT156_SPINNER_R * Math.sin((t * Math.PI) / 2) ** 0.8]);
  }
  return out;
}
/** A table's row at x (rows run from high x to low), each number straight-line between the rows either side. */
function rowAt(rows, x) {
  if (x >= rows[0][0]) return rows[0];
  for (let i = 1; i < rows.length; i++) {
    if (x >= rows[i][0]) {
      const a = rows[i - 1], b = rows[i];
      const t = (a[0] - x) / (a[0] - b[0]);
      return a.map((v, k) => v + (b[k] - v) * t);
    }
  }
  return rows[rows.length - 1];
}
/** A section's middle height and half-height. */
const middleOf = (top, bottom) => [(top + bottom) / 2, (top - bottom) / 2];
/** A point round a fuselage section: theta 0 the left side (+y), pi/2 the top. */
function sectionPoint(sec, theta) {
  const [, w, top, bottom, n] = sec;
  const [zc, h] = middleOf(top, bottom);
  const c = Math.cos(theta), s = Math.sin(theta);
  return [w * Math.sign(c) * Math.abs(c) ** (2 / n), zc + h * Math.sign(s) * Math.abs(s) ** (2 / n)];
}
/** The fuselage's half-width at (x, z), for the decals that hug its side. */
function fuseSurf(x, z) {
  const [, w, top, bottom, n] = rowAt(STATIONS, x);
  const [zc, h] = middleOf(top, bottom);
  const s = Math.min(0.999, Math.abs(z - zc) / h) ** (n / 2);
  return w * Math.sqrt(Math.max(1 - s * s, 1e-6)) ** (2 / n) + 0.0025;
}
/** The height where the fuselage is a given half-width, on its upper side: the canopy's sill. */
function sillZ(x, halfWidth) {
  const [, w, top, bottom, n] = rowAt(STATIONS, x);
  const [zc, h] = middleOf(top, bottom);
  const c = Math.min(1, halfWidth / w) ** (n / 2);
  return zc + h * Math.sqrt(Math.max(1 - c * c, 0)) ** (2 / n);
}
// The cheat line's height along the fuselage: level, 0.6 ft under the spinner's axis, nose number to tail, as on
// Patrick's side photo of 156102 (11 Oct 2026; measured against the dorsal's top and the belly; was 1.0 ft under the
// axis at the nose falling to 1.6 ft at the tail, about 0.9 ft too low aft).
const cheatZ = () => -0.027;

// Wings: a low wing, its root's underside on the belly line (2.9 ft under the axis). A flat centre section 4.1 ft each
// side of the middle, then the outer panels' dihedral, 8.4° on the chord (Patrick, 11 Oct 2026: "the wings start kinda
// straight but then go up"). The drawings: the top view's straight centre section, 49 in each
// side, and the front view's, about 4.2 ft; the side drawing's tip chord 0.73 ft under the axis gives the 8.4° (the
// front view: about 7.4° along the upper surface, 9.7° along the lower; was 8° from the root). The planform is the
// same figure's top view, scaled fore and aft by the side view's 33 ft 4 in, which runs from the spinner's tip to the
// elevators' trailing edge (Patrick, 11 Oct 2026 card "Tail and wing"): the centre section's chord 6.27 ft from 11.09 ft
// behind the spinner's tip, straight across it; the tip's 3.79 ft from 11.98 ft behind it (the side view's root leading
// edge reads 11.15 ft). Until then the figure was read with its 33 ft 4 in ending at the tail cone, which put the wing
// about 0.45 ft aft and 4 % too deep (a 6.5 ft root from 11.6 ft, a 3.9 ft tip). 15 % thick at the root and 12 % at the
// tip (estimates; the front view's root about 12 in and tip about 5.5 in thick agree); the tip 0.722 units out (Patrick,
// 5 Oct: the real span, 33 ft 5 in), so its station along the bent wing is TIP_S.
const WING_Z = -0.112;
const DIHEDRAL = rad(8.4);
const WING_BREAK = 0.177; // the centre section's half-span, units: where the outer panel bends up (wingBend)
const TIP = 0.722;
const TIP_S = WING_BREAK + (TIP - WING_BREAK) / Math.cos(DIHEDRAL);
const WING = [
  { le: 0.1809, s: 0, chord: 0.2707, t: 0.15, z: WING_Z },
  { le: 0.1809, s: WING_BREAK, chord: 0.2707, t: 0.15, z: WING_Z },
  { le: 0.1424, s: TIP_S, chord: 0.1638, t: 0.12, z: WING_Z },
];
const WING_TIP = WING[WING.length - 1];
/** A point of the wing as built flat ([x, y, z], y the station along the span, either side) bent at the centre
 * section's edge: the outer panel turned up DIHEDRAL about the line where it meets the centre section. */
function wingBend([x, y, z]) {
  const a = Math.abs(y);
  if (a <= WING_BREAK) return [x, y, z];
  const d = a - WING_BREAK, h = z - WING_Z;
  const c = Math.cos(DIHEDRAL), s = Math.sin(DIHEDRAL);
  return [x, Math.sign(y) * (WING_BREAK + d * c - h * s), WING_Z + d * s + h * c];
}
// The tailplane across the tail cone 0.9 ft under the axis, 11 ft 4 in across (the top drawing). Its planform is
// the same figure's top view, scaled as the wing's (Patrick, 11 Oct 2026 card "Tail and wing"): the tip's chord 2.36 ft
// from 30.43 ft behind the spinner's tip, 3.67 ft from 29.55 ft 1.4 ft out from the middle, and a thin strake along the
// tail cone's side from 26.5 ft back into it (the side view's root starts at 26.5 ft too); the trailing edge 33.2 ft
// behind the tip at the root and 32.8 ft at the tips, the aircraft's aftmost point, past the tail cone (was 5.6 ft root
// and 4.0 ft tip chords ending at the tail cone).
const STAB = [
  { le: -0.6546, s: -0.245, chord: 0.1019, t: 0.1, z: -0.04 },
  { le: -0.6165, s: -0.06, chord: 0.1585, t: 0.1, z: -0.04 },
  { le: -0.487, s: -0.034, chord: 0.291, t: 0.055, z: -0.04 },
  { le: -0.487, s: 0.034, chord: 0.291, t: 0.055, z: -0.04 },
  { le: -0.6165, s: 0.06, chord: 0.1585, t: 0.1, z: -0.04 },
  { le: -0.6546, s: 0.245, chord: 0.1019, t: 0.1, z: -0.04 },
];
// The fin and rudder: the root buried in the tail cone, the top 0.232 units (5.4 ft) above the spinner's axis. Leading
// and trailing edges are the side drawing's, scaled by its 33 ft 4 in to the elevators' trailing edge (Patrick,
// 11 Oct 2026 card "Tail and wing"): the leading edge swept 15°, meeting the dorsal fin 1.56 ft above the axis 27.1 ft
// behind the spinner's tip; the rudder's trailing edge leaning forward 9°, 31.4 ft behind the tip at the tail cone and
// 30.5 ft at the top (was about 1.5 ft further aft, the drawing read with its length ending at the tail cone).
const FIN = [{ le: -0.4775, s: -0.045, chord: 0.2229, t: 0.09, z: 0 }, { le: -0.5552, s: 0.232, chord: 0.0981, t: 0.09, z: 0 }];
// The ventral fin under the tail, as aerofoil sections down from inside the belly, its outline the side drawing's
// (Patrick, 11 Oct 2026, circled it; scaled as the fin, card "Tail and wing"): its leading edge leaving the belly 25.5 ft
// behind the spinner's tip, its foot 3.3 ft under the axis and 2.8 ft long from 26.0 ft, rising 0.38 ft to the back
// (VENTRAL_RISE), its trailing edge meeting the belly 29.4 ft behind the tip (was about 1 ft further aft and 0.25 ft
// deeper). Thickness an estimate.
const VENTRAL = [{ le: -0.4347, s: -0.08, chord: 0.1853, t: 0.06, z: 0 }, { le: -0.4632, s: -0.1413, chord: 0.1227, t: 0.06, z: 0 }];
const VENTRAL_RISE = 0.134; // the foot's rise per unit aft
// The dorsal fin on the fairing, from where it leaves the fairing into the fin's leading edge, [x, half-width, top]: a
// thin fin, its top line the side drawing's (1.35 ft above the axis 22.8 ft behind the spinner's tip, 1.56 ft
// where it meets the fin at 27.1 ft; scaled as the fin, card "Tail and wing"), the fairing and fuselage falling away
// under it (Patrick, 11 Oct 2026: "instead of having a straight bulky spine"; it was a spine as wide as the canopy's
// end). The half-widths are estimates.
const DORSAL = [
  [-0.33, 0.0035, 0.0586],
  [-0.39, 0.004, 0.0615],
  [-0.45, 0.0045, 0.0645],
  [-0.5, 0.005, 0.067],
  [-0.53, 0.0035, 0.0684],
];
// The forward bow leans aft from its crest 9° to the sill, as the side drawing shows it (was upright).
export const CT156_BOW_LEAN = rad(14.5); // the side drawing's band, 11 Oct 2026 (was 9°, read off the photo; Patrick's 156102 photo reads about 13°)
/**
 * Each frame hoop's lean from its crest to the sills (CT156_FRAME_X's order), radians: + the feet aft of the crest, -
 * ahead of it. The forward bow CT156_BOW_LEAN; the rear bow 22° with its top aft, as the side drawing shows it
 * (Patrick, 11 Oct 2026: "the wrong angles in the canopy bow"; it was upright). The centre bow 21° the same way, the
 * same drawing's, with the arch inside the cockpit (ct156-cockpit.js's ARCH_FT) leaning with it (was upright).
 */
export const CT156_FRAME_LEAN = Object.freeze([CT156_BOW_LEAN, rad(-21), rad(-22)]);
/** A symmetric NACA 4-digit section's half-thickness at xc (0 the leading edge, 1 the trailing edge), per chord. */
const thick = (xc, t) => 5 * t * (0.2969 * Math.sqrt(xc) - 0.126 * xc - 0.3516 * xc ** 2 + 0.2843 * xc ** 3 - 0.1036 * xc ** 4);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
/** A lofted surface's section at span position s (straight-line between its two nearest sections). */
function sectionOf(sections, s) {
  for (let i = 1; i < sections.length; i++) {
    const a = sections[i - 1], b = sections[i];
    if (s <= b.s || i === sections.length - 1) {
      const f = clamp01((s - a.s) / (b.s - a.s || 1));
      return { le: a.le + (b.le - a.le) * f, chord: a.chord + (b.chord - a.chord) * f, t: a.t + (b.t - a.t) * f, z: a.z + (b.z - a.z) * f };
    }
  }
  return sections[0];
}
/** A wing's surface height at (x, y) in its own frame, upper (+1) or lower (-1), for the decals on it. */
function wingSurfZ(x, y, side) {
  const sec = sectionOf(WING, Math.abs(y));
  const xc = clamp01((sec.le - x) / sec.chord);
  return sec.z + side * (thick(xc, sec.t) * sec.chord + 0.0015);
}
/** The fin's half-thickness at (x, z), for the tail decals. */
function finSurf(x, z) {
  const sec = sectionOf(FIN, z);
  const xc = clamp01((sec.le - x) / sec.chord);
  return thick(xc, sec.t) * sec.chord + 0.0015;
}

// The outside details other pilots use as formation references (TS-156; AETCMAN 11-248 Fig 9.17, Fig 9.24): the
// position lights, the exhaust stacks and the stabiliser tips. Places are estimates off the model's own tables.
const [, WINGTIP_Y, WINGTIP_Z] = wingBend([0, TIP_S, WING_Z]);
const WINGTIP = Object.freeze({ y: WINGTIP_Y, z: WINGTIP_Z }); // the wing's tip after its dihedral (TIP)
const NAV_LIGHT_X = WING_TIP.le - 0.012; // just behind the tip's leading edge
const STROBE_X = WING_TIP.le - WING_TIP.chord + 0.01; // at the tip's trailing edge
const TAIL_LIGHT = Object.freeze([-0.746, 0, -0.058]); // the tail cone's end, under the rudder
// The exhaust stacks: placed off Patrick's photo of 156102 (11 Oct 2026, marked), their middle level with the spinner's
// axis; shaped and sized off the top and side drawings (Patrick, 11 Oct 2026 08:26Z "look at the
// diagrams"; 20:12Z "the exhaust is the right shape", with his photo of a T-6C from above). The top view: each stack's
// outer wall leaves the cowl about 2.85 ft behind the spinner's tip and turns aft round a quarter circle about 0.93 ft
// across, centred on the cowl's skin 3.68 ft behind the tip and 1.2 ft out, reaching 2.12 ft out (25.5 in) where it
// runs aft; its open end is cut on a slant, from that outer corner back to the inner wall's tip 4.5 ft behind the spinner,
// so it opens aft and outward (the side view and the photos look into it). The side view: about 7 in tall, the inner
// wall's tip about 4.6 in tall. Built as a flattened oval pipe 10.7 in across and 7 in tall from inside the cowl (y0),
// round the bend (xBend, R) and aft at yMid, cut by the slant from [xOut, yOut] to [xIn, yIn]; `taper` the aft end's
// height share. Units; sizes read off the drawings, about +-1 in.
const STUB = Object.freeze({ y0: 0.036, xBend: 0.66 - 3.68 / 23.148, yBend: 1.2 / 23.148, R: 0.485 / 23.148, yMid: (1.2 + 0.485) / 23.148, halfWide: 0.0192, halfTall: 0.0126, xOut: 0.66 - 3.68 / 23.148, yOut: 2.12 / 23.148, xIn: 0.66 - 4.5 / 23.148, yIn: 1.24 / 23.148, taper: 0.65, z: 0 });
// The fairing under the nose, behind the nose wheel: a shallow box along the belly from 5.85 ft to 10.5 ft behind the
// spinner's tip, hanging 0.34 ft under the belly at its front and 0.41 ft at its back (the side drawing,
// measured 11 Oct 2026; Patrick's photo of 156102 shows it the same length). Its width is an estimate (the drawings
// don't show it): 1 ft across. [x front, x back, depth front, depth back, half-width], units.
const NOSE_FAIRING = Object.freeze({ x0: 0.66 - 5.85 / 23.148, x1: 0.66 - 10.5 / 23.148, depth0: 0.34 / 23.148, depth1: 0.41 / 23.148, half: 0.5 / 23.148 });
// The antennas (the upper TAS antenna on the engine cowling's top; the lower TAS, transponder,
// VHF/UHF, DME and marker beacon antennas under the fuselage). On the cowl's top 5.8 ft behind the spinner's tip (the
// side drawing): the TAS antenna's two blades side by side on one round base (Patrick, 11 Oct 2026 20:12Z: "there are
// two instead of one", his T-6C photo), each about 0.42 ft long and 0.3 ft tall, their middles 0.24 ft apart and the
// base about 0.6 ft across (spacing and base estimates off the photo).
const TAS = Object.freeze({ x: 0.66 - 5.77 / 23.148, length: 0.42 / 23.148, height: 0.3 / 23.148, gap: 0.24 / 23.148, base: 0.3 / 23.148 });
// Under the belly, the two light grey paddle antennas swept back that Patrick's photo of 156102 shows (the forward one
// is a small blade on the side drawing; the CT-156's is the photo's). The aft one the side view's shape, its root 21.99 to
// 22.57 ft behind the spinner's tip, its foot 22.32 to 22.88 ft and 0.89 ft down: SMM Fig 12.12 and 12.13 put the foot's
// middle 22.6 ft behind the tip (a camera fitted to each picture's fin, tail, wingtips and fuselage marks, about 5 px
// off, and the foot's ray met with the centreline; both pictures agree within 0.1 ft; the side view read 21.8 ft); its
// foot white (Patrick, 11 Oct 2026 20:20Z: "the antenna on the bottom back has white on the bottom";
// SMM Fig 12.12), the white the bottom 0.15 ft (estimate). The forward one the same shape, its root from 15.0 ft (the
// photo, about +-0.3 ft; its root is hidden by the wing). [root front, root back, foot front, foot back, depth, white],
// feet; about 0.05 ft thick (estimate).
const BELLY_PADDLES = Object.freeze([[21.99, 22.57, 22.32, 22.88, 0.89, 0.15], [15.0, 15.58, 15.33, 15.89, 0.89, 0]]);
const PADDLE_THICK = 0.05 / 23.148;
// The smaller ones the side view draws further aft: a blade 23.1 to 23.4 ft behind the tip about 0.25 ft down, and a
// flat plate 24.3 to 25.6 ft about 0.1 ft down (the marker beacon antenna, by the page's list; which is which an
// estimate). [x of the blade's middle, up (+1) or down (-1), length, height], units.
const SMALL_ANTENNAS = Object.freeze([[0.66 - 23.25 / 23.148, -1, 0.3 / 23.148, 0.25 / 23.148]]);
// Static wicks on the fin's trailing edge: about 3 or 4 small whiskers on its upper part (web photo research, 11 Oct
// 2026: RCAF CT-156 photos from the 2014 Alliance air show); three here, at these heights up the fin, each about 0.35 ft
// long and 0.03 ft thick, angled 10° up from straight aft (count, places and size estimates). Heights in units.
const FIN_WICKS = Object.freeze({ z: [0.13, 0.175, 0.215], length: 0.35 / 23.148, r: 0.015 / 23.148, upDeg: 10 });
const MARKER_PLATE = Object.freeze({ x0: 0.66 - 24.3 / 23.148, x1: 0.66 - 25.6 / 23.148, depth: 0.1 / 23.148, half: 0.12 / 23.148 });
// The lower anti-collision beacon's amber dome, ahead of the aft paddle: about 1 ft long and 0.27 ft deep, its middle
// 21.1 ft behind the spinner's tip, 0.36 ft ahead of the paddle (Patrick's photo of 156102 and SMM Fig 12.12 and
// 12.13, the same fitted camera; the photo alone read 20.33 ft). [x, half-length, half-width, depth], units; width an estimate.
const BEACON = Object.freeze([0.66 - 21.1 / 23.148, 0.024, 0.012, 0.012]);
// A pitot probe on each wing's leading edge, about two thirds of the way out, its L-shaped tube reaching about 0.45 ft
// ahead of the leading edge (Patrick's photo of 156115 from below, 11 Oct 2026; place and size estimates off the photo).
const PITOT = Object.freeze({ s: 0.5, reach: 0.45 / 23.148, drop: 0.12 / 23.148, r: 0.04 / 23.148 });
// Beside each pitot under the wing (Patrick, 11 Oct 2026: "the tie downs and pitot covers under the wings"; the 156115
// photo): a white disc with a red middle at the probe's foot, about 0.2 ft across, and a yellow one about 0.12 ft across
// a little further aft. Sizes and places estimates off the photo.
const UNDERWING_MARKS = Object.freeze({ x: 0.06, size: 0.7 / 23.148 }); // x: the patch's middle aft of the leading edge, chord fraction
// The roundel under the right wing and the ship's number on top of it, as on Patrick's photos of 156102 (the roundel
// under the right wing) and 156115 (the number on the right wing's top, along the chord, the digits' tops inboard), at
// the upper roundel's place (was the number under the right wing). [x middle, station], units.
const WING_MARK = Object.freeze([0.068, 0.42]);
// The tie-down rings (one under each wing; a formation reference, SMM Fig 12.12
// and Patrick, 11 Oct 2026 20:12Z): a dark ring hanging from a small block, 12.8 ft behind the spinner's tip and 8.3 ft
// out (SMM Fig 12.13's near wing, a camera fitted to the picture and the ring's ray met with the wing's underside; the
// same camera puts the roundel within 0.7 ft of WING_MARK, and the far wing's ring in Fig 12.12 and 12.13 fits within
// 5 px; about +-0.5 ft). Ring 0.3 ft across, its bar 0.04 ft (estimates). [x, station], units.
const TIE_DOWN = Object.freeze({ x: 0.66 - 12.8 / 23.148, s: 0.36, r: 0.15 / 23.148, bar: 0.02 / 23.148, block: 0.1 / 23.148 });
// The speed brake: one plate under the fuselage between the flaps, hinged at its front, opening to 70°,
// perforated with round holes, three across and four along. Its size and place are
// estimates (no page gives them): hinged 16.0 ft behind the spinner's tip, where the flaps start, 2.3 ft long and 1.8
// ft across (about 4.1 sq ft; the Formation sim's drag guesses about 5, slow-down.js BOARDS). Units.
const SPEED_BRAKE = Object.freeze({ x0: 0.66 - 16.0 / 23.148, length: 2.3 / 23.148, half: 0.9 / 23.148, thick: 0.03 / 23.148, hole: 0.19 / 23.148, openDeg: 70 });

/**
 * Points on the outside of the aircraft, model units (nose +X, left +Y, up +Z from the origin on the spinner's axis), each
 * [x, y, z]: the spinner's tip, the wingtip position lights (red left, green right), the tail light, the exhaust stacks'
 * openings, the stabiliser tips (mid-chord), the fin's top and the canopy bows' crests (forward, centre, rear). For
 * ct156-cockpit.js sightAnglesOf, so a sight line to Lead's light reads the same numbers the model is drawn from.
 */
export const CT156_REFERENCE_POINTS = Object.freeze({
  spinnerTip: Object.freeze([0.66, 0, 0]),
  leftLight: Object.freeze([NAV_LIGHT_X, WINGTIP.y + 0.002, WINGTIP.z]),
  rightLight: Object.freeze([NAV_LIGHT_X, -(WINGTIP.y + 0.002), WINGTIP.z]),
  tailLight: TAIL_LIGHT,
  leftExhaust: Object.freeze([(STUB.xOut + STUB.xIn) / 2, STUB.yMid, STUB.z]),
  rightExhaust: Object.freeze([(STUB.xOut + STUB.xIn) / 2, -STUB.yMid, STUB.z]),
  leftStabTip: Object.freeze([STAB[0].le - STAB[0].chord / 2, -STAB[0].s, STAB[0].z]),
  rightStabTip: Object.freeze([STAB[0].le - STAB[0].chord / 2, STAB[0].s, STAB[0].z]),
  finTop: Object.freeze([FIN[1].le - FIN[1].chord / 2, 0, FIN[1].s]),
  forwardBowCrest: Object.freeze([CT156_FRAME_X[0], 0, canopyAt(CT156_FRAME_X[0]).top]),
  centreBowCrest: Object.freeze([CT156_FRAME_X[1], 0, canopyAt(CT156_FRAME_X[1]).top]),
  rearBowCrest: Object.freeze([CT156_FRAME_X[2], 0, canopyAt(CT156_FRAME_X[2]).top]),
});

// The fine detail (decals, the cockpit, the canopy frames, the prop blades, the exhausts) shows only when the aircraft
// is at least this long on screen, in CSS pixels, and goes again below the lower number (estimates, tuned by eye).
export const CT156_DETAIL_PX = Object.freeze({ show: 70, hide: 55 });

// ---------- canvas decals ----------

function canvasTexture(THREE, w, h, draw, sharp = 1) {
  // sharp: the picture drawn at that many pixels per pixel of w and h (draw still works in w and h), so a decal stays
  // crisp when the camera is close; anisotropy keeps it crisp seen edge-on (three.js holds it to what the GPU allows).
  const c = document.createElement('canvas');
  c.width = w * sharp;
  c.height = h * sharp;
  const ctx = c.getContext('2d');
  ctx.scale(sharp, sharp);
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

// The maple leaf of the Flag of Canada: the flag's own 11-point outline (Patrick, 6 Oct: "needs to look exactly like a
// maple leaf"), tip up, centred on (cx, cy), half-height s. The outline runs from y -2000 (the top point) to 2030 (the
// stem's foot), x -1860 to 1860, in its own units.
const LEAF_OUTLINE = 'm-90 2030 45-863a95 95 0 0 0-111-98l-859 151 116-320a65 65 0 0 0-20-73l-941-762 212-99a65 65 0 0 0 34-79l-186-572 542 115a65 65 0 0 0 73-38l105-247 423 454a65 65 0 0 0 111-57l-204-1052 327 189a65 65 0 0 0 91-27l332-652 332 652a65 65 0 0 0 91 27l327-189-204 1052a65 65 0 0 0 111 57l423-454 105 247a65 65 0 0 0 73 38l542-115-186 572a65 65 0 0 0 34 79l212 99-941 762a65 65 0 0 0-20 73l116 320-859-151a95 95 0 0 0-111 98l45 863z';
let leafPath = null;
function leaf(ctx, cx, cy, s, fill) {
  leafPath ??= new Path2D(LEAF_OUTLINE);
  const k = s / 2015;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(k, k);
  ctx.translate(0, -15);
  ctx.fillStyle = fill;
  ctx.fill(leafPath);
  ctx.restore();
}

function roundelCanvas(ctx, w) {
  const c = w / 2;
  ctx.fillStyle = '#1d3f8f';
  ctx.beginPath(); ctx.arc(c, c, c - 1, 0, 7); ctx.fill();
  ctx.fillStyle = '#f4f6f8';
  ctx.beginPath(); ctx.arc(c, c, c * 0.72, 0, 7); ctx.fill();
  leaf(ctx, c, c, c * 0.56, '#d2202c');
}

// The NATO star: a ring and four broad points, each half light and half grey (Patrick's photo of 156102).
function natoStar(ctx, cx, cy, r) {
  ctx.strokeStyle = '#d5dae0';
  ctx.lineWidth = r * 0.1;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.64, 0, 7); ctx.stroke();
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    for (const [d, fill] of [[1, '#eef1f5'], [-1, '#9aa3ad']]) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.lineTo(cx + Math.cos(a + d * Math.PI / 4) * r * 0.2, cy + Math.sin(a + d * Math.PI / 4) * r * 0.2);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// A big digit-string: white fill, dark outline.
function outlinedText(ctx, text, cx, cy, px, outline = px * 0.07) {
  ctx.font = `800 ${px}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = outline * 2;
  ctx.strokeStyle = '#0a1020';
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, cx, cy);
}

/**
 * The ship's number on the nose and under the wing: 122 for #1, 123 for #2 and so on (Patrick, 11 Oct 2026, of his photo
 * of 156102's paint: "Make it 122 all else the same"). A label that is not a ship number (Turn Fight's letters) shows
 * as it is; none gives 122.
 */
export function ct156TailNumber(number) {
  const label = String(number ?? '');
  if (label === '') return '122';
  const n = Number(label);
  return Number.isInteger(n) && n >= 1 && n <= 77 ? String(121 + n) : label;
}

/** The ship's serial on the fin, CT-156 style: 156122 for #1, 156123 for #2 and so on (ct156TailNumber; was 156101). */
export function ct156Serial(number) {
  return `1561${ct156TailNumber(number).replace(/\D/g, '').slice(-2).padStart(2, '2')}`;
}

/** The serial alone, white with a dark outline, low on the fin (the 'ship' paint's only decal; TS-156). */
function serialCanvas(number) {
  return (ctx, w) => outlinedText(ctx, ct156Serial(number), w / 2, finPx(w, -1, 0, 0.0205)[1], 0.0255 * (w / FIN_DECAL.size), 5);
}

// The fin's decal (decalGeo.tail) is a square 0.14 units a side, centred 0.676 units aft of the origin and 0.075 up. Each
// side has its own canvas, so every mark sits at the same place on both sides and the text still reads (side +1 left,
// -1 right). Places and sizes off Patrick's photo of 156102 (11 Oct 2026; measured from the fin's top front corner).
const FIN_DECAL = Object.freeze({ x: -0.607, z: 0.075, size: 0.14 });
const finPx = (w, side, x, z) => [((-side * (x - FIN_DECAL.x)) / FIN_DECAL.size + 0.5) * w, (0.5 - (z - FIN_DECAL.z) / FIN_DECAL.size) * w];

function tailCanvas(number, side) {
  return (ctx, w) => {
    const k = w / FIN_DECAL.size; // pixels per unit
    const at = (x, z) => finPx(w, side, x, z);
    // The red maple leaf with its long red stem reaching up and aft, and the NATO star over the leaf's aft side,
    // a little over halfway down the fin.
    const [sx0, sy0] = at(-0.6027, 0.0822), [sx1, sy1] = at(-0.6592, 0.1411);
    const nx = -(sy1 - sy0), ny = sx1 - sx0, nl = Math.hypot(nx, ny);
    const half = 0.002 * k;
    ctx.fillStyle = '#d8202c';
    ctx.beginPath();
    ctx.moveTo(sx0 + (nx / nl) * half, sy0 + (ny / nl) * half);
    ctx.lineTo(sx1, sy1);
    ctx.lineTo(sx0 - (nx / nl) * half, sy0 - (ny / nl) * half);
    ctx.closePath();
    ctx.fill();
    leaf(ctx, ...at(-0.58, 0.1094), 0.029 * k, '#d8202c');
    natoStar(ctx, ...at(-0.6102, 0.1037), 0.027 * k);
    // The Canadian flag aft of the serial, low on the fin (about 0.45 ft tall: a close wingman can read it; TS-156).
    const [fx, fy] = at(-0.6525, 0.018);
    const fw = 0.046 * k, fh = fw / 2;
    ctx.fillStyle = '#e4212d'; ctx.fillRect(fx - fw / 2, fy - fh / 2, fw, fh);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(fx - fw / 4, fy - fh / 2, fw / 2, fh);
    leaf(ctx, fx, fy, fh * 0.36, '#e4212d');
    const [tx, ty] = at(-0.623, 0.0205);
    ctx.font = `600 ${Math.round(0.0255 * k)}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = side < 0 ? 'left' : 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#eef1f5';
    ctx.fillText(ct156Serial(number), tx, ty);
  };
}

// ---------- shared kit (geometry, materials, textures) ----------

/**
 * A fingerprint of a part's pieces (their corners to a thousandth of a unit), so a Blender file's part shows only while it
 * was built from the shapes the code draws now: a shape change without a rebuilt file shows the code's part, never a stale
 * one (ALL-32, ALL-33). pieces: [{ geometry }]. ct156-cockpit.js uses the same one.
 */
export function ct156PiecesHash(pieces) {
  let h = 2166136261;
  for (const { geometry } of pieces) {
    const a = geometry.attributes.position.array;
    for (let i = 0; i < a.length; i++) h = Math.imul(h ^ (Math.round(a[i] * 1000) | 0), 16777619) >>> 0;
  }
  return h.toString(16);
}

// The outside from Blender (ALL-33, Patrick 11 Oct 2026): public/models/ct156-exterior.glb, built by
// tools/blender/build_ct156_exterior.py from these very shapes (ct156ExteriorPieces), smooth-shaded, with the soft
// shadows and panel lines baked into one picture (ct156-exterior-ao.jpg) on its own UV map. Once it is in, each of these
// kit shapes takes the file's in place, so every ship (and every ship made later) draws it; the decals, cheat line,
// glass, lights, pilots and prop stay the code's. Only all of it or none: if the file is missing, or any part was built
// from other shapes than the code draws now, every ship stays as the code draws it.
const EXTERIOR_PARTS = Object.freeze(['fuselage', 'fuselageCut', 'airframe', 'fin', 'frames', 'bowFront', 'seats', 'stubs', 'spinner', 'spinnerRing', 'vent', 'antenna', 'beacon']);
const EXTERIOR_FILE = 'ct156-exterior.glb';
const EXTERIOR_AO = 'ct156-exterior-ao.jpg';
// The skin's relief (panel line grooves, rivets) and its weathering (exhaust soot, belly oil, faint grime), baked by the
// same script on the same uv map (Patrick, 11 Oct 2026 21:07Z: "Surface texture"); BUMP_SCALE how strongly the relief
// shows, by eye.
const EXTERIOR_BUMP = 'ct156-exterior-bump.jpg';
const EXTERIOR_DIRT = 'ct156-exterior-dirt.jpg';
const BUMP_SCALE = 3;

/** The shapes the Blender outside is built from, by name (tools/blender/ct156-exterior-pieces.mjs). */
export function ct156ExteriorPieces(THREE) {
  const { geo, hashes } = getKit(THREE);
  return Object.fromEntries(EXTERIOR_PARTS.map((name) => [name, { geometry: geo[name], hash: hashes[name] }]));
}

/** A ship's mesh drawn with its materials darkened by the baked picture (aoShaded), each copy made once. */
function shadeMesh(kit, mesh) {
  const swap = (mat) => {
    if (!mat?.isMeshStandardMaterial) return mat;
    let copy = kit.shaded.get(mat);
    if (!copy) {
      copy = aoShaded(mat, kit.ao, kit.skin);
      kit.shaded.set(mat, copy);
      const mine = mesh.userData.ct156Mine;
      (mine?.includes(mat) ? mine : kit.own).push(copy);
    }
    return copy;
  };
  mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
}

/** The file's part laid into the kit's shape of the same name: its colours in the code's slot order, one group each. */
function takeShape(THREE, into, meshes) {
  const slots = meshes.map(({ geometry, material }) => [Number(String(material).split('|')[1]) || 0, geometry]).sort((a, b) => a[0] - b[0]);
  into.dispose(); // the code shape's buffers go; the meshes keep this geometry
  into.setIndex(null);
  into.clearGroups();
  for (const key of Object.keys(into.attributes)) into.deleteAttribute(key);
  const arrays = { position: [], normal: [], uv: [] };
  let start = 0;
  for (const [slot, g] of slots) {
    into.addGroup(start, g.attributes.position.count, slot);
    start += g.attributes.position.count;
    for (const key of Object.keys(arrays)) arrays[key].push(g.attributes[key].array);
    g.dispose();
  }
  for (const [key, list] of Object.entries(arrays)) {
    const out = new Float32Array(list.reduce((n, a) => n + a.length, 0));
    let at = 0;
    for (const a of list) { out.set(a, at); at += a.length; }
    into.setAttribute(key, new THREE.BufferAttribute(out, key === 'uv' ? 2 : 3));
  }
  into.computeBoundingBox();
  into.computeBoundingSphere();
}

function attachExterior(kit) {
  loadParts(EXTERIOR_FILE).then((list) => {
    if (kit.disposed) return;
    const byName = new Map(list.map((p) => [p.name, p]));
    const usable = (p) => p?.meshes.length && p.meshes.every(({ geometry: g }) => g.attributes.normal && g.attributes.uv);
    const stale = EXTERIOR_PARTS.filter((name) => byName.get(name)?.extras.ct156_hash !== kit.hashes[name] || !usable(byName.get(name)));
    if (stale.length) {
      console.warn(`${EXTERIOR_FILE}: ${stale.join(', ')} out of date with the code; the code model shows (rebuild: tools/blender/README.md)`);
      return;
    }
    for (const name of EXTERIOR_PARTS) takeShape(kit.THREE, kit.geo[name], byName.get(name).meshes);
    kit.ao = loadAo(kit.THREE, EXTERIOR_AO);
    kit.skin = { bump: loadAo(kit.THREE, EXTERIOR_BUMP), bumpScale: BUMP_SCALE, dirt: loadAo(kit.THREE, EXTERIOR_DIRT) };
    for (const mesh of kit.exteriorMeshes) shadeMesh(kit, mesh);
  }, () => {}); // no file: the code model shows
}

const kits = new WeakMap(); // THREE namespace -> kit

/**
 * The dorsal fin (DORSAL): thin rounded sections standing on the fuselage's top, flaring out at the foot into a small
 * fillet (by FLARE times the half-width, an estimate) that ends just under the skin, so it reads as one with the
 * fuselage. Its front end starts inside the fairing and its back end inside the fin. Closed at each end.
 */
function dorsalGeometry(THREE) {
  const N = 24, M = 12, n = 2.4, FLARE = 1.2; // n: a little boxier than an ellipse
  const x0 = DORSAL[0][0], x1 = DORSAL[DORSAL.length - 1][0];
  const pos = [], idx = [];
  const ring = (x) => {
    const [, w, top] = rowAt(DORSAL, x);
    const foot = w * (1 + FLARE);
    const base = sillZ(x, foot) - 0.002;
    const pts = [];
    for (let k = 0; k <= M; k++) {
      const c = Math.cos((k / M) * Math.PI), u = Math.sin((k / M) * Math.PI) ** (2 / n); // u: 0 at the foot, 1 on top
      pts.push([x, Math.sign(c) * (w * Math.abs(c) ** (2 / n) + (foot - w) * (1 - u) ** 3), base + (top - base) * u]);
    }
    return { pts, base };
  };
  for (let i = 0; i <= N; i++) for (const p of ring(x0 + ((x1 - x0) * i) / N).pts) pos.push(...p);
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < M; k++) {
      const a = i * (M + 1) + k, b = a + 1, c = a + M + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // Each end its own flat face (its own corners, so the shading doesn't round over the edge).
  for (const [x, front] of [[x0, true], [x1, false]]) {
    const { pts, base } = ring(x);
    const centre = pos.length / 3;
    pos.push(x, 0, base);
    for (const p of pts) pos.push(...p);
    for (let k = 1; k <= M; k++) idx.push(...(front ? [centre, centre + k, centre + k + 1] : [centre, centre + k + 1, centre + k]));
  }
  return meshOf(THREE, pos, idx);
}

/** The ventral fin (VENTRAL): an aerofoil down from inside the belly, its foot sheared to rise aft by VENTRAL_RISE. */
function ventralGeometry(THREE) {
  const g = airfoilGeometry(THREE, VENTRAL, { span: 'z' });
  const [root, tip] = VENTRAL, p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const f = clamp01((root.s - p.getZ(i)) / (root.s - tip.s)); // 0 at the root, 1 at the foot
    p.setZ(i, p.getZ(i) + (tip.le - p.getX(i)) * VENTRAL_RISE * f);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * One exhaust stack on side s (+1 left, -1 right): an oval pipe coming straight out of the cowl, turning aft round a
 * quarter circle and running aft, its open end cut on STUB's slant so it opens aft and outward, the inner wall the
 * longest; its front buried in the cowl. With `lining`, the dark lining a little inside it from the bend aft.
 */
function stackGeometry(THREE, s, lining = false) {
  const { y0, xBend, yBend, R, yMid, halfWide, halfTall, xOut, yOut, xIn, yIn, taper, z } = STUB;
  const M = 24, pos = [], idx = [];
  const path = [];
  // Out of the cowl, straight out to the bend's start, then round the bend (centre xBend, yBend; heading out to heading
  // aft), then straight aft past the slant's inner tip.
  const xs = xBend + R; // the centreline's x while it heads out
  if (!lining) path.push({ x: xs, y: y0, tx: 0, ty: 1, h: 1 });
  for (let i = lining ? 5 : 0; i <= 10; i++) {
    const t = (i / 10) * (Math.PI / 2);
    path.push({ x: xBend + R * Math.cos(t), y: yBend + R * Math.sin(t), tx: -Math.sin(t), ty: Math.cos(t), h: 1 });
  }
  const xEnd = xIn - 0.004;
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    path.push({ x: xBend + (xEnd - xBend) * t, y: yBend + R, tx: -1, ty: 0, h: 1 - (1 - taper) * t ** 1.5 });
  }
  // The slant: a point aft of the line from the outer corner to the inner tip comes forward onto it.
  const slant = (y) => xOut + ((y - yOut) * (xIn - xOut)) / (yIn - yOut);
  const k0 = lining ? 0.82 : 1;
  for (const p of path) {
    for (let k = 0; k < M; k++) {
      const a = (2 * Math.PI * k) / M, c = Math.cos(a);
      let px = p.x + halfWide * k0 * c * p.ty, py = p.y - halfWide * k0 * c * p.tx;
      if (p.tx < 0) px = Math.max(px, slant(py));
      pos.push(px, s * py, z + halfTall * k0 * p.h * Math.sin(a));
    }
  }
  const flip = (s > 0) !== lining;
  for (let i = 0; i < path.length - 1; i++) {
    for (let k = 0; k < M; k++) {
      const a = i * M + k, b = i * M + ((k + 1) % M), c = a + M, d = b + M;
      if (flip) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  return meshOf(THREE, pos, idx);
}

/**
 * The fairing under the nose (NOSE_FAIRING): rounded-box sections hanging under the belly, their tops sunk just inside
 * the skin, the ends eased over the first and last tenth of its length, closed at each end.
 */
function noseFairingGeometry(THREE) {
  const { x0, x1, depth0, depth1, half } = NOSE_FAIRING;
  const N = 16, M = 16, n = 3, sink = 0.004, pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = x0 + (x1 - x0) * t;
    const ease = Math.sin((Math.PI / 2) * Math.min(1, t / 0.1, (1 - t) / 0.1)) ** 0.5;
    const depth = (depth0 + (depth1 - depth0) * t) * ease, w = half * (0.6 + 0.4 * ease), top = bellyAt(x) + sink;
    for (let k = 0; k <= M; k++) {
      const a = (k / M) * Math.PI, c = Math.cos(a), sn = Math.sin(a);
      pos.push(x, w * Math.sign(c) * Math.abs(c) ** (2 / n), top - (depth + sink) * sn ** (2 / n));
    }
  }
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < M; k++) {
      const a = i * (M + 1) + k, b = a + 1, c = a + M + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  for (const [i, front] of [[0, true], [N, false]]) {
    const centre = pos.length / 3;
    pos.push(pos[i * (M + 1) * 3], 0, bellyAt(pos[i * (M + 1) * 3]));
    for (let k = 0; k < M; k++) idx.push(...(front ? [centre, i * (M + 1) + k + 1, i * (M + 1) + k] : [centre, i * (M + 1) + k, i * (M + 1) + k + 1]));
  }
  return meshOf(THREE, pos, idx);
}

/**
 * A small blade antenna standing on the fuselage's top (up +1) or hanging under its belly (-1): a thin swept plate,
 * `length` along the skin and `height` out from it, its foot just inside the skin.
 */
function bladeAntennaGeometry(THREE, x, up, length, height) {
  const base = up > 0 ? topAt(x) - 0.002 : bellyAt(x) + 0.002;
  const h = height + 0.002, l = length / 2;
  const shape = new THREE.Shape([[x + l, 0], [x - l, 0], [x - l - h * 0.35, h], [x - l + length * 0.25 - h * 0.35, h]].map(([a, b]) => new THREE.Vector2(a, b)));
  return new THREE.ExtrudeGeometry(shape, { depth: 0.0025, bevelEnabled: false }).rotateX(Math.PI / 2).scale(1, 1, up).translate(0, 0.00125, base);
}

/**
 * A paddle antenna hanging under the belly (BELLY_PADDLES' row, feet): a thin plate swept back, its root just inside
 * the skin, its corners at the foot rounded; the bottom `white` feet in colour slot 1, the rest slot 0.
 */
function paddleGeometry(THREE, [rf, rb, ff, fb, depth, white]) {
  const X = (ft) => 0.66 - ft / 23.148, D = depth / 23.148, W = white / 23.148;
  const xMid = (X(rf) + X(rb)) / 2, root = bellyAt(xMid) + 0.003;
  // Its outline at height h below the root (0 at the root, D at the foot): front and back edges straight.
  const edge = (h) => [X(rf) + ((X(ff) - X(rf)) * h) / D, X(rb) + ((X(fb) - X(rb)) * h) / D];
  const band = (h0, h1, roundFoot) => {
    const pts = [];
    const [f0, b0] = edge(h0), [f1, b1] = edge(h1);
    pts.push([f0, -h0]);
    if (roundFoot) {
      const r = Math.min(0.012, (f1 - b1) / 3);
      for (let k = 0; k <= 4; k++) { const a = (k / 4) * (Math.PI / 2); pts.push([f1 - r + r * Math.cos(a), -h1 + r - r * Math.sin(a)]); }
      for (let k = 0; k <= 4; k++) { const a = (k / 4) * (Math.PI / 2); pts.push([b1 + r - r * Math.sin(a), -h1 + r - r * Math.cos(a)]); }
    } else pts.push([f1, -h1], [b1, -h1]);
    pts.push([b0, -h0]);
    return new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v))), { depth: PADDLE_THICK, bevelEnabled: false })
      .rotateX(Math.PI / 2).translate(0, PADDLE_THICK / 2, root);
  };
  const parts = W > 0 ? [{ geometry: band(0, D - W, false), materials: [0] }, { geometry: band(D - W, D, true), materials: [1] }] : [{ geometry: band(0, D, true), materials: [0] }];
  return joinGeometries(THREE, parts);
}

/** The TAS antenna on the cowl's top (TAS): two blades side by side on a thin round base. */
function tasGeometry(THREE) {
  const { x, length, height, gap, base } = TAS;
  const z = topAt(x);
  return joinGeometries(THREE, [
    ...[1, -1].map((side) => ({ geometry: bladeAntennaGeometry(THREE, x, 1, length, height).translate(0, (side * gap) / 2, 0), materials: [0] })),
    { geometry: new THREE.CylinderGeometry(base, base, 0.003, 20).rotateX(Math.PI / 2).translate(x, 0, z), materials: [0] },
  ]);
}

/** The marker beacon's flat plate under the belly (MARKER_PLATE): a thin rounded slab. */
/** The fin's static wicks (FIN_WICKS): thin rods from its trailing edge, pointing aft and a little up. */
function finWicksGeometry(THREE) {
  const [root, tip] = FIN;
  return joinGeometries(THREE, FIN_WICKS.z.map((z) => {
    const f = (z - root.s) / (tip.s - root.s);
    const te = root.le - root.chord + f * (tip.le - tip.chord - (root.le - root.chord));
    const up = rad(FIN_WICKS.upDeg), L = FIN_WICKS.length;
    const g = new THREE.CylinderGeometry(FIN_WICKS.r * 0.6, FIN_WICKS.r, L, 5);
    g.rotateZ(Math.PI / 2).rotateY(up); // along -x, tipped up
    g.translate(te - (L / 2) * Math.cos(up) + 0.002, 0, z + (L / 2) * Math.sin(up));
    return { geometry: g, materials: [0] };
  }));
}

function markerPlateGeometry(THREE) {
  const { x0, x1, depth, half } = MARKER_PLATE;
  const xm = (x0 + x1) / 2, top = bellyAt(xm) + 0.002;
  return new THREE.CapsuleGeometry(half * 0.5, x0 - x1 - half, 4, 8).rotateZ(Math.PI / 2).scale(1, 2, (depth + 0.002) / half).translate(xm, 0, top - (depth + 0.002) / 2);
}

/** A tie-down ring under one wing (TIE_DOWN; side +1 left, -1 right): a small block and a ring hanging in the chord's plane. */
function tieDownGeometry(THREE, side) {
  const { x, s, r, bar, block } = TIE_DOWN;
  const zs = wingSurfZ(x, s, -1);
  const blockG = new THREE.BoxGeometry(block, block * 0.6, block * 0.6).translate(x, side * s, zs - block * 0.25);
  const ring = new THREE.TorusGeometry(r, bar, 6, 16).rotateX(Math.PI / 2).translate(x, side * s, zs - block * 0.5 - r);
  const g = joinGeometries(THREE, [{ geometry: blockG, materials: [0] }, { geometry: ring, materials: [0] }]);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, ...wingBend([p.getX(i), p.getY(i), p.getZ(i)]));
  g.computeVertexNormals();
  return g;
}

/**
 * The speed brake's plate (SPEED_BRAKE), shut: hinged on y at its front edge (the origin), running aft along -x, its
 * outside face down, with its three by four round holes. setSpeedBrake turns it down about the hinge.
 */
function speedBrakeGeometry(THREE) {
  const { length, half, thick, hole } = SPEED_BRAKE;
  const r = 0.01;
  const shape = new THREE.Shape();
  shape.moveTo(-r, -half);
  shape.lineTo(-length + r, -half); shape.quadraticCurveTo(-length, -half, -length, -half + r);
  shape.lineTo(-length, half - r); shape.quadraticCurveTo(-length, half, -length + r, half);
  shape.lineTo(-r, half); shape.quadraticCurveTo(0, half, 0, half - r);
  shape.lineTo(0, -half + r); shape.quadraticCurveTo(0, -half, -r, -half);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      const h = new THREE.Path();
      h.absarc(-length * (0.16 + 0.225 * i), half * (j - 1) * 0.62, hole / 2, 0, Math.PI * 2, true);
      shape.holes.push(h);
    }
  }
  return new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -thick);
}

/** A pitot probe (PITOT) on one wing (side +1 left, -1 right): a short mast down from under the leading edge and a tube forward. */
function pitotGeometry(THREE, side) {
  const sec = sectionOf(WING, PITOT.s);
  const x = sec.le - 0.04 * sec.chord, zFoot = wingSurfZ(x, PITOT.s, -1) + 0.002, zTube = zFoot - PITOT.drop;
  const mast = new THREE.CylinderGeometry(PITOT.r * 0.7, PITOT.r, zFoot - zTube + PITOT.r, 8).rotateX(Math.PI / 2).translate(x, side * PITOT.s, (zFoot + zTube) / 2);
  const tube = new THREE.CylinderGeometry(PITOT.r * 0.75, PITOT.r, PITOT.reach + 0.04 * sec.chord, 8).rotateZ(Math.PI / 2).translate(x + (PITOT.reach + 0.04 * sec.chord) / 2, side * PITOT.s, zTube);
  const g = joinGeometries(THREE, [{ geometry: mast, materials: [0] }, { geometry: tube, materials: [0] }]);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, ...wingBend([p.getX(i), p.getY(i), p.getZ(i)]));
  g.computeVertexNormals();
  return g;
}

/** An indexed geometry from points and triangles, smooth-shaded. */
function meshOf(THREE, pos, idx, groups = null) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  if (groups) for (const [start, count, m] of groups) g.addGroup(start, count, m);
  g.computeVertexNormals();
  return g;
}

/** The fuselage: rings round the stations, closed at the nose (behind the spinner) and the tail. With `cut`, the top skin
 * inside the canopy's footprint is left out, so the cockpit tub
 * (tubGeometry) shows from the seat (setCockpitView; TS-155). */
function fuselageGeometry(THREE, { cut = false } = {}) {
  const RING = 36, N = 52;
  const x0 = STATIONS[0][0], x1 = STATIONS[STATIONS.length - 1][0];
  const pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const x = x0 + ((x1 - x0) * i) / N;
    const sec = rowAt(STATIONS, x);
    for (let k = 0; k < RING; k++) {
      const [y, z] = sectionPoint(sec, (k / RING) * Math.PI * 2);
      pos.push(x, y, z);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < RING; k++) {
      const a = i * RING + k, b = i * RING + ((k + 1) % RING), c = a + RING, d = b + RING;
      idx.push(a, c, b, b, c, d);
    }
  }
  const nose = pos.length / 3;
  pos.push(x0, 0, (STATIONS[0][2] + STATIONS[0][3]) / 2);
  const tail = pos.length / 3;
  const last = STATIONS[STATIONS.length - 1];
  pos.push(x1, 0, (last[2] + last[3]) / 2);
  for (let k = 0; k < RING; k++) {
    idx.push(nose, k, (k + 1) % RING);
    idx.push(tail, N * RING + ((k + 1) % RING), N * RING + k);
  }
  if (!cut) return meshOf(THREE, pos, idx);
  // A triangle goes when its three corners lie within the opening's length and any one of them under the canopy, so
  // no skin pokes up past the sill (the sill bands in ct156-cockpit.js cover the ragged edge).
  const inX = (v) => pos[v * 3] >= COCKPIT_CUT_X[0] && pos[v * 3] <= COCKPIT_CUT_X[1];
  const underCanopy = (v) => {
    const c = canopyAt(pos[v * 3]);
    return Math.abs(pos[v * 3 + 1]) < c.w - 0.001 && pos[v * 3 + 2] > c.base - 0.0002;
  };
  const kept = [];
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    if (!(tri.every(inX) && tri.some(underCanopy))) kept.push(...tri);
  }
  return meshOf(THREE, pos, kept);
}
// The cockpit opening, model units along x: just aft of the rear canopy bow to under the front coaming, ahead of the
// front panel (estimate, TS-155; its front end moved forward with the front cockpit, ALL-31, again with the panel,
// V2.238, and 0.95 ft with the front cockpit, 11 Oct 2026, so no skin shows in front of the panel).
const COCKPIT_CUT_X = [-0.242, 0.256];
const FT = CT156_UNIT_LENGTH / CT156_LENGTH_FT; // model units per foot

/**
 * The cockpit tub's floor, feet below the spinner's axis (TS-155; TS-157 deepened it from 0.8 ft so the seat pan sits
 * about 10 in above the floor and the tub reads as deep as Dad's cutaway picture of the T-6A shows). An estimate.
 * ct156-cockpit.js stands its pedals, stick and seats on it.
 */
export const CT156_TUB_FLOOR_FT = -1.2;
/**
 * The cockpit tub under the canopy (TS-155): a floor CT156_TUB_FLOOR_FT below the spinner's axis from 5.6 ft aft of the
 * model origin to 5.95 ft ahead of it, just behind the front knee wells' backs (5.9 ft) so its bulkhead doesn't close them
 * (5.55 ft from V2.271 to V2.285, which put the bulkhead across the wells; 3.9 ft until the front cockpit moved forward, ALL-31; 4.47 ft until the panel moved
 * forward, V2.238; 4.6 ft until the front cockpit moved 0.95 ft forward, 11 Oct 2026), side walls about 1.3 ft out (kept inside the canopy) up to the sill, and a
 * bulkhead at each end up to the fuselage's top line. Group 0 the floor, group 1 the walls. All estimates (judged by
 * eye off Dad's reference pictures, 9 Oct 2026).
 */
function tubGeometry(THREE) {
  const N = 14, x0 = 5.95 * FT, x1 = -5.6 * FT, floorZ = CT156_TUB_FLOOR_FT * FT;
  const rows = [];
  for (let i = 0; i <= N; i++) {
    const x = x0 + ((x1 - x0) * i) / N;
    const c = canopyAt(x);
    rows.push({ x, y: Math.min(1.3 * FT, c.w - 0.03 * FT), top: c.base });
  }
  const pos = [], floor = [], walls = [];
  const quad = (into, a, b, c, d) => {
    const n = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    into.push(n, n + 1, n + 2, n, n + 2, n + 3);
  };
  for (let i = 0; i < N; i++) {
    const a = rows[i], b = rows[i + 1];
    quad(floor, [a.x, a.y, floorZ], [b.x, b.y, floorZ], [b.x, -b.y, floorZ], [a.x, -a.y, floorZ]);
    for (const s of [1, -1]) quad(walls, [a.x, s * a.y, floorZ], [b.x, s * b.y, floorZ], [b.x, s * b.y, b.top], [a.x, s * a.y, a.top]);
  }
  for (const r of [rows[0], rows[N]]) {
    // The front bulkhead stops at the sill, under the cockpit's glareshield (it stood to the fuselage's top until V2.290).
    const top = r === rows[0] ? r.top : rowAt(STATIONS, r.x)[2];
    quad(walls, [r.x, r.y, floorZ], [r.x, -r.y, floorZ], [r.x, -r.y, top], [r.x, r.y, top]);
  }
  return meshOf(THREE, pos, [...floor, ...walls], [[0, floor.length, 0], [floor.length, walls.length, 1]]);
}

/** The canopy and its fairing (CANOPY): a rounded hood from sill to sill along its length. */
function canopyAt(x, grow = 0) {
  const [, w, top] = rowAt(CANOPY, x);
  return { w: w + grow, top: top + grow, base: sillZ(x, w) };
}
function canopyPoint(c, phi) {
  const cp = Math.cos(phi), sp = Math.sin(phi);
  return [c.w * Math.sign(cp) * Math.abs(cp) ** 0.85, c.base + (c.top - c.base) * Math.max(sp, 0) ** 0.75];
}
/** Where the glass ends: the rear bow's hoop (CT156_FRAME_X[2], leaning by CT156_FRAME_LEAN[2]), M + 1 points sill to sill. */
const glassEnd = (M) => ct156HoopPoints(CT156_FRAME_X[2], M, 0, CT156_FRAME_LEAN[2]).map((p) => p.x);
/**
 * The hood's skin (canopyAt, canopyPoint) between two stations per column, sill to sill: from[j] to to[j] for the M + 1
 * columns, in N steps, onto pos and idx.
 */
function hoodSkin(from, to, N, pos, idx) {
  const M = from.length - 1, first = pos.length / 3;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= M; j++) {
      const x = from[j] + ((to[j] - from[j]) * i) / N;
      const [y, z] = canopyPoint(canopyAt(x), (Math.PI * j) / M);
      pos.push(x, y, z);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = first + i * (M + 1) + j, b = a + 1, c = a + M + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
}
/** The canopy's glass, windscreen foot to the rear bow, its end square along the bow. */
function canopyGeometry(THREE) {
  const end = glassEnd(20), pos = [], idx = [];
  hoodSkin(end.map(() => CANOPY[0][0]), end, 40, pos, idx);
  return meshOf(THREE, pos, idx);
}
/**
 * The painted fairing behind the glass: the hood from the rear bow aft to its end in the fuselage's top, and a flat
 * bulkhead across the glass's end (seen through the glass behind the rear seat, and from the seats).
 */
function fairingGeometry(THREE) {
  const M = 20, end = glassEnd(M), pos = [], idx = [];
  hoodSkin(end, end.map(() => CANOPY[CANOPY.length - 1][0]), 24, pos, idx);
  const centre = pos.length / 3;
  pos.push((end[0] + end[M]) / 2, 0, canopyAt(end[0]).base);
  for (let j = 0; j <= M; j++) pos.push(end[j], ...canopyPoint(canopyAt(end[j]), (Math.PI * j) / M));
  for (let j = 0; j < M; j++) idx.push(centre, centre + 1 + j, centre + 2 + j);
  return meshOf(THREE, pos, idx);
}
/** The canopy's section at x, in model units: { w: half-width, top, base: the sill's height } (for ct156-cockpit.js). */
export const ct156CanopySection = (x) => canopyAt(x);
/** The canopy's inside half-width at station x and height z, model units (0 above its top or below its sill). */
export function ct156CanopyHalfWidth(x, z) {
  const c = canopyAt(x);
  const f = (z - c.base) / (c.top - c.base);
  if (!(f >= 0 && f <= 1)) return 0;
  const sp = f ** (1 / 0.75); // canopyPoint backwards: z = base + (top - base) * sin^0.75, y = w * cos^0.85
  return c.w * Math.sqrt(Math.max(1 - sp * sp, 0)) ** 0.85;
}
/** The fuselage's section at x, in model units: { halfWidth, top, bottom } (for ct156-cockpit.js). */
export function ct156FuselageSection(x) {
  const [, halfWidth, top, bottom] = rowAt(STATIONS, x);
  return { halfWidth, top, bottom };
}
/**
 * The canopy's hoop with its crest at station x as n + 1 points from the left sill over the top to the right sill,
 * model units ({ x, y, z }; the canopy's own shape, canopyPoint), grown outward by `grow`, its feet aft of the crest by
 * `lean` radians (ahead of it when negative; CT156_FRAME_LEAN) (for ct156-cockpit.js's bows and mirrors).
 */
export function ct156HoopPoints(x, n = 16, grow = 0, lean = 0) {
  const top = canopyAt(x, grow).top;
  const pts = [];
  for (let j = 0; j <= n; j++) {
    let xj = x;
    let [y, z] = canopyPoint(canopyAt(xj, grow), (Math.PI * j) / n);
    for (let k = 0; k < 3 && lean; k++) {
      xj = x - (top - z) * Math.tan(lean);
      [y, z] = canopyPoint(canopyAt(xj, grow), (Math.PI * j) / n);
    }
    pts.push({ x: xj, y, z });
  }
  return pts;
}
/**
 * A frame hoop over the canopy with its crest at x, leaning by `lean` (CT156_FRAME_LEAN): a flat band about 2.5 in wide
 * (so a close wingman sees the bows, TS-156) whose outer face lies flush with the glass, just proud of it so it doesn't
 * flicker, and whose body sits under the glass (Patrick, 11 Oct 2026 21:07Z: "the canopy bows should be flush with the
 * glass, not bulging out"; it was a round tube standing 1.7 in out). Depth under the glass an estimate.
 */
function hoopGeometry(THREE, x, lean = 0, half = 0.0045) {
  const n = 32, out = 0.0003, depth = -0.004;
  const rows = [[-half, out], [half, out], [half, depth], [-half, depth]].map(([dx, grow]) => ct156HoopPoints(x + dx, n, grow, lean));
  const pos = [], idx = [];
  // Each face its own strip (outer, aft side, inner, fore side), so the band's edges stay sharp.
  for (let f = 0; f < 4; f++) {
    const a = rows[f], b = rows[(f + 1) % 4], start = pos.length / 3;
    for (let j = 0; j <= n; j++) pos.push(a[j].x, a[j].y, a[j].z, b[j].x, b[j].y, b[j].z);
    for (let j = 0; j < n; j++) {
      const i = start + 2 * j;
      idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
    }
  }
  return meshOf(THREE, pos, idx);
}
/** A sill rail along one side of the canopy. */
/** Where the canopy's sill rails start at the front, model units (under the front coaming's sides; ct156-cockpit.js). */
export const CT156_RAIL_FORE_X = 0.25;
function railGeometry(THREE, side) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const x = CT156_RAIL_FORE_X + ((glassEnd(2)[0] - CT156_RAIL_FORE_X) * i) / 12; // to the rear bow's foot
    const c = canopyAt(x, 0.001);
    pts.push(new THREE.Vector3(x, side * c.w, c.base - (i === 0 ? 0.005 : 0))); // its front end dips under the sill (no open end in sight)
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.003, 5, false);
}

/**
 * The sections with each tip (an end as far out along the span as any section) rounded off: over the last stretch as
 * long as the tip's half-thickness, the section thins along a quarter circle to nothing at the tip, so the tip reads as
 * a rounded cap and not a cut-off board. The planform (leading edge, chord) stays the table's. Returns the sections and
 * which ends still need a flat cap ([first, last]).
 */
const TIP_STEPS = 6;
function roundTips(sections) {
  const far = Math.max(...sections.map((c) => Math.abs(c.s)));
  const out = sections.slice();
  const caps = [true, true];
  for (const end of [0, sections.length - 1]) {
    const tip = sections[end];
    if (Math.abs(tip.s) < far - 1e-9) continue;
    const dir = end === 0 ? -1 : 1; // the way the span runs out to this tip, in s
    const r = (tip.t * tip.chord) / 2;
    const ring = [];
    for (let k = 0; k <= TIP_STEPS; k++) {
      const phi = (k / TIP_STEPS) * (Math.PI / 2);
      const s = tip.s - dir * r * (1 - Math.sin(phi));
      const sec = sectionOf(sections, s);
      ring.push({ ...sec, s, t: sec.t * Math.cos(phi) });
    }
    if (end === 0) out.splice(0, 1, ...ring.reverse());
    else out.splice(out.length - 1, 1, ...ring);
    caps[end === 0 ? 0 : 1] = false;
  }
  return { sections: out, caps };
}

/**
 * A lofted aerofoil surface through its sections ({ le, s, chord, t, z }): span along y (wings, tailplane) or z (fin),
 * closed at both ends: rounded at its tips (roundTips) and flat at a root. With leBand, the first part of the chord top
 * and bottom is its own group (the white leading edge).
 */
function airfoilGeometry(THREE, table, { span = 'y', leBand = 0 } = {}) {
  const { sections, caps } = roundTips(table);
  const K = 14;
  const xs = [];
  for (let k = 0; k <= K; k++) xs.push((1 - Math.cos((Math.PI * k) / K)) / 2); // closer together at the nose
  const ring = [];
  for (let k = K; k >= 0; k--) ring.push([xs[k], 1]); // upper surface, trailing edge to leading edge
  for (let k = 1; k < K; k++) ring.push([xs[k], -1]); // lower surface back to the trailing edge
  const R = ring.length;
  const pos = [];
  for (const sec of sections) {
    for (const [xc, side] of ring) {
      const x = sec.le - xc * sec.chord;
      const off = sec.z + side * thick(xc, sec.t) * sec.chord;
      if (span === 'y') pos.push(x, sec.s, off);
      else pos.push(x, off, sec.s);
    }
  }
  const body = [], band = [];
  for (let i = 0; i < sections.length - 1; i++) {
    for (let k = 0; k < R; k++) {
      const a = i * R + k, b = i * R + ((k + 1) % R), c = a + R, d = b + R;
      const inBand = leBand > 0 && ring[k][0] <= leBand && ring[(k + 1) % R][0] <= leBand;
      (inBand ? band : body).push(a, b, c, b, d, c);
    }
  }
  // End caps where a root is cut off: a fan from the middle of the end section.
  for (const i of [0, sections.length - 1]) {
    if (!caps[i === 0 ? 0 : 1]) continue;
    const sec = sections[i];
    const centre = pos.length / 3;
    const x = sec.le - 0.4 * sec.chord;
    if (span === 'y') pos.push(x, sec.s, sec.z);
    else pos.push(x, sec.z, sec.s);
    for (let k = 0; k < R; k++) body.push(centre, i * R + k, i * R + ((k + 1) % R));
  }
  return meshOf(THREE, pos, [...body, ...band], band.length ? [[0, body.length, 0], [body.length, band.length, 1]] : null);
}

/**
 * Joins several geometries into one, so parts sharing a paint are one draw call. parts: [{ geometry, materials }]:
 * materials gives, for each of the part's groups (or the whole part), the joined geometry's material slot. The
 * parts are freed; the joined geometry has one group per slot.
 */
/** Parts ({ geometry, materials: slot per group }) joined into one geometry with a group per slot (position and
 * normal only); the parts are disposed. Shared with ct156-cockpit.js as ct156JoinGeometries. */
export function ct156JoinGeometries(THREE, parts) {
  return joinGeometries(THREE, parts);
}
function joinGeometries(THREE, parts) {
  const bySlot = new Map();
  for (const { geometry, materials } of parts) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!flat.attributes.normal) flat.computeVertexNormals();
    const p = flat.attributes.position.array, n = flat.attributes.normal.array;
    const ranges = flat.groups.length ? flat.groups.map((gr) => [gr.start, gr.count, materials[gr.materialIndex] ?? materials[0]]) : [[0, p.length / 3, materials[0]]];
    for (const [start, count, slot] of ranges) {
      if (!bySlot.has(slot)) bySlot.set(slot, { pos: [], nor: [] });
      const into = bySlot.get(slot);
      for (let v = start; v < start + count; v++) {
        into.pos.push(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]);
        into.nor.push(n[v * 3], n[v * 3 + 1], n[v * 3 + 2]);
      }
    }
    if (flat !== geometry) flat.dispose();
    geometry.dispose();
  }
  const pos = [], nor = [];
  const g = new THREE.BufferGeometry();
  for (const slot of [...bySlot.keys()].sort((a, b) => a - b)) {
    const { pos: sp, nor: sn } = bySlot.get(slot);
    g.addGroup(pos.length / 3, sp.length / 3, slot);
    for (const v of sp) pos.push(v);
    for (const v of sn) nor.push(v);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

// A decal patch that hugs a side surface: |y| = surf(x, z). side +1 left, -1 right.
// u runs so the picture reads correctly when seen from outside that side.
function patch(THREE, xc, zc, w, h, side, surf) {
  const nx = Math.max(2, Math.ceil(w / 0.015));
  const nz = Math.max(2, Math.ceil(h / 0.015));
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const a = (i / nx - 0.5) * w;
      const x = xc + (side > 0 ? -a : a);
      const z = zc + (j / nz - 0.5) * h;
      pos.push(x, side * surf(x, z), z);
      uv.push(i / nx, j / nz);
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const p = j * (nx + 1) + i;
      idx.push(p, p + 1, p + nx + 1, p + 1, p + nx + 2, p + nx + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A decal that hugs a wing, upper (+1) or lower (-1): w along ax and h along ay (unit vectors in the wing's plane),
 * centred at (x, y) on the wing as built flat; bent with the wing's dihedral (wingBend).
 */
function wingPatch(THREE, x, y, w, h, ax, ay, side) {
  const n = 10;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const u = i / n - 0.5, v = j / n - 0.5;
      const px = x + u * w * ax[0] + v * h * ay[0];
      const py = y + u * w * ax[1] + v * h * ay[1];
      pos.push(...wingBend([px, py, wingSurfZ(px, py, side)]));
      uv.push(i / n, j / n);
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const p = j * (n + 1) + i;
      idx.push(p, p + 1, p + n + 2, p, p + n + 2, p + n + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Cheat line: a white ribbon on both sides from just behind the nose number to the tail, and a thin one ahead of the
// number, under the exhaust stack nearly to the spinner, a little lower (Patrick's photo of 156102).
function cheatLine(THREE) {
  const pos = [], idx = [];
  const runs = [
    { x0: 0.363, x1: -0.715, N: 48, half: 0.0032, z: cheatZ },
    { x0: 0.552, x1: 0.463, N: 8, half: 0.0016, z: () => cheatZ() - 0.006 },
  ];
  for (const { x0, x1, N, half, z: zOf } of runs) {
    for (const side of [1, -1]) {
      const base = pos.length / 3;
      for (let k = 0; k <= N; k++) {
        const x = x0 + ((x1 - x0) * k) / N;
        const zc = zOf(x);
        for (const z of [zc + half, zc - half]) pos.push(x, side * fuseSurf(x, z), z);
      }
      for (let k = 0; k < N; k++) {
        const p = base + k * 2;
        idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A thin piece hugging the fuselage's side (side +1 left, -1 right) through rows [x, zTop, zBottom] from aft to front,
 * nz steps down each row: a painted or dark shape that follows the skin's curve.
 */
function skinStrip(THREE, rows, side, nz = 3) {
  const pos = [], idx = [];
  for (const [x, zTop, zBottom] of rows) {
    for (let j = 0; j <= nz; j++) {
      const z = zTop + ((zBottom - zTop) * j) / nz;
      pos.push(x, side * fuseSurf(x, z), z);
    }
  }
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < nz; j++) {
      const a = i * (nz + 1) + j, b = a + nz + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return meshOf(THREE, pos, idx);
}

/**
 * A pilot in a seat, the helmet's centre at (x, 0, z), sitting up and looking ahead, built after a picture of
 * an aircrew in flying kit (Patrick, 11 Oct 2026 20:20Z: "better pilot models"; earlier: "o2 hose on the left ...
 * looking straight ahead"): the helmet with its visor housing on the front and ear cups at the sides, the dark visor
 * down, the oxygen mask with its straps to the helmet and its corrugated hose down the left of the chest to the
 * connector on the harness, the neck in the life preserver's collar, the flight suit's shoulders and chest under the
 * survival vest, the harness's shoulder straps and chest strap, and the arms: the right hand on the stick, the left on
 * the power lever. Slots: 0 helmet, 1 visor, 2 mask, 3 hose, 4 flight suit, 5 vest and collar, 6 harness, 7 gloves.
 * Sizes and colours estimates (a helmet about 11 in across, shoulders 17 in, the hands where the stick and the power
 * lever about are); the legs, under the cockpit's sill and behind the seats, are left out.
 */
function pilotGeometry(THREE, x, z) {
  const P = (a, b, c) => new THREE.Vector3(x + a, b, z + c);
  const shell = (g) => g.scale(1.08, 0.95, 1).translate(x, 0, z);
  // A tapered round piece from a to b (offsets from the helmet's centre).
  const limb = (a, b, r0, r1) => {
    const A = P(...a), B = P(...b), d = B.clone().sub(A);
    const g = new THREE.CylinderGeometry(r1, r0, d.length(), 10);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  };
  const joint = (c, r) => ellipsoid(THREE, x + c[0], c[1], z + c[2], r, r, r);
  // A tube along the points; ribbed every other ring when `ribs`.
  const tube = (pts, r, ribs) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((q) => P(...q)));
    const n = ribs ? 40 : 16, g = new THREE.TubeGeometry(curve, n, r, 8, false);
    if (ribs) {
      const pos = g.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i <= n; i++) {
        const c = curve.getPointAt(i / n), k = i % 2 ? 1.25 : 0.85;
        for (let j = 0; j <= 8; j++) {
          const m = i * 9 + j;
          v.fromBufferAttribute(pos, m).sub(c).multiplyScalar(k).add(c);
          pos.setXYZ(m, v.x, v.y, v.z);
        }
      }
      g.computeVertexNormals();
    }
    return g;
  };
  const strap = (pts) => tube(pts, 0.0017, false);
  const arm = (side, hand) => [
    { geometry: joint([-0.006, side * 0.031, -0.046], 0.0098), materials: [4] },
    { geometry: limb([-0.006, side * 0.032, -0.046], [0.004, side * 0.034, -0.085], 0.0085, 0.0072), materials: [4] },
    { geometry: joint([0.004, side * 0.034, -0.085], 0.0072), materials: [4] },
    { geometry: limb([0.004, side * 0.034, -0.085], hand, 0.007, 0.0055), materials: [4] },
    { geometry: ellipsoid(THREE, x + hand[0] + 0.004, hand[1], z + hand[2], 0.0065, 0.0045, 0.0055), materials: [7] },
  ];
  return joinGeometries(THREE, [
    // Helmet, the visor housing's raised cover across its front and top, the ear cups.
    { geometry: shell(new THREE.SphereGeometry(0.0195, 18, 14)), materials: [0] },
    { geometry: shell(new THREE.SphereGeometry(0.0208, 18, 8, Math.PI - 0.95, 1.9, 0.35, 0.75).rotateX(Math.PI / 2)), materials: [0] },
    ...[1, -1].map((sd) => ({ geometry: ellipsoid(THREE, x - 0.003, sd * 0.0185, z - 0.006, 0.0075, 0.004, 0.0085), materials: [0] })),
    // The visor down, under the housing.
    { geometry: shell(new THREE.SphereGeometry(0.0205, 16, 6, Math.PI - 1.0, 2.0, 1.1, 0.62).rotateX(Math.PI / 2)), materials: [1] },
    // The mask, its valve and its straps back to the helmet's sides.
    { geometry: ellipsoid(THREE, x + 0.0165, 0, z - 0.011, 0.0085, 0.0082, 0.0095), materials: [2] },
    { geometry: limb([0.022, 0, -0.016], [0.026, 0, -0.019], 0.0035, 0.003), materials: [3] },
    ...[1, -1].map((sd) => ({ geometry: limb([0.014, sd * 0.0075, -0.008], [0.001, sd * 0.019, -0.006], 0.0012, 0.0012), materials: [2] })),
    // The hose: from the valve down the pilot's left to the connector on the harness.
    { geometry: tube([[0.026, 0.0, -0.02], [0.024, 0.006, -0.032], [0.021, 0.014, -0.048], [0.019, 0.019, -0.064], [0.018, 0.016, -0.08], [0.019, 0.01, -0.09]], 0.0028, true), materials: [3] },
    // Neck, the life preserver's collar round it, shoulders and chest in the flight suit, the vest over the chest.
    { geometry: limb([-0.002, 0, -0.018], [-0.003, 0, -0.034], 0.0072, 0.0068), materials: [4] },
    { geometry: new THREE.TorusGeometry(0.0115, 0.0048, 8, 20).scale(1, 1.15, 0.6).translate(x - 0.002, 0, z - 0.032), materials: [5] },
    { geometry: ellipsoid(THREE, x - 0.006, 0, z - 0.044, 0.016, 0.034, 0.012), materials: [4] },
    { geometry: ellipsoid(THREE, x - 0.005, 0, z - 0.072, 0.019, 0.027, 0.036), materials: [4] },
    { geometry: ellipsoid(THREE, x - 0.002, 0, z - 0.07, 0.0195, 0.0262, 0.031), materials: [5] },
    // The harness: shoulder straps over the vest down to the buckle, and the chest strap across.
    ...[1, -1].map((sd) => ({ geometry: strap([[-0.02, sd * 0.014, -0.04], [-0.007, sd * 0.015, -0.031], [0.012, sd * 0.014, -0.045], [0.017, sd * 0.011, -0.07], [0.018, sd * 0.006, -0.095]]), materials: [6] })),
    { geometry: strap([[0.012, -0.022, -0.062], [0.0175, -0.01, -0.062], [0.0185, 0, -0.062], [0.0175, 0.01, -0.062], [0.012, 0.022, -0.062]]), materials: [6] },
    { geometry: new THREE.BoxGeometry(0.003, 0.012, 0.008).translate(x + 0.0185, 0, z - 0.097), materials: [6] },
    // Arms: the right hand on the stick, the left on the power lever.
    ...arm(-1, [0.05, -0.006, -0.1]),
    ...arm(1, [0.036, 0.036, -0.092]),
  ]);
}

/**
 * The ejection seat's headbox behind a pilot whose helmet's centre is at (x, 0, z): a dark box standing up behind the
 * helmet, its top `above` over the helmet's centre, with the two canopy breakers on top, so from outside it shows
 * between the pilot's head and the canopy bow behind (Patrick, 11 Oct 2026). Sizes estimates.
 */
function headboxGeometry(THREE, x, z, above) {
  const top = z + above, foot = 0.045;
  return joinGeometries(THREE, [
    { geometry: new THREE.BoxGeometry(0.02, 0.034, top - foot).translate(x - 0.032, 0, (top + foot) / 2), materials: [0] },
    ...[1, -1].map((s) => ({ geometry: new THREE.ConeGeometry(0.0018, 0.006, 6).rotateX(Math.PI / 2).translate(x - 0.03, s * 0.009, top + 0.003), materials: [0] })),
  ]);
}

/** The cowl's top line at x (the fuselage's top, STATIONS). */
const topAt = (x) => rowAt(STATIONS, x)[2];
/** The belly line at x (STATIONS). */
const bellyAt = (x) => rowAt(STATIONS, x)[3];

function ellipsoid(THREE, cx, cy, cz, rx, ry, rz) {
  const g = new THREE.SphereGeometry(1, 20, 12);
  g.scale(rx, ry, rz);
  g.translate(cx, cy, cz);
  return g;
}

function buildKit(THREE) {
  const own = []; // everything to dispose with the kit
  const keep = (o) => (own.push(o), o);
  const geo = {};
  // The chin intake under the spinner, painted (it was a dark blob in the frames' colour);
  // its dark mouth is with the vents. Size and place estimates (the side drawing's lip 2.1 to 2.5 ft behind the tip).
  const CHIN = [0.545, 0, -0.058, 0.03, 0.032, 0.016];
  const chinIntake = () => ellipsoid(THREE, ...CHIN);

  // The sky above and the prairie below, for the reflections in the paint, the glass and the chrome: the same blues
  // as the 3D views' sky (ui-kit/sky-clouds.js), with the sun's bright patch. Auto-converted by the renderer.
  // A soft sun with a glow round it, a few fair-weather clouds and haze at the horizon, so the gloss and the glass show
  // the sky's shapes and not one bright patch (all by eye).
  const env = keep(canvasTexture(THREE, 256, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2f6aa8'); g.addColorStop(0.3, '#6f9fd2'); g.addColorStop(0.47, '#cfe0ee'); g.addColorStop(0.5, '#e8eef2');
    g.addColorStop(0.52, '#8a8a62'); g.addColorStop(0.7, '#5d6440'); g.addColorStop(1, '#2c3220');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const sun = ctx.createRadialGradient(w * 0.15, h * 0.16, 0, w * 0.15, h * 0.16, h * 0.16);
    sun.addColorStop(0, 'rgba(255,255,255,1)'); sun.addColorStop(0.25, 'rgba(255,252,240,0.9)'); sun.addColorStop(1, 'rgba(255,250,235,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, w, h * 0.5);
    for (const [cx, cy, r] of [[0.32, 0.36, 0.05], [0.37, 0.38, 0.04], [0.58, 0.33, 0.06], [0.64, 0.35, 0.04], [0.82, 0.4, 0.05], [0.05, 0.41, 0.04]]) {
      const c = ctx.createRadialGradient(cx * w, cy * h, 0, cx * w, cy * h, r * w);
      c.addColorStop(0, 'rgba(255,255,255,0.85)'); c.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = c; ctx.fillRect(0, 0, w, h * 0.5);
    }
  }));
  env.mapping = THREE.EquirectangularReflectionMapping;

  // The fuselage with the painted fairing behind the canopy.
  geo.fuselage = joinGeometries(THREE, [{ geometry: fuselageGeometry(THREE), materials: [0] }, { geometry: fairingGeometry(THREE), materials: [0] }, { geometry: noseFairingGeometry(THREE), materials: [0] }, { geometry: chinIntake(), materials: [0] }]);
  // The camera's own ship only (setCockpitView): the fuselage open over the cockpit, and the tub under it (TS-155).
  geo.fuselageCut = joinGeometries(THREE, [{ geometry: fuselageGeometry(THREE, { cut: true }), materials: [0] }, { geometry: fairingGeometry(THREE), materials: [0] }, { geometry: noseFairingGeometry(THREE), materials: [0] }, { geometry: chinIntake(), materials: [0] }]);
  geo.tub = tubGeometry(THREE);
  // Wings, tailplane, ventral fin and dorsal fin in one geometry (the wings' leading edges a second slot), so the
  // airframe is one draw call; the dihedral is built in (wingBend).
  const wing = (side) => {
    const g = airfoilGeometry(THREE, side > 0 ? WING : WING.map((s) => ({ ...s, s: -s.s })).reverse(), { leBand: 0.07 });
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, ...wingBend([p.getX(i), p.getY(i), p.getZ(i)]));
    g.computeVertexNormals();
    return g;
  };
  geo.airframe = joinGeometries(THREE, [
    { geometry: wing(1), materials: [0, 1] },
    { geometry: wing(-1), materials: [0, 1] },
    { geometry: airfoilGeometry(THREE, STAB), materials: [0] },
    { geometry: ventralGeometry(THREE), materials: [0] },
    { geometry: dorsalGeometry(THREE), materials: [0] },
  ]);
  // The fin, its leading edge a second slot: unpainted light grey on Patrick's photo of 156102 (width an estimate).
  geo.fin = airfoilGeometry(THREE, FIN, { span: 'z', leBand: 0.12 });
  geo.canopy = canopyGeometry(THREE);
  geo.frames = joinGeometries(THREE, [
    // The centre and rear hoops; the forward one is apart (bowFront), since from the seat ct156-cockpit.js draws it.
    ...CT156_FRAME_X.slice(1).map((x, i) => ({ geometry: hoopGeometry(THREE, x, CT156_FRAME_LEAN[i + 1]), materials: [0] })),
    { geometry: railGeometry(THREE, 1), materials: [0] },
    { geometry: railGeometry(THREE, -1), materials: [0] },
  ]);
  geo.bowFront = hoopGeometry(THREE, CT156_FRAME_X[0], CT156_FRAME_LEAN[0]);
  const floor = new THREE.CircleGeometry(1, 24);
  floor.scale(0.2, 0.05, 1);
  floor.translate(-0.035, 0, 0.046);
  geo.floor = floor;
  // The two pilots apart, so the Cockpit view can leave out the one the camera sits in (setCockpitView), and the
  // ejection seats' headboxes behind them (the rear one lower, under the canopy's falling top).
  [geo.helmetFront, geo.helmetRear] = CT156_SEAT_X.map((x, i) => pilotGeometry(THREE, x, CT156_HELMET_Z[i]));
  geo.seats = joinGeometries(THREE, CT156_SEAT_X.map((x, i) => ({ geometry: headboxGeometry(THREE, x, CT156_HELMET_Z[i], [0.012, 0.008][i]), materials: [0] })));
  // The exhaust stacks either side of the nose (photo), each with its dark opening facing aft (AETCMAN 11-248 Fig 9.17:
  // a fore-and-aft reference from #2; TS-156).
  geo.stubs = joinGeometries(THREE, [1, -1].flatMap((s) => [
    { geometry: stackGeometry(THREE, s), materials: [0] },
    { geometry: stackGeometry(THREE, s, true), materials: [1] },
    { geometry: new THREE.CircleGeometry(1, 16).scale(STUB.halfTall * 0.85, STUB.halfWide * 0.85, 1).rotateY(-Math.PI / 2).translate(STUB.xBend + 0.002, s * STUB.yMid, STUB.z), materials: [1] },
    // The dark gap in the cowl round the stack's root (the 156102 photo shows it as a dark rim, widest over the stack).
    { geometry: ellipsoid(THREE, STUB.xBend + STUB.R, s * (fuseSurf(STUB.xBend + STUB.R, STUB.z) - 0.0045), STUB.z + 0.002, STUB.halfWide * 1.3, 0.003, STUB.halfTall * 1.45), materials: [1] },
  ]));
  // The position lights (TS-156): red on the left wingtip and green on the right, just behind each tip's leading edge,
  // a white strobe at each tip's trailing edge and a white light on the tail. Small lit shapes, sizes estimates.
  geo.lights = joinGeometries(THREE, [
    { geometry: ellipsoid(THREE, ...CT156_REFERENCE_POINTS.leftLight, 0.014, 0.007, 0.006), materials: [0] },
    { geometry: ellipsoid(THREE, ...CT156_REFERENCE_POINTS.rightLight, 0.014, 0.007, 0.006), materials: [1] },
    ...[1, -1].map((s) => ({ geometry: ellipsoid(THREE, STROBE_X, s * (WINGTIP.y + 0.002), WINGTIP.z, 0.008, 0.005, 0.004), materials: [2] })),
    { geometry: ellipsoid(THREE, ...TAIL_LIGHT, 0.006, 0.004, 0.005), materials: [2] },
  ]);
  // The spinner: a smooth ogive (its tip a formation reference, AETCMAN 11-248 Fig 9.17; TS-156), on a dark backplate
  // ring so its outline reads against the cowling.
  const ogive = ct156SpinnerProfile().map(([x, r]) => new THREE.Vector2(r, x));
  const spin = new THREE.LatheGeometry(ogive, 32);
  spin.rotateZ(-Math.PI / 2);
  geo.spinner = spin;
  geo.spinnerRing = new THREE.CylinderGeometry(CT156_SPINNER_R + 0.0015, CT156_SPINNER_R + 0.0015, 0.006, 32, 1, true).rotateZ(Math.PI / 2).translate(0.573, 0, 0);
  // The prop: 97 in across (published T-6A figure; an estimate until a manual page backs it), 0.175 units each side.
  const disc = new THREE.CircleGeometry(0.175, 32);
  disc.rotateY(Math.PI / 2);
  disc.translate(0.585, 0, 0);
  geo.disc = disc;
  // The four blades as one geometry and their red tips as another (Traffic's turning prop hides both: blurProp).
  const blade = (v0, v1, w0, w1) => joinGeometries(THREE, [0, 1, 2, 3].map((k) => {
    const s = new THREE.Shape([[-w0, v0], [w0, v0], [w1, v1], [-w1, v1]].map(([a, b]) => new THREE.Vector2(a, b)));
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: false });
    g.rotateY(Math.PI / 2); // depth along x, radial along y
    g.translate(0.587, 0, 0);
    g.rotateX((k * Math.PI) / 2);
    return { geometry: g, materials: [0] };
  }));
  geo.blade = blade(0.03, 0.15, 0.016, 0.013);
  geo.bladeTip = blade(0.15, 0.175, 0.013, 0.012);
  geo.cheat = cheatLine(THREE);
  // Off Patrick's photo of 156102 (11 Oct 2026, marked; places and sizes measured on it, estimates): the air inlet on
  // each side of the cowl's top just ahead of the windscreen, a dark wedge 0.053 units (1.2 ft) long, deep at its aft
  // end and running out forward.
  geo.vent = joinGeometries(THREE, [{ geometry: new THREE.CircleGeometry(1, 20).scale(0.007, 0.016, 1).rotateY(Math.PI / 2).translate(CHIN[0] + CHIN[3] + 0.0005, 0, CHIN[2]), materials: [0] }, ...[1, -1].map((side) => ({
    geometry: skinStrip(THREE, Array.from({ length: 7 }, (_, i) => {
      const t = i / 6, x = 0.304 + 0.053 * t;
      return [x, topAt(x) - 0.0045 - 0.0027 * t, topAt(x) - 0.0134 + 0.0044 * t];
    }), side),
    materials: [0],
  }))]);
  // The antennas (TAS, BELLY_PADDLES, SMALL_ANTENNAS, MARKER_PLATE), the pitot probes on the wings (PITOT) and the
  // tie-down rings under them (TIE_DOWN): slot 0 light grey, 1 white (the aft paddle's foot), 2 dark (the TAS antenna's
  // blades, painted, as on Patrick's T-6C photo; the tie-down rings).
  geo.antenna = joinGeometries(THREE, [
    ...BELLY_PADDLES.map((row) => ({ geometry: paddleGeometry(THREE, row), materials: [0, 1] })),
    ...SMALL_ANTENNAS.map(([x, up, length, height]) => ({ geometry: bladeAntennaGeometry(THREE, x, up, length, height), materials: [0] })),
    { geometry: markerPlateGeometry(THREE), materials: [0] },
    { geometry: tasGeometry(THREE), materials: [2] },
    { geometry: pitotGeometry(THREE, 1), materials: [0] },
    { geometry: pitotGeometry(THREE, -1), materials: [0] },
    { geometry: tieDownGeometry(THREE, 1), materials: [2] },
    { geometry: finWicksGeometry(THREE), materials: [2] },
    { geometry: tieDownGeometry(THREE, -1), materials: [2] },
  ]);
  geo.beacon = ellipsoid(THREE, BEACON[0], 0, bellyAt(BEACON[0]) + 0.001, BEACON[1], BEACON[2], BEACON[3]);
  // The speed brake (SPEED_BRAKE): its plate, hinged at the origin (each ship turns it, setSpeedBrake), and the dark well
  // it leaves in the belly when it is open.
  geo.speedBrake = speedBrakeGeometry(THREE);
  {
    const { x0, length, half } = SPEED_BRAKE;
    const n = 8, pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const x = x0 - (length * i) / n, z = bellyAt(x) - 0.0004;
      pos.push(x, half, z, x, -half, z);
      if (i < n) idx.push(2 * i, 2 * i + 2, 2 * i + 1, 2 * i + 1, 2 * i + 2, 2 * i + 3);
    }
    geo.speedBrakeWell = meshOf(THREE, pos, idx);
  }
  for (const o of Object.values(geo)) keep(o);

  // Shared decal textures and geometry.
  const tex = {};
  tex.roundel = keep(canvasTexture(THREE, 256, 256, (ctx, w) => roundelCanvas(ctx, w), 4));
  tex.canada = keep(canvasTexture(THREE, 256, 72, (ctx, w, h) => {
    ctx.font = '600 52px "Trebuchet MS", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff'; ctx.fillText('Canada', w * 0.46, h * 0.5);
    leaf(ctx, w * 0.93, h * 0.32, 8, '#e4212d');
  }, 4));
  tex.marks = keep(canvasTexture(THREE, 64, 64, (ctx, w) => {
    const disc = (u, r, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(u * w, w / 2, r * w, 0, 7); ctx.fill(); };
    disc(0.72, 0.15, '#f4f6f8'); disc(0.72, 0.06, '#d2202c'); disc(0.3, 0.09, '#e8b520'); disc(0.3, 0.04, '#7a5a10');
  }, 4));
  tex.tri = keep(canvasTexture(THREE, 64, 64, (ctx) => {
    ctx.fillStyle = '#f4f6f8'; ctx.beginPath(); ctx.moveTo(4, 8); ctx.lineTo(60, 8); ctx.lineTo(32, 60); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d2202c'; ctx.beginPath(); ctx.moveTo(15, 17); ctx.lineTo(49, 17); ctx.lineTo(32, 47); ctx.closePath(); ctx.fill();
  }, 4));

  // The small yellow stencils on the fuselage's side (web photo research, 11 Oct 2026, RCAF CT-156 photos): a yellow
  // panel with a black arrow by the wing root under the rear canopy, and a yellow dot each aft of the roundel and at the
  // wing root. On US Navy T-6As the like marks are STEP and RESCUE stencils; what they say on the CT-156 is a guess, so
  // no words. Places and sizes estimates off the photos.
  tex.stencil = keep(canvasTexture(THREE, 64, 48, (ctx, w, h) => {
    ctx.fillStyle = '#e8c21c'; ctx.fillRect(2, 2, w - 4, h - 4);
    ctx.strokeStyle = '#111111'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(w * 0.25, h * 0.78); ctx.lineTo(w * 0.7, h * 0.3); ctx.stroke();
    ctx.fillStyle = '#111111'; ctx.beginPath(); ctx.moveTo(w * 0.8, h * 0.18); ctx.lineTo(w * 0.52, h * 0.26); ctx.lineTo(w * 0.72, h * 0.48); ctx.closePath(); ctx.fill();
  }, 4));
  tex.dot = keep(canvasTexture(THREE, 32, 32, (ctx, w) => {
    ctx.fillStyle = '#e8c21c'; ctx.beginPath(); ctx.arc(w / 2, w / 2, w * 0.42, 0, 7); ctx.fill();
  }, 4));

  const both = (make) => ({ 1: make(1), '-1': make(-1) });
  const decalGeo = {
    roundelSide: both((side) => patch(THREE, -0.333, cheatZ(-0.333), 0.05, 0.05, side, fuseSurf)),
    // "Canada" and the rescue triangles just under the canopy's rail, as on Patrick's photo of 156102 (were 0.4 ft lower).
    canada: both((side) => patch(THREE, 0.194, 0, 0.085, 0.024, side, fuseSurf)),
    triA: both((side) => patch(THREE, 0.082, 0, 0.022, 0.022, side, fuseSurf)),
    triB: both((side) => patch(THREE, -0.151, 0, 0.022, 0.022, side, fuseSurf)),
    triC: both((side) => patch(THREE, -0.033, 0, 0.015, 0.015, side, fuseSurf)),
    stencil: both((side) => patch(THREE, -0.17, -0.072, 0.013, 0.01, side, fuseSurf)),
    dotAft: both((side) => patch(THREE, -0.385, cheatZ(-0.385) - 0.012, 0.005, 0.005, side, fuseSurf)),
    dotRoot: both((side) => patch(THREE, -0.1, -0.085, 0.005, 0.005, side, fuseSurf)),
    // The nose number on the cheat line between its two runs (the photo; was one digit, 0.02 units further forward).
    nose: both((side) => patch(THREE, 0.406, cheatZ(0.406) - 0.002, 0.05, 0.025, side, fuseSurf)),
    // Centred on the fin's mid-chord (nearly upright, the leading edge swept back and the trailing edge forward) and on
    // the fin above the tail cone (Patrick, 11 Oct 2026: "central on the vertical stab, not right on the edge"; was 0.03
    // units aft, at the trailing edge).
    tail: both((side) => patch(THREE, FIN_DECAL.x, FIN_DECAL.z, FIN_DECAL.size, FIN_DECAL.size, side, finSurf)),
    // Upper left wing: seen from above, nose up, right = -Y.
    roundelWing: wingPatch(THREE, WING_MARK[0], WING_MARK[1], 0.14, 0.14, [0, -1], [1, 0], 1),
    // Under the right wing (WING_MARK): seen from below with the nose up, right = +Y.
    roundelUnder: wingPatch(THREE, WING_MARK[0], -WING_MARK[1], 0.14, 0.14, [0, 1], [1, 0], -1),
    // On top of the right wing (WING_MARK): along the chord, reading trailing edge to leading edge, the digits' tops inboard.
    wingNum: wingPatch(THREE, WING_MARK[0], -WING_MARK[1], 0.24, 0.08, [1, 0], [0, 1], 1),
    // Under each wing beside the pitot (UNDERWING_MARKS): along the chord, the white disc forward.
    marks: both((side) => {
      const sec = sectionOf(WING, PITOT.s);
      return wingPatch(THREE, sec.le - UNDERWING_MARKS.x * sec.chord - UNDERWING_MARKS.size / 2 + 0.004, side * (PITOT.s - 0.006), UNDERWING_MARKS.size, UNDERWING_MARKS.size, [1, 0], [0, 1], -1);
    }),
  };
  for (const v of Object.values(decalGeo)) {
    if (v.isBufferGeometry) keep(v);
    else { keep(v[1]); keep(v['-1']); }
  }

  const two = THREE.DoubleSide; // both faces lit the right way round, whichever way a part's triangles were wound
  const mat = (params) => keep(new THREE.MeshStandardMaterial({ fog: false, ...params }));
  // Glossy paint: a clear coat over the colour, as on the real aircraft (Patrick's photos).
  const gloss = (params) => keep(new THREE.MeshPhysicalMaterial({ fog: false, side: two, clearcoat: 1, clearcoatRoughness: 0.12, envMap: env, ...params }));
  const decalMat = (map) => keep(new THREE.MeshStandardMaterial({
    map, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.55, metalness: 0, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.6, fog: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  const mats = {
    env,
    navy: gloss({ color: NAVY, roughness: 0.42, metalness: 0.15, envMapIntensity: 0.8 }),
    cheat: mat({ color: '#f1f4f8', roughness: 0.45, emissive: '#ffffff', emissiveIntensity: 0.3, side: two, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    wingLe: gloss({ color: '#f1f4f8', roughness: 0.4, emissive: '#ffffff', emissiveIntensity: 0.2, envMapIntensity: 0.5 }),
    finLe: mat({ color: '#c3c9cf', roughness: 0.5, side: two }),
    vent: mat({ color: '#07090b', roughness: 0.9, side: two, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    // The antennas (geo.antenna's slots): light grey (lighter, as the paddles on Patrick's 156102 photo; was #a8aaa4),
    // white, and dark for the painted TAS blades and the tie-down rings.
    antenna: [mat({ color: '#c4c5bf', roughness: 0.5, side: two }), mat({ color: '#f1f3f5', roughness: 0.45, side: two }), mat({ color: '#15181d', roughness: 0.45, metalness: 0.3, side: two })],
    beacon: mat({ color: '#8a6326', roughness: 0.25, metalness: 0.2, envMap: env, envMapIntensity: 0.8 }),
    chrome: mat({ color: '#f2f5f8', roughness: 0.1, metalness: 1, envMap: env, envMapIntensity: 1.2 }),
    // Bare, heat-stained steel, as on Patrick's photo of 156102 (was a dark grey that read as paint).
    // Lighter and shinier, so the stacks read as metal pipes and not painted tanks (156102 and 156115 photos; by eye).
    exhaust: mat({ color: '#a8988a', roughness: 0.32, metalness: 0.85, envMap: env, envMapIntensity: 0.9 }),
    glass: mat({ color: '#1d2a36', transparent: true, opacity: 0.4, roughness: 0.04, metalness: 0.6, envMap: env, envMapIntensity: 1.4, depthWrite: false, side: two }),
    // The canopy seen from inside (setCockpitView): a faint clear tint, no reflections, so the sky shows through it.
    glassInside: keep(new THREE.MeshBasicMaterial({ color: '#cfe3f2', transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, fog: false })),
    frame: mat({ color: '#0c1017', roughness: 0.5, side: two }),
    floor: mat({ color: '#0d1118', roughness: 0.9, side: two }),
    // The cockpit tub (setCockpitView; TS-155, TS-157): a dark charcoal floor and walls, as US Navy T-6A cockpit photos
    // show (Patrick, 11 Oct 2026 22:06Z; were mid and light grey off Dad's reference pictures). Shades estimates.
    tubFloor: mat({ color: '#26292c', roughness: 0.95, side: two }),
    tubWall: mat({ color: '#2f3236', roughness: 0.85, side: two }),
    // The pilots (pilotGeometry): helmet, visor, mask, hose, flight suit, vest and collar, harness, gloves (colours
    // estimates); and the seats' headboxes.
    pilot: [
      mat({ color: '#c3c9d0', roughness: 0.35 }),
      mat({ color: '#141920', roughness: 0.12, metalness: 0.5, envMap: env, envMapIntensity: 1, side: two }),
      mat({ color: '#4c5348', roughness: 0.6 }),
      mat({ color: '#2f3329', roughness: 0.7 }),
      mat({ color: '#5e6648', roughness: 0.85 }),
      mat({ color: '#454b36', roughness: 0.8 }),
      mat({ color: '#2b2e27', roughness: 0.75 }),
      mat({ color: '#33322c', roughness: 0.8 }),
    ],
    headbox: mat({ color: '#25282c', roughness: 0.6 }),
    blade: mat({ color: '#0a0c10', roughness: 0.6 }),
    tip: mat({ color: '#d2202c', roughness: 0.5 }),
    // The turning prop's blades, half see-through so they read as a blur (PROP_TURN).
    propBlade: mat({ color: '#0a0c10', roughness: 0.6, transparent: true, opacity: 0.45, depthWrite: false, side: two }),
    propTip: mat({ color: '#d2202c', roughness: 0.5, transparent: true, opacity: 0.55, depthWrite: false, side: two }),
    disc: keep(new THREE.MeshBasicMaterial({ color: '#dcebff', transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, fog: false })),
    // The position lights, lit whatever the sun (TS-156): red, green, white.
    lights: ['#ff2b2b', '#2bff6a', '#ffffff'].map((color) => keep(new THREE.MeshBasicMaterial({ color, fog: false }))),
    roundel: decalMat(tex.roundel),
    canada: decalMat(tex.canada),
    tri: decalMat(tex.tri),
    marks: decalMat(tex.marks),
    stencil: decalMat(tex.stencil),
    dot: decalMat(tex.dot),
  };
  const kit = { THREE, geo, decalGeo, mats, refs: 0, own, disposed: false, dispose: () => ((kit.disposed = true), own.forEach((o) => o.dispose())) };
  // The outside from the Blender file (ALL-33): each part's fingerprint now, before the file's shapes take its place.
  kit.hashes = Object.fromEntries(EXTERIOR_PARTS.map((name) => [name, ct156PiecesHash([{ geometry: geo[name] }])]));
  kit.exteriorGeos = new Set(EXTERIOR_PARTS.map((name) => geo[name]));
  kit.exteriorMeshes = new Set();
  kit.shaded = new WeakMap();
  kit.ao = null;
  if (typeof window !== 'undefined') attachExterior(kit);
  return kit;
}

function getKit(THREE) {
  let k = kits.get(THREE);
  if (!k) kits.set(THREE, (k = buildKit(THREE)));
  return k;
}

// ---------- near and far ----------

/**
 * How long the aircraft looks on screen, in CSS pixels, from this camera. Its length is the scaled group's (lengthFt), so
 * a ship built at its real length shows its detail as close as one scaled from outside.
 */
function onScreenPx(THREE, obj, camera, renderer) {
  const size = renderer.getSize(new THREE.Vector2());
  const lengthWorld = CT156_UNIT_LENGTH * (obj.userData.ct156?.g ?? obj).matrixWorld.getMaxScaleOnAxis();
  if (camera.isOrthographicCamera) return (lengthWorld * camera.zoom * size.y) / Math.max(camera.top - camera.bottom, 1e-9);
  const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const d = eye.distanceTo(new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld));
  return (lengthWorld * size.y * (camera.zoom ?? 1)) / (2 * Math.max(d, 1e-9) * Math.tan(rad(camera.fov ?? 50) / 2));
}

/**
 * The prop turns whenever the ship is drawn (Patrick, 11 Oct 2026: "make sure the prop is spinning"), clockwise from the
 * seat. Its real speed, about 2,000 RPM (33 turns a second; an estimate until a manual page backs it), can't be shown
 * at 60 pictures a second (the four blades would seem to stand still or run backwards), so it turns at most stepDeg a
 * picture, which reads as fast and forward, its blades half see-through over the faint disc.
 */
export const PROP_TURN = Object.freeze({ revPerSec: 2000 / 60, stepDeg: 30 });
function turnProp(root) {
  const d = root.userData.ct156;
  const now = globalThis.performance?.now?.() ?? Date.now();
  const dt = d.propAt === null ? 0 : Math.max(0, now - d.propAt) / 1000;
  d.propAt = now;
  d.propTurn = (d.propTurn + Math.min(dt * PROP_TURN.revPerSec * 2 * Math.PI, rad(PROP_TURN.stepDeg))) % (2 * Math.PI);
  if (d.prop) d.prop.rotation.x = rad(22) + d.propTurn;
  if (d.disc) d.disc.rotation.x = d.propTurn;
}

/** Shows or hides a ship's fine detail by its size on screen, with a gap between the two numbers so it doesn't flicker. */
function setDetail(THREE, root, camera, renderer) {
  const d = root.userData.ct156;
  if (!d?.detail) return;
  const px = onScreenPx(THREE, root, camera, renderer);
  if (px >= CT156_DETAIL_PX.show) d.detail.visible = true;
  else if (px < CT156_DETAIL_PX.hide) d.detail.visible = false;
}

/**
 * Each scene a ship is drawn in checks every ship's detail once per picture, before three.js lists what to draw,
 * so a change shows in the same picture. Installed the first time a ship is drawn there; it keeps any hook the scene had.
 */
function watchScene(THREE, scene) {
  if (!scene?.isScene || scene.userData.ct156Ships) return;
  const ships = new Set();
  scene.userData.ct156Ships = ships;
  const before = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer, s, camera, target) {
    before.call(this, renderer, s, camera, target);
    for (const ship of ships) {
      if (!ship.userData.ct156) ships.delete(ship);
      else {
        setDetail(THREE, ship, camera, renderer);
        turnProp(ship);
      }
    }
  };
}

// ---------- the per-ship model ----------

/**
 * Returns a THREE.Group: nose +X, left +Y, up +Z, nose-to-tail length lengthFt.
 * color: CSS colour of the ship (the whole tail in 'harvard', everything in 'ship').
 * number: the ship number, drawn on the fin and nose ('harvard' only).
 * paint: 'harvard' (default, and for any unknown value) or 'ship'.
 * @param {any} THREE
 * @param {{ color?: string, number?: string | number, paint?: string, lengthFt?: number }} [options]
 */
export function createCt156Model(THREE, { color, number, paint = 'harvard', lengthFt = CT156_UNIT_LENGTH } = {}) {
  const kit = getKit(THREE);
  kit.refs++;
  const { geo, decalGeo, mats } = kit;
  const mine = []; // per-ship materials and textures
  const own = (o) => (mine.push(o), o);
  const root = new THREE.Group();
  const g = new THREE.Group(); // scaled to lengthFt
  g.scale.setScalar(lengthFt / CT156_UNIT_LENGTH);
  root.add(g);
  const detail = new THREE.Group(); // the fine detail, shown only up close (near and far, above)
  g.add(detail);
  const add = (geometry, material, parent = g) => {
    const m = new THREE.Mesh(geometry, material);
    parent.add(m);
    // Real-time shadows where a view switches them on (aircraft-shadows.js): the solid parts cast them, glass, decals
    // and the prop's disc don't; everything takes them.
    m.castShadow = ![material].flat().some((mat) => mat?.transparent);
    m.receiveShadow = true;
    if (kit.exteriorGeos.has(geometry)) { // a Blender part (ALL-33): shaded by the file's picture once it is in
      m.userData.ct156Mine = mine;
      kit.exteriorMeshes.add(m);
      if (kit.ao) shadeMesh(kit, m);
    }
    return m;
  };

  let fuselage, canopy, helmetFront = null, helmetRear = null, seats = null, floor = null, prop = null, bowFront = null, disc = null, speedBrake = null;
  // The speed brake (SPEED_BRAKE), up close only: its plate on a hinge at its front edge, lying along the belly when shut
  // (setSpeedBrake turns it down), and the dark well behind it, shown while it is open.
  const addSpeedBrake = (paintMat) => {
    const { x0, length, openDeg } = SPEED_BRAKE;
    const hinge = new THREE.Group();
    hinge.position.set(x0, 0, bellyAt(x0) - 0.0006);
    const shut = Math.atan2(bellyAt(x0 - length) - bellyAt(x0), length); // the belly rises aft under it
    hinge.rotation.y = shut;
    add(geo.speedBrake, paintMat, hinge);
    detail.add(hinge);
    const well = add(geo.speedBrakeWell, mats.vent, detail);
    well.visible = false;
    return { hinge, well, shut, openDeg };
  };
  if (paint === 'ship') {
    const base = new THREE.Color(color);
    const m = (c, extra) => own(new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.1, envMap: mats.env, envMapIntensity: 0.4, side: THREE.DoubleSide, fog: false, ...extra }));
    const body = m(base);
    const light = m(base.clone().multiplyScalar(0.82));
    fuselage = add(geo.fuselage, body);
    add(geo.airframe, [light, light]);
    add(geo.fin, m(base.clone().lerp(new THREE.Color('#ffffff'), 0.15)));
    // Solid dark glass, one canopy (Patrick, 5 Oct: the two see-through bubbles overlapped as a "ghost double canopy").
    canopy = add(geo.canopy, m('#2c4a66', { roughness: 0.12, metalness: 0.45 }));
    add(geo.spinner, m('#20242a', { roughness: 0.4 }));
    add(geo.spinnerRing, mats.blade);
    // Up close only: the position lights, the exhaust stacks, the canopy's frames and the serial on the fin (TS-156).
    add(geo.lights, mats.lights, detail);
    add(geo.stubs, [mats.exhaust, mats.blade], detail);
    add(geo.frames, mats.frame, detail);
    seats = add(geo.seats, mats.frame, detail);
    bowFront = add(geo.bowFront, mats.frame, detail);
    speedBrake = addSpeedBrake(light);
    const serialTex = own(canvasTexture(THREE, 512, 512, serialCanvas(number)));
    const serialMat = own(new THREE.MeshBasicMaterial({ map: serialTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    for (const s of ['1', '-1']) add(decalGeo.tail[s], serialMat, detail);
    disc = add(geo.disc, mats.disc);
  } else {
    const tailNumber = ct156TailNumber(number);
    const wingTex = own(canvasTexture(THREE, 384, 128, (ctx, w, h) => outlinedText(ctx, tailNumber, w / 2, h / 2, h * 0.86, 5), 2));
    const noseTex = own(canvasTexture(THREE, 256, 128, (ctx, w, h) => outlinedText(ctx, tailNumber, w / 2, h / 2, h * 1.0, 3), 2));
    const decal = (tx) => own(new THREE.MeshStandardMaterial({
      map: tx, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.55, metalness: 0, emissive: '#ffffff', emissiveMap: tx, emissiveIntensity: 0.6, fog: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    const finMat = own(new THREE.MeshPhysicalMaterial({ color, fog: false, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.12, envMap: mats.env, envMapIntensity: 0.5 }));

    // Always drawn: the airframe, the canopy glass, the cheat line, the spinner and the prop disc.
    fuselage = add(geo.fuselage, mats.navy);
    add(geo.airframe, [mats.navy, mats.wingLe]);
    add(geo.fin, [finMat, mats.finLe]);
    add(geo.cheat, mats.cheat);
    add(geo.spinner, mats.chrome);
    add(geo.spinnerRing, mats.blade);
    disc = add(geo.disc, mats.disc);
    // Up close only: the decals, the cockpit, the frames, the exhausts and the blades.
    add(decalGeo.roundelWing, mats.roundel, detail);
    add(decalGeo.roundelUnder, mats.roundel, detail);
    add(decalGeo.wingNum, decal(wingTex), detail);
    const tailMats = Object.fromEntries(['1', '-1'].map((s) => [s, decal(own(canvasTexture(THREE, 512, 512, tailCanvas(number, Number(s)))))]));
    const noseMat = decal(noseTex);
    for (const s of ['1', '-1']) {
      add(decalGeo.tail[s], tailMats[s], detail);
      add(decalGeo.nose[s], noseMat, detail);
      add(decalGeo.roundelSide[s], mats.roundel, detail);
      add(decalGeo.canada[s], mats.canada, detail);
      add(decalGeo.triA[s], mats.tri, detail);
      add(decalGeo.triB[s], mats.tri, detail);
      add(decalGeo.triC[s], mats.tri, detail);
      add(decalGeo.marks[s], mats.marks, detail);
      add(decalGeo.stencil[s], mats.stencil, detail);
      add(decalGeo.dotAft[s], mats.dot, detail);
      add(decalGeo.dotRoot[s], mats.dot, detail);
    }
    add(geo.stubs, [mats.exhaust, mats.blade], detail);
    add(geo.vent, mats.vent, detail);
    add(geo.antenna, mats.antenna, detail);
    add(geo.beacon, mats.beacon, detail);
    speedBrake = addSpeedBrake(mats.navy);
    add(geo.lights, mats.lights, detail);
    floor = add(geo.floor, mats.floor, detail);
    add(geo.frames, mats.frame, detail);
    bowFront = add(geo.bowFront, mats.frame, detail);
    helmetFront = add(geo.helmetFront, mats.pilot, detail);
    helmetRear = add(geo.helmetRear, mats.pilot, detail);
    seats = add(geo.seats, mats.headbox, detail);
    prop = new THREE.Group();
    prop.rotation.x = rad(22);
    add(geo.blade, mats.propBlade, prop);
    add(geo.bladeTip, mats.propTip, prop);
    detail.add(prop);
    // The glass last, so the cockpit shows through it.
    canopy = add(geo.canopy, mats.glass);
  }
  // The first time the ship is drawn, its scene starts checking its detail (near and far, above).
  fuselage.onBeforeRender = (renderer, scene, camera) => {
    watchScene(THREE, scene);
    scene?.userData?.ct156Ships?.add(root);
    setDetail(THREE, root, camera, renderer);
    turnProp(root);
  };
  root.userData.ct156 = { kit, mine, paint, detail, g, fuselage, canopy, helmetFront, helmetRear, seats, floor, prop, disc, bowFront, speedBrake, inside: null, propTurn: 0, propAt: null };
  return root;
}

/**
 * Opens or shuts a ship's speed brake (SPEED_BRAKE; Patrick, 11 Oct 2026 card "Opens with boards": it opens when the
 * Formation sim has the boards out). out: true or false, or how far open, 0 to 1 (1 is 70°). It turns
 * at once, as the sim's boards do (moves.js: "the speed brakes are instant").
 * @param {any} root a ship from createCt156Model
 * @param {boolean | number} out
 */
export function setSpeedBrake(root, out) {
  const b = root?.userData?.ct156?.speedBrake;
  if (!b) return;
  const f = clamp01(typeof out === 'number' ? out : out ? 1 : 0);
  b.hinge.rotation.y = b.shut - rad(b.openDeg) * f;
  b.well.visible = f > 0;
}

/**
 * The ship seen from one of its own seats (the Formation Sim's Cockpit and Padlock views, with ct156-cockpit.js) or from
 * outside again. seat 'front' or 'rear': the pilot in that seat goes (the camera is in it) and the other seat's shows,
 * the still prop blades go (a turning prop is a blur from the seat; the faint disc stays), the canopy turns to clear
 * glass from inside, the fuselage opens over the cockpit onto its tub (TS-155) in place of the floor disc, and the frames
 * (the centre and rear canopy bows; the forward one goes, as ct156-cockpit.js draws it from the seat, TS-156), sill
 * rails show (both paints draw them up close from V2.208; 'ship' paint's pilots are added from the shared kit); the
 * outside headboxes go, as ct156-cockpit.js draws the seats. seat null: the ship as built. Only the ship the camera sits in is ever changed, so every
 * other ship looks as before. Wings, fin and tailplane are never touched. Nothing new needs freeing: every part added
 * is the shared kit's.
 * @param {any} root a ship from createCt156Model
 * @param {{ seat?: 'front' | 'rear' | null }} [view]
 */
export function setCockpitView(root, { seat = null } = {}) {
  const d = root?.userData?.ct156;
  if (!d) return;
  const { geo, mats, THREE } = d.kit;
  const inside = seat === 'front' || seat === 'rear';
  d.canopy.userData.outsideMaterial ??= d.canopy.material;
  d.canopy.material = inside ? mats.glassInside : d.canopy.userData.outsideMaterial;
  d.fuselage.geometry = inside ? geo.fuselageCut : geo.fuselage;
  if (d.floor) d.floor.visible = !inside;
  if (d.prop) d.prop.visible = !inside;
  if (d.bowFront) d.bowFront.visible = !inside; // from the seat, ct156-cockpit.js's band is the forward bow (TS-156)
  if (d.seats) d.seats.visible = !inside; // from the seat, ct156-cockpit.js draws both seats (TS-157)
  if (inside && !d.inside) {
    d.inside = new THREE.Group();
    d.inside.add(new THREE.Mesh(geo.tub, [mats.tubFloor, mats.tubWall]));
    if (d.paint === 'ship') {
      d.helmetFront = new THREE.Mesh(geo.helmetFront, mats.pilot);
      d.helmetRear = new THREE.Mesh(geo.helmetRear, mats.pilot);
      d.inside.add(d.helmetFront, d.helmetRear);
    }
    d.inside.traverse((o) => { o.castShadow = o.receiveShadow = Boolean(o.isMesh); });
    d.g.add(d.inside);
  }
  if (d.inside) d.inside.visible = inside;
  if (d.helmetFront) d.helmetFront.visible = seat !== 'front';
  if (d.helmetRear) d.helmetRear.visible = seat !== 'rear';
}

/** Frees this ship's own materials and textures; the shared kit goes with the last ship. */
export function disposeCt156Model(group) {
  const d = group.userData.ct156;
  if (!d) return;
  group.userData.ct156 = null;
  group.traverse((o) => d.kit.exteriorMeshes.delete(o));
  for (const o of d.mine) {
    o.map?.dispose();
    o.dispose();
  }
  if (--d.kit.refs === 0) {
    d.kit.dispose();
    kits.delete(d.kit.THREE);
  }
  group.removeFromParent();
}
