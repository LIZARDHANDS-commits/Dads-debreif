// The Formation flight-data plot page (Formation plan Step 12.1c; Patrick's yes, 12 Oct 2026): plots the smoothness
// gauge's traces (tools/formation-gauge.mjs, tmp/gauge/) against time, one chart per quantity with every aircraft on it,
// so a kink shows as a kink and two runs can be compared by eye. Development only: the dev server serves it at
// /tools/flight-plot/; the built site never includes it. uPlot is the app's own (Turn Fight's energy graph).

const CHARTS = [
  { key: 'g', title: 'G', unit: 'G' },
  { key: 'gRate', title: 'G rate (how fast the G changes)', unit: 'G/s' },
  { key: 'roll', title: 'Roll rate', unit: '°/s' },
  { key: 'bank', title: 'Bank (wings)', unit: '°' },
  { key: 'drawnDps', title: "Drawn aircraft's turn rate (3D view, per step)", unit: '°/s' },
  { key: 'climbDeg', title: 'Flight path angle', unit: '°' },
  { key: 'kias', title: 'Airspeed', unit: 'KIAS' },
  { key: 'rangeFt', title: 'Range to the aircraft he flies off', unit: 'ft' },
  // The close wingman's own (B1, B2; only in the close-formation scenarios): how far off his place on each of Patrick's
  // axes (plane + above Lead's wing plane, line + ahead of the spinner-to-wingtip line, along + out), and his torque.
  { key: 'planeFt', title: 'Close wingman: off the plane (+ above)', unit: 'ft' },
  { key: 'lineFt', title: 'Close wingman: off the line (+ ahead)', unit: 'ft' },
  { key: 'alongFt', title: 'Close wingman: along the line (+ out)', unit: 'ft' },
  { key: 'torquePct', title: 'Torque', unit: '%' },
  // Fighting wing (B5, spec 7e; only in the gauge's b5- scenarios): #2's picture of Lead and, flown live, the technique's
  // own quantities. Several series of one aircraft on one chart (keys), reference lines (lines), and the job and aim as step
  // lines (steps: their names turned into levels, listed in the title).
  { keys: [['slantFt', 'slant range'], ['predFt', "guard's predicted pass"], ['passFt', "filter's predicted pass, his aim's turn"]], title: 'Fighting wing: slant range and the predicted pass', unit: 'ft', lines: [500, 600, 700] },
  { keys: [['omNomDps', "his aim's turn"], ['omPickDps', "the filter's turn"]], title: "Fighting wing: the separation filter's turn against his aim's (+ left)", unit: '°/s', lines: [0] },
  { keys: [['closureFtps', 'closure (+ closing)']], title: 'Fighting wing: closure', unit: 'ft/s', lines: [0] },
  { keys: [['cWantFtps', 'wanted'], ['cActualFtps', 'actual']], title: 'Fighting wing: wanted against actual closure (the aim loop; along his place in straight flight)', unit: 'ft/s', lines: [0] },
  { keys: [['losDps', 'line of sight rate']], title: 'Fighting wing: line of sight rate', unit: '°/s' },
  { keys: [['aspectDeg', 'aspect (0 at Lead\'s tail)'], ['hcaDeg', 'HCA']], title: 'Fighting wing: aspect and heading crossing angle', unit: '°', lines: [90] },
  { keys: [['sFt', 'arc behind Lead, s'], ['dFt', 'offset inside his circle, d']], title: "Fighting wing: (s, d) in Lead's turn-centre frame (Fable F10)", unit: 'ft', lines: [0, 650] },
  { steps: 'pitchOwner', title: 'Fighting wing: who has pitch (0 stack, 1 quick fix, 2 low inside, 3 high yo-yo, 4 yo-yo down, 5 nose behind in and down, 6 pass clear)', unit: 'level' },
  { steps: 'fwBrakes', title: 'Fighting wing: idle and the boards (0 neither, 1 IDLE, 2 BOARDS, 3 IDLE + BOARDS)', unit: 'level' },
  { keys: [['offFt', 'offset d (+ inside: lead)']], title: "Fighting wing: the aim's offset from Lead's circle", unit: 'ft', lines: [-120, 0, 120] },
  { keys: [['heightFt', 'height'], ['heightTargetFt', 'target']], title: 'Fighting wing: height against Lead', unit: 'ft', lines: [-200, 0, 200] },
  { keys: [['fwTorquePct', 'torque']], title: 'Fighting wing: torque', unit: '%' },
  { steps: 'job', title: 'Fighting wing: job (0 swept, 1 S-turns, 2 turn, 3 turn low inside at MAX, 4 guard reversal, 5 guard miss, 6 separation filter)', unit: 'level' },
  { steps: 'aim', title: 'Fighting wing: aim (-3 nose behind Lead, -2 where Lead was or lag first, -1 lag, 0 pure, 1 lead, 2 swept, 3 S-turns)', unit: 'level' },
];
const JOB_LEVEL = (job, low) => (job == null ? null : job === 'guard-filter' ? 6 : job.startsWith('guard-miss') ? 5 : job.startsWith('guard-reverse') ? 4 : job.startsWith('turn') ? (low ? 3 : 2) : job === 'sTurn' ? 1 : 0);
const AIM_LEVEL = { behind: -3, wasLead: -2, lagFirst: -2, lag: -1, pure: 0, lead: 1, swept: 2, sTurn: 3 };
const OWNER_LEVEL = { stack: 0, quickFix: 1, lowInside: 2, highYoYo: 3, yoyoDown: 4, inDown: 5, passClear: 6 };
const BRAKES_LEVEL = { IDLE: 1, BOARDS: 2, 'IDLE + BOARDS': 3 };
const COLOURS = ['#4fc3f7', '#ffb74d', '#81c784', '#e57373'];

