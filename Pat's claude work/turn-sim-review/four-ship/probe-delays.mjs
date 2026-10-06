// Scratch arithmetic for design.md (offset box delays), repo flight code read-only. Not repo code.
const R = '/home/user/Dads-debreif/src/modules/turn-sim/live/';
const { makeAircraft } = await import(R + 'flight.js');
const M = await import(R + 'manoeuvres.js');
const { iasToTasKt } = await import('/home/user/Dads-debreif/src/core/t6-performance.js');
const { dryRun, turnSeg, wholeDegree, unit, dot, relativeTo, exactWaitSec, TURN_BANK_DEG, DEG } = M;
const kias = 220, alt = 8000, v = iasToTasKt(kias, alt) * 1.68781;
const mk = (id, fwd, left) => makeAircraft({ id, xFt: fwd, yFt: left, headingRad: 0, kias, tasFtps: v });
const fly = (ac, segs, wait) => { const plan = { segments: [...(wait > 0 ? [{ kind: 'hold', untilSec: wait }] : []), ...segs] }; const r = dryRun({ ...ac }, plan, 0); return { p: r.end, t: r.durationSec }; };
function solve(label, deg, dir, S, T, together = false) {
  // #2 on the left (+y). Lead at origin. #3 at the slot (midpoint), left of Lead by S/2, T behind.
  const L = mk(1, 0, 0), W = mk(2, 0, S), r3 = mk(3, -T, S / 2);
  const h1 = wholeDegree(dir * deg * DEG); const turn = [turnSeg(h1, dir, TURN_BANK_DEG)];
  const u0 = unit(0), u1 = unit(dryRun(L, { segments: turn }, 0).end.headingRad);
  const outsideIsWing = Math.sign(S) !== dir;
  const first = outsideIsWing ? W : L, second = outsideIsWing ? L : W;
  const w2 = together ? 0 : exactWaitSec({ x: second.xFt - first.xFt, y: second.yFt - first.yFt }, u0, u1, v);
  const fL = fly(L, turn, outsideIsWing ? w2 : 0), fW = fly(W, turn, outsideIsWing ? 0 : w2);
  const leadWait = outsideIsWing ? w2 : 0;
  let best = null;
  for (let tau = 0; tau < 90; tau += 0.05) {
    const f3 = fly(r3, turn, leadWait + tau); const tc = Math.max(f3.t, fL.t);
    const pl = { x: fL.p.xFt + v * (tc - fL.t) * u1.x, y: fL.p.yFt + v * (tc - fL.t) * u1.y };
    const d = { x: f3.p.xFt + v * (tc - f3.t) * u1.x - pl.x, y: f3.p.yFt + v * (tc - f3.t) * u1.y - pl.y };
    const fwd = dot(d, u1), lat = -d.x * u1.y + d.y * u1.x;
    const err = Math.abs(fwd + T); if (!best || err < best.err) best = { tau, err, fwd, lat };
  }
  // the pair at the same time
  console.log(label.padEnd(16), `S ${S} T ${T}: front-pair wait ${w2.toFixed(1)} s (${outsideIsWing ? '#2' : 'Lead'} first); #3 waits ${best.tau.toFixed(1)} s after Lead starts its own turn (${(best.tau + leadWait).toFixed(1)} s after the first turn); #3 ends ${(-best.fwd).toFixed(0)} ft behind Lead, ${best.lat.toFixed(0)} ft left of Lead (slot wants ${(dir * S / 2).toFixed(0)}, sides swapped)`);
}
for (const [S, T] of [[6000, 7000], [5000, 7000], [4000, 6000], [4000, 8000], [6000, 8000]]) solve('delayed 90 R', 90, -1, S, T);
solve('delayed 90 L', 90, 1, 6000, 7000);
solve('delayed 45 R', 45, -1, 6000, 7000);
solve('delayed 45 L', 45, 1, 6000, 7000);
solve('hook R', 180, -1, 6000, 7000, true);
solve('in place 90 R', 90, -1, 6000, 7000, true);
