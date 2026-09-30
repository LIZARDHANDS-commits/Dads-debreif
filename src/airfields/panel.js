// The Airfields section of Settings (SPEC-airfields, R22): the home field, the
// alternates table and the minima in use by default; names, positions, time
// zones, the GNSS checkbox and Reset in a collapsed "More" panel.
// Everything typed goes through airfields.update(), which checks it; the page
// only ever shows text (h() never parses HTML).
import { h, clear } from '../ui-kit/dom.js';
import { createPanel } from '../ui-kit/panel.js';
import { utcOffsetMinutes } from '../core/time.js';
import { formatMinimaLine, formatOffset, formatNm } from './format.js';
import { MAX_ALTERNATES } from './airfields.js';
import { CATALOG } from './catalog.js';

const ICAO = /^[A-Z0-9]{4}$/;
const APPROACH_LABELS = [
  ['not-set', 'Not set (600-2)'],
  ['two-precision', 'Two or more precision, separate runways'],
  ['one-precision', 'One precision (ILS or PAR)'],
  ['non-precision', 'Non-precision only (LOC, VOR, NDB)'],
  ['gnss-only', 'GNSS only (RNAV, LNAV minima)'],
  ['no-ifr', 'No IFR approach (visual descent from MEA)'],
];
const USES_MEA = new Set(['gnss-only', 'no-ifr']);

let nextId = 1;
const newId = (name) => `af-${nextId++}-${name}`;
const readIcao = (value) => String(value ?? '').trim().toUpperCase();
const localTime = (zone, now) => `local time ${formatOffset(utcOffsetMinutes(now(), zone))}`;

// A number box that writes to the setting on change and says in words what it
// accepts; empty clears the value.
function numberBox({ label, value, min, max, step, unit, onValue }) {
  const id = newId('n');
  const message = h('span', { class: 'control-message', id: `${id}-msg`, role: 'status' });
  const input = h('input', {
    type: 'number', id, min, max, step, inputmode: 'decimal', 'aria-label': label, 'aria-describedby': message.id,
    value: value ?? '',
  });
  input.addEventListener('change', () => {
    const text = input.value.trim();
    const n = Number(text);
    const ok = text === '' || (!input.validity?.badInput && Number.isFinite(n) && n >= min && n <= max);
    if (ok) {
      input.removeAttribute('aria-invalid');
      message.textContent = '';
      onValue(text === '' ? null : n);
    } else {
      input.setAttribute('aria-invalid', 'true');
      message.textContent = `Enter a number from ${min.toLocaleString('en-CA')} to ${max.toLocaleString('en-CA')}${unit ? ` ${unit}` : ''}.`;
    }
  });
  return h('span', { class: 'af-number' }, input, message);
}

// An ICAO box with a button; Enter works too. Refusals are said in words.
function icaoForm({ label, buttonLabel, value = '', onSubmit }) {
  const id = newId('icao');
  const input = h('input', { type: 'text', id, value, maxlength: 4, autocomplete: 'off', spellcheck: 'false', class: 'af-icao', 'aria-describedby': `${id}-msg` });
  const message = h('span', { class: 'control-message', id: `${id}-msg`, role: 'status' });
  const say = (text) => {
    message.textContent = text;
    if (text) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  };
  const submit = (event) => {
    event.preventDefault();
    const icao = readIcao(input.value);
    if (!ICAO.test(icao)) return say('Enter a four-letter ICAO id, like CYQR.');
    say(onSubmit(icao, input) ?? '');
  };
  const button = buttonLabel ? h('button', { type: 'submit' }, buttonLabel) : null;
  const form = h('form', { class: 'af-icao-form', onsubmit: submit }, h('label', { for: id }, label), input, button, message);
  return { form, input, say };
}

