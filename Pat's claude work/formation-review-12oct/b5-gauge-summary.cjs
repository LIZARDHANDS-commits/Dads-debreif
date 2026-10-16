const fs=require('fs'); const dir=process.argv[2]; const tags=process.argv.slice(3);
const cases=['b5-into-in-position','b5-away-in-position','b5-into-stretched','b5-away-stretched','b5-into-tight','b5-away-tight','b5-reversal','b5-outside-cone'];
const files=fs.readdirSync(dir);
for (const c of cases){ const row=[c.replace('b5-','')];
 for (const tag of tags){ const f=files.find(x=>x.startsWith(c)&&x.endsWith('.'+tag+'.json')); if(!f){row.push(tag+':-');continue;}
  const tr=JSON.parse(fs.readFileSync(dir+'/'+f)); const n=Object.keys(tr.aircraft); const L=tr.aircraft[n[0]], W=tr.aircraft[n[1]];
  const p2=(tr.presses[1]?.t)??1e9; const at=(t)=>{let i=W.t.findIndex(x=>x>=t-1e-6); return i<0?W.t.length-1:i;};
  let least=1e9, jobs=0, prev=null; for(let i=0;i<W.t.length&&W.t[i]<p2;i++){least=Math.min(least,W.slantFt[i]); if(W.job&&W.job[i]!==prev){if(prev!==null)jobs++;prev=W.job[i];}}
  const i1=at(p2), iE=W.t.length-1;
  row.push(`${tag}: least ${least.toFixed(0)} | end turn ${W.slantFt[i1].toFixed(0)}ft ${(W.kias[i1]-L.kias[i1]).toFixed(0)}kt | after WL ${W.slantFt[iE].toFixed(0)}ft ${(W.kias[iE]-L.kias[iE]).toFixed(0)}kt | jobsw ${jobs}`);}
 console.log(row.join('\n   '));}
