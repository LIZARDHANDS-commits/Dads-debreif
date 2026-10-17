// The T-6 as a CT-156 Harvard II (Moose Jaw, RCAF), drawn in code: a lofted fuselage, aerofoil wings and tail, satin
// paint and small CanvasTexture decals. Fine detail shows up close. From V2.329 the solid parts are swapped for the
// Blender file built from these same shapes once it loads (ALL-33, "the outside from Blender" below); the code's shapes
// stay the one source and show whenever the file doesn't. It imports only ui-kit's ct156-blender.js and ct156-pilot.js, and three.js is passed in
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
// paint 'harvard' (default): navy scheme, cheat line, chrome spinner, dark
//   prop, roundels, Canada wordmark, red triangles, tail leaf/NATO star/flag/serial, position lights (TS-156).
//   The vertical tail is navy like the rest (G14, Patrick 13 Oct 2026), with a light grey leading edge; the ship's number (122 for #1, ct156TailNumber)
//   is on the nose and under the right wing, the serial (156122) low on the fin, as Patrick's photo of 156102.
// paint 'ship': the plain look, everything in `color`; up close only the serial on the fin, the position lights, the
//   exhaust stacks and the canopy frames (TS-156).
// paints 'usaf' and 'usn': the T-6A/B Texan II's US markings (ALL-45, proposed; Dad, 17 Oct 2026), the same shape: white upper
//   surfaces, fin and canopy frames, a dark blue (USAF) or red-orange (USN) lower fuselage and lower wings, a black glare panel,
//   the US star-and-bar, the red danger triangles and the tail code or letter. The colour breaks are drawn by the shader
//   (paintZones, ct156-blender.js), so the shape and the Blender files are untouched. Every colour and every place is an
//   estimate from Dad's reference pictures (US_PAINTS, US_MARKS below); none of his pictures is copied.
//
// Shared geometry, textures and materials are built once per THREE module and
// reference-counted: disposeCt156Model frees a ship's own materials and textures, and the
// shared kit only when the last ship is gone, leaving nothing behind. (three.js keeps a lookup table and its
// reflection-map converter once it has drawn one; those are its own, so a leak check
// measures from a baseline taken after one ship has come and gone.) Every material has fog: false (fog is for
// the ground only, never the aircraft). The decals are drawn on 2D canvases, so this
// needs a document (a browser).

import { aoShaded, CT156_PICTURES, ct156Files, ct156Generation, ct156Level, ct156PanelSheen, onCt156Level, loadDelivered, loadPicture, paintBands, paintGrain, paintZones, shadeWhenLoaded, warnUnlessReported } from './ct156-blender.js';
import { addLookProbe } from './ct156-look.js';
import { CT156_PILOT_SLOTS, ct156PilotParts } from './ct156-pilot.js';

/** The paint setting every module offers: Paint: Harvard / Ship colours / USAF / USN, Harvard the default. */
export const PAINT_DEFAULT = 'harvard';
export const PAINT_OPTIONS = Object.freeze([
  Object.freeze({ value: 'harvard', label: 'Harvard' }),
  Object.freeze({ value: 'ship', label: 'Ship colours' }),
  Object.freeze({ value: 'usaf', label: 'USAF' }), // the T-6A Texan II's US Air Force markings (ALL-45, proposed)
  Object.freeze({ value: 'usn', label: 'USN' }), // the T-6B Texan II's US Navy markings (ALL-45, proposed)
]);

export const CT156_UNIT_LENGTH = 1.44; // x from -0.78 (tail) to 0.66 (spinner tip)
/** The real length those units stand for: the T-6A's 33 ft 4 in, nose to tail (the scale of Patrick's photo, below). */
export const CT156_LENGTH_FT = 33 + 4 / 12;
/**
 * The EADI's datum above the spinner axis, degrees (ALL-34; Patrick measured it at work, 13 Oct 2026: the canopy sill 2 degrees nose-down against the
 * ground, so the spinner axis about level on the ground, and the EADI about 2.7 degrees on level ground; "Yes, offset 2.5"). A module sets a ship's
 * root to the attitude the EADI reads; the model inside is drawn this far nose-down from it (the wheels sit flat at the 2.5 degrees on the gear),
 * so the spinner axis, and everything in the model's frame (nose +X), lies this far below the root's x axis. The cockpit group
 * (ct156-cockpit.js) and the light Harvard turn with it; EYES_FT is given in the root's frame.
 */
export const CT156_DATUM_DEG = 2.5;

const NAVY = '#151d31';
/** The prop's blades, root to tip: dark charcoal (G2, 13 Oct 2026; about #1c1f24 on A18). */
const PROP_DARK = '#1c1f24';
const rad = (d) => (d * Math.PI) / 180;

// ---------- the shape ----------
// Redrawn (Patrick, 6 Oct: "make the model better ... make it look more like the side profile of a Harvard", with his
// photos of the navy CT-156). The side profile is measured off Patrick's side-on photo of CT-156 156101, scaled so
// nose to tail is the T-6A's 33 ft 4 in (1.44 units; the photo's fin top then sits 10.6 ft above the wheels, against
// the published 10.7 ft). x is along the nose, z up from the spinner's axis.

// Fuselage stations, nose to tail: [x, half-width, top, bottom, squareness, upper squareness]. The top line runs almost flat from the
// spinner back to the fin. Squareness 2 is an ellipse, higher is boxier (flat sides at the cockpit). The nose's top
// line, spinner to windscreen foot, is the side view's (ALL-31): 0.85 ft above the spinner's axis 2 ft behind
// the tip, 1.1 ft at 5 ft, 1.45 ft at the windscreen's foot (was 0.65 to 1.0 ft off the photo), so from the front seat
// the spinner hides under the cowl. The belly line is the same view's (Patrick, 11 Oct 2026: "analyze the pictures
// ... and IMPROVE IT"): 2.9 ft under the axis at the wing, still 2.3 ft under it 2.2 ft ahead of the tail, closing to
// 1.7 ft at the tail cone (the photo's was about 1 ft deeper all along, the far wing and the low camera adding to it;
// it then rose from 6.3 ft ahead of the tail, up to 4 in too high). The half-widths are the top view's (scaled
// by its span): 3 ft 2.6 in across from the windscreen to the rear bow, tapering straight from
// the spinner's backplate to the cowl and from the rear bow to the tail (the front view, scaled by its 97 in prop, gives
// 3 ft 2.2 in; was 3 ft 8.4 in, an estimate). Across the canopy the squareness is set so the canopy's sill stays within
// a quarter inch of where it was (flat sides, as the front view draws them).
// The canopy's sill rises toward the tail, 0.6 ft above the spinner's axis at the forward bow's feet, 0.95 ft at the rear
// bow's (Patrick, 12 Oct 2026; it fell from 0.62 to 0.36 ft): across the cockpit the section's top is raised and its upper
// half squared (the last column, the upper half's squareness; the lower half keeps the one before it), so the side
// below the sill and the belly keep their shape. Ahead of the bow's feet the windscreen's lower edge stays about 0.55 ft
// above the axis until 1.1 ft behind its foot and then rises steeply to the foot (it rose all the way from the bow's feet, up to 5 in
// higher): under the windscreen the section's upper half is rounder and its top lower, the cowl ahead of the foot as it was.
// Chunk 3 of the CT-156 rebuild (3d-work ct156/sources.md, "The outside shell"; Patrick, 13 Oct 2026, "I agree"): FU6 lowers the cowl's top
// 0.05 ft at 2.64 ft behind the spinner's tip and 0.065 ft from 3.39 to 7.67 ft (nothing at 1.99 and 8.52 ft), FU4 lowers the aft top and
// bottom 0.09 ft at 20.25 ft, 0.10 at 22, 0.13 at 25 to 27, 0.15 at 30 and 0.11 at 32.5 ft (nothing at 19.3 ft), each at the stations' own
// places (ct156/build/shell_shape.py, stations()). Only the tops and bottoms of the stations at those places moved.
const STATIONS = [
  [0.578, 0.034, 0.0363, -0.04, 2.2, 2.2],
  [0.55, 0.0387, 0.03685, -0.07, 2.3, 2.3],
  [0.518, 0.0451, 0.03868, -0.083, 2.4, 2.4],
  [0.437, 0.06, 0.04519, -0.095, 2.5, 2.5],
  [0.329, 0.0677, 0.05349, -0.107, 2.6, 2.6],
  [0.292, 0.0688, 0.0601, -0.11, 2.78, 2.78],
  [0.268, 0.0695, 0.0566, -0.112, 2.89, 2.3],
  [0.2415, 0.0695, 0.0466, -0.1141, 3.05, 2.3],
  [0.2, 0.0695, 0.051, -0.1174, 3.29, 2.7],
  [0.167, 0.0695, 0.0453, -0.12, 3.49, 3.49],
  [-0.009, 0.0694, 0.0426, -0.128, 3.77, 6],
  [-0.1, 0.0694, 0.0463, -0.1219, 3.53, 6],
  [-0.158, 0.0694, 0.0447, -0.118, 3.38, 6],
  [-0.215, 0.0694, 0.03001, -0.11589, 2.97, 6],
  [-0.32, 0.052, 0.02138, -0.10762, 3, 3],
  [-0.482, 0.034, 0.00838, -0.10142, 2.69, 2.69],
  [-0.59, 0.023, -0.00617, -0.09817, 2.4, 2.4],
  [-0.685, 0.0125, -0.0197, -0.0832, 2.3, 2.3],
  [-0.725, 0.008, -0.02906, -0.07406, 2.2, 2.2],
  [-0.744, 0.004, -0.05275, -0.07275, 2, 2],
];
// The top line aft of the fairing, into the tail, is the side view's (Patrick, 11 Oct 2026: "the fuselage
// flows down into the tail"): 0.4 ft above the spinner's axis 6.9 ft ahead of the tail, level with it at 4.4 ft and
// 0.4 ft below it at 2.2 ft (was level, 0.5 ft above the axis, back to 4.4 ft ahead of the tail, off the photo).
// From the wing's trailing edge aft, the side view scaled by its length to the elevators' trailing edge (Patrick,
// 11 Oct 2026 card "Tail and wing"): the tail cone ends 32.5 ft behind the spinner's tip, 1.3 ft under its axis (was
// 33.3 ft); the belly 2.8 ft under the axis at 17 ft, 2.4 ft at 22.8 ft, 2.1 ft at 29.4 ft and 1.7 ft at 31.7 ft (was
// about 0.3 ft deeper); the top view's half-widths 1.2 ft at 22.2 ft, 0.8 ft at 26.4 ft, 0.5 ft at 28.9 ft and 0.3 ft at
// 31.1 ft (was about 0.23 ft wider each side; read about +-1 in).

