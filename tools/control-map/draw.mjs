// The control map's drawing (tools/control-map/README.md): writes docs/modules/turn-sim/control-model.md from
// model.template.md and the master list (signals.mjs), and the pictures in docs/modules/turn-sim/control-model/*.svg.
// No hand edits to the outputs: change signals.mjs or the template and run it again.
//   node tools/control-map/draw.mjs           write
//   node tools/control-map/draw.mjs --check   exit 1 if anything would change (the "no diff" check)
// Plain SVG, no library; fixed light colours on a white background so it reads the same in light and dark viewers.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import * as M from './signals.mjs';
import { allLeaves, ledgerEntry, sourceOf, valueAt } from './tables.mjs';

const CHECK = process.argv.includes('--check');
const MD_OUT = 'docs/modules/turn-sim/control-model.md';
const SVG_DIR = 'docs/modules/turn-sim/control-model';
const outputs = new Map();

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
function wrap(text, n) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > n && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}
const byId = new Map([...M.BLOCKS, ...M.PROPOSED].map((b) => [b.id, b]));
const nameOf = (id) => byId.get(id)?.name ?? id;
const KIND = {
  signal: { stroke: '#555', dash: '', width: 1.2, label: 'signal' },
  delay: { stroke: '#7b3fa0', dash: '', width: 2.6, label: 'delay (the 0.4 s or 0.3 s)' },
  ff: { stroke: '#1f6fb2', dash: '6 4', width: 1.6, label: 'physics feed-forward' },
  hidden: { stroke: '#c0392b', dash: '6 4', width: 1.8, label: 'hidden feedback (R3)' },
  cross: { stroke: '#d68910', dash: '', width: 1.8, label: 'switch or decision passed between controllers (R9)' },
  feedback: { stroke: '#2e7d32', dash: '', width: 1.8, label: 'his own motion, back round' },
};

