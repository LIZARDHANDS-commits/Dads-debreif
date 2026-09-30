// Shared by energy-below-mmo.test.js: a fingerprint of a whole Energy fight, and the list of fights it is taken for.
// Not a test file itself (the runner only picks up *.test.js).
//
// The Mach limit (core #211) changed the Energy engine's speed limit only above about 17,600 ft. Below that the limit is
// still VMO, and every number of every step must be what it was before (CLAUDE.md: a flight-math change pins the old
// behaviour first). The fingerprint is a SHA-256 over every step of a ten-minute fight: both aircraft, the pair's
// readouts, the first nose-on and the chase, each number written with its exact digits (and -0, NaN or Infinity kept
// apart), so a single bit moving at a single step shows up. The fixture (tests/fixtures/turn-fight/energy-below-mmo.json)
// was written from the engine before the Mach limit went in.
import { createHash } from 'node:crypto';
import { createEnergyFight, stepEnergyFight } from '../../../src/modules/turn-fight/energy-sim.js';
import { FIGHT_STEP_SEC } from '../../../src/modules/turn-fight/sim.js';

/** Ten minutes of 0.02 s steps, the engine's own limit. */
export const PIN_STEPS = 30000;

const exact = (key, v) => {
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : Number.isFinite(v) ? v : String(v);
  return v;
};

/**
 * Flies `setup` for ten minutes and returns the fingerprint and a few plain numbers to read.
 * `digest` covers everything except the setup and the plan (both fixed from the start and covered by the steps).
 */
export function trajectoryDigest(setup) {
  const s = createEnergyFight(setup);
  const h = createHash('sha256');
  const top = (st) => JSON.stringify({ t: st.timeSec, m: st.merged, ms: st.mergeSec, fn: st.firstNose, ch: st.chase, r: st.rangeFt, a: [st.ataBlueDeg, st.ataRedDeg, st.aaDeg, st.headingCrossDeg], b: st.blue, d: st.red }, exact);
  h.update(top(s));
  let maxKias = 0, minAlt = Infinity, maxAlt = -Infinity, chasingSteps = 0;
  for (let i = 0; i < PIN_STEPS; i++) {
    stepEnergyFight(s, FIGHT_STEP_SEC);
    h.update(top(s));
    for (const a of [s.blue, s.red]) {
      if (a.kias > maxKias) maxKias = a.kias;
      if (a.altFt < minAlt) minAlt = a.altFt;
      if (a.altFt > maxAlt) maxAlt = a.altFt;
      if (a.move === 'pursuit') chasingSteps++;
    }
  }
  return {
    digest: h.digest('hex'),
    stopped: s.stopped,
    maxKias, minAlt, maxAlt, chasingSteps,
    blueFinal: { kias: s.blue.kias, altFt: s.blue.altFt, move: s.blue.move },
    redFinal: { kias: s.red.kias, altFt: s.red.altFt, move: s.red.move },
  };
}

// A small deterministic generator (an LCG), so the sampled grid is the same every run.
function lcg(seed) {
  let x = seed >>> 0;
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
}

/**
 * The fights the fixture holds. Named ones first (the default fight, a 316 KIAS merge at 10,000 ft, the highest start
 * the pin allows), then a sampled grid of starts at or below 17,000 ft: heights, merge speeds up to VMO, geometries,
 * 1 and 2 circles and the three pursuits, from a fixed seed. Every height is at most 17,000 ft.
 */
export function pinCases() {
  const cases = [
    ['the default fight', {}],
    ['a 316 KIAS merge at 10,000 ft', { blueKias: 316, redKias: 316 }],
    ['a 316 KIAS merge at 17,000 ft', { blueAltFt: 17000, redAltFt: 17000, blueKias: 316, redKias: 316 }],
    ['the default fight at 15,000 ft', { blueAltFt: 15000, redAltFt: 15000 }],
    ['the default fight at 17,000 ft', { blueAltFt: 17000, redAltFt: 17000 }],
    ['Blue 316 overshooting Red 160 at the deck', { blueAltFt: 6000, redAltFt: 6000, blueKias: 316, redKias: 160, turnsStart: 'now', ataDeg: 0, aaDeg: 0, separationNm: 2 }],
    ['Blue 100 against Red 220 at 17,000 ft (a chase)', { blueAltFt: 17000, redAltFt: 17000, blueKias: 100 }],
    ['Blue 300 against Red 280 at 15,000 ft (a chase, fast)', { blueAltFt: 15000, redAltFt: 15000, blueKias: 300, redKias: 280 }],
  ];
  const rnd = lcg(20260930);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const heights = [6000, 8000, 10000, 12000, 14000, 15000, 16000, 17000];
  const speeds = [100, 140, 160, 200, 220, 250, 280, 300, 316];
  for (let i = 0; i < 36; i++) {
    const blueAltFt = pick(heights);
    const redAltFt = Math.min(17000, Math.max(6000, blueAltFt + pick([-2000, -1000, 0, 0, 1000, 2000])));
    const setup = {
      blueAltFt, redAltFt, blueKias: pick(speeds), redKias: pick(speeds),
      ataDeg: pick([0, 0, 20, 45, 90, 135]), aaDeg: pick([180, 180, 150, 90, 30, 0]),
      ataSide: pick(['left', 'right']), aaSide: pick(['left', 'right']),
      turnsStart: pick(['pass', 'pass', 'now']), circles: pick([1, 2]),
      separationNm: pick([1, 2, 3]), pursuit: pick(['pure', 'lead', 'lag']), chaseAfterHeadOn: pick([false, false, true]),
    };
    cases.push([`grid ${String(i + 1).padStart(2, '0')}`, setup]);
  }
  return cases.map(([name, setup]) => ({ name, setup }));
}
