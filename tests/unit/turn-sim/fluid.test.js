// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// ============================================================================

// Fluid manoeuvring (spec section 10.3, TS-57, TS-59, TS-60). What a pilot would recognise, with the numbers written
// out here from their sources, not read from the code:
//  - it starts only from fighting wing (Patrick 21:44Z);
//  - all the time: G positive, nothing jumps, nobody rolls faster than 90°/s (TS-37), #2 outside the 500 ft bubble
//    (SMM 16.17 para 44c) and behind Lead's 3/9 line (never in front of him);
//  - the cone is the wingman's aim, not a wall (Patrick 23:02Z; SMM 16.17 paras 42-43): he may drift during a manoeuvre,
//    and when it ends he is back in it, at the distance set (600 ft, Patrick's pick 19:20Z row 3, shared ±100 ft) and
//    15° off Lead's tail (Patrick 22:28Z, shared ±5°), inside the 60° cone, 30° either side (Patrick's pick row 2);
//  - Lead's level turn is level (shared ±100 ft); Terminate ends with the pair in fighting wing (Patrick's pick row 7);
//  - climb and descend (V2.18): Lead climbs or descends and levels off;
//  - the loop (V2.18): over the top and back to level on Lead's heading at about 230 KIAS (SMM 7.5, Table 7.1);
//  - the side swap (V2.19): through a hard reversal #2 may change sides, and only behind Lead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormation } from '../../../src/modules/turn-sim/live/formation.js';
import { judgeFormation } from '../../../src/modules/turn-sim/live/transitions.js';
import { checkFluidRange } from '../../../src/modules/turn-sim/live/fluid.js';
import { TOLERANCES } from '../../helpers/tolerances.js';

const BUBBLE_FT = 500; // SMM 16.17 para 44c; Gen Book p.11
const CONE_HALF_DEG = 30; // Patrick 19:20Z row 2
const HOLD_DEG = 15; // Patrick 22:28Z ("lets go with hold 15")
const SET_FT = 600; // Patrick 19:20Z row 3 (the default)
const ROLL_MAX_DPS = 90; // TS-37
const ROLL_SLACK_DPS = 0.5; // rounding of the eased roll
const DEG = Math.PI / 180;

/** A 2-ship flown from the default start into fighting wing (a generous 3 minutes: TS-53's change limit). */
function inFightingWing() {
  const f = createFormation();
  assert.equal(f.change('fw'), 'started');
  for (let i = 0; i < 3600 && f.state.current; i++) f.step();
  assert.equal(f.where().key, 'fw');
  return f;
}

/** Flies sec seconds, watching #2 against Lead once he is in the cone (after the entry's blend). */
function fly(f, sec, watch) {
  for (let i = 0; i < Math.round(sec / 0.05); i++) {
    const before = f.state.aircraft.map((a) => ({ g: a.g }));
    f.step();
    if (!f.state.fluid) break;
    watch?.(f, before);
  }
}

/**
 * What is always true in fluid manoeuvring, once #2 is in it (after the entry's blend, before Terminate's): G positive
 * for both, no G jumps (shared ±0.5 G a step), roll within 90°/s (TS-37), #2 outside the 500 ft bubble (SMM 16.17 para
 * 44c) and behind Lead's 3/9 line (aspect under 90°: never in front of him). Returns a watcher for fly().
 */
function alwaysTrue(failures) {
  return (f, before) => {
    const now = f.state.fluid.session.now();
    const [lead, wing] = f.state.aircraft;
    for (const [i, a] of [lead, wing].entries()) {
      if (a.g <= 0) failures.push(`${a.name} at ${a.g.toFixed(2)} G`);
      if (Math.abs(a.rollRateDps) > ROLL_MAX_DPS + ROLL_SLACK_DPS) failures.push(`${a.name} rolling ${Math.round(a.rollRateDps)}°/s`);
      if (Math.abs(a.g - before[i].g) > TOLERANCES.G_FORCE) failures.push(`${a.name}'s G jumped ${before[i].g.toFixed(2)} to ${a.g.toFixed(2)}`);
    }
    if (now.wingCue === 'entry' || now.wingCue === 'back to fighting wing') return;
    const r = f.state.fluid.readouts;
    if (r.rangeFt < BUBBLE_FT) failures.push(`inside the bubble, ${Math.round(r.rangeFt)} ft`);
    if (r.aspectDeg >= 90) failures.push(`#2 ahead of Lead's 3/9 line, aspect ${Math.round(r.aspectDeg)}°`);
  };
}

