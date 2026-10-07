// The airfield cards' DOM (SPEC-sof, "Airfield cards"): draws the model from
// cards.js (through screen-model.js) and decides nothing. Report text, which
// comes from outside, only ever goes in as text (h() and textContent), never as HTML.
// A card is redrawn only when what it says has changed, so a screen left open all
// day does no work between refreshes.
//
// SOF-38, as changed by Dad on 7 Oct ("the side 10 %"): the airfields are a narrow column, one compact row each: the ICAO, the flight
// category and a limits mark in words (the symbol never alone). Selecting a row opens that airfield's full card over the screen, as a
// drop-down beside the column: the header, the result for the wave, every caution, the limits and the whole METAR and TAF with their marked
// words (everything the card used to show, Full brief included). The rows are the `article.sof-card` the page's checks look for. Whether a
// card is open is kept for the visit, not stored.
import { h } from '../../ui-kit/dom.js';
import { segments } from './marks.js';
import { tafHeadline } from './taf-line.js';

// Beside the words of the result, never instead of them.
const LEVEL_SYMBOL = { below: '▼', 'at-limit': '●', within: '✓', unknown: '?', none: '–' };

const note = (text, tone) => (text ? h('p', { class: `sof-note${tone ? ` is-${tone}` : ''}` }, text) : null);

// The raw report as text, the words behind a limit or caution in <mark>s. Each mark reads in colour and in words (a
// visually-hidden prefix drawn by sof.css from the mark's class, so it is not in the text and is never copied), and the
// text is the report's own, unchanged. Pieces go in as text nodes only, and the
// class comes from segments()' three fixed levels, never from the report.
function rawText(line) {
  return h('p', { class: 'sof-raw' }, ...segments(line.raw, line.marks).map((seg) => (seg.level
    ? h('mark', { class: `sof-mark is-${seg.level}` }, seg.text)
    : seg.text)));
}

// One report line: its title with the time and age, the raw text as text, and every note in words.
function report(kind, line) {
  const title = line.label ?? kind;
  const closed = line.state === 'closed';
  const stale = line.state === 'stale' || closed;
  return h(
    'section',
    { class: `sof-report sof-${kind.toLowerCase()}${stale ? ' is-stale' : ''}`, dataset: { state: line.state } },
    h('h3', { class: 'sof-report-title' }, title, line.sourceName ? h('span', { class: 'sof-source' }, ` via ${line.sourceName}`) : null),
    line.raw ? rawText(line) : null,
    note(line.staleText, 'bad'),
    note(line.words, line.raw ? null : 'bad'),
    note(line.refreshNote, 'bad'),
    kind === 'TAF' && line.raw ? note(line.ageText) : null,
  );
}

const WAVE_SYMBOL = { ok: '✓', below: '▼', 'at-limit': '●', unknown: '?' };

function waveResult(line) {
  return h('p', { class: `sof-wave-result is-${line.tone}` },
    h('span', { class: 'sof-wave-result-label' }, `${line.label}: `),
    h('span', { class: 'sof-result-symbol', 'aria-hidden': 'true' }, WAVE_SYMBOL[line.tone] ?? '?'), ' ',
    line.words,
    line.reason ? h('span', { class: 'sof-wave-result-reason' }, `. ${line.reason}`) : null);
}

// The compact row's limits mark, in words beside its symbol (never the symbol alone): "✓ within", "⚠ below", "● at limit", "? old", "? unknown", "– no METAR".
const MARK = { below: ['⚠', 'below'], 'at-limit': ['●', 'at limit'], within: ['✓', 'within'], none: ['–', 'no METAR'] };
export function limitsMark(card) {
  const level = card.result.level;
  const [symbol, words] = level === 'unknown' ? ['?', card.result.stale ? 'old' : 'unknown'] : MARK[level] ?? ['?', 'unknown'];
  return { symbol, words, level };
}

// The category chip is the METAR's: a stale one, or one from a closed field's last observation, is grey, its words kept.
const isStaleMetar = (card) => card.metar?.state === 'stale' || card.metar?.state === 'closed';

/** The whole card, as it opens over the screen: everything the card shows (its header, result, cautions, limits and both reports in full). `onClose` is the button's action. */
function fullCard(card, { onClose }) {
  const staleChips = isStaleMetar(card);
  const badges = h(
    'div',
    { class: 'sof-badges' },
    h('span', { class: `sof-badge sof-role is-${card.role.toLowerCase()}` }, card.role),
    card.category
      ? h('span', { class: `sof-badge sof-category cat-${card.category.toLowerCase()}${staleChips ? ' is-stale' : ''}` }, h('span', { class: 'visually-hidden' }, 'Flight category '), card.category)
      : null,
    card.nato
      ? h('span', { class: `sof-badge sof-nato${staleChips ? ' is-stale' : ''}` }, h('span', { class: 'visually-hidden' }, 'NATO colour state '), card.nato)
      : null,
  );
  const close = h('button', { type: 'button', class: 'sof-card-more', onclick: onClose }, 'Close');
  const result = h('div', { class: 'sof-result-row' },
    h('p', { class: `sof-result level-${card.result.level}` }, h('span', { class: 'sof-result-symbol', 'aria-hidden': 'true' }, LEVEL_SYMBOL[card.result.level] ?? ''), ' ', card.result.words),
    close);
  const head = h('header', { class: 'sof-card-head' },
    h('h2', { class: 'sof-card-title' }, h('span', { class: 'sof-icao' }, card.icao), card.name ? h('span', { class: 'sof-name' }, ` ${card.name}`) : null),
    badges);
  // An alternate's result for the selected wave (waves-view-model.js's altLines), in words with its symbol.
  const wave = card.waveLine ? waveResult(card.waveLine) : null;
  return [
    head,
    result,
    wave,
    ...card.cautionReasons.map((reason) => h('p', { class: 'sof-caution' }, `Caution: ${reason}`)),
    h('p', { class: 'sof-limits' }, `${card.limitsLabel}: `, h('span', {}, card.limitsText)),
    note(card.limitsNote, 'info'),
    report('METAR', card.metar),
    report('TAF', card.taf),
    note(card.watchText, 'info'),
  ].filter(Boolean); // replaceChildren would turn a null into the text "null"
}

