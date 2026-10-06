const L = process.argv[2] + '/src/modules/turn-sim/live';
const F = await import(L + '/formation.js');
const f = F.createFormation({ ships: 2 });
const settle = () => { let n = 0; while ((f.state.current || f.state.queued) && n++ < 40000) f.step(); };
for (const p of [['echelon', {}], ['fw', {}]]) { f.change(p[0], p[1]); settle(); }
console.log('before', JSON.stringify(f.where()));
const P = await import(L + '/lag-roll.js'); const lr = P.planLagRoll(f.state.aircraft, {}).lagRoll; console.log(JSON.stringify({setUp: lr.setUpSec, roll: lr.rollSec, close: Math.round(lr.closeSec), fb: lr.fallBackFt, top: Math.round(lr.topRangeFt), H: lr.climbFt, nose: Math.round(lr.maxClimbDeg), g: lr.maxG.toFixed(1), minK: Math.round(lr.minKias), minR: Math.round(lr.minRangeFt)})); const r = f.lagRoll();
const t0 = f.state.tSec; settle();
const [a, b] = f.state.aircraft; const dx = b.xFt - a.xFt, dy = b.yFt - a.yFt;
console.log('after', (f.state.tSec - t0).toFixed(1), 's', JSON.stringify(f.where()), 'range', Math.hypot(dx, dy).toFixed(0), 'dz', (b.altAboveFt - a.altAboveFt).toFixed(0));
