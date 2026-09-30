// The DFP list (R17, #25): add a debrief focus point at the current time, go
// to one, step to the previous or next in time order, and open a row to
// rename it, write its note or delete it. Labels and notes are the user's
// text and only ever go in as text. The list itself lives in index.js; this
// draws it and reports what the user did.
import { h, clear } from '../../ui-kit/dom.js';
import { dfpLabel, DFP_LIMITS } from './dfp.js';

/**
 * time: app.time (for the Zulu/local label). on: { add(), go(dfp), previous(),
 * next(), rename(id, text), note(id, text), remove(id) }.
 * Returns { element, render(list, enabled) }.
 */
export function createDfpPanel({ time, on }) {
  let openId = null;
  let list = [];
  let enabled = false;

  const add = h('button', { type: 'button', class: 'button', onclick: () => on.add() }, '+ Add');
  const previous = h('button', { type: 'button', class: 'button', 'aria-label': 'Previous DFP', onclick: () => on.previous() }, '◀');
  const next = h('button', { type: 'button', class: 'button', 'aria-label': 'Next DFP', onclick: () => on.next() }, '▶');
  const items = h('ul', { class: 'dfp-list', 'aria-label': 'DFPs' });
  const hint = h('p', { class: 'debrief-hint' });
  const element = h(
    'section',
    { class: 'dfp-panel', 'aria-labelledby': 'debrief-dfp-title' },
    h('div', { class: 'dfp-head' }, h('h2', { id: 'debrief-dfp-title' }, 'DFPs'), add, previous, next),
    hint,
    items,
  );

  const when = (t) => time.ordered(new Date(Math.floor(t) * 1000))[0];

  function row(dfp) {
    const label = dfpLabel(list, dfp);
    const isOpen = openId === dfp.id;
    const go = h('button', { type: 'button', class: 'dfp-go', dataset: { focusKey: `go-${dfp.id}` }, onclick: () => on.go(dfp) },
      h('span', { class: 'dfp-label' }, label), ' ', h('span', { class: 'dfp-time' }, when(dfp.t)));
    const edit = h('button', {
      type: 'button', class: 'dfp-edit', 'aria-expanded': String(isOpen), 'aria-label': `Edit ${label}`,
      dataset: { focusKey: `edit-${dfp.id}` },
      onclick: () => {
        openId = isOpen ? null : dfp.id;
        render(list, enabled);
      },
    }, isOpen ? 'Close' : 'Edit');
    const li = h('li', { class: 'dfp-row' }, h('div', { class: 'dfp-line' }, go, edit));
    if (isOpen) {
      const id = `dfp-${dfp.id}`;
      const name = h('input', {
        type: 'text', id: `${id}-label`, maxlength: String(DFP_LIMITS.label), value: dfp.label ?? '',
        placeholder: label, dataset: { focusKey: `label-${dfp.id}` },
      });
      name.addEventListener('change', () => on.rename(dfp.id, name.value));
      const note = h('textarea', { id: `${id}-note`, rows: '3', maxlength: String(DFP_LIMITS.note), dataset: { focusKey: `note-${dfp.id}` } });
      note.value = dfp.note;
      note.addEventListener('change', () => on.note(dfp.id, note.value));
      li.append(h(
        'div',
        { class: 'dfp-details' },
        h('label', { for: name.id }, 'Name'), name,
        h('label', { for: note.id }, 'Note'), note,
        h('button', { type: 'button', class: 'button', onclick: () => on.remove(dfp.id) }, `Delete ${label}`),
      ));
    }
    return li;
  }

  // The rows as drawn: which DFPs in which order, and which one is open.
  let drawn = '';
  const shape = () => JSON.stringify([openId, list.map((d) => d.id)]);

  // A new name or note keeps the same rows, so only their words change and
  // the keyboard stays where it is (Tab from a name goes on to its note).
  function relabel() {
    for (const [i, dfp] of list.entries()) {
      const li = items.children[i];
      const label = dfpLabel(list, dfp);
      li.querySelector('.dfp-label').textContent = label;
      li.querySelector('.dfp-edit').setAttribute('aria-label', `Edit ${label}`);
      const details = li.querySelector('.dfp-details');
      if (details) {
        details.querySelector('input').placeholder = label;
        details.querySelector('.button').textContent = `Delete ${label}`;
      }
    }
  }

  function render(nextList, isEnabled) {
    list = nextList;
    enabled = isEnabled;
    if (!list.some((d) => d.id === openId)) openId = null;
    const focused = /** @type {HTMLElement | null} */ (document.activeElement)?.dataset?.focusKey;
    if (shape() === drawn) relabel();
    else {
      drawn = shape();
      clear(items);
      for (const dfp of list) items.append(row(dfp));
    }
    add.disabled = !enabled || list.length >= DFP_LIMITS.count;
    previous.disabled = next.disabled = !enabled || !list.length;
    hint.textContent = !enabled ? 'Load a flight to mark debrief focus points.'
      : list.length ? '' : 'Press + Add to mark this moment.';
    hint.hidden = !hint.textContent;
    if (focused && !element.contains(document.activeElement)) element.querySelector(`[data-focus-key="${focused}"]`)?.focus();
  }

  render([], false);
  return { element, render };
}
