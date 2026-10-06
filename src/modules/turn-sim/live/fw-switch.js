// The fighting wing side switch (TS-102; Patrick 6 Oct 2026 01:04Z: "the station change from side to side in fighting wing
// should be at least 60 deg bank. it's a fast switch over that can be used to bleed energy. right now its very slow").
//
// An S-turn behind Lead: #2 rolls to the switch bank (FW_SWITCH.bankDeg, 60°) toward Lead's tail line, turns in until the
// roll-out arc will just reach the mirror of his place on the other side of the cone, reverses to the same bank the other
// way, and rolls out parallel to Lead again in the far cone. Power is back through it (he asks for less speed than Lead),
// so the switch bleeds energy, which is what it is used for (Patrick 01:04Z; 5 Oct 23:02Z: "a common way to bleed energy
// is to S turn left and right"). The crossing is behind Lead: the turn in drops him back (his speed is off Lead's heading)
// and he is never nearer than where he started. The SMM does not draw the switch; the nearest pages are SMM 12.29 para
// 69 (the cone, 500-1,000 ft, 30-60° of sweep) and 12.30 paras 72-74 (pursuit). Numbers: tuning.js FW_SWITCH (estimates
// unless a source is named).
//
// Until V2.98 the switch was a kinematic line (line-moves.js, TS-86: a full power dive to 400 ft below Lead, up to about
// 240 KIAS, 34° off his heading, 20-33 s in the dry runs), the opposite of an energy bleed, or the tracker's three slides
// at 30 ft/s. Like the fighting wing turn law (fw-pursuit.js, TS-100), this law hands the tracker a command each step
// (heading, speed, and here the bank outright); the tracker's roll limit, speed loop and flight step fly it, so the path
// is recorded and replayed like every other 2-ship move. Once he is parallel to Lead it hands back (null) and the phase's
// band goal (formation-turns.js fwGoal) settles him where he arrives in the far cone (the whole cone, TS-75).
import { G_FTPS2 } from '../../../core/units.js';
import { wrapPi } from '../../../core/angles.js';
import { DEG, relativeTo } from './manoeuvres.js';
import { FW_SWITCH } from './tuning.js';
import { fwGoal } from './formation-turns.js';

/**
 * The switch to side sTo (+1 left) for one tracker phase: `pursuit` hands the tracker { psiCmd, kiasCmd, bankDeg } each
 * step, or null once #2 is parallel to Lead on the far side (and before the turn in, while he is too close behind Lead to
 * cross); `goal` keeps the phase's reference on #2 himself while he switches (nothing pulls on him), then is the band goal
 * (formation-turns.js fwGoal) that settles him where he arrives in the far cone.
 */
export function fwSwitch(sTo) {
  const S = FW_SWITCH;
  const s = sTo;
  let stage = 'in';
  const pursuit = (L, W) => {
    if (stage === 'done') return null;
    const rel = relativeTo(L, W);
    const off = s * wrapPi(W.headingRad - L.headingRad); // how far his heading has turned toward the far side, radians
    const kiasCmd = L.kias - S.bleedKias;
    if (stage === 'in') {
      if (-rel.fwd < S.minBehindFt) return null; // too close behind Lead to cross: the slot law drops him back first
      // Where the roll-out would end if it started now: the arc at the same bank the other way, plus the reversal itself
      // (about reverseSec at his present heading). He reverses as soon as that landing is at the far cone's middle
      // (aimSweepDeg off Lead's tail) at the depth he will be at then; the turn in drops him back, so the sooner the better.
      const radiusFt = W.tasFtps ** 2 / (G_FTPS2 * Math.tan(S.bankDeg * DEG));
      const phi = Math.max(0, off);
      const acrossFt = radiusFt * (1 - Math.cos(phi)) + W.tasFtps * Math.sin(phi) * S.reverseSec;
      const backFt = radiusFt * (phi - Math.sin(phi)) + W.tasFtps * (1 - Math.cos(phi)) * S.reverseSec;
      const leftEnd = s * rel.left + acrossFt;
      const depthEnd = -rel.fwd + backFt;
      if (phi > 0 && (leftEnd >= depthEnd * Math.tan(S.aimSweepDeg * DEG) || phi >= S.turnInMaxDeg * DEG)) stage = 'out';
      else return { psiCmd: L.headingRad + s * S.turnInMaxDeg * DEG, kiasCmd, bankDeg: s * S.bankDeg };
    }
    if (off <= S.rollOutDeg * DEG) {
      stage = 'done';
      return null;
    }
    return { psiCmd: L.headingRad, kiasCmd, bankDeg: -s * S.bankDeg };
  };
  const goal = (L, W) => {
    if (stage === 'done') return fwGoal(L, W, s, false);
    const rel = relativeTo(L, W);
    return { fwd: rel.fwd, left: rel.left };
  };
  return { pursuit, goal };
}
