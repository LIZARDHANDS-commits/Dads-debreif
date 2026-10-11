// The ride (Step 7, TS-181, TS-182): the turning rejoin's line flown in Lead's turning frame, where it stands still. Its aim
// (rideAim), its speed (rideClosure), the line's height below Lead (lineAltOf) and the height above the line counted as speed
// to come (rideHeightAsSpeed). Split out of tracker.js in refactor step 3 with no change: the tracker calls these for a phase
// of kind 'ride'. This is the file the optimiser reads (plan.md Step 9). Numbers are moves.js TURNING_REJOIN's.
import { wrapPi, DEG } from '../../../core/angles.js';
import { G_FTPS2 } from '../../../core/units.js';
import { STEP_SEC } from './flight.js';
import { relativeTo, unit } from './manoeuvres.js';
import { TURNING_REJOIN, KIAS_OUTSIDE_LAB } from './tuning.js';
import { fixedLine, FW_LIMITS, FW_BAND } from './slots.js';

/**
 * The ride (Step 7): the turning rejoin's line flown in Lead's frame, where it stands still (Patrick 8 Oct 20:49).
 * Off the line by `cross`, #2 asks to close on it at cross / rideCrossTauSec (no more than rideCrossMaxFtps), across it in
 * Lead's frame; the rest of his own speed goes up the line toward Lead. Only at the end is that turned into a world velocity
 * (the frame's own velocity at #2's place, Lead's speed plus ω × r, plus the relative one) and so a heading. Closure is
 * measured at #2 in Lead's frame, never as Lead's speed plus something. State (established, latched) lives in `ref`, which
 * is the run's own.
 */
