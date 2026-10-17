// The 2D view (spec, "The 2D view"; RS-13), behind the 3D | 2D switch: two drawings that fill the middle and follow the
// playback.
//  - Plan, north up, on the satellite map at true scale (the shared map tiles the map picker uses, ui-kit map-tiles.js):
//    the target's footprint at its own heading, the orbit's pattern, the IP, the run-in line, the aim-off point, the
//    release point (CARP), the flown track and the escape, the load's track and its impact, the aircraft's mark, the wind
//    arrow, a north arrow and a scale. Drag to pan, the wheel or + and - to zoom; Fit shows the whole pass again.
//  - Profile, along the run-in through the aim point: height (ft AGL, above the target's ground) against distance from
//    the target (three spans: the whole run-in, the release to the impact, or close round the target), with the ground under that line (the shared terrain), the target cut where the line crosses it (the
//    bridge's deck as wide as the line sees it at its crossing angle, and its towers where the line passes them), the
//    aircraft's path, the dive line, the release, the load's fall to its impact and the escape, with heights labelled.
// A picture only: it reads the plan and the stored pass (pass.js) and draws them at the time it is given. Canvas, no
// library. When the satellite tiles don't come, the plan draws on the plain ground colour.
// The air refuelling run (RS-18; approved: Patrick's yes, relayed by Dad, 17 Oct 2026): the plan shows the anchor,
// the receiver's track, the turn and roll-out points and both flown tracks; the profile shows both along the refuelling
// track (heights MSL against distance from the roll-out point), the whole rendezvous or the join, or the receiver behind
// the tanker (its height against its distance behind the tanker's wing line, with the hose, basket and pre-contact point).
import { h } from '../../ui-kit/dom.js';
import { createCanvasView, createCanvasSurface } from '../../ui-kit/canvas-view.js';
import { createTileLayer, ESRI_IMAGERY, cornersOf } from '../../ui-kit/map-tiles.js';
import { createPillGroup } from '../../ui-kit/camera-bar.js';
import { FT_PER_NM, KT_TO_FTPS } from '../../core/units.js';
import { compassDegFromVector } from '../../core/angles.js';
import { footprintOf, targetCut } from './targets.js';
import { orbitOutline, clock } from './pass.js';
import { refuelOutline, turnRangeLine, DROGUE, RECEIVER } from './refuel.js';

const COLOURS = Object.freeze({
  ground: '#1b2a35', halo: 'rgba(5, 10, 18, 0.85)', plan: '#e8f4ff', runIn: '#42bfe9', release: '#ff9f43', ip: '#f5c542',
  escape: '#3ecf8e', load: '#f5c542', text: '#e8f1f8', target: 'rgba(255, 255, 255, 0.9)', targetFill: 'rgba(255, 255, 255, 0.28)',
  terrain: '#6b5a43', terrainLine: '#a08b6a', solid: '#b8b4aa', axis: 'rgba(232, 241, 248, 0.45)', faint: 'rgba(66, 191, 233, 0.35)',
  profileBg: '#0d1822', tanker: '#ff9f43',
});
const FONT = '12px system-ui, sans-serif';
const RUN_IN_TITLE = 'Profile along the run-in, through the aim point';
const ft10 = (n) => `${(Math.round(n / 10) * 10).toLocaleString('en-CA')} ft`;
/** A round tick step near `raw`: 1, 2 or 5 times a power of ten. */
const niceStep = (raw) => {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
};

/** The index of time t in a timeline at a steady step. */
/** The pass to draw on this plan: none when it is of the other kind (just after the Run changed). */
const passFor = (pass, plan) => (pass && plan && (pass.plan.kind === 'aar') === (plan.kind === 'aar') ? pass : null);
const indexAt = (tl, t) => Math.max(0, Math.min(tl.t.length - 1, Math.floor(t / (tl.t[1] - tl.t[0] || 0.05))));

/**
 * timers: the module's scheduler scope; getProjection() → the area's projection (toLatLon(x, y), toXY(lat, lon));
 * onZoom(id): the profile's span picked ('target' close round it, 'near' the release to the impact, 'whole' the run-in).
 * Returns { element, set({ plan, pass, t, windWords, zoom }), show(on), refit(), dispose() }.
 */
