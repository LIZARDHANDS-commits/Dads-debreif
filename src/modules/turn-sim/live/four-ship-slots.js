// The 4-ship's formations in one table (Turn Sim spec section 8, decision TS-54; design: project files
// turn-sim-review/four-ship/design.md sections 3, 4 and 7). Each formation says, for #2, #3 and #4, which
// aircraft it flies off (`ref`) and where it sits in that aircraft's frame. The planner (four-ship-moves.js),
// the classifier (which formation the four are in now), the judge (the card) and the slots the aircraft fly to
// all read this one table, so there is never a second copy of a position (rule book: one source of truth).
//
// Frames and units: feet; fwd and left in the reference aircraft's frame (left of its heading is +); alt is the
// height against LEAD (so a stack reads the same whoever an aircraft flies off). The side s is #2's side of Lead
// (+1 left, -1 right) in every formation, as the Setup box "#2 on Lead's" is.
//
// Sources (page references only):
//  - Spread 4: #2 and #3 LAB off Lead on opposite sides, #4 LAB off #3 outside it; the brief's stack #2 +300,
//    Lead 0, #3 -300, #4 -600 (SMM 16.42 paras 113, 116, Fig 16.33; AFM8 brief pp.14-15; TS-50).
//  - Offset box: each element a LAB, the second 6,000-8,000 ft behind (7,000 default, TS-18), #3 in the slot between
//    Lead and #2, #4 outside #2, same stack (SMM 16.41 paras 109-112, Figs 16.30-16.32; AFM8 brief pp.14, 20-24).
//  - Fluid 4: #3 6,000 ft abeam of Lead (wide LAB), #2 in fighting wing off Lead and #4 off #3, each on the outside;
//    stack once in position (AFM8 brief p.20).
//  - Fighting wing: each wingman off the preceding aircraft, #3 and #4 on the side opposite #2 (SMM 16.38 paras
//    104-107, Fig 16.29; AFM7 brief p.14); 500-1,000 ft and 30-60° (SMM 12.29 para 69). Defaults #2 45°, #3 and #4
//    30°, all 650 ft (Patrick, 4 Oct 11:44Z; estimates until Dad says). The stack is kept when it comes from Spread 4,
//    the offset box or Fluid 4 ("while maintaining stack", AFM7 brief p.17, AFM8 brief p.19).
//  - Finger: #2 and #3 echelon on Lead on opposite sides, #4 echelon on #3 (SMM 16.23 para 73, Fig 16.27; AFM7 brief
//    p.18). Echelon: each on the one ahead, all on one side (SMM Fig 16.27; AFM7 brief p.19). Box: #2 and #3 echelon on
//    Lead, #4 line astern on Lead (SMM 16.23 para 73, 16.32 para 91; AFM7 brief p.20). Line astern: each behind the one
//    ahead (SMM Fig 16.27, 12.5 para 13). Route: finger at route spacing (AFM7 brief p.18 item 2; SMM 12.6 para 15).
//    The close positions in feet are the 2-ship's estimates (transitions.js slotFor), the manuals give sight references.
import { relativeTo, DEG } from './manoeuvres.js';
import { classifyPair, judgeFormation, slotFor } from './transitions.js';
import { judgePair } from './formation.js';
import { STACK_FT } from './four-ship.js';

/** The 4-ship's formations, their words and the speed they are flown at (KIAS: 200 outside line abreast, 220 in it, Patrick 4 Oct 11:08Z). */
export const FOUR_FORMATIONS = Object.freeze({
  spread4: { label: 'Spread 4', kias: 220, sided: true },
  offsetBox: { label: 'Offset box', kias: 220, sided: true }, // 220: two line abreasts (estimate, design question 9)
  fluid4: { label: 'Fluid 4', kias: 200, sided: true }, // 200: two fighting-wing pairs (estimate, design question 9)
  fluidMan: { label: 'Fluid manoeuvring', kias: 200, sided: true, later: true }, // the live build, later
  fw: { label: 'Fighting wing', kias: 200, sided: true },
  finger: { label: 'Finger', kias: 200, sided: true },
  echelon: { label: 'Echelon', kias: 200, sided: true },
  box: { label: 'Box', kias: 200, sided: true },
  trail: { label: 'Line astern', kias: 200, sided: false },
  route: { label: 'Route', kias: 200, sided: true },
});

/**
 * Four-ship fighting wing: each link 650 ft; #2 at 45°, #3 and #4 at 30° (Patrick, 4 Oct 11:44Z; estimates until Dad says).
 * The angles are sweep back from the wing line of the aircraft flown off, the manual's way (SMM 12.29 para 69, Fig 12.19).
 * #3 and #4 sit on the side opposite #2 (SMM 16.38 para 104; AFM7 brief p.14). Their 30° matches Fig 16.29's picture; the
 * para 104 text says a 60° sweep: both are written down, and Patrick chose to set it himself through the setting (TS-58).
 */
