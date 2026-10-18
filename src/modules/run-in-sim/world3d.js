// The Run-in Simulator's 3D view (spec, "Middle: the 3D view"): the real ground round the target (the shared terrain,
// ui-kit terrain3d.js, with the satellite picture draped on it, ui-kit draped-ground.js, and the shared sky,
// ui-kit sky-clouds.js), the target shape, the aircraft (the CT-156 model and, for the Cockpit camera, its front
// cockpit), the planned lines (the orbit's holding pattern, figure 8 or circle, the IP, the run-in, the dive line, the
// release point) and, as it flies, the
// trail behind the aircraft and the load's trail to its impact mark. Built the way the EP Tabletop builds its world
// (src/modules/ep-tabletop/world3d.js). A picture only: it shows the stored pass at the time it is given.
// The air refuelling run (RS-15 to RS-18, approved: Patrick's yes, relayed by Dad, 17 Oct 2026): no target; the anchor, the receiver's
// track, the tanker's turn point and the roll-out point; the KC-130J (kc130j.js) and the stand-in receiver (the CT-156)
// with their trails; and two more cameras, From the tanker and Behind the drogue.
//
// When data fails: a terrain tile that doesn't come leaves its part flat at the fallback height; a satellite tile that
// doesn't come leaves the plain ground colour; no WebGL leaves a message in place of the view (index.js), and the plan
// view, the settings and the result still work.
import { loadThree, addLights, webglSupported, worldToScreen } from '../../ui-kit/three-aircraft.js';
import { createCt156Model, disposeCt156Model, PAINT_DEFAULT, setGear, CT156_GEAR_TRAVEL_S } from '../../ui-kit/ct156-model.js';
import { createCockpitMount, aimCockpitCamera, CT156_FT_PER_UNIT } from '../../ui-kit/ct156-cockpit.js';
import { addSkyAndClouds, SKY_COLOURS } from '../../ui-kit/sky-clouds.js';
import { createDrapedGround } from '../../ui-kit/draped-ground.js';
import { attitudeDegFromClimb } from '../../core/t6-performance.js';
import { FT_PER_NM } from '../../core/units.js';
import { targetSizes, DECK_THICK_FT, TOWER } from './targets.js';
import { orbitOutline } from './pass.js';
import { refuelOutline, turnRangeLine, DROGUE } from './refuel.js';
import { buildAirports } from '../../ui-kit/airfield3d.js';
import { createKc130j } from './kc130j.js';
import { buildStadium } from './stadium-scene.js';

/** The haze: the ground fades to the horizon colour from 15 NM out to 40 NM (estimates for the look). */
const HAZE_NM = Object.freeze({ from: 15, to: 40 });
/** Each camera's place (feet; estimates for the look): Chase behind and above, Overhead above, Side square to the run-in. */
const CAMERA = Object.freeze({ chaseBackFt: 260, chaseUpFt: 55, overheadFt: 3000, sideFt: 3000, targetUpFt: 40, fovDeg: 50, targetFovDeg: 25, idleBackFt: 4500, idleUpFt: 1500 });
/**
 * The refuelling run's cameras (feet; estimates for the look): From the tanker sits just behind its tail cone looking at
 * the receiver; Behind the drogue sits behind the left basket and above, clear of a receiver in pre-contact, looking up
 * the hose. Their own lines' labels are left off (looking down the track they print over the receiver). Far from the camera
 * (past labelFt) an aircraft gets a label. The tanker is drawn nose up by noseUpDeg (an estimate for the look).
 */
const AAR_CAMERA = Object.freeze({ tankerBackFt: 66, tankerUpFt: 4, drogueBackFt: 100, drogueUpFt: 14, labelFt: 1500, fovDeg: 45, noseUpDeg: 2 });
/** The refuelling run's take-off: the gear starts up this long after lift-off, s (an estimate: once climbing away). */
const GEAR_UP_AFTER_SEC = 3;
/** Degrees of look per pixel dragged (an estimate for feel). */
const DRAG_DEG_PER_PX = 0.25;
/** The trails keep one point in this many of the pass's steps (0.2 s). */
const TRAIL_EVERY = 4;
const ft10 = (n) => `${(Math.round(n / 10) * 10).toLocaleString('en-CA')} ft`;
const COLOURS = Object.freeze({
  plan: '#e8f4ff', runIn: '#42bfe9', dive: '#42bfe9', release: '#ff9f43', ip: '#f5c542', trail: '#42bfe9', escape: '#3ecf8e', load: '#f5c542',
  concrete: '#b8b4aa', field: '#3f7d3a', steel: '#8d969e', ring: '#ffffff', dz: '#ff9f43', tanker: '#ff9f43', rollOut: '#ffffff',
});

