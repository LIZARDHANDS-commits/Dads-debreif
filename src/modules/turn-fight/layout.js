// The Turn Fight's screen (SPEC-turn-fight, "The screen", R22): the Fight
// setup column, the stage (toolbar, drawing area) and the Result column. Only
// the essentials show at first; the tuning numbers sit in one closed "Turn
// Fight settings" menu and the extras behind their checkboxes. The side
// columns collapse with a real button (#34, #35). Everything on screen goes in
// as text through h(), never as HTML.
//
// The stage's drawing area is its own element (`drawing`) with the flat 2D
// views in one child and an empty, hidden slot for a 3D view in the other, and
// the toolbar has a slot (`viewSwitch`) for a 2D | 3D switch, so a 3D view can
// be dropped in without touching the readouts or the fight.
import { h } from '../../ui-kit/dom.js';
import { createPanel } from '../../ui-kit/panel.js';
import { createSettingsMenu } from '../../ui-kit/settings-menu.js';
import { createReadoutTable } from './readouts-panel.js';
import { RANGES } from './state.js';
import { limitWarning } from './t6-limit.js';

const RATES = [[0.5, '0.5×'], [1, '1×'], [2, '2×'], [4, '4×']];
const HEIGHT_SCALES = [[1, '1×'], [2, '2×'], [4, '4×']];

let nextId = 1;

/**
 * settings: the remembered values (storage/settings.js); controls: ui-kit controls bound to them.
 * on: { playPause, reset, resetDefaults, moreToggled }, called from the buttons.
 */
