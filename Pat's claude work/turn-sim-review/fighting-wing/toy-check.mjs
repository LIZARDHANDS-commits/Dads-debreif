// Toy check for the fighting wing design (design.md, section 6). NOT repo code and NOT the real app:
// a scratch script that imports the repo's core read-only (point-mass step, T-6A thrust and drag,
// easeRoll, dampedClimbG) and flies one Lead (scripted) and one wingman (the pursuit controller of
// design.md section 5) through three Lead manoeuvres, to see whether the design holds the cone and
// stays smooth. Every controller number below is an ESTIMATE (marked), to be tuned in the real build.
//
// Run:  node toy-check.mjs        (writes toy-*.svg and toy-results.json beside it)
import { writeFileSync } from 'node:fs';
import { stepPointMass, pointMassState } from '/home/user/Dads-debreif/src/core/point-mass.js';
import { iasToTasKt, tasToIasKt, thrustPerWeight, dragPerWeight, shakerG } from '/home/user/Dads-debreif/src/core/t6-performance.js';
import { easeRoll, dampedClimbG } from '/home/user/Dads-debreif/src/core/flight-math.js';
import { KT_TO_FTPS, G_FTPS2 } from '/home/user/Dads-debreif/src/core/units.js';

const DT = 0.05; // the Turn Sim step (flight.js STEP_SEC)
const D = Math.PI / 180;
const here = new URL('.', import.meta.url).pathname;

// ---- small vector helpers (toy only) ----
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const len = (a) => Math.sqrt(dot(a, a));
const unit = (a) => mul(a, 1 / Math.max(len(a), 1e-9));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const ZHAT = { x: 0, y: 0, z: 1 };
const pos = (pm) => ({ x: pm.x, y: pm.y, z: pm.z });
const vel = (pm) => ({ x: pm.vx, y: pm.vy, z: pm.vz });

/** Up square to the flight path, carried through the vertical (same idea as point-mass.js upFrom). */
function stableUp(vHat, prev) {
  const c = vHat.z;
  let u = { x: -c * vHat.x, y: -c * vHat.y, z: 1 - c * vHat.z };
  let m = len(u);
  if (m < 1e-6) { const p = dot(prev, vHat); u = sub(prev, mul(vHat, p)); m = len(u); }
  u = mul(u, 1 / m);
  return dot(u, prev) < 0 ? mul(u, -1) : u;
}

// ---- the aircraft: point mass + the smoothing chain (design.md 5.4) ----
const ROLL = { maxRateDps: 90, maxAccelDps2: 360 };      // Patrick 4 Oct 08:54Z and card 09:54Z (TS-37)
const GLIM = { maxRateDps: 4, maxAccelDps2: 16 };        // G onset: ESTIMATE (4 G/s, easing in at 16 G/s^2), numbers are G/s and G/s^2 in easeRoll's field names
const excessFor = (thr) => (ktas, altFt, g) => {
  const kias = tasToIasKt(ktas, altFt);
  return thr * thrustPerWeight(kias, altFt) - dragPerWeight(kias, altFt, g);
};
function makeAircraft({ x, y, z, kias, headingRad }) {
  const ktas = iasToTasKt(kias, z);
  const pm = pointMassState({ x, y, altFt: z, ktas, headingRad });
  return { pm, bankDeg: 0, rollRate: 0, g: 1, gRate: 0, thr: 0.5, cmdBank: 0, cmdG: 1, cmdThr: 0.5 };
}
const kiasOf = (a) => tasToIasKt(len(vel(a.pm)) / KT_TO_FTPS, a.pm.z);
/** Throttle that holds level flight at kias (so a straight Lead needs no speed trim). */
function levelThrottle(a) { const k = kiasOf(a); return clamp(dragPerWeight(k, a.pm.z, 1) / thrustPerWeight(k, a.pm.z), 0.05, 1); }

/**
 * Flies one step. command = { bankDeg (target, already unwrapped), g, thr }.
 * Roll through easeRoll (roll rate and its onset both limited), G through easeRoll as well (G rate and
 * its onset limited), throttle first-order (engine/prop lag 1.5 s: ESTIMATE). The G the jet can give is
 * capped by the shaker line (physical), never by a published limit.
 */
