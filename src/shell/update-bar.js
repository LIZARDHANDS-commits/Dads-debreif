// Registers the service worker and shows the "new version" bar when an update
// has downloaded (D15). The page switches only when someone presses Reload, so
// nobody loses work mid-debrief, and nobody stays on an old version untold.
import { h } from '../ui-kit/dom.js';

const HOUR = 60 * 60 * 1000;

export function createUpdateBar() {
  const reload = h('button', { type: 'button', class: 'primary' }, 'Reload');
  const element = h(
    'div',
    { class: 'update-bar', role: 'status', hidden: true },
    h('span', {}, 'A new version is ready.'),
    reload,
  );
  return {
    element,
    // Shows the bar; onReload runs when Reload is pressed.
    show(onReload) {
      reload.onclick = () => {
        reload.disabled = true;
        onReload();
      };
      element.hidden = false;
    },
  };
}

// container: navigator.serviceWorker. timers: a scheduler scope, used to look for
// updates every hour while the app stays open (the SOF screen runs all day).
// Resolves to the registration, or null when this browser can't work offline.
export async function watchForUpdates({ container, url = './sw.js', timers, onUpdate, reload, checkEveryMs = HOUR }) {
  if (!container) return null;
  // Started before registering, so the shell's timer count is settled from the
  // first frame (the R4 browser test compares against it).
  let registration = null;
  timers?.every(checkEveryMs, () => registration?.update().catch(() => {})); // offline: try next hour
  try {
    registration = await container.register(url);
  } catch (err) {
    console.warn("Offline mode isn't available in this browser:", err);
    return null;
  }

  let reloading = false;
  let offered = null;
  const offer = (worker) => {
    if (offered === worker) return;
    offered = worker;
    onUpdate(() => {
      reloading = true;
      worker.postMessage({ type: 'skip-waiting' });
    });
  };
  // With no controller yet this is the first install, not an update.
  const isUpdate = () => Boolean(container.controller);

  if (registration.waiting && isUpdate()) offer(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && isUpdate()) offer(worker);
    });
  });
  container.addEventListener('controllerchange', () => {
    if (reloading) reload();
  });
  return registration;
}
