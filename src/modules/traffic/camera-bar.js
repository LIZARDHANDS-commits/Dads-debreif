// The 3D view's own control bar (tasks/traffic-camera/plan.md, Phase 3):
// 2-Tier Segmented Pill Toolbar matching Turn Fight and platform standards:
// Tier 1: Mount (Overview, Tower, Free Drone, Chase, Cockpit)
// Tier 2: Aim Modes & Presets (Field/Fit/High/Top for Overview; Freelook/Track/Rwy 29L for Tower & Free;
//         Trail/Orbit/Rwy 29L for Chase; Boresight/Freelook/Rwy 29L + Seat for Cockpit)
// Follow selector, Graphics quality switch, hotkey hints, and live status notes.
import { h, clear } from '../../ui-kit/dom.js';
import {
  CAMERA_MOUNTS, OVERVIEW_PRESETS, AIM_MODES, COCKPIT_SEATS,
  DEFAULT_CAMERA_STATE, stateFromLegacy,
} from './camera-views.js';

export const QUALITY_CHOICES = Object.freeze([
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Performance' },
]);

let nextId = 0;

/** Converts 2-tier state to legacy view id */
export function legacyViewFromState(state) {
  if (state.mount === 'overview') return state.preset || 'field';
  if (state.mount === 'tower') return 'tower';
  if (state.mount === 'free') return 'free';
  if (state.mount === 'chase') return state.aim === 'padlock' ? 'padlock' : 'low';
  if (state.mount === 'cockpit') return state.aim === 'padlock' ? 'padlock' : 'cockpit';
  return 'field';
}

/**
 * @param {{
 *   onCamera?: (cam: { mount: string, preset: string, aim: string, seat: string }) => void,
 *   onView?: (id: string) => void,
 *   onFollow?: (id: string | null) => void,
 *   onQuality?: (q: string) => void,
 *   initialCamera?: { mount: string, preset: string, aim: string, seat: string }
 * }} options
 */
