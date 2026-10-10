// "GPS source" in the Flight column, closed at first: one block per loaded ship with where its GPS puck sat (DB-23;
// "GPS puck: Not set / Front cockpit / Rear cockpit") and how its timestamps are read (DB-25; "Timestamps: Snapped to
// GPS second (auto) / As recorded", or "On GPS seconds" when there is nothing to snap, and a "Time shift" in 0.1 s
// steps). Shown only while a flight is loaded. Track names go in as text.
import { h, clear } from '../../ui-kit/dom.js';
import { createPanel } from '../../ui-kit/panel.js';
import { PUCK_CHOICES, puckMoveFt } from './puck.js';
import { TIMESTAMP_CHOICES, SHIFT_LIMITS, timingFound } from './gps-timing.js';
import { clampShift } from '../../flight-data/timing.js';
import { shipName } from './state.js';

/**
 * layout: the remembered layout settings (puckOpen). swatch(slot): the ship's colour swatch.
 * on: { set(slot, seat), setTimestamps(slot, 'auto' | 'recorded'), setShift(slot, seconds) }.
 * Returns { element, setCollapsed, render(flight, pucks, timings) }.
 */
export function createPuckPanel({ layout, swatch, on }) {
  const panel = createPanel({ title: 'GPS source', collapsed: !layout.get().puckOpen, onToggle: (collapsed) => layout.update({ puckOpen: !collapsed }) });
  panel.element.classList.add('puck-panel');
  panel.element.hidden = true;
  const rows = h('div', { class: 'puck-rows' });
  panel.body.append(
    h('p', { class: 'debrief-hint' },
      `Where each ship's portable GPS (a Sentry or similar) sat: set, the ship's positions move from the puck on that cockpit's glareshield to the aircraft, about ${puckMoveFt('front')} ft for the front, ${puckMoveFt('rear')} ft for the rear (estimates). A puck relayed to the iPad can stamp each position a few tenths of a second late; those times are put back on the GPS second.`),
    rows,
  );

  const pick = (label, choices, value, onChange) => {
    const select = h('select', { 'aria-label': label }, choices.map((c) => h('option', { value: c.value, selected: value === c.value }, c.label)));
    select.addEventListener('change', () => onChange(select.value));
    return select;
  };

  return {
    element: panel.element,
    setCollapsed: panel.setCollapsed,
    /**
     * The loaded ships' blocks (flight: the shown flight, whose tracks carry `timing`, or null), with each ship's puck
     * seat from pucks { slot: seat } and timestamp choices from timings { slot: { recorded?, shiftS? } }.
     */
    render(flight, pucks = {}, timings = {}) {
      panel.element.hidden = !flight;
      clear(rows);
      if (!flight) return;
      for (const tr of Object.values(flight.tracks).sort((a, b) => a.slot - b.slot)) {
        const name = shipName(tr.slot, tr.name);
        const puck = pick(`GPS puck for #${tr.slot}`, PUCK_CHOICES, pucks[tr.slot] ?? '', (v) => on.set(tr.slot, v));
        const found = timingFound(tr);
        // Only a track found off the second has a choice to make; any other says what was found.
        const stamps = tr.timing?.kind === 'off'
          ? pick(`Timestamps for #${tr.slot}`, TIMESTAMP_CHOICES, timings[tr.slot]?.recorded ? 'recorded' : 'auto', (v) => on.setTimestamps(tr.slot, v))
          : h('span', { class: 'puck-found' }, found);
        const shift = h('input', {
          type: 'number', min: String(SHIFT_LIMITS.min), max: String(SHIFT_LIMITS.max), step: String(SHIFT_LIMITS.step),
          value: String(timings[tr.slot]?.shiftS ?? 0), 'aria-label': `Time shift for #${tr.slot}, seconds`,
        });
        shift.addEventListener('change', () => {
          shift.value = String(clampShift(shift.value)); // kept within the range, to 0.1 s
          on.setShift(tr.slot, shift.value);
        });
        rows.append(h('div', { class: 'puck-ship-block' },
          h('div', { class: 'puck-ship', title: `#${tr.slot} ${name}`.trim() }, swatch(tr.slot), `#${tr.slot}`, name ? h('span', { class: 'ship-name' }, ` ${name}`) : ''),
          h('label', { class: 'puck-row' }, h('span', {}, 'GPS puck'), puck),
          h('label', { class: tr.timing?.kind === 'off' ? 'puck-row puck-row-stacked' : 'puck-row', title: tr.timing?.kind === 'off' ? found : null }, h('span', {}, 'Timestamps'), stamps),
          h('label', { class: 'puck-row' }, h('span', {}, `Shift (s, ±${SHIFT_LIMITS.max})`), shift)));
      }
    },
  };
}
