// The SOF map's controls: the bar above the map (Layers, Home, zoom, Rain or Snow, the ADS-B Exchange
// view and Traffic switches), the Layers menu, and the status strip and credits under it (SPEC-sof,
// "Map"). It draws the state it is given and reports what the person did; it decides nothing.
// The Layers menu is its own control, apart from the "SOF settings" menu (R22, R3).
import { h } from '../../ui-kit/dom.js';
import { BASES, OPACITY_RANGE, TRAFFIC_LABELS, menuRows } from './map-layers.js';
import { RADAR_COLOURS } from './map-model.js';

let nextId = 1;

const setText = (el, text) => {
  if (el.textContent !== text) el.textContent = text;
};

/**
 * handlers: { onLayer(id, on), onOpacity(id, percent), onBase(id), onPrecip('rain' | 'snow'), onHome(),
 * onZoom(factor), onAdsb(on), onTraffic(on), onTrafficLabel(id), onMilitaryOnly(on) }.
 * Returns { bar, panel, status, legend, credits, note, sync(state), setStatus(items), setCredits(text),
 * setNote(text), setLegend(items), escape(event), closePanel() }. `panel` is inside `bar`, straight after the Layers button, so the menu is
 * next in the tab order after its button; CSS draws it over the top left of the map (F8 of sof-recheck-207).
 */