export const FW4 = Object.freeze({ rangeFt: 650, twoDeg: 45, otherDeg: 30 });
/**
 * The desired places now: FW4 by default, changed by the settings (Patrick 21:25Z, TS-58). #2's pair (spacing and sweep off
 * Lead; #4 off #3 in Fluid 4 too) and #3/#4's pair (each off the one ahead in fighting wing).
 */
let fw4 = { twoRangeFt: FW4.rangeFt, twoDeg: FW4.twoDeg, otherRangeFt: FW4.rangeFt, otherDeg: FW4.otherDeg };

/** Sets the four-ship's desired fighting wing places ({ twoRangeFt, twoDeg, otherRangeFt, otherDeg }; a missing value takes FW4's). */
export function setFw4Shape({ twoRangeFt = FW4.rangeFt, twoDeg = FW4.twoDeg, otherRangeFt = FW4.rangeFt, otherDeg = FW4.otherDeg } = {}) {
  fw4 = { twoRangeFt, twoDeg, otherRangeFt, otherDeg };
}

/** The four-ship's desired fighting wing places now. */
export function fw4ShapeNow() {
  return { ...fw4 };
}
/** Fighting wing with no stack (entered from a close formation): each aircraft 60 ft below the one it flies off, the 2-ship's estimate. */
export const FW_STEP_DOWN_FT = 60;
/** The offset box's second element sits this far behind the first (TS-18; SMM 16.41 para 109 gives 6,000-8,000 ft). */
export const BOX_DEPTH_FT = 7000;
export const BOX_DEPTH_BAND_FT = Object.freeze([6000, 8000]);
/** Fluid 4: #3 this far abeam of Lead, the wide LAB (AFM8 brief p.20). */
export const FLUID4_ABEAM_FT = 6000;
/** #3's place in the offset box slot may be this far off sideways before it is named (estimate, design section 7). */
const BOX_SLOT_MARGIN_FT = 500;
/** The shared table's margin, ±100 ft (docs/TESTING.md). */
const MARGIN_FT = 100;
const MARGIN_DEG = 5;

const NAMES = Object.freeze({ 1: 'Lead', 2: '#2', 3: '#3', 4: '#4' });
const fwAt = (rangeFt, deg, side) => ({ fwd: -rangeFt * Math.sin(deg * DEG), left: side * rangeFt * Math.cos(deg * DEG) });

/**
 * Where each wingman sits for formation `key` with #2 on side s: { 2: { ref, fwd, left, alt }, 3: …, 4: … }.
 * options.spacingFt: the LAB gap (Spread 4, offset box elements); options.stacked: fighting wing keeps the stack.
 */
export function fourSlots(key, s, { spacingFt = 6000, stacked = true } = {}) {
  const ech = (side) => slotFor('echelon', side);
  const rte = (side) => slotFor('route', side);
  const ast = slotFor('astern', 0);
  switch (key) {
    case 'spread4':
      return {
        2: { ref: 1, fwd: 0, left: s * spacingFt, alt: STACK_FT[2] },
        3: { ref: 1, fwd: 0, left: -s * spacingFt, alt: STACK_FT[3] },
        4: { ref: 3, fwd: 0, left: -s * spacingFt, alt: STACK_FT[4] },
      };
    case 'offsetBox':
      return {
        2: { ref: 1, fwd: 0, left: s * spacingFt, alt: STACK_FT[2] },
        3: { ref: 1, fwd: -BOX_DEPTH_FT, left: s * spacingFt / 2, alt: STACK_FT[3] },
        4: { ref: 3, fwd: 0, left: s * spacingFt, alt: STACK_FT[4] },
      };
    case 'fluid4':
      // #4 flies fighting wing off #3 as #2 does off Lead: #2's spacing and sweep setting (FW4: 650 ft at 45° by default, an estimate).
      return {
        2: { ref: 1, ...fwAt(fw4.twoRangeFt, fw4.twoDeg, s), alt: STACK_FT[2] },
        3: { ref: 1, fwd: 0, left: -s * FLUID4_ABEAM_FT, alt: STACK_FT[3] },
        4: { ref: 3, ...fwAt(fw4.twoRangeFt, fw4.twoDeg, -s), alt: STACK_FT[4] },
      };
    case 'fw':
    case 'fluidMan':
      return {
        2: { ref: 1, ...fwAt(fw4.twoRangeFt, fw4.twoDeg, s), alt: stacked ? STACK_FT[2] : -FW_STEP_DOWN_FT },
        3: { ref: 2, ...fwAt(fw4.otherRangeFt, fw4.otherDeg, -s), alt: stacked ? STACK_FT[3] : -2 * FW_STEP_DOWN_FT },
        4: { ref: 3, ...fwAt(fw4.otherRangeFt, fw4.otherDeg, -s), alt: stacked ? STACK_FT[4] : -3 * FW_STEP_DOWN_FT },
      };
    case 'finger':
      return {
        2: { ref: 1, ...ech(s) },
        3: { ref: 1, ...ech(-s) },
        4: { ref: 3, ...ech(-s), alt: 2 * ech(-s).alt },
      };
    case 'route':
      return {
        2: { ref: 1, ...rte(s) },
        3: { ref: 1, ...rte(-s) },
        4: { ref: 3, ...rte(-s), alt: 2 * rte(-s).alt },
      };
    case 'echelon':
      return {
        2: { ref: 1, ...ech(s) },
        3: { ref: 2, ...ech(s), alt: 2 * ech(s).alt },
        4: { ref: 3, ...ech(s), alt: 3 * ech(s).alt },
      };
    case 'box':
      return {
        2: { ref: 1, ...ech(s) },
        3: { ref: 1, ...ech(-s) },
        4: { ref: 1, ...ast },
      };
    case 'trail':
      return {
        2: { ref: 1, ...ast },
        3: { ref: 2, ...ast, alt: 2 * ast.alt },
        4: { ref: 3, ...ast, alt: 3 * ast.alt },
      };
    default:
      throw new Error(`No four-ship formation called ${key}`);
  }
}

