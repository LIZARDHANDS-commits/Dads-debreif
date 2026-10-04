// The info tags beside each aircraft in the live picture (spec section 10.4, decision TS-56): Fight Sim's look (a dark box,
// a border in the aircraft's colour, a white title and a detail line in its colour), drawn by view.js. This file only
// works out the words: what each aircraft is doing, and for a wingman how he sits against the aircraft he flies off.
//
// The states:
//  - Fighting wing: the cone of SMM 12.29 para 69 and Fig 12.19, 500 to 1,000 ft and 30° to 60° of sweep back from the
//    wing line of the aircraft flown off. Inside 500 ft TIGHT, past 1,000 ft STRETCHED, otherwise outside the sweep OUT OF
//    CONE, and inside it all IN POSITION. The sweep is shown the manual's way, from the wing line (Fig 12.19).
//  - The close formations: the in-position test the roll-out judgement uses (transitions.js judgeFormation, the 2-ship
//    table, link by link in the 4-ship). In it, IN POSITION; too close (TIGHT, TOO CLOSE, FORE) TIGHT; too far (WIDE, AFT,
//    TOO FAR BACK) STRETCHED; otherwise the judgement's own word (HIGH, LOW, OFF LINE, WRONG SIDE).
//  - Line abreast and the wide 4-ship formations: no state, the spacing only (the card judges them).
// formation.js first: the live files import each other in a loop, and entering it at transitions.js reads REJOIN in
// kinematic-moves.js before transitions.js has set it (the same happens on main if transitions.js is loaded first).
import './live/formation.js';
import { relativeTo, DEG } from './live/manoeuvres.js';
import { judgeFormation, FORMATIONS } from './live/transitions.js';
import { FOUR_FORMATIONS, fourSlots } from './live/four-ship-slots.js';

/** The fighting wing cone (SMM 12.29 para 69, Fig 12.19): feet from the aircraft flown off, and sweep back from its wing line. */
export const FW_CONE = Object.freeze({ minFt: 500, maxFt: 1000, minSweepDeg: 30, maxSweepDeg: 60 });

const CLOSE_KEYS = new Set(['echelon', 'route', 'astern', 'finger', 'box', 'trail']);
const TIGHT_WORDS = new Set(['TIGHT', 'TOO CLOSE', 'FORE']);
const STRETCHED_WORDS = new Set(['WIDE', 'AFT', 'TOO FAR BACK', 'TOO FAR']);
const ft = (n) => `${Math.round(Math.abs(n)).toLocaleString('en-CA')} ft`;

/** Where `wing` sits in the fighting wing cone of `ref`: { state, rangeFt, sweepDeg } (sweep back from ref's wing line). */
export function fwState(ref, wing) {
  const rel = relativeTo(ref, wing);
  const rangeFt = Math.hypot(rel.fwd, rel.left);
  const sweepDeg = Math.atan2(-rel.fwd, Math.max(Math.abs(rel.left), 1e-6)) / DEG;
  const c = FW_CONE;
  const state = rangeFt < c.minFt ? 'TIGHT' : rangeFt > c.maxFt ? 'STRETCHED' : sweepDeg < c.minSweepDeg || sweepDeg > c.maxSweepDeg ? 'OUT OF CONE' : 'IN POSITION';
  return { state, rangeFt, sweepDeg };
}

/** A close formation's in-position test turned into one state word, for the 2-ship key (echelon, route, astern). */
export function closeState(pairKey, ref, wing) {
  const j = judgeFormation(pairKey, ref, wing, undefined, { wingPlane: true }); // stepped up or down in a turn is in place
  if (j.inBand) return 'IN POSITION';
  if (j.labels.some((l) => TIGHT_WORDS.has(l))) return 'TIGHT';
  if (j.labels.some((l) => STRETCHED_WORDS.has(l))) return 'STRETCHED';
  return j.labels[0];
}

/** The 2-ship table's formation for one 4-ship link (four-ship-slots.js judgeFourFormation's rule). */
const pairKeyFor = (key, id) => (key === 'trail' || key === 'astern' || (key === 'box' && id === 4) ? 'astern' : key === 'route' ? 'route' : 'echelon');

const WIDE_KEYS = new Set(['lab', 'spread4', 'offsetBox', 'fluid4', 'other']);
/**
 * A change that is a rejoin: from line abreast or a wide picture into a closer formation (SMM 16.20, 16.34), or from
 * fighting wing into a close one (the straight-ahead or turning rejoin, SMM 12.26, 16.34 paras 95-96).
 */
const isRejoin = (c) => Boolean(c.rejoining) || (WIDE_KEYS.has(c.from) && !WIDE_KEYS.has(c.to)) || (c.from === 'fw' && CLOSE_KEYS.has(c.to));

/** What the formation is doing, in a word or two: Rejoining, Station change, Turning, or the formation it is in. */
function doing(state, whereKey, four) {
  const cur = state.current;
  if (cur?.change) return isRejoin(cur.change) ? 'Rejoining' : 'Station change';
  if (cur) return 'Turning';
  const table = four ? FOUR_FORMATIONS : FORMATIONS;
  return table[whereKey]?.label ?? 'Flying';
}

/**
 * The tags: { id: { title, detail } } for every aircraft. state: the live formation state (aircraft with `ref`, current);
 * where: formation.where() ({ key, side }). During a change each wingman is judged against the formation being flown to.
 */
export function tagLines(state, where) {
  const four = state.aircraft.length > 2;
  const by = new Map(state.aircraft.map((a) => [a.id, a]));
  const lead = by.get(1);
  const target = state.current?.change?.to ?? where.key;
  const side = state.current?.change?.side ?? where.side ?? -1;
  const what = doing(state, where.key, four);
  const out = {};
  for (const a of state.aircraft) {
    const name = a.name ?? `#${a.id}`;
    if (a.id === 1) {
      const turning = Math.abs(a.bankDeg) > 5;
      out[a.id] = { title: `${name} · ${what}`, detail: `${Math.round(a.kias)} KIAS${turning ? `, bank ${Math.round(Math.abs(a.bankDeg))}° ${a.bankDeg > 0 ? 'L' : 'R'}` : ''}` };
      continue;
    }
    // The aircraft he flies off: the 4-ship's table for the formation being flown (to), Lead in the 2-ship.
    let refId = 1;
    if (four && FOUR_FORMATIONS[target] && !FOUR_FORMATIONS[target].later) refId = fourSlots(target, side || -1)[a.id].ref;
    const ref = by.get(refId) ?? lead;
    let detail;
    if (target === 'fw') {
      const s = fwState(ref, a);
      detail = `${s.state} · ${ft(s.rangeFt)}, ${Math.round(s.sweepDeg)}° from the wing line`;
    } else if (CLOSE_KEYS.has(target)) {
      detail = closeState(four ? pairKeyFor(target, a.id) : target, ref, a);
    } else {
      const rel = relativeTo(ref, a);
      detail = `${ft(rel.left)} abeam${refId === 1 ? '' : ` of ${ref.name ?? `#${refId}`}`}`;
    }
    out[a.id] = { title: `${name} · ${what}`, detail };
  }
  return out;
}
