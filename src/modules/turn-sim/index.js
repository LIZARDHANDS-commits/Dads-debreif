// The Formation Turn Sim, first version (docs/modules/turn-sim/spec.md): a
// 2-ship in line abreast that flies along on its own; press a manoeuvre button
// and the pair flies it, then carries on. mount() builds the screen and wires the
// formation, the picture and the buttons together; everything it starts runs on
// the shell's scheduler and listeners, so the shell stops it all when the Turn
// Sim closes (R4).
//
// The formation is always flown in fixed 0.05 s steps (TS-R9): playback speed
// changes how many steps run per frame, never their size, so the same presses at
// the same times give the same picture at any frame rate.
//
// The plan-mode engine (engine/), its settings (settings.js, fields.js) and
// readouts (readouts.js) stay in the repo, untouched, until Patrick agrees to
// retire them; this screen no longer uses them.
import { createSettings } from '../../storage/settings.js';
import { createControls } from '../../ui-kit/controls.js';
import { STEP_SEC } from './live/flight.js';
import { MANOEUVRES, relativeTo, turnRadiusAt } from './live/manoeuvres.js';
import { createFormation, LIVE_DEFAULTS, checkSpacing, compassDeg, fixedLine, intoOrAway, labelFor } from './live/formation.js';
import { ERROR_DEFAULTS, ERROR_ALLOWED, errorCardLines } from './live/errors.js';
import { FOUR_SHIP_KEYS, fourShipLine } from './live/four-ship.js';
import { cardForFour } from './live/four-ship-card.js';
import { G_WARM } from './live/g-warm.js';
import { rejoinReadout } from './live/transitions.js';
import { createChangeUi } from './transitions-panel.js';
import { createLayout, LAYOUT_DEFAULTS, LAYOUT_ALLOWED, LAYOUT_VERSION, SHIP_COLORS } from './layout.js';
import { createTurnSimView } from './view.js';
import { createView3d } from './view3d.js';

const STYLESHEET = new URL('./turn-sim.css', import.meta.url).href;

/** Most steps run in one frame, so a tab that was hidden can't freeze the page catching up. */
const MAX_STEPS_PER_FRAME = 40;
/** The card updates at most this often while playing. */
const READOUT_MS = 100;
/** The follow camera keeps this much room around the pair: a turn circle and a bit more, each side. */
const FOLLOW_MARGIN_FT = 1500;
/** Closer than this the camera zooms in by itself, so the close formations can be seen (spec section 10). */
const CLOSE_ZOOM_FT = 1000;
/** The tightest picture the auto-zoom asks for, feet across: an echelon is about 45 ft apart. */
const CLOSE_SPAN_MIN_FT = 250;

/** The buttons, in screen order (spec section 3). */
const BUTTONS = ['delayed90', 'delayed45', 'check', 'inPlace90', 'hook', 'shackle', 'crossTurn'].map((key) => ({
  key,
  label: MANOEUVRES[key].label,
  sided: MANOEUVRES[key].sided,
  ships: FOUR_SHIP_KEYS.includes(key) ? [2, 4] : [2], // the shackle and cross turn are not approved in Spread 4 (SMM 16.43 para 118)
}));
// G-warm, from Spread 4 (SMM 16.44 para 120; AFM8 brief p.16): one button, the four-ship's only for now.
BUTTONS.push({ key: G_WARM.key, label: G_WARM.label, sided: false, ships: [4] });

/** The setup isn't remembered between visits (saved setups are a later step), so it lives in memory. */
function memoryStore() {
  const docs = new Map();
  return { get: (name, fallback) => (docs.has(name) ? docs.get(name) : fallback), set: (name, value) => docs.set(name, value) };
}

/** Layout (open columns, layers) is remembered in this browser under one name, so it can't clash with other documents. */
function layoutStore(storage) {
  return { get: (_name, fallback) => storage.get('layout', fallback), set: (_name, value) => storage.set('layout', value) };
}

const SETUP_DEFAULTS = Object.freeze({ ships: LIVE_DEFAULTS.ships, check45: LIVE_DEFAULTS.check45, spacingFt: LIVE_DEFAULTS.spacingFt, wingSide: LIVE_DEFAULTS.wingSide, ...ERROR_DEFAULTS });

const ftText = (n) => `${Math.round(n).toLocaleString('en-CA')} ft`;
const bankText = (deg) => (Math.abs(deg) < 0.5 ? 'wings level' : `bank ${Math.round(Math.abs(deg))}° ${deg > 0 ? 'L' : 'R'}`);

