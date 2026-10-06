// Draws the design pictures for design.md as SVG (plain text, no packages); render-png.mjs turns them into PNGs.
// They are my own drawings, not the manuals' figures. Offsets in feet for the close formations are ESTIMATES (see design.md section 3).
// Run: node make-pictures.mjs && node render-png.mjs
import { writeFileSync } from 'node:fs';
import { NODES, edges } from './graph-data.mjs';
const here = new URL('.', import.meta.url).pathname;
const C = { ink: '#1f2430', mute: '#697080', grid: '#d9dde3', paper: '#ffffff', card: '#f5f7fa', ok: '#2e7d32', warn: '#b3261e', amber: '#b26a00', 1: '#1c5fa8', 2: '#d1561a', 3: '#2e7d32', 4: '#8a2be2' };
const NAME = { 1: 'Lead', 2: '#2', 3: '#3', 4: '#4' };
const head = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="13"><rect width="${w}" height="${h}" fill="${C.paper}"/>`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const T = (x, y, s, o = {}) => `<text x="${x}" y="${y}" fill="${o.c ?? C.ink}" font-size="${o.s ?? 13}" font-weight="${o.w ?? 400}" text-anchor="${o.a ?? 'start'}"${o.i ? ' font-style="italic"' : ''}>${esc(s)}</text>`;
const L = (x1, y1, x2, y2, o = {}) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.c ?? C.ink}" stroke-width="${o.w ?? 1.5}"${o.d ? ` stroke-dasharray="${o.d}"` : ''}${o.arrow ? ' marker-end="url(#ar)"' : ''}/>`;
const R = (x, y, w, h, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r ?? 6}" fill="${o.f ?? 'none'}" stroke="${o.c ?? C.ink}" stroke-width="${o.w ?? 1.2}"${o.d ? ` stroke-dasharray="${o.d}"` : ''}/>`;
const defs = `<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${C.ink}"/></marker></defs>`;
/** Plane glyph, nose toward heading `deg` (0 up), size k (1 = 26 px span). */
const plane = (x, y, deg, col, label, k = 1, lx = 14, ly = 4) => `<g transform="translate(${x},${y}) rotate(${deg}) scale(${k})"><path d="M0 -13 L3 -3 L13 3 L13 6 L3 4 L2 11 L6 13 L6 15 L0 14 L-6 15 L-6 13 L-2 11 L-3 4 L-13 6 L-13 3 L-3 -3 z" fill="${col}"/></g>${label ? T(x + lx * k, y + ly, label, { c: col, w: 700, s: 12 }) : ''}`;
const save = (name, svg) => writeFileSync(here + name + '.svg', svg + '</svg>');

// positions in Lead's frame: [back, left] feet, Lead at [0,0]; height below Lead in feet as third entry (estimates for the close ones)
const E = { back: 25, lat: 45, down: 5 }; // one echelon step (estimate, transitions design section 2)
const close = {
  'Finger left (#3 #4 on the left)': { 1: [0, 0, 0], 2: [E.back, -E.lat, E.down], 3: [E.back, E.lat, E.down], 4: [2 * E.back, 2 * E.lat, 2 * E.down] },
  'Finger right': { 1: [0, 0, 0], 2: [E.back, E.lat, E.down], 3: [E.back, -E.lat, E.down], 4: [2 * E.back, -2 * E.lat, 2 * E.down] },
  'Echelon left': { 1: [0, 0, 0], 2: [E.back, E.lat, E.down], 3: [2 * E.back, 2 * E.lat, 2 * E.down], 4: [3 * E.back, 3 * E.lat, 3 * E.down] },
  'Echelon right': { 1: [0, 0, 0], 2: [E.back, -E.lat, E.down], 3: [2 * E.back, -2 * E.lat, 2 * E.down], 4: [3 * E.back, -3 * E.lat, 3 * E.down] },
  'Box': { 1: [0, 0, 0], 2: [E.back, E.lat, E.down], 3: [E.back, -E.lat, E.down], 4: [45, 0, 8] },
  'Line astern (trail)': { 1: [0, 0, 0], 2: [45, 0, 8], 3: [90, 0, 16], 4: [135, 0, 24] },
};

