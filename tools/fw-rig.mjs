// The scripted-Lead rig (plan T29m part 2, CA3 / M2, and Plan B5 S0/S1 verification):
// Exports: none (CLI tool).
// Imports: node:fs, live/fluid-lead, live/wingman/fighting-wing, live/wingman/perception, live/wingman/fw-reference,
// live/wingman/shaper, live/flight, core/t6-performance, core/units, core/angles, live/wing-moves, live/moves,
// live/formation, live/rates, live/attitude.
// Depended on by: CLI verification and tools/flight-design/results/fw-rig.json.
//
// Usage:
//   node tools/fw-rig.mjs                    every case + S0/S1 checks; writes tools/flight-design/results/fw-rig.json
//   node tools/fw-rig.mjs --case vertical-T1 one case, printed
//   node tools/fw-rig.mjs --s0-lags          S0 plant lags (D13), closure ripple (D25), and S1 cap/shaper checks (C8)
import { mkdirSync, writeFileSync } from 'node:fs';
import { leadStateOf, stepLead } from '../src/modules/turn-sim/live/fluid-lead.js';
import { startFwWing, stepFwWingman, setFwAnalysis, liftWithin } from '../src/modules/turn-sim/live/wingman/fighting-wing.js';
import { seenOf, startFwSight, seeFw } from '../src/modules/turn-sim/live/wingman/perception.js';
import { makeFwReference, blendFwReferences, stepFwBlendWeight } from '../src/modules/turn-sim/live/wingman/fw-reference.js';
import { shapeFwLift } from '../src/modules/turn-sim/live/wingman/shaper.js';
import { STEP_SEC } from '../src/modules/turn-sim/live/flight.js';
import { ROLL } from '../src/modules/turn-sim/live/rates.js';
import { iasToTasKt } from '../src/core/t6-performance.js';
import { G_FTPS2, KT_TO_FTPS } from '../src/core/units.js';
import { DEG } from '../src/core/angles.js';
import { FW_WING } from '../src/modules/turn-sim/live/wing-moves.js';
import { KIAS_OUTSIDE_LAB } from '../src/modules/turn-sim/live/moves.js';
import { LIVE_DEFAULTS } from '../src/modules/turn-sim/live/formation.js';
import { cross3, unit3, add3, scale3, sub3, dot3, perp3, len3 } from '../src/modules/turn-sim/live/attitude.js';

const Z = { x: 0, y: 0, z: 1 };
const KIAS = KIAS_OUTSIDE_LAB;
const BLOCK = LIVE_DEFAULTS.blockFt;
const TAS = iasToTasKt(KIAS, BLOCK) * KT_TO_FTPS;
const SETTLE = 40; // s before the step (estimate: the slowest loop's time, the arc loop's 10 s, four times)
const AFTER = 40; // s recorded after it

const aircraftAt = (x, y, alt, headingRad, extra = {}) => ({ xFt: x, yFt: y, altAboveFt: alt, headingRad, tasFtps: TAS, climbFtps: 0, bankDeg: 0, rollRateDps: 0, g: 1, ...extra });

/** Lead's ask for the script: straight and level, or a steady level turn left (away from #2 on his right) at bankDeg. */
function leadAsk(st, bankDeg) {
  if (!bankDeg) return { lift: { x: 0, y: 0, z: 1 }, holdKias: KIAS };
  const left = unit3(cross3(Z, st.nose));
  return { lift: add3(Z, scale3(left, Math.tan((bankDeg * Math.PI) / 180))), holdKias: KIAS };
}

/** #2 against Lead: height (ft, + above), lateral (ft, + right of Lead's path, his side), behind (ft), and his KIAS. */
function rel(L, two) {
  const n = unit3(L.vel);
  const left = unit3(cross3(Z, n));
  const r = sub3(two.pm, L.pm);
  return { height: r.z, right: -dot3(r, left), behind: -dot3(r, n), kias: two.kias };
}

