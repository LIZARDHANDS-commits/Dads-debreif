// Golden test (R9): src/core/tennis.js against the debrief's tennis ball
// (getKmlTennisSolution), run on the same recorded tracks. Given V6's straight,
// level target path and no shooter climb, the only difference left from V6 is
// Patrick's cone rule for INTERCEPT (Q36).
import test from 'node:test';
import assert from 'node:assert/strict';
import { tennisBall } from '../../src/core/tennis.js';
import { loadV6, v6Number } from './v6-source.js';
import { seeded, recordedTrack } from './inputs.js';
import { KT_TO_FTPS as KTS_TO_FPS } from '../../src/core/units.js';

/**
 * A target track, a moment `now` on it, and a shooter track flying the same
 * path from nearby: usually behind the target at that moment, else anywhere.
 */
function engagement(r) {
  const target = recordedTrack(1, r);
  const pts = target.pts, now = pts[0].t + (pts.at(-1).t - pts[0].t) * r();
  const k = Math.max(1, pts.findIndex(p => p.t >= now));
  const behind = r() < 0.7, d = 300 + 2500 * r(), climb = -300 + 600 * r();
  const h = behind ? Math.atan2(pts[k].y - pts[k - 1].y, pts[k].x - pts[k - 1].x) + Math.PI + (r() - 0.5) * 0.3 : 2 * Math.PI * r();
  const shooter = { id: 2, pts: pts.map(p => ({ t: p.t, x: p.x + d * Math.cos(h), y: p.y + d * Math.sin(h), altFt: p.altFt + climb })) };
  return { shooter, target, now };
}

/** Settings as the boxes would give them, as numbers. */
function settings(r) {
  return {
    ballKt: 200 + 300 * r(), coneDeg: [6, 0.05, 2 + 18 * r()][Math.floor(3 * r())], tofSec: [3, 0.1, 0.5 + 5 * r()][Math.floor(3 * r())],
    radius: [250, 5, 0.5, 50 + 700 * r()][Math.floor(4 * r())], bias: [0, -10 + 20 * r()][Math.floor(2 * r())], gravity: r() < 0.7,
  };
}

function box(s) {
  return {
    kmlTennisMode: { value: 'on' }, kmlTennisShooter: { value: '2' }, kmlTennisTarget: { value: '1' },
    kmlTennisSpeed: { value: String(s.ballKt) }, kmlTennisCone: { value: String(s.coneDeg) }, kmlTennisTof: { value: String(s.tofSec) },
    kmlTennisRadius: { value: String(s.radius) }, kmlTennisPitch: { value: String(s.bias) }, kmlTennisGravity: { value: s.gravity ? 'on' : 'off' },
    kmlTennisReadout: { innerHTML: '' },
  };
}

function debriefV6() {
  return loadV6(['deg2rad', 'rad2deg', 'numSetting', 'interpTrack', 'headingAtTrack', 'aircraftPitchAtTrack', 'angleDiffRad', 'getKmlTennisSolution'], {
    prelude: `const KTS_TO_FPS=${v6Number('KTS_TO_FPS')}, G0=${v6Number('G0')}, KML_KT_PER_FPS=${v6Number('KML_KT_PER_FPS')};
      let tracks={}, kmlT=0, dom={};
      const el=id=>dom[id]||null;
      function setDebrief(s){ tracks=s.tracks; kmlT=s.kmlT; dom=s.dom; }`,
    expose: ['setDebrief'],
  });
}

test('tennisBall matches getKmlTennisSolution when given V6\'s target path', () => {
  const v6 = debriefV6();
  const r = seeded(21);
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const { shooter, target, now: kmlT } = engagement(r);
    const s = settings(r);
    const live = { 1: v6.interpTrack(target, kmlT), 2: v6.interpTrack(shooter, kmlT) };
    if (r() < 0.2) live[2] = { ...live[2], spdKt: undefined };
    v6.setDebrief({ tracks: { 1: target, 2: shooter }, kmlT, dom: box(s) });
    const want = v6.getKmlTennisSolution(live);
    // What the screen passes in: the track headings now and the pitch estimate plus the bias.
    const pitch = v6.aircraftPitchAtTrack(shooter, kmlT);
    // Q34, Q37: the target now flies its recorded path. Given V6's straight-on, level path
    // instead, the answer is exactly V6's, so that is the only change.
    const targetHdg = v6.headingAtTrack(target, kmlT), tv = (live[1].spdKt || 0) * KTS_TO_FPS;
    const straightOn = tau => ({ x: live[1].x + Math.cos(targetHdg) * tv * tau, y: live[1].y + Math.sin(targetHdg) * tv * tau, altFt: live[1].altFt || 0 });
    const got = tennisBall({
      shooter: live[2], target: live[1], targetAt: straightOn,
      shooterHdg: v6.headingAtTrack(shooter, kmlT),
      pitchDeg: (Number.isFinite(pitch.deg) ? pitch.deg : 0) + s.bias,
      ballKt: s.ballKt, coneDeg: s.coneDeg, tofSec: s.tofSec, hitRadiusFt: s.radius, gravity: s.gravity,
    });
    // Q36: INTERCEPT now also needs the target in the cone; V6 ignored the cone.
    const inCone = want.losAngle <= s.coneDeg / 2;
    assert.deepEqual(got, {
      status: want.status === 'INTERCEPT' && !inCone ? 'OUT OF CONE' : want.status, points: want.points, targetPoints: want.targetPoints, best: want.best,
      losAngle: want.losAngle, rangeNow: want.rangeNow, tofSec: want.tof, hitRadiusFt: want.hitRadius,
    });
    seen.add(want.status === 'INTERCEPT' && !inCone ? 'V6 INTERCEPT out of the cone' : want.status);
  }
  assert.deepEqual([...seen].sort(), ['IN CONE', 'INTERCEPT', 'OUT OF CONE', 'V6 INTERCEPT out of the cone']);
});

test('matches V6 on exact ties, a pass exactly at the hit radius and tiny radii', () => {
  const dbg = debriefV6();
  const still = (id, x) => ({ id, pts: [0, 1, 2, 3].map(t => ({ t, x, y: 0, altFt: 5000 })) });
  // A ball that doesn't move and a target that doesn't either: every step is the same distance.
  const cases = [
    { gap: 250, radius: 250 }, { gap: 250.5, radius: 250 }, { gap: 7, radius: 5 }, { gap: 0.8, radius: 0.5 }, { gap: 3, radius: 0 },
  ];
  for (const { gap, radius } of cases) {
    const s = { ballKt: 0, coneDeg: 6, tofSec: 3, radius, bias: 0, gravity: false };
    const tracks = { 1: still(1, gap), 2: still(2, 0) };
    const live = { 1: dbg.interpTrack(tracks[1], 1.5), 2: { ...dbg.interpTrack(tracks[2], 1.5), spdKt: 0 } };
    dbg.setDebrief({ tracks, kmlT: 1.5, dom: box(s) });
    const want = dbg.getKmlTennisSolution(live);
    const got = tennisBall({ shooter: live[2], target: live[1], targetAt: () => live[1], shooterHdg: 0, pitchDeg: 0, ballKt: 0, coneDeg: 6, tofSec: 3, hitRadiusFt: radius, gravity: false });
    assert.equal(got.status, want.status, `gap ${gap}, radius ${radius}`);
    assert.deepEqual(got.best, want.best);

  }
});
