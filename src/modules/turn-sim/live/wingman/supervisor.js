// Wingman supervisor: close-formation job state machine (B1/B3; Spec 7b.2, 7c.3; TS-226, TS-231) and fighting-wing
// Phase & Case (B03, S21, S22; Spec 7e §7.7; D3, D5) + Technique Picker (B04, S23; Spec 7e §7.8; D1, D5, D6).
// Exports: JOBS, startJob, supervise, stationChange, progress, deconflict, startFwJob, fwJob, startFwPicker, stepFwPicker.
// Does not: compute separation guard bounds (separation.js, B12) or run control loops directly (fighting-wing.js).
//
// Close-formation jobs, each with a dead band so it never flickers:
//  - on station: within about a foot of his place; all controls together, coordinated, as pressures;
//  - a small move: a few feet off, up to about 10 ft; all controls together, the same pressures;
//  - a large move: further off; corrections in Patrick's order: plane, then line, then hinge;
//  - out before up: under Lead (below his wing plane, inside his wingtip) he moves out before he comes up;
//  - off station (B3): a change between close formations, flown through stationChange places with deconflict.
// Fighting wing (B5, below): B03 continuous phase weights (S21) and latched case label (S22), and B04 technique picker (S23).
//
// Signs and units as perception.js. The memory is never changed in place. Numbers: wing-moves.js CLOSE_WING and FW_WING.
import { STEP_SEC } from '../flight.js';
import { WINGSPAN_FT, LENGTH_FT, pairSlot } from '../slots.js';
import { CLOSE_WING, FW_WING } from '../wing-moves.js';
import { KT_TO_FTPS } from '../../../../core/units.js';
import { DEG } from '../../../../core/angles.js';
import { stepFwBlendWeight } from './fw-reference.js';
import { FW_TECHNIQUES, findFwTechnique } from './techniques/index.js';

const C = CLOSE_WING;

/** The jobs (spec 7b.6d item 12). */
export const JOBS = Object.freeze(['onStation', 'smallMove', 'largeMove', 'outBeforeUp', 'offStation']);

const offFt = (seen) => Math.hypot(seen.dev.plane, seen.dev.line, seen.dev.along);
const movingFtps = (seen) => Math.hypot(seen.rate.plane, seen.rate.line, seen.rate.along);

/**
 * The job for what he sees, after `prev` (null at the start), with each job's dead band. Moving faster than a gentle drift
 * is a large move however near he is (a hand-over still closing), so he brakes with a large move's pressures.
 */
function pick(prev, seen, moving = false) {
  const d = offFt(seen);
  const v = movingFtps(seen);
  const clear = seen.rel.up >= 0 || Math.abs(seen.rel.left) > WINGSPAN_FT / 2 + C.underClearFt || seen.rel.fwd < -LENGTH_FT - C.underClearFt;
  if (seen.under || (prev === 'outBeforeUp' && !clear)) return 'outBeforeUp';
  if (moving) return 'offStation'; // B3: a change between close places
  if ((prev === 'largeMove' || prev === 'outBeforeUp') && (d > C.smallBackFt || v > C.driftBackFtps)) return 'largeMove';
  if (d > C.largeFromFt || v > C.driftFtps) return 'largeMove';
  if (prev === 'onStation') return d > C.smallFromFt ? 'smallMove' : 'onStation';
  if (prev === null) return d > C.smallFromFt ? 'smallMove' : 'onStation';
  return d < C.stationFromFt ? 'onStation' : 'smallMove';
}

/** The share of each axis's deviation the loops are shown in this job: plane, then line, then hinge in a large move. */
function masksFor(kind, seen) {
  if (kind !== 'largeMove') return { plane: 1, line: 1, along: 1 };
  const onPlane = Math.abs(seen.dev.plane) < C.plhBandFt;
  const onLine = onPlane && Math.abs(seen.dev.line) < C.plhBandFt;
  return { plane: 1, line: onPlane ? 1 : 0, along: onLine ? 1 : 0 };
}

