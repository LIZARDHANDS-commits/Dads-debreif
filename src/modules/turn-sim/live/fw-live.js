// #2 in the 2-ship's fighting wing moves, flown by the live wingman's law (TS-202; Patrick 12 Oct 2026 08:15Z, card "FW on
// live law"; 08:19Z: "FM is basically fighting wing but aerobatics. so we can probably steal most of FM for fighting wing.
// All i care about is that wingman stays outside the 500 foot bubble, doesnt get stretched over 1000, and when lead rolls out
// he resets 'in position' into the cone"). Behind the "#2 in fighting wing" setting (Tracker / Live, Tracker the default).
//
// Lead flies the same move either way (formation-turns.js fwLeadPlan, on flight.js). At the press Lead's planned flight is
// flown ahead step by step, and #2's own aircraft (fluid-wing-live.js stepLiveWing, in its fighting wing mode) flies off it
// one step behind, as in fluid manoeuvring. #2's steps are kept as a pose track and replayed (replay.js flyStep), so the
// drawn path is the path flown (F1). In the 4-ship #3 flies off #2 and #4 off #3 the same way (TS-206). The changes into and
// out of fighting wing stay on the tracker.
//
// Units: feet, seconds; as flight.js. Numbers with no source beside them are estimates.
import { DEG } from '../../../core/angles.js';
import { STEP_SEC, copyAircraft, planDone } from './flight.js';
import { flyStep } from './replay.js';
import { relativeTo } from './manoeuvres.js';
import { FW_BAND } from './slots.js';
import { fwLeadPlan, fwMoveWords } from './formation-turns.js';
import { leadStateOf } from './fluid-lead.js';
import { LIVE, startLiveWing, stepLiveWing, seedLiveWingTurn } from './fluid-wing-live.js';

const dt = STEP_SEC;

/** How long #2's run goes on past Lead's plan (seconds): long enough to reset in position after a roll-out (estimate). */
export const FW_LIVE = Object.freeze({ settleSec: 30, maxSec: 300 });

/**
 * The entry a live wingman reads off the aircraft he flies off: its 3D state, its move and its cue word. ahead: Lead's 2D
 * aircraft, or the 3D state of the wingman ahead (the 4-ship's #3 off #2, #4 off #3).
 */
function entryOf(ahead, blockFt, key, side) {
  const st = ahead.pm ? ahead : leadStateOf(ahead, blockFt);
  const bankDeg = -st.bank;
  const banked = Math.abs(bankDeg) > 5;
  // A level turn toward his side is a turn into him: lag, then pure; away from him, pure (fluid-lead.js's cue words).
  const into = banked && Math.sign(bankDeg) === side;
  return {
    pos: { x: st.pm.x, y: st.pm.y, z: st.pm.z - blockFt },
    vel: st.vel,
    accPerp: st.accPerp,
    st,
    cue: { mode: into ? 'lag' : 'pure' },
    ctl: { key: banked ? 'levelTurn' : key },
    holdKias: st.kias,
  };
}

