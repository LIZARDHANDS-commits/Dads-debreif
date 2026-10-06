import { flyPfl } from '/home/user/Dads-debreif/src/modules/traffic/pfl.js';
import { THRESHOLD_29L as TH, DEPARTURE_END_29L as DEP } from '/home/user/Dads-debreif/src/modules/traffic/airfield.js';
import { legOffsetsFt } from '/home/user/Dads-debreif/src/core/geo.js';
const L = Math.hypot(DEP.x-TH.x, DEP.y-TH.y); const u = { x:(DEP.x-TH.x)/L, y:(DEP.y-TH.y)/L }; const nl = { x:-u.y, y:u.x };
// along, cross (negative = circuit side, as legOffsetsFt reports it)
const at = (along, cross) => { const o = legOffsetsFt(TH, DEP, { x: TH.x + nl.x*1000, y: TH.y + nl.y*1000 }); const sgn = Math.sign(o.crossFt); return { x: TH.x + u.x*along + nl.x*cross*sgn, y: TH.y + u.y*along + nl.y*cross*sgn }; };
const CALM={windFromDeg:360,windKt:0}, W={windFromDeg:269,windKt:15};
const S = [
 ['FTa base 2,600', at(-4000,-3000), 2600, 28, 0],
 ['FTb mid final turn 420 AGL', at(-2500,-1200), 2300, 340, -45],
 ['FTc late final turn', at(-2000,-400), 2150, 315, -45],
 ['FTd final turn 600 AGL', at(-3000,-1800), 2480, 355, -40],
 ['FTe too low far', at(-6000,-1500), 2150, 340, -30],
];
for (const w of [CALM, W]) for (const [name, p, alt, hdg, bank] of S) {
  const f = flyPfl({ ...p, alt, kias:120, headingDeg:hdg, bankDeg:bank }, w);
  let minK = 999; for (const q of f.points) minK = Math.min(minK, q.kt);
  const gearAt = f.points.find(q => q.config !== 'Clean');
  console.log(`${name} wind ${w.windKt}: ${f.outcome} ${f.touchdown ? 'td '+Math.round(f.touchdown.alongFt)+' ft at '+Math.round(f.touchdown.kias) : ''}${f.eject ? 'eject '+Math.round(f.eject.alt) : ''} | gate ${f.gate ? (f.gate.ok?'ok':'MISSED')+' '+f.gate.offDeg.toFixed(0)+'° '+f.gate.flags.join(',') : '-'} | min ${minK.toFixed(0)} kt | gear ${gearAt ? Math.round(gearAt.alt) : 'never'} | ${f.notes.join('; ')} | last "${f.points[f.points.length-1].decision}" cfg ${f.points[f.points.length-1].config}`);
}
