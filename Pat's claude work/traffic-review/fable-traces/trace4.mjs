import { flyPfl, pflGeometry } from './pfl-debug.js';
const CALM={windFromDeg:360,windKt:0}, W15={windFromDeg:269,windKt:15};
const geo = pflGeometry(360,0);
const which=process.argv[2];
let f;
if (which==='H2') f = flyPfl({ x:2300, y:-6450, alt:4600, kias:140, headingDeg:118, bankDeg:0 }, CALM);
if (which==='G6') f = flyPfl({ ...geo.at(180), alt:4300, kias:120, headingDeg:118, bankDeg:0 }, CALM);
if (which==='F2') f = flyPfl({ x:-9395, y:-10008, alt:3500, kias:220, headingDeg:118, bankDeg:0 }, W15);
if (f) console.log(which, f.plan, f.outcome, f.notes.join(' | '), f.touchdown ? `td ${Math.round(f.touchdown.alongFt)} along` : '', f.eject ? `eject alt ${Math.round(f.eject.alt)}` : '');
if (which==='C') { f = flyPfl({ x:6148, y:-8688, alt:3500, kias:120, headingDeg:118, bankDeg:0 }, CALM); console.log('C', f.plan, f.outcome, f.notes.join(' | '), f.touchdown ? `td ${Math.round(f.touchdown.alongFt)} along` : ''); const pl=f.planLog[0].plan.path; console.log('first plan', f.planLog[0].plan.label, pl.slice(0,8).map(p=>`(${Math.round(p.x)},${Math.round(p.y)} th=${p.theta===undefined?'-':Math.round(p.theta)} plan=${p.plan})`).join(' ')); }
