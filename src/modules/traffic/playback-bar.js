// The bar above the map (specs/SPEC-traffic.md: The screen, R22, R3). Row one
// is the clock: Play or Pause, Rewind, -10 s, +10 s, Reset, the speed, the sim
// time and Running / Paused / Rewinding. Row two is the view: the wind boxes,
// the 2D | 3D switch, the Fit menu (Fit pattern, Fit all routes) and the Layers menu: the three
// presets, then every layer under More (Patrick, 4 Oct). The runway list is built here but sits in the
// Setup column (`runway`).
//
// It shows what it is told and calls back when something is pressed; it never
// runs the sim. Wind, layers and the 2D | 3D choice are settings, so they go
// through the ui-kit controls (with the number rule) and the module reads
// them from its settings. A control whose feature isn't on the screen yet is
// left out rather than shown doing nothing (R3): Rewind and the ±10 s steps
// when their callbacks aren't given, and the wind boxes, the 3D switch, the photo
// and Engine-out reach layers when `available` doesn't say they exist.
import { h } from '../../ui-kit/dom.js';
import { DEFAULTS, SPEEDS, LIMITS, RUNWAYS, DEFAULT_RUNWAY } from './defaults.js';
import { TRAFFIC_VERSION } from './version.js';

/** The layers, in the order the Layers menu lists them (the spec's Layers row). `needs` is a feature that has to exist. */
export const LAYER_ITEMS = Object.freeze([
  // "(2D)": only the 2D map draws it. The PFL ground circle is switched from the Routes on the map list (Patrick, 4 Oct).
  { key: 'layerTrails', label: 'Trails (2D)' },
  { key: 'layerLabels', label: 'Height and speed labels' },
  { key: 'layerPoints', label: 'Route points (2D)' },
  { key: 'layerLegDistances', label: 'Leg distances (2D)' },
  { key: 'layerTurnData', label: 'Turn data, radius and bank (2D)' },
  { key: 'layerBubbles', label: 'Conflict bubbles (2D)' },
  { key: 'layerCautionRings', label: 'Caution rings' },
  { key: 'layerHeightLines', label: 'Height drop lines (3D)', needs: 'view3d' },
  { key: 'layerWindTrack', label: 'Wind-adjusted track', needs: 'windTrack' },
  { key: 'layerSmmReference', label: 'SMM calm reference', needs: 'windTrack' },
  { key: 'layerPhoto', label: 'Satellite photo', needs: 'photo' },
  { key: 'layerEngineReach', label: 'Engine-out reach (glide circle)', needs: 'reach' },
]);

/** The layers to list, leaving out those whose feature isn't built yet: available = { photo, reach }. */
export const layerItems = (available = {}) => LAYER_ITEMS.filter((item) => !item.needs || available[item.needs] === true);

/** The 3 master layer presets. */
export const LAYER_PRESETS = Object.freeze({
  cleanOperational: Object.freeze({
    id: 'cleanOperational',
    label: 'Clean Operational',
    layers: Object.freeze({
      layerTrails: false,
      layerLabels: true,
      layerPoints: false,
      layerLegDistances: false,
      layerTurnData: false,
      layerBubbles: false,
      layerCautionRings: true, // round the selected aircraft only, so it adds no clutter (Patrick, 4 Oct)
      layerHeightLines: false,
      layerWindTrack: true,
      layerSmmReference: false,
      layerPhoto: true,
      layerEngineReach: true, // the PFL glide circle, selected aircraft only (Patrick, 4 Oct)
    }),
  }),
  standardTraining: Object.freeze({
    id: 'standardTraining',
    label: 'Standard Training',
    default: true,
    layers: Object.freeze({
      layerTrails: true,
      layerLabels: true,
      layerPoints: true,
      layerLegDistances: false,
      layerTurnData: false,
      layerBubbles: false,
      layerCautionRings: true,
      layerHeightLines: false,
      layerWindTrack: true,
      layerSmmReference: true,
      layerPhoto: true,
      layerEngineReach: true, // the PFL glide circle, shown since it was built (Patrick, 4 Oct: keep it as a tick)
    }),
  }),
  fullTelemetry: Object.freeze({
    id: 'fullTelemetry',
    label: 'Full Telemetry',
    layers: Object.freeze({
      layerTrails: true,
      layerLabels: true,
      layerPoints: true,
      layerLegDistances: true,
      layerTurnData: true,
      layerBubbles: true,
      layerCautionRings: true,
      layerHeightLines: true,
      layerWindTrack: true,
      layerSmmReference: true,
      layerPhoto: true,
      layerEngineReach: true,
    }),
  }),
});

