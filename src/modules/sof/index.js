// The SOF Dashboard (specs/SPEC-sof.md): the weather at home and the alternates, and the map.
// Tasks 2 and 6: the SOF bar, the airfield cards, the refresh, and the map with radar, lightning
// and traffic. mount() wires the weather feed, the map, the airfields, the settings and
// the clock to the screen; everything it starts is stopped when the module
// closes, because every timer is on the module's scheduler scope and every
// request is cancelled by unmount (R4, audit #11).
import { h } from '../../ui-kit/dom.js';
import { createSofSettings } from './settings-model.js';
import { createSettingsView } from './settings-view.js';
import { createWeather } from './weather.js';
import { buildScreen } from './screen-model.js';
import { createLayout } from './layout.js';
import { createSofMap } from './map.js';

const STYLESHEET = new URL('./sof.css', import.meta.url).href;
/** Ages and the DTG are minutes; the screen is checked this often and touches the page only when a word changes. */
const TICK_MS = 15_000;

function mount(root, app) {
  const stylesheet = h('link', { rel: 'stylesheet', href: STYLESHEET });
  document.head.append(stylesheet);

  const settings = createSofSettings(app.storage);
  const settingsView = createSettingsView({ settings });
  const weather = createWeather({
    stations: () => app.airfields.stations(),
    fetch: (url, init) => globalThis.fetch(url, init),
    timers: app.scheduler,
    store: app.storage,
    now: () => app.time.now(),
    onChange: () => render(),
  });
  const map = createSofMap({ app, settings });
  const ui = createLayout({ settingsElement: settingsView.element, mapElement: map.element, onRefresh: () => weather.refresh() });
  root.append(ui.element);

  function render() {
    const snapshot = weather.snapshot();
    const now = app.time.now();
    ui.setBusy(snapshot.busy);
    // The near-home lightning reading is the map's; its caution goes into the screen's list.
    const screen = buildScreen({ airfields: app.airfields, snapshot, limits: settings.get(), now, lightning: map.lightning(now) });
    ui.render(screen);
    map.update({ snapshot, screen });
  }

  const stops = [
    settings.subscribe(render),
    // New stations mean a new list to ask for; anything else (minima, names) only changes the cards.
    app.airfields.subscribe(() => {
      weather.restartIfChanged();
      render();
    }),
    // A hidden tab draws nothing; the visibilitychange handler below redraws when it comes back.
    app.scheduler.every(TICK_MS, () => {
      if (!document.hidden) render();
    }),
  ];
  // Back from a hidden tab or a sleeping computer: ask at once if a round is due, and redraw the ages.
  app.listen(document, 'visibilitychange', () => {
    if (document.hidden) return;
    weather.wake();
    map.wake();
    render();
  });

  render();
  weather.start();

  return () => {
    map.dispose();
    weather.stop();
    for (const stop of stops) stop();
    settingsView.dispose();
    stylesheet.remove();
  };
}

export default { id: 'sof', title: 'SOF Dashboard', mount };
