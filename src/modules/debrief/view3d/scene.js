// The 3D view's geometry: camera projection, formation centre, aircraft attitude
// and the low-poly T-6's corner points. Pure functions, no page access, so they
// run in Node. tests/golden/debrief-3d.test.js pins them to V6 and says
// exactly where the approved fixes (D40, D47, #14, #27) differ from it.
//
// World frame as everywhere in the debrief: x east, y north, in feet; altitude
// in feet. Headings are math angles in radians (0 = east, D35).
import { KT_TO_FTPS, G_FTPS2 } from '../../../core/units.js';
import { wrapPi } from '../../../core/angles.js';
import { MIN_TURN_G } from '../../../core/flight-math.js';

/** V6's 3D camera on first open (markup line 729 to 751). */
export const V6_CAMERA = Object.freeze({ yawDeg: -35, pitchDeg: 52, zoom: 70, altScale: 2 });

const deg = (d) => (d * Math.PI) / 180;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * The point the camera looks at: Lead when following Lead (and Lead is loaded),
 * otherwise the average of every aircraft shown (V6 centerOf, line 3576).
 * `live` maps ship number to { x, y, altFt }, with missing ships as null.
 */
export function formationCenter(live, mode = 'followLead') {
  const pts = Object.values(live).filter(Boolean);
  if (!pts.length) return { x: 0, y: 0, z: 0 };
  if (mode === 'followLead' && live[1]) return { x: live[1].x, y: live[1].y, z: live[1].altFt || 0 };
  let sx = 0, sy = 0, sz = 0;
  for (const p of pts) { sx += p.x; sy += p.y; sz += p.altFt || 0; }
  return { x: sx / pts.length, y: sy / pts.length, z: sz / pts.length };
}

/**
 * Screen position of a world point (V6 project, line 3584): yaw about the
 * vertical, then tilt by the camera pitch, orthographic, centred on `ctr`.
 * `camera` holds the slider values (yaw and pitch in degrees, zoom as the
 * slider's 10 to 300, altitude scale); `size` is the canvas in the same pixels
 * the result is in, and `pxRatio` is V6's devicePixelRatio (1 when drawing in
 * CSS pixels, as ui-kit canvases do). `depth` grows away from the viewer.
 */
export function projectPoint(p, ctr, camera, size, pxRatio = 1) {
  const yaw = deg(camera.yawDeg), pitch = deg(camera.pitchDeg);
  const zoom = (camera.zoom / 1000) * pxRatio;
  const x = p.x - ctr.x, y = p.y - ctr.y, z = -((p.altFt || 0) - ctr.z) * camera.altScale;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const x1 = x * cy - y * sy, y1 = x * sy + y * cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const y2 = y1 * cp - z * sp;
  const z2 = y1 * sp + z * cp;
  return { x: size.width / 2 + x1 * zoom, y: size.height / 2 - y2 * zoom, depth: z2 };
}

/**
 * The order to draw aircraft in: far first, so near ones are painted over them
 * (#27). A smaller `depth` from projectPoint is nearer the viewer: looking
 * straight down, depth is minus the scaled altitude, so the higher aircraft is
 * nearer. V6 (line 4085) sorted the other way and drew far aircraft on top.
 */
export function drawOrder(entries, depthOf) {
  return [...entries].sort((a, b) => depthOf(b) - depthOf(a));
}

/** A turn is level, so recorded G can set the bank, with the nose within this many degrees of the horizon (Patrick, item G). */
export const LEVEL_PITCH_DEG = 10;

/** …and the heading changing faster than this, in degrees a second (Patrick, item G). */
export const LEVEL_TURN_DEG_PER_S = 1;

/** Most bank the 3D view draws, as V6 (a turn-rate spike near a gap can't flip the model). */
const MAX_BANK_DEG = 85;

/**
 * Bank the 3D view draws for one aircraft, in degrees with the left wing down
 * positive, and where it came from.
 *
 * - Recorded bank wins when the track has it (D47). flight-data gives it with
 *   the right wing down positive, so its sign flips here.
 * - Otherwise the bank of a level, coordinated turn at the turn rate the track
 *   shows (D40): tan(bank) = speed × rate / g, from the headings into and out
 *   of `now`. Those headings belong to the middles of the two legs, which are
 *   half of `after.t − before.t` apart. V6 divided by the whole gap, so its turn
 *   rate, and its bank, came out about half (a 4 G turn read 63° for 75.5°).
 * - Recorded G sets the bank as acos(1/G) only in a level turn (D40): the nose
 *   within LEVEL_PITCH_DEG of the horizon and the heading changing faster than
 *   LEVEL_TURN_DEG_PER_S (Patrick, item G). In a pull-up, or a pull with no
 *   turn, V6's acos(1/G) drew a bank the aircraft didn't have.
 *
 * The turn rate is the caller's `turnRateRadPerS` (left positive, null when
 * unknown) when given: the readouts and the 3D view pass the heading change
 * over t−1.5 s to t+1.5 s, the window est. G uses, so bank and G agree and
 * neither flickers against the other (verification M2). Without it, the old
 * chord rate from `before`, `now` and `after` ({ x, y, t } about a second
 * apart), which the V6 golden tests still pin. `speedKt`
 * is the ground speed at `now`; `pitchDeg` is the nose angle (flight-data's
 * pitchAt, null if unknown). Pass `recordedG` only when recorded G is the one
 * shown (D61: the estimate from the track is the default).
 * @param {{ before?: any, now?: any, after?: any, speedKt?: any, recordedBankDeg?: any, pitchDeg?: any,
 *   recordedG?: any, turnRateRadPerS?: number | null }} p
 */
