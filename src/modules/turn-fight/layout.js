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
import { RANGES, DEFAULTS, ALLOWED, G_LABEL, startSetupFrom, TACTICAL_PRESETS } from './state.js';
import { VIEWS } from './view3d.js';
import { startGeometry, passNote, turnNote } from './geometry.js';
import { limitWarning } from './t6-limit.js';
import { ENERGY_ACCURATE_MAX_FT, ENERGY_MOVES } from './energy-sim.js';
import { ALTITUDE_TABLE_STEP_SEC } from './energy-readouts.js';

// The choices come from state.js, so a saved value and a box can't disagree.
const times = (values) => values.map((v) => [v, `${v}×`]);

let nextId = 1;

const SIMPLE_FOOTER = 'Simple 2D Circles: constant-speed turn circles — rate vs radius, no vertical bleed';
const ENERGY_FOOTER = 'BFM Energy Fight: full T-6 physics — energy management, stalls, pursuit curves';

/** The plain names of Energy's moves, for the Move boxes (the engine's ids are the values). */
const MOVE_NAMES = Object.freeze({
  tactical: 'Tactical AI (Dynamic Pilot)',
  auto: 'Textbook SMM Auto',
  immelmann: 'Manual: Immelmann',
  pitchBack: 'Manual: Pitch back',
  slice: 'Manual: Slice',
  splitS: 'Manual: Split S',
  mpt: 'Manual: MPT',
});

/**
 * The note beside a start altitude above 15,000 ft (the spec's words): one note, not two warnings. It goes once core's
 * high-altitude fix lands.
 */
export const ALTITUDE_NOTE = `Above ${ENERGY_ACCURATE_MAX_FT.toLocaleString('en-US')} ft the model's sustained turn rate reads low: up to 28 % low at 20,000 ft and above near 200 KIAS (within 0.65°/s at ${ENERGY_ACCURATE_MAX_FT.toLocaleString('en-US')} ft and below). The SMM recommends aerobatics below 16,000 ft MSL (SMM 14.5 para 10).`;

/** The About panel's Energy lines: what the model does about the MPT bank, the 160 KIAS entry and the flags. Numbers and page refs only. */
export const ENERGY_ABOUT = Object.freeze([
  'MPT bank: the SMM gives about 75° for the level MPT at the hard deck (SMM 14.14 paras 34 to 36) and 70 to 75° for the constant-speed MPT above it (para 37). The model holds about 69° at the deck (68.5° at a 6,000 ft deck, 146 KIAS, 2.7 G) because its thrust and drag are fitted to the sustained-turn charts, and about 72° in the constant-speed MPT (3.3 G at 160 KIAS).',
  'Flags: OVER G is more than +7 G, or more than +4.7 G while rolling (SMM 14.17). STALL is a pull past the stall line or a speed under the stall speed (SMM 14.14 para 32); it drops the G to 1 G for a moment, so the turn all but stops. The aircraft still flies what it did, so the flag shows what the move would cost.',
  'Start altitude: 10,000 ft is where the SMM entry speeds apply (SMM 14.5 para 10), and enough for a split S, which loses about 2,000 ft (SMM 14.16 para 40).',
]);

/** "100 to 220 KIAS, default 160." from a setting's range and default (state.js), so the hint and the box cannot disagree. */
export function rangeHint(key) {
  const { min, max, unit } = RANGES[key];
  const n = (x) => x.toLocaleString('en-US');
  const u = unit ? `${unit.startsWith('°') || unit === '%' ? '' : ' '}${unit}` : '';
  return `${n(min)} to ${n(max)}${u}, default ${n(DEFAULTS[key])}${u}.`;
}

/**
 * The boxes in Model settings for checking, in the spec's order: [setting, label, what it is]. Each hint follows the range and default
 * (rangeHint) with what the number is and where it comes from.
 */
