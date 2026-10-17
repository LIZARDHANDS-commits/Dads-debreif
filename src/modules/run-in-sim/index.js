// The Run-in Simulator (docs/modules/run-in-sim/spec.md; RS-1): one screen. Setup on the left (setup-panel.js), the 3D view
// in the middle (world3d.js) with the plan view (plan-view.js) and the map to tap a place (map-picker.js), or behind the
// 3D | 2D switch above it the 2D plan and profile (view2d.js, RS-13), the bar under
// the view (the time line with the legs marked, play and pause, ×1 to ×8 and the cameras), and the result cards on the
// right (card.js). "Fly the pass" works the whole pass out first (pass.js) into a stored timeline; playing and scrubbing
// only read it. "Training only" always shows (RS-2). Everything mount() starts runs on the shell's scheduler and
// listeners, so the shell stops it all when the module closes.
// The air refuelling run (RS-15 to RS-18; approved: Patrick's yes, relayed by Dad, 17 Oct 2026) is worked out and
// flown by refuel.js instead of pass.js, with its own card (card.js refuelCardFor), marks and two more cameras.
// The anthem flyover (RS-24, RS-25): on the Flyover, the chosen anthem's last note is the time over target (planned); the
// bar's Anthem starts button makes the press the anthem's start and works the pass out again from there with the past
// kept (pass.js flyPassFrom), playback carrying on; the tune plays in the browser at ×1 (anthem-player.js).
import { h, clear } from '../../ui-kit/dom.js';
import { FT_PER_NM } from '../../core/units.js';
import { createSettings } from '../../storage/settings.js';
import { createControls } from '../../ui-kit/controls.js';
import { createPillGroup } from '../../ui-kit/camera-bar.js';
import { createTerrain3d } from '../../ui-kit/terrain3d.js';
import { airportElevationFt } from '../../ui-kit/airfield3d.js';
import { webglSupported } from '../../ui-kit/three-aircraft.js';
import { TRAFFIC_VERSION } from '../traffic/version.js';
import { DEFAULTS, ALLOWED, CAMERAS, AAR_CAMERAS, PLAY_SPEEDS, runPatch, setupFrom, runOf, placeFor } from './defaults.js';
import { TARGETS } from './targets.js';
import { AIRCRAFT } from './aircraft.js';
import { buildPlan, flyPass, flyAnthemPress, clock } from './pass.js';
import { ANTHEMS } from './anthems.js';
import { createAnthemPlayer } from './anthem-player.js';
import { buildRefuelPlan, flyRefuel } from './refuel.js';
import { areaFor, aarGroundCentre } from './area.js';
import { createSetup } from './setup-panel.js';
import { cardFor, refuelCardFor } from './card.js';
import { createPlanView } from './plan-view.js';
import { createMapPicker } from './map-picker.js';
import { createRunInWorld } from './world3d.js';
import { createView2d } from './view2d.js';

