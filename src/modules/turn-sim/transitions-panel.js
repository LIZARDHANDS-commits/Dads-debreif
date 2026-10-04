// The "Change formation" group of buttons and the Formation card's lines for it (Turn Sim spec
// section 10, TS-53). Everything is built with h(), so all text goes in as text. The flying is
// live/transitions.js; this file is only the screen: buttons that grey out for where the pair is
// now, a Side switch (Keep, L or R), "More" with Line astern and the rejoin kind, and the card's
// "Now:", the rejoin block (range, closure, Lead's clock position, ON LINE / HOT / COLD, height
// against Lead) and the flags. Flags are never walls: the sim flies on and says so.
import { h, clear } from '../../ui-kit/dom.js';
import { FORMATIONS, REJOIN, KIAS_OUTSIDE_LAB, rejoinReadout } from './live/transitions.js';

/** The main buttons, in screen order. Fluid manoeuvring is built later (spec section 10: "coming later"). */
export const CHANGE_BUTTONS = Object.freeze([
  { key: 'lab', label: 'Line abreast' },
  { key: 'fw', label: 'Fighting wing' },
  { key: 'echelon', label: 'Echelon' },
  { key: 'route', label: 'Route' },
  { key: 'fluid', label: 'Fluid manoeuvring', later: true },
]);
const SIDES = Object.freeze([{ value: 'keep', label: 'Keep' }, { value: 'left', label: 'L' }, { value: 'right', label: 'R' }]);
const REJOIN_OPTIONS = Object.freeze([
  { value: 'into', label: 'Turning, Lead turns into #2' },
  { value: 'straight', label: 'Straight ahead' },
]);

const ft = (n) => `${Math.round(Math.abs(n)).toLocaleString('en-CA')} ft`;

/** "Line abreast, right" for the pair as classified now (transitions.js classifyPair). */
export function nowWords(where) {
  const word = FORMATIONS[where.key]?.label;
  if (!word) return 'between formations';
  if (!FORMATIONS[where.key].sided) return word;
  return `${word}, ${where.side > 0 ? 'left' : 'right'}`;
}

/**
 * The flags for the Formation card (spec section 10, "Flags, never walls"): Lead above 4 G in fighting wing and above
 * 3 G in close formation (2 CFFTS Orders B2 ch 8; Gen Book p.11), #2 at or above Lead's height in a rejoin (SMM 12.27
 * para 65), and #2 at its bank cap (an estimate). Returns an array of sentences.
 */
export function changeFlags(state, where) {
  const [lead, wing] = state.aircraft;
  const flags = [];
  const limit = where.key === 'fw' ? 4 : ['echelon', 'route', 'astern'].includes(where.key) ? 3 : Infinity;
  if (lead.g > limit) flags.push(`Lead is pulling ${lead.g.toFixed(1)} G in ${FORMATIONS[where.key].label.toLowerCase()}; the limit is ${limit} G (Orders B2 ch 8).`);
  const c = state.current?.change;
  if (c?.rejoining) {
    const r = rejoinReadout(lead, wing);
    if (r.rangeFt < 2000 && r.aboveLead) flags.push('#2 is at or above Lead\'s height; a rejoin stays below him (SMM 12.27 para 65).');
  }
  if (c && Math.abs(wing.bankDeg) >= REJOIN.bankCapDeg - 0.5 && c.rejoining) flags.push(`#2 is at the ${REJOIN.bankCapDeg}° bank cap (an estimate); flown anyway.`);
  return flags;
}

/**
 * onChange(to, { side, rejoin }): called when a button is pressed. Returns
 * { element, cardElement, update(state, where), renderCard(state, where), values() }.
 */
