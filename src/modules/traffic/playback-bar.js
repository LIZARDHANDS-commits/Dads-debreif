// The bar above the map (specs/SPEC-traffic.md: The screen, R22, R3). Row one
// is the clock: Play or Pause, Rewind, -10 s, +10 s, Reset, the speed, the sim
// time and Running / Paused / Rewinding. Row two is the view: the wind boxes,
// the 2D | 3D switch, Fit, and the Layers menu (which ends with Fit all routes).
//
// It shows what it is told and calls back when something is pressed; it never
// runs the sim. Wind, layers and the 2D | 3D choice are settings, so they go
// through the ui-kit controls (with the number rule) and the module reads
// them from its settings. A control whose feature isn't on the screen yet is
// left out rather than shown doing nothing (R3): Rewind and the ±10 s steps
// when their callbacks aren't given, and the wind boxes, the 3D switch, the photo
// and Engine-out reach layers when `available` doesn't say they exist.
import { h } from '../../ui-kit/dom.js';
import { DEFAULTS, SPEEDS, LIMITS } from './defaults.js';

/** The layers, in the order the Layers menu lists them (the spec's Layers row). `needs` is a feature that has to exist. */
export const LAYER_ITEMS = Object.freeze([
  { key: 'layerTrails', label: 'Trails' },
  { key: 'layerLabels', label: 'Height and speed labels' },
  { key: 'layerPoints', label: 'Route points' },
  { key: 'layerLegDistances', label: 'Leg distances' },
  { key: 'layerTurnData', label: 'Turn data (radius and bank)' },
  { key: 'layerBubbles', label: 'Conflict bubbles' },
  { key: 'layerCautionRings', label: 'Caution rings' },
  { key: 'layerHeightLines', label: 'Height drop lines (3D)', needs: 'view3d' },
  { key: 'layerWindTrack', label: 'Wind-adjusted track', needs: 'windTrack' },
  { key: 'layerSmmReference', label: 'SMM calm reference', needs: 'windTrack' },
  { key: 'layerPhoto', label: 'Satellite photo', needs: 'photo' },
  { key: 'layerEngineReach', label: 'Engine-out reach', needs: 'reach' },
]);

/** The layers to list, leaving out those whose feature isn't built yet: available = { photo, reach }. */
export const layerItems = (available = {}) => LAYER_ITEMS.filter((item) => !item.needs || available[item.needs] === true);

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
 * @param {{ controls: any, on: Record<string, any>, available?: { wind?: boolean, view3d?: boolean, photo?: boolean, reach?: boolean, windTrack?: boolean }, listen: any }} options
 */
export function createPlaybackBar({ controls, on, available = {}, listen }) {
  let mode = 'paused';
  let note = null; // words shown in place of the mode's while something is busy
  const button = (label, onclick, extra = {}) => h('button', { type: 'button', class: 'button', onclick, ...extra }, label);

  // Row one: the clock.
  const playGlyph = h('span', { 'aria-hidden': 'true' }, '▶');
  const playWord = h('span', {}, 'Play');
  const play = h('button', { type: 'button', class: 'button primary bar-play', onclick: () => (mode === 'paused' ? on.play() : on.pause()) }, playGlyph, ' ', playWord);
  const rewind = on.rewind
    ? h('button', { type: 'button', class: 'button', 'aria-pressed': 'false', onclick: () => (mode === 'rewinding' ? on.pause() : on.rewind()) }, h('span', { 'aria-hidden': 'true' }, '⏪'), ' Rewind')
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
  // "Fit all routes" is the last item of the Layers menu, so the bar keeps one row at 1280 px (UI-01); Fit, the usual
  // one, stays in the bar.
  const fitAll = on.fitAll
    ? h('button', { type: 'button', class: 'button menu-item', title: 'Frame every route, the long entries too', onclick: () => {
      layers.setOpen(false);
      layers.button.focus();
      on.fitAll();
    } }, 'Fit all routes')
    : null;
  const layers = createMenu({ label: 'Layers', listen, children: [...layerItems(available).map((item) => controls.checkbox(item.key, { label: item.label })), fitAll] });
  const fit = button('Fit', () => on.fit(), { title: 'Frame the first pattern shown and the aircraft near it' });

  const element = h(
    'div',
    { class: 'traffic-bar', role: 'group', 'aria-label': 'Playback and view' },
    h(
      'div',
      { class: 'bar-row bar-transport' },
      play, rewind, back, ahead, reset,
      h('label', { class: 'bar-speed' }, h('span', { class: 'visually-hidden' }, 'Speed '), speed),
      clock, status,
    ),
    h('div', { class: 'bar-row bar-view' }, wind, viewSwitch, fit, layers.element),
  );

  const write = (node, text) => {
    if (node.textContent !== text) node.textContent = text;
  };

  return {
    element,
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
