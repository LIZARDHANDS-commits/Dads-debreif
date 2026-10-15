// The instructor's console (console.js): its "Any setup" section (plan Step 5b; spec "Any setup"; EP-17 to EP-19). Shown only for an
// "Any setup" session. The map (setup-map.js) where a tap drops the aircraft; the setup's altitude, heading, airspeed, power, pitch and
// bank with their defaults (steps.js SETUP_DEFAULTS, EP-17); Freeze, Carry on and Pause; the step builder, one row per step the student
// described (power, roll, pitch, hold, until; a spin; a spin recovery), and Fly. Below it, for the instructor only: the new position and
// state in words, what is being flown, a stall, any published limit passed (flagged, never held), the outcome, and what was said last.
// Freeze, Carry on and Fly act at once (they are the instructor's moves, not indication changes waiting for Apply). Everything sent is
// checked again in scenario.js (steps.js cleanSetup, cleanRows). Nothing here judges the student's steps: they are flown as entered.
import { h, clear } from '../../ui-kit/dom.js';
import { compassDegFromVector, wrapDeg360 } from '../../core/angles.js';
import { FT_PER_NM } from '../../core/units.js';
import { isSetup } from './scenario.js';
import { stateWords, manoeuvreWords, flagsOf, flightNow, MAG_VARIATION_DEG_E, SETUP_FLOOR_KTAS } from './flight.js';
import { SETUP_DEFAULTS, SETUP_RANGES, ROW_RANGES, MAX_ROWS, STEP_PILOT, SPIN } from './steps.js';
import { createSetupMap } from './setup-map.js';

/** The track kept on the map since the freeze: a point every 300 ft flown, at most 2,000 (picture choices). */
const TRAIL_STEP_FT = 300;
const TRAIL_MAX = 2000;

const awayDegM = (x, y) => Math.round(wrapDeg360(compassDegFromVector(x, y) - MAG_VARIATION_DEG_E)) % 360;

