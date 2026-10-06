// A press mid-move (F11, TS-76): what happens to Lead and #2. args: case numbers to run (default all).
const W = '/home/user/Dads-debreif/src/modules/turn-sim/live';
const F = await import(W + '/formation.js');
const T = await import(W + '/tuning.js');
const M = await import(W + '/manoeuvres.js');
T.setRates('instructor');
const r0 = (x) => Math.round(x);
const relw = (f) => { const q = M.relativeTo(f.state.aircraft[0], f.state.aircraft[1]); return `fwd ${r0(q.fwd)} left ${r0(q.left)} up ${r0(f.state.aircraft[1].altAboveFt - f.state.aircraft[0].altAboveFt)}`; };
const flyFor = (f, sec) => { for (let i = 0; i < Math.round(sec / 0.05); i++) f.step(); };
function flyOut(f, max = 300) {
  const t0 = f.state.tSec; let jumpL = 0, jumpW = 0, maxBankW = 0, minK = 999, maxG = 0;
  let pL = { ...f.state.aircraft[0] }, pW = { ...f.state.aircraft[1] };
  while (f.state.current && f.state.tSec - t0 < max) {
    f.step();
    const [L, Wg] = f.state.aircraft;
    jumpL = Math.max(jumpL, Math.abs(L.bankDeg - pL.bankDeg) / 0.05);
    jumpW = Math.max(jumpW, Math.abs(Wg.bankDeg - pW.bankDeg) / 0.05);
    maxBankW = Math.max(maxBankW, Math.abs(Wg.bankDeg)); minK = Math.min(minK, Wg.kias); maxG = Math.max(maxG, Wg.g);
    pL = { ...L }; pW = { ...Wg };
  }
  return `${(f.state.tSec - t0).toFixed(1)} s; Lead roll max ${r0(jumpL)}°/s, #2 roll max ${r0(jumpW)}°/s, #2 bank max ${r0(maxBankW)}°, min ${r0(minK)} KIAS, G max ${maxG.toFixed(1)}`;
}
const cases = {
  1: ['lab->echelon (TRJ), at 20 s press fw', (f) => { f.change('echelon'); flyFor(f, 20); return f.change('fw'); }],
  2: ['lab->echelon (TRJ), at 45 s press route', (f) => { f.change('echelon'); flyFor(f, 45); return f.change('route'); }],
  3: ['echelon->fw, at 4 s press echelon', (f) => { f.change('echelon'); flyOut(f); f.change('fw'); flyFor(f, 4); return f.change('echelon'); }],
  4: ['echelon close turn L, at 2 s press route', (f) => { f.change('echelon'); flyOut(f); f.press('delayed90', 1); flyFor(f, 2); return f.change('route'); }],
  5: ['fw->echelon (TRJ), at 15 s press lab', (f) => { f.change('fw'); flyOut(f); f.change('echelon'); flyFor(f, 15); return f.change('lab'); }],
  6: ['lab->fw, at 25 s press lab', (f) => { f.change('fw'); flyFor(f, 25); return f.change('lab'); }],
  7: ['echelon->lab, at 15 s press echelon', (f) => { f.change('echelon'); flyOut(f); f.change('lab'); flyFor(f, 15); return f.change('echelon'); }],
  8: ['lab->echelon (TRJ), at 20 s press SARJ echelon', (f) => { f.change('echelon'); flyFor(f, 20); return f.change('echelon', { rejoin: 'straight' }); }],
  9: ['echelon close turn L at 2 s, press turn R', (f) => { f.change('echelon'); flyOut(f); f.press('delayed90', 1); flyFor(f, 2); return f.press('delayed90', -1); }],
  10: ['lab->echelon at 20 s press turn L', (f) => { f.change('echelon'); flyFor(f, 20); return f.press('delayed90', 1); }],
};
const want = process.argv.slice(2).map(Number);
for (const [k, [label, run]] of Object.entries(cases)) {
  if (want.length && !want.includes(Number(k))) continue;
  const f = F.createFormation({});
  const t = Date.now();
  let res; try { res = run(f); } catch (e) { console.log(k, label, 'THREW', e.message); continue; }
  const ms = Date.now() - t;
  const c = f.state.current;
  console.log(`${k}. ${label}: ${res} ${f.state.refusal ?? ''} | now: ${c?.label ?? '-'} picked ${c?.change?.chooser?.picked ?? '-'} | Lead bank ${r0(f.state.aircraft[0].bankDeg)} | #2 ${relw(f)} | plan ${ms} ms`);
  console.log("    compared:", JSON.stringify(c?.change?.chooser?.compared?.map((x) => [x.name, Math.round(x.durationSec), x.passes, x.fallback]))); console.log("   ", flyOut(f), '|', f.state.judged?.text ?? '(no judge)', f.state.queued ? 'QUEUED ' + f.state.queued.label : '');
}
