// Turns in fighting wing, 2-ship (Turn Sim spec section 10, decision TS-55; Patrick 4 Oct 18:00Z: "I want to be able to turn
// the formation in fighting wing", on kinematic pre-planned lines). Lead flies the turn button's turn; #2's line is
// worked out at the press (kinematic.js) and replayed exactly.
//
// The picture (SMM 12.29 para 69, Fig 12.20 "Fighting Wing Turn Entry (in position)", Fig 12.23 "Fighting Wing Turn Exit";
// AFM7 brief p.14, Fighting Wing item 5):
//  - A gentle turn: #2 keeps its side and sweep (AFM7 item 5a).
//  - A moderate or steep turn: #2 collapses to Lead's 6 o'clock on Lead's turn circle (item 5b; Fig 12.20). From the outside
//    it aims inside the turn circle (lead pursuit); from the inside it "makes the miss", then reverses and captures the
//    turn circle (pure pursuit). Both come from one rule here: #2 flies Lead's own path a moment behind him, the sideways
//    offset of fighting wing shrinking to nothing as Lead's bank steepens.
//  - The exit: once Lead rolls out, #2 moves back out to the swept position (Fig 12.23: "pick the side you want and regain
//    position"; here the same side it started on).
// Numbers with no source beside them are estimates and say so.
import { wrapPi } from '../../../core/angles.js';
import { STEP_SEC } from './flight.js';
import { MANOEUVRES, relativeTo, DEG } from './manoeuvres.js';
import { recordFlight } from './transitions.js';
import { makeTrack, seedTrack, posesFrom, settleLast, smoothest } from './kinematic.js';
import { leadTurnSegs } from './kinematic-moves.js';

const dt = STEP_SEC;

/** The numbers of the fighting wing turns. Estimates unless a source is given. */
export const FW_TURN = Object.freeze({
  gentleBankDeg: 30, // Lead's bank for a turn of 30° or less (the check turn): gentle, #2 keeps side and sweep (AFM7 brief p.14 item 5a)
  steepBankDeg: 45, // Lead's bank for the bigger turns: moderate, #2 collapses to Lead's six (item 5b); 1.4 G level
  collapseFromDeg: 25, // #2 starts collapsing once Lead's (lagged) bank passes this ...
  collapseFullDeg: 40, // ... and is on Lead's turn circle by this
  followSec: 12, // #2's collapse and exit, and its offset's heading, follow Lead over this long (the lag of Fig 12.20 and Fig 12.23)
});

/** The turn buttons that fly in fighting wing (spec section 10): every turn; the shackle and cross turn stay line-abreast moves. */
export const FW_TURN_KEYS = Object.freeze(['check', 'delayed45', 'delayed90', 'inPlace90', 'hook']);

/** Three passes of a running mean over rows of { x, y }, half-width `half` rows. */
function smoothRows(rows, half = 5) {
  let out = rows;
  for (let pass = 0; pass < 3; pass++) {
    const src = out;
    out = src.map((_, i) => {
      const a = Math.max(0, i - half);
      const b = Math.min(src.length - 1, i + half);
      let x = 0;
      let y = 0;
      for (let j = a; j <= b; j++) {
        x += src[j].x;
        y += src[j].y;
      }
      return { x: x / (b - a + 1), y: y / (b - a + 1) };
    });
  }
  return out;
}

/** Lead's position at a fractional step j (cubic Hermite on his recorded positions and velocities; straight before the press). */
function leadAt(rec, j) {
  if (j <= 0) {
    const a = rec.at(0);
    return { x: a.xFt + Math.cos(a.headingRad) * a.tasFtps * j * dt, y: a.yFt + Math.sin(a.headingRad) * a.tasFtps * j * dt };
  }
  const i = Math.floor(j);
  const f = j - i;
  const a = rec.at(i);
  const b = rec.at(i + 1);
  const h00 = 2 * f ** 3 - 3 * f * f + 1;
  const h10 = f ** 3 - 2 * f * f + f;
  const h01 = -2 * f ** 3 + 3 * f * f;
  const h11 = f ** 3 - f * f;
  const va = { x: Math.cos(a.headingRad) * a.tasFtps * dt, y: Math.sin(a.headingRad) * a.tasFtps * dt };
  const vb = { x: Math.cos(b.headingRad) * b.tasFtps * dt, y: Math.sin(b.headingRad) * b.tasFtps * dt };
  return { x: h00 * a.xFt + h10 * va.x + h01 * b.xFt + h11 * vb.x, y: h00 * a.yFt + h10 * va.y + h01 * b.yFt + h11 * vb.y };
}

/**
 * A turn in fighting wing. pair: [lead, wing], #2 in fighting wing; key: a turn button (FW_TURN_KEYS); dir: +1 left, -1 right.
 * Returns { ok, plans, note, leadBankDeg, maxBankDeg, minKias, maxKias, endSec }.
 */
