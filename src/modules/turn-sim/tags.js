// The info tags beside each aircraft in the live picture (spec section 10.4, decision TS-56): Fight Sim's look (a dark box,
// a border in the aircraft's colour, a white title and a detail line in its colour), drawn by view.js. This file only
// works out the words: what each aircraft is doing, and for a wingman how he sits against the aircraft he flies off.
// The verdicts come from the one judge (live/judge.js fwState and closeState, built on its link judge); this file picks
// which one each wingman gets.
//
// The states:
//  - Fighting wing: the cone of SMM 12.29 para 69 and Fig 12.19, 500 to 1,000 ft and 30° to 60° of sweep back from the
//    wing line of the aircraft flown off. Inside 500 ft TIGHT, past 1,000 ft STRETCHED, otherwise outside the sweep OUT OF
//    CONE, and inside it all IN POSITION. The sweep is shown the manual's way, from the wing line (Fig 12.19).
//  - The close formations: the in-position test the roll-out judgement uses (live/judge.js judgeLink, the 2-ship
//    bands, link by link in the 4-ship). In it, IN POSITION; too close (TIGHT, TOO CLOSE, FORE) TIGHT; too far (WIDE, AFT,
//    TOO FAR BACK) STRETCHED; otherwise the judgement's own word (HIGH, LOW, OFF LINE, WRONG SIDE).
//  - Line abreast and the wide 4-ship formations: no state, the spacing only (the card judges them).
// While Lead manoeuvres (turning, pitching or pulling), fighting wing (2- and 4-ship) and fluid manoeuvring judge the
// distance only: TIGHT inside 500 ft, STRETCHED past 1,000 ft, otherwise IN RANGE, with no sweep or cone verdict (Patrick
// 23:07Z: "this is true in fighting wing as well"; 23:08Z: "during the turn all that matters is their distance from lead
// for spacing"). Straight and level, and at the roll-out, the full verdict shows again. The real flag stays either way:
// a wingman ahead of the 3/9 line of the aircraft he flies off reads AHEAD OF 3/9.
// A wingman on an overshoot reads OVERSHOOTING (TS-62); one held to full power behind his planned place reads STRETCHED
// (TS-63, Patrick 5 Oct 02:48Z).
// Every tag has a power line when what flies the aircraft sets its power (live/power.js; Patrick 5 Oct 01:44Z): MAX, PWR
// nn% (the model's throttle, not a torque reading), or in red IDLE, BOARDS or IDLE+BOARDS (TS-61, TS-62). None otherwise.
// formation.js first: the live files import each other in a loop, so they are entered where the app enters them. (Until
// clean-up step 1 entering at transitions.js read REJOIN before it was set; REJOIN now lives in tuning.js, which imports
// nothing from the loop.)
import './live/formation.js';
import { relativeTo } from './live/manoeuvres.js';
import { fwState, closeState, closeLinkKind } from './live/judge.js';
import { FORMATIONS, FOUR_FORMATIONS, slotsFor } from './live/slots.js';
import { pursuitWord } from './fluid-panel.js';
import { isManoeuvring } from './live/fluid.js';
import { powerWord } from './live/power.js';
import { compassDeg } from './live/formation.js';

const CLOSE_KEYS = new Set(['echelon', 'route', 'astern', 'finger', 'box', 'trail']);
const ft = (n) => `${Math.round(Math.abs(n)).toLocaleString('en-CA')} ft`;

/**
 * Fluid manoeuvring's tags (spec section 10.3, TS-57): Lead with the manoeuvre and its phase; #2 with his pursuit (LAG,
 * PURE, LEAD, SWAPPING), where he sits (fluid.js readouts: the distance only while Lead manoeuvres; straight and level
 * IN POSITION, or OUT OF CONE past 30° of aspect), the range and the aspect (0 at Lead's tail), or AHEAD OF 3/9.
 */
function fluidTags(state) {
  const f = state.fluid;
  const now = f.session.now();
  const r = f.readouts;
  const [lead, wing] = state.aircraft;
  const out = {
    [lead.id]: { title: `${lead.name ?? 'Lead'} · ${now.label}`, detail: `${now.phase}, ${Math.round(lead.kias)} KIAS`, power: powerWord(lead.power), doing: now.label, position: now.phase, range: null },
  };
  out[wing.id] = {
    title: `${wing.name ?? '#2'} · ${wing.stretched ? 'STRETCHED' : pursuitWord(now.wingCue)}`, // held to full power behind his place (TS-63)
    doing: wing.stretched ? 'STRETCHED' : pursuitWord(now.wingCue),
    position: r ? (r.aspectDeg >= 90 ? 'AHEAD OF 3/9' : r.state) : null,
    range: r ? `${ft(r.rangeFt)}, aspect ${Math.round(r.aspectDeg)}°` : null,
    detail: r ? `${r.aspectDeg >= 90 ? 'AHEAD OF 3/9' : r.state} · ${ft(r.rangeFt)}, aspect ${Math.round(r.aspectDeg)}°` : '',
    power: powerWord(wing.power),
  };
  return out;
}

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
 * The tags: { id: { title, detail, power } } for every aircraft (power: live/power.js powerWord, { text, red } or null). state: the live formation state (aircraft with `ref`, current);
 * where: formation.where() ({ key, side }). During a change each wingman is judged against the formation being flown to.
 */
