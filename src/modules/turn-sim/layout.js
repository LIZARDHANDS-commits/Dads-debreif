// The Turn Sim's screen (SPEC-turn-sim: The screen, R22): Setup on the left,
// the Stage in the middle (the playback bar above the picture, nothing over
// it) and the Formation card on the right. Only the essentials show at first;
// Aircraft errors, Settings and Profiles are closed panels, and the layers are
// in a menu. The side columns collapse with a real button (#34, #35). All text
// goes in as text (h), never as HTML.
import { h, clear } from '../../ui-kit/dom.js';
import { createPanel } from '../../ui-kit/panel.js';
import { createSettingsMenu } from '../../ui-kit/settings-menu.js';
import { VIEW_DEFAULT, VIEW_ALLOWED } from '../../ui-kit/controls.js';
import { PAINT_DEFAULT, PAINT_OPTIONS } from '../../ui-kit/ct156-model.js';
import {
  buildField, errorFields, FORMATION, SPACING, START_HEADING, MANEUVER, DIRECTION, SPEED, G, TIMING, BASE_DELAY,
  CLOCK_POS, CLOCK_AIRCRAFT, CLOCK_SEQUENCE, CLOCK_TOL, TURN_DEG, DURATION, MOA, BOX_AFT, BOX_STAGGER, BOX4_TIMING, CORRECTION, CORR_STRENGTH,
} from './fields.js';

/**
 * What the screen remembers in this browser (R22): which panels are open and
 * which layers are on, with V6's layer defaults (3/9 line, turn circles and
 * error labels on). "Reset layout" goes back to these. The scenario itself is
 * not here: it belongs to the settings and, later, to profiles.
 */
export const LAYOUT_DEFAULTS = Object.freeze({
  setupColumn: true,
  formationColumn: true,
  errorsOpen: false,
  settingsOpen: false,
  profilesOpen: false,
  moreDetail: false,
  lead39: true,
  turnCircles: true,
  errorLabels: true,
  spacingLines: true, // V6 always drew them; a checkbox in Layers turns them off
  followLead: false,
  clockMarks: false,
  breadcrumbs: false,
  crumbSec: 10,
  distNm: false,
  view: VIEW_DEFAULT, // '2d' or '3d': 2D is the default, and the choice is remembered
  paint: PAINT_DEFAULT, // the 3D aircraft's paint: 'harvard' or 'ship'
});

/** The layout values that only allow some choices (createSettings' `allowed`). */
export const LAYOUT_ALLOWED = Object.freeze({ view: VIEW_ALLOWED, paint: PAINT_OPTIONS.map((o) => o.value) });

/** Layers that only the 2D picture draws; they are greyed out in 3D. */
const LAYERS_2D = ['lead39', 'turnCircles', 'errorLabels', 'spacingLines', 'clockMarks', 'breadcrumbs', 'crumbSec', 'distNm'];

export const SPEEDS = Object.freeze([0.25, 0.5, 1, 2, 4]);

/** Ship colours as in V6, except #4: white with a dark outline (#29), as in the debrief. */
export const SHIP_COLORS = Object.freeze({ 1: '#0066ff', 2: '#00cc44', 3: '#ff2222', 4: '#ffffff' });
export const OUTLINED_SHIPS = Object.freeze(new Set([4]));

function swatch(id) {
  const el = h('span', { class: `ship-swatch${OUTLINED_SHIPS.has(id) ? ' is-outlined' : ''}`, 'aria-hidden': 'true' });
  el.style.setProperty('--ship', SHIP_COLORS[id]); // through the CSSOM, which a style-src policy allows
  return el;
}

/**
 * scenario / controls: the Turn Sim settings and their ui-kit controls.
 * layout / layoutControls: the remembered layout and its controls.
 * rules / defaults: SETTINGS_RULES and DEFAULTS from settings.js.
 * listen: app.listen, so page-wide listeners end when the Turn Sim closes.
 * say(text): a short spoken-and-shown confirmation (app.status), for buttons whose result isn't on the screen.
 */
