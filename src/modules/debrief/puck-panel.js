// "GPS puck" in the Flight column (DB-23; Dad's ask, 10 Oct 2026), closed at first: one row per loaded ship, "GPS
// puck: Not set / Front cockpit / Rear cockpit". Shown only while a flight is loaded. Track names go in as text.
import { h, clear } from '../../ui-kit/dom.js';
import { createPanel } from '../../ui-kit/panel.js';
import { PUCK_CHOICES, puckMoveFt } from './puck.js';
import { shipName } from './state.js';

/**
 * layout: the remembered layout settings (puckOpen). swatch(slot): the ship's colour swatch. on: { set(slot, seat) }.
 * Returns { element, setCollapsed, render(flight, pucks) }.
 */
export function createPuckPanel({ layout, swatch, on }) {
  const panel = createPanel({ title: 'GPS puck', collapsed: !layout.get().puckOpen, onToggle: (collapsed) => layout.update({ puckOpen: !collapsed }) });
  panel.element.classList.add('puck-panel');
  panel.element.hidden = true;
  const rows = h('div', { class: 'puck-rows' });
  panel.body.append(
    h('p', { class: 'debrief-hint' },
      `Where each ship's portable GPS (a Sentry or similar) sat. Set, the ship's positions move from the puck on that cockpit's glareshield to the aircraft: about ${puckMoveFt('front')} ft for the front, ${puckMoveFt('rear')} ft for the rear (estimates).`),
    rows,
  );

  return {
    element: panel.element,
    setCollapsed: panel.setCollapsed,
    /** The loaded ships' rows (flight: the as-loaded flight, or null), with each ship's choice from pucks { slot: seat }. */
    render(flight, pucks = {}) {
      panel.element.hidden = !flight;
      clear(rows);
      if (!flight) return;
      for (const tr of Object.values(flight.tracks).sort((a, b) => a.slot - b.slot)) {
        const select = h(
          'select',
          { 'aria-label': `GPS puck for #${tr.slot}` },
          PUCK_CHOICES.map((c) => h('option', { value: c.value, selected: (pucks[tr.slot] ?? '') === c.value }, c.label)),
        );
        select.addEventListener('change', () => on.set(tr.slot, select.value));
        const name = shipName(tr.slot, tr.name);
        rows.append(h('label', { class: 'puck-row' },
          h('span', { class: 'puck-ship', title: `#${tr.slot} ${name}`.trim() }, swatch(tr.slot), `#${tr.slot}`, name ? h('span', { class: 'ship-name' }, ` ${name}`) : ''),
          select));
      }
    },
  };
}