function fly(a, command) {
  const r = easeRoll(a.bankDeg, a.rollRate, command.bankDeg, DT, ROLL);
  a.bankDeg = r.bankDeg; a.rollRate = r.rollRateDps;
  const k = kiasOf(a);
  const gCap = shakerG(k);
  const gTarget = clamp(command.g, 0.0, gCap);
  const gPrev = a.g;
  const q = easeRoll(a.g, a.gRate, gTarget, DT, GLIM);
  a.g = q.bankDeg; a.gRate = q.rollRateDps;
  a.gDot = (a.g - gPrev) / DT;
  a.thr += (clamp(command.thr, 0.05, 1) - a.thr) * (DT / 1.5);
  const before = a.pm;
  a.pm = stepPointMass(a.pm, { g: a.g, bankRad: a.bankDeg * D }, DT, excessFor(a.thr));
  a.accel = mul(sub(vel(a.pm), vel(before)), 1 / DT);
}

// ---- Lead's scripts (design.md 4): open-loop command programmes ----
function leadProgramme(kind, z0) {
  const s = { phase: 0, t0: 0, turned: 0, pitched: 0, prevV: null };
  const levelG = (a, gammaT, bankRad) => {
    const v = len(vel(a.pm));
    const gamma = Math.asin(a.pm.vz / v);
    return Math.max(0.7, dampedClimbG(gamma, gammaT, v, 0.7) / Math.max(Math.cos(bankRad), 0.3)); // Lead keeps positive G (2 CFFTS Orders B2 ch 8 p.98); 0.7 is an ESTIMATE of 'positive'
  };
  const holdLevelGamma = (a) => clamp((z0 - a.pm.z) * 0.0005, -0.05, 0.05);
  return (a, t) => {
    const v = vel(a.pm); const sp = len(v);
    if (s.prevV) { const dv = unit(v); const du = unit(s.prevV); s.turned += Math.atan2(cross(du, dv).z, dot(du, dv)); s.pitched += Math.acos(clamp(dot(du, dv), -1, 1)); }
    s.prevV = v;
    const heading = Math.atan2(v.y, v.x);
    const gamma = Math.asin(v.z / sp);
    const lvl = (bankDeg) => ({ bankDeg, g: levelG(a, holdLevelGamma(a), bankDeg * D), thr: 1 });
    const straight = () => ({ bankDeg: 0, g: levelG(a, holdLevelGamma(a), 0), thr: clamp(levelThrottle(a) + 0.01 * (220 - tasToIasKt(sp / KT_TO_FTPS, a.pm.z)), 0.05, 1) });
    if (kind === 'level180') {            // Exercise 1: 60/2 level turn, PCL max (AFM7 p.17); here 180 degrees, away from the wingman
      if (t < 15) return straight();
      if (s.phase === 0) { s.phase = 1; s.turned = 0; }
      const bank = 60; const rate = (G_FTPS2 * Math.tan(bank * D)) / sp; // rad/s
      if (s.phase === 1) { if (Math.abs(s.turned) >= Math.PI - rate * (bank / 150)) s.phase = 2; return lvl(-bank * Math.sign(1)); }
      return straight();
    }
    if (kind === 'reversal') {            // turn 90 one way at 60 degrees, then straight through to 90 the other way
      if (t < 15) return straight();
      if (s.phase === 0) { s.phase = 1; s.turned = 0; }
      const bank = 60; const rate = (G_FTPS2 * Math.tan(bank * D)) / sp;
      if (s.phase === 1) { if (Math.abs(s.turned) >= Math.PI / 2 - rate * (bank / 150)) { s.phase = 2; s.turned = 0; } return lvl(bank); }
      if (s.phase === 2) { if (Math.abs(s.turned) >= Math.PI - rate * (bank / 150)) s.phase = 3; return lvl(-bank); }
      return straight();
    }
    if (kind === 'climbdescend') {        // climbing left turn (45 degrees bank, +15 degrees), then a descending right reversal (60 degrees, -10 degrees)
      if (t < 15) return straight();
      if (t < 35) return { bankDeg: 45, g: levelG(a, 15 * D, 45 * D), thr: 1 };
      if (t < 55) return { bankDeg: -60, g: levelG(a, -10 * D, 60 * D), thr: 0.6 };
      return straight();
    }
    if (kind === 'loop') {                // loop: pull by pitch angle through 360 degrees, then level (SMM 16.17 para 42; entry at least 200 KIAS EFIG p.433)
      if (t < 15) return straight();
      if (s.phase === 0) { s.phase = 1; s.pitched = 0; }
      if (s.phase === 1) {
        if (s.pitched >= 2 * Math.PI - 0.25) s.phase = 2;
        const u = s.pitched / Math.PI; // 0 at the bottom, 1 at the top
        return { bankDeg: 0, g: 4.0 - 2.0 * smooth(u * 1.2) + (u > 1 ? 0.6 * (u - 1) : 0), thr: 1 };
      }
      return { bankDeg: 0, g: 1, thr: levelThrottle(a) };
    }
    return straight();
  };
}

