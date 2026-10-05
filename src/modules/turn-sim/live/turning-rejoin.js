// The turning rejoin on the rejoin line (V2.59, TS-68; Patrick 5 Oct 07:14Z, 07:19Z, card "Yes, as written" 07:31Z,
// 07:32Z): one rule for every turning rejoin of the 2-ship, from line abreast (the hot turning rejoin: #2 starts hot and
// gets colder to reach the line) and from fighting wing (he starts cold and turns hotter to reach it). The straight-ahead
// rejoin (SARJ) is the other choice from both, and stays separate (line-moves.js, transitions.js legsFor): it is the one
// that drops onto Lead's six.
//
//  1. Lead turns into #2 at the press, at 30° of bank, slowing to 200 KIAS, and holds it until #2 is in (SMM 16.20 para
//     65b; Patrick 05:29Z, 06:16Z item 3; hand-over.js leadTurnInto).
//  2. #2 gets onto the rejoin line on his own side, inside the turn and slightly low: Lead at his 10:30 or 1:30 with the
//     tail and the wing making an X, about 45° behind Lead's 3/9 line (SMM 12.24 paras 56-57, Figs 12.14-12.15; Patrick
//     07:14Z). From line abreast he points and reverses onto it (SMM 16.20 para 65b(2)); from fighting wing he is near it.
//  3. He holds the line and closes down it at the Rates closure (tuning.js REJOIN_CLOSURE_KT; Patrick 06:09Z).
//  4. Where the line reaches route's spacing (the decision point; the corner at the latest) he takes out the overtake and
//     flows through route on into the slot in one motion (SMM 12.24 para 58; Patrick 07:14Z: "in one motion").
//  5. He goes behind Lead only with too much closure (SMM 12.27 para 65): the tracker's own law, never the plan.
// The tracker (tracker.js) flies it all, from the press: legs whose goal moves along the line with #2 (holdLine), on the
// power profile (hand-over.js onClosure). Numbers are tuning.js TURNING_REJOIN's, each with its source or marked an estimate.
import { relativeTo, DEG } from './manoeuvres.js';
import { recordFlight, speedSeg, rejoinTo, closeThrough, legsFor, CHANGE_LIMIT_SEC } from './transitions.js';
import { classify, judge } from './judge.js';
import { FORMATIONS, fwShapeNow, pairSlot } from './slots.js';
import { KIAS_OUTSIDE_LAB, REJOIN, TURNING_REJOIN, closureNow, rejoinClosureNow, ratesNow, RATE_WORDS } from './tuning.js';
import { onClosure, trackTail, leadTurnInto, wingPlan } from './hand-over.js';
import { STEP_SEC } from './flight.js';

/**
 * The tracker's legs for a turning rejoin with #2 on side s (+1 left, -1 right) to `to` on side sTo: onto the line, down
 * it to the decision point, through route, then the close legs (transitions.js legsFor); to fighting wing, onto the line
 * and into the slot.
 */
function turningLegs(s, to, sTo, spacingFt) {
  const TR = TURNING_REJOIN;
  const back = Math.sin(TR.lineDeg * DEG);
  const out = Math.cos(TR.lineDeg * DEG);
  const at = (r) => ({ fwd: -r * back, left: s * r * out, alt: TR.lineUpFt });
  /** How far down the line #2 is: his place in Lead's frame, onto the line. */
  const along = (L, W) => {
    const rel = relativeTo(L, W);
    return -rel.fwd * back + rel.left * s * out;
  };
  const route = pairSlot('route', s, spacingFt);
  const fwFt = fwShapeNow().rangeFt;
  const decisionFt = Math.abs(route.left) / out; // where the line reaches route's spacing
  const on = (r) => at(Math.max(decisionFt, Math.min(fwFt, r)));
  // Onto the line where he is (no nearer than the fighting wing place), then down it, aiming slideAheadFt ahead of himself.
  const onto = rejoinTo(at(fwFt), { holdLine: true, goal: (L, W) => on(along(L, W)), advanceTol: TR.captureTolFt });
  if (to === 'fw') return [onto, rejoinTo(pairSlot('fw', s, spacingFt)), ...(sTo !== s ? legsFor('fw', s, 'fw', sTo, spacingFt) : [])];
  const down = rejoinTo(at(decisionFt), { holdLine: true, goal: (L, W) => on(along(L, W) - TR.slideAheadFt), advanceTol: TR.captureTolFt });
  const rest = legsFor('route', s, to, sTo, spacingFt);
  return [onto, down, closeThrough(route, rest.length ? { advanceTol: TR.routeFlowFt } : {}), ...rest];
}

