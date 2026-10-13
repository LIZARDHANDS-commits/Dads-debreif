const base = 'file:///C:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif-formation/src/modules/turn-sim/live/';
const M = await import(base + 'formation.js');
const DT = 0.05;
for (const firstDir of [1, -1]) {
  const f = M.createFormation({ ships: 4, fwWing: 'live' });
  f.change('fw'); for (let i = 0; i < 9000 && f.state.current; i++) f.step();
  const startWhere = JSON.stringify(f.where());
  const seq = [['levelTurn', firstDir, 25], ['reversal', 0, 25], ['wingsLevel', 0, 30]];
  const st = {}; const ids = f.state.aircraft.map((a) => a.name);
  ids.forEach((n) => (st[n] = { satHi: 0, satLo: 0, n: 0, minAhead: 1e9, bankFlips: 0, prevRoll: 0, sideFlips: 0, prevSide: 0, maxRoll: 0 }));
  const log = [];
  for (const [k, d, sec] of seq) {
    const r = f.pressFw(k, d || 1); log.push(`${k}${d ? (d > 0 ? ' L' : ' R') : ''}: ${r}${f.state.refusal ? ' (' + f.state.refusal + ')' : ''}`);
    for (let i = 0; i < sec / DT; i++) {
      f.step(); const ac = f.state.aircraft; const L = ac[0];
      ac.forEach((a, j) => { if (j === 0) return; const q = st[a.name]; const ahead = ac[j - 1];
        q.n++; if (a.g >= 3.45) q.satHi++; if (a.g <= 0.55) q.satLo++;
        q.minAhead = Math.min(q.minAhead, Math.hypot(a.xFt - ahead.xFt, a.yFt - ahead.yFt, a.altAboveFt - ahead.altAboveFt));
        const rr = a.rollRateDps; if (Math.sign(rr) !== Math.sign(q.prevRoll) && Math.abs(rr) > 10 && Math.abs(q.prevRoll) > 10) q.bankFlips++; if (Math.abs(rr) > 10) q.prevRoll = rr; q.maxRoll = Math.max(q.maxRoll, Math.abs(rr));
        const hx = Math.cos(L.headingRad), hy = Math.sin(L.headingRad); const left = -(a.xFt - L.xFt) * hy + (a.yFt - L.yFt) * hx; const side = Math.sign(left);
        if (q.prevSide && side !== q.prevSide && Math.abs(left) > 50) q.sideFlips++; if (Math.abs(left) > 50) q.prevSide = side; });
    }
  }
  console.log(`\n### 4-ship FW live, first turn ${firstDir > 0 ? 'left' : 'right'} (start ${startWhere}) -> end ${JSON.stringify(f.where())}`);
  console.log('  ' + log.join(' | '));
  for (const n of ids.slice(1)) { const q = st[n]; console.log(`  ${n}: at 3.5 G cap ${(100 * q.satHi / q.n).toFixed(0)}% | at 0.5 G floor ${(100 * q.satLo / q.n).toFixed(0)}% | min to one ahead ${q.minAhead.toFixed(0)} ft | roll-direction changes ${q.bankFlips} | sides of Lead's track changed ${q.sideFlips} | max roll ${q.maxRoll.toFixed(0)}°/s`); }
}
