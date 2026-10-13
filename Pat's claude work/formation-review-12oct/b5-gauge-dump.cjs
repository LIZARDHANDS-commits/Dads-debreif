const fs=require('fs'); const [file,t0,t1]=[process.argv[2],+process.argv[3]||0,+process.argv[4]||30];
const tr=JSON.parse(fs.readFileSync(file)); const n=Object.keys(tr.aircraft); const L=tr.aircraft[n[0]], W=tr.aircraft[n[1]];
const f=(a,i,d=0)=>a&&a[i]!=null?(typeof a[i]==='number'?a[i].toFixed(d):a[i]):'-';
for(let i=0;i<W.t.length;i+=10){ if(W.t[i]<t0)continue; if(W.t[i]>t1)break;
 console.log(`${f(W.t,i,1)} ${f(W.job,i)} ${f(W.aim,i)} sl ${f(W.slantFt,i)} pr ${f(W.predFt,i)} cl ${f(W.closureFtps,i)} cw ${f(W.cWantFtps,i)} off ${f(W.offFt,i)} hca ${f(W.hcaDeg,i)} asp ${f(W.aspectDeg,i)} bk ${f(W.bank,i)} Lbk ${f(L.bank,i)} g ${f(W.g,i,1)} dh ${f(W.heightFt,i)} tg ${f(W.heightTargetFt,i)} kt ${f(W.kias,i)} Lkt ${f(L.kias,i)} tq ${f(W.fwTorquePct,i)}`);}