/**
 * When a manoeuvre is over, #2 is back in the cone (Patrick 23:02Z: "when you finish you reset to the cone"): at the
 * distance set within the shared ±100 ft and 15° off Lead's tail within the shared ±5° (Patrick 22:28Z), on either side.
 */
function assertBackInTheCone(f, what) {
  const r = f.state.fluid.readouts;
  assert.ok(Math.abs(r.rangeFt - SET_FT) <= TOLERANCES.DISTANCE_FT, `${what}: range ${Math.round(r.rangeFt)} ft, set ${SET_FT}`);
  assert.ok(Math.abs(r.aspectDeg - HOLD_DEG) <= TOLERANCES.ANGLE_DEG, `${what}: aspect ${r.aspectDeg.toFixed(1)}°, hold ${HOLD_DEG}°`);
  assert.ok(r.aspectDeg <= CONE_HALF_DEG, `${what}: inside the cone`);
}

test('fluid manoeuvring starts only from fighting wing', () => {
  const f = createFormation(); // the default start, line abreast
  assert.equal(f.change('fluid'), 'refused');
  assert.ok(f.state.refusal);
  assert.equal(f.state.fluid, null);
  const g = inFightingWing();
  assert.equal(g.change('fluid'), 'started');
  assert.equal(g.where().key, 'fluid');
  const four = createFormation({ ships: 4 });
  assert.equal(four.change('fluid'), 'refused'); // the four's fluid manoeuvring is a later piece
});

test('a level turn and a reversal: Lead stays level, nothing jumps, and #2 is back in the cone once the turn is steady', () => {
  const f = inFightingWing();
  f.change('fluid');
  const failures = [];
  const watch = alwaysTrue(failures);
  fly(f, 30, watch); // the entry (a Lead press during it would wait)
  const alt0 = f.state.aircraft[0].altAboveFt;
  assert.equal(f.pressFluid('levelTurn', -1), 'started');
  fly(f, 30, watch);
  const lead = f.state.aircraft[0];
  assert.ok(lead.bankDeg < -45, `Lead in a right turn, bank ${Math.round(lead.bankDeg)}`);
  assert.equal(f.pressFluid('reversal'), 'started');
  fly(f, 30, watch);
  assert.ok(lead.bankDeg > 45, `Lead reversed to the left, bank ${Math.round(lead.bankDeg)}`);
  assert.ok(Math.abs(lead.altAboveFt - alt0) <= TOLERANCES.DISTANCE_FT, `Lead held his height (${Math.round(lead.altAboveFt - alt0)} ft)`);
  assertBackInTheCone(f, 'after the reversal');
  assert.deepEqual(failures.slice(0, 5), []);
});

test('in a steady level turn, into #2 or away from him, #2 holds 15° off Lead\'s current tail', () => {
  // Patrick 22:28Z ("lets go with hold 15"): 15° off Lead's current tail line on #2's side; shared ±5° margin. A turn
  // is steady after about 15 s (the roll-in and #2's catch-up of a few seconds; a generous limit).
  const f = inFightingWing();
  f.change('fluid');
  fly(f, 30);
  for (const dir of [-1, 1]) {
    f.pressFluid('levelTurn', dir);
    fly(f, 20);
    const r = f.state.fluid.readouts;
    assert.ok(Math.abs(r.aspectDeg - HOLD_DEG) <= TOLERANCES.ANGLE_DEG, `turn ${dir > 0 ? 'left' : 'right'}: aspect ${r.aspectDeg.toFixed(1)}°`);
  }
});

test('Terminate brings the pair back to fighting wing', () => {
  const f = inFightingWing();
  f.change('fluid');
  fly(f, 30);
  f.pressFluid('levelTurn', 1);
  fly(f, 20);
  assert.equal(f.pressFluid('terminate'), 'started');
  fly(f, 120); // a generous 2 minutes: a gentle 90° turn, the roll-out and #2's move back
  assert.equal(f.state.fluid, null);
  assert.equal(f.where().key, 'fw');
  const [lead, wing] = f.state.aircraft;
  assert.ok(judgeFormation('fw', lead, wing).inBand);
});