export function createMapControls(handlers) {
  const uid = `sof-map-${nextId++}`;
  const panelId = `${uid}-layers`;

  // ---- The bar -----------------------------------------------------------------------------------
  const layersButton = h('button', { type: 'button', class: 'sof-map-btn sof-map-layers-btn', 'aria-expanded': 'false', 'aria-controls': panelId }, 'Layers');
  const home = h('button', { type: 'button', class: 'sof-map-btn', onclick: () => handlers.onHome() }, 'Home');
  const zoomIn = h('button', { type: 'button', class: 'sof-map-btn sof-map-zoom', 'aria-label': 'Zoom in', onclick: () => handlers.onZoom(1.5) }, '+');
  const zoomOut = h('button', { type: 'button', class: 'sof-map-btn sof-map-zoom', 'aria-label': 'Zoom out', onclick: () => handlers.onZoom(1 / 1.5) }, '−');
  const precipId = `${uid}-precip`;
  const precip = h('select', { id: precipId, onchange: () => handlers.onPrecip(precip.value) },
    h('option', { value: 'rain' }, 'Rain'), h('option', { value: 'snow' }, 'Snow'));
  const precipField = h('div', { class: 'sof-map-field' }, h('label', { for: precipId }, 'Radar shows'), precip);
  const adsb = h('button', { type: 'button', class: 'sof-map-btn', 'aria-pressed': 'false', onclick: () => handlers.onAdsb(adsb.getAttribute('aria-pressed') !== 'true') }, 'ADS-B Exchange view');
  const traffic = h('button', { type: 'button', class: 'sof-map-btn', 'aria-pressed': 'false', hidden: true, onclick: () => handlers.onTraffic(traffic.getAttribute('aria-pressed') !== 'true') }, 'Traffic');
  // The Layers menu (`panel`, below) is put in the bar straight after its button, so Tab goes from the button into the menu (F8).
  const bar = h('div', { class: 'sof-map-bar', role: 'toolbar', 'aria-label': 'Map controls' }, layersButton, home, zoomIn, zoomOut, precipField, traffic, adsb);

  // ---- The Layers menu ------------------------------------------------------------------------------
  const baseRadios = new Map();
  const baseGroup = h('fieldset', { class: 'sof-layers-base' }, h('legend', {}, 'Base map'));
  for (const base of BASES) {
    const id = `${uid}-base-${base.id}`;
    const input = h('input', { type: 'radio', name: `${uid}-base`, id, value: base.id, onchange: () => handlers.onBase(base.id) });
    baseRadios.set(base.id, input);
    baseGroup.append(h('div', { class: 'sof-layer-row' }, input, h('label', { for: id }, base.label)));
  }
  const vncId = `${uid}-vnc-opacity`;
  const vncSlider = h('input', { type: 'range', id: vncId, min: OPACITY_RANGE.min, max: OPACITY_RANGE.max, step: OPACITY_RANGE.step, oninput: () => handlers.onOpacity('vnc', Number(vncSlider.value)) });
  const vncOut = h('output', { for: vncId, class: 'sof-layer-value' });
  const vncRow = h('div', { class: 'sof-layer-row sof-layer-slider' }, h('label', { for: vncId }, 'VNC chart opacity'), vncSlider, vncOut);
  baseGroup.append(vncRow);

  const overlayList = h('div', { class: 'sof-layers-overlays' });
  const rowEls = new Map(); // id → { box, slider, out, row }
  let builtWithRelay = null;

  function buildRows(rows) {
    overlayList.replaceChildren();
    rowEls.clear();
    for (const row of rows) {
      const id = `${uid}-layer-${row.id}`;
      const box = h('input', { type: 'checkbox', id, onchange: () => handlers.onLayer(row.id, box.checked) });
      const parts = [box, h('label', { for: id }, row.label)];
      let slider = null;
      let out = null;
      if (row.opacity !== null) {
        const sid = `${id}-opacity`;
        slider = h('input', { type: 'range', id: sid, min: OPACITY_RANGE.min, max: OPACITY_RANGE.max, step: OPACITY_RANGE.step, 'aria-label': `${row.label} opacity`, oninput: () => handlers.onOpacity(row.id, Number(slider.value)) });
        out = h('output', { for: sid, class: 'sof-layer-value' });
        parts.push(slider, out);
      }
      const el = h('div', { class: `sof-layer-row${slider ? ' sof-layer-slider' : ''}` }, parts);
      overlayList.append(el);
      rowEls.set(row.id, { box, slider, out });
    }
  }

  // The traffic layer's own choices, shown only when the layer can be used (a relay address is set).
  const labelId = `${uid}-traffic-label`;
  const labelSelect = h('select', { id: labelId, onchange: () => handlers.onTrafficLabel(labelSelect.value) }, TRAFFIC_LABELS.map((l) => h('option', { value: l.id }, l.label)));
  const milId = `${uid}-traffic-military`;
  const milBox = h('input', { type: 'checkbox', id: milId, onchange: () => handlers.onMilitaryOnly(milBox.checked) });
  const trafficOptions = h('fieldset', { class: 'sof-layers-traffic', hidden: true },
    h('legend', {}, 'Traffic options'),
    h('div', { class: 'sof-layer-row' }, h('label', { for: labelId }, 'Labels'), labelSelect),
    h('div', { class: 'sof-layer-row' }, milBox, h('label', { for: milId }, 'Military only')));

  const panel = h(
    'div',
    { class: 'sof-layers-panel', id: panelId, role: 'group', 'aria-label': 'Map layers', hidden: true },
    baseGroup,
    h('div', { class: 'sof-layers-title' }, 'Layers (they stack)'),
    overlayList,
    trafficOptions,
  );

  layersButton.after(panel);

  function setPanel(open) {
    panel.hidden = !open;
    layersButton.setAttribute('aria-expanded', String(open));
  }
  layersButton.addEventListener('click', () => setPanel(panel.hidden));
  // Escape closes the menu and puts focus back on its button, whether focus is inside the menu or still on the button.
  const closeOnEscape = (event) => {
    if (event.key !== 'Escape' || panel.hidden) return;
    event.stopPropagation();
    setPanel(false);
    layersButton.focus();
  };
  panel.addEventListener('keydown', closeOnEscape);
  layersButton.addEventListener('keydown', closeOnEscape);

  // ---- Under the map ------------------------------------------------------------------------------------
  const status = h('ul', { class: 'sof-map-status', 'aria-label': 'Map feeds' });
  const credits = h('p', { class: 'sof-map-credits' });
  const note = h('p', { class: 'sof-map-note', hidden: true });
  const itemEls = new Map();

  // ---- The map key: closed to begin with (R22), what each colour on the map means --------------------------------
  const legendBody = h('div', { class: 'sof-map-legend-body' });
  const legend = h('details', { class: 'sof-map-legend', hidden: true }, h('summary', {}, 'Map key'), legendBody);
  let legendSig = '';
  function drawLegend(items) {
    const parts = [];
    if (items.radar) {
      const r = items.radar;
      const bar = h('div', { class: 'sof-legend-bar', 'aria-hidden': 'true', style: `background: linear-gradient(to right, ${RADAR_COLOURS.join(', ')})` });
      const ticks = h('div', { class: 'sof-legend-ticks', 'aria-hidden': 'true' },
        r.ticks.map(([text, at]) => h('span', { style: `left: ${at}%`, class: at === 0 ? 'is-first' : at === 100 ? 'is-last' : '' }, at === 100 ? `${text} ${r.unit}` : text)));
      parts.push(h('div', { class: 'sof-legend-item' }, h('p', {}, r.words), bar, ticks));
    }
    if (items.lightning) {
      parts.push(h('div', { class: 'sof-legend-item sof-legend-row' }, h('span', { class: 'sof-legend-lightning', 'aria-hidden': 'true' }), h('p', {}, items.lightning)));
    }
    if (items.rings) parts.push(h('div', { class: 'sof-legend-item' }, h('p', {}, items.rings)));
    legendBody.replaceChildren(...parts);
  }

  return {
    bar,
    panel,
    status,
    legend,
    credits,
    note,
    closePanel: () => setPanel(false),
    /** Escape anywhere on the map closes the Layers menu and returns focus to its button. */
    escape: closeOnEscape,
    /** The key for what is showing (map-model.js `legendItems`), or null to hide it (the ADS-B Exchange view). Redrawn only when it changes. */
    setLegend(items) {
      const shown = items && (items.radar || items.lightning || items.rings);
      legend.hidden = !shown;
      const sig = shown ? JSON.stringify(items) : '';
      if (sig === legendSig) return;
      legendSig = sig;
      if (shown) drawLegend(items);
      else legendBody.replaceChildren();
    },
    /** The state to show: { layers, relay, adsbOn }. Only what differs is touched. */
    sync({ layers, relay, adsbOn }) {
      if (builtWithRelay !== relay) {
        builtWithRelay = relay;
        buildRows(menuRows(layers, { relay }));
      }
      for (const row of menuRows(layers, { relay })) {
        const el = rowEls.get(row.id);
        if (el.box.checked !== row.on) el.box.checked = row.on;
        if (el.slider) {
          if (el.slider.value !== String(row.opacity)) el.slider.value = String(row.opacity);
          setText(el.out, `${row.opacity}%`);
          el.slider.setAttribute('aria-valuetext', `${row.opacity} percent`);
        }
      }
      for (const [id, input] of baseRadios) if (input.checked !== (layers.base === id)) input.checked = layers.base === id;
      if (vncSlider.value !== String(layers.opacity.vnc)) vncSlider.value = String(layers.opacity.vnc);
      setText(vncOut, `${layers.opacity.vnc}%`);
      vncSlider.disabled = layers.base !== 'vnc-satellite';
      if (precip.value !== layers.precip) precip.value = layers.precip;
      traffic.hidden = !relay;
      trafficOptions.hidden = !relay;
      if (labelSelect.value !== layers.traffic.label) labelSelect.value = layers.traffic.label;
      if (milBox.checked !== layers.traffic.militaryOnly) milBox.checked = layers.traffic.militaryOnly;
      traffic.setAttribute('aria-pressed', String(layers.on.traffic === true));
      adsb.setAttribute('aria-pressed', String(adsbOn));
      // Under ADS-B Exchange's own map these do nothing, so they are switched off rather than left to look live.
      // (The Layers menu stays: its choices are kept for when the view is switched back.)
      for (const el of [precip, home, zoomIn, zoomOut, traffic]) el.disabled = adsbOn;
    },
    /** Items: [{ id, text, symbol, tone }]. Rows are kept and only their words change. */
    setStatus(items) {
      const wanted = new Set(items.map((i) => i.id));
      for (const [id, el] of itemEls) {
        if (!wanted.has(id)) {
          el.li.remove();
          itemEls.delete(id);
        }
      }
      for (const item of items) {
        let el = itemEls.get(item.id);
        if (!el) {
          el = { li: h('li', { class: 'sof-map-feed' }), words: h('span'), symbol: h('span', { class: 'sof-map-feed-symbol', 'aria-hidden': 'true' }) };
          el.li.append(el.words, ' ', el.symbol);
          itemEls.set(item.id, el);
        }
        setText(el.words, item.text);
        setText(el.symbol, item.symbol);
        const cls = `sof-map-feed is-${item.tone}`;
        if (el.li.className !== cls) el.li.className = cls;
      }
      // Keep the order of `items`.
      let previous = null;
      for (const item of items) {
        const { li } = itemEls.get(item.id);
        const wantedBefore = previous ? previous.nextSibling : status.firstChild;
        if (li !== wantedBefore) status.insertBefore(li, wantedBefore);
        previous = li;
      }
    },
    setCredits: (text) => setText(credits, text),
    setNote(text) {
      note.hidden = !text;
      setText(note, text ?? '');
    },
  };
}
