// The 24-hour timeline's DOM (SPEC-sof, "24-hour timeline"): draws timeline-view-model.js's
// answer and decides nothing. Pieces are labelled with their NATO colour state in words as
// well as colour, a piece below the limits is hatched and says "below", and every piece has
// its whole story in words for hover, focus and screen readers. The axis is Zulu first with a
// local row. It is redrawn only when the model's signature changes; the now line moves on its
// own, once a minute, without a redraw. A redraw keeps the piece that had focus, and never
// touches the Waves inputs, which are elsewhere on the page. Everything is text; nothing is HTML.
import { h } from '../../ui-kit/dom.js';
import { createPanel } from '../../ui-kit/panel.js';
import { moveFocus } from './timeline-view-model.js';

const HINT = 'Hover over or focus a piece for its details. The arrow keys step through the pieces.';
const KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

const setText = (el, text) => {
  if (el.textContent !== text) el.textContent = text;
};
const place = (el, left, width) => {
  el.style.left = `${left}%`;
  if (width !== undefined) el.style.width = `${width}%`;
};

/**
 * `collapsed` and `onToggle(collapsed)`: the panel's start state and its callback, so the choice can be kept.
 * Returns { element, render(view) } where `view` is buildTimelineView's answer.
 * @param {{ collapsed?: boolean, onToggle?: (collapsed: boolean) => void }} [args]
 */
