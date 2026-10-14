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

/** The ledger entry for a leaf path: its exact key, else the longest prefix key ('FW_WING.yoyo.'), else null. */
export function ledgerEntry(ledger, path) {
  if (ledger[path]) return { key: path, ...ledger[path] };
  let best = null;
  for (const k of Object.keys(ledger)) if (k.endsWith('.') && path.startsWith(k) && (!best || k.length > best.length)) best = k;
  return best ? { key: best, ...ledger[best] } : null;
}

/** numbers.md's source note for a leaf: its own row, else the nested '…' row, else its parent object's row. */
export function sourceOf(numbersMd, path) {
  const rows = new Map();
  for (const line of numbersMd.split('\n')) {
    const m = line.match(/^\| ([A-Z_]+\.[^|]*?) \| (.*?) \| (.*) \|$/);
    if (m) rows.set(m[1].trim(), m[3].trim());
  }
  const parts = path.split('.');
  const t = parts[0];
  const tries = [path, `${t}.…${parts[parts.length - 1]}`];
  for (let i = parts.length - 1; i >= 2; i--) tries.push(parts.slice(0, i).join('.'), `${t}.…${parts[i - 1]}`);
  for (const k of tries) if (rows.has(k) && rows.get(k)) return rows.get(k);
  return null;
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

const units = await src('core/units.js');
const mv = await src('modules/turn-sim/live/moves.js');
const fm = await src('modules/turn-sim/live/formation.js');

/**
 * The trim points (plan section 3.3), from the code's own numbers: the formation's speed outside line abreast
 * (moves.js KIAS_OUTSIDE_LAB, 200 ruled) at the block height (formation.js LIVE_DEFAULTS.blockFt, 8,000 ft, an estimate),
 * true speed by core iasToTasKt; Lead's turns by standard turn physics: ω = g tan(bank) / V, R = V / ω.
 */
export const TRIMS = (() => {
  const kias = mv.KIAS_OUTSIDE_LAB;
  const altFt = fm.LIVE_DEFAULTS.blockFt;
  const V = t6.iasToTasKt(kias, altFt) * units.KT_TO_FTPS;
  const g = units.G_FTPS2;
  const turn = (bankDeg) => {
    const omega = (g * Math.tan((bankDeg * Math.PI) / 180)) / V;
    return { bankDeg, leadG: 1 / Math.cos((bankDeg * Math.PI) / 180), omegaRadps: omega, radiusFt: V / omega };
  };
  // The speed change per percent of torque about the level holding setting (close formation's power lead uses the same:
  // close-formation.js powerLeadPct), kt/s per %, at G 1 and 2, from power.js powerFor and ktpsAtThrottle.
  const ktpsPerPct = (gLoad) => {
    const hold = pf.powerFor(0, kias, altFt, gLoad, 0);
    const pct = hold ? hold.throttle / pf.throttleAtTorque(1, kias, altFt) : 57;
    return pf.ktpsAtThrottle(pf.throttleAtTorque(pct + 1, kias, altFt), kias, altFt, gLoad) - pf.ktpsAtThrottle(pf.throttleAtTorque(pct, kias, altFt), kias, altFt, gLoad);
  };
  return Object.freeze({
    kias, altFt, tasFtps: V, g, ktsToFtps: units.KT_TO_FTPS,
    ktpsPerPctG1: ktpsPerPct(1), ktpsPerPctG2: ktpsPerPct(2),
    T1: { name: 'T1 straight and level, swept', ...turn(0.0001), omegaRadps: 0, radiusFt: Infinity },
    T2: { name: 'T2 academic turn, 60°/2 G, on the circle', ...turn(60) },
    T4: { name: 'T4 aggressive turn, 4 G', ...turn((Math.acos(1 / 4) * 180) / Math.PI) },
  });
})();

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  const out = { tables: TABLES, leaves: allLeaves(), shared: SHARED, trims: TRIMS };
  console.log(JSON.stringify(out, null, 1));
}
