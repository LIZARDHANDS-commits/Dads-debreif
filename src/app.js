// Entry point: builds the shared services and starts the shell.
// See specs/SPEC-shell.md.
import { createStore, browserStorage } from './storage/store.js';
import { createSettings } from './storage/settings.js';
import { createAirfields } from './airfields/airfields.js';
import { createAirfieldsPanel } from './airfields/panel.js';
import { createStandards } from './storage/standards.js';
import { createExampleFetcher } from './shell/examples.js';
import { createScheduler } from './ui-kit/scheduler.js';
import { createHost } from './shell/host.js';
import { parseRoute, pageFor, watchAddress } from './shell/router.js';
import { MODULES, moduleIds, findModule } from './shell/registry.js';
import { reportUrl } from './shell/report.js';
import { createSettingsDialog } from './shell/settings-dialog.js';
import { createTime, startClock } from './shell/header.js';
import { createUpdateBar, watchForUpdates } from './shell/update-bar.js';
import { updatedLabel } from './shell/version.js';
import home from './shell/home.js';
import about from './shell/about.js';
import { h } from './ui-kit/dom.js';

// Settings every module shares (D18, #41). Add new shared settings here.
// motion: 'system' follows the computer's reduced-motion setting; 'full' plays
// card videos and animations anyway; 'reduced' shows still pictures only.
export const SHARED_DEFAULTS = { timePrimary: 'zulu', motion: 'system' };
const SHARED_ALLOWED = { timePrimary: ['zulu', 'local'], motion: ['system', 'full', 'reduced'] };

const version = /** @type {HTMLMetaElement | null} */ (document.querySelector('meta[name="app-version"]'))?.content ?? 'dev';
const $ = (id) => document.getElementById(id);

const store = createStore(browserStorage);
const settings = createSettings(store.scope('app'), SHARED_DEFAULTS, { allowed: SHARED_ALLOWED });
// The home field and alternates (SPEC-airfields). Local time follows the home field.
const airfields = createAirfields({ store: store.scope('airfields') });
// The formation standards the debrief and the Turn Sim judge by (R18, D89).
const standards = createStandards({ store: store.scope('standards') });
// The example flight's files, for modules as app.exampleText(asset).
const exampleText = createExampleFetcher();
const scheduler = createScheduler();
const time = createTime({ settings, zone: () => airfields.home().timeZone });
const statusLine = $('module-status');
const view = $('view');
const host = createHost({
  root: view,
  scheduler,
  store,
  settings,
  time,
  airfields,
  standards,
  exampleText,
  scenarioStore: store.scope('scenarios'),
  onStatus: (text) => {
    statusLine.textContent = text;
    statusLine.hidden = !text;
  },
});

const pages = {
  home: { id: 'home', title: 'Home', load: async () => ({ default: home }) },
  about: { id: 'about', title: 'About Us', load: async () => ({ default: about }) },
};

function notice(text) {
  const el = $('route-notice');
  el.textContent = text ?? '';
  el.hidden = !text;
}

// Shown in place of a page that failed to open (SPEC-shell: Module contract).
function errorCard(entry) {
  return h(
    'section',
    { class: 'error-card', role: 'alert' },
    h('h1', {}, `${entry.title} couldn't open`),
    h('p', {}, 'Something went wrong while opening this page. Reporting it helps get it fixed; Home still works.'),
    h(
      'p',
      { class: 'error-actions' },
      h('a', { class: 'button primary', href: reportUrl({ page: entry.title, version }), target: '_blank', rel: 'noopener noreferrer' }, 'Report a problem'),
      h('a', { class: 'button', href: '#/' }, 'Home'),
    ),
  );
}

/** The Traffic Sim's own name in the top-left corner (Patrick, 4 Oct 10:09Z; no owner's name since 10 Oct 2026, About Us). */
/** The tool's name, with no owner's name in it (Dad and Patrick, 10 Oct 2026: both are credited as co-creators on About Us). */
const TOOL_NAME = 'OODA LOOP';

const TRAFFIC_BRAND = 'CYMJ Traffic & Pattern Simulator';

/** Sets the name in the top-left brand link, keeping its version badge. */
function brandName(name) {
  const brand = document.querySelector('a.brand');
  const text = brand?.firstChild;
  if (text && text.nodeType === Node.TEXT_NODE) text.textContent = `${name} `;
}

let firstShow = true;

