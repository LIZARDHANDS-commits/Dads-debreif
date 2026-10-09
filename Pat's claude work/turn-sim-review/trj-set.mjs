// TRJ set: the turning rejoin gauge (Patrick's grill, 8 Oct 2026, decisions G1-G9).
// A measuring tool beside fset.mjs, not a CI test: it flies each start headless and says PASS or FAIL per
// requirement in Patrick's words. Run from the repo root:   node "Pat's claude work/turn-sim-review/trj-set.mjs" .
// Optional: --trace <start-name> prints #2's path every 2 s for that start.
//
// What "the line" is here: a ray from Lead, 45 deg aft of his beam on the side #2 rejoins to (TURNING_REJOIN.lineDeg,
// SMM 12.24 paras 56-57; the green dashed line drawn on screen, TS-152), in Lead's horizontal frame, turning with him.
// Every pass mark below is Patrick's ruling from the 8 Oct grill unless marked "estimate".
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.');
const traceName = process.argv.includes('--trace') ? process.argv[process.argv.indexOf('--trace') + 1] : null;
const live = (f) => pathToFileURL(path.join(repo, 'src/modules/turn-sim/live', f)).href;
const { createFormation } = await import(live('formation.js'));
const { relativeTo } = await import(live('manoeuvres.js'));

const DEG = Math.PI / 180;
const STEP_LIMIT = 6000; // 300 s at 0.05 s steps: generous; the planner itself gives up at 5 min (estimate)

