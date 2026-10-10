// The CT-156 Harvard II's two cockpits as the student and the instructor see them (Dad's asks, 9 Oct 2026; Patrick
// approved; TS-154, TS-155, TS-156, TS-157). In each: the grey tombstone instrument panel under a moulded near-black
// coaming with its grab rail, the three lamps under the rail, the AOA indexer and the standby compass on top and an air
// vent at each upper corner; the lower panel with its centre pedestal, knee wells and landing gear handle; the side
// consoles (power lever, flap lever, striped handles, knobs); the stick in its boot; the rudder pedals; the ejection
// seat with its cushions, harness, headbox, canopy breakers, yellow and black seat handle and green oxygen hose. Round
// the canopy: the forward bow band with its ring of holes, the canopy's side frames with their rows of fasteners, a
// mirror on each side frame by the bow, and the inter-cockpit arch with its fasteners, mirrors and the clear
// inter-cockpit shield. The rear cockpit's panel sits under a big moulded hump over the front seat's back, with its own
// grab rails, AOA indexer and compass. The canopy glass, the round bow tubes, the sill rails, the seat backs' frames,
// the tub (floor and walls), the wings and the tail are the ship's own (ct156-model.js setCockpitView). A picture only:
// no flight numbers, no flight formulas. Like ct156-model.js it imports nothing from the app, and three.js is passed in.
//
//   const pit = createCt156Cockpit(THREE, { doc: document });
//   shipRoot.add(pit.group);   // a child of a createCt156Model root, so it moves, banks and pitches with the airframe
//   pit.update(hud);           // the live instruments in both panels, from the HUD's numbers (hud.js drawHud's `hud`)
//   pit.dispose();
//
// Inside `group` everything is in feet, from the model's origin (on the spinner's axis), nose +X, left +Y, up +Z; the
// group itself is scaled to the model's units, so it lands on the model's canopy and seats at any ship size.
//
// Every size here is an ESTIMATE until Patrick rules: taken off the model's own tables (ct156-model.js, measured off
// Patrick's side-on photo of CT-156 156101) or off Dad's reference pictures of the T-6A cockpit (9 Oct 2026: photos, a
// panel poster, commercial-sim shots and renders of a commercial T-6A model; nothing copied from them, every shape and
// gauge drawn here), as each line says. From V2.208 (TS-156) the front eye, the forward bow and the glareshield's rim
// are placed to AETCMAN 11-248 (13 Aug 2025, the USAF T-6 primary flying manual): in level flight at 200 KIAS the
// horizon splits the windscreen half and half (Fig 2.7, p.42), and the bow is the wide light band with its ring of
// round holes (Fig 2.7, Fig 5.3). Page cites only: nothing from the manual is copied here
// (docs/references/aetcman11-248-cockpit.md). The pictures are the T-6A's; the CT-156's own panel may differ.
import {
  CT156_UNIT_LENGTH, CT156_LENGTH_FT, CT156_FRAME_X, CT156_SEAT_X, CT156_HELMET_Z, CT156_REFERENCE_POINTS,
  CT156_TUB_FLOOR_FT, ct156CanopySection, ct156CanopyHalfWidth, ct156HoopPoints, ct156JoinGeometries, setCockpitView,
} from './ct156-model.js';
import { drawAttitude } from './hud.js';

/** Feet per model unit (the model's 1.44 units are the T-6A's 33 ft 4 in). */
export const CT156_FT_PER_UNIT = CT156_LENGTH_FT / CT156_UNIT_LENGTH;
const F = CT156_FT_PER_UNIT;

/**
 * How far the front eye sits below the model's front helmet centre, feet (TS-156): chosen so that, with the forward bow
 * band and the glareshield's rim below, level flight at 200 KIAS shows half ground and half sky through the windscreen
 * (AETCMAN 11-248 Fig 2.7, p.42; the pitch is the sim's own, core attitudeDegFromClimb, about -0.3°). It also brings
 * the eye nearer the sill (TS-155's open question). An estimate fitted to that picture, not a measured eye position.
 */
export const EYE_BELOW_HELMET_FT = 0.13;
/**
 * The student's eye in the front seat (the default front eye), feet: over the model's front seat (CT156_SEAT_X[0],
 * about 1.4 ft ahead of the origin) and EYE_BELOW_HELMET_FT under its helmet centre, about 2.14 ft above the spinner's
 * axis. Estimate (model table, then TS-156's fit to Fig 2.7).
 */
export const EYE_FT = Object.freeze({ x: CT156_SEAT_X[0] * F, y: 0, z: CT156_HELMET_Z * F - EYE_BELOW_HELMET_FT });

/**
 * Both eyes, feet (TS-155, TS-156). Front: EYE_FT. Rear: over the rear seat (CT156_SEAT_X[1], about 3.0 ft aft of the
 * origin) and 0.15 ft higher than the front eye, for the rear seat's step up (kept from TS-155, so it moved down with
 * the front eye to about 2.29 ft, where the front eye used to be); more puts the instructor's helmet into the glass.
 * Estimate (judged off Dad's reference pictures and the model's canopy).
 */
export const EYES_FT = Object.freeze({
  front: EYE_FT,
  rear: Object.freeze({ x: CT156_SEAT_X[1] * F, y: 0, z: EYE_FT.z + 0.15 }),
});
/** The rear cockpit's parts are the front's moved aft by the seats' spacing (about 4.4 ft, model table). */
const REAR_DX = (CT156_SEAT_X[1] - CT156_SEAT_X[0]) * F;

/**
 * The forward canopy bow (the windscreen's frame), feet: the model's front frame hoop station (CT156_FRAME_X[0], about
 * 3.7 ft) and its crest, the canopy's top there (about 2.6 ft) (model tables). Seen from the seat it is a wide light
 * band lining the glass, with a ring of round dark holes and a dark tube along its inner edge (AETCMAN 11-248 Fig 2.7,
 * p.42, and Fig 5.3, para 5.13; TS-156): its aft face 0.05 ft behind the hoop station, 0.15 ft deep from the glass
 * inward, the tube 0.025 ft in radius, so it looks about 4.3° wide at the crest from the front eye (the figures look
 * about 4-5°); 22 holes from sill to sill, each 0.07 ft across. Sizes estimates judged off the figures. The manual's
 * figure wins over the commercial renders here (TS-157), which draw this bow with rows of fasteners.
 */
export const FORWARD_BOW_FT = Object.freeze({
  x: CT156_FRAME_X[0] * F,
  crestZ: ct156CanopySection(CT156_FRAME_X[0]).top * F,
  bandX: CT156_FRAME_X[0] * F - 0.05,
  glassInset: 0.01,
  bandDepth: 0.15,
  tubeR: 0.025,
  dots: Object.freeze([Object.freeze({ at: 0.5, n: 22, dia: 0.07 })]),
});

/**
 * The inter-cockpit arch over the rear seat's panel, feet (TS-157): the model's centre frame hoop (CT156_FRAME_X[1],
 * about 0.5 ft aft of the origin), seen from the rear seat as a light band like the forward bow, 0.2 ft deep, with a
 * row of small fasteners along each edge and a dark tube along its inner edge, as the commercial T-6A shots from the
 * rear seat show (Dad's pictures 21 and 27). Sizes estimates.
 */
export const ARCH_FT = Object.freeze({
  x: CT156_FRAME_X[1] * F,
  bandX: CT156_FRAME_X[1] * F - 0.05,
  glassInset: 0.01,
  bandDepth: 0.2,
  tubeR: 0.025,
  dots: Object.freeze([Object.freeze({ at: 0.18, n: 34, dia: 0.032 }), Object.freeze({ at: 0.82, n: 30, dia: 0.032 })]),
});

/**
 * The front instrument panel's main face, feet: 3.45 ft ahead of the origin, from 0.5 ft up to 1.7 ft (just under the
 * coaming's lip), 2.3 ft across at most and kept 0.06 ft inside the canopy. Its outline is a tombstone: straight sides up
 * to 60 % of its height, then shoulders in to a flat top 55 % as wide (TS-157, between the T-6A panel poster's and the
 * commercial render's, Dad's pictures 17 and 26). Estimates.
 */
export const PANEL_FT = Object.freeze({ x: 3.45, top: 1.7, bottom: 0.5, width: 2.3, insetFromGlass: 0.06, shoulderV: 0.6, topFrac: 0.55 });

/**
 * The front coaming (glareshield), feet (TS-157): a moulded near-black hood over the panel, its aft edge following the
 * panel's tombstone outline with the grab rail along it, its crown 1.85 ft up at the aft edge (TS-156's height for the
 * rim, unchanged) and falling forward faster than the eye's sight line over the rail, to about 0.95 ft at the
 * windscreen's foot (5.3 ft), so from the seat the rail stays the windscreen's bottom edge; a lip 0.15 ft deep hangs
 * at its aft edge with the three lamps on it. Shape judged off Dad's pictures 17, 18, 20 and 26; sizes estimates.
 */
export const GLARESHIELD_FT = Object.freeze({ aftX: PANEL_FT.x - 0.1, foreX: 5.3, top: 1.85, foreTop: 0.95, lipDrop: 0.15, skirt: 0.12, topGrow: -0.1, sideGrow: 0, dropGrow: -0.1 });
/**
 * The glareshield's rim, the thick dark grab rail along the coaming's aft edge and down the panel's sides to brackets
 * at 18 % of its height: its top run 0.03 ft behind the coaming at the coaming's own height, 0.045 ft in radius
 * (AETCMAN 11-248 Fig 2.7, p.42; TS-156), 0.05 ft out from the panel's edge. Its top is the windscreen's bottom edge
 * straight ahead. Sizes estimates.
 */
export const RIM_FT = Object.freeze({ aftOfGlareshield: 0.03, r: 0.045, sideOut: 0.05, lowV: 0.18 });

/** The rear cockpit's panel, feet: face 0.7 ft aft of the origin, 0.7 to 1.75 ft up, 2.2 ft across (estimates). */
export const REAR_PANEL_FT = Object.freeze({ x: -0.7, top: 1.75, bottom: 0.7, width: 2.2, insetFromGlass: 0.06, shoulderV: 0.6, topFrac: 0.55 });
/**
 * The rear coaming, feet (TS-157): the big moulded hump over the front seat's back that the rear panel sits under
 * (Dad's pictures 27 and 29), its aft edge along the rear panel's outline at 1.9 ft with the grab rail on it, rising
 * 0.16 ft over the first 38 % of its length and widening to the canopy, then falling 0.41 ft onto the front seat's back
 * (0.36 ft ahead of the origin). Estimates.
 */
export const REAR_HUMP_FT = Object.freeze({ aftX: REAR_PANEL_FT.x - 0.1, foreX: 0.36, top: 1.9, rise: 0.16, peakT: 0.38, foreDrop: 0.25, lipDrop: 0.15, skirt: 0.12, topGrow: 0.35, sideGrow: 0.2, dropGrow: 0.35 });

/**
 * The seats and their cockpits, feet (estimates off Dad's reference pictures; the seat back's frame is the model's).
 * The rear seat's are the same moved aft by REAR_DX.
 */
const SEAT_BACK_X = [(CT156_SEAT_X[0] - 0.042) * F, (CT156_SEAT_X[0] - 0.028) * F]; // the model's seat back, aft and front faces
export const SEAT_FT = Object.freeze({
  pan: { aft: SEAT_BACK_X[1], fore: SEAT_BACK_X[1] + 1.2, z0: -0.48, z1: -0.33, halfWidth: 0.5 }, // the eye 2.5 ft above its top
  backCushion: { depth: 0.1, z1: 2.1, halfWidth: 0.42 },
  headbox: { aft: SEAT_BACK_X[0], fore: SEAT_BACK_X[1] + 0.04, z0: 2.1, z1: 2.7, halfWidth: 0.4 }, // Martin-Baker headbox
  breakers: { y: 0.24, top: 2.95 }, // the canopy breakers on the headbox (Dad's picture 27)
  console: { aft: 0.6, inner: 0.95, outer: 1.3, top: 0.2 }, // TS-157: tops lowered from 0.35 ft with the deeper floor
  floorZ: CT156_TUB_FLOOR_FT, // the tub's floor (ct156-model.js)
  stick: { x: 2.2, tiltDeg: 8, height: 1.65 },
  knee: { inner: 0.24, outer: 0.8, belowPanel: 0.15, r: 0.17, depth: 0.5 }, // the knee wells under the panel
});
/** The canopy's side frames inside the glass, feet: 0.3 ft up from the sill, a fastener every 0.3 ft (estimates). */
const SIDE_FRAME_FT = Object.freeze({ height: 0.3, thick: 0.06, pitch: 0.3 });

