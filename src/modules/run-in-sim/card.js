// The result card (spec, "Right: the result"): one card per pass flown, the latest selected. It leads with the line that
// matters for the run (the miss for a drop, or over the bridge whether it landed on the deck or fell past it underneath,
// RS-12; the time over target for a flyover), then the release against the plan, the
// escape flagged against its references (RS-6: flags, never walls) and the time on each leg, and plain words for anything
// the pass could not do as set. Only the selected card shows the detail (house rules). Text only, through h().
import { h } from '../../ui-kit/dom.js';
import { clock, REFERENCES } from './pass.js';
import { runOf } from './defaults.js';

const ft10 = (n) => `${(Math.round(n / 10) * 10).toLocaleString('en-CA')} ft`;
const kt = (n) => `${Math.round(n)} KIAS`;

/** "2 s late", "3 s early" or "on time" (within half a second). */
export function lateWords(lateSec) {
  if (lateSec === null || !Number.isFinite(lateSec)) return 'no time over target';
  if (Math.abs(lateSec) < 0.5) return 'on time';
  return `${Math.round(Math.abs(lateSec))} s ${lateSec > 0 ? 'late' : 'early'}`;
}

/** The card's lead line for a pass. */
export function headline(pass) {
  const r = pass.result;
  if (pass.plan.run === 'flyover') {
    if (r.overTopFt === null) return 'Never passed the target';
    const t = lateWords(r.lateSec);
    return `${t[0].toUpperCase()}${t.slice(1)}, ${ft10(r.overTopFt)} over the top`;
  }
  if (!pass.flight.release) return 'No release';
  if (!r.landed) return 'Did not land';
  if (r.deck?.on) return r.miss.missFt < 5 ? 'On the deck, on the aim point' : `On the deck, ${ft10(r.miss.missFt)} from the aim point`;
  if (r.deck?.miss) return `Under the bridge: missed the deck by ${ft10(r.deck.miss.ft)} ${r.deck.miss.words}`;
  return r.miss.missFt < 5 ? 'On the aim point' : `Miss ${ft10(r.miss.missFt)} at ${r.miss.clock} o'clock`;
}

const tagOf = (over, okWords, overWords) => h('span', { class: `rs-tag ${over ? 'is-over' : 'is-ok'}` }, over ? overWords : okWords);
const row = (label, value, extra = null) => h('div', { class: 'rs-row' }, h('span', {}, label), h('span', { class: 'rs-val' }, value, extra));

/**
 * One card. n: the pass's number; selected: whether it shows the detail; onSelect(): a click on it; showFlags: the
 * Display box's switch for the flags' tags.
 */
export function cardFor(pass, n, { selected, onSelect, showFlags = true }) {
  const r = pass.result;
  const plan = pass.plan;
  const runLabel = runOf(plan.run).label;
  const flags = Object.fromEntries(r.flags.map((f) => [f.id, f]));
  const sub = plan.run === 'flyover'
    ? (r.abeamFt !== null && r.abeamFt > 50 ? `Passed ${ft10(r.abeamFt)} abeam the aim point` : 'Over the aim point')
    : !pass.flight.release ? 'The words below say why'
      : r.deck && !r.deck.on && r.miss ? `Hit the ground ${ft10(r.miss.missFt)} from the aim point at ${r.miss.clock} o'clock`
        : (r.planned.atCarp ? 'Released at the worked-out point (CARP)' : 'Released as set by hand');
  const head = h('button', { type: 'button', class: 'rs-card-head', 'aria-pressed': String(selected) },
    h('span', { class: 'rs-card-eyebrow' }, `Pass ${n} · ${runLabel} · ${plan.ac.shortName}`),
    h('span', { class: 'rs-card-lead' }, headline(pass)),
    h('span', { class: 'rs-card-sub' }, sub));
  head.addEventListener('click', onSelect);
  const card = h('article', { class: `rs-card${selected ? ' is-selected' : ''}` }, head);
  if (!selected) return card;

  const tag = (...a) => (showFlags ? tagOf(...a) : null);
  const rel = r.release;
  const unknown = !r.lowest.known;
  const timing = h('div', { class: 'rs-block' },
    row('Time over target', `+${clock(pass.plan.setup.totSec)} · ${lateWords(r.lateSec)}`),
    rel ? row(plan.run === 'flyover' ? 'Over the target' : 'Release', `${ft10(rel.aglFt)} AGL · ${kt(rel.kias)}`) : null,
    rel && plan.run !== 'flyover' ? row('Planned', `${ft10(r.planned.aglFt)} AGL · ${kt(r.planned.kias)}`) : null,
    rel && plan.run === 'bombDive' ? row('Dive angle at release', `${Math.abs(rel.climbDeg).toFixed(1)}° (plan ${r.planned.diveDeg}°)`) : null,
    rel && plan.run === 'bombDive' ? row('Steady before release', `${r.steadySec.toFixed(1)} s`) : null,
    rel?.fallSec ? row('Load\'s fall', `${rel.fallSec.toFixed(1)} s`) : null,
    r.deck && !r.deck.on && rel ? row('Release', r.planned.atCarp ? 'at the worked-out point (CARP)' : 'as set by hand') : null,
    r.deck?.on ? row('On the deck', r.deck.edge ? 'its edge' : 'its top') : null);
  const ref = flags.lowest.over;
  const escape = h('div', { class: 'rs-block' },
    row(pass.flight.events.ip !== undefined ? 'Lowest after the IP' : 'Lowest in the pass', unknown ? 'unknown ground' : `${ft10(r.lowest.agl)} AGL`, unknown ? null : tag(ref, 'above 500', 'below 500')),
    row('Peak G', `${r.peakG.toFixed(1)} G`, tag(flags.peakG.over, `under ${pass.plan.ac.gLimit}`, `over ${pass.plan.ac.gLimit}`)),
    row('Closest to target', ft10(r.closestFt), flags.overTop ? tag(flags.overTop.over, 'above 1,000 over the top', 'under 1,000 over the top') : null),
    row('Lowest airspeed', kt(r.lowestKias), tag(flags.slow.over, 'above the shaker', 'near the stall')),
    flags.vmo.over ? row('Fastest', `over VMO by ${Math.round(r.overVmo)} kt`, tag(true, '', 'over VMO')) : null,
    flags.orbitBank ? row('Steepest bank in the orbit', `${Math.round(r.orbitBankDeg)}° (set ${plan.setup.orbit.bankDeg}°)`, tag(flags.orbitBank.over, `under ${REFERENCES.orbitBankDeg}°`, `over ${REFERENCES.orbitBankDeg}°`)) : null);
  const legs = h('div', { class: 'rs-block' }, h('div', { class: 'rs-block-title' }, 'Legs'), r.legs.map((l) => row(l.label, clock(l.sec))));
  card.append(timing, escape, legs);
  if (r.notes.length) card.append(h('ul', { class: 'rs-notes' }, r.notes.map((t) => h('li', {}, t))));
  return card;
}
