// Design sketches for transitions/design.md. A rough point-mass sketch (constant KIAS per aircraft,
// instant bank limited to 15-70 deg), NOT the planner: it only shows the shape and gives first numbers.
// Run: node make-pictures.mjs   (reads src/core read-only, writes SVGs beside this file)
import { writeFileSync } from 'node:fs';
import { turnRateFromBankRadPerSec } from '/home/user/Dads-debreif/src/core/flight-math.js';
import { iasToTasKt } from '/home/user/Dads-debreif/src/core/t6-performance.js';
import { KT_TO_FTPS } from '/home/user/Dads-debreif/src/core/units.js';
const D = Math.PI / 180, dt = 0.05, ALT = 8000;
const tas = (k) => iasToTasKt(k, ALT) * KT_TO_FTPS;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const bankFor = (v, rate) => Math.atan(Math.abs(rate) * v / 32.174) / D;

// Lead turns at 30 deg bank, 200 KIAS, toward (+1 left) or away from the wingman; #2 starts abeam on the right at 6000 ft, 220 KIAS.
function rejoin({ leadDir, lineDeg = 45, wingKias = 220, leadBank = 30 }) {
  const vl = tas(200), vw = tas(wingKias);
  let L = { x: 0, y: 0, h: Math.PI / 2 }, W = { x: 6000, y: 0, h: Math.PI / 2 };
  const pl = [[L.x, L.y]], pw = [[W.x, W.y]]; let t = 0, banks = [], minRange = 1e9;
  for (; t < 400; t += dt) {
    L.h += leadDir * turnRateFromBankRadPerSec(vl, leadBank) * dt;
    L.x += Math.cos(L.h) * vl * dt; L.y += Math.sin(L.h) * vl * dt;
    const dx = L.x - W.x, dy = L.y - W.y, range = Math.hypot(dx, dy);
    const los = Math.atan2(dy, dx), brg = wrap(los - W.h); // + = lead to the wingman's left
    // wanted bearing: lead 45 deg off the nose, on the outside of the turn (10:30 for a right turn, 1:30 for a left)
    const target = -leadDir * lineDeg * D;
    const err = wrap(brg - target);
    const losRate = ((vl * Math.sin(L.h - los)) - (vw * Math.sin(W.h - los))) / Math.max(range, 1);
    let rate = losRate + 0.8 * err; // hold the line
    rate = Math.sign(rate) * Math.min(Math.abs(rate), turnRateFromBankRadPerSec(vw, 70));
    W.h += rate * dt; W.x += Math.cos(W.h) * vw * dt; W.y += Math.sin(W.h) * vw * dt;
    banks.push(bankFor(vw, rate));
    if (t % 0.5 < dt) { pl.push([L.x, L.y]); pw.push([W.x, W.y]); }
    minRange = Math.min(minRange, range);
    if (range < 400) break;
  }
  const closure = (vw - vl) / KT_TO_FTPS;
  return { t, pl, pw, endRange: Math.round(Math.hypot(L.x - W.x, L.y - W.y)), bankMax: Math.max(...banks).toFixed(0), bankMean: (banks.reduce((a, b) => a + b, 0) / banks.length).toFixed(0), overtakeKt: closure.toFixed(0), turnedDeg: Math.round(Math.abs(wrap(L.h - Math.PI / 2)) / D) };
}

