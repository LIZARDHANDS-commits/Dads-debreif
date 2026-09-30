// The ADS-B Exchange view (SPEC-sof, "ADS-B Exchange view" and "Security"): the map area swapped for
// ADS-B Exchange's own live map, centred on home. It needs no server of ours.
//
// The one outside page the SOF embeds. It is loaded only while the view is switched on, from a fixed
// address with only the home field's position and a zoom in it (numbers, never text from anywhere),
// in a frame that may run its own scripts but has no other powers (no pop-ups, no navigating our page,
// no forms, no camera or location), and the frame is removed when the view is switched off or the
// module closes. If it won't load, the same map is offered as a link to a new tab.
import { h } from '../../ui-kit/dom.js';
import { pxPerFtForZoom } from './map-view.js';

export const ADSBX_ORIGIN = 'https://globe.adsbexchange.com';

/** The frame's powers: its own scripts and its own site's storage (it is another site, so it cannot reach this page either way). Nothing else. */
export const FRAME_SANDBOX = 'allow-scripts allow-same-origin';

/** How long the frame has to load before the link is offered beside it. */
export const LOAD_WAIT_MS = 15_000;

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * ADS-B Exchange's map address for a place: `https://globe.adsbexchange.com/?lat=..&lon=..&zoom=..`,
 * built from numbers only (position to 3 decimals, zoom a whole number from 2 to 14). Returns null when
 * the place is not real.
 */
export function adsbExchangeUrl({ lat, lon, zoom = 8 } = /** @type {any} */ ({})) {
  if (!isNumber(lat) || !isNumber(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const z = isNumber(zoom) ? Math.min(14, Math.max(2, Math.round(zoom))) : 8;
  const n = (v) => Number(v.toFixed(3));
  return `${ADSBX_ORIGIN}/?lat=${n(lat)}&lon=${n(lon)}&zoom=${z}`;
}

/** The web-map zoom whose scale is nearest a map scale (pixels per foot) at a latitude: "the same zoom". */
export function zoomForScale(lat, scale) {
  if (!isNumber(lat) || !isNumber(scale) || scale <= 0) return 8;
  const z = Math.log2(scale / pxPerFtForZoom(lat, 0));
  return Math.min(14, Math.max(2, Math.round(z)));
}

/**
 * The frame's holder: `element` goes in the page (hidden until shown). show(url) puts the frame in,
 * hide() takes it out; both are safe to call twice. `timers`: a scheduler scope (the load wait ends with
 * the module). Returns { element, show, hide, dispose, isShown }.
 */
export function createAdsbFrame({ timers, onSlow = () => {} }) {
  const link = h('a', { class: 'sof-adsbx-link', target: '_blank', rel: 'noopener noreferrer' }, 'Open ADS-B Exchange in a new tab');
  const note = h('p', { class: 'sof-adsbx-note' }, 'ADS-B Exchange shows here while this view is on. If it does not appear, ', link, '.');
  const element = h('div', { class: 'sof-adsbx', hidden: true }, note);
  let frame = null;
  let cancelWait = null;

  const hide = () => {
    cancelWait?.();
    cancelWait = null;
    frame?.remove();
    frame = null;
    element.hidden = true;
    element.classList.remove('is-slow');
  };

  return {
    element,
    isShown: () => frame !== null,
    show(url) {
      hide();
      if (typeof url !== 'string' || !url.startsWith(`${ADSBX_ORIGIN}/?`)) return false; // only ever our one fixed address
      link.href = url;
      frame = h('iframe', {
        class: 'sof-adsbx-frame',
        src: url,
        title: 'ADS-B Exchange live traffic map',
        sandbox: FRAME_SANDBOX,
        referrerpolicy: 'no-referrer',
        allow: '',
        loading: 'eager',
      });
      frame.addEventListener('load', () => {
        cancelWait?.();
        cancelWait = null;
        element.classList.remove('is-slow');
      });
      element.prepend(frame);
      element.hidden = false;
      cancelWait = timers.after(LOAD_WAIT_MS, () => {
        cancelWait = null;
        element.classList.add('is-slow');
        onSlow();
      });
      return true;
    },
    hide,
    dispose: hide,
  };
}