/** #2's live state at the press, from where he is against the aircraft he flies off (2D aircraft both). */
function wingAtPress(ahead, wing, blockFt, key, four = false) {
  const rel = relativeTo(ahead, wing);
  const side = Math.sign(rel.left) || -1;
  const alt = (wing.altAboveFt ?? 0) - (ahead.altAboveFt ?? 0);
  let ws = startLiveWing(wing, blockFt, { side, slot: { fwd: rel.fwd, left: rel.left, alt } });
  // His place starts where he is, not on the band's fly margins, so the press itself never moves his aim (the place
  // then eases inside the band at its own rates).
  ws = { ...ws, place: { rangeFt: Math.hypot(rel.fwd, rel.left, alt), acrossDeg: side * (Math.atan2(Math.abs(rel.left), -rel.fwd) / DEG), alt } };
  ws = seedLiveWingTurn(ws, entryOf(ahead, blockFt, key, side));
  // The one ahead level at the press: his place is taken where he is on the first step (fwLevel false); turning, it is the
  // band's nearest point to where he is now, held until the turn eases off.
  const off = Math.atan2(Math.abs(rel.left), -rel.fwd) / DEG;
  const r = Math.hypot(rel.fwd, rel.left, alt);
  const inBand = (x, [lo, hi], m) => Math.max(lo + m, Math.min(hi - m, x));
  return { ...ws, ...(four ? { fwStackFt: Math.max(-LIVE.fwHeightFt, Math.min(LIVE.fwHeightFt, alt)) } : {}), fwLevel: false, fwPlace: { rangeFt: inBand(r, FW_BAND.rangeFt, FW_BAND.flyMarginFt[0]), acrossDeg: inBand(off, FW_BAND.sweepDeg, FW_BAND.flyMarginDeg) } };
}

/**
 * One of Lead's fighting wing moves with the wingmen on the live wingman's law: the 2-ship's #2 off Lead, and in the 4-ship
 * (TS-206) #2 off Lead, #3 off #2 and #4 off #3, each one step behind the one he flies off. ws0: the wingmen's live states
 * carried on from the move being flown at the press, if any (one per wingman, in order). Returns { ok, plans, wsTrack,
 * note, endSec } or { ok: false, reason }; wsTrack holds, step by step, the wingmen's states in order.
 */
export function planFwMoveLive(aircraft, key, dir, t0 = 0, { blockFt = 8000, bankDeg, ws0 = null } = {}) {
  const [lead, ...wings] = aircraft;
  const lp = fwLeadPlan(lead, key, dir, t0, bankDeg, blockFt);
  if (!lp.ok) return lp;
  const L = copyAircraft(lead);
  const plan = { segments: lp.segments.map((s) => ({ ...s })), profile: lp.profile };
  let ws = ws0 ?? wings.map((w, i) => wingAtPress(aircraft[i], w, blockFt, key, wings.length > 1));
  const poses = wings.map(() => []);
  const wsTrack = [];
  let t = t0;
  let doneAt = null;
  const profileEnd = Math.max(t0, ...(lp.profile ?? []).map((leg) => leg.t1)); // a climb or descent is over at its last leg's end
  while (t - t0 < FW_LIVE.maxSec) {
    // Each wingman reads the one he flies off as it is at the start of the step (as fluid.js), then all fly the step.
    const es = ws.map((w, i) => entryOf(i === 0 ? L : ws[i - 1].st, blockFt, key, w.side));
    flyStep(L, plan, t);
    t += dt;
    ws = ws.map((w, i) => {
      const r = stepLiveWing(w, { e: es[i], t, blockFt, fw: true });
      poses[i].push({ ...r.pose, power: r.power });
      return r.ws;
    });
    wsTrack.push(ws);
    if (doneAt === null && planDone(L, plan) && t >= profileEnd) doneAt = t;
    if (doneAt !== null && t - doneAt >= FW_LIVE.settleSec) break;
  }
  const plans = { [lead.id]: { segments: lp.segments.map((x) => ({ ...x })), profile: lp.profile } };
  wings.forEach((w, i) => { plans[w.id] = { segments: [{ kind: 'poseTrack', poses: poses[i] }] }; });
  const who = wings.length > 1 ? 'Each wingman flies it live off the one ahead of him (#2 off Lead, #3 off #2, #4 off #3)' : '#2 flies it live';
  return {
    ok: true,
    plans,
    wsTrack,
    note: `Fighting wing: Lead flies ${fwMoveWords(key, dir, bankDeg)}. ${who}: lead, pure or lag on the circle of the one ahead while he turns, back in position in the cone as he rolls out, height first and power only if needed (TS-202${wings.length > 1 ? ', TS-206' : ''}).`,
    endSec: t,
  };
}