export const CHECK_SETTINGS = Object.freeze([
  ['stallKias', 'Stall speed (KIAS)', 'The V-n diagram reads about 89; the turn charts imply about 83; 86 is the agreed setting.'],
  ['shakerPct', 'Shaker (% of the stall-line G)', '17 of 18 units of AOA (SMM 14.14 para 33).'],
  ['stallSec', 'How long a stall lasts (s)', 'The G drops to 1 G for this long (SMM 14.14 para 32).'],
  ['midThrottlePct', 'Mid-range throttle (% of maximum thrust)', 'Used rolling straight into an MPT from above its speed (SMM 14.14 paras 36 and 38).'],
  ['leadSec', 'Lead point (s ahead)', 'Where a Lead pursuit aims, ahead of the other aircraft.'],
  ['lagSec', 'Lag point (s behind)', 'Where a Lag pursuit aims, behind the other aircraft.'],
  ['rollRateDegPerSec', 'Roll rate (°/s)', 'How fast the bank changes.'],
  ['gOnsetGPerSec', 'G onset (G/s)', 'How fast the pilot builds or eases the G. Estimate: Patrick\'s brisk choice (4 Oct 2026). 0 turns it off.'],
  ['rollAccelDegPerSec2', 'Roll acceleration (°/s²)', 'How fast the roll rate builds and dies away: 360 reaches 90°/s in 0.25 s. Estimate: Patrick\'s brisk choice (4 Oct 2026). 0 turns it off.'],
  ['pitchBackBank160Deg', 'Pitch back bank at 160 KIAS (°)', 'More bank when slower (EFIG p.441).'],
  ['pitchBackBank220Deg', 'Pitch back bank at 220 KIAS (°)', 'Less bank when faster, in a line from the 160 KIAS bank.'],
  ['immelmannAboveKias', 'Auto: Immelmann or pitch back above (KIAS)', 'Above this, Auto races the Immelmann against the pitch back.'],
  ['splitSBelowKias', 'Auto: split S below (KIAS)', 'Below this Auto flies a split S (a slice above it).'],
  ['immelmannOffNoseDeg', 'Immelmann off-nose angle (°)', 'With no chase in the look-ahead, Auto flies the Immelmann when the other aircraft is more than this off the nose.'],
  ['immelmannMinTopKias', 'Lowest Immelmann top speed (KIAS)', 'An Immelmann that would be over the top slower than this is never picked.'],
  ['pickLookaheadSec', 'Look-ahead (s)', 'How far ahead Auto races the two moves above its split point. 0 turns the race off.'],
  ['deckMarginFt', 'Deck margin (ft)', 'Under the MPT band and closer than this to the hard deck, Auto flies the level MPT instead of a slice or split S.'],
  ['tacticalLookaheadSec', 'Tactical AI lookahead (s)', 'Forward lookahead horizon in seconds used by Tactical AI to evaluate candidate moves.'],
]);

/**
 * settings: the remembered values (storage/settings.js); controls: ui-kit controls bound to them.
 * on: { playPause, reset, resetDefaults, headOn, checkingDefaults, moreToggled, tableToggled, cameraView }, called from the buttons;
 * cameraView(name) is one of the 3D view's one-click views ('overhead', 'blue', 'red').
 */