function svg(title, runs, w = 760, h = 520) {
  const all = runs.flatMap((r) => [...r.pl, ...r.pw]);
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const x0 = Math.min(...xs) - 800, x1 = Math.max(...xs) + 800, y0 = Math.min(...ys) - 800, y1 = Math.max(...ys) + 800;
  const s = Math.min((w - 40) / (x1 - x0), (h - 60) / (y1 - y0));
  const X = (x) => 20 + (x - x0) * s, Y = (y) => h - 20 - (y - y0) * s;
  const path = (pts, c, dash = '') => `<polyline fill="none" stroke="${c}" stroke-width="2" ${dash} points="${pts.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')}"/>`;
  let body = `<rect width="${w}" height="${h}" fill="#fff"/><text x="20" y="22" font-family="sans-serif" font-size="15" font-weight="bold">${title}</text>`;
  for (const r of runs) {
    body += path(r.pl, '#1f77b4') + path(r.pw, '#2ca02c', 'stroke-dasharray="6 3"');
    const e = r.pl[r.pl.length - 1], f = r.pw[r.pw.length - 1];
    body += `<circle cx="${X(r.pl[0][0])}" cy="${Y(r.pl[0][1])}" r="4" fill="#1f77b4"/><circle cx="${X(r.pw[0][0])}" cy="${Y(r.pw[0][1])}" r="4" fill="#2ca02c"/>`;
    body += `<circle cx="${X(e[0])}" cy="${Y(e[1])}" r="5" fill="none" stroke="#1f77b4"/><circle cx="${X(f[0])}" cy="${Y(f[1])}" r="5" fill="none" stroke="#2ca02c"/>`;
  }
  body += `<text x="20" y="${h - 4}" font-family="sans-serif" font-size="11">Blue solid = Lead (200 KIAS, 30 deg bank). Green dashed = #2 (220 KIAS). Filled dot = start, ring = end. 1 px = ${(1 / s).toFixed(0)} ft. Sketch, not the planner.</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

const results = {};
for (const [name, leadDir] of [['turn-away', 1], ['turn-into', -1]]) {
  const r = rejoin({ leadDir });
  results[name] = r;
  writeFileSync(new URL(`rejoin-from-lab-${name}.svg`, import.meta.url), svg(`Turning rejoin from line abreast, Lead turns ${name === 'turn-away' ? 'away from' : 'into'} #2`, [r]));
}
for (const [k, r] of Object.entries(results)) console.log(k, { seconds: r.t.toFixed(0), endRangeFt: r.endRange, bankMax: r.bankMax, bankMean: r.bankMean, overtakeKt: r.overtakeKt, leadTurnedDeg: r.turnedDeg });

// ---- Picture 3: where #2 sits in each formation (three scales, Lead at the origin, flying up the page) ----
function positions() {
  const W = 900, H = 330; let b = `<rect width="${W}" height="${H}" fill="#fff"/><g font-family="sans-serif" font-size="11">`;
  const panel = (x0, w, title, scaleFt, items, bar) => {
    const s = (w - 40) / (2 * scaleFt), cx = x0 + w / 2, cy = 120;
    let o = `<rect x="${x0}" y="30" width="${w}" height="270" fill="none" stroke="#999"/><text x="${x0 + 8}" y="46" font-weight="bold">${title}</text>`;
    o += `<polygon points="${cx},${cy - 9} ${cx - 6},${cy + 6} ${cx + 6},${cy + 6}" fill="#1f77b4"/><text x="${cx + 9}" y="${cy + 4}">Lead</text>`;
    for (const [n, lat, aft, c] of items) { const px = cx + lat * s, py = cy + aft * s; o += `<polygon points="${px},${py - 7} ${px - 5},${py + 5} ${px + 5},${py + 5}" fill="${c || '#2ca02c'}"/><text x="${px + 8}" y="${py + 4}">${n}</text>`; }
    o += `<line x1="${cx - 60}" y1="285" x2="${cx - 60 + bar * s}" y2="285" stroke="#000" stroke-width="2"/><text x="${cx - 60}" y="297">${bar} ft</text>`;
    return o;
  };
  // sweep angle is measured back from Lead's 3/9 line (SMM 12.29 para 69; 16.18 para 49)
  const fw = (sweep, rng) => [rng * Math.cos(sweep * D), rng * Math.sin(sweep * D)];
  b += panel(10, 280, 'Close (scale 100 ft): estimates', 100, [['Echelon R (est.)', 45, 25], ['Route R (1-3 spans)', 90, 25, '#9467bd'], ['Line astern', 0, 10, '#8c564b']], 50);
  const a = fw(30, 1000), c = fw(60, 500), m = fw(45, 750);
  b += panel(300, 280, 'Fighting wing (scale 1,000 ft)', 1200, [['30 deg, 1,000 ft', ...a], ['45 deg, 750 ft', ...m], ['60 deg, 500 ft', ...c]], 500);
  b += panel(590, 300, 'Line abreast (scale 6,000 ft)', 7000, [['4,000 ft', 4000, 0, '#d62728'], ['6,000 ft', 6000, 0], ['10 deg sweep limit', 6000, 6000 * Math.tan(10 * D), '#999']], 2000);
  b += `<text x="10" y="322">Sources: route 1-3 wingspans SMM 12.6 para 15; fighting wing 30-60 deg sweep, 500-1,000 ft SMM 12.29 para 69; line abreast 4,000-6,000 ft, 0-10 deg SMM 16.18 para 49. Close offsets are estimates.</text></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${b}</svg>`;
}
writeFileSync(new URL('formation-positions.svg', import.meta.url), positions());

