// The caution banner's DOM (SPEC-sof, "Caution banner"): draws banner-model.js's
// answer and decides nothing. It takes its own row in the page flow, so it pushes the
// screen down and never covers a control. Every line is words with a symbol, and every
// button is a real button, so the keyboard alone does it all. role="alert" is on the
// banner only while it has a caution that was not there before, so a refresh that
// changes nothing is never read out again. Caution text is text, never HTML.
import { h } from '../../ui-kit/dom.js';

/**
 * onAcknowledge(key), onAcknowledgeAll(): the buttons' actions.
 * focusAfter(): where keyboard focus goes when the banner empties while it holds focus.
 * Returns { element, render(banner) }.
 */
export function createBannerView({ onAcknowledge, onAcknowledgeAll, focusAfter = () => {} }) {
  const title = h('h2', { class: 'sof-banner-title' });
  const list = h('ul', { class: 'sof-banner-list' });
  const all = h('button', { type: 'button', class: 'sof-banner-all', onclick: () => {
    pendingFocus = 'after';
    onAcknowledgeAll();
  } });
  const element = h('section', { class: 'sof-banner', 'aria-label': 'New cautions', hidden: true }, title, list, h('p', { class: 'sof-banner-actions' }, all));
  let signature = null;
  // Where focus should go once the next render has happened: a number is the line's place, 'after' is off the banner.
  let pendingFocus = null;

  const line = (l, index) =>
    h('li', { class: `sof-banner-line is-${l.level}`, dataset: { key: l.key } },
      h('span', { class: 'sof-banner-symbol', 'aria-hidden': 'true' }, l.symbol),
      h('span', { class: 'sof-banner-text' }, l.text),
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
    const hadFocus = element.contains(document.activeElement);
    // The alert role is only on while something new is on the banner.
    if (banner.announce.length) element.setAttribute('role', 'alert');
    else element.removeAttribute('role');
    if (banner.signature !== signature) {
      signature = banner.signature;
      title.replaceChildren(h('span', { class: 'sof-banner-symbol', 'aria-hidden': 'true' }, '⚠'), ` ${banner.heading}`);
      list.replaceChildren(...banner.lines.map(line));
      all.textContent = banner.ackAllLabel ?? '';
      all.hidden = !banner.ackAllLabel;
    }
    element.hidden = !banner.show;
    if (pendingFocus === null && !(hadFocus && !banner.show)) return;
    // Focus never falls to the page: it goes to the next line's button, or on past the banner.
    const buttons = [...list.querySelectorAll('.sof-banner-ack')];
    if (banner.show && typeof pendingFocus === 'number' && buttons.length) buttons[Math.min(pendingFocus, buttons.length - 1)].focus();
    else if (!banner.show || pendingFocus === 'after') focusAfter();
    pendingFocus = null;
  }

  return { element, render };
}
