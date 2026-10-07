// The SOF Dashboard (specs/SPEC-sof.md): the weather at home and the alternates, and the map.
// The SOF bar and airfield cards (task 2), the caution banner (task 3), the waves (task 4), the
// 24-hour timeline (task 5) and the map (tasks 6 and 7). mount() wires the weather feed, the map, the
// airfields, the settings, the wave plan and the clock to the screen; everything it starts is stopped
// when the module closes, because every timer is on the module's scheduler scope and every request is
// cancelled by unmount (R4, audit #11).
import { h } from '../../ui-kit/dom.js';
import { createSofSettings, createCrosswindSettings } from './settings-model.js';
import { crosswindFor } from './crosswind.js';
import { createSettingsView } from './settings-view.js';
import { createWeather } from './weather.js';
import { buildScreen } from './screen-model.js';
import { createLayout } from './layout.js';
import { createSofMap } from './map.js';
import { createBannerView } from './banner-view.js';
import { ACKS_KEY, buildBanner, tafInputs, acksAfterOne, acksAfterAll, memoryAfterOne, memoryAfterAll } from './banner-model.js';
import { createPlanStore } from './plan-store.js';
import { buildWaves } from './waves-view-model.js';
import { createWavesView } from './waves-view.js';
import { buildTimelineView } from './timeline-view-model.js';
import { tafNotes } from './taf-state.js';
import { createTimelineView } from './timeline-view.js';
import { createTimelineStrip } from './timeline-strip.js';
import { createDropdowns } from './dropdown.js';
import { createFullScreen } from './fullscreen.js';
import { createNotamFeed, notamUrl, notamsFor } from './notams.js';
import { createAlertsFeed, alertsUrl, alertsFor } from './alerts.js';

const STYLESHEET = new URL('./sof.css', import.meta.url).href;
/** Ages and the DTG are minutes; the screen is checked this often and touches the page only when a word changes. */
const TICK_MS = 15_000;

