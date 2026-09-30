// The airfield cards' DOM (SPEC-sof, "Airfield cards"): draws the model from
// cards.js (through screen-model.js) and decides nothing. Report text, which
// comes from outside, only ever goes in as text (h() and textContent), never as HTML.
// A card is redrawn only when what it says has changed, so a screen left open all
// day does no work between refreshes.
import { h } from '../../ui-kit/dom.js';

// Beside the words of the result, never instead of them.
const LEVEL_SYMBOL = { below: '▼', 'at-limit': '●', within: '✓', unknown: '?', none: '–' };

const note = (text, tone) => (text ? h('p', { class: `sof-note${tone ? ` is-${tone}` : ''}` }, text) : null);

// One report line: its title with the time and age, the raw text as text, and every note in words.
function report(kind, line) {
  const title = line.label ?? kind;
  const closed = line.state === 'closed';
  const stale = line.state === 'stale' || closed;
  return h(
    'section',
    { class: `sof-report sof-${kind.toLowerCase()}${stale ? ' is-stale' : ''}`, dataset: { state: line.state } },
    h('h3', { class: 'sof-report-title' }, title, line.sourceName ? h('span', { class: 'sof-source' }, ` via ${line.sourceName}`) : null),
    line.raw ? h('p', { class: 'sof-raw' }, line.raw) : null,
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

function children(card) {
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
  const parts = [
    h('header', { class: 'sof-card-head' },
      h('h2', { class: 'sof-card-title' }, h('span', { class: 'sof-icao' }, card.icao), card.name ? h('span', { class: 'sof-name' }, ` ${card.name}`) : null),
      badges),
    h('p', { class: 'sof-limits' }, `${card.limitsLabel}: `, h('span', {}, card.limitsText)),
    note(card.limitsNote, 'info'),
    report('METAR', card.metar),
    report('TAF', card.taf),
    h('p', { class: `sof-result level-${card.result.level}` }, h('span', { class: 'sof-result-symbol', 'aria-hidden': 'true' }, LEVEL_SYMBOL[card.result.level] ?? ''), ' ', card.result.words),
    // An alternate's result for the selected wave (waves-view-model.js's altLines), in words with its symbol.
    card.waveLine ? waveResult(card.waveLine) : null,
    ...card.cautionReasons.map((reason) => h('p', { class: 'sof-caution' }, `Caution: ${reason}`)),
    note(card.watchText, 'info'),
  ];
  return parts.filter(Boolean); // replaceChildren would turn a null into the text "null"
}

/** The cards' container and its render(cards): one article per airfield, kept in order. */
export function createCardsView() {
  const element = h('section', { class: 'sof-cards', 'aria-label': 'Airfields' });
  const entries = new Map(); // ICAO to { article, signature }

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
        entry = { article: h('article', { class: 'sof-card', dataset: { icao: card.icao } }), signature: null };
        entries.set(card.icao, entry);
      }
      if (element.children[index] !== entry.article) element.insertBefore(entry.article, element.children[index] ?? null);
      const signature = JSON.stringify(card);
      if (signature === entry.signature) return;
      entry.signature = signature;
      entry.article.className = `sof-card is-${card.role.toLowerCase()} level-${card.result.level}${card.metar.state === 'stale' || card.metar.state === 'closed' ? ' is-stale' : ''}`;
      entry.article.replaceChildren(...children(card));
    });
  }

  return { element, render };
}
