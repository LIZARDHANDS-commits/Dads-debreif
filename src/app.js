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
import home from './shell/home.js';
import about from './shell/about.js';

// Settings every module shares (D18, #41). Add new shared settings here.
export const SHARED_DEFAULTS = { timePrimary: 'zulu', reduceMotion: 'system' };
const SHARED_ALLOWED = { timePrimary: ['zulu', 'local'], reduceMotion: ['system', 'on', 'off'] };

const version = document.querySelector('meta[name="app-version"]')?.content ?? 'dev';
const $ = (id) => document.getElementById(id);

const store = createStore(browserStorage);
const settings = createSettings(store.scope('app'), SHARED_DEFAULTS, { allowed: SHARED_ALLOWED });
const scheduler = createScheduler();
const statusLine = $('module-status');
const host = createHost({
  root: $('view'),
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
    notice(`${entry.title} couldn't open. Please use Report a problem, then try Home.`);
  }
}

const dialog = createSettingsDialog({ settings, storagePersistent: () => store.persistent });
document.body.append(dialog.element);
$('open-settings').addEventListener('click', () => dialog.open());
$('app-version').textContent = version;

window.addEventListener('hashchange', () => show(location.hash));
show(location.hash);

// Read-only view for the browser tests (R4): what's mounted and still running.
window.__ooda = Object.freeze({
  stats: () => ({ ...host.stats(), ...scheduler.stats() }),
  modules: MODULES.map((m) => m.id),
});