/** The live instruments redraw at most this often, and only when what they show has changed (a picture; 5 a second is plenty). */
export const PANEL_REDRAW_MS = 200;

const deg = (r) => (r * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const lerp = (a, b, t) => a + (b - a) * t;

/** The angle above (+) or below (-) the eye's level line of a round tube's edge (feet; side +1 its top, -1 its bottom). */
function tubeEdgeDeg(eye, x, z, r, side) {
  const d = Math.hypot(x - eye.x, z - eye.z);
  return deg(Math.atan2(z - eye.z, x - eye.x) + side * Math.asin(Math.min(1, r / d)));
}

/**
 * A coaming's crown (its middle's height) at station x, feet: the front one falls forward to the windscreen's foot;
 * the rear hump rises a little, then falls onto the front seat's back (TS-157).
 */
function crownZ(h, x) {
  const t = clamp01((x - h.aftX) / (h.foreX - h.aftX));
  if (h.rise === undefined) return h.top - (h.top - h.foreTop) * t ** 1.4;
  if (t < h.peakT) return h.top + h.rise * Math.sin(((t / h.peakT) * Math.PI) / 2);
  return h.top + h.rise - (h.rise + h.foreDrop) * ((t - h.peakT) / (1 - h.peakT)) ** 1.6;
}

/**
 * The windscreen as the pilot sees it straight ahead, head level (TS-156, TS-157): from the top of the glareshield (its
 * rim, or the coaming's crown if that shows higher) up to the bottom of the bow over him, in degrees above (+) or below
 * (-) the eye's level line along the nose (the model's x axis, so the horizon sits at minus the pitch attitude). Front
 * seat: the forward bow band's inner tube; rear seat: the inter-cockpit arch's, and headboxDeg, the top of the front
 * seat's headbox, which stands in the middle of the rear seat's view. eyeFt in feet, the model's frame (EYES_FT plus any
 * eye offsets).
 * @returns {{ topDeg: number, bottomDeg: number, heightDeg: number, headboxDeg?: number }}
 */
export function windscreenFrom(eyeFt = EYE_FT, seat = 'front') {
  const rear = seat === 'rear';
  const h = rear ? REAR_HUMP_FT : GLARESHIELD_FT;
  let bottomDeg = tubeEdgeDeg(eyeFt, h.aftX - RIM_FT.aftOfGlareshield, h.top, RIM_FT.r, +1);
  for (let i = 0; i <= 48; i++) {
    const x = lerp(h.aftX, h.foreX, i / 48);
    bottomDeg = Math.max(bottomDeg, deg(Math.atan2(crownZ(h, x) - eyeFt.z, x - eyeFt.x)));
  }
  const b = rear ? ARCH_FT : FORWARD_BOW_FT;
  const crest = ct156CanopySection(b.bandX / F).top * F;
  const topDeg = tubeEdgeDeg(eyeFt, b.bandX, crest - b.glassInset - b.bandDepth, b.tubeR, -1);
  const out = { topDeg, bottomDeg, heightDeg: topDeg - bottomDeg };
  if (rear) out.headboxDeg = deg(Math.atan2(SEAT_FT.headbox.z1 - eyeFt.z, SEAT_FT.headbox.fore - eyeFt.x));
  return out;
}

/** The outside reference points (ct156-model.js CT156_REFERENCE_POINTS) in feet, { x, y, z } from the model's origin. */
export const CT156_POINTS_FT = Object.freeze(Object.fromEntries(Object.entries(CT156_REFERENCE_POINTS)
  .map(([k, [x, y, z]]) => [k, Object.freeze({ x: x * F, y: y * F, z: z * F })])));

/** A frame's rotation (the model's: rotation.set(-bank, -pitch, heading), order 'ZYX'), as a 3 x 3 matrix, body to world. */
function frameMatrix({ headingRad = 0, pitchRad = 0, bankRad = 0 }) {
  const [ch, sh, cp, sp, cb, sb] = [Math.cos(headingRad), Math.sin(headingRad), Math.cos(-pitchRad), Math.sin(-pitchRad), Math.cos(-bankRad), Math.sin(-bankRad)];
  // Rz(heading) · Ry(-pitch) · Rx(-bank)
  return [
    [ch * cp, ch * sp * sb - sh * cb, ch * sp * cb + sh * sb],
    [sh * cp, sh * sp * sb + ch * cb, sh * sp * cb - ch * sb],
    [-sp, cp * sb, cp * cb],
  ];
}

/**
 * Where a point on another aircraft appears from a pilot's eye (TS-156), for checking formation sight pictures: the
 * point's bearing from the eye in the eye's own aircraft's axes. Frames are poses as the 3D views place the model
 * ({ x, y, z } world feet, z up, and headingRad, pitchRad, bankRad as view3d.js aircraftPose: the model is set with
 * rotation.set(-bank, -pitch, heading), order 'ZYX'). eyeFt and pointFt are { x, y, z } feet in their own aircraft's
 * axes (nose +X, left +Y, up +Z from the model's origin), e.g. EYES_FT.front and CT156_POINTS_FT.leftLight.
 * Pure geometry: no flight numbers.
 * @returns {{ azimuthDeg: number, elevationDeg: number, rangeFt: number }} azimuth right of the nose positive,
 *   elevation above the eye's level line (the wings' plane) positive.
 */
export function sightAnglesOf(eyeFt, eyeFrame, pointFt, pointFrame) {
  const toWorld = (f, v) => {
    const m = frameMatrix(f);
    return [0, 1, 2].map((i) => [f.x, f.y, f.z][i] + m[i][0] * v.x + m[i][1] * v.y + m[i][2] * v.z);
  };
  const eye = toWorld(eyeFrame, eyeFt), pt = toWorld(pointFrame, pointFt);
  const d = [pt[0] - eye[0], pt[1] - eye[1], pt[2] - eye[2]];
  const m = frameMatrix(eyeFrame);
  const [bx, by, bz] = [0, 1, 2].map((j) => m[0][j] * d[0] + m[1][j] * d[1] + m[2][j] * d[2]); // world to body: the transpose
  return { azimuthDeg: deg(Math.atan2(-by, bx)), elevationDeg: deg(Math.atan2(bz, Math.hypot(bx, by))), rangeFt: Math.hypot(bx, by, bz) };
}

/** The canopy's inside half-width at station x and height z (feet), less an inset; below the sill the fuselage is wider. */
function glassHalfWidthFt(z, x, inset) {
  const c = ct156CanopySection(x / F);
  if (z <= c.base * F) return Infinity;
  return Math.max(0, ct156CanopyHalfWidth(x / F, z / F) * F - inset);
}

/** A panel's half-width at height z (feet): its width at most, kept inside the canopy at its station. */
function panelHalfWidthFt(z, p = PANEL_FT, x = p.x) {
  return Math.max(0, Math.min(p.width / 2, glassHalfWidthFt(z, x, p.insetFromGlass)));
}

/** A panel's tombstone outline (feet): its straight sides' half-width, its top's, and the shoulders' height. */
function tombstone(p) {
  const h = p.top - p.bottom;
  const shoulderZ = p.bottom + p.shoulderV * h;
  let side = p.width / 2;
  for (let i = 0; i <= 8; i++) side = Math.min(side, panelHalfWidthFt(p.bottom + ((shoulderZ - p.bottom) * i) / 8, p));
  const top = Math.min(p.topFrac * side, panelHalfWidthFt(p.top, p));
  return { side, top, shoulderZ, height: h };
}

// ---------- the panel pictures ----------
// Layouts (estimates off Dad's reference pictures of the T-6A panel, the poster flat-on (17) and the renders from behind
// the seats (26, 27), placed by eye; none copied): u 0 is the pilot's left edge of the main face and 1 its right; v 0
// its bottom and 1 its top. Round dials give d (a fraction of the face's width); rectangles give w (of its width) and
// h (of its height); square bezels give s (of its width), with the round dial d inside. Live ones read the HUD's
// numbers for the aircraft the camera sits in (the standby airspeed and altimeter in the bottom row read the same
// numbers as the main ones); the rest are drawn once (the sim has no numbers for them). Screens that would show radio
// or navigation data show the tool's own placeholder dashes. Both panels use this layout (picture 27 shows the rear
// panel laid out as the front's).

const PANEL_INSTRUMENTS = [
  { kind: 'aoa', u: 0.205, v: 0.76, d: 0.07 },
  { kind: 'asi', u: 0.32, v: 0.795, s: 0.112, d: 0.096, live: 'asi' },
  { kind: 'eadi', u: 0.49, v: 0.79, w: 0.186, h: 0.35, live: 'eadi', frame: true },
  { kind: 'alt', u: 0.66, v: 0.795, s: 0.112, d: 0.096, live: 'alt' },
  { kind: 'label', u: 0.795, v: 0.76, w: 0.07, h: 0.04 },
  { kind: 'lights', u: 0.075, v: 0.6, w: 0.025, h: 0.12 },
  { kind: 'clock', u: 0.145, v: 0.6, w: 0.085, h: 0.14 },
  { kind: 'g', u: 0.24, v: 0.6, d: 0.08, live: 'g' },
  { kind: 'rmu', u: 0.34, v: 0.47, w: 0.093, h: 0.385, frame: true },
  { kind: 'ehsi', u: 0.49, v: 0.41, w: 0.186, h: 0.35, live: 'ehsi', frame: true },
  { kind: 'vsi', u: 0.66, v: 0.56, s: 0.112, d: 0.096 },
  { kind: 'eng', u: 0.8, v: 0.56, s: 0.112, name: 'TRQ' },
  { kind: 'eng', u: 0.66, v: 0.33, s: 0.112, name: 'ITT' },
  { kind: 'eng', u: 0.8, v: 0.33, s: 0.112, name: 'NP' },
  { kind: 'smallPanel', u: 0.915, v: 0.53, w: 0.075, h: 0.1 },
  { kind: 'fire', u: 0.915, v: 0.4, s: 0.055 },
  { kind: 'smallPanel', u: 0.915, v: 0.28, w: 0.075, h: 0.08 },
  { kind: 'gps', u: 0.16, v: 0.39, w: 0.23, h: 0.245, frame: true },
  { kind: 'switches', u: 0.255, v: 0.125, w: 0.176, h: 0.21 },
  { kind: 'asi', u: 0.39, v: 0.14, d: 0.08, live: 'asi' },
  { kind: 'stby', u: 0.49, v: 0.14, s: 0.088, d: 0.078, live: 'stby' },
  { kind: 'alt', u: 0.59, v: 0.14, d: 0.08, live: 'alt' },
  { kind: 'gearInd', u: 0.68, v: 0.14, w: 0.085, h: 0.16 },
  { kind: 'annun', u: 0.845, v: 0.12, w: 0.22, h: 0.18 },
  { kind: 'emerGear', u: 0.05, v: 0.12, s: 0.045 },
];

/** The live faces' windows in one shared picture (pixels); both seats' live instruments read the same windows. */
const ATLAS = Object.freeze({ width: 1024, height: 512 });
const LIVE_WINDOWS = Object.freeze({
  eadi: { x: 0, y: 0, w: 384, h: 220 },
  ehsi: { x: 384, y: 0, w: 384, h: 220 },
  asi: { x: 776, y: 0, w: 240, h: 240 },
  alt: { x: 0, y: 256, w: 240, h: 240 },
  stby: { x: 248, y: 256, w: 200, h: 200 },
  g: { x: 456, y: 256, w: 160, h: 160 },
});

const PANEL_GREY = '#8e9296';
const SEAM = 'rgba(52, 56, 60, 0.55)';
const BEZEL = '#1d2024';
const BLACK = '#0b0d10';
const FACE = '#0b0d10';
const INK = '#e8edf2';
const DIM = 'rgba(200, 215, 230, 0.7)';
const GREEN_INK = '#7fd18a';
const YELLOW = '#e8c21c';
const num = (v, digits = 0) => (Number.isFinite(v) ? v.toLocaleString('en-CA', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—');

function bezel(ctx, cx, cy, r) {
  const pad = Math.max(3, r * 0.12);
  ctx.fillStyle = '#16191d';
  ctx.fillRect(cx - r - pad, cy - r - pad, 2 * (r + pad), 2 * (r + pad));
  ctx.fillStyle = FACE;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

/** A rounded rectangle path. */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Screw heads at a box's corners, in from its edges. */
function screws(ctx, x, y, w, h, inset, r) {
  ctx.fillStyle = '#5c6066';
  for (const [sx, sy] of [[x + inset, y + inset], [x + w - inset, y + inset], [x + inset, y + h - inset], [x + w - inset, y + h - inset]]) {
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A square instrument bezel, as round the T-6A's main dials and displays (Dad's pictures 17 and 26). */
function squareBezel(ctx, x, y, w, h) {
  ctx.fillStyle = BEZEL;
  roundRect(ctx, x, y, w, h, Math.min(w, h) * 0.12);
  ctx.fill();
  screws(ctx, x, y, w, h, Math.min(w, h) * 0.08, Math.max(1.5, Math.min(w, h) * 0.025));
}

/** Yellow and black diagonal stripes filling a box. */
function stripes(ctx, x, y, w, h, n = 5) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = YELLOW;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#111';
  const step = Math.max(w, h) / n;
  ctx.lineWidth = step * 0.45;
  for (let k = -n; k <= 2 * n; k++) {
    ctx.beginPath();
    ctx.moveTo(x + k * step, y + h);
    ctx.lineTo(x + k * step + h, y);
    ctx.stroke();
  }
  ctx.restore();
}

function label(ctx, text, x, y, px = 11, colour = DIM, align = 'center') {
  ctx.fillStyle = colour;
  ctx.font = `${Math.max(6, Math.round(px))}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

/** A round dial: ticks from `from` to `to` over `sweepDeg` from the top, a needle at `value`, a digital box under it. */
function dial(ctx, { cx, cy, r, from, to, sweepDeg, startDeg = 0, major, minor, name, value, readout, labelOf = (n) => String(n) }) {
  bezel(ctx, cx, cy, r);
  const angleOf = (n) => ((startDeg + ((n - from) / (to - from)) * sweepDeg - 90) * Math.PI) / 180;
  ctx.strokeStyle = INK;
  for (let n = from; n <= to + 1e-9; n += minor) {
    const a = angleOf(n);
    const big = Math.abs(n / major - Math.round(n / major)) < 1e-6;
    ctx.lineWidth = Math.max(1, (big ? 2 : 1) * (r / 50));
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
    ctx.lineTo(cx + Math.cos(a) * r * (big ? 0.78 : 0.85), cy + Math.sin(a) * r * (big ? 0.78 : 0.85));
    ctx.stroke();
    if (big) label(ctx, labelOf(n), cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62, r * 0.2, INK);
  }
  label(ctx, name, cx, cy - r * 0.32, r * 0.18);
  if (readout !== null) {
    ctx.fillStyle = '#000';
    ctx.fillRect(cx - r * 0.42, cy + r * 0.2, r * 0.84, r * 0.3);
    label(ctx, readout, cx, cy + r * 0.35, r * 0.24, INK);
  }
  if (Number.isFinite(value)) {
    const a = angleOf(Math.max(from, Math.min(to, value)));
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, r * 0.06);
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(a) * r * 0.12, cy - Math.sin(a) * r * 0.12);
    ctx.lineTo(cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82);
    ctx.stroke();
  }
  ctx.fillStyle = '#555';
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(2, r * 0.08), 0, Math.PI * 2);
  ctx.fill();
}

/** The EHSI: a compass card turning with the heading under a fixed lubber line, the heading in a box on top. */
function ehsi(ctx, cx, cy, r, headingDeg) {
  ctx.fillStyle = FACE;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  const hdg = Number.isFinite(headingDeg) ? headingDeg : 0;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-hdg * Math.PI) / 180);
  ctx.strokeStyle = INK;
  for (let d = 0; d < 360; d += 5) {
    const a = ((d - 90) * Math.PI) / 180;
    const big = d % 30 === 0;
    ctx.lineWidth = d % 10 === 0 ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
    ctx.lineTo(Math.cos(a) * r * (big ? 0.8 : d % 10 === 0 ? 0.85 : 0.89), Math.sin(a) * r * (big ? 0.8 : d % 10 === 0 ? 0.85 : 0.89));
    ctx.stroke();
    if (big) {
      ctx.save();
      ctx.translate(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66);
      ctx.rotate((d * Math.PI) / 180);
      const name = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] ?? String(d / 10);
      label(ctx, name, 0, 0, r * 0.2, INK);
      ctx.restore();
    }
  }
  ctx.restore();
  // The fixed aircraft symbol and lubber line.
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = Math.max(1.5, r * 0.035);
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.3); ctx.lineTo(cx, cy + r * 0.3);
  ctx.moveTo(cx - r * 0.22, cy - r * 0.05); ctx.lineTo(cx + r * 0.22, cy - r * 0.05);
  ctx.moveTo(cx - r * 0.1, cy + r * 0.25); ctx.lineTo(cx + r * 0.1, cy + r * 0.25);
  ctx.stroke();
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.95); ctx.lineTo(cx - r * 0.07, cy - r * 1.05); ctx.lineTo(cx + r * 0.07, cy - r * 1.05); ctx.closePath();
  ctx.fill();
}

/** A screen's heading box, top centre. */
function headingBox(ctx, cx, y, size, headingDeg) {
  const text = Number.isFinite(headingDeg) ? String(Math.round(((headingDeg % 360) + 360) % 360) || 360).padStart(3, '0') : '—';
  ctx.fillStyle = '#000';
  ctx.strokeStyle = 'rgba(232, 237, 242, 0.6)';
  ctx.lineWidth = 1;
  ctx.fillRect(cx - size * 1.6, y, size * 3.2, size * 1.3);
  ctx.strokeRect(cx - size * 1.6, y, size * 3.2, size * 1.3);
  label(ctx, `${text}°`, cx, y + size * 0.68, size, INK);
}

/** A screen: a black frame round a dark glass face. */
function screen(ctx, x, y, w, h, glass = '#05070a') {
  ctx.fillStyle = BLACK;
  ctx.fillRect(x, y, w, h);
  const m = Math.max(2, Math.min(w, h) * 0.06);
  ctx.fillStyle = glass;
  ctx.fillRect(x + m, y + m, w - 2 * m, h - 2 * m);
  return { x: x + m, y: y + m, w: w - 2 * m, h: h - 2 * m };
}

/** Rows of labels with dashes beside them, inside a screen. */
function rows(ctx, s, names, colour = GREEN_INK) {
  const step = s.h / (names.length + 0.5);
  names.forEach((name, i) => {
    const y = s.y + step * (i + 0.75);
    label(ctx, name, s.x + s.w * 0.08, y, step * 0.55, colour, 'left');
    label(ctx, '—', s.x + s.w * 0.92, y, step * 0.6, INK, 'right');
  });
}

/** A knob: a dark round with a lighter cap. */
function knob(ctx, x, y, r) {
  ctx.fillStyle = '#050608'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4b5056'; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, Math.PI * 2); ctx.fill();
}

/** A toggle switch seen from aft: a small dark base and a light lever dot. */
function toggle(ctx, x, y, r) {
  ctx.fillStyle = '#16181b'; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  ctx.fillStyle = '#c9ced4'; ctx.beginPath(); ctx.arc(x, y - r * 0.3, r * 0.45, 0, Math.PI * 2); ctx.fill();
}

/** One instrument drawn into its box (x, y, w, h pixels), from the HUD's numbers `h` (null or {} shows dashes). */
function drawInstrument(ctx, kind, b, h, inst = {}) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const r = Math.min(b.w, b.h) / 2;
  const rr = r / 1.12; // inside a round dial's bezel
  switch (kind) {
    case 'fire':
      ctx.fillStyle = BLACK; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#4a1012'; ctx.fillRect(b.x + b.w * 0.1, b.y + b.h * 0.1, b.w * 0.8, b.h * 0.8); // unlit
      label(ctx, 'FIRE', cx, cy, b.h * 0.3, '#c9575a');
      break;
    case 'aoa': // unlabelled scale, needle mid-scale: the sim has no angle of attack
      dial(ctx, { cx, cy, r: rr, from: 0, to: 1, sweepDeg: 270, startDeg: -135, major: 0.25, minor: 0.125, name: 'AOA', value: 0.5, readout: null, labelOf: () => '' });
      break;
    case 'asi':
      dial(ctx, { cx, cy, r: rr, from: 0, to: 320, sweepDeg: 320, major: 40, minor: 10, name: 'KNOTS', value: h?.kias, readout: num(h?.kias), labelOf: (n) => String(n / 10) });
      break;
    case 'alt': {
      const alt = Number.isFinite(h?.altFt) ? h.altFt : NaN;
      dial(ctx, { cx, cy, r: rr, from: 0, to: 1000, sweepDeg: 360, major: 100, minor: 20, name: 'ALT', value: Number.isFinite(alt) ? ((alt % 1000) + 1000) % 1000 : NaN, readout: num(alt), labelOf: (n) => (n === 1000 ? '' : String(n / 100)) });
      break;
    }
    case 'vsi': // no vertical speed comes from the sim, so no needle
      dial(ctx, { cx, cy, r: rr, from: -4, to: 4, sweepDeg: 300, startDeg: -240, major: 2, minor: 1, name: 'VSI', value: NaN, readout: '—', labelOf: (n) => String(Math.abs(n)) });
      break;
    case 'g':
      dial(ctx, { cx, cy, r: rr, from: -4, to: 8, sweepDeg: 300, startDeg: -150, major: 2, minor: 1, name: 'G', value: h?.g, readout: num(h?.g, 1) });
      break;
    case 'stby':
      bezel(ctx, cx, cy, rr);
      drawAttitude(ctx, cx, cy, rr * 0.94, h?.pitchDeg, h?.bankDeg);
      break;
    case 'clock': { // the chronometer: a dark box with an orange digital readout (AETCMAN 11-248 Fig 2.7) and two buttons
      ctx.fillStyle = BEZEL; roundRect(ctx, b.x, b.y, b.w, b.h, b.w * 0.08); ctx.fill();
      ctx.fillStyle = '#000'; ctx.fillRect(b.x + b.w * 0.12, b.y + b.h * 0.22, b.w * 0.76, b.h * 0.32);
      label(ctx, '--:--', cx, b.y + b.h * 0.38, b.h * 0.22, '#ff9a3c');
      for (const k of [0.3, 0.7]) { ctx.fillStyle = '#3a3e44'; ctx.fillRect(b.x + b.w * k - b.w * 0.1, b.y + b.h * 0.68, b.w * 0.2, b.h * 0.14); }
      break;
    }
    case 'lights':
      for (let k = 0; k < 3; k++) { ctx.fillStyle = k === 0 ? '#2b3a1c' : '#1c3a24'; ctx.fillRect(b.x, b.y + (b.h * k) / 3 + 1, b.w, b.h / 3 - 2); }
      break;
    case 'label':
      ctx.fillStyle = '#16181b'; ctx.fillRect(b.x, b.y, b.w, b.h);
      break;
    case 'eadi': {
      const s = screen(ctx, b.x, b.y, b.w, b.h, '#020304');
      const ar = Math.min(s.w, s.h) * 0.42;
      drawAttitude(ctx, s.x + s.w / 2, s.y + s.h / 2 + ar * 0.06, ar, h?.pitchDeg, h?.bankDeg);
      label(ctx, 'EADI', s.x + s.w * 0.04, s.y + s.h * 0.08, s.h * 0.07, DIM, 'left');
      break;
    }
    case 'ehsi': {
      const s = screen(ctx, b.x, b.y, b.w, b.h, '#020304');
      const er = Math.min(s.w, s.h) * 0.4;
      ehsi(ctx, s.x + s.w / 2, s.y + s.h / 2 + er * 0.12, er, h?.headingDeg);
      headingBox(ctx, s.x + s.w / 2, s.y + 2, s.h * 0.08, h?.headingDeg);
      label(ctx, 'EHSI', s.x + s.w * 0.04, s.y + s.h * 0.08, s.h * 0.07, DIM, 'left');
      break;
    }
    case 'rmu': {
      ctx.fillStyle = BEZEL; ctx.fillRect(b.x, b.y, b.w, b.h);
      const s = screen(ctx, b.x + b.w * 0.14, b.y + b.h * 0.06, b.w * 0.72, b.h * 0.72, '#0c1a10');
      rows(ctx, s, ['UHF', 'VHF', 'XPDR', 'NAV']);
      for (let k = 0; k < 4; k++) { ctx.fillStyle = '#c9ced4'; ctx.fillRect(b.x + b.w * 0.03, s.y + (s.h * (k + 0.4)) / 4, b.w * 0.07, b.h * 0.02); ctx.fillRect(b.x + b.w * 0.9, s.y + (s.h * (k + 0.4)) / 4, b.w * 0.07, b.h * 0.02); }
      knob(ctx, b.x + b.w * 0.3, b.y + b.h * 0.88, b.w * 0.1); knob(ctx, b.x + b.w * 0.7, b.y + b.h * 0.88, b.w * 0.1);
      break;
    }
    case 'gps': { // the GPS and radio box: a green screen over a row of buttons, a big knob each side
      ctx.fillStyle = '#1b1e22'; ctx.fillRect(b.x, b.y, b.w, b.h);
      screws(ctx, b.x, b.y, b.w, b.h, b.h * 0.06, Math.max(1.5, b.h * 0.025));
      const s = screen(ctx, b.x + b.w * 0.18, b.y + b.h * 0.1, b.w * 0.64, b.h * 0.42, '#0c1a10');
      rows(ctx, s, ['GPS', 'WPT']);
      for (let k = 0; k < 4; k++) { ctx.fillStyle = '#3c4147'; ctx.fillRect(b.x + b.w * (0.24 + k * 0.14), b.y + b.h * 0.62, b.w * 0.1, b.h * 0.1); ctx.fillRect(b.x + b.w * (0.24 + k * 0.14), b.y + b.h * 0.78, b.w * 0.1, b.h * 0.1); }
      knob(ctx, b.x + b.w * 0.09, b.y + b.h * 0.78, b.h * 0.11); knob(ctx, b.x + b.w * 0.91, b.y + b.h * 0.78, b.h * 0.11);
      break;
    }
    case 'eng': { // a square engine display (static: the sim has no engine numbers)
      const s = screen(ctx, b.x, b.y, b.w, b.h, '#050709');
      const dr = Math.min(s.w, s.h) * 0.28;
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, dr * 0.06);
      ctx.beginPath(); ctx.arc(s.x + s.w / 2, s.y + s.h * 0.45, dr, rad(135), rad(405)); ctx.stroke();
      label(ctx, inst.name ?? '', s.x + s.w / 2, s.y + s.h * 0.45, dr * 0.45, GREEN_INK);
      label(ctx, '—', s.x + s.w / 2, s.y + s.h * 0.85, dr * 0.5, INK);
      break;
    }
    case 'smallPanel':
      ctx.fillStyle = '#1b1e22'; ctx.fillRect(b.x, b.y, b.w, b.h);
      toggle(ctx, b.x + b.w * 0.3, b.y + b.h * 0.55, b.h * 0.14); toggle(ctx, b.x + b.w * 0.7, b.y + b.h * 0.55, b.h * 0.14);
      ctx.fillStyle = '#c9ced4'; ctx.fillRect(b.x + b.w * 0.15, b.y + b.h * 0.15, b.w * 0.7, b.h * 0.06);
      break;
    case 'switches': { // a switch panel: two rows of toggles under placard lines
      ctx.fillStyle = '#1b1e22'; ctx.fillRect(b.x, b.y, b.w, b.h);
      screws(ctx, b.x, b.y, b.w, b.h, b.h * 0.07, Math.max(1.5, b.h * 0.03));
      for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) {
        const x = b.x + b.w * (0.16 + i * 0.23), y = b.y + b.h * (0.38 + j * 0.36);
        ctx.fillStyle = '#c9ced4'; ctx.fillRect(x - b.w * 0.07, y - b.h * 0.17, b.w * 0.14, b.h * 0.035);
        toggle(ctx, x, y, b.h * 0.07);
      }
      break;
    }
    case 'gearInd':
      ctx.fillStyle = BEZEL; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#050608'; ctx.fillRect(b.x + b.w * 0.1, b.y + b.h * 0.1, b.w * 0.8, b.h * 0.8);
      for (const [px, py] of [[0.5, 0.3], [0.3, 0.68], [0.7, 0.68]]) { ctx.fillStyle = '#d7dadd'; ctx.fillRect(b.x + b.w * (px - 0.1), b.y + b.h * (py - 0.07), b.w * 0.2, b.h * 0.14); }
      break;
    case 'annun': { // 6 across, 4 down, all unlit
      ctx.fillStyle = BLACK; ctx.fillRect(b.x, b.y, b.w, b.h);
      const cw = b.w / 6, ch = b.h / 4;
      for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
        ctx.fillStyle = j === 0 ? '#2a1212' : '#262014';
        ctx.fillRect(b.x + i * cw + 1.5, b.y + j * ch + 1.5, cw - 3, ch - 3);
      }
      break;
    }
    case 'emerGear':
      stripes(ctx, b.x, b.y, b.w, b.h, 3);
      break;
    default:
  }
}

/** An instrument's outer size on its panel, feet: { w, h } (the square bezel when it has one). */
function outerFt(inst, faceW, faceH) {
  const s = inst.s ?? inst.d;
  if (s) return { w: s * faceW, h: s * faceW };
  return { w: inst.w * faceW, h: inst.h * faceH };
}
/** An instrument's face (what its live quad covers), feet: the round dial inside a square bezel, or the whole box. */
function faceFt(inst, faceW, faceH) {
  if (inst.d) return { w: inst.d * faceW, h: inst.d * faceW };
  return outerFt(inst, faceW, faceH);
}

/** A panel's static picture: the grey face with its seams and every instrument drawn once (live ones dashed under their quads). */
function drawStaticPanel(ctx, width, height, instruments, faceW, faceH) {
  ctx.fillStyle = PANEL_GREY;
  ctx.fillRect(0, 0, width, height);
  const k = width / faceW;
  // The panel's edge and its sub-panel seams, as they read in the pictures.
  ctx.strokeStyle = 'rgba(40, 44, 48, 0.6)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, width - 6, height - 6);
  ctx.strokeStyle = SEAM;
  ctx.lineWidth = 2;
  for (const [u0, v0, u1, v1] of [[0.02, 0.27, 0.36, 0.27], [0.37, 0.02, 0.37, 0.98], [0.61, 0.02, 0.61, 0.98], [0.62, 0.23, 0.98, 0.23], [0.02, 0.69, 0.36, 0.69]]) {
    ctx.beginPath(); ctx.moveTo(u0 * width, (1 - v0) * height); ctx.lineTo(u1 * width, (1 - v1) * height); ctx.stroke();
  }
  for (const inst of instruments) {
    const o = outerFt(inst, faceW, faceH);
    const w = o.w * k, h = o.h * k;
    const box = { x: inst.u * width - w / 2, y: (1 - inst.v) * height - h / 2, w, h };
    if (inst.s && inst.d) {
      squareBezel(ctx, box.x, box.y, box.w, box.h);
      const f = faceFt(inst, faceW, faceH);
      const fw = f.w * k;
      drawInstrument(ctx, inst.kind, { x: inst.u * width - fw / 2, y: (1 - inst.v) * height - fw / 2, w: fw, h: fw }, null, inst);
    } else {
      if (inst.frame || inst.kind === 'eng') { ctx.fillStyle = BEZEL; ctx.fillRect(box.x - 4, box.y - 4, box.w + 8, box.h + 8); }
      drawInstrument(ctx, inst.kind, box, null, inst);
    }
  }
}

/**
 * The lower panel's picture (both seats; Dad's pictures 17, 26, 27): the centre pedestal with its control box, a red
 * readout and a grid of keys; the landing gear panel with its three lights left of the left knee well; a small box
 * with a knob right of the right knee well. u 0 the pilot's left edge, v 0 the floor, v 1 the main face's bottom.
 */
function drawLowerPanel(ctx, width, height) {
  ctx.fillStyle = PANEL_GREY;
  ctx.fillRect(0, 0, width, height);
  const X = (u) => u * width, Y = (v) => (1 - v) * height;
  // The pedestal (u 0.4 to 0.6): a control box, a red readout, a grid of keys, a dark foot.
  ctx.fillStyle = '#1b1e22'; ctx.fillRect(X(0.41), Y(0.97), X(0.18), Y(0.82) - Y(0.97));
  for (let i = 0; i < 4; i++) toggle(ctx, X(0.44 + i * 0.04), Y(0.9), height * 0.012);
  knob(ctx, X(0.44), Y(0.85), height * 0.014); knob(ctx, X(0.56), Y(0.85), height * 0.014);
  ctx.fillStyle = '#1b1e22'; ctx.fillRect(X(0.43), Y(0.78), X(0.14), Y(0.66) - Y(0.78));
  ctx.fillStyle = '#5a1012'; ctx.fillRect(X(0.46), Y(0.76), X(0.08), Y(0.7) - Y(0.76));
  ctx.fillStyle = '#1b1e22'; ctx.fillRect(X(0.43), Y(0.62), X(0.14), Y(0.4) - Y(0.62));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) { ctx.fillStyle = '#0a0b0d'; ctx.fillRect(X(0.445 + i * 0.04), Y(0.6 - j * 0.05), X(0.03), Y(0.565) - Y(0.6)); }
  ctx.fillStyle = '#4c5055'; ctx.fillRect(X(0.4), Y(0.18), X(0.2), Y(0) - Y(0.18));
  // The landing gear panel (left of the left knee well): three unlit lights and the handle's slot (the handle is 3D).
  ctx.fillStyle = '#1b1e22'; ctx.fillRect(X(0.02), Y(0.99), X(0.13), Y(0.82) - Y(0.99));
  for (const [px, py] of [[0.085, 0.965], [0.05, 0.94], [0.12, 0.94]]) { ctx.fillStyle = '#0f2a14'; ctx.beginPath(); ctx.arc(X(px), Y(py), height * 0.012, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#050608'; ctx.fillRect(X(0.077), Y(0.92), X(0.016), Y(0.84) - Y(0.92));
  stripes(ctx, X(0.155), Y(0.99), X(0.04), Y(0.93) - Y(0.99), 3);
  // The box right of the right knee well.
  ctx.fillStyle = '#1b1e22'; ctx.fillRect(X(0.84), Y(0.99), X(0.13), Y(0.88) - Y(0.99));
  knob(ctx, X(0.905), Y(0.935), height * 0.02);
  // Placard lines.
  ctx.fillStyle = '#c9ced4';
  for (const [u, v] of [[0.03, 0.8], [0.85, 0.86], [0.43, 0.38]]) ctx.fillRect(X(u), Y(v), X(0.1), height * 0.006);
}

/**
 * The side consoles' tops (both seats; Dad's pictures 17, 26, 29): the left console in the left half, the right in the
 * right half, aft (v 0) to forward (v 1). Dark sub-panels with knobs, toggles and placard lines, yellow and black
 * striped guards, a red switch on the right. Drawn by eye, no layout copied.
 */
function drawConsoles(ctx, width, height) {
  ctx.fillStyle = '#7d8185';
  ctx.fillRect(0, 0, width, height);
  const half = width / 2;
  const Y = (v) => (1 - v) * height;
  const panel = (x0, v0, v1) => {
    ctx.fillStyle = '#25282c';
    ctx.fillRect(x0 + half * 0.08, Y(v1), half * 0.84, Y(v0) - Y(v1));
    screws(ctx, x0 + half * 0.08, Y(v1), half * 0.84, Y(v0) - Y(v1), half * 0.06, 2);
  };
  // Left console (u 0 is its outboard edge).
  for (const [v0, v1] of [[0.02, 0.2], [0.22, 0.36], [0.38, 0.62], [0.64, 0.8], [0.82, 0.98]]) panel(0, v0, v1);
  stripes(ctx, half * 0.2, Y(0.33), half * 0.6, Y(0.25) - Y(0.33), 4);
  stripes(ctx, half * 0.55, Y(0.78), half * 0.3, Y(0.68) - Y(0.78), 3);
  ctx.fillStyle = '#050608'; ctx.fillRect(half * 0.42, Y(0.6), half * 0.16, Y(0.42) - Y(0.6)); // the power lever's slot
  for (const v of [0.1, 0.15, 0.87, 0.93]) for (const u of [0.3, 0.5, 0.7]) toggle(ctx, half * u, Y(v), 4);
  // Right console.
  for (const [v0, v1] of [[0.02, 0.16], [0.18, 0.34], [0.36, 0.5], [0.52, 0.7], [0.72, 0.86], [0.88, 0.98]]) panel(half, v0, v1);
  stripes(ctx, half * 1.25, Y(0.47), half * 0.5, Y(0.39) - Y(0.47), 4);
  ctx.fillStyle = '#b3202a'; ctx.fillRect(half * 1.42, Y(0.46), half * 0.16, Y(0.4) - Y(0.46));
  for (const [u, v] of [[1.35, 0.6], [1.65, 0.6], [1.5, 0.27], [1.35, 0.79], [1.65, 0.79]]) knob(ctx, half * u, Y(v), 6);
  for (const v of [0.08, 0.12, 0.93]) for (const u of [1.3, 1.5, 1.7]) toggle(ctx, half * u, Y(v), 4);
  ctx.fillStyle = '#c9ced4';
  for (const [u, v] of [[0.2, 0.47], [0.2, 0.72], [1.2, 0.66], [1.2, 0.3], [1.2, 0.82]]) ctx.fillRect(half * u, Y(v), half * 0.6, 2);
}

/** The live faces, each into its window of the shared picture. */
function drawLive(ctx, hud) {
  ctx.clearRect(0, 0, ATLAS.width, ATLAS.height);
  for (const [kind, win] of Object.entries(LIVE_WINDOWS)) drawInstrument(ctx, kind, win, hud ?? {});
}

/** What the panel shows, rounded to what it can show: a change smaller than this doesn't redraw it. */
function panelKey(hud) {
  if (!hud) return 'none';
  const r = (x, step) => (Number.isFinite(x) ? Math.round(x / step) : 'x');
  return [r(hud.pitchDeg, 0.5), r(hud.bankDeg, 0.5), r(hud.kias, 1), r(hud.altFt, 10), r(hud.headingDeg, 1), r(hud.g, 0.1)].join('|');
}

// ---------- the 3D parts ----------

/** A box from its corners (feet). */
function box(THREE, x0, x1, y0, y1, z0, z1) {
  return new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

/** A flat face in the plane x = const facing aft (feet), from an outline of [y, z] points, with uv over a box. */
function flatAft(THREE, x, outline, uvBox = null) {
  const shape = new THREE.Shape(outline.map(([y, z]) => new THREE.Vector2(y, z)));
  const g = new THREE.ShapeGeometry(shape);
  const p = g.attributes.position, uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const y = p.getX(i), z = p.getY(i);
    p.setXYZ(i, x, y, z);
    n.setXYZ(i, -1, 0, 0);
    if (uvBox) uv.setXY(i, (uvBox.y0 - y) / (uvBox.y0 - uvBox.y1), (z - uvBox.z0) / (uvBox.z1 - uvBox.z0));
  }
  return g;
}

/**
 * A lofted surface through sections of equal point count (each an array of [x, y, z] feet), closed round each section
 * when `closed`; with `caps`, both end sections closed with a fan. Flat-shaded, or smooth (shared corners) with `smooth`.
 */
function loft(THREE, sections, { closed = true, caps = false, smooth = false } = {}) {
  const m = sections[0].length;
  const g = new THREE.BufferGeometry();
  if (smooth) {
    const pos = sections.flat(2), idx = [];
    for (let i = 0; i + 1 < sections.length; i++) {
      for (let j = 0; j < (closed ? m : m - 1); j++) {
        const a = i * m + j, b = i * m + ((j + 1) % m), c = a + m, d = b + m;
        idx.push(a, c, d, a, d, b);
      }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  for (let i = 0; i + 1 < sections.length; i++) {
    const A = sections[i], B = sections[i + 1];
    for (let j = 0; j < (closed ? m : m - 1); j++) {
      const k = (j + 1) % m;
      tri(A[j], B[j], B[k]);
      tri(A[j], B[k], A[k]);
    }
  }
  if (caps) {
    for (const S of [sections[0], sections[sections.length - 1]]) {
      const c = S.reduce((s, p) => [s[0] + p[0] / m, s[1] + p[1] / m, s[2] + p[2] / m], [0, 0, 0]);
      for (let j = 0; j < m; j++) tri(c, S[j], S[(j + 1) % m]);
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Corner-cutting smoothing of an open polyline (points as number arrays), keeping its two ends. */
function chaikin(pts, iterations = 2) {
  let p = pts;
  for (let k = 0; k < iterations; k++) {
    const q = [p[0]];
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i], b = p[i + 1];
      q.push(a.map((v, j) => 0.75 * v + 0.25 * b[j]), a.map((v, j) => 0.25 * v + 0.75 * b[j]));
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

/** A round tube through points (feet): straight runs, or a smooth curve through them with `smooth`. */
function tubeThrough(THREE, pts, radius, segments = 64, { smooth = false, radial = 6 } = {}) {
  const v = pts.map((q) => new THREE.Vector3(...q));
  let path;
  if (smooth) path = new THREE.CatmullRomCurve3(v, false, 'centripetal');
  else {
    path = new THREE.CurvePath();
    for (let i = 0; i + 1 < v.length; i++) path.add(new THREE.LineCurve3(v[i], v[i + 1]));
  }
  return new THREE.TubeGeometry(path, segments, radius, radial, false);
}

/**
 * A coaming's half-outline across y at station x, from the middle out (feet, [y, z] pairs, before the glass clamp): a
 * flat top, shoulders falling to the panel's straight sides (at the aft edge they follow the panel's tombstone, the
 * rail's line), then a short skirt (TS-157).
 */
function hoodHalf(h, ts, x) {
  const t = clamp01((x - h.aftX) / (h.foreX - h.aftX));
  const crown = crownZ(h, x);
  const topY = ts.top + RIM_FT.sideOut * 0.4 + h.topGrow * t;
  const sideY = ts.side + RIM_FT.sideOut + h.sideGrow * t;
  const drop = h.top - ts.shoulderZ + h.dropGrow * t;
  const pts = [[0, crown], [topY, crown]];
  for (let k = 1; k <= 6; k++) {
    const s = k / 6;
    pts.push([lerp(topY, sideY, s), crown - drop * s ** 1.15]);
  }
  pts.push([sideY + 0.01, crown - drop - h.skirt]);
  return pts;
}
/** A coaming's surface height at (x, y), feet (for standing things on it). */
function hoodZ(h, ts, x, y) {
  const half = hoodHalf(h, ts, x);
  const ay = Math.abs(y);
  for (let i = 1; i < half.length; i++) {
    if (ay <= half[i][0]) {
      const [y0, z0] = half[i - 1], [y1, z1] = half[i];
      return lerp(z0, z1, (ay - y0) / (y1 - y0 || 1));
    }
  }
  return half[half.length - 1][1];
}
/** A coaming's full section at x (left skirt over to right skirt), [x, y, z] feet, kept inside the glass, lowered by dz. */
function hoodSection(h, ts, x, dz = 0) {
  const half = hoodHalf(h, ts, x).map(([y, z]) => [Math.min(y, glassHalfWidthFt(z, x, 0.04)), z + dz]);
  return [...half.slice(1).reverse().map(([y, z]) => [x, y, z]), [x, 0, half[0][1]], ...half.slice(1).map(([y, z]) => [x, -y, z])];
}

/** An arch outline in the plane (y, z) between y0 and y1 (y0 > y1), up from zBottom to zTop with rounded corners of radius r. */
function archOutline(y0, y1, zBottom, zTop, r) {
  const pts = [[y0, zBottom], [y0, zTop - r]];
  for (let k = 1; k < 4; k++) { const a = (k / 4) * (Math.PI / 2); pts.push([y0 - r + r * Math.cos(a), zTop - r + r * Math.sin(a)]); }
  pts.push([y0 - r, zTop], [y1 + r, zTop]);
  for (let k = 1; k < 4; k++) { const a = Math.PI / 2 + (k / 4) * (Math.PI / 2); pts.push([y1 + r + r * Math.cos(a), zTop - r + r * Math.sin(a)]); }
  pts.push([y1, zTop - r], [y1, zBottom]);
  return pts;
}

/**
 * A band lining the glass at x = b.bandX facing aft (feet): from just inside the glass b.bandDepth inward, sill to sill,
 * with rows of round dark dots (the forward bow's ring of holes, TS-156; the arch's fasteners, TS-157) and a dark tube
 * along its inner edge. Returns { band, dots, tube }.
 */
function bandGeometries(THREE, b) {
  const n = 48;
  const pts = ct156HoopPoints(b.bandX / F, n);
  const base = ct156CanopySection(b.bandX / F).base * F;
  const inward = ({ y, z }, d) => {
    const dy = -y * F, dz = base - z * F;
    const l = Math.hypot(dy, dz) || 1;
    return [b.bandX, y * F + (dy / l) * d, z * F + (dz / l) * d];
  };
  const outer = pts.map((q) => inward(q, b.glassInset)), inner = pts.map((q) => inward(q, b.glassInset + b.bandDepth));
  const band = loft(THREE, [outer, inner], { closed: false });
  const tube = tubeThrough(THREE, inner, b.tubeR, 60, { smooth: true, radial: 5 });
  const dots = [];
  for (const row of b.dots) {
    // Evenly spaced by length along the row's line, half a spacing in from each sill.
    const mid = pts.map((q) => inward(q, b.glassInset + b.bandDepth * row.at));
    const along = [0];
    for (let j = 1; j < mid.length; j++) along.push(along[j - 1] + Math.hypot(mid[j][1] - mid[j - 1][1], mid[j][2] - mid[j - 1][2]));
    const total = along[along.length - 1];
    for (let k = 0; k < row.n; k++) {
      const want = ((k + 0.5) / row.n) * total;
      let j = 1;
      while (j < along.length - 1 && along[j] < want) j++;
      const t = (want - along[j - 1]) / (along[j] - along[j - 1] || 1);
      const y = mid[j - 1][1] + (mid[j][1] - mid[j - 1][1]) * t, z = mid[j - 1][2] + (mid[j][2] - mid[j - 1][2]) * t;
      dots.push(new THREE.CircleGeometry(row.dia / 2, row.dia > 0.05 ? 14 : 6).rotateY(-Math.PI / 2).translate(b.bandX - 0.004, y, z));
    }
  }
  return { band, dots, tube };
}

/** A mirror at `pos` (feet) turned to face `eye`: [back, face, stalk to the glass at `mount`]. w x h feet. */
function mirrorGeometries(THREE, pos, eye, mount, w = 0.34, h = 0.17) {
  const p = new THREE.Vector3(...pos);
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(eye.x, eye.y, eye.z), p, new THREE.Vector3(0, 0, 1));
  m.setPosition(p);
  return [
    new THREE.BoxGeometry(w, h, 0.03).applyMatrix4(m),
    new THREE.PlaneGeometry(w * 0.9, h * 0.85).translate(0, 0, 0.0155).applyMatrix4(m),
    tubeThrough(THREE, [pos, mount], 0.018, 1, { radial: 5 }),
  ];
}

/** The canopy's side frames inside the glass, both sides, from the forward bow to the rear frame, with their fasteners (TS-157). */
function sideFrameParts(THREE) {
  const x0 = FORWARD_BOW_FT.bandX, x1 = CT156_FRAME_X[2] * F + 0.2, N = 28;
  const { height, thick, pitch } = SIDE_FRAME_FT;
  const frames = [], nubs = [];
  const glassAt = (x, z) => Math.min(glassHalfWidthFt(z, x, 0.006), ct156CanopySection(x / F).w * F);
  for (const s of [1, -1]) {
    const sections = [];
    for (let i = 0; i <= N; i++) {
      const x = lerp(x0, x1, i / N);
      const base = ct156CanopySection(x / F).base * F + 0.004;
      const yb = glassAt(x, base + 0.001), yt = glassAt(x, base + height);
      sections.push([[x, s * yb, base], [x, s * yt, base + height], [x, s * (yt - thick), base + height], [x, s * (yb - thick), base]]);
    }
    frames.push(loft(THREE, sections, { closed: false }));
    for (let x = x0 - pitch / 2; x > x1; x -= pitch) {
      const z = ct156CanopySection(x / F).base * F + height - 0.05;
      const y = s * (glassAt(x, z) - thick - 0.006);
      nubs.push(box(THREE, x - 0.017, x + 0.017, y - 0.008, y + 0.008, z - 0.017, z + 0.017));
    }
  }
  return { frames, nubs };
}

/** The sill bands, both sides, from the forward bow to the rear bow (feet): 0.2 ft inside the canopy's foot, and out over the cut edge. */
function sillGeometry(THREE) {
  const x0 = CT156_FRAME_X[0] * F, x1 = CT156_FRAME_X[2] * F, N = 20;
  const parts = [];
  for (const s of [1, -1]) {
    const sections = [];
    for (let i = 0; i <= N; i++) {
      const x = x0 + ((x1 - x0) * i) / N;
      const c = ct156CanopySection(x / F);
      const w = c.w * F, z = c.base * F + 0.006;
      sections.push([[x, s * (w + 0.35), z], [x, s * (w - 0.2), z]]); // out past the glass, over the fuselage's cut edge
    }
    parts.push(loft(THREE, sections, { closed: false }));
  }
  return parts;
}

/** An air vent at a panel's upper corner (Dad's pictures 26, 27): a dark housing turned toward the seat with four slats. */
function ventParts(THREE, x, y, z, put, SLOT) {
  const s = Math.sign(y);
  const turn = (g) => g.rotateZ(s * rad(-35)).translate(x, y, z);
  put(turn(box(THREE, -0.04, 0.06, -0.13, 0.13, -0.08, 0.08)), SLOT.dark);
  for (let k = 0; k < 4; k++) put(turn(box(THREE, -0.05, -0.04, -0.11, 0.11, -0.055 + k * 0.037, -0.045 + k * 0.037)), SLOT.black);
}

// Material slots for the joined solid parts.
const SLOT = Object.freeze({
  grey: 0, black: 1, rail: 2, red: 3, mirror: 4, knob: 5, lampRed: 6, lampAmber: 7, lampGreen: 8, band: 9, seat: 10,
  dark: 11, green: 12, metal: 13, frame: 14,
});

/**
 * The cockpit parts of one seat (dx 0 the front, REAR_DX the rear), as { geometry, materials } entries for
 * ct156JoinGeometries, plus what the textured faces need.
 */
function seatParts(THREE, { dx, p, h, eye }) {
  const parts = [], striped = [], consoleTops = [], lower = [];
  const put = (geometry, slot) => parts.push({ geometry, materials: [slot] });
  const ts = tombstone(p);
  const faceW = 2 * ts.side, faceH = ts.height;
  const zOf = (v) => p.bottom + v * faceH;
  const yOf = (u) => ts.side * (1 - 2 * u);
  const S = SEAT_FT;
  const fx = (x) => x + dx; // a front-seat station moved to this seat
  const front = dx === 0;

  // The panel's back and edges: a shallow black box behind the face, so it reads solid from any side.
  put(box(THREE, p.x + 0.01, p.x + 0.12, -ts.side, ts.side, p.bottom, ts.shoulderZ), SLOT.black);

  // The lower panel (TS-157; Dad's pictures 17, 26): one face from the main face's bottom to the floor, the consoles'
  // fronts cut out of its sides and the two knee wells out of its foot, with the centre pedestal between them.
  const k = S.knee, c = S.console, floor = S.floorZ;
  const wellTop = p.bottom - k.belowPanel;
  const right = archOutline(-k.inner, -k.outer, floor, wellTop, k.r), left = archOutline(k.outer, k.inner, floor, wellTop, k.r);
  const outline = [
    [ts.side, p.bottom], [-ts.side, p.bottom], [-ts.side, c.top], [-c.inner, c.top], [-c.inner, floor],
    ...right.slice().reverse(), ...left.slice().reverse(), [c.inner, floor], [c.inner, c.top], [ts.side, c.top],
  ];
  lower.push(flatAft(THREE, p.x + 0.002, outline, { y0: ts.side, y1: -ts.side, z0: floor, z1: p.bottom }));
  // The knee wells' dark recesses, with the rudder pedals in them.
  for (const arch of [left, right]) {
    const ys = arch.map(([y]) => y);
    const mid = (Math.max(...ys) + Math.min(...ys)) / 2;
    put(loft(THREE, [arch.map(([y, z]) => [p.x + 0.004, y, z]), arch.map(([y, z]) => [p.x + k.depth, y, z])], { closed: false }), SLOT.black);
    put(flatAft(THREE, p.x + k.depth, arch), SLOT.black);
    put(box(THREE, p.x + k.depth - 0.18, p.x + k.depth - 0.14, mid - 0.1, mid + 0.1, floor + 0.08, floor + 0.42), SLOT.dark);
  }
  // On the pedestal: the control box standing proud, under it the readout's hood.
  put(box(THREE, p.x - 0.05, p.x, -0.2, 0.2, p.bottom - 0.32, p.bottom - 0.04), SLOT.dark);

  // The coaming (TS-157): the moulded hood and its lip, smooth-shaded.
  const N = 14;
  const secs = [];
  for (let i = 0; i <= N; i++) secs.push(hoodSection(h, ts, lerp(h.aftX, h.foreX, (i / N) ** 1.3)));
  put(loft(THREE, secs, { closed: false, smooth: true }), SLOT.black);
  put(loft(THREE, [hoodSection(h, ts, h.aftX), hoodSection(h, ts, h.aftX, -h.lipDrop)], { closed: false }), SLOT.black);
  // The three lamps on a light strip on the lip, under the rail (Dad's pictures 17, 18, 26; AETCMAN 11-248 Fig 2.7).
  const lx = h.aftX - 0.003, lz = h.top - h.lipDrop / 2 - 0.015;
  put(box(THREE, lx - 0.006, lx, -0.42, 0.42, lz - 0.045, lz + 0.045), SLOT.knob);
  [[0.16, SLOT.lampRed], [0, SLOT.lampAmber], [-0.16, SLOT.lampAmber]].forEach(([y, slot]) => {
    put(box(THREE, lx - 0.02, lx - 0.006, y - 0.055, y + 0.055, lz - 0.035, lz + 0.035), SLOT.black);
    put(box(THREE, lx - 0.024, lx - 0.02, y - 0.042, y + 0.042, lz - 0.025, lz + 0.025), slot);
  });

  // The grab rail (the rim): along the coaming's aft edge and down the panel's sides to brackets (TS-156, TS-157).
  const rx = h.aftX - RIM_FT.aftOfGlareshield;
  const edge = hoodHalf(h, ts, h.aftX).slice(0, -1).map(([y, z]) => [Math.min(y, glassHalfWidthFt(z, rx, 0.06)), z]);
  const sideY = edge[edge.length - 1][0], lowZ = zOf(RIM_FT.lowV);
  const rail = chaikin([[sideY, lowZ], ...edge.slice(1).reverse(), ...edge.slice(1).map(([y, z]) => [-y, z]), [-sideY, lowZ]].map(([y, z]) => [rx, y, z]), 2);
  put(tubeThrough(THREE, rail, RIM_FT.r, 72, { smooth: true, radial: 7 }), SLOT.rail);
  for (const end of [rail[0], rail[rail.length - 1]]) {
    put(tubeThrough(THREE, [end, [end[0], end[1], end[2] - 0.05], [p.x, end[1] * 0.96, end[2] - 0.1]], 0.028, 6, { radial: 6 }), SLOT.rail);
  }
  // The rear hump's second rail, across its top near the front (Dad's pictures 27, 29).
  if (!front) {
    const xr = lerp(h.aftX, h.foreX, 0.72);
    const top = hoodHalf(h, ts, xr).map(([y, z]) => [Math.min(y, glassHalfWidthFt(z, xr, 0.08)), z + 0.1]);
    const arc = chaikin([...top.slice(1).reverse(), ...top.slice(1).map(([y, z]) => [-y, z])].map(([y, z]) => [xr, y, z]), 2);
    put(tubeThrough(THREE, arc, 0.04, 48, { smooth: true, radial: 7 }), SLOT.rail);
  }
  // The air vents at the panel's upper corners.
  for (const s of [1, -1]) {
    const z = zOf(0.83), y = s * Math.min(ts.side - 0.05, glassHalfWidthFt(z, p.x - 0.1, 0.16));
    ventParts(THREE, p.x - 0.12, y, z, put, SLOT);
  }

  // The AOA indexer on the coaming's left and the standby compass on its right (AETCMAN 11-248 Fig 2.7, Fig 5.3, TS-156;
  // the rear one on the hump, Dad's picture 27): a tall narrow box with three stacked lamps; a round face in a small
  // housing on a bracket. All unlit or static.
  {
    const ax = h.aftX + 0.15, ay = front ? 0.74 : 0.62, az = hoodZ(h, ts, ax, ay);
    put(box(THREE, ax - 0.05, ax + 0.05, ay - 0.04, ay + 0.04, az - 0.04, az + 0.3), SLOT.black);
    [SLOT.lampGreen, SLOT.lampAmber, SLOT.lampRed].forEach((slot, i) => {
      const z = az + 0.24 - i * 0.085;
      put(box(THREE, ax - 0.055, ax - 0.05, ay - 0.025, ay + 0.025, z - 0.03, z + 0.03), slot);
    });
    const cx = h.aftX + 0.22, cy = front ? -0.55 : -0.58, cz = hoodZ(h, ts, cx, cy);
    put(box(THREE, cx - 0.02, cx + 0.02, cy - 0.02, cy + 0.02, cz - 0.04, cz + 0.1), SLOT.black); // the bracket
    put(box(THREE, cx - 0.08, cx + 0.08, cy - 0.08, cy + 0.08, cz + 0.08, cz + 0.22), SLOT.black); // the housing
    put(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 18).rotateZ(Math.PI / 2).translate(cx - 0.085, cy, cz + 0.15), SLOT.knob); // the face
    put(box(THREE, cx - 0.092, cx - 0.09, cy - 0.003, cy + 0.003, cz + 0.11, cz + 0.19), SLOT.black); // its lubber line
  }

  // The instruments' square bezels standing proud of the face (Dad's pictures 17, 26).
  for (const inst of PANEL_INSTRUMENTS) {
    if (!inst.s && !inst.frame && inst.kind !== 'eng') continue;
    const o = outerFt(inst, faceW, faceH);
    const yc = yOf(inst.u), zc = zOf(inst.v), hw = o.w / 2 + 0.012, hh = o.h / 2 + 0.012, t = 0.024;
    const x0 = p.x - 0.03, x1 = p.x - 0.002;
    put(box(THREE, x0, x1, yc - hw, yc + hw, zc + hh - t, zc + hh), SLOT.dark);
    put(box(THREE, x0, x1, yc - hw, yc + hw, zc - hh, zc - hh + t), SLOT.dark);
    put(box(THREE, x0, x1, yc - hw, yc - hw + t, zc - hh + t, zc + hh - t), SLOT.dark);
    put(box(THREE, x0, x1, yc + hw - t, yc + hw, zc - hh + t, zc + hh - t), SLOT.dark);
  }
  // The emergency gear handle (a yellow and black T on the main face's lower left) and the landing gear handle (a lever
  // with its light wheel knob on the lower panel, left of the left knee well; Dad's pictures 17, 26, 27).
  {
    const eg = PANEL_INSTRUMENTS.find((i) => i.kind === 'emerGear');
    const y = yOf(eg.u), z = zOf(eg.v);
    striped.push(box(THREE, p.x - 0.12, p.x - 0.01, y - 0.012, y + 0.012, z - 0.012, z + 0.012), box(THREE, p.x - 0.14, p.x - 0.11, y - 0.06, y + 0.06, z - 0.018, z + 0.018));
    const gy = (k.outer + ts.side) / 2 - 0.04, gz = lerp(c.top, p.bottom, 0.35);
    put(box(THREE, p.x - 0.11, p.x, gy - 0.014, gy + 0.014, gz - 0.01, gz + 0.11), SLOT.metal);
    put(new THREE.CylinderGeometry(0.055, 0.055, 0.035, 16).rotateZ(Math.PI / 2).translate(p.x - 0.13, gy, gz + 0.11), SLOT.knob);
  }

  // The seat (Dad's pictures 26, 27, 29): a dark bucket, light grey cushion with a front roll and thigh bolsters, a
  // light grey back cushion in front of the model's seat back, the dark headbox with the canopy breakers on top,
  // harness straps lying on the cushions with a buckle, the yellow and black handle between the legs and the green
  // oxygen hose to the right console.
  const { pan, backCushion: bc, headbox: hb, breakers: br } = S;
  put(box(THREE, fx(pan.aft), fx(pan.fore) - 0.05, -pan.halfWidth, pan.halfWidth, floor + 0.15, pan.z0), SLOT.dark);
  for (const s of [1, -1]) put(box(THREE, fx(pan.aft) - 0.1, fx(pan.fore) - 0.1, s * pan.halfWidth, s * (pan.halfWidth + 0.06), floor + 0.1, pan.z1 + 0.12), SLOT.dark);
  put(box(THREE, fx(pan.aft), fx(pan.fore) - 0.06, -pan.halfWidth + 0.02, pan.halfWidth - 0.02, pan.z0, pan.z1), SLOT.seat);
  put(new THREE.CylinderGeometry(0.075, 0.075, 2 * pan.halfWidth - 0.04, 12).translate(fx(pan.fore) - 0.075, 0, (pan.z0 + pan.z1) / 2), SLOT.seat);
  for (const s of [1, -1]) put(new THREE.SphereGeometry(1, 14, 7).scale(0.26, 0.14, 0.085).translate(fx(pan.fore) - 0.3, s * 0.33, pan.z1 + 0.01), SLOT.seat);
  put(box(THREE, fx(pan.aft), fx(pan.aft) + bc.depth, -bc.halfWidth, bc.halfWidth, pan.z1 - 0.02, bc.z1), SLOT.seat);
  put(box(THREE, fx(hb.aft), fx(hb.fore), -hb.halfWidth, hb.halfWidth, hb.z0, hb.z1), SLOT.dark);
  for (const s of [1, -1]) {
    const y = s * br.y, x = fx(hb.aft) + 0.12;
    put(box(THREE, x - 0.03, x + 0.03, y - 0.025, y + 0.025, hb.z1, br.top - 0.08), SLOT.dark);
    put(new THREE.ConeGeometry(0.035, 0.08, 4).rotateX(Math.PI / 2).translate(x, y, br.top - 0.04), SLOT.dark);
  }
  put(box(THREE, fx(hb.aft) + 0.08, fx(hb.aft) + 0.16, -br.y, br.y, hb.z1 + 0.08, hb.z1 + 0.12), SLOT.dark); // their crossbar
  // The seat's side beams.
  for (const s of [1, -1]) put(box(THREE, fx(pan.aft) - 0.32, fx(pan.aft) - 0.1, s * 0.5, s * 0.6, pan.z0, 2.0), SLOT.dark);
  // Harness: two shoulder straps down the back cushion, two lap belts across the cushion to a buckle.
  const bx = fx(pan.aft) + bc.depth + 0.008;
  for (const s of [1, -1]) {
    put(box(THREE, bx, bx + 0.016, s * 0.13, s * 0.27, pan.z1 + 0.05, bc.z1 - 0.15), SLOT.frame);
    put(box(THREE, fx(pan.aft) + 0.15, fx(pan.aft) + 0.6, s * 0.08, s * 0.45, pan.z1, pan.z1 + 0.016), SLOT.frame);
  }
  put(box(THREE, fx(pan.aft) + 0.5, fx(pan.aft) + 0.64, -0.08, 0.08, pan.z1 + 0.005, pan.z1 + 0.04), SLOT.metal);
  // The seat handle: a yellow and black loop standing at the cushion's front, a red T inside it.
  const hx = fx(pan.fore) - 0.02;
  striped.push(new THREE.TorusGeometry(0.16, 0.03, 6, 16, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(hx, 0, pan.z1 + 0.02));
  put(box(THREE, hx - 0.012, hx + 0.012, -0.012, 0.012, pan.z1, pan.z1 + 0.11), SLOT.red);
  put(box(THREE, hx - 0.015, hx + 0.015, -0.06, 0.06, pan.z1 + 0.1, pan.z1 + 0.13), SLOT.red);
  // The oxygen hose, from the cushion's front right round to the right console.
  put(tubeThrough(THREE, [[fx(pan.fore) - 0.25, -0.12, pan.z1 + 0.03], [fx(pan.fore) - 0.15, -0.42, pan.z1 + 0.06], [fx(1.45), -0.78, pan.z1 + 0.18],
    [fx(1.15), -c.inner - 0.02, c.top - 0.05]], 0.035, 36, { smooth: true, radial: 6 }), SLOT.green);

  // The side consoles, from beside the seat to the panel: grey bodies, their tops pictures (drawConsoles).
  for (const s of [1, -1]) {
    put(box(THREE, fx(c.aft), p.x, s > 0 ? c.inner : -c.outer, s > 0 ? c.outer : -c.inner, floor, c.top), SLOT.grey);
    const q = flatAft(THREE, 0, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    // A unit square turned up to lie on the console top: y from inner to outer, x from aft to forward.
    const pos = q.attributes.position, uv = q.attributes.uv, nor = q.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const a = pos.getY(i), b = pos.getZ(i); // a across, b along
      pos.setXYZ(i, lerp(fx(c.aft), p.x, b), s * lerp(c.inner, c.outer, a), c.top + 0.003);
      nor.setXYZ(i, 0, 0, 1);
      uv.setXY(i, s > 0 ? 0.5 * (1 - a) : 0.5 + 0.5 * a, b);
    }
    consoleTops.push(q);
  }
  // Left console: the power lever (PCL) in its slot with its big grip, the flap lever, a red lever with a striped T.
  const L = (f) => lerp(fx(c.aft), p.x, f); // a station along the console, 0 aft and 1 forward
  const ly = (c.inner + c.outer) / 2;
  {
    const x = L(0.5), tilt = rad(-12);
    put(new THREE.CylinderGeometry(0.018, 0.022, 0.32, 8).rotateX(Math.PI / 2).translate(0, 0, 0.16).rotateY(tilt).translate(x, ly, c.top), SLOT.metal);
    put(box(THREE, -0.07, 0.07, -0.05, 0.05, 0.28, 0.48).rotateY(tilt).translate(x, ly, c.top), SLOT.dark);
    put(box(THREE, -0.075, -0.06, -0.02, 0.02, 0.4, 0.44).rotateY(tilt).translate(x, ly, c.top), SLOT.red);
  }
  put(box(THREE, L(0.86) - 0.01, L(0.86) + 0.01, ly - 0.01, ly + 0.01, c.top, c.top + 0.18), SLOT.metal); // the flap lever
  put(box(THREE, L(0.86) - 0.04, L(0.86) + 0.04, ly - 0.05, ly + 0.05, c.top + 0.17, c.top + 0.2), SLOT.knob);
  put(box(THREE, L(0.18), L(0.34), c.inner + 0.03, c.inner + 0.07, c.top + 0.02, c.top + 0.06), SLOT.red);
  striped.push(box(THREE, L(0.34), L(0.37), c.inner - 0.01, c.inner + 0.11, c.top + 0.02, c.top + 0.07));
  // Right console: knobs, and the red switch under its striped guard.
  for (const [f, dy] of [[0.6, 0.05], [0.6, -0.08], [0.79, 0.05], [0.79, -0.08], [0.27, 0]]) {
    put(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 10).translate(0, 0.02, 0).rotateX(Math.PI / 2).translate(L(f), -ly + dy, c.top), SLOT.knob);
  }
  put(box(THREE, L(0.42), L(0.45), -ly - 0.025, -ly + 0.025, c.top, c.top + 0.06), SLOT.red);
  striped.push(box(THREE, L(0.4), L(0.47), -ly - 0.05, -ly + 0.05, c.top + 0.06, c.top + 0.075));
  // The canopy handle on the right side frame and a small handle on the left (Dad's picture 26).
  {
    const x = fx(1.25), z = ct156CanopySection(x / F).base * F + 0.16, y = -(Math.min(glassHalfWidthFt(z, x, 0), 1.4) - SIDE_FRAME_FT.thick - 0.04);
    const bar = (g) => g.rotateY(rad(-25)).translate(x, y, z);
    put(bar(box(THREE, -0.25, 0.25, -0.03, 0.03, -0.035, 0.035)), SLOT.dark);
    for (let i = 0; i < 4; i++) put(bar(box(THREE, -0.18 + i * 0.1, -0.15 + i * 0.1, -0.045, 0.03, -0.04, 0.04)), SLOT.black);
    const x2 = fx(2.6), z2 = ct156CanopySection(x2 / F).base * F + 0.15, y2 = Math.min(glassHalfWidthFt(z2, x2, 0), 1.4) - SIDE_FRAME_FT.thick - 0.03;
    put(box(THREE, x2 - 0.09, x2 + 0.09, y2 - 0.02, y2, z2 - 0.02, z2 + 0.02), SLOT.metal);
  }
  // The stick: a black boot on the floor, the grey stem leaning 8° forward, the dark grip with its red button.
  const st = S.stick, tilt = rad(st.tiltDeg);
  const stickPart = (g) => g.rotateY(tilt).translate(fx(st.x), 0, floor);
  put(stickPart(new THREE.CylinderGeometry(0.1, 0.22, 0.32, 12).rotateX(Math.PI / 2).translate(0, 0, 0.16)), SLOT.black);
  put(stickPart(new THREE.CylinderGeometry(0.045, 0.05, st.height - 0.3, 10).rotateX(Math.PI / 2).translate(0, 0, (st.height - 0.3) / 2 + 0.2)), SLOT.grey);
  put(stickPart(new THREE.CylinderGeometry(0.065, 0.055, 0.32, 10).rotateX(Math.PI / 2).translate(-0.02, 0, st.height - 0.13)), SLOT.black);
  put(stickPart(box(THREE, -0.075, 0.04, -0.05, 0.05, st.height - 0.02, st.height + 0.04)), SLOT.black);
  put(stickPart(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 8).rotateX(Math.PI / 2).translate(-0.04, 0.015, st.height + 0.05)), SLOT.red);
  put(stickPart(box(THREE, 0.04, 0.06, -0.015, 0.015, st.height - 0.12, st.height - 0.04)), SLOT.red);
  return { parts, striped, consoleTops, lower, ts, faceW, faceH, eye };
}

/** Geometries with position, normal and uv joined into one (non-indexed); the parts are disposed. */
function joinTextured(THREE, geoms) {
  const pos = [], nor = [], uv = [];
  for (const g0 of geoms) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    for (let i = 0; i < n * 3; i++) { pos.push(g.attributes.position.array[i]); nor.push(g.attributes.normal.array[i]); }
    for (let i = 0; i < n * 2; i++) uv.push(g.attributes.uv ? g.attributes.uv.array[i] : 0);
    if (g !== g0) g.dispose();
    g0.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

/**
 * Both cockpits as a THREE.Group to add to a ship's root (createCt156Model), with update(hud) for the panels' live
 * instruments and dispose() to free everything it made. doc: the document its panel canvases are drawn on.
 * @param {any} THREE
 * @param {{ doc?: Document }} [options]
 */
export function createCt156Cockpit(THREE, { doc = globalThis.document } = {}) {
  const group = new THREE.Group();
  group.name = 'ct156-cockpit';
  group.scale.setScalar(1 / F); // built in feet, drawn in the model's units
  const textures = [];
  const canvases = [];
  const canvasTexture = (w, h) => {
    const canvas = doc.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    textures.push(texture);
    canvases.push(canvas);
    return { canvas, ctx: canvas.getContext('2d'), texture };
  };
  const materials = [];
  const own = (m) => (materials.push(m), m);
  const solid = (color, extra = {}) => own(new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide, fog: false, ...extra }));
  const lamp = (color) => own(new THREE.MeshBasicMaterial({ color, fog: false }));
  // Slots as SLOT (TS-157 colours, judged off Dad's pictures 26, 27, 29): mid grey panel and consoles, near-black coaming
  // and rail, red, mirror, light knobs, unlit lamps, the light bow band, light grey seat cushions, dark grey (seat
  // bucket, headbox, bezels, vents), the green oxygen hose, metal, light grey canopy frames and straps.
  const slotMats = [
    solid('#8a8e92'), solid('#1d2023', { roughness: 0.75 }), solid('#1d2024', { roughness: 0.6 }), solid('#b3202a', { roughness: 0.5 }),
    solid('#b9c9da', { roughness: 0.2, metalness: 0.3, emissive: '#5d6f82' }), solid('#c9ced4', { roughness: 0.5 }),
    lamp('#3a1414'), lamp('#3a2c0e'), lamp('#10301a'),
    // The forward bow band, white to light grey (TS-156), a little self-lit so it stays light with the sun ahead.
    solid('#d3d6d9', { roughness: 0.7, emissive: '#7a7d80' }),
    solid('#a3a7ab', { roughness: 0.9 }), solid('#3b3f44', { roughness: 0.8 }), solid('#4d6a2f', { roughness: 0.7 }),
    solid('#a9aeb4', { roughness: 0.35, metalness: 0.7 }), solid('#c2c5c8', { roughness: 0.75, emissive: '#3a3c3e' }),
  ];
  const geometries = [];
  const add = (geometry, material) => {
    geometries.push(geometry);
    const m = new THREE.Mesh(geometry, material);
    group.add(m);
    return m;
  };

  // The live faces' shared picture, the lower panels' and the consoles' pictures (both seats share them).
  const live = canvasTexture(ATLAS.width, ATLAS.height);
  const liveMat = own(new THREE.MeshBasicMaterial({ map: live.texture, side: THREE.DoubleSide, fog: false }));
  const lowerPic = canvasTexture(768, 576);
  drawLowerPanel(lowerPic.ctx, 768, 576);
  lowerPic.texture.needsUpdate = true;
  const lowerMat = own(new THREE.MeshBasicMaterial({ map: lowerPic.texture, side: THREE.DoubleSide, fog: false }));
  const consolePic = canvasTexture(256, 1024);
  drawConsoles(consolePic.ctx, 256, 1024);
  consolePic.texture.needsUpdate = true;
  const consoleMat = own(new THREE.MeshStandardMaterial({ map: consolePic.texture, roughness: 0.85, side: THREE.DoubleSide, fog: false }));

  const seats = [
    { dx: 0, p: PANEL_FT, h: GLARESHIELD_FT, eye: EYES_FT.front, width: 2048 },
    { dx: REAR_DX, p: REAR_PANEL_FT, h: REAR_HUMP_FT, eye: EYES_FT.rear, width: 1024 },
  ];
  const solidParts = [], striped = [], consoleTops = [], lowerFaces = [], liveQuads = [];
  for (const seat of seats) {
    const sp = seatParts(THREE, seat);
    solidParts.push(...sp.parts);
    striped.push(...sp.striped);
    consoleTops.push(...sp.consoleTops);
    lowerFaces.push(...sp.lower);
    const { ts, faceW, faceH } = sp;
    const { p } = seat;
    // The panel's static picture, its pixels square on the face.
    const height = Math.round((seat.width * faceH) / faceW);
    const pic = canvasTexture(seat.width, height);
    drawStaticPanel(pic.ctx, seat.width, height, PANEL_INSTRUMENTS, faceW, faceH);
    pic.texture.needsUpdate = true;
    const panelMat = own(new THREE.MeshBasicMaterial({ map: pic.texture, side: THREE.DoubleSide, fog: false }));
    const outline = [[ts.side, p.bottom], [ts.side, ts.shoulderZ], [ts.top, p.top], [-ts.top, p.top], [-ts.side, ts.shoulderZ], [-ts.side, p.bottom]];
    add(flatAft(THREE, p.x, outline, { y0: ts.side, y1: -ts.side, z0: p.bottom, z1: p.top }), panelMat);
    // The live instruments: small quads just proud of the face, each showing its window of the shared picture.
    for (const inst of PANEL_INSTRUMENTS) {
      if (!inst.live) continue;
      const s = faceFt(inst, faceW, faceH);
      const yc = ts.side * (1 - 2 * inst.u), zc = p.bottom + inst.v * faceH;
      const q = flatAft(THREE, p.x - 0.005, [[yc + s.w / 2, zc - s.h / 2], [yc - s.w / 2, zc - s.h / 2], [yc - s.w / 2, zc + s.h / 2], [yc + s.w / 2, zc + s.h / 2]]);
      const win = LIVE_WINDOWS[inst.live];
      const uv = q.attributes.uv, pos = q.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const fu = (yc + s.w / 2 - pos.getY(i)) / s.w, fv = (pos.getZ(i) - (zc - s.h / 2)) / s.h;
        uv.setXY(i, (win.x + fu * win.w) / ATLAS.width, 1 - (win.y + (1 - fv) * win.h) / ATLAS.height);
      }
      liveQuads.push(q);
    }
  }
  add(joinTextured(THREE, liveQuads), liveMat);
  add(joinTextured(THREE, lowerFaces), lowerMat);
  add(joinTextured(THREE, consoleTops), consoleMat);

  // Round the canopy. The forward bow's light band with its ring of holes and inner tube (TS-156), and a mirror on each
  // canopy side frame just aft of it, turned to the front eye (Dad's pictures 26 and 28; TS-157 moved them off the bow).
  const fb = bandGeometries(THREE, FORWARD_BOW_FT);
  solidParts.push({ geometry: fb.band, materials: [SLOT.band] }, { geometry: fb.tube, materials: [SLOT.black] });
  for (const g of fb.dots) solidParts.push({ geometry: g, materials: [SLOT.black] });
  for (const s of [1, -1]) {
    const x = FORWARD_BOW_FT.bandX - 0.3, z = 1.78, gy = glassHalfWidthFt(z, x, 0.01);
    const [back, face, stalk] = mirrorGeometries(THREE, [x, s * (gy - 0.15), z], EYES_FT.front, [x + 0.04, s * gy, z - 0.03], 0.3, 0.15);
    solidParts.push({ geometry: back, materials: [SLOT.black] }, { geometry: face, materials: [SLOT.mirror] }, { geometry: stalk, materials: [SLOT.black] });
  }
  // The inter-cockpit arch's light band with its fastener rows and inner tube, its two mirrors a third of the way down
  // from the crest turned to the rear eye (Dad's pictures 21, 27; TS-155's places), and the clear inter-cockpit shield
  // under it, down to the rear hump (Dad's picture 28).
  const ab = bandGeometries(THREE, ARCH_FT);
  solidParts.push({ geometry: ab.band, materials: [SLOT.band] }, { geometry: ab.tube, materials: [SLOT.black] });
  for (const g of ab.dots) solidParts.push({ geometry: g, materials: [SLOT.black] });
  {
    const pts = ct156HoopPoints(ARCH_FT.bandX / F, 18);
    const base = ct156CanopySection(ARCH_FT.bandX / F).base * F;
    for (const j of [6, 12]) {
      const { y, z } = pts[j];
      const dy = -y * F, dz = base - z * F, l = Math.hypot(dy, dz);
      const d = ARCH_FT.bandDepth + 0.12;
      const pos = [ARCH_FT.bandX - 0.15, y * F + (dy / l) * d, z * F + (dz / l) * d];
      const [back, face, stalk] = mirrorGeometries(THREE, pos, EYES_FT.rear, [ARCH_FT.bandX - 0.01, y * F + (dy / l) * 0.05, z * F + (dz / l) * 0.05], 0.3, 0.16);
      solidParts.push({ geometry: back, materials: [SLOT.black] }, { geometry: face, materials: [SLOT.mirror] }, { geometry: stalk, materials: [SLOT.black] });
    }
  }
  const rearTs = tombstone(REAR_PANEL_FT);
  {
    const x = ARCH_FT.x + 0.04;
    const hump = hoodSection(REAR_HUMP_FT, rearTs, x).map(([, y, z]) => [y, z]);
    const sideZ = hump[0][1];
    const base = ct156CanopySection(x / F).base * F;
    const hoop = ct156HoopPoints(x / F, 36).map(({ y, z }) => {
      const dy = -y * F, dz = base - z * F, l = Math.hypot(dy, dz) || 1, d = 0.1;
      return [y * F + (dy / l) * d, z * F + (dz / l) * d];
    }).filter(([, z]) => z > sideZ + 0.02);
    const shield = flatAft(THREE, x, [...hoop, ...hump.slice().reverse()]);
    add(shield, own(new THREE.MeshBasicMaterial({ color: '#cfe3f2', transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, fog: false })));
  }
  // The canopy's side frames with their fasteners (Dad's pictures 19, 21, 27) and the sill bands below them.
  const sf = sideFrameParts(THREE);
  for (const g of sf.frames) solidParts.push({ geometry: g, materials: [SLOT.frame] });
  for (const g of sf.nubs) solidParts.push({ geometry: g, materials: [SLOT.dark] });
  for (const g of sillGeometry(THREE)) solidParts.push({ geometry: g, materials: [SLOT.frame] });
  add(ct156JoinGeometries(THREE, solidParts), slotMats);

  // The yellow and black striped parts: the seat handles, the emergency gear T, the console T-handle and guard.
  const stripe = canvasTexture(32, 32);
  stripe.ctx.fillStyle = YELLOW;
  stripe.ctx.fillRect(0, 0, 32, 32);
  stripe.ctx.fillStyle = '#111';
  stripe.ctx.fillRect(0, 0, 16, 32);
  stripe.texture.wrapS = stripe.texture.wrapT = THREE.RepeatWrapping;
  stripe.texture.repeat.set(8, 1);
  stripe.texture.needsUpdate = true;
  const stripeMat = own(new THREE.MeshStandardMaterial({ map: stripe.texture, roughness: 0.6, side: THREE.DoubleSide, fog: false }));
  add(joinTextured(THREE, striped), stripeMat);

  let shownKey = null;
  let shownAt = -Infinity;
  drawLive(live.ctx, null);
  live.texture.needsUpdate = true;

  return {
    group,
    /**
     * The live instruments from the HUD's numbers ({ pitchDeg, bankDeg (right wing down positive), altFt, g, kias,
     * headingDeg }; null shows dashes), in both seats' panels (the same aircraft's numbers). Redraws only when what it
     * shows changed, and not within PANEL_REDRAW_MS of the last redraw. Returns true when it redrew.
     */
    update(hud, nowMs = globalThis.performance?.now?.() ?? Date.now()) {
      const key = panelKey(hud);
      if (key === shownKey || nowMs - shownAt < PANEL_REDRAW_MS) return false;
      shownKey = key;
      shownAt = nowMs;
      drawLive(live.ctx, hud);
      live.texture.needsUpdate = true;
      return true;
    },
    dispose() {
      group.removeFromParent();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
      for (const c of canvases) c.width = c.height = 0;
    },
  };
}

// ---------- riding a ship from one of its seats ----------
// Small helpers for a 3D view that puts its camera in a ship's seat, lifted from what Turn Sim and Turn Fight each do
// (their syncCockpit and aimPov). The Debrief's Cockpit camera uses them (DB-21); moving Turn Sim, Turn Fight and Traffic
// onto them is a separate tidy. A picture only: no flight numbers.

/** How far the head turns from the nose when the view is dragged, degrees: left of the nose and up positive (Turn Sim's and Turn Fight's HEAD). */
export const COCKPIT_HEAD = Object.freeze({ yawDeg: [-160, 160], pitchDeg: [-85, 80] });
/** The view from a seat: 60° across, nothing nearer than 0.5 ft (inside the cockpit), out to 400,000 ft (Turn Sim's and Turn Fight's POV). */
export const COCKPIT_VIEW = Object.freeze({ fovAcrossDeg: 60, nearFt: 0.5, farFt: 400_000 });

/**
 * One CT-156 cockpit (createCt156Cockpit) that moves from ship to ship: mount(root, seat) puts it in the ship `root`
 * (a createCt156Model root built at its default length, its own scale setting its size, as Turn Sim and Turn Fight
 * make them) seen from 'front' or 'rear', building it on first need; mount(null) takes it
 * out and gives that ship back its outside look. update(hud) as createCt156Cockpit's. dispose() frees it.
 * @param {any} THREE
 * @param {{ doc?: Document }} [options]
 */
export function createCockpitMount(THREE, { doc = globalThis.document } = {}) {
  let part = null;
  let root = null;
  let seat = null;
  const unmount = () => {
    if (!root) return;
    setCockpitView(root, { seat: null });
    part?.group.removeFromParent();
    root = null;
    seat = null;
  };
  return {
    mount(nextRoot, nextSeat = 'front') {
      const s = nextSeat === 'rear' ? 'rear' : 'front';
      if (root && root !== nextRoot) unmount();
      if (!nextRoot) return;
      part ??= createCt156Cockpit(THREE, { doc });
      if (root !== nextRoot || seat !== s) {
        nextRoot.add(part.group);
        setCockpitView(nextRoot, { seat: s });
        root = nextRoot;
        seat = s;
      }
    },
    update: (hud, nowMs) => part?.update(hud, nowMs) ?? false,
    get root() {
      return root;
    },
    dispose() {
      unmount();
      part?.dispose();
      part = null;
    },
  };
}

/** The eye of `seat` ('front' or 'rear', EYES_FT) of the ship `root` (a createCt156Model root, sized by its own scale) in world units, as a THREE.Vector3. */
export function cockpitEyeWorld(THREE, root, seat = 'front') {
  const eye = EYES_FT[seat] ?? EYES_FT.front;
  root.updateMatrixWorld(true);
  return root.localToWorld(new THREE.Vector3(eye.x, eye.y, eye.z).divideScalar(CT156_FT_PER_UNIT));
}

/**
 * Points a PerspectiveCamera out of `seat` of the ship `root`: at the eye, along the nose turned by the head (yawDeg
 * left, pitchDeg up, within COCKPIT_HEAD), rolling with the wings, COCKPIT_VIEW.fovAcrossDeg across a box `width` by
 * `height` and nothing nearer than COCKPIT_VIEW.nearFt (in world units: the ship's own scale is the caller's).
 */
export function aimCockpitCamera(THREE, camera, root, { seat = 'front', yawDeg = 0, pitchDeg = 0, width = 1, height = 1, near = COCKPIT_VIEW.nearFt, far = COCKPIT_VIEW.farFt } = {}) {
  /** @type {(v: number, range: readonly number[]) => number} */
  const clampTo = (v, range) => Math.max(range[0], Math.min(range[1], v));
  const eye = cockpitEyeWorld(THREE, root, seat);
  const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(root.quaternion);
  const up = new THREE.Vector3(0, 0, 1).applyQuaternion(root.quaternion);
  camera.aspect = width / Math.max(height, 1);
  camera.fov = Math.min(COCKPIT_VIEW.fovAcrossDeg, 2 * deg(Math.atan(Math.tan(rad(COCKPIT_VIEW.fovAcrossDeg / 2)) / camera.aspect)));
  camera.near = near;
  camera.far = far;
  camera.updateProjectionMatrix();
  camera.position.copy(eye);
  camera.up.copy(up);
  const dir = fwd.clone().applyAxisAngle(up, rad(clampTo(yawDeg, COCKPIT_HEAD.yawDeg)));
  const right = dir.clone().cross(up).normalize();
  dir.applyAxisAngle(right, rad(clampTo(pitchDeg, COCKPIT_HEAD.pitchDeg)));
  camera.lookAt(eye.clone().add(dir));
  camera.updateMatrixWorld(true);
  return camera;
}