/** The job at the start, from the first picture: { kind, sinceSec, masks, upOk }. */
export function startJob(seen) {
  const kind = pick(null, seen);
  return { kind, sinceSec: 0, masks: masksFor(kind, seen), upOk: kind !== 'outBeforeUp' };
}

/**
 * One step: the job for what he sees now. Returns the new job { kind, sinceSec, masks, upOk }; upOk false while he is
 * under Lead (no correction upward until he is out).
 */
export function supervise(job, seen, moving = false) {
  const kind = pick(job.kind, seen, moving);
  const want = masksFor(kind, seen);
  const step = C.plhPerSec * STEP_SEC;
  const ease = (x, to) => x + Math.max(-step, Math.min(step, to - x));
  return {
    kind,
    sinceSec: kind === job.kind ? job.sinceSec + STEP_SEC : 0,
    masks: { plane: ease(job.masks.plane, want.plane), line: ease(job.masks.line, want.line), along: ease(job.masks.along, want.along) },
    upOk: kind !== 'outBeforeUp',
  };
}

// ---- B3: off station and deconfliction (spec 7c.3, TS-231) ---------------------------------------------------------------

const D = C.deconflict;
const O = C.offStation;

/** Where each close place sits on its side's ladder, out from line astern: the corner, then echelon, then route. */
const RUNG = Object.freeze({ corner: 1, echelon: 2, route: 3 });
const LADDER = Object.freeze(['corner', 'echelon', 'route']);

/**
 * The places a change between the close formations flies through, in order, the last the new place: [{ key, side,
 * paceFtps }] (side +1 left of Lead, -1 right; line astern 0). from, s: where he is (key, side); to, sTo: where to.
 * Spec 7c.3 (Patrick 14 Oct 2026): echelon to route and back straight along the spinner-to-wingtip line; echelon to line
 * astern back and down into the corner, then across; line astern to echelon across to the corner behind it, then forward
 * and up at about 5 ft/s; echelon to echelon the other side both halves, through the corner and across behind Lead to the
 * other corner; route to route the other side in to echelon, the station change, then out to route; route to line astern
 * in to echelon, then the corner. The corner is a place of its own (TS-231).
 */
export function stationChange(from, s, to, sTo) {
  const out = [];
  const at = (key, side, intoEchelon = false) => out.push({ key, side: key === 'astern' ? 0 : side, paceFtps: intoEchelon ? O.intoEchelonFtps : O.paceFtps });
  const climb = (side, fromRung, toRung) => { for (let r = fromRung + 1; r <= toRung; r++) at(LADDER[r - 1], side, r === RUNG.echelon && fromRung <= RUNG.corner); };
  const descend = (side, fromRung, toRung) => { for (let r = fromRung - 1; r >= toRung; r--) at(LADDER[r - 1], side); };
  if (from === 'astern') {
    if (to === 'astern') return out;
    at('corner', sTo);
    climb(sTo, RUNG.corner, RUNG[to]);
    return out;
  }
  if (to === 'astern') {
    descend(s, RUNG[from], RUNG.corner);
    at('astern', 0);
    return out;
  }
  if (s === sTo) {
    if (RUNG[to] < RUNG[from]) descend(s, RUNG[from], RUNG[to]);
    else climb(s, RUNG[from], RUNG[to]);
    return out;
  }
  descend(s, RUNG[from], RUNG.corner);
  at('corner', sTo);
  climb(sTo, RUNG.corner, RUNG[to]);
  return out;
}

/**
 * The change's progress (route: { places, i } from stationChange, i the place he is flying to): on to the next place once
 * he passes one on the way (within flowFt and flowKt, TS-117), and done (null) once settled on the last (within doneFt,
 * moving under doneFtps). off: how far he is from the place he flies to (ft); v: how fast he moves against Lead (ft/s).
 * Returns the route, or null.
 */