const CASES = {
  'vertical-T1': { bank: 0, probe: 'heightTarget', amp: 40, read: (x) => x.rel.height, what: 'height against Lead (ft) for a 40 ft step in the height target', model: 'vertical PD' },
  'steering-T1': { bank: 0, probe: 'aimLateral', amp: 60, read: (x) => x.rel.right, what: 'his lateral place (ft, out) for a 60 ft step in the swept aim', model: 'steering T1' },
  'power-T1': { bank: 0, probe: 'wantKias', amp: 3, read: (x) => x.rel.kias, what: 'his KIAS for a 3 KIAS step in the wanted speed', model: 'speed hold' },
  'offset-T2': { bank: 60, probe: 'aimLateral', amp: 60, read: (x) => x.trace.dFt, what: 'his offset d inside Lead\'s circle (ft) for a 60 ft step in the aim\'s offset', model: 'steering T2 (through the 1.5 s aim blend)' },
  'arc-T2': { bank: 60, probe: 'cWant', amp: 5, read: (x) => x.trace.cActualFtps, what: 'his arc closure (ft/s) for a 5 ft/s step in the wanted closure', model: 'arc loop' },
};

function run(name) {
  const c = CASES[name];
  const back = FW_WING.sweptFt * Math.sin((FW_WING.sweptDeg * Math.PI) / 180);
  const out = FW_WING.sweptFt * Math.cos((FW_WING.sweptDeg * Math.PI) / 180);
  let L = leadStateOf(aircraftAt(0, 0, 0, 0), BLOCK);
  // #2 on the swept place, on Lead's right (heading 0 is +x; right is -y), his stack below
  const two0 = aircraftAt(-back, -out, FW_WING.stackFt, 0);
  setFwAnalysis({ probe: { at: c.probe, fn: (t) => (t >= SETTLE ? c.amp : 0) } });
  let w = startFwWing(two0, L, { blockFt: BLOCK });
  setFwAnalysis(); // flying restored for anything started after
  const series = [];
  const n = Math.round((SETTLE + AFTER) / STEP_SEC);
  for (let i = 0; i < n; i++) {
    const r = stepFwWingman(w, L);
    L = stepLead(L, leadAsk(L, c.bank));
    w = r.w;
    if (i % 2 === 0) series.push({ t: +w.t.toFixed(2), rel: rel(L, w.st), trace: r.trace });
  }
  // the response: the read value less its mean over the 2 s before the step, over the step's size
  const pre = series.filter((x) => x.t > SETTLE - 2 && x.t <= SETTLE).map(c.read).filter(Number.isFinite);
  const base = pre.reduce((a, b) => a + b, 0) / Math.max(pre.length, 1);
  const resp = series.filter((x) => x.t > SETTLE).map((x) => ({ t: +(x.t - SETTLE).toFixed(2), y: (c.read(x) - base) / c.amp }));
  const fin = resp.filter((x) => x.t > AFTER - 5).map((x) => x.y);
  const final = fin.reduce((a, b) => a + b, 0) / Math.max(fin.length, 1);
  const peak = resp.reduce((m, x) => (Math.abs(x.y) > Math.abs(m) ? x.y : m), 0);
  const t63 = resp.find((x) => Math.abs(x.y) >= 0.63 * Math.abs(final))?.t ?? null;
  const filterSteps = series.filter((x) => x.t > SETTLE && x.trace.ctl?.filterOn).length;
  const trim = series.filter((x) => x.t > SETTLE - 2 && x.t <= SETTLE);
  const at = trim[trim.length - 1];
  return {
    name, what: c.what, model: c.model, probe: c.probe, amp: c.amp, leadBankDeg: c.bank,
    trim: { sFt: at?.trace.sFt ?? null, dFt: at?.trace.dFt ?? null, slantFt: Math.round(at?.trace.slant ?? NaN), heightFt: Math.round(at?.rel.height ?? NaN), job: at?.trace.job ?? null },
    final: +final.toFixed(3), peak: +peak.toFixed(3), overshootPct: final ? Math.round((100 * (Math.abs(peak) - Math.abs(final))) / Math.abs(final)) : null, t63Sec: t63,
    filterStepsAfter: filterSteps, guardOnAfter: series.filter((x) => x.t > SETTLE && x.trace.ctl?.guardOn).length,
    response: resp.filter((_, i) => i % 2 === 0),
  };
}

