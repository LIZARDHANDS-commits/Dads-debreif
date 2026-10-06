const L = process.argv[2] + '/src/modules/turn-sim/live';
const F = await import(L + '/formation.js');
const LR = await import(L + '/lag-roll.js');
const FL = await import(L + '/fluid-lead.js');
const M = await import(L + '/manoeuvres.js');
const f = F.createFormation({ ships: 2 });
const settle = () => { let n = 0; while ((f.state.current || f.state.queued) && n++ < 40000) f.step(); };
for (const p of [['echelon', {}], ['fw', {}]]) { f.change(p[0], p[1]); settle(); }
const [lead, wing] = f.state.aircraft.map(a => ({ ...a }));
const plan = LR.planLagRoll([lead, wing], {});
const lr = plan.lagRoll; const poses = plan.plans[wing.id].segments[0].poses;
const dt = 0.05, vL = lead.tasFtps, h0 = lead.headingRad, blockFt = 8000;
const rel = (t, x, y, z) => { const lx = lead.xFt + vL * t * Math.cos(h0), ly = lead.yFt + vL * t * Math.sin(h0); return M.relativeTo({ xFt: lx, yFt: ly, headingRad: h0, altAboveFt: lead.altAboveFt }, { xFt: x, yFt: y }); };
// planned: the roll only (after set-up), noses from the poses
const i0 = Math.round(lr.setUpSec / dt), i1 = Math.round((lr.setUpSec + lr.rollSec) / dt);
const nose = (p) => { const hz = Math.sqrt(Math.max(0, p.tas ** 2 - p.climb ** 2)); return { x: hz * Math.cos(p.h) / p.tas, y: hz * Math.sin(p.h) / p.tas, z: p.climb / p.tas }; };
const seg = poses.slice(i0 - 1, i1);
const N = (u) => { const k = Math.min(seg.length - 1, Math.max(0, u * (seg.length - 1))); const a = Math.floor(k), b = Math.min(seg.length - 1, a + 1), w = k - a; const na = nose(seg[a]), nb = nose(seg[b]); const v = { x: na.x + (nb.x - na.x) * w, y: na.y + (nb.y - na.y) * w, z: na.z + (nb.z - na.z) * w }; const l = Math.hypot(v.x, v.y, v.z); return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const pStart = seg[0], pEnd = seg[seg.length - 1];
let minP = Infinity; for (const p of seg) minP = Math.min(minP, p.kias);
const rEnd = rel(i1 * dt, pEnd.x, pEnd.y);
console.log('PLANNED roll', lr.rollSec, 's, slowest', Math.round(minP), 'KIAS, end', Math.round(pEnd.kias), 'KIAS, end rel fwd', Math.round(rEnd.fwd), 'left', Math.round(rEnd.left), 'up', Math.round(pEnd.alt - lead.altAboveFt), 'maxG', lr.maxG.toFixed(2));
// point mass from the roll's start state, along the same nose path
const w0 = { ...wing, xFt: pStart.x, yFt: pStart.y, altAboveFt: pStart.alt, headingRad: pStart.h, tasFtps: pStart.tas, kias: pStart.kias, climbFtps: pStart.climb, bankDeg: 0, rollRateDps: 0, g: 1 };
for (const gWant of [lr.maxG, lr.maxG + 0.5, 3.0]) {
  let st = FL.leadStateOf(w0, blockFt); const path = FL.nosePath(N, 1, 4000); const mem = { s: 0, rate: 0 };
  let minK = Infinity, t = (i0 - 1) * dt, n = 0, end = false, maxG = 0;
  while (!end && n++ < 2000) { const r = FL.followNose(st, path, mem, gWant); st = FL.stepLead(st, { g: r.g, bank: r.bank }); t += dt; minK = Math.min(minK, st.kias); maxG = Math.max(maxG, st.g); end = r.end; }
  const re = rel(t, st.pm.x, st.pm.y);
  console.log('POINT MASS gWant', gWant.toFixed(1), 'roll', ((n) * dt).toFixed(1), 's, slowest', Math.round(minK), 'KIAS, end', Math.round(st.kias), 'KIAS, end rel fwd', Math.round(re.fwd), 'left', Math.round(re.left), 'up', Math.round(st.pm.z - blockFt - lead.altAboveFt), 'maxG', maxG.toFixed(2));
}
