// A fake of V6's Turn Sim page, so V6's own functions run in Node (R9).
//
// V6 reads every setting from a box: `$('speed').value`. `fakeDollar(settings)`
// builds a `$` that answers the same way from a settings object, and
// `createV6Page(settings)` loads V6's own Turn Sim functions, cut out of
// original/shell.html by v6-source.js, with that `$` and V6's page globals
// (`ac`, `t`, `dt`, `hist`, ...) as their prelude. Golden tests then run V6 and
// the port side by side. The globals and constants are taken from V6's own
// source text, not retyped.
//
// The fake has no canvas and no drawing: `updateReadouts`, `recordBreadcrumbPositions`
// and `console` are stubs, and `resetFormation` (which also fits and draws the
// view) is replaced by `reset()`, which does its numeric part only (V6 line 885).
import { v6Page, v6FunctionText } from './v6-source.js';
import { CLOCK_POSITIONS, aircraftKey } from '../../src/modules/turn-sim/settings.js';

/** Where V6's Turn Sim script starts: functions are looked up after this text. */
export const TURN_SIM_MARKER = 'const FT_PER_NM=6076.12, KTS_TO_FPS';

const clockLabel = (c) => {
  const whole = Math.floor(c);
  return c === 12 ? "12 o'clock" : c % 1 ? `${whole}:30` : `${c} o'clock`;
};

/**
 * V6's boxes (`$(id).value`) from a settings object: the same ids V6's markup
 * has, each holding text like a real input or select does. Ids V6 doesn't have
 * are null, as `document.getElementById` gives.
 */
export function v6Boxes(s, { readsClockTolerance = false } = {}) {
  const text = (v) => String(v);
  const box = (value, extra = {}) => ({ value: text(value), ...extra });
  const clockOptions = CLOCK_POSITIONS.map((c) => ({ value: text(c), text: clockLabel(c) }));
  return {
    formation: box(s.formation),
    spacing: box(s.spacingFt),
    boxAft: box(s.boxAftFt),
    boxStagger: box(s.boxStaggerFt),
    // V6's box is the math heading (0 = east, counter-clockwise); the setting is a compass heading (D45).
    heading: box(90 - s.startHeadingDeg),
    showNm: box(s.showNm ? 'yes' : 'no'),
    offsetBox4TimingMode: box(s.offsetBox4Timing),
    rearCheckEnabled: box(s.rearCheckOn ? 'on' : 'off'),
    rearCheckStart: box(s.rearCheckStartSec),
    rearCheckDir: box(s.rearCheckDir),
    rearCheckAngle: box(s.rearCheckAngleDeg),
    rearCheckHold: box(s.rearCheckHoldSec),
    maneuver: box(s.maneuver),
    dir: box(s.direction),
    speed: box(s.speedKt),
    gload: box(s.baseG),
    turnDeg: box(s.turnDeg),
    triggerMode: box(s.timing),
    baseDelay: box(s.baseDelaySec),
    clockCueAircraft: box(s.clockCueAircraft),
    clockCuePos: box(s.clockCuePos, { options: clockOptions, selectedIndex: CLOCK_POSITIONS.indexOf(Number(s.clockCuePos)) }),
    // V6 line 1498 reads `+$('clockCueTol')`, the box and not its value: NaN, so it always used 4° (issue #32).
    // `readsClockTolerance` makes the box turn into its number, which is what V6 meant to read.
    clockCueTol: box(s.clockCueTolDeg, readsClockTolerance ? { valueOf: () => Number(s.clockCueTolDeg) } : {}),
    clockCueSequence: box(s.clockCueSequence),
    duration: box(s.durationSec),
    moaBoundaryNM: box(s.moaBoundaryNm),
    correction: box(s.correction),
    corrStrength: box(s.correctionStrength),
    solveFor: box(s.solveFor),
    targetSpacing: box(s.targetSpacingFt),
    playbackSpeed: box(1),
    // V6's hidden trigger boxes and the dead shackle box keep V6's markup values.
    shackleDelay: box(2.0),
    headingCue: box(15),
    rangeCue: box(6000),
    bearingCue: box(30),
  };
}

/** A `$` like V6's, answering from `boxes`. */
export function fakeDollar(settings, options) {
  const boxes = v6Boxes(settings, options);
  const $ = (id) => boxes[id] ?? null;
  $.boxes = boxes;
  return $;
}

// The pieces of V6's Turn Sim that make up one run.
const V6_FUNCTIONS = [
  'deg2rad', 'rad2deg', 'speedfps', 'baseG', 'bankFromG', 'turnRadius', 'turnRate',
  'isTwoShip', 'isActiveAircraft', 'activeList',
  'desiredFormationAircraft', 'syncAircraftErrorValues', 'applyErrors',
  'sideOfLeadIn', 'cueTargetForAircraft', 'sideOfAircraftFrom',
  'simulateDelayedTurnFinalPos', 'offsetRightVec', 'offsetFwdVec', 'offsetLatOf',
  'offsetFrontElementOrder', 'searchDelayToTarget', 'computeOffsetBoxPlan',
  'turnDirFromLogic', 'displayedOutsideInOrder', 'tacticalOrderForDelayIn',
  'clockCascadeOrder', 'setupTurnStartsFor', 'setupTurnStarts',
  'updateClockCueStatus', 'updateTimingStatus', 'computeAutoDelay',
  'inferLineAbreastFormFromCurrentState', 'syncFormationDropdownToCurrentState', 'useLeadHeadingAsStartHeading',
  'allAircraftFinishedTurn', 'prepareScenarioFromCurrentPositions', 'prepareScenarioFromCurrentState',
  'relativeBearingDeg', 'normDeg', 'clockToRelativeDeg', 'clockCueCrossed', 'cueSatisfied',
  'rearCheckConfig', 'resetRearCheckState', 'stepRearCheckTurn', 'moveAircraftList',
  'stepSim', 'dist', 'recordHist',
];

