// Which formation the aircraft are in, and how well they hold it: one classifier and one judge for the 2-ship and the 4-ship
// (Turn Sim spec sections 8 and 10; clean-up step 1, TS-64). The roll-out verdict (formation.js), the Formation card, the
// change planners and the info tags (tags.js) all read this file, and the places it judges against come from the one slot
// table (slots.js).
//
// Until step 1 this was six pieces: judgePair (formation.js), classifyPair and judgeFormation (transitions.js), judgeFour
// (four-ship.js), classifyFour and judgeFourFormation (four-ship-slots.js), and the judging inside fwState and closeState
// (tags.js). They now share one link judge (judgeLink: one wingman against the aircraft he flies off), and every verdict is
// built from it. Where two of them used different bands or words for the same thing, each screen keeps what it showed before
// step 1, as a named option of the link judge (the 4-ship's fighting wing margins, the tag words); the differences are listed
// in TS-64 for Patrick.
//
// Sources (page references only): SMM 16.18 para 49 (line abreast: spacing, 0-10° of sweep), 16.19 para 59 (in trail after
// an in-place turn), 12.29 para 69 and Fig 12.19 (fighting wing, 500-1,000 ft and 30-60°), 12.4 paras 11-12 (echelon), 12.6
// para 15 (route, 1 to 3 wingspans), 12.5 para 13 (line astern, about 10 ft nose to tail), 12.19 paras 41-43 and Fig 12.11
// (a close wingman stepped with Lead's bank), 16.41 para 109 (offset box depth 6,000-8,000 ft). Margins: the shared table's
// ±100 ft and ±5° (docs/TESTING.md). The close bands in feet are estimates beside sight references.
import { relativeTo, DEG } from './manoeuvres.js';
import { rangeWord } from './fluid.js';
import { FORMATIONS, WINGSPAN_FT, LENGTH_FT, FW_BAND, BOX_DEPTH_BAND_FT, FLUID4_ABEAM_FT, slotsFor, fourWords } from './slots.js';

/** Margins for the roll-out judgement: the shared table's ±100 ft (docs/TESTING.md). */
export const JUDGE_MARGIN_FT = 100;
/** The SMM's line abreast sweep: 0 to 10 degrees behind the 3/9 line (SMM 16.18 para 49). */
export const SWEEP_MAX_DEG = 10;
/** The shared table's angle margin, ±5° (docs/TESTING.md). */
const MARGIN_DEG = 5;
/** #3's place in the offset box slot may be this far off sideways before it is named (estimate, design section 7). */
const BOX_SLOT_MARGIN_FT = 500;

const NAMES = Object.freeze({ 1: 'Lead', 2: '#2', 3: '#3', 4: '#4' });
const nameOf = (a) => a.name ?? NAMES[a.id] ?? `#${a.id}`;
const ft = (n) => `${Math.round(Math.abs(n)).toLocaleString('en-CA')} ft`;

// ---- the classifier --------------------------------------------------------------------------------------------------

/**
 * Which 2-ship formation one link is nearest to, from where the wingman really is (design section 4, note 2):
 * { key: 'lab' | 'fw' | 'echelon' | 'route' | 'astern' | 'other', side: +1 | -1 | 0 }.
 * The regions are generous: they only say what the pair is nearest to. 'other' is anything else
 * (in trail after an in-place turn, mid-change).
 */
function classifyLink(lead, wing) {
  const rel = relativeTo(lead, wing);
  const across = Math.abs(rel.left);
  const back = -rel.fwd;
  const range = Math.hypot(rel.fwd, rel.left);
  const side = Math.sign(rel.left);
  const sweep = Math.atan2(back, Math.max(across, 1e-6)) / DEG;
  if (across >= 1500 && sweep <= 25 && sweep >= -15) return { key: 'lab', side };
  if (range >= 400 && range <= 1300 && sweep >= 20 && sweep <= 70) return { key: 'fw', side };
  if (range < 250) {
    if (across < 22 && back > 0) return { key: 'astern', side: 0 };
    if (across < 56 && rel.fwd < 40 && rel.fwd > -90) return { key: 'echelon', side };
    if (across <= 130 && rel.fwd < 60 && rel.fwd > -120) return { key: 'route', side };
  }
  return { key: 'other', side };
}

