// The instructor's console (console.js): its Cues section (EP-12, plan Step 4). The picture cues the student sees: smoke haze and fire glow
// over the view, a small shake, and lights that flicker; the words for outside cues (smoke, flames, noises) are in Indications. A cause sets
// them by itself (systems.js: fire, smoke, roughness, flickering generator) and what is typed here wins, like any indication. A cue goes
// through pending and Apply like the rest (EP-R4), so the student never sees one half-made. "Prompt" buttons set a cue and its words together.
// Cues are seen, not asked about: no Reveal; a flickering light shows only once the student has revealed it.
import { h } from '../../ui-kit/dom.js';
import { CUE_LEVELS, FLICKER_CUES, labelOf, valueWords } from './indications.js';

/** Prompts: a cue and its words set together (the strengths are picture choices). Words are what is seen, never an action (EP-3). */
const PROMPTS = Object.freeze([
  { label: 'Prompt smoke', set: { 'fx.haze': 0.5, 'cue.smoke': 'smoke and fumes' } },
  { label: 'Prompt fire glow', set: { 'fx.glow': 0.7, 'fx.haze': 0.35, 'cue.flames': 'flames' } },
  { label: 'Prompt roughness', set: { 'fx.shakeDeg': 0.2, 'cue.roughness': 'roughness' } },
  { label: 'Clear cues', set: { 'fx.haze': 0, 'fx.glow': 0, 'fx.shakeDeg': 0 } },
]);

/** stage(key, value) as in console-indications.js. Returns { element, update(session, shown) }. */
export function createCuesSection({ button, stage }) {
  const rows = new Map(); // key -> { row, set(value) }
  function addRow(key, edit, set) {
    const typed = h('span', { class: 'ep-tag ep-typed', hidden: true, title: 'You set this: it wins over the cause' }, 'set here');
    const row = h('div', { class: 'ep-ind-row', dataset: { key } }, h('span', { class: 'ep-ind-label' }, labelOf(key)), edit, h('span', { class: 'ep-ind-reveal' }, typed));
    rows.set(key, { row, set, typed });
    return row;
  }
  function levelRow(d) {
    const input = h('input', { type: 'number', min: '0', max: String(d.max), step: String(d.step), class: 'ep-num', 'aria-label': `${d.label}, 0 to ${d.max}${d.unit}` });
    input.addEventListener('change', () => {
      const v = Number(input.value);
      if (input.value !== '' && Number.isFinite(v)) stage(d.key, Math.min(d.max, Math.max(0, v)));
    });
    return addRow(d.key, h('span', { class: 'ep-edit' }, input, h('span', { class: 'ep-unit' }, d.unit || `0 to ${d.max}`)), (v) => {
      if (document.activeElement !== input) input.value = String(Number(Number(v ?? 0).toFixed(2)));
    });
  }
  function flickerRow(d) {
    const box = h('input', { type: 'checkbox', 'aria-label': d.label, onchange: (e) => stage(d.key, e.target.checked) });
    return addRow(d.key, h('label', { class: 'ep-edit' }, box, ' flickers'), (v) => { box.checked = v === true; });
  }
  const element = h('section', { class: 'ep-con-section ep-cues-section' },
    h('h3', {}, 'Cues ', h('span', { class: 'ep-sub' }, 'what the student sees without asking: a cause sets them by itself; what you set here wins; changes show on Apply')),
    h('div', { class: 'ep-row ep-cue-prompts' }, PROMPTS.map((p) => button(p.label, () => { for (const [k, v] of Object.entries(p.set)) stage(k, v); }, { class: 'ep-btn ep-btn-small' }))),
    CUE_LEVELS.map(levelRow),
    h('h4', {}, 'Lights that flicker (the student sees it once the light is revealed)'),
    h('details', { class: 'ep-more' }, h('summary', {}, 'Flicker a light'), FLICKER_CUES.map(flickerRow)));

  function update(s, shown) {
    for (const [key, r] of rows) {
      const pending = key in s.pending;
      r.set(pending ? s.pending[key] : shown[key]);
      r.row.classList.toggle('is-pending', pending);
      r.row.title = pending ? `Not applied yet: the student still sees ${valueWords(key, shown[key])}` : '';
      r.typed.hidden = !(key in (s.overrides ?? {}));
    }
  }
  return { element, update };
}
