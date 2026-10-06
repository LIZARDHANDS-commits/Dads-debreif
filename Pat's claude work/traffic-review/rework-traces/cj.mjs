import { chooseJoin, pflGeometry } from '/home/user/Dads-debreif/src/modules/traffic/pfl.js';
const geo = pflGeometry(360,0);
const [x,y,alt,trk,bank] = process.argv.slice(2).map(Number);
const j = chooseJoin(geo, {x,y}, alt, trk, {windFromDeg:360,windKt:0}, { bankDeg: bank||0 });
console.log(j.kind, j.label, j.theta, 'high', j.high, 'turn', j.path.turnDeg, 'straight', j.path.straightFt, 'r', j.path.turnRadiusFt);
console.log(j.path.slice(0,6).map(p=>`(${Math.round(p.x)},${Math.round(p.y)}${p.theta!==undefined?' th'+p.theta:''}${p.arc?' arc':''})`).join(' '));
