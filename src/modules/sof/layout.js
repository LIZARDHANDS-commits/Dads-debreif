// The SOF screen (SPEC-sof, "The screen", SOF-38): one screen that fills the window under the app's header,
// top to bottom: the SOF bar (date-time group, world clocks, the weather feed's age, SOF settings, Refresh),
// the every-feed-failing line, the one-line caution strip, the 24-hour timeline across the full width with
// the waves in its header, then the airfield cards beside the map (which takes the height that is left), and the
// credits line. It draws what screen-model.js decided. Nothing is fixed over the controls: the settings menu and
// the clocks (on a narrower window) open as drop-downs over the screen, never pushing it down.
import { h } from '../../ui-kit/dom.js';
import { createCardsView } from './cards-view.js';

/**
 * settings: settings-view.js's { element, setOpen(open) }. mapElement: the map's (map.js). onRefresh: the Refresh button's action.
 * bannerElement, timelineElement: the other screen parts' elements, each in its own place (optional; each part draws itself).
 * wavesElement: the waves part (in the timeline's header), for where focus goes when the banner empties.
 * mapCredits: the map's credits line, shown in the Sources note beside the one-line credits at the bottom.
 * dropdowns: dropdown.js's createDropdowns. Returns { element, render(screen), setBusy(on), focusAfterBanner(), closeSettings() }.
 */
export function createLayout({ settings, mapElement = null, mapCredits = null, onRefresh, bannerElement = null, wavesElement = null, timelineElement = null, dropdowns }) {
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
  // The credits are one line at the bottom, "Not for flight planning" first; the Sources note opens over the screen with every credit in full.
  const credits = h('p', { class: 'sof-credits' });
  const sourcesWords = h('p', { class: 'sof-sources-words' });
  const sources = h('details', { class: 'sof-sources' }, h('summary', {}, 'Sources'), h('div', { class: 'sof-sources-body' }, sourcesWords, mapCredits));
  const cards = createCardsView();

  // The world clocks: in the bar on a wide window, and behind "Clocks" below 1440 px wide (sof.css decides which).
  const clockList = h('div', { class: 'sof-clock-list', id: 'sof-clock-list' });
  const clocksButton = h('button', { type: 'button', class: 'sof-clocks-btn', 'aria-controls': 'sof-clock-list', onclick: () => clocksDrop.toggle() }, 'Clocks ▾');
  const clocksBox = h('div', { class: 'sof-clocks' }, clocksButton, clockList);
  const clocksDrop = dropdowns.create({
    scope: clocksBox,
    button: clocksButton,
    labels: ['Clocks ▾', 'Clocks ▴'],
    onToggle: (open) => clocksBox.classList.toggle('is-open', open),
  });
  const clockEls = new Map(); // zone label to its parts

  // SOF settings: the existing settings menu, as a drop-down from the bar. Its own header closes it too.
  const settingsPanel = h('div', { class: 'sof-drop sof-settings-drop', hidden: true }, settings.element);
  const settingsButton = h('button', { type: 'button', class: 'sof-settings-btn', 'aria-controls': 'sof-settings-drop', onclick: () => settingsDrop.toggle() }, 'SOF settings ▸');
  settingsPanel.id = 'sof-settings-drop';
  const settingsBox = h('div', { class: 'sof-drop-host' }, settingsButton, settingsPanel);
  const settingsDrop = dropdowns.create({
    scope: settingsBox,
    button: settingsButton,
    labels: ['SOF settings ▸', 'SOF settings ▾'],
    onToggle: (open) => {
      settingsPanel.hidden = !open;
      settings.setOpen(open);
    },
  });

  // The keys and Sources are notes that open over the screen: a press outside closes them.
  for (const note of [sources, timelineElement?.querySelector('.sof-tl-key'), mapElement?.querySelector('.sof-map-legend')]) dropdowns.note(note);

  const element = h(
    'div',
    { class: 'sof' },
    h('h1', { class: 'visually-hidden' }, 'SOF Dashboard'),
    h('section', { class: 'sof-bar', 'aria-label': 'SOF bar' }, dtg, clocksBox, feed, feedDetail, h('div', { class: 'sof-bar-actions' }, settingsBox, refresh)),
    alert,
    bannerElement, // the one-line caution strip; its list drops over the screen
    timelineElement, // the 24-hour timeline across the full width, the waves in its header
    // The cards and the map side by side; the map comes first when the screen is narrow.
    h('div', { class: 'sof-main' }, cards.element, mapElement),
    h('div', { class: 'sof-credits-row' }, sources, credits),
  );

  // Text nodes are only touched when they change, so the once-a-second-or-slower tick costs nothing.
  const setText = (el, text) => {
    if (el.textContent !== text) el.textContent = text;
  };

  function renderClocks(clocks = []) {
    for (const c of clocks) {
      let el = clockEls.get(c.label);
      if (!el) {
        el = { zone: h('span', { class: 'sof-clock-zone' }), time: h('span', { class: 'sof-clock-time' }) };
        el.item = h('span', { class: 'sof-clock', title: c.label }, h('span', { class: 'visually-hidden' }, `${c.label} `), el.zone, ' ', el.time);
        clockEls.set(c.label, el);
        clockList.append(el.item);
      }
      setText(el.zone, c.zone);
      setText(el.time, c.time);
    }
  }

  return {
    element,
    render(screen) {
      setText(dtg, screen.dtg);
      dtg.dateTime = screen.dtgIso;
      renderClocks(screen.clocks);
      setText(feedWords, screen.feed.words);
      setText(feedSymbol, screen.feed.symbol);
      feed.className = `sof-feed is-${screen.feed.tone}`;
      feed.title = `${screen.feed.text}. ${screen.feed.title}`; // one line on the screen: the whole of it on hover
      setText(feedDetail, screen.feed.detail);
      const text = screen.alert ? `⚠ ${screen.alert}` : '';
      if (alert.textContent !== text) alert.textContent = text; // re-announced only when it changes
      alert.title = text; // one line on the screen: the whole sentence is on hover
      alert.hidden = !screen.alert;
      setText(credits, screen.credits);
      credits.title = screen.credits;
      setText(sourcesWords, screen.credits);
      cards.render(screen.cards);
    },
    /** Where keyboard focus goes when the banner empties under it: the Waves heading, else the feed status. */
    focusAfterBanner() {
      (wavesElement?.querySelector('.sof-waves-title') ?? feed).focus({ preventScroll: true });
    },
    /** The settings menu's own header (or Escape inside it) closed it: close the drop-down round it, focus on its button. */
    closeSettings: () => settingsDrop.close({ focus: true }),
    setBusy(on) {
      if (on) refresh.setAttribute('aria-disabled', 'true');
      else refresh.removeAttribute('aria-disabled');
      element.toggleAttribute('aria-busy', Boolean(on));
    },
  };
}
