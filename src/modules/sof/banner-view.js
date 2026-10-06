// The caution banner's DOM (SPEC-sof, "Caution banner"): draws banner-model.js's
// answer and decides nothing. On the one-screen SOF (SOF-38) it is one line: the lead caution, "+N more",
// Show all and Acknowledge. Show all drops the whole list over the screen, never pushing it down, and
// with no caution at all the banner is gone and takes no room. Every line is words with a symbol, and every
// button is a real button, so the keyboard alone does it all. role="alert" is on the strip only while it has a
// caution that was not there before, so a refresh that changes nothing is never read out again, and opening
// the list is not read out as news. Caution text is text, never HTML.
import { h } from '../../ui-kit/dom.js';

// The words of the report that triggered a line, each in a <mark> of its level (a fixed word from marks.js, never from data).
const words = (l) => (l.marks?.length
  ? h('span', { class: 'sof-banner-words' }, 'In the report: ', ...l.marks.flatMap((m, i) => [i ? ' ' : null, h('mark', { class: `sof-mark is-${m.level}` }, m.text)]))
  : null);

/**
 * onAcknowledge(key), onAcknowledgeAll(): the buttons' actions. Acknowledge on the strip is for the lead caution only;
 * every caution has its own button in the list, and Acknowledge all is there too.
 * focusAfter(): where keyboard focus goes when the banner empties while it holds focus.
 * dropdowns: dropdown.js's createDropdowns, for the list that drops over the screen.
 * Returns { element, render(banner) }.
 */
export function createBannerView({ onAcknowledge, onAcknowledgeAll, focusAfter = () => {}, dropdowns }) {
  const title = h('h2', { class: 'sof-banner-title' });
  const lead = h('span', { class: 'sof-banner-lead' });
  const more = h('span', { class: 'sof-banner-more' });
  let leadKey = null;
  const showAll = h('button', { type: 'button', class: 'sof-banner-showall', 'aria-expanded': 'false', 'aria-controls': 'sof-banner-drop', onclick: () => drop.toggle() }, 'Show all ▾');
  const ackLead = h('button', { type: 'button', class: 'sof-banner-ack-lead', onclick: () => {
    pendingFocus = 'strip';
    if (leadKey !== null) onAcknowledge(leadKey);
  } }, 'Acknowledge');
  const strip = h('div', { class: 'sof-banner-strip' }, title, lead, more, showAll, ackLead);
  const list = h('ul', { class: 'sof-banner-list' });
  const all = h('button', { type: 'button', class: 'sof-banner-all', onclick: () => {
    pendingFocus = 'after';
    onAcknowledgeAll();
  } });
  const listBox = h('div', { class: 'sof-banner-drop', id: 'sof-banner-drop', hidden: true }, list, h('p', { class: 'sof-banner-actions' }, all));
  const element = h('section', { class: 'sof-banner', 'aria-label': 'New cautions', hidden: true }, strip, listBox);
  const drop = dropdowns.create({
    scope: element,
    button: showAll,
    labels: ['Show all ▾', 'Show all ▴'],
    onToggle: (open) => {
      listBox.hidden = !open;
    },
  });
  let signature = null;
  let count = 0;
  // Where focus should go once the next render has happened: a number is the line's place in the list, 'strip' is the
  // strip's Acknowledge, 'after' is off the banner.
  let pendingFocus = null;

  const line = (l, index) =>
    h('li', { class: `sof-banner-line is-${l.level}${l.stale ? ' is-stale' : ''}`, dataset: { key: l.key } },
      h('span', { class: 'sof-banner-symbol', 'aria-hidden': 'true' }, l.symbol),
      h('span', { class: 'sof-banner-text' }, l.text),
      words(l),
      h('button', {
        type: 'button',
        class: 'sof-banner-ack',
        'aria-label': `Acknowledge: ${l.text}`,
        onclick: () => {
          pendingFocus = index;
          onAcknowledge(l.key);
        },
      }, 'Acknowledge'));

  function render(banner) {
    const active = document.activeElement;
    const hadFocus = element.contains(active);
    // Which button had focus, before a redraw takes it away: its line's key and place, the strip's Acknowledge, or Acknowledge all.
    const lineOfFocus = hadFocus ? /** @type {HTMLElement | null} */ (active.closest?.('.sof-banner-line')) : null;
    const heldKey = lineOfFocus?.dataset.key ?? null;
    const heldIndex = lineOfFocus ? [...list.children].indexOf(lineOfFocus) : -1;
    const heldAll = hadFocus && active === all;
    const heldStrip = hadFocus && active === ackLead;
    // The alert role is only on while something new is on the banner.
    if (banner.announce.length) strip.setAttribute('role', 'alert');
    else strip.removeAttribute('role');
    if (banner.signature !== signature) {
      signature = banner.signature;
      count = banner.lines.length;
      const first = banner.lines[0];
      leadKey = first?.key ?? null;
      title.replaceChildren(h('span', { class: 'sof-banner-symbol', 'aria-hidden': 'true' }, '⚠'), ` ${banner.heading}`);
      lead.replaceChildren(first ? h('span', { class: `sof-banner-lead-symbol is-${first.level}`, 'aria-hidden': 'true' }, `${first.symbol} `) : null, first?.text ?? '');
      lead.className = `sof-banner-lead${first?.stale ? ' is-stale' : ''}`;
      lead.title = first?.text ?? '';
      more.textContent = count > 1 ? `+${count - 1} more` : '';
      more.hidden = count <= 1;
      ackLead.setAttribute('aria-label', first ? `Acknowledge: ${first.text}` : 'Acknowledge');
      // With one caution the list is that caution's marked words: it is "Details", not "all".
      const labels = count > 1 ? ['Show all ▾', 'Show all ▴'] : ['Details ▾', 'Details ▴'];
      drop.setLabels(labels);
      list.replaceChildren(...banner.lines.map(line));
      all.textContent = banner.ackAllLabel ?? '';
      all.hidden = !banner.ackAllLabel;
    }
    element.hidden = !banner.show;
    if (!banner.show) drop.close();
    if (pendingFocus === null && hadFocus && banner.show && !element.contains(document.activeElement)) {
      // A redraw took focus from a button it did not press: the same caution's button, else the one in its place,
      // else the strip. Acknowledge all keeps focus if it is still there.
      const buttons = [...list.children].map((li) => li.querySelector('.sof-banner-ack'));
      const same = heldKey === null ? null : buttons.find((b) => b.closest('.sof-banner-line').dataset.key === heldKey);
      const inList = drop.isOpen ? same ?? (heldIndex >= 0 ? buttons[Math.min(heldIndex, buttons.length - 1)] : null) : null;
      const target = heldStrip ? ackLead : heldAll && !all.hidden && drop.isOpen ? all : inList ?? ackLead;
      target.focus();
      return;
    }
    if (pendingFocus === null && !(hadFocus && !banner.show)) return;
    // Focus never falls to the page: to the next line's button, the strip's, or on past the banner.
    const buttons = [...list.querySelectorAll('.sof-banner-ack')];
    if (banner.show && pendingFocus === 'strip') ackLead.focus();
    else if (banner.show && typeof pendingFocus === 'number') (drop.isOpen && buttons.length ? buttons[Math.min(pendingFocus, buttons.length - 1)] : ackLead).focus();
    else if (!banner.show || pendingFocus === 'after') focusAfter();
    pendingFocus = null;
  }

  return { element, render };
}
