// summary: worst error, max |bank - Lead bank|, min/max G of each wingman, for a set of close turns
const W = '/home/user/Dads-debreif/src/modules/turn-sim/live/';
const F = await import(W + 'formation.js'); const T = await import(W + 'tuning.js'); T.setRates('instructor');
const M = await import(W + 'manoeuvres.js');
const DEG = Math.PI / 180;
async function run(ships, form, key, dir, side = 'left') {
  const f = F.createFormation({ ships, wingSide: side }); for (let i = 0; i < 40; i++) f.step();
  f.change(form); let n = 0; while (f.state.current && n < 20000) { f.step(); n++; }
  for (let i = 0; i < 100; i++) f.step();
  const ac = f.state.aircraft; const L0 = ac[0];
  const r0 = ac.map((a) => ({ ...M.relativeTo(L0, a), up: a.altAboveFt - L0.altAboveFt }));
  if (f.press(key, dir) !== 'started') return `${ships}-ship ${form} ${key} ${dir}: refused ${f.state.refusal}`;
  let t = 0; const w = {};
  while (f.state.current && t < 8000) {
    f.step(); t++;
    const L = f.state.aircraft[0]; const phi = L.bankDeg * DEG;
    f.state.aircraft.slice(1).forEach((a, i) => {
      const r = r0[i + 1]; const q = M.relativeTo(L, a); const up = a.altAboveFt - L.altAboveFt;
      const s = { fwd: r.fwd, left: r.left * Math.cos(phi) + r.up * Math.sin(phi), up: -r.left * Math.sin(phi) + r.up * Math.cos(phi) };
      const d = Math.hypot(q.fwd - s.fwd, q.left - s.left, up - s.up);
      const o = (w[a.id] ??= { d: 0, t: 0, db: 0, gmin: 9, gmax: 0, kmin: 999, kmax: 0, late: 0 });
      if (d > o.d) { o.d = d; o.t = t * 0.05; }
      if (d > 5) o.late = t * 0.05;
      o.db = Math.max(o.db, Math.abs(a.bankDeg - L.bankDeg)); o.gmin = Math.min(o.gmin, a.g ?? 1); o.gmax = Math.max(o.gmax, a.g ?? 1);
      o.kmin = Math.min(o.kmin, a.kias); o.kmax = Math.max(o.kmax, a.kias);
    });
  }
  return `${ships}-ship ${form.padEnd(7)} ${key.padEnd(9)} ${dir > 0 ? 'L' : 'R'}: ` + Object.entries(w).map(([k, o]) => `#${k} worst ${o.d.toFixed(0)} ft @${o.t.toFixed(1)}s, >5ft until ${o.late.toFixed(1)}s, bank off ${o.db.toFixed(0)}°, G ${o.gmin.toFixed(2)}-${o.gmax.toFixed(2)}, ${o.kmin.toFixed(0)}-${o.kmax.toFixed(0)} kt`).join(' | ') + ` (${(t * 0.05).toFixed(0)} s)`;
}
const cases = (process.env.CASES ?? 'full').split(',');
const list = cases.includes('quick') ? [[2, 'echelon', 'delayed90', 1], [2, 'echelon', 'delayed90', -1], [2, 'route', 'delayed90', -1], [2, 'route', 'delayed90', 1]] :
  [[2, 'echelon', 'delayed90', 1], [2, 'echelon', 'delayed90', -1], [2, 'echelon', 'check', -1], [2, 'echelon', 'hook', 1], [2, 'route', 'delayed90', 1], [2, 'route', 'delayed90', -1], [2, 'astern', 'delayed90', 1],
   [4, 'echelon', 'delayed90', -1], [4, 'echelon', 'delayed90', 1], [4, 'finger', 'delayed90', 1], [4, 'box', 'delayed90', -1], [4, 'trail', 'delayed90', 1], [4, 'route', 'delayed90', -1]];
for (const c of list) console.log(await run(...c));