export function createLayout({ settings, controls, on }) {
  // The high-altitude note shows (with its words) or is hidden and empty.
  const showAltNote = (note, show) => {
    note.hidden = !show;
    const words = show ? ALTITUDE_NOTE : '';
    if (note.textContent !== words) note.textContent = words;
  };

  // ── Fight setup column ──────────────────────────────────────────────
  const versionBadge = h('div', { class: 'tf-version-badge' }, 'TURN FIGHT v2.9', h('span', { class: 'tf-version-sub' }, '• Tactical AI & Harvard 5.0 G'));
  const intro = h('p', { class: 'tf-intro' }, versionBadge, h('br'), 'Two aircraft start apart and turn, at the pass or at once: who gets their nose on the other first?');
  const presetSelect = h(
    'select',
    {
      class: 'tf-preset-select',
      id: `tf-preset-${nextId++}`,
      onchange: (e) => on.onPreset?.(e.target.value),
    },
    ...Object.entries(TACTICAL_PRESETS).map(([key, p]) =>
      h('option', { value: key }, p.name),
    ),
  );
  const presetField = h(
    'div',
    { class: 'control control-select tf-preset-control' },
    h('label', { for: presetSelect.id }, 'Tactical Preset'),
    presetSelect,
  );
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
    // Energy (T-6): each aircraft's start altitude and merge speed (they take the place of the greyed-out simple boxes' work),
    // the note about high starts, and the move the model chose and why. All hidden until the Energy box is ticked.
    // Its text is there only while it shows: Start altitude's description points at it, and a hidden note still describes.
    const altNote = h('p', { class: 'tf-hint tf-alt-note', id: `tf-alt-note-${nextId++}`, hidden: true });
    const altitude = controls.number(`${who}AltFt`, { label: 'Start altitude (ft)', ...RANGES[`${who}AltFt`] });
    altitude.querySelector('input').setAttribute('aria-describedby', `${altitude.querySelector('input').getAttribute('aria-describedby')} ${altNote.id}`);
    const energyRow = h('div', { class: 'tf-aircraft-row tf-energy-row', hidden: true },
      altitude,
      controls.number(`${who}Kias`, { label: 'Merge speed (KIAS)', ...RANGES[`${who}Kias`] }));
    // Always on the page while Energy is on, so a screen reader hears the move when it changes ("Pitch back", then "MPT 160 KIAS").
    const move = h('p', { class: 'tf-move', 'aria-live': 'polite', hidden: true });
    const element = h(
      'fieldset',
      { class: `tf-aircraft tf-${who}` },
      h('legend', {}, h('span', { class: 'tf-badge', 'aria-hidden': 'true' }, letter), name),
      h('div', { class: 'tf-aircraft-row' }, speed, g, pitchBox),
      warning,
      energyRow,
      altNote,
      move,
    );
    return { element, warning, pitchBox, energyRow, altNote, move };
  }
  const blue = aircraft('blue', 'B', 'Blue');
  const red = aircraft('red', 'R', 'Red');

  const chase = controls.checkbox('chase', { label: 'First nose chases' });
  const vertical = controls.checkbox('vertical', { label: 'Climb and dive' });
  vertical.hidden = true;
  const energy = controls.checkbox('energy', { label: 'BFM Energy Fight' });
  // Why an Energy setup cannot fly (two numbers that don't go together): in words, where the boxes are.
  const energyProblem = h('p', { class: 'tf-warning tf-energy-problem', id: `tf-energy-problem-${nextId++}`, 'aria-live': 'polite' });

  // The one closed settings menu. Start geometry and Energy sections are made
  // here ahead of Display when those arrive (most-used first).
  const menu = createSettingsMenu({
    title: 'Turn Fight settings',
    onReset: () => on.resetDefaults(),
    resetLabel: 'Reset to Standard Defaults',
    // The column scrolls, so a menu opened near its foot is brought into view, Reset button and all.
    onToggle: (collapsed) => !collapsed && menu.element.scrollIntoView?.({ block: 'nearest' }),
  });
  // ── Start geometry (R28): head-on by default, the most-used section ───
  const startSection = menu.section('Start geometry');
  const startPicture = h('canvas', { class: 'tf-start-picture' });
  const hcaText = h('p', { class: 'tf-hca', 'aria-live': 'polite' });
  const passText = h('p', { class: 'tf-hca tf-pass', 'aria-live': 'polite' });
  const turnText = h('p', { class: 'tf-turns', 'aria-live': 'polite' });
  const headOnButton = h('button', { type: 'button', class: 'button', onclick: () => on.headOn() }, 'Neutral Head-on');
  const sideChoices = [['left', 'Left'], ['right', 'Right']];
  const redAbove = controls.number('redAboveFt', { label: 'Red starts above Blue (ft)', ...RANGES.redAboveFt });
  startSection.append(
    h('p', { class: 'tf-hint' }, 'Where the fight starts. Neutral head-on is the standard start. Changing these starts the fight again.'),
    h('div', { class: 'tf-start-row' },
      controls.number('startAtaDeg', { label: 'Red\'s position off Blue\'s nose (ATA)', ...RANGES.startAtaDeg }),
      controls.choice('startAtaSide', { label: 'ATA side', options: sideChoices })),
    h('p', { class: 'tf-hint' }, '0 to 180°, default 0° (dead ahead). ATA: the angle off Blue\'s nose (this tool\'s term). No side at 0° or 180°.'),
    h('div', { class: 'tf-start-row' },
      controls.number('startAaDeg', { label: 'Red\'s aspect angle (AA)', ...RANGES.startAaDeg }),
      controls.choice('startAaSide', { label: 'AA side', options: sideChoices })),
    h('p', { class: 'tf-hint' }, '0 to 180°, default 180° (Red points at Blue; 0° is Blue dead astern of Red). Side: which side of Red Blue is on, none at 0° or 180°. AA and HCA: SMM 12.2 paras 6 and 9; sides: SMM 16 para 40b.'),
    hcaText,
    passText,
    turnText,
    h('div', { class: 'tf-start-picture-wrap' }, startPicture),
    h('div', { class: 'tf-red-above' }, redAbove),
    h('p', { class: 'tf-hint' }, '-5,000 to +5,000 ft, default 0. Used with Climb and dive on. The start separation is measured level; Range includes height.'),
    controls.choice('turnsAt', { label: 'When the turns start', options: [['pass', 'At the pass'], ['once', 'At once']] }),
    h('p', { class: 'tf-hint' }, 'At the pass (default): each jet flies straight until the range stops closing. At once: the turns start at T+0.'),
    headOnButton,
  );

  // ── Energy (T-6): More energy settings, shown with the checkbox on ──────
  const energySection = menu.section('Energy');
  energySection.hidden = true;
  const moveOptions = ENERGY_MOVES.map((id) => [id, MOVE_NAMES[id]]);
  energySection.append(
    h('p', { class: 'tf-hint' }, 'More energy settings. Changing any of them starts the fight again.'),
    controls.select('blueMove', { label: 'Blue\'s move', options: moveOptions }),
    controls.select('redMove', { label: 'Red\'s move', options: moveOptions }),
    h('p', { class: 'tf-hint' }, 'Auto (default) picks from the merge speed (SMM Table 14.1). Forcing a move flies it from the pass whatever the speed, then exits into the MPT, so you can compare them.'),
    controls.number('mptKias', { label: 'MPT speed (KIAS)', ...RANGES.mptKias }),
    h('p', { class: 'tf-hint' }, `${rangeHint('mptKias')} The max-performance turn (MPT) speed, SMM 14.3 para 6.`),
    controls.number('hardDeckFt', { label: 'Hard deck (ft MSL)', ...RANGES.hardDeckFt }),
    h('p', { class: 'tf-hint' }, `${rangeHint('hardDeckFt')} 6,000 ft MSL is 3,000 ft AGL in the Moose Jaw areas (SMM 14.6 para 16). It is where the model changes to the level MPT.`),
    controls.select('pursuit', { label: 'Pursuit', options: [['tactical', 'Tactical (Dynamic)'], ['pure', 'Pure'], ['lead', 'Lead'], ['lag', 'Lag']] }),
    h('p', { class: 'tf-hint' }, 'How the first aircraft to get its nose on chases: Tactical (Dynamic) smoothly blends Lag in Control Zone -> Pure -> Lead for snapshot. Pure, Lead, and Lag force static instructor curves (SMM 12.30 and 16.16).'),
    controls.checkbox('chaseAfterHeadOn', { label: 'Chase from head-on' }),
    h('p', { class: 'tf-hint' }, 'Off by default: a head-on first nose-on is marked but starts no chase. On: it starts the pursuit too.'),
    controls.checkbox('collisionDetection', { label: 'Mid-air collision' }),
    h('p', { class: 'tf-hint' }, 'On: aircraft closer than 35 ft collide and tumble. Off: they pass through each other.'),
    controls.checkbox('collisionAvoidance', { label: 'Collision avoidance' }),
    h('p', { class: 'tf-hint' }, 'On: pilots roll out of plane to clear each other when a collision is predicted.'),
  );

  const display = menu.section('Display');
  display.append(
    controls.checkbox('dataTags', { label: 'Data tags on aircraft' }),
    h('p', { class: 'tf-hint' }, 'Shows airspeed, G-load and active maneuver directly beside each aircraft.'),
    controls.choice('heightScale', { label: 'Side view height scale', options: times(ALLOWED.heightScale) }),
    h('p', { class: 'tf-hint' }, 'Stretches heights in the side view (2D, with Climb and dive).'),
    controls.select('paint', { label: 'Paint', options: PAINT_OPTIONS }),
    h('p', { class: 'tf-hint' }, 'How the aircraft are painted in the 3D view. Ship colours are Blue and Red.'),
  );

  // ── Model settings for checking: its own section at the bottom, with its own reset ──
  const checkSection = menu.section('Model settings for checking');
  checkSection.hidden = true;
  checkSection.append(
    h('p', { class: 'tf-hint' }, 'The numbers no manual gives, which Dad checks. A student never needs to open this. Changing one starts the fight again.'),
    ...CHECK_SETTINGS.flatMap(([key, label, hint]) => [
      controls.number(key, { label, ...RANGES[key] }),
      h('p', { class: 'tf-hint' }, `${rangeHint(key)} ${hint}`),
    ]),
    h('button', { type: 'button', class: 'button tf-check-reset', onclick: () => on.checkingDefaults() }, 'Reset to defaults'),
  );

  const about = createPanel({ title: 'About this model', collapsed: true });
  about.body.append(
    h('p', {}, h('b', {}, '2-circle (Rate Fight): '), 'Both jets turn into each other. Two separate circles. ', h('b', {}, '1-circle (Radius Fight): '), 'Jets turn opposite cockpit directions but same geographic direction. One shared circle.'),
    h('p', {}, h('b', {}, 'First nose: '), 'a yellow dashed line marks the first aircraft to get its nose within 5° of the other.'),
    h('p', {}, 'With Climb and dive on, first nose-on needs the nose truly on the other jet; at a fixed climb or dive it may never come, and the chase then never starts.'),
    h('p', {}, 'The aspect angle (AA) and off-nose angle (ATA) are measured in 3D with Climb and dive on, so with a height difference at T+0 the AA reads less than 180° even when Red points at Blue.'),
    h('p', {}, 'In a 2-circle fight between equal jets, from a head-on start a nose-on happens only if they come back exactly head-on; a sideways offset (ATA 1°, AA 179°) gives none, which is what a rate fight between equals means.'),
    h('p', {}, 'Level, coordinated turns, each aircraft a point.'),
  );
  // Energy (T-6) help, in the same closed About panel, shown only with the box ticked.
  const energyAbout = h('div', { class: 'tf-energy-about', hidden: true },
    h('p', {}, h('b', {}, 'BFM Energy Fight: '), 'each T-6 flies at full power, using the vertical (Immelmann, pitch back, slice or split S) to get from its merge speed to the 160 KIAS max-performance turn (MPT), then holds it (SMM 14.3 para 6, 14.4 para 8). The move it chose and why shows beside each aircraft.'),
    ...ENERGY_ABOUT.map((line) => h('p', {}, line)),
  );
  about.body.append(energyAbout);

  const setupPanel = createPanel({ title: 'Fight setup', onToggle: (collapsed) => settings.update({ setupOpen: !collapsed }) });
  setupPanel.body.append(
    intro, presetField, fightType, separation, blue.element, red.element,
    h('div', { class: 'tf-extras' }, chase, vertical, energy),
    energyProblem,
    menu.element, about.element,
  );
  const setupCol = h('aside', { class: 'tf-col tf-col-setup', 'aria-label': 'Fight setup' }, setupPanel.element);

  // ── Stage ───────────────────────────────────────────────────────────
  const playButton = h('button', { type: 'button', class: 'button primary tf-play', onclick: () => on.playPause() }, 'Play');
  const resetButton = h('button', { type: 'button', class: 'button', onclick: () => on.reset() }, 'Reset');
  const timeText = h('span', { class: 'tf-pill tf-time' }, 'T+0.0');
  const phaseText = h('span', { class: 'tf-pill tf-phase' }, 'HEAD-TO-HEAD');
  const versionPill = h('span', { class: 'tf-pill tf-version-pill', title: 'Turn Fight v2.7: 3D BFM AI & Harvard II 5.0 G' }, 'v2.7 · BFM AI');
  const toolbar = h(
    'div',
    { class: 'tf-toolbar' },
    playButton, resetButton,
    controls.viewSwitch(),
    controls.checkbox('dataTags', { label: 'Data tags' }),
    controls.select('playbackRate', { label: 'Playback speed', options: times(ALLOWED.playbackRate) }),
    timeText, phaseText, versionPill,
  );

  const killBanner = h('div', { class: 'tf-kill-banner', hidden: true });
  const collisionBanner = h('div', { class: 'tf-collision-banner', hidden: true });
  const stopped = h('p', { class: 'tf-stopped', role: 'status', hidden: true });
  // Why 3D did not start ("3D needs a connection the first time."); always on the page, so it is heard when it appears.
  const note = h('p', { class: 'tf-note', role: 'status' });

  const canvas = h('canvas', { class: 'tf-topdown' });
  const profileCanvas = h('canvas', { class: 'tf-profile-canvas' });
  const profile = h('section', { class: 'tf-profile', 'aria-label': 'Side view', hidden: true }, profileCanvas);
  // Energy's side view: altitude against time (uPlot, drawn by energy-graph.js into `energyChart`), with its text alternative:
  // a line of numbers and a table (a real table, every ALTITUDE_TABLE_STEP_SEC seconds), for screen readers and anyone else.
  const energyChart = h('div', {
    class: 'tf-energy-chart',
    role: 'img',
    'aria-label': 'Side view: each aircraft\'s altitude against fight time, with the hard deck as a dashed line. The summary and the table under it give the numbers.',
  });
  const energySummary = h('p', { class: 'tf-energy-summary' });
  const energyBody = h('tbody');
  const energyTable = h('details', { class: 'tf-energy-table' },
    h('summary', {}, 'Altitude table'),
    h('table', { class: 'tf-readout' },
      h('caption', { class: 'visually-hidden' }, `Altitude by time, every ${ALTITUDE_TABLE_STEP_SEC} s`),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'T+ (s)'), h('th', { scope: 'col', class: 'tf-blue' }, 'Blue (ft)'), h('th', { scope: 'col', class: 'tf-red' }, 'Red (ft)'), h('th', { scope: 'col' }, 'Deck (ft)'))),
      energyBody));
  energyTable.addEventListener('toggle', () => on.tableToggled(energyTable.open));
  // Rebuilt only when a row's numbers change, as the table opens or the fight moves on.
  let tableKey = '';
  function renderAltitudeTable(rows, deck) {
    const key = rows.map((r) => `${r.timeSec.toFixed(1)}:${Math.round(r.blueFt)}:${Math.round(r.redFt)}`).join() + `:${deck}`;
    if (key === tableKey) return;
    tableKey = key;
    const ft = (x) => Math.round(x).toLocaleString('en-US');
    energyBody.replaceChildren(...rows.map((r) => h('tr', {}, h('th', { scope: 'row' }, r.timeSec.toFixed(1)), h('td', {}, ft(r.blueFt)), h('td', {}, ft(r.redFt)), h('td', {}, ft(deck)))));
  }
  const energyPanel = h('section', { class: 'tf-energy-panel', 'aria-label': 'Side view: altitude against time', hidden: true },
    h('div', { class: 'tf-energy-key' },
      h('span', { class: 'tf-blue' }, h('span', { class: 'tf-badge', 'aria-hidden': 'true' }, 'B'), 'Blue'),
      h('span', { class: 'tf-red' }, h('span', { class: 'tf-badge', 'aria-hidden': 'true' }, 'R'), 'Red'),
      h('span', { class: 'tf-deck-key' }, 'Hard deck (dashed)')),
    energyChart, energySummary, energyTable);
  // The 3D view draws inside `canvas3d` (a box; each start puts a new canvas in it), with its one-click views beside it.
  const canvas3d = h('div', { class: 'tf-3d', hidden: true });
  const cameraBar = h(
    'div',
    { class: 'tf-3d-bar', role: 'group', 'aria-label': 'Camera views', hidden: true },
    Object.entries(VIEWS).map(([id, { label }]) => h('button', { type: 'button', class: 'button tf-3d-view', onclick: () => on.cameraView(id) }, label)),
    h('span', { class: 'tf-3d-hint' }, 'Drag to turn it. Scroll or pinch to zoom. Grid squares are 1 NM.'),
  );
  const views = h('div', { class: 'tf-views' }, h('div', { class: 'tf-topdown-wrap' }, canvas, canvas3d, cameraBar), profile, energyPanel);
  const footer = h('p', { class: 'tf-footer' }, SIMPLE_FOOTER);
  const stage = h(
    'section',
    { class: 'tf-stage', 'aria-label': 'Fight' },
    toolbar,
    killBanner,
    collisionBanner,
    stopped,
    note,
    views,
    footer,
  );

  // ── Result column ───────────────────────────────────────────────────
  const resultTable = createReadoutTable({ caption: 'Result' });
  const moreTable = createReadoutTable({ caption: 'More detail' });
  const more = createPanel({ title: 'More detail', collapsed: true, onToggle: (collapsed) => on.moreToggled(!collapsed) });
  more.body.append(moreTable.element);
  // Why a flag is on, in the engine's words (Energy only). Its numbers change as the fight flies, so it is not a live
  // region; what a screen reader is told (flagLive) is only which flags are on, and it changes only when one turns on or off.
  const flagNotes = h('ul', { class: 'tf-flag-notes', 'aria-label': 'Flags' });
  const flagLive = h('p', { class: 'tf-flag-live visually-hidden', role: 'status', 'aria-live': 'polite' });
  const resultPanel = createPanel({ title: 'Result', onToggle: (collapsed) => settings.update({ resultOpen: !collapsed }) });
  resultPanel.body.append(resultTable.element, flagNotes, flagLive, more.element);
  let lastFlags = '';
  const resultCol = h('aside', { class: 'tf-col tf-col-result', 'aria-label': 'Result' }, resultPanel.element);

  const element = h('div', { class: 'turn-fight' }, h('h1', { class: 'visually-hidden' }, 'Turn Fight'), setupCol, stage, resultCol);

  // Which picture is on screen: '2d' or '3d'. The view setting is what the person chose; this is what shows.
  let shown = '2d';
  let sideViewWanted = false;
  let energyWanted = false;
  const showPictures = () => {
    const in3d = shown === '3d';
    canvas.hidden = in3d;
    canvas3d.hidden = !in3d;
    cameraBar.hidden = !in3d;
    // The 3D scene replaces the whole drawing area, the side view with it. In Energy mode the side view is the altitude graph
    // (real heights, so no height scale); Climb and dive is greyed out then, and its side view stays away.
    profile.hidden = in3d || !sideViewWanted || energyWanted;
    energyPanel.hidden = in3d || !energyWanted;
    controls.setDisabled('paint', !in3d); // the paint shows only in 3D
    controls.setDisabled('heightScale', in3d || !sideViewWanted || energyWanted); // the height scale is for the 2D side view only
  };

  // The start geometry's words (HCA, the pass, the turns): from the settings, or from the ones an Energy fight flies instead.
  let lastValues = null;
  let flownOverride = null;
  function renderStart() {
    if (!lastValues) return;
    const start = startSetupFrom(flownOverride ?? lastValues);
    const hca = `Heading crossing angle (HCA): ${startGeometry(start).hcaDeg.toFixed(0)}°`;
    if (hcaText.textContent !== hca) hcaText.textContent = hca;
    const pass = passNote(start);
    if (passText.textContent !== pass) passText.textContent = pass;
    const turns = turnNote(start);
    if (turnText.textContent !== turns) turnText.textContent = turns;
  }

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
      // Energy (T-6): the simple speed, G, Climb and dive and First nose chases are greyed out with their values kept, and
      // Energy's start altitude and merge speed take their place. The pitch boxes belong to Climb and dive, so they go too.
      const inEnergy = values.energy;
      energyWanted = inEnergy;
      blue.pitchBox.hidden = !values.vertical || inEnergy;
      red.pitchBox.hidden = !values.vertical || inEnergy;
      sideViewWanted = values.vertical;
      showPictures();
      for (const key of ['blueKt', 'redKt', 'blueG', 'redG', 'chase', 'bluePitchDeg', 'redPitchDeg']) controls.setDisabled(key, inEnergy);
      controls.setDisabled('vertical', true);
      controls.setDisabled('redAboveFt', !values.vertical || inEnergy);
      for (const box of [blue, red]) {
        box.energyRow.hidden = !inEnergy;
        box.move.hidden = !inEnergy;
      }
      showAltNote(blue.altNote, inEnergy && values.blueAltFt > ENERGY_ACCURATE_MAX_FT);
      showAltNote(red.altNote, inEnergy && values.redAltFt > ENERGY_ACCURATE_MAX_FT);
      energySection.hidden = !inEnergy;
      const showCheck = inEnergy && typeof window !== 'undefined' && Boolean(window.location?.search?.includes('debug=aero'));
      checkSection.hidden = !showCheck;
      energyAbout.hidden = !inEnergy;
      if (footer.textContent !== (inEnergy ? ENERGY_FOOTER : SIMPLE_FOOTER)) footer.textContent = inEnergy ? ENERGY_FOOTER : SIMPLE_FOOTER;
      // The pass, the pass note and the picture use the true airspeed of the merge speed in Energy.
      lastValues = values;
      renderStart();
      showWarning(blue, inEnergy ? '' : limitWarning(values.blueKt, values.blueG));
      showWarning(red, inEnergy ? '' : limitWarning(values.redKt, values.redG));
    },
    /**
     * The words for an Energy setup that cannot fly ('' for none), and the settings the fight flies instead when they are not
     * the person's (null otherwise), which the pass line, the heading crossing angle and the turn note then use.
     */
    setEnergyProblem(text, flown = null) {
      if (energyProblem.textContent !== (text ?? '')) energyProblem.textContent = text ?? '';
      flownOverride = flown;
      renderStart();
    },
    /** The Energy graph's box, for energy-graph.js. */
    energyChart,
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
    showKillBanner(kill, onContinue) {
      killBanner.hidden = false;
      const victor = kill.victor === 'blue' ? 'Blue' : 'Red';
      const text = `${victor} Victory: Gun Kill at T+${kill.timeSec.toFixed(1)}s (Range ${kill.rangeFt} ft, ATA ${kill.ataDeg}°)`;
      const textSpan = h('span', { class: 'tf-kill-banner-text' }, text);
      const continueBtn = h('button', {
        type: 'button',
        class: 'button tf-kill-continue-btn',
        onclick: () => {
          killBanner.hidden = true;
          if (typeof onContinue === 'function') onContinue();
        },
      }, 'Continue Engagement');
      killBanner.replaceChildren(textSpan, continueBtn);
    },
    hideKillBanner() {
      killBanner.hidden = true;
      killBanner.replaceChildren();
    },
    showCollisionBanner(collision, onReset) {
      collisionBanner.hidden = false;
      const feet = (x) => Math.round(x).toLocaleString('en-US');
      const text = `MID-AIR COLLISION: Dual Departure & Hull Loss at T+${collision.timeSec.toFixed(1)}s (Closure ${collision.closingRateKt} kt, Alt ${feet(collision.altitudeFt)} ft)`;
      const textSpan = h('span', { class: 'tf-collision-banner-text' }, text);
      const resetBtn = h('button', {
        type: 'button',
        class: 'button tf-collision-reset-btn',
        onclick: () => {
          collisionBanner.hidden = true;
          if (typeof onReset === 'function') onReset();
        },
      }, 'Reset Fight');
      collisionBanner.replaceChildren(textSpan, resetBtn);
    },
    hideCollisionBanner() {
      collisionBanner.hidden = true;
      collisionBanner.replaceChildren();
    },
    get moreOpen() {
      return !more.collapsed;
    },
    /**
     * { time, phase, result, more } from readouts.js; `more` is null while the panel is closed. In Energy mode also
     * `energy`: { moves: { blue, red } (the words beside each aircraft), notes (why a flag is on), flags (which flags are on, for a screen reader), summary (the altitude line),
     * rows (the altitude table's rows, null while it is closed), deck } from energy-readouts.js.
     */
    renderReadouts({ time, phase, result, more: moreRows, energy: extra = null }) {
      if (timeText.textContent !== time) timeText.textContent = time;
      if (phaseText.textContent !== phase) phaseText.textContent = phase;
      resultTable.render(result);
      if (moreRows) moreTable.render(moreRows);
      for (const who of ['blue', 'red']) {
        const words = extra?.moves[who] ?? '';
        const box = who === 'blue' ? blue : red;
        if (box.move.textContent !== words) box.move.textContent = words;
      }
      const notes = extra?.notes ?? [];
      if (flagNotes.dataset.text !== notes.join('|')) {
        flagNotes.dataset.text = notes.join('|');
        flagNotes.replaceChildren(...notes.map((line) => h('li', {}, line)));
      }
      // The announcement changes only when a flag turns on or off ("Flags: Blue STALL", then "Flags: none").
      const flags = extra?.flags ?? '';
      if (flags !== lastFlags) {
        lastFlags = flags;
        flagLive.textContent = flags ? `Flags: ${flags}` : 'Flags: none';
      }
      const summary = extra?.summary ?? '';
      if (energySummary.textContent !== summary) energySummary.textContent = summary;
      if (extra?.rows) renderAltitudeTable(extra.rows, extra.deck);
    },
    /** Whether the altitude table is open (it is only built while it is). */
    get tableOpen() {
      return energyTable.open;
    },
    presetSelect,
    setPreset(key) {
      if (presetSelect && key in TACTICAL_PRESETS) presetSelect.value = key;
    },
  };
}