// ---- level 1: layered blocks and edges ----
function level1(spec, proposed = false) {
  const W = 168;
  const H = 52;
  const gap = 34;
  const pitch = 122;
  const left = 70;
  const maxCols = Math.max(...spec.rows.map((r) => r.length));
  const width = Math.max(980, left * 2 + maxCols * (W + gap) + 60);
  const pos = new Map();
  spec.rows.forEach((row, r) => {
    const rowW = row.length * W + (row.length - 1) * gap;
    const x0 = (width - rowW) / 2;
    row.forEach((id, c) => pos.set(id, { x: x0 + c * (W + gap) + W / 2, y: 70 + r * pitch + H / 2, r }));
  });
  const height = 70 + spec.rows.length * pitch + 70;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Helvetica, Arial, sans-serif">`);
  out.push('<rect width="100%" height="100%" fill="#ffffff"/>');
  out.push('<defs>');
  for (const [k, v] of Object.entries(KIND)) out.push(`<marker id="a-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${v.stroke}"/></marker>`);
  out.push('</defs>');
  out.push(`<text x="20" y="30" font-size="17" font-weight="bold" fill="#222">${esc(spec.title)}</text>`);
  if (proposed) out.push(`<text x="20" y="50" font-size="12" fill="#c0392b">Proposed, not built: the T29t review's section 2.7 with Patrick's rulings of 14 Oct 2026 folded in.</text>`);
  else out.push(`<text x="20" y="50" font-size="12" fill="#555">${esc(M.META.codeAt)}. Drawn by tools/control-map/draw.mjs from signals.mjs.</text>`);
  let upL = 0;
  let upR = 0;
  const labels = [];
  for (const e of spec.edges) {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) continue;
    const k = KIND[e.kind] ?? KIND.signal;
    let d;
    let lx;
    let ly;
    if (b.r > a.r) {
      const x1 = a.x;
      const y1 = a.y + H / 2;
      const x2 = b.x;
      const y2 = b.y - H / 2;
      d = `M${x1},${y1} C${x1},${y1 + 45} ${x2},${y2 - 45} ${x2},${y2}`;
      const t = 0.38; // the label sits a little nearer the source, so labels into one block don't pile up
      const bz = (p0, p1, p2, p3) => (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3;
      lx = bz(x1, x1, x2, x2);
      ly = bz(y1, y1 + 45, y2 - 45, y2) + 3;
    } else if (b.r === a.r) {
      const s = Math.sign(b.x - a.x) || 1;
      const x1 = a.x + (s * W) / 2;
      const x2 = b.x - (s * W) / 2;
      d = `M${x1},${a.y - 8} C${x1 + s * 20},${a.y - 40} ${x2 - s * 20},${b.y - 40} ${x2},${b.y - 8}`;
      lx = (x1 + x2) / 2;
      ly = a.y - 32;
    } else if (e.kind === 'feedback') {
      const cx = 18 + 14 * upL++;
      const x1 = a.x - W / 2;
      const x2 = b.x - W / 2;
      d = `M${x1},${a.y} L${cx},${a.y} L${cx},${b.y} L${x2},${b.y}`;
      lx = cx + 4;
      ly = (a.y + b.y) / 2;
      labels.push({ x: lx, y: ly, text: e.label, color: k.stroke, anchor: 'start', rotate: true });
      out.push(`<path d="${d}" fill="none" stroke="${k.stroke}" stroke-width="${k.width}" ${k.dash ? `stroke-dasharray="${k.dash}"` : ''} marker-end="url(#a-${e.kind})"/>`);
      continue;
    } else {
      const cx = width - 18 - 14 * upR++;
      const x1 = a.x + W / 2;
      const x2 = b.x + W / 2;
      d = `M${x1},${a.y + 6} L${cx},${a.y + 6} L${cx},${b.y + 6} L${x2},${b.y + 6}`;
      lx = cx - 4;
      ly = (a.y + b.y) / 2;
      labels.push({ x: lx, y: ly, text: e.label, color: k.stroke, anchor: 'end', rotate: true });
      out.push(`<path d="${d}" fill="none" stroke="${k.stroke}" stroke-width="${k.width}" ${k.dash ? `stroke-dasharray="${k.dash}"` : ''} marker-end="url(#a-${e.kind})"/>`);
      continue;
    }
    out.push(`<path d="${d}" fill="none" stroke="${k.stroke}" stroke-width="${k.width}" ${k.dash ? `stroke-dasharray="${k.dash}"` : ''} marker-end="url(#a-${e.kind})"/>`);
    labels.push({ x: lx, y: ly, text: e.label, color: k.stroke, anchor: 'middle' });
  }
  for (const l of labels) {
    const t = esc(l.text);
    if (l.rotate) out.push(`<text x="${l.x}" y="${l.y}" font-size="9.5" fill="${l.color}" text-anchor="middle" transform="rotate(-90 ${l.x} ${l.y})" dy="${l.anchor === 'start' ? 10 : -3}">${t}</text>`);
    else out.push(`<text x="${l.x}" y="${l.y}" font-size="9.5" fill="${l.color}" text-anchor="middle" stroke="#ffffff" stroke-width="3" paint-order="stroke">${t}</text>`);
  }
  for (const [id, p] of pos) {
    const b = byId.get(id) ?? { name: id };
    const fill = (id === 'lead' || id === 'B01') ? '#eef3e8' : id.startsWith('ac.') || id === 'p.aircraft' || id === 'B15' ? '#f1ece4' : proposed ? '#fdf2f0' : '#eef2f7';
    out.push(`<rect x="${p.x - W / 2}" y="${p.y - H / 2}" width="${W}" height="${H}" rx="7" fill="${fill}" stroke="#44506a" stroke-width="1.2"/>`);
    const lines = wrap(b.name, 24);
    lines.slice(0, 2).forEach((ln, i) => out.push(`<text x="${p.x}" y="${p.y - (lines.length > 1 ? 6 : -4) + i * 14}" font-size="12.5" font-weight="bold" text-anchor="middle" fill="#1d2433">${esc(ln)}</text>`));
    if (b.code && lines.length < 2) out.push(`<text x="${p.x}" y="${p.y + 17}" font-size="9.5" text-anchor="middle" fill="#5a6378">${esc(b.code.split(/[;,(]/)[0].slice(0, 30))}</text>`);
  }
  let ly = height - 62;
  out.push(`<text x="20" y="${ly}" font-size="12" font-weight="bold" fill="#222">Lines</text>`);
  let lx = 70;
  for (const [k, v] of Object.entries(KIND)) {
    out.push(`<line x1="${lx}" y1="${ly - 4}" x2="${lx + 34}" y2="${ly - 4}" stroke="${v.stroke}" stroke-width="${v.width}" ${v.dash ? `stroke-dasharray="${v.dash}"` : ''}/>`);
    out.push(`<text x="${lx + 40}" y="${ly}" font-size="10.5" fill="#333">${esc(v.label)}</text>`);
    lx += 40 + v.label.length * 5.6 + 24;
    if (lx > width - 260) { lx = 70; ly += 20; }
  }
  out.push('</svg>');
  return out.join('\n');
}

