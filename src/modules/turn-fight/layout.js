// The Turn Fight's screen (SPEC-turn-fight, "The screen", R22): the Fight
// setup column, the stage (toolbar, drawing area) and the Result column. Only
// the essentials show at first; every other setting and number sits in one
// closed "Advanced setup" menu (TF-63), each number with a line saying what it
// is, why it has that value and what changing it does. The side
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
  auto: 'Smart',
  immelmann: 'Set move: Immelmann',
  pitchBack: 'Set move: Pitch back',
  slice: 'Set move: Slice',
  splitS: 'Set move: Split S',
  mpt: 'Set move: MPT',
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
 * Every number box in Advanced setup, with its three lines (Patrick, 4 Oct 10:38Z): what it is, why it has that value
 * and what changing it does. `why` is a manual page, Patrick's ruling, or the word "estimate" (an estimate is labelled one
 * until a source backs it); the sources are the ones in spec.md and decisions.md, and no page is given that they do not give.
 * `section` says where the box sits: 'start' (Start geometry), 'energy' (Energy), 'smoothing' or 'model' (Model numbers).
 * The range and the default are not written here: rangeHint() reads them from state.js, so a line and its box cannot disagree.
 */
export const ADVANCED_NUMBERS = Object.freeze([
  {
    key: 'startAtaDeg', section: 'start', label: 'Red\'s position off Blue\'s nose (ATA)',
    what: 'How far off Blue\'s nose Red starts: 0° is dead ahead, 180° dead astern. Its left or right side is the choice beside it.',
    why: 'Patrick\'s ruling, 4 Oct 01:49Z (TF-R14): Red 5° off Blue\'s nose. ATA is this tool\'s own term; the SMM has no off-nose angle (it gives the sides, SMM 16 para 40b).',
    change: 'Moves Red across Blue\'s view and starts the fight again. No side counts at 0° or 180°.',
  },
  {
    key: 'startAaDeg', section: 'start', label: 'Red\'s aspect angle (AA)',
    what: 'Where Blue sits off Red\'s tail: 180° is Red pointing at Blue, 0° is Blue dead astern of Red.',
    why: 'Patrick\'s ruling, 4 Oct 01:49Z (TF-R14): the neutral head-on start. AA and HCA are SMM 12.2 paras 6 and 9.',
    change: 'Turns Red\'s heading and so the heading crossing angle (HCA, shown beside it), and starts the fight again. No side counts at 0° or 180°.',
  },
  {
    key: 'mptKias', section: 'energy', label: 'MPT speed (KIAS)',
    what: 'The speed the max-performance turn (MPT) is held at.',
    why: 'SMM 14.3 para 6.',
    change: 'Every MPT, and every hand-over from a move to the MPT, aims at this speed. The box stops at 125 and 175 KIAS: above 175 the level MPT sinks under the hard deck, and below 125 the 60° bank floor meets the stick shaker (model limits, TF-44).',
  },
  {
    key: 'hardDeckFt', section: 'energy', label: 'Hard deck (ft MSL)',
    what: 'The height the jets are to stay above.',
    why: '6,000 ft MSL is 3,000 ft AGL in the Moose Jaw areas (SMM 14.6 para 16).',
    change: 'Smart keeps above it, and the level MPT holds 300 ft over it. A jet below it after the pass shows BELOW DECK and loses the fight (TF-R6): it is flagged, not stopped.',
  },
  {
    key: 'gOnsetGPerSec', section: 'smoothing', label: 'G onset (G/s)',
    what: 'How fast the pilot builds or eases the G.',
    why: 'Estimate: Patrick chose the brisk setting (4 Oct 10:38Z); no manual gives a number.',
    change: 'Higher: the G changes faster, nearer a one-step change. Lower: smoother, and each turn takes longer to set up. 0 turns it off.',
  },
  {
    key: 'rollAccelDegPerSec2', section: 'smoothing', label: 'Roll acceleration (°/s²)',
    what: 'How fast the roll rate builds up and dies away: 360 reaches 90°/s in 0.25 s.',
    why: 'Estimate: Patrick chose the brisk setting (4 Oct 10:38Z); no manual gives a number.',
    change: 'Higher: the roll starts and stops more sharply. Lower: it eases in and out more slowly. 0 turns it off.',
  },
  {
    key: 'stallKias', section: 'model', label: 'Stall speed (KIAS)',
    what: 'The 1 G stall speed. The most G a jet can pull at a speed is that speed over this, squared (the stall line).',
    why: 'Patrick kept 86, labelled an estimate (TF-56, 4 Oct 09:10Z). The V-n diagram reads about 89 and the turn charts imply about 83.',
    change: 'Higher: less G at every speed, so the shaker, the stall and the lost turn all come sooner. Lower: the opposite.',
  },
  {
    key: 'shakerPct', section: 'model', label: 'Shaker (% of the stall-line G)',
    what: 'How near the stall line the pilot pulls, as a percent of the stall-line G (the stick shaker).',
    why: '17 of 18 units of AOA (SMM 14.14 para 33).',
    change: 'Higher: harder pulls and a faster turn, with less room before the stall. Lower: more margin and a slower turn.',
  },
  {
    key: 'stallSec', section: 'model', label: 'How long a stall lasts (s)',
    what: 'How long the G drops to 1 G after a stall.',
    why: 'That a stall costs the turn is SMM 14.14 para 32; the length is an estimate (Dad checks it, TF-56).',
    change: 'Longer: a stall costs more of the fight. 0 gives no pause.',
  },
  {
    key: 'midThrottlePct', section: 'model', label: 'Mid-range throttle (% of maximum thrust)',
    what: 'The throttle used when rolling straight into an MPT from above its speed.',
    why: 'Mid throttle in that case is SMM 14.14 paras 36 and 38; the 50 % is an estimate (TF-4).',
    change: 'Higher: the jet keeps more speed going into the MPT. Lower: it slows sooner.',
  },
  {
    key: 'leadSec', section: 'model', label: 'Lead point (s ahead)',
    what: 'How far ahead of the other aircraft a Lead pursuit aims, in seconds of its flight.',
    why: 'Estimate. The Lead and Lag pursuits themselves are SMM 12.30 and 16.16.',
    change: 'Higher: the chaser points further ahead of the other jet. Only a Lead pursuit uses it.',
  },
  {
    key: 'lagSec', section: 'model', label: 'Lag point (s behind)',
    what: 'How far behind the other aircraft a Lag pursuit aims, in seconds of its flight.',
    why: 'Estimate. The Lead and Lag pursuits themselves are SMM 12.30 and 16.16.',
    change: 'Higher: the chaser points further behind the other jet. Only a Lag pursuit uses it.',
  },
  {
    key: 'rollRateDegPerSec', section: 'model', label: 'Roll rate (°/s)',
    what: 'How fast the bank changes when a jet rolls. It is also the roll in the split S.',
    why: 'Estimate: the spec\'s default of 90°/s, with no manual page behind it.',
    change: 'Higher: jets roll to a new bank sooner, so turns start and reverse sooner. Lower: they take longer to get there.',
  },
  {
    key: 'pitchBackBank160Deg', section: 'model', label: 'Pitch back bank at 160 KIAS (°)',
    what: 'The bank for a pitch back entered at 160 KIAS.',
    why: 'The rule, more bank when slower, is EFIG p.441; the 60° itself is an estimate.',
    change: 'More bank turns the jet more and climbs it less; less bank climbs more.',
  },
  {
    key: 'pitchBackBank220Deg', section: 'model', label: 'Pitch back bank at 220 KIAS (°)',
    what: 'The bank for a pitch back entered at 220 KIAS. Between 160 and 220 the bank runs along a line between the two.',
    why: 'The rule, less bank when faster, is EFIG p.441; the 30° itself is an estimate.',
    change: 'More bank turns the jet more and climbs it less; less bank climbs more.',
  },
  {
    key: 'immelmannAboveKias', section: 'model', label: 'Smart: Immelmann or pitch back above (KIAS)',
    what: 'Above this speed Smart\'s first move is the Immelmann or the pitch back, whichever its look-ahead says gets the nose on sooner.',
    why: 'The top of the SMM\'s pitch back band (SMM 14.15, Table 14.1).',
    change: 'Lower: Smart tries the Immelmann from a lower speed. Higher: it flies the pitch back up to a higher speed.',
  },
  {
    key: 'splitSBelowKias', section: 'model', label: 'Smart: split S below (KIAS)',
    what: 'Below this speed Smart\'s first move is a split S (a slice above it).',
    why: 'SMM Table 14.1 (the split S band, 100 to 120 KIAS).',
    change: 'Higher: Smart flies the split S at more speeds, and it loses about 2,000 ft (SMM 14.16 para 40).',
  },
  {
    key: 'immelmannOffNoseDeg', section: 'model', label: 'Immelmann off-nose angle (°)',
    what: 'With no chase in the look-ahead, Smart flies the Immelmann when the other aircraft is more than this off the nose, and the pitch back when it is less.',
    why: 'Estimate.',
    change: 'Lower: more Immelmanns. Higher: more pitch backs.',
  },
  {
    key: 'immelmannMinTopKias', section: 'model', label: 'Lowest Immelmann top speed (KIAS)',
    what: 'An Immelmann that would be over the top slower than this is never picked by Smart. A set Immelmann still flies.',
    why: 'Estimate.',
    change: 'Lower: Smart will pick Immelmanns that top out slower. 0 takes the floor away.',
  },
  {
    key: 'pickLookaheadSec', section: 'model', label: 'Look-ahead (s)',
    what: 'How far ahead Smart races the Immelmann against the pitch back, above its split speed.',
    why: 'Estimate.',
    change: 'Longer: the race is judged over more of the fight and takes more computing. 0 turns the race off.',
  },
  {
    key: 'deckMarginFt', section: 'model', label: 'Deck margin (ft)',
    what: 'Under the MPT band and closer than this to the hard deck, Smart flies the level MPT instead of a slice or split S.',
    why: 'Estimate. It may come from the soft deck sitting at least 1,000 ft above the hard deck (SMM 14.6 to 14.7), which is a guess (TF-15).',
    change: 'Larger: Smart keeps off slices and split S sooner when it is low. 0 takes the margin away.',
  },
  {
    key: 'tacticalLookaheadSec', section: 'model', label: 'Smart look-ahead (s)',
    what: 'How far ahead Smart flies each move it could pick, to see which wins.',
    why: 'Patrick\'s ruling, 4 Oct 18:09Z (TF-59).',
    change: 'Longer: Smart sees further and takes more computing. Shorter: a more short-sighted pilot.',
  },
  {
    key: 'smartDecisionSec', section: 'model', label: 'Smart decision time (s)',
    what: 'How long Smart takes to pick its next move, flying on meanwhile. Its look-ahead starts from where the jet will be then and is spread over that time, so the screen never freezes.',
    why: 'Estimate. Patrick asked for it as a setting (TF-62, 4 Oct 19:38Z); 0.5 s is the estimate.',
    change: 'Longer: Smart reacts later but the work is spread thinner. 0 picks at once, and the screen may freeze briefly.',
  },
]);