export function progress(route, off, v) {
  if (!route) return null;
  const last = route.i === route.places.length - 1;
  if (!last && off <= O.flowFt && v <= O.flowKt * KT_TO_FTPS) return { ...route, i: route.i + 1 };
  if (last && off <= O.doneFt && v <= O.doneFtps) return null;
  return route;
}

/**
 * The deconfliction guards on a place he aims at (spec 7c.3; numbers wing-moves.js CLOSE_WING.deconflict). rel: where he
 * is in Lead's frame as he sees it { fwd, left, up }; vLeft: how fast he is moving sideways (ft/s, + left); place: his aim
 * { fwd, left, alt }; guard: last step's ({ wings }), for the dead band. Returns { place, guard: { wings, span, ahead } }
 * (which guards hold him).
 */
export function deconflict(place, rel, vLeft, guard, vFwd = 0) {
  const noseTail = -(LENGTH_FT + 10); // his nose 10 ft behind Lead's tail (SMM 12.20 para 45), line astern's fore and aft
  let aim = { ...place };
  const leftAhead = rel.left + vLeft * D.lookAheadSec;
  const overlap = Math.abs(rel.left) < WINGSPAN_FT || Math.abs(leftAhead) < WINGSPAN_FT;
  const ahead = rel.fwd + Math.max(0, vFwd) * D.lookAheadSec - noseTail; // where he will be, moving forward
  const wings = overlap && ahead > (guard?.wings ? D.noseTailDeadFt / 2 : D.noseTailDeadFt);
  if (wings) {
    // no further in than he is, and back to the nose-tail line first
    const inward = Math.sign(rel.left) !== Math.sign(place.left) || Math.abs(place.left) < Math.abs(rel.left);
    aim = { fwd: Math.min(aim.fwd, noseTail), left: inward ? rel.left : aim.left, alt: aim.alt };
  }
  const range = Math.hypot(rel.fwd, rel.left, rel.up);
  const span = range < WINGSPAN_FT + D.spanDeadFt;
  if (span) {
    // straight away from Lead sideways and aft (never up toward him, never further down than his place)
    const flat = Math.max(Math.hypot(rel.fwd, rel.left), 1e-6);
    const k = Math.sqrt(Math.max(0, (WINGSPAN_FT + 2 * D.spanDeadFt) ** 2 - rel.up * rel.up)) / flat;
    aim = { fwd: Math.min(rel.fwd * k, aim.fwd), left: rel.left * k, alt: aim.alt };
  }
  const ahead39 = rel.fwd > -D.aheadDeadFt;
  if (ahead39) aim = { ...aim, fwd: Math.min(aim.fwd, -2 * D.aheadDeadFt) };
  return { place: aim, guard: { wings, span, ahead: ahead39 } };
}

// ---- B5: fighting wing Phase & Case (B03, S21, S22; Spec 7e §7.7) and Technique Picker (B04, S23; Spec 7e §7.8) -----------
//
// B03 replaces the 1.0 s turn-hold wait with continuous phase weights S21 = { level, entry, turning, exit } blended over
// phaseBlendSec (1.5 s, D3) so #2 responds immediately when Lead's seen bank passes 10° (turnStartDeg), and a latched case
// label S22 with a ±50 ft dead band (caseDeadBandFt) so the case does not chatter across range thresholds.
// B04 polls FW_TECHNIQUES in priority order, runs at most one active technique at a time, enforces noRestartSec (3 s) and
// maxRunSec, and slides the blend weight S23 (0 -> 1 -> 0) over pathBlendSec (6 s) and heightBlendSec (4.3 s / 15 s).

