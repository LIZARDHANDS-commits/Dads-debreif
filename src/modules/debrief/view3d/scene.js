// The 3D view's geometry: camera projection, formation centre, aircraft attitude
// and the low-poly T-6's corner points. Pure functions, no page access, so they
// run in Node and are pinned to V6 by tests/golden/debrief-3d.test.js.
//
// World frame as everywhere in the debrief: x east, y north, in feet; altitude
// in feet. Headings are math angles in radians (0 = east, D35).
import { KT_TO_FTPS, G_FTPS2 } from '../../../core/units.js';

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

/** Signed heading change a − b in (−π, π] (V6 headingDelta, line 3781). */
function headingDelta(a, b) {
  let d = ((a - b + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Bank and pitch the 3D view draws for one aircraft (V6 attitudeFor, line 3786).
 * `p` is the aircraft now ({ x, y, spdKt, pitchNative, gNative }), `before` and
 * `after` are it one second either side ({ x, y, t }), and `t` is the time now.
 *
 * Bank (degrees, left turn positive): from the turn over those two seconds,
 * 0 to 85°, replaced by acos(1/G) whenever a recorded G above 1.01 exists.
 * Pitch: the recorded pitch, else 0, because V6's 3D view can't reach the
 * debrief's pitch estimate (#19 finding).
 */
export function attitudeV6(p, before, after, t) {
  if (!p) return { bankDeg: 0, pitchDeg: 0, pitchSource: 'estimated' };
  const pitchDeg = Number.isFinite(p.pitchNative) ? p.pitchNative : 0;
  let bankDeg = 0;
  if (before && after) {
    const h0 = Math.atan2(p.y - before.y, p.x - before.x);
    const h1 = Math.atan2(after.y - p.y, after.x - p.x);
    const dt = Math.max(0.25, (after.t || t + 1) - (before.t || t - 1));
    const turnRate = Math.abs(headingDelta(h1, h0)) / dt;
    const vfps = (p.spdKt || 0) * KT_TO_FTPS;
    if (vfps > 20 && turnRate > 0.0001) {
      bankDeg = clamp((Math.atan((vfps * turnRate) / G_FTPS2) * 180) / Math.PI, 0, 85);
      const cross = Math.cos(h0) * Math.sin(h1) - Math.sin(h0) * Math.cos(h1);
      if (cross < 0) bankDeg = -bankDeg;
    }
  }
  if (Number.isFinite(p.gNative) && Math.abs(p.gNative) > 1.01) {
    const gBank = (Math.acos(clamp(1 / Math.abs(p.gNative), -1, 1)) * 180) / Math.PI;
    bankDeg = Math.sign(bankDeg || 1) * gBank;
  }
  return { bankDeg, pitchDeg, pitchSource: Number.isFinite(p.pitchNative) ? 'recorded' : 'estimated' };
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
