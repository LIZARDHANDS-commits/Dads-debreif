// The Setup column (spec, "Left: Setup"; house rules): showing from the start the Run, the Aircraft (filled in from the
// run), the Target, the Place and the Time over target; below them closed boxes, each with its settings in one line:
// Orbit, Run-in, Release, Escape, Wind and Display. Each box shows only the few settings the user sets for that run
// (RS-9); the numbers the computer works out show greyed with "set to hit", and More sets one by hand. Every setting
// starts at a default, and each box says its defaults are estimates. The main button is "Fly the pass".
import { h } from '../../ui-kit/dom.js';
import { createPanel } from '../../ui-kit/panel.js';
import { RUNS, RANGES, runOf } from './defaults.js';
import { TARGETS } from './targets.js';
import { AIRCRAFT } from './aircraft.js';
import { clock } from './pass.js';

const ESTIMATE = 'Defaults here are estimates until Patrick or a manual page gives them (RS-Q2).';
const ft10 = (n) => `${(Math.round(n / 10) * 10).toLocaleString('en-CA')} ft`;
const deg3 = (d) => `${String(Math.round(d) % 360 || 360).padStart(3, '0')}°M`;

/**
 * settings: the module's settings (get, update); controls: createControls over them; onFly(); onOpenMap().
 * Returns { element, flyButton, update(values, plan, exit) }.
 */
