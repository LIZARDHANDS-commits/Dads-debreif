// Registers the service worker and shows the "new version" bar when an update
// has downloaded (D15). The page switches only when someone presses Reload, so
// nobody loses work mid-debrief, and nobody stays on an old version untold.
import { h } from '../ui-kit/dom.js';

const HOUR = 60 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;

export function createUpdateBar() {
  // The live region stays in the page; only its contents come and go.
  const element = h('div', { class: 'update-region', role: 'status' });
  return {
    element,
    // Shows the bar (or refreshes it); onReload runs when Reload is pressed.
    show(onReload) {
      const reload = h('button', { type: 'button', class: 'primary' }, 'Reload');
      reload.addEventListener('click', () => {
        reload.disabled = true;
        onReload();
      });
      element.replaceChildren(h('div', { class: 'update-bar' }, h('span', {}, 'A new version is ready.'), reload));
    },
  };
}

// container: navigator.serviceWorker. timers: a scheduler scope, used to look for
// updates every hour while the app stays open (the SOF screen runs all day). It
// also looks when the tab comes back into view, at most every five minutes, so
// someone returning to a tab left open doesn't wait up to an hour for the bar.
// Resolves to the registration, or null when this browser can't work offline.
export async function watchForUpdates({ container, url = './sw.js', timers, onUpdate, reload, checkEveryMs = HOUR, doc = globalThis.document, now = () => Date.now() }) {
  if (!container) return null;
  // Started before registering, so the shell's timer count is settled from the
  // first frame (the R4 browser test compares against it).
  let registration = null;
  let lastCheck = now();
  const check = () => {
    lastCheck = now();
    registration?.update().catch(() => {}); // offline: try again later
  };
  timers?.every(checkEveryMs, check);
  doc?.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'visible' && now() - lastCheck >= FIVE_MINUTES) check();
  });
  try {
    registration = await container.register(url);
  } catch (err) {
    console.warn("Offline mode isn't available in this browser:", err);
    return null;
  }
  // Some browsers that block service workers resolve with nothing instead of refusing.
  if (!registration) return null;

  let reloading = false;
  let offered = null;
  const offer = (worker) => {
    if (offered === worker) return;
    offered = worker;
    onUpdate(() => {
      reloading = true;
      // Still waiting: tell it to take over, then reload on controllerchange.
      // Already active (Reload was pressed in another tab) or replaced: just reload.
      if (worker.state === 'installed') worker.postMessage({ type: 'skip-waiting' });
      else reload();
    });
  };
  // With no controller yet this is the first install, not an update.
  const isUpdate = () => Boolean(container.controller);
  let controlled = isUpdate();

  if (registration.waiting && isUpdate()) offer(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && isUpdate()) offer(worker);
    });
  });
  container.addEventListener('controllerchange', () => {
    if (reloading) {
      reload();
      return;
    }
    // A new version took over without this tab asking (Reload was pressed in
    // another tab). This page's code is now older than the cache, so offer a reload.
    if (controlled) {
      offered = null;
      onUpdate(() => {
        reloading = true;
        reload();
      });
    }
    controlled = true;
  });
  return registration;
}