export const LAYER_PRESET_ITEMS = Object.freeze([
  LAYER_PRESETS.cleanOperational,
  LAYER_PRESETS.standardTraining,
  LAYER_PRESETS.fullTelemetry,
]);

/** What the status says for each mode of the clock. */
export const STATUS_TEXT = Object.freeze({ paused: 'Paused', running: 'Running', rewinding: 'Rewinding' });

export const speedLabel = (x) => `${x}×`;

let nextMenu = 1;

/**
 * A button that opens a small panel under the bar or column it sits in, and
 * closes it again on Escape, a click elsewhere or tabbing out of it. listen: app.listen, so the
 * page-wide listener ends when the module closes.
 * Returns { element, body, button, setOpen, isOpen }.
 */
export function createMenu({ label, children = [], listen }) {
  const id = `traffic-menu-${nextMenu++}`;
  const button = h('button', { type: 'button', class: 'button menu-button', 'aria-expanded': 'false', 'aria-controls': id }, label);
  const body = h('div', { class: 'traffic-menu-body', id, hidden: true }, ...children);
  const element = h('div', { class: 'traffic-menu' }, button, body);
  const setOpen = (open) => {
    body.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  };
  button.addEventListener('click', () => setOpen(body.hidden));
  element.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || body.hidden) return;
    e.preventDefault();
    setOpen(false);
    button.focus();
  });
  // Tabbing out of the menu, to the next control, closes it. (No relatedTarget means the window
  // lost focus or a click landed on something that can't take it; the click case is handled below.)
  element.addEventListener('focusout', (e) => {
    if (e.relatedTarget && !element.contains(e.relatedTarget)) setOpen(false);
  });
  listen(document, 'pointerdown', (e) => {
    if (!element.contains(e.target)) setOpen(false);
  });
  return { element, body, button, setOpen, isOpen: () => !body.hidden };
}

/**
 * controls: ui-kit controls bound to the traffic settings (wind, layers, 2D | 3D).
 * on: { play, pause, reset, speed(x), fit, fitAll?, rewind?, step?(seconds) }.
 * available: { wind, view3d, photo, reach }, each true once that feature is on the screen.
 * listen: app.listen.
 * Returns { element, setState({ mode, clockText, speed, note }) }: a note ("Replaying…") stands in for the status words until it is cleared with null.
 * @param {{ controls: any, settings?: any, on: Record<string, any>, available?: { wind?: boolean, view3d?: boolean, photo?: boolean, reach?: boolean, windTrack?: boolean }, listen: any }} options
 */