export function createSetup({ settings, controls, onFly, onOpenMap }) {
  const num = (key, label, unit = '') => controls.number(key, { label, unit, ...RANGES[key] });
  const windNum = (key, label, kind) => controls.number(key, { label, unit: kind === 'deg' ? '°M' : 'kt', ...RANGES[kind === 'deg' ? 'windDeg' : 'windKt'] });
  const hit = (label) => {
    const value = h('span', { class: 'rs-hit-value' }, '—');
    const el = h('div', { class: 'rs-hit', title: 'Worked out by the computer so the pass hits (RS-9); More sets it by hand.' }, h('span', {}, label, h('em', {}, ' · set to hit')), value);
    return { el, value };
  };
  const more = (...children) => h('details', { class: 'rs-more' }, h('summary', {}, 'More'), ...children);
  const note = () => h('p', { class: 'rs-estimate', title: ESTIMATE }, 'ⓘ Defaults are estimates');
  const box = (title) => {
    const panel = createPanel({ title, collapsed: true });
    const sum = h('span', { class: 'rs-sum' });
    panel.button.append(sum);
    return { panel, sum };
  };

  // ---- Showing from the start ----
  const aircraftName = h('span', { class: 'rs-fixed-value' });
  const placeWords = h('span', { class: 'rs-place-words' });
  const totWords = h('span', { class: 'rs-faint' });
  const mapButton = h('button', { type: 'button', class: 'rs-btn' }, 'Tap the map');
  mapButton.addEventListener('click', onOpenMap);
  const targetHeadingBox = num('targetHeadingDegM', 'Its heading', '°M');
  const targetMore = more(
    num('targetSizeFt', 'Size, its main dimension', 'ft'),
    controls.checkbox('targetTurnByHand', { label: 'Turn it to a heading of its own (else the run-in heading)' }),
    targetHeadingBox);
  const top = h('div', { class: 'rs-top' },
    controls.select('run', { label: 'Run', options: RUNS.map((r) => [r.id, r.label]) }),
    h('div', { class: 'control rs-fixed' }, h('span', { class: 'rs-fixed-label' }, 'Aircraft'), aircraftName),
    controls.select('target', { label: 'Target', options: Object.values(TARGETS).map((t) => [t.id, t.label]) }),
    targetMore,
    h('div', { class: 'control rs-place' }, h('span', { class: 'rs-fixed-label' }, 'Place'), mapButton, placeWords),
    h('div', { class: 'rs-tot' }, num('totSec', 'Time over target, seconds after the start', 's'), totWords));

  // ---- Orbit ----
  const orbit = box('Orbit');
  const radiusBox = num('orbitRadiusNm', 'Radius (a circle over the ground)', 'NM');
  const bankBox = num('orbitBankDeg', 'Bank (a steady bank, drifting with the wind)', '°');
  const exitHit = hit('Leave the orbit');
  const exitBox = num('exitSec', 'Leave at, seconds after the start', 's');
  orbit.panel.body.append(
    num('orbitHeightFt', 'Height above the target\'s ground', 'ft AGL'),
    controls.choice('orbitMode', { label: 'Flown as', options: [['radius', 'Radius'], ['bank', 'Bank']] }),
    radiusBox, bankBox,
    controls.choice('orbitDir', { label: 'Direction', options: [['left', 'Left'], ['right', 'Right']] }),
    num('orbitKias', 'Orbit speed', 'KIAS'),
    num('orbitBackNm', 'Centre, miles back from the target along the run-in', 'NM'),
    exitHit.el,
    more(controls.checkbox('exitByHand', { label: 'Leave the orbit at a time set by hand' }), exitBox),
    note());

  // ---- Run-in ----
  const runIn = box('Run-in');
  const flatBtn = h('button', { type: 'button', class: 'rs-seg', 'aria-pressed': 'false' }, 'Flat');
  const diveBtn = h('button', { type: 'button', class: 'rs-seg', 'aria-pressed': 'false' }, 'Dive');
  flatBtn.addEventListener('click', () => settings.get().run !== 'bombFlat' && settings.update({ run: 'bombFlat' }));
  diveBtn.addEventListener('click', () => settings.get().run !== 'bombDive' && settings.update({ run: 'bombDive' }));
  const profile = h('div', { class: 'control rs-profile' }, h('span', { class: 'rs-fixed-label' }, 'Profile'), h('div', { class: 'rs-segs', role: 'group', 'aria-label': 'Profile' }, flatBtn, diveBtn));
  const speedBox = num('kias', 'Speed', 'KIAS');
  const speedLabel = speedBox.querySelector('label');
  const diveBox = num('diveDeg', 'Dive angle', '°');
  const crabHit = hit('Crab for the wind');
  const aimHit = hit('Aim-off for the wind');
  const rollInHit = hit('Roll-in');
  const aimBox = num('aimOffFt', 'Aim-off: the run-in line this far right of the target (left −)', 'ft');
  const rollInFtBox = num('rollInFt', 'Roll-in height', 'ft AGL');
  const rollInKiasBox = num('rollInKias', 'Roll-in speed', 'KIAS');
  const aimHand = controls.checkbox('aimOffByHand', { label: 'Set the aim-off by hand' });
  const rollInHand = controls.checkbox('rollInByHand', { label: 'Set the roll-in height by hand' });
  const rollInKiasHand = controls.checkbox('rollInKiasByHand', { label: 'Set the roll-in speed by hand' });
  runIn.panel.body.append(
    num('runInDegM', 'Run-in heading', '°M'),
    num('ipNm', 'IP, miles back from the target', 'NM'),
    speedBox, profile, diveBox,
    crabHit.el, aimHit.el, rollInHit.el,
    more(aimHand, aimBox, rollInHand, rollInFtBox, rollInKiasHand, rollInKiasBox),
    note());

  // ---- Release (or the flyover's height) ----
  const release = box('Release');
  const overTopBox = num('heightOverTopFt', 'Height over the target\'s top', 'ft');
  const releaseFtBox = num('releaseFt', 'Release height', 'ft AGL');
  const whereBox = controls.choice('releaseMode', { label: 'Where to release', options: [['carp', 'At the CARP'], ['distance', 'Set distance']] });
  const distBox = num('releaseDistFt', 'Distance before the target', 'ft');
  const releaseHit = hit('Release point');
  release.panel.body.append(overTopBox, releaseFtBox, whereBox, distBox, releaseHit.el, note());

  // ---- Escape ----
  const escape = box('Escape');
  const turnBoxes = [num('escapeG', 'G', 'G'), num('escapeBankDeg', 'Bank', '°'), num('escapeTurnDeg', 'Heading change', '°')];
  escape.panel.body.append(
    controls.choice('escapeDir', { label: 'Turn', options: [['left', 'Left'], ['right', 'Right'], ['straight', 'Straight']] }),
    ...turnBoxes,
    num('escapeHeightFt', 'Climb back to', 'ft AGL'),
    note());

  // ---- Wind ----
  const wind = box('Wind');
  const planBoxes = [windNum('planTopDegM', 'Planning wind at the release height, from', 'deg'), windNum('planTopKt', 'Planning wind at the release height, speed', 'kt'), windNum('planGroundDegM', 'Planning wind at the ground, from', 'deg'), windNum('planGroundKt', 'Planning wind at the ground, speed', 'kt')];
  wind.panel.body.append(
    windNum('windTopDegM', 'At the release height, from', 'deg'), windNum('windTopKt', 'At the release height, speed', 'kt'),
    windNum('windGroundDegM', 'At the ground, from', 'deg'), windNum('windGroundKt', 'At the ground, speed', 'kt'),
    num('tempDevC', 'Temperature against the standard day', '°C'),
    more(controls.checkbox('planWindOn', { label: 'Work out the release with a planning wind (to see a wrong forecast)' }), ...planBoxes),
    note());

  // ---- Display ----
  const display = box('Display');
  display.panel.body.append(
    controls.checkbox('showLines', { label: 'The orbit and run-in lines' }),
    controls.checkbox('showCarp', { label: 'The release point (CARP)' }),
    controls.checkbox('showTrails', { label: 'The trails (aircraft and load)' }),
    controls.checkbox('showFlags', { label: 'The flags on the card' }));

  const flyButton = h('button', { type: 'button', class: 'rs-btn rs-btn-main rs-fly' }, 'Fly the pass');
  flyButton.addEventListener('click', onFly);
  const element = h('aside', { class: 'rs-setup', 'aria-label': 'Setup' },
    h('h2', { class: 'rs-col-title' }, 'Setup'),
    top, orbit.panel.element, runIn.panel.element, release.panel.element, escape.panel.element, wind.panel.element, display.panel.element,
    flyButton,
    h('p', { class: 'rs-foot' }, 'Grey "set to hit" numbers are worked out by the computer; More sets one by hand. Defaults are estimates.'));

  const show = (el, on) => {
    el.hidden = !on;
  };

  function update(v, plan, exit) {
    const run = runOf(v.run);
    const dive = run.id === 'bombDive';
    const flyover = run.id === 'flyover';
    aircraftName.textContent = AIRCRAFT[run.aircraft].name;
    placeWords.textContent = v.placeIsDefault ? 'Moose Jaw area' : `${v.placeLat.toFixed(3)}, ${v.placeLon.toFixed(3)}`;
    totWords.textContent = `+${clock(v.totSec)}`;
    show(targetHeadingBox, v.targetTurnByHand);

    orbit.sum.textContent = `${ft10(v.orbitHeightFt)} AGL · ${v.orbitMode === 'radius' ? `${v.orbitRadiusNm.toFixed(1)} NM` : `${v.orbitBankDeg}° bank`} · ${v.orbitDir}`;
    show(radiusBox, v.orbitMode === 'radius');
    show(bankBox, v.orbitMode === 'bank');
    show(exitBox, v.exitByHand);
    show(exitHit.el, !v.exitByHand);
    exitHit.value.textContent = exit && !exit.byHand ? `+${clock(exit.sec)}` : 'when the pass is flown';

    runIn.sum.textContent = `${deg3(v.runInDegM)} · IP ${v.ipNm.toFixed(1)} NM · ${v.kias} KIAS`;
    speedLabel.textContent = dive ? 'Speed at release' : 'Speed';
    show(profile, !flyover);
    flatBtn.setAttribute('aria-pressed', String(run.id === 'bombFlat'));
    diveBtn.setAttribute('aria-pressed', String(dive));
    show(diveBox, dive);
    show(crabHit.el, Boolean(plan));
    show(aimHit.el, !flyover && !v.aimOffByHand);
    show(rollInHit.el, dive && !(v.rollInByHand && v.rollInKiasByHand));
    for (const el of [rollInHand, rollInKiasHand]) show(el, dive);
    show(aimBox, v.aimOffByHand);
    show(rollInFtBox, dive && v.rollInByHand);
    show(rollInKiasBox, dive && v.rollInKiasByHand);
    if (plan) {
      const crab = plan.crabDeg ?? 0;
      crabHit.value.textContent = Math.abs(crab) < 0.5 ? 'none' : `${Math.abs(crab).toFixed(0)}° ${crab > 0 ? 'right' : 'left'}`;
      const off = plan.worked.aimOffFt ?? 0;
      aimHit.value.textContent = Math.abs(off) < 5 ? 'none' : `${ft10(Math.abs(off))} ${off > 0 ? 'right' : 'left'} of the target`;
      rollInHit.value.textContent = plan.dive ? `${ft10(plan.dive.rollInMsl - plan.groundFt)} AGL · ${Math.round(plan.dive.rollInKias)} KIAS` : '—';
    }

    release.sum.textContent = flyover ? `${ft10(v.heightOverTopFt)} over the top` : `${ft10(v.releaseFt)} AGL · ${v.releaseMode === 'carp' ? 'at the CARP · set to hit' : `${ft10(v.releaseDistFt)} before`}`;
    release.panel.button.querySelector('.panel-title').textContent = flyover ? 'Height over the target' : 'Release';
    show(overTopBox, flyover);
    for (const el of [releaseFtBox, whereBox]) show(el, !flyover);
    show(distBox, !flyover && v.releaseMode === 'distance');
    show(releaseHit.el, !flyover && v.releaseMode === 'carp' && Boolean(plan?.release?.point));
    if (plan?.release?.point) releaseHit.value.textContent = `${ft10(-plan.release.along)} before the target · ${ft10(plan.release.point.z - plan.groundFt)} AGL`;

    escape.sum.textContent = v.escapeDir === 'straight' ? `straight ahead · climb to ${ft10(v.escapeHeightFt)}` : `${v.escapeDir} · ${v.escapeG} G · ${v.escapeBankDeg}° bank`;
    for (const el of turnBoxes) show(el, v.escapeDir !== 'straight');

    const w = (d, k) => (k < 0.5 ? 'calm' : `${deg3(d)}/${k} kt`);
    wind.sum.textContent = `${w(v.windTopDegM, v.windTopKt)} at release${v.planWindOn ? ' · planning wind' : ''}`;
    for (const el of planBoxes) show(el, v.planWindOn);
    display.sum.textContent = [v.showLines && 'lines', v.showCarp && 'CARP', v.showTrails && 'trails', v.showFlags && 'flags'].filter(Boolean).join(' · ') || 'nothing';
  }

  return { element, flyButton, update };
}
