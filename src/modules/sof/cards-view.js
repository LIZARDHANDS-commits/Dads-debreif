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
//
// Dad, 7 Oct (SOF-42, SOF-44): each full card ends with the airfield's NOTAMs (notams.js): the critical ones (a closed runway or aerodrome, an aid or the
// lighting out of service) first, large and red with a ⚠ and words, the rest in plain small text, each with its id, its validity and its raw text on request.
// When they cannot be fetched, or the answer is old, it says "NOTAMs unavailable (last good 0612Z)", never "No NOTAMs". A row carries a small red chip
// ("⚠ RWY CLSD") for a critical NOTAM and a grey "NOTAMs ?" when they are unavailable. Hovering or focusing a row shows its whole card beside the column
// without a click; a click still pins it open; moving away, or Escape, closes the hover.
import { h } from '../../ui-kit/dom.js';
import { segments } from './marks.js';
import { tafHeadline } from './taf-line.js';

/** The hover card stays this long after the pointer leaves a row or the card, so the pointer can travel from one to the other (an estimate for feel). */
const HOVER_GRACE_MS = 250;

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

// What a critical NOTAM says in words, beside its ⚠ (the colour is never the only signal).
const CRITICAL_WORDS = { runway: 'RUNWAY CLOSED', aerodrome: 'AERODROME CLOSED', aid: 'NAV AID OR LIGHTING OUT OF SERVICE' };

function notamRaw(n) {
  return h('details', { class: 'sof-notam-raw' }, h('summary', {}, 'Raw text'), h('pre', { class: 'sof-raw' }, n.raw));
}

/** The NOTAMs section of a full card: critical ones large and red first, then the rest small; or the words for "unavailable", "no relay address", or "No NOTAMs". */
function notamSection(n) {
  if (!n) return null;
  const title = h('h3', { class: 'sof-report-title' }, 'NOTAMs');
  if (n.status === 'unset') return h('section', { class: 'sof-notams', dataset: { status: n.status } }, title, note(n.words, 'info'));
  if (n.status !== 'ok') return h('section', { class: 'sof-notams', dataset: { status: n.status } }, title, h('p', { class: 'sof-notam-unavailable' }, '? ', n.words));
  if (n.list.length === 0) return h('section', { class: 'sof-notams', dataset: { status: n.status } }, title, h('p', { class: 'sof-notam-none' }, n.words));
  return h('section', { class: 'sof-notams', dataset: { status: n.status } }, title, n.list.map((x) => (x.critical
    ? h('div', { class: 'sof-notam is-critical', dataset: { kind: x.kind } },
      h('p', { class: 'sof-notam-head' }, h('span', { class: 'sof-notam-flag' }, '⚠ ', CRITICAL_WORDS[x.kind] ?? 'CRITICAL'), h('span', { class: 'sof-notam-meta' }, ` ${x.id}, ${x.validity}`)),
      h('p', { class: 'sof-notam-body' }, x.body),
      notamRaw(x))
    : h('div', { class: 'sof-notam' },
      h('p', { class: 'sof-notam-line' }, h('span', { class: 'sof-notam-meta' }, `${x.id}, ${x.validity}: `), x.body),
      notamRaw(x)))));
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
    notamSection(card.notams),
  ].filter(Boolean); // replaceChildren would turn a null into the text "null"
}

/**
 * The column of compact rows, and the full card that opens beside it. `dropdowns` is dropdown.js's createDropdowns: the full card is a drop-down like the
 * others (one open at a time; Escape or a press outside closes it and puts focus back on its row).
 * `timers` (a scheduler scope) gives the hover card its short grace when the pointer moves from a row to the card; `listen` is the module's app.listen
 * (Escape closes a hover card). Without them the hover card is off and only a click opens the card.
 * Returns { element, render(cards) }: one `article.sof-card` per airfield, kept in order.
 */
