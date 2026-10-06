// Flight set for the refactor: end state after each press. Usage: node fset.mjs <repo root>
const L = process.argv[2] + '/src/modules/turn-sim/live';
const F = await import(L + '/formation.js');
const R = await import(L + '/rates.js');
const out = [];
const run = (f, label, fn) => {
  let r; const t0 = Date.now();
  try { r = fn(); } catch (e) { out.push(label + ' ERR ' + e.message); return; }
  let n = 0; while ((f.state.current || f.state.queued) && n++ < 40000) f.step();
  out.push(label + ' ' + r + ' t=' + f.state.tSec.toFixed(3) + ' ' + f.state.aircraft.map(a => [a.xFt, a.yFt, a.altAboveFt, a.kias].map(v => v.toFixed(3)).join(',')).join('|') + ' ' + JSON.stringify(f.where()));
  process.stderr.write(label + ' ' + (Date.now() - t0) + 'ms\n');
};
const two = [
  ['fw', { side: 'keep', rejoin: 'into' }], ['echelon', {}], ['route', {}], ['echelon', {}], ['fw', {}], ['lab', {}],
  ['fw', { rejoin: 'straight' }], ['LAG'], ['FW', 'levelTurn', 1], ['FW', 'wingsLevel', 1], ['lab', { side: 'left' }],
  ['fw', { rejoin: 'roll' }], ['lab', {}], ['echelon', { rejoin: 'into' }], ['astern', {}], ['lab', {}],
];
for (const rates of ['student', 'instructor', 'ai']) {
  R.setRates(rates);
  const f = F.createFormation({ ships: 2 });
  two.forEach((p, i) => run(f, `${rates} ${i} ${p.join(':').replace(/\[object Object\]/, JSON.stringify(p[1]))}`,
    () => p[0] === 'LAG' ? f.lagRoll() : p[0] === 'FW' ? f.pressFw(p[1], p[2]) : f.change(p[0], p[1])));
}
R.setRates('instructor');
const f4 = F.createFormation({ ships: 4 });
for (const to of ['fw', 'finger', 'echelon', 'box', 'trail', 'spread4', 'fluid4', 'offsetBox', 'finger']) run(f4, '4 ' + to, () => f4.change(to, {}));
console.log(out.join('\n'));
