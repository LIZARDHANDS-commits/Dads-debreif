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
// #2's tag in the 2-ship also carries two lines (Patrick 5 Oct 22:54Z: "what his error is (stretched, wide, etc) and what he's
// doing to fix it (turning early, etc)"): "Error: 40 ft wide, 20 ft acute" (against his place in the formation being flown
// to, from the same link judge; nothing when he is in position) and "Fix: MAX, turning toward, climbing" (his power, his
// bank and his climb against Lead's; the move's own phase is not exposed outside the fluid tags). Fluid manoeuvring has the
// error line from its own readouts. Not for the 4-ship. One tick, "Error and fix (#2)" in the Data tag menu, turns both on.
// Every tag has a power line when what flies the aircraft sets its power (live/power.js; Patrick 5 Oct 01:44Z): MAX, PWR
// nn% (the model's throttle, not a torque reading), or in red IDLE, BOARDS or IDLE+BOARDS (TS-61, TS-62). None otherwise.
// formation.js first: the live files import each other in a loop, so they are entered where the app enters them. (Until
// clean-up step 1 entering at transitions.js read REJOIN before it was set; REJOIN now lives in tuning.js, which imports
// nothing from the loop.)
import './live/formation.js';
import { relativeTo, DEG } from './live/manoeuvres.js';
import { fwState, closeState, closeLinkKind, judgeLink, SWEEP_MAX_DEG } from './live/judge.js';
import { FORMATIONS, FOUR_FORMATIONS, FW_BAND, slotsFor, pairSlot } from './live/slots.js';
import { IN_POSITION } from './live/tuning.js';
import { pursuitWord } from './fluid-panel.js';
import { isManoeuvring, FLUID } from './live/fluid.js';
import { powerWord, throttleFor } from './live/power.js';
import { compassDeg } from './live/formation.js';
import { liftBankDeg } from './live/flight.js';

const CLOSE_KEYS = new Set(['echelon', 'route', 'astern', 'finger', 'box', 'trail']);
const ft = (n) => `${Math.round(Math.abs(n)).toLocaleString('en-CA')} ft`;

const deg = (n) => `${Math.round(Math.abs(n))}°`;

/**
 * #2's error against his place in the formation key (FORMATIONS' keys), in a pilot's words, biggest first and at most two:
 * [{ size, text }]. Whether an error is named comes from the link judge's own labels (live/judge.js judgeLink), so the bands
 * stay in one place; only the amounts are worked out here, from the measurements it returns and the slot table (slots.js).
 *  - Close formations (echelon, route, astern), in the wing plane like the tag's position word: wide / close, sucked
 *    (behind his place) / acute (ahead of it), high / low, each in feet against his place.
 *  - Line abreast: off the SMM's band (16.18 para 49), in feet: stretched past it, close inside it, ahead of the 3/9 line or
 *    behind the sweep line; high or low is the height off Lead.
 *  - Fighting wing: off the cone (SMM 12.29 para 69, Fig 12.19): short of it past 1,000 ft, too close inside 500 ft, forward
 *    or aft of its sweep in degrees, ahead of the 3/9 line; high or low is the height off Lead. While Lead manoeuvres only
 *    the distance counts, as in the position word.
 * Acute for ahead and sucked for behind is the usual formation meaning, the README's TS-52 working reading (Patrick to
 * confirm with the training errors).
 */
