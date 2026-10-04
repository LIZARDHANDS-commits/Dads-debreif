// The look-ahead: flying copies of the fight, never the fight itself, to see what a move would bring. Auto's
// Immelmann / pitch back race (noseOnRace, noseOnSec) and the Immelmann's lowest speed over the top
// (immelmannTopKias); the Tactical pilot's candidate moves and their 20 s dry runs (getFeasibleMoves,
// pickTacticalMove). The copies are stepped with the fight's own step, so they fly what the fight would.
import { KT_TO_FTPS } from '../../../core/units.js';
import { T6A_LIMITS, splitST6A, tasToIasKt, energyHeightFt } from '../../../core/t6-performance.js';
import { FIGHT_STEP_SEC, FIGHT_MAX_SEC } from '../sim.js';
import { ENERGY_DEFAULT_SETUP, TUNING, MOVE_LABELS, energyTopKias } from './setup.js';
import { len, velOf, readPair } from './frame.js';
import { stepAircraft } from './aircraft.js';
import { startMove } from './moves/index.js';
import { onTheOther, tacticalAdvantage, shouldPursueTactical } from './judge.js';
import { stepOnce, flyStraight, secondsToPass } from './fight.js';

/**
 * Flies a copy of the fight (with its plan already set) through the real steps to the merge. The straight run to the
 * pass is the same in every step (the courses do not change), so all but its last steps are flown in one go; the steps
 * that reach the pass, and the turns, are the real ones.
 */
function flyCopyToMerge(sim) {
  const wholeSteps = Math.floor((sim.setup.turnsStart === 'now' ? 0 : secondsToPass(sim)) / FIGHT_STEP_SEC) - 2;
  if (wholeSteps > 0 && wholeSteps * FIGHT_STEP_SEC < FIGHT_MAX_SEC) {
    flyStraight(sim, wholeSteps * FIGHT_STEP_SEC);
    sim.timeSec += wholeSteps * FIGHT_STEP_SEC;
    readPair(sim);
  }
  while (!sim.merged && !sim.stopped) {
    stepOnce(sim);
    if (sim.timeSec >= FIGHT_MAX_SEC - 1e-6) sim.stopped = true;
  }
}

/**
 * Seconds each of the two moves takes to start `who`'s chase, from the fight as it
 * stands; null for none in the look-ahead. The move `likely` to win runs first and
 * the other is stopped at its time: it cannot win by running longer. `later` names
 * that move when it was stopped.
 */
export function noseOnRace(from, who, kias, likely) {
  const unlikely = likely === 'immelmann' ? 'pitchBack' : 'immelmann';
  const first = noseOnSec(from, who, likely, kias, Infinity);
  const second = noseOnSec(from, who, unlikely, kias, first.sec ?? Infinity);
  const race = { immelmann: null, pitchBack: null };
  race[likely] = first.sec;
  race[unlikely] = second.sec;
  if (second.cut) race.later = unlikely;
  return race;
}

/**
 * One dry run of the whole fight, scored the way the real fight scores a chase. A
 * deep copy of `from` (the fight as it is, or at T+0 before the pass), `who` put in
 * `move`, the other flying as it would anyway, stepped with the fight's own step
 * until `who`'s chase would be named: its nose within 5° of the other with the
 * other's aspect 150° or less, or any nose-on with `chaseAfterHeadOn` (onTheOther,
 * the same rule the fight's chase uses, startChases). Returns { sec } from the pick (from the merge
 * before the pass) or null for no win, and { cut: true } when the run was stopped
 * for passing `cutSec`. No win means: the other's chase comes first, `who` goes
 * OVER G or STALLs, or pickLookaheadSec has gone. The real state is not touched.
 */