const wrapText = (g, x, y, text, max, o = {}) => { const words = text.split(' '); let line = ''; let yy = y; for (const w of words) { if ((line + ' ' + w).length > max) { g.s += T(x, yy, line.trim(), o); yy += (o.s ?? 13) + 3; line = ''; } line += ' ' + w; } if (line.trim()) { g.s += T(x, yy, line.trim(), o); yy += (o.s ?? 13) + 3; } return yy; };

// ---------------- Fig 1: close formations ----------------
{
  const W = 1100, H = 640, s = 1.0; // 1 ft = 1 px
  let g = head(W, H) + defs;
  g += T(20, 28, 'Close four-ship formations: where each aircraft sits (top view, Lead flies up, to scale)', { w: 700, s: 16 });
  g += T(20, 48, 'My own drawing. Sides: SMM Fig 16.27 and 16.32 paras 87-91, AFM7 brief pp.18-20. Feet are ESTIMATES (echelon step 25 ft back, 45 ft out, 5 ft down).', { c: C.mute, s: 12 });
  Object.keys(close).forEach((n, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const ox = 190 + col * 360, oy = 120 + row * 255;
    g += R(ox - 170, oy - 55, 340, 235, { c: C.grid, r: 8 });
    g += T(ox - 160, oy - 36, n, { w: 700, s: 14 });
    for (const id of [1, 2, 3, 4]) { const [b, l] = close[n][id]; g += plane(ox - l * s, oy + 10 + b * s, 0, C[id], NAME[id], 1.0, 17, 4); }
    g += T(ox - 160, oy + 168, n.startsWith('Line') ? 'each flies line astern on the one ahead' : n === 'Box' ? '#4 flies line astern on Lead (SMM 16.23 para 73)' : n.startsWith('Finger') ? '#4 echelon on #3; #3 and #2 echelon on Lead' : '#2, #3, #4 each echelon on the one ahead', { c: C.mute, s: 11 });
  });
  g += T(20, H - 30, 'Finger left: #3 and #4 on the left, #2 on the right (a right turn means "join finger left", SMM 16.38 para 106).', { c: C.mute, s: 12 });
  g += T(20, H - 12, 'Echelon left: all three wingmen on the left. Box: #2 and #3 on Lead\'s wings, #4 line astern (about 10 ft behind Lead\'s tail, below the prop wash, SMM 12.5 para 13).', { c: C.mute, s: 12 });
  save('fig1-close-formations', g);
}