// ---- the wingman controller (design.md 5) ----
const CTRL = {
  mode: 'FW',                 // 'FW' (wingman has power) or 'FM' (same power as Lead: throttle copied)
  rangeFt: 650,               // ESTIMATE inside 500-1000 ft ("near end", AFM7 p.14; SMM 12.29 para 69)
  sweepDeg: 45,               // middle of 30-60 (SMM 12.29 para 69, Fig 12.19)
  collapsedSweepDeg: 10,      // ESTIMATE: toward lead's six o'clock when Lead turns hard (AFM7 p.14)
  stackFt: 0,                 // level (estimate; no number in the manuals for fighting wing)
  tauPos: 5.0,                // ESTIMATE s: position error closed over about 5 s
  maxCatchUpFtps: 90,         // ESTIMATE: about 55 KTAS of catch-up at most
  tauHead: 1.0,               // ESTIMATE s: velocity direction corrected over about 1 s
  reactSec: 0.3,              // ESTIMATE s: pilot reaction, a first-order lag on the commands
  gCeiling: 5.0,              // SMM 16.17 para 44a (a published limit: flagged, the pilot aims to stay under it)
};
function makeController() { return { side: 1, prevSlot: null, prevFL: null, uS: { x: 0, y: 0, z: 1 }, fBank: 0, fG: 1, fThr: 0.5, slotAA: CTRL.sweepDeg }; }