export function bankFromTrack({ before, now, after, speedKt, recordedBankDeg, pitchDeg = null, recordedG = null, turnRateRadPerS }) {
  if (Number.isFinite(recordedBankDeg)) return { bankDeg: -recordedBankDeg, source: 'recorded' };
  let turn;
  let rate;
  if (turnRateRadPerS !== undefined) {
    // The turn rate the caller worked out over the same window as the G beside it (M2).
    if (!Number.isFinite(turnRateRadPerS)) return { bankDeg: 0, source: 'estimated' };
    turn = turnRateRadPerS;
    rate = Math.abs(turnRateRadPerS);
  } else {
    if (!now || !before || !after) return { bankDeg: 0, source: 'estimated' };
    const h0 = Math.atan2(now.y - before.y, now.x - before.x);
    const h1 = Math.atan2(after.y - now.y, after.x - now.x);
    const t0 = Number.isFinite(before.t) ? before.t : now.t - 1;
    const t1 = Number.isFinite(after.t) ? after.t : now.t + 1;
    turn = wrapPi(h1 - h0);
    rate = Math.abs(turn) / Math.max(0.125, (t1 - t0) / 2);
  }
  const vfps = (speedKt || 0) * KT_TO_FTPS;
  if (!(vfps > 20 && rate > 0.0001)) return { bankDeg: 0, source: 'estimated' };
  const level = Number.isFinite(pitchDeg) && Math.abs(pitchDeg) <= LEVEL_PITCH_DEG
    && (rate * 180) / Math.PI > LEVEL_TURN_DEG_PER_S;
  const g = Math.abs(recordedG);
  const bankDeg = level && g > MIN_TURN_G
    ? clamp((Math.acos(1 / g) * 180) / Math.PI, 0, MAX_BANK_DEG)
    : clamp((Math.atan((vfps * rate) / G_FTPS2) * 180) / Math.PI, 0, MAX_BANK_DEG);
  return { bankDeg: turn < 0 ? -bankDeg : bankDeg, source: 'estimated' };
}

/** V6's low-poly T-6 (drawLowPolyT6, line 3828) in body terms: forward, left and up, as fractions of the plane size. */
const T6_SHAPE = Object.freeze({
  nose: [0.82, 0, 0.04],
  spinner: [1.02, 0, 0],
  tail: [-0.76, 0, -0.02],
  fuseL: [0.35, 0.12, 0.02],
  fuseR: [0.35, -0.12, 0.02],
  aftL: [-0.58, 0.09, 0],
  aftR: [-0.58, -0.09, 0],
  wingL: [0.02, 0.66, 0],
  wingR: [0.02, -0.66, 0],
  wingRootL: [0.16, 0.13, 0],
  wingRootR: [0.16, -0.13, 0],
  stabL: [-0.62, 0.34, 0],
  stabR: [-0.62, -0.34, 0],
  canopy: [0.22, 0, 0.1],
  fin: [-0.46, 0, 0.25],
  propL: [0.92, 0.25, 0],
  propR: [0.92, -0.25, 0],
});

/**
 * World corner points of the low-poly T-6 for an aircraft at `p` heading `hdg`,
 * rolled `bankRad` (left wing down positive) and pitched `pitchRad` (nose up
 * positive), `sizeFt` long (the "plane size" setting).
 *
 * The shape is V6's, turned as one rigid body: roll about the fuselage, then
 * pitch about the wings, then heading. V6 instead lifted the wingtips by 0.20
 * of the size times sin(bank) against a 0.66 half-span, on the wrong side
 * (#14, D40), and slid the whole drawing up the screen for pitch (#27).
 * Wings level at zero pitch, the points are exactly V6's.
 */
export function t6Points(p, hdg, bankRad, pitchRad, sizeFt) {
  const f = { x: Math.cos(hdg), y: Math.sin(hdg) };
  const l = { x: Math.cos(hdg + Math.PI / 2), y: Math.sin(hdg + Math.PI / 2) };
  const cb = Math.cos(bankRad), sb = Math.sin(bankRad);
  const cq = Math.cos(pitchRad), sq = Math.sin(pitchRad);
  const alt0 = p.altFt || 0;
  const out = {};
  for (const [name, [fwd0, left0, up0]] of Object.entries(T6_SHAPE)) {
    const left = (left0 * cb + up0 * sb) * sizeFt;
    const upRolled = -left0 * sb + up0 * cb;
    const fwd = (fwd0 * cq - upRolled * sq) * sizeFt;
    const up = (fwd0 * sq + upRolled * cq) * sizeFt;
    out[name] = { x: p.x + f.x * fwd + l.x * left, y: p.y + f.y * fwd + l.y * left, altFt: alt0 + up };
  }
  return out;
}