// ---- level 2: one card per controller ----
const leaves = allLeaves();
function numbersOf(blockId) {
  return leaves.filter(([p]) => ledgerEntry(M.LEDGER, p)?.block === blockId).map(([p, v]) => `${p.replace(/^(FW|CLOSE)_(WING|SEE)\./, '')} ${JSON.stringify(v)}`);
}
function sensesOf(id) { return M.SIGNALS.filter((s) => s.readers.includes(id)).map((s) => s.name); }
function commandsOf(id) { return M.SIGNALS.filter((s) => s.writers.includes(id)).map((s) => s.name); }
function level2(title, cards, note) {
  const colW = 410;
  const cols = 3;
  const wrapN = 60;
  const laid = cards.map((c) => {
    const lines = [];
    lines.push({ t: c.title, b: true });
    if (c.code) lines.push({ t: c.code, s: true });
    for (const [k, v] of c.rows) if (v && v.length) wrap(`${k}: ${Array.isArray(v) ? v.join('; ') : v}`, wrapN).forEach((ln, i) => lines.push({ t: ln, k: i === 0 }));
    return { lines, h: 18 + lines.length * 13.5 };
  });
  const colH = Array(cols).fill(70);
  const place = laid.map((c) => {
    const k = colH.indexOf(Math.min(...colH));
    const at = { x: 16 + k * (colW + 14), y: colH[k] };
    colH[k] += c.h + 12;
    return at;
  });
  const width = 16 + cols * (colW + 14);
  const height = Math.max(...colH) + 20;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Helvetica, Arial, sans-serif">`, '<rect width="100%" height="100%" fill="#ffffff"/>'];
  out.push(`<text x="16" y="30" font-size="17" font-weight="bold" fill="#222">${esc(title)}</text>`);
  out.push(`<text x="16" y="50" font-size="12" fill="${note.startsWith('Proposed') ? '#c0392b' : '#555'}">${esc(note)}</text>`);
  laid.forEach((c, i) => {
    const p = place[i];
    out.push(`<rect x="${p.x}" y="${p.y}" width="${colW}" height="${c.h}" rx="6" fill="#f7f9fb" stroke="#9aa4b5"/>`);
    c.lines.forEach((ln, j) => out.push(`<text x="${p.x + 10}" y="${p.y + 17 + j * 13.5}" font-size="${ln.b ? 12.5 : 10.5}" ${ln.b ? 'font-weight="bold"' : ''} fill="${ln.s ? '#5a6378' : '#1d2433'}">${esc(ln.t)}</text>`));
  });
  out.push('</svg>');
  return out.join('\n');
}
const cardsFor = (tech) => M.BLOCKS.filter((b) => b.tech === tech || (b.tech === 'shared' && b.id !== 'lead')).map((b) => ({
  title: b.name, code: b.code, rows: [['Does', b.does], ['Senses', sensesOf(b.id)], ['Commands', commandsOf(b.id)], ['Numbers (from the code)', numbersOf(b.id)]],
}));