/** Measure achieved horizontal turn-rate lag behind a step dOmegaRadps at trim bankDeg (D13: ~0.18 s linear model). */
function measureTurnRateLag(label, bankDeg, dOmegaRadps) {
  const g0 = 1 / Math.cos(bankDeg * DEG);
  let st = leadStateOf(aircraftAt(0, 0, 0, 0, { bankDeg: -bankDeg, g: g0 }), BLOCK);
  const warmSteps = Math.round(6 / STEP_SEC);
  const runSteps = Math.round(6 / STEP_SEC);
  const omega0 = (G_FTPS2 * Math.tan(bankDeg * DEG)) / TAS;
  const stepCmd = (s, dw) => {
    const V = len3(s.vel);
    const u = unit3(s.vel);
    const left = unit3(cross3(Z, u));
    const aTurn = scale3(left, (omega0 + dw) * V);
    const hold1G = perp3(Z, u);
    const comp = liftWithin(aTurn, hold1G, 6.0, s.bodyUp, { hold1G, vertVec: { x: 0, y: 0, z: 0 }, vertG: 0 });
    return stepLead(s, { lift: comp.lift, roll: { ...ROLL, maxRateDps: FW_WING.rollDps }, holdKias: KIAS });
  };
  for (let i = 0; i < warmSteps; i++) st = stepCmd(st, 0);
  const omOf = (s) => {
    const vxy2 = s.vel.x * s.vel.x + s.vel.y * s.vel.y;
    const crossZ = s.vel.x * (s.accPerp?.y ?? 0) - s.vel.y * (s.accPerp?.x ?? 0);
    return crossZ / Math.max(vxy2, 1);
  };
  const omBase = omOf(st);
  const trace = [];
  for (let i = 1; i <= runSteps; i++) {
    st = stepCmd(st, dOmegaRadps);
    trace.push({ t: +(i * STEP_SEC).toFixed(3), dOm: omOf(st) - omBase });
  }
  const final = trace[trace.length - 1].dOm;
  const t63 = trace.find((x) => Math.abs(x.dOm) >= 0.632 * Math.abs(final))?.t ?? null;
  const t90 = trace.find((x) => Math.abs(x.dOm) >= 0.9 * Math.abs(final))?.t ?? null;
  return { label, bankDeg, stepRadps: dOmegaRadps, achievedRadps: +final.toFixed(4), t63Sec: t63, t90Sec: t90, modelTauSec: 0.18 };
}

/** Measure achieved vertical acceleration lag behind a step dVertG at trim bankDeg (D13: ~0.20 s linear model). */
function measureVertGLag(label, bankDeg, dVertG) {
  const g0 = 1 / Math.cos(bankDeg * DEG);
  let st = leadStateOf(aircraftAt(0, 0, 0, 0, { bankDeg: -bankDeg, g: g0 }), BLOCK);
  const warmSteps = Math.round(6 / STEP_SEC);
  const runSteps = Math.round(6 / STEP_SEC);
  const omega0 = (G_FTPS2 * Math.tan(bankDeg * DEG)) / TAS;
  const stepCmd = (s, dvG) => {
    const V = len3(s.vel);
    const u = unit3(s.vel);
    const left = unit3(cross3(Z, u));
    const aTurn = scale3(left, omega0 * V);
    const hold1G = perp3(Z, u);
    const vertVec = scale3(perp3(Z, u), dvG);
    const hold = add3(hold1G, vertVec);
    const comp = liftWithin(aTurn, hold, 6.0, s.bodyUp, { hold1G, vertVec, vertG: dvG });
    return stepLead(s, { lift: comp.lift, roll: { ...ROLL, maxRateDps: FW_WING.rollDps }, holdKias: KIAS });
  };
  for (let i = 0; i < warmSteps; i++) st = stepCmd(st, 0);
  const vz0 = st.vel.z;
  let prevVz = vz0;
  const trace = [];
  for (let i = 1; i <= runSteps; i++) {
    st = stepCmd(st, dVertG);
    const azG = (st.vel.z - prevVz) / STEP_SEC / G_FTPS2;
    prevVz = st.vel.z;
    trace.push({ t: +(i * STEP_SEC).toFixed(3), azG });
  }
  const t63 = trace.find((x) => Math.sign(dVertG) * x.azG >= 0.632 * Math.abs(dVertG))?.t ?? null;
  const t90 = trace.find((x) => Math.sign(dVertG) * x.azG >= 0.9 * Math.abs(dVertG))?.t ?? null;
  return { label, bankDeg, stepVertG: dVertG, t63Sec: t63, t90Sec: t90, modelTauSec: 0.2 };
}