/** One statement of V6's source, from its start text to the end of its line. */
function v6Statement(start) {
  const src = v6Page('shell');
  const from = src.indexOf(start, src.indexOf(TURN_SIM_MARKER));
  if (from < 0) throw new Error(`V6 statement not found: ${start}`);
  return src.slice(from, src.indexOf('\n', from));
}

/**
 * D48 (#2's side): the settings V6 needs to fly the same layout. With #2 on Lead's right the port's 4312 is the mirror
 * of V6's, which V6 calls 2134, and the port's 2134 is V6's 4312. V6 has no side box, so the swap is all it needs.
 */
export function v6SettingsForD48(settings) {
  if (settings.twoSide !== 'right') return { ...settings };
  return { ...settings, formation: { weighted: 'weightedReverse', weightedReverse: 'weighted' }[settings.formation] ?? settings.formation };
}

/**
 * D42 (wide and tight measured from Lead): the settings V6 needs to fly the same start positions. V6 moved every
 * aircraft along one fixed direction, so an aircraft whose slot is on the other side of Lead (a negative lateral along
 * V6's "right" vector) gets its Wide and Tight swapped. Lead and the aircraft on the positive side are as they were.
 */
export function v6SettingsForD42(settings) {
  const out = { ...settings };
  const h = (90 - settings.startHeadingDeg) * Math.PI / 180; // V6's box holds the math heading
  const page = createV6Page(settings);
  for (const a of page.v6.desiredFormationAircraft()) {
    const lateral = a.x * Math.cos(h + Math.PI / 2) + a.y * Math.sin(h + Math.PI / 2);
    const key = aircraftKey(a.id, 'lateralDir');
    if (lateral < 0) out[key] = { wide: 'tight', tight: 'wide' }[settings[key]] ?? settings[key];
  }
  return out;
}

/**
 * options.readsClockTolerance: read the Clock tolerance box the way V6 meant to (see v6Boxes).
 *
 * V6's Turn Sim, running against a fake page built from `settings` (the keys of
 * src/modules/turn-sim/settings.js, so pass V6_DEFAULTS plus what differs).
 *
 * Returns V6's functions (`v6`) and small helpers to drive them the way its
 * buttons do: reset() is Reset, play() is the first Play or Step (V6 line 1441),
 * continueLeg() is Play after a finished turn (line 1458), step() is one stepSim.
 */
export function createV6Page(settings, options) {
  const $ = fakeDollar(settings, options);
  const prelude = `
${v6Statement('const FT_PER_NM=6076.12')}
${v6Statement('let ac=[1,2,3,4].map')}
let ghostAc=[]; let AUTO_TURN_STARTS=null;
let running=false,t=0,dt=.05,hist=[];
const console={log(){},error(){}};
const document={getElementById:id=>$(id),querySelectorAll:()=>[]};
function updateReadouts(){}
function recordBreadcrumbPositions(){}
function __reset(){
  const desired=desiredFormationAircraft();
  ac.forEach(a=>{let d=desired.find(x=>x.id===a.id); a.x=d.x;a.y=d.y;a.hdg=d.hdg;a.turnAccum=0;resetRearCheckState(a);a.active=false;a.done=false;a.trail=[];a.minSep=Infinity;a.prevClockCueRel=null;});
  applyErrors(); t=0; hist=[]; ghostAc=[];
}
function __time(){return t}
function __hist(){return hist}
function __ac(){return ac}
`;
  const v6 = new Function('$', `${prelude}\n${V6_FUNCTIONS.map((n) => v6FunctionText(n, { marker: TURN_SIM_MARKER })).join('\n')}\nreturn { ${[...V6_FUNCTIONS, '__reset', '__time', '__hist', '__ac'].join(', ')} };`)($);

  const applyAircraftSettings = () => {
    for (const a of v6.__ac()) {
      const get = (f) => settings[aircraftKey(a.id, f)];
      a.delayErr = get('delayErrSec');
      a.gErr = get('gError');
      a.errorOn = get('positionErrorOn');
      a.latDir = get('lateralDir');
      a.latMag = get('lateralFt');
      a.foreDir = get('foreAftDir');
      a.foreMag = get('foreAftFt');
      a.clockTarget = get('clockTarget');
      a.clockPos = get('clockPos');
      a.turnLogic = get('turnLogic');
      v6.syncAircraftErrorValues(a);
    }
  };
  applyAircraftSettings();

  return {
    v6,
    $,
    /** V6's Reset button, without the drawing. */
    reset: () => v6.__reset(),
    /** The first Play or Step press at t = 0. */
    play: () => v6.prepareScenarioFromCurrentPositions(),
    /** Play or Step after the turn has finished: a new leg from where the aircraft are. */
    continueLeg: () => v6.prepareScenarioFromCurrentState(),
    /** One V6 step (0.05 s unless told otherwise). */
    step: (delta) => (delta === undefined ? v6.stepSim() : v6.stepSim(delta)),
    time: () => v6.__time(),
    aircraft: () => v6.__ac(),
    history: () => v6.__hist(),
  };
}
