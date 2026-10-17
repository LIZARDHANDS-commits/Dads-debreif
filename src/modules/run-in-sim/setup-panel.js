// The Setup column (spec, "Left: Setup"; house rules): showing from the start the Run, the Aircraft (filled in from the
// run), the Target with its own heading (RS-12), the Place and the Time over target; below them closed boxes, each with
// its settings in one line:
// Orbit (a holding pattern, a figure 8 or a circle, RS-11), Run-in, Release, Escape, Wind and Display. Each box shows only the few settings the user sets for that run
// (RS-9); the numbers the computer works out show greyed with "set to hit", and More sets one by hand. Every setting
// starts at a default, and each box says its defaults are estimates. The main button is "Fly the pass".
// The air refuelling run (spec "Air refuelling"; RS-18; proposed, built ahead of Patrick's yes, Dad, 17 Oct 2026) shows
// its own: the Rendezvous time, and the Tanker and anchor, Rendezvous and Join boxes; the run-in's Target, Time over
// target, Orbit, Run-in, Release and Escape hide. The worked-out numbers show greyed "set to hit" (RS-16).
import { h } from '../../ui-kit/dom.js';
import { createPanel } from '../../ui-kit/panel.js';
import { RUNS, RANGES, runOf } from './defaults.js';
import { TARGETS, HAS_HEADING } from './targets.js';
import { AIRCRAFT } from './aircraft.js';
import { clock } from './pass.js';
import { FT_PER_NM } from '../../core/units.js';