/** Measure steady-state ripple of dead-reckoned slant closure (S14, D25) and arc closure (S20) at bankDeg. */
function measureSteadyClosureRipple(label, bankDeg) {
  const g0 = 1 / Math.cos(bankDeg * DEG);
  const omega = (G_FTPS2 * Math.tan(bankDeg * DEG)) / Math.max(TAS, 1);
  const R = omega > 1e-6 ? TAS / omega : 1e9;
  const arcBack = 650;
  const angBack = omega > 1e-6 ? arcBack / R : 0;
  let L = leadStateOf(aircraftAt(0, 0, 0, 0, { bankDeg: -bankDeg, g: g0 }), BLOCK);
  let two = leadStateOf(
    omega > 1e-6
      ? aircraftAt(-R * Math.sin(angBack), R * (1 - Math.cos(angBack)), -50, -angBack, { bankDeg: -bankDeg, g: g0 })
      : aircraftAt(-650, -200, -50, 0),
    BLOCK,
  );
  let sight = startFwSight(seenOf(L), seenOf(two), { g: g0 });
  const warmSteps = Math.round(6 / STEP_SEC);
  const sampleSteps = Math.round(10 / STEP_SEC);
  const slantClosures = [];
  const arcClosures = [];
  for (let i = 0; i < warmSteps + sampleSteps; i++) {
    const res = seeFw(sight, seenOf(L), seenOf(two));
    sight = res.mem;
    const seen = res.seen;
    if (i >= warmSteps) {
      slantClosures.push(seen.closure);
      if (seen.turn.centre && Number.isFinite(seen.turn.radiusFt)) {
        const relP = sub3(two.pm, seen.lead.p);
        const nL = unit3(seen.lead.v);
        const inward = unit3(seen.turn.aPerp);
        const x = dot3(relP, nL);
        const y = dot3(relP, inward);
        const r = Math.hypot(seen.turn.radiusFt - y, x);
        const radialIn = scale3(add3(scale3(inward, y - seen.turn.radiusFt), scale3(nL, x)), 1 / Math.max(r, 1));
        const axis = unit3(cross3(nL, inward));
        const tangent = unit3(cross3(axis, radialIn));
        arcClosures.push((seen.turn.radiusFt * dot3(two.vel, tangent)) / Math.max(r, 1) - len3(seen.lead.v));
      } else {
        arcClosures.push(dot3(two.vel, unit3(seen.lead.v)) - len3(seen.lead.v));
      }
    }
    L = stepLead(L, leadAsk(L, bankDeg));
    two = stepLead(two, leadAsk(two, bankDeg));
  }
  const stats = (arr) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const p2p = Math.max(...arr) - Math.min(...arr);
    const std = Math.sqrt(arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length);
    return { meanFtps: +mean.toFixed(4), p2pFtps: +p2p.toFixed(4), stdFtps: +std.toFixed(4) };
  };
  return { label, bankDeg, slantClosureS14: stats(slantClosures), arcClosureS20: stats(arcClosures) };
}