/** True when the four are on the stack (each wingman more than 150 ft from Lead's height): fighting wing then keeps it. */
export function isStacked(aircraft) {
  const lead = aircraft[0];
  return aircraft.slice(1).every((a) => Math.abs(a.altAboveFt - lead.altAboveFt) > 150);
}

const CLOSE_FOUR = ['finger', 'echelon', 'box', 'trail', 'route'];
/** A close formation is recognised when every wingman is this close to its place (an estimate, wide enough for a slide still settling). */
const CLOSE_TOL_FT = 15;

/**
 * Which formation the aircraft are in now, from where they really are. The pair: { key, side } with key one of FORMATIONS'
 * or 'other'. The four: { key, side } with key one of FOUR_FORMATIONS' or 'other' (design section 4: classify from the real
 * slots; anything else is 'other'), side being #2's side of Lead.
 */
export function classify(aircraft) {
  if (aircraft.length <= 2) return classifyLink(aircraft[0], aircraft[1]);
  const by = new Map(aircraft.map((a) => [a.id, a]));
  const [L, two, three, four] = [by.get(1), by.get(2), by.get(3), by.get(4)];
  const c2 = classifyLink(L, two);
  const side = c2.side || Math.sign(relativeTo(L, two).left) || -1;

  // Close formations: the nearest table entry, if every wingman is within a few feet of it.
  let best = { key: 'other', side, err: Infinity };
  for (const key of CLOSE_FOUR) {
    for (const s of key === 'trail' ? [side] : [1, -1]) {
      const slots = slotsFor(key, s, { ships: 4 });
      let err = 0;
      for (const id of [2, 3, 4]) {
        const rel = relativeTo(by.get(slots[id].ref), by.get(id));
        err = Math.max(err, Math.hypot(rel.fwd - slots[id].fwd, rel.left - slots[id].left));
      }
      if (err < best.err) best = { key, side: key === 'trail' ? 0 : s, err };
    }
  }
  if (best.err <= CLOSE_TOL_FT) return { key: best.key, side: best.side };

  const c3 = classifyLink(L, three);
  const c34 = classifyLink(three, four);
  if (c2.key === 'lab' && c3.key === 'lab' && c34.key === 'lab' && c3.side === -c2.side && c34.side === c3.side) return { key: 'spread4', side: c2.side };
  const c23 = classifyLink(two, three);
  if (c2.key === 'fw' && c23.key === 'fw' && c34.key === 'fw' && c23.side === -c2.side && c34.side === c23.side) return { key: 'fw', side: c2.side };
  if (c2.key === 'fw' && c3.key === 'lab' && c34.key === 'fw' && c3.side === -c2.side && c34.side === c3.side) return { key: 'fluid4', side: c2.side };
  if (c2.key === 'lab') {
    const r3 = relativeTo(L, three);
    const across2 = Math.abs(relativeTo(L, two).left);
    if (r3.fwd < -3000 && r3.fwd > -13000 && r3.left * c2.side > 0 && Math.abs(r3.left) < across2 && c34.key === 'lab' && c34.side === c2.side) return { key: 'offsetBox', side: c2.side };
  }
  // No formation: #2's side only when it is clearly to one side (in a column after an in-place turn it is not, and the
  // side last seen is used instead; 100 ft is the shared margin).
  return { key: 'other', side: Math.abs(relativeTo(L, two).left) > JUDGE_MARGIN_FT ? side : 0 };
}

// ---- the link judge: one wingman against the aircraft he flies off ----------------------------------------------------

/** The 2-ship formation a 4-ship link is judged as in the close formations: line astern, route or echelon. */
export function closeLinkKind(key, id) {
  return key === 'trail' || key === 'astern' || (key === 'box' && id === 4) ? 'astern' : key === 'route' ? 'route' : 'echelon';
}

/**
 * One wingman judged against the aircraft he flies off (ref). kind:
 *  - 'abreast': line abreast at spacingFt, ±100 ft, FORE more than 100 ft ahead of ref's 3/9 line, AFT past 10° of sweep
 *    (SMM 16.18 para 49);
 *  - 'trail': in trail at spacingFt along ref's heading, ±100 ft, OFFSET more than 100 ft off line (SMM 16.19 para 59);
 *  - 'fw': SMM 12.29 para 69's band, 500-1,000 ft and 30-60°, widened by marginFt and marginDeg (0 unless the caller says
 *    why), and with needBelow NOT BELOW LEAD when not below ref;
 *  - 'echelon', 'route', 'astern': the close bands of the spec table (section 10). wingPlane: measure out and down in ref's
 *    wing plane, not level, so a wingman stepped up or down with ref's bank in a close turn (SMM 12.19 paras 41-43,
 *    Fig 12.11) reads as in place. Ref's bank only tilts the frame; level, it is the same.
 * Returns { labels (empty when in position), numbers (the card's words for the measurements, where one formation's card
 * shows them), rel, down, … the measurements }.
 */
