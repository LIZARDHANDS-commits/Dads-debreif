// The Debrief Viewer (specs/SPEC-debrief.md): load up to four ForeFlight
// tracks or the example flight, see them on the map, and play them back.
// mount() builds the screen and wires the flight, the clock and the map
// together; everything it starts is stopped by the shell when it closes (R4).
import { h } from '../../ui-kit/dom.js';
import { createSettings } from '../../storage/settings.js';
import { createControls } from '../../ui-kit/controls.js';
import { loadFlight } from '../../flight-data/load.js';
import { loadExampleFlight } from '../../flight-data/examples.js';
import { createClock } from '../../flight-data/clock.js';
import { LAYOUT_DEFAULTS, checkPicked } from './state.js';
import { createLayout } from './layout.js';
import { createMapView } from './map2d/view.js';
import { createPlaybackBar } from './playback-bar.js';

const STYLESHEET = new URL('./debrief.css', import.meta.url).href;

function mount(root, app) {
  const stylesheet = h('link', { rel: 'stylesheet', href: STYLESHEET });
  document.head.append(stylesheet);

  const layout = createSettings(app.storage, LAYOUT_DEFAULTS);
  const controls = createControls(layout);
  const bar = createPlaybackBar({ time: app.time });
  const ui = createLayout({ layout, controls, bar, canExample: typeof app.exampleText === 'function', listen: app.listen });
  root.append(ui.element);

  let clock = null;
  let stopClock = null;
  let stopFrames = null;
  let busy = false;
  let closed = false; // a load still running when the debrief closes must not land

  const map = createMapView(ui.canvas, {
    timers: app.scheduler,
    time: () => clock?.t ?? 0,
    layers: () => layout.get(),
  });

  // The scheduler runs the clock only while playing; paused, nothing runs (#43).
  function onClock() {
    if (clock.playing && !stopFrames) stopFrames = app.scheduler.frame((dt, now) => clock.tick(now));
    if (!clock.playing && stopFrames) {
      stopFrames();
      stopFrames = null;
    }
    bar.sync();
    map.requestDraw();
  }

  // Swaps in a new flight only once it has loaded completely (D54).
  function show(next) {
    stopFrames?.();
    stopFrames = null;
    stopClock?.();
    clock = createClock({ startT: next.startT, endT: next.endT });
    stopClock = clock.onChange(onClock);
    bar.setClock(clock);
    map.setFlight(next);
    ui.showFlight(next);
    app.status(`Debrief: ${ui.summary()}`);
  }

  async function run(what, work) {
    if (busy) return;
    busy = true;
    ui.setBusy(what);
    try {
      const next = await work();
      if (closed) return;
      show(next);
      ui.setMessage(null);
    } catch (err) {
      if (closed) return;
      // A KmlError's message names the file and the reason; anything without a
      // message for the user is unexpected, so it's logged for a bug report.
      const told = err?.name === 'KmlError' ? err.message : err?.userMessage;
      if (!told) console.error(err);
      ui.setMessage(`${told ?? `${what} failed.`} Nothing was changed.`);
    } finally {
      busy = false;
      ui.setBusy(null);
    }
  }

  ui.onPick((files) => {
    const problem = checkPicked(files);
    if (problem) ui.setMessage(problem);
    else ui.showPicker(files);
  });
  ui.onLoad((picked) =>
    run('Loading the tracks', async () => {
      const texts = await Promise.all(picked.map((p) => p.file.text()));
      return loadFlight(picked.map((p, i) => ({ slot: p.slot, name: p.file.name, text: texts[i] })));
    }),
  );
  ui.onExample(() =>
    run('Loading the example flight', () =>
      loadExampleFlight(app.exampleText).catch((err) => {
        if (err?.name === 'KmlError') throw err;
        const failed = new Error('Example flight download failed', { cause: err });
        failed.userMessage = "The example flight couldn't be downloaded. Check the connection and try again.";
        throw failed;
      }),
    ),
  );
  ui.onFit(() => map.fit());
  ui.onReset(() => layout.reset());

  const stopLayout = layout.subscribe((values) => {
    ui.applyLayout(values);
    map.requestDraw();
  });

  app.keys({
    Space: () => clock && (clock.playing ? clock.pause() : clock.play()),
    ArrowLeft: () => clock?.step(-1),
    ArrowRight: () => clock?.step(1),
    Home: () => clock?.reset(),
  });
  // The time's order follows Settings; the local zone follows the home field.
  app.settings.subscribe(() => bar.sync());
  app.airfields?.subscribe(() => bar.sync());

  return () => {
    closed = true;
    stopFrames?.();
    stopClock?.();
    stopLayout();
    controls.dispose();
    map.dispose();
    stylesheet.remove();
  };
}

export default { id: 'debrief', title: 'Debrief Viewer', mount };
