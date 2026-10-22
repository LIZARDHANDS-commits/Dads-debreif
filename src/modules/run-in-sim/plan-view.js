// The small plan view (2D) in the corner of the 3D view (spec, "Middle"): north up, the same lines from above (the orbit's
// pattern or circle,
// the IP, the run-in, the dive line's track, the release point), the flown track so far, the aircraft, the load's impact,
// the wind arrow and a scale. A click on it opens the map (map-picker.js) to tap a new place. A picture only.
// The air refuelling run (RS-18; approved: Patrick's yes, relayed by Dad, 17 Oct 2026): the anchor, the receiver's track, the tanker's
// turn point and the roll-out point, and both flown tracks, the tanker's in orange.
import { createCanvasSurface } from '../../ui-kit/canvas-view.js';
import { FT_PER_NM, KT_TO_FTPS } from '../../core/units.js';
import { compassDegFromVector } from '../../core/angles.js';
import { orbitOutline } from './pass.js';
import { refuelOutline, turnRangeLine } from './refuel.js';

const COLOURS = Object.freeze({ bg: 'rgba(5, 12, 20, 0.86)', plan: '#cfe3f2', runIn: '#42bfe9', release: '#ff9f43', ip: '#f5c542', escape: '#3ecf8e', text: '#dfe8f0', target: '#ffffff', tanker: '#ff9f43' });

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
    const aar = refuelOutline(plan); // the refuelling run's lines, or null
    // A pass of the other kind (just after the Run changed) is not drawn on this plan.
    const pass = state.pass && (state.pass.plan.kind === 'aar') === Boolean(aar) ? state.pass : null;
    // The extent: the orbit, the IP and the target (or the anchor and the receiver's track), and the flown track.
    const outline = aar ? [aar.anchor] : orbitOutline(plan);
    const pts = aar ? [...aar.anchor, ...aar.track, ...(aar.runway ? [aar.runway.a, aar.runway.b] : [])] : [{ x: 0, y: 0 }, plan.ip, ...outline.flat()];
    const tl = pass?.flight.timeline;
    if (tl) for (let i = 0; i < tl.t.length; i += 40) pts.push({ x: tl.x[i], y: tl.y[i] });
    const tt = pass?.tanker;
    if (tt) for (let i = 0; i < tt.x.length; i += 40) pts.push({ x: tt.x[i], y: tt.y[i] });
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
    for (const line of outline) path(line, COLOURS.plan, [4, 3]);
    if (aar) {
      drawRefuel(aar, pass, { path, spot });
      windAndScale(ctx, w, h, k, plan.windAt(plan.windMsl));
      return;
    }
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
      const relT = pass.flight.release?.t ?? Infinity;
      const before = [];
      const after = [];
      for (let i = 0; i <= end; i += 10) (tl.t[i] <= relT ? before : after).push({ x: tl.x[i], y: tl.y[i] });
      path(before, COLOURS.runIn);
      if (after.length) path([before[before.length - 1] ?? after[0], ...after], COLOURS.escape);
      spot({ x: tl.x[end], y: tl.y[end] }, '#ffffff', 3);
      const fall = pass.fall;
      if (fall?.impact && state.t >= relT + fall.impact.t) spot(fall.impact, COLOURS.release, 3);
    }
    windAndScale(ctx, w, h, k, plan.windAt(plan.runInMsl));
  };
  /** The refuelling run: the receiver's track, the turn and roll-out points, both flown tracks (the join in green). */
  const drawRefuel = (aar, pass, { path, spot }) => {
    path(aar.inbound, COLOURS.tanker, [4, 3]);
    path(aar.track, COLOURS.runIn);
    if (aar.direct) path(aar.direct, COLOURS.runIn, [2, 3]); // RS-19 amended: the planned direct track to the IP
    if (aar.arcp) spot(aar.arcp, COLOURS.plan, 2.5); // RS-19 amended: the ARCP
    path([aar.offset.a, aar.offset.b], COLOURS.ip); // RS-20: the offset
    spot(aar.turnStart, COLOURS.ip);
    spot(aar.rollOut, COLOURS.target);
    if (aar.runway) {
      path([aar.runway.a, aar.runway.b], COLOURS.target); // RS-19: CYMJ's runway and the IP
      spot(aar.ip, COLOURS.ip, 2.5);
    }
    const tr = turnRangeLine(pass);
    if (tr) path([tr.centre, tr.rcv], COLOURS.ip, [2, 2]); // RS-20: the turn range
    const tl = pass?.flight.timeline;
    const tt = pass?.tanker;
    if (!tl || !tt) return;
    const dt = tl.t[1] - tl.t[0] || 0.05;
    const end = Math.min(tl.t.length - 1, Math.floor(state.t / dt));
    const roT = pass.flight.events.rollOut ?? Infinity;
    const before = [];
    const after = [];
    const tanker = [];
    for (let i = 0; i <= end; i += 10) {
      (tl.t[i] <= roT ? before : after).push({ x: tl.x[i], y: tl.y[i] });
      tanker.push({ x: tt.x[i], y: tt.y[i] });
    }
    tanker.push({ x: tt.x[end], y: tt.y[end] });
    path(tanker, COLOURS.tanker);
    path(before, COLOURS.runIn);
    if (after.length) path([before[before.length - 1] ?? after[0], ...after], COLOURS.escape);
    spot({ x: tt.x[end], y: tt.y[end] }, COLOURS.tanker, 3);
    spot({ x: tl.x[end], y: tl.y[end] }, '#ffffff', 3);
  };
  /** The wind arrow (the way the air moves) and the scale. */
  const windAndScale = (ctx, w, h, k, w0) => {
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
