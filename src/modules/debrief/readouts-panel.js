// The Formation column's contents (SPEC-debrief: The screen, R22): the
// Formation card, one line per wingman and one for Lead, always shown; and
// "More detail", closed by default, with live data per ship, each wingman
// seen from Lead, and spacing for every pair. Rows come from readouts.js.
import { h, clear } from '../../ui-kit/dom.js';
import { createPanel } from '../../ui-kit/panel.js';
import { formationText, leadText, shipDetailText, vsLeadText, pairText } from './readouts.js';
import { shipName } from './state.js';

/**
 * layout: the remembered layout settings (moreDetail). swatch(slot): a ship's
 * colour dot. Returns { element, render(readouts, flight) }.
 */
export function createReadoutsPanel({ layout, swatch }) {
  const card = h('ul', { class: 'formation-card', 'aria-label': 'Formation' });
  const more = createPanel({ title: 'More detail', collapsed: !layout.get().moreDetail, onToggle: (collapsed) => layout.update({ moreDetail: !collapsed }) });
  more.element.classList.add('more-detail');
  const element = h('div', { class: 'readouts' }, card, more.element);

  const line = (slot, { text, tone }) =>
    h('li', { class: `tone-${tone}` }, swatch(slot), h('strong', {}, `#${slot}`), ' ', h('span', {}, text));

  function render(r, flight) {
    clear(card);
    clear(more.body);
    if (!flight) {
      card.append(h('li', { class: 'debrief-hint' }, 'Each wingman\'s position against the standards shows here once a flight is loaded.'));
      more.body.append(h('p', { class: 'debrief-hint' }, 'Altitude, speed, G, pitch, bank, aspect, HCA, closure and spacing show here once a flight is loaded.'));
      return;
    }
    for (const row of r.formation) card.append(line(row.slot, formationText(row)));
    const lead = leadText(r.lead);
    if (lead) card.append(h('li', { class: `tone-${lead.tone}` }, swatch(1), h('span', {}, lead.text)));
    if (!r.lead) card.append(h('li', { class: 'debrief-hint' }, 'Load a track as #1 (Lead) to judge the formation.'));

    const names = Object.fromEntries(Object.values(flight.tracks).map((tr) => [tr.slot, shipName(tr.slot, tr.name)]));
    more.body.append(h('h3', {}, 'Live data'));
    for (const ship of r.ships) {
      more.body.append(
        h('h4', {}, swatch(ship.slot), `#${ship.slot} `, h('span', { class: 'ship-name' }, names[ship.slot])),
        h('ul', { class: 'detail-lines' }, shipDetailText(ship).map((text) => h('li', {}, text))),
      );
    }
    if (r.vsLead.length) {
      more.body.append(
        h('h3', {}, 'From Lead'),
        h('ul', { class: 'detail-lines' }, r.vsLead.map((row) => h('li', {}, h('strong', {}, `#${row.slot} `), vsLeadText(row)))),
      );
    }
    if (r.pairs.length) {
      more.body.append(
        h('h3', {}, 'Spacing'),
        h('ul', { class: 'detail-lines' }, r.pairs.map((pair) => h('li', {}, pairText(pair)))),
        h('p', { class: 'debrief-hint' }, 'Positive closure means the range is shrinking; negative means it is opening.'),
      );
    }
  }

  return {
    element,
    render,
    setCollapsed: (collapsed) => more.setCollapsed(collapsed),
  };
}
