// The Turn Sim's screen, first version (docs/modules/turn-sim/spec.md, "The
// screen"): the manoeuvre buttons and a two-box Setup on the left, the playback
// bar above the picture in the middle, and the Formation card on the right.
// Only the essentials show; the layers are in a menu. All text goes in as text
// (h), never as HTML.
import { h, clear } from '../../ui-kit/dom.js';
import { createPanel } from '../../ui-kit/panel.js';
import { TAG_DEFAULTS } from './tags.js';
import { VIEW_ALLOWED } from '../../ui-kit/controls.js';
import { PAINT_OPTIONS } from '../../ui-kit/ct156-model.js';
import { ERROR_FIELDS, FIX_WHEN_OPTIONS, FIX_TOOLS } from './live/errors.js';
import { FW_LIMITS } from './live/slots.js';

/**
 * What the screen remembers in this browser: which columns are open, which
 * layers are on, 2D or 3D, and the 3D paint. Saved choices from an older screen
 * (another version) are not read; the defaults are used instead.
 */
export const LAYOUT_DEFAULTS = Object.freeze({
  setupColumn: true,
  formationColumn: true,
  tracks: true, // each aircraft's ground track, for the whole flight
  lead39: true, // the 3/9 line, Lead only at the start (Patrick, 5 Oct); l39_<id> picks the aircraft
  lead75: true, // the 7 and 5 o'clock lines, Lead only at the start (Patrick, 5 Oct): the back edge of the fighting wing cone, 60° of sweep (SMM 12.29 para 69)
  cone: false, // The Cone switch: the fighting wing cone, shaded (Patrick, 5 Oct)
  coneShape: 'flat', // in 3D: 'flat', the 2D band at the aircraft's height (the default, Patrick 5 Oct), or '3d', the true cone round the tail
  // Which aircraft draw each (Patrick, 5 Oct): Lead at first.
  l39_1: true, l39_2: false, l39_3: false, l39_4: false,
  l75_1: true, l75_2: false, l75_3: false, l75_4: false,
  cone_1: true, cone_2: false, cone_3: false, cone_4: false,
  planned: true, // the paths still to fly, dashed
  turnCircles: false,
  tags: true, // the data tags beside each aircraft (spec section 10.4); what they show is the Data tag menu (Patrick, 5 Oct)
  ...TAG_DEFAULTS,
  trackSec: 0, // Settings › Track length: how long the tracks stay, in seconds; 0 is the whole flight (Patrick, 5 Oct)
  autoFit: true, // Auto zoom: the camera keeps every aircraft in the picture (spec section 10.3); a drag pauses it, Fit brings it back
  realSize: false, // Real aircraft size (Patrick, 5 Oct): ticked, each aircraft is drawn at a T-6's real length in 2D and 3D
  planeScale: 1, // unticked: the scale on the usual easy-to-see size (×0.5 to ×4)
  camOn: 'formation', // what the camera centres on: the formation's centre of mass, or one aircraft ('1' to '4') (Patrick, 5 Oct)
  camLook: 'chase', // on one aircraft, in 3D (Patrick, 5 Oct): 'chase' behind its nose, 'free' centred on it and turned by hand, 'padlock' looking at the other
  cockpitInterior: true, // 3D Cockpit and Padlock: the CT-156's front cockpit round the eye (Dad's ask, 9 Oct; TS-154); off, the own aircraft is hidden as before
  cockpitSeat: 'front', // which CT-156 seat the 3D Cockpit and Padlock sit in: 'front' or 'rear' (Dad's ask, 9 Oct; TS-155)
  // Each seat's eye moved from its estimated point, feet up and forward (Dad, 9 Oct: "make the eye view adjustable for
  // front and rear"; TS-155); 0 is the estimate.
  eyeUpFront: 0, eyeFwdFront: 0, eyeUpRear: 0, eyeFwdRear: 0,
  view: '3d', // '2d' or '3d'; 3D at the start, looking straight down on the formation (Patrick, 5 Oct)
  paint: 'ship', // the 3D aircraft's paint: each in its ship colour, which stands out on the charcoal (Patrick, 5 Oct); 'harvard' is navy
});
export const LAYOUT_VERSION = 8; // 1 was the plan-mode screen's; 3 turned the 3/9 line off (TS-56); 4 the Lead-only lines; 5 3D on the formation at the start (Patrick, 5 Oct)

