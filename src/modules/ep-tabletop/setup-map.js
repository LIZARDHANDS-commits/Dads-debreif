// The "Any setup" map (plan Step 5b; spec "Any setup", EP-17): a 2D map of the Moose Jaw area on the shared satellite tiles (ui-kit
// map-tiles.js, Esri World Imagery, as the Debrief, SOF and Traffic maps draw them) with the shared pan and zoom (ui-kit canvas-view.js),
// and the fields round Moose Jaw (flight.js FIELDS: OurAirports, with Patrick's CYMJ runway ends). A tap (or Enter, for the map's centre)
// drops the aircraft there. It also draws the drop with its heading, and the aircraft now with its track since the freeze. North up, true;
// distances in the flight's feet from CYMJ's origin (x east, y north). For the instructor only (the console), never the student's screen.
import { h } from '../../ui-kit/dom.js';
import { createCanvasView } from '../../ui-kit/canvas-view.js';
import { createTileLayer, cornersOf, ESRI_IMAGERY } from '../../ui-kit/map-tiles.js';
import { makeLocalRef, latLonToLocalFt, localFtToLatLon } from '../../core/geo.js';
import { unitVectorFromCompassDeg } from '../../core/angles.js';
import { FT_PER_NM } from '../../core/units.js';
import { CYMJ_ORIGIN } from '../../airfields/cymj-runways.js';
import { FIELDS } from './flight.js';

const REF = makeLocalRef(CYMJ_ORIGIN.lat, CYMJ_ORIGIN.lon);
const PROJECTION = Object.freeze({ toLatLon: (x, y) => localFtToLatLon(REF, x, y) });
/** The map opens on 25 NM round Moose Jaw (a tool choice: the area and the fields next to it). */
const OPEN_HALF_NM = 25;
/** A press that moves less than this (CSS pixels) is a tap, not a pan. */
const TAP_PX = 6;
/** Range rings from Moose Jaw, NM (a picture choice, for finding the area). */
const RINGS_NM = Object.freeze([10, 20, 30]);
const COLOURS = Object.freeze({ ground: '#24323f', ring: 'rgba(255,255,255,0.35)', runway: '#ffffff', label: '#ffffff', drop: '#ffb020', aircraft: '#40d8ff', trail: 'rgba(64,216,255,0.8)' });

/**
 * timers: a scheduler scope (frame, after). onDrop({ x, y }): a tap. Returns { element, setDrop({ x, y, headingDegT }),
 * setAircraft(now: { x, y, headingDegT } | null, trail: [{ x, y }]), dispose() }.
 */
export function createSetupMap({ timers, onDrop }) {
  const canvas = h('canvas', { class: 'ep-setup-map' });
  const caption = h('p', { class: 'ep-sub ep-setup-credit' }, ESRI_IMAGERY.credit);
  const element = h('div', { class: 'ep-setup-map-wrap' }, canvas, caption);
  let drop = null;
  let aircraft = null;
  let trail = [];
  let fitted = false;
  let imagery = null;

  const view = createCanvasView(canvas, {
    timers,
    minSpan: 2 * FT_PER_NM,
    maxSpan: 250 * FT_PER_NM,
    label: 'Map of the Moose Jaw area: tap to drop the aircraft there',
    draw,
  });
  imagery = createTileLayer({ source: ESRI_IMAGERY, timers, onChange: () => view.requestDraw() });

  function draw(ctx, v) {
    const { width, height } = v.size;
    if (!fitted && width > 0) {
      fitted = true;
      const half = OPEN_HALF_NM * FT_PER_NM;
      v.fit({ minX: -half, minY: -half, maxX: half, maxY: half }, 8);
    }
    ctx.fillStyle = COLOURS.ground;
    ctx.fillRect(0, 0, width, height);
    imagery?.draw(ctx, {
      corners: cornersOf(PROJECTION, v.visibleBounds()),
      pxPerFt: v.view.scale,
      toScreen: (lat, lon) => {
        const p = latLonToLocalFt(REF, lat, lon);
        return v.worldToScreen(p.x, p.y);
      },
    });
    const st = imagery?.state();
    caption.textContent = st && st.wanted > 0 && st.failed === st.wanted ? 'The satellite picture needs a connection; the map still works.' : ESRI_IMAGERY.credit;

    // Range rings round Moose Jaw.
    const [cx, cy] = v.worldToScreen(0, 0);
    ctx.strokeStyle = COLOURS.ring;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (const nm of RINGS_NM) {
      ctx.beginPath();
      ctx.arc(cx, cy, nm * FT_PER_NM * v.view.scale, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // The fields: their runways and names.
    ctx.font = '600 12px system-ui, sans-serif';
    for (const f of FIELDS) {
      ctx.strokeStyle = COLOURS.runway;
      ctx.lineWidth = 3;
      for (const r of f.runways) {
        const [ax, ay] = v.worldToScreen(r.a.x, r.a.y);
        const [bx, by] = v.worldToScreen(r.b.x, r.b.y);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
      const [lx, ly] = v.worldToScreen(f.point.x, f.point.y);
      if (lx < -50 || ly < -20 || lx > width + 50 || ly > height + 20) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(lx + 8, ly - 16, ctx.measureText(f.icao).width + 8, 16);
      ctx.fillStyle = COLOURS.label;
      ctx.fillText(f.icao, lx + 12, ly - 4);
    }

    // The track since the freeze, the aircraft now, and the drop with its heading.
    if (trail.length > 1) {
      ctx.strokeStyle = COLOURS.trail;
      ctx.lineWidth = 2;
      ctx.beginPath();
      trail.forEach((p, i) => {
        const [x, y] = v.worldToScreen(p.x, p.y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    if (aircraft) marker(ctx, v, aircraft, COLOURS.aircraft, 'triangle');
    if (drop) marker(ctx, v, drop, COLOURS.drop, 'circle');
    ctx.fillStyle = COLOURS.label;
    ctx.fillText('N ↑', 8, 16);
  }

  function marker(ctx, v, p, colour, shape) {
    const [x, y] = v.worldToScreen(p.x, p.y);
    const u = unitVectorFromCompassDeg(Number.isFinite(p.headingDegT) ? p.headingDegT : 0);
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + u.x * 26, y - u.y * 26);
    ctx.stroke();
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(x, y, 6, 0, 2 * Math.PI);
    } else {
      ctx.moveTo(x + u.x * 9, y - u.y * 9);
      ctx.lineTo(x - u.x * 6 + u.y * 6, y + u.y * 6 + u.x * 6);
      ctx.lineTo(x - u.x * 6 - u.y * 6, y + u.y * 6 - u.x * 6);
      ctx.closePath();
    }
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // A tap (a press that hardly moved) drops the aircraft; a drag pans (canvas-view.js); Enter drops it at the map's centre.
  let press = null;
  const onDown = (e) => {
    if (e.button === 0) press = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onUp = (e) => {
    if (!press || e.pointerId !== press.id) return;
    const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    press = null;
    if (moved > TAP_PX) return;
    const rect = canvas.getBoundingClientRect();
    const [x, y] = view.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    onDrop({ x, y });
  };
  const onKey = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const c = view.view;
    onDrop({ x: c.cx, y: c.cy });
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('keydown', onKey);

  return {
    element,
    setDrop(p) {
      drop = p;
      view.requestDraw();
    },
    setAircraft(now, track) {
      aircraft = now;
      trail = track ?? [];
      view.requestDraw();
    },
    dispose() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('keydown', onKey);
      imagery?.dispose();
      view.dispose();
    },
  };
}