export function createLayout({ scenario, controls, layout, layoutControls, rules, defaults, listen, say = () => {} }) {
  const handlers = {};
  const build = (def, as) => buildField({ controls, rules, defaults, def, as });
  const wrap = (built, extra = '') =>
    built && h('div', { class: `ts-field${extra}` }, built.control, built.hint ? h('p', { class: 'ts-hint' }, built.hint) : null);
  const resetButton = (keys, label = 'Reset to defaults') =>
    h('button', {
      type: 'button',
      class: 'button ts-reset',
      onclick: () => {
        scenario.update(Object.fromEntries(keys.filter((k) => Object.hasOwn(defaults, k)).map((k) => [k, defaults[k]])));
        say('These settings are back at their defaults.');
      },
    }, label);

  // ---- Setup: the essentials --------------------------------------------
  const used = []; // setting names this panel edits, for its "Reset to defaults"
  const field = (def, as) => {
    const built = build(def, as);
    if (built) used.push(built.key);
    return { built, element: wrap(built) };
  };
  const formation = field(FORMATION);
  const spacing = field(SPACING);
  const heading = field(START_HEADING);
  const maneuver = field(MANEUVER);
  const direction = field(DIRECTION, 'choice');
  const legHeading = h('p', { class: 'ts-hint ts-leg-heading', hidden: true });
  const speed = field(SPEED);
  const g = field(G);
  const gWarning = h('p', { class: 'ts-warning', role: 'status', hidden: true });
  const timing = field(TIMING);
  const baseDelay = field(BASE_DELAY);
  const clockPos = field(CLOCK_POS);
  // The auto step is worked out by the engine and shown here; it is never written over Base delay.
  const autoNote = h('p', { class: 'ts-hint ts-auto' }, 'Auto timing works out each aircraft\'s delay itself.');

  const setupEssentials = [formation, spacing, heading, { element: legHeading }, maneuver, direction, speed, g].map((f) => f.element);

  // ---- Aircraft errors (closed) -------------------------------------------
  const errorKeys = [];
  const positionGroups = new Map(); // wingman id -> { key, element }: the position boxes, shown when it's turned on
  const clockGroups = []; // each wingman's own clock cue boxes: shown when Timing is the clock cue
  const errorSections = [2, 3, 4].map((id) => {
    const f = errorFields(id);
    const built = Object.fromEntries(Object.entries(f).map(([name, def]) => [name, build(def)]));
    const clockBoxes = h('div', { class: 'ts-clock' }, wrap(built.clockTarget), wrap(built.clockPos));
    errorKeys.push(...Object.values(built).filter(Boolean).map((x) => x.key));
    const positionBoxes = h(
      'div',
      { class: 'ts-position' },
      wrap(built.lateralDir), wrap(built.lateralFt), wrap(built.foreAftDir), wrap(built.foreAftFt),
    );
    if (built.positionOn) positionGroups.set(id, { key: built.positionOn.key, element: positionBoxes });
    clockGroups.push(clockBoxes);
    return h(
      'section',
      { class: 'ts-group', 'aria-label': `Errors for #${id}`, dataset: { aircraft: String(id) } },
      h('h3', { class: 'ts-group-title' }, swatch(id), `#${id}`),
      wrap(built.delay), wrap(built.g), wrap(built.positionOn), positionBoxes, clockBoxes,
    );
  });
  const errorsPanel = createPanel({ title: 'Aircraft errors', collapsed: !layout.get().errorsOpen, onToggle: (c) => layout.update({ errorsOpen: !c }) });
  errorsPanel.element.classList.add('ts-subpanel');
  errorsPanel.body.append(
    h('p', { class: 'ts-hint' }, 'Give a wingman a mistake and see what it does to the turn. All zero means no mistakes.'),
    ...errorSections,
    resetButton(errorKeys),
  );

  // ---- Turn Sim settings: every tuning number, in the ui-kit's one closed menu (R22) ----
  const tuningKeys = [TURN_DEG, DURATION, MOA, BOX_AFT, BOX_STAGGER, BOX4_TIMING, CORRECTION, CORR_STRENGTH].map((def) => def.key).filter((k) => rules[k]);
  const settingsMenu = createSettingsMenu({
    title: 'Turn Sim settings',
    collapsed: !layout.get().settingsOpen,
    onToggle: (c) => layout.update({ settingsOpen: !c }),
    onReset: () => {
      scenario.update(Object.fromEntries(tuningKeys.map((k) => [k, defaults[k]])));
      say('These settings are back at their defaults.');
    },
  });
  // The clock cue's tolerance, the rear element check, the solver, the cross turn's stages and #2's side join
  // these sections as the engine flies them (todo tasks 8 to 12): no box here is a dead one.
  const groups = {};
  function section(id, title, defs, hint) {
    const fieldset = settingsMenu.section(title);
    if (hint) fieldset.append(h('p', { class: 'ts-hint' }, hint));
    for (const def of defs) fieldset.append(...[wrap(build(def))].filter(Boolean));
    groups[id] = fieldset;
  }
  section('turn', 'Turn and run', [TURN_DEG, DURATION, MOA]);
  section('offset', 'Offset box', [BOX_AFT, BOX_STAGGER, BOX4_TIMING], 'Used when Formation is the offset box.');
  section('clock', 'Clock cue', [CLOCK_AIRCRAFT, CLOCK_SEQUENCE, CLOCK_TOL], 'Used when Timing is the clock position cue.');
  section('correction', 'Correction model', [CORRECTION, CORR_STRENGTH]);
  // The 3D view's paint lives with the other choices, in the same closed menu (a display choice, not a scenario one).
  settingsMenu.section('3D view').append(layoutControls.select('paint', { label: 'Paint', options: PAINT_OPTIONS }));

  // ---- Profiles (a placeholder until the profiles task) -------------------
  const profilesPanel = createPanel({ title: 'Profiles', collapsed: !layout.get().profilesOpen, onToggle: (c) => layout.update({ profilesOpen: !c }) });
  profilesPanel.element.classList.add('ts-subpanel');
  profilesPanel.body.append(h('p', { class: 'ts-hint' }, 'Saved setups and a startup default will go here. For now the Turn Sim opens with its defaults.'));

  settingsMenu.element.classList.add('ts-subpanel');
  const setupPanel = createPanel({ title: 'Setup', onToggle: (c) => layout.update({ setupColumn: !c }) });
  setupPanel.body.append(
    ...[
      ...setupEssentials,
      gWarning,
      timing.element,
      baseDelay.element,
      clockPos.element,
      autoNote,
      resetButton(used),
      errorsPanel.element,
      settingsMenu.element,
      profilesPanel.element,
    ].filter(Boolean), // a field whose setting isn't in settings.js is left out, not shown as "null"
  );

  // ---- Stage: the playback bar, Fit and Layers above the picture ---------
  const playGlyph = h('span', { 'aria-hidden': 'true' }, '▶');
  const playLabel = h('span', {}, 'Play');
  const playButton = h('button', { type: 'button', class: 'button primary ts-play', onclick: () => handlers.playPause?.() }, playGlyph, playLabel);
  const stepButton = h('button', { type: 'button', class: 'button', title: 'One 0.05 s step (right arrow)', onclick: () => handlers.step?.() }, 'Step');
  const resetRunButton = h('button', { type: 'button', class: 'button', title: 'Back to the start (Home)', onclick: () => handlers.resetRun?.() }, 'Reset');
  const speedSelect = h(
    'select',
    { 'aria-label': 'Playback speed', onchange: () => handlers.speed?.(Number(speedSelect.value)) },
    SPEEDS.map((x) => h('option', { value: String(x), selected: x === 1 }, `${x}×`)),
  );
  const time = h('output', { class: 'ts-time', 'aria-label': 'Simulation time' }, 't = 0.0 s');
  const fitButton = h('button', { type: 'button', class: 'button', onclick: () => handlers.fit?.() }, 'Fit');

  // A menu: a real button that opens a small panel, closed again by Escape or a click elsewhere.
  function menu(label, id, children) {
    const button = h('button', { type: 'button', class: 'button menu-button', 'aria-expanded': 'false', 'aria-controls': id }, label);
    const body = h('div', { class: 'ts-menu-body', id, hidden: true }, ...children);
    const element = h('div', { class: 'ts-menu' }, button, body);
    const setOpen = (open) => {
      body.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      // It ends above the picture's bottom edge, so it never runs off the screen; a longer menu scrolls.
      if (open) body.style.maxHeight = `${Math.max(160, canvasWrap.getBoundingClientRect().bottom - body.getBoundingClientRect().top - 8)}px`;
    };
    button.addEventListener('click', () => setOpen(body.hidden));
    element.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || body.hidden) return;
      e.preventDefault();
      setOpen(false);
      button.focus();
    });
    listen(document, 'pointerdown', (e) => {
      if (!element.contains(e.target)) setOpen(false);
    });
    return { element, setOpen };
  }
  const lc = layoutControls;
  const layersMenu = menu('Layers', 'ts-layers', [
    lc.checkbox('lead39', { label: 'Lead 3/9 line' }),
    lc.checkbox('turnCircles', { label: 'Turn circles' }),
    lc.checkbox('errorLabels', { label: 'Error labels' }),
    lc.checkbox('spacingLines', { label: 'Spacing lines' }),
    lc.checkbox('followLead', { label: 'Follow Lead' }),
    lc.checkbox('clockMarks', { label: 'Clock marks' }),
    lc.checkbox('breadcrumbs', { label: 'Breadcrumbs' }),
    lc.number('crumbSec', { label: 'Breadcrumb every', unit: 's', min: 1, max: 60, step: 1 }),
    lc.checkbox('distNm', { label: 'Distances in NM' }),
    h('button', { type: 'button', class: 'button', onclick: () => handlers.resetLayout?.() }, 'Reset layout'),
  ]);

  const canvas = h('canvas', { class: 'ts-canvas' });
  const canvas3d = h('canvas', { class: 'ts-canvas ts-canvas3d', hidden: true }); // the 3D view's own canvas: a WebGL context can't share the 2D one
  const canvasWrap = h('div', { class: 'ts-canvas-wrap' }, canvas, canvas3d);
  const note3d = h('span', { class: 'ts-note', role: 'status', hidden: true });
  const bar = h(
    'div',
    { class: 'ts-bar', role: 'group', 'aria-label': 'Playback' },
    playButton, stepButton, resetRunButton, speedSelect, time,
    h('span', { class: 'ts-bar-gap' }),
    lc.viewSwitch(), note3d, fitButton, layersMenu.element,
  );
  const stage = h('section', { class: 'ts-stage', 'aria-label': 'Formation from above and playback' }, bar, canvasWrap);

  // ---- Formation card -----------------------------------------------------
  const card = h('ul', { class: 'ts-card', 'aria-label': 'Formation' });
  const minSep = h('p', { class: 'ts-line' });
  const turnLine = h('p', { class: 'ts-line ts-turn' });
  const flags = h('ul', { class: 'ts-flags', 'aria-live': 'polite' });
  const cueList = h('ul', { class: 'ts-card ts-cues', 'aria-label': 'Clock cue status' });
  const cueWarning = h('p', { class: 'ts-warning', role: 'status', hidden: true });
  const detail = createPanel({ title: 'More detail', collapsed: !layout.get().moreDetail, onToggle: (c) => layout.update({ moreDetail: !c }) });
  detail.element.classList.add('ts-subpanel', 'ts-detail');
  const formationPanel = createPanel({ title: 'Formation', onToggle: (c) => layout.update({ formationColumn: !c }) });
  formationPanel.body.append(card, minSep, turnLine, flags, cueWarning, cueList, detail.element);

  const setupCol = h('aside', { class: 'ts-col ts-col-setup', 'aria-label': 'Setup' }, setupPanel.element);
  const formationCol = h('aside', { class: 'ts-col ts-col-formation', 'aria-label': 'Formation' }, formationPanel.element);
  const element = h(
    'div',
    { class: 'turn-sim' },
    h('h1', { class: 'visually-hidden' }, 'Formation Turn Sim'),
    setupCol,
    stage,
    formationCol,
  );

  // Only the fields that apply are shown (#32): the offset box's only with the offset box, and so on.
  function applyScenario(values) {
    if (baseDelay.element) baseDelay.element.hidden = values.timing !== 'time';
    clockPos.element.hidden = values.timing !== 'clock';
    autoNote.hidden = values.timing !== 'auto';
    groups.clock.hidden = values.timing !== 'clock';
    for (const boxes of clockGroups) boxes.hidden = values.timing !== 'clock';
    groups.offset.hidden = values.formation !== 'offsetBox';
    if (rules.correctionStrength) controls.setDisabled('correctionStrength', values.correction === 'none');
    // A two-ship has no #3 or #4 to give errors to, and position boxes show when the position error is on.
    for (const section of errorsPanel.body.querySelectorAll('[data-aircraft]')) {
      section.hidden = values.formation === 'twoShip' && Number(section.dataset.aircraft) > 2;
    }
    for (const { key, element } of positionGroups.values()) element.hidden = values[key] !== true;
  }

  function applyLayout(values) {
    setupPanel.setCollapsed(!values.setupColumn);
    formationPanel.setCollapsed(!values.formationColumn);
    errorsPanel.setCollapsed(!values.errorsOpen);
    settingsMenu.setCollapsed(!values.settingsOpen);
    profilesPanel.setCollapsed(!values.profilesOpen);
    detail.setCollapsed(!values.moreDetail);
    setupCol.classList.toggle('is-collapsed', !values.setupColumn);
    formationCol.classList.toggle('is-collapsed', !values.formationColumn);
  }

  const line = (id, { text, tone }) =>
    h('li', { class: `tone-${tone}` }, swatch(id), h('strong', {}, `#${id}`), ' ', h('span', {}, text));

  applyScenario(scenario.get());
  applyLayout(layout.get());

  return {
    element,
    canvas,
    canvas3d,
    /** Which picture shows: '2d' or '3d'. The view setting is what the person chose; this is what is on screen. */
    showView(view) {
      canvas.hidden = view === '3d';
      canvas3d.hidden = view !== '3d';
      for (const key of LAYERS_2D) lc.setDisabled(key, view === '3d');
    },
    /** A short note beside the View switch ("3D needs a connection the first time."), or '' for none. */
    setNote(text) {
      note3d.textContent = text ?? '';
      note3d.hidden = !text;
    },
    applyScenario,
    applyLayout,
    /** The Play button shows what pressing it will do. */
    setPlaying(playing) {
      playGlyph.textContent = playing ? '❚❚' : '▶';
      playLabel.textContent = playing ? 'Pause' : 'Play';
    },
    setTime(sec) {
      const text = `t = ${sec.toFixed(1)} s`;
      if (time.textContent !== text) time.textContent = text;
      time.dataset.sec = String(Math.round(sec * 1000) / 1000); // the exact time, for tests and anything reading it
    },
    /** After a new leg starts, the compass heading it began on, read-only (never written back into Start heading); null hides it. */
    setLegHeading(deg) {
      legHeading.textContent = deg == null ? '' : `This leg started on ${String(Math.round(deg) % 360).padStart(3, '0')}°.`;
      legHeading.hidden = deg == null;
    },
    setSpeed(x) {
      speedSelect.value = String(x);
    },
    /** The stall-limit G warning beside the G box (TODO(D128) in index.js), or null. */
    setGWarning(text) {
      gWarning.textContent = text ?? '';
      gWarning.hidden = !text;
    },
    /** The Formation column for one readoutsAt() result. */
    renderReadouts(r) {
      clear(card);
      for (const row of r.rows) card.append(line(row.id, row.line));
      minSep.textContent = r.minSepText ?? '';
      minSep.hidden = !r.minSepText;
      turnLine.textContent = r.turnText;
      clear(flags);
      for (const text of r.flags) flags.append(h('li', {}, text));
      flags.hidden = r.flags.length === 0;
      clear(cueList);
      for (const { id, text } of r.cue.lines) cueList.append(line(id, { text, tone: 'none' }));
      cueList.hidden = r.cue.lines.length === 0;
      cueWarning.textContent = r.cue.warning ?? '';
      cueWarning.hidden = !r.cue.warning;
      autoNote.textContent = r.autoStepSec == null ? 'Auto timing works out each aircraft\'s delay itself.' : `Auto step ${r.autoStepSec.toFixed(1)} s`;

      clear(detail.body);
      detail.body.append(
        h('h3', {}, 'Spacing'),
        h('ul', { class: 'ts-lines' }, r.pairTexts.map((t) => h('li', {}, t))),
        h('h3', {}, 'Each wingman'),
        h('ul', { class: 'ts-lines' }, r.wingmen.map((t) => h('li', {}, t))),
        h('h3', {}, 'Summary'),
        h('table', { class: 'ts-summary' }, h('tbody', {}, r.summary.map(([k, v]) => h('tr', {}, h('th', { scope: 'row' }, k), h('td', {}, v))))),
        h('h3', {}, 'Standards'),
        h('ul', { class: 'ts-lines' }, r.standardsLines.map((t) => h('li', {}, t))),
        h('p', { class: 'ts-hint' }, r.standardsAreDefault ? 'Default standards. Change them in the Debrief.' : 'Edited standards, as set in the Debrief.'),
      );
    },
    onPlayPause: (fn) => (handlers.playPause = fn),
    onStep: (fn) => (handlers.step = fn),
    onResetRun: (fn) => (handlers.resetRun = fn),
    onSpeed: (fn) => (handlers.speed = fn),
    onFit: (fn) => (handlers.fit = fn),
    onResetLayout: (fn) => (handlers.resetLayout = fn),
  };
}
