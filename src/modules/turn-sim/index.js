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
import { createSettings } from '../../storage/settings.js';
import { createControls } from '../../ui-kit/controls.js';
import { STEP_SEC } from './live/flight.js';
import { MANOEUVRES, relativeTo } from './live/manoeuvres.js';
import { createFormation, LIVE_DEFAULTS, checkSpacing, compassDeg, fixedLine, intoOrAway, labelFor } from './live/formation.js';
import { ERROR_DEFAULTS, ERROR_ALLOWED, errorCardLines } from './live/errors.js';
import { FOUR_SHIP_KEYS, fourShipLine } from './live/four-ship.js';
import { cardForFour } from './live/four-ship-card.js';
import { G_WARM } from './live/g-warm.js';
import { rejoinReadout } from './live/judge.js';
import { FW2, FW4, checkFwShape } from './live/slots.js';
import { FW_TURN_KEYS, TURN_FORMATIONS } from './live/formation-turns.js';
import { createChangeUi } from './transitions-panel.js';
import { createFluidUi } from './fluid-panel.js';
import { createLayout, LAYOUT_DEFAULTS, LAYOUT_ALLOWED, LAYOUT_VERSION, SHIP_COLORS, migrateLayout } from './layout.js';
import { createTurnSimView } from './view.js';
import { tagLines, formatTag } from './tags.js';
import { createView3d, yawBehind } from './view3d.js';

const STYLESHEET = new URL('./turn-sim.css', import.meta.url).href;

/** Most steps run in one frame, so a tab that was hidden can't freeze the page catching up. */
const MAX_STEPS_PER_FRAME = 40;
/** The card updates at most this often while playing. */
const READOUT_MS = 100;
/**
 * The fit-all camera (spec section 10.3, TS-56): every aircraft in the picture with about 15% of it spare on each side,
 * and never tighter than 150 ft across, so a close formation shows whole at about its real size (an echelon is about 45 ft
 * apart). Both are estimates.
 */
const FIT = Object.freeze({ marginShare: 0.15, minSpanFt: 150 });

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

/** Fighting wing desired spacing and sweep (TS-58, Patrick 21:25Z): today's places are the defaults (FW2, FW4). */
const FW_DEFAULTS = Object.freeze({
  fwRangeFt: FW2.rangeFt,
  fwSweepDeg: FW2.sweepDeg,
  fw4RangeFt: FW4.rangeFt,
  fw4SweepDeg: FW4.twoDeg,
  fw4OtherRangeFt: FW4.rangeFt,
  fw4OtherDeg: FW4.otherDeg,
});
/** The screen starts line abreast at 4,000 ft (Patrick, 5 Oct), the close side of the 4,000 to 6,000 ft band (SMM 16.18 para 49). */
const START_SPACING_FT = 4000;
const SETUP_DEFAULTS = Object.freeze({ ships: LIVE_DEFAULTS.ships, check45: LIVE_DEFAULTS.check45, spacingFt: START_SPACING_FT, wingSide: LIVE_DEFAULTS.wingSide, ...FW_DEFAULTS, ...ERROR_DEFAULTS });

