// A path over the ground made of straight legs and arcs (RS-11): the holding pattern and the figure 8 (an infinity sign) the orbit is flown
// on. Plain geometry only, no flying: the pilot (pass.js, pilot.js) holds the path the way he holds the run-in line and
// the circle, by aiming the lift at a point a few seconds ahead on it (core liftTowardAim, the L1 path follower), so the
// racetrack, the figure 8 and the circle are all flown by the one follower.
//
// Axes as pass.js: feet, x east, y north. A leg is { kind: 'line', a, b }; an arc is { kind: 'arc', c (its centre), r
// (radius), a0 (the start's angle about the centre, radians from east), sweep (radians, + left / anticlockwise, − right) }.
// makePath() joins them into one path measured in feet from its start.

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const left = (h) => ({ x: -h.y, y: h.x });

/** A path from segments (each starting where the last ended): { segs, total } with each segment's start and length. */
export function makePath(segments) {
  let start = 0;
  const segs = segments.map((s) => {
    const len = s.kind === 'line' ? Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) : Math.abs(s.sweep) * s.r;
    const out = { ...s, start, len };
    if (s.kind === 'line') out.dir = len > 0 ? { x: (s.b.x - s.a.x) / len, y: (s.b.y - s.a.y) / len } : { x: 1, y: 0 };
    start += len;
    return out;
  });
  return { segs, total: start };
}

/** The point and the ground track's direction (unit) d feet into one segment. */
function onSeg(seg, d) {
  if (seg.kind === 'line') return { x: seg.a.x + seg.dir.x * d, y: seg.a.y + seg.dir.y * d, dir: seg.dir };
  const k = Math.sign(seg.sweep) || 1;
  const th = seg.a0 + (k * d) / seg.r;
  return { x: seg.c.x + seg.r * Math.cos(th), y: seg.c.y + seg.r * Math.sin(th), dir: { x: -k * Math.sin(th), y: k * Math.cos(th) } };
}

/**
 * The point s feet along the path, with the track's direction there: { x, y, dir }. Past the end it carries on straight
 * along the last direction (so past the IP it runs on down the run-in line); before the start it is the start.
 */
export function pointOnPath(path, s) {
  const segs = path.segs;
  if (!segs.length) return null;
  if (s <= 0) return onSeg(segs[0], 0);
  if (s >= path.total) {
    const last = segs[segs.length - 1];
    const end = onSeg(last, last.len);
    const over = s - path.total;
    return { x: end.x + end.dir.x * over, y: end.y + end.dir.y * over, dir: end.dir };
  }
  for (const seg of segs) if (s <= seg.start + seg.len) return onSeg(seg, s - seg.start);
  return onSeg(segs[segs.length - 1], segs[segs.length - 1].len);
}

/**
 * How far along the path (feet) the point nearest p lies, looking only between sFrom and sTo. The window keeps the
 * follower on its own part of the path where the path crosses itself (the figure 8's legs cross at the IP).
 */
export function nearestOnPath(path, p, sFrom, sTo) {
  const lo = Math.max(0, sFrom);
  const hi = Math.min(path.total, sTo);
  let best = { d2: Infinity, s: lo };
  for (const seg of path.segs) {
    const a = Math.max(0, lo - seg.start);
    const b = Math.min(seg.len, hi - seg.start);
    if (b < a) continue;
    const tries = [];
    if (seg.kind === 'line') {
      tries.push((p.x - seg.a.x) * seg.dir.x + (p.y - seg.a.y) * seg.dir.y);
    } else {
      const k = Math.sign(seg.sweep) || 1;
      const th = Math.atan2(p.y - seg.c.y, p.x - seg.c.x);
      const d = ((((th - seg.a0) * k) % TAU) + TAU) % TAU * seg.r;
      tries.push(d, d - TAU * seg.r, d + TAU * seg.r);
    }
    for (const t of tries) {
      const d = clamp(t, a, b);
      const q = onSeg(seg, d);
      const d2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
      if (d2 < best.d2) best = { d2, s: seg.start + d };
    }
  }
  return best.s;
}

/** Points along the path every stepFt (and at each segment's ends), for drawing. */
export function samplePath(path, stepFt = 200) {
  const pts = [];
  for (const seg of path.segs) {
    const n = Math.max(1, Math.ceil(seg.len / (seg.kind === 'line' ? Math.max(seg.len, 1) : stepFt)));
    for (let i = 0; i <= n; i++) {
      const q = onSeg(seg, (seg.len * i) / n);
      pts.push({ x: q.x, y: q.y });
    }
  }
  return pts;
}

/** A turn from point p on track h (unit), radius r, through `angle` radians, turnDir −1 left or +1 right. */
function turn(p, h, r, angle, turnDir) {
  const side = turnDir < 0 ? left(h) : { x: h.y, y: -h.x };
  const c = { x: p.x + side.x * r, y: p.y + side.y * r };
  return { kind: 'arc', c, r, a0: Math.atan2(p.y - c.y, p.x - c.x), sweep: (turnDir < 0 ? 1 : -1) * angle };
}

/**
 * One lap of the holding pattern (RS-11), starting at the IP on the inbound track u: the turn in the orbit's direction
 * (dir −1 left, +1 right) through 180° at radius r, the outbound leg legFt long, the turn back through 180°, and the
 * inbound leg, legFt long, ending at the IP on track u. A longer or shorter outbound leg moves where the turn inbound
 * rolls out, so the inbound leg is the same length, as a stretched holding leg is over the ground.
 */
