// G-warm from Spread 4 (Turn Sim spec section 8, decision TS-54; design: project files
// turn-sim-review/four-ship/design.md section 5.2, F7). One button flies the SMM's sequence for
// all four together, then tightens the line abreast:
//   1 stand-by (PCL max, fuel check, 220 KIAS, ready calls),
//   2 in place 90 toward #2 at 3 G,
//   3 a half-G push over for about 5 s, then back to level,
//   4 hook the other way at 4 G,
//   5 the "complete" calls,
//   6 in place 90 back to the first heading at 3 G,
//   7 tighten line abreast to about 4,000 ft.
//
// Sources (page references only): SMM 16.22 paras 70-71 and Fig 16.26 (two-ship G-warm), SMM 16.44
// para 120 and Fig 16.35 (Spread 4: the same sequence, each aircraft flying accurate G and headings);
// AFM8 brief p.16 items 1-5 (start on the wide side, in place 90 toward #2, hook, back, tighten to about
// 4,000 ft); SMM 16.22 para 70 (220 KIAS at least). The push over's height is standard aerodynamics:
// V dγ/dt = g (n − cos γ) at constant speed, the relation core dampedClimbG inverts. Every time with no
// manual behind it is an ESTIMATE and says so beside it.
//
// How it flies. Every aircraft flies the same programme at the same moment (in place turns and a hook all
// the same way), so the four keep their line through the turns and the stack is kept (AFM8 brief p.14).
// Speed stays 220 KIAS throughout, as in every line abreast turn (TS-38); a real 4 G hook bleeds energy
// (SMM 16.22 para 71) and the card says so. The push over is a planned height table with its load factor,
// so the G it pulls shows on the card and in the pitch (flight.js tableAt). The tighten is the Lateral
// spacing fix tool's turn, hold, turn back (errors.js lateralLeg), sized by dry runs.
import { bankDegFromG } from '../../../core/flight-math.js';
import { G_FTPS2 } from '../../../core/units.js';
import { STEP_SEC, smoother } from './flight.js';
import { relativeTo, dryRun, turnSeg, wholeDegree, onStep, DEG, TURN_BANK_DEG } from './manoeuvres.js';
import { lateralLeg, FIX_LIMITS } from './errors.js';

/** The G-warm button and its numbers. */
export const G_WARM = Object.freeze({
  key: 'gWarm',
  label: 'G-warm',
  sided: false,
  source: 'SMM 16.22 paras 70-71, 16.44 para 120; AFM8 brief p.16',
  standbySec: 15, // ESTIMATE: the SMM gives no time for the stand-by and ready calls (design 5.2)
  completeSec: 4, // ESTIMATE: the "complete" calls in order (design 5.2)
  firstG: 3, // in place 90 at 3 G (SMM 16.22 para 71; AFM8 brief p.16 item 2)
  pushG: 0.5, // half-G push over for 5 s (SMM 16.22 para 71)
  pushSec: 5,
  recoverG: 1.5, // ESTIMATE: back to level at 1.5 G (design 5.2: about 400 ft in all; the SMM gives no figure)
  hookG: 4, // hook at 4 G (SMM 16.22 para 71; AFM8 brief p.16 item 3)
  tightFt: 4000, // tighten line abreast to about 4,000 ft (AFM8 brief p.16 item 5)
});

/**
 * How the push over's G changes: each change eases in and out on the smootherstep (no step in the G, so none in
 * the pitch rate, TS-47). ESTIMATES, sized so the pitch rate changes by well under 0.5°/s in a step.
 */
const PUSH_EASE = Object.freeze({ onsetSec: 1.5, reverseSec: 2.5, releaseSec: 1.5 });

/**
 * The push over as a height table: G eases from 1 to pushG, holds, eases through 1 to recoverG, holds until the
 * flight path is level again, then eases back to 1 with the climb angle back at zero. Flown at constant true airspeed
 * (TS-38), wings level: V dγ/dt = g (n − cos γ) (standard aerodynamics). "pushSec" counts the time the G is below 1
 * to the middle of the reversal. Returns { table: { dt, alt, climb, nz } (alt from 0), durationSec, dropFt }.
 */