export function rideAim(ph, L, Lprev, ref, W) {
  const TR = TURNING_REJOIN;
  const line = ph.line ?? fixedLine(ph.lineDeg ?? TR.lineDeg, ph.side ?? -1);
  const rel = relativeTo(L, W);
  const { along, cross } = line.at(rel);
  const f = unit(L.headingRad);
  const l = { x: -f.y, y: f.x };
  const toW = (v) => ({ x: v.fwd * f.x + v.left * l.x, y: v.fwd * f.y + v.left * l.y });
  const omegaL = Lprev ? wrapPi(L.headingRad - Lprev.headingRad) / STEP_SEC : 0;
  const rx = W.xFt - L.xFt;
  const ry = W.yFt - L.yFt;
  // The frame's velocity at #2's place: what he would fly to sit still on Lead's canopy.
  const vfx = L.tasFtps * f.x - omegaL * ry;
  const vfy = L.tasFtps * f.y + omegaL * rx;
  const wx = W.tasFtps * Math.cos(W.headingRad);
  const wy = W.tasFtps * Math.sin(W.headingRad);
  const nW = toW(line.nrm); // across the line, positive ahead of it (hot)
  const mW = toW({ fwd: -line.u.fwd, left: -line.u.left }); // up the line, toward Lead
  const drift = (wx - vfx) * nW.x + (wy - vfy) * nW.y; // d(cross)/dt in Lead's frame
  const closing = (wx - vfx) * mW.x + (wy - vfy) * mW.y; // up the line, ft/s
  const st = (ref.ride ??= { established: false });
  const maxDrift = ph.driftFtps ?? TR.rideDriftFtps; // Patrick G2, 10 ft/s, ruled again 10 Oct 20:00Z (it was 40 on every rejoin ride)
  if (!st.established && Math.abs(cross) <= (ph.captureFt ?? TR.captureFt) && Math.abs(drift) <= maxDrift) {
    st.established = true;
    st.establishedRange = Math.hypot(rx, ry);
  }

  // Where he aims, in Lead's frame (it stands still there): a point on the line rideLeadFt further up it than his own place,
  // but not closer to Lead than the capture point until he is established, so he joins the line well back (Patrick G1:
  // established by 1,500 ft). Far off the line that points him mostly across it; as he nears it, along it, so he comes onto it
  // along it. His own speed sets how fast he moves that way: |vf + λ·d| = V, solved for λ.
  st.captureAlong ??= Math.min(ph.captureAlongFt ?? TR.rideCaptureAlongFt, along < 0 ? (ph.captureAlongFt ?? TR.rideCaptureAlongFt) : Math.max(along, 0));
  const leadFt = ph.leadFt ?? TR.rideLeadFt;
  const windowFt = ph.windowFt ?? TR.windowFarFt;
  const carrotWindowFt = ph.carrotWindowFt ?? windowFt;
  const carrotAlong = Math.min(along - (ph.minLeadFt ?? TR.rideMinLeadFt), Math.max(st.established ? carrotWindowFt : st.captureAlong, along - leadFt));
  const dAlong = carrotAlong - along; // < 0: up the line
  const dLen = Math.hypot(dAlong, cross) || 1;
  // direction in world axes: dAlong along u (outward), -cross along nrm
  const uW = { x: -mW.x, y: -mW.y };
  const d = { x: (dAlong * uW.x - cross * nW.x) / dLen, y: (dAlong * uW.y - cross * nW.y) / dLen };
  const V = W.tasFtps;
  const bd = vfx * d.x + vfy * d.y;
  const disc = bd * bd - (vfx * vfx + vfy * vfy) + V * V;
  let lam = disc >= 0 ? Math.max(0, -bd + Math.sqrt(disc)) : 0;
  let dvx = disc >= 0 ? vfx + lam * d.x : V * d.x;
  let dvy = disc >= 0 ? vfy + lam * d.y : V * d.y;
  // He closes on the line no faster than he can stop on it: across it at most √(2·a·|cross|) (a = rideStopFtps2). Until he
  // is established, the rest of his speed goes up or down the line, whichever brings him to the capture point (a hot start
  // falls back down it, as an HTRJ gets colder); once established, up it (|vf + c·n + a·m| = V, solved for a).
  const cMax = Math.sqrt(2 * (ph.stopFtps2 ?? TR.rideStopFtps2) * Math.abs(cross));
  const cNow = (dvx - vfx) * nW.x + (dvy - vfy) * nW.y;
  if (Math.abs(cNow) > cMax || !st.established) {
    let c = st.established ? Math.sign(cNow) * Math.min(Math.abs(cNow), cMax) : -Math.sign(cross) * Math.min(cMax, Math.abs(cross) / (ph.settleSec ?? TR.rideSettleSec));
    const aWant = st.established ? Infinity : (along - st.captureAlong) / (ph.alongTauSec ?? TR.rideAlongTauSec);
    // Across the line he can close no faster than his own speed allows (|vf + c·n + a·m| = V has a root only while
    // |vf·n + c| <= V, n and m being square to each other): c is held inside that, smoothly. Until 10 Oct a loop shrank it by
    // 0.7 up to six times, and each step it changed count jumped c by 30%, which rolled #2 left and right while he closed on
    // the line from far off.
    const vfn = vfx * nW.x + vfy * nW.y;
    const cRoom = TR.rideCrossShare * V; // short of all of it, so some speed is left along the line
    c = Math.max(-cRoom - vfn, Math.min(cRoom - vfn, c));
    const base = { x: vfx + c * nW.x, y: vfy + c * nW.y };
    const bm = base.x * mW.x + base.y * mW.y;
    const disc2 = bm * bm - (base.x * base.x + base.y * base.y) + V * V;
    if (disc2 >= 0) {
      const a1 = -bm + Math.sqrt(disc2);
      const a2 = -bm - Math.sqrt(disc2);
      const a = Math.abs(a1 - aWant) <= Math.abs(a2 - aWant) ? a1 : a2;
      dvx = base.x + a * mW.x;
      dvy = base.y + a * mW.y;
      lam = -1; // flagged in the trace: the (c, a) form is flying
    }
  }
  const r = Math.hypot(rx, ry);
  const across = Math.abs(rel.left);
  const back = -rel.fwd;
  const sweep = Math.atan2(back, Math.max(across, 1e-6)) * (180 / Math.PI);
  const correctSide = ph.side == null || (ph.side > 0 ? rel.left > 50 : rel.left < -50);
  // In the cone the sim flies (slots.js FW_LIMITS, 450-1,250 ft, 25-65°; until 10 Oct its own 450-1,500 ft copy).
  const inFwCone = Boolean(ph.isFw || ph.toFw) && correctSide && back > 0 && r >= FW_LIMITS.rangeFt[0] && r <= FW_LIMITS.rangeFt[1] && sweep >= FW_LIMITS.sweepDeg[0] && sweep <= FW_LIMITS.sweepDeg[1];
  if (inFwCone && !st.established) {
    st.established = true;
    st.establishedRange = r;
  }
  const arrived = (st.established && along <= windowFt) || inFwCone;
  const px = W.xFt + dvx;
  const py = W.yFt + dvy;
  return {
    px, py, vpx: vfx, vpy: vfy, ex: dvx, ey: dvy, d: Math.hypot(dvx, dvy), arrived,
    along, cross, drift, closing, established: st.established, psiWant: Math.atan2(dvy, dvx), rangeFt: r,
    slot: ph.slot ?? { fwd: rel.fwd, left: rel.left, alt: ph.slot?.alt ?? 0 },
  };
}

