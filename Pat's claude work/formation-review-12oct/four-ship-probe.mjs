// 4-ship keep-unchanged probe: hashes every aircraft's state through fighting wing (turn, reversal, wings level), echelon and a close
// turn, with default options and with fwWing 'live'. Run before and after a change; the hashes must match.
//   node "Pat's claude work/formation-review-12oct/four-ship-probe.mjs" file:///C:/path/to/repo/
import { createHash } from 'node:crypto';
const root = process.argv[2];
const { createFormation } = await import(new URL('src/modules/turn-sim/live/formation.js', root));
const { STEP_SEC } = await import(new URL('src/modules/turn-sim/live/flight.js', root));
for (const opts of [{}, { fwWing: 'live' }]) {
  const f = createFormation({ ships: 4, ...opts });
  const h = createHash('sha1');
  const run = (sec) => { const n = sec === 'done' ? Math.round(300 / STEP_SEC) : Math.round(sec / STEP_SEC); for (let i = 0; i < n; i++) { if (sec === 'done' && !f.state.current) break; f.step(); if (i % 10 === 0) h.update(JSON.stringify(f.state.aircraft)); } };
  const seq = [
    ['fw', () => f.change('fw'), 'done'], ['turn', () => f.pressFw('levelTurn', -1), 30], ['rev', () => f.pressFw('reversal'), 20],
    ['wl', () => f.pressFw('wingsLevel'), 30], ['ech', () => f.change('echelon'), 'done'], ['close', () => f.press('delayed90', -1), 'done'],
  ];
  const log = [];
  for (const [k, p, sec] of seq) { try { p(); run(sec); log.push(k); } catch (e) { log.push(`${k}:ERR ${e.message.slice(0, 60)}`); } }
  console.log(JSON.stringify(opts), log.join(' '), h.digest('hex').slice(0, 16));
}