export function holdLap({ ip, u, dir, r, legFt }) {
  const side = dir < 0 ? left(u) : { x: u.y, y: -u.x };
  const abeam = { x: ip.x + side.x * 2 * r, y: ip.y + side.y * 2 * r };
  const back = { x: -u.x, y: -u.y };
  const outEnd = { x: abeam.x - u.x * legFt, y: abeam.y - u.y * legFt };
  const inStart = { x: ip.x - u.x * legFt, y: ip.y - u.y * legFt };
  return [
    turn(ip, u, r, Math.PI, dir),
    { kind: 'line', a: abeam, b: outEnd },
    turn(outEnd, back, r, Math.PI, dir),
    { kind: 'line', a: inStart, b: { ...ip } },
  ];
}

/**
 * One loop of the figure 8 (RS-11; an infinity sign since V2.508, Dad: "can the figure 8 be more like this"), from the IP
 * back to the IP: a straight leg at half the crossing angle (crossDeg) off the run-in's track, out to the loop's side, the
 * loop round at radius r turning dir (−1 left, +1 right), and the straight leg back to the IP at half the crossing angle
 * on the other side. The two legs cross at the IP; the loop's centre sits abeam the IP at r ÷ cos(crossDeg ÷ 2) and each
 * leg is r × tan(crossDeg ÷ 2) long (tangents from the IP to the loop), so the shape over the ground is the same either
 * way round (RS-30's flow):
 *  - outbound (the default since Dad's ask of 19 Oct 2026, "the inbound should be reversed", his pick "same place, flown
 *    backwards"): the legs head away from the target (−u), so every pass crosses the IP outbound; a left-turning loop lies
 *    right of the run-in line (seen looking inbound) and a right-turning one left of it;
 *  - inbound (as flown from V2.508, kept as RS-30's other choice): the legs head toward the target (u); a left-turning
 *    loop lies left of the line.
 */
export function eightLoop({ ip, u, dir, r, crossDeg, outbound = true }) {
  const half = (crossDeg * Math.PI) / 360;
  const right = { x: u.y, y: -u.x };
  const side = (dir < 0) === outbound ? right : left(u); // the loop's side
  const fwd = outbound ? { x: -u.x, y: -u.y } : u; // the way the legs head across the IP
  const rot = (k) => ({ x: fwd.x * Math.cos(half) + side.x * Math.sin(half) * k, y: fwd.y * Math.cos(half) + side.y * Math.sin(half) * k });
  const legFt = r * Math.tan(half);
  const out = rot(1); // out from the IP toward the loop's side
  const back = rot(-1); // back across the IP toward the other side
  const a = { x: ip.x + out.x * legFt, y: ip.y + out.y * legFt };
  const b = { x: ip.x - back.x * legFt, y: ip.y - back.y * legFt };
  return [
    { kind: 'line', a: { ...ip }, b: a },
    turn(a, out, r, TAU - 2 * half, dir),
    { kind: 'line', a: b, b: { ...ip } },
  ];
}

/**
 * The figure 8's exit's sizes (RS-11, Dad's ask of 19 Oct 2026), for a turn of radius r and the crossing angle crossDeg:
 * outFt, the straight on from the IP along the last crossing leg; sweepRad, the turn inbound (180° plus half the crossing
 * angle); inFt, the straight inbound along the run-in line from the roll-out to the IP. A teardrop: the turn rolls out on
 * the run-in line, so it is begun r × (1 + cos half) to the side of the line, and rolls out inFt behind the IP.
 */
export function eightExitSizes(r, crossDeg) {
  const half = (crossDeg * Math.PI) / 360;
  const outFt = (r * (1 + Math.cos(half))) / Math.sin(half);
  return { outFt, sweepRad: Math.PI + half, inFt: outFt * Math.cos(half) + r * Math.sin(half) };
}

/**
 * The outbound figure 8's exit (RS-11, RS-30; Dad's ask of 19 Oct 2026: "on the last pass it turns inbound at the end of a loop and rolls
 * out through the IP onto the run-in"), flown after the last loop, which ends crossing the IP heading outbound: straight
 * on along that crossing leg, then the turn inbound the same way the last loop turned (dir, −1 left or +1 right) at radius
 * r, rolling out on the run-in line behind the IP heading inbound (u), then straight in along the line to the IP, where
 * the run-in starts. It cannot roll out at the IP itself: the crossing leg is half the crossing angle off the line, so a
 * turn the same way can only meet the line further back.
 */
export function eightExit({ ip, u, dir, r, crossDeg }) {
  const half = (crossDeg * Math.PI) / 360;
  const toward = dir < 0 ? left(u) : { x: u.y, y: -u.x }; // the side the last crossing leg heads to (the last loop's other side)
  const h = { x: -u.x * Math.cos(half) + toward.x * Math.sin(half), y: -u.y * Math.cos(half) + toward.y * Math.sin(half) };
  const { outFt, sweepRad, inFt } = eightExitSizes(r, crossDeg);
  const start = { x: ip.x + h.x * outFt, y: ip.y + h.y * outFt };
  const rollOut = { x: ip.x - u.x * inFt, y: ip.y - u.y * inFt };
  return [
    { kind: 'line', a: { ...ip }, b: start },
    turn(start, h, r, sweepRad, dir),
    { kind: 'line', a: rollOut, b: { ...ip } },
  ];
}