function noseOnSec(from, who, move, kias, cutSec) {
  const sim = structuredClone(from);
  sim.dry = true;
  const me = sim[who], you = who === 'blue' ? sim.red : sim.blue;
  let t0;
  if (!sim.merged) {
    // Before the pass: the real steps to the merge, with `who` planned to take `move` there.
    sim.plan = { ...from.plan, [who]: { move, why: '' } };
    flyCopyToMerge(sim);
    t0 = sim.mergeSec;
  } else {
    startMove(sim, me, move, '', kias);
    t0 = sim.timeSec;
  }
  const until = t0 + sim.setup.pickLookaheadSec;
  // `flags`: OVER G and STALL belong to a step the move has flown. At the pick itself they are the last move's.
  const judge = (flags) => {
    if (flags && (me.overG || me.stall)) return { sec: null };
    if (sim.deckLoss) return sim.deckLoss.winner === who ? { sec: sim.timeSec - t0 } : { sec: null }; // below the deck loses the fight (TF-R6)
    const mine = onTheOther(sim, me, you);
    const theirs = onTheOther(sim, you, me);
    if (theirs && !mine) return { sec: null };
    return mine ? { sec: sim.timeSec - t0 } : null;
  };
  let verdict = sim.merged ? judge(from.merged === false) : null;
  while (!verdict) {
    if (sim.timeSec >= until - 1e-9 || sim.stopped) return { sec: null };
    stepOnce(sim);
    if (sim.timeSec >= FIGHT_MAX_SEC - 1e-6) sim.stopped = true;
    if (sim.timeSec - t0 > cutSec + 1e-9) return { sec: null, cut: true };
    verdict = judge(true);
  }
  return verdict;
}

/**
 * The dry run: the lowest speed an Immelmann would reach on the way up and over
 * the top, found by flying a copy of the aircraft through it alone, with the
 * same control code and step, until it is over the top and starts to roll
 * upright (or has failed). The real aircraft and the real fight are not touched.
 */
export function immelmannTopKias(p, ac, other, kias) {
  const sim = structuredClone(ac);
  const alone = { setup: { ...p, collisionAvoidance: false } }; // alone: no other aircraft to break away from
  startMove(alone, sim, 'immelmann', '', kias);
  sim.ctl.prevKias = sim.kias; sim.ctl.kiasRateEff = 0;
  let low = sim.kias;
  for (let t = 0; t < TUNING.dryRunMaxSec; t += FIGHT_STEP_SEC) {
    stepAircraft(alone, sim, { pm: other?.pm ?? other }, FIGHT_STEP_SEC);
    low = Math.min(low, sim.kias);
    if (sim.ctl.phase !== 'main' || sim.move !== 'immelmann') break;
  }
  return low;
}

/**
 * Determine candidate maneuvers from authentic Harvard II envelopes and safety limits.
 * - immelmann: 180 <= KIAS <= 316 (T6A_LIMITS.vmoKias), apex speed >= (setup.immelmannMinTopKias ?? 120)
 * - pitchBack: 150 <= KIAS <= 260
 * - slice: 90 <= KIAS <= 175 and (ac.altFt - setup.hardDeckFt) > (setup.deckMarginFt ?? 1000)
 * - splitS: (setup.stallKias ?? 86) <= ac.kias <= 140 (D381), ac.altFt - lossFt > setup.hardDeckFt
 * - mpt: Always feasible
 *
 * @param {any} ac - Aircraft state or partial state
 * @param {any} [other] - Opponent aircraft state
 * @param {any} [setup] - Fight setup options
 * @returns {string[]} Array of candidate move names
 */
export function getFeasibleMoves(ac, other = null, setup = ENERGY_DEFAULT_SETUP) {
  const s = { ...ENERGY_DEFAULT_SETUP, ...(setup || {}) };
  const hardDeckFt = s.hardDeckFt ?? ENERGY_DEFAULT_SETUP.hardDeckFt;
  const deckMarginFt = s.deckMarginFt ?? 1000;
  const stallKias = s.stallKias ?? T6A_LIMITS.stallKias;
  const rollRateDegPerSec = s.rollRateDegPerSec ?? ENERGY_DEFAULT_SETUP.rollRateDegPerSec;
  const immelmannMinTopKias = s.immelmannMinTopKias ?? 120;

  const kias = ac?.kias ?? (ac?.pm ? tasToIasKt(len(velOf(ac.pm)) / KT_TO_FTPS, ac.pm.z) : 200);
  const altFt = ac?.altFt ?? ac?.pm?.z ?? 10000;

  const moves = [];

  // 1. Immelmann: 180 <= KIAS <= 316 (it can try if it wants; if low energy over top, stall recovery handles it)
  if (kias >= 180 && kias <= T6A_LIMITS.vmoKias) {
    moves.push('immelmann');
  }

  // 2. Pitch Back: 150 <= KIAS <= 260
  if (kias >= 150 && kias <= 260) {
    moves.push('pitchBack');
  }

  // 3. Slice: 90 <= KIAS <= 175 and altitude margin > deckMarginFt
  if (kias >= 90 && kias <= 175 && (altFt - hardDeckFt) > deckMarginFt) {
    moves.push('slice');
  }

  // 4. Split S: stallKias <= KIAS <= 140 (D381), altFt - lossFt > hardDeckFt
  if (kias >= stallKias && kias <= 140) {
    const lossFt = splitST6A(kias, altFt, { stallKias, rollRateDegPerSec }).fromTopFt;
    if (altFt - lossFt > hardDeckFt) {
      moves.push('splitS');
    }
  }

  // 5. Low Yo-Yo: 140 <= KIAS <= 220 and sufficient altitude margin for dive (not when bandit is high above)
  if (kias >= 140 && kias <= 220 && (altFt - hardDeckFt) > deckMarginFt + 500 && (!other || (other.altFt ?? other.pm?.z ?? altFt) - altFt < 1000)) {
    moves.push('lowYoYo');
  }

  // 6. High Yo-Yo: 180 <= KIAS <= 280
  if (kias >= 180 && kias <= 280) {
    moves.push('highYoYo');
  }

  // 7. MPT: Always feasible (baseline sustained rate turn)
  moves.push('mpt');

  return moves;
}