function controlWing(ctl, lead, wing) {
  const PL = pos(lead.pm), VL = vel(lead.pm), PW = pos(wing.pm), VW = vel(wing.pm);
  const fL = unit(VL);
  ctl.uS = stableUp(fL, ctl.uS);
  const rS = cross(fL, ctl.uS);
  // Lead's turn rate (angular velocity of its velocity vector), by finite difference
  const omegaL = ctl.prevFL ? mul(cross(ctl.prevFL, fL), 1 / DT) : { x: 0, y: 0, z: 0 };
  ctl.prevFL = fL;
  // Where to sit: sweep collapses toward the six as Lead banks harder (gentle <= 30 keeps side and sweep, steep >= 60 collapses: AFM7 p.14; the 30/60 are ESTIMATES)
  const leadBank = Math.abs(lead.bankDeg);
  const c = smooth((leadBank - 30) / 30);
  const wantAA = (CTRL.mode === 'FM' ? Math.min(CTRL.sweepDeg, 20) : CTRL.sweepDeg) * (1 - c) + CTRL.collapsedSweepDeg * c;
  ctl.slotAA += (wantAA - ctl.slotAA) * (DT / 2.0);  // the slot itself moves smoothly (2 s: ESTIMATE)
  // Side: keep the side the wingman is on; change only when Lead is steady and the wingman is clearly on the other side
  const lat = dot(sub(PW, PL), rS);
  if (c < 0.1 && Math.abs(lat) > 300) ctl.side = Math.sign(lat);
  const rangeNow = len(sub(PW, PL));
  const vc = ctl.prevRange === undefined ? 0 : -(rangeNow - ctl.prevRange) / DT; ctl.prevRange = rangeNow;
  let R = CTRL.rangeFt;
  // bubble guard (SMM 16.17 para 44c): sit back a little when closing near the 500 ft bubble. A smooth push, never a switch (a switch made the slot jump and the wingman chatter)
  const wantPush = 250 * smooth((vc / KT_TO_FTPS - 5) / 25) * smooth((R + 150 - rangeNow) / 150);
  ctl.push = (ctl.push ?? 0) + (wantPush - (ctl.push ?? 0)) * (DT / 1.0);
  R += ctl.push;
  const aa = ctl.slotAA * D;
  // the slot's sideways offset is smoothed, so a change of side crosses behind Lead gradually instead of jumping
  ctl.latSlot = ctl.latSlot === undefined ? ctl.side * R * Math.sin(aa) : ctl.latSlot + (ctl.side * R * Math.sin(aa) - ctl.latSlot) * (DT / 2.0);
  const slot = add(add(add(PL, mul(fL, -R * Math.cos(aa))), mul(rS, ctl.latSlot)), mul(ctl.uS, CTRL.stackFt));
  const vSlot = ctl.prevSlot ? mul(sub(slot, ctl.prevSlot), 1 / DT) : VL;
  ctl.prevSlot = slot;
  // Desired velocity: slot velocity plus a catch-up toward the slot
  const e = sub(slot, PW);
  let catchUp = mul(e, 1 / CTRL.tauPos);
  const cl = len(catchUp); if (cl > CTRL.maxCatchUpFtps) catchUp = mul(catchUp, CTRL.maxCatchUpFtps / cl);
  const vDes = add(vSlot, catchUp);
  const spW = len(VW), fW = unit(VW);
  // Turn the velocity toward the desired direction; plus Lead's own turn rate ("do what lead did", EFIG p.391)
  const dDes = unit(vDes);
  const axis = cross(fW, dDes); const sinA = len(axis); const ang = Math.atan2(sinA, dot(fW, dDes));
  const omegaCorr = sinA > 1e-9 ? mul(axis, (ang / CTRL.tauHead) / sinA) : { x: 0, y: 0, z: 0 };
  const omega = add(omegaL, omegaCorr);
  const aPerp = cross(omega, VW);                                  // ft/s^2, square to the flight path
  const zPerp = sub(ZHAT, mul(fW, dot(ZHAT, fW)));
  const liftVec = add(mul(aPerp, 1 / G_FTPS2), zPerp);             // lift must also hold the weight's share square to the path
  let gCmd = len(liftVec);
  const liftDir = unit(liftVec);
  gCmd = Math.min(gCmd, CTRL.gCeiling);
  const upW = wing.pm.up; const rightW = cross(fW, upW);
  let bankCmd = gCmd > 0.15 ? Math.atan2(dot(liftDir, rightW), dot(liftDir, upW)) / D : wing.bankDeg;
  let dBank = wrap((bankCmd - wing.bankDeg) * D) / D;
  if (Math.abs(dBank) > 150) dBank = Math.abs(dBank) * (ctl.rollDir || 1);   // about 180 off: keep rolling the way already chosen, no flip-flop
  else if (Math.abs(wing.rollRate) > 5) ctl.rollDir = Math.sign(wing.rollRate);
  // little lift needed (under about 0.6 G): the direction hardly matters, so the pilot rolls toward wings level, never the long way round
  const wLift = smooth((gCmd - 0.2) / 0.5);
  dBank = wLift * dBank + (1 - wLift) * (wrap((0 - wing.bankDeg) * D) / D);
  bankCmd = wing.bankDeg + dBank;   // shortest way round, unwrapped for easeRoll
  // Throttle: FM copies Lead's; FW trims speed (and so closure) with power
  const thrFW = clamp(levelThrottle(wing) + 0.012 * ((dot(vDes, fW) - spW) / KT_TO_FTPS), 0.05, 1);
  const thrCmd = CTRL.mode === 'FM' ? lead.thr : thrFW;
  // Pilot reaction lag
  const k = DT / CTRL.reactSec;
  ctl.fBank += (bankCmd - ctl.fBank) * k; ctl.fG += (gCmd - ctl.fG) * k; ctl.fThr += (thrCmd - ctl.fThr) * k;
  if (globalThis.DEBUG && wing.t > 80 && wing.t < 92 && Math.round(wing.t / DT) % 10 === 0) console.log(wing.t.toFixed(1), 'side', ctl.side, 'lat', lat.toFixed(0), 'latSlot', ctl.latSlot.toFixed(0), 'aa', ctl.slotAA.toFixed(0), 'e', [e.x, e.y, e.z].map((v) => v.toFixed(0)).join(','), 'gCmd', gCmd.toFixed(2), 'bankCmd', bankCmd.toFixed(0), 'bank', wing.bankDeg.toFixed(0), 'wLift', wLift.toFixed(2));
  return { bankDeg: ctl.fBank, g: ctl.fG, thr: ctl.fThr, slot, c, vc, gWanted: gCmd };
}

