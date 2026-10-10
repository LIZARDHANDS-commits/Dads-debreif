// The pieces of a 3D camera bar: the rows of segmented "pills" and the keyboard-hint line laid over the bottom of a
// 3D view (Traffic's and Turn Sim's look; the Debrief uses these today). The styles belong to the module that uses
// them, under `${prefix}-group`, `${prefix}-pill` and `${prefix}-kbd`. Display only: no flight math.
import { h } from './dom.js';

/**
 * One segmented group of pills where a single one is lit.
 * items: [{ id, label, title? }]. onPick(id) is called on a click (not on the lit pill again).
 * Returns { element, set(active, { disabled }) }: set lights `active` (an id or null) and greys the ids in
 * `disabled` (an object of id -> the reason, shown on hover). Pills are made once; set only changes attributes.
 */
export function createPillGroup({ prefix, label, items, onPick }) {
  const pills = new Map();
  const element = h('div', { class: `${prefix}-group`, role: 'group', 'aria-label': label });
  for (const item of items) {
    const pill = h('button', {
      type: 'button', class: `${prefix}-pill`, 'aria-pressed': 'false', title: item.title ?? '',
    }, item.label);
    pill.addEventListener('click', () => {
      if (!pill.disabled && pill.getAttribute('aria-pressed') !== 'true') onPick(item.id);
    });
    pills.set(item.id, { pill, title: item.title ?? '' });
    element.append(pill);
  }
  return {
    element,
    set(active, { disabled = {} } = {}) {
      for (const [id, entry] of pills) {
        const on = id === active;
        const off = Object.hasOwn(disabled, id);
        const title = off ? disabled[id] : entry.title;
        if (entry.pill.getAttribute('aria-pressed') !== String(on)) entry.pill.setAttribute('aria-pressed', String(on));
        if (entry.pill.disabled !== off) entry.pill.disabled = off;
        if (entry.pill.title !== title) entry.pill.title = title;
      }
    },
  };
}

/**
 * The nodes of a keyboard-hint line from parts: a plain string is text and `{ key: 'C' }` is a key cap, so
 * `[{ key: 'C' }, ' Center look']` reads "C Center look" with the C drawn as a key.
 */
export function hintNodes(prefix, parts) {
  return parts.map((p) => (typeof p === 'string' ? p : h('kbd', { class: `${prefix}-kbd` }, p.key)));
}
