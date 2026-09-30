// Turning the 3D view by hand: drag to orbit, the wheel or + and − to zoom
// (frame.js orbit and wheelZoom). Kept apart from the drawing so any 3D
// renderer can use it on its own element.
import { orbit, wheelZoom } from './frame.js';

/**
 * element: what the pointer and keys act on. settings(): the layout values
 * (yaw3d, pitch3d, zoom3d, altScale3d). setCamera(patch): keeps a change.
 * redraw(): draws the view while a drag is under way.
 * Returns { camera(): the camera to draw now (mid-drag or kept), dispose() }.
 */
export function attachCameraInput(element, { settings, setCamera, redraw }) {
  let dragging = null; // { id, x, y, camera } while the mouse turns the view

  const camera = () => {
    const on = settings();
    return dragging?.camera ?? { yawDeg: on.yaw3d, pitchDeg: on.pitch3d, zoom: on.zoom3d, altScale: on.altScale3d };
  };

  // The camera is kept once the drag ends, not on every move.
  function endDrag(e) {
    if (!dragging || e.pointerId !== dragging.id) return;
    const { yawDeg, pitchDeg } = dragging.camera;
    dragging = null;
    element.classList.remove('is-dragging');
    setCamera({ yaw3d: Math.round(yawDeg), pitch3d: Math.round(pitchDeg) });
  }

  element.tabIndex = 0;
  const listeners = [
    ['pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, camera: camera() };
      element.setPointerCapture?.(e.pointerId);
      element.classList.add('is-dragging');
    }],
    ['pointermove', (e) => {
      if (!dragging || e.pointerId !== dragging.id) return;
      dragging.camera = orbit(dragging.camera, e.clientX - dragging.x, e.clientY - dragging.y);
      dragging.x = e.clientX;
      dragging.y = e.clientY;
      redraw();
    }],
    ['pointerup', endDrag],
    ['pointercancel', endDrag],
    ['wheel', (e) => {
      e.preventDefault();
      if (!e.deltaY) return;
      setCamera({ zoom3d: wheelZoom(camera(), e.deltaY).zoom });
    }],
    ['keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const deltaY = e.key === '+' || e.key === '=' ? -1 : e.key === '-' || e.key === '_' ? 1 : 0;
      if (!deltaY) return;
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
