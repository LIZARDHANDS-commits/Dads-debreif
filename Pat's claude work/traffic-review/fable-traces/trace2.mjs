import { flyPfl, pflGeometry, PFL, glideFootprint, obviouslyShort } from '/home/user/Dads-debreif/src/modules/traffic/pfl.js';
import { setFieldTemperature } from '/home/user/Dads-debreif/src/modules/traffic/weather.js';
import { THRESHOLD_29L, DEPARTURE_END_29L } from '/home/user/Dads-debreif/src/modules/traffic/airfield.js';
import { legOffsetsFt } from '/home/user/Dads-debreif/src/core/geo.js';
import { zoomT6A } from '/home/user/Dads-debreif/src/core/t6-performance.js';
const FT_NM = 6076.12, DEG = Math.PI/180;
const TH = THRESHOLD_29L, DEP = DEPARTURE_END_29L;
const L = Math.hypot(DEP.x-TH.x, DEP.y-TH.y); const u = {x:(DEP.x-TH.x)/L, y:(DEP.y-TH.y)/L}; const left = {x:-u.y, y:u.x}; // left of runway heading?
const RWY = 298.6; const CALM={windFromDeg:360, windKt:0};
function run(name, start, wind, options={}, tempC=null){
  setFieldTemperature(tempC);
  const f = flyPfl(start, wind, options); const pts=f.points;
  const ev=[]; let lastDec=null,lastCfg=null,lastTag=null, minK=1e9, maxBank=0;
  for (const p of pts){ if(p.decision!==lastDec){ev.push(`  alt ${Math.round(p.alt)} kt ${Math.round(p.kt)} ${p.config}: "${p.decision}"`); lastDec=p.decision;} if(p.config!==lastCfg){ev.push(`  alt ${Math.round(p.alt)}: config -> ${p.config}`); lastCfg=p.config;} if(p.tag!==lastTag&&p.tag){ev.push(`  alt ${Math.round(p.alt)} kt ${Math.round(p.kt)}: KEY ${p.tag}`); lastTag=p.tag;} minK=Math.min(minK,p.kt); if (p.bank!==undefined) maxBank=Math.max(maxBank,Math.abs(p.bank)); }
  let apex=pts[0]; for(const p of pts) if(p.alt>apex.alt) apex=p;
  const last=pts[pts.length-1]; const o=legOffsetsFt(TH,DEP,last);
  console.log(`\n=== ${name} === wind ${wind.windFromDeg}/${wind.windKt}${tempC!==null?` temp ${tempC}C`:''}`);
  console.log(`  start alt ${start.alt} kias ${start.kias} hdg ${start.headingDeg} bank ${start.bankDeg??0}; along ${Math.round(legOffsetsFt(TH,DEP,start).alongFt)} cross ${Math.round(legOffsetsFt(TH,DEP,start).crossFt)}`);
  console.log(`  plan ${f.plan} outcome ${f.outcome} apex ${Math.round(apex.alt)} (gain ${Math.round(apex.alt-start.alt)})`);
  if (f.gate) console.log(`  gate: ok=${f.gate.ok} off ${f.gate.offDeg.toFixed(0)} kias ${f.gate.kias.toFixed(0)} flags [${f.gate.flags}]`);
  if (f.touchdown) console.log(`  touchdown ${Math.round(f.touchdown.alongFt)} along, ${Math.round(f.touchdown.kias)} KIAS, cross ${Math.round(o.crossFt)}`);
  if (f.eject) console.log(`  eject alt ${Math.round(f.eject.alt)} at along ${Math.round(o.alongFt)} cross ${Math.round(o.crossFt)}`);
  console.log(`  min KIAS ${minK.toFixed(0)} max |bank| ${maxBank.toFixed(0)} notes: ${f.notes.join(' | ')}`); console.log(ev.join('\n'));
  return f;
}
const which = process.argv[2];
if (which==='hk'){
  for (const a of [5000, 5001, 5200]) run(`HK practice at ${a}`, {x:TH.x,y:TH.y,alt:a,kias:120,headingDeg:RWY,bankDeg:0}, CALM, {practice:true});
  run('HK practice 5000 in 269/15', {x:TH.x,y:TH.y,alt:5000,kias:120,headingDeg:RWY,bankDeg:0}, {windFromDeg:269,windKt:15}, {practice:true});
}
if (which==='final'){
  // start in final turn: offset left (south) of centreline, short of threshold
  const pos=(alongFt, crossFt)=>({x:TH.x+u.x*alongFt+left.x*crossFt, y:TH.y+u.y*alongFt+left.y*crossFt});
  console.log('left vector', left, 'check perch cross', legOffsetsFt(TH,DEP,{x:6148,y:-8688}));
  run('FT1 final turn hdg 230, 2300 ft, 1200 ft left of centreline, 2500 short', {...pos(-2500, 1200), alt:2300, kias:120, headingDeg:230, bankDeg:-45}, CALM);
  run('FT2 final turn hdg 240, 2200 ft, 800 ft left, 1800 short', {...pos(-1800, 800), alt:2200, kias:115, headingDeg:240, bankDeg:-45}, CALM);
  run('FT3 final turn hdg 220, 2400 ft, 1500 ft left, 3000 short', {...pos(-3000, 1500), alt:2400, kias:120, headingDeg:220, bankDeg:-45}, CALM);
  run('FT4 final turn hdg 250, 2150 ft, 600 ft right(!) of centreline, 1500 short', {...pos(-1500, -600), alt:2150, kias:115, headingDeg:250, bankDeg:-45}, CALM);
}
if (which==='misc'){
  console.log('zoomT6A 220->125 at 3500:', zoomT6A?.(220,125,3500));
  // footprint check for I3: 2 NM out on final 2500 ft
  const s={x:TH.x-u.x*2*FT_NM*-1, y:0}; 
  const start={x:TH.x+ -u.x*(-2*FT_NM), y:TH.y + -u.y*(-2*FT_NM)};
}