/** Verify Slice 1 B08 reference blender, B13 3-stage cap trimming (C8 forced 3.5 G Lead turn), and B14 urgency shaper. */
function verifyS1LiftAndShaper() {
  // C8 forced 3.5 G Lead turn: horizontal turn demand 3.35 G (matching 3.5 G total with 1 G level hold), positive climb +0.6 G
  const hold1G = { x: 0, y: 0, z: 1 };
  const vertVec = { x: 0, y: 0, z: 0.6 };
  const hold = add3(hold1G, vertVec);
  const aTurn = { x: 0, y: 3.35 * G_FTPS2, z: 0 };
  const bodyUp = unit3(add3(hold, { x: 0, y: 3.35, z: 0 }));
  const vertInfo = { hold1G, vertVec, vertG: 0.6 };

  // Stage 1: cap = 3.7 G -> |hold1G + turn| = 3.496 G <= gLim < |hold + turn| = 3.719 G -> positive climb gives way first
  const c1 = liftWithin(aTurn, hold, 3.7, bodyUp, vertInfo);
  // Stage 2: cap = 3.45 G -> |turn| = 3.35 G <= gLim < |hold1G + turn| = 3.496 G -> 1 G hold gives way second
  const c2 = liftWithin(aTurn, hold, 3.45, bodyUp, vertInfo);
  // Stage 3: cap = 3.1 G -> gLim < |turn| = 3.35 G -> horizontal turn gives way last
  const c3 = liftWithin(aTurn, hold, 3.1, bodyUp, vertInfo);
  // Unload-roll-pull: wings level (bodyUp = Z) while asking for 60° banked 2 G lift (> 20° off)
  const urpRes = liftWithin({ x: 0, y: Math.sqrt(3) * G_FTPS2, z: 0 }, hold1G, 5.0, Z, { hold1G, vertVec: { x: 0, y: 0, z: 0 }, vertG: 0 });

  // B14 urgency shaper: u = 0 -> 1.0 G/s, u = 1 -> 4.0 G/s
  const sh0 = shapeFwLift(1.0, { x: 0, y: 0, z: 3.0 }, 0, 1.0);
  const sh1 = shapeFwLift(1.0, { x: 0, y: 0, z: 3.0 }, 1, 1.0);

  // B08 reference blender: 1 -> 0 over 1.5 s
  const rA = makeFwReference({ aimLateralFt: -100, heightTargetFt: -50, urgency: 0 });
  const rB = makeFwReference({ aimLateralFt: 100, heightTargetFt: -200, urgency: 1 });
  const bMid = blendFwReferences(rA, rB, 0.5);
  const wAfter15 = stepFwBlendWeight(1.0, 1.5, 1.5);

  return {
    c8Forced35G: {
      stage1ClimbGivesWay: { capGaveWay: c1.capGaveWay, turnKeptG: +c1.lift.y.toFixed(3), vertZKeptG: +c1.lift.z.toFixed(3) },
      stage2HoldGivesWay: { capGaveWay: c2.capGaveWay, turnKeptG: +c2.lift.y.toFixed(3), holdZKeptG: +c2.lift.z.toFixed(3) },
      stage3TurnGivesWay: { capGaveWay: c3.capGaveWay, turnKeptG: +c3.lift.y.toFixed(3), holdZKeptG: +c3.lift.z.toFixed(3) },
      unloadRollPull: { rawAskedG: 2.0, grantedGAt60DegOff: +len3(urpRes.lift).toFixed(3) },
    },
    b14UrgencyShaper: {
      u0OnsetGps: sh0.onsetGps,
      u0ShapedGAfter1s: +sh0.shapedG.toFixed(3),
      u1OnsetGps: sh1.onsetGps,
      u1ShapedGAfter1s: +sh1.shapedG.toFixed(3),
    },
    b08ReferenceBlender: {
      midAimLateralFt: bMid.aimLateralFt,
      midHeightTargetFt: bMid.heightTargetFt,
      weightAfter15s: wAfter15,
    },
  };
}

function runS0S1Checks() {
  const turnLags = [
    measureTurnRateLag('turnLag-T1-002', 30, 0.02),
    measureTurnRateLag('turnLag-T1-005', 30, 0.05),
    measureTurnRateLag('turnLag-T2-002', 60, 0.02),
    measureTurnRateLag('turnLag-T2-005', 60, 0.05),
  ];
  const vertLags = [
    measureVertGLag('vertLag-T1-pos02', 30, 0.2),
    measureVertGLag('vertLag-T1-neg02', 30, -0.2),
    measureVertGLag('vertLag-T2-pos02', 60, 0.2),
    measureVertGLag('vertLag-T2-neg02', 60, -0.2),
  ];
  const ripples = [
    measureSteadyClosureRipple('ripple-T1-30deg', 30),
    measureSteadyClosureRipple('ripple-T2-60deg', 60),
  ];
  const s1Checks = verifyS1LiftAndShaper();
  return { turnLags, vertLags, ripples, s1Checks };
}