// ---- N² chart ----
function n2(ids, title) {
  const idx = new Map(ids.map((id, i) => [id, i]));
  const cells = new Map();
  const key = (a, b) => `${a}>${b}`;
  const get = (a, b) => cells.get(key(a, b)) ?? cells.set(key(a, b), { signals: [], history: [], cross: false }).get(key(a, b));
  for (const s of M.SIGNALS) for (const w of s.writers) for (const r of s.readers) if (idx.has(w) && idx.has(r) && w !== r) get(w, r).signals.push(s.name);
  for (const x of M.CROSSLINKS) if (idx.has(x.from) && idx.has(x.to)) { const c = get(x.from, x.to); c.cross = true; if (!c.signals.includes(x.signal)) c.signals.push(M.SIGNALS.find((s) => s.id === x.signal)?.name ?? x.signal); }
  for (const h of M.HISTORY) if (idx.has(h.from) && idx.has(h.to)) get(h.from, h.to).history.push(h);
  const S = 34;
  const L = 250;
  const width = L + ids.length * S + 40;
  const height = 90 + ids.length * S + 110;
  const heat = (n) => (n >= 4 ? '#d35400' : n === 3 ? '#e67e22' : n === 2 ? '#f5b041' : n === 1 ? '#fbe3c3' : null);
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Helvetica, Arial, sans-serif">`, '<rect width="100%" height="100%" fill="#ffffff"/>'];
  out.push(`<text x="16" y="30" font-size="17" font-weight="bold" fill="#222">${esc(title)}</text>`);
  out.push('<text x="16" y="50" font-size="12" fill="#555">Row passes to column. Number: signals passed. Colour: history-note items on the cell (the tuning heat map). Orange border: a switch or decision passed (R9).</text>');
  ids.forEach((id, i) => {
    const y = 80 + i * S;
    out.push(`<text x="${L - 8}" y="${y + S / 2 + 4}" font-size="11" text-anchor="end" fill="#1d2433">${i + 1}. ${esc(nameOf(id))}</text>`);
    ids.forEach((jd, j) => {
      const x = L + j * S;
      if (i === j) {
        out.push(`<rect x="${x}" y="${y}" width="${S}" height="${S}" fill="#44506a"/><text x="${x + S / 2}" y="${y + S / 2 + 4}" font-size="11" text-anchor="middle" fill="#fff">${i + 1}</text>`);
        const self = cells.get(key(id, jd));
        return void self;
      }
      const c = cells.get(key(id, jd));
      const fill = c ? heat(c.history.length) ?? (c.signals.length ? '#e3ebf5' : '#fff') : '#fff';
      out.push(`<rect x="${x}" y="${y}" width="${S}" height="${S}" fill="${fill}" stroke="${c?.cross ? '#d68910' : '#d6dbe3'}" stroke-width="${c?.cross ? 2.2 : 0.8}"/>`);
      if (c?.signals.length) out.push(`<text x="${x + S / 2}" y="${y + S / 2 + 4}" font-size="11" text-anchor="middle" fill="#1d2433">${c.signals.length}</text>`);
    });
  });
  const selfHist = M.HISTORY.filter((h) => h.from === h.to && idx.has(h.from));
  for (const h of selfHist) { const i = idx.get(h.from); out.push(`<circle cx="${L + i * S + S - 6}" cy="${80 + i * S + 6}" r="4" fill="#e67e22"/>`); }
  const ly = 90 + ids.length * S + 20;
  [['#e3ebf5', 'interface, no history'], ['#fbe3c3', '1 history item'], ['#f5b041', '2'], ['#e67e22', '3'], ['#d35400', '4 or more']].forEach(([c, t], k) => {
    out.push(`<rect x="${16 + k * 170}" y="${ly}" width="16" height="16" fill="${c}" stroke="#d6dbe3"/><text x="${38 + k * 170}" y="${ly + 12}" font-size="11" fill="#333">${esc(t)}</text>`);
  });
  out.push(`<text x="16" y="${ly + 40}" font-size="11" fill="#333">An orange dot on the diagonal: a history item inside one block (the filter's label-only hysteresis).</text>`);
  out.push('</svg>');
  return { svg: out.join('\n'), cells };
}

