const W = '/home/user/Dads-debreif/src/modules/turn-sim/live';
const F = await import(W + '/formation.js');
const T = await import(W + '/tuning.js');
const R = await import(W + '/replan.js');
const M = await import(W + '/manoeuvres.js');
T.setRates('instructor');
const flyFor = (f, sec) => { for (let i = 0; i < Math.round(sec / 0.05); i++) f.step(); };
const flyOut = (f) => { const t0 = f.state.tSec; while (f.state.current && f.state.tSec - t0 < 300) f.step(); return (f.state.tSec - t0).toFixed(1); };
const f = F.createFormation({}); f.change('echelon'); flyOut(f); f.change('lab'); flyFor(f, 15);
const r = R.planFromHere(f.state.aircraft, 'echelon', { mid: { lead: { kind: 'straight' } } }, f.state.tSec);
f.state.plans = r.plans; f.state.current.endSec = r.endSec;
for (let i = 0; i < 50 * 20; i++) { f.step(); if (i % 40 === 0) { const [L, Wg] = f.state.aircraft; const q = M.relativeTo(L, Wg); console.log((i / 20).toFixed(0), 's fwd', Math.round(q.fwd), 'left', Math.round(q.left), 'L', L.kias.toFixed(0), '#2', Wg.kias.toFixed(0), 'bank', Wg.bankDeg.toFixed(0)); } }
