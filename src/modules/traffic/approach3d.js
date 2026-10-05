// Approach marks in the 3D view (Patrick, 5 Oct 07:17Z; TR-78), to show what the day's temperature does to the approach:
//  - the window: the "imaginary window at ¾ NM from the runway threshold on a 3 degree glide path, approximately
//    2100'–2200' MSL in Moose Jaw" (SMM 4.7 para 12), drawn as a see-through slice the aircraft fly through. It is
//    fixed at those true heights (TR-79), so aircraft flown on the altimeter pass it high on a hot day and low on a cold one;
//  - the altimeter's window (TR-81): a faint outline where the altimeter reads 2,100-2,200 ft today, red and above
//    the window on a hot day, blue and below it on a cold one, not drawn on a standard day; the gap is the training point;
//  - the 3° intercept point: where the straight-in, level at 2,700 ft on the altimeter, meets the 3° line to the
//    runway, a mark on the ground with a dotted line up to the intercept height (further back on a hot day);
//  - the selected aircraft's aim line: its velocity vector, in pink, out to where it meets the ground (the aim point).
// The window's width is not in the SMM: WINDOW_WIDTH_FT is an estimate for the picture.

import { THRESHOLD_29L } from './airfield.js';
import { RANDOM } from './randomize.js';
import { trueAltFt, heightFactor, approachLine, interceptOutFt } from './weather.js';
import { KT_TO_FTPS } from '../../core/units.js';

/** The window's true heights, ft MSL (SMM 4.7 para 12; fixed in true height, Patrick 5 Oct 07:28Z). */
export const WINDOW_LOW_FT = 2100;
export const WINDOW_HIGH_FT = 2200;
/** The window's width across the centreline, ft: not in the SMM, an estimate (twice 29L's 150 ft width). */
export const WINDOW_WIDTH_FT = 300;
/** Zoomed out, the window grows with the drawn aircraft, but by no more than this, so its height still reads true-ish. */
const WINDOW_MAX_GROW = 3;
/** The aim line runs to the ground, or this far ahead when the aircraft is level or climbing, ft (an estimate: 2 NM). */
export const AIM_LINE_MAX_FT = 2 * 6076;
/** ...and is drawn to the ground only when it meets it within this, ft (an estimate: 5 NM). */
export const AIM_GROUND_MAX_FT = 5 * 6076;
const AIM_COLOR = 0xff4fd8;
const WINDOW_COLOR = 0x7dd3fc;
const INTERCEPT_COLOR = 0xfde047;
export const HOT_COLOR = 0xef4444;
export const COLD_COLOR = 0x3b82f6;
/** The altimeter's window is drawn only when it is at least this far from the window, ft (a standard day draws none). */
const GHOST_LEAST_SHIFT_FT = 1;

/**
 * Where the marks go today: { window: { x, y, lowFt, highFt, headingDeg }, intercept: { x, y, altFt }, ux, uy },
 * heights true MSL. `pattern` is Pattern 1's route (its point 12 is the window) or null.
 */
export function approachMarks(pattern) {
  const th = THRESHOLD_29L;
  const { ux, uy, windowOutFt: outFt, slope } = approachLine(pattern);
  // The window stays put at its true heights (Patrick, 5 Oct 07:28Z; TR-79): the aircraft, flown on the altimeter, pass
  // through it higher on a hot day and lower on a cold one.
  const win = { x: th.x + ux * outFt, y: th.y + uy * outFt, lowFt: WINDOW_LOW_FT, highFt: WINDOW_HIGH_FT };
  // The 3° line through the threshold (the sim's own: through the window on a standard day), and where it reaches the
  // straight-in's level height, taken at its true height today; the straight-in starts down there (TR-80).
  const interceptOut = interceptOutFt(slope, RANDOM.straightInAltFt);
  const intercept = { x: th.x + ux * interceptOut, y: th.y + uy * interceptOut, altFt: trueAltFt(RANDOM.straightInAltFt), outFt: interceptOut };
  // Where the altimeter reads the window's heights today (Patrick's card "Fixed plus ghost", 5 Oct 07:41Z; TR-81).
  const shiftFt = trueAltFt(WINDOW_LOW_FT) - WINDOW_LOW_FT;
  const altimeter = Math.abs(shiftFt) < GHOST_LEAST_SHIFT_FT ? null
    : { lowFt: trueAltFt(WINDOW_LOW_FT), highFt: trueAltFt(WINDOW_HIGH_FT), shiftFt, hot: shiftFt > 0 };
  return { window: win, altimeter, intercept, ux, uy };
}