export function pushOverTable(tasFtps, { pushG = G_WARM.pushG, pushSec = G_WARM.pushSec, recoverG = G_WARM.recoverG } = {}) {
  const { onsetSec, reverseSec, releaseSec } = PUSH_EASE;
  const holdPush = Math.max(0, pushSec - onsetSec - reverseSec / 2);
  const fly = (holdRecover) => {
    const marks = [
      [onsetSec, 1, pushG],
      [holdPush, pushG, pushG],
      [reverseSec, pushG, recoverG],
      [holdRecover, recoverG, recoverG],
      [releaseSec, recoverG, 1],
    ];
    const total = marks.reduce((s, m) => s + m[0], 0);
    const nzAt = (t) => {
      let start = 0;
      for (const [span, from, to] of marks) {
        if (span > 0 && t <= start + span) return from + (to - from) * smoother(Math.max(0, (t - start) / span));
        start += span;
      }
      return 1;
    };
    // Integrated on a tenth of the flight step, written out every flight step.
    const sub = 10;
    const h = STEP_SEC / sub;
    const n = Math.ceil(total / STEP_SEC - 1e-9); // whole steps; after the last change the G is 1 and the path stays level
    const alt = [0];
    const climb = [0];
    const nz = [1];
    let gamma = 0;
    let z = 0;
    for (let i = 0; i < n * sub; i++) {
      const t = i * h;
      const rate = (g, tt) => (G_FTPS2 * (nzAt(tt) - Math.cos(g))) / tasFtps;
      // midpoint step for the climb angle, then the height with the mean climb
      const gMid = gamma + rate(gamma, t) * h / 2;
      const gNew = gamma + rate(gMid, t + h / 2) * h;
      z += tasFtps * (Math.sin(gamma) + Math.sin(gNew)) / 2 * h;
      gamma = gNew;
      if ((i + 1) % sub === 0) {
        alt.push(z);
        climb.push(tasFtps * Math.sin(gamma));
        nz.push(nzAt(t + h));
      }
    }
    return { table: { dt: STEP_SEC, alt, climb, nz }, durationSec: n * STEP_SEC, gammaEnd: gamma, dropFt: -z };
  };
  // The hold at the recovery G is whatever brings the flight path back to level: halved until it does.
  let lo = 0;
  let hi = 4 * (holdPush + onsetSec + reverseSec);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fly(mid).gammaEnd < 0) lo = mid;
    else hi = mid;
  }
  const best = fly((lo + hi) / 2);
  // The last few hundredths of a degree left by the step: the table ends with no climb, exactly level.
  best.table.climb[best.table.climb.length - 1] = 0;
  return best;
}

/**
 * The plan for the G-warm button: aircraft [Lead, #2, (#3, #4)] as they are now (Spread 4), t0 the formation time now.
 * Returns { plans, note, steps: [{ label, g, t0, t1 }], spacingAfter, firstId }.
 */