// ---- markdown pieces ----
const T = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');
const numbersMd = existsSync('docs/modules/turn-sim/numbers.md') ? readFileSync('docs/modules/turn-sim/numbers.md', 'utf8') : '';
const ripple = existsSync('tools/control-map/results/ripple.json') ? JSON.parse(readFileSync('tools/control-map/results/ripple.json', 'utf8')) : { rows: [] };
const loopTable = existsSync('tools/flight-design/results/fw-loop-table.md') ? readFileSync('tools/flight-design/results/fw-loop-table.md', 'utf8').trim() : '(run tools/flight-design/fw_loops.py)';

const fwIds = ['lead', ...M.DIAGRAMS.fw.rows.flat().filter((x) => x !== 'lead')];
const fwN2 = n2(fwIds, 'Fighting wing today: the N² chart');
const pieces = {
  META: `${M.META.codeAt}. ${M.META.written}. ${M.META.status}`,
  FINDINGS: M.FINDINGS.map((f) => `- **${f.id} (${f.status}).** ${f.text}`).join('\n'),
  DELAYS: T(['Delay kind', 'What it means', 'Signals'], Object.entries(M.DELAYS).map(([k, v]) => [k, v, M.SIGNALS.filter((s) => s.delay === k).map((s) => s.name).join(', ') || '-'])),
  SIGNALS: T(['Signal', 'Unit', 'Written by', 'Read by', 'Delay', 'Smoothing', 'Limits', 'Gauge column', 'Source'], M.SIGNALS.map((s) => [s.name + (s.ffKind ? ` (${s.ffKind === 'hidden' ? 'hidden feedback' : 'physics feed-forward'})` : ''), s.unit, s.writers.map(nameOf).join(', '), s.readers.map(nameOf).join(', ') || '(nothing)', s.delay, s.smoothing, s.limits, s.trace ? `\`${s.trace}\`${s.traceNote ? ` (${s.traceNote})` : ''}` : 'none yet (part 2)', s.source])),
  'OUTLINE:fw': M.DIAGRAMS.fw.rows.map((r, i) => `${i + 1}. ${r.map((id) => `**${nameOf(id)}**: ${byId.get(id)?.does ?? ''}`).join(' · ')}`).join('\n'),
  'OUTLINE:cf': M.DIAGRAMS.cf.rows.map((r, i) => `${i + 1}. ${r.map((id) => `**${nameOf(id)}**: ${byId.get(id)?.does ?? ''}`).join(' · ')}`).join('\n'),
  'OUTLINE:proposed': M.DIAGRAMS.proposed.rows.map((r, i) => `${i + 1}. ${r.map((id) => `**${nameOf(id)}**: ${byId.get(id)?.does ?? ''}`).join(' · ')}`).join('\n'),
  TARGET_MERMAID_L1: `\`\`\`mermaid\n${M.TARGET_MERMAID.level1}\n\`\`\``,
  TARGET_MERMAID_L2: `\`\`\`mermaid\n${M.TARGET_MERMAID.level2}\n\`\`\``,
  TARGET_BLOCKS: T(['ID', 'Block', 'Kind', 'File', 'Slice', 'Status', 'What it does'], M.TARGET_BLOCKS.map((b) => [b.id, b.name, b.kind, `\`${b.file}\``, b.slice, b.status, b.does])),
  TARGET_SIGNALS: T(['ID', 'Signal', 'Unit', 'Writer', 'Readers', 'Delay', 'Smoothing', 'Limits / notes', 'Slice', 'Status'], M.TARGET_SIGNALS.map((s) => [s.id, s.name, s.unit, s.writer, s.readers.join(', '), s.delay, s.smoothing, s.limits, s.slice, s.status])),
  N2CELLS: T(['From (row)', 'To (column)', 'What passes', 'History items on the cell'], [...fwN2.cells].filter(([, c]) => c.signals.length || c.history.length).map(([k, c]) => { const [a, b] = k.split('>'); return [nameOf(a), nameOf(b), `${c.cross ? '**switch or decision:** ' : ''}${c.signals.join(', ')}`, c.history.map((h) => `${h.item} (${h.status})`).join('; ') || '-']; })),
  RESOURCES: T(['Resource', 'Kind', 'Writers (how)', 'Readers', 'Rule', 'Rule in words', 'History items'], M.RESOURCES.map((r) => [r.name, `${r.kind}, ${r.tech === 'cf' ? 'close' : 'fighting wing'}`, r.writers.map(([b, how]) => `${nameOf(b)}${how ? `: ${how}` : ''}`).join('; '), (r.readers ?? []).map(nameOf).join(', ') || '-', r.rule.type, r.rule.detail, String(M.HISTORY.filter((h) => h.res === r.id).length)])),
  HISTORY: T(['Item', 'Commit', 'Cell (from → to)', 'Resource', 'Now'], M.HISTORY.map((h) => [h.item, h.commit, `${nameOf(h.from)} → ${nameOf(h.to)}`, M.RESOURCES.find((r) => r.id === h.res)?.name ?? h.res, h.status])),
  HISTORYHEAT: T(['Resource', 'History items'], M.RESOURCES.map((r) => [r.name, M.HISTORY.filter((h) => h.res === r.id).length]).filter(([, n]) => n).sort((a, b) => b[1] - a[1])),
  SWITCHES: T(['Switch', 'Block', 'Trigger', 'On', 'Off', 'Hold', 'Changes', 'Flies or label', 'Crossings, wobble, band ÷ wobble (cm run)', 'Note'], M.SWITCHES.map((s) => { const r = ripple.rows.find((x) => x.id === s.id); return [s.id, nameOf(s.block), s.trigger, s.on, s.off, s.hold, s.changes, s.flies, r ? `${r.crossings} crossings of ${r.line} (\`${r.col}\`); wobble ${r.wobbleMedian}; band ${r.band} = ${r.bandOverWobble ?? '-'} × wobble` : (s.ripple ? 'not traced' : 'part 2'), s.note]; })),
  LOOPTABLE: loopTable,
  LEDGER: T(['Number', 'Value (code)', 'Role', 'Block', 'Recommended structure', 'Source (numbers.md)'], leaves.map(([p, v]) => { const e = ledgerEntry(M.LEDGER, p); const src = sourceOf(numbersMd, p) ?? ''; return [`\`${p}\``, JSON.stringify(v), e?.role ?? '?', nameOf(e?.block), `${e?.rec ?? '?'}${e?.why ? `: ${e.why}` : ''}`, src.length > 160 ? `${src.slice(0, 157)}...` : src]; })),
  LEDGERCOUNTS: (() => {
    const tabs = ['CLOSE_SEE', 'CLOSE_WING', 'FW_SEE', 'FW_WING'];
    const roles = ['ruling', 'geometry', 'search', 'tuning', 'sweep', 'label', 'unused'];
    const rows = tabs.map((t) => { const ls = leaves.filter(([p]) => p.startsWith(`${t}.`)); return [t, ls.length, ...roles.map((r) => ls.filter(([p]) => ledgerEntry(M.LEDGER, p)?.role === r).length), ls.filter(([p]) => ledgerEntry(M.LEDGER, p)?.rec === 'removes').length, ls.filter(([p]) => ledgerEntry(M.LEDGER, p)?.rec === 'changes').length]; });
    return T(['Table', 'Leaf numbers', ...roles, 'Recommended removes', 'Changes'], rows);
  })(),
  ADDS: T(['Added by the recommended structure', 'Value', 'Role', 'Source'], M.ADDS.map((a) => [a.name, a.value, a.role, a.source])),
  QUESTIONS: M.QUESTIONS.length ? M.QUESTIONS.map((q, i) => `**Q${i + 1}. ${q.q}**\n${q.options.map((o) => `- ${o}`).join('\n')}\n- *Recommended:* ${q.rec}`).join('\n\n') : '*(All questions answered in TS-233, 14 Oct 2026.)*',
  ANSWERED: M.ANSWERED.map((a) => `- ${a}`).join('\n'),
  CTLCOLS: T(['Gauge column', 'Block', 'Unit', 'What it shows'], M.CONTROLLER_COLUMNS.map((c) => [`\`${c.col}\``, nameOf(c.block), c.unit, c.what])),
  RIGCHECK: existsSync('tools/flight-design/results/fw-rig-check.md') ? readFileSync('tools/flight-design/results/fw-rig-check.md', 'utf8').trim() : '(run tools/fw-rig.mjs, then tools/flight-design/fw_loops.py)',
  FAULTS: (() => {
    const fj = existsSync('tools/control-map/results/faults.json') ? JSON.parse(readFileSync('tools/control-map/results/faults.json', 'utf8')) : { rows: [] };
    return T(['Case', 'Press', 'G onset max (G/s)', 'Time over 1 G/s (s)', 'Aim jumps', 'Wrong-way roll (s)', 'Over Lead\'s G + 0.5 (s)', 'Torque swings', 'Below −150 ft (s), lowest', 'Speed lost against Lead (kt), for G·s over his', 'Filter acting, guard on (share)', 'Throttle owner changes'],
      fj.rows.map((r) => [r.case, r.press, r.onsetMaxGps, r.onsetFastSec, r.aimJumps ?? '-', r.wrongWaySec, r.overLeadSec, r.torqueSwings, `${r.lowSec} (${r.lowestFt})`, `${r.kiasLostVsLead} (${r.gExcessGs})`, `${r.filterShare}, ${r.guardShare}`, r.changes?.powerKind ?? 0]));
  })(),
  SVGS: '',
};