/** The Formation card's words for the state now. */
function cardFor(state, wingSide) {
  const [lead, wing] = state.aircraft;
  const rel = relativeTo(lead, wing);
  const across = Math.abs(rel.left);
  const sweepDeg = Math.atan2(-rel.fwd, Math.max(across, 1)) * 180 / Math.PI;
  const c = state.current;
  let flying = `Flying straight on ${String(compassDeg(lead.headingRad)).padStart(3, '0')}, waiting for a button.`;
  if (c?.change) {
    flying = `Flying: ${c.change.flying}`;
  } else if (c) {
    const sided = MANOEUVRES[c.key].sided;
    flying = `Flying: ${c.label}${sided ? ` (${intoOrAway(c.dir, wingSide)})` : ''}`;
  }
  const j = state.judged;
  let judged = null;
  if (j?.text) {
    judged = { text: j.text, tone: j.tone }; // a change of formation, judged against the spec table
  } else if (j) {
    const words = j.labels.join(', ');
    const numbers = j.shape === 'trail'
      ? `${ftText(j.gapFt)} in trail, ${ftText(Math.abs(j.offsetFt))} off line`
      : `${ftText(j.acrossFt)} abeam, ${ftText(Math.abs(j.foreAftFt))} ${j.foreAftFt >= 0 ? 'ahead of' : 'behind'} Lead's 3/9 line`;
    const good = j.labels[0] === 'ON SPACING' || j.labels[0] === 'IN TRAIL';
    judged = { text: `${j.label}: ${words}, ${numbers}.`, tone: good ? 'good' : 'caution' };
  }
  return {
    flying,
    note: c?.note ?? null,
    queued: state.queued?.label ?? null,
    nowLines: [
      `Spacing ${ftText(Math.hypot(rel.fwd, rel.left))} (${ftText(across)} abeam)`,
      `Sweep ${Math.abs(sweepDeg).toFixed(0)}° ${sweepDeg >= 0 ? 'behind' : 'ahead'}`,
      `#2 is ${ftText(Math.abs(wing.altAboveFt - lead.altAboveFt))} ${wing.altAboveFt >= lead.altAboveFt ? 'above' : 'below'} Lead`,
    ],
    judged,
    errors: errorCardLines(state),
    ships: state.aircraft.map((a) => ({
      id: a.id,
      name: a.name,
      text: `${Math.round(a.kias)} KIAS, ${String(compassDeg(a.headingRad)).padStart(3, '0')}, ${bankText(a.bankDeg)}, ${a.g.toFixed(1)} G`, // the Speed/power fix changes #2's speed
    })),
  };
}