export function createTimelineView({ collapsed = false, onToggle } = {}) {
  const panel = createPanel({ title: '24-hour timeline', collapsed, onToggle });
  const title = panel.element.querySelector('.panel-title');
  const problem = h('p', { class: 'sof-tl-problem', hidden: true });
  const axis = h('div', { class: 'sof-tl-axis' });
  const rows = h('div', { class: 'sof-tl-rows', role: 'group', 'aria-label': 'Forecast pieces by airfield. Use the arrow keys to move between them.' });
  const info = h('p', { class: 'sof-tl-info', 'aria-hidden': 'true' }, HINT);
  // The waves' times and marks in words, for a screen reader; the bands are the picture.
  const waveWords = h('p', { class: 'sof-tl-waves visually-hidden', hidden: true });
  const legend = h(
    'p',
    { class: 'sof-tl-legend' },
    'Each piece shows its NATO colour state in words. Hatched and marked "below": below the limits for that airfield. ◆ latest METAR. L landing, +1 landing plus one hour. The line is now.',
  );
  panel.body.append(problem, axis, rows, info, waveWords, legend);
  const element = panel.element;
  element.classList.add('sof-timeline');

  let signature = null;
  let current = null; // the view drawn
  let currentId = null; // the piece that is the tab stop
  let nowLine = null;
  let nowLabel = null;
  let nowMinute = null;

  const pieces = () => [...rows.querySelectorAll('.sof-tl-piece')];
  const pieceOf = (el) => el?.closest?.('.sof-tl-piece') ?? null;

  function showInfo(text) {
    setText(info, text || HINT);
  }

  function makeTick(t, index, count) {
    return h(
      'span',
      { class: `sof-tl-tick${index === 0 ? ' is-first' : index === count - 1 ? ' is-last' : ''}` },
      t.dayLabel ? h('span', { class: 'sof-tl-day' }, `${t.dayLabel} `) : null,
      t.label,
    );
  }

  function makeAxis(view) {
    return view.axis.map((a) => {
      const ticks = h('div', { class: 'sof-tl-ticks' });
      a.ticks.forEach((t, i) => {
        const tick = makeTick(t, i, a.ticks.length);
        place(tick, t.left);
        ticks.append(tick);
      });
      return h('div', { class: 'sof-tl-axis-row', dataset: { zone: a.zone } }, h('span', { class: 'sof-tl-axis-label' }, a.label), ticks);
    });
  }

  function makePiece(p) {
    const el = h(
      'span',
      {
        class: `sof-tl-piece nato-${p.nato.toLowerCase()} lane-${p.lane === 0 ? 'main' : 'over'}${p.hatch ? ' is-hatched' : ''}${p.unchecked ? ' is-unchecked' : ''}${p.clippedStart ? ' is-cut-start' : ''}${p.clippedEnd ? ' is-cut-end' : ''}`,
        role: 'img',
        tabindex: '-1',
        'aria-label': p.ariaLabel,
        dataset: { id: p.id, card: p.card },
      },
      h('span', { class: 'sof-tl-piece-label' }, p.label),
    );
    place(el, p.left, p.width);
    el.style.setProperty('--lane', String(p.lane));
    return el;
  }

  function makeRow(r) {
    const track = h('div', { class: 'sof-tl-track' });
    track.style.setProperty('--lanes', String(r.lanes));
    if (r.coverage) {
      const cover = h('span', { class: 'sof-tl-cover', 'aria-hidden': 'true' });
      place(cover, r.coverage.left, r.coverage.width);
      track.append(cover);
    }
    for (const p of r.pieces) track.append(makePiece(p));
    if (r.words) track.append(h('span', { class: 'sof-tl-words' }, r.words));
    if (r.metar) {
      const mark = h('span', { class: 'sof-tl-metar', role: 'img', 'aria-label': r.metar.label, dataset: { card: `${r.icao} ${r.metar.label}` } }, '◆');
      place(mark, r.metar.left);
      track.append(mark);
    }
    return h(
      'div',
      { class: `sof-tl-row is-${r.role.toLowerCase()}`, dataset: { icao: r.icao } },
      h('div', { class: 'sof-tl-label', 'aria-label': r.ariaLabel },
        h('span', { class: 'sof-tl-icao' }, r.icao), ' ', h('span', { class: 'sof-tl-role' }, r.role)),
      track,
    );
  }

  // The wave bands, their landing marks and the now line sit over every row, and never take the pointer.
  function makeOverlay(view) {
    const overlay = h('div', { class: 'sof-tl-overlay', 'aria-hidden': 'true' });
    for (const w of view.waves) {
      const band = h('div', { class: `sof-tl-band${w.clippedStart ? ' is-cut-start' : ''}${w.clippedEnd ? ' is-cut-end' : ''}` }, h('span', { class: 'sof-tl-band-label' }, w.name));
      place(band, w.left, w.width);
      overlay.append(band);
      for (const [mark, text, cls] of [[w.landing, 'L', 'is-landing'], [w.landingPlus1, '+1', 'is-plus1']]) {
        if (!mark.visible) continue;
        const line = h('div', { class: `sof-tl-mark ${cls}` }, h('span', { class: 'sof-tl-mark-label' }, text));
        place(line, mark.left);
        overlay.append(line);
      }
    }
    nowLabel = h('span', { class: 'sof-tl-now-label' });
    nowLine = h('div', { class: 'sof-tl-now', hidden: true }, nowLabel);
    nowMinute = null;
    overlay.append(nowLine);
    return overlay;
  }

  function rebuild(view) {
    const active = document.activeElement;
    const focusedId = rows.contains(active) ? pieceOf(active)?.dataset.id : null;
    setText(title, view.title);
    setText(problem, view.problem ?? '');
    problem.hidden = !view.problem;
    axis.replaceChildren(...makeAxis(view));
    rows.replaceChildren(...view.rows.map(makeRow), makeOverlay(view));
    const words = view.waves.map((w) => w.text).join(' ');
    setText(waveWords, words ? `Waves on this day: ${words}` : '');
    waveWords.hidden = !words;
    // One tab stop for the whole timeline: the piece last on, or the first.
    const all = pieces();
    const stop = all.find((el) => el.dataset.id === (focusedId ?? currentId)) ?? all[0] ?? null;
    currentId = stop?.dataset.id ?? null;
    if (stop) stop.tabIndex = 0;
    if (focusedId && stop?.dataset.id === focusedId) stop.focus({ preventScroll: true });
    else showInfo('');
  }

  function updateNow(now) {
    if (!nowLine) return;
    nowLine.hidden = !now;
    if (!now || now.minute === nowMinute) return;
    nowMinute = now.minute;
    place(nowLine, now.left);
    setText(nowLabel, now.label);
  }

  function render(view) {
    current = view;
    if (view.signature !== signature) {
      signature = view.signature;
      rebuild(view);
    }
    updateNow(view.now);
  }

  function focusPiece(id) {
    const el = pieces().find((p) => p.dataset.id === id);
    if (!el) return;
    for (const p of pieces()) p.tabIndex = -1;
    el.tabIndex = 0;
    currentId = id;
    el.focus();
  }

  rows.addEventListener('focusin', (event) => {
    const piece = pieceOf(event.target);
    if (!piece) return;
    for (const p of pieces()) p.tabIndex = p === piece ? 0 : -1;
    currentId = piece.dataset.id;
    showInfo(piece.dataset.card);
  });
  rows.addEventListener('focusout', (event) => {
    if (!pieceOf(event.relatedTarget)) showInfo('');
  });
  rows.addEventListener('mouseover', (event) => {
    const el = event.target.closest?.('[data-card]');
    if (el) showInfo(el.dataset.card);
  });
  rows.addEventListener('mouseout', (event) => {
    // Back to what has focus (if a piece does), else the hint.
    if (event.relatedTarget?.closest?.('[data-card]')) return;
    const focused = pieceOf(document.activeElement);
    showInfo(focused && rows.contains(focused) ? focused.dataset.card : '');
  });
  rows.addEventListener('keydown', (event) => {
    const piece = pieceOf(event.target);
    if (!piece || !KEYS.has(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault(); // the arrow keys step through the pieces, they don't scroll the page
    const to = current ? moveFocus(current, piece.dataset.id, event.key) : null;
    if (to) focusPiece(to);
  });

  return { element, render };
}