/**
 * Builds the view in `host`. timers: the module's scheduler scope; terrain: ui-kit terrain3d.js's (index.js owns it and
 * refreshes it); area: area.js areaFor(); fallbackFt: the ground's height where no tile came.
 * Returns a Promise of the view's api, or of null without WebGL.
 */
export async function createRunInWorld({ host, timers, terrain, area, fallbackFt, paint = PAINT_DEFAULT, doc = globalThis.document }) {
  if (!webglSupported({ document: doc })) return null;
  const THREE = await loadThree();
  const canvas = doc.createElement('canvas');
  canvas.className = 'rs-3d-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'The pass in 3D over the ground round the target');
  host.append(canvas);
  const labels = doc.createElement('div');
  labels.className = 'rs-3d-labels';
  host.append(labels);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  const scene = new THREE.Scene();
  const sky = addSkyAndClouds(THREE, scene, { doc });
  scene.fog = new THREE.Fog(SKY_COLOURS.horizon, HAZE_NM.from * FT_PER_NM, HAZE_NM.to * FT_PER_NM);
  addLights(THREE, scene);
  const camera = new THREE.PerspectiveCamera(CAMERA.fovDeg, 1, 2, 400_000);
  const owned = [];
  const own = (thing) => {
    owned.push(thing);
    return thing;
  };

  // ---- The ground ----
  let projection = area.projection; // the flying's frame (about the place)
  let groundProjection = area.ground?.projection ?? projection; // the ground squares' frame (the refuelling run's is offset, RS-19)
  let groundOffset = area.ground?.offset ?? { x: 0, y: 0 };
  let homeFt = fallbackFt;
  let groundDirty = true;
  let reliefRevision = -1;
  let disposed = false;
  let wake = null;
  const nudge = () => {
    if (wake || disposed) return;
    wake = timers.after(300, () => {
      wake = null;
      draw();
    });
  };
  const ground = createDrapedGround({ T: THREE, timers, doc, plan: area.plan, imagery: area.imagery, polygonOffset: true, onChange: () => { groundDirty = true; nudge(); } });
  ground.setHeight(homeFt);
  ground.group.position.x = groundOffset.x;
  ground.group.position.y = groundOffset.y;
  scene.add(ground.group);

  // ---- The target ----
  const targetGroup = new THREE.Group();
  scene.add(targetGroup);
  const mat = (color, extra = {}) => own(new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...extra }));
  const flatMat = (color) => own(new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  const clearGroup = (g) => {
    for (const c of [...g.children]) {
      g.remove(c);
      c.traverse?.((o) => o.geometry?.dispose());
    }
  };
  const box = (w, d, hgt, material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, hgt), material);
    m.position.set(x, y, z + hgt / 2);
    return m;
  };
  const ring = (rIn, rOut, material, z = 2) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 96), material);
    m.position.z = z;
    m.renderOrder = 2;
    return m;
  };
  let stadium = null; // the bowl's crowd, field and fireworks (stadium-scene.js; RS-28), while the Display switch is on
  function buildTarget(t) {
    stadium?.dispose();
    stadium = null;
    clearGroup(targetGroup);
    if (!t) return; // the refuelling run has no target
    const { id, sizeFt, headingDegT, groundFt } = t;
    const s = targetSizes(id, sizeFt);
    targetGroup.position.set(0, 0, groundFt);
    targetGroup.rotation.set(0, 0, ((90 - headingDegT) * Math.PI) / 180); // its long axis along the heading
    if (id === 'stadium') {
      const shape = new THREE.Shape();
      shape.absellipse(0, 0, s.sizeFt / 2, s.widthFt / 2, 0, Math.PI * 2, false, 0);
      const hole = new THREE.Path();
      hole.absellipse(0, 0, s.sizeFt * 0.34, s.widthFt * 0.3, 0, Math.PI * 2, true, 0);
      shape.holes.push(hole);
      if (t.dressed) {
        // RS-28: stepped stands with the seated crowd in rows, the football field and goal posts, the fireworks.
        stadium = buildStadium(THREE, { sizeFt: s.sizeFt, widthFt: s.widthFt, topFt: s.topFt, anthem: t.anthem, doc });
        targetGroup.add(stadium.group);
      } else {
        const bowl = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: s.topFt, bevelEnabled: false, curveSegments: 48 }), mat(COLOURS.concrete));
        bowl.position.z = -5; // stands a little into the ground, so a slope doesn't show a gap
        targetGroup.add(bowl);
      }
      const field = new THREE.Mesh(new THREE.CircleGeometry(1, 48), flatMat(COLOURS.field));
      field.scale.set(s.sizeFt * 0.34, s.widthFt * 0.3, 1);
      field.position.z = 2;
      targetGroup.add(field);
    } else if (id === 'bridge') {
      const steel = mat(COLOURS.steel);
      targetGroup.add(box(s.sizeFt, s.widthFt, DECK_THICK_FT, mat(COLOURS.concrete), 0, 0, s.aimFt - DECK_THICK_FT));
      for (const x of [-s.sizeFt / 4, s.sizeFt / 4]) {
        targetGroup.add(box(TOWER.alongFt, s.widthFt + TOWER.widerFt, s.topFt + 5, steel, x, 0, -5));
        targetGroup.add(box(30, s.widthFt, s.aimFt - DECK_THICK_FT + 5, mat(COLOURS.concrete), x, 0, -5));
      }
    } else if (id === 'tower') {
      targetGroup.add(box(s.widthFt, s.widthFt, s.topFt + 5, mat(COLOURS.steel), 0, 0, -5));
      targetGroup.add(box(s.widthFt * 1.4, s.widthFt * 1.4, 12, mat('#c0392b'), 0, 0, s.topFt - 12));
    } else if (id === 'range') {
      const white = flatMat(COLOURS.ring);
      const k = s.sizeFt / 200;
      for (const r of [50, 100, 200]) targetGroup.add(ring(r * k - 3, r * k + 3, white));
      const centre = new THREE.Mesh(new THREE.CircleGeometry(10 * k, 32), white);
      centre.position.z = 2;
      targetGroup.add(centre);
    } else {
      const orange = flatMat(COLOURS.dz);
      targetGroup.add(ring(s.sizeFt - 6, s.sizeFt + 6, orange));
      targetGroup.add(box(60, 8, 1, orange, 0, 0, 2));
      targetGroup.add(box(8, 60, 1, orange, 0, 0, 2));
    }
  }

  // ---- The planned lines ----
  const planGroup = new THREE.Group();
  scene.add(planGroup);
  const lineMat = (color, dashed = false) => own(dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 400, gapSize: 250, transparent: true, opacity: 0.9 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  const line = (points, material, loop = false) => {
    const g = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
    const l = loop ? new THREE.LineLoop(g, material) : new THREE.Line(g, material);
    if (material.isLineDashedMaterial) l.computeLineDistances();
    return l;
  };
  const dot = (p, color, r = 40) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), own(new THREE.MeshBasicMaterial({ color })));
    m.position.set(p.x, p.y, p.z);
    return m;
  };
  let marks = []; // { words, p } for the labels
  function buildPlan(plan, display) {
    clearGroup(planGroup);
    marks = [];
    if (airports) airports.root.visible = false; // shown again by the refuelling run's lines
    if (!plan) return;
    if (plan.kind === 'aar') {
      buildRefuelPlan(plan, display);
      return;
    }
    const { u, r } = plan;
    if (display.showLines) {
      const o = plan.orbit;
      for (const pts of orbitOutline(plan)) planGroup.add(line(pts.map((q) => ({ ...q, z: o.msl })), lineMat(COLOURS.plan, true)));
      const ip = { ...plan.ip, z: plan.runInMsl };
      planGroup.add(dot(ip, COLOURS.ip, 20));
      planGroup.add(line([ip, { ...ip, z: plan.groundAt(ip.x, ip.y) }], lineMat(COLOURS.ip, true)));
      marks.push({ words: `IP ${(plan.ipFt / FT_PER_NM).toFixed(1)} NM`, p: ip });
      const along = plan.run === 'bombDive' ? plan.dive.rollInAlong : plan.release.along;
      const end = { x: u.x * along + r.x * plan.offsetFt, y: u.y * along + r.y * plan.offsetFt, z: plan.runInMsl };
      planGroup.add(line([ip, end], lineMat(COLOURS.runIn)));
      if (plan.run === 'bombDive') {
        const { R, d, aimOff, rollInMsl } = plan.dive;
        const back = (rollInMsl - R.z) / -d.z;
        const start = { x: R.x - d.x * back, y: R.y - d.y * back, z: rollInMsl };
        planGroup.add(line([start, aimOff], lineMat(COLOURS.dive, true)));
        marks.push({ words: `Roll-in ${ft10(rollInMsl - plan.groundFt)} AGL`, p: start });
      } else if (plan.run === 'flyover') {
        planGroup.add(line([end, { x: u.x * 3000 + r.x * plan.offsetFt, y: u.y * 3000 + r.y * plan.offsetFt, z: plan.runInMsl }], lineMat(COLOURS.runIn, true)));
      }
    }
    if (display.showCarp && plan.release?.point) {
      planGroup.add(dot(plan.release.point, COLOURS.release, 14));
      marks.push({ words: `Release ${ft10(plan.release.point.z - plan.groundFt)} AGL`, p: plan.release.point });
    }
  }

  /** The refuelling run's lines: the anchor, the receiver's track to the roll-out point, the turn point and the roll-out point. */
  function buildRefuelPlan(plan, display) {
    if (!display.showLines) return;
    const o = refuelOutline(plan);
    planGroup.add(line(o.anchor, lineMat(COLOURS.plan, true)));
    planGroup.add(line(o.inbound, lineMat(COLOURS.tanker, true)));
    planGroup.add(line(o.track, lineMat(COLOURS.runIn)));
    planGroup.add(dot(o.turnStart, COLOURS.ip, 40));
    planGroup.add(dot(o.rollOut, COLOURS.rollOut, 40));
    planGroup.add(dot(o.start, COLOURS.runIn, 40));
    // RS-20: the offset, square to the track from the tanker's inbound track to the receiver's, at the turn point.
    planGroup.add(line([o.offset.a, o.offset.b], lineMat(COLOURS.ip)));
    const mid = { x: (o.offset.a.x + o.offset.b.x) / 2, y: (o.offset.a.y + o.offset.b.y) / 2, z: o.offset.a.z };
    marks.push({ words: 'Tanker turns here', p: o.turnStart }, { words: 'Roll-out point', p: o.rollOut },
      { words: `Offset ${(o.offset.ft / FT_PER_NM).toFixed(1)} NM ${o.offset.side}`, p: mid });
    if (o.runway) {
      // RS-19: CYMJ's runways, drawn by the shared airfield builder (ui-kit airfield3d.js, as the EP Tabletop draws them) at
      // the runway's height the flying uses, and the IP.
      showAirports(o.runway.a.z);
      marks.push({ words: `CYMJ ${o.runway.name}`, p: o.runway.a }, { words: 'IP', p: o.ip });
      planGroup.add(dot(o.ip, COLOURS.ip, 40));
    } else {
      marks.push({ words: 'Receiver starts', p: o.start });
    }
  }

  // ---- The airfields (the refuelling run's take-off, RS-19) ----
  let airports = null;
  let airportsKey = '';
  function showAirports(fieldFt) {
    const key = `${projection.lat}|${projection.lon}|${Math.round(fieldFt)}`;
    if (key !== airportsKey) {
      airports?.dispose();
      airports = buildAirports(THREE, { toXY: projection.toXY, scale: 1, groundFt: fieldFt, doc, halfFt: 60 * FT_PER_NM, liftFt: 1, aboveGround: true });
      scene.add(airports.root);
      airportsKey = key;
    }
    airports.root.visible = true;
  }

  // ---- The trails ----
  const trailGroup = new THREE.Group();
  scene.add(trailGroup);
  let trails = null; // { before, after, load, impact, nBefore, nAfter, releaseT, fall }
  let passMarks = []; // the refuelling run's turn range label (RS-20)
  function buildTrails(pass, display) {
    clearGroup(trailGroup);
    trails = null;
    passMarks = [];
    if (!pass || !display.showTrails) return;
    const tl = pass.flight.timeline;
    const aar = pass.plan.kind === 'aar';
    const relT = aar ? (pass.flight.events.rollOut ?? Infinity) : (pass.flight.release?.t ?? Infinity); // the refuelling run's join in green
    const before = [];
    const after = [];
    for (let i = 0; i < tl.t.length; i += TRAIL_EVERY) {
      const p = new THREE.Vector3(tl.x[i], tl.y[i], tl.z[i]);
      if (tl.t[i] <= relT) before.push(p);
      else {
        if (!after.length && before.length) after.push(before[before.length - 1]);
        after.push(p);
      }
    }
    const mk = (pts, color) => {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.length ? pts : [new THREE.Vector3()]), lineMat(color));
      l.frustumCulled = false;
      trailGroup.add(l);
      return l;
    };
    trails = { before: mk(before, COLOURS.trail), after: mk(after, COLOURS.escape), nBefore: before.length, nAfter: after.length, releaseT: relT, fall: pass.fall, load: null, impact: null, tanker: null };
    if (aar) {
      // RS-20: the turn range, a ring round the tanker's turn point and a line to where the receiver was when it turned.
      const tr = turnRangeLine(pass);
      if (tr) {
        const ringPts = [];
        for (let k = 0; k <= 96; k++) ringPts.push(new THREE.Vector3(tr.centre.x + tr.ft * Math.cos((k / 96) * Math.PI * 2), tr.centre.y + tr.ft * Math.sin((k / 96) * Math.PI * 2), tr.centre.z));
        const ring3 = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), lineMat(COLOURS.ip, true));
        ring3.computeLineDistances();
        trailGroup.add(ring3);
        trailGroup.add(line([tr.centre, tr.rcv], lineMat(COLOURS.ip)));
        passMarks = [{ words: `Turn range ${(tr.ft / FT_PER_NM).toFixed(1)} NM`, p: { x: (tr.centre.x + tr.rcv.x) / 2, y: (tr.centre.y + tr.rcv.y) / 2, z: tr.centre.z } }];
      }
      const tt = pass.tanker;
      const pts = [];
      for (let i = 0; i < tt.x.length; i += TRAIL_EVERY) pts.push(new THREE.Vector3(tt.x[i], tt.y[i], tt.z[i]));
      trails.tanker = mk(pts, COLOURS.tanker);
    }
    if (pass.fall) {
      const pts = pass.fall.path.map((q) => new THREE.Vector3(q.x, q.y, q.z));
      trails.load = mk(pts, COLOURS.load);
      if (pass.fall.impact) {
        const m = ring(30, 45, flatMat(COLOURS.release), 0);
        m.position.set(pass.fall.impact.x, pass.fall.impact.y, pass.fall.impact.z + 3);
        trailGroup.add(m);
        trails.impact = m;
      }
    }
  }
  function showTrails(t, tl) {
    if (!trails) return;
    const i = Math.floor(Math.max(0, t / (tl.t[1] - tl.t[0] || 0.05)) / TRAIL_EVERY) + 1;
    trails.before.geometry.setDrawRange(0, Math.min(trails.nBefore, i));
    trails.after.geometry.setDrawRange(0, Math.max(0, Math.min(trails.nAfter, i - trails.nBefore + 1)));
    trails.tanker?.geometry.setDrawRange(0, i);
    if (trails.load && trails.fall) {
      const since = t - trails.releaseT;
      const n = since <= 0 ? 0 : trails.fall.path.findIndex((q) => q.t > since);
      trails.load.geometry.setDrawRange(0, n < 0 ? trails.fall.path.length : n);
      if (trails.impact) trails.impact.visible = trails.fall.impact && since >= trails.fall.impact.t;
    }
  }

  // ---- The aircraft ----
  // The paint is the Display box's (RS-29, proposed): the RCAF Harvard, or the USAF or USN markings. A change builds the ship again.
  const makeShip = (shipPaint) => {
    const model = createCt156Model(THREE, { color: '#58a6ff', paint: shipPaint, number: 1 });
    model.scale.setScalar(CT156_FT_PER_UNIT);
    model.rotation.order = 'ZYX';
    return model;
  };
  let shipPaint = paint;
  let ship = makeShip(shipPaint);
  ship.visible = false;
  scene.add(ship);
  const cockpit = createCockpitMount(THREE, { doc });
  let hud = null;
  let gearSet = false; // the gear has been lowered for a take-off (RS-19); the run-in's passes never touch it
  // The refuelling run's tanker (RS-15): a picture only; shown with a refuelling pass.
  const tanker = createKc130j(THREE, { onReady: () => nudge() });
  tanker.group.visible = false;
  scene.add(tanker.group);

  // ---- Drawing ----
  const look = { yawDeg: 0, pitchDeg: 0 };
  let view = { camera: 'chase', pose: null, plan: null, groundFt: fallbackFt, trackDegT: 0, tankerPose: null, idleZ: null };
  let size = { w: 0, h: 0 };

  function aim(w, h) {
    const p = view.pose;
    camera.fov = CAMERA.fovDeg;
    camera.near = 2;
    camera.far = 400_000;
    camera.aspect = w / h;
    camera.up.set(0, 0, 1);
    const hdg = p ? p.headingRad : ((90 - view.trackDegT) * Math.PI) / 180;
    if (!p) {
      // Before a pass is flown: the target from back along the run-in, a little above.
      const lookZ = view.idleZ ?? view.groundFt; // the refuelling run: the roll-out point at the tanker's height
      camera.position.set(-Math.cos(hdg) * CAMERA.idleBackFt, -Math.sin(hdg) * CAMERA.idleBackFt, lookZ + CAMERA.idleUpFt);
      camera.lookAt(0, 0, lookZ);
      camera.updateProjectionMatrix();
      return;
    }
    const at = new THREE.Vector3(p.x, p.y, p.z);
    const yaw = (look.yawDeg * Math.PI) / 180;
    const pitch = (look.pitchDeg * Math.PI) / 180;
    if (view.camera === 'cockpit') {
      aimCockpitCamera(THREE, camera, ship, { seat: 'front', yawDeg: look.yawDeg, pitchDeg: look.pitchDeg - 5, width: w, height: h });
      return;
    }
    const tp = view.tankerPose;
    if ((view.camera === 'tanker' || view.camera === 'drogue') && tp) {
      // The refuelling run's two cameras (RS-18): from the tanker's tail at the receiver, or behind the left basket up the hose.
      camera.fov = AAR_CAMERA.fovDeg;
      const f = { x: Math.cos(tp.headingRad), y: Math.sin(tp.headingRad) };
      if (view.camera === 'tanker') {
        camera.position.set(tp.x - f.x * AAR_CAMERA.tankerBackFt, tp.y - f.y * AAR_CAMERA.tankerBackFt, tp.z + AAR_CAMERA.tankerUpFt);
        camera.lookAt(at);
      } else {
        const l = { x: -f.y, y: f.x };
        const down = (DROGUE.hoseDownDeg * Math.PI) / 180;
        const back = DROGUE.hoseFt * Math.cos(down) - DROGUE.podTailAheadFt;
        const b = { x: tp.x - f.x * back + l.x * DROGUE.podOutFt, y: tp.y - f.y * back + l.y * DROGUE.podOutFt, z: tp.z + DROGUE.podUpFt - DROGUE.hoseFt * Math.sin(down) };
        camera.position.set(b.x - f.x * AAR_CAMERA.drogueBackFt, b.y - f.y * AAR_CAMERA.drogueBackFt, b.z + AAR_CAMERA.drogueUpFt);
        camera.lookAt(b.x + f.x * 30, b.y + f.y * 30, b.z + 4);
      }
      camera.rotateY(-yaw);
      camera.rotateX(pitch);
    } else if (view.camera === 'target') {
      camera.fov = CAMERA.targetFovDeg;
      const top = view.groundFt + (view.topFt ?? 0) + CAMERA.targetUpFt;
      camera.position.set(-Math.cos(hdg) * 60, -Math.sin(hdg) * 60, top);
      camera.lookAt(at);
      camera.rotateY(-yaw);
      camera.rotateX(pitch);
    } else if (view.camera === 'overhead') {
      camera.position.set(at.x, at.y - 1, at.z + CAMERA.overheadFt);
      camera.up.set(0, 1, 0);
      camera.lookAt(at);
    } else if (view.camera === 'side') {
      const tr = ((90 - view.trackDegT) * Math.PI) / 180;
      const right = { x: Math.sin(tr), y: -Math.cos(tr) }; // right of the run-in
      camera.position.set(at.x + right.x * CAMERA.sideFt, at.y + right.y * CAMERA.sideFt, at.z);
      camera.lookAt(at);
    } else {
      const a = hdg + Math.PI + yaw;
      const back = CAMERA.chaseBackFt;
      const up = CAMERA.chaseUpFt + Math.sin(pitch) * back;
      camera.position.set(at.x + Math.cos(a) * back * Math.cos(pitch), at.y + Math.sin(a) * back * Math.cos(pitch), at.z + up);
      camera.lookAt(at);
    }
    camera.updateProjectionMatrix();
  }

  function placeLabels(w, h) {
    const own = view.tankerPose && (view.camera === 'tanker' || view.camera === 'drogue');
    const items = own ? [] : [...marks, ...passMarks];
    // From afar (Target, Overhead, Side) the aircraft is a speck: a label shows where it is.
    if (view.tankerPose && view.pose) {
      // The refuelling run: each aircraft labelled when it is far from the camera.
      const far = (p) => camera.position.distanceTo(new THREE.Vector3(p.x, p.y, p.z)) > AAR_CAMERA.labelFt;
      if (far(view.pose)) items.push({ words: '▲ Stand-in receiver (CT-156)', p: view.pose });
      if (far(view.tankerPose)) items.push({ words: '▲ KC-130J tanker', p: view.tankerPose });
    } else if (view.pose && ['target', 'overhead', 'side'].includes(view.camera)) items.push({ words: '▲ CT-156', p: view.pose });
    if (trails?.impact?.visible && trails.fall?.impact) items.push({ words: 'Impact', p: trails.fall.impact });
    while (labels.children.length < items.length) labels.append(doc.createElement('span'));
    /** @type {HTMLElement[]} */ ([...labels.children]).forEach((el, i) => {
      const m = items[i];
      if (!m) {
        el.hidden = true;
        return;
      }
      const v = new THREE.Vector3(m.p.x, m.p.y, m.p.z).applyMatrix4(camera.matrixWorldInverse);
      if (v.z > -1) {
        el.hidden = true;
        return;
      }
      const s = worldToScreen(THREE, camera, m.p, w, h);
      el.hidden = s.x < 0 || s.y < 0 || s.x > w || s.y > h;
      el.textContent = m.words;
      el.style.transform = `translate(${Math.round(s.x + 8)}px, ${Math.round(s.y - 10)}px)`;
    });
  }

  function draw() {
    if (disposed) return;
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    if (w !== size.w || h !== size.h) {
      size = { w, h };
      renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
      renderer.setSize(w, h, false);
    }
    if (terrain.revision !== reliefRevision && terrain.grids) {
      reliefRevision = terrain.revision;
      ground.setRelief({ grids: terrain.grids, on: true, scale: 1, homeFt });
    }
    if (groundDirty) {
      groundDirty = false;
      ground.paint({ projection: groundProjection });
    }
    const inCockpit = view.camera === 'cockpit' && view.pose;
    cockpit.mount(inCockpit ? ship : null, 'front');
    if (inCockpit) cockpit.update(hud);
    aim(w, h);
    camera.updateMatrixWorld(true);
    renderer.render(scene, camera);
    placeLabels(w, h);
  }

  // Drag to look round (Chase, Cockpit and Target); double-click looks ahead again. The camera never moves on a click.
  let drag = null;
  const onDown = (e) => {
    drag = { x: e.clientX, y: e.clientY, yaw: look.yawDeg, pitch: look.pitchDeg };
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag) return;
    look.yawDeg = Math.max(-170, Math.min(170, drag.yaw - (e.clientX - drag.x) * DRAG_DEG_PER_PX));
    look.pitchDeg = Math.max(-60, Math.min(60, drag.pitch + (e.clientY - drag.y) * DRAG_DEG_PER_PX));
    draw();
  };
  const onUp = () => {
    drag = null;
  };
  const ahead = () => {
    look.yawDeg = 0;
    look.pitchDeg = 0;
    draw();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('dblclick', ahead);
  const resizer = globalThis.ResizeObserver ? new globalThis.ResizeObserver(() => draw()) : null;
  resizer?.observe(host);

  return {
    /** A new place (or the refuelling run's ground centre): area.js areaFor()'s; the ground repainted round it. fallback: the height where no tile came. */
    setArea(nextArea, nextFallbackFt) {
      projection = nextArea.projection;
      groundProjection = nextArea.ground?.projection ?? projection;
      groundOffset = nextArea.ground?.offset ?? { x: 0, y: 0 };
      ground.group.position.x = groundOffset.x;
      ground.group.position.y = groundOffset.y;
      airportsKey = ''; // the airfields are placed again in the new frame
      homeFt = nextFallbackFt;
      ground.setHeight(homeFt);
      groundDirty = true;
      reliefRevision = -1;
    },
    /** The target shape on the ground: { id, sizeFt, headingDegT, groundFt, dressed, anthem }, or null (the refuelling run has none). */
    setTarget(t) {
      buildTarget(t);
      if (t) view = { ...view, groundFt: t.groundFt, topFt: targetSizes(t.id, t.sizeFt).topFt };
    },
    /** The planned lines (pass.js buildPlan's plan) with the Display box's switches. */
    setPlan(plan, display) {
      buildPlan(plan, display);
      const aar = plan?.kind === 'aar';
      view = { ...view, trackDegT: plan ? (aar ? plan.aar.trackDegT : plan.setup.trackDegT) : view.trackDegT, idleZ: aar ? plan.H : null };
    },
    /** The flown pass (pass.js flyPass's), or null; its trails. */
    setPass(pass, display) {
      buildTrails(pass, display);
      ship.visible = Boolean(pass);
      tanker.group.visible = pass?.plan.kind === 'aar';
      if (!tanker.group.visible) view.tankerPose = null;
    },
    /** The picture at time t (s) of the pass, from camera id. */
    show(pass, t, cameraId) {
      view = { ...view, camera: cameraId };
      if (pass) {
        const tl = pass.flight.timeline;
        const dt = tl.t[1] - tl.t[0] || 0.05;
        const f = Math.max(0, Math.min(tl.t.length - 1, t / dt));
        const i = Math.min(tl.t.length - 2, Math.floor(f));
        const k = Math.max(0, Math.min(1, f - i));
        const at = (a) => a[i] + (a[i + 1] - a[i]) * k;
        const vx = at(tl.vx), vy = at(tl.vy), vz = at(tl.vz);
        const v = Math.hypot(vx, vy, vz);
        const climbDeg = (Math.atan2(vz, Math.hypot(vx, vy)) * 180) / Math.PI;
        const bankDeg = tl.bank[i] + (((tl.bank[i + 1] - tl.bank[i] + 540) % 360) - 180) * k;
        const kias = at(tl.kias);
        const g = at(tl.g);
        const attitude = attitudeDegFromClimb(vz, v, kias, g);
        const pitchDeg = climbDeg + (attitude - climbDeg) * Math.cos((bankDeg * Math.PI) / 180); // the nose's angle of attack turns with the bank
        const headingRad = Math.atan2(vy, vx);
        view.pose = { x: at(tl.x), y: at(tl.y), z: at(tl.z), headingRad };
        ship.position.set(view.pose.x, view.pose.y, view.pose.z);
        ship.rotation.set((bankDeg * Math.PI) / 180, (-pitchDeg * Math.PI) / 180, headingRad, 'ZYX');
        hud = { pitchDeg, bankDeg, altFt: view.pose.z, kias, headingDeg: (((90 - (headingRad * 180) / Math.PI) % 360) + 360) % 360, g, vsFpm: vz * 60 };
        // The gear (RS-19): down on the runway, coming up a few seconds after lift-off over the model's travel time (the
        // seconds before it starts up are an estimate); up for every other pass, as before.
        const liftOff = pass.plan.takeoff ? pass.flight.events.takeoff : undefined;
        if (liftOff !== undefined || gearSet) {
          gearSet = liftOff !== undefined;
          setGear(ship, liftOff === undefined ? 0 : Math.max(0, Math.min(1, 1 - (t - liftOff - GEAR_UP_AFTER_SEC) / CT156_GEAR_TRAVEL_S)));
        }
        if (pass.tanker) {
          // The tanker at the same moment (RS-15): its nose along its air velocity, its bank from its turn, a little nose up.
          const tt = pass.tanker;
          const tk = { x: at(tt.x), y: at(tt.y), z: at(tt.z), headingRad: Math.atan2(at(tt.vy), at(tt.vx)) };
          const tb = at(tt.bank);
          view.tankerPose = tk;
          tanker.group.position.set(tk.x, tk.y, tk.z);
          tanker.group.rotation.set((tb * Math.PI) / 180, (-AAR_CAMERA.noseUpDeg * Math.PI) / 180, tk.headingRad, 'ZYX');
        }
        showTrails(t, tl);
        // RS-28: the fireworks start at the anthem's last note (the same moment as the time line's mark) and only with an anthem.
        const note = pass.anthem ? (pass.result.arrivalSec ?? pass.flight.events.release) : null;
        stadium?.setFireworks(Number.isFinite(note) ? t - note : null);
      } else {
        view.pose = null;
        stadium?.setFireworks(null);
      }
      draw();
    },
    /** The aircraft's paint (RS-29, proposed): 'harvard', 'usaf' or 'usn'; the ship is built again where it was. The caller redraws (show). */
    setPaint(next) {
      if (next === shipPaint) return;
      shipPaint = next;
      const old = ship;
      cockpit.mount(null, 'front'); // the cockpit group lets go of the old ship first
      ship = makeShip(next);
      ship.position.copy(old.position);
      ship.rotation.copy(old.rotation);
      ship.visible = old.visible;
      scene.add(ship);
      scene.remove(old);
      disposeCt156Model(old);
      gearSet = true; // the new ship's gear is set again at the next picture (show) if the pass has a take-off
    },
    redraw: draw,
    /** Something changed on the ground (a tile arrived): a fresh picture soon. */
    nudge,
    dispose() {
      disposed = true;
      wake?.();
      resizer?.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('dblclick', ahead);
      cockpit.dispose();
      tanker.dispose();
      airports?.dispose();
      stadium?.dispose();
      clearGroup(targetGroup);
      clearGroup(planGroup);
      clearGroup(trailGroup);
      for (const thing of owned) thing.dispose?.();
      ground.dispose();
      sky.dispose();
      renderer.dispose();
      canvas.remove();
      labels.remove();
    },
  };
}
