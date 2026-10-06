// Draws the design pictures for design.md as SVG (plain text, no packages). They are my own drawings,
// not the manuals' figures. Run: node make-figures.mjs && node render-png.mjs
import { writeFileSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
const C = { ink: '#1f2430', mute: '#697080', grid: '#d9dde3', lead: '#1c5fa8', wing: '#d1561a', fw: '#f2c9a8', fm: '#b9d7ee', bubble: '#b3261e', ok: '#2e7d32', paper: '#ffffff', card: '#f5f7fa' };
const D = Math.PI / 180;
const head = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="13"><rect width="${w}" height="${h}" fill="${C.paper}"/>`;
const T = (x, y, s, o = {}) => `<text x="${x}" y="${y}" fill="${o.c ?? C.ink}" font-size="${o.s ?? 13}" font-weight="${o.w ?? 400}" text-anchor="${o.a ?? 'start'}"${o.i ? ' font-style="italic"' : ''}>${String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`;
const L = (x1, y1, x2, y2, o = {}) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.c ?? C.ink}" stroke-width="${o.w ?? 1.5}"${o.d ? ` stroke-dasharray="${o.d}"` : ''}${o.arrow ? ' marker-end="url(#ar)"' : ''}/>`;
const R = (x, y, w, h, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r ?? 6}" fill="${o.f ?? 'none'}" stroke="${o.c ?? C.ink}" stroke-width="${o.w ?? 1.2}"${o.d ? ` stroke-dasharray="${o.d}"` : ''}/>`;
const defs = `<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${C.ink}"/></marker></defs>`;
/** A little aeroplane glyph at (x,y), nose toward heading `deg` (0 = up, clockwise). */
const plane = (x, y, deg, col, label, lx = 12, ly = 4) => `<g transform="translate(${x},${y}) rotate(${deg})"><path d="M0 -13 L3 -3 L13 3 L13 6 L3 4 L2 11 L6 13 L6 15 L0 14 L-6 15 L-6 13 L-2 11 L-3 4 L-13 6 L-13 3 L-3 -3 z" fill="${col}"/></g>${label ? T(x + lx, y + ly, label, { c: col, w: 600 }) : ''}`;
const wedge = (cx, cy, r1, r2, a1, a2, fill, o = {}) => {
  // angles measured from straight down (the tail), positive toward screen-right
  const p = (r, a) => [cx + r * Math.sin(a * D), cy + r * Math.cos(a * D)];
  const [x1, y1] = p(r2, a1), [x2, y2] = p(r2, a2), [x3, y3] = p(r1, a2), [x4, y4] = p(r1, a1);
  return `<path d="M${x1} ${y1} A${r2} ${r2} 0 0 ${a2 > a1 ? 0 : 1} ${x2} ${y2} L${x3} ${y3} A${r1} ${r1} 0 0 ${a2 > a1 ? 1 : 0} ${x4} ${y4} z" fill="${fill}" fill-opacity="${o.op ?? 0.8}" stroke="${o.c ?? 'none'}" stroke-width="1"${o.d ? ` stroke-dasharray="${o.d}"` : ''}/>`;
};

// ---------------- Figure 1: the cones ----------------
{
  const W = 1040, H = 660, s = 0.36; // 1,000 ft = 360 px
  const cx = 340, cy = 250;
  let g = head(W, H) + defs;
  g += T(24, 30, 'Where the wingman sits: fighting wing wedge and fluid manoeuvring cone (top view, Lead up)', { w: 600, s: 16 });
  g += T(24, 50, 'My own drawing. Ranges and angles from SMM 12.29 para 69 / Fig 12.19, SMM 16.17 paras 42 and 44, AFM7 brief p.14 and p.17, EFIG p.391.', { c: C.mute });
  for (const ft of [500, 1000]) g += `<path d="M${cx - ft * s} ${cy} A${ft * s} ${ft * s} 0 0 0 ${cx + ft * s} ${cy}" fill="none" stroke="${C.mute}" stroke-dasharray="4 4"/>` + T(cx + 6, cy + ft * s + 14, `${ft} ft`, { c: C.mute, s: 12 });
  // mirror image (other side) lighter
  g += wedge(cx, cy, 500 * s, 1000 * s, -30, -60, C.fw, { op: 0.35 });
  g += wedge(cx, cy, 500 * s, 1000 * s, 30, 60, C.fw, { op: 0.95, c: C.wing });
  // FM cone: my reading, 60 degrees wide in all, 30 either side of the tail
  g += wedge(cx, cy, 500 * s, 1000 * s, -30, 30, C.fm, { op: 0.7, c: C.lead });
  // other reading dashed, 60 either side
  g += `<path d="M${cx} ${cy} L${cx + 1000 * s * Math.sin(60 * D)} ${cy + 1000 * s * Math.cos(60 * D)} M${cx} ${cy} L${cx - 1000 * s * Math.sin(60 * D)} ${cy + 1000 * s * Math.cos(60 * D)}" stroke="${C.lead}" stroke-dasharray="6 5" fill="none"/>`;
  g += `<circle cx="${cx}" cy="${cy}" r="${500 * s}" fill="none" stroke="${C.bubble}" stroke-width="2"/>`;
  g += L(cx, cy, cx, cy + 1040 * s, { c: C.mute, d: '2 4', w: 1 }) + T(cx + 4, cy + 1040 * s + 14, 'Lead’s six o’clock', { c: C.mute, s: 12 });
  g += L(cx - 320, cy, cx + 320, cy, { c: C.mute, d: '2 4', w: 1 }) + T(cx - 316, cy - 6, '3/9 line', { c: C.mute, s: 12 });
  g += plane(cx, cy, 0, C.lead, 'Lead', 18, -4);
  // wingman examples
  const at = (r, a) => [cx + r * s * Math.sin(a * D), cy + r * s * Math.cos(a * D)];
  const [wx, wy] = at(700, 45); g += plane(wx, wy, 0, C.wing, '#2 FW', 16, 4);
  const [mx, my] = at(625, 12); g += plane(mx, my, 0, C.wing, '#2 FM', 16, 4);
  // legend
  const lx = 690, ly = 110;
  g += R(lx - 14, ly - 24, 336, 402, { f: C.card, c: C.grid });
  g += T(lx, ly, 'Reading the picture', { w: 600 });
  const key = (y, col, op, txt, txt2) => `<rect x="${lx}" y="${y - 12}" width="22" height="14" fill="${col}" fill-opacity="${op}" stroke="${C.mute}"/>` + T(lx + 32, y, txt) + (txt2 ? T(lx + 32, y + 16, txt2, { c: C.mute, s: 12 }) : '');
  g += key(ly + 30, C.fw, 0.95, 'Fighting wing position', '30 to 60 deg off Lead’s tail, 500 to 1,000 ft');
  g += T(lx + 32, ly + 62, 'SMM 12.29 para 69; EFIG p.391', { c: C.mute, s: 11 });
  g += key(ly + 96, C.fm, 0.8, 'Fluid manoeuvring cone (my reading)', '60 deg wide in all (30 either side of the tail)');
  g += T(lx + 32, ly + 128, 'SMM 16.17 para 42; 500-1,000 ft, work toward', { c: C.mute, s: 11 });
  g += T(lx + 32, ly + 142, '500-750 ft (AFM7 p.17, AFM8 p.19)', { c: C.mute, s: 11 });
  g += `<line x1="${lx}" y1="${ly + 168}" x2="${lx + 22}" y2="${ly + 168}" stroke="${C.lead}" stroke-dasharray="6 5"/>` + T(lx + 32, ly + 172, 'Other reading: 60 deg either side');
  g += T(lx + 32, ly + 188, 'Question 1 for Patrick', { c: C.bubble, s: 12, w: 600 });
  g += `<line x1="${lx}" y1="${ly + 214}" x2="${lx + 22}" y2="${ly + 214}" stroke="${C.bubble}" stroke-width="2"/>` + T(lx + 32, ly + 218, '500 ft bubble, always');
  g += T(lx + 32, ly + 234, 'SMM 16.17 para 44c; Gen Book p.11', { c: C.mute, s: 11 });
  g += T(lx, ly + 268, 'Why I read the cone as 60 deg wide in all', { w: 600, s: 12 });
  g += T(lx, ly + 286, 'SMM 16.17 para 42 says the 30-60 swept position', { s: 12 });
  g += T(lx, ly + 302, 'would be outside the fluid parameters. A cone', { s: 12 });
  g += T(lx, ly + 318, '60 deg either side would contain it. A cone 30', { s: 12 });
  g += T(lx, ly + 334, 'either side leaves it just outside. (Inference.)', { s: 12 });
  g += T(lx, ly + 352, '#2 FW is drawn at 45 deg and 700 ft,', { c: C.mute, s: 11 }) + T(lx, ly + 366, '#2 FM at 12 deg and 625 ft.', { c: C.mute, s: 11 });
  writeFileSync(here + 'fig1-cones.svg', g + '</svg>');
}

// ---------------- Figure 2: turn circle, aspect, HCA, lead / pure / lag ----------------
{
  const W = 1300, H = 620;
  let g = head(W, H) + defs;
  g += T(24, 30, 'Staying on Lead’s turn circle, and the three pursuit curves (schematic, my own drawing)', { w: 600, s: 16 });
  g += T(24, 50, 'SMM 16.16 paras 39-40 and Figs 16.9, 16.10; SMM 12.30 paras 72-74 and Fig 12.24; EFIG p.391.', { c: C.mute });
  // left: same circle
  const ox = 260, oy = 300, r = 130;
  g += `<circle cx="${ox}" cy="${oy}" r="${r}" fill="none" stroke="${C.mute}" stroke-dasharray="5 4"/>`;
  g += T(ox, oy + 4, 'Lead’s', { a: 'middle', c: C.mute, s: 12 }) + T(ox, oy + 20, 'turn circle', { a: 'middle', c: C.mute, s: 12 });
  const ang = (a) => [ox + r * Math.sin(a * D), oy - r * Math.cos(a * D)]; // a = degrees clockwise from the top
  const [lx, ly] = ang(40), [wx, wy] = ang(-40);
  g += plane(lx, ly, 130, C.lead, '', 0, 0);
  g += plane(wx, wy, 50, C.wing, '', 0, 0);
  g += T(lx + 16, ly - 6, 'Lead', { c: C.lead, w: 600 }) + T(wx - 38, wy - 10, '#2', { c: C.wing, w: 600 });
  g += L(wx, wy, lx, ly, { c: C.ink, d: '3 3', w: 1.2 });
  g += T(24, 86, 'Same circle, same turn rate: the line of sight does not move.', { s: 13, w: 600 });
  g += T(24, 104, 'Aspect = X, heading crossing angle = 2 X, closure about 0 (SMM Fig 16.10).', { s: 12, c: C.mute });
  g += T(24, 480, 'Here the arc between them is 80 deg, so aspect 40 deg and HCA 80 deg.', { s: 12 });
  g += T(24, 498, 'This is what the wingman holds while Lead turns steadily.', { s: 12 });
  g += T(24, 524, 'A check a pilot would recognise: on a steady turn, HCA is about twice the aspect.', { s: 12, c: C.mute });
  // right: three pursuit curves from one wingman position
  const px = 1000, py = 440, tx = 820, ty = 300;
  g += T(580, 86, 'Three ways to point the nose, from the same spot (SMM 12.30 paras 72-74)', { w: 600, s: 13 });
  g += `<path d="M${tx} ${ty} q 40 -40 60 -120" fill="none" stroke="${C.lead}" stroke-dasharray="4 4" stroke-width="1.5" marker-end="url(#ar)"/>`;
  g += plane(tx, ty, 0, C.lead, '', 0, 0) + T(tx + 18, ty + 4, 'Lead (turning right)', { c: C.lead, w: 600 });
  g += plane(px, py, 0, C.wing, '#2', 18, 6);
  const arrow = (x, y, col) => L(px, py - 18, x, y, { c: col, arrow: true, w: 2 });
  g += arrow(tx + 40, ty - 100, C.wing) + T(tx + 30, ty - 114, 'LEAD pursuit: nose in front of Lead (inside its circle)', { c: C.wing, w: 600, s: 12, a: 'middle' });
  g += arrow(tx + 4, ty + 8, '#7a8a3a') + T(tx - 20, ty + 32, 'PURE: nose on Lead', { c: '#7a8a3a', w: 600, s: 12, a: 'end' });
  g += arrow(tx - 30, ty + 120, '#5b4a9b') + T(tx - 40, ty + 146, 'LAG pursuit: nose behind Lead (outside its circle)', { c: '#5b4a9b', w: 600, s: 12, a: 'end' });
  g += T(580, 540, 'Lead: most closure, aspect up (use when too far back).   Pure: closure, line of sight zero.', { s: 12 });
  g += T(580, 558, 'Lag: less closure, aspect down (use when too close). Lead pursuit flies inside Lead’s circle, lag outside it (EFIG p.391).', { s: 12 });
  g += T(580, 576, 'In the sim these are readouts: the controller steers to the slot and the screen names what the nose is doing.', { s: 12, c: C.mute });
  g += T(580, 594, '“Go where Lead was, do what Lead did” (EFIG p.391) is the rule it flies by.', { s: 12, c: C.mute });
  writeFileSync(here + 'fig2-pursuit.svg', g + '</svg>');
}

// ---------------- Figure 3: the design in boxes ----------------
{
  const W = 1180, H = 760;
  let g = head(W, H) + defs;
  g += T(24, 30, 'How it flies: both aircraft on one flight model, Lead on a script, the wingman on a pursuit controller', { w: 600, s: 16 });
  g += T(24, 50, 'Recommendation (c). Names in bold are existing code to reuse (src/core); the rest is new.', { c: C.mute });
  const box = (x, y, w, h, title, lines, col = C.card, stroke = C.ink) => R(x, y, w, h, { f: col, c: stroke }) + T(x + 10, y + 20, title, { w: 600, s: 13 }) + lines.map((l, i) => T(x + 10, y + 40 + i * 16, l, { s: 12, c: C.ink })).join('');
  // Lead column
  g += T(40, 90, 'LEAD', { w: 700, c: C.lead, s: 14 });
  g += box(40, 100, 330, 100, 'Lead button', ['Level turn, reversal, climb/descend, wingover,', 'barrel roll, loop, power change, terminate', 'one press = one script, planned at the press']);
  g += box(40, 230, 330, 110, 'Lead script (open loop)', ['bank target, G target, power for each manoeuvre', 'level hold: dampedClimbG (core)', 'dry-run on a copy draws the planned path (as today)']);
  g += box(40, 370, 330, 130, 'Smoothing, the same chain for both', ['roll: easeRoll, 90 deg/s, 360 deg/s^2 (TS-37)', 'G: the same easeRoll, onset limit (estimate 4 G/s)', 'power: first-order lag (estimate 1.5 s)', 'G never above the shaker line (physical)']);
  g += box(40, 530, 330, 110, 'Point mass: stepPointMass (core)', ['thrust minus drag from the T-6A fit (core)', 'speed bleeds in turns, 3-D, loops and wingovers', 'one model for Lead and wingman']);
  g += L(205, 200, 205, 230, { arrow: true }) + L(205, 340, 205, 370, { arrow: true }) + L(205, 500, 205, 530, { arrow: true });
  // wingman column
  g += T(450, 90, 'WINGMAN (live, each step)', { w: 700, c: C.wing, s: 14 });
  g += box(450, 100, 380, 100, '1  Slot: where I want to be', ['range, sweep, side, stack from the settings', 'collapses toward Lead’s six as Lead banks harder', 'moves smoothly (estimate 2 s), side changes cross behind']);
  g += box(450, 230, 380, 110, '2  Pursuit: how I get there', ['velocity wanted = slot velocity + catch-up to the slot', 'plus Lead’s own turn rate (“do what Lead did”)', 'lift vector placed on it: G and bank from the aim']);
  g += box(450, 370, 380, 130, '3  Pilot layer', ['reaction lag (estimate 0.3 s) on G, bank, power', 'G ceiling 5 (SMM 16.17 para 44a) as an aim, flagged', 'FM: power copied from Lead. FW: wingman trims power', 'bubble guard: a smooth push back, never a switch']);
  g += L(640, 200, 640, 230, { arrow: true }) + L(640, 340, 640, 370, { arrow: true });
  g += L(370, 585, 450, 585, { c: C.mute, w: 1 });
  g += L(640, 500, 640, 560, { arrow: true }) + T(650, 530, 'same smoothing chain', { s: 12, c: C.mute });
  g += box(450, 560, 380, 80, 'Smoothing + point mass (same code as Lead)', ['wingman G and bank leave the controller already', 'limited, so it cannot jerk the way the Fight Sim does']);
  g += L(370, 285, 450, 150, { c: C.lead, arrow: true, d: '4 3' }) + T(372, 215, 'Lead state', { s: 12, c: C.lead });
  // Judge
  g += T(900, 90, 'JUDGE (reads, never steers)', { w: 700, c: C.ok, s: 14 });
  g += box(900, 100, 250, 250, 'Formation card', ['in cone / stretched / tight', 'range, angle off tail, side', 'aspect, HCA, closure', 'pursuit now: lead, pure, lag', 'bubble, 5 G, aspect+HCA flags', 'terminate suggested (a flag)', 'wingman and Lead KIAS, G, bank']);
  g += L(830, 300, 900, 250, { arrow: true });
  g += box(900, 380, 250, 120, 'Failure and stale data', ['no position: card shows dashes', 'stall: G falls to the shaker line', 'NaN: hold last good, say so']);
  g += T(40, 700, 'Not new: stepPointMass, t6aExcessFn, easeRoll, dampedClimbG, shakerG, iasToTasKt. Asked of the core owner (nothing touched here): export the', { s: 12, c: C.mute });
  g += T(40, 718, 'stabilised-up helper (upFrom in point-mass.js), and a shared excess-power-at-throttle function (energy-sim.js excessFnFor).', { s: 12, c: C.mute });
  writeFileSync(here + 'fig3-design.svg', g + '</svg>');
}

// ---------------- Figure 4: the lean screen ----------------
{
  const W = 1280, H = 800;
  let g = head(W, H) + defs;
  g += T(24, 28, 'Lean screen: fighting wing and fluid manoeuvring (mock-up, my own drawing; not built)', { w: 600, s: 16 });
  // frame
  g += R(24, 44, 1232, 724, { f: '#fff', c: C.ink, w: 1.5 });
  // top bar
  g += R(24, 44, 1232, 44, { f: C.card, c: C.grid, r: 0 });
  g += T(40, 72, '▶ Play   ↺ Reset   0.25x 1x 4x   2D | 3D   Layers ▾', { s: 13 });
  g += T(1240, 72, 'V2.7 (version label shown on screen)', { a: 'end', c: C.mute, s: 12 });
  // left panel
  g += R(24, 88, 250, 680, { f: '#fff', c: C.grid, r: 0 });
  g += T(40, 114, 'Formation', { w: 600 });
  g += R(40, 124, 106, 32, { f: '#dcebf8', c: C.lead }) + T(93, 145, 'Fighting wing', { s: 12, w: 600, a: 'middle' });
  g += R(152, 124, 106, 32, { f: '#fff', c: C.mute }) + T(205, 145, 'Fluid manoeuvring', { s: 11, a: 'middle' });
  g += T(40, 186, 'Lead flies', { w: 600 });
  const btn = (x, y, w, txt, hot) => R(x, y, w, 30, { f: hot ? '#dcebf8' : '#fff', c: hot ? C.lead : C.mute }) + T(x + w / 2, y + 20, txt, { a: 'middle', s: 12 });
  g += btn(40, 196, 104, 'Level turn L'); g += btn(154, 196, 104, 'Level turn R');
  g += T(40, 246, 'Turn: Gentle 30  |  60/2  |  Steep 70/3', { s: 12, c: C.mute });
  g += btn(40, 256, 104, 'Reversal'); g += btn(154, 256, 104, 'Terminate');
  g += btn(40, 296, 104, 'Climb'); g += btn(154, 296, 104, 'Descend');
  g += btn(40, 336, 104, 'Wingover'); g += btn(154, 336, 104, 'Barrel roll');
  g += btn(40, 376, 104, 'Loop'); g += btn(154, 376, 104, 'Power +/-');
  g += T(40, 428, 'Next: Level turn L at 60/2', { s: 12, c: C.mute });
  g += T(40, 470, 'Wingman #2', { w: 600 });
  g += T(40, 492, 'Side: Right | Left', { s: 12 });
  g += T(40, 514, 'Range 650 ft', { s: 12 }) + R(140, 507, 118, 6, { f: C.grid, c: C.grid, r: 3 }) + R(176, 503, 12, 14, { f: C.wing, c: C.wing, r: 3 });
  g += T(40, 536, 'Sweep 45°', { s: 12 }) + R(140, 529, 118, 6, { f: C.grid, c: C.grid, r: 3 }) + R(196, 525, 12, 14, { f: C.wing, c: C.wing, r: 3 });
  g += T(40, 556, 'Wingman: Smooth | Normal | Sharp', { s: 12 });
  g += T(40, 590, 'More ▾  (closed)', { s: 12, c: C.mute });
  g += T(40, 608, 'power, overlays, stack,', { s: 11, c: C.mute }) + T(40, 622, 'G ceiling, reaction time', { s: 11, c: C.mute });
  g += T(40, 700, '220 KIAS · 8,000 ft · still air · roll 90°/s', { s: 12, c: C.mute });
  g += T(40, 718, 'Fighting wing: wingman has power.', { s: 11, c: C.mute }) + T(40, 732, 'Fluid: same power as Lead, 60° cone.', { s: 11, c: C.mute });
  // centre map
  g += R(274, 88, 700, 680, { f: '#fbfcfd', c: C.grid, r: 0 });
  for (let i = 0; i < 8; i++) g += L(274 + i * 100, 88, 274 + i * 100, 768, { c: '#eef0f3', w: 1 });
  for (let i = 0; i < 8; i++) g += L(274, 88 + i * 100, 974, 88 + i * 100, { c: '#eef0f3', w: 1 });
  const cx = 600, cy = 330;
  g += wedge(cx, cy, 90, 180, 30, 60, C.fw, { op: 0.8, c: C.wing });
  g += `<circle cx="${cx}" cy="${cy}" r="90" fill="none" stroke="${C.bubble}" stroke-dasharray="4 3"/>`;
  g += `<path d="M${cx} ${cy} q -30 140 -30 260 M${cx + 50} ${cy} q 20 150 -10 260" fill="none" stroke="${C.mute}" stroke-width="1.2" stroke-dasharray="3 3"/>`;
  g += plane(cx, cy, 0, C.lead, 'Lead', 16, -2);
  g += plane(cx + 120, cy + 125, 0, C.wing, '#2', 16, 4);
  g += T(cx + 135, cy + 142, 'IN CONE', { c: C.ok, w: 600, s: 12 });
  g += T(290, 108, 'Top view follows Lead. Tracks stay drawn. Cone overlay (layer, on).', { s: 12, c: C.mute });
  g += T(290, 752, 'Layers: ground tracks, cone, pursuit marks, Lead’s planned path, turn circles. Camera follows.', { s: 12, c: C.mute });
  // right: formation card
  g += R(974, 88, 282, 680, { f: '#fff', c: C.grid, r: 0 });
  g += T(990, 114, 'Formation card', { w: 600 });
  g += R(990, 126, 250, 128, { f: C.card, c: C.grid });
  g += T(1002, 148, '#2 fighting wing, right', { w: 600, s: 12 });
  g += T(1002, 168, 'IN CONE', { c: C.ok, w: 700, s: 16 });
  g += T(1002, 188, 'Range 720 ft    (500 to 1,000)', { s: 12 });
  g += T(1002, 206, 'Off tail 47° right  (30 to 60)', { s: 12 });
  g += T(1002, 224, 'Aspect 47°   HCA 3°   closure +2 kt', { s: 12 });
  g += T(1002, 242, 'Pursuit now: pure   ·   height +20 ft', { s: 12, c: C.mute });
  g += R(990, 266, 250, 92, { f: C.card, c: C.grid });
  g += T(1002, 288, 'Flying now', { w: 600, s: 12 });
  g += T(1002, 308, 'Lead   220 KIAS   bank 0°   1.0 G', { s: 12 });
  g += T(1002, 326, '#2     222 KIAS   bank 2°   1.0 G', { s: 12 });
  g += T(1002, 346, 'Fighting wing, 60/2 level turn: Lead first', { s: 11, c: C.mute });
  g += R(990, 372, 250, 118, { f: '#fff7f2', c: C.wing });
  g += T(1002, 394, 'Flags (words, never walls)', { w: 600, s: 12 });
  g += T(1002, 414, 'Inside the 500 ft bubble: none', { s: 12 });
  g += T(1002, 432, '#2 above 5 G: none', { s: 12 });
  g += T(1002, 450, 'Aspect and HCA both over 90°: none', { s: 12 });
  g += T(1002, 468, 'Lead above 4 G: none', { s: 12 });
  g += T(990, 520, 'Two taps for the rest', { s: 12, c: C.mute });
  g += T(990, 538, 'More ▾  graph of range and aspect over time,', { s: 11, c: C.mute }) + T(990, 552, 'in-cone % of last run, pursuit marks', { s: 11, c: C.mute });
  writeFileSync(here + 'fig4-screen.svg', g + '</svg>');
}
console.log('figures written');