const FJ = FW_WING;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** Range bucket with ±50 ft hysteresis (caseDeadBandFt) around tightFt (550), stretchedFt (800), veryStretchedFt (1000). */
function classifyRange(slant, closure, prevRange = null, fresh = false) {
  const db = fresh ? 0 : FJ.caseDeadBandFt;
  if (prevRange === 'tight') {
    if (slant < FJ.tightFt + db) return 'tight';
  } else if (slant < FJ.tightFt || (fresh && closure > FJ.sTurnClosureFtps && slant < FJ.happyFt[1])) {
    return 'tight';
  }
  if (prevRange === 'very-stretched') {
    if (slant > FJ.veryStretchedFt - db) return 'very-stretched';
  } else if (slant > FJ.veryStretchedFt) {
    return 'very-stretched';
  }
  if (prevRange === 'stretched') {
    if (slant > FJ.stretchedFt - db) return 'stretched';
  } else if (slant > FJ.stretchedFt) {
    return 'stretched';
  }
  return 'in';
}

/** Formats the latched case label (S22) from phase, range bucket, and into/away. */
function makeCaseLabel(phase, range, into) {
  if (phase === 'entry' || phase === 'turning') {
    if (range === 'in') return into ? 'in-position-into' : 'in-position-away';
    return `${range}-${into ? 'into' : 'away'}`;
  }
  return range === 'in' ? 'in-position' : range;
}

/** Step and normalize the 4 continuous phase weights S21 = { level, entry, turning, exit } over phaseBlendSec (1.5 s). */
function stepPhaseWeights(prev, activePhase, dt = STEP_SEC) {
  const rate = dt / Math.max(FJ.phaseBlendSec, 1e-6);
  const raw = {
    level: clamp((prev?.level ?? 0) + (activePhase === 'level' ? rate : -rate), 0, 1),
    entry: clamp((prev?.entry ?? 0) + (activePhase === 'entry' ? rate : -rate), 0, 1),
    turning: clamp((prev?.turning ?? 0) + (activePhase === 'turning' ? rate : -rate), 0, 1),
    exit: clamp((prev?.exit ?? 0) + (activePhase === 'exit' ? rate : -rate), 0, 1),
  };
  const sum = raw.level + raw.entry + raw.turning + raw.exit;
  if (sum <= 1e-9) return { level: activePhase === 'level' ? 1 : 0, entry: activePhase === 'entry' ? 1 : 0, turning: activePhase === 'turning' ? 1 : 0, exit: activePhase === 'exit' ? 1 : 0 };
  return { level: raw.level / sum, entry: raw.entry / sum, turning: raw.turning / sum, exit: raw.exit / sum };
}

/** Initial B03 state at the start of fighting wing: Lead taken as he is (turning if banked past 10°). */
export function startFwJob(seen) {
  const turning = Math.abs(seen.leadBankDeg) > FJ.turnStartDeg;
  const dir = turning ? Math.sign(seen.leadBankDeg) : 0;
  const phase = turning ? 'turning' : 'level';
  const into = turning ? dir === seen.levelSide : false;
  const range = classifyRange(seen.slant, seen.closure, null, true);
  const side = seen.levelSide || -1;
  return {
    phase,
    weights: { level: turning ? 0 : 1, entry: 0, turning: turning ? 1 : 0, exit: 0 },
    turning,
    dir,
    into,
    range,
    caseLabel: makeCaseLabel(phase, range, into),
    entry: turning ? { into, range: range === 'very-stretched' ? 'stretched' : range } : null,
    entrySec: 0,
    exitSettleSec: 0,
    exitTotalSec: 0,
    side,
    sideBlend: side,
    sTurn: false,
    quick: 0,
    low: false,
    heightFt: clamp(seen.heightFt, -FJ.heightBandFt, FJ.heightBandFt),
  };
}

/**
 * One step of B03 (Phase & Case, S21, S22). Responds immediately when Lead's bank crosses turnStartDeg (10°), blends phase
 * weights continuously over 1.5 s, latches the entry/turning/exit case with a ±50 ft dead band, and slews sideBlend over 6 s.
 */
