import assert from 'node:assert/strict';

/**
 * Pilot operational domain tolerances ratified in Decision D369 / D371.
 * Evaluates flight mathematics and simulation physics against cockpit standards
 * rather than brittle bit-exact IEEE 754 float equality.
 */
export const TOLERANCES = Object.freeze({
  AIRSPEED_KT: 10.0,
  AIRSPEED_KT_LOOSE: 20.0,
  ALTITUDE_FT: 100.0,
  ALTITUDE_FT_LOOSE: 200.0,
  FORMATION_CLOSE_FT: 20.0,
  FORMATION_LOOSE_FT: 50.0,
  DISTANCE_FT: 100.0,
  DISTANCE_FT_LOOSE: 200.0,
  ANGLE_DEG: 5.0,
  ANGLE_DEG_LOOSE: 10.0,
  G_FORCE: 0.5,
  G_FORCE_LOOSE: 1.0,
  RATE_DEG_PER_SEC: 2.5,
  RATE_DEG_PER_SEC_LOOSE: 5.0,
  TIME_SEC: 0.5,
  TIME_SEC_LOOSE: 1.0,
  PERCENT: 0.05,
  PERCENT_LOOSE: 0.10,
});

/**
 * Asserts that a numerical value is within ±tolerance of an expected value.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} tolerance
 * @param {string} [message]
 */
export function assertNear(actual, expected, tolerance, message = '') {
  const diff = Math.abs(actual - expected);
  assert.ok(
    diff <= tolerance,
    `${message ? message + ': ' : ''}expected ${actual} to be within ±${tolerance} of ${expected} (diff: ${diff})`
  );
}

/**
 * Compares an array of scenario rows/records within pilot domain tolerances.
 *
 * @param {Array<any>} actualRows
 * @param {Array<any>} expectedRows
 * @param {typeof TOLERANCES} [tolerances]
 */
export function assertTableWithinTolerance(actualRows, expectedRows, tolerances = TOLERANCES) {
  assert.equal(actualRows.length, expectedRows.length, 'Row count mismatch');
  for (let i = 0; i < actualRows.length; i++) {
    const act = actualRows[i];
    const exp = expectedRows[i];
    if (typeof act === 'number' && typeof exp === 'number') {
      assertNear(act, exp, tolerances.PERCENT * Math.abs(exp || 1), `Row ${i}`);
    } else if (typeof act === 'object' && act !== null && typeof exp === 'object' && exp !== null) {
      for (const key of Object.keys(exp)) {
        if (typeof exp[key] === 'number') {
          const lKey = key.toLowerCase();
          const tol = (lKey.includes('speed') || lKey.includes('kias') || lKey.includes('tas')) ? tolerances.AIRSPEED_KT :
                      (lKey.includes('alt') || lKey.includes('height') || lKey.includes('elev')) ? tolerances.ALTITUDE_FT :
                      (lKey.includes('bank') || lKey.includes('hdg') || lKey.includes('pitch') || lKey.includes('angle')) ? tolerances.ANGLE_DEG :
                      (lKey.includes('g') || lKey === 'nz') ? tolerances.G_FORCE :
                      (lKey.includes('rate') || lKey.includes('omega')) ? tolerances.RATE_DEG_PER_SEC :
                      (lKey.includes('time') || lKey.includes('sec')) ? tolerances.TIME_SEC :
                      (lKey.includes('dist') || lKey.includes('sep') || lKey.includes('range')) ? tolerances.DISTANCE_FT :
                      tolerances.PERCENT * Math.abs(exp[key] || 1);
          assertNear(act[key], exp[key], tol, `Row ${i} field "${key}"`);
        } else {
          assert.equal(act[key], exp[key], `Row ${i} field "${key}"`);
        }
      }
    }
  }
}
