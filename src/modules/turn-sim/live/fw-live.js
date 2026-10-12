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
import { WING } from './moves.js';
import { FW_BAND } from './slots.js';
import { fwLeadPlan, fwMoveWords } from './formation-turns.js';
import { leadStateOf } from './fluid-lead.js';
import { LIVE, startLiveWing, stepLiveWing, seedLiveWingTurn } from './fluid-wing-live.js';

const dt = STEP_SEC;
const unitH = (v) => { const m = Math.hypot(v.x, v.y) || 1; return { x: v.x / m, y: v.y / m }; };

/** How long #2's run goes on past Lead's plan (seconds): long enough to reset in position after a roll-out (estimate). */
export const FW_LIVE = Object.freeze({
  settleSec: 30,
  maxSec: 300,
  // The one behind flies off Lead while the one ahead is more than 25° of bank or 1 G off Lead's, easing over in 1 s and back
  // over 2 s (estimates; Patrick 12 Oct 2026 10:38Z).
  offLeadBankDeg: 25,
  offLeadG: 1,
  offLeadInSec: 1,
  offLeadOutSec: 2,
  // #3 takes the other side when #2 does, and #4 when #3 does (Patrick 12 Oct 2026 16:34Z; trial).
  elementSwitchesWithTwo: true,
});

/** A wingman's place on the one ahead in Lead's level frame (n: Lead's heading, level), the height kept in the cone. */
function offsetOn(st, ahead, n) {
  const d = { x: st.pm.x - ahead.pm.x, y: st.pm.y - ahead.pm.y, z: st.pm.z - ahead.pm.z };
  return { f: d.x * n.x + d.y * n.y, l: -d.x * n.y + d.y * n.x, z: Math.max(-LIVE.fwHeightFt, Math.min(LIVE.fwHeightFt, d.z)) };
}

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
  // The 4-ship's places, each on the one ahead, in Lead's level frame (forward, left, up; the stack in the cone).
  const n0 = unitH(leadStateOf(lead, blockFt).vel);
  const offs = wings.length > 1 ? ws.map((w, i) => offsetOn(w.st, i === 0 ? leadStateOf(lead, blockFt) : ws[i - 1].st, n0)) : null;
  const offW = ws.map(() => 0);
  const ghostPm = [];
  const wsTrack = [];
  let prevSides = ws.map((w) => w.side);
  let t = t0;
  let doneAt = null;
  const profileEnd = Math.max(t0, ...(lp.profile ?? []).map((leg) => leg.t1)); // a climb or descent is over at its last leg's end
  while (t - t0 < FW_LIVE.maxSec) {
    // Each wingman reads the one he flies off as it is at the start of the step (as fluid.js), then all fly the step.
    const es = ws.map((w, i) => entryOf(i === 0 ? L : ws[i - 1].st, blockFt, key, w.side));
    // The formation's turn is Lead's: each wingman senses the turn from Lead, not from the swings of the one ahead.
    for (let i = 1; i < es.length; i++) es[i] = { ...es[i], accPerp: es[0].accPerp, cue: es[0].cue, ctl: es[0].ctl };
    // #3 flies off #2 and #4 off #3 while the one ahead is steady; while he manoeuvres hard (bank or G well off Lead's) the
    // one behind flies off where he belongs instead, his place carried on Lead, and eases back once he settles (Patrick 12
    // Oct 2026 10:38Z: "If two has to dynamically maneuver 3 can fly off 1"). The place is re-taken while he is steady.
    if (offs) {
      const lst = es[0].st;
      const n = unitH(lst.vel);
      const lft = { x: -n.y, y: n.x, z: 0 };
      let acc = { x: 0, y: 0, z: 0 };
      for (let k = 0; k < ws.length - 1; k++) {
        const st = ws[k].st;
        const prevSt = k === 0 ? lst : ws[k - 1].st;
        const dyn = Math.abs(st.bank - lst.bank) > FW_LIVE.offLeadBankDeg || Math.abs(st.g - lst.g) > FW_LIVE.offLeadG;
        offW[k] = Math.max(0, Math.min(1, offW[k] + (dyn ? dt / FW_LIVE.offLeadInSec : -dt / FW_LIVE.offLeadOutSec)));
        if (offW[k] <= 0) offs[k] = offsetOn(st, prevSt, n);
        acc = { x: acc.x + n.x * offs[k].f + lft.x * offs[k].l, y: acc.y + n.y * offs[k].f + lft.y * offs[k].l, z: acc.z + offs[k].z };
        const gpm = { x: lst.pm.x + acc.x, y: lst.pm.y + acc.y, z: lst.pm.z + acc.z };
        const prev = ghostPm[k];
        const gvel = prev ? { x: (gpm.x - prev.x) / dt, y: (gpm.y - prev.y) / dt, z: (gpm.z - prev.z) / dt } : lst.vel;
        ghostPm[k] = gpm;
        const w = offW[k];
        if (w <= 0) continue;
        const mix = (u, v) => ({ x: u.x + (v.x - u.x) * w, y: u.y + (v.y - u.y) * w, z: u.z + (v.z - u.z) * w });
        const pm = mix(st.pm, gpm);
        const vel = mix(st.vel, gvel);
        const e = es[k + 1];
        es[k + 1] = { ...e, pos: { x: pm.x, y: pm.y, z: pm.z - blockFt }, vel, st: { ...e.st, pm, vel, bank: st.bank + (lst.bank - st.bank) * w, g: st.g + (lst.g - st.g) * w } };
      }
    }
    const L0 = es[0].st;
    flyStep(L, plan, t);
    t += dt;
    ws = ws.map((w, i) => {
      // Everyone else in the formation, for his bubble (Lead and the other wingmen as they are at the start of the step).
      const others = wings.length > 1 ? [L0, ...ws.map((x) => x.st)].filter((_, k) => k !== i + 1).map((x) => ({ pos: { x: x.pm.x, y: x.pm.y, z: x.pm.z - blockFt }, vel: x.vel })) : null;
      const r = stepLiveWing(w, { e: es[i], t, blockFt, fw: true, others });
      poses[i].push({ ...r.pose, power: r.power });
      return r.ws;
    });
    // The element switches with #2 (Patrick 12 Oct 2026 16:34Z: "what if 3 switches when 2 switches?"): when the one ahead
    // takes the other side, the one behind takes the other side of him too, so #3 stays across from #2 and #4 outside #3.
    if (FW_LIVE.elementSwitchesWithTwo) {
      for (let i = 1; i < ws.length; i++) {
        if (ws[i - 1].side !== prevSides[i - 1] && ws[i].side === prevSides[i]) {
          ws[i] = { ...ws[i], side: -ws[i].side, swapUntil: t + WING.swapGuardSec };
        }
      }
    }
    prevSides = ws.map((w) => w.side);
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
