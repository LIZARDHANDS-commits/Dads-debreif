// The timeline strip along the bottom of the SOF screen (SPEC-sof, "The screen", SOF-38 as changed by Dad on 7 Oct: "the timeline ... only the top 5 %",
// then "along the bottom, like a TV guide"): a slim strip, about 4.5 % of the window's height (never under 40 px), that shows the 24-hour picture in
// miniature and gives the map everything else. It draws timeline-view-model.js's answer (the same one the full timeline draws) and decides nothing.
//
// - The axis (its ticks), the wave bands with their landing marks and the now line are always in view, over the rows.
// - One airfield row shows at a time (two when the strip is tall enough). Every ROLL_MS the rows slide up to the next airfield, cycling through all of
//   them like a channel listing. The roll stops while the pointer is over the strip or focus is in it, while the Expand panel is open, and when the
//   rows are all in view anyway. The slide is a CSS transition that sof.css turns off for reduced motion (the computer's setting, or Settings'
//   "Card videos" choice), and then the rows simply step. It runs on the SOF's scheduler (never setInterval).
// - A row is one slim bar of coloured pieces, each with its NATO colour state in words (hover words and the screen reader's label) and a tiny code
//   on the bar where it fits; a piece below the limits is hatched and starts with ▼.
// - "Timeline ▾/▴" at the left end hides the strip down to a thin handle (the map gets the height); the choice is kept in the module's storage.
// - "Expand ▾" at the right end opens the full timeline (waves header, key and every row) as a drop-down over the screen, upward from the strip.
//
// Everything is text; nothing is HTML. The full timeline's element is handed in and lives inside this strip's element.
import { h } from '../../ui-kit/dom.js';

/** A new row slides in this often (about every 5 s, Dad, 7 Oct). */
export const ROLL_MS = 5000;
/** The slide takes this long (sof.css uses the ui-kit's --motion-duration, 0.4 s); after it the strip may jump back to its first row without anyone seeing. */
const SLIDE_MS = 400;
/** Two rows show when the rows' box is at least this many pixels tall (a tall window); otherwise one. An estimate for readability. */
const TWO_ROWS_PX = 56;
export const STRIP_KEY = 'timelineStrip';

const setText = (el, text) => {
  if (el.textContent !== text) el.textContent = text;
};
const place = (el, left, width) => {
  el.style.left = `${left}%`;
  if (width !== undefined) el.style.width = `${width}%`;
};

/**
 * options: { full (the full timeline's element), dropdowns (dropdown.js's createDropdowns), timers (a scheduler scope), listen (the module's app.listen),
 * storage ({ get(key, fallback), set(key, value) }) }.
 * Returns { element, render(view) } where `view` is buildTimelineView's answer.
 */
