import { glideDragPerWeight, glideRatio } from '/home/user/Dads-debreif/src/core/t6-performance.js';
import { iasToTasKt } from '/home/user/Dads-debreif/src/core/t6-performance.js';
const g=32.174, kt=1.68781;
function orbit(cfg, kias, bankDeg, alt0, scale=1){ // scale multiplies the config's extra parasite
  const n=1/Math.cos(bankDeg*Math.PI/180); let alt=alt0, ang=0, dt=0.1;
  const base=glideDragPerWeight('clean',kias,alt0,n), cfgD=glideDragPerWeight(cfg,kias,alt0,n);
  while(ang<2*Math.PI){ const v=iasToTasKt(kias,alt)*kt; const r=v*v/(g*Math.tan(bankDeg*Math.PI/180));
    const dw=glideDragPerWeight('clean',kias,alt,n)+scale*(glideDragPerWeight(cfg,kias,alt,n)-glideDragPerWeight('clean',kias,alt,n));
    alt-=v*dw*dt; ang+=v/r*dt; }
  return alt0-alt; }
console.log('clean 125', orbit('clean',125,30,5000).toFixed(0));
console.log('gear 120', orbit('gearDown',120,30,5000).toFixed(0));
for (const s of [1.5,1.8,2.0,2.1,2.2]) console.log('gear x',s, orbit('gearDown',120,30,5000,s).toFixed(0));
let lo=2,hi=3.5; for(let i=0;i<40;i++){const m=(lo+hi)/2; (orbit('gearDown',120,30,5000,m)<2600?lo=m:hi=m);}
const k=(12.15224/glideRatio('gearDown'))**2, kNew=1+(k-1)*lo; const ratio=12.15224/Math.sqrt(kNew);
console.log('scale',lo.toFixed(2),'ratio',ratio.toFixed(2),'NM/1000',(ratio*1000/6076.12).toFixed(3));
