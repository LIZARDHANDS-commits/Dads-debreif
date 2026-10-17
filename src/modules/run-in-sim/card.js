// The result card (spec, "Right: the result"): one card per pass flown, the latest selected. It leads with the line that
// matters for the run (the miss for a drop, or over the bridge whether it landed on the deck or fell past it underneath,
// RS-12; the time over target for a flyover), then the release against the plan, the
// escape flagged against its references (RS-6: flags, never walls) and the time on each leg, and plain words for anything
// the pass could not do as set. Only the selected card shows the detail (house rules). Text only, through h().
import { h } from '../../ui-kit/dom.js';
import { clock, REFERENCES } from './pass.js';
import { runOf } from './defaults.js';
import { AAR_REFERENCES as AAR_REFS } from './refuel.js';
import { FT_PER_NM } from '../../core/units.js';
import { ANTHEMS } from './anthems.js';

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
    if (pass.anthem) {
      // RS-24: the anthem's last note is the time over target.
      const where = pass.plan.setup.target.id === 'stadium' ? 'the stadium' : 'the target';
      if (r.lateSec === null || !Number.isFinite(r.lateSec)) return `Over ${where}: no anthem timing`;
      if (Math.abs(r.lateSec) < 0.5) return `Over ${where} on the last note`;
      return `Over ${where} ${Math.round(Math.abs(r.lateSec))} s ${r.lateSec > 0 ? 'after' : 'before'} the last note`;
    }
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
  const an = pass.anthem ? ANTHEMS[pass.anthem.id] : null;
  const timing = h('div', { class: 'rs-block' },
    an ? row('Anthem', `${an.label}, ${clock(pass.anthem.lengthSec)}, started at +${clock(pass.anthem.startSec)} · ${pass.anthem.live ? 'pressed' : 'planned to end on the time over target'}`) : null,
    row(an ? 'Last note (time over target)' : 'Time over target', `+${clock(pass.plan.setup.totSec)} · ${lateWords(r.lateSec)}`),
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
  const notes = [...r.notes];
  if (pass.anthem?.live && r.lateSec !== null && r.lateSec >= 0.5 && Number.isFinite(r.arrivalSec)) {
    // RS-24: why a live press was late, in the flying's terms.
    notes.push(`From where it was when the anthem started (+${clock(pass.anthem.startSec)}), the soonest it could cross was ${Math.round(r.arrivalSec - pass.anthem.startSec)} s later: it has to finish the part of the orbit it has begun and fly the run-in, longer than the ${Math.round(pass.anthem.lengthSec)} s anthem. Choosing the anthem before flying times it from the start; timing by speed on the run-in is on the future list.`);
  }
  if (notes.length) card.append(h('ul', { class: 'rs-notes' }, notes.map((t) => h('li', {}, t))));
  return card;
}

// ---- The air refuelling run's card (spec "Air refuelling", "The result card"; RS-16, RS-17; approved:
// Patrick's yes, relayed by Dad, 17 Oct 2026). It leads with the trail at the tanker's roll-out against the plan, then the
// rendezvous as worked out, the roll-out, the join and its flags (RS-6: references, never walls), the tanker (a
// picture) and the stand-in receiver. Overtake and closure are the rate the range shrinks (ground against ground). ----

const nm1 = (ft) => `${(ft / FT_PER_NM).toFixed(1)} NM`;
/** The wind the offset and turn range were worked for (RS-21): "for 30 kt from 050°M at 10,000 ft", or "for calm air". */
export const workedForWords = (wind) => (!wind || wind.kt < 0.5 ? 'for calm air' : `for ${Math.round(wind.kt)} kt from ${String(Math.round(wind.fromDegM) % 360 || 360).padStart(3, '0')}°M at ${ft10(wind.atFt)}`);
const sideWords = (ft) => (Math.abs(ft) < 5 ? 'on the track' : `${ft10(Math.abs(ft))} ${ft > 0 ? 'right' : 'left'}`);

/** The refuelling card's lead line. */
export function refuelHeadline(pass) {
  const r = pass.result;
  if (!r.rollOut) return 'The tanker never rolled out';
  const t = r.rollOut.trailFt;
  if (t <= 0) return `Rolled out ${ft10(-t)} behind the receiver: an overrun`;
  return `Rolled out ${nm1(t)} ahead, plan ${nm1(r.plannedTrailFt)}`;
}