/** The ride's speed (closureOf for a 'ride' phase): the speed is held, the geometry takes the closure out. */
export function rideClosure(ph, L, W, aim, pclMaxActive) {
  // The speed is held (Patrick 8 Oct 20:16); the geometry takes the closure out. The steering is rideAim's.
  const floor = ph.floorKias ?? KIAS_OUTSIDE_LAB;
  const rNow = aim.rangeFt ?? Math.hypot(L.xFt - W.xFt, L.yFt - W.yFt);
  const inAnticipation = Boolean(ph.isFw || ph.toFw) && rNow <= FW_BAND.rangeFt[1];
  const lineTargetKias = inAnticipation
    ? Math.max(L.kias, L.kias + (rNow - 500) * (20 / 500))
    : ph.far && aim.along > ph.far.fromFt
      ? ph.far.kias // the element far down the line (four-rejoin.js ELEMENT.far)
      : (aim.along <= (ph.easeFromFt ?? TURNING_REJOIN.rideEaseFromFt)
        ? (ph.easeKias ?? TURNING_REJOIN.rideEaseKias)
        : (ph.rideKias ?? TURNING_REJOIN.rideKias));
  const kiasCmd = (pclMaxActive || ph.rejoin || aim.established || Math.abs(aim.cross) <= (ph.speedUpFt ?? TURNING_REJOIN.rideSpeedUpFt))
    ? Math.max(floor, lineTargetKias)
    : floor;
  return { pullX: 0, pullY: 0, vdx: aim.ex, vdy: aim.ey, speed: W.tasFtps, psiCmd: aim.psiWant, kiasCmd };
}

/** The rejoin line's height at `rangeFt` from Lead: Lead held TURNING_REJOIN.lineElevDeg above #2's horizon (heightOf, TS-181). */
export function lineAltOf(ph, L, rangeFt) {
  const TR = TURNING_REJOIN;
  const depthFt = Math.min(ph.slopedMaxFt ?? Infinity, Math.max(-TR.lineUpFt, rangeFt * Math.tan(TR.lineElevDeg * DEG)));
  return (L.altAboveFt ?? 0) - depthFt;
}

/**
 * High on a rejoin line (Patrick 11 Oct 2026 09:10Z: from 2,000 ft high "use the speed brake/earlier power reduction"): the
 * height he still has to come down to the line is speed to come (standard energy, V^2 + 2 g dh), so his power comes off
 * for it now, and the boards with it once that is more than TURNING_REJOIN.highBoardsKt (an estimate). Until V2.291 he
 * flew the line's 210 KIAS on the speed alone, came off a 2,000 ft dive at 229 KIAS, could not lose it with the turn's
 * power floor and ran 13 kt fast through the decision point, close in on Lead.
 * Returns { kiasCmd, highStage }: the speed asked for less the speed the height will give, and 'boards' or null.
 */
export function rideHeightAsSpeed(ph, L, W, kiasCmd, cone) {
  let highStage = null;
  if (ph.slopedAlt && ph.rejoin && L && W && kiasCmd != null && !cone && !ph.isFw) {
    const dh = W.altAboveFt - lineAltOf(ph, L, Math.hypot(W.xFt - L.xFt, W.yFt - L.yFt));
    if (dh > 0 && W.tasFtps > 0) {
      const extraKt = ((Math.sqrt(W.tasFtps * W.tasFtps + 2 * G_FTPS2 * dh) - W.tasFtps) * W.kias) / W.tasFtps;
      const over = W.kias + extraKt - kiasCmd;
      if (over > 0) {
        kiasCmd -= Math.min(extraKt, over);
        if (over > TURNING_REJOIN.highBoardsKt) highStage = 'boards';
      }
    }
  }
  return { kiasCmd, highStage };
}