/**
 * The column of compact rows, and the full card that opens beside it. `dropdowns` is dropdown.js's createDropdowns: the full card is a drop-down like the
 * others (one open at a time; Escape or a press outside closes it and puts focus back on its row).
 * Returns { element, render(cards) }: one `article.sof-card` per airfield, kept in order.
 */
export function createCardsView({ dropdowns } = {}) {
  const list = h('section', { class: 'sof-cards', 'aria-label': 'Airfields' });
  const full = h('article', { class: 'sof-card is-open sof-card-full', id: 'sof-card-full', 'aria-label': 'Airfield card' });
  const drop = h('div', { class: 'sof-card-drop', hidden: true }, full);
  const element = h('div', { class: 'sof-cards-host' }, list, drop);
  const entries = new Map(); // ICAO to { article, button, signature, card }
  let selected = null; // the ICAO whose full card is open
  let fullSignature = null;

  const controller = dropdowns?.create({
    scope: element,
    onToggle: (open) => {
      drop.hidden = !open;
      if (!open) selected = null;
      syncRows();
    },
    focusTarget: () => entries.get(lastOpened)?.button ?? null,
  });
  let lastOpened = null;

  function syncRows() {
    for (const [icao, entry] of entries) entry.button.setAttribute('aria-expanded', String(controller?.isOpen === true && icao === selected));
  }

  function drawFull() {
    const entry = selected ? entries.get(selected) : null;
    if (!entry) return;
    const { card } = entry;
    const signature = JSON.stringify(card);
    if (signature === fullSignature) return;
    fullSignature = signature;
    const hadFocus = full.contains(document.activeElement);
    full.className = `sof-card is-open sof-card-full is-${card.role.toLowerCase()} level-${card.result.level}${isStaleMetar(card) ? ' is-stale' : ''}`;
    full.setAttribute('aria-label', `${card.icao} airfield card`);
    full.replaceChildren(...fullCard(card, { onClose: () => controller?.close({ focus: true }) }));
    // The button is drawn again with the card: focus goes to the new one, never to the page.
    if (hadFocus) full.querySelector('.sof-card-more')?.focus({ preventScroll: true });
  }

  function press(icao) {
    if (!controller) return;
    if (controller.isOpen && selected === icao) return controller.close({ focus: true });
    selected = icao;
    lastOpened = icao;
    fullSignature = null;
    controller.open();
    drop.hidden = false;
    drawFull();
    syncRows();
  }

  /** One compact row: the ICAO, the category chip and the limits mark in words. The whole story is in its hover words and in the full card. */
  function drawRow(entry) {
    const { card } = entry;
    const mark = limitsMark(card);
    const stale = isStaleMetar(card);
    entry.article.className = `sof-card is-${card.role.toLowerCase()} level-${card.result.level}${stale ? ' is-stale' : ''}`;
    const taf = tafHeadline(card.taf);
    const where = card.role === 'HOME' ? 'home' : 'alternate';
    entry.button.title = `${card.icao}${card.name ? ` ${card.name}` : ''}, ${where}. ${card.result.words}. TAF: ${taf.text}. Press for the full card.`;
    entry.button.setAttribute('aria-label', `${card.icao} ${where}, ${card.category ?? 'no category'}, ${mark.words}. Open the full card.`);
    entry.button.replaceChildren(
      h('span', { class: 'sof-row-top' },
        h('span', { class: 'sof-icao' }, card.icao),
        card.category
          ? h('span', { class: `sof-badge sof-category cat-${card.category.toLowerCase()}${stale ? ' is-stale' : ''}`, 'aria-hidden': 'true' }, card.category)
          : null,
        card.role === 'HOME' ? h('span', { class: 'sof-row-home', 'aria-hidden': 'true' }, 'HOME') : null),
      h('span', { class: `sof-row-mark level-${mark.level}`, 'aria-hidden': 'true' }, h('span', { class: 'sof-result-symbol' }, mark.symbol), ` ${mark.words}`),
    );
  }

  function render(cards) {
    const keep = new Set(cards.map((c) => c.icao));
    for (const [icao, entry] of entries) {
      if (keep.has(icao)) continue;
      entry.article.remove();
      entries.delete(icao);
      if (selected === icao) controller?.close();
    }
    cards.forEach((card, index) => {
      let entry = entries.get(card.icao);
      if (!entry) {
        const button = h('button', { type: 'button', class: 'sof-card-row', 'aria-expanded': 'false', 'aria-controls': 'sof-card-full', onclick: () => press(card.icao) });
        entry = { article: h('article', { class: 'sof-card', dataset: { icao: card.icao } }, button), button, signature: null, card };
        entries.set(card.icao, entry);
      }
      if (list.children[index] !== entry.article) list.insertBefore(entry.article, list.children[index] ?? null);
      entry.card = card;
      const signature = JSON.stringify(card);
      if (signature !== entry.signature) {
        entry.signature = signature;
        drawRow(entry);
      }
    });
    if (selected) drawFull();
  }

  return { element, render };
}
