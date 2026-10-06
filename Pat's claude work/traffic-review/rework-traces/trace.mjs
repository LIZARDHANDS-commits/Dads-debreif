// Read-only PFL traces for the Fable review. Imports the repo's own code; changes nothing.
import { flyPfl, pflGeometry, PFL, glideFootprint } from '/home/user/Dads-debreif/src/modules/traffic/pfl.js';
import { setFieldTemperature } from '/home/user/Dads-debreif/src/modules/traffic/weather.js';
import { THRESHOLD_29L, DEPARTURE_END_29L } from '/home/user/Dads-debreif/src/modules/traffic/airfield.js';
import { legOffsetsFt } from '/home/user/Dads-debreif/src/core/geo.js';

const FT_NM = 6076.12;
const DEG = Math.PI / 180;
const geoCalm = pflGeometry(360, 0);

function summarize(name, start, wind, options = {}, tempC = null) {
  setFieldTemperature(tempC);
  const t0 = Date.now();
  const f = flyPfl(start, wind, options);
  const ms = Date.now() - t0;
  const pts = f.points;
  const geo = pflGeometry(wind.windFromDeg, wind.windKt, options.settings);
  // decisions and config changes
  const events = [];
  let lastDec = null, lastCfg = null, lastTag = null, maxBank = 0, minKias = 1e9, maxG = 0;
  let prev = null;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const t = i; // record every 0.2 s roughly; use pts index
    if (p.decision !== lastDec) { events.push(`  t~${(p.t ?? i * 0.2).toFixed(0)}s alt ${Math.round(p.alt)} kt ${Math.round(p.kt)} ${p.config}: "${p.decision}"`); lastDec = p.decision; }
    if (p.config !== lastCfg) { events.push(`  t~${(i * 0.2).toFixed(0)}s alt ${Math.round(p.alt)}: config -> ${p.config}`); lastCfg = p.config; }
    if (p.tag !== lastTag && p.tag) { events.push(`  t~${(i * 0.2).toFixed(0)}s alt ${Math.round(p.alt)} kt ${Math.round(p.kt)}: KEY ${p.tag}`); lastTag = p.tag; }
    minKias = Math.min(minKias, p.kt);
    if (p.g) maxG = Math.max(maxG, p.g);
    if (prev) {
      // bank from heading change: points every 0.2 s? we record every 0.2 s (k%4==2) plus pilot's own every 0.4 s => mixed. Skip bank.
    }
    prev = p;
  }
  // apex
  let apex = pts[0];
  for (const p of pts) if (p.alt > apex.alt) apex = p;
  const td = f.touchdown;
  const last = pts[pts.length - 1];
  const second = pts[pts.length - 2];
  let descentDeg = null;
  if (second && last) {
    const dxy = Math.hypot(last.x - second.x, last.y - second.y);
    descentDeg = Math.atan2(second.alt - last.alt, dxy) / DEG;
  }
  const o = legOffsetsFt(THRESHOLD_29L, DEPARTURE_END_29L, last);
  console.log(`\n=== ${name} ===  wind ${wind.windFromDeg}/${wind.windKt}${tempC !== null ? ` temp ${tempC}C` : ''}`);
  console.log(`  start: alt ${start.alt} kias ${start.kias} hdg ${start.headingDeg} at (${Math.round(start.x)}, ${Math.round(start.y)}); dist to threshold ${(Math.hypot(start.x - THRESHOLD_29L.x, start.y - THRESHOLD_29L.y) / FT_NM).toFixed(2)} NM`);
  console.log(`  plan: ${f.plan}  outcome: ${f.outcome}  apex alt ${Math.round(apex.alt)} (gain ${Math.round(apex.alt - start.alt)}) at t~${(pts.indexOf(apex) * 0.2).toFixed(0)}s  steps/ms ${ms}`);
  if (f.gate) console.log(`  gate 2100: ok=${f.gate.ok} off ${f.gate.offDeg.toFixed(0)} deg kias ${f.gate.kias.toFixed(0)} flags [${f.gate.flags.join(', ')}]`);
  if (td) console.log(`  touchdown: ${Math.round(td.alongFt)} ft along, ${Math.round(td.kias)} KIAS, path angle at touchdown ${descentDeg?.toFixed(1)} deg, cross ${Math.round(o.crossFt)} ft`);
  if (f.eject) console.log(`  eject at alt ${Math.round(f.eject.alt)} (${Math.round(o.alongFt)} along, ${Math.round(o.crossFt)} cross from threshold)`);
  console.log(`  min KIAS ${minKias.toFixed(0)}  max G(bank) ${maxG.toFixed(2)}  notes: ${f.notes.join(' | ')}`);
  console.log(events.join('\n'));
  return f;
}

const TH = THRESHOLD_29L, DEP = DEPARTURE_END_29L;
const u = { x: (DEP.x - TH.x) / Math.hypot(DEP.x - TH.x, DEP.y - TH.y), y: (DEP.y - TH.y) / Math.hypot(DEP.x - TH.x, DEP.y - TH.y) };
const along = (ft) => ({ x: TH.x + u.x * ft, y: TH.y + u.y * ft });
const RWY = 298.6;
const area = (radialDeg, nm, alt) => ({ x: nm * FT_NM * Math.sin(radialDeg * DEG), y: nm * FT_NM * Math.cos(radialDeg * DEG), alt, kias: 125, headingDeg: (radialDeg + 180) % 360, bankDeg: 0 });

const which = process.argv[2] ?? 'all';
const W15 = { windFromDeg: 269, windKt: 15 }, CALM = { windFromDeg: 360, windKt: 0 };