const ESTIMATE = 'Defaults here are estimates until Patrick or a manual page gives them (RS-Q2).';
const AAR_ESTIMATE = 'Every air refuelling number is an estimate until Patrick or a manual page gives it (ATP-56 not read).';
const nm1 = (ft) => `${(ft / FT_PER_NM).toFixed(1)} NM`;
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
  const targetHeadingBox = num('targetHeadingDegM', 'Target heading (its long side; the run-in never turns it)', '°M');
  const targetMore = more(num('targetSizeFt', 'Size, its main dimension', 'ft'));
  const targetBox = controls.select('target', { label: 'Target', options: Object.values(TARGETS).map((t) => [t.id, t.label]) });
  const totBox = h('div', { class: 'rs-tot' }, num('totSec', 'Time over target, seconds after the start', 's'), totWords);
  // The refuelling run's (RS-18): the picture's words under the Aircraft, the place's meaning and the rendezvous time.
  const aarNote = h('p', { class: 'rs-estimate rs-aar-note' }, 'The tanker\'s flying is a picture, not a performance claim: the KC-130J has no performance set yet (RS-Q1). The receiver is a stand-in, the CT-156 (no probe). Proposed, built ahead of Patrick\'s yes (Dad, 17 Oct 2026).');
  const placeLabel = h('span', { class: 'rs-fixed-label' }, 'Place');
  const rvWords = h('span', { class: 'rs-faint' });
  const rvBox = h('div', { class: 'rs-tot' }, num('aarRvSec', 'Rendezvous time: the tanker rolls out, seconds after the start', 's'), rvWords);
  const top = h('div', { class: 'rs-top' },
    controls.select('run', { label: 'Run', options: RUNS.map((r) => [r.id, r.label]) }),
    h('div', { class: 'control rs-fixed' }, h('span', { class: 'rs-fixed-label' }, 'Aircraft'), aircraftName),
    aarNote,
    targetBox,
    targetHeadingBox,
    targetMore,
    h('div', { class: 'control rs-place' }, placeLabel, mapButton, placeWords),
    totBox, rvBox);

  // ---- Orbit ----
  const orbit = box('Orbit');
  const modeBox = controls.choice('orbitMode', { label: 'Flown as', options: [['radius', 'Radius'], ['bank', 'Bank']] });
  const radiusBox = num('orbitRadiusNm', 'Radius (a circle over the ground)', 'NM');
  const bankBox = num('orbitBankDeg', 'Bank (a steady bank, drifting with the wind)', '°');
  const bankLabel = bankBox.querySelector('label');
  const legBox = num('holdLegSec', 'Leg time (1 minute, the standard holding leg; an estimate here)', 's');
  const backBox = num('orbitBackNm', 'Centre, miles back from the target along the run-in', 'NM');
  const exitHit = hit('Leave the orbit');
  const lastHit = hit('Last outbound leg');
  const lastLabel = lastHit.el.querySelector('span');
  const exitBox = num('exitSec', 'Leave at, seconds after the start', 's');
  const exitLabel = exitBox.querySelector('label');
  orbit.panel.body.append(
    controls.select('orbitPattern', { label: 'Pattern', options: [['hold', 'Holding pattern'], ['eight', 'Figure 8'], ['circle', 'Circle']] }),
    num('orbitHeightFt', 'Height above the target\'s ground', 'ft AGL'),
    modeBox, radiusBox, legBox, bankBox,
    controls.choice('orbitDir', { label: 'Direction', options: [['left', 'Left'], ['right', 'Right']] }),
    num('orbitKias', 'Orbit speed', 'KIAS'),
    backBox,
    exitHit.el, lastHit.el,
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
  const relSpeedSet = controls.checkbox('diveSpeedAtRelease', { label: 'Set the speed at release instead (the roll-in speed is worked out)' });
  runIn.panel.body.append(
    num('runInDegM', 'Run-in heading', '°M'),
    num('ipNm', 'IP, miles back from the target', 'NM'),
    speedBox, profile, diveBox,
    crabHit.el, aimHit.el, rollInHit.el,
    more(aimHand, aimBox, relSpeedSet, rollInHand, rollInFtBox, rollInKiasHand, rollInKiasBox),
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
  const windBoxes = [windNum('windTopDegM', 'At the release height, from', 'deg'), windNum('windTopKt', 'At the release height, speed', 'kt')];
  const windTopLabels = windBoxes.map((b) => b.querySelector('label'));
  const planBoxes = [windNum('planTopDegM', 'Planning wind at the release height, from', 'deg'), windNum('planTopKt', 'Planning wind at the release height, speed', 'kt'), windNum('planGroundDegM', 'Planning wind at the ground, from', 'deg'), windNum('planGroundKt', 'Planning wind at the ground, speed', 'kt')];
  const planMore = more(controls.checkbox('planWindOn', { label: 'Work out the release with a planning wind (to see a wrong forecast)' }), ...planBoxes);
  wind.panel.body.append(
    ...windBoxes,
    windNum('windGroundDegM', 'At the ground, from', 'deg'), windNum('windGroundKt', 'At the ground, speed', 'kt'),
    num('tempDevC', 'Temperature against the standard day', '°C'),
    planMore,
    note());

  // ---- The refuelling run's boxes (RS-15 to RS-17) ----
  const aarNoteLine = () => h('p', { class: 'rs-estimate', title: AAR_ESTIMATE }, 'ⓘ Every number here is an estimate (ATP-56 not read)');
  const tankerBox = box('Tanker and anchor');
  tankerBox.panel.body.append(
    num('aarTrackDegM', 'Refuelling track (the receiver\'s)', '°M'),
    num('aarHeightFt', 'Tanker\'s height', 'ft MSL'),
    num('aarTankerKias', 'Tanker\'s speed', 'KIAS'),
    more(num('aarBankDeg', 'Tanker\'s bank in its turns', '°'), num('aarLegNm', 'Anchor legs', 'NM'),
      controls.choice('aarDir', { label: 'Anchor turns', options: [['left', 'Left'], ['right', 'Right']] })),
    aarNoteLine());
  const rvBoxPanel = box('Rendezvous');
  const rcvHit = hit('Receiver\'s speed');
  const startHit = hit('Receiver starts');
  const offsetHit = hit('Offset (two of the tanker\'s turn radii)');
  const turnHit = hit('Tanker turns');
  const turnHand = controls.checkbox('aarTurnRangeByHand', { label: 'The tanker turns at a range set by hand' });
  const turnRangeBox = num('aarTurnRangeNm', 'Turn range (over the ground)', 'NM');
  const rcvHand = controls.checkbox('aarRcvKiasByHand', { label: 'Set the receiver\'s speed by hand' });
  const rcvKiasBox = num('aarRcvKias', 'Receiver\'s speed', 'KIAS');
  rvBoxPanel.panel.body.append(
    num('aarTrailNm', 'Trail at the roll-out', 'NM'),
    rcvHit.el, startHit.el, offsetHit.el, turnHit.el,
    more(num('aarSplitFt', 'Receiver below the tanker', 'ft'), turnHand, turnRangeBox, rcvHand, rcvKiasBox),
    aarNoteLine());
  const joinBox = box('Join');
  joinBox.panel.body.append(
    num('aarOvertakeKt', 'Overtake on the join (and the receiver\'s speed over the tanker\'s)', 'kt'),
    more(num('aarPreContactFt', 'Pre-contact: the receiver\'s nose this far behind the left basket', 'ft')),
    aarNoteLine());
  const runInPanels = [orbit, runIn, release, escape].map((b) => b.panel.element);
  const aarPanels = [tankerBox, rvBoxPanel, joinBox].map((b) => b.panel.element);

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
    top, orbit.panel.element, runIn.panel.element, release.panel.element, escape.panel.element, ...aarPanels, wind.panel.element, display.panel.element,
    flyButton,
    h('p', { class: 'rs-foot' }, 'Grey "set to hit" numbers are worked out by the computer; More sets one by hand. Defaults are estimates.'));

  const show = (el, on) => {
    el.hidden = !on;
  };

  function update(v, plan, exit) {
    const run = runOf(v.run);
    const aar = run.id === 'aar';
    for (const el of [targetBox, targetMore, totBox, ...runInPanels, planMore]) show(el, !aar);
    for (const el of [aarNote, rvBox, ...aarPanels]) show(el, aar);
    placeLabel.textContent = aar ? 'Place (the roll-out point)' : 'Place';
    const where = aar ? 'refuelling' : 'release';
    windTopLabels[0].textContent = `At the ${where} height, from`;
    windTopLabels[1].textContent = `At the ${where} height, speed`;
    if (aar) {
      updateRefuel(v, plan?.kind === 'aar' ? plan : null, exit);
      return;
    }
    const dive = run.id === 'bombDive';
    const flyover = run.id === 'flyover';
    aircraftName.textContent = AIRCRAFT[run.aircraft].name;
    placeWords.textContent = v.placeIsDefault ? 'Moose Jaw area' : `${v.placeLat.toFixed(3)}, ${v.placeLon.toFixed(3)}`;
    totWords.textContent = `+${clock(v.totSec)}`;
    show(targetHeadingBox, HAS_HEADING.includes(v.target));

    const circle = v.orbitPattern === 'circle';
    const hold = v.orbitPattern === 'hold';
    orbit.sum.textContent = circle
      ? `Circle · ${ft10(v.orbitHeightFt)} AGL · ${v.orbitMode === 'radius' ? `${v.orbitRadiusNm.toFixed(1)} NM` : `${v.orbitBankDeg}° bank`} · ${v.orbitDir}`
      : `${hold ? 'Holding' : 'Figure 8'} · ${ft10(v.orbitHeightFt)} AGL · ${v.orbitDir}${hold ? ` · ${clock(v.holdLegSec)} legs` : ''}`;
    for (const el of [modeBox, backBox]) show(el, circle);
    show(radiusBox, circle && v.orbitMode === 'radius');
    show(bankBox, !circle || v.orbitMode === 'bank');
    bankLabel.textContent = circle ? 'Bank (a steady bank, drifting with the wind)' : 'Bank in the turns (still air; the wind steepens the downwind side)';
    show(legBox, hold);
    show(exitBox, v.exitByHand);
    exitLabel.textContent = circle ? 'Leave at, seconds after the start' : 'Leave at the IP, at the first pass after this many seconds';
    show(exitHit.el, !v.exitByHand);
    const fresh = exit && !exit.byHand;
    exitHit.value.textContent = fresh ? `+${clock(exit.sec)}${exit.pattern ? ' at the IP' : ''}` : 'when the pass is flown';
    const pat = fresh && exit.pattern && !exit.pattern.none ? exit.pattern : null;
    show(lastHit.el, Boolean(pat) && !circle);
    if (pat) {
      lastLabel.firstChild.textContent = pat.legSec !== undefined ? 'Last outbound leg' : 'Last loop';
      lastHit.value.textContent = pat.legSec !== undefined ? `${clock(pat.legSec)}${pat.k ? ` after ${pat.k} lap${pat.k > 1 ? 's' : ''}` : ''}` : `${Math.round(pat.bankDeg)}° bank${pat.k ? ` after ${pat.k} loop${pat.k > 1 ? 's' : ''}` : ''}`;
    }

    runIn.sum.textContent = `${deg3(v.runInDegM)} · IP ${v.ipNm.toFixed(1)} NM · ${v.kias} KIAS`;
    speedLabel.textContent = dive ? (v.diveSpeedAtRelease ? 'Speed at release' : 'Roll-in speed') : 'Speed';
    show(profile, !flyover);
    flatBtn.setAttribute('aria-pressed', String(run.id === 'bombFlat'));
    diveBtn.setAttribute('aria-pressed', String(dive));
    show(diveBox, dive);
    show(crabHit.el, Boolean(plan));
    show(aimHit.el, !flyover && !v.aimOffByHand);
    show(rollInHit.el, dive && !(v.rollInByHand && v.rollInKiasByHand && v.diveSpeedAtRelease));
    for (const el of [rollInHand, relSpeedSet]) show(el, dive);
    show(rollInKiasHand, dive && v.diveSpeedAtRelease);
    show(aimBox, v.aimOffByHand);
    show(rollInFtBox, dive && v.rollInByHand);
    show(rollInKiasBox, dive && v.diveSpeedAtRelease && v.rollInKiasByHand);
    if (plan) {
      const crab = plan.crabDeg ?? 0;
      crabHit.value.textContent = Math.abs(crab) < 0.5 ? 'none' : `${Math.abs(crab).toFixed(0)}° ${crab > 0 ? 'right' : 'left'}`;
      const off = plan.worked.aimOffFt ?? 0;
      aimHit.value.textContent = Math.abs(off) < 5 ? 'none' : `${ft10(Math.abs(off))} ${off > 0 ? 'right' : 'left'} of the target`;
      const relKt = plan.dive?.trial?.release?.kias;
      rollInHit.value.textContent = !plan.dive ? '—' : v.diveSpeedAtRelease
        ? `${ft10(plan.dive.rollInMsl - plan.groundFt)} AGL · ${Math.round(plan.dive.rollInKias)} KIAS`
        : `${ft10(plan.dive.rollInMsl - plan.groundFt)} AGL${relKt ? ` · ${Math.round(relKt)} KIAS at release` : ''}`;
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

  /** The refuelling run's lines: the boxes' summaries and the numbers worked out to hit (RS-16). */
  function updateRefuel(v, plan, exit) {
    aircraftName.textContent = 'KC-130J tanker (a picture) · CT-156 stand-in receiver';
    placeWords.textContent = v.placeIsDefault ? 'Moose Jaw area' : `${v.placeLat.toFixed(3)}, ${v.placeLon.toFixed(3)}`;
    rvWords.textContent = `+${clock(v.aarRvSec)}`;
    show(targetHeadingBox, false);
    tankerBox.sum.textContent = `${deg3(v.aarTrackDegM)} · ${ft10(v.aarHeightFt)} MSL · ${v.aarTankerKias} KIAS`;
    rvBoxPanel.sum.textContent = `${v.aarTrailNm.toFixed(1)} NM trail · ${ft10(v.aarSplitFt)} below`;
    joinBox.sum.textContent = `${v.aarOvertakeKt} kt overtake · ${v.aarPreContactFt} ft behind the basket`;
    show(turnRangeBox, v.aarTurnRangeByHand);
    show(rcvKiasBox, v.aarRcvKiasByHand);
    const w = plan?.worked;
    rcvHit.value.textContent = v.aarRcvKiasByHand ? `${v.aarRcvKias} KIAS (set by hand)` : w ? `${Math.round(w.rcvKias)} KIAS at ${ft10(v.aarHeightFt - v.aarSplitFt)}` : '—';
    offsetHit.value.textContent = w ? nm1(w.offsetFt) : '—';
    startHit.value.textContent = exit?.startNm !== undefined ? `${exit.startNm.toFixed(1)} NM back from the roll-out point` : 'when the run is flown';
    turnHit.value.textContent = exit?.turnRangeNm !== undefined
      ? `+${clock(exit.sec)} at ${exit.turnRangeNm.toFixed(1)} NM${exit.byHand ? ' (range set by hand)' : ''}`
      : w ? `+${clock(v.aarRvSec - w.turnSec)} · its range when the run is flown` : '—';
    show(turnHit.el, true);
  }

  return { element, flyButton, update };
}