// ---- measurements ----
function geometry(lead, wing) {
  const rel = sub(pos(wing.pm), pos(lead.pm)); const R = len(rel);
  const fL = unit(vel(lead.pm)), fW = unit(vel(wing.pm));
  const aa = Math.acos(clamp(dot(mul(fL, -1), rel) / R, -1, 1)) / D;                 // angle off Lead's tail, 3-D
  const lateral = dot(rel, unit(cross(fL, stableUp(fL, lead.pm.up))));
  const hca = Math.acos(clamp(dot(fL, fW), -1, 1)) / D;
  return { R, aa, hca, lateral, vert: rel.z, back: -dot(rel, fL) };
}

function run({ name, label, kind, mode, wingStart, seconds, nograph, kias = 220 }) {
  CTRL.mode = mode;
  const z0 = 8000;
  const lead = makeAircraft({ x: 0, y: 0, z: z0, kias, headingRad: Math.PI / 2 });
  lead.thr = levelThrottle(lead);
  const wing = makeAircraft({ x: wingStart.x, y: wingStart.y, z: z0 + (wingStart.z ?? 0), kias, headingRad: Math.PI / 2 });
  wing.thr = lead.thr;
  const ctl = makeController(); ctl.fThr = wing.thr; ctl.side = wingStart.x > 0 ? 1 : -1;
  const prog = leadProgramme(kind, z0);
  const rows = []; let t = 0;
  let maxG = { lead: 0, wing: 0 }, maxGDot = { lead: 0, wing: 0 }, maxRoll = { lead: 0, wing: 0 }, maxRollAcc = { lead: 0, wing: 0 };
  let prevRoll = { lead: 0, wing: 0 };
  while (t < seconds) {
    const cl = prog(lead, t);
    const cw = controlWing(ctl, lead, wing);
    fly(lead, { bankDeg: lead.bankDeg + wrap((cl.bankDeg - lead.bankDeg) * D) / D, g: cl.g, thr: cl.thr });
    fly(wing, cw);
    t += DT; wing.t = t;
    const gm = geometry(lead, wing);
    for (const [k, a] of [['lead', lead], ['wing', wing]]) {
      maxG[k] = Math.max(maxG[k], a.g); maxGDot[k] = Math.max(maxGDot[k], Math.abs(a.gDot ?? 0));
      maxRoll[k] = Math.max(maxRoll[k], Math.abs(a.rollRate));
      maxRollAcc[k] = Math.max(maxRollAcc[k], Math.abs(a.rollRate - prevRoll[k]) / DT); prevRoll[k] = a.rollRate;
    }
    rows.push({ t, ...gm, vc: cw.vc / KT_TO_FTPS, leadBank: lead.bankDeg, wingBank: wing.bankDeg, leadG: lead.g, wingG: wing.g,
      leadKias: kiasOf(lead), wingKias: kiasOf(wing), leadAlt: lead.pm.z, wingAlt: wing.pm.z, leadThr: lead.thr, wingThr: wing.thr,
      lx: lead.pm.x, ly: lead.pm.y, wx: wing.pm.x, wy: wing.pm.y, slot: cw.c });
  }
  // judging after settling in (the first 15 s are the approach to the cone and Lead's straight leg)
  const judged = rows.filter((r) => r.t > 12);
  const inRange = (r) => r.R >= 500 && r.R <= 1000;
  const frac = (f) => judged.filter(f).length / judged.length;
  const res = {
    name, label, mode, seconds,
    percentTime: {
      rangeIn500to1000: +(100 * frac(inRange)).toFixed(0),
      rangeAbove500: +(100 * frac((r) => r.R >= 500)).toFixed(0),
      offTail60OrLess_and_range: +(100 * frac((r) => inRange(r) && r.aa <= 60)).toFixed(0),
      offTail30OrLess_and_range: +(100 * frac((r) => inRange(r) && r.aa <= 30)).toFixed(0),
    },
    minRangeFt: +Math.min(...judged.map((r) => r.R)).toFixed(0),
    maxRangeFt: +Math.max(...judged.map((r) => r.R)).toFixed(0),
    maxOffTailDeg: +Math.max(...judged.map((r) => r.aa)).toFixed(0),
    maxHcaDeg: +Math.max(...judged.map((r) => r.hca)).toFixed(0),
    leadPeakG: +maxG.lead.toFixed(2), wingPeakG: +maxG.wing.toFixed(2),
    leadMaxGRate: +maxGDot.lead.toFixed(1), wingMaxGRate: +maxGDot.wing.toFixed(1),
    leadMaxRollRate: +maxRoll.lead.toFixed(0), wingMaxRollRate: +maxRoll.wing.toFixed(0),
    wingMaxRollAccel: +maxRollAcc.wing.toFixed(0),
    minKias: { lead: +Math.min(...rows.map((r) => r.leadKias)).toFixed(0), wing: +Math.min(...rows.map((r) => r.wingKias)).toFixed(0) },
    endKias: { lead: +rows.at(-1).leadKias.toFixed(0), wing: +rows.at(-1).wingKias.toFixed(0) },
    endRange: +rows.at(-1).R.toFixed(0), endOffTail: +rows.at(-1).aa.toFixed(0),
  };
  if (!nograph) writeFileSync(`${here}toy-${name}.svg`, chart(rows, label, res));
  return res;
}