/** The setting keys in each section of Advanced setup's numbers, in the order they are shown. */
export const ADVANCED_KEYS = Object.freeze(Object.fromEntries(['start', 'energy', 'smoothing', 'model'].map((section) => [section, ADVANCED_NUMBERS.filter((n) => n.section === section).map((n) => n.key)])));

/** The keys of the Smoothing and Model numbers sections together: the ones Model numbers' own reset puts back (state.js checkingDefaults). */
export const CHECK_SETTINGS_KEYS = Object.freeze([...ADVANCED_KEYS.smoothing, ...ADVANCED_KEYS.model]);

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
  const versionBadge = h('div', { class: 'tf-version-badge' }, "PAT'S FIGHT AND TURN SIM v2.19", h('span', { class: 'tf-version-sub' }, '• Smart pilot & Harvard 5.0 G'));
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

  // One aircraft's boxes: speed and G (the Simple fight's, hidden in Energy), the T-6 limit warning right under them,
  // and Energy's start altitude and merge speed.
  function aircraft(who, letter, name) {
    // Always on the page, so a screen reader hears the words when they appear; only its text changes.
    const warning = h('p', { class: 'tf-warning', id: `tf-warning-${nextId++}`, 'aria-live': 'polite' });
    // The unit is in the label, to keep the three boxes in one row (the refusal message still names it).
    const speed = controls.number(`${who}Kt`, { label: 'Speed (KTAS)', ...RANGES[`${who}Kt`] });
    const g = controls.number(`${who}G`, { label: G_LABEL, ...RANGES[`${who}G`] });
    const gInput = g.querySelector('input');
    gInput.setAttribute('aria-describedby', `${gInput.getAttribute('aria-describedby')} ${warning.id}`);
    // Energy (T-6): each aircraft's start altitude and merge speed (they take the place of the simple boxes, which are hidden then),
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
    const simpleRow = h('div', { class: 'tf-aircraft-row' }, speed, g);
    const element = h(
      'fieldset',
      { class: `tf-aircraft tf-${who}` },
      h('legend', {}, h('span', { class: 'tf-badge', 'aria-hidden': 'true' }, letter), name),
      simpleRow,
      warning,
      energyRow,
      altNote,
      move,
    );
    return { element, warning, simpleRow, energyRow, altNote, move };
  }
  const blue = aircraft('blue', 'B', 'Blue');
  const red = aircraft('red', 'R', 'Red');

  const energy = controls.checkbox('energy', { label: 'BFM Energy Fight' });
  // Why an Energy setup cannot fly (two numbers that don't go together): in words, where the boxes are.
  const energyProblem = h('p', { class: 'tf-warning tf-energy-problem', id: `tf-energy-problem-${nextId++}`, 'aria-live': 'polite' });

  // The one closed menu, Advanced setup (TF-63): everything that is not on the first view. Its sections, in the order a person
  // reaches for them: Start geometry, Pilot and moves, Energy, Smoothing, Display, Model numbers. Every number in it has a line
  // beside it (ADVANCED_NUMBERS): what it is, why it has that value, and what changing it does.
  const menu = createSettingsMenu({
    title: 'Advanced setup',
    onReset: () => on.resetDefaults(),
    resetLabel: 'Reset to Standard Defaults',
    // The column scrolls, so a menu opened near its foot is brought into view, Reset button and all.
    onToggle: (collapsed) => !collapsed && menu.element.scrollIntoView?.({ block: 'nearest' }),
  });
  menu.body.append(h('p', { class: 'tf-hint' }, 'Extra settings, none needed to play. Every number has a line beside it: what it is, why it has that value (a manual page, Patrick\'s ruling, or estimate) and what changing it does. Reset to Standard Defaults, at the foot, puts back every setting here.'));

  // A number box and its line: the range and default, then ADVANCED_NUMBERS' three parts. The line is tied to the box, so a screen reader reads it with the box.
  const NOTES = Object.fromEntries(ADVANCED_NUMBERS.map((n) => [n.key, n]));
  function numberWithNote(key) {
    const { label, what, why, change } = NOTES[key];
    const box = controls.number(key, { label, ...RANGES[key] });
    const line = h('p', { class: 'tf-hint tf-why', id: `tf-why-${nextId++}` },
      `${rangeHint(key)} ${what} `, h('b', {}, 'Why this value: '), `${why} `, h('b', {}, 'Changing it: '), change);
    const input = box.querySelector('input');
    input.setAttribute('aria-describedby', `${input.getAttribute('aria-describedby')} ${line.id}`);
    return [box, line];
  }

  // ── Start geometry (R28): head-on by default, the most-used section ───
  const startSection = menu.section('Start geometry');
  const startPicture = h('canvas', { class: 'tf-start-picture' });
  const hcaText = h('p', { class: 'tf-hca', 'aria-live': 'polite' });
  const passText = h('p', { class: 'tf-hca tf-pass', 'aria-live': 'polite' });
  const turnText = h('p', { class: 'tf-turns', 'aria-live': 'polite' });
  const headOnButton = h('button', { type: 'button', class: 'button', onclick: () => on.headOn() }, 'Neutral Head-on');
  const sideChoices = [['left', 'Left'], ['right', 'Right']];
  const [ataBox, ataLine] = numberWithNote('startAtaDeg');
  const [aaBox, aaLine] = numberWithNote('startAaDeg');
  startSection.append(
    h('p', { class: 'tf-hint' }, 'Where the fight starts. Neutral head-on is the standard start. Changing these starts the fight again. The start separation is on the first view and is measured level; Range includes any height between the jets.'),
    h('div', { class: 'tf-start-row' }, ataBox, controls.choice('startAtaSide', { label: 'ATA side', options: sideChoices })),
    ataLine,
    h('div', { class: 'tf-start-row' }, aaBox, controls.choice('startAaSide', { label: 'AA side', options: sideChoices })),
    aaLine,
    h('p', { class: 'tf-hint' }, 'Sides: which side of the jet the other one is on (SMM 16 para 40b); none at 0° or 180°.'),
    hcaText,
    passText,
    turnText,
    h('div', { class: 'tf-start-picture-wrap' }, startPicture),
    controls.choice('turnsAt', { label: 'When the turns start', options: [['pass', 'At the pass'], ['once', 'At once']] }),
    h('p', { class: 'tf-hint' }, 'At the pass (default): each jet flies straight until the range stops closing. At once: the turns start at T+0.'),
    headOnButton,
  );

  // ── Pilot and moves: who decides each jet's move, how the chase goes, and what the Simple fight's chase does ──
  const pilotSection = menu.section('Pilot and moves');
  // The Simple fight's own switch, shown only there (hidden in Energy, which has its own chase rules below).
  const chaseField = h('div', { class: 'tf-pilot-simple' },
    controls.checkbox('chase', { label: 'First nose chases' }),
    h('p', { class: 'tf-hint' }, 'Simple fight only. Off (default): each jet keeps turning its own circle. On: from the first nose-on, each jet turns toward the other.'));
  const moveOptions = ENERGY_MOVES.filter((id) => MOVE_NAMES[id]).map((id) => [id, MOVE_NAMES[id]]); // 'tactical' is Smart's old name, not shown
  const pilotEnergy = h('div', { class: 'tf-pilot-energy' },
    controls.select('blueMove', { label: 'Blue\'s move', options: moveOptions }),
    controls.select('redMove', { label: 'Red\'s move', options: moveOptions }),
    h('p', { class: 'tf-hint' }, 'Smart (default) picks the first move from the merge speed (SMM Table 14.1), then in the MPT looks ahead for a better move. A set move is flown from the pass whatever the speed, then exits into the MPT, so you can compare them.'),
    controls.select('pursuit', { label: 'Pursuit', options: [['tactical', 'Tactical (Dynamic)'], ['pure', 'Pure'], ['lead', 'Lead'], ['lag', 'Lag']] }),
    h('p', { class: 'tf-hint' }, 'How the first aircraft to get its nose on chases: Pure (default) aims straight at the other jet; Lead and Lag aim ahead of or behind it (SMM 12.30 and 16.16); Tactical (Dynamic) blends Lag in the control zone, Pure and Lead for a snapshot.'),
    controls.checkbox('chaseAfterHeadOn', { label: 'Chase from head-on' }),
    h('p', { class: 'tf-hint' }, 'On by default (Patrick\'s ratification, D403; TF-Q5 is still open): a head-on first nose-on starts the pursuit too. Off: it is marked but starts no chase.'));
  pilotSection.append(
    h('p', { class: 'tf-hint' }, 'Changing any of these starts the fight again.'),
    chaseField,
    pilotEnergy,
  );

  // ── Energy (T-6): shown with the checkbox on ──────
  const energySection = menu.section('Energy');
  energySection.hidden = true;
  energySection.append(
    h('p', { class: 'tf-hint' }, 'Changing any of these starts the fight again.'),
    ...ADVANCED_KEYS.energy.flatMap((key) => numberWithNote(key)),
    controls.checkbox('collisionDetection', { label: 'Mid-air collision' }),
    h('p', { class: 'tf-hint' }, 'On (default): aircraft closer than 35 ft, the size of the aircraft (TF-54), collide and tumble. Off: they pass through each other.'),
    controls.checkbox('collisionAvoidance', { label: 'Collision avoidance' }),
    h('p', { class: 'tf-hint' }, 'On (default): in every move the pilots break away from a predicted close pass (TF-58, provisional until Patrick sees it). Off: they fly on.'),
  );

  // ── Smoothing (TF-57 PR 2): how fast the pilot builds G and rolls ──────
  const smoothingSection = menu.section('Smoothing');
  smoothingSection.hidden = true;
  smoothingSection.append(
    h('p', { class: 'tf-hint' }, 'Limits how fast the pilot changes G and roll, in every move, so nothing snaps. Changing a number starts the fight again.'),
    ...ADVANCED_KEYS.smoothing.flatMap((key) => numberWithNote(key)),
  );

  // ── Display: the 3D view's paint. Shown only while 3D shows (the data tags are the toolbar's) ──────
  const display = menu.section('Display');
  display.hidden = true;
  display.append(
    controls.select('paint', { label: 'Paint', options: PAINT_OPTIONS }),
    h('p', { class: 'tf-hint' }, 'How the aircraft are painted in the 3D view. Ship colours are Blue and Red. It never restarts the fight.'),
  );

  // ── Model numbers: the numbers no manual gives, which Dad checks. Its own reset, as it was ──
  const checkSection = menu.section('Model numbers');
  checkSection.hidden = true;
  checkSection.append(
    h('p', { class: 'tf-hint' }, 'The numbers no manual fully gives, which Dad checks. A student never needs to open this. Changing one starts the fight again.'),
    ...ADVANCED_KEYS.model.flatMap((key) => numberWithNote(key)),
    h('button', { type: 'button', class: 'button tf-check-reset', onclick: () => on.checkingDefaults() }, 'Reset smoothing and model numbers to defaults'),
  );

  const about = createPanel({ title: 'About this model', collapsed: true });
  about.body.append(
    h('p', {}, h('b', {}, '2-circle (Rate Fight): '), 'Both jets turn into each other. Two separate circles. ', h('b', {}, '1-circle (Radius Fight): '), 'Jets turn opposite cockpit directions but same geographic direction. One shared circle.'),
    h('p', {}, h('b', {}, 'First nose: '), 'a yellow dashed line marks the first aircraft to get its nose within 5° of the other.'),
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
    h('div', { class: 'tf-extras' }, energy),
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
  const views = h('div', { class: 'tf-views' }, h('div', { class: 'tf-topdown-wrap' }, canvas, canvas3d, cameraBar), energyPanel);
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

  const element = h('div', { class: 'turn-fight' }, h('h1', { class: 'visually-hidden' }, "Pat's Fight and Turn Sim"), setupCol, stage, resultCol);

  // Which picture is on screen: '2d' or '3d'. The view setting is what the person chose; this is what shows.
  let shown = '2d';
  let energyWanted = false;
  const showPictures = () => {
    const in3d = shown === '3d';
    canvas.hidden = in3d;
    canvas3d.hidden = !in3d;
    cameraBar.hidden = !in3d;
    // The 3D scene replaces the whole drawing area, the side view with it. In Energy mode the side view is the altitude graph (real heights).
    energyPanel.hidden = in3d || !energyWanted;
    display.hidden = !in3d; // the paint is for 3D only: hidden in 2D, not greyed
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
    /** The start picture's canvas (Start geometry, in Advanced setup). */
    startPicture,
    /** Shows the side view, and which controls go with each checkbox, from the settings. */
    applyLayout(values) {
      setupPanel.setCollapsed(!values.setupOpen);
      resultPanel.setCollapsed(!values.resultOpen);
      setupCol.classList.toggle('is-collapsed', !values.setupOpen);
      resultCol.classList.toggle('is-collapsed', !values.resultOpen);
      // Energy (T-6): the Simple fight's speed and G and First nose chases are hidden (their values are kept), and
      // Energy's start altitude and merge speed take their place. In Simple, Energy's own settings are hidden.
      const inEnergy = values.energy;
      energyWanted = inEnergy;
      showPictures();
      for (const box of [blue, red]) {
        box.simpleRow.hidden = inEnergy;
        box.energyRow.hidden = !inEnergy;
        box.move.hidden = !inEnergy;
      }
      chaseField.hidden = inEnergy;
      pilotEnergy.hidden = !inEnergy;
      showAltNote(blue.altNote, inEnergy && values.blueAltFt > ENERGY_ACCURATE_MAX_FT);
      showAltNote(red.altNote, inEnergy && values.redAltFt > ENERGY_ACCURATE_MAX_FT);
      energySection.hidden = !inEnergy;
      smoothingSection.hidden = !inEnergy;
      checkSection.hidden = !inEnergy; // for everyone, not only with ?debug=aero in the address (TF-63)
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