export function createView2d({ timers, getProjection, onZoom }) {
  const planCanvas = h('canvas', { class: 'rs-2d-canvas' });
  const profCanvas = h('canvas', { class: 'rs-2d-canvas' });
  const fitBtn = h('button', { type: 'button', class: 'rs-btn rs-2d-fit', title: 'Show the whole pass again' }, 'Fit');
  const zoom = createPillGroup({ prefix: 'rs', label: 'The profile shows', items: [{ id: 'target', label: 'At the target' }, { id: 'near', label: 'Release to impact' }, { id: 'whole', label: 'Whole run-in' }], onPick: onZoom });
  // The refuelling run's profile spans, on the same setting (RS-18): the whole rendezvous, the join, behind the tanker.
  const zoomAar = createPillGroup({ prefix: 'rs', label: 'The profile shows', items: [{ id: 'whole', label: 'Whole rendezvous' }, { id: 'near', label: 'The join' }, { id: 'target', label: 'Behind the tanker' }], onPick: onZoom });
  const cutNote = h('span', { class: 'rs-2d-note' });
  const profTitle = h('span', { class: 'rs-2d-title' }, 'Profile along the run-in, through the aim point', cutNote);
  const element = h('div', { class: 'rs-2d', hidden: true },
    h('div', { class: 'rs-2d-plan' }, planCanvas, fitBtn),
    h('div', { class: 'rs-2d-profile' },
      h('div', { class: 'rs-2d-bar' }, profTitle, zoom.element, zoomAar.element),
      profCanvas));

  let state = { plan: null, pass: null, t: 0, windWords: '', zoom: 'near' };
  let shown = false;
  let needFit = true;
  let groundKept = { key: '', pts: [] };

  const tiles = createTileLayer({ source: ESRI_IMAGERY, timers, onChange: () => planView?.requestDraw() });

  // ---- The plan ----
  const halo = (ctx, draw, colour, width = 2, dash = []) => {
    ctx.setLineDash(dash);
    ctx.strokeStyle = COLOURS.halo;
    ctx.lineWidth = width + 2.5;
    draw();
    ctx.stroke();
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    draw();
    ctx.stroke();
    ctx.setLineDash([]);
  };
  /** A label on a dark plate, kept inside the canvas (it moves to the left of its point near the right edge). */
  const label = (ctx, words, x, y, colour = /** @type {string} */ (COLOURS.text)) => {
    ctx.font = FONT;
    const w = ctx.measureText(words).width;
    const right = ctx.canvas.clientWidth || Infinity;
    if (x + w + 6 > right) x = Math.max(4, x - w - 24);
    ctx.fillStyle = COLOURS.halo;
    ctx.fillRect(x - 3, y - 12, w + 6, 16);
    ctx.fillStyle = colour;
    ctx.fillText(words, x, y);
  };

  function drawPlan(ctx, v) {
    const { width, height } = v.size;
    ctx.fillStyle = COLOURS.ground;
    ctx.fillRect(0, 0, width, height);
    const projection = getProjection();
    const S = (p) => v.worldToScreen(p.x, p.y);
    tiles.draw(ctx, {
      corners: cornersOf(projection, v.visibleBounds()), pxPerFt: v.view.scale,
      toScreen: (lat, lon) => {
        const [x, y] = projection.toXY(lat, lon);
        return v.worldToScreen(x, y);
      },
    });
    const plan = state.plan;
    label(ctx, 'Plan · north up · true scale', 8, 18);
    if (!plan) return;
    const k = v.view.scale;
    if (plan.kind === 'aar') {
      drawRefuelPlan(ctx, v, plan, S);
      planFurniture(ctx, width, height, k, plan.windAt(plan.windMsl));
      return;
    }
    const line = (pts, colour, width = 2, dash = []) => {
      if (pts.length < 2) return;
      halo(ctx, () => {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(...S(p)) : ctx.moveTo(...S(p))));
      }, colour, width, dash);
    };
    const spot = (p, colour, r = 5) => {
      const [x, y] = S(p);
      ctx.fillStyle = COLOURS.halo;
      ctx.beginPath();
      ctx.arc(x, y, r + 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    const mark = (p, words, colour) => {
      const [x, y] = S(p);
      label(ctx, words, x + 9, y - 6, colour);
    };

    // The target's footprint at its own heading (RS-12).
    const t = plan.setup.target;
    const fp = footprintOf(t.id, t.sizeFt, t.headingDegT);
    ctx.lineWidth = 1.5;
    for (const poly of fp.polys) {
      ctx.beginPath();
      poly.forEach((p, i) => (i ? ctx.lineTo(...S(p)) : ctx.moveTo(...S(p))));
      ctx.closePath();
      ctx.fillStyle = COLOURS.targetFill;
      ctx.fill();
      ctx.strokeStyle = COLOURS.target;
      ctx.stroke();
    }
    const [cx, cy] = S({ x: 0, y: 0 });
    for (const e of fp.ellipses) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, e.a * k, e.b * k, -Math.atan2(fp.axis.y, fp.axis.x), 0, Math.PI * 2);
      ctx.strokeStyle = COLOURS.target;
      ctx.stroke();
    }
    for (const r of fp.rings) {
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(r * k, 1.5), 0, Math.PI * 2);
      ctx.strokeStyle = COLOURS.target;
      ctx.stroke();
    }
    // Zoomed out, the target is a few pixels: a ring marks where it is.
    if (plan.sizes.sizeFt * k < 12) {
      halo(ctx, () => {
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      }, COLOURS.target, 1.5);
    }

    // The planned lines: the orbit's pattern, the run-in from the IP, the dive line, the aim-off, the release point.
    for (const pts of orbitOutline(plan)) line(pts, COLOURS.plan, 1.5, [6, 4]);
    const { u, r } = plan;
    const lineAt = (along) => ({ x: u.x * along + r.x * plan.offsetFt, y: u.y * along + r.y * plan.offsetFt });
    const relAlong = plan.release?.along ?? 0;
    line([plan.ip, lineAt(relAlong)], COLOURS.runIn, 2.5);
    line([lineAt(relAlong), lineAt(Math.max(relAlong, 0) + 2500)], COLOURS.runIn, 1.5, [5, 4]);
    if (plan.dive) {
      line([lineAt(plan.dive.rollInAlong), plan.dive.aimOff], COLOURS.runIn, 1.5, [3, 3]);
      spot(plan.dive.aimOff, COLOURS.runIn, 4);
      mark(plan.dive.aimOff, 'Aim-off', COLOURS.runIn);
    } else if (Math.abs(plan.offsetFt) >= 5) {
      spot(lineAt(0), COLOURS.runIn, 4);
      mark(lineAt(0), `Aim-off ${ft10(Math.abs(plan.offsetFt))} ${plan.offsetFt > 0 ? 'right' : 'left'}`, COLOURS.runIn);
    }
    spot(plan.ip, COLOURS.ip);
    mark(plan.ip, `IP ${(plan.ipFt / FT_PER_NM).toFixed(1)} NM`, COLOURS.ip);
    if (plan.release?.point) {
      spot(plan.release.point, COLOURS.release, 4.5);
      const atCarp = plan.setup.release.mode === 'carp' && plan.setup.byHand.aimOffFt === null;
      mark(plan.release.point, atCarp ? 'CARP' : 'Release point (set)', COLOURS.release);
    }

    // The flight: the whole track faint, flown so far bright (the escape in green), the load's track and its impact.
    const pass = passFor(state.pass, plan);
    const tl = pass?.flight.timeline;
    if (tl) {
      const end = indexAt(tl, state.t);
      const relT = pass.flight.release?.t ?? Infinity;
      const all = [];
      const before = [];
      const after = [];
      for (let i = 0; i < tl.t.length; i += 4) {
        const p = { x: tl.x[i], y: tl.y[i] };
        all.push(p);
        if (i > end) continue;
        if (tl.t[i] <= relT) before.push(p);
        else after.push(p);
      }
      const here = { x: tl.x[end], y: tl.y[end] };
      (tl.t[end] <= relT ? before : after).push(here);
      line(all, COLOURS.faint, 1.5);
      line(before, COLOURS.runIn, 2);
      if (after.length) line([before[before.length - 1] ?? after[0], ...after], COLOURS.escape, 2);
      const fall = pass.fall;
      if (fall && state.t > relT) {
        const since = state.t - relT;
        const pts = fall.path.filter((q) => q.t <= since);
        line(pts, COLOURS.load, 1.5);
        if (fall.impact && since >= fall.impact.t) {
          const [ix, iy] = S(fall.impact);
          halo(ctx, () => {
            ctx.beginPath();
            ctx.arc(ix, iy, 7, 0, Math.PI * 2);
          }, COLOURS.release, 2);
          const [mx, my] = S(fall.impact);
          label(ctx, fall.deck?.on ? 'Impact (on the deck)' : 'Impact', mx + 9, my + 18, COLOURS.release);
        }
      }
      // The aircraft's mark, pointing along its track over the ground.
      const j = Math.min(tl.t.length - 1, end + 1);
      const i0 = Math.max(0, j - 2);
      const a = Math.atan2(tl.y[j] - tl.y[i0], tl.x[j] - tl.x[i0]);
      const [ax, ay] = S(here);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(-a);
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-7, 6);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-7, -6);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = COLOURS.halo;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    }

    planFurniture(ctx, width, height, k, plan.windAt(plan.runInMsl));
  }

  /** The refuelling run's plan: the anchor, the receiver's track, the turn and roll-out points, both flown tracks and marks. */
  function drawRefuelPlan(ctx, v, plan, S) {
    const line = (pts, colour, width = 2, dash = []) => {
      if (pts.length < 2) return;
      halo(ctx, () => {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(...S(p)) : ctx.moveTo(...S(p))));
      }, colour, width, dash);
    };
    const spot = (p, colour, r = 5) => {
      const [x, y] = S(p);
      ctx.fillStyle = COLOURS.halo;
      ctx.beginPath();
      ctx.arc(x, y, r + 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    const mark = (p, words, colour) => {
      const [x, y] = S(p);
      label(ctx, words, x + 9, y - 6, colour);
    };
    const o = refuelOutline(plan);
    line(o.anchor, COLOURS.plan, 1.5, [6, 4]);
    line(o.inbound, COLOURS.tanker, 1.5, [6, 4]);
    line(o.track, COLOURS.runIn, 2.5);
    spot(o.turnStart, COLOURS.ip);
    mark(o.turnStart, 'Tanker turns', COLOURS.ip);
    spot(o.rollOut, COLOURS.target);
    mark(o.rollOut, 'Roll-out point', COLOURS.target);
    // RS-20: the offset, square to the track from the tanker's inbound track to the receiver's, at the turn point.
    line([o.offset.a, o.offset.b], COLOURS.ip, 2);
    const [ox, oy] = S({ x: (o.offset.a.x + o.offset.b.x) / 2, y: (o.offset.a.y + o.offset.b.y) / 2 });
    label(ctx, `Offset ${(o.offset.ft / FT_PER_NM).toFixed(1)} NM ${o.offset.side}`, ox + 9, oy + 18, COLOURS.ip);
    if (o.runway) {
      // RS-19: CYMJ's runway (the climb-out is the flown track) and the IP.
      line([o.runway.a, o.runway.b], COLOURS.target, 4);
      mark(o.runway.a, `CYMJ ${o.runway.name}`, COLOURS.target);
      spot(o.ip, COLOURS.ip, 4.5);
      mark(o.ip, `IP ${(plan.ipFt / FT_PER_NM).toFixed(1)} NM`, COLOURS.ip);
    } else {
      spot(o.start, COLOURS.runIn, 4);
      mark(o.start, 'Receiver starts', COLOURS.runIn);
    }
    const pass = passFor(state.pass, plan);
    // RS-20: the turn range, a ring round the tanker's turn point and a line to where the receiver was when it turned.
    const tr = pass ? turnRangeLine(pass) : null;
    if (tr) {
      const [cx, cy] = S(tr.centre);
      halo(ctx, () => {
        ctx.beginPath();
        ctx.arc(cx, cy, tr.ft * v.view.scale, 0, Math.PI * 2);
      }, COLOURS.ip, 1.2, [4, 4]);
      line([tr.centre, tr.rcv], COLOURS.ip, 1.5, [4, 3]);
      const [tx, ty] = S({ x: (tr.centre.x + tr.rcv.x) / 2, y: (tr.centre.y + tr.rcv.y) / 2 });
      label(ctx, `Turn range ${(tr.ft / FT_PER_NM).toFixed(1)} NM at +${clock(tr.t)}`, tx + 9, ty - 6, COLOURS.ip);
    }
    const tl = pass?.flight.timeline;
    const tt = pass?.tanker;
    if (!tl || !tt) return;
    const end = indexAt(tl, state.t);
    const roT = pass.flight.events.rollOut ?? Infinity;
    const all = [];
    const allT = [];
    const before = [];
    const after = [];
    const tk = [];
    for (let i = 0; i < tl.t.length; i += 4) {
      all.push({ x: tl.x[i], y: tl.y[i] });
      allT.push({ x: tt.x[i], y: tt.y[i] });
      if (i > end) continue;
      (tl.t[i] <= roT ? before : after).push({ x: tl.x[i], y: tl.y[i] });
      tk.push({ x: tt.x[i], y: tt.y[i] });
    }
    const here = { x: tl.x[end], y: tl.y[end] };
    const hereT = { x: tt.x[end], y: tt.y[end] };
    (tl.t[end] <= roT ? before : after).push(here);
    tk.push(hereT);
    line(all, COLOURS.faint, 1.5);
    line(allT, 'rgba(255, 159, 67, 0.35)', 1.5);
    line(tk, COLOURS.tanker, 2);
    line(before, COLOURS.runIn, 2);
    if (after.length) line([before[before.length - 1] ?? after[0], ...after], COLOURS.escape, 2);
    const arrow = (p, a, colour) => {
      const [ax, ay] = S(p);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(-a);
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-7, 6);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-7, -6);
      ctx.closePath();
      ctx.fillStyle = colour;
      ctx.strokeStyle = COLOURS.halo;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    };
    const j = Math.min(tl.t.length - 1, end + 1);
    const i0 = Math.max(0, j - 2);
    arrow(hereT, Math.atan2(tt.y[j] - tt.y[i0], tt.x[j] - tt.x[i0]), COLOURS.tanker);
    arrow(here, Math.atan2(tl.y[j] - tl.y[i0], tl.x[j] - tl.x[i0]), '#ffffff');
    mark(hereT, 'KC-130J', COLOURS.tanker);
    const [rx, ry] = S(here);
    label(ctx, 'Stand-in receiver', rx + 9, ry + 18);
  }

  /** The north arrow, the wind arrow (the way the air moves, at the run-in's or the refuelling height) and the scale. */
  function planFurniture(ctx, width, height, k, w0) {
    const nx = width - 26;
    halo(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(nx, 48);
      ctx.lineTo(nx, 22);
      ctx.moveTo(nx - 6, 30);
      ctx.lineTo(nx, 22);
      ctx.lineTo(nx + 6, 30);
    }, COLOURS.text, 2);
    label(ctx, 'N', nx - 4, 64);
    const kt = Math.hypot(w0.x, w0.y) / KT_TO_FTPS;
    const wx = 22;
    const wy = height - 52;
    if (kt >= 0.5) {
      const ang = Math.atan2(w0.y, w0.x);
      const dx = Math.cos(ang) * 14;
      const dy = -Math.sin(ang) * 14;
      halo(ctx, () => {
        ctx.beginPath();
        ctx.moveTo(wx - dx, wy - dy);
        ctx.lineTo(wx + dx, wy + dy);
        ctx.moveTo(wx + dx - (dx * 0.5 - dy * 0.35), wy + dy - (dy * 0.5 + dx * 0.35));
        ctx.lineTo(wx + dx, wy + dy);
        ctx.lineTo(wx + dx - (dx * 0.5 + dy * 0.35), wy + dy - (dy * 0.5 - dx * 0.35));
      }, COLOURS.text, 2);
    }
    label(ctx, state.windWords || (kt < 0.5 ? 'still air' : `wind ${Math.round(compassDegFromVector(-w0.x, -w0.y))}°T/${Math.round(kt)} kt`), wx + 22, wy + 4);
    // The scale: the roundest length near a fifth of the width, in NM when it is a mile or more, else in feet.
    const want = width / 5 / k;
    const nm = want >= FT_PER_NM * 0.8;
    const len = nm ? niceStep(want / FT_PER_NM) * FT_PER_NM : niceStep(want);
    const sx = 16;
    const sy = height - 22;
    halo(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(sx, sy - 5);
      ctx.lineTo(sx, sy);
      ctx.lineTo(sx + len * k, sy);
      ctx.lineTo(sx + len * k, sy - 5);
    }, COLOURS.text, 2);
    label(ctx, nm ? `${+(len / FT_PER_NM).toFixed(2)} NM` : `${len.toLocaleString('en-CA')} ft`, sx + len * k + 8, sy + 4);
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(232, 241, 248, 0.75)';
    ctx.fillText(ESRI_IMAGERY.credit, Math.max(8, width - ctx.measureText(ESRI_IMAGERY.credit).width - 8), height - 6);
  }

  // ---- The profile ----
  function drawProfile(ctx, surface) {
    const { width, height } = surface.size;
    ctx.fillStyle = COLOURS.profileBg;
    ctx.fillRect(0, 0, width, height);
    const plan = state.plan;
    if (!plan) return;
    if (plan.kind === 'aar') {
      drawRefuelProfile(ctx, width, height, plan);
      return;
    }
    const pass = passFor(state.pass, plan);
    const tl = pass?.flight.timeline;
    const { u } = plan;
    const g0 = plan.groundFt;
    const alongOf = (x, y) => x * u.x + y * u.y;
    const ev = pass?.flight.events ?? {};

    // What the line shows: close round the target, the release to the impact, or the whole run-in.
    const relAlong = plan.release?.along ?? 0;
    const impact = pass?.fall?.impact;
    const impactAlong = impact ? alongOf(impact.x, impact.y) : 0;
    let x0;
    let x1;
    if (state.zoom === 'target') {
      const half = Math.max(500, plan.sizes.sizeFt * 0.45);
      x0 = Math.min(0, impactAlong) - half;
      x1 = Math.max(0, impactAlong) + half * 0.7;
    } else if (state.zoom === 'whole') {
      x0 = -plan.ipFt * 1.06;
      x1 = 0.8 * FT_PER_NM;
      if (tl) {
        for (let i = indexAt(tl, ev.ip ?? 0); i < tl.t.length; i += 10) x1 = Math.max(x1, Math.min(alongOf(tl.x[i], tl.y[i]), 3 * FT_PER_NM));
      }
    } else {
      const ends = [relAlong, 0, impactAlong];
      if (plan.dive) ends.push(plan.dive.R.x * u.x + plan.dive.R.y * u.y);
      x0 = Math.min(...ends) - 500;
      x1 = Math.max(...ends) + 700;
      if (x1 - x0 < 2500) {
        const c = (x0 + x1) / 2;
        x0 = c - 1250;
        x1 = c + 1250;
      }
    }
    // Heights in range: the flight inside the span, the target's top and the ground under the line.
    const key = `${plan.setup.target.id}|${Math.round(x0)}|${Math.round(x1)}|${g0}|${plan.groundAt(0, 0)}`;
    if (groundKept.key !== key || groundKept.plan !== plan) {
      const pts = [];
      for (let i = 0; i <= 160; i++) {
        const s = x0 + ((x1 - x0) * i) / 160;
        pts.push({ s, agl: plan.groundAt(u.x * s, u.y * s) - g0 });
      }
      groundKept = { key, plan, pts };
    }
    const groundPts = groundKept.pts;
    let yMax = Math.max(400, plan.sizes.topFt * 1.3);
    let yMin = Math.min(0, ...groundPts.map((p) => p.agl));
    const inSpan = (s) => s >= x0 && s <= x1;
    const releaseAgl = (plan.release?.point?.z ?? plan.runInMsl) - g0;
    if (state.zoom === 'target') {
      yMax = Math.max(300, plan.sizes.topFt * 2.2); // close round the target: the escape climbs out of the top
    } else if (state.zoom === 'near') {
      yMax = Math.max(yMax, releaseAgl * 1.15, (plan.dive ? plan.dive.rollInMsl - g0 : 0) * 0.6);
    } else if (tl) {
      for (let i = indexAt(tl, (ev.ip ?? 0) - 30); i < tl.t.length; i += 5) if (inSpan(alongOf(tl.x[i], tl.y[i]))) yMax = Math.max(yMax, tl.z[i] - g0);
    } else {
      yMax = Math.max(yMax, plan.runInMsl - g0);
    }
    yMax = Math.max(yMax, ...groundPts.map((p) => p.agl)) * 1.12;
    yMin -= (yMax - yMin) * 0.04;
    const L = 58;
    const R = 14;
    const T = 14;
    const B = 38;
    const X = (s) => L + ((s - x0) / (x1 - x0)) * (width - L - R);
    const Y = (agl) => T + (1 - (agl - yMin) / (yMax - yMin)) * (height - T - B);

    // The axes: heights in ft AGL up the side, distance from the target along the bottom (NM for the whole run-in).
    ctx.font = FONT;
    ctx.lineWidth = 1;
    const yStep = niceStep((yMax - yMin) / 5);
    for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
      ctx.strokeStyle = 'rgba(232, 241, 248, 0.08)';
      ctx.beginPath();
      ctx.moveTo(L, Y(y));
      ctx.lineTo(width - R, Y(y));
      ctx.stroke();
      ctx.fillStyle = COLOURS.axis;
      const words = (Math.abs(y) < 1e-6 ? 0 : y).toLocaleString('en-CA');
      ctx.fillText(words, L - 6 - ctx.measureText(words).width, Y(y) + 4);
    }
    const nm = x1 - x0 > 1.5 * FT_PER_NM;
    const xStep = nm ? niceStep((x1 - x0) / FT_PER_NM / 6) * FT_PER_NM : niceStep((x1 - x0) / 6);
    for (let s = Math.ceil(x0 / xStep) * xStep; s <= x1; s += xStep) {
      ctx.strokeStyle = 'rgba(232, 241, 248, 0.08)';
      ctx.beginPath();
      ctx.moveTo(X(s), T);
      ctx.lineTo(X(s), height - B);
      ctx.stroke();
      const d = Math.abs(s) < 1 ? 0 : Math.abs(s);
      const words = d === 0 ? 'target' : nm ? `${+(d / FT_PER_NM).toFixed(1)}` : d.toLocaleString('en-CA');
      ctx.fillStyle = COLOURS.axis;
      ctx.fillText(words, X(s) - ctx.measureText(words).width / 2, height - B + 15);
    }
    ctx.fillStyle = COLOURS.axis;
    ctx.fillText(`Distance from the target, ${nm ? 'NM' : 'ft'} (flying left to right)`, L, height - 6);
    ctx.save();
    ctx.translate(13, T + (height - T - B) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('ft AGL', -18, 0);
    ctx.restore();
    const across = (width - L - R) / (x1 - x0);
    const up = (height - T - B) / (yMax - yMin);
    if (up / across > 1.5) {
      const words = `heights ×${Math.round(up / across)} against distance`;
      ctx.fillText(words, width - R - ctx.measureText(words).width, height - 6);
    }

    // The ground under the line, and the target cut where the line crosses it (RS-13).
    ctx.beginPath();
    ctx.moveTo(X(x0), height - B);
    for (const p of groundPts) ctx.lineTo(X(p.s), Y(p.agl));
    ctx.lineTo(X(x1), height - B);
    ctx.closePath();
    ctx.fillStyle = COLOURS.terrain;
    ctx.fill();
    ctx.strokeStyle = COLOURS.terrainLine;
    ctx.beginPath();
    groundPts.forEach((p, i) => (i ? ctx.lineTo(X(p.s), Y(p.agl)) : ctx.moveTo(X(p.s), Y(p.agl))));
    ctx.stroke();
    const t = plan.setup.target;
    const cuts = targetCut(t.id, t.sizeFt, t.headingDegT, { x: 0, y: 0 }, { x: u.x, y: u.y });
    for (const c of cuts) {
      const xa = X(c.from);
      const xb = Math.max(X(c.to), xa + 1.5);
      ctx.fillStyle = COLOURS.solid;
      ctx.fillRect(xa, Y(c.topFt), xb - xa, Math.max(3, Y(c.bottomFt) - Y(c.topFt)));
    }
    const deck = cuts.find((c) => c.words === 'deck');
    // The target's words go in the header line, clear of the drawing (the grey is the only solid drawn).
    const cutWords = deck ? ` · grey: the deck, ${ft10(deck.topFt)} up, ${ft10(deck.to - deck.from)} across on this line${cuts.some((c) => c.words === 'tower') ? ', and a tower' : ''}`
      : cuts.length ? ` · grey: the ${t.id === 'stadium' ? 'stands' : 'tower'}, ${ft10(cuts[0].topFt)} high on this line` : '';
    if (cutNote.textContent !== cutWords) cutNote.textContent = cutWords;
    // The aim point.
    ctx.strokeStyle = COLOURS.target;
    ctx.beginPath();
    ctx.moveTo(X(0) - 5, Y(plan.sizes.aimFt));
    ctx.lineTo(X(0) + 5, Y(plan.sizes.aimFt));
    ctx.moveTo(X(0), Y(plan.sizes.aimFt) - 5);
    ctx.lineTo(X(0), Y(plan.sizes.aimFt) + 5);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(L, 0, width - L - R, height - B);
    ctx.clip();
    const path = (pts, colour, width2 = 2, dash = []) => {
      if (pts.length < 2) return;
      halo(ctx, () => {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(X(p.s), Y(p.agl)) : ctx.moveTo(X(p.s), Y(p.agl))));
      }, colour, width2, dash);
    };
    const dot = (p, colour, r = 4.5) => {
      ctx.fillStyle = COLOURS.halo;
      ctx.beginPath();
      ctx.arc(X(p.s), Y(p.agl), r + 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(X(p.s), Y(p.agl), r, 0, Math.PI * 2);
      ctx.fill();
    };
    // The dive line, and the planned release point (hollow).
    if (plan.dive) {
      const { R: Rp, aimOff, rollInMsl, d } = plan.dive;
      const back = (rollInMsl - Rp.z) / -d.z;
      path([{ s: alongOf(Rp.x - d.x * back, Rp.y - d.y * back), agl: rollInMsl - g0 }, { s: alongOf(aimOff.x, aimOff.y), agl: 0 }], COLOURS.runIn, 1.5, [5, 4]);
    }
    if (plan.release?.point) {
      const p = { s: alongOf(plan.release.point.x, plan.release.point.y), agl: plan.release.point.z - g0 };
      ctx.strokeStyle = COLOURS.release;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X(p.s), Y(p.agl), 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    // The flight: from a little before the IP, faint whole, bright to now, the escape in green; the load's fall.
    if (tl) {
      const end = indexAt(tl, state.t);
      const relT = pass.flight.release?.t ?? Infinity;
      const from = indexAt(tl, Math.max(0, (ev.ip ?? 0) - 30));
      const all = [];
      const before = [];
      const after = [];
      for (let i = from; i < tl.t.length; i += 4) {
        const p = { s: alongOf(tl.x[i], tl.y[i]), agl: tl.z[i] - g0 };
        all.push(p);
        if (i > end) continue;
        (tl.t[i] <= relT ? before : after).push(p);
      }
      const here = { s: alongOf(tl.x[end], tl.y[end]), agl: tl.z[end] - g0 };
      if (end >= from) (tl.t[end] <= relT ? before : after).push(here);
      path(all, COLOURS.faint, 1.5);
      path(before, COLOURS.runIn, 2);
      if (after.length) path([before[before.length - 1] ?? after[0], ...after], COLOURS.escape, 2);
      const rel = pass.flight.release;
      if (rel && state.t >= rel.t) {
        const p = { s: alongOf(rel.state.x, rel.state.y), agl: rel.state.z - g0 };
        dot(p, COLOURS.release);
        label(ctx, `Release ${ft10(p.agl)}`, X(p.s) + 9, Y(p.agl) - 8, COLOURS.release);
        const fall = pass.fall;
        if (fall) {
          const since = state.t - rel.t;
          path(fall.path.filter((q) => q.t <= since).map((q) => ({ s: alongOf(q.x, q.y), agl: q.z - g0 })), COLOURS.load, 2);
          if (fall.impact && since >= fall.impact.t) {
            const q = { s: alongOf(fall.impact.x, fall.impact.y), agl: fall.impact.z - g0 };
            dot(q, COLOURS.release, 4);
            const words = fall.deck?.on ? 'On the deck' : fall.deck?.miss ? `Ground, missed the deck ${ft10(fall.deck.miss.ft)} ${fall.deck.miss.words}` : 'Impact';
            label(ctx, words, X(q.s) + 8, Y(q.agl) + (fall.deck?.on ? -8 : -24), COLOURS.release);
          }
        }
      }
      // The lowest point after the IP, labelled once the aircraft has passed it.
      const low = pass.result.lowest;
      if (low && Number.isFinite(low.agl) && state.t >= low.t) {
        const i = indexAt(tl, low.t);
        const p = { s: alongOf(tl.x[i], tl.y[i]), agl: tl.z[i] - g0 };
        if (inSpan(p.s)) label(ctx, `Lowest ${ft10(low.agl)} AGL`, X(p.s) + 8, Y(p.agl) + 18, COLOURS.escape);
      }
      if (inSpan(here.s)) {
        dot(here, '#ffffff', 4);
        label(ctx, `${ft10(here.agl)} AGL`, X(here.s) + 8, Y(here.agl) - 8);
      }
    } else {
      label(ctx, `Run-in ${ft10(plan.runInMsl - g0)} AGL`, L + 8, Y(plan.runInMsl - g0) - 6, COLOURS.runIn);
      path([{ s: x0, agl: plan.runInMsl - g0 }, { s: Math.min(x1, relAlong), agl: plan.runInMsl - g0 }], COLOURS.runIn, 1.5, [5, 4]);
    }
    ctx.restore();
  }

  /**
   * The refuelling run's profile: along the refuelling track (heights MSL against distance from the roll-out point; the
   * whole rendezvous or the join) or behind the tanker (the receiver's height against the tanker's, and its distance
   * behind the tanker's wing line, from the roll-out on).
   */
  function drawRefuelProfile(ctx, width, height, plan) {
    const pass = passFor(state.pass, plan);
    const tl = pass?.flight.timeline;
    const tt = pass?.tanker;
    const { u } = plan;
    const alongOf = (x, y) => x * u.x + y * u.y;
    const behind = state.zoom === 'target';
    const down = (DROGUE.hoseDownDeg * Math.PI) / 180;
    const basket = { s: DROGUE.podTailAheadFt - DROGUE.hoseFt * Math.cos(down), z: DROGUE.podUpFt - DROGUE.hoseFt * Math.sin(down) };
    const pre = { s: basket.s - plan.aar.preContactFt - RECEIVER.noseAheadFt, z: basket.z };
    const roT = pass?.flight.events.rollOut ?? Infinity;
    const end = tl ? indexAt(tl, state.t) : 0;
    // The points: { s, z } for each aircraft over the span shown.
    const rcv = [];
    const tkr = [];
    let from = 0;
    if (tl) {
      from = behind || state.zoom === 'near' ? indexAt(tl, Number.isFinite(roT) ? roT : 0) : 0;
      for (let i = from; i < tl.t.length; i += 4) {
        if (behind) {
          const v = Math.hypot(tt.vx[i], tt.vy[i]) || 1;
          rcv.push({ i, s: ((tl.x[i] - tt.x[i]) * tt.vx[i] + (tl.y[i] - tt.y[i]) * tt.vy[i]) / v, z: tl.z[i] - tt.z[i] });
        } else {
          rcv.push({ i, s: alongOf(tl.x[i], tl.y[i]), z: tl.z[i] });
          tkr.push({ i, s: alongOf(tt.x[i], tt.y[i]), z: tt.z[i] });
        }
      }
    }
    let x0;
    let x1;
    let yMin;
    let yMax;
    if (behind) {
      x0 = Math.min(pre.s - 200, ...rcv.map((p) => p.s)) - 100;
      x1 = 150;
      yMin = Math.min(-plan.aar.splitFt, ...rcv.map((p) => p.z)) - 150;
      yMax = 120;
    } else {
      const ss = [...rcv, ...tkr].map((p) => p.s);
      x0 = ss.length ? Math.min(...ss) : plan.startAlong ?? -(plan.trailFt + 10 * FT_PER_NM);
      x1 = ss.length ? Math.max(...ss) : 2 * FT_PER_NM;
      const pad = (x1 - x0) * 0.04 + 500;
      x0 -= pad;
      x1 += pad;
      // The whole rendezvous from the take-off (RS-19) reaches down to the runway; the join stays near the two heights.
      yMin = state.zoom === 'whole' && rcv.length ? Math.min(plan.Hr - 400, ...rcv.map((p) => p.z)) - 200 : plan.Hr - 400;
      yMax = plan.H + 300;
    }
    const L = 64;
    const R = 14;
    const T = 14;
    const B = 38;
    const X = (sv) => L + ((sv - x0) / (x1 - x0)) * (width - L - R);
    const Y = (z) => T + (1 - (z - yMin) / (yMax - yMin)) * (height - T - B);
    // The axes.
    ctx.font = FONT;
    ctx.lineWidth = 1;
    const yStep = niceStep((yMax - yMin) / 5);
    for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
      ctx.strokeStyle = 'rgba(232, 241, 248, 0.08)';
      ctx.beginPath();
      ctx.moveTo(L, Y(y));
      ctx.lineTo(width - R, Y(y));
      ctx.stroke();
      ctx.fillStyle = COLOURS.axis;
      const words = (Math.abs(y) < 1e-6 ? 0 : y).toLocaleString('en-CA');
      ctx.fillText(words, L - 6 - ctx.measureText(words).width, Y(y) + 4);
    }
    const nmAxis = x1 - x0 > 1.5 * FT_PER_NM;
    const xStep = nmAxis ? niceStep((x1 - x0) / FT_PER_NM / 6) * FT_PER_NM : niceStep((x1 - x0) / 6);
    for (let sv = Math.ceil(x0 / xStep) * xStep; sv <= x1; sv += xStep) {
      ctx.strokeStyle = 'rgba(232, 241, 248, 0.08)';
      ctx.beginPath();
      ctx.moveTo(X(sv), T);
      ctx.lineTo(X(sv), height - B);
      ctx.stroke();
      const d = Math.abs(sv) < 1 ? 0 : sv;
      const words = nmAxis ? `${+(d / FT_PER_NM).toFixed(1)}` : d.toLocaleString('en-CA');
      ctx.fillStyle = COLOURS.axis;
      ctx.fillText(words, X(sv) - ctx.measureText(words).width / 2, height - B + 15);
    }
    ctx.fillStyle = COLOURS.axis;
    ctx.fillText(behind ? 'Ahead (+) or behind (−) the tanker\'s wing line, ft' : `Along the refuelling track from the roll-out point, ${nmAxis ? 'NM' : 'ft'} (flying left to right)`, L, height - 6);
    ctx.save();
    ctx.translate(13, T + (height - T - B) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(behind ? 'ft from the tanker' : 'ft MSL', -30, 0);
    ctx.restore();
    const across = (width - L - R) / (x1 - x0);
    const up = (height - T - B) / (yMax - yMin);
    if (up / across > 1.5) {
      const words = `heights ×${Math.round(up / across)} against distance`;
      ctx.fillText(words, width - R - ctx.measureText(words).width, height - 6);
    }
    const title = behind ? 'Profile behind the tanker: the stand-in receiver from the roll-out on (the tanker fixed at 0)' : `Profile along the refuelling track: both aircraft (heights MSL${state.zoom === 'whole' ? ', from the take-off' : '; the ground is far below'})`;
    if (profTitle.firstChild.textContent !== title) profTitle.firstChild.textContent = title;
    if (cutNote.textContent) cutNote.textContent = '';

    ctx.save();
    ctx.beginPath();
    ctx.rect(L, 0, width - L - R, height - B);
    ctx.clip();
    const path = (pts, colour, w = 2, dash = []) => {
      if (pts.length < 2) return;
      halo(ctx, () => {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(X(p.s), Y(p.z)) : ctx.moveTo(X(p.s), Y(p.z))));
      }, colour, w, dash);
    };
    const dot = (p, colour, r = 4.5) => {
      ctx.fillStyle = COLOURS.halo;
      ctx.beginPath();
      ctx.arc(X(p.s), Y(p.z), r + 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(X(p.s), Y(p.z), r, 0, Math.PI * 2);
      ctx.fill();
    };
    if (behind) {
      // The tanker at 0 with its wing line, the hose to the basket, and the pre-contact point.
      path([{ s: 0, z: yMin }, { s: 0, z: yMax }], COLOURS.axis, 1, [4, 4]);
      dot({ s: 0, z: 0 }, COLOURS.tanker, 6);
      label(ctx, 'KC-130J · its wing line', X(0) - 150, Y(0) - 10, COLOURS.tanker);
      path([{ s: DROGUE.podTailAheadFt, z: DROGUE.podUpFt }, basket], COLOURS.tanker, 1.5);
      dot(basket, COLOURS.release, 3.5);
      ctx.strokeStyle = COLOURS.target;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X(pre.s), Y(pre.z), 7, 0, Math.PI * 2);
      ctx.stroke();
      label(ctx, 'Pre-contact', X(pre.s) - 40, Y(pre.z) + 22);
    } else {
      label(ctx, `Tanker ${(Math.round(plan.H / 10) * 10).toLocaleString('en-CA')} ft MSL`, L + 8, Y(plan.H) - 8, COLOURS.tanker);
      if (!tl) path([{ s: x0, z: plan.H }, { s: x1, z: plan.H }], COLOURS.tanker, 1.5, [5, 4]);
    }
    if (tl) {
      const split = (pts) => {
        const now = pts.filter((p) => p.i <= end);
        return { before: now.filter((p) => tl.t[p.i] <= roT), after: now.filter((p) => tl.t[p.i] > roT) };
      };
      path(rcv, COLOURS.faint, 1.5);
      if (tkr.length) {
        path(tkr, 'rgba(255, 159, 67, 0.35)', 1.5);
        path(tkr.filter((p) => p.i <= end), COLOURS.tanker, 2);
      }
      const { before, after } = split(rcv);
      path(before, COLOURS.runIn, 2);
      if (after.length) path([before[before.length - 1] ?? after[0], ...after], COLOURS.escape, 2);
      const nowR = rcv.filter((p) => p.i <= end).pop();
      if (nowR && end >= from) {
        dot(nowR, '#ffffff', 4);
        label(ctx, behind ? `${ft10(-nowR.s)} behind, ${ft10(Math.abs(nowR.z))} ${nowR.z < 0 ? 'below' : 'above'}` : `Receiver ${ft10(nowR.z)}`, X(nowR.s) + 8, Y(nowR.z) + 18);
      }
      const nowT = tkr.filter((p) => p.i <= end).pop();
      if (nowT) dot(nowT, COLOURS.tanker, 4);
    }
    ctx.restore();
  }

  const planView = createCanvasView(planCanvas, { timers, draw: drawPlan, minSpan: 400, maxSpan: 120 * FT_PER_NM /* room for the refuelling run from CYMJ to its anchor, RS-19 */, label: 'Plan of the pass on the satellite map, north up, at true scale. Drag to pan, the wheel or + and - to zoom.' });
  const profile = createCanvasSurface(profCanvas, { timers, draw: drawProfile, label: 'Profile of the pass along the run-in through the aim point: height above the target\'s ground against distance from the target.' });

  function fit() {
    const plan = state.plan;
    if (!plan || !shown) return;
    const aar = refuelOutline(plan);
    const pts = aar ? [...aar.anchor, ...aar.track, ...(aar.runway ? [aar.runway.a, aar.runway.b] : [])] : [{ x: 0, y: 0 }, plan.ip, ...orbitOutline(plan).flat()];
    const shownPass = passFor(state.pass, plan);
    const tl = shownPass?.flight.timeline;
    if (tl) for (let i = 0; i < tl.t.length; i += 40) pts.push({ x: tl.x[i], y: tl.y[i] });
    const tt = shownPass?.tanker;
    if (tt) for (let i = 0; i < tt.x.length; i += 40) pts.push({ x: tt.x[i], y: tt.y[i] });
    const size = aar ? 500 : Math.max(plan.sizes.sizeFt, 500);
    pts.push({ x: -size, y: -size }, { x: size, y: size });
    planView.fit({ minX: Math.min(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)), maxX: Math.max(...pts.map((p) => p.x)), maxY: Math.max(...pts.map((p) => p.y)) }, 28);
    needFit = false;
  }
  const onFit = () => fit();
  fitBtn.addEventListener('click', onFit);
  zoom.set(state.zoom);
  zoomAar.set(state.zoom);
  zoomAar.element.hidden = true;

  return {
    element,
    /** The plan (pass.js buildPlan's), the pass shown, the time in it, the wind's words and the profile's zoom. */
    set(next) {
      if (next.pass && next.pass !== state.pass) needFit = true; // a new pass: the view fits it once
      if ('plan' in next && !state.plan && next.plan) needFit = true;
      state = { ...state, ...next };
      if (next.zoom) {
        zoom.set(next.zoom);
        zoomAar.set(next.zoom);
      }
      // The refuelling run has its own profile spans and title (RS-18); the run-in's come back with its plan.
      const aar = state.plan?.kind === 'aar';
      zoom.element.hidden = aar;
      zoomAar.element.hidden = !aar;
      if (!aar && profTitle.firstChild.textContent !== RUN_IN_TITLE) profTitle.firstChild.textContent = RUN_IN_TITLE;
      if (!shown) return;
      if (needFit) fit();
      planView.requestDraw();
      profile.requestDraw();
    },
    /** Shows or hides the 2D view; shown, it is measured and drawn on the next moment. */
    show(on) {
      shown = on;
      element.hidden = !on;
      if (!on) return;
      timers.after(30, () => {
        profile.measure();
        if (needFit) fit();
        planView.requestDraw();
        profile.requestDraw();
      });
    },
    /** A new place: the plan fits again. */
    refit() {
      needFit = true;
      if (shown) fit();
    },
    dispose() {
      fitBtn.removeEventListener('click', onFit);
      planView.dispose();
      profile.dispose();
      tiles.dispose();
    },
  };
}
