// A readout table: the rows from readouts.js as real table cells, text only
// (SPEC-turn-fight, "Readouts": built with h(), never as HTML). Blue and Red
// are labelled B and R as well as coloured, so colour is never the only signal.
// render() can run ten times a second: it rebuilds only when the rows change
// (Climb and dive adds two), and otherwise changes the text that differs.
import { h, clear } from '../../ui-kit/dom.js';

const heading = (letter, name, who) =>
  h('th', { scope: 'col', class: `tf-${who}` }, h('span', { class: 'tf-badge', 'aria-hidden': 'true' }, letter), name);

export function createReadoutTable({ caption }) {
  const body = h('tbody');
  const element = h(
    'table',
    { class: 'tf-readout' },
    h('caption', { class: 'visually-hidden' }, caption),
    h('thead', {}, h('tr', {}, h('td'), heading('B', 'Blue', 'blue'), heading('R', 'Red', 'red'))),
    body,
  );
  let shape = '';
  let cells = []; // the text cells of each row, in row order

  function rebuild(rows) {
    clear(body);
    cells = rows.map((row) => {
      const values = row.text === undefined ? [h('td'), h('td')] : [h('td', { colspan: 2 })];
      body.append(h('tr', { 'data-row': row.id }, h('th', { scope: 'row' }, row.label), ...values));
      return values;
    });
  }

  return {
    element,
    /** Shows `rows` (readouts.js resultRows or moreDetailRows). */
    render(rows) {
      const next = rows.map((r) => `${r.id}:${r.text === undefined ? 2 : 1}`).join();
      if (next !== shape) {
        shape = next;
        rebuild(rows);
      }
      rows.forEach((row, i) => {
        const texts = row.text === undefined ? [row.blue, row.red] : [row.text];
        texts.forEach((text, k) => {
          if (cells[i][k].textContent !== text) cells[i][k].textContent = text;
        });
      });
    },
  };
}