test('a reversal needs a turn to reverse, and a distance outside 500-1,000 ft is refused', () => {
  const f = inFightingWing();
  f.change('fluid');
  fly(f, 30);
  f.pressFluid('wingsLevel');
  fly(f, 10);
  assert.equal(f.pressFluid('reversal'), 'refused');
  assert.ok(f.state.refusal);
  assert.equal(checkFluidRange(400).ok, false);
  assert.equal(checkFluidRange(1200).ok, false);
  assert.equal(checkFluidRange(750).ok, true);
});

test('climb and descend: Lead pitches up or down and levels off, G stays positive, and #2 ends back in the cone', () => {
  // Patrick's list and design 5.1 (Lead's climb and descend); #2 follows Lead's plane of motion (SMM 16.16 para 39c);
  // Lead keeps positive G (2 CFFTS Orders B2 ch 8 para 1a).
  const f = inFightingWing();
  f.change('fluid');
  const failures = [];
  const watch = alwaysTrue(failures);
  fly(f, 30, watch);
  f.pressFluid('wingsLevel');
  fly(f, 10, watch);
  const lead = f.state.aircraft[0];
  const alt0 = lead.altAboveFt;
  assert.equal(f.pressFluid('climb'), 'started');
  fly(f, 60, watch); // a generous minute to climb and level off
  assert.ok(lead.altAboveFt > alt0 + 1000, `Lead climbed (${Math.round(lead.altAboveFt - alt0)} ft)`);
  assert.ok(Math.abs(lead.climbFtps) < 5, `Lead levelled off (${lead.climbFtps.toFixed(1)} ft/s)`);
  assertBackInTheCone(f, 'after the climb');
  const alt1 = lead.altAboveFt;
  assert.equal(f.pressFluid('descend'), 'started');
  fly(f, 60, watch);
  assert.ok(lead.altAboveFt < alt1 - 1000, `Lead descended (${Math.round(lead.altAboveFt - alt1)} ft)`);
  assert.ok(Math.abs(lead.climbFtps) < 5, `Lead levelled off (${lead.climbFtps.toFixed(1)} ft/s)`);
  assertBackInTheCone(f, 'after the descent');
  assert.deepEqual(failures.slice(0, 5), []);
});

test('the loop: Lead goes over the top and back to level on his heading at about 230 KIAS; G positive, no jumps, #2 ends back in the cone', () => {
  // SMM 7.5 paras 10-13 and Fig 7.2: entry and exit 230 KIAS (Table 7.1), wings level, the track kept on the reference
  // line; EFIG p.171: about 100-120 KIAS over the top. Margins: the shared ±10 kt and ±5°. #2: SMM 16.17 para 42 (500 to
  // 1,000 ft, the cone) at the distance set; G kept positive (2 CFFTS Orders B2 ch 8 para 1a, for Lead).
  const f = inFightingWing();
  f.change('fluid');
  const failures = [];
  const watch = alwaysTrue(failures);
  fly(f, 30, watch);
  const lead = f.state.aircraft[0];
  f.pressFluid('wingsLevel');
  fly(f, 5, watch);
  const h0 = lead.headingRad;
  const alt0 = lead.altAboveFt;
  assert.notEqual(f.pressFluid('loop'), 'refused');
  let top = -Infinity;
  let slowest = Infinity;
  let inverted = false;
  let speeds = null;
  fly(f, 120, (ff, before) => { // a generous 2 minutes: the speed set-up and a loop of about half a minute
    watch(ff, before);
    const now = ff.state.fluid.session.now();
    if (now.key === 'loop') {
      top = Math.max(top, lead.altAboveFt);
      slowest = Math.min(slowest, lead.kias);
      if (Math.abs(lead.bankDeg) > 150) inverted = true;
    }
    if (now.speeds?.exitKias != null) speeds = now.speeds;
  });
  assert.ok(inverted, 'Lead went over the top inverted');
  assert.ok(top > alt0 + 1000, `Lead went up (${Math.round(top - alt0)} ft)`);
  assert.ok(speeds, 'the loop finished with its entry and exit speeds');
  assert.ok(Math.abs(speeds.entryKias - 230) <= TOLERANCES.AIRSPEED_KT, `entry ${Math.round(speeds.entryKias)} KIAS`);
  assert.ok(Math.abs(speeds.exitKias - 230) <= TOLERANCES.AIRSPEED_KT, `exit ${Math.round(speeds.exitKias)} KIAS`);
  assert.ok(slowest >= 100 - TOLERANCES.AIRSPEED_KT && slowest <= 120 + TOLERANCES.AIRSPEED_KT, `${Math.round(slowest)} KIAS over the top`);
  const dh = Math.abs(Math.atan2(Math.sin(lead.headingRad - h0), Math.cos(lead.headingRad - h0))) / (Math.PI / 180);
  assert.ok(dh <= TOLERANCES.ANGLE_DEG, `Lead back on his heading (${dh.toFixed(1)}° off)`);
  assert.ok(Math.abs(lead.bankDeg) < TOLERANCES.ANGLE_DEG, 'Lead wings level after the loop');
  assertBackInTheCone(f, 'after the loop');
  assert.deepEqual(failures.slice(0, 5), []);
});