export function fwJob(j, seen, { shortKt = 0, arcErrAbs = Infinity, chiErrAbs = Infinity } = {}) {
  const b = seen.leadBankDeg;
  let { phase, dir, into, range, entry, entrySec = 0, exitSettleSec = 0, exitTotalSec = 0, side, sideBlend = j.side, sTurn, low } = j;
  let freshPhase = false;

  if (phase === 'level' || phase === 'exit') {
    if (Math.abs(b) > FJ.turnStartDeg) {
      phase = 'entry';
      dir = Math.sign(b);
      into = dir === seen.levelSide;
      range = classifyRange(seen.slant, seen.closure, null, true);
      entry = { into, range: range === 'very-stretched' ? 'stretched' : range };
      entrySec = 0;
      sTurn = false;
      freshPhase = true;
    } else if (phase === 'exit') {
      exitTotalSec += STEP_SEC;
      const settled = Math.abs(seen.closure) <= FJ.exitSettleFtps && seen.slant >= FJ.happyFt[0] && seen.slant <= FJ.happyFt[1];
      exitSettleSec = settled ? exitSettleSec + STEP_SEC : 0;
      if (exitSettleSec >= FJ.exitSettleSec || exitTotalSec >= 2 * FJ.exitSettleSec) {
        phase = 'level';
        dir = 0;
        entry = null;
        freshPhase = true;
      }
    }
  } else {
    // In 'entry' or 'turning'
    if (Math.abs(b) > FJ.turnStartDeg && Math.sign(b) !== dir) {
      // Lead reverses mid-turn: immediately re-enter 'entry' and re-latch case (F4)
      phase = 'entry';
      dir = Math.sign(b);
      into = dir === seen.levelSide;
      range = classifyRange(seen.slant, seen.closure, null, true);
      entry = { into, range: range === 'very-stretched' ? 'stretched' : range };
      entrySec = 0;
      freshPhase = true;
    } else if (Math.abs(b) < FJ.turnEndDeg) {
      // Turn exit (SMM 12.29 Fig 12.23): tight or closing fast -> outside (-dir); stretched or opening -> inside (+dir)
      const tight = seen.slant < FJ.happyFt[0] || seen.closure > FJ.sTurnClosureFtps;
      const stretched = seen.slant > FJ.stretchedFt || seen.closure < -FJ.exitSettleFtps;
      side = tight ? -dir || seen.levelSide : stretched ? dir || seen.levelSide : seen.levelSide;
      phase = 'exit';
      exitSettleSec = 0;
      exitTotalSec = 0;
      entry = null;
      freshPhase = true;
    } else if (phase === 'entry') {
      entrySec += STEP_SEC;
      const captured = entrySec >= FJ.phaseBlendSec && arcErrAbs <= FJ.entryCaptureFt && chiErrAbs <= FJ.entryCaptureDeg;
      if (captured || entrySec >= FJ.entryMaxSec) {
        phase = 'turning';
        freshPhase = true;
      }
    }
  }

  if (!freshPhase) {
    range = classifyRange(seen.slant, seen.closure, range, false);
    if (entry) entry = { into, range: range === 'very-stretched' ? 'stretched' : range };
  }
  const turning = phase === 'entry' || phase === 'turning';
  const weights = stepPhaseWeights(j.weights, phase, STEP_SEC);
  const caseLabel = makeCaseLabel(phase, range, into);
  sTurn = false;

  const targetSide = side || seen.levelSide || -1;
  const maxSideStep = (2 * STEP_SEC) / Math.max(FJ.sideBlendSec, 1e-6);
  sideBlend = clamp(sideBlend + clamp(targetSide - sideBlend, -maxSideStep, maxSideStep), -1, 1);

  // Continuous drop-low-inside (D24) is computed in B05 (fighting-wing.js); telemetry flag low reflects >100 ft below stack
  low = turning && shortKt > FJ.lowStartKt;
  const heightFt = FJ.stackFt;

  return {
    phase,
    weights,
    turning,
    dir,
    into,
    range,
    caseLabel,
    entry,
    entrySec,
    exitSettleSec,
    exitTotalSec,
    side: targetSide,
    sideBlend,
    sTurn,
    quick: 0,
    low: Boolean(low),
    heightFt,
  };
}