const STYLESHEET = new URL('./run-in-sim.css', import.meta.url).href;
/** The working-out of the planned lines waits this long after the last change, ms (an estimate that keeps typing smooth). */
const REPLAN_MS = 400;
/** A change of setting flies the pass again by itself this long after the last change, ms (Dad, 17 Oct 2026: "Re-fly on its own"). */
const REFLY_MS = 600;
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
  // The refuelling run from the take-off centres its ground near CYMJ (RS-19, area.js aarGroundCentre); the flying stays
  // in the place's feet, the terrain is read in the ground's own (offset) frame.
  const groundCentre = () => (values().run === 'aar' && !values().aarAirborne ? aarGroundCentre(place()) : null);
  let area = areaFor(place(), groundCentre());
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
  terrain.setView(area.ground.projection, FALLBACK_FT);
  const ground = {
    groundAt: (x, y) => terrain.heightFt(x - area.ground.offset.x, y - area.ground.offset.y),
    known: (x, y) => terrain.known(x - area.ground.offset.x, y - area.ground.offset.y),
  };

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
    timers: app.scheduler, controls, getPlace: place, defaultWords: placeFor(DEFAULTS.run).words,
    onPlace: (p) => settings.update({ placeLat: p.lat, placeLon: p.lon, placeIsDefault: false }),
    onDefault: () => settings.update({ placeLat: placeFor(values().run).lat, placeLon: placeFor(values().run).lon, placeIsDefault: true }), // the run's own (RS-19)
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
  // The anthem flyover (RS-24, RS-25): the button, and a word when the tune is muted.
  const anthemBtn = h('button', { type: 'button', class: 'rs-btn rs-anthem-btn', hidden: true, title: 'Start the anthem now: the aircraft is timed to cross on its last note' }, 'Anthem starts');
  const anthemNote = h('span', { class: 'rs-faint rs-anthem-note', hidden: true });
  const player = createAnthemPlayer();
  let anthemStopped = false; // pressed again while it played: quiet until the next press or pass
  const cams = createPillGroup({ prefix: 'rs', label: 'Camera', items: CAMERAS.map((c) => ({ id: c.id, label: c.label })), onPick: (c) => settings.update({ camera: c }) });
  const bar = h('div', { class: 'rs-playbar' },
    h('div', { class: 'rs-timeline' }, marks, scrub),
    h('div', { class: 'rs-controls' }, playBtn, speeds.element, timeWords, anthemBtn, anthemNote, h('span', { class: 'rs-spacer' }), cams.element));

  const cards = h('div', { class: 'rs-cards' });
  const result = h('aside', { class: 'rs-result', 'aria-label': 'Result' },
    h('h2', { class: 'rs-col-title' }, 'Result'),
    cards,
    h('p', { class: 'rs-foot' }, 'Flags are references, never walls: a setting past a published limit is flown and flagged (RS-6).'));

  root.append(h('section', { class: 'rs' },
    h('header', { class: 'rs-bar' },
      h('h1', {}, 'Advanced Mission Sets'), // the name people see (Dad, 17 Oct 2026; it was the Run-in Simulator)
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
      console.warn('Advanced Mission Sets: 3D view failed to load', err);
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
    if (s.aar) {
      world?.setTarget(null); // the refuelling run has no target
      return;
    }
    world?.setTarget({ id: v.target, sizeFt: v.targetSizeFt, headingDegT: s.target.headingDegT, groundFt: ground.groundAt(0, 0), dressed: v.showStadium, anthem: v.run === 'flyover' ? v.anthem : 'none' });
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
      const an = pass.anthem;
      const at = an ? [['Orbit', 0], ['IP', ev.ip], ['Anthem starts', an.startSec], ['TOT · Last note', pass.result.arrivalSec ?? ev.release], ['Escape', ev.release !== undefined ? ev.release + 2 : undefined]] : pass.plan.kind === 'aar' ? [[pass.plan.takeoff ? 'Takeoff' : 'Start', pass.plan.takeoff ? (ev.takeoff ?? 0) : 0], ['IP', ev.ip], ['Tanker turns', ev.turn], ['Roll-out', ev.rollOut], ['Pre-contact', ev.preContact]] : [['Orbit', 0], ['IP', ev.ip], ['Roll-in', ev.rollIn], [pass.plan.run === 'flyover' ? 'TOT' : 'Release', ev.release], [pass.plan.run === 'flyover' ? null : 'TOT', pass.result.arrivalSec], ['Escape', ev.release !== undefined ? ev.release + 2 : undefined]];
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
      const card = (pass.plan.kind === 'aar' ? refuelCardFor : cardFor)(pass, pass.n, { selected: i === selected, showFlags: values().showFlags, onSelect: () => select(i) });
      if (i === selected && pass.stale) card.append(h('p', { class: 'rs-stale' }, 'Flying it again with the new settings…'));
      cards.append(card);
    });
  }
  /** The anthem's sound kept in step with playback (RS-25): at ×1, while playing, inside the anthem; else quiet. */
  function syncAnthem() {
    const pass = current();
    const an = pass?.anthem;
    const flyover = values().run === 'flyover' && values().anthem !== 'none';
    anthemBtn.hidden = !flyover;
    anthemBtn.disabled = !pass || pass.plan.run !== 'flyover';
    anthemBtn.textContent = player.playing() ? 'Stop the anthem' : 'Anthem starts';
    const into = an ? t - an.startSec : null;
    const inside = an && into >= 0 && into < an.lengthSec;
    const fast = values().playSpeed !== 1;
    anthemNote.hidden = !(inside && playing && fast);
    anthemNote.textContent = 'The anthem plays at ×1 only';
    if (inside && playing && !fast && !anthemStopped) {
      const at = player.positionSec();
      if (!player.playing() || at === null || Math.abs(at - into) > 0.4) player.play(an.id, an.lengthSec, into);
    } else if (player.playing()) {
      player.stop();
    }
  }
  function render() {
    syncAnthem();
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
    player.stop(); // the anthem stops on pause (RS-25)
    playBtn.textContent = '▶';
    playBtn.setAttribute('aria-label', 'Play');
    stopLoop?.();
    stopLoop = null;
  }
  app.listen(playBtn, 'click', () => {
    player.unlock(); // the browser lets sound start only from a press on the page
    if (playing) pause();
    else play();
  });
  // A live anthem press (RS-24): the press is the anthem's start, its last note the time over target; the pass is worked out
  // again from that moment with the past kept, and playback carries on from it. Pressed while it plays: the tune stops.
  app.listen(anthemBtn, 'click', () => {
    player.unlock();
    if (player.playing()) {
      anthemStopped = true;
      player.stop();
      render();
      return;
    }
    const pass = current();
    const v = values();
    if (!pass || pass.plan.run !== 'flyover' || v.anthem === 'none') return;
    const id = v.anthem;
    const lengthSec = id === 'us' ? v.anthemUsSec : v.anthemCanadaSec;
    const pressSec = t;
    try {
      // RS-26, RS-27: the best of staying in the orbit or cutting track, with the run-in speed worked out to hit.
      const next = flyAnthemPress(pass, { ...setupFrom(v), totSec: pressSec + lengthSec }, ground, pressSec);
      next.anthem = { id, lengthSec, startSec: pressSec, live: true };
      next.n = pass.n;
      next.stale = false;
      passes[selected] = next;
      plan = next.plan;
      anthemStopped = false;
      status.textContent = `Anthem started at +${clock(pressSec)}: worked out again from there`;
      syncPlan();
      syncPass();
      renderCards();
      t = pressSec;
      play();
    } catch (err) {
      status.textContent = 'The anthem timing could not be worked out.';
      console.error('Advanced Mission Sets: the anthem timing failed', err);
    }
  });
  app.listen(scrub, 'input', () => {
    t = Number(scrub.value) || 0;
    render();
  });
  app.keys({ Space: () => (playing ? pause() : play()) });

  // ---- Flying the pass ----
  // replace: a re-fly after a change of setting takes the latest pass's place; the button adds a new pass to compare.
  function fly({ replace = false } = {}) {
    player.unlock();
    reflyWake?.();
    reflyWake = null;
    setup.flyButton.disabled = true;
    status.textContent = 'Working out the pass…';
    pause();
    // A frame first, so the words show before the working-out (about half a second) holds the page.
    app.scheduler.after(30, () => {
      try {
        const v = values();
        const s = setupFrom(v);
        const pass = s.aar ? flyRefuel(s, ground) : flyPass(s, ground);
        // The planned anthem (RS-24): on the Flyover its last note is the time over target, so it starts its length before.
        if (s.run === 'flyover' && v.anthem !== 'none') {
          const lengthSec = v.anthem === 'us' ? v.anthemUsSec : v.anthemCanadaSec;
          pass.anthem = { id: v.anthem, lengthSec, startSec: Math.max(0, s.totSec - lengthSec), live: false };
        }
        anthemStopped = false;
        // The refuelling run's worked-out start and turn range, for the Setup's "set to hit" (RS-16).
        if (s.aar) Object.assign(pass.exit, { startNm: pass.result.worked.startNm, turnRangeNm: pass.result.worked.turnRangeNm, ipSec: pass.result.takeoff?.ipSec ?? null });
        const swap = replace && passes.length > 0;
        pass.n = swap ? passes[0].n : (passes[0]?.n ?? 0) + 1;
        pass.stale = false;
        passes = swap ? [pass, ...passes.slice(1)] : [pass, ...passes].slice(0, MAX_PASSES);
        plan = pass.plan;
        status.textContent = `Worked out in ${(pass.computeMs / 1000).toFixed(1)} s`;
        setup.update(v, plan, pass.exit);
        select(0);
        play();
      } catch (err) {
        status.textContent = 'The pass could not be worked out.';
        console.error('Advanced Mission Sets: the pass failed', err);
      } finally {
        setup.flyButton.disabled = false;
      }
    });
  }

  // ---- Flying again by itself after a change (Dad, 17 Oct 2026) ----
  let reflyWake = null;
  function scheduleRefly() {
    reflyWake?.();
    reflyWake = app.scheduler.after(REFLY_MS, () => {
      reflyWake = null;
      if (setup.flyButton.disabled) scheduleRefly(); // a pass is still being worked out: try again after it
      else fly({ replace: true });
    });
  }

  // ---- Working out the planned lines as the settings change ----
  let replanWake = null;
  function scheduleReplan() {
    replanWake?.();
    replanWake = app.scheduler.after(REPLAN_MS, () => {
      replanWake = null;
      try {
        const s = setupFrom(values());
        plan = s.aar ? buildRefuelPlan(s, ground) : buildPlan(s, ground);
      } catch (err) {
        plan = null;
        console.warn('Advanced Mission Sets: the plan could not be worked out', err);
      }
      setup.update(values(), plan, current()?.stale === false ? current().exit : null);
      syncTarget();
      syncPlan();
      render();
    });
  }

  /** Whether the camera picked is one this run has. */
  function cameraFits(v) {
    return v.run === 'aar' ? v.camera !== 'target' : !AAR_CAMERAS.includes(v.camera);
  }
  /** The camera bar for the run: the refuelling run's two cameras show only on it, and its Target is greyed (RS-18). */
  function syncCams(v) {
    const aar = v.run === 'aar';
    CAMERAS.forEach((c, i) => {
      const pill = /** @type {HTMLElement} */ (cams.element.children[i]);
      if (pill) pill.hidden = AAR_CAMERAS.includes(c.id) && !aar;
    });
    const disabled = AIRCRAFT[runOf(v.run).aircraft].cockpit ? {} : { cockpit: 'This aircraft has no cockpit model' };
    if (aar) disabled.target = 'The refuelling run has no target';
    cams.set(v.camera, { disabled });
  }

  function openMap() {
    pause();
    map.open();
  }

  // ---- Settings ----
  let before = values();
  const ON_SCREEN_ONLY = new Set(['camera', 'playSpeed', 'showLines', 'showCarp', 'showTrails', 'showStadium', 'showFlags', 'viewMode', 'profileZoom']);
  settings.subscribe((v) => {
    const was = before;
    before = v;
    if (v.run !== was.run) {
      const patch = runPatch(v.run, v);
      if (Object.keys(patch).some((k) => v[k] !== patch[k])) {
        settings.update(patch);
        return; // the patch comes back through here
      }
      // A patch that changes nothing (the refuelling run's defaults already set) sends no second notice: carry on here.
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
    const aarDone = current()?.plan.kind === 'aar' ? current().result.worked : null;
    if (v.aarTurnRangeByHand && !was.aarTurnRangeByHand && Number.isFinite(aarDone?.turnRangeNm)) prefill.aarTurnRangeNm = Math.round(aarDone.turnRangeNm * 10) / 10;
    if (v.aarRcvKiasByHand && !was.aarRcvKiasByHand && plan?.kind === 'aar') prefill.aarRcvKias = Math.round(plan.worked.rcvKias / 5) * 5;
    if (v.aarOffsetByHand && !was.aarOffsetByHand && plan?.kind === 'aar') prefill.aarOffsetNm = Math.round((plan.worked.offsetFt / FT_PER_NM) * 10) / 10;
    // A camera the run hasn't got goes back to Chase (the refuelling run's two show only on it; it has no Target).
    if (!cameraFits(v)) {
      settings.update({ camera: 'chase' });
      return;
    }
    if (Object.keys(prefill).length) {
      settings.update(prefill);
      return;
    }
    if (v.placeLat !== was.placeLat || v.placeLon !== was.placeLon || v.run !== was.run || v.aarAirborne !== was.aarAirborne) {
      const next = areaFor(place(), groundCentre());
      area = { ...area, projection: next.projection, ground: next.ground };
      terrain.setView(area.ground.projection, FALLBACK_FT);
      world?.setArea(area, FALLBACK_FT);
      map.refresh();
      view2d.refit();
    }
    const changed = Object.keys(v).filter((k) => v[k] !== was[k]);
    const flying = changed.filter((k) => !ON_SCREEN_ONLY.has(k));
    if (flying.length) {
      for (const p of passes) p.stale = true;
      scheduleReplan();
      scheduleRefly();
      renderCards();
    }
    if (v.viewMode !== was.viewMode || v.profileZoom !== was.profileZoom) syncView();
    if (v.showStadium !== was.showStadium) syncTarget();
    if (changed.some((k) => k.startsWith('show'))) {
      syncPlan();
      syncPass();
      renderCards();
    }
    speeds.set(v.playSpeed);
    syncCams(v);
    setup.update(v, plan, current()?.stale === false ? current().exit : null);
    render();
  });

  speeds.set(values().playSpeed);
  syncCams(values());
  syncView();
  setup.update(values(), null, null);
  renderCards();
  showGround();
  scheduleReplan();
  render();

  return () => {
    closed = true;
    pause();
    player.dispose();
    world?.dispose();
    map.dispose();
    planView.dispose();
    view2d.dispose();
    terrain.dispose();
    controls.dispose();
    stylesheet.remove();
  };
}

export default { id: 'run-in-sim', title: 'Advanced Mission Sets', mount };