test('the side swap: through a hard reversal #2 may cross to the other side, only behind Lead, and ends 15° off his tail', () => {
  // Patrick 19:21Z and 22:28Z: #2 can swap sides when it makes sense for spacing, crossing behind Lead's tail (never in
  // front: aspect stays under 90° throughout, alwaysTrue), with positive G and no jumps. The steep bank (70/3, SMM 16.18
  // para 50) gives the hardest reversal; 25 s is a generous time for the reversal and the swap to settle.
  const f = inFightingWing();
  f.setFluid({ bank: 'steep' });
  f.change('fluid');
  const failures = [];
  const watch = alwaysTrue(failures);
  let crossedAt = null;
  let side = null;
  fly(f, 30, watch);
  for (const [key, what] of [['levelTurn', 'in the right turn'], ['reversal', 'after the reversal']]) {
    assert.equal(f.pressFluid(key, -1), 'started');
    fly(f, 25, (ff, before) => {
      watch(ff, before);
      // Which side of Lead's tail #2 is on (Lead's level frame): if it changes, he is crossing; note his aspect there.
      const [lead, wing] = ff.state.aircraft;
      const left = -(wing.xFt - lead.xFt) * Math.sin(lead.headingRad) + (wing.yFt - lead.yFt) * Math.cos(lead.headingRad);
      const s = Math.sign(left);
      if (side !== null && s !== side) crossedAt = Math.max(crossedAt ?? 0, ff.state.fluid.readouts.aspectDeg);
      side = s;
    });
    assertBackInTheCone(f, what);
  }
  if (crossedAt !== null) assert.ok(crossedAt <= CONE_HALF_DEG, `#2 crossed behind Lead, aspect ${crossedAt.toFixed(1)}° at the cross`);
  assert.deepEqual(failures.slice(0, 5), []);
});

