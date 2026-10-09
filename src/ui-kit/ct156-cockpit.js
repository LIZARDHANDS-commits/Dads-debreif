// The CT-156 Harvard II's two cockpits as the student and the instructor see them (Dad's asks, 9 Oct 2026; Patrick
// approved; TS-154, TS-155, TS-156): in each, the tombstone instrument panel with its grab rail under the glareshield, the lower
// panel and knee wells, the side consoles (power lever, flap lever, canopy handle), the stick, the rudder pedals, the
// ejection seat with its handle, and round the canopy the framed bows with their mirrors and the sills. The rear
// cockpit's panel stands behind the front seat, under the inter-cockpit arch. The canopy glass, the round bow tubes,
// the sill rails, the seat backs, the tub (floor and walls), the wings and the tail are the ship's own (ct156-model.js
// setCockpitView). A picture only: no flight numbers, no flight formulas. Like ct156-model.js it imports nothing from
// the app, and three.js is passed in.
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
// Patrick's side-on photo of CT-156 156101) or off Dad's reference pictures of the T-6A cockpit (9 Oct 2026: two
// photos, a poster and two commercial-sim shots; nothing copied from them), as each line says. From V2.208 (TS-156)
// the front eye, the forward bow and the glareshield's rim are placed to AETCMAN 11-248 (13 Aug 2025, the USAF T-6
// primary flying manual): in level flight at 200 KIAS the horizon splits the windscreen half and half (Fig 2.7, p.42),
// and the bow is the wide light band with its ring of round holes (Fig 2.7, Fig 5.3). Page cites only: nothing from
// the manual is copied here (docs/references/aetcman11-248-cockpit.md). The pictures are the T-6A's; the CT-156's own
// panel may differ.
import {
  CT156_UNIT_LENGTH, CT156_LENGTH_FT, CT156_FRAME_X, CT156_SEAT_X, CT156_HELMET_Z, CT156_REFERENCE_POINTS,
  ct156CanopySection, ct156CanopyHalfWidth, ct156HoopPoints, ct156JoinGeometries,
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
 * the front eye to about 2.28 ft, where the front eye used to be); more puts the instructor's helmet into the glass.
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
 * about 4-5°); 22 holes from sill to sill, each 0.07 ft across. Sizes estimates judged off the figures.
 */
export const FORWARD_BOW_FT = Object.freeze({
  x: CT156_FRAME_X[0] * F,
  crestZ: ct156CanopySection(CT156_FRAME_X[0]).top * F,
  bandX: CT156_FRAME_X[0] * F - 0.05,
  glassInset: 0.01,
  bandDepth: 0.15,
  tubeR: 0.025,
  holes: 22,
  holeDia: 0.07,
});

/**
 * The front instrument panel's main face, feet: 3.45 ft ahead of the origin, from 0.65 ft up to the glareshield at
 * 1.85 ft, 2.4 ft across at most and kept 0.06 ft inside the canopy (estimates off Dad's reference pictures). Its
 * outline is a tombstone: straight sides, 45° shoulders over the top 22 %.
 */
export const PANEL_FT = Object.freeze({ x: 3.45, top: 1.85, bottom: 0.65, width: 2.4, insetFromGlass: 0.06 });

/** The glareshield over the front panel, feet: from 0.1 ft behind the panel face to 4.9 ft forward; its lip 0.09 ft deep (estimates). */
export const GLARESHIELD_FT = Object.freeze({ aftX: PANEL_FT.x - 0.1, foreX: 4.9, top: PANEL_FT.top, edgeTop: PANEL_FT.top - 0.05, lip: PANEL_FT.top - 0.09 });
/**
 * The glareshield's rim, the thick dark tube (grab rail) round its aft edge along the panel's tombstone outline: its
 * top run along the glareshield's aft edge, 0.03 ft behind it at the glareshield's own height, 0.045 ft in radius
 * (AETCMAN 11-248 Fig 2.7, p.42; TS-156). Its top is the windscreen's bottom edge straight ahead. Sizes estimates.
 */
export const RIM_FT = Object.freeze({ aftOfGlareshield: 0.03, r: 0.045, sideOut: 0.05 });

/** The rear cockpit's panel and glareshield, feet: face 0.7 ft aft of the origin, 0.9 to 1.9 ft up, 2.2 ft across (estimates). */
export const REAR_PANEL_FT = Object.freeze({ x: -0.7, top: 1.9, bottom: 0.9, width: 2.2, insetFromGlass: 0.06 });
const REAR_GLARESHIELD_FT = Object.freeze({ aftX: -0.8, foreX: -0.3, top: 1.9, edgeTop: 1.85, lip: 1.81 });

/**
 * The front seat and its cockpit, feet (estimates off Dad's reference pictures; the seat back is the model's). The rear
 * seat's are the same moved aft by REAR_DX.
 */
const SEAT_BACK_X = [(CT156_SEAT_X[0] - 0.042) * F, (CT156_SEAT_X[0] - 0.028) * F]; // the model's seat back, aft and front faces
export const SEAT_FT = Object.freeze({
  pan: { aft: SEAT_BACK_X[1], fore: SEAT_BACK_X[1] + 1.2, z0: -0.48, z1: -0.33, halfWidth: 0.55 }, // the eye 2.6 ft above it
  lowerBack: { aft: SEAT_BACK_X[0], fore: SEAT_BACK_X[1], z0: -0.48, z1: 1.04, halfWidth: 0.5 }, // up to the model's back
  headbox: { aft: SEAT_BACK_X[0], fore: SEAT_BACK_X[1], z0: 2.2, z1: 2.7, halfWidth: 0.4 }, // Martin-Baker headbox
  console: { aft: 0.6, inner: 0.95, outer: 1.3, top: 0.35 },
  floorZ: -0.8, // the tub's floor (ct156-model.js tubGeometry)
  stick: { x: 2.2, tiltDeg: 8, height: 1.35 },
});