/** Who flies off whom in a formation: { 2: id, 3: id, 4: id }. */
export function refsFor(key) {
  const slots = fourSlots(key, -1);
  return { 2: slots[2].ref, 3: slots[3].ref, 4: slots[4].ref };
}

/** True when the four are on the stack (each wingman more than 150 ft from Lead's height): fighting wing then keeps it. */
export function isStacked(aircraft) {
  const lead = aircraft[0];
  return aircraft.slice(1).every((a) => Math.abs(a.altAboveFt - lead.altAboveFt) > 150);
}

const CLOSE = ['finger', 'echelon', 'box', 'trail', 'route'];
/** A close formation is recognised when every wingman is this close to its place (an estimate, wide enough for a slide still settling). */
const CLOSE_TOL_FT = 15;

/**
 * Which formation the four are in now, from where they really are: { key, side } with key one of FOUR_FORMATIONS or
 * 'other' (design section 4: classify from the real slots; anything else is 'other').
 */
export function classifyFour(aircraft) {
  const by = new Map(aircraft.map((a) => [a.id, a]));
  const [L, two, three, four] = [by.get(1), by.get(2), by.get(3), by.get(4)];
  const pair = (a, b) => classifyPair(a, b);
  const c2 = pair(L, two);
  const side = c2.side || Math.sign(relativeTo(L, two).left) || -1;

  // Close formations: the nearest table entry, if every wingman is within a few feet of it.
  let best = { key: 'other', side, err: Infinity };
  for (const key of CLOSE) {
    for (const s of key === 'trail' ? [side] : [1, -1]) {
      const slots = fourSlots(key, s);
      let err = 0;
      for (const id of [2, 3, 4]) {
        const rel = relativeTo(by.get(slots[id].ref), by.get(id));
        err = Math.max(err, Math.hypot(rel.fwd - slots[id].fwd, rel.left - slots[id].left));
      }
      if (err < best.err) best = { key, side: key === 'trail' ? 0 : s, err };
    }
  }
  if (best.err <= CLOSE_TOL_FT) return { key: best.key, side: best.side };

  const c3 = pair(L, three);
  const c34 = pair(three, four);
  if (c2.key === 'lab' && c3.key === 'lab' && c34.key === 'lab' && c3.side === -c2.side && c34.side === c3.side) return { key: 'spread4', side: c2.side };
  const c23 = pair(two, three);
  if (c2.key === 'fw' && c23.key === 'fw' && c34.key === 'fw' && c23.side === -c2.side && c34.side === c23.side) return { key: 'fw', side: c2.side };
  if (c2.key === 'fw' && c3.key === 'lab' && c34.key === 'fw' && c3.side === -c2.side && c34.side === c3.side) return { key: 'fluid4', side: c2.side };
  if (c2.key === 'lab') {
    const r3 = relativeTo(L, three);
    const across2 = Math.abs(relativeTo(L, two).left);
    if (r3.fwd < -3000 && r3.fwd > -13000 && r3.left * c2.side > 0 && Math.abs(r3.left) < across2 && c34.key === 'lab' && c34.side === c2.side) return { key: 'offsetBox', side: c2.side };
  }
  // No formation: #2's side only when it is clearly to one side (in a column after an in-place turn it is not, and the
  // side last seen is used instead; 100 ft is the shared margin).
  return { key: 'other', side: Math.abs(relativeTo(L, two).left) > MARGIN_FT ? side : 0 };
}

