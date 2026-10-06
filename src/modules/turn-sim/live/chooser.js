// The chooser (TS-76; Patrick 5 Oct 2026 18:11Z: "dynamically hand off between lines, tracker, and the 'AI'"; card 18:51Z
// "Checks, then quickest"; review /mnt/project-files/turn-sim-review/chooser/plan.md): one scoreboard for every way the
// 2-ship can fly a change of formation. Each planner (the turning rejoin, the straight-ahead rejoin, echelon or route out to
// fighting wing, a line then the tracker, the tracker alone) is already a search over its own candidates, flown as dry runs
// through the real step; until V2.75 formation.js tried them in a fixed order and the first that accepted the case flew it.
// Now every planner that applies is run, each returns its best, and the scoreboard picks:
//   1. the pilot's checks first: IN POSITION at the end (the judge's band) and behind Lead's 3/9 line on the way in (the
//      overshoot lane, SMM 12.27 para 65; Patrick 08:04Z). A candidate that fails either is out, whatever its time. The
//      planners already keep the speed floors (TS-75) and the 500 ft bubble inside their own searches;
//   2. then far away a held technique, not the tracker alone: a start more than the hand-over range (500 ft) from the slot
//      is a long move, flown as a pilot flies it (a line or a held bank and power, the rejoin review's lesson; Patrick
//      05:27Z "tracker for fallback", 05:41Z "lines, then tracker"), so the tracker alone wins there only when no technique
//      passes. Inside the hand-over range the move is the tracker's and it competes like the rest;
//   3. then the G rule: a candidate that banks past the normal 5 G ranks below one that doesn't (over 5 G is a last resort,
//      Patrick 03:05Z; a flag, never a wall);
//   4. then quickest (Patrick 08:12Z: "fast and effective like the SMM");
//   5. then, within half a second, smoothest: the fewest bank reversals and power changes along #2's track.
// One candidate shape (refactor PR 2, Fable's plan 23:20Z; TS-94): every planner, the lag roll included, hands back a plan in
// planGoTo's shape and candidateOf is the only place it is scored. A training error's start (errors.js, TS-62) is raced like
// any other: "from here" reads where the error put #2 (until V2.93 the hot rejoin, hot-rejoin.js, flew it on its own).
// The chooser changes no flight physics and no planner: it only picks between them.
// What re-plans when (the press, the hand-over, the decision point, the picture breaking: spec F1 and F11 as reworded by
// TS-76) is formation.js's and hand-over.js's; this file only chooses.
import { pairSlot } from './slots.js';
import { relativeTo } from './manoeuvres.js';
import { G_RULE_BANK_DEG, HAND_OVER_FT } from './tuning.js';
import { planGoTo } from './transitions.js';
import { planLagRoll, LAG_ROLL_KEY } from './lag-roll.js';
import { planMoveInBand, MOVE_IN_BAND_KEY } from './move-in-band.js';
import { planLineChange } from './line-moves.js';
import { planTurningRejoin } from './turning-rejoin.js';
import { planStraightRejoin } from './straight-rejoin.js';
import { planEchelonToFw } from './echelon-to-fw.js';
import { planOpenOut } from './open-out.js';
import { planFromHere } from './replan.js';

/** The overshoot lane's margin: inside 1,000 ft #2 may pass this far ahead of his slot toward Lead's 3/9 line, never more (the shared 100 ft margin, design section 10). */
export const LANE_MARGIN_FT = 100;
/** Two candidates closer than this in time are a tie, settled by smoothness (turning-rejoin.js uses the same half second). */
export const TIE_SEC = 0.5;
/** A bank under this is "wings level" when counting reversals (estimate). */
const BANK_DEADBAND_DEG = 5;

/**
 * The planners the scoreboard races, each with the words for the card. `rejoin` says which Rejoin kind the planner needs:
 * with the Rejoin kind set to 'auto' both rejoins run and the quicker wins; set to 'into' or 'straight' only that one does
 * (Patrick 07:19Z: TRJ and SARJ are two separate rejoins, and which one is Lead's call).
 */
const PLANNERS = Object.freeze([
  { name: 'turning rejoin', plan: planTurningRejoin, rejoin: 'into', fallback: false },
  { name: 'straight-ahead rejoin', plan: planStraightRejoin, rejoin: 'straight', fallback: false },
  { name: 'drop back out to fighting wing', plan: planEchelonToFw, rejoin: null, fallback: false },
  { name: 'opening out at full power', plan: planOpenOut, rejoin: null, fallback: false },
  { name: 'line, then tracker', plan: planLineChange, rejoin: 'into', fallback: false },
  { name: 'tracker', plan: planGoTo, rejoin: 'into', fallback: true }, // the fallback on a long move (rule 2 above)
]);

