// The four-ship formation graph used for the from-to table in design.md and for fig3. Costs are rough seconds (estimates), only
// used to pick the shorter of two routes. Sides (left/right) are handled in the text, not here.
export const NODES = {
  S4: 'Spread 4', OB: 'Offset box', F4: 'Fluid 4', FM: 'Fluid manoeuvring', FW: 'Fighting wing', RTE: 'Route', FIN: 'Finger', ECH: 'Echelon', BOX: 'Box', TR: 'Trail',
};
// [from, to, label, source, costSec]; `both` adds the reverse with its own label if given
export const EDGES = [
  ['FIN', 'ECH', 'crossunder', 'SMM 16.32 paras 87-88', 45, 'crossunder'],
  ['FIN', 'BOX', '#4 drops behind #3 to line astern', 'SMM 16.32 para 91', 50, '#4 steps back out to finger (same finger)'],
  ['FIN', 'TR', 'two, three, four drop back and slide in', 'SMM 16.32 paras 89-90', 60, 'slide out and up'],
  ['FIN', 'RTE', 'collapse to route spacing (est.)', 'AFM8 p.9', 20, 'close up to finger (est.)'],
  ['FIN', 'FW', 'drop back and open out', 'SMM 16.32 para 92; 16.38 para 105', 50, null],
  ['ECH', 'FW', 'drop back and open out', 'SMM 16.32 para 92; 16.38 para 105', 50, null],
  ['FW', 'RTE', 'close through route, stack kept until stable', 'AFM7 p.18; SMM 16.15 para 38', 60, null],
  ['FW', 'FIN', 'rejoin to finger (straight ahead or turning)', 'SMM 16.34 paras 95-96; AFM7 p.21', 90, null],
  ['FW', 'ECH', 'rejoin to echelon (straight ahead or turning)', 'SMM 16.34 paras 95-96; AFM7 p.21', 100, null],
  ['FIN', 'S4', 'number three waits for number four, then both open out', 'SMM 16.42 para 114', 120, null],
  ['FW', 'S4', 'Spread 4 from fighting wing, stack once in position', 'AFM7 p.15; AFM8 p.15', 90, 'TRJ to FW (2 inside, 3 and 4 cold)'],
  ['S4', 'FW', 'TRJ to FW', 'AFM7 p.17; AFM8 p.19', 100, null],
  ['FW', 'FM', 'Lead 30 then 60 bank, PCL max', 'AFM7 p.17; AFM8 p.19', 25, 'terminate, gentle turn back to FW'],
  ['FW', 'F4', 'FLUID 4, GO: number three diverges to 6,000 ft', 'AFM8 p.20', 60, 'wingmen pairs close back (est.)'],
  ['F4', 'OB', 'in place 90, then elements spread to LAB', 'AFM8 pp.21-22', 90, null],
  ['OB', 'FW', 'TRJ to FW (2 inside, 3 and 4 outside)', 'AFM8 p.25', 150, null],
];
export function edges() {
  const out = [];
  for (const [a, b, label, src, cost, back] of EDGES) {
    out.push({ from: a, to: b, label, src, cost });
    if (back) out.push({ from: b, to: a, label: back, src: back === 'crossunder' ? src : 'reverse of the above (est.)', cost });
  }
  return out;
}
export function shortest(from, to) {
  const E = edges();
  const dist = Object.fromEntries(Object.keys(NODES).map((k) => [k, Infinity])); const prev = {};
  dist[from] = 0; const todo = new Set(Object.keys(NODES));
  while (todo.size) { let u = null; for (const k of todo) if (u === null || dist[k] < dist[u]) u = k; todo.delete(u); if (dist[u] === Infinity) break; for (const e of E) if (e.from === u && dist[u] + e.cost < dist[e.to]) { dist[e.to] = dist[u] + e.cost; prev[e.to] = e; } }
  if (dist[to] === Infinity) return null;
  const path = []; for (let k = to; k !== from; k = prev[k].from) path.unshift(prev[k]);
  return { path, cost: dist[to] };
}
if (process.argv[1] && process.argv[1].endsWith('graph-data.mjs')) {
  const keys = Object.keys(NODES);
  console.log('| From \\ To | ' + keys.map((k) => NODES[k]).join(' | ') + ' |');
  console.log('|' + '---|'.repeat(keys.length + 1));
  for (const a of keys) {
    const cells = keys.map((b) => { if (a === b) return 'here'; const s = shortest(a, b); if (!s) return 'none'; return s.path.length === 1 ? 'direct' : 'via ' + s.path.slice(0, -1).map((e) => e.to).join(', '); });
    console.log(`| **${NODES[a]}** | ` + cells.join(' | ') + ' |');
  }
}