function mount(root, app) {
  const stylesheet = h('link', { rel: 'stylesheet', href: STYLESHEET });
  document.head.append(stylesheet);

  const settings = createSofSettings(app.storage);
  const crosswind = createCrosswindSettings(app.storage); // the crosswind levels and the runway state (SOF-43), in their own stored document
  // The drop-downs over the screen (SOF settings, the clocks, the caution list, a wave's boxes): one open at a time (SOF-38).
  const dropdowns = createDropdowns({ listen: app.listen });
  const settingsView = createSettingsView({ settings, crosswind, onToggle: () => ui.closeSettings() });
  const weather = createWeather({
    stations: () => app.airfields.stations(),
    fetch: (url, init) => globalThis.fetch(url, init),
    timers: app.scheduler,
    store: app.storage,
    now: () => app.time.now(),
    onChange: () => render(),
  });
  // Full screen holds the whole SOF picture (Dad, 7 Oct): the map (2D or 3D), the airfield column and the timeline strip. One state, shared by the 2D and 3D buttons.
  const fullScreen = createFullScreen({ target: () => ui.body, listen: app.listen });
  const map = createSofMap({ app, settings, onLightning: () => render(), fullScreen });
  // NOTAMs for home and the alternates, through the relay (SOF-42): every 5 minutes while open, paused while the tab is hidden. They need the relay address.
  const notamFeed = createNotamFeed({
    address: () => notamUrl({ baseUrl: settings.get().trafficRelay, sites: app.airfields.stations() }),
    paused: () => document.hidden,
    fetch: (url, init) => globalThis.fetch(url, init),
    timers: app.scheduler,
    now: () => app.time.now(),
    onChange: () => render(),
  });
  // SIGMETs, AIRMETs and PIREPs near home and the alternates, through the relay (Dad, 7 Oct): every 10 minutes while open, for the cards and the 3D view.
  const alertsFeed = createAlertsFeed({
    address: () => alertsUrl({ baseUrl: settings.get().trafficRelay, sites: app.airfields.stations() }),
    paused: () => document.hidden,
    fetch: (url, init) => globalThis.fetch(url, init),
    timers: app.scheduler,
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
    dropdowns,
  });
  // The waves (task 4): the daily plan in home local time, kept in the module's storage.
  const plan = createPlanStore({ store: app.storage, context: () => ({ now: app.time.now(), timeZone: app.time.zone }) });
  let selectedId; // undefined is the first wave with a call; the alternate cards show this wave's result
  const wavesView = createWavesView({
    onAdd: () => plan.add(),
    onEdit: (id, patch) => plan.edit(id, patch),
    onRemove: (id) => plan.remove(id),
    onDay: (day) => plan.setDay(day),
    // Pressing a chip selects its wave (the view opens its boxes and hits in a panel over the screen).
    onSelect: (id) => {
      selectedId = id;
      render();
    },
    dropdowns,
  });
  // The 24-hour timeline (task 5): the full one, the waves in its header, opens over the screen from the thin strip along the bottom (SOF-38, Dad 7 Oct).
  const timelineView = createTimelineView({ header: wavesView.element });
  const timelineStrip = createTimelineStrip({ full: timelineView.element, dropdowns, timers: app.scheduler, listen: app.listen, storage: app.storage });
  const ui = createLayout({
    settings: settingsView,
    dropdowns,
    mapElement: map.element,
    mapCredits: map.credits,
    onRefresh: () => weather.refresh(),
    bannerElement: bannerView.element,
    wavesElement: wavesView.element,
    timelineElement: timelineStrip.element,
    timers: app.scheduler,
    listen: app.listen,
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
    // The near-home lightning reading is the map's; its caution goes into the screen's list (and so onto the banner).
    const screen = buildScreen({ airfields: app.airfields, snapshot, limits, now, lightning: map.lightning(now), timeZone: app.time.zone });
    const tafs = Object.fromEntries(Object.entries(snapshot.taf).map(([icao, entry]) => [icao, entry?.report ?? null]));
    const notes = tafNotes({ snapshot, now }); // a stale or failed TAF is said on the chips and the timeline rows too
    // Crosswind per runway (SOF-43) for each card from its METAR's wind; red on every runway end at home goes on the banner, amber stays on the card.
    const xwSettings = crosswind.get();
    const winds = new Map(screen.cards.map((c) => {
      const conditions = snapshot.metar[c.icao]?.report?.conditions ?? null;
      return [c.icao, crosswindFor({ icao: c.icao, role: c.role, metar: c.metar, wind: conditions?.wind ?? null, weather: conditions?.weather ?? [], settings: xwSettings })];
    }));
    const xwCautions = [...winds.values()].map((x) => x?.caution).filter(Boolean);
    const waves = buildWaves({ plan: plan.get(), airfields: app.airfields, tafs, limits, now, timeZone: app.time.zone, selectedId, tafNotes: notes });
    banner = buildBanner({
      cards: screen.cards,
      tafs: tafInputs({ tafs, calls: waves.calls, homeIcao: app.airfields.home().icao, homeLimits: limits, now, timeZone: app.time.zone }),
      // Other writers' cautions (lightning near home) arrive on the screen model in cautions.js's shape.
      extra: [...(screen.extraCautions ?? []), ...xwCautions],
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
    wavesView.render(waves);
    // Redrawn only when its picture changes (its signature); the now line moves on its own.
    const timeline = buildTimelineView({
      airfields: app.airfields,
      snapshot,
      limits,
      waves: waves.waves,
      day: waves.day,
      now,
      timeZone: app.time.zone,
      tafNotes: notes,
      timePrimary: app.settings?.get().timePrimary, // Settings' time order: Zulu first unless local is chosen
    });
    timelineView.render(timeline);
    timelineStrip.render(timeline);
    ui.setBusy(snapshot.busy);
    // Each alternate card shows its result for the selected wave, and every card its NOTAMs (never "No NOTAMs" unless a fresh good answer lists none).
    notamFeed.sync();
    alertsFeed.sync();
    const notamState = notamFeed.state();
    const alertsState = alertsFeed.state();
    const fields = new Map([app.airfields.home(), ...app.airfields.alternates()].map((f) => [f.icao, f]));
    ui.render({
      ...screen,
      cards: screen.cards.map((c) => ({
        ...c,
        ...(waves.altLines.has(c.icao) ? { waveLine: waves.altLines.get(c.icao) } : {}),
        crosswind: winds.get(c.icao) ?? null,
        notams: notamsFor(notamState, c.icao, now),
        // SIGMETs, AIRMETs and PIREPs within 100 NM, after the NOTAMs (never "none" unless a fresh answer has none near the field).
        alerts: alertsFor(alertsState, fields.get(c.icao) ?? { icao: c.icao }, now),
      })),
    });
    map.update({ snapshot, screen, alerts: alertsState });
  }

  const stops = [
    settings.subscribe(render),
    crosswind.subscribe(render),
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
    notamFeed.wake();
    alertsFeed.wake();
    map.wake();
    render();
  });

  render();
  weather.start();

  return () => {
    map.dispose();
    fullScreen.dispose();
    notamFeed.stop();
    alertsFeed.stop();
    weather.stop();
    for (const stop of stops) stop();
    settingsView.dispose();
    stylesheet.remove();
  };
}

export default { id: 'sof', title: 'SOF Dashboard', mount };
