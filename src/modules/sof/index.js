// The SOF Dashboard (specs/SPEC-sof.md): the weather at home and the alternates.
// The SOF bar and airfield cards (task 2), the caution banner (task 3), the waves
// (task 4) and the 24-hour timeline (task 5). mount() wires the weather feed, the
// airfields, the settings, the wave plan and the clock to the screen; everything it
// starts is stopped when the module closes, because every timer is on the module's
// scheduler scope and every request is cancelled by unmount (R4, audit #11).
import { h } from '../../ui-kit/dom.js';
import { createSofSettings } from './settings-model.js';
import { createSettingsView } from './settings-view.js';
import { createWeather } from './weather.js';
import { buildScreen } from './screen-model.js';
import { createLayout } from './layout.js';
import { createBannerView } from './banner-view.js';
import { ACKS_KEY, buildBanner, tafInputs, acksAfterOne, acksAfterAll, memoryAfterOne, memoryAfterAll } from './banner-model.js';
import { createPlanStore } from './plan-store.js';
import { buildWaves } from './waves-view-model.js';
import { createWavesView } from './waves-view.js';
import { buildTimelineView } from './timeline-view-model.js';
import { tafNotes } from './taf-state.js';
import { createTimelineView } from './timeline-view.js';

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
  // The caution banner (task 3). Acknowledgements are kept for the day in the module's storage.
  let banner = null; // the last banner model, for the buttons
  let shownKeys = []; // what was on the banner last time, to announce only what is new
  let sessionAcks = []; // acknowledged this visit when nothing can be stored (no readable day)
  const bannerView = createBannerView({
    onAcknowledge: (key) => keepAcks(acksAfterOne(banner, key), memoryAfterOne(banner, key)),
    onAcknowledgeAll: () => keepAcks(acksAfterAll(banner), memoryAfterAll(banner)),
    focusAfter: () => ui.focusAfterBanner(),
  });
  // The waves (task 4): the daily plan in home local time, kept in the module's storage.
  const plan = createPlanStore({ store: app.storage, context: () => ({ now: app.time.now(), timeZone: app.time.zone }) });
  let selectedId; // undefined is the first wave with a call; the alternate cards show this wave's result
  let detailOpen = false; // the list of every hit, opened by pressing a wave's chip
  let selectedNow = null; // the wave selected as last drawn
  const wavesView = createWavesView({
    onAdd: () => plan.add(),
    onEdit: (id, patch) => plan.edit(id, patch),
    onRemove: (id) => plan.remove(id),
    onDay: (day) => plan.setDay(day),
    // Pressing a chip selects its wave and opens its hits; pressing the selected wave's chip again closes them.
    onSelect: (id) => {
      if (id === selectedNow && detailOpen) detailOpen = false;
      else {
        selectedId = id;
        detailOpen = true;
      }
      render();
    },
  });
  // The 24-hour timeline (task 5). Open or closed is kept as a convenience, open to begin with.
  const timelineView = createTimelineView({
    collapsed: app.storage.get('timelineCollapsed', false) === true,
    onToggle: (collapsed) => app.storage.set('timelineCollapsed', collapsed),
  });
  const ui = createLayout({
    settingsElement: settingsView.element,
    onRefresh: () => weather.refresh(),
    bannerElement: bannerView.element,
    wavesElement: wavesView.element,
    timelineElement: timelineView.element,
  });
  root.append(ui.element);

  // Stored for the day when it can be, else kept in memory for the visit, so Acknowledge always works.
  function keepAcks(acks, memory) {
    if (acks) app.storage.set(ACKS_KEY, acks);
    else if (memory) sessionAcks = memory;
    render();
  }

  function render() {
    const snapshot = weather.snapshot();
    const now = app.time.now();
    const limits = settings.get();
    const screen = buildScreen({ airfields: app.airfields, snapshot, limits, now, timeZone: app.time.zone });
    const tafs = Object.fromEntries(Object.entries(snapshot.taf).map(([icao, entry]) => [icao, entry?.report ?? null]));
    const notes = tafNotes({ snapshot, now }); // a stale or failed TAF is said on the chips and the timeline rows too
    const waves = buildWaves({ plan: plan.get(), airfields: app.airfields, tafs, limits, now, timeZone: app.time.zone, selectedId, tafNotes: notes });
    banner = buildBanner({
      cards: screen.cards,
      tafs: tafInputs({ tafs, calls: waves.calls, homeIcao: app.airfields.home().icao, now, timeZone: app.time.zone }),
      // Other writers' cautions (lightning near home) arrive on the screen model in cautions.js's shape.
      extra: screen.extraCautions ?? [],
      acks: app.storage.get(ACKS_KEY, null),
      now,
      timeZone: app.time.zone,
      enabled: limits.banner,
      shown: shownKeys,
      memory: sessionAcks,
    });
    sessionAcks = banner.memory; // pruned to what is still reported
    if (banner.write) app.storage.set(ACKS_KEY, banner.acks); // only when it changed, and only when it can be told which day
    shownKeys = banner.show ? banner.lines.map((l) => l.key) : [];
    bannerView.render(banner);
    selectedNow = waves.selectedId;
    wavesView.render(waves, { detailOpen });
    // Redrawn only when its picture changes (its signature); the now line moves on its own.
    timelineView.render(buildTimelineView({
      airfields: app.airfields,
      snapshot,
      limits,
      waves: waves.waves,
      day: waves.day,
      now,
      timeZone: app.time.zone,
      tafNotes: notes,
      timePrimary: app.settings?.get().timePrimary, // Settings' time order: Zulu first unless local is chosen
    }));
    ui.setBusy(snapshot.busy);
    // Each alternate card shows its result for the selected wave.
    ui.render({ ...screen, cards: screen.cards.map((c) => (waves.altLines.has(c.icao) ? { ...c, waveLine: waves.altLines.get(c.icao) } : c)) });
  }

  const stops = [
    settings.subscribe(render),
    plan.subscribe(render),
    ...(app.settings ? [app.settings.subscribe(render)] : []), // the app-wide time order (Zulu or local first) sets the timeline's axis
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