async function show(hash) {
  const { entry, note } = pageFor(parseRoute(hash, moduleIds()), pages, findModule);
  notice(note);

  /** @type {HTMLAnchorElement} */ ($('report-problem')).href = reportUrl({ page: entry.title, version });
  document.title = entry === pages.home ? TOOL_NAME : `${entry.title} · ${TOOL_NAME}`;
  brandName(entry.id === 'traffic' ? TRAFFIC_BRAND : TOOL_NAME);
  statusLine.hidden = true;
  showAirfieldsFor(entry.id);
  try {
    await host.open(entry);
  } catch (err) {
    console.error(`Couldn't open ${entry.title}:`, err);
    view.append(errorCard(entry));
  }
  // After a page change, start at the top with keyboard focus on the new page,
  // so Tab and screen readers carry on from there. Not on the first load.
  if (!firstShow) {
    scrollTo(0, 0);
    view.focus({ preventScroll: true });
  }
  firstShow = false;
}

// Settings' Airfields section (home field, alternates and their approaches) is the SOF's: it shows only while the SOF is
// open. Elsewhere one line names the home field, which still sets the local time in the header (Dad, 10 Oct 2026: "the
// settings for the SOF tab appear on every page"; Patrick approved, relayed by Dad).
const airfieldsPanel = createAirfieldsPanel({ airfields });
const homeLine = h('span', {});
const showHome = () => {
  const field = airfields.home();
  homeLine.textContent = `${field.icao}${field.name ? ` ${field.name}` : ''}`;
};
showHome();
const stopHomeLine = airfields.subscribe(showHome);
const airfieldsNote = {
  element: h('p', { class: 'fine' }, 'Home field: ', homeLine, '. The local time follows it. The home field, alternates and their approaches are set in the SOF Dashboard\'s Settings.'),
  dispose: stopHomeLine,
};
const dialog = createSettingsDialog({
  settings,
  storagePersistent: () => store.persistent,
  sections: [airfieldsPanel, airfieldsNote],
});
/** Shows the Airfields section only on the SOF page, and the one-line note everywhere else. */
function showAirfieldsFor(entryId) {
  const sof = entryId === 'sof';
  const box = (section) => section.element.closest('.settings-section') ?? section.element;
  box(airfieldsPanel).hidden = !sof;
  box(airfieldsNote).hidden = sof;
}
document.body.append(dialog.element);
$('open-settings').addEventListener('click', () => dialog.open());
const updated = $('app-updated');
updated.textContent = updatedLabel(/** @type {HTMLMetaElement | null} */ (document.querySelector('meta[name="app-built"]'))?.content);
updated.title = `Version ${version}`;

// The skip link moves focus without touching the address, which picks the page.
document.querySelector('.skip-link').addEventListener('click', (event) => {
  event.preventDefault();
  view.focus();
});

// Header clock: the first choice in bold, the other beside it (Settings: time order).
const clock = $('app-clock');
const clockFirst = h('time', { class: 'clock-first' });
const clockSecond = h('span', { class: 'clock-second' });
clock.replaceChildren(clockFirst, ' ', clockSecond);
clock.hidden = false;
startClock({
  time,
  settings,
  timers: scheduler.scope('clock'),
  watch: [airfields],
  render(first, second, date) {
    clockFirst.textContent = first;
    clockFirst.dateTime = date.toISOString();
    clockSecond.textContent = second;
  },
});

// Lets the stylesheet follow the "Card videos" choice as well (tokens.css).
const applyMotion = ({ motion }) => {
  document.documentElement.dataset.motion = motion;
};
applyMotion(settings.get());
settings.subscribe(applyMotion);

// Before another page replaces the open module, it may ask (app.canLeave), for
// example when the Debrief holds radar pictures that aren't in a saved file.
// "Cancel" stays put and puts the address and history back.
watchAddress({ win: window, question: () => host.leaveQuestion(), go: show });
show(location.hash);

// Offline copy and the new-version bar, in built copies only: `npm run dev`
// always serves the latest files, and a service worker would get in the way.
// import.meta.env is Vite's; the typecheck doesn't load Vite's types.
if (/** @type {any} */ (import.meta).env?.PROD) {
  const updateBar = createUpdateBar();
  document.querySelector('.app-header').after(updateBar.element);
  let container;
  try {
    container = navigator.serviceWorker; // Firefox throws here when site data is blocked
  } catch {
    container = undefined;
  }
  watchForUpdates({
    container,
    timers: scheduler.scope('updates'),
    onUpdate: (apply) => updateBar.show(apply),
    reload: () => location.reload(),
  });
}

// Read-only view for the browser tests (R4): what's mounted and still running.
/** @type {any} */ (window).__ooda = Object.freeze({
  stats: () => ({ ...host.stats(), ...scheduler.stats() }),
  modules: MODULES.map((m) => m.id),
  exampleText,
});