export function createLayout({ settings, controls, on }) {
  // ── Fight setup column ──────────────────────────────────────────────
  const fightType = controls.choice('circles', { label: 'Fight type', options: [[1, '1-circle'], [2, '2-circle']] });
  const separation = controls.number('separationNm', { label: 'Start separation', ...RANGES.separationNm });

  // One aircraft's boxes: speed and G, with pitch beside them (Climb and dive
  // only), and the T-6 limit warning right under them.
  function aircraft(who, letter, name) {
    const warning = h('p', { class: 'tf-warning', id: `tf-warning-${nextId++}`, hidden: true });
    // The unit is in the label, to keep the three boxes in one row (the refusal message still names it).
    const speed = controls.number(`${who}Kt`, { label: 'Speed (KTAS)', ...RANGES[`${who}Kt`] });
    const g = controls.number(`${who}G`, { label: 'G', ...RANGES[`${who}G`] });
    const gInput = g.querySelector('input');
    gInput.setAttribute('aria-describedby', `${gInput.getAttribute('aria-describedby')} ${warning.id}`);
    const pitchBox = h('div', { class: 'tf-pitch', hidden: true }, controls.number(`${who}PitchDeg`, { label: 'Pitch (°)', ...RANGES[`${who}PitchDeg`] }));
    const element = h(
      'fieldset',
      { class: `tf-aircraft tf-${who}` },
      h('legend', {}, h('span', { class: 'tf-badge', 'aria-hidden': 'true' }, letter), name),
      h('div', { class: 'tf-aircraft-row' }, speed, g, pitchBox),
      warning,
    );
    return { element, warning, pitchBox };
  }
  const blue = aircraft('blue', 'B', 'Blue');
  const red = aircraft('red', 'R', 'Red');

  const chase = controls.checkbox('chase', { label: 'First nose chases' });
  const vertical = controls.checkbox('vertical', { label: 'Climb and dive' });
  const energy = controls.checkbox('energy', { label: 'Energy (T-6)' });
  controls.setDisabled('energy', true); // Energy mode is a later change; the box keeps its place
  const energyHint = h('p', { class: 'tf-hint', id: 'tf-energy-hint' }, 'Energy mode is coming soon.');
  energy.querySelector('input').setAttribute('aria-describedby', energyHint.id);

  // The one closed settings menu. Start geometry and Energy sections are made
  // here ahead of Display when those arrive (most-used first).
  const menu = createSettingsMenu({
    title: 'Turn Fight settings',
    onReset: () => on.resetDefaults(),
    resetLabel: 'Reset to V6 defaults',
    // The column scrolls, so a menu opened near its foot is brought into view, Reset button and all.
    onToggle: (collapsed) => !collapsed && menu.element.scrollIntoView?.({ block: 'nearest' }),
  });
  const display = menu.section('Display');
  display.append(
    controls.choice('heightScale', { label: 'Side view height scale', options: HEIGHT_SCALES }),
    h('p', { class: 'tf-hint' }, 'Stretches heights in the side view. It shows with Climb and dive.'),
  );

  const about = createPanel({ title: 'About this model', collapsed: true });
  about.body.append(
    h('p', { class: 'tf-model' }, 'Simplified: constant speed and turn rate'),
    h('p', {}, h('b', {}, '1-circle: '), 'opposite turn directions after the merge. A radius fight.'),
    h('p', {}, h('b', {}, '2-circle: '), 'same turn direction after the merge. A rate fight.'),
    h('p', {}, h('b', {}, 'First nose: '), 'a yellow dashed line marks the first aircraft to get its nose within 5° of the other.'),
    h('p', {}, 'Level, coordinated turns, each aircraft a point.'),
  );

  const setupPanel = createPanel({ title: 'Fight setup', onToggle: (collapsed) => settings.update({ setupOpen: !collapsed }) });
  setupPanel.body.append(
    fightType, separation, blue.element, red.element,
    h('div', { class: 'tf-extras' }, chase, vertical, energy, energyHint),
    menu.element, about.element,
  );
  const setupCol = h('aside', { class: 'tf-col tf-col-setup', 'aria-label': 'Fight setup' }, setupPanel.element);

  // ── Stage ───────────────────────────────────────────────────────────
  const playButton = h('button', { type: 'button', class: 'button primary tf-play', onclick: () => on.playPause() }, 'Play');
  const resetButton = h('button', { type: 'button', class: 'button', onclick: () => on.reset() }, 'Reset');
  const viewSwitch = h('span', { class: 'tf-view-switch' }); // the 2D | 3D switch goes here
  const timeText = h('span', { class: 'tf-pill tf-time' }, 'T+0.0');
  const phaseText = h('span', { class: 'tf-pill tf-phase' }, 'HEAD-TO-HEAD');
  const toolbar = h(
    'div',
    { class: 'tf-toolbar' },
    playButton, resetButton, viewSwitch,
    controls.select('playbackRate', { label: 'Playback speed', options: RATES }),
    timeText, phaseText,
  );
  const stopped = h('p', { class: 'tf-stopped', role: 'status', hidden: true });

  const canvas = h('canvas', { class: 'tf-topdown' });
  const profileCanvas = h('canvas', { class: 'tf-profile-canvas' });
  const profile = h('section', { class: 'tf-profile', 'aria-label': 'Side view', hidden: true }, profileCanvas);
  const flat = h('div', { class: 'tf-flat' }, h('div', { class: 'tf-topdown-wrap' }, canvas), profile);
  const slot3d = h('div', { class: 'tf-3d', hidden: true });
  const drawing = h('div', { class: 'tf-drawing' }, flat, slot3d);
  const stage = h(
    'section',
    { class: 'tf-stage', 'aria-label': 'Fight' },
    toolbar,
    stopped,
    drawing,
    h('p', { class: 'tf-footer' }, 'Simplified: constant speed and turn rate'),
  );

  // ── Result column ───────────────────────────────────────────────────
  const resultTable = createReadoutTable({ caption: 'Result' });
  const moreTable = createReadoutTable({ caption: 'More detail' });
  const more = createPanel({ title: 'More detail', collapsed: true, onToggle: (collapsed) => on.moreToggled(!collapsed) });
  more.body.append(moreTable.element);
  const resultPanel = createPanel({ title: 'Result', onToggle: (collapsed) => settings.update({ resultOpen: !collapsed }) });
  resultPanel.body.append(resultTable.element, more.element);
  const resultCol = h('aside', { class: 'tf-col tf-col-result', 'aria-label': 'Result' }, resultPanel.element);

  const element = h('div', { class: 'turn-fight' }, h('h1', { class: 'visually-hidden' }, 'Turn Fight'), setupCol, stage, resultCol);

  function showWarning(box, text) {
    if (box.warning.textContent !== (text ?? '')) box.warning.textContent = text ?? '';
    box.warning.hidden = !text;
  }

  return {
    element,
    canvas,
    profileCanvas,
    /** The stage's drawing area: `flat` holds the 2D views, `slot3d` is where a 3D view mounts. */
    drawing: { element: drawing, flat, slot3d },
    /** An empty spot on the toolbar, next to Play, for the 2D | 3D switch. */
    viewSwitch,
    /** Shows the side view, and which controls go with each checkbox, from the settings. */
    applyLayout(values) {
      setupPanel.setCollapsed(!values.setupOpen);
      resultPanel.setCollapsed(!values.resultOpen);
      setupCol.classList.toggle('is-collapsed', !values.setupOpen);
      resultCol.classList.toggle('is-collapsed', !values.resultOpen);
      blue.pitchBox.hidden = !values.vertical;
      red.pitchBox.hidden = !values.vertical;
      profile.hidden = !values.vertical;
      controls.setDisabled('heightScale', !values.vertical);
      showWarning(blue, limitWarning(values.blueKt, values.blueG));
      showWarning(red, limitWarning(values.redKt, values.redG));
    },
    setPlaying(playing) {
      playButton.textContent = playing ? 'Pause' : 'Play';
    },
    /** The fight has reached its 10-minute stop: say so, and Play has nothing left to do. */
    setStopped(text) {
      stopped.textContent = text ?? '';
      stopped.hidden = !text;
      playButton.disabled = Boolean(text);
    },
    get moreOpen() {
      return !more.collapsed;
    },
    /** { time, phase, result, more } from readouts.js; `more` is null while the panel is closed. */
    renderReadouts({ time, phase, result, more: moreRows }) {
      if (timeText.textContent !== time) timeText.textContent = time;
      if (phaseText.textContent !== phase) phaseText.textContent = phase;
      resultTable.render(result);
      if (moreRows) moreTable.render(moreRows);
    },
  };
}
