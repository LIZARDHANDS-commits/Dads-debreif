// Runs the unit tests (docs/TESTING.md, section 2).
//   node tools/unit-tests.mjs        every change: all unit tests except the
//                                    sign-off-only list below
//   node tools/unit-tests.mjs --all  module sign-off: every unit test
//
// A test moves to the sign-off-only list only under the flaky-test rule
// (Q-T4): it passes and fails, or doesn't finish, on the same code, and it
// can't be fixed the same day. Each one has a note on the waiting list in
// docs/PLAN.md and in its module's testing.md. It still runs at sign-off.
import { globSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const SIGN_OFF_ONLY = [];

const all = process.argv.includes('--all');
const files = globSync(['tests/unit/**/*.test.js', 'tests/crosscheck/**/*.test.js'])
  .map((f) => f.split('\\').join('/'))
  .filter((f) => all || !SIGN_OFF_ONLY.includes(f))
  .sort();

// SIGNOFF=true tells the few tests with a longer sign-off set (Turn Fight's merge speeds) to fly all of it.
const env = all ? { ...process.env, SIGNOFF: 'true' } : process.env;
const run = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', env });
process.exit(run.status ?? 1);
