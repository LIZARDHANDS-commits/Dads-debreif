// The Turn Fight's screen (SPEC-turn-fight, "The screen", R22): the Fight
// setup column, the stage (toolbar, drawing area) and the Result column. Only
// the essentials show at first; the tuning numbers sit in one closed "Turn
// Fight settings" menu and the extras behind their checkboxes. The side
// columns collapse with a real button (#34, #35). Everything on screen goes in
// as text through h(), never as HTML.
//
import { h } from '../../ui-kit/dom.js';
import { createPanel } from '../../ui-kit/panel.js';
import { createSettingsMenu } from '../../ui-kit/settings-menu.js';
import { createReadoutTable } from './readouts-panel.js';
import { PAINT_OPTIONS } from '../../ui-kit/ct156-model.js';
import { RANGES, ALLOWED, G_LABEL, setupFrom } from './state.js';
import { VIEWS } from './view3d.js';
import { startGeometry, passNote } from './geometry.js';
import { limitWarning } from './t6-limit.js';

// The choices come from state.js, so a saved value and a box can't disagree.
const times = (values) => values.map((v) => [v, `${v}×`]);

let nextId = 1;

/**
 * settings: the remembered values (storage/settings.js); controls: ui-kit controls bound to them.
 * on: { playPause, reset, resetDefaults, moreToggled, cameraView }, called from the buttons;
 * cameraView(name) is one of the 3D view's one-click views ('overhead', 'blue', 'red').
 * on: { playPause, reset, resetDefaults, headOn, moreToggled }, called from the buttons.
 */
