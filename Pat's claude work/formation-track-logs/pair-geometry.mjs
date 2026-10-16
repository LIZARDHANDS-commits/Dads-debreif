// Where a wingman sat relative to the ship he flew off, from two recorded
// tracks of one sortie: slant range, angle off the leader's tail, height and
// closure, every `step` seconds, plus a time-at-range tally.
//
// Uses the Debrief's own reader, cleaner, timestamp snap and sampling
// (src/flight-data), so the numbers match what the Debrief shows.
// Angle off the tail is horizontal only, measured from the leader's ground
// track (wind of a few knots makes this a degree or two out).
//
// Run from the repo root:
//   node "Pat's claude work/formation-track-logs/pair-geometry.mjs" 1 2 [step] [k1.kml k2.kml k3.kml k4.kml]
// Without track files it reads the Debrief's example four-ship (2 Jun 2026,
// original/assets, read only).
import { readFileSync } from 'node:fs';

const repo = new URL('../../', import.meta.url);
const { loadFlight } = await import(new URL('src/flight-data/load.js', repo));
const { retimeFlight } = await import(new URL('src/flight-data/timing.js', repo));
const { sampleAt, headingAt, gAt } = await import(new URL('src/flight-data/flight.js', repo));

const EXAMPLE = ['585aab2601b787ed.kml', '3ee2a7e81a74880c.kml', '3085ab3861e2bae6.kml', '46e14716b39044c4.kml']
  .map(f => new URL(`original/assets/${f}`, repo));
const [leadSlot, wingSlot, stepArg, ...paths] = process.argv.slice(2);
const files = paths.length ? paths : EXAMPLE;
let flight = loadFlight(files.map((f, i) => ({ slot: i + 1, name: `#${i + 1}`, text: readFileSync(f, 'utf8') })));
flight = retimeFlight(flight, {});
const lead = flight.tracks[leadSlot ?? '1'];
const wing = flight.tracks[wingSlot ?? '2'];
const step = Number(stepArg || 10);
const MIN_LEAD_KT = 120; // airborne
const iso = t => new Date(t * 1000).toISOString().slice(11, 19);

const t0 = Math.ceil(Math.max(lead.fixes[0].t, wing.fixes[0].t));
const t1 = Math.min(lead.fixes.at(-1).t, wing.fixes.at(-1).t);
const tally = { close: 0, mid: 0, cone: 0, ahead: 0, far: 0 };
let prev = null;
for (let t = t0; t <= t1; t += 1) {
  const p = sampleAt(lead, t), q = sampleAt(wing, t), h = headingAt(lead, t);
  if (!p || !q || h === null || (p.speedKt ?? 0) < MIN_LEAD_KT) { prev = null; continue; }
  const dx = q.xFt - p.xFt, dy = q.yFt - p.yFt, dz = q.altFt - p.altFt;
  const slant = Math.hypot(dx, dy, dz);
  let off = Math.atan2(dy, dx) - (h + Math.PI); // headings: radians, 0 = east, counter-clockwise
  while (off > Math.PI) off -= 2 * Math.PI;
  while (off < -Math.PI) off += 2 * Math.PI;
  const offDeg = Math.abs(off) * 180 / Math.PI;
  if (slant < 150) tally.close++;
  else if (slant < 400) tally.mid++;
  else if (slant <= 1200) tally[offDeg <= 90 ? 'cone' : 'ahead']++;
  else tally.far++;
  if ((t - t0) % step) continue;
  const closure = prev === null ? 0 : (prev - slant) / step;
  prev = slant;
  const gL = gAt(lead, t, { recorded: true }), gW = gAt(wing, t, { recorded: true });
  const g = x => (Number.isFinite(x.g) ? x.g.toFixed(1) + (x.source === 'recorded' ? 'r' : '') : '-');
  console.log(`${iso(t)} slant ${slant.toFixed(0).padStart(5)} ft  off-tail ${offDeg.toFixed(0).padStart(3)}°  wing above ${dz.toFixed(0).padStart(5)} ft  closure ${closure.toFixed(0).padStart(4)} ft/s  lead GS ${(p.speedKt ?? 0).toFixed(0)} kt  G lead ${g(gL)} wing ${g(gW)}`);
}
console.log(`time together (s): under 150 ft ${tally.close}; 150-400 ${tally.mid}; 400-1,200 behind the wing line ${tally.cone}; 400-1,200 ahead of it ${tally.ahead}; beyond 1,200 ${tally.far}. G marked r is recorded (a Sentry), else estimated from the track.`);