test('the wingovers: about 45° up and down, up to 120° of bank, about 3 G, out 180° from the entry and back on it; #2 ends back in the cone', () => {
  // SMM 16.17 para 47: entry about 230 KIAS, about 45° of pitch above and below the horizon (the flight path, not the
  // nose), up to 120° of bank, about 3 G, the first wingover out on a heading about 180° from the entry, the second the
  // other way. Shared margins: ±5°, ±10 kt, ±0.5 G. Two minutes is generous for the set-up and the two wingovers.
  const f = inFightingWing();
  f.change('fluid');
  const failures = [];
  const watch = alwaysTrue(failures);
  fly(f, 30, watch);
  const lead = f.state.aircraft[0];
  f.pressFluid('wingsLevel');
  fly(f, 5, watch);
  const h0 = lead.headingRad;
  assert.notEqual(f.pressFluid('wingover', 1), 'refused');
  let up = -90;
  let down = 90;
  let bank = 0;
  let maxG = 0;
  let away = 0;
  let speeds = null;
  fly(f, 120, (ff, before) => {
    watch(ff, before);
    const now = ff.state.fluid.session.now();
    if (now.key === 'wingover') {
      const gamma = Math.asin(Math.max(-1, Math.min(1, lead.climbFtps / lead.tasFtps))) / DEG;
      up = Math.max(up, gamma);
      down = Math.min(down, gamma);
      bank = Math.max(bank, Math.abs(lead.bankDeg));
      maxG = Math.max(maxG, lead.g);
      away = Math.max(away, Math.abs(Math.atan2(Math.sin(lead.headingRad - h0), Math.cos(lead.headingRad - h0))) / DEG);
    }
    if (now.speeds?.exitKias != null) speeds = now.speeds;
  });
  assert.ok(Math.abs(up - 45) <= TOLERANCES.ANGLE_DEG, `${up.toFixed(1)}° up`);
  assert.ok(Math.abs(down + 45) <= TOLERANCES.ANGLE_DEG, `${(-down).toFixed(1)}° down`);
  assert.ok(bank <= 120 + TOLERANCES.ANGLE_DEG && bank > 90, `${bank.toFixed(0)}° of bank`);
  assert.ok(maxG <= 3 + TOLERANCES.G_FORCE, `Lead pulled ${maxG.toFixed(2)} G`);
  assert.ok(away >= 180 - TOLERANCES.ANGLE_DEG, `the first wingover turned ${away.toFixed(0)}°`);
  assert.ok(speeds && Math.abs(speeds.entryKias - 230) <= TOLERANCES.AIRSPEED_KT, 'entered at about 230 KIAS');
  const dh = Math.abs(Math.atan2(Math.sin(lead.headingRad - h0), Math.cos(lead.headingRad - h0))) / DEG;
  assert.ok(dh <= TOLERANCES.ANGLE_DEG, `back on the entry heading (${dh.toFixed(1)}° off)`);
  assert.ok(Math.abs(lead.bankDeg) < TOLERANCES.ANGLE_DEG, 'Lead wings level after the wingovers');
  assertBackInTheCone(f, 'after the wingovers');
  assert.deepEqual(failures.slice(0, 5), []);
});

test('the barrel roll: 45° up, level inverted 90° off the line, 45° down, back on the line at about 230 KIAS; #2 ends back in the cone', () => {
  // SMM 14.8 para 19 and Fig 14.1; Table 14.1 (230 KIAS, 3 G); Patrick's picks 19:20Z rows 5 and 6 (level inverted at the
  // 90° point, about 45° of pitch; the brief's 60° pitch, AFM7 p.17, not passed). Shared margins: ±5°, ±10 kt. Two
  // minutes is generous for the set-up and a roll of about 20 s.
  const f = inFightingWing();
  f.change('fluid');
  const failures = [];
  const watch = alwaysTrue(failures);
  fly(f, 30, watch);
  const lead = f.state.aircraft[0];
  f.pressFluid('wingsLevel');
  fly(f, 5, watch);
  const h0 = lead.headingRad;
  assert.notEqual(f.pressFluid('barrelRoll', -1), 'refused');
  let up = -90;
  let down = 90;
  let pitch = 0;
  let far = { off: 0 };
  let speeds = null;
  fly(f, 120, (ff, before) => {
    watch(ff, before);
    const now = ff.state.fluid.session.now();
    if (now.key === 'barrelRoll') {
      const gamma = Math.asin(Math.max(-1, Math.min(1, lead.climbFtps / lead.tasFtps))) / DEG;
      up = Math.max(up, gamma);
      down = Math.min(down, gamma);
      pitch = Math.max(pitch, Math.abs(lead.pitchDeg));
      const off = Math.abs(Math.atan2(Math.sin(lead.headingRad - h0), Math.cos(lead.headingRad - h0))) / DEG;
      if (off > far.off) far = { off, gamma, bank: lead.bankDeg };
    }
    if (now.speeds?.exitKias != null) speeds = now.speeds;
  });
  assert.ok(Math.abs(up - 45) <= TOLERANCES.ANGLE_DEG, `${up.toFixed(1)}° up`);
  assert.ok(Math.abs(down + 45) <= TOLERANCES.ANGLE_DEG, `${(-down).toFixed(1)}° down`);
  assert.ok(pitch <= 60, `Lead's pitch reached ${pitch.toFixed(0)}°`);
  assert.ok(Math.abs(far.off - 90) <= TOLERANCES.ANGLE_DEG, `${far.off.toFixed(0)}° off the line at the far point`);
  assert.ok(Math.abs(far.gamma) <= TOLERANCES.ANGLE_DEG && Math.abs(far.bank) >= 180 - TOLERANCES.ANGLE_DEG, `level inverted there (${far.gamma.toFixed(1)}° climb, ${far.bank.toFixed(0)}° bank)`);
  assert.ok(speeds, 'the roll finished with its entry and exit speeds');
  assert.ok(Math.abs(speeds.entryKias - 230) <= TOLERANCES.AIRSPEED_KT, `entry ${Math.round(speeds.entryKias)} KIAS`);
  assert.ok(Math.abs(speeds.exitKias - 230) <= TOLERANCES.AIRSPEED_KT, `exit ${Math.round(speeds.exitKias)} KIAS`);
  const dh = Math.abs(Math.atan2(Math.sin(lead.headingRad - h0), Math.cos(lead.headingRad - h0))) / DEG;
  assert.ok(dh <= TOLERANCES.ANGLE_DEG, `back on the line (${dh.toFixed(1)}° off)`);
  assert.ok(Math.abs(lead.bankDeg) < TOLERANCES.ANGLE_DEG, 'Lead wings level after the roll');
  assertBackInTheCone(f, 'after the barrel roll');
  assert.deepEqual(failures.slice(0, 5), []);
});

