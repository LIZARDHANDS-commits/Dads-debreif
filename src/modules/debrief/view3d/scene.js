// The 3D view's geometry: camera projection, formation centre, aircraft attitude
// and the low-poly T-6's corner points. Pure functions, no page access, so they
// run in Node and are pinned to V6 by tests/golden/debrief-3d.test.js.
//
// World frame as everywhere in the debrief: x east, y north, in feet; altitude
// in feet. Headings are math angles in radians (0 = east, D35).
import { KT_TO_FTPS, G_FTPS2 } from '../../../core/units.js';
import { wrapPi } from '../../../core/angles.js';

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
 * CSS pixels, as ui-kit canvases do). `depth` is V6's sort key.
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
 * The order to draw aircraft in, as V6 does it (line 4085): ascending `depth`.
 * The audit found this paints far aircraft over near ones (#27).
 */
export function drawOrderV6(entries, depthOf) {
  return [...entries].sort((a, b) => depthOf(a) - depthOf(b));
}

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
 * - Recorded G no longer sets the bank (D40: G only in level turns). In a level
 *   turn the bank from the turn rate is already acos(1/G); outside one, as in a
 *   wings-level pull, V6's acos(1/G) drew a bank the aircraft didn't have.
 *
 * `before`, `now` and `after` are { x, y, t } about a second apart; `speedKt`
 * is the ground speed at `now`.
 */
export function bankFromTrack({ before, now, after, speedKt, recordedBankDeg }) {
  if (Number.isFinite(recordedBankDeg)) return { bankDeg: -recordedBankDeg, source: 'recorded' };
  if (!now || !before || !after) return { bankDeg: 0, source: 'estimated' };
  const h0 = Math.atan2(now.y - before.y, now.x - before.x);
  const h1 = Math.atan2(after.y - now.y, after.x - now.x);
  const t0 = Number.isFinite(before.t) ? before.t : now.t - 1;
  const t1 = Number.isFinite(after.t) ? after.t : now.t + 1;
  const turn = wrapPi(h1 - h0);
  const rate = Math.abs(turn) / Math.max(0.125, (t1 - t0) / 2);
  const vfps = (speedKt || 0) * KT_TO_FTPS;
  if (!(vfps > 20 && rate > 0.0001)) return { bankDeg: 0, source: 'estimated' };
  const bankDeg = clamp((Math.atan((vfps * rate) / G_FTPS2) * 180) / Math.PI, 0, MAX_BANK_DEG);
  return { bankDeg: turn < 0 ? -bankDeg : bankDeg, source: 'estimated' };
}

/**
 * World corner points of V6's low-poly T-6 (drawLowPolyT6, line 3828) for an
 * aircraft at `p` heading `hdg`, banked `bankRad`, `sizeFt` long (V6's "plane
 * size"). `right` in V6 is hdg + 90°, which points to the aircraft's left, and
 * the wingtips rise by only 0.20 of the size times sin(bank) against a 0.66
 * half-span: the halved and mirrored bank of #14.
 */
export function t6PointsV6(p, hdg, bankRad, sizeFt) {
  const s = sizeFt;
  const f = { x: Math.cos(hdg), y: Math.sin(hdg) };
  const r = { x: Math.cos(hdg + Math.PI / 2), y: Math.sin(hdg + Math.PI / 2) };
  const alt0 = p.altFt || 0;
  const wp = (fwd, right, alt = 0) => ({ x: p.x + f.x * fwd + r.x * right, y: p.y + f.y * fwd + r.y * right, altFt: alt0 + alt });
  const sb = Math.sin(bankRad);
  return {
    nose: wp(s * 0.82, 0, s * 0.04),
    spinner: wp(s * 1.02, 0, 0),
    tail: wp(-s * 0.76, 0, -s * 0.02),
    fuseL: wp(s * 0.35, s * 0.12, s * 0.02),
    fuseR: wp(s * 0.35, -s * 0.12, s * 0.02),
    aftL: wp(-s * 0.58, s * 0.09, 0),
    aftR: wp(-s * 0.58, -s * 0.09, 0),
    wingL: wp(s * 0.02, s * 0.66, sb * s * 0.2),
    wingR: wp(s * 0.02, -s * 0.66, -sb * s * 0.2),
    wingRootL: wp(s * 0.16, s * 0.13, 0),
    wingRootR: wp(s * 0.16, -s * 0.13, 0),
    stabL: wp(-s * 0.62, s * 0.34, sb * s * 0.08),
    stabR: wp(-s * 0.62, -s * 0.34, -sb * s * 0.08),
    canopy: wp(s * 0.22, 0, s * 0.1),
    fin: wp(-s * 0.46, 0, s * 0.25),
    propL: wp(s * 0.92, s * 0.25),
    propR: wp(s * 0.92, -s * 0.25),
  };
}