const MARK = {
  lineDeg: 45,          // the rejoin line, 45 deg aft of the beam (TURNING_REJOIN.lineDeg; SMM 12.24)
  onLineFt: 150,        // G2: on the X, within 150 ft of the line
  driftFtps: 10,        // G2: Lead fixed on the canopy, drifting across the line no faster than ~10 ft/s (Patrick 8 Oct 19:57)
  bankDeg: 10,          // G2: bank within ~10 deg of Lead's
  farStartFt: 2000,     // G1/G7: a start beyond ~2,000 ft is a "far" start
  establishByFt: 1500,  // G1: established by 1,500 ft from Lead
  rideFarSec: 15,       // G1: ride at least 15 s on the line before the window
  rideCloseSec: 5,      // G7: from a close start, ride at least 5 s
  windowFt: 250,        // G3/G4: the decision window starts 250 ft from Lead (TS-106/TS-110)
  windowKias: 210,      // G3: at or below 210 KIAS entering the window, ~10 kt closure (A-8432; Patrick 8 Oct 19:57)
  coneFt: 1000,         // G9: leave the line for the cone inside ~1,000 ft
  coneOverKt: 10,       // G9: at or below Lead + 10 kt at that point
  crossSixFt: 50,       // G4: past Lead's six onto the other side by more than this (estimate: a wingspan and a bit)
  ahead39Ft: 1000,      // G4: ahead of Lead's 3/9 line inside 1,000 ft
};

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Fly one TRJ press to the end and measure it. setup(f) returns the change options or a refusal string. */
function flyStart(name, makeFormation, pressTrj, target) {
  const f = makeFormation();
  const pre = pressTrj(f);
  if (typeof pre === 'string') return { name, target, refused: pre };
  // Wait for the TRJ change itself to be the one flown (a press may queue behind Lead's held turn).
  let guard = 0;
  while (!(f.state.current?.change?.rejoining) && guard++ < STEP_LIMIT) f.step();
  const c = f.state.current?.change;
  if (!c) return { name, target, refused: f.state.refusal || 'TRJ never started' };
  const s = c.side; // sign of #2's 'left' on the rejoining side (relativeTo: + left of Lead)
  const t0 = f.state.tSec;
  const note = `${f.state.current.label} | ${(f.state.current.note || '').slice(0, 120)}`;
  const uF = -Math.cos(MARK.lineDeg * DEG), uL = s * Math.sin(MARK.lineDeg * DEG);
  const m = {
    name, target, note, picked: c.chooser?.picked ?? '?', startR: null,
    estRun: null, bestRun: null, curRun: null,
    windowT: null, windowKias: null, coneKias: null, coneLeadKias: null,
    minR: Infinity, crossedSix: false, ahead39: false, sawRoute: false, routeSec: 0,
    overshoot: /overshoot/i.test(note), leadRolledOutAt: null, done: null, endKey: null, judged: null, trace: [],
    rideMinKias: null, rideMaxKias: null, maxOnLine: false, maxNotHtrj: false,
  };
  const isHtrj = !name.startsWith('FW-'); // every start but the fighting wing ones begins in line abreast (make() default; hot-* and echelon->LAB too), so it is an HTRJ entry
  let steps = 0;
  while (f.state.current && steps++ < STEP_LIMIT) {
    f.step();
    if (!f.state.current) break;
    const [L, W] = f.state.aircraft;
    const rel = relativeTo(L, W);
    const r = Math.hypot(rel.fwd, rel.left);
    const t = f.state.tSec - t0;
    if (m.startR == null) m.startR = r;
    const along = rel.fwd * uF + rel.left * uL;
    const cross = -rel.fwd * uL + rel.left * uF;
    const driftFtps = m.prevCross == null ? 0 : Math.abs(cross - m.prevCross) / 0.05;
    const closureFtps = m.prevR == null ? 0 : (m.prevR - r) / 0.05;
    m.prevCross = cross; m.prevR = r;
    const dBank = Math.abs((W.bankDeg || 0) - (L.bankDeg || 0));
    // G2 (Patrick 8 Oct 19:57): the three SMM cues, held continuously: on the X, Lead fixed on the canopy (not drifting
    // across the line), bank about Lead's. No heading test: riding the line on Lead's inside needs a heading behind his.
    const est = Math.abs(cross) <= MARK.onLineFt && along > 0 && driftFtps <= MARK.driftFtps && dBank <= MARK.bankDeg && r > MARK.windowFt;
    if (est) {
      if (!m.curRun) m.curRun = { t0: t, r0: r, sec: 0 };
      m.curRun.sec += 0.05;
      if (!m.bestRun || m.curRun.sec > m.bestRun.sec) m.bestRun = { ...m.curRun };
      
      if (m.rideMinKias == null || W.kias < m.rideMinKias) m.rideMinKias = W.kias;
      if (m.rideMaxKias == null || W.kias > m.rideMaxKias) m.rideMaxKias = W.kias;
      if ((W.power?.throttle ?? 0) >= 0.99) m.maxOnLine = true;
    } else m.curRun = null;
    if (!isHtrj && (W.power?.throttle ?? 0) >= 0.99) m.maxNotHtrj = true;
    
    if (r < m.minR) m.minR = r;
    if (s * rel.left < -MARK.crossSixFt && r < 3000) m.crossedSix = true;
    if (rel.fwd > 0 && r < MARK.ahead39Ft) m.ahead39 = true;
    if (m.windowT == null && r <= MARK.windowFt) {
      m.windowT = t; m.windowKias = W.kias; m.windowClosureKt = closureFtps * 0.5925;
      m.estRun = m.curRun ? { ...m.curRun } : m.lastRunBeforeWindow ?? null;
    }
    if (m.windowT == null && m.curRun) m.lastRunBeforeWindow = { ...m.curRun };
    if (m.coneKias == null && r <= MARK.coneFt) { m.coneKias = W.kias; m.coneLeadKias = L.kias; m.coneRun = m.curRun ? { ...m.curRun } : m.lastRunBeforeWindow ?? null; }
    const where = f.where();
    if (where.key === 'route') { m.sawRoute = true; m.routeSec += 0.05; }
    if (m.leadRolledOutAt == null && Math.abs(L.bankDeg || 0) < 3 && t > 5) m.leadRolledOutAt = t;
    if (/overshoot/i.test(f.state.current?.note || '')) m.overshoot = true;
    if (traceName === name && steps % 40 === 0) {
      const dHdg = Math.abs((W.hdgDeg || 0) - (L.hdgDeg || 0));
      m.trace.push(`t=${t.toFixed(1).padStart(5)} r=${r.toFixed(0).padStart(5)} along=${along.toFixed(0).padStart(6)} cross=${cross.toFixed(0).padStart(6)} dHdg=${dHdg.toFixed(0).padStart(3)} Lbank=${(L.bankDeg || 0).toFixed(0).padStart(4)} Wbank=${(W.bankDeg || 0).toFixed(0).padStart(4)} Lkias=${L.kias.toFixed(0)} Wkias=${W.kias.toFixed(0).padStart(4)} ${W.power?.stage ?? ''}${est ? '  ON LINE' : ''}`);
    }
  }
  m.done = f.state.current ? null : f.state.tSec - t0;
  m.endKey = f.where().key;
  m.judged = f.state.judged?.labels?.join(' ') ?? '';
  if (m.windowT == null) m.lastRunBeforeWindow = m.lastRunBeforeWindow ?? m.bestRun;
  return m;
}

