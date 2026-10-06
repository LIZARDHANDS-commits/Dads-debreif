const W = '/home/user/Dads-debreif/src/modules/turn-sim/live';
const F = await import(W + '/formation.js');
const T = await import(W + '/tuning.js');
const M = await import(W + '/manoeuvres.js');
T.setRates('instructor');
const flyFor = (f, sec) => { for (let i = 0; i < Math.round(sec / 0.05); i++) f.step(); };
const flyOut = (f) => { const t0 = f.state.tSec; while (f.state.current && f.state.tSec - t0 < 300) f.step(); return (f.state.tSec - t0).toFixed(1); };
const trace = (f, sec, every = 1) => { for (let i = 0; i <= sec * 20; i++) { if (i % (every * 20) === 0) { const [L, Wg] = f.state.aircraft; const q = M.relativeTo(L, Wg); console.log((i / 20).toFixed(0).padStart(3), 's fwd', Math.round(q.fwd), 'left', Math.round(q.left), 'L', L.kias.toFixed(0), Math.round(L.bankDeg), '| #2', Wg.kias.toFixed(0), 'bank', Wg.bankDeg.toFixed(0), 'G', Wg.g.toFixed(1)); } if (!f.state.current) break; f.step(); } };
const which = process.argv[2];
if (which === '1') { const f = F.createFormation({}); f.change('echelon'); flyFor(f, 20); f.change('fw'); console.log(f.state.current.note); trace(f, 12, 0.5); }
if (which === '7') { const f = F.createFormation({}); f.change('echelon'); flyOut(f); f.change('lab'); flyFor(f, 15); f.change('echelon'); console.log(f.state.current.note); trace(f, 55, 2); }
