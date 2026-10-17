// "GPS source" in the Flight column, closed at first: one block per loaded ship with where its GPS puck sat (DB-23;
// "GPS puck: Not set / Front cockpit / Rear cockpit") and how its timestamps are read (DB-25; "Timestamps: Snapped to
// GPS second (auto) / As recorded", or "On GPS seconds" when there is nothing to snap, and a "Time shift" in 0.1 s
// steps), and whether its heights are corrected from its ground fixes (DB-28; "Altitude: Corrected from the ground (auto) / As
// recorded") with the check's line under it. Shown only while a flight is loaded. Track names go in as text.
import { h, clear } from '../../ui-kit/dom.js';
import { createPanel } from '../../ui-kit/panel.js';
import { PUCK_CHOICES, puckMoveFt } from './puck.js';
import { TIMESTAMP_CHOICES, SHIFT_LIMITS, timingFound } from './gps-timing.js';
import { clampShift } from '../../flight-data/timing.js';
import { ALTITUDE_CHOICES, altitudeLine, altitudeSourceWords } from './altitude.js';
import { shipName } from './state.js';

/**
 * layout: the remembered layout settings (puckOpen). swatch(slot): the ship's colour swatch. label(slot): its name ("#2", or
 * an exercise's "Viper 2", DB-37).
 * on: { set(slot, seat), setTimestamps(slot, 'auto' | 'recorded'), setShift(slot, seconds), setAltitude(slot, 'auto' | 'recorded') }.
 * Returns { element, setCollapsed, render(flight, pucks, timings, altitudes), setChecks(flight) }.
 */
export function createPuckPanel({ layout, swatch, on, label = (slot) => `#${slot}` }) {
  const panel = createPanel({ title: 'GPS source', collapsed: !layout.get().puckOpen, onToggle: (collapsed) => layout.update({ puckOpen: !collapsed }) });
  panel.element.classList.add('puck-panel');
  panel.element.hidden = true;
  const rows = h('div', { class: 'puck-rows' });
  const source = h('p', { class: 'debrief-hint puck-alt-source' });
  panel.body.append(
    h('p', { class: 'debrief-hint' },
      `Where each ship's portable GPS (a Sentry or similar) sat: set, the ship's positions move from the puck on that cockpit's glareshield to the aircraft, about ${puckMoveFt('front')} ft for the front, ${puckMoveFt('rear')} ft for the rear (estimates). A puck relayed to the iPad can stamp each position a few tenths of a second late; those times are put back on the GPS second. Every ship sits on the same ground while taxiing, so what each reads there against the others is its own height error, taken off its whole flight (+ reads higher than the others).`),
    rows,
    source,
  );
  /** Each shown ship's altitude check line, by slot, updated by setChecks without rebuilding the menus. */
  const checks = new Map();
  const setChecks = (flight) => {
    for (const tr of Object.values(flight?.tracks ?? {})) {
      const el = checks.get(tr.slot);
      if (el) el.textContent = altitudeLine(tr, label);
    }
    source.textContent = altitudeSourceWords(flight);
  };

  const pick = (label, choices, value, onChange) => {
    const select = h('select', { 'aria-label': label }, choices.map((c) => h('option', { value: c.value, selected: value === c.value }, c.label)));
    select.addEventListener('change', () => onChange(select.value));
    return select;
  };

  return {
    element: panel.element,
    setCollapsed: panel.setCollapsed,
    setChecks,
    /**
     * The loaded ships' blocks (flight: the shown flight, whose tracks carry `timing` and `altitude`, or null), with each
     * ship's puck seat from pucks { slot: seat }, timestamp choices from timings { slot: { recorded?, shiftS? } } and
     * altitude choice from altitudes { slot: { recorded? } }.
     */
    render(flight, pucks = {}, timings = {}, altitudes = {}) {
      panel.element.hidden = !flight;
      clear(rows);
      checks.clear();
      source.textContent = '';
      if (!flight) return;
      for (const tr of Object.values(flight.tracks).sort((a, b) => a.slot - b.slot)) {
        const name = shipName(tr.slot, tr.name);
        const puck = pick(`GPS puck for ${label(tr.slot)}`, PUCK_CHOICES, pucks[tr.slot] ?? '', (v) => on.set(tr.slot, v));
        const found = timingFound(tr);
        // Only a track found off the second has a choice to make; any other says what was found.
        const stamps = tr.timing?.kind === 'off'
          ? pick(`Timestamps for ${label(tr.slot)}`, TIMESTAMP_CHOICES, timings[tr.slot]?.recorded ? 'recorded' : 'auto', (v) => on.setTimestamps(tr.slot, v))
          : h('span', { class: 'puck-found' }, found);
        const shift = h('input', {
          type: 'number', min: String(SHIFT_LIMITS.min), max: String(SHIFT_LIMITS.max), step: String(SHIFT_LIMITS.step),
          value: String(timings[tr.slot]?.shiftS ?? 0), 'aria-label': `Time shift for ${label(tr.slot)}, seconds`,
        });
        shift.addEventListener('change', () => {
          shift.value = String(clampShift(shift.value)); // kept within the range, to 0.1 s
          on.setShift(tr.slot, shift.value);
        });
        const altitude = pick(`Altitude for ${label(tr.slot)}`, ALTITUDE_CHOICES, altitudes[tr.slot]?.recorded ? 'recorded' : 'auto', (v) => on.setAltitude(tr.slot, v));
        const check = h('p', { class: 'puck-alt-check' });
        checks.set(tr.slot, check);
        rows.append(h('div', { class: 'puck-ship-block' },
          h('div', { class: 'puck-ship', title: `${label(tr.slot)} ${name}`.trim() }, swatch(tr.slot), label(tr.slot), name ? h('span', { class: 'ship-name' }, ` ${name}`) : ''),
          h('label', { class: 'puck-row' }, h('span', {}, 'GPS puck'), puck),
          h('label', { class: tr.timing?.kind === 'off' ? 'puck-row puck-row-stacked' : 'puck-row', title: tr.timing?.kind === 'off' ? found : null }, h('span', {}, 'Timestamps'), stamps),
          h('label', { class: 'puck-row' }, h('span', {}, `Shift (s, ±${SHIFT_LIMITS.max})`), shift),
          h('label', { class: 'puck-row puck-row-stacked' }, h('span', {}, 'Altitude'), altitude),
          check));
      }
      setChecks(flight);
    },
  };
}