function errorParts(key, ref, wing, spacingFt, distanceOnly) {
  const parts = [];
  const add = (size, text) => { if (Math.round(size) > 0) parts.push({ size, text }); };
  const amount = (n, word) => add(n, `${ft(n)} ${word}`);
  const height = (j) => {
    if (j.labels.includes('HIGH')) amount(-j.down, 'high');
    if (j.labels.includes('LOW')) amount(j.down, 'low');
  };
  if (key === 'lab') {
    const j = judgeLink('abreast', ref, wing, { spacingFt, stackFt: IN_POSITION.labStackFt });
    const [lo, hi] = spacingFt < IN_POSITION.labBandFt[0] || spacingFt > IN_POSITION.labBandFt[1] ? [spacingFt, spacingFt] : IN_POSITION.labBandFt; // a setting outside the band is judged on itself (judge.js)
    if (j.labels.includes('TIGHT')) amount(lo - j.acrossFt, 'close');
    if (j.labels.includes('WIDE')) amount(j.acrossFt - hi, 'stretched');
    if (j.labels.includes('FORE')) amount(j.foreAftFt, 'ahead of the 3/9 line');
    if (j.labels.includes('AFT')) amount(-j.foreAftFt - j.acrossFt * Math.tan(SWEEP_MAX_DEG * DEG), `behind the ${SWEEP_MAX_DEG}° line`);
    height(j);
  } else if (key === 'fw') {
    const j = judgeLink('fw', ref, wing, { needBelow: false, stackFt: distanceOnly ? null : IN_POSITION.fwStackFt });
    const [rMin, rMax] = FW_BAND.rangeFt;
    const [dMin, dMax] = FW_BAND.sweepDeg;
    if (j.rel.fwd > 0) amount(j.rel.fwd, 'ahead of the 3/9 line');
    else {
      if (j.labels.includes('TOO CLOSE')) amount(rMin - j.rangeFt, 'too close');
      if (j.labels.includes('TOO FAR')) amount(j.rangeFt - rMax, 'short of the cone');
      // The sweep, in degrees, sized by the distance to the cone's edge so it sorts beside the feet.
      const sweep = (d, word) => add(j.rangeFt * d * DEG, `${deg(d)} ${word} of the cone`);
      if (!distanceOnly && j.labels.includes('TOO FLAT')) sweep(dMin - j.sweepDeg, 'forward');
      if (!distanceOnly && j.labels.includes('TOO FAR BACK')) sweep(j.sweepDeg - dMax, 'aft');
    }
    if (!distanceOnly) height(j);
  } else if (key === 'echelon' || key === 'route' || key === 'astern') {
    const j = judgeLink(key, ref, wing, { wingPlane: true });
    const slot = pairSlot(key, j.rel.left >= 0 ? 1 : -1); // judgeLink's own default spacing, so the same place it judged
    const out = Math.abs(j.rel.left) - Math.abs(slot.left);
    const fwd = j.rel.fwd - slot.fwd;
    const down = j.down + slot.alt; // positive: below his place
    const has = (w) => j.labels.includes(w);
    if (has('OFF LINE')) amount(Math.abs(j.rel.left), 'off line');
    if (has('TIGHT')) amount(-out, 'close');
    if (has('WIDE')) amount(out, 'wide');
    if (has('FORE')) amount(fwd, 'acute');
    if (has('TOO CLOSE')) amount(fwd, 'close');
    if (has('AFT') || has('TOO FAR BACK')) amount(-fwd, 'sucked');
    if (has('HIGH')) amount(-down, 'high');
    if (has('LOW')) amount(down, 'low');
  }
  return parts.sort((p, q) => q.size - p.size).slice(0, 2);
}

/** #2's error line, or null when he is in his place (or no judge covers the formation). */
const errorLine = (parts) => (parts.length ? `Error: ${parts.map((p) => p.text).join(', ')}` : null);

/** Margin on the throttle before "power back" or "power up" is said: 0.1 of full thrust (an estimate). */
const POWER_MARGIN = 0.1;
/** Extra bank against Lead's and extra climb rate against Lead's before it is worth a word (estimates: 5° as Lead's own turning test; 3 ft/s is 180 ft/min). */
const BANK_MARGIN_DEG = 5;
const CLIMB_MARGIN_FTPS = 3;

/**
 * What #2 is doing about his error, in plain words from his own state: his power (MAX, power back, power up, IDLE, boards),
 * turning toward or away from Lead (his bank against Lead's, with Lead on which side of him), climbing or descending (his
 * climb rate against Lead's). "Fix: ..." or null when none of these stands out. The move's own phase is not exposed by
 * the live files outside fluid manoeuvring, so this reads the aircraft as flown.
 */
function fixLine(wing, lead) {
  const parts = [];
  const p = wing.power;
  if (p) {
    if (p.stage === 'idle') parts.push('IDLE');
    else if (p.stage === 'idleBoards') parts.push('IDLE and boards');
    else if (p.stage === 'boards') parts.push('boards out');
    else if (powerWord(p).text === 'MAX') parts.push('MAX');
    else {
      const hold = throttleFor(0, p.kias, p.altFt, wing.g ?? 1, wing.climbFtps ?? 0); // the throttle that holds his speed as he is flying
      if (p.throttle < hold - POWER_MARGIN) parts.push('power back');
      else if (p.throttle > hold + POWER_MARGIN) parts.push('power up');
    }
  }
  const extraBank = (wing.bankDeg ?? 0) - (lead.bankDeg ?? 0); // positive: more left wing down than Lead
  const side = Math.sign(relativeTo(lead, wing).left); // positive: #2 on Lead's left, so a right turn is toward him
  if (Math.abs(extraBank) >= BANK_MARGIN_DEG && side) parts.push(extraBank * side < 0 ? 'turning toward' : 'turning away');
  const extraClimb = (wing.climbFtps ?? 0) - (lead.climbFtps ?? 0);
  if (extraClimb >= CLIMB_MARGIN_FTPS) parts.push('climbing');
  else if (extraClimb <= -CLIMB_MARGIN_FTPS) parts.push('descending');
  return parts.length ? `Fix: ${parts.join(', ')}` : null;
}

