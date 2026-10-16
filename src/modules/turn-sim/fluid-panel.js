// The fluid manoeuvring group (spec section 10.3, TS-57): Lead's buttons while fluid manoeuvring runs, its settings
// behind "Fluid settings", and the card's fluid lines (what Lead flies, #2's pursuit, range, aspect, HCA, closure, the
// cone state and the flags). The baseline Patrick asked for (21:44Z): level turns with a bank choice, wings level, a
// reversal and Terminate; from V2.18 climb and descend, and the loop; from V2.19 the wingovers, the barrel roll and the SMM's standard sequence. Everything is built with h(), so all text goes in as text. Flags are never walls.
import { h, clear } from '../../ui-kit/dom.js';
import { FLUID, LEVEL_BANKS, PURSUIT_WORDS, checkFluidRange } from './live/fluid.js';
import { FW_MOVES } from './live/formation-turns.js';

/** Lead's buttons, in screen order. dir +1 left, -1 right for the sided ones. */
export const FLUID_BUTTONS = Object.freeze([
  { key: 'levelTurn', dir: 1, label: 'Level turn L' },
  { key: 'levelTurn', dir: -1, label: 'Level turn R' },
  { key: 'wingsLevel', dir: 1, label: 'Wings level' },
  { key: 'reversal', dir: 1, label: 'Reversal' },
  { key: 'climb', dir: 1, label: 'Climb' },
  { key: 'descend', dir: 1, label: 'Descend' },
  { key: 'loop', dir: 1, label: 'Loop' },
  { key: 'wingover', dir: 1, label: 'Wingovers L' },
  { key: 'wingover', dir: -1, label: 'Wingovers R' },
  { key: 'barrelRoll', dir: 1, label: 'Barrel roll L' },
  { key: 'barrelRoll', dir: -1, label: 'Barrel roll R' },
  { key: 'sequence', dir: 1, label: 'Standard sequence L' },
  { key: 'sequence', dir: -1, label: 'Standard sequence R' },
  { key: 'terminate', dir: 1, label: 'Terminate' },
  // #2's move, in its own small group headed "#2", shown only in fighting wing and echelon (TS-71, TS-78, spec section 10.8).
  { key: 'lagRoll', dir: 1, label: 'Lag roll' },
]);
const ft = (n) => `${Math.round(Math.abs(n)).toLocaleString('en-CA')} ft`;
const STATE_TONE = { 'IN POSITION': 'tone-good', 'IN RANGE': 'tone-good', TIGHT: 'tone-caution', STRETCHED: 'tone-caution', 'OUT OF CONE': 'tone-caution' };

/** #2's pursuit in words for the card and the tags: 'LAG', 'PURE', 'LEAD', or what he is doing instead. */
export function pursuitWord(wingCue) {
  if (wingCue === 'entry') return 'INTO THE CONE';
  if (wingCue === 'back to fighting wing') return 'BACK TO FIGHTING WING';
  return PURSUIT_WORDS[wingCue] ?? String(wingCue).toUpperCase();
}

/**
 * The entry and exit speeds of an aerobatic manoeuvre on the card, against its rule (TS-215, TS-221): "Loop: entry
 * 232 KIAS, exit 231 KIAS (at least 200 in, out within 15 kt: TS-221; SMM 7.5 para 12)". At full power there is no speed
 * set-up, so before the pull it says the entry is still to come; an exit off its entry speed adds the card's note.
 */
export function speedsLine(sp) {
  const kt = (n) => `${Math.round(n)} KIAS`;
  const rule = sp.book.minKias != null ? `at least ${sp.book.minKias} in, out within ${sp.book.exitTolKt} kt: ${sp.book.source}` : sp.book.source;
  if (sp.entryKias === null) return `${sp.label}: entry still to come (${rule})`;
  const line = `${sp.label}: entry ${kt(sp.entryKias)}, exit ${sp.exitKias === null ? 'still to come' : kt(sp.exitKias)} (${rule})`;
  return sp.note ? `${line}. ${sp.note}` : line;
}

