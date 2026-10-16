// Brief mode (docs/modules/nav-planner/spec.md, "Brief mode"; NP-11; Dad, 16 Oct 2026: "COuld this be a low level Briefing tool"): a
// full-screen page for briefing a room, the whole route first and then one leg at a time, with Next and Back (→ and ←; Esc closes). Each leg
// shows the run-in picture of the turn point it ends at, from the pilot's eye at the planned height RUN_IN_NM before it, looking along the leg,
// and the leg's numbers and hazards. The picture is the planner's one 3D view, moved into this page while it is open.
import { h, clear } from '../../ui-kit/dom.js';
import { pointAlong, mmss, hmmss, deg3, FIELD_FT } from './legs.js';

/** The run-in distance for the picture, NM before the turn point (estimate: a typical distance for picking up a turn point; NP-11). */
export const RUN_IN_NM = 1;
/** The ground round each pictured turn point: outer and inner squares across (NM; estimates that keep the picture sharp and the tiles few). */
const BRIEF_AREA_NM = Object.freeze({ outer: 40, inner: 6 });

const ftWords = (n) => `${(Math.round(n / 10) * 10).toLocaleString('en-CA')} ft`;

/** The words for a leg's clearance (shared with the legs table). */
export function clearanceWords(leg, minFt) {
  const c = leg.clearance;
  const flag = c.low ? ' [LOW]' : '';
  if (leg.heightRef === 'AGL') return `${ftWords(c.ft)} (contouring at ${leg.heightFt} ft AGL)${flag}${c.low ? `, below the ${minFt} ft minimum` : ''}`;
  if (c.ft === null) return c.status === 'loading' ? 'loading the terrain…' : 'unknown (terrain tiles missing)';
  return `${c.atMost ? 'at most ' : ''}${ftWords(c.ft)}${flag}${c.low ? `, below the ${minFt} ft minimum` : ''}`;
}

/**
 * Opens Brief mode over the page. options:
 * - data(): { route, legs, totals, settings, windWords } as they stand.
 * - world(): the 3D view (world3d.js) or null; stage: the element holding its canvas, moved into this page and back.
 * - groundAt(lat, lon): the ground's height (ft, NaN unknown) for the eye's height.
 * - onClose(): after the page closes and the stage is back.
 * Returns { element, next(), back(), close(), isOpen() }.
 */