/**
 * A press while a move is still flown (spec F11, replan.js): "from here" joins the race, the tracker from where #2 is
 * against Lead flying on. The line is left out (it starts #2 at rest in Lead's frame), and so is a training error's rejoin
 * (its lesson starts from line abreast). In a turn of Lead's own only "from here" runs: every other planner flies Lead
 * straight, and a formation command for #2 doesn't change Lead's flying.
 */
const FROM_HERE = Object.freeze({ name: 'from here', plan: planFromHere, rejoin: null, fallback: true });
/** #2's lag roll (lag-roll.js, TS-71): a button of its own, so it is the only candidate when pressed and never raced otherwise. */
const LAG_ROLL = Object.freeze({ name: 'lag roll', plan: (pair, _to, options, t0) => planLagRoll(pair, options, t0), rejoin: null, fallback: false });
/** #2 moving inside the band of the formation he is in (move-in-band.js, TS-98): a control of its own, the only candidate when pressed. */
const MOVE_IN_BAND = Object.freeze({ name: 'move in the band', plan: (pair, _to, options, t0) => planMoveInBand(pair, options.target, options, t0), rejoin: null, fallback: false });
const MID_PLANNERS = Object.freeze([FROM_HERE, ...PLANNERS.filter((p) => p.plan !== planLineChange)]);

/**
 * How rough #2's track is: bank reversals (the bank crossing from one side to the other, past the deadband) plus power
 * changes (a change of the stage the tag shows: MAX, power, idle, boards), counted along the recorded bank track or the
 * poses of a line. A tie-break only.
 */
export function roughness(wingPlan) {
  let reversals = 0;
  let powerChanges = 0;
  let side = 0;
  let stage;
  for (const seg of wingPlan?.segments ?? []) {
    const rows = seg.kind === 'bankTrack' ? seg.points : seg.kind === 'poseTrack' ? seg.poses : [];
    for (const row of rows) {
      const bank = Array.isArray(row) ? row[0] : row.bank;
      const st = Array.isArray(row) ? row[2]?.stage ?? null : row.stage ?? null;
      if (bank > BANK_DEADBAND_DEG && side < 0) reversals++;
      else if (bank < -BANK_DEADBAND_DEG && side > 0) reversals++;
      if (Math.abs(bank) > BANK_DEADBAND_DEG) side = Math.sign(bank);
      if (stage !== undefined && st !== stage) powerChanges++;
      stage = st;
    }
  }
  return reversals + powerChanges;
}

/**
 * The one candidate shape (TS-94): one planner's plan as a candidate on the scoreboard, the only place any plan is scored.
 * { name, plan (planGoTo's shape: plans, endSec, judged, laneFwdFt, maxBankDeg, note), durationSec, maxG, inBand, laneOk,
 * passes, fallback, gRuleOk, roughness, words }. `to` and `spacingFt` give the slot the overshoot lane is measured against;
 * `fallback` marks the tracker alone on a long move (rule 2 above). maxG is the plan's own when it gives one (the lag roll's
 * pull), else the level-turn G of its steepest bank.
 */
export function candidateOf(name, plan, to, spacingFt, t0, wingId, fallback = false) {
  const slotFwd = Math.max(0, pairSlot(to, plan.side || plan.fromSide || -1, spacingFt)?.fwd ?? 0);
  const inBand = plan.judged?.inBand ?? true;
  const laneOk = (plan.laneFwdFt ?? -Infinity) <= slotFwd + LANE_MARGIN_FT;
  const bank = Math.min(89, Math.abs(plan.maxBankDeg ?? 0));
  const maxG = plan.maxG ?? plan.lagRoll?.maxG ?? 1 / Math.cos((bank * Math.PI) / 180);
  const gRuleOk = plan.lagRoll ? true : (plan.maxBankDeg ?? 0) <= G_RULE_BANK_DEG + 0.5; // the lag roll rolls through the inverted: its pull is its own (TS-71)
  const durationSec = Math.max(0, (plan.endSec ?? t0) - t0);
  const c = { name, plan, inBand, laneOk, passes: inBand && laneOk, fallback, gRuleOk, durationSec, maxG, roughness: roughness(plan.plans?.[wingId]) };
  return { ...c, words: words(c) };
}

/** How far #2 is from the slot he is going to, in Lead's frame, horizontally (feet). */
export function rangeToSlotFt(pair, to, options = {}) {
  const [lead, wing] = pair;
  const rel = relativeTo(lead, wing);
  const s = Math.sign(rel.left) || options.lastSide || -1;
  const want = options.side ?? 'keep';
  const sTo = to === 'astern' ? 0 : want === 'left' ? 1 : want === 'right' ? -1 : s;
  const slot = pairSlot(to, sTo || s, options.spacingFt ?? 6000);
  return slot ? Math.hypot(rel.fwd - slot.fwd, rel.left - slot.left) : Infinity;
}

