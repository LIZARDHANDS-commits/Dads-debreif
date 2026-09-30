// Golden test (R9): both tennis-ball solvers in src/core/tennis.js against the
// V6 functions they came from, run on the same recorded tracks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tennisDebrief, tennis3D } from '../../src/core/tennis.js';
import { loadV6 } from './v6-source.js';
import { seeded, recordedTrack } from './inputs.js';

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

// ── The debrief overlay ──

function debriefV6() {
  return loadV6(['deg2rad', 'rad2deg', 'numSetting', 'interpTrack', 'headingAtTrack', 'aircraftPitchAtTrack', 'angleDiffRad', 'getKmlTennisSolution'], {
    prelude: `const KTS_TO_FPS=1.68781, G0=32.174, KML_KT_PER_FPS=0.592484;
      let tracks={}, kmlT=0, dom={};
      const el=id=>dom[id]||null;
      function setDebrief(s){ tracks=s.tracks; kmlT=s.kmlT; dom=s.dom; }`,
    expose: ['setDebrief'],
  });
}

test('tennisDebrief matches getKmlTennisSolution', () => {
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
    const got = tennisDebrief({
      shooter: live[2], target: live[1],
      shooterHdg: v6.headingAtTrack(shooter, kmlT), targetHdg: v6.headingAtTrack(target, kmlT),
      pitchDeg: (Number.isFinite(pitch.deg) ? pitch.deg : 0) + s.bias,
      ballKt: s.ballKt, coneDeg: s.coneDeg, tofSec: s.tofSec, hitRadiusFt: s.radius, gravity: s.gravity,
    });
    assert.deepEqual(got, {
      status: want.status, points: want.points, targetPoints: want.targetPoints, best: want.best,
      losAngle: want.losAngle, rangeNow: want.rangeNow, tofSec: want.tof, hitRadiusFt: want.hitRadius,
    });
    seen.add(want.status);
  }
  assert.deepEqual([...seen].sort(), ['IN CONE', 'INTERCEPT', 'OUT OF CONE']);
});

// ── The 3D arc ──

/**
 * Runs V6's draw3DDogfightArc against a canvas that records what it draws.
 * `project` hands each world point to the canvas unchanged, so the recording
 * holds the ball path, the two cone edges and the closest-pass line.
 */
function threeDV6() {
  return loadV6(['val', 'api', 'dpr', 'withHeading', 'draw3DDogfightArc'], {
    marker: 'function dpr(){return window.devicePixelRatio||1}',
    prelude: `let dom={}, theApi=null, paths=[];
      const document={ getElementById: id=>dom[id]||null };
      const window={ devicePixelRatio: 1, DADS3DAPI: null };
      const $=id=>document.getElementById(id);
      const project=p=>({ x: p, y: 0 });
      const ctx=new Proxy({}, { get: (o, k) => k==='beginPath' ? ()=>paths.push([]) : (k==='moveTo'||k==='lineTo') ? x=>paths.at(-1).push(x) : ()=>{}, set: ()=>true });
      function setThreeD(s){ dom=s.dom; window.DADS3DAPI=s.api; window.aircraftPitchAtTrack=s.pitchFn; paths=[]; }
      function aircraftPitchAtTrack(tr,t){ return window.aircraftPitchAtTrack(tr,t); }
      function drawn(){ return paths; }`,
    expose: ['setThreeD', 'drawn'],
  });
}

test('tennis3D matches draw3DDogfightArc', () => {
  const v6 = threeDV6();
  const { interpTrack } = debriefV6();
  const r = seeded(22);
  let hits = 0;
  for (let i = 0; i < 300; i++) {
    const { shooter, target, now } = engagement(r);
    const s = settings(r);
    const tracks = { 1: target, 2: shooter };
    const api = { getTracks: () => tracks, getTime: () => now, getInterp: (id, t) => (tracks[id] ? interpTrack(tracks[id], t) : null) };
    // Like the 3D view: heading from where the aircraft was a second ago (withHeading, line 3940).
    const live = { 1: v6.withHeading(api.getInterp(1, now), api.getInterp(1, now - 1)), 2: v6.withHeading(api.getInterp(2, now), api.getInterp(2, now - 1)) };
    // In V6 the pitch estimate never reaches the 3D view; every fifth case pretends it does.
    const estimate = -20 + 40 * r();
    const pitchFn = i % 5 ? undefined : () => ({ deg: estimate, source: 'test' });
    const dom = box(s);
    v6.setThreeD({ dom, api, pitchFn });
    v6.draw3DDogfightArc(live, null);
    const [arc, left, right, pass] = v6.drawn();

    const got = tennis3D({
      shooter: live[2], target: live[1], targetAt: t => api.getInterp(1, now + t),
      pitchDeg: (pitchFn ? estimate : 0) + s.bias,
      ballKt: s.ballKt, coneDeg: s.coneDeg, tofSec: s.tofSec, radiusFt: s.radius, gravity: s.gravity,
    });
    assert.deepEqual(got.points, arc);
    assert.deepEqual(got.coneEdges, [left, right]);
    assert.deepEqual([got.closest.ball, got.closest.target], pass);
    assert.equal(dom.kmlTennisReadout.innerHTML.includes('NO INTERCEPT'), !got.hit);
    assert.ok(dom.kmlTennisReadout.innerHTML.includes(`Closest pass ${got.minDist.toFixed(0)} ft at ${got.closest.t.toFixed(1)} sec`));
    if (got.hit) hits++;
  }
  assert.ok(hits >= 15 && hits <= 285, `${hits} of 300 cases hit; the inputs should give both answers`);
});

test('tennis3D without a target track keeps the target where it is', () => {
  const got = tennis3D({ shooter: { x: 0, y: 0, altFt: 5000, spdKt: 200, hdg: 0 }, target: { x: 1500, y: 0, altFt: 5000 }, pitchDeg: 0, ballKt: 350, coneDeg: 6, tofSec: 3, radiusFt: 250, gravity: false });
  assert.ok(got.hit);
  assert.deepEqual(got.closest.target, { x: 1500, y: 0, altFt: 5000 });
});
