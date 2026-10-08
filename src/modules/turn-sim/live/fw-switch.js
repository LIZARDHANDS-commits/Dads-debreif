// The fighting wing side switch (TS-102; Patrick 6 Oct 2026 01:04Z: "the station change from side to side in fighting wing
// should be at least 60 deg bank. it's a fast switch over that can be used to bleed energy. right now its very slow").
//
// An S-turn behind Lead: #2 rolls to the switch bank (FW_SWITCH.bankDeg, 60°) toward Lead's tail line, turns in until the
// roll-out arc will just reach the mirror of his place on the other side of the cone, reverses to the same bank the other
// way, and rolls out parallel to Lead again in the far cone. Power is back through it (he asks for less speed than Lead),
// so the switch bleeds energy, which is what it is used for (Patrick 01:04Z; 5 Oct 23:02Z: "a common way to bleed energy
// is to S turn left and right"); from the back of the cone it is full power and a dive instead, to keep the spacing
// (Patrick 01:23Z). The crossing is behind Lead: the turn in drops him back (his speed is off Lead's heading)
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
import { turnRadiusFromBankFt } from '../../../core/flight-math.js';
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
  let fwd0 = null;
  let left0 = null;
  const pursuit = (L, W) => {
    if (stage === 'done') return null;
    const rel = relativeTo(L, W);
    const off = s * wrapPi(W.headingRad - L.headingRad); // how far his heading has turned toward the far side, radians
    // Speed (Patrick 6 Oct 01:24Z: "if they want to swap sides they have to do what they need to with geometry, then
    // power, to maintain position. this is fundamental for any formation movement"): the switch holds the forward
    // station he had at the press. Turning in an S-turn increases ground track distance relative to Lead; to maintain
    // forward position, geometry demands speed compensation V_lead / cos(phi) while banked, plus proportional feedback
    // on depth lag (-rel.fwd - (-fwd0)).
    fwd0 ??= rel.fwd;
    left0 ??= rel.left;
    const depthLag = (-rel.fwd) - (-fwd0);
    const phi = Math.max(0, off);
    const cosPhi = Math.max(0.75, Math.cos(phi));
    const kiasGeom = L.kias / cosPhi;
    const kiasLag = Math.max(-1, Math.min(1, depthLag / S.holdScaleFt)) * S.holdKias;
    const kiasCmd = Math.min(L.kias + S.holdKias + 10, Math.max(L.kias - 10, kiasGeom + kiasLag));

    if (stage === 'in') {
      if (-rel.fwd < S.minBehindFt) return null; // too close behind Lead to cross: the slot law drops him back first
      // Where the roll-out would end if it started now: the arc at the same bank the other way, plus the reversal itself
      // (about reverseSec at his present heading). Reversal triggers when the predicted roll-out reaches the far cone
      // (targetAcross). He holds wings level across if already at max turn-in angle until reaching the reversal point.
      const radiusFt = turnRadiusFromBankFt(W.tasFtps, S.bankDeg);
      const acrossFt = radiusFt * (1 - Math.cos(phi)) + W.tasFtps * Math.sin(phi) * 0.8;
      const leftEnd = s * rel.left + acrossFt;
      const targetAcross = Math.max(450, Math.min(650, Math.abs(left0)));
      if (phi > 0 && leftEnd >= targetAcross) {
        stage = 'out';
      } else {
        const bankDeg = phi >= S.turnInMaxDeg * DEG ? 0 : s * S.bankDeg;
        return { psiCmd: L.headingRad + s * S.turnInMaxDeg * DEG, kiasCmd, bankDeg };
      }
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
  return { pursuit, goal, side: sTo, isSwitching: () => stage !== 'done' };
}
