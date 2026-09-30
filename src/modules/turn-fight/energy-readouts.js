// Energy mode's readouts (SPEC-turn-fight, "Energy mode", "The screen"): what the Result card, More detail, the words
// beside each aircraft and the side view's text alternative say, as plain text from an Energy fight state
// (energy-sim.js). Like readouts.js nothing here touches the page: the screen builds elements from these strings
// with ui-kit's h(), never as HTML. A row is { id, label, group, blue, red } or { id, label, group, text }, as in
// readouts.js, and may carry `blueTone` and `redTone` ('alert' for a flag that is on), which the table shows as colour
// beside the words, never instead of them.
import { FT_PER_NM } from '../../core/units.js';
import { formatWholeFt } from './readouts.js';

const NAMES = Object.freeze({ blue: 'Blue', red: 'Red' });
const round = (x) => Math.round(x);

/** The words for a flag (SPEC "Two flags only"): OVER G, STALL, both, or "None". */
export function flagText(ac) {
  const flags = [ac.overG && 'OVER G', ac.stall && 'STALL'].filter(Boolean);
  return flags.length ? flags.join(' + ') : 'None';
}

/**
 * The lines that say why a flag is on, one per aircraft and flag, in the engine's words: "Blue OVER G: 7.4 G is above +7 G".
 * Empty when neither aircraft has one. The screen keeps them under the Result table, in a live region.
 */
export function flagNotes(state) {
  const notes = [];
  for (const who of ['blue', 'red']) {
    const ac = state[who];
    if (ac.overG) notes.push(`${NAMES[who]} OVER G: ${ac.overGReason}`);
    if (ac.stall) notes.push(`${NAMES[who]} STALL: ${ac.stallReason}`);
  }
  return notes;
}

/** The move the model chose and why, for beside the aircraft: the engine's own words ("Pitch back: 220 KIAS, SMM entry 160 to 220", then "MPT 160 KIAS" once there). */
export function moveWhyText(ac) {
  return ac.why ?? '';
}

/** Who got first nose-on and when after the pass, "Blue at +18.2 s", "Both at +18.2 s"; "--" until then (the engine's `by` is blue, red or both). */
export function energyFirstNoseText(state) {
  const mark = state.firstNose;
  if (!mark) return '--';
  const who = mark.by === 'both' || mark.both ? 'Both' : mark.by === 'blue' ? 'Blue' : 'Red';
  return `${who} at +${(mark.timeSec - (state.mergeSec ?? 0)).toFixed(1)} s`;
}

/** The words for an even fight (SPEC "Result"). */
export const EVEN_FIGHT_TEXT = 'Even fight: nobody gets behind';

/**
 * Who won. The engine says an even fight itself (`state.evenFight`: true only when both noses came on together and no
 * chase has started), and that is read as it is. Otherwise a chase by one aircraft (`state.chase.by`, the pursuit that
 * starts once one is behind the other) names the winner: in Energy mode that is who won the turn (SPEC step 4). Otherwise
 * nobody has yet, "--" while the fight runs and "No winner" once it has stopped at the 10 minutes. Nothing else is guessed.
 */
export function winnerText(state) {
  if (state.evenFight === true) return EVEN_FIGHT_TEXT;
  const chaser = state.chase?.by;
  if (chaser === 'blue' || chaser === 'red') return `${NAMES[chaser]} wins`;
  return state.stopped ? 'No winner' : '--';
}

/** The chase row's words for one aircraft, only once someone has started a pursuit. */
function chaseText(ac) {
  if (ac.move !== 'pursuit') return 'Holding the MPT';
  return ac.chaseLimited ? 'Chasing, behind the curve' : 'Chasing';
}

const pair = (id, label, group, blue, red, tones = {}) => ({ id, label, group, blue, red, ...tones });
const text = (id, label, group, value) => ({ id, label, group, text: value });

/**
 * The Result card in Energy mode: each aircraft's KIAS, altitude, G, the move it is flying and the time and degrees of
 * turn it took to reach the MPT, the two flags, then the range, first nose-on, the chase and who won. There are no turn
 * rate and radius rows: the simple fight's are for a level turn at the simple speed and G, which Energy does not use.
 */
