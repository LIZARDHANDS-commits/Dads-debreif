// The instructor's console (console.js): its "Pick for the student" section (plan Step 5, EP-13). A simple control so the aircraft can be
// driven and seen before the student has their own list (plan Step 6): choose a pick from the plain-word list (manoeuvres.js), with a
// heading or a field where it needs one, and press Pick. A pick flies at once (it doesn't wait for Apply: it is the student's action, not
// a change the instructor stages). Below it, for the instructor only: what the aircraft is flying, its numbers, the engine as the causes
// leave it, the fields inside the glide ring (Traffic's formula), any published limit passed (flagged, never held) and the outcome.
import { h, clear } from '../../ui-kit/dom.js';
import { MANOEUVRES, manoeuvreById, pickWords, PILOT, SUITABLE_FIELDS_WORKING } from './manoeuvres.js';
import { FIELDS, flightNow, flagsOf, manoeuvreWords, engineOf, glideRingOf, FLIGHT } from './flight.js';

const GROUP_WORDS = Object.freeze({ fly: 'Fly', turn: 'Turn', configure: 'Gear and flaps', other: 'Other' });

const ftWords = (n) => `${Math.round(n).toLocaleString('en-CA')} ft`;
const hdg = (d) => `${String(Math.round(d) % 360).padStart(3, '0')}°M`;

/** dispatch(action): scenario.js act. Returns { element, update(session) }. */
export function createPicksSection({ dispatch, button }) {
  const pickList = h('select', { 'aria-label': 'Pick for the student' },
    Object.entries(GROUP_WORDS).map(([g, words]) => h('optgroup', { label: words },
      MANOEUVRES.filter((m) => m.group === g).map((m) => h('option', { value: m.id }, m.words)))));
  const heading = h('input', { type: 'number', min: '0', max: '359', step: '5', class: 'ep-num', value: '0', 'aria-label': 'Heading, degrees magnetic' });
  const headingBox = h('label', { class: 'ep-row ep-pick-heading' }, h('span', { class: 'ep-sub' }, 'to'), heading, h('span', { class: 'ep-unit' }, '°M'));
  const field = h('select', { 'aria-label': 'Field' }, FIELDS.map((f) => h('option', { value: f.icao }, `${f.icao} ${f.name}`)));
  const showNeeds = () => {
    const m = manoeuvreById(pickList.value);
    headingBox.hidden = !m?.needs.includes('headingDegM');
    field.hidden = !m?.needs.includes('fieldIcao');
  };
  pickList.addEventListener('change', showNeeds);
  showNeeds();
  const pickBtn = button('Pick', () => dispatch({ type: 'pick', manoeuvre: pickList.value, headingDegM: Number(heading.value), fieldIcao: field.value }), { class: 'ep-btn ep-btn-main' });

  const flying = h('p', { class: 'ep-pick-flying' });
  const numbers = h('p', { class: 'ep-sub ep-pick-numbers' });
  const engine = h('p', { class: 'ep-sub' });
  const ring = h('p', { class: 'ep-sub' });
  const flags = h('p', { class: 'ep-next', hidden: true });
  const outcome = h('p', { class: 'ep-pick-outcome', hidden: true });
  const picked = h('ol', { class: 'ep-pick-log' });
  const element = h('section', { class: 'ep-con-section ep-picks-section' },
    h('h3', {}, 'Pick for the student ', h('span', { class: 'ep-sub' }, 'flies at once; the student\'s own list comes later')),
    h('div', { class: 'ep-row' }, pickList, headingBox, field, pickBtn),
    flying, numbers, engine, ring, flags, outcome,
    h('details', { class: 'ep-more' }, h('summary', {}, 'Picks so far'), picked),
    h('p', { class: 'ep-sub' },
      `Nearest suitable field: working list until Patrick names his (${SUITABLE_FIELDS_WORKING.join(', ')}). Turns at ${PILOT.turnBankDeg}° of bank, climb and descend on ${PILOT.climbPathDeg}° for ${PILOT.climbChangeFt.toLocaleString('en-CA')} ft, slow down to ${PILOT.slowKias} and speed up to ${PILOT.fastKias} KIAS, a rough engine loses ${Math.round(FLIGHT.roughThrustLossAtFull * 50)} % of its thrust at severity 50 %: `,
      h('span', { class: 'ep-estimate' }, '(estimates)'), '.'));

  let pickCount = -1;
  function update(s) {
    const f = s.flight;
    element.hidden = !f;
    if (!f) return;
    pickBtn.disabled = Boolean(f.outcome);
    const n = flightNow(f);
    flying.textContent = f.outcome ? 'The flight has ended.' : `Flying: ${manoeuvreWords(f)}`;
    numbers.textContent = `${ftWords(n.altFt)} · ${Math.round(n.kias)} KIAS (${Math.round(n.ktas)} KTAS) · heading ${hdg(n.headingDegM)} · bank ${Math.round(n.bankDeg)}° · ${Math.round(n.climbFpm).toLocaleString('en-CA')} ft/min · ${n.g.toFixed(1)} G · gear ${f.gear}, flaps ${f.flaps}`;
    const e = engineOf(s.faults);
    engine.textContent = e.out ? 'Engine: failed, prop feathered (no thrust)' : e.roughLoss > 0 ? `Engine: rough, ${Math.round(e.roughLoss * 100)} % of its thrust lost (estimate)` : `Engine: healthy, throttle ${Math.round(f.throttle * 100)} %`;
    const r = glideRingOf(f, s.scenario.start.wind);
    ring.textContent = r.fields.length ? `Inside the glide ring now: ${r.fields.join(', ')}` : 'No field inside the glide ring now';
    const fl = flagsOf(f);
    flags.hidden = !fl.length;
    flags.textContent = fl.length ? `Flagged (a reference, not held): ${fl.join('; ')}` : '';
    outcome.hidden = !f.outcome;
    outcome.textContent = f.outcome?.words ?? '';
    const list = s.picks ?? [];
    if (list.length !== pickCount) {
      pickCount = list.length;
      clear(picked);
      if (!list.length) picked.append(h('li', { class: 'ep-faint' }, 'None yet.'));
      for (const p of list) picked.append(h('li', {}, `${Math.floor(p.clockS / 60)}:${String(Math.floor(p.clockS % 60)).padStart(2, '0')} ${pickWords(p)}`));
    }
  }
  return { element, update };
}