export function planFwTurn(pair, key, dir, t0 = 0) {
  const [lead, wing] = pair;
  const m = MANOEUVRES[key];
  if (!FW_TURN_KEYS.includes(key)) return { ok: false, reason: `${m?.label ?? key} flies in line abreast only.` };
  const bank = m.turnDeg <= 30 ? FW_TURN.gentleBankDeg : FW_TURN.steepBankDeg;
  const leadSegs = leadTurnSegs(lead.headingRad, dir, m.turnDeg * DEG, bank, true);
  const rec = recordFlight(lead, { segments: leadSegs }, t0);
  let kOut = 1;
  while (kOut < 20000 && !(rec.at(kOut).free && rec.at(kOut).bankDeg === 0)) kOut++;

  // Where #2 is now: its fighting wing position, kept as the swept position it goes back to.
  const rel0 = relativeTo(lead, wing);
  const behind0 = -rel0.fwd;
  const range0 = Math.hypot(rel0.fwd, rel0.left);
  const up0 = wing.altAboveFt - lead.altAboveFt;
  const V = lead.tasFtps;
  const follow = Math.round(FW_TURN.followSec / dt);
  const n = kOut + 2 * follow + Math.ceil(range0 / V / dt) + 20;

  // How far #2 has collapsed: none in a gentle bank, all of it in a steep one, eased in and out over followSec (a weighted
  // average of the last followSec), so the collapse and the exit each take several seconds.
  const unwrapped = [lead.headingRad];
  for (let k = 1; k <= n; k++) unwrapped[k] = unwrapped[k - 1] + wrapPi(rec.at(k).headingRad - rec.at(k - 1).headingRad);
  const weights = [];
  let wsum = 0;
  for (let j = 0; j <= follow; j++) {
    const u = (j + 0.5) / (follow + 1);
    const w = 140 * u ** 3 * (1 - u) ** 3;
    weights.push(w);
    wsum += w;
  }
  const lagAverage = (fn, k) => {
    let v = 0;
    for (let j = 0; j <= follow; j++) v += (weights[j] / wsum) * fn(Math.max(0, k - j));
    return v;
  };
  const steep = (k) => smoothest((Math.abs(rec.at(k).bankDeg) - FW_TURN.collapseFromDeg) / (FW_TURN.collapseFullDeg - FW_TURN.collapseFromDeg));
  const headingFollowed = (k) => lagAverage((j) => unwrapped[j], k);

  // #2's line: Lead's own path `behind` feet back (on his turn circle when collapsed), plus fighting wing's sideways offset,
  // which shrinks to nothing as Lead's bank steepens and grows back as he rolls out.
  const pad = 15;
  const raw = [];
  for (let k = -pad; k <= n + pad; k++) {
    const kk = Math.max(0, Math.min(n, k));
    const collapse = lagAverage(steep, kk);
    const behind = behind0 + (range0 - behind0) * collapse; // collapsed: straight behind at the same range (estimate: Fig 12.20 "stops the range from increasing")
    const D = leadAt(rec, k - behind / V / dt);
    const left = rel0.left * (1 - collapse);
    const h = k <= 0 ? lead.headingRad : headingFollowed(kk);
    raw.push({ x: D.x - Math.sin(h) * left, y: D.y + Math.cos(h) * left });
  }
  const line = smoothRows(raw);
  const track = makeTrack(n);
  seedTrack(track, wing);
  for (let k = 1; k <= n + 3; k++) {
    track.x[k + 3] = line[k + pad].x;
    track.y[k + 3] = line[k + pad].y;
    track.z[k + 3] = rec.at(Math.min(k, n)).altAboveFt + up0;
  }
  const out = posesFrom(track, wing.kias / wing.tasFtps);
  settleLast(out.poses, rec.at(n));
  const side = rel0.left > 0 ? 'left' : 'right';
  return {
    ok: true,
    plans: { [lead.id]: { segments: leadSegs.map((x) => ({ ...x })) }, [wing.id]: { segments: [{ kind: 'poseTrack', poses: out.poses }] } },
    note: `${m.label} ${dir > 0 ? 'left' : 'right'} in fighting wing: Lead turns at ${bank}° of bank; ${bank > FW_TURN.collapseFromDeg ? `#2 collapses to Lead's six on his turn circle, then moves back out to fighting wing ${side} (SMM Fig 12.20, 12.23)` : `#2 keeps its side and sweep (AFM7 brief p.14)`}.`,
    leadBankDeg: bank,
    maxBankDeg: out.maxBankDeg,
    minKias: out.minKias,
    maxKias: out.maxKias,
    endSec: t0 + n * dt,
  };
}
