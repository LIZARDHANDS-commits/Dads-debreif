// The 3D view's own little control bar (tasks/traffic-camera/plan.md, Phase 3): a Camera menu (Fit, High look-down,
// Top-down, Tower, Chase, Cockpit, Padlock), a Follow menu of the aircraft flying, a High | Performance graphics
// switch and a short status note. It lives inside the 3D stage, so it is only there while 3D is on. Plain DOM,
// labelled, keyboard reachable (native selects and buttons); every listener is removed by dispose() (D411).
import { h, clear } from '../../ui-kit/dom.js';
import { CAMERA_VIEWS } from './camera-views.js';

export const QUALITY_CHOICES = Object.freeze([
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Performance' },
]);

let nextId = 0;

/**
 * @param {{ onView: (id: string) => void, onFollow: (id: string | null) => void, onQuality: (q: string) => void }} on
 * Returns { element, update({ flying, followId, quality }), setView(id), setNote(text), dispose() }.
 */
export function createCameraBar({ onView, onFollow, onQuality }) {
  const n = ++nextId;
  const viewId = `traffic-3d-camera-${n}`;
  const followId = `traffic-3d-follow-${n}`;
  const view = h('select', { id: viewId }, CAMERA_VIEWS.map((v) => h('option', { value: v.id }, v.label)));
  const follow = h('select', { id: followId }, h('option', { value: '' }, 'None'));
  const qualityButtons = QUALITY_CHOICES.map((q) => h('button', { type: 'button', 'aria-pressed': 'false', 'data-quality': q.value }, q.label));
  const note = h('span', { class: 'traffic-3d-note', role: 'status', 'aria-live': 'polite' });
  const element = h('div', { class: 'traffic-3d-bar', role: 'group', 'aria-label': '3D camera' },
    h('label', { for: viewId }, 'Camera'), view,
    h('label', { for: followId }, 'Follow'), follow,
    h('span', { class: 'traffic-3d-quality', role: 'group', 'aria-label': 'Graphics' }, ...qualityButtons),
    note,
  );

  const listeners = [];
  const listen = (el, type, fn) => {
    el.addEventListener(type, fn);
    listeners.push(() => el.removeEventListener(type, fn));
  };
  listen(view, 'change', () => onView(view.value));
  listen(follow, 'change', () => onFollow(follow.value || null));
  qualityButtons.forEach((b) => listen(b, 'click', () => onQuality(b.getAttribute('data-quality'))));
  // Clicks inside the bar must not start a drag on the canvas behind it.
  listen(element, 'pointerdown', (e) => e.stopPropagation?.());

  let lastIds = '';
  return {
    element,
    /** Called each frame: rebuilds the Follow list only when the flying set changes, and marks the graphics choice. */
    update({ flying = [], followId: current = null, quality = 'low' } = {}) {
      const ids = flying.join('|');
      if (ids !== lastIds) {
        lastIds = ids;
        clear(follow);
        follow.append(h('option', { value: '' }, 'None'), ...flying.map((id) => h('option', { value: id }, id)));
      }
      const want = current && flying.includes(current) ? current : '';
      if (follow.value !== want) follow.value = want;
      for (const b of qualityButtons) b.setAttribute('aria-pressed', String(b.getAttribute('data-quality') === quality));
    },
    setView(id) {
      if (view.value !== id) view.value = id;
    },
    setNote(text) {
      if (note.textContent !== text) note.textContent = text;
    },
    dispose() {
      for (const off of listeners.splice(0)) off();
      element.remove?.();
    },
  };
}
