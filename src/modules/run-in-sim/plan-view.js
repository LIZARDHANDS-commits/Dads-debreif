// The small plan view (2D) in the corner of the 3D view (spec, "Middle"): north up, the same lines from above (the orbit,
// the IP, the run-in, the dive line's track, the release point), the flown track so far, the aircraft, the load's impact,
// the wind arrow and a scale. A click on it opens the map (map-picker.js) to tap a new place. A picture only.
import { createCanvasSurface } from '../../ui-kit/canvas-view.js';
import { FT_PER_NM, KT_TO_FTPS } from '../../core/units.js';
import { compassDegFromVector } from '../../core/angles.js';

const COLOURS = Object.freeze({ bg: 'rgba(5, 12, 20, 0.86)', plan: '#cfe3f2', runIn: '#42bfe9', release: '#ff9f43', ip: '#f5c542', escape: '#3ecf8e', text: '#dfe8f0', target: '#ffffff' });

/**
 * canvas: the plan view's <canvas>; timers: the module's scheduler scope; onOpen(): the map is asked for.
 * Returns { set({ plan, pass, t, windWords }), requestDraw(), dispose() }.
 */
export function createPlanView(canvas, { timers, onOpen }) {
  let state = { plan: null, pass: null, t: 0, windWords: '' };
  const draw = (ctx, surface) => {
    const { width: w, height: h } = surface.size;
    ctx.fillStyle = COLOURS.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = COLOURS.text;
    ctx.fillText('Plan view (2D) · north up · click for the map', 8, 14);
    const plan = state.plan;
    if (!plan) return;
    // The extent: the orbit, the IP and the target, and the flown track.
    const pts = [{ x: 0, y: 0 }, plan.ip, { x: plan.orbit.centre.x - plan.orbit.radiusFt, y: plan.orbit.centre.y - plan.orbit.radiusFt }, { x: plan.orbit.centre.x + plan.orbit.radiusFt, y: plan.orbit.centre.y + plan.orbit.radiusFt }];
    const tl = state.pass?.flight.timeline;
    if (tl) for (let i = 0; i < tl.t.length; i += 40) pts.push({ x: tl.x[i], y: tl.y[i] });
    const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
    const pad = 18;
    const top = 22;
    const k = Math.min((w - 2 * pad) / Math.max(maxX - minX, 1), (h - top - pad - 16) / Math.max(maxY - minY, 1));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const S = (x, y) => [w / 2 + (x - cx) * k, top + (h - top - 16) / 2 - (y - cy) * k];
    const path = (list, color, dash = []) => {
      ctx.strokeStyle = color;
      ctx.setLineDash(dash);
      ctx.beginPath();
      list.forEach((p, i) => (i ? ctx.lineTo(...S(p.x, p.y)) : ctx.moveTo(...S(p.x, p.y))));
      ctx.stroke();
      ctx.setLineDash([]);
    };
    const spot = (p, color, r = 3.5) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(...S(p.x, p.y), r, 0, Math.PI * 2);
      ctx.fill();
    };
    ctx.lineWidth = 1.4;
    const o = plan.orbit;
    ctx.strokeStyle = COLOURS.plan;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(...S(o.centre.x, o.centre.y), o.radiusFt * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    const { u, r } = plan;
    const lineAt = (along) => ({ x: u.x * along + r.x * plan.offsetFt, y: u.y * along + r.y * plan.offsetFt });
    path([plan.ip, lineAt(plan.release?.along ?? 0)], COLOURS.runIn);
    if (plan.dive) path([lineAt(plan.dive.rollInAlong), plan.dive.aimOff], COLOURS.runIn, [3, 3]);
    spot(plan.ip, COLOURS.ip);
    if (plan.release?.point) spot(plan.release.point, COLOURS.release);
    ctx.strokeStyle = COLOURS.target;
    ctx.beginPath();
    ctx.arc(...S(0, 0), 5, 0, Math.PI * 2);
    ctx.stroke();
    // The flown track so far, the escape in green.
    if (tl) {
      const dt = tl.t[1] - tl.t[0] || 0.05;
      const end = Math.min(tl.t.length - 1, Math.floor(state.t / dt));
      const relT = state.pass.flight.release?.t ?? Infinity;
      const before = [];
      const after = [];
      for (let i = 0; i <= end; i += 10) (tl.t[i] <= relT ? before : after).push({ x: tl.x[i], y: tl.y[i] });
      path(before, COLOURS.runIn);
      if (after.length) path([before[before.length - 1] ?? after[0], ...after], COLOURS.escape);
      spot({ x: tl.x[end], y: tl.y[end] }, '#ffffff', 3);
      const fall = state.pass.fall;
      if (fall?.impact && state.t >= relT + fall.impact.t) spot(fall.impact, COLOURS.release, 3);
    }
    // The wind arrow (the way the air moves) and the scale.
    const w0 = plan.windAt(plan.runInMsl);
    const kt = Math.hypot(w0.x, w0.y) / KT_TO_FTPS;
    ctx.fillStyle = COLOURS.text;
    if (kt >= 0.5) {
      const a = Math.atan2(w0.y, w0.x);
      const [x0, y0] = [16, h - 12];
      ctx.strokeStyle = COLOURS.text;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(a) * 14, y0 - Math.sin(a) * 14);
      ctx.stroke();
    }
    ctx.fillText(state.windWords || (kt < 0.5 ? 'still air' : `wind ${Math.round(compassDegFromVector(-w0.x, -w0.y))}°T/${Math.round(kt)} kt`), 34, h - 8);
    const nmPx = FT_PER_NM * k;
    ctx.strokeStyle = COLOURS.text;
    ctx.beginPath();
    ctx.moveTo(w - 12 - nmPx, h - 10);
    ctx.lineTo(w - 12, h - 10);
    ctx.stroke();
    ctx.fillText('1 NM', w - 12 - nmPx, h - 14);
  };
  const surface = createCanvasSurface(canvas, { timers, draw, label: 'Plan view of the pass, north up. Click to open the map and tap a new place.' });
  canvas.tabIndex = 0;
  const open = () => onOpen();
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  };
  canvas.addEventListener('click', open);
  canvas.addEventListener('keydown', onKey);
  return {
    set(next) {
      state = { ...state, ...next };
      surface.requestDraw();
    },
    requestDraw: surface.requestDraw,
    dispose() {
      canvas.removeEventListener('click', open);
      canvas.removeEventListener('keydown', onKey);
      surface.dispose();
    },
  };
}
