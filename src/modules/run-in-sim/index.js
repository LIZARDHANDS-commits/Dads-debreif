// The Run-in Simulator (docs/modules/run-in-sim/spec.md; RS-1): one screen. Setup on the left (setup-panel.js), the 3D view
// in the middle (world3d.js) with the plan view (plan-view.js) and the map to tap a place (map-picker.js), or behind the
// 3D | 2D switch above it the 2D plan and profile (view2d.js, RS-13), the bar under
// the view (the time line with the legs marked, play and pause, ×1 to ×8 and the cameras), and the result cards on the
// right (card.js). "Fly the pass" works the whole pass out first (pass.js) into a stored timeline; playing and scrubbing
// only read it. "Training only" always shows (RS-2). Everything mount() starts runs on the shell's scheduler and
// listeners, so the shell stops it all when the module closes.
import { h, clear } from '../../ui-kit/dom.js';
import { createSettings } from '../../storage/settings.js';
import { createControls } from '../../ui-kit/controls.js';
import { createPillGroup } from '../../ui-kit/camera-bar.js';
import { createTerrain3d } from '../../ui-kit/terrain3d.js';
import { airportElevationFt } from '../../ui-kit/airfield3d.js';
import { webglSupported } from '../../ui-kit/three-aircraft.js';
import { TRAFFIC_VERSION } from '../traffic/version.js';
import { DEFAULTS, ALLOWED, CAMERAS, PLAY_SPEEDS, DEFAULT_PLACE, runPatch, setupFrom, runOf } from './defaults.js';
import { TARGETS } from './targets.js';
import { AIRCRAFT } from './aircraft.js';
import { buildPlan, flyPass, clock } from './pass.js';
import { areaFor } from './area.js';
import { createSetup } from './setup-panel.js';
import { cardFor } from './card.js';
import { createPlanView } from './plan-view.js';
import { createMapPicker } from './map-picker.js';
import { createRunInWorld } from './world3d.js';
import { createView2d } from './view2d.js';

const STYLESHEET = new URL('./run-in-sim.css', import.meta.url).href;
/** The working-out of the planned lines waits this long after the last change, ms (an estimate that keeps typing smooth). */
const REPLAN_MS = 400;
/** Tiles that arrive are read into the ground at most this often, ms (an estimate, as the EP Tabletop's). */
const TERRAIN_MS = 400;
/** The most passes kept on the card list; the oldest go first. */
const MAX_PASSES = 8;
/** The ground's height where no terrain tile came, ft: CYMJ's (OurAirports' 1,892 ft, src/airfields/airports-data.js). */
const FALLBACK_FT = airportElevationFt('CYMJ') ?? 1892;