export function openBrief({ data, world, stage, groundAt, onClose }) {
  const home = { parent: stage.parentNode, next: stage.nextSibling };
  const picture = h('div', { class: 'np-brief-picture' });
  const facts = h('div', { class: 'np-brief-facts' });
  const counter = h('span', { class: 'np-brief-count' });
  const backBtn = h('button', { type: 'button', class: 'button', onclick: () => back() }, '← Back');
  const nextBtn = h('button', { type: 'button', class: 'button primary', onclick: () => next() }, 'Next →');
  const closeBtn = h('button', { type: 'button', class: 'button', onclick: () => close() }, 'Close (Esc)');
  const element = h('div', { class: 'np-brief', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Brief mode' },
    h('header', { class: 'np-brief-bar' }, h('h1', {}, 'Brief'), counter, h('span', { class: 'np-brief-note' }, 'Not for flight planning. Training only.'), backBtn, nextBtn, closeBtn),
    h('div', { class: 'np-brief-main' }, picture, facts));
  document.body.append(element);
  picture.append(stage);
  let page = 0;
  let open = true;

  const pages = () => 1 + data().legs.length;
  const eyeHeight = (leg, p) => {
    const g = groundAt(p.lat, p.lon);
    if (leg.heightRef === 'AGL') return (Number.isFinite(g) ? g : FIELD_FT) + leg.heightFt;
    return leg.heightFt;
  };

  function row(label, value, cls = '') {
    return h('div', { class: `np-brief-row ${cls}` }, h('span', {}, label), h('b', {}, value));
  }

  function show() {
    const { route, legs, totals, settings, windWords } = data();
    page = Math.max(0, Math.min(pages() - 1, page));
    counter.textContent = page === 0 ? `Route · ${pages() - 1} legs` : `Leg ${page} of ${legs.length}`;
    backBtn.disabled = page === 0;
    nextBtn.disabled = page >= pages() - 1;
    clear(facts);
    const w = world();
    if (page === 0) {
      facts.append(
        h('h2', {}, route.name),
        row('Turn points', `${route.points.length}`),
        row('Distance', `${totals.distNm.toFixed(1)} NM`),
        row('Time', `${hmmss(totals.timeS)}${totals.complete ? '' : ' (incomplete)'}`),
        row('Fuel used', `${Math.round(totals.fuelUsedLb)} lb of ${settings.startFuelLb} lb (estimates)`),
        row('Fuel at the end', `${Math.round(totals.fuelRemLb)} lb`),
        row('Wind', windWords),
        row('Legs below the minimum', `${legs.filter((l) => l.clearance.low).length} (minimum ${settings.minClearanceFt} ft, estimate)`),
        h('p', { class: 'np-brief-hint' }, 'Next (→) steps through the legs; each shows the run-in to its turn point as the pilot sees it.'),
        h('p', { class: 'np-brief-hint' }, 'Obstacles: not shown (no Canadian obstacle data). Terrain clearance and fuel are estimates.'));
      if (w && legs.length) {
        const first = legs[0];
        const a = route.points[0];
        w.setArea(route.points.reduce((m, p, _i, all) => ({ lat: m.lat + p.lat / all.length, lon: m.lon + p.lon / all.length }), { lat: 0, lon: 0 }), 120, 30);
        w.setAircraft({ lat: a.lat, lon: a.lon, altFt: eyeHeight(first, a), headingDegT: first.trackDegT });
        w.chase(60000, 40);
      }
    } else {
      const leg = legs[page - 1];
      const a = route.points[leg.i];
      const b = route.points[leg.i + 1];
      const c = leg.clearance;
      facts.append(
        h('h2', {}, `${leg.i + 1} ${leg.from} → ${leg.i + 2} ${leg.to}`),
        row('Heading', `${deg3(leg.headingDegM)}°M`),
        row('Track', `${deg3(leg.trackDegM)}°M (${deg3(leg.trackDegT)}°T)`),
        row('Distance', `${leg.distNm.toFixed(1)} NM`),
        row('Time', `${mmss(leg.timeS)} (running ${hmmss(leg.runS)})`),
        row('Ground speed', Number.isFinite(leg.timeS) ? `${Math.round(leg.gsKt)} kt at ${leg.kias} KIAS` : `[NO TRACK] at ${leg.kias} KIAS`),
        row('Height', `${leg.heightFt.toLocaleString('en-CA')} ft ${leg.heightRef}`),
        row('Wind', leg.wind ? `${deg3(leg.wind.fromDegT)}°T/${Math.round(leg.wind.kt)} kt` : (leg.windNote || 'still air')),
        row('Fuel at the turn point', `${Math.round(leg.fuelRemLb)} lb (estimate)`),
        h('h3', {}, 'Hazards'),
        row('Lowest clearance', clearanceWords(leg, settings.minClearanceFt), c.low ? 'is-low' : c.ft === null && leg.heightRef === 'MSL' ? 'is-unknown' : ''),
        row('Highest ground', Number.isFinite(c.highestFt) ? `${ftWords(c.highestFt)} MSL` : 'unknown'),
        row('Obstacles', 'not shown (no Canadian obstacle data)'),
        h('p', { class: 'np-brief-hint' }, `The picture: the run-in to ${leg.to}, ${RUN_IN_NM} NM out at the planned height, looking along the leg.`));
      if (w) {
        const f = Math.max(0, 1 - RUN_IN_NM / Math.max(leg.distNm, 1e-6));
        const from = pointAlong(a, b, f);
        const g = groundAt(b.lat, b.lon);
        w.setArea({ lat: b.lat, lon: b.lon }, BRIEF_AREA_NM.outer, BRIEF_AREA_NM.inner);
        w.setAircraft(null);
        w.eye({ ...from, altFt: eyeHeight(leg, from) }, { lat: b.lat, lon: b.lon, altFt: Number.isFinite(g) ? g : FIELD_FT });
      }
    }
    if (!w) picture.append(h('p', { class: 'np-3d-note' }, 'No 3D picture in this browser.'));
    w?.redraw();
  }

  function next() {
    if (page < pages() - 1) {
      page += 1;
      show();
    }
  }
  function back() {
    if (page > 0) {
      page -= 1;
      show();
    }
  }
  function close() {
    if (!open) return;
    open = false;
    home.parent.insertBefore(stage, home.next);
    element.remove();
    onClose();
  }
  show();
  nextBtn.focus();
  return { element, next, back, close, isOpen: () => open, refresh: show };
}
