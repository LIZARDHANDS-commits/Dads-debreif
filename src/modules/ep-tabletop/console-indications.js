// The instructor's console (console.js): its Indications section. Every indication with what it is set to, its edit and Reveal: engine
// and systems numbers, lights (the main ones, the rest behind "More lights"), words for outside cues, gear and flaps, and the flight
// instruments (always shown). Moved out of console.js as it was (plan Step 3); what it adds: the values come from the systems model
// (systems.js shownOf, with typed values winning), a row the instructor has typed over is marked "typed", and a light or gauge that
// follows a threshold says so, with "(estimate)" until the threshold has a source (EP-11, EP-Q10).
import { h } from '../../ui-kit/dom.js';
import { NUMBERS, LIGHTS, MAIN_LIGHTS, WORDS, FLIGHT, labelOf, valueWords } from './indications.js';
import { thresholdNoteOf } from './systems.js';

/**
 * stage(key, value): stages an edit (and applies it at once when that box is ticked, console.js); onAtOnce(checked) when the "Apply each
 * change at once" box changes. Returns { element, update(session, shown) }, `shown` being systems.js shownOf(session).
 */
export function createIndicationsSection({ dispatch, button, stage, onAtOnce }) {
  const atOnceBox = h('input', { type: 'checkbox', onchange: (e) => onAtOnce(e.target.checked) });
  const rows = new Map(); // key -> { row, revealBtn, tag, typed, set(value), revealable }

  function revealButton(key) {
    return button('Reveal', () => dispatch({ type: 'reveal', key }), { class: 'ep-btn ep-btn-small', 'aria-label': `Reveal ${labelOf(key)}` });
  }
  function numberRow(d, revealable = true) {
    // A flown number (pitch, bank) is shown, not typed: the pilot flies it (plan Step 5).
    const value = h('input', { type: 'number', step: String(d.step), class: 'ep-num', 'aria-label': `${d.label}, ${d.unit}`, readonly: Boolean(d.flown), title: d.flown ? 'Flown by the aircraft, not typed' : null });
    const swing = d.swing ? h('input', { type: 'number', step: String(d.step), min: '0', class: 'ep-num ep-swing', placeholder: '±', 'aria-label': `${d.label} fluctuates by ±` }) : null;
    const read = () => {
      const v = Number(value.value);
      if (!Number.isFinite(v) || value.value === '') return;
      const sw = swing ? Number(swing.value) : 0;
      stage(d.key, sw > 0 ? { v, swing: sw } : v);
    };
    value.addEventListener('change', read);
    swing?.addEventListener('change', read);
    // A value the systems model is moving shows whole (or to a tenth for a gauge stepped in tenths), so the box doesn't fill with decimals.
    const shownNumber = (v) => (Number.isFinite(v) ? String(Number(v.toFixed(d.step < 1 ? 1 : 0))) : String(v ?? ''));
    const set = (v) => {
      const obj = v && typeof v === 'object';
      if (document.activeElement !== value) value.value = shownNumber(obj ? v.v : v);
      if (swing && document.activeElement !== swing) swing.value = obj && v.swing ? shownNumber(v.swing) : '';
    };
    return addRow(d.key, h('span', { class: 'ep-edit' }, value, swing ? h('span', { class: 'ep-pm' }, '±') : null, swing, h('span', { class: 'ep-unit' }, d.unit)), set, revealable);
  }
  function lightRow(d) {
    const box = h('input', { type: 'checkbox', 'aria-label': `${d.label} on`, onchange: (e) => stage(d.key, e.target.checked) });
    return addRow(d.key, h('label', { class: 'ep-edit' }, box, ' ON'), (v) => { box.checked = Boolean(v); });
  }
  function wordsRow(d) {
    const box = h('input', { type: 'text', class: 'ep-text', 'aria-label': d.label, onchange: (e) => stage(d.key, e.target.value) });
    return addRow(d.key, h('span', { class: 'ep-edit' }, box), (v) => { if (document.activeElement !== box) box.value = String(v ?? ''); });
  }
  function addRow(key, edit, set, revealable = true) {
    const revealBtn = revealable ? revealButton(key) : null;
    const tag = h('span', { class: 'ep-tag' }, revealable ? 'Revealed' : 'Always shown');
    const typed = h('span', { class: 'ep-tag ep-typed', hidden: true, title: 'You typed this value: it wins over the cause' }, 'typed');
    const t = thresholdNoteOf(key);
    const threshold = t ? h('span', { class: 'ep-threshold', title: t.note }, t.text, t.estimate ? h('span', { class: 'ep-estimate' }, ' (estimate)') : null) : null;
    const row = h('div', { class: 'ep-ind-row', dataset: { key } },
      h('span', { class: 'ep-ind-label' }, labelOf(key), threshold),
      edit,
      h('span', { class: 'ep-ind-reveal' }, revealBtn, tag, typed));
    rows.set(key, { row, revealBtn, tag, typed, set, revealable });
    return row;
  }

  const moreLights = h('details', { class: 'ep-more' }, h('summary', {}, 'More lights'), LIGHTS.filter((d) => !MAIN_LIGHTS.includes(d.key)).map(lightRow));
  const element = h('section', { class: 'ep-con-section' },
    h('h3', {}, 'Indications ', h('span', { class: 'ep-sub' }, 'the student sees one only once you reveal it; changes show on Apply; a value you type wins over the cause')),
    h('div', { class: 'ep-row' }, h('label', { class: 'ep-check' }, atOnceBox, ' Apply each change at once')),
    h('h4', {}, 'Engine and systems'), NUMBERS.map((d) => numberRow(d)),
    h('h4', {}, 'Lights'), LIGHTS.filter((d) => MAIN_LIGHTS.includes(d.key)).map(lightRow), moreLights,
    h('h4', {}, 'Outside, gear and flaps (words)'), WORDS.map(wordsRow),
    h('h4', {}, 'Flight instruments ', h('span', { class: 'ep-sub' }, 'a typed altitude, airspeed or heading puts the aircraft there on Apply')), FLIGHT.map((d) => numberRow(d, false)));

  function update(s, shown) {
    for (const [key, r] of rows) {
      const pending = key in s.pending;
      r.set(pending ? s.pending[key] : shown[key]);
      r.row.classList.toggle('is-pending', pending);
      r.row.title = pending ? `Not applied yet: the student still sees ${valueWords(key, shown[key])}` : '';
      const revealed = !r.revealable || s.revealed.includes(key);
      if (r.revealBtn) r.revealBtn.hidden = revealed;
      r.tag.hidden = !revealed;
      r.typed.hidden = !(key in (s.overrides ?? {}));
    }
    const lit = LIGHTS.filter((d) => !MAIN_LIGHTS.includes(d.key) && shown[d.key]);
    if (lit.length) moreLights.open = true;
  }
  return { element, update };
}