/**
 * The turning rejoin as a "Change formation" plan (planGoTo's shape, transitions.js), or null when it does not apply or does
 * not settle (formation.js then tries the line and tracker planners). It applies to the 2-ship with the turning rejoin chosen,
 * from line abreast to fighting wing or a close formation, and from fighting wing to a close formation.
 * options: { side, spacingFt, blockFt, rejoin, lastSide }, as planGoTo's.
 */
export function planTurningRejoin(pair, to, options = {}, t0 = 0) {
  const [lead, wing] = pair;
  if (!FORMATIONS[to] || to === 'lab' || (options.rejoin ?? 'into') !== 'into') return null;
  const from = classify([lead, wing]);
  if (!(from.key === 'lab' || (from.key === 'fw' && to !== 'fw'))) return null;
  const spacingFt = options.spacingFt ?? 6000;
  const blockFt = options.blockFt ?? 8000;
  const s = from.side || Math.sign(relativeTo(lead, wing).left) || (options.lastSide ?? -1);
  const want = options.side ?? 'keep';
  const sTo = to === 'astern' ? 0 : want === 'left' ? 1 : want === 'right' ? -1 : s;
  const pre = Math.abs(lead.kias - KIAS_OUTSIDE_LAB) > 0.5 ? [{ ...speedSeg(lead.kias, KIAS_OUTSIDE_LAB, blockFt), withNext: true }] : [];
  const into = leadTurnInto({ lead, pre, s, bankDeg: REJOIN.leadBankDeg, t0, record: recordFlight });
  const phases = onClosure(turningLegs(s, to, sTo, spacingFt));
  const tail = trackTail({ wing, lead, leadRec: into.longRec, phases, t0, blockFt, leadPlanFor: into.planTo });
  const { run, lp } = tail;
  if (!run.ok || !lp) return null;
  const durationSec = run.points.length * STEP_SEC;
  if (durationSec > CHANGE_LIMIT_SEC) return null;
  const judged = judge([run.end.lead, run.end.wing], { key: to }, { spacingFt });
  if (!judged.inBand) return null;

  const hot = from.key === 'lab';
  const label = FORMATIONS[to].label;
  const sideWord = to === 'astern' ? '' : sTo > 0 ? ' left' : ' right';
  const fromWord = FORMATIONS[from.key].label;
  const fromSide = s > 0 ? ' left' : ' right';
  const how = hot ? 'hot turning rejoin' : 'turning rejoin';
  const turnDeg = Math.round(lp.turned / DEG);
  const slowing = pre.length ? `, slowing to ${KIAS_OUTSIDE_LAB} KIAS,` : ` at ${KIAS_OUTSIDE_LAB} KIAS`;
  const reach = hot ? 'he starts hot and gets colder to reach it' : 'he starts cold and turns hotter to reach it';
  const across = sTo !== s && to !== 'astern' ? ', crossing behind Lead to the other side' : '';
  const end =
    to === 'fw'
      ? `holds it into the fighting wing slot${across}`
      : `closes down it at ${rejoinClosureNow().kt} kt (${RATE_WORDS[ratesNow()]}) to the decision point, then flows through route ${to === 'route' ? 'and settles' : to === 'astern' ? 'and crosses behind into line astern' : `into ${label.toLowerCase()}`}${across} at ${closureNow().kt} kt (SMM 12.24 para 58)`;
  return {
    ok: true,
    plans: { [lead.id]: { segments: lp.segments.map((x) => ({ ...x })) }, [wing.id]: wingPlan(null, tail) },
    note: `${fromWord}${fromSide} to ${label}${sideWord}: ${how}. Lead turns into #2 at ${REJOIN.leadBankDeg}° of bank${slowing} and holds it until #2 is in (${turnDeg}°; SMM 16.20 para 65b). #2 gets onto the rejoin line, Lead at his ${s > 0 ? '1:30' : '10:30'}, ${TURNING_REJOIN.lineDeg}° behind Lead's wing line and slightly low (SMM 12.24 paras 56-57); ${reach}. He ${end}.`,
    label: `${label}${sideWord}`,
    flying: `${fromWord}${fromSide} to ${label}${sideWord} (${how})`,
    from: from.key,
    fromSide: s,
    to,
    side: sTo,
    rejoinKind: 'into',
    leadTurnDeg: turnDeg,
    laneFwdFt: run.laneFwdFt,
    maxBankDeg: run.maxBankDeg,
    judged,
    endSec: t0 + durationSec,
    rejoining: true,
    handOverSec: null,
  };
}
