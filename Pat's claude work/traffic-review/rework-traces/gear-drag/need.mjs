import { neededFt, pflGeometry } from '/home/user/Dads-debreif/src/modules/traffic/pfl_dbg.js';
import { THRESHOLD_DATA_ELEV_FT } from '/home/user/Dads-debreif/src/modules/traffic/airfield.js';
const geo = pflGeometry(360, 0); const wind={windFromDeg:360,windKt:0};
// rebuild arcToAim via a High Key start path from flyPfl is internal; approximate: sample the circle
const pts=[]; for(let th=0;th<360;th+=5){const p=geo.at(th); pts.push({x:p.x,y:p.y,theta:th,plan: th>=270?3: th>=180?2: th>=0?1:0, key: th===180?'low_key':th===270?'final_key':th===0?'high_key':undefined});}
pts.push({x:geo.th.x,y:geo.th.y,theta:360,plan:3,key:'threshold'}); const a=geo.along(geo.aimAlongFt); pts.push({x:a.x,y:a.y,plan:3,key:'aim'});
const idx=k=>pts.findIndex(p=>p.key===k);
for (const [k,alt] of [['high_key',5000],['low_key',3700],['final_key',3000]]) { const i=idx(k); console.log(k, 'needs', Math.round(neededFt(pts,i,pts[i],alt,pts[i].plan,wind)), 'AGL avail', alt-THRESHOLD_DATA_ELEV_FT); }
console.log('r ft', Math.round(geo.r), 'aimAlong', Math.round(geo.aimAlongFt));