/** Score one measured start against G1-G9; returns the list of failures in plain words. */
function score(m) {
  if (m.refused) return [`refused: ${m.refused}`];
  const fails = [];
  const far = m.startR > MARK.farStartFt;
  const run = m.target === 'fw' ? (m.coneRun ?? m.bestRun) : (m.estRun ?? m.lastRunBeforeWindow ?? m.bestRun);
  if (!run) fails.push('never established on the line (G1/G2)');
  else if (far) {
    // Patrick 8 Oct 21:22 "Accept for now": at the 200 KIAS floor, line abreast starts can't drop back in Lead's frame, so
    // they join about 500-1,000 ft back (physics, not tuning). The join range stays in the facts line; G1's 1,500 ft and 15 s
    // are not failed until he revisits it. The ride must still last the close-start minimum.
    if (run.sec < MARK.rideCloseSec) fails.push(`rode the line ${run.sec.toFixed(1)} s, not ${MARK.rideCloseSec} s (G1 as accepted 21:22)`);
  } else if (run.sec < MARK.rideCloseSec) fails.push(`rode the line ${run.sec.toFixed(1)} s, not ${MARK.rideCloseSec} s (G7)`);
  
  if (m.rideMinKias != null && m.rideMinKias < 205) fails.push(`ride KIAS dropped to ${m.rideMinKias.toFixed(0)}, outside 210 \xB15`);
  if (m.rideMaxKias != null && m.rideMaxKias > 215) fails.push(`ride KIAS peaked at ${m.rideMaxKias.toFixed(0)}, outside 210 \xB15`);
  if (m.maxOnLine) fails.push('power MAX while established on the line (Patrick 8 Oct 20:16)');
  if (m.maxNotHtrj) fails.push('power MAX at some point on a non-HTRJ start (Patrick 8 Oct 20:16)');
  if (m.windowClosureKt != null && m.windowClosureKt > 20) fails.push(`window entry closure ${m.windowClosureKt.toFixed(0)} kt, not <= 20 kt (TURNING_REJOIN.stableKt)`);
  
  if (m.target !== 'fw') {
    if (m.windowKias == null) fails.push('never reached the decision window (G3)');
    else if (m.windowKias > MARK.windowKias + 0.5) fails.push(`${m.windowKias.toFixed(0)} KIAS entering the window, not <= ${MARK.windowKias} (G3)`);
    if (!m.sawRoute) fails.push('never went through route (G4)');
  } else if (m.coneKias != null && m.coneKias > m.coneLeadKias + MARK.coneOverKt + 0.5) fails.push(`${(m.coneKias - m.coneLeadKias).toFixed(0)} kt over Lead at the cone, not <= ${MARK.coneOverKt} (G9)`);
  if (m.crossedSix) fails.push("crossed behind Lead's six to the other side (G4)");
  if (m.ahead39) fails.push("ahead of Lead's 3/9 line inside 1,000 ft (G4)");
  if (m.overshoot) fails.push('overshoot procedure flown (G4)');
  if (m.done == null) fails.push('not finished inside 300 s (G5)');
  else if (m.endKey !== m.target) fails.push(`ended in ${m.endKey}, not ${m.target} (G5)`);
  return fails;
}

