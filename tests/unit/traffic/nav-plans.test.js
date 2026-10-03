// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// Tests may be poorly designed, overfitted to obsolete baseline assumptions,
// or time-locked to legacy trajectory floats. Under D411, tests must be updated
// or pruned, never accommodated by degrading aerodynamic fidelity.
// ============================================================================

// Tests for nav-plans.js — Vector Guidance Migration (D406, D412, R34)
// Minimal: verify structure, key coordinates, factory math, and registry lookups.
// NOT testing: every waypoint field, Object.freeze behavior, or decimal precision.

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  PAT_INNER, PAT_SI, ENT_OHB, ENT_SI, PFL_HIGH_KEY, TAKEOFF,
  NAV_PLANS, getNavPlan,
  makeBreakout, makeGoAround, makePflFromArea,
  SPAWN_PRESETS, PATTERN_NAMES, startPointsForPattern, findSpawnPreset,
  findWaypointIndexByTag, findWaypointByTag,
} from '../../../src/modules/traffic/nav-plans.js';

// ── Structure: every static plan has the fields the flight engine needs ──────

describe('nav-plans: static plan structure', () => {
  const plans = [PAT_INNER, PAT_SI, ENT_OHB, ENT_SI, PFL_HIGH_KEY, TAKEOFF];

  for (const plan of plans) {
    it(`${plan.id} has id, model, loop, waypoints`, () => {
      assert.ok(plan.id, 'has id');
      assert.ok(['KIN', 'NRG'].includes(plan.model), `model is KIN or NRG, got ${plan.model}`);
      assert.equal(typeof plan.loop, 'boolean', 'loop is boolean');
      assert.ok(Array.isArray(plan.waypoints), 'waypoints is array');
      assert.ok(plan.waypoints.length >= 3, `at least 3 waypoints, got ${plan.waypoints.length}`);
    });

    it(`${plan.id} waypoints have x, y, alt, kias, phase, mode`, () => {
      for (const wp of plan.waypoints) {
        assert.equal(typeof wp.x, 'number', `wp ${wp.label}: x is number`);
        assert.equal(typeof wp.y, 'number', `wp ${wp.label}: y is number`);
        assert.equal(typeof wp.alt, 'number', `wp ${wp.label}: alt is number`);
        assert.equal(typeof wp.kias, 'number', `wp ${wp.label}: kias is number`);
        assert.ok(wp.phase, `wp ${wp.label}: has phase`);
        assert.ok(['rails', 'physics'].includes(wp.mode), `wp ${wp.label}: mode is rails or physics`);
      }
    });
  }
});

// ── PAT_INNER: the primary circuit ──────────────────────────────────────────

describe('nav-plans: PAT_INNER', () => {
  it('has 13 waypoints (0–12)', () => {
    assert.equal(PAT_INNER.waypoints.length, 13);
  });

  it('is KIN model, closed loop', () => {
    assert.equal(PAT_INNER.model, 'KIN');
    assert.equal(PAT_INNER.loop, true);
  });

  it('Threshold at (3104, -3194), 1880 ft, 100 KIAS', () => {
    const wp0 = PAT_INNER.waypoints[0];
    assert.equal(wp0.x, 3104);
    assert.equal(wp0.y, -3194);
    assert.equal(wp0.alt, 1880);
    assert.equal(wp0.kias, 100);
    assert.equal(wp0.phase, 'landing');
  });

  it('Break at wp 9 is rails mode, 60° bank, 220 KIAS', () => {
    const wp9 = PAT_INNER.waypoints[9];
    assert.equal(wp9.phase, 'break');
    assert.equal(wp9.mode, 'rails');
    assert.equal(wp9.bankDeg, 60);
    assert.equal(wp9.kias, 220);
  });

  it('Perch at wp 11 is rails mode, 35° bank, final_turn phase', () => {
    const wp11 = PAT_INNER.waypoints[11];
    assert.equal(wp11.phase, 'final_turn');
    assert.equal(wp11.mode, 'rails');
    assert.equal(wp11.bankDeg, 35);
    assert.equal(wp11.kias, 120);
  });

  it('Break Exit at wp 10 is rails mode (inner downwind)', () => {
    const wp10 = PAT_INNER.waypoints[10];
    assert.equal(wp10.phase, 'inner_downwind');
    assert.equal(wp10.mode, 'rails');
    assert.equal(wp10.kias, 140);
  });
});