/** A saved version 2 layout keeps every choice but the 3/9 line, which takes the new default (off). Older ones start fresh. */
export function migrateLayout(values, version) {
  // Version 4 (Patrick, 5 Oct): the start shows Lead's 3/9 and 7/5 lines, no cone, and every per-aircraft list Lead only.
  const SHIP_KEYS = /^(l39|l75|cone)_\d$/;
  // Version 5 (Patrick, 5 Oct): 3D, top down, the camera on the formation.
  // Version 6 (Patrick, 5 Oct): ship colours on the 3D aircraft, for contrast on the charcoal.
  // Version 7 (Patrick, 5 Oct): Auto zoom on at the start. Version 8: the cone as the 2D projection at the start.
  if (![2, 3, 4, 5, 6, 7].includes(version)) return {};
  const later = { 7: [], 6: ['autoFit'], 5: ['paint', 'autoFit'], 4: ['view', 'camOn', 'paint', 'autoFit'] };
  const reset = [...(later[version] ?? ['lead39', 'lead75', 'cone', 'view', 'camOn', 'paint', 'autoFit']), 'coneShape'];
  return Object.fromEntries(Object.entries(values).filter(([k]) => !reset.includes(k) && (version >= 4 || !SHIP_KEYS.test(k))));
}

/**
 * The eye offsets' limits per seat, feet, in 0.05 ft steps (TS-155; estimates): the rear eye starts 0.15 ft higher and
 * nearer the glass, so it rises at most 0.3 ft; half a foot back keeps either eye ahead of its headbox.
 */
export const EYE_OFFSET_FT = Object.freeze({ step: 0.05, front: { up: [-0.5, 0.5], fwd: [-0.5, 0.5] }, rear: { up: [-0.5, 0.3], fwd: [-0.5, 0.5] } });
const steps = ([lo, hi]) => Array.from({ length: Math.round((hi - lo) / EYE_OFFSET_FT.step) + 1 }, (_, i) => Math.round((lo + i * EYE_OFFSET_FT.step) * 100) / 100);

/** The layout values that only allow some choices (createSettings' `allowed`). */
export const LAYOUT_ALLOWED = /** @type {Record<string, any[]>} */ (Object.freeze({
  view: [...VIEW_ALLOWED],
  paint: PAINT_OPTIONS.map((o) => o.value),
  camOn: ['formation', '1', '2', '3', '4', 'free'],
  trackSec: [0, 30, 60, 120, 300, 600],
  coneShape: ['3d', 'flat'],
  camLook: ['chase', 'cockpit', 'padlock', 'free'],
  cockpitSeat: ['front', 'rear'],
  eyeUpFront: steps(EYE_OFFSET_FT.front.up),
  eyeFwdFront: steps(EYE_OFFSET_FT.front.fwd),
  eyeUpRear: steps(EYE_OFFSET_FT.rear.up),
  eyeFwdRear: steps(EYE_OFFSET_FT.rear.fwd),
}));

/** Layers that only the 2D picture draws; they are greyed out in 3D. */
const LAYERS_2D = []; // every layer draws in 3D as well as 2D (Patrick, 5 Oct)

export const SPEEDS = Object.freeze([0.25, 0.5, 1, 2, 4]);

/** The line above the buttons, for the pair and for the four. */
const PAIR_MOVES_NOTE = 'These manoeuvres fly in line abreast. Change to line abreast first.';

/** Ship colours as in V6, except #4: white with a dark outline (#29), as in the debrief. */
// Lead's blue lifted from V6's #0066ff to #3d8bff so it stands out on the charcoal like the others (Patrick, 5 Oct).
export const SHIP_COLORS = Object.freeze({ 1: '#3d8bff', 2: '#00cc44', 3: '#ff2222', 4: '#ffffff' });
export const OUTLINED_SHIPS = Object.freeze(new Set([4]));

function swatch(id) {
  const el = h('span', { class: `ship-swatch${OUTLINED_SHIPS.has(id) ? ' is-outlined' : ''}`, 'aria-hidden': 'true' });
  el.style.setProperty('--ship', SHIP_COLORS[id]); // through the CSSOM, which a style-src policy allows
  return el;
}

/**
 * buttons: [{ key, label, sided, ships }] in screen order; `ships` lists the formations that have the button (2, 4).
 * setupControls: ui-kit controls bound to the Setup settings (ships, spacingFt, wingSide).
 * layout / layoutControls: the remembered layout and its controls.
 * listen: app.listen, so page-wide listeners end when the Turn Sim closes.
 * fixedLine: the one line of fixed numbers under Setup.
 * changeUi: the "Change formation" group and its card lines (transitions-panel.js), or null.
 */