function mount(root, app) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = STYLESHEET;
  document.head.append(stylesheet);

  const setup = createSettings(memoryStore(), SETUP_DEFAULTS, { allowed: { wingSide: ['right', 'left'], ships: [2, 4], ...ERROR_ALLOWED } });
  const layout = createSettings(layoutStore(app.storage), LAYOUT_DEFAULTS, { allowed: LAYOUT_ALLOWED, version: LAYOUT_VERSION });
  const setupControls = createControls(setup);
  const layoutControls = createControls(layout);

  const formation = createFormation({ ...setup.get() });
  const state = formation.state; // one live object, updated in place

  const changeUi = createChangeUi({ onChange: (to, options) => pressChange(to, options) });
  const ui = createLayout({ buttons: BUTTONS, setupControls, layout, layoutControls, listen: app.listen, fixedLine: fixedLine(LIVE_DEFAULTS), changeUi });
  root.append(ui.element);

  let playing = false;
  let speed = 1;
  let owed = 0; // sim seconds waiting to be turned into fixed steps
  let stopFrames = null;
  let userZoomed = false; // the person zoomed the 2D picture, so the camera stops zooming for them
  let snapNext = true; // the next 2D frame takes the follow zoom at once (after a reset)
  let wantView = '2d';

  const centre = () => {
    const n = state.aircraft.length;
    return {
      x: state.aircraft.reduce((s, a) => s + a.xFt, 0) / n,
      y: state.aircraft.reduce((s, a) => s + a.yFt, 0) / n,
    };
  };
  /** How much ground the camera keeps in view: both aircraft, with room for a turn circle each side. */
  const spanFt = () => {
    // Close together (a close formation, or the last part of a rejoin): zoom in so the pair can be seen, and back out when they open up.
    // The four zoom in the same way on their widest pair (a close 4-ship formation, spec section 8).
    let apart = 0;
    for (const a of state.aircraft) for (const b of state.aircraft) apart = Math.max(apart, Math.hypot(a.xFt - b.xFt, a.yFt - b.yFt));
    if (apart < CLOSE_ZOOM_FT) return Math.max(CLOSE_SPAN_MIN_FT, 4 * apart + 200);
    const c = centre();
    let reach = 0;
    for (const a of state.aircraft) reach = Math.max(reach, Math.hypot(a.xFt - c.x, a.yFt - c.y));
    return 2 * (Math.max(reach, state.spacingFt / 2) + turnRadiusAt(state.aircraft[0].tasFtps) + FOLLOW_MARGIN_FT);
  };
  /** The 2D camera: the middle of the pair, zoomed to spanFt (eased, or at once after a reset). */
  const follow = () => {
    const snap = snapNext;
    snapNext = false;
    return { ...centre(), spanFt: spanFt(), zoom: !userZoomed, snap };
  };

  // ---- the pictures -------------------------------------------------------------------
  const view = createTurnSimView(ui.canvas, {
    timers: app.scheduler,
    onUserMove: () => {
      userZoomed = true;
    },
    source: {
      state: () => state,
      trails: () => ({ trail: state.tracks, marks: {} }),
      layers: () => layout.get(),
      settings: () => ({}),
      labels: () => ({}),
      follow,
      planned: () => state.planned,
      rejoin: () => {
        if (!state.current?.change?.rejoining || state.aircraft.length !== 2) return null;
        const r = rejoinReadout(state.aircraft[0], state.aircraft[1]);
        return { leadId: 1, wingId: 2, rangeFt: r.rangeFt, closureKt: r.closureKt };
      },
    },
  });
  // three.js loads only when 3D is first switched on.
  const view3d = createView3d(ui.canvas3d, {
    timers: app.scheduler,
    source: {
      state: () => state,
      trails: () => ({ trail: state.tracks }),
      layers: () => layout.get(),
      focus: centre,
      paint: () => layout.get().paint,
      bankSigns: () => ({}), // the live bank is already signed (left positive)
      colors: SHIP_COLORS,
    },
  });
  let shown = '2d';
  let switching = 0; // counts switches, so a late three.js load can't undo a later choice

  const redraw = () => (shown === '3d' ? view3d.requestDraw() : view.requestDraw());

  function fit3d() {
    const c = centre();
    const half = spanFt() / 2;
    view3d.fit({ minX: c.x - half, minY: c.y - half, maxX: c.x + half, maxY: c.y + half }, state.aircraft[0].headingRad); // behind Lead
  }

  async function applyView(want) {
    const turn = ++switching;
    if (want !== '3d') {
      shown = '2d';
      view3d.hide();
      ui.showView('2d');
      ui.setNote('');
      view.requestDraw();
      return;
    }
    ui.setNote('Loading 3D…');
    const result = await view3d.show();
    if (turn !== switching) {
      if (wantView !== '3d') view3d.hide();
      return;
    }
    if (!result.ok) {
      if (result.reason === 'closed') return;
      layout.update({ view: '2d' }); // comes back here as a switch to 2D
      ui.setNote(result.reason === 'gl' ? '3D needs WebGL, which this browser does not have.' : '3D needs a connection the first time.');
      return;
    }
    ui.setNote('');
    shown = '3d';
    ui.showView('3d');
    fit3d();
    view3d.requestDraw();
  }

  // ---- the Formation card: at most READOUT_MS apart while playing, at once otherwise ----
  let lastReadout = -Infinity;
  let pendingReadout = null;
  function renderCard() {
    pendingReadout?.();
    pendingReadout = null;
    lastReadout = performance.now();
    const wingSide = setup.get().wingSide;
    ui.renderCard(state.aircraft.length > 2 ? cardForFour(state, wingSide) : cardFor(state, wingSide));
    const whereAll = formation.where();
    changeUi.update(state, whereAll);
    changeUi.renderCard(state, whereAll);
    if (state.aircraft.length === 2) {
      const where = whereAll;
      ui.setMovesEnabled(!['fw', 'echelon', 'route', 'astern'].includes(where.key)); // the manoeuvres are line abreast only
    } else {
      // The four's manoeuvres fly from Spread 4 (or a column after an in-place turn); G-warm from Spread 4 only.
      const where = whereAll.key;
      const lineAbreast = where === 'spread4' || where === 'other';
      ui.setMovesEnabled(lineAbreast, (key) => key !== G_WARM.key || where === 'spread4', 'These manoeuvres fly in Spread 4. Change to Spread 4 first.');
    }
  }
  function queueCard() {
    const wait = READOUT_MS - (performance.now() - lastReadout);
    if (!playing || wait <= 0) renderCard();
    else pendingReadout ??= app.scheduler.after(wait, renderCard);
  }
  function refresh() {
    ui.setTime(state.tSec);
    redraw();
    queueCard();
  }

  // ---- playback ---------------------------------------------------------------------------
  function onFrame(dtMs) {
    owed += (dtMs / 1000) * speed;
    let steps = 0;
    while (owed >= STEP_SEC - 1e-9 && steps < MAX_STEPS_PER_FRAME) {
      formation.step();
      owed -= STEP_SEC;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) owed = 0; // drop the backlog rather than chase it
    refresh();
  }

  function play() {
    if (playing) return;
    playing = true;
    owed = 0;
    ui.setPlaying(true);
    stopFrames = app.scheduler.frame(onFrame);
    refresh();
  }

  function pause() {
    stopFrames?.();
    stopFrames = null;
    if (!playing) return;
    playing = false;
    ui.setPlaying(false);
    renderCard(); // a card still waiting its turn must not show a step behind the picture
  }

  function resetRun() {
    pause();
    formation.reset({ ...setup.get() });
    owed = 0;
    userZoomed = false;
    snapNext = true;
    if (shown === '3d') fit3d();
    refresh();
  }

  function press(key, dir) {
    const how = formation.press(key, dir);
    if (how === 'queued') app.status(`${labelFor(key, dir)} is next.`);
    play(); // a button also starts the formation flying
    refresh();
  }

  /** A "Change formation" button: flown at once, or queued behind the one being flown (spec section 10). */
  function pressChange(to, options) {
    const how = formation.change(to, options);
    if (how === 'queued') app.status(`${state.queued.label} is next.`);
    if (how !== 'refused') play();
    refresh();
  }

  ui.onPress(press);
  changeUi.onSideChanged(renderCard);
  ui.onPlayPause(() => (playing ? pause() : play()));
  ui.onResetRun(resetRun);
  ui.onSpeed((x) => {
    speed = x; // changes steps per frame only; it doesn't stop the run
  });

  // Setup changes start again from t = 0 (spec section 4), 2-ship or 4-ship too. A spacing outside the SMM band is flown and flagged.
  const stopSetup = setup.subscribe((values) => {
    ui.setShips(values.ships, fourShipLine());
    ui.setFixTools(values.errResponse !== 'reference');
    ui.setSide(values.wingSide);
    ui.setSpacingFlag(checkSpacing(values.spacingFt).flag);
    resetRun();
  });
  const stopLayout = layout.subscribe((values) => {
    ui.applyLayout(values);
    if (values.view !== wantView) {
      wantView = values.view;
      applyView(wantView);
    }
    redraw();
  });

  // The stylesheet decides the picture's size, so the first draw waits for it.
  const ready = () => {
    snapNext = true;
    view.setReady();
  };
  if (stylesheet.sheet) ready();
  else {
    stylesheet.addEventListener('load', ready, { once: true });
    stylesheet.addEventListener('error', ready, { once: true });
  }

  // Space plays or pauses and Home resets: only while the Turn Sim is open and never while typing (app.keys).
  app.keys({
    Space: () => (playing ? pause() : play()),
    Home: resetRun,
  });

  ui.setShips(setup.get().ships, fourShipLine());
  ui.setFixTools(setup.get().errResponse !== 'reference');
  ui.setSide(setup.get().wingSide);
  ui.setSpacingFlag(checkSpacing(setup.get().spacingFt).flag);
  ui.applyLayout(layout.get());
  refresh();
  if (layout.get().view === '3d') {
    wantView = '3d'; // remembered from last time: three.js loads now, as it would on a switch
    applyView('3d');
  }

  return () => {
    pause();
    pendingReadout?.();
    stopSetup();
    stopLayout();
    setupControls.dispose();
    layoutControls.dispose();
    view.dispose();
    view3d.dispose();
    stylesheet.remove();
  };
}

export default { id: 'turn-sim', title: 'Formation Turn Sim', mount };