// ---- write ----
outputs.set(`${SVG_DIR}/fw-today-level1.svg`, level1(M.DIAGRAMS.fw));
outputs.set(`${SVG_DIR}/cf-level1.svg`, level1(M.DIAGRAMS.cf));
outputs.set(`${SVG_DIR}/fw-proposed-level1.svg`, level1(M.DIAGRAMS.proposed, true));
outputs.set(`${SVG_DIR}/fw-today-level2.svg`, level2('Fighting wing today: level 2, each controller', cardsFor('fw'), `${M.META.codeAt}. Numbers read from the code's tables.`));
outputs.set(`${SVG_DIR}/cf-level2.svg`, level2('Close formation: level 2, each controller', cardsFor('cf'), `${M.META.codeAt}. Numbers read from the code's tables.`));
outputs.set(`${SVG_DIR}/fw-proposed-level2.svg`, level2('Fighting wing, Spec 7e Draft 4 target structure: level 2', [
  ...M.PROPOSED.filter((b) => b.id !== 'lead' && b.id !== 'B01').map((b) => ({ title: `${b.name} (${b.slice})`, rows: [['Does', b.does]] })),
  { title: 'Numbers it adds (estimates unless ruled)', rows: [['Adds', M.ADDS.map((a) => `${a.name} ${a.value} (${a.role})`)]] },
  { title: 'Numbers it removes', rows: [['Removes', leaves.filter(([p]) => ledgerEntry(M.LEDGER, p)?.rec === 'removes').map(([p]) => p.replace(/^FW_(WING|SEE)\./, ''))]] },
], 'Proposed, not built: Spec 7e Draft 4 + Fable 3a/3b + Patrick\'s rulings of 14 Oct 2026.'));
outputs.set(`${SVG_DIR}/fw-today-n2.svg`, fwN2.svg);

let md = readFileSync('tools/control-map/model.template.md', 'utf8');
md = md.replace(/\{\{([A-Za-z0-9:_]+)\}\}/g, (m, k) => (k in pieces ? pieces[k] : m));
outputs.set(MD_OUT, md);

let changed = 0;
for (const [path, text] of outputs) {
  const before = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (before !== text) {
    changed++;
    if (CHECK) console.log(`would change: ${path}`);
    else { mkdirSync(path.replace(/\/[^/]+$/, ''), { recursive: true }); writeFileSync(path, text); }
  }
}
console.log(CHECK ? (changed ? `${changed} file(s) differ` : 'no diff: every drawn file matches the master list') : `wrote ${outputs.size} files (${changed} changed)`);
if (CHECK && changed) process.exit(1);