test('the standard sequence flies a level turn, a loop, two wingovers and a barrel roll in that order; #2 ends back in the cone', () => {
  // SMM 16.17 para 42: "a level turn, a loop, two wingovers ... and a barrel roll". Four minutes is generous for the
  // four manoeuvres and their speed set-ups (about two minutes in all).
  const f = inFightingWing();
  f.change('fluid');
  const failures = [];
  const watch = alwaysTrue(failures);
  fly(f, 30, watch);
  f.pressFluid('wingsLevel');
  fly(f, 5, watch);
  assert.equal(f.pressFluid('sequence', 1), 'started');
  const order = [];
  fly(f, 240, (ff, before) => {
    watch(ff, before);
    const key = ff.state.fluid.session.now().key;
    if (order[order.length - 1] !== key) order.push(key);
  });
  assert.deepEqual(order, ['levelTurn', 'loop', 'wingover', 'barrelRoll', 'hold']);
  assert.ok(Math.abs(f.state.aircraft[0].bankDeg) < TOLERANCES.ANGLE_DEG, 'Lead wings level at the end');
  assertBackInTheCone(f, 'after the sequence');
  assert.deepEqual(failures.slice(0, 5), []);
});

test('at a long distance setting #2 lets the range open in the wingovers and the barrel roll, and is back in the cone at the setting after', () => {
  // Patrick card 5 Oct 01:01Z ("Open his path"): at 1,000 ft (the top of his 500-1,000 ft, row 3) #2 lets the range open
  // during the pull rather than pull past 5 G (SMM 16.17 para 44, an aim, not a wall), then resets (TS-60). What is always
  // true: positive G, nothing jumps, outside the 500 ft bubble, never ahead of the 3/9 line; and the end picture. Two
  // minutes each is generous for the set-up and the manoeuvre.
  const farFt = 1000;
  for (const key of ['wingover', 'barrelRoll']) {
    const f = createFormation({ fluidRangeFt: farFt });
    assert.equal(f.change('fw'), 'started');
    for (let i = 0; i < 3600 && f.state.current; i++) f.step();
    f.change('fluid');
    const failures = [];
    const watch = alwaysTrue(failures);
    fly(f, 30, watch);
    f.pressFluid('wingsLevel');
    fly(f, 5, watch);
    assert.notEqual(f.pressFluid(key, 1), 'refused', key);
    fly(f, 120, watch);
    const r = f.state.fluid.readouts;
    assert.ok(Math.abs(r.rangeFt - farFt) <= TOLERANCES.DISTANCE_FT, `${key}: back at the setting, ${Math.round(r.rangeFt)} ft`);
    assert.ok(r.aspectDeg <= CONE_HALF_DEG, `${key}: back in the cone, aspect ${r.aspectDeg.toFixed(1)}°`);
    assert.deepEqual(failures.slice(0, 5), [], key);
  }
});