// ── PAT_SI: straight-in ─────────────────────────────────────────────────────

describe('nav-plans: PAT_SI', () => {
  it('has 12 waypoints', () => {
    assert.equal(PAT_SI.waypoints.length, 12);
  });

  it('shares threshold with PAT_INNER', () => {
    assert.equal(PAT_SI.waypoints[0].x, PAT_INNER.waypoints[0].x);
    assert.equal(PAT_SI.waypoints[0].y, PAT_INNER.waypoints[0].y);
  });

  it('Window at wp 10 has 0.75 NM speed gate at 120 KIAS', () => {
    const wp10 = PAT_SI.waypoints[10];
    assert.equal(wp10.label, 'Window (¾ NM)');
    assert.equal(wp10.kias, 120);
  });
});

// ── PFL_HIGH_KEY: NRG model with config transitions ─────────────────────────

describe('nav-plans: PFL_HIGH_KEY', () => {
  it('is NRG model, not looping', () => {
    assert.equal(PFL_HIGH_KEY.model, 'NRG');
    assert.equal(PFL_HIGH_KEY.loop, false);
  });

  it('High Key at 5000 ft, clean config, 125 KIAS', () => {
    const wp0 = PFL_HIGH_KEY.waypoints[0];
    assert.equal(wp0.alt, 5000);
    assert.equal(wp0.kias, 125);
    assert.equal(wp0.config, 'clean');
  });

  it('config transitions: clean → gearDown → landing', () => {
    const configs = PFL_HIGH_KEY.waypoints.map(w => w.config);
    assert.deepEqual(configs, ['clean', 'gearDown', 'landing', 'landing']);
  });

  it('all waypoints are rails mode', () => {
    assert.ok(PFL_HIGH_KEY.waypoints.every(w => w.mode === 'rails'));
  });
});

// ── Factory: makePflFromArea ────────────────────────────────────────────────

describe('nav-plans: makePflFromArea', () => {
  it('default (090°/10 NM/8000 ft) spawns east of field', () => {
    const { plan, spawn } = makePflFromArea();
    assert.ok(spawn.x > 50000, `spawn x should be east (>50000 ft), got ${spawn.x}`);
    assert.ok(Math.abs(spawn.y) < 1000, `spawn y should be near 0, got ${spawn.y}`);
    assert.equal(spawn.alt, 8000);
    assert.equal(spawn.headingDeg, 270); // reciprocal of 090
    assert.equal(spawn.iasKt, 125);
    assert.equal(plan.model, 'NRG');
  });

  it('radial 000° spawns north of field', () => {
    const { spawn } = makePflFromArea(0, 5, 6000);
    assert.ok(spawn.y > 20000, `spawn y should be north, got ${spawn.y}`);
    assert.ok(Math.abs(spawn.x) < 100, `spawn x should be near 0, got ${spawn.x}`);
    assert.equal(spawn.headingDeg, 180);
  });

  it('clamps inputs to valid ranges', () => {
    const { spawn: high } = makePflFromArea(90, 50, 20000);
    assert.equal(high.alt, 15000); // clamped
    const { spawn: low } = makePflFromArea(90, 0.5, 1000);
    assert.equal(low.alt, 3000);   // clamped
  });

  it('plan has 5 waypoints ending at threshold', () => {
    const { plan } = makePflFromArea(180, 15, 10000);
    assert.equal(plan.waypoints.length, 5);
    assert.equal(plan.waypoints[4].phase, 'pfl_final');
    assert.equal(plan.waypoints[4].x, 3104); // threshold
  });
});