/**
 * Dynamic tactical maneuver selector using forward simulation dry-runs and utility scoring.
 * Evaluates all feasible candidate moves for `who` against `other` over lookahead horizon.
 *
 * Ranking criteria:
 * 1. Primary: Earliest victory timestamp (winSec).
 * 2. Secondary: Highest tactical advantage differential (ΔAdv).
 * 3. Tertiary: Specific energy height (He) tie-breaker.
 *
 * @param {any} state - Fight state
 * @param {any} who - 'blue', 'red', or aircraft object
 * @param {number} [lookaheadSec] - Lookahead horizon in seconds (default 20 s)
 * @returns {{ move: string, why: string, winSec: number|null, deltaAdv: number, valid: boolean }}
 */
export function pickTacticalMove(state, who, lookaheadSec = (state.setup?.tacticalLookaheadSec ?? 20)) {
  const steps = tacticalPickSteps(state, who, lookaheadSec);
  let next = steps.next();
  while (!next.done) next = steps.next();
  return next.value;
}

/**
 * pickTacticalMove one dry step at a time (TF-62): a generator that yields after each step of a candidate's dry run and
 * returns the pick, so the pilot can spread the look-ahead over several fight steps instead of freezing the screen.
 * The fight is copied once, on the first next(), so every candidate starts from the same moment. With `leadSec` the
 * copy first flies on that long as it is (the jet keeps flying its move while the pilot thinks), so the candidates
 * start from where the jet will be when the pick is made. Its first yield is { work }: the most dry steps still to come.
 */