export function createPlaybackBar({ controls, settings, on, available = {}, listen }) {
  let mode = 'paused';
  let note = null;
  const makeInstant = (fn) => {
    let lastPointerTime = 0;
    return (e) => {
      if (e && e.button !== undefined && e.button !== 0) return;
      const isPointerDown = e?.type === 'pointerdown';
      const isClick = e?.type === 'click';
      const now = Date.now();
      if (isClick && (now - lastPointerTime < 350)) {
        return;
      }
      if (isPointerDown) {
        lastPointerTime = now;
      }
      fn?.(e);
    };
  };
  const button = (label, onclick, extra = {}) => {
    const handler = makeInstant(onclick);
    return h('button', { type: 'button', class: 'button', onpointerdown: handler, onclick: handler, ...extra }, label);
  };

  // Row one: the clock.
  const playGlyph = h('span', { 'aria-hidden': 'true' }, '▶');
  const playWord = h('span', {}, 'Play');
  const playHandler = makeInstant(() => (mode === 'paused' ? on.play() : on.pause()));
  const play = h('button', { type: 'button', class: 'button primary bar-play', onpointerdown: playHandler, onclick: playHandler }, playGlyph, ' ', playWord);
  const rewindHandler = makeInstant(() => (mode === 'rewinding' ? on.pause() : on.rewind()));
  const rewind = on.rewind
    ? h('button', { type: 'button', class: 'button', 'aria-pressed': 'false', onpointerdown: rewindHandler, onclick: rewindHandler }, h('span', { 'aria-hidden': 'true' }, '⏪'), ' Rewind')
    : null;
  const back = on.step ? button('−10 s', () => on.step(-10), { title: 'Back 10 seconds' }) : null;
  const ahead = on.step ? button('+10 s', () => on.step(10), { title: 'Ahead 10 seconds' }) : null;
  const reset = button('Reset', () => on.reset());
  const speed = h('select', { onchange: () => on.speed(Number(speed.value)) }, SPEEDS.map((x) => h('option', { value: String(x) }, speedLabel(x))));
  speed.value = String(DEFAULTS.speed);
  const clockTime = h('span', {}, '0:00:00');
  const clock = h('p', { class: 'bar-clock' }, h('span', { class: 'visually-hidden' }, 'Sim time '), clockTime);
  const status = h('p', { class: 'bar-status', role: 'status' }, STATUS_TEXT.paused);

  // Row two: the view.
  const wind = available.wind
    ? h(
      'div',
      { class: 'bar-wind', role: 'group', 'aria-label': 'Wind' },
      controls.number('windFromDeg', { label: 'Wind from', unit: '°T', min: LIMITS.windFromDeg[0], max: LIMITS.windFromDeg[1], step: 1 }),
      controls.number('windKt', { label: 'Wind speed', unit: 'kt', min: LIMITS.windKt[0], max: LIMITS.windKt[1], step: 1 }),
    )
    : null;
  const viewSwitch = available.view3d ? controls.viewSwitch() : null; // the ui-kit's shared 2D | 3D switch

  const runwaySelect = h(
    'select',
    {
      class: 'bar-runway',
      'aria-label': 'Active runway',
      onchange: () => {
        const val = runwaySelect.value;
        settings?.update?.({ runway: val });
        on.runwayChange?.(val);
      },
    },
    // A runway that doesn't work yet is not offered (TR-R27, TR-R28: no dead ends).
    RUNWAYS.filter((r) => !r.disabled).map((r) => {
      const opt = h(
        'option',
        {
          value: r.id,
          disabled: Boolean(r.disabled),
        },
        r.label,
      );
      if (r.disabled) {
        opt.disabled = true;
        opt.setAttribute?.('disabled', '');
      }
      return opt;
    }),
  );
  runwaySelect.value = settings?.get?.()?.runway ?? DEFAULT_RUNWAY;

  // Layer settings binding & presets.
  const layerControls = layerItems(available).map((item) => {
    const el = controls?.checkbox ? controls.checkbox(item.key, { label: item.label }) : null;
    return { key: item.key, el };
  });

  const layerInputs = new Map();
  for (const { key, el } of layerControls) {
    if (!el) continue;
    const input = (el.querySelector ? el.querySelector('input') : (el.childNodes || []).find((n) => n.tagName === 'INPUT')) ?? el;
    layerInputs.set(key, input);
  }

  let activePresetId = 'standardTraining';

  function detectActivePreset() {
    for (const preset of LAYER_PRESET_ITEMS) {
      let match = true;
      for (const [key, val] of Object.entries(preset.layers)) {
        const input = layerInputs.get(key);
        if (input && 'checked' in input && input.checked !== val) {
          match = false;
          break;
        }
      }
      if (match) return preset.id;
    }
    return null;
  }

  // A preset is shown as chosen only while the layers match it (Patrick, 4 Oct): read from the settings when there
  // are any, so the opening layers, which match no preset, light none.
  const listedKeys = new Set(layerItems(available).map((item) => item.key));
  function presetFromSettings() {
    const values = settings.get();
    const found = LAYER_PRESET_ITEMS.find((preset) => Object.entries(preset.layers).every(([key, val]) => !listedKeys.has(key) || Boolean(values[key]) === val));
    return found?.id ?? null;
  }
  function getActivePresetId() {
    if (settings?.get) return presetFromSettings();
    return detectActivePreset() ?? activePresetId;
  }

  const presetButtons = LAYER_PRESET_ITEMS.map((preset) => {
    const isDefault = preset.id === getActivePresetId();
    const trigger = makeInstant(() => {
      applyPreset(preset);
    });
    const btn = h(
      'button',
      {
        type: 'button',
        class: `button menu-item layer-preset ${isDefault ? 'active' : ''}`.trim(),
        role: 'menuitemradio',
        'aria-checked': String(isDefault),
        'aria-pressed': String(isDefault),
        'data-preset': preset.id,
        onpointerdown: trigger,
        onclick: trigger,
      },
      preset.label,
    );
    return { preset, btn };
  });

  function syncPresetButtons() {
    const currentId = getActivePresetId();
    for (const { preset, btn } of presetButtons) {
      const isActive = preset.id === currentId;
      btn.setAttribute('aria-checked', String(isActive));
      btn.setAttribute('aria-pressed', String(isActive));
      if (btn.classList?.toggle) {
        btn.classList.toggle('active', isActive);
      }
    }
  }

  function applyPreset(preset) {
    activePresetId = preset.id;
    if (settings?.update) {
      settings.update(preset.layers);
    }
    for (const { key } of layerControls) {
      const input = layerInputs.get(key);
      const val = Boolean(preset.layers[key]);
      if (input && input.checked !== val) {
        input.checked = val;
        if (typeof input.dispatch === 'function') input.dispatch('change');
        else if (typeof input.dispatchEvent === 'function') input.dispatchEvent(new Event('change'));
      }
    }
    syncPresetButtons();
    if (on?.preset) on.preset(preset);
  }

  if (settings?.subscribe) {
    settings.subscribe((vals) => {
      syncPresetButtons();
      if (vals?.runway && runwaySelect.value !== vals.runway) {
        runwaySelect.value = vals.runway;
      }
    });
  }

  for (const [, input] of layerInputs) {
    input.addEventListener?.('change', () => syncPresetButtons());
  }

  // Every layer, one tick each, under More at the foot of the Layers menu (Patrick, 4 Oct: they had been built but hidden).
  const moreLayers = h(
    'details',
    { class: 'traffic-layer-more' },
    h('summary', {}, 'More'),
    h('div', { class: 'traffic-layer-controls' }, ...layerControls.map((c) => c.el).filter(Boolean)),
  );

  const layers = createMenu({
    label: 'Layers',
    listen,
    children: [...presetButtons.map((p) => p.btn), moreLayers],
  });

  layers.button.addEventListener('click', () => {
    syncPresetButtons();
  });

  // Fit (Patrick, 4 Oct): a menu with the pattern and every route, when both can be done; otherwise one Fit button.
  const fitItem = (label, title, call) => {
    const trigger = makeInstant(() => {
      fitMenu.setOpen(false);
      fitMenu.button.focus();
      call();
    });
    return h('button', { type: 'button', class: 'button menu-item', title, onpointerdown: trigger, onclick: trigger }, label);
  };
  const fitMenu = on.fitAll
    ? createMenu({
      label: 'Fit',
      listen,
      children: [
        fitItem('Fit pattern', 'Frame the first pattern shown and the aircraft near it', () => on.fit()),
        fitItem('Fit all routes', 'Frame every route, the long entries too', () => on.fitAll()),
      ],
    })
    : null;
  const fit = fitMenu ? fitMenu.element : button('Fit', () => on.fit(), { title: 'Frame the first pattern shown and the aircraft near it' });

  const versionBadge = h(
    'span',
    {
      class: 'traffic-version-badge',
      title: `Traffic Pattern Sim ${TRAFFIC_VERSION}`,
      'aria-label': `Traffic Pattern Sim version ${TRAFFIC_VERSION}`,
    },
    TRAFFIC_VERSION,
  );

  const element = h(
    'div',
    { class: 'traffic-bar', role: 'group', 'aria-label': 'Playback and view' },
    h(
      'div',
      { class: 'bar-row bar-transport' },
      play, rewind, back, ahead, reset,
      h('label', { class: 'bar-speed' }, h('span', { class: 'visually-hidden' }, 'Speed '), speed),
      clock, status, versionBadge,
    ),
    h('div', { class: 'bar-row bar-view' }, wind, viewSwitch, fit, layers.element),
  );

  const write = (node, text) => {
    if (node.textContent !== text) node.textContent = text;
  };

  return {
    element,
    /** The Active runway list, for the Setup column (Patrick, 4 Oct: it moved there from the bar, as it is). */
    runway: runwaySelect,
    applyPreset,
    setPreset(presetId) {
      const preset = typeof presetId === 'string' ? LAYER_PRESETS[presetId] : presetId;
      if (preset) applyPreset(preset);
    },
    /** Shows the clock's state: mode 'paused' | 'running' | 'rewinding', the clock as text, the speed, and a note in place of the status words. */
    setState({ mode: nextMode, clockText, speed: nextSpeed, note: nextNote } = /** @type {{ mode?: string, clockText?: string, speed?: number, note?: string | null }} */ ({})) {
      if (nextNote !== undefined) note = nextNote || null;
      if (nextMode !== undefined && STATUS_TEXT[nextMode]) {
        mode = nextMode;
        write(playGlyph, mode === 'paused' ? '▶' : '❚❚');
        write(playWord, mode === 'paused' ? 'Play' : 'Pause');
        rewind?.setAttribute('aria-pressed', String(mode === 'rewinding'));
      }
      write(status, note ?? STATUS_TEXT[mode]);
      if (clockText !== undefined) write(clockTime, clockText);
      if (nextSpeed !== undefined && speed.value !== String(nextSpeed)) speed.value = String(nextSpeed);
    },
  };
}
