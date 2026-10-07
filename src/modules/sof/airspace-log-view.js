// The Airspace log panel in the SOF's 3D view (SPEC-sof, "3D view", SOF-39, Dad 7 Oct): the page's half of airspace-log.js. It draws what the log
// model's `view()` says: a one-line summary that is always showing ("⚠ 1 non-T-6 in CYA304/305/307"), and, opened, the aircraft inside the watched
// areas now (amber, with the ⚠ symbol and the words, never colour alone), the two ticks, and the running log, newest first. It decides nothing and
// raises no caution. Lines are text only, built with h(), so nothing from the feed is ever read as HTML.
import { h } from '../../ui-kit/dom.js';
import { INFO_ONLY_WORDS } from './airspace-log.js';

let nextId = 1;

const setText = (el, text) => {
  if (el.textContent !== text) el.textContent = text;
};

/**
 * onOptions({ showT6, showAll }) hears the two ticks. Returns { element, render(view), options() }; `render` takes airspace-log.js `view()` and redraws only
 * what changed (the log model's own signature).
 */
export function createAirspaceLogView({ onOptions = /** @type {(options: { showT6: boolean, showAll: boolean }) => void} */ (() => {}) } = {}) {
  const uid = `sof-log-${nextId++}`;
  const summaryWords = h('span', { class: 'sof-log-summary-words' });
  const summary = h('summary', { class: 'sof-log-summary' }, summaryWords);
  const status = h('p', { class: 'sof-log-status', role: 'status', hidden: true });
  const nowHeading = h('p', { class: 'sof-log-heading' }, 'In the watched areas now');
  const nowList = h('ul', { class: 'sof-log-list sof-log-now', 'aria-label': 'Aircraft that are not T-6s in the watched areas now' });
  const nobody = h('p', { class: 'sof-log-empty' }, 'None.');
  const t6Id = `${uid}-t6`;
  const allId = `${uid}-all`;
  const t6Box = h('input', { type: 'checkbox', id: t6Id, onchange: () => changed() });
  const allBox = h('input', { type: 'checkbox', id: allId, onchange: () => changed() });
  const ticks = h('div', { class: 'sof-log-ticks' },
    h('span', { class: 'sof-log-tick' }, t6Box, h('label', { for: t6Id, title: 'Log T-6 (TEX2) movements as well, in plain text. Only movements after the tick is on are logged.' }, 'Show T-6s too')),
    h('span', { class: 'sof-log-tick' }, allBox, h('label', { for: allId, title: 'Log every aircraft that is not a T-6 in any of the airspace volumes, not just the watched areas. Only movements after the tick is on are logged.' }, 'Show all airspace')));
  const logHeading = h('p', { class: 'sof-log-heading' }, 'Log, newest first');
  const logList = h('ul', { class: 'sof-log-list sof-log-lines', 'aria-label': 'Entries and exits, newest first' });
  const empty = h('p', { class: 'sof-log-empty' }, 'Nothing logged yet this session.');
  const body = h('div', { class: 'sof-log-body' }, status, nowHeading, nowList, nobody, ticks, logHeading, logList, empty);
  const element = h('details', { class: 'sof-3d-log', open: true, title: INFO_ONLY_WORDS, hidden: true }, summary, body);

  function changed() {
    onOptions({ showT6: t6Box.checked, showAll: allBox.checked });
  }

  const rows = (list, alert) => list.map((item) => h('li', { class: `sof-log-line${alert ?? item.alert ? ' is-alert' : ''}`, dataset: { key: item.key } }, item.text));
  let signature = null;

  return {
    element,
    options: () => ({ showT6: t6Box.checked, showAll: allBox.checked }),
    render(view) {
      element.hidden = !view.shown;
      if (!view.shown || view.signature === signature) return;
      signature = view.signature;
      setText(summaryWords, view.count > 0 ? `⚠ ${view.countWords}` : view.countWords);
      summary.classList.toggle('is-alert', view.count > 0);
      status.hidden = !view.stateWords;
      setText(status, view.stateWords ?? '');
      nowList.replaceChildren(...rows(view.intruders, true));
      nowHeading.hidden = view.state !== 'live';
      nowList.hidden = view.intruders.length === 0;
      nobody.hidden = view.state !== 'live' || view.intruders.length > 0;
      logList.replaceChildren(...rows(view.lines));
      empty.hidden = view.lines.length > 0;
    },
  };
}