// ---- charts (plain SVG, no packages) ----
function chart(rows, title, res) {
  const W = 1180, H = 860; const cols = { lead: '#1c5fa8', wing: '#d1561a', band: '#d9e6d2', grid: '#d9dde3', ink: '#1f2430', mute: '#697080' };
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="12"><rect width="${W}" height="${H}" fill="#fff"/>`;
  svg += `<text x="20" y="26" font-size="17" font-weight="600" fill="${cols.ink}">${title}</text>`;
  svg += `<text x="20" y="46" fill="${cols.mute}">Toy check (scratch script, repo core imported read-only). Lead blue, wingman orange. Controller numbers are estimates. Peak G Lead ${res.leadPeakG}, wing ${res.wingPeakG}; max G rate Lead ${res.leadMaxGRate}, wing ${res.wingMaxGRate} G/s; max roll rate wing ${res.wingMaxRollRate} deg/s.</text>`;
  const t1 = rows.at(-1).t;
  const panel = (x, y, w, h, ttl, series, opt = {}) => {
    const all = series.flatMap((s) => s.v);
    let lo = opt.lo ?? Math.min(...all), hi = opt.hi ?? Math.max(...all); if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.06; if (opt.lo === undefined) lo -= pad; if (opt.hi === undefined) hi += pad;
    const X = (t) => x + (t / t1) * w, Y = (v) => y + h - ((v - lo) / (hi - lo)) * h;
    let s = `<text x="${x}" y="${y - 6}" font-weight="600" fill="${cols.ink}">${ttl}</text><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${cols.grid}"/>`;
    if (opt.band) s += `<rect x="${x}" y="${Y(opt.band[1])}" width="${w}" height="${Y(opt.band[0]) - Y(opt.band[1])}" fill="${cols.band}" opacity="0.7"/>`;
    for (let i = 0; i <= 4; i++) { const v = lo + ((hi - lo) * i) / 4; s += `<text x="${x - 5}" y="${Y(v) + 4}" text-anchor="end" fill="${cols.mute}">${v.toFixed(Math.abs(hi - lo) < 10 ? 1 : 0)}</text>`; }
    for (let i = 0; i <= 4; i++) { const t = (t1 * i) / 4; s += `<text x="${X(t)}" y="${y + h + 14}" text-anchor="middle" fill="${cols.mute}">${t.toFixed(0)} s</text>`; }
    for (const se of series) s += `<polyline fill="none" stroke="${se.c}" stroke-width="1.8" points="${rows.map((r, i) => `${X(r.t).toFixed(1)},${Y(se.v[i]).toFixed(1)}`).join(' ')}"/>`;
    return s;
  };
  const col = (f) => rows.map(f);
  svg += panel(70, 80, 500, 150, 'Range, Lead to wingman (ft); green band 500 to 1,000 ft', [{ c: cols.wing, v: col((r) => r.R) }], { band: [500, 1000], lo: 0 });
  svg += panel(650, 80, 500, 150, 'Angle off Lead’s tail (deg); green band 30 to 60 (sweep)', [{ c: cols.wing, v: col((r) => r.aa) }], { band: [30, 60], lo: 0, hi: 120 });
  svg += panel(70, 290, 500, 150, 'Bank (deg)', [{ c: cols.lead, v: col((r) => r.leadBank) }, { c: cols.wing, v: col((r) => r.wingBank) }]);
  svg += panel(650, 290, 500, 150, 'G', [{ c: cols.lead, v: col((r) => r.leadG) }, { c: cols.wing, v: col((r) => r.wingG) }]);
  svg += panel(70, 500, 500, 150, 'Indicated airspeed (KIAS)', [{ c: cols.lead, v: col((r) => r.leadKias) }, { c: cols.wing, v: col((r) => r.wingKias) }]);
  svg += panel(650, 500, 500, 150, 'Height (ft MSL)', [{ c: cols.lead, v: col((r) => r.leadAlt) }, { c: cols.wing, v: col((r) => r.wingAlt) }]);
  // ground tracks
  const xs = rows.flatMap((r) => [r.lx, r.wx]), ys = rows.flatMap((r) => [r.ly, r.wy]);
  const gx0 = Math.min(...xs), gx1 = Math.max(...xs), gy0 = Math.min(...ys), gy1 = Math.max(...ys);
  const bx = 70, by = 710, bw = 500, bh = 120; const sc = Math.min(bw / Math.max(gx1 - gx0, 1), bh / Math.max(gy1 - gy0, 1));
  const GX = (x) => bx + (x - gx0) * sc, GY = (y) => by + bh - (y - gy0) * sc;
  svg += `<text x="${bx}" y="${by - 6}" font-weight="600" fill="${cols.ink}">Ground tracks (north up, scale ${(1 / sc).toFixed(0)} ft per pixel)</text><rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="none" stroke="${cols.grid}"/>`;
  svg += `<polyline fill="none" stroke="${cols.lead}" stroke-width="1.6" points="${rows.map((r) => `${GX(r.lx).toFixed(1)},${GY(r.ly).toFixed(1)}`).join(' ')}"/>`;
  svg += `<polyline fill="none" stroke="${cols.wing}" stroke-width="1.6" points="${rows.map((r) => `${GX(r.wx).toFixed(1)},${GY(r.wy).toFixed(1)}`).join(' ')}"/>`;
  svg += panel(650, 710, 500, 120, 'Closure (kt, positive = closing) and HCA/10', [{ c: cols.wing, v: col((r) => r.vc) }, { c: '#7a8a3a', v: col((r) => r.hca / 10) }]);
  return svg + '</svg>';
}

