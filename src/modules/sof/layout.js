// The SOF screen (SPEC-sof, "The screen", R22): the SOF bar, the one closed
// settings menu, the every-feed-failing message, the airfield cards and the credits
// line. It draws what screen-model.js decided. Nothing sits fixed over the
// controls, and the message and the menu take their own rows in the page flow.
import { h } from '../../ui-kit/dom.js';
import { createCardsView } from './cards-view.js';

/**
 * settingsElement: the settings menu's element. onRefresh: the Refresh button's action.
 * bannerElement, wavesElement, timelineElement: the other screen parts' elements, each
 * in its own row (optional; each part draws itself).
 * Returns { element, render(screen), setBusy(on) }.
 */
export function createLayout({ settingsElement, onRefresh, bannerElement = null, wavesElement = null, timelineElement = null }) {
  const dtg = h('time', { class: 'sof-dtg' });
  const feedWords = h('span', { class: 'sof-feed-words' });
  const feedSymbol = h('span', { class: 'sof-feed-symbol', 'aria-hidden': 'true' });
  // Reachable by keyboard: focusing the status reads out where the weather came from and when it asks again.
  const feedDetail = h('span', { class: 'visually-hidden', id: 'sof-feed-detail' });
  const feed = h(
    'p',
    { class: 'sof-feed', tabindex: '0', role: 'group', 'aria-label': 'Weather feed', 'aria-describedby': 'sof-feed-detail' },
    h('span', { class: 'sof-feed-label' }, 'Weather'), ' ', feedWords, ' ', feedSymbol,
  );
  // aria-disabled, not disabled, so keyboard focus stays on the button while a round is out.
  const refresh = h('button', { type: 'button', class: 'sof-refresh', onclick: () => onRefresh() }, 'Refresh');
  const alert = h('p', { class: 'sof-alert', role: 'alert', hidden: true });
  const credits = h('p', { class: 'sof-credits' });
  const cards = createCardsView();

  const element = h(
    'div',
    { class: 'sof' },
    h('h1', { class: 'visually-hidden' }, 'SOF Dashboard'),
    h('section', { class: 'sof-bar', 'aria-label': 'SOF bar' }, dtg, feed, feedDetail, h('div', { class: 'sof-bar-actions' }, refresh)),
    settingsElement,
    alert,
    bannerElement, // the new-caution banner: its own row, in the page flow
    wavesElement, // the waves and their calls
    cards.element,
    timelineElement, // the 24-hour timeline
    credits,
  );

  // Text nodes are only touched when they change, so the once-a-second-or-slower tick costs nothing.
  const setText = (el, text) => {
    if (el.textContent !== text) el.textContent = text;
  };

  return {
    element,
    render(screen) {
      setText(dtg, screen.dtg);
      dtg.dateTime = screen.dtgIso;
      setText(feedWords, screen.feed.words);
      setText(feedSymbol, screen.feed.symbol);
      feed.className = `sof-feed is-${screen.feed.tone}`;
      feed.title = screen.feed.title;
      setText(feedDetail, screen.feed.detail);
      const text = screen.alert ? `⚠ ${screen.alert}` : '';
      if (alert.textContent !== text) alert.textContent = text; // re-announced only when it changes
      alert.hidden = !screen.alert;
      setText(credits, screen.credits);
      cards.render(screen.cards);
    },
    /** Where keyboard focus goes when the banner empties under it: the Waves heading, else the feed status. */
    focusAfterBanner() {
      (wavesElement?.querySelector('.sof-waves-title') ?? feed).focus({ preventScroll: true });
    },
    setBusy(on) {
      if (on) refresh.setAttribute('aria-disabled', 'true');
      else refresh.removeAttribute('aria-disabled');
      element.toggleAttribute('aria-busy', Boolean(on));
    },
  };
}