const args = process.argv.slice(2);
const s0Only = args.includes('--s0-lags');
const one = args.includes('--case') ? args[args.indexOf('--case') + 1] : null;

if (s0Only) {
  const checks = runS0S1Checks();
  console.log('=== S0 Plant Lags (D13) ===');
  for (const t of checks.turnLags) {
    console.log(`  ${t.label.padEnd(18)} bank=${t.bankDeg}° step=${t.stepRadps} rad/s -> achieved=${t.achievedRadps} rad/s, t63=${t.t63Sec} s (model ~${t.modelTauSec} s), t90=${t.t90Sec} s`);
  }
  for (const v of checks.vertLags) {
    console.log(`  ${v.label.padEnd(18)} bank=${v.bankDeg}° step=${v.stepVertG} G -> t63=${v.t63Sec} s (model ~${v.modelTauSec} s), t90=${v.t90Sec} s`);
  }
  console.log('=== S0 Steady-State Closure Ripple (D25) ===');
  for (const r of checks.ripples) {
    console.log(`  ${r.label.padEnd(18)} S14 slant closure p2p=${r.slantClosureS14.p2pFtps} ft/s (std=${r.slantClosureS14.stdFtps}) | S20 arc closure p2p=${r.arcClosureS20.p2pFtps} ft/s (std=${r.arcClosureS20.stdFtps})`);
  }
  console.log('=== S1 Lift Composer (B13, C8) & Shaper (B14) & Blender (B08) ===');
  console.log(`  C8 3.5G stage 1 (climb): ${JSON.stringify(checks.s1Checks.c8Forced35G.stage1ClimbGivesWay)}`);
  console.log(`  C8 3.5G stage 2 (hold):  ${JSON.stringify(checks.s1Checks.c8Forced35G.stage2HoldGivesWay)}`);
  console.log(`  C8 3.5G stage 3 (turn):  ${JSON.stringify(checks.s1Checks.c8Forced35G.stage3TurnGivesWay)}`);
  console.log(`  URP at 60° off:          ${JSON.stringify(checks.s1Checks.c8Forced35G.unloadRollPull)}`);
  console.log(`  B14 shaper:              ${JSON.stringify(checks.s1Checks.b14UrgencyShaper)}`);
  console.log(`  B08 blender:             ${JSON.stringify(checks.s1Checks.b08ReferenceBlender)}`);
} else {
  const names = one ? [one] : Object.keys(CASES);
  const results = names.map(run);
  for (const r of results) console.log(`${r.name.padEnd(12)} ${r.what}: final ${r.final}, peak ${r.peak} (overshoot ${r.overshootPct}%), 63% at ${r.t63Sec} s | trim s ${r.trim.sFt} d ${r.trim.dFt} slant ${r.trim.slantFt} height ${r.trim.heightFt} (${r.trim.job}) | filter acting ${r.filterStepsAfter} recorded steps, guard ${r.guardOnAfter}`);
  if (!one) {
    const s0s1 = runS0S1Checks();
    mkdirSync('tools/flight-design/results', { recursive: true });
    writeFileSync('tools/flight-design/results/fw-rig.json', `${JSON.stringify({ made: 'tools/fw-rig.mjs', kias: KIAS, blockFt: BLOCK, tasFtps: TAS, settleSec: SETTLE, afterSec: AFTER, cases: results, s0Lags: { turnLags: s0s1.turnLags, vertLags: s0s1.vertLags, ripples: s0s1.ripples }, s1Checks: s0s1.s1Checks }, null, 1)}\n`);
    console.log('wrote tools/flight-design/results/fw-rig.json');
  }
}