export function createLayout({ buttons, setupControls, layout, layoutControls, listen, fixedLine, changeUi = null }) {
  const handlers = {};

  // ---- Manoeuvres: one row per manoeuvre, a Left and a Right button where it has sides ----
  const sideHints = []; // { el, dir }: the "into #2" / "away from #2" words, which follow #2's side
  const rowShips = []; // { el, ships }: which formations show each row (2-ship, 4-ship)
  const rows = buttons.map((b) => {
    const row = buttonRow(b);
    rowShips.push({ el: row, ships: b.ships ?? [2], key: b.key });
    return row;
  });
  function buttonRow(b) {
    if (!b.sided) {
      return h('div', { class: 'ts-move ts-move-single' },
        h('button', { type: 'button', class: 'button ts-move-button', dataset: { move: b.key }, onclick: () => handlers.press?.(b.key, 0) }, b.label));
    }
    const side = (dir, word) => {
      const hint = h('span', { class: 'ts-move-hint' });
      sideHints.push({ el: hint, dir });
      return h('button', {
        type: 'button',
        class: 'button ts-move-button',
        dataset: { move: b.key, dir: word.toLowerCase() },
        onclick: () => handlers.press?.(b.key, dir),
      }, h('span', { class: 'visually-hidden' }, `${b.label} `), h('span', { 'aria-hidden': 'true' }, word[0]), h('span', { class: 'visually-hidden' }, word), hint); // shows L or R; read out as "Delayed 90 Left into #2"
    };
    return h('div', { class: 'ts-move', role: 'group', 'aria-label': b.label },
      h('span', { class: 'ts-move-name' }, b.label), side(1, 'Left'), side(-1, 'Right'));
  }
  // The left column (Patrick, 5 Oct): Controls (open), then Scenario and Settings, each a box that starts closed.
  const movesPanel = createPanel({ title: 'Controls' });
  movesPanel.element.classList.add('ts-controls'); // its text 1 px bigger (Patrick, 5 Oct)
  const queueLine = h('p', { class: 'ts-hint ts-queue', role: 'status' });
  const movesHint = h('div', { class: 'ts-section-bar' }, h('h3', {}, 'Manoeuvres')); // the MANOEUVRES bar (Patrick, 5 Oct)
  const movesNote = h('p', { class: 'ts-hint ts-warning', role: 'status', hidden: true }, PAIR_MOVES_NOTE);
  // Only the manoeuvres the formation the aircraft are in can fly are shown, nothing greyed (Patrick, 5 Oct: "I ONLY
  // WANT the options/manoeuvres available FOR THE ACTIVE FORMATION to be visible"). They switch once a change is flown.
  let shipsNow = 2;
  let moveShown = (_key) => true;
  function showMoves() {
    let any = false;
    for (const { el, ships: has, key } of rowShips) {
      el.hidden = !has.includes(shipsNow) || !moveShown(key);
      any ||= !el.hidden;
    }
    for (const b of element.querySelectorAll('.ts-move-button')) b.disabled = false;
    movesHint.hidden = !any;
  }
  movesPanel.body.append(
    ...(changeUi ? [changeUi.element] : []),
    movesHint,
    movesNote,
    ...rows,
    queueLine,
  );

  // ---- Setup: spacing and #2's side ---------------------------------------
  const spacingFlag = h('p', { class: 'ts-warning', role: 'status', hidden: true });
  const fourLine = h('p', { class: 'ts-fixed', hidden: true });
  // The 4-ship delayed 45 with or without its check turn (Patrick, 4 Oct 11:28Z); shown only in the 4-ship.
  const check45Field = h('div', { class: 'ts-check', hidden: true }, setupControls.checkbox('check45', { label: 'Delayed 45 with the check turn (SMM Fig 16.34)' }));
  // Fighting wing desired spacing and sweep (TS-58, Patrick 21:25Z), behind More. Sweep is back from the wing line of the
  // aircraft flown off (SMM 12.29 para 69, Fig 12.19); outside the SMM band it is flown and flagged.
  const fwRange = { unit: 'ft', min: FW_LIMITS.rangeFt[0], max: FW_LIMITS.rangeFt[1], step: 50 };
  const fwSweep = { unit: '°', min: FW_LIMITS.sweepDeg[0], max: FW_LIMITS.sweepDeg[1], step: 1 };
  const fwTwo = h('div', { class: 'ts-fw-shape' },
    h('div', { class: 'ts-field' }, setupControls.number('fwRangeFt', { label: '#2 spacing off Lead', ...fwRange })),
    h('div', { class: 'ts-field' }, setupControls.number('fwSweepDeg', { label: '#2 sweep', ...fwSweep })),
  );
  const fwFour = h('div', { class: 'ts-fw-shape', hidden: true },
    h('div', { class: 'ts-field' }, setupControls.number('fw4RangeFt', { label: '#2 spacing off Lead', ...fwRange })),
    h('div', { class: 'ts-field' }, setupControls.number('fw4SweepDeg', { label: '#2 sweep', ...fwSweep })),
    h('div', { class: 'ts-field' }, setupControls.number('fw4OtherRangeFt', { label: '#3 and #4 spacing', ...fwRange })),
    h('div', { class: 'ts-field' }, setupControls.number('fw4OtherDeg', { label: '#3 and #4 sweep', ...fwSweep })),
  );
  const fwFlag = h('p', { class: 'ts-warning', role: 'status', hidden: true });
  const fwMore = h('section', { class: 'ts-fw-more' },
    h('h3', { class: 'ts-group-title' }, 'Fighting wing spacing and sweep'),
    h('p', { class: 'ts-hint' }, 'Where each wingman settles in fighting wing. Sweep is measured back from the wing line of the aircraft he flies off. The SMM band is 500-1,000 ft and 30-60° (SMM 12.29 para 69).'),
    fwTwo,
    fwFour,
    fwFlag,
  );
  const setup = h('section', { class: 'ts-setup', 'aria-label': 'Scenario' },
    h('div', { class: 'ts-field' }, setupControls.choice('ships', { label: 'Formation', options: [{ value: 2, label: '2-ship' }, { value: 4, label: '4-ship' }] })),
    h('div', { class: 'ts-field' }, setupControls.number('spacingFt', { label: 'Spacing', unit: 'ft', min: 1000, max: 20000, step: 100 })),
    spacingFlag,
    h('div', { class: 'ts-field' }, setupControls.choice('wingSide', { label: '#2 on Lead\'s', options: [{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }] })),
    h('p', { class: 'ts-hint' }, 'Changing these starts again from the beginning.'),
  );
  // Settings: how things are flown, and the fixed numbers.
  const settingsBody = h('section', { class: 'ts-settings', 'aria-label': 'Settings' },
    h('div', { class: 'ts-field' }, layoutControls.select('trackSec', { label: 'Track length', options: [
      { value: 0, label: 'Whole flight' }, { value: 30, label: '30 s' }, { value: 60, label: '1 min' }, { value: 120, label: '2 min' },
      { value: 300, label: '5 min' }, { value: 600, label: '10 min' },
    ] })),
    ...(changeUi?.rejoinSettings ? [changeUi.rejoinSettings] : []),
    fwMore,
    ...(changeUi?.fluidSettings ? [changeUi.fluidSettings] : []),
    h('p', { class: 'ts-fixed' }, fixedLine),
    fourLine,
  );
  // Controls also hold the 4-ship Delayed 45 check-turn tick, beside the buttons it changes (Patrick, 5 Oct).
  movesPanel.body.append(check45Field);
  const scenarioPanel = createPanel({ title: 'Scenario', collapsed: true });
  scenarioPanel.body.append(setup);
  const settingsPanel = createPanel({ title: 'Settings', collapsed: true });
  settingsPanel.body.append(settingsBody);

  // ---- Errors (training): closed, and every error starts at None (TS-52) ----
  // The Fix tools #2 may use (Patrick, 4 Oct 11:42Z), all ticked; shown only when the response is Fix it.
  const fixTools = h('fieldset', { class: 'ts-fix-tools' },
    h('legend', {}, 'Fix tools'),
    ...FIX_TOOLS.map((t) => h('div', { class: 'ts-check' }, setupControls.checkbox(t.key, { label: `${t.label}: ${t.hint}` }))),
  );
  const fixWhen = h('div', { class: 'ts-field ts-fix-when' }, setupControls.select('errFixWhen', { label: 'Fix it', options: FIX_WHEN_OPTIONS }));
  const errorsSection = h('details', { class: 'ts-errors' },
    h('summary', {}, 'Errors (training)'),
    h('p', { class: 'ts-hint' }, 'Start #2 out of position or rolling in off time, then see him carry the error or fix it. Reset puts it back.'),
    ...ERROR_FIELDS.map((f) => h('div', { class: 'ts-field ts-error-row' },
      setupControls.select(f.key, { label: f.label, options: f.options }),
      setupControls.number(f.amountKey, { label: 'Amount', unit: f.unit, min: f.min, max: f.max, step: f.step }))),
    h('div', { class: 'ts-check' }, setupControls.checkbox('errSmart', { label: 'Smart wingman: #2 fixes the error' })),
    fixWhen,
    fixTools,
    h('div', { class: 'ts-field' }, setupControls.checkbox('errRandom', { label: 'One random error at every Reset (replaces the choices above)' })),
    h('p', { class: 'ts-hint' }, 'Smart wingman on: #2 fixes the error now, or in the next manoeuvre with the ticked Fix tools, smallest change first. Off: he turns at the normal references and the error shows at the end.'),
  );
  setup.append(errorsSection); // the training errors are part of the scenario

  // ---- Stage: the playback bar and Layers above the picture -----------------
  const playGlyph = h('span', { 'aria-hidden': 'true' }, '▶');
  const playLabel = h('span', {}, 'Play');
  const playButton = h('button', { type: 'button', class: 'button primary ts-play', onclick: () => handlers.playPause?.() }, playGlyph, playLabel);
  const resetRunButton = h('button', { type: 'button', class: 'button', title: 'Back to the start (Home)', onclick: () => handlers.resetRun?.() }, 'Reset');
  const speedSelect = h(
    'select',
    { 'aria-label': 'Playback speed', onchange: () => handlers.speed?.(Number(speedSelect.value)) },
    SPEEDS.map((x) => h('option', { value: String(x), selected: x === 1 }, `${x}×`)),
  );
  const time = h('output', { class: 'ts-time', 'aria-label': 'Simulation time' }, 't = 0.0 s');

  // A menu: a real button that opens a small panel, closed again by Escape or a click elsewhere.
  function menu(label, id, children) {
    const button = h('button', { type: 'button', class: 'button menu-button', 'aria-expanded': 'false', 'aria-controls': id }, label);
    const body = h('div', { class: 'ts-menu-body', id, hidden: true }, ...children);
    const element = h('div', { class: 'ts-menu' }, button, body);
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
    listen(document, 'pointerdown', (e) => {
      if (!element.contains(e.target)) setOpen(false);
    });
    return { element, setOpen };
  }
  const lc = layoutControls;
  // The 3/9 line, the 7/5 lines and The Cone (Patrick, 5 Oct), each with ticks for which aircraft draw it (Lead at first).
  const SHIP_NAMES = [[1, 'Lead'], [2, '#2'], [3, '#3'], [4, '#4']];
  const shipTicks = []; // { el, id }: #3 and #4 show in the four only
  function layerWithShips(key, prefix, label, extra = null) {
    const ticks = SHIP_NAMES.map(([id, name]) => {
      const el = lc.checkbox(`${prefix}_${id}`, { label: name });
      shipTicks.push({ el, id });
      return el;
    });
    return h('div', { class: 'ts-layer-ships' }, lc.checkbox(key, { label }), h('div', { class: 'ts-ship-ticks', role: 'group', 'aria-label': `${label}: which aircraft` }, ...ticks), extra);
  }
  const layersMenu = menu('Layers', 'ts-layers', [
    lc.checkbox('tracks', { label: 'Ground tracks' }),
    lc.checkbox('planned', { label: 'Planned path' }),
    lc.checkbox('turnCircles', { label: 'Turn circles' }),
    layerWithShips('lead39', 'l39', '3/9 line'),
    layerWithShips('lead75', 'l75', "7/5 o'clock lines"),
    // In 3D, the cone as the true 3D cone or as the 2D band (Patrick, 5 Oct).
    layerWithShips('cone', 'cone', 'The Cone', h('div', { class: 'ts-cone-shape' }, lc.choice('coneShape', { label: 'In 3D', options: [{ value: 'flat', label: '2D projection' }, { value: '3d', label: '3D' }] }))),
    lc.select('paint', { label: '3D paint', options: PAINT_OPTIONS }),
  ]);
  // The camera (Patrick, 5 Oct): centred on the formation or one aircraft; on one aircraft in 3D it follows it or padlocks the
  // other; Auto zoom keeps everyone in the picture. In 2D it only picks the centre, north up.
  const camOnChoice = lc.choice('camOn', { label: 'Centre on', options: [
    { value: 'formation', label: 'Formation (average)' }, { value: '1', label: 'Lead' }, { value: '2', label: '#2' },
    { value: '3', label: '#3' }, { value: '4', label: '#4' }, { value: 'free', label: 'Free' },
  ] });
  // Data tag (Patrick, 5 Oct): what each aircraft's tag shows.
  const dataTagMenu = menu('Data tag', 'ts-datatag', [
    lc.checkbox('tags', { label: 'Data tags' }),
    lc.checkbox('tagDoing', { label: "What it's doing" }),
    lc.checkbox('tagPosition', { label: 'Position' }),
    lc.checkbox('tagRange', { label: 'Range and sweep' }),
    lc.checkbox('tagSpeed', { label: 'Airspeed' }),
    lc.checkbox('tagPower', { label: 'Power' }),
    lc.checkbox('tagClosure', { label: 'Closure (rejoins)' }),
    lc.checkbox('tagError', { label: 'Error and fix (#2)' }),
    lc.checkbox('tagHeight', { label: 'Height off Lead' }),
    lc.checkbox('tagHeading', { label: 'Heading' }),
    lc.checkbox('tagBankG', { label: 'Bank and G' }),
    lc.checkbox('tagHud', { label: 'HUD (attitude, altitude, G)' }),
    lc.checkbox('tagArrow', { label: 'Arrow to Lead (distance, closure)' }),
    lc.checkbox('tagElevation', { label: "Elevation lines to Lead's level (3D)" }),
  ]);
  // Each seat's eye offsets (TS-155): only the chosen seat's pair shows (applyLayout).
  const feet = (v) => `${v > 0 ? '+' : ''}${Number(v).toFixed(2)} ft`;
  const eyePair = (suffix, lim) => h('div', { class: 'ts-eye' },
    lc.slider(`eyeUp${suffix}`, { label: 'Eye up / down', min: lim.up[0], max: lim.up[1], step: EYE_OFFSET_FT.step, format: feet }),
    lc.slider(`eyeFwd${suffix}`, { label: 'Eye forward / back', min: lim.fwd[0], max: lim.fwd[1], step: EYE_OFFSET_FT.step, format: feet }));
  const eyeFront = eyePair('Front', EYE_OFFSET_FT.front);
  const eyeRear = eyePair('Rear', EYE_OFFSET_FT.rear);
  const resetEyeButton = h('button', { type: 'button', class: 'button', onclick: () => {
    const suffix = layout.get().cockpitSeat === 'rear' ? 'Rear' : 'Front';
    layout.update({ [`eyeUp${suffix}`]: 0, [`eyeFwd${suffix}`]: 0 });
  } }, 'Reset eye');
  const cameraMenu = menu('Camera', 'ts-camera', [
    camOnChoice,
    lc.choice('camLook', { label: 'Look (3D)', options: [
      { value: 'chase', label: 'Chase' }, { value: 'cockpit', label: 'Cockpit' }, { value: 'padlock', label: 'Padlock' },
      { value: 'free', label: 'Follow (free look)' },
    ] }),
    lc.checkbox('cockpitInterior', { label: 'Cockpit interior (3D Cockpit, Padlock)' }),
    lc.choice('cockpitSeat', { label: 'Seat (3D Cockpit, Padlock)', options: [{ value: 'front', label: 'Front' }, { value: 'rear', label: 'Rear' }] }),
    eyeFront,
    eyeRear,
    resetEyeButton,
    lc.checkbox('autoFit', { label: 'Auto zoom' }),
  ]);

  // Fit: back to the camera that keeps every aircraft in the picture, after a pan or zoom paused it (or once, when it is off).
  const fitButton = h('button', { type: 'button', class: 'button ts-fit', hidden: true, title: 'Fit every aircraft in the picture again', onclick: () => handlers.fit?.() }, 'Fit');
  const canvas = h('canvas', { class: 'ts-canvas' });
  const canvas3d = h('canvas', { class: 'ts-canvas ts-canvas3d', hidden: true }); // the 3D view's own canvas: a WebGL context can't share the 2D one
  const tags3d = h('canvas', { class: 'ts-canvas ts-tags3d', hidden: true, 'aria-hidden': 'true' }); // the info tags over the 3D picture
  const canvasWrap = h('div', { class: 'ts-canvas-wrap' }, canvas, canvas3d, tags3d);
  const note3d = h('span', { class: 'ts-note', role: 'status', hidden: true });
  // Real aircraft size, and the scale slider when it is off (Patrick, 5 Oct).
  const scaleSlider = lc.slider('planeScale', { label: 'Scale', min: 0.5, max: 4, step: 0.25, format: (v) => `×${v}` });
  const sizeGroup = h('div', { class: 'ts-size' }, lc.checkbox('realSize', { label: 'Real aircraft size' }), scaleSlider);
  const bar = h(
    'div',
    { class: 'ts-bar', role: 'group', 'aria-label': 'Playback' },
    playButton, resetRunButton, speedSelect, time, sizeGroup,
    h('span', { class: 'ts-bar-gap' }),
    fitButton,
    lc.viewSwitch(), note3d, cameraMenu.element, layersMenu.element, dataTagMenu.element,
  );
  const stage = h('section', { class: 'ts-stage', 'aria-label': 'Formation from above and playback' }, bar, canvasWrap);

  // ---- Formation card -----------------------------------------------------------
  const flying = h('p', { class: 'ts-line ts-flying' });
  const flyingNote = h('p', { class: 'ts-line ts-turn' });
  // How the move is flown (the manuals' words), folded away (Patrick, 5 Oct: declutter the Formation card).
  const flyingMore = h('details', { class: 'ts-more ts-flying-more', hidden: true }, h('summary', {}, 'More'), flyingNote);
  const errorSet = h('p', { class: 'ts-line ts-error-set', hidden: true });
  const errorOutcome = h('p', { class: 'ts-line ts-judged ts-error-outcome', 'aria-live': 'polite', hidden: true });
  const now = h('ul', { class: 'ts-lines', 'aria-label': 'The formation now' });
  const judged = h('p', { class: 'ts-line ts-judged', 'aria-live': 'polite' });
  const ships = h('ul', { class: 'ts-card', 'aria-label': 'Each aircraft' });
  const formationPanel = createPanel({ title: 'Formation', onToggle: (c) => layout.update({ formationColumn: !c }) });
  // The spacing, sweep and height lines and each aircraft's numbers are on the data tags now (Patrick, 5 Oct); the card keeps
  // what is flying, where the formation is, the roll-out verdict, the flags and the training error.
  now.hidden = true;
  ships.hidden = true;
  formationPanel.body.append(
    flying, flyingMore, ...(changeUi ? [changeUi.cardElement] : []), errorSet, errorOutcome,
    h('h3', { class: 'ts-group-title' }, 'Last roll-out'), judged,
    now, ships,
  );

  // Controls, Scenario, Settings and Formation: their header buttons "pop" so they read as clickable (Patrick, 5 Oct).
  for (const p of [movesPanel, scenarioPanel, settingsPanel, formationPanel]) p.element.classList.add('panel-pop');
  const setupCol = h('aside', { class: 'ts-col ts-col-setup', 'aria-label': 'Controls, scenario and settings' }, movesPanel.element, scenarioPanel.element, settingsPanel.element);
  const formationCol = h('aside', { class: 'ts-col ts-col-formation', 'aria-label': 'Formation' }, formationPanel.element);
  const element = h(
    'div',
    { class: 'turn-sim' },
    h('h1', { class: 'visually-hidden' }, "Pat's Formation Simulator"),
    setupCol,
    stage,
    formationCol,
  );

  function applyLayout(values) {
    scaleSlider.hidden = Boolean(values.realSize);
    eyeFront.hidden = values.cockpitSeat === 'rear';
    eyeRear.hidden = values.cockpitSeat !== 'rear';
    formationPanel.setCollapsed(!values.formationColumn);
    formationCol.classList.toggle('is-collapsed', !values.formationColumn);
  }
  applyLayout(layout.get());

  let lastJudged = null;
  let lastOutcome = null;

  return {
    element,
    canvas,
    canvas3d,
    tags3d,
    /** Which picture shows: '2d' or '3d'. */
    showView(view) {
      canvas.hidden = view === '3d';
      canvas3d.hidden = view !== '3d';
      tags3d.hidden = view !== '3d';
      for (const key of LAYERS_2D) lc.setDisabled(key, view === '3d');
      lc.setDisabled('camLook', view !== '3d'); // Follow and Padlock turn the 3D view; the 2D map stays north up
      lc.setDisabled('coneShape', view !== '3d'); // the 2D map always draws the flat band

    },
    /** A short note beside the View switch ("3D needs a connection the first time."), or '' for none. */
    setNote(text) {
      note3d.textContent = text ?? '';
      note3d.hidden = !text;
    },
    applyLayout,
    /** The into / away words on each button, for #2 on `wingSide` of Lead (SMM 16.19 paras 53-57 name them from Lead's side). */
    setSide(wingSide) {
      const wingDir = wingSide === 'left' ? 1 : -1;
      for (const { el, dir } of sideHints) el.textContent = dir === wingDir ? 'into #2' : 'away';
    },
    /** 2-ship or 4-ship: only the buttons that formation has show, and `line` (the four-ship's fixed numbers) shows under the fixed line. */
    setShips(ships, line = '') {
      shipsNow = ships;
      showMoves();
      fourLine.textContent = ships === 4 ? line : '';
      fourLine.hidden = ships !== 4;
      check45Field.hidden = ships !== 4;
      fwTwo.hidden = ships === 4;
      fwFour.hidden = ships !== 4;
      errorsSection.hidden = ships === 4; // training errors are 2-ship only for now (TS-52)
      changeUi?.setShips(ships); // the four have their own formation buttons (spec section 8)
      camOnChoice.querySelectorAll('.choice-option').forEach((el, i) => { el.hidden = (i === 3 || i === 4) && ships !== 4; }); // #3 and #4 in the four only
      for (const { el, id } of shipTicks) el.hidden = id > 2 && ships !== 4;
    },
    /**
     * Shows only the manoeuvre buttons that fly in the formation the aircraft are in; the rest are hidden, not greyed.
     * @param {boolean} enabled false hides them all
     * @param {(key: string) => boolean} [keyEnabled] which buttons show when enabled (G-warm only from Spread 4)
     * @param {string} [note] the line shown when none do ('' for none)
     */
    setMovesEnabled(enabled, keyEnabled = (_key) => true, note = PAIR_MOVES_NOTE) {
      moveShown = enabled ? keyEnabled : () => false;
      showMoves();
      movesNote.textContent = note;
      movesNote.hidden = enabled || !note;
    },
    /** The Fix tools and when he fixes it show only with Smart wingman on (TS-96). */
    setFixTools(visible) {
      fixTools.hidden = !visible;
      fixWhen.style.display = visible ? '' : 'none';
    },
    /** The flag under Spacing (outside the SMM band), or null. */
    setSpacingFlag(text) {
      spacingFlag.textContent = text ?? '';
      spacingFlag.hidden = !text;
    },
    /** The fighting wing places' flag (outside the SMM band, flown anyway), or '' for none. */
    setFwFlag(text) {
      fwFlag.textContent = text ?? '';
      fwFlag.hidden = !text;
    },
    setPlaying(playing) {
      playGlyph.textContent = playing ? '❚❚' : '▶';
      playLabel.textContent = playing ? 'Pause' : 'Play';
    },
    setTime(sec) {
      const text = `t = ${sec.toFixed(1)} s`;
      if (time.textContent !== text) time.textContent = text;
      time.dataset.sec = String(Math.round(sec * 1000) / 1000); // the exact time, for tests and anything reading it
    },
    /**
     * The Formation card. r: { flying, note, queued, nowLines: [text], judged: { text, tone } | null,
     * errors: { set, outcome: { text, tone } | null } | null, ships: [{ id, name, text }] }.
     */
    renderCard(r) {
      flying.textContent = r.flying;
      flyingNote.textContent = r.note ?? '';
      flyingMore.hidden = !r.note;
      const queueText = r.queued ? `Next: ${r.queued}` : '';
      if (queueLine.textContent !== queueText) queueLine.textContent = queueText;
      clear(now);
      for (const t of r.nowLines) now.append(h('li', {}, t));
      // A live region: rewritten only when the judgement changes, so a screen reader says it once.
      const judgedText = r.judged ? r.judged.text : 'Judged once all have rolled out.';
      if (judgedText !== lastJudged) {
        lastJudged = judgedText;
        judged.textContent = judgedText;
        judged.className = `ts-line ts-judged tone-${r.judged?.tone ?? 'none'}`;
      }
      // The training error, when one is set: what it is, then (once, after the roll-out) whether #2 carried or fixed it.
      errorSet.textContent = r.errors?.set ?? '';
      errorSet.hidden = !r.errors;
      const outcomeText = r.errors?.outcome?.text ?? '';
      if (outcomeText !== lastOutcome) {
        lastOutcome = outcomeText;
        errorOutcome.textContent = outcomeText;
        errorOutcome.className = `ts-line ts-judged ts-error-outcome tone-${r.errors?.outcome?.tone ?? 'none'}`;
      }
      errorOutcome.hidden = !outcomeText;
      clear(ships);
      for (const s of r.ships) ships.append(h('li', {}, swatch(s.id), h('strong', {}, s.name), ' ', h('span', {}, s.text)));
    },
    onPress: (fn) => (handlers.press = fn),
    onPlayPause: (fn) => (handlers.playPause = fn),
    onResetRun: (fn) => (handlers.resetRun = fn),
    onSpeed: (fn) => (handlers.speed = fn),
    onFit: (fn) => (handlers.fit = fn),
    /** The Fit button shows while the fit-all camera is paused by a pan or zoom, or switched off. */
    setFitShown(shown) {
      fitButton.hidden = !shown;
    },
  };
}
