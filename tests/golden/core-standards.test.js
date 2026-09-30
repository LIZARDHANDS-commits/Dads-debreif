// Golden test (R9): src/core/standards.js against the debrief's standards
// (classifyKmlError, classifyLeadDesired, kmlStandardsSummary) and Turn Sim's
// classifyFormationError, run on the same formations. The one change from V6
// is D78 (#21): #3's fore/aft with both standards on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { V6_STANDARDS, classifyDebriefPosition, classifyLeadParameters, standardsSummaryLines, classifyTurnSimPosition } from '../../src/core/standards.js';
import { gFromTrack } from '../../src/core/flight-math.js';
import { loadV6, v6Number, v6Page, v6FunctionText } from './v6-source.js';
import { seeded, recordedTrack } from './inputs.js';

/** V6 gives no sweep angle (D116) or speed block (D115), so the comparison leaves them out; V6's own checks are pinned. */
function v6Fields(result) {
  if (!result) return result;
  const { sweepDeg, block, ...rest } = result;
  return rest;
}

// ── The debrief ──

function debriefV6() {
  return loadV6(['interpTrack', 'headingAtTrack', 'normAngleRad', 'estimatedGAtTrack', 'kmlAxes', 'numSetting', 'settingOn',
    'classifyKmlError', 'classifyLeadDesired', 'kmlStandardsSummary'], {
    prelude: `const KML_KT_PER_FPS=${v6Number('KML_KT_PER_FPS')}; let tracks={}, kmlT=0, dom={};
      const el=id=>dom[id]||null;
      function setDebrief(s){ tracks=s.tracks; kmlT=s.kmlT; dom=s.dom; }`,
    expose: ['setDebrief'],
  });
}

const BOXES = {
  spread: ['kmlStdSpread', { minFt: 'kmlSpreadMin', maxFt: 'kmlSpreadMax', foreAftTolFt: 'kmlForeAftTol' }],
  offset: ['kmlStdOffset', { aftTargetFt: 'kmlOffsetAftTarget', aftTolFt: 'kmlOffsetAftTol' }],
  lead: ['kmlStdLead', { targetKt: 'kmlLeadTargetKt', speedTolKt: 'kmlLeadSpeedTol', targetG: 'kmlLeadTargetG', gTol: 'kmlLeadGTol' }],
};

/** Random standards settings as V6's boxes hold them: on/off, a typed number, or a box left empty. */
function randomBoxes(r) {
  const dom = {};
  for (const [group, [sw, fields]] of Object.entries(BOXES)) {
    dom[sw] = { value: r() < 0.75 ? 'on' : 'off' };
    for (const [key, id] of Object.entries(fields)) {
      const base = V6_STANDARDS[group][key];
      const pick = r();
      dom[id] = { value: pick < 0.4 ? String(base) : pick < 0.9 ? String(+(base * (0.3 + 1.4 * r())).toFixed(2)) : '' };
    }
  }
  return dom;
}

/** What the screen passes core: the boxes read the way V6 reads them (numSetting, settingOn). */
function standardsFromBoxes(dom) {
  const std = {};
  for (const [group, [sw, fields]] of Object.entries(BOXES)) {
    std[group] = { on: !dom[sw] || dom[sw].value !== 'off' };
    for (const [key, id] of Object.entries(fields)) {
      const v = dom[id] ? parseFloat(dom[id].value) : NaN;
      std[group][key] = Number.isFinite(v) ? v : V6_STANDARDS[group][key];
    }
  }
  return std;
}

/** Wingmen scattered around Lead, sometimes right on the standard's edges, sometimes missing. */
function randomFormation(r, lead, hdg) {
  const fwd = { x: Math.cos(hdg), y: Math.sin(hdg) }, right = { x: Math.cos(hdg + Math.PI / 2), y: Math.sin(hdg + Math.PI / 2) };
  const at = (lat, fa) => ({ x: lead.x + right.x * lat + fwd.x * fa, y: lead.y + right.y * lat + fwd.y * fa, spdKt: 200 });
  const edges = [0, 250, -250, 4000, 6000, -4000, -6000, 8000, -7000, -9000, 500, -500];
  const pick = () => (r() < 0.2 ? edges[Math.floor(r() * edges.length)] : -12000 + 24000 * r());
  const live = { 1: lead };
  for (const id of [2, 3, 4]) if (r() < 0.9) live[id] = at(pick(), pick());
  if (live[3] && live[4] && r() < 0.3) live[4] = at(across(live[3]) + 5000 * Math.sign(across(live[3]) || 1), -8000);
  return live;
  function across(p) { return (p.x - lead.x) * right.x + (p.y - lead.y) * right.y; }
}

