// What the 3D view shows at one moment, as plain values tested in Node: each
// ship's place and attitude, the ground datum, the camera limits, and the
// fixed ground grid. The drawing is in view.js; the projection and the T-6's
// shape are V6's, pinned in scene.js.
import { sampleAt, headingAt, pitchAt } from '../../../flight-data/flight.js';
import { bankFromTrack } from './scene.js';

/** V6's camera limits (its Yaw, Pitch and Zoom sliders and its mouse handlers). */
export const CAMERA_LIMITS = Object.freeze({ yaw: [-180, 180], pitch: [5, 80], zoom: [10, 300] });
/** V6's drag and wheel steps: degrees per pixel and zoom factor per wheel notch. */
export const ORBIT_DEG_PER_PX = Object.freeze({ yaw: 0.4, pitch: 0.25 });
export const WHEEL_ZOOM = Object.freeze({ in: 1.12, out: 0.89 });

/** The ground grid's spacing: V6's 5,000 ft grid, now on the ground and fixed to it (#27). */
export const GROUND_GRID_FT = 5000;
/** How far the ground reaches round the view's centre (V6's ground reference, 70,000 ft). */
export const GROUND_EXTENT_FT = 70_000;

const clamp = (v, [min, max]) => Math.max(min, Math.min(max, v));

/** A camera change from a drag of (dx, dy) pixels, kept within V6's limits. */
export function orbit(camera, dx, dy) {
  return {
    ...camera,
    yawDeg: clamp(camera.yawDeg + dx * ORBIT_DEG_PER_PX.yaw, CAMERA_LIMITS.yaw),
    pitchDeg: clamp(camera.pitchDeg - dy * ORBIT_DEG_PER_PX.pitch, CAMERA_LIMITS.pitch),
  };
}

/** A camera change from one wheel notch: in when `deltaY` is negative (V6). */
export function wheelZoom(camera, deltaY) {
  return { ...camera, zoom: clamp(camera.zoom * (deltaY < 0 ? WHEEL_ZOOM.in : WHEEL_ZOOM.out), CAMERA_LIMITS.zoom) };
}

/**
 * Each ship at time t: { slot, x, y, altFt, hdg (radians, null when not
 * moving), bankDeg (left wing down positive), pitchDeg, inGap }. Bank and
 * pitch are the ones the readouts show (D40, D47, D61).
 */
export function shipsIn3d(flight, t) {
  if (!flight) return [];
  return Object.values(flight.tracks)
    .sort((a, b) => a.slot - b.slot)
    .map((tr) => {
      const s = sampleAt(tr, t);
      const before = sampleAt(tr, t - 1);
      const after = sampleAt(tr, t + 1);
      const pitch = pitchAt(tr, t);
      const bank = bankFromTrack({
        before: { x: before.xFt, y: before.yFt, t: t - 1 },
        now: { x: s.xFt, y: s.yFt, t },
        after: { x: after.xFt, y: after.yFt, t: t + 1 },
        speedKt: s.speedKt,
        recordedBankDeg: s.bankRecordedDeg,
        pitchDeg: pitch.deg,
      });
      return {
        slot: tr.slot, x: s.xFt, y: s.yFt, altFt: s.altFt, hdg: headingAt(tr, t),
        bankDeg: bank.bankDeg, pitchDeg: pitch.deg, inGap: s.inGap,
      };
    });
}

/**
 * The ground datum in feet (V6 groundDatumAlt): 'min', the lowest
 * ship less 500 ft, down to a 500 ft step; 'field', the home field's
 * elevation; 'zero', sea level.
 */
export function groundDatumFt(ships, mode, fieldFt) {
  if (mode === 'field') return fieldFt;
  if (mode === 'zero') return 0;
  const alts = ships.map((s) => s.altFt).filter(Number.isFinite);
  if (!alts.length) return 0;
  return Math.floor((Math.min(...alts) - 500) / 500) * 500;
}

/** How a height above the datum is named: only the field makes it "AGL" (#27). */
export function heightLabel(mode) {
  return mode === 'field' ? 'ft AGL' : 'ft above datum';
}

/**
 * The ground grid's lines round `ctr`, at whole multiples of the spacing, so
 * the ground stays put and the formation moves over it (#27). V6 drew its
 * grids round the formation's centre, so they travelled with it.
 * Returns { xs, ys, min: { x, y }, max: { x, y } } in map feet.
 */
export function groundGrid(ctr, extentFt = GROUND_EXTENT_FT, stepFt = GROUND_GRID_FT) {
  const min = { x: Math.floor((ctr.x - extentFt) / stepFt) * stepFt, y: Math.floor((ctr.y - extentFt) / stepFt) * stepFt };
  const max = { x: Math.ceil((ctr.x + extentFt) / stepFt) * stepFt, y: Math.ceil((ctr.y + extentFt) / stepFt) * stepFt };
  const xs = [];
  const ys = [];
  for (let x = min.x; x <= max.x; x += stepFt) xs.push(x);
  for (let y = min.y; y <= max.y; y += stepFt) ys.push(y);
  return { xs, ys, min, max };
}