/** The words for where the four are: "Finger left (#3 and #4 left)", "Spread 4, #2 right". */
export function fourWords(where) {
  const f = FOUR_FORMATIONS[where.key];
  if (!f) return 'between formations';
  const w = (s) => (s > 0 ? 'left' : 'right');
  switch (where.key) {
    case 'finger':
    case 'route':
      return `${f.label} ${w(-where.side)} (#3 and #4 ${w(-where.side)})`;
    case 'echelon':
      return `${f.label} ${w(where.side)}`;
    case 'offsetBox':
      return `${f.label} ${w(where.side)}`;
    case 'trail':
      return f.label;
    case 'fluid4':
      return `${f.label}, #3 ${w(-where.side)}`;
    default:
      return `${f.label}, #2 ${w(where.side)}`;
  }
}

const ft = (n) => `${Math.round(Math.abs(n)).toLocaleString('en-CA')} ft`;

/**
 * A fighting wing link judged against SMM 12.29 para 69's band, 500-1,000 ft and 30-60°, with the shared margins round it
 * (±100 ft, ±5°: design section 7, docs/TESTING.md): #3 and #4's default sits at the flat end of the band (30°).
 */
function judgeFwLink(ref, wing) {
  const rel = relativeTo(ref, wing);
  const range = Math.hypot(rel.fwd, rel.left);
  const sweep = Math.atan2(-rel.fwd, Math.max(Math.abs(rel.left), 1e-6)) / DEG;
  const labels = [];
  if (range < 500 - MARGIN_FT) labels.push('TOO CLOSE');
  else if (range > 1000 + MARGIN_FT) labels.push('TOO FAR');
  if (sweep < 30 - MARGIN_DEG) labels.push('TOO FLAT');
  else if (sweep > 60 + MARGIN_DEG) labels.push('TOO FAR BACK');
  return { labels, numbers: `${ft(range)} (500-1,000), sweep ${Math.round(sweep)}° (30-60°)`, side: Math.sign(rel.left) };
}

/**
 * Judges the four against formation `key` with #2 on side s (design section 7), each wingman off the aircraft it flies
 * off. Returns { key, inBand, ships: [{ id, name, refName, labels, text }], labels, text, tone }. Margins: the shared ±100 ft
 * for the wide formations, the 2-ship's close-formation margins (transitions.js judgeFormation) for the close ones.
 */
export function judgeFourFormation(key, aircraft, s, { spacingFt = 6000 } = {}) {
  const by = new Map(aircraft.map((a) => [a.id, a]));
  const lead = by.get(1);
  const slots = fourSlots(key, s, { spacingFt, stacked: true });
  const ships = [2, 3, 4].map((id) => {
    const wing = by.get(id);
    const ref = by.get(slots[id].ref);
    const want = slots[id];
    let labels = [];
    let numbers = '';
    const rel = relativeTo(ref, wing);
    const stackOff = () => {
      if (Math.abs(wing.altAboveFt - lead.altAboveFt - want.alt) > MARGIN_FT) labels.push('OFF STACK');
    };
    if (key === 'spread4' || (key === 'offsetBox' && id !== 3) || (key === 'fluid4' && id === 3)) {
      const gap = key === 'fluid4' ? FLUID4_ABEAM_FT : spacingFt;
      const j = judgePair(ref, wing, gap);
      labels = j.labels[0] === 'ON SPACING' ? [] : [...j.labels];
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
      const j = judgeFwLink(ref, wing);
      labels = j.labels;
      if (j.side !== Math.sign(want.left)) labels.push('WRONG SIDE');
      numbers = j.numbers;
      if (key === 'fluid4') stackOff();
    } else {
      // Close formations: each link is a 2-ship echelon, route or line astern judged by the 2-ship's own table.
      const pairKey = key === 'trail' || (key === 'box' && id === 4) ? 'astern' : key === 'route' ? 'route' : 'echelon';
      const j = judgeFormation(pairKey, ref, wing);
      labels = [...j.labels];
      if (pairKey !== 'astern' && Math.sign(rel.left) !== Math.sign(want.left)) labels.push('WRONG SIDE');
      numbers = j.text.slice(j.text.indexOf(',', j.text.indexOf(':')) + 2).replace(/\.$/, '');
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