const make = (opts = {}) => () => createFormation({ ships: 2, ...opts });
const trj = (to, extra = {}) => (f) => { const how = f.change(to, { rejoin: 'into', side: 'keep', ...extra }); return how === 'refused' ? (f.state.refusal || 'refused') : null; };
const settle = (f) => { for (let i = 0; i < STEP_LIMIT && f.state.current; i++) f.step(); };

const STARTS = [
  ['LAB-5000-right->echelon', make({ spacingFt: 5000, wingSide: 'right' }), trj('echelon'), 'echelon'],
  ['LAB-5000-left->echelon', make({ spacingFt: 5000, wingSide: 'left' }), trj('echelon'), 'echelon'],
  ['LAB-4000->echelon', make({ spacingFt: 4000 }), trj('echelon'), 'echelon'],
  ['LAB-6000->echelon', make({ spacingFt: 6000 }), trj('echelon'), 'echelon'],
  ['FW-levelturn->echelon', make(), (f) => {
    f.change('fw', {}); settle(f);
    const p = f.pressFw('levelTurn', 1); if (p === 'refused') return `level turn refused: ${f.state.refusal}`;
    for (let i = 0; i < 200; i++) f.step(); // 10 s into Lead's turn, as in Patrick's screenshot
    return trj('echelon')(f);
  }, 'echelon'],
  ['hot-fast20->echelon', make({ errSpeed: 'fast', errSpeedKias: 20 }), trj('echelon'), 'echelon'],
  ['hot-ahead500-high2000->echelon', make({ spacingFt: 4000, errFore: 'ahead', errForeFt: 500, errHeight: 'high', errHeightFt: 2000 }), trj('echelon'), 'echelon'],
  ['LAB-5000->fw', make({ spacingFt: 5000 }), trj('fw'), 'fw'],
  ['LAB-5000->echelon-TRJ+roll', make({ spacingFt: 5000 }), trj('echelon', { rejoin: 'roll' }), 'echelon'],
  ['echelon->LAB->echelon', make(), (f) => { f.change('echelon', { rejoin: 'into' }); settle(f); f.change('lab', {}); settle(f); return trj('echelon')(f); }, 'echelon'],
];

console.log(`TRJ set (gauge for Patrick's G1-G9, 8 Oct 2026) on ${repo}`);
let pass = 0;
for (const [name, mk, press, target] of STARTS) {
  let m;
  try { m = flyStart(name, mk, press, target); } catch (e) { m = { name, target, refused: `threw: ${e.message}` }; }
  const fails = score(m);
  if (!fails.length) pass++;
  const run = m.refused ? null : (target === 'fw' ? (m.coneRun ?? m.bestRun) : (m.estRun ?? m.lastRunBeforeWindow ?? m.bestRun));
  const facts = m.refused ? '' : `start ${m.startR?.toFixed(0)} ft | on line from ${run ? run.r0.toFixed(0) + ' ft for ' + run.sec.toFixed(1) + ' s' : '-'} | ride KIAS ${m.rideMinKias?.toFixed(0) ?? '-'}-${m.rideMaxKias?.toFixed(0) ?? '-'} | window ${m.windowKias?.toFixed(0) ?? '-'} KIAS, closing ${m.windowClosureKt?.toFixed(0) ?? '-'} kt | route ${m.routeSec.toFixed(1)} s | min ${m.minR.toFixed(0)} ft | end ${m.endKey} ${m.done?.toFixed(1) ?? '-'} s | Lead wings level at ${m.leadRolledOutAt?.toFixed(1) ?? '-'} s | flown: ${m.picked}`;
  console.log(`\n${fails.length ? 'FAIL' : 'PASS'}  ${name}\n      ${facts}${fails.map((x) => `\n      - ${x}`).join('')}`);
  if (m.trace?.length) console.log(m.trace.join('\n'));
}
console.log(`\n${pass} of ${STARTS.length} starts pass.`);
