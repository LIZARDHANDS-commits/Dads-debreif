// The behaviour tag on every aircraft (Traffic spec 4.14, TR-60; Patrick's words approved 4 Oct 22:53Z, shortened
// 23:45Z, and again 4 Oct: round the lap only "[OHB]" or "[SI]"): the pattern it is flying, or the manoeuvre with what
// it does next and its configuration unless clean, in the PFL tag's style, for example "[CLOSED: downwind next]". A PFL's own tag and the deconfliction's tags win while they apply
// (map2d.js getPflBadge); the deconfliction's tags carry the configuration too.
//
// Nothing here moves an aircraft or reads the page: it only names what the sim already flies.

/** The configuration labels: the PFL's four (pfl.js PFL_CONFIG_LABELS) plus gear up with the take-off flap still down. */
export const CONFIG = Object.freeze({
  clean: 'Clean',
  takeOffFlap: 'T/O flap',
  gearTakeOffFlap: 'Gear + T/O flap',
  gearLandingFlap: 'Gear + landing flap',
});

/** Every number the tag uses, each with its source. */
export const BEHAVIOUR = Object.freeze({
  /** Gear and take-off flap on the inner downwind once below this, KIAS (SMM 4.17 paras 40-41, EFIG p.185; the gear point is a guess). */
  downwindGearKias: 147,
  /** Flaps up after take-off or a go-around at this, KIAS (SMM 4.13 paras 30-31, 4.22 para 53). */
  flapsUpKias: 110,
  /** Above the field by this much the aircraft is climbing and the gear comes up, ft (an estimate). */
  airborneFt: 50,
});

/**
 * The tag for aircraft `a` (the sim's own state for it), or null when none shows (landed, not started, or in a PFL,
 * whose own tag shows instead). `a.siPattern` is true for an aircraft flying the SI pattern (sim.js). `ctx` = { route, fieldElevFt, onFinal, toThresholdFt, windowFt }: the route it is on,
 * the field height, whether it is lined up on final, and how far it is from the threshold and the window is.
 */
export function behaviourOf(a, ctx = {}) {
  const what = patternOf(a, ctx);
  if (!what) return null;
  return { ...what, config: configOf(a, what.pattern, ctx) };
}

/**
 * The tag's words, "[PATTERN: next · configuration]" ("[OHB · configuration]" for OHB and SI, which name no next step),
 * or the deconfliction's tag with the configuration added. Clean is never shown: it is implied (Patrick, 4 Oct 23:14Z;
 * only a PFL's own tag says Clean).
 */
export function behaviourLabel(b, deconflictLabel = null) {
  const config = b?.config && b.config !== CONFIG.clean ? b.config : null;
  if (deconflictLabel) return config ? deconflictLabel.replace(/]$/, ` · ${config}]`) : deconflictLabel;
  if (!b) return null;
  // An aircraft flying the overhead or the SI pattern says only which (Patrick, 4 Oct: "just say [OHB] or [SI], not
  // what they are doing next"; no configuration either).
  if (b.pattern === 'OHB' || b.pattern === 'SI') return `[${b.pattern}]`;
  return `[${b.pattern}${b.next ? `: ${b.next}` : ''}${config ? ` · ${config}` : ''}]`;
}

/** The pattern and next step, from the move it is flying, then the route and phase. */
function patternOf(a, ctx) {
  if (!a.active || a.landed || a.pflFlight || a.pflRail || a.engineFailed) return null;
  const flown = a.goAroundFlight?.route.id;
  if (a.highKeyFlight) return { pattern: 'CLOSED TO HIGH KEY', next: 'PFL next', stage: 'climb' };
  if (flown === 'CLOSED_FLOWN') return { pattern: 'CLOSED', next: 'downwind next', stage: 'closed' };
  if (flown === 'GO_AROUND_FLOWN') return { pattern: 'GO-AROUND', next: 'outer downwind next', stage: 'go_around' };
  if (flown === 'STRAIGHT_IN_FLOWN') return { pattern: 'SI', next: null, stage: 'straight_in_downwind' };
  if (flown === 'EXTEND_FLOWN') {
    return { pattern: 'OHB', next: null, stage: a.phase === 'final_turn' || a.phase === 'final' ? 'final' : 'inner_downwind' };
  }
  if (flown) return { pattern: 'BREAKOUT', next: 'rejoin next', stage: 'breakout' };
  const route = ctx.route;
  if (!route) return null;
  if (route.kind === 'entry' || route.kind === 'split') {
    if (+route.mergeIndex > 0) return { pattern: 'OHB', next: null, stage: 'entry' };
    return { pattern: 'SI', next: null, stage: ctx.onFinal ? 'final_straight_in' : 'straight_in' };
  }
  // Round the lap the tag names the pattern only, OHB or SI (Patrick, 4 Oct); the stage still sets the configuration.
  const lap = a.siPattern ? 'SI' : 'OHB';
  switch (a.phase) {
    case 'climb': case 'climb_out': case 'touch_and_go': return { pattern: lap, next: null, stage: 'upwind' };
    case 'crosswind': case 'outer_downwind': return { pattern: lap, next: null, stage: 'outer' };
    case 'initial': return { pattern: 'OHB', next: null, stage: 'initial' };
    case 'break': return { pattern: 'OHB', next: null, stage: 'break' };
    case 'downwind': return { pattern: 'OHB', next: null, stage: 'inner_downwind' };
    case 'final_turn': case 'final': return { pattern: lap, next: null, stage: 'final' };
    default: return null;
  }
}

/**
 * The configuration, from Patrick's approved list (4 Oct 22:53Z): Clean through the initial and break, gear and
 * take-off flap on the inner downwind below 147, gear and landing flap from the perch (SMM 4.17 paras 38-41, 4.19
 * paras 43, 48); a straight-in clean until on base, gear and take-off flap on base, landing flap at the window (SMM
 * 4.16 para 36, 4.6 para 9, 4.8 para 13); after take-off or a go-around the gear comes up once climbing and the flaps
 * at 110 (SMM 4.13 paras 30-31, 4.22 para 53); a low approach keeps its configuration until the go-around (SMM 4.21
 * paras 50-51).
 */
function configOf(a, pattern, ctx) {
  const kt = a.kt ?? 0;
  const stage = patternOf(a, ctx)?.stage;
  const afterTakeOff = () => {
    if ((a.alt ?? 0) < (ctx.fieldElevFt ?? 0) + BEHAVIOUR.airborneFt && stage === 'upwind') return CONFIG.gearTakeOffFlap;
    return kt < BEHAVIOUR.flapsUpKias ? CONFIG.takeOffFlap : CONFIG.clean;
  };
  switch (stage) {
    case 'upwind': case 'go_around': return afterTakeOff();
    case 'inner_downwind': return kt < BEHAVIOUR.downwindGearKias ? CONFIG.gearTakeOffFlap : CONFIG.clean;
    case 'final': return CONFIG.gearLandingFlap;
    case 'final_straight_in': {
      const inWindow = Number.isFinite(ctx.toThresholdFt) && Number.isFinite(ctx.windowFt) && ctx.toThresholdFt <= ctx.windowFt;
      return inWindow ? CONFIG.gearLandingFlap : CONFIG.gearTakeOffFlap;
    }
    case 'straight_in': return ctx.route && (a.leg ?? 1) >= 2 ? CONFIG.gearTakeOffFlap : CONFIG.clean;
    default: return CONFIG.clean;
  }
}
