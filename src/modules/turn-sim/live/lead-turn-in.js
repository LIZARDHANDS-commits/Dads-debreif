// Lead's turn into #2 in a turning rejoin and the tracker's part behind it (clean-up step 3, from hand-over.js). Lead turns
// into #2 at 30° of bank and holds it until #2 is in position, then rolls out on the whole degree (Patrick 5 Oct 06:16Z
// item 3: "until 2 is on"; SMM 16.20 para 65b); trackTail flies the tracker's legs off Lead's recorded flight from the
// hand-over state, and with a Lead who turns until #2 is in, plans Lead's roll-out from when #2 settles. Used by
// transitions.js planGoTo, turning-rejoin.js, rolling-rejoin.js, replan.js, line-moves.js and four-rejoin.js.
// It changes no flight physics: Lead flies flight.js turn segments, #2 the unchanged tracker.
import { wrapPi } from '../../../core/angles.js';
import { STEP_SEC } from './flight.js';
import { leadTurnSegs, DEG } from './manoeuvres.js';
import { trackTwice } from './tracker.js';
import { fromStep, wingFromPose } from './hand-over.js';

const dt = STEP_SEC;

/**
 * Lead's turn into #2 in a turning rejoin, held until #2 is IN POSITION, then rolled out (Patrick 5 Oct 06:16Z item 3:
 * "until 2 is on"; SMM 16.20 para 65b: 30° of bank, constant bank and speed). pre: his speed change, flown
 * with the turn (withNext); s: the way he turns (toward #2); record: replay.js recordFlight (passed in, so this file
 * needs no import of it). Returns { longRec, planTo }: longRec, the turn held on (four near-half circles, for planning);
 * planTo(step), his real plan, rolling out on the whole degree once he has turned what longRec turned by that step
 * ({ segments, turned, rec }): trackTail's leadPlanFor. rollOutRoll: a gentler roll-out (a close wingman in his wing plane).
 */
export function leadTurnInto({ lead, pre = [], s, bankDeg, t0, record }) {
  const h0 = lead.headingRad;
  const longRec = record(lead, { segments: [...pre, ...leadTurnSegs(h0, s, 4 * 170 * DEG, bankDeg, false)] }, t0);
  const planTo = (inStep, rollOutRoll = null) => {
    let turned = 0;
    for (let i = 1; i <= inStep; i++) turned += wrapPi(longRec.at(i).headingRad - longRec.at(i - 1).headingRad) * s;
    const segs = leadTurnSegs(h0, s, Math.round(turned / DEG) * DEG, bankDeg, true);
    if (rollOutRoll) segs[segs.length - 1] = { ...segs[segs.length - 1], rollOutRoll };
    const segments = [...pre, ...segs];
    return { segments, turned, rec: record(lead, { segments }, t0) };
  };
  return { longRec, planTo };
}

/**
 * The tracker's part: from the hand-over state (or from the press when there is no line), `phases` (each on the power
 * profile: onClosure) flown off Lead's recorded flight `leadRec`. With `leadPlanFor` (a Lead who turns until #2 is in, the
 * hot turning rejoin), a first run against `leadRec` (Lead turning on) finds when #2 has settled, leadPlanFor(step) gives
 * Lead's real plan rolling out then ({ segments, rec }), and the second run flies against it. Returns { run, profile,
 * steps0, lp }: steps0 is the step the tracker starts at, lp Lead's plan when leadPlanFor was given.
 */
export function trackTail({ wing, lead, leadRec, line = null, phases, t0, blockFt = 8000, leadPlanFor = null }) {
  const steps0 = line?.steps ?? 0;
  const wing0 = line ? wingFromPose(wing, line.poses[steps0 - 1]) : wing;
  const init = line ? { accelKtps: line.accelKtps } : null;
  const fly = (rec, stopWhenSettled) => trackTwice({ refs: { [lead.id]: fromStep(rec, steps0) }, wing0, t0: t0 + steps0 * dt, phases, blockFt, init, stopWhenSettled });
  if (!leadPlanFor) return { ...fly(leadRec, false), steps0, lp: null };
  const first = fly(leadRec, true);
  const lp = leadPlanFor(steps0 + first.run.points.length);
  return { ...fly(lp.rec, false), steps0, lp };
}
