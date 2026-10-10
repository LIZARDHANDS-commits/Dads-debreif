// Turning the 3D view by hand: drag to orbit, the wheel or + and − to zoom
// (frame.js orbit and wheelZoom). In the Cockpit camera (DB-21) a drag turns
// the head instead, within the shared limits, and the wheel does nothing.
// Kept apart from the drawing so any 3D renderer can use it on its own element.
import { orbit, wheelZoom } from './frame.js';
import { COCKPIT_HEAD } from '../../../ui-kit/ct156-cockpit.js';

/** Degrees the head turns per pixel of drag in the cockpit (Turn Sim's and Turn Fight's POV.degPerPx). */
export const HEAD_DEG_PER_PX = 0.3;
/** @type {(v: number, range: readonly number[]) => number} */
const within = (v, range) => Math.max(range[0], Math.min(range[1], v));

/**
 * element: what the pointer and keys act on. settings(): the layout values
 * (yaw3d, pitch3d, zoom3d, altScale3d, cam3d, headYaw3d, headPitch3d). setCamera(patch): keeps a change.
 * redraw(): draws the view while a drag is under way.
 * Returns { camera(): the camera to draw now (mid-drag or kept), dispose() }.
 */
export function attachCameraInput(element, { settings, setCamera, redraw }) {
  let dragging = null; // { id, x, y, camera } while the mouse turns the view

  const inCockpit = () => settings().cam3d === 'cockpit';
  const camera = () => {
    const on = settings();
    return dragging?.camera ?? {
      yawDeg: on.yaw3d, pitchDeg: on.pitch3d, zoom: on.zoom3d, altScale: on.altScale3d, headYawDeg: on.headYaw3d, headPitchDeg: on.headPitch3d,
    };
  };

  // The camera is kept once the drag ends, not on every move.
  function endDrag(e) {
    if (!dragging || e.pointerId !== dragging.id) return;
    const { yawDeg, pitchDeg, headYawDeg, headPitchDeg } = dragging.camera;
    const head = dragging.head;
    dragging = null;
    element.classList.remove('is-dragging');
    setCamera(head ? { headYaw3d: Math.round(headYawDeg), headPitch3d: Math.round(headPitchDeg) } : { yaw3d: Math.round(yawDeg), pitch3d: Math.round(pitchDeg) });
  }

  element.tabIndex = 0;
  const listeners = [
    ['pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, camera: camera(), head: inCockpit() };
      element.setPointerCapture?.(e.pointerId);
      element.classList.add('is-dragging');
    }],
    ['pointermove', (e) => {
      if (!dragging || e.pointerId !== dragging.id) return;
      const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
      dragging.camera = dragging.head
        ? {
          ...dragging.camera,
          headYawDeg: within(dragging.camera.headYawDeg - dx * HEAD_DEG_PER_PX, COCKPIT_HEAD.yawDeg),
          headPitchDeg: within(dragging.camera.headPitchDeg - dy * HEAD_DEG_PER_PX, COCKPIT_HEAD.pitchDeg),
        }
        : orbit(dragging.camera, dx, dy);
      dragging.x = e.clientX;
      dragging.y = e.clientY;
      redraw();
    }],
    ['pointerup', endDrag],
    ['pointercancel', endDrag],
    ['wheel', (e) => {
      e.preventDefault();
      if (!e.deltaY || inCockpit()) return;
      setCamera({ zoom3d: wheelZoom(camera(), e.deltaY).zoom });
    }],
    ['keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const deltaY = e.key === '+' || e.key === '=' ? -1 : e.key === '-' || e.key === '_' ? 1 : 0;
      if (!deltaY || inCockpit()) return;
      e.preventDefault();
      setCamera({ zoom3d: wheelZoom(camera(), deltaY).zoom });
    }],
  ];
  for (const [type, fn] of listeners) element.addEventListener(type, fn, type === 'wheel' ? { passive: false } : undefined);

  return {
    camera,
    dispose() {
      for (const [type, fn] of listeners) element.removeEventListener(type, fn);
    },
  };
}