// ---------------- Fig 2: big formations ----------------
{
  const S = 6000, TRAIL = 7000;
  const big = [
    { title: 'Spread 4 (SMM 16.42 para 113; AFM8 p.15)', sub: '4,000-6,000 ft between neighbours; start on 6,000 (wide)', pos: { 2: [0, S], 3: [0, -S], 4: [0, -2 * S] }, scale: 0.026, bar: 6000, ref: { 2: 1, 3: 1, 4: 3 } },
    { title: 'Offset box (SMM 16.41 para 109; AFM8 pp.20-22)', sub: 'rear element 6,000-8,000 ft back (default 7,000); #3 in the slot, #4 outside #2', pos: { 2: [0, S], 3: [TRAIL, S / 2], 4: [TRAIL, S + S / 2] }, scale: 0.022, bar: 6000, ref: { 2: 1, 3: 1, 4: 3 } },
    { title: 'Fluid 4 (AFM8 p.20): two fighting-wing pairs abreast', sub: '#3 at wide LAB (6,000 ft) on Lead; #2 and #4 in fighting wing on the outside', pos: { 2: [460, -460], 3: [0, S], 4: [460, S + 460] }, scale: 0.05, bar: 1000, ref: { 2: 1, 3: 1, 4: 3 } },
    { title: 'Four-ship fighting wing (SMM 16.38 para 104; AFM7 p.14)', sub: 'each 500-1,000 ft behind the one ahead; #3 and #4 on the side opposite #2', pos: { 2: [460, 460], 3: [785, -103], 4: [1110, -666] }, scale: 0.14, bar: 500, ref: { 2: 1, 3: 2, 4: 3 } },
  ];
  const W = 1180, H = 940;
  let g = head(W, H) + defs;
  g += T(20, 28, 'The big formations (top view, Lead flies up; each panel has its own scale) and the altitude stack', { w: 700, s: 16 });
  g += T(20, 48, 'My own drawing. FW offsets (#2 at 45 deg sweep, #3 and #4 at 30, range 650 ft) are ESTIMATES. Spacing, trail and stack are the manuals\'.', { c: C.mute, s: 12 });
  big.forEach((f, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const ox = 20 + col * 580, oy = 70 + row * 290;
    g += R(ox, oy, 560, 275, { c: C.grid, r: 8 });
    g += T(ox + 10, oy + 20, f.title, { w: 700, s: 13 });
    g += T(ox + 10, oy + 37, f.sub, { c: C.mute, s: 11 });
    const pts = { 1: [0, 0], ...f.pos };
    const ls = Object.values(pts).map((p) => p[1]); const mid = (Math.min(...ls) + Math.max(...ls)) / 2;
    const X = (l) => ox + 280 - (l - mid) * f.scale, Y = (b) => oy + 85 + b * f.scale;
    for (const id of [2, 3, 4]) { const a = pts[f.ref[id]], b = pts[id]; g += L(X(a[1]), Y(a[0]), X(b[1]), Y(b[0]), { c: '#b8c0cc', d: '4 4', w: 1.2 }); }
    for (const id of [1, 2, 3, 4]) { const p = pts[id]; g += plane(X(p[1]), Y(p[0]), 0, C[id], NAME[id], 0.9, 15, 4); }
    g += L(ox + 14, oy + 258, ox + 14 + f.bar * f.scale, oy + 258, { w: 2 }) + T(ox + 20 + f.bar * f.scale, oy + 262, `${f.bar.toLocaleString('en-CA')} ft`, { s: 11, c: C.mute });
  });
  const sy = 700;
  g += T(20, sy, 'Altitude stack, Spread 4 and offset box (AFM8 p.14): #2 +300, Lead 0, #3 -300, #4 -600 ft. Low to high: 4, 3, Lead, 2. Kept while turning.', { s: 13, w: 600 });
  [[2, 300], [1, 0], [3, -300], [4, -600]].forEach(([id, h], k) => { const x = 140 + k * 250, y = sy + 90 - h * 0.12; g += L(x - 90, y, x + 90, y, { c: C.grid, w: 1 }) + plane(x, y, 0, C[id], `${NAME[id]} ${h > 0 ? '+' : ''}${h} ft`, 1, 20, 4); });
  g += T(20, sy + 205, 'Side view. The SMM (Fig 16.33) draws a different stack: #2 sets it and #3, #4 take the opposite block in 250 ft steps', { c: C.amber, s: 12 });
  g += T(20, sy + 222, '(#2 7,750, Lead 8,000, #3 8,250, #4 8,500 ft). The brief\'s is the default (TS-50).', { c: C.amber, s: 12 });
  save('fig2-big-formations', g);
}

