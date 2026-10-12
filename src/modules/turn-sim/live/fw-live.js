// #2 in the 2-ship's fighting wing moves, flown by the live wingman's law (TS-202; Patrick 12 Oct 2026 08:15Z, card "FW on
// live law"; 08:19Z: "FM is basically fighting wing but aerobatics. so we can probably steal most of FM for fighting wing.
// All i care about is that wingman stays outside the 500 foot bubble, doesnt get stretched over 1000, and when lead rolls out
// he resets 'in position' into the cone"). Behind the "#2 in fighting wing" setting (Tracker / Live, Tracker the default).
//
// Lead flies the same move either way (formation-turns.js fwLeadPlan, on flight.js). At the press Lead's planned flight is
// flown ahead step by step, and #2's own aircraft (fluid-wing-live.js stepLiveWing, in its fighting wing mode) flies off it
// one step behind, as in fluid manoeuvring. #2's steps are kept as a pose track and replayed (replay.js flyStep), so the
// drawn path is the path flown (F1). The 4-ship and the changes into and out of fighting wing stay on the tracker.
//
// Units: feet, seconds; as flight.js. Numbers with no source beside them are estimates.
import { DEG } from '../../../core/angles.js';
import { STEP_SEC, copyAircraft, planDone } from './flight.js';
import { flyStep } from './replay.js';
import { relativeTo } from './manoeuvres.js';
import { FW_BAND } from './slots.js';
import { fwLeadPlan, fwMoveWords } from './formation-turns.js';
import { leadStateOf } from './fluid-lead.js';
import { startLiveWing, stepLiveWing, seedLiveWingTurn } from './fluid-wing-live.js';

const dt = STEP_SEC;

/** How long #2's run goes on past Lead's plan (seconds): long enough to reset in position after a roll-out (estimate). */
export const FW_LIVE = Object.freeze({ settleSec: 30, maxSec: 300 });

/** Lead's entry for the live wingman, read off Lead's 2D aircraft: his 3D state, his move and his cue word. */
function entryOf(lead, blockFt, key, side) {
  const st = leadStateOf(lead, blockFt);
  const banked = Math.abs(lead.bankDeg) > 5;
  // A level turn toward #2's side is a turn into him: lag, then pure; away from him, pure (fluid-lead.js's cue words).
  const into = banked && Math.sign(lead.bankDeg) === side;
  return {
    pos: { x: st.pm.x, y: st.pm.y, z: st.pm.z - blockFt },
    vel: st.vel,
    accPerp: st.accPerp,
    st,
    cue: { mode: into ? 'lag' : 'pure' },
    ctl: { key: banked ? 'levelTurn' : key },
    holdKias: lead.kias,
  };
}

/**
 * One of Lead's fighting wing moves with #2 on the live wingman's law, 2-ship. ws0: #2's live state carried on from the move
 * being flown at the press, if any. Returns { ok, plans, wsTrack, note, endSec } or { ok: false, reason }.
 */
export function planFwMoveLive(aircraft, key, dir, t0 = 0, { blockFt = 8000, bankDeg, ws0 = null } = {}) {
  const [lead, wing] = aircraft;
  const lp = fwLeadPlan(lead, key, dir, t0, bankDeg, blockFt);
  if (!lp.ok) return lp;
  const L = copyAircraft(lead);
  const plan = { segments: lp.segments.map((s) => ({ ...s })), profile: lp.profile };
  const rel = relativeTo(lead, wing);
  const side = Math.sign(rel.left) || -1;
  let ws = ws0;
  if (!ws) {
    const alt = (wing.altAboveFt ?? 0) - (lead.altAboveFt ?? 0);
    ws = startLiveWing(wing, blockFt, { side, slot: { fwd: rel.fwd, left: rel.left, alt } });
    // His place starts where he is, not on the band's fly margins, so the press itself never moves his aim (the place
    // then eases inside the band at its own rates).
    ws = { ...ws, place: { rangeFt: Math.hypot(rel.fwd, rel.left, alt), acrossDeg: side * (Math.atan2(Math.abs(rel.left), -rel.fwd) / DEG), alt } };
    ws = seedLiveWingTurn(ws, entryOf(L, blockFt, key, side));
    // Lead level at the press: his place is taken where he is on the first step (fwLevel false); turning, it is the band's
    // nearest point to where he is now, held until Lead's turn eases off.
    const off = Math.atan2(Math.abs(rel.left), -rel.fwd) / DEG;
    const r = Math.hypot(rel.fwd, rel.left, alt);
    const inBand = (x, [lo, hi], m) => Math.max(lo + m, Math.min(hi - m, x));
    ws = { ...ws, fwLevel: false, fwPlace: { rangeFt: inBand(r, FW_BAND.rangeFt, FW_BAND.flyMarginFt[0]), acrossDeg: inBand(off, FW_BAND.sweepDeg, FW_BAND.flyMarginDeg) } };
  }
  const poses = [];
  const wsTrack = [];
  let t = t0;
  let doneAt = null;
  const profileEnd = Math.max(t0, ...(lp.profile ?? []).map((leg) => leg.t1)); // a climb or descent is over at its last leg's end
  while (t - t0 < FW_LIVE.maxSec) {
    // #2 reads Lead as he is at the start of the step (as fluid.js), then both fly the step.
    const e = entryOf(L, blockFt, key, ws.side ?? side);
    flyStep(L, plan, t);
    t += dt;
    const r = stepLiveWing(ws, { e, t, blockFt, fw: true });
    ws = r.ws;
    poses.push({ ...r.pose, power: r.power });
    wsTrack.push(ws);
    if (doneAt === null && planDone(L, plan) && t >= profileEnd) doneAt = t;
    if (doneAt !== null && t - doneAt >= FW_LIVE.settleSec) break;
  }
  return {
    ok: true,
    plans: { [lead.id]: { segments: lp.segments.map((x) => ({ ...x })), profile: lp.profile }, [wing.id]: { segments: [{ kind: 'poseTrack', poses }] } },
    wsTrack,
    note: `Fighting wing: Lead flies ${fwMoveWords(key, dir, bankDeg)}. #2 flies it live: lead, pure or lag on Lead's circle while Lead turns, back in position in the cone as Lead rolls out, height first and power only if needed (TS-202).`,
    endSec: t,
  };
}