if (which === 'all' || which === 'busy') {
  summarize('A. Busy circuit area PFL (120°, 6 NM, 8,000 ft)', area(120, 6, 8000), W15);
  summarize('A2. same, calm', area(120, 6, 8000), CALM);
}
if (which === 'all' || which === 'temp') {
  summarize('T. area PFL 120/6/8000, standard day', area(120, 6, 8000), W15, {}, null);
  summarize('T. area PFL 120/6/8000, hot 30C', area(120, 6, 8000), W15, {}, 30);
  summarize('T. area PFL 120/6/8000, cold -30C', area(120, 6, 8000), W15, {}, -30);
  summarize('T. Low Key start std', { ...geoCalm.at(180), alt: 3700, kias: 120, headingDeg: 118 }, CALM, {}, null);
  summarize('T. Low Key start cold -30C', { ...geoCalm.at(180), alt: 3700, kias: 120, headingDeg: 118 }, CALM, {}, -30);
  summarize('T. Low Key start hot 30C', { ...geoCalm.at(180), alt: 3700, kias: 120, headingDeg: 118 }, CALM, {}, 30);
}
if (which === 'all' || which === 'pattern') {
  // inner downwind: break exit (-1550,-4213) to perch (6148,-8688) heading 118
  summarize('B. PFL on inner downwind, abeam threshold, 3500/140 hdg 118', { x: 2300, y: -6450, alt: 3500, kias: 140, headingDeg: 118, bankDeg: 0 }, CALM);
  summarize('B2. same, wind 269/15', { x: 2300, y: -6450, alt: 3500, kias: 140, headingDeg: 118, bankDeg: 0 }, W15);
  summarize('C. PFL at the perch 3500/120 hdg 118', { x: 6148, y: -8688, alt: 3500, kias: 120, headingDeg: 118, bankDeg: 0 }, CALM);
  summarize('D. PFL mid final turn (hdg 208, 2,900 ft, 120, bank 35)', { x: 7600, y: -8000, alt: 2900, kias: 120, headingDeg: 208, bankDeg: -35 }, CALM);
  summarize('D2. PFL late final turn (hdg 250, 2,500 ft, 120, bank 35)', { x: 7400, y: -6400, alt: 2500, kias: 120, headingDeg: 250, bankDeg: -35 }, CALM);
  summarize('E. PFL on initial 1 NM short of threshold, 3500/220 hdg 298', { ...along(-FT_NM), alt: 3500, kias: 220, headingDeg: RWY, bankDeg: 0 }, CALM);
  summarize('E2. PFL in the break (hdg 240, 3500/190, bank -60) 2000 ft past thr', { x: 1039 - 600, y: -1820 - 400, alt: 3500, kias: 190, headingDeg: 240, bankDeg: -60 }, CALM);
  summarize('F. PFL on the outer downwind (abeam dep end) 3500/220 hdg 118', { x: -9395, y: -10008, alt: 3500, kias: 220, headingDeg: 118, bankDeg: 0 }, CALM);
  summarize('F2. same in 269/15', { x: -9395, y: -10008, alt: 3500, kias: 220, headingDeg: 118, bankDeg: 0 }, W15);
}
if (which === 'all' || which === 'high') {
  summarize('G. High Key button at 5,500 ft (practice)', { x: TH.x, y: TH.y, alt: 5500, kias: 120, headingDeg: RWY, bankDeg: 0 }, CALM, { practice: true });
  summarize('G2. High Key at 6,500 ft (practice, above window)', { x: TH.x, y: TH.y, alt: 6500, kias: 120, headingDeg: RWY, bankDeg: 0 }, CALM, { practice: true });
  summarize('G3. High Key at 5,900 ft (practice, top of window)', { x: TH.x, y: TH.y, alt: 5900, kias: 120, headingDeg: RWY, bankDeg: 0 }, CALM, { practice: true });
  summarize('G4. Low Key start, 3,700, hdg 118 (spec test case)', { ...geoCalm.at(180), alt: 3700, kias: 120, headingDeg: 118, bankDeg: 0 }, CALM);
  summarize('G5. Low Key start 3,700 in 20 kt from 208', { ...geoCalm.at(180), alt: 3700, kias: 120, headingDeg: 118, bankDeg: 0 }, { windFromDeg: 208, windKt: 20 });
  summarize('G6. Low Key start high: 4,300 ft', { ...geoCalm.at(180), alt: 4300, kias: 120, headingDeg: 118, bankDeg: 0 }, CALM);
  summarize('H. Area PFL 3 NM, 10,000 ft from 120', area(120, 3, 10000), CALM);
  summarize('H2. Pattern PFL high: inner downwind 4,600 ft 140 kt (after a go-around climb)', { x: 2300, y: -6450, alt: 4600, kias: 140, headingDeg: 118, bankDeg: 0 }, CALM);
}
if (which === 'all' || which === 'short') {
  summarize('I. Area PFL 8 NM 5,000 ft (too far)', area(120, 8, 5000), CALM);
  summarize('I2. Area PFL 3 NM south 3,000 ft heading north (toward LK)', area(180, 3, 3200), CALM);
  summarize('I3. PFL on final 2 NM out 2,500 ft 120 kt', { ...along(-2 * FT_NM), alt: 2500, kias: 120, headingDeg: RWY, bankDeg: 0 }, CALM);
  summarize('I4. PFL 2 NM east of threshold heading away (hdg 118) 3,500 ft 140', { x: TH.x + 2 * FT_NM, y: TH.y - 1000, alt: 3500, kias: 140, headingDeg: 118, bankDeg: 0 }, CALM);
  summarize('I5. Area 6 NM 8000 in 30 kt headwind-ish (wind 299/30)', area(120, 6, 8000), { windFromDeg: 299, windKt: 30 });
}