/** One card for an air refuelling pass; the same options as cardFor. */
export function refuelCardFor(pass, n, { selected, onSelect, showFlags = true }) {
  const r = pass.result;
  const plan = pass.plan;
  const w = r.worked;
  const flags = Object.fromEntries(r.flags.map((f) => [f.id, f]));
  const sub = r.stableSec !== null ? `Stabilised in pre-contact ${clock(r.stableSec)} after the roll-out` : 'Did not stabilise in pre-contact';
  const head = h('button', { type: 'button', class: 'rs-card-head', 'aria-pressed': String(selected) },
    h('span', { class: 'rs-card-eyebrow' }, `Pass ${n} · ${runOf(plan.run).label} · KC-130J and stand-in CT-156`),
    h('span', { class: 'rs-card-lead' }, refuelHeadline(pass)),
    h('span', { class: 'rs-card-sub' }, sub));
  head.addEventListener('click', onSelect);
  const card = h('article', { class: `rs-card${selected ? ' is-selected' : ''}` }, head);
  if (!selected) return card;

  const tag = (...a) => (showFlags ? tagOf(...a) : null);
  const kts = (k) => (k === null || !Number.isFinite(k) ? '--' : `${Math.round(k)} kt`);
  const set = (byHand) => (byHand ? 'set by hand' : 'set to hit');
  const late = r.lateSec === null ? '' : Math.abs(r.lateSec) < 0.5 ? ', on time' : ` (${lateWords(r.lateSec)})`;
  // RS-20 (Dad, 17 Oct 2026: "Giving turn range and offset would help too"): the turn range and the offset lead.
  const to = r.takeoff;
  const offsetWords = `${nm1(r.offsetFt)}, the tanker's inbound track ${r.offsetSide} of the receiver's · ${r.offsetByHand ? `set by hand (to hit: ${nm1(w.offsetFt)})` : 'set to hit'}`;
  const rv = h('div', { class: 'rs-block' }, h('div', { class: 'rs-block-title' }, 'The rendezvous (worked out to hit)'),
    row('Turn range', `${Number.isFinite(w.turnRangeNm) ? `${w.turnRangeNm.toFixed(1)} NM` : '--'}, the tanker turns at +${clock(w.tTurn)} · ${set(w.turnByHand)}`),
    row('Offset', offsetWords),
    row('Worked out', `${workedForWords(w.wind)}; the turn inbound flown at ${plan.aar.bankDeg}° in the air, drifting with the wind`),
    to ? row('Receiver takes off', to.liftOffSec === null ? 'never left the runway' : `CYMJ ${to.runway}, lifted off at +${clock(to.liftOffSec)}`) : null,
    to ? row('Receiver at the IP', to.ipSec === null ? 'never passed it' : `+${clock(to.ipSec)}${to.ipPlanSec !== null ? ` (plan +${clock(to.ipPlanSec)})` : ''}`) : null,
    r.orbitLaps !== null ? row('Tanker in its orbit before turning', `${r.orbitLaps.toFixed(1)} laps`) : null,
    row('Receiver', `${Math.round(w.rcvKiasFlown)} KIAS · ${set(w.rcvByHand)}`),
    to ? null : row('Receiver starts', `${w.startNm.toFixed(1)} NM back from the roll-out point`),
    row('Tanker rolls out', `+${clock(w.tRollOut)}${late}`));
  const ro = r.rollOut;
  const atRo = ro ? h('div', { class: 'rs-block' }, h('div', { class: 'rs-block-title' }, 'At the roll-out'),
    row('Trail', `${ro.trailFt >= 0 ? nm1(ro.trailFt) : `${ft10(-ro.trailFt)} ahead of the tanker`} (plan ${nm1(r.plannedTrailFt)})`),
    row('Across the track', sideWords(ro.acrossFt)),
    row('Below the tanker', ft10(ro.belowFt)),
    row('Overtake', kts(ro.overtakeKt))) : null;
  const end = r.endFromPre;
  const join = h('div', { class: 'rs-block' }, h('div', { class: 'rs-block-title' }, 'The join'),
    row('Peak closure', kts(r.peakClosureKt), tag(flags.closure.over, `under ${AAR_REFS.closureKt}`, `over ${AAR_REFS.closureKt}`)),
    row(`Closure inside ${AAR_REFS.nearFt} ft`, kts(r.nearClosureKt), r.nearClosureKt === null ? null : tag(flags.nearClosure.over, `under ${AAR_REFS.nearClosureKt}`, `over ${AAR_REFS.nearClosureKt}`)),
    row('Roll-out to pre-contact', r.toPreContactSec === null ? 'not reached' : clock(r.toPreContactSec)),
    row('Closest to the wing line', r.wingLineFt === null ? '--' : r.wingLineFt < 0 ? `${ft10(-r.wingLineFt)} behind` : `${ft10(r.wingLineFt)} ahead`, tag(flags.wingLine.over, 'behind it', 'ahead of it')),
    row('Ended from pre-contact', `${ft10(Math.abs(end.behindFt))} ${end.behindFt >= 0 ? 'behind' : 'past'} · ${sideWords(end.acrossFt)} · ${ft10(Math.abs(end.belowFt))} ${end.belowFt >= 0 ? 'below' : 'above'}`));
  const who = h('div', { class: 'rs-block' }, h('div', { class: 'rs-block-title' }, 'The tanker (a picture) and the stand-in receiver'),
    row('Tanker\'s steepest bank', `${Math.round(r.tankerBankDeg)}° (set ${plan.aar.bankDeg}°)`, tag(flags.tankerBank.over, 'as set', 'steeper')),
    row('Tanker\'s height', `${ft10(r.tankerLowestFt)} MSL, held`),
    row('Receiver\'s peak G', `${r.peakG.toFixed(1)} G`, tag(flags.peakG.over, `under ${plan.ac.gLimit}`, `over ${plan.ac.gLimit}`)),
    row('Receiver\'s lowest airspeed', kt(r.lowestKias), tag(flags.slow.over, 'above the shaker', 'near the stall')),
    flags.vmo.over ? row('Receiver\'s fastest', `over VMO by ${Math.round(r.overVmo)} kt`, tag(true, '', 'over VMO')) : null);
  card.append(rv, atRo, join, who);
  const notes = [
    'The tanker\'s flying is a picture, not a performance claim: the KC-130J has no performance set yet (RS-Q1). The receiver is a stand-in: the CT-156, no probe.',
    'Approved: Patrick\'s yes (relayed by Dad, 17 Oct 2026: "pat says build"). Every refuelling number is still an estimate (ATP-56 not read).',
    ...r.notes,
  ];
  card.append(h('ul', { class: 'rs-notes' }, notes.map((t) => h('li', {}, t))));
  return card;
}