export function createLayout({ settings, controls, on }) {
  // ── Fight setup column ──────────────────────────────────────────────
  const intro = h('p', { class: 'tf-intro' }, 'Two aircraft meet head-on, then turn: who gets their nose on the other first?');
  const fightType = controls.choice('circles', { label: 'Fight type', options: [[1, '1-circle'], [2, '2-circle']] });
  const separation = controls.number('separationNm', { label: 'Start separation', ...RANGES.separationNm });

  // One aircraft's boxes: speed and G, with pitch beside them (Climb and dive
  // only), and the T-6 limit warning right under them.
  function aircraft(who, letter, name) {
    // Always on the page, so a screen reader hears the words when they appear; only its text changes.
    const warning = h('p', { class: 'tf-warning', id: `tf-warning-${nextId++}`, 'aria-live': 'polite' });
    // The unit is in the label, to keep the three boxes in one row (the refusal message still names it).
    const speed = controls.number(`${who}Kt`, { label: 'Speed (KTAS)', ...RANGES[`${who}Kt`] });
    const g = controls.number(`${who}G`, { label: G_LABEL, ...RANGES[`${who}G`] });
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

  // The one closed settings menu. Start geometry and Energy sections are made
  // here ahead of Display when those arrive (most-used first).
  const menu = createSettingsMenu({
    title: 'Turn Fight settings',
    onReset: () => on.resetDefaults(),
    resetLabel: 'Reset to V6 defaults',
    // The column scrolls, so a menu opened near its foot is brought into view, Reset button and all.
    onToggle: (collapsed) => !collapsed && menu.element.scrollIntoView?.({ block: 'nearest' }),
  });
  // ── Start geometry (R28): head-on by default, the most-used section ───
  const startSection = menu.section('Start geometry');
  const startPicture = h('canvas', { class: 'tf-start-picture' });
  const hcaText = h('p', { class: 'tf-hca', 'aria-live': 'polite' });
  const passText = h('p', { class: 'tf-hca tf-pass', 'aria-live': 'polite' });
  const headOnButton = h('button', { type: 'button', class: 'button', onclick: () => on.headOn() }, 'Head-on (V6)');
  const sideChoices = [['left', 'Left'], ['right', 'Right']];
  const redAbove = controls.number('redAboveFt', { label: 'Red starts above Blue (ft)', ...RANGES.redAboveFt });
  startSection.append(
    h('p', { class: 'tf-hint' }, 'Where the fight starts. Head-on is V6\'s start. Changing these starts the fight again.'),
    h('div', { class: 'tf-start-row' },
      controls.number('startAtaDeg', { label: 'Red\'s position off Blue\'s nose (ATA)', ...RANGES.startAtaDeg }),
      controls.choice('startAtaSide', { label: 'ATA side', options: sideChoices })),
    h('p', { class: 'tf-hint' }, '0 to 180°, default 0° (dead ahead). SMM 12.2.'),
    h('div', { class: 'tf-start-row' },
      controls.number('startAaDeg', { label: 'Red\'s aspect angle (AA)', ...RANGES.startAaDeg }),
      controls.choice('startAaSide', { label: 'AA side', options: sideChoices })),
    h('p', { class: 'tf-hint' }, '0 to 180°, default 180° (Red points at Blue; 0° is Blue dead astern of Red). Side: which side of Red Blue is on. SMM 12.2.'),
    hcaText,
    passText,
    h('div', { class: 'tf-start-picture-wrap' }, startPicture),
    redAbove,
    h('p', { class: 'tf-hint' }, '-5,000 to +5,000 ft, default 0. It shows with Climb and dive. The start separation is measured level; Range includes height.'),
    controls.choice('turnsAt', { label: 'When the turns start', options: [['pass', 'At the pass'], ['once', 'At once']] }),
    h('p', { class: 'tf-hint' }, 'At the pass (default): each jet flies straight until the range stops closing. At once: the turns start at T+0.'),
    headOnButton,
  );

  const display = menu.section('Display');
  display.append(
    controls.choice('heightScale', { label: 'Side view height scale', options: times(ALLOWED.heightScale) }),
    h('p', { class: 'tf-hint' }, 'Stretches heights in the side view (2D, with Climb and dive).'),
    controls.select('paint', { label: 'Paint', options: PAINT_OPTIONS }),
    h('p', { class: 'tf-hint' }, 'How the aircraft are painted in the 3D view. Ship colours are Blue and Red.'),
  );

  const about = createPanel({ title: 'About this model', collapsed: true });
  about.body.append(
    h('p', {}, h('b', {}, '1-circle: '), 'opposite turn directions after the merge. A radius fight.'),
    h('p', {}, h('b', {}, '2-circle: '), 'same turn direction after the merge. A rate fight.'),
    h('p', {}, h('b', {}, 'First nose: '), 'a yellow dashed line marks the first aircraft to get its nose within 5° of the other.'),
    h('p', {}, 'With Climb and dive on, first nose-on needs the nose truly on the other jet; at a fixed climb or dive it may never come, and the chase then never starts.'),
    h('p', {}, 'The aspect angle (AA) and off-nose angle (ATA) are measured in 3D with Climb and dive on, so with a height difference at T+0 the AA reads less than 180° even when Red points at Blue.'),
    h('p', {}, 'Level, coordinated turns, each aircraft a point.'),
  );

  const setupPanel = createPanel({ title: 'Fight setup', onToggle: (collapsed) => settings.update({ setupOpen: !collapsed }) });
  setupPanel.body.append(
    intro, fightType, separation, blue.element, red.element,
    h('div', { class: 'tf-extras' }, chase, vertical),
    menu.element, about.element,
  );
  const setupCol = h('aside', { class: 'tf-col tf-col-setup', 'aria-label': 'Fight setup' }, setupPanel.element);

  // ── Stage ───────────────────────────────────────────────────────────
  const playButton = h('button', { type: 'button', class: 'button primary tf-play', onclick: () => on.playPause() }, 'Play');
  const resetButton = h('button', { type: 'button', class: 'button', onclick: () => on.reset() }, 'Reset');
  const timeText = h('span', { class: 'tf-pill tf-time' }, 'T+0.0');
  const phaseText = h('span', { class: 'tf-pill tf-phase' }, 'HEAD-TO-HEAD');
  const toolbar = h(
    'div',
    { class: 'tf-toolbar' },
    playButton, resetButton,
    controls.viewSwitch(),
    controls.select('playbackRate', { label: 'Playback speed', options: times(ALLOWED.playbackRate) }),
    timeText, phaseText,
  );
  const stopped = h('p', { class: 'tf-stopped', role: 'status', hidden: true });
  // Why 3D did not start ("3D needs a connection the first time."); always on the page, so it is heard when it appears.
  const note = h('p', { class: 'tf-note', role: 'status' });

  const canvas = h('canvas', { class: 'tf-topdown' });
  const profileCanvas = h('canvas', { class: 'tf-profile-canvas' });
  const profile = h('section', { class: 'tf-profile', 'aria-label': 'Side view', hidden: true }, profileCanvas);
  // The 3D view draws inside `canvas3d` (a box; each start puts a new canvas in it), with its one-click views beside it.
  const canvas3d = h('div', { class: 'tf-3d', hidden: true });
  const cameraBar = h(
    'div',
    { class: 'tf-3d-bar', role: 'group', 'aria-label': 'Camera views', hidden: true },
    Object.entries(VIEWS).map(([id, { label }]) => h('button', { type: 'button', class: 'button tf-3d-view', onclick: () => on.cameraView(id) }, label)),
    h('span', { class: 'tf-3d-hint' }, 'Drag to turn it. Scroll or pinch to zoom. Grid squares are 1 NM.'),
  );
  const views = h('div', { class: 'tf-views' }, h('div', { class: 'tf-topdown-wrap' }, canvas, canvas3d, cameraBar), profile);
  const stage = h(
    'section',
    { class: 'tf-stage', 'aria-label': 'Fight' },
    toolbar,
    stopped,
    note,
    views,
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

  // Which picture is on screen: '2d' or '3d'. The view setting is what the person chose; this is what shows.
  let shown = '2d';
  let sideViewWanted = false;
  const showPictures = () => {
    const in3d = shown === '3d';
    canvas.hidden = in3d;
    canvas3d.hidden = !in3d;
    cameraBar.hidden = !in3d;
    // The 3D scene replaces the whole drawing area, the side view with it.
    profile.hidden = in3d || !sideViewWanted;
    controls.setDisabled('paint', !in3d); // the paint shows only in 3D
    controls.setDisabled('heightScale', in3d || !sideViewWanted); // the height scale is for the 2D side view only
  };

  function showWarning(box, text) {
    if (box.warning.textContent !== (text ?? '')) box.warning.textContent = text ?? '';
  }

  return {
    element,
    canvas,
    canvas3d,
    profileCanvas,
    /** The start picture's canvas (Start geometry, in the settings menu). */
    startPicture,
    /** Shows the side view, and which controls go with each checkbox, from the settings. */
    applyLayout(values) {
      setupPanel.setCollapsed(!values.setupOpen);
      resultPanel.setCollapsed(!values.resultOpen);
      setupCol.classList.toggle('is-collapsed', !values.setupOpen);
      resultCol.classList.toggle('is-collapsed', !values.resultOpen);
      blue.pitchBox.hidden = !values.vertical;
      red.pitchBox.hidden = !values.vertical;
      sideViewWanted = values.vertical;
      showPictures();
      controls.setDisabled('redAboveFt', !values.vertical);
      const hca = `Heading crossing angle (HCA): ${startGeometry(setupFrom(values)).hcaDeg.toFixed(0)}°`;
      if (hcaText.textContent !== hca) hcaText.textContent = hca;
      const pass = passNote(setupFrom(values));
      if (passText.textContent !== pass) passText.textContent = pass;
      showWarning(blue, limitWarning(values.blueKt, values.blueG));
      showWarning(red, limitWarning(values.redKt, values.redG));
    },
    /** Shows the 2D pictures or the 3D scene ('2d' or '3d'). */
    showView(view) {
      shown = view;
      showPictures();
    },
    /** A short note under the toolbar ("3D needs a connection the first time."), or '' for none. */
    setNote(text) {
      note.textContent = text ?? ''; // the element stays on the page, so a screen reader hears the words when they appear
    },
    setPlaying(playing) {
      playButton.textContent = playing ? 'Pause' : 'Play';
    },
    /** The fight has reached its 10-minute stop: say so, and Play has nothing left to do. */
    setStopped(text) {
      stopped.textContent = text ?? '';
      stopped.hidden = !text;
      // A disabled button drops keyboard focus, so Reset takes it first.
      if (text && document.activeElement === playButton) resetButton.focus();
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