export function energyResultRows(state) {
  const { blue, red } = state;
  const toMpt = (ac) => (ac.mptReached ? `${ac.toMptSec.toFixed(1)} s, ${round(ac.toMptDeg)}°` : '--');
  const rows = [
    pair('kias', 'Speed (KIAS)', 'result', `${round(blue.kias)} KIAS`, `${round(red.kias)} KIAS`),
    pair('alt', 'Altitude', 'result', `${formatWholeFt(blue.altFt)} ft`, `${formatWholeFt(red.altFt)} ft`),
    pair('g', 'G', 'result', blue.g.toFixed(1), red.g.toFixed(1)),
    pair('move', 'Move', 'result', blue.moveLabel, red.moveLabel),
    pair('toMpt', 'To the MPT', 'result', toMpt(blue), toMpt(red)),
    pair('flags', 'Flags', 'result', flagText(blue), flagText(red), {
      blueTone: blue.overG || blue.stall ? 'alert' : '',
      redTone: red.overG || red.stall ? 'alert' : '',
    }),
    text('range', 'Range', 'result', `${(state.rangeFt / FT_PER_NM).toFixed(2)} NM`),
    text('firstNose', 'First nose-on', 'result', energyFirstNoseText(state)),
  ];
  if (state.chase) rows.push(pair('chase', 'Chase', 'result', chaseText(blue), chaseText(red)));
  rows.push(text('winner', 'Winner', 'result', winnerText(state)));
  return rows;
}

/** A signed whole number of feet per second, "+12 ft/s". */
const signedFtps = (x) => `${x >= 0 ? '+' : '-'}${formatWholeFt(Math.abs(x))} ft/s`;

/**
 * More detail in Energy mode: true airspeed, climb angle, bank, specific excess power (Ps, ft/s: how fast the aircraft
 * is gaining or losing energy) and energy height (altitude + V²/2g), then each aircraft's off-nose angle (ATA), the heading
 * crossing angle and the time since the pass.
 */
export function energyMoreRows(state) {
  const { blue, red } = state;
  return [
    pair('tas', 'Speed (TAS)', 'more', `${round(blue.ktas)} kt`, `${round(red.ktas)} kt`),
    pair('climb', 'Climb angle', 'more', `${blue.climbDeg.toFixed(0)}°`, `${red.climbDeg.toFixed(0)}°`),
    pair('bank', 'Bank', 'more', `${blue.bankDeg.toFixed(0)}°`, `${red.bankDeg.toFixed(0)}°`),
    pair('ps', 'Ps (specific excess power)', 'more', signedFtps(blue.psFtps), signedFtps(red.psFtps)),
    pair('energyHeight', 'Energy height', 'more', `${formatWholeFt(blue.energyHeightFt)} ft`, `${formatWholeFt(red.energyHeightFt)} ft`),
    pair('offNose', 'Off-nose angle (ATA)', 'more', `${state.ataBlueDeg.toFixed(0)}°`, `${state.ataRedDeg.toFixed(0)}°`),
    text('angleOff', 'Angle-off (HCA)', 'more', `${state.headingCrossDeg.toFixed(0)}°`),
    text('sinceMerge', 'Time since the pass', 'more', `${Math.max(0, state.timeSec - (state.mergeSec ?? state.timeSec)).toFixed(1)} s`),
  ];
}

/** A whole number of feet, for the text alternative of the altitude graph. */
const feet = (ft) => `${formatWholeFt(ft)} ft`;

/**
 * The side view's text alternative, one line: "Altitude now: Blue 9,400 ft, Red 8,800 ft. Hard deck 6,000 ft." For screen
 * readers, and for anyone who wants the numbers.
 */
export function altitudeSummary(state) {
  return `Altitude at T+${state.timeSec.toFixed(1)}: Blue ${feet(state.blue.altFt)}, Red ${feet(state.red.altFt)}. Hard deck ${feet(state.setup.hardDeckFt)}.`;
}

/** Seconds between the rows of the altitude table. */
export const ALTITUDE_TABLE_STEP_SEC = 10;

/**
 * The altitude table: a row every ALTITUDE_TABLE_STEP_SEC of fight time from T+0, and the latest point last, each
 * { timeSec, blueFt, redFt } from the trails (a point every 0.1 s). The graph's data as text.
 */
export function altitudeRows(trails, stepSec = ALTITUDE_TABLE_STEP_SEC) {
  const rows = [];
  const n = Math.min(trails.blue.length, trails.red.length);
  let next = 0;
  for (let i = 0; i < n; i++) {
    const { timeSec } = trails.blue[i];
    if (timeSec + 1e-9 >= next) {
      rows.push({ timeSec, blueFt: trails.blue[i].zFt, redFt: trails.red[i].zFt });
      next = Math.round(timeSec / stepSec) * stepSec + stepSec;
    }
  }
  const last = n - 1;
  if (last > 0 && rows.length && rows.at(-1).timeSec < trails.blue[last].timeSec - 1e-9) {
    rows.push({ timeSec: trails.blue[last].timeSec, blueFt: trails.blue[last].zFt, redFt: trails.red[last].zFt });
  }
  return rows;
}
