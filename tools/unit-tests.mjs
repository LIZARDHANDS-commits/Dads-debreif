// Runs the unit tests (docs/TESTING.md, section 2).
//   node tools/unit-tests.mjs        every change: all unit tests except the
//                                    sign-off-only list below
//   node tools/unit-tests.mjs --all  module sign-off: every unit test
//
// A test moves to the sign-off-only list only under the flaky-test rule
// (Q-T4): it passes and fails, or doesn't finish, on the same code, and it
// can't be fixed the same day, or Patrick parks it by name. Each one has a
// note on Patrick's waiting list (docs/pat/status-and-plan.md) and in its
// module's testing.md. It still runs at sign-off.
import { globSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const SIGN_OFF_ONLY = [
  // Parked until the Formation redesign is done (Patrick, 22 Oct 2026: "can we
  // disable them until we finish redesigning formation?"). These six files hold
  // the 32 unit tests failing on main; they still run with --all. Each goes back
  // when the redesign covers it (docs/modules/turn-sim/testing.md).
  'tests/unit/turn-sim/errors.test.js',
  'tests/unit/turn-sim/formation-moves.test.js',
  'tests/unit/turn-sim/four-ship-changes.test.js',
  'tests/unit/turn-sim/four-ship.test.js',
  'tests/unit/turn-sim/g-warm.test.js',
  'tests/unit/turn-sim/live.test.js',
];

const all = process.argv.includes('--all');
const files = globSync(['tests/unit/**/*.test.js', 'tests/crosscheck/**/*.test.js'])
  .map((f) => f.split('\\').join('/'))
  .filter((f) => all || !SIGN_OFF_ONLY.includes(f))
  .sort();

// SIGNOFF=true tells the few tests with a longer sign-off set (Turn Fight's merge speeds) to fly all of it.
const env = all ? { ...process.env, SIGNOFF: 'true' } : process.env;
const run = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', env });
process.exit(run.status ?? 1);
