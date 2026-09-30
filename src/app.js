// Entry point: builds the shared services and starts the shell.
// See specs/SPEC-shell.md.
import { createStore, browserStorage } from './storage/store.js';
import { createSettings } from './storage/settings.js';
import { createScheduler } from './ui-kit/scheduler.js';
import { createHost } from './shell/host.js';
import { parseRoute } from './shell/router.js';
import { MODULES, moduleIds, findModule, isBuilt } from './shell/registry.js';
import { reportUrl } from './shell/report.js';
import { createSettingsDialog } from './shell/settings-dialog.js';
import { createUpdateBar, watchForUpdates } from './shell/update-bar.js';
import home from './shell/home.js';
import about from './shell/about.js';
import { h } from './ui-kit/dom.js';

// Settings every module shares (D18, #41). Add new shared settings here.
// motion: 'system' follows the computer's reduced-motion setting; 'full' plays
// card videos and animations anyway; 'reduced' shows still pictures only.
export const SHARED_DEFAULTS = { timePrimary: 'zulu', motion: 'system' };
const SHARED_ALLOWED = { timePrimary: ['zulu', 'local'], motion: ['system', 'full', 'reduced'] };

const version = document.querySelector('meta[name="app-version"]')?.content ?? 'dev';
const $ = (id) => document.getElementById(id);

const store = createStore(browserStorage);
const settings = createSettings(store.scope('app'), SHARED_DEFAULTS, { allowed: SHARED_ALLOWED });
const scheduler = createScheduler();
const statusLine = $('module-status');
const view = $('view');
const host = createHost({
  root: view,
  scheduler,
  store,
  settings,
  time: null, // core/time.js formatters, wired in with the clock (tasks/app-frame/todo.md, task 9)
  onStatus: (text) => {
    statusLine.textContent = text;
    statusLine.hidden = !text;
  },
});

const pages = {
  home: { id: 'home', title: 'Home', load: async () => ({ default: home }) },
  about: { id: 'about', title: 'About Dad', load: async () => ({ default: about }) },
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

let firstShow = true;

async function show(hash) {
  const route = parseRoute(hash, moduleIds());
  let entry = pages.home;
  notice(null);
  if (route.name === 'about') entry = pages.about;
  if (route.name === 'not-found') notice(`There's no page at "${route.path}". Here's the home screen.`);
  if (route.name === 'module') {
    const mod = findModule(route.id);
    if (isBuilt(mod)) entry = mod;
    else notice(`${mod.title} is coming soon.`);
  }

  $('report-problem').href = reportUrl({ page: entry.title, version });
  document.title = entry === pages.home ? "DAD's OODA LOOP" : `${entry.title} · DAD's OODA LOOP`;
  statusLine.hidden = true;
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

const dialog = createSettingsDialog({ settings, storagePersistent: () => store.persistent });
document.body.append(dialog.element);
$('open-settings').addEventListener('click', () => dialog.open());
$('app-version').textContent = version;

// The skip link moves focus without touching the address, which picks the page.
document.querySelector('.skip-link').addEventListener('click', (event) => {
  event.preventDefault();
  view.focus();
});

// Lets the stylesheet follow the "Card videos" choice as well (tokens.css).
const applyMotion = ({ motion }) => {
  document.documentElement.dataset.motion = motion;
};
applyMotion(settings.get());
settings.subscribe(applyMotion);

window.addEventListener('hashchange', () => show(location.hash));
show(location.hash);

// Offline copy and the new-version bar, in built copies only: `npm run dev`
// always serves the latest files, and a service worker would get in the way.
if (import.meta.env?.PROD) {
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
window.__ooda = Object.freeze({
  stats: () => ({ ...host.stats(), ...scheduler.stats() }),
  modules: MODULES.map((m) => m.id),
});