export function createAirfieldsPanel({ airfields, now = () => new Date() }) {
  const rows = h('tbody');
  const homeLine = h('p', { class: 'af-note', 'aria-live': 'polite' });
  const minimaLine = h('p', { class: 'af-minima', 'data-testid': 'minima-used' });
  const moreBody = h('div', { class: 'af-more' });
  const storageNote = h('p', { class: 'notice', hidden: true }, "This browser isn't letting the site save anything, so airfield changes last until you close the tab.");
  const more = createPanel({ title: 'More airfield settings', collapsed: true });
  more.body.append(moreBody);
  let shape = '';
  let element = null;

  const home = icaoForm({
    label: 'Home field',
    value: airfields.home().icao,
    onSubmit(icao, input) {
      airfields.update({ home: icao });
      input.value = icao;
      if (!airfields.home().builtIn) openMore(icao);
    },
  });

  const add = icaoForm({
    label: 'Add alternate',
    buttonLabel: 'Add',
    onSubmit(icao, input) {
      const { home: homeId, alternates } = airfields.get();
      if (icao === homeId) return `${icao} is the home field.`;
      if (alternates.includes(icao)) return `${icao} is already listed.`;
      if (alternates.length >= MAX_ALTERNATES) return `Up to ${MAX_ALTERNATES} alternates; remove one first.`;
      airfields.update({ alternates: [...alternates, icao] });
      input.value = '';
      if (airfields.alternates().find((f) => f.icao === icao)?.builtIn === false) openMore(icao);
      else input.focus();
      return '';
    },
  });

  // Changes typed here don't rebuild the boxes (the one being typed in would
  // vanish); anything else, such as Reset or another tab, does.
  let fromPanel = false;
  const setField = (icao, change) => {
    fromPanel = true;
    try {
      airfields.update({ fields: { [icao]: change } });
    } finally {
      fromPanel = false;
    }
  };

  function row(field) {
    const select = h(
      'select',
      { 'aria-label': `${field.icao} approaches`, onchange: (e) => setField(field.icao, { approach: e.target.value }) },
      APPROACH_LABELS.map(([value, text]) => h('option', { value, selected: value === field.approach }, text)),
    );
    const remove = () => {
      airfields.update({ alternates: airfields.get().alternates.filter((id) => id !== field.icao) });
      add.input.focus();
    };
    return h(
      'tr',
      {},
      h('th', { scope: 'row' }, h('span', { class: 'af-id' }, field.icao), ' ', h('span', { class: 'af-name', dataset: { icao: field.icao } }, field.name ?? 'Unknown airfield')),
      h('td', {}, select),
      h('td', {}, numberBox({ label: `${field.icao} lowest HAT, feet`, value: field.lowestHatFt, min: 0, max: 5000, step: 10, unit: 'ft', onValue: (v) => setField(field.icao, { lowestHatFt: v }) })),
      h('td', {}, numberBox({ label: `${field.icao} lowest visibility, statute miles`, value: field.lowestVisSm, min: 0, max: 10, step: 0.25, unit: 'SM', onValue: (v) => setField(field.icao, { lowestVisSm: v }) })),
      h('td', { class: 'af-distance', dataset: { icao: field.icao } }),
      h('td', {}, h('button', { type: 'button', 'aria-label': `Remove ${field.icao}`, onclick: remove }, '✕')),
    );
  }

  function details(field, isHome) {
    const children = [h('legend', {}, isHome ? `${field.icao} (home)` : field.icao)];
    const elevationBox = () => numberBox({ label: `${field.icao} elevation, feet`, value: field.elevationFt, min: -1500, max: 15000, step: 1, unit: 'ft', onValue: (v) => setField(field.icao, { elevationFt: v }) });
    if (field.builtIn) {
      const fixedElevation = CATALOG[field.icao].elevationFt !== null;
      const bits = [field.name, `${field.lat}, ${field.lon}`];
      if (fixedElevation) bits.push(`elevation ${field.elevationFt.toLocaleString('en-CA')} ft`);
      bits.push(field.timeZone);
      children.push(h('p', { class: 'af-note' }, bits.join(' · ')));
      if (!fixedElevation) children.push(h('div', { class: 'af-grid' }, h('span', {}, 'Elevation'), elevationBox()));
    } else {
      const text = (key, label, value) => {
        const id = newId(key);
        const input = h('input', { type: 'text', id, value: value ?? '', maxlength: 40, 'aria-label': `${field.icao} ${label}` });
        input.addEventListener('change', () => setField(field.icao, { [key]: input.value.trim() || null }));
        return h('span', { class: 'af-number' }, input);
      };
      const zoneList = newId('zones');
      const zone = h('input', { type: 'text', value: field.timeZone ?? '', list: zoneList, 'aria-label': `${field.icao} time zone`, placeholder: 'e.g. America/Regina' });
      zone.addEventListener('change', () => setField(field.icao, { timeZone: zone.value.trim() || null }));
      const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
      children.push(
        h('div', { class: 'af-grid' },
          h('span', {}, 'Name'), text('name', 'name', field.name),
          h('span', {}, 'Latitude'), numberBox({ label: `${field.icao} latitude`, value: field.lat, min: -90, max: 90, step: 'any', onValue: (v) => setField(field.icao, { lat: v }) }),
          h('span', {}, 'Longitude'), numberBox({ label: `${field.icao} longitude`, value: field.lon, min: -180, max: 180, step: 'any', onValue: (v) => setField(field.icao, { lon: v }) }),
          h('span', {}, 'Elevation'), elevationBox(),
          h('span', {}, 'Time zone'), h('span', { class: 'af-number' }, zone, h('datalist', { id: zoneList }, zones.map((z) => h('option', { value: z })))),
        ),
      );
    }
    if (USES_MEA.has(field.approach)) {
      children.push(
        h('div', { class: 'af-grid' },
          h('span', {}, 'MEA'), numberBox({ label: `${field.icao} MEA, feet above sea level`, value: field.meaFt, min: 0, max: 20000, step: 100, unit: 'ft', onValue: (v) => setField(field.icao, { meaFt: v }) }),
          h('span', {}, 'Visual descent visibility'), numberBox({ label: `${field.icao} visual descent visibility, statute miles`, value: field.visualDescentVisSm ?? 3, min: 0, max: 10, step: 0.25, unit: 'SM', onValue: (v) => setField(field.icao, { visualDescentVisSm: v }) }),
        ),
        h('p', { class: 'af-note' }, 'Visual descent (D80): the ceiling must be at least MEA + 500 ft minus the field elevation, over the arrival window.'),
      );
    }
    const gnssId = newId('gnss');
    children.push(
      h('div', { class: 'control control-checkbox' },
        h('input', { type: 'checkbox', id: gnssId, checked: field.gnssPlan, onchange: (e) => setField(field.icao, { gnssPlan: e.target.checked || null }) }),
        h('label', { for: gnssId }, `Plan uses a GNSS approach at ${field.icao}`)),
    );
    return h('fieldset', { class: 'af-field', dataset: { icao: field.icao } }, ...children);
  }

  function openMore(icao) {
    more.setCollapsed(false);
    moreBody.querySelector(`fieldset[data-icao="${icao}"] input`)?.focus();
  }

  // Rows and More are rebuilt only when the list of airfields changes, so a box
  // being typed in never disappears under the cursor.
  function rebuild() {
    clear(rows);
    rows.append(...airfields.alternates().map(row));
    clear(moreBody);
    moreBody.append(
      details(airfields.home(), true),
      ...airfields.alternates().map((f) => details(f, false)),
      h('p', { class: 'af-note' }, 'Computed minima round up to the next 100 ft unless within 20 ft over, and never ask for more than 3 SM. No credit is given for LPV: enter LNAV minima for a GNSS-only field.'),
      h('button', { type: 'button', onclick: () => { airfields.reset(); home.input.value = airfields.home().icao; home.input.focus(); } }, 'Reset airfields to defaults'),
    );
  }

  function refresh() {
    const current = airfields.get();
    const fields = [airfields.home(), ...airfields.alternates()];
    const next = JSON.stringify([current.home, current.alternates, fields.map((f) => [f.builtIn, USES_MEA.has(f.approach)])]);
    if (next !== shape || !fromPanel) {
      shape = next;
      const focused = element?.contains(document.activeElement) ? document.activeElement.getAttribute('aria-label') : null;
      rebuild();
      if (focused) element.querySelector(`[aria-label="${CSS.escape(focused)}"]`)?.focus();
    }
    const h0 = airfields.home();
    if (!home.form.contains(document.activeElement)) home.input.value = h0.icao;
    homeLine.textContent = h0.timeZoneMissing
      ? `${h0.name ?? 'Unknown airfield'} · Add its time zone under More airfield settings; local time stays on ${h0.timeZone} until then.`
      : `${h0.name ?? 'Unknown airfield'} · ${localTime(h0.timeZone, now)}`;
    for (const f of airfields.alternates()) {
      const name = rows.querySelector(`.af-name[data-icao="${f.icao}"]`);
      if (name) name.textContent = f.name ?? 'Unknown airfield';
      const distance = rows.querySelector(`.af-distance[data-icao="${f.icao}"]`);
      if (distance) distance.textContent = formatNm(airfields.checkOptions(f.icao).distanceNm);
    }
    const lines = current.alternates.map((icao) => formatMinimaLine(icao, airfields.checkOptions(icao)));
    minimaLine.textContent = `Minima used: ${lines.join(' · ') || 'no alternates'}`;
    storageNote.hidden = airfields.persistent !== false;
  }

  element = h(
    'section',
    { class: 'af-section', 'aria-labelledby': 'af-title' },
    h('h3', { id: 'af-title' }, 'Airfields'),
    home.form,
    homeLine,
    h('table', { class: 'af-table', 'aria-label': 'Alternates' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, 'Alternate'),
        h('th', { scope: 'col' }, 'Approaches'),
        h('th', { scope: 'col' }, 'Lowest HAT (ft)'),
        h('th', { scope: 'col' }, 'Vis (SM)'),
        h('th', { scope: 'col' }, 'From home'),
        h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Remove')))),
      rows),
    add.form,
    minimaLine,
    storageNote,
    more.element,
  );

  refresh();
  const stop = airfields.subscribe(refresh);
  return { element, dispose: stop };
}