// ── Factory: makeBreakout and makeGoAround ──────────────────────────────────

describe('nav-plans: dynamic factories', () => {
  it('makeBreakout creates a plan from current position', () => {
    const plan = makeBreakout({ x: 5000, y: -5000, alt: 3000, iasKt: 160 });
    assert.equal(plan.id, 'BREAKOUT');
    assert.equal(plan.model, 'KIN');
    assert.equal(plan.loop, false);
    assert.equal(plan.waypoints[0].x, 5000);
    assert.ok(plan.waypoints.length >= 3);
  });

  it('makeGoAround creates a plan from current position', () => {
    const plan = makeGoAround({ x: 8000, y: -6000, alt: 2100, iasKt: 100 });
    assert.equal(plan.id, 'GO_AROUND');
    assert.equal(plan.model, 'KIN');
    assert.equal(plan.waypoints[0].x, 8000);
    assert.ok(plan.waypoints.length >= 3);
  });
});

// ── Registry and spawn presets ──────────────────────────────────────────────

describe('nav-plans: registry', () => {
  it('NAV_PLANS has all 6 static plans', () => {
    assert.equal(Object.keys(NAV_PLANS).length, 6);
    assert.ok(NAV_PLANS.PAT_INNER);
    assert.ok(NAV_PLANS.PFL_HIGH_KEY);
    assert.ok(NAV_PLANS.TAKEOFF);
  });

  it('getNavPlan returns the plan or null', () => {
    assert.equal(getNavPlan('PAT_INNER'), PAT_INNER);
    assert.equal(getNavPlan('NONEXISTENT'), null);
  });
});

describe('nav-plans: spawn presets', () => {
  it('PATTERN_NAMES has 6 patterns', () => {
    assert.equal(PATTERN_NAMES.length, 6);
    assert.ok(PATTERN_NAMES.includes('OHB'));
    assert.ok(PATTERN_NAMES.includes('PFL'));
    assert.ok(PATTERN_NAMES.includes('Takeoff'));
  });

  it('OHB has 8 start points', () => {
    const points = startPointsForPattern('OHB');
    assert.equal(points.length, 8);
    assert.ok(points.includes('Initial (2 NM)'));
    assert.ok(points.includes('Break'));
    assert.ok(points.includes('Perch'));
  });

  it('PFL has 3 start points including From Area', () => {
    const points = startPointsForPattern('PFL');
    assert.equal(points.length, 3);
    assert.ok(points.includes('From Area'));
  });

  it('findSpawnPreset returns the matching preset', () => {
    const preset = findSpawnPreset('OHB', 'Break');
    assert.ok(preset);
    assert.equal(preset.navPlanId, 'PAT_INNER');
    assert.equal(preset.waypointIndex, 9);
    assert.equal(preset.phase, 'break');
  });

  it('findSpawnPreset returns undefined for unknown combo', () => {
    assert.equal(findSpawnPreset('OHB', 'Nonexistent'), undefined);
  });

  it('From Area preset has null coordinates (computed at spawn time)', () => {
    const preset = findSpawnPreset('PFL', 'From Area');
    assert.ok(preset);
    assert.equal(preset.x, null);
    assert.equal(preset.factory, 'makePflFromArea');
  });
});

// ── Semantic Waypoint Tags & Lookup Helpers ─────────────────────────────────

