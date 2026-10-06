const L = process.argv[2] + '/src/modules/turn-sim/live';
const F = await import(L + '/formation.js');
const f = F.createFormation({ ships: 2 });
const seq = [['echelon', {}], ['route', {}], ['echelon', {}], ['fw', {}], ['lab', {}], ['echelon', {}], ['lab', { side: 'left' }]];
for (const [to, o] of seq) {
  f.change(to, o);
  const segs = f.state.current?.plan?.plans?.[2]?.segments?.map(s => s.kind + (s.poses ? s.poses.length : s.points?.length ?? '')).join(',');
  const rows = []; let n = 0;
  while ((f.state.current || f.state.queued) && n++ < 40000) { f.step(); const w = f.state.aircraft[1]; rows.push([f.state.tSec, w.bankDeg, w.kias, w.power ? (w.power.stage ?? '') + ':' + (w.power.throttle ?? 0).toFixed(2) : 'none', w.altAboveFt - f.state.aircraft[0].altAboveFt]); }
  let worst = { j: 0 }, worstR = { r: 0 };
  for (let i = 2; i < rows.length; i++) {
    const a1 = (rows[i][2] - rows[i-1][2]) / 0.05, a0 = (rows[i-1][2] - rows[i-2][2]) / 0.05; const j = Math.abs(a1 - a0) / 0.05;
    if (j > worst.j) worst = { j, i };
    const r1 = (rows[i][1] - rows[i-1][1]) / 0.05, r0 = (rows[i-1][1] - rows[i-2][1]) / 0.05; const rr = Math.abs(r1 - r0) / 0.05;
    if (rr > worstR.r) worstR = { r: rr, i };
  }
  let pw = 0, thr = 0, at = []; for (let i = 1; i < rows.length; i++) { const [s1, t1] = rows[i][3].split(':'), [s0, t0] = rows[i-1][3].split(':'); if (s1 !== s0) { pw++; at.push(i + s0 + '>' + s1); } const d = Math.abs(+t1 - +t0); if (d > thr) thr = d; }
  console.log(to, segs, 'steps', rows.length, 'maxJerk kt/s2', worst.j.toFixed(0), '@', worst.i, 'maxRollAccel dps2', worstR.r.toFixed(0), '@', worstR.i, 'stageChanges', pw, at.slice(0,6).join(' '), 'maxThrottleStep', thr.toFixed(2));
}