/** The scoreboard's order: the checks, then a technique before the fallback, then the G rule, then quickest, then smoothest within TIE_SEC. */
export function compareCandidates(a, b) {
  if (a.passes !== b.passes) return a.passes ? -1 : 1;
  if (a.fallback !== b.fallback) return a.fallback ? 1 : -1;
  if (a.gRuleOk !== b.gRuleOk) return a.gRuleOk ? -1 : 1;
  if (Math.abs(a.durationSec - b.durationSec) > TIE_SEC) return a.durationSec - b.durationSec;
  if (a.roughness !== b.roughness) return a.roughness - b.roughness;
  return a.durationSec - b.durationSec;
}

/** "turning rejoin 58 s" for the card's comparison line. */
function words(c) { return `${c.name} ${Math.round(c.durationSec)} s${c.passes ? '' : ' (fails a check)'}${c.fallback ? ' (the fallback on a long move)' : ''}${c.gRuleOk ? '' : ' (over the G rule)'}`; }

/**
 * Plans a change of formation for the pair (planGoTo's shape, transitions.js): runs every planner that applies from where
 * the aircraft are now, scores their plans, and returns the winner with `chooser: { picked, compared }` and a comparison
 * line added to its note. options: planGoTo's ({ side, spacingFt, blockFt, rejoin, lastSide, errors }); rejoin 'auto' races
 * the turning and straight-ahead rejoins against each other. With no candidate the tracker's own refusal is returned, so
 * the card's reason reads as before.
 */
export function chooseChange(pair, to, options = {}, t0 = 0) {
  const wing = pair[1];
  const spacingFt = options.spacingFt ?? 6000;
  const auto = (options.rejoin ?? 'into') === 'auto';
  const mid = options.mid ?? null;
  const lag = to === LAG_ROLL_KEY;
  const nudge = to === MOVE_IN_BAND_KEY;
  const longMove = !lag && !nudge && rangeToSlotFt(pair, to, options) > HAND_OVER_FT;
  const candidates = [];
  let refusal = null;
  // Lead's turn into #2 held with #2 going to the other side: only "from here" keeps Lead turning until #2 is in there
  // (Patrick 5 Oct 22:35Z; TS-87); the other planners would roll him out.
  const sNow = Math.sign(relativeTo(pair[0], wing).left);
  const across = mid?.lead?.kind === 'hold' && to !== 'lab' && ((options.side === 'left' && sNow < 0) || (options.side === 'right' && sNow > 0));
  // A training error's start (TS-62) joins "from here" to the race, which reads where the error put #2.
  const planners = lag ? [LAG_ROLL] : nudge ? [MOVE_IN_BAND] : !mid ? (options.errors ? MID_PLANNERS : PLANNERS) : mid.lead?.kind === 'carry' || across ? [FROM_HERE] : MID_PLANNERS;
  for (const p of planners) {
    // Each planner refuses a Rejoin kind that is not its own; under 'auto' each rejoin planner is given its own kind.
    const opts = auto && p.rejoin !== null ? { ...options, rejoin: p.rejoin } : options;
    const r = p.plan(pair, to, opts, t0);
    if (!r) continue;
    if (!r.ok) {
      refusal ??= r;
      continue;
    }
    candidates.push(candidateOf(p.name, r, lag ? 'fw' : nudge ? /** @type {any} */ (r).to : to, spacingFt, t0, wing.id, p.fallback && longMove));
  }
  // Out to line abreast the full power opening out replaces the line (Patrick 5 Oct 22:39Z: "should start at FULL POWER";
  // TS-88): the line is raced only when it doesn't apply.
  if (candidates.some((c) => c.name === 'opening out at full power')) candidates.splice(0, candidates.length, ...candidates.filter((c) => c.name !== 'line, then tracker'));
  if (!candidates.length) return refusal ?? { ok: false, reason: 'No safe change from here.', from: null, to };
  candidates.sort(compareCandidates);
  const best = candidates[0];
  const others = candidates.slice(1);
  const compared = candidates.map((c) => ({ name: c.name, durationSec: c.durationSec, passes: c.passes, fallback: c.fallback, gRuleOk: c.gRuleOk, roughness: c.roughness }));
  const line = others.length ? ` Chosen: ${best.words}, over ${others.map((c) => c.words).join(', ')}.` : '';
  // With a training error set, the card says how #2 dealt with it when the move ends (errors.js offStandardOutcome).
  const offStandard = options.errors && !lag && !nudge ? { mode: options.errors.response === 'reference' ? 'reference' : 'fix' } : null;
  return { ...best.plan, note: `${best.plan.note}${line}`, chooser: { picked: best.name, compared }, ...(offStandard ? { offStandard } : {}) };
}