/** The group of marks for `THREE`; posed by updateApproachMarks. */
export function createApproachMarks(THREE) {
  const root = new THREE.Group();
  root.frustumCulled = false;

  // The window: a unit square, scaled to the window and stood across the centreline.
  const windowTurn = new THREE.Group();
  const pane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: WINDOW_COLOR, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, fog: false }),
  );
  pane.rotation.x = Math.PI / 2; // upright, facing along the approach
  const frameGeometry = new THREE.BufferGeometry();
  frameGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5], 3));
  const frame = new THREE.LineLoop(frameGeometry, new THREE.LineBasicMaterial({ color: WINDOW_COLOR, transparent: true, opacity: 0.9, fog: false }));
  const paneHolder = new THREE.Group();
  paneHolder.add(pane, frame);
  windowTurn.add(paneHolder);
  // The altimeter's window: the same frame, coloured hot or cold.
  const ghost = new THREE.LineLoop(frameGeometry, new THREE.LineBasicMaterial({ color: HOT_COLOR, transparent: true, opacity: 0.85, fog: false }));
  windowTurn.add(ghost);

  // The 3° intercept: a ring on the ground and a dotted line up to the intercept height.
  const ringPts = [];
  for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; ringPts.push(Math.cos(a), Math.sin(a), 0); }
  const ringGeometry = new THREE.BufferGeometry();
  ringGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ringPts, 3));
  const interceptRing = new THREE.LineLoop(ringGeometry, new THREE.LineBasicMaterial({ color: INTERCEPT_COLOR, fog: false }));
  interceptRing.scale.set(80, 80, 1);
  const poleGeometry = new THREE.BufferGeometry();
  poleGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1], 3));
  const pole = new THREE.LineSegments(poleGeometry, new THREE.LineDashedMaterial({ color: INTERCEPT_COLOR, dashSize: 40, gapSize: 30, fog: false }));
  const interceptGroup = new THREE.Group();
  interceptGroup.add(interceptRing, pole);

  // The aim line: two points, rewritten each frame, and a ring where it meets the ground.
  const aimGeometry = new THREE.BufferGeometry();
  aimGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const aim = new THREE.Line(aimGeometry, new THREE.LineBasicMaterial({ color: AIM_COLOR, fog: false }));
  aim.frustumCulled = false;
  const aimRing = new THREE.LineLoop(ringGeometry, new THREE.LineBasicMaterial({ color: AIM_COLOR, fog: false }));
  aimRing.scale.set(60, 60, 1);

  root.add(windowTurn, interceptGroup, aim, aimRing);
  root.userData = { windowTurn, paneHolder, ghost, interceptGroup, pole, aim, aimRing };
  return root;
}

/**
 * Poses the marks for now. `altToZ(ft)` turns a true height into the scene's z; `floorFt` is the ground's height;
 * `pattern` is Pattern 1's route; `selected` is the selected aircraft as the 3D view draws it (alt true, trackDeg,
 * groundSpeedKt, climbFtps on the altimeter) or null. `showMarks` and `showAim` are the two layer switches. `drawScale`
 * is how much bigger than life the aircraft are drawn: the window grows about its middle with it (at most 3 times), so it
 * still shows when zoomed out (true size when zoomed in), and the rings grow with it.
 */