export function createCameraBar({
  onCamera = () => {},
  onView = () => {},
  onFollow = () => {},
  onQuality = () => {},
  initialCamera = DEFAULT_CAMERA_STATE,
}) {
  const n = ++nextId;
  const followId = `traffic-3d-follow-${n}`;

  let camState = { ...DEFAULT_CAMERA_STATE, ...initialCamera };
  let currentQuality = 'low';

  const listeners = [];
  const listen = (el, type, fn) => {
    el.addEventListener(type, fn);
    listeners.push(() => el.removeEventListener(type, fn));
  };

  // ---- Tier 1: Mount Pills ----
  const mountButtons = new Map();
  const mountGroup = h('div', { class: 'traffic-cam-group', role: 'radiogroup', 'aria-label': 'Camera Mount' },
    CAMERA_MOUNTS.map((m) => {
      const btn = h('button', {
        type: 'button',
        class: 'traffic-cam-pill',
        'data-mount': m.id,
        'aria-pressed': String(camState.mount === m.id),
      }, m.label);
      mountButtons.set(m.id, btn);
      listen(btn, 'click', () => selectMount(m.id));
      return btn;
    })
  );

  // ---- Tier 2: Aim / Preset / Seat Sub-group ----
  const subGroup = h('div', { class: 'traffic-cam-group traffic-cam-subgroup', role: 'group', 'aria-label': 'Camera Mode' });
  const seatGroup = h('div', { class: 'traffic-cam-group traffic-cam-seatgroup', role: 'radiogroup', 'aria-label': 'Cockpit Seat', hidden: true },
    COCKPIT_SEATS.map((s) => {
      const btn = h('button', {
        type: 'button',
        class: 'traffic-cam-pill',
        'data-seat': s.id,
        'aria-pressed': String(camState.seat === s.id),
      }, s.label);
      listen(btn, 'click', () => selectSeat(s.id));
      return btn;
    })
  );

  // ---- Follow Aircraft Selector ----
  const followSelect = h('select', { id: followId }, h('option', { value: '' }, 'None'));
  const followContainer = h('div', { class: 'traffic-cam-follow' },
    h('label', { for: followId }, 'Follow'),
    followSelect
  );

  // ---- Quality Buttons ----
  const qualityButtons = QUALITY_CHOICES.map((q) => {
    const btn = h('button', {
      type: 'button',
      class: 'traffic-cam-pill',
      'aria-pressed': 'false',
      'data-quality': q.value,
    }, q.label);
    listen(btn, 'click', () => onQuality(q.value));
    return btn;
  });
  const qualityGroup = h('div', { class: 'traffic-cam-group traffic-cam-quality', role: 'group', 'aria-label': 'Graphics' },
    ...qualityButtons
  );

  // ---- Hint & Shortcuts Line ----
  const hintLine = h('div', { class: 'traffic-cam-hint', 'aria-live': 'polite' });
  const note = h('span', { class: 'traffic-3d-note', role: 'status', 'aria-live': 'polite' });

  // Main container
  const rowTop = h('div', { class: 'traffic-cam-row' },
    mountGroup,
    subGroup,
    seatGroup,
    followContainer,
    qualityGroup
  );

  const element = h('div', { class: 'traffic-3d-bar', role: 'group', 'aria-label': '3D camera' },
    rowTop,
    hintLine,
    note
  );

  // Stop pointer events inside bar from dragging canvas
  listen(element, 'pointerdown', (e) => e.stopPropagation?.());
  listen(followSelect, 'change', () => onFollow(followSelect.value || null));

  function selectMount(mountId) {
    const next = { ...camState, mount: mountId };
    if (mountId === 'overview') {
      next.preset = camState.preset || 'field';
      next.aim = 'boresight';
    } else if (mountId === 'tower') {
      next.aim = camState.aim === 'padlock' ? 'padlock' : (followSelect.value ? 'track' : 'freelook');
    } else if (mountId === 'free') {
      next.aim = camState.aim === 'padlock' ? 'padlock' : 'freelook';
    } else if (mountId === 'chase') {
      next.aim = camState.aim === 'padlock' ? 'padlock' : 'boresight';
    } else if (mountId === 'cockpit') {
      next.aim = camState.aim === 'padlock' ? 'padlock' : 'boresight';
      next.seat = camState.seat || 'front';
    }
    camState = next;
    syncUi();
    onCamera(camState);
    onView(legacyViewFromState(camState));
  }

  function selectPreset(presetId) {
    camState = { ...camState, preset: presetId };
    syncUi();
    onCamera(camState);
    onView(presetId);
  }

  function selectAim(aimId) {
    camState = { ...camState, aim: aimId };
    syncUi();
    onCamera(camState);
    onView(legacyViewFromState(camState));
  }

  function selectSeat(seatId) {
    camState = { ...camState, seat: seatId };
    syncUi();
    onCamera(camState);
  }

  function syncUi() {
    // 1. Mount pills
    for (const [id, btn] of mountButtons) {
      const active = camState.mount === id;
      btn.setAttribute('aria-pressed', String(active));
      btn.classList.toggle('is-active', active);
    }

    // 2. Sub-group pills
    clear(subGroup);
    if (camState.mount === 'overview') {
      for (const p of OVERVIEW_PRESETS) {
        const active = camState.preset === p.id;
        const btn = h('button', {
          type: 'button',
          class: `traffic-cam-pill${active ? ' is-active' : ''}`,
          'aria-pressed': String(active),
        }, p.label);
        listen(btn, 'click', () => selectPreset(p.id));
        subGroup.append(btn);
      }
    } else {
      const aims = AIM_MODES[camState.mount] ?? AIM_MODES.free;
      for (const a of aims) {
        const active = camState.aim === a.id;
        const btn = h('button', {
          type: 'button',
          class: `traffic-cam-pill${active ? ' is-active' : ''}`,
          'aria-pressed': String(active),
        }, a.label);
        listen(btn, 'click', () => selectAim(a.id));
        subGroup.append(btn);
      }
    }

    // 3. Cockpit seat group
    seatGroup.hidden = camState.mount !== 'cockpit';
    if (!seatGroup.hidden) {
      for (const btn of seatGroup.querySelectorAll('.traffic-cam-pill')) {
        const active = btn.getAttribute('data-seat') === camState.seat;
        btn.setAttribute('aria-pressed', String(active));
        btn.classList.toggle('is-active', active);
      }
    }

    // 4. Follow container visibility
    followContainer.hidden = camState.mount === 'overview';

    // 5. Update hint line
    updateHint();
  }

  function updateHint() {
    clear(hintLine);
    const kbd = (key) => h('kbd', { class: 'traffic-kbd' }, key);
    if (camState.mount === 'free') {
      hintLine.append(
        kbd('WASD'), ' Fly \u00a0',
        kbd('R'), '/', kbd('F'), ' Alt \u00a0',
        kbd('Shift'), ' 4× \u00a0·\u00a0 ',
        kbd('C'), ' Track \u00a0',
        kbd('P'), ' Rwy 29L \u00a0',
        kbd('['), '/', kbd(']'), ' Target'
      );
    } else if (camState.mount === 'tower') {
      hintLine.append(
        kbd('C'), ' Track \u00a0',
        kbd('P'), ' Rwy 29L \u00a0',
        kbd('['), '/', kbd(']'), ' Target \u00a0·\u00a0 Drag looks out cab windows'
      );
    } else if (camState.mount === 'cockpit') {
      hintLine.append(
        kbd('C'), ' Center \u00a0',
        kbd('P'), ' Rwy 29L \u00a0',
        kbd('['), '/', kbd(']'), ' Target \u00a0·\u00a0 Drag turns head'
      );
    } else if (camState.mount === 'chase') {
      hintLine.append(
        kbd('C'), ' Center \u00a0',
        kbd('P'), ' Rwy 29L \u00a0',
        kbd('['), '/', kbd(']'), ' Target \u00a0·\u00a0 Drag orbits'
      );
    } else {
      hintLine.append('Drag orbits · Scroll zooms · Shift-drag pans');
    }
  }

  // Initial sync
  syncUi();

  let lastIds = '';
  return {
    element,
    /** Rebuilds Follow list only when flying set changes, and marks graphics choice. */
    update({ flying = [], followId: current = null, quality = 'low' } = {}) {
      const ids = flying.join('|');
      if (ids !== lastIds) {
        lastIds = ids;
        clear(followSelect);
        followSelect.append(h('option', { value: '' }, 'None'), ...flying.map((id) => h('option', { value: id }, id)));
      }
      const want = current && flying.includes(current) ? current : '';
      if (followSelect.value !== want) followSelect.value = want;
      if (quality !== currentQuality) {
        currentQuality = quality;
        for (const b of qualityButtons) {
          const active = b.getAttribute('data-quality') === quality;
          b.setAttribute('aria-pressed', String(active));
          b.classList.toggle('is-active', active);
        }
      }
    },
    setCamera(nextState) {
      camState = { ...camState, ...nextState };
      syncUi();
    },
    setView(id) {
      const converted = stateFromLegacy(id, followSelect.value);
      camState = { ...camState, ...converted };
      syncUi();
    },
    setNote(text) {
      if (note.textContent !== text) note.textContent = text ?? '';
    },
    getCamera() {
      return { ...camState };
    },
    dispose() {
      for (const off of listeners.splice(0)) off();
      element.remove?.();
    },
  };
}