/** Initial B04 Technique Picker state. */
export function startFwPicker() {
  return {
    activeId: null,
    state: null,
    runSec: 0,
    cooldowns: {},
    assessMem: {},
    weight: { path: 0, height: 0 },
    lastRef: null,
  };
}

/**
 * One step of B04 (Technique Picker, S23). Polls FW_TECHNIQUES in priority order, runs at most one active technique at a
 * time, enforces noRestartSec (3 s) and maxRunSec, and slides the blend weight S23 (0 -> 1 -> 0) over entryPathSec (1.5 s)
 * on entry, pathBlendSec (6 s) on hand-back, and heightBlendSec (4.3 s / stackReturnSec 15 s).
 */
export function stepFwPicker(picker, ctx, dt = STEP_SEC, techniques = FW_TECHNIQUES) {
  const P = FJ.picker;
  const p0 = picker ?? startFwPicker();
  const cooldowns = {};
  for (const [k, v] of Object.entries(p0.cooldowns ?? {})) {
    if (v - dt > 1e-9) cooldowns[k] = v - dt;
  }
  const assessMem = { ...(p0.assessMem ?? {}) };

  let activeId = p0.activeId;
  let state = p0.state;
  let runSec = p0.runSec ?? 0;
  let lastRef = p0.lastRef;

  // Check if a higher-priority technique preempts the currently running one
  if (activeId) {
    const activeTech = findFwTechnique(activeId, techniques);
    const activePriority = activeTech?.priority ?? Infinity;
    for (const tech of techniques) {
      if (tech.priority >= activePriority) break;
      if ((cooldowns[tech.id] ?? 0) > 1e-9) continue;
      const res = tech.assess(ctx, assessMem[tech.id]);
      assessMem[tech.id] = res;
      if (res.cue > 0) {
        cooldowns[activeId] = P.noRestartSec;
        activeId = tech.id;
        state = tech.plan(ctx);
        runSec = 0;
        break;
      }
    }
  }

  // If no technique is active, poll in priority order
  if (!activeId) {
    for (const tech of techniques) {
      if ((cooldowns[tech.id] ?? 0) > 1e-9) continue;
      const res = tech.assess(ctx, assessMem[tech.id]);
      assessMem[tech.id] = res;
      if (res.cue > 0) {
        activeId = tech.id;
        state = tech.plan(ctx);
        runSec = 0;
        break;
      }
    }
  }

  if (activeId) {
    const tech = findFwTechnique(activeId, techniques);
    runSec += dt;
    const stepped = tech.step(ctx, state);
    state = stepped.state;
    lastRef = stepped.ref;
    const timedOut = runSec >= (tech.maxRunSec ?? FJ.miss.maxRunSec);
    if (stepped.done || stepped.abort || timedOut) {
      cooldowns[activeId] = P.noRestartSec;
      activeId = null;
      state = null;
      runSec = 0;
    }
  }

  const targetW = activeId ? 1 : 0;
  const fastHeightEntry = activeId === 'pass-clear' || activeId === 'lag-abeam' || activeId === 'behind-39';
  const weight = stepFwBlendWeight(p0.weight, targetW, dt, {
    pathSec: activeId ? P.entryPathSec : P.pathBlendSec,
    heightSec: fastHeightEntry ? P.entryPathSec : P.heightBlendSec,
    returnHeightSec: FJ.stackReturnSec,
  });

  return {
    activeId,
    state,
    runSec,
    cooldowns,
    assessMem,
    weight,
    lastRef,
    techRef: weight.path > 1e-6 || weight.height > 1e-6 ? lastRef : null,
  };
}