export function createCardsView({ dropdowns = undefined, timers = null, listen = null } = /** @type {any} */ ({})) {
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
      drop.hidden = !open && hovered === null;
      if (!open) {
        selected = hovered; // a hover card may still be wanted; a closed pin leaves nothing selected
        drop.classList.remove('is-pinned');
      } else drop.classList.add('is-pinned');
      syncRows();
    },
    // Focus goes back to the row when a pinned card closes (Escape): that is not a request for the hover card.
    focusTarget: () => {
      skipFocusHover = true;
      return entries.get(lastOpened)?.button ?? null;
    },
  });
  let lastOpened = null;
  let skipFocusHover = false;

  // ---- The hover card (Dad, 7 Oct): hovering or focusing a row shows its whole card beside the column, with no click ----
  let hovered = null; // the ICAO whose card is showing only because of the pointer or focus (not pinned)
  let cancelHide = null;
  const hoverOn = Boolean(timers);

  function syncRows() {
    for (const [icao, entry] of entries) entry.button.setAttribute('aria-expanded', String(controller?.isOpen === true && icao === selected));
  }

  function stopHide() {
    cancelHide?.();
    cancelHide = null;
  }

  function showHover(icao) {
    if (!hoverOn || controller?.isOpen) return; // a pinned card stays as it is
    stopHide();
    if (hovered === icao && !drop.hidden) return;
    hovered = icao;
    selected = icao;
    fullSignature = null;
    drop.hidden = false;
    drawFull();
  }

  function hideHover() {
    stopHide();
    if (hovered === null) return;
    hovered = null;
    if (controller?.isOpen) return;
    selected = null;
    drop.hidden = true;
  }

  /** Moving off a row or the card: gone after a moment, so the pointer can travel from the row to the card. */
  function leaveHover() {
    if (!hoverOn || hovered === null) return;
    stopHide();
    cancelHide = timers.after(HOVER_GRACE_MS, () => {
      cancelHide = null;
      if (drop.contains(document.activeElement) && document.activeElement !== document.body) return; // focus is inside the card: it stays
      hideHover();
    });
  }

  drop.addEventListener('pointerenter', stopHide);
  drop.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') leaveHover();
  });
  // Escape closes a hover card (a pinned one is closed by the drop-down's own Escape).
  listen?.(document, 'keydown', (event) => {
    if (event.key === 'Escape' && hovered !== null && !controller?.isOpen) hideHover();
  });

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
    full.replaceChildren(...fullCard(card, { onClose: () => { hideHover(); controller?.close({ focus: true }); } }));
    // The button is drawn again with the card: focus goes to the new one, never to the page.
    if (hadFocus) full.querySelector('.sof-card-more')?.focus({ preventScroll: true });
  }

  function press(icao) {
    if (!controller) return;
    if (controller.isOpen && selected === icao) {
      hovered = null; // a click on the pinned row closes it, whatever the pointer is doing
      return controller.close({ focus: true });
    }
    stopHide();
    hovered = null;
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
    const chip = card.notams?.chip ?? null; // "⚠ RWY CLSD" for a critical NOTAM, a grey "NOTAMs ?" when they are unavailable
    const chipWords = chip ? (chip.level === 'critical' ? `⚠ ${chip.words}` : chip.words) : null;
    entry.button.setAttribute('aria-label', `${card.icao} ${where}, ${card.category ?? 'no category'}, ${mark.words}${chip ? `, ${chip.level === 'critical' ? `NOTAM: ${chip.words}` : 'NOTAMs unavailable'}` : ''}. Open the full card.`);
    entry.button.replaceChildren(
      h('span', { class: 'sof-row-top' },
        h('span', { class: 'sof-icao' }, card.icao),
        card.category
          ? h('span', { class: `sof-badge sof-category cat-${card.category.toLowerCase()}${stale ? ' is-stale' : ''}`, 'aria-hidden': 'true' }, card.category)
          : null,
        card.role === 'HOME' ? h('span', { class: 'sof-row-home', 'aria-hidden': 'true' }, 'HOME') : null),
      h('span', { class: `sof-row-mark level-${mark.level}`, 'aria-hidden': 'true' }, h('span', { class: 'sof-result-symbol' }, mark.symbol), ` ${mark.words}`),
      ...(chipWords ? [h('span', { class: `sof-row-notam is-${chip.level}`, 'aria-hidden': 'true' }, chipWords)] : []), // replaceChildren would turn a null into the text "null"
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
        // The hover card: the pointer (a mouse or pen, never a touch, which has the click) or keyboard focus on the row shows the whole card.
        button.addEventListener('pointerenter', (event) => {
          if (event.pointerType !== 'touch') showHover(card.icao);
        });
        button.addEventListener('pointerleave', (event) => {
          if (event.pointerType !== 'touch') leaveHover();
        });
        button.addEventListener('focus', () => {
          if (skipFocusHover) skipFocusHover = false;
          else showHover(card.icao);
        });
        button.addEventListener('blur', (event) => {
          skipFocusHover = false;
          if (!drop.contains(event.relatedTarget)) leaveHover();
        });
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