test('classifyDebriefPosition matches classifyKmlError, and the lead and summary match too', () => {
  const v6 = debriefV6();
  const r = seeded(31);
  const seen = new Set();
  for (let i = 0; i < 600; i++) {
    const leadTrack = recordedTrack(1, r);
    const kmlT = leadTrack.pts[0].t + (leadTrack.pts.at(-1).t - leadTrack.pts[0].t) * r();
    const tracks = i % 10 ? { 1: leadTrack } : {}; // with no Lead track V6 uses heading 0
    const lead = { ...v6.interpTrack(leadTrack, kmlT) };
    if (r() < 0.3) lead.gNative = 0.5 + 2 * r();
    if (r() < 0.1) lead.spdKt = undefined;
    const leadHdg = tracks[1] ? v6.headingAtTrack(leadTrack, kmlT) : 0;
    const live = randomFormation(r, lead, leadHdg);
    if (i % 25 === 0) delete live[1];
    const dom = randomBoxes(r);
    v6.setDebrief({ tracks, kmlT, dom });
    const std = standardsFromBoxes(dom);

    for (const id of [1, 2, 3, 4]) {
      // D78: with both standards on, #3's fore/aft is the offset standard's alone. That is V6
      // with the spread's fore/aft tolerance so large it never fires; everything else is V6.
      const d78 = id === 3 && std.spread.on && std.offset.on;
      const v6Labels = v6.classifyKmlError(id, live)?.labels.join(' / ');
      const faTol = dom.kmlForeAftTol;
      if (d78) dom.kmlForeAftTol = { value: '1e300' };
      const want = v6.classifyKmlError(id, live);
      dom.kmlForeAftTol = faTol;
      assert.deepEqual(v6Fields(classifyDebriefPosition(id, live, leadHdg, std)), want, `case ${i}, #${id}`);
      if (want) seen.add(`${d78 ? '#3 both on: ' : ''}${want.labels.join(' / ')}`);
      if (want && want.labels.join(' / ') !== v6Labels) seen.add(`D78 changed ${v6Labels} to ${want.labels.join(' / ')}`);
    }
    // Lead's G: recorded if there is one, else estimated from Lead's track the way the debrief does it.
    const estG = tracks[1] ? v6.estimatedGAtTrack(leadTrack, kmlT) : null;
    assert.deepEqual(v6Fields(classifyLeadParameters(live[1], estG, std)), v6.classifyLeadDesired(live), `case ${i}, lead`);
    assert.equal(standardsSummaryLines(std).join('<br>'), v6.kmlStandardsSummary(live));
  }
  for (const labels of ['ON PARAMETERS', 'TIGHT', 'WIDE / AFT', 'TIGHT / FORE', '#3 both on: ON PARAMETERS', '#3 both on: FORE',
    '#3 both on: AFT', 'D78 changed AFT to ON PARAMETERS', 'D78 changed FORE / FORE to FORE', 'D78 changed AFT / FORE to FORE']) {
    assert.ok(seen.has(labels), `no case gave ${labels}`);
  }
});

test('the lead standard matches V6 exactly on its edges', () => {
  const v6 = debriefV6();
  v6.setDebrief({ tracks: {}, kmlT: 0, dom: {} });
  for (const spdKt of [189.99, 190, 190.01, 200, 209.99, 210, 210.01, 0, undefined]) {
    for (const gNative of [0.79, 0.8, 0.81, 1.2, 1.21, NaN, undefined]) {
      const lead = { x: 0, y: 0, spdKt, gNative };
      assert.deepEqual(v6Fields(classifyLeadParameters(lead, null)), v6.classifyLeadDesired({ 1: lead }), `${spdKt} kt, ${gNative} G`);
    }
  }
});

