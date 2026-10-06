// The airfield cards' DOM (SPEC-sof, "Airfield cards"): draws the model from
// cards.js (through screen-model.js) and decides nothing. Report text, which
// comes from outside, only ever goes in as text (h() and textContent), never as HTML.
// A card is redrawn only when what it says has changed, so a screen left open all
// day does no work between refreshes.
//
// SOF-38: a card is short to begin with: its header, one METAR line, one TAF line and the result in words, with
// "Full brief" to open everything the card used to show (the raw reports with their marked words, the limits and every
// note). On a short window (1366 x 768) the METAR and TAF lines wait behind Full brief too, and the card is the
// header and the result. Whether a card is open is kept for the visit, not stored.
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

// A line's words with the marked ones in <mark>s, as text (the same marks as the full report).
const marked = (text, marks) => segments(text, marks).map((seg) => (seg.level ? h('mark', { class: `sof-mark is-${seg.level}` }, seg.text) : seg.text));

// One of the card's short lines: its label, then the report's own words in a single line (cut with "…" when long; all of
// it is in Full brief and in the hover words).
function shortLine(kind, label, flag, body, { tone = null, title = '' } = {}) {
  return h('p', { class: `sof-line sof-line-${kind}${tone ? ` is-${tone}` : ''}`, title },
    h('span', { class: 'sof-line-label' }, label),
    flag ? h('span', { class: 'sof-line-flag' }, ` ${flag}`) : null,
    body ? h('span', { class: 'sof-line-body' }, ' ', body) : null);
}

function metarLine(metar) {
  const label = metar.label ?? 'METAR';
  if (!metar.raw) return shortLine('metar', label === 'METAR' ? '' : label, null, metar.words, { tone: 'bad', title: metar.words ?? '' });
  const stale = metar.state === 'stale' || metar.state === 'closed';
  return shortLine('metar', label, metar.staleText, h('span', { class: `sof-line-raw${stale ? ' is-stale' : ''}` }, ...marked(metar.raw, metar.marks)), { title: metar.raw });
}

function tafLine(taf) {
  const { text, marks, tone } = tafHeadline(taf);
  // "TAF 1740Z", the issue time only: the valid period is in Full brief.
  const label = taf.label ? `${taf.label.split(',')[0]}:` : 'TAF:';
  return shortLine('taf', label, null, h('span', { class: 'sof-line-raw' }, ...marked(text, marks)), { tone, title: taf.raw ?? text });
}

function children(card, { expanded, onToggle }) {
  // The category and colour chips are the METAR's: a stale one, or one from a closed field's last observation, is grey, its words kept.
  const staleChips = card.metar?.state === 'stale' || card.metar?.state === 'closed';
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
  const more = h('button', { type: 'button', class: 'sof-card-more', 'aria-expanded': String(expanded), onclick: onToggle }, expanded ? 'Full brief ▾' : 'Full brief ▸');
  const result = h('div', { class: 'sof-result-row' },
    h('p', { class: `sof-result level-${card.result.level}` }, h('span', { class: 'sof-result-symbol', 'aria-hidden': 'true' }, LEVEL_SYMBOL[card.result.level] ?? ''), ' ', card.result.words),
    more);
  const head = h('header', { class: 'sof-card-head' },
    h('h2', { class: 'sof-card-title' }, h('span', { class: 'sof-icao' }, card.icao), card.name ? h('span', { class: 'sof-name' }, ` ${card.name}`) : null),
    badges);
  // An alternate's result for the selected wave (waves-view-model.js's altLines), in words with its symbol.
  const wave = card.waveLine ? waveResult(card.waveLine) : null;
  if (expanded) {
    // The result and its button come first, as in the short card, so the button stays where it was to close the card again.
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
  // Short: a caution is never left behind the button, so the first is said here (all of them are in Full brief).
  const [firstCaution, ...otherCautions] = card.cautionReasons;
  return [
    head,
    h('div', { class: 'sof-card-lines' }, metarLine(card.metar), tafLine(card.taf)),
    result,
    wave,
    firstCaution ? h('p', { class: 'sof-caution' }, `Caution: ${firstCaution}${otherCautions.length ? ` (+${otherCautions.length} more in Full brief)` : ''}`) : null,
  ].filter(Boolean);
}

/** The cards' container and its render(cards): one article per airfield, kept in order. */
export function createCardsView() {
  const element = h('section', { class: 'sof-cards', 'aria-label': 'Airfields' });
  const entries = new Map(); // ICAO to { article, signature, card, expanded }

  function draw(entry) {
    const { card } = entry;
    const hadFocus = entry.article.contains(document.activeElement) && document.activeElement?.classList.contains('sof-card-more');
    entry.article.className = `sof-card is-${card.role.toLowerCase()} level-${card.result.level}${card.metar.state === 'stale' || card.metar.state === 'closed' ? ' is-stale' : ''}${entry.expanded ? ' is-open' : ''}`;
    entry.article.replaceChildren(...children(card, {
      expanded: entry.expanded,
      onToggle: () => {
        entry.expanded = !entry.expanded;
        draw(entry);
      },
    }));
    // The button is drawn again with the card: focus goes to the new one, never to the page.
    if (hadFocus) entry.article.querySelector('.sof-card-more')?.focus({ preventScroll: true });
  }

  function render(cards) {
    const keep = new Set(cards.map((c) => c.icao));
    for (const [icao, entry] of entries) {
      if (keep.has(icao)) continue;
      entry.article.remove();
      entries.delete(icao);
    }
    cards.forEach((card, index) => {
      let entry = entries.get(card.icao);
      if (!entry) {
        entry = { article: h('article', { class: 'sof-card', dataset: { icao: card.icao } }), signature: null, card, expanded: false };
        entries.set(card.icao, entry);
      }
      if (element.children[index] !== entry.article) element.insertBefore(entry.article, element.children[index] ?? null);
      const signature = JSON.stringify(card);
      if (signature === entry.signature) return;
      entry.signature = signature;
      entry.card = card;
      draw(entry);
    });
  }

  return { element, render };
}