describe('nav-plans: semantic waypoint tags & lookup helpers', () => {
  it('PAT_INNER has correct semantic tags for key waypoints', () => {
    assert.equal(findWaypointIndexByTag(PAT_INNER, 'threshold'), 0);
    assert.equal(findWaypointIndexByTag(PAT_INNER, 'departure_end'), 1);
    assert.equal(findWaypointIndexByTag(PAT_INNER, 'break'), 9);
    assert.equal(findWaypointIndexByTag(PAT_INNER, 'break_rollout'), 10);
    assert.equal(findWaypointIndexByTag(PAT_INNER, 'perch'), 11);
    assert.equal(findWaypointIndexByTag(PAT_INNER, 'window'), 12);
  });

  it('PAT_SI has correct semantic tags', () => {
    assert.equal(findWaypointIndexByTag(PAT_SI, 'threshold'), 0);
    assert.equal(findWaypointIndexByTag(PAT_SI, 'final'), 9);
    assert.equal(findWaypointIndexByTag(PAT_SI, 'window'), 10);
  });

  it('PFL_HIGH_KEY has correct semantic tags', () => {
    assert.equal(findWaypointIndexByTag(PFL_HIGH_KEY, 'high_key'), 0);
    assert.equal(findWaypointIndexByTag(PFL_HIGH_KEY, 'low_key'), 1);
    assert.equal(findWaypointIndexByTag(PFL_HIGH_KEY, 'base_key'), 2);
    assert.equal(findWaypointIndexByTag(PFL_HIGH_KEY, 'threshold'), 3);
  });

  it('TAKEOFF has correct semantic tags', () => {
    assert.equal(findWaypointIndexByTag(TAKEOFF, 'lineup'), 0);
    assert.equal(findWaypointIndexByTag(TAKEOFF, 'takeoff_roll'), 1);
    assert.equal(findWaypointIndexByTag(TAKEOFF, 'liftoff'), 2);
    assert.equal(findWaypointIndexByTag(TAKEOFF, 'climb'), 3);
    assert.equal(findWaypointIndexByTag(TAKEOFF, 'departure_end'), 4);
  });

  it('findWaypointByTag returns the waypoint object matching tag', () => {
    const wp = findWaypointByTag(PAT_INNER, 'perch');
    assert.ok(wp);
    assert.equal(wp.tag, 'perch');
    assert.equal(wp.phase, 'final_turn');
    assert.equal(wp.bankDeg, 35);
  });

  it('findWaypointByTag falls back to regex label match on untagged routes', () => {
    const untaggedRoute = {
      points: [
        { label: 'Runway 29L Threshold', x: 3104, y: -3194 },
        { label: 'Departure End', x: -4066, y: 681 },
        { label: 'Perch Point (35 deg bank)', x: 7146, y: -10275 },
      ],
    };
    assert.equal(findWaypointIndexByTag(untaggedRoute, 'threshold'), 0);
    assert.equal(findWaypointIndexByTag(untaggedRoute, 'departure_end'), 1);
    assert.equal(findWaypointIndexByTag(untaggedRoute, 'perch'), 2);

    const wp = findWaypointByTag(untaggedRoute, 'perch');
    assert.ok(wp);
    assert.equal(wp.label, 'Perch Point (35 deg bank)');
  });

  it('findWaypointByTag and findWaypointIndexByTag return null / -1 when not found', () => {
    assert.equal(findWaypointIndexByTag(PAT_INNER, 'nonexistent_tag'), -1);
    assert.equal(findWaypointByTag(PAT_INNER, 'nonexistent_tag'), null);
    assert.equal(findWaypointIndexByTag(null, 'threshold'), -1);
    assert.equal(findWaypointByTag(null, 'threshold'), null);
  });

  it('dynamic factories attach tags to generated waypoints', () => {
    const breakout = makeBreakout({ x: 1000, y: 1000 });
    assert.equal(breakout.waypoints[0].tag, 'breakout_start');

    const goAround = makeGoAround({ x: 2000, y: 2000 });
    assert.equal(goAround.waypoints[0].tag, 'go_around_start');

    const { plan: pfl } = makePflFromArea(90, 10, 8000);
    assert.equal(pfl.waypoints[pfl.waypoints.length - 1].tag, 'threshold');
  });
});