// ---------------- Fig 3: formation graph ----------------
{
  const W = 1180, H = 640;
  const pos = { TR: [90, 540], BOX: [90, 400], FIN: [310, 330], ECH: [90, 250], RTE: [310, 540], FW: [580, 330], FM: [580, 110], S4: [850, 540], F4: [850, 220], OB: [1080, 220] };
  let g = head(W, H) + defs;
  g += T(20, 28, 'How the four-ship formations join up (one button each; the sim follows the arrows)', { w: 700, s: 16 });
  g += T(20, 48, 'Solid arrow: a move the manuals give. Dashed: my reverse of it (estimate). Fighting wing is the hub. Finger to finger is not allowed (SMM 16.33 para 93).', { c: C.mute, s: 12 });
  const edgeAt = (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; const t = Math.min(72 / Math.abs(dx || 1e-9), 28 / Math.abs(dy || 1e-9)); return [x1 + dx * t, y1 + dy * t]; };
  const seen = new Set();
  for (const e of edges()) {
    const [x1, y1] = pos[e.from], [x2, y2] = pos[e.to]; const key = [e.from, e.to].sort().join('-');
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy); const off = seen.has(key) ? 8 : -8; seen.add(key);
    const ox = (-dy / len) * off, oy = (dx / len) * off;
    const [ax, ay] = edgeAt(x1, y1, x2, y2), [bx, by] = edgeAt(x2, y2, x1, y1);
    const est = /\(est\.\)/.test(e.label) || e.src.startsWith('reverse');
    g += L(ax + ox, ay + oy, bx + ox, by + oy, { c: est ? '#8a8f9c' : C.ink, w: 1.5, d: est ? '6 4' : null, arrow: true });
  }
  for (const [k, [x, y]] of Object.entries(pos)) {
    const hub = k === 'FW';
    g += R(x - 70, y - 26, 140, 52, { f: hub ? '#fde9d8' : C.card, c: hub ? C[2] : C.ink, r: 10, w: hub ? 2.4 : 1.3 });
    g += T(x, y - 3, NODES[k], { a: 'middle', w: 700, s: 13 });
    const sub = { S4: 'LAB of four', OB: 'two LABs in trail', F4: 'two FW pairs abreast', FM: '60 deg cone, PCL max', FW: 'staircase, 500-1,000 ft', RTE: 'finger, route spacing', FIN: '#3 #4 one side, #2 other', ECH: 'all on one side', BOX: '#4 astern of Lead', TR: 'line astern' }[k];
    g += T(x, y + 14, sub, { a: 'middle', c: C.mute, s: 10.5 });
  }
  g += T(20, H - 18, 'Moves and pages: design.md section 5. Not drawn: Finger to Offset box direct (SMM 16.41 para 110 names it; the mechanics are "as briefed"), see question 4.', { c: C.mute, s: 12 });
  save('fig3-formation-graph', g);
}

