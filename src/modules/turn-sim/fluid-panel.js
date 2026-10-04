// The fluid manoeuvring group (spec section 10.3, TS-57): Lead's buttons while fluid manoeuvring runs, its settings
// behind "Fluid settings", and the card's fluid lines (what Lead flies, #2's pursuit, range, aspect, HCA, closure, the
// cone state and the flags). The baseline Patrick asked for (21:44Z): level turns with a bank choice, wings level, a
// reversal and Terminate. Everything is built with h(), so all text goes in as text. Flags are never walls.
import { h, clear } from '../../ui-kit/dom.js';
import { FLUID, LEVEL_BANKS, PURSUIT_WORDS, checkFluidRange } from './live/fluid.js';

/** Lead's buttons, in screen order. dir +1 left, -1 right for the sided ones. */
export const FLUID_BUTTONS = Object.freeze([
  { key: 'levelTurn', dir: 1, label: 'Level turn L' },
  { key: 'levelTurn', dir: -1, label: 'Level turn R' },
  { key: 'wingsLevel', dir: 1, label: 'Wings level' },
  { key: 'reversal', dir: 1, label: 'Reversal' },
  { key: 'terminate', dir: 1, label: 'Terminate' },
]);
/** How #2 is flown: Planned (scripted, the default) or Live (his own physics, a later piece). */
export const WINGMAN_METHODS = Object.freeze([
  { value: 'planned', label: 'Planned' },
  { value: 'live', label: 'Live (coming later)', later: true },
]);

const ft = (n) => `${Math.round(Math.abs(n)).toLocaleString('en-CA')} ft`;
const STATE_TONE = { 'IN POSITION': 'tone-good', TIGHT: 'tone-caution', STRETCHED: 'tone-caution', 'OUT OF CONE': 'tone-caution' };

/** #2's pursuit in words for the card and the tags: 'LAG', 'PURE', 'LEAD', or what he is doing instead. */
export function pursuitWord(wingCue) {
  if (wingCue === 'entry') return 'INTO THE CONE';
  if (wingCue === 'back to fighting wing') return 'BACK TO FIGHTING WING';
  return PURSUIT_WORDS[wingCue] ?? String(wingCue).toUpperCase();
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
  const methodSelect = h('select', { 'aria-label': 'How #2 is flown' },
    WINGMAN_METHODS.map((m) => h('option', { value: m.value, selected: m.value === 'planned', disabled: Boolean(m.later) }, m.label)));

  const hint = h('p', { class: 'ts-hint' }, 'Lead\'s buttons work once fluid manoeuvring has started from fighting wing. #2 stays in the cone behind Lead; Terminate brings him back to fighting wing.');
  const more = h('details', { class: 'ts-more' },
    h('summary', {}, 'Fluid settings'),
    h('label', { class: 'ts-field' }, h('span', { class: 'ts-hint' }, "Lead's level turn bank"), bankSelect),
    h('label', { class: 'ts-field' }, h('span', { class: 'ts-hint' }, `Distance (${FLUID.rangeFt.min}-${FLUID.rangeFt.max.toLocaleString('en-CA')} ft, SMM 16.17 para 42)`), rangeInput),
    rangeMessage,
    h('label', { class: 'ts-field' }, h('span', { class: 'ts-hint' }, 'How #2 is flown'), methodSelect),
  );
  const element = h('section', { class: 'ts-change ts-fluid', 'aria-labelledby': 'ts-fluid-title' },
    h('h3', { class: 'ts-group-title', id: 'ts-fluid-title' }, 'Fluid manoeuvring, Lead'),
    hint,
    h('div', { class: 'ts-change-grid' }, buttons),
    more,
  );

  // ---- the card's lines ----
  const lines = h('ul', { class: 'ts-lines ts-fluid-lines', 'aria-label': 'Fluid manoeuvring', hidden: true });
  const flagList = h('ul', { class: 'ts-lines ts-flags', 'aria-label': 'Fluid flags', hidden: true });
  const cardElement = h('div', { class: 'ts-fluid-card' }, lines, flagList);

  return {
    element,
    cardElement,
    /** Lead's buttons work only while fluid manoeuvring runs; Terminate and the rest grey once Terminate is flown. */
    update(state) {
      const f = state.fluid;
      const now = f?.session.now();
      const ending = !f || now.key === 'terminate' || now.key === 'steady';
      for (const b of buttons) {
        b.disabled = ending;
        b.title = !f ? 'Start fluid manoeuvring from fighting wing first' : ending ? 'Terminate is being flown' : '';
      }
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
        h('li', { class: STATE_TONE[r.state] ?? '' }, `${r.state} · range ${ft(r.rangeFt)} (set ${ft(f.session.rangeFt)}; 500-750 good)`),
        h('li', {}, `Aspect ${Math.round(r.aspectDeg)}° (cone ${FLUID.coneHalfDeg}° each side), HCA ${Math.round(r.hcaDeg)}°, closure ${closing}`),
      );
      flagList.hidden = r.flags.length === 0;
      for (const fl of r.flags) flagList.append(h('li', { class: 'tone-caution' }, fl));
    },
  };
}