// ---- Picture 4: the change-formation control on the Turn Sim screen (mock-up, text only) ----
function screen() {
  const W = 860, H = 430; const t = (x, y, s, o = '') => `<text x="${x}" y="${y}" ${o}>${s}</text>`;
  const btn = (x, y, w, s, on = true) => `<rect x="${x}" y="${y}" width="${w}" height="24" rx="4" fill="${on ? '#e8eef7' : '#f0f0f0'}" stroke="#889"/>` + t(x + 8, y + 16, s, `fill="${on ? '#000' : '#999'}"`);
  let b = `<rect width="${W}" height="${H}" fill="#fff"/><g font-family="sans-serif" font-size="12">`;
  b += `<rect x="10" y="10" width="220" height="410" fill="none" stroke="#999"/>` + t(18, 28, 'LEFT: buttons', 'font-weight="bold"');
  b += t(18, 48, 'Change formation (new)', 'font-weight="bold"');
  b += btn(18, 56, 96, 'Line abreast') + btn(120, 56, 100, 'Fighting wing');
  b += btn(18, 86, 96, 'Echelon') + btn(120, 86, 100, 'Fluid manoeuv.');
  b += btn(18, 116, 96, 'Route') + t(122, 133, 'Side: Keep | L | R', 'font-size="11"');
  b += t(18, 160, '+ More: Line astern, rejoin options', 'font-size="11" fill="#555"');
  b += t(18, 176, '  (4-ship adds Finger, Box, Spread 4,', 'font-size="11" fill="#555"') + t(18, 190, '   Offset box when 4 aircraft exist)', 'font-size="11" fill="#555"');
  b += t(18, 214, 'Manoeuvres (as V2.6)', 'font-weight="bold"');
  b += btn(18, 222, 96, 'Delayed 90') + btn(120, 222, 100, 'Delayed 45') + btn(18, 252, 96, 'Check 20') + btn(120, 252, 100, 'In place 90');
  b += btn(18, 282, 96, 'Hook') + btn(120, 282, 100, 'Shackle') + btn(18, 312, 96, 'Cross turn');
  b += t(18, 350, 'Setup: Spacing, #2 on Lead\'s (unchanged)', 'font-size="11"') + t(18, 366, '220 KIAS . 8,000 ft . 3 G . still air', 'font-size="11"');
  b += `<rect x="240" y="10" width="360" height="410" fill="#f7fbff" stroke="#999"/>` + t(250, 28, 'CENTRE: the picture (as V2.6)', 'font-weight="bold"') + t(250, 48, 'Both paths drawn dashed ahead; a range ring', 'font-size="11"') + t(250, 62, 'and closure arrow show only during a rejoin.', 'font-size="11"');
  b += `<rect x="610" y="10" width="240" height="410" fill="none" stroke="#999"/>` + t(618, 28, 'RIGHT: Formation card', 'font-weight="bold"');
  b += t(618, 50, 'Now: Line abreast, right') + t(618, 66, 'Flying: LAB to Echelon right (hot turning rejoin)') ;
  b += t(618, 90, 'Lead 200 KIAS  30 deg  1.2 G', 'font-size="11"') + t(618, 104, '#2   215 KIAS  42 deg  1.3 G', 'font-size="11"');
  b += t(618, 128, 'Rejoin (only while rejoining)', 'font-weight="bold"') + t(618, 144, 'Range 2,400 ft  Closure 14 kt', 'font-size="11"') + t(618, 158, 'Lead at 1:30   Line: ON LINE', 'font-size="11"') + t(618, 172, 'Height: 40 ft below Lead  (OK)', 'font-size="11"');
  b += t(618, 200, 'When established, judged:', 'font-weight="bold"') + t(618, 216, 'Echelon right: ON STATION', 'font-size="11"') + t(618, 230, 'lateral 44 ft  aft 27 ft  down 6 ft', 'font-size="11"');
  b += t(618, 254, 'Other states: LAB on spacing / wide / tight / fore / aft;', 'font-size="11"') + t(618, 268, 'FW range and sweep in band; route 1-3 spans', 'font-size="11"');
  b += t(618, 396, 'Numbers shown are examples, not results.', 'font-size="10" fill="#777"');
  b += `</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${b}</svg>`;
}
writeFileSync(new URL('screen-change-formation.svg', import.meta.url), screen());