// ---------------- Fig 4: G-warm ----------------
{
  const W = 1180, H = 640, s = 0.012; // 6,000 ft = 72 px
  let g = head(W, H) + defs;
  g += T(20, 28, 'G-warm from Spread 4 (SMM 16.22 paras 70-71, 16.44 para 120, Fig 16.35; AFM8 p.16)', { w: 700, s: 16 });
  g += T(20, 48, 'Top view, 6,000 ft between neighbours, all four fly the same thing. Times and the dip are ESTIMATES (my arithmetic at 220 KIAS, 248 KTAS, 8,000 ft).', { c: C.mute, s: 12 });
  const xft = { 2: 6000, 1: 0, 3: -6000, 4: -12000 }; // along the page, + is to the left of the original heading (north)
  const panel = (i, title, notes, kind) => {
    const ox = 20 + i * 290, oy = 70;
    let o = R(ox, oy, 275, 330, { c: C.grid, r: 8 }) + T(ox + 10, oy + 20, title, { w: 700, s: 12.5 });
    notes.forEach((n, k) => { o += T(ox + 10, oy + 37 + k * 14, n, { c: C.mute, s: 10.5 }); });
    const cx = ox + 140, cy = oy + 210;
    for (const id of [1, 2, 3, 4]) {
      const x = cx - (xft[id] + 3000) * s;
      if (kind === 'north') o += plane(x, cy, 0, C[id], NAME[id], 1, 14, 4);
      else if (kind === 'west') o += plane(x, cy, -90, C[id], NAME[id], 1, 0, -14);
      else if (kind === 'hook') { o += plane(x, cy, -90, '#d0d4dc', '', 1) + plane(x, cy - 2818 * s * -1 * -1 + 0, 90, C[id], NAME[id], 1, 0, -14); }
      else if (kind === 'east') o += plane(x, cy, 90, C[id], NAME[id], 1, 0, -14);
    }
    if (kind === 'hook') o += L(cx + 80, cy, cx + 80, cy + 2818 * s * -1, { c: C.mute, w: 1, arrow: true }) + T(cx + 86, cy - 20, '2,800 ft over (4 G hook diameter)', { s: 10, c: C.mute });
    return o;
  };
  g += panel(0, '1 Stand-by', ['PCL max, fuel check, 220 KIAS minimum', 'heading north, #2 on the left'], 'north');
  g += panel(1, '2 In place 90 toward #2 (3 G)', ['about 12 deg/s: roughly 8 s', 'now heading west: #2 first, #4 last, 3 NM long'], 'west');
  g += panel(2, '3 Push over 1/2 G, 5 s, then level', ['about 400 ft lower, all four alike', '"Lead sees wingman level", then the hook'], 'west');
  g += panel(3, '4 Hook away (4 G), then 90 back', ['about 17 deg/s: hook 11 s; then in place 90', 'grey: before the hook; heading east after it'], 'hook');
  const ty = 440; g += T(20, ty, 'Sequence and a first-cut timeline in seconds (estimate); the stack stays throughout', { w: 700, s: 13 });
  const seg = [['stand-by', 15, '#cfd8e3'], ['90, 3 G', 8, '#f2c9a8'], ['push 1/2 G', 10, '#c9e4c5'], ['hook 4 G', 11, '#f2c9a8'], ['calls', 4, '#cfd8e3'], ['90 back, 3 G', 8, '#f2c9a8'], ['tighten LAB to 4,000 ft', 35, '#e5d4f5']];
  let x = 20; const k = 1140 / seg.reduce((a, b) => a + b[1], 0);
  for (const [n, d, col] of seg) { g += R(x, ty + 14, d * k - 2, 44, { f: col, c: C.mute, r: 4, w: 0.8 }); g += T(x + 4, ty + 32, n, { s: 10.5 }) + T(x + 4, ty + 48, `${d} s`, { s: 10.5, c: C.mute }); x += d * k; }
  const lines = [
    'About 90 s in all. G: 3, then 1/2 for 5 s, then 4, then 3 (SMM 16.22 para 71). Fuel and tank balance are called first (Orders B2 ch 8, formation R/T).',
    'All players "fly accurate G and headings" and keep separation from the aircraft ahead (SMM 16.44 para 120). Then "tighten LAB spacing, closer to 4,000 ft" (AFM8 p.16 item 5):',
    '#2 and #3 close 2,000 ft on Lead and #4 closes 2,000 ft on #3 (a 10 degree heading change, about 30 s each; estimate).',
    'In the 2-ship the same sequence flies from line abreast with #2 only (SMM 16.22 paras 70-71): one builder serves both.',
  ];
  lines.forEach((l, n) => { g += T(20, ty + 90 + n * 18, l, { s: 12, c: n === 3 ? C.mute : C.ink }); });
  save('fig4-g-warm', g);
}