export function* tacticalPickSteps(live, who, lookaheadSec = (live.setup?.tacticalLookaheadSec ?? 20), leadSec = 0) {
  const state = structuredClone(live);
  if (leadSec > 0) {
    state.dry = true;
    for (let t = 0; t < leadSec - 1e-9 && !state.stopped; t += FIGHT_STEP_SEC) stepOnce(state);
  }
  const whoName = typeof who === 'string' ? who : (who?.who ?? 'blue');
  const otherName = whoName === 'blue' ? 'red' : 'blue';
  const meAc = state[whoName];
  const otherAc = state[otherName];
  const setup = state.setup ?? ENERGY_DEFAULT_SETUP;

  const candidates = getFeasibleMoves(meAc, otherAc, setup);
  yield { work: candidates.length * Math.ceil(lookaheadSec / FIGHT_STEP_SEC) };
  if (!candidates.length) {
    return {
      move: 'mpt',
      why: 'Smart: MPT baseline',
      winSec: null,
      deltaAdv: 0,
      valid: true,
    };
  }

  const evaluated = [];

  for (const move of candidates) {
    const sim = structuredClone(state);
    sim.dry = true;
    const me = sim[whoName], you = sim[otherName];
    let t0;

    if (!sim.merged) {
      sim.plan = { ...(state.plan || {}), [whoName]: { move, why: '' } };
      flyCopyToMerge(sim);
      t0 = sim.mergeSec ?? sim.timeSec;
      startMove(sim, me, move, '', me.kias);
    } else {
      startMove(sim, me, move, '', me.kias);
      t0 = sim.timeSec;
    }

    const until = t0 + lookaheadSec;
    let winSec = null;
    let lost = false;
    let valid = true;

    // Check initial condition at t0
    const win0 = onTheOther(sim, me, you) || shouldPursueTactical(sim, me, you);
    const loss0 = onTheOther(sim, you, me) || shouldPursueTactical(sim, you, me);
    if (win0 && !loss0) {
      winSec = 0;
    } else if (loss0 && !win0) {
      lost = true;
    }

    if (winSec === null && !lost) {
      while (sim.timeSec < until - 1e-9 && !sim.stopped) {
        stepOnce(sim);
        yield;
        if (sim.timeSec >= FIGHT_MAX_SEC - 1e-6) sim.stopped = true;

        // A run that STALLs, goes OVER G or passes the top speed for its height is not a move a pilot would choose.
        if (me.stall || me.overG || me.kias > energyTopKias(me.altFt)) {
          valid = false;
          break;
        }
        if (sim.deckLoss) { // below the deck loses the fight (TF-R6)
          if (sim.deckLoss.winner === whoName) winSec = sim.timeSec - t0; else lost = true;
          break;
        }

        const win = onTheOther(sim, me, you) || shouldPursueTactical(sim, me, you);
        const loss = onTheOther(sim, you, me) || shouldPursueTactical(sim, you, me);

        if (win && !loss) {
          winSec = sim.timeSec - t0;
          break;
        }
        if (loss && !win) {
          lost = true;
          break;
        }
      }
    }

    const advMe = tacticalAdvantage(me, you);
    const advYou = tacticalAdvantage(you, me);
    const deltaAdv = advMe - advYou;
    const alt = me.altFt ?? me.pm.z;
    const ktas = me.ktas ?? (len(velOf(me.pm)) / KT_TO_FTPS);
    const he = energyHeightFt(alt, ktas);

    evaluated.push({
      move,
      valid,
      winSec,
      lost,
      deltaAdv,
      he,
    });
  }

  // MPT utility decay: penalize MPT when aircraft has been circling > 360° without closure
  const mptTurnDeg = meAc?.ctl?.mptTurnDeg ?? 0;
  if (mptTurnDeg > 360) {
    const penaltyFactor = 0.75; // 25% penalty
    for (const e of evaluated) {
      if (e.move === 'mpt') {
        e.deltaAdv *= penaltyFactor;
        e.he *= penaltyFactor;
      }
    }
  }

  // Rank candidates
  evaluated.sort((a, b) => {
    // 0. Valid beats invalid
    if (a.valid !== b.valid) return a.valid ? -1 : 1;

    // 1. Victory: earliest winSec wins
    const aWins = a.winSec !== null && a.winSec !== undefined;
    const bWins = b.winSec !== null && b.winSec !== undefined;
    if (aWins && bWins) {
      if (Math.abs(a.winSec - b.winSec) > 1e-4) return a.winSec - b.winSec;
      if (Math.abs(a.deltaAdv - b.deltaAdv) > 1e-4) return b.deltaAdv - a.deltaAdv;
      if (Math.abs(a.he - b.he) > 1.0) return b.he - a.he;
      return 0;
    }
    if (aWins !== bWins) return aWins ? -1 : 1;

    // 2. Penalty: non-loss beats loss
    if (a.lost !== b.lost) return a.lost ? 1 : -1;

    // 3. Highest deltaAdv
    if (Math.abs(a.deltaAdv - b.deltaAdv) > 1e-4) return b.deltaAdv - a.deltaAdv;

    // 4. Highest He
    if (Math.abs(a.he - b.he) > 1.0) return b.he - a.he;

    return 0;
  });

  const best = evaluated[0];
  let why;
  const label = MOVE_LABELS[best.move] ?? best.move;
  if (best.winSec !== null && best.winSec !== undefined) {
    why = `Smart: ${label} predicted victory in ${best.winSec.toFixed(1)} s (earliest intercept)`;
  } else {
    const sign = best.deltaAdv >= 0 ? '+' : '';
    why = `Smart: ${label} chosen for positional advantage (ΔAdv ${sign}${best.deltaAdv.toFixed(2)})`;
  }

  return {
    move: best.move,
    why,
    winSec: best.winSec,
    deltaAdv: best.deltaAdv,
    valid: best.valid,
  };
}