function mount(root, app) {
  const stylesheet = h('link', { rel: 'stylesheet', href: STYLESHEET });
  document.head.append(stylesheet);

  const settings = createSettings(app.storage, DEFAULTS, { allowed: ALLOWED });
  const controls = createControls({ get: settings.get, update: settings.update, subscribe: settings.subscribe });
  const values = () => settings.get();

  // ---- The ground (shared with the flying: the engine reads its heights) ----
  const place = () => ({ lat: values().placeLat, lon: values().placeLon });
  let area = areaFor(place());
  let terrainWake = null;
  const terrain = createTerrain3d({
    timers: app.scheduler, doc: document, plan: area.plan, maxTiles: 100,
    onChange: () => {
      if (terrainWake) return;
      terrainWake = app.scheduler.after(TERRAIN_MS, () => {
        terrainWake = null;
        if (terrain.refresh()) {
          world?.nudge();
          scheduleReplan();
        }
        showGround();
      });
    },
  });
  terrain.setView(area.projection, FALLBACK_FT);
  const ground = { groundAt: (x, y) => terrain.heightFt(x, y), known: (x, y) => terrain.known(x, y) };

  // ---- The screen ----
  let passes = [];
  let selected = -1;
  let plan = null;
  const setup = createSetup({ settings, controls, onFly: () => fly(), onOpenMap: () => openMap() });
  controls.guard(setup.flyButton);
  const view = h('div', { class: 'rs-view' });
  const planCanvas = h('canvas', { class: 'rs-plan' });
  const groundNote = h('p', { class: 'rs-ground-note', role: 'status' });
  const status = h('span', { class: 'rs-status', role: 'status' });
  const map = createMapPicker({
    timers: app.scheduler, controls, getPlace: place, defaultWords: DEFAULT_PLACE.words,
    onPlace: (p) => settings.update({ placeLat: p.lat, placeLon: p.lon, placeIsDefault: false }),
    onDefault: () => settings.update({ placeLat: DEFAULT_PLACE.lat, placeLon: DEFAULT_PLACE.lon, placeIsDefault: true }),
    onClose: () => planCanvas.focus(),
  });
  // The 2D view (RS-13) and the 3D | 2D switch above the view, in the shared button look with aria-pressed.
  const view2d = createView2d({ timers: app.scheduler, getProjection: () => area.projection, onZoom: (z) => settings.update({ profileZoom: z }) });
  const viewPills = createPillGroup({ prefix: 'rs', label: 'View', items: [{ id: '3d', label: '3D' }, { id: '2d', label: '2D' }], onPick: (m) => settings.update({ viewMode: m }) });
  const viewBar = h('div', { class: 'rs-viewbar' }, viewPills.element);
  const viewWrap = h('div', { class: 'rs-view-wrap' }, view, planCanvas, view2d.element, groundNote, map.element);

  // The bar: the time line with the legs marked, play and pause, the speeds and the cameras.
  const scrub = h('input', { type: 'range', class: 'rs-scrub', min: 0, max: 1, step: 0.05, value: 0, 'aria-label': 'Time in the pass' });
  const marks = h('div', { class: 'rs-marks', 'aria-hidden': 'true' });
  const timeWords = h('span', { class: 'rs-time' }, '0:00');
  const playBtn = h('button', { type: 'button', class: 'rs-btn rs-play', 'aria-label': 'Play' }, '▶');
  const speeds = createPillGroup({ prefix: 'rs', label: 'Playback speed', items: PLAY_SPEEDS.map((s) => ({ id: s, label: `×${s}` })), onPick: (s) => settings.update({ playSpeed: s }) });
  const cams = createPillGroup({ prefix: 'rs', label: 'Camera', items: CAMERAS.map((c) => ({ id: c.id, label: c.label })), onPick: (c) => settings.update({ camera: c }) });
  const bar = h('div', { class: 'rs-playbar' },
    h('div', { class: 'rs-timeline' }, marks, scrub),
    h('div', { class: 'rs-controls' }, playBtn, speeds.element, timeWords, h('span', { class: 'rs-spacer' }), cams.element));

  const cards = h('div', { class: 'rs-cards' });
  const result = h('aside', { class: 'rs-result', 'aria-label': 'Result' },
    h('h2', { class: 'rs-col-title' }, 'Result'),
    cards,
    h('p', { class: 'rs-foot' }, 'Flags are references, never walls: a setting past a published limit is flown and flagged (RS-6).'));

  root.append(h('section', { class: 'rs' },
    h('header', { class: 'rs-bar' },
      h('h1', {}, 'Run-in Simulator'),
      h('span', { class: 'rs-training' }, 'Training only · inert loads · generic targets'),
      status,
      h('span', { class: 'rs-version' }, TRAFFIC_VERSION)),
    h('div', { class: 'rs-main' }, setup.element, h('div', { class: 'rs-centre' }, viewBar, viewWrap, bar), result)));

  const planView = createPlanView(planCanvas, { timers: app.scheduler, onOpen: () => openMap() });

  // ---- The 3D view ----
  let world = null;
  let closed = false;
  if (!webglSupported({ document })) {
    view.append(h('p', { class: 'rs-3d-note' }, 'This browser can\'t draw 3D (no WebGL). The plan view, the settings and the result still work.'));
  } else {
    createRunInWorld({ host: view, timers: app.scheduler, terrain, area, fallbackFt: FALLBACK_FT }).then((w) => {
      if (closed) {
        w?.dispose();
        return;
      }
      world = w;
      syncTarget();
      syncPlan();
      syncPass();
      render();
    }).catch((err) => {
      view.append(h('p', { class: 'rs-3d-note' }, 'The 3D view could not load. The plan view, the settings and the result still work.'));
      console.warn('Run-in Simulator: 3D view failed to load', err);
    });
  }

  // ---- Keeping the pieces in step ----
  const current = () => (selected >= 0 ? passes[selected] : null);
  let t = 0;
  let playing = false;
  let stopLoop = null;
  const display = () => ({ showLines: values().showLines, showCarp: values().showCarp, showTrails: values().showTrails });
  const magWind = (v) => (v.windTopKt < 0.5 ? 'still air' : `wind ${String(Math.round(v.windTopDegM) % 360 || 360).padStart(3, '0')}°M/${v.windTopKt} kt`);

  function showGround() {
    const s = terrain.state();
    const missing = s.wanted > 0 && s.failed > 0 && s.ready === 0;
    groundNote.textContent = missing
      ? 'Terrain tiles missing: the ground is flat at the target\'s height, and heights above it read "unknown ground".'
      : s.pending > 0 ? 'Loading the ground…' : '';
    groundNote.hidden = !groundNote.textContent;
  }
  function syncTarget() {
    const v = values();
    const s = setupFrom(v);
    world?.setTarget({ id: v.target, sizeFt: v.targetSizeFt, headingDegT: s.target.headingDegT, groundFt: ground.groundAt(0, 0) });
  }
  function syncPlan() {
    const shown = current()?.stale === false ? current().plan : plan;
    world?.setPlan(shown, display());
    planView.set({ plan: shown, windWords: magWind(values()) });
    view2d.set({ plan: shown, windWords: magWind(values()) });
  }
  /** The 3D view with its corner plan and cameras, or the 2D plan and profile (RS-13). */
  function syncView() {
    const two = values().viewMode === '2d';
    view.hidden = two;
    planCanvas.hidden = two;
    cams.element.hidden = two;
    viewPills.set(values().viewMode);
    view2d.show(two);
    view2d.set({ zoom: values().profileZoom });
  }
  function syncPass() {
    world?.setPass(current(), display());
    const pass = current();
    const end = pass ? pass.flight.timeline.t[pass.flight.timeline.t.length - 1] : 1;
    scrub.max = String(end);
    clear(marks);
    if (pass) {
      const ev = pass.flight.events;
      const at = [['Orbit', 0], ['IP', ev.ip], ['Roll-in', ev.rollIn], [pass.plan.run === 'flyover' ? 'TOT' : 'Release', ev.release], [pass.plan.run === 'flyover' ? null : 'TOT', pass.result.arrivalSec], ['Escape', ev.release !== undefined ? ev.release + 2 : undefined]];
      // Marks at the same moment share one label; the rest take the first of two rows where they don't print over another
      // (their width estimated at about 6.5 px a letter of the 11 px type; a label past 85% hangs to the left of its mark),
      // and one with no room on either joins the mark before it.
      const merged = [];
      for (const [label, sec] of at.filter(([l, x]) => l && Number.isFinite(x)).sort((a, b) => a[1] - b[1])) {
        const pct = (100 * Math.min(sec, end)) / end;
        const last = merged[merged.length - 1];
        if (last && pct - last.pct < 1) last.label += ` · ${label}`;
        else merged.push({ label, pct });
      }
      const width = marks.clientWidth || 700;
      const rows = [[], []];
      for (const m of merged) {
        const w = m.label.length * 6.5 + 8;
        const x = (m.pct / 100) * width;
        const free = (row, span) => row.every(([a, b]) => span[1] <= a || span[0] >= b);
        const tries = [];
        for (const end of m.pct > 85 ? [true, false] : [false, true]) for (const r of [0, 1]) tries.push({ end, r, span: end ? [x - w, x] : [x, x + w] });
        const pick = tries.find((c) => free(rows[c.r], c.span));
        if (!pick && marks.lastChild) {
          marks.lastChild.textContent += ` · ${m.label}`; // no room of its own: it joins the mark before it
          continue;
        }
        const at0 = pick ?? tries[0];
        rows[at0.r].push(at0.span);
        marks.append(h('span', { class: `rs-mark${at0.end ? ' is-end' : ''}${at0.r ? ' is-low' : ''}`, style: `left: ${m.pct}%` }, m.label));
      }
    }
  }
  function renderCards() {
    clear(cards);
    if (!passes.length) {
      cards.append(h('p', { class: 'rs-faint' }, 'Set the run on the left and press Fly the pass.'));
      return;
    }
    passes.forEach((pass, i) => {
      const card = cardFor(pass, pass.n, { selected: i === selected, showFlags: values().showFlags, onSelect: () => select(i) });
      if (i === selected && pass.stale) card.append(h('p', { class: 'rs-stale' }, 'The settings have changed since this pass: Fly the pass again to see them.'));
      cards.append(card);
    });
  }
  function render() {
    const pass = current();
    if (values().viewMode !== '2d') world?.show(pass, t, values().camera);
    planView.set({ pass, t });
    view2d.set({ pass, t });
    scrub.value = String(t);
    timeWords.textContent = pass ? `+${clock(t)}` : '0:00';
  }
  function select(i) {
    selected = i;
    t = 0;
    pause();
    syncPlan();
    syncPass();
    renderCards();
    render();
  }

  // ---- Playback ----
  function play() {
    const pass = current();
    if (!pass) return;
    const end = pass.flight.timeline.t[pass.flight.timeline.t.length - 1];
    if (t >= end) t = 0;
    playing = true;
    playBtn.textContent = '❚❚';
    playBtn.setAttribute('aria-label', 'Pause');
    stopLoop ??= app.scheduler.frame((dtMs) => {
      t = Math.min(end, t + (Math.min(dtMs, 100) / 1000) * values().playSpeed); // a hidden tab's long gap doesn't jump the pass on
      if (t >= end) pause();
      render();
    });
  }
  function pause() {
    playing = false;
    playBtn.textContent = '▶';
    playBtn.setAttribute('aria-label', 'Play');
    stopLoop?.();
    stopLoop = null;
  }
  app.listen(playBtn, 'click', () => (playing ? pause() : play()));
  app.listen(scrub, 'input', () => {
    t = Number(scrub.value) || 0;
    render();
  });
  app.keys({ Space: () => (playing ? pause() : play()) });

  // ---- Flying the pass ----
  function fly() {
    setup.flyButton.disabled = true;
    status.textContent = 'Working out the pass…';
    pause();
    // A frame first, so the words show before the working-out (about half a second) holds the page.
    app.scheduler.after(30, () => {
      try {
        const v = values();
        const pass = flyPass(setupFrom(v), ground);
        pass.n = (passes[0]?.n ?? 0) + 1;
        pass.stale = false;
        passes = [pass, ...passes].slice(0, MAX_PASSES);
        plan = pass.plan;
        status.textContent = `Worked out in ${(pass.computeMs / 1000).toFixed(1)} s`;
        setup.update(v, plan, pass.exit);
        select(0);
        play();
      } catch (err) {
        status.textContent = 'The pass could not be worked out.';
        console.error('Run-in Simulator: the pass failed', err);
      } finally {
        setup.flyButton.disabled = false;
      }
    });
  }

  // ---- Working out the planned lines as the settings change ----
  let replanWake = null;
  function scheduleReplan() {
    replanWake?.();
    replanWake = app.scheduler.after(REPLAN_MS, () => {
      replanWake = null;
      try {
        plan = buildPlan(setupFrom(values()), ground);
      } catch (err) {
        plan = null;
        console.warn('Run-in Simulator: the plan could not be worked out', err);
      }
      setup.update(values(), plan, current()?.stale === false ? current().exit : null);
      syncTarget();
      syncPlan();
      render();
    });
  }

  function openMap() {
    pause();
    map.open();
  }

  // ---- Settings ----
  let before = values();
  const ON_SCREEN_ONLY = new Set(['camera', 'playSpeed', 'showLines', 'showCarp', 'showTrails', 'showFlags', 'viewMode', 'profileZoom']);
  settings.subscribe((v) => {
    const was = before;
    before = v;
    if (v.run !== was.run) {
      settings.update(runPatch(v.run));
      return; // the patch comes back through here
    }
    if (v.target !== was.target && v.targetSizeFt === was.targetSizeFt) {
      settings.update({ targetSizeFt: TARGETS[v.target].sizeFt });
      return;
    }
    // A worked-out number set by hand starts from what the computer worked out.
    const prefill = {};
    if (v.aimOffByHand && !was.aimOffByHand && plan) prefill.aimOffFt = Math.round(plan.worked.aimOffFt ?? 0);
    if (v.rollInByHand && !was.rollInByHand && plan?.dive) prefill.rollInFt = Math.round((plan.dive.rollInMsl - plan.groundFt) / 50) * 50;
    if (v.rollInKiasByHand && !was.rollInKiasByHand && plan?.dive) prefill.rollInKias = Math.round(plan.dive.rollInKias / 5) * 5;
    if (v.exitByHand && !was.exitByHand && current()?.exit) prefill.exitSec = Math.round(current().exit.sec);
    if (Object.keys(prefill).length) {
      settings.update(prefill);
      return;
    }
    if (v.placeLat !== was.placeLat || v.placeLon !== was.placeLon) {
      area = { ...area, projection: areaFor(place()).projection };
      terrain.setView(area.projection, FALLBACK_FT);
      world?.setArea(area.projection, FALLBACK_FT);
      map.refresh();
      view2d.refit();
    }
    const changed = Object.keys(v).filter((k) => v[k] !== was[k]);
    const flying = changed.filter((k) => !ON_SCREEN_ONLY.has(k));
    if (flying.length) {
      for (const p of passes) p.stale = true;
      scheduleReplan();
      renderCards();
    }
    if (v.viewMode !== was.viewMode || v.profileZoom !== was.profileZoom) syncView();
    if (changed.some((k) => k.startsWith('show'))) {
      syncPlan();
      syncPass();
      renderCards();
    }
    speeds.set(v.playSpeed);
    cams.set(v.camera, { disabled: AIRCRAFT[runOf(v.run).aircraft].cockpit ? {} : { cockpit: 'This aircraft has no cockpit model' } });
    setup.update(v, plan, current()?.stale === false ? current().exit : null);
    render();
  });

  speeds.set(values().playSpeed);
  cams.set(values().camera);
  syncView();
  setup.update(values(), null, null);
  renderCards();
  showGround();
  scheduleReplan();
  render();

  return () => {
    closed = true;
    pause();
    world?.dispose();
    map.dispose();
    planView.dispose();
    view2d.dispose();
    terrain.dispose();
    controls.dispose();
    stylesheet.remove();
  };
}

export default { id: 'run-in-sim', title: 'Run-in Simulator', mount };
