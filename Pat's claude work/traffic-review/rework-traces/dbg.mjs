import { flyPfl, pflGeometry } from '/home/user/Dads-debreif/src/modules/traffic/pfl.js';
import { setFieldTemperature } from '/home/user/Dads-debreif/src/modules/traffic/weather.js';
import { THRESHOLD_29L as TH, DEPARTURE_END_29L as DEP } from '/home/user/Dads-debreif/src/modules/traffic/airfield.js';
import { legOffsetsFt } from '/home/user/Dads-debreif/src/core/geo.js';
const geo = pflGeometry(360,0);
const CALM={windFromDeg:360,windKt:0};
const S = {
  H2: [{ x:2300, y:-6450, alt:4600, kias:140, headingDeg:118, bankDeg:0 }, CALM],
  G6: [{ ...geo.at(180), alt:4300, kias:120, headingDeg:118, bankDeg:0 }, CALM],
  C: [{ x:6148, y:-8688, alt:3500, kias:120, headingDeg:118, bankDeg:0 }, CALM],
  F: [{ x:-9395, y:-10008, alt:3500, kias:220, headingDeg:118, bankDeg:0 }, CALM],
  H: [{ x: 3*6076*Math.sin(2.094), y: 3*6076*Math.cos(2.094), alt:10000, kias:125, headingDeg:300, bankDeg:0 }, CALM],
};
const [name, every='50', temp] = process.argv.slice(2);
if (temp) setFieldTemperature(Number(temp));
const [st, w, opt] = S[name] ?? JSON.parse(name);
const f = flyPfl(st, w, opt ?? {});
console.log(name, f.plan, f.outcome, f.notes.join(' | '));
for (const e of f.planLog) { const p=f.points[Math.min(e.at,f.points.length-1)]; console.log(` plan@${e.at} alt ${Math.round(p.alt)} ${e.plan.kind} "${e.plan.label}" theta ${e.plan.theta ?? '-'} turn ${e.plan.path.turnDeg?.toFixed?.(0) ?? '-'}`); }
let lc=null, ld=null;
for (let i=0;i<f.points.length;i++){ const p=f.points[i]; const o=legOffsetsFt(TH,DEP,p);
  if (i % Number(every) === 0 || p.config!==lc || p.decision!==ld) console.log(`  ${i} alt ${Math.round(p.alt)} kt ${Math.round(p.kt)} hdg ${Math.round(p.headingDeg)} bank ${Math.round(p.bankDeg ?? p.bank ?? 0)} ${p.config} "${p.decision}" along ${Math.round(o.alongFt)} cross ${Math.round(o.crossFt)}`);
  lc=p.config; ld=p.decision; }
if (f.touchdown) console.log(' td', Math.round(f.touchdown.alongFt), Math.round(f.touchdown.kias)); if (f.eject) console.log(' eject', f.eject);