export function judgeLink(kind, ref, wing, { spacingFt = 6000, wingPlane = false, marginFt = 0, marginDeg = 0, needBelow = true } = {}) {
  const rel = { ...relativeTo(ref, wing) };
  let down = ref.altAboveFt - wing.altAboveFt; // positive: the wingman is below ref
  if (wingPlane && ref.bankDeg) {
    const phi = ref.bankDeg * DEG; // positive: left wing down
    const up = -down;
    const left = rel.left * Math.cos(phi) - up * Math.sin(phi);
    down = -(rel.left * Math.sin(phi) + up * Math.cos(phi));
    rel.left = left;
  }
  const across = Math.abs(rel.left);
  const labels = [];
  const M = JUDGE_MARGIN_FT;
  if (kind === 'abreast') {
    if (across < spacingFt - M) labels.push('TIGHT');
    else if (across > spacingFt + M) labels.push('WIDE');
    const sweepDeg = Math.atan2(-rel.fwd, Math.max(across, 1)) / DEG;
    if (rel.fwd > M) labels.push('FORE');
    else if (sweepDeg > SWEEP_MAX_DEG) labels.push('AFT');
    return { labels, rel, down, acrossFt: across, foreAftFt: rel.fwd, sweepDeg, side: rel.left > 0 ? 'left' : 'right' };
  }
  if (kind === 'trail') {
    const gap = Math.abs(rel.fwd);
    if (gap < spacingFt - M) labels.push('CLOSE');
    else if (gap > spacingFt + M) labels.push('LONG');
    if (Math.abs(rel.left) > M) labels.push('OFFSET');
    return { labels, rel, down, gapFt: gap, offsetFt: rel.left, ahead: rel.fwd > 0 ? 'wing' : 'lead' };
  }
  if (kind === 'fw') {
    const [rMin, rMax] = FW_BAND.rangeFt;
    const [dMin, dMax] = FW_BAND.sweepDeg;
    const rangeFt = Math.hypot(rel.fwd, rel.left);
    const sweepDeg = Math.atan2(-rel.fwd, Math.max(across, 1e-6)) / DEG;
    if (rangeFt < rMin - marginFt) labels.push('TOO CLOSE');
    else if (rangeFt > rMax + marginFt) labels.push('TOO FAR');
    if (sweepDeg < dMin - marginDeg) labels.push('TOO FLAT');
    else if (sweepDeg > dMax + marginDeg) labels.push('TOO FAR BACK');
    if (needBelow && down <= 0) labels.push('NOT BELOW LEAD');
    const numbers = `${ft(rangeFt)} (${rMin}-${rMax.toLocaleString('en-CA')}), sweep ${Math.round(sweepDeg)}° (${dMin}-${dMax}°)`;
    return { labels, numbers, rel, down, rangeFt, sweepDeg };
  }
  let numbers;
  if (kind === 'echelon') {
    const back = -rel.fwd;
    if (across < 30) labels.push('TIGHT');
    else if (across > 60) labels.push('WIDE');
    if (back < 10) labels.push('FORE');
    else if (back > 40) labels.push('AFT');
    if (down < -5) labels.push('HIGH');
    else if (down > 15) labels.push('LOW');
    numbers = `${ft(across)} out (45 ±15), ${ft(back)} back (25 ±15), ${ft(down)} ${down >= 0 ? 'below' : 'above'} (5 ±10)`;
  } else if (kind === 'route') {
    if (across < WINGSPAN_FT) labels.push('TIGHT');
    else if (across > 3 * WINGSPAN_FT) labels.push('WIDE');
    if (rel.fwd < -75) labels.push('AFT');
    else if (rel.fwd > 25) labels.push('FORE');
    if (down < -10) labels.push('HIGH');
    else if (down > 40) labels.push('LOW');
    numbers = `${ft(across)} out (${Math.round(WINGSPAN_FT)}-${Math.round(3 * WINGSPAN_FT)} ft: 1 to 3 wingspans), ${ft(rel.fwd)} ${rel.fwd >= 0 ? 'ahead' : 'back'}, ${ft(down)} ${down >= 0 ? 'below' : 'above'}`;
  } else if (kind === 'astern') {
    const gap = -rel.fwd - LENGTH_FT; // nose to tail
    if (across > 10) labels.push('OFF LINE');
    if (gap < 0) labels.push('TOO CLOSE');
    else if (gap > 20) labels.push('TOO FAR BACK');
    if (down < 0) labels.push('HIGH');
    numbers = `${ft(gap)} nose to tail (10 ±10), ${ft(across)} off line, ${ft(down)} ${down >= 0 ? 'below' : 'above'}`;
  } else {
    throw new Error(`No link judgement called ${kind}`);
  }
  return { labels, numbers, rel, down };
}

