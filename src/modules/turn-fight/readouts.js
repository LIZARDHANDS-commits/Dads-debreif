// The Turn Fight's readouts: what V6's `upd` (original/shell.html, lines 4275 to
// 4281) wrote into bfmTime, bfmPhase, bfmPerf and bfmLive, as plain text lines
// built from a fight state (sim.js). V6's rounding is kept exactly; only the
// words differ ("s" for "sec", "Blue at +18.2 s" for "BLUE @ +18.2 sec", a
// hyphen in the phase, thousands separators and no "-0"), and
// tests/golden/turn-fight-sim.test.js lists every difference.
//
// Nothing here touches the page: the screen builds elements from these
// strings with ui-kit's h(), never as HTML (SPEC-turn-fight, "Readouts").
//
// A row is { id, label, group, blue, red } (one text per aircraft) or
// { id, label, group, text } (one text for the fight).
import { ataDeg, rangeFt, sinceMergeSec } from './sim.js';
import { FT_PER_NM } from '../../core/units.js';
import { headingCrossAngleDeg } from '../../core/angles.js';

/**
 * A whole number of feet with thousands separators, V6's `toFixed(0)` rounding.
 * "-0" (a height a hair below zero) reads "0". Returns "1,106" for 1105.6.
 */
export function formatWholeFt(ft) {
  const fixed = ft.toFixed(0);
  if (fixed === '-0') return '0';
  return fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** The fight clock, "T+16.4" (V6 bfmTime, line 4277). */
export function timeText(state) {
  return 'T+' + state.timeSec.toFixed(1);
}

/** The phase: HEAD-TO-HEAD until the merge, then 1-CIRCLE or 2-CIRCLE (V6 bfmPhase, line 4277, which writes "1 CIRCLE" and "2 CIRCLE"). */
export function phaseText(state) {
  if (!state.merged) return state.headOn ? 'HEAD-TO-HEAD' : 'TO THE PASS';
  return state.setup.circles === 1 ? '1-CIRCLE' : '2-CIRCLE';
}

/**
 * Who got first nose-on and when after the merge, "Blue at +18.2 s"; "--" until
 * then (V6 `first`, line 4279). A tie reads "Both at +18.2 s" (Q48).
 */
export function firstNoseText(state) {
  const mark = state.firstNose;
  if (!mark) return '--';
  const who = mark.by === 'both' || mark.both ? 'Both' : mark.by === 'blue' ? 'Blue' : 'Red';
  return `${who} at +${(mark.timeSec - state.mergeSec).toFixed(1)} s`;
}

/** A row with one text per aircraft. */
function pairRow(id, label, group, blue, red) {
  return { id, label, group, blue, red };
}

/** A row with one text for the whole fight. */
function textRow(id, label, group, text) {
  return { id, label, group, text };
}

/**
 * The Result card (SPEC-turn-fight, "Shown by default"): turn rate and turn
 * radius for each aircraft, the range, and first nose-on (V6 bfmPerf lines
 * "Turn rate" and "Turn radius", and bfmLive "Range" and "First nose-on").
 */
export function resultRows(state) {
  const { blue, red } = state.perf;
  return [
    pairRow('turnRate', 'Turn rate', 'result', `${blue.rateDegPerSec.toFixed(1)}°/s`, `${red.rateDegPerSec.toFixed(1)}°/s`),
    pairRow('radius', 'Turn radius', 'result', `${formatWholeFt(blue.radiusFt)} ft`, `${formatWholeFt(red.radiusFt)} ft`),
    textRow('range', 'Range', 'result', `${(rangeFt(state) / FT_PER_NM).toFixed(2)} NM`),
    textRow('firstNose', 'First nose-on', 'result', firstNoseText(state)),
  ];
}

/**
 * The More detail panel: speed, G, 360° time, each aircraft's off-nose angle
 * (ATA; V6's "angle-off", renamed by Q51, and 3D with Climb and dive on), true
 * angle-off (the difference in headings, one number for both, Q51), time since the merge, and with Climb and dive on each
 * aircraft's height change and the height between them. V6 showed the height
 * lines always, reading zero in a level fight.
 */
export function moreDetailRows(state) {
  const { blue, red } = state.perf;
  const turnsAtOnce = state.setup.turnsStart === 'now' || state.setup.turnsAt === 'once' || !state.mergeMark;
  const timeLabel = turnsAtOnce ? 'Time since the turns started' : 'Time since the pass';
  const rows = [
    pairRow('speed', 'Speed', 'more', `${blue.speedKt} kt`, `${red.speedKt} kt`),
    pairRow('g', 'G', 'more', blue.g.toFixed(1), red.g.toFixed(1)),
    pairRow('time360', '360° time', 'more', `${(360 / blue.rateDegPerSec).toFixed(1)} s`, `${(360 / red.rateDegPerSec).toFixed(1)} s`),
    pairRow('offNose', 'Off-nose angle (ATA)', 'more', `${ataDeg(state, state.blue, state.red).toFixed(0)}°`, `${ataDeg(state, state.red, state.blue).toFixed(0)}°`),
    textRow('angleOff', 'Angle-off (HCA)', 'more', `${headingCrossAngleDeg(state.blue.headingRad, state.red.headingRad).toFixed(0)}°`),
    textRow('sinceMerge', timeLabel, 'more', `${sinceMergeSec(state).toFixed(1)} s`),
  ];
  if (state.setup.vertical) {
    rows.push(
      // From each aircraft's own start height (R28: Red may start above or below Blue).
      pairRow('heightChange', 'Height change', 'more', `${formatWholeFt(state.blue.zFt - state.startZFt.blue)} ft`, `${formatWholeFt(state.red.zFt - state.startZFt.red)} ft`),
      textRow('heightBetween', 'Height between', 'more', `${formatWholeFt(Math.abs(state.blue.zFt - state.red.zFt))} ft`),
    );
  }
  return rows;
}

/**
 * The live aspect angle for More detail (R28, SMM 12.2): each aircraft's AA, where
 * the other sits off its tail, 180° when it points at the other and 0° when the
 * other is dead astern. The HCA is the "Angle-off (HCA)" row of `moreDetailRows`
 * (one row, not two), and the range is the Result card's, always in view. Kept
 * apart from `moreDetailRows` so V6's own lines and their golden test stay as they
 * were; the screen shows both in the one More detail table. The AA is measured like
 * the off-nose angle (`ataDeg`), in 3D with Climb and dive on.
 */
export function geometryRows(state) {
  const aspect = (from, other) => `${(180 - ataDeg(state, from, other)).toFixed(0)}°`;
  const bankDeg = (g) => (g > 1.01 ? `${(Math.acos(1 / g) * (180 / Math.PI)).toFixed(0)}°` : '0°');
  return [
    pairRow('aspect', 'Aspect angle (AA)', 'more', aspect(state.blue, state.red), aspect(state.red, state.blue)),
    pairRow('bank', 'Derived bank angle', 'more', bankDeg(state.perf.blue.g), bankDeg(state.perf.red.g)),
  ];
}