export function updateApproachMarks(group, { altToZ, floorFt, pattern, selected, showMarks, showAim, drawScale = 1 }) {
  const { windowTurn, paneHolder, ghost, interceptGroup, pole, aim, aimRing } = group.userData;
  const marks = approachMarks(pattern);
  windowTurn.visible = showMarks;
  interceptGroup.visible = showMarks;
  if (showMarks) {
    const w = marks.window;
    windowTurn.position.set(w.x, w.y, 0);
    // The pane's local y (its facing) along the approach.
    windowTurn.rotation.z = Math.atan2(-marks.ux, marks.uy);
    const z0 = altToZ(w.lowFt), z1 = altToZ(w.highFt);
    paneHolder.position.z = (z0 + z1) / 2;
    const k = Math.min(WINDOW_MAX_GROW, Math.max(1, drawScale));
    paneHolder.scale.set(WINDOW_WIDTH_FT * k, 1, Math.max(1, (z1 - z0) * k));
    const alt = marks.altimeter;
    ghost.visible = Boolean(alt);
    if (alt) {
      // Grown about the window's middle with it, so the gap between them grows in step.
      const mid = (z0 + z1) / 2, g0 = mid + (altToZ(alt.lowFt) - mid) * k, g1 = mid + (altToZ(alt.highFt) - mid) * k;
      ghost.position.z = (g0 + g1) / 2;
      ghost.scale.set(WINDOW_WIDTH_FT * k, 1, Math.max(1, g1 - g0));
      ghost.material.color.setHex(alt.hot ? HOT_COLOR : COLD_COLOR);
    }
    const i = marks.intercept;
    const ground = altToZ(floorFt) + 2;
    interceptGroup.position.set(i.x, i.y, ground);
    interceptGroup.userData.ring ??= interceptGroup.children[0];
    interceptGroup.userData.ring.scale.set(80 * k, 80 * k, 1);
    pole.scale.set(1, 1, Math.max(1, altToZ(i.altFt) - ground));
    pole.computeLineDistances();
  }
  const s = selected;
  const flying = showAim && s && [s.x, s.y, s.alt].every(Number.isFinite);
  aim.visible = Boolean(flying);
  aimRing.visible = false;
  if (!flying) return marks;
  const gs = Math.max(1, (Number.isFinite(s.groundSpeedKt) ? s.groundSpeedKt : s.kt ?? 0) * KT_TO_FTPS);
  const vz = (Number.isFinite(s.climbFtps) ? s.climbFtps : 0) * heightFactor(s.indicatedAlt ?? s.alt); // true vertical speed
  const trk = ((Number.isFinite(s.trackDeg) ? s.trackDeg : s.headingDeg) ?? 0) * Math.PI / 180;
  // Descending: out to where the line meets the ground, if that is within AIM_GROUND_MAX_FT; otherwise AIM_LINE_MAX_FT ahead.
  const toGroundFt = vz < -0.5 ? (s.alt - floorFt) / -vz * gs : Infinity;
  const hits = toGroundFt <= AIM_GROUND_MAX_FT;
  const reachFt = hits ? toGroundFt : AIM_LINE_MAX_FT;
  const end = { x: s.x + reachFt * Math.sin(trk), y: s.y + reachFt * Math.cos(trk), alt: s.alt + vz / gs * reachFt };
  const at = aim.geometry.attributes.position;
  at.setXYZ(0, s.x, s.y, altToZ(s.alt));
  at.setXYZ(1, end.x, end.y, altToZ(end.alt));
  at.needsUpdate = true;
  aim.geometry.computeBoundingSphere();
  if (hits) {
    aimRing.visible = true;
    aimRing.position.set(end.x, end.y, altToZ(floorFt) + 2);
    aimRing.scale.set(60 * Math.max(1, drawScale), 60 * Math.max(1, drawScale), 1);
  }
  return marks;
}

/** Frees the marks' geometries and materials. */
export function disposeApproachMarks(group) {
  group.removeFromParent();
  group.traverse((o) => {
    o.geometry?.dispose?.();
    o.material?.dispose?.();
  });
}