export function createChangeUi({ onChange }) {
  let side = 'keep';
  let rejoin = 'into';

  const buttons = new Map();
  const makeButton = (b) => {
    const button = h('button', {
      type: 'button',
      class: 'button ts-change-button',
      dataset: { change: b.key },
      disabled: Boolean(b.later),
      title: b.later ? 'Coming later' : '',
      onclick: () => onChange(b.key, { side, rejoin }),
    }, h('span', {}, b.label), b.later ? h('span', { class: 'ts-move-hint' }, 'coming later') : null);
    buttons.set(b.key, button);
    return button;
  };

  const sideButtons = SIDES.map((o) => h('button', {
    type: 'button',
    class: 'button ts-side-button',
    dataset: { side: o.value },
    'aria-pressed': String(o.value === side),
    onclick: () => {
      side = o.value;
      for (const b of sideButtons) b.setAttribute('aria-pressed', String(b.dataset.side === side));
      handlers.sideChanged?.();
    },
  }, o.label));
  const handlers = {};

  const refusal = h('p', { class: 'ts-warning', role: 'status', hidden: true });
  const rejoinSelect = h('select', { 'aria-label': 'Rejoin from line abreast', onchange: () => { rejoin = rejoinSelect.value; } },
    REJOIN_OPTIONS.map((o) => h('option', { value: o.value, selected: o.value === rejoin }, o.label)));
  const more = h('details', { class: 'ts-more' },
    h('summary', {}, 'More'),
    h('div', { class: 'ts-change-grid' }, makeButton({ key: 'astern', label: 'Line astern' })),
    h('label', { class: 'ts-field' }, h('span', { class: 'ts-hint' }, 'Rejoin from line abreast'), rejoinSelect),
    h('p', { class: 'ts-hint' }, `A turning rejoin: Lead slows to ${KIAS_OUTSIDE_LAB} KIAS, waits for closure and turns gently into #2 (SMM 16.20 para 65). #2's bank is capped at ${REJOIN.bankCapDeg}° (an estimate, flagged).`),
  );

  const element = h('section', { class: 'ts-change', 'aria-labelledby': 'ts-change-title' },
    h('h3', { class: 'ts-group-title', id: 'ts-change-title' }, 'Change formation'),
    h('p', { class: 'ts-hint' }, 'The pair flies the manuals\' transition from where it is now. The formation you are in is greyed.'),
    h('div', { class: 'ts-change-grid' }, CHANGE_BUTTONS.map(makeButton)),
    h('div', { class: 'ts-side', role: 'group', 'aria-label': 'Side #2 ends on' }, h('span', { class: 'ts-hint' }, 'Side'), sideButtons),
    refusal,
    more,
  );

  // ---- the card's lines ----
  const nowLine = h('p', { class: 'ts-line ts-now-formation' });
  const rejoinBlock = h('ul', { class: 'ts-lines ts-rejoin', 'aria-label': 'The rejoin', hidden: true });
  const flagList = h('ul', { class: 'ts-lines ts-flags', 'aria-label': 'Flags', hidden: true });
  const cardElement = h('div', { class: 'ts-change-card' }, nowLine, rejoinBlock, flagList);

  return {
    element,
    cardElement,
    onSideChanged: (fn) => (handlers.sideChanged = fn),
    values: () => ({ side, rejoin }),
    /** Greys the button for the formation the pair is in (and, for a sided one, on the side the switch asks for), and shows a refusal. */
    update(state, where) {
      for (const [key, button] of buttons) {
        if (key === 'fluid') continue;
        const here = key === where.key && (key === 'astern' || side === 'keep' || (side === 'left') === (where.side > 0));
        // Line abreast has no side change of its own: a change of side there goes through another formation first.
        const greyed = here || (key === 'lab' && where.key === 'lab');
        button.disabled = greyed;
        button.title = greyed ? 'You are here' : '';
      }
      refusal.textContent = state.refusal ?? '';
      refusal.hidden = !state.refusal;
    },
    renderCard(state, where) {
      const text = `Now: ${nowWords(where)}`;
      if (nowLine.textContent !== text) nowLine.textContent = text;
      const c = state.current?.change;
      clear(rejoinBlock);
      rejoinBlock.hidden = !(c?.rejoining);
      if (c?.rejoining) {
        const r = rejoinReadout(state.aircraft[0], state.aircraft[1]);
        const closing = Math.abs(r.closureKt) < 1 ? '0 kt' : `${r.closureKt > 0 ? '+' : ''}${Math.round(r.closureKt)} kt`;
        rejoinBlock.append(
          h('li', {}, `Range ${ft(r.rangeFt)}, closure ${closing}`),
          h('li', {}, `Lead at ${r.clock}, ${r.line}`),
          h('li', { class: r.aboveLead ? 'tone-caution' : 'tone-good' }, `#2 is ${ft(r.belowFt)} ${r.belowFt > 0 ? 'below' : 'above'} Lead`),
        );
      }
      clear(flagList);
      const flags = changeFlags(state, where);
      flagList.hidden = flags.length === 0;
      for (const f of flags) flagList.append(h('li', { class: 'tone-caution' }, f));
    },
  };
}