// ---------------- Fig 5: offset box via Fluid 4 ----------------
{
  const W = 1180, H = 560;
  let g = head(W, H) + defs;
  g += T(20, 28, 'Offset box via Fluid 4 (AFM8 pp.20-22; SMM 16.41 paras 109-110)', { w: 700, s: 16 });
  g += T(20, 48, 'Top view, Lead up in every frame; each frame has its own scale. Spacings are the briefs\'; the box depth is TS-18\'s 7,000 ft; FW offsets are ESTIMATES.', { c: C.mute, s: 12 });
  const frames = [
    { t: '1 Fighting wing', n: ['"FLUID 4, GO"', '#2 side set; #3, #4 opposite'], sc: 0.1, pos: { 1: [0, 0], 2: [460, -460], 3: [785, 103], 4: [1110, 666] } },
    { t: '2 Fluid 4', n: ['#3 diverges to 6,000 ft (wide LAB) on Lead', '#2 and #4 stay in FW, outside'], sc: 0.03, pos: { 1: [0, 0], 2: [460, -460], 3: [0, 6000], 4: [460, 6460] } },
    { t: '3 In place 90 (both pairs turn in FW)', n: ['"FOR OFFSET BOX RIGHT, IN PLACE 90 RIGHT"', 'the pairs end 6,000 ft apart in trail'], sc: 0.03, pos: { 1: [0, 0], 2: [460, -460], 3: [6000, 0], 4: [6460, -460] } },
    { t: '4 Elements spread to LAB: offset box', n: ['#3 in the slot, #4 outside #2; trail 7,000', '#3 calls "IN" when ready to manoeuvre'], sc: 0.02, pos: { 1: [0, 0], 2: [0, -6000], 3: [7000, -3000], 4: [7000, -9000] } },
  ];
  frames.forEach((f, i) => {
    const ox = 20 + i * 290, oy = 70;
    g += R(ox, oy, 275, 360, { c: C.grid, r: 8 }) + T(ox + 10, oy + 20, f.t, { w: 700, s: 12 });
    f.n.forEach((n, k) => { g += T(ox + 10, oy + 37 + k * 13, n, { c: C.mute, s: 10 }); });
    const ls = Object.values(f.pos).map((p) => p[1]); const mid = (Math.min(...ls) + Math.max(...ls)) / 2;
    for (const id of [1, 2, 3, 4]) { const [b, l] = f.pos[id]; g += plane(ox + 138 - (l - mid) * f.sc, oy + 90 + b * f.sc, 0, C[id], NAME[id], 0.7, 15, 4); }
  });
  const notes5 = ['Why this entry: the briefs build the offset box from fighting wing through Fluid 4 (AFM8 pp.20-22). The SMM also allows it from finger on the call',
    '"OFFSET BOX EAST/WEST", with the manoeuvring "as briefed" (SMM 16.41 para 110). The stack goes on once each aircraft is in position (AFM8 p.20 item 4):',
    '#2 +300, Lead 0, #3 -300, #4 -600 ft. Left or right box is the same, mirrored (AFM8 p.22). Frame 3 to 4 is the longest step: two lateral moves of about',
    '6,000 ft (a 10 degree heading change takes about 30 s per 2,000 ft, estimate), so roughly 1.5 to 2 minutes (estimate).'];
  notes5.forEach((t, n) => { g += T(20, 460 + n * 18, t, { s: 12, c: n === 3 ? C.mute : C.ink }); });
  save('fig5-offset-box-entry', g);
}

