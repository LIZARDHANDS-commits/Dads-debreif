// Read-only trace of the Turn Fight Energy engine on main (no browser). Run from the repo root:
//   node /mnt/project-files/turn-fight-review/trace.mjs [name]
// Prints, per fight: move sequence per jet, result, min height, max KIAS, and the
// biggest step-to-step jumps in G, roll rate and pitch rate (what shows as a snap).
import { createEnergyFight, stepEnergyFight } from '/home/user/Dads-debreif/src/modules/turn-fight/energy-sim.js';
import { DEFAULTS, energySetupFrom } from '/home/user/Dads-debreif/src/modules/turn-fight/state.js';

const STEP = 0.02;
export function run(name, over = {}, maxSec = 240) {
  const values = { ...DEFAULTS, ...over };
  const setup = { ...energySetupFrom(values), ...(over.engine || {}) };
  const t0 = performance.now();
  const s = createEnergyFight(setup);
  const tCreate = performance.now() - t0;
  const out = { name, setup: { kias: [setup.blueKias, setup.redKias], alt: [setup.blueAltFt, setup.redAltFt], moves: [setup.blueMove, setup.redMove], sep: setup.separationNm, ata: setup.ataDeg } };
  const per = {};
  for (const who of ['blue', 'red']) per[who] = { seq: [], last: null, prev: null, minAlt: Infinity, maxKias: 0, minKias: Infinity, maxG: 0, dG: { v: 0, t: 0, from: '' }, dRoll: { v: 0, t: 0 }, dPitch: { v: 0, t: 0 }, jump: 0, mptSec: 0, pursuitSec: 0, overG: false, stall: false, belowDeckSec: 0 };
  let steps = 0;
  const tRun0 = performance.now();
  while (!s.stopped && s.timeSec < maxSec && !s.kill && !s.collision) {
    const before = { blue: { ...s.blue, pm: { ...s.blue.pm } }, red: { ...s.red, pm: { ...s.red.pm } } };
    stepEnergyFight(s, STEP);
    steps++;
    for (const who of ['blue', 'red']) {
      const a = s[who], b = before[who], r = per[who];
      const label = `${a.moveLabel}${a.ctl.mode !== a.move ? '[' + a.ctl.mode + ']' : ''}`;
      if (label !== r.last) { r.seq.push(`${s.timeSec.toFixed(1)}s ${label}`); r.last = label; }
      r.minAlt = Math.min(r.minAlt, a.altFt); r.maxKias = Math.max(r.maxKias, a.kias); r.minKias = Math.min(r.minKias, a.kias); r.maxG = Math.max(r.maxG, a.g);
      if (a.altFt < s.setup.hardDeckFt) r.belowDeckSec += STEP;
      if (a.ctl.mode === 'mpt' || a.ctl.mode === 'levelMpt') r.mptSec += STEP;
      if (a.ctl.mode === 'pursuit') r.pursuitSec += STEP;
      r.overG ||= a.overG; r.stall ||= a.stall;
      if (s.merged && b.g !== undefined && s.timeSec > s.mergeSec + STEP * 2) {
        const dg = Math.abs(a.g - b.g) / STEP; // G per second
        if (dg > r.dG.v) r.dG = { v: dg, t: s.timeSec, from: `${b.g.toFixed(2)}->${a.g.toFixed(2)} ${label}` };
        const rr = a.rollDegPerSec ?? 0, rrb = b.rollDegPerSec ?? 0;
        const dr = Math.abs(rr - rrb) / STEP; // roll acceleration deg/s^2
        if (dr > r.dRoll.v) r.dRoll = { v: dr, t: s.timeSec, label };
        // flight path (pitch) rate from climb angle
        const q = (a.climbDeg - b.climbDeg) / STEP;
        if (r.prevQ !== undefined) { const dq = Math.abs(q - r.prevQ) / STEP; if (dq > r.dPitch.v) r.dPitch = { v: dq, t: s.timeSec, label }; }
        r.prevQ = q;
      }
      // position continuity: distance moved vs speed*dt
      const moved = Math.hypot(a.pm.x - b.pm.x, a.pm.y - b.pm.y, a.pm.z - b.pm.z);
      const expect = Math.hypot(b.pm.vx, b.pm.vy, b.pm.vz) * STEP;
      r.jump = Math.max(r.jump, moved - expect);
    }
  }
  const tRun = performance.now() - tRun0;
  out.result = { timeSec: +s.timeSec.toFixed(1), firstNose: s.firstNose && `${s.firstNose.by} @${s.firstNose.timeSec.toFixed(1)}s`, chase: s.chase && `${s.chase.by} @${s.chase.timeSec.toFixed(1)}s`, kill: s.kill && `${s.kill.victor} @${s.kill.timeSec.toFixed(1)}s`, collision: s.collision && `@${s.collision.timeSec.toFixed(1)}s`, stopped: s.stopped };
  out.compute = { createMs: Math.round(tCreate), runMs: Math.round(tRun), steps, msPerSimSec: +(tRun / s.timeSec).toFixed(1) };
  for (const who of ['blue', 'red']) {
    const r = per[who];
    out[who] = { seq: r.seq.slice(0, 14).join(' | ') + (r.seq.length > 14 ? ` | ...(${r.seq.length} changes)` : ''), minAlt: Math.round(r.minAlt), belowDeckSec: +r.belowDeckSec.toFixed(1), kias: `${Math.round(r.minKias)}-${Math.round(r.maxKias)}`, maxG: +r.maxG.toFixed(2), mptSec: +r.mptSec.toFixed(1), pursuitSec: +r.pursuitSec.toFixed(1), overG: r.overG, stall: r.stall,
      maxGRate: `${r.dG.v.toFixed(0)} G/s at ${r.dG.t.toFixed(1)}s (${r.dG.from})`, maxRollAccel: `${r.dRoll.v.toFixed(0)} deg/s2 at ${r.dRoll.t.toFixed(1)}s (${r.dRoll.label})`, maxPitchAccel: `${r.dPitch.v.toFixed(0)} deg/s2 at ${r.dPitch.t.toFixed(1)}s (${r.dPitch.label})`, posJumpFt: +r.jump.toFixed(2) };
  }
  return out;
}

const CASES = {
  default: {},
  auto: { blueMove: 'auto', redMove: 'auto' },
  m140: { blueKias: 140, redKias: 140 },
  m180: { blueKias: 180, redKias: 180 },
  m260: { blueKias: 260, redKias: 260 },
  m300: { blueKias: 300, redKias: 300 },
  auto300: { blueKias: 300, redKias: 300, blueMove: 'auto', redMove: 'auto' },
  auto140: { blueKias: 140, redKias: 140, blueMove: 'auto', redMove: 'auto' },
  unequal: { blueKias: 250, redKias: 180 },
  low: { blueAltFt: 7000, redAltFt: 7000 },
  forcedImm: { blueMove: 'immelmann', redMove: 'mpt' },
  forcedSplitS: { blueKias: 120, redKias: 120, blueMove: 'splitS', redMove: 'splitS' },
  forcedSlice: { blueKias: 150, redKias: 150, blueMove: 'slice', redMove: 'slice' },
  forcedPitchBack: { blueKias: 200, redKias: 200, blueMove: 'pitchBack', redMove: 'pitchBack' },
  heights: { blueAltFt: 10000, redAltFt: 12000 },
};
const pick = process.argv.slice(2);
for (const [name, over] of Object.entries(CASES)) {
  if (pick.length && !pick.includes(name)) continue;
  try { console.log(JSON.stringify(run(name, over), null, 1)); } catch (e) { console.log(name, 'ERROR', e.message); }
}
