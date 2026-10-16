// The route card (docs/modules/nav-planner/spec.md, "Route card"): one printed page, through the browser's print dialog. Shown only when
// printing (nav-planner.css, @media print); everything goes in as text.
import { h } from '../../ui-kit/dom.js';
import { mmss, hmmss, deg3 } from './legs.js';

/** The card's element for the route as it stands. windWords: the wind used, in words. */
export function buildCard({ route, legs, totals, settings, windWords, now = new Date() }) {
  const clr = (leg) => {
    const c = leg.clearance;
    if (leg.heightRef === 'AGL') return `${c.ft}${c.low ? ' LOW' : ''}`;
    if (c.ft === null) return 'unknown';
    return `${c.atMost ? '≤' : ''}${Math.round(c.ft / 10) * 10}${c.low ? ' LOW' : ''}`;
  };
  const head = ['Leg', 'To', 'Hdg °M', 'Trk °M', 'NM', 'Height', 'KIAS', 'GS', 'Time', 'Run', 'Fuel rem', 'Clearance ft'];
  const rows = legs.map((l) => [
    `${l.i + 1}`, l.to, deg3(l.headingDegM), deg3(l.trackDegM), l.distNm.toFixed(1), `${l.heightFt} ${l.heightRef}`, `${l.kias}`,
    Number.isFinite(l.timeS) ? `${Math.round(l.gsKt)}` : 'NO TRACK', mmss(l.timeS), hmmss(l.runS), Number.isFinite(l.fuelRemLb) ? `${Math.round(l.fuelRemLb)}` : '—', clr(l),
  ]);
  return h('div', { class: 'np-card-page' },
    h('h1', {}, `Route card: ${route.name}`),
    h('p', {}, `Printed ${now.toISOString().slice(0, 16).replace('T', ' ')}Z · Start ${route.points[0]?.name ?? ''} · ${route.points.length} turn points · ${totals.distNm.toFixed(1)} NM · ${hmmss(totals.timeS)}${totals.complete ? '' : ' (incomplete)'}`),
    h('p', {}, `Wind: ${windWords} · Start fuel ${settings.startFuelLb} lb, flow ${settings.fuelFlowPph} lb/h (estimates) · Minimum clearance ${settings.minClearanceFt} ft (estimate)`),
    h('table', {},
      h('thead', {}, h('tr', {}, head.map((t) => h('th', {}, t)))),
      h('tbody', {}, rows.map((r, k) => h('tr', { class: legs[k].clearance.low ? 'is-low' : '' }, r.map((t) => h('td', {}, t)))))),
    h('p', { class: 'np-card-warn' }, 'NOT FOR FLIGHT PLANNING. Training only. Terrain clearance and fuel are estimates (terrain from about 30 m public tiles, centreline only). Obstacles not shown: no Canadian obstacle data. Headings and tracks °M with 9° E variation.'),
    h('p', { class: 'np-card-warn' }, 'Notes:'),
  );
}
