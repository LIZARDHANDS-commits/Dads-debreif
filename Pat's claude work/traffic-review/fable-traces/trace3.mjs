import { flyPfl, pflGeometry } from '/home/user/Dads-debreif/src/modules/traffic/pfl.js';
import { THRESHOLD_29L, DEPARTURE_END_29L } from '/home/user/Dads-debreif/src/modules/traffic/airfield.js';
import { legOffsetsFt } from '/home/user/Dads-debreif/src/core/geo.js';
const TH=THRESHOLD_29L, DEP=DEPARTURE_END_29L, CALM={windFromDeg:360,windKt:0};
const geo = pflGeometry(360,0);
function show(name, start, wind, opt={}){
  const f = flyPfl(start, wind, opt);
  console.log(`\n=== ${name}: plan ${f.plan} outcome ${f.outcome} notes ${f.notes.join(' | ')}`);
  let prevSig=null; for (const e of f.planLog){ const sig=e.plan.kind+e.plan.label+e.plan.path.length+(e.plan.path.find(q=>q.theta!==undefined)?.theta); if(sig===prevSig) continue; prevSig=sig;
    const p = f.points[Math.min(e.at, f.points.length-1)];
    const path=e.plan.path;
    const thetas = path.filter(q=>q.theta!==undefined).map(q=>Math.round(q.theta));
    const keys = path.filter(q=>q.key).map(q=>q.key);
    // path length
    let len=0; for(let i=1;i<path.length;i++) len+=Math.hypot(path[i].x-path[i-1].x, path[i].y-path[i-1].y);
    const toAim = (()=>{ let l=0; for(let i=1;i<path.length;i++){ l+=Math.hypot(path[i].x-path[i-1].x, path[i].y-path[i-1].y); if(path[i].key==='aim') return l;} return l; })();
    console.log(`  at pt ${e.at} alt ${Math.round(p.alt)} ${p.config}: kind ${e.plan.kind} label "${e.plan.label}" pts ${path.length} first theta ${thetas[0]} last ${thetas[thetas.length-1]} keys [${keys.slice(0,6)}] len to aim ${Math.round(toAim)} ft; first plan idx ${path.slice(0,4).map(q=>q.plan)}`);
    // where does the first circle point sit relative to aircraft
    const q = path.find(q=>q.theta!==undefined);
    if (q) console.log(`     join point theta ${Math.round(q.theta)} at ${Math.round(Math.hypot(q.x-p.x,q.y-p.y))} ft from aircraft; aircraft along/cross ${Math.round(legOffsetsFt(TH,DEP,p).alongFt)}/${Math.round(legOffsetsFt(TH,DEP,p).crossFt)}`);
  }
  // sample the track every 40 points: alt, config, decision, heading, cross/along
  console.log('  track samples:');
  for (let i=0;i<f.points.length;i+=100){ const p=f.points[i]; const o=legOffsetsFt(TH,DEP,p); console.log(`   pt ${i} alt ${Math.round(p.alt)} kt ${Math.round(p.kt)} hdg ${Math.round(p.headingDeg)} ${p.config} "${p.decision}" along ${Math.round(o.alongFt)} cross ${Math.round(o.crossFt)}`); }
}
show('G6 Low Key start 4300', { ...geo.at(180), alt:4300, kias:120, headingDeg:118, bankDeg:0 }, CALM);
show('H2 inner downwind 4600/140', { x:2300, y:-6450, alt:4600, kias:140, headingDeg:118, bankDeg:0 }, CALM);
show('C perch 3500/120', { x:6148, y:-8688, alt:3500, kias:120, headingDeg:118, bankDeg:0 }, CALM);