// ---------------- Fig 6: who moves when (gates) ----------------
{
  const W = 1180, H = 600;
  let g = head(W, H) + defs;
  g += T(20, 28, 'Who moves when: the manuals\' "wait for the one ahead" rules become start times (estimate of durations)', { w: 700, s: 16 });
  g += T(20, 48, 'Gates: SMM 16.32 para 86, AFM7 p.18 item 2d, SMM 16.34 para 96. Durations are ESTIMATES (2-ship slide rate, about 5 kt = 8 ft/s).', { c: C.mute, s: 12 });
  const rows = [
    { t: 'Finger to echelon, same side (SMM 16.32 para 87)', total: 40, bars: [[3, 0, 8, 'out, back, down'], [4, 0, 8, 'with #3'], [2, 6, 22, 'crosses behind and below'], [3, 28, 8, 'regain'], [4, 28, 8, 'regain']] },
    { t: 'Finger to box (SMM 16.32 para 91)', total: 40, bars: [[4, 0, 16, 'back and down, behind #3'], [4, 16, 10, 'loose line astern'], [4, 26, 12, 'power: normal line astern']] },
    { t: 'Rejoin from FW to finger, straight ahead (AFM7 p.18 item 2; SMM 16.34 para 95)', total: 100, bars: [[2, 0, 40, 'to route, stack kept'], [2, 40, 15, 'stack off, echelon'], [3, 26, 40, 'to route'], [3, 66, 15, 'echelon'], [4, 52, 40, 'to route'], [4, 92, 12, 'echelon']] },
  ];
  let y = 80;
  for (const r of rows) {
    g += T(20, y, r.t, { w: 700, s: 13 }); y += 10;
    const k = 1000 / 105;
    [2, 3, 4].forEach((id, n) => { g += T(20, y + 22 + n * 30, NAME[id], { c: C[id], w: 700, s: 12 }); });
    for (const [id, t0, d, label] of r.bars) { const row = id - 2; g += R(70 + t0 * k, y + 8 + row * 30, d * k - 2, 22, { f: C[id], c: C[id], r: 4, w: 0.5 }).replace('fill="' + C[id] + '"', `fill="${C[id]}" fill-opacity="0.22"`) + T(70 + t0 * k + 4, y + 23 + row * 30, label, { s: 10.5 }); }
    g += T(1090, y + 100, `about ${r.total} s`, { s: 11, c: C.mute, a: 'end' });
    y += 120;
  }
  g += T(20, y, 'A gate is "the aircraft ahead has finished its leg": known from the plan, not sensed, so the next one starts at that planned time.', { s: 12, c: C.mute });
  g += T(20, y + 18, 'If a leg cannot be solved, nothing starts and the card says which aircraft is the problem.', { s: 12, c: C.mute });
  save('fig6-gates', g);
}

