// The SOF Dashboard (specs/SPEC-sof.md): the weather at home and the alternates.
// This is task 2, "a screen with live weather": the SOF bar, the airfield cards
// and the refresh. mount() wires the weather feed, the airfields, the settings and
// the clock to the screen; everything it starts is stopped when the module
// closes, because every timer is on the module's scheduler scope and every
// request is cancelled by unmount (R4, audit #11).
import { createSettings } from '../../storage/settings.js';
import { h } from '../../ui-kit/dom.js';
import { SETTINGS_DEFAULTS } from './settings-model.js';
import { createSettingsView } from './settings-view.js';
import { createWeather } from './weather.js';
import { buildScreen } from './screen-model.js';
import { createLayout } from './layout.js';

const STYLESHEET = new URL('./sof.css', import.meta.url).href;
/** Ages and the DTG are minutes; the screen is checked this often and touches the page only when a word changes. */
const TICK_MS = 15_000;

function mount(root, app) {
  const stylesheet = h('link', { rel: 'stylesheet', href: STYLESHEET });
  document.head.append(stylesheet);

  const settings = createSettings(app.storage, SETTINGS_DEFAULTS);
  const settingsView = createSettingsView({ settings });
  const weather = createWeather({
    stations: () => app.airfields.stations(),
    fetch: (url, init) => globalThis.fetch(url, init),
    timers: app.scheduler,
    store: app.storage,
    now: () => app.time.now(),
    onChange: () => render(),
  });
  const ui = createLayout({ settingsElement: settingsView.element, onRefresh: () => weather.refresh() });
  root.append(ui.element);

  function render() {
    const snapshot = weather.snapshot();
    ui.setBusy(snapshot.busy);
    ui.render(buildScreen({ airfields: app.airfields, snapshot, limits: settings.get(), now: app.time.now() }));
  }

  const stops = [
    settings.subscribe(render),
    // New stations mean a new list to ask for; anything else (minima, names) only changes the cards.
    app.airfields.subscribe(() => {
      weather.restartIfChanged();
      render();
    }),
    app.scheduler.every(TICK_MS, render),
  ];
  // Back from a hidden tab or a sleeping computer: ask at once if a round is due, and redraw the ages.
  app.listen(document, 'visibilitychange', () => {
    if (document.hidden) return;
    weather.wake();
    render();
  });

  render();
  weather.start();

  return () => {
    weather.stop();
    for (const stop of stops) stop();
    settingsView.dispose();
    stylesheet.remove();
  };
}

export default { id: 'sof', title: 'SOF Dashboard', mount };