export function planGWarm(aircraft, t0) {
  const lead = aircraft[0];
  const two = aircraft.find((a) => a.id === 2) ?? aircraft[1];
  const toward = Math.sign(relativeTo(lead, two).left) || 1; // in place 90 toward #2 (AFM8 brief p.16 item 2; SMM 16.22 para 71)
  const h0 = wholeDegree(lead.headingRad);
  const h1 = wholeDegree(h0 + toward * Math.PI / 2);
  const h2 = wholeDegree(h1 - toward * Math.PI); // the hook the other way
  const bank3 = TURN_BANK_DEG; // 3 G, 70.5°
  const bankHook = bankDegFromG(G_WARM.hookG); // 4 G, 75.5°
  const tStandby = onStep(t0 + G_WARM.standbySec);

  // The common programme up to the push over: the end of the first turn is where the push starts.
  const first = [{ kind: 'hold', untilSec: tStandby, thenNext: true }, turnSeg(h1, toward, bank3)];
  const tPush = onStep(t0 + dryRun(lead, { segments: first }, t0).durationSec);
  const push = pushOverTable(lead.tasFtps);
  const tHook = tPush + push.durationSec;
  const toHook = [...first, { kind: 'hold', untilSec: tHook, thenNext: true }, turnSeg(h2, -toward, bankHook)];
  const tHookEnd = onStep(t0 + dryRun(lead, { segments: toHook }, t0).durationSec);
  const tBack = tHookEnd + onStep(G_WARM.completeSec);
  /** @returns {any[]} */
  const common = () => [...toHook.map((s) => ({ ...s })), { kind: 'hold', untilSec: tBack, thenNext: true }, turnSeg(h0, toward, bank3)];
  const leadRun = dryRun(lead, { segments: common() }, t0);
  const tEnd = onStep(t0 + leadRun.durationSec);
  // The heading Lead really rolls out on (the fixed step leaves a fraction of a degree): the wingmen's last turn aims at it, so the line stays parallel.
  const hLead = leadRun.end.headingRad;

  // Tighten: each wingman moves across toward Lead so the gaps close to tightFt (AFM8 brief p.16 item 5). Where each
  // ends: its place in the line (how many gaps from Lead, on which side) times the new gap.
  const offsets = aircraft.map((a) => relativeTo(lead, a).left);
  const order = [...offsets].map((left, i) => ({ left, i })).sort((p, q) => p.left - q.left);
  const leadRank = order.findIndex((o) => o.i === 0);
  const now = Math.max(...offsets) - Math.min(...offsets);
  const gaps = Math.max(1, aircraft.length - 1);
  const tighten = now / gaps > G_WARM.tightFt + 50; // a line already at 4,000 ft or tighter is left as it is
  const spacingAfter = tighten ? G_WARM.tightFt : now / gaps;

  const plans = {};
  let tDone = tEnd;
  for (const a of aircraft) {
    const segs = common();
    const profile = [{ t0: tPush, t1: tPush + push.durationSec, table: { ...push.table, alt: push.table.alt.map((z) => a.altAboveFt + z) } }];
    if (tighten && a.id !== lead.id) {
      const rank = order.findIndex((o) => o.i === aircraft.indexOf(a)) - leadRank;
      const target = rank * G_WARM.tightFt; // left of Lead, feet (negative is right)
      // The end of the programme as flown, then the lateral leg sized from the geometry and corrected twice by dry runs.
      const atEnd = dryRun(a, { segments: common(), profile }, t0).end;
      const move = target - relativeTo(leadRun.end, atEnd).left; // the line keeps its shape through the turns, so this is the gap change
      const leg = lateralLeg(move, a.tasFtps);
      const out = () => turnSeg(wholeDegree(h0 + leg.dir * leg.angleRad), leg.dir, FIX_LIMITS.lateralBankDeg);
      const outSec = onStep(dryRun(atEnd, { segments: [out()] }, tEnd).durationSec);
      const lateral = (hold) => [out(), ...(hold > 0 ? [{ kind: 'hold', untilSec: tEnd + outSec + hold }] : []), turnSeg(hLead, -leg.dir, FIX_LIMITS.lateralBankDeg)];
      const sideMoved = (hold) => relativeTo(atEnd, dryRun(atEnd, { segments: lateral(hold) }, tEnd).end).left;
      let hold = onStep(Math.max(0, leg.holdSec));
      for (let k = 0; k < 2 && hold > 0; k++) {
        hold = onStep(Math.max(0, hold + (leg.dir * (move - sideMoved(hold))) / (a.tasFtps * Math.sin(leg.angleRad))));
      }
      const latSegs = lateral(hold);
      segs.push(...latSegs);
      tDone = Math.max(tDone, t0 + dryRun(a, { segments: segs, profile }, t0).durationSec);
    }
    plans[a.id] = { segments: segs, profile };
  }

  const steps = [
    { name: 'stand-by', label: 'Stand-by for G-warm: PCL max, fuel check, 220 KIAS (15 s, estimate)', g: 1, t0, t1: tStandby },
    { name: 'in place 90 toward #2', label: `In place 90 toward #2 at ${G_WARM.firstG} G`, g: G_WARM.firstG, t0: tStandby, t1: tPush },
    { name: 'push over', label: `Push over: ${G_WARM.pushG} G for about ${G_WARM.pushSec} s, then back to level at ${G_WARM.recoverG} G (estimate)`, g: G_WARM.pushG, t0: tPush, t1: tHook, push: true },
    { name: 'hook', label: `Hook the other way at ${G_WARM.hookG} G (220 KIAS held; the real aircraft bleeds energy, SMM 16.22 para 71)`, g: G_WARM.hookG, t0: tHook, t1: tHookEnd },
    { name: 'complete calls', label: '"Complete" calls in order (4 s, estimate)', g: 1, t0: tHookEnd, t1: tBack },
    { name: 'in place 90 back', label: `In place 90 back at ${G_WARM.firstG} G`, g: G_WARM.firstG, t0: tBack, t1: tEnd },
    ...(tighten ? [{ name: 'tighten', label: `Tighten line abreast to about ${G_WARM.tightFt.toLocaleString('en-CA')} ft (AFM8 brief p.16)`, g: 1, t0: tEnd, t1: tDone }] : []),
  ];
  return {
    plans,
    note: `G-warm: in place 90 toward #2 at 3 G, half-G push over, hook the other way at 4 G, in place 90 back${tighten ? ', then tighten to 4,000 ft' : ''}. The push over loses about ${Math.round(push.dropFt / 10) * 10} ft (an estimate: the SMM gives no figure).`,
    steps,
    spacingAfter,
    pushDropFt: push.dropFt,
  };
}
