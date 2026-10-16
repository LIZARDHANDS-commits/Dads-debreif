// The Formation column's readouts for any load (DB-37). A load of four files or fewer is today's one Formation card and
// More detail (readouts-panel.js), untouched. An exercise has one closed block per flight, headed by its call sign and
// aircraft, each holding that flight's own card and More detail from the same readouts-panel.js; only the watched
// flight's block is open, and opening another makes it the watched flight. Rows come from readouts.js through
// exercise.js readoutsByFlight, numbered 1 to 4 inside their flight.
import { h, clear } from '../../ui-kit/dom.js';
import { createPanel } from '../../ui-kit/panel.js';
import { createReadoutsPanel } from './readouts-panel.js';
import { slotOf, subFlight } from './exercise.js';

/**
 * layout: the remembered layout settings (moreDetail). swatch(slot, look): a ship's colour dot (the exercise's slot).
 * onWatch(f): a flight's block was opened, so it becomes the watched flight.
 * Returns { element, render(readouts, flight, extra, look, watched), setCollapsed(moreDetailClosed) }.
 */
export function createFormationReadouts({ layout, swatch, onWatch = /** @type {(f: number) => void} */ (() => {}) }) {
  let look = null;
  const single = createReadoutsPanel({ layout, swatch: (slot) => swatch(slot, look) });
  const blocksBox = h('div', { class: 'flight-blocks', hidden: true });
  const element = h('div', { class: 'formation-readouts' }, single.element, blocksBox);
  /** Each flight's block: { f, key, panel, readouts, note }. Built again only when the flights or their names change. */
  let blocks = [];
  let blocksKey = '';
  let shownWatched = null;
  let moreClosed = !layout.get().moreDetail;

  function build(groups) {
    clear(blocksBox);
    blocks = groups.map((g) => {
      // The aircraft only once one is set for the flight; "As 3D settings" says nothing new.
      const title = g.type ? `${g.callSign} · ${g.words}` : g.callSign;
      const panel = createPanel({ title, collapsed: true, onToggle: (collapsed) => { if (!collapsed) onWatch(g.f); } });
      panel.element.classList.add('flight-block');
      const swatchHere = h('span', { class: 'flight-block-swatch' }, swatch(slotOf(g.f, 1), look));
      panel.button.prepend(swatchHere);
      const readouts = createReadoutsPanel({ layout, swatch: (n) => swatch(slotOf(g.f, n), look), label: (n) => `${g.callSign} ${n}` });
      readouts.setCollapsed(moreClosed);
      const note = h('p', { class: 'debrief-hint', hidden: true });
      panel.body.append(note, readouts.element);
      blocksBox.append(panel.element);
      return { f: g.f, panel, readouts, note };
    });
    shownWatched = null;
  }

  /**
   * r: readoutsAt's result for a four-ship load, or for an exercise { flights: [{ f, slots, readouts, leadWind }] }.
   * nextLook: exercise.js shipLook's. watched: the watched flight's number.
   */
  function render(r, flight, extra = {}, nextLook = null, watched = 1) {
    look = nextLook;
    if (!look?.exercise || !flight) {
      single.element.hidden = false;
      blocksBox.hidden = true;
      single.render(r, flight, extra);
      return;
    }
    single.element.hidden = true;
    blocksBox.hidden = false;
    const key = look.flights.map((g) => `${g.f}|${g.callSign}|${g.type}`).join(';');
    if (key !== blocksKey) {
      blocksKey = key;
      build(look.flights);
    }
    if (watched !== shownWatched) {
      shownWatched = watched;
      for (const b of blocks) b.panel.setCollapsed(b.f !== watched);
    }
    for (const b of blocks) {
      const one = r?.flights?.find((x) => x.f === b.f);
      const ships = one?.slots.length ?? 0;
      // Fewer than two ships, or no Lead: shown but not judged, saying why (DB-37).
      const why = !one ? 'No ships loaded in this flight.'
        : ships < 2 ? 'Not judged: only one ship in this flight.'
          : !one.slots.includes(slotOf(b.f, 1)) ? 'Not judged: no Lead (#1) in this flight.' : '';
      b.note.textContent = why;
      b.note.hidden = !why;
      b.readouts.element.hidden = Boolean(why) && ships < 2;
      if (one && !(ships < 2)) b.readouts.render(one.readouts, subFlight(flight, b.f), { leadWind: one.leadWind ?? null });
    }
  }

  return {
    element,
    render,
    setCollapsed(closed) {
      moreClosed = closed;
      single.setCollapsed(closed);
      for (const b of blocks) b.readouts.setCollapsed(closed);
    },
  };
}