// ---- the runs ----
globalThis.DEBUG = process.env.DEBUG === '1';
const results = [];
const start = { x: 1100, y: -900 };       // 1,420 ft out on the right and behind: stretched, to see it settle in
results.push(run({ name: 'a-level180-away', label: 'A. Fighting wing, Lead 60/2 level turn 180 deg to the left, wingman on the right (turn is away: wingman is on the outside)', kind: 'level180', mode: 'FW', wingStart: start, seconds: 90 }));
// the same turn the other way (into the wingman): flip Lead's bank sign by starting the wingman on the left
results.push(run({ name: 'b-level180-into', label: 'B. Fighting wing, Lead 60/2 level turn 180 deg to the left, wingman on the LEFT (turn is toward the wingman: inside)', kind: 'level180', mode: 'FW', wingStart: { x: -1100, y: -900 }, seconds: 90 }));
results.push(run({ name: 'c-reversal', label: 'C. Fighting wing, Lead reversal (90 right, then 180 left, at 60 deg bank)', kind: 'reversal', mode: 'FW', wingStart: start, seconds: 100 }));
results.push(run({ name: 'd-climb-descend', label: 'D. Fighting wing, Lead climbing left turn then descending right reversal (3-D)', kind: 'climbdescend', mode: 'FW', wingStart: start, seconds: 90 }));
results.push(run({ name: 'e-fm-level', label: 'E. Fluid manoeuvring (same power as Lead), 60/2 level turn left, wingman on the right', kind: 'level180', mode: 'FM', wingStart: start, seconds: 90 }));
// A loop was tried and left out: the scripted loop was poor (Lead ended in a dive) and the wingman fell far behind. The vertical plane is NOT shown to work by this toy.
writeFileSync(`${here}toy-results.json`, JSON.stringify(results, null, 1));
for (const r of results) console.log(JSON.stringify(r));
