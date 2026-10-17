// "Tap the map" (spec, Setup "Place"; RS-Q4): the plan view enlarges into a map over the 3D view, on the shared map tiles
// (ui-kit map-tiles.js, the satellite picture), and a tap puts the target there. Drag to pan, the wheel or + and - to
// zoom. Typed latitude and longitude sit under More. Untrusted input is only ever a number from a box or a tap.
import { h } from '../../ui-kit/dom.js';
import { createCanvasView } from '../../ui-kit/canvas-view.js';
import { createTileLayer, ESRI_IMAGERY, cornersOf } from '../../ui-kit/map-tiles.js';
import { makeLocalRef, latLonToLocalFt, localFtToLatLon } from '../../core/geo.js';
import { FT_PER_NM } from '../../core/units.js';

/** A press that moves less than this many pixels is a tap, not a pan (an estimate for feel). */
const TAP_PX = 6;

/**
 * timers: the module's scheduler scope; controls: the module's createControls (for the typed boxes); getPlace() →
 * { lat, lon }; onPlace({ lat, lon }): a tap; onDefault(): back to the Moose Jaw area; onClose().
 * Returns { element, open(), close(), refresh(), dispose() }.
 */
export function createMapPicker({ timers, controls, getPlace, onPlace, onDefault, onClose, defaultWords }) {
  const canvas = h('canvas', { class: 'rs-map-canvas' });
  const more = h('details', { class: 'rs-more' }, h('summary', {}, 'More'),
    controls.number('placeLat', { label: 'Latitude, degrees (north +)', min: -85, max: 85, step: 0.0001 }),
    controls.number('placeLon', { label: 'Longitude, degrees (east +)', min: -180, max: 180, step: 0.0001 }),
    controls.number('magVarDegE', { label: 'Magnetic variation here, degrees east (9° E at Moose Jaw, TR-65)', unit: '°', min: -40, max: 40, step: 1 }));
  const done = h('button', { type: 'button', class: 'rs-btn rs-btn-main' }, 'Done');
  const home = h('button', { type: 'button', class: 'rs-btn' }, defaultWords);
  const element = h('div', { class: 'rs-map', hidden: true },
    h('div', { class: 'rs-map-bar' }, h('strong', {}, 'Tap the map to place the target'), h('span', { class: 'rs-faint' }, 'Drag to pan · wheel or + / − to zoom'), home, done),
    h('div', { class: 'rs-map-body' }, canvas, h('div', { class: 'rs-map-side' }, more)));

  let ref = null;
  const tiles = createTileLayer({ source: ESRI_IMAGERY, timers, onChange: () => view?.requestDraw() });
  let view = null;
  const draw = (ctx, v) => {
    const { width, height } = v.size;
    ctx.fillStyle = '#1b2a35';
    ctx.fillRect(0, 0, width, height);
    if (!ref) return;
    const projection = { toLatLon: (x, y) => localFtToLatLon(ref, x, y) };
    const b = v.visibleBounds();
    const toScreen = (lat, lon) => {
      const p = latLonToLocalFt(ref, lat, lon);
      return v.worldToScreen(p.x, p.y);
    };
    tiles.draw(ctx, { corners: cornersOf(projection, b), pxPerFt: v.view.scale, toScreen });
    const place = getPlace();
    const p = latLonToLocalFt(ref, place.lat, place.lon);
    const [sx, sy] = v.worldToScreen(p.x, p.y);
    ctx.strokeStyle = '#ff9f43';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 10, 0, Math.PI * 2);
    ctx.moveTo(sx - 16, sy);
    ctx.lineTo(sx + 16, sy);
    ctx.moveTo(sx, sy - 16);
    ctx.lineTo(sx, sy + 16);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}`, sx + 14, sy - 12);
    ctx.fillText(ESRI_IMAGERY.credit, 8, height - 8);
  };

  let press = null;
  const onDown = (e) => {
    press = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e) => {
    if (!press || !view || !ref) return;
    const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    press = null;
    if (moved > TAP_PX) return;
    const rect = canvas.getBoundingClientRect();
    const [x, y] = view.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const ll = localFtToLatLon(ref, x, y);
    onPlace({ lat: ll.lat, lon: ll.lon });
    view.requestDraw();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  const close = () => {
    element.hidden = true;
    onClose();
  };
  done.addEventListener('click', close);
  home.addEventListener('click', () => {
    onDefault();
    const pl = getPlace();
    ref = makeLocalRef(pl.lat, pl.lon);
    view?.setView({ cx: 0, cy: 0 });
    view?.requestDraw();
  });

  return {
    element,
    open() {
      element.hidden = false;
      const place = getPlace();
      ref = makeLocalRef(place.lat, place.lon);
      view ??= createCanvasView(canvas, { timers, draw, minSpan: 2000, maxSpan: 600 * FT_PER_NM, label: 'Map: tap to place the target', arrowKeys: true });
      view.fit({ minX: -8 * FT_PER_NM, minY: -8 * FT_PER_NM, maxX: 8 * FT_PER_NM, maxY: 8 * FT_PER_NM }, 10);
      view.requestDraw();
      canvas.focus();
    },
    close,
    refresh: () => view?.requestDraw(),
    dispose() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      view?.dispose();
      tiles.dispose();
    },
  };
}