export function tagLines(state, where) {
  if (state.fluid) return fluidTags(state);
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
      out[a.id] = { title: `${name} · ${what}`, detail: `${Math.round(a.kias)} KIAS${turning ? `, bank ${Math.round(Math.abs(a.bankDeg))}° ${a.bankDeg > 0 ? 'L' : 'R'}` : ''}`, power: powerWord(a.power), doing: what, position: null, range: null };
      continue;
    }
    // The aircraft he flies off: the 4-ship's table for the formation being flown (to), Lead in the 2-ship.
    let refId = 1;
    if (four && FOUR_FORMATIONS[target] && !FOUR_FORMATIONS[target].later) refId = slotsFor(target, side || -1, { ships: 4 })[a.id].ref;
    const ref = by.get(refId) ?? lead;
    let position = null;
    let range = null;
    if (target === 'fw') {
      const s = fwState(ref, a, { distanceOnly: isManoeuvring(lead) });
      position = s.state;
      range = s.distanceOnly ? ft(s.rangeFt) : `${ft(s.rangeFt)}, ${Math.round(s.sweepDeg)}° from the wing line`;
    } else if (CLOSE_KEYS.has(target)) {
      position = closeState(four ? closeLinkKind(target, a.id) : target, ref, a);
    } else {
      const rel = relativeTo(ref, a);
      range = `${ft(rel.left)} abeam${refId === 1 ? '' : ` of ${ref.name ?? `#${refId}`}`}`;
    }
    const detail = [position, range].filter(Boolean).join(' · ');
    const what2 = a.overshooting ? 'OVERSHOOTING' : a.stretched ? 'STRETCHED' : what;
    // How he is flying it (TS-62): OVERSHOOTING in place of what the formation is doing, or STRETCHED while he is held to
    // full power behind his place (TS-63); his power on its own line.
    out[a.id] = { title: `${name} · ${what2}`, detail, power: powerWord(a.power), doing: what2, position, range };
  }
  return out;
}

/** What the Data tag menu shows at first (Patrick, 5 Oct): what it's doing, position, range and sweep, airspeed, power, closure. */
export const TAG_DEFAULTS = Object.freeze({
  tagDoing: true, tagPosition: true, tagRange: true, tagSpeed: true, tagPower: true, tagClosure: true,
  tagHeight: false, tagHeading: false, tagBankG: false,
});

/**
 * One aircraft's data tag, built from its tag (tagLines) and the Data tag ticks in `show` (TAG_DEFAULTS' keys):
 * { title, lines: [{ text, red }] }. `closure` is the rejoin line ("+24 kt, Lead at 11 o'clock") or null; `lead` gives the
 * height above or below.
 */
export function formatTag(tag, a, lead, show, closure = null) {
  const name = a.name ?? (a.id === 1 ? 'Lead' : `#${a.id}`);
  const lines = [];
  const where = [show.tagPosition && tag.position, show.tagRange && tag.range].filter(Boolean).join(' · ');
  if (where) lines.push({ text: where });
  const upFt = (a.altAboveFt ?? 0) - (lead?.altAboveFt ?? 0);
  const flight = [
    show.tagSpeed && `${Math.round(a.kias)} KIAS`,
    show.tagHeight && a.id !== 1 && `${ft(upFt)} ${upFt >= 0 ? 'above' : 'below'} Lead`,
    show.tagHeading && `${String(compassDeg(a.headingRad)).padStart(3, '0')}°`,
    show.tagBankG && `bank ${Math.round(Math.abs(a.bankDeg ?? 0))}°${Math.abs(a.bankDeg ?? 0) >= 1 ? (a.bankDeg > 0 ? ' L' : ' R') : ''}, ${(a.g ?? 1).toFixed(1)} G`,
  ].filter(Boolean).join(', ');
  if (flight) lines.push({ text: flight });
  if (show.tagClosure && closure) lines.push({ text: closure });
  if (show.tagPower && tag.power) lines.push({ text: tag.power.text, red: Boolean(tag.power.red) });
  return { title: show.tagDoing && tag.doing ? `${name} · ${tag.doing}` : name, lines };
}