// ---- the judge: the verdict for the formation -------------------------------------------------------------------------

/**
 * The one judge. what: { key, side } judges the aircraft against formation `key` (FORMATIONS' for the pair,
 * FOUR_FORMATIONS' for the four, side #2's side of Lead) and returns { key, inBand, labels, text, tone } (the four also
 * `ships`, one verdict per wingman off the aircraft the table says he flies off); { shape: 'abreast' | 'trail' } judges a
 * line abreast manoeuvre's roll-out (each wingman off the aircraft in his `ref`) and returns the roll-out verdict
 * (judgePair's for the pair, { shape, ships, labels } for the four). opts: { spacingFt, wingPlane }.
 */
export function judge(aircraft, what, { spacingFt = 6000, wingPlane = false } = {}) {
  const four = aircraft.length > 2;
  if (what.shape) return four ? rollOutFour(aircraft, what.shape, spacingFt) : judgePair(aircraft[0], aircraft[1], spacingFt, what.shape);
  return four ? formationFour(what.key, aircraft, what.side, spacingFt) : formationPair(what.key, aircraft[0], aircraft[1], spacingFt, wingPlane);
}

/**
 * A line abreast manoeuvre's roll-out for a pair (SMM 16.18 para 49; in trail after an in-place turn, SMM 16.19 para 59):
 * { shape, labels (ON SPACING or IN TRAIL when in position), … the measurements }. Read by the card and by the four's
 * roll-out, wingman by wingman.
 */
export function judgePair(lead, wing, spacingFt, shape = 'abreast') {
  if (shape === 'trail') {
    const j = judgeLink('trail', lead, wing, { spacingFt });
    return { shape, labels: j.labels.length ? j.labels : ['IN TRAIL'], gapFt: j.gapFt, offsetFt: j.offsetFt, ahead: j.ahead };
  }
  const j = judgeLink('abreast', lead, wing, { spacingFt });
  return { shape, labels: j.labels.length ? j.labels : ['ON SPACING'], acrossFt: j.acrossFt, foreAftFt: j.foreAftFt, sweepDeg: j.sweepDeg, side: j.side };
}

/** The pair against a formation's band in the spec table (section 10): the judge's face for the 2-ship, judge([lead, wing], { key }). */
export function judgeFormation(key, lead, wing, spacingFt = 6000, opts = {}) {
  return judge([lead, wing], { key }, { spacingFt, ...opts });
}

/** A line abreast manoeuvre's roll-out for the four: the judge's face, judge(aircraft, { shape }). (A fourth argument is ignored.) */
export function judgeFour(aircraft, spacingFt, shape) {
  return judge(aircraft, { shape }, { spacingFt });
}