const runSelect = document.getElementById('run');
const fileInput = document.getElementById('file');
const chartsEl = document.getElementById('charts');
const note = document.getElementById('note');

const uPlot = (await import('uplot')).default;
let plots = [];

/** Dashed vertical lines at each press, drawn on every chart; and horizontal reference lines (lines: values). */
function pressMarks(presses, lines = []) {
  return {
    hooks: {
      draw: [(u) => {
        const { ctx } = u;
        ctx.save();
        ctx.setLineDash([2, 6]);
        ctx.strokeStyle = '#c8a24a';
        for (const v of lines) {
          const y = u.valToPos(v, 'y', true);
          if (!Number.isFinite(y) || y < u.bbox.top || y > u.bbox.top + u.bbox.height) continue;
          ctx.beginPath();
          ctx.moveTo(u.bbox.left, y);
          ctx.lineTo(u.bbox.left + u.bbox.width, y);
          ctx.stroke();
        }
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#8b98a5';
        ctx.fillStyle = '#8b98a5';
        ctx.font = `${11 * devicePixelRatio}px system-ui`;
        for (const p of presses) {
          const x = u.valToPos(p.t, 'x', true);
          ctx.beginPath();
          ctx.moveTo(x, u.bbox.top);
          ctx.lineTo(x, u.bbox.top + u.bbox.height);
          ctx.stroke();
          ctx.fillText(p.label, x + 4, u.bbox.top + 12 * devicePixelRatio);
        }
        ctx.restore();
      }],
    },
  };
}

function show(trace) {
  for (const p of plots) p.destroy();
  plots = [];
  chartsEl.textContent = '';
  const names = Object.keys(trace.aircraft);
  if (!names.length) {
    note.textContent = 'This trace has no aircraft data.';
    return;
  }
  // Every aircraft shares the step times; take the first one's.
  const t = trace.aircraft[names[0]].t;
  const width = Math.max(320, chartsEl.clientWidth - 16);
  for (const c of CHARTS) {
    let data;
    let series;
    if (c.keys || c.steps) {
      // one aircraft's series (the first that has them: #2 in the 2-ship)
      const first = c.keys ? c.keys[0][0] : c.steps;
      const who = names.find((n) => trace.aircraft[n][first]?.some((v) => v !== null));
      if (!who) continue;
      const a = trace.aircraft[who];
      if (c.steps) {
        const vals = c.steps === 'job' ? a.job.map((j, i) => JOB_LEVEL(j, a.fwLow?.[i]))
          : c.steps === 'pitchOwner' ? a.pitchOwner.map((x) => (x == null ? null : OWNER_LEVEL[x] ?? null))
          : c.steps === 'fwBrakes' ? a.fwBrakes.map((x, i) => (a.pitchOwner?.[i] == null ? null : BRAKES_LEVEL[x] ?? 0))
            : a.aim.map((x) => (x == null ? null : AIM_LEVEL[x] ?? null));
        data = [t, vals];
        series = [{ label: 's' }, { label: `${who} ${c.steps}`, stroke: COLOURS[0], width: 1.5, paths: uPlot.paths.stepped({ align: 1 }) }];
      } else {
        data = [t, ...c.keys.map(([k]) => a[k] ?? t.map(() => null))];
        series = [{ label: 's' }, ...c.keys.map(([, label], i) => ({ label: `${who} ${label}`, stroke: COLOURS[i % COLOURS.length], width: 1.5, spanGaps: false }))];
      }
    } else {
      if (!names.some((n) => trace.aircraft[n][c.key])) continue; // a chart this scenario has no data for
      data = [t, ...names.map((n) => trace.aircraft[n][c.key] ?? t.map(() => null))];
      series = [{ label: 's' }, ...names.map((n, i) => ({ label: n, stroke: COLOURS[i % COLOURS.length], width: 1.5, spanGaps: false }))];
    }
    const box = document.createElement('section');
    box.className = 'chart';
    const h = document.createElement('h2');
    h.textContent = `${c.title} (${c.unit})`;
    box.append(h);
    chartsEl.append(box);
    plots.push(new uPlot({
      width,
      height: 180,
      series,
      axes: [{ stroke: '#8b98a5', grid: { stroke: '#2a3642' } }, { stroke: '#8b98a5', grid: { stroke: '#2a3642' } }],
      cursor: { sync: { key: 'flight' } },
      scales: { x: { time: false } },
      plugins: [pressMarks(trace.presses ?? [], c.lines ?? [])],
    }, data, box));
  }
  note.textContent = `${trace.name}: ${(trace.presses ?? []).map((p) => `${p.label} at ${p.t.toFixed(1)} s`).join(' · ')}. Drag to zoom, double-click to zoom out.`;
}

async function loadRun(file) {
  const res = await fetch(`../../tmp/gauge/${file}`);
  if (!res.ok) throw new Error(`No trace ${file} (run the gauge first)`);
  show(await res.json());
}

try {
  const res = await fetch('../../tmp/gauge/index.json');
  if (!res.ok) throw new Error('no index');
  const index = await res.json();
  for (const r of index) runSelect.append(new Option(r.name, r.file));
  runSelect.addEventListener('change', () => loadRun(runSelect.value).catch((e) => { note.textContent = e.message; }));
  if (index.length) await loadRun(index[0].file);
} catch {
  note.textContent = 'No gauge traces found in tmp/gauge/. Run node tools/formation-gauge.mjs, then reload, or pick a trace file above.';
}

fileInput.addEventListener('change', async () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  try {
    show(JSON.parse(await f.text()));
  } catch (e) {
    note.textContent = `That file is not a gauge trace: ${e.message}`;
  }
});