test('the estimated G the lead standard uses is gFromTrack, fed the way flight-data will', () => {
  // estimatedGAtTrack is pinned in core-flight-math.test.js; this ties the lead standard to it.
  const v6 = debriefV6();
  const r = seeded(32);
  const tr = recordedTrack(1, r);
  const time = tr.pts[5].t + 0.3;
  const t0 = Math.max(tr.pts[0].t, time - 1.5), t1 = Math.min(tr.pts.at(-1).t, time + 1.5);
  const ours = gFromTrack(v6.interpTrack(tr, t0), v6.headingAtTrack(tr, t0), v6.interpTrack(tr, t1), v6.headingAtTrack(tr, t1), t1 - t0);
  assert.equal(ours, v6.estimatedGAtTrack(tr, time));
});

// ── Turn Sim ──

function turnSimV6() {
  return loadV6(['formationAxes', 'classifyFormationError'], {
    marker: 'const FT_PER_NM=6076.12, KTS_TO_FPS',
    prelude: `let ac=[], form;
      const $=id=>(id==='formation' && form!==undefined ? { value: form } : null);
      function setTurnSim(fleet, f){ ac=fleet; form=f; }`,
    expose: ['setTurnSim'],
  });
}

test('classifyTurnSimPosition matches classifyFormationError with V6\'s numbers', () => {
  const v6 = turnSimV6();
  const r = seeded(33);
  const seen = new Set();
  for (let i = 0; i < 800; i++) {
    const hdg = 2 * Math.PI * r() - Math.PI;
    const lead = { id: 1, x: 5000 * r(), y: 5000 * r(), hdg };
    const live = randomFormation(r, lead, hdg);
    const fleet = [1, 2, 3, 4].filter(id => live[id]).map(id => ({ ...live[id], id, hdg }));
    const formation = [undefined, 'weighted', 'offsetBox', 'offsetBox', 'twoShip', 'fingertip'][i % 6];
    v6.setTurnSim(fleet, formation);
    for (const a of fleet) {
      const want = v6.classifyFormationError(a);
      const got = formation === undefined ? classifyTurnSimPosition(a, fleet) : classifyTurnSimPosition(a, fleet, formation);
      assert.deepEqual(v6Fields(got), want, `case ${i}, ${formation}, #${a.id}`);
      seen.add(`${formation === 'offsetBox' ? 'box' : 'spread'} ${want.labels.join(' / ')}`);
    }
  }
  for (const labels of ['spread ON SPACING', 'box ON SPACING', 'box FORE / WIDE', 'box AFT', 'spread WIDE / AFT', 'box TIGHT / FORE']) {
    assert.ok(seen.has(labels), `no case gave ${labels}`);
  }
});

test('Turn Sim\'s written-in numbers are V6_STANDARDS', () => {
  const body = v6FunctionText('classifyFormationError', { marker: 'const FT_PER_NM=6076.12, KTS_TO_FPS' });
  for (const n of ['interval<4000', 'interval>6000', 'foreAft>250', 'foreAft<-250', 'aftDistance<7000', 'aftDistance>9000',
    'foreAftFrom3>250', 'foreAftFrom3<-250', 'minLat-500', 'maxLat+500', 'Math.abs(lat3)>500']) assert.ok(body.includes(n), n);
  const { spread, offset } = V6_STANDARDS;
  assert.deepEqual([spread.minFt, spread.maxFt, spread.foreAftTolFt, offset.aftTargetFt - offset.aftTolFt, offset.aftTargetFt + offset.aftTolFt], [4000, 6000, 250, 7000, 9000]);
});

test('V6_STANDARDS are the debrief boxes\' defaults, and cannot be changed by accident', () => {
  // The code's fallbacks …
  assert.deepEqual(standardsFromBoxes({}), JSON.parse(JSON.stringify(V6_STANDARDS)));
  // … and the values the page's boxes start with.
  for (const [group, [sw, fields]] of Object.entries(BOXES)) {
    assert.match(v6Page(), new RegExp(`<select id="${sw}"><option value="on" selected>`));
    for (const [key, id] of Object.entries(fields)) {
      const m = new RegExp(`<input id="${id}" type="number" value="([0-9.]+)"`).exec(v6Page());
      assert.equal(Number(m[1]), V6_STANDARDS[group][key], id);
    }
  }
  assert.throws(() => { V6_STANDARDS.spread.minFt = 1; }, TypeError);
});