export function createTimelineStrip({ full, dropdowns, timers, listen, storage }) {
  const toggle = h('button', { type: 'button', class: 'sof-strip-toggle', 'aria-controls': 'sof-strip-main', onclick: () => setShown(!shown) });
  const expand = h('button', { type: 'button', class: 'sof-strip-expand', 'aria-controls': 'sof-strip-full', onclick: () => expandDrop.toggle() }, 'Expand ▾');
  const axis = h('div', { class: 'sof-strip-axis', 'aria-hidden': 'true' });
  const list = h('div', { class: 'sof-strip-list' });
  const viewport = h('div', { class: 'sof-strip-viewport', role: 'group', 'aria-label': 'Forecast by airfield; the airfields take turns' }, list);
  const overlay = h('div', { class: 'sof-strip-overlay', 'aria-hidden': 'true' });
  const problem = h('p', { class: 'sof-strip-problem', hidden: true });
  const waveWords = h('p', { class: 'visually-hidden' });
  const main = h('div', { class: 'sof-strip-main', id: 'sof-strip-main' }, axis, viewport, overlay, problem, waveWords);
  const panel = h('div', { class: 'sof-strip-full', id: 'sof-strip-full', hidden: true }, full);
  // At a home base with no weather limits: grey "Limits not set for KDLF" beside Expand, the key line on hover (limits-not-set.js).
  const notSet = h('span', { class: 'sof-strip-notset', hidden: true });
  const element = h('section', { class: 'sof-timeline', 'aria-label': '24-hour timeline strip' }, toggle, main, notSet, expand, panel);

  const expandDrop = dropdowns.create({
    scope: element,
    button: expand,
    labels: ['Expand ▾', 'Expand ▴'],
    onToggle: (open) => {
      panel.hidden = !open;
      element.classList.toggle('is-expanded', open);
    },
  });

  // ---- Shown or hidden (kept in the module's storage) -----------------------------------------------------
  let shown = true;
  try {
    const kept = storage?.get(STRIP_KEY, null);
    if (kept && typeof kept === 'object' && kept.shown === false) shown = false;
  } catch {
    // Nothing remembered: the strip starts shown.
  }

  function setShown(next) {
    shown = next;
    try {
      storage?.set(STRIP_KEY, { shown });
    } catch {
      // Not remembered, but it works for this visit.
    }
    if (!shown) expandDrop.close();
    paintShown();
    sizeRows();
  }

  function paintShown() {
    element.classList.toggle('is-hidden', !shown);
    main.hidden = !shown;
    expand.hidden = !shown;
    toggle.setAttribute('aria-expanded', String(shown));
    setText(toggle, shown ? 'Timeline ▾' : 'Timeline ▴');
    toggle.title = shown ? 'Hide the timeline strip: the map gets its height' : 'Show the timeline strip again';
  }
  paintShown();

  // ---- The rows and their roll -----------------------------------------------------------------------------
  let signature = null;
  let rowCount = 0;
  let visibleRows = 1;
  let index = 0; // the first row showing
  let held = false; // the pointer is over the strip, or focus is in it
  let cancelSnap = null;
  let cancelUnsnap = null;
  let nowLine = null;
  let nowMinute = null;

  function setIndex(next, { instant = false } = {}) {
    index = next;
    if (instant) {
      list.classList.add('is-instant');
      list.style.setProperty('--i', String(index));
      cancelUnsnap?.();
      cancelUnsnap = timers.after(40, () => {
        cancelUnsnap = null;
        list.classList.remove('is-instant');
      });
    } else list.style.setProperty('--i', String(index));
  }

  /** How many rows fit in the rows' box (one, or two in a tall window), and the picture of them drawn again if that changed. */
  function sizeRows() {
    if (!shown) return;
    const wanted = viewport.clientHeight >= TWO_ROWS_PX ? 2 : 1;
    if (wanted === visibleRows) return;
    visibleRows = wanted;
    redrawRows();
  }

  function step() {
    if (held || !shown || expandDrop.isOpen || rowCount <= visibleRows) return;
    if (document.hidden) return;
    setIndex(index + 1);
    if (index >= rowCount) {
      // On the copy of the first row(s) now: once the slide has finished, jump back to the real ones with no slide.
      cancelSnap?.();
      cancelSnap = timers.after(SLIDE_MS + 60, () => {
        cancelSnap = null;
        setIndex(0, { instant: true });
      });
    }
  }
  timers.every(ROLL_MS, step);

  element.addEventListener('pointerenter', () => { held = true; });
  element.addEventListener('pointerleave', () => { held = element.contains(document.activeElement); });
  element.addEventListener('focusin', () => { held = true; });
  element.addEventListener('focusout', (event) => { held = !event.relatedTarget ? false : element.contains(event.relatedTarget); });
  listen(window, 'resize', sizeRows);

  // ---- Drawing ---------------------------------------------------------------------------------------------
  let current = null;

  function makeAxis(view) {
    const first = view.axis[0];
    if (!first) return [];
    return first.ticks.map((t, i) => {
      const tick = h('span', { class: `sof-strip-tick${i === 0 ? ' is-first' : i === first.ticks.length - 1 ? ' is-last' : ''}` }, t.label);
      place(tick, t.left);
      return tick;
    });
  }

  function makePiece(p) {
    const label = p.below ? `▼ ${p.nato}` : p.nato;
    const el = h(
      'span',
      {
        class: `sof-strip-piece nato-${p.nato.toLowerCase()} lane-${p.lane === 0 ? 'main' : 'over'}${p.hatch ? ' is-hatched' : ''}${p.unchecked ? ' is-unchecked' : ''}${p.clippedStart ? ' is-cut-start' : ''}${p.clippedEnd ? ' is-cut-end' : ''}`,
        role: 'img',
        title: p.card,
        'aria-label': p.ariaLabel,
      },
      h('span', { class: 'sof-strip-piece-label' }, label),
    );
    place(el, p.left, p.width);
    return el;
  }

  function makeRow(r) {
    const track = h('div', { class: 'sof-strip-track' });
    if (r.coverage) {
      const cover = h('span', { class: 'sof-strip-cover', 'aria-hidden': 'true' });
      place(cover, r.coverage.left, r.coverage.width);
      track.append(cover);
    }
    for (const p of r.pieces) track.append(makePiece(p));
    if (r.words) track.append(h('span', { class: 'sof-strip-words', title: r.words }, r.words));
    if (r.metar) {
      const mark = h('span', { class: 'sof-strip-metar', role: 'img', 'aria-label': r.metar.label, title: `${r.icao} ${r.metar.label}` }, '◆');
      place(mark, r.metar.left);
      track.append(mark);
    }
    return h(
      'div',
      { class: `sof-strip-row is-${r.role.toLowerCase()}`, dataset: { icao: r.icao } },
      h('div', { class: 'sof-strip-label', title: r.ariaLabel, 'aria-label': r.ariaLabel }, h('span', { class: 'sof-strip-icao' }, r.icao)),
      track,
    );
  }

  function makeOverlay(view) {
    const nodes = [];
    for (const w of view.waves) {
      const band = h('div', { class: `sof-strip-band${w.clippedStart ? ' is-cut-start' : ''}${w.clippedEnd ? ' is-cut-end' : ''}`, title: w.text }, h('span', { class: 'sof-strip-band-label' }, w.name));
      place(band, w.left, w.width);
      nodes.push(band);
      for (const [mark, cls, text] of [[w.landing, 'is-landing', 'Landing'], [w.landingPlus1, 'is-plus1', 'Landing plus one hour']]) {
        if (!mark.visible) continue;
        const line = h('div', { class: `sof-strip-mark ${cls}`, title: `${w.name}: ${text}` });
        place(line, mark.left);
        nodes.push(line);
      }
    }
    nowLine = h('div', { class: 'sof-strip-now', hidden: true });
    nowMinute = null;
    nodes.push(nowLine);
    return nodes;
  }

  /** The rows, then a copy of the first row(s) so the roll can slide on past the last one and come round without a jump. */
  function redrawRows() {
    if (!current) return;
    const rows = current.rows.map(makeRow);
    const copies = current.rows.slice(0, visibleRows).map(makeRow);
    for (const copy of copies) {
      copy.setAttribute('aria-hidden', 'true'); // a copy is only for the roll; the screen reader has each airfield once
      copy.classList.add('is-copy');
    }
    rowCount = rows.length;
    list.replaceChildren(...rows, ...(rowCount > visibleRows ? copies : []));
    list.style.setProperty('--rows', String(visibleRows));
    cancelSnap?.();
    cancelSnap = null;
    setIndex(rowCount ? index % rowCount : 0, { instant: true });
  }

  function updateNow(now) {
    if (!nowLine) return;
    nowLine.hidden = !now;
    if (!now || now.minute === nowMinute) return;
    nowMinute = now.minute;
    place(nowLine, now.left);
    nowLine.title = now.label;
  }

  return {
    element,
    render(view) {
      current = view;
      if (view.signature !== signature) {
        signature = view.signature;
        problem.hidden = !view.problem;
        setText(problem, view.problem ?? '');
        // "Limits not set for KNSE", or at a USAF base the rule's source line (plan Step 2c part F), in the same place.
        const baseNote = view.limitsNote ?? view.sourceNote ?? null;
        setText(notSet, baseNote?.words ?? '');
        notSet.title = baseNote?.title ?? '';
        notSet.hidden = !baseNote;
        axis.replaceChildren(...makeAxis(view));
        overlay.replaceChildren(...makeOverlay(view));
        const words = view.waves.map((w) => w.text).join(' ');
        setText(waveWords, words ? `Waves on this day: ${words}` : '');
        redrawRows();
      }
      sizeRows();
      updateNow(view.now);
    },
  };
}