/**
 * onPress(key, dir): a Lead button. onSettings({ rangeFt?, bank? }): a setting changed (only good values are sent).
 * settings: { rangeFt, bank } to start from. Returns { element, cardElement, update(state), renderCard(state) }.
 */
export function createFluidUi({ onPress, onSettings, settings }) {
  let rangeFt = settings.rangeFt;
  let bank = settings.bank;

  const buttons = FLUID_BUTTONS.map((b) => h('button', {
    type: 'button',
    class: 'button ts-change-button ts-fluid-button',
    dataset: { fluid: b.key, dir: String(b.dir) },
    disabled: true,
    onclick: () => onPress(b.key, b.dir),
  }, b.label));
  // The lag roll is #2's move, not Lead's: it sits in its own group, apart from Lead's buttons.
  const isLag = (def) => def.key === 'lagRoll';
  const lagButtons = buttons.filter((_, i) => isLag(FLUID_BUTTONS[i]));
  const leadButtons = buttons.filter((_, i) => !isLag(FLUID_BUTTONS[i]));

  const bankSelect = h('select', {
    'aria-label': "Lead's level turn bank",
    onchange: () => {
      bank = bankSelect.value;
      onSettings({ bank });
    },
  }, LEVEL_BANKS.map((b) => h('option', { value: b.value, selected: b.value === bank }, b.label)));

  const rangeMessage = h('span', { class: 'ts-hint', role: 'status' });
  const rangeInput = h('input', {
    type: 'number',
    min: String(FLUID.rangeFt.min),
    max: String(FLUID.rangeFt.max),
    step: '50',
    value: String(rangeFt),
    'aria-label': 'Fluid manoeuvring distance, feet',
    onchange: () => {
      const c = checkFluidRange(rangeInput.value);
      if (!c.ok) {
        rangeMessage.textContent = `${c.reason} Kept ${ft(rangeFt)}.`;
        rangeInput.value = String(rangeFt);
        return;
      }
      rangeFt = c.value;
      rangeMessage.textContent = rangeFt > FLUID.rangeFt.goodMax ? `Past ${ft(FLUID.rangeFt.goodMax)}: flown, shown as outside the good part (500-750 ft).` : '';
      onSettings({ rangeFt });
    },
  });
  // The setting "How #2 is flown" (Planned or Live) and the "#2: Planned / Live" button next to Fluid went with the planned
  // wingman (TS-199, 12 Oct 2026): #2 is the live wingman (TS-194).
  const hint = h('p', { class: 'ts-hint' }, 'Lead\'s buttons work once fluid manoeuvring has started from fighting wing. #2 stays in the cone behind Lead; Terminate brings him back to fighting wing.');
  // The "#2 in fighting wing" Tracker / Live setting (TS-202) went once Patrick had flown Live (12 Oct 2026: "Live fighting
  // wing is fine. make it the default and get rid of it"): Lead's fighting wing moves always fly the live law.
  // In the Settings box's "Lead behaviours" since the menu of 14 Oct 2026 (Patrick: the boxes were in different formats);
  // transitions-panel.js puts these fields there under a "Fluid manoeuvring" line.
  const settingsFields = [
    h('label', { class: 'ts-field' }, h('span', { class: 'ts-hint' }, "Fluid: Lead's level turn bank"), bankSelect),
    h('label', { class: 'ts-field' }, h('span', { class: 'ts-hint' }, `Fluid distance (${FLUID.rangeFt.min}-${FLUID.rangeFt.max.toLocaleString('en-CA')} ft, SMM 16.17 para 42)`), rangeInput),
    rangeMessage,
  ];
  const title = h('h3', { class: 'ts-group-title', id: 'ts-fluid-title' }, 'Fluid manoeuvring, Lead');
  const FLUID_HINT = hint.textContent;
  const FW_HINT = "Lead's turns, climbs and descents in fighting wing, at the level turn bank in Settings. #2 stays anywhere in the cone, collapsing toward Lead's six while Lead is banked.";
  const LAG_HINT = "Lag roll: #2 pulls up, rolls over Lead's six and lands in the fighting wing cone on Lead's other side, with Lead wings level.";
  const element = h('section', { class: 'ts-change ts-fluid', 'aria-labelledby': 'ts-fluid-title' },
    title,
    hint,
    h('div', { class: 'ts-change-grid' }, leadButtons),
  );
  // "#2": the lag roll, in fighting wing and echelon, the formations it flies from (TS-78). Shown by update().
  // In the Manoeuvres box since the menu of 14 Oct 2026: no "#2" heading (the #2 box is below), its note on hover.
  const lagElement = h('div', { class: 'ts-change-group ts-lag-group', hidden: true, title: LAG_HINT },
    h('div', { class: 'ts-change-grid' }, lagButtons),
  );

  // ---- the card's lines ----
  const lines = h('ul', { class: 'ts-lines ts-fluid-lines', 'aria-label': 'Fluid manoeuvring', hidden: true });
  const flagList = h('ul', { class: 'ts-lines ts-flags', 'aria-label': 'Fluid flags', hidden: true });
  const cardElement = h('div', { class: 'ts-fluid-card' }, lines, flagList);

  return {
    element,
    /** The small "#2" group holding the lag roll (shown in fighting wing and echelon, hidden in fluid manoeuvring). */
    lagElement,
    /** Fluid settings: Lead's bank and the distance, as fields for the Settings box's Lead behaviours (the menu of 14 Oct 2026). */
    settingsFields,
    cardElement,
    /** Lead's buttons work only while fluid manoeuvring runs; Terminate and the rest grey once Terminate is flown. */
    update(state, where = null) {
      const f = state.fluid;
      // Shown outside fluid manoeuvring only in fighting wing (transitions-panel.js): then it holds Lead's fighting wing
      // moves, the level turns, climbs and descents (TS-70), flown at once. The moves of fluid manoeuvring itself show
      // only while it runs.
      const fw = !f;
      // The lag roll flies from fighting wing or echelon, with fluid manoeuvring not running (formation.js lagRoll).
      lagElement.hidden = Boolean(f) || (where?.key !== 'fw' && where?.key !== 'echelon');
      const now = f?.session.now();
      const ending = Boolean(f) && (now.key === 'terminate' || now.key === 'steady');
      FLUID_BUTTONS.forEach((def, i) => {
        const b = buttons[i];
        b.hidden = isLag(def) ? false : fw && !FW_MOVES[def.key]; // the lag roll's own group does its hiding
        b.disabled = ending;
        b.title = ending ? 'Terminate is being flown' : '';
      });
      const words = fw ? 'Fighting wing, Lead' : 'Fluid manoeuvring, Lead';
      if (title.textContent !== words) title.textContent = words;
      const help = fw ? FW_HINT : FLUID_HINT;
      if (hint.textContent !== help) hint.textContent = help;
    },
    renderCard(state) {
      clear(lines);
      clear(flagList);
      const f = state.fluid;
      lines.hidden = !f?.readouts;
      flagList.hidden = true;
      if (!f?.readouts) return;
      const now = f.session.now();
      const r = f.readouts;
      const closing = Math.abs(r.closureKt) < 1 ? '0 kt' : `${r.closureKt > 0 ? '+' : ''}${Math.round(r.closureKt)} kt`;
      lines.append(
        h('li', {}, `Lead: ${now.label}, ${now.phase}`),
        h('li', {}, `#2: ${pursuitWord(now.wingCue)}`),
        ...(now.speeds ? [h('li', {}, speedsLine(now.speeds))] : []),
        h('li', { class: STATE_TONE[r.state] ?? '' }, `${r.state} · range ${ft(r.rangeFt)} (set ${ft(f.session.rangeFt)}; 500-750 good)`),
        h('li', {}, `Aspect ${Math.round(r.aspectDeg)}° (cone ${FLUID.coneHalfDeg}° each side), HCA ${Math.round(r.hcaDeg)}°, closure ${closing}`),
      );
      flagList.hidden = r.flags.length === 0;
      for (const fl of r.flags) flagList.append(h('li', { class: 'tone-caution' }, fl));
    },
  };
}
