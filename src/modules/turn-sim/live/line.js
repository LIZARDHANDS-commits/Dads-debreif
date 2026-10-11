// The `line` kind (until refactor step 5 deletes it): the older rejoin line law the straight-ahead rejoin still flies
// (straight-rejoin.js) and the turning rejoin's hot-start capture (turning-rejoin.js). A heading down a fixed line in Lead's
// frame and a closure that slows to the decision point. Split out of tracker.js in refactor step 3 with no change.
import { wrapPi, DEG } from '../../../core/angles.js';
import { KT_TO_FTPS } from '../../../core/units.js';
import { STEP_SEC } from './flight.js';
import { relativeTo } from './manoeuvres.js';
import { TURNING_REJOIN, KIAS_OUTSIDE_LAB } from './tuning.js';
import { fixedLine, FW_BAND } from './slots.js';

/** The line's aim: down the line, across it more steeply the further off it #2 is (aimOf for a 'line' phase). */
export function lineAim(ph, L, Lprev, W) {
  const rel = relativeTo(L, W);
  const line = ph.line ?? fixedLine(ph.lineDeg ?? 45, ph.side ?? -1);
  const geo = line.at(rel);
  const along = geo.along;
  const cross = geo.cross;
  const approachDeg = ph.approachDeg ?? 45;
  const aimFt = ph.aimFt ?? 500;
  const chi = approachDeg * DEG * (2 / Math.PI) * Math.atan(Math.abs(cross) / aimFt);
  const wayFwd = -line.u.fwd * Math.cos(chi) - Math.sign(cross) * line.nrm.fwd * Math.sin(chi);
  const wayLeft = -line.u.left * Math.cos(chi) - Math.sign(cross) * line.nrm.left * Math.sin(chi);

  const f = { x: Math.cos(L.headingRad), y: Math.sin(L.headingRad) };
  const l = { x: -f.y, y: f.x };
  const dWorld = { x: wayFwd * f.x + wayLeft * l.x, y: wayFwd * f.y + wayLeft * l.y };
  const dAim = Math.max(150, Math.min(800, along));
  const px = W.xFt + dWorld.x * dAim;
  const py = W.yFt + dWorld.y * dAim;
  const omegaL = Lprev ? wrapPi(L.headingRad - Lprev.headingRad) / STEP_SEC : 0;
  const dx = L.xFt - W.xFt;
  const dy = L.yFt - W.yFt;
  const r = Math.hypot(dx, dy);
  const vfx = L.tasFtps * f.x + omegaL * dy;
  const vfy = L.tasFtps * f.y - omegaL * dx;
  const ex = px - W.xFt;
  const ey = py - W.yFt;
  const d = Math.hypot(ex, ey);
  const onLine = Math.abs(cross) <= (ph.captureFt ?? 150);
  const inCone = (ph.coneEase || ph.isFw)
    ? (r <= FW_BAND.easeFarFt && onLine && along <= FW_BAND.easeFarFt)
    : false;
  const reachedDecision = onLine && along <= (ph.decisionFt ?? 750);
  const arrived = inCone || reachedDecision;
  return { px, py, vpx: vfx, vpy: vfy, vfx, vfy, ex, ey, d, arrived, along, cross, dWorld, omegaL, slot: ph.slot ?? { fwd: rel.fwd, left: rel.left, alt: ph.slot?.alt ?? 0 } };
}

/** The line's closure and heading (closureOf for a 'line' phase). */
export function lineClosure(ph, L, W, aim) {
  const ratio = W.tasFtps / W.kias;
  const room = Math.max(0, (aim.along ?? 0) - (ph.decisionFt ?? 750));
  const closeFtps = typeof ph.arriveFtps === 'function' ? ph.arriveFtps(W) : (ph.arriveFtps ?? 20 * KT_TO_FTPS);
  const slowFtps2 = ph.slowFtps2 ?? TURNING_REJOIN.slowFtps2;
  let wantClosure = Math.sqrt(closeFtps * closeFtps + 2 * slowFtps2 * room);
  
  // De-rate along-track closure when off the line to prevent cutting the corner (intercept geometry first)
  const captureFt = ph.captureFt ?? 150;
  if (Math.abs(aim.cross) > captureFt) {
    const excess = Math.abs(aim.cross) - captureFt;
    const derate = Math.max(0, 1 - excess / (ph.aimFt ?? 500));
    wantClosure *= derate;
  }

  const omegaL = aim.omegaL ?? 0;
  let psiCmd;
  if (Math.abs(omegaL) < 1e-4) {
    psiCmd = Math.atan2(aim.dWorld.y, aim.dWorld.x);
  } else {
    const ad = aim.vfx * aim.dWorld.x + aim.vfy * aim.dWorld.y;
    const disc = ad * ad - (aim.vfx * aim.vfx + aim.vfy * aim.vfy) + W.tasFtps * W.tasFtps;
    const lam = disc >= 0 ? Math.max(0, Math.sqrt(disc) - ad) : 0;
    psiCmd = disc >= 0 ? Math.atan2(aim.vfy + lam * aim.dWorld.y, aim.vfx + lam * aim.dWorld.x) : Math.atan2(aim.dWorld.y, aim.dWorld.x);
  }
  const over = ph.overtakeKt != null ? ph.overtakeKt : 20;
  const floorKias = ph.floorKias ?? KIAS_OUTSIDE_LAB;
  const kiasCmd = Math.max(floorKias, Math.min(L.kias + over, (L.tasFtps + wantClosure) / ratio));
  return { pullX: 0, pullY: 0, vdx: W.tasFtps * Math.cos(psiCmd), vdy: W.tasFtps * Math.sin(psiCmd), speed: W.tasFtps, psiCmd, kiasCmd };
}
