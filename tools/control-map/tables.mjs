// The control map's view of the wingman's tuning tables (tools/control-map/README.md): every leaf number of CLOSE_SEE,
// CLOSE_WING, FW_SEE and FW_WING read from the code itself (src/modules/turn-sim/live/wing-moves.js), never copied by hand,
// plus the few shared numbers the loops also run on (Lead's speed hold, the engine, the T-6A's G onset, the step).
// Run from the repo root:
//   node tools/control-map/tables.mjs          prints them as JSON (tools/flight-design/fw_loops.py reads this)
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const src = (p) => import(pathToFileURL(resolve('src', p)).href);
const wm = await src('modules/turn-sim/live/wing-moves.js');
const lm = await src('modules/turn-sim/live/lead-moves.js');
const hd = await src('modules/turn-sim/live/handling.js');
const fl = await src('modules/turn-sim/live/flight.js');
const t6 = await src('core/t6-performance.js');
const pf = await src('modules/turn-sim/live/power.js');

/** The four wingman tables, by name. */
export const TABLES = Object.freeze({ CLOSE_SEE: wm.CLOSE_SEE, CLOSE_WING: wm.CLOSE_WING, FW_SEE: wm.FW_SEE, FW_WING: wm.FW_WING });

/** Every leaf (number, boolean, string or null) of a table as [path, value], path like 'FW_WING.guard.minFt'; arrays by index. */
export function leaves(name, obj = TABLES[name], at = name) {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = `${at}.${k}`;
    if (v && typeof v === 'object') out.push(...leaves(name, v, p));
    else out.push([p, v]);
  }
  return out;
}

/** All four tables' leaves. */
export function allLeaves() {
  return Object.keys(TABLES).flatMap((n) => leaves(n));
}

/** A value by its path ('FW_WING.guard.minFt'), or undefined. */
export function valueAt(path) {
  const [t, ...rest] = path.split('.');
  let v = TABLES[t];
  for (const k of rest) v = v?.[k];
  return v;
}

/** The shared numbers the loops run on beside the four tables (each read from its own file). */
export const SHARED = Object.freeze({
  stepSec: fl.STEP_SEC,
  leadSpeedHoldPerSec: lm.LEAD.speedHold.perSec,
  leadSpeedHoldMaxKtps: lm.LEAD.speedHold.maxKtps,
  engineQuickSec: hd.ENGINE.quickSec,
  engineIdleLagSec: hd.ENGINE.idleLagSec,
  gOnset: t6.T6A_G_ONSET ?? null,
  torque: pf.TORQUE ?? null,
});

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  const out = { tables: TABLES, leaves: allLeaves(), shared: SHARED };
  console.log(JSON.stringify(out, null, 1));
}