/** dispatch(action): scenario.js act. timers: a scheduler scope for the map (none: no map). Returns { element, update(session) }. */
export function createSetupSection({ dispatch, button, timers = null }) {
  let session = null;
  // The drop and whether the heading was typed (until then it follows the drop: out of the area, away from Moose Jaw).
  const drop = { x: SETUP_DEFAULTS.x, y: SETUP_DEFAULTS.y };
  let headingTyped = false;

  const numberBox = (label, unit, range, value, step, onInput) => {
    const input = h('input', { type: 'number', class: 'ep-num', min: String(range[0]), max: String(range[1]), step: String(step), value: String(value), 'aria-label': `${label}, ${unit}` });
    if (onInput) input.addEventListener('input', onInput);
    return { input, el: h('label', { class: 'ep-setup-field' }, h('span', { class: 'ep-sub' }, label), h('span', { class: 'ep-edit' }, input, h('span', { class: 'ep-unit' }, unit))) };
  };
  const alt = numberBox('Altitude', 'ft MSL', SETUP_RANGES.altFt, SETUP_DEFAULTS.altFt, 100);
  const hdg = numberBox('Heading', '°M', [0, 359], awayDegM(drop.x, drop.y), 5, () => { headingTyped = true; showDrop(); });
  const kias = numberBox('Airspeed', 'KIAS', SETUP_RANGES.kias, SETUP_DEFAULTS.kias, 5);
  const power = numberBox('Power', '%', SETUP_RANGES.powerPct, SETUP_DEFAULTS.powerPct, 5);
  const pitch = numberBox('Pitch (+ nose up)', '°', SETUP_RANGES.pitchDeg, SETUP_DEFAULTS.pitchDeg, 5);
  const bank = numberBox('Bank (+ right)', '°', SETUP_RANGES.bankDeg, SETUP_DEFAULTS.bankDeg, 5);
  const dropWords = h('p', { class: 'ep-sub' });

  const map = timers ? createSetupMap({ timers, onDrop: (p) => {
    drop.x = p.x;
    drop.y = p.y;
    if (!headingTyped) hdg.input.value = String(awayDegM(p.x, p.y));
    showDrop();
  } }) : null;
  function showDrop() {
    const nm = Math.hypot(drop.x, drop.y) / FT_PER_NM;
    dropWords.textContent = `Drop: ${nm.toFixed(1)} NM from CYMJ on ${String(Math.round(compassDegFromVector(drop.x, drop.y))).padStart(3, '0')}°T${headingTyped ? '' : ' · heading out of the area (away from Moose Jaw) until you type one'}`;
    map?.setDrop({ x: drop.x, y: drop.y, headingDegT: wrapDeg360(Number(hdg.input.value) + MAG_VARIATION_DEG_E) });
  }

  // The boxes go as typed: scenario.js checks them (steps.js cleanSetup), an empty or bad one taking its default.
  const freezeBtn = button('Freeze', () => dispatch({ type: 'freeze', setup: {
    x: drop.x, y: drop.y, altFt: alt.input.value, headingDegM: headingTyped ? hdg.input.value : null, kias: kias.input.value,
    powerPct: power.input.value, pitchDeg: pitch.input.value, bankDeg: bank.input.value,
  } }), { class: 'ep-btn ep-btn-main', title: 'Put the student\'s cockpit at this state, paused' });
  const carryBtn = button('▶ Carry on', () => dispatch({ type: 'carryOn' }), { title: 'Fly on with the controls held: the same G, bank and power' });
  const pauseBtn = button('❚❚ Pause', () => dispatch({ type: 'pause' }));

  // ---- The step builder ----
  /** The rows being written (not yet flown): drafts the editors change in place; Fly sends them as rows (steps.js). */
  let drafts = [];
  const rowList = h('ol', { class: 'ep-setup-rows' });
  const flyBtn = button('Fly ▸', () => dispatch({ type: 'flySteps', rows: drafts.map(toRow) }), { class: 'ep-btn ep-btn-main', title: 'Fly the steps in order, exactly as entered' });
  const addFly = button('+ Step', () => addDraft({ type: 'fly', power: { kind: '', pct: 100 }, roll: { kind: '', bankDeg: 0 }, pitch: { kind: '', deg: 0 }, hold: { kind: '', headingDegM: 0 }, until: { kind: 'done', value: 0 } }));
  const addSpin = button('+ Spin', () => addDraft({ type: 'spin', dir: 'left', turns: 2 }));
  const addRecover = button('+ Spin recovery', () => addDraft({ type: 'recover' }));
  const clearBtn = button('Clear', () => {
    drafts = [];
    renderRows();
  });
  function addDraft(d) {
    if (drafts.length >= MAX_ROWS) return;
    drafts.push(d);
    renderRows();
  }
  const toRow = (d) => {
    if (d.type !== 'fly') return { ...d };
    const row = { type: 'fly', until: d.until.kind === 'done' ? { kind: 'done' } : { kind: d.until.kind, value: d.until.value } };
    for (const part of ['power', 'roll', 'pitch', 'hold']) if (d[part].kind) row[part] = { ...d[part] };
    return row;
  };

  /** A select whose number box shows only for the choices that need one. */
  function partEditor(label, part, choices, numberFor) {
    const box = h('input', { type: 'number', class: 'ep-num', 'aria-label': `${label} value` });
    const unit = h('span', { class: 'ep-unit' });
    const select = h('select', { 'aria-label': label }, choices.map(([value, words]) => h('option', { value }, words)));
    select.value = part.kind;
    const sync = () => {
      const need = numberFor(part.kind);
      box.hidden = !need;
      unit.hidden = !need;
      if (need) {
        box.min = String(need.range[0]);
        box.max = String(need.range[1]);
        box.step = String(need.step);
        unit.textContent = need.unit;
        box.value = String(part[need.key]);
      }
    };
    select.addEventListener('change', () => {
      part.kind = select.value;
      const need = numberFor(part.kind);
      if (need && !Number.isFinite(part[need.key])) part[need.key] = need.range[0];
      sync();
      renderFlyState();
    });
    box.addEventListener('input', () => {
      const need = numberFor(part.kind);
      if (need) part[need.key] = box.value === '' ? NaN : Number(box.value); // an empty box drops that part (steps.js cleanRows)
    });
    sync();
    return h('label', { class: 'ep-row ep-setup-part' }, h('span', { class: 'ep-sub' }, label), select, box, unit);
  }

  const UNTIL_NEEDS = Object.freeze({
    kias: { key: 'value', range: ROW_RANGES.kias, step: 5, unit: 'KIAS' },
    altFt: { key: 'value', range: ROW_RANGES.altFt, step: 100, unit: 'ft' },
    headingDegM: { key: 'value', range: [0, 359], step: 5, unit: '°M' },
    seconds: { key: 'value', range: ROW_RANGES.seconds, step: 1, unit: 's' },
  });
  function rowEditor(d, i) {
    const remove = button('✕', () => {
      drafts.splice(i, 1);
      renderRows();
    }, { class: 'ep-btn ep-btn-small', 'aria-label': `Remove step ${i + 1}` });
    const head = h('div', { class: 'ep-row ep-setup-row-head' }, h('b', {}, `Step ${i + 1}`), remove);
    if (d.type === 'recover') return h('li', { class: 'ep-setup-row' }, head, h('p', { class: 'ep-sub' }, `Spin recovery: the spin goes on ${SPIN.recoveryTurns} turns, then the dive pull-out to the horizon, wings level, on the flight model (estimate numbers).`));
    if (d.type === 'spin') {
      const dir = h('select', { 'aria-label': 'Spin direction' }, h('option', { value: 'left' }, 'left'), h('option', { value: 'right' }, 'right'));
      dir.value = d.dir;
      dir.addEventListener('change', () => { d.dir = dir.value; });
      const turns = h('input', { type: 'number', class: 'ep-num', min: String(ROW_RANGES.turns[0]), max: String(ROW_RANGES.turns[1]), step: '0.5', value: String(d.turns), 'aria-label': 'Spin turns' });
      turns.addEventListener('input', () => { d.turns = turns.value === '' ? NaN : Number(turns.value); });
      return h('li', { class: 'ep-setup-row' }, head,
        h('label', { class: 'ep-row ep-setup-part' }, h('span', { class: 'ep-sub' }, 'Spin'), dir, turns, h('span', { class: 'ep-unit' }, 'turns')),
        h('p', { class: 'ep-sub' }, 'First flies the wing to the stall (power idle, nose up), then spins on the set-piece\'s numbers ', h('span', { class: 'ep-estimate' }, '(estimate)'), '. It keeps spinning until a Spin recovery step.'));
    }
    return h('li', { class: 'ep-setup-row' }, head,
      partEditor('Power', d.power, [['', '— as it was'], ['idle', 'idle'], ['max', 'max'], ['pct', 'to a %']], (k) => (k === 'pct' ? { key: 'pct', range: ROW_RANGES.pct, step: 5, unit: '%' } : null)),
      partEditor('Roll', d.roll, [['', '— as it was'], ['nearest', 'to the nearest horizon'], ['level', 'wings level'], ['bank', 'to a bank']], (k) => (k === 'bank' ? { key: 'bankDeg', range: ROW_RANGES.bankDeg, step: 5, unit: '° (+ right)' } : null)),
      partEditor('Pitch', d.pitch, [['', '— as it was'], ['horizon', 'to the horizon'], ['attitude', 'to an attitude']], (k) => (k === 'attitude' ? { key: 'deg', range: ROW_RANGES.deg, step: 5, unit: '° (+ up)' } : null)),
      partEditor('Hold', d.hold, [['', '— nothing'], ['level', 'level'], ['heading', 'a heading']], (k) => (k === 'heading' ? { key: 'headingDegM', range: [0, 359], step: 5, unit: '°M' } : null)),
      partEditor('Until', d.until, [['done', 'done (its targets reached)'], ['kias', 'a speed'], ['altFt', 'an altitude'], ['headingDegM', 'a heading'], ['seconds', 'seconds']], (k) => UNTIL_NEEDS[k] ?? null));
  }
  function renderRows() {
    clear(rowList);
    drafts.forEach((d, i) => rowList.append(rowEditor(d, i)));
    if (!drafts.length) rowList.append(h('li', { class: 'ep-faint' }, 'No steps yet: add what the student described, one step each.'));
    renderFlyState();
  }

  // ---- What the aircraft is doing (the instructor's eyes only) ----
  const nowLine = h('p', { class: 'ep-pick-flying' });
  const flyingLine = h('p', { class: 'ep-sub' });
  const stallLine = h('p', { class: 'ep-next', hidden: true });
  const flagLine = h('p', { class: 'ep-next', hidden: true });
  const latest = h('ul', { class: 'ep-pick-log' });

  const element = h('section', { class: 'ep-con-section ep-setup-section', hidden: true },
    h('h3', {}, 'Any setup ', h('span', { class: 'ep-sub' }, 'freeze at any point of a manoeuvre; the student sees only the cockpit')),
    map?.element ?? h('p', { class: 'ep-sub' }, 'The map needs the page\'s scheduler; the drop stays where it is.'),
    dropWords,
    h('div', { class: 'ep-setup-grid' }, alt.el, hdg.el, kias.el, power.el, pitch.el, bank.el),
    h('p', { class: 'ep-sub' }, `Gear and flaps up. Defaults: 12 NM south-west of Moose Jaw, 8,000 ft, heading out of the area, ${SETUP_DEFAULTS.kias} KIAS, ${SETUP_DEFAULTS.powerPct} % power, pitch 0°, bank 0° `, h('span', { class: 'ep-estimate' }, '(estimates)'), '.'),
    h('div', { class: 'ep-row' }, freezeBtn, carryBtn, pauseBtn),
    nowLine, flyingLine, stallLine, flagLine,
    h('h4', {}, 'Steps the student described'),
    rowList,
    h('div', { class: 'ep-row' }, addFly, addSpin, addRecover, clearBtn, flyBtn),
    h('details', { class: 'ep-more' }, h('summary', {}, 'Said so far'), latest),
    h('details', { class: 'ep-more' }, h('summary', {}, 'The numbers it flies by'),
      h('p', { class: 'ep-sub' },
        `Carry on holds the freeze's G, bank and power; the G at a freeze keeps the path straight (at most 2 G). A step with no end stops after ${STEP_PILOT.rowCapS} s. "The nearest horizon" rolls up to ${STEP_PILOT.nearestHorizonBankDeg}° while the nose is above it. A step's pull stays in the stick shaker, at most ${STEP_PILOT.pullMaxG} G. Reached: bank within ${STEP_PILOT.bankTolDeg}°, attitude within ${STEP_PILOT.pitchTolDeg}°, heading within ${STEP_PILOT.headingTolDeg}°, height within ${STEP_PILOT.altTolFt} ft. Never slower than ${SETUP_FLOOR_KTAS} KTAS (no tail slide is flown). `,
        h('span', { class: 'ep-estimate' }, '(estimates)')),
      h('p', { class: 'ep-sub' },
        `Spin: ${SPIN.secondsPerTurn} s and ${SPIN.ftPerTurn} ft a turn, nose ${Math.abs(SPIN.noseDeg)}° down, ${SPIN.kias} KIAS; recovery ${SPIN.recoveryTurns} turns, leaving the nose ${Math.abs(SPIN.exitNoseDeg)}° down at ${SPIN.exitKias} KIAS. `,
        h('span', { class: 'ep-estimate' }, '(estimates, until a manual page or Patrick\'s ruling)'))));

  function renderFlyState() {
    const f = session?.flight;
    flyBtn.disabled = !drafts.length || !f || Boolean(f.outcome);
  }

  // The track since the freeze, for the map.
  let trail = [];
  let trailKey = null;
  let logCount = -1;
  function update(s) {
    session = s;
    element.hidden = !isSetup(s);
    if (element.hidden) return;
    const f = s.flight;
    if (!f) return;
    nowLine.textContent = f.outcome ? f.outcome.words : `Now: ${stateWords(f)}`;
    flyingLine.textContent = f.outcome ? 'The flight has ended. Freeze again to set up anew.' : `${s.running ? 'Flying' : 'Paused, then'}: ${manoeuvreWords(f)}`;
    stallLine.hidden = !f.setup?.stalled || Boolean(f.outcome);
    stallLine.textContent = 'Stalled: the wing can\'t give the G being held (it gives what it can).';
    const fl = f.outcome ? [] : flagsOf(f);
    flagLine.hidden = !fl.length;
    flagLine.textContent = fl.length ? `Flagged (a reference, not held): ${fl.join('; ')}` : '';
    carryBtn.disabled = Boolean(f.outcome);
    pauseBtn.disabled = !s.running;
    renderFlyState();
    if (s.log.length !== logCount) {
      logCount = s.log.length;
      clear(latest);
      const lines = s.log.slice(-12);
      for (const l of lines) latest.append(h('li', {}, `${Math.floor(l.tS / 60)}:${String(Math.floor(l.tS % 60)).padStart(2, '0')} ${l.text}`));
    }
    // A new freeze starts a new track.
    const key = s.scenario.start.setup;
    const n = flightNow(f);
    if (key !== trailKey) {
      trailKey = key;
      trail = [];
    }
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(n.x - last.x, n.y - last.y) >= TRAIL_STEP_FT) {
      trail = [...trail.slice(-(TRAIL_MAX - 1)), { x: n.x, y: n.y }];
    }
    map?.setAircraft({ x: n.x, y: n.y, headingDegT: n.headingDegT }, trail);
  }

  renderRows();
  showDrop();
  return { element, update };
}