/** The flags for fighting wing places outside the SMM band (SMM 12.29 para 69), for the ships flown: flown anyway, never refused. */
function fwFlags(values) {
  const pairs = values.ships === 4
    ? [checkFwShape(values.fw4RangeFt, values.fw4SweepDeg, '#2'), checkFwShape(values.fw4OtherRangeFt, values.fw4OtherDeg, '#3 and #4')]
    : [checkFwShape(values.fwRangeFt, values.fwSweepDeg, '#2')];
  return pairs.map((c) => (c.ok ? c.flag : c.reason)).filter(Boolean).join(' ');
}

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
  if (c?.fluid) {
    flying = `Flying: fluid manoeuvring, ${state.fluid?.session.now().label ?? 'ending'}`;
  } else if (c?.change) {
    flying = `Flying: ${c.change.flying}`;
  } else if (c) {
    const sided = !c.fwMove && MANOEUVRES[c.key]?.sided; // a fighting wing move (TS-70) names its side in its label
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
    // Fluid manoeuvring's note describes the entry, so it shows only while the entry is flown.
    note: c?.fluid && state.fluid?.session.now().key !== 'entry' ? null : c?.note ?? null,
    queued: state.queued?.label ?? null,
    nowLines: [
      `Spacing ${ftText(Math.hypot(rel.fwd, rel.left))} (${ftText(across)} abeam)`,
      // Sweep the manual's way: back from Lead's wing line, 0° abeam (SMM 12.29 para 69, Fig 12.19)
      `Sweep ${Math.abs(sweepDeg).toFixed(0)}° ${sweepDeg >= 0 ? 'back from' : 'ahead of'} Lead's wing line`,
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
  const layout = createSettings(layoutStore(app.storage), LAYOUT_DEFAULTS, { allowed: LAYOUT_ALLOWED, version: LAYOUT_VERSION, migrate: migrateLayout });
  const setupControls = createControls(setup);
  const layoutControls = createControls(layout);

  const formation = createFormation({ ...setup.get() });
  const state = formation.state; // one live object, updated in place

  const fluidUi = createFluidUi({
    onPress: (key, dir) => pressFluid(key, dir),
    onSettings: (next) => formation.setFluid(next),
    settings: { rangeFt: LIVE_DEFAULTS.fluidRangeFt, bank: LIVE_DEFAULTS.fluidBank },
  });
  const changeUi = createChangeUi({ onChange: (to, options) => pressChange(to, options), fluidUi });
  const ui = createLayout({ buttons: BUTTONS, setupControls, layout, layoutControls, listen: app.listen, fixedLine: fixedLine(LIVE_DEFAULTS), changeUi });
  root.append(ui.element);

  let playing = false;
  let speed = 1;
  let owed = 0; // sim seconds waiting to be turned into fixed steps
  let stopFrames = null;
  let cameraPaused = false; // the person panned or zoomed, so the fit-all camera leaves the picture to them until Fit
  let snapNext = true; // the next 2D frame takes the fit at once (after a reset or Fit)
  let wantView = '2d';

  /**
   * The camera's centre and size: centred on the formation's centre of mass (every aircraft weighed the same; Patrick,
   * 5 Oct), and wide enough each way to hold the aircraft furthest from it, grown by the fit's margin (feet).
   */
  const fitBox = () => {
    const xs = state.aircraft.map((a) => a.xFt);
    const ys = state.aircraft.map((a) => a.yFt);
    const grow = 1 / (1 - 2 * FIT.marginShare);
    const on = camAircraft(); // the Camera menu's choice: one aircraft, or the formation's centre of mass
    const x = on ? on.xFt : xs.reduce((s, v) => s + v, 0) / xs.length;
    const y = on ? on.yFt : ys.reduce((s, v) => s + v, 0) / ys.length;
    const reach = (vs, c) => Math.max(...vs.map((v) => Math.abs(v - c)));
    return {
      x,
      y,
      spanXFt: Math.max(FIT.minSpanFt, 2 * reach(xs, x) * grow),
      spanYFt: Math.max(FIT.minSpanFt, 2 * reach(ys, y) * grow),
    };
  };
  let zoomFactor2d = 1; // the person's wheel zoom on top of the 2D fit; Fit puts it back to 1
  /** The aircraft the Camera menu centres on, or null for the formation (or one this formation doesn't have). */
  function camAircraft() {
    const on = layout.get().camOn;
    return on === 'formation' ? null : state.aircraft.find((a) => String(a.id) === on) ?? null;
  }
  /** Who an aircraft padlocks: Lead watches #2, #4 his element lead #3, the others Lead. */
  const padlockOf = (id) => (id === 1 ? 2 : id === 4 ? 3 : 1);
  /**
   * The 3D camera on one aircraft (Patrick, 5 Oct): Chase, behind it along its nose; Follow (free look), centred on it and
   * turned by hand (null: the person's yaw and pitch); Padlock, behind it looking at the other, tilted up or down by how far
   * the other is above or below (pitchUpDeg, added to the person's tilt). Null for the formation.
   */
  function camLook() {
    const on = camAircraft();
    const mode = layout.get().camLook;
    // On the formation, Chase turns the view with Lead's heading (Patrick, 5 Oct); Follow and Padlock leave it to the person.
    if (!on) return mode === 'chase' && layout.get().camOn === 'formation' && state.aircraft[0] ? { yawDeg: yawBehind(state.aircraft[0].headingRad) } : null;
    if (mode === 'free') return null;
    if (mode === 'padlock') {
      const other = state.aircraft.find((a) => a.id === padlockOf(on.id));
      const across = other ? Math.hypot(other.xFt - on.xFt, other.yFt - on.yFt) : 0;
      if (other && across > 0) {
        const upFt = (other.altAboveFt ?? 0) - (on.altAboveFt ?? 0);
        return { yawDeg: yawBehind(Math.atan2(other.yFt - on.yFt, other.xFt - on.xFt)), pitchUpDeg: (Math.atan2(upFt, across) * 180) / Math.PI };
      }
    }
    return { yawDeg: yawBehind(on.headingRad) };
  }
  const fitBounds = () => {
    const b = fitBox();
    return { minX: b.x - b.spanXFt / 2, maxX: b.x + b.spanXFt / 2, minY: b.y - b.spanYFt / 2, maxY: b.y + b.spanYFt / 2 };
  };
  /**
   * The 2D camera: with Fit all aircraft on, centred on them and zoomed to fit them (eased, or at once after a reset or a
   * Fit press); off, it stays centred on them at the person's zoom. A pan or zoom pauses it (null: the camera stays put).
   */
  const freeCamera = () => layout.get().camOn === 'free'; // Free (Patrick, 5 Oct): the camera follows nothing and doesn't zoom by itself
  const follow = () => {
    if (cameraPaused || freeCamera()) return null;
    const snap = snapNext;
    snapNext = false;
    return { ...fitBox(), zoom: layout.get().autoFit || snap, snap, zoomFactor: snap ? 1 : zoomFactor2d };
  };
  /**
   * The data tags (Patrick, 5 Oct): each aircraft's tag with what the Data tag menu ticks, and during a rejoin the
   * wingman's closure and Lead's clock position.
   */
  /**
   * The guides follow the formation (Patrick, 5 Oct): Lead's 3/9 line comes on in line abreast (Spread 4 for the four) and
   * goes off in the others; Lead's cone comes on in fighting wing and goes off in the others. Lead only. Set once each time
   * the formation changes, at the press (Patrick, 5 Oct: "as soon as I hit the button"), so a tick changed by hand holds
   * until the next change.
   */
  let guidesFor = null;
  function autoGuides(key) {
    if (!key || key === 'other' || key === guidesFor) return;
    guidesFor = key;
    const only1 = (prefix, on) => ({ [`${prefix}_1`]: on || layout.get()[`${prefix}_1`], [`${prefix}_2`]: false, [`${prefix}_3`]: false, [`${prefix}_4`]: false });
    const abreast = key === 'lab' || key === 'spread4';
    const fw = key === 'fw';
    layout.update({ lead39: abreast, ...(abreast ? only1('l39', true) : {}), cone: fw, ...(fw ? only1('cone', true) : {}) });
  }

  function dataTags() {
    const tags = tagLines(state, formation.where());
    const show = layout.get();
    const lead = state.aircraft[0];
    const out = {};
    for (const a of state.aircraft) {
      if (!tags[a.id]) continue;
      let closure = null;
      if (a.id !== 1 && state.current?.change?.rejoining) {
        const r = rejoinReadout(lead, a);
        const kt = Math.abs(r.closureKt) < 1 ? '0 kt' : `${r.closureKt > 0 ? '+' : ''}${Math.round(r.closureKt)} kt`;
        closure = `closure ${kt}, Lead at ${r.clock}`;
      }
      out[a.id] = formatTag(tags[a.id], a, lead, show, closure);
    }
    return out;
  }
  const showFit = () => ui.setFitShown(cameraPaused || !layout.get().autoFit);
  const pauseCamera = () => {
    if (cameraPaused) return;
    cameraPaused = true;
    showFit();
  };

  // ---- the pictures -------------------------------------------------------------------
  const view = createTurnSimView(ui.canvas, {
    timers: app.scheduler,
    // A wheel zoom while the camera follows sets how close it sits and it keeps following (Patrick, 5 Oct: the zoom changes
    // as the formation closes up); a drag hands the camera to the person until Fit.
    onUserMove: (kind, ratio) => {
      if (kind === 'zoom' && !cameraPaused && layout.get().autoFit) zoomFactor2d *= ratio;
      else pauseCamera();
    },
    source: {
      state: () => state,
      trails: () => ({ trail: state.tracks, marks: {} }),
      layers: () => layout.get(),
      settings: () => ({}),
      labels: () => ({}),
      follow,
      planned: () => state.planned,
      tags: dataTags,
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
    overlay: ui.tags3d,
    onUserMove: (kind) => {
      // turning the 3D view round keeps the fit; a wheel zoom while it follows sets how close it sits (view3d.js); with
      // the fit off, it takes the camera over as before
      if (kind === 'zoom' && (cameraPaused || !layout.get().autoFit)) pauseCamera();
    },
    source: {
      state: () => state,
      trails: () => ({ trail: state.tracks }),
      layers: () => layout.get(),
      planned: () => state.planned,
      tags: dataTags,
      look: camLook,
      focus: () => {
        if (freeCamera()) return null; // the 3D view keeps its own centre, moved by shift-drag or right-drag
        const b = fitBox();
        return { x: b.x, y: b.y };
      },
      fitBounds: () => (cameraPaused || freeCamera() || !layout.get().autoFit ? null : fitBounds()),
      paint: () => layout.get().paint,
      bankSigns: () => ({}), // the live bank is already signed (left positive)
      colors: SHIP_COLORS,
    },
  });
  let shown = '2d';
  let switching = 0; // counts switches, so a late three.js load can't undo a later choice

  const redraw = () => (shown === '3d' ? view3d.requestDraw() : view.requestDraw());

  function fit3d() {
    view3d.fit(fitBounds(), state.aircraft[0].headingRad); // behind Lead
  }

  /** Fit: the fit-all camera again, at once (with Fit all aircraft off, a single fit). */
  function fitNow() {
    cameraPaused = false;
    snapNext = true;
    zoomFactor2d = 1;
    if (shown === '3d') fit3d();
    showFit();
    redraw();
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
    autoGuides(state.current?.change?.to ?? whereAll.key); // the formation being flown to, from the press (Patrick, 5 Oct)
    changeUi.update(state, whereAll);
    changeUi.renderCard(state, whereAll);
    const ships = state.aircraft.length > 2 ? 4 : 2;
    // In fighting wing the pair's Lead buttons are the level turns, climbs and descents in the formation box, as soon as #2
    // is in the cone, even while a change to it is still flown (TS-70, Patrick card 09:07Z).
    const pairFw = ships === 2 && whereAll.key === 'fw';
    if (state.current?.change && !pairFw) {
      // While a change is flown, the new formation's manoeuvres wait until the aircraft are in it (Patrick, 5 Oct).
      ui.setMovesEnabled(false, undefined, 'Changing formation. Its manoeuvres show once the change is flown.');
    } else if (whereAll.key === 'fluid' || pairFw) {
      ui.setMovesEnabled(false, undefined, ''); // the fluid buttons show instead (transitions-panel.js), or in fighting wing Lead's moves
    } else if (TURN_FORMATIONS[ships].includes(whereAll.key)) {
      // In fighting wing and the close formations the turn buttons turn the formation (TS-55, spec section 10.2); the
      // shackle, the cross turn and G-warm stay line abreast moves.
      ui.setMovesEnabled(true, (key) => FW_TURN_KEYS.includes(key));
    } else if (ships === 2) {
      ui.setMovesEnabled(true);
    } else {
      // The four's manoeuvres fly from Spread 4 (or a column after an in-place turn); G-warm from Spread 4 only.
      const where = whereAll.key;
      const lineAbreast = where === 'spread4' || where === 'other';
      ui.setMovesEnabled(lineAbreast, (key) => key !== G_WARM.key || where === 'spread4', 'These manoeuvres fly in Spread 4, fighting wing and the close formations. Change formation first.');
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
    cameraPaused = false;
    snapNext = true;
    showFit();
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

  /** A Lead button in fluid manoeuvring (spec section 10.3): flown at once, or after the entry if it is still flown. */
  function pressFluid(key, dir) {
    // Outside fluid manoeuvring the group holds Lead's fighting wing moves (TS-70).
    const how = state.fluid ? formation.pressFluid(key, dir) : formation.pressFw(key, dir);
    if (how === 'queued') app.status(`${state.fluid.session.queued?.label ?? 'That'} is next, after the entry.`);
    if (how !== 'refused') play();
    refresh();
  }

  ui.onPress(press);
  changeUi.onSideChanged(renderCard);
  ui.onPlayPause(() => (playing ? pause() : play()));
  ui.onResetRun(resetRun);
  ui.onFit(fitNow);
  ui.onSpeed((x) => {
    speed = x; // changes steps per frame only; it doesn't stop the run
  });

  // Setup changes start again from t = 0 (spec section 4), 2-ship or 4-ship too. A spacing outside the SMM band is flown and flagged.
  const stopSetup = setup.subscribe((values) => {
    ui.setShips(values.ships, fourShipLine());
    ui.setFixTools(values.errResponse !== 'reference');
    ui.setSide(values.wingSide);
    ui.setSpacingFlag(checkSpacing(values.spacingFt).flag);
    ui.setFwFlag(fwFlags(values));
    resetRun();
  });
  let autoFitWas = layout.get().autoFit;
  const stopLayout = layout.subscribe((values) => {
    ui.applyLayout(values);
    if (values.autoFit !== autoFitWas) {
      autoFitWas = values.autoFit;
      if (values.autoFit) fitNow(); // switched back on: fit again now
      showFit();
    }
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
  ui.setFwFlag(fwFlags(setup.get()));
  ui.applyLayout(layout.get());
  showFit();
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

export default { id: 'turn-sim', title: "Pat's Formation Simulator", mount };