function formationPair(key, lead, wing, spacingFt, wingPlane) {
  const word = FORMATIONS[key].label;
  let labels;
  let numbers;
  let left;
  if (key === 'lab') {
    const j = judgeLink('abreast', lead, wing, { spacingFt });
    labels = j.labels;
    numbers = `${ft(j.acrossFt)} abeam, ${ft(j.foreAftFt)} ${j.foreAftFt >= 0 ? 'ahead of' : 'behind'} Lead's 3/9 line, sweep ${Math.round(Math.max(0, j.sweepDeg))}° (0-${SWEEP_MAX_DEG}°)`;
    left = wingPlane ? judgeLink('abreast', lead, wing, { spacingFt, wingPlane }).rel.left : j.rel.left; // the spacing is judged level, the side in the wing plane
  } else if (key === 'fw') {
    const j = judgeLink('fw', lead, wing, { wingPlane });
    labels = j.labels;
    numbers = `${j.numbers}, ${ft(j.down)} ${j.down >= 0 ? 'below' : 'above'} Lead`;
    left = j.rel.left;
  } else {
    const j = judgeLink(key, lead, wing, { wingPlane });
    labels = j.labels;
    numbers = j.numbers;
    left = j.rel.left;
  }
  const inBand = labels.length === 0;
  const sided = FORMATIONS[key].sided && key !== 'lab' ? ` ${left > 0 ? 'left' : 'right'}` : key === 'lab' ? `, ${left > 0 ? 'left' : 'right'}` : '';
  return { key, inBand, labels, text: `${word}${sided}: ${inBand ? 'IN POSITION' : labels.join(', ')}, ${numbers}.`, tone: inBand ? 'good' : 'caution' };
}

/**
 * The four against formation `key` with #2 on side s (design section 7), each wingman off the aircraft the table says he
 * flies off. Margins: the shared ±100 ft for the wide formations; the fighting wing links get the shared ±100 ft and ±5°
 * round SMM 12.29 para 69's band, because #3 and #4's default sits at its flat end (30°); the close links are the 2-ship's
 * bands.
 */
function formationFour(key, aircraft, s, spacingFt) {
  const by = new Map(aircraft.map((a) => [a.id, a]));
  const lead = by.get(1);
  const slots = slotsFor(key, s, { ships: 4, spacingFt, stacked: true });
  const ships = [2, 3, 4].map((id) => {
    const wing = by.get(id);
    const ref = by.get(slots[id].ref);
    const want = slots[id];
    let labels = [];
    let numbers = '';
    const rel = relativeTo(ref, wing);
    const stackOff = () => {
      if (Math.abs(wing.altAboveFt - lead.altAboveFt - want.alt) > JUDGE_MARGIN_FT) labels.push('OFF STACK');
    };
    if (key === 'spread4' || (key === 'offsetBox' && id !== 3) || (key === 'fluid4' && id === 3)) {
      const gap = key === 'fluid4' ? FLUID4_ABEAM_FT : spacingFt;
      const j = judgeLink('abreast', ref, wing, { spacingFt: gap });
      labels = [...j.labels];
      if (Math.sign(rel.left) !== Math.sign(want.left)) labels.push('WRONG SIDE');
      numbers = `${ft(j.acrossFt)} abeam (${ft(gap)}), ${ft(j.foreAftFt)} ${j.foreAftFt >= 0 ? 'ahead' : 'behind'}`;
      stackOff();
    } else if (key === 'offsetBox') {
      const depth = -rel.fwd;
      if (depth < BOX_DEPTH_BAND_FT[0]) labels.push('SHORT');
      else if (depth > BOX_DEPTH_BAND_FT[1]) labels.push('DEEP');
      if (Math.abs(rel.left - want.left) > BOX_SLOT_MARGIN_FT) labels.push('OFF SLOT');
      numbers = `${ft(depth)} behind (6,000-8,000), ${ft(rel.left - want.left)} off the slot`;
      stackOff();
    } else if (key === 'fw' || key === 'fluidMan' || key === 'fluid4') {
      const j = judgeLink('fw', ref, wing, { marginFt: JUDGE_MARGIN_FT, marginDeg: MARGIN_DEG, needBelow: false });
      labels = [...j.labels];
      if (Math.sign(j.rel.left) !== Math.sign(want.left)) labels.push('WRONG SIDE');
      numbers = j.numbers;
      if (key === 'fluid4') stackOff();
    } else {
      // Close formations: each link is a 2-ship echelon, route or line astern judged by the 2-ship's own bands.
      const kind = closeLinkKind(key, id);
      const j = judgeLink(kind, ref, wing);
      labels = [...j.labels];
      // The card's words as before step 1: a link with two or more labels repeats all but the first ahead of its numbers
      // (TS-64 lists this for Patrick; kept so step 1 changes no words).
      numbers = j.labels.length > 1 ? `${j.labels.slice(1).join(', ')}, ${j.numbers}` : j.numbers;
      if (kind !== 'astern' && Math.sign(rel.left) !== Math.sign(want.left)) labels.push('WRONG SIDE');
    }
    return { id, name: NAMES[id], refName: NAMES[slots[id].ref], labels, text: `${NAMES[id]} off ${NAMES[slots[id].ref]}: ${labels.length ? labels.join(', ') : 'IN POSITION'}, ${numbers}` };
  });
  const inBand = ships.every((x) => x.labels.length === 0);
  const labels = inBand ? ['IN POSITION'] : ships.filter((x) => x.labels.length).flatMap((x) => x.labels.map((l) => `${x.name} ${l}`));
  return {
    key,
    inBand,
    ships,
    labels,
    text: `${fourWords({ key, side: s })}: ${inBand ? 'IN POSITION' : labels.join(', ')}. ${ships.map((x) => x.text).join('; ')}.`,
    tone: inBand ? 'good' : 'caution',
  };
}

