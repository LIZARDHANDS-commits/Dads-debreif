// The "before" record for the Fight Sim refactor (TF-57, PR 1 move only). Run from the repo root:
//   node /mnt/project-files/turn-fight-review/fingerprint.mjs record   (writes before/*.json from the code checked out now)
//   node /mnt/project-files/turn-fight-review/fingerprint.mjs check    (re-flies the 19 fights and compares, step by step)
// Not a repo test: it compares the code with its own earlier output, which is only right for a move-only change.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const { createEnergyFight, stepEnergyFight } = await import(pathToFileURL(`${root}/src/modules/turn-fight/energy-sim.js`));
const { DEFAULTS, energySetupFrom } = await import(pathToFileURL(`${root}/src/modules/turn-fight/state.js`));
const DIR = new URL('./before/', import.meta.url);
const STEP = 0.02;
export const CASES = {
  default: {},
  auto: { blueMove: 'auto', redMove: 'auto' },
  m140: { blueKias: 140, redKias: 140 },
  m180: { blueKias: 180, redKias: 180 },
  m260: { blueKias: 260, redKias: 260 },
  m300: { blueKias: 300, redKias: 300 },
  auto300: { blueKias: 300, redKias: 300, blueMove: 'auto', redMove: 'auto' },
  auto140: { blueKias: 140, redKias: 140, blueMove: 'auto', redMove: 'auto' },
  unequal: { blueKias: 250, redKias: 180 },
  low: { blueAltFt: 7000, redAltFt: 7000 },
  forcedImm: { blueMove: 'immelmann', redMove: 'mpt' },
  forcedSplitS: { blueKias: 120, redKias: 120, blueMove: 'splitS', redMove: 'splitS' },
  forcedSlice: { blueKias: 150, redKias: 150, blueMove: 'slice', redMove: 'slice' },
  forcedPitchBack: { blueKias: 200, redKias: 200, blueMove: 'pitchBack', redMove: 'pitchBack' },
  heights: { blueAltFt: 10000, redAltFt: 12000 },
  leadPursuit: { pursuit: 'lead' },
  lagPursuit: { pursuit: 'lag' },
  tacticalPursuit: { pursuit: 'tactical', blueKias: 260, redKias: 260 },
  avoidanceOff: { collisionAvoidance: false, blueMove: 'auto', redMove: 'auto' },
};
function fly(over, maxSec = 240) {
  const setup = energySetupFrom({ ...DEFAULTS, ...over });
  const s = createEnergyFight(setup);
  const hash = createHash('sha256');
  const samples = [];
  const moves = { blue: [], red: [] };
  let n = 0;
  hash.update(JSON.stringify(s));
  while (!s.stopped && s.timeSec < maxSec && !s.kill && !s.collision) {
    stepEnergyFight(s, STEP);
    n++;
    const line = JSON.stringify(s); // the whole state, full precision
    hash.update(line);
    for (const w of ['blue', 'red']) { const m = `${s[w].moveLabel}|${s[w].ctl?.mode}`; if (moves[w].at(-1)?.m !== m) moves[w].push({ t: +s.timeSec.toFixed(2), m }); }
    if (n % 50 === 0) samples.push({ t: +s.timeSec.toFixed(2), h: createHash('sha256').update(line).digest('hex').slice(0, 16), b: [s.blue.pm.x, s.blue.pm.y, s.blue.pm.z], r: [s.red.pm.x, s.red.pm.y, s.red.pm.z] });
  }
  return { steps: n, timeSec: +s.timeSec.toFixed(2), result: { firstNose: s.firstNose, chase: s.chase, kill: s.kill, collision: s.collision, stopped: s.stopped }, moves, samples, digest: hash.digest('hex') };
}
const mode = process.argv[2] ?? 'check';
let bad = 0;
for (const [name, over] of Object.entries(CASES)) {
  const now = fly(over);
  const file = new URL(`${name}.json`, DIR);
  if (mode === 'record') { writeFileSync(file, JSON.stringify({ name, over, ...now })); console.log(`recorded ${name}: ${now.steps} steps, ${now.digest.slice(0, 12)}`); continue; }
  const was = JSON.parse(readFileSync(file, 'utf8'));
  if (was.digest === now.digest) { console.log(`same      ${name}`); continue; }
  bad++;
  const i = was.samples.findIndex((x, k) => now.samples[k]?.h !== x.h);
  let maxFt = 0;
  for (let k = 0; k < Math.min(was.samples.length, now.samples.length); k++) for (const w of ['b', 'r']) maxFt = Math.max(maxFt, Math.hypot(...was.samples[k][w].map((v, j) => v - now.samples[k][w][j])));
  console.log(`DIFFERENT ${name}: first differs by ${i < 0 ? 'end' : was.samples[i].t + ' s'}; steps ${was.steps}->${now.steps}; biggest position gap at the 1 s marks ${maxFt.toFixed(3)} ft; result same: ${JSON.stringify(was.result) === JSON.stringify(now.result)}`);
}
if (mode === 'check') { console.log(bad ? `${bad} of ${Object.keys(CASES).length} fights differ` : 'all fights identical'); process.exitCode = bad ? 1 : 0; }