/** #2's error in fluid manoeuvring, from the readouts' own numbers: the 500 ft bubble, the 1,000 ft limit and the cone's half angle. */
function fluidError(r) {
  if (r.aspectDeg >= 90) return 'Error: ahead of the 3/9 line';
  if (r.rangeFt < FLUID.bubbleFt) return `Error: ${ft(FLUID.bubbleFt - r.rangeFt)} too close`;
  if (r.rangeFt > FLUID.rangeFt.max) return `Error: ${ft(r.rangeFt - FLUID.rangeFt.max)} stretched`;
  if (r.state === 'OUT OF CONE') return `Error: ${deg(r.aspectDeg - FLUID.coneHalfDeg)} out of the cone`;
  return null;
}

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
    error: r ? fluidError(r) : null,
    fix: r && fluidError(r) ? fixLine(wing, lead) : null,
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
 * The tags: { id: { title, detail, power, error, fix } } for every aircraft (power: live/power.js powerWord, { text, red } or null). state: the live formation state (aircraft with `ref`, current);
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
    // #2 of the 2-ship: his error against his place in the formation being flown to, and what he is doing about it.
    if (!four && FORMATIONS[target]) {
      out[a.id].error = errorLine(errorParts(target, ref, a, state.spacingFt ?? 5000, isManoeuvring(lead)));
      if (out[a.id].error) out[a.id].fix = fixLine(a, ref);
    }
  }
  return out;
}

/** A close formation's tags are left off within this distance of Lead (feet; the hand-over range, tuning.js HAND_OVER_FT). */
const CLOSE_TAGS_OFF_FT = 500;

/**
 * True when the data tags are left off: the formation is a close one (or a change is flying to one) and every wingman is
 * within CLOSE_TAGS_OFF_FT of Lead (Patrick 5 Oct 23:21Z: "dont show tags on close formation"; TS-92). A rejoin to a close
 * formation keeps its tags, closure included, until #2 is in close.
 */
export function closeTagsOff(state, where) {
  if (state.fluid) return false;
  if (!CLOSE_KEYS.has(state.current?.change?.to ?? where.key)) return false;
  const lead = state.aircraft[0];
  return state.aircraft.every((a) => a === lead || Math.hypot(a.xFt - lead.xFt, a.yFt - lead.yFt) <= CLOSE_TAGS_OFF_FT);
}

/** What the Data tag menu shows at first (Patrick, 5 Oct): what it's doing, position, range and sweep, airspeed, power, closure. */
export const TAG_DEFAULTS = Object.freeze({
  tagDoing: true, tagPosition: true, tagRange: true, tagSpeed: true, tagPower: true, tagClosure: true, tagError: true,
  tagHeight: false, tagHeading: false, tagBankG: false,
});

/**
 * One aircraft's data tag, built from its tag (tagLines) and the Data tag ticks in `show` (TAG_DEFAULTS' keys; tagError adds #2's Error and Fix lines when he is off his place):
 * { title, lines: [{ text, red }] }. `closure` is the rejoin line ("+24 kt, Lead at 11 o'clock") or null; `lead` gives the
 * height above or below.
 */
export function formatTag(tag, a, lead, show, closure = null) {
  const name = a.name ?? (a.id === 1 ? 'Lead' : `#${a.id}`);
  const lines = [];
  const where = [show.tagPosition && tag.position, show.tagRange && tag.range].filter(Boolean).join(' · ');
  if (where) lines.push({ text: where });
  // #2's error against his place and what he is doing about it (Patrick 5 Oct 22:54Z), only while he is off his place.
  if (show.tagError && tag.error) lines.push({ text: tag.error }, ...(tag.fix ? [{ text: tag.fix }] : []));
  const upFt = (a.altAboveFt ?? 0) - (lead?.altAboveFt ?? 0);
  const liftBank = liftBankDeg(a.bankDeg ?? 0, a.nz ?? 1);
  const flight = [
    show.tagSpeed && `${Math.round(a.kias)} KIAS`,
    show.tagHeight && a.id !== 1 && `${upFt >= 0 ? '+' : '\u2212'}${ft(upFt)}`, // against Lead: +150 ft above, \u2212200 ft below
    show.tagHeading && `${String(compassDeg(a.headingRad)).padStart(3, '0')}°`,
    show.tagBankG && `bank ${Math.round(Math.abs(liftBank))}°${Math.abs(liftBank) >= 1 ? (liftBank > 0 ? ' L' : ' R') : ''}, ${(a.g ?? 1).toFixed(1)} G`, // where the lift points (TS-108)
  ].filter(Boolean).join(', ');
  if (flight) lines.push({ text: flight });
  if (show.tagClosure && closure) lines.push({ text: closure });
  if (show.tagPower && tag.power) lines.push({ text: tag.power.text, red: Boolean(tag.power.red) });
  return { title: show.tagDoing && tag.doing ? `${name} · ${tag.doing}` : name, lines };
}