/** The four's roll-out from a line abreast manoeuvre: every wingman off the aircraft in his `ref` (SMM 16.42 para 116: #2 and #3 off Lead, #4 off #3). */
function rollOutFour(aircraft, shape, spacingFt) {
  const byId = new Map(aircraft.map((a) => [a.id, a]));
  const ships = aircraft
    .filter((a) => a.ref != null)
    .map((a) => {
      const ref = byId.get(a.ref);
      return { id: a.id, name: nameOf(a), refName: nameOf(ref), ...judgePair(ref, a, spacingFt, shape) };
    });
  const good = (x) => x.labels[0] === 'ON SPACING' || x.labels[0] === 'IN TRAIL';
  const labels = ships.every(good) ? [shape === 'trail' ? 'IN TRAIL' : 'ON SPACING'] : ships.filter((x) => !good(x)).flatMap((x) => x.labels.map((l) => `${x.name} ${l}`));
  return { shape, ships, labels };
}

// ---- the tags' words, from the same link judge ------------------------------------------------------------------------

/**
 * The tag's word for a wingman in fighting wing off ref: { state, rangeFt, sweepDeg, distanceOnly } (sweep back from ref's
 * wing line). The fighting wing link judged with no margin and no height check, in the tag's words: TIGHT (too close),
 * STRETCHED (too far), OUT OF CONE (outside the sweep), IN POSITION. distanceOnly: Lead is manoeuvring, so only the
 * distance is judged (TIGHT, STRETCHED, IN RANGE: fluid.js rangeWord; Patrick 23:07Z, 23:08Z). Ahead of ref's 3/9 line is
 * AHEAD OF 3/9 either way.
 */
export function fwState(ref, wing, { distanceOnly = false } = {}) {
  const j = judgeLink('fw', ref, wing, { needBelow: false });
  const has = (...words) => j.labels.some((l) => words.includes(l));
  let state;
  if (j.rel.fwd > 0) state = 'AHEAD OF 3/9';
  else if (distanceOnly) state = rangeWord(j.rangeFt);
  else state = has('TOO CLOSE') ? 'TIGHT' : has('TOO FAR') ? 'STRETCHED' : has('TOO FLAT', 'TOO FAR BACK') ? 'OUT OF CONE' : 'IN POSITION';
  return { state, rangeFt: j.rangeFt, sweepDeg: j.sweepDeg, distanceOnly };
}

const TIGHT_WORDS = new Set(['TIGHT', 'TOO CLOSE', 'FORE']);
const STRETCHED_WORDS = new Set(['WIDE', 'AFT', 'TOO FAR BACK', 'TOO FAR']);

/**
 * The tag's word for a close link (kind 'echelon', 'route' or 'astern'), judged in ref's wing plane so a wingman stepped
 * up or down in a turn is in place: IN POSITION; too close (TIGHT, TOO CLOSE, FORE) TIGHT; too far (WIDE, AFT, TOO FAR
 * BACK) STRETCHED; otherwise the judgement's own word (HIGH, LOW, OFF LINE).
 */
export function closeState(kind, ref, wing) {
  const j = judgeLink(kind, ref, wing, { wingPlane: true });
  if (!j.labels.length) return 'IN POSITION';
  if (j.labels.some((l) => TIGHT_WORDS.has(l))) return 'TIGHT';
  if (j.labels.some((l) => STRETCHED_WORDS.has(l))) return 'STRETCHED';
  return j.labels[0];
}