/** The live instruments redraw at most this often, and only when what they show has changed (a picture; 5 a second is plenty). */
export const PANEL_REDRAW_MS = 200;

const deg = (r) => (r * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;

/** The angle above (+) or below (-) the eye's level line of a round tube's edge (feet; side +1 its top, -1 its bottom). */
function tubeEdgeDeg(eye, x, z, r, side) {
  const d = Math.hypot(x - eye.x, z - eye.z);
  return deg(Math.atan2(z - eye.z, x - eye.x) + side * Math.asin(Math.min(1, r / d)));
}

/**
 * The windscreen as the pilot sees it straight ahead, head level (TS-156): from the top of the glareshield's rim up to
 * the bottom of the bow over him, in degrees above (+) or below (-) the eye's level line along the nose (the model's
 * x axis, so the horizon sits at minus the pitch attitude). Front seat: the forward bow band's inner tube; rear seat:
 * the inter-cockpit arch's lower edge, and headboxDeg, the top of the front seat's headbox, which stands in the middle
 * of the rear seat's view. eyeFt in feet, the model's frame (EYES_FT plus any eye offsets).
 * @returns {{ topDeg: number, bottomDeg: number, heightDeg: number, headboxDeg?: number }}
 */
export function windscreenFrom(eyeFt = EYE_FT, seat = 'front') {
  const rear = seat === 'rear';
  const p = rear ? REAR_PANEL_FT : PANEL_FT;
  const gs = rear ? REAR_GLARESHIELD_FT : GLARESHIELD_FT;
  const bottomDeg = tubeEdgeDeg(eyeFt, gs.aftX - RIM_FT.aftOfGlareshield, p.top, RIM_FT.r, +1);
  let topDeg;
  if (!rear) {
    const b = FORWARD_BOW_FT;
    const crest = ct156CanopySection(b.bandX / F).top * F;
    topDeg = tubeEdgeDeg(eyeFt, b.bandX, crest - b.glassInset - b.bandDepth, b.tubeR, -1);
  } else {
    // The arch's framed bow (bowGeometry): its lower face, the nearer of its two lower corners from the eye.
    const x = CT156_FRAME_X[1] * F;
    topDeg = Math.min(...[x - BOW.half, x + BOW.half].map((cx) => deg(Math.atan2(ct156CanopySection(cx / F).top * F - BOW.depth - eyeFt.z, cx - eyeFt.x))));
  }
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
  const shoulderZ = p.bottom + 0.78 * h;
  let side = p.width / 2;
  for (let i = 0; i <= 8; i++) side = Math.min(side, panelHalfWidthFt(p.bottom + ((shoulderZ - p.bottom) * i) / 8, p));
  const top = Math.min(0.8 * side, panelHalfWidthFt(p.top, p));
  return { side, top, shoulderZ, height: h };
}

// ---------- the panel pictures ----------
// Layouts (estimates off Dad's reference pictures of the T-6A front panel, 9 Oct 2026, placed by eye; none copied):
// u 0 is the pilot's left edge of the main face and 1 its right; v 0 its bottom and 1 its top. Round dials give d (a
// fraction of the face's width); rectangles give w (of its width) and h (of its height); squares give s (of its width).
// Live ones read the HUD's numbers for the aircraft the camera sits in; the rest are drawn once (the sim has no
// numbers for them). Screens that would show radio or navigation data show the tool's own placeholder dashes.

const FRONT_INSTRUMENTS = [
  { kind: 'fire', u: 0.11, v: 0.9, s: 0.05 },
  { kind: 'aoa', u: 0.2, v: 0.84, d: 0.08 },
  { kind: 'asi', u: 0.33, v: 0.83, d: 0.13, live: 'asi' },
  { kind: 'eadi', u: 0.5, v: 0.8, w: 0.2, h: 0.22, live: 'eadi' },
  { kind: 'alt', u: 0.67, v: 0.83, d: 0.13, live: 'alt' },
  { kind: 'vsi', u: 0.8, v: 0.86, d: 0.09 },
  { kind: 'clock', u: 0.17, v: 0.6, d: 0.08 },
  { kind: 'rmu', u: 0.31, v: 0.58, w: 0.11, h: 0.22 },
  { kind: 'ehsi', u: 0.5, v: 0.52, w: 0.2, h: 0.22, live: 'ehsi' },
  { kind: 'engine', u: 0.87, v: 0.62, w: 0.16, h: 0.24 },
  { kind: 'engData', u: 0.7, v: 0.56, w: 0.14, h: 0.14 },
  { kind: 'engSys', u: 0.86, v: 0.38, w: 0.16, h: 0.16 },
  { kind: 'gps', u: 0.16, v: 0.36, w: 0.18, h: 0.12 },
  { kind: 'ehsiCtl', u: 0.33, v: 0.33, w: 0.14, h: 0.1 },
  { kind: 'annun', u: 0.5, v: 0.3, w: 0.2, h: 0.12 },
  { kind: 'g', u: 0.42, v: 0.13, d: 0.07, live: 'g' },
  { kind: 'stby', u: 0.5, v: 0.13, d: 0.08, live: 'stby' },
  { kind: 'small', u: 0.58, v: 0.13, d: 0.07 },
  { kind: 'flap', u: 0.21, v: 0.17, s: 0.07 },
  { kind: 'gearHandle', u: 0.09, v: 0.26, w: 0.05, h: 0.18 },
  { kind: 'gearLights', u: 0.09, v: 0.4, w: 0.06, h: 0.08 },
  { kind: 'emerGear', u: 0.04, v: 0.12, s: 0.05 },
];
const REAR_INSTRUMENTS = [
  { kind: 'aoa', u: 0.18, v: 0.82, d: 0.08 },
  { kind: 'asi', u: 0.3, v: 0.8, d: 0.14, live: 'asi' },
  { kind: 'eadi', u: 0.5, v: 0.78, w: 0.22, h: 0.26, live: 'eadi' },
  { kind: 'alt', u: 0.7, v: 0.8, d: 0.14, live: 'alt' },
  { kind: 'vsi', u: 0.84, v: 0.82, d: 0.09 },
  { kind: 'clock', u: 0.15, v: 0.55, d: 0.08 },
  { kind: 'rmu', u: 0.3, v: 0.5, w: 0.11, h: 0.24 },
  { kind: 'ehsi', u: 0.5, v: 0.45, w: 0.22, h: 0.26, live: 'ehsi' },
  { kind: 'engData', u: 0.72, v: 0.5, w: 0.14, h: 0.16 },
  { kind: 'engSys', u: 0.87, v: 0.5, w: 0.14, h: 0.16 },
  { kind: 'annun', u: 0.5, v: 0.15, w: 0.22, h: 0.12 },
  { kind: 'stby', u: 0.3, v: 0.18, d: 0.09, live: 'stby' },
  { kind: 'g', u: 0.7, v: 0.18, d: 0.08, live: 'g' },
  { kind: 'gearHandle', u: 0.08, v: 0.2, w: 0.05, h: 0.16 },
  { kind: 'gearLights', u: 0.08, v: 0.34, w: 0.06, h: 0.08 },
  { kind: 'flap', u: 0.18, v: 0.2, s: 0.07 },
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

const PANEL_GREY = '#8d9195';
const BLACK = '#0b0d10';
const FACE = '#0b0d10';
const INK = '#e8edf2';
const DIM = 'rgba(200, 215, 230, 0.7)';
const GREEN_INK = '#7fd18a';
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

/** One instrument drawn into its box (x, y, w, h pixels), from the HUD's numbers `h` (null or {} shows dashes). */
function drawInstrument(ctx, kind, b, h) {
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
    case 'small':
      dial(ctx, { cx, cy, r: rr, from: 0, to: 10, sweepDeg: 270, startDeg: -135, major: 5, minor: 1, name: '', value: NaN, readout: null, labelOf: () => '' });
      break;
    case 'clock': {
      const cr = rr * 0.86, ccy = cy + rr * 0.12;
      ctx.fillStyle = '#16191d'; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = FACE; ctx.beginPath(); ctx.arc(cx, ccy, cr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = INK;
      for (let k = 0; k < 12; k++) {
        const a = (k * Math.PI) / 6;
        ctx.lineWidth = k % 3 === 0 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(cx + Math.sin(a) * cr * 0.9, ccy - Math.cos(a) * cr * 0.9);
        ctx.lineTo(cx + Math.sin(a) * cr * 0.75, ccy - Math.cos(a) * cr * 0.75);
        ctx.stroke();
      }
      ctx.fillStyle = '#000'; ctx.fillRect(cx - cr * 0.5, ccy - cr * 0.55, cr, cr * 0.32);
      label(ctx, '--:--', cx, ccy - cr * 0.39, cr * 0.24, '#ff9a3c'); // an orange digital readout (AETCMAN 11-248 Fig 2.7)
      break;
    }
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
      const s = screen(ctx, b.x, b.y, b.w, b.h, '#0c1a10');
      rows(ctx, s, ['UHF', 'VHF', 'XPDR', 'NAV']);
      break;
    }
    case 'gps': {
      const s = screen(ctx, b.x, b.y, b.w, b.h, '#0c1a10');
      rows(ctx, s, ['GPS', 'WPT']);
      break;
    }
    case 'engine': { // three round dials over a column of readouts, static
      const s = screen(ctx, b.x, b.y, b.w, b.h);
      const dr = Math.min(s.w / 2, s.h / 4) * 0.42;
      ['TRQ', 'ITT', 'NP'].forEach((name, i) => {
        const dcx = s.x + s.w * (0.3 + 0.4 * (i % 2)), dcy = s.y + s.h * (0.15 + 0.27 * i);
        ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(dcx, dcy, dr, rad(135), rad(405)); ctx.stroke();
        label(ctx, name, dcx, dcy, dr * 0.5, GREEN_INK);
        label(ctx, '—', s.x + s.w * (0.7 - 0.4 * (i % 2)), dcy, dr * 0.6, INK);
      });
      rows(ctx, { x: s.x, y: s.y + s.h * 0.72, w: s.w, h: s.h * 0.28 }, ['N1', 'OIL']);
      break;
    }
    case 'engData':
      rows(ctx, screen(ctx, b.x, b.y, b.w, b.h), ['N1', 'OIL P', 'OIL T', 'FUEL']);
      break;
    case 'engSys':
      rows(ctx, screen(ctx, b.x, b.y, b.w, b.h), ['HYD', 'FUEL L', 'FUEL R', 'BATT']);
      break;
    case 'ehsiCtl':
      ctx.fillStyle = '#1c1f23'; ctx.fillRect(b.x, b.y, b.w, b.h);
      for (const k of [0.25, 0.75]) {
        ctx.fillStyle = '#050608'; ctx.beginPath(); ctx.arc(b.x + b.w * k, cy, b.h * 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5a5f66'; ctx.beginPath(); ctx.arc(b.x + b.w * k, cy, b.h * 0.12, 0, Math.PI * 2); ctx.fill();
      }
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
    case 'flap':
      ctx.fillStyle = BLACK; ctx.fillRect(b.x, b.y, b.w, b.h);
      label(ctx, 'FLAPS', cx, b.y + b.h * 0.25, b.h * 0.18, DIM);
      label(ctx, 'UP', cx, b.y + b.h * 0.62, b.h * 0.3, INK);
      break;
    case 'gearHandle': // the plate and its slot; the handle and wheel knob are 3D (gearKnob)
      ctx.fillStyle = '#1c1f23'; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#050608'; ctx.fillRect(cx - b.w * 0.12, b.y + b.h * 0.08, b.w * 0.24, b.h * 0.84);
      label(ctx, 'UP', cx, b.y + b.h * 0.04 + 6, b.w * 0.22, DIM);
      break;
    case 'gearLights':
      ctx.fillStyle = '#1c1f23'; ctx.fillRect(b.x, b.y, b.w, b.h);
      for (const [px, py] of [[0.5, 0.3], [0.25, 0.72], [0.75, 0.72]]) {
        ctx.fillStyle = '#0f2a14'; // unlit: gear up
        ctx.beginPath(); ctx.arc(b.x + b.w * px, b.y + b.h * py, Math.min(b.w, b.h) * 0.16, 0, Math.PI * 2); ctx.fill();
      }
      break;
    case 'emerGear': {
      ctx.save();
      ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
      ctx.fillStyle = '#e8c21c'; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = '#111'; ctx.lineWidth = b.w * 0.14;
      for (let k = -2; k <= 4; k++) { ctx.beginPath(); ctx.moveTo(b.x + k * b.w * 0.33, b.y + b.h); ctx.lineTo(b.x + (k + 1) * b.w * 0.33, b.y); ctx.stroke(); }
      ctx.restore();
      break;
    }
    default:
  }
}

/** An instrument's size on its panel, feet: { w, h }. */
function sizeFt(inst, faceW, faceH) {
  if (inst.d) return { w: inst.d * faceW, h: inst.d * faceW };
  if (inst.s) return { w: inst.s * faceW, h: inst.s * faceW };
  return { w: inst.w * faceW, h: inst.h * faceH };
}

/** A panel's static picture: the grey face with every instrument drawn once (the live ones with dashes under their screens). */
function drawStaticPanel(ctx, width, height, instruments, faceW, faceH) {
  ctx.fillStyle = PANEL_GREY;
  ctx.fillRect(0, 0, width, height);
  const k = width / faceW;
  // A fine darker border, as the panel's edge reads in the pictures.
  ctx.strokeStyle = 'rgba(40, 44, 48, 0.6)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, width - 6, height - 6);
  for (const inst of instruments) {
    const s = sizeFt(inst, faceW, faceH);
    const w = s.w * k, h = s.h * k;
    drawInstrument(ctx, inst.kind, { x: inst.u * width - w / 2, y: (1 - inst.v) * height - h / 2, w, h }, null);
  }
}

/** The live faces, each into its window of the shared picture. */
function drawLive(ctx, hud) {
  ctx.clearRect(0, 0, ATLAS.width, ATLAS.height);
  for (const [kind, win] of Object.entries(LIVE_WINDOWS)) {
    if (kind === 'stby') {
      const cx = win.x + win.w / 2, cy = win.y + win.h / 2, r = win.w / 2 / 1.12;
      bezel(ctx, cx, cy, r);
      drawAttitude(ctx, cx, cy, r * 0.94, hud?.pitchDeg, hud?.bankDeg);
    } else drawInstrument(ctx, kind, win, hud ?? {});
  }
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
 * when `closed`; with `caps`, both end sections closed with a fan. Non-indexed, flat-shaded.
 */
function loft(THREE, sections, { closed = true, caps = false } = {}) {
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  const m = sections[0].length;
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
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** A glareshield: a low arch with a lip, from its aft edge forward, kept inside the canopy and no wider than the panel. */
function glareshieldGeometry(THREE, gs, p, panelSide) {
  const sections = [];
  const N = 6, A = 8;
  for (let i = 0; i <= N; i++) {
    const x = gs.aftX + ((gs.foreX - gs.aftX) * i) / N;
    const hw = Math.min(panelSide + 0.04, glassHalfWidthFt(gs.edgeTop, x, 0.03));
    const s = [[x, hw, gs.lip]];
    for (let j = 0; j <= A; j++) {
      const t = j / A;
      const y = hw * (1 - 2 * t);
      const z = (1 - t) ** 2 * gs.edgeTop + 2 * t * (1 - t) * (2 * gs.top - gs.edgeTop) + t * t * gs.edgeTop;
      s.push([x, y, z]);
    }
    s.push([x, -hw, gs.lip]);
    sections.push(s);
  }
  return loft(THREE, sections, { closed: true, caps: true });
}

/** A tube through points (feet) with straight runs between them. */
function tubeThrough(THREE, pts, radius, segments = 64) {
  const path = new THREE.CurvePath();
  for (let i = 0; i + 1 < pts.length; i++) path.add(new THREE.LineCurve3(new THREE.Vector3(...pts[i]), new THREE.Vector3(...pts[i + 1])));
  return new THREE.TubeGeometry(path, segments, radius, 6, false);
}

/** The framed bow's section (TS-155): 0.09 ft deep inside the glass, 0.25 ft fore and aft (estimates). */
const BOW = Object.freeze({ depth: 0.09, half: 0.125 });

/** A framed canopy bow at station x (feet): a rectangular section BOW.depth deep inside the glass, 2 x BOW.half fore and aft. */
function bowGeometry(THREE, x) {
  const n = 18, { depth, half } = BOW;
  const fore = ct156HoopPoints((x + half) / F, n), aft = ct156HoopPoints((x - half) / F, n);
  const base = ct156CanopySection(x / F).base * F;
  const inward = ({ y, z }, d) => {
    const dy = -y * F, dz = base - z * F;
    const l = Math.hypot(dy, dz) || 1;
    return [y * F + (dy / l) * d, z * F + (dz / l) * d];
  };
  const sections = [];
  for (let j = 0; j <= n; j++) {
    const [fy0, fz0] = inward(fore[j], 0.01), [fy1, fz1] = inward(fore[j], depth);
    const [ay0, az0] = inward(aft[j], 0.01), [ay1, az1] = inward(aft[j], depth);
    sections.push([[x + half, fy0, fz0], [x + half, fy1, fz1], [x - half, ay1, az1], [x - half, ay0, az0]]);
  }
  return loft(THREE, sections, { closed: true });
}

/**
 * The forward bow as the seat sees it (TS-156; AETCMAN 11-248 Fig 2.7, p.42, Fig 5.3): a flat light band in the plane
 * x = FORWARD_BOW_FT.bandX facing aft, from just inside the glass FORWARD_BOW_FT.bandDepth inward, sill to sill, with a
 * ring of round dark holes along its middle and a dark tube along its inner edge. Returns { band, holes, tube }.
 */
function forwardBandGeometries(THREE) {
  const b = FORWARD_BOW_FT, n = 48;
  const pts = ct156HoopPoints(b.bandX / F, n);
  const base = ct156CanopySection(b.bandX / F).base * F;
  const inward = ({ y, z }, d) => {
    const dy = -y * F, dz = base - z * F;
    const l = Math.hypot(dy, dz) || 1;
    return [b.bandX, y * F + (dy / l) * d, z * F + (dz / l) * d];
  };
  const outer = pts.map((q) => inward(q, b.glassInset)), inner = pts.map((q) => inward(q, b.glassInset + b.bandDepth));
  const band = loft(THREE, [outer, inner], { closed: false });
  const tube = tubeThrough(THREE, inner, b.tubeR, 96);
  // The holes, evenly spaced by length along the band's middle line, half a spacing in from each sill.
  const mid = pts.map((q) => inward(q, b.glassInset + b.bandDepth / 2));
  const along = [0];
  for (let j = 1; j < mid.length; j++) along.push(along[j - 1] + Math.hypot(mid[j][1] - mid[j - 1][1], mid[j][2] - mid[j - 1][2]));
  const total = along[along.length - 1];
  const holes = [];
  for (let k = 0; k < b.holes; k++) {
    const want = ((k + 0.5) / b.holes) * total;
    let j = 1;
    while (j < along.length - 1 && along[j] < want) j++;
    const t = (want - along[j - 1]) / (along[j] - along[j - 1] || 1);
    const y = mid[j - 1][1] + (mid[j][1] - mid[j - 1][1]) * t, z = mid[j - 1][2] + (mid[j][2] - mid[j - 1][2]) * t;
    holes.push(new THREE.CircleGeometry(b.holeDia / 2, 14).rotateY(-Math.PI / 2).translate(b.bandX - 0.004, y, z));
  }
  return { band, holes, tube };
}

/**
 * Two mirrors hung under a bow either side of its crest, each turned to face `eye` (feet), `aft` feet behind the bow's
 * station and `inward` feet in from the glass. Returns [backs, faces].
 */
function mirrorGeometries(THREE, x, eye, { aft = 0.2, inward = 0.15 } = {}) {
  const n = 18;
  const pts = ct156HoopPoints(x / F, n);
  const base = ct156CanopySection(x / F).base * F;
  const backs = [], faces = [];
  for (const j of [6, 12]) { // a third of the way down from the crest either side (the hoop's own angle, 60° and 120°)
    const { y, z } = pts[j];
    const dy = -y * F, dz = base - z * F, l = Math.hypot(dy, dz);
    const pos = new THREE.Vector3(x - aft, y * F + (dy / l) * inward, z * F + (dz / l) * inward);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(eye.x, eye.y, eye.z), pos, new THREE.Vector3(0, 0, 1));
    m.setPosition(pos);
    backs.push(new THREE.BoxGeometry(0.3, 0.18, 0.02).applyMatrix4(m));
    faces.push(new THREE.PlaneGeometry(0.27, 0.15).translate(0, 0, 0.0105).applyMatrix4(m));
  }
  return [backs, faces];
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

// Material slots for the joined solid parts.
const SLOT = Object.freeze({ grey: 0, black: 1, rail: 2, red: 3, mirror: 4, knob: 5, lampRed: 6, lampAmber: 7, lampGreen: 8, band: 9 });

/**
 * The cockpit parts of one seat (dx 0 the front, REAR_DX the rear), as { geometry, materials } entries for
 * ct156JoinGeometries, plus the textured faces it needs: the panel shape and the live quads.
 */
function seatParts(THREE, { dx, p, gs, instruments, eye }) {
  const parts = [];
  const put = (geometry, slot) => parts.push({ geometry, materials: [slot] });
  const ts = tombstone(p);
  const faceW = 2 * ts.side, faceH = ts.height;
  const zOf = (v) => p.bottom + v * faceH;
  const yOf = (u) => ts.side * (1 - 2 * u);
  const S = SEAT_FT;
  const fx = (x) => x + dx; // a front-seat station moved to this seat

  // The panel's back and edges: a shallow black box behind the face, so it reads solid from any side.
  put(box(THREE, p.x + 0.01, p.x + 0.12, -ts.side, ts.side, p.bottom, ts.shoulderZ), SLOT.black);
  // The lower panel: the centre pedestal down to the floor and the side bays down to the consoles, leaving knee wells.
  const lowSide = panelHalfWidthFt(p.bottom, p);
  const xl = p.x + 0.002;
  put(flatAft(THREE, xl, [[yOf(0.34), p.bottom], [yOf(0.66), p.bottom], [yOf(0.66), S.floorZ], [yOf(0.34), S.floorZ]]), SLOT.grey);
  for (const [u0, u1] of [[0, 0.2], [0.8, 1]]) {
    const y0 = lowSide * (1 - 2 * u0), y1 = lowSide * (1 - 2 * u1);
    put(flatAft(THREE, xl, [[y0, p.bottom], [y1, p.bottom], [y1, S.console.top], [y0, S.console.top]]), SLOT.grey);
  }
  // A few switch blocks on the pedestal (static).
  for (let i = 0; i < 3; i++) {
    const z = p.bottom - 0.25 - i * 0.3;
    put(box(THREE, p.x - 0.04, p.x, -0.25, 0.25, z - 0.1, z + 0.1), SLOT.black);
  }
  // The glareshield.
  put(glareshieldGeometry(THREE, gs, p, ts.side), SLOT.black);
  // The glareshield's rim, the thick dark grab rail round the panel's sides and top (TS-156, RIM_FT; AETCMAN 11-248
  // Fig 2.7): its top run along the glareshield's aft edge at the glareshield's height, its legs in angled brackets.
  const off = RIM_FT.sideOut, rx = gs.aftX - RIM_FT.aftOfGlareshield;
  const clampY = (y, z) => Math.sign(y) * Math.min(Math.abs(y), glassHalfWidthFt(z, rx, 0.05));
  const railPts = [
    [ts.side + off, zOf(0.45)], [ts.side + off, ts.shoulderZ], [ts.top + off * 0.4, p.top],
    [-(ts.top + off * 0.4), p.top], [-(ts.side + off), ts.shoulderZ], [-(ts.side + off), zOf(0.45)],
  ].map(([y, z]) => [rx, clampY(y, z), z]);
  put(tubeThrough(THREE, railPts, RIM_FT.r), SLOT.black);
  for (const end of [railPts[0], railPts[railPts.length - 1]]) {
    put(tubeThrough(THREE, [end, [end[0], end[1], end[2] - 0.08], [p.x, end[1], end[2] - 0.16]], 0.03, 8), SLOT.rail);
  }
  // The gear handle's lever and wheel knob, standing off its plate (static, up).
  const gh = instruments.find((i) => i.kind === 'gearHandle');
  if (gh) {
    const y = yOf(gh.u), z = zOf(gh.v);
    put(box(THREE, p.x - 0.1, p.x, y - 0.015, y + 0.015, z - 0.01, z + 0.12), SLOT.knob);
    put(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 14).translate(p.x - 0.12, y, z + 0.12), SLOT.knob);
  }

  // On the glareshield (front seat only; AETCMAN 11-248 Fig 2.7, p.42, and Fig 5.3; TS-156; places and sizes estimates
  // judged off the figures): the AOA indexer standing up on the left, a tall narrow box with three stacked lamps; three
  // small lamps in a row on the centre with screw dots (master warning and caution style); the standby compass on the
  // right, a round face in a small housing on a bracket. All unlit or static.
  if (dx === 0) {
    const t = gs.top;
    put(box(THREE, 3.45, 3.55, 0.7, 0.78, t - 0.02, t + 0.3), SLOT.black);
    [SLOT.lampGreen, SLOT.lampAmber, SLOT.lampRed].forEach((slot, i) => {
      const z = t + 0.24 - i * 0.085;
      put(box(THREE, 3.445, 3.45, 0.715, 0.765, z - 0.03, z + 0.03), slot);
    });
    [[0.16, SLOT.lampRed], [0, SLOT.lampAmber], [-0.16, SLOT.lampAmber]].forEach(([y, slot]) => {
      put(box(THREE, 3.38, 3.46, y - 0.055, y + 0.055, t - 0.01, t + 0.06), SLOT.black);
      put(box(THREE, 3.375, 3.38, y - 0.042, y + 0.042, t + 0.004, t + 0.044), slot);
      for (const sy of [-1, 1]) put(box(THREE, 3.373, 3.378, y + sy * 0.049 - 0.005, y + sy * 0.049 + 0.005, t + 0.045, t + 0.055), SLOT.knob);
    });
    put(box(THREE, 3.56, 3.6, -0.57, -0.53, t - 0.02, t + 0.1), SLOT.black); // the bracket
    put(box(THREE, 3.5, 3.66, -0.63, -0.47, t + 0.08, t + 0.22), SLOT.black); // the housing
    put(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 18).rotateZ(Math.PI / 2).translate(3.495, -0.55, t + 0.15), SLOT.knob); // the face
    put(box(THREE, 3.488, 3.49, -0.553, -0.547, t + 0.11, t + 0.19), SLOT.black); // its lubber line
  }

  // The seat: pan, lower back (the model's back above it), headbox.
  const { pan, lowerBack, headbox } = S;
  put(box(THREE, fx(pan.aft), fx(pan.fore), -pan.halfWidth, pan.halfWidth, pan.z0, pan.z1), SLOT.black);
  put(box(THREE, fx(lowerBack.aft), fx(lowerBack.fore), -lowerBack.halfWidth, lowerBack.halfWidth, lowerBack.z0, lowerBack.z1), SLOT.rail);
  put(box(THREE, fx(headbox.aft), fx(headbox.fore), -headbox.halfWidth, headbox.halfWidth, headbox.z0, headbox.z1), SLOT.rail);
  // The seat's side beams.
  for (const s of [1, -1]) put(box(THREE, fx(lowerBack.aft), fx(lowerBack.aft) + 0.25, s * 0.5, s * 0.6, pan.z0, 2.0), SLOT.black);

  // The side consoles, from beside the seat to the panel.
  const c = S.console;
  for (const s of [1, -1]) put(box(THREE, fx(c.aft), p.x, s > 0 ? c.inner : -c.outer, s > 0 ? c.outer : -c.inner, S.floorZ, c.top), SLOT.grey);
  // Left console: the power lever (PCL) in its slot, the flap lever, the red canopy fracturing handle.
  put(box(THREE, fx(2.4), fx(3.0), 1.12, 1.18, c.top, c.top + 0.006), SLOT.black);
  put(box(THREE, fx(2.68), fx(2.72), 1.13, 1.17, c.top, c.top + 0.2), SLOT.knob);
  put(box(THREE, fx(2.625), fx(2.775), 1.09, 1.21, c.top + 0.2, c.top + 0.5), SLOT.black);
  put(box(THREE, fx(2.19), fx(2.21), 1.04, 1.06, c.top, c.top + 0.25), SLOT.knob);
  put(box(THREE, fx(2.16), fx(2.24), 1.01, 1.09, c.top + 0.21, c.top + 0.29), SLOT.knob);
  put(new THREE.TorusGeometry(0.1, 0.02, 6, 14).rotateX(Math.PI / 2).translate(fx(3.0), 1.27, c.top + 0.2), SLOT.red);
  // Right console: three raised panels with knobs.
  for (const x0 of [1.0, 1.8, 2.6]) {
    put(box(THREE, fx(x0), fx(x0 + 0.6), -1.25, -1.0, c.top, c.top + 0.05), SLOT.black);
    for (const k of [0.2, 0.4]) put(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8).rotateX(Math.PI / 2).translate(fx(x0 + k), -1.12, c.top + 0.07), SLOT.knob);
  }
  // The stick: a boot on the floor, the stem leaning 8° forward, the grip on top.
  const st = S.stick, tilt = rad(st.tiltDeg);
  const stickPart = (g) => g.rotateY(tilt).translate(fx(st.x), 0, S.floorZ);
  put(stickPart(new THREE.ConeGeometry(0.25, 0.3, 14).rotateX(Math.PI / 2).translate(0, 0, 0.15)), SLOT.black);
  put(stickPart(new THREE.CylinderGeometry(0.035, 0.04, st.height - 0.3, 10).rotateX(Math.PI / 2).translate(0, 0, (st.height - 0.3) / 2)), SLOT.rail);
  put(stickPart(box(THREE, -0.06, 0.06, -0.05, 0.05, st.height - 0.35, st.height)), SLOT.black);
  // The rudder pedals, just ahead of the panel face (in the knee wells; the rear's run under the front seat).
  for (const s of [1, -1]) put(box(THREE, p.x + 0.13, p.x + 0.16, s * 0.35 - 0.1, s * 0.35 + 0.1, -0.75, -0.45), SLOT.rail);
  return { parts, ts, faceW, faceH, eye };
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
  // Slots as SLOT: light grey panel and consoles, matte black, dark grey rail, red, mirror, knob, unlit lamps.
  const slotMats = [
    solid(PANEL_GREY), solid('#0c0f12', { roughness: 0.95 }), solid('#3a3e44'), solid('#b3202a', { roughness: 0.5 }),
    solid('#6c7280', { roughness: 0.25, metalness: 0.6 }), solid('#c9ced4', { roughness: 0.5 }),
    lamp('#3a1414'), lamp('#3a2c0e'), lamp('#10301a'),
    // The forward bow band, white to light grey (TS-156), a little self-lit so it stays light with the sun ahead.
    solid('#d3d6d9', { roughness: 0.7, emissive: '#7a7d80' }),
  ];
  const geometries = [];
  const add = (geometry, material) => {
    geometries.push(geometry);
    const m = new THREE.Mesh(geometry, material);
    group.add(m);
    return m;
  };

  // The live faces' shared picture.
  const live = canvasTexture(ATLAS.width, ATLAS.height);
  const liveMat = own(new THREE.MeshBasicMaterial({ map: live.texture, side: THREE.DoubleSide, fog: false }));

  const seats = [
    { dx: 0, p: PANEL_FT, gs: GLARESHIELD_FT, instruments: FRONT_INSTRUMENTS, eye: EYES_FT.front, width: 2048 },
    { dx: REAR_DX, p: REAR_PANEL_FT, gs: REAR_GLARESHIELD_FT, instruments: REAR_INSTRUMENTS, eye: EYES_FT.rear, width: 1024 },
  ];
  const solidParts = [];
  for (const seat of seats) {
    const { parts, ts, faceW, faceH } = seatParts(THREE, seat);
    solidParts.push(...parts);
    const { p } = seat;
    // The panel's static picture, its pixels square on the face.
    const height = Math.round((seat.width * faceH) / faceW);
    const pic = canvasTexture(seat.width, height);
    drawStaticPanel(pic.ctx, seat.width, height, seat.instruments, faceW, faceH);
    pic.texture.needsUpdate = true;
    const panelMat = own(new THREE.MeshBasicMaterial({ map: pic.texture, side: THREE.DoubleSide, fog: false }));
    const outline = [[ts.side, p.bottom], [ts.side, ts.shoulderZ], [ts.top, p.top], [-ts.top, p.top], [-ts.side, ts.shoulderZ], [-ts.side, p.bottom]];
    add(flatAft(THREE, p.x, outline, { y0: ts.side, y1: -ts.side, z0: p.bottom, z1: p.top }), panelMat);
    // The live instruments: small quads just proud of the face, each showing its window of the shared picture.
    for (const inst of seat.instruments) {
      if (!inst.live) continue;
      const s = sizeFt(inst, faceW, faceH);
      const yc = ts.side * (1 - 2 * inst.u), zc = p.bottom + inst.v * faceH;
      const q = flatAft(THREE, p.x - 0.005, [[yc + s.w / 2, zc - s.h / 2], [yc - s.w / 2, zc - s.h / 2], [yc - s.w / 2, zc + s.h / 2], [yc + s.w / 2, zc + s.h / 2]]);
      const win = LIVE_WINDOWS[inst.live];
      const uv = q.attributes.uv, pos = q.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const fu = (yc + s.w / 2 - pos.getY(i)) / s.w, fv = (pos.getZ(i) - (zc - s.h / 2)) / s.h;
        uv.setXY(i, (win.x + fu * win.w) / ATLAS.width, 1 - (win.y + (1 - fv) * win.h) / ATLAS.height);
      }
      add(q, liveMat);
    }
    // The mirrors under this seat's bow (front: the forward bow; rear: the inter-cockpit arch), turned to its eye.
    const front = seat.dx === 0;
    const bowX = (front ? CT156_FRAME_X[0] : CT156_FRAME_X[1]) * F;
    // Under the forward bow they hang just inside its band and tube (TS-156); under the arch as TS-155.
    const b = FORWARD_BOW_FT;
    const [backs, faces] = mirrorGeometries(THREE, bowX, seat.eye, front ? { aft: 0.17, inward: b.glassInset + b.bandDepth + 2 * b.tubeR + 0.08 } : {});
    for (const g of backs) solidParts.push({ geometry: g, materials: [SLOT.black] });
    for (const g of faces) solidParts.push({ geometry: g, materials: [SLOT.mirror] });
  }
  // The forward bow's light band with its holes and inner tube (TS-156), the framed inter-cockpit arch (TS-155; the
  // figures don't show it, so it stays a plain dark frame), the rear hoop the model's tube only, and the sill bands.
  const fb = forwardBandGeometries(THREE);
  solidParts.push({ geometry: fb.band, materials: [SLOT.band] }, { geometry: fb.tube, materials: [SLOT.black] });
  for (const g of fb.holes) solidParts.push({ geometry: g, materials: [SLOT.black] });
  solidParts.push({ geometry: bowGeometry(THREE, CT156_FRAME_X[1] * F), materials: [SLOT.black] });
  for (const g of sillGeometry(THREE)) solidParts.push({ geometry: g, materials: [SLOT.rail] });
  add(ct156JoinGeometries(THREE, solidParts), slotMats);

  // The ejection seat handles: yellow and black striped loops at each pan's front.
  const stripe = canvasTexture(32, 32);
  stripe.ctx.fillStyle = '#e8c21c';
  stripe.ctx.fillRect(0, 0, 32, 32);
  stripe.ctx.fillStyle = '#111';
  stripe.ctx.fillRect(0, 0, 16, 32);
  stripe.texture.wrapS = stripe.texture.wrapT = THREE.RepeatWrapping;
  stripe.texture.repeat.set(8, 1);
  stripe.texture.needsUpdate = true;
  const stripeMat = own(new THREE.MeshStandardMaterial({ map: stripe.texture, roughness: 0.6, side: THREE.DoubleSide, fog: false }));
  for (const seat of seats) {
    const loop = new THREE.TorusGeometry(0.125, 0.025, 6, 14, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2);
    add(loop.translate(SEAT_FT.pan.fore + seat.dx - 0.03, 0, SEAT_FT.pan.z1), stripeMat);
  }

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