// ---------------- Fig 7: lean screen ----------------
{
  const W = 1180, H = 700;
  let g = head(W, H) + defs;
  g += T(20, 28, 'Lean screen with four aircraft (the 2-ship screen plus the 4-ship buttons)', { w: 700, s: 16 });
  g += T(20, 48, 'My own mock-up. Nothing new appears with two aircraft. V6 has no formation-change buttons, so nothing of V6\'s moves or goes.', { c: C.mute, s: 12 });
  // left column
  g += R(20, 70, 300, 600, { c: C.grid, r: 8 });
  g += T(32, 92, 'Change formation (4-ship)', { w: 700, s: 13 });
  const btn = (x, y, w, label, o = {}) => R(x, y, w, 30, { f: o.on ? '#fde9d8' : o.grey ? '#eceef2' : C.card, c: o.on ? C[2] : C.grid, r: 6, w: o.on ? 2 : 1 }) + T(x + w / 2, y + 20, label, { a: 'middle', s: 12, c: o.grey ? C.mute : C.ink, w: o.on ? 700 : 400 });
  const bs = [['Spread 4', { on: true }], ['Fighting wing'], ['Fluid 4'], ['Fluid manoeuv.'], ['Offset box'], ['Finger'], ['Echelon'], ['Box']];
  bs.forEach(([l, o], i) => { g += btn(32 + (i % 2) * 140, 102 + Math.floor(i / 2) * 36, 130, l + (o?.on ? ' (here)' : ''), o || {}); });
  g += T(32, 262, 'Side: Keep | L | R', { s: 12, c: C.mute }) + T(32, 280, 'More: Line astern, Route, Rejoin type,', { s: 11, c: C.mute }) + T(32, 294, 'stack on/off, overtake KIAS, box depth', { s: 11, c: C.mute });
  g += T(32, 326, 'Manoeuvres (for the formation you are in)', { w: 700, s: 12 });
  ['Delayed 90', 'Delayed 45', 'Check 20', 'In place 90', 'Hook', 'G-warm'].forEach((l, i) => { g += btn(32 + (i % 2) * 140, 338 + Math.floor(i / 2) * 36, 130, l, {}); });
  g += T(32, 458, 'In fighting wing: Lead\'s FW buttons (level turn,', { s: 11, c: C.mute }) + T(32, 472, 'wings level, climb, descend, terminate). In fluid', { s: 11, c: C.mute }) + T(32, 486, 'manoeuvring: the FM set (60/2 turn, wingover, roll).', { s: 11, c: C.mute });
  g += T(32, 508, 'Greyed with a reason when they do not apply:', { s: 11, c: C.mute }) + T(32, 522, 'G-warm only in Spread 4; no shackle or cross turn', { s: 11, c: C.mute }) + T(32, 536, 'in a four-ship (SMM 16.43 para 118; TS-16).', { s: 11, c: C.mute });
  g += T(32, 568, 'Appear only with four aircraft: Spread 4, Fluid 4,', { s: 11, c: C.amber }) + T(32, 582, 'Offset box, Finger, Box, G-warm.', { s: 11, c: C.amber });
  // centre
  g += R(340, 70, 500, 600, { c: C.grid, r: 8 }) + T(352, 92, 'Plan view (follow camera, 3/9 line, planned paths)', { w: 700, s: 13 });
  [[2, 450, 330], [1, 560, 330], [3, 670, 330], [4, 780, 330]].forEach(([id, x, y]) => { g += plane(x - 60, y, 0, C[id], NAME[id], 1, 14, 4); });
  g += L(380, 350, 800, 350, { c: C.mute, d: '3 4', w: 1 }) + T(386, 366, '3/9 line', { s: 10.5, c: C.mute });
  g += T(352, 420, 'Close formations: the camera zooms in below about 1,000 ft', { s: 11, c: C.mute }) + T(352, 436, '(transitions design question 8), so finger, echelon and box can be read.', { s: 11, c: C.mute });
  g += T(352, 470, 'Rejoin or station change in flight: the card\'s gate line says', { s: 11, c: C.mute }) + T(352, 486, '"waiting on #2" and the plan view shows each leg dashed.', { s: 11, c: C.mute });
  g += T(352, 630, 'One fixed line: 220 KIAS - 8,000 ft - 3 G turns - stack', { s: 11, c: C.mute }) + T(352, 646, '#2 +300, Lead 0, #3 -300, #4 -600 (AFM8 p.14) - version label', { s: 11, c: C.mute });
  // right card
  g += R(860, 70, 300, 600, { c: C.grid, r: 8 }) + T(872, 92, 'Formation card', { w: 700, s: 13 });
  const card = [['Now: Spread 4, #2 on the left', C.ink, 600], ['Flying: Spread 4 to Fighting wing (TRJ)', C.ink, 400], ['', 0, 0], ['#2 off Lead  4,980 ft abeam, sweep 1 deg', C.ink, 400], ['#3 off Lead  5,020 ft abeam, sweep 0 deg', C.ink, 400], ['#4 off #3    5,010 ft abeam, sweep 2 deg', C.ink, 400], ['Heights vs Lead: +300 / -300 / -600 ft', C.ink, 400], ['', 0, 0], ['Gates: #2 stable ok | #3 closing | #4 waits', C.amber, 600], ['Rejoin: range 2,300 ft, closure 18 kt,', C.ink, 400], ['  Lead at 10:30, ON LINE; below Lead ok', C.ink, 400], ['', 0, 0], ['Judged on roll-out, each link:', C.mute, 400], ['#2 IN BAND (620 ft, 41 deg)', C.ok, 600], ['#3 TOO FAR (1,240 ft)', C.amber, 600], ['#4 off #3 IN BAND', C.ok, 600], ['', 0, 0], ['Lead 200 KIAS 30 deg 1.2 G', C.mute, 400], ['#2 215 KIAS 45 deg 1.4 G', C.mute, 400], ['#3 218 KIAS 38 deg 1.3 G', C.mute, 400], ['#4 220 KIAS 20 deg 1.1 G', C.mute, 400]];
  card.forEach(([t, c, w], i) => { if (t) g += T(872, 118 + i * 20, t, { s: 11, c, w }); });
  g += T(872, 650, 'Example numbers only (drawn, not flown).', { s: 10.5, c: C.mute, i: true });
  save('fig7-screen', g);
}