// The canopy and the fairing behind it, windscreen foot to where the fairing runs into the fuselage's top: [x,
// half-width, top]. The glass ends at the rear bow (CT156_FRAME_X[2]), squared off there, and the fairing is painted
// (Patrick, 11 Oct 2026: "the very back of the window should be squared off"; the glass ran on past the rear bow to a
// point). The top, windscreen foot to just aft of the centre arch, is the side view's (ALL-31): the forward
// bow's crest 2.75 ft above the spinner's axis 11.3 ft behind the tip, the peak 3.45 ft over the centre arch (was
// 3.0 ft over the front seat, off the photo). From the rear bow aft the top is the same view's line falling from
// the canopy into the tail: 2.3 ft above the axis at the rear bow, 1.4 ft 2 ft behind it and 0.4 ft where it meets the
// fuselage, 5.8 ft behind it (was 2.4 ft, then a point 2.7 ft behind it, off the photo). Windscreen and forward bow
// stations re-measured on the side view 11 Oct 2026 (Fable thread, scaled by its 33 ft 4 in length): the
// windscreen's foot meets the cowl about 8.4 ft behind the spinner tip, the bow band's crest about 10.75 ft behind it
// (its front edge 10.6, aft edge 10.9) and its feet about 11.05 ft, so the band leans about 14.5° with its top
// forward; the model's rows from the foot to the bow moved 0.56 ft (0.024 units) forward to match (the bow crest was
// at 11.3 ft, the foot at 9.1 ft). The view's crest reads 2.55 to 2.75 ft above the axis depending on where the
// spinner axis is taken; the 2.75 ft stays. The half-widths from the windscreen
// foot to the centre arch are the top view's (measured 11 Oct 2026 against its 33 ft 5 in span):
// the canopy 33.6 in across outside from just behind the forward bow all the way back, 32.8 in at the bow, the
// windscreen narrowing over the 2.2 ft ahead of the bow to its point at the foot (was 30 in at the bow and narrowing
// from there forward, off the photo; the model's one surface is both the outside and the inside, so the glass sits
// about an inch outside the real inside). The rear bow's, 2.55 ft across, nearly the canopy's widest, so the glass
// ends square as in the same top view (was 2.3 ft); the fairing's narrowing behind it is an estimate.
// Aft of the front seat the top was reshaped (Patrick, 12 Oct 2026): 3.34 ft up over the centre arch, now 0.41 ft ahead of
// the origin (was 3.45 ft, 0.51 ft aft of it), and falling from there about 1 ft further forward than before, through
// 2.45 ft at the rear bow's crest and 1.3 ft where the dorsal fin leaves it, into the fuselage's top 10.3 ft aft of the
// origin (was 11.3 ft); the half-widths moved with it, the rear bow's 2.55 ft across kept at its crest.
// Chunk 2 of the CT-156 rebuild (3d-work ct156/sources.md, "The canopy"; fix rows B2, C3, C4, C7; Patrick, 12 and 13 Oct 2026): the crests
// lowered to 2.53 ft (forward bow), 3.24 ft (centre bow) and 2.38 ft (rear end) above the spinner's axis (was 2.75, 3.34, 2.45), the
// drops straight-line between the crests (nothing at the windscreen's foot, nothing where the dorsal fin leaves the fairing: an
// estimate), from the master's own table (ct156/build/canopy_shape.py, Canopy()); a row added at each crest, the forward bow's crest
// 0.145 ft further aft (4.392 ft ahead of the origin) so its feet stay where they were (C3).
// The rows aft of the rear bow (x below -0.174) are lowered with FU4 as well (the fairing follows the lowered back, 3d-work chunk 3).
const CANOPY = [
  [0.292, 0.01, 0.0601],
  [0.278, 0.034, 0.07011],
  [0.269, 0.0425, 0.07431],
  [0.26, 0.0495, 0.07851],
  [0.2415, 0.054, 0.08737],
  [0.232, 0.0554, 0.09192],
  [0.214, 0.0572, 0.10053],
  [0.196, 0.059, 0.10924],
  [0.18973, 0.05917, 0.1093],
  [0.14, 0.0605, 0.11641],
  [0.059, 0.0605, 0.13557],
  [0.018, 0.0605, 0.13997],
  [0.0177, 0.0605, 0.13997],
  [-0.03, 0.0605, 0.13861],
  [-0.075, 0.0605, 0.13333],
  [-0.12, 0.06, 0.12324],
  [-0.174, 0.055, 0.10279],
  [-0.195, 0.055, 0.09162],
  [-0.23, 0.05, 0.07418],
  [-0.276, 0.042, 0.05366],
  [-0.322, 0.033, 0.03686],
  [-0.368, 0.024, 0.0264],
  [-0.414, 0.015, 0.01904],
  [-0.446, 0.008, 0.01238],
];
// The cockpit, in model units (from the photo, as the canopy): the canopy frame hoops (the forward one is the windscreen
// bow), the two seats' stations (front, rear; each helmet sits there, its seat back just behind) and the helmets' heights
// (front, rear). ct156-cockpit.js builds the student's view from these, so each number has one copy. The forward bow and
// the helmets are the side view's (ALL-31): the bow 11.3 ft behind the spinner tip (was 11.6); the front
// helmet's centre 1.96 ft ahead of the origin and 1.99 ft up, the rear one's 3.4 ft aft and 2.29 ft up (was 1.4 ft
// ahead, 3.0 ft aft, both 2.27 ft up). The front seat then moved 0.95 ft (11 in) forward to the same view's front
// pilot re-read on a complete copy (Patrick, 11 Oct 2026 07:39Z, "whole cockpit 11 in (except the bow)"): his eye about
// 12.35 ft behind the spinner tip (the first reading's 13.2 ft was off a copy cut short at the tail), so the front
// helmet's centre is now 2.91 ft ahead of the origin; its height and the rear seat unchanged. The rear cockpit then moved
// forward (Patrick, 12 Oct 2026): the centre arch's crest 0.93 ft (to 0.41 ft ahead of the origin), the rear bow's 1.5 ft
// (to 4.03 ft aft of it) and the rear helmet 1.27 ft (to 2.13 ft aft of it, 5.04 ft behind the front one), its height kept.
// Then the helmets moved off their seats' stations (Patrick, 12 Oct 2026, "With the seat"): each helmet's centre 0.3 ft
// aft of its station (CT156_HELMET_X), the front one 0.16 ft lower (to 1.83 ft up) and the rear one 0.27 ft lower (to
// 2.02 ft up), so each sits back against its headbox with its eye at the front of the helmet (ct156-cockpit.js).
// The forward bow's crest 0.18973 (was 0.196): C3 keeps its feet where they were and the bow now leans 12 degrees (3d-work chunk 2).
export const CT156_FRAME_X = Object.freeze([0.18973, 0.0177, -0.174]);
export const CT156_SEAT_X = Object.freeze([0.1257, -0.092]);
export const CT156_HELMET_X = Object.freeze([0.1127, -0.105]);
export const CT156_HELMET_Z = Object.freeze([0.0791, 0.0872]);
/** The spinner's radius at its base less its 0.001-unit tip: 0.67 ft at the base, the side view's (ALL-31; was 0.79 ft). */
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
  const [, w, top, bottom, nLow, nUp] = sec;
  const [zc, h] = middleOf(top, bottom);
  const c = Math.cos(theta), s = Math.sin(theta), n = s > 0 ? nUp : nLow;
  return [w * Math.sign(c) * Math.abs(c) ** (2 / n), zc + h * Math.sign(s) * Math.abs(s) ** (2 / n)];
}
/** The fuselage's half-width at (x, z), for the decals that hug its side. */
function fuseSurf(x, z) {
  const [, w, top, bottom, nLow, nUp] = rowAt(STATIONS, x);
  const [zc, h] = middleOf(top, bottom);
  const n = z > zc ? nUp : nLow;
  const s = Math.min(0.999, Math.abs(z - zc) / h) ** (n / 2);
  return w * Math.sqrt(Math.max(1 - s * s, 1e-6)) ** (2 / n) + 0.0025;
}
/** The height where the fuselage is a given half-width, on its upper side: the canopy's sill. */
function sillZ(x, halfWidth) {
  const [, w, top, bottom, , n] = rowAt(STATIONS, x);
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
// straight but then go up"). The views: the top view's straight centre section, 49 in each
// side, and the front view's, about 4.2 ft; the side view's tip chord 0.73 ft under the axis gives the 8.4° (the
// front view: about 7.4° along the upper surface, 9.7° along the lower; was 8° from the root). The planform is the
// same figure's top view, scaled fore and aft by the side view's 33 ft 4 in, which runs from the spinner's tip to the
// elevators' trailing edge (Patrick, 11 Oct 2026 card "Tail and wing"): the centre section's chord 6.27 ft from 11.09 ft
// behind the spinner's tip, straight across it; the tip's 3.79 ft from 11.98 ft behind it (the side view's root leading
// edge reads 11.15 ft). Until then the figure was read with its 33 ft 4 in ending at the tail cone, which put the wing
// about 0.45 ft aft and 4 % too deep (a 6.5 ft root from 11.6 ft, a 3.9 ft tip). 15 % thick at the root and 12 % at the
// tip (estimates; the front view's root about 12 in and tip about 5.5 in thick agree); the tip 0.722 units out (Patrick,
// 5 Oct: the real span, 33 ft 5 in), so its station along the bent wing is TIP_S.
// Chunk 8 (3d-work #79, FU3 and FU11; Patrick, 13 Oct 2026, night: "Raise 1.5 in now"; imported with delivery ct156-2026-10-14-b2012a8): the whole wing 0.125 ft (1.5 in) higher, -0.112 + 0.0054 units, the root's thickness kept. An estimate
// until the tape (between photo A24's 0.09 to 0.19 ft and the side drawing's 0.22 to 0.27). Everything built from the wing follows: its surface, the surfaces' hinges, the wells, the main gear's pivots, doors and
// (since the ground stays) legs, the pitots, tie-downs and AOA vane on its skin, the wingtip lights.
const WING_Z = -0.112 + 0.0054;
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
// The tailplane across the tail cone 0.9 ft under the axis, 11 ft 4 in across (the top view). Its planform is
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
// and trailing edges are the side view's, scaled by its 33 ft 4 in to the elevators' trailing edge (Patrick,
// 11 Oct 2026 card "Tail and wing"): the leading edge swept 15°, meeting the dorsal fin 1.56 ft above the axis 27.1 ft
// behind the spinner's tip; the rudder's trailing edge leaning forward 9°, 31.4 ft behind the tip at the tail cone and
// 30.5 ft at the top (was about 1.5 ft further aft, the view read with its length ending at the tail cone).
const FIN = [{ le: -0.4775, s: -0.045, chord: 0.2229, t: 0.09, z: 0 }, { le: -0.5552, s: 0.232, chord: 0.0981, t: 0.09, z: 0 }];
// FU2 (3d-work chunk 3; Patrick, 13 Oct 2026, "I agree"): the fin's top slopes down aft, straight from 5.16 ft at its front corner (28.15 ft
// behind the spinner's tip) to 4.79 ft at the rudder's trailing corner (30.45 ft), the fin below 2.0 ft kept and the part between eased onto it.
const FIN_TOP = Object.freeze({ frontBtFt: 28.15, frontZFt: 5.16, rearBtFt: 30.45, rearZFt: 4.79, keepBelowFt: 2.0 });
const FIN_FT_PER_UNIT = CT156_LENGTH_FT / CT156_UNIT_LENGTH;
/** The fin's top, feet above the spinner's axis, at model x (FU2). */
const finTopFt = (x) => {
  const bt = (0.66 - x) * FIN_FT_PER_UNIT;
  return FIN_TOP.frontZFt + ((FIN_TOP.rearZFt - FIN_TOP.frontZFt) * (bt - FIN_TOP.frontBtFt)) / (FIN_TOP.rearBtFt - FIN_TOP.frontBtFt);
};
/** Moves a fin or rudder geometry's points under the sloping top (FU2): below keepBelowFt as it was, above it eased to the new top. */
function sinkFinTop(g) {
  const p = g.attributes.position, z0 = FIN_TOP.keepBelowFt / FIN_FT_PER_UNIT, oldTop = FIN[FIN.length - 1].s;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    if (z > z0) p.setZ(i, z0 + ((z - z0) * (finTopFt(p.getX(i)) / FIN_FT_PER_UNIT - z0)) / (oldTop - z0));
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}
// The flight surfaces (ALL-35, Patrick 12 Oct 2026), cut along the panel lines the Blender outside draws (measured
// 11 Oct 2026 off the reference top and side views): chord fractions from the leading edge, span stations in units
// (along the bent wing, out along the tailplane, up the fin). The ailerons behind 0.765 of the chord from 0.40 out to
// the tip cap's joint at 0.718, a trim tab on each one's inboard end out to 0.462 behind 0.93. Four split flaps, two
// under each wing, hinged to its lower surface behind 0.79, from the speed brake's edge (0.04) to the ailerons, split at
// the centre section's edge. The elevators behind 0.58 from the strake's end (0.06) out, their horn balances forward
// to 0.37 over the outer 0.18 of each half, a trim tab on the right one from 0.11 to 0.48 of the half-span behind 0.9.
// The rudder behind 0.55 from the spinner's axis up, its tab behind 0.88 up to 0.13. Travel, degrees of the trailing
// edge: ailerons 20 up and 11 down (Patrick, 12 Oct 2026); elevators 18 up and 16 down, rudder 24 each way, flaps 23
// for take-off and 50 for landing (estimates until Patrick or a page gives them).
const SURFACES = Object.freeze({
  aileron: Object.freeze({ hinge: 0.765, s0: 0.40, s1: 0.718, tab: 0.93, tabS: 0.462, upDeg: 20, downDeg: 11 }),
  flap: Object.freeze({ hinge: 0.79, s0: 0.04, s1: 0.40, toDeg: 23, ldgDeg: 50 }),
  elevator: Object.freeze({ hinge: 0.58, horn: 0.37, hornSpan: 0.18, s0: 0.06, tab: 0.9, tabS: Object.freeze([0.11, 0.48]), upDeg: 18, downDeg: 16 }),
  rudder: Object.freeze({ hinge: 0.55, z0: 0, tab: 0.88, tabTop: 0.13, deg: 24 }),
});
// The ventral fin under the tail, as aerofoil sections down from inside the belly, its outline the side view's
// (Patrick, 11 Oct 2026, circled it; scaled as the fin, card "Tail and wing"): its leading edge leaving the belly 25.5 ft
// behind the spinner's tip, its foot 3.3 ft under the axis and 2.8 ft long from 26.0 ft, rising 0.38 ft to the back
// (VENTRAL_RISE), its trailing edge meeting the belly 29.4 ft behind the tip (was about 1 ft further aft and 0.25 ft
// deeper). Thickness an estimate.
const VENTRAL = [{ le: -0.4347, s: -0.08, chord: 0.1853, t: 0.06, z: 0 }, { le: -0.4632, s: -0.1413, chord: 0.1227, t: 0.06, z: 0 }];
const VENTRAL_RISE = 0.134; // the foot's rise per unit aft
// The dorsal fin on the fairing, from where it leaves the fairing into the fin's leading edge, [x, half-width, top]: a
// thin fin, its top line the side view's (1.35 ft above the axis 22.8 ft behind the spinner's tip, 1.56 ft
// where it meets the fin at 27.1 ft; scaled as the fin, card "Tail and wing"), the fairing and fuselage falling away
// under it (Patrick, 11 Oct 2026: "instead of having a straight bulky spine"; it was a spine as wide as the canopy's
// end). The half-widths are estimates.
// Chunk 3 (FU5, FU4; Patrick, 13 Oct 2026, "I agree"): 2 in wide all along (half-width 1 in, was 0.8 to 1.2 in), the tops lowered with FU4.
const DORSAL = [
  [-0.283, 0.0036, 0.05172], // where it leaves the fairing, which ends further forward (Patrick, 12 Oct 2026)
  [-0.33, 0.0036, 0.05388],
  [-0.39, 0.0036, 0.05618],
  [-0.45, 0.0036, 0.05888],
  [-0.5, 0.0036, 0.06138],
  [-0.53, 0.0036, 0.06263],
];
// The forward bow leans aft from its crest 9° to the sill, as the side view shows it (was upright).
export const CT156_BOW_LEAN = rad(12); // C3 (Patrick, 12 Oct 2026; provisional until M22), each photo read against its own canopy rail with the rail's rise taken off (was 14.5°, the side view's band, 11 Oct 2026)
/**
 * Each frame hoop's lean from its crest to the sills (CT156_FRAME_X's order), radians: + the feet aft of the crest, -
 * ahead of it. The forward bow CT156_BOW_LEAN; the rear bow 26° with its top aft (Patrick, 12 Oct 2026; 22° from
 * 11 Oct 2026, "the wrong angles in the canopy bow", when it was upright). The centre bow 21° the same way, the
 * same view's, with the arch inside the cockpit (ct156-cockpit.js's ARCH_FT) leaning with it (was upright).
 */
// C7: the centre bow 17.5° (was 21°) and C4: the rear end 14° (was 26°), both top aft (3d-work chunk 2, provisional until M22).
export const CT156_FRAME_LEAN = Object.freeze([CT156_BOW_LEAN, rad(-17.5), rad(-14)]);
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
// The CT-156's exterior lights (reference, fix rows F6 and F23, approved by Patrick 13 Oct 2026): red left and green right at each
// tip's leading edge, a steady white nav light at each tip's trailing edge, an anti-collision strobe on each tip near the
// leading edge, a landing light aft and inboard of the left main strut and a taxi light the right (lit with all three
// legs down only); no tail light and no beacon light.
const NAV_LIGHT_X = WING_TIP.le - 0.012; // just behind the tip's leading edge (red and green)
const WHITE_NAV_X = WING_TIP.le - WING_TIP.chord + 0.01; // the steady white nav light at the tip's trailing edge
const STROBE_X = NAV_LIGHT_X - 0.55 * CT156_UNIT_LENGTH / CT156_LENGTH_FT; // the strobe, 0.55 ft aft of the nav light, still near the leading edge (an estimate: the reference gives no distance)
// Not drawn since F23 (the CT-156 has no tail light), but kept as a point: CT156_REFERENCE_POINTS.tailLight is a formation
// reference for ct156-cockpit.js sightAnglesOf and is in the delivered points file.
const TAIL_LIGHT = Object.freeze([-0.746, 0, -1.453 / 23.148]); // the tail cone's end, under the rudder; 1.453 ft under the axis since FU4 (was 0.058 units, 1.343 ft)
// The strobes flash in a double flash every 1.2 s: two 0.08 s flashes 0.16 s apart (an estimate of a typical anti-collision
// strobe; no manual number), each ship at its own phase.
export const CT156_STROBE = Object.freeze({ periodS: 1.2, flashS: 0.08, gapS: 0.16 });
// The landing and taxi lights, in feet from the main leg's pivot: aft and inboard of the strut, on the wing's underside; the
// lens about 0.36 ft long and 0.22 ft wide (estimates: the reference says only "aft and inboard of the main strut").
const GEAR_LIGHT = Object.freeze({ aftFt: 0.9, inboardFt: 0.8, halfLongFt: 0.18, halfWideFt: 0.11 });
// The lamps as the gear's Blender file draws them (3d-work F6, chunk 8b, delivery 423e5eb; its sources.md "The landing and
// taxi lamps"): each turns on a hinge across the span (+Y) at that place, hingeUpFt (3 in) up inside the wing from its
// lower skin: 0 gear down, upDeg gear up (the head swings aft and up into the wing, face down), with the main legs'
// travel (ct156GearPhase). Lit only with all three legs down (reference). Housing a silver rim, the lens dark glass and
// the LEDs a pale dull yellow when off, off photo 13 (estimates); lit, the lens and LEDs the warm white the old glow had.
// Estimates, all, as the master's rows: the hinge and the fold have no source. The old glow (GEAR_LIGHT's oval) shows only
// while no delivered lamp is in.
const GEAR_LAMP = Object.freeze({ hingeUpFt: 0.25, upDeg: 90, lit: '#fff6d8', housing: '#b8bcc0', lens: '#2e3236', led: '#a9a58e' });
// The exhaust stacks: placed off Patrick's photo of 156102 (11 Oct 2026, marked), their middle level with the spinner's
// axis; shaped and sized off the reference top and side views (Patrick, 11 Oct 2026 08:26Z "look at the
// diagrams"; 20:12Z "the exhaust is the right shape", with his photo of a T-6C from above). The top view: each stack's
// outer wall leaves the cowl about 2.85 ft behind the spinner's tip and turns aft round a quarter circle about 0.93 ft
// across, centred on the cowl's skin 3.68 ft behind the tip and 1.2 ft out, reaching 2.12 ft out (25.5 in) where it
// runs aft; its open end is cut on a slant, from that outer corner back to the inner wall's tip 4.5 ft behind the spinner,
// so it opens aft and outward (the side view and the photos look into it). The side view: about 7 in tall, the inner
// wall's tip about 4.6 in tall. Built as a flattened oval pipe 10.7 in across and 7 in tall from inside the cowl (y0),
// round the bend (xBend, R) and aft at yMid, cut by the slant from [xOut, yOut] to [xIn, yIn]; `taper` the aft end's
// height share. Units; sizes read off the views, about +-1 in.
const STUB = Object.freeze({ y0: 0.036, xBend: 0.66 - 3.68 / 23.148, yBend: 1.2 / 23.148, R: 0.485 / 23.148, yMid: (1.2 + 0.485) / 23.148, halfWide: 0.0192, halfTall: 0.0126, xOut: 0.66 - 3.68 / 23.148, yOut: 2.12 / 23.148, xIn: 0.66 - 4.5 / 23.148, yIn: 1.24 / 23.148, taper: 0.65, z: 0 });
// The fairing under the nose, behind the nose wheel: a shallow box along the belly from 5.85 ft to 10.5 ft behind the
// spinner's tip, hanging 0.34 ft under the belly at its front and 0.41 ft at its back (the side view,
// measured 11 Oct 2026; Patrick's photo of 156102 shows it the same length). Its width is an estimate (the views
// don't show it): 1 ft across. [x front, x back, depth front, depth back, half-width], units.
// F17 (3d-work chunk 3; Patrick, 13 Oct 2026): the strip runs unbroken from the nose doors back to the wing's leading edge: its end moves from 10.5 to
// 11.6 ft behind the tip (0.5 ft past the leading edge, 11.09 ft), its depth reaching 0.41 ft at the old 10.5 ft (xDepth) and held, and aft of the leading edge no
// deeper than the wing's underside there (0.02 ft into it), its end not eased.
const NOSE_FAIRING = Object.freeze({ x0: 0.66 - 5.85 / 23.148, x1: 0.66 - 11.6 / 23.148, xDepth: 0.66 - 10.5 / 23.148, depth0: 0.34 / 23.148, depth1: 0.41 / 23.148, half: 0.5 / 23.148 });
// The antennas (the upper TAS antenna on the engine cowling's top; the lower TAS, transponder,
// VHF/UHF, DME and marker beacon antennas under the fuselage). On the cowl's top 5.8 ft behind the spinner's tip (the
// side view): the TAS antenna's two blades side by side on one round base (Patrick, 11 Oct 2026 20:12Z: "there are
// two instead of one", his T-6C photo), each about 0.42 ft long and 0.3 ft tall, their middles 0.24 ft apart and the
// base about 0.6 ft across (spacing and base estimates off the photo).
const TAS = Object.freeze({ x: 0.66 - 5.77 / 23.148, length: 0.42 / 23.148, height: 0.3 / 23.148, gap: 0.24 / 23.148, base: 0.3 / 23.148 });
// Under the belly, the two light grey paddle antennas swept back that Patrick's photo of 156102 shows (the forward one
// is a small blade on the side view; the CT-156's is the photo's). The aft one the side view's shape, its root 21.99 to
// 22.57 ft behind the spinner's tip, its foot 22.32 to 22.88 ft and 0.89 ft down: SMM Fig 12.12 and 12.13 put the foot's
// middle 22.6 ft behind the tip (a camera fitted to each picture's fin, tail, wingtips and fuselage marks, about 5 px
// off, and the foot's ray met with the centreline; both pictures agree within 0.1 ft; the side view read 21.8 ft); its
// foot white (Patrick, 11 Oct 2026 20:20Z: "the antenna on the bottom back has white on the bottom";
// SMM Fig 12.12), the white the bottom 0.15 ft (estimate). The forward one the same shape, its root from 15.0 ft (the
// photo, about +-0.3 ft; its root is hidden by the wing). [root front, root back, foot front, foot back, depth, white],
// feet; about 0.05 ft thick (estimate).
// Patrick's readings pass (13 Oct 2026, photos 37 and 38, his ruler; 3d-work #60 F44, imported with delivery ct156-2026-10-13-17f0c75): the aft one's root
// 21.99 to 22.66 ft (20.4 cm along the flight line, was 22.57) and its foot 22.39 to 23.04 ft, 1.08 ft deep (33 cm, was 0.89); sweep, thickness and white kept.
const BELLY_PADDLES = Object.freeze([[21.99, 22.66, 22.39, 23.04, 1.08, 0.15], [15.0, 15.58, 15.33, 15.89, 0.89, 0]]);
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
// F06 (3d-work chunk 3; Patrick, 13 Oct 2026: "Move it out"): the pitot's mast 13.05 ft from the centreline (was 11.53), station 0.5669 (was 0.5) -
// an estimate off F06 with the roundel as the scale, about +-0.5 ft (ct156/build/refs_f06.py).
const PITOT = Object.freeze({ s: 0.5669, reach: 0.45 / 23.148, drop: 0.12 / 23.148, r: 0.04 / 23.148 });
// Beside each pitot under the wing (Patrick, 11 Oct 2026: "the tie downs and pitot covers under the wings"; the 156115
// photo): a white disc with a red middle at the probe's foot, about 0.2 ft across, and a yellow one about 0.12 ft across
// a little further aft. Sizes and places estimates off the photo.
// s: the marks stay at station 0.5, where they sat beside the pitot before F06 moved it 1.5 ft further out (Patrick's call: leave them).
const UNDERWING_MARKS = Object.freeze({ s: 0.5, x: 0.06, size: 0.7 / 23.148 }); // x: the patch's middle aft of the leading edge, chord fraction
// The roundel under the right wing and the ship's number on top of it, as on Patrick's photos of 156102 (the roundel
// under the right wing) and 156115 (the number on the right wing's top), at the upper roundel's place (was the number
// under the right wing); since G4 and G20 (13 Oct 2026) the number runs along the span, and the same number sits under
// the left wing at this place. [x middle, station], units.
const WING_MARK = Object.freeze([0.068, 0.42]);
// The wing numbers' patch (G4, G20): 0.19 units (4.4 ft) along the span by 0.11 (2.5 ft, the digits' height) along the chord.
const WING_NUMBER = Object.freeze({ span: 0.19, chord: 0.11 });
// The marks on the fuselage's side, placed off A24 (156115 side on, the paint laid over it; Patrick 13 Oct 2026, from A24,
// "Move all to the photo"). bt: feet behind the spinner's tip of the mark's middle; z: feet above the spinner's axis of the
// patch's middle; size: the patch, units. The triangles fill 7/8 of their patch and sit 1/32 of it below its middle.
const SIDE_FT = 23.148; // feet per model unit
const SIDE_MARKS = Object.freeze({
  triFwd: Object.freeze({ bt: 12.74, z: -0.048, size: 0.031 }), // the triangle's middle at z -0.07 (was bt 13.38)
  triMid: Object.freeze({ bt: 15.21, z: 0.171, size: 0.015 }), // at z +0.16 (was bt 16.04)
  triAft: Object.freeze({ bt: 17.68, z: 0.193, size: 0.0316 }), // at z +0.17, about 0.64 ft wide (was bt 18.77, 0.027 units)
  roundel: Object.freeze({ bt: 21.74, z: -0.47, size: 1.27 / 0.992 / 23.148 }), // 1.27 ft across (was bt 22.98, z -0.63, 1.15 ft)
  // "Canada" 1.63 ft long and about 0.45 tall, its letters' middle at bt 10.40, z -0.15: the letters sit 0.04 of the patch
  // aft of its middle and 0.0483 ft above it (was 1.79 by 0.41 ft at bt 10.89, z +0.04).
  canada: Object.freeze({ bt: 10.40 - 0.04 * 0.1046 * 23.148, z: -0.15 - 0.0483, w: 0.1046, h: 0.0355 }),
});
// The nose number (G10, then Patrick 13 Oct 2026, from A24): middle 5.52 ft behind the tip and 0.79 ft under the axis, the
// digits 0.57 ft tall and "115" 0.85 ft wide (noseDigits); the patch 1.39 by 0.69 ft (was 0.37 ft digits at 5.46, -0.76).
const NOSE_NUMBER = Object.freeze({ bt: 5.52, z: -0.79, wFt: 0.06 * 23.148, hFt: 0.03 * 23.148, tallFt: 0.57, ref: '115', refWideFt: 0.85 });
// The two small marks on top of each wing (G5, G01): their middle about 1 ft aft of the leading edge (aft, units), at
// station s, just outboard of the roundel (to 0.49) and the number (to 0.515); the station an estimate off G01.
const UPPER_MARKS = Object.freeze({ s: 0.55, aft: 1 / 23.148 });
// The tie-down rings (one under each wing; a formation reference, SMM Fig 12.12
// and Patrick, 11 Oct 2026 20:12Z): a dark ring hanging from a small block, 12.8 ft behind the spinner's tip and 8.3 ft
// out (SMM Fig 12.13's near wing, a camera fitted to the picture and the ring's ray met with the wing's underside; the
// same camera puts the roundel within 0.7 ft of WING_MARK, and the far wing's ring in Fig 12.12 and 12.13 fits within
// 5 px; about +-0.5 ft). Ring 0.3 ft across, its bar 0.04 ft (estimates). [x, station], units.
// F06 (3d-work chunk 3; Patrick, 13 Oct 2026: "Move to F06's spot"): 13.03 ft behind the tip (was 12.8) and 7.90 ft from the centreline (was 8.35), an
// estimate off F06, about +-0.3 ft; the station 0.3403 follows the old 0.36 for 8.352 ft (ct156/build/refs_f06.py).
// F43 (3d-work #60, readings pass; Patrick's AR line, photo 28, 13 Oct 2026): the wing lugs at 8.85 ft out (was 7.90 ft) and 13.09 ft behind the tip (was 13.03), so
// the station is 0.3811 (was 0.3403; the ring centre measured at 8.850 ft out on the bent wing). The master's lug is a flat plate with a round hole
// (photos 20, 21); the code's ring and block stay as the fallback.
const TIE_DOWN = Object.freeze({ x: 0.66 - 13.09 / 23.148, s: 0.3811, r: 0.15 / 23.148, bar: 0.02 / 23.148, block: 0.1 / 23.148 });
// The speed brake: one plate under the fuselage between the flaps, hinged at its front, opening to 70°,
// perforated with round holes, three across and four along. Its size and place are
// estimates (no page gives them): hinged 16.0 ft behind the spinner's tip, where the flaps start, 2.3 ft long and 1.8
// ft across (about 4.1 sq ft; the Formation sim's drag guesses about 5, slow-down.js BOARDS). Units.
const SPEED_BRAKE = Object.freeze({ x0: 0.66 - 16.0 / 23.148, length: 2.3 / 23.148, half: 0.9 / 23.148, thick: 0.03 / 23.148, hole: 0.19 / 23.148, openDeg: 70 });
// The landing gear (ALL-34, Patrick 12 Oct 2026): a tricycle, each main wheel on the outboard side of its leg, the legs
// folding inboard into the wing's centre section, the nose leg folding aft into the bay over the fairing under the nose.
// Feet, measured 12 Oct 2026 off the reference side and front views (side scaled by its 33 ft 4 in, front by the model's
// span; about +-2 in) and Patrick's photos: main wheels 13.87 ft behind the spinner's tip and 4.08 ft out (the views
// give 3.9 to 4.1), tyres 1.64 ft across and 0.45 ft wide; nose wheel 6.0 ft behind the tip, tyre 1.34 ft across and
// 0.5 ft wide; the main wheels' ground 5.35 ft under the spinner's axis. On level ground the gear holds the nose GEAR_SIT_DEG up (Patrick's ruling,
// with the core's on-gear pitch), so the nose leg is about 4 in longer than the side view, which draws the axis level on
// the wheels. Pivots, door edges and leg sizes are estimates that fit the folded gear inside the skin under the doors
// the Blender outside already outlines (build_ct156_exterior.py GEAR_DOORS_FT, the nose fairing split down its middle).
// Each main gear: its leg door (on the leg, splayed out GEAR.legDoorSplayDeg when down, as the front view and the view
// from below show) and an inboard door hinged on its inboard edge, hanging down while open (Patrick's photo of 104).
// Patrick on the first renders (12 Oct 2026 02:48Z, his photos of 104 and 126): the inboard doors are not square, so
// each is a D, its aft outboard corner rounded (aftCornerFt) round the folded wheel; the main legs are beefier; the
// nose leg has more to it, so it carries a steering collar, a torque link ahead of it, a drag brace up and aft into
// the bay and a mudguard over the tyre's aft top. Their sizes are read off those photos and the side view (estimates).
// A2 (3d-work chunk 3; Patrick, 13 Oct 2026: "Measure, then decide", "spinner axis level"): the gear now holds the spinner's axis level on level ground
// (was 2.5 deg nose up), all three tyres' bottoms 5.42 ft under the axis (the official side view's ground line; was 5.35 for the mains), the tyres
// the measured sizes (an estimate until M4): main 1.65 ft across (was 1.64), nose 1.29 ft (was 1.34).
const GEAR_SIT_DEG = 0;
const GEAR = Object.freeze({
  groundFt: -5.42, // the main wheels' ground, feet under the spinner's axis (A2; was -5.35)
  main: Object.freeze({ xFt: 13.87, pivotYFt: 3.85, wheelOutFt: 0.23, doorOutFt: 0.55, tyreRFt: 0.8333, tyreWFt: 0.3667, legRFt: 0.2, pistonRFt: 0.13 }), // M4 (3d-work #60, Patrick 13 Oct 2026, photos 30 and 31): 20 x 4.4 in tyres, r 10 in and 4.4 in wide (were 0.825 and 0.45)
  // A2 (3d-work #79, Patrick, 13 Oct 2026, night: "Extend to the axle", photo 17; estimates): the leg doors reach down to the axle's height, 2.62 ft long from the hinge (y0Ft 2.3 to 1.63; was
  // 1.95 ft); the upper part keeps its 1.1 ft width, and from the bottom up to 62 % of the length (lowerFrac) the door reaches 0.35 ft further aft (lowerAftFt: 1.45 ft fore and aft), a short slanted
  // shoulder to 66 % (shoulderFrac). The leg well keeps the old span (wellY0Ft).
  legDoor: Object.freeze({ x0Ft: 13.45, x1Ft: 14.55, y0Ft: 1.63, y1Ft: 4.25, wellY0Ft: 2.3, lowerFrac: 0.62, shoulderFrac: 0.66, lowerAftFt: 0.35 }),
  inboardDoor: Object.freeze({ x0Ft: 12.9, x1Ft: 15.1, y0Ft: 0.45, y1Ft: 2.35, aftCornerFt: 1.0, foreCornerFt: 0.2 }),
  legDoorSplayDeg: 12,
  nose: Object.freeze({ xFt: 6.0, pivotXFt: 6.2, pivotZFt: -2.05, tyreRFt: 0.6667, tyreWFt: 0.3667, // M4: 16 x 4.4 in, r 8 in and 4.4 in wide (were 0.645 and 0.5)
    legRFt: 0.12, pistonRFt: 0.085, collarRFt: 0.2, forkYFt: 0.31, linkFt: 0.45, guardFt: 0.08 }),
  noseDoor: Object.freeze({ x0Ft: 6.1, x1Ft: 10.0, halfFt: 0.36, openDeg: 85 }),
  doorThickFt: 0.03,
});

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
  finTop: Object.freeze([FIN[1].le - FIN[1].chord / 2, 0, finTopFt(FIN[1].le - FIN[1].chord / 2) / FIN_FT_PER_UNIT]), // 4.981 ft after FU2 (was 5.37)
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

// The roundel, as fractions of its width on G01 (G3, Patrick 13 Oct 2026): a thin white outer ring from 0.96 to 1.0,
// blue inside it, the white disc 0.60 and the leaf 0.52 tall (were a blue edge, a 0.72 disc and a 0.56 leaf).
function roundelCanvas(ctx, w) {
  const c = w / 2;
  ctx.fillStyle = '#f4f6f8';
  ctx.beginPath(); ctx.arc(c, c, c - 1, 0, 7); ctx.fill();
  ctx.fillStyle = '#1d3f8f';
  ctx.beginPath(); ctx.arc(c, c, c * 0.96, 0, 7); ctx.fill();
  ctx.fillStyle = '#f4f6f8';
  ctx.beginPath(); ctx.arc(c, c, c * 0.6, 0, 7); ctx.fill();
  leaf(ctx, c, c, c * 0.52, '#d2202c');
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
 * Plain white digits with no outline, centred in a w by h canvas: as tall as `tall` of its height, narrowed (never
 * widened) to fit `wide` of its width, as the CT-156's own stencilled numbers (G4, G10, G20). `fill`: the letters' colour (white).
 */
function plainDigits(ctx, text, w, h, tall = 0.9, wide = 0.96, fill = '#ffffff') {
  ctx.font = '700 100px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(text);
  const gw = m.actualBoundingBoxLeft + m.actualBoundingBoxRight, gh = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  if (!(gw > 0 && gh > 0)) return;
  const k = (tall * h) / gh, sx = Math.min(1, (wide * w) / (gw * k));
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(k * sx, k);
  ctx.fillStyle = fill;
  ctx.fillText(text, -(m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2, (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
  ctx.restore();
}

/**
 * The nose number as on A24 (Patrick 13 Oct 2026, from A24: "0.57 ft, plain"): plain white digits NOSE_NUMBER.tallFt
 * tall, each 1 a plain bar with no flag, narrowed so that "115" is refWideFt wide (every number takes the same narrowing),
 * centred in its w by h canvas, which spans NOSE_NUMBER's wFt by hFt.
 */
function noseDigits(ctx, text, w, h) {
  const { wFt, hFt, tallFt, ref, refWideFt } = NOSE_NUMBER;
  ctx.font = '700 100px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const all = ctx.measureText('0234567890');
  const asc = all.actualBoundingBoxAscent, desc = all.actualBoundingBoxDescent, tall = asc + desc;
  const bar = 14, gap = 8; // the 1's bar and the space between digits, in the font's units (100 to the em)
  const glyph = (c) => {
    if (c === '1') return { w: bar, left: 0 };
    const m = ctx.measureText(c);
    return { w: m.actualBoundingBoxLeft + m.actualBoundingBoxRight, left: m.actualBoundingBoxLeft };
  };
  const widthOf = (t) => [...t].reduce((s, c, i) => s + glyph(c).w + (i ? gap : 0), 0);
  if (!(tall > 0)) return;
  const ky = ((tallFt / hFt) * h) / tall, kx = ((refWideFt / wFt) * w) / widthOf(ref);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(kx, ky);
  ctx.fillStyle = '#ffffff';
  let x = -widthOf(text) / 2;
  for (const c of text) {
    const g = glyph(c);
    if (c === '1') ctx.fillRect(x, -tall / 2, bar, tall);
    else ctx.fillText(c, x + g.left, asc - tall / 2);
    x += g.w + gap;
  }
  ctx.restore();
}

/**
 * The ship's number on the nose and the wings: 122 for #1, 123 for #2 and so on (Patrick, 11 Oct 2026, of his photo
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
  return (ctx, w) => outlinedText(ctx, ct156Serial(number), w / 2, finPx(w, -1, 0, FIN_SERIAL_Z)[1], 0.0255 * (w / FIN_DECAL.size), 5);
}

// The fin's decal (decalGeo.tail) is a square 0.14 units a side, centred 0.676 units aft of the origin and 0.075 up. Each
// side has its own canvas, so every mark sits at the same place on both sides and the text still reads (side +1 left,
// -1 right). Places and sizes off Patrick's photo of 156102 (11 Oct 2026; measured from the fin's top front corner).
const FIN_DECAL = Object.freeze({ x: -0.607, z: 0.075, size: 0.14 });
// The serial's and the flag's middles, units above the spinner's axis: raised about 0.3 ft (0.013 units) off A24 (G12,
// Patrick 13 Oct 2026; were 0.0205 and 0.018).
const FIN_SERIAL_Z = 0.0335, FIN_FLAG_Z = 0.031;
// The serial and the flag along the fin, off A24 (Patrick 13 Oct 2026, from A24): the serial's digits 1.40 ft long and
// 0.44 ft tall, narrow, their aft end 29.62 ft behind the spinner's tip and their middle where the old text's digits sat
// (0.0021 units over FIN_SERIAL_Z, the old text's em middle); the flag (0.035 units wide) about 0.11 ft aft of them.
const FIN_SERIAL = Object.freeze({ aftX: 0.66 - 29.62 / 23.148, lengthFt: 1.4, tallFt: 0.44, z: FIN_SERIAL_Z + 0.0021 });
const FIN_FLAG_X = 0.66 - (29.62 + 0.11 + (0.035 * 23.148) / 2) / 23.148;
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
    // The NATO star about 0.95 ft across (G11, A18; r was 0.027 units, about 1.25 ft).
    natoStar(ctx, ...at(-0.6102, 0.1037), 0.0205 * k);
    // The Canadian flag aft of the serial, low on the fin (TS-156), about 0.8 by 0.4 ft (G11, A18; fw was 0.046 units, 1.06 ft).
    const [fx, fy] = at(FIN_FLAG_X, FIN_FLAG_Z);
    const fw = 0.035 * k, fh = fw / 2;
    ctx.fillStyle = '#e4212d'; ctx.fillRect(fx - fw / 2, fy - fh / 2, fw, fh);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(fx - fw / 4, fy - fh / 2, fw / 2, fh);
    leaf(ctx, fx, fy, fh * 0.36, '#e4212d');
    // The serial (FIN_SERIAL): its digits' aft end at the anchor, so they run forward from it on either side.
    const [tx, ty] = at(FIN_SERIAL.aftX, FIN_SERIAL.z);
    const serial = ct156Serial(number);
    ctx.font = '600 100px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText(serial);
    const gw = m.actualBoundingBoxLeft + m.actualBoundingBoxRight, gh = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    if (gw > 0 && gh > 0) {
      ctx.save();
      ctx.translate(tx, ty);
      ctx.scale((FIN_SERIAL.lengthFt / 23.148) * k / gw, (FIN_SERIAL.tallFt / 23.148) * k / gh);
      ctx.fillStyle = '#eef1f5';
      ctx.fillText(serial, side < 0 ? m.actualBoundingBoxLeft : -m.actualBoundingBoxRight, (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
      ctx.restore();
    }
  };
}

// ---------- the US paints' markings (ALL-45, proposed) ----------
// Colours and places are estimates from Dad's reference pictures (17 Oct 2026), described and redrawn; none of them is copied.

/** The US national insignia (a public government marking), drawn twice as wide as tall on a clear ground: a white star in a blue disc,
 *  a white bar each side with a red stripe through it, all outlined in blue (disc diameter D, bars D/2 long and D/2 deep, the outline D/8). */
function usInsigniaCanvas(ctx, w, h) {
  const D = Math.min(w / 2.25, h * 0.92), edge = D / 8, cx = w / 2, cy = h / 2, bar = D / 4;
  const blue = '#1c2e72';
  ctx.fillStyle = blue;
  ctx.fillRect(cx - D - edge, cy - bar - edge, 2 * (D + edge), 2 * (bar + edge));
  ctx.fillStyle = '#f4f6f8';
  ctx.fillRect(cx - D, cy - bar, 2 * D, 2 * bar);
  ctx.fillStyle = '#c4202e';
  ctx.fillRect(cx - D, cy - D / 12, 2 * D, D / 6);
  ctx.fillStyle = blue;
  ctx.beginPath(); ctx.arc(cx, cy, D / 2, 0, 7); ctx.fill();
  ctx.fillStyle = '#f4f6f8';
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const r = (k % 2 ? 0.382 : 1) * D * 0.4, a = -Math.PI / 2 + (k * Math.PI) / 5;
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath(); ctx.fill();
}

/** The US paints' fin marks, on the fin's decal (FIN_DECAL) like tailCanvas: the big tail code or letter, and for the USAF its squadron line, and the small serial low on the fin. */
function usTailCanvas(paint, number, side) {
  return (ctx, w) => {
    const k = w / FIN_DECAL.size; // pixels per unit
    const dark = '#16181d';
    // Text of `str`, its box wU by hU units centred at (x, z) on the fin, the letters `tall` of the box's height.
    const text = (str, x, z, wU, hU, tall) => {
      const [px, py] = finPx(w, side, x, z);
      ctx.save();
      ctx.translate(px - (wU * k) / 2, py - (hU * k) / 2);
      plainDigits(ctx, str, wU * k, hU * k, tall, 0.98, dark);
      ctx.restore();
    };
    const num = Number(ct156TailNumber(number).replace(/\D/g, '')) || 122;
    if (paint === 'usaf') {
      text('RA', FIN_DECAL.x, 0.106, 0.1, 0.046, 1); // the tail code (an estimate: "RA")
      text('99 FTS', -0.6, 0.068, 0.082, 0.016, 0.95); // the squadron line (an estimate)
      text(`03-${3500 + (num % 100)}`, -0.605, FIN_SERIAL.z, 0.08, 0.0185, 0.95); // an invented serial, low on the fin
    } else {
      text('E', FIN_DECAL.x, 0.098, 0.07, 0.085, 1); // the one big tail letter (an estimate: "E")
      text(`165${900 + (num % 100)}`, -0.605, FIN_SERIAL.z, 0.08, 0.0185, 0.95); // an invented BuNo, low on the fin
    }
  };
}

/** The US paints (ALL-45, proposed), every colour an estimate from photos. `lower`: the lower fuselage and lower wings;
 *  `pinstripe`: the red line at the fuselage's colour break (USAF only); `name`: the lettering on the side, its colour and place. */
const US_PAINTS = Object.freeze({
  // darkWing: the upper wing (and the tail's surfaces) dark like the lower, as Dad's formation photo of two USAF T-6As shows (17 Oct 2026); the USN's upper wing is not in the photos, so it stays white.
  // tip: the formation-reference triangle's colour on the upper wing tip (light on the dark USAF wing; the USN's red-orange on its white wing; estimates).
  usaf: Object.freeze({ lower: '#2b2f5c', pinstripe: '#b3202a', name: 'U.S. AIR FORCE', nameColour: '#f4f6f8', darkWing: true, tip: '#f4f6f8' }),
  usn: Object.freeze({ lower: '#e8432e', pinstripe: null, name: 'NAVY', nameColour: '#16181d', darkWing: false, tip: '#e8432e' }),
});
const US_WHITE = '#eceff2';
const US_BLACK = '#0d0e11';
// The fuselage's colour break, a level line 1.1 ft under the spinner's axis falling 0.46 ft toward the tail cone (units; an
// estimate), and the glare panel's edges: from the windscreen's foot to 0.5 units, narrowing forward (units; an estimate).
const US_BREAK = '( -0.048 - 0.02 * clamp( ( -0.2 - zp.x ) / 0.5, 0.0, 1.0 ) )';
const US_GLARE = 'ct156Aa( 0.5 - zp.x ) * ct156Aa( zp.x - 0.285 ) * ct156Aa( ( 0.034 - 0.02 * clamp( ( zp.x - 0.3 ) / 0.2, 0.0, 1.0 ) ) - abs( zp.y ) ) * ct156Aa( zp.z - 0.025 )';
// The marks' places, as SIDE_MARKS: bt feet behind the spinner's tip of the mark's middle, z feet above the spinner's axis, its patch in feet (estimates).
const US_MARKS = Object.freeze({
  insignia: Object.freeze({ bt: 22.3, z: -0.46, wFt: 2.8, hFt: 1.4 }), // the star-and-bar on the rear fuselage, both sides
  name: Object.freeze({ usaf: Object.freeze({ bt: 12.4, z: -1.55, wFt: 5, hFt: 0.75 }), usn: Object.freeze({ bt: 18.7, z: -0.55, wFt: 2.4, hFt: 0.6 }) }), // "U.S. AIR FORCE" under the front cockpit; "NAVY" behind the wing root
  nose: Object.freeze({ bt: 6.0, z: -0.45, wFt: 1.7, hFt: 0.75 }), // the USN side number on the nose, aft of the exhaust stack
});
// The star-and-bar on the wings: the upper left and the lower right, at the Harvard roundel's places (WING_MARK), 3.2 ft by 1.6 ft, the star toward the leading edge.
const US_WING_MARK = Object.freeze({ span: 0.14, chord: 0.07 });
// The formation-reference triangle on each upper wing tip, in the outer front corner against the leading edge (Dad, 17 Oct 2026: "the
// top tip near the outside front edge", from his formation photo): a right triangle 1.4 ft each way with its right angle in that
// corner, its edges 0.35 ft in from the tip and 0.1 ft aft of the leading edge. Size, shape and place are estimates off the photo.
const US_TIP_TRI = Object.freeze({ size: 1.4 / SIDE_FT, inTip: 0.35 / SIDE_FT, aftLe: 0.1 / SIDE_FT });
// "USAF" on the upper left wing, outboard of the star-and-bar, reading from the tip toward the root with the letters' tops to the leading
// edge, as on the photo (an estimate: its wing and place read off a photo taken at an angle): 3.7 ft along the span by 1.6 ft, centred 0.6 units out.
const US_WING_TEXT = Object.freeze({ s: 0.6, span: 0.16, chord: 0.07, aftLe: 0.085 });

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

// The outside from Blender (ALL-33, ALL-38): public/models/ct156/high/ct156-exterior.glb, delivered from the 3d-work
// master by its delivery command and taken in by `npm run models:import` (plan Step 3b item 3.4), smooth-shaded, with
// the soft shadows and panel lines baked into one picture (ct156-exterior-ao.jpg) on its own UV map. Once it is in,
// each of these kit shapes takes the file's in place, so every ship (and every ship made later) draws it; the decals,
// cheat line, glass, lights and prop's blur disc stay the code's. Only all of it or none: if the file is missing, not
// from the imported delivery, or lacks a part, every ship stays as the code draws it.
// The code's shapes here are that fallback (ALL-38 (5)); since 3.4 the file's shape may differ from them on purpose.
const EXTERIOR_PARTS = Object.freeze(['fuselage', 'fuselageCut', 'airframe', 'fin', 'frames', 'bowFront', 'seats', 'spinner', 'spinnerRing', 'vent', 'antenna', 'beacon', 'aileron', 'elevator', 'rudder', 'flapIn', 'flapOut']);
const EXTERIOR_FILE = 'ct156-exterior.glb';
// The prop's blade 1 and its tip from the same file (3d-work chunk 8b; delivery 423e5eb on), taken only both together and
// only when the file has them, so an older delivery leaves the code's blades. Not in EXTERIOR_PARTS: the export scripts in
// tools/blender/ never had them.
const PROP_PARTS = Object.freeze(['blade', 'bladeTip']);
// Layout 2 (3d-work increment 2, 15 Oct 2026; its build/app_layout.json "layout_2"): the parts the code drew itself come
// from the master too, each taking the code's shape of the same name in place, so nothing draws twice: the exhaust stacks
// (code since 12 Oct 2026, when Blender's shading put grey spikes round their lips), the outside coamings and floor disc,
// the speed brake and its well, the flap wells and the tub; the gear's wells (GEAR_WELLS) and the pilots (PILOT_PARTS,
// a file of their own). The fin's static wicks (FIN_WICKS) now come in the rudder, the ailerons' and elevator's in theirs,
// all dark in slot 1 (as the antennas' slot 2), and the speed brake's slots' floors in its slot 1 (kit.slotExtras).
const LAYOUT2_EXTERIOR = Object.freeze(['stubs', 'coamings', 'floor', 'speedBrake', 'speedBrakeWell', 'flapInWell', 'flapOutWell', 'tub']);
const PILOTS_FILE = 'ct156-pilots.glb';
const PILOT_PARTS = Object.freeze(['helmetFront', 'helmetRear']);
// Parts the delivery doesn't bake (app_layout.json's no_picture: cavities and parts hidden in the hull, whose soft
// shadows would be black, and the pilots, coloured by slot): their picture layout is flat, so they are drawn without the
// file's shadow picture, in the code's own colours.
const NO_PICTURE = new Set(['floor', 'speedBrakeWell', 'flapInWell', 'flapOutWell', 'tub', 'gearInboardWell', 'gearLegWell', 'gearNoseWell', ...PILOT_PARTS]);
// The outside's pictures (soft shadows and panel lines, relief, mask, painted weathering): ct156-blender.js CT156_PICTURES.

/** The shapes the Blender outside is built from, by name (tools/blender/ct156-exterior-pieces.mjs). */
export function ct156ExteriorPieces(THREE) {
  const { geo, hashes } = getKit(THREE);
  return Object.fromEntries(EXTERIOR_PARTS.map((name) => [name, { geometry: geo[name], hash: hashes[name] }]));
}

/** The shapes the gear's Blender file is built from (tools/blender/ct156-gear-pieces.mjs): each with its pose gear down. */
export function ct156GearPieces(THREE) {
  const { geo, gearHashes } = getKit(THREE);
  const poses = gearPoses(THREE);
  return Object.fromEntries(GEAR_PARTS.map((name) => [name, { geometry: geo[name], hash: gearHashes[name], pose: poses[name].elements.slice() }]));
}

/**
 * A ship's mesh drawn with its materials darkened by a baked picture (aoShaded; the outside's, or with `gear` the gear's),
 * each copy made once.
 */
function shadeMesh(kit, mesh, gear = false) {
  // A part drawn as its mirror (the right aileron and flaps under a group scaled -1 in y) needs its relief's green the
  // other way round: its tangent frame turns with the mirror, three.js's bitangent doesn't.
  let mirrored = false;
  for (let o = mesh; o; o = o.parent) if (o.scale.x * o.scale.y * o.scale.z < 0) mirrored = !mirrored;
  const cache = gear ? kit.gearShaded : mirrored ? kit.shadedMirrored : kit.shaded;
  const swap = (mat) => {
    // The lenses (their own glass and glow) take none of the outside's pictures: a picture baked onto the half-sunk lens
    // gives it a ragged dark waist (3d-work fix 4.1d).
    if (!mat?.isMeshStandardMaterial || mat.userData.ct156NoPictures) return mat;
    let copy = cache.get(mat);
    if (!copy) {
      copy = gear ? aoShaded(mat, kit.gearAo) : aoShaded(mat, kit.ao, { ...kit.skin, mirrored });
      cache.set(mat, copy);
      const mine = mesh.userData.ct156Mine;
      const owner = mine?.includes(mat) ? mine : kit.own;
      owner.push(copy);
      kit.shadedCopies.push([copy, owner]); // so a level switch can free it (unshadeKit)
    }
    return copy;
  };
  const ghost = mesh.userData.ct156Ghost ?? ((m) => m); // the Debrief's see-through copy of a ship (it keeps the pictures)
  const plain = mesh.userData.ct156Ghost ? mesh.userData.ct156Plain : mesh.material;
  mesh.userData.ct156Unshaded = plain; // the base a level switch goes back to: never re-shade an already shaded copy
  mesh.material = Array.isArray(plain) ? plain.map((m) => ghost(swap(m))) : ghost(swap(plain));
}

/** Gives a ship's mesh its plain material(s): a ghosted mesh (Debrief) keeps them as its plain ones and shows its see-through copies. */
function setPlain(mesh, material) {
  const ghost = mesh.userData.ct156Ghost;
  if (!ghost) {
    mesh.material = material;
    return;
  }
  mesh.userData.ct156Plain = material;
  mesh.material = Array.isArray(material) ? material.map(ghost) : ghost(material);
}

/** A shape with nothing in it yet, for a part only a Blender file has (takeShape fills it in). */
function emptyGeometry(THREE) {
  const g = new THREE.BufferGeometry();
  for (const [key, n] of [['position', 3], ['normal', 3], ['uv', 2]]) g.setAttribute(key, new THREE.BufferAttribute(new Float32Array(0), n));
  return g;
}

/** The file's part laid into the kit's shape of the same name: its colours in the code's slot order, one group each. */
function takeShape(THREE, into, meshes) {
  const slots = meshes.map(({ geometry, material }) => [Number(String(material).split('|')[1]) || 0, geometry]).sort((a, b) => a[0] - b[0]);
  into.dispose(); // the code shape's buffers go; the meshes keep this geometry
  into.setIndex(null);
  into.clearGroups();
  for (const key of Object.keys(into.attributes)) into.deleteAttribute(key);
  // The tangents (loadParts' MikkTSpace) come along when every colour has them.
  const arrays = { position: [], normal: [], uv: [], ...(slots.every(([, g]) => g.attributes.tangent) ? { tangent: [] } : {}) };
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
    into.setAttribute(key, new THREE.BufferAttribute(out, { uv: 2, tangent: 4 }[key] ?? 3));
  }
  into.computeBoundingBox();
  into.computeBoundingSphere();
}

/** A left-side shape mirrored across y = 0 into `into` (a right-side gear well, app_layout.json code_mirrors): y and the normals' y flipped, each triangle's winding reversed. */
function mirrorShape(THREE, into, from) {
  into.dispose();
  into.setIndex(null);
  into.clearGroups();
  for (const key of Object.keys(into.attributes)) into.deleteAttribute(key);
  for (const gr of from.groups) into.addGroup(gr.start, gr.count, gr.materialIndex);
  for (const [key, n] of [['position', 3], ['normal', 3], ['uv', 2]]) {
    const src = from.attributes[key].array, out = new Float32Array(src.length);
    for (let t = 0; t < src.length; t += 3 * n) {
      for (let v = 0; v < 3; v++) {
        const sv = v === 0 ? 0 : 3 - v; // corners 1 and 2 swap
        for (let c = 0; c < n; c++) out[t + v * n + c] = (n === 3 && c === 1 ? -1 : 1) * src[t + sv * n + c];
      }
    }
    into.setAttribute(key, new THREE.BufferAttribute(out, n));
  }
  into.computeBoundingBox();
  into.computeBoundingSphere();
}

/**
 * A level switch (setCt156Level): every ship goes back to its plain paint, the shaded copies and the pictures' textures
 * made at the old level are freed, and the next shading starts from each mesh's base material, not from a copy of a copy.
 * The look sliders aren't touched: they live in shared uniforms and normalScale (ct156-blender.js), not in the files.
 */
function unshadeKit(kit) {
  for (const set of [kit.exteriorMeshes, kit.gearMeshes, kit.propMeshes, kit.lampMeshes]) {
    for (const mesh of set) {
      const plain = mesh.userData.ct156Unshaded;
      if (!plain) continue;
      mesh.userData.ct156Unshaded = null;
      setPlain(mesh, plain);
    }
  }
  for (const [copy, owner] of kit.shadedCopies) {
    copy.dispose();
    const at = owner.indexOf(copy);
    if (at !== -1) owner.splice(at, 1);
  }
  kit.shadedCopies.length = 0;
  kit.shaded = new WeakMap();
  kit.shadedMirrored = new WeakMap();
  kit.gearShaded = new WeakMap();
  const sheen = kit.skin.sheen;
  if (sheen) {
    sheen.dispose();
    const at = kit.own.indexOf(sheen);
    if (at !== -1) kit.own.splice(at, 1);
  }
  kit.ao = null;
  kit.skin = {};
  kit.gearAo = null;
  kit.sheenInfo = null;
}

/** Loads the files at the level now in use: the shapes and the pictures (each attach drops itself if the level changes again before it finishes). */
function attachFiles(kit) {
  attachExterior(kit);
  attachGear(kit);
  attachPilots(kit);
}

function attachExterior(kit) {
  const gen = ct156Generation();
  const stale = () => kit.disposed || gen !== ct156Generation();
  loadDelivered(EXTERIOR_FILE, { tangents: true }).then((list) => {
    if (stale()) return;
    const byName = new Map(list.map((p) => [p.name, p]));
    const usable = (p) => p?.meshes.length && p.meshes.every(({ geometry: g }) => g.attributes.normal && g.attributes.uv);
    const missing = [...EXTERIOR_PARTS, ...LAYOUT2_EXTERIOR].filter((name) => !usable(byName.get(name)));
    if (missing.length) {
      console.warn(`${EXTERIOR_FILE}: ${missing.join(', ')} missing or without normals and picture corners; the code model shows`);
      return;
    }
    for (const name of [...EXTERIOR_PARTS, ...LAYOUT2_EXTERIOR]) takeShape(kit.THREE, kit.geo[name], byName.get(name).meshes);
    // The file's plate lies shut in the model's frame; the ship turns it on its hinge (addSpeedBrake), so it moves into the hinge's frame.
    const sb = speedBrakeHinge();
    kit.geo.speedBrake.translate(-sb.at[0], -sb.at[1], -sb.at[2]).rotateY(-sb.shut);
    for (const mesh of kit.exteriorMeshes) if (mesh.userData.ct156Slots) setPlain(mesh, mesh.userData.ct156Slots); // the wicks' and slots' dark colour (kit.slotExtras)
    // The nav and tail lights' lenses (3d-work slice 4.1: antenna|3 red, |4 green, |5 white) in place of the code's flat
    // ovals (fix row W4), when the file has them.
    kit.lensesDelivered = [3, 4, 5].every((slot) => byName.get('antenna').meshes.some(({ material }) => material === `antenna|${slot}`));
    for (const m of kit.navMeshes) m.visible = !kit.lensesDelivered;
    // The prop's blade 1 and its tip, when the file has them (3d-work delivery 423e5eb on); before that the code's plates stay.
    if (PROP_PARTS.every((name) => usable(byName.get(name)))) {
      for (const name of PROP_PARTS) takeShape(kit.THREE, kit.geo[name], byName.get(name).meshes);
      kit.propDelivered = true;
    }
    // The pictures (slice 4.1, a set per level), the paint shaded only once every one has loaded at its size.
    const P = CT156_PICTURES[ct156Level()], at = ct156Files();
    const pic = (k) => loadPicture(kit.THREE, at + P[k].file, P[k].size);
    shadeWhenLoaded({ ao: pic('ao'), normal: pic('normal'), mask: pic('mask'), weather: pic('weather') }, (p) => {
      if (stale()) return;
      const sheen = ct156PanelSheen(kit.THREE, p.mask);
      kit.own.push(sheen.texture);
      kit.sheenInfo = { panels: sheen.panels, ms: sheen.ms, samples: sheen.samples };
      kit.skin = { normal: p.normal, mask: p.mask, weather: p.weather, sheen: sheen.texture };
      kit.ao = p.ao;
      for (const mesh of kit.exteriorMeshes) shadeMesh(kit, mesh);
      if (kit.propDelivered) for (const mesh of kit.propMeshes) shadeMesh(kit, mesh);
    });
  }, (e) => warnUnlessReported(EXTERIOR_FILE, e, 'the code model shows'));
}

/** The gear's Blender file (ALL-34), as attachExterior: all its parts or none; without it the code's gear shows. */
function attachGear(kit) {
  const gen = ct156Generation();
  const stale = () => kit.disposed || gen !== ct156Generation();
  loadDelivered(GEAR_FILE).then((list) => {
    if (stale()) return;
    const byName = new Map(list.map((p) => [p.name, p]));
    const usable = (p) => p?.meshes.length && p.meshes.every(({ geometry: g }) => g.attributes.normal && g.attributes.uv);
    const missing = [...GEAR_PARTS, ...GEAR_WELLS].filter((name) => !usable(byName.get(name)));
    if (missing.length) {
      console.warn(`${GEAR_FILE}: ${missing.join(', ')} missing or without normals and picture corners; the code's gear shows`);
      return;
    }
    for (const name of GEAR_PARTS) takeShape(kit.THREE, kit.geo[name], byName.get(name).meshes);
    // The wells, in the model's frame (layout 2, no_picture): the left side's from the file, the right's its mirror.
    for (const name of ['gearLegWell', 'gearInboardWell']) {
      takeShape(kit.THREE, kit.geo[`${name}L`], byName.get(name).meshes);
      mirrorShape(kit.THREE, kit.geo[`${name}R`], kit.geo[`${name}L`]);
    }
    takeShape(kit.THREE, kit.geo.gearNoseWell, byName.get('gearNoseWell').meshes);
    const { gearAo } = CT156_PICTURES[ct156Level()];
    shadeWhenLoaded({ ao: loadPicture(kit.THREE, ct156Files() + gearAo.file, gearAo.size) }, ({ ao }) => {
      if (stale()) return;
      kit.gearAo = ao;
      for (const mesh of kit.gearMeshes) shadeMesh(kit, mesh, true);
      for (const lamps of kit.lampShips) showLamps(lamps);
    });
    // The landing and taxi lamp (GEAR_LAMP), when the file has it (3d-work delivery 423e5eb on): every ship's lamps take
    // it and its old glow goes; before that the glow stays.
    if (usable(byName.get('gearLamp'))) {
      takeShape(kit.THREE, kit.geo.gearLamp, byName.get('gearLamp').meshes);
      kit.lampDelivered = true;
      for (const lamps of kit.lampShips) showLamps(lamps);
    }
  }, (e) => warnUnlessReported(GEAR_FILE, e, "the code's gear shows"));
}

/** The pilots' Blender file (layout 2): both helmets' shapes in place of the code's, or neither; no shadow picture (NO_PICTURE). */
function attachPilots(kit) {
  const gen = ct156Generation();
  loadDelivered(PILOTS_FILE).then((list) => {
    if (kit.disposed || gen !== ct156Generation()) return;
    const byName = new Map(list.map((p) => [p.name, p]));
    const usable = (p) => p?.meshes.length && p.meshes.every(({ geometry: g }) => g.attributes.normal && g.attributes.uv);
    const missing = PILOT_PARTS.filter((name) => !usable(byName.get(name)));
    if (missing.length) {
      console.warn(`${PILOTS_FILE}: ${missing.join(', ')} missing or without normals and picture corners; the code's pilots show`);
      return;
    }
    for (const name of PILOT_PARTS) takeShape(kit.THREE, kit.geo[name], byName.get(name).meshes);
  }, (e) => warnUnlessReported(PILOTS_FILE, e, "the code's pilots show"));
}

/**
 * A ship's landing and taxi lamps as its gear stands (setGear): the file's lamp on each hinge, lit (the lens and LEDs
 * warm white) only with all three legs down, and the old glow only while no file's lamp is in.
 */
function showLamps(lamps) {
  const { kit, glow, meshes, lit } = lamps;
  const { mats } = kit;
  if (glow) glow.visible = lit && !kit.lampDelivered;
  for (const mesh of meshes) {
    mesh.visible = Boolean(kit.lampDelivered);
    setPlain(mesh, lit ? [mats.gearLamp[0], mats.lamp, mats.lamp] : mats.gearLamp);
    if (kit.lampDelivered && kit.gearAo) shadeMesh(kit, mesh, true);
  }
}

/**
 * The canopy's tinted glass seen from outside (next-steps 5b, Patrick 15 Oct 2026; 3d-work handover 4.4): the sky's
 * reflection as before (envMap), and toward the glass's edges, where it is seen at a glancing angle, more of the tint and
 * less of what is behind (a Fresnel-like rise, (1 - |n.v|)^3, to GLASS_EDGE's opacity, the light dimmed by up to
 * GLASS_EDGE_DIM), so the hood reads as curved glass and its edges darker than its middle. Numbers estimates, judged on
 * renders. Returns the material.
 */
const GLASS_EDGE = 0.85, GLASS_EDGE_DIM = 0.85;
function canopyGlass(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `{
		float ct156Glance = pow( 1.0 - abs( dot( normal, normalize( vViewPosition ) ) ), 3.0 );
		diffuseColor.a = mix( diffuseColor.a, ${GLASS_EDGE.toFixed(3)}, ct156Glance );
		outgoingLight *= 1.0 - ${GLASS_EDGE_DIM.toFixed(3)} * ct156Glance;
	}
	#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => 'ct156-canopy-glass';
  return material;
}

const kits = new WeakMap(); // THREE namespace -> kit

/**
 * The dorsal fin (DORSAL): thin rounded sections standing on the fuselage's top, flaring out at the foot into a small
 * fillet (by FLARE times the half-width, an estimate) that ends just under the skin, so it reads as one with the
 * fuselage. Its front end starts inside the fairing and its back end inside the fin. Closed at each end.
 */
function dorsalGeometry(THREE) {
  const N = 24, M = 12, n = 2.4, FLARE = 0.3, POINT_FT = 1.2; // n: a little boxier than an ellipse; FU5: the foot's flare 0.3 (was 1.2), the front drawn to a point over its first 1.2 ft
  const x0 = DORSAL[0][0], x1 = DORSAL[DORSAL.length - 1][0];
  const pos = [], idx = [];
  const ring = (x) => {
    const [, w0, top] = rowAt(DORSAL, x);
    const w = w0 * Math.max(0.08, Math.sin((Math.PI / 2) * Math.min(1, (x0 - x) / GFT / POINT_FT)));
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

/** The stack's wall thickness, a share of its half-size: about 1 in (Patrick, 12 Oct 2026: the open edges read as thin
 * ribbons from the seat; an estimate). */
const STUB_WALL = 0.18;
/**
 * The rings of one exhaust stack on side s (+1 left, -1 right), [x, y, z] units, M points each, from the cowl aft: an
 * oval pipe coming straight out of the cowl, turning aft round a quarter circle and running aft, its open end cut on
 * STUB's slant so it opens aft and outward, the inner wall the longest; its front buried in the cowl. With `lining`,
 * the wall's sooty inside, a wall's thickness in, from the bend aft. The last ring lies on the slant: the open end.
 */
function stackRings(s, lining = false) {
  const { y0, xBend, yBend, R, halfWide, halfTall, xOut, yOut, xIn, yIn, taper, z } = STUB;
  const M = 24, pos = [];
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
  const k0 = lining ? 1 - STUB_WALL : 1;
  for (const p of path) {
    for (let k = 0; k < M; k++) {
      const a = (2 * Math.PI * k) / M, c = Math.cos(a);
      let px = p.x + halfWide * k0 * c * p.ty, py = p.y - halfWide * k0 * c * p.tx;
      if (p.tx < 0) px = Math.max(px, slant(py));
      pos.push(px, s * py, z + halfTall * k0 * p.h * Math.sin(a));
    }
  }
  return { pos, M, rings: path.length };
}

/** One exhaust stack's wall (or, with `lining`, its sooty inside), from stackRings. */
function stackGeometry(THREE, s, lining = false) {
  const { pos, M, rings } = stackRings(s, lining), idx = [];
  const flip = (s > 0) !== lining;
  for (let i = 0; i < rings - 1; i++) {
    for (let k = 0; k < M; k++) {
      const a = i * M + k, b = i * M + ((k + 1) % M), c = a + M, d = b + M;
      if (flip) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  return meshOf(THREE, pos, idx);
}

/** The stack's open end: the cut face of its wall, from the outside's edge in to the lining's, so it reads as a pipe. */
function stackLipGeometry(THREE, s) {
  const out = stackRings(s), lin = stackRings(s, true), M = out.M;
  const pos = [...out.pos.slice((out.rings - 1) * M * 3), ...lin.pos.slice((lin.rings - 1) * M * 3)], idx = [];
  for (let k = 0; k < M; k++) {
    const a = k, b = (k + 1) % M, c = a + M, d = b + M;
    if (s > 0) idx.push(a, b, c, b, d, c);
    else idx.push(a, c, b, b, c, d);
  }
  return meshOf(THREE, pos, idx);
}

/**
 * The fairing under the nose (NOSE_FAIRING): rounded-box sections hanging under the belly, their tops sunk just inside
 * the skin, the ends eased over the first and last tenth of its length, closed at each end.
 */
function noseFairingGeometry(THREE) {
  const { x0, x1 } = NOSE_FAIRING;
  const N = 16, M = 16, n = 3, pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = x0 + (x1 - x0) * t;
    const { top, depth, w, sink } = noseStripAt(x);
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
 * The speed brake's hinge (SPEED_BRAKE), model units: at its front edge just under the belly, and the turn that lays the
 * shut plate along the belly, which rises aft under it.
 */
function speedBrakeHinge() {
  const { x0, length } = SPEED_BRAKE;
  return { at: [x0, 0, bellyAt(x0) - 0.0006], shut: Math.atan2(bellyAt(x0 - length) - bellyAt(x0), length) };
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

// ---------- the landing gear (GEAR, ALL-34) ----------
const GFT = CT156_UNIT_LENGTH / CT156_LENGTH_FT; // model units per foot
const gearX = (ft) => 0.66 - ft * GFT; // feet behind the spinner's tip to the model's x

/** The nose fairing's skin underneath at x, y (noseFairingGeometry's section, inverted), units; y 0 its lowest line. */
function fairingBottomAt(x, y = 0) {
  const { top, depth, w, sink } = noseStripAt(x);
  const c = Math.min(1, Math.abs(y) / w) ** 1.5;
  return top - (depth + sink) * Math.sqrt(1 - c * c) ** (2 / 3);
}

/** The belly strip's section at x (F17): its top just inside the belly, its depth, its half-width and the sink, eased in over its first tenth and held at its depth to the end, no deeper than the wing's underside once aft of its leading edge. */
function noseStripAt(x) {
  const { x0, x1, xDepth, depth0, depth1, half } = NOSE_FAIRING, sink = 0.004;
  const t = Math.max(0, (x - x0) / (x1 - x0));
  const ease = Math.sin((Math.PI / 2) * Math.min(1, t / 0.1)) ** 0.5;
  let depth = (depth0 + (depth1 - depth0) * Math.min(1, (x - x0) / (xDepth - x0))) * ease;
  const top = bellyAt(x) + sink;
  if (x < WING[0].le) depth = Math.max(Math.min(depth, top - sink - (wingSurfZ(x, 0, -1) + 0.02 * GFT)), 0.02 * GFT);
  return { top, depth, w: half * (0.6 + 0.4 * ease), sink };
}

/** The inboard door's outboard edge (feet out from the middle) at xFt feet behind the spinner's tip: a D, its corners
 * rounded aftCornerFt aft and foreCornerFt forward. */
function inboardDoorFarFt(xFt) {
  const { x0Ft, x1Ft, y1Ft, aftCornerFt: R, foreCornerFt: r } = GEAR.inboardDoor;
  const round = (c, d) => y1Ft - c + Math.sqrt(Math.max(0, c * c - d * d));
  if (xFt > x1Ft - R) return round(R, xFt - (x1Ft - R));
  if (xFt < x0Ft + r) return round(r, x0Ft + r - xFt);
  return y1Ft;
}

let gearLayoutCache = null;
/**
 * Where the gear's hinges and wheels are, model units, the left side (+y; the right is its mirror): the main leg's
 * pivot (its leg door's outer face then lies on the wing's underside when folded), the leg's length to the axle, the
 * leg door's splay hinge in the leg's own frame, the inboard door's and nose door's hinge lines (y, z), the nose leg's
 * pivot and its axle's offset from it, and the ground under the main and nose wheels (the nose's lower by
 * GEAR_SIT_DEG over the wheelbase, so the aircraft sits nose up on level ground).
 */
function gearLayout() {
  if (gearLayoutCache) return gearLayoutCache;
  const m = GEAR.main, n = GEAR.nose, ib = GEAR.inboardDoor, nd = GEAR.noseDoor;
  const mx = gearX(m.xFt);
  const pivot = [mx, m.pivotYFt * GFT, wingSurfZ(mx, m.pivotYFt * GFT, -1) + m.doorOutFt * GFT];
  const mainGround = GEAR.groundFt * GFT;
  const legLen = pivot[2] - (mainGround + m.tyreRFt * GFT);
  const nx = gearX(n.xFt);
  const noseGround = mainGround - (nx - mx) * Math.tan(rad(GEAR_SIT_DEG));
  const nosePivot = [gearX(n.pivotXFt), 0, n.pivotZFt * GFT];
  const noseAxle = [nx - nosePivot[0], 0, noseGround + n.tyreRFt * GFT - nosePivot[2]];
  const ibMid = gearX((ib.x0Ft + ib.x1Ft) / 2);
  const ndMid = gearX((nd.x0Ft + nd.x1Ft) / 2);
  gearLayoutCache = {
    pivot, legLen, mainGround, noseGround, nosePivot, noseAxle,
    legDoorHinge: [0, m.doorOutFt * GFT, (GEAR.legDoor.y1Ft - m.pivotYFt) * GFT],
    inboardHinge: [0, ib.y0Ft * GFT, wingSurfZ(ibMid, ib.y0Ft * GFT, -1)],
    noseHinge: [0, nd.halfFt * GFT, fairingBottomAt(ndMid)],
  };
  return gearLayoutCache;
}

/** The left landing lamp's hinge (GEAR_LAMP), units: GEAR_LIGHT's place aft and inboard of the main leg's pivot, up inside the wing from its lower skin. */
function gearLampHinge() {
  const L = gearLayout();
  const x = L.pivot[0] - GEAR_LIGHT.aftFt * GFT, y = L.pivot[1] - GEAR_LIGHT.inboardFt * GFT;
  return [x, y, wingSurfZ(x, y, -1) + 0.0015 + GEAR_LAMP.hingeUpFt * GFT]; // wingSurfZ stands 0.0015 off the skin, for decals
}

/** A round rod from a to b ([x, y, z]), radius r. */
function gearRod(THREE, a, b, r, seg = 10) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}

/** A wheel on an axle along y, centred at c: the tyre (slot 1) round the hub (slot 2). Feet in, units out. */
function gearWheel(THREE, c, rFt, wFt) {
  const R = rFt * GFT, W = (wFt * GFT) / 2, h = R * 0.36, rc = R - h / 2, n = 2.6;
  const tyre = [];
  for (let k = 0; k <= 28; k++) { // the tyre's section, a rounded box, round from its inner edge
    const a = -Math.PI / 2 + (k / 28) * 2 * Math.PI, c2 = Math.cos(a), s2 = Math.sin(a);
    tyre.push(new THREE.Vector2(rc + (h / 2) * Math.sign(c2) * Math.abs(c2) ** (2 / n), W * Math.sign(s2) * Math.abs(s2) ** (2 / n)));
  }
  const rim = rc - h / 2;
  const hub = [[0.0005, -W * 0.7], [rim * 0.45, -W * 0.72], [rim * 0.55, -W * 0.85], [rim, -W * 0.85], [rim, W * 0.85], [rim * 0.55, W * 0.85], [rim * 0.45, W * 0.72], [0.0005, W * 0.7]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  return [
    { geometry: new THREE.LatheGeometry(tyre, 28).translate(c[0], c[1], c[2]), materials: [1] },
    { geometry: new THREE.LatheGeometry(hub, 20).translate(c[0], c[1], c[2]), materials: [2] },
  ];
}

/**
 * A door: a thin plate whose outer face (slot 0, the paint) runs through outer(u, v) for u, v in [0, 1] and whose inner
 * face (slot 1) lies thick inward, along `inward`; each point then moved by place(p). Units.
 */
function gearDoor(THREE, outer, inward, thick, place, nu = 8, nv = 6) {
  const pos = [], idx = [], groups = [];
  const face = (off, flip) => {
    const start = idx.length, base = pos.length / 3;
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nv; j++) {
        const p = outer(i / nu, j / nv);
        pos.push(...place([p[0] + inward[0] * off, p[1] + inward[1] * off, p[2] + inward[2] * off]));
      }
    }
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const a = base + i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1;
        idx.push(...(flip ? [a, b, c, b, d, c] : [a, c, b, b, c, d]));
      }
    }
    return [start, idx.length - start];
  };
  const [s0, c0] = face(0, false);
  groups.push([s0, c0, 0]);
  const [s1, c1] = face(thick, true);
  // The edges: a strip round the rim between the two faces.
  const start = idx.length, rim = [];
  for (let i = 0; i <= nu; i++) rim.push([i / nu, 0]);
  for (let j = 1; j <= nv; j++) rim.push([1, j / nv]);
  for (let i = nu - 1; i >= 0; i--) rim.push([i / nu, 1]);
  for (let j = nv - 1; j >= 1; j--) rim.push([0, j / nv]);
  const base = pos.length / 3;
  for (const [u, v] of rim) {
    const p = outer(u, v);
    pos.push(...place(p), ...place([p[0] + inward[0] * thick, p[1] + inward[1] * thick, p[2] + inward[2] * thick]));
  }
  for (let k = 0; k < rim.length; k++) {
    const a = base + 2 * k, b = base + 2 * ((k + 1) % rim.length);
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  groups.push([s1, c1 + idx.length - start, 1]);
  return meshOf(THREE, pos, idx, groups);
}

/** The ribs across a gear well and the stringer along it: their spacing and width, feet (Patrick, 12 Oct 2026, "polish
 * the gear/belly with this picture": his photo of 123 from below shows the wells' structure, light against their dark
 * depths; spacing and width estimates). */
const WELL_RIBS = Object.freeze({ pitchFt: 0.35, widthFt: 0.12 });

/** A dark patch just outside the skin over a door's opening, seen while the door is open (as the speed brake's well),
 * slot 0, with light ribs across it and a stringer down its middle, slot 1; span(x) its edges across. */
function gearWell(THREE, x0, x1, span, zAt, n = 8) {
  const pos = [], idx = [];
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= 2; j++) {
      const x = x0 + ((x1 - x0) * i) / n, [y0, y1] = span(x), y = y0 + ((y1 - y0) * j) / 2;
      pos.push(...wingBend([x, y, zAt(x, y) - 0.0004]));
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
    const a = i * 3 + j, b = a + 1, c = a + 3, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const floor = idx.length;
  // A strip just outside the floor between (xa, ya) and (xb, yb) corners, w wide: [x0, x1] by [y0, y1] in the floor's own terms.
  const strip = (xa, xb, ya, yb) => {
    const base = pos.length / 3;
    for (const [x, y] of [[xa, ya], [xb, ya], [xa, yb], [xb, yb]]) pos.push(...wingBend([x, y, zAt(x, y) - 0.0007]));
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  };
  const w = WELL_RIBS.widthFt * GFT / 2, len = Math.abs(x1 - x0), k = Math.max(1, Math.round(len / (WELL_RIBS.pitchFt * GFT)));
  for (let i = 1; i < k; i++) {
    const x = x0 + ((x1 - x0) * i) / k, [y0, y1] = span(x);
    strip(x - w, x + w, y0, y1);
  }
  const xm0 = Math.min(x0, x1), xm1 = Math.max(x0, x1), steps = 6;
  for (let i = 0; i < steps; i++) {
    const xa = xm0 + ((xm1 - xm0) * i) / steps, xb = xm0 + ((xm1 - xm0) * (i + 1)) / steps;
    const mid = (x) => { const [y0, y1] = span(x); return (y0 + y1) / 2; };
    const ya = mid((xa + xb) / 2);
    strip(xa, xb, ya - w, ya + w);
  }
  return meshOf(THREE, pos, idx, [[0, floor, 0], [floor, idx.length - floor, 1]]);
}

/**
 * The gear's shapes, each in its own hinge's frame, the left side's (the right side draws them mirrored), gear down and
 * doors shut: gearMain (leg, piston, torque link, axle and wheel about the main leg's pivot; slots metal, tyre, hub,
 * chrome), gearMainDoor (the leg door about its splay hinge), gearInboardDoor (about its hinge line, shut),
 * gearNose (strut, fork and wheel about the nose leg's pivot), gearNoseDoor (the left nose door about its hinge line,
 * shut), and the dark wells (model frame).
 */
function gearGeometries(THREE) {
  const L = gearLayout(), m = GEAR.main, n = GEAR.nose, t = GEAR.doorThickFt * GFT;
  const geo = {};
  const len = L.legLen, wheelY = m.wheelOutFt * GFT;
  geo.gearMain = joinGeometries(THREE, [
    { geometry: gearRod(THREE, [0, 0, 0.1 * GFT], [0, 0, -0.56 * len], m.legRFt * GFT, 12), materials: [0] },
    { geometry: gearRod(THREE, [0, 0, -0.5 * len], [0, 0, -len], m.pistonRFt * GFT, 12), materials: [3] },
    { geometry: gearRod(THREE, [0, 0, -0.56 * len], [0, 0, -0.62 * len], (m.legRFt + 0.03) * GFT, 14), materials: [0] },
    { geometry: gearRod(THREE, [0, -0.05 * GFT, -len], [0, wheelY, -len], 0.11 * GFT, 12), materials: [0] },
    { geometry: gearRod(THREE, [0, 0, -len + 0.12 * GFT], [0, 0, -len - 0.12 * GFT], 0.13 * GFT, 12), materials: [0] },
    { geometry: gearRod(THREE, [0.15 * GFT, 0, -0.55 * len], [0.32 * GFT, 0, -0.74 * len], 0.04 * GFT, 8), materials: [0] },
    { geometry: gearRod(THREE, [0.32 * GFT, 0, -0.74 * len], [0.12 * GFT, 0, -0.93 * len], 0.04 * GFT, 8), materials: [0] },
    ...gearWheel(THREE, [0, wheelY, -len], m.tyreRFt, m.tyreWFt),
  ]);
  // Doors are drawn where they lie shut (on the skin) and moved into their hinge's frame.
  const ld = GEAR.legDoor, ib = GEAR.inboardDoor, nd = GEAR.noseDoor;
  // On the skin itself (wingSurfZ sits 0.0015 out for decals) and bent with the outer panel, just proud of it.
  const under = (x, y) => wingBend([x, y, wingSurfZ(x, y, -1) + 0.001]);
  // F25 (3d-work chunk 3): the inboard doors' outer faces 0.0005 units under the surface line (was 0.001), so the well's ribs lie inside a shut door.
  const underInboard = (x, y) => wingBend([x, y, wingSurfZ(x, y, -1) + 0.0005]);
  const [px, py, pz] = L.pivot, hd = L.legDoorHinge;
  // Folded, the leg lies turned -90° about x from down; into the leg's frame is +90° about x, (y, z) -> (-z, y).
  const intoLeg = ([x, y, z]) => {
    const dy = y - py, dz = z - pz;
    return [x - px - hd[0], -dz - hd[1], dy - hd[2]];
  };
  geo.gearMainDoor = gearDoor(THREE, (u, v) => {
    // v 0 is the door's bottom (its inboard end, folded): wider aft there up to the shoulder (A2).
    const k = 1 - clamp01((v - ld.lowerFrac) / (ld.shoulderFrac - ld.lowerFrac));
    const x = gearX(ld.x0Ft + (ld.x1Ft + ld.lowerAftFt * k - ld.x0Ft) * u), y = (ld.y0Ft + (ld.y1Ft - ld.y0Ft) * v) * GFT;
    return under(x, y);
  }, [0, 0, 1], t, intoLeg, 8, 24);
  const ih = L.inboardHinge;
  geo.gearInboardDoor = gearDoor(THREE, (u, v) => {
    const xFt = ib.x0Ft + (ib.x1Ft - ib.x0Ft) * Math.sin((Math.PI / 2) * u); // closer together aft, round the D
    return underInboard(gearX(xFt), (ib.y0Ft + (inboardDoorFarFt(xFt) - ib.y0Ft) * v) * GFT);
  }, [0, 0, 1], t, ([x, y, z]) => [x, y - ih[1], z - ih[2]], 20, 6);
  // The nose leg, raked along its pivot-to-axle line: strut, piston, fork crown, two fork blades, axle, torque link.
  const A = L.noseAxle, at = (f, dx = 0, dy = 0) => [A[0] * f + dx, dy, A[2] * f];
  const fy = n.forkYFt * GFT, crown = 0.8, link = n.linkFt * GFT;
  // The mudguard: a thin curved plate over the tyre's aft top, from the fork crown aft and down (the photo of 126).
  const gR = (n.tyreRFt + n.guardFt) * GFT, gW = (n.tyreWFt / 2 + 0.06) * GFT;
  const guard = [{
    geometry: gearDoor(THREE, (u, v) => {
      const a = Math.PI / 2 + 1.1 * u;
      return [A[0] + gR * Math.cos(a), -gW + 2 * gW * v, A[2] + gR * Math.sin(a)];
    }, [0, 0, -1], 0.02 * GFT, (q) => q, 10, 2),
    materials: [0, 0],
  }];
  geo.gearNose = joinGeometries(THREE, [
    { geometry: gearRod(THREE, at(-0.04), at(0.5), n.legRFt * GFT, 12), materials: [0] },
    { geometry: gearRod(THREE, at(0.45), at(crown), n.pistonRFt * GFT, 12), materials: [3] },
    { geometry: gearRod(THREE, at(crown, 0, -fy - 0.03 * GFT), at(crown, 0, fy + 0.03 * GFT), 0.05 * GFT, 8), materials: [0] },
    { geometry: gearRod(THREE, at(crown, 0, fy), at(1, 0, fy), 0.035 * GFT, 8), materials: [0] },
    { geometry: gearRod(THREE, at(crown, 0, -fy), at(1, 0, -fy), 0.035 * GFT, 8), materials: [0] },
    { geometry: gearRod(THREE, at(1, 0, -fy - 0.03 * GFT), at(1, 0, fy + 0.03 * GFT), 0.04 * GFT, 8), materials: [0] },
    { geometry: gearRod(THREE, at(0.42), at(0.5), n.collarRFt * GFT, 14), materials: [0] },
    { geometry: gearRod(THREE, at(0.2), at(0.42, link), 0.035 * GFT, 8), materials: [0] },
    { geometry: gearRod(THREE, at(0.42, link), at(0.62), 0.035 * GFT, 8), materials: [0] },
    { geometry: gearRod(THREE, at(0.05), at(-0.12, -0.55 * GFT), 0.04 * GFT, 8), materials: [0] },
    ...guard,
    ...gearWheel(THREE, A, n.tyreRFt, n.tyreWFt),
  ]);
  const nh = L.noseHinge, half = nd.halfFt * GFT;
  geo.gearNoseDoor = gearDoor(THREE, (u, v) => {
    const x = gearX(nd.x0Ft + (nd.x1Ft - nd.x0Ft) * u);
    return [x, half * v, fairingBottomAt(x, half * v) - 0.0005];
  }, [0, 0, 1], t, ([x, y, z]) => [x, y - nh[1], z - nh[2]]);
  // The wells, model frame, each side: the leg door's and the inboard door's openings, and the nose bay's.
  const wing = (x, y) => wingSurfZ(x, y, -1) + 0.0017; // the well 0.0002 outside the skin, under the shut door
  for (const k of ['L', 'R']) {
    const s = k === 'L' ? 1 : -1;
    const ys = (a, b) => (s > 0 ? [a * GFT, b * GFT] : [-b * GFT, -a * GFT]);
    geo[`gearLegWell${k}`] = gearWell(THREE, gearX(ld.x0Ft), gearX(ld.x1Ft), () => ys(ld.wellY0Ft, ld.y1Ft), wing);
    geo[`gearInboardWell${k}`] = gearWell(THREE, gearX(ib.x0Ft), gearX(ib.x1Ft), (x) => ys(ib.y0Ft, inboardDoorFarFt((0.66 - x) / GFT)), wing, 20);
  }
  geo.gearNoseWell = gearWell(THREE, gearX(nd.x0Ft), gearX(nd.x1Ft), () => [-half, half], (x) => fairingBottomAt(x));
  return geo;
}

// ---------- the flight surfaces (SURFACES, ALL-35) ----------
const surfX = (table, s, f) => { const sec = sectionOf(table, Math.abs(s)); return sec.le - f * sec.chord; };
const FLAP_TE = 0.985; // the split flap's trailing edge, a little short of the wing's own (an estimate)
const FLAP_PIECES = Object.freeze({ flapIn: [SURFACES.flap.s0, WING_BREAK], flapOut: [WING_BREAK, SURFACES.flap.s1] });
/** A point under the left wing at span station s, chord fraction f, dz above its lower skin; bent with the wing. */
const underWing = (s, f, dz) => { const x = surfX(WING, s, f); return wingBend([x, s, wingSurfZ(x, s, -1) + dz]); };

/** The split flaps under the left wing, shut (plates on the lower skin, the paint outside, slot 1 inside), and the
 * dark recesses they leave when down. */
function flapGeometries(THREE) {
  const F = SURFACES.flap, geo = {};
  for (const [name, [s0, s1]] of Object.entries(FLAP_PIECES)) {
    geo[name] = gearDoor(THREE, (u, v) => underWing(s0 + (s1 - s0) * v, F.hinge + (FLAP_TE - F.hinge) * u, 0.001),
      [0, 0, 1], (0.03 / CT156_LENGTH_FT) * CT156_UNIT_LENGTH, (q) => q, 6, 8);
    const pos = [], idx = [];
    for (let i = 0; i <= 6; i++) for (let j = 0; j <= 8; j++) pos.push(...underWing(s0 + ((s1 - s0) * j) / 8, F.hinge + ((FLAP_TE - F.hinge) * i) / 6, 0.0013));
    for (let i = 0; i < 6; i++) for (let j = 0; j < 8; j++) { const a = i * 9 + j; idx.push(a, a + 9, a + 1, a + 1, a + 9, a + 10); }
    geo[`${name}Well`] = meshOf(THREE, pos, idx);
  }
  return geo;
}

/** p turned by ang (radians) about the line through a along the unit axis u (Rodrigues). */
function turnAbout(p, a, u, ang) {
  const v = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], c = Math.cos(ang), sn = Math.sin(ang);
  const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return [0, 1, 2].map((k) => a[k] + v[k] * c + cr[k] * sn + u[k] * dot * (1 - c));
}

let surfaceLayoutCache = null;
/**
 * Each flight surface's hinge (the left side's for the ailerons and flaps): a point a on it, its unit axis, and the
 * turn's sign that puts the trailing edge down (ailerons, elevators, flaps) or to the right (rudder) for a positive
 * deflection. Hinges lie on the chord plane at the hinge fraction (the flaps' on the lower skin), straight between the
 * surface's ends.
 */
function surfaceLayout() {
  if (surfaceLayoutCache) return surfaceLayoutCache;
  const A = SURFACES.aileron, E = SURFACES.elevator, R = SURFACES.rudder, F = SURFACES.flap;
  const hingeOf = (a, b, te, wantDown) => {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], n = Math.hypot(...d), axis = d.map((v) => v / n);
    const moved = turnAbout(te, a, axis, rad(5));
    const sign = wantDown ? (moved[2] < te[2] ? 1 : -1) : (moved[1] < te[1] ? 1 : -1);
    return { a, axis, sign };
  };
  const sMid = (A.s0 + A.s1) / 2, eS = (E.s0 + Math.abs(STAB[0].s) * (1 - E.hornSpan)) / 2, zTop = FIN[FIN.length - 1].s;
  const eX = surfX(STAB, eS, E.hinge), eZ = STAB[0].z;
  surfaceLayoutCache = {
    aileron: hingeOf(wingBend([surfX(WING, A.s0, A.hinge), A.s0, WING_Z]), wingBend([surfX(WING, A.s1, A.hinge), A.s1, WING_Z]), wingBend([surfX(WING, sMid, 1), sMid, WING_Z]), true),
    elevator: hingeOf([eX, 0, eZ], [eX, 1, eZ], [surfX(STAB, eS, 1), eS, eZ], true),
    rudder: hingeOf([surfX(FIN, R.z0, R.hinge), 0, R.z0], [surfX(FIN, zTop, R.hinge), 0, zTop], [surfX(FIN, zTop / 2, 1), 0, zTop / 2], false),
    ...Object.fromEntries(Object.entries(FLAP_PIECES).map(([name, [s0, s1]]) => [name,
      hingeOf(underWing(s0, F.hinge, 0.001), underWing(s1, F.hinge, 0.001), underWing((s0 + s1) / 2, FLAP_TE, 0.001), true)])),
  };
  return surfaceLayoutCache;
}

/** The gear's parts drawn from the Blender file (ALL-34): the left side's, each in its hinge's frame. */
const GEAR_PARTS = Object.freeze(['gearMain', 'gearMainDoor', 'gearInboardDoor', 'gearNose', 'gearNoseDoor']);
/** The gear's wells from the same file (layout 2), in the model's frame: the left side's two and the nose bay's. */
const GEAR_WELLS = Object.freeze(['gearInboardWell', 'gearLegWell', 'gearNoseWell']);
const GEAR_FILE = 'ct156-gear.glb'; // its soft shadows: ct156-blender.js CT156_PICTURES gearAo

/**
 * Where each gear part sits, gear down, as a column-major 4x4 matrix from its hinge's frame to the model's (the left
 * side's), for the Blender file to bake its soft shadows in place (tools/blender/ct156-gear-pieces.mjs).
 */
function gearPoses(THREE) {
  const L = gearLayout();
  const T = (p) => new THREE.Matrix4().makeTranslation(p[0], p[1], p[2]);
  const Rx = (deg) => new THREE.Matrix4().makeRotationX(rad(deg));
  return {
    gearMain: T(L.pivot),
    gearMainDoor: T(L.pivot).multiply(T(L.legDoorHinge)).multiply(Rx(GEAR.legDoorSplayDeg)),
    gearInboardDoor: T(L.inboardHinge),
    gearNose: T(L.nosePivot),
    gearNoseDoor: T(L.noseHinge).multiply(Rx(GEAR.noseDoor.openDeg)),
  };
}

/**
 * Where the gear is at t, 0 up to 1 down (ALL-34): the inboard main doors open over the first fifth, the legs travel
 * over the middle three fifths (easing in and out) with the leg doors and nose doors going with them, and the inboard
 * doors close over the last fifth. Gear up runs the same way backwards. { doors, legs }, each 0 to 1.
 */
export function ct156GearPhase(t, parked = false) {
  const v = clamp01(Number(t) || 0);
  // F25 (Patrick, 13 Oct 2026: "Open when parked"; his photos 13, 15 and 17): once the gear is down the inboard doors close in flight, but parked they hang open, so a parked ship
  // (the gear down, the doors not told to close) keeps them open through the last fifth of the travel and after it.
  const doors = v < 0.2 ? v / 0.2 : v > 0.8 && !parked ? (1 - v) / 0.2 : 1;
  const u = clamp01((v - 0.2) / 0.6);
  return { doors, legs: u * u * (3 - 2 * u) };
}

/** About how long the gear takes each way, seconds, for a module that animates it (Patrick, 12 Oct 2026). */
export const CT156_GEAR_TRAVEL_S = 6;

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
const COCKPIT_CUT_X = [-0.177, 0.256]; // its aft end moved 1.5 ft forward with the rear bow (Patrick, 12 Oct 2026)
const FT = CT156_UNIT_LENGTH / CT156_LENGTH_FT; // model units per foot

/**
 * The cockpit tub's floor, feet below the spinner's axis (TS-155; TS-157 deepened it from 0.8 ft so the seat pan sits
 * about 10 in above the floor and the tub reads as deep as Dad's cutaway picture of the T-6A shows). An estimate.
 * ct156-cockpit.js stands its pedals, stick and seats on it.
 */
export const CT156_TUB_FLOOR_FT = -1.2;
/**
 * The cockpit tub under the canopy (TS-155): a floor CT156_TUB_FLOOR_FT below the spinner's axis from 4.1 ft aft of the
 * model origin to 5.95 ft ahead of it, just behind the front knee wells' backs (5.9 ft) so its bulkhead doesn't close them
 * (5.55 ft from V2.271 to V2.285, which put the bulkhead across the wells; 3.9 ft until the front cockpit moved forward, ALL-31; 4.47 ft until the panel moved
 * forward, V2.238; 4.6 ft until the front cockpit moved 0.95 ft forward, 11 Oct 2026), side walls about 1.3 ft out (kept inside the canopy) up to the sill, and a
 * bulkhead at each end up to the fuselage's top line. Group 0 the floor, group 1 the walls. All estimates (judged by
 * eye off Dad's reference pictures, 9 Oct 2026).
 */
function tubGeometry(THREE) {
  const N = 14, x0 = 5.95 * FT, x1 = -4.1 * FT, floorZ = CT156_TUB_FLOOR_FT * FT; // x1 -5.6 ft until the rear bow moved forward (Patrick, 12 Oct 2026)
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
/**
 * The canopy's section is a U (Patrick, 12 Oct 2026, card "Build U shape", after "Why does our bow look almost like an
 * arch? and less circular?"): its sides rise straight up from the sill, then turn over in a half circle of the
 * canopy's half-width, as the T-6A-1 front view draws the glass (near-vertical sides, a round top) and his reference
 * picture shows the forward bow. Where the canopy is lower than its half-width the top is a half ellipse that tall,
 * with no straight part. Until V2.402 one tall arch from sill to sill (y = w cos^0.85, z = base + (top - base) sin^0.75),
 * which read as a church window from the seat. { r: the top's height, v: the straight sides' height, a: the share of
 * phi each straight side takes, so the points along the section stay about evenly spaced }.
 */
function canopyU(c) {
  const h = c.top - c.base, r = Math.min(c.w, h), v = h - r;
  return { h, r, v, a: v / (2 * v + (Math.PI / 2) * (c.w + r)) };
}
/** A point [y, z] round the canopy's section c, phi 0 at the right sill through the top (pi / 2) to the left (pi). */
function canopyPoint(c, phi) {
  const t = Math.min(Math.max(phi / Math.PI, 0), 1), { r, v, a } = canopyU(c);
  if (a > 0 && t <= a) return [c.w, c.base + v * (t / a)];
  if (a > 0 && t >= 1 - a) return [-c.w, c.base + v * ((1 - t) / a)];
  const th = (Math.PI * (t - a)) / (1 - 2 * a);
  return [c.w * Math.cos(th), c.base + v + r * Math.sin(th)];
}
/** canopyPoint backwards: the phi (0 to pi / 2, the right side) at a share f (0 the sill, 1 the top) of the height. */
function canopyPhiAt(c, f) {
  const { h, r, v, a } = canopyU(c), dz = Math.min(Math.max(f, 0), 1) * h;
  if (dz <= v) return v > 0 ? Math.PI * a * (dz / v) : 0;
  const th = Math.asin(Math.min(1, (dz - v) / r));
  return Math.PI * a + th * (1 - 2 * a);
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
  return canopyPoint(c, canopyPhiAt(c, f))[0];
}
/**
 * Each coaming's crown, its middle's height along it from its aft edge forward, as [x, z] in feet (the model's frame):
 * the front glareshield's aft edge 10.6 ft behind the spinner's tip, its top 1.63 ft up there, easing down to 1.48 ft
 * 0.9 ft forward and then falling to 1.07 ft at 8.98 ft, under the windscreen's foot; the rear coaming's aft edge
 * 15.3 ft behind the tip, 1.85 ft up, its top sloping down over the first 0.47 ft to 1.68 ft and running on almost
 * level to the centre arch (Patrick, 12 Oct 2026; the front one was 5 in further forward and 20 in deep, the rear one a
 * hump over the front seat's back from 0.8 ft aft of the origin, rising to 2.06 ft). ct156-cockpit.js's GLARESHIELD_FT
 * and REAR_HUMP_FT are built on these, so each number has one copy.
 */
export const CT156_COAMING_CROWNS_FT = Object.freeze({
  front: Object.freeze([[4.69, 1.634], [5.0, 1.595], [5.3, 1.545], [5.6, 1.48], [5.8, 1.37], [6.0, 1.25], [6.3, 1.07]].map(Object.freeze)),
  rear: Object.freeze([[0, 1.77], [0.15, 1.767], [0.3, 1.744], [0.47, 1.675], [1.1, 1.645]].map(Object.freeze)), // E3 (3d-work #66, Patrick 13 Oct 2026): the crest 1 in lower at the aft edge, 1.85 to 1.77 ft, easing to nothing at the panel's face (sources.md, The rear cockpit); was [0, 1.85], [0.15, 1.82], [0.3, 1.77]
});
/** A crown's height (feet) at station x (feet), straight-line between its points; level past either end. */
export function ct156CrownZ(crown, x) {
  if (x <= crown[0][0]) return crown[0][1];
  for (let i = 1; i < crown.length; i++) {
    const [x0, z0] = crown[i - 1], [x1, z1] = crown[i];
    if (x <= x1) return z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
  }
  return crown[crown.length - 1][1];
}
/**
 * The two coamings as seen from outside through the canopy (Patrick, 12 Oct 2026, "you can see the glare shield for the
 * instrument panels"): a dark moulded hood over each instrument panel, with a flat top and rounded shoulders, kept inside
 * the glass, along CT156_COAMING_CROWNS_FT. Half-widths in feet. From the seat the cockpit draws its own (setCockpitView
 * hides these).
 */
const COAMINGS = Object.freeze([
  Object.freeze({ crown: CT156_COAMING_CROWNS_FT.front, half: 1.15 }),
  Object.freeze({ crown: CT156_COAMING_CROWNS_FT.rear, half: 1.2 }),
]);
function coamingGeometry(THREE) {
  const N = 16, M = 16, parts = [];
  for (const { crown, half } of COAMINGS) {
    const pos = [], idx = [];
    const c = { aft: crown[0][0] / 23.148, fore: crown[crown.length - 1][0] / 23.148, half: half / 23.148 };
    for (let i = 0; i <= N; i++) {
      const t = i / N, x = c.aft + (c.fore - c.aft) * t, base = canopyAt(x).base, top = ct156CrownZ(crown, x * 23.148) / 23.148;
      for (let j = 0; j <= M; j++) {
        const u = -1 + (2 * j) / M;
        let y = c.half * u, z = base - 0.002 + (top - base + 0.002) * Math.max(0, 1 - Math.abs(u) ** 4) ** 0.25;
        // Kept inside the glass: a point that would stand outside drops onto the sill instead.
        if (Math.abs(y) > ct156CanopyHalfWidth(x, z) - 0.0015) z = Math.min(z, base - 0.0005);
        pos.push(x, y, z);
      }
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j, b = a + 1, d = a + M + 1, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    // Each end closed by a flat wall down to the sill, so from behind the hood reads solid and not as a thin open
    // sheet standing over the cockpit (Patrick, 12 Oct 2026, "whats going on here?").
    for (const [i, facing] of [[0, -1], [N, 1]]) {
      const first = pos.length / 3;
      for (let j = 0; j <= M; j++) {
        const k = 3 * (i * (M + 1) + j), [x, y, z] = pos.slice(k, k + 3), low = canopyAt(x).base - 0.002;
        pos.push(x, y, z, x, y, Math.min(z, low));
      }
      for (let j = 0; j < M; j++) {
        const t0 = first + 2 * j, b0 = t0 + 1, t1 = t0 + 2, b1 = t0 + 3;
        if (facing < 0) idx.push(b0, t0, b1, b1, t0, t1);
        else idx.push(b0, b1, t0, b1, t1, t0);
      }
    }
    parts.push({ geometry: meshOf(THREE, pos, idx), materials: [0] });
  }
  // On the front one, the AOA indexer's box on the left and the standby compass's on the right, where ct156-cockpit.js
  // stands them (AOA_INDEXER_FT, STANDBY_COMPASS_FT), so from outside they show over the glareshield (Patrick,
  // 12 Oct 2026). [ahead of the aft edge, left of the middle, across, fore and aft, tall], feet.
  const crown = COAMINGS[0].crown, aftX = crown[0][0];
  for (const [ahead, y, w, d, h] of [[0.15, 0.47, 0.065, 0.24, 0.19], [0.1, -0.71, 0.26, 0.26, 0.22]]) {
    const x = (aftX + ahead) / 23.148, u = Math.min(1, Math.abs(y) / COAMINGS[0].half), base = canopyAt(x).base;
    const z = base + (ct156CrownZ(crown, aftX + ahead) / 23.148 - base) * Math.max(0, 1 - u ** 4) ** 0.25;
    const g = new THREE.BoxGeometry(d / 23.148, w / 23.148, h / 23.148).translate(x, y / 23.148, z + h / 2 / 23.148 - 0.0005);
    parts.push({ geometry: g, materials: [0] });
  }
  return joinGeometries(THREE, parts);
}
/** The fuselage's section at x, in model units: { halfWidth, top, bottom, nUp } (for ct156-cockpit.js; nUp the upper half's superellipse power). */
export function ct156FuselageSection(x) {
  const [, halfWidth, top, bottom, , nUp] = rowAt(STATIONS, x);
  return { halfWidth, top, bottom, nUp };
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
 * glass, not bulging out"; it was a round tube standing 1.7 in out). Depth under the glass an estimate: 0.4 in, since
 * through the clear glass a deeper band read as a tube (Patrick, 12 Oct 2026, "the canopy bows are flush with the
 * exterior of the glass").
 */
function hoopGeometry(THREE, x, lean = 0, half = 0.0045) {
  const n = 32, out = 0.0003, depth = -0.0015; // 0.4 in deep, a flat band and not a tube through the glass (was 1.1 in; Patrick, 12 Oct 2026)
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
/** The canopy bows' widths seen from the side, inches, in CT156_FRAME_X's order: forward 3.6 and centre 3.4 (C2), the rear end's band 1.5 (C4) (3d-work chunk 2). Was 2.5 for all. */
export const CT156_FRAME_WIDTH_IN = Object.freeze([3.6, 3.4, 1.5]);
const frameHalf = (i) => (CT156_FRAME_WIDTH_IN[i] / 2 / 12) * GFT; // a bow's half-width, model units
/** Where the canopy's sill rails start at the front, model units (under the front coaming's sides; ct156-cockpit.js). */
export const CT156_RAIL_FORE_X = 0.25;
/**
 * The canopy's lower frame along each side, feet (Patrick, 12 Oct 2026): a band 0.34 ft (4.1 in) tall up the glass from
 * the sill, with a seam 0.12 ft (1.45 in) under its top, the strip above the seam standing a little proud. Until then a
 * round rail 0.07 ft across along the sill.
 */
export const CT156_RAIL_BAND_FT = Object.freeze({ tall: 0.34, seam: 0.12 });
/**
 * The canopy's lower frame along one side (CT156_RAIL_BAND_FT), from under the front coaming's sides to the rear bow's
 * foot: two strips on the glass, sill to seam and seam to top, each a little outside it, the upper one more, joined
 * by a narrow step at the seam.
 */
function railGeometry(THREE, side) {
  const N = 40, x0 = CT156_RAIL_FORE_X, x1 = glassEnd(2)[0];
  const { tall, seam } = CT156_RAIL_BAND_FT;
  // A point on the canopy grown by `grow`, dz feet above its sill at station x (canopyPoint backwards).
  const at = (x, dz, grow) => {
    const c = canopyAt(x, grow), f = Math.min(1, (dz * FT) / (c.top - c.base));
    const [y, z] = canopyPoint(c, canopyPhiAt(c, f));
    return [x, side * y, z - (dz === 0 ? 0.002 : 0)]; // the bottom edge tucks under the sill
  };
  const rows = [[0, 0.0004], [tall - seam, 0.0004], [tall - seam, 0.0007], [tall, 0.0007]];
  const pos = [], idx = [];
  // Under the windscreen it eases in from nothing at its front end to its full height 1 ft aft, and keeps to the lower
  // 40 % of the glass, so it runs out along the sill rather than ending in a dark spike up the glass beside the
  // coaming (Patrick, 12 Oct 2026, "More clipping/needs to be smooth/merged"; it started at full height).
  for (let i = 0; i <= N; i++) {
    const x = x0 + ((x1 - x0) * i) / N, c = canopyAt(x, 0);
    const k = Math.min(Math.sin((Math.PI / 2) * Math.min(1, (x0 - x) / FT)), (0.4 * (c.top - c.base)) / (tall * FT));
    for (const [dz, grow] of rows) pos.push(...at(x, dz * k, grow));
  }
  const R = rows.length;
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < R - 1; k++) {
      const a = i * R + k, b = a + 1, c = a + R, d = c + 1;
      idx.push(...(side > 0 ? [a, c, b, b, c, d] : [a, b, c, b, d, c]));
    }
  }
  return meshOf(THREE, pos, idx);
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
function airfoilGeometry(THREE, table, opts = {}) {
  return airfoilSplit(THREE, table, opts).body;
}

/**
 * airfoilGeometry with flight surfaces cut out of it (ALL-35): each cut { s0, s1, f, part } takes the chord behind
 * fraction f between span stations s0 and s1 into its part (cuts sharing a part make one surface, as an elevator and
 * its horn balance). The cut edges are closed with flat faces on both sides, so nothing shows inside when a surface
 * turns. { body, parts: { name: geometry } }; with no cuts the body is airfoilGeometry's own shape.
 */
function airfoilSplit(THREE, table, { span = 'y', leBand = 0, cuts = [] } = {}) {
  const rounded = roundTips(table);
  const { caps } = rounded;
  let sections = rounded.sections;
  // Each cut's span ends become sections of their own, and its hinge a station along the chord, so its edges lie on them.
  for (const c of cuts) {
    for (const at of [c.s0, c.s1]) {
      if (at <= sections[0].s + 1e-6 || at >= sections[sections.length - 1].s - 1e-6) continue;
      if (sections.some((q) => Math.abs(q.s - at) < 1e-6)) continue;
      const i = sections.findIndex((q) => q.s > at);
      sections = [...sections.slice(0, i), { ...sectionOf(sections, at), s: at }, ...sections.slice(i)];
    }
  }
  const K = 14;
  const xs = [];
  for (let k = 0; k <= K; k++) xs.push((1 - Math.cos((Math.PI * k) / K)) / 2); // closer together at the nose
  for (const c of cuts) if (!xs.some((x) => Math.abs(x - c.f) < 1e-6)) xs.push(c.f);
  xs.sort((a, b) => a - b);
  const N = xs.length - 1;
  const ring = [];
  for (let k = N; k >= 0; k--) ring.push([xs[k], 1]); // upper surface, trailing edge to leading edge
  for (let k = 1; k < N; k++) ring.push([xs[k], -1]); // lower surface back to the trailing edge
  const R = ring.length;
  const pos = [];
  const point = (sec, xc, side) => {
    const x = sec.le - xc * sec.chord;
    const off = sec.z + side * thick(xc, sec.t) * sec.chord;
    return span === 'y' ? [x, sec.s, off] : [x, off, sec.s];
  };
  for (const sec of sections) for (const [xc, side] of ring) pos.push(...point(sec, xc, side));
  const names = [...new Set(cuts.map((c) => c.part))];
  const lists = new Map(names.map((n) => [n, []]));
  const regionOf = (sm, xm) => cuts.find((c) => sm >= Math.min(c.s0, c.s1) && sm <= Math.max(c.s0, c.s1) && xm >= c.f)?.part ?? null;
  const body = [], band = [];
  for (let i = 0; i < sections.length - 1; i++) {
    const sm = (sections[i].s + sections[i + 1].s) / 2;
    for (let k = 0; k < R; k++) {
      const a = i * R + k, b = i * R + ((k + 1) % R), c = a + R, d = b + R;
      const part = regionOf(sm, (ring[k][0] + ring[(k + 1) % R][0]) / 2);
      if (part) { lists.get(part).push(a, b, c, b, d, c); continue; }
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
  if (!cuts.length) return { body: meshOf(THREE, pos, [...body, ...band], band.length ? [[0, body.length, 0], [body.length, band.length, 1]] : null), parts: {} };
  // The closing faces, on their own corners (so the skin's shading isn't bent): across the chord where a cut's hinge
  // or horn runs, and across the section where a cut starts or ends; each on both of the pieces it lies between.
  /** @type {Map<string | null, number[]>} */
  const closing = new Map([[null, []], ...names.map((n) => /** @type {[string, number[]]} */ ([n, []]))]);
  const quad = (q, regions) => {
    for (const r of new Set(regions)) {
      const list = closing.get(r);
      list.push(...q[0], ...q[1], ...q[2], ...q[1], ...q[3], ...q[2]);
    }
  };
  for (let i = 0; i < sections.length - 1; i++) {
    const sm = (sections[i].s + sections[i + 1].s) / 2;
    for (let j = 1; j < N; j++) {
      const fore = regionOf(sm, (xs[j - 1] + xs[j]) / 2), aft = regionOf(sm, (xs[j] + xs[j + 1]) / 2);
      if (fore === aft) continue;
      quad([point(sections[i], xs[j], 1), point(sections[i], xs[j], -1), point(sections[i + 1], xs[j], 1), point(sections[i + 1], xs[j], -1)], [fore, aft]);
    }
  }
  for (let i = 1; i < sections.length - 1; i++) {
    for (let j = 0; j < N; j++) {
      const xm = (xs[j] + xs[j + 1]) / 2;
      const before = regionOf((sections[i - 1].s + sections[i].s) / 2, xm), after = regionOf((sections[i].s + sections[i + 1].s) / 2, xm);
      if (before === after) continue;
      quad([point(sections[i], xs[j], 1), point(sections[i], xs[j + 1], 1), point(sections[i], xs[j], -1), point(sections[i], xs[j + 1], -1)], [before, after]);
    }
  }
  // Each piece on its own corners only, smooth-shaded, its closing faces flat after.
  const piece = (idx, extra, groups) => {
    const map = new Map(), out = [], outIdx = [];
    for (const v of idx) {
      if (!map.has(v)) { map.set(v, out.length / 3); out.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); }
      outIdx.push(map.get(v));
    }
    const g = meshOf(THREE, out, outIdx, groups);
    if (!extra.length) return g;
    const flat = new THREE.BufferGeometry();
    flat.setAttribute('position', new THREE.Float32BufferAttribute(extra, 3));
    flat.computeVertexNormals();
    const first = groups ? groups.map(([, , m]) => m) : [0];
    return joinGeometries(THREE, [{ geometry: g, materials: first.length > 1 ? first : [0] }, { geometry: flat, materials: [0] }]);
  };
  return {
    body: piece([...body, ...band], closing.get(null), band.length ? [[0, body.length, 0], [body.length, band.length, 1]] : null),
    parts: Object.fromEntries(names.map((n) => [n, piece(lists.get(n), closing.get(n), null)])),
  };
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
    // 0.19 ft thick (G13, Patrick 13 Oct 2026; was 0.0032, 0.15 ft), from 6.35 to 31.53 ft behind the spinner's tip (Patrick
    // 13 Oct 2026, from A24; was 6.87 to 31.83).
    { x0: 0.66 - 6.35 / 23.148, x1: 0.66 - 31.53 / 23.148, N: 48, half: 0.0041, z: cheatZ },
    // The forward run to 4.66 ft behind the tip, 0.13 ft thick (A24; was to 4.56 ft, 0.074 ft thick).
    { x0: 0.552, x1: 0.66 - 4.66 / 23.148, N: 8, half: 0.065 / 23.148, z: () => cheatZ() - 0.006 },
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
function skinStrip(THREE, rows, side, nz = 3, lift = 0.0025) {
  const pos = [], idx = [];
  for (const [x, zTop, zBottom] of rows) {
    for (let j = 0; j <= nz; j++) {
      const z = zTop + ((zBottom - zTop) * j) / nz;
      pos.push(x, side * (fuseSurf(x, z) - 0.0025 + lift), z);
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
 * A pilot in a seat, the helmet's centre at (x, 0, z): the parts from ct156-pilot.js (helmet, visor, mask, hose, flight
 * suit, vest and collar, harness, gloves and the extra slots there) joined into one geometry, one group per slot of the
 * `pilot` materials (built from CT156_PILOT_SLOTS).
 */
function pilotGeometry(THREE, x, z) {
  return joinGeometries(THREE, ct156PilotParts(THREE, x, z));
}

/**
 * The canopy breakers' latch posts on each ejection seat, feet (E6, 3d-work #66, Patrick 13 Oct 2026: `E01`, `E02`, SMM p198, the reference seat figure; sizes
 * estimates; imported with delivery ct156-2026-10-13-17f0c75). They replace the two cones on stems (0.9 in across, 3.5 in tall, 5 in apart; Patrick, 12 Oct 2026,
 * "there are spikes for the ejection seats") and the bar between them: a post `deep` by `wide` each side, `out` from the middle, standing on the seat back's side
 * frames from `base` up and raked with the back. The left (+y) post's top is `leftOver` over the headbox's top, with a block `blockIn` turned inboard (the block
 * `blockH` tall); the right (-y) post goes up to `rightOver` over the headbox or `glassClear` under the glass, whichever is lower, with a pointed metal tip
 * `tip` long, and the left's top is kept `leftUnder` under the right's tip where the glass is low (the rear seat). A rod `rod` across joins the left post's top
 * to the right post `rodUnder` under its tip. Posts' depth and place along the seat are read off the delivered `seats` (the front seat's right tip 2.855 ft,
 * the rear's 2.459 ft; the rear's left top 2.36 ft).
 */
const SEAT_SPIKES = Object.freeze({
  wide: 0.05, deep: 0.04, fore: 0.22, out: 0.55, base: 2.014, leftOver: 0.15, rightOver: 1.0, glassClear: 0.08, leftUnder: 0.1, tip: 0.07, tipR: 0.025,
  blockIn: 0.045, blockH: 0.055, rod: 0.02, rodUnder: 0.15,
});
/**
 * The ejection seats' backs, feet (Patrick, 12 Oct 2026: back raked aft, headbox lower and closer to the head; sizes
 * estimates): each back's aft face `aft` from its seat's station (CT156_SEAT_X), its cushion `cushion` thick, the
 * headbox `deep` from that aft face, from z0 to z1 above the spinner's axis with the breakers `breakers` above it,
 * all of it leaning `rakeDeg` aft about the seat cushion's top (pivotZ). The front seat's; the rear seat's is the
 * same raised as its helmet is (ct156SeatRaiseFt). Until then upright, the headbox 0.36 ft deep from 2.1 to 2.7 ft up
 * in the cockpit and 0.46 ft deep with its top 2.27 ft up outside.
 */
export const CT156_SEAT_BACK_FT = Object.freeze({ aft: -0.972, cushion: 0.324, deep: 0.52, z0: 1.58, z1: 2.18, breakers: 0.25, pivotZ: -0.33, rakeDeg: 10 });
/** How far a seat's back has leant aft at height z above the front seat's cushion, feet (CT156_SEAT_BACK_FT). */
export function ct156SeatRakeFt(z) {
  const B = CT156_SEAT_BACK_FT;
  return Math.tan((B.rakeDeg * Math.PI) / 180) * (z - B.pivotZ);
}
/** How far seat i (0 front, 1 rear) sits above the front one, feet: as its helmet does. */
export const ct156SeatRaiseFt = (i) => (CT156_HELMET_Z[i] - CT156_HELMET_Z[0]) / FT;
/**
 * Seat i's headbox and the top of its back, seen from outside (Patrick, 11 Oct 2026): a dark box leaning aft as
 * CT156_SEAT_BACK_FT has it, from below the sill to the headbox's top, with the two canopy breakers on top, so from
 * outside it shows between the pilot's head and the canopy bow behind. Sizes estimates.
 */
function headboxGeometry(THREE, i) {
  const B = CT156_SEAT_BACK_FT, up = ct156SeatRaiseFt(i), x0 = CT156_SEAT_X[i] / FT + B.aft, foot = 1.04;
  // Every piece is built in the seat's own frame (feet: x forward of the headbox's aft face, y across, z up as the front seat's), then leant aft with the back and raised, in units.
  const lean = (g) => {
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) pos.setXYZ(k, (pos.getX(k) - ct156SeatRakeFt(pos.getZ(k))) * FT, pos.getY(k) * FT, (pos.getZ(k) + up) * FT);
    g.computeVertexNormals();
    return g;
  };
  // A prism from the outline [[y, z]] (feet) between x0 + a and x0 + b.
  const prism = (outline, a, b) => {
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(outline.map(([y, z]) => new THREE.Vector2(y, z))), { depth: b - a, bevelEnabled: false });
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) pos.setXYZ(k, x0 + a + pos.getZ(k), pos.getX(k), pos.getY(k)); // (x, y, z) to (z, x, y): a turn, so the faces keep their way round
    return lean(g);
  };
  const box = (a, b, ya, yb, za, zb) => lean(new THREE.BoxGeometry(b - a, yb - ya, zb - za).translate(x0 + (a + b) / 2, (ya + yb) / 2, (za + zb) / 2));
  // E5 (3d-work #66): the headbox tapered toward the top, 0.85 ft wide from the foot to 0.366 of the way up the headbox (z 1.8 on the front seat), narrowing to 0.35 ft at
  // the top, a six-sided section the back's depth (the cushion's, as the delivered `seats`) and rake; the headbox's height and place are kept (was a box 0.8 ft wide, 0.52 ft deep).
  const half = 0.425, topHalf = 0.175, kneeZ = B.z0 + 0.366 * (B.z1 - B.z0);
  const parts = [{ geometry: prism([[-half, foot], [half, foot], [half, kneeZ], [topHalf, B.z1], [-topHalf, B.z1], [-half, kneeZ]], 0, B.cushion), materials: [0] }];
  // E6: the latch posts, the right one's tip under the glass (the lower of 1.0 ft over the headbox and 0.08 ft under the glass), the left's top 0.15 ft over the headbox
  // (and 0.1 ft under the right's tip where the glass is low).
  const S = SEAT_SPIKES, yPost = S.out, fore = S.fore, aft = S.fore + S.deep;
  const glassAt = (xFt, yFt) => { // the glass's inside height over (x, y) in feet, in the front seat's z
    const x = xFt * FT, y = yFt * FT;
    let lo = canopyAt(x).base, hi = canopyAt(x).top;
    for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (ct156CanopyHalfWidth(x, mid) >= y) lo = mid; else hi = mid; }
    return lo / FT - up;
  };
  const postX = x0 + fore - ct156SeatRakeFt(B.z1 + 0.4); // roughly where the right post stands
  const headTop = B.z1, rightTop = Math.min(headTop + S.rightOver, glassAt(postX, yPost) - S.glassClear) - S.tip;
  const leftTop = Math.min(headTop + S.leftOver, rightTop + S.tip - S.leftUnder);
  parts.push({ geometry: box(fore, aft, yPost - S.wide / 2, yPost + S.wide / 2, S.base, leftTop), materials: [0] });
  parts.push({ geometry: box(fore, aft, -yPost - S.wide / 2, -yPost + S.wide / 2, S.base, rightTop), materials: [0] });
  parts.push({ geometry: box(fore, aft, yPost - S.wide / 2 - S.blockIn, yPost + S.wide / 2, leftTop - S.blockH, leftTop), materials: [0] }); // the block turned inboard
  const tip = new THREE.ConeGeometry(S.tipR, S.tip, 16).rotateX(Math.PI / 2).translate(x0 + (fore + aft) / 2, -yPost, rightTop + S.tip / 2); // the metal tip, pointing up
  parts.push({ geometry: lean(tip), materials: [0] });
  const rodZ0 = leftTop - S.blockH / 2, rodZ1 = rightTop - S.rodUnder, rodLen = Math.hypot(2 * yPost, rodZ1 - rodZ0);
  // The rod runs along y, climbing from the left post to the right.
  const rodDir = new THREE.Vector3(0, -2 * yPost, rodZ1 - rodZ0).normalize();
  const rodG = new THREE.CylinderGeometry(S.rod / 2, S.rod / 2, rodLen, 8).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), rodDir))
    .translate(x0 + (fore + aft) / 2, 0, (rodZ0 + rodZ1) / 2);
  parts.push({ geometry: lean(rodG), materials: [0] });
  return joinGeometries(THREE, parts);
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
  // its dark mouth is with the vents. Size and place estimates (the side view's lip 2.1 to 2.5 ft behind the tip).
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
  env.userData.ct156Env = true; // ct156-look.js swaps it for its sky when the model is first drawn

  // The fuselage with the painted fairing behind the canopy.
  geo.fuselage = joinGeometries(THREE, [{ geometry: fuselageGeometry(THREE), materials: [0] }, { geometry: fairingGeometry(THREE), materials: [0] }, { geometry: noseFairingGeometry(THREE), materials: [0] }, { geometry: chinIntake(), materials: [0] }]);
  // The camera's own ship only (setCockpitView): the fuselage open over the cockpit, and the tub under it (TS-155).
  geo.fuselageCut = joinGeometries(THREE, [{ geometry: fuselageGeometry(THREE, { cut: true }), materials: [0] }, { geometry: fairingGeometry(THREE), materials: [0] }, { geometry: noseFairingGeometry(THREE), materials: [0] }, { geometry: chinIntake(), materials: [0] }]);
  geo.tub = tubGeometry(THREE);
  // Wings, tailplane, ventral fin and dorsal fin in one geometry (the wings' leading edges a second slot), so the
  // airframe is one draw call; the dihedral is built in (wingBend).
  // The flight surfaces (SURFACES, ALL-35) are cut out of the wings, tailplane and fin and drawn apart, each turning on
  // its hinge (setControls); the right aileron and the right wing's flaps are the left's, mirrored.
  const bent = (g) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, ...wingBend([p.getX(i), p.getY(i), p.getZ(i)]));
    g.computeVertexNormals();
    return g;
  };
  const A = SURFACES.aileron, E = SURFACES.elevator, half = Math.abs(STAB[0].s), hornS = half * (1 - E.hornSpan);
  const wing = (side) => {
    const table = side > 0 ? WING : WING.map((s) => ({ ...s, s: -s.s })).reverse();
    const cut = side > 0 ? { s0: A.s0, s1: A.s1 } : { s0: -A.s1, s1: -A.s0 };
    const { body, parts } = airfoilSplit(THREE, table, { leBand: 0.07, cuts: [{ ...cut, f: A.hinge, part: 'aileron' }] });
    if (side > 0) geo.aileron = bent(parts.aileron);
    else parts.aileron.dispose();
    return bent(body);
  };
  const stab = airfoilSplit(THREE, STAB, { cuts: [1, -1].flatMap((k) => [
    { s0: k * E.s0, s1: k * hornS, f: E.hinge, part: 'elevator' },
    { s0: k * hornS, s1: k, f: E.horn, part: 'elevator' },
  ]) });
  geo.elevator = stab.parts.elevator;
  geo.airframe = joinGeometries(THREE, [
    { geometry: wing(1), materials: [0, 1] },
    { geometry: wing(-1), materials: [0, 1] },
    { geometry: stab.body, materials: [0] },
    { geometry: ventralGeometry(THREE), materials: [0] },
    { geometry: dorsalGeometry(THREE), materials: [0] },
  ]);
  // The fin, its leading edge a second slot: unpainted light grey on Patrick's photo of 156102 (width an estimate).
  const fin = airfoilSplit(THREE, FIN, { span: 'z', leBand: 0.12, cuts: [{ s0: SURFACES.rudder.z0, s1: 1, f: SURFACES.rudder.hinge, part: 'rudder' }] });
  geo.fin = sinkFinTop(fin.body);
  geo.rudder = sinkFinTop(fin.parts.rudder);
  Object.assign(geo, flapGeometries(THREE));
  geo.canopy = canopyGeometry(THREE);
  geo.frames = joinGeometries(THREE, [
    // The centre and rear hoops; the forward one is apart (bowFront), since from the seat ct156-cockpit.js draws it.
    ...CT156_FRAME_X.slice(1).map((x, i) => ({ geometry: hoopGeometry(THREE, x, CT156_FRAME_LEAN[i + 1], frameHalf(i + 1)), materials: [0] })),
    { geometry: railGeometry(THREE, 1), materials: [0] },
    { geometry: railGeometry(THREE, -1), materials: [0] },
  ]);
  geo.bowFront = hoopGeometry(THREE, CT156_FRAME_X[0], CT156_FRAME_LEAN[0], frameHalf(0));
  const floor = new THREE.CircleGeometry(1, 24);
  floor.scale(0.2, 0.05, 1);
  floor.translate(-0.035, 0, 0.046);
  geo.floor = floor;
  geo.coamings = coamingGeometry(THREE);
  // The two pilots apart, so the Cockpit view can leave out the one the camera sits in (setCockpitView), and the
  // ejection seats' headboxes behind them (the rear one lower, under the canopy's falling top).
  [geo.helmetFront, geo.helmetRear] = CT156_HELMET_X.map((x, i) => pilotGeometry(THREE, x, CT156_HELMET_Z[i]));
  geo.seats = joinGeometries(THREE, CT156_SEAT_X.map((x, i) => ({ geometry: headboxGeometry(THREE, i), materials: [0] })));
  // The exhaust stacks either side of the nose (photo), each with its dark opening facing aft (AETCMAN 11-248 Fig 9.17:
  // a fore-and-aft reference from #2; TS-156).
  geo.stubs = joinGeometries(THREE, [1, -1].flatMap((s) => [
    { geometry: stackGeometry(THREE, s), materials: [0] },
    { geometry: stackGeometry(THREE, s, true), materials: [1] },
    { geometry: stackLipGeometry(THREE, s), materials: [0] },
    { geometry: new THREE.CircleGeometry(1, 16).scale(STUB.halfTall * 0.85, STUB.halfWide * 0.85, 1).rotateY(-Math.PI / 2).translate(STUB.xBend + 0.002, s * STUB.yMid, STUB.z), materials: [1] },
    // The dark gap in the cowl round the stack's root (the 156102 photo shows it as a dark rim, widest over the stack).
    { geometry: ellipsoid(THREE, STUB.xBend + STUB.R, s * (fuseSurf(STUB.xBend + STUB.R, STUB.z) - 0.0045), STUB.z + 0.002, STUB.halfWide * 1.3, 0.003, STUB.halfTall * 1.45), materials: [1] },
  ]));
  // The position lights (TS-156; F6, F23): red on the left wingtip and green on the right, just behind each tip's leading
  // edge, and a steady white nav light at each tip's trailing edge. Small lit shapes, sizes estimates. No tail light.
  geo.lights = joinGeometries(THREE, [
    { geometry: ellipsoid(THREE, ...CT156_REFERENCE_POINTS.leftLight, 0.014, 0.007, 0.006), materials: [0] },
    { geometry: ellipsoid(THREE, ...CT156_REFERENCE_POINTS.rightLight, 0.014, 0.007, 0.006), materials: [1] },
    ...[1, -1].map((s) => ({ geometry: ellipsoid(THREE, WHITE_NAV_X, s * (WINGTIP.y + 0.002), WINGTIP.z, 0.008, 0.005, 0.004), materials: [2] })),
  ]);
  // The anti-collision strobes, one on each tip near the leading edge, flashing (turnProp): a mesh of their own.
  geo.strobes = joinGeometries(THREE, [1, -1].map((s) => ({ geometry: ellipsoid(THREE, STROBE_X, s * (WINGTIP.y + 0.002), WINGTIP.z, 0.01, 0.006, 0.005), materials: [0] })));
  // The landing light (left) and taxi light (right), on the wing's underside aft and inboard of each main strut; shown only with
  // all three legs down (setGear).
  {
    const L = gearLayout();
    const lamp = (s) => {
      const x = L.pivot[0] - GEAR_LIGHT.aftFt * GFT, y = L.pivot[1] - GEAR_LIGHT.inboardFt * GFT;
      const [bx, by, bz] = wingBend([x, y, wingSurfZ(x, y, -1) - 0.0015]);
      return { geometry: ellipsoid(THREE, bx, s * by, bz, GEAR_LIGHT.halfLongFt * GFT, GEAR_LIGHT.halfWideFt * GFT, 0.012 * GFT), materials: [0] };
    };
    geo.gearLights = joinGeometries(THREE, [lamp(1), lamp(-1)]);
  }
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
  // Blade 1 and its tip (the tip bands' 39 in out to the tip: PROP_TIP_BANDS), in the model's frame as the outside's
  // Blender file delivers them (3d-work chunk 8b): pointing +Y, feathered as the master's blade is modelled
  // (PROP_FEATHER_DEG), on its pitch axis through the hub (PROP_HUB_FT). The ship draws it four times, each arm turned
  // about the prop's axis and pitched about the blade's own (createCt156Model, PROP_PITCH). These flat plates are the
  // fallback until the file's blade attaches (attachExterior).
  // Dark (G2; Traffic's turning prop hides them: blurProp).
  const hubX = PROP_HUB_FT * GFT, tipStart = (39 / 12) * GFT;
  const blade = (v0, v1, w0, w1) => {
    const s = new THREE.Shape([[-w0, v0], [w0, v0], [w1, v1], [-w1, v1]].map(([a, b]) => new THREE.Vector2(a, b)));
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: false }).translate(0, 0, -0.002);
    g.rotateY(Math.PI / 2); // flat in the prop's disc: the chord along z, the depth along x, radial along y
    g.rotateY(rad(PROP_FEATHER_DEG)); // feathered: the chord turned to face the airflow, the leading edge forward
    g.translate(hubX, 0, 0);
    return joinGeometries(THREE, [{ geometry: g, materials: [0] }]);
  };
  geo.blade = blade(0.03, tipStart, 0.016, 0.0132);
  geo.bladeTip = blade(tipStart, 0.175, 0.0132, 0.012);
  // The landing and taxi lamp (GEAR_LAMP): the gear's Blender file's, in its hinge's frame; nothing until it attaches (the
  // old glow, geo.gearLights, shows meanwhile).
  geo.gearLamp = emptyGeometry(THREE);
  geo.cheat = cheatLine(THREE);
  // Off Patrick's photo of 156102 (11 Oct 2026, marked; places and sizes measured on it, estimates): the air inlet on
  // each side of the cowl's top just ahead of the windscreen, a dark wedge 0.053 units (1.2 ft) long, deep at its aft
  // end and running out forward. Its aft end a rounded mouth about 0.3 ft deep and 0.4 ft long, and a second vent
  // under the cheat line 7.9 to 8.5 ft behind the spinner's tip, about 0.45 ft deep, with a louvred strip of eight slats
  // across the cheat line over it (Patrick, 12 Oct 2026 02:49Z, "add this vent", marked on his photo of 126; sizes off
  // it, estimates).
  const mouth = (t) => (t < 0.3 ? 0.013 * (0.55 + 0.45 * Math.sin((Math.PI / 2) * (t / 0.3))) : 0.0018 + 0.0112 * ((1 - t) / 0.7) ** 1.3);
  const LOWER_VENT = { x0: 0.66 - 8.5 / 23.148, x1: 0.66 - 7.9 / 23.148, z0: -1.15 / 23.148, z1: -0.7 / 23.148, slats: 8 };
  const proud = (x, z) => fuseSurf(x, z) + 0.0003; // over the cheat line
  geo.vent = joinGeometries(THREE, [{ geometry: new THREE.CircleGeometry(1, 20).scale(0.007, 0.016, 1).rotateY(Math.PI / 2).translate(CHIN[0] + CHIN[3] + 0.0005, 0, CHIN[2]), materials: [0] }, ...[1, -1].flatMap((side) => [{
    geometry: skinStrip(THREE, Array.from({ length: 13 }, (_, i) => {
      const t = i / 12, x = 0.304 + 0.053 * t, top = topAt(x) - 0.0045 - 0.0027 * t;
      return [x, top, top - mouth(t)];
    }), side, 3, 0.0006), // close on the skin, so from the seat it doesn't stand off the cowl as a blade (it sat 0.7 in out; Patrick, 12 Oct 2026, "More clipping")
    materials: [0],
  }, {
    geometry: patch(THREE, (LOWER_VENT.x0 + LOWER_VENT.x1) / 2, (LOWER_VENT.z0 + LOWER_VENT.z1) / 2, LOWER_VENT.x1 - LOWER_VENT.x0, LOWER_VENT.z1 - LOWER_VENT.z0, side, fuseSurf),
    materials: [0],
  }, ...Array.from({ length: LOWER_VENT.slats }, (_, i) => ({
    geometry: patch(THREE, LOWER_VENT.x0 + ((LOWER_VENT.x1 - LOWER_VENT.x0) * (i + 0.5)) / LOWER_VENT.slats, cheatZ(), 0.0012, 0.0075, side, proud),
    materials: [0],
  }))])]);
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
  // The landing gear (GEAR, ALL-34): each part in its hinge's frame (each ship moves them, setGear) and the dark wells.
  Object.assign(geo, gearGeometries(THREE));
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

  // The small yellow dots on the fuselage's side (web photo research, 11 Oct 2026, RCAF CT-156 photos), one aft of the
  // roundel and one at the wing root. Places and sizes estimates off the photos. The yellow rescue stencil (a yellow
  // panel with a black arrow under the rear canopy) is left out (G7, Patrick 13 Oct 2026: "we got rid of that. do not
  // include the yellow rescue").
  tex.dot = keep(canvasTexture(THREE, 32, 32, (ctx, w) => {
    ctx.fillStyle = '#e8c21c'; ctx.beginPath(); ctx.arc(w / 2, w / 2, w * 0.42, 0, 7); ctx.fill();
  }, 4));

  const both = (make) => ({ 1: make(1), '-1': make(-1) });
  const decalGeo = {
    roundelSide: both((side) => patch(THREE, 0.66 - SIDE_MARKS.roundel.bt / SIDE_FT, SIDE_MARKS.roundel.z / SIDE_FT, SIDE_MARKS.roundel.size, SIDE_MARKS.roundel.size, side, fuseSurf)),
    // "Canada" and the rescue triangles just under the canopy's rail, as on Patrick's photo of 156102 (were 0.4 ft lower).
    // "Canada" about 1.75 ft long (G9, A18; the patch was 0.085 by 0.024 units, the text about 1.3 ft).
    // Then moved and sized off A24 (SIDE_MARKS.canada).
    canada: both((side) => patch(THREE, 0.66 - SIDE_MARKS.canada.bt / SIDE_FT, SIDE_MARKS.canada.z / SIDE_FT, SIDE_MARKS.canada.w, SIDE_MARKS.canada.h, side, fuseSurf)),
    // The triangles (each 7/8 of its patch) about 0.63 ft (forward), 0.55 ft (aft) and 0.32 ft (middle) wide on A18
    // (G8, Patrick 13 Oct 2026; the forward and aft patches were 0.022 units, 0.45 ft triangles).
    // Then moved off A24, the aft one to about 0.64 ft (SIDE_MARKS).
    triA: both((side) => patch(THREE, 0.66 - SIDE_MARKS.triFwd.bt / SIDE_FT, SIDE_MARKS.triFwd.z / SIDE_FT, SIDE_MARKS.triFwd.size, SIDE_MARKS.triFwd.size, side, fuseSurf)),
    triB: both((side) => patch(THREE, 0.66 - SIDE_MARKS.triAft.bt / SIDE_FT, SIDE_MARKS.triAft.z / SIDE_FT, SIDE_MARKS.triAft.size, SIDE_MARKS.triAft.size, side, fuseSurf)),
    triC: both((side) => patch(THREE, 0.66 - SIDE_MARKS.triMid.bt / SIDE_FT, SIDE_MARKS.triMid.z / SIDE_FT, SIDE_MARKS.triMid.size, SIDE_MARKS.triMid.size, side, fuseSurf)),
    dotAft: both((side) => patch(THREE, -0.385, cheatZ(-0.385) - 0.012, 0.005, 0.005, side, fuseSurf)),
    dotRoot: both((side) => patch(THREE, -0.1, -0.085, 0.005, 0.005, side, fuseSurf)),
    // The nose number on the cheat line between its two runs (the photo; was one digit, 0.02 units further forward), its
    // middle 5.5 ft behind the spinner's tip and 0.1 ft lower than before (G10, Patrick 13 Oct 2026, A24; was x 0.406).
    // Then 5.52 ft behind the tip and 0.79 ft under the axis, as A24 (NOSE_NUMBER).
    nose: both((side) => patch(THREE, 0.66 - NOSE_NUMBER.bt / SIDE_FT, NOSE_NUMBER.z / SIDE_FT, NOSE_NUMBER.wFt / SIDE_FT, NOSE_NUMBER.hFt / SIDE_FT, side, fuseSurf)),
    // Centred on the fin's mid-chord (nearly upright, the leading edge swept back and the trailing edge forward) and on
    // the fin above the tail cone (Patrick, 11 Oct 2026: "central on the vertical stab, not right on the edge"; was 0.03
    // units aft, at the trailing edge).
    tail: both((side) => patch(THREE, FIN_DECAL.x, FIN_DECAL.z, FIN_DECAL.size, FIN_DECAL.size, side, finSurf)),
    // Upper left wing: seen from above, nose up, right = -Y.
    roundelWing: wingPatch(THREE, WING_MARK[0], WING_MARK[1], 0.14, 0.14, [0, -1], [1, 0], 1),
    // Under the right wing (WING_MARK): seen from below with the nose up, right = +Y.
    roundelUnder: wingPatch(THREE, WING_MARK[0], -WING_MARK[1], 0.14, 0.14, [0, 1], [1, 0], -1),
    // On top of the right wing (WING_MARK): along the span, reading root to tip, the digits' tops toward the leading edge,
    // about 2.5 ft tall (G4, Patrick 13 Oct 2026; Moose Jaw frames and G01; was along the chord with an outline).
    wingNum: wingPatch(THREE, WING_MARK[0], -WING_MARK[1], WING_NUMBER.span, WING_NUMBER.chord, [0, -1], [1, 0], 1),
    // Under the left wing at the same place, the same digits the same way (G20, Patrick 13 Oct 2026; F06's 110, G02's 102):
    // seen from below with the nose up, root to tip runs to +Y.
    wingNumUnder: wingPatch(THREE, WING_MARK[0], WING_MARK[1], WING_NUMBER.span, WING_NUMBER.chord, [0, 1], [1, 0], -1),
    // On top of each wing outboard of the roundel or number, about 1 ft aft of the leading edge, the same two marks as
    // underneath (G5, Patrick 13 Oct 2026, G01): along the chord, the white disc forward.
    marksTop: both((side) => {
      const sec = sectionOf(WING, UPPER_MARKS.s);
      return wingPatch(THREE, sec.le - UPPER_MARKS.aft, side * UPPER_MARKS.s, UNDERWING_MARKS.size, UNDERWING_MARKS.size, [1, 0], [0, 1], 1);
    }),
    // Under each wing beside the pitot (UNDERWING_MARKS): along the chord, the white disc forward.
    marks: both((side) => {
      const sec = sectionOf(WING, UNDERWING_MARKS.s);
      return wingPatch(THREE, sec.le - UNDERWING_MARKS.x * sec.chord - UNDERWING_MARKS.size / 2 + 0.004, side * (UNDERWING_MARKS.s - 0.006), UNDERWING_MARKS.size, UNDERWING_MARKS.size, [1, 0], [0, 1], -1);
    }),
    // The US paints' marks (US_MARKS, ALL-45, proposed): small patches, drawn only by the USAF and USN paints.
    usInsignia: both((side) => patch(THREE, 0.66 - US_MARKS.insignia.bt / SIDE_FT, US_MARKS.insignia.z / SIDE_FT, US_MARKS.insignia.wFt / SIDE_FT, US_MARKS.insignia.hFt / SIDE_FT, side, fuseSurf)),
    usName: Object.fromEntries(Object.entries(US_MARKS.name).map(([paint, m]) => [paint, both((side) => patch(THREE, 0.66 - m.bt / SIDE_FT, m.z / SIDE_FT, m.wFt / SIDE_FT, m.hFt / SIDE_FT, side, fuseSurf))])),
    usNose: both((side) => patch(THREE, 0.66 - US_MARKS.nose.bt / SIDE_FT, US_MARKS.nose.z / SIDE_FT, US_MARKS.nose.wFt / SIDE_FT, US_MARKS.nose.hFt / SIDE_FT, side, fuseSurf)),
    // The star-and-bar on the upper left wing and under the right wing: the Harvard roundel's places and directions (roundelWing, roundelUnder).
    usWingTop: wingPatch(THREE, WING_MARK[0], WING_MARK[1], US_WING_MARK.span, US_WING_MARK.chord, [0, -1], [1, 0], 1),
    // The triangle on the upper surface at each tip (US_TIP_TRI), its right angle at the outer front corner; picture up along the span outward.
    usTip: both((side) => {
      const s = TIP_S - US_TIP_TRI.inTip - US_TIP_TRI.size / 2, sec = sectionOf(WING, s);
      return wingPatch(THREE, sec.le - US_TIP_TRI.aftLe - US_TIP_TRI.size / 2, side * s, US_TIP_TRI.size, US_TIP_TRI.size, [1, 0], [0, side], 1);
    }),
    // "USAF" on the upper left wing (US_WING_TEXT), as the Harvard roundel's direction: reading from the tip to the root.
    usWingText: wingPatch(THREE, sectionOf(WING, US_WING_TEXT.s).le - US_WING_TEXT.aftLe, US_WING_TEXT.s, US_WING_TEXT.span, US_WING_TEXT.chord, [0, -1], [1, 0], 1),
    usWingUnder: wingPatch(THREE, WING_MARK[0], -WING_MARK[1], US_WING_MARK.span, US_WING_MARK.chord, [0, 1], [1, 0], -1),
  };
  const keepDecal = (v) => {
    if (v.isBufferGeometry) keep(v);
    else if (v[1]) { keep(v[1]); keep(v['-1']); }
    else Object.values(v).forEach(keepDecal);
  };
  Object.values(decalGeo).forEach(keepDecal);

  const two = THREE.DoubleSide; // both faces lit the right way round, whichever way a part's triangles were wound
  const mat = (params) => keep(new THREE.MeshStandardMaterial({ fog: false, ...params }));
  // The tip bands along blade 1's span (+Y, model units from the prop's axis), in linear colour as the shader takes it.
  const tipBands = (m) => paintBands(m, { axis: 'y', bands: PROP_TIP_BANDS.map(([a, b, c]) => {
    const col = new THREE.Color(c);
    return [(a / 12) * GFT, (b / 12) * GFT, [col.r, col.g, col.b]];
  }) });
  // Satin paint: a light, soft clear coat over the colour (G19, Patrick 13 Oct 2026, A18 and A16: satin, not the strong
  // gloss of clear coat 1 and roughness 0.12 it had), read under the app's sky look (ct156-look.js, ALL-41).
  const gloss = (params) => keep(new THREE.MeshPhysicalMaterial({ fog: false, side: two, clearcoat: 0.4, clearcoatRoughness: 0.3, envMap: env, ...params }));
  const decalMat = (map) => keep(new THREE.MeshStandardMaterial({
    map, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.55, metalness: 0, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.6, fog: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  const mats = {
    env,
    navy: gloss({ color: NAVY, roughness: 0.42, metalness: 0.15, envMapIntensity: 0.8 }),
    cheat: mat({ color: '#f1f4f8', roughness: 0.45, emissive: '#ffffff', emissiveIntensity: 0.3, side: two, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    // Self-lit 0.1 (was 0.2): with the old dirt haze gone the white clipped to pure white over 1 % of a close view (4.4 check).
    wingLe: gloss({ color: '#f1f4f8', roughness: 0.4, emissive: '#ffffff', emissiveIntensity: 0.1, envMapIntensity: 0.5 }),
    finLe: mat({ color: '#c3c9cf', roughness: 0.5, side: two }),
    vent: mat({ color: '#07090b', roughness: 0.9, side: two, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    // The floors of the speed brake's slots (the file's speedBrake|1, layout 2): a vent's dark, without its offset, as
    // they sit recessed in the plate.
    slotFloor: mat({ color: '#07090b', roughness: 0.9, side: two }),
    // The antennas (geo.antenna's slots): light grey (lighter, as the paddles on Patrick's 156102 photo; was #a8aaa4),
    // white, and dark for the painted TAS blades and the tie-down rings.
    // Slots 3 to 5 (3d-work slice 4.1, fix row W4): the nav lights' lenses, red left and green right, and the tail
    // light's, white: coloured glass, lit from inside so they glow whatever the sun (the code's flat ovals' colours), and
    // drawn without the outside's pictures (ct156NoPictures).
    antenna: [mat({ color: '#c4c5bf', roughness: 0.5, side: two }), mat({ color: '#f1f3f5', roughness: 0.45, side: two }), mat({ color: '#15181d', roughness: 0.45, metalness: 0.3, side: two }),
      ...['#ff2b2b', '#2bff6a', '#ffffff'].map((c) => {
        const lens = keep(new THREE.MeshPhysicalMaterial({ color: c, emissive: c, emissiveIntensity: 1.6, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, envMap: env, envMapIntensity: 1, side: two, fog: false }));
        lens.userData.ct156NoPictures = true;
        return lens;
      })],
    beacon: mat({ color: '#8a6326', roughness: 0.25, metalness: 0.2, envMap: env, envMapIntensity: 0.8 }),
    chrome: mat({ color: '#f2f5f8', roughness: 0.1, metalness: 1, envMap: env, envMapIntensity: 1.2 }),
    // Bare, heat-stained steel, as on Patrick's photo of 156102 (was a dark grey that read as paint).
    // Lighter and shinier, so the stacks read as metal pipes and not painted tanks (156102 and 156115 photos; by eye).
    exhaust: mat({ color: '#a8988a', roughness: 0.32, metalness: 0.85, envMap: env, envMapIntensity: 0.9 }),
    // The stacks' sooty insides: a dull brown-black, grained and blotchy, not a smooth shiny black (Patrick, 12 Oct 2026,
    // pinned on a stack's open end: "give the whole interior a texture, its not quite right"; was the blades' black).
    soot: paintGrain(mat({ color: '#2b251d', roughness: 0.95 }), { unit: 1 / FT, grain: 0.02, bump: 0.0015, speckle: 0.15, mottle: 0.2, mottleSize: 0.12, wear: 0, shine: 0.05 }),
    glass: canopyGlass(mat({ color: '#1d2a36', transparent: true, opacity: 0.4, roughness: 0.04, metalness: 0.6, envMap: env, envMapIntensity: 1.4, depthWrite: false, side: two })),
    // The canopy seen from inside (setCockpitView): a faint clear tint, no reflections, so the sky shows through it.
    glassInside: keep(new THREE.MeshBasicMaterial({ color: '#cfe3f2', transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, fog: false })),
    frame: mat({ color: '#0c1017', roughness: 0.5, side: two }),
    floor: mat({ color: '#0d1118', roughness: 0.9, side: two }),
    // The cockpit tub (setCockpitView; TS-155, TS-157): a dark charcoal floor and walls, as US Navy T-6A cockpit photos
    // show (Patrick, 11 Oct 2026 22:06Z; were mid and light grey off Dad's reference pictures). Shades estimates.
    // Both with the cockpit's paint grain (ct156-cockpit.js INTERIOR_GRAIN, Patrick, 12 Oct 2026: "give the whole
    // interior a texture").
    tubFloor: paintGrain(mat({ color: '#26292c', roughness: 0.95, side: two }), { unit: 1 / FT }),
    // The walls lighter and cooler, as daylit CT-156 photos show them (G15, Patrick 13 Oct 2026: D03, D10, the Moose Jaw
    // frames; ct156-cockpit.js WALL_GREY; were '#5a5e63' like the panels from 12 Oct 2026, and '#2f3236' before).
    tubWall: paintGrain(mat({ color: '#858c9a', roughness: 0.85, side: two }), { unit: 1 / FT }),
    // The pilots (pilotGeometry): one material per slot of CT156_PILOT_SLOTS (helmet, visor, mask, hose, flight suit, vest and
    // collar, harness, gloves, and the mask's grey-blue parts, black hardware, vest panel and skin; colours estimates);
    // and the seats' headboxes.
    pilot: CT156_PILOT_SLOTS.map((s) => mat({
      color: s.color, roughness: s.roughness, metalness: s.metalness, side: s.side === 'double' ? two : THREE.FrontSide,
      ...(s.env ? { envMap: env, envMapIntensity: s.env } : {}),
      ...(s.opacity < 1 ? { transparent: true, opacity: s.opacity, depthWrite: false } : {}),
    })),
    headbox: mat({ color: '#25282c', roughness: 0.6 }),
    // The outside glareshields: satin dark grey, a little lighter and glossier than the headboxes so they show through
    // the tinted glass (Patrick, 12 Oct 2026; they were the headboxes' colour). Shade an estimate.
    coaming: mat({ color: '#3a3e44', roughness: 0.4, metalness: 0.1 }),
    blade: mat({ color: '#0a0c10', roughness: 0.6 }),
    // The blades dark charcoal to the tip, no red (G2, Patrick 13 Oct 2026: the red on 156107's prop is fabric tip covers
    // tied to the intake cover, on the ground only, F22; the blades are dark to the tip on A18). The tips keep their own
    // geometry (blurProp hides both), the blades' colour.
    tip: mat({ color: PROP_DARK, roughness: 0.6 }),
    // The turning prop's blades, half see-through so they read as a blur (PROP_TURN); the tips banded red, white and red
    // (PROP_TIP_BANDS).
    propBlade: mat({ color: PROP_DARK, roughness: 0.6, transparent: true, opacity: 0.45, depthWrite: false, side: two }),
    propTip: tipBands(mat({ color: PROP_DARK, roughness: 0.6, transparent: true, opacity: 0.45, depthWrite: false, side: two })),
    disc: keep(new THREE.MeshBasicMaterial({ color: '#dcebff', transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, fog: false })),
    // The landing gear (gearMain's and gearNose's slots): light grey legs, the tyres, the wheels' hubs and the chrome
    // pistons; and the doors' insides, primer grey (colours estimates off Patrick's photos of 104 and 126).
    gear: [
      mat({ color: '#c9cdd1', roughness: 0.45, metalness: 0.3, envMap: env, envMapIntensity: 0.6 }),
      mat({ color: '#18191b', roughness: 0.92 }),
      mat({ color: '#d4d7da', roughness: 0.4, metalness: 0.45, envMap: env, envMapIntensity: 0.7 }),
      mat({ color: '#eef1f4', roughness: 0.12, metalness: 1, envMap: env, envMapIntensity: 1.1 }),
    ],
    gearInside: mat({ color: '#9da3a8', roughness: 0.6, side: two }),
    // A gear well's depths: dark, but lighter than a vent's, so its ribs read as structure (Patrick's photo of 123).
    gearWell: mat({ color: '#2a2e33', roughness: 0.8, side: two }),
    // The position lights, lit whatever the sun (TS-156): red, green, white.
    lights: ['#ff2b2b', '#2bff6a', '#ffffff'].map((color) => keep(new THREE.MeshBasicMaterial({ color, fog: false }))),
    // The landing and taxi lights' lenses, a warm white (an estimate), and the stopped prop's blades: the same colours as the
    // turning prop's, but solid (a stopped blade is not a blur; setPropStopped).
    lamp: keep(new THREE.MeshBasicMaterial({ color: GEAR_LAMP.lit, fog: false })),
    propBladeStill: mat({ color: PROP_DARK, roughness: 0.6, side: two }),
    propTipStill: tipBands(mat({ color: PROP_DARK, roughness: 0.6, side: two })),
    // The landing and taxi lamps as the Blender file draws them (GEAR_LAMP's colours): slot 0 the housing, 1 the lens,
    // 2 the LEDs, off; lit, the lens and LEDs are `lamp` (setGear).
    gearLamp: [
      mat({ color: GEAR_LAMP.housing, roughness: 0.35, metalness: 0.6, envMap: env, envMapIntensity: 0.8 }),
      mat({ color: GEAR_LAMP.lens, roughness: 0.12, metalness: 0.2, envMap: env, envMapIntensity: 0.9 }),
      mat({ color: GEAR_LAMP.led, roughness: 0.5 }),
    ],
    roundel: decalMat(tex.roundel),
    canada: decalMat(tex.canada),
    tri: decalMat(tex.tri),
    marks: decalMat(tex.marks),
    dot: decalMat(tex.dot),
  };
  // The US paints' materials (ALL-45, proposed): white upper surfaces, the lower fuselage and wings by the shader's zones
  // (paintZones: the fuselage below the colour break; the wings where the surface faces down), the pinstripe and the glare panel.
  const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
  const usWhite = { color: US_WHITE, roughness: 0.4, metalness: 0.12, envMapIntensity: 0.6 };
  mats.usWhite = gloss(usWhite);
  mats.usFrame = mat({ color: '#e6e9ec', roughness: 0.5, side: two });
  mats.us = {};
  for (const [paint, def] of Object.entries(US_PAINTS)) {
    mats.us[paint] = {
      lower: gloss({ color: def.lower, roughness: 0.42, metalness: 0.12, envMapIntensity: 0.7 }),
      fuselage: paintZones(gloss(usWhite), { zones: [
        [`ct156Aa( ${US_BREAK} - zp.z )`, lin(def.lower)],
        ...(def.pinstripe ? [[`ct156Aa( zp.z - ${US_BREAK} ) * ct156Aa( ${US_BREAK} + 0.0018 - zp.z )`, lin(def.pinstripe)]] : []),
        [US_GLARE, lin(US_BLACK)],
      ] }),
      wing: def.darkWing
        ? gloss({ color: def.lower, roughness: 0.42, metalness: 0.12, envMapIntensity: 0.7 })
        : paintZones(gloss(usWhite), { zones: [['ct156Aa( -0.12 - zn.z )', lin(def.lower)]] }),
    };
  }
  const kit = {
    THREE, geo, decalGeo, mats, refs: 0, own, disposed: false, offLevel: () => {},
    // A decal material from a canvas drawing, made the first time a paint asks for it and kept in the kit (the US paints' marks).
    lazyDecal: (key, w, h, draw, sharp = 1) => (mats[key] ??= decalMat(keep(canvasTexture(THREE, w, h, draw, sharp)))),
    dispose: () => ((kit.disposed = true), kit.offLevel(), own.forEach((o) => o.dispose())),
  };
  kit.shadedCopies = []; // [copy, the list that owns it]: the shaded materials a level switch frees
  // Each outside part's fingerprint of the code's own shape, before the file's shape takes its place: read by the
  // export scripts in tools/blender/ (ct156ExteriorPieces); since plan 3.4 the app no longer compares it with the file.
  kit.hashes = Object.fromEntries(EXTERIOR_PARTS.map((name) => [name, ct156PiecesHash([{ geometry: geo[name] }])]));
  kit.exteriorGeos = new Set([...EXTERIOR_PARTS, ...LAYOUT2_EXTERIOR].filter((name) => !NO_PICTURE.has(name)).map((name) => geo[name]));
  // The files' slot 1 on parts the code draws in one colour (layout 2): the static wicks on the ailerons, elevator and
  // rudder, dark as the antennas' slot 2 (the fin's wicks were there), and the floors of the speed brake's slots. A ship's
  // mesh of one of these takes [its colour, this] once the outside's file is in (add, attachExterior).
  kit.slotExtras = new Map([[geo.aileron, mats.antenna[2]], [geo.elevator, mats.antenna[2]], [geo.rudder, mats.antenna[2]], [geo.speedBrake, mats.slotFloor]]);
  kit.exteriorMeshes = new Set();
  kit.shaded = new WeakMap();
  kit.shadedMirrored = new WeakMap(); // the mirrored parts' copies (shadeMesh)
  kit.ao = null;
  kit.skin = {};
  kit.navMeshes = new Set(); // every ship's flat nav ovals (geo.lights), hidden once the file's lenses are in
  kit.lensesDelivered = false;
  // The gear from its own Blender file (ALL-34), the same way, swapped in only all together.
  kit.gearHashes = Object.fromEntries(GEAR_PARTS.map((name) => [name, ct156PiecesHash([{ geometry: geo[name] }])]));
  kit.gearGeos = new Set(GEAR_PARTS.map((name) => geo[name]));
  kit.gearMeshes = new Set();
  kit.gearShaded = new WeakMap();
  kit.gearAo = null;
  // The prop's blades (PROP_PARTS) and the gear lamps, taken from the files when they have them: their meshes on every
  // ship, shaded by the files' pictures once in; and every ship's lamps, to swap the glow for the file's lamp.
  kit.propGeos = new Set([geo.blade, geo.bladeTip]);
  kit.propMeshes = new Set();
  kit.propDelivered = false;
  kit.lampMeshes = new Set();
  kit.lampShips = new Set();
  kit.lampDelivered = false;
  if (typeof window !== 'undefined') {
    attachFiles(kit);
    // A level switch under ships already made: back to plain paint, the old level's copies and pictures freed, the new level's loaded.
    kit.offLevel = onCt156Level(() => {
      unshadeKit(kit);
      attachFiles(kit);
    });
  }
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
/**
 * Where a stopped prop's blades rest, degrees off the spinner's + (F27, Patrick 14 Oct 2026: 45, an even X, as 3d-work's
 * sources.md reads A18 with its camera and photo 14 straight ahead, 43 to 45). Was 40, and 22 before that.
 */
export const PROP_REST_DEG = 45;
/**
 * The blades' hub: where their pitch axes cross the prop's axis, feet ahead of the model's origin (3d-work hinge.blade1,
 * F26: 13.71 ft, 0.78 of the spinner's length behind its tip, off A18 and A27; an estimate, +-0.05 ft). The code's own
 * blades sat at 13.59 ft.
 */
const PROP_HUB_FT = 13.71;
/** The master's blade is modelled feathered, 86 degrees at the 30 in station (F26; the type certificate, case study p081). */
const PROP_FEATHER_DEG = 86;
/**
 * The blades' pitch, degrees about each blade's outward axis from the master's feathered blade, positive the leading edge
 * forward (3d-work hinge.blade1): stopped 0, feathered (Patrick, 12 Oct 2026: "a stopped prop, feathered, when the engine
 * is off"); running -63, 23 degrees at the 30 in station (F28; Patrick 14 Oct 2026); featherS, how long the blades take
 * to turn between the two when the prop stops or starts (setPropStopped; an estimate).
 */
export const PROP_PITCH = Object.freeze({ stoppedDeg: 0, runningDeg: -63, featherS: 1.5 });
/**
 * The blades' tips, red, white and red (G2's paint; Patrick 14 Oct 2026, over G2's dark to the tip): inches out from the
 * hub along the blade, from 39 in (where bladeTip starts) to the tip at 48.5 in. Widths off A27 (156101) and photo 14
 * (Patrick's CT-156): red 2.3 in, white 4.5 in, red 2.7 in at the tip (3d-work sources.md; estimates, +-0.5 in). The red
 * and white the roundel's (estimates).
 */
const PROP_TIP_BANDS = Object.freeze([[39, 41.3, '#d2202c'], [41.3, 45.8, '#f4f6f8'], [45.8, 49, '#d2202c']]);
function turnProp(root) {
  const d = root.userData.ct156;
  const now = globalThis.performance?.now?.() ?? Date.now();
  const dt = d.propAt === null ? 0 : Math.max(0, now - d.propAt) / 1000;
  d.propAt = now;
  d.propTurn = (d.propTurn + Math.min(dt * PROP_TURN.revPerSec * 2 * Math.PI, rad(PROP_TURN.stepDeg))) % (2 * Math.PI);
  if (d.strobes) {
    const t = (now / 1000 + d.strobePhase) % CT156_STROBE.periodS;
    const { flashS, gapS } = CT156_STROBE;
    d.strobes.visible = t < flashS || (t >= flashS + gapS && t < 2 * flashS + gapS);
  }
  // The blades feather as the prop stops and come back to running pitch as it starts, over PROP_PITCH.featherS.
  const pitchTo = d.propStopped ? PROP_PITCH.stoppedDeg : PROP_PITCH.runningDeg;
  if (d.propPitch && d.pitchDeg !== pitchTo) {
    const step = (Math.abs(PROP_PITCH.runningDeg - PROP_PITCH.stoppedDeg) / PROP_PITCH.featherS) * dt;
    d.pitchDeg = Math.abs(pitchTo - d.pitchDeg) <= step ? pitchTo : d.pitchDeg + Math.sign(pitchTo - d.pitchDeg) * step;
    for (const p of d.propPitch) p.rotation.y = rad(d.pitchDeg);
  }
  if (d.propStopped) {
    if (d.prop) d.prop.rotation.x = rad(PROP_REST_DEG);
    return;
  }
  if (d.prop) d.prop.rotation.x = rad(PROP_REST_DEG) + d.propTurn;
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
 * color: CSS colour of the ship, for the 'ship' paint (everything in it); 'harvard' is navy all over (G14, 13 Oct 2026).
 * number: the ship number, drawn on the fin and nose ('harvard' and 'usn'; on the 'usaf' fin only as the serial).
 * paint: 'harvard' (default, and for any unknown value), 'ship', 'usaf' or 'usn' (the US markings, ALL-45, proposed).
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
  g.rotation.y = rad(CT156_DATUM_DEG); // nose-down inside the root, which is set to the EADI's attitude (CT156_DATUM_DEG)
  root.add(g);
  addLookProbe(THREE, root); // the shared look of the model (ct156-look.js): its materials get the sky and the Neutral curve when first drawn
  const detail = new THREE.Group(); // the fine detail, shown only up close (near and far, above)
  g.add(detail);
  const add = (geometry, material, parent = g) => {
    const m = new THREE.Mesh(geometry, material);
    parent.add(m);
    // Real-time shadows where a view switches them on (aircraft-shadows.js): the solid parts cast them, glass, decals
    // and the prop's disc don't; everything takes them.
    m.castShadow = ![material].flat().some((mat) => mat?.transparent);
    m.receiveShadow = true;
    const extra = kit.slotExtras.get(geometry);
    if (extra) m.userData.ct156Slots = [material, extra];
    if (kit.exteriorGeos.has(geometry)) { // a Blender part (ALL-33): shaded by the file's picture once it is in
      m.userData.ct156Mine = mine;
      kit.exteriorMeshes.add(m);
      if (kit.ao) {
        if (extra) m.material = m.userData.ct156Slots;
        shadeMesh(kit, m);
      }
    } else if (kit.gearGeos.has(geometry)) { // the gear's Blender part (ALL-34), shaded by its own picture
      m.userData.ct156Mine = mine;
      kit.gearMeshes.add(m);
      if (kit.gearAo) shadeMesh(kit, m, true);
    } else if (kit.propGeos.has(geometry)) { // the prop from the outside's file (PROP_PARTS), once it is in
      m.userData.ct156Mine = mine;
      kit.propMeshes.add(m);
      if (kit.propDelivered && kit.ao) shadeMesh(kit, m);
    } else if (geometry === geo.gearLamp) { // the lamps from the gear's file (showLamps shades them)
      m.userData.ct156Mine = mine;
      kit.lampMeshes.add(m);
    }
    return m;
  };
  // The landing gear (GEAR, ALL-34): each part on its hinge (setGear turns them), the right side the left's mirror,
  // hidden while the gear is up, so a ship looks as it always has until its module lowers the gear.
  const addGear = (paintMat) => {
    const L = gearLayout();
    const doorMats = [paintMat, mats.gearInside];
    const wellMats = [mats.gearWell, mats.gearInside];
    const gear = new THREE.Group();
    gear.name = 'ct156-gear';
    gear.visible = false;
    g.add(gear);
    const hinge = (p, s, parent = gear) => { // a hinge at p (its y mirrored on the right), turning in the left side's frame
      const at = new THREE.Group();
      at.position.set(p[0], s * p[1], p[2]);
      parent.add(at);
      const mirror = new THREE.Group();
      mirror.scale.y = s;
      at.add(mirror);
      const turn = new THREE.Group();
      mirror.add(turn);
      return turn;
    };
    const sides = [1, -1].map((s) => {
      const leg = hinge(L.pivot, s);
      leg.name = `ct156-gear-main-${s > 0 ? 'left' : 'right'}`;
      add(geo.gearMain, mats.gear, leg);
      const splay = new THREE.Group();
      splay.position.set(...L.legDoorHinge);
      leg.add(splay);
      add(geo.gearMainDoor, doorMats, splay);
      const door = hinge(L.inboardHinge, s);
      add(geo.gearInboardDoor, doorMats, door);
      const k = s > 0 ? 'L' : 'R';
      return { leg, splay, door, legWell: add(geo[`gearLegWell${k}`], wellMats, gear), inboardWell: add(geo[`gearInboardWell${k}`], wellMats, gear) };
    });
    const nose = new THREE.Group();
    nose.name = 'ct156-gear-nose';
    nose.position.set(...L.nosePivot);
    gear.add(nose);
    add(geo.gearNose, mats.gear, nose);
    const noseDoors = [1, -1].map((s) => {
      const door = hinge(L.noseHinge, s);
      add(geo.gearNoseDoor, doorMats, door);
      return door;
    });
    // The landing (left) and taxi (right) lamps, each on its hinge (GEAR_LAMP; the right the left's mirror), turned up
    // into the wing with the legs (setGear); drawn once the gear's file has its lamp (showLamps).
    const lampTurns = [1, -1].map((s) => hinge(gearLampHinge(), s));
    const lampMeshes = lampTurns.map((turn) => add(geo.gearLamp, mats.gearLamp, turn));
    return { group: gear, sides, nose, noseDoors, noseWell: add(geo.gearNoseWell, wellMats, gear), lampTurns, lampMeshes, t: 0 };
  };

  // The flight surfaces (SURFACES, ALL-35): each on its hinge (setControls turns them), the right aileron and flaps the
  // left's mirror; neutral and flaps up, so a ship looks as it always has until its module moves them.
  const addSurfaces = (paintMat, rudderMat) => {
    const L = surfaceLayout();
    const pivot = (name, geometry, material, parent = g) => {
      const { a } = L[name];
      const at = new THREE.Group();
      at.position.set(...a);
      parent.add(at);
      add(geometry, material, at).position.set(-a[0], -a[1], -a[2]);
      return at;
    };
    const mirror = new THREE.Group();
    mirror.scale.y = -1;
    g.add(mirror);
    const flapMats = [paintMat, mats.gearInside];
    const sides = [g, mirror].map((parent) => ({
      aileron: pivot('aileron', geo.aileron, paintMat, parent),
      flaps: Object.keys(FLAP_PIECES).map((name) => pivot(name, geo[name], flapMats, parent)),
      wells: Object.keys(FLAP_PIECES).map((name) => {
        const well = add(geo[`${name}Well`], mats.vent, parent);
        well.visible = false;
        return well;
      }),
    }));
    return { sides, elevator: pivot('elevator', geo.elevator, paintMat), rudder: pivot('rudder', geo.rudder, rudderMat) };
  };

  let fuselage, canopy, navLights, helmetFront = null, helmetRear = null, seats = null, floor = null, prop = null, propPitch = null, bowFront = null, disc = null, speedBrake = null, gear = null, surfaces = null, coamings = null, strobes = null, gearLights = null;
  // The speed brake (SPEED_BRAKE), up close only: its plate on a hinge at its front edge, lying along the belly when shut
  // (setSpeedBrake turns it down), and the dark well behind it, shown while it is open.
  const addSpeedBrake = (paintMat) => {
    const { openDeg } = SPEED_BRAKE;
    const { at, shut } = speedBrakeHinge();
    const hinge = new THREE.Group();
    hinge.position.set(...at);
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
    const finPaint = m(base.clone().lerp(new THREE.Color('#ffffff'), 0.15));
    add(geo.fin, finPaint);
    surfaces = addSurfaces(light, finPaint);
    // Solid dark glass, one canopy (Patrick, 5 Oct: the two see-through bubbles overlapped as a "ghost double canopy").
    canopy = add(geo.canopy, m('#2c4a66', { roughness: 0.12, metalness: 0.45 }));
    add(geo.spinner, m('#20242a', { roughness: 0.4 }));
    add(geo.spinnerRing, mats.blade);
    // Up close only: the position lights, the exhaust stacks, the canopy's frames and the serial on the fin (TS-156).
    navLights = add(geo.lights, mats.lights, detail);
    strobes = add(geo.strobes, mats.lights[2], detail);
    gearLights = add(geo.gearLights, mats.lamp, detail);
    gearLights.visible = false; // lit only with all three legs down (setGear)
    add(geo.stubs, [mats.exhaust, mats.soot], detail);
    add(geo.frames, mats.frame, detail);
    seats = add(geo.seats, mats.frame, detail);
    bowFront = add(geo.bowFront, mats.frame, detail);
    speedBrake = addSpeedBrake(light);
    gear = addGear(light);
    const serialTex = own(canvasTexture(THREE, 512, 512, serialCanvas(number)));
    const serialMat = own(new THREE.MeshBasicMaterial({ map: serialTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    for (const s of ['1', '-1']) add(decalGeo.tail[s], serialMat, detail);
    disc = add(geo.disc, mats.disc);
  } else {
    const tailNumber = ct156TailNumber(number);
    const us = US_PAINTS[paint] ? { paint, def: US_PAINTS[paint], mats: mats.us[paint] } : null; // the USAF and USN markings (ALL-45, proposed); null is the Harvard
    // The wing numbers plain white, no outline, their digits about 2.5 ft tall in their 2.55 ft patch (G4, G20).
    const wingTex = us ? null : own(canvasTexture(THREE, 380, 220, (ctx, w, h) => plainDigits(ctx, tailNumber, w, h, 0.97), 2));
    // The nose number plain white, 0.57 ft tall with plain-bar 1s (noseDigits; Patrick 13 Oct 2026, from A24, over G10's 0.37 ft).
    const noseTex = us ? null : own(canvasTexture(THREE, 256, 128, (ctx, w, h) => noseDigits(ctx, tailNumber, w, h), 2));
    const decal = (tx) => own(new THREE.MeshStandardMaterial({
      map: tx, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.55, metalness: 0, emissive: '#ffffff', emissiveMap: tx, emissiveIntensity: 0.6, fog: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));

    // Always drawn: the airframe, the canopy glass, the cheat line, the spinner and the prop disc.
    // The US paints (us) differ only in the colours of these parts and in the marks below; the Harvard is the same as it always was.
    fuselage = add(geo.fuselage, us ? us.mats.fuselage : mats.navy);
    add(geo.airframe, [us ? us.mats.wing : mats.navy, us?.def.darkWing ? us.mats.lower : mats.wingLe]);
    // The fin and rudder navy like the rest, as the real ship (G14, Patrick 13 Oct 2026; were the ship's colour).
    add(geo.fin, [us ? mats.usWhite : mats.navy, mats.finLe]);
    surfaces = addSurfaces(us ? us.mats.wing : mats.navy, us ? mats.usWhite : mats.navy);
    if (!us) add(geo.cheat, mats.cheat);
    add(geo.spinner, mats.chrome);
    add(geo.spinnerRing, mats.blade);
    disc = add(geo.disc, mats.disc);
    // Up close only: the decals, the cockpit, the frames, the exhausts and the blades.
    if (us) {
      // The star-and-bar on the rear fuselage, both sides, and on the upper left wing and under the right wing; the lettering
      // on the side; the tail marks; and for the USN the side number on the nose (US_MARKS, estimates).
      const insignia = kit.lazyDecal('usInsignia', 512, 256, usInsigniaCanvas, 2);
      add(decalGeo.usWingTop, insignia, detail);
      add(decalGeo.usWingUnder, insignia, detail);
      // The formation-reference triangle on each upper wing tip, and (USAF) "USAF" on the upper left wing.
      const tip = kit.lazyDecal(`usTip-${paint}`, 128, 128, (ctx, w, h) => {
        ctx.fillStyle = us.def.tip;
        ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(w, h); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
      }, 2);
      for (const s of ['1', '-1']) add(decalGeo.usTip[s], tip, detail);
      if (us.def.darkWing) {
        add(decalGeo.usWingText, kit.lazyDecal('usWingText', 640, Math.round((640 * US_WING_TEXT.chord) / US_WING_TEXT.span), (ctx, w, h) => plainDigits(ctx, 'USAF', w, h, 0.8, 0.98, '#f4f6f8'), 2), detail);
      }
      const m = US_MARKS.name[paint];
      const nameMat = kit.lazyDecal(`usName-${paint}`, 640, Math.round((640 * m.hFt) / m.wFt), (ctx, w, h) => plainDigits(ctx, us.def.name, w, h, 0.62, 0.98, us.def.nameColour), 2);
      const noseMat = paint === 'usn' ? decal(own(canvasTexture(THREE, 256, 96, (ctx, w, h) => plainDigits(ctx, tailNumber, w, h, 0.8, 0.96, '#16181d'), 2))) : null;
      for (const s of ['1', '-1']) {
        add(decalGeo.tail[s], decal(own(canvasTexture(THREE, 512, 512, usTailCanvas(paint, number, Number(s))))), detail);
        add(decalGeo.usInsignia[s], insignia, detail);
        add(decalGeo.usName[paint][s], nameMat, detail);
        if (noseMat) add(decalGeo.usNose[s], noseMat, detail);
        add(decalGeo.triA[s], mats.tri, detail);
        add(decalGeo.triB[s], mats.tri, detail);
        add(decalGeo.triC[s], mats.tri, detail);
      }
    } else {
      add(decalGeo.roundelWing, mats.roundel, detail);
      add(decalGeo.roundelUnder, mats.roundel, detail);
      const wingNumMat = decal(wingTex);
      add(decalGeo.wingNum, wingNumMat, detail);
      add(decalGeo.wingNumUnder, wingNumMat, detail);
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
        add(decalGeo.marksTop[s], mats.marks, detail);
        add(decalGeo.dotAft[s], mats.dot, detail);
        add(decalGeo.dotRoot[s], mats.dot, detail);
      }
    }
    add(geo.stubs, [mats.exhaust, mats.soot], detail);
    add(geo.vent, mats.vent, detail);
    add(geo.antenna, mats.antenna, detail);
    add(geo.beacon, mats.beacon, detail);
    speedBrake = addSpeedBrake(us ? us.mats.lower : mats.navy);
    gear = addGear(us ? us.mats.lower : mats.navy);
    navLights = add(geo.lights, mats.lights, detail);
    strobes = add(geo.strobes, mats.lights[2], detail);
    gearLights = add(geo.gearLights, mats.lamp, detail);
    gearLights.visible = false; // lit only with all three legs down (setGear)
    floor = add(geo.floor, mats.floor, detail);
    coamings = add(geo.coamings, mats.coaming, detail);
    add(geo.frames, us ? mats.usFrame : mats.frame, detail); // the US paints' canopy frames are white (an estimate)
    bowFront = add(geo.bowFront, us ? mats.usFrame : mats.frame, detail);
    helmetFront = add(geo.helmetFront, mats.pilot, detail);
    helmetRear = add(geo.helmetRear, mats.pilot, detail);
    seats = add(geo.seats, mats.headbox, detail);
    // The prop (turnProp turns it about the spinner's axis): four arms a quarter turn apart, each pitching blade 1's shape
    // about the blade's own outward axis through the hub (PROP_PITCH; 3d-work hinge.blade1 to blade4).
    prop = new THREE.Group();
    prop.rotation.x = rad(PROP_REST_DEG);
    propPitch = [0, 1, 2, 3].map((k) => {
      const arm = new THREE.Group();
      arm.rotation.x = (k * Math.PI) / 2;
      prop.add(arm);
      const pitch = new THREE.Group();
      pitch.position.x = PROP_HUB_FT * GFT;
      pitch.rotation.y = rad(PROP_PITCH.runningDeg);
      arm.add(pitch);
      add(geo.blade, mats.propBlade, pitch).position.x = -PROP_HUB_FT * GFT;
      add(geo.bladeTip, mats.propTip, pitch).position.x = -PROP_HUB_FT * GFT;
      return pitch;
    });
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
  // The flat nav ovals only until the file's lenses are in (attachExterior).
  kit.navMeshes.add(navLights);
  navLights.visible = !kit.lensesDelivered;
  // The landing and taxi lamps, unlit while the gear is up (setGear, showLamps).
  const lamps = { kit, glow: gearLights, meshes: gear.lampMeshes, lit: false };
  kit.lampShips.add(lamps);
  showLamps(lamps);
  root.userData.ct156 = { kit, mine, paint, detail, g, fuselage, canopy, helmetFront, helmetRear, seats, floor, coamings, prop, propPitch, disc, bowFront, speedBrake, gear, surfaces, strobes, gearLights, lamps, strobePhase: (root.id * 0.37) % CT156_STROBE.periodS, propStopped: false, pitchDeg: PROP_PITCH.runningDeg, propMats: { running: [mats.propBlade, mats.propTip], still: [mats.propBladeStill, mats.propTipStill] }, bladesShownRunning: null, inside: null, propTurn: 0, propAt: null };
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
 * Stops or starts a ship's prop (F26's app half, Patrick 12 Oct 2026: "a stopped prop, feathered, when the engine is off"). Stopped:
 * the prop stays at its rest pose (PROP_REST_DEG, an X), its blades solid and shown (a stopped blade is not a blur: a view that
 * hides them for the blur, blurProp, gets them back) and the faint disc gone; running (the default): as before. A module
 * calls this from its own engine state; nothing in the modules says "engine off" to the model yet, so none calls it.
 * The blades feather as it stops and come back to running pitch as it starts, over PROP_PITCH.featherS (turnProp).
 * @param {any} root a ship from createCt156Model
 * @param {boolean} stopped
 */
export function setPropStopped(root, stopped) {
  const d = root?.userData?.ct156;
  const on = Boolean(stopped);
  if (!d?.prop || d.propStopped === on) return;
  d.propStopped = on;
  const [blade, tip] = d.propMats[on ? 'still' : 'running'];
  const { geo } = d.kit;
  const blades = [];
  d.prop.traverse((o) => { if (o.isMesh) blades.push(o); });
  if (on) d.bladesShownRunning = blades.map((o) => o.visible);
  blades.forEach((o, i) => {
    o.material = o.geometry === geo.bladeTip ? tip : blade;
    if (d.kit.propDelivered && d.kit.ao) shadeMesh(d.kit, o); // the file's blade keeps its picture
    o.visible = on ? true : (d.bladesShownRunning?.[i] ?? true);
  });
  if (on) d.prop.rotation.x = rad(PROP_REST_DEG); // at once: turnProp runs after three.js has updated the matrices, so it would show a picture late
  if (d.disc) d.disc.visible = !on;
}

/**
 * Moves a ship's flight surfaces (ALL-35). roll, pitch and yaw run from -1 to 1, as the stick and pedals: roll 1 is full
 * right stick (right aileron up 20°, left aileron down 11°), pitch 1 full back stick (elevators trailing edge up), yaw 1
 * full right pedal (rudder trailing edge right). flaps is 'UP', 'TO' or 'LDG', or an angle in degrees. The surfaces move
 * at once; a module that wants them to move smoothly eases what it passes. A new ship is neutral, flaps up.
 * @param {any} root a ship from createCt156Model
 * @param {{ roll?: number, pitch?: number, yaw?: number, flaps?: 'UP' | 'TO' | 'LDG' | number }} [controls]
 */
export function setControls(root, { roll = 0, pitch = 0, yaw = 0, flaps = 'UP' } = {}) {
  const d = root?.userData?.ct156?.surfaces;
  if (!d) return;
  const axisVec = new root.userData.ct156.kit.THREE.Vector3();
  const A = SURFACES.aileron, E = SURFACES.elevator, F = SURFACES.flap, L = surfaceLayout();
  const unit = (v) => Math.max(-1, Math.min(1, Number(v) || 0));
  const r = unit(roll), p = unit(pitch), y = unit(yaw);
  // Degrees, trailing edge down (or right, for the rudder) positive.
  const left = r >= 0 ? A.downDeg * r : A.upDeg * r;
  const right = r >= 0 ? -A.upDeg * r : -A.downDeg * r;
  const flapDeg = flaps === 'TO' ? F.toDeg : flaps === 'LDG' ? F.ldgDeg : typeof flaps === 'number' ? Math.max(0, Math.min(F.ldgDeg, flaps)) : 0;
  const turn = (group, name, deg) => {
    const { axis, sign } = L[name];
    group.quaternion.setFromAxisAngle(axisVec.set(axis[0], axis[1], axis[2]), sign * rad(deg));
  };
  d.sides.forEach((side, i) => {
    turn(side.aileron, 'aileron', i === 0 ? left : right);
    side.flaps.forEach((flap, k) => turn(flap, Object.keys(FLAP_PIECES)[k], flapDeg));
    for (const well of side.wells) well.visible = flapDeg > 0;
  });
  turn(d.elevator, 'elevator', p >= 0 ? -E.upDeg * p : -E.downDeg * p);
  turn(d.rudder, 'rudder', SURFACES.rudder.deg * y);
}

/**
 * Lowers or raises a ship's landing gear (ALL-34): t from 0 (up) to 1 (down), through the real sequence
 * (ct156GearPhase): the inboard doors open, the legs travel, the inboard doors close (unless parked, F25); a module that animates it takes
 * about CT156_GEAR_TRAVEL_S each way. A new ship is gear up, the gear hidden, until a module lowers it.
 * @param {any} root a ship from createCt156Model
 * @param {number} t
 * @param {boolean} [parked] true for a ship standing on the ground (F25): the inboard doors then stay open with the gear down, as the real ones hang when parked; false (the default, in flight) closes them
 */
export function setGear(root, t, parked = false) {
  const d = root?.userData?.ct156?.gear;
  if (!d) return;
  d.t = clamp01(Number(t) || 0);
  const { doors, legs } = ct156GearPhase(d.t, parked);
  d.group.visible = d.t > 0;
  for (const s of d.sides) {
    s.leg.rotation.x = -(Math.PI / 2) * (1 - legs);
    s.splay.rotation.x = rad(GEAR.legDoorSplayDeg) * legs;
    s.door.rotation.x = -(Math.PI / 2) * doors;
    s.legWell.visible = legs > 0;
    s.inboardWell.visible = doors > 0;
  }
  d.nose.rotation.y = (Math.PI / 2) * (1 - legs);
  for (const door of d.noseDoors) door.rotation.x = rad(GEAR.noseDoor.openDeg) * legs;
  d.noseWell.visible = legs > 0;
  // The landing and taxi lamps fold down with the legs, lit only with all three down (F6, F23; reference).
  for (const turn of d.lampTurns) turn.rotation.y = rad(GEAR_LAMP.upDeg) * (1 - legs);
  const lamps = root.userData.ct156.lamps;
  if (lamps) {
    lamps.lit = legs >= 1;
    showLamps(lamps);
  }
}

/**
 * The ship seen from one of its own seats (the Formation Sim's Cockpit and Padlock views, with ct156-cockpit.js) or from
 * outside again. seat 'front' or 'rear': the pilot in that seat goes (the camera is in it) and the other seat's shows,
 * the still prop blades go (a turning prop is a blur from the seat; the faint disc stays), the canopy turns to clear
 * glass from inside, the fuselage opens over the cockpit onto its tub (TS-155) in place of the floor disc and the outside
 * coamings, and the frames
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
  if (d.coamings) d.coamings.visible = !inside; // from the seat, ct156-cockpit.js draws the coamings
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
  group.traverse((o) => {
    d.kit.exteriorMeshes.delete(o);
    d.kit.propMeshes.delete(o);
    d.kit.lampMeshes.delete(o);
    d.kit.gearMeshes.delete(o);
    d.kit.navMeshes.delete(o); // its flat nav ovals (a long Debrief otherwise keeps every ship's)
  });
  d.kit.lampShips.delete(d.lamps);
  d.kit.shadedCopies = d.kit.shadedCopies.filter(([, owner]) => owner !== d.mine); // freed below with the ship's own
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
