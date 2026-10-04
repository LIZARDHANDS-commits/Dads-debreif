// Removed from tests/unit/turn-fight/energy-sim.test.js on Patrick's word (4 Oct 2026 07:42Z: "Just get rid of
// that test"). Reaching and holding the MPT shouldn't be a requirement, only something a jet does when it needs
// to win the fight. Kept for the record, not run; toMpt() and the imports stay in the original file.

// The spec names 100, 140, 180, 220 and 250; the todo says every speed from 100 to 250, so every 10 KIAS. Every change flies one speed
// from each move's band (split S, slice, MPT, pitch back, Immelmann, and the top of the Immelmann range); module sign-off flies all 16.
// SIGNOFF is the variable the CI sign-off run sets (.github/workflows/ci.yml).
const ALL_MERGE_SPEEDS = Array.from({ length: 16 }, (_, i) => 100 + 10 * i);
const SIGNOFF = process.env.SIGNOFF === 'true';
const MERGE_SPEEDS = SIGNOFF ? ALL_MERGE_SPEEDS : [100, 140, 160, 180, 220, 250];

for (const kias of MERGE_SPEEDS) {
  test(`from ${kias} KIAS at the merge, Auto reaches the MPT (160 ± 5 KIAS, SMM 14.14) and then holds it down to the deck`, () => {
    const r = toMpt(kias);
    assert.ok(r.reached, `${kias} KIAS never reached the MPT; moves ${r.moves.join(' > ')}; kias ${r.s.blue.kias}`);
    assert.ok(r.min >= 155 && r.max <= 165, `${kias} KIAS: held ${r.min.toFixed(1)} to ${r.max.toFixed(1)} after reaching it (${r.moves.join(' > ')})`);
    assert.equal(r.s.blue.mptReached, true);
    assert.ok(Number.isFinite(r.reached.turnDeg));
  });
}
